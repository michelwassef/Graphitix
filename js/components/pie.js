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

  function getPieRuntimeOwner(){
    return Shared.componentLifecycle?.createRuntimeOwner?.(pie, { componentKey: 'pie' }) || null;
  }

  function rememberPieOwnedRuntimeRecord(tabLike = null, snapshot = null, meta = {}){
    if(!snapshot || typeof snapshot !== 'object'){
      return null;
    }
    return getPieRuntimeOwner()?.capture(snapshot, {
      ...(meta || {}),
      tab: tabLike || meta?.tab || null,
      componentKey: 'pie',
      reason: meta?.reason || 'pie-owned-runtime-remember'
    }) || snapshot;
  }

  function resolvePieOwnedRuntimeSnapshot(snapshot = null, meta = {}){
    const owner = getPieRuntimeOwner();
    if(!owner){
      return snapshot || null;
    }
    return owner.bind(snapshot || null, {
      ...(meta || {}),
      componentKey: 'pie',
      reason: meta?.reason || 'pie-owned-runtime-resolve'
    });
  }

  function applyExistingPieOwnedRuntimeRecord(tabLike = null, meta = {}){
    const snapshot = getPieRuntimeOwner()?.bind(null, {
      ...(meta || {}),
      tab: tabLike || meta?.tab || null,
      componentKey: 'pie',
      reason: meta?.reason || 'pie-owned-runtime-activate-apply'
    });
    if(!snapshot || typeof pie.applyRuntimeState !== 'function'){
      return false;
    }
    return pie.applyRuntimeState(snapshot, {
      ...(meta || {}),
      reason: meta?.reason || 'pie-owned-runtime-activate-apply'
    });
  }


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
  const PIE_VIEWPORT_EXCLUDE_SELECTOR = '[data-pie-viewport-exclude="1"]';
  function resolvePieBaseViewportSize(svg){
    const attrWidth = Number(svg?.getAttribute?.('data-pie-base-width'));
    const attrHeight = Number(svg?.getAttribute?.('data-pie-base-height'));
    const rawWidth = Number.isFinite(attrWidth) && attrWidth > 0
      ? attrWidth
      : Number(svg?.getAttribute?.('width'));
    const rawHeight = Number.isFinite(attrHeight) && attrHeight > 0
      ? attrHeight
      : Number(svg?.getAttribute?.('height'));
    const width = Number.isFinite(rawWidth) && rawWidth > 0
      ? rawWidth
      : Math.max(1, Number(svg?.clientWidth) || 1);
    const height = Number.isFinite(rawHeight) && rawHeight > 0
      ? rawHeight
      : Math.max(1, Number(svg?.clientHeight) || 1);
    return { width, height };
  }
  function ensurePieViewport(svg, options = {}){
    if(!svg){
      return;
    }
    const fillParent = options.fillParent !== false;
    const excludeSelector = typeof options.excludeSelector === 'string' && options.excludeSelector.trim()
      ? options.excludeSelector.trim()
      : PIE_VIEWPORT_EXCLUDE_SELECTOR;
    const excludedNodes = excludeSelector
      ? Array.from(svg.querySelectorAll(excludeSelector))
      : [];
    const padding = Number.isFinite(Number(options.padding))
      ? Math.max(0, Number(options.padding))
      : 16;
    const debugLabel = typeof options.debugLabel === 'string' && options.debugLabel.trim()
      ? options.debugLabel.trim()
      : 'pie-graph';
    const baseViewport = resolvePieBaseViewportSize(svg);
    const restore = [];
    excludedNodes.forEach(node => {
      if(!node || !node.style){
        return;
      }
      restore.push({
        node,
        hadInlineDisplay: node.style.display
      });
      node.style.display = 'none';
    });
    let bbox = null;
    try{
      if(typeof svg.getBBox === 'function'){
        bbox = svg.getBBox();
      }
    }finally{
      restore.forEach(entry => {
        if(!entry || !entry.node || !entry.node.style){
          return;
        }
        if(entry.hadInlineDisplay){
          entry.node.style.display = entry.hadInlineDisplay;
        }else{
          entry.node.style.removeProperty('display');
        }
      });
    }
    if(!bbox || !Number.isFinite(bbox.x) || !Number.isFinite(bbox.y) || !Number.isFinite(bbox.width) || !Number.isFinite(bbox.height)){
      bbox = { x: 0, y: 0, width: baseViewport.width, height: baseViewport.height };
    }
    let minX = Math.min(0, bbox.x - padding);
    let maxX = Math.max(baseViewport.width, bbox.x + bbox.width + padding);
    let minY = Math.min(0, bbox.y - padding);
    let maxY = Math.max(baseViewport.height, bbox.y + bbox.height + padding);
    let viewW = Math.max(1, maxX - minX);
    let viewH = Math.max(1, maxY - minY);
    const baseRatio = (Number.isFinite(baseViewport.width) && baseViewport.width > 0 && Number.isFinite(baseViewport.height) && baseViewport.height > 0)
      ? (baseViewport.width / baseViewport.height)
      : 1;
    const preserveBaseAspect = options.preserveBaseAspect !== false;
    if(preserveBaseAspect && Number.isFinite(baseRatio) && baseRatio > 0 && Number.isFinite(viewW) && Number.isFinite(viewH) && viewW > 0 && viewH > 0){
      const currentRatio = viewW / viewH;
      if(currentRatio > baseRatio){
        const targetHeight = viewW / baseRatio;
        const extra = Math.max(0, targetHeight - viewH);
        minY -= extra / 2;
        maxY += extra / 2;
      }else if(currentRatio < baseRatio){
        const targetWidth = viewH * baseRatio;
        const extra = Math.max(0, targetWidth - viewW);
        minX -= extra / 2;
        maxX += extra / 2;
      }
      viewW = Math.max(1, maxX - minX);
      viewH = Math.max(1, maxY - minY);
    }
    svg.setAttribute('viewBox', `${minX} ${minY} ${viewW} ${viewH}`);
    if(fillParent){
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
    }
    if(svg.style){
      svg.style.overflow = 'visible';
    }
    const parent = svg.parentElement;
    if(parent && parent.style){
      parent.style.overflow = 'hidden';
    }
    const box = svg.closest?.('.svgbox');
    if(box && box.style){
      box.style.removeProperty('overflow');
    }
    if(Shared.isDebugEnabled?.()){
      pieDebug('Debug: pie viewport locked', {
        debugLabel,
        excludedCount: restore.length,
        selector: excludeSelector,
        baseWidth: baseViewport.width,
        baseHeight: baseViewport.height,
        fillParent,
        preserveBaseAspect,
        viewBox: { minX, minY, viewW, viewH }
      });
    }
  }
  pieDebug('Debug: pie graph viewport helper configured', {
    hasGraphViewport: typeof Shared.graphViewport?.ensure === 'function',
    usesFactory: typeof Shared.graphViewport?.createEnsurer === 'function'
  });

  const PIE_DEFAULT_ROWS = 100;
  const PIE_DEFAULT_COLS = 6;
  const PIE_DATA_VIEW_MAX = 15;
  const DEFAULT_PIE_FONT_SIZE_PT = 12;
  const PIE_RESIZE_PREVIEW_PHASES = new Set(['start', 'move', 'observe']);
  const PIE_RESIZE_FINALIZE_PHASES = new Set(['end', 'reset', 'undo', 'redo', 'programmatic', 'aspect-toggle']);
  const TAU = Math.PI * 2;
  let emptyPayloadTemplate = null;

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
    const session = getActivePieSessionForState();
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
    emptyPayloadTemplate = { type: 'pie', config: {} };
    if(session?.cache){
      session.cache.emptyPayloadTemplate = cloneSimple(emptyPayloadTemplate) || emptyPayloadTemplate;
      session.updatedAt = Date.now();
    }
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
      resultsModel: null,
      reportModel: null,
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
    scheduleActivePieDraw({ reason: `pie-${axis}-tick-interval-change` });
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
    scheduleActivePieDraw({ reason: `pie-${axis}-minor-ticks-change` });
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
    scheduleActivePieDraw({ reason: `pie-${axis}-minor-subdivisions-change` });
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
    scheduleActivePieDraw({ reason: 'pie-axis-stroke-width-change' });
  }

  function getAxisColor(){
    return ensureAxisSettings().color || DEFAULT_AXIS_COLOR;
  }

  function updateAxisColor(value){
    const settings = ensureAxisSettings();
    settings.color = typeof value === 'string' && value.trim() ? value : DEFAULT_AXIS_COLOR;
    pieDebug('Debug: pie axis color updated',{ color: settings.color });
    scheduleActivePieDraw({ reason: 'pie-axis-color-change' });
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
    xTickRotateVertical: false,
    bottomViewportExtensionPx: 0,
    viewportExtensionResizeInProgress: false,
    lastViewportExtensionRedrawSignature: null,
    applyingPayload: false,
    lockRatioEnforcePrevious: null,
    resizeState: {
      active: false,
      phase: null,
      dragging: false,
      observeMuteUntil: 0
    },
    controls: null
  };


  const pieSessionsByTabId = new Map();
  let activePieSession = null;

  function normalizePieSessionTabId(tabLike = null, meta = {}){
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
      || Shared.workspaceTabs?.getActiveSessionInfo?.('pie')?.tabId
      || pie.__boundTabId
      || '';
    return String(resolved || '').trim();
  }

  function clonePieStatsConfigForSession(config){
    if(!config || typeof config !== 'object'){
      return createDefaultPieStatsConfig();
    }
    const cloned = cloneSimple(config) || {};
    if(config.selectedCols instanceof Set){
      const selected = Array.from(config.selectedCols);
      cloned.selectedCols = selected;
      cloned.selectedColumns = selected;
    }else if(Array.isArray(config.selectedColumns) && !Array.isArray(cloned.selectedCols)){
      cloned.selectedCols = config.selectedColumns.slice();
    }
    if(config.customPairs instanceof Set){
      cloned.customPairs = Array.from(config.customPairs);
    }
    return cloned;
  }

  function createDefaultPieDurableState(source = {}){
    const src = source && typeof source === 'object' ? source : {};
    return {
      titleText: typeof src.titleText === 'string' ? src.titleText : 'Proportion graph',
      legendWidth: Number.isFinite(Number(src.legendWidth)) ? Number(src.legendWidth) : 120,
      colors: cloneSimple(src.colors) || {},
      minSvgWidth: Number.isFinite(Number(src.minSvgWidth)) ? Number(src.minSvgWidth) : 0,
      axisSettings: cloneSimple(src.axisSettings || src.axis) || createDefaultAxisSettings(),
      labelPositions: cloneSimple(src.labelPositions) || { title: null, legend: null },
      columnSignature: src.columnSignature || null,
      statsDataModel: cloneSimple(src.statsDataModel) || null,
      statsConfig: clonePieStatsConfigForSession(src.statsConfig),
      colorSignature: src.colorSignature || null,
      xTickRotateVertical: src.xTickRotateVertical === true,
      bottomViewportExtensionPx: Number.isFinite(Number(src.bottomViewportExtensionPx)) ? Math.max(0, Number(src.bottomViewportExtensionPx)) : 0,
      lockRatioEnforcePrevious: (src.lockRatioEnforcePrevious === true || src.lockRatioEnforcePrevious === false)
        ? !!src.lockRatioEnforcePrevious
        : null,
      resizeState: cloneSimple(src.resizeState) || {
        active: false,
        phase: null,
        dragging: false,
        observeMuteUntil: 0
      },
      controls: normalizePieRuntimeControls(src.controls || src.runtimeControls || {}),
      drawPending: src.drawPending === true
    };
  }

  function createDefaultPieResultsState(source = {}){
    const src = source && typeof source === 'object' ? source : {};
    return {
      statsDataModel: cloneSimple(src.statsDataModel) || null,
      statsConfig: src.statsConfig ? clonePieStatsConfigForSession(src.statsConfig) : null,
      statsSummaryTabIdCounter: Number(src.statsSummaryTabIdCounter) || 0
    };
  }

  function createDefaultPieRefs(root = null){
    return {
      root: root || null,
      tablePanel: null,
      graphPanel: null,
      panelResizer: null,
      svgBox: null,
      hotWrapper: null,
      hotContainer: null,
      plot: null,
      statsResults: null,
      chartType: null,
      showPercents: null,
      showFrame: null,
      showLegend: null,
      startAngle: null,
      borderColor: null,
      borderWidth: null,
      fontSize: null,
      fontSizeVal: null,
      legendControl: null,
      notesControl: null,
      importButton: null,
      fileInput: null,
      openButton: null,
      saveButton: null,
      saveAsButton: null,
      graphFileInput: null
    };
  }

  function createPieSession({ tabId, root = null, initialState = null } = {}){
    const normalizedTabId = String(tabId || '').trim();
    const source = initialState && typeof initialState === 'object' ? initialState : {};
    const durableSource = source.state && typeof source.state === 'object' ? source.state : source;
    return {
      componentKey: 'pie',
      tabId: normalizedTabId,
      root: root || null,
      state: createDefaultPieDurableState(durableSource),
      results: createDefaultPieResultsState({
        statsDataModel: durableSource.statsDataModel || source.statsDataModel,
        statsConfig: durableSource.statsConfig || source.statsConfig,
        statsSummaryTabIdCounter: source.statsSummaryTabIdCounter
      }),
      refs: createDefaultPieRefs(root || null),
      cache: {
        emptyPayloadTemplate: cloneSimple(emptyPayloadTemplate) || null
      },
      listeners: new Map(),
      timers: {
        scheduleDraw: null,
        pendingDrawOptions: null
      },
      workers: new Map(),
      managers: {
        hot: null,
        dataViews: null,
        layout: null,
        fileHandle: null
      },
      notes: createDefaultPieNotesState(source.notes || durableSource.notes || {}),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  function createDefaultPieNotesState(source = {}){
    const src = source && typeof source === 'object' ? source : {};
    return {
      text: src.text == null ? '' : String(src.text),
      open: !!src.open
    };
  }

  function ensurePieSessionOwnershipShape(session){
    if(!session || typeof session !== 'object'){
      return null;
    }
    session.componentKey = 'pie';
    session.tabId = String(session.tabId || '').trim();
    session.root = session.root || null;
    session.state = createDefaultPieDurableState(session.state || {});
    session.results = createDefaultPieResultsState(session.results || {
      statsDataModel: session.state.statsDataModel,
      statsConfig: session.state.statsConfig
    });
    session.refs = session.refs && typeof session.refs === 'object' ? session.refs : createDefaultPieRefs(session.root || null);
    session.refs.root = session.refs.root || session.root || null;
    session.cache = session.cache && typeof session.cache === 'object' ? session.cache : {};
    if(!Object.prototype.hasOwnProperty.call(session.cache, 'emptyPayloadTemplate')){ session.cache.emptyPayloadTemplate = null; }
    session.listeners = session.listeners instanceof Map ? session.listeners : new Map();
    session.timers = session.timers && typeof session.timers === 'object' ? session.timers : {};
    if(!Object.prototype.hasOwnProperty.call(session.timers, 'scheduleDraw')){ session.timers.scheduleDraw = null; }
    if(!Object.prototype.hasOwnProperty.call(session.timers, 'pendingDrawOptions')){ session.timers.pendingDrawOptions = null; }
    session.workers = session.workers instanceof Map ? session.workers : new Map();
    session.managers = session.managers && typeof session.managers === 'object' ? session.managers : {};
    if(!Object.prototype.hasOwnProperty.call(session.managers, 'hot')){ session.managers.hot = null; }
    if(!Object.prototype.hasOwnProperty.call(session.managers, 'dataViews')){ session.managers.dataViews = null; }
    if(!Object.prototype.hasOwnProperty.call(session.managers, 'layout')){ session.managers.layout = null; }
    if(!Object.prototype.hasOwnProperty.call(session.managers, 'fileHandle')){ session.managers.fileHandle = null; }
    session.notes = createDefaultPieNotesState(session.notes || {});
    return session;
  }

  function getPieSession(tabLike = null, meta = {}, options = {}){
    const tabId = normalizePieSessionTabId(tabLike, meta);
    if(!tabId){
      return null;
    }
    let session = pieSessionsByTabId.get(tabId) || null;
    if(!session && options.create !== false){
      session = createPieSession({
        tabId,
        root: meta?.root || resolvePieRoot(tabLike || tabId || null) || null,
        initialState: options.initialState || null
      });
      pieSessionsByTabId.set(tabId, session);
    }
    return ensurePieSessionOwnershipShape(session);
  }

  function getActivePieSessionForState(){
    if(activePieSession && (!pie.__boundTabId || String(activePieSession.tabId || '') === String(pie.__boundTabId || ''))){
      return ensurePieSessionOwnershipShape(activePieSession);
    }
    const tabId = pie.__boundTabId || normalizePieSessionTabId(null, {}) || null;
    return tabId ? getPieSession(tabId, { tabId, reason: 'active-pie-session' }, { create: true }) : null;
  }

  function getPieTabIdFromTarget(target = null){
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

  function getPieSessionForEvent(event = null, meta = {}, options = {}){
    const target = event?.currentTarget || event?.target || meta?.target || null;
    const tabId = normalizePieSessionTabId(getPieTabIdFromTarget(target) || meta?.tabId || null, meta || {});
    return tabId
      ? getPieSession(tabId, { ...(meta || {}), tabId, reason: meta?.reason || 'pie-event-owner' }, { create: options.create !== false })
      : getActivePieSessionForState();
  }

  function runPieControlOwner(event, reason, callback){
    const session = getPieSessionForEvent(event, { reason }, { create: true });
    if(session?.tabId && !isPieSessionActiveOrActivating(session)){
      pieDebug('Debug: pie control callback skipped for inactive owner', {
        tabId: session.tabId || null,
        activeTabId: pie.__boundTabId || activePieSession?.tabId || null,
        reason: reason || 'pie-control-owner'
      });
      return undefined;
    }
    return typeof callback === 'function' ? callback(session) : undefined;
  }

  function getPieSessionForDrawOptions(options = {}, meta = {}){
    const source = options && typeof options === 'object' ? options : {};
    const tabId = source.tabId || source.tab?.id || meta?.tabId || pie.__boundTabId || null;
    return tabId
      ? getPieSession(tabId, {
          ...(meta || {}),
          tabId,
          reason: meta?.reason || source.reason || 'pie-draw-session'
        }, { create: meta?.create !== false })
      : getActivePieSessionForState();
  }

  function getPieHotOwnerTabId(hotInstance = null){
    return String(
      hotInstance?.__pieTabId
      || hotInstance?.__workspaceTabId
      || hotInstance?.__graphitixTabId
      || hotInstance?.__hotWorkspaceTabId
      || ''
    ).trim();
  }

  function getPieSessionForHot(hotInstance = null, meta = {}, options = {}){
    const tabId = getPieHotOwnerTabId(hotInstance);
    if(tabId){
      return getPieSession(tabId, { ...(meta || {}), tabId }, { create: options.create === true });
    }
    return options.fallbackActive === false ? null : getActivePieSessionForState();
  }

  function pieDataViewsManagerBelongsToSession(manager = null, session = null){
    const shaped = ensurePieSessionOwnershipShape(session);
    if(!manager || !shaped?.tabId){ return false; }
    const ownerTabId = String(
      manager.__pieTabId
      || manager.__workspaceTabId
      || manager.__graphitixTabId
      || manager.__ownerTabId
      || ''
    ).trim();
    return !!ownerTabId && ownerTabId === String(shaped.tabId);
  }

  function isPieSessionActive(session = null){
    const shaped = ensurePieSessionOwnershipShape(session);
    if(!shaped?.tabId){
      return false;
    }
    return String(shaped.tabId) === String(pie.__boundTabId || activePieSession?.tabId || '');
  }

  function isPieSessionActiveOrActivating(session = null){
    const shaped = ensurePieSessionOwnershipShape(session);
    if(!shaped?.tabId){ return false; }
    const workspaceActiveTabId = global.Main?.session?.workspaceState?.activeTabId || null;
    return isPieSessionActive(shaped)
      || (workspaceActiveTabId && String(shaped.tabId) === String(workspaceActiveTabId));
  }

  function schedulePieDrawForSession(session = null, options = {}){
    const shaped = ensurePieSessionOwnershipShape(session || getActivePieSessionForState());
    if(!shaped){
      return false;
    }
    const sourceOptions = options && typeof options === 'object' ? options : {};
    const scheduleOptions = Shared.componentLifecycle?.sanitizeDrawOptions
      ? Shared.componentLifecycle.sanitizeDrawOptions(sourceOptions, { tabId: shaped.tabId || null, reason: 'pie-session-draw' })
      : { ...sourceOptions, tabId: shaped.tabId || sourceOptions.tabId || undefined, reason: sourceOptions.reason || 'pie-session-draw' };
    if(shaped.timers){
      shaped.timers.pendingDrawOptions = scheduleOptions;
    }
    if(!isPieSessionActiveOrActivating(shaped)){
      shaped.state.drawPending = true;
      shaped.updatedAt = Date.now();
      return false;
    }
    const scheduler = shaped.timers?.scheduleDraw || state.scheduleDraw;
    if(typeof scheduler !== 'function'){
      return false;
    }
    shaped.timers.scheduleDraw = scheduler;
    shaped.timers.pendingDrawOptions = null;
    shaped.state.drawPending = false;
    shaped.updatedAt = Date.now();
    scheduler(scheduleOptions);
    return true;
  }

  function scheduleActivePieDraw(options = {}){
    return schedulePieDrawForSession(getActivePieSessionForState(), options);
  }


  function normalizePieLabelPositions(value){
    return cloneSimple(value) || { title: null, legend: null };
  }

  function patchPieVisualState(session = null, patch = {}, meta = {}){
    const owner = ensurePieSessionOwnershipShape(session || getActivePieSessionForState());
    const hasTitle = Object.prototype.hasOwnProperty.call(patch || {}, 'titleText');
    const hasPositions = Object.prototype.hasOwnProperty.call(patch || {}, 'labelPositions');
    const nextTitle = hasTitle ? String(patch.titleText == null ? '' : patch.titleText) : state.titleText;
    const nextPositions = hasPositions ? normalizePieLabelPositions(patch.labelPositions) : normalizePieLabelPositions(state.labelPositions);
    if(owner?.state){
      if(hasTitle){ owner.state.titleText = nextTitle; }
      if(hasPositions){ owner.state.labelPositions = nextPositions; }
      owner.updatedAt = Date.now();
      pieDebug('Debug: pie visual state patched to owner session', {
        tabId: owner.tabId || null,
        reason: meta?.reason || null,
        title: hasTitle,
        labelPositions: hasPositions
      });
    }
    if(!owner || isPieSessionActiveOrActivating(owner)){
      if(hasTitle){ state.titleText = nextTitle; }
      if(hasPositions){ state.labelPositions = nextPositions; }
    }
    return { titleText: nextTitle, labelPositions: nextPositions };
  }

  function patchPieLabelPosition(session = null, key, value, meta = {}){
    const nextPositions = normalizePieLabelPositions({
      ...normalizePieLabelPositions(state.labelPositions),
      [key]: value || null
    });
    return patchPieVisualState(session, { labelPositions: nextPositions }, meta);
  }


  function getPieDeactivationTabId(tab, meta = {}){
    return (tab && typeof tab === 'object' ? tab.id : tab) || meta?.tabId || null;
  }

  function getPieDeactivationSession(tab, meta = {}){
    const tabId = getPieDeactivationTabId(tab, meta);
    const activeSession = getActivePieSessionForState();
    const activeTabId = pie.__boundTabId || activeSession?.tabId || null;
    if(tabId && activeTabId && String(tabId) !== String(activeTabId)){
      return getPieSession(tabId, { ...(meta || {}), tabId, reason: meta?.reason || 'pie-deactivate-target-session' }, { create: false });
    }
    return activeSession || (tabId ? getPieSession(tabId, { ...(meta || {}), tabId, reason: meta?.reason || 'pie-deactivate-active-session' }, { create: false }) : null);
  }

  function resolvePieTabIdFromNode(node){
    let cursor = node && typeof node.closest === 'function'
      ? node.closest('[data-workspace-tab-id], [data-tab-id], [data-graphitix-tab-id]')
      : null;
    if(!cursor && node && typeof node.parentElement !== 'undefined'){
      cursor = node.parentElement;
    }
    while(cursor){
      const tabId = cursor.dataset?.workspaceTabId
        || cursor.dataset?.tabId
        || cursor.dataset?.graphitixTabId
        || cursor.getAttribute?.('data-workspace-tab-id')
        || cursor.getAttribute?.('data-tab-id')
        || cursor.getAttribute?.('data-graphitix-tab-id')
        || null;
      if(tabId){
        return String(tabId);
      }
      cursor = cursor.parentElement || null;
    }
    return null;
  }

  function bindPieStatsEventTarget(target, reason){
    const tabId = resolvePieTabIdFromNode(target);
    if(!tabId){
      return null;
    }
    pie.__boundTabId = tabId;
    state.root = resolvePieRoot(tabId) || state.root || null;
    return bindPieSessionForTab(tabId, {
      tabId,
      root: state.root || null,
      reason: reason || 'pie-stats-event'
    }, { apply: true });
  }

  function clearPieResizeSessionState(session = null){
    if(!session){ return; }
    const resizeState = cloneSimple(session.state?.resizeState) || {};
    resizeState.active = false;
    resizeState.phase = null;
    resizeState.dragging = false;
    session.state.resizeState = resizeState;
    session.updatedAt = Date.now();
  }

  function capturePieSessionForDeactivation(tab, meta = {}){
    const tabId = getPieDeactivationTabId(tab, meta);
    const activeSession = getActivePieSessionForState();
    const activeTabId = pie.__boundTabId || activeSession?.tabId || null;
    const targetSession = getPieDeactivationSession(tab, meta);
    if(tabId && activeTabId && String(tabId) !== String(activeTabId)){
      clearPieResizeSessionState(targetSession);
      pieDebug('Debug: pie inactive-tab deactivate skipped active mirror capture', {
        tabId,
        activeTabId,
        reason: meta?.reason || 'pie-deactivate'
      });
      return targetSession;
    }
    if(targetSession){
      capturePieSessionStateFromActive(targetSession, {
        reason: meta?.reason || 'pie-deactivate',
        captureStats: true
      });
      clearPieResizeSessionState(targetSession);
    }
    return targetSession;
  }

  function syncPieSessionRefsFromActive(session = null){
    const shaped = ensurePieSessionOwnershipShape(session || activePieSession || getActivePieSessionForState());
    if(!shaped){ return null; }
    if(shaped.tabId && !isPieSessionActiveOrActivating(shaped)){
      return shaped;
    }
    shaped.root = state.root || shaped.root || null;
    shaped.refs = Object.assign(createDefaultPieRefs(shaped.root || null), shaped.refs || {}, {
      root: state.root || shaped.root || null,
      tablePanel: state.layout?.elements?.tablePanel || queryPieRoot('#pieTablePanel'),
      graphPanel: state.layout?.elements?.graphPanel || queryPieRoot('#pieGraphPanel'),
      panelResizer: state.layout?.elements?.panelResizer || queryPieRoot('#piePanelResizer'),
      svgBox: state.svgBox || state.layout?.elements?.svgBox || queryPieRoot('#pieGraphPanel .svgbox'),
      hotWrapper: state.layout?.elements?.hotWrapper || queryPieRoot('#pieHotWrapper'),
      hotContainer: state.layout?.elements?.hotContainer || queryPieRoot('#pieHot'),
      plot: queryPieRoot('#piePlot'),
      statsResults: queryPieRoot('#pieStatsResults'),
      chartType: queryPieRoot('#pieChartType'),
      showPercents: queryPieRoot('#pieShowPercents'),
      showFrame: queryPieRoot('#pieShowFrame'),
      showLegend: queryPieRoot('#pieShowLegend'),
      startAngle: queryPieRoot('#pieStartAngle'),
      borderColor: queryPieRoot('#pieBorderColor'),
      borderWidth: queryPieRoot('#pieBorderWidth'),
      fontSize: queryPieRoot('#pieFontSize'),
      fontSizeVal: queryPieRoot('#pieFontSizeVal'),
      legendControl: pieLegendControl || null,
      notesControl: canUsePieNotesControl(notesState.control) ? notesState.control : null,
      importButton: queryPieRoot('#pieImport'),
      fileInput: queryPieRoot('#pieFile'),
      openButton: queryPieRoot('#openPieGraph'),
      saveButton: queryPieRoot('#savePieGraph'),
      saveAsButton: queryPieRoot('#saveAsPie'),
      graphFileInput: queryPieRoot('#pieGraphFile')
    });
    shaped.updatedAt = Date.now();
    return shaped;
  }

  function syncPieSessionManagersFromActive(session = null){
    const shaped = ensurePieSessionOwnershipShape(session || activePieSession || getActivePieSessionForState());
    if(!shaped){ return null; }
    const sessionIsActive = !shaped.tabId || isPieSessionActiveOrActivating(shaped);
    const stateHotTabId = String(
      state.hot?.__pieTabId
      || state.hot?.__workspaceTabId
      || state.hot?.__graphitixTabId
      || state.hot?.__hotWorkspaceTabId
      || ''
    ).trim();
    const hotBelongsToSession = !!state.hot && (!shaped.tabId || (stateHotTabId && stateHotTabId === shaped.tabId));
    if(hotBelongsToSession){
      shaped.managers.hot = state.hot;
      const manager = state.hot?.__pieDataViewsManager || null;
      shaped.managers.dataViews = pieDataViewsManagerBelongsToSession(manager, shaped) ? manager : shaped.managers.dataViews || null;
    }
    if(sessionIsActive){
      shaped.managers.layout = state.layout || shaped.managers.layout || null;
      shaped.managers.fileHandle = state.fileHandle || shaped.managers.fileHandle || null;
      shaped.timers.scheduleDraw = state.scheduleDraw || shaped.timers.scheduleDraw || null;
    }
    shaped.cache.emptyPayloadTemplate = cloneSimple(emptyPayloadTemplate) || shaped.cache.emptyPayloadTemplate || null;
    shaped.updatedAt = Date.now();
    return shaped;
  }

  function canUsePieNotesControl(noteControl){
    if(!noteControl){ return false; }
    const root = state.root || resolvePieRoot(pie.__boundTabId || null);
    const controlRoot = noteControl.root || null;
    if(controlRoot){
      return !!controlRoot.isConnected && (!root || root === controlRoot || root.contains?.(controlRoot));
    }
    return !!root && (!noteControl.element || root.contains?.(noteControl.element));
  }

  function setPieFileHandleForSession(handle, session = null){
    const owner = ensurePieSessionOwnershipShape(session || getActivePieSessionForState());
    if(owner?.managers){
      owner.managers.fileHandle = handle || null;
      owner.updatedAt = Date.now();
    }
    if(!owner || isPieSessionActiveOrActivating(owner)){
      state.fileHandle = handle || null;
    }
    return handle || null;
  }

  function setPieFileNameForSession(name, session = null){
    const nextName = name || 'pie.graph';
    const owner = ensurePieSessionOwnershipShape(session || getActivePieSessionForState());
    if(owner?.state){
      owner.state.fileName = nextName;
      owner.updatedAt = Date.now();
    }
    if(!owner || isPieSessionActiveOrActivating(owner)){
      state.fileName = nextName;
    }
    return nextName;
  }

  function capturePieNotesMirror(){
    const noteControl = canUsePieNotesControl(notesState.control) ? notesState.control : null;
    const text = noteControl && typeof noteControl.getValue === 'function'
      ? noteControl.getValue()
      : (notesState.text || '');
    const open = noteControl && typeof noteControl.isOpen === 'function'
      ? noteControl.isOpen()
      : !!notesState.open;
    notesState.text = text == null ? '' : String(text);
    notesState.open = !!open;
    return createDefaultPieNotesState(notesState);
  }

  function capturePieSessionStateFromActive(session = null, meta = {}){
    const shaped = ensurePieSessionOwnershipShape(session || getActivePieSessionForState());
    if(!shaped){ return null; }
    if(shaped.tabId && !isPieSessionActiveOrActivating(shaped)){
      shaped.updatedAt = Date.now();
      return shaped;
    }
    if(meta.syncControls !== false){
      syncPieRuntimeControlsFromDom();
    }
    if(meta.captureStats !== false && typeof exportPieStatsConfig === 'function'){
      state.statsConfig = exportPieStatsConfig();
    }
    shaped.state = createDefaultPieDurableState({
      titleText: state.titleText,
      legendWidth: state.legendWidth,
      colors: state.colors,
      minSvgWidth: state.minSvgWidth,
      axisSettings: state.axisSettings,
      labelPositions: state.labelPositions,
      columnSignature: state.columnSignature,
      statsDataModel: state.statsDataModel,
      statsConfig: state.statsConfig,
      colorSignature: state.colorSignature,
      xTickRotateVertical: state.xTickRotateVertical,
      bottomViewportExtensionPx: state.bottomViewportExtensionPx,
      lockRatioEnforcePrevious: state.lockRatioEnforcePrevious,
      resizeState: state.resizeState,
      controls: state.controls,
      drawPending: state.drawPending === true
    });
    shaped.results = createDefaultPieResultsState({
      statsDataModel: state.statsDataModel,
      statsConfig: state.statsConfig,
      statsSummaryTabIdCounter: typeof pieStatsSummaryTabIdCounter === 'number' ? pieStatsSummaryTabIdCounter : 0
    });
    shaped.notes = capturePieNotesMirror();
    syncPieSessionRefsFromActive(shaped);
    syncPieSessionManagersFromActive(shaped);
    shaped.updatedAt = Date.now();
    return shaped;
  }

  function applyPieSessionStateToActive(session = null, options = {}){
    const shaped = ensurePieSessionOwnershipShape(session || getActivePieSessionForState());
    if(!shaped){ return false; }
    const durable = createDefaultPieDurableState(shaped.state || {});
    const savedStatsConfig = clonePieStatsConfigForSession(shaped.results?.statsConfig || durable.statsConfig);
    state.titleText = durable.titleText;
    state.legendWidth = durable.legendWidth;
    state.colors = cloneSimple(durable.colors) || {};
    state.minSvgWidth = durable.minSvgWidth;
    state.axisSettings = cloneSimple(durable.axisSettings) || createDefaultAxisSettings();
    state.labelPositions = cloneSimple(durable.labelPositions) || { title: null, legend: null };
    state.columnSignature = durable.columnSignature || null;
    state.statsDataModel = cloneSimple(shaped.results?.statsDataModel || durable.statsDataModel) || null;
    state.statsConfig = createDefaultPieStatsConfig();
    state.colorSignature = durable.colorSignature || null;
    state.xTickRotateVertical = durable.xTickRotateVertical === true;
    state.bottomViewportExtensionPx = Number.isFinite(Number(durable.bottomViewportExtensionPx)) ? Math.max(0, Number(durable.bottomViewportExtensionPx)) : 0;
    state.lockRatioEnforcePrevious = durable.lockRatioEnforcePrevious;
    pieLockRatioEnforcePrevious = state.lockRatioEnforcePrevious;
    state.viewportExtensionResizeInProgress = false;
    state.lastViewportExtensionRedrawSignature = null;
    state.resizeState = cloneSimple(durable.resizeState) || state.resizeState;
    normalizePieResizeState();
    state.controls = normalizePieRuntimeControls(durable.controls || {});
    state.drawPending = durable.drawPending === true;
    state.fileHandle = shaped.managers.fileHandle || state.fileHandle || null;
    if(!state.root && shaped.root){
      state.root = shaped.root;
    }
    applyPieStatsConfig(savedStatsConfig);
    try{
      const dataModel = state.statsDataModel || buildPieStatsDataModel(getPieStatsDataMatrix());
      state.statsDataModel = dataModel;
      ensurePieStatsSelections(dataModel);
      renderPieStatsControls(dataModel, { force: true, reason: 'session-state-apply' });
    }catch(err){
      console.debug('Debug: pie stats controls restore after session apply failed', {
        message: err?.message || String(err)
      });
    }
    notesState.text = shaped.notes.text || '';
    notesState.open = !!shaped.notes.open;
    if(canUsePieNotesControl(notesState.control)){
      notesState.control.setValue(notesState.text);
      notesState.control.setOpen(notesState.open);
    }
    if(Number.isFinite(Number(shaped.results?.statsSummaryTabIdCounter))){
      pieStatsSummaryTabIdCounter = Math.max(Number(pieStatsSummaryTabIdCounter) || 0, Number(shaped.results.statsSummaryTabIdCounter));
    }
    if(options.restoreEmptyPayload !== false && shaped.cache?.emptyPayloadTemplate){
      emptyPayloadTemplate = cloneSimple(shaped.cache.emptyPayloadTemplate) || emptyPayloadTemplate;
    }
    shaped.updatedAt = Date.now();
    return true;
  }

  function bindPieSessionForTab(tabLike = null, meta = {}, options = {}){
    const tabId = normalizePieSessionTabId(tabLike, meta);
    if(!tabId){ return null; }
    if(activePieSession && activePieSession.tabId && activePieSession.tabId !== tabId){
      capturePieSessionStateFromActive(activePieSession, {
        reason: meta?.reason || 'pie-session-switch-capture',
        captureStats: true
      });
    }
    const session = getPieSession(tabId, { ...(meta || {}), tabId, reason: meta?.reason || 'pie-session-bind' }, { create: true });
    if(!session){ return null; }
    const root = meta?.root || resolvePieRoot(tabLike || tabId || null) || session.root || null;
    session.root = root || session.root || null;
    session.refs.root = root || session.refs.root || null;
    activePieSession = session;
    pie.__pieSessionTabId = session.tabId;
    if(!pie.__boundTabId){
      pie.__boundTabId = session.tabId;
    }
    if(options.apply === true){
      applyPieSessionStateToActive(session, options);
    }
    syncPieSessionRefsFromActive(session);
    syncPieSessionManagersFromActive(session);
    return session;
  }

  function setPieSessionStateFromRuntimeRecord(record, meta = {}){
    if(!record || typeof record !== 'object'){
      return null;
    }
    const session = getPieSession(meta?.tab || meta?.tabId || pie.__boundTabId || null, meta, { create: true });
    if(!session){
      return null;
    }
    const source = record.state && typeof record.state === 'object' ? record.state : record;
    session.state = createDefaultPieDurableState(source);
    session.results = createDefaultPieResultsState({
      statsDataModel: source.statsDataModel,
      statsConfig: source.statsConfig,
      statsSummaryTabIdCounter: record.statsSummaryTabIdCounter
    });
    session.notes = createDefaultPieNotesState(record.notes || source.notes || {});
    if(record.emptyPayloadTemplate){
      session.cache.emptyPayloadTemplate = cloneSimple(record.emptyPayloadTemplate) || session.cache.emptyPayloadTemplate || null;
    }
    session.updatedAt = Date.now();
    return session;
  }

  function resolvePieRoot(tabLike){
    return Shared.workspaceTabs?.resolveComponentRoot?.({
      tabLike: tabLike || null,
      componentKey: 'pie',
      currentRoot: state.root,
      staticRootId: 'piePage'
    }) || null;
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

  function createDefaultPieRuntimeControls(){
    return {
      chartType: 'pie',
      showPercents: true,
      showFrame: false,
      showLegend: true,
      startAngle: '0',
      borderColor: '#ffffff',
      borderWidth: '1',
      fontSize: String(DEFAULT_PIE_FONT_SIZE_PT)
    };
  }

  function normalizePieRuntimeControls(source = {}){
    const defaults = createDefaultPieRuntimeControls();
    const src = source && typeof source === 'object' ? source : {};
    const chartType = String(src.chartType || defaults.chartType).trim().toLowerCase();
    return {
      chartType: chartType === 'stacked'
        ? 'stacked'
        : (chartType === 'donut' || chartType === 'doughnut' ? 'donut' : 'pie'),
      showPercents: Object.prototype.hasOwnProperty.call(src, 'showPercents') ? !!src.showPercents : defaults.showPercents,
      showFrame: Object.prototype.hasOwnProperty.call(src, 'showFrame') ? !!src.showFrame : defaults.showFrame,
      showLegend: Object.prototype.hasOwnProperty.call(src, 'showLegend') ? src.showLegend !== false : defaults.showLegend,
      startAngle: src.startAngle != null ? String(src.startAngle) : defaults.startAngle,
      borderColor: src.borderColor != null ? String(src.borderColor) : defaults.borderColor,
      borderWidth: src.borderWidth != null ? String(src.borderWidth) : defaults.borderWidth,
      fontSize: src.fontSize != null ? String(src.fontSize) : defaults.fontSize
    };
  }

  function syncPieRuntimeControlsFromDom(session = null){
    state.controls = normalizePieRuntimeControls({
      ...(state.controls || {}),
      chartType: getPieNodeById('pieChartType')?.value,
      showPercents: getPieNodeById('pieShowPercents') ? !!getPieNodeById('pieShowPercents').checked : state.controls?.showPercents,
      showFrame: getPieNodeById('pieShowFrame') ? !!getPieNodeById('pieShowFrame').checked : state.controls?.showFrame,
      showLegend: pieShowLegendInput ? !!pieShowLegendInput.checked : state.controls?.showLegend,
      startAngle: getPieNodeById('pieStartAngle')?.value,
      borderColor: getPieNodeById('pieBorderColor')?.value,
      borderWidth: getPieNodeById('pieBorderWidth')?.value,
      fontSize: getPieNodeById('pieFontSize')?.value
    });
    const ownerSession = ensurePieSessionOwnershipShape(session || getActivePieSessionForState());
    if(ownerSession?.state){
      ownerSession.state.controls = cloneSimple(state.controls) || createDefaultPieRuntimeControls();
      ownerSession.updatedAt = Date.now();
    }
    return state.controls;
  }

  function resolvePieDrawableFrame(plotEl){
    const plot = plotEl || getPieNodeById('piePlot');
    const svgBox = state.svgBox
      || state.layout?.elements?.svgBox
      || plot?.closest?.('.svgbox')
      || queryPieRoot('#pieGraphPanel .svgbox')
      || null;
    const frame = Shared.componentLayout?.resolveDrawableFrame?.({
      componentName: 'pie',
      plot,
      svgBox,
      graphPanel: state.graphPanel || state.layout?.elements?.graphPanel || queryPieRoot('#pieGraphPanel')
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

  function schedulePieViewRefresh(reason, extraOptions){
    const options = (extraOptions && typeof extraOptions === 'object') ? extraOptions : {};
    const nextReason = reason || options.reason || 'pie-view-refresh';
    const ownerTabId = normalizePieSessionTabId(options.tabId || options.workspaceTabId || options.tab?.id || pie.__boundTabId || null, {});
    const ownerSession = ownerTabId
      ? getPieSession(ownerTabId, { tabId: ownerTabId, reason: nextReason }, { create: false })
      : getActivePieSessionForState();
    const activeTabId = normalizePieSessionTabId(pie.__boundTabId || null, {});
    if(!ownerTabId || ownerTabId === activeTabId){
      syncPieRuntimeControlsFromDom(ownerSession || getActivePieSessionForState());
      capturePieSessionStateFromActive(ownerSession || getActivePieSessionForState(), {
        reason: nextReason,
        captureStats: false
      });
    }
    // Mirror line.js (scheduleLineViewRefresh) / scatter.js (scheduleScatterViewRefresh):
    // derive interaction intent from the reason and propagate userInitiated/forceDraw so
    // user-driven refreshes (resize, style edits) are never dropped by the
    // post-render-cache-restore draw suppression that guards the tab-scoped scheduler.
    const normalizedReason = String(nextReason).toLowerCase();
    const passiveReason = normalizedReason.includes('restore')
      || normalizedReason.includes('payload')
      || normalizedReason.includes('programmatic')
      || normalizedReason.includes('auto')
      || normalizedReason.includes('init')
      || normalizedReason.includes('observer')
      || normalizedReason.includes('layout')
      || normalizedReason.includes('sync');
    const lifecycleMeta = {
      tabId: ownerTabId || pie.__boundTabId || null,
      reason: nextReason,
      source: 'pie-view-refresh',
      forceDraw: options.force === true || options.forceDraw === true,
      userInitiated: options.userInitiated === true || (options.userInitiated !== false && !passiveReason)
    };
    if(Shared.componentLifecycle?.shouldSuppressDraw?.('pie', lifecycleMeta)){
      pieDebug('Debug: pie view refresh suppressed by lifecycle', { reason: nextReason, tabId: lifecycleMeta.tabId || null });
      Shared.componentLifecycle?.emitLifecycleEvent?.({ componentKey: 'pie', tabId: lifecycleMeta.tabId || null, action: 'draw-suppressed', reason: nextReason, details: { source: 'pie-view-refresh' } });
      return;
    }
    const scheduleOptions = Object.assign({}, options, {
      tabId: ownerTabId || options.tabId || undefined,
      viewOnly: true,
      reason: nextReason,
      source: 'pie-view-refresh',
      forceDraw: lifecycleMeta.forceDraw === true,
      userInitiated: lifecycleMeta.userInitiated === true
    });
    schedulePieDrawForSession(ownerSession || getActivePieSessionForState(), scheduleOptions);
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
      schedulePieViewRefresh('font-style-change', { tabId: detail.tabId || null });
    });
    pieFontEventBound = true;
  }

  function normalizePieResizeState(){
    if(!state.resizeState || typeof state.resizeState !== 'object'){
      state.resizeState = {
        active: false,
        phase: null,
        dragging: false,
        observeMuteUntil: 0
      };
      return state.resizeState;
    }
    if(typeof state.resizeState.active !== 'boolean'){
      state.resizeState.active = !!state.resizeState.active;
    }
    if(typeof state.resizeState.phase !== 'string'){
      state.resizeState.phase = state.resizeState.phase == null ? null : String(state.resizeState.phase);
    }
    if(typeof state.resizeState.dragging !== 'boolean'){
      state.resizeState.dragging = false;
    }
    if(!Number.isFinite(Number(state.resizeState.observeMuteUntil))){
      state.resizeState.observeMuteUntil = 0;
    }
    return state.resizeState;
  }

  function isPieResizePreviewActive(drawOptions){
    const resizeState = normalizePieResizeState();
    if(resizeState.active){
      return true;
    }
    const drawReason = typeof drawOptions?.reason === 'string' ? drawOptions.reason : '';
    if(!drawReason.startsWith('resize')){
      return false;
    }
    const resizePhase = typeof drawOptions?.resizePhase === 'string'
      ? drawOptions.resizePhase
      : (typeof resizeState.phase === 'string' ? resizeState.phase : '');
    if(!PIE_RESIZE_PREVIEW_PHASES.has(resizePhase)){
      return false;
    }
    if(resizePhase === 'observe'){
      return !!resizeState.dragging;
    }
    return true;
  }

  function updatePieResizeStateForPhase(phase){
    const resizeState = normalizePieResizeState();
    const normalizedPhase = typeof phase === 'string' ? phase : '';
    resizeState.phase = normalizedPhase || null;
    if(normalizedPhase === 'start' || normalizedPhase === 'move'){
      resizeState.dragging = true;
      resizeState.active = true;
      return resizeState;
    }
    if(normalizedPhase === 'observe'){
      resizeState.active = !!resizeState.dragging;
      return resizeState;
    }
    if(PIE_RESIZE_FINALIZE_PHASES.has(normalizedPhase)){
      resizeState.dragging = false;
      resizeState.active = false;
      resizeState.observeMuteUntil = Date.now() + 180;
      return resizeState;
    }
    resizeState.active = !!resizeState.dragging;
    return resizeState;
  }

  function parsePiePositivePx(value){
    const numeric = Number.parseFloat(String(value == null ? '' : value));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : NaN;
  }

  function computePieStackedBottomReservePx(bottomLayout, options = {}){
    const maxLabelWidth = Number.isFinite(Number(bottomLayout?.maxLabelWidth))
      ? Math.max(0, Number(bottomLayout.maxLabelWidth))
      : 0;
    const tickLabelFontSize = Number.isFinite(Number(bottomLayout?.tickLabelFontSize))
      ? Math.max(1, Number(bottomLayout.tickLabelFontSize))
      : (Number.isFinite(Number(options.fontSize)) ? Math.max(1, Number(options.fontSize)) : 12);
    const outerPadding = Number.isFinite(Number(bottomLayout?.outerPadding))
      ? Math.max(0, Number(bottomLayout.outerPadding))
      : Math.max(4, Math.round(tickLabelFontSize * 0.6));
    const rotatedProjection = Math.ceil(Math.SQRT1_2 * maxLabelWidth);
    const horizontalLabelProjection = Math.ceil(tickLabelFontSize * 0.9);
    const safetyPad = Math.max(4, Math.round(tickLabelFontSize * 0.35));
    const forecastReserve = Math.max(
      0,
      rotatedProjection - horizontalLabelProjection + Math.round(outerPadding * 0.6) + safetyPad
    );
    const minReserve = Math.max(0, Math.round(tickLabelFontSize * 0.6));
    const maxReserve = Math.max(minReserve, Math.round(tickLabelFontSize * 3.2));
    const reserve = Math.min(maxReserve, Math.max(minReserve, forecastReserve));
    if(pieDebugEnabled()){
      pieDebug('Debug: pie stacked bottom reserve forecast', {
        maxLabelWidth,
        tickLabelFontSize,
        outerPadding,
        rotatedProjection,
        horizontalLabelProjection,
        safetyPad,
        forecastReserve,
        minReserve,
        maxReserve,
        reserve
      });
    }
    return reserve;
  }

  function resolvePieAutoReserveMetrics(svgBox, previousExtension){
    if(!svgBox){
      return null;
    }
    const dataset = svgBox.dataset || {};
    const zoomCandidate = Number(dataset.resizerZoomLevel || dataset.resizerZoom);
    const zoomScale = Number.isFinite(zoomCandidate) && zoomCandidate > 0 ? zoomCandidate : 1;
    const rect = svgBox.getBoundingClientRect?.() || null;
    const currentWidth = parsePiePositivePx(svgBox.style?.width)
      || parsePiePositivePx(dataset.resizerWidth)
      || (Number.isFinite(Number(rect?.width)) && Number(rect.width) > 0 ? Number(rect.width) / zoomScale : NaN);
    const currentHeight = parsePiePositivePx(svgBox.style?.height)
      || parsePiePositivePx(dataset.resizerHeight)
      || (Number.isFinite(Number(rect?.height)) && Number(rect.height) > 0 ? Number(rect.height) / zoomScale : NaN);
    const storedBaseHeight = parsePiePositivePx(dataset.pieAutoReserveBaseHeightPx);
    const storedAppliedExtension = Number.isFinite(Number(dataset.pieAutoReserveExtensionPx))
      ? Math.max(0, Number(dataset.pieAutoReserveExtensionPx))
      : NaN;
    const safePreviousExtension = Number.isFinite(Number(previousExtension))
      ? Math.max(0, Number(previousExtension))
      : 0;
    let baseHeight = storedBaseHeight;
    if(Number.isFinite(currentHeight)){
      const expectedCurrent = Number.isFinite(baseHeight) && Number.isFinite(storedAppliedExtension)
        ? baseHeight + storedAppliedExtension
        : NaN;
      const storedLooksCurrent = Number.isFinite(expectedCurrent) && Math.abs(expectedCurrent - currentHeight) <= 2;
      if(!storedLooksCurrent){
        baseHeight = Math.max(40, currentHeight - safePreviousExtension);
      }
    }
    if(!Number.isFinite(baseHeight) || baseHeight <= 0){
      baseHeight = Number.isFinite(currentHeight) && currentHeight > 0
        ? Math.max(40, currentHeight - safePreviousExtension)
        : NaN;
    }
    return {
      currentWidth,
      currentHeight,
      baseHeight,
      appliedExtension: Number.isFinite(storedAppliedExtension) ? storedAppliedExtension : safePreviousExtension,
      zoomScale
    };
  }

  function applyPieAutoReserveFrameSize(nextExtension, previousExtension, options = {}){
    const svgBox = state.svgBox || queryPieRoot('#pieGraphPanel .svgbox');
    if(!svgBox || options.resizeContainer !== true){
      return { applied: false, reason: !svgBox ? 'missing-svgbox' : 'container-resize-disabled' };
    }
    const metrics = resolvePieAutoReserveMetrics(svgBox, previousExtension);
    if(!metrics || !Number.isFinite(metrics.currentHeight) || !Number.isFinite(metrics.baseHeight)){
      return { applied: false, reason: 'missing-frame-metrics', metrics };
    }
    const safeNextExtension = Number.isFinite(Number(nextExtension))
      ? Math.max(0, Math.round(Number(nextExtension)))
      : 0;
    const targetHeight = Math.max(40, Math.round(metrics.baseHeight + safeNextExtension));
    const currentHeight = Math.round(metrics.currentHeight);
    const currentWidth = Number.isFinite(metrics.currentWidth) && metrics.currentWidth > 0
      ? Math.round(metrics.currentWidth)
      : undefined;
    const dataset = svgBox.dataset || {};
    dataset.pieAutoReserveBaseHeightPx = String(Math.round(metrics.baseHeight));
    dataset.pieAutoReserveExtensionPx = String(safeNextExtension);
    dataset.pieAutoReserveReason = options.reason || 'pie-auto-content-reserve';
    if(Math.abs(targetHeight - currentHeight) < 1){
      return {
        applied: false,
        alreadyCorrect: true,
        targetHeight,
        currentHeight,
        baseHeight: metrics.baseHeight,
        extension: safeNextExtension
      };
    }
    if(typeof Shared.applyResizableBoxSize !== 'function'){
      return { applied: false, reason: 'missing-shared-resizer', targetHeight, currentHeight };
    }
    if(state.viewportExtensionResizeInProgress){
      return { applied: false, reason: 'resize-in-progress', targetHeight, currentHeight };
    }
    let resizeResult = null;
    state.viewportExtensionResizeInProgress = true;
    try{
      resizeResult = Shared.applyResizableBoxSize(svgBox, {
        axis: 'both',
        width: currentWidth,
        height: targetHeight,
        forceExact: true,
        preserveAspectLock: true,
        updateAspectRatio: true,
        updateDefaults: false,
        reason: options.reason || 'pie-auto-content-reserve'
      });
    }catch(err){
      console.error('pie automatic reserve resize failed', err);
      return { applied: false, error: err, targetHeight, currentHeight };
    }finally{
      state.viewportExtensionResizeInProgress = false;
    }
    pieDebug('Debug: pie automatic reserve frame size applied', {
      reason: options.reason || null,
      previousExtension,
      nextExtension: safeNextExtension,
      baseHeight: Math.round(metrics.baseHeight),
      currentHeight,
      targetHeight,
      currentWidth,
      resizeResult
    });
    return {
      applied: !!resizeResult,
      resizeResult,
      targetHeight,
      currentHeight,
      baseHeight: metrics.baseHeight,
      extension: safeNextExtension
    };
  }

  function applyPieBottomViewportExtension(nextExtension, options = {}){
    const normalizeExtension = value => Number.isFinite(Number(value))
      ? Math.max(0, Math.round(Number(value)))
      : 0;
    const previousExtension = normalizeExtension(state.bottomViewportExtensionPx);
    const normalizedNextExtension = normalizeExtension(nextExtension);
    state.bottomViewportExtensionPx = normalizedNextExtension;
    const resizeResult = applyPieAutoReserveFrameSize(normalizedNextExtension, previousExtension, options);
    pieDebug('Debug: pie bottom viewport extension stored as automatic graph reserve', {
      previousExtension,
      nextExtension: normalizedNextExtension,
      requestedContainerResize: options.resizeContainer === true,
      containerResizeApplied: !!resizeResult?.applied,
      resizeResult,
      reason: options.reason || null
    });
    return {
      changed: normalizedNextExtension !== previousExtension,
      previousExtension,
      nextExtension: normalizedNextExtension,
      delta: normalizedNextExtension - previousExtension,
      applied: !!resizeResult?.applied,
      resizeResult
    };
  }

  function applyPieSvgDefaults(svg, options = {}){
    if(!svg){
      return;
    }
    svg.setAttribute('font-family', chartStyle.FONT_FAMILY);
    svg.setAttribute('color', chartStyle.TEXT_COLOR || '#000000');
    if(options.isResizePreview){
      return;
    }
    chartStyle.applySvgDefaults(svg);
  }

  const pieUndoManager = Shared.undoManager || null;
  function recordPieChange(label, previous, next, apply){
    if(!pieUndoManager || typeof pieUndoManager.recordStateChange !== 'function'){
      return;
    }
    if(typeof apply !== 'function'){
      return;
    }
    const recorder = Shared.styleUndo?.recordStateChange || (opts => pieUndoManager.recordStateChange(opts));
    recorder({
      manager: pieUndoManager,
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

  function applyPieTitleValue(node, value, session = null){
    const nextValue = value != null ? String(value) : '';
    patchPieVisualState(session, { titleText: nextValue }, { reason: 'pie-title-edit' });
    if(node && node.textContent !== nextValue){
      node.textContent = nextValue;
    }
    schedulePieViewRefresh('title-change');
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
    schedulePieViewRefresh('color-change');
    return true;
  }

  function collectPieTraceLabels(target){
    const labels = new Set();
    const addLabel = value => {
      const normalized = String(value == null ? '' : value).trim();
      if(normalized){
        labels.add(normalized);
      }
    };
    const root = state.svgBox || state.root || global.document;
    if(root?.querySelectorAll){
      root.querySelectorAll('#pieSvg [data-pie-trace="1"]').forEach(node => {
        addLabel(node.getAttribute?.('data-pie-trace-label'));
      });
    }
    if(target){
      addLabel(target.getAttribute?.('data-pie-trace-label'));
    }
    Object.keys(state.colors || {}).forEach(addLabel);
    return Array.from(labels);
  }

  function resolvePieScopedTraceLabel(context, fallbackLabel){
    const ctx = context && typeof context === 'object' ? context : {};
    const scope = String(ctx.scope || '').trim();
    if(scope === 'global'){
      return '';
    }
    if(String(ctx.scope || '').trim() === 'trace' && String(ctx.scopeDataset || '').trim()){
      return String(ctx.scopeDataset).trim();
    }
    return String(fallbackLabel || '').trim();
  }

  function getPieChartTypeValue(){
    return normalizePieRuntimeControls({
      chartType: getPieNodeById('pieChartType')?.value || state.controls?.chartType || 'pie'
    }).chartType;
  }

  function isPieStartAngleApplicable(){
    return getPieChartTypeValue() !== 'stacked';
  }

  function normalizePieStartAngleValue(value){
    const numeric = Number(value);
    if(!Number.isFinite(numeric)){
      return 0;
    }
    return Math.round(numeric * 1000) / 1000;
  }

  function syncPieStartAngleToolbarVisibility(){
    if(pieStartAngleToolbarField){
      pieStartAngleToolbarField.hidden = !isPieStartAngleApplicable();
    }
  }

  function setPieStartAngleFromToolbar(value){
    const input = getPieNodeById('pieStartAngle');
    if(!input){
      return;
    }
    input.value = String(normalizePieStartAngleValue(value));
    const session = getActivePieSessionForState();
    syncPieRuntimeControlsFromDom(session);
    schedulePieViewRefresh('trace-start-angle-change', { tabId: session?.tabId || undefined });
  }

  function mountPieStartAngleTraceToolbar(toolbar){
    pieStartAngleToolbarField = null;
    if(!toolbar?.wrap || !isPieStartAngleApplicable()){
      return;
    }
    const doc = toolbar.wrap.ownerDocument || global.document;
    if(!doc){
      return;
    }
    const toolbarApi = Shared.getWorkspaceToolbarApi?.();
    if(!toolbarApi || typeof toolbarApi.createLabeledField !== 'function'){
      return;
    }
    const input = doc.createElement('input');
    input.type = 'number';
    input.step = '1';
    input.value = String(normalizePieStartAngleValue(getPieNodeById('pieStartAngle')?.value));
    input.setAttribute('aria-label', 'Start angle');
    input.setAttribute('data-undo-ignore', '1');
    input.className = 'additional-line-controls-panel__input additional-line-controls-panel__input--small workspace-toolbar__input-control';
    input.addEventListener('input', () => {
      setPieStartAngleFromToolbar(input.value);
    });
    const field = toolbarApi.createLabeledField({
      fieldClass: 'additional-line-controls-panel__field additional-line-controls-panel__field--numeric pie-start-angle-toolbar-field',
      label: 'Start angle',
      labelClass: 'additional-line-controls-panel__field-label',
      control: input
    }).field;
    toolbar.wrap.appendChild(field);
    pieStartAngleToolbarField = field;
    syncPieStartAngleToolbarVisibility();
  }

  function showPieTraceFormatControls(target){
    const doc = global.document;
    if(!doc){
      return;
    }
    try{
      if(typeof Shared.hideAllFormatControls === 'function'){
        Shared.hideAllFormatControls({ force: true });
      }
    }catch(_err){}
    if(!Shared.symbolToolbar || typeof Shared.symbolToolbar.show !== 'function'){
      pieDebug('Debug: pie trace toolbar unavailable');
      return;
    }
    const targetTraceLabel = String(
      (typeof target?.getAttribute === 'function' ? target.getAttribute('data-pie-trace-label') : '')
      || ''
    ).trim();
    const traceLabels = collectPieTraceLabels(target);
    const defaultScopeValue = targetTraceLabel && typeof Shared.encodeScopeValue === 'function'
      ? Shared.encodeScopeValue('trace', targetTraceLabel)
      : 'global';
    const resolveTraceNodes = traceLabel => {
      const root = state.svgBox || state.root || doc;
      const nodes = Array.from(root.querySelectorAll?.('#pieSvg [data-pie-trace="1"]') || []);
      const normalized = String(traceLabel == null ? '' : traceLabel).trim();
      if(!normalized){
        return nodes;
      }
      return nodes.filter(node => String(node?.getAttribute?.('data-pie-trace-label') || '').trim() === normalized);
    };
    const applyTraceFill = (traceLabel, value) => {
      const nextValue = value || '#888888';
      const targetLabel = String(traceLabel == null ? '' : traceLabel).trim();
      if(targetLabel){
        state.colors[targetLabel] = nextValue;
        resolveTraceNodes(targetLabel).forEach(node => node.setAttribute('fill', nextValue));
        return;
      }
      traceLabels.forEach(label => {
        state.colors[label] = nextValue;
      });
      resolveTraceNodes('').forEach(node => node.setAttribute('fill', nextValue));
    };
    const toolbar = Shared.symbolToolbar.show({
      document: doc,
      target,
      anchorId: 'pieFontHost',
      scopeId: 'pie',
      panelTitle: 'Trace',
      formClass: 'workspace-toolbar__form workspace-toolbar__form--single scatter-format-controls pie-trace-controls',
      scope: {
        label: 'Scope',
        options: [{ value: 'global', label: 'Global', disabled: false }].concat(traceLabels.map(label => ({
          value: typeof Shared.encodeScopeValue === 'function' ? Shared.encodeScopeValue('trace', label) : label,
          label,
          datasetLabel: label,
          scopeKind: 'trace',
          scopeDataset: label,
          disabled: false
        }))),
        value: defaultScopeValue
      },
      fillShape: {
        label: 'Fill',
        showShapePicker: false,
        shapeOptions: [{ value: 'square', label: 'Square' }],
        getColor(context){
          const scopedTrace = resolvePieScopedTraceLabel(context, targetTraceLabel);
          if(scopedTrace){
            return state.colors[scopedTrace] || target?.getAttribute?.('fill') || '#888888';
          }
          return target?.getAttribute?.('fill') || '#888888';
        },
        getShape(){
          return 'square';
        },
        onColorInput(value, context){
          const scopedTrace = resolvePieScopedTraceLabel(context, targetTraceLabel);
          applyTraceFill(scopedTrace, value);
        },
        onColorChange(value, context){
          const scopedTrace = resolvePieScopedTraceLabel(context, targetTraceLabel);
          applyTraceFill(scopedTrace, value);
          schedulePieViewRefresh('trace-fill-change');
        }
      },
      border: {
        label: 'Border',
        getColor(){
          return getPieNodeById('pieBorderColor')?.value || '#ffffff';
        },
        onColorInput(value){
          const input = getPieNodeById('pieBorderColor');
          if(input){
            input.value = value || '#ffffff';
          }
          resolveTraceNodes('').forEach(node => {
            if(Number(parseFloat(getPieNodeById('pieBorderWidth')?.value)) > 0){
              node.setAttribute('stroke', value || '#ffffff');
            }
          });
        },
        onColorChange(value){
          const input = getPieNodeById('pieBorderColor');
          if(input){
            input.value = value || '#ffffff';
          }
          schedulePieViewRefresh('trace-border-color-change');
        },
        getWidth(){
          const raw = Number.parseFloat(getPieNodeById('pieBorderWidth')?.value);
          return Number.isFinite(raw) ? Math.max(0, raw) : 0;
        },
        onWidthChange(value){
          const numeric = Number(value);
          const normalized = Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
          const input = getPieNodeById('pieBorderWidth');
          if(input){
            input.value = String(normalized);
          }
          schedulePieViewRefresh('trace-border-width-change');
        }
      },
      size: {
        enabled: false,
        get(){ return 0; },
        onChange(){ return; }
      },
      transparency: {
        enabled: false
      }
    });
    mountPieStartAngleTraceToolbar(toolbar);
    pieDebug('Debug: pie trace format controls opened', {
      targetTraceLabel: targetTraceLabel || null,
      startAngleVisible: !!(pieStartAngleToolbarField && !pieStartAngleToolbarField.hidden)
    });
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
          // Store both absolute and relative positions.
          const relX = pos.x / svgWidth;
          const relY = pos.y / svgHeight;
          patchPieLabelPosition(getActivePieSessionForState(), 'legend', { 
            x: pos.x, 
            y: pos.y,
            relX: relX, 
            relY: relY 
          }, { reason: 'pie-legend-position' });
          capturePieSessionStateFromActive(getActivePieSessionForState(), {
            reason: 'legend-position-change',
            captureStats: false
          });
          if(Shared.isDebugEnabled?.()){
            pieDebug('Debug: pie legend position saved', { absolute: pos, relative: { relX, relY } });
          }
        }
      });
    }
    return legendGroup;
  }

  let pieLegendControl = null;
  let pieShowLegendInput = null;
  let pieStartAngleToolbarField = null;
  let pieLockRatioInput = null;
  let pieLockRatioEnforcePrevious = null;
  let pieLockRatioEnforcing = false;

  function refreshPieLegendControlBinding(){
    const legendInput = getPieNodeById('pieShowLegend');
    if(legendInput){
      pieShowLegendInput = legendInput;
      const legendHost = legendInput.closest('label');
      if(legendHost){
        pieLegendControl = legendHost;
      }
    }
    if(!state.svgBox || !state.svgBox.isConnected){
      const nextSvgBox = queryPieRoot('#pieGraphPanel .svgbox');
      if(nextSvgBox){
        state.svgBox = nextSvgBox;
      }
    }
  }

  function ensurePieLegendControlPlacement(){
    refreshPieLegendControlBinding();
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

  function getPieLockRatioCheckbox(){
    const activeTabId = String(pie.__boundTabId || '').trim();
    const isOwnedByActiveTab = node => {
      if(!node || !node.isConnected){
        return false;
      }
      const ownerRoot = node.closest?.('[data-workspace-tab-id], [data-tab-id], [data-graphitix-tab-id]') || null;
      const ownerTabId = String(
        ownerRoot?.getAttribute?.('data-workspace-tab-id')
        || ownerRoot?.getAttribute?.('data-tab-id')
        || ownerRoot?.getAttribute?.('data-graphitix-tab-id')
        || ownerRoot?.dataset?.workspaceTabId
        || ownerRoot?.dataset?.tabId
        || ''
      ).trim();
      return !activeTabId || !ownerTabId || ownerTabId === activeTabId;
    };
    if(pieLockRatioInput && isOwnedByActiveTab(pieLockRatioInput)){
      return pieLockRatioInput;
    }
    pieLockRatioInput = null;
    let svgBox = state.svgBox && isOwnedByActiveTab(state.svgBox) ? state.svgBox : null;
    if(!svgBox){
      svgBox = getPieNodeById('pieGraphPanel', activeTabId || null)?.querySelector?.('.svgbox') || null;
    }
    if(!svgBox || !isOwnedByActiveTab(svgBox)){
      return null;
    }
    const checkbox = svgBox.querySelector('.resizer-aspect-checkbox');
    if(checkbox && isOwnedByActiveTab(checkbox)){
      pieLockRatioInput = checkbox;
      return checkbox;
    }
    return null;
  }

  function getPieLockRatioEnforcePrevious(){
    const value = state.lockRatioEnforcePrevious;
    if(value === true || value === false){
      return !!value;
    }
    return (pieLockRatioEnforcePrevious === true || pieLockRatioEnforcePrevious === false)
      ? !!pieLockRatioEnforcePrevious
      : null;
  }

  function setPieLockRatioEnforcePrevious(value){
    const normalized = (value === true || value === false) ? !!value : null;
    pieLockRatioEnforcePrevious = normalized;
    state.lockRatioEnforcePrevious = normalized;
    const session = getActivePieSessionForState?.();
    if(session?.state){
      session.state.lockRatioEnforcePrevious = normalized;
      session.updatedAt = Date.now();
    }
    return normalized;
  }

  function getPieSavedAspectLockPreference(){
    const activeTabId = normalizePieSessionTabId(pie.__boundTabId || null, { reason: 'pie-aspect-lock-preference' });
    const tab = activeTabId ? global.Main?.session?.workspaceState?.tabs?.find?.(item => String(item?.id || '') === String(activeTabId)) : null;
    const layoutValue = tab?.layoutState?.svgBox?.dataset?.resizerAspectLocked;
    if(layoutValue === 'true' || layoutValue === 'false'){
      return layoutValue === 'true';
    }
    const payloadValue = tab?.payload?.meta?.graphSizing?.display?.aspectLocked;
    if(payloadValue === true || payloadValue === false){
      return !!payloadValue;
    }
    return null;
  }

  function syncPieAspectControls(reason){
    if(pieLockRatioEnforcing){
      return;
    }
    pieLockRatioEnforcing = true;
    try{
      const chartTypeValue = $('#pieChartType')?.value || 'pie';
      const shouldEnforceLockRatio = chartTypeValue === 'pie' || chartTypeValue === 'donut';
      const lockRatioCheckbox = getPieLockRatioCheckbox();
      if(lockRatioCheckbox){
        const lockLabel = lockRatioCheckbox.closest('label');
        if(shouldEnforceLockRatio){
          if(getPieLockRatioEnforcePrevious() === null){
            setPieLockRatioEnforcePrevious(!!lockRatioCheckbox.checked);
          }
          if(!lockRatioCheckbox.checked){
            lockRatioCheckbox.checked = true;
            lockRatioCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
          }
          lockRatioCheckbox.disabled = true;
          if(lockLabel){
            if(!lockLabel.__pieOriginalTitle){
              lockLabel.__pieOriginalTitle = lockLabel.title || '';
            }
            lockLabel.title = 'Locked for Pie and Donut charts';
          }
        }else{
          lockRatioCheckbox.disabled = false;
          if(lockLabel && lockLabel.__pieOriginalTitle !== undefined){
            lockLabel.title = lockLabel.__pieOriginalTitle;
            delete lockLabel.__pieOriginalTitle;
          }
          const restoreValue = getPieLockRatioEnforcePrevious();
          const savedAspectLock = getPieSavedAspectLockPreference();
          const targetValue = savedAspectLock !== null ? savedAspectLock : restoreValue;
          if(targetValue !== null){
            setPieLockRatioEnforcePrevious(null);
            if(lockRatioCheckbox.checked !== targetValue){
              lockRatioCheckbox.checked = targetValue;
              lockRatioCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        }
      }
    }finally{
      pieLockRatioEnforcing = false;
    }
  }

  function bindPieControlHandler(node, eventName, key, handler){
    if(!node || typeof node.addEventListener !== 'function' || typeof handler !== 'function'){
      return false;
    }
    const eventKey = String(eventName || '').trim();
    if(!eventKey){
      return false;
    }
    const storeKey = `${eventKey}:${String(key || 'handler')}`;
    const store = node.__pieControlHandlers || (node.__pieControlHandlers = {});
    const previous = store[storeKey];
    if(previous && typeof node.removeEventListener === 'function'){
      node.removeEventListener(eventKey, previous);
    }
    const wrapped = event => runPieControlOwner(event, key || storeKey, session => handler(event, session));
    node.addEventListener(eventKey, wrapped);
    store[storeKey] = wrapped;
    return true;
  }

  function getPieStatsConfig(){
    if(!state.statsConfig || typeof state.statsConfig !== 'object'){
      state.statsConfig = createDefaultPieStatsConfig();
    }
    if(!(state.statsConfig.selectedCols instanceof Set)){
      const selectedSource = Array.isArray(state.statsConfig.selectedCols)
        ? state.statsConfig.selectedCols
        : (Array.isArray(state.statsConfig.selectedColumns) ? state.statsConfig.selectedColumns : []);
      state.statsConfig.selectedCols = new Set(selectedSource);
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

  function rememberPieStatsState(reason, options = {}){
    if(state.applyingPayload && options.allowDuringPayload !== true){
      return null;
    }
    const session = getActivePieSessionForState();
    if(!session){
      return null;
    }
    return capturePieSessionStateFromActive(session, {
      reason: reason || 'pie-stats-state',
      captureStats: true,
      syncControls: options.syncControls !== false
    });
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
    const scientific = Shared.statsReporting?.getPValueFormatScientific?.({
      target: getPieNodeById('pieStatsResults'),
      tabId: pie.__boundTabId || null
    }) === true;
    if(typeof Shared.formatPValue === 'function'){
      return Shared.formatPValue(numeric, { scientific, forceScientific: scientific });
    }
    if(scientific) return numeric.toExponential(5);
    return numeric >= 0 && numeric <= 0.0001 ? '<0.0001' : numeric.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  }

  function pieChiSquareUpperTailPValue(statistic, df){
    const helper = Shared.stats?.chiSquareUpperTail;
    if(typeof helper === 'function'){
      const value = helper(statistic, df);
      return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : NaN;
    }
    const cdf = global.jStat?.chisquare?.cdf;
    return typeof cdf === 'function' ? Math.max(0, Math.min(1, 1 - cdf(statistic, df))) : NaN;
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
    if(state.applyingPayload){
      if(pieDebugEnabled()){
        pieDebug('Debug: pie stats context refresh suppressed during payload apply', { reason: reason || 'unspecified' });
      }
      return;
    }
    const stats = getPieStatsConfig();
    stats.contextSignature = null;
    stats.pending = false;
    stats.restorePending = null;
    clearPieStatsOutputs('Statistics ready to calculate.');
    setPieStatsStatus('Statistics ready to calculate.');
    updatePieStatsButtonState({ disabled: false, label: 'Calculate statistics' });
    updatePieStatsCorrectionSummary(estimatePieStatsComparisonCount());
    rememberPieStatsState(reason || 'pie-stats-context-refresh', { syncControls: false });
    if(pieDebugEnabled()){
      pieDebug('Debug: pie stats context refresh requested', { reason: reason || 'unspecified' });
    }
  }

  function primePieStatsComputation(options = {}){
    const matrix = options.matrix || getPieStatsDataMatrix();
    if(Array.isArray(matrix)){
      state.columnSignature = matrix.map(row => Array.isArray(row)
        ? row.map(value => value == null ? '' : String(value)).join('\u0002')
        : '').join('\u0001');
    }
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
      if(!pieStatsPanelHasRenderedResults() && (restored.resultsModel != null || restored.reportModel != null)){
        const out = getPieNodeById('pieStatsResults');
        if(out){
          if(Shared.statsReporting && typeof Shared.statsReporting.restorePanelModel === 'function'){
            Shared.statsReporting.restorePanelModel(out, restored, {
              ensureReportHost: () => ensurePieStatsReportHost(out)
            });
          }else{
            out.textContent = '';
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
    const pValue = pieChiSquareUpperTailPValue(statistic, df);
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
    const pValue = pieChiSquareUpperTailPValue(statistic, df);
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

  function handlePieStatsComputeClick(event){
    bindPieStatsEventTarget(event?.currentTarget || event?.target || null, 'pie-stats-compute-event');
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
    let primaryPValue = NaN;
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
        primaryPValue = Number.isFinite(gof.pValue) ? gof.pValue : NaN;
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
        primaryPValue = Number.isFinite(overall.pValue) ? overall.pValue : NaN;
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
        const reportCorrectionMeta = Shared.stats && typeof Shared.stats.getCorrectionMeta === 'function'
          ? Shared.stats.getCorrectionMeta(stats.correction)
          : { shortLabel: stats.correction, label: stats.correction };
        const reportMethods = [
          `Categorical count data were analyzed with ${renderedModel.summary.testLabel}.`,
          stats.scope === 'gof'
            ? 'Observed counts were compared with the selected expected-count column across retained categories.'
            : 'A contingency table was built from selected condition columns and category rows to test whether category proportions differed between conditions.',
          'Counts were parsed as numeric non-negative values; rows with missing, invalid, or incompatible expected values were excluded before analysis.',
          stats.scope !== 'gof' ? `Expected-count diagnostics used the sparse-cell threshold ${formatPieStatNumber(stats.sparseThreshold, 3)}.` : null,
          stats.scope !== 'gof' && stats.yatesCorrection ? 'Yates continuity correction was applied automatically for eligible 2×2 chi-square tables.' : null,
          stats.scope !== 'gof' && Array.isArray(renderedModel.pairs) && renderedModel.pairs.length
            ? `Configured pairwise condition comparisons used the same test family, with ${reportCorrectionMeta?.label || reportCorrectionMeta?.shortLabel || stats.correction} multiplicity control across the reported pairwise family.`
            : null,
          `The alpha threshold was ${formatPieStatNumber(stats.alpha, 3)}.`
        ].filter(Boolean).join(' ');
        Shared.statsReporting.appendReportPanel(getPieNodeById('pieStatsResults'), {
          methodsText: reportMethods,
          resultsText: `${renderedModel.summary.caption}: statistic = ${renderedModel.summary.statistic}, df = ${renderedModel.summary.df}, p = ${renderedModel.summary.pValue}.`,
          resultsParts: [`${renderedModel.summary.caption}: statistic = ${renderedModel.summary.statistic}, df = ${renderedModel.summary.df}, p = `, { type:'pValue', value:primaryPValue, fallback:String(renderedModel.summary.pValue) }, '.'],
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
      rememberPieStatsState('pie-stats-compute-success', { syncControls: false });
    }catch(err){
      console.error('pie stats computation failed', err);
      clearPieStatsOutputs('Unable to compute statistics. See console for details.');
      setPieStatsStatus('Failed to compute statistics.');
      updatePieStatsButtonState({ disabled: false, label: 'Calculate statistics' });
      rememberPieStatsState('pie-stats-compute-failed', { syncControls: false });
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
      input.addEventListener('change', event => {
        bindPieStatsEventTarget(event.currentTarget, 'pie-stats-selection-change');
        const activeStats = getPieStatsConfig();
        if(input.checked){
          activeStats.selectedCols.add(column.index);
        }else{
          activeStats.selectedCols.delete(column.index);
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
    scopeSelect.addEventListener('change', event => {
      bindPieStatsEventTarget(event.currentTarget, 'pie-stats-scope-change');
      getPieStatsConfig().scope = sanitizePieStatsScope(scopeSelect.value);
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
    testSelect.addEventListener('change', event => {
      bindPieStatsEventTarget(event.currentTarget, 'pie-stats-test-change');
      getPieStatsConfig().test = sanitizePieStatsTest(testSelect.value);
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
      observedSelect.addEventListener('change', event => {
        bindPieStatsEventTarget(event.currentTarget, 'pie-stats-gof-observed-change');
        getPieStatsConfig().valueColumn = Number.parseInt(observedSelect.value, 10);
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
      expectedSelect.addEventListener('change', event => {
        bindPieStatsEventTarget(event.currentTarget, 'pie-stats-gof-expected-change');
        getPieStatsConfig().expectedColumn = Number.parseInt(expectedSelect.value, 10);
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
      referenceSelect.addEventListener('change', event => {
        bindPieStatsEventTarget(event.currentTarget, 'pie-stats-reference-change');
        getPieStatsConfig().referenceColumn = Number.parseInt(referenceSelect.value, 10);
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
          input.addEventListener('change', event => {
            bindPieStatsEventTarget(event.currentTarget, 'pie-stats-custom-pair-toggle');
            const activeStats = getPieStatsConfig();
            if(input.checked){
              activeStats.customPairs.add(key);
            }else{
              activeStats.customPairs.delete(key);
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
    correctionSelect.addEventListener('change', event => {
      bindPieStatsEventTarget(event.currentTarget, 'pie-stats-correction-change');
      getPieStatsConfig().correction = sanitizePieStatsCorrection(correctionSelect.value);
      requestPieStatsContextRefresh('correction-change');
    });
    appendRow(rightColumn, 'Multiplicity control:', correctionSelect);

    const alphaInput = document.createElement('input');
    alphaInput.type = 'number';
    alphaInput.step = '0.001';
    alphaInput.min = '0.0001';
    alphaInput.max = '0.499';
    alphaInput.value = String(stats.alpha);
    alphaInput.addEventListener('change', event => {
      bindPieStatsEventTarget(event.currentTarget, 'pie-stats-alpha-change');
      const activeStats = getPieStatsConfig();
      activeStats.alpha = sanitizePieStatsAlpha(alphaInput.value);
      alphaInput.value = String(activeStats.alpha);
      requestPieStatsContextRefresh('alpha-change');
    });
    appendRow(rightColumn, 'Alpha:', alphaInput);

    const advanced = document.createElement('details');
    advanced.className = 'box-stats-advanced';
    advanced.open = !!stats.advancedOpen;
    advanced.addEventListener('toggle', event => {
      bindPieStatsEventTarget(event.currentTarget, 'pie-stats-advanced-toggle');
      getPieStatsConfig().advancedOpen = !!advanced.open;
      rememberPieStatsState('advanced-toggle', { syncControls: false });
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
    sparseInput.addEventListener('change', event => {
      bindPieStatsEventTarget(event.currentTarget, 'pie-stats-sparse-threshold-change');
      const activeStats = getPieStatsConfig();
      activeStats.sparseThreshold = sanitizePieStatsSparseThreshold(sparseInput.value);
      sparseInput.value = String(activeStats.sparseThreshold);
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
    yatesInput.addEventListener('change', event => {
      bindPieStatsEventTarget(event.currentTarget, 'pie-stats-yates-change');
      getPieStatsConfig().yatesCorrection = !!yatesInput.checked;
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
    const panelHtml = Shared.statsReporting && typeof Shared.statsReporting.capturePanelModel === 'function'
      ? Shared.statsReporting.capturePanelModel(out)
      : { resultsModel: null, reportModel: null };
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
      resultsModel: panelHtml.resultsModel || null,
      reportModel: panelHtml.reportModel || null,
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
    const selectedInput = Array.isArray(input.selectedColumns)
      ? input.selectedColumns
      : (Array.isArray(input.selectedCols) ? input.selectedCols : null);
    if(Array.isArray(selectedInput)){
      stats.selectedCols = new Set(selectedInput.map(Number).filter(value => Number.isInteger(value) && value >= 1));
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
    if(input.resultsModel != null || input.reportModel != null){
      const out = getPieNodeById('pieStatsResults');
      if(out){
        if(Shared.statsReporting && typeof Shared.statsReporting.restorePanelModel === 'function'){
          Shared.statsReporting.restorePanelModel(out, input, {
            ensureReportHost: () => ensurePieStatsReportHost(out)
          });
        }else{
          out.textContent = '';
        }
        restoredResults = pieStatsPanelHasRenderedResults();
      }
    }
    const hasSavedResultsModel = !!input.resultsModel;
    const hasSavedReportModel = !!input.reportModel;
    stats.restorePending = (restoredResults || hasSavedResultsModel || hasSavedReportModel) && !!savedLastRunSignature
      ? {
          contextSignature: savedContextSignature,
          lastRunSignature: savedLastRunSignature,
          hasResults: true,
          resultsModel: input.resultsModel || null,
          reportModel: input.reportModel || null
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
      if(!state.applyingPayload){
        requestPieStatsContextRefresh('table-edit');
      }else if(pieDebugEnabled()){
        pieDebug('Debug: pie table-edit stats refresh skipped during payload apply');
      }
      scheduleActivePieDraw({ reason: 'pie-table-edit' });
      capturePieSessionStateFromActive(getActivePieSessionForState(), {
        reason: 'table-edit',
        captureStats: false
      });
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
      const tableTabId = Shared.hot?.resolveTableTabId?.({
        type: 'pie',
        component: pie,
        wrapper,
        container: baseContainer,
        reason: 'pie-ensure-hot'
      }) || null;
      if(typeof Shared.hot?.ensureTableForTab !== 'function' || !wrapper || !baseContainer){
        if(!state.hot){
          state.hot = createPieTable(baseContainer);
        }
        if(state.hot){
          state.hot.__pieHostContainer = baseContainer;
          state.hot.__pieTabId = tableTabId;
        }
        ensurePieDefaultHeaderRow(state.hot);
        return state.hot;
      }
      const entry = Shared.hot.ensureTableForTab({
        type: 'pie',
        tabId: tableTabId,
        wrapper,
        container: baseContainer,
        createInstance: createPieTable
      });
      if(entry?.instance){
        state.hot = entry.instance;
      }
      if(state.hot){
        state.hot.__pieHostContainer = entry?.container || baseContainer;
        state.hot.__pieTabId = entry?.tabId || tableTabId;
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
    syncPieSessionManagersFromActive();
    syncPieSessionRefsFromActive();
  }

  function hasPiePlottableData(hotInstance){
    const matrix = hotInstance?.getData?.();
    if(!Array.isArray(matrix) || matrix.length < 2){
      return false;
    }
    for(let r = 1; r < matrix.length; r += 1){
      const row = matrix[r];
      if(!Array.isArray(row)){
        continue;
      }
      const label = row[0];
      const value = row[1];
      const hasLabel = typeof label === 'string' ? !!label.trim() : (label != null && String(label).trim() !== '');
      const numericValue = Number(value);
      if(hasLabel && Number.isFinite(numericValue)){
        return true;
      }
    }
    return false;
  }

  function ensurePieDataViewsForHot(hotInstance, options = {}){
    if(!hotInstance || typeof hotInstance.getData !== 'function'){
      return null;
    }
    if(typeof Shared.dataViews?.createManager !== 'function'){
      return null;
    }
    const ownerSession = getPieSessionForHot(hotInstance, { reason: 'pie-dataviews-owner' }, { create: true })
      || getActivePieSessionForState();
    if(!hotInstance.__pieDataViewsManager){
      hotInstance.__pieDataViewsManager = Shared.dataViews.createManager({
        componentKey: 'pie',
        maxViews: PIE_DATA_VIEW_MAX,
        initialData: hotInstance.getData() || [],
        onActiveViewChanged(view, meta){
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
          const session = getPieSessionForHot(hotInstance, { reason: 'pie-dataview-switch' }, { create: false })
            || ownerSession
            || getActivePieSessionForState();
          if(session){
            session.managers.hot = hotInstance;
            const manager = hotInstance.__pieDataViewsManager || null;
            session.managers.dataViews = pieDataViewsManagerBelongsToSession(manager, session) ? manager : session.managers.dataViews || null;
            session.updatedAt = Date.now();
          }
          if(isPieSessionActiveOrActivating(session)){
            requestPieStatsContextRefresh('data-view-switch');
            schedulePieDrawForSession(session, {
              reason: 'data-view-switch',
              userInitiated: String(meta?.reason || '').trim().toLowerCase() === 'tab-click'
            });
            capturePieSessionStateFromActive(session, {
              reason: 'data-view-switch',
              captureStats: false
            });
          }
        },
        onInteraction(){
          if(isPieSessionActiveOrActivating(getPieSessionForHot(hotInstance, { reason: 'pie-dataview-interaction' }, { create: false }))){
            Shared.workspaceToolbar?.activateSection?.('pie', 'Data');
          }
        }
      });
      const ownerTabId = ownerSession?.tabId || getPieHotOwnerTabId(hotInstance) || pie.__boundTabId || null;
      hotInstance.__pieDataViewsManager.__pieTabId = ownerTabId;
      hotInstance.__pieDataViewsManager.__workspaceTabId = ownerTabId;
      hotInstance.__pieDataViewsManager.__ownerTabId = ownerTabId;
      pieDebug('Debug: pie data views manager created');
    }
    const manager = hotInstance.__pieDataViewsManager;
    const hostWrapper = options.wrapper || getPieNodeById('pieHotWrapper');
    const hostContainer = options.container || hotInstance.__pieHostContainer || getPieNodeById('pieHot');
    if(hostWrapper && hostContainer){
      manager.mount({ wrapper: hostWrapper, tableContainer: hostContainer });
      manager.refresh?.();
    }
    const currentOwnerSession = getPieSessionForHot(hotInstance, { reason: 'pie-dataviews-owner-refresh' }, { create: true })
      || ownerSession;
    if(currentOwnerSession){
      currentOwnerSession.managers.hot = hotInstance;
      currentOwnerSession.managers.dataViews = pieDataViewsManagerBelongsToSession(manager, currentOwnerSession) ? manager : currentOwnerSession.managers.dataViews || null;
      currentOwnerSession.updatedAt = Date.now();
    }
    if(isPieSessionActiveOrActivating(currentOwnerSession)){
      syncPieSessionManagersFromActive(currentOwnerSession);
    }
    return manager;
  }

  function syncPieActiveDataViewFromHot(hotInstance, reason){
    const hot = hotInstance || state.hot;
    if(!hot || typeof hot.getData !== 'function'){
      return;
    }
    const ownerSession = getPieSessionForHot(hot, { reason: 'pie-active-dataview-sync' }, { create: false, fallbackActive: false });
    if(ownerSession && !isPieSessionActiveOrActivating(ownerSession)){
      pieDebug('Debug: pie active DataView sync skipped for inactive HOT owner', {
        ownerTabId: ownerSession.tabId || null,
        activeTabId: pie.__boundTabId || null,
        reason: reason || null
      });
      return;
    }
    const manager = hot.__pieDataViewsManager || null;
    if(ownerSession && !pieDataViewsManagerBelongsToSession(manager, ownerSession)){
      return;
    }
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
    pieShowLegendInput = getPieNodeById('pieShowLegend');
    const pieBorderColor=getPieNodeById('pieBorderColor');
    const pieBorderWidth=getPieNodeById('pieBorderWidth');
    const pieShowFrame = getPieNodeById('pieShowFrame');
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

    [pieShowPercents, pieStartAngle, pieFontSize, pieChartType].filter(Boolean).forEach(el => {
      el.addEventListener('input', event => {
        const reason = el?.id ? `${el.id}-change` : 'pie-config-change';
        runPieControlOwner(event, reason, session => {
          pieDebug('pie config changed', el.id, el.value);
          if(el === pieFontSize){
            if(pieFontSize.dataset){
              pieFontSize.dataset.fontBasePt = String(pieFontSize.value);
              pieDebug('Debug: pie font size input manual set',{ value: pieFontSize.value }); // Debug: manual slider update
            }
            chartStyle.renderFontSizeLabel({ element: pieFontSizeVal, pt: Number(pieFontSize.value), input: pieFontSize, manual: true });
          }
          if(el === pieChartType){
            syncPieAspectControls('chart-type-change');
            syncPieStartAngleToolbarVisibility();
          }
          syncPieRuntimeControlsFromDom(session);
          schedulePieViewRefresh(reason, { tabId: session?.tabId || undefined });
        });
      });
    });

    if(pieShowLegendInput){
      const legendHost=pieShowLegendInput.closest('label');
      if(legendHost){
        pieLegendControl=legendHost;
        ensurePieLegendControlPlacement();
      }
      pieShowLegendInput.addEventListener('change', event => {
        runPieControlOwner(event, 'legend-toggle', session => {
          pieDebug('Debug: pie showLegend change',{checked:pieShowLegendInput.checked});
          ensurePieLegendControlPlacement();
          syncPieRuntimeControlsFromDom(session);
          schedulePieViewRefresh('legend-toggle', { tabId: session?.tabId || undefined });
        });
      });
    }

    if(pieShowFrame){
      pieShowFrame.addEventListener('change', event => {
        runPieControlOwner(event, 'frame-toggle', session => {
          pieDebug('Debug: pie showFrame change',{checked:pieShowFrame.checked});
          syncPieRuntimeControlsFromDom(session);
          schedulePieViewRefresh('frame-toggle', { tabId: session?.tabId || undefined });
        });
      });
    }

    if(pieBorderColor){
      pieBorderColor.addEventListener('input', event => {
        runPieControlOwner(event, 'border-color-change', session => {
          pieDebug('Debug: pie border color change',{value: pieBorderColor.value});
          syncPieRuntimeControlsFromDom(session);
          schedulePieViewRefresh('border-color-change', { tabId: session?.tabId || undefined });
        });
      });
    }

    if(pieBorderWidth){
      pieBorderWidth.addEventListener('input', event => {
        runPieControlOwner(event, 'border-width-change', session => {
          pieDebug('Debug: pie border width change',{value: pieBorderWidth.value});
          syncPieRuntimeControlsFromDom(session);
          schedulePieViewRefresh('border-width-change', { tabId: session?.tabId || undefined });
        });
      });
    }

    const pieComputeStatsButton = getPieNodeById('pieComputeStats');
    if(pieComputeStatsButton){
      pieComputeStatsButton.addEventListener('click',handlePieStatsComputeClick);
    }
    clearPieStatsOutputs('Statistics will appear after calculation.');
    setPieStatsStatus('');
    updatePieStatsButtonState({ disabled: true, label: 'Calculate statistics' });

    const example=[ ['Quarter','Observed','Expected'], ['Q1',120,100], ['Q2',90,100], ['Q3',60,80], ['Q4',130,120] ];
    getPieNodeById('pieLoadExample').addEventListener('click', event => {
      runPieControlOwner(event, 'pie-example-load', session => {
        const activeHot = session?.managers?.hot || state.ensureHotForActiveTab?.() || state.hot;
        activeHot?.loadData?.(example, {
          source: 'example-load',
          recordUndo: true,
          undoLabel: 'table:pie:example-load'
        });
        pieDebug('pie example loaded with expected values');
        capturePieSessionStateFromActive(session, { reason: 'pie-example-load', captureStats: false });
        schedulePieDrawForSession(session, { reason: 'pie-example-load', tabId: session?.tabId || undefined });
      });
    });
    const pieImportBtn=getPieNodeById('pieImport');
    const pieFileInput=getPieNodeById('pieFile');
    bindPieControlHandler(pieImportBtn, 'click', 'import-table', ()=>{ pieFileInput.value=''; pieFileInput.click(); });
    bindPieControlHandler(pieFileInput, 'change', 'import-file', async (_event, ownerSession)=>{
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
            importFontStyles('pie', { __graph__: graphStyle }, { tabId: ownerSession?.tabId || pie.__boundTabId || null });
          }
          if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
            pieDebug('Debug: pie prism style applied', { title, fontFamily, fontSize: fontSizeValue, fontColor, axisColor });
          }
          capturePieSessionStateFromActive(ownerSession || getActivePieSessionForState(), { reason: 'import-prism-style', captureStats: false });
          schedulePieDrawForSession(ownerSession || getActivePieSessionForState(), { force: true, reason: 'import-prism-style', tabId: ownerSession?.tabId || undefined });
        };
        const result = await tableImport.openFile(pieFileInput,{
          hot: ownerSession?.managers?.hot || state.ensureHotForActiveTab?.() || state.hot,
          minCols: PIE_DEFAULT_COLS,
          minRows: PIE_DEFAULT_ROWS,
          scheduleDraw: options => schedulePieDrawForSession(ownerSession || getActivePieSessionForState(), { ...(options || {}), reason: options?.reason || 'pie-import-load', tabId: ownerSession?.tabId || undefined }),
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
      const activeWorkspaceTab = global.Main?.session?.workspaceState?.tabs?.find?.(tab => (
        tab && tab.id === global.Main?.session?.workspaceState?.activeTabId
      )) || null;
      if(activeWorkspaceTab?.type === 'pie'){
        bindPieSessionForTab(activeWorkspaceTab.id, {
          tab: activeWorkspaceTab,
          tabId: activeWorkspaceTab.id,
          root: resolvePieRoot(activeWorkspaceTab.id) || state.root || null,
          reason: 'pie-get-payload-active-bind'
        }, { apply: true });
      }
      syncPieRuntimeControlsFromDom();
      const notesSnapshot = capturePieNotesMirror();
      const notesText = notesSnapshot.text || '';
      const notesOpen = !!notesSnapshot.open;
      const activeHot = state.ensureHotForActiveTab?.() || state.hot;
      const activeManager = ensurePieDataViewsForHot(activeHot, {
        wrapper: getPieNodeById('pieHotWrapper'),
        container: activeHot?.__pieHostContainer || getPieNodeById('pieHot')
      });
      syncPieActiveDataViewFromHot(activeHot, 'payload');
      const dataViewsPayload = activeManager?.serialize?.({ includeData: true }) || null;
      const includeDataViews = !!(dataViewsPayload && Array.isArray(dataViewsPayload.views) && dataViewsPayload.views.length > 1);
      const payload = {
        type:'pie',
        data: Shared.hot.trimTrailingEmptyCols(activeHot?.getData?.() || []),
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
      capturePieSessionStateFromActive(getActivePieSessionForState(), {
        reason: 'payload-capture',
        captureStats: true
      });
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
    function syncPieRuntimeControlsFromState(controlSnapshot = {}){
      state.controls = normalizePieRuntimeControls(controlSnapshot || state.controls || {});
      const controls = state.controls;
      const hasControl = key => Object.prototype.hasOwnProperty.call(controls, key);
      refreshPieLegendControlBinding();
      const chartTypeInput = getPieNodeById('pieChartType');
      if(chartTypeInput && hasControl('chartType')){
        const requested = String(controls.chartType || 'pie');
        chartTypeInput.value = requested;
      }
      const showPercentsInput = getPieNodeById('pieShowPercents');
      if(showPercentsInput && hasControl('showPercents')){
        showPercentsInput.checked = !!controls.showPercents;
      }
      const showFrameInput = getPieNodeById('pieShowFrame');
      if(showFrameInput && hasControl('showFrame')){
        showFrameInput.checked = !!controls.showFrame;
      }
      if(pieShowLegendInput && hasControl('showLegend')){
        pieShowLegendInput.checked = controls.showLegend !== false;
        ensurePieLegendControlPlacement();
      }
      const startAngleInput = getPieNodeById('pieStartAngle');
      if(startAngleInput && hasControl('startAngle') && controls.startAngle != null){
        startAngleInput.value = String(controls.startAngle);
      }
      const borderColorInput = getPieNodeById('pieBorderColor');
      if(borderColorInput && hasControl('borderColor') && controls.borderColor){
        borderColorInput.value = String(controls.borderColor);
      }
      const borderWidthInput = getPieNodeById('pieBorderWidth');
      if(borderWidthInput && hasControl('borderWidth') && controls.borderWidth != null){
        borderWidthInput.value = String(controls.borderWidth);
      }
      const fontInput = getPieNodeById('pieFontSize');
      const fontValueLabel = getPieNodeById('pieFontSizeVal');
      if(fontInput && hasControl('fontSize') && controls.fontSize != null){
        fontInput.value = String(controls.fontSize);
        if(fontInput.dataset){
          fontInput.dataset.fontBasePt = String(fontInput.value);
        }
        chartStyle.renderFontSizeLabel({ element: fontValueLabel, pt: Number(fontInput.value), input: fontInput, manual: true });
      }
      syncPieAspectControls('runtime-controls');
    }

    pie.captureRuntimeState = function capturePieRuntimeState(meta = {}){
      const targetTabId = normalizePieSessionTabId(meta?.tab || meta?.tabId || pie.__boundTabId || null, meta);
      const activeTabId = pie.__boundTabId || getActivePieSessionForState()?.tabId || null;
      if(targetTabId && activeTabId && String(targetTabId) !== String(activeTabId)){
        const targetSession = getPieSession(targetTabId, {
          ...(meta || {}),
          tabId: targetTabId,
          reason: meta?.reason || 'pie-runtime-capture-inactive'
        }, { create: false });
        if(targetSession){
          const durable = createDefaultPieDurableState(targetSession.state || {});
          const results = createDefaultPieResultsState(targetSession.results || {});
          const snapshot = {
            state: {
              titleText: durable.titleText,
              legendWidth: durable.legendWidth,
              colors: cloneSimple(durable.colors) || {},
              minSvgWidth: durable.minSvgWidth,
              axisSettings: cloneSimple(durable.axisSettings) || null,
              labelPositions: cloneSimple(durable.labelPositions) || {},
              columnSignature: durable.columnSignature || null,
              statsDataModel: cloneSimple(results.statsDataModel || durable.statsDataModel) || null,
              statsConfig: clonePieStatsConfigForSession(results.statsConfig || durable.statsConfig),
              colorSignature: durable.colorSignature || null,
              xTickRotateVertical: durable.xTickRotateVertical === true,
              bottomViewportExtensionPx: Number.isFinite(Number(durable.bottomViewportExtensionPx)) ? Number(durable.bottomViewportExtensionPx) : 0,
              resizeState: cloneSimple(durable.resizeState) || null,
              controls: cloneSimple(durable.controls) || createDefaultPieRuntimeControls()
            },
            notes: createDefaultPieNotesState(targetSession.notes || {}),
            statsSummaryTabIdCounter: Number(results.statsSummaryTabIdCounter) || 0,
            reason: meta?.reason || 'pie-runtime-capture-inactive'
          };
          rememberPieOwnedRuntimeRecord(targetTabId, snapshot, {
            ...(meta || {}),
            tabId: targetTabId,
            reason: snapshot.reason
          });
          return Shared.componentLifecycle?.rememberComponentRuntimeSnapshot?.(pie, snapshot, {
            ...(meta || {}),
            tabId: targetTabId,
            reason: snapshot.reason
          }) || snapshot;
        }
      }
      syncPieRuntimeControlsFromDom();
      const notesSnapshot = capturePieNotesMirror();
      const notesText = notesSnapshot.text || '';
      const notesOpen = !!notesSnapshot.open;
      if(typeof exportPieStatsConfig === 'function'){
        state.statsConfig = exportPieStatsConfig();
      }
      const snapshot = {
        state: {
          titleText: state.titleText,
          legendWidth: state.legendWidth,
          colors: cloneSimple(state.colors) || {},
          minSvgWidth: state.minSvgWidth,
          axisSettings: cloneSimple(state.axisSettings) || null,
          labelPositions: cloneSimple(state.labelPositions) || {},
          columnSignature: state.columnSignature || null,
          statsDataModel: cloneSimple(state.statsDataModel) || null,
          statsConfig: cloneSimple(state.statsConfig) || null,
          colorSignature: state.colorSignature || null,
          xTickRotateVertical: state.xTickRotateVertical === true,
          bottomViewportExtensionPx: Number.isFinite(Number(state.bottomViewportExtensionPx)) ? Number(state.bottomViewportExtensionPx) : 0,
          resizeState: cloneSimple(state.resizeState) || null,
          controls: cloneSimple(state.controls) || createDefaultPieRuntimeControls()
        },
        notes: { text: notesText, open: notesOpen },
        statsSummaryTabIdCounter: Number(pieStatsSummaryTabIdCounter) || 0,
        reason: meta?.reason || 'pie-runtime-capture'
      };
      pieDebug('Debug: pie runtime snapshot captured', {
        tabId: meta?.tabId || pie.__boundTabId || null,
        title: snapshot.state.titleText,
        notesOpen,
        reason: snapshot.reason
      });
      setPieSessionStateFromRuntimeRecord(snapshot, {
        ...(meta || {}),
        reason: snapshot.reason || meta?.reason || 'pie-runtime-capture'
      });
      syncPieSessionRefsFromActive();
      syncPieSessionManagersFromActive();
      rememberPieOwnedRuntimeRecord(meta?.tab || meta?.tabId || null, snapshot, {
        ...(meta || {}),
        reason: snapshot.reason || meta?.reason || 'pie-runtime-capture'
      });
      return Shared.componentLifecycle?.rememberComponentRuntimeSnapshot?.(pie, snapshot, {
        ...(meta || {}),
        reason: snapshot.reason || meta?.reason || 'pie-runtime-capture'
      }) || snapshot;
    };

    pie.applyRuntimeState = function applyPieRuntimeState(snapshot, meta = {}){
      bindPieSessionForTab(meta?.tab || meta?.tabId || pie.__boundTabId || null, meta, { apply: false });
      snapshot = resolvePieOwnedRuntimeSnapshot(snapshot, meta)
        || Shared.componentLifecycle?.resolveComponentRuntimeSnapshot?.(pie, snapshot, meta)
        || snapshot;
      if(!snapshot || typeof snapshot !== 'object'){
        pieDebug('Debug: pie runtime snapshot apply skipped', { tabId: meta?.tabId || null, reason: 'missing-snapshot' });
        return false;
      }
      if(snapshot.state && typeof snapshot.state === 'object'){
        const nextState = snapshot.state;
        state.titleText = typeof nextState.titleText === 'string' ? nextState.titleText : state.titleText;
        state.legendWidth = Number.isFinite(Number(nextState.legendWidth)) ? Number(nextState.legendWidth) : state.legendWidth;
        state.colors = cloneSimple(nextState.colors) || state.colors || {};
        state.minSvgWidth = Number.isFinite(Number(nextState.minSvgWidth)) ? Number(nextState.minSvgWidth) : state.minSvgWidth;
        state.axisSettings = cloneSimple(nextState.axisSettings) || state.axisSettings;
        state.labelPositions = cloneSimple(nextState.labelPositions) || state.labelPositions || {};
        state.columnSignature = Object.prototype.hasOwnProperty.call(nextState, 'columnSignature') ? (nextState.columnSignature || null) : (state.columnSignature || null);
        if(Object.prototype.hasOwnProperty.call(nextState, 'statsDataModel')){ state.statsDataModel = cloneSimple(nextState.statsDataModel); }
        if(Object.prototype.hasOwnProperty.call(nextState, 'statsConfig')){
          applyPieStatsConfig(nextState.statsConfig || {});
          try{
            const dataModel = state.statsDataModel || buildPieStatsDataModel(getPieStatsDataMatrix());
            state.statsDataModel = dataModel;
            ensurePieStatsSelections(dataModel);
            renderPieStatsControls(dataModel, { force: true, reason: 'runtime-state-apply' });
          }catch(err){
            console.debug('Debug: pie stats controls restore after runtime apply failed', {
              message: err?.message || String(err)
            });
          }
        }
        state.colorSignature = Object.prototype.hasOwnProperty.call(nextState, 'colorSignature') ? (nextState.colorSignature || null) : (state.colorSignature || null);
        if(Object.prototype.hasOwnProperty.call(nextState, 'xTickRotateVertical')){
          state.xTickRotateVertical = nextState.xTickRotateVertical === true;
        }
        state.bottomViewportExtensionPx = Number.isFinite(Number(nextState.bottomViewportExtensionPx))
          ? Math.max(0, Number(nextState.bottomViewportExtensionPx))
          : (Number.isFinite(Number(state.bottomViewportExtensionPx)) ? Math.max(0, Number(state.bottomViewportExtensionPx)) : 0);
        state.lastViewportExtensionRedrawSignature = null;
        state.viewportExtensionResizeInProgress = false;
        state.resizeState = cloneSimple(nextState.resizeState) || state.resizeState;
        normalizePieResizeState();
        syncPieRuntimeControlsFromState(nextState.controls || {});
      }
      if(snapshot.notes && typeof snapshot.notes === 'object'){
        notesState.text = snapshot.notes.text == null ? '' : String(snapshot.notes.text);
        notesState.open = !!snapshot.notes.open;
        if(canUsePieNotesControl(notesState.control)){
          notesState.control.setValue(notesState.text);
          notesState.control.setOpen(notesState.open);
        }
      }
      pieStatsSummaryTabIdCounter = Number(snapshot.statsSummaryTabIdCounter) || pieStatsSummaryTabIdCounter || 0;
      setPieSessionStateFromRuntimeRecord(snapshot, {
        ...(meta || {}),
        reason: meta?.reason || 'pie-runtime-apply'
      });
      syncPieSessionRefsFromActive();
      syncPieSessionManagersFromActive();
      rememberPieOwnedRuntimeRecord(meta?.tab || meta?.tabId || null, snapshot, {
        ...(meta || {}),
        reason: meta?.reason || 'pie-runtime-apply'
      });
      Shared.componentLifecycle?.rememberComponentRuntimeSnapshot?.(pie, snapshot, {
        ...(meta || {}),
        reason: meta?.reason || 'pie-runtime-apply'
      });
      pieDebug('Debug: pie runtime snapshot applied', {
        tabId: meta?.tabId || pie.__boundTabId || null,
        title: state.titleText,
        reason: meta?.reason || 'pie-runtime-apply'
      });
      return true;
    };

    pie.deactivateTab = Shared.componentLifecycle?.createDeactivateHandler?.({
      component: pie,
      componentKey: 'pie',
      cancel: (tab, meta = {}) => {
        capturePieSessionForDeactivation(tab, meta);
        const resizeState = normalizePieResizeState();
        resizeState.active = false;
        resizeState.phase = null;
        resizeState.dragging = false;
      }
    }) || function deactivatePieTab(tab, meta = {}){
      capturePieSessionForDeactivation(tab, meta);
      const resizeState = normalizePieResizeState();
      resizeState.active = false;
      resizeState.phase = null;
      resizeState.dragging = false;
      pie.__runtimeGeneration = (Number(pie.__runtimeGeneration) || 0) + 1;
      pieDebug('Debug: pie tab deactivated', {
        tabId: (tab && typeof tab === 'object' ? tab.id : tab) || meta?.tabId || null,
        generation: pie.__runtimeGeneration,
        reason: meta?.reason || 'deactivate-tab'
      });
      return true;
    };
    pie.captureEmptyPayloadTemplate = function capturePieEmptyPayloadTemplate(){
    const snapshot = pie.createEmptyPayload();
    emptyPayloadTemplate = cloneSimple(snapshot) || snapshot;
    const session = getActivePieSessionForState();
    if(session?.cache){
      session.cache.emptyPayloadTemplate = cloneSimple(emptyPayloadTemplate) || emptyPayloadTemplate;
      session.updatedAt = Date.now();
    }
    pieDebug('Debug: pie empty payload template captured', { hasTemplate: !!snapshot });
    return snapshot;
  };
  pie.restoreEmptyPayloadTemplate = function restorePieEmptyPayloadTemplate(template, options = {}){
    if(!template || typeof template !== 'object'){
      pieDebug('Debug: pie empty payload template restore skipped', { reason: 'invalid-template', options });
      return false;
    }
    emptyPayloadTemplate = cloneSimple(template);
    const session = getActivePieSessionForState();
    if(session?.cache){
      session.cache.emptyPayloadTemplate = cloneSimple(emptyPayloadTemplate) || emptyPayloadTemplate;
      session.updatedAt = Date.now();
    }
    pieDebug('Debug: pie empty payload template restored', { hasTemplate: !!emptyPayloadTemplate, reason: options.reason || 'unspecified' });
    return !!emptyPayloadTemplate;
  };
  pie.createEmptyPayload = function createEmptyPiePayload(){
      console.debug('Debug: pie.createEmptyPayload pure factory invoked', {
        ready: !!pie.ready,
        boundTabId: pie.__boundTabId || null
      });
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
      const payloadTabId = normalizePieSessionTabId(meta?.tab || meta?.tabId || pie.__boundTabId || null, meta || {});
      const payloadSession = payloadTabId
        ? bindPieSessionForTab(payloadTabId, {
            ...(meta || {}),
            tabId: payloadTabId,
            root: resolvePieRoot(payloadTabId) || state.root || null,
            reason: `payload-${source}-bind`
          }, { apply: true })
        : getActivePieSessionForState();
      const previousApplyingPayload = state.applyingPayload === true;
      state.applyingPayload = true;
      try{
      const skipDraw = meta?.skipDraw === true;
      const styleOnly = meta?.styleOnly === true || meta?.colorSchemeOnly === true;
      const skipDataLoad = meta?.skipDataLoad === true || styleOnly;
      const scheduleTargetTab = meta?.tab || meta?.tabId || pie.__boundTabId || null;
      const hasExplicitScheduleTarget = !!(meta?.tab || meta?.tabId);
      const scheduleTargetSession = scheduleTargetTab
        ? getPieSession(scheduleTargetTab, { ...(meta || {}), reason: 'pie-payload-scheduler-owner' }, { create: false, fallbackActive: false })
        : getActivePieSessionForState();
      const canMuteActiveScheduler = hasExplicitScheduleTarget
        ? !!(scheduleTargetSession && isPieSessionActiveOrActivating(scheduleTargetSession))
        : (!scheduleTargetSession || isPieSessionActiveOrActivating(scheduleTargetSession));
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
      if(canUsePieNotesControl(notesState.control)){
        notesState.control.setValue(notesState.text);
        notesState.control.setOpen(notesState.open);
      }
      importFontStyles('pie', config.fontStyles || null);
      state.titleText = typeof config.title === 'string' ? config.title : 'Proportion graph';
      const nextControls = { ...(state.controls || {}) };
      ['chartType', 'startAngle', 'borderColor', 'borderWidth', 'fontSize'].forEach(key => {
        if(config[key] != null){
          nextControls[key] = config[key];
        }
      });
      ['showPercents', 'showFrame', 'showLegend'].forEach(key => {
        if(Object.prototype.hasOwnProperty.call(config, key)){
          nextControls[key] = config[key];
        }
      });
      state.controls = normalizePieRuntimeControls(nextControls);
      syncPieRuntimeControlsFromState(state.controls);
      applyPieStatsConfig({
        ...(config.stats && typeof config.stats === 'object' ? config.stats : {}),
        valueColumn: config.valueColumn ?? config.stats?.valueColumn,
        expectedColumn: config.expectedColumn ?? config.stats?.expectedColumn
      });
      const hasStatsPayload = config.stats && typeof config.stats === 'object';
      if(hasStatsPayload){
        const statsMatrix = getPieStatsDataMatrix();
        if(Array.isArray(statsMatrix)){
          state.columnSignature = statsMatrix.map(row => Array.isArray(row)
            ? row.map(value => value == null ? '' : String(value)).join('\u0002')
            : '').join('\u0001');
        }
        const dataModel = buildPieStatsDataModel(statsMatrix);
        state.statsDataModel = dataModel;
        ensurePieStatsSelections(dataModel);
        renderPieStatsControls(dataModel, { force: true, reason: `payload-${source}-stats-restore` });
        const signature = buildPieStatsContextSignature(dataModel);
        const statsResults = getPieNodeById('pieStatsResults');
        if(statsResults && (config.stats.resultsModel || config.stats.reportModel)){
          if(Shared.statsReporting && typeof Shared.statsReporting.restorePanelModel === 'function'){
            Shared.statsReporting.restorePanelModel(statsResults, config.stats, {
              ensureReportHost: () => ensurePieStatsReportHost(statsResults)
            });
          }else{
            statsResults.textContent = '';
          }
        }
        const statsState = getPieStatsConfig();
        const savedLastRunSignature = typeof config.stats.lastRunSignature === 'string'
          ? config.stats.lastRunSignature
          : null;
        const restoredStatsResults = pieStatsPanelHasRenderedResults();
        if(savedLastRunSignature && restoredStatsResults){
          statsState.contextSignature = signature;
          statsState.lastRunSignature = signature;
          statsState.restorePending = null;
          setPieStatsStatus('Statistics up to date.');
          updatePieStatsButtonState({ disabled: false, label: 'Recalculate statistics' });
          updatePieStatsCorrectionSummary(estimatePieStatsComparisonCount());
        }
      }
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
      if(!skipDraw){
        scheduleActivePieDraw({ reason: `pie-payload-${source}` });
      }
      if(scheduleBackup && state.scheduleDraw === mutedScheduleDraw){
        state.scheduleDraw = scheduleBackup;
      }
      capturePieSessionStateFromActive(payloadSession || getActivePieSessionForState(), {
        reason: `payload-${source}`,
        captureStats: false
      });
      pieDebug('Debug: pie payload applied', { source, rows: dataToLoad.length });
      return true;
      }finally{
        state.applyingPayload = previousApplyingPayload;
      }
    }
    function collectConfig(){
      const axisSettings = ensureAxisSettings();
      const controls = normalizePieRuntimeControls(state.controls || {});
      const borderWidthVal = Number(controls.borderWidth);
      const statsConfig = exportPieStatsConfig();
      return {
        title: state.titleText,
        chartType: controls.chartType,
        showPercents: !!controls.showPercents,
        showFrame: !!controls.showFrame,
        showLegend: controls.showLegend !== false,
        startAngle: controls.startAngle,
        borderColor: controls.borderColor || '#ffffff',
        borderWidth: Number.isFinite(borderWidthVal) ? borderWidthVal : 0,
        fontSize: controls.fontSize || String(DEFAULT_PIE_FONT_SIZE_PT),
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
      const operationSession = getActivePieSessionForState();
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
        setFileHandle: handle => { setPieFileHandleForSession(handle, operationSession); },
        setFileName: name => { setPieFileNameForSession(name, operationSession); capturePieSessionStateFromActive(operationSession, { reason: 'save-file-name', captureStats: false }); }
      });
      pieDebug('Debug: pie.save result', result);
    };
    pie.saveAs = async function(){
      const operationSession = getActivePieSessionForState();
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
        setFileHandle: handle => { setPieFileHandleForSession(handle, operationSession); },
        setFileName: name => { setPieFileNameForSession(name, operationSession); capturePieSessionStateFromActive(operationSession, { reason: 'save-file-name', captureStats: false }); }
      });
      pieDebug('Debug: pie.saveAs result', result);
    };
    pie.open = async function(){
      const operationSession = getActivePieSessionForState();
      pieDebug('Debug: pie.open invoked');
      if(!fileIO || typeof fileIO.openGraphFile !== 'function'){
        console.error('pie.open missing fileIO.openGraphFile');
        return;
      }
      const result = await fileIO.openGraphFile({
        context: 'pie',
        setFileHandle: handle => { setPieFileHandleForSession(handle, operationSession); },
        setFileName: name => { setPieFileNameForSession(name, operationSession); capturePieSessionStateFromActive(operationSession, { reason: 'save-file-name', captureStats: false }); },
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
    getPieNodeById('pieGraphFile').addEventListener('change',e=>{const f=e.target.files[0]; if(f){ const session = getPieSessionForEvent(e, { reason: 'pie-graph-file-input' }, { create: false }) || getActivePieSessionForState(); setPieFileNameForSession(f.name, session); setPieFileHandleForSession(null, session); capturePieSessionStateFromActive(session, { reason: 'file-input-change', captureStats: false }); pie.loadFromFile(f); }});
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
    const p = pieChiSquareUpperTailPValue(chi2, df);
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
        const scientific = Shared.statsReporting?.getPValueFormatScientific?.({
          target: out,
          tabId: pie.__boundTabId || null
        }) === true;
        if(typeof Shared?.formatPValue === 'function'){
          return Shared.formatPValue(val, { scientific, forceScientific: scientific });
        }
        const numeric = Number(val);
        if(scientific) return numeric.toExponential(5);
        return numeric >= 0 && numeric <= 0.0001 ? '<0.0001' : numeric.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
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
          methodsText: `A chi-square goodness-of-fit test compared observed counts across ${observed.length} categories against the supplied expected counts. Observed counts were required to be non-negative and expected counts positive; categories with invalid values were not analyzed. The test used ${df} degrees of freedom and the reporting threshold was p < 0.05.`,
          resultsText: `Chi-square = ${chi2.toFixed(4)}, df = ${df}, p = ${isFinite(p)?formatP(p):'N/A'}.`,
          resultsParts: [`Chi-square = ${chi2.toFixed(4)}, df = ${df}, p = `, { type:'pValue', value:p, fallback:isFinite(p)?String(formatP(p)):'N/A' }, '.'],
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

  function draw(drawOptions = {}){
    const drawSession = ensurePieSessionOwnershipShape(getPieSessionForDrawOptions(drawOptions, { reason: drawOptions?.reason || 'pie-draw-session' }));
    if(drawSession && !isPieSessionActiveOrActivating(drawSession)){
      drawSession.state.drawPending = true;
      drawSession.updatedAt = Date.now();
      return false;
    }
    bindPieSessionForTab(drawSession?.tabId || drawOptions?.tab || drawOptions?.tabId || pie.__boundTabId || null, {
      ...(drawOptions || {}),
      reason: drawOptions?.reason || 'pie-draw-bind'
    }, { apply: false });
    const drawTabId = drawSession?.tabId || drawOptions?.tabId || pie.__boundTabId || null;
    const plotEl = getPieNodeById('piePlot', drawTabId) || getPieNodeById('piePlot');
    if(!plotEl){
      if(drawSession){
        drawSession.state.drawPending = true;
        drawSession.updatedAt = Date.now();
      }
      return false;
    }
    while(plotEl.firstChild) plotEl.removeChild(plotEl.firstChild);
    const controls = normalizePieRuntimeControls(state.controls || {});
    state.controls = controls;
    const type=controls.chartType;
    syncPieAspectControls('draw');
    const drawableFrame = resolvePieDrawableFrame(plotEl);
    const isResizePreview = isPieResizePreviewActive(drawOptions);
    const drawReason = typeof drawOptions?.reason === 'string' ? drawOptions.reason : '';
    const isResizeDrivenDraw = drawReason.startsWith('resize');
    const isResizeViewDraw = isResizeDrivenDraw && drawOptions?.viewOnly === true;
    const pieFontInput=$('#pieFontSize');
    const rawPieFontSize = controls.fontSize || String(DEFAULT_PIE_FONT_SIZE_PT);
    const fontInfo=chartStyle.resolveScaledFontSize({
      rawSize: rawPieFontSize,
      width: drawableFrame.width,
      height: drawableFrame.height,
      svgBox: state.svgBox,
      input: pieFontInput
    });
    const fs=fontInfo.scaledPx || DEFAULT_PIE_FONT_SIZE_PT;
    chartStyle.renderFontSizeLabel({ element: pieFontSizeVal, fontInfo, input: pieFontInput });
    pieDebug('Debug: pie font scaling applied',{
      input:controls.fontSize,
      fontSizePt:fontInfo.pt,
      baseFontPx:fontInfo.px,
      scaledFontPx:fs,
      scale:fontInfo.scaleInfo?.scale,
      containerWidth:drawableFrame.width,
      containerHeight:drawableFrame.height
    });
    const styleScaleInfo=fontInfo.scaleInfo;
    const axisMetrics=chartStyle.createAxisMetrics(fontInfo.px, styleScaleInfo);
    pieDebug('Debug: pie axis metrics',axisMetrics);
    const fontScale=styleScaleInfo?.styleScale || styleScaleInfo?.scale || 1;
    const borderColor = controls.borderColor || '#ffffff';
    const borderWidthBase = Number.parseFloat(controls.borderWidth) || 0;
    const borderWidth = chartStyle.scaleStrokeWidth(borderWidthBase, styleScaleInfo, { context: 'pie-border', min: 0 });
    pieDebug('Debug: pie border settings',{ borderColor, borderWidthBase, borderWidth });
    const showPerc=!!controls.showPercents;
    const showFrame=!!controls.showFrame;
    pieDebug('Debug: pie showFrame state',{showFrame, chartType:type});
    ensurePieLegendControlPlacement();
    const showLegend=controls.showLegend !== false;
    pieDebug('Debug: pie showLegend state',{showLegend, chartType:type});
    const startDeg=parseFloat(controls.startAngle)||0;
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
        if(!isResizeViewDraw){
          applyPieBottomViewportExtension(0, {
            reason: 'pie-stacked-empty-bottom-reserve-reset',
            resizeContainer: true
          });
          state.lastViewportExtensionRedrawSignature = null;
        }
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
        scaleInfo: styleScaleInfo,
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
      const svgWidth=Math.max(50,Math.floor(drawableFrame.width||50));
      const svgHeight=Math.max(50,Math.floor(drawableFrame.height||50));
      const svg=document.createElementNS(NS,'svg');
      svg.setAttribute('id','pieSvg');
      svg.setAttribute('width',String(svgWidth));
      svg.setAttribute('height',String(svgHeight));
      svg.setAttribute('viewBox',`0 0 ${svgWidth} ${svgHeight}`);
      svg.setAttribute('data-pie-base-width', String(svgWidth));
      svg.setAttribute('data-pie-base-height', String(svgHeight));
      applyPieSvgDefaults(svg, { isResizePreview });
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
      const fallbackTickFont = chartStyle.makeFont(fs);
      const fallbackTickFontSize = Number.isFinite(Number(fs)) ? Number(fs) : 12;
      const xTickMeasureProfile = (chartStyle && typeof chartStyle.resolveScopedLabelMeasureFont === 'function')
        ? chartStyle.resolveScopedLabelMeasureFont({ styles: pieFontStyles, role: 'xTick', fallbackPx: fs })
        : { fontSpec: fallbackTickFont, fontSizePx: fallbackTickFontSize };
      const yTickMeasureProfile = (chartStyle && typeof chartStyle.resolveScopedLabelMeasureFont === 'function')
        ? chartStyle.resolveScopedLabelMeasureFont({ styles: pieFontStyles, role: 'yTick', fallbackPx: fs })
        : { fontSpec: fallbackTickFont, fontSizePx: fallbackTickFontSize };
      const tickFont=yTickMeasureProfile.fontSpec;
      const yLabelWidths=yTickLabels.map(lbl=>chartStyle.measureText(lbl,tickFont));
      const maxYLabelWidth=Math.max(...yLabelWidths,0);
      const yTitleText='Percentage';
      const hasYTitle = yTitleText.trim().length > 0;
      const stackedLegendWidthForMargin = stackedLegendVisible ? stackedLegendLayout.legendWidthForMargin : 0;
      let margin=chartStyle.computeBaseMargins({fontSize:fs,legendWidth:stackedLegendWidthForMargin,maxYLabelWidth,hasYTitle,axisMetrics});
      let chartWidth=Math.max(20,svgWidth-margin.left-margin.right);
      let chartHeight=Math.max(20,svgHeight-margin.top-margin.bottom);
      const baseBottom = Number.isFinite(Number(margin.bottom)) ? Number(margin.bottom) : 0;
      const stackedAxisTitleReserve = Math.max(0, (Number(axisMetrics.axisTitleGap) || 0) + fs);
      const stackedBaseBottom = Math.max(0, baseBottom - stackedAxisTitleReserve);
      const previousRotate = state.xTickRotateVertical === true;
      const bottomLayout=chartStyle.computeBottomLayout({
        labels:barHeaders,
        fontSize:fs,
        labelMeasureFont:xTickMeasureProfile.fontSpec,
        labelFontSizePx:xTickMeasureProfile.fontSizePx,
        plotWidth:chartWidth,
        baseBottom: stackedBaseBottom,
        axisMetrics,
        reserveRotatedLabelSpace:true,
        rotationHysteresis:{
          previousRotate,
          enterRatio:1.01,
          exitRatio:1.00
        }
      });
      state.xTickRotateVertical = bottomLayout.shouldRotate === true;
      const requiredBottomViewportExtension = computePieStackedBottomReservePx(bottomLayout, { fontSize: fs });
      margin.bottom = Math.max(stackedBaseBottom, stackedBaseBottom + requiredBottomViewportExtension);
      margin = chartStyle.stabilizeAxisResizeMargins
        ? chartStyle.stabilizeAxisResizeMargins(margin, { svgBox: state.svgBox, scopeId: 'pie' })
        : margin;
      chartWidth=Math.max(20,svgWidth-margin.left-margin.right);
      chartHeight=Math.max(20,svgHeight-margin.top-margin.bottom);
      const shouldDeferBottomReserveSync = isResizeViewDraw;
      let extensionUpdate = {
        changed: false,
        previousExtension: Number.isFinite(Number(state.bottomViewportExtensionPx)) ? Math.max(0, Number(state.bottomViewportExtensionPx)) : 0,
        nextExtension: Number.isFinite(Number(state.bottomViewportExtensionPx)) ? Math.max(0, Number(state.bottomViewportExtensionPx)) : 0
      };
      if(shouldDeferBottomReserveSync){
        pieDebug('Debug: pie bottom reserve sync deferred during active resize', {
          requiredBottomViewportExtension,
          resizePhase: drawOptions?.resizePhase || null
        });
      }else{
        extensionUpdate = applyPieBottomViewportExtension(requiredBottomViewportExtension, {
          reason: 'pie-stacked-bottom-reserve',
          resizeContainer: true
        });
      }
      const extensionChanged = !!extensionUpdate?.changed && !!extensionUpdate?.applied;
      if(extensionChanged){
        const viewportExtensionRedrawSignature = [
          'stacked',
          requiredBottomViewportExtension,
          Math.round(svgWidth),
          Math.round(svgHeight),
          state.xTickRotateVertical ? 'rotated' : 'flat'
        ].join('|');
        const shouldScheduleViewportExtensionRedraw = drawReason !== 'pie-bottom-viewport-extension'
          && !drawReason.startsWith('resize')
          && state.lastViewportExtensionRedrawSignature !== viewportExtensionRedrawSignature;
        if(shouldScheduleViewportExtensionRedraw){
          state.lastViewportExtensionRedrawSignature = viewportExtensionRedrawSignature;
          scheduleActivePieDraw({ viewOnly: true, reason: 'pie-bottom-viewport-extension' });
        }else{
          pieDebug('Debug: pie bottom reserve redraw suppressed', {
            reason: drawReason || null,
            signature: viewportExtensionRedrawSignature,
            previousSignature: state.lastViewportExtensionRedrawSignature || null
          });
        }
      }else{
        state.lastViewportExtensionRedrawSignature = null;
      }
      pieDebug('Debug: pie stacked bottom reserve sync', {
        baseBottom,
        stackedBaseBottom,
        stackedAxisTitleReserve,
        computedBottom: margin.bottom,
        bottomLayoutBottom: bottomLayout.bottom,
        requiredBottomViewportExtension,
        changed: !!extensionUpdate?.changed,
        applied: !!extensionUpdate?.applied
      });
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
          rect.setAttribute('data-pie-trace', '1');
          rect.setAttribute('data-pie-trace-label', String(lab));
          rect.setAttribute('data-pie-trace-mode', 'stacked');
          if(borderWidth > 0){
            rect.setAttribute('stroke', borderColor);
            rect.setAttribute('stroke-width', borderWidth);
            rect.setAttribute('stroke-linejoin', 'round');
          }
          if(!isResizePreview){
            rect.style.cursor = 'pointer';
            rect.addEventListener('click', evt => {
              try{ evt.stopPropagation(); }catch(_err){}
              showPieTraceFormatControls(evt.currentTarget);
            });
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
          applyPieTitleValue(title,nextValue,drawSession);
          recordPieChange('pie:title',previous,nextValue,value=>applyPieTitleValue(title,value,drawSession));
        });
      }
      // Enable drag for title
      if(!isResizePreview && typeof Shared.enableLabelDrag === 'function'){
        Shared.enableLabelDrag(title, svg, {
          onDragEnd: pos => {
            patchPieLabelPosition(drawSession, 'title', { x: pos.x, y: pos.y }, { reason: 'pie-stacked-title-position' });
            pieDebug('Debug: pie title position saved', pos);
          }
        });
      }
      svg.appendChild(title);
      ensurePieViewport(svg, {
        padding: Math.max(fs, 14),
        debugLabel: 'pie-graph',
        fillParent: true,
        preserveBaseAspect: true
      });
      if(!isResizePreview){
        primePieStatsComputation({ matrix: data, reason: 'draw-stacked' });
      }
      return false;
    }

    const header=data[0]||[];
    if(!isResizeViewDraw){
      applyPieBottomViewportExtension(0, {
        reason: 'pie-nonstacked-bottom-reserve-reset',
        resizeContainer: true
      });
      state.lastViewportExtensionRedrawSignature = null;
    }
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
      scaleInfo: styleScaleInfo,
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
    const plotWidth=Math.max(50,Math.floor(drawableFrame.width||50));
    const plotHeight=Math.max(50,Math.floor(drawableFrame.height||50));
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
    svg.setAttribute('data-pie-base-width', String(svgWidth));
    svg.setAttribute('data-pie-base-height', String(svgHeight));
    applyPieSvgDefaults(svg, { isResizePreview });
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
        path.setAttribute('data-pie-trace', '1');
        path.setAttribute('data-pie-trace-label', String(lab));
        path.setAttribute('data-pie-trace-mode', type === 'donut' ? 'donut' : 'pie');
        if(borderWidth > 0){
          path.setAttribute('stroke', borderColor);
          path.setAttribute('stroke-width', borderWidth);
          path.setAttribute('stroke-linejoin', 'round');
        }
        if(!isResizePreview){
          path.style.cursor = 'pointer';
          path.addEventListener('click', evt => {
            try{ evt.stopPropagation(); }catch(_err){}
            showPieTraceFormatControls(evt.currentTarget);
          });
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
        applyPieTitleValue(title,nextValue,drawSession);
        recordPieChange('pie:title',previous,nextValue,value=>applyPieTitleValue(title,value,drawSession));
      });
    }
    if(!isResizePreview && typeof Shared.enableLabelDrag === 'function'){
      Shared.enableLabelDrag(title, svg, {
        onDragEnd: pos => {
          // Store both absolute and relative positions
          const relX = pos.x / svgWidth;
          const relY = pos.y / svgHeight;
          patchPieLabelPosition(drawSession, 'title', { 
            x: pos.x, 
            y: pos.y,
            relX: relX, 
            relY: relY 
          }, { reason: 'pie-title-position' });
          pieDebug('Debug: pie title position saved', { absolute: pos, relative: { relX, relY } });
        }
      });
    }
    svg.appendChild(title);
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
    ensureGraphViewport(svg, {
      padding: Math.max(fs, 14),
      debugLabel: 'pie-graph',
      remeasure: !isResizeDrivenDraw
    });
    if(!isResizePreview){
      primePieStatsComputation({ matrix: data, reason: 'draw-radial' });
    }
    return true;
  }
  pie.draw = function drawPiePublic(options = {}){
    const nextReason = options?.reason || 'pie-draw';
    const drawSession = ensurePieSessionOwnershipShape(getPieSessionForDrawOptions(options, { reason: nextReason }));
    if(drawSession && !isPieSessionActiveOrActivating(drawSession)){
      drawSession.state.drawPending = true;
      drawSession.updatedAt = Date.now();
      return;
    }
    if(Shared.componentLifecycle?.shouldSuppressDraw?.('pie', { ...(options || {}), tabId: options?.tabId || pie.__boundTabId || null, reason: nextReason })){
      pieDebug('Debug: pie draw suppressed by lifecycle', { reason: nextReason, tabId: options?.tabId || pie.__boundTabId || null });
      Shared.componentLifecycle?.emitLifecycleEvent?.({ componentKey: 'pie', tabId: options?.tabId || pie.__boundTabId || null, action: 'draw-suppressed', reason: nextReason, details: { source: 'pie.draw' } });
      return;
    }
    Shared.componentLifecycle?.emitLifecycleEvent?.({ componentKey: 'pie', tabId: options?.tabId || pie.__boundTabId || null, action: 'draw-executed', reason: nextReason, details: { source: 'pie.draw' } });
    const result = draw({ ...(options || {}), tabId: drawSession?.tabId || options?.tabId || undefined, reason: nextReason });
    capturePieSessionStateFromActive(getActivePieSessionForState(), {
      reason: nextReason,
      captureStats: false
    });
    return result;
  };
  function ensurePieDomBindings(tabLike, meta = {}){
    if(typeof Shared.workspaceTabs?.ensureActiveDomBindings !== 'function'){
      return false;
    }
    const result = Shared.workspaceTabs.ensureActiveDomBindings({
      componentKey: 'pie',
      tabLike: tabLike || null,
      meta,
      sentinelSelector: '#pieHot',
      getCurrentRoot: () => state.root || null,
      getCurrentSentinel: () => pie.__domSentinel || null,
      rebind: info => {
        const nextTabId = info?.tab?.id || info?.tabId || (tabLike && typeof tabLike === 'object' ? tabLike.id : tabLike) || null;
        state.root = info?.root || resolvePieRoot(info?.tab || tabLike || null);
        bindPieSessionForTab(info?.tab || nextTabId || tabLike || null, {
          tab: info?.tab || null,
          tabId: nextTabId || null,
          root: state.root || null,
          reason: meta?.reason || 'workspace-dom-rebind'
        }, { apply: false });
        if(meta?.liveDomFastPath === true || meta?.liveDomReuse === true || meta?.passiveControls === true){
          pie.__boundTabId = nextTabId || pie.__boundTabId || null;
          state.svgBox = state.root?.querySelector?.('#pieGraphPanel .svgbox') || state.svgBox || null;
          syncPieSessionRefsFromActive();
          syncPieSessionManagersFromActive();
          pie.__domSentinel = info?.mountedSentinel || getPieNodeById('pieHot');
          pie.ready = true;
          pieDebug('Debug: pie passive DOM rebind', { tabId: pie.__boundTabId || null });
          return;
        }
        pie.ready = false;
        pie.init({ root: state.root || undefined, tabId: nextTabId || null, reason: 'workspace-dom-rebind' });
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
    if(canUsePieNotesControl(notesState.control)){
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
        capturePieSessionStateFromActive(getActivePieSessionForState(), {
          reason: 'notes-change',
          captureStats: false,
          syncControls: false
        });
      },
      onToggle: open => {
        notesState.open = !!open;
        capturePieSessionStateFromActive(getActivePieSessionForState(), {
          reason: 'notes-toggle',
          captureStats: false,
          syncControls: false
        });
      }
    });
    syncPieSessionRefsFromActive();
  }
  pie.init = function init(options = {}){
    const targetTabId = options?.tabId || pie.__boundTabId || null;
    const targetRoot = options?.root || resolvePieRoot(targetTabId || null) || state.root || null;
    bindPieSessionForTab(targetTabId || options?.tab || null, {
      ...(options || {}),
      tabId: targetTabId || null,
      root: targetRoot || null,
      reason: options?.reason || 'pie-init'
    }, { apply: false });
    if(pie.ready && (!targetTabId || pie.__boundTabId === targetTabId) && (!targetRoot || state.root === targetRoot)){
      pieDebug('Debug: Components.pie.init skipped (already ready)', { tabId: pie.__boundTabId || null });
      return;
    }
    if(pie.ready){
      pieDebug('Debug: Components.pie.init rebinding', { previousTabId: pie.__boundTabId || null, targetTabId, reason: options?.reason || 'init' });
      pie.ready = false;
    }
    pie.__boundTabId = targetTabId || null;
    pieDebug('Debug: Components.pie.init', { tabId: pie.__boundTabId || null });
    state.root = targetRoot || resolvePieRoot();
    if(activePieSession){
      activePieSession.root = state.root || activePieSession.root || null;
      activePieSession.refs.root = state.root || activePieSession.refs.root || null;
    }
    // Placeholder to avoid early resizer callbacks failing
    state.scheduleDraw = ()=>{};
    const schedulePieLayoutDraw = (meta) => {
      const resizeState = normalizePieResizeState();
      const phase = resizeState.phase;
      const muteUntil = Number(resizeState.observeMuteUntil) || 0;
      if(phase === 'move' || (phase === 'observe' && resizeState.dragging)){
        return;
      }
      if(Date.now() <= muteUntil){
        pieDebug('Debug: pie layout draw muted during resize finalize window', {
          phase: phase || null,
          muteUntil
        });
        return;
      }
      // Forward the componentLayout scheduleMeta so panel-drag user resizes keep
      // their userInitiated flag through the tab-scoped scheduler's suppression gate.
      scheduleActivePieDraw(meta && typeof meta === 'object' ? meta : undefined);
    };
    const schedulePieResizeDraw = phase => {
      const resizeState = updatePieResizeStateForPhase(phase);
      const currentPhase = typeof phase === 'string' ? phase : '';
      if(
        currentPhase === 'observe'
        && (resizeState.dragging || Date.now() <= (Number(resizeState.observeMuteUntil) || 0))
      ){
        return;
      }
      // Route through the shared view-refresh contract so resize redraws carry
      // userInitiated/forceDraw and survive the post-restore suppression after reopen.
      schedulePieViewRefresh('resize', {
        resizePhase: currentPhase || null,
        force: PIE_RESIZE_FINALIZE_PHASES.has(currentPhase)
      });
    };
    state.layout = Shared.componentLayout?.createStandardPanels({
      componentName: 'pie',
        tabId: targetTabId || undefined,
        root: state.root || undefined,
        reason: options?.reason || 'pie-init',
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
    Shared.componentLifecycle?.scheduleComponentFrame?.(pie, 'pie', {
      tabId: pie.__boundTabId || null,
      reason: 'pie-legend-placement'
    }, () => ensurePieLegendControlPlacement());
    initHot();
    initControls();
    initNotes();
    primePieStatsComputation({ matrix: getPieStatsDataMatrix(), reason: 'init' });
    const schedulePieBase = Shared.componentLifecycle?.createTabScopedFrameDebouncer
      ? Shared.componentLifecycle.createTabScopedFrameDebouncer(pie, 'pie', draw, { reason: 'pie-draw-frame' })
      : draw;
    state.scheduleDraw = Shared.workspaceTabs?.createTabScopedScheduler
      ? Shared.workspaceTabs.createTabScopedScheduler({
          componentKey: 'pie',
          debugLabel: 'pie',
          getTabId: () => pie.__boundTabId || null,
          scheduleRaw: schedulePieBase
        })
      : schedulePieBase;
    ensurePieFontEventListener();
    pieDebug('Debug: pie scheduleDraw configured via tab-scoped lifecycle frame'); // Debug: scheduler setup
    state.layout?.setScheduleDraw?.(schedulePieLayoutDraw);
    scheduleActivePieDraw({ reason: 'pie-init-complete' });
    ensureEmptyPayloadTemplate();
    syncPieSessionRefsFromActive();
    syncPieSessionManagersFromActive();
    capturePieSessionStateFromActive(getActivePieSessionForState(), {
      reason: 'pie-init-complete',
      captureStats: false
    });
    pie.__domSentinel = getPieNodeById('pieHot');
    pie.ready = true;
  };

  pie.ensure = function ensure(options = {}){
    if(ensurePieDomBindings(options.tab || options.tabId || null, options || {})){
      return;
    }
    if (!pie.ready) pie.init({ ...options, tabId: options.tabId || options.tab?.id || pie.__boundTabId || undefined, reason: options.reason || 'ensure' });
  };
  pie.activateTab = Shared.componentLifecycle?.bindTabActivation?.({
    component: pie,
    componentKey: 'pie',
    resolveRoot: tabLike => resolvePieRoot(tabLike || null),
    setRoot: root => { state.root = root; },
    ensureBindings: (tabLike, meta) => ensurePieDomBindings(tabLike, meta),
    init: options => pie.init(options),
    afterReady: (tabLike, meta = {}) => {
      bindPieSessionForTab(tabLike || meta?.tabId || null, {
        ...(meta || {}),
        reason: meta?.reason || 'pie-activate-session-bind'
      }, { apply: true });
      applyExistingPieOwnedRuntimeRecord(tabLike || meta?.tabId || null, { ...(meta || {}), reason: meta?.reason || 'pie-activate-apply-owned-runtime' });
      if(typeof state.ensureHotForActiveTab === 'function'){
        state.ensureHotForActiveTab();
      }
      ensurePieLegendControlPlacement();
      syncPieSessionRefsFromActive();
      syncPieSessionManagersFromActive();
    },
    getSentinel: () => getPieNodeById('pieHot')
  }) || function activateTab(tab, meta = {}){
    const targetTabId = (tab && typeof tab === 'object' ? tab.id : tab) || meta?.tabId || null;
    pie.__boundTabId = targetTabId || pie.__boundTabId || null;
    state.root = resolvePieRoot(tab || targetTabId || null);
    bindPieSessionForTab(tab || targetTabId || null, {
      ...(meta || {}),
      tabId: targetTabId || null,
      root: state.root || null,
      reason: meta?.reason || 'pie-activate-session-bind'
    }, { apply: true });
    if(ensurePieDomBindings(tab)){ return; }
    if(!pie.ready){ pie.init({ root: state.root || undefined, tabId: targetTabId || undefined, reason: meta?.reason || 'activate-tab' }); return; }
    if(typeof state.ensureHotForActiveTab === 'function'){ state.ensureHotForActiveTab(); }
    ensurePieLegendControlPlacement();
    syncPieSessionRefsFromActive();
    syncPieSessionManagersFromActive();
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
    const count = Number(payload.count);
    const hasChildNodes = !!(payload.fragment && payload.fragment.childNodes && payload.fragment.childNodes.length);
    if(Number.isFinite(count) && count <= 0 && !hasChildNodes){ return false; }
    while(node.firstChild){
      node.removeChild(node.firstChild);
    }
    node.appendChild(payload.fragment);
    return true;
  }

  function pieSvgHasMeaningfulContent(svg){
    if(!svg){ return false; }
    const meaningful = Array.from(svg.children || []).some(child => {
      const name = String(child?.tagName || '').toLowerCase();
      return name && name !== 'defs' && name !== 'style' && name !== 'title' && name !== 'desc';
    });
    return meaningful || String(svg.textContent || '').trim().length > 0;
  }

  function piePlotHasMeaningfulGraph(plot){
    if(!plot || typeof plot.querySelector !== 'function'){ return false; }
    const svg = plot.querySelector('#pieSvg') || plot.querySelector('svg');
    if(svg && pieSvgHasMeaningfulContent(svg)){ return true; }
    const canvas = plot.querySelector('canvas');
    return !!(canvas && (Number(canvas.width) > 0 || Number(canvas.height) > 0));
  }

  function pieFragmentPayloadHasGraph(payload){
    if(!payload || typeof payload !== 'object'){ return false; }
    const fragment = payload.fragment || null;
    if(fragment && typeof fragment.querySelector === 'function'){
      const svg = fragment.querySelector('#pieSvg') || fragment.querySelector('svg');
      if(svg && pieSvgHasMeaningfulContent(svg)){
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
        return /<svg\b/i.test(markup) || /id=["']pieSvg["']/i.test(markup) || /<canvas\b/i.test(markup);
      });
    }
    return false;
  }

  function getPieRenderCacheOwner(meta = {}, reason = 'pie-render-cache'){
    const source = meta && typeof meta === 'object' ? meta : {};
    const session = ensurePieSessionOwnershipShape(source.session)
      || getPieSession(source.tab || source.tabId || source.workspaceTabId || null, {
        ...source,
        reason
      }, { create: true })
      || getActivePieSessionForState();
    if(session && !isPieSessionActiveOrActivating(session)){
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        pieDebug('Debug: pie render cache skipped for inactive owner', {
          reason,
          ownerTabId: session.tabId || null,
          activeTabId: pie.__boundTabId || activePieSession?.tabId || null
        });
      }
      return null;
    }
    return session;
  }

  pie.captureRenderCache = function captureRenderCache(meta = {}){
    const owner = getPieRenderCacheOwner(meta, 'pie-render-cache-capture');
    if(!owner){ return null; }
    let plot = getPieNodeById('piePlot');
    const activeHot = state.ensureHotForActiveTab?.() || state.hot;
    const hasGraphBeforeCapture = piePlotHasMeaningfulGraph(plot);
    if(!hasGraphBeforeCapture && hasPiePlottableData(activeHot)){
      try{
        draw();
        pieDebug('Debug: pie render cache capture self-healed blank graph before capture');
      }catch(err){
        console.error('pie captureRenderCache self-heal draw failed', err);
      }
      plot = getPieNodeById('piePlot');
    }
    if(!plot || !piePlotHasMeaningfulGraph(plot)){
      pieDebug('Debug: pie render cache capture skipped', {
        reason: !plot ? 'missing-plot-host' : 'empty-graph',
        tabId: pie.__boundTabId || null
      });
      return null;
    }
    const plotCache = detachChildren(plot);
    if(!pieFragmentPayloadHasGraph(plotCache)){
      restoreChildren(plot, plotCache);
      pieDebug('Debug: pie render cache capture skipped', {
        reason: 'empty-runtime-cache',
        tabId: pie.__boundTabId || null
      });
      return null;
    }
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      pieDebug('Debug: pie render cache captured', {
        plotNodes: plotCache?.count || 0
      });
    }
    // Render cache carries the graph only; the stats panel is rebuilt from state on
    // restore (see restoreRenderCache), so it is not snapshotted as DOM.
    return { plot: plotCache };
  };

  pie.canRestoreRenderCache = function canRestoreRenderCache(cache, meta = {}){
    return Shared.componentLifecycle?.validateRenderCache?.(cache, meta, {
      componentKey: 'pie',
      graph: { selectors: ['#pieSvg', 'svg', 'canvas'], markupPattern: /(<svg\b|id=["']pieSvg["']|<canvas\b)/i },
      requireGraph: true
    }) ?? !!cache;
  };

  pie.isIdleForSnapshot = function isIdleForSnapshot(meta = {}){
    const owner = getPieSession(meta?.session || meta?.tab || meta?.tabId || null, {
      ...(meta || {}),
      reason: meta?.reason || 'pie-idle-snapshot'
    }, { create: false }) || getActivePieSessionForState();
    if(owner && !isPieSessionActiveOrActivating(owner)){
      return !(owner.state?.resizeState && owner.state.resizeState.active);
    }
    return !(state.resizeState && state.resizeState.active);
  };

  pie.awaitReadyForSnapshot = function awaitReadyForSnapshot(meta = {}){
    return Shared.componentLifecycle?.awaitReadyForSnapshot?.(pie, { ...meta, componentKey: 'pie' })
      || Promise.resolve({ ok: true, skipped: true, reason: 'missing-componentLifecycle' });
  };

  pie.restoreRenderCache = function restoreRenderCache(cache, meta = {}){
    if(!cache){ return false; }
    const owner = getPieRenderCacheOwner(meta, 'pie-render-cache-restore');
    if(!owner){ return false; }
    const graphCachePayload = cache?.[cache?.__graphitixRenderCache?.graphicKey] || cache?.plot || cache?.preview || cache?.graph || cache?.svg || cache?.stage;
    const plot = getPieNodeById('piePlot');
    const restoredPlot = restoreChildren(plot, graphCachePayload);
    const hasGraph = piePlotHasMeaningfulGraph(plot);
    if(!restoredPlot || !hasGraph){
      pieDebug('Debug: pie render cache restore rejected after restore', {
        reason: !restoredPlot ? 'plot-not-restored' : 'empty-restored-graph',
        plot: restoredPlot,
        hasGraph
      });
      return false;
    }
    const restored = true;
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      pieDebug('Debug: pie render cache restored', {
        restored,
        plot: restoredPlot,
        hasGraph
      });
    }
    try{
      const matrix = getPieStatsDataMatrix();
      const dataModel = buildPieStatsDataModel(matrix);
      state.statsDataModel = dataModel;
      ensurePieStatsSelections(dataModel);
      renderPieStatsControls(dataModel, { reason: 'render-cache-restore' });
      const statsState = getPieStatsConfig();
      if(pieStatsPanelHasRenderedResults()){
        const signature = buildPieStatsContextSignature(dataModel);
        statsState.contextSignature = signature;
        statsState.lastRunSignature = signature;
        statsState.restorePending = null;
        setPieStatsStatus('Statistics up to date.');
        updatePieStatsButtonState({ disabled: false, label: 'Recalculate statistics' });
        updatePieStatsCorrectionSummary(estimatePieStatsComparisonCount());
      }else{
        primePieStatsComputation({ matrix, reason: 'render-cache-restore' });
      }
    }catch(err){
      console.error('pie render cache stats reconcile error', err);
    }
    return restored;
  };
  function resolvePiePreviewSourceSvg(tab){
    const tabId = normalizePieSessionTabId(tab || null, {
      reason: 'pie-preview-source'
    }) || null;
    const activeTabId = pie.__boundTabId || Shared.workspaceTabs?.getActiveSessionInfo?.('pie')?.tabId || null;
    const renderCache = tab?.renderCache?.cache || tab?.archiveRenderCache?.cache || null;
    const cachePayload = renderCache?.[renderCache?.__graphitixRenderCache?.graphicKey]
      || renderCache?.plot
      || renderCache?.preview
      || renderCache?.graph
      || renderCache?.svg
      || renderCache?.stage
      || null;
    const cachedFragment = cachePayload?.fragment || null;
    if(tabId && activeTabId && String(tabId) !== String(activeTabId) && cachedFragment && typeof cachedFragment.querySelector === 'function'){
      const cachedSvg = cachedFragment.querySelector('#piePlot svg#pieSvg')
        || cachedFragment.querySelector('svg#pieSvg')
        || cachedFragment.querySelector('svg')
        || null;
      if(cachedSvg){
        return cachedSvg;
      }
    }
    const mountedRoot = Shared.workspaceTabs?.getMountedRoot?.(tabId || tab || null, 'pie') || null;
    if(!mountedRoot || typeof mountedRoot.querySelector !== 'function'){
      if(!tabId || !activeTabId || String(tabId) === String(activeTabId)){
        const activeRoot = state.root || getPieNodeById('piePage') || global.document;
        if(activeRoot && typeof activeRoot.querySelector === 'function'){
          return activeRoot.querySelector('#piePlot svg#pieSvg')
            || activeRoot.querySelector('#piePlot svg')
            || activeRoot.querySelector('.svgbox svg')
            || null;
        }
      }
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
    computeRadialPercentLabelLayout: options => computeRadialPercentLabelLayout(options || {}),
    resolveDrawableFrame: plot => resolvePieDrawableFrame(plot)
  });



  Shared.componentLifecycle?.installInternalStateBridge?.(pie, {
    componentKey: 'pie',
    targets: [
      { key: 'state', get: () => state, excludeKeys: ['hot', 'root', 'svg', 'svgBox', 'resizeState'] },
      { key: 'activePieSession', get: () => activePieSession, excludeKeys: ['root', 'refs', 'listeners', 'timers', 'workers', 'managers'] },
      { key: 'notesState', get: () => notesState, excludeKeys: ['control'] }
    ]
  });
})(window);
