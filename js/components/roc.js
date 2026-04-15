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
    if(emptyPayloadTemplate || typeof getPayload !== 'function'){
      return;
    }
    const snapshot = getPayload();
    if(snapshot){
      emptyPayloadTemplate = cloneSimple(snapshot);
    }
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
    scheduleDrawRocRaw = scheduleRocDrawInstrumented;
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
    roc.ready = true;
    console.debug('Debug: ROC component initialized');
    global.scheduleDrawRoc = () => state.scheduleDraw?.();
  }

  roc.init = init;
  roc.ensure = function ensure(){
    if(!roc.ready){
      init();
    }
  };
  roc.activateTab = function activateTab(_tab){
    ensureHotForActiveTab();
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
