// Pie/Proportion Graph component module
// Exposes: window.Components.pie = { init(root), draw(), save(), open(), loadFromFile(file) }
(function(global){
  'use strict';
  const NS='http://www.w3.org/2000/svg';
  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};
  const pie = Components.pie = Components.pie || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  const fontControls = Shared.fontControls = Shared.fontControls || {};
  const notesHelper = Shared.notes = Shared.notes || {};
  if(typeof notesHelper.mountFoldable !== 'function' && typeof require === 'function'){
    try{
      require('../shared/notes.js');
    }catch(err){
      console.debug('Debug: pie component notes helper require failed', { message: err?.message || String(err) });
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
    console.debug('Debug: pie component awaiting Shared.fileIO helpers');
  }
  if(!Shared.tableImport || typeof Shared.tableImport.openFile !== 'function'){
    console.debug('Debug: pie component awaiting Shared.tableImport helpers'); // Debug: table import helper check
  }

  const ensureGraphViewport = Shared.graphViewport?.createEnsurer
    ? Shared.graphViewport.createEnsurer('pie')
    : (svg, options = {}) => {
      const fn = Shared.ensureGraphViewport || Shared.autoResizeSvg || global.ensureGraphViewport || global.autoResizeSvg;
      if(typeof fn === 'function'){
        fn(svg, { component: 'pie', debugLabel: 'pie-viewport-fallback', ...options });
        return;
      }
      console.debug('Debug: pie ensureGraphViewport helper missing', {
        hasShared: !!Shared,
        hasAutoResize: typeof Shared?.autoResizeSvg === 'function'
      });
    };
  console.debug('Debug: pie graph viewport helper configured', {
    hasGraphViewport: typeof Shared.graphViewport?.ensure === 'function',
    usesFactory: typeof Shared.graphViewport?.createEnsurer === 'function'
  });

  const PIE_DEFAULT_ROWS = 100;
  const PIE_DEFAULT_COLS = 6;
  let emptyPayloadTemplate = null;

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
    if(emptyPayloadTemplate || typeof getPayload !== 'function'){
      return;
    }
    const snapshot = getPayload();
    if(snapshot){
      emptyPayloadTemplate = cloneSimple(snapshot);
    }
  }
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
          console.debug('Debug: pie select auto-size watcher attached', {
            id: select.id || null,
            label: contextLabel
          });
        }
      }else if(autoSizer){
        autoSizer(select);
        if(debugEnabled){
          console.debug('Debug: pie select auto-size applied without watcher', {
            id: select.id || null,
            label: contextLabel
          });
        }
      }else if(debugEnabled){
        console.debug('Debug: pie select auto-size helper unavailable', {
          id: select.id || null,
          label: contextLabel
        });
      }
    }catch(err){
      if(debugEnabled){
        console.debug('Debug: pie select auto-size attach error', {
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
    console.debug('Debug: pie axis tick interval updated',{ axis, tickInterval: settings[axis].tickInterval });
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
    console.debug('Debug: pie minor ticks updated',{ axis, enabled: nextValue });
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
    console.debug('Debug: pie minor tick subdivisions updated',{ axis, subdivisions: nextValue });
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
    console.debug('Debug: pie axis stroke width updated',{ strokeWidth: settings.strokeWidth });
    state.scheduleDraw?.();
  }

  function getAxisColor(){
    return ensureAxisSettings().color || DEFAULT_AXIS_COLOR;
  }

  function updateAxisColor(value){
    const settings = ensureAxisSettings();
    settings.color = typeof value === 'string' && value.trim() ? value : DEFAULT_AXIS_COLOR;
    console.debug('Debug: pie axis color updated',{ color: settings.color });
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
    console.debug('Debug: pie axis settings applied',{ settings: state.axisSettings });
  }

  let state = {
    hot: null,
    scheduleDraw: null,
    fileHandle: null,
    fileName: 'pie.graph',
    titleText: 'Proportion graph',
    legendWidth: 120,
    colors: {},
    svgBox: null,
    layout: null,
    minSvgWidth: 0,
    legendGuardWidth: 0,
    axisSettings: createDefaultAxisSettings(),
    labelPositions: { title: null, legend: null }
  };
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
        console.debug('Debug: pie legend color input', { label: labelKey, color: value });
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
    if(typeof Shared.enableLegendDrag === 'function'){
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
            console.debug('Debug: pie legend position saved', { absolute: pos, relative: { relX, relY } });
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

  function resolvePieLegendGuardCap(){
    const svgBox = state.svgBox || state.layout?.elements?.svgBox || null;
    const datasetMin = Number(svgBox?.dataset?.resizerMinWidth);
    if(Number.isFinite(datasetMin) && datasetMin > 0){
      return datasetMin;
    }
    return null;
  }

  function applyPieLegendGuardWidth(requiredWidth){
    const normalized = Number.isFinite(requiredWidth) ? Math.max(0, Math.round(requiredWidth)) : 0;
    const cap = resolvePieLegendGuardCap();
    const effectiveWidth = Number.isFinite(cap) && cap > 0
      ? Math.max(normalized, cap)
      : normalized;
    if(effectiveWidth === state.legendGuardWidth){
      return;
    }
    state.legendGuardWidth = effectiveWidth;
    state.minSvgWidth = effectiveWidth;
    try{
      state.layout?.updateMinSvgWidth?.(effectiveWidth);
      state.layout?.syncPanels?.({ skipSchedule: true, reason: 'pie-legend-guard' });
    }catch(err){
      console.error('pie legend guard update error', err);
    }
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug('Debug: pie legend guard width applied', {
        requestedWidth: normalized,
        appliedWidth: effectiveWidth,
        cap
      });
    }
  }

  // Return a default color palette for slices
  // Prefer globally defined palettes if available; fallback to local palette
  function getDefaultPalette(){
    try{
      const palFromGlobal = (global && Array.isArray(global.DEFAULT_SCATTER_COLORS)) ? global.DEFAULT_SCATTER_COLORS : undefined;
      // Some sections define DEFAULT_SCATTER_COLORS as a global lexical binding
      // eslint-disable-next-line no-undef
      const palFromLexical = (typeof DEFAULT_SCATTER_COLORS !== 'undefined' && Array.isArray(DEFAULT_SCATTER_COLORS)) ? DEFAULT_SCATTER_COLORS : undefined;
      const palette = palFromGlobal || palFromLexical || ['#e41a1c','#377eb8','#4daf4a','#984ea3','#ff7f00','#ffff33','#a65628','#f781bf','#999999'];
      return palette;
    }catch(_e){
      return ['#e41a1c','#377eb8','#4daf4a','#984ea3','#ff7f00','#ffff33','#a65628','#f781bf','#999999'];
    }
  }

  const markFontEditable = (node, role, key) => {
    if (!node) { return; }
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
      console.debug('Debug: pie markFontEditable', payload); // Debug: font target tagging summary
    }
  };

  function initHot(){
    console.debug('Debug: pie initHot using shared factory', { hasFactory: typeof Shared.hot?.createStandardTable === 'function' });
    if(typeof Shared.hot?.createStandardTable !== 'function'){
      console.error('pie initHot missing Shared.hot.createStandardTable');
      return;
    }
    const data = Shared.createEmptyData(PIE_DEFAULT_ROWS, PIE_DEFAULT_COLS);
    let pieScheduleProxyCount = 0;
    const schedulePieDrawProxy = () => {
      pieScheduleProxyCount += 1;
      if(pieScheduleProxyCount <= 5){
        console.debug('Debug: pie scheduleDraw proxy invoked', { count: pieScheduleProxyCount }); // Debug: table change trigger
        if(pieScheduleProxyCount === 5){
          console.debug('Debug: pie scheduleDraw proxy suppressing further logs'); // Debug: proxy log suppression notice
        }
      }
      const statsTarget = document.getElementById('pieStatsResults');
      if(statsTarget){
        statsTarget.innerHTML = '<div class="stats-table-message">Statistics will appear after rendering.</div>';
      }
      if(typeof state.scheduleDraw === 'function'){
        state.scheduleDraw();
      }
    };

    const createPieTable = (container) => Shared.hot.createStandardTable(container, { rows: PIE_DEFAULT_ROWS, cols: PIE_DEFAULT_COLS }, schedulePieDrawProxy, {
      debugLabel: 'pie',
      data,
      firstRowClassName: 'htCenter',
      pinFirstRow: true,
      scheduleOnLoadData: true,
      hotOptions: {
        stretchH: 'all',
        minSpareRows: 10,
        afterChange(changes, source){
          if(changes){
            console.log('pie afterChange', { count: changes.length, source });
          }
        },
        afterUndo(){
          console.log('pie undo');
        },
        afterRedo(){
          console.log('pie redo');
        }
      }
    });
    const ensurePieHotForActiveTab = () => {
      const wrapper = document.getElementById('pieHotWrapper');
      const baseContainer = document.getElementById('pieHot');
      if(typeof Shared.hot?.ensureTableForTab !== 'function' || !wrapper || !baseContainer){
        if(!state.hot){
          state.hot = createPieTable(baseContainer);
        }
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
      return state.hot;
    };
    state.hot = ensurePieHotForActiveTab();
    state.ensureHotForActiveTab = ensurePieHotForActiveTab;
  }

  function initControls(){
    const pieShowPercents=$('#pieShowPercents');
    const pieStartAngle=$('#pieStartAngle');
    const pieFontSize=$('#pieFontSize');
    const pieFontSizeVal=$('#pieFontSizeVal');
    const pieChartType=$('#pieChartType');
    const valueColumn=$('#pieValueColumn');
    const expectedColumn=$('#pieExpectedColumn');
    const pieShowLegendInput=document.getElementById('pieShowLegend');
    const pieBorderColor=document.getElementById('pieBorderColor');
    const pieBorderWidth=document.getElementById('pieBorderWidth');
    const pieAutoSizeTargets=[pieChartType,valueColumn,expectedColumn];
    pieAutoSizeTargets.filter(Boolean).forEach(select=>{
      attachPieSelectAutoSize(select, 'pie');
    });
    if(pieFontSize?.dataset){
      pieFontSize.dataset.fontBasePt = String(pieFontSize.value);
      console.debug('Debug: pie font size base initialized',{ value: pieFontSize.value }); // Debug: initial base size
    }
    chartStyle.renderFontSizeLabel({ element: pieFontSizeVal, pt: Number(pieFontSize.value), input: pieFontSize, manual: true });
    ;[pieShowPercents,pieStartAngle,pieFontSize,pieChartType].forEach(el=>el.addEventListener('input',()=>{ console.log('pie config changed',el.id,el.value); if(el===pieFontSize){
        if(pieFontSize.dataset){
          pieFontSize.dataset.fontBasePt = String(pieFontSize.value);
          console.debug('Debug: pie font size input manual set',{ value: pieFontSize.value }); // Debug: manual slider update
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
        console.debug('Debug: pie showLegend change',{checked:pieShowLegendInput.checked});
        ensurePieLegendControlPlacement();
        state.scheduleDraw();
      });
    }
    pieShowFrame.addEventListener('change',()=>{console.debug('Debug: pie showFrame change',{checked:pieShowFrame.checked}); state.scheduleDraw();});
    if(pieBorderColor){
      pieBorderColor.addEventListener('input',()=>{ console.debug('Debug: pie border color change',{value: pieBorderColor.value}); state.scheduleDraw(); });
    }
    if(pieBorderWidth){
      pieBorderWidth.addEventListener('input',()=>{ console.debug('Debug: pie border width change',{value: pieBorderWidth.value}); state.scheduleDraw(); });
    }
    valueColumn.addEventListener('change',()=>{console.log('pie value column changed',valueColumn.value); state.scheduleDraw();});
    expectedColumn.addEventListener('change',()=>{console.log('pie expected column changed',expectedColumn.value); state.scheduleDraw();});

    const example=[ ['Quarter','Observed','Expected'], ['Q1',120,100], ['Q2',90,100], ['Q3',60,80], ['Q4',130,120] ];
    document.getElementById('pieLoadExample').addEventListener('click',()=>{
      state.hot.loadData(example, {
        source: 'example-load',
        recordUndo: true,
        undoLabel: 'table:pie:example-load'
      });
      console.log('pie example loaded with expected values');
      state.scheduleDraw();
    });
    const pieImportBtn=document.getElementById('pieImport');
    const pieFileInput=document.getElementById('pieFile');
    pieImportBtn.addEventListener('click',()=>{ pieFileInput.value=''; pieFileInput.click(); });
    pieFileInput.addEventListener('change',async ()=>{
      const tableImport = Shared.tableImport;
      if(!tableImport || typeof tableImport.openFile !== 'function'){
        console.warn('pie import skipped: Shared.tableImport.openFile unavailable');
        return;
      }
      const fileName = pieFileInput.files?.[0]?.name || '';
      console.debug('Debug: pie import start',{fileName}); // Debug: import start trace
      try{
        const result = await tableImport.openFile(pieFileInput,{
          hot: state.hot,
          minCols: PIE_DEFAULT_COLS,
          minRows: PIE_DEFAULT_ROWS,
          scheduleDraw: state.scheduleDraw,
          debugLabel: 'pie',
          onProcessed: info => {
            console.debug('Debug: pie tableImport processed', info || {}); // Debug: processed callback
          }
        });
        console.debug('Debug: pie import finished',{rows: result?.rows || 0, cols: result?.cols || 0}); // Debug: import finish trace
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
      console.debug('Debug: pie export controls mounted', { hasExporter: true }); // Debug: pie export mount
    } else {
      console.debug('Debug: pie export controls unavailable', { hasExporter: !!Shared.exporter }); // Debug: pie export fallback
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
      const payload = {
        type:'pie',
        data: state.hot.getData(),
        exclusions: state.hot?.exportExclusions?.() || Shared.hot.exportExclusions(state.hot),
        config: collectConfig()
      };
      payload.config = payload.config || {};
      payload.config.notes = {
        text: notesText,
        open: notesOpen
      };
      console.debug('Debug: pie.getPayload captured state', {
        rows: payload.data?.length || 0,
        cols: payload.data?.[0]?.length || 0,
        chartType: payload.config?.chartType
      });
      return payload;
    }
    pie.getPayload = getPayload;
    pie.captureEmptyPayloadTemplate = function capturePieEmptyPayloadTemplate(){
    ensureEmptyPayloadTemplate();
    const snapshot = cloneSimple(emptyPayloadTemplate);
    console.debug('Debug: pie empty payload template captured', { hasTemplate: !!snapshot });
    return snapshot;
  };
  pie.restoreEmptyPayloadTemplate = function restorePieEmptyPayloadTemplate(template, options = {}){
    if(!template || typeof template !== 'object'){
      console.debug('Debug: pie empty payload template restore skipped', { reason: 'invalid-template', options });
      return false;
    }
    emptyPayloadTemplate = cloneSimple(template);
    console.debug('Debug: pie empty payload template restored', { hasTemplate: !!emptyPayloadTemplate, reason: options.reason || 'unspecified' });
    return !!emptyPayloadTemplate;
  };
  pie.createEmptyPayload = function createEmptyPiePayload(){
      pie.ensure();
      ensureEmptyPayloadTemplate();
      const payload = cloneSimple(emptyPayloadTemplate) || { type: 'pie', config: {} };
      payload.type = 'pie';
      const createEmpty = Shared.createEmptyData;
      const emptyData = typeof createEmpty === 'function'
        ? createEmpty(PIE_DEFAULT_ROWS, PIE_DEFAULT_COLS)
        : Array.from({ length: PIE_DEFAULT_ROWS }, () => Array(PIE_DEFAULT_COLS).fill(''));
      payload.data = emptyData;
      payload.exclusions = [];
      return payload;
    };
    function applyPiePayload(payload, meta){
      const source = meta?.source || 'unknown';
      if(!payload || payload.type !== 'pie'){
        console.warn('pie payload rejected', { source, hasType: !!payload?.type });
        return false;
      }
      const skipDraw = meta?.skipDraw === true;
      let scheduleBackup = null;
      if(skipDraw && typeof state.scheduleDraw === 'function'){
        scheduleBackup = state.scheduleDraw;
        state.scheduleDraw = () => {};
      }
      const dataMatrix = Array.isArray(payload.data) ? payload.data : [];
      if(state.hot && typeof state.hot.loadData === 'function'){
        state.hot.loadData(dataMatrix);
        if(payload.exclusions && typeof state.hot.applyExclusions === 'function'){
          state.hot.applyExclusions(payload.exclusions);
        }
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
      state.titleText = config.title || state.titleText;
      const chartTypeInput = document.getElementById('pieChartType');
      if(chartTypeInput){ chartTypeInput.value = config.chartType || chartTypeInput.value; }
      const showPercentsInput = document.getElementById('pieShowPercents');
      if(showPercentsInput){ showPercentsInput.checked = !!config.showPercents; }
      const showFrameInput = document.getElementById('pieShowFrame');
      if(showFrameInput){ showFrameInput.checked = !!config.showFrame; }
      const borderColorInput = document.getElementById('pieBorderColor');
      if(borderColorInput){ borderColorInput.value = config.borderColor || borderColorInput.value || '#ffffff'; }
      const borderWidthInput = document.getElementById('pieBorderWidth');
      if(borderWidthInput){ borderWidthInput.value = config.borderWidth != null ? config.borderWidth : (borderWidthInput.value || 0); }
      if(pieShowLegendInput){
        pieShowLegendInput.checked = config.showLegend !== false;
        ensurePieLegendControlPlacement();
      }
      const startAngleInput = document.getElementById('pieStartAngle');
      if(startAngleInput){ startAngleInput.value = config.startAngle || startAngleInput.value; }
      const pieFontInput = document.getElementById('pieFontSize');
      const pieFontSizeVal = document.getElementById('pieFontSizeVal');
      if(pieFontInput){
        pieFontInput.value = config.fontSize || pieFontInput.value;
        if(pieFontInput.dataset){
          pieFontInput.dataset.fontBasePt = String(pieFontInput.value);
          console.debug('Debug: pie font size base restored',{ value: pieFontInput.value });
        }
        chartStyle.renderFontSizeLabel({ element: pieFontSizeVal, pt: Number(pieFontInput.value), input: pieFontInput, manual: true });
      }
      const valueColumnInput = document.getElementById('pieValueColumn');
      if(valueColumnInput){ valueColumnInput.value = config.valueColumn || valueColumnInput.value; }
      const expectedColumnInput = document.getElementById('pieExpectedColumn');
      if(expectedColumnInput){ expectedColumnInput.value = config.expectedColumn || expectedColumnInput.value; }
      state.colors = config.colors || state.colors;
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
      console.debug('Debug: pie payload applied', { source, rows: dataMatrix.length });
      return true;
    }
    function collectConfig(){
      const axisSettings = ensureAxisSettings();
      const borderWidthVal = Number($('#pieBorderWidth')?.value);
      return {
        title: state.titleText,
        chartType: $('#pieChartType').value,
        showPercents: $('#pieShowPercents').checked,
        showFrame: $('#pieShowFrame').checked,
        showLegend: pieShowLegendInput ? !!pieShowLegendInput.checked : true,
        startAngle: $('#pieStartAngle').value,
        borderColor: ($('#pieBorderColor')?.value || '#ffffff'),
        borderWidth: Number.isFinite(borderWidthVal) ? borderWidthVal : 0,
        fontSize: $('#pieFontSize').value,
        fontStyles: (exportFontStyles('pie') || undefined),
        valueColumn: $('#pieValueColumn').value,
        expectedColumn: $('#pieExpectedColumn').value,
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
      console.debug('Debug: pie.save invoked', { hasHandle: !!state.fileHandle });
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
      console.debug('Debug: pie.save result', result);
    };
    pie.saveAs = async function(){
      console.debug('Debug: pie.saveAs invoked', { currentName: state.fileName });
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
      console.debug('Debug: pie.saveAs result', result);
    };
    pie.open = async function(){
      console.debug('Debug: pie.open invoked');
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
          const input = document.getElementById('pieGraphFile');
          if(input){
            input.value='';
            input.click();
          }
        }
      });
      console.debug('Debug: pie.open result', result);
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
    document.getElementById('openPieGraph')?.addEventListener('click',pie.open);
    document.getElementById('savePieGraph')?.addEventListener('click',pie.save);
    document.getElementById('saveAsPie').addEventListener('click',pie.saveAs);
    document.getElementById('pieGraphFile').addEventListener('change',e=>{const f=e.target.files[0]; if(f){ state.fileName=f.name; state.fileHandle=null; pie.loadFromFile(f); }});
  }

  function ensurePieColors(labels){
    const palette = getDefaultPalette();
    const labelSet = new Set(labels);
    console.debug('Debug: pie color palette in use', { palette }); // Debug: palette source and values
    labels.forEach((lab,i)=>{
      if(!state.colors[lab]){
        state.colors[lab]= palette[i % palette.length];
        console.debug('Debug: pie default color applied',{label:lab,color:state.colors[lab]});
      }
    });
    Object.keys(state.colors).forEach(existing=>{
      if(!labelSet.has(existing)){
        console.debug('Debug: pie color pruned',{label:existing});
        delete state.colors[existing];
      }
    });
    console.log('ensurePieColors sync',state.colors); // Debug: resulting color map
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
      const out=document.getElementById('pieStatsResults');
      if(!out){ console.warn('Debug: pieStatsResults element not found'); return; }
      console.debug('Debug: updatePieStats start',{labelCount:labels.length,observedCount:observed.length,expectedCount:expected.length});
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
      console.debug('Debug: updatePieStats result',{chi2,df,p});
    }catch(err){ console.error('updatePieStats error',err); }
  }

  function updatePieColumns(header){
    const valueColumn=$('#pieValueColumn'); const expectedColumn=$('#pieExpectedColumn');
    const prevVal=valueColumn.value; const prevExp=expectedColumn.value; valueColumn.innerHTML=''; expectedColumn.innerHTML='';
    console.log('updatePieColumns prev',{prevVal,prevExp});
    for(let c=1;c<header.length;c++){ const txt=header[c]||`Column ${c+1}`; const optVal=document.createElement('option'); optVal.value=String(c); optVal.textContent=txt; if(optVal.value===prevVal) optVal.selected=true; valueColumn.appendChild(optVal); const optExp=document.createElement('option'); optExp.value=String(c); optExp.textContent=txt; if(optExp.value===prevExp) optExp.selected=true; expectedColumn.appendChild(optExp); }
    if(!prevVal && header.length>1) valueColumn.value='1';
    if(!prevExp){ const expIdx=header.findIndex((h,i)=>i>0 && String(h).trim().toLowerCase()==='expected'); if(expIdx>0) expectedColumn.value=String(expIdx); else if(header.length>2) expectedColumn.value='2'; }
    if(typeof formControls.autoSizeSelect === 'function'){
      formControls.autoSizeSelect(valueColumn);
      formControls.autoSizeSelect(expectedColumn);
    }
    console.log('updatePieColumns',{val:valueColumn.value,exp:expectedColumn.value});
  }

  function draw(){
    const plotEl=document.getElementById('piePlot'); while(plotEl.firstChild) plotEl.removeChild(plotEl.firstChild);
    const type=$('#pieChartType').value;
    const containerRect=state.svgBox?.getBoundingClientRect?.();
    const pieFontInput=$('#pieFontSize');
    const fontInfo=chartStyle.resolveScaledFontSize({
      rawSize: pieFontInput.value,
      width: containerRect?.width,
      height: containerRect?.height,
      svgBox: state.svgBox,
      input: pieFontInput
    });
    const fs=fontInfo.scaledPx;
    chartStyle.renderFontSizeLabel({ element: pieFontSizeVal, fontInfo, input: pieFontInput });
    console.debug('Debug: pie font scaling applied',{
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
    console.debug('Debug: pie axis metrics',axisMetrics);
    const fontScale=styleScaleInfo?.styleScale || styleScaleInfo?.scale || 1;
    const borderColor = $('#pieBorderColor')?.value || '#ffffff';
    const borderWidthBase = Number.parseFloat($('#pieBorderWidth')?.value) || 0;
    const borderWidth = chartStyle.scaleStrokeWidth(borderWidthBase, styleScaleInfo, { context: 'pie-border', min: 0 });
    console.debug('Debug: pie border settings',{ borderColor, borderWidthBase, borderWidth });
    const showPerc=$('#pieShowPercents').checked;
    const showFrame=$('#pieShowFrame').checked;
    console.debug('Debug: pie showFrame state',{showFrame, chartType:type});
    ensurePieLegendControlPlacement();
    const showLegendInput=document.getElementById('pieShowLegend');
    const showLegend=showLegendInput ? !!showLegendInput.checked : true;
    console.debug('Debug: pie showLegend state',{showLegend, chartType:type});
    const startDeg=parseFloat($('#pieStartAngle').value)||0;
    const data=state.hot.getData();
    updatePieColumns(data[0]||[]);


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
        return;
      }
      ensurePieColors(segmentLabels);
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
      applyPieLegendGuardWidth(stackedLegendVisible ? stackedLegendLayout.minSvgWidth : 0);
      state.legendWidth = stackedLegendVisible ? Math.ceil(stackedLegendLayout.renderer.width) : 0;
      const stackedLegendMargin = stackedLegendVisible ? Math.max(stackedLegendLayout.legendGapPx, Math.round(8 * fontScale)) : 0;
      const stackedLegendGap = stackedLegendVisible ? stackedLegendLayout.legendGapPx : 0;
      const stackedLegendMarkerSize = stackedLegendVisible ? stackedLegendLayout.renderer.swatchSize : 0;
      console.debug('Debug: pie stacked legend metrics',{
        legendWidth: state.legendWidth,
        legendGap: stackedLegendGap,
        legendMarkerSize: stackedLegendMarkerSize,
        entryCount: stackedLegendLayout.renderer.entries.length,
        legendVisible: stackedLegendVisible
      });
      plotEl.style.display='flex';
      plotEl.style.alignItems='flex-start';
      const svgWidth=Math.max(state.minSvgWidth || 50, Math.floor(plotEl.clientWidth||50));
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
      if(fontControls && typeof fontControls.enableForSvg === 'function'){
        fontControls.enableForSvg(svg,{ scopeId: 'pie' });
        console.debug('Debug: pie fontControls enableForSvg invoked',{ width: svgWidth, height: svgHeight });
      } else {
        console.debug('Debug: pie fontControls enableForSvg missing',{ hasFontControls: !!fontControls });
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
      console.debug('Debug: pie stacked axis stroke',{ axisStrokeWidthBase, axisStrokeWidth, axisStroke, manualIntervalY });
      const yTickLabels=percentTicks.map(v=>`${Number.isInteger(v) ? v : Number(v).toFixed(1)}%`);
      const tickFont=chartStyle.makeFont(fs);
      const yLabelWidths=yTickLabels.map(lbl=>chartStyle.measureText(lbl,tickFont));
      const maxYLabelWidth=Math.max(...yLabelWidths,0);
      const axisLabelFont=chartStyle.makeFont(fs);
      const yTitleText='Percentage';
      const yTitleWidth=chartStyle.measureText(yTitleText,axisLabelFont);
      const stackedLegendWidthForMargin = stackedLegendVisible ? stackedLegendLayout.legendWidthForMargin : 0;
      let margin=chartStyle.computeBaseMargins({fontSize:fs,legendWidth:stackedLegendWidthForMargin,maxYLabelWidth,yTitleWidth,axisMetrics});
      let chartWidth=Math.max(20,svgWidth-margin.left-margin.right);
      let chartHeight=Math.max(20,svgHeight-margin.top-margin.bottom);
      const bottomLayout=chartStyle.computeBottomLayout({labels:barHeaders,fontSize:fs,plotWidth:chartWidth,baseBottom:margin.bottom,axisMetrics});
      margin.bottom=bottomLayout.bottom;
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
        console.debug('Debug: pie frame request',{stroke:axisStroke, showFrame, axisStrokeWidth});
        chartStyle.drawPlotFrame({ svg, margin, plotW: chartWidth, plotH: chartHeight, stroke: axisStroke, strokeWidth: axisStrokeWidth, sides: ['top','right'], group: axis });
      }
      const barGapBase=10;
      const barGap=Math.max(6,Math.round(barGapBase*fontScale));
      const availableWidth=Math.max(0,chartWidth-(barHeaders.length+1)*barGap);
      const barWidth=barHeaders.length?Math.max(0,availableWidth/barHeaders.length):0;
      const xLabels=[];
      console.debug('Debug: pie stacked layout metrics',{svgWidth,svgHeight,chartWidth,chartHeight,barCount:barHeaders.length,barWidth,barGap,fontScale});
      let stackedXTickCount = 0;
      barHeaders.forEach((bh,j)=>{
        let y=margin.top+chartHeight;
        const total=segmentValues.reduce((s,row)=>s+(row[j]||0),0);
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
            txt.setAttribute('font-size',fs);
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
      console.debug('Debug: pie stacked font tick binding',{ stackedXTickCount, stackedYTickCount });
      chartStyle.applyLabelOrientation(xLabels,{angle:-45,anchor:'end',dy:'0.35em',force:bottomLayout.shouldRotate});
      // Legend now rendered inside the SVG so it can be repositioned.
      if(stackedLegendVisible){
        const legendRenderer = stackedLegendLayout.renderer;
        const defaultLegendX = margin.left + chartWidth + stackedLegendLayout.legendGapPx;
        const defaultLegendY = margin.top + (legendRenderer.baselineOffset || 0);
        const legendGroup = drawPieLegend(svg, stackedLegendLayout, { x: defaultLegendX, y: defaultLegendY }, { width: svgWidth, height: svgHeight });
        if(!legendGroup){
          console.debug('Debug: pie legend skipped',{ legendVisible: stackedLegendVisible, segmentCount: segmentLabels.length, reason: 'draw-failed' });
        }
      }else{
        console.debug('Debug: pie legend skipped',{ legendVisible: stackedLegendVisible, segmentCount: segmentLabels.length });
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
      if(global.makeEditable){
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
      if(typeof Shared.enableLabelDrag === 'function'){
        Shared.enableLabelDrag(title, svg, {
          onDragEnd: pos => {
            state.labelPositions.title = { x: pos.x, y: pos.y };
            console.debug('Debug: pie title position saved', pos);
          }
        });
      }
      svg.appendChild(title);
      ensureGraphViewport(svg, { padding: Math.max(fs, 14), debugLabel: 'pie-graph' });
      const vi=(parseInt($('#pieValueColumn').value||'1',10)-1);
      const ei=(parseInt($('#pieExpectedColumn').value||'2',10)-1);
      const observed=segmentValues.map(row=>{ const v=row[vi]; return (typeof v==='number' && isFinite(v))?v:parseFloat(v)||0; });
      const expected=segmentValues.map(row=>{ const v=row[ei]; return (typeof v==='number' && isFinite(v))?v:parseFloat(v); });
      console.debug('Debug: stacked pie stats data',{vi,ei,observed,expected});
      updatePieStats(segmentLabels,observed,expected);
      return;
    }

    const valueColumn=$('#pieValueColumn');
    const expectedColumn=$('#pieExpectedColumn');
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
    const values=[];
    const expected=[];
    const vi=parseInt(valueColumn.value||'1',10);
    const ei=parseInt(expectedColumn.value||'2',10);
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
      const rawV=row[vi];
      const rawE=row[ei];
      const v=parseFloat(rawV);
      const e=parseFloat(rawE);
      values.push(isNaN(v)?0:v);
      expected.push(e);
    }
    const seriesColumns=seriesColumnsRaw.filter(series=>series.values.some(v=>typeof v==='number' && isFinite(v) && v!==0));
    if(!seriesColumns.length || !labels.length){
      if(typeof Shared.renderPlotNotice === 'function'){
        Shared.renderPlotNotice(plotEl, Shared.getEmptyPlotNoticeMessage ? Shared.getEmptyPlotNoticeMessage() : null, { resetAspect: true, show: true });
      }else{
        plotEl.innerHTML='<i>Add data to the input table to generate a plot.</i>';
      }
      return;
    }
    ensurePieColors(labels);
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
    applyPieLegendGuardWidth(radialLegendVisible ? radialLegendLayout.minSvgWidth : 0);
    state.legendWidth = radialLegendVisible ? Math.ceil(radialLegendLayout.renderer.width) : 0;
    const radialLegendMargin = radialLegendVisible ? Math.max(radialLegendLayout.legendGapPx, Math.round(8 * fontScale)) : 0;
    const radialLegendGap = radialLegendVisible ? radialLegendLayout.legendGapPx : 0;
    const radialLegendMarkerSize = radialLegendVisible ? radialLegendLayout.renderer.swatchSize : 0;
    console.debug('Debug: pie radial legend metrics',{
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
    const svgWidth=Math.max(state.minSvgWidth || 50, plotWidth);
    const svgHeight=Math.max(50,plotHeight);
    console.debug('Debug: pie radial layout metrics', {
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
    svgWrapper.style.display='flex';
    svgWrapper.style.alignItems='flex-start';
    svgWrapper.style.justifyContent='center';
    svgWrapper.appendChild(svg);
    plotEl.appendChild(svgWrapper);
    if(fontControls && typeof fontControls.enableForSvg === 'function'){
      fontControls.enableForSvg(svg,{ scopeId: 'pie' });
      console.debug('Debug: pie fontControls enableForSvg invoked',{ width: svgWidth, height: svgHeight });
    } else {
      console.debug('Debug: pie fontControls enableForSvg missing',{ hasFontControls: !!fontControls });
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
    let r=Math.max(10,Math.min(rHoriz,rVert));
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
      const bottomLimit=svgHeight - fs*2; // leave space for viewport padding
      let maxAllowedR=r;
      centers.forEach(center=>{
        if(!center){ return; }
        let localMax=r;
        // Keep circle inside left/right bounds
        localMax=Math.min(localMax, center.cx-leftLimit);
        localMax=Math.min(localMax, rightLimit-center.cx);
        // Keep circle and label inside top/bottom bounds
        localMax=Math.min(localMax, center.cy-topLimit);
        localMax=Math.min(localMax, bottomLimit-center.cy-fs*1.0);
        if(localMax<maxAllowedR){
          maxAllowedR=localMax;
        }
      });
      if(Number.isFinite(maxAllowedR) && maxAllowedR>0){
        r=Math.max(10,Math.min(r,maxAllowedR));
      }
    }
    if(type==='donut'){
      r=r*0.9;
    }
    const effectiveR=r;
    const effectiveInnerR=type==='donut' ? effectiveR*0.6 : 0;
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
        svg.appendChild(path);
        if(showPerc && frac>0){
          const mid=(startAngle+endAngle)/2;
          const tx=cx + (effectiveInnerR>0?(effectiveR+effectiveInnerR)/2:effectiveR*0.65)*Math.cos(mid);
          const ty=cy + (effectiveInnerR>0?(effectiveR+effectiveInnerR)/2:effectiveR*0.65)*Math.sin(mid);
          const txt=document.createElementNS(NS,'text');
          txt.setAttribute('x',tx);
          txt.setAttribute('y',ty);
          txt.setAttribute('text-anchor','middle');
          txt.setAttribute('font-size',fs);
          txt.textContent=(frac*100).toFixed(1)+'%';
          markFontEditable(txt,'annotation',`pie-annotation-${seriesIndex}-${i}`);
          svg.appendChild(txt);
        }
        startAngle=endAngle;
      });
      const seriesLabel=document.createElementNS(NS,'text');
      seriesLabel.setAttribute('x',cx);
      seriesLabel.setAttribute('y',cy + effectiveR + fs*1.0);
      seriesLabel.setAttribute('text-anchor','middle');
      seriesLabel.setAttribute('font-size',Math.max(8,fs*0.9));
      seriesLabel.textContent=series.label;
      markFontEditable(seriesLabel,'seriesLabel',`series-${seriesIndex}`);
      svg.appendChild(seriesLabel);
    });
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
    if(global.makeEditable){
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
    if(typeof Shared.enableLabelDrag === 'function'){
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
          console.debug('Debug: pie title position saved', { absolute: pos, relative: { relX, relY } });
        }
      });
    }
    svg.appendChild(title);
    ensureGraphViewport(svg, { padding: Math.max(fs, 14), debugLabel: 'pie-graph' });
    if(radialLegendVisible){
      const legendRenderer = radialLegendLayout.renderer;
      let defaultLegendX = contentRight + radialLegendLayout.legendGapPx;
      if(!Number.isFinite(defaultLegendX) || defaultLegendX < 0){
        defaultLegendX = 0;
      }
      const defaultLegendY = contentTop;
      const legendGroup = drawPieLegend(svg, radialLegendLayout, { x: defaultLegendX, y: defaultLegendY }, { width: svgWidth, height: svgHeight });
      if(!legendGroup){
        console.debug('Debug: pie legend skipped',{ legendVisible: radialLegendVisible, chartType: type, itemCount: labels.length, reason: 'draw-failed' });
      }
    }else{
      console.debug('Debug: pie legend skipped',{ legendVisible: radialLegendVisible, chartType: type, itemCount: labels.length });
    }
    updatePieStats(labels, values, expected);
  }
  pie.draw = draw;
  function initNotes(){
    const diagramArea = document.querySelector('#pieGraphPanel .diagram-area');
    const graphPanel = document.querySelector('#pieGraphPanel');
    let stack = document.querySelector('#pieGraphPanel .pie-plot-stack');
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
        console.debug('Debug: pie notes mount skipped (missing stack)');
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
    if (pie.ready) { console.debug('Debug: Components.pie.init skipped (already ready)'); return; }
    console.debug('Debug: Components.pie.init');
    // Placeholder to avoid early resizer callbacks failing
    state.scheduleDraw = ()=>{};
    state.layout = Shared.componentLayout?.createStandardPanels({
      componentName: 'pie',
        selectors: {
          tablePanel: '#pieTablePanel',
          graphPanel: '#pieGraphPanel',
          panelResizer: '#piePanelResizer',
          hotWrapper: '#pieHotWrapper',
          hotContainer: '#pieHot',
          svgBox: () => document.querySelector('#pieGraphPanel .svgbox'),
          resizeTarget: () => document.querySelector('#pieGraphPanel .svgbox')
        },
        scheduleDraw: state.scheduleDraw,
        preserveGraphContent: false,
        panelSyncOptions: {
          disableAutoWidthClamp: true,
          lockGraphPanelWidth: false
        },
        onMinSvgWidth: value => {
        state.minSvgWidth = Math.max(0, Number(value) || 0);
        console.debug('Debug: pie layout min width update', { value: state.minSvgWidth });
      }
    });
    state.svgBox = state.layout?.elements?.svgBox || state.svgBox;
    state.layout?.setScheduleDraw?.(state.scheduleDraw);
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
    state.scheduleDraw = Shared.debounceFrame(draw);
    console.debug('Debug: pie scheduleDraw configured via Shared.debounceFrame'); // Debug: scheduler setup
    state.layout?.setScheduleDraw?.(state.scheduleDraw);
    ensureEmptyPayloadTemplate();
    pie.ready = true;
  };

  pie.ensure = function ensure(){ if (!pie.ready) pie.init(); };
  pie.prepareForTab = function prepareForTab(){
    if(!pie.ready){
      pie.init();
      return;
    }
    if(typeof state.ensureHotForActiveTab === 'function'){
      state.ensureHotForActiveTab();
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

  pie.captureRenderCache = function captureRenderCache(){
    const plot = document.getElementById('piePlot');
    const stats = document.getElementById('pieStatsResults');
    const plotCache = detachChildren(plot);
    const statsCache = detachChildren(stats);
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug('Debug: pie render cache captured', {
        plotNodes: plotCache?.count || 0,
        statsNodes: statsCache?.count || 0
      });
    }
    return { plot: plotCache, stats: statsCache };
  };

  pie.restoreRenderCache = function restoreRenderCache(cache){
    if(!cache){ return false; }
    const plot = document.getElementById('piePlot');
    const stats = document.getElementById('pieStatsResults');
    const restoredPlot = restoreChildren(plot, cache.plot);
    const restoredStats = restoreChildren(stats, cache.stats);
    const restored = restoredPlot || restoredStats;
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug('Debug: pie render cache restored', {
        restored,
        plot: restoredPlot,
        stats: restoredStats
      });
    }
    return restored;
  };

  pie.__testHooks = Object.assign({}, pie.__testHooks, {
    computeChiSquare: (observed, expected) => computePieChiSquare(observed, expected),
    updatePieStats: (labels, observed, expected) => updatePieStats(labels, observed, expected)
  });

})(window);
