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
  let histRenderRowEl = null;
  let histRenderButtonEl = null;
  let histAutoDrawNoticeEl = null;
  let histAutoDrawManager = null;
  let scheduleDrawHistRaw = () => {};
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

  function createDefaultAxisSettings(){
    return {
      strokeWidth: 1,
      color: DEFAULT_AXIS_COLOR,
      x: { tickInterval: null },
      y: { tickInterval: null }
    };
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

  function getActiveDistributionKeys(){
    const selections = state.distributionSettings?.selections || {};
    return Object.keys(selections).filter(key => selections[key]);
  }

  let state = {
    hot: null,
    scheduleDraw: null,
    fileHandle: null,
    fileName: 'histogram.graph',
    titleText: 'Histogram',
    xLabelText: 'Value',
    yLabelText: 'Count',
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
    distributionSettings: createDefaultDistributionSettings(),
    distributionOptions: [],
    distributionInputs: {
      checkboxes: {},
      showPdf: null,
      showCdf: null
    }
  };
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
      state.axisSettings.x = { tickInterval: null };
    }
    if(!state.axisSettings.y || typeof state.axisSettings.y !== 'object'){
      state.axisSettings.y = { tickInterval: null };
    }
    const strokeNumeric = Number(state.axisSettings.strokeWidth);
    state.axisSettings.strokeWidth = Number.isFinite(strokeNumeric) && strokeNumeric > 0 ? strokeNumeric : 1;
    if(typeof state.axisSettings.color !== 'string' || !state.axisSettings.color){
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
    console.debug('Debug: hist axis tick interval updated',{ axis, tickInterval: settings[axis].tickInterval });
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

  function clampUnit(value){
    if(!Number.isFinite(value)) return 0;
    if(value < 0) return 0;
    if(value > 1) return 1;
    return value;
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
      fitResult.color = fitResult.color || option?.color || DEFAULT_DISTRIBUTION_COLORS[colorIndex];
      fitResult.valid = fitResult.valid !== false && fitResult.params !== undefined ? true : fitResult.valid;
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
    if(!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMax === xMin || !Number.isFinite(binWidth) || binWidth <= 0 || !Number.isFinite(sampleCount) || sampleCount <= 0){
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
            const expected = density * sampleCount * binWidth;
            if(expected > pdfMax){ pdfMax = expected; }
          }
        }
        if(includeCdf && typeof fit.cdf === 'function'){
          const cumulative = clampUnit(fit.cdf(x));
          const expected = cumulative * sampleCount;
          if(expected > cdfMax){ cdfMax = expected; }
        }
      }
    }
    return { pdfMax, cdfMax };
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
      if(typeof state.scheduleDraw === 'function'){
        state.scheduleDraw();
      }
    };

    const createHistTable = (container) => Shared.hot.createStandardTable(container, { rows: HIST_DEFAULT_ROWS, cols: HIST_DEFAULT_COLS }, scheduleHistDrawProxy, {
      debugLabel: 'hist',
      data,
      firstRowClassName: 'htCenter',
      scheduleOnLoadData: true,
      hotOptions: {
        stretchH: 'all',
        minSpareRows: 10,
        afterChange(changes, source){
          if(changes){
            console.log('hist afterChange', { count: changes.length, source });
          }
        },
        afterUndo(){
          console.log('hist undo');
        },
        afterRedo(){
          console.log('hist redo');
        }
      }
    });
    const ensureHistHotForActiveTab = () => {
      const wrapper = document.getElementById('histHotWrapper');
      const baseContainer = document.getElementById('histHot');
      if(typeof Shared.hot?.ensureTableForTab !== 'function' || !wrapper || !baseContainer){
        if(!state.hot){
          state.hot = createHistTable(baseContainer);
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
      return state.hot;
    };
    state.hot = ensureHistHotForActiveTab();
    state.ensureHotForActiveTab = ensureHistHotForActiveTab;
  }

  function initControls(){
    const histFill=$('#histFill'), histBorder=$('#histBorder'), histBorderWidth=$('#histBorderWidth'), histBins=$('#histBins'), histShowGrid=$('#histShowGrid'), histShowFrame=$('#histShowFrame'), histLogY=$('#histLogY'), histFontSize=$('#histFontSize'), histFontSizeVal=$('#histFontSizeVal');
    if(histFontSize?.dataset){
      histFontSize.dataset.fontBasePt = String(histFontSize.value);
      console.debug('Debug: hist font size base initialized',{ value: histFontSize.value }); // Debug: initial base size
    }
    chartStyle.renderFontSizeLabel({ element: histFontSizeVal, pt: Number(histFontSize.value), input: histFontSize, manual: true });
    state.distributionOptions = getDistributionOptions();
    state.distributionSettings.selections = mergeDistributionSelections(state.distributionSettings?.selections || {}, state.distributionOptions);
    const distListEl=document.getElementById('histDistributionList');
    const debugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
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
    [histFill,histBorder,histBorderWidth,histBins,histShowGrid,histLogY].forEach(el=>el.addEventListener('input',()=>state.scheduleDraw()));
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
        state.hot.loadData(example);
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
        tableImport.openFile(histFileInput, {
          hot: state.hot,
          minCols: HIST_DEFAULT_COLS,
          minRows: HIST_DEFAULT_ROWS,
          scheduleDraw: state.scheduleDraw,
          debugLabel: 'hist',
          onProcessed: info => console.log('hist data imported',{rows: info?.rows, cols: info?.cols})
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
      const axisSettings = ensureAxisSettings();
      const c={
        title:state.titleText,
        xLabel:state.xLabelText,
        yLabel:state.yLabelText,
        fill:$('#histFill').value,
        border:$('#histBorder').value,
        borderWidth:$('#histBorderWidth').value,
        bins:$('#histBins').value,
        showGrid:$('#histShowGrid').checked,
        showFrame:$('#histShowFrame').checked,
        logY:$('#histLogY').checked,
        fontSize:$('#histFontSize').value,
        fontStyles: (exportFontStyles('hist') || undefined),
        axis:{
          strokeWidth: axisSettings.strokeWidth,
          color: axisSettings.color,
          tickIntervalX: axisSettings.x?.tickInterval ?? null,
          tickIntervalY: axisSettings.y?.tickInterval ?? null
        },
        distributions:{
          selected:getActiveDistributionKeys(),
          showPdf:!!state.distributionSettings.showPdf,
          showCdf:!!state.distributionSettings.showCdf,
          alpha:state.distributionSettings.alpha
        }
      };
    const payload = {
        type:'hist',
        data: state.hot.getData(),
        exclusions: state.hot?.exportExclusions?.() || Shared.hot.exportExclusions(state.hot),
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
      const dataMatrix = Array.isArray(payload.data) ? payload.data : [];
      if(state.hot && typeof state.hot.loadData === 'function'){
        state.hot.loadData(dataMatrix);
        if(payload.exclusions && typeof state.hot.applyExclusions === 'function'){
          state.hot.applyExclusions(payload.exclusions);
        }
      }
      const config = payload.config || {};
      importFontStyles('hist', config.fontStyles || null);
      state.titleText = config.title || state.titleText;
      state.xLabelText = config.xLabel || state.xLabelText;
      state.yLabelText = config.yLabel || state.yLabelText;
      const histFillInput = document.getElementById('histFill');
      if(histFillInput){ histFillInput.value = config.fill || histFillInput.value; }
      const histBorderInput = document.getElementById('histBorder');
      if(histBorderInput){ histBorderInput.value = config.border || histBorderInput.value; }
      const histBorderWidthInput = document.getElementById('histBorderWidth');
      if(histBorderWidthInput){ histBorderWidthInput.value = config.borderWidth || histBorderWidthInput.value; }
      const histBinsInput = document.getElementById('histBins');
      if(histBinsInput){ histBinsInput.value = config.bins || histBinsInput.value; }
      const histShowGridInput = document.getElementById('histShowGrid');
      if(histShowGridInput){ histShowGridInput.checked = !!config.showGrid; }
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
          tickIntervalY: axisConfig.tickIntervalY ?? axisConfig.yTickInterval ?? axisConfig?.y?.tickInterval ?? null
        });
        console.debug('Debug: hist axis settings restored',{ axis: ensureAxisSettings() });
      }
      if(!Array.isArray(state.distributionOptions) || !state.distributionOptions.length){
        state.distributionOptions = getDistributionOptions();
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
      if(state.distributionInputs?.showPdf){
        state.distributionInputs.showPdf.checked = !!state.distributionSettings.showPdf;
      }
      if(state.distributionInputs?.showCdf){
        state.distributionInputs.showCdf.checked = !!state.distributionSettings.showCdf;
      }
      if(typeof state.scheduleDraw === 'function'){
        state.scheduleDraw();
      }
      console.debug('Debug: hist payload applied', { source, rows: dataMatrix.length });
      return true;
    }
    hist.getPayload = getPayload;
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
      const apply = payload => applyHistPayload(payload, { source: 'file' });
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
    hist.loadFromPayload = function loadFromPayload(payload){
      if(!applyHistPayload(payload, { source: 'payload' })){
        console.warn('hist payload application failed', { source: 'payload' });
      }
    };
    // Wire buttons
    document.getElementById('openHistGraph')?.addEventListener('click', hist.open);
    document.getElementById('saveHistGraph')?.addEventListener('click', hist.save);
    document.getElementById('saveAsHist').addEventListener('click', hist.saveAs);
    document.getElementById('histGraphFile').addEventListener('change',e=>{const f=e.target.files[0]; if(f){ state.fileName=f.name; state.fileHandle=null; hist.loadFromFile(f); }});
  }

  // Compute and render histogram summary statistics
  function formatNumber(value, decimals){
    const num = Number(value);
    if(!Number.isFinite(num)){
      return '—';
    }
    const places = Number.isFinite(decimals) ? decimals : 4;
    return num.toFixed(places);
  }

  function formatPValue(value){
    const num = Number(value);
    if(!Number.isFinite(num)){
      return '\u2014';
    }
    if(typeof Shared?.formatPValue === 'function'){
      return Shared.formatPValue(num);
    }
    return num <= 0 ? '0' : num.toExponential(5);
  }

  function draw(){
    // Reuse existing global draw implementation if present? Implement local logic mirroring legacy drawHistogram
    const histFill=$('#histFill'), histBorder=$('#histBorder'), histBorderWidth=$('#histBorderWidth'), histBins=$('#histBins'), histShowGrid=$('#histShowGrid'), histShowFrame=$('#histShowFrame'), histLogY=$('#histLogY'), histFontSize=$('#histFontSize');
    ensureAxisSettings();
    const data=state.hot.getDataAtCol(0);
    const labelRaw=data[0];
    state.xLabelText=(labelRaw&&String(labelRaw).trim())||'Value';
    const values=[]; for(let i=1;i<data.length;i++){const v=parseFloat(data[i]); if(!isNaN(v)) values.push(v);}
    const plotEl=document.getElementById('histPlot'); while(plotEl.firstChild) plotEl.removeChild(plotEl.firstChild);
    if(!values.length){ plotEl.innerHTML='<i>No data</i>'; updateHistStats(values, []); return; }
    const distributionFits = prepareDistributionFits(values);
    const includePdf = !!state.distributionSettings.showPdf;
    const includeCdf = !!state.distributionSettings.showCdf;
    const statsHelpers = Shared.stats || {};
    const alpha = Number(state.distributionSettings.alpha) > 0 ? Number(state.distributionSettings.alpha) : 0.05;
    const rawXMin = Math.min(...values);
    const rawXMax = Math.max(...values);
    let xMin = rawXMin;
    let xMax = rawXMax;
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
    const W=Math.max(50,Math.floor(plotEl.clientWidth||50));
    const H=Math.max(40,Math.floor(plotEl.clientHeight||40));
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
    function formatTick(v){return v.toLocaleString('en-US',{maximumFractionDigits:2,useGrouping:false});}
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
    const axisStrokeWidth=chartStyle.scaleStrokeWidth(axisStrokeWidthBase, styleScaleInfo, { context: 'hist-axis', min: 0.25 });
    const axisStroke = getAxisColor();
    const borderWidthRaw=Number(histBorderWidth.value)||0;
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
    const axisMetrics=chartStyle.createAxisMetrics(fs);
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
          plotPixels: W
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
      if(Number.isFinite(manualIntervalY) && manualIntervalY > 0){
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
      xTickLabels=xScale.ticks.map(t=>formatTick(t));
      yTickLabels=yScale.ticks.map(t=>formatTick(logY?Math.pow(10,t):t));
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
          add('line',{x1:margin.left,y1:y,x2:margin.left+plotW,y2:y,stroke:'#ddd','stroke-width':axisStrokeWidth});
        });
        console.debug('Debug: hist grid stroke scaled',{horizontal:yScale.ticks.length,axisStrokeWidth});
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
        onThicknessChange: value => updateAxisStrokeWidth(value),
        onColorChange: value => updateAxisColor(value)
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
      xScale.ticks.forEach((t,i)=>{
        const x=x2px(t);
        add('line',{x1:x,y1:margin.top+plotH,x2:x,y2:margin.top+plotH+tickLen,stroke:axisStroke,'stroke-width':axisStrokeWidth});
        const txt=add('text',{x,y:margin.top+plotH+tickLen+tickGap,'font-size':fs,'text-anchor':'middle','dominant-baseline':'hanging',fill:chartStyle.TEXT_COLOR});
        txt.textContent=formatTick(t);
        markFontEditable(txt,'xTick');
        xTickFontCount+=1;
        xTickNodes.push(txt);
      });
    chartStyle.applyLabelOrientation(xTickNodes,{angle:-45,anchor:'end',dy:'0.35em',force:bottomLayout.shouldRotate});
      let yTickFontCount=0;
      yScale.ticks.forEach((t,i)=>{
        const y=y2px(t);
        add('line',{x1:margin.left-tickLen,y1:y,x2:margin.left,y2:y,stroke:axisStroke,'stroke-width':axisStrokeWidth});
        const txt=add('text',{x:margin.left-(tickLen+tickGap),y,'font-size':fs,'text-anchor':'end','dominant-baseline':'middle',fill:chartStyle.TEXT_COLOR});
        txt.textContent=formatTick(logY?Math.pow(10,t):t);
        markFontEditable(txt,'yTick');
        yTickFontCount+=1;
      });
    console.debug('Debug: hist font tick binding',{ xTickFontCount, yTickFontCount }); // Debug: tick font binding counts
    console.debug('Debug: hist ticks stroke scaled',{xTickCount:xScale.ticks.length,yTickCount:yScale.ticks.length,axisStrokeWidth});
    const edges=Array.from({length:bins+1},(_,i)=>xScale.min+i*binWidth);
    const fill=histFill.value; const borderColor=histBorder.value;
    counts.forEach((c,i)=>{ const xStart=x2px(edges[i]); const xEnd=x2px(edges[i+1]); const barW=Math.max(0,xEnd-xStart); const val=logY?Math.log10(Math.max(c,yMin)):c; const y=y2px(val); const h=margin.top+plotH-y; const rect=add('rect',{x:xStart,y,width:barW,height:h,fill:fill}); if(borderWidthPx>0){rect.setAttribute('stroke',borderColor); rect.setAttribute('stroke-width',borderWidthPx);} });
    if(distributionFits.length && (includePdf || includeCdf)){
      const overlayGroup = add('g',{ 'class':'hist-overlay-group' });
      const sampleCount = values.length;
      const effectiveBinWidth = binWidth || ((xScale.max - xScale.min) || 1);
      const sampleSteps = Math.min(240, Math.max(32, Math.round(plotW)));
      const yLowerBound = Math.max(0, yMin);
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
        const strokeWidth = Math.max(axisStrokeWidth * 0.9, axisStrokeWidth / 2, 1);
        if(includePdf && typeof fit.pdf === 'function' && effectiveBinWidth > 0){
          const parts=[];
          for(let step=0;step<sampleSteps;step++){
            const t=sampleSteps===1?0:step/(sampleSteps-1);
            const x=xScale.min+(xScale.max-xScale.min)*t;
            const density=fit.pdf(x);
            if(!Number.isFinite(density) || density<0){ continue; }
            const expected=density*sampleCount*effectiveBinWidth;
            const yDomain=toDomainY(expected);
            parts.push(`${step===0?'M':'L'} ${x2px(x)} ${y2px(yDomain)}`);
          }
          if(parts.length>1){
            add('path',{
              d:parts.join(' '),
              fill:'none',
              stroke:strokeColor,
              'stroke-width':strokeWidth,
              'stroke-linejoin':'round',
              'stroke-linecap':'round',
              'pointer-events':'none',
              'data-dist':fit.key || fit.label,
              'class':'hist-overlay hist-overlay--pdf'
            });
          }
        }
        if(includeCdf && typeof fit.cdf === 'function'){
          const parts=[];
          for(let step=0;step<sampleSteps;step++){
            const t=sampleSteps===1?0:step/(sampleSteps-1);
            const x=xScale.min+(xScale.max-xScale.min)*t;
            const cumulative=clampUnit(fit.cdf(x));
            const expected=cumulative*sampleCount;
            const yDomain=toDomainY(expected);
            parts.push(`${step===0?'M':'L'} ${x2px(x)} ${y2px(yDomain)}`);
          }
          if(parts.length>1){
            add('path',{
              d:parts.join(' '),
              fill:'none',
              stroke:strokeColor,
              'stroke-width':strokeWidth,
              'stroke-dasharray':'6 3',
              'stroke-linejoin':'round',
              'stroke-linecap':'round',
              'pointer-events':'none',
              'data-dist':fit.key || fit.label,
              'class':'hist-overlay hist-overlay--cdf'
            });
          }
        }
      });
      if(!overlayGroup.hasChildNodes()){
        svg.removeChild(overlayGroup);
      }
    }
    const xAxisBase=margin.top+plotH;
    const xText=add('text',{x:margin.left+plotW/2,y:xAxisBase+bottomLayout.titleOffset,'text-anchor':'middle','font-size':fs,fill:chartStyle.TEXT_COLOR});
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
        const previous=state.xLabelText!=null?String(state.xLabelText):'';
        const nextValue=txt!=null?String(txt):'';
        if(previous===nextValue){
          return;
        }
        applyHistXLabel(nextValue);
        recordHistChange('hist:x-label',previous,nextValue,applyHistXLabel);
      });
    }
    const yX=margin.left-(maxYLabelWidth+tickLen+tickGap+axisMetrics.axisTitleGap+fs*0.5);
    const yText=add('text',{x:yX,y:margin.top+plotH/2,'dominant-baseline':'middle',transform:`rotate(-90 ${yX} ${margin.top+plotH/2})`,'text-anchor':'middle','font-size':fs,fill:chartStyle.TEXT_COLOR});
    yText.textContent=state.yLabelText;
    markFontEditable(yText,'yTitle','yTitle');
    const applyHistYLabel=value=>{
      const nextValue=value!=null?String(value):'';
      state.yLabelText=nextValue;
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
    const titleText=add('text',{x:margin.left+plotW/2,y:margin.top/2,'text-anchor':'middle','font-size':fs,fill:chartStyle.TEXT_COLOR});
    titleText.textContent=state.titleText;
    markFontEditable(titleText,'graphTitle','graphTitle');
    const applyHistTitle=value=>{
      const nextValue=value!=null?String(value):'';
      state.titleText=nextValue;
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
    ensureGraphViewport(svg, { padding: Math.max(fs, 14), debugLabel: 'hist-graph' });
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
      onMinSvgWidth: value => {
        state.minSvgWidth = Math.max(0, Number(value) || 0);
        console.debug('Debug: hist layout min width update', { value: state.minSvgWidth });
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
        state.scheduleDraw?.({ force: true, reason: 'manual-render' });
      });
    }
    initHot();
    initControls();
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
    scheduleDrawHistRaw = Shared.debounceFrame ? Shared.debounceFrame(draw) : draw;
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
      state.ensureHotForActiveTab();
    }
  };

})(window);


