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
    if(emptyPayloadTemplate || typeof getPayload !== 'function'){
      return;
    }
    const snapshot = getPayload();
    if(snapshot){
      emptyPayloadTemplate = cloneSimple(snapshot);
    }
  }
  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};

  const hist = Components.hist = Components.hist || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  const fontControls = Shared.fontControls = Shared.fontControls || {};
  const additionalLineControls = Shared.additionalLineControls = Shared.additionalLineControls || {};
  if((typeof additionalLineControls.show !== 'function' || typeof additionalLineControls.registerAdditionalLineElement !== 'function') && typeof require === 'function'){
    try{
      require('../shared/additionalLineControls.js');
    }catch(err){
      console.debug('Debug: hist component additionalLineControls helper require failed', { message: err?.message || String(err) });
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
      console.debug('Debug: hist component gridControls helper require failed', { message: err?.message || String(err) });
    }
  }
  const notesHelper = Shared.notes = Shared.notes || {};
  if(typeof notesHelper.mountFoldable !== 'function' && typeof require === 'function'){
    try{
      require('../shared/notes.js');
    }catch(err){
      console.debug('Debug: hist component notes helper require failed', { message: err?.message || String(err) });
    }
  }
  const dataTransformsApi = Shared.dataTransforms = Shared.dataTransforms || {};
  if(typeof dataTransformsApi.applyTransform !== 'function' && typeof require === 'function'){
    try{
      require('../shared/dataTransforms.js');
    }catch(err){
      console.debug('Debug: hist component dataTransforms helper require failed', { message: err?.message || String(err) });
    }
  }
  const dataViewsApi = Shared.dataViews = Shared.dataViews || {};
  if(typeof dataViewsApi.createManager !== 'function' && typeof require === 'function'){
    try{
      require('../shared/dataViews.js');
    }catch(err){
      console.debug('Debug: hist component dataViews helper require failed', { message: err?.message || String(err) });
    }
  }
  hist.__installed = true; // signal to legacy code to skip
  hist.ready = false; // set true after successful init
  const fileIO = Shared.fileIO = Shared.fileIO || {};
  if(!fileIO.saveGraphFile){
    console.debug('Debug: hist component awaiting Shared.fileIO helpers');
  }
  if(!Shared.tableImport || typeof Shared.tableImport.openFile !== 'function'){
    console.debug('Debug: hist component awaiting Shared.tableImport helpers');
  }

  const ensureGraphViewport = Shared.graphViewport?.createEnsurer
    ? Shared.graphViewport.createEnsurer('hist')
    : (svg, options = {}) => {
      const fn = Shared.ensureGraphViewport || Shared.autoResizeSvg || global.ensureGraphViewport || global.autoResizeSvg;
      if(typeof fn === 'function'){
        fn(svg, { component: 'hist', debugLabel: 'hist-viewport-fallback', ...options });
        return;
      }
      console.debug('Debug: hist ensureGraphViewport helper missing', {
        hasShared: !!Shared,
        hasAutoResize: typeof Shared?.autoResizeSvg === 'function'
      });
    };
  console.debug('Debug: hist graph viewport helper configured', {
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

  const DEFAULT_DISTRIBUTION_COLORS = ['#d95f02', '#1b9e77', '#7570b3', '#e7298a', '#66a61e'];

  function createDefaultDistributionSettings(){
    return {
      selections: { normal: true },
      showPdf: true,
      showCdf: false,
      alpha: 0.05
    };
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

  function normalizeHistPlotMode(value){
    return String(value || '').toLowerCase() === HIST_PLOT_MODE_DENSITY
      ? HIST_PLOT_MODE_DENSITY
      : HIST_PLOT_MODE_HISTOGRAM;
  }

  function getHistDefaultTitle(mode){
    return normalizeHistPlotMode(mode) === HIST_PLOT_MODE_DENSITY ? 'Density Plot' : 'Histogram';
  }

  function getHistDefaultYLabel(mode){
    return normalizeHistPlotMode(mode) === HIST_PLOT_MODE_DENSITY ? 'Density' : 'Count';
  }

  function getHistGraphLabel(mode){
    return normalizeHistPlotMode(mode) === HIST_PLOT_MODE_DENSITY ? 'Density plot' : 'Histogram';
  }

  const HIST_DEFAULT_FILL = '#0000ff';
  const HIST_DEFAULT_BORDER = '#000000';
  const HIST_DEFAULT_BORDER_WIDTH = 1;

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
    barFill: HIST_DEFAULT_FILL,
    barBorder: HIST_DEFAULT_BORDER,
    barBorderWidth: HIST_DEFAULT_BORDER_WIDTH,
    svgBox: null,
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
    distributionSettings: createDefaultDistributionSettings(),
    distributionOptions: [],
    distributionInputs: {
      checkboxes: {},
      showPdf: null,
      showCdf: null
    },
    notes: {
      text: '',
      open: false,
      control: null
    },
    labelPositions: {
      title: null,
      xLabel: null,
      yLabel: null
    }
  };
  let histDataViewsManager = null;
  let histDataToolbarBound = false;
  let histDataToolbarLastActivation = 0;
  const histOverlayController = Shared.loadingOverlay?.createPendingController?.({
    component: 'hist',
    message: 'Rendering histogram...',
    getHost: () => (
      state.svgBox
      || document.querySelector('#histGraphPanel .svgbox')
      || document.getElementById('histGraphPanel')
    )
  });

  function markHistOverlayPending(reason){
    histOverlayController?.markPending(reason);
    console.debug('Debug: hist overlay pending flagged', { reason: reason || 'data-change' });
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
    const plotModeSelect = document.getElementById('histPlotMode');
    if(plotModeSelect && plotModeSelect.value !== mode){
      plotModeSelect.value = mode;
    }
    const binsFieldset = document.getElementById('histBinsFieldset');
    if(binsFieldset){
      binsFieldset.hidden = densityMode;
      binsFieldset.setAttribute('aria-hidden', densityMode ? 'true' : 'false');
    }
    const histBinsInput = document.getElementById('histBins');
    if(histBinsInput){
      histBinsInput.disabled = densityMode;
    }
    const cdfInput = document.getElementById('histShowCdf');
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

  function applyHistPlotMode(mode, options = {}){
    const previousMode = normalizeHistPlotMode(state.plotMode);
    const nextMode = normalizeHistPlotMode(mode);
    state.plotMode = nextMode;
    if(options.syncDefaults !== false){
      if(state.titleAuto || state.titleText === getHistDefaultTitle(previousMode)){
        state.titleText = getHistDefaultTitle(nextMode);
        state.titleAuto = true;
      }
      if(state.yLabelAuto || state.yLabelText === getHistDefaultYLabel(previousMode)){
        state.yLabelText = getHistDefaultYLabel(nextMode);
        state.yLabelAuto = true;
      }
    }
    syncHistPlotModeControls();
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug('Debug: hist plot mode applied', {
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

  let histNoticeBoundWidth = null;
  const syncHistAutoDrawNoticeWidth = (reason) => {
    const svgBox = state.svgBox || state.layout?.elements?.svgBox || document.querySelector('#histGraphPanel .svgbox');
    const renderRow = histRenderRowEl || document.getElementById('histRenderRow');
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
      console.debug('Debug: hist auto draw notice width synced', { width, reason: reason || null });
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

  function activateHistDataToolbar(reason){
    const now = Date.now();
    if(now - histDataToolbarLastActivation < 80){
      return false;
    }
    histDataToolbarLastActivation = now;
    const activated = !!Shared.workspaceToolbar?.activateSection?.('hist', 'Data');
    if(activated){
      console.debug('Debug: hist data toolbar activated', { reason: reason || 'unknown' });
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
          const nextData = Array.isArray(view.data) ? view.data : [];
          hotInstance.loadData(nextData);
          if(view.exclusions){
            hotInstance.applyExclusions?.(view.exclusions);
          }
          markHistOverlayPending('data-view-switch');
          state.scheduleDraw?.({ reason: 'data-view-switch' });
        },
        onInteraction(){
          activateHistDataToolbar('data-tab-interaction');
        }
      });
      console.debug('Debug: hist data views manager created', {
        tabId: hotInstance.__histTabId || null
      });
    }
    const manager = hotInstance.__histDataViewsManager;
    const hostWrapper = options.wrapper || document.getElementById('histHotWrapper');
    const hostContainer = options.container || hotInstance.__histHostContainer || document.getElementById('histHot');
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
    if(reason === 'afterLoadData'){
      manager.refresh?.();
    }
  }

  function applyHistTransformToNewView(transformSpec, options = {}){
    const hot = state.ensureHotForActiveTab?.() || state.hot;
    if(!hot){
      return false;
    }
    const manager = ensureHistDataViewsForHot(hot, {
      wrapper: document.getElementById('histHotWrapper'),
      container: hot.__histHostContainer || document.getElementById('histHot')
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
      console.debug('Debug: hist transform failed', {
        message,
        transform: transformSpec?.type || null
      });
      return false;
    }
    activateHistDataToolbar('transform-applied');
    console.debug('Debug: hist transform created view', {
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
      wrapper: document.getElementById('histHotWrapper'),
      container: hot.__histHostContainer || document.getElementById('histHot')
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
      console.debug('Debug: hist transform pipeline failed', {
        message,
        stepCount: specs.length
      });
      return false;
    }
    activateHistDataToolbar('transform-pipeline-applied');
    console.debug('Debug: hist transform pipeline created view', {
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
    const wrapper = document.getElementById('histHotWrapper');
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
    console.debug('Debug: hist axis notation updated',{ axis, notation: nextValue });
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
    console.debug('Debug: hist axis tick interval updated',{ axis, tickInterval: settings[axis].tickInterval });
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
    console.debug('Debug: hist minor ticks updated',{ axis, enabled: nextValue });
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
    console.debug('Debug: hist minor tick subdivisions updated',{ axis, subdivisions: nextValue });
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
    console.debug('Debug: hist axis stroke width updated',{ strokeWidth: settings.strokeWidth });
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
    console.debug('Debug: hist axis color updated',{ color: settings.color });
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
      getVisible: () => !!document.getElementById('histShowGrid')?.checked,
      onVisibleChange: value => {
        const input = document.getElementById('histShowGrid');
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
    console.debug('Debug: hist axis settings applied',{ settings: state.axisSettings });
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
    console.debug('Debug: hist manual ticks computed',{ interval, tickCount: ticks.length, min: graphMin, max: graphMax });
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
      console.debug('Debug: hist markFontEditable', payload); // Debug: font target tagging summary
    }
  };

  // Format toolbar for histogram bars
  function showHistBarFormatControls(target){
    const doc = global.document;
    if(!doc) return;
    try{ if(typeof Shared.hideAllFormatControls === 'function') Shared.hideAllFormatControls(); }catch(e){}
    if(Shared.symbolToolbar && typeof Shared.symbolToolbar.show === 'function'){
      const resolveBars = () => {
        const root = state.svgBox || doc;
        const nodes = Array.from(root.querySelectorAll('#histSvg [data-hist-bar="1"], #histSvg .hist-bar'));
        return nodes.length ? nodes : (target ? [target] : []);
      };
      const barScopeLabel = (() => {
        const fromSeries = typeof target?.getAttribute === 'function' ? target.getAttribute('data-series') : '';
        const fromLabel = typeof target?.getAttribute === 'function' ? target.getAttribute('data-label') : '';
        const resolved = String(fromSeries || fromLabel || 'Histogram').trim();
        return resolved || 'Histogram';
      })();
      Shared.symbolToolbar.show({
        document: doc,
        target,
        anchorId: 'histFontHost',
        scopeId: 'hist',
        panelTitle: 'Trace',
        formClass: 'workspace-toolbar__form workspace-toolbar__form--single scatter-format-controls hist-bar-controls',
        scope: {
          label: 'Scope',
          options: [
            { value: 'global', label: 'Global', disabled: false },
            { value: 'trace', label: barScopeLabel, datasetLabel: barScopeLabel, disabled: false }
          ],
          value: 'trace'
        },
        fillShape: {
          label: 'Fill',
          showShapePicker: false,
          shapeOptions: [{ value: 'square', label: 'Square' }],
          getColor(){
            return state.barFill || target?.getAttribute?.('fill') || HIST_DEFAULT_FILL;
          },
          getShape(){
            return 'square';
          },
          onColorInput(value){
            state.barFill = value || HIST_DEFAULT_FILL;
            resolveBars().forEach(node => node.setAttribute('fill', value));
          },
          onColorChange(value){
            state.barFill = value || HIST_DEFAULT_FILL;
            state.scheduleDraw?.();
          }
        },
        border: {
          label: 'Border',
          getColor(){
            return state.barBorder || target?.getAttribute?.('stroke') || HIST_DEFAULT_BORDER;
          },
          onColorInput(value){
            state.barBorder = value || HIST_DEFAULT_BORDER;
            resolveBars().forEach(node => node.setAttribute('stroke', value));
          },
          onColorChange(value){
            state.barBorder = value || HIST_DEFAULT_BORDER;
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
      return;
    }
    const anchor = doc.getElementById('histFontHost');
    if(!anchor) return;
    let toolbarHost = anchor.nextElementSibling && anchor.nextElementSibling.classList && anchor.nextElementSibling.classList.contains('font-toolbar-host')
      ? anchor.nextElementSibling
      : null;
    if(!toolbarHost){
      toolbarHost = doc.createElement('div');
      toolbarHost.className = 'font-toolbar-host';
      toolbarHost.dataset.fontToolbarScope = 'hist';
      toolbarHost.style.display = 'none';
      anchor.insertAdjacentElement('afterend', toolbarHost);
    }
    doc.querySelectorAll('.font-toolbar-host.font-toolbar-host--visible').forEach(h => { if(h !== toolbarHost){ h.classList.remove('font-toolbar-host--visible'); h.style.display = 'none'; } });
    toolbarHost.innerHTML = '';
    const wrap = doc.createElement('div');
    wrap.className = 'workspace-toolbar__form workspace-toolbar__form--single hist-bar-controls';

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

    // Fill color
    const fillColor = doc.createElement('input'); fillColor.type='color';
    try{ fillColor.value = state.barFill || HIST_DEFAULT_FILL; }catch(e){}
    fillColor.addEventListener('input', ()=>{ state.barFill = fillColor.value || HIST_DEFAULT_FILL; state.scheduleDraw?.(); });
    fillColor.className = 'hist-fill-color';
    if(typeof Shared.attachColorPickerNear === 'function'){
      try{ Shared.attachColorPickerNear(fillColor); }catch(e){}
    }
    wrap.appendChild(makeInput('Fill', fillColor));

    // Border color
    const borderColor = doc.createElement('input'); borderColor.type='color';
    try{ borderColor.value = state.barBorder || HIST_DEFAULT_BORDER; }catch(e){}
    borderColor.addEventListener('input', ()=>{ state.barBorder = borderColor.value || HIST_DEFAULT_BORDER; state.scheduleDraw?.(); });
    if(typeof Shared.attachColorPickerNear === 'function'){
      try{ Shared.attachColorPickerNear(borderColor); }catch(e){}
    }
    wrap.appendChild(makeInput('Border', borderColor));

    // Border width
    const widthInput = doc.createElement('input'); widthInput.type='number'; widthInput.min='0'; widthInput.step='0.5';
    try{ if(Number.isFinite(Number(state.barBorderWidth))){ widthInput.value = String(state.barBorderWidth); } }catch(e){}
    widthInput.addEventListener('input', ()=>{ const numeric = Number(widthInput.value); state.barBorderWidth = Number.isFinite(numeric) ? Math.max(0, numeric) : 0; state.scheduleDraw?.(); });
    wrap.appendChild(makeInput('Thickness', widthInput));

    toolbarHost.appendChild(wrap);
    toolbarHost.style.display = 'block';
    toolbarHost.classList.add('font-toolbar-host--visible');
    const dock = toolbarHost.closest('.workspace-toolbar__dock'); if(dock){ dock.classList.add('workspace-toolbar__dock--active'); }

    try{
      if(toolbarHost.__histDocClickHandler){ document.removeEventListener('click', toolbarHost.__histDocClickHandler); toolbarHost.__histDocClickHandler=null; }
      const onDocClick = function(evt){ try{ const tgt = evt && evt.target ? evt.target : null; if(!tgt) return; if(toolbarHost.contains(tgt)) return; if(tgt.closest && tgt.closest('.shared-color-picker')) return; toolbarHost.classList.remove('font-toolbar-host--visible'); toolbarHost.style.display='none'; try{ if(typeof Shared.hideAllFormatControls === 'function') Shared.hideAllFormatControls(); }catch(e){} const d = toolbarHost.closest('.workspace-toolbar__dock'); if(d) d.classList.remove('workspace-toolbar__dock--active'); document.removeEventListener('click', onDocClick); toolbarHost.__histDocClickHandler=null; }catch(err){ console.warn('hist.bar format docClick error', err); } };
      document.addEventListener('click', onDocClick);
      toolbarHost.__histDocClickHandler = onDocClick;
    }catch(err){ console.warn('hist attach doc click failed', err); }
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
    const doc = global.document;
    if(!doc) return;
    try{ if(typeof Shared.hideAllFormatControls === 'function') Shared.hideAllFormatControls(); }catch(e){}
    const anchor = doc.getElementById('histFontHost');
    if(!anchor) return;
    let toolbarHost = anchor.nextElementSibling && anchor.nextElementSibling.classList && anchor.nextElementSibling.classList.contains('font-toolbar-host')
      ? anchor.nextElementSibling
      : null;
    if(!toolbarHost){
      toolbarHost = doc.createElement('div');
      toolbarHost.className = 'font-toolbar-host';
      toolbarHost.dataset.fontToolbarScope = 'hist';
      toolbarHost.style.display = 'none';
      anchor.insertAdjacentElement('afterend', toolbarHost);
    }
    doc.querySelectorAll('.font-toolbar-host.font-toolbar-host--visible').forEach(h => { if(h !== toolbarHost){ h.classList.remove('font-toolbar-host--visible'); h.style.display = 'none'; } });
    toolbarHost.innerHTML = '';
    const wrap = doc.createElement('div');
    wrap.className = 'workspace-toolbar__form workspace-toolbar__form--single hist-overlay-controls';

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
      const root = state.svgBox || doc;
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
    const scopeField = doc.createElement('label');
    scopeField.className = 'workspace-toolbar__input workspace-toolbar__input--compact workspace-toolbar__input--scope';
    const scopeLabel = doc.createElement('span'); scopeLabel.className = 'workspace-toolbar__input-label'; scopeLabel.textContent = 'Scope';
    const scopeSelect = doc.createElement('select'); scopeSelect.className = 'workspace-toolbar__select';
    const optGlobal = doc.createElement('option'); optGlobal.value = 'global'; optGlobal.textContent = 'Global'; scopeSelect.appendChild(optGlobal);
    const scopeDistKeys = orderedDistKeys();
    if(scopeDistKeys.length){
      scopeDistKeys.forEach(name => {
        const optSeries = doc.createElement('option');
        optSeries.value = 'series';
        optSeries.textContent = name;
        optSeries.dataset.scopeDataset = name;
        scopeSelect.appendChild(optSeries);
      });
    }else{
      const optSeries = doc.createElement('option');
      optSeries.value = 'series';
      optSeries.textContent = distKey || 'Series';
      optSeries.disabled = !distKey;
      if(distKey){ optSeries.dataset.scopeDataset = distKey; }
      scopeSelect.appendChild(optSeries);
    }
    scopeSelect.value = distKey ? 'series' : 'global';
    scopeSelect.addEventListener('change', () => {
      if(scopeSelect.value === 'series'){
        const selected = scopeSelect.selectedOptions && scopeSelect.selectedOptions.length ? scopeSelect.selectedOptions[0] : null;
        const scopedDistKey = String(selected?.dataset?.scopeDataset || '').trim();
        if(scopedDistKey){
          distKey = scopedDistKey;
        }
      }
    });
    scopeField.appendChild(scopeLabel); scopeField.appendChild(scopeSelect);
    wrap.appendChild(scopeField);

    const colorInput = doc.createElement('input'); colorInput.type='color';
    try{ colorInput.value = target.getAttribute('stroke') || state.distributionOptions?.find(o=>o.key===distKey)?.color || '#d95f02'; }catch(e){}
    colorInput.addEventListener('input', ()=>{
      const v = colorInput.value;
      const scope = scopeSelect.value;
      if(scope === 'series' && distKey){
        const opt = state.distributionOptions.find(o=>o.key===distKey);
        if(opt){ opt.color = v; }
        // immediate reflect on target
        try{ target.setAttribute('stroke', v); }catch(e){}
        state.scheduleDraw();
      }else{
        // apply globally
        state.distributionOptions.forEach(o=>{ o.color = v; });
        // update existing overlay elements immediately
        Array.from((state.svgBox || document).querySelectorAll('.hist-overlay')).forEach(el=>el.setAttribute('stroke', v));
        state.scheduleDraw();
      }
    });
    if(typeof Shared.attachColorPickerNear === 'function'){
      try{ Shared.attachColorPickerNear(colorInput); }catch(e){}
    }
    wrap.appendChild(makeInput('Color', colorInput));

    const widthInput = doc.createElement('input'); widthInput.type='number'; widthInput.min='0'; widthInput.step='0.5';
    try{ const cur = Number(target.getAttribute('stroke-width')) || state.distributionOptions?.find(o=>o.key===distKey)?.strokeWidth; if(Number.isFinite(cur)) widthInput.value=String(cur); }catch(e){}
    widthInput.addEventListener('input', ()=>{
      const next = Number(widthInput.value);
      if(!Number.isFinite(next)) return;
      const scope = scopeSelect.value;
      if(scope==='series' && distKey){
        const opt = state.distributionOptions.find(o=>o.key===distKey);
        if(opt){ opt.strokeWidth = next; }
        try{ target.setAttribute('stroke-width', String(next)); }catch(e){}
        state.scheduleDraw();
      }else{
        state.distributionOptions.forEach(o=>{ o.strokeWidth = next; });
        // update existing overlay elements immediately
        Array.from((state.svgBox || document).querySelectorAll('.hist-overlay')).forEach(el=>el.setAttribute('stroke-width', String(next)));
        state.scheduleDraw();
      }
    });
    wrap.appendChild(makeInput('Thickness', widthInput));

    // Transparency (alpha): slider indicates transparency (0 = opaque, 100 = fully transparent)
    const alphaInput = doc.createElement('input'); alphaInput.type='range'; alphaInput.min='0'; alphaInput.max='100'; alphaInput.step='1';
    const existingAlpha = Number(target.getAttribute('stroke-opacity'));
    // existingAlpha is opacity (0..1); convert to transparency percent
    const resolvedTransparencyPct = Number.isFinite(existingAlpha) ? Math.round((1 - existingAlpha) * 100) : 0;
    alphaInput.value = String(resolvedTransparencyPct);
    const alphaValue = doc.createElement('span'); alphaValue.className = 'workspace-toolbar__input-value'; alphaValue.textContent = `${alphaInput.value}%`;
    alphaInput.addEventListener('input', ()=>{
      const pct = Number(alphaInput.value);
      const bounded = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
      const transparency = bounded / 100;
      const opacity = 1 - transparency;
      alphaValue.textContent = `${Math.round(bounded)}%`;
      if(scopeSelect.value === 'series' && distKey){
        const opt = state.distributionOptions.find(o=>o.key===distKey);
        if(opt) opt.alpha = opacity;
        target.setAttribute('stroke-opacity', String(opacity));
        state.scheduleDraw();
      }else{
        state.distributionOptions.forEach(o=>{ o.alpha = opacity; });
        Array.from((state.svgBox || document).querySelectorAll('.hist-overlay')).forEach(el=>el.setAttribute('stroke-opacity', String(opacity)));
        state.scheduleDraw();
      }
    });
    const alphaWrap = doc.createElement('div'); alphaWrap.style.display='inline-flex'; alphaWrap.style.alignItems='center'; alphaWrap.appendChild(alphaInput); alphaWrap.appendChild(alphaValue);
    wrap.appendChild(makeInput('Transparency', alphaWrap));

    toolbarHost.appendChild(wrap);
    toolbarHost.style.display = 'block'; toolbarHost.classList.add('font-toolbar-host--visible');
    const dock = toolbarHost.closest('.workspace-toolbar__dock'); if(dock){ dock.classList.add('workspace-toolbar__dock--active'); }

    try{ if(toolbarHost.__histDocClickHandler){ document.removeEventListener('click', toolbarHost.__histDocClickHandler); toolbarHost.__histDocClickHandler=null; } const onDocClick = function(evt){ try{ const tgt = evt && evt.target ? evt.target : null; if(!tgt) return; if(toolbarHost.contains(tgt)) return; if(tgt.closest && tgt.closest('.shared-color-picker')) return; toolbarHost.classList.remove('font-toolbar-host--visible'); toolbarHost.style.display='none'; try{ if(typeof Shared.hideAllFormatControls === 'function') Shared.hideAllFormatControls(); }catch(e){} const d = toolbarHost.closest('.workspace-toolbar__dock'); if(d) d.classList.remove('workspace-toolbar__dock--active'); document.removeEventListener('click', onDocClick); toolbarHost.__histDocClickHandler=null; }catch(err){ console.warn('hist.overlay format docClick error', err); } }; document.addEventListener('click', onDocClick); toolbarHost.__histDocClickHandler = onDocClick; }catch(err){ console.warn('attach doc click for hist overlay controls failed', err); }
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
    if(!keys.length || typeof statsHelpers.fitDistribution !== 'function'){
      return results;
    }
    const debugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
    keys.forEach((key, index) => {
      let fitResult = null;
      try{
        fitResult = statsHelpers.fitDistribution(values, { distribution: key });
      }catch(err){
        console.error('hist fitDistribution error',{ key, message: err?.message });
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
        console.debug('Debug: hist distribution fit',{ key: fitResult.key, valid: fitResult.valid !== false, message: fitResult.message || null });
      }
    });
    return results;
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
      console.debug('Debug: hist density bandwidth resolved', { n, sigma, iqr: iqrVal, scale, bandwidth, fallback, resolved });
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
      console.debug('Debug: hist density series computed', {
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
    console.debug('Debug: hist initHot using shared factory', { hasFactory: typeof Shared.hot?.createStandardTable === 'function' });
    if(typeof Shared.hot?.createStandardTable !== 'function'){
      console.error('hist initHot missing Shared.hot.createStandardTable');
      return;
    }
    const data = Shared.createEmptyData(HIST_DEFAULT_ROWS, HIST_DEFAULT_COLS);
    let histScheduleProxyCount = 0;
    const scheduleHistDrawProxy = () => {
      histScheduleProxyCount += 1;
      if(histScheduleProxyCount <= 5){
        console.debug('Debug: hist scheduleDraw proxy invoked', { count: histScheduleProxyCount }); // Debug: table change trigger
        if(histScheduleProxyCount === 5){
          console.debug('Debug: hist scheduleDraw proxy suppressing further logs'); // Debug: proxy log suppression notice
        }
      }
      if(document.getElementById('histStatsResults')){
        updateHistStats([], []);
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
        firstRowClassName: 'htCenter',
        pinFirstRow: true,
        scheduleOnLoadData: true,
        hotOptions: {
          stretchH: 'all',
          minSpareRows: 10,
          afterChange(changes, source){
            if(changes){
              console.log('hist afterChange', { count: changes.length, source });
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
            console.log('hist undo');
          },
          afterRedo(){
            console.log('hist redo');
          }
        }
      });
      if(instance){
        instance.__histHostContainer = container || null;
      }
      return instance;
    };
    const ensureHistHotForActiveTab = () => {
      const wrapper = document.getElementById('histHotWrapper');
      const baseContainer = document.getElementById('histHot');
      if(typeof Shared.hot?.ensureTableForTab !== 'function' || !wrapper || !baseContainer){
        if(!state.hot){
          state.hot = createHistTable(baseContainer);
        }
        if(state.hot){
          state.hot.__histHostContainer = baseContainer;
          state.hot.__histTabId = Shared.hot.resolveActiveTabId?.() || 'hist-default';
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
    const histPlotMode=$('#histPlotMode'), histBins=$('#histBins'), histShowGrid=$('#histShowGrid'), histShowFrame=$('#histShowFrame'), histLogY=$('#histLogY'), histFontSize=$('#histFontSize'), histFontSizeVal=$('#histFontSizeVal');
    if(histFontSize?.dataset){
      histFontSize.dataset.fontBasePt = String(histFontSize.value);
      console.debug('Debug: hist font size base initialized',{ value: histFontSize.value }); // Debug: initial base size
    }
    chartStyle.renderFontSizeLabel({ element: histFontSizeVal, pt: Number(histFontSize.value), input: histFontSize, manual: true });
    state.distributionOptions = getDistributionOptions();
    state.distributionSettings.selections = mergeDistributionSelections(state.distributionSettings?.selections || {}, state.distributionOptions);
    applyHistPlotMode(histPlotMode?.value || state.plotMode, { schedule: false, syncDefaults: false });
    const distListEl=document.getElementById('histDistributionList');
    const debugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
    if(histPlotMode){
      histPlotMode.value = normalizeHistPlotMode(state.plotMode);
      histPlotMode.addEventListener('change',()=>{
        applyHistPlotMode(histPlotMode.value);
      });
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
            console.debug('Debug: hist distribution selection change',{ key: opt.key, checked: input.checked });
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
        console.debug('Debug: hist distribution controls initialized',{ options: state.distributionOptions.map(opt=>opt.key) });
      }
    }
    const histShowPdfInput=document.getElementById('histShowPdf');
    const histShowCdfInput=document.getElementById('histShowCdf');
    if(histShowPdfInput){
      histShowPdfInput.checked=!!state.distributionSettings.showPdf;
      histShowPdfInput.addEventListener('change',()=>{
        state.distributionSettings.showPdf=!!histShowPdfInput.checked;
        if(debugEnabled){
          console.debug('Debug: hist showPdf toggle',{ checked: state.distributionSettings.showPdf });
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
          console.debug('Debug: hist showCdf toggle',{ checked: state.distributionSettings.showCdf });
        }
        state.scheduleDraw();
      });
      state.distributionInputs.showCdf=histShowCdfInput;
    }
    syncHistPlotModeControls();
    [histBins,histShowGrid,histLogY].forEach(el=>el?.addEventListener('input',()=>state.scheduleDraw()));
    histShowFrame?.addEventListener('change',()=>{ console.debug('Debug: hist showFrame change',{checked:histShowFrame.checked}); state.scheduleDraw(); });
    histFontSize.addEventListener('input',()=>{
      if(histFontSize.dataset){
        histFontSize.dataset.fontBasePt = String(histFontSize.value);
        console.debug('Debug: hist font size input manual set',{ value: histFontSize.value }); // Debug: manual slider update
      }
      chartStyle.renderFontSizeLabel({ element: histFontSizeVal, pt: Number(histFontSize.value), input: histFontSize, manual: true });
      state.scheduleDraw();
    });

    // Example + Import
    const example=[['Exam Score'],[55],[60],[65],[70],[75],[80],[85],[90],[95],[100]];
    const exampleBtn = document.getElementById('histLoadExample');
    if(exampleBtn){
      exampleBtn.addEventListener('click',()=>{
        markHistOverlayPending('example-data');
        state.hot.loadData(example, {
          source: 'example-load',
          recordUndo: true,
          undoLabel: 'table:hist:example-load'
        });
        console.log('hist example loaded');
        state.scheduleDraw();
      });
    } else {
      console.warn('hist example button missing');
    }
    const histImportBtn=document.getElementById('histImport');
    const histFileInput=document.getElementById('histFile');
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
          onProcessed: info => console.log('hist data imported',{rows: info?.rows, cols: info?.cols}),
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
      console.debug('Debug: hist export controls mounted', { hasExporter: true }); // Debug: hist export mount
    } else {
      console.debug('Debug: hist export controls unavailable', { hasExporter: !!Shared.exporter }); // Debug: hist export fallback
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
        wrapper: document.getElementById('histHotWrapper'),
        container: activeHot.__histHostContainer || document.getElementById('histHot')
      });
      syncHistActiveDataViewFromHot(activeHot, 'payload');
      const dataViewsPayload = activeManager?.serialize?.({ includeData: true }) || null;
      const includeDataViews = !!(dataViewsPayload && Array.isArray(dataViewsPayload.views) && dataViewsPayload.views.length > 1);
      const axisSettings = ensureAxisSettings();
      const plotMode = normalizeHistPlotMode(state.plotMode);
      const c={
        plotMode,
        title:state.titleText,
        xLabel:state.xLabelText,
        yLabel:state.yLabelText,
        fill:state.barFill,
        border:state.barBorder,
        borderWidth:state.barBorderWidth,
        bins:$('#histBins').value,
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
        distributions:{
          selected:getActiveDistributionKeys(),
          showPdf:!!state.distributionSettings.showPdf,
          showCdf:!!state.distributionSettings.showCdf,
          alpha:state.distributionSettings.alpha,
          options: Array.isArray(state.distributionOptions)
            ? state.distributionOptions.map((entry, index) => sanitizeDistributionOptionEntry(entry, index, entry))
            : []
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
        dataViews: includeDataViews ? dataViewsPayload : undefined,
        activeDataViewId: includeDataViews ? (dataViewsPayload?.activeViewId || null) : undefined,
        config: c
      };
      console.debug('Debug: hist.getPayload captured state', {
        rows: payload.data?.length || 0,
        bins: c.bins,
        hasLogY: c.logY
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
            wrapper: document.getElementById('histHotWrapper'),
            container: state.hot.__histHostContainer || document.getElementById('histHot')
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
      if(state.hot && typeof state.hot.loadData === 'function'){
        state.hot.loadData(dataToLoad);
        if(exclusionsToApply && typeof state.hot.applyExclusions === 'function'){
          state.hot.applyExclusions(exclusionsToApply);
        }
        syncHistActiveDataViewFromHot(state.hot, 'payload-load');
      }
      const config = payload.config || {};
      importFontStyles('hist', config.fontStyles || null);
      const loadedPlotMode = normalizeHistPlotMode(config.plotMode);
      applyHistPlotMode(loadedPlotMode, { schedule: false, syncDefaults: false });
      state.titleText = config.title || getHistDefaultTitle(loadedPlotMode);
      state.titleAuto = state.titleText === getHistDefaultTitle(loadedPlotMode);
      state.xLabelText = config.xLabel || state.xLabelText;
      state.yLabelText = config.yLabel || getHistDefaultYLabel(loadedPlotMode);
      state.yLabelAuto = state.yLabelText === getHistDefaultYLabel(loadedPlotMode);
      state.barFill = (typeof config.fill === 'string' && config.fill.trim()) ? config.fill : HIST_DEFAULT_FILL;
      state.barBorder = (typeof config.border === 'string' && config.border.trim()) ? config.border : HIST_DEFAULT_BORDER;
      const loadedBorderWidth = Number(config.borderWidth);
      state.barBorderWidth = Number.isFinite(loadedBorderWidth) && loadedBorderWidth >= 0
        ? loadedBorderWidth
        : HIST_DEFAULT_BORDER_WIDTH;
      const histBinsInput = document.getElementById('histBins');
      if(histBinsInput){ histBinsInput.value = config.bins || histBinsInput.value; }
      const histShowGridInput = document.getElementById('histShowGrid');
      if(histShowGridInput){ histShowGridInput.checked = !!config.showGrid; }
      setGridStyle(config.gridStyle, config.axis?.strokeWidth);
      const histShowFrameInput = document.getElementById('histShowFrame');
      if(histShowFrameInput){ histShowFrameInput.checked = config.showFrame !== false; }
      const histLogYInput = document.getElementById('histLogY');
      if(histLogYInput){ histLogYInput.checked = !!config.logY; }
      const histFontInput = document.getElementById('histFontSize');
      const histFontSizeVal = document.getElementById('histFontSizeVal');
      if(histFontInput){
        histFontInput.value = config.fontSize || histFontInput.value;
        if(histFontInput.dataset){
          histFontInput.dataset.fontBasePt = String(histFontInput.value);
          console.debug('Debug: hist font size base restored',{ value: histFontInput.value });
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
        console.debug('Debug: hist axis settings restored',{ axis: ensureAxisSettings() });
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
      const distListEl = document.getElementById('histDistributionList');
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
          yLabel: config.labelPositions.yLabel || null
        };
      }
      if(!skipDraw && typeof state.scheduleDraw === 'function'){
        state.scheduleDraw();
      }
      if(scheduleBackup){
        state.scheduleDraw = scheduleBackup;
      }
      const rowCount = Array.isArray(dataToLoad) ? dataToLoad.length : 0;
      console.debug('Debug: hist payload applied', { source, rows: rowCount });
      return true;
    }
    hist.getPayload = getPayload;
    hist.captureEmptyPayloadTemplate = function captureHistEmptyPayloadTemplate(){
    ensureEmptyPayloadTemplate();
    const snapshot = cloneSimple(emptyPayloadTemplate);
    console.debug('Debug: hist empty payload template captured', { hasTemplate: !!snapshot });
    return snapshot;
  };
  hist.restoreEmptyPayloadTemplate = function restoreHistEmptyPayloadTemplate(template, options = {}){
    if(!template || typeof template !== 'object'){
      console.debug('Debug: hist empty payload template restore skipped', { reason: 'invalid-template', options });
      return false;
    }
    emptyPayloadTemplate = cloneSimple(template);
    console.debug('Debug: hist empty payload template restored', { hasTemplate: !!emptyPayloadTemplate, reason: options.reason || 'unspecified' });
    return !!emptyPayloadTemplate;
  };
  hist.createEmptyPayload = function createEmptyHistPayload(){
      hist.ensure();
      ensureEmptyPayloadTemplate();
      const payload = cloneSimple(emptyPayloadTemplate) || { type: 'hist', config: {} };
      payload.type = 'hist';
      const createEmpty = Shared.createEmptyData;
      const emptyData = typeof createEmpty === 'function'
        ? createEmpty(HIST_DEFAULT_ROWS, HIST_DEFAULT_COLS)
        : Array.from({ length: HIST_DEFAULT_ROWS }, () => Array(HIST_DEFAULT_COLS).fill(''));
      payload.data = emptyData;
      payload.exclusions = [];
      return payload;
    };
    hist.save = async function(){
      console.debug('Debug: hist.save invoked', { hasHandle: !!state.fileHandle });
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
      console.debug('Debug: hist.save result', result);
    };
    hist.saveAs = async function(){
      console.debug('Debug: hist.saveAs invoked', { currentName: state.fileName });
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
      console.debug('Debug: hist.saveAs result', result);
    };
    hist.open = async function(){
      console.debug('Debug: hist.open invoked');
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
          const input = document.getElementById('histGraphFile');
          if(input){
            input.value='';
            input.click();
          }
        }
      });
      console.debug('Debug: hist.open result', result);
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
    document.getElementById('openHistGraph')?.addEventListener('click', hist.open);
    document.getElementById('saveHistGraph')?.addEventListener('click', hist.save);
    document.getElementById('saveAsHist').addEventListener('click', hist.saveAs);
    document.getElementById('histGraphFile').addEventListener('change',e=>{const f=e.target.files[0]; if(f){ state.fileName=f.name; state.fileHandle=null; hist.loadFromFile(f); }});
  }

  function initNotes(){
    const stack = document.querySelector('#histGraphPanel .hist-plot-stack');
    if(!stack){
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        console.debug('Debug: hist notes mount skipped (missing stack)');
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
          console.debug('Debug: hist notes toggled', { open: state.notes.open });
        }
      }
    });
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug('Debug: hist notes initialized', {
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

  function updateHistStats(values, distributionSummaries){
    const target = document.getElementById('histStatsResults');
    const debugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
    const graphLabel = getHistGraphLabel(state.plotMode);
    if(!target){
      if(debugEnabled){
        console.debug('Debug: hist stats target missing');
      }
      return;
    }
    const numericValues = Array.isArray(values) ? values.filter(Number.isFinite) : [];
    target.innerHTML = '';
    if(!numericValues.length){
      target.textContent = 'No data';
      if(debugEnabled){
        console.debug('Debug: hist stats skipped (no values)');
      }
      return;
    }
    const sorted = numericValues.slice().sort((a, b) => a - b);
    const percentile = (list, p) => {
      if(!list.length) return NaN;
      const pos = (list.length - 1) * p;
      const base = Math.floor(pos);
      const rest = pos - base;
      const baseVal = list[base];
      const nextVal = list[base + 1] !== undefined ? list[base + 1] : baseVal;
      return baseVal + rest * (nextVal - baseVal);
    };
    const mean = (global.jStat?.mean ? global.jStat.mean(sorted) : sorted.reduce((s,v)=>s+v,0)/sorted.length) || 0;
    const median = global.jStat?.median ? global.jStat.median(sorted) : percentile(sorted, 0.5);
    const sd = global.jStat?.stdev ? global.jStat.stdev(sorted, true) : Math.sqrt(sorted.reduce((s,v)=>s+Math.pow(v-mean,2),0)/(sorted.length || 1));
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const q1 = global.jStat?.quantiles ? global.jStat.quantiles(sorted, [0.25])?.[0] : percentile(sorted, 0.25);
    const q3 = global.jStat?.quantiles ? global.jStat.quantiles(sorted, [0.75])?.[0] : percentile(sorted, 0.75);
    const bestFit = Array.isArray(distributionSummaries) ? distributionSummaries.find(entry => entry?.fit?.valid !== false && entry?.fit) : null;
    const statsRow = {
      column: state.xLabelText || 'Column 1',
      n: sorted.length,
      mean: formatNumber(mean, 2),
      median: formatNumber(median, 2),
      sd: formatNumber(sd, 2),
      min: formatNumber(min, 2),
      q1: formatNumber(q1, 2),
      q3: formatNumber(q3, 2),
      max: formatNumber(max, 2)
    };
    const statsModel = {
      caption: 'Descriptive statistics',
      columns: [
        { key: 'column', label: 'Column' },
        { key: 'n', label: 'N', align: 'right' },
        { key: 'mean', label: 'Mean', align: 'right' },
        { key: 'median', label: 'Median', align: 'right' },
        { key: 'sd', label: 'SD', align: 'right' },
        { key: 'min', label: 'Min', align: 'right' },
        { key: 'q1', label: 'Q1', align: 'right' },
        { key: 'q3', label: 'Q3', align: 'right' },
        { key: 'max', label: 'Max', align: 'right' }
      ],
      rows: [statsRow],
      footnotes: bestFit?.fit?.label ? [`Best fit: ${bestFit.fit.label}`] : [],
      options: {
        fileName: 'histogram-stats',
        contextLabel: 'hist-stats'
      },
      target,
      append: false
    };
    if(Shared.statsTable && typeof Shared.statsTable.render === 'function'){
      Shared.statsTable.render(statsModel);
      if(Shared.statsReporting && typeof Shared.statsReporting.appendReportPanel === 'function'){
        Shared.statsReporting.appendReportPanel(target, {
          methodsText: `${graphLabel} descriptive statistics were computed for ${sorted.length} numeric observations${bestFit?.fit?.label ? ` with distribution fitting assessed against ${bestFit.fit.label}` : ''}.`,
          resultsText: `Mean = ${statsRow.mean}, median = ${statsRow.median}, SD = ${statsRow.sd}, and range = ${statsRow.min} to ${statsRow.max}.`,
          analysisSpec: {
            component: 'hist',
            n: sorted.length,
            bestFit: bestFit?.fit?.key || bestFit?.fit?.label || null,
            distributionsTried: Array.isArray(distributionSummaries) ? distributionSummaries.length : 0
          }
        }, { title: 'Reporting and reproducibility' });
      }
      if(debugEnabled){
        console.debug('Debug: hist stats rendered via Shared.statsTable', { rows: statsModel.rows.length });
      }
      return;
    }
    // Fallback plain table if statsTable is unavailable
    const table = document.createElement('table');
    table.className = 'stats-table';
    const headerRow = document.createElement('tr');
    statsModel.columns.forEach(col => {
      const th = document.createElement('th');
      th.textContent = col.label;
      headerRow.appendChild(th);
    });
    table.appendChild(headerRow);
    const bodyRow = document.createElement('tr');
    statsModel.columns.forEach(col => {
      const td = document.createElement('td');
      td.textContent = statsRow[col.key];
      bodyRow.appendChild(td);
    });
    table.appendChild(bodyRow);
    target.appendChild(table);
    if(Shared.statsReporting && typeof Shared.statsReporting.appendReportPanel === 'function'){
      Shared.statsReporting.appendReportPanel(target, {
        methodsText: `${graphLabel} descriptive statistics were computed for ${sorted.length} numeric observations${bestFit?.fit?.label ? ` with distribution fitting assessed against ${bestFit.fit.label}` : ''}.`,
        resultsText: `Mean = ${statsRow.mean}, median = ${statsRow.median}, SD = ${statsRow.sd}, and range = ${statsRow.min} to ${statsRow.max}.`,
        analysisSpec: {
          component: 'hist',
          n: sorted.length,
          bestFit: bestFit?.fit?.key || bestFit?.fit?.label || null,
          distributionsTried: Array.isArray(distributionSummaries) ? distributionSummaries.length : 0
        }
      }, { title: 'Reporting and reproducibility' });
    }
    if(debugEnabled){
      console.debug('Debug: hist stats rendered via fallback table', { rows: statsModel.rows.length });
    }
  }

  function draw(){
    // Reuse existing global draw implementation if present? Implement local logic mirroring legacy drawHistogram
    const histBins=$('#histBins'), histShowGrid=$('#histShowGrid'), histShowFrame=$('#histShowFrame'), histLogY=$('#histLogY'), histFontSize=$('#histFontSize');
    ensureAxisSettings();
    const plotMode = normalizeHistPlotMode(state.plotMode);
    const densityMode = plotMode === HIST_PLOT_MODE_DENSITY;
    const data=state.hot.getDataAtCol(0);
    const labelRaw=data[0];
    state.xLabelText=(labelRaw&&String(labelRaw).trim())||'Value';
    const values=[]; for(let i=1;i<data.length;i++){const v=parseFloat(data[i]); if(!isNaN(v)) values.push(v);}
    const plotEl=document.getElementById('histPlot'); while(plotEl.firstChild) plotEl.removeChild(plotEl.firstChild);
    if(!values.length){
      if(typeof Shared.renderPlotNotice === 'function'){
        Shared.renderPlotNotice(plotEl, Shared.getEmptyPlotNoticeMessage ? Shared.getEmptyPlotNoticeMessage() : null, { resetAspect: true, show: true });
      }else{
        plotEl.innerHTML='<i>Add data to the input table to generate a plot.</i>';
      }
      updateHistStats(values, []);
      return;
    }
    const distributionFits = prepareDistributionFits(values);
    const includePdf = !!state.distributionSettings.showPdf;
    const includeCdf = densityMode ? false : !!state.distributionSettings.showCdf;
    const statsHelpers = Shared.stats || {};
    const alpha = Number(state.distributionSettings.alpha) > 0 ? Number(state.distributionSettings.alpha) : 0.05;
    const rawXMin = Math.min(...values);
    const rawXMax = Math.max(...values);
    let xMin = rawXMin;
    let xMax = rawXMax;
    const W=Math.max(50,Math.floor(plotEl.clientWidth||50));
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
      console.debug('Debug: hist domain padded for identical values', {
        rawXMin,
        rawXMax,
        pad,
        adjustedMin: xMin,
        adjustedMax: xMax
      });
    }
    let densitySeries = null;
    if(densityMode){
      densitySeries = computeHistDensitySeries(values, {
        sampleCount: Math.min(240, Math.max(64, Math.round(W)))
      });
      if(Number.isFinite(densitySeries.domainMin) && Number.isFinite(densitySeries.domainMax) && densitySeries.domainMax > densitySeries.domainMin){
        xMin = densitySeries.domainMin;
        xMax = densitySeries.domainMax;
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
    const bins=Math.max(1,Math.floor(Number(histBins.value)||10));
    const logY=histLogY.checked;
    const storedManualIntervalX = getAxisTickInterval('x');
    const storedManualIntervalY = getAxisTickInterval('y');
    const manualIntervalX = storedManualIntervalX;
    const manualIntervalY = logY ? null : storedManualIntervalY;
    if(logY && storedManualIntervalY){
      console.debug('Debug: hist manual interval suppressed',{ axis: 'y', reason: 'log-scale', stored: storedManualIntervalY });
    }
    plotEl.style.position='relative';
    const svg=document.createElementNS(NS,'svg'); svg.setAttribute('id','histSvg'); svg.setAttribute('width',String(W)); svg.setAttribute('height',String(H)); svg.setAttribute('viewBox',`0 0 ${W} ${H}`); svg.setAttribute('font-family',chartStyle.FONT_FAMILY); chartStyle.applySvgDefaults(svg); plotEl.appendChild(svg);
    if(fontControls && typeof fontControls.enableForSvg === 'function'){
      fontControls.enableForSvg(svg,{ scopeId: 'hist' });
      console.debug('Debug: hist fontControls enableForSvg invoked',{ width: W, height: H }); // Debug: font panel binding
    } else {
      console.debug('Debug: hist fontControls enableForSvg missing',{ hasFontControls: !!fontControls }); // Debug: font panel missing
    }
    const histNotationX = getAxisNotation('x');
    const histNotationY = getAxisNotation('y');
    const formatTickX = v => chartStyle.formatAxisValue(v,{ notation: histNotationX, maxDecimals: 2 });
    const formatTickY = v => chartStyle.formatAxisValue(v,{ notation: histNotationY, maxDecimals: 2 });
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
    const borderWidthRaw=Number(state.barBorderWidth)||0;
    const borderWidthPx=chartStyle.scaleStrokeWidth(borderWidthRaw, styleScaleInfo, { context: 'hist-border', min: 0 });
    console.debug('Debug: hist style scaling applied',{
      borderWidthRaw,
      borderWidthPx,
      axisStrokeWidth,
      axisStrokeWidthBase,
      axisStroke,
      styleScale: styleScaleInfo?.styleScale
    }); // Debug: histogram style scaling summary
    chartStyle.renderFontSizeLabel({ element: histFontSizeVal, fontInfo, input: histFontSize });
    console.debug('Debug: hist font scaling applied',{
      input:histFontSize.value,
      fontSizePt:fontInfo.pt,
      baseFontPx:fontInfo.px,
      scaledFontPx:fs,
      scale:styleScaleInfo?.styleScale || styleScaleInfo?.scale,
      containerWidth:containerRect?.width,
      containerHeight:containerRect?.height
    });
    const axisMetrics=chartStyle.createAxisMetrics(fontInfo.px, styleScaleInfo);
    console.debug('Debug: hist axis metrics',axisMetrics);
    let xTickTarget=chartStyle.estimateTickCount(W,{axis:'x',fallback:6});
    let yTickTarget=chartStyle.estimateTickCount(H,{axis:'y',fallback:6});
    console.debug('Debug: hist initial tick targets',{xTickTarget,yTickTarget,width:W,height:H});
    const tickFont=chartStyle.makeFont(fs);
    const axisLabelFont=chartStyle.makeFont(fs);
    const yTitleWidthBase=chartStyle.measureText(state.yLabelText,axisLabelFont);
    const tickLen=axisMetrics.tickLength;
    const tickGap=axisMetrics.tickLabelGap;
    let margin=chartStyle.computeBaseMargins({fontSize:fs,maxYLabelWidth:0,yTitleWidth:yTitleWidthBase,axisMetrics});
    let plotW=Math.max(20,W-margin.left-margin.right);
    let plotH=Math.max(20,H-margin.top-margin.bottom);
    let bottomLayout=chartStyle.computeBottomLayout({labels:[],fontSize:fs,plotWidth:plotW,baseBottom:margin.bottom,axisMetrics});
    margin.bottom=bottomLayout.bottom;
    plotW=Math.max(20,W-margin.left-margin.right);
    plotH=Math.max(20,H-margin.top-margin.bottom);
    let xScale=buildAxisScale({ dataMin: xMin, dataMax: xMax, targetTickCount: xTickTarget });
    let yScale=buildAxisScale({ dataMin: 0, dataMax: 1, targetTickCount: yTickTarget, manualMin: 0 });
    let xTickLabels=[];
    let yTickLabels=[];
    let counts=[];
    let binWidth=0;
    let yMin=0;
    let yMax=0;
    let yMinT=0;
    let yMaxT=0;
    let maxYLabelWidth = 0;
    for(let pass=0;pass<2;pass++){
      xScale=buildAxisScale({ dataMin: xMin, dataMax: xMax, targetTickCount: xTickTarget });
      if(densityMode){
        if(!densitySeries || !Array.isArray(densitySeries.positions) || !densitySeries.positions.length){
          densitySeries = computeHistDensitySeries(values, {
            sampleCount: Math.min(240, Math.max(64, Math.round(W))),
            minVal: xScale.min,
            maxVal: xScale.max
          });
        }
        counts = [];
        binWidth = 0;
        yMin = 0;
        yMax = Number.isFinite(densitySeries?.peak) ? densitySeries.peak : 0;
        if(logY){
          const minPositive = Number.isFinite(densitySeries?.minPositive) ? densitySeries.minPositive : Infinity;
          yMin = Number.isFinite(minPositive) ? Math.max(minPositive, 1e-9) : 1e-6;
          if(yMax <= 0){
            yMax = yMin * 10;
          }
        }
      }else{
        binWidth=(xScale.max-xScale.min)/bins || 1;
        counts=new Array(bins).fill(0);
        values.forEach(v=>{let idx=Math.floor((v-xScale.min)/binWidth); if(idx<0)idx=0; if(idx>=bins)idx=bins-1; counts[idx]++;});
        yMin=0;
        const maxCount = Math.max(...counts, 0);
        yMax = Number.isFinite(maxCount) ? maxCount : 0;
        if(logY){
          const minPositive = counts.reduce((min,val)=> (val>0 && val<min ? val : min), Infinity);
          yMin = Number.isFinite(minPositive) ? Math.max(minPositive, 1e-3) : 0.1;
          if(yMax <= 0){
            yMax = yMin * 10;
          }
        }
      }
      if(yMax<=yMin){
        yMax = yMin + 1;
      }
      if(distributionFits.length && (includePdf || includeCdf)){
        const metrics = computeOverlayMetrics(distributionFits, {
          xMin: xScale.min,
          xMax: xScale.max,
          binWidth,
          sampleCount: values.length,
          includePdf,
          includeCdf,
          plotPixels: W,
          scaleMode: densityMode ? HIST_PLOT_MODE_DENSITY : HIST_PLOT_MODE_HISTOGRAM
        });
        const overlayMax = Math.max(metrics.pdfMax || 0, metrics.cdfMax || 0);
        if(Number.isFinite(overlayMax) && overlayMax > yMax){
          if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
            console.debug('Debug: hist overlay range extend',{ overlayMax, previous: yMax });
          }
          yMax = overlayMax;
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
      console.debug('Debug: hist axis auto range',{ yMin, yMax, logY });
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
          console.debug('Debug: hist manual interval applied',{ axis: 'x', interval: manualIntervalX, tickCount: manualX.ticks.length });
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
          console.debug('Debug: hist manual interval applied',{ axis: 'y', interval: manualIntervalY, tickCount: manualY.ticks.length });
        }
      }
      xTickLabels=xScale.ticks.map(t=>formatTickX(t));
      yTickLabels=yScale.ticks.map(t=>formatTickY(logY?Math.pow(10,t):t));
      const yLabelWidths=yTickLabels.map(lbl=>chartStyle.measureText(lbl,tickFont));
      maxYLabelWidth=Math.max(...yLabelWidths,0);
      margin=chartStyle.computeBaseMargins({fontSize:fs,maxYLabelWidth,yTitleWidth:yTitleWidthBase,axisMetrics});
      plotW=Math.max(20,W-margin.left-margin.right);
      plotH=Math.max(20,H-margin.top-margin.bottom);
      bottomLayout=chartStyle.computeBottomLayout({labels:xTickLabels,fontSize:fs,plotWidth:plotW,baseBottom:margin.bottom,axisMetrics});
      margin.bottom=bottomLayout.bottom;
      plotW=Math.max(20,W-margin.left-margin.right);
      plotH=Math.max(20,H-margin.top-margin.bottom);
      const refinedX=chartStyle.estimateTickCount(plotW,{axis:'x',fallback:xTickTarget});
      const refinedY=chartStyle.estimateTickCount(plotH,{axis:'y',fallback:yTickTarget});
      console.debug('Debug: hist tick target evaluation',{pass,plotW,plotH,xTickTarget,refinedX,yTickTarget,refinedY,maxYLabelWidth,bins,binWidth});
      if(refinedX===xTickTarget && refinedY===yTickTarget){
        break;
      }
      xTickTarget=refinedX;
      yTickTarget=refinedY;
    }
    console.debug('Debug: hist layout',{margin,plotW,plotH,rotate:bottomLayout.shouldRotate,xTickTarget,yTickTarget,binWidth});
    const showGrid=$('#histShowGrid').checked;
    const showFrame=$('#histShowFrame').checked;
    console.debug('Debug: hist showFrame state',{showFrame});
    const x2px=v=>margin.left+plotW*(v-xScale.min)/(xScale.max-xScale.min);
    const y2px=v=>margin.top+plotH*(1-(v-yScale.min)/(yScale.max-yScale.min));
    function add(tag,attrs){const el=document.createElementNS(NS,tag); for(const[k,v] of Object.entries(attrs)) el.setAttribute(k,String(v)); svg.appendChild(el); return el;}
      if(showGrid){
        yScale.ticks.forEach(t=>{
          const y=y2px(t);
          const gridLine = add('line',Object.assign({x1:margin.left,y1:y,x2:margin.left+plotW,y2:y},gridStrokeAttrs));
          gridLine.setAttribute('data-grid-control','1');
        });
        console.debug('Debug: hist grid stroke scaled',{horizontal:yScale.ticks.length,gridStrokeStyle});
      }
    const xTickPositions=xScale.ticks.map(t=>x2px(t));
    const yTickPositions=yScale.ticks.map(t=>y2px(t));
    let axisXStart=xTickPositions.length?Math.min(...xTickPositions):margin.left;
    let axisXEnd=xTickPositions.length?Math.max(...xTickPositions):margin.left+plotW;
    let axisYStart=yTickPositions.length?Math.min(...yTickPositions):margin.top;
    let axisYEnd=yTickPositions.length?Math.max(...yTickPositions):margin.top+plotH;
    if(axisXStart===axisXEnd){axisXStart=margin.left;axisXEnd=margin.left+plotW;}
    if(axisYStart===axisYEnd){axisYStart=margin.top;axisYEnd=margin.top+plotH;}
    console.debug('Debug: hist axis span',{axisXStart,axisXEnd,axisYStart,axisYEnd});
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
      console.debug('Debug: hist axes stroke scaled',{ axisStrokeWidth, axisStrokeWidthBase, axisStroke });
    if(showFrame){
      console.debug('Debug: hist frame request',{stroke:axisStroke, showFrame, axisStrokeWidth}); // Debug: frame styling inputs
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
    console.debug('Debug: hist font tick binding',{ xTickFontCount, yTickFontCount }); // Debug: tick font binding counts
    console.debug('Debug: hist ticks stroke scaled',{xTickCount:xScale.ticks.length,yTickCount:yScale.ticks.length,axisStrokeWidth});
    const fill=state.barFill || HIST_DEFAULT_FILL;
    const borderColor=state.barBorder || HIST_DEFAULT_BORDER;
    if(densityMode){
      const points = [];
      const baselineValue = logY ? Math.max(yMin, 1e-9) : 0;
      const baselineDomain = logY ? Math.log10(baselineValue) : baselineValue;
      const positions = Array.isArray(densitySeries?.positions) ? densitySeries.positions : [];
      const densities = Array.isArray(densitySeries?.densities) ? densitySeries.densities : [];
      for(let index = 0; index < positions.length; index++){
        const x = positions[index];
        const density = densities[index];
        if(!Number.isFinite(x) || !Number.isFinite(density) || density < 0){
          continue;
        }
        const yDomain = logY ? Math.log10(Math.max(density, baselineValue)) : density;
        points.push([x2px(x), y2px(yDomain)]);
      }
      if(points.length > 1){
        const areaLinePath = points.map((point, index) => `${index === 0 ? 'L' : 'L'} ${point[0]} ${point[1]}`);
        const areaPath = [
          `M ${points[0][0]} ${y2px(baselineDomain)}`,
          ...areaLinePath,
          `L ${points[points.length - 1][0]} ${y2px(baselineDomain)}`,
          'Z'
        ];
        const densityShape = add('path',{
          d: areaPath.join(' '),
          fill: fill,
          'fill-opacity': '0.4',
          stroke: borderWidthPx > 0 ? borderColor : 'none',
          'stroke-width': borderWidthPx > 0 ? borderWidthPx : 0,
          'stroke-linejoin': 'round',
          'stroke-linecap': 'round',
          'class': 'hist-bar hist-density-shape',
          'data-hist-bar': '1',
          'data-hist-primary': '1'
        });
        try{
          densityShape.style.cursor='pointer';
          densityShape.addEventListener('click', evt=>{
            try{ evt.stopPropagation(); }catch(e){}
            showHistBarFormatControls(evt.currentTarget);
          });
        }catch(e){}
      }
    }else{
      const edges=Array.from({length:bins+1},(_,i)=>xScale.min+i*binWidth);
      counts.forEach((c,i)=>{ const xStart=x2px(edges[i]); const xEnd=x2px(edges[i+1]); const barW=Math.max(0,xEnd-xStart); const val=logY?Math.log10(Math.max(c,yMin)):c; const y=y2px(val); const h=margin.top+plotH-y; const rect=add('rect',{x:xStart,y,width:barW,height:h,fill:fill,'class':'hist-bar','data-hist-bar':'1'}); if(borderWidthPx>0){rect.setAttribute('stroke',borderColor); rect.setAttribute('stroke-width',borderWidthPx);} try{ rect.style.cursor='pointer'; rect.addEventListener('click', evt=>{ try{ evt.stopPropagation(); }catch(e){} showHistBarFormatControls(evt.currentTarget); }); }catch(e){} });
    }
    if(distributionFits.length && (includePdf || includeCdf)){
      const overlayGroup = add('g',{ 'class':'hist-overlay-group' });
      const sampleCount = values.length;
      const effectiveBinWidth = binWidth || ((xScale.max - xScale.min) || 1);
      const sampleSteps = Math.min(240, Math.max(32, Math.round(plotW)));
      const yLowerBound = densityMode ? yMin : Math.max(0, yMin);
      const logLowerBound = logY ? Math.max(yLowerBound, 1e-6) : yLowerBound;
      const toDomainY = value => {
        if(logY){
          const safe = Math.max(value, logLowerBound);
          return Math.log10(safe);
        }
        return Math.max(value, yLowerBound);
      };
      distributionFits.forEach((fit,index)=>{
        if(!fit || fit.valid === false){ return; }
        const strokeColor = fit.color || DEFAULT_DISTRIBUTION_COLORS[index % DEFAULT_DISTRIBUTION_COLORS.length];
        const strokeWidth = Number.isFinite(Number(fit.strokeWidth)) ? Number(fit.strokeWidth) : Math.max(axisStrokeWidth * 0.9, axisStrokeWidth / 2, 1);
        const strokePattern = sanitizeHistOverlayPattern(fit.pattern || 'solid');
        if(includePdf && typeof fit.pdf === 'function' && effectiveBinWidth > 0){
          const parts=[];
          for(let step=0;step<sampleSteps;step++){
            const t=sampleSteps===1?0:step/(sampleSteps-1);
            const x=xScale.min+(xScale.max-xScale.min)*t;
            const density=fit.pdf(x);
            if(!Number.isFinite(density) || density<0){ continue; }
            const expected = densityMode
              ? density
              : density*sampleCount*effectiveBinWidth;
            const yDomain=toDomainY(expected);
            parts.push(`${step===0?'M':'L'} ${x2px(x)} ${y2px(yDomain)}`);
          }
          if(parts.length>1){
            const p = add('path',{
              d:parts.join(' '),
              fill:'none',
              stroke:strokeColor,
              'stroke-width':strokeWidth,
              'stroke-opacity': Number.isFinite(Number(fit.alpha)) ? fit.alpha : 1,
              'stroke-dasharray': histOverlayPatternToDasharray(strokePattern) || null,
              'stroke-linejoin':'round',
              'stroke-linecap':'round',
              'data-dist':fit.key || fit.label,
              'data-overlay-type':'pdf',
              'pointer-events':'stroke',
              'class':'hist-overlay hist-overlay--pdf'
            });
            try{ p.style.cursor='pointer'; p.style.pointerEvents = p.style.pointerEvents || 'stroke'; p.addEventListener('click', evt=>{ try{ evt.stopPropagation(); }catch(e){} showHistOverlayFormatControls(evt.currentTarget); }); }catch(e){}
          }
        }
        if(includeCdf && typeof fit.cdf === 'function'){
          const parts=[];
          for(let step=0;step<sampleSteps;step++){
            const t=sampleSteps===1?0:step/(sampleSteps-1);
            const x=xScale.min+(xScale.max-xScale.min)*t;
            const cumulative=clampUnit(fit.cdf(x));
            const expected = densityMode ? cumulative : cumulative*sampleCount;
            const yDomain=toDomainY(expected);
            parts.push(`${step===0?'M':'L'} ${x2px(x)} ${y2px(yDomain)}`);
          }
          if(parts.length>1){
            const p = add('path',{
              d:parts.join(' '),
              fill:'none',
              stroke:strokeColor,
              'stroke-width':strokeWidth,
              'stroke-opacity': Number.isFinite(Number(fit.alpha)) ? fit.alpha : 1,
              'stroke-dasharray': histOverlayPatternToDasharray(strokePattern) || null,
              'stroke-linejoin':'round',
              'stroke-linecap':'round',
              'data-dist':fit.key || fit.label,
              'data-overlay-type':'cdf',
              'pointer-events':'stroke',
              'class':'hist-overlay hist-overlay--cdf'
            });
            try{ p.style.cursor='pointer'; p.style.pointerEvents = p.style.pointerEvents || 'stroke'; p.addEventListener('click', evt=>{ try{ evt.stopPropagation(); }catch(e){} showHistOverlayFormatControls(evt.currentTarget); }); }catch(e){}
          }
        }
      });
      if(!overlayGroup.hasChildNodes()){
        svg.removeChild(overlayGroup);
      }
    }
    const xAxisBase=margin.top+plotH;
    const defaultXLabelX = margin.left+plotW/2;
    const defaultXLabelY = xAxisBase+bottomLayout.titleOffset;
    const xLabelPos = state.labelPositions?.xLabel;
    
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
    xText.textContent=state.xLabelText;
    markFontEditable(xText,'xTitle','xTitle');
    const applyHistXLabel=value=>{
      const nextValue=value!=null?String(value):'';
      state.xLabelText=nextValue;
      if(xText.textContent!==nextValue){
        xText.textContent=nextValue;
      }
      if(typeof state.scheduleDraw==='function'){
        state.scheduleDraw();
      }
    };
    if(global.makeEditable){
      makeEditable(xText,txt=>{
        console.log('HIST X-AXIS EDIT HANDLER CALLED!');
        
        const previous=state.xLabelText!=null?String(state.xLabelText):'';
        const nextValue=txt!=null?String(txt):'';
        
        console.log('HIST X-AXIS EDIT - Previous:', previous, 'Next:', nextValue);
        
        if(previous===nextValue){
          console.log('HIST X-AXIS EDIT - No change, returning');
          return;
        }
        
        // Create a combined apply function that updates both visual and table header
        const applyBoth = (value) => {
          console.log('HIST applyBoth called with value:', value);
          
          // Update visual title
          applyHistXLabel(value);
          console.log('HIST applyBoth - Visual title updated to:', value);
          
          // Also update the table header to maintain consistency
          const hot = state.hot;
          console.log('HIST applyBoth - HOT instance:', hot);
          
          if(hot && typeof hot.setDataAtCell === 'function'){
            try {
              const data = hot.getData() || [];
              console.log('HIST applyBoth - Table data:', data);
              
              if(Array.isArray(data) && data.length > 0) {
                const headerRow = Array.isArray(data[0]) ? data[0] : [];
                console.log('HIST applyBoth - Header row:', headerRow);
                
                if(headerRow.length > 0) {
                  console.log('HIST applyBoth - Current header[0]:', headerRow[0], 'New value:', value);
                  
                  // For histogram, the data is in column 0, so header is at [0][0]
                  if(headerRow[0] !== value) {
                    console.log('HIST applyBoth - Updating table header...');
                    
                    // Try multiple approaches to ensure the update works
                    let updateSuccessful = false;
                    
                    // Approach 1: setDataAtCell (primary method)
                    try {
                      const result = hot.setDataAtCell([0, 0, value], 'hist-x-axis-edit');
                      console.log('HIST applyBoth - setDataAtCell result:', result);
                      
                      // Verify the update
                      const verifyData1 = hot.getData() || [];
                      const verifyHeader1 = Array.isArray(verifyData1[0]) ? verifyData1[0] : [];
                      if(verifyHeader1[0] === value) {
                        updateSuccessful = true;
                        console.log('HIST applyBoth - SUCCESS with setDataAtCell');
                      }
                    } catch(err) {
                      console.log('HIST applyBoth - setDataAtCell failed:', err.message);
                    }
                    
                    // Approach 2: Direct data manipulation (fallback)
                    if(!updateSuccessful) {
                      try {
                        const currentData = hot.getData() || [];
                        const newData = JSON.parse(JSON.stringify(currentData));
                        
                        if(Array.isArray(newData[0]) && newData[0].length > 0) {
                          newData[0][0] = value;
                          
                          // Try different update methods
                          if(typeof hot.setData === 'function') {
                            hot.setData(newData);
                            console.log('HIST applyBoth - Used setData method');
                          } else if(typeof hot.updateSettings === 'function') {
                            hot.updateSettings({ data: newData });
                            console.log('HIST applyBoth - Used updateSettings method');
                          } else if(typeof hot.gridApi?.setRowData === 'function') {
                            hot.gridApi.setRowData(newData);
                            console.log('HIST applyBoth - Used gridApi.setRowData method');
                          } else {
                            console.warn('HIST applyBoth - No suitable update method found');
                          }
                          
                          // Verify the update
                          const verifyData2 = hot.getData() || [];
                          const verifyHeader2 = Array.isArray(verifyData2[0]) ? verifyData2[0] : [];
                          if(verifyHeader2[0] === value) {
                            updateSuccessful = true;
                            console.log('HIST applyBoth - SUCCESS with direct manipulation');
                          }
                        }
                      } catch(err) {
                        console.error('HIST applyBoth - Direct manipulation failed:', err);
                      }
                    }
                    
                    if(!updateSuccessful) {
                      console.error('HIST applyBoth - FAILED: All update methods failed');
                    }
                  } else {
                    console.log('HIST applyBoth - Header already matches, no update needed');
                  }
                } else {
                  console.error('HIST applyBoth - Header row is empty');
                }
              } else {
                console.error('HIST applyBoth - No table data available');
              }
            } catch(err) {
              console.error('HIST applyBoth - Failed to update histogram x-axis header:', err);
            }
          } else {
            console.error('HIST applyBoth - HOT instance or setDataAtCell not available');
          }
          
          // Force a redraw to ensure consistency
          if(typeof state.scheduleDraw === 'function'){
            console.log('HIST applyBoth - Scheduling redraw');
            state.scheduleDraw();
          } else {
            console.warn('HIST applyBoth - scheduleDraw not available');
          }
          
          console.log('HIST applyBoth - Completed');
          return true;
        };
        
        console.log('HIST X-AXIS EDIT - Calling applyBoth with:', nextValue);
        applyBoth(nextValue);
        
        console.log('HIST X-AXIS EDIT - Recording change for undo');
        recordHistChange('hist:x-label',previous,nextValue,applyBoth);
        
        console.log('HIST X-AXIS EDIT - Completed');
      });
    }
    // Enable drag for x-axis label
    if(typeof Shared.enableLabelDrag === 'function'){
      Shared.enableLabelDrag(xText, svg, {
        onDragEnd: pos => {
          // Store both absolute and relative positions for xLabel
          const relX = (pos.x - margin.left) / plotW;
          const relY = (pos.y - xAxisBase) / (plotH + margin.top);
          state.labelPositions.xLabel = { 
            x: pos.x, 
            y: pos.y,
            relX: relX, 
            relY: relY 
          };
          console.debug('Debug: hist x-label position saved', { absolute: pos, relative: { relX, relY } });
        }
      });
    }
    const yLabelOffsetSpan = (maxYLabelWidth + tickLen + tickGap + axisMetrics.axisTitleGap + fs * 0.5);
    const yX = margin.left - yLabelOffsetSpan;
    const defaultYLabelX = yX;
    const defaultYLabelY = margin.top+plotH/2;
    const yLabelPos = state.labelPositions?.yLabel;
    
    // Convert relative positions to absolute if needed for yLabel
    let absoluteYTextX = defaultYLabelX;
    let absoluteYTextY = defaultYLabelY;
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
    
    const yText=add('text',{x:absoluteYTextX,y:absoluteYTextY,'dominant-baseline':'middle',transform:`rotate(-90 ${absoluteYTextX} ${absoluteYTextY})`,'text-anchor':'middle','font-size':fs,fill:chartStyle.TEXT_COLOR});
    yText.textContent=state.yLabelText;
    markFontEditable(yText,'yTitle','yTitle');
    const applyHistYLabel=value=>{
      const nextValue=value!=null?String(value):'';
      state.yLabelText=nextValue;
      state.yLabelAuto = nextValue === getHistDefaultYLabel(state.plotMode);
      if(yText.textContent!==nextValue){
        yText.textContent=nextValue;
      }
      if(typeof state.scheduleDraw==='function'){
        state.scheduleDraw();
      }
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
    // Enable drag for y-axis label
    if(typeof Shared.enableLabelDrag === 'function'){
      Shared.enableLabelDrag(yText, svg, {
        onDragEnd: pos => {
          // Store both absolute and relative positions for yLabel
          const relX = (pos.x - margin.left) / yLabelOffsetSpan;
          const relY = (pos.y - margin.top) / plotH;
          state.labelPositions.yLabel = { 
            x: pos.x, 
            y: pos.y,
            relX: relX, 
            relY: relY 
          };
          console.debug('Debug: hist y-label position saved', { absolute: pos, relative: { relX, relY } });
        }
      });
    }
    const defaultTitleX = margin.left+plotW/2;
    const defaultTitleY = margin.top/2;
    const titlePos = state.labelPositions?.title;
    
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
    titleText.textContent=state.titleText;
    markFontEditable(titleText,'graphTitle','graphTitle');
    const applyHistTitle=value=>{
      const nextValue=value!=null?String(value):'';
      state.titleText=nextValue;
      state.titleAuto = nextValue === getHistDefaultTitle(state.plotMode);
      if(titleText.textContent!==nextValue){
        titleText.textContent=nextValue;
      }
      if(typeof state.scheduleDraw==='function'){
        state.scheduleDraw();
      }
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
    // Enable drag for title
    if(typeof Shared.enableLabelDrag === 'function'){
      Shared.enableLabelDrag(titleText, svg, {
        onDragEnd: pos => {
          // Store both absolute and relative positions
          const relX = (pos.x - margin.left) / plotW;
          const relY = (pos.y - margin.top) / plotH;
          state.labelPositions.title = { 
            x: pos.x, 
            y: pos.y,
            relX: relX, 
            relY: relY 
          };
          console.debug('Debug: hist title position saved', { absolute: pos, relative: { relX, relY } });
        }
      });
    }
    registerHistGridControlTarget(svg, { fallbackThickness: axisStrokeWidthBase });
    ensureGraphViewport(svg, { padding: Math.max(fs, 14), debugLabel: 'hist-graph' });
    state.layout?.syncPanels?.({ skipSchedule: true });
    syncHistAutoDrawNoticeWidth('draw');
    // Update stats panel
    const distributionSummaries = [];
    if(distributionFits.length){
      distributionFits.forEach(fit=>{
        let gof=null;
        if(fit && fit.valid !== false && typeof statsHelpers.goodnessOfFit === 'function'){
          try{
            gof = statsHelpers.goodnessOfFit(values, {
              distribution: fit.key,
              fit,
              params: fit.params,
              pdf: fit.pdf,
              cdf: fit.cdf,
              alpha
            });
          }catch(err){
            console.error('hist goodnessOfFit error',{ key: fit?.key, message: err?.message });
          }
        }
        distributionSummaries.push({ fit, gof, color: fit?.color });
      });
    }
    updateHistStats(values, distributionSummaries);
    console.debug('Debug: drawHistogram complete');
  }

  // Public API
  hist.draw = draw;
  hist.init = function init(){
    if (hist.ready) { console.debug('Debug: Components.hist.init skipped (already ready)'); return; }
    console.debug('Debug: Components.hist.init');
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
          svgBox: () => document.querySelector('#histGraphPanel .svgbox'),
          resizeTarget: () => document.querySelector('#histGraphPanel .svgbox')
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
        console.debug('Debug: hist layout min width update', { value: state.minSvgWidth });
      },
      resizableBoxOptions: {
        onResize: () => {
          console.debug('Debug: hist layout onResize schedule trigger');
          scheduleHistNoticeWidth('resize');
          state.scheduleDraw?.({ viewOnly: true, reason: 'resize' });
        }
      }
    });
    state.svgBox = state.layout?.elements?.svgBox || state.svgBox;
    state.layout?.setScheduleDraw?.(state.scheduleDraw);
    state.layout?.syncPanels?.();
    histRenderRowEl = document.getElementById('histRenderRow');
    histRenderButtonEl = document.getElementById('histRenderButton');
    histAutoDrawNoticeEl = document.getElementById('histAutoDrawNotice');
    if(histRenderButtonEl){
      histRenderButtonEl.addEventListener('click', () => {
        console.debug('Debug: hist manual render button');
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
          console.debug('Debug: hist autoDraw deferred for overlay',{ reason: overlayReason });
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
    scheduleDrawHistRaw = scheduleHistInstrumented;
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
    console.debug('Debug: hist scheduleDraw configured via Shared.debounceFrame', { guarded: !!histAutoDrawManager }); // Debug: scheduler setup
    state.layout?.setScheduleDraw?.(state.scheduleDraw);
    ensureEmptyPayloadTemplate();
    hist.ready = true;
  };

  hist.ensure = function ensure(){ if (!hist.ready) hist.init(); };
  hist.prepareForTab = function prepareForTab(){
    if(!hist.ready){
      hist.init();
      return;
    }
    if(typeof state.ensureHotForActiveTab === 'function'){
      const hot = state.ensureHotForActiveTab();
      if(hot){
        ensureHistDataViewsForHot(hot, {
          wrapper: document.getElementById('histHotWrapper'),
          container: hot.__histHostContainer || document.getElementById('histHot')
        });
        syncHistActiveDataViewFromHot(hot, 'prepare-tab');
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

  hist.captureRenderCache = function captureRenderCache(){
    const plot = document.getElementById('histPlot');
    const stats = document.getElementById('histStatsResults');
    const plotCache = detachChildren(plot);
    const statsCache = detachChildren(stats);
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug('Debug: hist render cache captured', {
        plotNodes: plotCache?.count || 0,
        statsNodes: statsCache?.count || 0
      });
    }
    return { plot: plotCache, stats: statsCache };
  };

  hist.restoreRenderCache = function restoreRenderCache(cache){
    if(!cache){ return false; }
    const plot = document.getElementById('histPlot');
    const stats = document.getElementById('histStatsResults');
    const restoredPlot = restoreChildren(plot, cache.plot);
    const restoredStats = restoreChildren(stats, cache.stats);
    const restored = restoredPlot || restoredStats;
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug('Debug: hist render cache restored', {
        restored,
        plot: restoredPlot,
        stats: restoredStats
      });
    }
    return restored;
  };

})(window);
