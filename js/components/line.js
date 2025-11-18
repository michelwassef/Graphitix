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
  const formControls = Shared.formControls = Shared.formControls || {};
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
  const DEFAULT_SCATTER_COLORS = global.DEFAULT_SCATTER_COLORS || ['#e41a1c','#377eb8','#4daf4a','#984ea3','#ff7f00','#ffff33','#a65628','#f781bf','#999999'];
  global.DEFAULT_SCATTER_COLORS = DEFAULT_SCATTER_COLORS;
  const LINE_GROUP_SHAPE_OPTIONS = Object.freeze([
    { value: 'circle', label: 'Circle' },
    { value: 'square', label: 'Square' },
    { value: 'triangle', label: 'Triangle' },
    { value: 'diamond', label: 'Diamond' },
    { value: 'cross', label: 'Cross' }
  ]);
  const LINE_GROUP_SHAPE_DEFAULTS = LINE_GROUP_SHAPE_OPTIONS.map(opt => opt.value);
  const LINE_GROUP_SHAPE_VALUES = new Set(LINE_GROUP_SHAPE_DEFAULTS);
  const LINE_DISPLAY_MODE_OPTIONS = Object.freeze(['line','area']);
  let lineDisplayMode = 'line';

  let scheduleLineDraw = () => {};
  let lineHot = null;
  let lineTitleText = 'Line graph';
  let lineXLabelText = 'X';
  let lineYLabelText = 'Y';
  let lineLabelColors = {};
  let lineLegendControl = null;
  const lineUndoManager = Shared.undoManager || null;
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

  function attachLineSelectAutoSize(select, label){
    if(!select){ return; }
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
  let lineFileHandle = null;
  let lineFileName = 'line.graph';
  let lineReplicates = LINE_MIN_REPLICATES;
  let lineLastGroupedReplicateCount = Math.min(LINE_MAX_REPLICATES, Math.max(2, LINE_MIN_REPLICATES + 1));
  let lineLayout = null;
  let lineSeriesGroupLabels = [];
  let lineGroupShapes = [];
  let lineLastRegressionSummaries = [];
  let lineForecastOptions = {
    horizon: DEFAULT_FORECAST_HORIZON,
    seasonLength: DEFAULT_FORECAST_SEASON,
    autoTune: true,
    criterion: 'bic'
  };
  const lineAdvisorState={
    open:false,
    answers:{},
    lastApplied:null,
    context:null
  };

  const DEFAULT_AXIS_COLOR = '#000000';

  function createLineAxisSettings(){
    return {
      strokeWidth: 1,
      color: DEFAULT_AXIS_COLOR,
      x: { tickInterval: null },
      y: { tickInterval: null }
    };
  }

  let lineAxisSettings = createLineAxisSettings();

  function ensureLineAxisSettings(){
    if(!lineAxisSettings || typeof lineAxisSettings !== 'object'){
      lineAxisSettings = createLineAxisSettings();
    }
    if(!lineAxisSettings.x || typeof lineAxisSettings.x !== 'object'){
      lineAxisSettings.x = { tickInterval: null };
    }
    if(!lineAxisSettings.y || typeof lineAxisSettings.y !== 'object'){
      lineAxisSettings.y = { tickInterval: null };
    }
    const strokeNumeric = Number(lineAxisSettings.strokeWidth);
    lineAxisSettings.strokeWidth = Number.isFinite(strokeNumeric) && strokeNumeric > 0 ? strokeNumeric : 1;
    if(typeof lineAxisSettings.color !== 'string' || !lineAxisSettings.color){
      lineAxisSettings.color = DEFAULT_AXIS_COLOR;
    }
    return lineAxisSettings;
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

  function applyLineLegendGuardWidth(requiredWidth){
    const normalized = Number.isFinite(requiredWidth) ? Math.max(0, Math.round(requiredWidth)) : 0;
    const changed = normalized !== lineLegendGuardWidth;
    lineLegendGuardWidth = normalized;
    if(!lineLayout){
      if(changed){
        console.debug('Debug: line legend guard pending layout',{ requiredWidth: normalized });
      }
      return;
    }
    if(!changed){
      return;
    }
    try{
      lineLayout.updateMinSvgWidth?.(normalized);
    }catch(err){
      console.error('line legend guard update error', err);
    }
    try{
      lineLayout.syncPanels?.({ skipSchedule: true, reason: 'legend-guard' });
    }catch(err){
      console.error('line legend guard sync error', err);
    }
    console.debug('Debug: line legend guard width applied',{ requiredWidth: normalized });
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

  console.debug('Debug: line group labels state initialized', {
    initial: lineSeriesGroupLabels,
    replicates: lineReplicates
  }); // Debug: group label state bootstrap

  const refs = {};
  let lineTooltipEl = null;

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
    } else if (node.dataset) {
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
    if(typeof Shared?.formatPValue === 'function'){
      return Shared.formatPValue(p);
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
      console.debug('Debug: line statsAdvisor toggled',{ open:lineAdvisorState.open });
      renderLineStatsAdvisor(null, null, lineAdvisorState.context);
    });
    header.appendChild(toggle);
    wrapper.appendChild(header);
    const summary=document.createElement('div');
    summary.className='stats-advisor__summary';
    if(recommendation.ready){
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

  function computeUsedSeriesColumns(matrix){
    const data = Array.isArray(matrix) ? matrix : [];
    if(!data.length) return 0;
    const header = Array.isArray(data[0]) ? data[0] : [];
    let lastUsed = 0;
    for(let c=1;c<header.length;c++){
      const headerCell = header[c];
      if(headerCell != null && String(headerCell).trim() !== ''){
        lastUsed = c;
        continue;
      }
      for(let r=1;r<data.length;r++){
        const cell = data[r]?.[c];
        if(cell != null && String(cell).trim() !== ''){
          lastUsed = c;
          break;
        }
      }
    }
    console.debug('Debug: computeUsedSeriesColumns',{ lastUsed, headerLength: header.length, rowCount: data.length });
    return lastUsed;
  }

  function sanitizeLineGroupShape(value, index){
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if(LINE_GROUP_SHAPE_VALUES.has(raw)){
      return raw;
    }
    const safeIndex = Number.isInteger(index) ? index : 0;
    return LINE_GROUP_SHAPE_DEFAULTS[safeIndex % LINE_GROUP_SHAPE_DEFAULTS.length];
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
    const radius = Number.isFinite(radiusRaw) && radiusRaw > 0 ? radiusRaw : 1;
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
      const halfBar = bar / 2;
      const path = `M ${cx - halfBar} ${cy - half} L ${cx + halfBar} ${cy - half} L ${cx + halfBar} ${cy - halfBar} L ${cx + half} ${cy - halfBar} L ${cx + half} ${cy + halfBar} L ${cx + halfBar} ${cy + halfBar} L ${cx + halfBar} ${cy + half} L ${cx - halfBar} ${cy + half} L ${cx - halfBar} ${cy + halfBar} L ${cx - half} ${cy + halfBar} L ${cx - half} ${cy - halfBar} L ${cx - halfBar} ${cy - halfBar} Z`;
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
    const inferredSeriesCount = Math.max(minSeriesCount, Math.ceil(usedSeriesCols / Math.max(sourceCount, 1)));
    const seriesCount = Math.max(1, inferredSeriesCount);
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
    updateLineNestedHeaders();
    if(lineReplicates > LINE_MIN_REPLICATES){
      renderLineGroupedList();
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

  function updateLineReplicateModeControls(modeOverride){
    const mode = modeOverride || (lineReplicates > LINE_MIN_REPLICATES ? 'grouped' : 'single');
    if(refs.replicateMode && refs.replicateMode.value !== mode){
      refs.replicateMode.value = mode;
    }
    if(refs.replicatesContainer){
      if(mode === 'grouped'){
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
    if(refs.groupedAdd){
      refs.groupedAdd.disabled = mode !== 'grouped';
    }
    if(refs.groupedRemove){
      refs.groupedRemove.disabled = mode !== 'grouped';
    }
    if(mode === 'grouped'){
      renderLineGroupedList();
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

  function addLineGroup(){
    if(lineReplicates <= LINE_MIN_REPLICATES){
      console.debug('Debug: line grouped add skipped',{ reason: 'single-mode' });
      return;
    }
    const labels = Array.isArray(lineSeriesGroupLabels) ? lineSeriesGroupLabels.slice() : [];
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
          const rmseValue = summary?.metrics?.rmse ?? stats.regression?.metrics?.rmse;
          if(!parameterLabelResolved && typeof stats.slopeLabel === 'string' && stats.slopeLabel){
            parameterColumnLabel = stats.slopeLabel;
            parameterLabelResolved = true;
          }
          tableRows.push({
            series:s.name,
            r:formatMetricValue(stats.r),
            p:formatP(stats.p),
            slope:formatMetricValue(stats.slope),
            r2:formatMetricValue(r2Value),
            rmse:formatMetricValue(rmseValue)
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
          if((showIntervals || showDiagnostics) && Array.isArray(stats.regression?.coefficientStats)){
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
            {key:'r',label:'r',align:'right'},
            {key:'p',label:'p',align:'right'},
            {key:'slope',label:parameterColumnLabel,align:'right'},
            {key:'r2',label:'R²',align:'right'},
            {key:'rmse',label:'RMSE',align:'right'}
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
        if((showIntervals || showDiagnostics) && coefficientRows.length){
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
        table.innerHTML=`<tr><th>Series</th><th>r</th><th>p</th><th>${parameterColumnLabel}</th><th>R²</th><th>RMSE</th></tr>`+
          tableRows.map(row=>`<tr><td>${row.series}</td><td>${row.r}</td><td>${row.p}</td><td>${row.slope}</td><td>${row.r2}</td><td>${row.rmse}</td></tr>`).join('');
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
        if((showIntervals || showDiagnostics) && coefficientRows.length){
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
    if(!lineHot) return null;
    if((!Array.isArray(lineLastRegressionSummaries) || lineLastRegressionSummaries.length === 0) && lineHot){
      console.debug('Debug: line payload refreshing summaries',{ hasHot: !!lineHot, summaryCount: lineLastRegressionSummaries?.length || 0 });
      try{
        drawLine();
      }catch(err){
        console.error('line payload refresh failed',err);
      }
    }
    const axisSettings = ensureLineAxisSettings();
    const fontStyles = exportFontStyles('line');
    return {
      type:'line',
      data:lineHot.getData(),
      exclusions: lineHot?.exportExclusions?.() || Shared.hot.exportExclusions(lineHot),
      config:{
        title:lineTitleText,
        xLabel:lineXLabelText,
        yLabel:lineYLabelText,
        replicates: lineReplicates,
        groupLabels: Array.isArray(lineSeriesGroupLabels) ? lineSeriesGroupLabels.slice() : [],
        groupShapes: Array.isArray(lineGroupShapes) ? lineGroupShapes.slice() : [],
        dotSize:refs.dotSize?.value,
        fill:refs.fill?.value,
        border:refs.border?.value,
        borderWidth:refs.borderWidth?.value,
        errorBarWidth:refs.errorBarWidth?.value ?? refs.borderWidth?.value,
        alpha:refs.alpha?.value,
        labelColors:lineLabelColors,
        displayMode: sanitizeLineDisplayMode(refs.displayMode?.value ?? lineDisplayMode),
        showGrid:refs.showGrid?.checked,
        showFrame:refs.showFrame?.checked,
        showLegend:refs.showLegend ? !!refs.showLegend.checked : true,
        logX:refs.logX?.checked,
        logY:refs.logY?.checked,
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
          tickIntervalY: axisSettings.y?.tickInterval ?? null
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
    console.debug('Debug: applyLineGraphPayload payload', obj);
    const c=obj.config||{};
    importFontStyles('line', c.fontStyles || null);
    const storedReplicates = clampLineReplicateCount(c.replicates ?? lineReplicates);
    const matrixData = Array.isArray(obj.data) ? obj.data : null;
    const storedGroupLabels = Array.isArray(c.groupLabels) ? c.groupLabels.slice() : null;
    const storedGroupShapes = Array.isArray(c.groupShapes) ? c.groupShapes.slice() : null;
    if(storedGroupLabels){
      lineSeriesGroupLabels = storedGroupLabels.slice();
      console.debug('Debug: line group labels restored from payload', { labels: storedGroupLabels });
    }
    if(storedGroupShapes){
      lineGroupShapes = storedGroupShapes.map((shape, idx)=>sanitizeLineGroupShape(shape, idx));
      console.debug('Debug: line group shapes restored from payload', { shapes: lineGroupShapes.slice() });
    }
    const inferredSeries = matrixData && Array.isArray(matrixData[0]) ? Math.max(1, Math.ceil(((matrixData[0].length || 1) - 1) / Math.max(storedReplicates, 1))) : undefined;
    if(lineHot && matrixData){
      applyLineReplicateChange(storedReplicates, {
        dataOverride: matrixData,
        sourceReplicates: storedReplicates,
        skipDraw: true,
        minSeriesCount: inferredSeries,
        groupLabels: storedGroupLabels || lineSeriesGroupLabels,
        groupShapes: storedGroupShapes || lineGroupShapes,
        resetGroupLabels: storedGroupLabels ? true : undefined
      });
      if(obj.exclusions){
        lineHot.applyExclusions?.(obj.exclusions);
      }
    }else{
      lineReplicates = storedReplicates;
      if(refs.replicatesInput){
        refs.replicatesInput.value = String(lineReplicates);
      }
      if(lineReplicates > LINE_MIN_REPLICATES){
        lineLastGroupedReplicateCount = Math.min(LINE_MAX_REPLICATES, Math.max(2, lineReplicates));
      }
      updateLineReplicateModeControls();
      if(storedGroupShapes){
        lineGroupShapes = storedGroupShapes.map((shape, idx)=>sanitizeLineGroupShape(shape, idx));
      }
    }
    if(!lineHot && obj.exclusions){
      console.debug('Debug: line exclusions deferred until hot ready');
    }else if(lineHot && obj.exclusions && matrixData == null){
      lineHot.applyExclusions?.(obj.exclusions);
    }
    lineTitleText=c.title||lineTitleText;
    lineXLabelText=c.xLabel||lineXLabelText;
    lineYLabelText=c.yLabel||lineYLabelText;
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
    if(refs.showGrid) refs.showGrid.checked=!!c.showGrid;
    if(refs.showFrame) refs.showFrame.checked=!!c.showFrame;
    if(refs.showLegend) refs.showLegend.checked=c.showLegend !== false;
    if(refs.logX) refs.logX.checked=!!c.logX;
    if(refs.logY) refs.logY.checked=!!c.logY;
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
        tickIntervalY: c.axis.tickIntervalY ?? c.axis.yTickInterval ?? c.axis?.y?.tickInterval ?? null
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
    lineLastRegressionSummaries = Array.isArray(c.regression?.seriesSummaries) ? c.regression.seriesSummaries.slice() : [];
    ensureLineLabelColors(Object.keys(lineLabelColors));
    ensureLineLegendControlPlacement();
    scheduleLineDraw();
    console.debug('Debug: line payload applied', { source: meta.source || 'unknown', hasData: !!matrixData });
    return true;
  }

  function loadLineGraphFile(file){
    const reader=new FileReader();
    reader.onload=e=>{
      try{
        const obj=JSON.parse(e.target.result);
        if(!applyLineGraphPayload(obj, { source: 'file' })){
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
    const baseW=svgEl.viewBox.baseVal.width||svgEl.clientWidth||800;
    const baseH=svgEl.viewBox.baseVal.height||svgEl.clientHeight||400;
    clone.setAttribute('width',String(baseW));
    clone.setAttribute('height',String(baseH));
    clone.setAttribute('viewBox',`0 0 ${baseW} ${baseH}`);
    const exportFont = chartStyle.FONT_FAMILY || 'Arial, Helvetica, sans-serif';
    clone.setAttribute('font-family', exportFont);
    console.debug('Debug: buildLineExportSvg',{legendCount:lineLegendItems.length, exportFont}); // Debug: export clone info
    return clone;
  }

  function drawLine(){
    try{
      const debugStamp=Date.now();
      console.debug('Debug: drawLine start',{debugStamp}); // Debug: draw entry
      hideLineTooltip('redraw-start');
      if(!lineHot || !refs.plot) return;
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
      const showFrame=!!refs.showFrame?.checked;
      console.debug('Debug: line showFrame state',{showFrame});
      ensureLineLegendControlPlacement();
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
        updateLineStats([], statsContext);
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
        updateLineStats([], statsContext);
        return;
      }
      if(logX && xMinRaw<=0){
        resetLineRenderState('log-x-nonpositive',{ message: '<i>Log scale requires positive X values.</i>', allowHtml: true });
        updateLineStats([], statsContext);
        return;
      }
      if(logY && yMinRaw<=0){
        resetLineRenderState('log-y-nonpositive',{ message: '<i>Log scale requires positive Y values.</i>', allowHtml: true });
        updateLineStats([], statsContext);
        return;
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
          updateLineStats([], statsContext);
          console.debug('Debug: line plot aborted due to clipping',{ range: rangeForClipping });
          return;
        }
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
      const xMinT=logX?Math.log10(xMin):xMin;
      const xMaxT=logX?Math.log10(xMax):xMax;
      const yMinT=logY?Math.log10(yMin):yMin;
      const yMaxT=logY?Math.log10(yMax):yMax;
      const axisTickTools = chartStyle.axisTicks || null;
      const buildAxisScale = opts => {
        if(axisTickTools && typeof axisTickTools.buildScale === 'function'){
          return axisTickTools.buildScale(opts);
        }
        const min = Number.isFinite(opts?.manualMin) ? opts.manualMin : Number(opts?.dataMin) || 0;
        const max = Number.isFinite(opts?.manualMax) ? opts.manualMax : Number(opts?.dataMax) || min + 1;
        return { min, max, ticks: [min, max], step: Math.max((max - min) || 1, 1) };
      };
      let xTickTarget=chartStyle.estimateTickCount(W,{axis:'x',fallback:6});
      let yTickTarget=chartStyle.estimateTickCount(H,{axis:'y',fallback:6});
      console.debug('Debug: line initial tick targets',{xTickTarget,yTickTarget,width:W,height:H});
      function formatTick(v){return v.toLocaleString('en-US',{maximumFractionDigits:2,useGrouping:false});}
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
      const manualXMinValue = Number.isFinite(xMinManual) && (!logX || xMinManual > 0) ? (logX ? Math.log10(xMinManual) : xMinManual) : null;
      const manualXMaxValue = Number.isFinite(xMaxManual) && (!logX || xMaxManual > 0) ? (logX ? Math.log10(xMaxManual) : xMaxManual) : null;
      const manualYMinValue = Number.isFinite(yMinManual) && (!logY || yMinManual > 0) ? (logY ? Math.log10(yMinManual) : yMinManual) : null;
      const manualYMaxValue = Number.isFinite(yMaxManual) && (!logY || yMaxManual > 0) ? (logY ? Math.log10(yMaxManual) : yMaxManual) : null;
      let xScale=buildAxisScale({ dataMin: xMinT, dataMax: xMaxT, manualMin: manualXMinValue, manualMax: manualXMaxValue, targetTickCount: xTickTarget });
      let yScale=buildAxisScale({ dataMin: yMinT, dataMax: yMaxT, manualMin: manualYMinValue, manualMax: manualYMaxValue, targetTickCount: yTickTarget });
      let xTickLabels=xScale.ticks.map(t=>formatTick(logX?Math.pow(10,t):t));
      let yTickLabels=yScale.ticks.map(t=>formatTick(logY?Math.pow(10,t):t));
      let maxYLabelWidth=0;
      let maxXLabelWidth=0;
      for(let pass=0;pass<2;pass++){
        xScale=buildAxisScale({ dataMin: xMinT, dataMax: xMaxT, manualMin: manualXMinValue, manualMax: manualXMaxValue, targetTickCount: xTickTarget });
        yScale=buildAxisScale({ dataMin: yMinT, dataMax: yMaxT, manualMin: manualYMinValue, manualMax: manualYMaxValue, targetTickCount: yTickTarget });
        if(isFinite(xMinManual)) xScale.min=xMinT;
        if(isFinite(xMaxManual)) xScale.max=xMaxT;
        if(isFinite(yMinManual)) yScale.min=yMinT;
        if(isFinite(yMaxManual)) yScale.max=yMaxT;
        if(isFinite(xMinManual)||isFinite(xMaxManual)){
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
        if(isFinite(yMinManual)||isFinite(yMaxManual)){
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
        xTickLabels=xScale.ticks.map(t=>formatTick(logX?Math.pow(10,t):t));
        yTickLabels=yScale.ticks.map(t=>formatTick(logY?Math.pow(10,t):t));
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
      const x2px=v=>{
        const safeV = Math.min(Math.max(v, xScale.min), xScale.max);
        return margin.left+plotW*(safeV-xScale.min)/(xScale.max-xScale.min);
      };
      const y2px=v=>{
        const safeV = Math.min(Math.max(v, yScale.min), yScale.max);
        return margin.top+plotH*(1-(safeV-yScale.min)/(yScale.max-yScale.min));
      };
      function add(tag,attrs){const el=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,String(v));svg.appendChild(el);return el;}
      if(showGrid){
        xScale.ticks.forEach(t=>{const x=x2px(t);add('line',{x1:x,y1:margin.top,x2:x,y2:margin.top+plotH,stroke:'#ddd','stroke-width':axisStrokeWidth});});
        yScale.ticks.forEach(t=>{const y=y2px(t);add('line',{x1:margin.left,y1:y,x2:margin.left+plotW,y2:y,stroke:'#ddd','stroke-width':axisStrokeWidth});});
        console.debug('Debug: line grid stroke scaled',{vertical:xScale.ticks.length,horizontal:yScale.ticks.length,axisStrokeWidth});
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
      const axisControlConfig = axis => ({
        axis,
        scopeId: 'line',
        getTickInterval: () => getLineAxisTickInterval(axis),
        getThickness: () => getLineAxisStrokeWidth(),
        getColor: () => getLineAxisColor(),
        isTickIntervalEnabled: () => axis === 'x' ? !logX : !logY,
        getTickIntervalDisabledMessage: () => axis === 'x'
          ? 'Tick interval is disabled while the X axis uses a logarithmic scale.'
          : 'Tick interval is disabled while the Y axis uses a logarithmic scale.',
        tickPlaceholder: 'Auto',
        onTickIntervalChange: value => updateLineAxisTickInterval(axis, value),
        onThicknessChange: value => updateLineAxisStrokeWidth(value),
        onColorChange: value => updateLineAxisColor(value)
      });
      const xAxisLine = add('line',{x1:axisXStart,y1:xAxisY,x2:axisXEnd,y2:xAxisY,stroke:axisStroke,'stroke-linecap':'square','stroke-width':axisStrokeWidth});
      if(axisControls && typeof axisControls.registerAxisElement === 'function'){
        axisControls.registerAxisElement(xAxisLine, axisControlConfig('x'));
      }
      const yAxisLine = add('line',{x1:yAxisX,y1:axisYStart,x2:yAxisX,y2:axisYEnd,stroke:axisStroke,'stroke-linecap':'square','stroke-width':axisStrokeWidth});
      if(axisControls && typeof axisControls.registerAxisElement === 'function'){
        axisControls.registerAxisElement(yAxisLine, axisControlConfig('y'));
      }
      console.debug('Debug: line axes stroke scaled',{ axisStrokeWidth, axisStrokeWidthBase, axisStroke });
      if(showFrame){
        console.debug('Debug: line frame request',{stroke:axisStroke, showFrame, axisStrokeWidth}); // Debug: frame styling inputs
        chartStyle.drawPlotFrame({ svg, margin, plotW, plotH, stroke: axisStroke, strokeWidth: axisStrokeWidth, sides: ['top','right'] });
      }
      // Frame closes plot area using existing axis styling for continuity
      const xTickNodes=[];
      let xTickFontCount=0;
      xScale.ticks.forEach((t,i)=>{const x=x2px(t);add('line',{x1:x,y1:xAxisY,x2:x,y2:xAxisY+tickLen,stroke:axisStroke,'stroke-width':axisStrokeWidth});const txt=add('text',{x,y:xAxisY+tickLen+tickGap,'font-size':fs,'text-anchor':'middle','dominant-baseline':'hanging',fill:chartStyle.TEXT_COLOR});txt.textContent=formatTick(logX?Math.pow(10,t):t);markFontEditable(txt,'xTick');xTickFontCount+=1;xTickNodes.push(txt);});
      chartStyle.applyLabelOrientation(xTickNodes,{angle:-45,anchor:'end',dy:'0.35em',force:bottomLayout.shouldRotate});
      let yTickFontCount=0;
      yScale.ticks.forEach((t,i)=>{const y=y2px(t);add('line',{x1:yAxisX - tickLen,y1:y,x2:yAxisX,y2:y,stroke:axisStroke,'stroke-width':axisStrokeWidth});const txt=add('text',{x:yAxisX-(tickLen+tickGap),y,'font-size':fs,'text-anchor':'end','dominant-baseline':'middle',fill:chartStyle.TEXT_COLOR});txt.textContent=formatTick(logY?Math.pow(10,t):t);markFontEditable(txt,'yTick');yTickFontCount+=1;});
      console.debug('Debug: line font tick binding',{ xTickFontCount, yTickFontCount }); // Debug: tick font binding counts
      console.debug('Debug: line ticks stroke scaled',{xTickCount:xScale.ticks.length,yTickCount:yScale.ticks.length,axisStrokeWidth});
      const showErrorBars=replicates>1;
      const errorStrokeWidth=errorBarWidthPx;
      const errorCapHalf=Math.max(4, dotSizePx*1.2);
      const seriesElems=[];
      seriesWithData.forEach((s,i)=>{
        const color=colors[i];
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
          errorGroup.setAttribute('stroke',color);
          errorGroup.setAttribute('stroke-width',errorStrokeWidth);
          errorGroup.setAttribute('stroke-linecap','square');
          errorGroup.setAttribute('stroke-opacity',1-alpha);
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
            if(dotSizeRaw>0){
              const markerShape = seriesShapes[i] || s.shape || 'circle';
              const marker=createLineMarkerShape(document, markerShape, {
                index: i,
                radius: dotSizePx,
                cx: px,
                cy: py,
                fill: lineLabelColors[s.name] || fill,
                fillOpacity: 1 - alpha,
                strokeWidth: 0,
                strokeOpacity: 1 - alpha
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
          areaPathEl.setAttribute('fill',color);
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
          stroke:color,
          'stroke-width':borderWidthPx,
          'stroke-opacity':1-alpha,
          fill:'none'
        };
        pathAttrs['data-render-mode']=displayModeCurrent;
        const path=add('path',pathAttrs);
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
        const legendX=margin.left+plotW+legendLayout.legendGapPx;
        const legendGroup=legendRenderer.draw(svg,{x:legendX,y:margin.top+legendRenderer.baselineOffset});
        if(legendGroup){
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
      const xText=add('text',{x:margin.left+plotW/2,y:xAxisBase+bottomLayout.titleOffset,'text-anchor':'middle','font-size':fs,fill:chartStyle.TEXT_COLOR});
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
        const previous=lineXLabelText!=null?String(lineXLabelText):'';
        const nextValue=txt!=null?String(txt):'';
        if(previous===nextValue){
          return;
        }
        applyLineXLabel(nextValue);
        recordLineChange('line:x-label',previous,nextValue,applyLineXLabel);
      });
      const yX=margin.left-(maxYLabelWidth+tickLen+tickGap+axisMetrics.axisTitleGap+fs*0.5);
      const yText=add('text',{x:yX,y:margin.top+plotH/2,transform:`rotate(-90 ${yX} ${margin.top+plotH/2})`,'text-anchor':'middle','font-size':fs,fill:chartStyle.TEXT_COLOR});
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
      const titleText=add('text',{x:margin.left+plotW/2,y:margin.top/2,'text-anchor':'middle','font-size':fs,fill:chartStyle.TEXT_COLOR});
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
      updateLineStats(seriesWithData, statsContext);
      ensureGraphViewport(svg, { padding: Math.max(fs, 16), debugLabel: 'line-graph' });
      lineLayout?.syncPanels?.({ skipSchedule: true });
      console.debug('Debug: drawLine complete',{debugStamp}); // Debug: draw exit
    }catch(err){ console.error('drawLine error',err); }
  }

  function setup(){
    if(line.ready){ console.debug('Debug: Components.line.setup skipped'); return; }
    console.debug('Debug: Components.line.setup start'); // Debug: setup entry
    const document = global.document;
    const Handsontable = global.Handsontable;
    if(!document || !Handsontable){ console.error('Line component dependencies missing'); return; }
    ensureLineAxisSettings();
    const $ = global.$ || (sel=>document.querySelector(sel));
    refs.tablePanel=document.getElementById('lineTablePanel');
    refs.graphPanel=document.getElementById('lineGraphPanel');
    refs.panelResizer=document.getElementById('linePanelResizer');
    refs.svgBox=refs.graphPanel?.querySelector('.svgbox');
    refs.configPanel=refs.graphPanel?.querySelector('.config-options');
    refs.hotContainer=document.getElementById('lineHot');
    refs.hotWrapper=document.getElementById('lineHotWrapper');
    refs.plot=document.getElementById('linePlot');
    refs.tooltip=document.getElementById('tooltip');
    refs.statType=document.getElementById('lineStatType');
    refs.statsResults=document.getElementById('lineStatsResults');
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
    refs.forecastFieldset=document.getElementById('lineForecastControls');
    refs.forecastHorizon=document.getElementById('lineForecastHorizon');
    refs.forecastSeasonLength=document.getElementById('lineForecastSeasonLength');
    refs.forecastAuto=document.getElementById('lineForecastAuto');
    refs.forecastCriterion=document.getElementById('lineForecastCriterion');
    refs.replicateMode=document.getElementById('lineTableFormat');
    refs.replicatesContainer=document.getElementById('lineGroupedControls');
    refs.replicatesInput=document.getElementById('lineReplicates');
    refs.groupedList=document.getElementById('lineGroupedList');
    refs.groupedAdd=document.getElementById('lineGroupedAdd');
    refs.groupedRemove=document.getElementById('lineGroupedRemove');
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
        const length = Array.isArray(lineSeriesGroupLabels) ? lineSeriesGroupLabels.length : 0;
        const targetIndex = length > 0 ? length - 1 : -1;
        console.debug('Debug: line grouped remove button',{ length, targetIndex });
        if(targetIndex >= 0){
          removeLineGroupAt(targetIndex);
        }
      });
    }
    if(refs.replicateMode){
      refs.replicateMode.addEventListener('change',e=>{
        const nextMode = e.target.value === 'grouped' ? 'grouped' : 'single';
        console.debug('Debug: line replicate mode change',{ mode: nextMode });
        if(nextMode === 'single'){
          if(lineReplicates > LINE_MIN_REPLICATES){
            lineLastGroupedReplicateCount = Math.min(LINE_MAX_REPLICATES, Math.max(2, lineReplicates));
            applyLineReplicateChange(LINE_MIN_REPLICATES);
          }else{
            updateLineReplicateModeControls(nextMode);
          }
        }else{
          const target = lineReplicates > LINE_MIN_REPLICATES ? lineReplicates : lineLastGroupedReplicateCount;
          if(target !== lineReplicates){
            applyLineReplicateChange(target);
          }else{
            updateLineReplicateModeControls(nextMode);
          }
        }
      });
    }
    updateLineReplicateModeControls();
    if(refs.regressionMode){
      refs.regressionMode.addEventListener('change',e=>{
        console.debug('Debug: line regression mode change',{ value: e.target.value });
        updateForecastVisibility();
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
        return{allowed:false,reason:'axis-limit',value:manualMin,message};
      }
      const manualMax=parseFloat(maxInput?.value);
      if(Number.isFinite(manualMax)&&manualMax<=0){
        const message=`Cannot enable log scale on the ${axisLabel} axis because the maximum value (${manualMax}) is not positive.`;
        if(lineDebugEnabled()){
          console.debug('Debug: line log axis blocked by manual maximum',{ axis, value: manualMax });
        }
        return{allowed:false,reason:'axis-limit',value:manualMax,message};
      }
      const originModeValue=refs.originMode?.value;
      if(originModeValue==='custom'){
        const originVal=parseFloat(originInput?.value);
        if(Number.isFinite(originVal)&&originVal<=0){
          const message=`Cannot enable log scale on the ${axisLabel} axis because the custom origin (${originVal}) is not positive.`;
          if(lineDebugEnabled()){
            console.debug('Debug: line log axis blocked by custom origin',{ axis, value: originVal });
          }
          return{allowed:false,reason:'origin',value:originVal,message};
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
      for(let r=1;r<rowCount;r+=1){
        if(analysis.isRowExcluded?.(r)){
          continue;
        }
        const row=dataMatrix[r]||[];
        if(axis==='x'){
          const value=parseFloat(row[xIndex]);
          if(Number.isFinite(value)&&value<=0){
            const formatted=value===0?'0':value.toPrecision(4);
            const message=`Cannot enable log scale on the X axis because data includes ${formatted} at row ${r+1}.`;
            if(lineDebugEnabled()){
              console.debug('Debug: line log axis blocked by X data',{ row:r, value });
            }
            return{allowed:false,reason:'data',value,message};
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
            if(Number.isFinite(value)&&value<=0){
              const formatted=value===0?'0':value.toPrecision(4);
              const message=`Cannot enable log scale on the Y axis because data includes ${formatted} at row ${r+1}.`;
              if(lineDebugEnabled()){
                console.debug('Debug: line log axis blocked by Y data',{ row:r, col:c, value });
              }
              return{allowed:false,reason:'data',value,message};
            }
          }
        }
      }
      if(lineDebugEnabled()){
        console.debug('Debug: line log axis validation passed',{ axis });
      }
      return{allowed:true};
    }
    const lineAutoSizeTargets=[
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

    global.lineStatType = refs.statType; // legacy compatibility
    global.lineStatsResults = refs.statsResults; // legacy compatibility
    global.lineRegressionMode = refs.regressionMode; // legacy compatibility for regression selector

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
      onMinSvgWidth: value => {
        lineMinSvgWidth = Math.max(0, Number(value) || 0);
        console.debug('Debug: line layout min width update', { value: lineMinSvgWidth });
      },
      resizableBoxOptions: {
        onResize: () => {
          console.debug('Debug: line layout onResize schedule trigger');
          scheduleLineDraw();
        }
      }
    });
    if(lineLayout?.elements?.svgBox){
      refs.svgBox = lineLayout.elements.svgBox;
    }
    lineLayout?.setScheduleDraw?.(scheduleLineDraw);
    lineLayout?.syncPanels?.();
    ensureLineLegendControlPlacement();
    const scheduleLegendPlacement = typeof Shared.debounceFrame === 'function'
      ? Shared.debounceFrame(()=>ensureLineLegendControlPlacement())
      : null;
    if(scheduleLegendPlacement){
      scheduleLegendPlacement();
    }else if(typeof global.requestAnimationFrame === 'function'){
      global.requestAnimationFrame(()=>ensureLineLegendControlPlacement());
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
      scheduleLineDraw();
    };

    lineHot = Shared.hot.createStandardTable(refs.hotContainer, { rows: DEFAULT_ROWS, cols: LINE_DEFAULT_COLS }, scheduleLineDrawProxy, {
      debugLabel: 'line',
      data,
      hotOptions: {
        stretchH: 'all',
        afterChange(changes, source){
          if(changes && source !== 'loadData'){
            console.debug('Debug: line afterChange', { count: changes.length, source });
            revalidateActiveLineLogAxis('x','data-edit');
            revalidateActiveLineLogAxis('y','data-edit');
          }
        },
        afterCreateRow(){
          console.debug('Debug: line row created');
        },
        afterCreateCol(){
          console.debug('Debug: line col created');
        },
        afterRemoveRow(){
          console.debug('Debug: line row removed');
        },
        afterRemoveCol(){
          console.debug('Debug: line col removed');
        },
        afterUndo(){
          console.debug('Debug: line undo');
        },
        afterRedo(){
          console.debug('Debug: line redo');
        }
      }
    });
    if(lineHot && typeof lineHot.addHook === 'function'){
      lineHot.addHook('afterRender', () => {
        if(lineReplicates > 1){
          applyLineNestedHeaderEditors();
        }
      });
      console.debug('Debug: lineHot afterRender hook registered for nested headers');
    }
    global.DEBUG_LINE=true;
    console.debug('Debug: lineHot initialized',{rows:DEFAULT_ROWS,cols:LINE_DEFAULT_COLS});

    lineLayout?.setScheduleDraw?.(scheduleLineDraw);
    lineLayout?.syncPanels?.();
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
      }
    };

    refs.loadExample?.addEventListener('click',()=>{
      const isGroupedMode = refs.replicateMode?.value === 'grouped';
      const key = isGroupedMode ? 'groupedDoseResponse' : 'standard';
      const example=lineExamples[key]||lineExamples.standard;
      applyLineReplicateChange(example.replicates,{
        dataOverride: example.data,
        sourceReplicates: example.replicates,
        skipDraw: true,
        minSeriesCount: example.seriesCount,
        groupLabels: example.groupLabels,
        groupShapes: example.groupShapes
      });
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
      console.debug('Debug: line import start',{fileName}); // Debug: import start trace
      try{
        const result = await tableImport.openFile(refs.fileInput,{
          hot: lineHot,
          minCols: LINE_DEFAULT_COLS,
          minRows: DEFAULT_ROWS,
          scheduleDraw: scheduleLineDraw,
          debugLabel: 'line',
          onProcessed: info => {
            console.debug('Debug: line tableImport processed', info || {}); // Debug: processed callback
          }
        });
        console.debug('Debug: line import finished',{rows: result?.rows || 0, cols: result?.cols || 0}); // Debug: import finish trace
      }catch(err){
        console.error('line import failed',err);
      }
    });

    refs.hotContainer?.addEventListener('paste',async e=>{
      const tableImport = Shared.tableImport;
      if(!tableImport || typeof tableImport.handlePaste !== 'function'){
        console.warn('line paste skipped: Shared.tableImport.handlePaste unavailable');
        return;
      }
      try{
        const result = await tableImport.handlePaste(e,lineHot,{
          minCols: LINE_DEFAULT_COLS,
          minRows: DEFAULT_ROWS,
          scheduleDraw: scheduleLineDraw,
          debugLabel: 'line',
          onProcessed: info => {
            console.debug('Debug: line paste processed', info || {}); // Debug: paste processed callback
          }
        });
        console.debug('Debug: line paste finished',{rows: result?.rows || 0, cols: result?.cols || 0}); // Debug: paste finish trace
      }catch(err){
        console.error('line paste failed',err);
      }
    });

    if(refs.plot){
      const container=refs.plot.closest('.svgbox')||refs.plot.parentElement;
      if(!container){
        console.debug('Debug: line resizer container missing', { hasContainer: !!container });
      }
      refs.plot.addEventListener('mouseleave', handleLinePlotMouseLeave);
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
            checkbox.checked=false;
            const warningMessage=validation.message||`Cannot enable log scale on the ${axis==='x'?'X':'Y'} axis while non-positive values are present.`;
            showLineLogWarning(warningMessage);
            console.warn('line log axis blocked',{ axis, reason: validation.reason, value: validation.value });
            return;
          }
          clearLineLogWarning();
        }else{
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
        if(!revalidateActiveLineLogAxis(axis,context)){
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
    refs.statType?.addEventListener('change',()=>{ scheduleLineDraw(); });
    refs.showIntervals?.addEventListener('change',e=>{ console.debug('Debug: line showIntervals change',{checked:e.target.checked}); scheduleLineDraw(); });
    refs.showDiagnostics?.addEventListener('change',e=>{ console.debug('Debug: line showDiagnostics change',{checked:e.target.checked}); scheduleLineDraw(); });
    refs.showLegend?.addEventListener('change',e=>{
      console.debug('Debug: line showLegend change',{checked:e.target.checked});
      ensureLineLegendControlPlacement();
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

    scheduleLineDraw = Shared.debounceFrame(drawLine);
    lineLayout?.setScheduleDraw?.(scheduleLineDraw);
    console.debug('Debug: line scheduleLineDraw configured via Shared.debounceFrame'); // Debug: scheduler setup
    ensureEmptyPayloadTemplate();
    line.ready = true;
    scheduleLineDraw();
    console.debug('Debug: Components.line.setup complete'); // Debug: setup complete
  }

  function ensureReady(){ if(!line.ready) setup(); }

  line.init = setup;
  line.ensure = ensureReady;
  line.draw = function draw(){ ensureReady(); scheduleLineDraw && scheduleLineDraw(); };
  line.save = saveLineFile;
  line.saveAs = saveAsLineFile;
  line.open = openLineFile;
  line.loadFromFile = loadLineGraphFile;
  line.loadFromPayload = function loadLineGraphFromPayload(payload){
    if(!applyLineGraphPayload(payload, { source: 'payload' })){
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
    return {
      hot: lineHot,
      layout: lineLayout,
      legendItems: lineLegendItems.slice(),
      legendWidth: lineLegendWidth,
      showLegend: refs.showLegend ? !!refs.showLegend.checked : true,
      legendLayout: {
        entryCount: lineLegendLayoutInfo.entryCount,
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

