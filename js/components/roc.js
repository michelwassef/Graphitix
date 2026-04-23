(function(global){
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};
  const roc = Components.roc = Components.roc || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  const fontControls = Shared.fontControls = Shared.fontControls || {};
  const Main = global.Main = global.Main || {};
  const notesHelper = Shared.notes = Shared.notes || {};
  if(typeof notesHelper.mountFoldable !== 'function' && typeof require === 'function'){
    try{
      require('../shared/notes.js');
    }catch(err){
      console.debug('Debug: roc component notes helper require failed', { message: err?.message || String(err) });
    }
  }
  const dataViewsApi = Shared.dataViews = Shared.dataViews || {};
  if(typeof dataViewsApi.createManager !== 'function' && typeof require === 'function'){
    try{
      require('../shared/dataViews.js');
    }catch(err){
      console.debug('Debug: roc component dataViews helper require failed', { message: err?.message || String(err) });
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
  const additionalLineControls = Shared.additionalLineControls = Shared.additionalLineControls || {};
  if((typeof additionalLineControls.show !== 'function' || typeof additionalLineControls.registerAdditionalLineElement !== 'function') && typeof require === 'function'){
    try{
      require('../shared/additionalLineControls.js');
    }catch(err){
      console.debug('Debug: roc component additionalLineControls helper require failed', { message: err?.message || String(err) });
    }
  }

  function sanitizeRocLinePattern(value){
    const patternRaw = String(value || 'solid').toLowerCase();
    return (patternRaw === 'dashed' || patternRaw === 'dotted' || patternRaw === 'solid') ? patternRaw : 'solid';
  }

  function rocPatternToDasharray(pattern){
    const normalized = sanitizeRocLinePattern(pattern);
    if(normalized === 'dashed'){ return '6 3'; }
    if(normalized === 'dotted'){ return '2 3'; }
    return '';
  }

  function inferRocPatternFromElement(el){
    const dash = String(el?.getAttribute?.('stroke-dasharray') || '').trim();
    if(!dash){ return 'solid'; }
    const compact = dash.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    if(compact === '6 3' || compact === '4 4'){ return 'dashed'; }
    return 'dotted';
  }

  function applyRocPatternToElement(el, pattern){
    if(!el || !el.setAttribute){ return; }
    const dash = rocPatternToDasharray(pattern);
    if(dash){
      el.setAttribute('stroke-dasharray', dash);
    }else{
      el.removeAttribute('stroke-dasharray');
    }
  }

  function showRocStrokeFormatControls(target){
    if(target && additionalLineControls && typeof additionalLineControls.show === 'function'){
      let seriesKey = target.getAttribute('data-series') || null;
      const knownSeriesKeys = () => {
        const keys = new Set();
        const addKey = value => {
          const normalized = String(value == null ? '' : value).trim();
          if(normalized){
            keys.add(normalized);
          }
        };
        addKey(seriesKey);
        Object.keys(state.labelColors || {}).forEach(addKey);
        Object.keys(state.labelStrokeWidth || {}).forEach(addKey);
        Object.keys(state.labelOpacity || {}).forEach(addKey);
        Object.keys(state.labelLinePattern || {}).forEach(addKey);
        const doc = global.document;
        const svg = doc ? doc.getElementById('rocSvg') : null;
        if(svg && svg.querySelectorAll){
          svg.querySelectorAll('path[data-series]').forEach(node => addKey(node.getAttribute('data-series')));
        }
        return Array.from(keys);
      };
      const orderedSeriesKeys = () => {
        const keys = knownSeriesKeys();
        if(!seriesKey){
          return keys;
        }
        return [seriesKey].concat(keys.filter(key => key !== seriesKey));
      };
      const scopeOptions = (() => {
        const options = [{ value: 'global', label: 'Global', disabled: false }];
        const keys = orderedSeriesKeys();
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
            label: seriesKey || 'Series',
            datasetLabel: seriesKey || 'Series',
            scopeDataset: seriesKey || '',
            scopeKind: 'series',
            disabled: !seriesKey
          });
        }
        return options;
      })();
      const resolveTargets = scopeValue => {
        const doc = global.document;
        const svg = doc ? doc.getElementById('rocSvg') : null;
        if(!svg){ return target ? [target] : []; }
        if(scopeValue === 'series' && seriesKey){
          return Array.from(svg.querySelectorAll(`path[data-series="${seriesKey.replace(/"/g, '\\"')}"]`));
        }
        return Array.from(svg.querySelectorAll('path[data-series]'));
      };
      additionalLineControls.show({
        scopeId: 'roc',
        target,
        panelTitle: 'Curve',
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
          value: seriesKey ? 'series' : 'global',
          onChange(nextScope, ctx){
            if(nextScope === 'series'){
              const scopedSeriesKey = String(ctx?.scopeDataset || '').trim();
              if(scopedSeriesKey){
                seriesKey = scopedSeriesKey;
              }
            }
          }
        },
        getSummary: ctx => (ctx?.scope === 'series' && seriesKey) ? seriesKey : 'Global',
        getColor: ctx => {
          if(ctx?.scope === 'series' && seriesKey){
            return state.labelColors[seriesKey] || target.getAttribute('stroke') || '#0000ff';
          }
          const keys = Object.keys(state.labelColors || {});
          return (keys.length ? state.labelColors[keys[0]] : null) || target.getAttribute('stroke') || '#0000ff';
        },
        getThickness: ctx => {
          if(ctx?.scope === 'series' && seriesKey){
            const byState = Number(state.labelStrokeWidth?.[seriesKey]);
            if(Number.isFinite(byState)){ return byState; }
          }
          const byAttr = Number(target.getAttribute('stroke-width'));
          if(Number.isFinite(byAttr)){ return byAttr; }
          return Number(state.borderWidth) || DEFAULT_ROC_BORDER_WIDTH;
        },
        getPattern: ctx => {
          if(ctx?.scope === 'series' && seriesKey){
            const persisted = state.labelLinePattern?.[seriesKey];
            if(persisted){ return sanitizeRocLinePattern(persisted); }
          }
          return inferRocPatternFromElement(target);
        },
        getTransparency: ctx => {
          let opacity = null;
          if(ctx?.scope === 'series' && seriesKey && state.labelOpacity && typeof state.labelOpacity[seriesKey] !== 'undefined'){
            opacity = Number(state.labelOpacity[seriesKey]);
          }else{
            const attrOpacity = Number(target.getAttribute('stroke-opacity'));
            opacity = Number.isFinite(attrOpacity) ? attrOpacity : 1;
          }
          const bounded = Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1;
          return Math.round((1 - bounded) * 100);
        },
        onColorInput: (value, ctx) => {
          const scopeValue = ctx?.scope === 'series' ? 'series' : 'global';
          const nodes = resolveTargets(scopeValue);
          nodes.forEach(node => { try{ node.setAttribute('stroke', value); }catch(e){} });
          if(scopeValue === 'series' && seriesKey){
            state.labelColors[seriesKey] = value;
          }else{
            nodes.forEach(node => {
              const key = node.getAttribute('data-series');
              if(key){ state.labelColors[key] = value; }
            });
          }
          state.scheduleDraw?.();
        },
        onColorChange: (value, ctx) => {
          const scopeValue = ctx?.scope === 'series' ? 'series' : 'global';
          const nodes = resolveTargets(scopeValue);
          nodes.forEach(node => { try{ node.setAttribute('stroke', value); }catch(e){} });
          if(scopeValue === 'series' && seriesKey){
            state.labelColors[seriesKey] = value;
          }else{
            nodes.forEach(node => {
              const key = node.getAttribute('data-series');
              if(key){ state.labelColors[key] = value; }
            });
          }
          state.scheduleDraw?.();
        },
        onThicknessChange: (value, ctx) => {
          const next = Number(value);
          if(!Number.isFinite(next)){ return; }
          const scopeValue = ctx?.scope === 'series' ? 'series' : 'global';
          const nodes = resolveTargets(scopeValue);
          nodes.forEach(node => { try{ node.setAttribute('stroke-width', String(next)); }catch(e){} });
          if(scopeValue === 'series' && seriesKey){
            state.labelStrokeWidth[seriesKey] = next;
          }else{
            nodes.forEach(node => {
              const key = node.getAttribute('data-series');
              if(key){ state.labelStrokeWidth[key] = next; }
            });
          }
          state.scheduleDraw?.();
        },
        onPatternChange: (value, ctx) => {
          const pattern = sanitizeRocLinePattern(value);
          const scopeValue = ctx?.scope === 'series' ? 'series' : 'global';
          const nodes = resolveTargets(scopeValue);
          nodes.forEach(node => applyRocPatternToElement(node, pattern));
          if(scopeValue === 'series' && seriesKey){
            state.labelLinePattern[seriesKey] = pattern;
          }else{
            nodes.forEach(node => {
              const key = node.getAttribute('data-series');
              if(key){ state.labelLinePattern[key] = pattern; }
            });
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
          if(scopeValue === 'series' && seriesKey){
            state.labelOpacity[seriesKey] = opacity;
          }else{
            nodes.forEach(node => {
              const key = node.getAttribute('data-series');
              if(key){ state.labelOpacity[key] = opacity; }
            });
          }
          state.scheduleDraw?.();
        }
      });
      return;
    }
    console.debug('Debug: roc additional line controls unavailable; legacy fallback removed');
  }
  const axisControls = Shared.axisControls = Shared.axisControls || {};
  const gridControls = Shared.gridControls = Shared.gridControls || {};
  if((typeof gridControls.show !== 'function' || typeof gridControls.registerGraphElement !== 'function') && typeof require === 'function'){
    try{
      require('../shared/gridControls.js');
    }catch(err){
      console.debug('Debug: roc component gridControls helper require failed', { message: err?.message || String(err) });
    }
  }
  const formControls = Shared.formControls = Shared.formControls || {};
  roc.__installed = true;
  roc.ready = false;
  const fileIO = Shared.fileIO = Shared.fileIO || {};
  if(!fileIO.saveGraphFile){
    console.debug('Debug: roc component awaiting Shared.fileIO helpers');
  }
  if(!Shared.tableImport || typeof Shared.tableImport.openFile !== 'function'){
    console.debug('Debug: roc component awaiting Shared.tableImport helpers'); // Debug: table import helper check
  }

  const ensureGraphViewport = Shared.graphViewport?.createEnsurer
    ? Shared.graphViewport.createEnsurer('roc')
    : (svg, options = {}) => {
      const fn = Shared.ensureGraphViewport || Shared.autoResizeSvg || global.ensureGraphViewport || global.autoResizeSvg;
      if(typeof fn === 'function'){
        fn(svg, { component: 'roc', debugLabel: 'roc-viewport-fallback', ...options });
        return;
      }
      console.debug('Debug: roc ensureGraphViewport helper missing', {
        hasShared: !!Shared,
        hasAutoResize: typeof Shared?.autoResizeSvg === 'function'
      });
    };
  console.debug('Debug: roc graph viewport helper configured', {
    hasGraphViewport: typeof Shared.graphViewport?.ensure === 'function',
    usesFactory: typeof Shared.graphViewport?.createEnsurer === 'function'
  });

  const makeEditable = (el, onChange, options) => {
    const fn = Shared.makeEditable || global.makeEditable;
    if(typeof fn === 'function'){
      return fn(el, onChange, options);
    }
    console.warn('roc component makeEditable fallback missing');
    return undefined;
  };

  const DEFAULT_ROWS = 100;
  const ROC_DEFAULT_COLS = 3;
  let emptyPayloadTemplate = null;

  function seedRocDefaultHeaderRow(matrix){
    if(!Array.isArray(matrix) || !Array.isArray(matrix[0])){
      return matrix;
    }
    const headerRow = matrix[0];
    if(headerRow.length > 0){
      headerRow[0] = 'Label';
    }
    const scoreCount = Math.min(Math.max(0, headerRow.length - 1), Math.max(0, ROC_DEFAULT_COLS - 1));
    for(let idx = 0; idx < scoreCount; idx += 1){
      headerRow[idx + 1] = `Score ${idx + 1}`;
    }
    return matrix;
  }

  function ensureRocDefaultHeaderRow(hotInstance){
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
    const colCount = Math.max(0, typeof hot.countCols === 'function' ? hot.countCols() : headerRow.length);
    if(colCount <= 0){
      return false;
    }
    const changes = [];
    if(!(headerRow[0] != null && String(headerRow[0]).trim())){
      changes.push([0, 0, 'Label']);
    }
    for(let col = 1; col < colCount; col += 1){
      const current = headerRow[col] != null ? String(headerRow[col]).trim() : '';
      if(!current){
        changes.push([0, col, `Score ${col}`]);
      }
    }
    if(!changes.length){
      return false;
    }
    hot.setDataAtCell(changes, 'roc-default-header-seed');
    return true;
  }
  function resolveActiveTabId(){
    try{
      const tab = Main?.session?.getActiveTab?.();
      return tab?.id || null;
    }catch(err){
      console.error('roc resolveActiveTabId error', err);
      return null;
    }
  }

  function cloneSimple(value){
    if(!value) return null;
    try{
      return JSON.parse(JSON.stringify(value));
    }catch(err){
      console.error('roc cloneSimple error', err);
      return null;
    }
  }

  function ensureEmptyPayloadTemplate(){
    if(emptyPayloadTemplate){
      return;
    }
    emptyPayloadTemplate = { type: 'roc', config: {} };
  }
  const palette = Shared.palette = Shared.palette || {};
  if(typeof palette.ensureDefaultScatterColors !== 'function' && typeof require === 'function'){
    try{
      require('../shared/palette.js');
    }catch(err){
      // ignore palette preload failures
    }
  }
  const DEFAULT_SCATTER_COLORS = typeof palette.ensureDefaultScatterColors === 'function'
    ? palette.ensureDefaultScatterColors()
    : (Array.isArray(palette.DEFAULT_SCATTER_COLORS) && palette.DEFAULT_SCATTER_COLORS.length
      ? palette.DEFAULT_SCATTER_COLORS
      : global.DEFAULT_SCATTER_COLORS);
  if(Array.isArray(DEFAULT_SCATTER_COLORS) && DEFAULT_SCATTER_COLORS.length){
    palette.DEFAULT_SCATTER_COLORS = DEFAULT_SCATTER_COLORS;
    global.DEFAULT_SCATTER_COLORS = DEFAULT_SCATTER_COLORS;
  }

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
  const ROC_AUTO_DRAW_ROW_THRESHOLD = 5000;
  const ROC_AUTO_DRAW_COL_THRESHOLD = 5000;
  const ROC_AUTO_DRAW_CELL_THRESHOLD = 50000;
  const ROC_DATA_VIEW_MAX = 15;

  function createDefaultAxisSettings(){
    return {
      strokeWidth: 1,
      color: DEFAULT_AXIS_COLOR,
      x: { tickInterval: null, minorTicks: false, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS },
      y: { tickInterval: null, minorTicks: false, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS }
    };
  }

  const DEFAULT_ROC_BORDER_WIDTH = 2;

  const state = {
    hot: null,
    scheduleDraw: null,
    borderWidth: DEFAULT_ROC_BORDER_WIDTH,
    labelColors: {},
    labelStrokeWidth: {},
    labelOpacity: {},
    labelLinePattern: {},
    diffMethod: 'delong',
    compareSel: null,
    compareLabel: null,
    compareResult: null,
    compareSelection: null,
    minSvgWidth: 0,
    layout: null,
    fileHandle: null,
    fileName: 'roc.graph',
    titleText: 'ROC curve',
    axisSettings: createDefaultAxisSettings(),
    gridStyle: null,
    autoDrawEnabled: true,
    autoDrawReason: null,
    autoDrawLockedByThreshold: false,
    drawPending: false,
    lastDataShape: { rows: 0, cols: 0 },
    lastAutoDrawEvaluation: null,
    labelPositions: { title: null, xLabel: null, yLabel: null, legend: null }
  };
  let rocAutoDrawManager = null;
  let scheduleDrawRocRaw = () => {};
  let rocFontEventBound = false;
  let rocDataViewsManager = null;

  function scheduleRocViewRefresh(reason){
    if(typeof state.scheduleDraw !== 'function'){
      return;
    }
    state.scheduleDraw({
      viewOnly: true,
      reason: reason || 'roc-view-refresh'
    });
  }

  function isRocFontStyleEvent(detail){
    const scopeId = detail?.scopeId || null;
    const storeKey = typeof detail?.storeKey === 'string' ? detail.storeKey : '';
    return scopeId === 'roc' || storeKey.startsWith('roc::');
  }

  function ensureRocFontEventListener(){
    if(rocFontEventBound || !global.document || typeof global.document.addEventListener !== 'function'){
      return;
    }
    global.document.addEventListener('fontControls:styleChanged', event => {
      const detail = event?.detail || {};
      if(!isRocFontStyleEvent(detail)){
        return;
      }
      scheduleRocViewRefresh('font-style-change');
    });
    rocFontEventBound = true;
  }

  const rocUndoManager = Shared.undoManager || null;
  function persistRocTabState(reason){
    try{
      const sess = window.Main?.session;
      if(sess && typeof sess.persistActiveTabState === 'function'){
        sess.persistActiveTabState(undefined, { reason: reason || 'roc-stats-change' });
      }
    }catch(err){
      console.debug('Debug: persistRocTabState failed', { err: err?.message || String(err) });
    }
  }
  function recordRocChange(label, previous, next, apply){
    if(!rocUndoManager || typeof rocUndoManager.recordStateChange !== 'function'){
      return;
    }
    if(typeof apply !== 'function'){
      return;
    }
    rocUndoManager.recordStateChange({
      label,
      scope: 'rocGraphPanel',
      from: previous,
      to: next,
      apply(value){
        apply(value);
        return true;
      }
    });
  }

  function applyRocLabelColor(label, value){
    const nextValue = value != null ? String(value) : '';
    const previousValue = state.labelColors[label] || '';
    if(nextValue){
      if(previousValue === nextValue){
        return true;
      }
      state.labelColors[label] = nextValue;
    }else if(previousValue){
      delete state.labelColors[label];
    }else{
      return true;
    }
    state.scheduleDraw?.();
    return true;
  }
  const rocAdvisorState={
    open:false,
    activated:false,
    answers:{},
    lastApplied:null,
    context:null
  };

  const refs = {};
  function ensureRocStatsReportHost(){
    const reporting = Shared.statsReporting;
    if(!refs.statsResults || !reporting || typeof reporting.ensureReportHost !== 'function'){
      return refs.statsResults?.__statsReportHost || null;
    }
    return reporting.ensureReportHost(refs.statsResults, {
      id: 'rocStatsReportHost',
      className: 'stats-report-host',
      attachToTarget: true,
      position: 'last'
    });
  }
  function clearRocStatsReportHost(){
    const reporting = Shared.statsReporting;
    if(reporting && typeof reporting.clearReportHost === 'function'){
      reporting.clearReportHost(refs.statsResults);
    }
  }
  let rocLegendControl = null;
  const rocOverlayController = Shared.loadingOverlay?.createPendingController?.({
    component: 'roc',
    message: 'Rendering ROC/PR plot...',
    getHost: () => (
      refs.svgBox
      || refs.graphPanel?.querySelector?.('.svgbox')
      || global.document?.getElementById?.('rocGraphPanel')?.querySelector?.('.svgbox')
      || global.document?.getElementById?.('rocGraphPanel')
    )
  });

  function markRocOverlayPending(reason){
    rocOverlayController?.markPending(reason);
    console.debug('Debug: roc overlay pending flagged', { reason: reason || 'data-change' });
  }

  function queueRocOverlay(reason, options = {}){
    return rocOverlayController?.queue(reason, options) || false;
  }

  function resolveRocOverlay(reason){
    rocOverlayController?.resolve(reason);
  }

  function forceRocOverlay(reason, options = {}){
    return rocOverlayController?.force(reason, options) || false;
  }
  let rocNoticeBoundWidth = null;

  const syncRocAutoDrawNoticeWidth = (reason) => {
    const svgBox = refs.svgBox || refs.graphPanel?.querySelector?.('.svgbox');
    const renderRow = refs.renderRow || document.getElementById('rocRenderRow');
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
    if(refs.autoDrawNotice && refs.autoDrawNotice.style.maxWidth !== widthPx){
      refs.autoDrawNotice.style.maxWidth = widthPx;
    }
    if(rocNoticeBoundWidth !== width){
      rocNoticeBoundWidth = width;
      console.debug('Debug: roc auto draw notice width synced', { width, reason: reason || null });
    }
  };
  const scheduleRocNoticeWidth = (() => {
    if(typeof Shared.debounceFrame === 'function'){
      let lastReason = 'frame';
      const debounced = Shared.debounceFrame(() => syncRocAutoDrawNoticeWidth(lastReason));
      return reason => {
        lastReason = reason || 'frame';
        debounced();
      };
    }
    return reason => syncRocAutoDrawNoticeWidth(reason || 'immediate');
  })();

  function ensureRocLegendControlPlacement(){
    if(!rocLegendControl || !refs.svgBox){
      return;
    }
    if(Shared.resizer && typeof Shared.resizer.ensureLegendControlPlacement === 'function'){
      Shared.resizer.ensureLegendControlPlacement({
        svgBox: refs.svgBox,
        control: rocLegendControl,
        debugLabel: 'roc-legend'
      });
    }
  }

  function attachRocSelectAutoSize(select, label){
    if(!select){ return; }
    if(typeof formControls.attachSelectAutoSize === 'function'){
      formControls.attachSelectAutoSize(select, label || 'roc');
      return;
    }
    const debugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
    const watcher = typeof formControls.watchSelectAutoSize === 'function' ? formControls.watchSelectAutoSize : null;
    const autoSizer = typeof formControls.autoSizeSelect === 'function' ? formControls.autoSizeSelect : null;
    const contextLabel = label || 'roc';
    try{
      if(watcher){
        watcher(select);
        if(debugEnabled){
          console.debug('Debug: roc select auto-size watcher attached', {
            id: select.id || null,
            label: contextLabel
          });
        }
      }else if(autoSizer){
        autoSizer(select);
        if(debugEnabled){
          console.debug('Debug: roc select auto-size applied without watcher', {
            id: select.id || null,
            label: contextLabel
          });
        }
      }else if(debugEnabled){
        console.debug('Debug: roc select auto-size helper unavailable', {
          id: select.id || null,
          label: contextLabel
        });
      }
    }catch(err){
      if(debugEnabled){
        console.debug('Debug: roc select auto-size attach error', {
          id: select.id || null,
          label: contextLabel,
          error: err?.message || String(err)
        });
      }
    }
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
    console.debug('Debug: roc axis tick interval updated', { axis, tickInterval: settings[axis].tickInterval });
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
    console.debug('Debug: roc minor ticks updated',{ axis, enabled: nextValue });
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
    console.debug('Debug: roc minor tick subdivisions updated',{ axis, subdivisions: nextValue });
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
    console.debug('Debug: roc axis stroke width updated', { strokeWidth: settings.strokeWidth });
    state.scheduleDraw?.();
  }

  function getAxisColor(){
    return ensureAxisSettings().color || DEFAULT_AXIS_COLOR;
  }

  function updateAxisColor(value){
    const settings = ensureAxisSettings();
    settings.color = typeof value === 'string' && value.trim() ? value : DEFAULT_AXIS_COLOR;
    console.debug('Debug: roc axis color updated', { color: settings.color });
    state.scheduleDraw?.();
  }

  function registerRocGridControlTarget(target, options){
    if(!target || !gridControls || typeof gridControls.registerGraphElement !== 'function'){
      return;
    }
    const opts = options && typeof options === 'object' ? options : {};
    const fallbackThickness = Number.isFinite(Number(opts.fallbackThickness)) ? Number(opts.fallbackThickness) : getAxisStrokeWidthBase();
    gridControls.registerGraphElement(target, {
      scopeId: 'roc',
      getVisible: () => !!refs.showGrid?.checked,
      onVisibleChange: value => {
        if(refs.showGrid){
          refs.showGrid.checked = !!value;
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
    console.debug('Debug: roc axis settings applied', { settings: state.axisSettings });
  }

  function buildManualTicksNormalized(interval){
    if(!Number.isFinite(interval) || interval <= 0){ return null; }
    const ticks = [];
    let value = 0;
    let guard = 0;
    const epsilon = interval * 1e-4;
    while(value <= 1 + epsilon && guard < 1000){
      const clamped = Math.min(Math.max(value, 0), 1);
      if(ticks.length === 0 || Math.abs(ticks[ticks.length - 1] - clamped) > 1e-6){
        ticks.push(Number.parseFloat(clamped.toFixed(6)));
      }
      value += interval;
      guard += 1;
    }
    if(Math.abs((ticks[ticks.length - 1] ?? 0) - 1) > 1e-6){
      ticks.push(1);
    } else {
      ticks[ticks.length - 1] = 1;
    }
    if(ticks[0] !== 0){
      ticks.unshift(0);
    }
    console.debug('Debug: roc manual ticks built', { interval, tickCount: ticks.length });
    return { min: 0, max: 1, ticks };
  }

  const markFontEditable = (node, role, key) => {
    if(!node){ return; }
    const payload = {
      role: role || null,
      key: key || role || null,
      text: node?.textContent || null
    };
    if(fontControls && typeof fontControls.markText === 'function'){
      fontControls.markText(node, { scopeId: 'roc', role, key });
    }else if(node.dataset){
      node.dataset.fontEditable = '1';
      node.dataset.fontScope = 'roc';
      if(role){ node.dataset.fontRole = role; }
      if(key || role){ node.dataset.fontKey = key || role; }
    }
    if(!role || role.indexOf('Tick') === -1){
      console.debug('Debug: roc markFontEditable', payload); // Debug: font target tagging summary
    }
  };

  function $(selector){
    return document.querySelector(selector);
  }

  function ensureElements(){
    refs.tablePanel = document.getElementById('rocTablePanel');
    refs.graphPanel = document.getElementById('rocGraphPanel');
    refs.panelResizer = document.getElementById('rocPanelResizer');
    refs.svgBox = refs.graphPanel?.querySelector('.svgbox');
    refs.configPanel = refs.graphPanel?.querySelector('.config-panel');
    refs.hotContainer = document.getElementById('rocHot');
    refs.hotWrapper = document.getElementById('rocHotWrapper');
    refs.plotDiv = document.getElementById('rocPlot');
    refs.statsResults = document.getElementById('rocStatsResults');
    ensureRocStatsReportHost();
    refs.statsControls = document.getElementById('rocStatsControls');
    refs.renderRow = document.getElementById('rocRenderRow');
    refs.renderButton = document.getElementById('rocRenderButton');
    refs.autoDrawNotice = document.getElementById('rocAutoDrawNotice');
    refs.showGrid = document.getElementById('rocShowGrid');
    refs.showFrame = document.getElementById('rocShowFrame');
    refs.fontSize = document.getElementById('rocFontSize');
    refs.fontSizeVal = document.getElementById('rocFontSizeVal');
    refs.showLegend = document.getElementById('rocShowLegend');
    if(refs.showLegend){
      const legendHost = refs.showLegend.closest('label');
      if(legendHost){
        rocLegendControl = legendHost;
        ensureRocLegendControlPlacement();
      }
    }
      refs.graphType = document.getElementById('rocGraphType');
      attachRocSelectAutoSize(refs.graphType, 'roc');
    refs.loadExampleBtn = document.getElementById('rocLoadExample');
    refs.importBtn = document.getElementById('rocImport');
    refs.fileInput = document.getElementById('rocFile');
    refs.openBtn = document.getElementById('openRocGraph');
    refs.saveBtn = document.getElementById('saveRocGraph');
    refs.saveAsBtn = document.getElementById('saveAsRoc');
    refs.graphFileInput = document.getElementById('rocGraphFile');
    return !!(refs.tablePanel && refs.graphPanel && refs.hotContainer && refs.plotDiv);
  }

  function createRocTableInstance(container){
    if(!container || typeof Shared?.hot?.createStandardTable !== 'function'){
      console.warn('ROC hot container or table factory missing');
      return null;
    }
    if(typeof Shared.hot?.createStandardTable !== 'function'){
      console.error('roc initHot missing Shared.hot.createStandardTable');
      return null;
    }
    const data = seedRocDefaultHeaderRow(Shared.createEmptyData(DEFAULT_ROWS, ROC_DEFAULT_COLS));
    const scheduleRocDrawProxy = () => {
      if(typeof state.scheduleDraw === 'function'){
        state.scheduleDraw();
      }
    };

    const instance = Shared.hot.createStandardTable(container, { rows: DEFAULT_ROWS, cols: ROC_DEFAULT_COLS }, scheduleRocDrawProxy, {
      debugLabel: 'roc',
      data,
      pinFirstRow: true,
      scheduleOnLoadData: true,
      hotOptions: {
        stretchH: 'all',
        afterChange(changes, source){
        },
        afterCreateRow(){
        },
        afterCreateCol(){
        },
        afterRemoveRow(){
        },
        afterRemoveCol(){
        },
        afterUndo(){
        },
        afterRedo(){
        }
      }
    });
    return instance;
  }

  function ensureHotForActiveTab(){
    const wrapper = refs.hotWrapper || document.getElementById('rocHotWrapper');
    const baseContainer = refs.hotContainer || document.getElementById('rocHot');
    const tabId = resolveActiveTabId() || 'roc-default';
    if(!Shared.hot?.mountTableForTab || !wrapper){
      if(!state.hot && baseContainer){
        state.hot = createRocTableInstance(baseContainer);
      }
      ensureRocDataViewsForHot(state.hot, {
        wrapper,
        container: state.hot?.__rocHostContainer || baseContainer
      });
      ensureRocDefaultHeaderRow(state.hot);
      return state.hot;
    }
    const entry = Shared.hot.mountTableForTab({
      type: 'roc',
      tabId,
      wrapper,
      templateContainer: baseContainer,
      createInstance: container => createRocTableInstance(container)
    });
    if(entry){
      refs.hotContainer = entry.container;
      state.hot = entry.instance;
    }
    ensureRocDataViewsForHot(state.hot, {
      wrapper,
      container: state.hot?.__rocHostContainer || refs.hotContainer || baseContainer
    });
    ensureRocDefaultHeaderRow(state.hot);
    return state.hot;
  }

  function ensureRocDataViewsForHot(hotInstance, options = {}){
    if(!hotInstance || typeof hotInstance.getData !== 'function'){
      return null;
    }
    if(typeof Shared.dataViews?.createManager !== 'function'){
      return null;
    }
    if(!hotInstance.__rocDataViewsManager){
      hotInstance.__rocDataViewsManager = Shared.dataViews.createManager({
        componentKey: 'roc',
        maxViews: ROC_DATA_VIEW_MAX,
        initialData: hotInstance.getData() || [],
        onActiveViewChanged(view){
          if(!view || !hotInstance || typeof hotInstance.loadData !== 'function'){
            return;
          }
          const nextData = Array.isArray(view.data) ? view.data : [];
          hotInstance.loadData(nextData, { source: 'roc-data-view-switch' });
          if(view.exclusions){
            hotInstance.applyExclusions?.(view.exclusions);
          }
          if(view.filters){
            hotInstance.applyFilters?.(view.filters, { schedule: false });
          }
          state.scheduleDraw?.({ reason: 'data-view-switch' });
        },
        onInteraction(){
          Shared.workspaceToolbar?.activateSection?.('roc', 'Data');
        }
      });
      console.debug('Debug: roc data views manager created');
    }
    const manager = hotInstance.__rocDataViewsManager;
    const hostWrapper = options.wrapper || refs.hotWrapper || document.getElementById('rocHotWrapper');
    const hostContainer = options.container || hotInstance.__rocHostContainer || refs.hotContainer || document.getElementById('rocHot');
    if(hostWrapper && hostContainer){
      manager.mount({ wrapper: hostWrapper, tableContainer: hostContainer });
      manager.refresh?.();
    }
    rocDataViewsManager = manager;
    return manager;
  }

  function syncRocActiveDataViewFromHot(hotInstance, reason){
    const hot = hotInstance || state.hot;
    if(!hot || typeof hot.getData !== 'function'){
      return;
    }
    const manager = hot.__rocDataViewsManager || rocDataViewsManager;
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

  function clearPlotArea(reason, options = {}){
    const noticeMessage = Object.prototype.hasOwnProperty.call(options, 'message')
      ? options.message
      : (Shared.getEmptyPlotNoticeMessage ? Shared.getEmptyPlotNoticeMessage() : 'Add data to the input table to generate a plot.');
    if(refs.plotDiv){
      if(typeof Shared.renderPlotNotice === 'function'){
        Shared.renderPlotNotice(refs.plotDiv, noticeMessage, { resetAspect: true, show: true });
      }else{
        while(refs.plotDiv.firstChild){
          refs.plotDiv.removeChild(refs.plotDiv.firstChild);
        }
        refs.plotDiv.style.display = 'block';
        const notice = document.createElement('i');
        notice.textContent = noticeMessage;
        refs.plotDiv.appendChild(notice);
      }
    }
    if(refs.statsResults){
      clearRocStatsReportHost();
      refs.statsResults.textContent = '';
    }
    if(state.compareSel){
      state.compareSel.innerHTML = '';
      state.compareSel.value = '';
      state.compareSel.style.display = 'none';
    }
    if(state.compareLabel){
      state.compareLabel.style.display = 'none';
    }
    if(state.compareResult){
      state.compareResult.textContent = '';
      state.compareResult.style.display = 'none';
    }
    console.debug('Debug: roc clearPlotArea invoked', { reason }); // Debug: cleared plot state summary
  }

  function updateFontSizeLabel(){
    if(refs.fontSizeVal && refs.fontSize){
      if(refs.fontSize.dataset){
        refs.fontSize.dataset.fontBasePt = String(refs.fontSize.value);
        console.debug('Debug: roc font size base synced',{ value: refs.fontSize.value }); // Debug: base sync update
      }
      chartStyle.renderFontSizeLabel({ element: refs.fontSizeVal, pt: Number(refs.fontSize.value), input: refs.fontSize, manual: true });
    }
  }

  function buildRocAdvisorContext(raw){
    const graphType=(refs.graphType?.value || raw?.graphType || 'roc').toLowerCase();
    const positives=Number.isFinite(raw?.positives)?raw.positives:0;
    const negatives=Number.isFinite(raw?.negatives)?raw.negatives:0;
    const pairCounts=Array.isArray(raw?.pairCounts)?raw.pairCounts:[];
    const minPairs=pairCounts.length?Math.min(...pairCounts):0;
    return {
      graphType,
      positives,
      negatives,
      totalCases: positives+negatives,
      seriesCount: Number.isFinite(raw?.seriesCount)?raw.seriesCount:0,
      minPairs,
      pairCounts,
      diffMethod: state.diffMethod
    };
  }

  function ensureRocAdvisorDefaults(context){
    const answers=rocAdvisorState.answers || {};
    if(!answers.methodChoice){
      if(context.graphType==='roc'){
        const minClass=Math.min(context.positives, context.negatives);
        answers.methodChoice=minClass>=50?'delong':'bootstrap';
      }else{
        answers.methodChoice='bootstrap';
      }
    }
    rocAdvisorState.answers=answers;
    return answers;
  }

  function buildRocAdvisorQuestions(context){
    const graphType=context.graphType || 'roc';
    const options=graphType==='roc'
      ? [
        { value:'delong', label:'DeLong analytic test (fast with ≥ ~50 positives & negatives)' },
        { value:'bootstrap', label:'Bootstrap resampling (robust for small or imbalanced samples)' }
      ]
      : [
        { value:'bootstrap', label:'Bootstrap resampling (captures score variability)' },
        { value:'permutation', label:'Permutation test (shuffle labels for a strict null)' }
      ];
    const help=graphType==='roc'
      ? 'Pick DeLong for well-powered ROC comparisons or bootstrap when counts are small or imbalanced.'
      : 'Precision–recall comparisons typically rely on resampling; choose permutation if you need an exact label shuffle test.';
    return [{
      id:'methodChoice',
      prompt:'How should curve differences be estimated?',
      help,
      options
    }];
  }

  function computeRocAdvisorRecommendation(answers, context){
    const recommendation={
      ready:false,
      message:'',
      summary:'',
      rationale:[],
      warnings:[],
      diffMethod:state.diffMethod || 'delong'
    };
    if(!answers.methodChoice){
      recommendation.message='Answer the advisor question to receive a recommendation.';
      return recommendation;
    }
    recommendation.diffMethod=answers.methodChoice;
    if(answers.methodChoice==='delong'){
      recommendation.rationale.push('DeLong provides a fast analytic variance estimate for ROC AUC differences.');
      if(Math.min(context.positives, context.negatives) < 40){
        recommendation.warnings.push('DeLong accuracy drops with very small positive/negative counts; consider bootstrap instead.');
      }
      if(context.graphType==='pr'){
        recommendation.warnings.push('DeLong is not defined for precision–recall curves; use bootstrap or permutation.');
      }
    }else if(answers.methodChoice==='bootstrap'){
      recommendation.rationale.push('Bootstrap resampling works across ROC and PR curves and tolerates small or imbalanced samples.');
      if(context.minPairs && context.minPairs < 20){
        recommendation.warnings.push('Increase bootstrap iterations for very small series to stabilize the resampled distribution.');
      }
    }else if(answers.methodChoice==='permutation'){
      recommendation.rationale.push('Permutation tests construct a null distribution by shuffling labels without distributional assumptions.');
      recommendation.warnings.push('Permutation tests can be computationally intensive; ensure enough shuffles for stable p-values.');
    }
    const labels={
      delong:'DeLong analytic comparison',
      bootstrap:'Bootstrap resampling comparison',
      permutation:'Permutation-based comparison'
    };
    recommendation.summary=`Use ${labels[recommendation.diffMethod] || recommendation.diffMethod}.`;
    recommendation.ready=true;
    return recommendation;
  }

  function renderRocStatsAdvisor(rawContext){
    const container=document.getElementById('rocStatsAdvisor');
    if(!container){
      return;
    }
    const context=buildRocAdvisorContext(rawContext || rocAdvisorState.context || {});
    rocAdvisorState.context=context;
    const answers=ensureRocAdvisorDefaults(context);
    const recommendation=computeRocAdvisorRecommendation(answers, context);
    const sharedAdvisorUi = Shared.statsUi;
    if(sharedAdvisorUi && typeof sharedAdvisorUi.renderAdvisorPanel==='function'){
      sharedAdvisorUi.renderAdvisorPanel({
        container,
        state: rocAdvisorState,
        title: 'Statistics advisor',
        inactiveMessage: 'Press the "Guide me" button to view advisor recommendations.',
        recommendation,
        answers,
        questions: rocAdvisorState.open ? buildRocAdvisorQuestions(context) : [],
        namePrefix: 'roc-advisor',
        onToggle: (nextOpen)=>{
          rocAdvisorState.open=!!nextOpen;
          if(rocAdvisorState.open && !rocAdvisorState.activated){
            rocAdvisorState.activated=true;
            console.debug('Debug: roc statsAdvisor activated');
          }
          console.debug('Debug: roc statsAdvisor toggled',{ open:rocAdvisorState.open });
          renderRocStatsAdvisor(rocAdvisorState.context);
        },
        onAnswerChange: (question, value)=>{
          answers[question.id]=value;
          rocAdvisorState.answers=answers;
          console.debug('Debug: roc statsAdvisor answer change',{ question:question.id, value });
          renderRocStatsAdvisor(rocAdvisorState.context);
        },
        onApply: ()=>{
          if(!recommendation.ready){
            return;
          }
          state.diffMethod=recommendation.diffMethod;
          renderRocStatsControls({ graphType: refs.graphType?.value || 'roc' });
          scheduleDraw();
          rocAdvisorState.lastApplied={ ...recommendation };
          console.debug('Debug: roc statsAdvisor applied',{ diffMethod:recommendation.diffMethod, answers:{ ...answers } });
          renderRocStatsAdvisor(rocAdvisorState.context);
        },
        onReset: ()=>{
          rocAdvisorState.answers={};
          console.debug('Debug: roc statsAdvisor reset');
          renderRocStatsAdvisor(rocAdvisorState.context);
        }
      });
      return;
    }
    container.innerHTML='';
    const wrapper=document.createElement('div');
    wrapper.className='stats-advisor';
    wrapper.dataset.open=rocAdvisorState.open?'1':'0';
    const header=document.createElement('div');
    header.className='stats-advisor__header';
    const title=document.createElement('strong');
    title.textContent='Test advisor';
    header.appendChild(title);
    const toggle=document.createElement('button');
    toggle.type='button';
    toggle.className='stats-advisor__toggle';
    toggle.textContent=rocAdvisorState.open?'Hide advisor':'Guide me';
    toggle.addEventListener('click',()=>{
      rocAdvisorState.open=!rocAdvisorState.open;
      if(rocAdvisorState.open && !rocAdvisorState.activated){
        rocAdvisorState.activated=true;
        console.debug('Debug: roc statsAdvisor activated');
      }
      console.debug('Debug: roc statsAdvisor toggled',{ open:rocAdvisorState.open });
      renderRocStatsAdvisor(rocAdvisorState.context);
    });
    header.appendChild(toggle);
    wrapper.appendChild(header);
    const summary=document.createElement('div');
    summary.className='stats-advisor__summary';
    if(!rocAdvisorState.activated){
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
      message.textContent=recommendation.message || 'Answer the advisor question to receive a recommendation.';
      summary.appendChild(message);
    }
    wrapper.appendChild(summary);
    if(rocAdvisorState.open){
      const questionsWrap=document.createElement('div');
      questionsWrap.className='stats-advisor__questions';
      const questions=buildRocAdvisorQuestions(context);
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
          input.name=`roc-advisor-${question.id}`;
          input.value=option.value;
          input.checked=answers[question.id]===option.value;
          input.addEventListener('change',()=>{
            answers[question.id]=option.value;
            rocAdvisorState.answers=answers;
            console.debug('Debug: roc statsAdvisor answer change',{ question:question.id, value:option.value });
            renderRocStatsAdvisor(rocAdvisorState.context);
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
        state.diffMethod=recommendation.diffMethod;
        rocAdvisorState.lastApplied={ ...recommendation };
        console.debug('Debug: roc statsAdvisor applied',{ diffMethod:recommendation.diffMethod, answers:{ ...answers } });
        persistRocTabState('roc-stats-advisor-apply');
        renderStatsControls();
        state.scheduleDraw?.();
      });
      actions.appendChild(applyBtn);
      const resetBtn=document.createElement('button');
      resetBtn.type='button';
      resetBtn.className='stats-advisor__reset';
      resetBtn.textContent='Reset answers';
      resetBtn.addEventListener('click',()=>{
        rocAdvisorState.answers={};
        console.debug('Debug: roc statsAdvisor reset');
        renderRocStatsAdvisor(rocAdvisorState.context);
      });
      actions.appendChild(resetBtn);
      wrapper.appendChild(actions);
    }
    container.appendChild(wrapper);
  }

  function renderStatsControls(){
    if(!refs.statsControls){
      return;
    }
    renderRocStatsAdvisor(state.advisorContext);
    refs.statsControls.innerHTML = '';

    const diffLabel = document.createElement('label');
    diffLabel.textContent = 'Diff method:';
    refs.statsControls.appendChild(diffLabel);

    const select = document.createElement('select');
    const graphType = refs.graphType?.value || 'roc';
    const options = graphType === 'roc'
      ? [['delong', 'DeLong'], ['bootstrap', 'Bootstrap']]
      : [['bootstrap', 'Bootstrap'], ['permutation', 'Permutation']];
    if(!options.some(opt => opt[0] === state.diffMethod)){
      state.diffMethod = options[0][0];
    }
    options.forEach(([value, label]) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      if(value === state.diffMethod){
        opt.selected = true;
      }
      select.appendChild(opt);
    });
    select.addEventListener('change', () => {
      state.diffMethod = select.value;
      persistRocTabState('roc-diff-method-change');
      console.debug('Debug: ROC diff method change', state.diffMethod);
      state.scheduleDraw?.();
    });
    refs.statsControls.appendChild(select);

    state.compareLabel = document.createElement('label');
    state.compareLabel.textContent = 'Compare:';
    refs.statsControls.appendChild(state.compareLabel);

    state.compareSel = document.createElement('select');
    state.compareSel.addEventListener('change', () => {
      state.compareSelection = state.compareSel.value;
      persistRocTabState('roc-compare-change');
      console.debug('Debug: ROC compare pair change', state.compareSel.value);
      state.scheduleDraw?.();
    });
    refs.statsControls.appendChild(state.compareSel);

    state.compareResult = document.createElement('span');
    state.compareResult.style.marginLeft = '4px';
    refs.statsControls.appendChild(state.compareResult);

    console.debug('Debug: ROC stats controls rendered', {graphType, diff: state.diffMethod});
  }

  function ensureLabelColors(labels){
    const labelSet = new Set(labels);
    labels.forEach((label, index) => {
      if(!state.labelColors[label]){
        state.labelColors[label] = DEFAULT_SCATTER_COLORS[index % DEFAULT_SCATTER_COLORS.length];
        console.debug('Debug: ROC default label color applied', { label, color: state.labelColors[label] });
      }
    });
    Object.keys(state.labelColors).forEach(key => {
      if(!labelSet.has(key)){
        console.debug('Debug: ROC label color pruned', { label: key });
        delete state.labelColors[key];
      }
    });
    console.debug('Debug: ensureLabelColors sync complete', { count: Object.keys(state.labelColors).length });
  }

  function initExampleAndImport(){
    const example = [
      ['Label','Model1','Model2','Model3'],
      [1,0.98,0.9,0.88],
      [0,0.95,0.4,0.3],
      [1,0.93,0.85,0.76],
      [0,0.9,0.35,0.25],
      [1,0.88,0.8,0.68],
      [0,0.85,0.3,0.2],
      [1,0.82,0.75,0.6],
      [0,0.8,0.25,0.15],
      [1,0.78,0.7,0.55],
      [0,0.75,0.2,0.1],
      [1,0.72,0.65,0.5],
      [0,0.7,0.15,0.08],
      [1,0.68,0.6,0.45],
      [0,0.65,0.1,0.06],
      [1,0.62,0.55,0.4],
      [0,0.6,0.08,0.04],
      [1,0.58,0.5,0.35],
      [0,0.55,0.06,0.03],
      [1,0.52,0.45,0.3],
      [0,0.5,0.04,0.02],
      [1,0.48,0.4,0.25],
      [0,0.45,0.02,0.01]
    ];

    refs.loadExampleBtn?.addEventListener('click', () => {
      if(!state.hot){
        return;
      }
      const overlayReason = 'example-data';
      markRocOverlayPending(overlayReason);
      state.hot.loadData(example, {
        source: 'example-load',
        recordUndo: true,
        undoLabel: 'table:roc:example-load'
      });
      console.debug('Debug: ROC example loaded');
      state.scheduleDraw?.();
    });

    refs.importBtn?.addEventListener('click', () => {
      if(refs.fileInput){
        refs.fileInput.value = '';
        refs.fileInput.click();
      }
    });
    if(refs.renderButton){
      refs.renderButton.addEventListener('click', () => {
        console.debug('Debug: roc manual render button');
        const overlayReason = 'manual-render';
        markRocOverlayPending(overlayReason);
        forceRocOverlay(overlayReason, { message: 'Rendering ROC/PR plot...' });
        state.scheduleDraw?.({ force: true, reason: overlayReason });
      });
    }

    refs.fileInput?.addEventListener('change', async () => {
      const tableImport = Shared.tableImport;
      if(!tableImport || typeof tableImport.openFile !== 'function'){
        console.warn('roc import skipped: Shared.tableImport.openFile unavailable');
        return;
      }
      const hasFile = !!(refs.fileInput?.files && refs.fileInput.files[0]);
      let forcedOverlay = false;
      if(hasFile){
        forcedOverlay = !!forceRocOverlay('file-import', { message: 'Importing table data...' });
        markRocOverlayPending('file-import');
      }
      const fileName = refs.fileInput?.files?.[0]?.name || '';
      console.debug('Debug: ROC import start', {fileName}); // Debug: import start trace
      try{
        const result = await tableImport.openFile(refs.fileInput, {
          hot: state.hot,
          minCols: ROC_DEFAULT_COLS,
          minRows: DEFAULT_ROWS,
          scheduleDraw: () => {
            markRocOverlayPending('file-import');
            state.scheduleDraw?.({ force: true, reason: 'import-load', skipThresholdEvaluation: true });
          },
          debugLabel: 'roc',
          onProcessed: info => {
            console.debug('Debug: ROC tableImport processed', info || {}); // Debug: processed callback
          },
          onCompleted: () => {
            const renderReason = 'import-load';
            markRocOverlayPending(renderReason);
            forceRocOverlay(renderReason, { message: 'Rendering ROC/PR plot...' });
          }
        });
        if(!result && forcedOverlay){
          resolveRocOverlay('file-import-empty');
        }
        console.debug('Debug: ROC import finished', {rows: result?.rows || 0, cols: result?.cols || 0}); // Debug: import finish trace
      }catch(err){
        if(forcedOverlay){
          resolveRocOverlay('file-import-error');
        }
        console.error('roc import failed', err);
      }
    });
  }

  function computeCurveMetric(pairs, graphType){
    const arr = pairs.slice().sort((a, b) => b.score - a.score);
    let tp = 0;
    let fp = 0;
    let auc = 0;
    let ap = 0;
    const P = arr.filter(p => p.label === 1).length;
    const N = arr.length - P;
    let prevRec = 0;
    let prevPrec = 1;
    let prevFpr = 0;
    let prevTpr = 0;
    for(const pair of arr){
      if(pair.label === 1){
        tp += 1;
      }else{
        fp += 1;
      }
      if(graphType === 'roc'){
        const fpr = fp / Math.max(1, N);
        const tpr = tp / Math.max(1, P);
        auc += (fpr - prevFpr) * (tpr + prevTpr) / 2;
        prevFpr = fpr;
        prevTpr = tpr;
      }else{
        const rec = tp / Math.max(1, P);
        const prec = tp / Math.max(1, tp + fp);
        auc += (rec - prevRec) * (prec + prevPrec) / 2;
        ap += (rec - prevRec) * prec;
        prevRec = rec;
        prevPrec = prec;
      }
    }
    return graphType === 'roc' ? auc : ap;
  }

  function computeSampleVariance(values){
    const clean = Array.isArray(values) ? values.map(Number).filter(Number.isFinite) : [];
    if(clean.length < 2){
      return 0;
    }
    const mean = clean.reduce((sum, value) => sum + value, 0) / clean.length;
    const ss = clean.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0);
    return ss / (clean.length - 1);
  }

  function resolveRocZCritical(alpha = 0.05){
    const safeAlpha = Number.isFinite(alpha) && alpha > 0 && alpha < 1 ? alpha : 0.05;
    if(global.jStat?.normal && typeof global.jStat.normal.inv === 'function'){
      const quantile = global.jStat.normal.inv(1 - (safeAlpha / 2), 0, 1);
      if(Number.isFinite(quantile)){
        return quantile;
      }
    }
    return 1.959963984540054;
  }

  function computeWilsonInterval(successes, total, alpha = 0.05){
    const n = Number(total);
    const x = Number(successes);
    if(!Number.isFinite(n) || !Number.isFinite(x) || n <= 0){
      return null;
    }
    const p = Math.max(0, Math.min(1, x / n));
    const z = resolveRocZCritical(alpha);
    const z2 = z * z;
    const denom = 1 + (z2 / n);
    const centre = (p + (z2 / (2 * n))) / denom;
    const spread = (z / denom) * Math.sqrt(((p * (1 - p)) / n) + (z2 / (4 * n * n)));
    return {
      low: Math.max(0, centre - spread),
      high: Math.min(1, centre + spread)
    };
  }

  function computeSingleAucUncertainty(pairs, alpha = 0.05){
    const clean = Array.isArray(pairs) ? pairs.filter(pair => Number.isFinite(pair?.score) && (pair?.label === 0 || pair?.label === 1)) : [];
    const positives = clean.filter(pair => pair.label === 1).map(pair => pair.score);
    const negatives = clean.filter(pair => pair.label === 0).map(pair => pair.score);
    const m = positives.length;
    const n = negatives.length;
    if(m < 1 || n < 1){
      return null;
    }
    const kernel = (positive, negative) => {
      if(positive > negative){ return 1; }
      if(positive === negative){ return 0.5; }
      return 0;
    };
    const v10 = positives.map(score => negatives.reduce((sum, negative) => sum + kernel(score, negative), 0) / n);
    const v01 = negatives.map(score => positives.reduce((sum, positive) => sum + kernel(positive, score), 0) / m);
    const auc = v10.reduce((sum, value) => sum + value, 0) / m;
    const variance = (computeSampleVariance(v10) / m) + (computeSampleVariance(v01) / n);
    const se = variance >= 0 ? Math.sqrt(variance) : NaN;
    const z = resolveRocZCritical(alpha);
    const ciLow = Number.isFinite(se) ? Math.max(0, auc - (z * se)) : NaN;
    const ciHigh = Number.isFinite(se) ? Math.min(1, auc + (z * se)) : NaN;
    return {
      auc,
      se,
      ciLow,
      ciHigh,
      method: 'DeLong-style'
    };
  }

  function buildRocThresholdMetricsTable(pairs, alpha = 0.05){
    const clean = Array.isArray(pairs) ? pairs.filter(pair => Number.isFinite(pair?.score) && (pair?.label === 0 || pair?.label === 1)) : [];
    if(!clean.length){
      return [];
    }
    const sorted = clean.slice().sort((a, b) => b.score - a.score);
    const positives = sorted.reduce((sum, pair) => sum + (pair.label === 1 ? 1 : 0), 0);
    const negatives = sorted.length - positives;
    let tp = 0;
    let fp = 0;
    let tn = negatives;
    let fn = positives;
    const rows = [];
    for(let index = 0; index < sorted.length; ){
      const threshold = sorted[index].score;
      while(index < sorted.length && sorted[index].score === threshold){
        const current = sorted[index];
        if(current.label === 1){
          tp += 1;
          fn -= 1;
        }else{
          fp += 1;
          tn -= 1;
        }
        index += 1;
      }
      const sensitivity = positives > 0 ? tp / positives : NaN;
      const specificity = negatives > 0 ? tn / negatives : NaN;
      const ppv = (tp + fp) > 0 ? tp / (tp + fp) : NaN;
      const npv = (tn + fn) > 0 ? tn / (tn + fn) : NaN;
      const accuracy = sorted.length > 0 ? (tp + tn) / sorted.length : NaN;
      const lrPositive = Number.isFinite(sensitivity) && Number.isFinite(specificity) && specificity < 1
        ? sensitivity / (1 - specificity)
        : Infinity;
      const lrNegative = Number.isFinite(sensitivity) && Number.isFinite(specificity) && specificity > 0
        ? (1 - sensitivity) / specificity
        : Infinity;
      rows.push({
        threshold,
        tp,
        fp,
        tn,
        fn,
        sensitivity,
        specificity,
        ppv,
        npv,
        accuracy,
        lrPositive,
        lrNegative,
        sensitivityCi: computeWilsonInterval(tp, positives, alpha),
        specificityCi: computeWilsonInterval(tn, negatives, alpha),
        ppvCi: computeWilsonInterval(tp, tp + fp, alpha),
        npvCi: computeWilsonInterval(tn, tn + fn, alpha)
      });
    }
    return rows;
  }

  function bootstrapCurveTest(pairs, baseline, graphType, iters = 200){
    let count = 0;
    const n = pairs.length;
    for(let b = 0; b < iters; b += 1){
      const sample = Array.from({length: n}, () => pairs[Math.floor(Math.random() * n)]);
      const metric = computeCurveMetric(sample, graphType);
      if(metric <= baseline){
        count += 1;
      }
    }
    const p = (count + 1) / (iters + 1);
    if(global.DEBUG_ROC){
      console.debug('Debug: ROC bootstrap test', {baseline, graphType, iters, p});
    }
    return p;
  }

  function bootstrapCurveDiff(pairs1, pairs2, graphType, iters = 200){
    const n = pairs1.length;
    const diffs = [];
    const baseDiff = computeCurveMetric(pairs1, graphType) - computeCurveMetric(pairs2, graphType);
    for(let b = 0; b < iters; b += 1){
      const sample1 = [];
      const sample2 = [];
      for(let i = 0; i < n; i += 1){
        const idx = Math.floor(Math.random() * n);
        sample1.push(pairs1[idx]);
        sample2.push(pairs2[idx]);
      }
      diffs.push(computeCurveMetric(sample1, graphType) - computeCurveMetric(sample2, graphType));
    }
    const count = diffs.filter(diff => Math.abs(diff) >= Math.abs(baseDiff)).length;
    diffs.sort((a, b) => a - b);
    const lower = diffs[Math.floor(0.025 * iters)] ?? diffs[0];
    const upper = diffs[Math.floor(0.975 * iters)] ?? diffs[diffs.length - 1];
    const p = (count + 1) / (iters + 1);
    if(global.DEBUG_ROC){
      console.debug('Debug: ROC bootstrap diff', {graphType, iters, p, ci: [lower, upper]});
    }
    return {p, ci: [lower, upper], diff: baseDiff};
  }

  function permutationCurveDiff(pairs1, pairs2, graphType, iters = 200){
    const n = pairs1.length;
    const baseDiff = computeCurveMetric(pairs1, graphType) - computeCurveMetric(pairs2, graphType);
    let count = 0;
    for(let b = 0; b < iters; b += 1){
      const sample1 = [];
      const sample2 = [];
      for(let i = 0; i < n; i += 1){
        if(Math.random() < 0.5){
          sample1.push(pairs1[i]);
          sample2.push(pairs2[i]);
        }else{
          sample1.push({label: pairs1[i].label, score: pairs2[i].score});
          sample2.push({label: pairs2[i].label, score: pairs1[i].score});
        }
      }
      const diff = computeCurveMetric(sample1, graphType) - computeCurveMetric(sample2, graphType);
      if(Math.abs(diff) >= Math.abs(baseDiff)){
        count += 1;
      }
    }
    const p = (count + 1) / (iters + 1);
    if(global.DEBUG_ROC){
      console.debug('Debug: ROC permutation diff', {graphType, iters, p});
    }
    return {p, diff: baseDiff};
  }

  function delongCurveDiff(pairs1, pairs2){
    const pos1 = pairs1.filter(p => p.label === 1).map(p => p.score);
    const neg1 = pairs1.filter(p => p.label === 0).map(p => p.score);
    const pos2 = pairs2.filter(p => p.label === 1).map(p => p.score);
    const neg2 = pairs2.filter(p => p.label === 0).map(p => p.score);
    const m = pos1.length;
    const n = neg1.length;

    function calcV(pos, neg){
      const V10 = [];
      const V01 = [];
      for(const ps of pos){
        let lt = 0;
        let eq = 0;
        for(const ns of neg){
          if(ps > ns) lt += 1;
          else if(ps === ns) eq += 1;
        }
        V10.push((lt + 0.5 * eq) / neg.length);
      }
      for(const ns of neg){
        let gt = 0;
        let eq = 0;
        for(const ps of pos){
          if(ps > ns) gt += 1;
          else if(ps === ns) eq += 1;
        }
        V01.push((gt + 0.5 * eq) / pos.length);
      }
      const auc = V10.reduce((sum, val) => sum + val, 0) / pos.length;
      return {V10, V01, auc};
    }

    const a1 = calcV(pos1, neg1);
    const a2 = calcV(pos2, neg2);

    function cov(a, b){
      const meanA = global.jStat.mean(a);
      const meanB = global.jStat.mean(b);
      let sum = 0;
      for(let i = 0; i < a.length; i += 1){
        sum += (a[i] - meanA) * (b[i] - meanB);
      }
      return sum / (a.length - 1);
    }

    const s10 = [
      [cov(a1.V10, a1.V10), cov(a1.V10, a2.V10)],
      [cov(a2.V10, a1.V10), cov(a2.V10, a2.V10)]
    ];
    const s01 = [
      [cov(a1.V01, a1.V01), cov(a1.V01, a2.V01)],
      [cov(a2.V01, a1.V01), cov(a2.V01, a2.V01)]
    ];
    const var1 = s10[0][0] / m + s01[0][0] / n;
    const var2 = s10[1][1] / m + s01[1][1] / n;
    const covar = s10[0][1] / m + s01[0][1] / n;
    const diff = a1.auc - a2.auc;
    const varDiff = var1 + var2 - 2 * covar;
    const sd = Math.sqrt(varDiff);
    const z = diff / sd;
    const p = 2 * (1 - global.jStat.normal.cdf(Math.abs(z), 0, 1));
    const ci = [diff - 1.96 * sd, diff + 1.96 * sd];
    if(global.DEBUG_ROC){
      console.debug('Debug: ROC delong diff', {diff, p, ci});
    }
    return {p, diff, ci};
  }

  function formatPValue(value){
    const formatter = Shared.formatters?.formatPValue || Shared.formatPValue;
    if(typeof formatter === 'function'){
      return formatter(value);
    }
    if(typeof global.formatP === 'function'){
      return global.formatP(value);
    }
    if(value === undefined || value === null || Number.isNaN(value)){
      return 'n/a';
    }
    if(!Number.isFinite(value)){
      return value > 0 ? 'Infinity' : '-Infinity';
    }
    if(value === 0){
      return '0';
    }
    const num = Number(value);
    const formatted = num.toExponential(5);
    console.debug('Debug: ROC formatPValue fallback',{ input: value, formatted });
    return formatted;
  }

  function formatRocDecimal(value, digits){
    if(value === Infinity){
      return 'Inf';
    }
    if(value === -Infinity){
      return '-Inf';
    }
    if(!Number.isFinite(value)){
      return '—';
    }
    const places=Number.isFinite(digits)?digits:3;
    return Number(value).toFixed(places);
  }

  function formatRocPercent(value, digits){
    if(!Number.isFinite(value)){
      return '—';
    }
    const places=Number.isFinite(digits)?digits:1;
    return `${(value*100).toFixed(places)}%`;
  }

  function formatRocInterval(interval, formatter){
    if(!interval || !Number.isFinite(interval.low) || !Number.isFinite(interval.high)){
      return '—';
    }
    const formatValue = typeof formatter === 'function'
      ? formatter
      : (value => formatRocDecimal(value, 3));
    return `${formatValue(interval.low)} to ${formatValue(interval.high)}`;
  }

  function renderRocStatsSummary(stats, graphType){
    if(!refs.statsResults){
      return;
    }
    clearRocStatsReportHost();
    refs.statsResults.innerHTML='';
    if(!Array.isArray(stats) || !stats.length){
      const message=document.createElement('div');
      message.className='stats-table-lead';
      message.textContent='Add at least one labeled score column to view summary statistics.';
      refs.statsResults.appendChild(message);
      return;
    }
    const hasStatsTable=Shared.statsTable && typeof Shared.statsTable.render==='function';
    const summaryColumns=[
      { key:'series', label:'Series', align:'left' },
      { key:'auc', label:graphType==='roc'?'AUC':'Area', align:'right' }
    ];
    if(graphType==='roc'){
      summaryColumns.push(
        { key:'aucSe', label:'AUC SE', align:'right' },
        { key:'aucCi', label:'AUC 95% CI', align:'right' }
      );
    }else{
      summaryColumns.push({ key:'ap', label:'Average Precision', align:'right' });
    }
    summaryColumns.push({ key:'p', label:'p value', align:'right' });
    if(graphType==='roc'){
      summaryColumns.push(
        { key:'threshold', label:'Best threshold', align:'right' },
        { key:'sensitivity', label:'Sensitivity', align:'right' },
        { key:'specificity', label:'Specificity', align:'right' },
        { key:'ppv', label:'PPV', align:'right' },
        { key:'npv', label:'NPV', align:'right' },
        { key:'lrPositive', label:'LR+', align:'right' },
        { key:'lrNegative', label:'LR-', align:'right' },
        { key:'accuracy', label:'Accuracy', align:'right' },
        { key:'f1', label:'F1 score', align:'right' }
      );
    }else{
      summaryColumns.push(
        { key:'threshold', label:'Best threshold', align:'right' },
        { key:'accuracy', label:'Accuracy', align:'right' },
        { key:'precision', label:'Precision', align:'right' },
        { key:'recall', label:'Recall', align:'right' },
        { key:'f1', label:'F1 score', align:'right' }
      );
    }
    const rows=stats.map(stat=>({
      series:stat.name,
      auc:formatRocDecimal(stat.auc,3),
      aucSe:graphType==='roc' ? formatRocDecimal(stat.aucSe,4) : undefined,
      aucCi:graphType==='roc'
        ? formatRocInterval(
          Number.isFinite(stat.aucCiLow) && Number.isFinite(stat.aucCiHigh)
            ? { low: stat.aucCiLow, high: stat.aucCiHigh }
            : null,
          value => formatRocDecimal(value, 3)
        )
        : undefined,
      ap:graphType==='pr' && Number.isFinite(stat.avgPrecision)?formatRocDecimal(stat.avgPrecision,3):graphType==='pr'?'—':undefined,
      p:formatPValue(stat.pVal),
      threshold:Number.isFinite(stat.thr)?stat.thr.toFixed(3):'—',
      sensitivity:graphType==='roc' ? formatRocPercent(stat.recall) : undefined,
      specificity:graphType==='roc' ? formatRocPercent(stat.specificity) : undefined,
      ppv:graphType==='roc' ? formatRocPercent(stat.precision) : undefined,
      npv:graphType==='roc' ? formatRocPercent(stat.npv) : undefined,
      lrPositive:graphType==='roc' ? formatRocDecimal(stat.lrPositive,3) : undefined,
      lrNegative:graphType==='roc' ? formatRocDecimal(stat.lrNegative,3) : undefined,
      accuracy:formatRocPercent(stat.accuracy),
      precision:graphType==='pr' ? formatRocPercent(stat.precision) : undefined,
      recall:graphType==='pr' ? formatRocPercent(stat.recall) : undefined,
      f1:formatRocPercent(stat.f1)
    }));
    const footnotes=[
      graphType==='roc'
        ? 'AUC integrates the ROC curve relative to the 0.5 no-skill baseline.'
        : 'Area and Average Precision integrate the precision–recall curve relative to the positive rate.',
      'Best threshold is the cutoff that maximizes the F1 score for each series.'
    ];
    if(graphType==='roc'){
      footnotes.push('AUC SE and 95% CI use a DeLong-style nonparametric variance estimate.');
      footnotes.push('Cutoff tables include Wilson 95% confidence intervals for sensitivity, specificity, PPV, and NPV.');
    }
    const model={
      caption:graphType==='roc'?'ROC metrics':'Precision–Recall metrics',
      advanced:false,
      columns:summaryColumns,
      rows,
      footnotes,
      options:{
        fileName:graphType==='roc'?'roc-statistics':'pr-statistics',
        contextLabel:'roc-stats-summary'
      }
    };
    const thresholdTableColumns = [
      { key:'threshold', label:'Threshold', align:'right' },
      { key:'sensitivity', label:'Sensitivity (95% CI)', align:'right' },
      { key:'specificity', label:'Specificity (95% CI)', align:'right' },
      { key:'ppv', label:'PPV (95% CI)', align:'right' },
      { key:'npv', label:'NPV (95% CI)', align:'right' },
      { key:'lrPositive', label:'LR+', align:'right' },
      { key:'lrNegative', label:'LR-', align:'right' },
      { key:'accuracy', label:'Accuracy', align:'right' }
    ];
    const buildThresholdRows = thresholdRows => thresholdRows.map(row => ({
      threshold: formatRocDecimal(row.threshold, 3),
      sensitivity: `${formatRocPercent(row.sensitivity)} (${formatRocInterval(row.sensitivityCi, value => formatRocPercent(value))})`,
      specificity: `${formatRocPercent(row.specificity)} (${formatRocInterval(row.specificityCi, value => formatRocPercent(value))})`,
      ppv: `${formatRocPercent(row.ppv)} (${formatRocInterval(row.ppvCi, value => formatRocPercent(value))})`,
      npv: `${formatRocPercent(row.npv)} (${formatRocInterval(row.npvCi, value => formatRocPercent(value))})`,
      lrPositive: formatRocDecimal(row.lrPositive, 3),
      lrNegative: formatRocDecimal(row.lrNegative, 3),
      accuracy: formatRocPercent(row.accuracy)
    }));
    const appendThresholdTables = useSharedTable => {
      if(graphType !== 'roc'){
        return;
      }
      stats.forEach(stat => {
        const thresholdRows = Array.isArray(stat.thresholdRows) ? stat.thresholdRows : [];
        if(!thresholdRows.length){
          return;
        }
        const thresholdModel = {
          caption: `${stat.name}: cutoff-by-cutoff metrics`,
          advanced: true,
          columns: thresholdTableColumns,
          rows: buildThresholdRows(thresholdRows),
          footnotes: ['Rows reflect score cutoffs applied as score ≥ threshold.'],
          options: {
            fileName: `${String(stat.name || 'roc').replace(/[^a-z0-9_-]+/gi, '_').toLowerCase()}-threshold-metrics`,
            contextLabel: 'roc-threshold-metrics'
          }
        };
        if(useSharedTable){
          Shared.statsTable.render({ target: refs.statsResults, ...thresholdModel, append: true });
          return;
        }
        const caption=document.createElement('div');
        caption.className='stats-table-lead';
        caption.textContent=thresholdModel.caption;
        refs.statsResults.appendChild(caption);
        const table=document.createElement('table');
        table.className='stats-table stats-table--fallback';
        table.innerHTML = `<thead><tr>${thresholdModel.columns.map(col => `<th>${col.label}</th>`).join('')}</tr></thead><tbody>${
          thresholdModel.rows.map(row => `<tr>${thresholdModel.columns.map(col => `<td>${row[col.key] ?? ''}</td>`).join('')}</tr>`).join('')
        }</tbody>`;
        refs.statsResults.appendChild(table);
      });
    };
    if(hasStatsTable){
      Shared.statsTable.render({ target:refs.statsResults, ...model });
      appendThresholdTables(true);
      console.debug('Debug: roc stats rendered via Shared.statsTable',{ graphType, rowCount:rows.length });
      return;
    }
    rows.forEach(row=>{
      const paragraph=document.createElement('p');
      const metrics=[
        `${graphType==='roc'?'AUC':'Area'} ${row.auc}`,
        graphType==='pr' && row.ap ? `AP ${row.ap}` : null,
        `p ${row.p}`,
        `Thr ${row.threshold}`,
        graphType==='roc' ? `Sens ${row.sensitivity}` : null,
        graphType==='roc' ? `Spec ${row.specificity}` : null,
        graphType==='roc' ? `PPV ${row.ppv}` : null,
        graphType==='roc' ? `NPV ${row.npv}` : null,
        `Acc ${row.accuracy}`,
        graphType==='pr' ? `Prec ${row.precision}` : null,
        graphType==='pr' ? `Recall ${row.recall}` : null,
        `F1 ${row.f1}`
      ].filter(Boolean);
      paragraph.textContent=`${row.series}: ${metrics.join(', ')}`;
      refs.statsResults.appendChild(paragraph);
    });
    const footnoteBlock=document.createElement('div');
    footnoteBlock.className='stats-table-footnotes';
    footnotes.forEach(note=>{
      const item=document.createElement('div');
      item.className='stats-table-footnote';
      item.textContent=note;
      footnoteBlock.appendChild(item);
    });
    refs.statsResults.appendChild(footnoteBlock);
    console.debug('Debug: roc stats fallback rendered',{ graphType, rowCount:rows.length });
    appendThresholdTables(false);
  }


  function appendRocReportPanel(stats, graphType, diffResult){
    if(!refs.statsResults || !Array.isArray(stats) || !stats.length || !(Shared.statsReporting && typeof Shared.statsReporting.appendReportPanel==='function')){
      return;
    }
    const primary = stats[0] || null;
    const compareText = state.compareResult && state.compareResult.textContent ? state.compareResult.textContent.trim() : '';
    Shared.statsReporting.appendReportPanel(refs.statsResults, {
      methodsText: `${graphType === 'roc' ? 'ROC' : 'Precision–recall'} summary statistics were computed for ${stats.length} series. ${graphType === 'roc' ? 'AUC uncertainty used a DeLong-style nonparametric variance estimate, and cutoff tables reported Wilson confidence intervals for diagnostic rates.' : 'Curve comparison used the selected resampling method when requested.'}`,
      resultsText: [
        `${stats.length} series were analysed.`,
        primary ? `${primary.name} yielded ${graphType === 'roc' ? 'AUC' : 'area'} = ${formatRocDecimal(primary.auc,3)}${graphType === 'roc' && Number.isFinite(primary.aucCiLow) && Number.isFinite(primary.aucCiHigh) ? ` (95% CI ${formatRocDecimal(primary.aucCiLow,3)} to ${formatRocDecimal(primary.aucCiHigh,3)})` : ''} and p = ${formatPValue(primary.pVal)}.` : null,
        graphType === 'roc' && primary && Array.isArray(primary.thresholdRows) ? `${primary.thresholdRows.length} cutoff row(s) were tabulated for ${primary.name}.` : null,
        compareText || null
      ].filter(Boolean).join(' '),
      analysisSpec: {
        component: 'roc',
        graphType,
        seriesCount: stats.length,
        cutoffRows: stats.reduce((sum, stat) => sum + (Array.isArray(stat.thresholdRows) ? stat.thresholdRows.length : 0), 0),
        diffMethod: state.diffMethod,
        compareSelection: state.compareSelection || state.compareSel?.value || null,
        compared: !!compareText,
        differenceSummary: diffResult ? {
          diff: Number.isFinite(diffResult.diff) ? Number(diffResult.diff) : null,
          p: Number.isFinite(diffResult.p) ? Number(diffResult.p) : null,
          ci: Array.isArray(diffResult.ci) ? diffResult.ci : null
        } : null
      }
    }, { title: 'Reporting and reproducibility' });
  }

  async function runRocDrawCycle(){
    let status = 'complete';
    try{
      await drawRoc();
    }catch(err){
      status = 'error';
      throw err;
    }finally{
      resolveRocOverlay(status);
    }
  }

  async function drawRoc(){
    if(!state.hot || !refs.plotDiv){
      return;
    }
    const debugStamp = Date.now();
    console.debug('Debug: drawRoc start', {debugStamp}); // Debug: draw entry
    const graphType = refs.graphType?.value || 'roc';
    if(state.titleText == null){
      state.titleText = graphType === 'pr' ? 'Precision-Recall curve' : 'ROC curve';
    }
    const borderWidthRaw = Number(state.borderWidth) || DEFAULT_ROC_BORDER_WIDTH;
    const showGrid = !!refs.showGrid?.checked;
    const showFrame = !!refs.showFrame?.checked;
    console.debug('Debug: roc showFrame state',{showFrame});
    const containerRect=refs.svgBox?.getBoundingClientRect?.();
    const fontInfo=chartStyle.resolveScaledFontSize({
      rawSize: refs.fontSize?.value,
      width: containerRect?.width,
      height: containerRect?.height,
      svgBox: refs.svgBox,
      input: refs.fontSize
    });
    const fontSize=fontInfo.scaledPx;
    const styleScaleInfo=fontInfo.scaleInfo;
    const axisStrokeWidthBase = getAxisStrokeWidthBase();
    const axisStrokeWidth = chartStyle.scaleStrokeWidth(axisStrokeWidthBase, styleScaleInfo, { context: 'roc-axis', min: 0, exact: true });
    const axisStroke = getAxisColor();
    const gridStyleBase = getGridStyle(axisStrokeWidthBase);
    const gridStrokeStyle = Object.assign({}, gridStyleBase, {
      thickness: chartStyle.scaleStrokeWidth(gridStyleBase.thickness, styleScaleInfo, { context: 'roc-grid', min: 0 })
    });
    const gridStrokeAttrs = (gridControls && typeof gridControls.getStrokeAttributes === 'function')
      ? gridControls.getStrokeAttributes(gridStrokeStyle, { fallbackColor: DEFAULT_GRID_COLOR, fallbackThickness: axisStrokeWidth })
      : { stroke: DEFAULT_GRID_COLOR, 'stroke-width': axisStrokeWidth };
    const borderWidthPx=chartStyle.scaleStrokeWidth(borderWidthRaw, styleScaleInfo, { context: 'roc-curve', min: 0 });
    console.debug('Debug: roc style scaling applied',{
      borderWidthRaw,
      borderWidthPx,
      axisStrokeWidth,
      axisStrokeWidthBase,
      axisStroke,
      styleScale: styleScaleInfo?.styleScale
    }); // Debug: ROC style scaling summary
    if(refs.fontSizeVal){ chartStyle.renderFontSizeLabel({ element: refs.fontSizeVal, fontInfo, input: refs.fontSize }); }
    console.debug('Debug: roc font scaling applied',{
      input:refs.fontSize?.value,
      fontSizePt:fontInfo.pt,
      baseFontPx:fontInfo.px,
      scaledFontPx:fontSize,
      scale:styleScaleInfo?.styleScale || styleScaleInfo?.scale,
      containerWidth:containerRect?.width,
      containerHeight:containerRect?.height
    });
    const axisMetrics = chartStyle.createAxisMetrics(fontInfo.px, styleScaleInfo);
    console.debug('Debug: roc axis metrics',axisMetrics);
    const fontScale=styleScaleInfo?.styleScale || styleScaleInfo?.scale || 1;
    const data = typeof state.hot?.getIncludedDataMatrix === 'function'
      ? state.hot.getIncludedDataMatrix()
      : (Shared.hot?.getIncludedDataMatrix ? Shared.hot.getIncludedDataMatrix(state.hot) : []);
    if(!data || !data.length){
      clearPlotArea('no-table');
      return;
    }
    const bodyRows = data.slice(1);
    const hasRowContent = bodyRows.some(row => Array.isArray(row) && row.some(cell => {
      if(cell === null || typeof cell === 'undefined'){ return false; }
      if(typeof cell === 'number'){ return !Number.isNaN(cell); }
      const text = String(cell);
      return text.trim().length > 0;
    }));
    if(!hasRowContent){
      clearPlotArea('empty-rows');
      return;
    }
    const header = data[0] || [];
    let labelIndex = header.findIndex(h => String(h).trim().toLowerCase() === 'label');
    if(labelIndex < 0){
      labelIndex = 0;
    }
    const labels = bodyRows.map(row => parseFloat(row[labelIndex]));
    const positives = labels.filter(val => !Number.isNaN(val) && val > 0).length;
    const negatives = labels.filter(val => !Number.isNaN(val) && val <= 0).length;
    if(positives === 0 && negatives === 0){
      clearPlotArea('no-labels');
      return;
    }
    const scoreColumns = header
      .map((_, idx) => idx)
      .filter(idx => idx !== labelIndex && header[idx] != null && String(header[idx]).trim() !== '');
    const series = scoreColumns.map((colIdx, index) => ({
      name: header[colIdx] || `Model ${index + 1}`,
      scores: bodyRows.map(row => parseFloat(row[colIdx]))
    }));
    if(!series.length){
      clearPlotArea('no-series');
      return;
    }
    const hasValidScores = series.some(serie => serie.scores.some(score => !Number.isNaN(score)));
    if(!hasValidScores){
      clearPlotArea('no-scores');
      return;
    }

    const pairCountsForAdvisor = series.map(serie => {
      const scores = Array.isArray(serie.scores) ? serie.scores : [];
      let count = 0;
      for(let idx = 0; idx < scores.length; idx += 1){
        const score = scores[idx];
        const label = labels[idx];
        if(!Number.isNaN(score) && !Number.isNaN(label)){
          count += 1;
        }
      }
      return count;
    });
    state.advisorContext = {
      graphType,
      positives,
      negatives,
      seriesCount: series.length,
      pairCounts: pairCountsForAdvisor,
      minPairs: pairCountsForAdvisor.length ? Math.min(...pairCountsForAdvisor) : 0
    };
    renderRocStatsAdvisor(state.advisorContext);

    const legendLabels = series.map(s => s.name);
    ensureLabelColors(legendLabels);

    if(state.compareSel){
      const previous = state.compareSelection || state.compareSel.value || '';
      state.compareSel.innerHTML = '';
      const options = [];
      for(let i = 0; i < series.length; i += 1){
        for(let j = i + 1; j < series.length; j += 1){
          const value = `${i},${j}`;
          const opt = document.createElement('option');
          opt.value = value;
          opt.textContent = `${series[i].name} vs ${series[j].name}`;
          state.compareSel.appendChild(opt);
          options.push(value);
        }
      }
      if(previous && options.includes(previous)){
        state.compareSel.value = previous;
      }else if(options.length){
        state.compareSel.value = options[0];
      }
      const display = options.length ? '' : 'none';
      state.compareSel.style.display = display;
      if(state.compareLabel){
        state.compareLabel.style.display = display;
      }
      if(state.compareResult){
        state.compareResult.style.display = display;
      }
      state.compareSelection = state.compareSel.value;
    }

    const plotEl = refs.plotDiv;
    plotEl.style.display = 'block';
    while(plotEl.firstChild){
      plotEl.removeChild(plotEl.firstChild);
    }
    const width = Math.max(50, Math.floor(plotEl.clientWidth || 50));
    const height = Math.max(40, Math.floor(plotEl.clientHeight || 40));
    plotEl.style.position = 'relative';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('id', 'rocSvg');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('font-family', chartStyle.FONT_FAMILY);
    svg.dataset.fontScope = 'roc';
    console.debug('Debug: roc svg dataset scope assigned', { scope: svg.dataset.fontScope }); // Debug: svg font scope tagging
    chartStyle.applySvgDefaults(svg);
    plotEl.appendChild(svg);
    if(fontControls && typeof fontControls.enableForSvg === 'function'){
      fontControls.enableForSvg(svg,{ scopeId: 'roc' });
      console.debug('Debug: roc fontControls enableForSvg invoked',{ width, height }); // Debug: font toolbar binding
    } else {
      console.debug('Debug: roc fontControls enableForSvg missing',{ hasFontControls: !!fontControls }); // Debug: font toolbar missing
    }

    ensureRocLegendControlPlacement();
    const showLegend = !refs.showLegend || !!refs.showLegend.checked;
    console.debug('Debug: roc showLegend state',{ showLegend });
    const legendEntries = showLegend ? legendLabels.map((label, index) => ({
      label,
      fill: state.labelColors[label] || DEFAULT_SCATTER_COLORS[index % DEFAULT_SCATTER_COLORS.length],
      key: label,
      editable: true
    })) : [];
    const legendLayout = chartStyle.computeLegendLayout({
      entries: legendEntries,
      fontSize,
      strokeWidth: borderWidthPx,
      onSwatchClick: ({ entry, swatch, event }) => {
        const labelKey = entry?.key || entry?.label;
        if(!labelKey || !swatch){ return; }
        if(event){ event.stopPropagation(); }
        const currentColor = state.labelColors[labelKey] || entry.fill;
        let previousColor = currentColor;
        Shared.openColorPicker({
          anchor: swatch,
          color: currentColor,
          onInput(value){
            previousColor = typeof value === 'string' && value ? value : previousColor;
            applyRocLabelColor(labelKey, value);
            console.debug('Debug: ROC legend color input',{ label: labelKey, color: value });
          },
          onChange(value){
            const nextValue = typeof value === 'string' && value ? value : previousColor;
            if(nextValue === previousColor){
              return;
            }
            applyRocLabelColor(labelKey, nextValue);
            recordRocChange(`roc:legend-color:${labelKey}`, previousColor, nextValue, val => applyRocLabelColor(labelKey, val));
            previousColor = nextValue;
          }
        });
      }
    });
    const legendRenderer = legendLayout.renderer || { entries: [], rowGap: 0, swatchSize: 0, swatchGap: 0, baselineOffset: 0 };
    const legendVisible = showLegend && legendRenderer.entries.length > 0;
    const legendWidth = legendVisible ? legendLayout.legendWidthForMargin : 0;
    console.debug('Debug: roc legend layout metrics',{
      legendWidth,
      legendGap: legendLayout.legendGapPx,
      legendCount: legendRenderer.entries.length,
      legendVisible
    });
    const buildTicks = (count) => {
      const steps = Math.max(count - 1, 1);
      const list = Array.from({ length: steps + 1 }, (_, idx) => {
        if(steps === 0) return 0;
        const value = idx / steps;
        return Number(value.toFixed(4));
      });
      if(list[list.length - 1] !== 1){
        list[list.length - 1] = 1;
      }
      return list;
    };
    let tickCount = chartStyle.estimateTickCount(Math.min(width, height), { axis: graphType, fallback: 6, min: 3, max: 11 });
    const formatTick = value => chartStyle.formatScientific(value,{maxDecimals:2});
    const rocFontStyles = exportFontStyles('roc');
    const xTickMeasureFont = (chartStyle && typeof chartStyle.resolveScopedLabelMeasureFont === 'function')
      ? chartStyle.resolveScopedLabelMeasureFont({ styles: rocFontStyles, role: 'xTick', fallbackPx: fontSize }).fontSpec
      : chartStyle.makeFont(fontSize);
    const yTickMeasureFont = (chartStyle && typeof chartStyle.resolveScopedLabelMeasureFont === 'function')
      ? chartStyle.resolveScopedLabelMeasureFont({ styles: rocFontStyles, role: 'yTick', fallbackPx: fontSize }).fontSpec
      : chartStyle.makeFont(fontSize);
    const tickFont = yTickMeasureFont;
    const axisLabelFont = chartStyle.makeFont(fontSize);
    const xAxisLabel = graphType === 'roc' ? 'False Positive Rate' : 'Recall';
    const yAxisLabel = graphType === 'roc' ? 'True Positive Rate' : 'Precision';
    const yTitleWidth = chartStyle.measureText(yAxisLabel, axisLabelFont);
    const manualIntervalX = getAxisTickInterval('x');
    const manualIntervalY = getAxisTickInterval('y');
    const manualXTicks = buildManualTicksNormalized(manualIntervalX)?.ticks || null;
    const manualYTicks = buildManualTicksNormalized(manualIntervalY)?.ticks || null;
    let xTicks = manualXTicks || buildTicks(tickCount);
    let yTicks = manualYTicks || buildTicks(tickCount);
    let yTickLabels = yTicks.map(formatTick);
    let xTickLabels = xTicks.map(formatTick);
    let yLabelWidths = yTickLabels.map(lbl => chartStyle.measureText(lbl, tickFont));
    let maxYLabelWidth = Math.max(...yLabelWidths, 0);
    let margin = chartStyle.computeBaseMargins({fontSize, legendWidth, maxYLabelWidth, yTitleWidth, axisMetrics});
    let plotWidth = Math.max(20, width - margin.left - margin.right);
    let plotHeight = Math.max(20, height - margin.top - margin.bottom);
    let bottomLayout = chartStyle.computeBottomLayout({labels: xTickLabels, fontSize, labelMeasureFont: xTickMeasureFont, plotWidth, baseBottom: margin.bottom, axisMetrics});
    margin.bottom = bottomLayout.bottom;
    plotWidth = Math.max(20, width - margin.left - margin.right);
    plotHeight = Math.max(20, height - margin.top - margin.bottom);
    for(let pass=0; pass<2; pass++){
      const refinedCount = chartStyle.estimateTickCount(Math.min(plotWidth, plotHeight), { axis: graphType, fallback: tickCount, min: 3, max: 11 });
      console.debug('Debug: roc tick target evaluation',{pass,tickCount,refinedCount,plotWidth,plotHeight, manualIntervalX, manualIntervalY});
      if((manualXTicks || manualYTicks) || refinedCount === tickCount){
        break;
      }
      tickCount = refinedCount;
      xTicks = manualXTicks || buildTicks(tickCount);
      yTicks = manualYTicks || buildTicks(tickCount);
      yTickLabels = yTicks.map(formatTick);
      xTickLabels = xTicks.map(formatTick);
      yLabelWidths = yTickLabels.map(lbl => chartStyle.measureText(lbl, tickFont));
      maxYLabelWidth = Math.max(...yLabelWidths, 0);
      margin = chartStyle.computeBaseMargins({fontSize, legendWidth, maxYLabelWidth, yTitleWidth, axisMetrics});
      plotWidth = Math.max(20, width - margin.left - margin.right);
      plotHeight = Math.max(20, height - margin.top - margin.bottom);
      bottomLayout = chartStyle.computeBottomLayout({labels: xTickLabels, fontSize, labelMeasureFont: xTickMeasureFont, plotWidth, baseBottom: margin.bottom, axisMetrics});
      margin.bottom = bottomLayout.bottom;
      plotWidth = Math.max(20, width - margin.left - margin.right);
      plotHeight = Math.max(20, height - margin.top - margin.bottom);
    }
    console.debug('Debug: roc tick targets',{tickCount, tickSteps: Math.max(tickCount - 1, 1), xTickCount: xTicks.length, yTickCount: yTicks.length}); // Debug: ROC tick density summary
    const aspectData = refs.svgBox?.dataset;
    const shouldLockAspect = aspectData?.resizerAspectLocked === 'true';
    console.debug('Debug: roc aspect ratio decision',{shouldLockAspect,storedRatio:aspectData?.resizerAspectRatio}); // Debug: roc aspect toggle decision
    if(shouldLockAspect){
      const square = chartStyle.ensureSquarePlot(width, height, margin);
      margin = square.margin;
      plotWidth = square.plotW;
      plotHeight = square.plotH;
      if(aspectData){
        const derivedRatio = plotHeight > 0 ? plotWidth / plotHeight : NaN;
        if(Number.isFinite(derivedRatio)){
          aspectData.resizerAspectRatio = String(derivedRatio);
        }
      }
      console.debug('Debug: roc layout (locked)',{margin,plotWidth,plotHeight,rotate:bottomLayout.shouldRotate}); // Debug: roc square enforcement branch
    }else{
      console.debug('Debug: roc layout (unlocked)',{margin,plotWidth,plotHeight,rotate:bottomLayout.shouldRotate}); // Debug: roc free resize branch
    }

    const xToPx = value => margin.left + plotWidth * value;
    const yToPx = value => margin.top + plotHeight * (1 - value);

    function add(tag, attrs, text, options){
      const element = document.createElementNS(NS, tag);
      Object.entries(attrs).forEach(([key, val]) => {
        element.setAttribute(key, String(val));
      });
      if(text != null){
        element.textContent = text;
      }
      svg.appendChild(element);
      if(tag === 'text' && element){
        const role = options?.role || null;
        const key = options?.key || role || null;
        if(role || key){
          markFontEditable(element, role, key);
        }
      }
      return element;
    }

    if(showGrid){
      xTicks.forEach(tick => {
        const x = xToPx(tick);
        const gridLine = add('line', Object.assign({x1: x, y1: margin.top, x2: x, y2: margin.top + plotHeight}, gridStrokeAttrs));
        gridLine.setAttribute('data-grid-control', '1');
      });
      yTicks.forEach(tick => {
        const y = yToPx(tick);
        const gridLine = add('line', Object.assign({x1: margin.left, y1: y, x2: margin.left + plotWidth, y2: y}, gridStrokeAttrs));
        gridLine.setAttribute('data-grid-control', '1');
      });
      console.debug('Debug: roc grid stroke scaled',{xTickCount: xTicks.length, yTickCount: yTicks.length, gridStrokeStyle});
    }

    const xTickPositions = xTicks.map(tick => xToPx(tick));
    const yTickPositions = yTicks.map(tick => yToPx(tick));
    let axisXStart = xTickPositions.length ? Math.min(...xTickPositions) : margin.left;
    let axisXEnd = xTickPositions.length ? Math.max(...xTickPositions) : margin.left + plotWidth;
    let axisYStart = yTickPositions.length ? Math.min(...yTickPositions) : margin.top;
    let axisYEnd = yTickPositions.length ? Math.max(...yTickPositions) : margin.top + plotHeight;
    if(axisXStart === axisXEnd){ axisXStart = margin.left; axisXEnd = margin.left + plotWidth; }
    if(axisYStart === axisYEnd){ axisYStart = margin.top; axisYEnd = margin.top + plotHeight; }
    console.debug('Debug: roc axis span', { axisXStart, axisXEnd, axisYStart, axisYEnd });
    const axisControlConfig = axis => ({
      axis,
      scopeId: 'roc',
      getTickInterval: () => getAxisTickInterval(axis),
      getThickness: () => getAxisStrokeWidthBase(),
      getColor: () => getAxisColor(),
      isTickIntervalEnabled: () => true,
      getTickIntervalDisabledMessage: () => 'Tick interval available for probability axes.',
      tickPlaceholder: 'Auto',
      onTickIntervalChange: value => updateAxisTickInterval(axis, value),
      getMinorTicksEnabled: () => getAxisMinorTicksEnabled(axis),
      onMinorTicksChange: value => updateAxisMinorTicks(axis, value),
      isMinorTicksSupported: () => true,
      getMinorTickSubdivisions: () => getAxisMinorTickSubdivisions(axis),
      onMinorTickSubdivisionsChange: value => updateAxisMinorTickSubdivisions(axis, value),
      onThicknessChange: value => updateAxisStrokeWidth(value),
      onColorChange: value => updateAxisColor(value)
    });
    const xAxisLine = add('line', {x1: axisXStart, y1: margin.top + plotHeight, x2: axisXEnd, y2: margin.top + plotHeight, stroke: axisStroke, 'stroke-linecap': 'square', 'stroke-width': axisStrokeWidth});
    if(axisControls && typeof axisControls.registerAxisElement === 'function'){
      axisControls.registerAxisElement(xAxisLine, axisControlConfig('x'));
    }
    const yAxisLine = add('line', {x1: margin.left, y1: axisYStart, x2: margin.left, y2: axisYEnd, stroke: axisStroke, 'stroke-linecap': 'square', 'stroke-width': axisStrokeWidth});
    if(axisControls && typeof axisControls.registerAxisElement === 'function'){
      axisControls.registerAxisElement(yAxisLine, axisControlConfig('y'));
    }
    console.debug('Debug: roc axes stroke scaled',{axisStrokeWidthBase, axisStrokeWidth, axisStroke});
    if(showFrame){
      console.debug('Debug: roc frame request',{stroke:axisStroke, showFrame, axisStrokeWidth}); // Debug: frame styling inputs
      chartStyle.drawPlotFrame({ svg, margin, plotW: plotWidth, plotH: plotHeight, stroke: axisStroke, strokeWidth: axisStrokeWidth, sides: ['top','right'] });
    }
    // Frame closes ROC/PR plot area using axis styling continuity

    if(graphType === 'roc'){
      add('line', {x1: margin.left, y1: margin.top + plotHeight, x2: margin.left + plotWidth, y2: margin.top, stroke: '#888', 'stroke-dasharray': '4,4'});
      console.debug('Debug: roc baseline uses default stroke scaling',{mode:'roc'});
    }else{
      const base = positives / Math.max(1, positives + negatives);
      add('line', {x1: margin.left, y1: yToPx(base), x2: margin.left + plotWidth, y2: yToPx(base), stroke: '#888', 'stroke-dasharray': '4,4'});
      console.debug('Debug: ROC PR baseline',{base});
    }

    const xTickNodes = [];
    const tickLen = axisMetrics.tickLength;
    const tickGap = axisMetrics.tickLabelGap;
    const minorTickStyle = chartStyle.resolveMinorTickStyle({ tickLength: tickLen, strokeWidth: axisStrokeWidth });
    const xDomainMin = xTicks.length ? Math.min(...xTicks, 0) : 0;
    const xDomainMax = xTicks.length ? Math.max(...xTicks, 1) : 1;
    const yDomainMin = yTicks.length ? Math.min(...yTicks, 0) : 0;
    const yDomainMax = yTicks.length ? Math.max(...yTicks, 1) : 1;
    const minorSubdivisionsX = getAxisMinorTickSubdivisions('x');
    const minorSubdivisionsY = getAxisMinorTickSubdivisions('y');
    const minorTicksX = getAxisMinorTicksEnabled('x')
      ? chartStyle.computeMinorTickPositions({
          majorTicks: xTicks,
          min: xDomainMin,
          max: xDomainMax,
          scale: 'linear',
          subdivisions: minorSubdivisionsX
        })
      : [];
    const minorTicksY = getAxisMinorTicksEnabled('y')
      ? chartStyle.computeMinorTickPositions({
          majorTicks: yTicks,
          min: yDomainMin,
          max: yDomainMax,
          scale: 'linear',
          subdivisions: minorSubdivisionsY
        })
      : [];
    if(minorTicksX.length){
      minorTicksX.forEach(value => {
        const x = xToPx(value);
        add('line',{
          x1: x,
          y1: margin.top + plotHeight,
          x2: x,
          y2: margin.top + plotHeight + minorTickStyle.length,
          stroke: axisStroke,
          'stroke-width': minorTickStyle.strokeWidth,
          'stroke-linecap': 'round',
          opacity: minorTickStyle.opacity
        });
      });
    }
    xTicks.forEach(tick => {
      const x = xToPx(tick);
      add('line', {x1: x, y1: margin.top + plotHeight, x2: x, y2: margin.top + plotHeight + tickLen, stroke: axisStroke, 'stroke-width': axisStrokeWidth});
      const extra = Shared.computeAxisLabelYOffset ? Shared.computeAxisLabelYOffset(fontSize, tickLen, tickGap) : 0;
      const txt = add('text', {x, y: margin.top + plotHeight + tickLen + tickGap + extra, 'text-anchor': 'middle', 'font-size': fontSize, fill: chartStyle.TEXT_COLOR}, formatTick(tick), { role: 'xTick' });
      Shared.applyTextBaseline && Shared.applyTextBaseline(txt, 'hanging', fontSize);
      xTickNodes.push(txt);
    });
    chartStyle.applyLabelOrientation(xTickNodes,{angle:-45,anchor:'end',dy:'0.35em',force:bottomLayout.shouldRotate});
    if(minorTicksY.length){
      minorTicksY.forEach(value => {
        const y = yToPx(value);
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
    yTicks.forEach(tick => {
      const y = yToPx(tick);
      add('line', {x1: margin.left - tickLen, y1: y, x2: margin.left, y2: y, stroke: axisStroke, 'stroke-width': axisStrokeWidth});
      add('text', {x: margin.left - (tickLen + tickGap), y, 'text-anchor': 'end', 'font-size': fontSize, 'dominant-baseline': 'middle', fill: chartStyle.TEXT_COLOR}, formatTick(tick), { role: 'yTick' });
    });
    console.debug('Debug: roc ticks stroke scaled',{xTickCount: xTicks.length, yTickCount: yTicks.length, axisStrokeWidth});

    const defaultXLabelX = margin.left + plotWidth / 2;
    const defaultXLabelY = margin.top + plotHeight + bottomLayout.titleOffset;
    const xLabelPos = state.labelPositions?.xLabel;

    // Convert relative positions to absolute if needed for xLabel
    let absoluteXLabelX = defaultXLabelX;
    let absoluteXLabelY = defaultXLabelY;
    if (xLabelPos) {
      if (xLabelPos.relX !== undefined && xLabelPos.relY !== undefined) {
        // Use relative positioning
        absoluteXLabelX = margin.left + xLabelPos.relX * plotWidth;
        absoluteXLabelY = margin.top + plotHeight + xLabelPos.relY * bottomLayout.titleOffset;
      } else if (xLabelPos.x !== undefined && xLabelPos.y !== undefined) {
        // Use absolute positioning (backward compatibility)
        absoluteXLabelX = xLabelPos.x;
        absoluteXLabelY = xLabelPos.y;
      }
    }

    const xText = add('text', {
      x: absoluteXLabelX,
      y: absoluteXLabelY,
      'text-anchor': 'middle',
      'font-size': fontSize,
      fill: chartStyle.TEXT_COLOR
    }, xAxisLabel, { role: 'xTitle', key: 'xTitle' });
    // Enable drag for x-axis label
    if(typeof Shared.enableLabelDrag === 'function'){
      Shared.enableLabelDrag(xText, svg, {
        onDragEnd: pos => {
          // Store both absolute and relative positions for xLabel
          const relX = (pos.x - margin.left) / plotWidth;
          const relY = (pos.y - (margin.top + plotHeight)) / bottomLayout.titleOffset;
          state.labelPositions.xLabel = {
            x: pos.x,
            y: pos.y,
            relX: relX,
            relY: relY
          };
          console.debug('Debug: roc x-label position saved', { absolute: pos, relative: { relX, relY } });
        }
      });
    }

    const yLabelOffsetSpan = (maxYLabelWidth + tickLen + tickGap + axisMetrics.axisTitleGap + fontSize * 0.5);
    const defaultYLabelX = margin.left - yLabelOffsetSpan;
    const defaultYLabelY = margin.top + plotHeight / 2;
    const yLabelPos = state.labelPositions?.yLabel;

    // Convert relative positions to absolute if needed for yLabel
    let absoluteYTextX = defaultYLabelX;
    let absoluteYTextY = defaultYLabelY;
    if (yLabelPos) {
      if (yLabelPos.relX !== undefined && yLabelPos.relY !== undefined) {
        // Use relative positioning
        absoluteYTextX = margin.left + yLabelPos.relX * yLabelOffsetSpan;
        absoluteYTextY = margin.top + yLabelPos.relY * plotHeight;
      } else if (yLabelPos.x !== undefined && yLabelPos.y !== undefined) {
        // Use absolute positioning (backward compatibility)
        absoluteYTextX = yLabelPos.x;
        absoluteYTextY = yLabelPos.y;
      }
    }

    const yText = add('text', {
      x: absoluteYTextX,
      y: absoluteYTextY,
      'text-anchor': 'middle',
      'font-size': fontSize,
      transform: `rotate(-90 ${absoluteYTextX} ${absoluteYTextY})`,
      fill: chartStyle.TEXT_COLOR
    }, yAxisLabel, { role: 'yTitle', key: 'yTitle' });
    // Enable drag for y-axis label
    if(typeof Shared.enableLabelDrag === 'function'){
      Shared.enableLabelDrag(yText, svg, {
        onDragEnd: pos => {
          // Store both absolute and relative positions for yLabel
          const relX = (pos.x - margin.left) / yLabelOffsetSpan;
          const relY = (pos.y - margin.top) / plotHeight;
          state.labelPositions.yLabel = {
            x: pos.x,
            y: pos.y,
            relX: relX,
            relY: relY
          };
          console.debug('Debug: roc y-label position saved', { absolute: pos, relative: { relX, relY } });
        }
      });
    }

    const titleY = Math.max(fontSize * 1.6, margin.top * 0.5);
    const defaultTitle = graphType === 'pr' ? 'Precision-Recall curve' : 'ROC curve';
    const titleValue = state.titleText != null ? String(state.titleText) : defaultTitle;
    const defaultTitleX = margin.left + plotWidth / 2;
    const defaultTitleY = titleY;
    const titlePos = state.labelPositions?.title;

    // Convert relative positions to absolute if needed
    let absoluteTitleX = defaultTitleX;
    let absoluteTitleY = defaultTitleY;
    if (titlePos) {
      if (titlePos.relX !== undefined && titlePos.relY !== undefined) {
        // Use relative positioning
        absoluteTitleX = margin.left + titlePos.relX * plotWidth;
        absoluteTitleY = titlePos.relY * plotHeight;
      } else if (titlePos.x !== undefined && titlePos.y !== undefined) {
        // Use absolute positioning (backward compatibility)
        absoluteTitleX = titlePos.x;
        absoluteTitleY = titlePos.y;
      }
    }

    const titleNode = add('text', {
      x: absoluteTitleX,
      y: absoluteTitleY,
      'text-anchor': 'middle',
      'font-size': fontSize,
      fill: chartStyle.TEXT_COLOR
    }, titleValue, { role: 'graphTitle', key: 'graphTitle' });
    const applyRocTitle = value => {
      const nextValue = value != null ? String(value) : '';
      state.titleText = nextValue;
      if(titleNode && titleNode.textContent !== nextValue){
        titleNode.textContent = nextValue;
      }
      if(typeof state.scheduleDraw === 'function'){
        state.scheduleDraw();
      }
    };
    makeEditable(titleNode, txt => {
      const previous = state.titleText != null ? String(state.titleText) : '';
      const nextValue = txt != null ? String(txt) : '';
      if(previous === nextValue){
        return;
      }
      applyRocTitle(nextValue);
      recordRocChange('roc:title', previous, nextValue, applyRocTitle);
    });
    // Enable drag for title
    if(typeof Shared.enableLabelDrag === 'function'){
      Shared.enableLabelDrag(titleNode, svg, {
        onDragEnd: pos => {
          // Store both absolute and relative positions
          const relX = (pos.x - margin.left) / plotWidth;
          const relY = pos.y / plotHeight;
          state.labelPositions.title = {
            x: pos.x,
            y: pos.y,
            relX: relX,
            relY: relY
          };
          console.debug('Debug: roc title position saved', { absolute: pos, relative: { relX, relY } });
        }
      });
    }

    const stats = [];
    const allPairs = [];

    series.forEach((serie, seriesIndex) => {
      const pairs = [];
      for(let idx = 0; idx < labels.length; idx += 1){
        const label = labels[idx];
        const score = serie.scores[idx];
        if(!Number.isNaN(label) && !Number.isNaN(score)){
          pairs.push({label: label > 0 ? 1 : 0, score});
        }
      }
      pairs.sort((a, b) => b.score - a.score);
      allPairs.push(pairs);

      let tp = 0;
      let fp = 0;
      const P = pairs.filter(p => p.label === 1).length;
      const N = pairs.length - P;
      const points = [];

      if(graphType === 'roc'){
        points.push({x: 0, y: 0});
        pairs.forEach(pair => {
          if(pair.label === 1) tp += 1; else fp += 1;
          points.push({x: fp / Math.max(1, N), y: tp / Math.max(1, P)});
        });
        points.push({x: 1, y: 1});
      }else{
        points.push({x: 0, y: 1});
        pairs.forEach(pair => {
          if(pair.label === 1) tp += 1; else fp += 1;
          const recall = tp / Math.max(1, P);
          const precision = tp / Math.max(1, tp + fp);
          points.push({x: recall, y: precision});
        });
      }

      let auc = 0;
      let avgPrecision = 0;
      for(let i = 1; i < points.length; i += 1){
        const prev = points[i - 1];
        const curr = points[i];
        auc += (curr.x - prev.x) * (curr.y + prev.y) / 2;
        if(graphType !== 'roc'){
          avgPrecision += (curr.x - prev.x) * curr.y;
        }
      }
      if(graphType === 'roc'){
        avgPrecision = undefined;
      }

      let best = {thr: Infinity, accuracy: 0, precision: 0, recall: 0, specificity: 0, npv: 0, lrPositive: Infinity, lrNegative: Infinity, f1: 0};
      let tpCount = 0;
      let fpCount = 0;
      let tnCount = N;
      let fnCount = P;
      for(let i = 0; i < pairs.length; ){
        const threshold = pairs[i].score;
        while(i < pairs.length && pairs[i].score === threshold){
          const entry = pairs[i];
          if(entry.label === 1){
            tpCount += 1;
            fnCount -= 1;
          }else{
            fpCount += 1;
            tnCount -= 1;
          }
          i += 1;
        }
        const accuracy = (tpCount + tnCount) / Math.max(1, pairs.length);
        const precision = tpCount / Math.max(1, tpCount + fpCount);
        const recall = tpCount / Math.max(1, tpCount + fnCount);
        const specificity = tnCount / Math.max(1, N);
        const npv = tnCount / Math.max(1, tnCount + fnCount);
        const lrPositive = specificity < 1 ? recall / Math.max(1e-12, (1 - specificity)) : Infinity;
        const lrNegative = specificity > 0 ? (1 - recall) / specificity : Infinity;
        const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
        if(f1 > best.f1){
          best = {thr: threshold, accuracy, precision, recall, specificity, npv, lrPositive, lrNegative, f1};
        }
      }

      const baseline = graphType === 'roc' ? 0.5 : positives / Math.max(1, positives + negatives);
      const pValue = bootstrapCurveTest(pairs, baseline, graphType);
      const aucUncertainty = graphType === 'roc' ? computeSingleAucUncertainty(pairs) : null;
      const thresholdRows = graphType === 'roc' ? buildRocThresholdMetricsTable(pairs) : [];
      stats.push({
        name: serie.name,
        auc,
        avgPrecision,
        aucSe: aucUncertainty?.se,
        aucCiLow: aucUncertainty?.ciLow,
        aucCiHigh: aucUncertainty?.ciHigh,
        thr: best.thr,
        accuracy: best.accuracy,
        precision: best.precision,
        recall: best.recall,
        specificity: best.specificity,
        npv: best.npv,
        lrPositive: best.lrPositive,
        lrNegative: best.lrNegative,
        f1: best.f1,
        pVal: pValue,
        thresholdRows
      });

      const color = state.labelColors[serie.name] || DEFAULT_SCATTER_COLORS[seriesIndex % DEFAULT_SCATTER_COLORS.length];
      // per-series stroke width and opacity (fall back to global borderWidthPx / full opacity)
      const seriesStrokeWidth = Number.isFinite(Number(state.labelStrokeWidth[serie.name])) ? Number(state.labelStrokeWidth[serie.name]) : borderWidthPx;
      const seriesOpacity = (state.labelOpacity && typeof state.labelOpacity[serie.name] !== 'undefined') ? Number(state.labelOpacity[serie.name]) : 1;
      let path = '';
      points.forEach((point, idx) => {
        const x = xToPx(point.x);
        const y = yToPx(point.y);
        path += `${idx ? 'L' : 'M'}${x} ${y}`;
      });
      const seriesPattern = sanitizeRocLinePattern(state.labelLinePattern?.[serie.name] || 'solid');
      const curveAttrs = {d: path, fill: 'none', stroke: color, 'stroke-width': seriesStrokeWidth, 'stroke-opacity': seriesOpacity, 'data-series': serie.name};
      const seriesDash = rocPatternToDasharray(seriesPattern);
      if(seriesDash){
        curveAttrs['stroke-dasharray'] = seriesDash;
      }
      const curveEl = add('path', curveAttrs);
      try{ curveEl.style.cursor='pointer'; curveEl.addEventListener('click', evt=>{ try{ evt.stopPropagation(); }catch(e){} showRocStrokeFormatControls(evt.currentTarget); }); }catch(e){}
    });

    if(legendVisible){
      const defaultLegendX = margin.left + plotWidth + legendLayout.legendGapPx;
      const defaultLegendY = margin.top + (legendRenderer.baselineOffset || 0);
      const legendPos = state.labelPositions?.legend;

      // Convert relative positions to absolute if needed for legend
      let absoluteLegendX = defaultLegendX;
      let absoluteLegendY = defaultLegendY;
      if (legendPos) {
        if (legendPos.relX !== undefined && legendPos.relY !== undefined) {
          // Use relative positioning
          absoluteLegendX = margin.left + plotWidth + legendPos.relX * legendLayout.legendGapPx;
          absoluteLegendY = margin.top + legendPos.relY * plotHeight;
        } else if (legendPos.x !== undefined && legendPos.y !== undefined) {
          // Use absolute positioning (backward compatibility)
          absoluteLegendX = legendPos.x;
          absoluteLegendY = legendPos.y;
        }
      }

      const legendGroup = legendRenderer.draw(svg,{
        x: absoluteLegendX,
        y: absoluteLegendY
      });
      if(legendGroup){
        if(typeof Shared.enableLegendDrag === 'function'){
          Shared.enableLegendDrag(legendGroup, svg, {
            onDragEnd: pos => {
              // Store both absolute and relative positions for legend
              const relX = (pos.x - (margin.left + plotWidth)) / legendLayout.legendGapPx;
              const relY = (pos.y - margin.top) / plotHeight;
              state.labelPositions.legend = {
                x: pos.x,
                y: pos.y,
                relX: relX,
                relY: relY
              };
              if(Shared.isDebugEnabled?.()){
                console.debug('Debug: roc legend position saved', { absolute: pos, relative: { relX, relY } });
              }
            }
          });
        }
        const textNodes = legendGroup.querySelectorAll('text');
        legendRenderer.entries.forEach((entry, index) => {
          const textNode = textNodes[index];
          if(!textNode){ return; }
          markFontEditable(textNode,'legend',`legend-${index}`);
        });
      }
    }else{
      console.debug('Debug: roc legend skipped',{ legendVisible, entryCount: legendRenderer.entries.length });
    }

    renderRocStatsSummary(stats, graphType);

    let diffResult = null;
    if(series.length >= 2 && state.compareSel && state.compareSel.value){
      const [i, j] = state.compareSel.value.split(',').map(Number);
      const pairsA = allPairs[i];
      const pairsB = allPairs[j];
      if(graphType === 'roc' && state.diffMethod === 'delong'){
        diffResult = delongCurveDiff(pairsA, pairsB);
        state.compareResult.textContent = `ΔAUC = ${diffResult.diff.toFixed(3)}, p = ${formatPValue(diffResult.p)}, CI = [${diffResult.ci[0].toFixed(3)}, ${diffResult.ci[1].toFixed(3)}]`;
      }else if(state.diffMethod === 'bootstrap'){
        diffResult = bootstrapCurveDiff(pairsA, pairsB, graphType);
        const metric = graphType === 'roc' ? 'ΔAUC' : 'ΔAP';
        state.compareResult.textContent = `${metric} = ${diffResult.diff.toFixed(3)}, p = ${formatPValue(diffResult.p)}, CI = [${diffResult.ci[0].toFixed(3)}, ${diffResult.ci[1].toFixed(3)}]`;
      }else if(state.diffMethod === 'permutation'){
        diffResult = permutationCurveDiff(pairsA, pairsB, graphType);
        const metric = graphType === 'roc' ? 'ΔAUC' : 'ΔAP';
        state.compareResult.textContent = `${metric} = ${diffResult.diff.toFixed(3)}, p = ${formatPValue(diffResult.p)}`;
      }
      if(global.DEBUG_ROC){
        console.debug('Debug: ROC pair diff', {pair: [series[i].name, series[j].name], diffResult});
      }
    }else if(state.compareResult){
      state.compareResult.textContent = '';
    }
    appendRocReportPanel(stats, graphType, diffResult);
    registerRocGridControlTarget(svg, { fallbackThickness: axisStrokeWidthBase });
    ensureGraphViewport(svg, { padding: Math.max(fontSize, 16), debugLabel: 'roc-graph' });
    state.layout?.syncPanels?.({ skipSchedule: true });
    syncRocAutoDrawNoticeWidth('draw');
  }

  function getPayload(){
    const activeHot = ensureHotForActiveTab();
    const activeManager = ensureRocDataViewsForHot(activeHot, {
      wrapper: refs.hotWrapper || document.getElementById('rocHotWrapper'),
      container: activeHot?.__rocHostContainer || refs.hotContainer || document.getElementById('rocHot')
    });
    syncRocActiveDataViewFromHot(activeHot, 'payload');
    const dataViewsPayload = activeManager?.serialize?.({ includeData: true }) || null;
    const includeDataViews = !!(dataViewsPayload && Array.isArray(dataViewsPayload.views) && dataViewsPayload.views.length > 1);
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
      type: 'roc',
      data: activeHot?.getData?.() || [],
      exclusions: activeHot?.exportExclusions?.() || Shared.hot.exportExclusions(activeHot),
      filters: activeHot?.exportFilters?.() || Shared.hot.exportFilters(activeHot),
      dataViews: includeDataViews ? dataViewsPayload : undefined,
      activeDataViewId: includeDataViews ? (dataViewsPayload?.activeViewId || null) : undefined,
      config: {
        colorScheme: Shared.colorSchemes?.getSelectedSchemeId?.('roc') || 'scientific',
        borderWidth: state.borderWidth,
        showGrid: !!refs.showGrid?.checked,
        gridStyle: getGridStyle(getAxisStrokeWidthBase()),
        showFrame: !!refs.showFrame?.checked,
        showLegend: refs.showLegend ? !!refs.showLegend.checked : true,
        fontSize: refs.fontSize?.value,
        fontStyles: exportFontStyles('roc') || undefined,
        labelColors: state.labelColors,
        labelStrokeWidth: state.labelStrokeWidth,
        labelOpacity: state.labelOpacity,
        labelLinePattern: state.labelLinePattern,
        title: state.titleText,
        graphType: refs.graphType?.value,
        notes: {
          text: notesText,
          open: notesOpen
        }
      }
    };
    const axisSettings = ensureAxisSettings();
    payload.config.axis = {
      strokeWidth: axisSettings.strokeWidth,
      color: axisSettings.color,
      tickIntervalX: axisSettings.x?.tickInterval ?? null,
      tickIntervalY: axisSettings.y?.tickInterval ?? null,
      minorTicksX: axisSettings.x?.minorTicks ?? false,
      minorTicksY: axisSettings.y?.minorTicks ?? false,
      minorTickSubdivisionsX: clampMinorTickSubdivisions(axisSettings.x?.minorTickSubdivisions),
      minorTickSubdivisionsY: clampMinorTickSubdivisions(axisSettings.y?.minorTickSubdivisions)
    };
    payload.stats = {
      diffMethod: state.diffMethod,
      compareSelection: state.compareSelection || state.compareSel?.value || null
    };
    payload.config.labelPositions = state.labelPositions || null;
    console.debug('Debug: roc.getPayload captured state', {
      rows: payload.data?.length || 0,
      cols: payload.data?.[0]?.length || 0,
      graphType: payload.config?.graphType
    });
    return payload;
  }
  roc.getPayload = getPayload;
  roc.captureEmptyPayloadTemplate = function captureRocEmptyPayloadTemplate(){
    const snapshot = roc.createEmptyPayload();
    console.debug('Debug: roc empty payload template captured', { hasTemplate: !!snapshot });
    return snapshot;
  };
  roc.restoreEmptyPayloadTemplate = function restoreRocEmptyPayloadTemplate(template, options = {}){
    if(!template || typeof template !== 'object'){
      console.debug('Debug: roc empty payload template restore skipped', { reason: 'invalid-template', options });
      return false;
    }
    emptyPayloadTemplate = cloneSimple(template);
    console.debug('Debug: roc empty payload template restored', { hasTemplate: !!emptyPayloadTemplate, reason: options.reason || 'unspecified' });
    return !!emptyPayloadTemplate;
  };
  roc.createEmptyPayload = function createEmptyRocPayload(){
    roc.ensure();
    const payload = { type: 'roc', config: {} };
    payload.type = 'roc';
    const createEmpty = Shared.createEmptyData;
    const emptyData = typeof createEmpty === 'function'
      ? createEmpty(DEFAULT_ROWS, ROC_DEFAULT_COLS)
      : Array.from({ length: DEFAULT_ROWS }, () => Array(ROC_DEFAULT_COLS).fill(''));
    seedRocDefaultHeaderRow(emptyData);
    payload.data = emptyData;
    payload.exclusions = [];
    payload.filters = null;
    payload.stats = null;
    payload.config = payload.config && typeof payload.config === 'object' ? payload.config : {};
    if(typeof payload.config.colorScheme !== 'string' || !payload.config.colorScheme.trim()){
      payload.config.colorScheme = Shared.colorSchemes?.getDefaultSchemeId?.('roc') || 'scientific';
    }
    return payload;
  };

  function applyRocPayload(payload, meta){
    const source = meta?.source || 'unknown';
    if(!payload || payload.type !== 'roc'){
      console.warn('roc payload rejected', { source, hasType: !!payload?.type });
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
    ensureHotForActiveTab();
    const dataMatrix = Array.isArray(payload.data) ? payload.data : [];
    const serializedViews = (payload.dataViews && typeof payload.dataViews === 'object') ? payload.dataViews : null;
    const requestedActiveViewId = payload.activeDataViewId || serializedViews?.activeViewId || null;
    const dataManager = state.hot
      ? ensureRocDataViewsForHot(state.hot, {
          wrapper: refs.hotWrapper || document.getElementById('rocHotWrapper'),
          container: state.hot.__rocHostContainer || refs.hotContainer || document.getElementById('rocHot')
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
      syncRocActiveDataViewFromHot(state.hot, 'payload-load');
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
    importFontStyles('roc', config.fontStyles || null);
    const loadedBorderWidth = Number(config.borderWidth);
    if(Number.isFinite(loadedBorderWidth) && loadedBorderWidth >= 0){
      state.borderWidth = loadedBorderWidth;
    }else{
      state.borderWidth = DEFAULT_ROC_BORDER_WIDTH;
    }
    if(refs.showGrid) refs.showGrid.checked = !!config.showGrid;
    setGridStyle(config.gridStyle, config.axis?.strokeWidth);
    if(refs.showFrame) refs.showFrame.checked = !!config.showFrame;
    if(refs.showLegend){
      refs.showLegend.checked = config.showLegend !== false;
      ensureRocLegendControlPlacement();
    }
    if(refs.fontSize) refs.fontSize.value = config.fontSize || refs.fontSize.value;
    updateFontSizeLabel();
    if(config.title !== undefined){
      state.titleText = config.title != null ? String(config.title) : '';
    }else if(state.titleText == null){
      const inferredType = config.graphType || refs.graphType?.value || 'roc';
      state.titleText = inferredType === 'pr' ? 'Precision-Recall curve' : 'ROC curve';
    }
    state.labelColors = config.labelColors || {};
    state.labelStrokeWidth = config.labelStrokeWidth || {};
    state.labelOpacity = config.labelOpacity || {};
    state.labelLinePattern = config.labelLinePattern || {};
    if(refs.graphType) refs.graphType.value = config.graphType || refs.graphType.value;
    const axisConfig = config.axis || config.axisSettings;
    if(axisConfig){
      applyAxisSettings(axisConfig);
    }
    const statsConfig = payload.stats || null;
    if(statsConfig){
      if(typeof statsConfig.diffMethod === 'string'){
        state.diffMethod = statsConfig.diffMethod;
      }else{
        state.diffMethod = 'delong';
      }
      state.compareSelection = typeof statsConfig.compareSelection === 'string'
        ? statsConfig.compareSelection
        : null;
    }else{
      state.diffMethod = 'delong';
      state.compareSelection = null;
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
    renderStatsControls();
    if(refs.graphType){
      renderRocStatsSummary([], refs.graphType.value || 'roc');
    }else{
      renderRocStatsSummary([], 'roc');
    }
    if(!skipDraw && typeof state.scheduleDraw === 'function'){
      state.scheduleDraw();
    }
    if(scheduleBackup){
      state.scheduleDraw = scheduleBackup;
    }
    console.debug('Debug: roc payload applied', { source, rows: dataToLoad.length, graphType: refs.graphType?.value });
    return true;
  }

  async function saveFile(){
    const payload = getPayload();
    console.debug('Debug: saveRocFile invoked', { hasHandle: !!state.fileHandle });
    if(!fileIO || typeof fileIO.saveGraphFile !== 'function'){
      console.error('saveRocFile missing fileIO.saveGraphFile');
      return;
    }
    const result = await fileIO.saveGraphFile({
      context: 'roc',
      fileHandle: state.fileHandle,
      payload,
      fileName: state.fileName,
      downloadFileName: state.fileName,
      setFileHandle: handle => { state.fileHandle = handle; },
      setFileName: name => { state.fileName = name; }
    });
    console.debug('Debug: saveRocFile result', result);
  }

  async function saveFileAs(){
    const payload = getPayload();
    console.debug('Debug: saveAsRocFile invoked', { currentName: state.fileName });
    if(!fileIO || typeof fileIO.saveGraphFileAs !== 'function'){
      console.error('saveAsRocFile missing fileIO.saveGraphFileAs');
      return;
    }
    const result = await fileIO.saveGraphFileAs({
      context: 'roc',
      payload,
      fileName: state.fileName,
      downloadFileName: state.fileName,
      setFileHandle: handle => { state.fileHandle = handle; },
      setFileName: name => { state.fileName = name; }
    });
    console.debug('Debug: saveAsRocFile result', result);
  }

  function loadFromFile(file){
    const apply = payload => applyRocPayload(payload, { source: 'file' });
    if(file instanceof Blob){
      const reader = new FileReader();
      reader.onload = event => {
        try{
          const obj = JSON.parse(event.target.result);
          if(!apply(obj)){
            console.warn('roc payload rejected from file', { hasType: !!obj?.type });
          }
        }catch(err){
          console.error('loadRocGraph error', err);
        }
      };
      reader.readAsText(file);
      return;
    }
    if(typeof file === 'string'){
      try{
        const parsed = JSON.parse(file);
        if(!apply(parsed)){
          console.warn('roc payload rejected from string');
        }
      }catch(err){
        console.error('loadRocGraph string parse error', err);
      }
      return;
    }
    if(file && typeof file === 'object'){
      apply(file);
    }
  }

  async function openFile(){
    console.debug('Debug: openRocFile invoked');
    if(!fileIO || typeof fileIO.openGraphFile !== 'function'){
      console.error('openRocFile missing fileIO.openGraphFile');
      return;
    }
    const result = await fileIO.openGraphFile({
      context: 'roc',
      setFileHandle: handle => { state.fileHandle = handle; },
      setFileName: name => { state.fileName = name; },
      loadFromFile: file => loadFromFile(file),
      triggerInput: () => {
        if(refs.graphFileInput){
          refs.graphFileInput.value = '';
          refs.graphFileInput.click();
        }
      }
    });
    console.debug('Debug: openRocFile result', result);
  }

  function initExportsAndFiles(){
    if (Shared.exporter && typeof Shared.exporter.mountSvgControls === 'function') {
      Shared.exporter.mountSvgControls({
        container: '#rocExportControls',
        svgSelector: '#rocSvg',
        fileName: 'roc',
        contextLabel: 'roc-export'
      });
      console.debug('Debug: roc export controls mounted', { hasExporter: true }); // Debug: roc export mount
    } else {
      console.debug('Debug: roc export controls unavailable', { hasExporter: !!Shared.exporter }); // Debug: roc export fallback
    }

    refs.saveBtn?.addEventListener('click', () => { void saveFile(); });
    refs.saveAsBtn?.addEventListener('click', () => { void saveFileAs(); });
    refs.openBtn?.addEventListener('click', () => { void openFile(); });
    refs.graphFileInput?.addEventListener('change', event => {
      const file = event.target.files?.[0];
      if(file){
        state.fileName = file.name;
        state.fileHandle = null;
        loadFromFile(file);
      }
    });
  }

  function initControls(){
    if(refs.fontSize){
      refs.fontSize.addEventListener('input', () => {
        updateFontSizeLabel();
        state.scheduleDraw?.();
      });
      updateFontSizeLabel();
    }
    refs.showGrid?.addEventListener('change', () => state.scheduleDraw?.());
    refs.showFrame?.addEventListener('change', () => { console.debug('Debug: roc showFrame change',{checked:refs.showFrame.checked}); state.scheduleDraw?.(); });
    if(refs.showLegend){
      refs.showLegend.addEventListener('change', () => {
        console.debug('Debug: roc showLegend change',{checked:refs.showLegend.checked});
        ensureRocLegendControlPlacement();
        state.scheduleDraw?.();
      });
    }
    refs.graphType?.addEventListener('change', () => {
      renderStatsControls();
      state.scheduleDraw?.();
    });
    renderStatsControls();
  }

  function initNotes(){
    const stack = global.document.querySelector('#rocGraphPanel .roc-plot-stack')
      || global.document.querySelector('#rocGraphPanel .diagram-area');
    if(!stack){
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        console.debug('Debug: roc notes mount skipped (missing stack)');
      }
      return;
    }
    const helper = Shared.notes;
    if(!helper || typeof helper.mountFoldable !== 'function'){
      console.warn('roc notes helper unavailable', { hasSharedNotes: !!helper });
      return;
    }
    if(notesState.control?.root && notesState.control.root.isConnected){
      notesState.control.setValue(notesState.text || '');
      notesState.control.setOpen(!!notesState.open);
      return;
    }
    notesState.control = helper.mountFoldable({
      container: stack,
      id: 'roc-notes',
      title: 'Notes',
      placeholder: 'Write notes about the data being analyzed...',
      richText: true,
      scopeId: 'roc',
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

  function init(){
    if(roc.ready){
      return;
    }
    if(!ensureElements()){
      console.warn('ROC component init skipped: required elements missing');
      return;
    }
    const scheduleRocDrawBase = Shared.debounceFrame ? Shared.debounceFrame(runRocDrawCycle) : runRocDrawCycle;
    const scheduleRocDrawInstrumented = (opts) => {
      const nextOpts = opts || {};
      const overlayReason = nextOpts.reason || (nextOpts.force ? 'manual-render' : 'schedule');
      if(nextOpts.force){
        markRocOverlayPending(overlayReason);
        forceRocOverlay(overlayReason, { message: 'Rendering ROC/PR plot...' });
      }else{
        queueRocOverlay(overlayReason);
      }
      const runSchedule = () => scheduleRocDrawBase(nextOpts);
      const shouldDelayForOverlay = rocOverlayController?.isActive?.() && !nextOpts.viewOnly;
      if(shouldDelayForOverlay){
        const scheduleAfterPaint = () => {
          console.debug('Debug: roc autoDraw deferred for overlay',{ reason: overlayReason });
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
    scheduleDrawRocRaw = Shared.workspaceTabs?.createTabScopedScheduler
      ? Shared.workspaceTabs.createTabScopedScheduler({
          componentKey: 'roc',
          debugLabel: 'roc',
          scheduleRaw: scheduleRocDrawInstrumented
        })
      : scheduleRocDrawInstrumented;
    if(!rocAutoDrawManager && Shared.hot?.createAutoDrawManager){
      rocAutoDrawManager = Shared.hot.createAutoDrawManager({
        component: 'roc',
        state,
        thresholds: {
          rows: ROC_AUTO_DRAW_ROW_THRESHOLD,
          cols: ROC_AUTO_DRAW_COL_THRESHOLD,
          cells: ROC_AUTO_DRAW_CELL_THRESHOLD
        },
        getHot: () => state.hot,
        elements: {
          renderRow: () => refs.renderRow,
          renderButton: () => refs.renderButton,
          notice: () => refs.autoDrawNotice
        },
        debugLog: console.debug
      });
    }
    if(rocAutoDrawManager){
      rocAutoDrawManager.setScheduleRaw(scheduleDrawRocRaw);
      rocAutoDrawManager.setElements({
        renderRow: refs.renderRow,
        renderButton: refs.renderButton,
        notice: refs.autoDrawNotice
      });
      state.scheduleDraw = (opts) => rocAutoDrawManager.schedule(opts);
      rocAutoDrawManager.updateUi();
      rocAutoDrawManager.evaluateThresholds();
      syncRocAutoDrawNoticeWidth('auto-draw-init');
    }else{
      state.scheduleDraw = scheduleDrawRocRaw;
    }
    console.debug('Debug: roc scheduleDraw configured via Shared.debounceFrame', { guarded: !!rocAutoDrawManager }); // Debug: scheduler setup
    state.layout = Shared.componentLayout?.createStandardPanels({
      componentName: 'roc',
      selectors: {
        tablePanel: '#rocTablePanel',
        graphPanel: '#rocGraphPanel',
        panelResizer: '#rocPanelResizer',
        hotWrapper: '#rocHotWrapper',
        hotContainer: '#rocHot',
        svgBox: () => refs.graphPanel?.querySelector('.svgbox'),
        resizeTarget: () => refs.graphPanel?.querySelector('.svgbox')
      },
        scheduleDraw: state.scheduleDraw,
        preserveGraphContent: false,
        panelSyncOptions: {
          disableAutoWidthClamp: true,
          lockGraphPanelWidth: false
        },
        onAfterSync: () => {
        syncRocAutoDrawNoticeWidth('panel-sync');
        ensureRocLegendControlPlacement();
      },
      onMinSvgWidth: value => {
        state.minSvgWidth = Math.max(0, Number(value) || 0);
        console.debug('Debug: roc layout min width update', { value: state.minSvgWidth });
      },
      resizableBoxOptions: {
        onResize: () => {
          console.debug('Debug: roc layout onResize schedule trigger');
          ensureRocLegendControlPlacement();
          scheduleRocNoticeWidth('resize');
          state.scheduleDraw?.({ viewOnly: true, reason: 'resize' });
        }
      }
    });
    if(state.layout?.elements?.svgBox){
      refs.svgBox = state.layout.elements.svgBox;
      ensureRocLegendControlPlacement();
    }
    const scheduleLegendPlacement = typeof Shared.debounceFrame === 'function'
      ? Shared.debounceFrame(() => ensureRocLegendControlPlacement())
      : null;
    if(scheduleLegendPlacement){
      scheduleLegendPlacement();
    }else if(typeof global.requestAnimationFrame === 'function'){
      global.requestAnimationFrame(() => ensureRocLegendControlPlacement());
    }
    state.layout?.setScheduleDraw?.(state.scheduleDraw);
    ensureRocFontEventListener();
    state.layout?.syncPanels?.();
    scheduleRocNoticeWidth('init');
    ensureHotForActiveTab();
    initControls();
    initNotes();
    initExampleAndImport();
    initExportsAndFiles();
    state.scheduleDraw?.();
    ensureEmptyPayloadTemplate();
    roc.__domSentinel = global.document?.getElementById?.('rocHot') || null;
    roc.ready = true;
    console.debug('Debug: ROC component initialized');
    global.scheduleDrawRoc = () => state.scheduleDraw?.();
  }

  roc.init = init;
  roc.ensure = function ensure(){
    if(typeof Shared.workspaceTabs?.ensureActiveDomBindings === 'function'){
      const rebound = Shared.workspaceTabs.ensureActiveDomBindings({
        componentKey: 'roc',
        sentinelSelector: '#rocHot',
        getCurrentSentinel: () => roc.__domSentinel || null,
        rebind: () => {
          roc.ready = false;
          init();
        }
      });
      if(rebound?.rebound){
        return;
      }
    }
    if(!roc.ready){
      init();
    }
  };
  roc.activateTab = function activateTab(tab){
    if(typeof Shared.workspaceTabs?.ensureActiveDomBindings === 'function'){
      const rebound = Shared.workspaceTabs.ensureActiveDomBindings({
        componentKey: 'roc',
        tabLike: tab || null,
        sentinelSelector: '#rocHot',
        getCurrentSentinel: () => roc.__domSentinel || null,
        rebind: () => {
          roc.ready = false;
          init();
        }
      });
      if(rebound?.rebound){
        return;
      }
    }
    ensureHotForActiveTab();
    roc.__domSentinel = global.document?.getElementById?.('rocHot') || null;
  };
  roc.draw = () => { void runRocDrawCycle(); };
  roc.scheduleDraw = () => state.scheduleDraw?.();
  roc.save = saveFile;
  roc.saveAs = saveFileAs;
  roc.open = openFile;
  roc.loadFromFile = loadFromFile;
  roc.loadFromPayload = function loadFromPayload(payload, options = {}){
    if(!applyRocPayload(payload, { source: 'payload', ...options })){
      console.warn('roc payload application failed', { source: 'payload' });
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

  roc.captureRenderCache = function captureRenderCache(){
    const plot = document.getElementById('rocPlot');
    const stats = document.getElementById('rocStatsResults');
    const plotCache = detachChildren(plot);
    const statsCache = detachChildren(stats);
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug('Debug: roc render cache captured', {
        plotNodes: plotCache?.count || 0,
        statsNodes: statsCache?.count || 0
      });
    }
    return { plot: plotCache, stats: statsCache };
  };

  roc.restoreRenderCache = function restoreRenderCache(cache){
    if(!cache){ return false; }
    const plot = document.getElementById('rocPlot');
    const stats = document.getElementById('rocStatsResults');
    const restoredPlot = restoreChildren(plot, cache.plot);
    const restoredStats = restoreChildren(stats, cache.stats);
    const restored = restoredPlot || restoredStats;
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug('Debug: roc render cache restored', {
        restored,
        plot: restoredPlot,
        stats: restoredStats
      });
    }
    return restored;
  };

  roc.__testHooks = Object.assign({}, roc.__testHooks, {
    computeCurveMetric: (pairs, graphType = 'roc') => computeCurveMetric(Array.isArray(pairs) ? pairs : [], graphType),
    computeSingleAucUncertainty: (pairs, alpha = 0.05) => computeSingleAucUncertainty(Array.isArray(pairs) ? pairs : [], alpha),
    buildThresholdMetricsTable: (pairs, alpha = 0.05) => buildRocThresholdMetricsTable(Array.isArray(pairs) ? pairs : [], alpha),
    delongCurveDiff: (pairs1, pairs2) => delongCurveDiff(Array.isArray(pairs1) ? pairs1 : [], Array.isArray(pairs2) ? pairs2 : []),
    bootstrapCurveDiff: (pairs1, pairs2, graphType = 'roc', iters = 200) => bootstrapCurveDiff(
      Array.isArray(pairs1) ? pairs1 : [],
      Array.isArray(pairs2) ? pairs2 : [],
      graphType,
      iters
    ),
    permutationCurveDiff: (pairs1, pairs2, graphType = 'roc', iters = 200) => permutationCurveDiff(
      Array.isArray(pairs1) ? pairs1 : [],
      Array.isArray(pairs2) ? pairs2 : [],
      graphType,
      iters
    )
  });
})(window);
