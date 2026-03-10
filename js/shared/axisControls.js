(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const axisControls = Shared.axisControls = Shared.axisControls || {};

  const hostCache = new Map();
  let panelEl = null;
  let panelTitleEl = null;
  let tickFieldEl = null;
  let tickInput = null;
  let axisLengthFieldEl = null;
  let axisLengthInput = null;
  let axisLengthUnitSelect = null;
  let axisLengthPreserveToggleInput = null;
  let datasetSpacingFieldEl = null;
  let datasetSpacingLabelEl = null;
  let datasetSpacingInput = null;
  let minorTicksFieldEl = null;
  let minorTicksSwitch = null;
  let minorTicksToggleInput = null;
  let minorTicksSubdivInput = null;
  let minorTicksSubdivWrapper = null;
  let styleChipEl = null;
  let styleChipPreviewEl = null;
  let styleChipValueEl = null;
  let stylePickerCleanup = null;
  let styleDragState = null;
  let suppressStyleChipClick = false;
  let thicknessInput = null;
  let colorInput = null;
  let notationFieldEl = null;
  let notationComboWrapper = null;
  let notationDisplayInput = null;
  let notationMenuToggle = null;
  let notationMenuPopup = null;
  let notationMenuVisible = false;
  let notationActiveValue = 'decimal';
  let brokenAxisFieldEl = null;
  let brokenAxisCheckbox = null;
  let brokenAxisSegmentsContainer = null;
  let brokenAxisAddButton = null;
  let brokenAxisConfigButton = null;
  let brokenAxisDropdown = null;
  let brokenAxisConfigExpanded = false;
  let additionalTicksFieldEl = null;
  let additionalTicksButton = null;
  let additionalTicksDropdown = null;
  let additionalTicksContainer = null;
  let additionalTicksAddButton = null;
  let additionalTicksConfigExpanded = false;
  let activeConfig = null;
  let activeHost = null;
  let hasDocListener = false;
  let applyingFromUndo = false;
  let panelRefreshFrame = 0;
  const axisLengthUiByScope = new Map();

  function getUndoManager(){
    const manager = global.Shared?.undoManager;
    if(manager && typeof manager.recordStateChange === 'function'){
      return manager;
    }
    return null;
  }

  function configsMatch(a, b){
    if(!a || !b){ return false; }
    const axisA = a.axis || '';
    const axisB = b.axis || '';
    if(axisA !== axisB){ return false; }
    const scopeA = a.scopeId || '';
    const scopeB = b.scopeId || '';
    return scopeA === scopeB;
  }

  function sanitizeTickValue(value){
    if(value === null || value === undefined || value === ''){ return null; }
    const numeric = Number(value);
    if(!Number.isFinite(numeric) || numeric <= 0){ return null; }
    return numeric;
  }

  function sanitizeThicknessValue(value){
    if(value === null || value === undefined || value === ''){ return null; }
    const numeric = Number(value);
    if(!Number.isFinite(numeric) || numeric <= 0){ return null; }
    return numeric;
  }

  function sanitizeDatasetSpacingValue(value){
    if(value === null || value === undefined || value === ''){ return null; }
    const numeric = Number(value);
    if(!Number.isFinite(numeric) || numeric <= 0){ return null; }
    return numeric;
  }

  const PX_PER_INCH = 96;
  const MM_PER_INCH = 25.4;
  const PX_PER_MM = PX_PER_INCH / MM_PER_INCH;
  const AXIS_LENGTH_UNIT_PX = 'px';
  const AXIS_LENGTH_UNIT_MM = 'mm';
  const AXIS_LENGTH_UNITS = new Set([AXIS_LENGTH_UNIT_PX, AXIS_LENGTH_UNIT_MM]);

  function sanitizeAxisLengthValue(value){
    if(value === null || value === undefined || value === ''){ return null; }
    const numeric = Number(value);
    if(!Number.isFinite(numeric) || numeric <= 0){ return null; }
    return numeric;
  }

  function sanitizeAxisLengthUnit(value){
    const normalized = String(value || '').trim().toLowerCase();
    return AXIS_LENGTH_UNITS.has(normalized) ? normalized : AXIS_LENGTH_UNIT_PX;
  }

  function convertAxisLengthToPx(value, unit){
    const numeric = sanitizeAxisLengthValue(value);
    if(numeric == null){ return null; }
    const normalizedUnit = sanitizeAxisLengthUnit(unit);
    if(normalizedUnit === AXIS_LENGTH_UNIT_MM){
      return numeric * PX_PER_MM;
    }
    return numeric;
  }

  function convertAxisLengthFromPx(valuePx, unit){
    const numeric = sanitizeAxisLengthValue(valuePx);
    if(numeric == null){ return null; }
    const normalizedUnit = sanitizeAxisLengthUnit(unit);
    if(normalizedUnit === AXIS_LENGTH_UNIT_MM){
      return numeric / PX_PER_MM;
    }
    return numeric;
  }

  function formatAxisLengthDisplay(value, unit){
    const numeric = sanitizeAxisLengthValue(value);
    if(numeric == null){ return ''; }
    const normalizedUnit = sanitizeAxisLengthUnit(unit);
    const decimals = normalizedUnit === AXIS_LENGTH_UNIT_MM ? 2 : 0;
    const factor = Math.pow(10, decimals);
    const rounded = Math.round(numeric * factor) / factor;
    return String(rounded).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  }

  function sanitizeGraphSizeSnapshot(value){
    if(!value || typeof value !== 'object'){
      return null;
    }
    const width = sanitizeAxisLengthValue(value.width);
    const height = sanitizeAxisLengthValue(value.height);
    if(width == null || height == null){
      return null;
    }
    return { width, height };
  }

  function areGraphSizeSnapshotsEqual(a, b){
    const left = sanitizeGraphSizeSnapshot(a);
    const right = sanitizeGraphSizeSnapshot(b);
    if(!left || !right){
      return false;
    }
    return areNumbersClose(left.width, right.width, 1e-6)
      && areNumbersClose(left.height, right.height, 1e-6);
  }

  function getAxisLengthUiState(config){
    const scopeKey = (config && config.scopeId) ? String(config.scopeId) : '__global__';
    let state = axisLengthUiByScope.get(scopeKey);
    if(!state){
      state = {
        unit: AXIS_LENGTH_UNIT_PX,
        preserveProportions: false
      };
      axisLengthUiByScope.set(scopeKey, state);
    }
    state.unit = sanitizeAxisLengthUnit(state.unit);
    state.preserveProportions = state.preserveProportions === true;
    return state;
  }

  function readAxisLengthPx(config){
    if(!config || typeof config.getAxisLength !== 'function'){
      return null;
    }
    try{
      const value = config.getAxisLength(config.axis, { unit: AXIS_LENGTH_UNIT_PX, config });
      return sanitizeAxisLengthValue(value);
    }catch(err){
      logDebug('axis length read failed', {
        axis: config ? config.axis : null,
        scopeId: config ? config.scopeId : null,
        error: err && err.message
      });
      return null;
    }
  }

  function readAxisLengthBounds(config){
    if(!config || typeof config.getAxisLengthBounds !== 'function'){
      return null;
    }
    try{
      const raw = config.getAxisLengthBounds(config.axis, config);
      if(!raw || typeof raw !== 'object'){
        return null;
      }
      const min = sanitizeAxisLengthValue(raw.min);
      const max = sanitizeAxisLengthValue(raw.max);
      const step = sanitizeAxisLengthValue(raw.step);
      const result = {};
      if(min != null){ result.min = min; }
      if(max != null){ result.max = max; }
      if(step != null){ result.step = step; }
      return Object.keys(result).length ? result : null;
    }catch(err){
      logDebug('axis length bounds read failed', {
        axis: config ? config.axis : null,
        scopeId: config ? config.scopeId : null,
        error: err && err.message
      });
      return null;
    }
  }

  function readGraphSizeSnapshot(config){
    if(!config || typeof config.getGraphSize !== 'function'){
      return null;
    }
    try{
      const raw = config.getGraphSize(config.axis, config);
      return sanitizeGraphSizeSnapshot(raw);
    }catch(err){
      logDebug('graph size snapshot read failed', {
        axis: config ? config.axis : null,
        scopeId: config ? config.scopeId : null,
        error: err && err.message
      });
      return null;
    }
  }

  function resolveAxisBounds(config){
    if(!config || typeof config !== 'object'){
      return null;
    }
    let bounds = null;
    if(typeof config.getAxisBounds === 'function'){
      try{
        bounds = config.getAxisBounds(config.axis, config) || null;
      }catch(err){
        bounds = null;
      }
    }
    const minRaw = bounds && bounds.min !== undefined
      ? bounds.min
      : (bounds && bounds.axisMin !== undefined ? bounds.axisMin : config.axisMin);
    const maxRaw = bounds && bounds.max !== undefined
      ? bounds.max
      : (bounds && bounds.axisMax !== undefined ? bounds.axisMax : config.axisMax);
    const min = Number(minRaw);
    const max = Number(maxRaw);
    if(!Number.isFinite(min) || !Number.isFinite(max) || max <= min){
      return null;
    }
    return { min, max };
  }

  function areNumbersClose(a, b, tolerance){
    if(!Number.isFinite(a) || !Number.isFinite(b)){
      return false;
    }
    const delta = Math.abs(a - b);
    const base = Math.max(1, Math.abs(a), Math.abs(b));
    const epsilon = Number.isFinite(tolerance) && tolerance > 0
      ? tolerance
      : base * 1e-9;
    return delta <= epsilon;
  }

  function normalizeBrokenAxisSegmentsForBounds(rawSegments, bounds){
    if(!Array.isArray(rawSegments)){
      return [];
    }
    const segments = rawSegments.map(segment => {
      const safe = segment && typeof segment === 'object' ? segment : {};
      const start = Number(safe.start);
      const end = Number(safe.end);
      return {
        ...safe,
        start: Number.isFinite(start) ? start : null,
        end: Number.isFinite(end) ? end : null
      };
    });
    if(!bounds || !segments.length){
      return segments;
    }
    segments[0].start = bounds.min;
    segments[segments.length - 1].end = bounds.max;
    return segments;
  }

  function buildInitialBrokenAxisSegments(bounds){
    if(!bounds || !Number.isFinite(bounds.min) || !Number.isFinite(bounds.max) || bounds.max <= bounds.min){
      return null;
    }
    const span = bounds.max - bounds.min;
    if(!Number.isFinite(span) || span <= 0){
      return null;
    }
    // Keep a visible gap while leaving enough room for both edge segments.
    const minGap = Math.max(span * 0.08, span * 0.02);
    let firstEnd = bounds.min + span * 0.45;
    let secondStart = bounds.min + span * 0.55;
    if(secondStart - firstEnd < minGap){
      const mid = bounds.min + span * 0.5;
      firstEnd = mid - (minGap / 2);
      secondStart = mid + (minGap / 2);
    }
    firstEnd = Math.max(bounds.min + (span * 0.05), Math.min(firstEnd, bounds.max - (span * 0.1)));
    secondStart = Math.min(bounds.max - (span * 0.05), Math.max(secondStart, bounds.min + (span * 0.1)));
    if(!(firstEnd > bounds.min && secondStart < bounds.max && firstEnd < secondStart)){
      return null;
    }
    return [
      { start: bounds.min, end: firstEnd },
      { start: secondStart, end: bounds.max }
    ];
  }

  function normalizeEdgeBrokenSegment(segment, index, total, bounds){
    const safe = segment && typeof segment === 'object' ? segment : {};
    let start = Number(safe.start);
    let end = Number(safe.end);
    if(!bounds || !Number.isFinite(bounds.min) || !Number.isFinite(bounds.max) || bounds.max <= bounds.min){
      return {
        start: Number.isFinite(start) ? start : null,
        end: Number.isFinite(end) ? end : null
      };
    }
    const span = bounds.max - bounds.min;
    if(total <= 1){
      return { start: bounds.min, end: bounds.max };
    }
    const pad = Math.max(span * 0.02, span * 0.001);
    if(index === 0){
      start = bounds.min;
      if(!Number.isFinite(end) || end <= (start + pad) || end >= (bounds.max - pad)){
        end = bounds.min + span * 0.45;
      }
      end = Math.max(start + pad, Math.min(end, bounds.max - pad));
    }
    if(index === (total - 1)){
      end = bounds.max;
      if(!Number.isFinite(start) || start >= (end - pad) || start <= (bounds.min + pad)){
        start = bounds.min + span * 0.55;
      }
      start = Math.min(end - pad, Math.max(start, bounds.min + pad));
    }
    return {
      start: Number.isFinite(start) ? start : null,
      end: Number.isFinite(end) ? end : null
    };
  }

  const MIN_MINOR_SUBDIVISIONS = 1;
  const MAX_MINOR_SUBDIVISIONS = 9;
  const DEFAULT_MINOR_SUBDIVISIONS = (
    Shared && Shared.chartStyle && Number.isFinite(Shared.chartStyle.DEFAULT_MINOR_TICK_SUBDIVISIONS)
  )
    ? Shared.chartStyle.DEFAULT_MINOR_TICK_SUBDIVISIONS
    : 3;

  function sanitizeMinorSubdivisionValue(value){
    const numeric = Number(value);
    if(!Number.isFinite(numeric)){
      return DEFAULT_MINOR_SUBDIVISIONS;
    }
    const rounded = Math.round(numeric);
    return Math.max(MIN_MINOR_SUBDIVISIONS, Math.min(MAX_MINOR_SUBDIVISIONS, rounded));
  }

  function sanitizeColorState(value){
    if(typeof value !== 'string'){ return null; }
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  function normalizeColorForCompare(value){
    const sanitized = sanitizeColorState(value);
    return sanitized ? sanitized.toLowerCase() : '';
  }

  const axisExtras = Shared.axisExtras = Shared.axisExtras || {};
  if(typeof axisExtras.sanitizeEntry !== 'function'){
    const AXIS_EXTRA_LINE_PATTERNS = new Set(['solid', 'dashed', 'dotted']);
    const AXIS_EXTRA_DEFAULTS = Object.freeze({
      showTick: false,
      showLine: true,
      label: '',
      lineColor: null,
      lineWidth: 1,
      linePattern: 'dotted',
      lineTransparency: 0
    });

    function sanitizeAxisExtraLineColor(value){
      if(typeof value !== 'string'){
        return null;
      }
      const trimmed = value.trim();
      return trimmed ? trimmed : null;
    }

    function sanitizeAxisExtraLineWidth(value){
      const numeric = Number(value);
      if(!Number.isFinite(numeric) || numeric <= 0){
        return null;
      }
      return numeric;
    }

    function sanitizeAxisExtraLinePattern(value){
      if(typeof value !== 'string'){
        return AXIS_EXTRA_DEFAULTS.linePattern;
      }
      const normalized = value.trim().toLowerCase();
      return AXIS_EXTRA_LINE_PATTERNS.has(normalized) ? normalized : AXIS_EXTRA_DEFAULTS.linePattern;
    }

    function sanitizeAxisExtraLineTransparency(value){
      if(value === undefined || value === null || value === ''){
        return AXIS_EXTRA_DEFAULTS.lineTransparency;
      }
      const numeric = Number(value);
      if(!Number.isFinite(numeric)){
        return AXIS_EXTRA_DEFAULTS.lineTransparency;
      }
      if(numeric < 0){
        return 0;
      }
      if(numeric > 100){
        return 100;
      }
      return numeric;
    }

    function getAxisExtraDefaults(options){
      const defaults = options && options.defaults ? options.defaults : AXIS_EXTRA_DEFAULTS;
      return {
        showTick: defaults.showTick !== undefined ? !!defaults.showTick : AXIS_EXTRA_DEFAULTS.showTick,
        showLine: defaults.showLine !== undefined ? !!defaults.showLine : AXIS_EXTRA_DEFAULTS.showLine,
        label: defaults.label != null ? String(defaults.label) : AXIS_EXTRA_DEFAULTS.label,
        lineColor: sanitizeAxisExtraLineColor(defaults.lineColor ?? defaults.color),
        lineWidth: sanitizeAxisExtraLineWidth(defaults.lineWidth ?? defaults.thickness ?? defaults.strokeWidth),
        linePattern: sanitizeAxisExtraLinePattern(defaults.linePattern ?? defaults.pattern ?? defaults.lineStyle),
        lineTransparency: sanitizeAxisExtraLineTransparency(defaults.lineTransparency ?? defaults.transparency)
      };
    }

    function sanitizeAxisExtraEntry(entry, options){
      if(!entry || typeof entry !== 'object'){
        return null;
      }
      const defaults = getAxisExtraDefaults(options);
      const rawValue = entry.value ?? entry.at ?? entry.position ?? entry.y ?? entry.x;
      const value = Number(rawValue);
      if(!Number.isFinite(value)){
        return null;
      }
      const showTick = entry.showTick !== undefined ? !!entry.showTick : (entry.tick !== undefined ? !!entry.tick : defaults.showTick);
      const showLine = entry.showLine !== undefined ? !!entry.showLine : (entry.line !== undefined ? !!entry.line : defaults.showLine);
      let label = defaults.label;
      if(entry.label !== undefined && entry.label !== null){
        label = String(entry.label);
      }else if(entry.text !== undefined && entry.text !== null){
        label = String(entry.text);
      }
      const lineColor = sanitizeAxisExtraLineColor(entry.lineColor ?? entry.color ?? defaults.lineColor);
      const lineWidth = sanitizeAxisExtraLineWidth(entry.lineWidth ?? entry.thickness ?? entry.strokeWidth ?? defaults.lineWidth);
      const linePattern = sanitizeAxisExtraLinePattern(entry.linePattern ?? entry.pattern ?? entry.lineStyle ?? defaults.linePattern);
      const rawLineTransparency = entry.lineTransparency ?? entry.transparency;
      const rawAlpha = rawLineTransparency == null ? entry.alpha : null;
      const rawOpacity = rawLineTransparency == null && rawAlpha == null ? entry.opacity : null;
      let lineTransparency = rawLineTransparency;
      if(lineTransparency == null && rawAlpha != null){
        const alphaNumeric = Number(rawAlpha);
        lineTransparency = Number.isFinite(alphaNumeric) && alphaNumeric >= 0 && alphaNumeric <= 1
          ? alphaNumeric * 100
          : alphaNumeric;
      }
      if(lineTransparency == null && rawOpacity != null){
        const opacityNumeric = Number(rawOpacity);
        lineTransparency = Number.isFinite(opacityNumeric) && opacityNumeric >= 0 && opacityNumeric <= 1
          ? (1 - opacityNumeric) * 100
          : opacityNumeric;
      }
      lineTransparency = sanitizeAxisExtraLineTransparency(lineTransparency ?? defaults.lineTransparency);
      const source = typeof entry.source === 'string' && entry.source.trim()
        ? entry.source.trim()
        : null;
      return {
        value,
        showTick,
        showLine,
        label,
        lineColor,
        lineWidth,
        linePattern,
        lineTransparency,
        ...(source ? { source } : {})
      };
    }

    function sanitizeAxisExtraEntries(entries, options){
      if(!Array.isArray(entries)){
        return [];
      }
      return entries
        .map(entry => sanitizeAxisExtraEntry(entry, options))
        .filter(entry => !!entry);
    }

    function toScaleValue(rawValue, options){
      const numeric = Number(rawValue);
      if(!Number.isFinite(numeric)){
        return null;
      }
      const logScale = !!(options && options.logScale);
      if(logScale){
        if(numeric <= 0){
          return null;
        }
        return Math.log10(numeric);
      }
      return numeric;
    }

    function getAxisExtraLabel(entry){
      if(!entry || typeof entry !== 'object'){
        return '';
      }
      const raw = entry.label ?? entry.text;
      if(raw === undefined || raw === null){
        return '';
      }
      const text = String(raw).trim();
      return text;
    }

    function isAxisExtraNearMajor(value, majorTicks, tolerance){
      if(!Array.isArray(majorTicks) || !majorTicks.length){
        return false;
      }
      return majorTicks.some(tick => Number.isFinite(tick) && Math.abs(tick - value) <= tolerance);
    }

    function renderLinearAxisExtras(options){
      const entries = sanitizeAxisExtraEntries(options && options.entries, options);
      const axisMin = Number(options && options.axisMin);
      const axisMax = Number(options && options.axisMax);
      const toPixel = options && typeof options.toPixel === 'function' ? options.toPixel : null;
      const majorTicks = Array.isArray(options && options.majorTicks) ? options.majorTicks : [];
      const isValueVisible = options && typeof options.isValueVisible === 'function'
        ? options.isValueVisible
        : (() => true);
      const onSkip = options && typeof options.onSkip === 'function' ? options.onSkip : null;
      const onLine = options && typeof options.onLine === 'function' ? options.onLine : null;
      const onTick = options && typeof options.onTick === 'function' ? options.onTick : null;
      const onLabel = options && typeof options.onLabel === 'function' ? options.onLabel : null;
      const showGrid = !!(options && options.showGrid);
      const span = Math.abs((axisMax - axisMin) || 1);
      const tolerance = Number.isFinite(options && options.tolerance)
        ? Math.max(0, Number(options.tolerance))
        : Math.max(1e-9, span / 1000000);
      const stats = { rendered: 0, ticks: 0, lines: 0, labels: 0, skipped: 0 };

      if(!toPixel || !Number.isFinite(axisMin) || !Number.isFinite(axisMax)){
        return stats;
      }

      entries.forEach((entry, index) => {
        const scaleValue = toScaleValue(entry.value, { logScale: !!(options && options.logScale) });
        if(scaleValue == null){
          stats.skipped += 1;
          if(onSkip){ onSkip({ reason: 'invalid-value', index, entry, scaleValue }); }
          return;
        }
        if(scaleValue < axisMin || scaleValue > axisMax){
          stats.skipped += 1;
          if(onSkip){ onSkip({ reason: 'outside-range', index, entry, scaleValue }); }
          return;
        }
        if(!isValueVisible(scaleValue)){
          stats.skipped += 1;
          if(onSkip){ onSkip({ reason: 'axis-gap', index, entry, scaleValue }); }
          return;
        }
        const pixel = toPixel(scaleValue);
        if(!Number.isFinite(pixel)){
          stats.skipped += 1;
          if(onSkip){ onSkip({ reason: 'non-finite-pixel', index, entry, scaleValue, pixel }); }
          return;
        }
        const nearMajor = isAxisExtraNearMajor(scaleValue, majorTicks, tolerance);
        if(entry.showLine && !(showGrid && nearMajor) && onLine){
          onLine({ index, entry, scaleValue, pixel, nearMajor, tolerance });
          stats.lines += 1;
        }
        if(entry.showTick && !nearMajor && onTick){
          onTick({ index, entry, scaleValue, pixel, nearMajor, tolerance });
          stats.ticks += 1;
        }
        const label = getAxisExtraLabel(entry);
        if(label && onLabel){
          onLabel({ index, entry, scaleValue, pixel, label, nearMajor, tolerance });
          stats.labels += 1;
        }
        stats.rendered += 1;
      });
      return stats;
    }

    function getAxisExtraLineStyle(entry, options){
      const fallbackStroke = sanitizeAxisExtraLineColor(options && options.defaultStroke) || '#000000';
      const fallbackWidth = sanitizeAxisExtraLineWidth(options && options.defaultStrokeWidth) || 1;
      const fallbackPattern = sanitizeAxisExtraLinePattern(options && options.defaultPattern);
      const fallbackTransparency = sanitizeAxisExtraLineTransparency(options && options.defaultTransparency);
      const stroke = sanitizeAxisExtraLineColor(entry && entry.lineColor) || fallbackStroke;
      const strokeWidth = sanitizeAxisExtraLineWidth(entry && entry.lineWidth) || fallbackWidth;
      const linePattern = sanitizeAxisExtraLinePattern((entry && entry.linePattern) || fallbackPattern);
      const lineTransparency = sanitizeAxisExtraLineTransparency((entry && entry.lineTransparency) ?? fallbackTransparency);
      const opacity = Math.max(0, Math.min(1, 1 - (lineTransparency / 100)));
      let strokeDasharray = null;
      let strokeLinecap = 'butt';
      if(linePattern === 'dashed'){
        const dash = Math.max(3, Math.round(strokeWidth * 3));
        const gap = Math.max(2, Math.round(strokeWidth * 2));
        strokeDasharray = `${dash} ${gap}`;
      }else if(linePattern === 'dotted'){
        // Zero-length dashes with round caps render true circular dots.
        const gap = Math.max(2, Number((strokeWidth * 4).toFixed(2)));
        strokeDasharray = `0 ${gap}`;
        strokeLinecap = 'round';
      }
      return {
        stroke,
        strokeWidth,
        linePattern,
        lineTransparency,
        opacity,
        strokeDasharray,
        strokeLinecap
      };
    }

    function ensureAxisExtrasNode(settings, axis){
      if(!settings || typeof settings !== 'object' || !axis){
        return null;
      }
      if(!settings[axis] || typeof settings[axis] !== 'object'){
        settings[axis] = {};
      }
      if(!Array.isArray(settings[axis].additionalTicks)){
        settings[axis].additionalTicks = [];
      }
      return settings[axis];
    }

    function getAxisEntries(settings, axis, options){
      const node = ensureAxisExtrasNode(settings, axis);
      if(!node){
        return [];
      }
      const sanitized = sanitizeAxisExtraEntries(node.additionalTicks, options);
      node.additionalTicks = sanitized;
      return sanitized;
    }

    function setAxisEntries(settings, axis, entries, options){
      const node = ensureAxisExtrasNode(settings, axis);
      if(!node){
        return [];
      }
      node.additionalTicks = sanitizeAxisExtraEntries(entries, options);
      return node.additionalTicks;
    }

    function updateAxisEntry(settings, axis, index, entry, options){
      const node = ensureAxisExtrasNode(settings, axis);
      if(!node || !Number.isInteger(index) || index < 0){
        return null;
      }
      const next = sanitizeAxisExtraEntry(entry, options);
      if(!next){
        return null;
      }
      const entries = sanitizeAxisExtraEntries(node.additionalTicks, options);
      if(index >= entries.length){
        return null;
      }
      entries[index] = next;
      node.additionalTicks = entries;
      return next;
    }

    function addAxisEntry(settings, axis, options){
      const node = ensureAxisExtrasNode(settings, axis);
      if(!node){
        return null;
      }
      const entries = sanitizeAxisExtraEntries(node.additionalTicks, options);
      const defaults = getAxisExtraDefaults(options);
      const increment = Number.isFinite(options && options.increment) ? Number(options.increment) : 1;
      const last = entries.length ? entries[entries.length - 1] : null;
      const value = Number.isFinite(last?.value) ? Number(last.value) + increment : 0;
      const next = {
        value,
        showTick: defaults.showTick,
        showLine: defaults.showLine,
        label: defaults.label,
        lineColor: defaults.lineColor,
        lineWidth: defaults.lineWidth,
        linePattern: defaults.linePattern,
        lineTransparency: defaults.lineTransparency
      };
      entries.push(next);
      node.additionalTicks = entries;
      return next;
    }

    function removeAxisEntry(settings, axis, index, options){
      const node = ensureAxisExtrasNode(settings, axis);
      if(!node || !Number.isInteger(index) || index < 0){
        return null;
      }
      const entries = sanitizeAxisExtraEntries(node.additionalTicks, options);
      if(index >= entries.length){
        return null;
      }
      const removed = entries.splice(index, 1)[0] || null;
      node.additionalTicks = entries;
      return removed;
    }

    axisExtras.DEFAULTS = AXIS_EXTRA_DEFAULTS;
    axisExtras.sanitizeEntry = sanitizeAxisExtraEntry;
    axisExtras.sanitizeEntries = sanitizeAxisExtraEntries;
    axisExtras.sanitizeLineColor = sanitizeAxisExtraLineColor;
    axisExtras.sanitizeLineWidth = sanitizeAxisExtraLineWidth;
    axisExtras.sanitizeLinePattern = sanitizeAxisExtraLinePattern;
    axisExtras.sanitizeLineTransparency = sanitizeAxisExtraLineTransparency;
    axisExtras.toScaleValue = toScaleValue;
    axisExtras.getLabel = getAxisExtraLabel;
    axisExtras.getLineStyle = getAxisExtraLineStyle;
    axisExtras.renderLinearExtras = renderLinearAxisExtras;
    axisExtras.getEntries = getAxisEntries;
    axisExtras.setEntries = setAxisEntries;
    axisExtras.updateEntry = updateAxisEntry;
    axisExtras.addEntry = addAxisEntry;
    axisExtras.removeEntry = removeAxisEntry;
  }

  function isMinorTicksSupported(config){
    if(!config){ return false; }
    if(typeof config.getMinorTicksEnabled !== 'function' || typeof config.onMinorTicksChange !== 'function'){
      return false;
    }
    if(typeof config.isMinorTicksSupported === 'function'){
      return config.isMinorTicksSupported(config.axis) !== false;
    }
    return true;
  }

  const AXIS_NOTATION_DEFAULT = 'decimal';
  const AXIS_NOTATION_VALUES = new Set(['auto','decimal','scientific']);
  const AXIS_NOTATION_OPTIONS = [
    { value: 'auto', label: 'Automatic' },
    { value: 'decimal', label: 'Decimal' },
    { value: 'scientific', label: 'Scientific' }
  ];
  const AXIS_NOTATION_LABELS = AXIS_NOTATION_OPTIONS.reduce((map, opt) => {
    map[opt.value] = opt.label;
    return map;
  }, {});

  function sanitizeNotationValue(value){
    if(typeof value !== 'string'){ return AXIS_NOTATION_DEFAULT; }
    const normalized = value.trim().toLowerCase();
    return AXIS_NOTATION_VALUES.has(normalized) ? normalized : AXIS_NOTATION_DEFAULT;
  }

  function getNotationLabel(value){
    const sanitized = sanitizeNotationValue(value);
    return AXIS_NOTATION_LABELS[sanitized] || AXIS_NOTATION_LABELS[AXIS_NOTATION_DEFAULT];
  }

  function setNotationDisplayValue(value){
    notationActiveValue = sanitizeNotationValue(value);
    if(notationDisplayInput){
      notationDisplayInput.value = getNotationLabel(notationActiveValue);
    }
    if(!notationMenuPopup){ return; }
    const options = notationMenuPopup.querySelectorAll('.font-controls-panel__combo-option');
    options.forEach(optionEl => {
      const isActive = optionEl.dataset.value === notationActiveValue;
      optionEl.classList.toggle('font-controls-panel__combo-option--active', isActive);
      optionEl.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
  }

  function focusNotationOptionByIndex(index){
    if(!notationMenuPopup){ return false; }
    const options = notationMenuPopup.querySelectorAll('.font-controls-panel__combo-option');
    if(!options.length){ return false; }
    const clamped = Math.max(0, Math.min(options.length - 1, index));
    const option = options[clamped];
    if(option){
      option.focus();
      return true;
    }
    return false;
  }

  function focusNotationOptionByValue(value){
    if(!notationMenuPopup){ return false; }
    const normalized = sanitizeNotationValue(value);
    const option = notationMenuPopup.querySelector(`.font-controls-panel__combo-option[data-value="${normalized}"]`);
    if(option){
      option.focus();
      return true;
    }
    return false;
  }

  function closeNotationMenu(reason){
    if(!notationMenuPopup || !notationMenuVisible){ return; }
    notationMenuVisible = false;
    notationMenuPopup.hidden = true;
    notationMenuPopup.classList.remove('font-controls-panel__combo-menu--open');
    if(notationMenuToggle){
      notationMenuToggle.setAttribute('aria-expanded', 'false');
    }
    logDebug('notation menu closed', { reason });
  }

  function openNotationMenu(reason){
    if(!notationMenuPopup || notationMenuVisible){ return; }
    notationMenuVisible = true;
    notationMenuPopup.hidden = false;
    requestAnimationFrame(() => {
      if(notationMenuPopup){
        notationMenuPopup.classList.add('font-controls-panel__combo-menu--open');
      }
    });
    if(notationMenuToggle){
      notationMenuToggle.setAttribute('aria-expanded', 'true');
    }
    const focused = focusNotationOptionByValue(notationActiveValue);
    if(!focused){ focusNotationOptionByIndex(0); }
    logDebug('notation menu opened', { reason, value: notationActiveValue });
  }

  function toggleNotationMenu(reason){
    if(notationMenuVisible){
      closeNotationMenu(reason || 'toggle');
    }else{
      openNotationMenu(reason || 'toggle');
    }
  }

  function handleNotationOptionSelect(requestedValue){
    if(applyingFromUndo){ return; }
    if(!activeConfig || !notationMenuToggle || notationMenuToggle.disabled){
      closeNotationMenu('notation-disabled');
      return;
    }
    const config = activeConfig;
    if(typeof config.onNotationChange !== 'function'){ return; }
    const previousValue = sanitizeNotationValue(config.getNotationMode ? config.getNotationMode(config.axis) : AXIS_NOTATION_DEFAULT);
    const nextRequested = sanitizeNotationValue(requestedValue);
    if(previousValue === nextRequested){
      closeNotationMenu('notation-noop');
      return;
    }
    logDebug('notation change',{ axis: config.axis, mode: nextRequested });
    config.onNotationChange(nextRequested, config.axis);
    const resolvedNext = sanitizeNotationValue(config.getNotationMode ? config.getNotationMode(config.axis) : nextRequested);
    syncPanelInputsFromConfig(config);
    recordAxisStateChange(
      config,
      'notation',
      previousValue,
      resolvedNext,
      value => {
        if(config.onNotationChange){
          config.onNotationChange(value, config.axis);
        }
      }
    );
    closeNotationMenu('notation-select');
  }

  function toColorInputValue(value){
    const sanitized = sanitizeColorState(value);
    if(!sanitized){ return '#000000'; }
    const normalized = sanitized.toLowerCase();
    if(/^#([0-9a-f]{6})$/.test(normalized)){
      return normalized;
    }
    if(/^#([0-9a-f]{3})$/.test(normalized)){
      const hex = normalized.slice(1);
      return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
    }
    return '#000000';
  }

  function formatThicknessChipValue(value){
    const numeric = Number(value);
    if(!Number.isFinite(numeric)){
      return '0px';
    }
    const rounded = Math.round(numeric * 10) / 10;
    return `${rounded}px`;
  }

  function syncStyleChipUi(){
    if(!styleChipEl || !styleChipPreviewEl || !styleChipValueEl || !thicknessInput || !colorInput){
      return;
    }
    const thicknessValue = sanitizeThicknessValue(thicknessInput.value);
    styleChipPreviewEl.style.background = toColorInputValue(colorInput.value);
    styleChipValueEl.textContent = formatThicknessChipValue(thicknessValue == null ? 0 : thicknessValue);
    styleChipEl.dataset.noBorder = thicknessValue == null || thicknessValue <= 0 ? '1' : '0';
  }

  function clearAxisStylePickerSection(overlayEl){
    if(!overlayEl || !overlayEl.querySelectorAll){
      return;
    }
    overlayEl.querySelectorAll('.shared-color-picker__section--axis-style').forEach(node => node.remove());
  }

  function attachAxisStylePickerThicknessSection(overlayEl){
    if(!overlayEl){
      return () => {};
    }
    clearAxisStylePickerSection(overlayEl);
    const doc = overlayEl.ownerDocument || global.document;
    if(!doc){
      return () => {};
    }
    const section = doc.createElement('section');
    section.className = 'shared-color-picker__section shared-color-picker__section--scatter-style shared-color-picker__section--axis-style';
    const title = doc.createElement('div');
    title.className = 'shared-color-picker__section-title';
    title.textContent = 'Line width';
    section.appendChild(title);
    const row = doc.createElement('div');
    row.className = 'shared-color-picker__scatter-style-row shared-color-picker__scatter-style-row--single';
    const field = doc.createElement('label');
    field.className = 'shared-color-picker__scatter-style-field';
    const input = doc.createElement('input');
    input.className = 'shared-color-picker__scatter-style-input';
    input.type = 'number';
    input.min = thicknessInput?.min || '0.25';
    input.max = thicknessInput?.max || '10';
    input.step = thicknessInput?.step || '0.25';
    input.value = thicknessInput?.value || '1';
    input.setAttribute('aria-label', 'Line width');
    input.addEventListener('input', () => {
      if(!thicknessInput){ return; }
      thicknessInput.value = input.value;
      thicknessInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    input.addEventListener('change', () => {
      if(!thicknessInput){ return; }
      thicknessInput.value = input.value;
      thicknessInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
    field.appendChild(input);
    row.appendChild(field);
    section.appendChild(row);
    overlayEl.insertBefore(section, overlayEl.firstChild || null);
    return () => {
      if(section.parentNode){
        section.parentNode.removeChild(section);
      }
    };
  }

  function getUndoScope(config){
    if(!config){ return null; }
    if(typeof config.undoScope === 'string' && config.undoScope){
      return config.undoScope;
    }
    if(typeof config.scopeId === 'string' && config.scopeId){
      return `${config.scopeId}GraphPanel`;
    }
    return null;
  }

  function renderBrokenAxisSegments(config){
    if(!brokenAxisSegmentsContainer || !config){ return; }
    const doc = brokenAxisSegmentsContainer.ownerDocument || global.document;
    if(!doc){ return; }
    
    // Clear existing segments
    brokenAxisSegmentsContainer.innerHTML = '';
    
    const rawSegments = config.getBrokenAxisSegments ? config.getBrokenAxisSegments(config.axis) : [];
    const rawSegmentList = Array.isArray(rawSegments) ? rawSegments : [];
    const bounds = resolveAxisBounds(config);
    const segments = normalizeBrokenAxisSegmentsForBounds(rawSegmentList, bounds);
    const normalizedSegments = segments.map((segment, index) =>
      normalizeEdgeBrokenSegment(segment, index, segments.length, bounds)
    );
    if(bounds && typeof config.onBrokenAxisSegmentChange === 'function' && rawSegmentList.length === segments.length){
      const span = Math.abs(bounds.max - bounds.min) || 1;
      const tolerance = Math.max(1e-9, span / 1000000000);
      normalizedSegments.forEach((segment, index) => {
        const previous = rawSegmentList[index] && typeof rawSegmentList[index] === 'object'
          ? rawSegmentList[index]
          : {};
        const prevStart = Number(previous.start);
        const prevEnd = Number(previous.end);
        const nextStart = Number(segment.start);
        const nextEnd = Number(segment.end);
        if(!Number.isFinite(nextStart) || !Number.isFinite(nextEnd)){
          return;
        }
        if(!(nextStart < nextEnd)){
          // Do not auto-write invalid intervals (can happen before user edits defaults).
          return;
        }
        const startChanged = !areNumbersClose(prevStart, nextStart, tolerance);
        const endChanged = !areNumbersClose(prevEnd, nextEnd, tolerance);
        if(startChanged || endChanged){
          config.onBrokenAxisSegmentChange(config.axis, index, { start: nextStart, end: nextEnd });
        }
      });
    }

    if(!normalizedSegments.length){
      const emptyState = doc.createElement('div');
      emptyState.className = 'axis-controls-panel__segments-empty';
      emptyState.textContent = 'No breaks yet — add an interval to hide a range of values.';
      brokenAxisSegmentsContainer.appendChild(emptyState);
      return;
    }

    normalizedSegments.forEach((segment, index) => {
      const lockStartToAxisMin = !!bounds && index === 0;
      const lockEndToAxisMax = !!bounds && index === (normalizedSegments.length - 1);
      const segmentRow = doc.createElement('div');
      segmentRow.className = 'axis-controls-panel__segment-row';

      const title = doc.createElement('span');
      title.className = 'axis-controls-panel__segment-title';
      title.textContent = `Break ${index + 1}`;
      segmentRow.appendChild(title);

      const inputsGroup = doc.createElement('div');
      inputsGroup.className = 'axis-controls-panel__segment-inputs';

      const startInput = doc.createElement('input');
      startInput.type = 'number';
      startInput.step = '0.1';
      startInput.placeholder = 'Start';
      startInput.title = 'Break start value';
      startInput.className = 'axis-controls-panel__input axis-controls-panel__input--xs axis-controls-panel__segment-input';
      startInput.value = segment.start != null ? segment.start : '';
      startInput.setAttribute('data-undo-ignore', '1');
      startInput.setAttribute('data-segment-index', index);
      startInput.setAttribute('data-segment-field', 'start');
      if(lockStartToAxisMin && bounds){
        startInput.value = String(bounds.min);
        startInput.readOnly = true;
        startInput.setAttribute('aria-readonly', 'true');
        startInput.title = 'Locked to the axis minimum';
      }

      const separator = doc.createElement('span');
      separator.className = 'axis-controls-panel__segment-separator';
      separator.textContent = '→';
      separator.setAttribute('aria-hidden', 'true');

      const endInput = doc.createElement('input');
      endInput.type = 'number';
      endInput.step = '0.1';
      endInput.placeholder = 'End';
      endInput.title = 'Break end value';
      endInput.className = 'axis-controls-panel__input axis-controls-panel__input--xs axis-controls-panel__segment-input';
      endInput.value = segment.end != null ? segment.end : '';
      endInput.setAttribute('data-undo-ignore', '1');
      endInput.setAttribute('data-segment-index', index);
      endInput.setAttribute('data-segment-field', 'end');
      if(lockEndToAxisMax && bounds){
        endInput.value = String(bounds.max);
        endInput.readOnly = true;
        endInput.setAttribute('aria-readonly', 'true');
        endInput.title = 'Locked to the axis maximum';
      }

      inputsGroup.appendChild(startInput);
      inputsGroup.appendChild(separator);
      inputsGroup.appendChild(endInput);
      segmentRow.appendChild(inputsGroup);

      const removeButton = doc.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'axis-controls-panel__button axis-controls-panel__button--remove-segment';
      removeButton.textContent = '×';
      removeButton.title = 'Remove break';
      removeButton.setAttribute('data-undo-ignore', '1');
      removeButton.setAttribute('data-segment-index', index);
      segmentRow.appendChild(removeButton);

      brokenAxisSegmentsContainer.appendChild(segmentRow);

      const updateSegment = () => {
        if(applyingFromUndo){ return; }
        if(!config || typeof config.onBrokenAxisSegmentChange !== 'function'){ return; }
        let start = Number(startInput.value);
        let end = Number(endInput.value);
        if(lockStartToAxisMin && bounds){
          start = bounds.min;
          startInput.value = String(start);
        }
        if(lockEndToAxisMax && bounds){
          end = bounds.max;
          endInput.value = String(end);
        }
        if(Number.isFinite(start) && Number.isFinite(end) && start < end){
          config.onBrokenAxisSegmentChange(config.axis, index, { start, end });
          logDebug('broken axis segment changed',{ index, start, end });
        }
      };

      startInput.addEventListener('change', updateSegment);
      endInput.addEventListener('change', updateSegment);

      removeButton.addEventListener('click', evt => {
        // Keep the dropdown open while removing a break.
        evt.preventDefault();
        evt.stopPropagation();
        if(applyingFromUndo){ return; }
        if(!config || typeof config.onBrokenAxisRemoveSegment !== 'function'){ return; }
        config.onBrokenAxisRemoveSegment(config.axis, index);
        logDebug('broken axis segment removed',{ index });
        syncPanelInputsFromConfig(config);
        // Re‑assert expanded state in case a global click handler tried to close it.
        setBrokenAxisConfigExpanded(true);
      });
    });
  }

  function normalizeAdditionalTickValue(entry){
    if(!entry || typeof entry !== 'object'){ return null; }
    const raw = entry.value ?? entry.at ?? entry.position ?? entry.y ?? entry.x;
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function normalizeAdditionalTickLabel(entry){
    if(!entry || typeof entry !== 'object'){ return ''; }
    if(entry.label !== undefined && entry.label !== null){ return String(entry.label); }
    if(entry.text !== undefined && entry.text !== null){ return String(entry.text); }
    return '';
  }

  function normalizeAdditionalTickToggle(entry, key, fallback){
    if(!entry || typeof entry !== 'object'){ return !!fallback; }
    if(entry[key] !== undefined){ return !!entry[key]; }
    if(key === 'showTick' && entry.tick !== undefined){ return !!entry.tick; }
    if(key === 'showLine' && entry.line !== undefined){ return !!entry.line; }
    return !!fallback;
  }

  function renderAdditionalTickRows(config){
    if(!additionalTicksContainer || !config){ return; }
    const doc = additionalTicksContainer.ownerDocument || global.document;
    if(!doc){ return; }
    additionalTicksContainer.innerHTML = '';
    const rawEntries = config.getAdditionalTicks ? config.getAdditionalTicks(config.axis) : [];
    const entries = Array.isArray(rawEntries) ? rawEntries : [];

    if(!entries.length){
      return;
    }

    const header = doc.createElement('div');
    header.className = 'axis-controls-panel__extra-head';
    ['At', 'Tick', 'Line', 'Label', ''].forEach(text => {
      const cell = doc.createElement('span');
      cell.className = 'axis-controls-panel__extra-head-cell';
      cell.textContent = text;
      header.appendChild(cell);
    });
    additionalTicksContainer.appendChild(header);

    const extraDefaults = (config && typeof config.additionalTickDefaults === 'object' && config.additionalTickDefaults)
      ? config.additionalTickDefaults
      : (axisExtras.DEFAULTS || {});
    const defaultShowTick = extraDefaults.showTick !== undefined ? !!extraDefaults.showTick : false;
    const defaultShowLine = extraDefaults.showLine !== undefined ? !!extraDefaults.showLine : true;

    entries.forEach((entry, index) => {
      const row = doc.createElement('div');
      row.className = 'axis-controls-panel__extra-row';

      const valueInput = doc.createElement('input');
      valueInput.type = 'number';
      valueInput.step = '0.1';
      valueInput.placeholder = 'At value';
      valueInput.title = 'Axis value';
      valueInput.className = 'axis-controls-panel__input axis-controls-panel__input--xs axis-controls-panel__extra-input axis-controls-panel__extra-input--value';
      valueInput.setAttribute('data-undo-ignore', '1');
      const value = normalizeAdditionalTickValue(entry);
      valueInput.value = value === null ? '' : String(value);
      row.appendChild(valueInput);

      const tickToggle = doc.createElement('label');
      tickToggle.className = 'axis-controls-panel__extra-toggle';
      const tickToggleInput = doc.createElement('input');
      tickToggleInput.type = 'checkbox';
      tickToggleInput.className = 'axis-controls-panel__checkbox';
      tickToggleInput.checked = normalizeAdditionalTickToggle(entry, 'showTick', defaultShowTick);
      tickToggleInput.setAttribute('data-undo-ignore', '1');
      const tickToggleText = doc.createElement('span');
      tickToggleText.textContent = 'Tick';
      tickToggle.appendChild(tickToggleInput);
      tickToggle.appendChild(tickToggleText);
      row.appendChild(tickToggle);

      const lineToggle = doc.createElement('label');
      lineToggle.className = 'axis-controls-panel__extra-toggle';
      const lineToggleInput = doc.createElement('input');
      lineToggleInput.type = 'checkbox';
      lineToggleInput.className = 'axis-controls-panel__checkbox';
      lineToggleInput.checked = normalizeAdditionalTickToggle(entry, 'showLine', defaultShowLine);
      lineToggleInput.setAttribute('data-undo-ignore', '1');
      const lineToggleText = doc.createElement('span');
      lineToggleText.textContent = 'Line';
      lineToggle.appendChild(lineToggleInput);
      lineToggle.appendChild(lineToggleText);
      row.appendChild(lineToggle);

      const labelInput = doc.createElement('input');
      labelInput.type = 'text';
      labelInput.placeholder = 'Label';
      labelInput.title = 'Custom tick label';
      labelInput.className = 'axis-controls-panel__input axis-controls-panel__extra-input axis-controls-panel__extra-input--label';
      labelInput.setAttribute('data-undo-ignore', '1');
      labelInput.value = normalizeAdditionalTickLabel(entry);
      row.appendChild(labelInput);

      const removeButton = doc.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'axis-controls-panel__button axis-controls-panel__button--remove-extra';
      removeButton.textContent = 'x';
      removeButton.title = 'Remove mark';
      removeButton.setAttribute('data-undo-ignore', '1');
      row.appendChild(removeButton);

      additionalTicksContainer.appendChild(row);

      const commitRow = () => {
        if(applyingFromUndo){ return; }
        if(!config || typeof config.onAdditionalTickChange !== 'function'){ return; }
        const numericValue = Number(valueInput.value);
        if(!Number.isFinite(numericValue)){
          return;
        }
        config.onAdditionalTickChange(config.axis, index, {
          ...(entry && typeof entry === 'object' ? entry : {}),
          value: numericValue,
          showTick: !!tickToggleInput.checked,
          showLine: !!lineToggleInput.checked,
          label: labelInput.value != null ? String(labelInput.value) : ''
        });
        logDebug('additional tick changed',{
          axis: config.axis,
          index,
          value: numericValue,
          showTick: !!tickToggleInput.checked,
          showLine: !!lineToggleInput.checked
        });
        syncPanelInputsFromConfig(config);
        setAdditionalTicksConfigExpanded(true);
      };

      valueInput.addEventListener('change', commitRow);
      tickToggleInput.addEventListener('change', commitRow);
      lineToggleInput.addEventListener('change', commitRow);
      labelInput.addEventListener('change', commitRow);
      labelInput.addEventListener('keydown', evt => {
        if(evt.key === 'Enter'){
          evt.preventDefault();
          commitRow();
        }
      });

      removeButton.addEventListener('click', evt => {
        evt.preventDefault();
        evt.stopPropagation();
        if(applyingFromUndo){ return; }
        if(!config || typeof config.onAdditionalTickRemove !== 'function'){ return; }
        config.onAdditionalTickRemove(config.axis, index);
        logDebug('additional tick removed',{ axis: config.axis, index });
        syncPanelInputsFromConfig(config);
        setAdditionalTicksConfigExpanded(true);
      });
    });
  }

  function setAdditionalTicksConfigExpanded(expanded){
    additionalTicksConfigExpanded = !!expanded;
    if(additionalTicksButton){
      additionalTicksButton.setAttribute('aria-expanded', additionalTicksConfigExpanded ? 'true' : 'false');
    }
    const shouldShow = additionalTicksConfigExpanded;
    if(additionalTicksDropdown){
      additionalTicksDropdown.hidden = !shouldShow;
      additionalTicksDropdown.dataset.open = shouldShow ? '1' : '0';
      if(shouldShow){
        alignDropdownToTrigger(additionalTicksButton, additionalTicksDropdown);
      }
    }
    if(additionalTicksAddButton){
      additionalTicksAddButton.style.display = shouldShow ? 'inline-flex' : 'none';
    }
  }

  function setBrokenAxisConfigExpanded(expanded){
    brokenAxisConfigExpanded = !!expanded;
    if(brokenAxisConfigButton){
      brokenAxisConfigButton.setAttribute('aria-expanded', brokenAxisConfigExpanded ? 'true' : 'false');
    }
    const shouldShow = brokenAxisConfigExpanded;
    if(brokenAxisDropdown){
      brokenAxisDropdown.hidden = !shouldShow;
      brokenAxisDropdown.dataset.open = shouldShow ? '1' : '0';
      if(shouldShow){
        alignDropdownToTrigger(brokenAxisConfigButton, brokenAxisDropdown);
      }
    }
    const segmentsVisible = shouldShow && brokenAxisCheckbox && brokenAxisCheckbox.checked;
    if(brokenAxisSegmentsContainer){
      brokenAxisSegmentsContainer.style.display = segmentsVisible ? 'flex' : 'none';
    }
    if(brokenAxisAddButton){
      brokenAxisAddButton.style.display = segmentsVisible ? 'flex' : 'none';
      const enabled = brokenAxisCheckbox ? brokenAxisCheckbox.checked : false;
      brokenAxisAddButton.disabled = !enabled;
      brokenAxisAddButton.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    }
  }

  function alignDropdownToTrigger(triggerEl, dropdownEl){
    if(!triggerEl || !dropdownEl){
      return;
    }
    const left = Number(triggerEl.offsetLeft) || 0;
    const top = (Number(triggerEl.offsetTop) || 0) + (Number(triggerEl.offsetHeight) || 0);
    dropdownEl.style.left = `${left}px`;
    dropdownEl.style.top = `${top}px`;
    dropdownEl.style.right = 'auto';
  }


  function updatePanelInputs(config){
    if(!panelEl || !config || !tickInput || !thicknessInput || !colorInput){ return; }
    const axisKey = String(config.axis || '').trim().toLowerCase();
    const axisName = axisKey === 'y' ? 'Y axis' : 'X axis';
    if(panelTitleEl){
      panelTitleEl.textContent = axisName;
    }
    panelEl.setAttribute('aria-label', `${axisName} controls`);
    const tickSupported = config.isTickIntervalEnabled
      ? !!config.isTickIntervalEnabled(config.axis)
      : true;
    const tickDisabledMessage = config.getTickIntervalDisabledMessage
      ? config.getTickIntervalDisabledMessage(config.axis)
      : (config.tickIntervalDisabledMessage || 'Tick interval available only for numeric axes.');
    if(tickSupported){
      if(config.axis === 'x'){
        tickInput.step = '1';
        tickInput.min = '1';
      }else{
        tickInput.step = '0.1';
        tickInput.min = '0';
      }
      tickInput.disabled = false;
      tickInput.placeholder = config.tickPlaceholder || 'Auto';
      tickInput.title = '';
      if(tickFieldEl){ tickFieldEl.dataset.disabled = '0'; }
      const tickValueRaw = config.getTickInterval ? config.getTickInterval(config.axis) : null;
      const tickValue = sanitizeTickValue(tickValueRaw);
      tickInput.value = tickValue === null ? '' : String(tickValue);
    }else{
      tickInput.disabled = true;
      tickInput.value = '';
      tickInput.placeholder = 'Not available';
      tickInput.title = tickDisabledMessage || '';
      if(tickFieldEl){ tickFieldEl.dataset.disabled = '1'; }
      logDebug('tick interval disabled',{ axis: config.axis, scopeId: config.scopeId, reason: tickDisabledMessage });
    }

    const datasetSpacingSupported = (
      typeof config.getDatasetSpacing === 'function' &&
      typeof config.onDatasetSpacingChange === 'function' &&
      (
        typeof config.isDatasetSpacingSupported === 'function'
          ? config.isDatasetSpacingSupported(config.axis) !== false
          : true
      )
    );
    if(datasetSpacingFieldEl && datasetSpacingInput){
      if(datasetSpacingSupported){
        datasetSpacingFieldEl.hidden = false;
        datasetSpacingFieldEl.dataset.disabled = '0';
        datasetSpacingInput.disabled = false;
        const minValue = sanitizeDatasetSpacingValue(config.datasetSpacingMin);
        const maxValue = sanitizeDatasetSpacingValue(config.datasetSpacingMax);
        const stepValue = sanitizeDatasetSpacingValue(config.datasetSpacingStep);
        datasetSpacingInput.min = String(minValue == null ? 0.05 : minValue);
        if(maxValue == null){
          datasetSpacingInput.removeAttribute('max');
        }else{
          datasetSpacingInput.max = String(maxValue);
        }
        datasetSpacingInput.step = String(stepValue == null ? 0.05 : stepValue);
        datasetSpacingInput.placeholder = config.datasetSpacingPlaceholder || '1';
        const requestedLabel = typeof config.datasetSpacingLabel === 'string' && config.datasetSpacingLabel.trim()
          ? config.datasetSpacingLabel.trim()
          : 'Dataset Spacing';
        if(datasetSpacingLabelEl){
          datasetSpacingLabelEl.textContent = requestedLabel;
        }
        const datasetSpacingRaw = config.getDatasetSpacing ? config.getDatasetSpacing(config.axis) : null;
        const datasetSpacing = sanitizeDatasetSpacingValue(datasetSpacingRaw);
        datasetSpacingInput.value = datasetSpacing == null ? '' : String(datasetSpacing);
      }else{
        datasetSpacingFieldEl.hidden = true;
        datasetSpacingFieldEl.dataset.disabled = '1';
        datasetSpacingInput.disabled = true;
        datasetSpacingInput.value = '';
      }
    }

    const axisLengthSupported = (
      typeof config.getAxisLength === 'function' &&
      typeof config.onAxisLengthChange === 'function' &&
      (
        typeof config.isAxisLengthSupported === 'function'
          ? config.isAxisLengthSupported(config.axis) !== false
          : true
      )
    );
    if(axisLengthFieldEl && axisLengthInput && axisLengthUnitSelect && axisLengthPreserveToggleInput){
      if(axisLengthSupported){
        const uiState = getAxisLengthUiState(config);
        const unit = sanitizeAxisLengthUnit(uiState.unit);
        const lengthBounds = readAxisLengthBounds(config);
        const minPx = sanitizeAxisLengthValue(lengthBounds && lengthBounds.min);
        const maxPx = sanitizeAxisLengthValue(lengthBounds && lengthBounds.max);
        const stepPx = sanitizeAxisLengthValue(lengthBounds && lengthBounds.step);
        const minDisplay = convertAxisLengthFromPx(minPx == null ? 1 : minPx, unit);
        const maxDisplay = convertAxisLengthFromPx(maxPx, unit);
        const stepDisplay = convertAxisLengthFromPx(stepPx, unit);
        const axisLengthPx = readAxisLengthPx(config);
        const displayValue = convertAxisLengthFromPx(axisLengthPx, unit);
        axisLengthFieldEl.hidden = false;
        axisLengthFieldEl.dataset.disabled = '0';
        axisLengthInput.disabled = false;
        axisLengthInput.removeAttribute('aria-disabled');
        axisLengthInput.min = formatAxisLengthDisplay(minDisplay, unit) || (unit === AXIS_LENGTH_UNIT_MM ? '0.1' : '1');
        if(maxDisplay == null){
          axisLengthInput.removeAttribute('max');
        }else{
          axisLengthInput.max = formatAxisLengthDisplay(maxDisplay, unit) || '';
        }
        axisLengthInput.step = formatAxisLengthDisplay(stepDisplay, unit) || (unit === AXIS_LENGTH_UNIT_MM ? '0.1' : '1');
        axisLengthInput.value = formatAxisLengthDisplay(displayValue, unit);
        axisLengthInput.placeholder = unit === AXIS_LENGTH_UNIT_MM ? 'mm' : 'px';
        axisLengthUnitSelect.disabled = false;
        axisLengthUnitSelect.value = unit;
        axisLengthPreserveToggleInput.disabled = false;
        axisLengthPreserveToggleInput.checked = uiState.preserveProportions === true;
      }else{
        axisLengthFieldEl.hidden = true;
        axisLengthFieldEl.dataset.disabled = '1';
        axisLengthInput.disabled = true;
        axisLengthInput.value = '';
        axisLengthUnitSelect.disabled = true;
        axisLengthUnitSelect.value = AXIS_LENGTH_UNIT_PX;
        axisLengthPreserveToggleInput.disabled = true;
        axisLengthPreserveToggleInput.checked = false;
      }
    }

    const minorTickSupported = isMinorTicksSupported(config);
    const minorSubdivisionsSupported = minorTickSupported
      && typeof config.getMinorTickSubdivisions === 'function'
      && typeof config.onMinorTickSubdivisionsChange === 'function';
    const minorSubdivisionsValue = sanitizeMinorSubdivisionValue(
      config.getMinorTickSubdivisions ? config.getMinorTickSubdivisions(config.axis) : DEFAULT_MINOR_SUBDIVISIONS
    );
    if(minorTicksFieldEl){
      if(minorTickSupported){
        minorTicksFieldEl.hidden = false;
        minorTicksFieldEl.dataset.disabled = '0';
        if(minorTicksSwitch){ minorTicksSwitch.dataset.disabled = '0'; }
        if(minorTicksSubdivWrapper){ minorTicksSubdivWrapper.dataset.disabled = '0'; }
        const enabled = config.getMinorTicksEnabled ? !!config.getMinorTicksEnabled(config.axis) : false;
        if(minorTicksToggleInput){
          minorTicksToggleInput.checked = enabled;
          minorTicksToggleInput.disabled = false;
          minorTicksToggleInput.setAttribute('aria-checked', enabled ? 'true' : 'false');
        }
        if(minorTicksSwitch){
          minorTicksSwitch.dataset.checked = enabled ? '1' : '0';
        }
        if(minorTicksSubdivInput){
          minorTicksSubdivInput.value = String(minorSubdivisionsValue);
          const canEditSubdiv = minorSubdivisionsSupported && enabled;
          minorTicksSubdivInput.disabled = !canEditSubdiv;
          minorTicksSubdivInput.setAttribute('aria-disabled', canEditSubdiv ? 'false' : 'true');
        }
        if(minorTicksSubdivWrapper){
          minorTicksSubdivWrapper.dataset.disabled = (minorSubdivisionsSupported && enabled) ? '0' : '1';
        }
      }else{
        minorTicksFieldEl.hidden = true;
        minorTicksFieldEl.dataset.disabled = '1';
        if(minorTicksSwitch){
          minorTicksSwitch.dataset.checked = '0';
          minorTicksSwitch.dataset.disabled = '1';
        }
        if(minorTicksToggleInput){
          minorTicksToggleInput.checked = false;
          minorTicksToggleInput.disabled = true;
          minorTicksToggleInput.setAttribute('aria-checked','false');
        }
        if(minorTicksSubdivInput){
          minorTicksSubdivInput.value = String(minorSubdivisionsValue);
          minorTicksSubdivInput.disabled = true;
          minorTicksSubdivInput.setAttribute('aria-disabled','true');
        }
        if(minorTicksSubdivWrapper){
          minorTicksSubdivWrapper.dataset.disabled = '1';
        }
      }
    }
    const thicknessValueRaw = config.getThickness ? config.getThickness() : null;
    const thicknessValue = sanitizeThicknessValue(thicknessValueRaw);
    thicknessInput.value = thicknessValue === null ? '' : String(thicknessValue);
    const colorValueRaw = config.getColor ? config.getColor() : null;
    colorInput.value = toColorInputValue(colorValueRaw);
    syncStyleChipUi();

    const notationSupported = notationMenuToggle && typeof config.isNotationSupported === 'function'
      ? config.isNotationSupported(config.axis) !== false
      : (notationMenuToggle && typeof config.getNotationMode === 'function' && typeof config.onNotationChange === 'function');
    if(notationFieldEl){
      if(notationSupported){
        notationFieldEl.hidden = false;
        notationFieldEl.dataset.disabled = '0';
        if(notationMenuToggle){ notationMenuToggle.disabled = false; }
        if(notationDisplayInput){ notationDisplayInput.disabled = false; }
        const notationRaw = config.getNotationMode ? config.getNotationMode(config.axis) : AXIS_NOTATION_DEFAULT;
        setNotationDisplayValue(notationRaw);
      }else{
        notationFieldEl.dataset.disabled = '1';
        notationFieldEl.hidden = true;
        if(notationMenuToggle){ notationMenuToggle.disabled = true; }
        if(notationDisplayInput){ notationDisplayInput.disabled = true; }
        setNotationDisplayValue(AXIS_NOTATION_DEFAULT);
        closeNotationMenu('notation-disabled');
      }
    }

    const additionalTicksSupported = (
      typeof config.getAdditionalTicks === 'function' &&
      typeof config.onAdditionalTickChange === 'function' &&
      typeof config.onAdditionalTickAdd === 'function' &&
      typeof config.onAdditionalTickRemove === 'function' &&
      (
        typeof config.isAdditionalTicksSupported === 'function'
          ? config.isAdditionalTicksSupported(config.axis) !== false
          : true
      )
    );
    if(additionalTicksFieldEl){
      if(additionalTicksSupported){
        additionalTicksFieldEl.hidden = false;
        if(additionalTicksButton){
          additionalTicksButton.disabled = false;
          additionalTicksButton.setAttribute('aria-disabled', 'false');
        }
        if(additionalTicksAddButton){
          additionalTicksAddButton.disabled = false;
          additionalTicksAddButton.setAttribute('aria-disabled', 'false');
        }
        renderAdditionalTickRows(config);
        setAdditionalTicksConfigExpanded(additionalTicksConfigExpanded);
      }else{
        additionalTicksFieldEl.hidden = true;
        if(additionalTicksButton){
          additionalTicksButton.disabled = true;
          additionalTicksButton.setAttribute('aria-disabled', 'true');
        }
        if(additionalTicksAddButton){
          additionalTicksAddButton.disabled = true;
          additionalTicksAddButton.setAttribute('aria-disabled', 'true');
        }
        if(additionalTicksContainer){
          additionalTicksContainer.innerHTML = '';
        }
        additionalTicksConfigExpanded = false;
        setAdditionalTicksConfigExpanded(false);
      }
    }

    // Update broken axis controls
    const brokenAxisSupported = (
      typeof config.isBrokenAxisSupported === 'function'
        ? config.isBrokenAxisSupported(config.axis) !== false
        : true
    ) &&
      typeof config.getBrokenAxisEnabled === 'function' &&
      typeof config.onBrokenAxisEnabledChange === 'function';
    if(brokenAxisFieldEl){
      if(brokenAxisSupported){
        brokenAxisFieldEl.hidden = false;
        const enabled = config.getBrokenAxisEnabled ? config.getBrokenAxisEnabled(config.axis) : false;
        const segments = typeof config.getBrokenAxisSegments === 'function'
          ? (config.getBrokenAxisSegments(config.axis) || [])
          : [];
        if(brokenAxisCheckbox){
          brokenAxisCheckbox.checked = enabled;
        }
        if(brokenAxisConfigButton){
          brokenAxisConfigButton.disabled = false;
          brokenAxisConfigButton.setAttribute('aria-disabled', 'false');
        }
        if(!enabled){
          if(brokenAxisSegmentsContainer){ brokenAxisSegmentsContainer.innerHTML = ''; }
        }else{
          renderBrokenAxisSegments(config);
        }
        setBrokenAxisConfigExpanded(brokenAxisConfigExpanded);
      }else{
        brokenAxisFieldEl.hidden = true;
        if(brokenAxisSegmentsContainer){
          brokenAxisSegmentsContainer.style.display = 'none';
          brokenAxisSegmentsContainer.innerHTML = '';
        }
        if(brokenAxisConfigButton){
          brokenAxisConfigButton.disabled = true;
          brokenAxisConfigButton.setAttribute('aria-disabled', 'true');
        }
        brokenAxisConfigExpanded = false;
        setBrokenAxisConfigExpanded(false);
      }
    }

  }

  function syncPanelInputsFromConfig(config){
    if(!panelEl || panelEl.dataset.open !== '1'){ return; }
    if(!configsMatch(activeConfig, config)){ return; }
    updatePanelInputs(activeConfig);
  }

  function recordAxisStateChange(config, type, previousValue, nextValue, applyFn, equals){
    const manager = getUndoManager();
    if(!manager){ return; }
    const compare = typeof equals === 'function'
      ? equals
      : ((a, b) => (a === b) || (a === null && b === null));
    if(compare(previousValue, nextValue)){ return; }
    const parts = ['axis'];
    if(config?.scopeId){ parts.push(config.scopeId); }
    if(config?.axis){ parts.push(config.axis); }
    parts.push(type);
    const label = parts.filter(Boolean).join(':');
    manager.recordStateChange({
      label,
      scope: getUndoScope(config),
      from: previousValue,
      to: nextValue,
      equals: compare,
      apply(value){
        applyingFromUndo = true;
        try{
          if(typeof applyFn === 'function'){
            applyFn(value);
          }
        }finally{
          applyingFromUndo = false;
        }
        syncPanelInputsFromConfig(config);
        return true;
      }
    });
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';

  function logDebug(message, payload){
    try{
      if(typeof Shared.isDebugEnabled === 'function' && !Shared.isDebugEnabled()){
        return;
      }
    }catch(err){
      return;
    }
    console.debug('Debug: axisControls ' + message, payload || {});
  }

  function scheduleActivePanelRefresh(reason, payload){
    if(!panelEl || panelEl.dataset.open !== '1' || !activeConfig){
      return false;
    }
    if(panelRefreshFrame){
      return true;
    }
    const runRefresh = () => {
      panelRefreshFrame = 0;
      if(!panelEl || panelEl.dataset.open !== '1' || !activeConfig){
        return;
      }
      updatePanelInputs(activeConfig);
      logDebug('panel refreshed', {
        reason: reason || 'external',
        axis: activeConfig.axis,
        scopeId: activeConfig.scopeId,
        payload: payload || null
      });
    };
    if(typeof global.requestAnimationFrame === 'function'){
      panelRefreshFrame = global.requestAnimationFrame(runRefresh);
    }else{
      panelRefreshFrame = global.setTimeout(runRefresh, 0);
    }
    return true;
  }

  function clearHostSizing(host){
    if(!host){ return; }
    host.style.removeProperty('min-width');
    host.style.removeProperty('max-width');
    host.style.removeProperty('width');
    const dock = typeof host.closest === 'function' ? host.closest('.workspace-toolbar__dock') : null;
    if(dock){
      dock.style.removeProperty('min-width');
      dock.style.removeProperty('max-width');
      dock.style.removeProperty('width');
      logDebug('host sizing cleared',{ scopeId: host.dataset?.fontToolbarScope || null, hasDock: true });
    } else {
      logDebug('host sizing cleared',{ scopeId: host.dataset?.fontToolbarScope || null, hasDock: false });
    }
  }

  function ensureDocumentListener(){
    if(hasDocListener || !global.document){ return; }
    global.document.addEventListener('click', evt => {
      if(!panelEl || panelEl.dataset.open !== '1'){ return; }
      const target = evt.target;
      if(panelEl.contains(target)){ return; }
      if(target?.dataset?.axisControl === '1'){ return; }
      if(target?.closest && (target.closest('.shared-color-picker') || target.closest('[data-font-controls-overlay="1"]'))){ return; }
      closePanel('outside');
    });
    hasDocListener = true;
    logDebug('document listener attached');
  }

  function resolveToolbarHost(scopeId){
    if(!global.document){ return null; }
    const doc = global.document;
    const key = scopeId || '__global__';
    if(hostCache.has(key)){
      return hostCache.get(key);
    }
    let button = null;
    const preferredAnchorId = scopeId ? `${scopeId}FontHost` : null;
    if(preferredAnchorId){
      const preferredAnchor = doc.getElementById(preferredAnchorId);
      if(preferredAnchor){
        button = preferredAnchor;
        logDebug('resolveToolbarHost preferred anchor match',{ scopeId: key, anchorId: preferredAnchorId });
      }
    }
    const buttonId = !button && scopeId ? `${scopeId}LoadExample` : null;
    if(!button && buttonId){
      button = doc.getElementById(buttonId);
    }
    if(!button && scopeId){
      const fallbackIds = [];
      if(scopeId === 'venn'){ fallbackIds.push('sample'); }
      fallbackIds.push(`${scopeId}Example`, `${scopeId}Sample`, `${scopeId}FontHost`);
      for(let i = 0; i < fallbackIds.length && !button; i += 1){
        const candidateId = fallbackIds[i];
        if(!candidateId){ continue; }
        const candidate = doc.getElementById(candidateId);
        if(candidate){
          button = candidate;
          logDebug('host fallback matched',{ scopeId: key, candidateId });
        }
      }
    }
    if(!button && scopeId){
      const dataHost = doc.querySelector(`[data-font-toolbar-scope="${key}"]`);
      if(dataHost){
        button = dataHost;
        logDebug('host data attribute match',{ scopeId: key });
      }
    }
    let existingHost = doc.querySelector(`.font-toolbar-host[data-font-toolbar-scope="${key}"]`);
    if(existingHost){
      hostCache.set(key, existingHost);
      logDebug('host reused existing font toolbar',{ scopeId: key });
      return existingHost;
    }
    if(!button){
      logDebug('host missing button',{ scopeId: key });
      hostCache.set(key, null);
      return null;
    }
    const host = doc.createElement('div');
    host.className = 'font-toolbar-host';
    host.dataset.fontToolbarScope = key;
    host.style.display = 'none';
    button.insertAdjacentElement('afterend', host);
    hostCache.set(key, host);
    logDebug('host created',{ scopeId: key, buttonId });
    return host;
  }

  function updateDockActiveState(host, shouldActivate){
    if(!host || !host.parentElement){ return; }
    const dock = host.parentElement;
    if(!dock.classList || !dock.classList.contains('workspace-toolbar__dock')){ return; }
    if(shouldActivate){
      dock.classList.add('workspace-toolbar__dock--active');
      return;
    }
    const hasVisibleHost = dock.querySelector('.font-toolbar-host.font-toolbar-host--visible');
    if(!hasVisibleHost){
      dock.classList.remove('workspace-toolbar__dock--active');
    }
  }

  function updateAxisSectionActiveState(host, isActive){
    if(!host || typeof host.closest !== 'function'){ return; }
    const section = host.closest('.workspace-toolbar__section--dock');
    if(!section || !section.classList){ return; }
    section.classList.toggle('workspace-toolbar__section--axis-active', !!isActive);
  }

  function ensurePanel(){
    if(panelEl || !global.document){ return panelEl; }
    const doc = global.document;
    panelEl = doc.createElement('div');
    panelEl.className = 'workspace-toolbar__panel workspace-toolbar__panel--axis axis-controls-panel';
    panelEl.setAttribute('role', 'toolbar');
    panelEl.setAttribute('aria-label', 'Axis controls');
    panelEl.style.display = 'none';
    panelEl.dataset.open = '0';
    panelEl.hidden = true;

    panelTitleEl = doc.createElement('div');
    panelTitleEl.className = 'workspace-toolbar__panel-title axis-controls-panel__title';
    panelTitleEl.textContent = 'Axis';
    panelEl.appendChild(panelTitleEl);

    const fieldsRowEl = doc.createElement('div');
    fieldsRowEl.className = 'additional-line-controls-panel__row axis-controls-panel__row';
    panelEl.appendChild(fieldsRowEl);

    const tickField = doc.createElement('label');
    tickField.className = 'axis-controls-panel__field additional-line-controls-panel__field';
    tickField.classList.add('axis-controls-panel__field--numeric');
    const tickLabel = doc.createElement('span');
    tickLabel.className = 'axis-controls-panel__field-label additional-line-controls-panel__field-label';
    tickLabel.textContent = 'Tick Interval';
    tickInput = doc.createElement('input');
    tickInput.type = 'number';
    tickInput.min = '0';
    tickInput.step = '0.1';
    tickInput.placeholder = 'Auto';
    tickInput.className = 'axis-controls-panel__input additional-line-controls-panel__input';
    tickInput.classList.add('axis-controls-panel__input--small');
    tickInput.setAttribute('data-undo-ignore','1');
    tickField.appendChild(tickLabel);
    tickField.appendChild(tickInput);
    fieldsRowEl.appendChild(tickField);
    tickFieldEl = tickField;

    const axisLengthField = doc.createElement('div');
    axisLengthField.className = 'axis-controls-panel__field additional-line-controls-panel__field axis-controls-panel__field--length';
    axisLengthField.hidden = true;
    const axisLengthLabel = doc.createElement('span');
    axisLengthLabel.className = 'axis-controls-panel__field-label additional-line-controls-panel__field-label';
    axisLengthLabel.textContent = 'Axis Length';
    axisLengthField.appendChild(axisLengthLabel);

    const axisLengthRow = doc.createElement('div');
    axisLengthRow.className = 'axis-controls-panel__length-row';
    axisLengthInput = doc.createElement('input');
    axisLengthInput.type = 'number';
    axisLengthInput.min = '1';
    axisLengthInput.step = '1';
    axisLengthInput.placeholder = 'px';
    axisLengthInput.className = 'axis-controls-panel__input additional-line-controls-panel__input axis-controls-panel__input--length';
    axisLengthInput.setAttribute('data-undo-ignore', '1');
    axisLengthRow.appendChild(axisLengthInput);
    axisLengthUnitSelect = doc.createElement('select');
    axisLengthUnitSelect.className = 'axis-controls-panel__input axis-controls-panel__input--unit';
    axisLengthUnitSelect.setAttribute('data-undo-ignore', '1');
    const axisLengthPxOption = doc.createElement('option');
    axisLengthPxOption.value = AXIS_LENGTH_UNIT_PX;
    axisLengthPxOption.textContent = 'px';
    axisLengthUnitSelect.appendChild(axisLengthPxOption);
    const axisLengthMmOption = doc.createElement('option');
    axisLengthMmOption.value = AXIS_LENGTH_UNIT_MM;
    axisLengthMmOption.textContent = 'mm';
    axisLengthUnitSelect.appendChild(axisLengthMmOption);
    axisLengthRow.appendChild(axisLengthUnitSelect);
    const axisLengthPreserveLabel = doc.createElement('label');
    axisLengthPreserveLabel.className = 'axis-controls-panel__checkbox-label axis-controls-panel__length-preserve';
    axisLengthPreserveToggleInput = doc.createElement('input');
    axisLengthPreserveToggleInput.type = 'checkbox';
    axisLengthPreserveToggleInput.className = 'axis-controls-panel__checkbox';
    axisLengthPreserveToggleInput.setAttribute('aria-label', 'preserve ratio');
    axisLengthPreserveToggleInput.setAttribute('data-undo-ignore', '1');
    const axisLengthPreserveText = doc.createElement('span');
    axisLengthPreserveText.textContent = 'preserve ratio';
    axisLengthPreserveLabel.appendChild(axisLengthPreserveToggleInput);
    axisLengthPreserveLabel.appendChild(axisLengthPreserveText);
    axisLengthRow.appendChild(axisLengthPreserveLabel);
    axisLengthField.appendChild(axisLengthRow);

    fieldsRowEl.appendChild(axisLengthField);
    axisLengthFieldEl = axisLengthField;

    const datasetSpacingField = doc.createElement('label');
    datasetSpacingField.className = 'axis-controls-panel__field additional-line-controls-panel__field';
    datasetSpacingField.classList.add('axis-controls-panel__field--numeric');
    datasetSpacingField.hidden = true;
    const datasetSpacingLabel = doc.createElement('span');
    datasetSpacingLabel.className = 'axis-controls-panel__field-label additional-line-controls-panel__field-label';
    datasetSpacingLabel.textContent = 'Dataset Spacing';
    datasetSpacingInput = doc.createElement('input');
    datasetSpacingInput.type = 'number';
    datasetSpacingInput.min = '0.05';
    datasetSpacingInput.step = '0.05';
    datasetSpacingInput.placeholder = '1';
    datasetSpacingInput.className = 'axis-controls-panel__input additional-line-controls-panel__input';
    datasetSpacingInput.classList.add('axis-controls-panel__input--small');
    datasetSpacingInput.setAttribute('data-undo-ignore','1');
    datasetSpacingField.appendChild(datasetSpacingLabel);
    datasetSpacingField.appendChild(datasetSpacingInput);
    fieldsRowEl.appendChild(datasetSpacingField);
    datasetSpacingFieldEl = datasetSpacingField;
    datasetSpacingLabelEl = datasetSpacingLabel;

    const minorTicksField = doc.createElement('div');
    minorTicksField.className = 'axis-controls-panel__field additional-line-controls-panel__field axis-controls-panel__field--toggle';
    const minorTicksLabel = doc.createElement('span');
    minorTicksLabel.className = 'axis-controls-panel__field-label additional-line-controls-panel__field-label';
    minorTicksLabel.textContent = 'Minor Ticks';
    minorTicksField.appendChild(minorTicksLabel);

    const minorToggleRow = doc.createElement('div');
    minorToggleRow.className = 'axis-controls-panel__minor-row';

    minorTicksSwitch = doc.createElement('label');
    minorTicksSwitch.className = 'axis-controls-panel__checkbox-chip';
    minorTicksSwitch.dataset.checked = '0';
    minorTicksSwitch.dataset.disabled = '0';

    minorTicksToggleInput = doc.createElement('input');
    minorTicksToggleInput.type = 'checkbox';
    minorTicksToggleInput.className = 'axis-controls-panel__checkbox';
    minorTicksToggleInput.setAttribute('aria-label', 'Toggle minor ticks');
    minorTicksToggleInput.setAttribute('data-undo-ignore','1');
    minorTicksSwitch.appendChild(minorTicksToggleInput);
    minorToggleRow.appendChild(minorTicksSwitch);

    minorTicksSubdivWrapper = doc.createElement('label');
    minorTicksSubdivWrapper.className = 'axis-controls-panel__mini-field';
    minorTicksSubdivWrapper.dataset.disabled = '1';
    const minorSubdivLabel = doc.createElement('span');
    minorSubdivLabel.className = 'axis-controls-panel__mini-field-label';
    minorSubdivLabel.textContent = 'Div';
    minorTicksSubdivInput = doc.createElement('input');
    minorTicksSubdivInput.type = 'number';
    minorTicksSubdivInput.min = String(MIN_MINOR_SUBDIVISIONS);
    minorTicksSubdivInput.max = String(MAX_MINOR_SUBDIVISIONS);
    minorTicksSubdivInput.step = '1';
    minorTicksSubdivInput.value = String(DEFAULT_MINOR_SUBDIVISIONS);
    minorTicksSubdivInput.className = 'axis-controls-panel__input axis-controls-panel__input--xs axis-controls-panel__input--subdivision';
    minorTicksSubdivInput.setAttribute('aria-label', 'Minor tick subdivisions');
    minorTicksSubdivInput.setAttribute('data-undo-ignore','1');
    minorTicksSubdivInput.disabled = true;
    minorTicksSubdivInput.setAttribute('aria-disabled','true');
    minorTicksSubdivWrapper.appendChild(minorSubdivLabel);
    minorTicksSubdivWrapper.appendChild(minorTicksSubdivInput);
    minorToggleRow.appendChild(minorTicksSubdivWrapper);

    minorTicksField.appendChild(minorToggleRow);
    fieldsRowEl.appendChild(minorTicksField);
    minorTicksFieldEl = minorTicksField;

    const styleField = doc.createElement('label');
    styleField.className = 'axis-controls-panel__field additional-line-controls-panel__field additional-line-controls-panel__field--style axis-controls-panel__field--style';
    const styleLabel = doc.createElement('span');
    styleLabel.className = 'axis-controls-panel__field-label additional-line-controls-panel__field-label';
    styleLabel.textContent = 'Thickness';
    const styleControl = doc.createElement('div');
    styleControl.className = 'shared-border-style-control';
    styleChipEl = doc.createElement('button');
    styleChipEl.type = 'button';
    styleChipEl.className = 'shared-border-style-chip';
    styleChipEl.title = 'Click to edit axis line color. Wheel or Alt+drag to adjust line thickness.';
    styleChipPreviewEl = doc.createElement('span');
    styleChipPreviewEl.className = 'shared-border-style-chip-preview';
    styleChipValueEl = doc.createElement('span');
    styleChipValueEl.className = 'shared-border-style-chip-value';
    styleChipEl.appendChild(styleChipPreviewEl);
    styleChipEl.appendChild(styleChipValueEl);
    thicknessInput = doc.createElement('input');
    thicknessInput.type = 'number';
    thicknessInput.min = '0.25';
    thicknessInput.max = '10';
    thicknessInput.step = '0.25';
    thicknessInput.placeholder = '1';
    thicknessInput.className = 'axis-controls-panel__input additional-line-controls-panel__input axis-controls-panel__input--small';
    thicknessInput.setAttribute('data-undo-ignore','1');
    thicknessInput.hidden = true;
    colorInput = doc.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'shared-border-style-input axis-controls-panel__color-input';
    colorInput.setAttribute('data-undo-ignore','1');
    styleControl.appendChild(styleChipEl);
    styleControl.appendChild(colorInput);
    styleField.appendChild(styleLabel);
    // Keep thickness input in DOM for shared event wiring while using the style chip UI.
    styleField.appendChild(thicknessInput);
    styleField.appendChild(styleControl);
    fieldsRowEl.appendChild(styleField);

    const notationField = doc.createElement('label');
    notationField.className = 'axis-controls-panel__field additional-line-controls-panel__field axis-controls-panel__field--notation';
    const notationLabel = doc.createElement('span');
    notationLabel.className = 'axis-controls-panel__field-label additional-line-controls-panel__field-label';
    notationLabel.textContent = 'Number Format';
    notationField.appendChild(notationLabel);

    notationComboWrapper = doc.createElement('div');
    notationComboWrapper.className = 'font-controls-panel__combo axis-controls-panel__notation-combo';

    const notationComboRow = doc.createElement('div');
    notationComboRow.className = 'font-controls-panel__combo-row';
    notationDisplayInput = doc.createElement('input');
    notationDisplayInput.type = 'text';
    notationDisplayInput.className = 'font-controls-panel__input font-controls-panel__input--combo axis-controls-panel__notation-display';
    notationDisplayInput.value = getNotationLabel(AXIS_NOTATION_DEFAULT);
    notationDisplayInput.readOnly = true;
    notationDisplayInput.setAttribute('tabindex','-1');
    notationDisplayInput.setAttribute('aria-hidden','true');
    notationDisplayInput.setAttribute('data-undo-ignore','1');
    notationComboRow.appendChild(notationDisplayInput);

    notationMenuToggle = doc.createElement('button');
    notationMenuToggle.type = 'button';
    notationMenuToggle.className = 'font-controls-panel__combo-toggle axis-controls-panel__notation-toggle';
    notationMenuToggle.setAttribute('aria-label', 'Choose number format');
    notationMenuToggle.setAttribute('aria-haspopup', 'listbox');
    notationMenuToggle.setAttribute('aria-expanded', 'false');
    notationMenuToggle.setAttribute('data-undo-ignore','1');
    notationComboRow.appendChild(notationMenuToggle);

    notationComboWrapper.appendChild(notationComboRow);

    notationMenuPopup = doc.createElement('div');
    notationMenuPopup.className = 'font-controls-panel__combo-menu axis-controls-panel__notation-menu';
    notationMenuPopup.setAttribute('role', 'listbox');
    notationMenuPopup.setAttribute('aria-label', 'Number format');
    notationMenuPopup.hidden = true;

    AXIS_NOTATION_OPTIONS.forEach(opt => {
      const optionEl = doc.createElement('button');
      optionEl.type = 'button';
      optionEl.className = 'font-controls-panel__combo-option';
      optionEl.dataset.value = opt.value;
      optionEl.textContent = opt.label;
      optionEl.setAttribute('role', 'option');
      optionEl.setAttribute('tabindex', '-1');
      optionEl.addEventListener('mousedown', evt => { evt.preventDefault(); });
      optionEl.addEventListener('click', () => { handleNotationOptionSelect(opt.value); });
      optionEl.addEventListener('keydown', evt => {
        if(evt.key === 'ArrowDown'){
          evt.preventDefault();
          const options = notationMenuPopup ? Array.from(notationMenuPopup.querySelectorAll('.font-controls-panel__combo-option')) : [];
          const idx = options.indexOf(optionEl);
          focusNotationOptionByIndex(idx + 1);
        }else if(evt.key === 'ArrowUp'){
          evt.preventDefault();
          const options = notationMenuPopup ? Array.from(notationMenuPopup.querySelectorAll('.font-controls-panel__combo-option')) : [];
          const idx = options.indexOf(optionEl);
          focusNotationOptionByIndex(idx - 1);
        }else if(evt.key === 'Home'){
          evt.preventDefault();
          focusNotationOptionByIndex(0);
        }else if(evt.key === 'End'){
          evt.preventDefault();
          if(notationMenuPopup){
            const opts = notationMenuPopup.querySelectorAll('.font-controls-panel__combo-option');
            focusNotationOptionByIndex(opts.length - 1);
          }
        }else if(evt.key === 'Escape'){
          evt.preventDefault();
          closeNotationMenu('escape');
          if(notationMenuToggle){ notationMenuToggle.focus(); }
        }else if(evt.key === 'Enter' || evt.key === ' '){
          evt.preventDefault();
          handleNotationOptionSelect(opt.value);
        }
      });
      notationMenuPopup.appendChild(optionEl);
    });

    notationComboWrapper.appendChild(notationMenuPopup);
    setNotationDisplayValue(AXIS_NOTATION_DEFAULT);
    notationField.appendChild(notationComboWrapper);
    fieldsRowEl.appendChild(notationField);
    notationFieldEl = notationField;

    additionalTicksFieldEl = doc.createElement('div');
    additionalTicksFieldEl.className = 'axis-controls-panel__field additional-line-controls-panel__field axis-controls-panel__field--additional-ticks';
    additionalTicksFieldEl.hidden = true;

    additionalTicksButton = doc.createElement('button');
    additionalTicksButton.type = 'button';
    additionalTicksButton.className = 'axis-controls-panel__button axis-controls-panel__button--additional-ticks';
    additionalTicksButton.textContent = 'Additional ticks/lines';
    additionalTicksButton.disabled = true;
    additionalTicksButton.setAttribute('aria-expanded', 'false');
    additionalTicksButton.setAttribute('aria-disabled', 'true');
    additionalTicksButton.setAttribute('aria-haspopup', 'dialog');
    additionalTicksButton.setAttribute('data-undo-ignore', '1');
    additionalTicksFieldEl.appendChild(additionalTicksButton);

    additionalTicksDropdown = doc.createElement('div');
    additionalTicksDropdown.className = 'axis-controls-panel__dropdown axis-controls-panel__dropdown--additional-ticks';
    additionalTicksDropdown.hidden = true;
    additionalTicksDropdown.dataset.open = '0';
    additionalTicksFieldEl.appendChild(additionalTicksDropdown);

    additionalTicksContainer = doc.createElement('div');
    additionalTicksContainer.className = 'axis-controls-panel__extras-container';
    additionalTicksDropdown.appendChild(additionalTicksContainer);

    additionalTicksAddButton = doc.createElement('button');
    additionalTicksAddButton.type = 'button';
    additionalTicksAddButton.className = 'axis-controls-panel__button axis-controls-panel__button--add-extra';
    additionalTicksAddButton.textContent = '+ Add Mark';
    additionalTicksAddButton.setAttribute('data-undo-ignore', '1');
    additionalTicksAddButton.disabled = true;
    additionalTicksAddButton.setAttribute('aria-disabled', 'true');
    additionalTicksDropdown.appendChild(additionalTicksAddButton);

    fieldsRowEl.appendChild(additionalTicksFieldEl);

    // Broken axis controls
    brokenAxisFieldEl = doc.createElement('div');
    brokenAxisFieldEl.className = 'axis-controls-panel__field additional-line-controls-panel__field axis-controls-panel__field--broken-axis';
    brokenAxisFieldEl.hidden = true;

    const brokenAxisHeader = doc.createElement('div');
    brokenAxisHeader.className = 'axis-controls-panel__broken-axis-header';
    brokenAxisFieldEl.appendChild(brokenAxisHeader);

    brokenAxisConfigButton = doc.createElement('button');
    brokenAxisConfigButton.type = 'button';
    brokenAxisConfigButton.className = 'axis-controls-panel__button axis-controls-panel__button--segments-toggle axis-controls-panel__button--break-axis';
    brokenAxisConfigButton.textContent = 'Break axis';
    brokenAxisConfigButton.disabled = true;
    brokenAxisConfigButton.setAttribute('aria-expanded', 'false');
    brokenAxisConfigButton.setAttribute('aria-disabled', 'true');
    brokenAxisConfigButton.setAttribute('aria-haspopup', 'dialog');
    brokenAxisConfigButton.setAttribute('data-undo-ignore', '1');
    brokenAxisFieldEl.appendChild(brokenAxisConfigButton);

    brokenAxisDropdown = doc.createElement('div');
    brokenAxisDropdown.className = 'axis-controls-panel__dropdown';
    brokenAxisDropdown.hidden = true;
    brokenAxisDropdown.dataset.open = '0';
    brokenAxisFieldEl.appendChild(brokenAxisDropdown);

    const brokenAxisCheckboxLabel = doc.createElement('label');
    brokenAxisCheckboxLabel.className = 'axis-controls-panel__checkbox-label';
    brokenAxisCheckbox = doc.createElement('input');
    brokenAxisCheckbox.type = 'checkbox';
    brokenAxisCheckbox.className = 'axis-controls-panel__checkbox';
    brokenAxisCheckbox.setAttribute('data-undo-ignore', '1');
    const brokenAxisLabelText = doc.createElement('span');
    brokenAxisLabelText.textContent = 'Enable Broken Axis';
    brokenAxisCheckboxLabel.appendChild(brokenAxisCheckbox);
    brokenAxisCheckboxLabel.appendChild(brokenAxisLabelText);
    brokenAxisDropdown.appendChild(brokenAxisCheckboxLabel);

    brokenAxisSegmentsContainer = doc.createElement('div');
    brokenAxisSegmentsContainer.className = 'axis-controls-panel__segments-container';
    brokenAxisDropdown.appendChild(brokenAxisSegmentsContainer);

    brokenAxisAddButton = doc.createElement('button');
    brokenAxisAddButton.type = 'button';
    brokenAxisAddButton.className = 'axis-controls-panel__button axis-controls-panel__button--add-segment';
    brokenAxisAddButton.textContent = '+ Add Break';
    brokenAxisAddButton.setAttribute('data-undo-ignore', '1');
    brokenAxisAddButton.disabled = true;
    brokenAxisAddButton.setAttribute('aria-disabled', 'true');
    brokenAxisDropdown.appendChild(brokenAxisAddButton);

    fieldsRowEl.appendChild(brokenAxisFieldEl);

    if(notationDisplayInput){
      notationDisplayInput.addEventListener('click', evt => {
        evt.preventDefault();
        if(notationFieldEl?.dataset?.disabled === '1'){ return; }
        toggleNotationMenu('display-click');
        if(notationMenuToggle && !notationMenuToggle.disabled){
          notationMenuToggle.focus();
        }
      });
    }
    if(notationMenuToggle){
      notationMenuToggle.addEventListener('mousedown', evt => { evt.preventDefault(); });
      notationMenuToggle.addEventListener('click', () => {
        if(notationMenuToggle.disabled){ return; }
        toggleNotationMenu('button-click');
      });
      notationMenuToggle.addEventListener('keydown', evt => {
        if(notationMenuToggle.disabled){ return; }
        if(evt.key === 'ArrowDown' || evt.key === 'ArrowUp'){
          evt.preventDefault();
          openNotationMenu('button-arrow');
        }else if(evt.key === 'Escape' && notationMenuVisible){
          evt.preventDefault();
          closeNotationMenu('button-escape');
        }else if(evt.key === 'Enter' || evt.key === ' '){
          evt.preventDefault();
          toggleNotationMenu('button-enter');
        }
      });
    }

    panelEl.addEventListener('click', evt => {
      if(notationMenuVisible && (!notationFieldEl || !notationFieldEl.contains(evt.target))){
        closeNotationMenu('panel-click');
      }
      if(brokenAxisConfigExpanded && brokenAxisDropdown){
        const insideDropdown = brokenAxisDropdown.contains(evt.target);
        const onToggle = brokenAxisConfigButton && brokenAxisConfigButton.contains(evt.target);
        if(!insideDropdown && !onToggle){
          setBrokenAxisConfigExpanded(false);
        }
      }
      if(additionalTicksConfigExpanded && additionalTicksDropdown){
        const insideExtraDropdown = additionalTicksDropdown.contains(evt.target);
        const onExtraToggle = additionalTicksButton && additionalTicksButton.contains(evt.target);
        if(!insideExtraDropdown && !onExtraToggle){
          setAdditionalTicksConfigExpanded(false);
        }
      }
    });

    panelEl.addEventListener('keydown', evt => {
      if(evt.key !== 'Escape'){ return; }
      let handled = false;
      if(notationMenuVisible){
        closeNotationMenu('panel-escape');
        if(notationMenuToggle && !notationMenuToggle.disabled){
          notationMenuToggle.focus();
        }
        handled = true;
      }
      if(brokenAxisConfigExpanded){
        setBrokenAxisConfigExpanded(false);
        if(brokenAxisConfigButton && !brokenAxisConfigButton.disabled){
          brokenAxisConfigButton.focus();
        }
        handled = true;
      }
      if(additionalTicksConfigExpanded){
        setAdditionalTicksConfigExpanded(false);
        if(additionalTicksButton && !additionalTicksButton.disabled){
          additionalTicksButton.focus();
        }
        handled = true;
      }
      if(handled){
        evt.preventDefault();
        evt.stopPropagation();
      }
    });

    if(minorTicksToggleInput){
      minorTicksToggleInput.addEventListener('change', () => {
        if(applyingFromUndo){ return; }
        if(!activeConfig){ return; }
        if(!isMinorTicksSupported(activeConfig)){
          minorTicksToggleInput.checked = false;
          return;
        }
        const config = activeConfig;
        const previousValue = config.getMinorTicksEnabled ? !!config.getMinorTicksEnabled(config.axis) : false;
        const requestedValue = !!minorTicksToggleInput.checked;
        logDebug('minor ticks toggle change',{ axis: config.axis, requestedValue });
        if(config.onMinorTicksChange){
          config.onMinorTicksChange(requestedValue, config.axis);
        }
        const resolvedNext = config.getMinorTicksEnabled ? !!config.getMinorTicksEnabled(config.axis) : requestedValue;
        syncPanelInputsFromConfig(config);
        recordAxisStateChange(
          config,
          'minorTicks',
          previousValue,
          resolvedNext,
          value => {
            if(config.onMinorTicksChange){
              config.onMinorTicksChange(!!value, config.axis);
            }
          },
          (a, b) => !!a === !!b
        );
      });
    }

    if(minorTicksSubdivInput){
      minorTicksSubdivInput.addEventListener('change', () => {
        if(applyingFromUndo){ return; }
        if(!activeConfig){ return; }
        if(!isMinorTicksSupported(activeConfig)){
          minorTicksSubdivInput.value = String(DEFAULT_MINOR_SUBDIVISIONS);
          return;
        }
        const config = activeConfig;
        if(typeof config.onMinorTickSubdivisionsChange !== 'function'){
          return;
        }
        const previousValue = sanitizeMinorSubdivisionValue(
          config.getMinorTickSubdivisions ? config.getMinorTickSubdivisions(config.axis) : DEFAULT_MINOR_SUBDIVISIONS
        );
        const requestedValue = sanitizeMinorSubdivisionValue(minorTicksSubdivInput.value);
        logDebug('minor tick subdivisions change',{ axis: config.axis, requestedValue });
        if(config.onMinorTickSubdivisionsChange){
          config.onMinorTickSubdivisionsChange(requestedValue, config.axis);
        }
        const nextValue = sanitizeMinorSubdivisionValue(
          config.getMinorTickSubdivisions ? config.getMinorTickSubdivisions(config.axis) : requestedValue
        );
        minorTicksSubdivInput.value = String(nextValue);
        syncPanelInputsFromConfig(config);
        recordAxisStateChange(
          config,
          'minorSubdivisions',
          previousValue,
          nextValue,
          value => {
            if(config.onMinorTickSubdivisionsChange){
              config.onMinorTickSubdivisionsChange(sanitizeMinorSubdivisionValue(value), config.axis);
            }
          }
        );
      });
    }

    tickInput.addEventListener('change', () => {
      if(applyingFromUndo){ return; }
      if(!activeConfig || tickInput.disabled){ return; }
      const config = activeConfig;
      const raw = tickInput.value;
      const previousValue = sanitizeTickValue(config.getTickInterval ? config.getTickInterval(config.axis) : null);
      const requestedValue = sanitizeTickValue(raw);
      logDebug('tick interval change',{ raw, value: requestedValue, axis: config.axis });
      if(config.onTickIntervalChange){
        config.onTickIntervalChange(requestedValue, config.axis);
      }
      const nextValue = sanitizeTickValue(config.getTickInterval ? config.getTickInterval(config.axis) : null);
      syncPanelInputsFromConfig(config);
      recordAxisStateChange(
        config,
        'tick',
        previousValue,
        nextValue,
        value => {
          if(config.onTickIntervalChange){
            config.onTickIntervalChange(value, config.axis);
          }
        }
      );
    });

    if(datasetSpacingInput){
      datasetSpacingInput.addEventListener('change', () => {
        if(applyingFromUndo){ return; }
        if(!activeConfig || datasetSpacingInput.disabled){ return; }
        const config = activeConfig;
        if(typeof config.onDatasetSpacingChange !== 'function'){
          return;
        }
        const raw = datasetSpacingInput.value;
        const previousValue = sanitizeDatasetSpacingValue(config.getDatasetSpacing ? config.getDatasetSpacing(config.axis) : null);
        const requestedValue = sanitizeDatasetSpacingValue(raw);
        logDebug('dataset spacing change',{ raw, value: requestedValue, axis: config.axis });
        config.onDatasetSpacingChange(requestedValue, config.axis);
        const nextValue = sanitizeDatasetSpacingValue(config.getDatasetSpacing ? config.getDatasetSpacing(config.axis) : null);
        syncPanelInputsFromConfig(config);
        recordAxisStateChange(
          config,
          'datasetSpacing',
          previousValue,
          nextValue,
          value => {
            if(config.onDatasetSpacingChange){
              config.onDatasetSpacingChange(value, config.axis);
            }
          }
        );
      });
    }

    if(axisLengthUnitSelect){
      axisLengthUnitSelect.addEventListener('change', () => {
        if(!activeConfig){ return; }
        const config = activeConfig;
        const uiState = getAxisLengthUiState(config);
        uiState.unit = sanitizeAxisLengthUnit(axisLengthUnitSelect.value);
        axisLengthUnitSelect.value = uiState.unit;
        syncPanelInputsFromConfig(config);
        logDebug('axis length unit changed', {
          axis: config.axis,
          scopeId: config.scopeId,
          unit: uiState.unit
        });
      });
    }

    if(axisLengthPreserveToggleInput){
      axisLengthPreserveToggleInput.addEventListener('change', () => {
        if(!activeConfig){ return; }
        const config = activeConfig;
        const uiState = getAxisLengthUiState(config);
        uiState.preserveProportions = axisLengthPreserveToggleInput.checked === true;
        logDebug('axis length preserve toggle', {
          axis: config.axis,
          scopeId: config.scopeId,
          preserveProportions: uiState.preserveProportions
        });
      });
    }

    if(axisLengthInput){
      axisLengthInput.addEventListener('change', () => {
        if(applyingFromUndo){ return; }
        if(!activeConfig || axisLengthInput.disabled){ return; }
        const config = activeConfig;
        if(typeof config.onAxisLengthChange !== 'function' || typeof config.getAxisLength !== 'function'){
          syncPanelInputsFromConfig(config);
          return;
        }
        const uiState = getAxisLengthUiState(config);
        const unit = sanitizeAxisLengthUnit(uiState.unit);
        const preserveAtChange = uiState.preserveProportions === true;
        const requestedPx = convertAxisLengthToPx(axisLengthInput.value, unit);
        if(requestedPx == null){
          syncPanelInputsFromConfig(config);
          return;
        }
        const previousLengthPx = readAxisLengthPx(config);
        const previousSize = readGraphSizeSnapshot(config);
        logDebug('axis length change requested', {
          axis: config.axis,
          scopeId: config.scopeId,
          unit,
          requestedInput: axisLengthInput.value,
          requestedPx,
          preserveProportions: preserveAtChange
        });
        config.onAxisLengthChange(requestedPx, config.axis, {
          unit,
          preserveProportions: preserveAtChange,
          reason: 'axis-length-input'
        });
        const nextLengthPx = readAxisLengthPx(config);
        const nextSize = readGraphSizeSnapshot(config);
        syncPanelInputsFromConfig(config);
        const canRecordGraphSizeUndo = previousSize && nextSize && typeof config.onGraphSizeChange === 'function';
        if(canRecordGraphSizeUndo){
          recordAxisStateChange(
            config,
            'axisLengthSize',
            previousSize,
            nextSize,
            value => {
              if(config.onGraphSizeChange){
                config.onGraphSizeChange(value, config.axis, {
                  reason: 'axis-length-undo'
                });
              }
            },
            areGraphSizeSnapshotsEqual
          );
          return;
        }
        recordAxisStateChange(
          config,
          'axisLength',
          previousLengthPx,
          nextLengthPx,
          value => {
            if(config.onAxisLengthChange){
              config.onAxisLengthChange(value, config.axis, {
                unit: AXIS_LENGTH_UNIT_PX,
                preserveProportions: preserveAtChange,
                reason: 'axis-length-undo'
              });
            }
          },
          (a, b) => {
            const left = sanitizeAxisLengthValue(a);
            const right = sanitizeAxisLengthValue(b);
            if(left == null || right == null){
              return left === right;
            }
            return areNumbersClose(left, right, 1e-6);
          }
        );
      });
    }

    const applyThicknessFromInput = (recordUndo) => {
      if(applyingFromUndo){ return; }
      if(!activeConfig){ return; }
      const config = activeConfig;
      const raw = thicknessInput.value;
      const previousValue = sanitizeThicknessValue(config.getThickness ? config.getThickness() : null);
      const requestedValue = sanitizeThicknessValue(raw);
      logDebug('thickness change',{ raw, numeric: requestedValue, recordUndo: !!recordUndo });
      if(config.onThicknessChange){
        config.onThicknessChange(requestedValue);
      }
      const nextValue = sanitizeThicknessValue(config.getThickness ? config.getThickness() : null);
      syncPanelInputsFromConfig(config);
      if(recordUndo){
        recordAxisStateChange(
          config,
          'thickness',
          previousValue,
          nextValue,
          value => {
            if(config.onThicknessChange){
              config.onThicknessChange(value);
            }
          }
        );
      }
    };
    thicknessInput.addEventListener('input', () => applyThicknessFromInput(false));
    thicknessInput.addEventListener('change', () => applyThicknessFromInput(true));

    if(styleChipEl){
      styleChipEl.addEventListener('wheel', evt => {
        evt.preventDefault();
        const step = evt.deltaY < 0 ? 0.5 : -0.5;
        const current = sanitizeThicknessValue(thicknessInput?.value);
        const next = (current == null ? 0 : current) + step;
        thicknessInput.value = String(next);
        thicknessInput.dispatchEvent(new Event('input', { bubbles: true }));
      }, { passive: false });
      const onStyleDragMove = evt => {
        if(!styleDragState){ return; }
        const deltaX = evt.clientX - styleDragState.startX;
        const steps = Math.round(deltaX / 8);
        const next = styleDragState.startValue + (steps * 0.5);
        thicknessInput.value = String(next);
        thicknessInput.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const onStyleDragUp = () => {
        if(!styleDragState){ return; }
        styleDragState = null;
        thicknessInput.dispatchEvent(new Event('change', { bubbles: true }));
        global.removeEventListener('mousemove', onStyleDragMove);
        global.removeEventListener('mouseup', onStyleDragUp);
      };
      styleChipEl.addEventListener('mousedown', evt => {
        if(!evt.altKey || evt.button !== 0){ return; }
        evt.preventDefault();
        suppressStyleChipClick = true;
        const current = sanitizeThicknessValue(thicknessInput?.value);
        styleDragState = { startX: evt.clientX, startValue: current == null ? 0 : current };
        global.addEventListener('mousemove', onStyleDragMove);
        global.addEventListener('mouseup', onStyleDragUp);
      });
      styleChipEl.addEventListener('click', evt => {
        if(!suppressStyleChipClick){ return; }
        suppressStyleChipClick = false;
        evt.preventDefault();
        evt.stopPropagation();
      }, true);
      if(typeof Shared.openColorPicker === 'function'){
        styleChipEl.addEventListener('click', evt => {
          evt.preventDefault();
          evt.stopPropagation();
          const overlayEl = Shared.openColorPicker({
            anchor: styleChipEl,
            color: colorInput.value,
            element: colorInput,
            onInput(value){
              colorInput.value = value;
              colorInput.dispatchEvent(new Event('input', { bubbles: true }));
            },
            onChange(value){
              colorInput.value = value;
              colorInput.dispatchEvent(new Event('input', { bubbles: true }));
            },
            onClose(){
              if(typeof stylePickerCleanup === 'function'){
                stylePickerCleanup();
                stylePickerCleanup = null;
              }
            }
          });
          stylePickerCleanup = attachAxisStylePickerThicknessSection(overlayEl);
        });
      }else if(typeof Shared.attachColorPickerNear === 'function'){
        Shared.attachColorPickerNear(colorInput);
        styleChipEl.addEventListener('click', evt => {
          evt.preventDefault();
          colorInput.click();
        });
      }
    }

    colorInput.addEventListener('input', () => {
      if(applyingFromUndo){ return; }
      if(!activeConfig){ return; }
      const config = activeConfig;
      const previousValue = sanitizeColorState(config.getColor ? config.getColor() : null);
      const raw = colorInput.value || null;
      const requestedValue = sanitizeColorState(raw);
      logDebug('color change',{ value: requestedValue });
      if(config.onColorChange){
        config.onColorChange(requestedValue);
      }
      const nextValue = sanitizeColorState(config.getColor ? config.getColor() : null);
      syncPanelInputsFromConfig(config);
      recordAxisStateChange(
        config,
        'color',
        previousValue,
        nextValue,
        value => {
          if(config.onColorChange){
            config.onColorChange(value);
          }
        },
        (a, b) => normalizeColorForCompare(a) === normalizeColorForCompare(b)
      );
      syncStyleChipUi();
    });

    // Broken axis event listeners
    if(brokenAxisCheckbox){
      brokenAxisCheckbox.addEventListener('change', () => {
        if(applyingFromUndo){ return; }
        if(!activeConfig){ return; }
        const config = activeConfig;
        if(typeof config.onBrokenAxisEnabledChange !== 'function'){ return; }
        const enabled = brokenAxisCheckbox.checked;
        logDebug('broken axis enabled change',{ enabled });
        config.onBrokenAxisEnabledChange(enabled, config.axis);
        if(enabled && typeof config.getBrokenAxisSegments === 'function' && typeof config.onBrokenAxisAddSegment === 'function'){
          const currentSegments = config.getBrokenAxisSegments(config.axis) || [];
          if(!currentSegments.length){
            const bounds = resolveAxisBounds(config);
            const seeded = buildInitialBrokenAxisSegments(bounds);
            logDebug('broken axis auto segments',{ count: 2, seeded: !!seeded, bounds });
            config.onBrokenAxisAddSegment(config.axis);
            config.onBrokenAxisAddSegment(config.axis);
            if(
              seeded &&
              typeof config.onBrokenAxisSegmentChange === 'function'
            ){
              config.onBrokenAxisSegmentChange(config.axis, 0, seeded[0]);
              config.onBrokenAxisSegmentChange(config.axis, 1, seeded[1]);
            }
          }
        }
        syncPanelInputsFromConfig(config);
      });
    }

    if(brokenAxisAddButton){
      brokenAxisAddButton.addEventListener('click', () => {
        if(applyingFromUndo){ return; }
        if(!activeConfig){ return; }
        const config = activeConfig;
        if(typeof config.onBrokenAxisAddSegment !== 'function'){ return; }
        logDebug('broken axis add segment');
        config.onBrokenAxisAddSegment(config.axis);
        syncPanelInputsFromConfig(config);
      });
    }

    if(brokenAxisConfigButton){
      brokenAxisConfigButton.addEventListener('click', () => {
        if(brokenAxisConfigButton.disabled){ return; }
        setAdditionalTicksConfigExpanded(false);
        setBrokenAxisConfigExpanded(!brokenAxisConfigExpanded);
        if(activeConfig){
          renderBrokenAxisSegments(activeConfig);
        }
      });
    }

    if(additionalTicksButton){
      additionalTicksButton.addEventListener('click', () => {
        if(additionalTicksButton.disabled){ return; }
        setBrokenAxisConfigExpanded(false);
        setAdditionalTicksConfigExpanded(!additionalTicksConfigExpanded);
        if(activeConfig){
          renderAdditionalTickRows(activeConfig);
        }
      });
    }

    if(additionalTicksAddButton){
      additionalTicksAddButton.addEventListener('click', evt => {
        evt.preventDefault();
        evt.stopPropagation();
        if(applyingFromUndo){ return; }
        if(!activeConfig){ return; }
        const config = activeConfig;
        if(typeof config.onAdditionalTickAdd !== 'function'){ return; }
        logDebug('additional tick add',{ axis: config.axis });
        config.onAdditionalTickAdd(config.axis);
        syncPanelInputsFromConfig(config);
        setAdditionalTicksConfigExpanded(true);
      });
    }

    // notation combo listeners defined above

    ensureDocumentListener();
    logDebug('panel created');
    return panelEl;
  }

  function updateOverlayBounds(target, overlay, padding){
    if(!target || !overlay || typeof target.getBBox !== 'function'){ return null; }
    let bbox;
    try {
      bbox = target.getBBox();
    } catch(err){
      logDebug('overlay bbox failed',{ error: err && err.message });
      return null;
    }
    if(!bbox || !Number.isFinite(bbox.width) || !Number.isFinite(bbox.height)){ return null; }
    const pad = Number.isFinite(padding) ? padding : 5;
    const inflate = Math.max(2, pad);
    const width = Math.max(1, bbox.width + inflate * 2);
    const height = Math.max(1, bbox.height + inflate * 2);
    overlay.setAttribute('x', String(bbox.x - inflate));
    overlay.setAttribute('y', String(bbox.y - inflate));
    overlay.setAttribute('width', String(width));
    overlay.setAttribute('height', String(height));
    return { width, height, inflate };
  }

  function ensureAxisOverlay(axisElement){
    if(!axisElement || axisElement.__axisControlOverlay){
      if(axisElement && axisElement.__axisControlOverlay){
        const info = axisElement.__axisControlOverlay;
        updateOverlayBounds(axisElement, info.element, info.padding);
        return info;
      }
      return null;
    }
    const svg = axisElement.ownerSVGElement;
    if(!svg || typeof svg.ownerDocument?.createElementNS !== 'function'){ return null; }
    const overlay = svg.ownerDocument.createElementNS(SVG_NS, 'rect');
    overlay.setAttribute('fill', 'transparent');
    overlay.setAttribute('pointer-events', 'fill');
    overlay.dataset.axisControl = '1';
    overlay.style.cursor = 'pointer';
    const parent = axisElement.parentNode;
    if(parent && typeof parent.insertBefore === 'function'){
      parent.insertBefore(overlay, axisElement.nextSibling);
    } else {
      logDebug('overlay missing parent',{ hasParent: !!parent });
      return null;
    }
    const padding = 6;
    const bounds = updateOverlayBounds(axisElement, overlay, padding);
    const observer = typeof MutationObserver === 'function'
      ? new MutationObserver(() => { updateOverlayBounds(axisElement, overlay, padding); })
      : null;
    if(observer){
      observer.observe(axisElement, { attributes: true, attributeFilter: ['x1','y1','x2','y2','transform','x','y','width','height'] });
    }
    let removalObserver = null;
    if(parent && typeof MutationObserver === 'function'){
      removalObserver = new MutationObserver(records => {
        for(let i = 0; i < records.length; i += 1){
          const record = records[i];
          if(record.type !== 'childList'){ continue; }
          const removed = Array.from(record.removedNodes || []);
          if(removed.includes(axisElement) || removed.includes(overlay)){
            if(observer){ observer.disconnect(); }
            if(removalObserver){ removalObserver.disconnect(); }
            overlay.remove();
            axisElement.__axisControlOverlay = null;
            return;
          }
        }
      });
      removalObserver.observe(parent, { childList: true });
    }
    const overlayInfo = {
      element: overlay,
      observer,
      removalObserver,
      padding,
      meta: bounds
    };
    axisElement.__axisControlOverlay = overlayInfo;
    logDebug('axis overlay ensured',{ inflate: bounds ? bounds.inflate : null });
    return overlayInfo;
  }

  function closePanel(reason){
    if(!panelEl){ return; }
    if(panelRefreshFrame){
      if(typeof global.cancelAnimationFrame === 'function'){
        global.cancelAnimationFrame(panelRefreshFrame);
      }else{
        global.clearTimeout(panelRefreshFrame);
      }
      panelRefreshFrame = 0;
    }
    if(typeof stylePickerCleanup === 'function'){
      try{ stylePickerCleanup(); }catch(err){}
      stylePickerCleanup = null;
    }
    closeNotationMenu(reason || 'panel-close');
    panelEl.style.display = 'none';
    panelEl.hidden = true;
    panelEl.dataset.open = '0';
    if(activeHost){
      updateAxisSectionActiveState(activeHost, false);
      activeHost.classList.remove('font-toolbar-host--axis');
      const fontPanel = activeHost.querySelector('.font-controls-panel');
      const additionalLinePanel = activeHost.querySelector('.additional-line-controls-panel');
      const significancePanel = activeHost.querySelector('.significance-controls-panel');
      const dendrogramPanel = activeHost.querySelector('.dendrogram-controls-panel');
      const gridPanel = activeHost.querySelector('.grid-controls-panel');
      const hasEmbeddedForm = !!activeHost.querySelector('.workspace-toolbar__form, .box-point-controls, [data-point-controls=\"1\"]');
      const additionalLineOpen = !!(additionalLinePanel && additionalLinePanel !== panelEl && additionalLinePanel.dataset.open === '1');
      if((!fontPanel || fontPanel.dataset.open !== '1')
        && (!significancePanel || significancePanel.dataset.open !== '1')
        && (!dendrogramPanel || dendrogramPanel.dataset.open !== '1')
        && (!gridPanel || gridPanel.dataset.open !== '1')
        && !additionalLineOpen
        && !hasEmbeddedForm){
        activeHost.classList.remove('font-toolbar-host--visible');
        activeHost.style.display = 'none';
        updateDockActiveState(activeHost, false);
      }
    }
    try {
      const editHighlight = Shared.editHighlight;
      if(editHighlight && typeof editHighlight.clearAxis === 'function'){
        editHighlight.clearAxis(reason || 'close');
        logDebug('axis highlight cleared via close', { reason });
      }
    } catch(highlightErr){
      console.error('axisControls closePanel highlight error', highlightErr);
    }
    logDebug('panel closed',{ reason });
    activeConfig = null;
    activeHost = null;
  }

  function openPanel(config){
    ensurePanel();
    if(!panelEl){ return; }
    // Close any existing font/per-component FORMAT controls to avoid mixed UI
    try{
      if(Shared && typeof Shared.hideAllFormatControls === 'function'){
        try{ Shared.hideAllFormatControls(); }catch(e){}
      }
    }catch(e){}
    // Also ensure component hosts are hidden and cleaned again before we attach
    try{
      if(Shared && typeof Shared.hideComponentHosts === 'function'){
        try{ Shared.hideComponentHosts(); }catch(e){}
      }
    }catch(e){}
    // (axis panel will open after hiding other FORMAT controls)
    activeConfig = config;
    additionalTicksConfigExpanded = false;
    brokenAxisConfigExpanded = false;
    const host = resolveToolbarHost(config.scopeId);
    if(host){
      // Mount axis controls in a clean host so layout is identical across components
      // (histogram still has legacy toolbar content that can otherwise affect vertical flow).
      try{
        host.innerHTML = '';
      }catch(e){}
      if(panelEl.parentElement !== host){
        host.appendChild(panelEl);
      }
      clearHostSizing(host);
      host.style.display = 'block';
      host.classList.add('font-toolbar-host--visible');
      host.classList.add('font-toolbar-host--axis');
      updateAxisSectionActiveState(host, true);
      updateDockActiveState(host, true);
      activeHost = host;
    } else {
      activeHost = null;
      logDebug('host unavailable for open',{ scopeId: config.scopeId });
    }
    updatePanelInputs(config);
    setAdditionalTicksConfigExpanded(false);
    setBrokenAxisConfigExpanded(false);
    panelEl.style.display = 'flex';
    panelEl.hidden = false;
    panelEl.dataset.open = '1';
    logDebug('panel opened',{ axis: config.axis, scopeId: config.scopeId });
  }

  function resolveAxisResizeTarget(axisElement, config){
    if(config){
      if(typeof config.getResizeTarget === 'function'){
        try{
          const targetFromCallback = config.getResizeTarget(config);
          if(targetFromCallback){
            return targetFromCallback;
          }
        }catch(err){
          logDebug('axis resize target callback failed',{
            axis: config.axis || null,
            scopeId: config.scopeId || null,
            error: err && err.message
          });
        }
      }
      if(config.resizeTarget){
        return config.resizeTarget;
      }
    }
    const svg = axisElement && axisElement.ownerSVGElement ? axisElement.ownerSVGElement : null;
    if(svg && typeof svg.closest === 'function'){
      const svgBox = svg.closest('.svgbox');
      if(svgBox){
        return svgBox;
      }
      const graphScope = svg.closest('.graph-and-options, .graph-panel, .workspace-page');
      if(graphScope && typeof graphScope.querySelector === 'function'){
        const fallbackBox = graphScope.querySelector('.svgbox');
        if(fallbackBox){
          return fallbackBox;
        }
      }
    }
    if(svg && svg.parentElement){
      const parent = svg.parentElement;
      if(parent.classList && parent.classList.contains('svgbox')){
        return parent;
      }
      if(typeof parent.querySelector === 'function'){
        const nested = parent.querySelector('.svgbox');
        if(nested){
          return nested;
        }
      }
    }
    return null;
  }

  function resolveResizeTargetGraphSize(target){
    if(!target || typeof target.getBoundingClientRect !== 'function'){
      return null;
    }
    try{
      const rect = target.getBoundingClientRect();
      const width = sanitizeAxisLengthValue(rect && rect.width);
      const height = sanitizeAxisLengthValue(rect && rect.height);
      if(width == null || height == null){
        return null;
      }
      return { width, height };
    }catch(err){
      logDebug('axis graph size rect failed',{
        error: err && err.message
      });
      return null;
    }
  }

  function resolveAxisLengthBoundsFromTarget(target, axis){
    const api = target && target.__sharedResizableBoxApi;
    if(!api || typeof api.getState !== 'function'){
      return null;
    }
    try{
      const state = api.getState();
      if(!state || typeof state !== 'object'){
        return null;
      }
      if(axis === 'y'){
        return {
          min: sanitizeAxisLengthValue(state.minHeight),
          max: sanitizeAxisLengthValue(state.maxHeight),
          step: 1
        };
      }
      return {
        min: sanitizeAxisLengthValue(state.minWidth),
        max: sanitizeAxisLengthValue(state.maxWidth),
        step: 1
      };
    }catch(err){
      logDebug('axis length bounds from target failed',{
        axis,
        error: err && err.message
      });
      return null;
    }
  }

  function registerAxisElement(element, config){
    if(!element || !config){ return; }
    element.dataset.axisControl = '1';
    element.style.cursor = 'pointer';
    const overlayInfo = ensureAxisOverlay(element);
    const handler = evt => {
      evt.preventDefault();
      evt.stopPropagation();
      logDebug('axis clicked',{ axis: config.axis, scopeId: config.scopeId });
      try {
        const editHighlight = Shared.editHighlight;
        if(editHighlight && typeof editHighlight.highlightAxis === 'function'){
          editHighlight.highlightAxis(element, { overlay: overlayInfo ? overlayInfo.element : null });
          logDebug('axis highlight requested',{ axis: config.axis, scopeId: config.scopeId });
        }
      } catch(highlightErr){
        console.error('axisControls registerAxisElement highlight error', highlightErr);
      }
      let cachedResizeTarget = null;
      const resolveResizeTarget = () => {
        const target = resolveAxisResizeTarget(element, config);
        if(target){
          cachedResizeTarget = target;
          return target;
        }
        return cachedResizeTarget;
      };
      const fallbackGetAxisLength = axisName => {
        const target = resolveResizeTarget();
        const size = resolveResizeTargetGraphSize(target);
        if(!size){
          return null;
        }
        return axisName === 'y' ? size.height : size.width;
      };
      const fallbackGetAxisLengthBounds = axisName => {
        const target = resolveResizeTarget();
        const bounds = resolveAxisLengthBoundsFromTarget(target, axisName);
        if(!bounds){
          return null;
        }
        return bounds;
      };
      const fallbackGetGraphSize = () => {
        const target = resolveResizeTarget();
        return resolveResizeTargetGraphSize(target);
      };
      const fallbackOnAxisLengthChange = (valuePx, axisName, options = {}) => {
        const numericLength = sanitizeAxisLengthValue(valuePx);
        if(numericLength == null){
          return null;
        }
        const target = resolveResizeTarget();
        if(!target || typeof Shared.applyResizableBoxSize !== 'function'){
          logDebug('axis length apply skipped', {
            axis: axisName,
            scopeId: config.scopeId || null,
            hasTarget: !!target,
            hasHelper: typeof Shared.applyResizableBoxSize === 'function'
          });
          return null;
        }
        const axisKey = axisName === 'y' ? 'y' : 'x';
        const request = {
          axis: axisKey,
          width: axisKey === 'x' ? numericLength : undefined,
          height: axisKey === 'y' ? numericLength : undefined,
          reason: options.reason || `axis-length-${axisKey}`,
          updateDefaults: false,
          updateAspectRatio: false,
          preserveAspectLock: true,
          forceExact: true,
          simulateAspectLock: options.preserveProportions === true
        };
        logDebug('axis length apply request', {
          axis: axisKey,
          scopeId: config.scopeId || null,
          request
        });
        return Shared.applyResizableBoxSize(target, request);
      };
      const fallbackOnGraphSizeChange = (nextSize, axisName, options = {}) => {
        const safeSize = sanitizeGraphSizeSnapshot(nextSize);
        if(!safeSize){
          return null;
        }
        const target = resolveResizeTarget();
        if(!target || typeof Shared.applyResizableBoxSize !== 'function'){
          return null;
        }
        return Shared.applyResizableBoxSize(target, {
          axis: 'both',
          width: safeSize.width,
          height: safeSize.height,
          reason: options.reason || `axis-size-${axisName || 'both'}`,
          updateDefaults: false,
          updateAspectRatio: false,
          preserveAspectLock: true,
          forceExact: true
        });
      };
      const openConfig = {
        axis: config.axis,
        scopeId: config.scopeId,
        getTickInterval: config.getTickInterval,
        getThickness: config.getThickness,
        getColor: config.getColor,
        isTickIntervalEnabled: config.isTickIntervalEnabled,
        getTickIntervalDisabledMessage: config.getTickIntervalDisabledMessage,
        tickIntervalDisabledMessage: config.tickIntervalDisabledMessage,
        tickPlaceholder: config.tickPlaceholder,
        onTickIntervalChange: config.onTickIntervalChange,
        getDatasetSpacing: config.getDatasetSpacing,
        onDatasetSpacingChange: config.onDatasetSpacingChange,
        isDatasetSpacingSupported: config.isDatasetSpacingSupported,
        datasetSpacingLabel: config.datasetSpacingLabel,
        datasetSpacingMin: config.datasetSpacingMin,
        datasetSpacingMax: config.datasetSpacingMax,
        datasetSpacingStep: config.datasetSpacingStep,
        datasetSpacingPlaceholder: config.datasetSpacingPlaceholder,
        getMinorTicksEnabled: config.getMinorTicksEnabled,
        onMinorTicksChange: config.onMinorTicksChange,
        isMinorTicksSupported: config.isMinorTicksSupported,
        getMinorTickSubdivisions: config.getMinorTickSubdivisions,
        onMinorTickSubdivisionsChange: config.onMinorTickSubdivisionsChange,
        onThicknessChange: config.onThicknessChange,
        onColorChange: config.onColorChange,
        getNotationMode: config.getNotationMode,
        onNotationChange: config.onNotationChange,
        isNotationSupported: config.isNotationSupported,
        getResizeTarget: config.getResizeTarget || resolveResizeTarget,
        getAxisLength: config.getAxisLength || fallbackGetAxisLength,
        onAxisLengthChange: config.onAxisLengthChange || fallbackOnAxisLengthChange,
        getAxisLengthBounds: config.getAxisLengthBounds || fallbackGetAxisLengthBounds,
        isAxisLengthSupported: config.isAxisLengthSupported || (() => {
          if(typeof config.getAxisLength === 'function' && typeof config.onAxisLengthChange === 'function'){
            return true;
          }
          const target = resolveResizeTarget();
          return !!(target && target.__sharedResizableBoxApi && typeof Shared.applyResizableBoxSize === 'function');
        }),
        getGraphSize: config.getGraphSize || fallbackGetGraphSize,
        onGraphSizeChange: config.onGraphSizeChange || fallbackOnGraphSizeChange,
        isAdditionalTicksSupported: config.isAdditionalTicksSupported,
        getAdditionalTicks: config.getAdditionalTicks,
        onAdditionalTickChange: config.onAdditionalTickChange,
        onAdditionalTickAdd: config.onAdditionalTickAdd,
        onAdditionalTickRemove: config.onAdditionalTickRemove
      };
      if(typeof config.getAxisBounds === 'function'){
        openConfig.getAxisBounds = config.getAxisBounds;
      }else{
        if(config.axisMin !== undefined){
          openConfig.axisMin = config.axisMin;
        }
        if(config.axisMax !== undefined){
          openConfig.axisMax = config.axisMax;
        }
      }
      if(typeof config.getBrokenAxisEnabled === 'function' && typeof config.onBrokenAxisEnabledChange === 'function'){
        openConfig.getBrokenAxisEnabled = config.getBrokenAxisEnabled;
        openConfig.onBrokenAxisEnabledChange = config.onBrokenAxisEnabledChange;
        if(typeof config.getBrokenAxisSegments === 'function'){
          openConfig.getBrokenAxisSegments = config.getBrokenAxisSegments;
        }
        if(typeof config.onBrokenAxisSegmentChange === 'function'){
          openConfig.onBrokenAxisSegmentChange = config.onBrokenAxisSegmentChange;
        }
        if(typeof config.onBrokenAxisAddSegment === 'function'){
          openConfig.onBrokenAxisAddSegment = config.onBrokenAxisAddSegment;
        }
        if(typeof config.onBrokenAxisRemoveSegment === 'function'){
          openConfig.onBrokenAxisRemoveSegment = config.onBrokenAxisRemoveSegment;
        }
      }
      openPanel(openConfig);
    };
    element.addEventListener('click', handler);
    if(overlayInfo){
      overlayInfo.element.addEventListener('click', handler);
    }
    logDebug('axis element registered',{ axis: config.axis, scopeId: config.scopeId, overlay: overlayInfo ? overlayInfo.meta : null });
  }

  axisControls.ensurePanel = ensurePanel;
  axisControls.registerAxisElement = registerAxisElement;
  axisControls.refreshActivePanel = function refreshActivePanel(options = {}){
    if(typeof options === 'string'){
      return scheduleActivePanelRefresh(options, { scopeId: null });
    }
    const scopeFilter = options && options.scopeId ? String(options.scopeId) : '';
    if(scopeFilter && activeConfig && activeConfig.scopeId && String(activeConfig.scopeId) !== scopeFilter){
      return false;
    }
    const reason = options && options.reason ? options.reason : 'external-refresh';
    return scheduleActivePanelRefresh(reason, options || null);
  };
  axisControls.close = closePanel;
})(typeof window !== 'undefined' ? window : globalThis);
