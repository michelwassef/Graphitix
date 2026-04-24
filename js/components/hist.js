// Histogram component module
// Exposes: window.Components.hist = { init(root), draw(), save(), open(), loadFromFile(file) }
(function(global){
  'use strict';
  const NS='http://www.w3.org/2000/svg';
  const HIST_DEFAULT_ROWS=100;
  const HIST_DEFAULT_COLS=1;
  const HIST_AUTO_DRAW_ROW_THRESHOLD = 5000;
  const HIST_AUTO_DRAW_COL_THRESHOLD = 5000;
  const HIST_AUTO_DRAW_CELL_THRESHOLD = 50000;
  const HIST_DATA_VIEW_MAX = 12;
  const HIST_TRANSFORM_SCOPE_DEFAULT = Object.freeze({
    headerRows: 1,
    startCol: 0
  });
  let emptyPayloadTemplate = null;

  function seedHistDefaultHeaderRow(matrix){
    if(!Array.isArray(matrix) || !Array.isArray(matrix[0])){
      return matrix;
    }
    if(matrix[0].length > 0){
      matrix[0][0] = 'Values';
    }
    return matrix;
  }

  function ensureHistDefaultHeaderRow(hotInstance){
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
    const current = headerRow[0] != null ? String(headerRow[0]).trim() : '';
    if(current){
      return false;
    }
    hot.setDataAtCell([[0, 0, 'Values']], 'hist-default-header-seed');
    return true;
  }

  function cloneSimple(value){
    if(!value) return null;
    try{
      return JSON.parse(JSON.stringify(value));
    }catch(err){
      console.error('hist cloneSimple error', err);
      return null;
    }
  }

  function ensureEmptyPayloadTemplate(){
    if(emptyPayloadTemplate){
      return;
    }
    emptyPayloadTemplate = { type: 'hist', config: {} };
  }
  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};

  function histDebug(message, ...rest){
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

  const hist = Components.hist = Components.hist || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  const fontControls = Shared.fontControls = Shared.fontControls || {};
  const additionalLineControls = Shared.additionalLineControls = Shared.additionalLineControls || {};
  if((typeof additionalLineControls.show !== 'function' || typeof additionalLineControls.registerAdditionalLineElement !== 'function') && typeof require === 'function'){
    try{
      require('../shared/additionalLineControls.js');
    }catch(err){
      histDebug('Debug: hist component additionalLineControls helper require failed', { message: err?.message || String(err) });
    }
  }
  let histRenderRowEl = null;
  let histRenderButtonEl = null;
  let histAutoDrawNoticeEl = null;
  let histAutoDrawManager = null;
  let scheduleDrawHistRaw = () => {};
  const exportFontStyles = scopeId => (fontControls && typeof fontControls.exportScopeStyles === 'function')
    ? fontControls.exportScopeStyles(scopeId)
    : null;
  const importFontStyles = (scopeId, styles) => {
    if(fontControls && typeof fontControls.importScopeStyles === 'function'){
      fontControls.importScopeStyles(scopeId, styles, { prune: true });
    }
  };
  const axisControls = Shared.axisControls = Shared.axisControls || {};
  const gridControls = Shared.gridControls = Shared.gridControls || {};
  if((typeof gridControls.show !== 'function' || typeof gridControls.registerGraphElement !== 'function') && typeof require === 'function'){
    try{
      require('../shared/gridControls.js');
    }catch(err){
      histDebug('Debug: hist component gridControls helper require failed', { message: err?.message || String(err) });
    }
  }
  const notesHelper = Shared.notes = Shared.notes || {};
  if(typeof notesHelper.mountFoldable !== 'function' && typeof require === 'function'){
    try{
      require('../shared/notes.js');
    }catch(err){
      histDebug('Debug: hist component notes helper require failed', { message: err?.message || String(err) });
    }
  }
  const dataTransformsApi = Shared.dataTransforms = Shared.dataTransforms || {};
  if(typeof dataTransformsApi.applyTransform !== 'function' && typeof require === 'function'){
    try{
      require('../shared/dataTransforms.js');
    }catch(err){
      histDebug('Debug: hist component dataTransforms helper require failed', { message: err?.message || String(err) });
    }
  }
  const dataViewsApi = Shared.dataViews = Shared.dataViews || {};
  if(typeof dataViewsApi.createManager !== 'function' && typeof require === 'function'){
    try{
      require('../shared/dataViews.js');
    }catch(err){
      histDebug('Debug: hist component dataViews helper require failed', { message: err?.message || String(err) });
    }
  }
  hist.__installed = true; // signal to legacy code to skip
  hist.ready = false; // set true after successful init
  const fileIO = Shared.fileIO = Shared.fileIO || {};
  if(!fileIO.saveGraphFile){
    histDebug('Debug: hist component awaiting Shared.fileIO helpers');
  }
  if(!Shared.tableImport || typeof Shared.tableImport.openFile !== 'function'){
    histDebug('Debug: hist component awaiting Shared.tableImport helpers');
  }

  const ensureGraphViewport = Shared.graphViewport?.createEnsurer
    ? Shared.graphViewport.createEnsurer('hist')
    : (svg, options = {}) => {
      const fn = Shared.ensureGraphViewport || Shared.autoResizeSvg || global.ensureGraphViewport || global.autoResizeSvg;
      if(typeof fn === 'function'){
        fn(svg, { component: 'hist', debugLabel: 'hist-viewport-fallback', ...options });
        return;
      }
      histDebug('Debug: hist ensureGraphViewport helper missing', {
        hasShared: !!Shared,
        hasAutoResize: typeof Shared?.autoResizeSvg === 'function'
      });
    };
  histDebug('Debug: hist graph viewport helper configured', {
    hasGraphViewport: typeof Shared.graphViewport?.ensure === 'function',
    usesFactory: typeof Shared.graphViewport?.createEnsurer === 'function'
  });

  const DEFAULT_AXIS_COLOR = '#000000';
  const DEFAULT_GRID_COLOR = '#dddddd';
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

  function createDefaultAxisSettings(){
    return {
      strokeWidth: 1,
      color: DEFAULT_AXIS_COLOR,
      x: { tickInterval: null, minorTicks: false, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS, notation: 'decimal' },
      y: { tickInterval: null, minorTicks: false, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS, notation: 'decimal' }
    };
  }

  function sanitizeHistAxisNotation(value){
    if(value === 'auto' || value === 'decimal' || value === 'scientific'){ return value; }
    return 'decimal';
  }

  function readNumericInputValue(input){
    if(!input){
      return null;
    }
    const raw = String(input.value ?? '').trim();
    if(!raw){
      return null;
    }
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function writeNumericInputValue(input, value){
    if(!input){
      return;
    }
    if(value === null || value === undefined || value === ''){
      input.value = '';
      return;
    }
    const numeric = Number(value);
    input.value = Number.isFinite(numeric) ? String(numeric) : '';
  }

  function readHistAxisLimitsFromInputs(){
    return {
      xMin: readNumericInputValue(getHistNodeById('histXMin')),
      xMax: readNumericInputValue(getHistNodeById('histXMax')),
      yMax: readNumericInputValue(getHistNodeById('histYMax'))
    };
  }

  function applyHistAxisLimitsToInputs(limits){
    const source = limits && typeof limits === 'object' ? limits : {};
    writeNumericInputValue(getHistNodeById('histXMin'), source.xMin);
    writeNumericInputValue(getHistNodeById('histXMax'), source.xMax);
    writeNumericInputValue(getHistNodeById('histYMax'), source.yMax);
  }

  const DEFAULT_DISTRIBUTION_COLORS = ['#d95f02', '#1b9e77', '#7570b3', '#e7298a', '#66a61e'];

  function createDefaultDistributionSettings(){
    return {
      selections: { normal: true },
      showPdf: true,
      showCdf: false,
      alpha: 0.05
    };
  }

  function createDefaultHistStatsSettings(){
    return {
      diagnosticsMode: 'normal-vs-lognormal',
      comparisonMode: 'ks'
    };
  }

  function sanitizeHistDiagnosticsMode(value){
    return value === 'off' || value === 'normal-fit'
      ? value
      : 'normal-vs-lognormal';
  }

  function sanitizeHistComparisonMode(value){
    return value === 'off' ? 'off' : 'ks';
  }

  function mergeDistributionSelections(current, options){
    const merged = { ...current };
    options.forEach((opt, index) => {
      if(!(opt.key in merged)){
        merged[opt.key] = index === 0;
      }
    });
    return merged;
  }

  function getDistributionOptions(){
    const statsHelpers = Shared.stats || {};
    if(typeof statsHelpers.listContinuousDistributions === 'function'){
      try{
        const list = statsHelpers.listContinuousDistributions();
        if(Array.isArray(list) && list.length){
          return list.map((entry, index) => ({
            key: entry.key,
            label: entry.label || entry.key,
            color: entry.color || DEFAULT_DISTRIBUTION_COLORS[index % DEFAULT_DISTRIBUTION_COLORS.length]
          }));
        }
      }catch(err){
        console.warn('hist distribution list error', err);
      }
    }
    return [
      { key: 'normal', label: 'Normal', color: DEFAULT_DISTRIBUTION_COLORS[0] },
      { key: 'lognormal', label: 'Log-normal', color: DEFAULT_DISTRIBUTION_COLORS[1] },
      { key: 'exponential', label: 'Exponential', color: DEFAULT_DISTRIBUTION_COLORS[2] }
    ];
  }

  function sanitizeDistributionOptionEntry(entry, index, fallback){
    const source = entry && typeof entry === 'object' ? entry : {};
    const fallbackOption = fallback && typeof fallback === 'object' ? fallback : {};
    const fallbackKey = fallbackOption.key || `dist-${index + 1}`;
    const key = (source.key == null ? fallbackKey : String(source.key)).trim() || fallbackKey;
    const label = (source.label == null ? (fallbackOption.label || key) : String(source.label)).trim() || (fallbackOption.label || key);
    const fallbackColor = fallbackOption.color || DEFAULT_DISTRIBUTION_COLORS[index % DEFAULT_DISTRIBUTION_COLORS.length];
    const color = (typeof source.color === 'string' && source.color.trim()) ? source.color.trim() : fallbackColor;
    const strokeWidthRaw = Number(source.strokeWidth);
    const strokeWidth = Number.isFinite(strokeWidthRaw) && strokeWidthRaw > 0
      ? strokeWidthRaw
      : (Number.isFinite(Number(fallbackOption.strokeWidth)) && Number(fallbackOption.strokeWidth) > 0 ? Number(fallbackOption.strokeWidth) : undefined);
    const pattern = sanitizeHistOverlayPattern(source.pattern || fallbackOption.pattern || 'solid');
    const alphaRaw = Number(source.alpha);
    const alpha = Number.isFinite(alphaRaw)
      ? Math.max(0, Math.min(1, alphaRaw))
      : (Number.isFinite(Number(fallbackOption.alpha)) ? Math.max(0, Math.min(1, Number(fallbackOption.alpha))) : undefined);
    const out = { key, label, color };
    if(Number.isFinite(strokeWidth) && strokeWidth > 0){
      out.strokeWidth = strokeWidth;
    }
    if(pattern){
      out.pattern = pattern;
    }
    if(Number.isFinite(alpha)){
      out.alpha = alpha;
    }
    return out;
  }

  function mergeDistributionOptions(baseOptions, configured){
    const defaults = Array.isArray(baseOptions) ? baseOptions : [];
    const incoming = Array.isArray(configured) ? configured : [];
    const byKey = {};
    defaults.forEach((entry, index) => {
      const normalized = sanitizeDistributionOptionEntry(entry, index, entry);
      byKey[normalized.key] = normalized;
    });
    incoming.forEach((entry, index) => {
      const fallback = byKey[String(entry?.key || '').trim()] || defaults[index] || {};
      const normalized = sanitizeDistributionOptionEntry(entry, index, fallback);
      byKey[normalized.key] = Object.assign({}, fallback, normalized);
    });
    return Object.keys(byKey).map((key, index) => sanitizeDistributionOptionEntry(byKey[key], index, byKey[key]));
  }

  function getActiveDistributionKeys(){
    const selections = state.distributionSettings?.selections || {};
    return Object.keys(selections).filter(key => selections[key]);
  }

  const HIST_PLOT_MODE_HISTOGRAM = 'histogram';
  const HIST_PLOT_MODE_DENSITY = 'density';
  const HIST_FREQUENCY_CREATE_MODE = Object.freeze({
    frequency: 'frequency',
    cumulative: 'cumulative'
  });
  const HIST_FREQUENCY_TABULATE_MODE = Object.freeze({
    count: 'count',
    fraction: 'fraction',
    percent: 'percent'
  });
  const HIST_BINNING_MODE = Object.freeze({
    count: 'count',
    auto: 'auto',
    width: 'width',
    exact: 'exact'
  });
  const HIST_FREQUENCY_TABLE_TRANSFORM = 'histFrequencyTable';
  const HIST_LOAD_SOURCE_DATA_VIEW_SWITCH = 'hist-data-view-switch';
  const HIST_LOAD_SOURCE_FREQUENCY_SYNC = 'hist-frequency-view-sync';
  const HIST_LOAD_SOURCE_FREQUENCY_TAB_ACTIVATE = 'hist-frequency-tab-activate';

  function normalizeHistPlotMode(value){
    return String(value || '').toLowerCase() === HIST_PLOT_MODE_DENSITY
      ? HIST_PLOT_MODE_DENSITY
      : HIST_PLOT_MODE_HISTOGRAM;
  }

  function sanitizeHistFrequencyCreateMode(value){
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === HIST_FREQUENCY_CREATE_MODE.cumulative
      ? HIST_FREQUENCY_CREATE_MODE.cumulative
      : HIST_FREQUENCY_CREATE_MODE.frequency;
  }

  function sanitizeHistFrequencyTabulateMode(value){
    const normalized = String(value || '').trim().toLowerCase();
    if(normalized === HIST_FREQUENCY_TABULATE_MODE.fraction){
      return HIST_FREQUENCY_TABULATE_MODE.fraction;
    }
    if(normalized === HIST_FREQUENCY_TABULATE_MODE.percent){
      return HIST_FREQUENCY_TABULATE_MODE.percent;
    }
    return HIST_FREQUENCY_TABULATE_MODE.count;
  }

  function sanitizeHistBinningMode(value){
    const normalized = String(value || '').trim().toLowerCase();
    if(normalized === HIST_BINNING_MODE.auto){
      return HIST_BINNING_MODE.auto;
    }
    if(normalized === HIST_BINNING_MODE.width){
      return HIST_BINNING_MODE.width;
    }
    if(normalized === HIST_BINNING_MODE.exact){
      return HIST_BINNING_MODE.exact;
    }
    return HIST_BINNING_MODE.count;
  }

  function sanitizeOptionalFinite(value){
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function sanitizePositiveFinite(value){
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
  }

  function createDefaultHistFrequencySettings(){
    return {
      createMode: HIST_FREQUENCY_CREATE_MODE.frequency,
      tabulateMode: HIST_FREQUENCY_TABULATE_MODE.count,
      binningMode: HIST_BINNING_MODE.auto,
      manualBinWidth: null,
      firstCenterAuto: true,
      firstCenter: null,
      lastCenterAuto: true,
      lastCenter: null
    };
  }

  function sanitizeHistFrequencySettings(source){
    const defaults = createDefaultHistFrequencySettings();
    const candidate = source && typeof source === 'object' ? source : {};
    return {
      createMode: sanitizeHistFrequencyCreateMode(candidate.createMode ?? candidate.mode),
      tabulateMode: sanitizeHistFrequencyTabulateMode(candidate.tabulateMode ?? candidate.tabulate),
      binningMode: sanitizeHistBinningMode(candidate.binningMode ?? candidate.binning),
      manualBinWidth: sanitizePositiveFinite(candidate.manualBinWidth ?? candidate.binWidth),
      firstCenterAuto: candidate.firstCenterAuto !== undefined ? !!candidate.firstCenterAuto : defaults.firstCenterAuto,
      firstCenter: sanitizeOptionalFinite(candidate.firstCenter),
      lastCenterAuto: candidate.lastCenterAuto !== undefined ? !!candidate.lastCenterAuto : defaults.lastCenterAuto,
      lastCenter: sanitizeOptionalFinite(candidate.lastCenter)
    };
  }

  function getHistFrequencyDefaultYLabel(frequencySettings){
    const settings = sanitizeHistFrequencySettings(frequencySettings);
    const cumulative = settings.createMode === HIST_FREQUENCY_CREATE_MODE.cumulative;
    if(settings.tabulateMode === HIST_FREQUENCY_TABULATE_MODE.fraction){
      return cumulative ? 'Cumulative fraction' : 'Relative frequency';
    }
    if(settings.tabulateMode === HIST_FREQUENCY_TABULATE_MODE.percent){
      return cumulative ? 'Cumulative frequency (%)' : 'Relative frequency (%)';
    }
    return cumulative ? 'Cumulative count' : 'Count';
  }

  function getHistDefaultTitle(mode){
    return normalizeHistPlotMode(mode) === HIST_PLOT_MODE_DENSITY ? 'Density plot' : 'Histogram';
  }

  function getHistDefaultYLabel(mode, frequencySettings = null){
    return normalizeHistPlotMode(mode) === HIST_PLOT_MODE_DENSITY
      ? 'Density'
      : getHistFrequencyDefaultYLabel(frequencySettings || createDefaultHistFrequencySettings());
  }

  function getHistGraphLabel(mode){
    return normalizeHistPlotMode(mode) === HIST_PLOT_MODE_DENSITY ? 'Density plot' : 'Histogram';
  }

  const HIST_DEFAULT_FILL = '#0000ff';
  const HIST_DEFAULT_BORDER = '#000000';
  const HIST_DEFAULT_BORDER_WIDTH = 1;
  const HIST_DEFAULT_SERIES_FILL_OPACITY = 0.34;
  const HIST_DEFAULT_DENSITY_FILL_OPACITY = 0.18;
  const HIST_DEFAULT_DENSITY_STROKE_WIDTH = 1.5;

  let state = {
    hot: null,
    scheduleDraw: null,
    fileHandle: null,
    fileName: 'histogram.graph',
    plotMode: HIST_PLOT_MODE_HISTOGRAM,
    titleText: getHistDefaultTitle(HIST_PLOT_MODE_HISTOGRAM),
    titleAuto: true,
    xLabelText: 'Value',
    yLabelText: getHistDefaultYLabel(HIST_PLOT_MODE_HISTOGRAM),
    yLabelAuto: true,
    showLegend: true,
    seriesColors: {},
    densityLineColors: {},
    barFill: HIST_DEFAULT_FILL,
    barBorder: HIST_DEFAULT_BORDER,
    barBorderWidth: HIST_DEFAULT_BORDER_WIDTH,
    svgBox: null,
    resizeMarginLock: null,
    layout: null,
    minSvgWidth: 0,
    autoDrawEnabled: true,
    autoDrawReason: null,
    autoDrawLockedByThreshold: false,
    drawPending: false,
    lastDataShape: { rows: 0, cols: 0 },
    lastAutoDrawEvaluation: null,
    axisSettings: createDefaultAxisSettings(),
    gridStyle: null,
    frequencySettings: createDefaultHistFrequencySettings(),
    frequencyInputs: {
      createMode: null,
      tabulateMode: null,
      binningMode: null,
      binsCount: null,
      binWidth: null,
      firstCenterAuto: null,
      firstCenter: null,
      lastCenterAuto: null,
      lastCenter: null
    },
    distributionSettings: createDefaultDistributionSettings(),
    distributionOptions: [],
    distributionInputs: {
      checkboxes: {},
      showPdf: null,
      showCdf: null
    },
    statsSettings: createDefaultHistStatsSettings(),
    statsInputs: {
      diagnosticsMode: null,
      comparisonMode: null
    },
    notes: {
      text: '',
      open: false,
      control: null
    },
    labelPositions: {
      title: null,
      xLabel: null,
      yLabel: null,
      legend: null
    },
    root: null
  };

  function stabilizeHistMarginForAxisResize(margin){
    if(!margin || typeof margin !== 'object'){
      return margin;
    }
    const locked = {
      top: Number(margin.top) || 0,
      right: Number(margin.right) || 0,
      bottom: Number(margin.bottom) || 0,
      left: Number(margin.left) || 0
    };
    const dataset = state.svgBox?.dataset || null;
    if(!dataset || dataset.resizerAspectLocked === 'true'){
      state.resizeMarginLock = locked;
      return locked;
    }
    const axis = dataset.resizerLastAxis === 'x' || dataset.resizerLastAxis === 'y'
      ? dataset.resizerLastAxis
      : 'both';
    if(state.resizeMarginLock){
      if(axis === 'y'){
        locked.left = state.resizeMarginLock.left;
        locked.right = state.resizeMarginLock.right;
      }else if(axis === 'x'){
        locked.top = state.resizeMarginLock.top;
        locked.bottom = state.resizeMarginLock.bottom;
      }
    }
    state.resizeMarginLock = { ...locked };
    return locked;
  }

  function resolveHistRoot(){
    const activeTabId = Shared.hot?.resolveActiveTabId?.()
      || global.Main?.tabs?.getActiveTab?.()?.id
      || null;
    return state.root
      || Shared.workspaceTabs?.getMountedRoot?.(activeTabId, 'hist')
      || global.document?.getElementById?.('histPage')
      || global.document;
  }

  function queryHistRoot(selector){
    const root = resolveHistRoot();
    return root?.querySelector?.(selector) || null;
  }

  function getHistNodeById(id){
    if(!id){
      return null;
    }
    const scopedNode = queryHistRoot(`#${id}`) || null;
    const documentNode = global.document?.getElementById?.(id) || null;
    if(scopedNode && scopedNode.isConnected){
      return scopedNode;
    }
    if(documentNode && documentNode.isConnected){
      return documentNode;
    }
    return scopedNode || documentNode || null;
  }

  function createImmutableHistDefaultConfig(){
    const defaultPlotMode = HIST_PLOT_MODE_HISTOGRAM;
    const frequency = createDefaultHistFrequencySettings();
    const distributionOptions = getDistributionOptions()
      .map((entry, index) => sanitizeDistributionOptionEntry(entry, index, entry));
    const defaultDistributionSettings = createDefaultDistributionSettings();
    const distributionSelections = mergeDistributionSelections(
      defaultDistributionSettings.selections,
      distributionOptions
    );
    return {
      plotMode: defaultPlotMode,
      title: getHistDefaultTitle(defaultPlotMode),
      xLabel: 'Value',
      yLabel: getHistDefaultYLabel(defaultPlotMode, frequency),
      showLegend: true,
      seriesColors: {},
      densityLineColors: {},
      colorScheme: Shared.colorSchemes?.getDefaultSchemeId?.('hist') || 'scientific',
      fill: HIST_DEFAULT_FILL,
      border: HIST_DEFAULT_BORDER,
      borderWidth: String(HIST_DEFAULT_BORDER_WIDTH),
      bins: '10',
      frequency,
      showGrid: false,
      gridStyle: null,
      showFrame: false,
      logY: false,
      fontSize: '12',
      axis: createDefaultAxisSettings(),
      axisLimits: { xMin: 0, xMax: null, yMax: null },
      distributions: {
        selected: Object.keys(distributionSelections).filter(key => distributionSelections[key]),
        showPdf: !!defaultDistributionSettings.showPdf,
        showCdf: !!defaultDistributionSettings.showCdf,
        alpha: defaultDistributionSettings.alpha,
        options: distributionOptions
      },
      stats: createDefaultHistStatsSettings(),
      notes: {
        text: '',
        open: false
      },
      labelPositions: {
        title: null,
        xLabel: null,
        yLabel: null,
        legend: null
      }
    };
  }

  function createImmutableHistDefaultPayload(){
    const createEmpty = Shared.createEmptyData;
    const emptyData = typeof createEmpty === 'function'
      ? createEmpty(HIST_DEFAULT_ROWS, HIST_DEFAULT_COLS)
      : Array.from({ length: HIST_DEFAULT_ROWS }, () => Array(HIST_DEFAULT_COLS).fill(''));
    seedHistDefaultHeaderRow(emptyData);
    return {
      type: 'hist',
      data: emptyData,
      exclusions: [],
      filters: null,
      config: createImmutableHistDefaultConfig()
    };
  }

  function ensureHistStatsReportHost(target){
    const reporting = Shared.statsReporting;
    if(!target || !reporting || typeof reporting.ensureReportHost !== 'function'){
      return target?.__statsReportHost || null;
    }
    return reporting.ensureReportHost(target, {
      id: 'histStatsReportHost',
      className: 'stats-report-host',
      attachToTarget: true,
      position: 'last'
    });
  }
  function clearHistStatsReportHost(target){
    const reporting = Shared.statsReporting;
    if(reporting && typeof reporting.clearReportHost === 'function'){
      reporting.clearReportHost(target);
    }
  }
  let histDataViewsManager = null;
  let histDataToolbarBound = false;
  let histDataToolbarLastActivation = 0;
  let histFontEventBound = false;

  function scheduleHistViewRefresh(reason){
    if(typeof state.scheduleDraw !== 'function'){
      return;
    }
    state.scheduleDraw({
      viewOnly: true,
      reason: reason || 'hist-view-refresh'
    });
  }

  function isHistFontStyleEvent(detail){
    const scopeId = detail?.scopeId || null;
    const storeKey = typeof detail?.storeKey === 'string' ? detail.storeKey : '';
    return scopeId === 'hist' || storeKey.startsWith('hist::');
  }

  function ensureHistFontEventListener(){
    if(histFontEventBound || !global.document || typeof global.document.addEventListener !== 'function'){
      return;
    }
    global.document.addEventListener('fontControls:styleChanged', event => {
      const detail = event?.detail || {};
      if(!isHistFontStyleEvent(detail)){
        return;
      }
      scheduleHistViewRefresh('font-style-change');
    });
    histFontEventBound = true;
  }

  const histOverlayController = Shared.loadingOverlay?.createPendingController?.({
    component: 'hist',
    message: 'Rendering histogram...',
    getHost: () => (
      state.svgBox
      || queryHistRoot('#histGraphPanel .svgbox')
      || getHistNodeById('histGraphPanel')
    )
  });

  function markHistOverlayPending(reason){
    histOverlayController?.markPending(reason);
    histDebug('Debug: hist overlay pending flagged', { reason: reason || 'data-change' });
  }

  function queueHistOverlay(reason, options = {}){
    return histOverlayController?.queue(reason, options) || false;
  }

  function resolveHistOverlay(reason){
    histOverlayController?.resolve(reason);
  }

  function forceHistOverlay(reason, options = {}){
    return histOverlayController?.force(reason, options) || false;
  }

  function syncHistPlotModeControls(){
    if(typeof document === 'undefined'){
      return;
    }
    const mode = normalizeHistPlotMode(state.plotMode);
    const densityMode = mode === HIST_PLOT_MODE_DENSITY;
    const frequencySettings = sanitizeHistFrequencySettings(state.frequencySettings);
    const plotModeSelect = getHistNodeById('histPlotMode');
    if(plotModeSelect && plotModeSelect.value !== mode){
      plotModeSelect.value = mode;
    }
    const binsFieldset = getHistNodeById('histBinsFieldset');
    if(binsFieldset){
      binsFieldset.hidden = densityMode;
      binsFieldset.setAttribute('aria-hidden', densityMode ? 'true' : 'false');
    }
    const histBinsInput = getHistNodeById('histBins');
    if(histBinsInput){
      const countMode = frequencySettings.binningMode === HIST_BINNING_MODE.count;
      histBinsInput.disabled = densityMode || !countMode;
    }
    const binsCountCtl = getHistNodeById('histBinsCountCtl');
    if(binsCountCtl){
      binsCountCtl.hidden = frequencySettings.binningMode !== HIST_BINNING_MODE.count;
      binsCountCtl.setAttribute('aria-hidden', binsCountCtl.hidden ? 'true' : 'false');
    }
    const binWidthCtl = getHistNodeById('histBinWidthCtl');
    if(binWidthCtl){
      binWidthCtl.hidden = frequencySettings.binningMode !== HIST_BINNING_MODE.width;
      binWidthCtl.setAttribute('aria-hidden', binWidthCtl.hidden ? 'true' : 'false');
    }
    const centerRow = getHistNodeById('histBinCentersRow');
    const showCenters = frequencySettings.binningMode === HIST_BINNING_MODE.width;
    if(centerRow){
      centerRow.hidden = !showCenters || densityMode;
      centerRow.setAttribute('aria-hidden', centerRow.hidden ? 'true' : 'false');
    }
    const firstCenterInput = getHistNodeById('histFirstBinCenter');
    const firstCenterAuto = getHistNodeById('histFirstBinCenterAuto');
    if(firstCenterInput){
      firstCenterInput.disabled = densityMode || !showCenters || !!firstCenterAuto?.checked;
    }
    const lastCenterInput = getHistNodeById('histLastBinCenter');
    const lastCenterAuto = getHistNodeById('histLastBinCenterAuto');
    if(lastCenterInput){
      lastCenterInput.disabled = densityMode || !showCenters || !!lastCenterAuto?.checked;
    }
    const cdfInput = getHistNodeById('histShowCdf');
    const pdfInput = getHistNodeById('histShowPdf');
    const cumulativeMode = frequencySettings.createMode === HIST_FREQUENCY_CREATE_MODE.cumulative;
    const disablePdf = cumulativeMode;
    if(pdfInput){
      pdfInput.disabled = disablePdf;
      const title = cumulativeMode ? 'PDF overlay is disabled for cumulative frequency mode.' : '';
      pdfInput.title = title;
      const label = pdfInput.closest('label');
      if(label){
        label.title = title;
      }
      if(disablePdf){
        state.distributionSettings.showPdf = false;
        pdfInput.checked = false;
      }
    }
    if(cdfInput){
      cdfInput.disabled = densityMode;
      const title = densityMode ? 'CDF overlay is only available in histogram mode.' : '';
      cdfInput.title = title;
      const label = cdfInput.closest('label');
      if(label){
        label.title = title;
      }
    }
  }

  function syncHistFrequencyControls(){
    if(typeof document === 'undefined'){
      return;
    }
    const settings = sanitizeHistFrequencySettings(state.frequencySettings);
    state.frequencySettings = settings;
    const inputs = state.frequencyInputs || {};
    if(inputs.createMode && inputs.createMode.value !== settings.createMode){
      inputs.createMode.value = settings.createMode;
    }
    if(inputs.tabulateMode && inputs.tabulateMode.value !== settings.tabulateMode){
      inputs.tabulateMode.value = settings.tabulateMode;
    }
    if(inputs.binningMode && inputs.binningMode.value !== settings.binningMode){
      inputs.binningMode.value = settings.binningMode;
    }
    if(inputs.binWidth){
      inputs.binWidth.value = Number.isFinite(Number(settings.manualBinWidth))
        ? String(settings.manualBinWidth)
        : (inputs.binWidth.value || '1');
    }
    if(inputs.firstCenterAuto){
      inputs.firstCenterAuto.checked = settings.firstCenterAuto !== false;
    }
    if(inputs.lastCenterAuto){
      inputs.lastCenterAuto.checked = settings.lastCenterAuto !== false;
    }
    if(inputs.firstCenter){
      inputs.firstCenter.value = Number.isFinite(Number(settings.firstCenter)) ? String(settings.firstCenter) : '';
    }
    if(inputs.lastCenter){
      inputs.lastCenter.value = Number.isFinite(Number(settings.lastCenter)) ? String(settings.lastCenter) : '';
    }
    syncHistPlotModeControls();
  }

  function applyHistPlotMode(mode, options = {}){
    const previousMode = normalizeHistPlotMode(state.plotMode);
    const nextMode = normalizeHistPlotMode(mode);
    state.plotMode = nextMode;
    const previousYDefault = getHistDefaultYLabel(previousMode, state.frequencySettings);
    const nextYDefault = getHistDefaultYLabel(nextMode, state.frequencySettings);
    if(options.syncDefaults !== false){
      if(state.titleAuto || state.titleText === getHistDefaultTitle(previousMode)){
        state.titleText = getHistDefaultTitle(nextMode);
        state.titleAuto = true;
      }
      if(state.yLabelAuto || state.yLabelText === previousYDefault){
        state.yLabelText = nextYDefault;
        state.yLabelAuto = true;
      }
    }
    syncHistPlotModeControls();
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      histDebug('Debug: hist plot mode applied', {
        previousMode,
        mode: nextMode,
        titleAuto: state.titleAuto,
        yLabelAuto: state.yLabelAuto
      });
    }
    if(options.schedule !== false && typeof state.scheduleDraw === 'function'){
      state.scheduleDraw();
    }
  }

  function applyHistFrequencySettings(nextSettings, options = {}){
    const previous = sanitizeHistFrequencySettings(state.frequencySettings);
    const merged = sanitizeHistFrequencySettings({ ...previous, ...(nextSettings || {}) });
    state.frequencySettings = merged;
    if(state.yLabelAuto || state.yLabelText === getHistDefaultYLabel(state.plotMode, previous)){
      state.yLabelText = getHistDefaultYLabel(state.plotMode, merged);
      state.yLabelAuto = true;
    }
    syncHistFrequencyControls();
    if(options.schedule !== false && typeof state.scheduleDraw === 'function'){
      state.scheduleDraw();
    }
  }

  function syncHistStatsControls(seriesCount){
    if(typeof document === 'undefined'){
      return;
    }
    const diagnosticsSelect = getHistNodeById('histStatsDiagnosticsMode');
    const comparisonSelect = getHistNodeById('histStatsComparisonMode');
    const resolvedDiagnostics = sanitizeHistDiagnosticsMode(state.statsSettings?.diagnosticsMode);
    const resolvedComparison = sanitizeHistComparisonMode(state.statsSettings?.comparisonMode);
    if(diagnosticsSelect && diagnosticsSelect.value !== resolvedDiagnostics){
      diagnosticsSelect.value = resolvedDiagnostics;
    }
    if(comparisonSelect && comparisonSelect.value !== resolvedComparison){
      comparisonSelect.value = resolvedComparison;
    }
    const comparisonLabel = comparisonSelect?.closest('label') || null;
    const count = Number.isFinite(seriesCount) ? Number(seriesCount) : NaN;
    const needsTwoSeries = resolvedComparison === 'ks' && Number.isFinite(count) && count !== 2;
    const title = needsTwoSeries ? 'Kolmogorov-Smirnov comparison requires exactly two visible series.' : '';
    if(comparisonSelect){
      comparisonSelect.title = title;
    }
    if(comparisonLabel){
      comparisonLabel.title = title;
    }
  }

  let histNoticeBoundWidth = null;
  const syncHistAutoDrawNoticeWidth = (reason) => {
    const svgBox = state.svgBox || state.layout?.elements?.svgBox || queryHistRoot('#histGraphPanel .svgbox');
    const renderRow = histRenderRowEl || getHistNodeById('histRenderRow');
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
    if(histAutoDrawNoticeEl && histAutoDrawNoticeEl.style.maxWidth !== widthPx){
      histAutoDrawNoticeEl.style.maxWidth = widthPx;
    }
    if(histNoticeBoundWidth !== width){
      histNoticeBoundWidth = width;
      histDebug('Debug: hist auto draw notice width synced', { width, reason: reason || null });
    }
  };
  const scheduleHistNoticeWidth = (() => {
    if(typeof Shared.debounceFrame === 'function'){
      let lastReason = 'frame';
      const debounced = Shared.debounceFrame(() => syncHistAutoDrawNoticeWidth(lastReason));
      return reason => {
        lastReason = reason || 'frame';
        debounced();
      };
    }
    return reason => syncHistAutoDrawNoticeWidth(reason || 'immediate');
  })();

  function shouldSkipHistHotSchedule(scheduleMeta){
    const source = String(scheduleMeta?.source || '').trim();
    if(source === HIST_LOAD_SOURCE_FREQUENCY_SYNC || source === HIST_LOAD_SOURCE_FREQUENCY_TAB_ACTIVATE){
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        histDebug('Debug: hist skipped rescheduled draw for derived grid sync', { source });
      }
      return true;
    }
    const hot = state.hot || state.ensureHotForActiveTab?.() || null;
    const manager = hot?.__histDataViewsManager || histDataViewsManager || null;
    const activeView = manager?.getActiveView?.() || null;
    if(isHistFrequencyTableDataView(activeView)){
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        histDebug('Debug: hist skipped schedule while derived frequency tab is active', {
          source: source || null,
          reason: scheduleMeta?.reason || null,
          viewId: activeView?.id || null
        });
      }
      return true;
    }
    return false;
  }

  function activateHistDataToolbar(reason){
    const now = Date.now();
    if(now - histDataToolbarLastActivation < 80){
      return false;
    }
    histDataToolbarLastActivation = now;
    const activated = !!Shared.workspaceToolbar?.activateSection?.('hist', 'Data');
    if(activated){
      histDebug('Debug: hist data toolbar activated', { reason: reason || 'unknown' });
    }
    return activated;
  }

  function ensureHistDataViewsForHot(hotInstance, options = {}){
    if(!hotInstance || typeof hotInstance.getData !== 'function'){
      return null;
    }
    if(typeof Shared.dataViews?.createManager !== 'function'){
      return null;
    }
    if(!hotInstance.__histDataViewsManager){
      hotInstance.__histDataViewsManager = Shared.dataViews.createManager({
        componentKey: 'hist',
        maxViews: HIST_DATA_VIEW_MAX,
        initialData: hotInstance.getData() || [],
        onActiveViewChanged(view){
          if(!view || !hotInstance || typeof hotInstance.loadData !== 'function'){
            return;
          }
          const isFrequencyView = isHistFrequencyTableDataView(view);
          const nextData = Array.isArray(view.data) ? view.data : [];
          hotInstance.loadData(nextData, {
            source: isFrequencyView
              ? HIST_LOAD_SOURCE_FREQUENCY_TAB_ACTIVATE
              : HIST_LOAD_SOURCE_DATA_VIEW_SWITCH
          });
          if(view.exclusions){
            hotInstance.applyExclusions?.(view.exclusions);
          }
          if(view.filters){
            hotInstance.applyFilters?.(view.filters, { schedule: false });
          }
          if(!isFrequencyView){
            markHistOverlayPending('data-view-switch');
            state.scheduleDraw?.({ reason: 'data-view-switch' });
          }
        },
        onInteraction(){
          activateHistDataToolbar('data-tab-interaction');
        }
      });
      histDebug('Debug: hist data views manager created', {
        tabId: hotInstance.__histTabId || null
      });
    }
    const manager = hotInstance.__histDataViewsManager;
    const hostWrapper = options.wrapper || getHistNodeById('histHotWrapper');
    const hostContainer = options.container || hotInstance.__histHostContainer || getHistNodeById('histHot');
    if(hostWrapper && hostContainer){
      manager.mount({
        wrapper: hostWrapper,
        tableContainer: hostContainer
      });
      manager.refresh?.();
    }
    histDataViewsManager = manager;
    return manager;
  }

  function syncHistActiveDataViewFromHot(hotInstance, reason){
    const hot = hotInstance || state.hot;
    if(!hot || typeof hot.getData !== 'function'){
      return;
    }
    const manager = hot.__histDataViewsManager || histDataViewsManager;
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

  function isHistFrequencyTableDataView(view){
    return !!(view && view.kind === 'derived' && view.transformSpec?.type === HIST_FREQUENCY_TABLE_TRANSFORM);
  }

  function resolveHistViewContext(hotInstance){
    const hot = hotInstance || state.ensureHotForActiveTab?.() || state.hot || null;
    const manager = hot
      ? (hot.__histDataViewsManager || histDataViewsManager || null)
      : (histDataViewsManager || null);
    const activeView = manager?.getActiveView?.() || null;
    let sourceView = activeView;
    let sourceViewId = String(activeView?.id || manager?.getActiveViewId?.() || 'raw');
    const visited = new Set();
    while(sourceView && isHistFrequencyTableDataView(sourceView) && !visited.has(sourceView.id)){
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

  function getHistFrequencyTableViewRecords(manager){
    if(!manager || typeof manager.getViews !== 'function' || typeof manager.getView !== 'function'){
      return [];
    }
    return (manager.getViews() || [])
      .map(view => manager.getView(view.id))
      .filter(isHistFrequencyTableDataView);
  }

  function buildHistFrequencyTableViewTitle(settings){
    const safe = sanitizeHistFrequencySettings(settings);
    return safe.createMode === HIST_FREQUENCY_CREATE_MODE.cumulative
      ? 'Cumulative frequency table'
      : 'Frequency table';
  }

  function trimHistViewMatrix(matrix){
    if(!Array.isArray(matrix)){
      return [];
    }
    let rowEnd = matrix.length;
    while(rowEnd > 0){
      const row = Array.isArray(matrix[rowEnd - 1]) ? matrix[rowEnd - 1] : [];
      const hasData = row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '');
      if(hasData){
        break;
      }
      rowEnd -= 1;
    }
    const trimmedRows = matrix.slice(0, rowEnd).map(row => Array.isArray(row) ? row.slice() : []);
    let colEnd = 0;
    trimmedRows.forEach(row => {
      for(let col = row.length - 1; col >= 0; col -= 1){
        const cell = row[col];
        if(cell !== null && cell !== undefined && String(cell).trim() !== ''){
          colEnd = Math.max(colEnd, col + 1);
          break;
        }
      }
    });
    return trimmedRows.map(row => row.slice(0, colEnd));
  }

  function areHistViewMatricesEqual(left, right){
    const areCellsEqual = (leftValue, rightValue) => {
      if(leftValue === rightValue){
        return true;
      }
      if(Number.isNaN(leftValue) && Number.isNaN(rightValue)){
        return true;
      }
      const leftNumeric = Number(leftValue);
      const rightNumeric = Number(rightValue);
      const leftIsNumeric = Number.isFinite(leftNumeric) && String(leftValue ?? '').trim() !== '';
      const rightIsNumeric = Number.isFinite(rightNumeric) && String(rightValue ?? '').trim() !== '';
      if(leftIsNumeric && rightIsNumeric){
        return Math.abs(leftNumeric - rightNumeric) <= 1e-12;
      }
      const leftText = leftValue == null ? '' : String(leftValue).trim();
      const rightText = rightValue == null ? '' : String(rightValue).trim();
      return leftText === rightText;
    };
    const normalizedLeft = trimHistViewMatrix(left);
    const normalizedRight = trimHistViewMatrix(right);
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
        if(!areCellsEqual(leftValue, rightValue)){
          return false;
        }
      }
    }
    return true;
  }

  function buildHistFrequencyTableViewData(model){
    if(!model || model.type !== 'frequency'){
      return null;
    }
    const series = Array.isArray(model.series) ? model.series : [];
    if(!series.length){
      return null;
    }
    const metricLabel = model.metricLabel || 'Value';
    if(model.mode === HIST_BINNING_MODE.exact){
      const header = ['Bin center'].concat(series.map(entry => `${entry.label || 'Series'} (${metricLabel})`));
      const rows = (model.centers || []).map((center, index) => [
        center,
        ...series.map(entry => entry.values?.[index] ?? '')
      ]);
      return [header, ...rows];
    }
    const header = ['Bin center'].concat(series.map(entry => `${entry.label || 'Series'} (${metricLabel})`));
    const centers = Array.isArray(model.centers) ? model.centers : [];
    const rows = centers.map((center, index) => [
      center,
      ...series.map(entry => entry.values?.[index] ?? '')
    ]);
    return [header, ...rows];
  }

  function buildHistFrequencyTableSummary(model, settings){
    const safe = sanitizeHistFrequencySettings(settings);
    return {
      transform: 'frequency-table',
      createMode: safe.createMode,
      tabulateMode: safe.tabulateMode,
      binningMode: safe.binningMode,
      bins: Number(model?.binCount) || 0,
      metricLabel: model?.metricLabel || 'Value'
    };
  }

  function removeHistFrequencyTableDataViews(options = {}){
    const manager = options.manager || resolveHistViewContext(options.hot).manager;
    if(!manager || typeof manager.removeView !== 'function'){
      return false;
    }
    const views = getHistFrequencyTableViewRecords(manager);
    if(!views.length){
      return false;
    }
    const activeViewId = String(manager.getActiveViewId?.() || '');
    let removedAny = false;
    let activeRemoved = false;
    let fallbackViewId = String(options.fallbackViewId || resolveHistViewContext(options.hot).sourceViewId || 'raw');
    views.forEach(view => {
      if(!view?.id){
        return;
      }
      if(view.id === activeViewId){
        activeRemoved = true;
        fallbackViewId = String(view.sourceViewId || fallbackViewId || 'raw');
      }
      removedAny = manager.removeView(view.id, {
        reason: options.reason || 'hist-frequency-view-remove',
        silent: true
      }) || removedAny;
    });
    if(activeRemoved){
      manager.activateView(fallbackViewId || 'raw', {
        reason: options.reason || 'hist-frequency-view-remove'
      });
    }
    return removedAny;
  }

  function syncHistFrequencyTableDataView(model, settings, options = {}){
    const context = options.context || resolveHistViewContext(options.hot);
    const manager = context.manager;
    const hot = context.hot;
    if(!manager){
      return false;
    }
    if(!model || model.type !== 'frequency'){
      return removeHistFrequencyTableDataViews({
        manager,
        hot,
        fallbackViewId: context.sourceViewId || 'raw',
        reason: options.reason || 'hist-frequency-view-clear'
      });
    }
    const data = buildHistFrequencyTableViewData(model);
    if(!Array.isArray(data) || !data.length){
      return false;
    }
    const title = buildHistFrequencyTableViewTitle(settings);
    const summary = buildHistFrequencyTableSummary(model, settings);
    const safeSettings = sanitizeHistFrequencySettings(settings);
    const transformSpec = {
      type: HIST_FREQUENCY_TABLE_TRANSFORM,
      createMode: safeSettings.createMode,
      tabulateMode: safeSettings.tabulateMode,
      binningMode: safeSettings.binningMode
    };
    const frequencyViews = getHistFrequencyTableViewRecords(manager);
    const targetView = frequencyViews.length ? frequencyViews[0] : null;
    frequencyViews.slice(1).forEach(view => {
      if(view?.id){
        manager.removeView(view.id, {
          reason: options.reason || 'hist-frequency-view-dedupe',
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
        if(!areHistViewMatricesEqual(currentData, data)){
          hot.loadData(data, { source: HIST_LOAD_SOURCE_FREQUENCY_SYNC });
        }
        if(typeof hot.applyExclusions === 'function'){
          hot.applyExclusions(null);
        }
      }
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
      reason: options.reason || 'hist-frequency-view-create'
    });
    return !!createdView;
  }

  function applyHistTransformToNewView(transformSpec, options = {}){
    const hot = state.ensureHotForActiveTab?.() || state.hot;
    if(!hot){
      return false;
    }
    const manager = ensureHistDataViewsForHot(hot, {
      wrapper: getHistNodeById('histHotWrapper'),
      container: hot.__histHostContainer || getHistNodeById('histHot')
    });
    if(!manager || typeof manager.applyTransform !== 'function'){
      console.warn('hist data transform skipped: Shared.dataViews unavailable');
      return false;
    }
    syncHistActiveDataViewFromHot(hot, 'transform-before');
    const result = manager.applyTransform(transformSpec, {
      title: options.title,
      reason: options.reason || 'toolbar-transform',
      transformOptions: Object.assign({}, HIST_TRANSFORM_SCOPE_DEFAULT, options.transformOptions || {})
    });
    if(!result?.ok){
      const message = result?.error || 'Transformation failed.';
      if(typeof global.alert === 'function'){
        global.alert(`Unable to transform data: ${message}`);
      }
      histDebug('Debug: hist transform failed', {
        message,
        transform: transformSpec?.type || null
      });
      return false;
    }
    activateHistDataToolbar('transform-applied');
    histDebug('Debug: hist transform created view', {
      title: result?.view?.title || null,
      summary: result?.result?.summary || null
    });
    return true;
  }

  const HIST_TRANSFORM_OPTION_MAP = Object.freeze({
    cpm: { spec: { type: 'cpm', orientation: 'column' }, title: 'CPM' },
    log2p1: { spec: { type: 'log', base: 2, pseudoCount: 1 }, title: 'log2(x+1)' },
    centerRowsMean: { spec: { type: 'centerRows', method: 'mean' }, title: 'Center rows (mean)' },
    centerRowsMedian: { spec: { type: 'centerRows', method: 'median' }, title: 'Center rows (median)' },
    centerColsMean: { spec: { type: 'centerColumns', method: 'mean' }, title: 'Center cols (mean)' },
    centerColsMedian: { spec: { type: 'centerColumns', method: 'median' }, title: 'Center cols (median)' },
    normalizeRows: { spec: { type: 'normalizeRows' }, title: 'Normalize rows (z)' },
    normalizeCols: { spec: { type: 'normalizeColumns' }, title: 'Normalize cols (z)' }
  });

  function promptHistCustomExpression(){
    const toolbarApi = Shared.workspaceToolbar || null;
    const expression = String(toolbarApi?.getCustomTransformExpression?.('hist') || '').trim();
    if(expression){
      return expression;
    }
    toolbarApi?.openCustomTransformEditor?.('hist');
    if(typeof global.alert === 'function'){
      global.alert('Enter a custom transformation formula using x, then click "Apply custom".');
    }
    return null;
  }

  function resolveHistToolbarTransformOption(optionKey, customExpression){
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
    const preset = HIST_TRANSFORM_OPTION_MAP[key];
    if(!preset){
      return null;
    }
    return {
      spec: Object.assign({}, preset.spec),
      title: preset.title
    };
  }

  function applyHistTransformPipelineToNewView(transformSpecs, options = {}){
    const hot = state.ensureHotForActiveTab?.() || state.hot;
    if(!hot){
      return false;
    }
    const manager = ensureHistDataViewsForHot(hot, {
      wrapper: getHistNodeById('histHotWrapper'),
      container: hot.__histHostContainer || getHistNodeById('histHot')
    });
    if(!manager || typeof manager.applyPipeline !== 'function'){
      console.warn('hist data transform pipeline skipped: Shared.dataViews unavailable');
      return false;
    }
    const specs = Array.isArray(transformSpecs) ? transformSpecs.filter(Boolean) : [];
    if(!specs.length){
      return false;
    }
    syncHistActiveDataViewFromHot(hot, 'transform-before');
    const result = manager.applyPipeline(specs, {
      title: options.title,
      reason: options.reason || 'toolbar-transform-pipeline',
      transformOptions: Object.assign({}, HIST_TRANSFORM_SCOPE_DEFAULT, options.transformOptions || {})
    });
    if(!result?.ok){
      const message = result?.error || 'Transformation failed.';
      if(typeof global.alert === 'function'){
        global.alert(`Unable to transform data: ${message}`);
      }
      histDebug('Debug: hist transform pipeline failed', {
        message,
        stepCount: specs.length
      });
      return false;
    }
    activateHistDataToolbar('transform-pipeline-applied');
    histDebug('Debug: hist transform pipeline created view', {
      title: result?.view?.title || null,
      stepCount: Array.isArray(result?.result?.steps) ? result.result.steps.length : specs.length
    });
    return true;
  }

  function applyHistSelectedTransforms(){
    const toolbarApi = Shared.workspaceToolbar || null;
    const selected = toolbarApi?.getSelectedTransforms?.('hist') || [];
    if(!Array.isArray(selected) || !selected.length){
      return false;
    }
    const resolved = [];
    for(let i = 0; i < selected.length; i += 1){
      const optionKey = selected[i];
      if(optionKey === 'custom'){
        const customExpression = promptHistCustomExpression();
        if(!customExpression){
          return false;
        }
        const customTransform = resolveHistToolbarTransformOption('custom', customExpression);
        if(customTransform){
          resolved.push(customTransform);
        }
        continue;
      }
      const next = resolveHistToolbarTransformOption(optionKey);
      if(next){
        resolved.push(next);
      }
    }
    if(!resolved.length){
      return false;
    }
    const ok = resolved.length === 1
      ? applyHistTransformToNewView(resolved[0].spec, {
        title: resolved[0].title,
        reason: 'toolbar-transform-multi-single'
      })
      : applyHistTransformPipelineToNewView(
        resolved.map(item => item.spec),
        { reason: 'toolbar-transform-multi' }
      );
    if(ok){
      toolbarApi?.clearSelectedTransforms?.('hist');
    }
    return ok;
  }

  function bindHistDataToolbar(){
    if(histDataToolbarBound || !document){
      return;
    }
    document.addEventListener('click', event => {
      const button = event.target?.closest?.(
        '#histTransformApplySelected, #histTransformCustomApply, #histTransformCpm, #histTransformLog2p1, #histTransformCenterRowsMean, #histTransformCenterRowsMedian, #histTransformCenterColsMean, #histTransformCenterColsMedian, #histTransformNormalizeRows, #histTransformNormalizeCols, #histTransformCustom'
      );
      if(!button){
        return;
      }
      const transformSection = button.closest?.('.workspace-toolbar__section[data-transform-section="1"]');
      if(button.id === 'histTransformApplySelected'){
        applyHistSelectedTransforms();
        return;
      }
      if(button.id === 'histTransformCustomApply'){
        const customExpression = promptHistCustomExpression();
        if(!customExpression){
          return;
        }
        const customTransform = resolveHistToolbarTransformOption('custom', customExpression);
        if(!customTransform){
          return;
        }
        if(transformSection?.dataset?.transformMultiMode === '1'){
          const selected = Shared.workspaceToolbar?.getSelectedTransforms?.('hist') || [];
          if(Array.isArray(selected) && selected.includes('custom')){
            applyHistSelectedTransforms();
          }else{
            applyHistTransformToNewView(customTransform.spec, { title: customTransform.title });
          }
          return;
        }
        applyHistTransformToNewView(customTransform.spec, { title: customTransform.title });
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
        const customExpression = promptHistCustomExpression();
        if(!customExpression){
          return;
        }
        const customTransform = resolveHistToolbarTransformOption(optionKey, customExpression);
        if(customTransform){
          applyHistTransformToNewView(customTransform.spec, { title: customTransform.title });
        }
        return;
      }
      const resolved = resolveHistToolbarTransformOption(optionKey);
      if(resolved){
        applyHistTransformToNewView(resolved.spec, { title: resolved.title });
      }
    }, true);
    const wrapper = getHistNodeById('histHotWrapper');
    if(wrapper && !wrapper.__histDataToolbarFocusBound){
      wrapper.addEventListener('mousedown', () => {
        activateHistDataToolbar('table-mousedown');
      }, true);
      wrapper.__histDataToolbarFocusBound = true;
    }
    histDataToolbarBound = true;
  }

  const histUndoManager = Shared.undoManager || null;
  function recordHistChange(label, previous, next, apply){
    if(!histUndoManager || typeof histUndoManager.recordStateChange !== 'function'){
      return;
    }
    if(typeof apply !== 'function'){
      return;
    }
    histUndoManager.recordStateChange({
      label,
      scope: 'histGraphPanel',
      from: previous,
      to: next,
      apply(value){
        apply(value);
        return true;
      }
    });
  }

  function ensureAxisSettings(){
    if(!state.axisSettings || typeof state.axisSettings !== 'object'){
      state.axisSettings = createDefaultAxisSettings();
    }
    if(!state.axisSettings.x || typeof state.axisSettings.x !== 'object'){
      state.axisSettings.x = { tickInterval: null, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS, notation: 'decimal' };
    }
    if(!state.axisSettings.y || typeof state.axisSettings.y !== 'object'){
      state.axisSettings.y = { tickInterval: null, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS, notation: 'decimal' };
    }
    if(typeof state.axisSettings.x.minorTicks !== 'boolean'){
      state.axisSettings.x.minorTicks = false;
    }
    if(typeof state.axisSettings.y.minorTicks !== 'boolean'){
      state.axisSettings.y.minorTicks = false;
    }
    state.axisSettings.x.minorTickSubdivisions = clampMinorTickSubdivisions(state.axisSettings.x.minorTickSubdivisions);
    state.axisSettings.y.minorTickSubdivisions = clampMinorTickSubdivisions(state.axisSettings.y.minorTickSubdivisions);
    const strokeNumeric = Number(state.axisSettings.strokeWidth);
    state.axisSettings.strokeWidth = Number.isFinite(strokeNumeric) && strokeNumeric > 0 ? strokeNumeric : 1;
    if(typeof state.axisSettings.color !== 'string' || !state.axisSettings.color){
      state.axisSettings.color = DEFAULT_AXIS_COLOR;
    }
    state.axisSettings.x.notation = sanitizeHistAxisNotation(state.axisSettings.x.notation);
    state.axisSettings.y.notation = sanitizeHistAxisNotation(state.axisSettings.y.notation);
    return state.axisSettings;
  }

  function createDefaultGridStyle(fallbackThickness){
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

  function getAxisNotation(axis){
    if(axis !== 'x' && axis !== 'y'){ return 'auto'; }
    const settings = ensureAxisSettings();
    return sanitizeHistAxisNotation(settings[axis]?.notation);
  }

  function updateAxisNotation(axis, value){
    if(axis !== 'x' && axis !== 'y'){ return; }
    const settings = ensureAxisSettings();
    const nextValue = sanitizeHistAxisNotation(value);
    if(settings[axis].notation === nextValue){ return; }
    settings[axis].notation = nextValue;
    histDebug('Debug: hist axis notation updated',{ axis, notation: nextValue });
    if(typeof state.scheduleDraw === 'function'){
      state.scheduleDraw();
    }
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
    histDebug('Debug: hist axis tick interval updated',{ axis, tickInterval: settings[axis].tickInterval });
    if(typeof state.scheduleDraw === 'function'){
      state.scheduleDraw();
    }
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
    histDebug('Debug: hist minor ticks updated',{ axis, enabled: nextValue });
    if(typeof state.scheduleDraw === 'function'){
      state.scheduleDraw();
    }
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
    histDebug('Debug: hist minor tick subdivisions updated',{ axis, subdivisions: nextValue });
    if(typeof state.scheduleDraw === 'function'){
      state.scheduleDraw();
    }
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
    histDebug('Debug: hist axis stroke width updated',{ strokeWidth: settings.strokeWidth });
    if(typeof state.scheduleDraw === 'function'){
      state.scheduleDraw();
    }
  }

  function getAxisColor(){
    return ensureAxisSettings().color || DEFAULT_AXIS_COLOR;
  }

  function updateAxisColor(value){
    const settings = ensureAxisSettings();
    settings.color = typeof value === 'string' && value.trim() ? value : DEFAULT_AXIS_COLOR;
    histDebug('Debug: hist axis color updated',{ color: settings.color });
    if(typeof state.scheduleDraw === 'function'){
      state.scheduleDraw();
    }
  }

  function registerHistGridControlTarget(target, options){
    if(!target || !gridControls || typeof gridControls.registerGraphElement !== 'function'){
      return;
    }
    const opts = options && typeof options === 'object' ? options : {};
    const fallbackThickness = Number.isFinite(Number(opts.fallbackThickness)) ? Number(opts.fallbackThickness) : getAxisStrokeWidthBase();
    gridControls.registerGraphElement(target, {
      scopeId: 'hist',
      getVisible: () => !!getHistNodeById('histShowGrid')?.checked,
      onVisibleChange: value => {
        const input = getHistNodeById('histShowGrid');
        if(input){
          input.checked = !!value;
        }
        state.scheduleDraw?.();
      },
      getStyle: () => getGridStyle(fallbackThickness),
      onStyleChange: style => {
        setGridStyle(style, fallbackThickness);
        state.scheduleDraw?.();
      },
      defaults: createDefaultGridStyle(fallbackThickness)
    });
  }

  function applyAxisSettings(settings){
    const base = createDefaultAxisSettings();
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
      const xNotation = settings.axisNotationX ?? settings.notationX ?? settings?.x?.notation ?? 'decimal';
      const yNotation = settings.axisNotationY ?? settings.notationY ?? settings?.y?.notation ?? 'decimal';
      base.x.notation = sanitizeHistAxisNotation(xNotation);
      base.y.notation = sanitizeHistAxisNotation(yNotation);
    }
    state.axisSettings = base;
    ensureAxisSettings();
    histDebug('Debug: hist axis settings applied',{ settings: state.axisSettings });
  }

  function buildManualTicks(min, max, interval){
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
    histDebug('Debug: hist manual ticks computed',{ interval, tickCount: ticks.length, min: graphMin, max: graphMax });
    return { min: graphMin, max: graphMax, ticks };
  }

  const markFontEditable = (node, role, key) => {
    if (!node) { return; }
    const payload = { role: role || null, key: key || role || null, text: node?.textContent || null };
    if (fontControls && typeof fontControls.markText === 'function') {
      fontControls.markText(node, { scopeId: 'hist', role, key });
    } else if (node.dataset) {
      node.dataset.fontEditable = '1';
      node.dataset.fontScope = 'hist';
      if (role) node.dataset.fontRole = role;
      if (key || role) node.dataset.fontKey = key || role;
    }
    if (!role || role.indexOf('Tick') === -1) {
      histDebug('Debug: hist markFontEditable', payload); // Debug: font target tagging summary
    }
  };

  function getHistLegendGuardWidth(requiredWidth){
    const numeric = Number(requiredWidth);
    return Number.isFinite(numeric) && numeric > 0 ? Math.max(0, Math.round(numeric)) : 0;
  }

  function applyHistLegendGuardWidth(requiredWidth){
    const effectiveWidth = getHistLegendGuardWidth(requiredWidth);
    if(effectiveWidth === state.minSvgWidth){
      return;
    }
    state.minSvgWidth = effectiveWidth;
    try{
      state.layout?.updateMinSvgWidth?.(effectiveWidth);
    }catch(err){
      console.error('hist legend guard width update error', err);
    }
    try{
      state.layout?.syncPanels?.({ skipSchedule: true, reason: 'legend-guard' });
    }catch(err){
      console.error('hist legend guard sync error', err);
    }
    histDebug('Debug: hist legend guard width applied', { width: effectiveWidth });
  }

  function getHistCategoricalPalette(){
    const selectedSchemeId = Shared.colorSchemes?.getSelectedSchemeId?.('hist') || Shared.colorSchemes?.getDefaultSchemeId?.('hist') || 'scientific';
    const schemes = Shared.colorSchemes?.getSchemes?.() || {};
    const scheme = schemes && typeof schemes === 'object' ? schemes[selectedSchemeId] : null;
    const categorical = Array.isArray(scheme?.categorical) && scheme.categorical.length
      ? scheme.categorical
      : (Array.isArray(Shared.palette?.DEFAULT_SCATTER_COLORS) && Shared.palette.DEFAULT_SCATTER_COLORS.length
        ? Shared.palette.DEFAULT_SCATTER_COLORS
        : ['#0000ff', '#ff0000', '#00aa00', '#ff8c00', '#800080', '#00a6d6', '#8b4513', '#ff1493', '#666666']);
    return categorical.slice();
  }

  function getHistSeriesColor(seriesKey, index){
    const key = String(seriesKey == null ? '' : seriesKey).trim();
    if(key && typeof state.seriesColors?.[key] === 'string' && state.seriesColors[key].trim()){
      return state.seriesColors[key].trim();
    }
    const palette = getHistCategoricalPalette();
    return palette[index % palette.length] || HIST_DEFAULT_FILL;
  }

  function setHistSeriesColor(seriesKey, color){
    const key = String(seriesKey == null ? '' : seriesKey).trim();
    const nextColor = typeof color === 'string' ? color.trim() : '';
    if(!key || !nextColor){
      return;
    }
    state.seriesColors = state.seriesColors && typeof state.seriesColors === 'object' ? state.seriesColors : {};
    state.seriesColors[key] = nextColor;
  }

  function getHistDensityLineColor(seriesKey, index, fallbackColor){
    const key = String(seriesKey == null ? '' : seriesKey).trim();
    if(key && typeof state.densityLineColors?.[key] === 'string' && state.densityLineColors[key].trim()){
      return state.densityLineColors[key].trim();
    }
    if(typeof fallbackColor === 'string' && fallbackColor.trim()){
      return fallbackColor.trim();
    }
    return getHistSeriesColor(seriesKey, index);
  }

  function setHistDensityLineColor(seriesKey, color){
    const key = String(seriesKey == null ? '' : seriesKey).trim();
    const nextColor = typeof color === 'string' ? color.trim() : '';
    if(!key || !nextColor){
      return;
    }
    state.densityLineColors = state.densityLineColors && typeof state.densityLineColors === 'object' ? state.densityLineColors : {};
    state.densityLineColors[key] = nextColor;
  }

  function collectHistSeries(options = {}){
    const explicitMatrix = Array.isArray(options?.matrix) ? options.matrix : null;
    const hot = state.hot || state.ensureHotForActiveTab?.();
    const matrix = explicitMatrix || (
      hot && typeof hot.getIncludedDataMatrix === 'function'
        ? hot.getIncludedDataMatrix()
        : (Shared.hot?.getIncludedDataMatrix ? Shared.hot.getIncludedDataMatrix(hot) : [])
    );
    if(!Array.isArray(matrix) || !matrix.length){
      return [];
    }
    let columnCount = 0;
    matrix.forEach(row => {
      if(Array.isArray(row) && row.length > columnCount){
        columnCount = row.length;
      }
    });
    const labelCounts = new Map();
    const series = [];
    for(let colIndex = 0; colIndex < columnCount; colIndex += 1){
      const headerRaw = Array.isArray(matrix[0]) ? matrix[0][colIndex] : '';
      const headerText = headerRaw == null ? '' : String(headerRaw).trim();
      const baseLabel = headerText || `Column ${colIndex + 1}`;
      const values = [];
      for(let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1){
        const row = Array.isArray(matrix[rowIndex]) ? matrix[rowIndex] : [];
        const numeric = parseFloat(row[colIndex]);
        if(Number.isFinite(numeric)){
          values.push(numeric);
        }
      }
      if(!values.length){
        continue;
      }
      const seenCount = labelCounts.get(baseLabel) || 0;
      labelCounts.set(baseLabel, seenCount + 1);
      const label = seenCount > 0 ? `${baseLabel} (${seenCount + 1})` : baseLabel;
      series.push({
        key: `col-${colIndex}`,
        label,
        baseLabel,
        colIndex,
        values
      });
    }
    return series;
  }

  // Format toolbar for histogram bars
  function showHistBarFormatControls(target){
    const doc = global.document;
    if(!doc) return;
    try{ if(typeof Shared.hideAllFormatControls === 'function') Shared.hideAllFormatControls({ force: true }); }catch(e){}
    if(Shared.symbolToolbar && typeof Shared.symbolToolbar.show === 'function'){
      const activeSeries = collectHistSeries();
      const seriesIndexByKey = new Map(activeSeries.map((entry, index) => [entry.key, index]));
      const targetSeriesKey = String(
        (typeof target?.getAttribute === 'function' ? target.getAttribute('data-series-key') : '')
        || ''
      ).trim();
      const targetSeriesLabel = String(
        (typeof target?.getAttribute === 'function' ? target.getAttribute('data-series') : '')
        || ''
      ).trim();
      const defaultScopeValue = targetSeriesKey && typeof Shared.encodeScopeValue === 'function'
        ? Shared.encodeScopeValue('series', targetSeriesKey)
        : 'global';
      const resolveBars = () => {
        const root = state.svgBox || doc;
        const nodes = Array.from(root.querySelectorAll('#histSvg [data-hist-bar="1"], #histSvg .hist-bar'));
        return nodes.length ? nodes : (target ? [target] : []);
      };
      const resolveSeriesNodes = seriesKey => {
        const normalized = String(seriesKey == null ? '' : seriesKey).trim();
        if(!normalized){
          return resolveBars();
        }
        return resolveBars().filter(node => String(node?.getAttribute?.('data-series-key') || '').trim() === normalized);
      };
      const resolveSeriesDensityLineNodes = seriesKey => {
        const normalized = String(seriesKey == null ? '' : seriesKey).trim();
        const nodes = resolveSeriesNodes(normalized).filter(node => String(node?.getAttribute?.('data-series-role') || '').trim() === 'density-line');
        return nodes;
      };
      const resolveScopedSeriesKey = context => {
        const ctx = context && typeof context === 'object' ? context : {};
        if(String(ctx.scope || '').trim() === 'series' && String(ctx.scopeDataset || '').trim()){
          return String(ctx.scopeDataset).trim();
        }
        return targetSeriesKey || '';
      };
      const densityTraceMode = normalizeHistPlotMode(state.plotMode) === HIST_PLOT_MODE_DENSITY;
      Shared.symbolToolbar.show({
        document: doc,
        target,
        anchorId: 'histFontHost',
        scopeId: 'hist',
        panelTitle: 'Trace',
        formClass: 'workspace-toolbar__form workspace-toolbar__form--single scatter-format-controls hist-bar-controls',
        scope: {
          label: 'Scope',
          options: [{ value: 'global', label: 'Global', disabled: false }].concat(activeSeries.map(entry => ({
            value: typeof Shared.encodeScopeValue === 'function' ? Shared.encodeScopeValue('series', entry.key) : entry.key,
            label: entry.label,
            datasetLabel: entry.label,
            scopeKind: 'series',
            scopeDataset: entry.key,
            disabled: false
          }))),
          value: defaultScopeValue
        },
        fillShape: {
          label: 'Fill',
          showShapePicker: false,
          shapeOptions: [{ value: 'square', label: 'Square' }],
          getColor(context){
            const scopedSeriesKey = resolveScopedSeriesKey(context);
            if(scopedSeriesKey){
              return getHistSeriesColor(scopedSeriesKey, seriesIndexByKey.get(scopedSeriesKey) || 0);
            }
            return state.barFill || target?.getAttribute?.('fill') || HIST_DEFAULT_FILL;
          },
          getShape(){
            return 'square';
          },
          onColorInput(value, context){
            const nextValue = value || HIST_DEFAULT_FILL;
            const scopedSeriesKey = resolveScopedSeriesKey(context);
            if(scopedSeriesKey){
              setHistSeriesColor(scopedSeriesKey, nextValue);
              resolveSeriesNodes(scopedSeriesKey).forEach(node => node.setAttribute('fill', nextValue));
              return;
            }
            state.barFill = nextValue;
            resolveBars().forEach(node => node.setAttribute('fill', nextValue));
          },
          onColorChange(value, context){
            const nextValue = value || HIST_DEFAULT_FILL;
            const scopedSeriesKey = resolveScopedSeriesKey(context);
            if(scopedSeriesKey){
              setHistSeriesColor(scopedSeriesKey, nextValue);
              state.scheduleDraw?.();
              return;
            }
            state.barFill = nextValue;
            state.scheduleDraw?.();
          }
        },
        border: {
          label: 'Border',
          getColor(context){
            const scopedSeriesKey = resolveScopedSeriesKey(context);
            if(densityTraceMode && scopedSeriesKey){
              const seriesIndex = seriesIndexByKey.get(scopedSeriesKey) || 0;
              return getHistDensityLineColor(scopedSeriesKey, seriesIndex, getHistSeriesColor(scopedSeriesKey, seriesIndex));
            }
            return state.barBorder || target?.getAttribute?.('stroke') || HIST_DEFAULT_BORDER;
          },
          onColorInput(value, context){
            const nextValue = value || HIST_DEFAULT_BORDER;
            const scopedSeriesKey = resolveScopedSeriesKey(context);
            if(densityTraceMode && scopedSeriesKey){
              setHistDensityLineColor(scopedSeriesKey, nextValue);
              resolveSeriesDensityLineNodes(scopedSeriesKey).forEach(node => node.setAttribute('stroke', nextValue));
              return;
            }
            state.barBorder = nextValue;
            resolveBars().forEach(node => node.setAttribute('stroke', nextValue));
          },
          onColorChange(value, context){
            const nextValue = value || HIST_DEFAULT_BORDER;
            const scopedSeriesKey = resolveScopedSeriesKey(context);
            if(densityTraceMode && scopedSeriesKey){
              setHistDensityLineColor(scopedSeriesKey, nextValue);
              state.scheduleDraw?.();
              return;
            }
            state.barBorder = nextValue;
            state.scheduleDraw?.();
          },
          getWidth(){
            const inputWidth = Number(state.barBorderWidth);
            if(Number.isFinite(inputWidth)){ return inputWidth; }
            const nodeWidth = Number(target?.getAttribute?.('stroke-width'));
            return Number.isFinite(nodeWidth) ? nodeWidth : 0;
          },
          onWidthChange(value){
            const numeric = Number(value);
            const normalized = Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
            state.barBorderWidth = normalized;
            resolveBars().forEach(node => {
              if(normalized > 0){
                node.setAttribute('stroke', state.barBorder || HIST_DEFAULT_BORDER);
                node.setAttribute('stroke-width', String(normalized));
              }else{
                node.removeAttribute('stroke');
                node.removeAttribute('stroke-width');
              }
            });
            state.scheduleDraw?.();
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
      if(targetSeriesLabel){
        histDebug('Debug: hist bar format controls opened', { series: targetSeriesLabel, seriesKey: targetSeriesKey });
      }
      return;
    }
    histDebug('Debug: hist symbol toolbar unavailable; legacy fallback removed');
  }

  // Format toolbar for overlay (pdf/cdf) paths
  function showHistOverlayFormatControls(target){
    if(target && additionalLineControls && typeof additionalLineControls.show === 'function'){
      let distKey = target.getAttribute('data-dist') || null;
      const knownDistKeys = () => {
        const keys = new Set();
        const addKey = value => {
          const normalized = String(value == null ? '' : value).trim();
          if(normalized){
            keys.add(normalized);
          }
        };
        addKey(distKey);
        (state.distributionOptions || []).forEach(option => addKey(option?.key));
        const root = state.svgBox || global.document;
        if(root && root.querySelectorAll){
          root.querySelectorAll('.hist-overlay[data-dist]').forEach(node => addKey(node.getAttribute('data-dist')));
        }
        return Array.from(keys);
      };
      const orderedDistKeys = () => {
        const keys = knownDistKeys();
        if(!distKey){
          return keys;
        }
        return [distKey].concat(keys.filter(key => key !== distKey));
      };
      const scopeOptions = (() => {
        const options = [{ value: 'global', label: 'Global', disabled: false }];
        const keys = orderedDistKeys();
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
            label: distKey || 'Series',
            datasetLabel: distKey || 'Series',
            scopeDataset: distKey || '',
            scopeKind: 'series',
            disabled: !distKey
          });
        }
        return options;
      })();
      const resolveTargets = scopeValue => {
        const root = state.svgBox || global.document;
        if(!root || !root.querySelectorAll){
          return target ? [target] : [];
        }
        if(scopeValue === 'series' && distKey){
          return Array.from(root.querySelectorAll(`.hist-overlay[data-dist="${distKey.replace(/"/g, '\\"')}"]`));
        }
        return Array.from(root.querySelectorAll('.hist-overlay'));
      };
      additionalLineControls.show({
        scopeId: 'hist',
        target,
        panelTitle: 'Distribution fit',
        controls: {
          showSummary: false,
          showScope: true,
          showPattern: true,
          scopeLabel: 'Scope',
          colorLabel: 'Line',
          thicknessLabel: 'Line width',
          patternLabel: 'Line pattern',
          transparencyLabel: 'Line transparency',
          thicknessMin: 0.2,
          thicknessStep: 0.1,
          thicknessMax: 20
        },
        scope: {
          label: 'Scope',
          options: scopeOptions,
          value: distKey ? 'series' : 'global',
          onChange(nextScope, ctx){
            if(nextScope === 'series'){
              const scopedDistKey = String(ctx?.scopeDataset || '').trim();
              if(scopedDistKey){
                distKey = scopedDistKey;
              }
            }
          }
        },
        getSummary: ctx => (ctx?.scope === 'series' && distKey) ? distKey : 'Global',
        getColor: ctx => {
          if(ctx?.scope === 'series' && distKey){
            return target.getAttribute('stroke') || state.distributionOptions?.find(o => o.key === distKey)?.color || '#d95f02';
          }
          const first = Array.isArray(state.distributionOptions) && state.distributionOptions.length ? state.distributionOptions[0] : null;
          return first?.color || target.getAttribute('stroke') || '#d95f02';
        },
        getThickness: ctx => {
          if(ctx?.scope === 'series' && distKey){
            const option = state.distributionOptions?.find(o => o.key === distKey);
            const byOption = Number(option?.strokeWidth);
            if(Number.isFinite(byOption)){ return byOption; }
          }
          const byAttr = Number(target.getAttribute('stroke-width'));
          if(Number.isFinite(byAttr)){ return byAttr; }
          return 1;
        },
        getPattern: ctx => {
          if(ctx?.scope === 'series' && distKey){
            const option = state.distributionOptions?.find(o => o.key === distKey);
            if(option?.pattern){ return sanitizeHistOverlayPattern(option.pattern); }
          }
          return inferHistOverlayPattern(target);
        },
        getTransparency: ctx => {
          let opacity = null;
          if(ctx?.scope === 'series' && distKey){
            const option = state.distributionOptions?.find(o => o.key === distKey);
            if(Number.isFinite(Number(option?.alpha))){
              opacity = Number(option.alpha);
            }
          }
          if(!Number.isFinite(opacity)){
            const byAttr = Number(target.getAttribute('stroke-opacity'));
            opacity = Number.isFinite(byAttr) ? byAttr : 1;
          }
          const bounded = Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1;
          return Math.round((1 - bounded) * 100);
        },
        onColorInput: (value, ctx) => {
          const scopeValue = ctx?.scope === 'series' ? 'series' : 'global';
          const nodes = resolveTargets(scopeValue);
          nodes.forEach(node => { try{ node.setAttribute('stroke', value); }catch(e){} });
          if(scopeValue === 'series' && distKey){
            const opt = state.distributionOptions.find(o => o.key === distKey);
            if(opt){ opt.color = value; }
          }else{
            state.distributionOptions.forEach(o => { o.color = value; });
          }
          state.scheduleDraw?.();
        },
        onColorChange: (value, ctx) => {
          const scopeValue = ctx?.scope === 'series' ? 'series' : 'global';
          const nodes = resolveTargets(scopeValue);
          nodes.forEach(node => { try{ node.setAttribute('stroke', value); }catch(e){} });
          if(scopeValue === 'series' && distKey){
            const opt = state.distributionOptions.find(o => o.key === distKey);
            if(opt){ opt.color = value; }
          }else{
            state.distributionOptions.forEach(o => { o.color = value; });
          }
          state.scheduleDraw?.();
        },
        onThicknessChange: (value, ctx) => {
          const next = Number(value);
          if(!Number.isFinite(next)){ return; }
          const scopeValue = ctx?.scope === 'series' ? 'series' : 'global';
          const nodes = resolveTargets(scopeValue);
          nodes.forEach(node => { try{ node.setAttribute('stroke-width', String(next)); }catch(e){} });
          if(scopeValue === 'series' && distKey){
            const opt = state.distributionOptions.find(o => o.key === distKey);
            if(opt){ opt.strokeWidth = next; }
          }else{
            state.distributionOptions.forEach(o => { o.strokeWidth = next; });
          }
          state.scheduleDraw?.();
        },
        onPatternChange: (value, ctx) => {
          const pattern = sanitizeHistOverlayPattern(value);
          const scopeValue = ctx?.scope === 'series' ? 'series' : 'global';
          const nodes = resolveTargets(scopeValue);
          nodes.forEach(node => applyHistOverlayPattern(node, pattern));
          if(scopeValue === 'series' && distKey){
            const opt = state.distributionOptions.find(o => o.key === distKey);
            if(opt){ opt.pattern = pattern; }
          }else{
            state.distributionOptions.forEach(o => { o.pattern = pattern; });
          }
          state.scheduleDraw?.();
        },
        onTransparencyChange: (value, ctx) => {
          const pct = Number(value);
          const bounded = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0;
          const opacity = 1 - (bounded / 100);
          const scopeValue = ctx?.scope === 'series' ? 'series' : 'global';
          const nodes = resolveTargets(scopeValue);
          nodes.forEach(node => { try{ node.setAttribute('stroke-opacity', String(opacity)); }catch(e){} });
          if(scopeValue === 'series' && distKey){
            const opt = state.distributionOptions.find(o => o.key === distKey);
            if(opt){ opt.alpha = opacity; }
          }else{
            state.distributionOptions.forEach(o => { o.alpha = opacity; });
          }
          state.scheduleDraw?.();
        }
      });
      return;
    }
    histDebug('Debug: hist additional line controls unavailable; legacy fallback removed');
  }

  function clampUnit(value){
    if(!Number.isFinite(value)) return 0;
    if(value < 0) return 0;
    if(value > 1) return 1;
    return value;
  }

  function sanitizeHistOverlayPattern(value){
    const patternRaw = String(value || 'solid').toLowerCase();
    return (patternRaw === 'dashed' || patternRaw === 'dotted' || patternRaw === 'solid') ? patternRaw : 'solid';
  }

  function histOverlayPatternToDasharray(pattern){
    const normalized = sanitizeHistOverlayPattern(pattern);
    if(normalized === 'dashed'){ return '6 3'; }
    if(normalized === 'dotted'){ return '2 3'; }
    return '';
  }

  function inferHistOverlayPattern(el){
    const dash = String(el?.getAttribute?.('stroke-dasharray') || '').trim();
    if(!dash){ return 'solid'; }
    const compact = dash.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    if(compact === '6 3' || compact === '4 4'){ return 'dashed'; }
    return 'dotted';
  }

  function applyHistOverlayPattern(el, pattern){
    if(!el || !el.setAttribute){ return; }
    const dash = histOverlayPatternToDasharray(pattern);
    if(dash){
      el.setAttribute('stroke-dasharray', dash);
    }else{
      el.removeAttribute('stroke-dasharray');
    }
  }

  function prepareDistributionFits(values){
    if(!Array.isArray(values) || !values.length){
      return [];
    }
    const statsHelpers = Shared.stats || {};
    const keys = getActiveDistributionKeys();
    const results = [];
    if(!keys.length){
      return results;
    }
    const canFitViaStats = typeof statsHelpers.fitDistribution === 'function';
    const debugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
    keys.forEach((key, index) => {
      let fitResult = null;
      if(canFitViaStats){
        try{
          fitResult = statsHelpers.fitDistribution(values, { distribution: key });
        }catch(err){
          console.error('hist fitDistribution error',{ key, message: err?.message });
        }
      }
      if((!fitResult || fitResult.valid === false || typeof fitResult.pdf !== 'function') && key === 'normal'){
        fitResult = createNormalFallbackFit(values);
      }
      if(!fitResult || typeof fitResult !== 'object'){
        fitResult = { key, label: key, valid: false, message: 'Fit unavailable' };
      }
      if(!fitResult.key){
        fitResult.key = key;
      }
      const option = state.distributionOptions.find(opt => opt.key === key);
      if(!fitResult.label){
        fitResult.label = option?.label || key;
      }
      const colorIndex = index % DEFAULT_DISTRIBUTION_COLORS.length;
      // Prefer configured option color (user choice) over fit-provided color
      fitResult.color = (option && option.color) || fitResult.color || DEFAULT_DISTRIBUTION_COLORS[colorIndex];
      fitResult.valid = fitResult.valid !== false && fitResult.params !== undefined ? true : fitResult.valid;
      // carry optional strokeWidth and alpha from configured distribution options
      if(option){
        if(Number.isFinite(Number(option.strokeWidth))){
          fitResult.strokeWidth = Number(option.strokeWidth);
        }
        if(Number.isFinite(Number(option.alpha))){
          // store as normalized 0..1
          fitResult.alpha = Math.min(1, Math.max(0, Number(option.alpha)));
        }
        fitResult.pattern = sanitizeHistOverlayPattern(option.pattern || 'solid');
      }
      results.push(fitResult);
      if(debugEnabled){
        histDebug('Debug: hist distribution fit',{ key: fitResult.key, valid: fitResult.valid !== false, message: fitResult.message || null });
      }
    });
    return results;
  }

  function createNormalFallbackFit(numericValues){
    if(!Array.isArray(numericValues) || numericValues.length < 2){
      return null;
    }
    const mean = numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
    const variance = numericValues.reduce((sum, value) => {
      const delta = value - mean;
      return sum + (delta * delta);
    }, 0) / Math.max(1, numericValues.length - 1);
    const sd = Math.sqrt(variance);
    if(!Number.isFinite(mean) || !Number.isFinite(sd) || sd <= 0){
      return null;
    }
    const sqrtTwoPi = Math.sqrt(2 * Math.PI);
    const sqrtTwo = Math.sqrt(2);
    const erf = (value) => {
      const sign = value < 0 ? -1 : 1;
      const x = Math.abs(value);
      const a1 = 0.254829592;
      const a2 = -0.284496736;
      const a3 = 1.421413741;
      const a4 = -1.453152027;
      const a5 = 1.061405429;
      const p = 0.3275911;
      const t = 1 / (1 + p * x);
      const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
      return sign * y;
    };
    return {
      key: 'normal',
      label: 'Normal',
      valid: true,
      params: { mean, sd },
      pdf(x){
        const z = (x - mean) / sd;
        return Math.exp(-0.5 * z * z) / (sd * sqrtTwoPi);
      },
      cdf(x){
        return 0.5 * (1 + erf((x - mean) / (sd * sqrtTwo)));
      }
    };
  }

  function computeOverlayMetrics(fits, options){
    if(!Array.isArray(fits) || !fits.length){
      return { pdfMax: 0, cdfMax: 0 };
    }
    const { xMin, xMax, binWidth, sampleCount, includePdf, includeCdf } = options || {};
    const scaleMode = normalizeHistPlotMode(options?.scaleMode) === HIST_PLOT_MODE_DENSITY ? HIST_PLOT_MODE_DENSITY : HIST_PLOT_MODE_HISTOGRAM;
    if(!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMax === xMin){
      return { pdfMax: 0, cdfMax: 0 };
    }
    if(scaleMode === HIST_PLOT_MODE_HISTOGRAM && (!Number.isFinite(binWidth) || binWidth <= 0 || !Number.isFinite(sampleCount) || sampleCount <= 0)){
      return { pdfMax: 0, cdfMax: 0 };
    }
    const steps = Math.min(240, Math.max(24, Math.round((options?.plotPixels || 240) / 2)));
    const stepSize = (xMax - xMin) / Math.max(steps - 1, 1);
    let pdfMax = 0;
    let cdfMax = 0;
    for(let i=0;i<steps;i++){
      const x = xMin + stepSize * i;
      for(const fit of fits){
        if(!fit || fit.valid === false){ continue; }
        if(includePdf && typeof fit.pdf === 'function'){
          const density = fit.pdf(x);
          if(Number.isFinite(density) && density >= 0){
            const expected = scaleMode === HIST_PLOT_MODE_DENSITY
              ? density
              : density * sampleCount * binWidth;
            if(expected > pdfMax){ pdfMax = expected; }
          }
        }
        if(includeCdf && typeof fit.cdf === 'function'){
          const cumulative = clampUnit(fit.cdf(x));
          const expected = scaleMode === HIST_PLOT_MODE_DENSITY
            ? cumulative
            : cumulative * sampleCount;
          if(expected > cdfMax){ cdfMax = expected; }
        }
      }
    }
    return { pdfMax, cdfMax };
  }

  function estimateHistDensityBandwidth(sorted){
    if(!Array.isArray(sorted) || !sorted.length){
      return 1;
    }
    const n = sorted.length;
    const meanVal = sorted.reduce((acc, value) => acc + value, 0) / n;
    const variance = sorted.reduce((acc, value) => acc + Math.pow(value - meanVal, 2), 0) / (n - 1 || 1);
    const sigma = Math.sqrt(variance) || 0;
    const percentile = (p) => {
      if(!sorted.length){
        return NaN;
      }
      const pos = (sorted.length - 1) * p;
      const base = Math.floor(pos);
      const rest = pos - base;
      const baseVal = sorted[base];
      const nextVal = sorted[base + 1] !== undefined ? sorted[base + 1] : baseVal;
      return baseVal + rest * (nextVal - baseVal);
    };
    const iqrVal = percentile(0.75) - percentile(0.25);
    const scale = Math.min(sigma, iqrVal / 1.349 || Infinity) || sigma || Math.abs(sorted[0]) || 1;
    const bandwidth = 0.9 * scale * Math.pow(n, -0.2);
    const fallback = (sorted[n - 1] - sorted[0]) / (Math.sqrt(n) || 1) || 1;
    const resolved = Number.isFinite(bandwidth) && bandwidth > 0 ? bandwidth : fallback;
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      histDebug('Debug: hist density bandwidth resolved', { n, sigma, iqr: iqrVal, scale, bandwidth, fallback, resolved });
    }
    return resolved;
  }

  function computeHistDensitySeries(values, options = {}){
    const sorted = Array.isArray(values)
      ? values.filter(Number.isFinite).slice().sort((a, b) => a - b)
      : [];
    const requestedCount = Number(options.sampleCount);
    const sampleCount = Math.min(320, Math.max(48, Math.round(Number.isFinite(requestedCount) && requestedCount > 0 ? requestedCount : 160)));
    if(!sorted.length){
      return { positions: [], densities: [], bandwidth: 1, domainMin: NaN, domainMax: NaN, peak: 0, minPositive: NaN };
    }
    const bandwidth = estimateHistDensityBandwidth(sorted);
    const dataMin = sorted[0];
    const dataMax = sorted[sorted.length - 1];
    const dataSpan = dataMax - dataMin;
    const pad = Math.max(bandwidth * 3, (Number.isFinite(dataSpan) ? dataSpan : 0) * 0.05);
    let domainMin = Number.isFinite(options.minVal) ? Number(options.minVal) : dataMin - pad;
    let domainMax = Number.isFinite(options.maxVal) ? Number(options.maxVal) : dataMax + pad;
    if(!Number.isFinite(domainMin) || !Number.isFinite(domainMax)){
      domainMin = dataMin;
      domainMax = dataMax;
    }
    if(domainMax === domainMin){
      domainMin -= 0.5;
      domainMax += 0.5;
    }
    const positions = [];
    const densities = [];
    const step = (domainMax - domainMin) / Math.max(sampleCount - 1, 1);
    const denom = sorted.length * bandwidth * Math.sqrt(2 * Math.PI);
    for(let index = 0; index < sampleCount; index++){
      const x = domainMin + step * index;
      let sum = 0;
      for(let sampleIndex = 0; sampleIndex < sorted.length; sampleIndex++){
        const u = (x - sorted[sampleIndex]) / bandwidth;
        sum += Math.exp(-0.5 * u * u);
      }
      const density = denom ? sum / denom : 0;
      positions.push(x);
      densities.push(density);
    }
    const peak = densities.length ? densities.reduce((max, density) => (density > max ? density : max), 0) : 0;
    const minPositive = densities.reduce((min, density) => (density > 0 && density < min ? density : min), Infinity);
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      histDebug('Debug: hist density series computed', {
        bandwidth,
        sampleCount,
        domainMin,
        domainMax,
        peak,
        minPositive: Number.isFinite(minPositive) ? minPositive : null
      });
    }
    return {
      positions,
      densities,
      bandwidth,
      domainMin,
      domainMax,
      peak,
      minPositive: Number.isFinite(minPositive) ? minPositive : NaN
    };
  }

  function initHot(){
    histDebug('Debug: hist initHot using shared factory', { hasFactory: typeof Shared.hot?.createStandardTable === 'function' });
    if(typeof Shared.hot?.createStandardTable !== 'function'){
      console.error('hist initHot missing Shared.hot.createStandardTable');
      return;
    }
    const data = seedHistDefaultHeaderRow(Shared.createEmptyData(HIST_DEFAULT_ROWS, HIST_DEFAULT_COLS));
    let histScheduleProxyCount = 0;
    const scheduleHistDrawProxy = scheduleMeta => {
      if(shouldSkipHistHotSchedule(scheduleMeta)){
        return;
      }
      histScheduleProxyCount += 1;
      if(histScheduleProxyCount <= 5){
        histDebug('Debug: hist scheduleDraw proxy invoked', {
          count: histScheduleProxyCount,
          source: scheduleMeta?.source || null
        }); // Debug: table change trigger
        if(histScheduleProxyCount === 5){
          histDebug('Debug: hist scheduleDraw proxy suppressing further logs'); // Debug: proxy log suppression notice
        }
      }
      if(getHistNodeById('histStatsResults')){
        updateHistStats([]);
      }
      if(typeof state.scheduleDraw === 'function'){
        state.scheduleDraw();
      }
    };

    const createHistTable = (container) => {
      let instance = null;
      instance = Shared.hot.createStandardTable(container, { rows: HIST_DEFAULT_ROWS, cols: HIST_DEFAULT_COLS }, scheduleHistDrawProxy, {
        debugLabel: 'hist',
        data,
        firstRowClassName: 'hot-header-row htCenter',
        pinFirstRow: true,
        scheduleOnLoadData: true,
        hotOptions: {
          stretchH: 'all',
          minSpareRows: 10,
          afterChange(changes, source){
            if(changes){
              histDebug('hist afterChange', { count: changes.length, source });
              syncHistActiveDataViewFromHot(instance, 'afterChange');
            }
          },
          afterLoadData(){
            syncHistActiveDataViewFromHot(instance, 'afterLoadData');
          },
          afterSelectionEnd(){
            activateHistDataToolbar('table-selection');
          },
          afterUndo(){
            histDebug('hist undo');
          },
          afterRedo(){
            histDebug('hist redo');
          }
        }
      });
      if(instance){
        instance.__histHostContainer = container || null;
      }
      return instance;
    };
    const ensureHistHotForActiveTab = () => {
      const wrapper = getHistNodeById('histHotWrapper');
      const baseContainer = getHistNodeById('histHot');
      if(typeof Shared.hot?.ensureTableForTab !== 'function' || !wrapper || !baseContainer){
        if(!state.hot){
          state.hot = createHistTable(baseContainer);
        }
        if(state.hot){
          state.hot.__histHostContainer = baseContainer;
          state.hot.__histTabId = Shared.hot.resolveActiveTabId?.() || 'hist-default';
          ensureHistDefaultHeaderRow(state.hot);
          ensureHistDataViewsForHot(state.hot, {
            wrapper,
            container: baseContainer
          });
          syncHistActiveDataViewFromHot(state.hot, 'ensure-active-tab');
        }
        return state.hot;
      }
      const entry = Shared.hot.ensureTableForTab({
        type: 'hist',
        tabId: Shared.hot.resolveActiveTabId?.() || 'hist-default',
        wrapper,
        container: baseContainer,
        createInstance: createHistTable
      });
      if(entry?.instance){
        state.hot = entry.instance;
      }
      if(state.hot){
        state.hot.__histHostContainer = entry?.container || baseContainer;
        state.hot.__histTabId = entry?.tabId || Shared.hot.resolveActiveTabId?.() || 'hist-default';
        ensureHistDefaultHeaderRow(state.hot);
        ensureHistDataViewsForHot(state.hot, {
          wrapper,
          container: entry?.container || baseContainer
        });
        syncHistActiveDataViewFromHot(state.hot, 'ensure-active-tab');
      }
      return state.hot;
    };
    state.hot = ensureHistHotForActiveTab();
    state.ensureHotForActiveTab = ensureHistHotForActiveTab;
    bindHistDataToolbar();
  }

  function initControls(){
    const histPlotMode=$('#histPlotMode'), histShowLegend=$('#histShowLegend'), histBins=$('#histBins'), histShowGrid=$('#histShowGrid'), histShowFrame=$('#histShowFrame'), histLogY=$('#histLogY'), histXMin=$('#histXMin'), histXMax=$('#histXMax'), histYMax=$('#histYMax'), histFontSize=$('#histFontSize'), histFontSizeVal=$('#histFontSizeVal');
    const histStatsDiagnosticsMode=$('#histStatsDiagnosticsMode'), histStatsComparisonMode=$('#histStatsComparisonMode');
    const histFrequencyCreateMode=$('#histFrequencyCreateMode');
    const histFrequencyTabulateMode=$('#histFrequencyTabulateMode');
    const histBinningMode=$('#histBinningMode');
    const histBinWidth=$('#histBinWidth');
    const histFirstBinCenterAuto=$('#histFirstBinCenterAuto');
    const histFirstBinCenter=$('#histFirstBinCenter');
    const histLastBinCenterAuto=$('#histLastBinCenterAuto');
    const histLastBinCenter=$('#histLastBinCenter');
    if(histFontSize?.dataset){
      histFontSize.dataset.fontBasePt = String(histFontSize.value);
      histDebug('Debug: hist font size base initialized',{ value: histFontSize.value }); // Debug: initial base size
    }
    chartStyle.renderFontSizeLabel({ element: histFontSizeVal, pt: Number(histFontSize.value), input: histFontSize, manual: true });
    state.distributionOptions = getDistributionOptions();
    state.distributionSettings.selections = mergeDistributionSelections(state.distributionSettings?.selections || {}, state.distributionOptions);
    state.frequencySettings = sanitizeHistFrequencySettings(state.frequencySettings);
    state.frequencyInputs = {
      createMode: histFrequencyCreateMode,
      tabulateMode: histFrequencyTabulateMode,
      binningMode: histBinningMode,
      binsCount: histBins,
      binWidth: histBinWidth,
      firstCenterAuto: histFirstBinCenterAuto,
      firstCenter: histFirstBinCenter,
      lastCenterAuto: histLastBinCenterAuto,
      lastCenter: histLastBinCenter
    };
    applyHistPlotMode(histPlotMode?.value || state.plotMode, { schedule: false, syncDefaults: false });
    syncHistFrequencyControls();
    const distListEl=getHistNodeById('histDistributionList');
    const debugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
    if(histPlotMode){
      histPlotMode.value = normalizeHistPlotMode(state.plotMode);
      histPlotMode.addEventListener('change',()=>{
        applyHistPlotMode(histPlotMode.value);
      });
    }
    if(histShowLegend){
      histShowLegend.checked = state.showLegend !== false;
      histShowLegend.addEventListener('change',()=>{
        state.showLegend = !!histShowLegend.checked;
        state.scheduleDraw();
      });
    }
    if(histStatsDiagnosticsMode){
      histStatsDiagnosticsMode.value = sanitizeHistDiagnosticsMode(state.statsSettings?.diagnosticsMode);
      histStatsDiagnosticsMode.addEventListener('change',()=>{
        state.statsSettings.diagnosticsMode = sanitizeHistDiagnosticsMode(histStatsDiagnosticsMode.value);
        syncHistStatsControls();
        state.scheduleDraw();
      });
      state.statsInputs.diagnosticsMode = histStatsDiagnosticsMode;
    }
    if(histStatsComparisonMode){
      histStatsComparisonMode.value = sanitizeHistComparisonMode(state.statsSettings?.comparisonMode);
      histStatsComparisonMode.addEventListener('change',()=>{
        state.statsSettings.comparisonMode = sanitizeHistComparisonMode(histStatsComparisonMode.value);
        syncHistStatsControls();
        state.scheduleDraw();
      });
      state.statsInputs.comparisonMode = histStatsComparisonMode;
    }
    if(distListEl){
      distListEl.innerHTML='';
      state.distributionInputs.checkboxes={};
      state.distributionOptions.forEach((opt,index)=>{
        const wrapper=document.createElement('label');
        wrapper.className='hist-dist-option';
        const input=document.createElement('input');
        input.type='checkbox';
        input.id=`histDist_${opt.key}`;
        input.dataset.distKey=opt.key;
        input.checked=!!state.distributionSettings.selections[opt.key];
        input.addEventListener('change',()=>{
          state.distributionSettings.selections[opt.key]=input.checked;
          if(debugEnabled){
            histDebug('Debug: hist distribution selection change',{ key: opt.key, checked: input.checked });
          }
          state.scheduleDraw();
        });
        const swatch=document.createElement('span');
        swatch.className='hist-dist-swatch';
        swatch.dataset.distKey=opt.key;
        swatch.style.backgroundColor=opt.color;
        wrapper.appendChild(input);
        wrapper.appendChild(swatch);
        const text=document.createElement('span');
        text.textContent=opt.label;
        wrapper.appendChild(text);
        distListEl.appendChild(wrapper);
        state.distributionInputs.checkboxes[opt.key]=input;
      });
      if(debugEnabled){
        histDebug('Debug: hist distribution controls initialized',{ options: state.distributionOptions.map(opt=>opt.key) });
      }
    }
    const histShowPdfInput=getHistNodeById('histShowPdf');
    const histShowCdfInput=getHistNodeById('histShowCdf');
    if(histShowPdfInput){
      histShowPdfInput.checked=!!state.distributionSettings.showPdf;
      histShowPdfInput.addEventListener('change',()=>{
        state.distributionSettings.showPdf=!!histShowPdfInput.checked;
        if(debugEnabled){
          histDebug('Debug: hist showPdf toggle',{ checked: state.distributionSettings.showPdf });
        }
        state.scheduleDraw();
      });
      state.distributionInputs.showPdf=histShowPdfInput;
    }
    if(histShowCdfInput){
      histShowCdfInput.checked=!!state.distributionSettings.showCdf;
      histShowCdfInput.addEventListener('change',()=>{
        state.distributionSettings.showCdf=!!histShowCdfInput.checked;
        if(debugEnabled){
          histDebug('Debug: hist showCdf toggle',{ checked: state.distributionSettings.showCdf });
        }
        state.scheduleDraw();
      });
      state.distributionInputs.showCdf=histShowCdfInput;
    }
    syncHistPlotModeControls();
    syncHistStatsControls();
    histFrequencyCreateMode?.addEventListener('change',()=>{
      applyHistFrequencySettings({ createMode: sanitizeHistFrequencyCreateMode(histFrequencyCreateMode.value) });
    });
    histFrequencyTabulateMode?.addEventListener('change',()=>{
      applyHistFrequencySettings({ tabulateMode: sanitizeHistFrequencyTabulateMode(histFrequencyTabulateMode.value) });
    });
    histBinningMode?.addEventListener('change',()=>{
      applyHistFrequencySettings({ binningMode: sanitizeHistBinningMode(histBinningMode.value) });
    });
    histBinWidth?.addEventListener('input',()=>{
      applyHistFrequencySettings({
        manualBinWidth: sanitizePositiveFinite(histBinWidth.value)
      });
    });
    histFirstBinCenterAuto?.addEventListener('change',()=>{
      applyHistFrequencySettings({
        firstCenterAuto: !!histFirstBinCenterAuto.checked
      });
    });
    histFirstBinCenter?.addEventListener('input',()=>{
      applyHistFrequencySettings({
        firstCenter: sanitizeOptionalFinite(histFirstBinCenter.value)
      });
    });
    histLastBinCenterAuto?.addEventListener('change',()=>{
      applyHistFrequencySettings({
        lastCenterAuto: !!histLastBinCenterAuto.checked
      });
    });
    histLastBinCenter?.addEventListener('input',()=>{
      applyHistFrequencySettings({
        lastCenter: sanitizeOptionalFinite(histLastBinCenter.value)
      });
    });
    [histBins,histShowGrid,histLogY,histXMin,histXMax,histYMax].forEach(el=>el?.addEventListener('input',()=>state.scheduleDraw()));
    histShowFrame?.addEventListener('change',()=>{ histDebug('Debug: hist showFrame change',{checked:histShowFrame.checked}); state.scheduleDraw(); });
    histFontSize.addEventListener('input',()=>{
      if(histFontSize.dataset){
        histFontSize.dataset.fontBasePt = String(histFontSize.value);
        histDebug('Debug: hist font size input manual set',{ value: histFontSize.value }); // Debug: manual slider update
      }
      chartStyle.renderFontSizeLabel({ element: histFontSizeVal, pt: Number(histFontSize.value), input: histFontSize, manual: true });
      state.scheduleDraw();
    });

    // Example + Import
    const example=[
      ['Exam Score'],
      [38],[42],[45],[47],[49],[50],[52],[53],[54],[55],
      [56],[57],[58],[59],[60],[61],[62],[63],[64],[65],
      [66],[67],[68],[69],[70],[71],[72],[73],[74],[75],
      [76],[77],[78],[79],[80],[81],[82],[83],[84],[85],
      [86],[87],[88],[89],[90],[91],[92],[93],[94],[95],
      [96],[97],[98],[99],[100]
    ];
    const exampleBtn = getHistNodeById('histLoadExample');
    if(exampleBtn){
      exampleBtn.addEventListener('click',()=>{
        markHistOverlayPending('example-data');
        state.hot.loadData(example, {
          source: 'example-load',
          recordUndo: true,
          undoLabel: 'table:hist:example-load'
        });
        histDebug('hist example loaded');
        state.scheduleDraw();
      });
    } else {
      console.warn('hist example button missing');
    }
    const histImportBtn=getHistNodeById('histImport');
    const histFileInput=getHistNodeById('histFile');
    const tableImport = Shared.tableImport;
    if(histImportBtn && histFileInput){
      histImportBtn.addEventListener('click',()=>{histFileInput.value=''; histFileInput.click();});
      histFileInput.addEventListener('change',()=>{
        if(!tableImport || typeof tableImport.openFile !== 'function'){
          console.warn('hist import skipped: Shared.tableImport.openFile unavailable');
          return;
        }
        const hasFile = !!(histFileInput?.files && histFileInput.files[0]);
        let forcedOverlay = false;
        if(hasFile){
          forcedOverlay = !!forceHistOverlay('file-import', { message: 'Importing table data...' });
          markHistOverlayPending('file-import');
        }
        const importPromise = tableImport.openFile(histFileInput, {
          hot: state.hot,
          minCols: HIST_DEFAULT_COLS,
          minRows: HIST_DEFAULT_ROWS,
          scheduleDraw: () => {
            markHistOverlayPending('file-import');
            state.scheduleDraw({ force: true, reason: 'import-load', skipThresholdEvaluation: true });
          },
          debugLabel: 'hist',
          onProcessed: info => histDebug('hist data imported',{rows: info?.rows, cols: info?.cols}),
          onCompleted: () => {
            const renderReason = 'import-load';
            markHistOverlayPending(renderReason);
            forceHistOverlay(renderReason, { message: 'Rendering histogram...' });
          }
        });
        Promise.resolve(importPromise).then(result => {
          if(!result && forcedOverlay){
            resolveHistOverlay('file-import-empty');
          }
        }).catch(err => {
          if(forcedOverlay){
            resolveHistOverlay('file-import-error');
          }
          console.error('hist import failed', err);
        });
      });
    } else {
      console.warn('hist import controls missing', {
        hasImportBtn: !!histImportBtn,
        hasFileInput: !!histFileInput
      });
    }

    if (Shared.exporter && typeof Shared.exporter.mountSvgControls === 'function') {
      Shared.exporter.mountSvgControls({
        container: '#histExportControls',
        svgSelector: '#histSvg',
        fileName: 'histogram',
        contextLabel: 'hist-export'
      });
      histDebug('Debug: hist export controls mounted', { hasExporter: true }); // Debug: hist export mount
    } else {
      histDebug('Debug: hist export controls unavailable', { hasExporter: !!Shared.exporter }); // Debug: hist export fallback
    }

    // File Save/Open
    function getPayload(){
      const activeHot = state.hot || state.ensureHotForActiveTab?.();
      if(!activeHot){
        return null;
      }
      const noteControl = state.notes?.control || null;
      const notesText = noteControl && typeof noteControl.getValue === 'function'
        ? noteControl.getValue()
        : (state.notes?.text || '');
      const notesOpen = noteControl && typeof noteControl.isOpen === 'function'
        ? noteControl.isOpen()
        : !!state.notes?.open;
      state.notes.text = notesText;
      state.notes.open = notesOpen;
      const activeManager = ensureHistDataViewsForHot(activeHot, {
        wrapper: getHistNodeById('histHotWrapper'),
        container: activeHot.__histHostContainer || getHistNodeById('histHot')
      });
      syncHistActiveDataViewFromHot(activeHot, 'payload');
      const dataViewsPayload = activeManager?.serialize?.({ includeData: true }) || null;
      const includeDataViews = !!(dataViewsPayload && Array.isArray(dataViewsPayload.views) && dataViewsPayload.views.length > 1);
      const axisSettings = ensureAxisSettings();
      const axisLimits = readHistAxisLimitsFromInputs();
      const plotMode = normalizeHistPlotMode(state.plotMode);
      const c={
        plotMode,
        title:state.titleText,
        xLabel:state.xLabelText,
        yLabel:state.yLabelText,
        showLegend: state.showLegend !== false,
        seriesColors: state.seriesColors && typeof state.seriesColors === 'object' ? { ...state.seriesColors } : {},
        densityLineColors: state.densityLineColors && typeof state.densityLineColors === 'object' ? { ...state.densityLineColors } : {},
        colorScheme: Shared.colorSchemes?.getSelectedSchemeId?.('hist') || 'scientific',
        fill:state.barFill,
        border:state.barBorder,
        borderWidth:state.barBorderWidth,
        bins:$('#histBins').value,
        frequency: sanitizeHistFrequencySettings(state.frequencySettings),
        showGrid:$('#histShowGrid').checked,
        gridStyle:getGridStyle(axisSettings.strokeWidth),
        showFrame:$('#histShowFrame').checked,
        logY:$('#histLogY').checked,
        fontSize:$('#histFontSize').value,
        fontStyles: (exportFontStyles('hist') || undefined),
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
          notationY: axisSettings.y?.notation ?? 'decimal'
        },
        axisLimits,
        distributions:{
          selected:getActiveDistributionKeys(),
          showPdf:!!state.distributionSettings.showPdf,
          showCdf:!!state.distributionSettings.showCdf,
          alpha:state.distributionSettings.alpha,
          options: Array.isArray(state.distributionOptions)
            ? state.distributionOptions.map((entry, index) => sanitizeDistributionOptionEntry(entry, index, entry))
            : []
        },
        stats: {
          diagnosticsMode: sanitizeHistDiagnosticsMode(state.statsSettings?.diagnosticsMode),
          comparisonMode: sanitizeHistComparisonMode(state.statsSettings?.comparisonMode)
        },
        notes: {
          text: notesText,
          open: notesOpen
        },
        labelPositions: state.labelPositions || null
      };
    const payload = {
        type:'hist',
        data: activeHot.getData(),
        exclusions: activeHot?.exportExclusions?.() || Shared.hot.exportExclusions(activeHot),
        filters: activeHot?.exportFilters?.() || Shared.hot.exportFilters(activeHot),
        dataViews: includeDataViews ? dataViewsPayload : undefined,
        activeDataViewId: includeDataViews ? (dataViewsPayload?.activeViewId || null) : undefined,
        config: c
      };
      histDebug('Debug: hist.getPayload captured state', {
        rows: payload.data?.length || 0,
        bins: c.bins,
        hasLogY: c.logY,
        axisLimits: c.axisLimits
      });
      return payload;
    }
    function applyHistPayload(payload, meta){
      const source = meta?.source || 'unknown';
      if(!payload || payload.type !== 'hist'){
        console.warn('hist payload rejected', { source, hasType: !!payload?.type });
        return false;
      }
      if(meta?.flagOverlay){
        const overlayReason = meta?.overlayReason || (typeof source === 'string' ? `payload-${source}` : 'payload');
        markHistOverlayPending(overlayReason);
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
      const rawDataMatrix = Array.isArray(payload.data) ? payload.data : [];
      const serializedViews = (payload.dataViews && typeof payload.dataViews === 'object') ? payload.dataViews : null;
      const requestedActiveViewId = payload.activeDataViewId || serializedViews?.activeViewId || null;
      const dataManager = state.hot
        ? ensureHistDataViewsForHot(state.hot, {
            wrapper: getHistNodeById('histHotWrapper'),
            container: state.hot.__histHostContainer || getHistNodeById('histHot')
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
        syncHistActiveDataViewFromHot(state.hot, 'payload-load');
      }
      const config = payload.config || {};
      importFontStyles('hist', config.fontStyles || null);
      const loadedPlotMode = normalizeHistPlotMode(config.plotMode);
      const legacyFrequencyFallback = config.frequency
        ? config.frequency
        : ((config.bins !== undefined && config.bins !== null)
          ? { binningMode: HIST_BINNING_MODE.count }
          : createDefaultHistFrequencySettings());
      state.frequencySettings = sanitizeHistFrequencySettings(legacyFrequencyFallback);
      applyHistPlotMode(loadedPlotMode, { schedule: false, syncDefaults: false });
      state.titleText = config.title || getHistDefaultTitle(loadedPlotMode);
      state.titleAuto = state.titleText === getHistDefaultTitle(loadedPlotMode);
      state.xLabelText = config.xLabel || state.xLabelText;
      state.yLabelText = config.yLabel || getHistDefaultYLabel(loadedPlotMode, state.frequencySettings);
      state.yLabelAuto = state.yLabelText === getHistDefaultYLabel(loadedPlotMode, state.frequencySettings);
      state.barFill = (typeof config.fill === 'string' && config.fill.trim()) ? config.fill : HIST_DEFAULT_FILL;
      state.barBorder = (typeof config.border === 'string' && config.border.trim()) ? config.border : HIST_DEFAULT_BORDER;
      const loadedBorderWidth = Number(config.borderWidth);
      state.barBorderWidth = Number.isFinite(loadedBorderWidth) && loadedBorderWidth >= 0
        ? loadedBorderWidth
        : HIST_DEFAULT_BORDER_WIDTH;
      const histBinsInput = getHistNodeById('histBins');
      if(histBinsInput){ histBinsInput.value = config.bins || histBinsInput.value; }
      syncHistFrequencyControls();
      const histShowLegendInput = getHistNodeById('histShowLegend');
      state.showLegend = config.showLegend !== false;
      if(histShowLegendInput){ histShowLegendInput.checked = state.showLegend; }
      state.seriesColors = config.seriesColors && typeof config.seriesColors === 'object' ? { ...config.seriesColors } : {};
      state.densityLineColors = config.densityLineColors && typeof config.densityLineColors === 'object' ? { ...config.densityLineColors } : {};
      const histShowGridInput = getHistNodeById('histShowGrid');
      if(histShowGridInput){ histShowGridInput.checked = !!config.showGrid; }
      setGridStyle(config.gridStyle, config.axis?.strokeWidth);
      const histShowFrameInput = getHistNodeById('histShowFrame');
      if(histShowFrameInput){ histShowFrameInput.checked = !!config.showFrame; }
      const histLogYInput = getHistNodeById('histLogY');
      if(histLogYInput){ histLogYInput.checked = !!config.logY; }
      applyHistAxisLimitsToInputs({
        xMin: config.axisLimits?.xMin ?? config.xMin ?? 0,
        xMax: config.axisLimits?.xMax ?? config.xMax ?? null,
        yMax: config.axisLimits?.yMax ?? config.yMax ?? null
      });
      const histFontInput = getHistNodeById('histFontSize');
      const histFontSizeVal = getHistNodeById('histFontSizeVal');
      if(histFontInput){
        histFontInput.value = config.fontSize || histFontInput.value;
        if(histFontInput.dataset){
          histFontInput.dataset.fontBasePt = String(histFontInput.value);
          histDebug('Debug: hist font size base restored',{ value: histFontInput.value });
        }
        chartStyle.renderFontSizeLabel({ element: histFontSizeVal, pt: Number(histFontInput.value), input: histFontInput, manual: true });
      }
      const axisConfig = config.axis || config.axisSettings;
      if(axisConfig){
        applyAxisSettings({
          strokeWidth: axisConfig.strokeWidth,
          color: axisConfig.color,
          tickIntervalX: axisConfig.tickIntervalX ?? axisConfig.xTickInterval ?? axisConfig?.x?.tickInterval ?? null,
          tickIntervalY: axisConfig.tickIntervalY ?? axisConfig.yTickInterval ?? axisConfig?.y?.tickInterval ?? null,
          minorTicksX: axisConfig.minorTicksX ?? axisConfig?.x?.minorTicks ?? false,
          minorTicksY: axisConfig.minorTicksY ?? axisConfig?.y?.minorTicks ?? false,
          minorTickSubdivisionsX: axisConfig.minorTickSubdivisionsX ?? axisConfig.minorSubdivisionsX ?? axisConfig?.x?.minorTickSubdivisions ?? axisConfig?.x?.minorSubdivisions ?? DEFAULT_MINOR_TICK_SUBDIVISIONS,
          minorTickSubdivisionsY: axisConfig.minorTickSubdivisionsY ?? axisConfig.minorSubdivisionsY ?? axisConfig?.y?.minorTickSubdivisions ?? axisConfig?.y?.minorSubdivisions ?? DEFAULT_MINOR_TICK_SUBDIVISIONS,
        notationX: axisConfig.notationX ?? axisConfig.axisNotationX ?? axisConfig?.x?.notation ?? 'decimal',
        notationY: axisConfig.notationY ?? axisConfig.axisNotationY ?? axisConfig?.y?.notation ?? 'decimal'
        });
        histDebug('Debug: hist axis settings restored',{ axis: ensureAxisSettings() });
      }
      if(!Array.isArray(state.distributionOptions) || !state.distributionOptions.length){
        state.distributionOptions = getDistributionOptions();
      }
      if(Array.isArray(config.distributions?.options) && config.distributions.options.length){
        state.distributionOptions = mergeDistributionOptions(state.distributionOptions, config.distributions.options);
      }
      const defaultSelections = mergeDistributionSelections({}, state.distributionOptions);
      if(config.distributions){
        const selections = { ...defaultSelections };
        const selectedKeys = Array.isArray(config.distributions.selected) ? config.distributions.selected : [];
        Object.keys(selections).forEach(key => {
          selections[key] = selectedKeys.includes(key);
        });
        state.distributionSettings.selections = selections;
        state.distributionSettings.showPdf = config.distributions.showPdf !== undefined ? !!config.distributions.showPdf : state.distributionSettings.showPdf;
        state.distributionSettings.showCdf = config.distributions.showCdf !== undefined ? !!config.distributions.showCdf : state.distributionSettings.showCdf;
        const alphaCandidate = Number(config.distributions.alpha);
        if(Number.isFinite(alphaCandidate) && alphaCandidate > 0){
          state.distributionSettings.alpha = alphaCandidate;
        }
      } else {
        state.distributionSettings.selections = mergeDistributionSelections(defaultSelections, state.distributionOptions);
      }
      if(state.distributionInputs?.checkboxes){
        Object.entries(state.distributionInputs.checkboxes).forEach(([key,input]) => {
          if(input){ input.checked = !!state.distributionSettings.selections[key]; }
        });
      }
      const distListEl = getHistNodeById('histDistributionList');
      if(distListEl){
        const colorByKey = {};
        state.distributionOptions.forEach(option => {
          if(option && option.key){
            colorByKey[option.key] = option.color;
          }
        });
        distListEl.querySelectorAll('.hist-dist-swatch[data-dist-key]').forEach(node => {
          const key = node.dataset ? node.dataset.distKey : '';
          if(key && colorByKey[key]){
            node.style.backgroundColor = colorByKey[key];
          }
        });
      }
      if(state.distributionInputs?.showPdf){
        state.distributionInputs.showPdf.checked = !!state.distributionSettings.showPdf;
      }
      if(state.distributionInputs?.showCdf){
        state.distributionInputs.showCdf.checked = !!state.distributionSettings.showCdf;
      }
      state.statsSettings.diagnosticsMode = sanitizeHistDiagnosticsMode(config.stats?.diagnosticsMode);
      state.statsSettings.comparisonMode = sanitizeHistComparisonMode(config.stats?.comparisonMode);
      if(state.statsInputs?.diagnosticsMode){
        state.statsInputs.diagnosticsMode.value = state.statsSettings.diagnosticsMode;
      }
      if(state.statsInputs?.comparisonMode){
        state.statsInputs.comparisonMode.value = state.statsSettings.comparisonMode;
      }
      syncHistStatsControls();
      if(config.notes && typeof config.notes === 'object'){
        state.notes.text = config.notes.text == null ? '' : String(config.notes.text);
        state.notes.open = !!config.notes.open;
      }else if(typeof config.notes === 'string'){
        state.notes.text = config.notes;
        state.notes.open = !!state.notes.open;
      }else{
        state.notes.text = '';
        state.notes.open = false;
      }
      if(state.notes.control){
        state.notes.control.setValue(state.notes.text);
        state.notes.control.setOpen(state.notes.open);
      }
      // Restore label positions if saved
      if(config.labelPositions){
        state.labelPositions = {
          title: config.labelPositions.title || null,
          xLabel: config.labelPositions.xLabel || null,
          yLabel: config.labelPositions.yLabel || null,
          legend: config.labelPositions.legend || null
        };
      }
      if(!skipDraw && typeof state.scheduleDraw === 'function'){
        state.scheduleDraw();
      }
      if(scheduleBackup){
        state.scheduleDraw = scheduleBackup;
      }
      const rowCount = Array.isArray(dataToLoad) ? dataToLoad.length : 0;
      histDebug('Debug: hist payload applied', { source, rows: rowCount });
      return true;
    }
    hist.getPayload = getPayload;
    hist.captureEmptyPayloadTemplate = function captureHistEmptyPayloadTemplate(){
    const snapshot = createImmutableHistDefaultPayload();
    histDebug('Debug: hist empty payload template captured', { hasTemplate: !!snapshot });
    return snapshot;
  };
  hist.restoreEmptyPayloadTemplate = function restoreHistEmptyPayloadTemplate(template, options = {}){
    if(!template || typeof template !== 'object'){
      histDebug('Debug: hist empty payload template restore skipped', { reason: 'invalid-template', options });
      return false;
    }
    emptyPayloadTemplate = cloneSimple(template);
    histDebug('Debug: hist empty payload template restored', { hasTemplate: !!emptyPayloadTemplate, reason: options.reason || 'unspecified' });
    return !!emptyPayloadTemplate;
  };
  hist.createEmptyPayload = function createEmptyHistPayload(){
      hist.ensure();
      return createImmutableHistDefaultPayload();
    };
    hist.save = async function(){
      histDebug('Debug: hist.save invoked', { hasHandle: !!state.fileHandle });
      if(!fileIO || typeof fileIO.saveGraphFile !== 'function'){
        console.error('hist.save missing fileIO.saveGraphFile');
        return;
      }
      const result = await fileIO.saveGraphFile({
        context: 'hist',
        fileHandle: state.fileHandle,
        getPayload,
        fileName: state.fileName,
        downloadFileName: state.fileName,
        setFileHandle: handle => { state.fileHandle = handle; },
        setFileName: name => { state.fileName = name; }
      });
      histDebug('Debug: hist.save result', result);
    };
    hist.saveAs = async function(){
      histDebug('Debug: hist.saveAs invoked', { currentName: state.fileName });
      if(!fileIO || typeof fileIO.saveGraphFileAs !== 'function'){
        console.error('hist.saveAs missing fileIO.saveGraphFileAs');
        return;
      }
      const result = await fileIO.saveGraphFileAs({
        context: 'hist',
        getPayload,
        fileName: state.fileName,
        downloadFileName: state.fileName,
        setFileHandle: handle => { state.fileHandle = handle; },
        setFileName: name => { state.fileName = name; }
      });
      histDebug('Debug: hist.saveAs result', result);
    };
    hist.open = async function(){
      histDebug('Debug: hist.open invoked');
      if(!fileIO || typeof fileIO.openGraphFile !== 'function'){
        console.error('hist.open missing fileIO.openGraphFile');
        return;
      }
      const result = await fileIO.openGraphFile({
        context: 'hist',
        setFileHandle: handle => { state.fileHandle = handle; },
        setFileName: name => { state.fileName = name; },
        loadFromFile: file => hist.loadFromFile(file),
        triggerInput: () => {
          const input = getHistNodeById('histGraphFile');
          if(input){
            input.value='';
            input.click();
          }
        }
      });
      histDebug('Debug: hist.open result', result);
    };
    hist.loadFromFile = function(file){
      const apply = payload => applyHistPayload(payload, { source: 'file', flagOverlay: true, overlayReason: 'graph-file' });
      if(file instanceof Blob){
        const reader=new FileReader();
        reader.onload=e=>{
          try{
            const obj=JSON.parse(e.target.result);
            if(!apply(obj)){
              console.warn('hist payload rejected from file', { hasType: !!obj?.type });
            }
          }catch(err){
            console.error('loadHistGraph error',err);
          }
        };
        reader.readAsText(file);
        return;
      }
      if(typeof file === 'string'){
        try{
          const parsed = JSON.parse(file);
          if(!apply(parsed)){
            console.warn('hist payload rejected from string');
          }
        }catch(err){
          console.error('loadHistGraph string parse error',err);
        }
        return;
      }
      if(file && typeof file === 'object'){
        apply(file);
      }
    };
    hist.loadFromPayload = function loadFromPayload(payload, options = {}){
      if(!applyHistPayload(payload, { source: 'payload', ...options })){
        console.warn('hist payload application failed', { source: 'payload' });
      }
    };
    // Wire buttons
    getHistNodeById('openHistGraph')?.addEventListener('click', hist.open);
    getHistNodeById('saveHistGraph')?.addEventListener('click', hist.save);
    getHistNodeById('saveAsHist').addEventListener('click', hist.saveAs);
    getHistNodeById('histGraphFile').addEventListener('change',e=>{const f=e.target.files[0]; if(f){ state.fileName=f.name; state.fileHandle=null; hist.loadFromFile(f); }});
  }

  function initNotes(){
    const stack = queryHistRoot('#histGraphPanel .hist-plot-stack');
    if(!stack){
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        histDebug('Debug: hist notes mount skipped (missing stack)');
      }
      return;
    }
    const helper = Shared.notes;
    if(!helper || typeof helper.mountFoldable !== 'function'){
      console.warn('hist notes helper unavailable', { hasSharedNotes: !!helper });
      return;
    }
    if(state.notes?.control?.root && state.notes.control.root.isConnected){
      state.notes.control.setValue(state.notes.text || '');
      state.notes.control.setOpen(!!state.notes.open);
      return;
    }
    state.notes.control = helper.mountFoldable({
      container: stack,
      id: 'hist-notes',
      title: 'Notes',
      placeholder: 'Write notes about the data being analyzed...',
      richText: true,
      scopeId: 'hist',
      fontKey: 'notes',
      value: state.notes.text || '',
      open: !!state.notes.open,
      onChange: value => {
        state.notes.text = value == null ? '' : String(value);
      },
      onToggle: open => {
        state.notes.open = !!open;
        if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
          histDebug('Debug: hist notes toggled', { open: state.notes.open });
        }
      }
    });
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      histDebug('Debug: hist notes initialized', {
        mounted: !!state.notes.control,
        open: !!state.notes.open
      });
    }
  }

  // Compute and render histogram summary statistics
  function formatNumber(value, decimals){
    const formatter = Shared.formatters?.formatFixedNumber;
    if(typeof formatter === 'function'){
      return formatter(value, { decimals, emptyValue: '-' });
    }
    const num = Number(value);
    if(!Number.isFinite(num)){
      return '-';
    }
    const places = Number.isFinite(decimals) ? decimals : 4;
    return num.toFixed(places);
  }

  function formatPValue(value){
    const num = Number(value);
    if(!Number.isFinite(num)){
      return '\u2014';
    }
    const formatter = Shared.formatters?.formatPValue || Shared.formatPValue;
    if(typeof formatter === 'function'){
      return formatter(num);
    }
    return num <= 0 ? '0' : num.toExponential(5);
  }

  function computeHistPercentile(sorted, p){
    if(!Array.isArray(sorted) || !sorted.length){
      return NaN;
    }
    const pos = (sorted.length - 1) * p;
    const base = Math.floor(pos);
    const rest = pos - base;
    const baseVal = sorted[base];
    const nextVal = sorted[base + 1] !== undefined ? sorted[base + 1] : baseVal;
    return baseVal + rest * (nextVal - baseVal);
  }

  function computeHistAicc(fit, parameterCount, sampleSize){
    const logLikelihood = Number(fit?.logLikelihood);
    const n = Number(sampleSize);
    const k = Math.max(1, Number(parameterCount) || 1);
    if(!Number.isFinite(logLikelihood) || !Number.isFinite(n) || n <= k + 1){
      return NaN;
    }
    const aic = (2 * k) - (2 * logLikelihood);
    return aic + ((2 * k * (k + 1)) / Math.max(n - k - 1, 1));
  }

  function computeHistSummary(values){
    const cleaned = Array.isArray(values)
      ? values.map(Number).filter(Number.isFinite).slice().sort((a, b) => a - b)
      : [];
    const n = cleaned.length;
    if(!n){
      return null;
    }
    const mean = cleaned.reduce((sum, value) => sum + value, 0) / n;
    const median = global.jStat?.median ? global.jStat.median(cleaned) : computeHistPercentile(cleaned, 0.5);
    const variance = n > 1
      ? cleaned.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / (n - 1)
      : NaN;
    const sd = Number.isFinite(variance) && variance >= 0 ? Math.sqrt(variance) : NaN;
    const sem = n > 1 && Number.isFinite(sd) ? sd / Math.sqrt(n) : NaN;
    const q1 = computeHistPercentile(cleaned, 0.25);
    const q3 = computeHistPercentile(cleaned, 0.75);
    const iqr = Number.isFinite(q1) && Number.isFinite(q3) ? q3 - q1 : NaN;
    const cv = Number.isFinite(sd) && mean !== 0 ? (sd / Math.abs(mean)) * 100 : NaN;
    let skewness = NaN;
    let kurtosis = NaN;
    if(n >= 3 && Number.isFinite(sd) && sd > 0){
      const zPowers = cleaned.map(value => (value - mean) / sd);
      const z3 = zPowers.reduce((sum, value) => sum + Math.pow(value, 3), 0);
      skewness = (n / ((n - 1) * (n - 2))) * z3;
      if(n >= 4){
        const z4 = zPowers.reduce((sum, value) => sum + Math.pow(value, 4), 0);
        kurtosis = ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * z4
          - ((3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3)));
      }
    }
    const strictlyPositive = cleaned.every(value => value > 0);
    const geometricMean = strictlyPositive
      ? Math.exp(cleaned.reduce((sum, value) => sum + Math.log(value), 0) / n)
      : NaN;
    const harmonicMean = strictlyPositive
      ? n / cleaned.reduce((sum, value) => sum + (1 / value), 0)
      : NaN;
    return {
      values: cleaned,
      n,
      mean,
      median,
      variance,
      sd,
      sem,
      min: cleaned[0],
      q1,
      q3,
      max: cleaned[n - 1],
      iqr,
      cv,
      skewness,
      kurtosis,
      geometricMean,
      harmonicMean
    };
  }

  function computeHistNormalFitDiagnostic(values, options = {}){
    const statsHelpers = Shared.stats || {};
    if(typeof statsHelpers.fitDistribution !== 'function' || typeof statsHelpers.goodnessOfFit !== 'function'){
      return null;
    }
    const fit = statsHelpers.fitDistribution(values, { distribution: 'normal' });
    if(!fit || fit.valid === false){
      return {
        available: false,
        fit,
        gof: null,
        message: fit?.message || 'Normal fit unavailable.'
      };
    }
    const alpha = Number.isFinite(options.alpha) && options.alpha > 0 ? Number(options.alpha) : 0.05;
    const gof = statsHelpers.goodnessOfFit(values, {
      distribution: 'normal',
      fit,
      params: fit.params,
      pdf: fit.pdf,
      cdf: fit.cdf,
      alpha
    });
    return {
      available: !!gof,
      fit,
      gof: gof || null,
      message: gof ? null : 'Normal goodness-of-fit unavailable.'
    };
  }

  function computeHistLognormalComparison(values){
    const statsHelpers = Shared.stats || {};
    if(typeof statsHelpers.fitDistribution !== 'function'){
      return null;
    }
    const cleaned = Array.isArray(values) ? values.map(Number).filter(Number.isFinite) : [];
    if(cleaned.length < 2){
      return null;
    }
    const normalFit = statsHelpers.fitDistribution(cleaned, { distribution: 'normal' });
    const lognormalFit = statsHelpers.fitDistribution(cleaned, { distribution: 'lognormal' });
    const normalAicc = computeHistAicc(normalFit, 2, cleaned.length);
    const lognormalAicc = computeHistAicc(lognormalFit, 2, cleaned.length);
    const preferred = (Number.isFinite(lognormalAicc) && (!Number.isFinite(normalAicc) || lognormalAicc < normalAicc))
      ? 'lognormal'
      : 'normal';
    return {
      preferred,
      normalAicc,
      lognormalAicc,
      deltaAicc: Number.isFinite(normalAicc) && Number.isFinite(lognormalAicc)
        ? Math.abs(normalAicc - lognormalAicc)
        : NaN,
      normalFit,
      lognormalFit
    };
  }

  function computeHistKolmogorovSmirnovTwoSample(a, b){
    const arrA = (Array.isArray(a) ? a : []).map(Number).filter(Number.isFinite).sort((x, y) => x - y);
    const arrB = (Array.isArray(b) ? b : []).map(Number).filter(Number.isFinite).sort((x, y) => x - y);
    const na = arrA.length;
    const nb = arrB.length;
    if(!na || !nb){
      return {
        available: false,
        D: NaN,
        p: NaN,
        nA: na,
        nB: nb,
        method: 'asymptotic',
        alternative: 'two-sided',
        message: 'Kolmogorov-Smirnov test needs at least one observation per group.'
      };
    }
    let i = 0;
    let j = 0;
    let d = 0;
    while(i < na || j < nb){
      const nextA = i < na ? arrA[i] : Infinity;
      const nextB = j < nb ? arrB[j] : Infinity;
      const x = Math.min(nextA, nextB);
      while(i < na && arrA[i] <= x){
        i += 1;
      }
      while(j < nb && arrB[j] <= x){
        j += 1;
      }
      d = Math.max(d, Math.abs((i / na) - (j / nb)));
    }
    const effectiveN = (na * nb) / (na + nb);
    const sqrtN = Math.sqrt(Math.max(effectiveN, 0));
    const lambda = (sqrtN + 0.12 + (0.11 / (sqrtN || 1))) * d;
    let sum = 0;
    for(let k = 1; k <= 100; k += 1){
      const term = Math.exp(-2 * k * k * lambda * lambda);
      sum += ((k % 2 ? 1 : -1) * term);
      if(term < 1e-10){
        break;
      }
    }
    return {
      available: true,
      D: d,
      p: Math.max(0, Math.min(1, 2 * sum)),
      nA: na,
      nB: nb,
      method: 'asymptotic',
      alternative: 'two-sided'
    };
  }

  function renderHistStatsModel(target, model, append){
    if(!target || !model){
      return;
    }
    if(Shared.statsTable && typeof Shared.statsTable.render === 'function'){
      Shared.statsTable.render({ target, append: !!append, ...model });
      return;
    }
    const table = document.createElement('table');
    table.className = 'stats-table';
    if(model.caption){
      const caption = document.createElement('caption');
      caption.textContent = model.caption;
      table.appendChild(caption);
    }
    const headerRow = document.createElement('tr');
    (model.columns || []).forEach(col => {
      const th = document.createElement('th');
      th.textContent = col.label;
      headerRow.appendChild(th);
    });
    table.appendChild(headerRow);
    (model.rows || []).forEach(row => {
      const bodyRow = document.createElement('tr');
      (model.columns || []).forEach(col => {
        const td = document.createElement('td');
        td.textContent = Array.isArray(row) ? row[col.key] : row[col.key];
        bodyRow.appendChild(td);
      });
      table.appendChild(bodyRow);
    });
    if(!append){
      clearHistStatsReportHost(target);
      target.innerHTML = '';
    }
    target.appendChild(table);
    if(Array.isArray(model.footnotes) && model.footnotes.length){
      const footnoteList = document.createElement('div');
      footnoteList.className = 'stats-table-footnotes';
      model.footnotes.forEach(note => {
        const item = document.createElement('div');
        item.className = 'stats-table-footnote';
        item.textContent = note;
        footnoteList.appendChild(item);
      });
      target.appendChild(footnoteList);
    }
  }

  function updateHistStats(seriesEntries){
    const target = getHistNodeById('histStatsResults');
    const debugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
    const graphLabel = getHistGraphLabel(state.plotMode);
    if(!target){
      if(debugEnabled){
        histDebug('Debug: hist stats target missing');
      }
      return;
    }
    ensureHistStatsReportHost(target);
    const entries = Array.isArray(seriesEntries) ? seriesEntries.filter(entry => Array.isArray(entry?.values) && entry.values.some(Number.isFinite)) : [];
    syncHistStatsControls(entries.length);
    clearHistStatsReportHost(target);
    target.innerHTML = '';
    if(!entries.length){
      target.textContent = 'No data';
      if(debugEnabled){
        histDebug('Debug: hist stats skipped (no values)');
      }
      return;
    }
    const alpha = Number(state.distributionSettings?.alpha);
    const diagnosticsMode = sanitizeHistDiagnosticsMode(state.statsSettings?.diagnosticsMode);
    const comparisonMode = sanitizeHistComparisonMode(state.statsSettings?.comparisonMode);
    const summaries = entries.map(entry => {
      const summary = computeHistSummary(entry.values);
      const bestFit = Array.isArray(entry.distributionSummaries)
        ? entry.distributionSummaries.find(candidate => candidate?.fit?.valid !== false && candidate?.fit)
        : null;
      return {
        key: entry.key,
        colIndex: entry.colIndex,
        label: entry.label || `Column ${Number(entry.colIndex) + 1}`,
        summary,
        bestFit: bestFit?.fit?.label || null,
        diagnostics: diagnosticsMode !== 'off'
          ? computeHistNormalFitDiagnostic(entry.values, { alpha: Number.isFinite(alpha) && alpha > 0 ? alpha : 0.05 })
          : null,
        modelComparison: diagnosticsMode === 'normal-vs-lognormal'
          ? computeHistLognormalComparison(entry.values)
          : null
      };
    }).filter(entry => !!entry.summary);
    const totalObservations = summaries.reduce((sum, entry) => sum + entry.summary.n, 0);
    const descriptiveRows = summaries.map(entry => ({
      column: entry.label,
      n: entry.summary.n,
      mean: formatNumber(entry.summary.mean, 2),
      median: formatNumber(entry.summary.median, 2),
      sd: formatNumber(entry.summary.sd, 2),
      sem: formatNumber(entry.summary.sem, 2),
      variance: formatNumber(entry.summary.variance, 2),
      cv: formatNumber(entry.summary.cv, 2),
      min: formatNumber(entry.summary.min, 2),
      q1: formatNumber(entry.summary.q1, 2),
      q3: formatNumber(entry.summary.q3, 2),
      max: formatNumber(entry.summary.max, 2),
      iqr: formatNumber(entry.summary.iqr, 2)
    }));
    const shapeRows = summaries.map(entry => ({
      column: entry.label,
      skewness: formatNumber(entry.summary.skewness, 3),
      kurtosis: formatNumber(entry.summary.kurtosis, 3),
      geometricMean: formatNumber(entry.summary.geometricMean, 2),
      harmonicMean: formatNumber(entry.summary.harmonicMean, 2),
      bestFit: entry.bestFit || '\u2014'
    }));
    const bestFitFootnotes = summaries
      .filter(entry => entry.bestFit)
      .map(entry => `${entry.label}: best fit ${entry.bestFit}`);
    renderHistStatsModel(target, {
      caption: 'Descriptive statistics',
      columns: [
        { key: 'column', label: 'Column' },
        { key: 'n', label: 'N', align: 'right' },
        { key: 'mean', label: 'Mean', align: 'right' },
        { key: 'median', label: 'Median', align: 'right' },
        { key: 'sd', label: 'SD', align: 'right' },
        { key: 'sem', label: 'SEM', align: 'right' },
        { key: 'variance', label: 'Variance', align: 'right' },
        { key: 'cv', label: 'CV (%)', align: 'right' },
        { key: 'min', label: 'Min', align: 'right' },
        { key: 'q1', label: 'Q1', align: 'right' },
        { key: 'q3', label: 'Q3', align: 'right' },
        { key: 'max', label: 'Max', align: 'right' },
        { key: 'iqr', label: 'IQR', align: 'right' }
      ],
      rows: descriptiveRows,
      footnotes: bestFitFootnotes,
      options: {
        fileName: 'histogram-stats',
        contextLabel: 'hist-stats'
      }
    }, false);
    renderHistStatsModel(target, {
      caption: 'Distribution shape',
      columns: [
        { key: 'column', label: 'Column' },
        { key: 'skewness', label: 'Skewness', align: 'right' },
        { key: 'kurtosis', label: 'Kurtosis', align: 'right' },
        { key: 'geometricMean', label: 'Geometric mean', align: 'right' },
        { key: 'harmonicMean', label: 'Harmonic mean', align: 'right' },
        { key: 'bestFit', label: 'Best fit' }
      ],
      rows: shapeRows,
      footnotes: ['Geometric and harmonic means are shown only for strictly positive series.'],
      options: {
        fileName: 'histogram-shape-stats',
        contextLabel: 'hist-shape-stats'
      }
    }, true);
    const diagnosticRows = diagnosticsMode === 'off'
      ? []
      : summaries.map(entry => ({
        column: entry.label,
        ksStatistic: formatNumber(entry.diagnostics?.gof?.ks?.statistic, 4),
        ksPValue: formatPValue(entry.diagnostics?.gof?.ks?.pValue),
        adStatistic: formatNumber(entry.diagnostics?.gof?.ad?.statistic, 4),
        adPValue: formatPValue(entry.diagnostics?.gof?.ad?.pValue),
        preferred: entry.modelComparison?.preferred === 'lognormal' ? 'Log-normal' : 'Normal',
        normalAicc: formatNumber(entry.modelComparison?.normalAicc, 2),
        lognormalAicc: formatNumber(entry.modelComparison?.lognormalAicc, 2),
        deltaAicc: formatNumber(entry.modelComparison?.deltaAicc, 2)
      }));
    if(diagnosticRows.length){
      const diagnosticColumns = [
        { key: 'column', label: 'Column' },
        { key: 'ksStatistic', label: 'Normal KS D', align: 'right' },
        { key: 'ksPValue', label: 'Normal KS p', align: 'right' },
        { key: 'adStatistic', label: 'Normal AD A\u00b2', align: 'right' },
        { key: 'adPValue', label: 'Normal AD p', align: 'right' }
      ];
      if(diagnosticsMode === 'normal-vs-lognormal'){
        diagnosticColumns.push(
          { key: 'preferred', label: 'Preferred model' },
          { key: 'normalAicc', label: 'Normal AICc', align: 'right' },
          { key: 'lognormalAicc', label: 'Log-normal AICc', align: 'right' },
          { key: 'deltaAicc', label: '\u0394AICc', align: 'right' }
        );
      }
      renderHistStatsModel(target, {
        caption: diagnosticsMode === 'normal-vs-lognormal' ? 'Fit diagnostics' : 'Normal fit diagnostics',
        columns: diagnosticColumns,
        rows: diagnosticRows,
        footnotes: diagnosticsMode === 'normal-vs-lognormal'
          ? ['Lower AICc indicates the preferred parametric model for that series.']
          : [],
        options: {
          fileName: 'histogram-fit-diagnostics',
          contextLabel: 'hist-fit-diagnostics'
        }
      }, true);
    }
    let ksResult = null;
    if(comparisonMode === 'ks'){
      if(summaries.length === 2){
        ksResult = computeHistKolmogorovSmirnovTwoSample(summaries[0].summary.values, summaries[1].summary.values);
        renderHistStatsModel(target, {
          caption: 'Distribution comparison',
          columns: [
            { key: 'seriesA', label: 'Series A' },
            { key: 'seriesB', label: 'Series B' },
            { key: 'd', label: 'KS D', align: 'right' },
            { key: 'p', label: 'P value', align: 'right' },
            { key: 'method', label: 'Method' }
          ],
          rows: [{
            seriesA: summaries[0].label,
            seriesB: summaries[1].label,
            d: formatNumber(ksResult.D, 4),
            p: formatPValue(ksResult.p),
            method: ksResult.method || '\u2014'
          }],
          footnotes: ['Two-sample Kolmogorov-Smirnov compares the full empirical distributions, not only their means or medians.'],
          options: {
            fileName: 'histogram-distribution-comparison',
            contextLabel: 'hist-distribution-comparison'
          }
        }, true);
      }else{
        renderHistStatsModel(target, {
          caption: 'Distribution comparison',
          columns: [{ key: 'note', label: 'Note' }],
          rows: [{ note: 'Kolmogorov-Smirnov comparison is available only when exactly two series are visible.' }],
          options: {
            fileName: 'histogram-distribution-comparison',
            contextLabel: 'hist-distribution-comparison'
          }
        }, true);
      }
    }
    if(Shared.statsReporting && typeof Shared.statsReporting.appendReportPanel === 'function'){
      const methods = [
        `${graphLabel} descriptive statistics were computed for ${summaries.length} series spanning ${totalObservations} numeric observations.`,
        'Expanded summaries include SEM, variance, CV, IQR, skewness, kurtosis, and positive-only geometric and harmonic means.'
      ];
      if(diagnosticsMode === 'normal-fit'){
        methods.push('Normal fit diagnostics report KS and Anderson-Darling goodness-of-fit against the fitted normal model.');
      }else if(diagnosticsMode === 'normal-vs-lognormal'){
        methods.push('Fit diagnostics report normal-model KS and Anderson-Darling results and compare normal versus log-normal fits with AICc.');
      }
      if(comparisonMode === 'ks' && summaries.length === 2 && ksResult?.available){
        methods.push('A two-sample Kolmogorov-Smirnov test compared the two visible series.');
      }
      const resultFragments = summaries.map(entry => `${entry.label}: mean = ${formatNumber(entry.summary.mean, 2)}, median = ${formatNumber(entry.summary.median, 2)}, SD = ${formatNumber(entry.summary.sd, 2)}, skewness = ${formatNumber(entry.summary.skewness, 3)}.`);
      if(comparisonMode === 'ks' && summaries.length === 2 && ksResult?.available){
        resultFragments.push(`KS D = ${formatNumber(ksResult.D, 4)}, p = ${formatPValue(ksResult.p)}.`);
      }
      Shared.statsReporting.appendReportPanel(target, {
        methodsText: methods.join(' '),
        resultsText: resultFragments.join(' '),
        analysisSpec: {
          component: 'hist',
          n: totalObservations,
          seriesCount: summaries.length,
          diagnosticsMode,
          comparisonMode,
          bestFit: bestFitFootnotes.length ? bestFitFootnotes.join('; ') : null,
          ksStatistic: ksResult?.available ? ksResult.D : null,
          ksPValue: ksResult?.available ? ksResult.p : null
        }
      }, { title: 'Reporting and reproducibility' });
    }
    if(debugEnabled){
      histDebug('Debug: hist stats rendered', {
        summaryRows: descriptiveRows.length,
        diagnosticsMode,
        comparisonMode,
        hasKs: !!ksResult?.available
      });
    }
  }

  function getHistFrequencyMetricLabel(settings){
    const safe = sanitizeHistFrequencySettings(settings);
    const cumulative = safe.createMode === HIST_FREQUENCY_CREATE_MODE.cumulative;
    if(safe.tabulateMode === HIST_FREQUENCY_TABULATE_MODE.fraction){
      return cumulative ? 'Cumulative fraction' : 'Relative frequency';
    }
    if(safe.tabulateMode === HIST_FREQUENCY_TABULATE_MODE.percent){
      return cumulative ? 'Cumulative frequency (%)' : 'Relative frequency (%)';
    }
    return cumulative ? 'Cumulative count' : 'Count';
  }

  function convertHistCountToDisplay(rawCount, sampleCount, settings){
    const safe = sanitizeHistFrequencySettings(settings);
    const raw = Number(rawCount);
    if(!Number.isFinite(raw)){
      return NaN;
    }
    if(safe.tabulateMode === HIST_FREQUENCY_TABULATE_MODE.fraction){
      return sampleCount > 0 ? raw / sampleCount : 0;
    }
    if(safe.tabulateMode === HIST_FREQUENCY_TABULATE_MODE.percent){
      return sampleCount > 0 ? (raw * 100) / sampleCount : 0;
    }
    return raw;
  }

  function isHistIntegerLike(value){
    const numeric = Number(value);
    if(!Number.isFinite(numeric)){
      return false;
    }
    const rounded = Math.round(numeric);
    const tolerance = 1e-10 * Math.max(1, Math.abs(numeric));
    return Math.abs(numeric - rounded) <= tolerance;
  }

  function roundDownToHistNice125(value){
    const numeric = Number(value);
    if(!Number.isFinite(numeric) || numeric <= 0){
      return null;
    }
    const exponent = Math.floor(Math.log10(numeric));
    if(!Number.isFinite(exponent)){
      return null;
    }
    const scale = 10 ** exponent;
    if(!Number.isFinite(scale) || scale <= 0){
      return null;
    }
    const normalized = numeric / scale;
    let mantissa = 1;
    if(normalized >= 5){
      mantissa = 5;
    }else if(normalized >= 2){
      mantissa = 2;
    }
    const rounded = mantissa * scale;
    return Number.isFinite(rounded) && rounded > 0 ? rounded : null;
  }

  function normalizeHistBinNumber(value){
    const numeric = Number(value);
    if(!Number.isFinite(numeric)){
      return numeric;
    }
    const normalized = Number(numeric.toPrecision(12));
    return Object.is(normalized, -0) ? 0 : normalized;
  }

  function computeHistAutoBinWidth(seriesEntries, options = {}){
    const safeEntries = Array.isArray(seriesEntries) ? seriesEntries : [];
    const lower = Number(options.min);
    const upper = Number(options.max);
    const hasLower = Number.isFinite(lower);
    const hasUpper = Number.isFinite(upper);
    const datasetWidths = [];
    const pooledValues = [];
    safeEntries.forEach(entry => {
      const rawValues = Array.isArray(entry?.values) ? entry.values : [];
      let localMin = Infinity;
      let localMax = -Infinity;
      let localCount = 0;
      rawValues.forEach(value => {
        const numeric = Number(value);
        if(!Number.isFinite(numeric)){
          return;
        }
        if(hasLower && numeric < lower){
          return;
        }
        if(hasUpper && numeric > upper){
          return;
        }
        pooledValues.push(numeric);
        localCount += 1;
        if(numeric < localMin){
          localMin = numeric;
        }
        if(numeric > localMax){
          localMax = numeric;
        }
      });
      if(localCount < 2){
        return;
      }
      const range = localMax - localMin;
      if(!(range > 0)){
        return;
      }
      const datasetBinCount = 1 + Math.log2(localCount);
      const width = range / datasetBinCount;
      if(Number.isFinite(width) && width > 0){
        datasetWidths.push(width);
      }
    });

    if(!datasetWidths.length){
      if(pooledValues.length < 2){
        return null;
      }
      let pooledMin = Infinity;
      let pooledMax = -Infinity;
      pooledValues.forEach(value => {
        if(value < pooledMin){
          pooledMin = value;
        }
        if(value > pooledMax){
          pooledMax = value;
        }
      });
      const pooledRange = pooledMax - pooledMin;
      if(!(pooledRange > 0)){
        return null;
      }
      const pooledBinCount = 1 + Math.log2(pooledValues.length);
      const pooledWidth = pooledRange / pooledBinCount;
      if(Number.isFinite(pooledWidth) && pooledWidth > 0){
        datasetWidths.push(pooledWidth);
      }
    }

    if(!datasetWidths.length){
      return null;
    }
    const averageWidth = datasetWidths.reduce((sum, width) => sum + width, 0) / datasetWidths.length;
    let width = roundDownToHistNice125(averageWidth);
    if(!(Number.isFinite(width) && width > 0)){
      return null;
    }
    const allInteger = pooledValues.length > 0 && pooledValues.every(isHistIntegerLike);
    if(allInteger){
      width = Math.floor(width);
      if(width <= 0){
        width = 1;
      }
    }
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      histDebug('Debug: hist auto bin width (Prism-compatible)', {
        datasetCount: safeEntries.length,
        pooledCount: pooledValues.length,
        averageWidth,
        roundedWidth: width,
        allInteger
      });
    }
    return width;
  }

  function clampHistogramBinCount(value){
    const numeric = Number(value);
    if(!Number.isFinite(numeric)){
      return 1;
    }
    return Math.max(1, Math.min(2000, Math.round(numeric)));
  }

  function buildUniformEdgesFromCount(min, max, count){
    const binCount = clampHistogramBinCount(count);
    const span = max - min;
    const width = span > 0 ? span / binCount : 1;
    return Array.from({ length: binCount + 1 }, (_, index) => min + index * width);
  }

  function buildUniformEdgesFromWidth(min, max, width, settings){
    const safeWidth = Number(width);
    if(!Number.isFinite(safeWidth) || safeWidth <= 0){
      return null;
    }
    const coverageMin = Number(min);
    const coverageMax = Number(max);
    if(!Number.isFinite(coverageMin) || !Number.isFinite(coverageMax) || coverageMax < coverageMin){
      return null;
    }
    const safeSettings = sanitizeHistFrequencySettings(settings);
    const half = safeWidth / 2;
    let firstCenter = safeSettings.firstCenterAuto ? null : sanitizeOptionalFinite(safeSettings.firstCenter);
    let lastCenter = safeSettings.lastCenterAuto ? null : sanitizeOptionalFinite(safeSettings.lastCenter);
    if(firstCenter == null && lastCenter == null){
      firstCenter = normalizeHistBinNumber(Math.ceil((coverageMin - half) / safeWidth) * safeWidth);
      lastCenter = normalizeHistBinNumber(Math.ceil((coverageMax - half) / safeWidth) * safeWidth);
    }else if(firstCenter != null && lastCenter == null){
      const needed = Math.max(0, Math.ceil((coverageMax - half - firstCenter) / safeWidth));
      lastCenter = normalizeHistBinNumber(firstCenter + (needed * safeWidth));
    }else if(firstCenter == null && lastCenter != null){
      const needed = Math.max(0, Math.ceil((lastCenter - half - coverageMin) / safeWidth));
      firstCenter = normalizeHistBinNumber(lastCenter - (needed * safeWidth));
    }
    if(!Number.isFinite(firstCenter) || !Number.isFinite(lastCenter)){
      return null;
    }
    if(lastCenter < firstCenter){
      const swap = firstCenter;
      firstCenter = lastCenter;
      lastCenter = swap;
    }
    const stepCount = clampHistogramBinCount(Math.floor(((lastCenter - firstCenter) / safeWidth) + 1e-9) + 1);
    const centers = Array.from({ length: stepCount }, (_, index) => normalizeHistBinNumber(firstCenter + (index * safeWidth)));
    const startEdge = normalizeHistBinNumber(centers[0] - half);
    const edges = [startEdge];
    centers.forEach(center => edges.push(normalizeHistBinNumber(center + half)));
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      histDebug('Debug: hist bin centers resolved', {
        width: safeWidth,
        coverageMin,
        coverageMax,
        firstCenter,
        lastCenter,
        firstCenterAuto: safeSettings.firstCenterAuto,
        lastCenterAuto: safeSettings.lastCenterAuto,
        binCount: edges.length - 1
      });
    }
    return edges;
  }

  function buildExactFrequencyEdges(valuesInRange, min, max){
    const centers = Array.from(new Set(
      (Array.isArray(valuesInRange) ? valuesInRange : [])
        .map(Number)
        .filter(Number.isFinite)
    )).sort((a, b) => a - b);
    if(!centers.length){
      return null;
    }
    if(centers.length === 1){
      const center = centers[0];
      const span = Math.max(Math.abs(max - min), Math.abs(center) * 0.1, 1);
      const half = span / 2;
      return [center - half, center + half];
    }
    const edges = new Array(centers.length + 1);
    edges[0] = centers[0] - ((centers[1] - centers[0]) / 2);
    for(let index = 1; index < centers.length; index += 1){
      edges[index] = (centers[index - 1] + centers[index]) / 2;
    }
    const lastIndex = centers.length - 1;
    edges[lastIndex + 1] = centers[lastIndex] + ((centers[lastIndex] - centers[lastIndex - 1]) / 2);
    return edges;
  }

  function resolveHistogramBinIndex(value, edges){
    if(!Array.isArray(edges) || edges.length < 2){
      return -1;
    }
    const min = edges[0];
    const max = edges[edges.length - 1];
    if(!Number.isFinite(value) || value < min || value > max){
      return -1;
    }
    if(value === max){
      return edges.length - 2;
    }
    let low = 0;
    let high = edges.length - 2;
    while(low <= high){
      const mid = (low + high) >> 1;
      const left = edges[mid];
      const right = edges[mid + 1];
      if(value >= left && value < right){
        return mid;
      }
      if(value < left){
        high = mid - 1;
      }else{
        low = mid + 1;
      }
    }
    return -1;
  }

  function buildHistFrequencyModel(seriesEntries, options = {}){
    const settings = sanitizeHistFrequencySettings(options.settings);
    const safeEntries = Array.isArray(seriesEntries) ? seriesEntries : [];
    const lower = Number(options.min);
    const upper = Number(options.max);
    if(!Number.isFinite(lower) || !Number.isFinite(upper) || !(upper > lower) || !safeEntries.length){
      return null;
    }
    const allValuesInRange = [];
    safeEntries.forEach(entry => {
      const values = Array.isArray(entry?.values) ? entry.values : [];
      values.forEach(value => {
        const num = Number(value);
        if(Number.isFinite(num) && num >= lower && num <= upper){
          allValuesInRange.push(num);
        }
      });
    });
    if(!allValuesInRange.length){
      return null;
    }
    const dataMin = Math.min(...allValuesInRange);
    const dataMax = Math.max(...allValuesInRange);
    const binRangeMin = dataMax > dataMin ? dataMin : lower;
    const binRangeMax = dataMax > dataMin ? dataMax : upper;
    const requestedCount = clampHistogramBinCount(options.countInputValue);
    let edges = null;
    if(settings.binningMode === HIST_BINNING_MODE.exact){
      edges = buildExactFrequencyEdges(allValuesInRange, binRangeMin, binRangeMax);
    }else if(settings.binningMode === HIST_BINNING_MODE.width){
      const manualWidth = sanitizePositiveFinite(settings.manualBinWidth);
      edges = buildUniformEdgesFromWidth(binRangeMin, binRangeMax, manualWidth, settings);
      if(!edges){
        edges = buildUniformEdgesFromCount(binRangeMin, binRangeMax, requestedCount);
      }
    }else if(settings.binningMode === HIST_BINNING_MODE.auto){
      const autoWidth = computeHistAutoBinWidth(safeEntries, { min: lower, max: upper });
      edges = buildUniformEdgesFromWidth(binRangeMin, binRangeMax, autoWidth, {
        firstCenterAuto: true,
        lastCenterAuto: true
      });
      if(!edges){
        edges = buildUniformEdgesFromCount(binRangeMin, binRangeMax, requestedCount);
      }
    }else{
      edges = buildUniformEdgesFromCount(binRangeMin, binRangeMax, requestedCount);
    }
    if(!Array.isArray(edges) || edges.length < 2){
      return null;
    }
    const binCount = edges.length - 1;
    const centers = Array.from({ length: binCount }, (_, index) => (edges[index] + edges[index + 1]) / 2);
    const cumulative = settings.createMode === HIST_FREQUENCY_CREATE_MODE.cumulative;
    let yMax = 0;
    let minPositive = Infinity;
    const series = safeEntries.map(entry => {
      const raw = new Array(binCount).fill(0);
      const values = Array.isArray(entry?.values) ? entry.values : [];
      values.forEach(value => {
        const num = Number(value);
        if(!Number.isFinite(num) || num < lower || num > upper){
          return;
        }
        const idx = resolveHistogramBinIndex(num, edges);
        if(idx >= 0){
          raw[idx] += 1;
        }
      });
      const inRangeCount = raw.reduce((sum, count) => sum + count, 0);
      if(cumulative){
        for(let index = 1; index < raw.length; index += 1){
          raw[index] += raw[index - 1];
        }
      }
      const display = raw.map(value => convertHistCountToDisplay(value, Math.max(inRangeCount, 1), settings));
      display.forEach(value => {
        if(Number.isFinite(value)){
          if(value > yMax){
            yMax = value;
          }
          if(value > 0 && value < minPositive){
            minPositive = value;
          }
        }
      });
      return {
        key: entry.key,
        label: entry.label,
        colIndex: entry.colIndex,
        values: display,
        rawValues: raw,
        inRangeCount
      };
    });
    const averageBinWidth = binCount > 0
      ? edges.slice(1).reduce((sum, edge, index) => sum + Math.max(0, edge - edges[index]), 0) / binCount
      : 1;
    return {
      type: 'frequency',
      mode: settings.binningMode,
      settings,
      edges,
      centers,
      binCount,
      binWidth: averageBinWidth > 0 ? averageBinWidth : 1,
      metricLabel: getHistFrequencyMetricLabel(settings),
      series,
      yMax,
      minPositive: Number.isFinite(minPositive) ? minPositive : null
    };
  }

  function draw(){
    const histBins=$('#histBins'), histShowGrid=$('#histShowGrid'), histShowFrame=$('#histShowFrame'), histLogY=$('#histLogY'), histFontSize=$('#histFontSize'), histFontSizeVal=$('#histFontSizeVal');
    ensureAxisSettings();
    const plotMode = normalizeHistPlotMode(state.plotMode);
    const densityMode = plotMode === HIST_PLOT_MODE_DENSITY;
    const frequencySettings = sanitizeHistFrequencySettings(state.frequencySettings);
    const viewContext = resolveHistViewContext();
    const seriesEntries = collectHistSeries({ matrix: viewContext.sourceData });
    const values = seriesEntries.flatMap(entry => entry.values);
    const plotEl=getHistNodeById('histPlot'); while(plotEl.firstChild) plotEl.removeChild(plotEl.firstChild);
    if(!seriesEntries.length || !values.length){
      applyHistLegendGuardWidth(0);
      syncHistFrequencyTableDataView(null, frequencySettings, {
        context: viewContext,
        reason: 'hist-frequency-view-clear-empty'
      });
      if(typeof Shared.renderPlotNotice === 'function'){
        Shared.renderPlotNotice(plotEl, Shared.getEmptyPlotNoticeMessage ? Shared.getEmptyPlotNoticeMessage() : null, { resetAspect: true, show: true });
      }else{
        plotEl.innerHTML='<i>Add data to the input table to generate a plot.</i>';
      }
      updateHistStats([]);
      return;
    }
    const fitSets = seriesEntries.map(entry => ({ ...entry, fits: prepareDistributionFits(entry.values) }));
    // Density mode does not use cumulative frequency tables; do not gate PDF overlays
    // on histogram-only frequency mode in that case.
    const includePdf = !!state.distributionSettings.showPdf
      && (densityMode || frequencySettings.createMode !== HIST_FREQUENCY_CREATE_MODE.cumulative);
    const includeCdf = densityMode ? false : !!state.distributionSettings.showCdf;
    if(includePdf && !fitSets.some(entry => Array.isArray(entry.fits) && entry.fits.length)){
      fitSets.forEach(entry => {
        const fallbackFit = createNormalFallbackFit(entry.values);
        if(fallbackFit){
          entry.fits = [fallbackFit];
        }
      });
    }
    const statsHelpers = Shared.stats || {};
    const alpha = Number(state.distributionSettings.alpha) > 0 ? Number(state.distributionSettings.alpha) : 0.05;
    const rawXMin = Math.min(...values);
    const rawXMax = Math.max(...values);
    const drawDebugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
    const manualAxisLimits = readHistAxisLimitsFromInputs();
    const hasManualXMin = Number.isFinite(manualAxisLimits.xMin);
    const hasManualXMax = Number.isFinite(manualAxisLimits.xMax);
    let xMin = hasManualXMin ? manualAxisLimits.xMin : 0;
    let xMax = hasManualXMax ? manualAxisLimits.xMax : rawXMax;
    if(!(xMax > xMin)){
      if(drawDebugEnabled){
        histDebug('Debug: hist X bounds reset to data range because max <= min', {
          requestedXMin: hasManualXMin ? manualAxisLimits.xMin : 0,
          requestedXMax: hasManualXMax ? manualAxisLimits.xMax : rawXMax,
          rawXMin,
          rawXMax
        });
      }
      xMin = rawXMin;
      xMax = rawXMax;
    }
    let manualYMax = Number.isFinite(manualAxisLimits.yMax) ? manualAxisLimits.yMax : null;
    if(histLogY.checked && manualYMax != null && manualYMax <= 0){
      if(drawDebugEnabled){
        histDebug('Debug: hist manual Y max ignored in log scale because value is not positive', {
          yMax: manualAxisLimits.yMax
        });
      }
      manualYMax = null;
    }
    const baseWidth=Math.max(50,Math.floor(plotEl.clientWidth||50));
    const H=Math.max(40,Math.floor(plotEl.clientHeight||40));
    if(xMax === xMin || !Number.isFinite(xMax - xMin)){
      const basePad = Number.isFinite(xMin) ? Math.abs(xMin) : 0;
      let pad = basePad > 1 ? basePad * 0.05 : 1;
      if(!Number.isFinite(pad) || pad <= 0){
        pad = 1;
      }
      xMin = Number.isFinite(xMin) ? xMin - pad : -pad;
      xMax = Number.isFinite(xMax) ? xMax + pad : pad;
      if(xMax === xMin){
        xMin -= 0.5;
        xMax += 0.5;
      }
      histDebug('Debug: hist domain padded for identical values', {
        rawXMin,
        rawXMax,
        pad,
        adjustedMin: xMin,
        adjustedMax: xMax
      });
    }
    const containerRect=state.svgBox?.getBoundingClientRect?.();
    const fontInfo=chartStyle.resolveScaledFontSize({
      rawSize: histFontSize.value,
      width: containerRect?.width,
      height: containerRect?.height,
      svgBox: state.svgBox,
      input: histFontSize
    });
    const fs=fontInfo.scaledPx;
    const styleScaleInfo=fontInfo.scaleInfo;
    const borderWidthRaw=Number(state.barBorderWidth)||0;
    const borderWidthPx=chartStyle.scaleStrokeWidth(borderWidthRaw, styleScaleInfo, { context: 'hist-border', min: 0 });
    const legendVisible = state.showLegend !== false && seriesEntries.length > 1;
    const legendEntries = legendVisible
      ? seriesEntries.map((entry, index) => ({
          label: entry.label,
          fill: getHistSeriesColor(entry.key, index),
          stroke: state.barBorder || HIST_DEFAULT_BORDER,
          strokeWidth: borderWidthPx > 0 ? borderWidthPx : 1,
          key: entry.key,
          editable: true
        }))
      : [];
    const legendLayout = legendVisible
      ? chartStyle.computeLegendLayout({
          entries: legendEntries,
          fontSize: fs,
          strokeWidth: borderWidthPx > 0 ? borderWidthPx : 1,
          textColor: chartStyle.TEXT_COLOR,
          onSwatchClick: ({ entry, swatch, event, index }) => {
            if(!entry?.key || typeof Shared.openColorPicker !== 'function'){
              return;
            }
            event?.stopPropagation?.();
            const seriesKey = entry.key;
            let previousColor = getHistSeriesColor(seriesKey, Number.isInteger(index) ? index : 0);
            Shared.openColorPicker({
              anchor: swatch,
              color: previousColor,
              onInput(value){
                const nextValue = String(value || '').trim();
                if(!nextValue) return;
                setHistSeriesColor(seriesKey, nextValue);
                const root = state.svgBox || document;
                root.querySelectorAll(`#histSvg [data-series-key="${seriesKey}"]`).forEach(node => {
                  const role = String(node.getAttribute('data-series-role') || '').trim();
                  if(role === 'density-line'){
                    node.setAttribute('stroke', nextValue);
                  }else{
                    node.setAttribute('fill', nextValue);
                  }
                });
              },
              onChange(value){
                const nextValue = String(value || '').trim();
                if(!nextValue || nextValue === previousColor) return;
                recordHistChange(`hist:series-color:${seriesKey}`, previousColor, nextValue, committed => {
                  setHistSeriesColor(seriesKey, committed);
                  state.scheduleDraw?.();
                });
                setHistSeriesColor(seriesKey, nextValue);
                previousColor = nextValue;
                state.scheduleDraw?.();
              }
            });
          }
        })
      : null;
    applyHistLegendGuardWidth(legendVisible ? legendLayout?.minSvgWidth || 0 : 0);
    const W=Math.max(baseWidth, legendVisible ? Math.ceil(legendLayout?.minSvgWidth || 0) : 0);
    if(!hasManualXMax){
      let paddedXMax = xMax;
      fitSets.forEach(entry => {
        const densityInfo = computeHistDensitySeries(entry.values, {
          sampleCount: Math.min(240, Math.max(64, Math.round(W)))
        });
        if(Number.isFinite(densityInfo.domainMax) && densityInfo.domainMax > paddedXMax){
          paddedXMax = densityInfo.domainMax;
        }
      });
      if(Number.isFinite(paddedXMax) && paddedXMax > xMax){
        xMax = paddedXMax;
      }
      if(drawDebugEnabled){
        histDebug('Debug: hist auto X max padded from density domain', { xMax });
      }
    }
    const axisTickTools = chartStyle.axisTicks || null;
    const buildAxisScale = opts => {
      if(axisTickTools && typeof axisTickTools.buildScale === 'function'){
        return axisTickTools.buildScale(opts);
      }
      const min = Number.isFinite(opts?.manualMin) ? opts.manualMin : Number(opts?.dataMin) || 0;
      const max = Number.isFinite(opts?.manualMax) ? opts.manualMax : Number(opts?.dataMax) || min + 1;
      return { min, max, ticks: [min, max], step: Math.max((max - min) || 1, 1) };
    };
    const requestedBins=Math.max(1,Math.floor(Number(histBins.value)||10));
    const logY=histLogY.checked;
    const storedManualIntervalX = getAxisTickInterval('x');
    const storedManualIntervalY = getAxisTickInterval('y');
    const manualIntervalX = storedManualIntervalX;
    const manualIntervalY = logY ? null : storedManualIntervalY;
    if(logY && storedManualIntervalY){
      histDebug('Debug: hist manual interval suppressed',{ axis: 'y', reason: 'log-scale', stored: storedManualIntervalY });
    }
    plotEl.style.position='relative';
    const svg=document.createElementNS(NS,'svg'); svg.setAttribute('id','histSvg'); svg.setAttribute('width',String(W)); svg.setAttribute('height',String(H)); svg.setAttribute('viewBox',`0 0 ${W} ${H}`); svg.setAttribute('font-family',chartStyle.FONT_FAMILY); chartStyle.applySvgDefaults(svg); plotEl.appendChild(svg);
    if(fontControls && typeof fontControls.enableForSvg === 'function'){
      fontControls.enableForSvg(svg,{ scopeId: 'hist' });
      histDebug('Debug: hist fontControls enableForSvg invoked',{ width: W, height: H }); // Debug: font panel binding
    } else {
      histDebug('Debug: hist fontControls enableForSvg missing',{ hasFontControls: !!fontControls }); // Debug: font panel missing
    }
    const histNotationX = getAxisNotation('x');
    const histNotationY = getAxisNotation('y');
    const formatTickX = v => chartStyle.formatAxisValue(v,{ notation: histNotationX, maxDecimals: 2 });
    const formatTickY = v => chartStyle.formatAxisValue(v,{ notation: histNotationY, maxDecimals: 2 });
    const axisStrokeWidthBase = getAxisStrokeWidthBase();
    const axisStrokeWidth=chartStyle.scaleStrokeWidth(axisStrokeWidthBase, styleScaleInfo, { context: 'hist-axis', min: 0, exact: true });
    const axisStroke = getAxisColor();
    const gridStyleBase = getGridStyle(axisStrokeWidthBase);
    const gridStrokeStyle = Object.assign({}, gridStyleBase, {
      thickness: chartStyle.scaleStrokeWidth(gridStyleBase.thickness, styleScaleInfo, { context: 'hist-grid', min: 0 })
    });
    const gridStrokeAttrs = (gridControls && typeof gridControls.getStrokeAttributes === 'function')
      ? gridControls.getStrokeAttributes(gridStrokeStyle, { fallbackColor: DEFAULT_GRID_COLOR, fallbackThickness: axisStrokeWidth })
      : { stroke: DEFAULT_GRID_COLOR, 'stroke-width': axisStrokeWidth };
    histDebug('Debug: hist style scaling applied',{
      borderWidthRaw,
      borderWidthPx,
      axisStrokeWidth,
      axisStrokeWidthBase,
      axisStroke,
      styleScale: styleScaleInfo?.styleScale
    }); // Debug: histogram style scaling summary
    chartStyle.renderFontSizeLabel({ element: histFontSizeVal, fontInfo, input: histFontSize });
    histDebug('Debug: hist font scaling applied',{
      input:histFontSize.value,
      fontSizePt:fontInfo.pt,
      baseFontPx:fontInfo.px,
      scaledFontPx:fs,
      scale:styleScaleInfo?.styleScale || styleScaleInfo?.scale,
      containerWidth:containerRect?.width,
      containerHeight:containerRect?.height
    });
    const axisMetrics=chartStyle.createAxisMetrics(fontInfo.px, styleScaleInfo);
    histDebug('Debug: hist axis metrics',axisMetrics);
    let xTickTarget=chartStyle.estimateTickCount(W,{axis:'x',fallback:6});
    let yTickTarget=chartStyle.estimateTickCount(H,{axis:'y',fallback:6});
    histDebug('Debug: hist initial tick targets',{xTickTarget,yTickTarget,width:W,height:H});
    const histFontStyles = exportFontStyles('hist');
    const xTickMeasureFont = (chartStyle && typeof chartStyle.resolveScopedLabelMeasureFont === 'function')
      ? chartStyle.resolveScopedLabelMeasureFont({ styles: histFontStyles, role: 'xTick', fallbackPx: fs }).fontSpec
      : chartStyle.makeFont(fs);
    const yTickMeasureFont = (chartStyle && typeof chartStyle.resolveScopedLabelMeasureFont === 'function')
      ? chartStyle.resolveScopedLabelMeasureFont({ styles: histFontStyles, role: 'yTick', fallbackPx: fs }).fontSpec
      : chartStyle.makeFont(fs);
    const tickFont=yTickMeasureFont;
    const axisLabelFont=chartStyle.makeFont(fs);
    const yTitleWidthBase=chartStyle.measureText(state.yLabelText,axisLabelFont);
    const tickLen=axisMetrics.tickLength;
    const tickGap=axisMetrics.tickLabelGap;
    const legendWidth = legendVisible ? (legendLayout?.legendWidthForMargin || 0) : 0;
    const legendGapPx = legendVisible ? (legendLayout?.legendGapPx || 0) : 0;
    const legendRenderer = legendVisible && legendLayout?.renderer
      ? legendLayout.renderer
      : { entries: [], width: 0, height: 0, draw(){ return null; } };
    let margin=stabilizeHistMarginForAxisResize(
      chartStyle.computeBaseMargins({fontSize:fs,legendWidth,maxYLabelWidth:0,yTitleWidth:yTitleWidthBase,axisMetrics})
    );
    let plotW=Math.max(20,W-margin.left-margin.right);
    let plotH=Math.max(20,H-margin.top-margin.bottom);
    let bottomLayout=chartStyle.computeBottomLayout({labels:[],fontSize:fs,labelMeasureFont:xTickMeasureFont,plotWidth:plotW,baseBottom:margin.bottom,axisMetrics});
    margin.bottom=bottomLayout.bottom;
    plotW=Math.max(20,W-margin.left-margin.right);
    plotH=Math.max(20,H-margin.top-margin.bottom);
    let xScale=buildAxisScale({ dataMin: xMin, dataMax: xMax, targetTickCount: xTickTarget });
    let yScale=buildAxisScale({ dataMin: 0, dataMax: 1, targetTickCount: yTickTarget, manualMin: 0 });
    let xTickLabels=[];
    let yTickLabels=[];
    let histogramSeries=[];
    let densitySeriesByKey=new Map();
    let sharedEdges=[];
    let binWidth=0;
    let frequencyModel=null;
    let bins=requestedBins;
    let yMin=0;
    let yMax=0;
    let yMinT=0;
    let yMaxT=0;
    let maxYLabelWidth = 0;
    for(let pass=0;pass<2;pass++){
      xScale=buildAxisScale({ dataMin: xMin, dataMax: xMax, targetTickCount: xTickTarget });
      if(densityMode){
        densitySeriesByKey=new Map();
        binWidth = 0;
        yMin = 0;
        yMax = 0;
        let minPositiveDensity = Infinity;
        fitSets.forEach(entry => {
          const densityInfo = computeHistDensitySeries(entry.values, {
            sampleCount: Math.min(240, Math.max(64, Math.round(plotW))),
            minVal: xScale.min,
            maxVal: xScale.max
          });
          densitySeriesByKey.set(entry.key, densityInfo);
          if(Number.isFinite(densityInfo?.peak) && densityInfo.peak > yMax){
            yMax = densityInfo.peak;
          }
          if(Number.isFinite(densityInfo?.minPositive) && densityInfo.minPositive > 0 && densityInfo.minPositive < minPositiveDensity){
            minPositiveDensity = densityInfo.minPositive;
          }
        });
        if(logY){
          yMin = Number.isFinite(minPositiveDensity) ? Math.max(minPositiveDensity, 1e-9) : 1e-6;
          if(yMax <= 0){
            yMax = yMin * 10;
          }
        }
      }else{
        frequencyModel = buildHistFrequencyModel(fitSets, {
          min: xScale.min,
          max: xScale.max,
          countInputValue: requestedBins,
          settings: frequencySettings
        });
        if(!frequencyModel){
          frequencyModel = buildHistFrequencyModel(fitSets, {
            min: xScale.min,
            max: xScale.max,
            countInputValue: requestedBins,
            settings: {
              ...frequencySettings,
              binningMode: HIST_BINNING_MODE.count,
              createMode: HIST_FREQUENCY_CREATE_MODE.frequency,
              tabulateMode: HIST_FREQUENCY_TABULATE_MODE.count
            }
          });
        }
        sharedEdges = Array.isArray(frequencyModel?.edges) ? frequencyModel.edges.slice() : [];
        binWidth = Number(frequencyModel?.binWidth) || ((xScale.max - xScale.min) / Math.max(requestedBins, 1)) || 1;
        bins = Math.max(1, Number(frequencyModel?.binCount) || requestedBins);
        histogramSeries = Array.isArray(frequencyModel?.series)
          ? frequencyModel.series.map(entry => ({ ...entry, counts: Array.isArray(entry.values) ? entry.values.slice() : [] }))
          : [];
        yMin=0;
        yMax = Number(frequencyModel?.yMax) || histogramSeries.reduce((max, entry) => Math.max(max, Math.max(...entry.counts, 0)), 0);
        if(logY){
          const minPositive = Number.isFinite(Number(frequencyModel?.minPositive))
            ? Number(frequencyModel.minPositive)
            : histogramSeries.reduce((min, entry) => {
              const localMin = entry.counts.reduce((inner, val) => (val > 0 && val < inner ? val : inner), Infinity);
              return localMin < min ? localMin : min;
            }, Infinity);
          yMin = Number.isFinite(minPositive) ? Math.max(minPositive, 1e-3) : 0.1;
          if(yMax <= 0){
            yMax = yMin * 10;
          }
        }
      }
      if(yMax<=yMin){
        yMax = yMin + 1;
      }
      if(includePdf || includeCdf){
        const frequencySeriesByKey = new Map((frequencyModel?.series || []).map(entry => [entry.key, entry]));
        fitSets.forEach(entry => {
          if(!entry.fits.length){
            return;
          }
          const frequencySeries = frequencySeriesByKey.get(entry.key) || null;
          const inRangeCount = Math.max(1, Number(frequencySeries?.inRangeCount) || entry.values.length || 1);
          const metrics = computeOverlayMetrics(entry.fits, {
            xMin: xScale.min,
            xMax: xScale.max,
            binWidth,
            sampleCount: inRangeCount,
            includePdf,
            includeCdf,
            plotPixels: W,
            scaleMode: densityMode ? HIST_PLOT_MODE_DENSITY : HIST_PLOT_MODE_HISTOGRAM
          });
          const overlayMaxRaw = Math.max(metrics.pdfMax || 0, metrics.cdfMax || 0);
          const overlayMax = densityMode
            ? overlayMaxRaw
            : convertHistCountToDisplay(overlayMaxRaw, inRangeCount, frequencySettings);
          if(Number.isFinite(overlayMax) && overlayMax > yMax){
            yMax = overlayMax;
          }
        });
      }
      if(manualYMax != null){
        if(manualYMax > yMin){
          yMax = manualYMax;
        }else if(drawDebugEnabled){
          histDebug('Debug: hist manual Y max ignored because value is not above axis minimum', {
            yMax: manualYMax,
            yMin,
            logY
          });
        }
      }
      yMinT=logY?Math.log10(yMin):yMin;
      yMaxT=logY?Math.log10(yMax):yMax;
      yScale=buildAxisScale({ dataMin: yMinT, dataMax: yMaxT, targetTickCount: yTickTarget, manualMin: logY ? Math.log10(yMin) : yMin, manualMax: logY ? Math.log10(yMax) : yMax });
      if(logY && axisTickTools?.applyLogTicks){
        axisTickTools.applyLogTicks(yScale, {
          manualMin: null,
          manualMax: null,
          fallbackMin: yMinT,
          fallbackMax: yMaxT
        });
      }
      histDebug('Debug: hist axis auto range',{ yMin, yMax, logY });
      if(Number.isFinite(manualIntervalX) && manualIntervalX > 0){
        const manualX = buildManualTicks(
          Number.isFinite(xScale.min) ? xScale.min : xMin,
          Number.isFinite(xScale.max) ? xScale.max : xMax,
          manualIntervalX
        );
        if(manualX){
          xScale.min = manualX.min;
          xScale.max = manualX.max;
          xScale.ticks = manualX.ticks;
          xScale.step = manualIntervalX;
          histDebug('Debug: hist manual interval applied',{ axis: 'x', interval: manualIntervalX, tickCount: manualX.ticks.length });
        }
      }
      if(!logY && Number.isFinite(manualIntervalY) && manualIntervalY > 0){
        const manualY = buildManualTicks(
          Number.isFinite(yScale.min) ? yScale.min : yMinT,
          Number.isFinite(yScale.max) ? yScale.max : yMaxT,
          manualIntervalY
        );
        if(manualY){
          yScale.min = manualY.min;
          yScale.max = manualY.max;
          yScale.ticks = manualY.ticks;
          yScale.step = manualIntervalY;
          histDebug('Debug: hist manual interval applied',{ axis: 'y', interval: manualIntervalY, tickCount: manualY.ticks.length });
        }
      }
      xTickLabels=xScale.ticks.map(t=>formatTickX(t));
      yTickLabels=yScale.ticks.map(t=>formatTickY(logY?Math.pow(10,t):t));
      const yLabelWidths=yTickLabels.map(lbl=>chartStyle.measureText(lbl,tickFont));
      maxYLabelWidth=Math.max(...yLabelWidths,0);
      margin=stabilizeHistMarginForAxisResize(
        chartStyle.computeBaseMargins({fontSize:fs,legendWidth,maxYLabelWidth,yTitleWidth:yTitleWidthBase,axisMetrics})
      );
      plotW=Math.max(20,W-margin.left-margin.right);
      plotH=Math.max(20,H-margin.top-margin.bottom);
      bottomLayout=chartStyle.computeBottomLayout({labels:xTickLabels,fontSize:fs,labelMeasureFont:xTickMeasureFont,plotWidth:plotW,baseBottom:margin.bottom,axisMetrics});
      margin.bottom=bottomLayout.bottom;
      plotW=Math.max(20,W-margin.left-margin.right);
      plotH=Math.max(20,H-margin.top-margin.bottom);
      const refinedX=chartStyle.estimateTickCount(plotW,{axis:'x',fallback:xTickTarget});
      const refinedY=chartStyle.estimateTickCount(plotH,{axis:'y',fallback:yTickTarget});
      histDebug('Debug: hist tick target evaluation',{pass,plotW,plotH,xTickTarget,refinedX,yTickTarget,refinedY,maxYLabelWidth,bins,binWidth});
      if(refinedX===xTickTarget && refinedY===yTickTarget){
        break;
      }
      xTickTarget=refinedX;
      yTickTarget=refinedY;
    }
    histDebug('Debug: hist layout',{margin,plotW,plotH,rotate:bottomLayout.shouldRotate,xTickTarget,yTickTarget,binWidth});
    const showGrid=$('#histShowGrid').checked;
    const showFrame=$('#histShowFrame').checked;
    histDebug('Debug: hist showFrame state',{showFrame});
    const x2px=v=>margin.left+plotW*(v-xScale.min)/(xScale.max-xScale.min);
    const y2px=v=>margin.top+plotH*(1-(v-yScale.min)/(yScale.max-yScale.min));
    function add(tag,attrs,parent){const el=document.createElementNS(NS,tag); for(const[k,v] of Object.entries(attrs)){ if(v !== null && v !== undefined){ el.setAttribute(k,String(v)); } } (parent || svg).appendChild(el); return el;}
      if(showGrid){
        yScale.ticks.forEach(t=>{
          const y=y2px(t);
          const gridLine = add('line',Object.assign({x1:margin.left,y1:y,x2:margin.left+plotW,y2:y},gridStrokeAttrs));
          gridLine.setAttribute('data-grid-control','1');
        });
        histDebug('Debug: hist grid stroke scaled',{horizontal:yScale.ticks.length,gridStrokeStyle});
      }
    const xTickPositions=xScale.ticks.map(t=>x2px(t));
    const yTickPositions=yScale.ticks.map(t=>y2px(t));
    let axisXStart=xTickPositions.length?Math.min(...xTickPositions):margin.left;
    let axisXEnd=xTickPositions.length?Math.max(...xTickPositions):margin.left+plotW;
    let axisYStart=yTickPositions.length?Math.min(...yTickPositions):margin.top;
    let axisYEnd=yTickPositions.length?Math.max(...yTickPositions):margin.top+plotH;
    if(axisXStart===axisXEnd){axisXStart=margin.left;axisXEnd=margin.left+plotW;}
    if(axisYStart===axisYEnd){axisYStart=margin.top;axisYEnd=margin.top+plotH;}
    histDebug('Debug: hist axis span',{axisXStart,axisXEnd,axisYStart,axisYEnd});
    const minorTickStyle = chartStyle.resolveMinorTickStyle({ tickLength: tickLen, strokeWidth: axisStrokeWidth });
    const minorSubdivisionsX = getAxisMinorTickSubdivisions('x');
    const minorSubdivisionsY = getAxisMinorTickSubdivisions('y');
    const minorTicksX = getAxisMinorTicksEnabled('x')
      ? chartStyle.computeMinorTickPositions({
          majorTicks: xScale.ticks,
          min: Number.isFinite(xScale.min) ? xScale.min : xMin,
          max: Number.isFinite(xScale.max) ? xScale.max : xMax,
          scale: 'linear',
          subdivisions: minorSubdivisionsX
        })
      : [];
    const minorTicksY = getAxisMinorTicksEnabled('y')
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
        scopeId: 'hist',
        getTickInterval: () => getAxisTickInterval(axis),
        getThickness: () => getAxisStrokeWidthBase(),
        getColor: () => getAxisColor(),
        isTickIntervalEnabled: () => axis === 'y' ? !logY : true,
        getTickIntervalDisabledMessage: () => axis === 'y'
          ? 'Tick interval is disabled while the Y axis uses a logarithmic scale.'
          : 'Tick interval available for numeric axes.',
        tickPlaceholder: 'Auto',
        onTickIntervalChange: value => updateAxisTickInterval(axis, value),
        getMinorTicksEnabled: () => getAxisMinorTicksEnabled(axis),
        onMinorTicksChange: value => updateAxisMinorTicks(axis, value),
        isMinorTicksSupported: () => true,
        getMinorTickSubdivisions: () => getAxisMinorTickSubdivisions(axis),
        onMinorTickSubdivisionsChange: value => updateAxisMinorTickSubdivisions(axis, value),
        onThicknessChange: value => updateAxisStrokeWidth(value),
        onColorChange: value => updateAxisColor(value),
        getNotationMode: () => getAxisNotation(axis),
        onNotationChange: value => updateAxisNotation(axis, value),
        isNotationSupported: () => true
      });
      const xAxisLine = add('line',{x1:axisXStart,y1:margin.top+plotH,x2:axisXEnd,y2:margin.top+plotH,stroke:axisStroke,'stroke-linecap':'square','stroke-width':axisStrokeWidth});
      if(axisControls && typeof axisControls.registerAxisElement === 'function'){
        axisControls.registerAxisElement(xAxisLine, axisControlConfig('x'));
      }
      const yAxisLine = add('line',{x1:margin.left,y1:axisYStart,x2:margin.left,y2:axisYEnd,stroke:axisStroke,'stroke-linecap':'square','stroke-width':axisStrokeWidth});
      if(axisControls && typeof axisControls.registerAxisElement === 'function'){
        axisControls.registerAxisElement(yAxisLine, axisControlConfig('y'));
      }
      histDebug('Debug: hist axes stroke scaled',{ axisStrokeWidth, axisStrokeWidthBase, axisStroke });
    if(showFrame){
      histDebug('Debug: hist frame request',{stroke:axisStroke, showFrame, axisStrokeWidth}); // Debug: frame styling inputs
      chartStyle.drawPlotFrame({ svg, margin, plotW, plotH, stroke: axisStroke, strokeWidth: axisStrokeWidth, sides: ['top','right'] });
    }
    // Frame closes histogram plot area using axis styling continuity
    const xTickNodes=[];
      let xTickFontCount=0;
      if(minorTicksX.length){
        minorTicksX.forEach(value => {
          const x = x2px(value);
          add('line',{
            x1: x,
            y1: margin.top + plotH,
            x2: x,
            y2: margin.top + plotH + minorTickStyle.length,
            stroke: axisStroke,
            'stroke-width': minorTickStyle.strokeWidth,
            'stroke-linecap': 'round',
            opacity: minorTickStyle.opacity
          });
        });
      }
      xScale.ticks.forEach((t,i)=>{
        const x=x2px(t);
        add('line',{x1:x,y1:margin.top+plotH,x2:x,y2:margin.top+plotH+tickLen,stroke:axisStroke,'stroke-width':axisStrokeWidth});
        const extra = Shared.computeAxisLabelYOffset ? Shared.computeAxisLabelYOffset(fs, tickLen, tickGap) : 0;
        const txt=add('text',{x,y:margin.top+plotH+tickLen+tickGap+extra,'font-size':fs,'text-anchor':'middle',fill:chartStyle.TEXT_COLOR});
        txt.textContent=formatTickX(t);
        Shared.applyTextBaseline && Shared.applyTextBaseline(txt,'hanging',fs);
        markFontEditable(txt,'xTick');
        xTickFontCount+=1;
        xTickNodes.push(txt);
      });
    chartStyle.applyLabelOrientation(xTickNodes,{angle:-45,anchor:'end',dy:'0.35em',force:bottomLayout.shouldRotate});
      let yTickFontCount=0;
      if(minorTicksY.length){
        minorTicksY.forEach(value => {
          const y = y2px(value);
          add('line',{
            x1: margin.left - minorTickStyle.length,
            y1: y,
            x2: margin.left,
            y2: y,
            stroke: axisStroke,
            'stroke-width': minorTickStyle.strokeWidth,
            'stroke-linecap': 'round',
            opacity: minorTickStyle.opacity
          });
        });
      }
      yScale.ticks.forEach((t,i)=>{
        const y=y2px(t);
        add('line',{x1:margin.left-tickLen,y1:y,x2:margin.left,y2:y,stroke:axisStroke,'stroke-width':axisStrokeWidth});
        const txt=add('text',{x:margin.left-(tickLen+tickGap),y,'font-size':fs,'text-anchor':'end','dominant-baseline':'middle',fill:chartStyle.TEXT_COLOR});
        txt.textContent=formatTickY(logY?Math.pow(10,t):t);
        markFontEditable(txt,'yTick');
        yTickFontCount+=1;
      });
    histDebug('Debug: hist font tick binding',{ xTickFontCount, yTickFontCount }); // Debug: tick font binding counts
    histDebug('Debug: hist ticks stroke scaled',{xTickCount:xScale.ticks.length,yTickCount:yScale.ticks.length,axisStrokeWidth});
    const borderColor=state.barBorder || HIST_DEFAULT_BORDER;
    if(densityMode){
      const baselineValue = logY ? Math.max(yMin, 1e-9) : 0;
      const baselineDomain = logY ? Math.log10(baselineValue) : baselineValue;
      fitSets.forEach((entry, seriesIndex) => {
        const densityInfo = densitySeriesByKey.get(entry.key);
        const positions = Array.isArray(densityInfo?.positions) ? densityInfo.positions : [];
        const densities = Array.isArray(densityInfo?.densities) ? densityInfo.densities : [];
        const points = [];
        for(let index = 0; index < positions.length; index += 1){
          const x = positions[index];
          const density = densities[index];
          if(!Number.isFinite(x) || !Number.isFinite(density) || density < 0){
            continue;
          }
          const yDomain = logY ? Math.log10(Math.max(density, baselineValue)) : density;
          points.push([x2px(x), y2px(yDomain)]);
        }
        if(points.length < 2){
          return;
        }
        const fill = getHistSeriesColor(entry.key, seriesIndex);
        const areaPath = [`M ${points[0][0]} ${y2px(baselineDomain)}`]
          .concat(points.map(point => `L ${point[0]} ${point[1]}`))
          .concat([`L ${points[points.length - 1][0]} ${y2px(baselineDomain)}`, 'Z'])
          .join(' ');
        const area = add('path',{
          d: areaPath,
          fill,
          'fill-opacity': seriesEntries.length > 1 ? HIST_DEFAULT_DENSITY_FILL_OPACITY : 0.24,
          stroke: 'none',
          'class': 'hist-bar hist-density-shape',
          'data-hist-bar': '1',
          'data-series-key': entry.key,
          'data-series': entry.label,
          'data-series-role': 'density-area'
        });
        const lineColor = getHistDensityLineColor(entry.key, seriesIndex, fill);
        const line = add('path',{
          d: points.map((point, pointIndex) => `${pointIndex === 0 ? 'M' : 'L'} ${point[0]} ${point[1]}`).join(' '),
          fill: 'none',
          stroke: lineColor,
          'stroke-width': Math.max(borderWidthPx, chartStyle.scaleStrokeWidth(HIST_DEFAULT_DENSITY_STROKE_WIDTH, styleScaleInfo, { context: 'hist-density-line', min: 1 })),
          'stroke-linejoin': 'round',
          'stroke-linecap': 'round',
          'class': 'hist-bar hist-density-line',
          'data-hist-bar': '1',
          'data-series-key': entry.key,
          'data-series': entry.label,
          'data-series-role': 'density-line'
        });
        [area, line].forEach(node => {
          try{
            node.style.cursor='pointer';
            node.addEventListener('click', evt=>{
              try{ evt.stopPropagation(); }catch(e){}
              showHistBarFormatControls(evt.currentTarget);
            });
          }catch(e){}
        });
      });
    }else{
      histogramSeries.forEach((entry, seriesIndex) => {
        const fill = getHistSeriesColor(entry.key, seriesIndex);
        entry.counts.forEach((count, binIndex) => {
          const xStart=x2px(sharedEdges[binIndex]);
          const xEnd=x2px(sharedEdges[binIndex+1]);
          const barW=Math.max(0,xEnd-xStart);
          const val=logY?Math.log10(Math.max(count,yMin)):count;
          const y=y2px(val);
          const h=margin.top+plotH-y;
          const rect=add('rect',{
            x:xStart,
            y,
            width:barW,
            height:h,
            fill,
            'fill-opacity': seriesEntries.length > 1 ? HIST_DEFAULT_SERIES_FILL_OPACITY : 0.72,
            'class':'hist-bar',
            'data-hist-bar':'1',
            'data-series-key': entry.key,
            'data-series': entry.label,
            'data-series-role': 'hist-bar'
          });
          if(borderWidthPx>0){rect.setAttribute('stroke',borderColor); rect.setAttribute('stroke-width',borderWidthPx);}
          try{ rect.style.cursor='pointer'; rect.addEventListener('click', evt=>{ try{ evt.stopPropagation(); }catch(e){} showHistBarFormatControls(evt.currentTarget); }); }catch(e){}
        });
      });
    }
    if((includePdf || includeCdf) && fitSets.some(entry => entry.fits.length)){
      const overlayGroup = add('g',{ 'class':'hist-overlay-group' });
      const effectiveBinWidth = densityMode ? ((xScale.max - xScale.min) || 1) : (binWidth || ((xScale.max - xScale.min) || 1));
      const sampleSteps = Math.min(240, Math.max(32, Math.round(plotW)));
      const yLowerBound = densityMode ? yMin : Math.max(0, yMin);
      const logLowerBound = logY ? Math.max(yLowerBound, 1e-6) : yLowerBound;
      const frequencySeriesByKey = new Map((frequencyModel?.series || []).map(entry => [entry.key, entry]));
      const toDomainY = value => {
        if(logY){
          const safe = Math.max(value, logLowerBound);
          return Math.log10(safe);
        }
        return Math.max(value, yLowerBound);
      };
      fitSets.forEach((entry, seriesIndex)=>{
        entry.fits.forEach((fit, fitIndex)=>{
          if(!fit || fit.valid === false){ return; }
          const strokeColor = seriesEntries.length > 1
            ? getHistSeriesColor(entry.key, seriesIndex)
            : (fit.color || DEFAULT_DISTRIBUTION_COLORS[fitIndex % DEFAULT_DISTRIBUTION_COLORS.length]);
          const strokeWidth = Number.isFinite(Number(fit.strokeWidth)) ? Number(fit.strokeWidth) : Math.max(axisStrokeWidth * 0.9, axisStrokeWidth / 2, 1);
          const strokePattern = sanitizeHistOverlayPattern(fit.pattern || 'solid');
          const strokeOpacity = Number.isFinite(Number(fit.alpha)) ? fit.alpha : (seriesEntries.length > 1 ? 0.85 : 1);
          const frequencySeries = frequencySeriesByKey.get(entry.key) || null;
          const inRangeCount = Math.max(1, Number(frequencySeries?.inRangeCount) || entry.values.length || 1);
          if(includePdf && typeof fit.pdf === 'function' && effectiveBinWidth > 0){
            const parts=[];
            for(let step=0;step<sampleSteps;step++){
              const t=sampleSteps===1?0:step/(sampleSteps-1);
              const x=xScale.min+(xScale.max-xScale.min)*t;
              const density=fit.pdf(x);
              if(!Number.isFinite(density) || density<0){ continue; }
              const expectedRaw = densityMode ? density : density * inRangeCount * effectiveBinWidth;
              const expected = densityMode
                ? expectedRaw
                : convertHistCountToDisplay(expectedRaw, inRangeCount, frequencySettings);
              const yDomain=toDomainY(expected);
              parts.push(`${parts.length===0?'M':'L'} ${x2px(x)} ${y2px(yDomain)}`);
            }
            if(parts.length>1){
              const p = add('path',{
                d:parts.join(' '),
                fill:'none',
                stroke:strokeColor,
                'stroke-width':strokeWidth,
                'stroke-opacity': strokeOpacity,
                'stroke-dasharray': histOverlayPatternToDasharray(strokePattern) || null,
                'stroke-linejoin':'round',
                'stroke-linecap':'round',
                'data-dist':fit.key || fit.label,
                'data-overlay-type':'pdf',
                'data-series-key': entry.key,
                'data-series': entry.label,
                'pointer-events':'stroke',
                'class':'hist-overlay hist-overlay--pdf'
              }, overlayGroup);
              try{ p.style.cursor='pointer'; p.style.pointerEvents = p.style.pointerEvents || 'stroke'; p.addEventListener('click', evt=>{ try{ evt.stopPropagation(); }catch(e){} showHistOverlayFormatControls(evt.currentTarget); }); }catch(e){}
            }
          }
          if(includeCdf && typeof fit.cdf === 'function'){
            const parts=[];
            for(let step=0;step<sampleSteps;step++){
              const t=sampleSteps===1?0:step/(sampleSteps-1);
              const x=xScale.min+(xScale.max-xScale.min)*t;
              const cumulative=clampUnit(fit.cdf(x));
              const expectedRaw = cumulative * inRangeCount;
              const expected = convertHistCountToDisplay(expectedRaw, inRangeCount, frequencySettings);
              const yDomain=toDomainY(expected);
              parts.push(`${parts.length===0?'M':'L'} ${x2px(x)} ${y2px(yDomain)}`);
            }
            if(parts.length>1){
              const p = add('path',{
                d:parts.join(' '),
                fill:'none',
                stroke:strokeColor,
                'stroke-width':strokeWidth,
                'stroke-opacity': strokeOpacity,
                'stroke-dasharray': histOverlayPatternToDasharray(strokePattern) || null,
                'stroke-linejoin':'round',
                'stroke-linecap':'round',
                'data-dist':fit.key || fit.label,
                'data-overlay-type':'cdf',
                'data-series-key': entry.key,
                'data-series': entry.label,
                'pointer-events':'stroke',
                'class':'hist-overlay hist-overlay--cdf'
              }, overlayGroup);
              try{ p.style.cursor='pointer'; p.style.pointerEvents = p.style.pointerEvents || 'stroke'; p.addEventListener('click', evt=>{ try{ evt.stopPropagation(); }catch(e){} showHistOverlayFormatControls(evt.currentTarget); }); }catch(e){}
            }
          }
        });
      });
      if(!overlayGroup.hasChildNodes()){
        svg.removeChild(overlayGroup);
      }
    }
    const xAxisBase=margin.top+plotH;
    const resolveLabelPosition = (saved, defaults, spanX, spanY) => {
      if(saved?.relX !== undefined && saved?.relY !== undefined){
        return { x: defaults.originX + saved.relX * spanX, y: defaults.originY + saved.relY * spanY };
      }
      if(saved?.x !== undefined && saved?.y !== undefined){
        return { x: saved.x, y: saved.y };
      }
      return { x: defaults.x, y: defaults.y };
    };
    const storedXLabel = String(state.xLabelText == null ? '' : state.xLabelText).trim();
    const renderedXLabel = storedXLabel
      ? (storedXLabel === 'Value' && seriesEntries.length === 1 ? seriesEntries[0].label : storedXLabel)
      : (seriesEntries.length === 1 ? seriesEntries[0].label : 'Value');
    const xLabelPos = resolveLabelPosition(state.labelPositions?.xLabel, { x: margin.left+plotW/2, y: xAxisBase+bottomLayout.titleOffset, originX: margin.left, originY: xAxisBase }, plotW, plotH + margin.top);
    const xText=add('text',{x: xLabelPos.x, y: xLabelPos.y,'text-anchor':'middle','font-size':fs,fill:chartStyle.TEXT_COLOR});
    xText.textContent=renderedXLabel;
    markFontEditable(xText,'xTitle','xTitle');
    const applyHistXLabel=value=>{ state.xLabelText = value != null ? String(value) : ''; state.scheduleDraw?.(); };
    if(global.makeEditable){
      makeEditable(xText,txt=>{
        const previous=state.xLabelText!=null?String(state.xLabelText):'';
        const nextValue=txt!=null?String(txt):'';
        if(previous===nextValue){
          return;
        }
        applyHistXLabel(nextValue);
        if(seriesEntries.length === 1 && state.hot?.setDataAtCell){
          try{ state.hot.setDataAtCell([0, seriesEntries[0].colIndex, nextValue], 'hist-x-axis-edit'); }catch(err){ console.error('hist x label header sync failed', err); }
        }
        recordHistChange('hist:x-label',previous,nextValue,applyHistXLabel);
      });
    }
    if(typeof Shared.enableLabelDrag === 'function'){
      Shared.enableLabelDrag(xText, svg, {
        onDragEnd: pos => {
          state.labelPositions.xLabel = {
            x: pos.x,
            y: pos.y,
            relX: (pos.x - margin.left) / Math.max(plotW, 1),
            relY: (pos.y - xAxisBase) / Math.max(plotH + margin.top, 1)
          };
        }
      });
    }
    const yLabelOffsetSpan = (maxYLabelWidth + tickLen + tickGap + axisMetrics.axisTitleGap + fs * 0.5);
    const yLabelPos = resolveLabelPosition(state.labelPositions?.yLabel, { x: margin.left - yLabelOffsetSpan, y: margin.top+plotH/2, originX: margin.left, originY: margin.top }, yLabelOffsetSpan, plotH);
    const yText=add('text',{x:yLabelPos.x,y:yLabelPos.y,'dominant-baseline':'middle',transform:`rotate(-90 ${yLabelPos.x} ${yLabelPos.y})`,'text-anchor':'middle','font-size':fs,fill:chartStyle.TEXT_COLOR});
    yText.textContent=state.yLabelText;
    markFontEditable(yText,'yTitle','yTitle');
    const applyHistYLabel=value=>{
      const nextValue=value!=null?String(value):'';
      state.yLabelText=nextValue;
      state.yLabelAuto = nextValue === getHistDefaultYLabel(state.plotMode, state.frequencySettings);
      state.scheduleDraw?.();
    };
    if(global.makeEditable){
      makeEditable(yText,txt=>{
        const previous=state.yLabelText!=null?String(state.yLabelText):'';
        const nextValue=txt!=null?String(txt):'';
        if(previous===nextValue){
          return;
        }
        applyHistYLabel(nextValue);
        recordHistChange('hist:y-label',previous,nextValue,applyHistYLabel);
      });
    }
    if(typeof Shared.enableLabelDrag === 'function'){
      Shared.enableLabelDrag(yText, svg, {
        onDragEnd: pos => {
          state.labelPositions.yLabel = {
            x: pos.x,
            y: pos.y,
            relX: (pos.x - margin.left) / Math.max(yLabelOffsetSpan, 1),
            relY: (pos.y - margin.top) / Math.max(plotH, 1)
          };
        }
      });
    }
    const titlePos = resolveLabelPosition(state.labelPositions?.title, { x: margin.left+plotW/2, y: margin.top/2, originX: margin.left, originY: margin.top }, plotW, plotH);
    const titleText=add('text',{x: titlePos.x, y: titlePos.y,'text-anchor':'middle','font-size':fs,fill:chartStyle.TEXT_COLOR});
    titleText.textContent=state.titleText;
    markFontEditable(titleText,'graphTitle','graphTitle');
    const applyHistTitle=value=>{
      const nextValue=value!=null?String(value):'';
      state.titleText=nextValue;
      state.titleAuto = nextValue === getHistDefaultTitle(state.plotMode);
      state.scheduleDraw?.();
    };
    if(global.makeEditable){
      makeEditable(titleText,txt=>{
        const previous=state.titleText!=null?String(state.titleText):'';
        const nextValue=txt!=null?String(txt):'';
        if(previous===nextValue){
          return;
        }
        applyHistTitle(nextValue);
        recordHistChange('hist:title',previous,nextValue,applyHistTitle);
      });
    }
    if(typeof Shared.enableLabelDrag === 'function'){
      Shared.enableLabelDrag(titleText, svg, {
        onDragEnd: pos => {
          state.labelPositions.title = {
            x: pos.x,
            y: pos.y,
            relX: (pos.x - margin.left) / Math.max(plotW, 1),
            relY: (pos.y - margin.top) / Math.max(plotH, 1)
          };
        }
      });
    }
    if(legendVisible && legendRenderer.entries.length){
      const plotRight = margin.left + plotW;
      const legendPos = state.labelPositions?.legend;
      const resolvedLegendPos = legendPos?.relX !== undefined && legendPos?.relY !== undefined
        ? { x: plotRight + legendPos.relX * Math.max(legendGapPx, 1), y: margin.top + legendPos.relY * plotH }
        : (legendPos?.x !== undefined && legendPos?.y !== undefined ? { x: legendPos.x, y: legendPos.y } : { x: plotRight + legendGapPx, y: margin.top });
      const legendGroup = legendRenderer.draw(svg, resolvedLegendPos);
      if(legendGroup){
        legendGroup.querySelectorAll('[data-legend-key]').forEach(node => {
          const key = String(node.dataset.legendKey || '').trim();
          if(key && String(node.tagName || '').toLowerCase() !== 'text'){
            node.setAttribute('data-series-key', key);
            node.setAttribute('data-series-role', 'legend-swatch');
          }
        });
        Array.from(legendGroup.querySelectorAll('text')).forEach((node, index) => markFontEditable(node, 'legend', `legend-${index}`));
        Shared.enableLegendDrag?.(legendGroup, svg, {
          onDragEnd: pos => {
            state.labelPositions.legend = {
              x: pos.x,
              y: pos.y,
              relX: (pos.x - plotRight) / Math.max(legendGapPx, 1),
              relY: (pos.y - margin.top) / Math.max(plotH, 1)
            };
          }
        });
      }
    }
    registerHistGridControlTarget(svg, { fallbackThickness: axisStrokeWidthBase });
    ensureGraphViewport(svg, { padding: Math.max(fs, 14), debugLabel: 'hist-graph' });
    state.layout?.syncPanels?.({ skipSchedule: true });
    syncHistAutoDrawNoticeWidth('draw');
    updateHistStats(fitSets.map((entry, seriesIndex) => ({
      key: entry.key,
      colIndex: entry.colIndex,
      label: entry.label,
      values: entry.values,
      distributionSummaries: entry.fits.map(fit => {
        let gof=null;
        if(fit && fit.valid !== false && typeof statsHelpers.goodnessOfFit === 'function'){
          try{
            gof = statsHelpers.goodnessOfFit(entry.values, {
              distribution: fit.key,
              fit,
              params: fit.params,
              pdf: fit.pdf,
              cdf: fit.cdf,
              alpha
            });
          }catch(err){
            console.error('hist goodnessOfFit error',{ key: fit?.key, message: err?.message, series: entry.label });
          }
        }
        return { fit, gof, color: seriesEntries.length > 1 ? getHistSeriesColor(entry.key, seriesIndex) : fit?.color };
      })
    })));
    if(!densityMode){
      const synced = syncHistFrequencyTableDataView(frequencyModel, frequencySettings, {
        context: viewContext,
        activate: false,
        reason: 'hist-frequency-view-sync'
      });
      if(!synced){
        syncHistFrequencyTableDataView(null, frequencySettings, {
          context: viewContext,
          reason: 'hist-frequency-view-clear'
        });
      }
    }
    histDebug('Debug: drawHistogram complete', { mode: plotMode, seriesCount: seriesEntries.length });
  }

  // Public API
  hist.draw = draw;
  function ensureHistDomBindings(tabLike){
    if(typeof Shared.workspaceTabs?.ensureActiveDomBindings !== 'function'){
      return false;
    }
    const result = Shared.workspaceTabs.ensureActiveDomBindings({
      componentKey: 'hist',
      tabLike: tabLike || null,
      sentinelSelector: '#histHot',
      getCurrentSentinel: () => hist.__domSentinel || null,
      rebind: info => {
        state.root = info?.root
          || Shared.workspaceTabs?.getMountedRoot?.(tabLike || null, 'hist')
          || state.root
          || global.document?.getElementById?.('histPage')
          || global.document;
        hist.ready = false;
        hist.init();
      }
    });
    return !!result?.rebound;
  }

  hist.init = function init(){
    if (hist.ready) { histDebug('Debug: Components.hist.init skipped (already ready)'); return; }
    histDebug('Debug: Components.hist.init');
    state.root = Shared.workspaceTabs?.getMountedRoot?.(null, 'hist')
      || global.document?.getElementById?.('histPage')
      || global.document;
    // Placeholder to avoid early resizer callbacks failing
    state.scheduleDraw = ()=>{};
    state.layout = Shared.componentLayout?.createStandardPanels({
      componentName: 'hist',
        selectors: {
          tablePanel: '#histTablePanel',
          graphPanel: '#histGraphPanel',
          panelResizer: '#histPanelResizer',
          hotWrapper: '#histHotWrapper',
          hotContainer: '#histHot',
          svgBox: () => queryHistRoot('#histGraphPanel .svgbox'),
          resizeTarget: () => queryHistRoot('#histGraphPanel .svgbox')
        },
        scheduleDraw: state.scheduleDraw,
        preserveGraphContent: false,
        panelSyncOptions: {
          disableAutoWidthClamp: true,
          lockGraphPanelWidth: false
        },
        onAfterSync: () => syncHistAutoDrawNoticeWidth('panel-sync'),
      onMinSvgWidth: value => {
        state.minSvgWidth = Math.max(0, Number(value) || 0);
        histDebug('Debug: hist layout min width update', { value: state.minSvgWidth });
      },
      resizableBoxOptions: {
        onResize: () => {
          histDebug('Debug: hist layout onResize schedule trigger');
          scheduleHistNoticeWidth('resize');
          state.scheduleDraw?.({ viewOnly: true, reason: 'resize' });
        }
      }
    });
    state.svgBox = state.layout?.elements?.svgBox || state.svgBox;
    state.layout?.setScheduleDraw?.(state.scheduleDraw);
    state.layout?.syncPanels?.();
    histRenderRowEl = getHistNodeById('histRenderRow');
    histRenderButtonEl = getHistNodeById('histRenderButton');
    histAutoDrawNoticeEl = getHistNodeById('histAutoDrawNotice');
    if(histRenderButtonEl){
      histRenderButtonEl.addEventListener('click', () => {
        histDebug('Debug: hist manual render button');
        const overlayReason = 'manual-render';
        markHistOverlayPending(overlayReason);
        forceHistOverlay(overlayReason, { message: 'Rendering histogram...' });
        state.scheduleDraw?.({ force: true, reason: 'manual-render' });
      });
    }
    scheduleHistNoticeWidth('init');
    initHot();
    initControls();
    initNotes();
    if(!histAutoDrawManager && Shared.hot?.createAutoDrawManager){
      histAutoDrawManager = Shared.hot.createAutoDrawManager({
        component: 'hist',
        state,
        thresholds: {
          rows: HIST_AUTO_DRAW_ROW_THRESHOLD,
          cols: HIST_AUTO_DRAW_COL_THRESHOLD,
          cells: HIST_AUTO_DRAW_CELL_THRESHOLD
        },
        getHot: () => state.hot,
        elements: {
          renderRow: () => histRenderRowEl,
          renderButton: () => histRenderButtonEl,
          notice: () => histAutoDrawNoticeEl
        },
        debugLog: console.debug
      });
    }
    const runHistDrawCycle = () => {
      let status = 'complete';
      try{
        draw();
      }catch(err){
        status = 'error';
        throw err;
      }finally{
        resolveHistOverlay(status);
      }
    };
    const scheduleHistBase = Shared.debounceFrame ? Shared.debounceFrame(runHistDrawCycle) : runHistDrawCycle;
    const scheduleHistInstrumented = (opts) => {
      const nextOpts = opts || {};
      const overlayReason = nextOpts.reason || (nextOpts.force ? 'manual-render' : 'schedule');
      if(nextOpts.force){
        markHistOverlayPending(overlayReason);
        forceHistOverlay(overlayReason, { message: 'Rendering histogram...' });
      }else{
        queueHistOverlay(overlayReason);
      }
      const runSchedule = () => scheduleHistBase(nextOpts);
      const shouldDelayForOverlay = histOverlayController?.isActive?.() && !nextOpts.viewOnly;
      if(shouldDelayForOverlay){
        const scheduleAfterPaint = () => {
          histDebug('Debug: hist autoDraw deferred for overlay',{ reason: overlayReason });
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
    scheduleDrawHistRaw = Shared.workspaceTabs?.createTabScopedScheduler
      ? Shared.workspaceTabs.createTabScopedScheduler({
          componentKey: 'hist',
          debugLabel: 'hist',
          scheduleRaw: scheduleHistInstrumented
        })
      : scheduleHistInstrumented;
    if(histAutoDrawManager){
      histAutoDrawManager.setScheduleRaw(scheduleDrawHistRaw);
      histAutoDrawManager.setElements({
        renderRow: histRenderRowEl,
        renderButton: histRenderButtonEl,
        notice: histAutoDrawNoticeEl
      });
      state.scheduleDraw = (opts) => histAutoDrawManager.schedule(opts);
      histAutoDrawManager.updateUi();
      histAutoDrawManager.evaluateThresholds();
      syncHistAutoDrawNoticeWidth('auto-draw-init');
    }else{
      state.scheduleDraw = scheduleDrawHistRaw;
    }
    histDebug('Debug: hist scheduleDraw configured via Shared.debounceFrame', { guarded: !!histAutoDrawManager }); // Debug: scheduler setup
    state.layout?.setScheduleDraw?.(state.scheduleDraw);
    ensureHistFontEventListener();
    ensureEmptyPayloadTemplate();
    hist.__domSentinel = getHistNodeById('histHot');
    hist.ready = true;
  };

  hist.ensure = function ensure(){
    if(ensureHistDomBindings()){
      return;
    }
    if (!hist.ready) hist.init();
  };
  hist.activateTab = function activateTab(tab){
    state.root = Shared.workspaceTabs?.getMountedRoot?.(tab || null, 'hist')
      || state.root
      || global.document?.getElementById?.('histPage')
      || global.document;
    if(ensureHistDomBindings(tab)){
      return;
    }
    if(!hist.ready){
      hist.init();
      return;
    }
    if(typeof state.ensureHotForActiveTab === 'function'){
      const hot = state.ensureHotForActiveTab();
      if(hot){
        ensureHistDataViewsForHot(hot, {
          wrapper: getHistNodeById('histHotWrapper'),
          container: hot.__histHostContainer || getHistNodeById('histHot')
        });
        syncHistActiveDataViewFromHot(hot, 'prepare-tab');
      }
    }
    hist.__domSentinel = getHistNodeById('histHot');
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

  hist.captureRenderCache = function captureRenderCache(){
    const plot = getHistNodeById('histPlot');
    const stats = getHistNodeById('histStatsResults');
    const plotCache = detachChildren(plot);
    const statsCache = detachChildren(stats);
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      histDebug('Debug: hist render cache captured', {
        plotNodes: plotCache?.count || 0,
        statsNodes: statsCache?.count || 0
      });
    }
    return { plot: plotCache, stats: statsCache };
  };

  hist.restoreRenderCache = function restoreRenderCache(cache){
    if(!cache){ return false; }
    const plot = getHistNodeById('histPlot');
    const stats = getHistNodeById('histStatsResults');
    const restoredPlot = restoreChildren(plot, cache.plot);
    const restoredStats = restoreChildren(stats, cache.stats);
    const restored = restoredPlot || restoredStats;
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      histDebug('Debug: hist render cache restored', {
        restored,
        plot: restoredPlot,
        stats: restoredStats
      });
    }
    return restored;
  };

  hist.__testHooks = Object.assign({}, hist.__testHooks, {
    computeSummary: values => computeHistSummary(values),
    computeNormalFitDiagnostic: (values, options = {}) => computeHistNormalFitDiagnostic(values, options || {}),
    computeLognormalComparison: values => computeHistLognormalComparison(values),
    kolmogorovSmirnovTwoSample: (a, b) => computeHistKolmogorovSmirnovTwoSample(a, b),
    computeAutoBinWidth: (seriesEntries, options = {}) => computeHistAutoBinWidth(seriesEntries, options || {}),
    buildFrequencyModel: (seriesEntries, options = {}) => buildHistFrequencyModel(seriesEntries, options || {}),
    getDefaultFrequencySettings: () => createDefaultHistFrequencySettings()
  });

})(window);


