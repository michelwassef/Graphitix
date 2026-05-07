// Pie/Proportion Graph component module
// Exposes: window.Components.pie = { init(root), draw(), save(), open(), loadFromFile(file) }
(function(global){
  'use strict';
  const NS='http://www.w3.org/2000/svg';
  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};

  function pieDebug(message, ...rest){
    if(typeof Shared.isDebugEnabled === 'function' && !Shared.isDebugEnabled()){
      return;
    }
    if(typeof console !== 'undefined' && typeof console.debug === 'function'){
      if(rest.length){
        console.debug(message, ...rest);
      }else{
        console.debug(message);
      }
    }
  }
  const pie = Components.pie = Components.pie || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  const fontControls = Shared.fontControls = Shared.fontControls || {};
  const notesHelper = Shared.notes = Shared.notes || {};
  if(typeof notesHelper.mountFoldable !== 'function' && typeof require === 'function'){
    try{
      require('../shared/notes.js');
    }catch(err){
      pieDebug('Debug: pie component notes helper require failed', { message: err?.message || String(err) });
    }
  }
  const dataViewsApi = Shared.dataViews = Shared.dataViews || {};
  if(typeof dataViewsApi.createManager !== 'function' && typeof require === 'function'){
    try{
      require('../shared/dataViews.js');
    }catch(err){
      pieDebug('Debug: pie component dataViews helper require failed', { message: err?.message || String(err) });
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
  const axisControls = Shared.axisControls = Shared.axisControls || {};
  const formControls = Shared.formControls = Shared.formControls || {};
  pie.__installed = true; // signal to legacy code to skip
  pie.ready = false;
  const fileIO = Shared.fileIO = Shared.fileIO || {};
  if(!fileIO.saveGraphFile){
    pieDebug('Debug: pie component awaiting Shared.fileIO helpers');
  }
  if(!Shared.tableImport || typeof Shared.tableImport.openFile !== 'function'){
    pieDebug('Debug: pie component awaiting Shared.tableImport helpers'); // Debug: table import helper check
  }

  const ensureGraphViewport = Shared.graphViewport?.createEnsurer
    ? Shared.graphViewport.createEnsurer('pie')
    : (svg, options = {}) => {
      const fn = Shared.ensureGraphViewport || Shared.autoResizeSvg || global.ensureGraphViewport || global.autoResizeSvg;
      if(typeof fn === 'function'){
        fn(svg, { component: 'pie', debugLabel: 'pie-viewport-fallback', ...options });
        return;
      }
      pieDebug('Debug: pie ensureGraphViewport helper missing', {
        hasShared: !!Shared,
        hasAutoResize: typeof Shared?.autoResizeSvg === 'function'
      });
    };
  pieDebug('Debug: pie graph viewport helper configured', {
    hasGraphViewport: typeof Shared.graphViewport?.ensure === 'function',
    usesFactory: typeof Shared.graphViewport?.createEnsurer === 'function'
  });

  const PIE_DEFAULT_ROWS = 100;
  const PIE_DEFAULT_COLS = 6;
  const PIE_DATA_VIEW_MAX = 15;
  const DEFAULT_PIE_FONT_SIZE_PT = 12;
  const TAU = Math.PI * 2;
  let emptyPayloadTemplate = null;
  let pieDataViewsManager = null;

  function seedPieDefaultHeaderRow(matrix){
    if(!Array.isArray(matrix) || !Array.isArray(matrix[0])){
      return matrix;
    }
    const headerRow = matrix[0];
    if(headerRow.length > 0){
      headerRow[0] = 'Category';
    }
    if(headerRow.length > 1){
      headerRow[1] = 'Value';
    }
    if(headerRow.length > 2){
      headerRow[2] = 'Expected';
    }
    return matrix;
  }

  function ensurePieDefaultHeaderRow(hotInstance){
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
    const desired = ['Category', 'Value', 'Expected'];
    const colCount = Math.max(typeof hot.countCols === 'function' ? hot.countCols() : headerRow.length, desired.length);
    const changes = [];
    for(let col = 0; col < Math.min(desired.length, colCount); col += 1){
      const current = headerRow[col] != null ? String(headerRow[col]).trim() : '';
      if(!current){
        changes.push([0, col, desired[col]]);
      }
    }
    if(!changes.length){
      return false;
    }
    hot.setDataAtCell(changes, 'pie-default-header-seed');
    return true;
  }

  function cloneSimple(value){
    if(!value) return null;
    try{
      return JSON.parse(JSON.stringify(value));
    }catch(err){
      console.error('pie cloneSimple error', err);
      return null;
    }
  }

  function ensureEmptyPayloadTemplate(){
    if(emptyPayloadTemplate){
      return;
    }
    emptyPayloadTemplate = { type: 'pie', config: {} };
  }
  const DEFAULT_AXIS_COLOR = '#000000';
  const MIN_MINOR_TICK_SUBDIVISIONS = 1;
  const MAX_MINOR_TICK_SUBDIVISIONS = 9;
  const DEFAULT_MINOR_TICK_SUBDIVISIONS = Number.isFinite(chartStyle.DEFAULT_MINOR_TICK_SUBDIVISIONS)
    ? chartStyle.DEFAULT_MINOR_TICK_SUBDIVISIONS
    : 3;
  const PIE_STATS_DEFAULT_ALPHA = 0.05;
  const PIE_STATS_DEFAULT_CORRECTION = 'holm';
  const PIE_STATS_DEFAULT_SCOPE = 'gof';
  const PIE_STATS_DEFAULT_TEST = 'chi-square';
  const PIE_STATS_DEFAULT_SPARSE_THRESHOLD = 5;

  function pieDebugEnabled(){
    return typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
  }

  function createDefaultPieStatsConfig(){
    return {
      scope: PIE_STATS_DEFAULT_SCOPE,
      test: PIE_STATS_DEFAULT_TEST,
      correction: PIE_STATS_DEFAULT_CORRECTION,
      alpha: PIE_STATS_DEFAULT_ALPHA,
      sparseThreshold: PIE_STATS_DEFAULT_SPARSE_THRESHOLD,
      yatesCorrection: true,
      referenceColumn: null,
      valueColumn: null,
      expectedColumn: null,
      selectedCols: new Set(),
      customPairs: new Set(),
      advancedOpen: false,
      resultsTab: 'overall',
      advisor: {
        open: false,
        activated: false,
        answers: {}
      },
      contextSignature: null,
      lastRunSignature: null,
      pending: false,
      controlsSignature: null,
      restorePending: null
    };
  }

  function createImmutablePieDefaultStatsPayload(){
    return {
      scope: PIE_STATS_DEFAULT_SCOPE,
      test: PIE_STATS_DEFAULT_TEST,
      correction: PIE_STATS_DEFAULT_CORRECTION,
      alpha: PIE_STATS_DEFAULT_ALPHA,
      sparseThreshold: PIE_STATS_DEFAULT_SPARSE_THRESHOLD,
      yatesCorrection: true,
      referenceColumn: null,
      valueColumn: null,
      expectedColumn: null,
      selectedColumns: [],
      customPairs: [],
      advancedOpen: false,
      resultsTab: 'overall',
      advisor: {
        open: false,
        activated: false,
        answers: {}
      },
      resultsHtml: null,
      reportHtml: null,
      contextSignature: null,
      lastRunSignature: null
    };
  }

  function createImmutablePieDefaultConfig(){
    return {
      title: 'Proportion graph',
      chartType: 'pie',
      showPercents: false,
      showFrame: false,
      showLegend: true,
      startAngle: '0',
      borderColor: '#ffffff',
      borderWidth: 0,
      fontSize: String(DEFAULT_PIE_FONT_SIZE_PT),
      fontStyles: null,
      valueColumn: '',
      expectedColumn: '',
      stats: createImmutablePieDefaultStatsPayload(),
      colors: {},
      colorScheme: Shared.colorSchemes?.getDefaultSchemeId?.('pie') || 'scientific',
      axis: createDefaultAxisSettings(),
      notes: {
        text: '',
        open: false
      },
      labelPositions: {
        title: null,
        legend: null
      }
    };
  }

  function clampMinorTickSubdivisions(value){
    const numeric = Number(value);
    if(!Number.isFinite(numeric)){
      return DEFAULT_MINOR_TICK_SUBDIVISIONS;
    }
    const rounded = Math.round(numeric);
    return Math.max(MIN_MINOR_TICK_SUBDIVISIONS, Math.min(MAX_MINOR_TICK_SUBDIVISIONS, rounded));
  }

  function attachPieSelectAutoSize(select, label){
    if(!select){ return; }
    if(typeof formControls.attachSelectAutoSize === 'function'){
      formControls.attachSelectAutoSize(select, label || 'pie');
      return;
    }
    const debugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
    const watcher = typeof formControls.watchSelectAutoSize === 'function' ? formControls.watchSelectAutoSize : null;
    const autoSizer = typeof formControls.autoSizeSelect === 'function' ? formControls.autoSizeSelect : null;
    const contextLabel = label || 'pie';
    try{
      if(watcher){
        watcher(select);
        if(debugEnabled){
          pieDebug('Debug: pie select auto-size watcher attached', {
            id: select.id || null,
            label: contextLabel
          });
        }
      }else if(autoSizer){
        autoSizer(select);
        if(debugEnabled){
          pieDebug('Debug: pie select auto-size applied without watcher', {
            id: select.id || null,
            label: contextLabel
          });
        }
      }else if(debugEnabled){
        pieDebug('Debug: pie select auto-size helper unavailable', {
          id: select.id || null,
          label: contextLabel
        });
      }
    }catch(err){
      if(debugEnabled){
        pieDebug('Debug: pie select auto-size attach error', {
          id: select.id || null,
          label: contextLabel,
          error: err?.message || String(err)
        });
      }
    }
  }

  function createDefaultAxisSettings(){
    return {
      strokeWidth: 1,
      color: DEFAULT_AXIS_COLOR,
      x: { tickInterval: null, minorTicks: false, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS },
      y: { tickInterval: null, minorTicks: false, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS }
    };
  }

  function ensureAxisSettings(){
    if(!state.axisSettings || typeof state.axisSettings !== 'object'){
      state.axisSettings = createDefaultAxisSettings();
    }
    if(!state.axisSettings.x || typeof state.axisSettings.x !== 'object'){
      state.axisSettings.x = { tickInterval: null, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS };
    }
    if(!state.axisSettings.y || typeof state.axisSettings.y !== 'object'){
      state.axisSettings.y = { tickInterval: null, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS };
    }
    if(typeof state.axisSettings.x.minorTicks !== 'boolean'){
      state.axisSettings.x.minorTicks = false;
    }
    if(typeof state.axisSettings.y.minorTicks !== 'boolean'){
      state.axisSettings.y.minorTicks = false;
    }
    state.axisSettings.x.minorTickSubdivisions = clampMinorTickSubdivisions(state.axisSettings.x.minorTickSubdivisions);
    state.axisSettings.y.minorTickSubdivisions = clampMinorTickSubdivisions(state.axisSettings.y.minorTickSubdivisions);
    const numericStroke = Number(state.axisSettings.strokeWidth);
    state.axisSettings.strokeWidth = Number.isFinite(numericStroke) && numericStroke > 0 ? numericStroke : 1;
    if(typeof state.axisSettings.color !== 'string' || !state.axisSettings.color.trim()){
      state.axisSettings.color = DEFAULT_AXIS_COLOR;
    }
    return state.axisSettings;
  }

  function getAxisTickInterval(axis){
    if(axis !== 'x' && axis !== 'y'){ return null; }
    const settings = ensureAxisSettings();
    const raw = settings[axis]?.tickInterval;
    if(raw === null || raw === undefined || raw === ''){
      return null;
    }
    const numeric = Number(raw);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }

  function updateAxisTickInterval(axis, value){
    if(axis !== 'x' && axis !== 'y'){ return; }
    const settings = ensureAxisSettings();
    if(value === null || value === undefined || value === ''){
      settings[axis].tickInterval = null;
    } else {
      const numeric = Number(value);
      settings[axis].tickInterval = Number.isFinite(numeric) && numeric > 0 ? numeric : null;
    }
    pieDebug('Debug: pie axis tick interval updated',{ axis, tickInterval: settings[axis].tickInterval });
    state.scheduleDraw?.();
  }

  function getAxisMinorTicksEnabled(axis){
    if(axis !== 'x' && axis !== 'y'){ return false; }
    const settings = ensureAxisSettings();
    return !!settings[axis]?.minorTicks;
  }

  function updateAxisMinorTicks(axis, enabled){
    if(axis !== 'x' && axis !== 'y'){ return; }
    const settings = ensureAxisSettings();
    const nextValue = !!enabled;
    if(settings[axis].minorTicks === nextValue){
      return;
    }
    settings[axis].minorTicks = nextValue;
    pieDebug('Debug: pie minor ticks updated',{ axis, enabled: nextValue });
    state.scheduleDraw?.();
  }

  function getAxisMinorTickSubdivisions(axis){
    if(axis !== 'x' && axis !== 'y'){ return DEFAULT_MINOR_TICK_SUBDIVISIONS; }
    const settings = ensureAxisSettings();
    return clampMinorTickSubdivisions(settings[axis]?.minorTickSubdivisions);
  }

  function updateAxisMinorTickSubdivisions(axis, value){
    if(axis !== 'x' && axis !== 'y'){ return; }
    const settings = ensureAxisSettings();
    const nextValue = clampMinorTickSubdivisions(value);
    if(settings[axis].minorTickSubdivisions === nextValue){
      return;
    }
    settings[axis].minorTickSubdivisions = nextValue;
    pieDebug('Debug: pie minor tick subdivisions updated',{ axis, subdivisions: nextValue });
    state.scheduleDraw?.();
  }

  function getAxisStrokeWidthBase(){
    return ensureAxisSettings().strokeWidth;
  }

  function updateAxisStrokeWidth(value){
    const settings = ensureAxisSettings();
    if(value === null || value === undefined || value === ''){
      settings.strokeWidth = 1;
    } else {
      const numeric = Number(value);
      settings.strokeWidth = Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
    }
    pieDebug('Debug: pie axis stroke width updated',{ strokeWidth: settings.strokeWidth });
    state.scheduleDraw?.();
  }

  function getAxisColor(){
    return ensureAxisSettings().color || DEFAULT_AXIS_COLOR;
  }

  function updateAxisColor(value){
    const settings = ensureAxisSettings();
    settings.color = typeof value === 'string' && value.trim() ? value : DEFAULT_AXIS_COLOR;
    pieDebug('Debug: pie axis color updated',{ color: settings.color });
    state.scheduleDraw?.();
  }

  function applyAxisSettings(settings){
    const base = createDefaultAxisSettings();
    if(settings && typeof settings === 'object'){
      const strokeCandidate = Number(settings.strokeWidth ?? settings.axisThickness);
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
    }
    state.axisSettings = base;
    ensureAxisSettings();
    pieDebug('Debug: pie axis settings applied',{ settings: state.axisSettings });
  }

let state = {
    hot: null,
    root: null,
    scheduleDraw: null,
    fileHandle: null,
    fileName: 'pie.graph',
    titleText: 'Proportion graph',
    legendWidth: 120,
    colors: {},
    svgBox: null,
    layout: null,
    minSvgWidth: 0,
    axisSettings: createDefaultAxisSettings(),
    labelPositions: { title: null, legend: null },
    columnSignature: null,
    statsDataModel: null,
    statsConfig: createDefaultPieStatsConfig(),
    colorSignature: null,
    resizeState: {
      active: false,
      phase: null
    }
  };

  function resolvePieRoot(tabLike){
    return Shared.workspaceTabs?.getMountedRoot?.(tabLike || null, 'pie')
      || state.root
      || global.document?.getElementById?.('piePage')
      || global.document
      || null;
  }

  function queryPieRoot(selector, tabLike){
    const root = resolvePieRoot(tabLike);
    if(!root || !selector){
      return null;
    }
    return root.querySelector?.(selector) || null;
  }

  function getPieNodeById(id, tabLike){
    if(!id){
      return null;
    }
    const root = resolvePieRoot(tabLike);
    if(root?.getElementById){
      const byId = root.getElementById(id);
      if(byId){
        return byId;
      }
    }
    return root?.querySelector?.(`#${id}`) || null;
  }
  function ensurePieStatsReportHost(target){
    const reporting = Shared.statsReporting;
    if(!target || !reporting || typeof reporting.ensureReportHost !== 'function'){
      return target?.__statsReportHost || null;
    }
    return reporting.ensureReportHost(target, {
      id: 'pieStatsReportHost',
      className: 'stats-report-host',
      attachToTarget: true,
      position: 'last'
    });
  }
  function clearPieStatsReportHost(target){
    const reporting = Shared.statsReporting;
    if(reporting && typeof reporting.clearReportHost === 'function'){
      reporting.clearReportHost(target);
    }
  }
  let pieFontEventBound = false;

  function schedulePieViewRefresh(reason){
    if(typeof state.scheduleDraw !== 'function'){
      return;
    }
    state.scheduleDraw({
      viewOnly: true,
      reason: reason || 'pie-view-refresh'
    });
  }

  function isPieFontStyleEvent(detail){
    const scopeId = detail?.scopeId || null;
    const storeKey = typeof detail?.storeKey === 'string' ? detail.storeKey : '';
    return scopeId === 'pie' || storeKey.startsWith('pie::');
  }

  function ensurePieFontEventListener(){
    if(pieFontEventBound || !global.document || typeof global.document.addEventListener !== 'function'){
      return;
    }
    global.document.addEventListener('fontControls:styleChanged', event => {
      const detail = event?.detail || {};
      if(!isPieFontStyleEvent(detail)){
        return;
      }
      schedulePieViewRefresh('font-style-change');
    });
    pieFontEventBound = true;
  }

  const pieUndoManager = Shared.undoManager || null;
  function recordPieChange(label, previous, next, apply){
    if(!pieUndoManager || typeof pieUndoManager.recordStateChange !== 'function'){
      return;
    }
    if(typeof apply !== 'function'){
      return;
    }
    pieUndoManager.recordStateChange({
      label,
      scope: 'pieGraphPanel',
      from: previous,
      to: next,
      apply(value){
      apply(value);
      return true;
    }
  });
  }

  function applyPieTitleValue(node, value){
    const nextValue = value != null ? String(value) : '';
    state.titleText = nextValue;
    if(node && node.textContent !== nextValue){
      node.textContent = nextValue;
    }
    if(typeof state.scheduleDraw === 'function'){
      state.scheduleDraw();
    }
  }

  function applyPieColorValue(label, value){
    const nextValue = value != null ? String(value) : '';
    const previousValue = state.colors[label] || '';
    if(nextValue){
      if(previousValue === nextValue){
        return true;
      }
      state.colors[label] = nextValue;
    }else if(previousValue){
      delete state.colors[label];
    }else{
      return true;
    }
    if(typeof state.scheduleDraw === 'function'){
      state.scheduleDraw();
    }
    return true;
  }

  function handlePieLegendSwatchClick(payload){
    const entry = payload?.entry;
    const swatch = payload?.swatch;
    const event = payload?.event;
    if(!entry || !swatch || typeof Shared.openColorPicker !== 'function'){
      return;
    }
    if(event){ event.stopPropagation(); }
    const labelKey = entry.key || entry.label || entry.name;
    if(!labelKey){ return; }
    const currentColor = state.colors[labelKey] || entry.fill || '#888888';
    let previousColor = currentColor;
    Shared.openColorPicker({
      anchor: swatch,
      color: currentColor,
      onInput(value){
        applyPieColorValue(labelKey, value);
        pieDebug('Debug: pie legend color input', { label: labelKey, color: value });
      },
      onChange(value){
        const nextValue = value != null ? String(value) : '';
        if(nextValue === previousColor){
          return;
        }
        applyPieColorValue(labelKey, nextValue);
        recordPieChange(`pie:legend-color:${labelKey}`, previousColor, nextValue, val => applyPieColorValue(labelKey, val));
        previousColor = nextValue;
      }
    });
  }

  function drawPieLegend(svg, legendLayout, defaults = {}, svgDimensions = {}){
    const renderer = legendLayout?.renderer;
    if(!svg || !renderer || !renderer.entries.length){
      return null;
    }
    const stored = state.labelPositions || {};
    
    // Get SVG dimensions for relative positioning
    const svgWidth = svgDimensions.width || (svg.getAttribute('width') ? parseFloat(svg.getAttribute('width')) : 500);
    const svgHeight = svgDimensions.height || (svg.getAttribute('height') ? parseFloat(svg.getAttribute('height')) : 400);
    
    let resolvedX = Number.isFinite(defaults.x) ? defaults.x : 0;
    let resolvedY = Number.isFinite(defaults.y) ? defaults.y : 0;
    
    // Convert relative positions to absolute if needed
    if (stored?.legend) {
      if (stored.legend.relX !== undefined && stored.legend.relY !== undefined) {
        // Use relative positioning
        resolvedX = stored.legend.relX * svgWidth;
        resolvedY = stored.legend.relY * svgHeight;
      } else if (stored.legend.x !== undefined && stored.legend.y !== undefined) {
        // Use absolute positioning (backward compatibility)
        resolvedX = stored.legend.x;
        resolvedY = stored.legend.y;
      }
    }
    
    const legendGroup = renderer.draw(svg, { x: resolvedX, y: resolvedY });
    if(!legendGroup){
      return null;
    }
    const textNodes = legendGroup.querySelectorAll('text');
    textNodes.forEach((node, index) => {
      markFontEditable(node,'legend',`legend-${index}`);
    });
    if(!state.resizeState?.active && typeof Shared.enableLegendDrag === 'function'){
      Shared.enableLegendDrag(legendGroup, svg, {
        undoLabel: 'pie-legend',
        onDragEnd: pos => {
          state.labelPositions = state.labelPositions || { title: null, legend: null };
          // Store both absolute and relative positions
          const relX = pos.x / svgWidth;
          const relY = pos.y / svgHeight;
          state.labelPositions.legend = { 
            x: pos.x, 
            y: pos.y,
            relX: relX, 
            relY: relY 
          };
          if(Shared.isDebugEnabled?.()){
            pieDebug('Debug: pie legend position saved', { absolute: pos, relative: { relX, relY } });
          }
        }
      });
    }
    return legendGroup;
  }

  let pieLegendControl = null;

  function ensurePieLegendControlPlacement(){
    if(!pieLegendControl || !state.svgBox){
      return;
    }
    if(Shared.resizer && typeof Shared.resizer.ensureLegendControlPlacement === 'function'){
      Shared.resizer.ensureLegendControlPlacement({
        svgBox: state.svgBox,
        control: pieLegendControl,
        debugLabel: 'pie-legend'
      });
    }
  }

  function getPieStatsConfig(){
    if(!state.statsConfig || typeof state.statsConfig !== 'object'){
      state.statsConfig = createDefaultPieStatsConfig();
    }
    if(!(state.statsConfig.selectedCols instanceof Set)){
      state.statsConfig.selectedCols = new Set(Array.isArray(state.statsConfig.selectedCols) ? state.statsConfig.selectedCols : []);
    }
    if(!(state.statsConfig.customPairs instanceof Set)){
      state.statsConfig.customPairs = new Set(Array.isArray(state.statsConfig.customPairs) ? state.statsConfig.customPairs : []);
    }
    if(!state.statsConfig.advisor || typeof state.statsConfig.advisor !== 'object'){
      state.statsConfig.advisor = { open: false, activated: false, answers: {} };
    }
    if(!state.statsConfig.advisor.answers || typeof state.statsConfig.advisor.answers !== 'object'){
      state.statsConfig.advisor.answers = {};
    }
    return state.statsConfig;
  }

  function getPieAdvisorState(){
    const stats = getPieStatsConfig();
    if(!stats.advisor || typeof stats.advisor !== 'object'){
      stats.advisor = { open: false, activated: false, answers: {} };
    }
    if(!stats.advisor.answers || typeof stats.advisor.answers !== 'object'){
      stats.advisor.answers = {};
    }
    return stats.advisor;
  }

  function sanitizePieStatsScope(value){
    const allowed = new Set(['gof', 'all', 'reference', 'custom']);
    return allowed.has(value) ? value : PIE_STATS_DEFAULT_SCOPE;
  }

  function sanitizePieStatsTest(value){
    const allowed = new Set(['chi-square', 'g-test', 'auto']);
    return allowed.has(value) ? value : PIE_STATS_DEFAULT_TEST;
  }

  function sanitizePieStatsAlpha(value){
    const numeric = Number(value);
    if(Number.isFinite(numeric) && numeric > 0 && numeric < 1){
      return numeric;
    }
    return PIE_STATS_DEFAULT_ALPHA;
  }

  function sanitizePieStatsSparseThreshold(value){
    const numeric = Math.floor(Number(value));
    if(Number.isFinite(numeric) && numeric >= 1 && numeric <= 100){
      return numeric;
    }
    return PIE_STATS_DEFAULT_SPARSE_THRESHOLD;
  }

  function parsePieColumnIndex(value){
    if(value === '' || value === null || value === undefined){
      return null;
    }
    const numeric = Number(value);
    if(Number.isInteger(numeric) && numeric >= 1){
      return numeric;
    }
    return null;
  }

  function getPieCorrectionOptions(){
    const keys = ['none', 'bonferroni', 'holm', 'holm-sidak', 'sidak', 'hochberg', 'bh', 'by'];
    const resolver = Shared.stats && typeof Shared.stats.getCorrectionMeta === 'function'
      ? Shared.stats.getCorrectionMeta
      : null;
    return keys.map(key => {
      if(resolver){
        const meta = resolver(key);
        return { value: key, label: meta?.label || key, shortLabel: meta?.shortLabel || meta?.label || key, footnote: meta?.footnote || null };
      }
      return { value: key, label: key, shortLabel: key, footnote: null };
    });
  }

  function sanitizePieStatsCorrection(value){
    const options = getPieCorrectionOptions();
    const option = options.find(entry => entry.value === value);
    return option ? option.value : PIE_STATS_DEFAULT_CORRECTION;
  }

  function formatPieStatNumber(value, digits = 4){
    const numeric = Number(value);
    if(!Number.isFinite(numeric)){
      return 'N/A';
    }
    return numeric.toFixed(Math.max(0, digits));
  }

  function formatPiePValue(value){
    const numeric = Number(value);
    if(!Number.isFinite(numeric)){
      return 'N/A';
    }
    if(typeof Shared.formatPValue === 'function'){
      return Shared.formatPValue(numeric);
    }
    return numeric.toExponential(5);
  }

  function setPieStatsStatus(message){
    const node = getPieNodeById('pieStatsStatus');
    if(!node){
      return;
    }
    node.textContent = message || '';
  }

  function updatePieStatsButtonState(options = {}){
    const button = getPieNodeById('pieComputeStats');
    if(!button){
      return;
    }
    if(Object.prototype.hasOwnProperty.call(options, 'disabled')){
      button.disabled = !!options.disabled;
    }
    if(typeof options.label === 'string' && options.label){
      button.textContent = options.label;
    }
  }

  function clearPieStatsOutputs(message){
    const out = getPieNodeById('pieStatsResults');
    if(!out){
      return;
    }
    clearPieStatsReportHost(out);
    out.innerHTML = '';
    const msg = document.createElement('div');
    msg.className = 'stats-table-message';
    msg.textContent = message || 'Statistics will appear after calculation.';
    out.appendChild(msg);
  }

  function pieStatsPanelHasRenderedResults(){
    const out = getPieNodeById('pieStatsResults');
    if(!out || typeof out.querySelector !== 'function'){
      return false;
    }
    return !!out.querySelector('.stats-table-card, table, .stats-report-panel, .stats-assumption-container');
  }

  let pieStatsSummaryTabIdCounter = 0;
  function sanitizePieStatsResultsTab(value){
    return value === 'comparisons' ? 'comparisons' : 'overall';
  }

  function readPieStatsCardCaption(node){
    if(!node || node.nodeType !== 1){
      return '';
    }
    const captionNode = node.querySelector?.('.stats-table-caption');
    if(captionNode && captionNode.textContent){
      return String(captionNode.textContent).trim();
    }
    const attrCaption = node.getAttribute?.('data-stats-caption');
    return attrCaption ? String(attrCaption).trim() : '';
  }

  function isPieOverallStatsCard(node){
    return /^Overall test summary$/i.test(readPieStatsCardCaption(node))
      || /^Overall categorical test$/i.test(readPieStatsCardCaption(node));
  }

  function isPieComparisonStatsCard(node){
    return /pairwise comparisons|pairwise condition comparisons|comparisons vs reference|multiple comparisons/i.test(readPieStatsCardCaption(node));
  }

  function setPieStatsSummaryTabSelection(wrapper, tab){
    if(!wrapper){
      return;
    }
    const stats = getPieStatsConfig();
    const nextTab = sanitizePieStatsResultsTab(tab);
    wrapper.setAttribute('data-active-tab', nextTab);
    Array.from(wrapper.querySelectorAll('.box-stats-summary-tabs__tab')).forEach(button => {
      const isActive = button.getAttribute('data-tab') === nextTab;
      button.classList.toggle('box-stats-summary-tabs__tab--active', isActive);
      button.setAttribute('aria-selected', isActive ? 'true' : 'false');
      button.tabIndex = isActive ? 0 : -1;
    });
    Array.from(wrapper.querySelectorAll('.box-stats-summary-tabs__panel')).forEach(panel => {
      const isActive = panel.getAttribute('data-tab') === nextTab;
      panel.hidden = !isActive;
      panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    });
    stats.resultsTab = nextTab;
    if(pieDebugEnabled()){
      pieDebug('Debug: pie stats summary tab selected', { tab: nextTab });
    }
  }

  function buildPieStatsSummaryTabButton(label, tab){
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'box-stats-summary-tabs__tab';
    button.textContent = label;
    button.setAttribute('data-tab', tab);
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', 'false');
    button.tabIndex = -1;
    button.addEventListener('click', () => {
      setPieStatsSummaryTabSelection(button.closest('.box-stats-summary-tabs'), tab);
    });
    return button;
  }

  function buildPieStatsSummaryPanel(tab, labelledBy){
    const panel = document.createElement('div');
    panel.className = 'box-stats-summary-tabs__panel';
    panel.setAttribute('data-tab', tab);
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', labelledBy);
    panel.hidden = true;
    return panel;
  }

  function mountPieStatsSummaryTabs(resultsContainer){
    if(!resultsContainer || resultsContainer.nodeType !== 1){
      return false;
    }
    const cards = Array.from(resultsContainer.children).filter(node => node?.classList?.contains('stats-table-card'));
    if(cards.length < 2){
      return false;
    }
    const overallCard = cards.find(isPieOverallStatsCard);
    const comparisonsCard = cards.find(isPieComparisonStatsCard);
    if(!overallCard || !comparisonsCard || overallCard === comparisonsCard){
      return false;
    }
    const wrapper = document.createElement('div');
    wrapper.className = 'box-stats-summary-tabs';
    wrapper.setAttribute('role', 'region');
    wrapper.setAttribute('aria-label', 'Pie statistical summaries');
    const tabList = document.createElement('div');
    tabList.className = 'box-stats-summary-tabs__tablist';
    tabList.setAttribute('role', 'tablist');
    const tabIdSuffix = String((pieStatsSummaryTabIdCounter += 1));
    const overallButton = buildPieStatsSummaryTabButton('Overall test summary', 'overall');
    overallButton.id = `pieStatsSummaryTabOverall-${tabIdSuffix}`;
    const comparisonsButton = buildPieStatsSummaryTabButton('Multiple comparisons', 'comparisons');
    comparisonsButton.id = `pieStatsSummaryTabComparisons-${tabIdSuffix}`;
    const overallPanel = buildPieStatsSummaryPanel('overall', overallButton.id);
    const comparisonsPanel = buildPieStatsSummaryPanel('comparisons', comparisonsButton.id);
    tabList.appendChild(overallButton);
    tabList.appendChild(comparisonsButton);
    resultsContainer.insertBefore(wrapper, overallCard);
    overallPanel.appendChild(overallCard);
    comparisonsPanel.appendChild(comparisonsCard);
    wrapper.appendChild(tabList);
    wrapper.appendChild(overallPanel);
    wrapper.appendChild(comparisonsPanel);
    const stats = getPieStatsConfig();
    setPieStatsSummaryTabSelection(wrapper, sanitizePieStatsResultsTab(stats.resultsTab));
    if(pieDebugEnabled()){
      pieDebug('Debug: pie stats summary tabs mounted', {
        overallCaption: readPieStatsCardCaption(overallCard),
        comparisonsCaption: readPieStatsCardCaption(comparisonsCard),
        activeTab: stats.resultsTab
      });
    }
    return true;
  }

  function getPieStatsDataMatrix(){
    return typeof state.hot?.getIncludedDataMatrix === 'function'
      ? state.hot.getIncludedDataMatrix()
      : (Shared.hot?.getIncludedDataMatrix ? Shared.hot.getIncludedDataMatrix(state.hot) : []);
  }

  function buildPieStatsDataModel(matrix){
    const rows = Array.isArray(matrix) ? matrix : [];
    const header = Array.isArray(rows[0]) ? rows[0] : [];
    const maxCols = rows.reduce((max, row) => {
      if(!Array.isArray(row)){
        return max;
      }
      return Math.max(max, row.length);
    }, header.length || 0);
    const columns = [];
    for(let col = 1; col < maxCols; col += 1){
      const rawHeader = header[col];
      const hasHeader = rawHeader != null && String(rawHeader).trim() !== '';
      const hasData = rows.some((row, rowIndex) => {
        if(rowIndex === 0 || !Array.isArray(row)){
          return false;
        }
        const cell = row[col];
        return cell != null && String(cell).trim() !== '';
      });
      if(!hasHeader && !hasData){
        continue;
      }
      const label = hasHeader ? String(rawHeader).trim() : `Column ${col + 1}`;
      columns.push({ index: col, label });
    }
    const normalizedRows = [];
    for(let rowIndex = 1; rowIndex < rows.length; rowIndex += 1){
      const row = rows[rowIndex];
      if(!Array.isArray(row)){
        continue;
      }
      const categoryRaw = row[0];
      const category = categoryRaw == null ? '' : String(categoryRaw).trim();
      if(!category){
        continue;
      }
      const values = {};
      let hasFinite = false;
      columns.forEach(column => {
        const raw = row[column.index];
        const numeric = Number.parseFloat(raw);
        const value = Number.isFinite(numeric) ? numeric : NaN;
        values[column.index] = value;
        if(Number.isFinite(value)){
          hasFinite = true;
        }
      });
      if(!hasFinite){
        continue;
      }
      normalizedRows.push({ category, values });
    }
    return { columns, rows: normalizedRows };
  }

  function findPieColumn(dataModel, index){
    return (dataModel?.columns || []).find(column => column.index === index) || null;
  }

  function normalizePiePairKey(a, b){
    const x = Number(a);
    const y = Number(b);
    if(!Number.isInteger(x) || !Number.isInteger(y) || x === y){
      return null;
    }
    const lo = Math.min(x, y);
    const hi = Math.max(x, y);
    return `${lo}|${hi}`;
  }

  function parsePiePairKey(key){
    const parts = String(key || '').split('|');
    if(parts.length !== 2){
      return null;
    }
    const a = Number(parts[0]);
    const b = Number(parts[1]);
    if(!Number.isInteger(a) || !Number.isInteger(b) || a === b){
      return null;
    }
    return { a: Math.min(a, b), b: Math.max(a, b) };
  }

  function ensurePieStatsSelections(dataModel){
    const stats = getPieStatsConfig();
    const available = Array.isArray(dataModel?.columns) ? dataModel.columns.slice() : [];
    const availableSet = new Set(available.map(column => column.index));
    const nextSelected = new Set();
    stats.selectedCols.forEach(index => {
      if(availableSet.has(index)){
        nextSelected.add(index);
      }
    });
    if(!nextSelected.size && available.length){
      available.forEach(column => nextSelected.add(column.index));
    }
    stats.selectedCols = nextSelected;
    const selectedList = Array.from(stats.selectedCols).sort((a, b) => a - b);
    if(!selectedList.length){
      stats.referenceColumn = null;
    }else if(!selectedList.includes(stats.referenceColumn)){
      stats.referenceColumn = selectedList[0];
    }
    const expectedNamed = available.find(column => column.label.trim().toLowerCase() === 'expected') || null;
    if(!availableSet.has(stats.valueColumn)){
      stats.valueColumn = selectedList[0] ?? (available[0]?.index ?? null);
    }
    if(!availableSet.has(stats.expectedColumn)){
      stats.expectedColumn = expectedNamed?.index
        ?? (selectedList[1] ?? available[1]?.index ?? selectedList[0] ?? available[0]?.index ?? null);
    }
    if(stats.valueColumn === stats.expectedColumn && available.length > 1){
      const fallback = available.find(column => column.index !== stats.valueColumn);
      if(fallback){
        stats.expectedColumn = fallback.index;
      }
    }
    const validCustomPairs = new Set();
    stats.customPairs.forEach(key => {
      const parsed = parsePiePairKey(key);
      if(!parsed){
        return;
      }
      if(!stats.selectedCols.has(parsed.a) || !stats.selectedCols.has(parsed.b)){
        return;
      }
      const normalized = normalizePiePairKey(parsed.a, parsed.b);
      if(normalized){
        validCustomPairs.add(normalized);
      }
    });
    stats.customPairs = validCustomPairs;
    stats.scope = sanitizePieStatsScope(stats.scope);
    stats.test = sanitizePieStatsTest(stats.test);
    stats.correction = sanitizePieStatsCorrection(stats.correction);
    stats.alpha = sanitizePieStatsAlpha(stats.alpha);
    stats.sparseThreshold = sanitizePieStatsSparseThreshold(stats.sparseThreshold);
    stats.yatesCorrection = stats.yatesCorrection !== false;
    stats.resultsTab = sanitizePieStatsResultsTab(stats.resultsTab);
  }

  function derivePieScopePairs(stats){
    const selected = Array.from(stats.selectedCols || []).sort((a, b) => a - b);
    if(selected.length < 2){
      return [];
    }
    if(stats.scope === 'reference'){
      if(!selected.includes(stats.referenceColumn)){
        return [];
      }
      return selected
        .filter(index => index !== stats.referenceColumn)
        .map(index => {
          const key = normalizePiePairKey(stats.referenceColumn, index);
          return key ? { key, a: Math.min(stats.referenceColumn, index), b: Math.max(stats.referenceColumn, index) } : null;
        })
        .filter(Boolean);
    }
    if(stats.scope === 'custom'){
      const pairs = [];
      stats.customPairs.forEach(key => {
        const parsed = parsePiePairKey(key);
        if(!parsed){
          return;
        }
        if(!selected.includes(parsed.a) || !selected.includes(parsed.b)){
          return;
        }
        const normalized = normalizePiePairKey(parsed.a, parsed.b);
        if(normalized){
          pairs.push({ key: normalized, a: parsed.a, b: parsed.b });
        }
      });
      return pairs.sort((left, right) => left.a - right.a || left.b - right.b);
    }
    const pairs = [];
    for(let i = 0; i < selected.length; i += 1){
      for(let j = i + 1; j < selected.length; j += 1){
        const a = selected[i];
        const b = selected[j];
        const key = normalizePiePairKey(a, b);
        if(key){
          pairs.push({ key, a, b });
        }
      }
    }
    return pairs;
  }

  function estimatePieStatsComparisonCount(){
    const stats = getPieStatsConfig();
    if(stats.scope === 'gof'){
      return 1;
    }
    return derivePieScopePairs(stats).length;
  }

  function updatePieStatsCorrectionSummary(testCount){
    const note = getPieNodeById('pieStatsCorrectionNote');
    if(!note){
      return;
    }
    const stats = getPieStatsConfig();
    if(stats.scope === 'gof'){
      note.textContent = 'Goodness-of-fit mode runs one observed-versus-expected comparison.';
      return;
    }
    if(testCount <= 0){
      note.textContent = 'Select at least two conditions to enable comparisons.';
      return;
    }
    if(testCount === 1){
      note.textContent = 'One comparison selected. Multiplicity correction is not required.';
      return;
    }
    const correctionMeta = Shared.stats && typeof Shared.stats.getCorrectionMeta === 'function'
      ? Shared.stats.getCorrectionMeta(stats.correction)
      : { label: stats.correction };
    note.textContent = `Multiple-testing correction: ${correctionMeta?.label || stats.correction} (${testCount} tests).`;
  }

  function buildPieStatsDataSignature(dataModel){
    const columns = Array.isArray(dataModel?.columns) ? dataModel.columns : [];
    const rows = Array.isArray(dataModel?.rows) ? dataModel.rows : [];
    const columnPart = columns.map(column => `${column.index}:${column.label}`).join(';');
    const rowPart = rows.map(row => {
      const valuePart = columns.map(column => {
        const value = row.values?.[column.index];
        return Number.isFinite(value) ? String(value) : 'NaN';
      }).join(',');
      return `${row.category}|${valuePart}`;
    }).join(';');
    return `${columnPart}::${rowPart}`;
  }

  function buildPieStatsContextSignature(dataModel){
    const stats = getPieStatsConfig();
    const selectedCols = Array.from(stats.selectedCols || []).sort((a, b) => a - b).join(',');
    const customPairs = Array.from(stats.customPairs || []).sort().join(',');
    const configPart = [
      sanitizePieStatsScope(stats.scope),
      sanitizePieStatsTest(stats.test),
      sanitizePieStatsCorrection(stats.correction),
      String(sanitizePieStatsAlpha(stats.alpha)),
      String(sanitizePieStatsSparseThreshold(stats.sparseThreshold)),
      stats.yatesCorrection ? 'yates' : 'no-yates',
      String(stats.referenceColumn ?? ''),
      String(stats.valueColumn ?? ''),
      String(stats.expectedColumn ?? ''),
      selectedCols,
      customPairs
    ].join('|');
    return `${configPart}::${buildPieStatsDataSignature(dataModel)}`;
  }

  function requestPieStatsContextRefresh(reason){
    const stats = getPieStatsConfig();
    stats.contextSignature = null;
    stats.pending = false;
    stats.restorePending = null;
    clearPieStatsOutputs('Statistics ready to calculate.');
    setPieStatsStatus('Statistics ready to calculate.');
    updatePieStatsButtonState({ disabled: false, label: 'Calculate statistics' });
    updatePieStatsCorrectionSummary(estimatePieStatsComparisonCount());
    if(pieDebugEnabled()){
      pieDebug('Debug: pie stats context refresh requested', { reason: reason || 'unspecified' });
    }
  }

  function primePieStatsComputation(options = {}){
    const matrix = options.matrix || getPieStatsDataMatrix();
    const dataModel = buildPieStatsDataModel(matrix);
    state.statsDataModel = dataModel;
    ensurePieStatsSelections(dataModel);
    renderPieStatsControls(dataModel, { reason: options.reason || 'prime' });
    const signature = buildPieStatsContextSignature(dataModel);
    const stats = getPieStatsConfig();
    const hasRows = Array.isArray(dataModel.rows) && dataModel.rows.length > 0;
    if(!hasRows){
      stats.contextSignature = signature;
      stats.lastRunSignature = null;
      stats.restorePending = null;
      clearPieStatsOutputs('Add data to enable statistics.');
      setPieStatsStatus('Statistics unavailable until data is loaded.');
      updatePieStatsButtonState({ disabled: true, label: 'Calculate statistics' });
      updatePieStatsCorrectionSummary(0);
      return;
    }
    if(stats.restorePending){
      const restored = stats.restorePending;
      stats.restorePending = null;
      if(!pieStatsPanelHasRenderedResults() && (restored.resultsHtml != null || restored.reportHtml != null)){
        const out = getPieNodeById('pieStatsResults');
        if(out){
          if(Shared.statsReporting && typeof Shared.statsReporting.restorePanelHtml === 'function'){
            Shared.statsReporting.restorePanelHtml(out, restored, {
              ensureReportHost: () => ensurePieStatsReportHost(out)
            });
          }else{
            try{ out.innerHTML = restored.resultsHtml || ''; }catch(_err){ out.textContent = String(restored.resultsHtml || ''); }
          }
        }
      }
      if(restored.hasResults && pieStatsPanelHasRenderedResults()){
        stats.contextSignature = signature;
        stats.lastRunSignature = signature;
        setPieStatsStatus('Statistics up to date.');
        updatePieStatsButtonState({ disabled: false, label: 'Recalculate statistics' });
        updatePieStatsCorrectionSummary(estimatePieStatsComparisonCount());
        if(pieDebugEnabled()){
          pieDebug('Debug: pie stats restored context adopted', {
            savedSignature: restored.lastRunSignature || null,
            currentSignature: signature
          });
        }
        return;
      }
    }
    if(stats.contextSignature !== signature){
      stats.contextSignature = signature;
      stats.lastRunSignature = null;
      clearPieStatsOutputs('Statistics ready to calculate.');
      setPieStatsStatus('Statistics ready to calculate.');
      updatePieStatsButtonState({ disabled: false, label: 'Calculate statistics' });
      updatePieStatsCorrectionSummary(estimatePieStatsComparisonCount());
      return;
    }
    if(stats.lastRunSignature === signature){
      setPieStatsStatus('Statistics up to date.');
      updatePieStatsButtonState({ disabled: false, label: 'Recalculate statistics' });
    }else{
      setPieStatsStatus('Statistics ready to calculate.');
      updatePieStatsButtonState({ disabled: false, label: 'Calculate statistics' });
    }
    updatePieStatsCorrectionSummary(estimatePieStatsComparisonCount());
  }

  function buildPieContingencyDataset(dataModel, columnIndices){
    const indices = Array.isArray(columnIndices) ? columnIndices.slice() : [];
    const rows = [];
    const labels = [];
    let skipped = 0;
    (dataModel?.rows || []).forEach(row => {
      const values = indices.map(index => Number(row.values?.[index]));
      const valid = values.every(value => Number.isFinite(value) && value >= 0);
      if(!valid){
        skipped += 1;
        return;
      }
      rows.push(values);
      labels.push(row.category);
    });
    return { rows, labels, skipped };
  }

  function inferPieExpectedColumn(dataModel, excludedIndex){
    const columns = Array.isArray(dataModel?.columns) ? dataModel.columns : [];
    const expectedByName = columns.find(column => (
      column.index !== excludedIndex
      && String(column.label || '').trim().toLowerCase() === 'expected'
    ));
    if(expectedByName){
      return expectedByName.index;
    }
    const firstOther = columns.find(column => column.index !== excludedIndex);
    return firstOther ? firstOther.index : null;
  }

  function buildPieAdvisorContext(dataModel){
    const stats = getPieStatsConfig();
    const selected = Array.from(stats.selectedCols || []).sort((a, b) => a - b);
    const selectedLabels = selected.map(index => findPieColumn(dataModel, index)?.label || `Column ${index}`);
    const comparisonCount = estimatePieStatsComparisonCount();
    let sparseConcern = false;
    let sparseCellCount = 0;
    let sparseThreshold = sanitizePieStatsSparseThreshold(stats.sparseThreshold);
    if(selected.length >= 2){
      const dataset = buildPieContingencyDataset(dataModel, selected);
      const result = computePieContingencyTest(dataset.rows, {
        method: 'chi-square',
        sparseThreshold,
        yatesCorrection: false
      });
      if(result.ok){
        sparseCellCount = Number.isFinite(result.sparseCellCount) ? result.sparseCellCount : 0;
        sparseThreshold = result.sparseThreshold;
        sparseConcern = sparseCellCount > 0 || (Number.isFinite(result.minExpected) && result.minExpected < 1);
      }
    }
    return {
      selectedCount: selected.length,
      selectedLabels,
      comparisonCount,
      sparseConcern,
      sparseCellCount,
      sparseThreshold
    };
  }

  function ensurePieAdvisorDefaults(context){
    const advisor = getPieAdvisorState();
    const answers = advisor.answers;
    if(answers.objective !== 'gof' && answers.objective !== 'compare'){
      answers.objective = context.selectedCount >= 3 ? 'compare' : 'gof';
    }
    if(answers.scope !== 'all' && answers.scope !== 'reference' && answers.scope !== 'custom'){
      answers.scope = 'all';
    }
    if(answers.sparse !== 'yes' && answers.sparse !== 'no' && answers.sparse !== 'unsure'){
      answers.sparse = context.sparseConcern ? 'yes' : 'no';
    }
    return answers;
  }

  function buildPieAdvisorQuestions(context, answers){
    const questions = [
      {
        id: 'objective',
        prompt: 'What analysis do you want to run?',
        help: `Detected ${context.selectedCount} selected condition${context.selectedCount === 1 ? '' : 's'}.`,
        options: [
          { value: 'gof', label: 'Observed vs expected (goodness-of-fit)' },
          { value: 'compare', label: 'Compare multiple conditions (homogeneity + pairwise)' }
        ]
      }
    ];
    if(answers.objective === 'compare'){
      questions.push({
        id: 'scope',
        prompt: 'How should pairwise comparisons be configured?',
        help: `Current multiplicity family size: ${context.comparisonCount} comparison${context.comparisonCount === 1 ? '' : 's'}.`,
        options: [
          { value: 'all', label: 'All pairwise' },
          { value: 'reference', label: 'Versus one reference condition' },
          { value: 'custom', label: 'Manually selected custom pairs' }
        ]
      });
      questions.push({
        id: 'sparse',
        prompt: 'Are sparse expected counts a concern?',
        help: `Estimated sparse cells (< ${context.sparseThreshold} expected): ${context.sparseCellCount}.`,
        options: [
          { value: 'yes', label: 'Yes, sparse counts are likely' },
          { value: 'no', label: 'No, expected counts look adequate' },
          { value: 'unsure', label: 'Not sure' }
        ]
      });
    }else{
      questions.push({
        id: 'sparse',
        prompt: 'For GOF, do you expect sparse categories?',
        help: 'Sparse categories can favor the likelihood-ratio (G) test.',
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
          { value: 'unsure', label: 'Not sure' }
        ]
      });
    }
    return questions;
  }

  function computePieAdvisorRecommendation(rawAnswers, context){
    const answers = rawAnswers || {};
    const objective = answers.objective;
    if(objective !== 'gof' && objective !== 'compare'){
      return {
        ready: false,
        message: 'Choose whether you want observed-vs-expected or multi-condition comparisons.'
      };
    }
    if(objective === 'gof'){
      if(context.selectedCount < 2){
        return {
          ready: false,
          message: 'Select at least two columns so observed and expected columns can be assigned.'
        };
      }
      const sparse = answers.sparse;
      const preferG = sparse === 'yes';
      return {
        ready: true,
        summary: `Use a goodness-of-fit test (${preferG ? 'G-test' : 'chi-square'}) for one observed column against one expected column.`,
        rationale: [
          'Goodness-of-fit is the correct analysis when one observed vector is tested against an expected vector.',
          preferG
            ? 'Sparse categories are better handled by the likelihood-ratio G-test.'
            : 'Chi-square goodness-of-fit is appropriate when expected counts are not sparse.'
        ],
        warnings: [
          'Observed counts must be non-negative and expected values strictly positive.',
          'Interpret pairwise comparisons only in multi-condition mode, not in GOF mode.'
        ],
        apply: {
          scope: 'gof',
          test: preferG ? 'g-test' : 'chi-square'
        }
      };
    }
    if(context.selectedCount < 2){
      return {
        ready: false,
        message: 'Select at least two conditions before running multiple comparisons.'
      };
    }
    const scope = (answers.scope === 'reference' || answers.scope === 'custom') ? answers.scope : 'all';
    const sparse = answers.sparse;
    const preferG = sparse === 'yes' || (sparse === 'unsure' && context.sparseConcern);
    const recommendedCorrection = context.comparisonCount > 1 ? 'holm' : 'none';
    const scopeLabel = scope === 'reference'
      ? 'comparisons vs a reference'
      : scope === 'custom'
        ? 'custom pairwise comparisons'
        : 'all pairwise comparisons';
    return {
      ready: true,
      summary: `Use an overall homogeneity test plus ${scopeLabel}, with ${recommendedCorrection === 'none' ? 'no multiplicity adjustment needed' : 'Holm multiplicity control'}.`,
      rationale: [
        'For multiple conditions, first test overall independence/homogeneity, then inspect pairwise contrasts.',
        preferG
          ? 'Sparse expected counts suggest using the likelihood-ratio G-test.'
          : 'Chi-square is suitable when expected counts are adequately populated.',
        recommendedCorrection === 'holm'
          ? 'Holm provides strong family-wise error control for multiple pairwise p-values.'
          : 'With a single comparison, multiplicity correction is not required.'
      ],
      warnings: [
        'If many expected cells are sparse, interpret asymptotic p-values cautiously.',
        'Always report effect size (Cramer\'s V) with p-values.'
      ],
      apply: {
        scope,
        test: preferG ? 'g-test' : 'chi-square',
        correction: recommendedCorrection,
        yatesCorrection: true
      }
    };
  }

  function renderPieStatsAdvisor(dataModel, controls){
    if(!controls){
      return;
    }
    const advisorState = getPieAdvisorState();
    const context = buildPieAdvisorContext(dataModel);
    const answers = ensurePieAdvisorDefaults(context);
    const recommendation = computePieAdvisorRecommendation(answers, context);
    const container = document.createElement('div');
    container.className = 'stats-advisor';
    container.dataset.open = advisorState.open ? '1' : '0';

    const header = document.createElement('div');
    header.className = 'stats-advisor__header';
    const title = document.createElement('strong');
    title.textContent = 'Statistics advisor';
    header.appendChild(title);
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'stats-advisor__toggle';
    toggle.textContent = advisorState.open ? 'Hide advisor' : 'Guide me';
    toggle.addEventListener('click', () => {
      advisorState.open = !advisorState.open;
      if(advisorState.open && !advisorState.activated){
        advisorState.activated = true;
      }
      if(pieDebugEnabled()){
        pieDebug('Debug: pie statsAdvisor toggled', { open: advisorState.open });
      }
      renderPieStatsControls(dataModel, { force: true, reason: 'advisor-toggle' });
    });
    header.appendChild(toggle);
    container.appendChild(header);

    const summary = document.createElement('div');
    summary.className = 'stats-advisor__summary';
    if(!advisorState.activated){
      const msg = document.createElement('div');
      msg.textContent = 'Press the "Guide me" button to view advisor recommendations.';
      summary.appendChild(msg);
    }else if(recommendation.ready){
      const summaryLine = document.createElement('div');
      summaryLine.className = 'stats-advisor__summary-line';
      summaryLine.textContent = `Recommendation: ${recommendation.summary}`;
      summary.appendChild(summaryLine);
      if(Array.isArray(recommendation.rationale) && recommendation.rationale.length){
        const rationaleList = document.createElement('ul');
        rationaleList.className = 'stats-advisor__rationale';
        recommendation.rationale.forEach(item => {
          const li = document.createElement('li');
          li.textContent = item;
          rationaleList.appendChild(li);
        });
        summary.appendChild(rationaleList);
      }
      if(Array.isArray(recommendation.warnings) && recommendation.warnings.length){
        const warnTitle = document.createElement('div');
        warnTitle.className = 'stats-advisor__warnings-title';
        warnTitle.textContent = 'Cautions:';
        summary.appendChild(warnTitle);
        const warnList = document.createElement('ul');
        warnList.className = 'stats-advisor__warnings';
        recommendation.warnings.forEach(item => {
          const li = document.createElement('li');
          li.textContent = item;
          warnList.appendChild(li);
        });
        summary.appendChild(warnList);
      }
    }else{
      const msg = document.createElement('div');
      msg.textContent = recommendation.message || 'Answer the advisor questions to receive a recommendation.';
      summary.appendChild(msg);
    }
    container.appendChild(summary);

    if(advisorState.open){
      const questions = buildPieAdvisorQuestions(context, answers);
      const questionsWrap = document.createElement('div');
      questionsWrap.className = 'stats-advisor__questions';
      questions.forEach(question => {
        const fieldset = document.createElement('fieldset');
        fieldset.className = 'stats-advisor__question';
        const legend = document.createElement('legend');
        legend.textContent = question.prompt;
        fieldset.appendChild(legend);
        if(question.help){
          const hint = document.createElement('p');
          hint.className = 'stats-advisor__hint';
          hint.textContent = question.help;
          fieldset.appendChild(hint);
        }
        (question.options || []).forEach(opt => {
          const optionWrap = document.createElement('label');
          optionWrap.className = 'stats-advisor__option';
          const input = document.createElement('input');
          input.type = 'radio';
          input.name = `pie-advisor-${question.id}`;
          input.value = opt.value;
          input.checked = answers[question.id] === opt.value;
          input.addEventListener('change', () => {
            answers[question.id] = opt.value;
            if(pieDebugEnabled()){
              pieDebug('Debug: pie statsAdvisor answer change', { question: question.id, value: opt.value });
            }
            renderPieStatsControls(dataModel, { force: true, reason: 'advisor-answer-change' });
          });
          const span = document.createElement('span');
          span.textContent = opt.label;
          optionWrap.appendChild(input);
          optionWrap.appendChild(span);
          fieldset.appendChild(optionWrap);
        });
        questionsWrap.appendChild(fieldset);
      });
      container.appendChild(questionsWrap);

      const actions = document.createElement('div');
      actions.className = 'stats-advisor__actions';
      const applyBtn = document.createElement('button');
      applyBtn.type = 'button';
      applyBtn.textContent = 'Apply recommendation';
      applyBtn.disabled = !recommendation.ready || !recommendation.apply;
      applyBtn.addEventListener('click', () => {
        if(!recommendation.ready || !recommendation.apply){
          return;
        }
        const stats = getPieStatsConfig();
        stats.scope = sanitizePieStatsScope(recommendation.apply.scope ?? stats.scope);
        stats.test = sanitizePieStatsTest(recommendation.apply.test ?? stats.test);
        if(Object.prototype.hasOwnProperty.call(recommendation.apply, 'correction')){
          stats.correction = sanitizePieStatsCorrection(recommendation.apply.correction);
        }
        if(Object.prototype.hasOwnProperty.call(recommendation.apply, 'yatesCorrection')){
          stats.yatesCorrection = !!recommendation.apply.yatesCorrection;
        }
        ensurePieStatsSelections(dataModel);
        if(stats.scope === 'gof'){
          const selected = Array.from(stats.selectedCols || []).sort((a, b) => a - b);
          const observed = selected[0] ?? stats.valueColumn;
          const expected = inferPieExpectedColumn(dataModel, observed);
          if(Number.isInteger(observed)){
            stats.valueColumn = observed;
          }
          if(Number.isInteger(expected)){
            stats.expectedColumn = expected;
          }
        }else if(stats.scope === 'reference'){
          const selected = Array.from(stats.selectedCols || []).sort((a, b) => a - b);
          if(!selected.includes(stats.referenceColumn)){
            stats.referenceColumn = selected[0] ?? null;
          }
        }
        if(pieDebugEnabled()){
          pieDebug('Debug: pie statsAdvisor applied', {
            scope: stats.scope,
            test: stats.test,
            correction: stats.correction,
            yatesCorrection: stats.yatesCorrection,
            answers: { ...answers }
          });
        }
        renderPieStatsControls(dataModel, { force: true, reason: 'advisor-apply' });
        requestPieStatsContextRefresh('advisor-apply');
      });
      actions.appendChild(applyBtn);

      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className = 'stats-advisor__reset';
      resetBtn.textContent = 'Reset answers';
      resetBtn.addEventListener('click', () => {
        advisorState.answers = {};
        if(pieDebugEnabled()){
          pieDebug('Debug: pie statsAdvisor reset');
        }
        renderPieStatsControls(dataModel, { force: true, reason: 'advisor-reset' });
      });
      actions.appendChild(resetBtn);
      container.appendChild(actions);
    }

    controls.appendChild(container);
  }

  function buildPieGofDataset(dataModel, observedIndex, expectedIndex){
    const observed = [];
    const expected = [];
    const labels = [];
    let skipped = 0;
    (dataModel?.rows || []).forEach(row => {
      const observedValue = Number(row.values?.[observedIndex]);
      const expectedValue = Number(row.values?.[expectedIndex]);
      if(!Number.isFinite(observedValue) || observedValue < 0 || !Number.isFinite(expectedValue) || expectedValue <= 0){
        skipped += 1;
        return;
      }
      observed.push(observedValue);
      expected.push(expectedValue);
      labels.push(row.category);
    });
    return { observed, expected, labels, skipped };
  }

  function computePieContingencyTest(table, options = {}){
    const rows = Array.isArray(table) ? table : [];
    const rowCount = rows.length;
    const colCount = rowCount ? rows[0].length : 0;
    if(rowCount < 2 || colCount < 2){
      return { ok: false, message: 'At least two categories and two conditions are required.' };
    }
    const rowSums = new Array(rowCount).fill(0);
    const colSums = new Array(colCount).fill(0);
    let total = 0;
    for(let rowIndex = 0; rowIndex < rowCount; rowIndex += 1){
      for(let colIndex = 0; colIndex < colCount; colIndex += 1){
        const value = Number(rows[rowIndex][colIndex]);
        if(!Number.isFinite(value) || value < 0){
          return { ok: false, message: 'Counts must be finite and non-negative.' };
        }
        rowSums[rowIndex] += value;
        colSums[colIndex] += value;
        total += value;
      }
    }
    if(!(total > 0)){
      return { ok: false, message: 'Total count must be greater than zero.' };
    }
    const expected = Array.from({ length: rowCount }, () => new Array(colCount).fill(0));
    let sparseCellCount = 0;
    let minExpected = Infinity;
    const sparseThreshold = sanitizePieStatsSparseThreshold(options.sparseThreshold);
    for(let rowIndex = 0; rowIndex < rowCount; rowIndex += 1){
      for(let colIndex = 0; colIndex < colCount; colIndex += 1){
        const exp = (rowSums[rowIndex] * colSums[colIndex]) / total;
        expected[rowIndex][colIndex] = exp;
        if(Number.isFinite(exp)){
          minExpected = Math.min(minExpected, exp);
          if(exp < sparseThreshold){
            sparseCellCount += 1;
          }
        }
      }
    }
    const method = sanitizePieStatsTest(options.method);
    const testMethod = method === 'auto' ? 'chi-square' : method;
    const useYates = !!options.yatesCorrection && testMethod === 'chi-square' && rowCount === 2 && colCount === 2;
    let statistic = 0;
    if(testMethod === 'g-test'){
      for(let rowIndex = 0; rowIndex < rowCount; rowIndex += 1){
        for(let colIndex = 0; colIndex < colCount; colIndex += 1){
          const obs = rows[rowIndex][colIndex];
          const exp = expected[rowIndex][colIndex];
          if(!(exp > 0)){
            if(obs > 0){
              return { ok: false, message: 'Unable to compute G-test because expected counts contain zeros.' };
            }
            continue;
          }
          if(obs > 0){
            statistic += 2 * obs * Math.log(obs / exp);
          }
        }
      }
    }else{
      for(let rowIndex = 0; rowIndex < rowCount; rowIndex += 1){
        for(let colIndex = 0; colIndex < colCount; colIndex += 1){
          const obs = rows[rowIndex][colIndex];
          const exp = expected[rowIndex][colIndex];
          if(!(exp > 0)){
            if(obs > 0){
              return { ok: false, message: 'Unable to compute chi-square because expected counts contain zeros.' };
            }
            continue;
          }
          let delta = obs - exp;
          if(useYates){
            const corrected = Math.max(0, Math.abs(delta) - 0.5);
            delta = delta >= 0 ? corrected : -corrected;
          }
          statistic += (delta * delta) / exp;
        }
      }
    }
    const df = Math.max(1, (rowCount - 1) * (colCount - 1));
    let pValue = NaN;
    if(global.jStat?.chisquare?.cdf){
      pValue = 1 - global.jStat.chisquare.cdf(statistic, df);
    }
    const minDim = Math.min(rowCount - 1, colCount - 1);
    const cramersV = minDim > 0 && total > 0 ? Math.sqrt(statistic / (total * minDim)) : NaN;
    return {
      ok: true,
      method: testMethod,
      statistic,
      df,
      pValue,
      total,
      rowCount,
      colCount,
      sparseCellCount,
      sparseThreshold,
      minExpected: Number.isFinite(minExpected) ? minExpected : NaN,
      cramersV,
      yatesApplied: useYates
    };
  }

  function computePieGofStats(observed, expected, options = {}){
    const obs = Array.isArray(observed) ? observed.map(Number) : [];
    const exp = Array.isArray(expected) ? expected.map(Number) : [];
    if(!obs.length){
      return { ok: false, message: 'No observed values supplied.' };
    }
    if(obs.length !== exp.length){
      return { ok: false, message: 'Observed and expected vectors must have the same length.' };
    }
    if(exp.some(value => !Number.isFinite(value) || value <= 0) || obs.some(value => !Number.isFinite(value) || value < 0)){
      return { ok: false, message: 'Observed values must be non-negative and expected values must be positive.' };
    }
    const method = sanitizePieStatsTest(options.method);
    const testMethod = method === 'auto' ? 'chi-square' : method;
    let statistic = 0;
    if(testMethod === 'g-test'){
      for(let index = 0; index < obs.length; index += 1){
        const observedValue = obs[index];
        const expectedValue = exp[index];
        if(observedValue > 0){
          statistic += 2 * observedValue * Math.log(observedValue / expectedValue);
        }
      }
    }else{
      statistic = obs.reduce((sum, value, index) => {
        const expectedValue = exp[index];
        return sum + Math.pow(value - expectedValue, 2) / expectedValue;
      }, 0);
    }
    const df = Math.max(1, obs.length - 1);
    let pValue = NaN;
    if(global.jStat?.chisquare?.cdf){
      pValue = 1 - global.jStat.chisquare.cdf(statistic, df);
    }
    const total = obs.reduce((sum, value) => sum + value, 0);
    const cramersV = total > 0 && df > 0 ? Math.sqrt(statistic / (total * df)) : NaN;
    return {
      ok: true,
      method: testMethod,
      statistic,
      df,
      pValue,
      cramersV,
      categories: obs.length,
      total
    };
  }

  function renderPieStatsModel(model){
    const out = getPieNodeById('pieStatsResults');
    if(!out){
      return;
    }
    clearPieStatsReportHost(out);
    out.innerHTML = '';
    const hasRenderer = Shared.statsTable && typeof Shared.statsTable.render === 'function';
    const renderTable = (tableModel, append = false) => {
      if(hasRenderer){
        Shared.statsTable.render({
          target: out,
          append,
          ...tableModel
        });
        return;
      }
      const wrap = document.createElement('div');
      wrap.className = 'stats-table-card';
      const caption = document.createElement('div');
      caption.className = 'stats-table-caption';
      caption.textContent = tableModel.caption || 'Statistics';
      wrap.appendChild(caption);
      const table = document.createElement('table');
      const head = document.createElement('thead');
      const headRow = document.createElement('tr');
      tableModel.columns.forEach(column => {
        const cell = document.createElement('th');
        cell.textContent = column.label;
        headRow.appendChild(cell);
      });
      head.appendChild(headRow);
      table.appendChild(head);
      const body = document.createElement('tbody');
      (tableModel.rows || []).forEach(row => {
        const tr = document.createElement('tr');
        tableModel.columns.forEach(column => {
          const td = document.createElement('td');
          td.textContent = row[column.key] ?? '';
          tr.appendChild(td);
        });
        body.appendChild(tr);
      });
      table.appendChild(body);
      wrap.appendChild(table);
      out.appendChild(wrap);
    };
    const summaryRows = [
      { metric: 'Test', value: model.summary.testLabel },
      { metric: 'Statistic', value: model.summary.statistic },
      { metric: 'df', value: model.summary.df },
      { metric: 'P value', value: model.summary.pValue },
      { metric: "Cramer's V", value: model.summary.cramersV }
    ];
    renderTable({
      caption: model.summary.caption,
      columns: [
        { key: 'metric', label: 'Metric', align: 'left' },
        { key: 'value', label: 'Value', align: 'right' }
      ],
      rows: summaryRows,
      footnotes: model.summary.footnotes || [],
      options: {
        fileName: 'pie-overall-statistics',
        contextLabel: 'pie-overall-statistics'
      }
    }, false);
    if(Array.isArray(model.pairs) && model.pairs.length){
      renderTable({
        caption: model.pairsCaption || 'Pairwise comparisons',
        columns: [
          { key: 'left', label: 'Condition A', align: 'left' },
          { key: 'right', label: 'Condition B', align: 'left' },
          { key: 'categories', label: 'Categories', align: 'right' },
          { key: 'total', label: 'Total count', align: 'right' },
          { key: 'statistic', label: 'Statistic', align: 'right' },
          { key: 'df', label: 'df', align: 'right' },
          { key: 'pValue', label: 'P value', align: 'right' },
          { key: 'pAdjusted', label: model.adjustedPLabel || 'P (adj)', align: 'right' },
          { key: 'cramersV', label: "Cramer's V", align: 'right' }
        ],
        rows: model.pairs,
        footnotes: model.pairFootnotes || [],
        options: {
          fileName: 'pie-pairwise-comparisons',
          contextLabel: 'pie-pairwise-comparisons'
        }
      }, true);
    }
    mountPieStatsSummaryTabs(out);
  }

  function handlePieStatsComputeClick(){
    const stats = getPieStatsConfig();
    const dataModel = state.statsDataModel || buildPieStatsDataModel(getPieStatsDataMatrix());
    state.statsDataModel = dataModel;
    ensurePieStatsSelections(dataModel);
    const signature = buildPieStatsContextSignature(dataModel);
    if(!Array.isArray(dataModel.rows) || !dataModel.rows.length){
      clearPieStatsOutputs('Add data to enable statistics.');
      setPieStatsStatus('Statistics unavailable until data is loaded.');
      updatePieStatsButtonState({ disabled: true, label: 'Calculate statistics' });
      return;
    }
    updatePieStatsButtonState({ disabled: true, label: 'Calculating…' });
    setPieStatsStatus('Calculating statistics…');
    let renderedModel = null;
    try{
      if(stats.scope === 'gof'){
        const observedColumn = Number(stats.valueColumn);
        const expectedColumn = Number(stats.expectedColumn);
        const observedMeta = findPieColumn(dataModel, observedColumn);
        const expectedMeta = findPieColumn(dataModel, expectedColumn);
        if(!observedMeta || !expectedMeta){
          clearPieStatsOutputs('Select observed and expected columns.');
          setPieStatsStatus('Statistics ready to calculate.');
          updatePieStatsButtonState({ disabled: false, label: 'Calculate statistics' });
          return;
        }
        const dataset = buildPieGofDataset(dataModel, observedColumn, expectedColumn);
        const gof = computePieGofStats(dataset.observed, dataset.expected, { method: stats.test });
        if(!gof.ok){
          clearPieStatsOutputs(gof.message || 'Unable to compute goodness-of-fit statistics.');
          setPieStatsStatus('Statistics ready to calculate.');
          updatePieStatsButtonState({ disabled: false, label: 'Calculate statistics' });
          return;
        }
        renderedModel = {
          summary: {
            caption: 'Goodness-of-fit test',
            testLabel: gof.method === 'g-test' ? 'G-test (likelihood ratio)' : 'Chi-square goodness-of-fit',
            statistic: formatPieStatNumber(gof.statistic, 4),
            df: String(gof.df),
            pValue: formatPiePValue(gof.pValue),
            cramersV: formatPieStatNumber(gof.cramersV, 4),
            footnotes: [
              `Compared ${observedMeta.label} to ${expectedMeta.label} across ${gof.categories} categories.`,
              `Alpha threshold: ${formatPieStatNumber(stats.alpha, 3)}.`,
              dataset.skipped ? `${dataset.skipped} row(s) were excluded due to missing or invalid values.` : null
            ].filter(Boolean)
          },
          pairs: []
        };
        updatePieStatsCorrectionSummary(1);
      }else{
        const selected = Array.from(stats.selectedCols || []).sort((a, b) => a - b);
        if(selected.length < 2){
          clearPieStatsOutputs('Select at least two conditions for multiple comparisons.');
          setPieStatsStatus('Statistics ready to calculate.');
          updatePieStatsButtonState({ disabled: false, label: 'Calculate statistics' });
          return;
        }
        const overallDataset = buildPieContingencyDataset(dataModel, selected);
        const overall = computePieContingencyTest(overallDataset.rows, {
          method: stats.test,
          sparseThreshold: stats.sparseThreshold,
          yatesCorrection: stats.yatesCorrection
        });
        if(!overall.ok){
          clearPieStatsOutputs(overall.message || 'Unable to compute overall categorical test.');
          setPieStatsStatus('Statistics ready to calculate.');
          updatePieStatsButtonState({ disabled: false, label: 'Calculate statistics' });
          return;
        }
        const pairs = derivePieScopePairs(stats);
        if(!pairs.length){
          clearPieStatsOutputs('No pairwise comparisons are configured for the current scope.');
          setPieStatsStatus('Statistics ready to calculate.');
          updatePieStatsButtonState({ disabled: false, label: 'Calculate statistics' });
          return;
        }
        const pairResults = [];
        pairs.forEach(pair => {
          const dataset = buildPieContingencyDataset(dataModel, [pair.a, pair.b]);
          const result = computePieContingencyTest(dataset.rows, {
            method: stats.test,
            sparseThreshold: stats.sparseThreshold,
            yatesCorrection: stats.yatesCorrection
          });
          const leftLabel = findPieColumn(dataModel, pair.a)?.label || `Column ${pair.a + 1}`;
          const rightLabel = findPieColumn(dataModel, pair.b)?.label || `Column ${pair.b + 1}`;
          if(!result.ok){
            pairResults.push({
              left: leftLabel,
              right: rightLabel,
              categories: String(dataset.rows.length),
              total: 'N/A',
              statistic: 'N/A',
              df: 'N/A',
              pValue: 'N/A',
              pRaw: NaN,
              cramersV: 'N/A',
              note: result.message || 'Unavailable'
            });
            return;
          }
          pairResults.push({
            left: leftLabel,
            right: rightLabel,
            categories: String(dataset.rows.length),
            total: formatPieStatNumber(result.total, 0),
            statistic: formatPieStatNumber(result.statistic, 4),
            df: String(result.df),
            pValue: formatPiePValue(result.pValue),
            pRaw: Number.isFinite(result.pValue) ? result.pValue : NaN,
            cramersV: formatPieStatNumber(result.cramersV, 4),
            sparseCellCount: result.sparseCellCount,
            yatesApplied: result.yatesApplied
          });
        });
        const rawPValues = pairResults.map(row => row.pRaw);
        const finitePValues = rawPValues.filter(Number.isFinite);
        let adjusted = [];
        if(finitePValues.length > 1 && Shared.stats && typeof Shared.stats.adjustPValues === 'function'){
          adjusted = Shared.stats.adjustPValues(finitePValues, { method: stats.correction });
        }else{
          adjusted = finitePValues.slice();
        }
        let adjustedIndex = 0;
        pairResults.forEach(row => {
          if(Number.isFinite(row.pRaw)){
            const adjustedValue = adjusted[adjustedIndex];
            adjustedIndex += 1;
            row.pAdjustedRaw = Number.isFinite(adjustedValue) ? adjustedValue : row.pRaw;
          }else{
            row.pAdjustedRaw = NaN;
          }
          row.pAdjusted = Number.isFinite(row.pAdjustedRaw) ? formatPiePValue(row.pAdjustedRaw) : 'N/A';
          delete row.pRaw;
        });
        const correctionMeta = Shared.stats && typeof Shared.stats.getCorrectionMeta === 'function'
          ? Shared.stats.getCorrectionMeta(stats.correction)
          : { shortLabel: stats.correction, label: stats.correction, footnote: null };
        renderedModel = {
          summary: {
            caption: 'Overall test summary',
            testLabel: overall.method === 'g-test' ? 'G-test (likelihood ratio)' : 'Chi-square test of homogeneity',
            statistic: formatPieStatNumber(overall.statistic, 4),
            df: String(overall.df),
            pValue: formatPiePValue(overall.pValue),
            cramersV: formatPieStatNumber(overall.cramersV, 4),
            footnotes: [
              `${selected.length} condition(s) and ${overallDataset.rows.length} category row(s) were included.`,
              `Alpha threshold: ${formatPieStatNumber(stats.alpha, 3)}.`,
              overallDataset.skipped ? `${overallDataset.skipped} row(s) were excluded due to missing or invalid values.` : null,
              `Cells with expected count < ${overall.sparseThreshold}: ${overall.sparseCellCount}.`,
              overall.yatesApplied ? 'Yates continuity correction was applied (2×2 chi-square).' : null
            ].filter(Boolean)
          },
          pairs: pairResults,
          pairsCaption: 'Pairwise comparisons',
          adjustedPLabel: `P (adj, ${correctionMeta?.shortLabel || correctionMeta?.label || 'adj'})`,
          pairFootnotes: [
            pairResults.some(row => row.yatesApplied) ? 'Yates continuity correction was applied for eligible 2×2 pairwise tables.' : null,
            correctionMeta?.footnote && pairResults.length > 1 ? correctionMeta.footnote(pairResults.length) : null
          ].filter(Boolean)
        };
        updatePieStatsCorrectionSummary(pairResults.length);
      }
      renderPieStatsModel(renderedModel);
      ensurePieStatsReportHost(getPieNodeById('pieStatsResults'));
      if(Shared.statsReporting && typeof Shared.statsReporting.appendReportPanel === 'function'){
        Shared.statsReporting.appendReportPanel(getPieNodeById('pieStatsResults'), {
          methodsText: renderedModel.summary.testLabel,
          resultsText: `${renderedModel.summary.caption}: statistic = ${renderedModel.summary.statistic}, df = ${renderedModel.summary.df}, p = ${renderedModel.summary.pValue}.`,
          analysisSpec: {
            component: 'pie',
            scope: stats.scope,
            test: stats.test,
            correction: stats.correction,
            alpha: stats.alpha,
            selectedColumns: Array.from(stats.selectedCols || []).sort((a, b) => a - b),
            referenceColumn: stats.referenceColumn,
            valueColumn: stats.valueColumn,
            expectedColumn: stats.expectedColumn
          }
        }, { title: 'Reporting and reproducibility' });
      }
      stats.contextSignature = signature;
      stats.lastRunSignature = signature;
      stats.pending = false;
      setPieStatsStatus('Statistics up to date.');
      updatePieStatsButtonState({ disabled: false, label: 'Recalculate statistics' });
    }catch(err){
      console.error('pie stats computation failed', err);
      clearPieStatsOutputs('Unable to compute statistics. See console for details.');
      setPieStatsStatus('Failed to compute statistics.');
      updatePieStatsButtonState({ disabled: false, label: 'Calculate statistics' });
    }
  }

  function renderPieStatsControls(dataModel, options = {}){
    const controls = getPieNodeById('pieStatsControls');
    if(!controls){
      return;
    }
    const stats = getPieStatsConfig();
    ensurePieStatsSelections(dataModel);
    const signature = JSON.stringify({
      scope: stats.scope,
      test: stats.test,
      correction: stats.correction,
      alpha: stats.alpha,
      sparseThreshold: stats.sparseThreshold,
      yatesCorrection: stats.yatesCorrection,
      referenceColumn: stats.referenceColumn,
      valueColumn: stats.valueColumn,
      expectedColumn: stats.expectedColumn,
      selected: Array.from(stats.selectedCols).sort((a, b) => a - b),
      customPairs: Array.from(stats.customPairs).sort(),
      advancedOpen: !!stats.advancedOpen,
      advisorOpen: !!stats.advisor?.open,
      advisorActivated: !!stats.advisor?.activated,
      advisorAnswers: stats.advisor?.answers || {},
      columns: (dataModel?.columns || []).map(column => `${column.index}:${column.label}`)
    });
    if(!options.force && signature === stats.controlsSignature){
      return;
    }
    stats.controlsSignature = signature;
    controls.innerHTML = '';
    renderPieStatsAdvisor(dataModel, controls);

    const conditionsWrap = document.createElement('div');
    conditionsWrap.className = 'stats-conditions-section';
    const conditionsTitle = document.createElement('div');
    conditionsTitle.className = 'stats-conditions-title';
    conditionsTitle.textContent = 'Conditions to compare:';
    conditionsWrap.appendChild(conditionsTitle);
    const conditionsBox = document.createElement('div');
    conditionsBox.className = 'stats-conditions-checkboxes';
    (dataModel?.columns || []).forEach(column => {
      const item = document.createElement('div');
      item.className = 'stats-conditions-item';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.id = `pieStatCol${column.index}`;
      input.checked = stats.selectedCols.has(column.index);
      input.addEventListener('change', () => {
        if(input.checked){
          stats.selectedCols.add(column.index);
        }else{
          stats.selectedCols.delete(column.index);
        }
        ensurePieStatsSelections(dataModel);
        renderPieStatsControls(dataModel, { force: true, reason: 'selection-change' });
        requestPieStatsContextRefresh('selection-change');
      });
      const label = document.createElement('label');
      label.setAttribute('for', input.id);
      label.textContent = column.label;
      item.appendChild(input);
      item.appendChild(label);
      conditionsBox.appendChild(item);
    });
    conditionsWrap.appendChild(conditionsBox);
    controls.appendChild(conditionsWrap);

    const optionWrap = document.createElement('div');
    optionWrap.className = 'box-stats-options';
    const leftColumn = document.createElement('div');
    leftColumn.className = 'box-stats-options__column box-stats-options__column--primary';
    const rightColumn = document.createElement('div');
    rightColumn.className = 'box-stats-options__column box-stats-options__column--secondary';
    optionWrap.appendChild(leftColumn);
    optionWrap.appendChild(rightColumn);

    const appendRow = (host, labelText, control) => {
      const row = document.createElement('div');
      row.className = 'box-stats-options__row';
      const label = document.createElement('label');
      label.textContent = labelText;
      try{
        label.style.minWidth = '140px';
        control.style.width = '180px';
      }catch(_err){
        // no-op
      }
      row.appendChild(label);
      row.appendChild(control);
      host.appendChild(row);
    };

    const scopeSelect = document.createElement('select');
    [
      { value: 'gof', label: 'Observed vs expected' },
      { value: 'all', label: 'All pairwise' },
      { value: 'reference', label: 'Versus reference' },
      { value: 'custom', label: 'Custom pairs' }
    ].forEach(entry => {
      const option = document.createElement('option');
      option.value = entry.value;
      option.textContent = entry.label;
      option.selected = stats.scope === entry.value;
      scopeSelect.appendChild(option);
    });
    scopeSelect.addEventListener('change', () => {
      stats.scope = sanitizePieStatsScope(scopeSelect.value);
      renderPieStatsControls(dataModel, { force: true, reason: 'scope-change' });
      requestPieStatsContextRefresh('scope-change');
    });
    appendRow(leftColumn, 'Comparison scope:', scopeSelect);

    const testSelect = document.createElement('select');
    [
      { value: 'chi-square', label: 'Chi-square' },
      { value: 'g-test', label: 'G-test (likelihood ratio)' },
      { value: 'auto', label: 'Auto' }
    ].forEach(entry => {
      const option = document.createElement('option');
      option.value = entry.value;
      option.textContent = entry.label;
      option.selected = stats.test === entry.value;
      testSelect.appendChild(option);
    });
    testSelect.addEventListener('change', () => {
      stats.test = sanitizePieStatsTest(testSelect.value);
      requestPieStatsContextRefresh('test-change');
    });
    appendRow(leftColumn, 'Choose test:', testSelect);

    if(stats.scope === 'gof'){
      const observedSelect = document.createElement('select');
      observedSelect.id = 'pieValueColumn';
      (dataModel?.columns || []).forEach(column => {
        const option = document.createElement('option');
        option.value = String(column.index);
        option.textContent = column.label;
        option.selected = column.index === stats.valueColumn;
        observedSelect.appendChild(option);
      });
      observedSelect.addEventListener('change', () => {
        stats.valueColumn = Number.parseInt(observedSelect.value, 10);
        ensurePieStatsSelections(dataModel);
        renderPieStatsControls(dataModel, { force: true, reason: 'gof-observed-change' });
        requestPieStatsContextRefresh('gof-observed-change');
      });
      appendRow(leftColumn, 'Observed column:', observedSelect);

      const expectedSelect = document.createElement('select');
      expectedSelect.id = 'pieExpectedColumn';
      (dataModel?.columns || []).forEach(column => {
        const option = document.createElement('option');
        option.value = String(column.index);
        option.textContent = column.label;
        option.selected = column.index === stats.expectedColumn;
        expectedSelect.appendChild(option);
      });
      expectedSelect.addEventListener('change', () => {
        stats.expectedColumn = Number.parseInt(expectedSelect.value, 10);
        ensurePieStatsSelections(dataModel);
        renderPieStatsControls(dataModel, { force: true, reason: 'gof-expected-change' });
        requestPieStatsContextRefresh('gof-expected-change');
      });
      appendRow(leftColumn, 'Expected column:', expectedSelect);
    }else if(stats.scope === 'reference'){
      const referenceSelect = document.createElement('select');
      (dataModel?.columns || []).forEach(column => {
        if(!stats.selectedCols.has(column.index)){
          return;
        }
        const option = document.createElement('option');
        option.value = String(column.index);
        option.textContent = column.label;
        option.selected = column.index === stats.referenceColumn;
        referenceSelect.appendChild(option);
      });
      referenceSelect.addEventListener('change', () => {
        stats.referenceColumn = Number.parseInt(referenceSelect.value, 10);
        requestPieStatsContextRefresh('reference-change');
      });
      appendRow(leftColumn, 'Reference condition:', referenceSelect);
    }else if(stats.scope === 'custom'){
      const customWrap = document.createElement('div');
      customWrap.className = 'stats-conditions-section';
      const title = document.createElement('div');
      title.className = 'stats-conditions-title';
      title.textContent = 'Custom pairs:';
      customWrap.appendChild(title);
      const pairList = document.createElement('div');
      pairList.className = 'stats-conditions-checkboxes';
      const selected = Array.from(stats.selectedCols).sort((a, b) => a - b);
      for(let i = 0; i < selected.length; i += 1){
        for(let j = i + 1; j < selected.length; j += 1){
          const a = selected[i];
          const b = selected[j];
          const key = normalizePiePairKey(a, b);
          if(!key){
            continue;
          }
          const aLabel = findPieColumn(dataModel, a)?.label || `Column ${a + 1}`;
          const bLabel = findPieColumn(dataModel, b)?.label || `Column ${b + 1}`;
          const item = document.createElement('div');
          item.className = 'stats-conditions-item';
          const input = document.createElement('input');
          input.type = 'checkbox';
          input.id = `pieCustomPair${a}_${b}`;
          input.checked = stats.customPairs.has(key);
          input.addEventListener('change', () => {
            if(input.checked){
              stats.customPairs.add(key);
            }else{
              stats.customPairs.delete(key);
            }
            renderPieStatsControls(dataModel, { force: true, reason: 'custom-pair-toggle' });
            requestPieStatsContextRefresh('custom-pair-toggle');
          });
          const label = document.createElement('label');
          label.setAttribute('for', input.id);
          label.textContent = `${aLabel} vs ${bLabel}`;
          item.appendChild(input);
          item.appendChild(label);
          pairList.appendChild(item);
        }
      }
      if(!pairList.childNodes.length){
        const empty = document.createElement('div');
        empty.className = 'stats-table-message';
        empty.textContent = 'Select at least two conditions to define custom pairs.';
        pairList.appendChild(empty);
      }
      customWrap.appendChild(pairList);
      leftColumn.appendChild(customWrap);
    }

    const correctionSelect = document.createElement('select');
    const correctionOptions = getPieCorrectionOptions();
    correctionOptions.forEach(optionMeta => {
      const option = document.createElement('option');
      option.value = optionMeta.value;
      option.textContent = optionMeta.label;
      option.selected = optionMeta.value === stats.correction;
      correctionSelect.appendChild(option);
    });
    correctionSelect.disabled = stats.scope === 'gof' || estimatePieStatsComparisonCount() <= 1;
    correctionSelect.addEventListener('change', () => {
      stats.correction = sanitizePieStatsCorrection(correctionSelect.value);
      requestPieStatsContextRefresh('correction-change');
    });
    appendRow(rightColumn, 'Multiplicity control:', correctionSelect);

    const alphaInput = document.createElement('input');
    alphaInput.type = 'number';
    alphaInput.step = '0.001';
    alphaInput.min = '0.0001';
    alphaInput.max = '0.499';
    alphaInput.value = String(stats.alpha);
    alphaInput.addEventListener('change', () => {
      stats.alpha = sanitizePieStatsAlpha(alphaInput.value);
      alphaInput.value = String(stats.alpha);
      requestPieStatsContextRefresh('alpha-change');
    });
    appendRow(rightColumn, 'Alpha:', alphaInput);

    const advanced = document.createElement('details');
    advanced.className = 'box-stats-advanced';
    advanced.open = !!stats.advancedOpen;
    advanced.addEventListener('toggle', () => {
      stats.advancedOpen = !!advanced.open;
    });
    const summary = document.createElement('summary');
    summary.textContent = 'Advanced parameters';
    advanced.appendChild(summary);
    const advancedBody = document.createElement('div');
    advancedBody.className = 'box-stats-advanced__body';

    const sparseRow = document.createElement('div');
    sparseRow.className = 'box-stats-options__row';
    const sparseLabel = document.createElement('label');
    sparseLabel.textContent = 'Sparse threshold:';
    sparseLabel.style.minWidth = '140px';
    const sparseInput = document.createElement('input');
    sparseInput.type = 'number';
    sparseInput.min = '1';
    sparseInput.max = '100';
    sparseInput.step = '1';
    sparseInput.value = String(stats.sparseThreshold);
    sparseInput.style.width = '180px';
    sparseInput.addEventListener('change', () => {
      stats.sparseThreshold = sanitizePieStatsSparseThreshold(sparseInput.value);
      sparseInput.value = String(stats.sparseThreshold);
      requestPieStatsContextRefresh('sparse-threshold-change');
    });
    sparseRow.appendChild(sparseLabel);
    sparseRow.appendChild(sparseInput);
    advancedBody.appendChild(sparseRow);

    const yatesRow = document.createElement('div');
    yatesRow.className = 'box-stats-options__row';
    const yatesLabel = document.createElement('label');
    yatesLabel.textContent = 'Use Yates (2x2):';
    const yatesInput = document.createElement('input');
    yatesInput.type = 'checkbox';
    yatesInput.checked = !!stats.yatesCorrection;
    yatesInput.addEventListener('change', () => {
      stats.yatesCorrection = !!yatesInput.checked;
      requestPieStatsContextRefresh('yates-change');
    });
    yatesRow.appendChild(yatesLabel);
    yatesRow.appendChild(yatesInput);
    advancedBody.appendChild(yatesRow);
    advanced.appendChild(advancedBody);
    rightColumn.appendChild(advanced);

    controls.appendChild(optionWrap);
    updatePieStatsCorrectionSummary(estimatePieStatsComparisonCount());
  }

  function exportPieStatsConfig(){
    const stats = getPieStatsConfig();
    const out = getPieNodeById('pieStatsResults');
    const panelHtml = Shared.statsReporting && typeof Shared.statsReporting.capturePanelHtml === 'function'
      ? Shared.statsReporting.capturePanelHtml(out)
      : { resultsHtml: out ? (out.innerHTML || null) : null, reportHtml: null };
    return {
      scope: sanitizePieStatsScope(stats.scope),
      test: sanitizePieStatsTest(stats.test),
      correction: sanitizePieStatsCorrection(stats.correction),
      alpha: sanitizePieStatsAlpha(stats.alpha),
      sparseThreshold: sanitizePieStatsSparseThreshold(stats.sparseThreshold),
      yatesCorrection: stats.yatesCorrection !== false,
      referenceColumn: stats.referenceColumn,
      valueColumn: stats.valueColumn,
      expectedColumn: stats.expectedColumn,
      selectedColumns: Array.from(stats.selectedCols || []).sort((a, b) => a - b),
      customPairs: Array.from(stats.customPairs || []).sort(),
      advancedOpen: !!stats.advancedOpen,
      resultsTab: sanitizePieStatsResultsTab(stats.resultsTab),
      advisor: {
        open: !!stats.advisor?.open,
        activated: !!stats.advisor?.activated,
        answers: { ...(stats.advisor?.answers || {}) }
      },
      resultsHtml: panelHtml.resultsHtml || null,
      reportHtml: panelHtml.reportHtml || null,
      contextSignature: stats.contextSignature || null,
      lastRunSignature: stats.lastRunSignature || null
    };
  }

  function applyPieStatsConfig(config){
    const stats = getPieStatsConfig();
    const input = config && typeof config === 'object' ? config : {};
    stats.scope = sanitizePieStatsScope(input.scope ?? stats.scope);
    stats.test = sanitizePieStatsTest(input.test ?? stats.test);
    stats.correction = sanitizePieStatsCorrection(input.correction ?? stats.correction);
    stats.alpha = sanitizePieStatsAlpha(input.alpha ?? stats.alpha);
    stats.sparseThreshold = sanitizePieStatsSparseThreshold(input.sparseThreshold ?? stats.sparseThreshold);
    stats.yatesCorrection = input.yatesCorrection !== false;
    const referenceColumn = parsePieColumnIndex(input.referenceColumn);
    const valueColumn = parsePieColumnIndex(input.valueColumn);
    const expectedColumn = parsePieColumnIndex(input.expectedColumn);
    stats.referenceColumn = referenceColumn != null ? referenceColumn : stats.referenceColumn;
    stats.valueColumn = valueColumn != null ? valueColumn : stats.valueColumn;
    stats.expectedColumn = expectedColumn != null ? expectedColumn : stats.expectedColumn;
    stats.advancedOpen = !!input.advancedOpen;
    stats.resultsTab = sanitizePieStatsResultsTab(input.resultsTab ?? stats.resultsTab);
    const advisorInput = input.advisor && typeof input.advisor === 'object' ? input.advisor : {};
    stats.advisor = {
      open: !!advisorInput.open,
      activated: !!advisorInput.activated,
      answers: (advisorInput.answers && typeof advisorInput.answers === 'object') ? { ...advisorInput.answers } : {}
    };
    if(Array.isArray(input.selectedColumns)){
      stats.selectedCols = new Set(input.selectedColumns.map(Number).filter(value => Number.isInteger(value) && value >= 1));
    }
    if(Array.isArray(input.customPairs)){
      const nextPairs = new Set();
      input.customPairs.forEach(pair => {
        const parsed = parsePiePairKey(pair);
        if(!parsed){
          return;
        }
        const key = normalizePiePairKey(parsed.a, parsed.b);
        if(key){
          nextPairs.add(key);
        }
      });
      stats.customPairs = nextPairs;
    }
    const savedContextSignature = typeof input.contextSignature === 'string' ? input.contextSignature : null;
    const savedLastRunSignature = typeof input.lastRunSignature === 'string' ? input.lastRunSignature : null;
    stats.contextSignature = savedContextSignature;
    stats.lastRunSignature = savedLastRunSignature;
    stats.controlsSignature = null;
    let restoredResults = false;
    if(input.resultsHtml != null || input.reportHtml != null){
      const out = getPieNodeById('pieStatsResults');
      if(out){
        if(Shared.statsReporting && typeof Shared.statsReporting.restorePanelHtml === 'function'){
          Shared.statsReporting.restorePanelHtml(out, input, {
            ensureReportHost: () => ensurePieStatsReportHost(out)
          });
        }else{
          try{ out.innerHTML = input.resultsHtml || ''; }catch(_err){ out.textContent = String(input.resultsHtml || ''); }
        }
        restoredResults = pieStatsPanelHasRenderedResults();
      }
    }
    const hasSavedResultsHtml = typeof input.resultsHtml === 'string' && input.resultsHtml
      && /stats-table-card|<table|stats-report-panel|stats-assumption-container/i.test(input.resultsHtml);
    const hasSavedReportHtml = typeof input.reportHtml === 'string' && input.reportHtml
      && /stats-report-panel|stats-table-card|<table|stats-assumption-container/i.test(input.reportHtml);
    stats.restorePending = (restoredResults || hasSavedResultsHtml || hasSavedReportHtml) && !!savedLastRunSignature
      ? {
          contextSignature: savedContextSignature,
          lastRunSignature: savedLastRunSignature,
          hasResults: true,
          resultsHtml: typeof input.resultsHtml === 'string' ? input.resultsHtml : null,
          reportHtml: typeof input.reportHtml === 'string' ? input.reportHtml : null
        }
      : null;
  }

  // Return a default color palette for slices
  // Prefer globally defined palettes if available; fallback to local palette
  function getDefaultPalette(){
    try{
      const palFromGlobal = (global && Array.isArray(global.DEFAULT_SCATTER_COLORS)) ? global.DEFAULT_SCATTER_COLORS : undefined;
      // Some sections define DEFAULT_SCATTER_COLORS as a global lexical binding
      // eslint-disable-next-line no-undef
      const palFromLexical = (typeof DEFAULT_SCATTER_COLORS !== 'undefined' && Array.isArray(DEFAULT_SCATTER_COLORS)) ? DEFAULT_SCATTER_COLORS : undefined;
      const palette = palFromGlobal || palFromLexical || ['#0000ff','#ff0000','#00aa00','#ff8c00','#800080','#00a6d6','#8b4513','#ff1493','#666666'];
      return palette;
    }catch(_e){
      return ['#0000ff','#ff0000','#00aa00','#ff8c00','#800080','#00a6d6','#8b4513','#ff1493','#666666'];
    }
  }

  const markFontEditable = (node, role, key) => {
    if (!node) { return; }
    if(state.resizeState?.active){
      return;
    }
    const payload = { role: role || null, key: key || role || null, text: node?.textContent || null };
    if (fontControls && typeof fontControls.markText === 'function') {
      fontControls.markText(node, { scopeId: 'pie', role, key });
    } else if (node.dataset) {
      node.dataset.fontEditable = '1';
      node.dataset.fontScope = 'pie';
      if (role) node.dataset.fontRole = role;
      if (key || role) node.dataset.fontKey = key || role;
    }
    if (!role || role.indexOf('Tick') === -1) {
      pieDebug('Debug: pie markFontEditable', payload); // Debug: font target tagging summary
    }
  };

  function normalizePositiveAngle(angle){
    let normalized = Number(angle);
    if(!Number.isFinite(normalized)){
      normalized = 0;
    }
    while(normalized < 0){
      normalized += TAU;
    }
    while(normalized >= TAU){
      normalized -= TAU;
    }
    return normalized;
  }

  function isPointInsideRadialSlice(pointX, pointY, slice){
    if(!slice){
      return false;
    }
    const dx = pointX - (Number(slice.cx) || 0);
    const dy = pointY - (Number(slice.cy) || 0);
    const radius = Math.sqrt(dx * dx + dy * dy);
    const innerRadius = Math.max(0, Number(slice.innerRadius) || 0);
    const outerRadius = Math.max(innerRadius, Number(slice.outerRadius) || 0);
    if(radius < innerRadius - 1e-6 || radius > outerRadius + 1e-6){
      return false;
    }
    const startAngle = Number(slice.startAngle) || 0;
    const endAngle = Number(slice.endAngle) || startAngle;
    const span = Math.max(0, endAngle - startAngle);
    if(span >= TAU - 1e-6){
      return true;
    }
    const pointAngle = normalizePositiveAngle(Math.atan2(dy, dx));
    const normalizedStart = normalizePositiveAngle(startAngle);
    const delta = normalizePositiveAngle(pointAngle - normalizedStart);
    return delta <= span + 1e-6;
  }

  function doesRadialPercentRectFit(slice, centerX, centerY, halfWidth, halfHeight){
    if(!slice){
      return false;
    }
    const points = [
      [centerX - halfWidth, centerY - halfHeight],
      [centerX + halfWidth, centerY - halfHeight],
      [centerX - halfWidth, centerY + halfHeight],
      [centerX + halfWidth, centerY + halfHeight],
      [centerX, centerY - halfHeight],
      [centerX, centerY + halfHeight],
      [centerX - halfWidth, centerY],
      [centerX + halfWidth, centerY],
      [centerX, centerY]
    ];
    return points.every(([pointX, pointY]) => isPointInsideRadialSlice(pointX, pointY, slice));
  }

  function findRadialPercentPlacementForScale(slice, labelMetrics, scale, options = {}){
    if(!slice || !labelMetrics || !(scale > 0)){
      return null;
    }
    const candidateCount = Math.max(5, Math.round(Number(options.candidateCount) || 25));
    const preferredRadius = Number.isFinite(slice.preferredRadius)
      ? slice.preferredRadius
      : ((Number(slice.innerRadius) || 0) + (Number(slice.outerRadius) || 0)) / 2;
    const placementPadding = Math.max(0.5, Number(labelMetrics.padding) || 0.5);
    const minRadius = Math.max((Number(slice.innerRadius) || 0) + placementPadding, 0);
    const maxRadius = Math.max(minRadius, (Number(slice.outerRadius) || 0) - placementPadding);
    const halfWidth = Math.max(0.5, ((Number(labelMetrics.baseWidth) || 0) * scale) / 2 + placementPadding);
    const halfHeight = Math.max(0.5, ((Number(labelMetrics.baseHeight) || 0) * scale) / 2 + placementPadding);
    const midAngle = (Number(slice.startAngle) + Number(slice.endAngle)) / 2;
    const radii = [];
    const pushRadius = value => {
      const numeric = Number(value);
      if(!Number.isFinite(numeric)){
        return;
      }
      const clamped = Math.max(minRadius, Math.min(maxRadius, numeric));
      if(!radii.some(candidate => Math.abs(candidate - clamped) < 0.25)){
        radii.push(clamped);
      }
    };
    pushRadius(preferredRadius);
    for(let index = 0; index < candidateCount; index += 1){
      const ratio = candidateCount === 1 ? 0.5 : (index / (candidateCount - 1));
      pushRadius(minRadius + (maxRadius - minRadius) * ratio);
    }
    radii.sort((a, b) => Math.abs(a - preferredRadius) - Math.abs(b - preferredRadius));
    for(let index = 0; index < radii.length; index += 1){
      const radius = radii[index];
      const centerX = (Number(slice.cx) || 0) + radius * Math.cos(midAngle);
      const centerY = (Number(slice.cy) || 0) + radius * Math.sin(midAngle);
      if(doesRadialPercentRectFit(slice, centerX, centerY, halfWidth, halfHeight)){
        return { x: centerX, y: centerY, radius };
      }
    }
    return null;
  }

  function computeRadialPercentLabelLayout(options = {}){
    const slices = Array.isArray(options.slices) ? options.slices : [];
    const baseFontSize = Math.max(1, Number(options.baseFontSize) || DEFAULT_PIE_FONT_SIZE_PT);
    const fontScale = Math.max(0.1, Number(options.fontScale) || 1);
    const labelPadding = Math.max(0.75, fontScale);
    const fontSpec = chartStyle.makeFont(baseFontSize);
    const measuredSlices = slices.map(slice => {
      const text = slice?.text != null ? String(slice.text) : '';
      const labelMetrics = {
        baseWidth: chartStyle.measureText(text, fontSpec),
        baseHeight: baseFontSize * 0.9,
        padding: labelPadding
      };
      let low = 0;
      let high = 1;
      let bestScale = 0;
      let bestPlacement = null;
      for(let iteration = 0; iteration < 16; iteration += 1){
        const midScale = (low + high) / 2;
        const placement = findRadialPercentPlacementForScale(slice, labelMetrics, midScale);
        if(placement){
          bestScale = midScale;
          bestPlacement = placement;
          low = midScale;
        }else{
          high = midScale;
        }
      }
      return {
        ...slice,
        text,
        labelMetrics,
        maxScale: bestScale,
        bestPlacement
      };
    });
    const commonScale = measuredSlices.length
      ? Math.max(0.01, Math.min(1, ...measuredSlices.map(slice => slice.maxScale)))
      : 1;
    const fontSize = Math.max(1, baseFontSize * commonScale);
    const placements = measuredSlices.map(slice => {
      const placement = findRadialPercentPlacementForScale(slice, slice.labelMetrics, commonScale, {
        candidateCount: 31
      }) || slice.bestPlacement;
      if(!placement){
        return null;
      }
      return {
        ...slice,
        x: placement.x,
        y: placement.y,
        radius: placement.radius
      };
    }).filter(Boolean);
    if(pieDebugEnabled()){
      pieDebug('Debug: pie radial percentage font auto-fit', {
        baseFontSize,
        appliedFontSize: fontSize,
        commonScale,
        sliceCount: measuredSlices.length,
        minSliceScale: measuredSlices.length ? Math.min(...measuredSlices.map(slice => slice.maxScale)) : 1
      });
    }
    return {
      fontSize,
      scale: commonScale,
      placements
    };
  }

  function initHot(){
    pieDebug('Debug: pie initHot using shared factory', { hasFactory: typeof Shared.hot?.createStandardTable === 'function' });
    if(typeof Shared.hot?.createStandardTable !== 'function'){
      console.error('pie initHot missing Shared.hot.createStandardTable');
      return;
    }
    const data = seedPieDefaultHeaderRow(Shared.createEmptyData(PIE_DEFAULT_ROWS, PIE_DEFAULT_COLS));
    let pieScheduleProxyCount = 0;
    const schedulePieDrawProxy = () => {
      pieScheduleProxyCount += 1;
      if(pieScheduleProxyCount <= 5){
        pieDebug('Debug: pie scheduleDraw proxy invoked', { count: pieScheduleProxyCount }); // Debug: table change trigger
        if(pieScheduleProxyCount === 5){
          pieDebug('Debug: pie scheduleDraw proxy suppressing further logs'); // Debug: proxy log suppression notice
        }
      }
      requestPieStatsContextRefresh('table-edit');
      if(typeof state.scheduleDraw === 'function'){
        state.scheduleDraw();
      }
    };

    const createPieTable = (container) => Shared.hot.createStandardTable(container, { rows: PIE_DEFAULT_ROWS, cols: PIE_DEFAULT_COLS }, schedulePieDrawProxy, {
      debugLabel: 'pie',
      data,
      firstRowClassName: 'hot-header-row htCenter',
      pinFirstRow: true,
      scheduleOnLoadData: true,
      hotOptions: {
        stretchH: 'all',
        minSpareRows: 10,
        afterChange(changes, source){
          if(changes){
            pieDebug('pie afterChange', { count: changes.length, source });
          }
        },
        afterUndo(){
          pieDebug('pie undo');
        },
        afterRedo(){
          pieDebug('pie redo');
        }
      }
    });
    const ensurePieHotForActiveTab = () => {
      const wrapper = getPieNodeById('pieHotWrapper');
      const baseContainer = getPieNodeById('pieHot');
      if(typeof Shared.hot?.ensureTableForTab !== 'function' || !wrapper || !baseContainer){
        if(!state.hot){
          state.hot = createPieTable(baseContainer);
        }
        if(state.hot){
          state.hot.__pieHostContainer = baseContainer;
          state.hot.__pieTabId = Shared.hot.resolveActiveTabId?.() || 'pie-default';
        }
        ensurePieDefaultHeaderRow(state.hot);
        return state.hot;
      }
      const entry = Shared.hot.ensureTableForTab({
        type: 'pie',
        tabId: Shared.hot.resolveActiveTabId?.() || 'pie-default',
        wrapper,
        container: baseContainer,
        createInstance: createPieTable
      });
      if(entry?.instance){
        state.hot = entry.instance;
      }
      if(state.hot){
        state.hot.__pieHostContainer = entry?.container || baseContainer;
        state.hot.__pieTabId = entry?.tabId || Shared.hot.resolveActiveTabId?.() || 'pie-default';
      }
      ensurePieDataViewsForHot(state.hot, {
        wrapper,
        container: entry?.container || baseContainer
      });
      syncPieActiveDataViewFromHot(state.hot, 'ensure-active-tab');
      ensurePieDefaultHeaderRow(state.hot);
      return state.hot;
    };
    state.hot = ensurePieHotForActiveTab();
    state.ensureHotForActiveTab = ensurePieHotForActiveTab;
    ensurePieDataViewsForHot(state.hot, {
      wrapper: getPieNodeById('pieHotWrapper'),
      container: state.hot?.__pieHostContainer || getPieNodeById('pieHot')
    });
  }

  function ensurePieDataViewsForHot(hotInstance, options = {}){
    if(!hotInstance || typeof hotInstance.getData !== 'function'){
      return null;
    }
    if(typeof Shared.dataViews?.createManager !== 'function'){
      return null;
    }
    if(!hotInstance.__pieDataViewsManager){
      hotInstance.__pieDataViewsManager = Shared.dataViews.createManager({
        componentKey: 'pie',
        maxViews: PIE_DATA_VIEW_MAX,
        initialData: hotInstance.getData() || [],
        onActiveViewChanged(view){
          if(!view || !hotInstance || typeof hotInstance.loadData !== 'function'){
            return;
          }
          const nextData = Array.isArray(view.data) ? view.data : [];
          hotInstance.loadData(nextData, { source: 'pie-data-view-switch' });
          if(view.exclusions){
            hotInstance.applyExclusions?.(view.exclusions);
          }
          if(view.filters){
            hotInstance.applyFilters?.(view.filters, { schedule: false });
          }
          requestPieStatsContextRefresh('data-view-switch');
          state.scheduleDraw?.({ reason: 'data-view-switch' });
        },
        onInteraction(){
          Shared.workspaceToolbar?.activateSection?.('pie', 'Data');
        }
      });
      pieDebug('Debug: pie data views manager created');
    }
    const manager = hotInstance.__pieDataViewsManager;
    const hostWrapper = options.wrapper || getPieNodeById('pieHotWrapper');
    const hostContainer = options.container || hotInstance.__pieHostContainer || getPieNodeById('pieHot');
    if(hostWrapper && hostContainer){
      manager.mount({ wrapper: hostWrapper, tableContainer: hostContainer });
      manager.refresh?.();
    }
    pieDataViewsManager = manager;
    return manager;
  }

  function syncPieActiveDataViewFromHot(hotInstance, reason){
    const hot = hotInstance || state.hot;
    if(!hot || typeof hot.getData !== 'function'){
      return;
    }
    const manager = hot.__pieDataViewsManager || pieDataViewsManager;
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

  function initControls(){
    const pieShowPercents=$('#pieShowPercents');
    const pieStartAngle=$('#pieStartAngle');
    const pieFontSize=$('#pieFontSize');
    const pieFontSizeVal=$('#pieFontSizeVal');
    const pieChartType=$('#pieChartType');
    const pieShowLegendInput=getPieNodeById('pieShowLegend');
    const pieBorderColor=getPieNodeById('pieBorderColor');
    const pieBorderWidth=getPieNodeById('pieBorderWidth');
    const pieAutoSizeTargets=[pieChartType];
    pieAutoSizeTargets.filter(Boolean).forEach(select=>{
      attachPieSelectAutoSize(select, 'pie');
    });
    if(pieFontSize && !Number.isFinite(Number(pieFontSize.value))){
      pieFontSize.value = String(DEFAULT_PIE_FONT_SIZE_PT);
    }
    if(pieFontSize?.dataset){
      pieFontSize.dataset.fontBasePt = String(pieFontSize.value);
      pieDebug('Debug: pie font size base initialized',{ value: pieFontSize.value }); // Debug: initial base size
    }
    chartStyle.renderFontSizeLabel({ element: pieFontSizeVal, pt: Number(pieFontSize.value), input: pieFontSize, manual: true });
    ;[pieShowPercents,pieStartAngle,pieFontSize,pieChartType].forEach(el=>el.addEventListener('input',()=>{ pieDebug('pie config changed',el.id,el.value); if(el===pieFontSize){
        if(pieFontSize.dataset){
          pieFontSize.dataset.fontBasePt = String(pieFontSize.value);
          pieDebug('Debug: pie font size input manual set',{ value: pieFontSize.value }); // Debug: manual slider update
        }
        chartStyle.renderFontSizeLabel({ element: pieFontSizeVal, pt: Number(pieFontSize.value), input: pieFontSize, manual: true });
      }
      state.scheduleDraw(); }));
    if(pieShowLegendInput){
      const legendHost=pieShowLegendInput.closest('label');
      if(legendHost){
        pieLegendControl=legendHost;
        ensurePieLegendControlPlacement();
      }
      pieShowLegendInput.addEventListener('change',()=>{
        pieDebug('Debug: pie showLegend change',{checked:pieShowLegendInput.checked});
        ensurePieLegendControlPlacement();
        state.scheduleDraw();
      });
    }
    pieShowFrame.addEventListener('change',()=>{pieDebug('Debug: pie showFrame change',{checked:pieShowFrame.checked}); state.scheduleDraw();});
    if(pieBorderColor){
      pieBorderColor.addEventListener('input',()=>{ pieDebug('Debug: pie border color change',{value: pieBorderColor.value}); state.scheduleDraw(); });
    }
    if(pieBorderWidth){
      pieBorderWidth.addEventListener('input',()=>{ pieDebug('Debug: pie border width change',{value: pieBorderWidth.value}); state.scheduleDraw(); });
    }
    const pieComputeStatsButton = getPieNodeById('pieComputeStats');
    if(pieComputeStatsButton){
      pieComputeStatsButton.addEventListener('click',handlePieStatsComputeClick);
    }
    clearPieStatsOutputs('Statistics will appear after calculation.');
    setPieStatsStatus('');
    updatePieStatsButtonState({ disabled: true, label: 'Calculate statistics' });

    const example=[ ['Quarter','Observed','Expected'], ['Q1',120,100], ['Q2',90,100], ['Q3',60,80], ['Q4',130,120] ];
    getPieNodeById('pieLoadExample').addEventListener('click',()=>{
      state.hot.loadData(example, {
        source: 'example-load',
        recordUndo: true,
        undoLabel: 'table:pie:example-load'
      });
      pieDebug('pie example loaded with expected values');
      state.scheduleDraw();
    });
    const pieImportBtn=getPieNodeById('pieImport');
    const pieFileInput=getPieNodeById('pieFile');
    pieImportBtn.addEventListener('click',()=>{ pieFileInput.value=''; pieFileInput.click(); });
    pieFileInput.addEventListener('change',async ()=>{
      const tableImport = Shared.tableImport;
      if(!tableImport || typeof tableImport.openFile !== 'function'){
        console.warn('pie import skipped: Shared.tableImport.openFile unavailable');
        return;
      }
      const fileName = pieFileInput.files?.[0]?.name || '';
      pieDebug('Debug: pie import start',{fileName}); // Debug: import start trace
      try{
        const applyPiePrismStyle = style => {
          if(!style || typeof style !== 'object'){
            return;
          }
          const title = style.title != null ? String(style.title).trim() : '';
          const fontFamily = style.fontFamily != null ? String(style.fontFamily).trim() : '';
          const fontColor = style.fontColor != null ? String(style.fontColor).trim() : '';
          const axisColor = style.axisColor != null ? String(style.axisColor).trim() : '';
          const fontSizeValue = Number(style.fontSize);
          if(title){
            state.titleText = title;
          }
          const pieFontInput = getPieNodeById('pieFontSize');
          const pieFontSizeVal = getPieNodeById('pieFontSizeVal');
          if(Number.isFinite(fontSizeValue) && fontSizeValue > 0 && pieFontInput){
            pieFontInput.value = String(fontSizeValue);
            if(pieFontInput.dataset){
              pieFontInput.dataset.fontBasePt = String(fontSizeValue);
            }
            chartStyle.renderFontSizeLabel({ element: pieFontSizeVal, pt: fontSizeValue, input: pieFontInput, manual: true });
          }
          if(axisColor){
            updateAxisColor(axisColor);
          }
          if(fontFamily || fontColor){
            const graphStyle = {};
            if(fontFamily){
              graphStyle.fontFamily = fontFamily;
            }
            if(fontColor){
              graphStyle.fill = fontColor;
            }
            importFontStyles('pie', { __graph__: graphStyle });
          }
          if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
            pieDebug('Debug: pie prism style applied', { title, fontFamily, fontSize: fontSizeValue, fontColor, axisColor });
          }
          state.scheduleDraw?.({ force: true, reason: 'import-prism-style' });
        };
        const result = await tableImport.openFile(pieFileInput,{
          hot: state.hot,
          minCols: PIE_DEFAULT_COLS,
          minRows: PIE_DEFAULT_ROWS,
          scheduleDraw: state.scheduleDraw,
          debugLabel: 'pie',
          onPrismStyle: applyPiePrismStyle,
          onProcessed: info => {
            pieDebug('Debug: pie tableImport processed', info || {}); // Debug: processed callback
          }
        });
        pieDebug('Debug: pie import finished',{rows: result?.rows || 0, cols: result?.cols || 0}); // Debug: import finish trace
      }catch(err){
        console.error('pie import failed',err);
      }
    });

    // Export buttons
    if (Shared.exporter && typeof Shared.exporter.mountSvgControls === 'function') {
      Shared.exporter.mountSvgControls({
        container: '#pieExportControls',
        svgSelector: '#pieSvg',
        fileName: 'pie',
        contextLabel: 'pie-export'
      });
      pieDebug('Debug: pie export controls mounted', { hasExporter: true }); // Debug: pie export mount
    } else {
      pieDebug('Debug: pie export controls unavailable', { hasExporter: !!Shared.exporter }); // Debug: pie export fallback
    }

    // Save/Open
    function getPayload(){
      const noteControl = notesState.control || null;
      const notesText = noteControl && typeof noteControl.getValue === 'function'
        ? noteControl.getValue()
        : (notesState.text || '');
      const notesOpen = noteControl && typeof noteControl.isOpen === 'function'
        ? noteControl.isOpen()
        : !!notesState.open;
      notesState.text = notesText;
      notesState.open = notesOpen;
      const activeHot = state.hot || state.ensureHotForActiveTab?.();
      const activeManager = ensurePieDataViewsForHot(activeHot, {
        wrapper: getPieNodeById('pieHotWrapper'),
        container: activeHot?.__pieHostContainer || getPieNodeById('pieHot')
      });
      syncPieActiveDataViewFromHot(activeHot, 'payload');
      const dataViewsPayload = activeManager?.serialize?.({ includeData: true }) || null;
      const includeDataViews = !!(dataViewsPayload && Array.isArray(dataViewsPayload.views) && dataViewsPayload.views.length > 1);
      const payload = {
        type:'pie',
        data: activeHot?.getData?.() || [],
        exclusions: activeHot?.exportExclusions?.() || Shared.hot.exportExclusions(activeHot),
        filters: activeHot?.exportFilters?.() || Shared.hot.exportFilters(activeHot),
        dataViews: includeDataViews ? dataViewsPayload : undefined,
        activeDataViewId: includeDataViews ? (dataViewsPayload?.activeViewId || null) : undefined,
        config: collectConfig()
      };
      payload.config = payload.config || {};
      payload.config.colorScheme = payload.config.colorScheme
        || Shared.colorSchemes?.getSelectedSchemeId?.('pie')
        || 'scientific';
      payload.config.notes = {
        text: notesText,
        open: notesOpen
      };
      pieDebug('Debug: pie.getPayload captured state', {
        rows: payload.data?.length || 0,
        cols: payload.data?.[0]?.length || 0,
        chartType: payload.config?.chartType
      });
      return payload;
    }
    pie.getPayload = getPayload;
    {
      const tableUiHooks = Shared.hot?.makeTableUiStateHooks?.(
        () => (typeof state.ensureHotForActiveTab === 'function' ? state.ensureHotForActiveTab() : null) || state.hot,
        'pie'
      );
      pie.captureUiState = tableUiHooks ? tableUiHooks.capture : () => null;
      pie.applyUiState = tableUiHooks ? tableUiHooks.apply : () => false;
    }
    pie.captureEmptyPayloadTemplate = function capturePieEmptyPayloadTemplate(){
    const snapshot = pie.createEmptyPayload();
    pieDebug('Debug: pie empty payload template captured', { hasTemplate: !!snapshot });
    return snapshot;
  };
  pie.restoreEmptyPayloadTemplate = function restorePieEmptyPayloadTemplate(template, options = {}){
    if(!template || typeof template !== 'object'){
      pieDebug('Debug: pie empty payload template restore skipped', { reason: 'invalid-template', options });
      return false;
    }
    emptyPayloadTemplate = cloneSimple(template);
    pieDebug('Debug: pie empty payload template restored', { hasTemplate: !!emptyPayloadTemplate, reason: options.reason || 'unspecified' });
    return !!emptyPayloadTemplate;
  };
  pie.createEmptyPayload = function createEmptyPiePayload(){
      pie.ensure();
      const payload = { type: 'pie', config: createImmutablePieDefaultConfig() };
      payload.type = 'pie';
      const createEmpty = Shared.createEmptyData;
      const emptyData = typeof createEmpty === 'function'
        ? createEmpty(PIE_DEFAULT_ROWS, PIE_DEFAULT_COLS)
        : Array.from({ length: PIE_DEFAULT_ROWS }, () => Array(PIE_DEFAULT_COLS).fill(''));
      seedPieDefaultHeaderRow(emptyData);
      payload.data = emptyData;
      payload.exclusions = [];
      payload.filters = null;
      return payload;
    };
    function applyPiePayload(payload, meta){
      const source = meta?.source || 'unknown';
      if(!payload || payload.type !== 'pie'){
        console.warn('pie payload rejected', { source, hasType: !!payload?.type });
        return false;
      }
      const skipDraw = meta?.skipDraw === true;
      const styleOnly = meta?.styleOnly === true || meta?.colorSchemeOnly === true;
      const skipDataLoad = meta?.skipDataLoad === true || styleOnly;
      let scheduleBackup = null;
      if(skipDraw && typeof state.scheduleDraw === 'function'){
        scheduleBackup = state.scheduleDraw;
        state.scheduleDraw = () => {};
      }
      const hot = state.hot || state.ensureHotForActiveTab?.();
      if(hot){
        state.hot = hot;
      }
      const dataMatrix = Array.isArray(payload.data) ? payload.data : [];
      const serializedViews = (payload.dataViews && typeof payload.dataViews === 'object') ? payload.dataViews : null;
      const requestedActiveViewId = payload.activeDataViewId || serializedViews?.activeViewId || null;
      const dataManager = state.hot
        ? ensurePieDataViewsForHot(state.hot, {
            wrapper: getPieNodeById('pieHotWrapper'),
            container: state.hot.__pieHostContainer || getPieNodeById('pieHot')
          })
        : null;
      if(dataManager){
        if(serializedViews){
          dataManager.deserialize(serializedViews, {
            fallbackData: dataMatrix,
            activeViewId: requestedActiveViewId,
            silent: true,
            activate: false
          });
        }else{
          dataManager.initialize(dataMatrix, { rawTitle: 'Raw' });
        }
      }
      const matrixData = dataManager?.getActiveView?.()?.data;
      const dataToLoad = Array.isArray(matrixData) ? matrixData : dataMatrix;
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
        syncPieActiveDataViewFromHot(state.hot, 'payload-load');
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
      if(notesState.control){
        notesState.control.setValue(notesState.text);
        notesState.control.setOpen(notesState.open);
      }
      importFontStyles('pie', config.fontStyles || null);
      state.titleText = typeof config.title === 'string' ? config.title : 'Proportion graph';
      const chartTypeInput = getPieNodeById('pieChartType');
      if(chartTypeInput){ chartTypeInput.value = config.chartType || 'pie'; }
      const showPercentsInput = getPieNodeById('pieShowPercents');
      if(showPercentsInput){ showPercentsInput.checked = !!config.showPercents; }
      const showFrameInput = getPieNodeById('pieShowFrame');
      if(showFrameInput){ showFrameInput.checked = !!config.showFrame; }
      const borderColorInput = getPieNodeById('pieBorderColor');
      if(borderColorInput){ borderColorInput.value = config.borderColor || borderColorInput.value || '#ffffff'; }
      const borderWidthInput = getPieNodeById('pieBorderWidth');
      if(borderWidthInput){ borderWidthInput.value = config.borderWidth != null ? config.borderWidth : (borderWidthInput.value || 0); }
      if(pieShowLegendInput){
        pieShowLegendInput.checked = config.showLegend !== false;
        ensurePieLegendControlPlacement();
      }
      const startAngleInput = getPieNodeById('pieStartAngle');
      if(startAngleInput){ startAngleInput.value = config.startAngle || startAngleInput.value; }
      const pieFontInput = getPieNodeById('pieFontSize');
      const pieFontSizeVal = getPieNodeById('pieFontSizeVal');
      if(pieFontInput){
        pieFontInput.value = config.fontSize || pieFontInput.value || String(DEFAULT_PIE_FONT_SIZE_PT);
        if(pieFontInput.dataset){
          pieFontInput.dataset.fontBasePt = String(pieFontInput.value);
          pieDebug('Debug: pie font size base restored',{ value: pieFontInput.value });
        }
        chartStyle.renderFontSizeLabel({ element: pieFontSizeVal, pt: Number(pieFontInput.value), input: pieFontInput, manual: true });
      }
      applyPieStatsConfig({
        ...(config.stats && typeof config.stats === 'object' ? config.stats : {}),
        valueColumn: config.valueColumn ?? config.stats?.valueColumn,
        expectedColumn: config.expectedColumn ?? config.stats?.expectedColumn
      });
      state.colors = (config.colors && typeof config.colors === 'object') ? { ...config.colors } : {};
      const axisConfig = config.axis || config.axisSettings;
      if(axisConfig){
        applyAxisSettings(axisConfig);
      }
      // Restore label positions if saved
      if(!state.labelPositions || typeof state.labelPositions !== 'object'){
        state.labelPositions = { title: null, legend: null };
      }
      if(config.labelPositions){
        state.labelPositions.title = config.labelPositions.title || null;
        state.labelPositions.legend = config.labelPositions.legend || null;
      }
      if(!skipDraw && typeof state.scheduleDraw === 'function'){
        state.scheduleDraw();
      }
      if(scheduleBackup){
        state.scheduleDraw = scheduleBackup;
      }
      pieDebug('Debug: pie payload applied', { source, rows: dataToLoad.length });
      return true;
    }
    function collectConfig(){
      const axisSettings = ensureAxisSettings();
      const borderWidthVal = Number($('#pieBorderWidth')?.value);
      const statsConfig = exportPieStatsConfig();
      return {
        title: state.titleText,
        chartType: $('#pieChartType').value,
        showPercents: $('#pieShowPercents').checked,
        showFrame: $('#pieShowFrame').checked,
        showLegend: pieShowLegendInput ? !!pieShowLegendInput.checked : true,
        startAngle: $('#pieStartAngle').value,
        borderColor: ($('#pieBorderColor')?.value || '#ffffff'),
        borderWidth: Number.isFinite(borderWidthVal) ? borderWidthVal : 0,
        fontSize: $('#pieFontSize').value || String(DEFAULT_PIE_FONT_SIZE_PT),
        fontStyles: (exportFontStyles('pie') || undefined),
        valueColumn: statsConfig.valueColumn != null ? String(statsConfig.valueColumn) : '',
        expectedColumn: statsConfig.expectedColumn != null ? String(statsConfig.expectedColumn) : '',
        stats: statsConfig,
        colors: state.colors,
        axis: {
          strokeWidth: axisSettings.strokeWidth,
          color: axisSettings.color,
          tickIntervalX: axisSettings.x?.tickInterval ?? null,
          tickIntervalY: axisSettings.y?.tickInterval ?? null,
          minorTicksX: axisSettings.x?.minorTicks ?? false,
          minorTicksY: axisSettings.y?.minorTicks ?? false,
          minorTickSubdivisionsX: clampMinorTickSubdivisions(axisSettings.x?.minorTickSubdivisions),
          minorTickSubdivisionsY: clampMinorTickSubdivisions(axisSettings.y?.minorTickSubdivisions)
        },
        notes: {
          text: notesState.text || '',
          open: !!notesState.open
        },
        labelPositions: state.labelPositions || null
      };
    }
    pie.save = async function(){
      pieDebug('Debug: pie.save invoked', { hasHandle: !!state.fileHandle });
      if(!fileIO || typeof fileIO.saveGraphFile !== 'function'){
        console.error('pie.save missing fileIO.saveGraphFile');
        return;
      }
      const result = await fileIO.saveGraphFile({
        context: 'pie',
        fileHandle: state.fileHandle,
        getPayload,
        fileName: state.fileName,
        downloadFileName: state.fileName,
        setFileHandle: handle => { state.fileHandle = handle; },
        setFileName: name => { state.fileName = name; }
      });
      pieDebug('Debug: pie.save result', result);
    };
    pie.saveAs = async function(){
      pieDebug('Debug: pie.saveAs invoked', { currentName: state.fileName });
      if(!fileIO || typeof fileIO.saveGraphFileAs !== 'function'){
        console.error('pie.saveAs missing fileIO.saveGraphFileAs');
        return;
      }
      const result = await fileIO.saveGraphFileAs({
        context: 'pie',
        getPayload,
        fileName: state.fileName,
        downloadFileName: state.fileName,
        setFileHandle: handle => { state.fileHandle = handle; },
        setFileName: name => { state.fileName = name; }
      });
      pieDebug('Debug: pie.saveAs result', result);
    };
    pie.open = async function(){
      pieDebug('Debug: pie.open invoked');
      if(!fileIO || typeof fileIO.openGraphFile !== 'function'){
        console.error('pie.open missing fileIO.openGraphFile');
        return;
      }
      const result = await fileIO.openGraphFile({
        context: 'pie',
        setFileHandle: handle => { state.fileHandle = handle; },
        setFileName: name => { state.fileName = name; },
        loadFromFile: file => pie.loadFromFile(file),
        triggerInput: () => {
          const input = getPieNodeById('pieGraphFile');
          if(input){
            input.value='';
            input.click();
          }
        }
      });
      pieDebug('Debug: pie.open result', result);
    };
    pie.loadFromFile = function(file){
      const apply = payload => applyPiePayload(payload, { source: 'file' });
      if(file instanceof Blob){
        const reader=new FileReader();
        reader.onload=e=>{
          try{
            const obj=JSON.parse(e.target.result);
            if(!apply(obj)){
              console.warn('pie payload rejected from file', { hasType: !!obj?.type });
            }
          }catch(err){
            console.error('loadPieGraph error',err);
          }
        };
        reader.readAsText(file);
        return;
      }
      if(typeof file === 'string'){
        try{
          const parsed = JSON.parse(file);
          if(!apply(parsed)){
            console.warn('pie payload rejected from string');
          }
        }catch(err){
          console.error('loadPieGraph string parse error',err);
        }
        return;
      }
      if(file && typeof file === 'object'){
        apply(file);
      }
    };
    pie.loadFromPayload = function loadFromPayload(payload, options = {}){
      if(!applyPiePayload(payload, { source: 'payload', ...options })){
        console.warn('pie payload application failed', { source: 'payload' });
      }
    };
    getPieNodeById('openPieGraph')?.addEventListener('click',pie.open);
    getPieNodeById('savePieGraph')?.addEventListener('click',pie.save);
    getPieNodeById('saveAsPie').addEventListener('click',pie.saveAs);
    getPieNodeById('pieGraphFile').addEventListener('change',e=>{const f=e.target.files[0]; if(f){ state.fileName=f.name; state.fileHandle=null; pie.loadFromFile(f); }});
  }

  function ensurePieColors(labels){
    const palette = getDefaultPalette();
    const labelSet = new Set(labels);
    pieDebug('Debug: pie color palette in use', { palette }); // Debug: palette source and values
    labels.forEach((lab,i)=>{
      if(!state.colors[lab]){
        state.colors[lab]= palette[i % palette.length];
        pieDebug('Debug: pie default color applied',{label:lab,color:state.colors[lab]});
      }
    });
    Object.keys(state.colors).forEach(existing=>{
      if(!labelSet.has(existing)){
        pieDebug('Debug: pie color pruned',{label:existing});
        delete state.colors[existing];
      }
    });
    pieDebug('ensurePieColors sync',state.colors); // Debug: resulting color map
  }

  function ensurePieColorsIfNeeded(labels){
    const signature = Array.isArray(labels)
      ? labels.map(value => value == null ? '' : String(value)).join('\u0001')
      : '';
    if(signature === state.colorSignature){
      return;
    }
    state.colorSignature = signature;
    ensurePieColors(Array.isArray(labels) ? labels : []);
  }

  function computePieChiSquare(observed, expected){
    const values = (Array.isArray(observed) ? observed : []).map(Number);
    const expectedValues = (Array.isArray(expected) ? expected : []).map(Number);
    if(!values.length){
      return { available: false, message: 'No observed values supplied.' };
    }
    if(expectedValues.length !== values.length || expectedValues.some(v => !Number.isFinite(v) || v <= 0)){
      return { available: false, message: 'Expected values are required and must be positive.' };
    }
    const chi2 = values.reduce((sum, obs, idx) => sum + Math.pow(obs - expectedValues[idx], 2) / expectedValues[idx], 0);
    const df = Math.max(1, values.length - 1);
    let p = NaN;
    if(global.jStat && global.jStat.chisquare && typeof global.jStat.chisquare.cdf === 'function'){
      p = 1 - global.jStat.chisquare.cdf(chi2, df);
    }
    return { available: true, chi2, df, p };
  }

  // Compute and render Chi-square statistics for proportion graphs
  function updatePieStats(labels, observed, expected){
    try{
      const out=getPieNodeById('pieStatsResults');
      if(!out){ console.warn('Debug: pieStatsResults element not found'); return; }
      ensurePieStatsReportHost(out);
      clearPieStatsReportHost(out);
      pieDebug('Debug: updatePieStats start',{labelCount:labels.length,observedCount:observed.length,expectedCount:expected.length});
      if(!observed || !observed.length){ out.textContent='No data'; return; }
      if(!expected || expected.length!==observed.length || expected.some(e=>isNaN(e))){ out.textContent='Expected values required'; return; }
      const result = computePieChiSquare(observed, expected);
      if(!result.available){
        out.textContent = result.message || 'Unable to compute chi-square statistics.';
        return;
      }
      const { chi2, df, p } = result;
      const formatP=(val)=>{
        if(!isFinite(val)) return String(val);
        if(typeof Shared?.formatPValue === 'function'){
          return Shared.formatPValue(val);
        }
        return Number(val).toExponential(5);
      };
      const hasRenderer=Shared.statsTable && typeof Shared.statsTable.render==='function';
      const rows=[
        {metric:'Chi²',value:chi2.toFixed(4)},
        {metric:'df',value:String(df)},
        {metric:'p-value',value:isFinite(p)?formatP(p):'N/A'}
      ];
      if(hasRenderer){
        Shared.statsTable.render({
          target:out,
          columns:[
            {key:'metric',label:'Metric',align:'left'},
            {key:'value',label:'Value',align:'right'}
          ],
          rows,
          caption:'Goodness-of-fit test',
          options:{
            fileName:'pie-chi-square',
            contextLabel:'pie-chi-square'
          }
        });
      }else{
        out.innerHTML=`<table><tr><th>Chi²</th><td>${chi2.toFixed(4)}</td></tr><tr><th>df</th><td>${df}</td></tr><tr><th>p-value</th><td>${isFinite(p)?formatP(p):'N/A'}</td></tr></table>`;
      }
      if(Shared.statsReporting && typeof Shared.statsReporting.appendReportPanel === 'function'){
        Shared.statsReporting.appendReportPanel(out, {
          methodsText: `A chi-square goodness-of-fit test compared observed counts across ${observed.length} categories against the supplied expected counts.`,
          resultsText: `Chi-square = ${chi2.toFixed(4)}, df = ${df}, p = ${isFinite(p)?formatP(p):'N/A'}.`,
          analysisSpec: {
            component: 'pie',
            categoryCount: observed.length,
            labels: Array.isArray(labels) ? labels.slice() : [],
            chiSquare: Number.isFinite(chi2) ? chi2 : null,
            df,
            p: Number.isFinite(p) ? p : null
          }
        }, { title: 'Reporting and reproducibility' });
      }
      pieDebug('Debug: updatePieStats result',{chi2,df,p});
    }catch(err){ console.error('updatePieStats error',err); }
  }

  function updatePieColumns(header, matrix){
    const dataModel = buildPieStatsDataModel(Array.isArray(matrix) ? matrix : []);
    state.statsDataModel = dataModel;
    ensurePieStatsSelections(dataModel);
    renderPieStatsControls(dataModel, { force: true, reason: 'columns-update' });
    if(getPieStatsConfig().restorePending){
      if(pieDebugEnabled()){
        pieDebug('Debug: pie stats column refresh preserved restored results', {
          count: dataModel.columns?.length || 0,
          rows: dataModel.rows?.length || 0
        });
      }
      return;
    }
    requestPieStatsContextRefresh('columns-update');
    if(pieDebugEnabled()){
      pieDebug('Debug: pie stats columns refreshed', {
        count: dataModel.columns?.length || 0,
        rows: dataModel.rows?.length || 0
      });
    }
  }

  function updatePieColumnsIfNeeded(header, matrix){
    const signature = Array.isArray(matrix)
      ? matrix.map(row => Array.isArray(row) ? row.map(value => value == null ? '' : String(value)).join('\u0002') : '').join('\u0001')
      : (Array.isArray(header)
        ? header.map(value => value == null ? '' : String(value)).join('\u0001')
        : '');
    if(signature === state.columnSignature){
      return;
    }
    state.columnSignature = signature;
    updatePieColumns(Array.isArray(header) ? header : [], matrix);
  }

  function draw(){
    const plotEl=getPieNodeById('piePlot'); while(plotEl.firstChild) plotEl.removeChild(plotEl.firstChild);
    const type=$('#pieChartType').value;
    const isResizePreview = !!state.resizeState?.active;
    const containerRect=state.svgBox?.getBoundingClientRect?.();
    const pieFontInput=$('#pieFontSize');
    const rawPieFontSize = pieFontInput?.value || String(DEFAULT_PIE_FONT_SIZE_PT);
    const fontInfo=chartStyle.resolveScaledFontSize({
      rawSize: rawPieFontSize,
      width: containerRect?.width,
      height: containerRect?.height,
      svgBox: state.svgBox,
      input: pieFontInput
    });
    const fs=fontInfo.scaledPx || DEFAULT_PIE_FONT_SIZE_PT;
    chartStyle.renderFontSizeLabel({ element: pieFontSizeVal, fontInfo, input: pieFontInput });
    pieDebug('Debug: pie font scaling applied',{
      input:$('#pieFontSize').value,
      fontSizePt:fontInfo.pt,
      baseFontPx:fontInfo.px,
      scaledFontPx:fs,
      scale:fontInfo.scaleInfo?.scale,
      containerWidth:containerRect?.width,
      containerHeight:containerRect?.height
    });
    const styleScaleInfo=fontInfo.scaleInfo;
    const axisMetrics=chartStyle.createAxisMetrics(fontInfo.px, styleScaleInfo);
    pieDebug('Debug: pie axis metrics',axisMetrics);
    const fontScale=styleScaleInfo?.styleScale || styleScaleInfo?.scale || 1;
    const borderColor = $('#pieBorderColor')?.value || '#ffffff';
    const borderWidthBase = Number.parseFloat($('#pieBorderWidth')?.value) || 0;
    const borderWidth = chartStyle.scaleStrokeWidth(borderWidthBase, styleScaleInfo, { context: 'pie-border', min: 0 });
    pieDebug('Debug: pie border settings',{ borderColor, borderWidthBase, borderWidth });
    const showPerc=$('#pieShowPercents').checked;
    const showFrame=$('#pieShowFrame').checked;
    pieDebug('Debug: pie showFrame state',{showFrame, chartType:type});
    ensurePieLegendControlPlacement();
    const showLegendInput=getPieNodeById('pieShowLegend');
    const showLegend=showLegendInput ? !!showLegendInput.checked : true;
    pieDebug('Debug: pie showLegend state',{showLegend, chartType:type});
    const startDeg=parseFloat($('#pieStartAngle').value)||0;
    const data = typeof state.hot?.getIncludedDataMatrix === 'function'
      ? state.hot.getIncludedDataMatrix()
      : (Shared.hot?.getIncludedDataMatrix ? Shared.hot.getIncludedDataMatrix(state.hot) : []);
    if(!isResizePreview){
      updatePieColumnsIfNeeded(data[0]||[], data);
    }


    if(type==='stacked'){
      const header=data[0]||[];
      const barHeaders=header.slice(1).filter(h=>h!==null&&h!=='');
      const segmentLabels=[];
      const segmentValues=[];
      for(let r=1;r<data.length;r++){
        const row=data[r];
        const seg=row[0];
        if(seg){
          const vals=[];
          for(let c=1;c<=barHeaders.length;c+=1){
            const v=parseFloat(row[c]);
            vals.push(isNaN(v)?0:v);
          }
          segmentLabels.push(String(seg));
          segmentValues.push(vals);
        }
      }
      if(!barHeaders.length||!segmentLabels.length){
        if(typeof Shared.renderPlotNotice === 'function'){
          Shared.renderPlotNotice(plotEl, Shared.getEmptyPlotNoticeMessage ? Shared.getEmptyPlotNoticeMessage() : null, { resetAspect: true, show: true });
        }else{
          plotEl.innerHTML='<i>Add data to the input table to generate a plot.</i>';
        }
        if(!isResizePreview){
          primePieStatsComputation({ matrix: data, reason: 'draw-stacked-empty' });
        }
        return;
      }
      ensurePieColorsIfNeeded(segmentLabels);
      const palette = getDefaultPalette();
      const stackedLegendEntries = showLegend ? segmentLabels.map((lab,i)=>({
        label: lab,
        fill: state.colors[lab] || palette[i % palette.length],
        key: lab,
        editable: true
      })) : [];
      const stackedLegendLayout = chartStyle.computeLegendLayout({
        entries: stackedLegendEntries,
        fontSize: fs,
        onSwatchClick: handlePieLegendSwatchClick
      });
      const stackedLegendVisible = showLegend && stackedLegendLayout.renderer.entries.length > 0;
      state.legendWidth = stackedLegendVisible ? Math.ceil(stackedLegendLayout.renderer.width) : 0;
      const stackedLegendMargin = stackedLegendVisible ? Math.max(stackedLegendLayout.legendGapPx, Math.round(8 * fontScale)) : 0;
      const stackedLegendGap = stackedLegendVisible ? stackedLegendLayout.legendGapPx : 0;
      const stackedLegendMarkerSize = stackedLegendVisible ? stackedLegendLayout.renderer.swatchSize : 0;
      pieDebug('Debug: pie stacked legend metrics',{
        legendWidth: state.legendWidth,
        legendGap: stackedLegendGap,
        legendMarkerSize: stackedLegendMarkerSize,
        entryCount: stackedLegendLayout.renderer.entries.length,
        legendVisible: stackedLegendVisible
      });
      plotEl.style.display='flex';
      plotEl.style.alignItems='flex-start';
      const svgWidth=Math.max(50,Math.floor(plotEl.clientWidth||50));
      const svgHeight=Math.max(50,Math.floor(plotEl.clientHeight||50));
      const svg=document.createElementNS(NS,'svg');
      svg.setAttribute('id','pieSvg');
      svg.setAttribute('width',String(svgWidth));
      svg.setAttribute('height',String(svgHeight));
      svg.setAttribute('viewBox',`0 0 ${svgWidth} ${svgHeight}`);
      svg.setAttribute('font-family',chartStyle.FONT_FAMILY);
      chartStyle.applySvgDefaults(svg);
      plotEl.appendChild(svg);
      const doc = svg.ownerDocument || global.document;
      const barLayer = doc?.createElementNS ? doc.createElementNS(NS,'g') : null;
      const axisLayer = doc?.createElementNS ? doc.createElementNS(NS,'g') : null;
      const labelLayer = doc?.createElementNS ? doc.createElementNS(NS,'g') : null;
      if(barLayer){
        barLayer.dataset.layer = 'pie-data';
        svg.appendChild(barLayer);
      }
      if(axisLayer){
        axisLayer.dataset.layer = 'pie-axis';
        svg.appendChild(axisLayer);
      }
      if(labelLayer){
        labelLayer.dataset.layer = 'pie-labels';
        // Append after bars and axes so text stays on top
        svg.appendChild(labelLayer);
      }
      if(!isResizePreview && fontControls && typeof fontControls.enableForSvg === 'function'){
        fontControls.enableForSvg(svg,{ scopeId: 'pie' });
        pieDebug('Debug: pie fontControls enableForSvg invoked',{ width: svgWidth, height: svgHeight });
      } else if(!isResizePreview) {
        pieDebug('Debug: pie fontControls enableForSvg missing',{ hasFontControls: !!fontControls });
      }
      const axisSettings = ensureAxisSettings();
      const axisStrokeWidthBase = axisSettings.strokeWidth;
      const axisStrokeWidth = chartStyle.scaleStrokeWidth(axisStrokeWidthBase, styleScaleInfo, { context: 'pie-axis', min: 0, exact: true});
      const axisStroke = axisSettings.color || '#000';
      const manualIntervalY = getAxisTickInterval('y');
      const axisTickTools = chartStyle.axisTicks || null;
      const buildAxisScale = opts => {
        if(axisTickTools && typeof axisTickTools.buildScale === 'function'){
          return axisTickTools.buildScale(opts);
        }
        const min = Number.isFinite(opts?.manualMin) ? opts.manualMin : Number(opts?.dataMin) || 0;
        const max = Number.isFinite(opts?.manualMax) ? opts.manualMax : Number(opts?.dataMax) || min + 1;
        return { min, max, ticks: [min, max], step: Math.max((max - min) || 1, 1) };
      };
      const yTickTarget = chartStyle.estimateTickCount(svgHeight, { axis: 'y', fallback: 6 });
      const percentScale = buildAxisScale({
        dataMin: 0,
        dataMax: 100,
        manualMin: 0,
        manualMax: 100,
        targetTickCount: yTickTarget,
        fixedStep: Number.isFinite(manualIntervalY) && manualIntervalY > 0 ? manualIntervalY : undefined
      });
      const percentTicks = percentScale.ticks.map(t => Math.max(0, Math.min(100, t)));
      pieDebug('Debug: pie stacked axis stroke',{ axisStrokeWidthBase, axisStrokeWidth, axisStroke, manualIntervalY });
      const yTickLabels=percentTicks.map(v=>`${Number.isInteger(v) ? v : Number(v).toFixed(1)}%`);
      const pieFontStyles = exportFontStyles('pie');
      const xTickMeasureFont = (chartStyle && typeof chartStyle.resolveScopedLabelMeasureFont === 'function')
        ? chartStyle.resolveScopedLabelMeasureFont({ styles: pieFontStyles, role: 'xTick', fallbackPx: fs }).fontSpec
        : chartStyle.makeFont(fs);
      const yTickMeasureFont = (chartStyle && typeof chartStyle.resolveScopedLabelMeasureFont === 'function')
        ? chartStyle.resolveScopedLabelMeasureFont({ styles: pieFontStyles, role: 'yTick', fallbackPx: fs }).fontSpec
        : chartStyle.makeFont(fs);
      const tickFont=yTickMeasureFont;
      const yLabelWidths=yTickLabels.map(lbl=>chartStyle.measureText(lbl,tickFont));
      const maxYLabelWidth=Math.max(...yLabelWidths,0);
      const axisLabelFont=chartStyle.makeFont(fs);
      const yTitleText='Percentage';
      const yTitleWidth=chartStyle.measureText(yTitleText,axisLabelFont);
      const stackedLegendWidthForMargin = stackedLegendVisible ? stackedLegendLayout.legendWidthForMargin : 0;
      let margin=chartStyle.computeBaseMargins({fontSize:fs,legendWidth:stackedLegendWidthForMargin,maxYLabelWidth,yTitleWidth,axisMetrics});
      let chartWidth=Math.max(20,svgWidth-margin.left-margin.right);
      let chartHeight=Math.max(20,svgHeight-margin.top-margin.bottom);
      const bottomLayout=chartStyle.computeBottomLayout({labels:barHeaders,fontSize:fs,labelMeasureFont:xTickMeasureFont,plotWidth:chartWidth,baseBottom:margin.bottom,axisMetrics});
      margin.bottom=bottomLayout.bottom;
      margin = chartStyle.stabilizeAxisResizeMargins
        ? chartStyle.stabilizeAxisResizeMargins(margin, { svgBox: state.svgBox, scopeId: 'pie' })
        : margin;
      chartWidth=Math.max(20,svgWidth-margin.left-margin.right);
      chartHeight=Math.max(20,svgHeight-margin.top-margin.bottom);
      const tickLen=axisMetrics.tickLength;
      const tickGap=axisMetrics.tickLabelGap;
      const axis=document.createElementNS(NS,'g');
      const axisHost = axisLayer || svg;
      axisHost.appendChild(axis);
      const yAxis=document.createElementNS(NS,'line'); yAxis.setAttribute('x1',margin.left); yAxis.setAttribute('y1',margin.top); yAxis.setAttribute('x2',margin.left); yAxis.setAttribute('y2',margin.top+chartHeight); yAxis.setAttribute('stroke',axisStroke); yAxis.setAttribute('stroke-width',axisStrokeWidth); axis.appendChild(yAxis);
      const xAxis=document.createElementNS(NS,'line'); xAxis.setAttribute('x1',margin.left); xAxis.setAttribute('y1',margin.top+chartHeight); xAxis.setAttribute('x2',margin.left+chartWidth); xAxis.setAttribute('y2',margin.top+chartHeight); xAxis.setAttribute('stroke',axisStroke); xAxis.setAttribute('stroke-width',axisStrokeWidth); axis.appendChild(xAxis);
      const minorTickStyle = chartStyle.resolveMinorTickStyle({ tickLength: tickLen, strokeWidth: axisStrokeWidth });
      const minorSubdivisionsY = getAxisMinorTickSubdivisions('y');
      const minorTicksY = getAxisMinorTicksEnabled('y')
        ? chartStyle.computeMinorTickPositions({
            majorTicks: percentScale.ticks,
            min: Number.isFinite(percentScale.min) ? percentScale.min : 0,
            max: Number.isFinite(percentScale.max) ? percentScale.max : 100,
            scale: 'linear',
            subdivisions: minorSubdivisionsY
          }).filter(value => value >= 0 && value <= 100)
        : [];
      const axisControlConfig = axisName => ({
        axis: axisName,
        scopeId: 'pie',
        getTickInterval: () => getAxisTickInterval(axisName),
        getThickness: () => getAxisStrokeWidthBase(),
        getColor: () => getAxisColor(),
        isTickIntervalEnabled: () => axisName === 'y',
        getTickIntervalDisabledMessage: () => 'Tick interval is managed automatically for categorical axes.',
        tickPlaceholder: 'Auto',
        onTickIntervalChange: value => updateAxisTickInterval(axisName, value),
        getMinorTicksEnabled: () => getAxisMinorTicksEnabled(axisName),
        onMinorTicksChange: value => updateAxisMinorTicks(axisName, value),
        isMinorTicksSupported: () => axisName === 'y',
        getMinorTickSubdivisions: () => getAxisMinorTickSubdivisions(axisName),
        onMinorTickSubdivisionsChange: value => updateAxisMinorTickSubdivisions(axisName, value),
        onThicknessChange: value => updateAxisStrokeWidth(value),
        onColorChange: value => updateAxisColor(value)
      });
      if(axisControls && typeof axisControls.registerAxisElement === 'function'){
        axisControls.registerAxisElement(xAxis, axisControlConfig('x'));
        axisControls.registerAxisElement(yAxis, axisControlConfig('y'));
      }
      let stackedYTickCount = 0;
      if(minorTicksY.length){
        minorTicksY.forEach(value => {
          const y=margin.top+chartHeight-(chartHeight*value/100);
          const tick=document.createElementNS(NS,'line');
          tick.setAttribute('x1',margin.left - minorTickStyle.length);
          tick.setAttribute('y1',y);
          tick.setAttribute('x2',margin.left);
          tick.setAttribute('y2',y);
          tick.setAttribute('stroke',axisStroke);
          tick.setAttribute('stroke-width',minorTickStyle.strokeWidth);
          tick.setAttribute('stroke-linecap','round');
          tick.setAttribute('opacity',String(minorTickStyle.opacity));
          axis.appendChild(tick);
        });
      }
      percentTicks.forEach(t=>{
        const y=margin.top+chartHeight-(chartHeight*t/100);
        const tick=document.createElementNS(NS,'line');
        tick.setAttribute('x1',margin.left-tickLen);
        tick.setAttribute('y1',y);
        tick.setAttribute('x2',margin.left);
        tick.setAttribute('y2',y);
        tick.setAttribute('stroke',axisStroke);
        tick.setAttribute('stroke-width',axisStrokeWidth);
        axis.appendChild(tick);
        const txt=document.createElementNS(NS,'text');
        txt.setAttribute('x',margin.left-(tickLen+tickGap));
        txt.setAttribute('y',y);
        txt.setAttribute('text-anchor','end');
        txt.setAttribute('dominant-baseline','middle');
        txt.setAttribute('font-size',fs);
        txt.textContent=`${Number.isInteger(t)?t:t.toFixed(1)}%`;
        markFontEditable(txt,'yTick');
        stackedYTickCount+=1;
        axis.appendChild(txt);
      });
      const yTitleX=margin.left-(maxYLabelWidth+tickLen+tickGap+axisMetrics.axisTitleGap+fs*0.5);
      const yTitle=document.createElementNS(NS,'text');
      yTitle.setAttribute('x',yTitleX);
      yTitle.setAttribute('y',margin.top+chartHeight/2);
      yTitle.setAttribute('text-anchor','middle');
      yTitle.setAttribute('transform',`rotate(-90 ${yTitleX} ${margin.top+chartHeight/2})`);
      yTitle.setAttribute('font-size',fs);
      yTitle.textContent=yTitleText;
      markFontEditable(yTitle,'yTitle','yTitle');
      axis.appendChild(yTitle);
      if(showFrame){
        pieDebug('Debug: pie frame request',{stroke:axisStroke, showFrame, axisStrokeWidth});
        chartStyle.drawPlotFrame({ svg, margin, plotW: chartWidth, plotH: chartHeight, stroke: axisStroke, strokeWidth: axisStrokeWidth, sides: ['top','right'], group: axis });
      }
      const barGapBase=10;
      const barGap=Math.max(6,Math.round(barGapBase*fontScale));
      const availableWidth=Math.max(0,chartWidth-(barHeaders.length+1)*barGap);
      const barWidth=barHeaders.length?Math.max(0,availableWidth/barHeaders.length):0;
      const barTotals=barHeaders.map((_,barIndex)=>segmentValues.reduce((sum,row)=>sum+(row[barIndex]||0),0));
      let stackedPercentFontSize=fs;
      if(showPerc){
        const percentFont=chartStyle.makeFont(fs);
        const horizontalPadding=Math.max(1,Math.round(2*fontScale));
        const labelMaxWidth=Math.max(0,barWidth-horizontalPadding*2);
        let widestLabelWidth=0;
        let widestLabelText='';
        barTotals.forEach((total,barIndex)=>{
          if(!(total>0)){ return; }
          segmentValues.forEach(row=>{
            const value=row[barIndex]||0;
            const frac=value/total;
            if(!(frac>0)){ return; }
            const labelText=(frac*100).toFixed(1)+'%';
            const measuredWidth=chartStyle.measureText(labelText,percentFont);
            if(measuredWidth>widestLabelWidth){
              widestLabelWidth=measuredWidth;
              widestLabelText=labelText;
            }
          });
        });
        if(widestLabelWidth>0 && labelMaxWidth>0){
          const widthScale=Math.min(1,labelMaxWidth/widestLabelWidth);
          stackedPercentFontSize=Math.max(1,fs*widthScale);
        }
        if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
          pieDebug('Debug: pie stacked percentage font auto-fit',{
            baseFontSize: fs,
            appliedFontSize: stackedPercentFontSize,
            barWidth,
            labelMaxWidth,
            widestLabelText,
            widestLabelWidth
          });
        }
      }
      const xLabels=[];
      pieDebug('Debug: pie stacked layout metrics',{svgWidth,svgHeight,chartWidth,chartHeight,barCount:barHeaders.length,barWidth,barGap,fontScale});
      let stackedXTickCount = 0;
      barHeaders.forEach((bh,j)=>{
        let y=margin.top+chartHeight;
        const total=barTotals[j]||0;
        segmentLabels.forEach((lab,i)=>{
          const val=segmentValues[i][j]||0;
          const frac=total?val/total:0;
          const h=chartHeight*frac;
          y-=h;
          const rect=document.createElementNS(NS,'rect');
          rect.setAttribute('x',margin.left+barGap+j*(barWidth+barGap));
          rect.setAttribute('y',y);
          rect.setAttribute('width',barWidth);
          rect.setAttribute('height',h);
          const fillColor = state.colors[lab] || palette[i % palette.length];
          rect.setAttribute('fill', fillColor);
          if(borderWidth > 0){
            rect.setAttribute('stroke', borderColor);
            rect.setAttribute('stroke-width', borderWidth);
            rect.setAttribute('stroke-linejoin', 'round');
          }
          (barLayer||svg).appendChild(rect);
          if(showPerc && frac>0 && labelLayer){
            const txt=document.createElementNS(NS,'text');
            txt.setAttribute('x',margin.left+barGap+j*(barWidth+barGap)+barWidth/2);
            txt.setAttribute('y',y+h/2);
            txt.setAttribute('text-anchor','middle');
            txt.setAttribute('dominant-baseline','middle');
            txt.setAttribute('font-size',stackedPercentFontSize);
            txt.textContent=(frac*100).toFixed(1)+'%';
            markFontEditable(txt,'annotation',`stacked-annotation-${j}-${i}`);
            labelLayer.appendChild(txt);
          }
        });
        const lbl=document.createElementNS(NS,'text');
        const lx=margin.left+barGap+j*(barWidth+barGap)+barWidth/2;
        const extra = Shared.computeAxisLabelYOffset ? Shared.computeAxisLabelYOffset(fs, tickLen, tickGap) : 0;
        const ly=margin.top+chartHeight+tickLen+tickGap+extra;
        lbl.setAttribute('x',lx);
        lbl.setAttribute('y',ly);
        lbl.setAttribute('text-anchor','middle');
        lbl.setAttribute('font-size',fs);
        Shared.applyTextBaseline && Shared.applyTextBaseline(lbl,'hanging',fs);
        lbl.textContent=bh;
        markFontEditable(lbl,'xTick');
        stackedXTickCount+=1;
        (axisLayer||svg).appendChild(lbl);
        xLabels.push(lbl);
      });
      pieDebug('Debug: pie stacked font tick binding',{ stackedXTickCount, stackedYTickCount });
      chartStyle.applyLabelOrientation(xLabels,{angle:-45,anchor:'end',dy:'0.35em',force:bottomLayout.shouldRotate});
      // Legend now rendered inside the SVG so it can be repositioned.
      if(stackedLegendVisible){
        const legendRenderer = stackedLegendLayout.renderer;
        const defaultLegendX = margin.left + chartWidth + stackedLegendLayout.legendGapPx;
        const defaultLegendY = margin.top + (legendRenderer.baselineOffset || 0);
        const legendGroup = drawPieLegend(svg, stackedLegendLayout, { x: defaultLegendX, y: defaultLegendY }, { width: svgWidth, height: svgHeight });
        if(!legendGroup){
          pieDebug('Debug: pie legend skipped',{ legendVisible: stackedLegendVisible, segmentCount: segmentLabels.length, reason: 'draw-failed' });
        }
      }else{
        pieDebug('Debug: pie legend skipped',{ legendVisible: stackedLegendVisible, segmentCount: segmentLabels.length });
      }
      if(axis.parentNode !== (axisLayer || svg)){
        (axisLayer || svg).appendChild(axis);
      }
      const defaultTitleX = margin.left+chartWidth/2;
      const defaultTitleY = margin.top/2;
      const titlePos = state.labelPositions?.title;
      const title=document.createElementNS(NS,'text');
      title.setAttribute('x', titlePos?.x ?? defaultTitleX);
      title.setAttribute('y', titlePos?.y ?? defaultTitleY);
      title.setAttribute('text-anchor','middle');
      title.setAttribute('font-size',fs);
      title.textContent=state.titleText;
      markFontEditable(title,'graphTitle','graphTitle');
      if(!isResizePreview && global.makeEditable){
        makeEditable(title,txt=>{
          const previous=state.titleText!=null?String(state.titleText):'';
          const nextValue=txt!=null?String(txt):'';
          if(previous===nextValue){
            return;
          }
          applyPieTitleValue(title,nextValue);
          recordPieChange('pie:title',previous,nextValue,value=>applyPieTitleValue(title,value));
        });
      }
      // Enable drag for title
      if(!isResizePreview && typeof Shared.enableLabelDrag === 'function'){
        Shared.enableLabelDrag(title, svg, {
          onDragEnd: pos => {
            state.labelPositions.title = { x: pos.x, y: pos.y };
            pieDebug('Debug: pie title position saved', pos);
          }
        });
      }
      svg.appendChild(title);
      if(!isResizePreview){
        ensureGraphViewport(svg, { padding: Math.max(fs, 14), debugLabel: 'pie-graph' });
      }
      if(!isResizePreview){
        primePieStatsComputation({ matrix: data, reason: 'draw-stacked' });
      }
      return;
    }

    const header=data[0]||[];
    const labels=[];
    const seriesColumnsRaw=[];
    for(let c=1;c<header.length;c+=1){
      const colLabel=header[c] || `Column ${c+1}`;
      if(colLabel==null || String(colLabel).trim()===''){
        continue;
      }
      seriesColumnsRaw.push({ index: c, label: String(colLabel), values: [] });
    }
    for(let r=1;r<data.length;r+=1){
      const row=data[r];
      if(!row || row[0]==null || row[0]===''){
        continue;
      }
      labels.push(String(row[0]));
      seriesColumnsRaw.forEach(series=>{
        const rawVal=row[series.index];
        const numVal=parseFloat(rawVal);
        series.values.push(isNaN(numVal)?0:numVal);
      });
    }
    const seriesColumns=seriesColumnsRaw.filter(series=>series.values.some(v=>typeof v==='number' && isFinite(v) && v!==0));
    if(!seriesColumns.length || !labels.length){
      if(typeof Shared.renderPlotNotice === 'function'){
        Shared.renderPlotNotice(plotEl, Shared.getEmptyPlotNoticeMessage ? Shared.getEmptyPlotNoticeMessage() : null, { resetAspect: true, show: true });
      }else{
        plotEl.innerHTML='<i>Add data to the input table to generate a plot.</i>';
      }
      if(!isResizePreview){
        primePieStatsComputation({ matrix: data, reason: 'draw-empty' });
      }
      return;
    }
    ensurePieColorsIfNeeded(labels);
    const palette2 = getDefaultPalette();
    const radialLegendEntries = showLegend ? labels.map((lab,i)=>({
      label: lab,
      fill: state.colors[lab] || palette2[i % palette2.length],
      key: lab,
      editable: true
    })) : [];
    const radialLegendLayout = chartStyle.computeLegendLayout({
      entries: radialLegendEntries,
      fontSize: fs,
      onSwatchClick: handlePieLegendSwatchClick
    });
    const radialLegendVisible = showLegend && radialLegendLayout.renderer.entries.length > 0;
    state.legendWidth = radialLegendVisible ? Math.ceil(radialLegendLayout.renderer.width) : 0;
    const radialLegendMargin = radialLegendVisible ? Math.max(radialLegendLayout.legendGapPx, Math.round(8 * fontScale)) : 0;
    const radialLegendGap = radialLegendVisible ? radialLegendLayout.legendGapPx : 0;
    const radialLegendMarkerSize = radialLegendVisible ? radialLegendLayout.renderer.swatchSize : 0;
    pieDebug('Debug: pie radial legend metrics',{
      legendWidth: state.legendWidth,
      legendGap: radialLegendGap,
      legendMarkerSize: radialLegendMarkerSize,
      entryCount: radialLegendLayout.renderer.entries.length,
      legendVisible: radialLegendVisible
    });
    plotEl.style.display='flex';
    plotEl.style.alignItems='flex-start';
    const plotWidth=Math.max(50,Math.floor(plotEl.clientWidth||50));
    const plotHeight=Math.max(50,Math.floor(plotEl.clientHeight||50));
    const svgWidth=Math.max(50, plotWidth);
    const svgHeight=Math.max(50,plotHeight);
    pieDebug('Debug: pie radial layout metrics', {
      plotWidth,
      plotHeight,
      svgWidth,
      svgHeight,
      legendWidth: state.legendWidth,
      legendMargin: radialLegendMargin,
      chartType: type,
      legendVisible: radialLegendVisible
    });
    const chartCount=seriesColumns.length;
    const svg=document.createElementNS(NS,'svg');
    svg.setAttribute('id','pieSvg');
    svg.setAttribute('width',String(svgWidth));
    svg.setAttribute('height',String(svgHeight));
    svg.setAttribute('viewBox',`0 0 ${svgWidth} ${svgHeight}`);
    svg.setAttribute('font-family',chartStyle.FONT_FAMILY);
    chartStyle.applySvgDefaults(svg);
    const svgWrapper=document.createElement('div');
    svgWrapper.style.flex='1 1 auto';
    svgWrapper.style.width='100%';
    svgWrapper.style.minWidth='0';
    svgWrapper.style.display='flex';
    svgWrapper.style.alignItems='flex-start';
    svgWrapper.style.justifyContent='center';
    svgWrapper.style.overflow='hidden';
    svg.style.display='block';
    svg.style.minWidth='0';
    svgWrapper.appendChild(svg);
    plotEl.appendChild(svgWrapper);
    const doc = svg.ownerDocument || global.document;
    const radialDataLayer = doc?.createElementNS ? doc.createElementNS(NS,'g') : null;
    const radialLabelLayer = doc?.createElementNS ? doc.createElementNS(NS,'g') : null;
    if(radialDataLayer){
      radialDataLayer.dataset.layer = 'pie-data';
      svg.appendChild(radialDataLayer);
    }
    if(radialLabelLayer){
      radialLabelLayer.dataset.layer = 'pie-labels';
      svg.appendChild(radialLabelLayer);
    }
    if(!isResizePreview && fontControls && typeof fontControls.enableForSvg === 'function'){
      fontControls.enableForSvg(svg,{ scopeId: 'pie' });
      pieDebug('Debug: pie fontControls enableForSvg invoked',{ width: svgWidth, height: svgHeight });
    } else if(!isResizePreview) {
      pieDebug('Debug: pie fontControls enableForSvg missing',{ hasFontControls: !!fontControls });
    }
    const axisStrokeWidthBase = getAxisStrokeWidthBase();
    const axisStrokeWidth = chartStyle.scaleStrokeWidth(axisStrokeWidthBase, styleScaleInfo, { context: 'pie-axis', min: 0, exact: true });
    const frameStroke = '#000';
    const legendMarkerSize=Math.max(10,Math.round(12*fontScale));
    const legendReservedWidth = radialLegendVisible ? radialLegendLayout.legendWidthForMargin : 0;
    const contentLeft = 0;
    const contentRight = Math.max(contentLeft + 50, svgWidth - legendReservedWidth);
    const contentWidth = Math.max(50, contentRight - contentLeft);
    const contentTop=fs*2;
    const contentBottom=svgHeight-fs*2.2;
    const contentHeight=Math.max(10,contentBottom-contentTop);
    let rows=1;
    let cols=chartCount;
    if(chartCount===2){
      rows=1; cols=2;
    }else if(chartCount===3){
      rows=2; cols=2;
    }else if(chartCount===4){
      rows=2; cols=2;
    }else if(chartCount>4){
      rows=Math.ceil(Math.sqrt(chartCount));
      cols=Math.ceil(chartCount/rows);
    }
    const colWidth=contentWidth/Math.max(1,cols);
    const rowHeight=contentHeight/Math.max(1,rows);
    const rHoriz=colWidth*0.35;
    const rVert=rowHeight*0.35;
    const minReadableRadius = 10;
    const minSafeRadius = 2;
    let r=Math.max(minReadableRadius,Math.min(rHoriz,rVert));
    const seriesLabelOffset = fs * 1.05;
    const seriesLabelDescender = Math.max(2, fs * 0.35);
    const seriesLabelBottomPadding = Math.max(2, fs * 0.3);
    const centers=[];
    seriesColumns.forEach((_series,idx)=>{
      const row=Math.floor(idx/cols);
      const col=idx%cols;
      const cx=contentLeft + colWidth*(col+0.5);
      const cy=contentTop+rowHeight*(row+0.5);
      centers.push({ cx, cy });
    });
    // Compute a safe common radius so all pies and labels stay
    // fully inside the SVG bounds.
    if(centers.length){
      const leftLimit=contentLeft + fs; // padding from left edge
      const rightLimit=contentRight - fs; // keep charts clear of the legend lane
      const topLimit=contentTop + fs*0.2;
      const bottomLimit=contentBottom; // respect bottom chart padding
      let maxAllowedR=r;
      centers.forEach(center=>{
        if(!center){ return; }
        let localMax=r;
        // Keep circle inside left/right bounds
        localMax=Math.min(localMax, center.cx-leftLimit);
        localMax=Math.min(localMax, rightLimit-center.cx);
        // Keep circle and label inside top/bottom bounds
        localMax=Math.min(localMax, center.cy-topLimit);
        localMax=Math.min(localMax, bottomLimit-center.cy-seriesLabelOffset-seriesLabelDescender-seriesLabelBottomPadding);
        if(localMax<maxAllowedR){
          maxAllowedR=localMax;
        }
      });
      if(Number.isFinite(maxAllowedR)){
        r=Math.max(minSafeRadius,Math.min(r,maxAllowedR));
      }
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        pieDebug('Debug: pie radial radius constraints',{
          requestedRadius: Math.max(minReadableRadius,Math.min(rHoriz,rVert)),
          maxAllowedR,
          appliedRadius: r,
          chartCount,
          rows,
          cols
        });
      }
    }
    if(type==='donut'){
      r=r*0.9;
    }
    const effectiveR=r;
    const effectiveInnerR=type==='donut' ? effectiveR*0.6 : 0;
    const radialPercentSlices = [];
    seriesColumns.forEach((series,seriesIndex)=>{
      const center=centers[seriesIndex] || { cx: svgWidth/2, cy: contentTop+contentHeight/2 };
      const cx=center.cx;
      const cy=center.cy;
      const sum=series.values.reduce((a,b)=>a+b,0) || 1;
      let startAngle=startDeg*Math.PI/180;
      labels.forEach((lab,i)=>{
        const v=series.values[i] || 0;
        const frac=v/sum;
        const endAngle=startAngle+2*Math.PI*frac;
        const x1=cx + effectiveR*Math.cos(startAngle);
        const y1=cy + effectiveR*Math.sin(startAngle);
        const x2=cx + effectiveR*Math.cos(endAngle);
        const y2=cy + effectiveR*Math.sin(endAngle);
        const largeArc = (endAngle-startAngle) > Math.PI ? 1 : 0;
        const path=document.createElementNS(NS,'path');
        if(effectiveInnerR>0){
          const x1i=cx + effectiveInnerR*Math.cos(startAngle);
          const y1i=cy + effectiveInnerR*Math.sin(startAngle);
          const x2i=cx + effectiveInnerR*Math.cos(endAngle);
          const y2i=cy + effectiveInnerR*Math.sin(endAngle);
          const d=`M ${x1} ${y1} A ${effectiveR} ${effectiveR} 0 ${largeArc} 1 ${x2} ${y2} L ${x2i} ${y2i} A ${effectiveInnerR} ${effectiveInnerR} 0 ${largeArc} 0 ${x1i} ${y1i} Z`;
          path.setAttribute('d',d);
        } else {
          const d=`M ${cx} ${cy} L ${x1} ${y1} A ${effectiveR} ${effectiveR} 0 ${largeArc} 1 ${x2} ${y2} Z`;
          path.setAttribute('d',d);
        }
        const fillColor = state.colors[lab] || palette2[i % palette2.length];
        path.setAttribute('fill', fillColor);
        if(borderWidth > 0){
          path.setAttribute('stroke', borderColor);
          path.setAttribute('stroke-width', borderWidth);
          path.setAttribute('stroke-linejoin', 'round');
        }
        (radialDataLayer || svg).appendChild(path);
        if(showPerc && frac>0){
          radialPercentSlices.push({
            seriesIndex,
            sliceIndex: i,
            text: (frac*100).toFixed(1)+'%',
            cx,
            cy,
            startAngle,
            endAngle,
            innerRadius: effectiveInnerR,
            outerRadius: effectiveR,
            preferredRadius: effectiveInnerR>0 ? (effectiveR+effectiveInnerR)/2 : effectiveR*0.58
          });
        }
        startAngle=endAngle;
      });
      const seriesLabel=document.createElementNS(NS,'text');
      seriesLabel.setAttribute('x',cx);
      const seriesLabelY = cy + effectiveR + seriesLabelOffset;
      seriesLabel.setAttribute('y',seriesLabelY);
      seriesLabel.setAttribute('text-anchor','middle');
      seriesLabel.setAttribute('font-size',Math.max(8,fs*0.9));
      seriesLabel.textContent=series.label;
      markFontEditable(seriesLabel,'seriesLabel',`series-${seriesIndex}`);
      (radialLabelLayer || svg).appendChild(seriesLabel);
    });
    const percentLayout = showPerc
      ? computeRadialPercentLabelLayout({
          slices: radialPercentSlices,
          baseFontSize: fs,
          fontScale
        })
      : null;
    if(showPerc && percentLayout){
      percentLayout.placements.forEach(placement => {
        const txt=document.createElementNS(NS,'text');
        txt.setAttribute('x',placement.x);
        txt.setAttribute('y',placement.y);
        txt.setAttribute('text-anchor','middle');
        txt.setAttribute('dominant-baseline','middle');
        txt.setAttribute('font-size',percentLayout.fontSize);
        txt.textContent=placement.text;
        markFontEditable(txt,'annotation',`pie-annotation-${placement.seriesIndex}-${placement.sliceIndex}`);
        (radialLabelLayer || svg).appendChild(txt);
      });
    }
    if(showFrame){
      chartStyle.drawPlotFrame({ svg, margin: { top: 0, right: 0, bottom: 0, left: 0 }, plotW: svgWidth, plotH: svgHeight, stroke: frameStroke, strokeWidth: axisStrokeWidth, sides: ['top','right','bottom','left'] });
    }
    const defaultTitleX = contentLeft + contentWidth/2;
    const defaultTitleY = fs*1.2;
    const titlePos = state.labelPositions?.title;
    
    // Convert relative positions to absolute if needed
    let absoluteTitleX = defaultTitleX;
    let absoluteTitleY = defaultTitleY;
    if (titlePos) {
      if (titlePos.relX !== undefined && titlePos.relY !== undefined) {
        // Use relative positioning
        absoluteTitleX = titlePos.relX * svgWidth;
        absoluteTitleY = titlePos.relY * svgHeight;
      } else if (titlePos.x !== undefined && titlePos.y !== undefined) {
        // Use absolute positioning (backward compatibility)
        absoluteTitleX = titlePos.x;
        absoluteTitleY = titlePos.y;
      }
    }
    
    const title=document.createElementNS(NS,'text');
    title.setAttribute('x', absoluteTitleX);
    title.setAttribute('y', absoluteTitleY);
    title.setAttribute('text-anchor','middle');
    title.setAttribute('font-size',fs);
    title.textContent=state.titleText;
    markFontEditable(title,'graphTitle','graphTitle');
    if(!isResizePreview && global.makeEditable){
      makeEditable(title,txt=>{
        const previous=state.titleText!=null?String(state.titleText):'';
        const nextValue=txt!=null?String(txt):'';
        if(previous===nextValue){
          return;
        }
        applyPieTitleValue(title,nextValue);
        recordPieChange('pie:title',previous,nextValue,value=>applyPieTitleValue(title,value));
      });
    }
    if(!isResizePreview && typeof Shared.enableLabelDrag === 'function'){
      Shared.enableLabelDrag(title, svg, {
        onDragEnd: pos => {
          // Store both absolute and relative positions
          const relX = pos.x / svgWidth;
          const relY = pos.y / svgHeight;
          state.labelPositions.title = { 
            x: pos.x, 
            y: pos.y,
            relX: relX, 
            relY: relY 
          };
          pieDebug('Debug: pie title position saved', { absolute: pos, relative: { relX, relY } });
        }
      });
    }
    svg.appendChild(title);
    if(!isResizePreview){
      ensureGraphViewport(svg, { padding: Math.max(fs, 14), debugLabel: 'pie-graph' });
    }
    if(radialLegendVisible){
      const legendRenderer = radialLegendLayout.renderer;
      let defaultLegendX = contentRight + radialLegendLayout.legendGapPx;
      if(!Number.isFinite(defaultLegendX) || defaultLegendX < 0){
        defaultLegendX = 0;
      }
      const defaultLegendY = contentTop;
      const legendGroup = drawPieLegend(svg, radialLegendLayout, { x: defaultLegendX, y: defaultLegendY }, { width: svgWidth, height: svgHeight });
      if(!legendGroup){
        pieDebug('Debug: pie legend skipped',{ legendVisible: radialLegendVisible, chartType: type, itemCount: labels.length, reason: 'draw-failed' });
      }
    }else{
      pieDebug('Debug: pie legend skipped',{ legendVisible: radialLegendVisible, chartType: type, itemCount: labels.length });
    }
    if(!isResizePreview){
      primePieStatsComputation({ matrix: data, reason: 'draw-radial' });
    }
  }
  pie.draw = draw;
  function ensurePieDomBindings(tabLike){
    if(typeof Shared.workspaceTabs?.ensureActiveDomBindings !== 'function'){
      return false;
    }
    const result = Shared.workspaceTabs.ensureActiveDomBindings({
      componentKey: 'pie',
      tabLike: tabLike || null,
      sentinelSelector: '#pieHot',
      getCurrentRoot: () => state.root || null,
      getCurrentSentinel: () => pie.__domSentinel || null,
      rebind: info => {
        state.root = info?.root || resolvePieRoot(tabLike || null);
        pie.ready = false;
        pie.init();
      }
    });
    return !!result?.rebound;
  }

  function initNotes(){
    const diagramArea = queryPieRoot('#pieGraphPanel .diagram-area');
    const graphPanel = getPieNodeById('pieGraphPanel');
    let stack = queryPieRoot('#pieGraphPanel .pie-plot-stack');
    if(!stack && diagramArea){
      const svgBox = diagramArea.querySelector('.svgbox');
      if(svgBox){
        stack = document.createElement('div');
        stack.className = 'pie-plot-stack';
        const configOptions = diagramArea.querySelector('.config-panel');
        if(configOptions){
          diagramArea.insertBefore(stack, configOptions);
        }else{
          diagramArea.appendChild(stack);
        }
        stack.appendChild(svgBox);
      }
    }
    if(!stack){
      stack = diagramArea || graphPanel;
    }
    if(!stack){
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        pieDebug('Debug: pie notes mount skipped (missing stack)');
      }
      return;
    }
    const misplaced = graphPanel?.querySelector?.('[data-notes-id="pie-notes"]');
    if(misplaced && misplaced.parentElement !== stack){
      misplaced.remove();
    }
    const helper = Shared.notes;
    if(!helper || typeof helper.mountFoldable !== 'function'){
      console.warn('pie notes helper unavailable', { hasSharedNotes: !!helper });
      return;
    }
    if(notesState.control?.root && notesState.control.root.isConnected){
      notesState.control.setValue(notesState.text || '');
      notesState.control.setOpen(!!notesState.open);
      return;
    }
    notesState.control = helper.mountFoldable({
      container: stack,
      id: 'pie-notes',
      title: 'Notes',
      placeholder: 'Write notes about the data being analyzed...',
      richText: true,
      scopeId: 'pie',
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
  pie.init = function init(){
    if (pie.ready) { pieDebug('Debug: Components.pie.init skipped (already ready)'); return; }
    pieDebug('Debug: Components.pie.init');
    state.root = resolvePieRoot();
    // Placeholder to avoid early resizer callbacks failing
    state.scheduleDraw = ()=>{};
    const schedulePieLayoutDraw = () => {
      const phase = state.resizeState?.phase;
      if(phase === 'move' || phase === 'observe'){
        return;
      }
      if(typeof state.scheduleDraw === 'function'){
        state.scheduleDraw();
      }
    };
    const schedulePieResizeDraw = phase => {
      state.resizeState.phase = phase || null;
      state.resizeState.active = phase === 'move';
      if(phase === 'observe'){
        return;
      }
      if(typeof state.scheduleDraw === 'function'){
        state.scheduleDraw();
      }
      if(phase !== 'move'){
        state.resizeState.active = false;
      }
    };
    state.layout = Shared.componentLayout?.createStandardPanels({
      componentName: 'pie',
        selectors: {
          tablePanel: '#pieTablePanel',
          graphPanel: '#pieGraphPanel',
          panelResizer: '#piePanelResizer',
          hotWrapper: '#pieHotWrapper',
          hotContainer: '#pieHot',
          svgBox: () => queryPieRoot('#pieGraphPanel .svgbox'),
          resizeTarget: () => queryPieRoot('#pieGraphPanel .svgbox')
        },
        scheduleDraw: schedulePieLayoutDraw,
        preserveGraphContent: false,
        panelSyncOptions: {
          disableAutoWidthClamp: true,
          lockGraphPanelWidth: false
        },
        resizableBoxOptions: {
          onResize: phase => {
            pieDebug('Debug: pie layout onResize schedule trigger', { phase });
            schedulePieResizeDraw(phase);
          }
        },
        onMinSvgWidth: value => {
        state.minSvgWidth = Math.max(0, Number(value) || 0);
        pieDebug('Debug: pie layout min width update', { value: state.minSvgWidth });
      }
    });
    state.svgBox = state.layout?.elements?.svgBox || state.svgBox;
    state.layout?.setScheduleDraw?.(schedulePieLayoutDraw);
    state.layout?.syncPanels?.();
    ensurePieLegendControlPlacement();
    const scheduleLegendPlacement = typeof Shared.debounceFrame === 'function'
      ? Shared.debounceFrame(()=>ensurePieLegendControlPlacement())
      : null;
    if(scheduleLegendPlacement){
      scheduleLegendPlacement();
    }else if(typeof global.requestAnimationFrame === 'function'){
      global.requestAnimationFrame(()=>ensurePieLegendControlPlacement());
    }
    initHot();
    initControls();
    initNotes();
    primePieStatsComputation({ matrix: getPieStatsDataMatrix(), reason: 'init' });
    const schedulePieBase = Shared.debounceFrame ? Shared.debounceFrame(draw) : draw;
    state.scheduleDraw = Shared.workspaceTabs?.createTabScopedScheduler
      ? Shared.workspaceTabs.createTabScopedScheduler({
          componentKey: 'pie',
          debugLabel: 'pie',
          scheduleRaw: schedulePieBase
        })
      : schedulePieBase;
    ensurePieFontEventListener();
    pieDebug('Debug: pie scheduleDraw configured via Shared.debounceFrame'); // Debug: scheduler setup
    state.layout?.setScheduleDraw?.(schedulePieLayoutDraw);
    if(typeof state.scheduleDraw === 'function'){
      state.scheduleDraw();
    }
    ensureEmptyPayloadTemplate();
    pie.__domSentinel = getPieNodeById('pieHot');
    pie.ready = true;
  };

  pie.ensure = function ensure(){
    if(ensurePieDomBindings()){
      return;
    }
    if (!pie.ready) pie.init();
  };
  pie.activateTab = function activateTab(tab){
    state.root = resolvePieRoot(tab || null);
    if(ensurePieDomBindings(tab)){
      return;
    }
    if(!pie.ready){
      pie.init();
      return;
    }
    if(typeof state.ensureHotForActiveTab === 'function'){
      state.ensureHotForActiveTab();
    }
    pie.__domSentinel = getPieNodeById('pieHot');
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

  pie.captureRenderCache = function captureRenderCache(){
    const plot = getPieNodeById('piePlot');
    const stats = getPieNodeById('pieStatsResults');
    const plotCache = detachChildren(plot);
    const statsCache = detachChildren(stats);
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      pieDebug('Debug: pie render cache captured', {
        plotNodes: plotCache?.count || 0,
        statsNodes: statsCache?.count || 0
      });
    }
    return { plot: plotCache, stats: statsCache };
  };

  pie.restoreRenderCache = function restoreRenderCache(cache){
    if(!cache){ return false; }
    const plot = getPieNodeById('piePlot');
    const stats = getPieNodeById('pieStatsResults');
    const restoredPlot = restoreChildren(plot, cache.plot);
    const restoredStats = restoreChildren(stats, cache.stats);
    const restored = restoredPlot || restoredStats;
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      pieDebug('Debug: pie render cache restored', {
        restored,
        plot: restoredPlot,
        stats: restoredStats
      });
    }
    return restored;
  };
  function resolvePiePreviewSourceSvg(tab){
    const mountedRoot = Shared.workspaceTabs?.getMountedRoot?.(tab || null, 'pie')
      || state.root
      || getPieNodeById('piePage')
      || global.document;
    if(!mountedRoot || typeof mountedRoot.querySelector !== 'function'){
      return null;
    }
    return mountedRoot.querySelector('#piePlot svg#pieSvg')
      || mountedRoot.querySelector('#piePlot svg')
      || mountedRoot.querySelector('.svgbox svg')
      || null;
  }

  pie.getThumbnailSvg = function getThumbnailSvg(tab){
    return resolvePiePreviewSourceSvg(tab);
  };

  pie.getPreviewSvg = function getPreviewSvg(tab){
    return resolvePiePreviewSourceSvg(tab);
  };

  pie.__testHooks = Object.assign({}, pie.__testHooks, {
    computeChiSquare: (observed, expected) => computePieChiSquare(observed, expected),
    computeGofStats: (observed, expected, options) => computePieGofStats(observed, expected, options || {}),
    computeContingencyTest: (table, options) => computePieContingencyTest(table, options || {}),
    updatePieStats: (labels, observed, expected) => updatePieStats(labels, observed, expected),
    computeRadialPercentLabelLayout: options => computeRadialPercentLabelLayout(options || {})
  });

})(window);

