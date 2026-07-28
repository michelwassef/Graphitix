(function(global){
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};
  const roc = Components.roc = Components.roc || {};

  function getRocRuntimeOwner(){
    return Shared.componentLifecycle?.createRuntimeOwner?.(roc, { componentKey: 'roc' }) || null;
  }

  function rememberRocOwnedRuntimeRecord(tabLike = null, snapshot = null, meta = {}){
    if(!snapshot || typeof snapshot !== 'object'){
      return null;
    }
    setRocSessionStateFromRuntimeRecord(snapshot, {
      ...(meta || {}),
      tab: tabLike || meta?.tab || null,
      tabId: meta?.tabId || (tabLike && typeof tabLike === 'object' ? tabLike.id : tabLike) || null,
      reason: meta?.reason || 'roc-owned-runtime-remember'
    });
    return getRocRuntimeOwner()?.capture(snapshot, {
      ...(meta || {}),
      tab: tabLike || meta?.tab || null,
      componentKey: 'roc',
      reason: meta?.reason || 'roc-owned-runtime-remember'
    }) || snapshot;
  }

  function resolveRocOwnedRuntimeSnapshot(snapshot = null, meta = {}){
    const resolved = getRocRuntimeOwner()?.bind(snapshot || null, {
      ...(meta || {}),
      componentKey: 'roc',
      reason: meta?.reason || 'roc-owned-runtime-resolve'
    }) || snapshot || null;
    if(resolved && typeof resolved === 'object'){
      setRocSessionStateFromRuntimeRecord(resolved, {
        ...(meta || {}),
        reason: meta?.reason || 'roc-owned-runtime-resolve'
      });
    }
    return resolved;
  }

  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  const fontControls = Shared.fontControls = Shared.fontControls || {};
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

  // PART: UTILS
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
        const svg = getRocNodeById('rocSvg');
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
        const svg = getRocNodeById('rocSvg');
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
          scheduleActiveRocDraw({ reason: 'roc-line-color-input' });
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
          scheduleActiveRocDraw({ reason: 'roc-line-color-change' });
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
          scheduleActiveRocDraw({ reason: 'roc-line-thickness-change' });
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
          scheduleActiveRocDraw({ reason: 'roc-line-pattern-change' });
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
          scheduleActiveRocDraw({ reason: 'roc-line-transparency-change' });
        }
      });
      return;
    }
    console.debug('Debug: roc additional line controls unavailable');
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

  // PART: TABLE
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

  function activeTabHasSavedRocData(){
    try{
      const tab = global.Main?.session?.getActiveTab?.();
      if(!tab || tab.type !== 'roc'){
        return false;
      }
      const data = tab.payload && Array.isArray(tab.payload.data) ? tab.payload.data : null;
      if(!data || !data.length){
        return false;
      }
      return data.some(row => Array.isArray(row) && row.some(value => value != null && String(value).trim() !== ''));
    }catch(err){
      console.error('roc active tab payload check error', err);
      return false;
    }
  }

  function ensureRocDefaultHeaderRow(hotInstance){
    const hot = hotInstance || state.hot;
    if(!hot || typeof hot.getData !== 'function' || typeof hot.setDataAtCell !== 'function'){
      return false;
    }
    if(activeTabHasSavedRocData()){
      console.debug('Debug: roc default header seed skipped for tab with saved data', {
        tabId: resolveActiveTabId() || null
      });
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
    const defaultScoreCols = Math.min(Math.max(0, ROC_DEFAULT_COLS - 1), Math.max(0, colCount - 1));
    for(let col = 1; col <= defaultScoreCols; col += 1){
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
      const tab = global.Main?.session?.getActiveTab?.();
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

  const sanitizeRocDrawOptions = (options = {}, owner = {}) => (
    Shared.componentLifecycle?.sanitizeComponentDrawOptions?.('roc', options, owner) || {}
  );

  function ensureEmptyPayloadTemplate(){
    const session = getActiveRocSessionForState();
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
    emptyPayloadTemplate = { type: 'roc', config: {} };
    if(session?.cache){
      session.cache.emptyPayloadTemplate = cloneSimple(emptyPayloadTemplate) || emptyPayloadTemplate;
      session.updatedAt = Date.now();
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
  const ROC_RESAMPLING_DEFAULT_SEED = 1337;
  const ROC_RESAMPLING_DEFAULT_ITERATIONS = 2000;

  function normalizeRocResamplingSeed(value, fallback = ROC_RESAMPLING_DEFAULT_SEED){
    if(typeof Shared.resampling?.normalizeSeed === 'function'){
      return Shared.resampling.normalizeSeed(value, fallback);
    }
    const numeric = Number(value);
    return (Math.trunc(Number.isFinite(numeric) ? numeric : fallback) >>> 0) || ROC_RESAMPLING_DEFAULT_SEED;
  }

  function normalizeRocResamplingIterations(value, fallback = ROC_RESAMPLING_DEFAULT_ITERATIONS){
    if(typeof Shared.resampling?.normalizeIterations === 'function'){
      return Shared.resampling.normalizeIterations(value, fallback, { min: 1, max: 1000000 });
    }
    const numeric = Number(value);
    const normalized = Math.trunc(Number.isFinite(numeric) ? numeric : fallback);
    return Math.max(1, Math.min(1000000, normalized));
  }

  function createFallbackRocRandom(seed, scopeParts){
    const text = JSON.stringify([normalizeRocResamplingSeed(seed), ...(scopeParts || [])]);
    let state = 2166136261;
    for(let index = 0; index < text.length; index += 1){
      state ^= text.charCodeAt(index);
      state = Math.imul(state, 16777619);
    }
    state = state >>> 0 || ROC_RESAMPLING_DEFAULT_SEED;
    return function nextRandom(){
      state = (state + 0x6D2B79F5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createRocScopedRandom(seed, ...scopeParts){
    if(typeof Shared.resampling?.createScopedRandom === 'function'){
      return Shared.resampling.createScopedRandom(seed, ...scopeParts);
    }
    return createFallbackRocRandom(seed, scopeParts);
  }

  function normalizeRocResamplingOptions(options, scopeParts = []){
    const source = typeof options === 'number' ? { iterations: options } : (options || {});
    const seed = normalizeRocResamplingSeed(source.seed, ROC_RESAMPLING_DEFAULT_SEED);
    const iterations = normalizeRocResamplingIterations(source.iterations, ROC_RESAMPLING_DEFAULT_ITERATIONS);
    return {
      seed,
      iterations,
      random: typeof source.random === 'function' ? source.random : createRocScopedRandom(seed, ...scopeParts)
    };
  }

  function createDefaultAxisSettings(){
    return {
      strokeWidth: 1,
      color: DEFAULT_AXIS_COLOR,
      x: { tickInterval: null, majorTickLength: null, minorTicks: false, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS },
      y: { tickInterval: null, majorTickLength: null, minorTicks: false, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS }
    };
  }

  const DEFAULT_ROC_BORDER_WIDTH = 2;
  const ROC_SCORE_DIRECTIONS = new Set(['higher', 'lower']);
  const SINGLE_ROC_P_METHODS = new Set(['auto', 'exact', 'asymptotic']);
  const ROC_EXACT_MANN_WHITNEY_MAX_TOTAL = 50;

  function normalizeSingleRocPMethod(value){
    const normalized = String(value || 'auto').trim().toLowerCase();
    return SINGLE_ROC_P_METHODS.has(normalized) ? normalized : 'auto';
  }

  function normalizeRocScoreDirection(value){
    return ROC_SCORE_DIRECTIONS.has(String(value || '').toLowerCase()) ? String(value).toLowerCase() : 'higher';
  }

  function isValidRocClassValue(value){
    return value !== null && value !== undefined && !(typeof value === 'string' && value.trim() === '') && !(typeof value === 'number' && Number.isNaN(value));
  }

  function rocClassKey(value){
    return `${typeof value}:${JSON.stringify(value)}`;
  }

  function formatRocClassValue(value){
    return typeof value === 'string' ? value : String(value);
  }

  function getDistinctRocClasses(rawLabels){
    const seen = new Set();
    const classes = [];
    (Array.isArray(rawLabels) ? rawLabels : []).forEach(value => {
      if(!isValidRocClassValue(value)){ return; }
      const key = rocClassKey(value);
      if(seen.has(key)){ return; }
      seen.add(key);
      classes.push(value);
    });
    return classes;
  }

  function parseRocScore(value){
    if(value === null || value === undefined || (typeof value === 'string' && value.trim() === '')){
      return NaN;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : NaN;
  }

  function resolveRocClassificationSetup(rawLabels, source = {}){
    const classes = getDistinctRocClasses(rawLabels);
    const requested = source?.positiveClass;
    let positiveClass = classes.find(value => rocClassKey(value) === rocClassKey(requested));
    if(positiveClass === undefined){
      positiveClass = classes.find(value => value === 1)
        ?? classes.find(value => value === '1')
        ?? classes[1]
        ?? classes[0];
    }
    const negativeClass = classes.find(value => rocClassKey(value) !== rocClassKey(positiveClass));
    return {
      classes,
      positiveClass,
      negativeClass,
      scoreDirection: normalizeRocScoreDirection(source?.scoreDirection),
      valid: classes.length === 2
    };
  }

  function buildCanonicalAnalysisPairs(rawLabels, originalScores, setup = {}){
    const resolved = resolveRocClassificationSetup(rawLabels, setup);
    if(!resolved.valid){ return []; }
    const lowerPositive = resolved.scoreDirection === 'lower';
    const pairs = [];
    const count = Math.min(rawLabels?.length || 0, originalScores?.length || 0);
    for(let observationIndex = 0; observationIndex < count; observationIndex += 1){
      const rawLabel = rawLabels[observationIndex];
      const originalScore = parseRocScore(originalScores[observationIndex]);
      if(!isValidRocClassValue(rawLabel) || !Number.isFinite(originalScore)){ continue; }
      const classKey = rocClassKey(rawLabel);
      if(!resolved.classes.some(value => rocClassKey(value) === classKey)){ continue; }
      const analysisLabel = rawLabel === resolved.positiveClass ? 1 : 0;
      const analysisScore = lowerPositive ? -originalScore : originalScore;
      pairs.push({
        rawLabel,
        originalScore,
        analysisLabel,
        analysisScore,
        label: analysisLabel,
        score: analysisScore,
        observationIndex
      });
    }
    return pairs;
  }

  function rocOriginalThreshold(analysisThreshold, scoreDirection){
    return normalizeRocScoreDirection(scoreDirection) === 'lower' ? -analysisThreshold : analysisThreshold;
  }

  function rocCutoffOperator(scoreDirection){
    return normalizeRocScoreDirection(scoreDirection) === 'lower' ? '≤' : '≥';
  }

  function getRocAucDirectionWarning(stats, graphType = 'roc'){
    return graphType === 'roc' && (Array.isArray(stats) ? stats : []).some(stat => Number.isFinite(stat?.auc) && stat.auc < 0.5)
      ? 'AUC is below 0.5. Verify the positive class and score direction. The curve was not automatically reversed.'
      : '';
  }

  const state = {
    hot: null,
    root: null,
    scheduleDraw: null,
    borderWidth: DEFAULT_ROC_BORDER_WIDTH,
    labelColors: {},
    labelStrokeWidth: {},
    labelOpacity: {},
    labelLinePattern: {},
    diffMethod: 'delong',
    singleRocPMethod: 'auto',
    resamplingSeed: ROC_RESAMPLING_DEFAULT_SEED,
    resamplingIterations: ROC_RESAMPLING_DEFAULT_ITERATIONS,
    compareSel: null,
    compareLabel: null,
    compareResult: null,
    compareResultModel: null,
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
    labelPositions: { title: null, xLabel: null, yLabel: null, legend: null },
    statsPanelModel: { resultsModel: null, reportModel: null },
    analysisSignature: '',
    statsPanelSignature: '',
    positiveClass: undefined,
    negativeClass: undefined,
    scoreDirection: 'higher',
    controls: null
  };
  let rocAutoDrawManager = null;
  let scheduleDrawRocRaw = () => {};
  let rocFontEventBound = false;
  let rocStatsPValueFormatEventBound = false;

  const rocSessionsByTabId = new Map();
  // Transient visible-DOM projection bridge. Durable state belongs to the owner session map.
  let projectedRocSession = null;

  // Compatibility bridge: visible-DOM projection tab id. Delete after every projection entrypoint receives explicit owner tab metadata.
  function getRocProjectionTabId(){
    return Shared.componentLifecycle?.resolveProjectionTabId?.(roc, projectedRocSession) || String(roc.__boundTabId || projectedRocSession?.tabId || '').trim();
  }

  function getRocProjectionSession(meta = {}, options = {}){
    const tabId = getRocProjectionTabId();
    if(!tabId){ return null; }
    return getRocSession(tabId, { ...(meta || {}), tabId, reason: meta?.reason || 'roc-projection-session' }, { create: options.create !== false });
  }

  function normalizeRocSessionTabId(tabLike = null, meta = {}){
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
      || Shared.workspaceTabs?.getActiveSessionInfo?.('roc')?.tabId
      || getRocProjectionTabId()
      || '';
    return String(resolved || '').trim();
  }

  function createDefaultRocStatsPanelModel(source = {}){
    return normalizeRocStatsPanelModel(source || {});
  }

  function getDefaultRocTitle(graphType = 'roc'){
    return String(graphType || '').toLowerCase() === 'pr' ? 'Precision-Recall curve' : 'ROC curve';
  }

  function isDefaultRocTitle(title){
    const normalized = String(title == null ? '' : title).trim();
    return normalized === getDefaultRocTitle('roc') || normalized === getDefaultRocTitle('pr');
  }

  function createDefaultRocDurableState(source = {}){
    const src = source && typeof source === 'object' ? source : {};
    const controls = normalizeRocRuntimeControls(src.controls || src.config || {});
    return {
      borderWidth: Number.isFinite(Number(src.borderWidth)) ? Number(src.borderWidth) : DEFAULT_ROC_BORDER_WIDTH,
      labelColors: cloneSimple(src.labelColors) || {},
      labelStrokeWidth: cloneSimple(src.labelStrokeWidth) || {},
      labelOpacity: cloneSimple(src.labelOpacity) || {},
      labelLinePattern: cloneSimple(src.labelLinePattern) || {},
      diffMethod: typeof src.diffMethod === 'string' && src.diffMethod.trim() ? src.diffMethod : 'delong',
      singleRocPMethod: normalizeSingleRocPMethod(src.singleRocPMethod),
      resamplingSeed: normalizeRocResamplingSeed(src.resamplingSeed, ROC_RESAMPLING_DEFAULT_SEED),
      resamplingIterations: normalizeRocResamplingIterations(src.resamplingIterations, ROC_RESAMPLING_DEFAULT_ITERATIONS),
      compareSelection: Object.prototype.hasOwnProperty.call(src, 'compareSelection') ? (src.compareSelection || null) : null,
      minSvgWidth: Number.isFinite(Number(src.minSvgWidth)) ? Number(src.minSvgWidth) : 0,
      fileName: typeof src.fileName === 'string' && src.fileName.trim() ? src.fileName : 'roc.graph',
      titleText: src.titleText != null ? String(src.titleText) : getDefaultRocTitle(controls.graphType),
      axisSettings: cloneSimple(src.axisSettings || src.axis) || createDefaultAxisSettings(),
      gridStyle: cloneSimple(src.gridStyle) || null,
      autoDrawEnabled: Object.prototype.hasOwnProperty.call(src, 'autoDrawEnabled') ? !!src.autoDrawEnabled : true,
      autoDrawReason: src.autoDrawReason || null,
      autoDrawLockedByThreshold: !!src.autoDrawLockedByThreshold,
      drawPending: false,
      lastDataShape: cloneSimple(src.lastDataShape) || { rows: 0, cols: 0 },
      lastAutoDrawEvaluation: cloneSimple(src.lastAutoDrawEvaluation) || null,
      labelPositions: cloneSimple(src.labelPositions) || { title: null, xLabel: null, yLabel: null, legend: null },
      statsPanelModel: createDefaultRocStatsPanelModel(src.statsPanelModel || src.statsPanel || src.stats || {}),
      analysisSignature: src.analysisSignature == null ? '' : String(src.analysisSignature),
      statsPanelSignature: src.statsPanelSignature == null ? '' : String(src.statsPanelSignature),
      positiveClass: Object.prototype.hasOwnProperty.call(src, 'positiveClass') ? src.positiveClass : undefined,
      negativeClass: Object.prototype.hasOwnProperty.call(src, 'negativeClass') ? src.negativeClass : undefined,
      scoreDirection: normalizeRocScoreDirection(src.scoreDirection),
      controls
    };
  }

  function createDefaultRocResultsState(source = {}){
    const src = source && typeof source === 'object' ? source : {};
    return {
      statsPanelModel: createDefaultRocStatsPanelModel(src.statsPanelModel || src.statsPanel || src.stats || {}),
      compareSelection: Object.prototype.hasOwnProperty.call(src, 'compareSelection') ? (src.compareSelection || null) : null,
      diffMethod: typeof src.diffMethod === 'string' && src.diffMethod.trim() ? src.diffMethod : 'delong',
      compareResult: normalizeRocCompareResultModel(src.compareResult || null)
    };
  }

  function createDefaultRocNotesState(source = {}){
    const src = source && typeof source === 'object' ? source : {};
    return {
      text: src.text == null ? '' : String(src.text),
      open: !!src.open
    };
  }

  function normalizeRocCompareResultModel(source = null){
    const src = source && typeof source === 'object' ? source : null;
    if(!src){
      return null;
    }
    const result = src.result && typeof src.result === 'object' ? src.result : src;
    const diff = Number(result.diff);
    const p = Number(result.p);
    const ci = Array.isArray(result.ci)
      ? result.ci.map(value => Number(value)).filter(value => Number.isFinite(value))
      : null;
    return {
      graphType: String(src.graphType || '').toLowerCase() === 'pr' ? 'pr' : 'roc',
      diffMethod: typeof src.diffMethod === 'string' && src.diffMethod.trim() ? src.diffMethod : 'delong',
      resamplingSeed: normalizeRocResamplingSeed(src.resamplingSeed, ROC_RESAMPLING_DEFAULT_SEED),
      resamplingIterations: normalizeRocResamplingIterations(src.resamplingIterations, ROC_RESAMPLING_DEFAULT_ITERATIONS),
      compareSelection: src.compareSelection == null ? null : String(src.compareSelection),
      signature: src.signature == null ? '' : String(src.signature),
      displayText: src.displayText == null ? '' : String(src.displayText),
      result: {
        diff: Number.isFinite(diff) ? diff : null,
        p: Number.isFinite(p) ? p : null,
        ci: ci && ci.length >= 2 ? [ci[0], ci[1]] : null
      }
    };
  }

  function buildRocCompareResultSignature({ graphType, diffMethod, compareSelection, pairsA, pairsB, resamplingSeed, resamplingIterations, positiveClass, negativeClass, scoreDirection } = {}){
    const normalizePairs = pairs => (Array.isArray(pairs) ? pairs : []).map(pair => [
      pair?.label === 1 ? 1 : 0,
      Number.isFinite(Number(pair?.score)) ? Number(pair.score) : null
    ]);
    return JSON.stringify({
      graphType: String(graphType || 'roc').toLowerCase() === 'pr' ? 'pr' : 'roc',
      diffMethod: String(diffMethod || 'delong'),
      compareSelection: compareSelection == null ? null : String(compareSelection),
      resamplingSeed: normalizeRocResamplingSeed(resamplingSeed, ROC_RESAMPLING_DEFAULT_SEED),
      resamplingIterations: normalizeRocResamplingIterations(resamplingIterations, ROC_RESAMPLING_DEFAULT_ITERATIONS),
      positiveClass,
      negativeClass,
      scoreDirection: normalizeRocScoreDirection(scoreDirection),
      pairsA: normalizePairs(pairsA),
      pairsB: normalizePairs(pairsB)
    });
  }

  function buildRocAnalysisSignature({ data, graphType, positiveClass, negativeClass, scoreDirection, singleRocPMethod, diffMethod, compareSelection, resamplingSeed, resamplingIterations } = {}){
    return JSON.stringify({
      data: cloneSimple(Array.isArray(data) ? data : []) || [],
      graphType: String(graphType || 'roc').toLowerCase() === 'pr' ? 'pr' : 'roc',
      positiveClass,
      negativeClass,
      scoreDirection: normalizeRocScoreDirection(scoreDirection),
      singleRocPMethod: normalizeSingleRocPMethod(singleRocPMethod),
      diffMethod: String(diffMethod || 'delong'),
      compareSelection: compareSelection == null ? null : String(compareSelection),
      resamplingSeed: normalizeRocResamplingSeed(resamplingSeed, ROC_RESAMPLING_DEFAULT_SEED),
      resamplingIterations: normalizeRocResamplingIterations(resamplingIterations, ROC_RESAMPLING_DEFAULT_ITERATIONS)
    });
  }

  function getRocAnalysisData(hotInstance = state.hot){
    if(typeof hotInstance?.getIncludedDataMatrix === 'function'){
      return hotInstance.getIncludedDataMatrix() || [];
    }
    return Shared.hot?.getIncludedDataMatrix?.(hotInstance) || [];
  }

  function formatRocCompareResultText(graphType, diffMethod, diffResult){
    const result = diffResult && typeof diffResult === 'object' ? diffResult : {};
    const diff = Number(result.diff);
    const p = Number(result.p);
    const ci = Array.isArray(result.ci) ? result.ci : null;
    if(!Number.isFinite(diff) || !Number.isFinite(p)){
      return '';
    }
    const metric = graphType === 'roc' ? 'ΔAUC' : 'ΔAP';
    if(graphType === 'roc' && diffMethod === 'delong'){
      return `${metric} = ${diff.toFixed(3)}, p = ${formatPValue(p)}, CI = [${Number(ci?.[0]).toFixed(3)}, ${Number(ci?.[1]).toFixed(3)}]`;
    }
    if(diffMethod === 'bootstrap'){
      return `${metric} = ${diff.toFixed(3)}, p = ${formatPValue(p)}, CI = [${Number(ci?.[0]).toFixed(3)}, ${Number(ci?.[1]).toFixed(3)}]`;
    }
    if(diffMethod === 'permutation'){
      return `${metric} = ${diff.toFixed(3)}, p = ${formatPValue(p)}`;
    }
    return '';
  }

  function createDefaultRocAdvisorState(source = {}){
    const src = source && typeof source === 'object' ? source : {};
    return {
      open: !!src.open,
      activated: !!src.activated,
      answers: cloneSimple(src.answers) || {},
      lastApplied: cloneSimple(src.lastApplied) || null,
      context: cloneSimple(src.context) || null
    };
  }

  function getRocAdvisorState(session = null){
    const shaped = ensureRocSessionOwnershipShape(session || getActiveRocSessionForState());
    if(shaped){
      shaped.advisor = createDefaultRocAdvisorState(shaped.advisor || {});
      return shaped.advisor;
    }
    return rocAdvisorState;
  }

  function setRocAdvisorState(value, session = null){
    const next = createDefaultRocAdvisorState(value || {});
    const shaped = ensureRocSessionOwnershipShape(session || getActiveRocSessionForState());
    if(shaped){
      shaped.advisor = next;
      shaped.updatedAt = Date.now();
    }
    if(!shaped || isRocSessionActive(shaped)){
      Object.assign(rocAdvisorState, next);
    }
    return next;
  }

  function createDefaultRocRefs(root = null){
    return {
      root: root || null,
      tablePanel: null,
      graphPanel: null,
      panelResizer: null,
      svgBox: null,
      configPanel: null,
      hotWrapper: null,
      hotContainer: null,
      plotDiv: null,
      statsResults: null,
      statsControls: null,
      renderRow: null,
      renderButton: null,
      autoDrawNotice: null,
      showGrid: null,
      showFrame: null,
      fontSize: null,
      fontSizeVal: null,
      showLegend: null,
      graphType: null,
      positiveClass: null,
      negativeClass: null,
      scoreDirection: null,
      loadExampleBtn: null,
      importBtn: null,
      fileInput: null,
      openBtn: null,
      saveBtn: null,
      saveAsBtn: null,
      graphFileInput: null,
      notesControl: null,
      legendControl: null
    };
  }

  function createRocSession({ tabId, root = null, initialState = null } = {}){
    const normalizedTabId = String(tabId || '').trim();
    const source = initialState && typeof initialState === 'object' ? initialState : {};
    const durableSource = source.state && typeof source.state === 'object' ? source.state : source;
    return {
      componentKey: 'roc',
      tabId: normalizedTabId,
      root: root || null,
      state: createDefaultRocDurableState(durableSource),
      results: createDefaultRocResultsState({
        statsPanelModel: durableSource.statsPanelModel || durableSource.statsPanel || source.statsPanel || source.stats,
        compareSelection: durableSource.compareSelection || source.compareSelection || source.stats?.compareSelection,
        diffMethod: durableSource.diffMethod || source.diffMethod || source.stats?.diffMethod,
        compareResult: durableSource.compareResult || source.compareResult || source.stats?.compareResult
      }),
      refs: createDefaultRocRefs(root || null),
      cache: {
        render: null,
        emptyPayloadTemplate: cloneSimple(emptyPayloadTemplate) || null
      },
      listeners: new Map(),
      timers: {
        scheduleDraw: null,
        pendingDrawOptions: null,
        drawGeneration: 0
      },
      workers: new Map(),
      managers: {
        hot: null,
        autoDraw: null,
        dataViews: null,
        layout: null,
        fileHandle: null
      },
      notes: createDefaultRocNotesState(source.notes || durableSource.notes || {}),
      advisor: createDefaultRocAdvisorState(source.advisor || source.stats?.advisor || {}),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  function ensureRocSessionOwnershipShape(session){
    if(!session || typeof session !== 'object'){
      return null;
    }
    session.componentKey = 'roc';
    session.tabId = String(session.tabId || '').trim();
    session.root = session.root || null;
    session.state = createDefaultRocDurableState(session.state || {});
    session.results = createDefaultRocResultsState(session.results || {
      statsPanelModel: session.state.statsPanelModel,
      compareSelection: session.state.compareSelection,
      diffMethod: session.state.diffMethod,
      compareResult: session.state.compareResult
    });
    session.refs = session.refs && typeof session.refs === 'object' ? session.refs : createDefaultRocRefs(session.root || null);
    session.refs.root = session.refs.root || session.root || null;
    session.cache = session.cache && typeof session.cache === 'object' ? session.cache : {};
    if(!Object.prototype.hasOwnProperty.call(session.cache, 'render')){ session.cache.render = null; }
    if(!Object.prototype.hasOwnProperty.call(session.cache, 'emptyPayloadTemplate')){ session.cache.emptyPayloadTemplate = null; }
    session.listeners = session.listeners instanceof Map ? session.listeners : new Map();
    session.timers = session.timers && typeof session.timers === 'object' ? session.timers : {};
    if(!Object.prototype.hasOwnProperty.call(session.timers, 'scheduleDraw')){ session.timers.scheduleDraw = null; }
    if(!Object.prototype.hasOwnProperty.call(session.timers, 'pendingDrawOptions')){ session.timers.pendingDrawOptions = null; }
    if(!Number.isFinite(Number(session.timers.drawGeneration))){ session.timers.drawGeneration = 0; }
    session.workers = session.workers instanceof Map ? session.workers : new Map();
    session.managers = session.managers && typeof session.managers === 'object' ? session.managers : {};
    if(!Object.prototype.hasOwnProperty.call(session.managers, 'hot')){ session.managers.hot = null; }
    if(!Object.prototype.hasOwnProperty.call(session.managers, 'autoDraw')){ session.managers.autoDraw = null; }
    if(!Object.prototype.hasOwnProperty.call(session.managers, 'dataViews')){ session.managers.dataViews = null; }
    if(!Object.prototype.hasOwnProperty.call(session.managers, 'layout')){ session.managers.layout = null; }
    if(!Object.prototype.hasOwnProperty.call(session.managers, 'fileHandle')){ session.managers.fileHandle = null; }
    session.notes = createDefaultRocNotesState(session.notes || {});
    session.advisor = createDefaultRocAdvisorState(session.advisor || {});
    session.updatedAt = Number.isFinite(Number(session.updatedAt)) ? Number(session.updatedAt) : Date.now();
    return session;
  }

  function getRocSession(tabLike = null, meta = {}, options = {}){
    const tabId = normalizeRocSessionTabId(tabLike, meta);
    if(!tabId){
      return options.fallbackActive === true ? ensureRocSessionOwnershipShape(projectedRocSession) : null;
    }
    let session = rocSessionsByTabId.get(tabId) || null;
    if(!session && options.create !== false){
      session = createRocSession({ tabId, root: resolveRocRoot(tabId || null) || null });
      rocSessionsByTabId.set(tabId, session);
    }
    return ensureRocSessionOwnershipShape(session);
  }

  function getRocWorkspaceActiveTabId(){
    return String(Shared.componentLifecycle?.resolveWorkspaceActiveTabId?.('roc') || '').trim();
  }

  function getActiveRocSessionForState(){
    return Shared.componentLifecycle?.resolveActiveSessionForComponent?.({
      componentKey: 'roc',
      component: roc,
      projectedSession: projectedRocSession,
      getSession: getRocSession,
      ensureSession: ensureRocSessionOwnershipShape,
      create: true,
      reason: 'active-roc-session'
    }) || null;
  }

  function getRocTabIdFromTarget(target = null){
    return String(Shared.componentLifecycle?.resolveTabIdFromTarget?.(target) || '').trim();
  }

  function getRocSessionForEvent(event = null, meta = {}, options = {}){
    const target = event?.currentTarget || event?.target || meta?.target || null;
    const tabId = normalizeRocSessionTabId(getRocTabIdFromTarget(target) || meta?.tabId || null, meta || {});
    return tabId
      ? getRocSession(tabId, { ...(meta || {}), tabId, reason: meta?.reason || 'roc-event-owner' }, { create: options.create !== false })
      : getActiveRocSessionForState();
  }

  function runRocControlOwner(event, reason, callback){
    const session = getRocSessionForEvent(event, { reason }, { create: true });
    if(session?.tabId && !isRocSessionActiveOrActivating(session)){
      console.debug('Debug: roc control callback skipped for inactive owner', {
        tabId: session.tabId || null,
        activeTabId: getRocProjectionTabId() || null,
        reason: reason || 'roc-control-owner'
      });
      return undefined;
    }
    return typeof callback === 'function' ? callback(session) : undefined;
  }


  function getRocDeactivationTabId(tab, meta = {}){
    return (tab && typeof tab === 'object' ? tab.id : tab) || meta?.tabId || null;
  }

  function getRocDeactivationSession(tab, meta = {}){
    const tabId = getRocDeactivationTabId(tab, meta);
    const activeSession = getActiveRocSessionForState();
    const activeTabId = getRocProjectionTabId() || activeSession?.tabId || null;
    if(tabId && activeTabId && String(tabId) !== String(activeTabId)){
      return getRocSession(tabId, { ...(meta || {}), tabId, reason: meta?.reason || 'roc-deactivate-target-session' }, { create: false });
    }
    return activeSession || (tabId ? getRocSession(tabId, { ...(meta || {}), tabId, reason: meta?.reason || 'roc-deactivate-active-session' }, { create: false }) : null);
  }

  function captureRocSessionForDeactivation(tab, meta = {}){
    const tabId = getRocDeactivationTabId(tab, meta);
    const activeSession = getActiveRocSessionForState();
    const activeTabId = getRocProjectionTabId() || activeSession?.tabId || null;
    const targetSession = getRocDeactivationSession(tab, meta);
    if(tabId && activeTabId && String(tabId) !== String(activeTabId)){
      if(targetSession){
        targetSession.state.drawPending = false;
        targetSession.updatedAt = Date.now();
      }
      console.debug('Debug: roc inactive-tab deactivate skipped active mirror capture', {
        tabId,
        activeTabId,
        reason: meta?.reason || 'deactivate-tab'
      });
      return targetSession;
    }
    if(targetSession){
      captureRocSessionStateFromActive(targetSession, {
        ...(meta || {}),
        reason: meta?.reason || 'deactivate-tab',
        captureStatsPanel: false
      });
    }
    return targetSession;
  }

  function syncRocSessionRefsFromActive(session = null){
    const shaped = ensureRocSessionOwnershipShape(session || projectedRocSession || getActiveRocSessionForState());
    if(!shaped){ return null; }
    if(shaped.tabId && !isRocSessionActiveOrActivating(shaped)){
      return shaped;
    }
    shaped.root = refs.root || shaped.root || state.root || null;
    shaped.refs = Object.assign(createDefaultRocRefs(shaped.root || null), shaped.refs || {}, refs || {});
    shaped.refs.root = refs.root || shaped.refs.root || shaped.root || state.root || null;
    shaped.refs.notesControl = canUseRocNotesControl(notesState.control) ? notesState.control : null;
    shaped.refs.legendControl = rocLegendControl || shaped.refs.legendControl || null;
    shaped.updatedAt = Date.now();
    return shaped;
  }

  function refreshRocActiveDomRefsForSession(session = null, meta = {}) {
    const shaped = ensureRocSessionOwnershipShape(session || getActiveRocSessionForState());
    if(!shaped || (shaped.tabId && !isRocSessionActiveOrActivating(shaped))){
      return shaped;
    }
    const root = resolveRocRoot(shaped.tabId || null) || shaped.root || state.root || refs.root || null;
    if(root){
      state.root = root;
      refs.root = root;
      shaped.root = root;
      shaped.refs.root = root;
    }
    if(typeof ensureElements === 'function'){
      ensureElements();
    }
    shaped.root = refs.root || state.root || shaped.root || null;
    shaped.refs = Object.assign(createDefaultRocRefs(shaped.root || null), shaped.refs || {}, refs || {});
    shaped.refs.root = refs.root || shaped.root || null;
    shaped.updatedAt = Date.now();
    console.debug('Debug: roc active DOM refs refreshed for owner session', {
      tabId: shaped.tabId || null,
      reason: meta?.reason || null,
      hasRoot: !!shaped.root,
      hasHotWrapper: !!refs.hotWrapper
    });
    return shaped;
  }

  function getRocHotOwnerTabId(hotInstance){
    return String(Shared.componentLifecycle?.resolveOwnedObjectTabId?.(hotInstance, 'roc') || '').trim();
  }

  const rocHotBelongsToSession = (hotInstance, session) => (
    Shared.componentLifecycle?.ownedHotBelongsToSession?.(hotInstance, session, 'roc', {
      allowMissingSessionTabId: true
    }) === true
  );

  function getRocSessionForHot(hotInstance = null, meta = {}, options = {}){
    const tabId = getRocHotOwnerTabId(hotInstance);
    if(tabId){
      return getRocSession(tabId, { ...(meta || {}), tabId }, { create: options.create === true });
    }
    return options.fallbackActive === false ? null : getActiveRocSessionForState();
  }

  const rocDataViewsManagerBelongsToSession = (manager = null, session = null) => (
    Shared.componentLifecycle?.ownedDataViewsManagerBelongsToSession?.(manager, session, 'roc', {
      ensureSession: ensureRocSessionOwnershipShape
    }) === true
  );

  function isRocSessionActive(session = null){
    const shaped = ensureRocSessionOwnershipShape(session);
    if(!shaped?.tabId){
      return false;
    }
    const tabId = String(shaped.tabId || '').trim();
    const workspaceActiveTabId = getRocWorkspaceActiveTabId();
    if(workspaceActiveTabId){
      return workspaceActiveTabId === tabId;
    }
    return tabId === String(getRocProjectionTabId());
  }

  function isRocSessionActiveOrActivating(session = null){
    const shaped = ensureRocSessionOwnershipShape(session);
    if(!shaped?.tabId){ return false; }
    const workspaceActiveTabId = global.Main?.session?.workspaceState?.activeTabId || null;
    return isRocSessionActive(shaped)
      || (workspaceActiveTabId && String(shaped.tabId) === String(workspaceActiveTabId));
  }

  function scheduleRocDrawForSession(session = null, options = {}){
    const shaped = ensureRocSessionOwnershipShape(session);
    if(!shaped){
      return false;
    }
    if(Shared.hot?.shouldDeferOwnerProjectionDraw?.(shaped, options)){
      return false;
    }
    const sourceOptions = options && typeof options === 'object' ? options : {};
    const scheduleOptions = {
      ...sourceOptions,
      tabId: shaped.tabId || undefined,
      reason: sourceOptions.reason || 'roc-session-draw'
    };
    const lifecycleMeta = {
      ...scheduleOptions,
      tabId: shaped.tabId || scheduleOptions.tabId || null,
      componentKey: 'roc',
      source: scheduleOptions.source || 'roc-session-scheduler',
      forceDraw: scheduleOptions.forceDraw === true,
      userInitiated: scheduleOptions.userInitiated === true
    };
    if(Shared.componentLifecycle?.shouldSuppressDraw?.('roc', lifecycleMeta)){
      Shared.componentLifecycle?.emitLifecycleEvent?.({
        componentKey: 'roc',
        tabId: lifecycleMeta.tabId,
        action: 'draw-suppressed',
        reason: lifecycleMeta.reason,
        details: { source: lifecycleMeta.source }
      });
      return false;
    }
    shaped.timers.drawGeneration = Number(shaped.timers.drawGeneration || 0) + 1;
    scheduleOptions.drawGeneration = shaped.timers.drawGeneration;
    const pendingDrawOptions = sanitizeRocDrawOptions(scheduleOptions);
    shaped.timers.pendingDrawOptions = pendingDrawOptions;
    shaped.state.drawPending = true;
    if(isRocSessionActiveOrActivating(shaped)){
      state.drawPending = true;
    }
    shaped.updatedAt = Date.now();
    if(!isRocSessionActiveOrActivating(shaped)){
      shaped.state.drawPending = true;
      console.debug('Debug: roc draw scheduled for inactive owner', {
        tabId: shaped.tabId || null,
        reason: scheduleOptions.reason || null
      });
      return false;
    }
    const scheduler = shaped.timers?.scheduleDraw || state.scheduleDraw;
    if(typeof scheduler !== 'function'){
      return false;
    }
    scheduler(sanitizeRocDrawOptions(scheduleOptions));
    return true;
  }

  function scheduleActiveRocDraw(options = {}){
    return scheduleRocDrawForSession(getActiveRocSessionForState(), options);
  }

  function normalizeRocLabelPositions(value){
    return cloneSimple(value) || { title: null, xLabel: null, yLabel: null, legend: null };
  }

  function patchRocVisualState(session = null, patch = {}, meta = {}){
    const owner = ensureRocSessionOwnershipShape(session || getActiveRocSessionForState());
    const hasTitle = Object.prototype.hasOwnProperty.call(patch || {}, 'titleText');
    const hasPositions = Object.prototype.hasOwnProperty.call(patch || {}, 'labelPositions');
    const nextTitle = hasTitle ? String(patch.titleText == null ? '' : patch.titleText) : state.titleText;
    const nextPositions = hasPositions ? normalizeRocLabelPositions(patch.labelPositions) : normalizeRocLabelPositions(state.labelPositions);
    if(owner?.state){
      if(hasTitle){
        owner.state.titleText = nextTitle;
      }
      if(hasPositions){
        owner.state.labelPositions = nextPositions;
      }
      owner.updatedAt = Date.now();
      console.debug('Debug: roc visual state patched to owner session', {
        tabId: owner.tabId || null,
        reason: meta?.reason || null,
        title: hasTitle,
        labelPositions: hasPositions
      });
    }
    if(!owner || isRocSessionActiveOrActivating(owner)){
      if(hasTitle){ state.titleText = nextTitle; }
      if(hasPositions){ state.labelPositions = nextPositions; }
    }
    return { titleText: nextTitle, labelPositions: nextPositions };
  }

  function patchRocLabelPosition(session = null, key, value, meta = {}){
    const nextPositions = normalizeRocLabelPositions({
      ...normalizeRocLabelPositions(state.labelPositions),
      [key]: value || null
    });
    return patchRocVisualState(session, { labelPositions: nextPositions }, meta);
  }

  function syncRocSessionManagersFromActive(session = null){
    const shaped = ensureRocSessionOwnershipShape(session || projectedRocSession || getActiveRocSessionForState());
    if(!shaped){ return null; }
    const sessionIsActive = !shaped.tabId || isRocSessionActiveOrActivating(shaped);
    const hotBelongsToSession = rocHotBelongsToSession(state.hot, shaped);
    if(hotBelongsToSession){
      shaped.managers.hot = state.hot;
    }
    if(sessionIsActive){
      shaped.managers.autoDraw = rocAutoDrawManager || null;
    }
    if(hotBelongsToSession){
      const manager = state.hot?.__rocDataViewsManager || null;
      shaped.managers.dataViews = rocDataViewsManagerBelongsToSession(manager, shaped) ? manager : shaped.managers.dataViews || null;
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

  function canUseRocNotesControl(noteControl){
    if(!noteControl){ return false; }
    const root = state.root || refs.root || resolveRocRoot(getRocProjectionTabId() || null);
    const controlRoot = noteControl.root || null;
    if(controlRoot){
      return !!controlRoot.isConnected && (!root || root === controlRoot || root.contains?.(controlRoot));
    }
    return !!root && (!noteControl.element || root.contains?.(noteControl.element));
  }

  function setRocFileHandleForSession(handle, session = null){
    const owner = ensureRocSessionOwnershipShape(session || getActiveRocSessionForState());
    if(owner?.managers){
      owner.managers.fileHandle = handle || null;
      owner.updatedAt = Date.now();
    }
    if(!owner || isRocSessionActiveOrActivating(owner)){
      state.fileHandle = handle || null;
    }
    return handle || null;
  }

  function setRocFileNameForSession(name, session = null){
    const nextName = name || 'roc.graph';
    const owner = ensureRocSessionOwnershipShape(session || getActiveRocSessionForState());
    if(owner?.state){
      owner.state.fileName = nextName;
      owner.updatedAt = Date.now();
    }
    if(!owner || isRocSessionActiveOrActivating(owner)){
      state.fileName = nextName;
    }
    return nextName;
  }

  function captureRocNotesMirror(){
    const noteControl = canUseRocNotesControl(notesState.control) ? notesState.control : null;
    const text = noteControl && typeof noteControl.getValue === 'function'
      ? noteControl.getValue()
      : (notesState.text || '');
    const open = noteControl && typeof noteControl.isOpen === 'function'
      ? noteControl.isOpen()
      : !!notesState.open;
    notesState.text = text == null ? '' : String(text);
    notesState.open = !!open;
    return createDefaultRocNotesState(notesState);
  }

  function captureRocSessionStateFromActive(session = null, meta = {}){
    const shaped = ensureRocSessionOwnershipShape(session || getActiveRocSessionForState());
    if(!shaped){ return null; }
    if(shaped.tabId && !isRocSessionActiveOrActivating(shaped)){
      shaped.updatedAt = Date.now();
      return shaped;
    }
    if(meta.syncControls !== false){
      syncRocRuntimeControlsFromDom();
    }
    const statsPanelModel = createDefaultRocStatsPanelModel(state.statsPanelModel || {});
    shaped.state = createDefaultRocDurableState({
      borderWidth: state.borderWidth,
      labelColors: state.labelColors,
      labelStrokeWidth: state.labelStrokeWidth,
      labelOpacity: state.labelOpacity,
      labelLinePattern: state.labelLinePattern,
      diffMethod: state.diffMethod,
      singleRocPMethod: state.singleRocPMethod,
      resamplingSeed: state.resamplingSeed,
      resamplingIterations: state.resamplingIterations,
      compareSelection: state.compareSelection || state.compareSel?.value || null,
      minSvgWidth: state.minSvgWidth,
      fileName: state.fileName,
      titleText: state.titleText,
      axisSettings: state.axisSettings,
      gridStyle: state.gridStyle,
      autoDrawEnabled: state.autoDrawEnabled,
      autoDrawReason: state.autoDrawReason,
      autoDrawLockedByThreshold: state.autoDrawLockedByThreshold,
      drawPending: false,
      lastDataShape: state.lastDataShape,
      lastAutoDrawEvaluation: state.lastAutoDrawEvaluation,
      labelPositions: state.labelPositions,
      statsPanelModel,
      analysisSignature: state.analysisSignature,
      statsPanelSignature: state.statsPanelSignature,
      positiveClass: state.positiveClass,
      negativeClass: state.negativeClass,
      scoreDirection: state.scoreDirection,
      controls: state.controls
    });
    shaped.results = createDefaultRocResultsState({
      statsPanelModel,
      compareSelection: shaped.state.compareSelection,
      diffMethod: shaped.state.diffMethod,
      compareResult: state.compareResultModel
    });
    shaped.notes = captureRocNotesMirror();
    shaped.advisor = createDefaultRocAdvisorState(getRocAdvisorState(shaped));
    syncRocSessionRefsFromActive(shaped);
    syncRocSessionManagersFromActive(shaped);
    shaped.updatedAt = Date.now();
    return shaped;
  }

  function applyRocSessionStateToActive(session = null, options = {}){
    const shaped = ensureRocSessionOwnershipShape(session || getActiveRocSessionForState());
    if(!shaped){ return false; }
    state.borderWidth = Number.isFinite(Number(shaped.state.borderWidth)) ? Number(shaped.state.borderWidth) : DEFAULT_ROC_BORDER_WIDTH;
    state.labelColors = cloneSimple(shaped.state.labelColors) || {};
    state.labelStrokeWidth = cloneSimple(shaped.state.labelStrokeWidth) || {};
    state.labelOpacity = cloneSimple(shaped.state.labelOpacity) || {};
    state.labelLinePattern = cloneSimple(shaped.state.labelLinePattern) || {};
    state.diffMethod = shaped.state.diffMethod || 'delong';
    state.singleRocPMethod = normalizeSingleRocPMethod(shaped.state.singleRocPMethod);
    state.resamplingSeed = normalizeRocResamplingSeed(shaped.state.resamplingSeed, ROC_RESAMPLING_DEFAULT_SEED);
    state.resamplingIterations = normalizeRocResamplingIterations(shaped.state.resamplingIterations, ROC_RESAMPLING_DEFAULT_ITERATIONS);
    state.compareSelection = shaped.results.compareSelection || shaped.state.compareSelection || null;
    state.minSvgWidth = Number.isFinite(Number(shaped.state.minSvgWidth)) ? Number(shaped.state.minSvgWidth) : 0;
    state.fileName = shaped.state.fileName || state.fileName || 'roc.graph';
    state.titleText = shaped.state.titleText != null ? String(shaped.state.titleText) : 'ROC curve';
    state.axisSettings = cloneSimple(shaped.state.axisSettings) || createDefaultAxisSettings();
    state.gridStyle = cloneSimple(shaped.state.gridStyle) || null;
    state.autoDrawEnabled = !!shaped.state.autoDrawEnabled;
    state.autoDrawReason = shaped.state.autoDrawReason || null;
    state.autoDrawLockedByThreshold = !!shaped.state.autoDrawLockedByThreshold;
    state.drawPending = false;
    state.lastDataShape = cloneSimple(shaped.state.lastDataShape) || { rows: 0, cols: 0 };
    state.lastAutoDrawEvaluation = cloneSimple(shaped.state.lastAutoDrawEvaluation) || null;
    state.labelPositions = cloneSimple(shaped.state.labelPositions) || { title: null, xLabel: null, yLabel: null, legend: null };
    state.statsPanelModel = createDefaultRocStatsPanelModel(shaped.results.statsPanelModel || shaped.state.statsPanelModel || {});
    state.analysisSignature = shaped.state.analysisSignature || '';
    state.statsPanelSignature = shaped.state.statsPanelSignature || '';
    state.positiveClass = shaped.state.positiveClass;
    state.negativeClass = shaped.state.negativeClass;
    state.scoreDirection = normalizeRocScoreDirection(shaped.state.scoreDirection);
    state.compareResultModel = normalizeRocCompareResultModel(shaped.results.compareResult || null);
    state.controls = normalizeRocRuntimeControls(shaped.state.controls || {});
    state.fileHandle = shaped.managers.fileHandle || state.fileHandle || null;
    if(options.restoreEmptyPayload !== false && shaped.cache?.emptyPayloadTemplate){
      emptyPayloadTemplate = cloneSimple(shaped.cache.emptyPayloadTemplate) || emptyPayloadTemplate;
    }
    if(!state.root && shaped.root){
      state.root = shaped.root;
    }
    if(!refs.root && shaped.refs?.root){
      refs.root = shaped.refs.root;
    }
    notesState.text = shaped.notes.text || '';
    notesState.open = !!shaped.notes.open;
    if(canUseRocNotesControl(notesState.control)){
      notesState.control.setValue(notesState.text);
      notesState.control.setOpen(notesState.open);
    }
    setRocAdvisorState(shaped.advisor || {}, shaped);
    if(options.syncUi !== false){
      syncRocRuntimeControlsFromState(state.controls);
      renderStatsControls();
      populateRocCompareOptions(getRocSeriesNamesFromHot());
      restoreRocCompareResultControl();
      restoreRocStatsPanelModel(state.statsPanelModel);
    }
    if(rocAutoDrawManager && options.syncUi !== false){
      rocAutoDrawManager.setElements?.({
        renderRow: refs.renderRow,
        renderButton: refs.renderButton,
        notice: refs.autoDrawNotice
      });
      rocAutoDrawManager.updateUi?.();
      rocAutoDrawManager.evaluateThresholds?.();
    }
    shaped.updatedAt = Date.now();
    return true;
  }

  function bindRocSessionForTab(tabLike = null, meta = {}, options = {}){
    const tabId = normalizeRocSessionTabId(tabLike, meta);
    if(!tabId){ return null; }
    if(projectedRocSession && projectedRocSession.tabId && projectedRocSession.tabId !== tabId){
      captureRocSessionStateFromActive(projectedRocSession, {
        reason: meta?.reason || 'roc-session-switch-capture',
        captureStatsPanel: false
      });
    }
    const session = getRocSession(tabId, { ...(meta || {}), tabId, reason: meta?.reason || 'roc-session-bind' }, { create: true });
    if(!session){ return null; }
    const root = meta?.root || resolveRocRoot(tabLike || tabId || null) || session.root || null;
    session.root = root || session.root || null;
    session.refs.root = root || session.refs.root || null;
    projectedRocSession = session;
    roc.__rocSessionTabId = session.tabId;
    if(options.passiveBound !== false){
      roc.__boundTabId = session.tabId;
    }
    refreshRocActiveDomRefsForSession(session, meta);
    if(options.apply !== false){
      applyRocSessionStateToActive(session, { syncUi: options.syncUi !== false });
    }
    return session;
  }

  function setRocSessionStateFromRuntimeRecord(record, meta = {}){
    if(!record || typeof record !== 'object'){
      return null;
    }
    const tabId = normalizeRocSessionTabId(meta?.tab || meta?.tabId || record.tabId || null, meta);
    if(!tabId){ return null; }
    const session = getRocSession(tabId, { ...(meta || {}), tabId, reason: meta?.reason || 'roc-session-state-from-runtime' }, { create: true });
    if(!session){ return null; }
    const runtimeState = record.state && typeof record.state === 'object' ? record.state : record;
    session.state = createDefaultRocDurableState(runtimeState);
    session.results = createDefaultRocResultsState({
      statsPanelModel: runtimeState.statsPanelModel || runtimeState.statsPanel || record.statsPanel || record.stats,
      compareSelection: runtimeState.compareSelection,
      diffMethod: runtimeState.diffMethod,
      compareResult: runtimeState.compareResult || record.compareResult || record.stats?.compareResult
    });
    session.notes = createDefaultRocNotesState(record.notes || runtimeState.notes || {});
    session.advisor = createDefaultRocAdvisorState(record.advisor || record.stats?.advisor || {});
    session.updatedAt = Date.now();
    return session;
  }

  // PART: STATE
  function resolveRocRoot(tabLike){
    return Shared.workspaceTabs?.resolveComponentRoot?.({
      tabLike: tabLike || null,
      componentKey: 'roc',
      currentRoot: state.root,
      staticRootId: 'rocPage'
    }) || null;
  }

  function queryRocRoot(selector, tabLike){
    const root = resolveRocRoot(tabLike);
    if(!root || !selector){
      return null;
    }
    return root.querySelector?.(selector) || null;
  }

  function getRocNodeById(id, tabLike){
    if(!id){
      return null;
    }
    const root = resolveRocRoot(tabLike);
    if(root?.getElementById){
      const byId = root.getElementById(id);
      if(byId){
        return byId;
      }
    }
    return root?.querySelector?.(`#${id}`) || null;
  }

  function resolveRocDrawableFrame(plotEl){
    const plot = plotEl || refs.plotDiv || getRocNodeById('rocPlot');
    const svgBox = refs.svgBox
      || state.layout?.elements?.svgBox
      || plot?.closest?.('.svgbox')
      || queryRocRoot('#rocGraphPanel .svgbox')
      || null;
    const frame = Shared.componentLayout?.resolveDrawableFrame?.({
      componentName: 'roc',
      plot,
      svgBox,
      graphPanel: refs.graphPanel || queryRocRoot('#rocGraphPanel')
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

  function scheduleRocViewRefresh(reason, extraOptions){
    const options = (extraOptions && typeof extraOptions === 'object') ? extraOptions : {};
    const nextReason = reason || options.reason || 'roc-view-refresh';
    const ownerTabId = normalizeRocSessionTabId(options.tabId || options.workspaceTabId || options.tab?.id || getRocProjectionTabId() || null, {});
    const ownerSession = ownerTabId
      ? getRocSession(ownerTabId, { tabId: ownerTabId, reason: nextReason }, { create: false })
      : getActiveRocSessionForState();
    const activeTabId = normalizeRocSessionTabId(getRocProjectionTabId() || null, {});
    if(!ownerTabId || ownerTabId === activeTabId){
      syncRocRuntimeControlsFromDom();
    }
    const normalizedReason = String(nextReason || '').toLowerCase();
    const passiveReason = normalizedReason.includes('restore')
      || normalizedReason.includes('payload')
      || normalizedReason.includes('programmatic')
      || normalizedReason.includes('auto')
      || normalizedReason.includes('init')
      || normalizedReason.includes('observer')
      || normalizedReason.includes('layout')
      || normalizedReason.includes('sync');
    const lifecycleMeta = {
      tabId: ownerTabId || getRocProjectionTabId() || null,
      reason: nextReason,
      source: 'roc-view-refresh',
      forceDraw: options.force === true,
      userInitiated: options.userInitiated === true || (options.userInitiated !== false && !passiveReason)
    };
    if(Shared.componentLifecycle?.shouldSuppressDraw?.('roc', lifecycleMeta)){
      console.debug('Debug: roc view refresh suppressed by lifecycle', { reason: nextReason, tabId: lifecycleMeta.tabId || null });
      Shared.componentLifecycle?.emitLifecycleEvent?.({ componentKey: 'roc', tabId: lifecycleMeta.tabId || null, action: 'draw-suppressed', reason: nextReason, details: { source: 'roc-view-refresh' } });
      return;
    }
    const scheduleOptions = Object.assign({}, options, {
      tabId: ownerTabId || options.tabId || undefined,
      viewOnly: true,
      reason: nextReason,
      source: 'roc-view-refresh',
      forceDraw: lifecycleMeta.forceDraw === true,
      userInitiated: lifecycleMeta.userInitiated === true
    });
    scheduleRocDrawForSession(ownerSession || getActiveRocSessionForState(), scheduleOptions);
  }

  function releaseRocPostRestoreSuppression(reason, options = {}){
    const tabId = options?.tabId || options?.session?.tabId || getRocProjectionTabId() || getActiveRocSessionForState()?.tabId || null;
    if(!tabId){
      return;
    }
    const meta = { tabId, reason: reason || 'roc-user-control' };
    Shared.componentLifecycle?.clearPostRestoreDrawSuppression?.('roc', meta);
    Shared.componentLayout?.releaseSuppressedSchedulesFor?.('roc', meta);
  }

  function scheduleRocControlDraw(reason, options = {}){
    const ownerSession = ensureRocSessionOwnershipShape(options?.session || getRocSessionForEvent(options?.event || null, { tabId: options?.tabId || null, reason: reason || 'roc-control' }, { create: false }) || getActiveRocSessionForState());
    releaseRocPostRestoreSuppression(reason, { tabId: ownerSession?.tabId || options?.tabId || null, session: ownerSession });
    scheduleRocDrawForSession(ownerSession, {
      ...(options || {}),
      tabId: ownerSession?.tabId || options?.tabId || undefined,
      reason: reason || 'roc-control',
      userInitiated: true
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
      scheduleRocViewRefresh('font-style-change', { tabId: detail.tabId || null });
    });
    rocFontEventBound = true;
  }

  const rocUndoManager = Shared.undoManager || null;
  function persistRocTabState(reason){
    try{
      const sess = window.Main?.session;
      if(sess && typeof sess.persistUserModifiedTabState === 'function'){
        sess.persistUserModifiedTabState(undefined, { reason: reason || 'roc-stats-change' });
      }else if(sess && typeof sess.persistActiveTabState === 'function'){
        sess.persistActiveTabState(undefined, { reason: reason || 'roc-stats-change', origin: 'user' });
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
    const recorder = Shared.styleUndo?.recordStateChange || (opts => rocUndoManager.recordStateChange(opts));
    recorder({
      manager: rocUndoManager,
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
    scheduleActiveRocDraw({ reason: 'roc-label-color-change' });
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
  function createDefaultRocRuntimeControls(){
    return { graphType: 'roc', showGrid: false, showFrame: false, showLegend: true, fontSize: '12' };
  }

  function normalizeRocRuntimeControls(source = {}){
    const defaults = createDefaultRocRuntimeControls();
    const src = source && typeof source === 'object' ? source : {};
    return {
      graphType: String(src.graphType || defaults.graphType).toLowerCase() === 'pr' ? 'pr' : 'roc',
      showGrid: !!src.showGrid,
      showFrame: !!src.showFrame,
      showLegend: src.showLegend !== false,
      fontSize: src.fontSize != null ? String(src.fontSize) : defaults.fontSize
    };
  }

  function syncRocRuntimeControlsFromDom(session = null){
    state.controls = normalizeRocRuntimeControls({
      ...(state.controls || {}),
      graphType: refs.graphType?.value,
      showGrid: refs.showGrid ? !!refs.showGrid.checked : state.controls?.showGrid,
      showFrame: refs.showFrame ? !!refs.showFrame.checked : state.controls?.showFrame,
      showLegend: refs.showLegend ? !!refs.showLegend.checked : state.controls?.showLegend,
      fontSize: refs.fontSize?.value
    });
    const ownerSession = ensureRocSessionOwnershipShape(session || getActiveRocSessionForState());
    if(ownerSession?.state){
      ownerSession.state.controls = cloneSimple(state.controls) || createDefaultRocRuntimeControls();
      ownerSession.updatedAt = Date.now();
    }
    return state.controls;
  }

  function syncRocRuntimeControlsFromEvent(options = {}){
    const ownerSession = ensureRocSessionOwnershipShape(options?.session || getRocSessionForEvent(options?.event || null, { tabId: options?.tabId || null, reason: options?.reason || 'roc-control-event' }, { create: false }) || getActiveRocSessionForState());
    const previousControls = normalizeRocRuntimeControls(state.controls || {});
    const nextControls = syncRocRuntimeControlsFromDom(ownerSession);
    if(options.updateDefaultTitleOnGraphTypeChange === true && previousControls.graphType !== nextControls.graphType){
      const previousDefaultTitle = getDefaultRocTitle(previousControls.graphType);
      if(state.titleText == null || state.titleText === '' || state.titleText === previousDefaultTitle || isDefaultRocTitle(state.titleText)){
        state.titleText = getDefaultRocTitle(nextControls.graphType);
      }
    }
    if(ownerSession?.state){
      ownerSession.state.controls = cloneSimple(nextControls) || createDefaultRocRuntimeControls();
      ownerSession.state.titleText = state.titleText;
      ownerSession.updatedAt = Date.now();
    }
    return nextControls;
  }

  function syncRocClassificationControls(rawLabels = null){
    const labels = Array.isArray(rawLabels)
      ? rawLabels
      : ((state.hot?.getIncludedDataMatrix?.() || state.hot?.getData?.() || []).slice(1).map(row => row?.[0]));
    const setup = resolveRocClassificationSetup(labels, state);
    state.positiveClass = setup.positiveClass;
    state.negativeClass = setup.negativeClass;
    state.scoreDirection = setup.scoreDirection;
    if(refs.positiveClass){
      refs.positiveClass.innerHTML = '';
      setup.classes.forEach((value, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.dataset.rocClassKey = rocClassKey(value);
        option.textContent = formatRocClassValue(value);
        option.selected = value === setup.positiveClass;
        refs.positiveClass.appendChild(option);
      });
      refs.positiveClass.disabled = !setup.valid;
    }
    if(refs.negativeClass){
      refs.negativeClass.value = setup.negativeClass === undefined ? '' : formatRocClassValue(setup.negativeClass);
    }
    if(refs.scoreDirection){
      refs.scoreDirection.value = setup.scoreDirection;
    }
    const session = getActiveRocSessionForState();
    if(session?.state){
      session.state.positiveClass = setup.positiveClass;
      session.state.negativeClass = setup.negativeClass;
      session.state.scoreDirection = setup.scoreDirection;
      session.updatedAt = Date.now();
    }
    return setup;
  }

  function projectRocClassificationControlsFromState(){
    const classes = [state.positiveClass, state.negativeClass].filter(value => value !== undefined);
    if(refs.positiveClass){
      refs.positiveClass.innerHTML = '';
      classes.forEach((value, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.dataset.rocClassKey = rocClassKey(value);
        option.textContent = formatRocClassValue(value);
        option.selected = index === 0;
        refs.positiveClass.appendChild(option);
      });
      refs.positiveClass.disabled = classes.length !== 2;
    }
    if(refs.negativeClass){
      refs.negativeClass.value = state.negativeClass === undefined ? '' : formatRocClassValue(state.negativeClass);
    }
    if(refs.scoreDirection){
      refs.scoreDirection.value = normalizeRocScoreDirection(state.scoreDirection);
    }
  }

  function invalidateRocAnalysisResults(session){
    state.compareResultModel = null;
    state.statsPanelModel = { resultsModel: null, reportModel: null };
    state.analysisSignature = '';
    state.statsPanelSignature = '';
    if(session){
      session.cache.render = null;
      session.state.statsPanelModel = createDefaultRocStatsPanelModel(state.statsPanelModel);
      session.state.analysisSignature = '';
      session.state.statsPanelSignature = '';
      session.results = createDefaultRocResultsState({
        compareSelection: state.compareSelection,
        diffMethod: state.diffMethod,
        compareResult: null,
        statsPanelModel: state.statsPanelModel
      });
      session.updatedAt = Date.now();
    }
    commitRocCompareStateToSession(session, { compareResult: null });
  }

  function applyRocClassificationSetting(key, value, session, reason){
    if(key === 'scoreDirection'){
      state.scoreDirection = normalizeRocScoreDirection(value);
    }else{
      state.positiveClass = value;
    }
    const data = state.hot?.getIncludedDataMatrix?.() || state.hot?.getData?.() || [];
    const header = data[0] || [];
    const labelIndex = Math.max(0, header.findIndex(cell => String(cell).trim().toLowerCase() === 'label'));
    const setup = syncRocClassificationControls(data.slice(1).map(row => row?.[labelIndex]));
    if(session?.state){
      session.state.positiveClass = setup.positiveClass;
      session.state.negativeClass = setup.negativeClass;
      session.state.scoreDirection = setup.scoreDirection;
    }
    invalidateRocAnalysisResults(session);
    persistRocTabState(reason);
    scheduleRocControlDraw(reason, { session, force: true });
    return setup;
  }

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

  function pinRocStatsReportAfterMetrics(target = null){
    const root = target || refs.statsResults;
    if(!root || typeof root.appendChild !== 'function'){
      return false;
    }
    const containers = [root, ...Array.from(root.querySelectorAll?.('.stats-results-main') || [])];
    let moved = false;
    containers.forEach(container => {
      const reportNodes = Array.from(container.querySelectorAll?.('.stats-report-host, .stats-report-panel') || [])
        .map(node => {
          let top = node;
          while(top?.parentNode && top.parentNode !== container){
            top = top.parentNode;
          }
          return top && top.parentNode === container ? top : null;
        })
        .filter((node, index, list) => node && list.indexOf(node) === index);
      reportNodes.forEach(node => {
        if(node.parentNode === container && container.lastElementChild !== node){
          container.appendChild(node);
          moved = true;
        }
      });
    });
    return moved;
  }

  function scheduleRocStatsReportOrderPin(){
    const run = () => pinRocStatsReportAfterMetrics(getRocNodeById('rocStatsResults') || refs.statsResults || null);
    const ownerTabId = getRocProjectionTabId() || getActiveRocSessionForState()?.tabId || null;
    run();
    if(!ownerTabId || !Shared.componentLifecycle?.scheduleComponentFrame || !Shared.componentLifecycle?.scheduleComponentTimeout){
      run();
      return;
    }
    Shared.componentLifecycle.scheduleComponentFrame(roc, 'roc', {
      tabId: ownerTabId,
      reason: 'roc-stats-report-pin-frame'
    }, run);
    [80, 250].forEach(delay => {
      Shared.componentLifecycle.scheduleComponentTimeout(roc, 'roc', {
        tabId: ownerTabId,
        reason: 'roc-stats-report-pin-timeout'
      }, run, delay);
    });
  }

  function normalizeRocStatsPanelModel(source = {}){
    if(Shared.statsReporting && typeof Shared.statsReporting.normalizeSavedPanelModel === 'function'){
      return Shared.statsReporting.normalizeSavedPanelModel(source);
    }
    const src = source && typeof source === 'object' ? source : {};
    return { resultsModel: cloneSimple(src.resultsModel) || null, reportModel: cloneSimple(src.reportModel) || null };
  }

  function captureRocStatsPanelModel(fallback = null){
    const previous = normalizeRocStatsPanelModel(fallback || state.statsPanelModel || {});
    if(!refs.statsResults || !Shared.statsReporting || typeof Shared.statsReporting.capturePanelModel !== 'function'){
      return previous;
    }
    state.statsPanelModel = normalizeRocStatsPanelModel(Shared.statsReporting.capturePanelModel(refs.statsResults) || previous);
    const session = getActiveRocSessionForState();
    if(session){
      session.state.statsPanelModel = createDefaultRocStatsPanelModel(state.statsPanelModel);
      session.results = createDefaultRocResultsState({
        statsPanelModel: session.state.statsPanelModel,
        compareSelection: state.compareSelection || state.compareSel?.value || null,
        diffMethod: state.diffMethod,
        compareResult: state.compareResultModel
      });
      session.updatedAt = Date.now();
    }
    return state.statsPanelModel;
  }

  function rocStatsPanelModelHasContent(model){
    const normalized = normalizeRocStatsPanelModel(model);
    return !!(normalized.resultsModel || normalized.reportModel);
  }

  function setRocStatsPanelPValueScientific(model, scientific){
    const normalized = normalizeRocStatsPanelModel(model);
    const next = scientific === true;
    const patchNode = node => {
      if(!node || typeof node !== 'object'){
        return;
      }
      if(node.type === 'stats-table' && node.model && typeof node.model === 'object'){
        node.model.pValueScientific = next;
      }
      if(Array.isArray(node.children)){
        node.children.forEach(patchNode);
      }
    };
    ['resultsModel', 'reportModel'].forEach(key => {
      const panelModel = normalized[key];
      if(panelModel && typeof panelModel === 'object'){
        panelModel.pValueScientific = next;
        patchNode(panelModel);
      }
    });
    return normalized;
  }

  function commitRocStatsPValueFormat(scientific, tabId = null){
    const normalizedTabId = normalizeRocSessionTabId(tabId || getRocProjectionTabId() || null, {});
    const session = normalizedTabId
      ? getRocSession(normalizedTabId, { tabId: normalizedTabId, reason: 'roc-stats-pvalue-format' }, { create: false })
      : getActiveRocSessionForState();
    if(!session){
      return false;
    }
    const isActiveOwner = !normalizedTabId || isRocSessionActiveOrActivating(session);
    const captured = isActiveOwner && refs.statsResults && Shared.statsReporting?.capturePanelModel
      ? Shared.statsReporting.capturePanelModel(refs.statsResults)
      : null;
    const sourceModel = captured || session.results?.statsPanelModel || session.state?.statsPanelModel || state.statsPanelModel;
    const normalized = setRocStatsPanelPValueScientific(sourceModel, scientific);
    session.state.statsPanelModel = createDefaultRocStatsPanelModel(normalized);
    session.results = createDefaultRocResultsState({
      statsPanelModel: session.state.statsPanelModel,
      compareSelection: session.results?.compareSelection || session.state.compareSelection || null,
      diffMethod: session.results?.diffMethod || session.state.diffMethod || 'delong',
      compareResult: session.results?.compareResult || null
    });
    session.updatedAt = Date.now();
    if(isActiveOwner){
      state.statsPanelModel = createDefaultRocStatsPanelModel(normalized);
    }
    return true;
  }

  function ensureRocStatsPValueFormatListener(){
    if(rocStatsPValueFormatEventBound || typeof global.addEventListener !== 'function'){
      return;
    }
    global.addEventListener('venn:stats-pvalue-format-change', event => {
      const detail = event?.detail || {};
      if(detail.targetId && detail.targetId !== 'rocStatsResults'){
        return;
      }
      const activeTabId = getRocProjectionTabId() || getActiveRocSessionForState()?.tabId || null;
      if(detail.tabId && activeTabId && String(detail.tabId) !== String(activeTabId)){
        return;
      }
      commitRocStatsPValueFormat(detail.scientific === true, detail.tabId || activeTabId);
    });
    rocStatsPValueFormatEventBound = true;
  }

  function restoreRocStatsPanelModel(model){
    const normalized = normalizeRocStatsPanelModel(model);
    if(!refs.statsResults || !rocStatsPanelModelHasContent(normalized) || !Shared.statsReporting || typeof Shared.statsReporting.restorePanelModel !== 'function'){
      return false;
    }
    Shared.statsReporting.restorePanelModel(refs.statsResults, normalized, {
      ensureReportHost: () => ensureRocStatsReportHost(),
      clearMainWhenMissing: false
    });
    ensureRocStatsReportHost();
    if(typeof Shared.statsReporting.pinReportHostLast === 'function'){
      Shared.statsReporting.pinReportHostLast(refs.statsResults);
    }
    scheduleRocStatsReportOrderPin();
    state.statsPanelModel = normalized;
    const session = getActiveRocSessionForState();
    if(session){
      session.state.statsPanelModel = createDefaultRocStatsPanelModel(normalized);
      session.results = createDefaultRocResultsState({
        statsPanelModel: session.state.statsPanelModel,
        compareSelection: state.compareSelection || state.compareSel?.value || null,
        diffMethod: state.diffMethod,
        compareResult: state.compareResultModel
      });
      session.updatedAt = Date.now();
    }
    return true;
  }

  function commitRocCompareStateToSession(session = null, patch = {}){
    const shaped = ensureRocSessionOwnershipShape(session || getActiveRocSessionForState());
    if(!shaped){
      return null;
    }
    const compareSelection = Object.prototype.hasOwnProperty.call(patch, 'compareSelection')
      ? patch.compareSelection
      : (state.compareSelection || state.compareSel?.value || null);
    const diffMethod = Object.prototype.hasOwnProperty.call(patch, 'diffMethod')
      ? patch.diffMethod
      : state.diffMethod;
    const compareResult = Object.prototype.hasOwnProperty.call(patch, 'compareResult')
      ? patch.compareResult
      : state.compareResultModel;
    shaped.state.compareSelection = compareSelection || null;
    shaped.state.diffMethod = diffMethod || 'delong';
    shaped.state.compareResult = normalizeRocCompareResultModel(compareResult || null);
    shaped.results = createDefaultRocResultsState({
      ...(shaped.results || {}),
      statsPanelModel: shaped.state.statsPanelModel || state.statsPanelModel,
      compareSelection: shaped.state.compareSelection,
      diffMethod: shaped.state.diffMethod,
      compareResult: shaped.state.compareResult
    });
    shaped.updatedAt = Date.now();
    return shaped.results;
  }
  let rocLegendControl = null;
  const rocOverlayController = Shared.loadingOverlay?.createPendingController?.({
    component: 'roc',
    message: 'Rendering ROC/PR plot...',
    isHeavy: Shared.loadingOverlay?.createTableHeavyPredicate?.({
      getHot: () => state.hot,
      startRow: 1,
      startCol: 0,
      rowThreshold: 1000,
      cellThreshold: 5000
    }),
    getTabId: () => getRocProjectionTabId() || null,
    getHost: () => (
      refs.svgBox
      || refs.graphPanel?.querySelector?.('.svgbox')
      || getRocNodeById('rocGraphPanel')?.querySelector?.('.svgbox')
      || getRocNodeById('rocGraphPanel')
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
    const renderRow = refs.renderRow || getRocNodeById('rocRenderRow');
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
    let lastReason = 'frame';
    const debounced = Shared.componentLifecycle?.createTabScopedFrameDebouncer
      ? Shared.componentLifecycle.createTabScopedFrameDebouncer(roc, 'roc', () => syncRocAutoDrawNoticeWidth(lastReason), { reason: 'roc-notice-width' })
      : null;
    return reason => {
      lastReason = reason || 'frame';
      if(debounced){
        debounced({ tabId: getRocProjectionTabId() || null, reason: 'roc-notice-width' });
        return;
      }
      syncRocAutoDrawNoticeWidth(lastReason);
    };
  })();

  // PART: LEGEND
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
      state.axisSettings.x = { tickInterval: null, majorTickLength: null, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS };
    }
    if(!state.axisSettings.y || typeof state.axisSettings.y !== 'object'){
      state.axisSettings.y = { tickInterval: null, majorTickLength: null, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS };
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
    scheduleActiveRocDraw({ reason: `roc-${axis}-tick-interval-change` });
  }

  function getAxisMajorTickLength(axis){
    if(axis !== 'x' && axis !== 'y'){ return null; }
    const settings = ensureAxisSettings();
    const storedValue = settings[axis]?.majorTickLength;
    if(storedValue === null || storedValue === undefined || storedValue === ''){ return null; }
    const numeric = Number(storedValue);
    return Number.isFinite(numeric) && numeric >= 0 && numeric <= 100 ? numeric : null;
  }

  function updateAxisMajorTickLength(axis, value){
    if(axis !== 'x' && axis !== 'y'){ return; }
    const settings = ensureAxisSettings();
    const numeric = Number(value);
    const nextValue = value === null || value === undefined || value === ''
      ? null
      : (Number.isFinite(numeric) && numeric >= 0 && numeric <= 100 ? numeric : null);
    if(settings[axis].majorTickLength === nextValue){ return; }
    settings[axis].majorTickLength = nextValue;
    console.debug('Debug: roc major tick length updated',{ axis, majorTickLength: nextValue });
    scheduleActiveRocDraw({ reason: `roc-${axis}-major-tick-length-change` });
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
    scheduleActiveRocDraw({ reason: `roc-${axis}-minor-ticks-change` });
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
    scheduleActiveRocDraw({ reason: `roc-${axis}-minor-subdivisions-change` });
  }

  // PART: AXIS
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
    scheduleActiveRocDraw({ reason: 'roc-axis-stroke-width-change' });
  }

  function getAxisColor(){
    return ensureAxisSettings().color || DEFAULT_AXIS_COLOR;
  }

  function updateAxisColor(value){
    const settings = ensureAxisSettings();
    settings.color = typeof value === 'string' && value.trim() ? value : DEFAULT_AXIS_COLOR;
    console.debug('Debug: roc axis color updated', { color: settings.color });
    scheduleActiveRocDraw({ reason: 'roc-axis-color-change' });
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
        scheduleActiveRocDraw({ reason: 'roc-grid-visibility-change' });
      },
      getStyle: () => getGridStyle(fallbackThickness),
      onStyleChange: style => {
        setGridStyle(style, fallbackThickness);
        scheduleActiveRocDraw({ reason: 'roc-grid-style-change' });
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
      const xMajorTickLength = settings.majorTickLengthX ?? settings.xMajorTickLength ?? settings?.x?.majorTickLength ?? null;
      const yMajorTickLength = settings.majorTickLengthY ?? settings.yMajorTickLength ?? settings?.y?.majorTickLength ?? null;
      base.x.majorTickLength = chartStyle.normalizeOptionalMajorTickLength(xMajorTickLength);
      base.y.majorTickLength = chartStyle.normalizeOptionalMajorTickLength(yMajorTickLength);
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



  function ensureElements(){
    refs.root = state.root || resolveRocRoot(getRocProjectionTabId() || null) || refs.root || null;
    refs.tablePanel = getRocNodeById('rocTablePanel');
    refs.graphPanel = getRocNodeById('rocGraphPanel');
    refs.panelResizer = getRocNodeById('rocPanelResizer');
    refs.svgBox = refs.graphPanel?.querySelector('.svgbox');
    refs.configPanel = refs.graphPanel?.querySelector('.config-panel');
    refs.hotContainer = getRocNodeById('rocHot');
    refs.hotWrapper = getRocNodeById('rocHotWrapper');
    refs.plotDiv = getRocNodeById('rocPlot');
    refs.statsResults = getRocNodeById('rocStatsResults');
    ensureRocStatsReportHost();
    refs.statsControls = getRocNodeById('rocStatsControls');
    refs.renderRow = getRocNodeById('rocRenderRow');
    refs.renderButton = getRocNodeById('rocRenderButton');
    refs.autoDrawNotice = getRocNodeById('rocAutoDrawNotice');
    refs.showGrid = getRocNodeById('rocShowGrid');
    refs.showFrame = getRocNodeById('rocShowFrame');
    refs.fontSize = getRocNodeById('rocFontSize');
    refs.fontSizeVal = getRocNodeById('rocFontSizeVal');
    refs.showLegend = getRocNodeById('rocShowLegend');
    if(refs.showLegend){
      const legendHost = refs.showLegend.closest('label');
      if(legendHost){
        rocLegendControl = legendHost;
        ensureRocLegendControlPlacement();
      }
    }
    refs.graphType = getRocNodeById('rocGraphType');
    refs.positiveClass = getRocNodeById('rocPositiveClass');
    refs.negativeClass = getRocNodeById('rocNegativeClass');
    refs.scoreDirection = getRocNodeById('rocScoreDirection');
    attachRocSelectAutoSize(refs.graphType, 'roc');
    attachRocSelectAutoSize(refs.positiveClass, '');
    attachRocSelectAutoSize(refs.scoreDirection, 'higher');
    refs.loadExampleBtn = getRocNodeById('rocLoadExample');
    refs.importBtn = getRocNodeById('rocImport');
    refs.fileInput = getRocNodeById('rocFile');
    refs.openBtn = getRocNodeById('openRocGraph');
    refs.saveBtn = getRocNodeById('saveRocGraph');
    refs.saveAsBtn = getRocNodeById('saveAsRoc');
    refs.graphFileInput = getRocNodeById('rocGraphFile');
    syncRocSessionRefsFromActive();
    return !!(refs.tablePanel && refs.graphPanel && refs.hotContainer && refs.plotDiv);
  }

  // PART: TABLE_SETUP
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
      scheduleActiveRocDraw({ reason: 'roc-title-edit' });
    };

    const instance = Shared.hot.createStandardTable(container, { rows: DEFAULT_ROWS, cols: ROC_DEFAULT_COLS }, scheduleRocDrawProxy, {
      debugLabel: 'roc',
      data,
      pinFirstRow: true,
      scheduleOnLoadData: true,
      hotOptions: {
        stretchH: 'all'
      }
    });
    return instance;
  }

  function ensureHotForActiveTab(){
    const wrapper = refs.hotWrapper || getRocNodeById('rocHotWrapper');
    const baseContainer = refs.hotContainer || getRocNodeById('rocHot');
    const tabId = Shared.hot?.resolveTableTabId?.({
      type: 'roc',
      component: roc,
      wrapper,
      container: baseContainer,
      reason: 'roc-ensure-hot'
    }) || null;
    if(!Shared.hot?.ensureTableForTab || !wrapper){
      if(!state.hot && baseContainer){
        state.hot = createRocTableInstance(baseContainer);
      }
      if(state.hot){
        const fallbackTabId = tabId || getRocProjectionTabId() || null;
        state.hot.__rocTabId = fallbackTabId || state.hot.__rocTabId || null;
        state.hot.__workspaceTabId = fallbackTabId || state.hot.__workspaceTabId || null;
      }
      const fallbackSession = getRocSession(tabId || getRocProjectionTabId() || null, { tabId: tabId || getRocProjectionTabId() || null, reason: 'roc-ensure-hot-fallback' }, { create: true }) || getActiveRocSessionForState();
      if(fallbackSession){
        fallbackSession.managers.hot = state.hot || fallbackSession.managers.hot || null;
        fallbackSession.updatedAt = Date.now();
      }
      ensureRocDataViewsForHot(state.hot, {
        wrapper,
        container: state.hot?.__rocHostContainer || baseContainer
      });
      ensureRocDefaultHeaderRow(state.hot);
      return state.hot;
    }
    const entry = Shared.hot.ensureTableForTab({
      type: 'roc',
      tabId,
      wrapper,
      container: baseContainer,
      createInstance: container => createRocTableInstance(container)
    });
    if(entry){
      refs.hotContainer = entry.container;
      state.hot = entry.instance;
    }
    if(state.hot){
      state.hot.__rocTabId = tabId || getRocProjectionTabId() || state.hot.__rocTabId || null;
      state.hot.__workspaceTabId = tabId || getRocProjectionTabId() || state.hot.__workspaceTabId || null;
    }
    const session = getRocSession(tabId || getRocProjectionTabId() || null, { tabId: tabId || getRocProjectionTabId() || null, reason: 'roc-ensure-hot' }, { create: true }) || getActiveRocSessionForState();
    if(session){
      session.managers.hot = state.hot || session.managers.hot || null;
      session.updatedAt = Date.now();
    }
    ensureRocDataViewsForHot(state.hot, {
      wrapper,
      container: state.hot?.__rocHostContainer || refs.hotContainer || baseContainer
    });
    ensureRocDefaultHeaderRow(state.hot);
    return state.hot;
  }

  function ensureRocDataViewsForHot(hotInstance, options = {}){
    const ownerSession = getRocSessionForHot(hotInstance, { reason: 'roc-dataviews-owner' }, { create: true })
      || getActiveRocSessionForState();
    const ownerTabId = ownerSession?.tabId || getRocHotOwnerTabId(hotInstance) || getRocProjectionTabId() || null;
    const ownerRoot = resolveRocRoot(ownerTabId || null) || null;
    const hostWrapper = options.wrapper
      || ownerRoot?.querySelector?.('#rocHotWrapper')
      || refs.hotWrapper
      || getRocNodeById('rocHotWrapper', ownerTabId);
    const hostContainer = options.container
      || hotInstance?.__rocHostContainer
      || ownerRoot?.querySelector?.('#rocHot')
      || refs.hotContainer
      || getRocNodeById('rocHot', ownerTabId);
    const manager = Shared.componentLifecycle?.ensureOwnedDataViewsManager?.({
      hotInstance,
      componentKey: 'roc',
      managerField: '__rocDataViewsManager',
      ownerTabId,
      hostContainerField: '__rocHostContainer',
      wrapper: hostWrapper,
      container: hostContainer,
      createOptions: {
        componentKey: 'roc',
        maxViews: ROC_DATA_VIEW_MAX,
        initialData: hotInstance?.getData?.() || [],
        onActiveViewChanged(view, meta){
          if(!view || !hotInstance || typeof hotInstance.loadData !== 'function'){
            return;
          }
          Shared.dataViews.applyViewToTable(hotInstance, view, {
            loadOptions: { source: 'roc-data-view-switch' },
            exclusionSource: 'roc-data-view-switch',
            filterReason: 'roc-data-view-switch'
          });
          const session = getRocSessionForHot(hotInstance, { reason: 'roc-data-view-switch' }, { create: false })
            || ownerSession
            || getActiveRocSessionForState();
          if(session){
            session.managers.hot = hotInstance;
            const currentManager = hotInstance.__rocDataViewsManager || null;
            session.managers.dataViews = rocDataViewsManagerBelongsToSession(currentManager, session) ? currentManager : session.managers.dataViews || null;
            session.state.drawPending = true;
            session.updatedAt = Date.now();
          }
          if(!isRocSessionActiveOrActivating(session)){
            return;
          }
          scheduleRocDrawForSession(session, {
            reason: 'data-view-switch',
            userInitiated: String(meta?.reason || '').trim().toLowerCase() === 'tab-click'
          });
        },
        onInteraction(){
          if(isRocSessionActiveOrActivating(getRocSessionForHot(hotInstance, { reason: 'roc-dataview-interaction' }, { create: false }))){
            Shared.workspaceToolbar?.activateSection?.('roc', 'Data');
          }
        }
      },
      onCreated(){
        console.debug('Debug: roc data views manager created');
      }
    });
    if(!manager){
      return null;
    }
    const managerSession = getRocSessionForHot(hotInstance, { reason: 'roc-data-views-manager' }, { create: true })
      || ownerSession;
    if(managerSession){
      managerSession.managers.hot = hotInstance;
      managerSession.managers.dataViews = rocDataViewsManagerBelongsToSession(manager, managerSession) ? manager : managerSession.managers.dataViews || null;
      managerSession.updatedAt = Date.now();
    }
    return manager;
  }

  function syncRocActiveDataViewFromHot(hotInstance, reason){
    const hot = hotInstance || state.hot;
    if(!hot || typeof hot.getData !== 'function'){
      return;
    }
    const ownerSession = getRocSessionForHot(hot, { reason: 'roc-active-dataview-sync' }, { create: false, fallbackActive: false });
    if(ownerSession && !isRocSessionActiveOrActivating(ownerSession)){
      console.debug('Debug: roc active DataView sync skipped for inactive HOT owner', {
        ownerTabId: ownerSession.tabId || null,
        activeTabId: getRocProjectionTabId() || null,
        reason: reason || null
      });
      return;
    }
    Shared.componentLifecycle?.refreshOwnedDataViewsManagerFromHot?.({
      hotInstance: hot,
      componentKey: 'roc',
      managerField: '__rocDataViewsManager',
      session: ownerSession,
      belongsToSession: rocDataViewsManagerBelongsToSession,
      reason
    });
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

  // PART: ADVISOR
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

  function ensureRocAdvisorDefaults(context, advisorState = rocAdvisorState){
    const answers=advisorState.answers || {};
    if(!answers.methodChoice){
      if(context.graphType==='roc'){
        const minClass=Math.min(context.positives, context.negatives);
        answers.methodChoice=minClass>=50?'delong':'bootstrap';
      }else{
        answers.methodChoice='bootstrap';
      }
    }
    advisorState.answers=answers;
    return answers;
  }

  function buildRocAdvisorQuestions(context){
    const graphType=context.graphType || 'roc';
    const options=graphType==='roc'
      ? [
        { value:'delong', label:'DeLong analytic test (fast with ≥ ~50 positives & negatives)' },
        { value:'bootstrap', label:'Stratified paired bootstrap (resampling-based comparison)' }
      ]
      : [
        { value:'bootstrap', label:'Stratified paired bootstrap (resampling-based comparison)' },
        { value:'permutation', label:'Paired permutation test (swap model scores within observations)' }
      ];
    const help=graphType==='roc'
      ? 'Pick DeLong for well-powered ROC comparisons or bootstrap when counts are small or imbalanced.'
      : 'Precision–recall comparisons rely on paired resampling here; permutation swaps the two model scores within each matched observation under the null of exchangeable models.';
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
      recommendation.rationale.push('The stratified paired bootstrap preserves case/control counts while resampling matched observations within each class.');
      if(context.minPairs && context.minPairs < 20){
        recommendation.warnings.push('Increase bootstrap iterations for very small series to stabilize the resampled distribution.');
      }
    }else if(answers.methodChoice==='permutation'){
      recommendation.rationale.push('The paired permutation test constructs a null distribution by independently swapping the two model scores within matched observations.');
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
    const container = getRocNodeById('rocStatsAdvisor');
    if(!container){
      return;
    }
    const session = getActiveRocSessionForState();
    const advisorState = getRocAdvisorState(session);
    const context=buildRocAdvisorContext(rawContext || advisorState.context || {});
    advisorState.context=context;
    const answers=ensureRocAdvisorDefaults(context, advisorState);
    setRocAdvisorState(advisorState, session);
    const recommendation=computeRocAdvisorRecommendation(answers, context);
    const sharedAdvisorUi = Shared.statsUi;
    if(sharedAdvisorUi && typeof sharedAdvisorUi.renderAdvisorPanel==='function'){
      sharedAdvisorUi.renderAdvisorPanel({
        container,
        state: advisorState,
        title: 'Statistics advisor',
        inactiveMessage: 'Press the "Guide me" button to view advisor recommendations.',
        recommendation,
        answers,
        questions: advisorState.open ? buildRocAdvisorQuestions(context) : [],
        namePrefix: 'roc-advisor',
        onToggle: (nextOpen)=>{
          advisorState.open=!!nextOpen;
          if(advisorState.open && !advisorState.activated){
            advisorState.activated=true;
            console.debug('Debug: roc statsAdvisor activated');
          }
          console.debug('Debug: roc statsAdvisor toggled',{ open:advisorState.open });
          setRocAdvisorState(advisorState, session);
          renderRocStatsAdvisor(advisorState.context);
        },
        onAnswerChange: (question, value)=>{
          answers[question.id]=value;
          advisorState.answers=answers;
          console.debug('Debug: roc statsAdvisor answer change',{ question:question.id, value });
          setRocAdvisorState(advisorState, session);
          renderRocStatsAdvisor(advisorState.context);
        },
        onApply: ()=>{
          if(!recommendation.ready){
            return;
          }
          state.diffMethod=recommendation.diffMethod;
          state.compareResultModel=null;
          commitRocCompareStateToSession(session, { diffMethod: state.diffMethod, compareResult: null });
          renderStatsControls();
          scheduleRocDrawForSession(session, { reason: 'roc-stats-advisor-apply', tabId: session?.tabId || undefined });
          advisorState.lastApplied={ ...recommendation };
          console.debug('Debug: roc statsAdvisor applied',{ diffMethod:recommendation.diffMethod, answers:{ ...answers } });
          setRocAdvisorState(advisorState, session);
          renderRocStatsAdvisor(advisorState.context);
        },
        onReset: ()=>{
          advisorState.answers={};
          console.debug('Debug: roc statsAdvisor reset');
          setRocAdvisorState(advisorState, session);
          renderRocStatsAdvisor(advisorState.context);
        }
      });
      return;
    }
    container.innerHTML='';
    const wrapper=document.createElement('div');
    wrapper.className='stats-advisor';
    wrapper.dataset.open=advisorState.open?'1':'0';
    const header=document.createElement('div');
    header.className='stats-advisor__header';
    const title=document.createElement('strong');
    title.textContent='Test advisor';
    header.appendChild(title);
    const toggle=document.createElement('button');
    toggle.type='button';
    toggle.className='stats-advisor__toggle';
    toggle.textContent=advisorState.open?'Hide advisor':'Guide me';
    toggle.addEventListener('click', event => {
      runRocControlOwner(event, 'roc-stats-advisor-toggle', ownerSession => {
        advisorState.open=!advisorState.open;
        if(advisorState.open && !advisorState.activated){
          advisorState.activated=true;
          console.debug('Debug: roc statsAdvisor activated');
        }
        console.debug('Debug: roc statsAdvisor toggled',{ open:advisorState.open });
        setRocAdvisorState(advisorState, ownerSession || session);
        renderRocStatsAdvisor(advisorState.context);
      });
    });
    header.appendChild(toggle);
    wrapper.appendChild(header);
    const summary=document.createElement('div');
    summary.className='stats-advisor__summary';
    if(!advisorState.activated){
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
    if(advisorState.open){
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
          input.addEventListener('change', event => {
            runRocControlOwner(event, 'roc-stats-advisor-answer', ownerSession => {
              answers[question.id]=option.value;
              advisorState.answers=answers;
              console.debug('Debug: roc statsAdvisor answer change',{ question:question.id, value:option.value });
              setRocAdvisorState(advisorState, ownerSession || session);
              renderRocStatsAdvisor(advisorState.context);
            });
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
      applyBtn.addEventListener('click', event => {
        runRocControlOwner(event, 'roc-stats-advisor-apply', ownerSession => {
          if(!recommendation.ready){
            return;
          }
          state.diffMethod=recommendation.diffMethod;
          state.compareResultModel=null;
          commitRocCompareStateToSession(ownerSession || session, { diffMethod: state.diffMethod, compareResult: null });
          advisorState.lastApplied={ ...recommendation };
          console.debug('Debug: roc statsAdvisor applied',{ diffMethod:recommendation.diffMethod, answers:{ ...answers } });
          setRocAdvisorState(advisorState, ownerSession || session);
          persistRocTabState('roc-stats-advisor-apply');
          renderStatsControls();
          scheduleRocDrawForSession(ownerSession || session, { reason: 'roc-stats-advisor-apply', tabId: (ownerSession || session)?.tabId || undefined });
        });
      });
      actions.appendChild(applyBtn);
      const resetBtn=document.createElement('button');
      resetBtn.type='button';
      resetBtn.className='stats-advisor__reset';
      resetBtn.textContent='Reset answers';
      resetBtn.addEventListener('click', event => {
        runRocControlOwner(event, 'roc-stats-advisor-reset', ownerSession => {
          advisorState.answers={};
          console.debug('Debug: roc statsAdvisor reset');
          setRocAdvisorState(advisorState, ownerSession || session);
          renderRocStatsAdvisor(advisorState.context);
        });
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
    diffLabel.textContent = 'Curve comparison:';
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
    select.addEventListener('change', event => {
      runRocControlOwner(event, 'roc-diff-method-change', session => {
        state.diffMethod = select.value;
        invalidateRocAnalysisResults(session);
        commitRocCompareStateToSession(session, { diffMethod: state.diffMethod, compareResult: null });
        persistRocTabState('roc-diff-method-change');
        console.debug('Debug: ROC diff method change', state.diffMethod);
        renderStatsControls();
        populateRocCompareOptions(getRocSeriesNamesFromHot());
        scheduleRocControlDraw('roc-diff-method-change', { event, session });
      });
    });
    refs.statsControls.appendChild(select);

    if(graphType === 'roc'){
      const singlePLabel = document.createElement('label');
      singlePLabel.textContent = 'Single-curve p value:';
      singlePLabel.title = 'Tests AUC = 0.5 using a two-sided Mann–Whitney rank test. Automatic uses the exact test for small untied datasets and the tie-corrected asymptotic test otherwise.';
      refs.statsControls.appendChild(singlePLabel);

      const singlePSelect = document.createElement('select');
      [
        ['auto', 'Mann–Whitney (automatic)'],
        ['exact', 'Mann–Whitney exact when eligible'],
        ['asymptotic', 'Mann–Whitney asymptotic']
      ].forEach(([value, label]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        option.selected = value === normalizeSingleRocPMethod(state.singleRocPMethod);
        singlePSelect.appendChild(option);
      });
      singlePSelect.addEventListener('change', event => {
        runRocControlOwner(event, 'roc-single-p-method-change', session => {
          state.singleRocPMethod = normalizeSingleRocPMethod(singlePSelect.value);
          if(session?.state){
            session.state.singleRocPMethod = state.singleRocPMethod;
            session.updatedAt = Date.now();
          }
          invalidateRocAnalysisResults(session);
          persistRocTabState('roc-single-p-method-change');
          scheduleRocControlDraw('roc-single-p-method-change', { event, session });
        });
      });
      refs.statsControls.appendChild(singlePSelect);
    }

    state.compareLabel = document.createElement('label');
    state.compareLabel.textContent = 'Compare:';
    refs.statsControls.appendChild(state.compareLabel);

    state.compareSel = document.createElement('select');
    state.compareSel.addEventListener('change', event => {
      runRocControlOwner(event, 'roc-compare-change', session => {
        state.compareSelection = state.compareSel.value;
        invalidateRocAnalysisResults(session);
        commitRocCompareStateToSession(session, { compareSelection: state.compareSelection, compareResult: null });
        persistRocTabState('roc-compare-change');
        console.debug('Debug: ROC compare pair change', state.compareSel.value);
        scheduleRocControlDraw('roc-compare-change', { event, session });
      });
    });
    refs.statsControls.appendChild(state.compareSel);

    state.compareResult = document.createElement('span');
    state.compareResult.style.marginLeft = '4px';
    refs.statsControls.appendChild(state.compareResult);

    if(state.diffMethod === 'bootstrap' || state.diffMethod === 'permutation'){
      const iterationsLabel = document.createElement('label');
      iterationsLabel.textContent = 'Iterations:';
      refs.statsControls.appendChild(iterationsLabel);
      const iterationsInput = document.createElement('input');
      iterationsInput.type = 'number';
      iterationsInput.min = '100';
      iterationsInput.max = '1000000';
      iterationsInput.step = '100';
      iterationsInput.value = String(state.resamplingIterations);
      iterationsInput.title = 'More iterations improve Monte Carlo resolution but increase computation time.';
      iterationsInput.addEventListener('change', event => {
        runRocControlOwner(event, 'roc-resampling-iterations-change', session => {
          state.resamplingIterations = normalizeRocResamplingIterations(iterationsInput.value, ROC_RESAMPLING_DEFAULT_ITERATIONS);
          iterationsInput.value = String(state.resamplingIterations);
          if(session?.state){ session.state.resamplingIterations = state.resamplingIterations; session.updatedAt = Date.now(); }
          invalidateRocAnalysisResults(session);
          commitRocCompareStateToSession(session, { compareResult: null });
          persistRocTabState('roc-resampling-iterations-change');
          scheduleRocControlDraw('roc-resampling-iterations-change', { event, session });
        });
      });
      refs.statsControls.appendChild(iterationsInput);

      const seedLabel = document.createElement('label');
      seedLabel.textContent = 'Seed:';
      refs.statsControls.appendChild(seedLabel);
      const seedInput = document.createElement('input');
      seedInput.type = 'number';
      seedInput.step = '1';
      seedInput.value = String(state.resamplingSeed);
      seedInput.title = 'Fixed seed for reproducible resampling results.';
      seedInput.addEventListener('change', event => {
        runRocControlOwner(event, 'roc-resampling-seed-change', session => {
          state.resamplingSeed = normalizeRocResamplingSeed(seedInput.value, ROC_RESAMPLING_DEFAULT_SEED);
          seedInput.value = String(state.resamplingSeed);
          if(session?.state){ session.state.resamplingSeed = state.resamplingSeed; session.updatedAt = Date.now(); }
          invalidateRocAnalysisResults(session);
          commitRocCompareStateToSession(session, { compareResult: null });
          persistRocTabState('roc-resampling-seed-change');
          scheduleRocControlDraw('roc-resampling-seed-change', { event, session });
        });
      });
      refs.statsControls.appendChild(seedInput);
    }

    console.debug('Debug: ROC stats controls rendered', {graphType, diff: state.diffMethod, singleRocPMethod: state.singleRocPMethod});
  }

  function getRocSeriesNamesFromHot(){
    const data = typeof state.hot?.getIncludedDataMatrix === 'function'
      ? state.hot.getIncludedDataMatrix()
      : (Shared.hot?.getIncludedDataMatrix ? Shared.hot.getIncludedDataMatrix(state.hot) : []);
    if(!Array.isArray(data) || !data.length){
      return [];
    }
    const header = Array.isArray(data[0]) ? data[0] : [];
    let labelIndex = header.findIndex(h => String(h).trim().toLowerCase() === 'label');
    if(labelIndex < 0){
      labelIndex = 0;
    }
    return header
      .map((value, idx) => ({ value, idx }))
      .filter(entry => entry.idx !== labelIndex && entry.value != null && String(entry.value).trim() !== '')
      .map((entry, index) => String(entry.value || `Model ${index + 1}`));
  }

  function populateRocCompareOptions(seriesNames){
    if(!state.compareSel){
      return false;
    }
    const names = Array.isArray(seriesNames) ? seriesNames : [];
    const previous = state.compareSelection || state.compareSel.value || '';
    state.compareSel.innerHTML = '';
    const options = [];
    for(let i = 0; i < names.length; i += 1){
      for(let j = i + 1; j < names.length; j += 1){
        const value = `${i},${j}`;
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = `${names[i]} vs ${names[j]}`;
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
    state.compareSelection = state.compareSel.value || null;
    commitRocCompareStateToSession(null, { compareSelection: state.compareSelection });
    return options.length > 0;
  }

  function restoreRocCompareResultControl(){
    if(!state.compareResult){
      return false;
    }
    const model = normalizeRocCompareResultModel(state.compareResultModel || null);
    const graphType = refs.graphType?.value || state.controls?.graphType || 'roc';
    const compareSelection = state.compareSelection || state.compareSel?.value || null;
    if(!model
      || !model.displayText
      || model.graphType !== graphType
      || model.diffMethod !== state.diffMethod
      || model.compareSelection !== compareSelection){
      return false;
    }
      state.compareResult.textContent = model.displayText;
      state.compareResult.style.display = '';
      commitRocCompareStateToSession(null, { compareResult: model, compareSelection });
      return true;
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

  function bindRocControlHandler(node, eventName, key, handler){
    if(!node || typeof node.addEventListener !== 'function'){
      return;
    }
    const registryKey = `${eventName}:${key}`;
    if(!node.__rocControlHandlers){
      Object.defineProperty(node, '__rocControlHandlers', {
        value: Object.create(null),
        configurable: true
      });
    }
    const previous = node.__rocControlHandlers[registryKey];
    if(previous){
      node.removeEventListener(eventName, previous);
    }
    const wrapped = event => runRocControlOwner(event, key || registryKey, session => handler(event, session));
    node.__rocControlHandlers[registryKey] = wrapped;
    node.addEventListener(eventName, wrapped);
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

    refs.loadExampleBtn?.addEventListener('click', event => {
      runRocControlOwner(event, 'roc-example-load', session => {
      const ownerHot = session?.managers?.hot || state.hot;
      if(!ownerHot){
        return;
      }
      const overlayReason = 'example-data';
      markRocOverlayPending(overlayReason);
      ownerHot.loadData(example, {
        source: 'example-load',
        recordUndo: true,
        undoLabel: 'table:roc:example-load'
      });
      console.debug('Debug: ROC example loaded');
      scheduleRocDrawForSession(session, { reason: 'roc-example-load', tabId: session?.tabId || undefined });
      });
    });

    bindRocControlHandler(refs.importBtn, 'click', 'import-table', () => {
      if(refs.fileInput){
        refs.fileInput.value = '';
        refs.fileInput.click();
      }
    });
    if(refs.renderButton){
      refs.renderButton.addEventListener('click', event => {
        runRocControlOwner(event, 'manual-render', session => {
        console.debug('Debug: roc manual render button');
        const overlayReason = 'manual-render';
        markRocOverlayPending(overlayReason);
        forceRocOverlay(overlayReason, { message: 'Rendering ROC/PR plot...' });
        scheduleRocDrawForSession(session, { force: true, reason: overlayReason, tabId: session?.tabId || undefined });
        });
      });
    }

    bindRocControlHandler(refs.fileInput, 'change', 'import-file', async (_event, ownerSession) => {
      const tableImport = Shared.tableImport;
      if(!tableImport || typeof tableImport.openFile !== 'function'){
        console.warn('roc import skipped: Shared.tableImport.openFile unavailable');
        return;
      }
      const importHot = state.hot || null;
      const importSession = ownerSession
        || getRocSessionForHot(importHot, { reason: 'roc-import-file' }, { create: false })
        || getActiveRocSessionForState();
      const hasFile = !!(refs.fileInput?.files && refs.fileInput.files[0]);
      let forcedOverlay = false;
      if(hasFile && isRocSessionActiveOrActivating(importSession)){
        forcedOverlay = !!forceRocOverlay('file-import', { message: 'Importing table data...' });
        markRocOverlayPending('file-import');
      }
      const fileName = refs.fileInput?.files?.[0]?.name || '';
      console.debug('Debug: ROC import start', {fileName}); // Debug: import start trace
      try{
        const result = await tableImport.openFile(refs.fileInput, {
          hot: importSession?.managers?.hot || importHot,
          minCols: ROC_DEFAULT_COLS,
          minRows: DEFAULT_ROWS,
          scheduleDraw: () => {
            if(importSession && !isRocSessionActiveOrActivating(importSession)){
              importSession.state.drawPending = true;
              importSession.updatedAt = Date.now();
              return;
            }
            markRocOverlayPending('file-import');
            scheduleRocDrawForSession(importSession || getActiveRocSessionForState(), { force: true, reason: 'import-load', skipThresholdEvaluation: true, tabId: importSession?.tabId || undefined });
          },
          debugLabel: 'roc',
          onProcessed: info => {
            console.debug('Debug: ROC tableImport processed', info || {}); // Debug: processed callback
          },
          onCompleted: () => {
            if(importSession && !isRocSessionActiveOrActivating(importSession)){
              importSession.state.drawPending = true;
              importSession.updatedAt = Date.now();
              return;
            }
            const renderReason = 'import-load';
            markRocOverlayPending(renderReason);
            forceRocOverlay(renderReason, { message: 'Rendering ROC/PR plot...' });
          },
          onOwnerInactive: (_result, meta) => {
            resolveRocOverlay({ reason: 'file-import-owner-inactive', tabId: meta?.tabId || null });
          }
        });
        if(!result && forcedOverlay && isRocSessionActiveOrActivating(importSession)){
          resolveRocOverlay('file-import-empty');
        }
        console.debug('Debug: ROC import finished', {rows: result?.rows || 0, cols: result?.cols || 0}); // Debug: import finish trace
      }catch(err){
        if(forcedOverlay && isRocSessionActiveOrActivating(importSession)){
          resolveRocOverlay('file-import-error');
        }
        console.error('roc import failed', err);
      }
    });
  }

  // PART: STATS
  function normalizeRocPairs(pairs){
    return (Array.isArray(pairs) ? pairs : [])
      .map((pair, index) => ({
        label: pair?.label === 1 ? 1 : (pair?.label === 0 ? 0 : null),
        score: Number(pair?.score),
        analysisLabel: pair?.analysisLabel === 1 ? 1 : (pair?.analysisLabel === 0 ? 0 : undefined),
        analysisScore: Number.isFinite(Number(pair?.analysisScore)) ? Number(pair.analysisScore) : Number(pair?.score),
        rawLabel: pair?.rawLabel,
        originalScore: Number.isFinite(Number(pair?.originalScore)) ? Number(pair.originalScore) : Number(pair?.score),
        observationIndex: Number.isInteger(pair?.observationIndex) ? pair.observationIndex : index
      }))
      .filter(pair => pair.label !== null && Number.isFinite(pair.score));
  }

  function buildRankedCurve(pairs, graphType = 'roc'){
    const clean = normalizeRocPairs(pairs);
    const sorted = clean.slice().sort((a, b) => (b.score - a.score) || (a.observationIndex - b.observationIndex));
    const positives = sorted.reduce((sum, pair) => sum + pair.label, 0);
    const negatives = sorted.length - positives;
    if(positives < 1 || negatives < 1){
      return { points: [], metric: NaN, positives, negatives, sorted };
    }

    let tp = 0;
    let fp = 0;
    let metric = 0;
    const points = graphType === 'roc' ? [{ x: 0, y: 0 }] : [{ x: 0, y: 1 }];
    let previous = points[0];

    for(let index = 0; index < sorted.length; ){
      const threshold = sorted[index].score;
      while(index < sorted.length && sorted[index].score === threshold){
        if(sorted[index].label === 1){ tp += 1; } else { fp += 1; }
        index += 1;
      }
      const current = graphType === 'roc'
        ? { x: fp / negatives, y: tp / positives, threshold }
        : { x: tp / positives, y: tp / (tp + fp), threshold };
      if(graphType === 'roc'){
        metric += (current.x - previous.x) * (current.y + previous.y) / 2;
      }else{
        // Average precision: step-wise precision weighted by the increase in recall.
        metric += (current.x - previous.x) * current.y;
      }
      points.push(current);
      previous = current;
    }

    return { points, metric, positives, negatives, sorted };
  }

  function computeCurveMetric(pairs, graphType){
    return buildRankedCurve(pairs, graphType).metric;
  }

  function computeSampleVariance(values){
    const clean = Array.isArray(values) ? values.map(Number).filter(Number.isFinite) : [];
    if(clean.length < 2){ return 0; }
    const mean = clean.reduce((sum, value) => sum + value, 0) / clean.length;
    return clean.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / (clean.length - 1);
  }

  function resolveRocZCritical(alpha = 0.05){
    const safeAlpha = Number.isFinite(alpha) && alpha > 0 && alpha < 1 ? alpha : 0.05;
    if(global.jStat?.normal && typeof global.jStat.normal.inv === 'function'){
      const quantile = global.jStat.normal.inv(1 - (safeAlpha / 2), 0, 1);
      if(Number.isFinite(quantile)){ return quantile; }
    }
    return 1.959963984540054;
  }

  function computeWilsonInterval(successes, total, alpha = 0.05){
    const n = Number(total);
    const x = Number(successes);
    if(!Number.isFinite(n) || !Number.isFinite(x) || n <= 0 || x < 0 || x > n){ return null; }
    const p = x / n;
    const z = resolveRocZCritical(alpha);
    const z2 = z * z;
    const denom = 1 + (z2 / n);
    const centre = (p + (z2 / (2 * n))) / denom;
    const spread = (z / denom) * Math.sqrt(((p * (1 - p)) / n) + (z2 / (4 * n * n)));
    return { low: Math.max(0, centre - spread), high: Math.min(1, centre + spread) };
  }

  function computeDeLongAucEstimate(pairs, alpha = 0.05){
    const clean = normalizeRocPairs(pairs);
    const positives = clean.filter(pair => pair.label === 1).map(pair => pair.score);
    const negatives = clean.filter(pair => pair.label === 0).map(pair => pair.score);
    const m = positives.length;
    const n = negatives.length;
    if(m < 1 || n < 1){ return null; }
    const kernel = (positive, negative) => positive > negative ? 1 : (positive === negative ? 0.5 : 0);
    const v10 = positives.map(score => negatives.reduce((sum, negative) => sum + kernel(score, negative), 0) / n);
    const v01 = negatives.map(score => positives.reduce((sum, positive) => sum + kernel(positive, score), 0) / m);
    const auc = v10.reduce((sum, value) => sum + value, 0) / m;
    const variance = Math.max(0, (computeSampleVariance(v10) / m) + (computeSampleVariance(v01) / n));
    const se = Math.sqrt(variance);
    const zCritical = resolveRocZCritical(alpha);
    return {
      auc,
      variance,
      se,
      ciLow: Math.max(0, auc - (zCritical * se)),
      ciHigh: Math.min(1, auc + (zCritical * se)),
      method: 'DeLong'
    };
  }

  function rankRocScores(clean){
    const ordered = clean.slice().sort((a, b) => (a.score - b.score) || (a.observationIndex - b.observationIndex));
    const ranked = [];
    const tieSizes = [];
    for(let index = 0; index < ordered.length; ){
      let end = index + 1;
      while(end < ordered.length && ordered[end].score === ordered[index].score){ end += 1; }
      const averageRank = ((index + 1) + end) / 2;
      const tieSize = end - index;
      tieSizes.push(tieSize);
      for(let cursor = index; cursor < end; cursor += 1){ ranked.push({ ...ordered[cursor], rank: averageRank }); }
      index = end;
    }
    return { ranked, tieSizes, hasTies: tieSizes.some(size => size > 1) };
  }

  function exactMannWhitneyTwoSidedPValue(m, n, observedU){
    const total = m + n;
    const minRankSum = (m * (m + 1)) / 2;
    const maxRankSum = (m * ((2 * total) - m + 1)) / 2;
    const targetRankSum = observedU + minRankSum;
    const dp = Array.from({ length: m + 1 }, () => Array(maxRankSum + 1).fill(0n));
    dp[0][0] = 1n;
    for(let rank = 1; rank <= total; rank += 1){
      for(let chosen = Math.min(m, rank); chosen >= 1; chosen -= 1){
        for(let sum = maxRankSum; sum >= rank; sum -= 1){
          dp[chosen][sum] += dp[chosen - 1][sum - rank];
        }
      }
    }
    const observedDistance = Math.abs(observedU - ((m * n) / 2));
    let extreme = 0n;
    let combinations = 0n;
    for(let rankSum = minRankSum; rankSum <= maxRankSum; rankSum += 1){
      const count = dp[m][rankSum];
      if(count === 0n){ continue; }
      combinations += count;
      const u = rankSum - minRankSum;
      if(Math.abs(u - ((m * n) / 2)) >= observedDistance - 1e-12){ extreme += count; }
    }
    if(combinations === 0n){ return NaN; }
    return Math.min(1, Number(extreme) / Number(combinations));
  }

  function computeMannWhitneyInference(pairs, requestedMethod = 'auto'){
    const clean = normalizeRocPairs(pairs);
    const positives = clean.filter(pair => pair.label === 1);
    const negatives = clean.filter(pair => pair.label === 0);
    const m = positives.length;
    const n = negatives.length;
    if(m < 1 || n < 1){ return null; }
    const { ranked, tieSizes, hasTies } = rankRocScores(clean);
    const positiveRankSum = ranked.reduce((sum, row) => sum + (row.label === 1 ? row.rank : 0), 0);
    const u = positiveRankSum - ((m * (m + 1)) / 2);
    const auc = u / (m * n);
    const normalizedRequested = normalizeSingleRocPMethod(requestedMethod);
    const exactEligible = !hasTies && clean.length <= ROC_EXACT_MANN_WHITNEY_MAX_TOTAL;
    const useExact = normalizedRequested === 'exact' ? exactEligible : (normalizedRequested === 'auto' && exactEligible);
    if(useExact){
      return {
        auc, u, pValue: exactMannWhitneyTwoSidedPValue(m, n, u),
        requestedMethod: normalizedRequested, method: 'exact Mann–Whitney', exact: true,
        fallbackReason: null, positives: m, negatives: n, hasTies
      };
    }
    const total = m + n;
    const tieCorrection = tieSizes.reduce((sum, size) => sum + ((size ** 3) - size), 0);
    const variance = (m * n / 12) * ((total + 1) - (tieCorrection / (total * (total - 1))));
    const mean = (m * n) / 2;
    const signedDifference = u - mean;
    const continuityAdjusted = signedDifference === 0 ? 0 : Math.sign(signedDifference) * Math.max(0, Math.abs(signedDifference) - 0.5);
    const z = variance > 0 ? continuityAdjusted / Math.sqrt(variance) : 0;
    const fallbackReason = normalizedRequested === 'exact'
      ? (hasTies ? 'Exact rank inference is unavailable with tied scores.' : `Exact rank inference is limited to at most ${ROC_EXACT_MANN_WHITNEY_MAX_TOTAL} observations.`)
      : null;
    return {
      auc, u, z, pValue: rocNormalTwoSidedPValue(z),
      requestedMethod: normalizedRequested, method: 'asymptotic Mann–Whitney with tie correction and continuity correction',
      exact: false, fallbackReason, positives: m, negatives: n, hasTies
    };
  }

  function computeSingleAucInference(pairs, alpha = 0.05, pMethod = 'auto'){
    const estimate = computeDeLongAucEstimate(pairs, alpha);
    const significance = computeMannWhitneyInference(pairs, pMethod);
    if(!estimate || !significance){ return null; }
    return {
      ...estimate,
      pValue: significance.pValue,
      pMethod: significance.method,
      pRequestedMethod: significance.requestedMethod,
      pFallbackReason: significance.fallbackReason,
      mannWhitneyU: significance.u,
      mannWhitneyZ: significance.z,
      exactPValue: significance.exact
    };
  }

  function buildRocThresholdMetricsTable(pairs, alpha = 0.05){
    const ranked = buildRankedCurve(pairs, 'roc');
    const sorted = ranked.sorted;
    const positives = ranked.positives;
    const negatives = ranked.negatives;
    if(!sorted.length || positives < 1 || negatives < 1){ return []; }
    let tp = 0;
    let fp = 0;
    let tn = negatives;
    let fn = positives;
    const rows = [];
    for(let index = 0; index < sorted.length; ){
      const threshold = sorted[index].score;
      while(index < sorted.length && sorted[index].score === threshold){
        if(sorted[index].label === 1){ tp += 1; fn -= 1; } else { fp += 1; tn -= 1; }
        index += 1;
      }
      const sensitivity = tp / positives;
      const specificity = tn / negatives;
      const ppv = (tp + fp) > 0 ? tp / (tp + fp) : NaN;
      const npv = (tn + fn) > 0 ? tn / (tn + fn) : NaN;
      const accuracy = (tp + tn) / sorted.length;
      const f1 = (2 * tp + fp + fn) > 0 ? (2 * tp) / (2 * tp + fp + fn) : NaN;
      const youden = sensitivity + specificity - 1;
      const distanceToTopLeft = Math.hypot(1 - sensitivity, 1 - specificity);
      const lrPositive = specificity < 1 ? sensitivity / (1 - specificity) : Infinity;
      const lrNegative = specificity > 0 ? (1 - sensitivity) / specificity : Infinity;
      rows.push({
        threshold, tp, fp, tn, fn, sensitivity, specificity, ppv, npv, accuracy, f1, youden,
        distanceToTopLeft, lrPositive, lrNegative,
        sensitivityCi: computeWilsonInterval(tp, positives, alpha),
        specificityCi: computeWilsonInterval(tn, negatives, alpha),
        ppvCi: computeWilsonInterval(tp, tp + fp, alpha),
        npvCi: computeWilsonInterval(tn, tn + fn, alpha)
      });
    }
    return rows;
  }

  function selectYoudenThreshold(rows){
    const candidates = (Array.isArray(rows) ? rows : []).filter(row => Number.isFinite(row?.youden));
    if(!candidates.length){ return null; }
    return candidates.reduce((best, row) => {
      if(!best || row.youden > best.youden + 1e-12){ return row; }
      if(Math.abs(row.youden - best.youden) <= 1e-12){
        if(row.distanceToTopLeft < best.distanceToTopLeft - 1e-12){ return row; }
        if(Math.abs(row.distanceToTopLeft - best.distanceToTopLeft) <= 1e-12 && row.threshold > best.threshold){ return row; }
      }
      return best;
    }, null);
  }

  function selectMaximumF1Threshold(rows){
    const candidates = (Array.isArray(rows) ? rows : []).filter(row => Number.isFinite(row?.f1));
    if(!candidates.length){ return null; }
    return candidates.reduce((best, row) => {
      if(!best || row.f1 > best.f1 + 1e-12){ return row; }
      if(Math.abs(row.f1 - best.f1) <= 1e-12){
        if(row.distanceToTopLeft < best.distanceToTopLeft - 1e-12){ return row; }
        if(Math.abs(row.distanceToTopLeft - best.distanceToTopLeft) <= 1e-12 && row.threshold > best.threshold){ return row; }
      }
      return best;
    }, null);
  }

  function alignPairedCurveObservations(pairs1, pairs2){
    const first = new Map(normalizeRocPairs(pairs1).map(pair => [pair.observationIndex, pair]));
    const second = new Map(normalizeRocPairs(pairs2).map(pair => [pair.observationIndex, pair]));
    const aligned = [];
    first.forEach((a, observationIndex) => {
      const b = second.get(observationIndex);
      if(b && a.label === b.label){ aligned.push({ observationIndex, label: a.label, score1: a.score, score2: b.score }); }
    });
    return aligned.sort((a, b) => a.observationIndex - b.observationIndex);
  }

  function percentile(sorted, probability){
    if(!sorted.length){ return NaN; }
    const index = Math.max(0, Math.min(sorted.length - 1, probability * (sorted.length - 1)));
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if(lower === upper){ return sorted[lower]; }
    const weight = index - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  function sampleAlignedRowsWithinClasses(aligned, random){
    const positives = aligned.filter(row => row.label === 1);
    const negatives = aligned.filter(row => row.label === 0);
    if(!positives.length || !negatives.length){ return []; }
    const sampleClass = rows => Array.from({ length: rows.length }, () => rows[Math.min(rows.length - 1, Math.floor(random() * rows.length))]);
    return sampleClass(positives).concat(sampleClass(negatives));
  }

  function bootstrapCurveDiff(pairs1, pairs2, graphType, options = {}){
    const aligned = alignPairedCurveObservations(pairs1, pairs2);
    const config = normalizeRocResamplingOptions(options, ['roc-bootstrap-diff', graphType, aligned]);
    if(aligned.length < 2){ return null; }
    const asPairs = (rows, key) => rows.map(row => ({ label: row.label, score: row[key], observationIndex: row.observationIndex }));
    const baseDiff = computeCurveMetric(asPairs(aligned, 'score1'), graphType) - computeCurveMetric(asPairs(aligned, 'score2'), graphType);
    const diffs = [];
    for(let iteration = 0; iteration < config.iterations; iteration += 1){
      const sample = sampleAlignedRowsWithinClasses(aligned, config.random);
      const diff = computeCurveMetric(asPairs(sample, 'score1'), graphType) - computeCurveMetric(asPairs(sample, 'score2'), graphType);
      if(Number.isFinite(diff)){ diffs.push(diff); }
    }
    if(!diffs.length){ return null; }
    const centeredExtreme = diffs.filter(diff => Math.abs(diff - baseDiff) >= Math.abs(baseDiff)).length;
    diffs.sort((a, b) => a - b);
    return {
      p: (centeredExtreme + 1) / (diffs.length + 1),
      ci: [percentile(diffs, 0.025), percentile(diffs, 0.975)],
      diff: baseDiff,
      seed: config.seed,
      iterations: config.iterations,
      pairedCount: aligned.length,
      method: 'paired-bootstrap'
    };
  }

  async function bootstrapCurveDiffCooperative(pairs1, pairs2, graphType, options, checkpoint){
    const aligned = alignPairedCurveObservations(pairs1, pairs2);
    const config = normalizeRocResamplingOptions(options, ['roc-bootstrap-diff', graphType, aligned]);
    if(aligned.length < 2){ return null; }
    const asPairs = (rows, key) => rows.map(row => ({ label: row.label, score: row[key], observationIndex: row.observationIndex }));
    const baseDiff = computeCurveMetric(asPairs(aligned, 'score1'), graphType) - computeCurveMetric(asPairs(aligned, 'score2'), graphType);
    const diffs = [];
    for(let iteration = 0; iteration < config.iterations; iteration += 1){
      const sample = sampleAlignedRowsWithinClasses(aligned, config.random);
      const diff = computeCurveMetric(asPairs(sample, 'score1'), graphType) - computeCurveMetric(asPairs(sample, 'score2'), graphType);
      if(Number.isFinite(diff)){ diffs.push(diff); }
      if(!(await checkpoint())){ return null; }
    }
    if(!diffs.length){ return null; }
    const centeredExtreme = diffs.filter(diff => Math.abs(diff - baseDiff) >= Math.abs(baseDiff)).length;
    diffs.sort((a, b) => a - b);
    return { p:(centeredExtreme + 1)/(diffs.length + 1), ci:[percentile(diffs,0.025),percentile(diffs,0.975)], diff:baseDiff, seed:config.seed, iterations:config.iterations, pairedCount:aligned.length, method:'paired-bootstrap' };
  }

  function permutationCurveDiff(pairs1, pairs2, graphType, options = {}){
    const aligned = alignPairedCurveObservations(pairs1, pairs2);
    const config = normalizeRocResamplingOptions(options, ['roc-permutation-diff', graphType, aligned]);
    if(aligned.length < 2){ return null; }
    const asPairs = (rows, key) => rows.map(row => ({ label:row.label, score:row[key], observationIndex:row.observationIndex }));
    const baseDiff = computeCurveMetric(asPairs(aligned,'score1'),graphType)-computeCurveMetric(asPairs(aligned,'score2'),graphType);
    let count=0;
    for(let iteration=0; iteration<config.iterations; iteration+=1){
      const permuted=aligned.map(row => config.random()<0.5 ? row : { ...row, score1:row.score2, score2:row.score1 });
      const diff=computeCurveMetric(asPairs(permuted,'score1'),graphType)-computeCurveMetric(asPairs(permuted,'score2'),graphType);
      if(Math.abs(diff)>=Math.abs(baseDiff)-1e-15){ count+=1; }
    }
    return { p:(count+1)/(config.iterations+1), diff:baseDiff, seed:config.seed, iterations:config.iterations, pairedCount:aligned.length, method:'paired-permutation' };
  }

  async function permutationCurveDiffCooperative(pairs1, pairs2, graphType, options, checkpoint){
    const aligned = alignPairedCurveObservations(pairs1, pairs2);
    const config = normalizeRocResamplingOptions(options, ['roc-permutation-diff', graphType, aligned]);
    if(aligned.length < 2){ return null; }
    const asPairs = (rows, key) => rows.map(row => ({ label:row.label, score:row[key], observationIndex:row.observationIndex }));
    const baseDiff=computeCurveMetric(asPairs(aligned,'score1'),graphType)-computeCurveMetric(asPairs(aligned,'score2'),graphType);
    let count=0;
    for(let iteration=0; iteration<config.iterations; iteration+=1){
      const permuted=aligned.map(row => config.random()<0.5 ? row : { ...row, score1:row.score2, score2:row.score1 });
      const diff=computeCurveMetric(asPairs(permuted,'score1'),graphType)-computeCurveMetric(asPairs(permuted,'score2'),graphType);
      if(Math.abs(diff)>=Math.abs(baseDiff)-1e-15){ count+=1; }
      if(!(await checkpoint())){ return null; }
    }
    return { p:(count+1)/(config.iterations+1), diff:baseDiff, seed:config.seed, iterations:config.iterations, pairedCount:aligned.length, method:'paired-permutation' };
  }

  function delongCurveDiff(pairs1, pairs2){
    const aligned = alignPairedCurveObservations(pairs1, pairs2);
    const positives = aligned.filter(row => row.label === 1);
    const negatives = aligned.filter(row => row.label === 0);
    const m = positives.length;
    const n = negatives.length;
    if(m < 2 || n < 2){ return null; }
    const kernel = (positive, negative) => positive > negative ? 1 : (positive === negative ? 0.5 : 0);
    const calcPlacements = scoreKey => {
      const v10 = positives.map(pos => negatives.reduce((sum, neg) => sum + kernel(pos[scoreKey], neg[scoreKey]), 0) / n);
      const v01 = negatives.map(neg => positives.reduce((sum, pos) => sum + kernel(pos[scoreKey], neg[scoreKey]), 0) / m);
      return { v10, v01, auc:v10.reduce((sum,value)=>sum+value,0)/m };
    };
    const first=calcPlacements('score1');
    const second=calcPlacements('score2');
    const covariance=(a,b)=>{
      const meanA=a.reduce((sum,value)=>sum+value,0)/a.length;
      const meanB=b.reduce((sum,value)=>sum+value,0)/b.length;
      return a.reduce((sum,value,index)=>sum+((value-meanA)*(b[index]-meanB)),0)/(a.length-1);
    };
    const variance = Math.max(0,
      (covariance(first.v10,first.v10)+covariance(second.v10,second.v10)-2*covariance(first.v10,second.v10))/m +
      (covariance(first.v01,first.v01)+covariance(second.v01,second.v01)-2*covariance(first.v01,second.v01))/n
    );
    const se=Math.sqrt(variance);
    const diff=first.auc-second.auc;
    const z=se>0?diff/se:(diff===0?0:Math.sign(diff)*Infinity);
    const p=se>0?rocNormalTwoSidedPValue(z):(diff===0?1:0);
    const critical=resolveRocZCritical(0.05);
    return { p, diff, ci:[diff-critical*se,diff+critical*se], se, z, pairedCount:aligned.length, method:'DeLong' };
  }

  function formatPValue(value){
    const formatter = Shared.formatters?.formatPValue || Shared.formatPValue;
    const scientific = Shared.statsReporting?.getPValueFormatScientific?.({
      target: refs.statsResults || null,
      tabId: getRocProjectionTabId() || null
    }) === true;
    if(typeof formatter === 'function'){
      return formatter(value, { scientific, forceScientific: scientific });
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
    const num = Number(value);
    const formatted = scientific ? num.toExponential(5) : (num >= 0 && num <= 0.0001 ? '<0.0001' : num.toFixed(4).replace(/0+$/, '').replace(/\.$/, ''));
    console.debug('Debug: ROC formatPValue fallback',{ input: value, formatted });
    return formatted;
  }

  function rocNormalTwoSidedPValue(z){
    const numericZ = Number(z);
    if(Number.isNaN(numericZ)){ return NaN; }
    if(!Number.isFinite(numericZ)){ return 0; }
    const helper = Shared.stats?.normalTwoSidedPValue;
    if(typeof helper === 'function'){
      const value = helper(numericZ);
      if(Number.isFinite(value)){ return Math.max(0, Math.min(1, value)); }
    }
    const cdf = global.jStat?.normal?.cdf;
    if(typeof cdf === 'function'){
      return Math.max(0, Math.min(1, 2 * (1 - cdf(Math.abs(numericZ), 0, 1))));
    }
    // Abramowitz-Stegun approximation of the standard-normal survival function.
    const x = Math.abs(numericZ);
    const t = 1 / (1 + (0.2316419 * x));
    const density = Math.exp(-(x * x) / 2) / Math.sqrt(2 * Math.PI);
    const upperTail = density * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return Math.max(0, Math.min(1, 2 * upperTail));
  }

  // PART: DRAW
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

  function renderRocAucDirectionWarning(stats, graphType){
    const warning = getRocAucDirectionWarning(stats, graphType);
    if(!warning || !refs.statsResults){ return null; }
    const banner = document.createElement('div');
    banner.className = 'roc-auc-direction-warning';
    banner.setAttribute('role', 'alert');
    banner.setAttribute('aria-live', 'polite');
    const title = document.createElement('strong');
    title.textContent = 'Check classification setup';
    const message = document.createElement('span');
    message.textContent = warning;
    banner.appendChild(title);
    banner.appendChild(message);
    refs.statsResults.insertBefore(banner, refs.statsResults.firstChild || null);
    return banner;
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
      state.statsPanelModel = { resultsModel: null, reportModel: null };
      const session = getActiveRocSessionForState();
      if(session){
        session.state.statsPanelModel = createDefaultRocStatsPanelModel(state.statsPanelModel);
        session.results = createDefaultRocResultsState({
          statsPanelModel: session.state.statsPanelModel,
          compareSelection: state.compareSelection || state.compareSel?.value || null,
          diffMethod: state.diffMethod,
          compareResult: state.compareResultModel
        });
        session.updatedAt = Date.now();
      }
      return;
    }
    const hasStatsTable=Shared.statsTable && typeof Shared.statsTable.render==='function';
    const summaryColumns=[
      { key:'series', label:'Series', align:'left' },
      { key:'auc', label:graphType==='roc'?'AUC':'Average precision', align:'right' }
    ];
    if(graphType==='roc'){
      summaryColumns.push(
        { key:'aucSe', label:'AUC SE', align:'right' },
        { key:'aucCi', label:'AUC 95% CI', align:'right' }
      );
    }
    if(graphType==='roc'){
      summaryColumns.push(
        { key:'p', label:'p value (Mann–Whitney)', align:'right' },
        { key:'pMethod', label:'p-value method', align:'left' }
      );
    }
    if(graphType==='roc'){
      summaryColumns.push(
        { key:'threshold', label:'Youden threshold', align:'right' },
        { key:'cutoffRule', label:'Cutoff rule', align:'left' },
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
        { key:'threshold', label:'Maximum-F1 threshold', align:'right' },
        { key:'cutoffRule', label:'Cutoff rule', align:'left' },
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
      p:graphType==='roc' ? formatPValue(stat.pVal) : undefined,
      pMethod:graphType==='roc' ? (stat.pMethod?.startsWith('exact') ? 'Exact' : 'Asymptotic, tie corrected') : undefined,
      threshold:Number.isFinite(stat.thr)?stat.thr.toFixed(3):'—',
      cutoffRule:stat.cutoffRule || '—',
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
        ? 'AUC is tie-aware. The p value tests AUC = 0.5 with a two-sided Mann–Whitney rank test.'
        : 'Average precision is computed as step-wise precision weighted by each increase in recall.',
      graphType==='roc'
        ? `The reported cutoff maximizes the Youden index (sensitivity + specificity − 1); ties are resolved by proximity to the top-left ROC corner, then by the ${stats[0]?.scoreDirection === 'lower' ? 'lower' : 'higher'} original-score threshold.`
        : 'The reported cutoff maximizes the F1 score; this criterion depends on class prevalence and does not use true negatives.'
    ];
    const setup = stats[0] || {};
    footnotes.push(
      `Positive class: ${formatRocClassValue(setup.positiveClass)}. Negative class: ${formatRocClassValue(setup.negativeClass)}. Score direction: ${setup.scoreDirection === 'lower' ? 'Lower values indicate positive' : 'Higher values indicate positive'}.`
    );
    const directionWarning = getRocAucDirectionWarning(stats, graphType);
    if(directionWarning){
      footnotes.push(directionWarning);
    }
    if(graphType==='roc'){
      footnotes.push('AUC SE and the Wald 95% CI use the nonparametric DeLong variance estimate. Single-curve significance uses exact Mann–Whitney inference for eligible untied samples and a tie-corrected, continuity-corrected asymptotic Mann–Whitney test otherwise.');
      const pMethods = Array.from(new Set(stats.map(stat => stat.pMethod).filter(Boolean)));
      if(pMethods.length){ footnotes.push(`Applied single-curve p-value method(s): ${pMethods.join('; ')}.`); }
      const fallbacks = stats.map(stat => stat.pFallbackReason).filter(Boolean);
      if(fallbacks.length){ footnotes.push(`Exact-test fallback: ${Array.from(new Set(fallbacks)).join(' ')}`); }
      footnotes.push('Cutoff tables include Wilson 95% confidence intervals for sensitivity, specificity, PPV, and NPV.');
    }
    const model={
      caption:graphType==='roc'?'ROC metrics':'Precision–Recall metrics',
      section:'summary',
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
          section: 'supplementary',
          columns: thresholdTableColumns,
          rows: buildThresholdRows(thresholdRows),
          footnotes: [`Rows reflect score cutoffs applied as Score ${stat.cutoffOperator || '≥'} threshold.`],
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
      renderRocAucDirectionWarning(stats, graphType);
      console.debug('Debug: roc stats rendered via Shared.statsTable',{ graphType, rowCount:rows.length });
      return;
    }
    rows.forEach(row=>{
      const paragraph=document.createElement('p');
      const metrics=[
        `${graphType==='roc'?'AUC':'Area'} ${row.auc}`,
        graphType==='roc' ? `p ${row.p}` : null,
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
    appendThresholdTables(false);
    renderRocAucDirectionWarning(stats, graphType);
    console.debug('Debug: roc stats fallback rendered',{ graphType, rowCount:rows.length });
  }


  function appendRocReportPanel(stats, graphType, diffResult){
    if(!refs.statsResults || !Array.isArray(stats) || !stats.length || !(Shared.statsReporting && typeof Shared.statsReporting.appendReportPanel==='function')){
      return;
    }
    const primary = stats[0] || null;
    const positiveClassText = formatRocClassValue(primary?.positiveClass);
    const negativeClassText = formatRocClassValue(primary?.negativeClass);
    const scoreDirectionText = primary?.scoreDirection === 'lower' ? 'Lower values indicate positive' : 'Higher values indicate positive';
    const cutoffRuleText = primary?.cutoffRule || `Score ${rocCutoffOperator(primary?.scoreDirection)} threshold`;
    const directionWarning = getRocAucDirectionWarning(stats, graphType);
    const compareText = state.compareResult && state.compareResult.textContent ? state.compareResult.textContent.trim() : '';
    const primaryTextPrefix = primary ? `${primary.name} yielded ${graphType === 'roc' ? 'AUC' : 'average precision'} = ${formatRocDecimal(primary.auc,3)}${graphType === 'roc' && Number.isFinite(primary.aucCiLow) && Number.isFinite(primary.aucCiHigh) ? ` (95% CI ${formatRocDecimal(primary.aucCiLow,3)} to ${formatRocDecimal(primary.aucCiHigh,3)}) and two-sided Mann–Whitney p = ` : '.'}` : '';
    const compareParts = compareText && diffResult && Number.isFinite(diffResult.p)
      ? [
          `${graphType === 'roc' ? 'ΔAUC' : 'ΔAP'} = ${diffResult.diff.toFixed(3)} (${diffResult.method || state.diffMethod}), p = `,
          { type:'pValue', value:diffResult.p, fallback:String(formatPValue(diffResult.p)) },
          Array.isArray(diffResult.ci) ? `, CI = [${diffResult.ci[0].toFixed(3)}, ${diffResult.ci[1].toFixed(3)}]` : ''
        ]
      : (compareText || null);
    Shared.statsReporting.appendReportPanel(refs.statsResults, {
      methodsText: `${graphType === 'roc' ? 'ROC' : 'Precision–recall'} summary statistics were computed for ${stats.length} series after excluding rows with missing labels or non-numeric scores. Positive class: ${positiveClassText}. Negative class: ${negativeClassText}. Score direction: ${scoreDirectionText}. ${graphType === 'roc' ? 'Tied scores were processed as one threshold. AUC standard errors and Wald 95% confidence intervals used the nonparametric DeLong variance estimate. Single-curve significance used a two-sided Mann–Whitney test of AUC = 0.5: exact for eligible untied samples and tie-corrected, continuity-corrected asymptotic inference otherwise. The default cutoff maximized the Youden index. Diagnostic-rate confidence intervals used the Wilson method.' : 'Tied scores were processed as one threshold. Average precision used step-wise precision weighted by increases in recall. The displayed cutoff maximized F1.'} ${diffResult && state.diffMethod !== 'delong' ? `Monte Carlo curve-comparison p values used ${state.resamplingIterations} iterations with seed ${state.resamplingSeed}.` : ''} Cutoff rule: ${cutoffRuleText}.`,
      resultsText: [
        `${stats.length} series were analysed.`,
        primary ? (graphType === 'roc' ? `${primaryTextPrefix}${formatPValue(primary.pVal)}.` : primaryTextPrefix) : null,
        graphType === 'roc' && primary && Array.isArray(primary.thresholdRows) ? `${primary.thresholdRows.length} cutoff row(s) were tabulated for ${primary.name}.` : null,
        directionWarning || null,
        compareText || null
      ].filter(Boolean).join(' '),
      resultsParts: [
        `${stats.length} series were analysed.`,
        primary ? (graphType === 'roc' ? [' ', primaryTextPrefix, { type:'pValue', value:primary.pVal, fallback:String(formatPValue(primary.pVal)) }, '.'] : [' ', primaryTextPrefix]) : null,
        graphType === 'roc' && primary && Array.isArray(primary.thresholdRows) ? ` ${primary.thresholdRows.length} cutoff row(s) were tabulated for ${primary.name}.` : null,
        directionWarning ? ` ${directionWarning}` : null,
        compareParts ? [' ', compareParts] : null
      ].filter(Boolean),
      analysisSpec: {
        component: 'roc',
        graphType,
        seriesCount: stats.length,
        cutoffRows: stats.reduce((sum, stat) => sum + (Array.isArray(stat.thresholdRows) ? stat.thresholdRows.length : 0), 0),
        diffMethod: state.diffMethod,
        resamplingSeed: state.resamplingSeed,
        resamplingIterations: state.resamplingIterations,
        compareSelection: state.compareSelection || state.compareSel?.value || null,
        positiveClass: primary?.positiveClass,
        negativeClass: primary?.negativeClass,
        scoreDirection: primary?.scoreDirection,
        cutoffRule: cutoffRuleText,
        compared: !!compareText,
        differenceSummary: diffResult ? {
          diff: Number.isFinite(diffResult.diff) ? Number(diffResult.diff) : null,
          p: Number.isFinite(diffResult.p) ? Number(diffResult.p) : null,
          ci: Array.isArray(diffResult.ci) ? diffResult.ci : null
        } : null
      }
    }, { title: 'Reporting and reproducibility' });
    pinRocStatsReportAfterMetrics();
  }

  function getRocSessionForDrawMeta(meta = {}, options = {}){
    const source = meta && typeof meta === 'object' ? meta : {};
    const tabId = source.tabId || source.tab?.id || getRocProjectionTabId() || null;
    return tabId
      ? getRocSession(tabId, {
          ...(source || {}),
          tabId,
          reason: source.reason || options.reason || 'roc-draw-session'
        }, { create: options.create !== false })
      : getActiveRocSessionForState();
  }

  async function runRocDrawCycle(meta = {}){
    const scheduleMeta = meta?.__workspaceSessionMeta || null;
    if(scheduleMeta && !Shared.workspaceTabs?.isSessionMetaCurrent?.('roc', scheduleMeta)){
      console.debug('Debug: roc scheduled draw skipped for inactive tab', {
        tabId: scheduleMeta.tabId || meta?.tabId || null,
        reason: meta?.reason || 'roc-draw'
      });
      return;
    }
    const drawSession = getRocSessionForDrawMeta(meta, { reason: meta?.reason || 'roc-draw-cycle-session' });
    if(drawSession && !isRocSessionActiveOrActivating(drawSession)){
      drawSession.state.drawPending = true;
      drawSession.updatedAt = Date.now();
      return;
    }
    const requestedGeneration = Number(meta?.drawGeneration);
    if(Number.isFinite(requestedGeneration) && requestedGeneration > 0){
      if(requestedGeneration !== Number(drawSession?.timers?.drawGeneration || 0)){
        return;
      }
    }else if(drawSession?.timers){
      drawSession.timers.drawGeneration = Number(drawSession.timers.drawGeneration || 0) + 1;
      meta = { ...(meta || {}), drawGeneration: drawSession.timers.drawGeneration };
      drawSession.state.drawPending = true;
      if(isRocSessionActiveOrActivating(drawSession)){
        state.drawPending = true;
      }
    }
    const drawGeneration = Number(meta?.drawGeneration || drawSession?.timers?.drawGeneration || 0);
    bindRocSessionForTab(drawSession?.tabId || meta?.tab || meta?.tabId || getRocProjectionTabId() || null, {
      ...(meta || {}),
      reason: meta?.reason || 'roc-draw-bind'
    }, { apply: false });
    let status = 'complete';
    try{
      await drawRoc({ ...(meta || {}), tabId: drawSession?.tabId || meta?.tabId || undefined }, drawSession);
    }catch(err){
      status = 'error';
      throw err;
    }finally{
      if(drawSession?.timers && drawGeneration === Number(drawSession.timers.drawGeneration || 0)){
        drawSession.state.drawPending = false;
        drawSession.timers.pendingDrawOptions = null;
        drawSession.updatedAt = Date.now();
        if(isRocSessionActiveOrActivating(drawSession)){
          state.drawPending = false;
        }
      }
      resolveRocOverlay({ reason: status, status, tabId: drawSession?.tabId || meta?.tabId || null });
    }
  }

  async function drawRoc(meta = {}, session = null){
    const drawSession = ensureRocSessionOwnershipShape(session || getRocSessionForDrawMeta(meta, { reason: meta?.reason || 'roc-draw-session' }));
    if(drawSession && !isRocSessionActiveOrActivating(drawSession)){
      drawSession.state.drawPending = true;
      drawSession.updatedAt = Date.now();
      return false;
    }
    bindRocSessionForTab(drawSession?.tabId || meta?.tab || meta?.tabId || getRocProjectionTabId() || null, {
      ...(meta || {}),
      reason: meta?.reason || 'roc-draw'
    }, { apply: false });
    const drawTabId = drawSession?.tabId || meta?.tabId || getRocProjectionTabId() || null;
    const execution = Shared.jobs?.createExecutionContext?.({
      component: 'roc',
      tabId: drawTabId || '',
      kind: 'graph',
      budgetMs: 10
    }) || null;
    const checkpoint = async () => {
      try{
        await execution?.checkpoint?.();
      }catch(err){
        if(execution?.signal?.aborted || execution?.isCurrent?.() === false){
          return false;
        }
        throw err;
      }
      return execution?.isCurrent?.() !== false
        && Number(drawSession?.timers?.drawGeneration || 0) === Number(meta?.drawGeneration || 0);
    };
    const drawRefs = Object.assign(createDefaultRocRefs(drawSession?.root || state.root || null), drawSession?.refs || {}, refs || {});
    drawRefs.root = drawSession?.root || drawRefs.root || state.root || resolveRocRoot(drawTabId) || null;
    drawRefs.plotDiv = getRocNodeById('rocPlot', drawTabId) || drawRefs.plotDiv || refs.plotDiv || null;
    drawRefs.svgBox = drawRefs.plotDiv?.closest?.('.svgbox') || queryRocRoot('#rocGraphPanel .svgbox', drawTabId) || drawRefs.svgBox || refs.svgBox || null;
    drawRefs.fontSize = getRocNodeById('rocFontSize', drawTabId) || drawRefs.fontSize || refs.fontSize || null;
    drawRefs.fontSizeVal = getRocNodeById('rocFontSizeVal', drawTabId) || drawRefs.fontSizeVal || refs.fontSizeVal || null;
    if(drawSession){
      drawSession.refs = Object.assign(createDefaultRocRefs(drawRefs.root || null), drawSession.refs || {}, drawRefs);
      drawSession.updatedAt = Date.now();
    }
    if(isRocSessionActiveOrActivating(drawSession)){
      Object.assign(refs, drawRefs);
    }
    if(!state.hot || !drawRefs.plotDiv){
      return false;
    }
    const debugStamp = Date.now();
    const controls = syncRocRuntimeControlsFromDom();
    console.debug('Debug: drawRoc start', { debugStamp, graphType: controls.graphType || 'roc' }); // Debug: draw entry
    const graphType = controls.graphType || 'roc';
    if(state.titleText == null || state.titleText === ''){
      state.titleText = getDefaultRocTitle(graphType);
    }
    const drawableFrame = resolveRocDrawableFrame(drawRefs.plotDiv);
    const borderWidthRaw = Number(state.borderWidth) || DEFAULT_ROC_BORDER_WIDTH;
    const showGrid = !!controls.showGrid;
    const showFrame = !!controls.showFrame;
    console.debug('Debug: roc showFrame state',{showFrame});
    const fontInfo=chartStyle.resolveScaledFontSize({
      rawSize: controls.fontSize,
      width: drawableFrame.width,
      height: drawableFrame.height,
      svgBox: drawRefs.svgBox,
      input: drawRefs.fontSize
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
    if(drawRefs.fontSizeVal){ chartStyle.renderFontSizeLabel({ element: drawRefs.fontSizeVal, fontInfo, input: drawRefs.fontSize }); }
    console.debug('Debug: roc font scaling applied',{
      input:controls.fontSize,
      fontSizePt:fontInfo.pt,
      baseFontPx:fontInfo.px,
      scaledFontPx:fontSize,
      scale:styleScaleInfo?.styleScale || styleScaleInfo?.scale,
      containerWidth:drawableFrame.width,
      containerHeight:drawableFrame.height
    });
    const axisMetrics = chartStyle.createAxisMetrics(fontInfo.px, styleScaleInfo);
    console.debug('Debug: roc axis metrics',axisMetrics);

    const data = getRocAnalysisData(state.hot);
    if(!(await checkpoint())){
      return false;
    }
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
    const rawLabels = bodyRows.map(row => row[labelIndex]);
    const classification = syncRocClassificationControls(rawLabels);
    if(!classification.valid){
      clearPlotArea('invalid-outcome-classes', { message: 'Exactly two valid Label classes are required.' });
      return;
    }
    const scoreColumns = header
      .map((_, idx) => idx)
      .filter(idx => idx !== labelIndex && header[idx] != null && String(header[idx]).trim() !== '');
    const series = scoreColumns.map((colIdx, index) => ({
      name: header[colIdx] || `Model ${index + 1}`,
      scores: bodyRows.map(row => parseRocScore(row[colIdx]))
    }));
    if(!(await checkpoint())){
      return false;
    }
    if(!series.length){
      clearPlotArea('no-series');
      return;
    }
    const hasValidScores = series.some(serie => serie.scores.some(score => !Number.isNaN(score)));
    if(!hasValidScores){
      clearPlotArea('no-scores');
      return;
    }

    const canonicalSeries = series.map(serie => ({
      ...serie,
      pairs: buildCanonicalAnalysisPairs(rawLabels, serie.scores, classification)
    }));
    const referencePairs = canonicalSeries[0]?.pairs || [];
    const positives = referencePairs.filter(pair => pair.analysisLabel === 1).length;
    const negatives = referencePairs.filter(pair => pair.analysisLabel === 0).length;
    const pairCountsForAdvisor = canonicalSeries.map(serie => serie.pairs.length);
    state.advisorContext = {
      graphType,
      positives,
      negatives,
      seriesCount: series.length,
      pairCounts: pairCountsForAdvisor,
      minPairs: pairCountsForAdvisor.length ? Math.min(...pairCountsForAdvisor) : 0
    };
    renderRocStatsAdvisor(state.advisorContext);

    const legendLabels = canonicalSeries.map(s => s.name);
    ensureLabelColors(legendLabels);

    populateRocCompareOptions(canonicalSeries.map(s => s.name));
    state.analysisSignature = buildRocAnalysisSignature({
      data,
      graphType,
      positiveClass: classification.positiveClass,
      negativeClass: classification.negativeClass,
      scoreDirection: classification.scoreDirection,
      singleRocPMethod: state.singleRocPMethod,
      diffMethod: state.diffMethod,
      compareSelection: state.compareSelection || state.compareSel?.value || null,
      resamplingSeed: state.resamplingSeed,
      resamplingIterations: state.resamplingIterations
    });

    const plotEl = drawRefs.plotDiv;
    plotEl.style.display = 'block';
    while(plotEl.firstChild){
      plotEl.removeChild(plotEl.firstChild);
    }
    const width = Math.max(50, Math.floor(drawableFrame.width || 50));
    const height = Math.max(40, Math.floor(drawableFrame.height || 40));
    plotEl.style.position = 'relative';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('id', 'rocSvg');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('font-family', chartStyle.FONT_FAMILY);
    svg.dataset.fontScope = 'roc';
    console.debug('Debug: roc svg dataset scope assigned', { scope: svg.dataset.fontScope }); // Debug: svg font scope tagging
    chartStyle.prepareSvg(svg, { scopeId: 'roc' });
    plotEl.appendChild(svg);

    ensureRocLegendControlPlacement();
    const showLegend = controls.showLegend !== false;
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
      scaleInfo: styleScaleInfo,
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
    const xAxisLabel = graphType === 'roc' ? 'False Positive Rate' : 'Recall';
    const yAxisLabel = graphType === 'roc' ? 'True Positive Rate' : 'Precision';
    const hasYTitle = yAxisLabel.trim().length > 0;
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
    let margin = chartStyle.computeBaseMargins({fontSize, legendWidth, maxYLabelWidth, hasYTitle, axisMetrics});
    let plotWidth = Math.max(20, width - margin.left - margin.right);
    let plotHeight = Math.max(20, height - margin.top - margin.bottom);
    let bottomLayout = chartStyle.computeBottomLayout({labels: xTickLabels, fontSize, labelMeasureFont: xTickMeasureFont, plotWidth, baseBottom: margin.bottom, axisMetrics});
    margin.bottom = bottomLayout.bottom;
    margin = chartStyle.stabilizeAxisResizeMargins
      ? chartStyle.stabilizeAxisResizeMargins(margin, { svgBox: drawRefs.svgBox, scopeId: 'roc' })
      : margin;
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
      margin = chartStyle.computeBaseMargins({fontSize, legendWidth, maxYLabelWidth, hasYTitle, axisMetrics});
      plotWidth = Math.max(20, width - margin.left - margin.right);
      plotHeight = Math.max(20, height - margin.top - margin.bottom);
      bottomLayout = chartStyle.computeBottomLayout({labels: xTickLabels, fontSize, labelMeasureFont: xTickMeasureFont, plotWidth, baseBottom: margin.bottom, axisMetrics});
      margin.bottom = bottomLayout.bottom;
      margin = chartStyle.stabilizeAxisResizeMargins
        ? chartStyle.stabilizeAxisResizeMargins(margin, { svgBox: drawRefs.svgBox, scopeId: 'roc' })
        : margin;
      plotWidth = Math.max(20, width - margin.left - margin.right);
      plotHeight = Math.max(20, height - margin.top - margin.bottom);
    }
    console.debug('Debug: roc tick targets',{tickCount, tickSteps: Math.max(tickCount - 1, 1), xTickCount: xTicks.length, yTickCount: yTicks.length}); // Debug: ROC tick density summary
    console.debug('Debug: roc layout',{margin,plotWidth,plotHeight,rotate:bottomLayout.shouldRotate});

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
      getEffectiveTickInterval: () => {
        const ticks = axis === 'x' ? xTicks : yTicks;
        return ticks.length > 1 ? Math.abs(Number(ticks[1]) - Number(ticks[0])) : null;
      },
        getMajorTickLength: () => getAxisMajorTickLength(axis),
        onMajorTickLengthChange: value => updateAxisMajorTickLength(axis, value),
        isMajorTickLengthSupported: () => true,
        majorTickLengthPlaceholder: 'Auto',
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
    const xMajorTickLength = getAxisMajorTickLength('x') ?? tickLen;
    const yMajorTickLength = getAxisMajorTickLength('y') ?? tickLen;
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
      add('line', {x1: x, y1: margin.top + plotHeight, x2: x, y2: margin.top + plotHeight + xMajorTickLength, stroke: axisStroke, 'stroke-width': axisStrokeWidth});
      const extra = Shared.computeAxisLabelYOffset ? Shared.computeAxisLabelYOffset(fontSize, xMajorTickLength, tickGap) : 0;
      const txt = add('text', {x, y: margin.top + plotHeight + xMajorTickLength + tickGap + extra, 'text-anchor': 'middle', 'font-size': fontSize, fill: chartStyle.TEXT_COLOR}, formatTick(tick), { role: 'xTick' });
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
      add('line', {x1: margin.left - yMajorTickLength, y1: y, x2: margin.left, y2: y, stroke: axisStroke, 'stroke-width': axisStrokeWidth});
      add('text', {x: margin.left - (yMajorTickLength + tickGap), y, 'text-anchor': 'end', 'font-size': fontSize, 'dominant-baseline': 'middle', fill: chartStyle.TEXT_COLOR}, formatTick(tick), { role: 'yTick' });
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
        // Use saved absolute positioning when no relative anchor is present
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
          patchRocLabelPosition(drawSession, 'xLabel', {
            x: pos.x,
            y: pos.y,
            relX: relX,
            relY: relY
          }, { reason: 'roc-x-label-position' });
          console.debug('Debug: roc x-label position saved', { absolute: pos, relative: { relX, relY } });
        }
      });
    }

    const yLabelOffsetSpan = (maxYLabelWidth + yMajorTickLength + tickGap + axisMetrics.axisTitleGap + fontSize * 0.5);
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
        // Use saved absolute positioning when no relative anchor is present
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
          patchRocLabelPosition(drawSession, 'yLabel', {
            x: pos.x,
            y: pos.y,
            relX: relX,
            relY: relY
          }, { reason: 'roc-y-label-position' });
          console.debug('Debug: roc y-label position saved', { absolute: pos, relative: { relX, relY } });
        }
      });
    }

    const titleY = Math.max(fontSize * 1.6, margin.top * 0.5);
    const defaultTitle = getDefaultRocTitle(graphType);
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
        // Use saved absolute positioning when no relative anchor is present
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
      patchRocVisualState(drawSession, { titleText: nextValue }, { reason: 'roc-title-edit' });
      if(titleNode && titleNode.textContent !== nextValue){
        titleNode.textContent = nextValue;
      }
      scheduleRocDrawForSession(drawSession, { reason: 'roc-title-edit' });
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
          patchRocLabelPosition(drawSession, 'title', {
            x: pos.x,
            y: pos.y,
            relX: relX,
            relY: relY
          }, { reason: 'roc-title-position' });
          console.debug('Debug: roc title position saved', { absolute: pos, relative: { relX, relY } });
        }
      });
    }

    const stats = [];
    const allPairs = [];

    for(let seriesIndex = 0; seriesIndex < canonicalSeries.length; seriesIndex += 1){
      const serie = canonicalSeries[seriesIndex];
      const pairs = serie.pairs;
      const rankedCurve = buildRankedCurve(pairs, graphType);
      const rankedPairs = rankedCurve.sorted;
      allPairs.push(rankedPairs);
      const points = rankedCurve.points;
      const auc = rankedCurve.metric;
      const avgPrecision = graphType === 'pr' ? rankedCurve.metric : undefined;
      const analysisThresholdRows = buildRocThresholdMetricsTable(rankedPairs);
      const selectedCutoff = graphType === 'roc' ? selectYoudenThreshold(analysisThresholdRows) : selectMaximumF1Threshold(analysisThresholdRows);
      const thresholdRows = analysisThresholdRows.map(row => ({
        ...row,
        analysisThreshold: row.threshold,
        threshold: rocOriginalThreshold(row.threshold, classification.scoreDirection),
        cutoffOperator: rocCutoffOperator(classification.scoreDirection)
      }));
      const aucUncertainty = graphType === 'roc' ? computeSingleAucInference(rankedPairs, 0.05, state.singleRocPMethod) : null;

      stats.push({
        name: serie.name,
        auc,
        avgPrecision,
        aucSe: aucUncertainty?.se,
        aucCiLow: aucUncertainty?.ciLow,
        aucCiHigh: aucUncertainty?.ciHigh,
        aucZ: aucUncertainty?.mannWhitneyZ,
        thr: Number.isFinite(selectedCutoff?.threshold)
          ? rocOriginalThreshold(selectedCutoff.threshold, classification.scoreDirection)
          : NaN,
        cutoffOperator: rocCutoffOperator(classification.scoreDirection),
        cutoffRule: Number.isFinite(selectedCutoff?.threshold)
          ? `Score ${rocCutoffOperator(classification.scoreDirection)} ${formatRocDecimal(rocOriginalThreshold(selectedCutoff.threshold, classification.scoreDirection), 3)}`
          : null,
        positiveClass: classification.positiveClass,
        negativeClass: classification.negativeClass,
        scoreDirection: classification.scoreDirection,
        thresholdMethod: graphType === 'roc' ? 'Youden index' : 'maximum F1 score',
        youden: selectedCutoff?.youden,
        accuracy: selectedCutoff?.accuracy,
        precision: selectedCutoff?.ppv,
        recall: selectedCutoff?.sensitivity,
        specificity: selectedCutoff?.specificity,
        npv: selectedCutoff?.npv,
        lrPositive: selectedCutoff?.lrPositive,
        lrNegative: selectedCutoff?.lrNegative,
        f1: selectedCutoff?.f1,
        pVal: graphType === 'roc' ? aucUncertainty?.pValue : NaN,
        pMethod: graphType === 'roc' ? aucUncertainty?.pMethod : null,
        pRequestedMethod: graphType === 'roc' ? aucUncertainty?.pRequestedMethod : null,
        pFallbackReason: graphType === 'roc' ? aucUncertainty?.pFallbackReason : null,
        mannWhitneyU: graphType === 'roc' ? aucUncertainty?.mannWhitneyU : null,
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
      if(!(await checkpoint())){
        return false;
      }
    }

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
          // Use saved absolute positioning when no relative anchor is present
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
              patchRocLabelPosition(drawSession, 'legend', {
                x: pos.x,
                y: pos.y,
                relX: relX,
                relY: relY
              }, { reason: 'roc-legend-position' });
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

    if(!(await checkpoint())){
      return false;
    }
    renderRocStatsSummary(stats, graphType);

    let diffResult = null;
    if(series.length >= 2 && state.compareSel && state.compareSel.value){
      const compareSelection = state.compareSel.value;
      const [i, j] = compareSelection.split(',').map(Number);
      const pairsA = allPairs[i];
      const pairsB = allPairs[j];
      const signature = buildRocCompareResultSignature({
        graphType,
        diffMethod: state.diffMethod,
        compareSelection,
        pairsA,
        pairsB,
        resamplingSeed: state.resamplingSeed,
        resamplingIterations: state.resamplingIterations,
        positiveClass: classification.positiveClass,
        negativeClass: classification.negativeClass,
        scoreDirection: classification.scoreDirection
      });
      const savedCompareResult = normalizeRocCompareResultModel(state.compareResultModel);
      if(savedCompareResult
        && savedCompareResult.signature === signature
        && savedCompareResult.graphType === graphType
        && savedCompareResult.diffMethod === state.diffMethod
        && savedCompareResult.compareSelection === compareSelection
        && savedCompareResult.resamplingSeed === state.resamplingSeed
        && savedCompareResult.resamplingIterations === state.resamplingIterations
        && savedCompareResult.displayText){
        diffResult = cloneSimple(savedCompareResult.result) || null;
        state.compareResult.textContent = savedCompareResult.displayText;
      }else{
        if(graphType === 'roc' && state.diffMethod === 'delong'){
          diffResult = delongCurveDiff(pairsA, pairsB);
        }else if(state.diffMethod === 'bootstrap'){
          diffResult = await bootstrapCurveDiffCooperative(pairsA, pairsB, graphType, { seed: state.resamplingSeed, iterations: state.resamplingIterations }, checkpoint);
        }else if(state.diffMethod === 'permutation'){
          diffResult = await permutationCurveDiffCooperative(pairsA, pairsB, graphType, { seed: state.resamplingSeed, iterations: state.resamplingIterations }, checkpoint);
        }
        if(diffResult == null && state.diffMethod !== 'delong'){
          return false;
        }
        state.compareResult.textContent = formatRocCompareResultText(graphType, state.diffMethod, diffResult);
      }
      state.compareResultModel = normalizeRocCompareResultModel({
        graphType,
        diffMethod: state.diffMethod,
        resamplingSeed: state.resamplingSeed,
        resamplingIterations: state.resamplingIterations,
        compareSelection,
        signature,
        displayText: state.compareResult.textContent,
        result: diffResult
      });
      commitRocCompareStateToSession(null, { compareSelection, diffMethod: state.diffMethod, compareResult: state.compareResultModel });
      if(global.DEBUG_ROC){
        console.debug('Debug: ROC pair diff', {pair: [series[i].name, series[j].name], diffResult});
      }
    }else if(state.compareResult){
      state.compareResult.textContent = '';
      state.compareResultModel = null;
      commitRocCompareStateToSession(null, { compareResult: null });
    }
    if(!(await checkpoint())){
      return false;
    }
    appendRocReportPanel(stats, graphType, diffResult);
    state.statsPanelSignature = state.analysisSignature;
    captureRocStatsPanelModel();
    captureRocSessionStateFromActive(getRocProjectionSession({ reason: 'roc-projection-mutation' }), {
      reason: 'roc-draw-complete',
      captureStatsPanel: false
    });
    registerRocGridControlTarget(svg, { fallbackThickness: axisStrokeWidthBase });
    ensureGraphViewport(svg, {
      padding: Math.max(fontSize, 16),
      debugLabel: 'roc-graph',
      baseViewport: { width, height }
    });
    state.layout?.syncPanels?.({ skipSchedule: true });
    syncRocAutoDrawNoticeWidth('draw');
    return true;
  }

  // PART: PERSISTENCE
  function getPayload(){
    const payloadSession = bindRocSessionForTab(getRocWorkspaceActiveTabId() || getRocProjectionTabId() || null, {
      reason: 'roc-get-payload-bind-active-owner'
    }, { apply: true, syncUi: true }) || getActiveRocSessionForState();
    refreshRocActiveDomRefsForSession(payloadSession, { reason: 'roc-get-payload' });
    syncRocRuntimeControlsFromDom(payloadSession);
    const activeHot = ensureHotForActiveTab();
    const activeManager = ensureRocDataViewsForHot(activeHot, {
      wrapper: refs.hotWrapper || getRocNodeById('rocHotWrapper'),
      container: activeHot?.__rocHostContainer || refs.hotContainer || getRocNodeById('rocHot')
    });
    syncRocActiveDataViewFromHot(activeHot, 'payload');
    const dataViewsPayload = activeManager?.serialize?.({ includeData: true }) || null;
    const includeDataViews = !!(dataViewsPayload && Array.isArray(dataViewsPayload.views) && dataViewsPayload.views.length > 1);
    const notesSnapshot = captureRocNotesMirror();
    const notesText = notesSnapshot.text || '';
    const notesOpen = !!notesSnapshot.open;
    const controls = normalizeRocRuntimeControls(state.controls || {});
    const payload = {
      type: 'roc',
      data: Shared.hot.trimTrailingEmptyCols(activeHot?.getData?.() || []),
      exclusions: activeHot?.exportExclusions?.() || Shared.hot.exportExclusions(activeHot),
      filters: activeHot?.exportFilters?.() || Shared.hot.exportFilters(activeHot),
      dataViews: includeDataViews ? dataViewsPayload : undefined,
      activeDataViewId: includeDataViews ? (dataViewsPayload?.activeViewId || null) : undefined,
      config: {
        colorScheme: Shared.colorSchemes?.getSelectedSchemeId?.('roc') || 'scientific',
        borderWidth: state.borderWidth,
        showGrid: !!controls.showGrid,
        gridStyle: getGridStyle(getAxisStrokeWidthBase()),
        showFrame: !!controls.showFrame,
        showLegend: controls.showLegend !== false,
        fontSize: controls.fontSize,
        fontStyles: exportFontStyles('roc') || undefined,
        labelColors: state.labelColors,
        labelStrokeWidth: state.labelStrokeWidth,
        labelOpacity: state.labelOpacity,
        labelLinePattern: state.labelLinePattern,
        title: state.titleText,
        graphType: controls.graphType,
        positiveClass: state.positiveClass,
        negativeClass: state.negativeClass,
        scoreDirection: normalizeRocScoreDirection(state.scoreDirection),
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
          majorTickLengthX: axisSettings.x?.majorTickLength ?? null,
          majorTickLengthY: axisSettings.y?.majorTickLength ?? null,
      minorTicksX: axisSettings.x?.minorTicks ?? false,
      minorTicksY: axisSettings.y?.minorTicks ?? false,
      minorTickSubdivisionsX: clampMinorTickSubdivisions(axisSettings.x?.minorTickSubdivisions),
      minorTickSubdivisionsY: clampMinorTickSubdivisions(axisSettings.y?.minorTickSubdivisions)
    };
    const statsPanelModel = createDefaultRocStatsPanelModel(
      payloadSession?.results?.statsPanelModel
      || payloadSession?.state?.statsPanelModel
      || state.statsPanelModel
      || {}
    );
    payload.stats = {
      diffMethod: state.diffMethod,
      singleRocPMethod: state.singleRocPMethod,
      resamplingSeed: state.resamplingSeed,
      resamplingIterations: state.resamplingIterations,
      compareSelection: state.compareSelection || state.compareSel?.value || null,
      compareResult: normalizeRocCompareResultModel(state.compareResultModel || null),
      analysisSignature: state.analysisSignature || '',
      statsPanelSignature: state.statsPanelSignature || '',
      advisor: createDefaultRocAdvisorState(getRocAdvisorState(getActiveRocSessionForState())),
      resultsModel: statsPanelModel.resultsModel || null,
      reportModel: statsPanelModel.reportModel || null
    };
    payload.config.labelPositions = state.labelPositions || null;
    captureRocSessionStateFromActive(getRocProjectionSession({ reason: 'roc-projection-mutation' }), {
      reason: 'roc-get-payload',
      captureStatsPanel: false
    });
    console.debug('Debug: roc.getPayload captured state', {
      rows: payload.data?.length || 0,
      cols: payload.data?.[0]?.length || 0,
      graphType: payload.config?.graphType
    });
    return payload;
  }
  roc.getPayload = getPayload;
  {
    const tableUiHooks = Shared.hot?.makeTableUiStateHooks?.(
      () => (typeof state.ensureHotForActiveTab === 'function' ? state.ensureHotForActiveTab() : null) || state.hot,
      'roc'
    );
    roc.captureUiState = tableUiHooks ? tableUiHooks.capture : () => null;
    roc.applyUiState = tableUiHooks ? tableUiHooks.apply : () => false;
  }
  function syncRocRuntimeControlsFromState(controlSnapshot = {}){
    state.controls = normalizeRocRuntimeControls(controlSnapshot || state.controls || {});
    const controls = state.controls;
    const hasControl = key => Object.prototype.hasOwnProperty.call(controls, key);
    if(refs.graphType && hasControl('graphType')){
      refs.graphType.value = String(controls.graphType).toLowerCase() === 'pr' ? 'pr' : 'roc';
    }
    if(refs.showGrid && hasControl('showGrid')){
      refs.showGrid.checked = !!controls.showGrid;
    }
    if(refs.showFrame && hasControl('showFrame')){
      refs.showFrame.checked = !!controls.showFrame;
    }
    if(refs.showLegend && hasControl('showLegend')){
      refs.showLegend.checked = controls.showLegend !== false;
      ensureRocLegendControlPlacement();
    }
    if(refs.fontSize && hasControl('fontSize') && controls.fontSize != null){
      refs.fontSize.value = String(controls.fontSize);
      updateFontSizeLabel();
    }
    projectRocClassificationControlsFromState();
    renderStatsControls();
    if(state.compareSel && state.compareSelection){
      const wanted = String(state.compareSelection);
      if(Array.from(state.compareSel.options || []).some(option => option.value === wanted)){
        state.compareSel.value = wanted;
      }
    }
  }

  roc.captureRuntimeState = function captureRocRuntimeState(meta = {}){
    const requestedSession = getRocSession(meta?.tab || meta?.tabId || null, meta, { create: false, fallbackActive: true })
      || getActiveRocSessionForState();
    const activeSession = getActiveRocSessionForState();
    const session = requestedSession === activeSession
      ? captureRocSessionStateFromActive(requestedSession, {
          ...(meta || {}),
          reason: meta?.reason || 'roc-runtime-capture',
          captureStatsPanel: false
        })
      : ensureRocSessionOwnershipShape(requestedSession);
    const sessionState = createDefaultRocDurableState(session?.state || state);
    const sessionResults = createDefaultRocResultsState(session?.results || {
      statsPanelModel: sessionState.statsPanelModel,
      compareSelection: sessionState.compareSelection,
      diffMethod: sessionState.diffMethod,
      compareResult: sessionState.compareResult
    });
    const sessionNotes = createDefaultRocNotesState(session?.notes || notesState);
    const snapshot = {
      state: {
        borderWidth: sessionState.borderWidth,
        labelColors: cloneSimple(sessionState.labelColors) || {},
        labelStrokeWidth: cloneSimple(sessionState.labelStrokeWidth) || {},
        labelOpacity: cloneSimple(sessionState.labelOpacity) || {},
        labelLinePattern: cloneSimple(sessionState.labelLinePattern) || {},
        diffMethod: sessionResults.diffMethod || sessionState.diffMethod,
        resamplingSeed: sessionState.resamplingSeed,
        resamplingIterations: sessionState.resamplingIterations,
        compareSelection: sessionResults.compareSelection || sessionState.compareSelection || null,
        compareResult: normalizeRocCompareResultModel(sessionResults.compareResult || sessionState.compareResult || null),
        minSvgWidth: sessionState.minSvgWidth,
        fileName: sessionState.fileName,
        titleText: sessionState.titleText,
        axisSettings: cloneSimple(sessionState.axisSettings) || null,
        gridStyle: cloneSimple(sessionState.gridStyle) || null,
        autoDrawEnabled: !!sessionState.autoDrawEnabled,
        autoDrawReason: sessionState.autoDrawReason || null,
        autoDrawLockedByThreshold: !!sessionState.autoDrawLockedByThreshold,
        drawPending: false,
        lastDataShape: cloneSimple(sessionState.lastDataShape) || { rows: 0, cols: 0 },
        lastAutoDrawEvaluation: cloneSimple(sessionState.lastAutoDrawEvaluation) || null,
        labelPositions: cloneSimple(sessionState.labelPositions) || {},
        analysisSignature: sessionState.analysisSignature || '',
        statsPanelSignature: sessionState.statsPanelSignature || '',
        positiveClass: sessionState.positiveClass,
        negativeClass: sessionState.negativeClass,
        scoreDirection: normalizeRocScoreDirection(sessionState.scoreDirection),
        statsPanel: createDefaultRocStatsPanelModel(sessionResults.statsPanelModel || sessionState.statsPanelModel),
        statsPanelModel: createDefaultRocStatsPanelModel(sessionResults.statsPanelModel || sessionState.statsPanelModel),
        controls: cloneSimple(sessionState.controls) || createDefaultRocRuntimeControls()
      },
      advisor: createDefaultRocAdvisorState(getRocAdvisorState(session)),
      notes: sessionNotes,
      reason: meta?.reason || 'roc-runtime-capture'
    };
    console.debug('Debug: roc runtime snapshot captured', {
      tabId: meta?.tabId || getRocProjectionTabId() || null,
      graphType: refs.graphType?.value || null,
      notesOpen: sessionNotes.open,
      reason: snapshot.reason
    });
    rememberRocOwnedRuntimeRecord(meta?.tab || meta?.tabId || null, snapshot, {
      ...(meta || {}),
      reason: snapshot.reason || meta?.reason || 'roc-runtime-capture'
    });
    return Shared.componentLifecycle?.rememberComponentRuntimeSnapshot?.(roc, snapshot, {
      ...(meta || {}),
      reason: snapshot.reason || meta?.reason || 'roc-runtime-capture'
    }) || snapshot;
  };

  roc.applyRuntimeState = function applyRocRuntimeState(snapshot, meta = {}){
    snapshot = resolveRocOwnedRuntimeSnapshot(snapshot, meta)
      || Shared.componentLifecycle?.resolveComponentRuntimeSnapshot?.(roc, snapshot, meta)
      || snapshot;
    if(!snapshot || typeof snapshot !== 'object'){
      console.debug('Debug: roc runtime snapshot apply skipped', { tabId: meta?.tabId || null, reason: 'missing-snapshot' });
      return false;
    }
    const runtimeSession = setRocSessionStateFromRuntimeRecord(snapshot, {
      ...(meta || {}),
      reason: meta?.reason || 'roc-runtime-apply-session'
    });
    if(!runtimeSession){
      console.debug('Debug: roc runtime snapshot apply skipped', {
        tabId: meta?.tabId || getRocProjectionTabId() || null,
        reason: 'missing-session'
      });
      return false;
    }
    const isActiveOwner = isRocSessionActiveOrActivating(runtimeSession);
    if(isActiveOwner){
      applyRocSessionStateToActive(runtimeSession, { syncUi: true });
      syncRocSessionManagersFromActive(runtimeSession);
    }
    rememberRocOwnedRuntimeRecord(meta?.tab || meta?.tabId || runtimeSession.tabId || null, snapshot, {
      ...(meta || {}),
      reason: meta?.reason || 'roc-runtime-apply'
    });
    Shared.componentLifecycle?.rememberComponentRuntimeSnapshot?.(roc, snapshot, {
      ...(meta || {}),
      reason: meta?.reason || 'roc-runtime-apply'
    });
    console.debug(isActiveOwner
      ? 'Debug: roc runtime snapshot applied through session pipeline'
      : 'Debug: roc inactive runtime snapshot stored without active projection', {
      tabId: runtimeSession.tabId || meta?.tabId || getRocProjectionTabId() || null,
      activeTabId: getRocWorkspaceActiveTabId() || getRocProjectionTabId() || null,
      compareSelection: runtimeSession.state?.compareSelection || runtimeSession.results?.compareSelection || null,
      reason: meta?.reason || 'roc-runtime-apply'
    });
    return true;
  };

  roc.deactivateTab = Shared.componentLifecycle?.createDeactivateHandler?.({
    component: roc,
    componentKey: 'roc',
    cancel: (tab, meta = {}) => {
      captureRocSessionForDeactivation(tab, meta);
      state.drawPending = false;
    }
  }) || function deactivateRocTab(tab, meta = {}){
    captureRocSessionForDeactivation(tab, meta);
    state.drawPending = false;
    roc.__runtimeGeneration = (Number(roc.__runtimeGeneration) || 0) + 1;
    console.debug('Debug: roc tab deactivated', {
      tabId: (tab && typeof tab === 'object' ? tab.id : tab) || meta?.tabId || null,
      generation: roc.__runtimeGeneration,
      reason: meta?.reason || 'deactivate-tab'
    });
    return true;
  };
  roc.captureEmptyPayloadTemplate = function captureRocEmptyPayloadTemplate(){
    const snapshot = roc.createEmptyPayload();
    emptyPayloadTemplate = cloneSimple(snapshot) || snapshot;
    const session = getActiveRocSessionForState();
    if(session?.cache){
      session.cache.emptyPayloadTemplate = cloneSimple(emptyPayloadTemplate) || emptyPayloadTemplate;
      session.updatedAt = Date.now();
    }
    console.debug('Debug: roc empty payload template captured', { hasTemplate: !!snapshot });
    return snapshot;
  };
  roc.restoreEmptyPayloadTemplate = function restoreRocEmptyPayloadTemplate(template, options = {}){
    if(!template || typeof template !== 'object'){
      console.debug('Debug: roc empty payload template restore skipped', { reason: 'invalid-template', options });
      return false;
    }
    emptyPayloadTemplate = cloneSimple(template);
    const session = getActiveRocSessionForState();
    if(session){
      session.cache.emptyPayloadTemplate = cloneSimple(emptyPayloadTemplate) || null;
      session.updatedAt = Date.now();
    }
    console.debug('Debug: roc empty payload template restored', { hasTemplate: !!emptyPayloadTemplate, reason: options.reason || 'unspecified' });
    return !!emptyPayloadTemplate;
  };
  roc.createEmptyPayload = function createEmptyRocPayload(){
    console.debug('Debug: roc.createEmptyPayload pure factory invoked', {
      ready: !!roc.ready,
      boundTabId: getRocProjectionTabId() || null
    });
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
    const scheduleTargetTab = meta?.tab || meta?.tabId || getRocProjectionTabId() || null;
    const hasExplicitScheduleTarget = !!(meta?.tab || meta?.tabId);
    const scheduleTargetSession = scheduleTargetTab
      ? getRocSession(scheduleTargetTab, { ...(meta || {}), reason: 'roc-payload-scheduler-owner' }, { create: false, fallbackActive: false })
      : getActiveRocSessionForState();
    const canMuteActiveScheduler = hasExplicitScheduleTarget
      ? !!(scheduleTargetSession && isRocSessionActiveOrActivating(scheduleTargetSession))
      : (!scheduleTargetSession || isRocSessionActiveOrActivating(scheduleTargetSession));
    let scheduleBackup = null;
    let sessionScheduleBackup = null;
    let mutedScheduleDraw = null;
    if(skipDraw && canMuteActiveScheduler && typeof state.scheduleDraw === 'function'){
      mutedScheduleDraw = () => {};
      scheduleBackup = state.scheduleDraw;
      state.scheduleDraw = mutedScheduleDraw;
      if(scheduleTargetSession?.timers && typeof scheduleTargetSession.timers.scheduleDraw === 'function'){
        sessionScheduleBackup = scheduleTargetSession.timers.scheduleDraw;
        scheduleTargetSession.timers.scheduleDraw = mutedScheduleDraw;
      }
    }
    ensureHotForActiveTab();
    const dataMatrix = Array.isArray(payload.data) ? payload.data : [];
    const serializedViews = (payload.dataViews && typeof payload.dataViews === 'object') ? payload.dataViews : null;
    const requestedActiveViewId = payload.activeDataViewId || serializedViews?.activeViewId || null;
    const dataManager = state.hot
      ? ensureRocDataViewsForHot(state.hot, {
          wrapper: refs.hotWrapper || getRocNodeById('rocHotWrapper'),
          container: state.hot.__rocHostContainer || refs.hotContainer || getRocNodeById('rocHot')
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
      if(rocAutoDrawManager && isRocSessionActiveOrActivating(getActiveRocSessionForState())){
      rocAutoDrawManager.evaluateThresholds({
        shape: {
          rows: Array.isArray(dataToLoad) ? dataToLoad.length : 0,
          cols: Array.isArray(dataToLoad?.[0]) ? dataToLoad[0].length : 0
        },
        reason: `roc-payload-${source}`
      });
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
    if(canUseRocNotesControl(notesState.control)){
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
    }else if(state.titleText == null || isDefaultRocTitle(state.titleText)){
      const inferredType = config.graphType || refs.graphType?.value || 'roc';
      state.titleText = getDefaultRocTitle(inferredType);
    }
    state.labelColors = config.labelColors || {};
    state.labelStrokeWidth = config.labelStrokeWidth || {};
    state.labelOpacity = config.labelOpacity || {};
    state.labelLinePattern = config.labelLinePattern || {};
    if(refs.graphType) refs.graphType.value = String(config.graphType || refs.graphType.value || 'roc').toLowerCase() === 'pr' ? 'pr' : 'roc';
    state.positiveClass = Object.prototype.hasOwnProperty.call(config, 'positiveClass') ? config.positiveClass : undefined;
    state.negativeClass = Object.prototype.hasOwnProperty.call(config, 'negativeClass') ? config.negativeClass : undefined;
    state.scoreDirection = normalizeRocScoreDirection(config.scoreDirection);
    const loadedHeader = dataToLoad[0] || [];
    const loadedLabelIndex = Math.max(0, loadedHeader.findIndex(cell => String(cell).trim().toLowerCase() === 'label'));
    syncRocClassificationControls(dataToLoad.slice(1).map(row => row?.[loadedLabelIndex]));
    syncRocRuntimeControlsFromDom();
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
      state.singleRocPMethod = normalizeSingleRocPMethod(statsConfig.singleRocPMethod);
      state.resamplingSeed = normalizeRocResamplingSeed(statsConfig.resamplingSeed, ROC_RESAMPLING_DEFAULT_SEED);
      state.resamplingIterations = normalizeRocResamplingIterations(statsConfig.resamplingIterations, ROC_RESAMPLING_DEFAULT_ITERATIONS);
      state.compareSelection = typeof statsConfig.compareSelection === 'string'
        ? statsConfig.compareSelection
        : null;
      state.compareResultModel = normalizeRocCompareResultModel(statsConfig.compareResult || null);
      state.analysisSignature = statsConfig.analysisSignature == null ? '' : String(statsConfig.analysisSignature);
      state.statsPanelSignature = statsConfig.statsPanelSignature == null ? '' : String(statsConfig.statsPanelSignature);
      setRocAdvisorState(statsConfig.advisor || {}, getRocProjectionSession({ reason: 'roc-projection-mutation' }));
      state.statsPanelModel = normalizeRocStatsPanelModel(statsConfig);
    }else{
      state.diffMethod = 'delong';
      state.singleRocPMethod = 'auto';
      state.resamplingSeed = ROC_RESAMPLING_DEFAULT_SEED;
      state.resamplingIterations = ROC_RESAMPLING_DEFAULT_ITERATIONS;
      state.compareSelection = null;
      state.compareResultModel = null;
      state.analysisSignature = '';
      state.statsPanelSignature = '';
      setRocAdvisorState({}, getRocProjectionSession({ reason: 'roc-projection-mutation' }));
      state.statsPanelModel = { resultsModel: null, reportModel: null };
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
    populateRocCompareOptions(getRocSeriesNamesFromHot());
    restoreRocCompareResultControl();
    const expectedAnalysisSignature = buildRocAnalysisSignature({
      data: getRocAnalysisData(state.hot),
      graphType: refs.graphType?.value || 'roc',
      positiveClass: state.positiveClass,
      negativeClass: state.negativeClass,
      scoreDirection: state.scoreDirection,
      singleRocPMethod: state.singleRocPMethod,
      diffMethod: state.diffMethod,
      compareSelection: state.compareSelection,
      resamplingSeed: state.resamplingSeed,
      resamplingIterations: state.resamplingIterations
    });
    const statsSignatureMatches = !state.statsPanelSignature || state.statsPanelSignature === expectedAnalysisSignature;
    if(statsConfig && statsSignatureMatches && rocStatsPanelModelHasContent(state.statsPanelModel)){
      restoreRocStatsPanelModel(state.statsPanelModel);
    }else if(refs.statsResults){
      if(!statsSignatureMatches){
        state.statsPanelModel = { resultsModel: null, reportModel: null };
        state.statsPanelSignature = '';
      }
      renderRocStatsSummary([], refs.graphType?.value || 'roc');
    }
    if(!skipDraw){
      scheduleActiveRocDraw({ reason: `roc-payload-${source}` });
    }
    if(scheduleBackup && state.scheduleDraw === mutedScheduleDraw){
      state.scheduleDraw = scheduleBackup;
    }
    if(sessionScheduleBackup && scheduleTargetSession?.timers?.scheduleDraw === mutedScheduleDraw){
      scheduleTargetSession.timers.scheduleDraw = sessionScheduleBackup;
    }
    captureRocSessionStateFromActive(getRocProjectionSession({ reason: 'roc-projection-mutation' }), {
      reason: `roc-payload-${source}`,
      captureStatsPanel: false
    });
    console.debug('Debug: roc payload applied', { source, rows: dataToLoad.length, graphType: refs.graphType?.value });
    return true;
  }

  async function saveFile(){
    const operationSession = getActiveRocSessionForState();
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
      setFileHandle: handle => {
        setRocFileHandleForSession(handle, operationSession);
      },
      setFileName: name => {
        setRocFileNameForSession(name, operationSession);
      }
    });
    console.debug('Debug: saveRocFile result', result);
  }

  async function saveFileAs(){
    const operationSession = getActiveRocSessionForState();
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
      setFileHandle: handle => {
        setRocFileHandleForSession(handle, operationSession);
      },
      setFileName: name => {
        setRocFileNameForSession(name, operationSession);
      }
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
    const operationSession = getActiveRocSessionForState();
    console.debug('Debug: openRocFile invoked');
    if(!fileIO || typeof fileIO.openGraphFile !== 'function'){
      console.error('openRocFile missing fileIO.openGraphFile');
      return;
    }
    const result = await fileIO.openGraphFile({
      context: 'roc',
      setFileHandle: handle => { setRocFileHandleForSession(handle, operationSession); },
      setFileName: name => { setRocFileNameForSession(name, operationSession); },
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
        const session = getRocSessionForEvent(event, { reason: 'roc-graph-file-input' }, { create: false }) || getActiveRocSessionForState();
        setRocFileNameForSession(file.name, session);
        setRocFileHandleForSession(null, session);
        loadFromFile(file);
      }
    });
  }

  function initControls(){
    ensureRocStatsPValueFormatListener();
    if(refs.fontSize){
      refs.fontSize.addEventListener('input', event => {
        const session = getRocSessionForEvent(event, { reason: 'font-size-control' }, { create: true });
        syncRocRuntimeControlsFromEvent({ event, session, reason: 'font-size-control' });
        updateFontSizeLabel();
        scheduleRocControlDraw('font-size-control', { event, session });
      });
      updateFontSizeLabel();
    }
    refs.showGrid?.addEventListener('change', event => {
      const session = getRocSessionForEvent(event, { reason: 'grid-control' }, { create: true });
      syncRocRuntimeControlsFromEvent({ event, session, reason: 'grid-control' });
      scheduleRocControlDraw('grid-control', { event, session });
    });
    refs.showFrame?.addEventListener('change', event => {
      const session = getRocSessionForEvent(event, { reason: 'frame-control' }, { create: true });
      console.debug('Debug: roc showFrame change',{checked:refs.showFrame.checked});
      syncRocRuntimeControlsFromEvent({ event, session, reason: 'frame-control' });
      scheduleRocControlDraw('frame-control', { event, session });
    });
    if(refs.showLegend){
      refs.showLegend.addEventListener('change', event => {
        const session = getRocSessionForEvent(event, { reason: 'legend-control' }, { create: true });
        console.debug('Debug: roc showLegend change',{checked:refs.showLegend.checked});
        syncRocRuntimeControlsFromEvent({ event, session, reason: 'legend-control' });
        ensureRocLegendControlPlacement();
        scheduleRocControlDraw('legend-control', { event, session });
      });
    }
    refs.graphType?.addEventListener('change', event => {
      const session = getRocSessionForEvent(event, { reason: 'graph-type-control' }, { create: true });
      state.compareResultModel = null;
      const controls = syncRocRuntimeControlsFromEvent({ event, session, reason: 'graph-type-control', updateDefaultTitleOnGraphTypeChange: true });
      invalidateRocAnalysisResults(session);
      commitRocCompareStateToSession(session, { diffMethod: state.diffMethod, compareResult: null });
      persistRocTabState('roc-graph-type-change');
      renderStatsControls({ graphType: controls.graphType || 'roc' });
      scheduleRocControlDraw('graph-type-control', { event, session, force: true });
    });
    const handlePositiveClassSelection = event => {
      const session = getRocSessionForEvent(event, { reason: 'roc-positive-class-change' }, { create: true });
      const data = state.hot?.getIncludedDataMatrix?.() || state.hot?.getData?.() || [];
      const header = data[0] || [];
      const labelIndex = Math.max(0, header.findIndex(cell => String(cell).trim().toLowerCase() === 'label'));
      const classes = getDistinctRocClasses(data.slice(1).map(row => row?.[labelIndex]));
      const selectedClassKey = refs.positiveClass.selectedOptions?.[0]?.dataset?.rocClassKey || '';
      const next = classes.find(value => rocClassKey(value) === selectedClassKey);
      const previous = state.positiveClass;
      if(next === undefined || next === previous){ return; }
      applyRocClassificationSetting('positiveClass', next, session, 'roc-positive-class-change');
      recordRocChange('roc:positive-class', previous, next, value => {
        applyRocClassificationSetting('positiveClass', value, getActiveRocSessionForState(), 'roc-positive-class-undo');
      });
    };
    refs.positiveClass?.addEventListener('input', handlePositiveClassSelection);
    refs.positiveClass?.addEventListener('change', handlePositiveClassSelection);
    const handleScoreDirectionSelection = event => {
      const session = getRocSessionForEvent(event, { reason: 'roc-score-direction-change' }, { create: true });
      const previous = normalizeRocScoreDirection(state.scoreDirection);
      const next = normalizeRocScoreDirection(refs.scoreDirection.value);
      if(next === previous){ return; }
      applyRocClassificationSetting('scoreDirection', next, session, 'roc-score-direction-change');
      recordRocChange('roc:score-direction', previous, next, value => {
        applyRocClassificationSetting('scoreDirection', value, getActiveRocSessionForState(), 'roc-score-direction-undo');
      });
    };
    refs.scoreDirection?.addEventListener('input', handleScoreDirectionSelection);
    refs.scoreDirection?.addEventListener('change', handleScoreDirectionSelection);
    syncRocClassificationControls();
    renderStatsControls();
  }

  function initNotes(){
    const stack = queryRocRoot('#rocGraphPanel .roc-plot-stack')
      || queryRocRoot('#rocGraphPanel .diagram-area');
    if(!stack){
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        console.debug('Debug: roc notes mount skipped (missing stack)');
      }
      return;
    }
    notesState.control = Shared.componentLifecycle?.ensureOwnedNotesControl?.({
      componentKey: 'roc',
      ownerTabId: getRocProjectionTabId() || null,
      container: stack,
      notesState,
      control: notesState.control,
      id: 'roc-notes',
      scopeId: 'roc',
      fontKey: 'notes',
      canUseControl: canUseRocNotesControl,
      unavailableMessage: 'roc notes helper unavailable',
      applyToControl: control => {
        control.setValue(notesState.text || '');
        control.setOpen(!!notesState.open);
      },
      onChange: value => {
        notesState.text = value == null ? '' : String(value);
        const session = getActiveRocSessionForState();
        if(session){
          session.notes = createDefaultRocNotesState(notesState);
          session.updatedAt = Date.now();
        }
      },
      onToggle: open => {
        notesState.open = !!open;
        const session = getActiveRocSessionForState();
        if(session){
          session.notes = createDefaultRocNotesState(notesState);
          session.updatedAt = Date.now();
        }
      }
    }) || notesState.control || null;
  }

  function init(options = {}){
    const targetTabId = options?.tabId || getRocProjectionTabId() || null;
    const targetRoot = options?.root || resolveRocRoot(targetTabId || null) || state.root || null;
    if(roc.ready && (!targetTabId || roc.__boundTabId === targetTabId) && (!targetRoot || state.root === targetRoot)){
      console.debug('Debug: roc init skipped', { tabId: getRocProjectionTabId() || null });
      return;
    }
    if(roc.ready){
      console.debug('Debug: roc init rebinding', { previousTabId: getRocProjectionTabId() || null, targetTabId, reason: options?.reason || 'init' });
      roc.ready = false;
    }
    roc.__boundTabId = targetTabId || null;
    state.root = targetRoot || resolveRocRoot(targetTabId || null);
    bindRocSessionForTab(targetTabId || null, {
      root: state.root || null,
      reason: options?.reason || 'roc-init-bind'
    }, { apply: true, syncUi: false });
    if(!ensureElements()){
      console.warn('ROC component init skipped: required elements missing');
      return;
    }
    const scheduleRocDrawBase = Shared.componentLifecycle?.createTabScopedFrameDebouncer
      ? Shared.componentLifecycle.createTabScopedFrameDebouncer(roc, 'roc', runRocDrawCycle, { reason: 'roc-draw-frame' })
      : runRocDrawCycle;
    const scheduleRocDrawInstrumented = (opts) => {
      const nextOpts = sanitizeRocDrawOptions(opts || {});
      const overlayReason = nextOpts.reason || (nextOpts.force ? 'manual-render' : 'schedule');
      const ownerSession = getRocSessionForDrawMeta(nextOpts, { reason: overlayReason, create: false });
      if(ownerSession?.timers){
        ownerSession.timers.pendingDrawOptions = sanitizeRocDrawOptions(nextOpts);
        ownerSession.updatedAt = Date.now();
      }
      const suppressOverlay = nextOpts.viewOnly === true || nextOpts.silentOverlay === true;
      if(nextOpts.force && !suppressOverlay){
        markRocOverlayPending(overlayReason);
        forceRocOverlay(overlayReason, { message: 'Rendering ROC/PR plot...' });
      }else if(!suppressOverlay){
        queueRocOverlay(overlayReason);
      }
      const runSchedule = () => scheduleRocDrawBase(nextOpts);
      if(Shared.componentLifecycle?.runDrawWithOverlayPaintGate?.({
        component: roc,
        componentKey: 'roc',
        options: nextOpts,
        tabId: nextOpts.tabId || getRocProjectionTabId() || null,
        reason: overlayReason,
        overlayController: rocOverlayController,
        delayForOverlay: !suppressOverlay,
        debugLog: console.debug,
        run: runSchedule
      })){
        return;
      }
      runSchedule();
    };
    scheduleDrawRocRaw = Shared.workspaceTabs?.createTabScopedScheduler
      ? Shared.workspaceTabs.createTabScopedScheduler({
          componentKey: 'roc',
          debugLabel: 'roc',
          getTabId: () => getRocProjectionTabId() || null,
          scheduleRaw: scheduleRocDrawInstrumented
        })
      : scheduleRocDrawInstrumented;
    const managerSession = getActiveRocSessionForState();
    rocAutoDrawManager = null;
    if(Shared.hot?.createAutoDrawManager){
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
      if(managerSession){
        managerSession.managers.autoDraw = rocAutoDrawManager;
        managerSession.updatedAt = Date.now();
      }
    }
    if(rocAutoDrawManager){
      rocAutoDrawManager.setScheduleRaw(scheduleDrawRocRaw);
      rocAutoDrawManager.setElements({
        renderRow: refs.renderRow,
        renderButton: refs.renderButton,
        notice: refs.autoDrawNotice
      });
      state.scheduleDraw = (opts) => rocAutoDrawManager.schedule(opts);
      const activeSession = getActiveRocSessionForState();
      if(activeSession){
        activeSession.managers.autoDraw = rocAutoDrawManager;
        activeSession.timers.scheduleDraw = state.scheduleDraw;
        activeSession.updatedAt = Date.now();
      }
      rocAutoDrawManager.updateUi();
      rocAutoDrawManager.evaluateThresholds();
      syncRocAutoDrawNoticeWidth('auto-draw-init');
    }else{
      state.scheduleDraw = scheduleDrawRocRaw;
      const activeSession = getActiveRocSessionForState();
      if(activeSession){
        activeSession.timers.scheduleDraw = state.scheduleDraw;
        activeSession.updatedAt = Date.now();
      }
    }
    console.debug('Debug: roc scheduleDraw configured via tab-scoped lifecycle frame', { guarded: !!rocAutoDrawManager }); // Debug: scheduler setup
    state.layout = Shared.componentLayout?.createStandardPanels({
      componentName: 'roc',
      tabId: targetTabId || undefined,
      root: state.root || undefined,
      reason: options?.reason || 'roc-init',
      selectors: {
        tablePanel: '#rocTablePanel',
        graphPanel: '#rocGraphPanel',
        panelResizer: '#rocPanelResizer',
        hotWrapper: '#rocHotWrapper',
        hotContainer: '#rocHot',
        svgBox: () => queryRocRoot('#rocGraphPanel .svgbox'),
        resizeTarget: () => queryRocRoot('#rocGraphPanel .svgbox')
      },
        scheduleDraw: options => scheduleActiveRocDraw(options && typeof options === 'object' ? options : {}),
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
        onResize: phase => {
          const resizePhase = typeof phase === 'string' ? phase : '';
          console.debug('Debug: roc layout onResize schedule trigger', { phase: resizePhase || null });
          ensureRocLegendControlPlacement();
          scheduleRocNoticeWidth('resize');
          scheduleRocViewRefresh('resize', {
            force: true,
            silentOverlay: true,
            resizePhase: resizePhase || null
          });
        }
      }
    });
    if(state.layout?.elements?.svgBox){
      refs.svgBox = state.layout.elements.svgBox;
      ensureRocLegendControlPlacement();
    }
    syncRocSessionManagersFromActive();
    syncRocSessionRefsFromActive();
    const scheduleLegendPlacement = typeof Shared.componentLifecycle?.createTabScopedFrameDebouncer === 'function'
      ? Shared.componentLifecycle.createTabScopedFrameDebouncer(roc, 'roc', () => ensureRocLegendControlPlacement(), { reason: 'roc-legend-placement' })
      : null;
    if(scheduleLegendPlacement){
      scheduleLegendPlacement({ tabId: getRocProjectionTabId() || null, reason: 'roc-legend-placement' });
    }else{
      ensureRocLegendControlPlacement();
    }
    state.layout?.setScheduleDraw?.(options => scheduleActiveRocDraw(options && typeof options === 'object' ? options : {}));
    ensureRocFontEventListener();
    state.layout?.syncPanels?.();
    scheduleRocNoticeWidth('init');
    ensureHotForActiveTab();
    initControls();
    initNotes();
    initExampleAndImport();
    initExportsAndFiles();
    if(options.skipInitialDraw !== true && options.suppressDraw !== true && options.suppressAutoDraw !== true){
      scheduleActiveRocDraw({ reason: 'roc-init-complete' });
    }
    ensureEmptyPayloadTemplate();
    captureRocSessionStateFromActive(getRocProjectionSession({ reason: 'roc-projection-mutation' }), { reason: 'roc-init-complete', captureStatsPanel: false });
    roc.__domSentinel = getRocNodeById('rocHot');
    roc.ready = true;
    console.debug('Debug: ROC component initialized');
    global.scheduleDrawRoc = () => scheduleActiveRocDraw({ reason: 'roc-public-schedule' });
  }

  roc.init = init;
  roc.ensure = function ensure(options = {}){
    if(typeof Shared.workspaceTabs?.ensureActiveDomBindings === 'function'){
      const rebound = Shared.workspaceTabs.ensureActiveDomBindings({
        componentKey: 'roc',
        tabLike: options.tab || options.tabId || null,
        meta: options,
        sentinelSelector: '#rocHot',
        getCurrentRoot: () => state.root || null,
        getCurrentSentinel: () => roc.__domSentinel || null,
        rebind: (info) => {
          const nextTabId = info?.tab?.id || info?.tabId || options.tabId || (options.tab && typeof options.tab === 'object' ? options.tab.id : options.tab) || null;
          state.root = info?.root || resolveRocRoot(info?.tab || nextTabId || null) || state.root || null;
          bindRocSessionForTab(info?.tab || nextTabId || null, { ...(options || {}), root: state.root || null, reason: options.reason || 'workspace-dom-rebind' }, { apply: true, syncUi: false });
          if(options?.liveDomFastPath === true || options?.liveDomReuse === true || options?.passiveControls === true){
            roc.__boundTabId = nextTabId || getRocProjectionTabId() || null;
            syncRocSessionRefsFromActive();
            syncRocSessionManagersFromActive();
            roc.__domSentinel = info?.mountedSentinel || getRocNodeById('rocHot');
            roc.ready = true;
            console.debug('Debug: roc passive DOM rebind', { tabId: getRocProjectionTabId() || null });
            return;
          }
          roc.ready = false;
          init({ root: state.root || undefined, tabId: nextTabId || null, reason: 'workspace-dom-rebind' });
        }
      });
      if(rebound?.rebound){
        return;
      }
    }
    if(!roc.ready){
      init({ ...options, tabId: options.tabId || options.tab?.id || getRocProjectionTabId() || undefined, reason: options.reason || 'ensure' });
    }
  };
  roc.activateTab = Shared.componentLifecycle?.bindTabActivation?.({
    component: roc,
    componentKey: 'roc',
    resolveRoot: tabLike => resolveRocRoot(tabLike || null),
    setRoot: root => { state.root = root; },
    ensureBindings: (tabLike, meta) => {
      if(typeof Shared.workspaceTabs?.ensureActiveDomBindings !== 'function'){
        return false;
      }
      const targetTabId = (tabLike && typeof tabLike === 'object' ? tabLike.id : tabLike) || meta?.tabId || null;
      const rebound = Shared.workspaceTabs.ensureActiveDomBindings({
        componentKey: 'roc',
        tabLike: tabLike || null,
        meta,
        sentinelSelector: '#rocHot',
        getCurrentRoot: () => state.root || null,
        getCurrentSentinel: () => roc.__domSentinel || null,
        rebind: info => {
          const nextTabId = info?.tab?.id || info?.tabId || targetTabId || null;
          state.root = info?.root || resolveRocRoot(tabLike || nextTabId || null) || state.root || null;
          bindRocSessionForTab(info?.tab || nextTabId || null, { ...(meta || {}), root: state.root || null, reason: meta?.reason || 'activate-tab-rebind' }, { apply: true, syncUi: false });
          if(meta?.liveDomFastPath === true || meta?.liveDomReuse === true || meta?.passiveControls === true){
            roc.__boundTabId = nextTabId || getRocProjectionTabId() || null;
            syncRocSessionRefsFromActive();
            syncRocSessionManagersFromActive();
            roc.__domSentinel = info?.mountedSentinel || getRocNodeById('rocHot');
            roc.ready = true;
            console.debug('Debug: roc passive DOM rebind', { tabId: getRocProjectionTabId() || null });
            return;
          }
          roc.ready = false;
          init({ root: state.root || undefined, tabId: nextTabId || null, reason: 'activate-tab-rebind' });
        }
      });
      return !!rebound?.rebound;
    },
    init: options => init(options),
    afterReady: (tabLike, meta = {}) => {
      bindRocSessionForTab(tabLike || meta?.tabId || null, { ...(meta || {}), reason: meta?.reason || 'roc-activate-bind-session' }, { apply: true, syncUi: true });
      scheduleRocStatsReportOrderPin();
      ensureHotForActiveTab();
      syncRocClassificationControls();
      syncRocSessionManagersFromActive();
    },
    getSentinel: () => getRocNodeById('rocHot')
  }) || function activateTab(tab, meta = {}){
    const targetTabId = (tab && typeof tab === 'object' ? tab.id : tab) || meta?.tabId || null;
    roc.__boundTabId = targetTabId || getRocProjectionTabId() || null;
    state.root = resolveRocRoot(tab || targetTabId || null);
    bindRocSessionForTab(targetTabId || null, { root: state.root || null, reason: meta?.reason || 'activate-tab' }, { apply: true, syncUi: true });
    pinRocStatsReportAfterMetrics();
    if(!roc.ready){ init({ root: state.root || undefined, tabId: targetTabId || undefined, reason: meta?.reason || 'activate-tab' }); return; }
    ensureHotForActiveTab();
    roc.__domSentinel = getRocNodeById('rocHot');
  };
  roc.draw = function drawRoc(meta = {}){
    const nextReason = meta?.reason || 'roc-draw';
    if(Shared.componentLifecycle?.shouldSuppressDraw?.('roc', { ...(meta || {}), tabId: meta?.tabId || getRocProjectionTabId() || null, reason: nextReason })){
      console.debug('Debug: roc draw suppressed by lifecycle', { reason: nextReason, tabId: meta?.tabId || getRocProjectionTabId() || null });
      Shared.componentLifecycle?.emitLifecycleEvent?.({ componentKey: 'roc', tabId: meta?.tabId || getRocProjectionTabId() || null, action: 'draw-suppressed', reason: nextReason, details: { source: 'roc.draw' } });
      return;
    }
    Shared.componentLifecycle?.emitLifecycleEvent?.({ componentKey: 'roc', tabId: meta?.tabId || getRocProjectionTabId() || null, action: 'draw-executed', reason: nextReason, details: { source: 'roc.draw' } });
    console.debug('Debug: roc draw requested', {
      tabId: meta?.tabId || getRocProjectionTabId() || null,
      sessionGeneration: meta?.sessionGeneration || null,
      reason: meta?.reason || 'roc-draw'
    });
    const drawSession = getRocSessionForDrawMeta(meta || {}, { reason: nextReason });
    if(drawSession && !isRocSessionActiveOrActivating(drawSession)){
      drawSession.state.drawPending = true;
      drawSession.updatedAt = Date.now();
      return;
    }
    void runRocDrawCycle({ ...(meta || {}), tabId: drawSession?.tabId || meta?.tabId || undefined, reason: nextReason });
  };
  roc.cancelCurrentDraw = function cancelCurrentDraw(meta = {}){
    const tabId = meta?.tabId || getRocProjectionTabId() || null;
    try{ roc.__asyncScope?.cancelAllForTab?.(tabId, meta?.reason || 'roc-draw-cancel'); }catch(_err){}
    resolveRocOverlay({ reason: meta?.reason || 'cancelled', tabId });
    Shared.componentLifecycle?.emitLifecycleEvent?.({
      componentKey: 'roc',
      tabId,
      action: 'draw-cancelled',
      reason: meta?.reason || 'roc-draw-cancel'
    });
    return true;
  };
  roc.scheduleDraw = () => scheduleActiveRocDraw({ reason: 'roc-public-schedule' });
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

  function getRocRenderCacheOwner(meta = {}, reason = 'roc-render-cache'){
    const source = meta && typeof meta === 'object' ? meta : {};
    const session = ensureRocSessionOwnershipShape(source.session)
      || getRocSession(source.tab || source.tabId || source.workspaceTabId || null, {
        ...source,
        reason
      }, { create: true })
      || getActiveRocSessionForState();
    if(session && !isRocSessionActiveOrActivating(session)){
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        console.debug('Debug: roc render cache skipped for inactive owner', {
          reason,
          ownerTabId: session.tabId || null,
          activeTabId: getRocProjectionTabId() || null
        });
      }
      return null;
    }
    return session;
  }

  roc.captureRenderCache = function captureRenderCache(meta = {}){
    const owner = getRocRenderCacheOwner(meta, 'roc-render-cache-capture');
    if(!owner){ return null; }
    const plot = getRocNodeById('rocPlot');
    const stats = getRocNodeById('rocStatsResults');
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

  roc.canRestoreRenderCache = function canRestoreRenderCache(cache, meta = {}){
    return Shared.componentLifecycle?.validateRenderCache?.(cache, meta, {
      componentKey: 'roc',
      graph: { selectors: ['#rocSvg', 'svg', 'canvas'], markupPattern: /(<svg\b|id=["']rocSvg["']|<canvas\b)/i },
      requireGraph: true
    }) ?? !!cache;
  };

  roc.isIdleForSnapshot = function isIdleForSnapshot(meta = {}){
    const owner = getRocSession(meta?.session || meta?.tab || meta?.tabId || null, {
      ...(meta || {}),
      reason: meta?.reason || 'roc-idle-snapshot'
    }, { create: false }) || getActiveRocSessionForState();
    if(owner && !isRocSessionActiveOrActivating(owner)){
      return !owner.state?.drawPending;
    }
    return !state.drawPending;
  };

  roc.awaitReadyForSnapshot = function awaitReadyForSnapshot(meta = {}){
    return Shared.componentLifecycle?.awaitReadyForSnapshot?.(roc, { ...meta, componentKey: 'roc' })
      || Promise.resolve({ ok: true, skipped: true, reason: 'missing-componentLifecycle' });
  };

  roc.restoreRenderCache = function restoreRenderCache(cache, meta = {}){
    if(!cache){ return false; }
    const owner = getRocRenderCacheOwner(meta, 'roc-render-cache-restore');
    if(!owner){ return false; }
    const graphCachePayload = cache?.[cache?.__graphitixRenderCache?.graphicKey] || cache?.plot || cache?.preview || cache?.graph || cache?.svg || cache?.stage;
    const plot = getRocNodeById('rocPlot');
    const stats = getRocNodeById('rocStatsResults');
    const restoredPlot = restoreChildren(plot, graphCachePayload);
    const restoredStats = restoreChildren(stats, cache.stats);
    if(restoredStats){
      // The replayed stats DOM carries dead Download/Copy controls (listeners cannot
      // survive serialization); re-mount them from the restored tables.
      Shared.statsTable?.rehydrateExportControls?.(stats);
      scheduleRocStatsReportOrderPin();
    }
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
    resolveClassificationSetup: (labels, source = {}) => resolveRocClassificationSetup(labels, source),
    buildCanonicalAnalysisPairs: (labels, scores, source = {}) => buildCanonicalAnalysisPairs(labels, scores, source),
    originalThreshold: (threshold, scoreDirection) => rocOriginalThreshold(threshold, scoreDirection),
    cutoffOperator: scoreDirection => rocCutoffOperator(scoreDirection),
    getAucDirectionWarning: (stats, graphType = 'roc') => getRocAucDirectionWarning(stats, graphType),
    createDurableState: source => createDefaultRocDurableState(source),
    buildCompareSignature: source => buildRocCompareResultSignature(source),
    buildAnalysisSignature: source => buildRocAnalysisSignature(source),
    computeCurveMetric: (pairs, graphType = 'roc') => computeCurveMetric(Array.isArray(pairs) ? pairs : [], graphType),
    computeSingleAucInference: (pairs, alpha = 0.05, method = 'auto') => computeSingleAucInference(Array.isArray(pairs) ? pairs : [], alpha, method),
    computeMannWhitneyInference: (pairs, method = 'auto') => computeMannWhitneyInference(Array.isArray(pairs) ? pairs : [], method),
    buildRankedCurve: (pairs, graphType = 'roc') => buildRankedCurve(Array.isArray(pairs) ? pairs : [], graphType),
    buildThresholdMetricsTable: (pairs, alpha = 0.05) => buildRocThresholdMetricsTable(Array.isArray(pairs) ? pairs : [], alpha),
    selectYoudenThreshold: rows => selectYoudenThreshold(Array.isArray(rows) ? rows : []),
    delongCurveDiff: (pairs1, pairs2) => delongCurveDiff(Array.isArray(pairs1) ? pairs1 : [], Array.isArray(pairs2) ? pairs2 : []),
    bootstrapCurveDiff: (pairs1, pairs2, graphType = 'roc', iterations = ROC_RESAMPLING_DEFAULT_ITERATIONS, seed = ROC_RESAMPLING_DEFAULT_SEED) => bootstrapCurveDiff(
      Array.isArray(pairs1) ? pairs1 : [],
      Array.isArray(pairs2) ? pairs2 : [],
      graphType,
      { iterations, seed }
    ),
    permutationCurveDiff: (pairs1, pairs2, graphType = 'roc', iterations = ROC_RESAMPLING_DEFAULT_ITERATIONS, seed = ROC_RESAMPLING_DEFAULT_SEED) => permutationCurveDiff(
      Array.isArray(pairs1) ? pairs1 : [],
      Array.isArray(pairs2) ? pairs2 : [],
      graphType,
      { iterations, seed }
    ),
    resolveDrawableFrame: plot => resolveRocDrawableFrame(plot),
    setStatsPanelPValueScientific: (model, scientific) => setRocStatsPanelPValueScientific(model, scientific)
  });


  Shared.componentLifecycle?.installInternalStateBridge?.(roc, {
    componentKey: 'roc',
    targets: [
      { key: 'state', get: () => state, excludeKeys: ['hot', 'root', 'svg', 'svgBox', 'drawPending'] },
      { key: 'rocAdvisorState', get: () => rocAdvisorState },
      { key: 'notesState', get: () => notesState, excludeKeys: ['control'] }
    ]
  });
})(window);
