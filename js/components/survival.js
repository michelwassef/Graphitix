(function(global){
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};

  function survivalDebug(message, ...rest){
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
  const survival = Components.survival = Components.survival || {};

  function getSurvivalRuntimeOwner(){
    return Shared.componentLifecycle?.createRuntimeOwner?.(survival, { componentKey: 'survival' }) || null;
  }

  function rememberSurvivalOwnedRuntimeRecord(tabLike = null, snapshot = null, meta = {}){
    if(!snapshot || typeof snapshot !== 'object'){
      return null;
    }
    setSurvivalSessionStateFromRuntimeRecord(snapshot, {
      ...(meta || {}),
      tab: tabLike || meta?.tab || null,
      tabId: meta?.tabId || (tabLike && typeof tabLike === 'object' ? tabLike.id : tabLike) || null,
      reason: meta?.reason || 'survival-owned-runtime-remember'
    });
    return getSurvivalRuntimeOwner()?.capture(snapshot, {
      ...(meta || {}),
      tab: tabLike || meta?.tab || null,
      componentKey: 'survival',
      reason: meta?.reason || 'survival-owned-runtime-remember'
    }) || snapshot;
  }

  function resolveSurvivalOwnedRuntimeSnapshot(snapshot = null, meta = {}){
    const resolved = getSurvivalRuntimeOwner()?.bind(snapshot || null, {
      ...(meta || {}),
      componentKey: 'survival',
      reason: meta?.reason || 'survival-owned-runtime-resolve'
    }) || snapshot || null;
    if(resolved && typeof resolved === 'object'){
      setSurvivalSessionStateFromRuntimeRecord(resolved, {
        ...(meta || {}),
        reason: meta?.reason || 'survival-owned-runtime-resolve'
      });
    }
    return resolved;
  }

  function applyExistingSurvivalOwnedRuntimeRecord(tabLike = null, meta = {}){
    const snapshot = getSurvivalRuntimeOwner()?.bind(null, {
      ...(meta || {}),
      tab: tabLike || meta?.tab || null,
      componentKey: 'survival',
      reason: meta?.reason || 'survival-owned-runtime-activate-apply'
    });
    if(!snapshot || typeof survival.applyRuntimeState !== 'function'){
      return false;
    }
    bindSurvivalSessionForTab(tabLike || meta?.tabId || null, {
      ...(meta || {}),
      reason: meta?.reason || 'survival-owned-runtime-activate-bind'
    }, { apply: false });
    return survival.applyRuntimeState(snapshot, {
      ...(meta || {}),
      reason: meta?.reason || 'survival-owned-runtime-activate-apply'
    });
  }


  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  const svgGeometry = Shared.svgGeometry = Shared.svgGeometry || {};
  if(typeof svgGeometry.buildCompoundLinePath !== 'function' && typeof require === 'function'){
    try{
      require('../shared/svgGeometry.js');
    }catch(err){
      survivalDebug('Debug: survival component svgGeometry helper require failed', { message: err?.message || String(err) });
    }
  }
  const fontControls = Shared.fontControls = Shared.fontControls || {};
  const notesHelper = Shared.notes = Shared.notes || {};
  if(typeof notesHelper.mountFoldable !== 'function' && typeof require === 'function'){
    try{
      require('../shared/notes.js');
    }catch(err){
      survivalDebug('Debug: survival component notes helper require failed', { message: err?.message || String(err) });
    }
  }
  const dataViewsApi = Shared.dataViews = Shared.dataViews || {};
  if(typeof dataViewsApi.createManager !== 'function' && typeof require === 'function'){
    try{
      require('../shared/dataViews.js');
    }catch(err){
      survivalDebug('Debug: survival component dataViews helper require failed', { message: err?.message || String(err) });
    }
  }
  const notesState = { text: '', open: false, control: null };
  const exportFontStyles = (scopeId, options) => (fontControls && typeof fontControls.exportScopeStyles === 'function')
    ? fontControls.exportScopeStyles(scopeId, options)
    : null;
  const importFontStyles = (scopeId, styles, options) => {
    if(fontControls && typeof fontControls.importScopeStyles === 'function'){
      fontControls.importScopeStyles(scopeId, styles, { prune: true, ...(options || {}) });
    }
  };
  const additionalLineControls = Shared.additionalLineControls = Shared.additionalLineControls || {};
  if((typeof additionalLineControls.show !== 'function' || typeof additionalLineControls.registerAdditionalLineElement !== 'function') && typeof require === 'function'){
    try{
      require('../shared/additionalLineControls.js');
    }catch(err){
      survivalDebug('Debug: survival component additionalLineControls helper require failed', { message: err?.message || String(err) });
    }
  }

  function sanitizeSurvivalLinePattern(value){
    const patternRaw = String(value || 'solid').toLowerCase();
    return (patternRaw === 'dashed' || patternRaw === 'dotted' || patternRaw === 'solid') ? patternRaw : 'solid';
  }

  function survivalPatternToDasharray(pattern){
    const normalized = sanitizeSurvivalLinePattern(pattern);
    if(normalized === 'dashed'){ return '6 3'; }
    if(normalized === 'dotted'){ return '2 3'; }
    return '';
  }

  function inferSurvivalPatternFromElement(el){
    const dash = String(el?.getAttribute?.('stroke-dasharray') || '').trim();
    if(!dash){ return 'solid'; }
    const compact = dash.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    if(compact === '6 3' || compact === '4 4'){ return 'dashed'; }
    return 'dotted';
  }

  function applySurvivalPatternToElement(el, pattern){
    if(!el || !el.setAttribute){ return; }
    const dash = survivalPatternToDasharray(pattern);
    if(dash){
      el.setAttribute('stroke-dasharray', dash);
    }else{
      el.removeAttribute('stroke-dasharray');
    }
  }

  function showSurvivalStrokeFormatControls(target){
    if(target && additionalLineControls && typeof additionalLineControls.show === 'function'){
      const ownerSession = getSurvivalSessionForEvent(null, {
        target,
        reason: 'survival-curve-format-owner'
      }, { create: true });
      const ownerTabId = ownerSession?.tabId || getSurvivalProjectionTabId() || null;
      const canEditOwner = () => !ownerSession || isSurvivalSessionActive(ownerSession);
      let seriesKey = target.getAttribute('data-group') || null;
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
        const svg = getSurvivalNodeById('survivalSvg', ownerTabId);
        if(svg && svg.querySelectorAll){
          svg.querySelectorAll('path[data-survival-series-color-target="stroke"][data-group]:not([data-survival-censor-mark="1"])')
            .forEach(node => addKey(node.getAttribute('data-group')));
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
        const svg = getSurvivalNodeById('survivalSvg', ownerTabId);
        if(!svg){ return target ? [target] : []; }
        if(scopeValue === 'series' && seriesKey){
          return Array.from(svg.querySelectorAll('path[data-survival-series-color-target="stroke"][data-group]:not([data-survival-censor-mark="1"])'))
            .filter(node => node.getAttribute('data-group') === seriesKey);
        }
        return Array.from(svg.querySelectorAll('path[data-survival-series-color-target="stroke"][data-group]:not([data-survival-censor-mark="1"])'));
      };
      additionalLineControls.show({
        scopeId: 'survival',
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
          return 2;
        },
        getPattern: ctx => {
          if(ctx?.scope === 'series' && seriesKey){
            const persisted = state.labelLinePattern?.[seriesKey];
            if(persisted){ return sanitizeSurvivalLinePattern(persisted); }
          }
          return inferSurvivalPatternFromElement(target);
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
          if(!canEditOwner()){ return; }
          const scopeValue = ctx?.scope === 'series' ? 'series' : 'global';
          const groupNames = scopeValue === 'series' && seriesKey ? [seriesKey] : knownSeriesKeys();
          applySurvivalColorValues(groupNames, value, {
            session: ownerSession,
            source: 'curve-toolbar-input',
            reason: 'survival-curve-color-input'
          });
        },
        onColorChange: (value, ctx) => {
          if(!canEditOwner()){ return; }
          const scopeValue = ctx?.scope === 'series' ? 'series' : 'global';
          const groupNames = scopeValue === 'series' && seriesKey ? [seriesKey] : knownSeriesKeys();
          applySurvivalColorValues(groupNames, value, {
            session: ownerSession,
            source: 'curve-toolbar-change',
            reason: 'survival-curve-color-change'
          });
        },
        onThicknessChange: (value, ctx) => {
          if(!canEditOwner()){ return; }
          const next = Number(value);
          if(!Number.isFinite(next)){ return; }
          const scopeValue = ctx?.scope === 'series' ? 'series' : 'global';
          const nodes = resolveTargets(scopeValue);
          nodes.forEach(node => node.setAttribute('stroke-width', String(next)));
          if(scopeValue === 'series' && seriesKey){
            state.labelStrokeWidth[seriesKey] = next;
          }else{
            nodes.forEach(node => {
              const key = node.getAttribute('data-group');
              if(key){ state.labelStrokeWidth[key] = next; }
            });
          }
          syncSurvivalStateToSession(ownerSession, { labelStrokeWidth: state.labelStrokeWidth });
          if(!nodes.length){
            scheduleSurvivalViewRefresh('survival-curve-thickness-change', { tabId: ownerTabId });
          }
        },
        onPatternChange: (value, ctx) => {
          if(!canEditOwner()){ return; }
          const pattern = sanitizeSurvivalLinePattern(value);
          const scopeValue = ctx?.scope === 'series' ? 'series' : 'global';
          const nodes = resolveTargets(scopeValue);
          nodes.forEach(node => applySurvivalPatternToElement(node, pattern));
          if(scopeValue === 'series' && seriesKey){
            state.labelLinePattern[seriesKey] = pattern;
          }else{
            nodes.forEach(node => {
              const key = node.getAttribute('data-group');
              if(key){ state.labelLinePattern[key] = pattern; }
            });
          }
          syncSurvivalStateToSession(ownerSession, { labelLinePattern: state.labelLinePattern });
          if(!nodes.length){
            scheduleSurvivalViewRefresh('survival-curve-pattern-change', { tabId: ownerTabId });
          }
        },
        onTransparencyChange: (value, ctx) => {
          if(!canEditOwner()){ return; }
          const pct = Number(value);
          const bounded = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0;
          const opacity = 1 - (bounded / 100);
          const scopeValue = ctx?.scope === 'series' ? 'series' : 'global';
          const nodes = resolveTargets(scopeValue);
          nodes.forEach(node => node.setAttribute('stroke-opacity', String(opacity)));
          if(scopeValue === 'series' && seriesKey){
            state.labelOpacity[seriesKey] = opacity;
          }else{
            nodes.forEach(node => {
              const key = node.getAttribute('data-group');
              if(key){ state.labelOpacity[key] = opacity; }
            });
          }
          syncSurvivalStateToSession(ownerSession, { labelOpacity: state.labelOpacity });
          if(!nodes.length){
            scheduleSurvivalViewRefresh('survival-curve-opacity-change', { tabId: ownerTabId });
          }
        }
      });
      return;
    }
    survivalDebug('Debug: survival additional line controls unavailable; legacy fallback removed');
  }
  const axisControls = Shared.axisControls = Shared.axisControls || {};
  const gridControls = Shared.gridControls = Shared.gridControls || {};
  if((typeof gridControls.show !== 'function' || typeof gridControls.registerGraphElement !== 'function') && typeof require === 'function'){
    try{
      require('../shared/gridControls.js');
    }catch(err){
      survivalDebug('Debug: survival component gridControls helper require failed', { message: err?.message || String(err) });
    }
  }
  const formControls = Shared.formControls = Shared.formControls || {};
  const fileIO = Shared.fileIO = Shared.fileIO || {};
  const survivalUndoManager = Shared.undoManager || null;

  survival.__installed = true;
  survival.ready = false;

  const DEFAULT_ROWS = 100;
  const SURVIVAL_DEFAULT_COLS = 7;
  const SURVIVAL_DATA_VIEW_MAX = 15;
  let emptyPayloadTemplate = null;

  function cloneSimple(value){
    if(!value) return null;
    try{
      return JSON.parse(JSON.stringify(value));
    }catch(err){
      console.error('survival cloneSimple error', err);
      return null;
    }
  }

  function ensureEmptyPayloadTemplate(){
    const session = getActiveSurvivalSessionForState();
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
    emptyPayloadTemplate = { type: 'survival', config: {} };
    if(session?.cache){
      session.cache.emptyPayloadTemplate = cloneSimple(emptyPayloadTemplate) || emptyPayloadTemplate;
      session.updatedAt = Date.now();
    }
  }
  const BASE_COLUMN_COUNT = 4; // group, time, event, entry time
  const SURVIVAL_COL_HEADERS = [
    'Group',
    'Time',
    'Event (1=event,0=censored)',
    'Entry Time (optional)',
    'Covariate 1',
    'Covariate 2',
    'Covariate 3'
  ];

  function hasMeaningfulCellValue(value){
    if(value == null){
      return false;
    }
    if(typeof value === 'number'){
      return Number.isFinite(value);
    }
    if(typeof value === 'boolean'){
      return true;
    }
    return String(value).trim().length > 0;
  }

  function normalizeHeaderLabel(value, fallback){
    const str = value == null ? '' : String(value).trim();
    return str || fallback;
  }

  function columnHasData(data, columnIndex){
    if(!Array.isArray(data) || !data.length){
      return false;
    }
    for(let rowIndex = 0; rowIndex < data.length; rowIndex += 1){
      const row = data[rowIndex];
      if(Array.isArray(row) && hasMeaningfulCellValue(row[columnIndex])){
        return true;
      }
    }
    return false;
  }

  function detectTimeDependentSupport(data){
    if(!Array.isArray(data) || !data.length){
      return false;
    }
    for(let rowIndex = 0; rowIndex < data.length; rowIndex += 1){
      const row = data[rowIndex];
      if(!Array.isArray(row)){
        continue;
      }
      const entry = Number.parseFloat(row[3]);
      const time = Number.parseFloat(row[1]);
      if(Number.isFinite(entry) && Number.isFinite(time) && entry > 0 && entry < time){
        return true;
      }
    }
    return false;
  }

  function collectMeaningfulCovariateColumns(data, headerLookup, columnCount){
    const covariateColumns = [];
    const debugEnabled = typeof Shared?.isDebugEnabled === 'function' && Shared.isDebugEnabled();
    let skippedNoData = 0;
    let skippedBlank = 0;

    for(let col = BASE_COLUMN_COUNT; col < columnCount; col += 1){
      const rawHeader = Array.isArray(headerLookup) ? headerLookup[col] : '';
      let trimmedHeader = rawHeader == null ? '' : String(rawHeader).trim();

      const hasData = columnHasData(data, col);

      // Do NOT offer empty columns as covariates, even if the grid auto-generated a header like "Column 8".
      if(!hasData){
        skippedNoData += 1;
        continue;
      }

      // Treat auto-generated placeholders as blank so we show "Covariate N" instead of "Column 8".
      if(/^column\s+\d+$/i.test(trimmedHeader)){
        trimmedHeader = '';
      }

      if(!trimmedHeader){
        skippedBlank += 1;
      }

      covariateColumns.push({
        index: col,
        header: trimmedHeader || `Covariate ${covariateColumns.length + 1}`,
        key: `col${col}`,
        derivedHeader: !trimmedHeader
      });
    }

    if(debugEnabled){
      try{
        survivalDebug('Debug: survival covariate column scan', {
          baseColumnCount: BASE_COLUMN_COUNT,
          columnCount,
          covariateCount: covariateColumns.length,
          skippedNoData,
          unnamedCovariates: skippedBlank
        });
      }catch(_e){}
    }

    return covariateColumns;
  }
  function attachSurvivalSelectAutoSize(select, label){
    if(!select){ return; }
    if(typeof formControls.attachSelectAutoSize === 'function'){
      formControls.attachSelectAutoSize(select, label || 'survival');
      return;
    }
    const debugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
    const watcher = typeof formControls.watchSelectAutoSize === 'function' ? formControls.watchSelectAutoSize : null;
    const autoSizer = typeof formControls.autoSizeSelect === 'function' ? formControls.autoSizeSelect : null;
    const contextLabel = label || 'survival';
    try{
      if(watcher){
        watcher(select);
        if(debugEnabled){
          survivalDebug('Debug: survival select auto-size watcher attached', {
            id: select.id || null,
            label: contextLabel
          });
        }
      }else if(autoSizer){
        autoSizer(select);
        if(debugEnabled){
          survivalDebug('Debug: survival select auto-size applied without watcher', {
            id: select.id || null,
            label: contextLabel
          });
        }
      }else if(debugEnabled){
        survivalDebug('Debug: survival select auto-size helper unavailable', {
          id: select.id || null,
          label: contextLabel
        });
      }
    }catch(err){
      if(debugEnabled){
        survivalDebug('Debug: survival select auto-size attach error', {
          id: select.id || null,
          label: contextLabel,
          error: err?.message || String(err)
        });
      }
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
  const DEFAULT_COLORS = typeof palette.ensureDefaultScatterColors === 'function'
    ? palette.ensureDefaultScatterColors()
    : (Array.isArray(palette.DEFAULT_SCATTER_COLORS) && palette.DEFAULT_SCATTER_COLORS.length
      ? palette.DEFAULT_SCATTER_COLORS
      : global.DEFAULT_SCATTER_COLORS);
  if(Array.isArray(DEFAULT_COLORS) && DEFAULT_COLORS.length){
    palette.DEFAULT_SCATTER_COLORS = DEFAULT_COLORS;
    global.DEFAULT_SCATTER_COLORS = DEFAULT_COLORS;
  }

  const ensureGraphViewport = Shared.graphViewport?.createEnsurer
    ? Shared.graphViewport.createEnsurer('survival')
    : (svg, options = {}) => {
      const fn = Shared.ensureGraphViewport || Shared.autoResizeSvg || global.ensureGraphViewport || global.autoResizeSvg;
      if(typeof fn === 'function'){
        fn(svg, { component: 'survival', debugLabel: 'survival-viewport-fallback', ...options });
        return;
      }
      logDebug('ensureGraphViewport helper missing', {
        hasShared: !!Shared,
        hasAutoResize: typeof Shared?.autoResizeSvg === 'function'
      });
    };
  logDebug('graph viewport helper configured', {
    hasGraphViewport: typeof Shared.graphViewport?.ensure === 'function',
    usesFactory: typeof Shared.graphViewport?.createEnsurer === 'function'
  });

  const makeEditable = (el, onChange, options) => {
    const fn = Shared.makeEditable || global.makeEditable;
    if(typeof fn === 'function'){
      return fn(el, onChange, options);
    }
    console.warn('survival component makeEditable fallback missing');
    return undefined;
  };

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
      x: { tickInterval: null, majorTickLength: null, minorTicks: false, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS },
      y: { tickInterval: null, majorTickLength: null, minorTicks: false, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS }
    };
  }

  const state = {
    hot: null,
    scheduleDraw: null,
    labelColors: {},
    labelStrokeWidth: {},
    labelOpacity: {},
    labelLinePattern: {},
    groupOrder: [],
    minSvgWidth: 0,
    layout: null,
    fileHandle: null,
    fileName: 'survival.graph',
    titleText: 'Survival curve',
    lastSummary: null,
    lastStats: null,
    statsPanelModels: { summary: null, logRank: null, hazardRatios: null, cox: null },
    pairwiseCorrection: 'holm-sidak',
    statsReportPScientific: false,
    covariateSettings: {},
    covariateColumns: [],
    axisSettings: createDefaultAxisSettings(),
    gridStyle: null,
    labelPositions: { title: null, xLabel: null, yLabel: null, legend: null, stats: null },
    controls: null
  };
  let survivalFontEventBound = false;


  const survivalSessionsByTabId = new Map();
  // Transient visible-DOM projection bridge. Durable state belongs to the owner session map.
  let projectedSurvivalSession = null;

  // Compatibility bridge: visible-DOM projection tab id. Delete after every projection entrypoint receives explicit owner tab metadata.
  function getSurvivalProjectionTabId(){
    return Shared.componentLifecycle?.resolveProjectionTabId?.(survival, projectedSurvivalSession) || String(survival.__boundTabId || projectedSurvivalSession?.tabId || '').trim();
  }

  function getSurvivalProjectionSession(meta = {}, options = {}){
    const tabId = getSurvivalProjectionTabId();
    if(!tabId){ return null; }
    return getSurvivalSession(tabId, { ...(meta || {}), tabId, reason: meta?.reason || 'survival-projection-session' }, { create: options.create !== false });
  }

  function normalizeSurvivalLabelPositions(value){
    const source = value && typeof value === 'object' ? (cloneSimple(value) || {}) : {};
    return { title: null, xLabel: null, yLabel: null, legend: null, stats: null, ...source };
  }

  function createDefaultSurvivalStatsPanelModels(source = {}){
    const src = source && typeof source === 'object' ? source : {};
    return {
      summary: normalizeSurvivalStatsPanelModel(src.summary || null),
      logRank: normalizeSurvivalStatsPanelModel(src.logRank || null),
      hazardRatios: normalizeSurvivalStatsPanelModel(src.hazardRatios || null),
      cox: normalizeSurvivalStatsPanelModel(src.cox || null)
    };
  }

  function createDefaultSurvivalDurableState(source = {}){
    const src = source && typeof source === 'object' ? source : {};
    return {
      labelColors: cloneSimple(src.labelColors) || {},
      labelStrokeWidth: cloneSimple(src.labelStrokeWidth) || {},
      labelOpacity: cloneSimple(src.labelOpacity) || {},
      labelLinePattern: cloneSimple(src.labelLinePattern) || {},
      groupOrder: cloneSimple(src.groupOrder) || [],
      minSvgWidth: Number.isFinite(Number(src.minSvgWidth)) ? Number(src.minSvgWidth) : 0,
      fileName: typeof src.fileName === 'string' && src.fileName.trim() ? src.fileName : 'survival.graph',
      titleText: src.titleText != null ? String(src.titleText) : 'Survival curve',
      lastSummary: cloneSimple(src.lastSummary) || null,
      lastStats: cloneSimple(src.lastStats ?? src.stats) || null,
      statsPanelModels: createDefaultSurvivalStatsPanelModels(src.statsPanelModels || src.statsPanels || {}),
      pairwiseCorrection: typeof src.pairwiseCorrection === 'string' && src.pairwiseCorrection.trim()
        ? src.pairwiseCorrection
        : 'holm-sidak',
      statsReportPScientific: sanitizeSurvivalStatsReportPScientific(src.statsReportPScientific),
      covariateSettings: cloneSimple(src.covariateSettings) || {},
      covariateColumns: Array.isArray(src.covariateColumns) ? (cloneSimple(src.covariateColumns) || []) : [],
      axisSettings: cloneSimple(src.axisSettings || src.axis) || createDefaultAxisSettings(),
      gridStyle: cloneSimple(src.gridStyle) || null,
      labelPositions: normalizeSurvivalLabelPositions(src.labelPositions),
      controls: normalizeSurvivalRuntimeControls(src.controls || src.config || {}),
      drawPending: src.drawPending === true
    };
  }

  function createDefaultSurvivalResultsState(source = {}){
    const src = source && typeof source === 'object' ? source : {};
    return {
      stats: cloneSimple(src.stats ?? src.lastStats ?? null) || null,
      statsPanelModels: createDefaultSurvivalStatsPanelModels(src.statsPanelModels || src.statsPanels || {})
    };
  }

  function createDefaultSurvivalNotesState(source = {}){
    const src = source && typeof source === 'object' ? source : {};
    return {
      text: src.text == null ? '' : String(src.text),
      open: !!src.open
    };
  }

  function createDefaultSurvivalAdvisorState(source = {}){
    const src = source && typeof source === 'object' ? source : {};
    return {
      open: !!src.open,
      activated: !!src.activated,
      answers: cloneSimple(src.answers) || {},
      lastApplied: cloneSimple(src.lastApplied) || null,
      context: cloneSimple(src.context) || null
    };
  }

  function createDefaultSurvivalRefs(root = null){
    return {
      root: root || null,
      tablePanel: null,
      graphPanel: null,
      panelResizer: null,
      svgBox: null,
      configPanel: null,
      plotDiv: null,
      hotWrapper: null,
      hotContainer: null,
      statsPValueFormat: null,
      statsSummary: null,
      statsLogRank: null,
      statsHazardRatios: null,
      statsCox: null,
      labelColorsDiv: null,
      labelColorsFieldset: null,
      showCI: null,
      showCensor: null,
      showRiskTable: null,
      showPlotStats: null,
      showHazardRatios: null,
      fitCoxModel: null,
      covariateControls: null,
      covariateHint: null,
      showGrid: null,
      showFrame: null,
      timeMax: null,
      xLabel: null,
      yLabel: null,
      fontSize: null,
      fontSizeVal: null,
      showLegend: null,
      loadExampleBtn: null,
      importBtn: null,
      fileInput: null,
      openBtn: null,
      saveBtn: null,
      saveAsBtn: null,
      graphFileInput: null,
      exportContainer: null,
      notesControl: null,
      legendControl: null
    };
  }

  function normalizeSurvivalSessionTabId(tabLike = null, meta = {}){
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
      || Shared.workspaceTabs?.getActiveSessionInfo?.('survival')?.tabId
      || getSurvivalProjectionTabId()
      || '';
    return String(resolved || '').trim();
  }

  function createSurvivalSession({ tabId, root = null, initialState = null } = {}){
    const normalizedTabId = String(tabId || '').trim();
    const source = initialState && typeof initialState === 'object' ? initialState : {};
    const durableSource = source.state && typeof source.state === 'object' ? source.state : source;
    return {
      componentKey: 'survival',
      tabId: normalizedTabId,
      root: root || null,
      state: createDefaultSurvivalDurableState(durableSource),
      results: createDefaultSurvivalResultsState({
        stats: durableSource.lastStats ?? source.stats,
        statsPanelModels: durableSource.statsPanelModels || source.statsPanelModels || source.statsPanels
      }),
      refs: createDefaultSurvivalRefs(root || null),
      cache: {
        render: null,
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
      notes: createDefaultSurvivalNotesState(source.notes || durableSource.notes || {}),
      advisor: createDefaultSurvivalAdvisorState(source.advisor || {}),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  function ensureSurvivalSessionOwnershipShape(session){
    if(!session || typeof session !== 'object'){
      return null;
    }
    session.componentKey = 'survival';
    session.tabId = String(session.tabId || '').trim();
    session.root = session.root || null;
    session.state = createDefaultSurvivalDurableState(session.state || {});
    session.results = createDefaultSurvivalResultsState(session.results || {
      stats: session.state.lastStats,
      statsPanelModels: session.state.statsPanelModels
    });
    session.refs = session.refs && typeof session.refs === 'object' ? session.refs : createDefaultSurvivalRefs(session.root || null);
    session.refs.root = session.refs.root || session.root || null;
    session.cache = session.cache && typeof session.cache === 'object' ? session.cache : {};
    if(!Object.prototype.hasOwnProperty.call(session.cache, 'render')){ session.cache.render = null; }
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
    session.notes = createDefaultSurvivalNotesState(session.notes || {});
    session.advisor = createDefaultSurvivalAdvisorState(session.advisor || {});
    session.updatedAt = Number.isFinite(Number(session.updatedAt)) ? Number(session.updatedAt) : Date.now();
    return session;
  }

  function getSurvivalSession(tabLike = null, meta = {}, options = {}){
    const tabId = normalizeSurvivalSessionTabId(tabLike, meta);
    if(!tabId){
      return options.fallbackActive === true ? ensureSurvivalSessionOwnershipShape(projectedSurvivalSession) : null;
    }
    let session = survivalSessionsByTabId.get(tabId) || null;
    if(!session && options.create !== false){
      session = createSurvivalSession({ tabId, root: resolveSurvivalRoot(tabId || null) || null });
      survivalSessionsByTabId.set(tabId, session);
    }
    return ensureSurvivalSessionOwnershipShape(session);
  }

  function getActiveSurvivalSessionForState(){
    return Shared.componentLifecycle?.resolveActiveSessionForComponent?.({
      componentKey: 'survival',
      component: survival,
      projectedSession: projectedSurvivalSession,
      getSession: getSurvivalSession,
      ensureSession: ensureSurvivalSessionOwnershipShape,
      create: true,
      reason: 'active-survival-session'
    }) || null;
  }

  function getSurvivalTabIdFromTarget(target = null){
    return String(Shared.componentLifecycle?.resolveTabIdFromTarget?.(target) || '').trim();
  }

  function getSurvivalSessionForEvent(event = null, meta = {}, options = {}){
    const target = event?.currentTarget || event?.target || meta?.target || null;
    const tabId = normalizeSurvivalSessionTabId(getSurvivalTabIdFromTarget(target) || meta?.tabId || null, meta || {});
    return tabId
      ? getSurvivalSession(tabId, { ...(meta || {}), tabId, reason: meta?.reason || 'survival-event-owner' }, { create: options.create !== false })
      : getActiveSurvivalSessionForState();
  }

  function runSurvivalControlOwner(event, reason, callback){
    const session = getSurvivalSessionForEvent(event, { reason }, { create: true });
    if(session?.tabId && !isSurvivalSessionActive(session)){
      survivalDebug('Debug: survival control callback skipped for inactive owner', {
        tabId: session.tabId || null,
        activeTabId: getSurvivalProjectionTabId() || null,
        reason: reason || 'survival-control-owner'
      });
      return undefined;
    }
    return typeof callback === 'function' ? callback(session) : undefined;
  }

  function isSurvivalSessionActive(session = null){
    if(!session || typeof session !== 'object' || !String(session.tabId || '').trim()){
      return false;
    }
    return Shared.componentLifecycle?.canOwnerUseLiveProjection?.('survival', session, {
      component: survival,
      projectedSession: projectedSurvivalSession,
      session,
      root: refs.root || null
    }) === true;
  }

  function isSurvivalSessionActivationTarget(session = null){
    return Shared.componentLifecycle?.isOwnerActivationTarget?.('survival', session, { component: survival }) === true;
  }

  function scheduleSurvivalDrawForSession(session = null, options = {}){
    const shaped = ensureSurvivalSessionOwnershipShape(session || getActiveSurvivalSessionForState());
    if(!shaped){
      return false;
    }
    if(Shared.hot?.shouldDeferOwnerProjectionDraw?.(shaped, options)){
      return false;
    }
    const sourceOptions = options && typeof options === 'object' ? options : {};
    const scheduleOptions = Shared.componentLifecycle?.sanitizeDrawOptions
      ? Shared.componentLifecycle.sanitizeDrawOptions(sourceOptions, { tabId: shaped.tabId || null, reason: 'survival-session-draw' })
      : { ...sourceOptions, tabId: shaped.tabId || sourceOptions.tabId || undefined, reason: sourceOptions.reason || 'survival-session-draw' };
    if(shaped.timers){
      shaped.timers.pendingDrawOptions = scheduleOptions;
    }
    if(!isSurvivalSessionActive(shaped)){
      shaped.state.drawPending = true;
      shaped.updatedAt = Date.now();
      return false;
    }
    const scheduler = state.scheduleDraw;
    if(typeof scheduler !== 'function'){
      return false;
    }
    shaped.timers.pendingDrawOptions = null;
    shaped.state.drawPending = false;
    shaped.updatedAt = Date.now();
    scheduler(scheduleOptions);
    return true;
  }

  function scheduleActiveSurvivalDraw(options = {}){
    return scheduleSurvivalDrawForSession(getActiveSurvivalSessionForState(), options);
  }

  function getSurvivalSessionForDrawOptions(options = {}, meta = {}){
    const source = options && typeof options === 'object' ? options : {};
    const tabId = source.tabId || source.tab?.id || meta?.tabId || getSurvivalProjectionTabId() || null;
    return tabId
      ? getSurvivalSession(tabId, {
          ...(meta || {}),
          tabId,
          reason: meta?.reason || source.reason || 'survival-draw-session'
        }, { create: meta?.create !== false })
      : getActiveSurvivalSessionForState();
  }

  function normalizeSurvivalOwnerTabId(value){
    return String(value == null ? '' : value).trim();
  }

  function resolveSurvivalHotOwnerTabId(hotInstance){
    return normalizeSurvivalOwnerTabId(
      Shared.componentLifecycle?.resolveOwnedObjectTabId?.(hotInstance, 'survival') || ''
    );
  }

  const survivalHotBelongsToSession = (hotInstance, session) => (
    Shared.componentLifecycle?.ownedHotBelongsToSession?.(hotInstance, session, 'survival') === true
  );



  const survivalDataViewsManagerBelongsToSession = (manager = null, session = null) => (
    Shared.componentLifecycle?.ownedDataViewsManagerBelongsToSession?.(manager, session, 'survival', {
      ensureSession: ensureSurvivalSessionOwnershipShape
    }) === true
  );

  function syncSurvivalStateToSession(session = null, overrides = {}){
    const shaped = ensureSurvivalSessionOwnershipShape(session || getActiveSurvivalSessionForState());
    if(!shaped){ return null; }
    const projectionTabId = String(getSurvivalProjectionTabId() || '').trim();
    const ownerTabId = String(shaped.tabId || '').trim();
    const canReadProjectedMirrors = !session || (!!projectionTabId && projectionTabId === ownerTabId);
    const projectedState = canReadProjectedMirrors ? {
      labelColors: state.labelColors,
      labelStrokeWidth: state.labelStrokeWidth,
      labelOpacity: state.labelOpacity,
      labelLinePattern: state.labelLinePattern,
      groupOrder: state.groupOrder,
      minSvgWidth: state.minSvgWidth,
      fileName: state.fileName,
      titleText: state.titleText,
      lastSummary: state.lastSummary,
      lastStats: state.lastStats,
      statsPanelModels: state.statsPanelModels,
      pairwiseCorrection: state.pairwiseCorrection,
      statsReportPScientific: state.statsReportPScientific,
      covariateSettings: state.covariateSettings,
      covariateColumns: state.covariateColumns,
      axisSettings: state.axisSettings,
      gridStyle: state.gridStyle,
      labelPositions: state.labelPositions,
      controls: state.controls
    } : {};
    shaped.state = createDefaultSurvivalDurableState({
      ...(shaped.state || {}),
      ...projectedState,
      ...(overrides || {})
    });
    shaped.results = createDefaultSurvivalResultsState({
      stats: shaped.state.lastStats,
      statsPanelModels: shaped.state.statsPanelModels
    });
    shaped.updatedAt = Date.now();
    return shaped;
  }

  function buildSurvivalAxisControlConfig(axis, ownerSession = null, axisMeta = {}){
    const owner = ensureSurvivalSessionOwnershipShape(ownerSession || getActiveSurvivalSessionForState());
    return {
      axis,
      scopeId: 'survival',
      tabId: owner?.tabId || null,
      getTickInterval: () => getAxisTickInterval(axis),
      getEffectiveTickInterval: () => axisMeta?.effectiveTickInterval ?? null,
      getMajorTickLength: () => getAxisMajorTickLength(axis),
      onMajorTickLengthChange: value => updateAxisMajorTickLength(axis, value),
      isMajorTickLengthSupported: () => true,
      majorTickLengthPlaceholder: 'Auto',
      getThickness: () => getAxisStrokeWidthBase(),
      getColor: () => getAxisColor(),
      isTickIntervalEnabled: () => true,
      getTickIntervalDisabledMessage: () => 'Tick interval available for numeric axes.',
      tickPlaceholder: 'Auto',
      onTickIntervalChange: value => updateAxisTickInterval(axis, value),
      getMinorTicksEnabled: () => getAxisMinorTicksEnabled(axis),
      onMinorTicksChange: value => updateAxisMinorTicks(axis, value),
      isMinorTicksSupported: () => true,
      getMinorTickSubdivisions: () => getAxisMinorTickSubdivisions(axis),
      onMinorTickSubdivisionsChange: value => updateAxisMinorTickSubdivisions(axis, value),
      onThicknessChange: value => updateAxisStrokeWidth(value),
      onColorChange: value => updateAxisColor(value)
    };
  }

  function bindSurvivalInlineTextInteraction(node, ownerSession, kind){
    if(!node){ return false; }
    const owner = ensureSurvivalSessionOwnershipShape(ownerSession || getActiveSurvivalSessionForState());
    if(!owner?.state){ return false; }
    const normalizedKind = kind === 'title' ? 'title' : (kind === 'yLabel' ? 'yLabel' : 'xLabel');
    const readValue = () => {
      if(normalizedKind === 'title'){
        return String(owner.state.titleText ?? '');
      }
      const controls = normalizeSurvivalRuntimeControls(owner.state.controls || {});
      return String(normalizedKind === 'xLabel' ? controls.xLabel : controls.yLabel);
    };
    const applyValue = value => {
      const nextValue = value != null ? String(value) : '';
      if(normalizedKind === 'title'){
        syncSurvivalStateToSession(owner, { titleText: nextValue });
        if(isSurvivalSessionActive(owner)){ state.titleText = nextValue; }
      }else{
        const controls = normalizeSurvivalRuntimeControls({
          ...(owner.state.controls || {}),
          [normalizedKind === 'xLabel' ? 'xLabel' : 'yLabel']: nextValue
        });
        syncSurvivalStateToSession(owner, { controls });
        if(isSurvivalSessionActive(owner)){ state.controls = controls; }
      }
      if(node.textContent !== nextValue){ node.textContent = nextValue; }
      scheduleSurvivalDrawForSession(owner, {
        viewOnly: true,
        tabId: owner.tabId || null,
        reason: normalizedKind === 'title' ? 'survival-title-edit' : `survival-${normalizedKind === 'xLabel' ? 'x' : 'y'}-label-edit`
      });
      return nextValue;
    };
    return makeEditable(node, text => {
      const previous = readValue();
      const nextValue = text != null ? String(text) : '';
      if(previous === nextValue){ return; }
      applyValue(nextValue);
      recordSurvivalChange(
        normalizedKind === 'title' ? 'survival:title' : `survival:${normalizedKind === 'xLabel' ? 'x' : 'y'}-label`,
        previous,
        nextValue,
        applyValue
      );
    }) === true;
  }

  function rehydrateSurvivalInlineTextInteractions(svg, ownerSession){
    if(!svg){ return false; }
    const bindings = [
      [svg.querySelector?.('text[data-font-role="graphTitle"]'), 'title'],
      [svg.querySelector?.('text[data-font-role="xTitle"]'), 'xLabel'],
      [svg.querySelector?.('text[data-font-role="yTitle"]'), 'yLabel']
    ].filter(([node]) => !!node);
    if(!bindings.length){ return true; }
    return bindings.every(([node, kind]) => bindSurvivalInlineTextInteraction(node, ownerSession, kind));
  }

  function patchSurvivalLabelPosition(session = null, key, value, meta = {}){
    const owner = ensureSurvivalSessionOwnershipShape(session || getActiveSurvivalSessionForState());
    const current = normalizeSurvivalLabelPositions(owner?.state?.labelPositions || state.labelPositions);
    const nextPositions = normalizeSurvivalLabelPositions({ ...current, [key]: value || null });
    if(owner?.state){
      owner.state.labelPositions = nextPositions;
      owner.updatedAt = Date.now();
    }
    if(!owner || isSurvivalSessionActive(owner)){
      state.labelPositions = nextPositions;
    }
    logDebug('label position patched to owner', {
      tabId: owner?.tabId || null,
      key,
      reason: meta?.reason || null
    });
    return nextPositions;
  }

  function bindSurvivalLegendInteractions(legend, svg, ownerSession = null, metrics = {}){
    const owner = ensureSurvivalSessionOwnershipShape(ownerSession || getActiveSurvivalSessionForState());
    return Shared.bindLegendDragInteraction?.(legend, svg, {
      owner,
      originX: Number.isFinite(Number(metrics.originX)) ? metrics.originX : 0,
      originY: Number.isFinite(Number(metrics.originY)) ? metrics.originY : 0,
      scaleX: Number.isFinite(Number(metrics.scaleX)) ? metrics.scaleX : metrics.svgWidth,
      scaleY: Number.isFinite(Number(metrics.scaleY)) ? metrics.scaleY : metrics.svgHeight,
      positionAnchor: chartStyle.LEGEND_POSITION_ANCHOR,
      undoLabel: 'survival-legend',
      onCommit: (position, dragOwner) => {
        patchSurvivalLabelPosition(dragOwner, 'legend', position, { reason: 'survival-legend-position' });
      }
    }) === true;
  }


  function syncSurvivalSessionRefsFromActive(session = null){
    const shaped = ensureSurvivalSessionOwnershipShape(session || projectedSurvivalSession || getActiveSurvivalSessionForState());
    if(!shaped){ return null; }
    if(shaped.tabId && !isSurvivalSessionActive(shaped)){
      return shaped;
    }
    shaped.root = refs.root || shaped.root || null;
    shaped.refs = Object.assign(createDefaultSurvivalRefs(shaped.root || null), shaped.refs || {}, refs || {});
    shaped.refs.root = refs.root || shaped.refs.root || shaped.root || null;
    shaped.refs.notesControl = canUseSurvivalNotesControl(notesState.control) ? notesState.control : null;
    shaped.refs.legendControl = survivalLegendControl || shaped.refs.legendControl || null;
    shaped.updatedAt = Date.now();
    return shaped;
  }

  function bindSurvivalLayoutManagerForSession(session){
    const shaped = ensureSurvivalSessionOwnershipShape(session);
    if(!shaped){ return null; }
    const ownedLayout = Shared.componentLayout?.getOwnedLayoutFor?.('survival', { tabId: shaped.tabId }) || null;
    shaped.managers.layout = ownedLayout;
    if(!shaped.tabId || isSurvivalSessionActive(shaped)){
      state.layout = ownedLayout;
    }
    return ownedLayout;
  }

  function syncSurvivalSessionManagersFromActive(session = null){
    const shaped = ensureSurvivalSessionOwnershipShape(session || projectedSurvivalSession || getActiveSurvivalSessionForState());
    if(!shaped){ return null; }
    const sessionIsActive = !shaped.tabId || isSurvivalSessionActive(shaped);
    const activeHot = state.hot || null;
    if(survivalHotBelongsToSession(activeHot, shaped)){
      shaped.managers.hot = activeHot;
    }
    const hotManager = activeHot?.__survivalDataViewsManager || null;
    if(survivalDataViewsManagerBelongsToSession(hotManager, shaped)){
      shaped.managers.dataViews = hotManager;
    }
    if(sessionIsActive){
      bindSurvivalLayoutManagerForSession(shaped);
      shaped.managers.fileHandle = state.fileHandle || shaped.managers.fileHandle || null;
      shaped.timers.scheduleDraw = state.scheduleDraw || shaped.timers.scheduleDraw || null;
    }
    shaped.cache.emptyPayloadTemplate = cloneSimple(emptyPayloadTemplate) || shaped.cache.emptyPayloadTemplate || null;
    shaped.updatedAt = Date.now();
    return shaped;
  }

  function canUseSurvivalNotesControl(noteControl){
    if(!noteControl){ return false; }
    const root = refs.root || resolveSurvivalRoot(getSurvivalProjectionTabId() || null);
    const controlRoot = noteControl.root || null;
    if(controlRoot){
      return !!controlRoot.isConnected && (!root || root === controlRoot || root.contains?.(controlRoot));
    }
    return !!root && (!noteControl.element || root.contains?.(noteControl.element));
  }

  function setSurvivalFileHandleForSession(handle, session = null){
    const owner = ensureSurvivalSessionOwnershipShape(session || getActiveSurvivalSessionForState());
    if(owner?.managers){
      owner.managers.fileHandle = handle || null;
      owner.updatedAt = Date.now();
    }
    if(!owner || isSurvivalSessionActive(owner)){
      state.fileHandle = handle || null;
    }
    return handle || null;
  }

  function setSurvivalFileNameForSession(name, session = null){
    const nextName = name || 'survival.graph';
    const owner = ensureSurvivalSessionOwnershipShape(session || getActiveSurvivalSessionForState());
    if(owner?.state){
      owner.state.fileName = nextName;
      owner.updatedAt = Date.now();
    }
    if(!owner || isSurvivalSessionActive(owner)){
      state.fileName = nextName;
    }
    return nextName;
  }

  function captureSurvivalNotesMirror(){
    const noteControl = canUseSurvivalNotesControl(notesState.control) ? notesState.control : null;
    const text = noteControl && typeof noteControl.getValue === 'function'
      ? noteControl.getValue()
      : (notesState.text || '');
    const open = noteControl && typeof noteControl.isOpen === 'function'
      ? noteControl.isOpen()
      : !!notesState.open;
    notesState.text = text == null ? '' : String(text);
    notesState.open = !!open;
    return createDefaultSurvivalNotesState(notesState);
  }

  function captureSurvivalSessionStateFromActive(session = null, meta = {}){
    const shaped = ensureSurvivalSessionOwnershipShape(session || getActiveSurvivalSessionForState());
    if(!shaped){ return null; }
    if(shaped.tabId && !isSurvivalSessionActive(shaped)){
      shaped.updatedAt = Date.now();
      return shaped;
    }
    if(meta.syncControls !== false){
      syncSurvivalRuntimeControlsFromDom();
    }
    const statsPanels = meta.captureStatsPanels === false
      ? createDefaultSurvivalStatsPanelModels(state.statsPanelModels || {})
      : createDefaultSurvivalStatsPanelModels(captureSurvivalStatsPanelModels(state.statsPanelModels || {}, shaped));
    shaped.state = createDefaultSurvivalDurableState({
      labelColors: state.labelColors,
      labelStrokeWidth: state.labelStrokeWidth,
      labelOpacity: state.labelOpacity,
      labelLinePattern: state.labelLinePattern,
      groupOrder: state.groupOrder,
      minSvgWidth: state.minSvgWidth,
      fileName: state.fileName,
      titleText: state.titleText,
      lastSummary: state.lastSummary,
      lastStats: state.lastStats,
      statsPanelModels: statsPanels,
      pairwiseCorrection: state.pairwiseCorrection,
      statsReportPScientific: state.statsReportPScientific,
      covariateSettings: state.covariateSettings,
      covariateColumns: state.covariateColumns,
      axisSettings: state.axisSettings,
      gridStyle: state.gridStyle,
      labelPositions: state.labelPositions,
      controls: state.controls,
      drawPending: state.drawPending === true
    });
    shaped.results = createDefaultSurvivalResultsState({ stats: shaped.state.lastStats, statsPanelModels: statsPanels });
    shaped.notes = captureSurvivalNotesMirror();
    shaped.advisor = createDefaultSurvivalAdvisorState(getSurvivalAdvisorState(shaped));
    syncSurvivalSessionRefsFromActive(shaped);
    syncSurvivalSessionManagersFromActive(shaped);
    shaped.updatedAt = Date.now();
    return shaped;
  }

  function applySurvivalSessionStateToActive(session = null, options = {}){
    const shaped = ensureSurvivalSessionOwnershipShape(session || getActiveSurvivalSessionForState());
    if(!shaped){ return false; }
    state.labelColors = cloneSimple(shaped.state.labelColors) || {};
    state.labelStrokeWidth = cloneSimple(shaped.state.labelStrokeWidth) || {};
    state.labelOpacity = cloneSimple(shaped.state.labelOpacity) || {};
    state.labelLinePattern = cloneSimple(shaped.state.labelLinePattern) || {};
    state.groupOrder = cloneSimple(shaped.state.groupOrder) || [];
    state.minSvgWidth = Number.isFinite(Number(shaped.state.minSvgWidth)) ? Number(shaped.state.minSvgWidth) : 0;
    state.fileName = shaped.state.fileName || state.fileName || 'survival.graph';
    state.titleText = shaped.state.titleText != null ? String(shaped.state.titleText) : 'Survival curve';
    state.lastSummary = cloneSimple(shaped.state.lastSummary) || null;
    state.lastStats = cloneSimple(shaped.results.stats ?? shaped.state.lastStats ?? null) || null;
    state.statsPanelModels = createDefaultSurvivalStatsPanelModels(shaped.results.statsPanelModels || shaped.state.statsPanelModels || {});
    state.pairwiseCorrection = shaped.state.pairwiseCorrection || 'holm-sidak';
    state.statsReportPScientific = sanitizeSurvivalStatsReportPScientific(shaped.state.statsReportPScientific);
    state.covariateSettings = cloneSimple(shaped.state.covariateSettings) || {};
    state.covariateColumns = cloneSimple(shaped.state.covariateColumns) || [];
    state.axisSettings = cloneSimple(shaped.state.axisSettings) || createDefaultAxisSettings();
    state.gridStyle = cloneSimple(shaped.state.gridStyle) || null;
    state.labelPositions = normalizeSurvivalLabelPositions(shaped.state.labelPositions);
    state.controls = normalizeSurvivalRuntimeControls(shaped.state.controls || {});
    state.drawPending = shaped.state.drawPending === true;
    state.fileHandle = shaped.managers.fileHandle || state.fileHandle || null;
    if(options.restoreEmptyPayload !== false && shaped.cache?.emptyPayloadTemplate){
      emptyPayloadTemplate = cloneSimple(shaped.cache.emptyPayloadTemplate) || emptyPayloadTemplate;
    }
    if(!refs.root && shaped.refs?.root){
      refs.root = shaped.refs.root;
    }
    notesState.text = shaped.notes.text || '';
    notesState.open = !!shaped.notes.open;
    if(canUseSurvivalNotesControl(notesState.control)){
      notesState.control.setValue(notesState.text);
      notesState.control.setOpen(notesState.open);
    }
    Object.assign(survivalAdvisorState, createDefaultSurvivalAdvisorState(shaped.advisor || {}));
    if(options.syncUi !== false){
      syncSurvivalRuntimeControlsFromState(state.controls, shaped);
      if(state.lastStats || Object.values(state.statsPanelModels || {}).some(survivalStatsPanelModelHasContent)){
        restoreSurvivalStatsPanelModels(state.statsPanelModels, shaped);
      }
    }
    shaped.updatedAt = Date.now();
    return true;
  }

  function bindSurvivalSessionForTab(tabLike = null, meta = {}, options = {}){
    const tabId = normalizeSurvivalSessionTabId(tabLike, meta);
    if(!tabId){ return null; }
    if(projectedSurvivalSession && projectedSurvivalSession.tabId && projectedSurvivalSession.tabId !== tabId){
      captureSurvivalSessionStateFromActive(projectedSurvivalSession, {
        reason: meta?.reason || 'survival-session-switch-capture',
        // The owner session already contains the last committed statistics model.
        // Tab switching is projection-only and must not reinterpret that durable
        // model from a DOM shell that is about to be rebound.
        captureStatsPanels: false
      });
    }
    const session = getSurvivalSession(tabId, { ...(meta || {}), tabId, reason: meta?.reason || 'survival-session-bind' }, { create: true });
    if(!session){ return null; }
    const root = meta?.root || resolveSurvivalRoot(tabLike || tabId || null) || session.root || null;
    session.root = root || session.root || null;
    session.refs.root = root || session.refs.root || null;
    projectedSurvivalSession = session;
    survival.__survivalSessionTabId = session.tabId;
    survival.__boundTabId = session.tabId;
    bindSurvivalLayoutManagerForSession(session);
    if(options.apply !== false){
      applySurvivalSessionStateToActive(session, { syncUi: options.syncUi === true });
    }
    return session;
  }

  function setSurvivalSessionStateFromRuntimeRecord(record, meta = {}){
    if(!record || typeof record !== 'object'){
      return null;
    }
    const tabId = normalizeSurvivalSessionTabId(meta?.tab || meta?.tabId || record.tabId || null, meta);
    if(!tabId){ return null; }
    const session = getSurvivalSession(tabId, { ...(meta || {}), tabId, reason: meta?.reason || 'survival-session-state-from-runtime' }, { create: true });
    if(!session){ return null; }
    const runtimeState = record.state && typeof record.state === 'object' ? record.state : record;
    session.state = createDefaultSurvivalDurableState({
      ...runtimeState,
      controls: normalizeSurvivalRestoredRuntimeControls(runtimeState.controls || runtimeState.config || {})
    });
    session.results = createDefaultSurvivalResultsState({
      stats: runtimeState.lastStats ?? record.stats,
      statsPanelModels: runtimeState.statsPanelModels || record.statsPanelModels || record.statsPanels
    });
    session.notes = createDefaultSurvivalNotesState(record.notes || runtimeState.notes || {});
    session.advisor = createDefaultSurvivalAdvisorState(record.advisor || {});
    session.updatedAt = Date.now();
    return session;
  }

  function scheduleSurvivalViewRefresh(reason, extraOptions){
    const options = (extraOptions && typeof extraOptions === 'object') ? extraOptions : {};
    const ownerTabId = normalizeSurvivalOwnerTabId(options.tabId || options.workspaceTabId || options.tab?.id || getSurvivalProjectionTabId() || null);
    const ownerSession = ownerTabId
      ? getSurvivalSession(ownerTabId, { tabId: ownerTabId, reason: reason || options.reason || 'survival-view-refresh' }, { create: false })
      : getActiveSurvivalSessionForState();
    const activeTabId = normalizeSurvivalOwnerTabId(getSurvivalProjectionTabId() || null);
    if(!ownerSession || !ownerTabId || ownerTabId === activeTabId){
      syncSurvivalRuntimeControlsFromDom(ownerSession || getSurvivalProjectionSession({ reason: 'survival-projection-mutation' }));
      syncSurvivalStateToSession(ownerSession || getSurvivalProjectionSession({ reason: 'survival-projection-mutation' }));
    }
    const nextReason = reason || options.reason || 'survival-view-refresh';
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
      tabId: ownerTabId || getSurvivalProjectionTabId() || null,
      reason: nextReason,
      source: 'survival-view-refresh',
      forceDraw: options.force === true,
      userInitiated: options.userInitiated === true || (options.userInitiated !== false && !passiveReason)
    };
    if(Shared.componentLifecycle?.shouldSuppressDraw?.('survival', lifecycleMeta)){
      survivalDebug('Debug: survival view refresh suppressed by lifecycle', { reason: nextReason, tabId: getSurvivalProjectionTabId() || null });
      Shared.componentLifecycle?.emitLifecycleEvent?.({ componentKey: 'survival', tabId: getSurvivalProjectionTabId() || null, action: 'draw-suppressed', reason: nextReason, details: { source: 'survival-view-refresh' } });
      return;
    }
    const scheduleOptions = Object.assign({}, options, {
      viewOnly: true,
      reason: nextReason,
      source: 'survival-view-refresh',
      forceDraw: lifecycleMeta.forceDraw === true,
      userInitiated: lifecycleMeta.userInitiated === true
    });
    scheduleSurvivalDrawForSession(ownerSession || getActiveSurvivalSessionForState(), scheduleOptions);
  }

  function isSurvivalFontStyleEvent(detail){
    const scopeId = detail?.scopeId || null;
    const storeKey = typeof detail?.storeKey === 'string' ? detail.storeKey : '';
    return scopeId === 'survival' || storeKey.startsWith('survival::');
  }

  function ensureSurvivalFontEventListener(){
    if(survivalFontEventBound || !global.document || typeof global.document.addEventListener !== 'function'){
      return;
    }
    global.document.addEventListener('fontControls:styleChanged', event => {
      const detail = event?.detail || {};
      if(!isSurvivalFontStyleEvent(detail)){
        return;
      }
      scheduleSurvivalViewRefresh('font-style-change', { tabId: detail.tabId || null });
    });
    survivalFontEventBound = true;
  }

  function recordSurvivalChange(label, previous, next, apply){
    if(!survivalUndoManager || typeof survivalUndoManager.recordStateChange !== 'function'){
      return;
    }
    if(typeof apply !== 'function'){
      return;
    }
    const recorder = Shared.styleUndo?.recordStateChange || (opts => survivalUndoManager.recordStateChange(opts));
    recorder({
      manager: survivalUndoManager,
      label,
      scope: 'survivalGraphPanel',
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
    syncSurvivalStateToSession(getSurvivalProjectionSession({ reason: 'survival-projection-mutation' }), { gridStyle: state.gridStyle });
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
    logDebug('axis tick interval updated',{ axis, tickInterval: settings[axis].tickInterval });
    syncSurvivalStateToSession(getSurvivalProjectionSession({ reason: 'survival-projection-mutation' }), { axisSettings: settings });
    scheduleActiveSurvivalDraw({ reason: `axis-${axis}-tick-interval`, tabId: getSurvivalProjectionTabId() || null });
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
    logDebug('Debug: survival major tick length updated',{ axis, majorTickLength: nextValue });
    syncSurvivalStateToSession(getSurvivalProjectionSession({ reason: 'survival-projection-mutation' }), { axisSettings: settings });
    scheduleActiveSurvivalDraw({ reason: `axis-${axis}-major-tick-length`, tabId: getSurvivalProjectionTabId() || null });
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
    logDebug('axis minor ticks updated',{ axis, enabled: nextValue });
    syncSurvivalStateToSession(getSurvivalProjectionSession({ reason: 'survival-projection-mutation' }), { axisSettings: settings });
    scheduleActiveSurvivalDraw({ reason: `axis-${axis}-minor-ticks`, tabId: getSurvivalProjectionTabId() || null });
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
    logDebug('axis minor tick subdivisions updated',{ axis, subdivisions: nextValue });
    syncSurvivalStateToSession(getSurvivalProjectionSession({ reason: 'survival-projection-mutation' }), { axisSettings: settings });
    scheduleActiveSurvivalDraw({ reason: `axis-${axis}-minor-subdivisions`, tabId: getSurvivalProjectionTabId() || null });
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
    logDebug('axis stroke width updated',{ strokeWidth: settings.strokeWidth });
    const ownerSession = getSurvivalProjectionSession({ reason: 'survival-axis-stroke-width' });
    const tabId = ownerSession?.tabId || getSurvivalProjectionTabId() || null;
    syncSurvivalStateToSession(ownerSession, { axisSettings: settings });
    const svg = getSurvivalNodeById('survivalSvg', tabId) || getSurvivalNodeById('survivalSvg');
    const projected = Shared.visualProjection?.apply?.(svg, {
      component: 'survival',
      channel: 'axis',
      tabId,
      attributes: { strokeWidth: settings.strokeWidth }
    });
    if(!projected){
      scheduleSurvivalViewRefresh('axis-stroke-width', { tabId });
    }
  }

  function getAxisColor(){
    return ensureAxisSettings().color || DEFAULT_AXIS_COLOR;
  }

  function updateAxisColor(value){
    const settings = ensureAxisSettings();
    settings.color = typeof value === 'string' && value.trim() ? value : DEFAULT_AXIS_COLOR;
    logDebug('axis color updated',{ color: settings.color });
    const ownerSession = getSurvivalProjectionSession({ reason: 'survival-axis-color' });
    const tabId = ownerSession?.tabId || getSurvivalProjectionTabId() || null;
    syncSurvivalStateToSession(ownerSession, { axisSettings: settings });
    const svg = getSurvivalNodeById('survivalSvg', tabId) || getSurvivalNodeById('survivalSvg');
    const projected = Shared.visualProjection?.apply?.(svg, {
      component: 'survival',
      channel: 'axis',
      tabId,
      attributes: { stroke: settings.color }
    });
    if(!projected){
      scheduleSurvivalViewRefresh('axis-color', { tabId });
    }
  }

  function registerSurvivalGridControlTarget(target, options){
    if(!target || !gridControls || typeof gridControls.registerGraphElement !== 'function'){
      return;
    }
    const opts = options && typeof options === 'object' ? options : {};
    const fallbackThickness = Number.isFinite(Number(opts.fallbackThickness)) ? Number(opts.fallbackThickness) : getAxisStrokeWidthBase();
    gridControls.registerGraphElement(target, {
      scopeId: 'survival',
      getVisible: () => !!refs.showGrid?.checked,
      onVisibleChange: value => {
        if(refs.showGrid){
          refs.showGrid.checked = !!value;
        }
        syncSurvivalRuntimeControlsFromDom();
        syncSurvivalStateToSession(getSurvivalProjectionSession({ reason: 'survival-projection-mutation' }), { controls: state.controls });
        scheduleActiveSurvivalDraw({ reason: 'grid-visible-change', tabId: getSurvivalProjectionTabId() || null });
      },
      getStyle: () => getGridStyle(fallbackThickness),
      onStyleChange: style => {
        setGridStyle(style, fallbackThickness);
        if(!gridControls.applyStyleToTarget?.(target, getGridStyle(fallbackThickness), {
          defaults: createDefaultGridStyle(fallbackThickness)
        })){
          scheduleSurvivalViewRefresh('grid-style-change', { tabId: getSurvivalProjectionTabId() || null });
        }
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
    logDebug('axis settings applied',{ settings: state.axisSettings });
    syncSurvivalStateToSession(getSurvivalProjectionSession({ reason: 'survival-projection-mutation' }), { axisSettings: state.axisSettings });
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
    logDebug('manual ticks computed',{ interval, tickCount: ticks.length, min: graphMin, max: graphMax });
    return { min: graphMin, max: graphMax, ticks };
  }

  const refs = {};
  function createDefaultSurvivalRuntimeControls(){
    return {
      showCI: false,
      showCensor: true,
      showRiskTable: false,
      showPlotStats: false,
      showHazardRatios: true,
      fitCoxModel: true,
      showGrid: false,
      showFrame: false,
      showLegend: true,
      timeMax: '',
      fontSize: '12',
      xLabel: 'Time',
      yLabel: 'Survival Probability'
    };
  }

  function normalizeSurvivalRuntimeControls(source = {}){
    const defaults = createDefaultSurvivalRuntimeControls();
    const src = source && typeof source === 'object' ? source : {};
    return {
      showCI: Object.prototype.hasOwnProperty.call(src, 'showCI') ? !!src.showCI : defaults.showCI,
      showCensor: Object.prototype.hasOwnProperty.call(src, 'showCensor') ? !!src.showCensor : defaults.showCensor,
      showRiskTable: Object.prototype.hasOwnProperty.call(src, 'showRiskTable') ? !!src.showRiskTable : defaults.showRiskTable,
      showPlotStats: Object.prototype.hasOwnProperty.call(src, 'showPlotStats') ? !!src.showPlotStats : defaults.showPlotStats,
      showHazardRatios: Object.prototype.hasOwnProperty.call(src, 'showHazardRatios') ? !!src.showHazardRatios : defaults.showHazardRatios,
      fitCoxModel: Object.prototype.hasOwnProperty.call(src, 'fitCoxModel') ? !!src.fitCoxModel : defaults.fitCoxModel,
      showGrid: Object.prototype.hasOwnProperty.call(src, 'showGrid') ? !!src.showGrid : defaults.showGrid,
      showFrame: Object.prototype.hasOwnProperty.call(src, 'showFrame') ? !!src.showFrame : defaults.showFrame,
      showLegend: Object.prototype.hasOwnProperty.call(src, 'showLegend') ? src.showLegend !== false : defaults.showLegend,
      timeMax: src.timeMax != null ? String(src.timeMax) : defaults.timeMax,
      fontSize: src.fontSize != null ? String(src.fontSize) : defaults.fontSize,
      xLabel: src.xLabel != null ? String(src.xLabel) : defaults.xLabel,
      yLabel: src.yLabel != null ? String(src.yLabel) : defaults.yLabel
    };
  }

  function normalizeSurvivalRestoredRuntimeControls(source = {}){
    const restored = source && typeof source === 'object' ? (cloneSimple(source) || {}) : {};
    // Preserve historical figures when controls are absent from older snapshots.
    // New workspaces use the defaults from createDefaultSurvivalRuntimeControls().
    if(!Object.prototype.hasOwnProperty.call(restored, 'showRiskTable')){
      restored.showRiskTable = false;
    }
    if(!Object.prototype.hasOwnProperty.call(restored, 'showPlotStats')){
      restored.showPlotStats = false;
    }
    if(!Object.prototype.hasOwnProperty.call(restored, 'showLegend')){
      restored.showLegend = true;
    }
    return normalizeSurvivalRuntimeControls(restored);
  }

  function syncSurvivalRuntimeControlsFromDom(session = null){
    state.controls = normalizeSurvivalRuntimeControls({
      ...(state.controls || {}),
      showCI: refs.showCI ? !!refs.showCI.checked : state.controls?.showCI,
      showCensor: refs.showCensor ? !!refs.showCensor.checked : state.controls?.showCensor,
      showRiskTable: refs.showRiskTable ? !!refs.showRiskTable.checked : state.controls?.showRiskTable,
      showPlotStats: refs.showPlotStats ? !!refs.showPlotStats.checked : state.controls?.showPlotStats,
      showHazardRatios: refs.showHazardRatios ? !!refs.showHazardRatios.checked : state.controls?.showHazardRatios,
      fitCoxModel: refs.fitCoxModel ? !!refs.fitCoxModel.checked : state.controls?.fitCoxModel,
      showGrid: refs.showGrid ? !!refs.showGrid.checked : state.controls?.showGrid,
      showFrame: refs.showFrame ? !!refs.showFrame.checked : state.controls?.showFrame,
      showLegend: refs.showLegend ? !!refs.showLegend.checked : state.controls?.showLegend,
      timeMax: refs.timeMax ? refs.timeMax.value : state.controls?.timeMax,
      fontSize: refs.fontSize ? refs.fontSize.value : state.controls?.fontSize,
      xLabel: state.controls?.xLabel,
      yLabel: state.controls?.yLabel
    });
    const ownerSession = ensureSurvivalSessionOwnershipShape(session || getActiveSurvivalSessionForState());
    if(ownerSession?.state){
      ownerSession.state.controls = cloneSimple(state.controls) || createDefaultSurvivalRuntimeControls();
      ownerSession.updatedAt = Date.now();
    }
    return state.controls;
  }

  function resolveSurvivalRoot(tabLike){
    return Shared.workspaceTabs?.resolveComponentRoot?.({
      tabLike: tabLike || null,
      componentKey: 'survival',
      currentRoot: refs.root,
      staticRootId: 'survivalPage'
    }) || null;
  }

  function getSurvivalNodeById(id, tabLike){
    if(!id){
      return null;
    }
    const root = resolveSurvivalRoot(tabLike);
    if(root?.getElementById){
      const byId = root.getElementById(id);
      if(byId){
        return byId;
      }
    }
    return root?.querySelector?.(`#${id}`) || null;
  }

  function resolveSurvivalDrawableFrame(plotEl){
    const plot = plotEl || refs.plotDiv || getSurvivalNodeById('survivalPlot');
    const svgBox = refs.svgBox
      || state.layout?.elements?.svgBox
      || plot?.closest?.('.svgbox')
      || resolveSurvivalRoot()?.querySelector?.('#survivalGraphPanel .svgbox')
      || null;
    const frame = Shared.componentLayout?.resolveDrawableFrame?.({
      componentName: 'survival',
      plot,
      svgBox,
      graphPanel: refs.graphPanel || resolveSurvivalRoot()?.querySelector?.('#survivalGraphPanel')
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
  function resolveSurvivalStatsPanelContext(session = null){
    const owner = ensureSurvivalSessionOwnershipShape(session || getActiveSurvivalSessionForState());
    const canUseLiveProjection = !owner || isSurvivalSessionActive(owner);
    const root = owner?.root || null;
    const belongsToOwner = node => !!node && (!root || node === root || root.contains?.(node));
    const resolveTarget = (refKey, id) => {
      if(!canUseLiveProjection){ return null; }
      const ownedRef = owner?.refs?.[refKey] || null;
      if(belongsToOwner(ownedRef)){ return ownedRef; }
      const resolved = getSurvivalNodeById(id, owner?.tabId || null);
      return belongsToOwner(resolved) ? resolved : null;
    };
    return {
      owner,
      canUseLiveProjection,
      summary: resolveTarget('statsSummary', 'survivalStatsSummary'),
      logRank: resolveTarget('statsLogRank', 'survivalStatsLogRank'),
      hazardRatios: resolveTarget('statsHazardRatios', 'survivalStatsHazardRatios'),
      cox: resolveTarget('statsCox', 'survivalStatsCox')
    };
  }

  function ensureSurvivalCoxReportHost(session = null, targetOverride = null){
    const context = resolveSurvivalStatsPanelContext(session);
    const target = targetOverride || context.cox;
    const reporting = Shared.statsReporting;
    if(!target || !reporting || typeof reporting.ensureReportHost !== 'function'){
      return target?.__statsReportHost || null;
    }
    const host = reporting.ensureReportHost(target, {
      id: 'survivalStatsReportHost',
      className: 'stats-report-host',
      attachToTarget: false,
      position: 'last'
    });
    target.__statsReportHost = host || null;
    return host;
  }
  function clearSurvivalStatsReportHost(target){
    const reporting = Shared.statsReporting;
    if(reporting && typeof reporting.clearReportHost === 'function'){
      reporting.clearReportHost(target);
    }
  }

  function normalizeSurvivalStatsPanelModel(source = {}){
    if(Shared.statsReporting && typeof Shared.statsReporting.normalizeSavedPanelModel === 'function'){
      return Shared.statsReporting.normalizeSavedPanelModel(source);
    }
    const src = source && typeof source === 'object' ? source : {};
    return { resultsModel: cloneSimple(src.resultsModel) || null, reportModel: cloneSimple(src.reportModel) || null };
  }

  function survivalStatsPanelNodeText(node){
    if(!node || typeof node !== 'object'){ return ''; }
    const own = node.type === 'text' ? String(node.text || '') : '';
    const children = Array.isArray(node.children) ? node.children.map(survivalStatsPanelNodeText).join(' ') : '';
    return `${own} ${children}`.trim();
  }

  function survivalStatsPanelNodeHasStatContent(node){
    if(!node || typeof node !== 'object'){ return false; }
    if(node.kind === 'stats-report' || node.type === 'stats-table'){ return true; }
    const className = typeof node.className === 'string' ? node.className : '';
    if(/(?:^|\s)(?:stats-table-card|stats-report-panel|stats-assumption-container)(?:\s|$)/.test(className)){ return true; }
    if(/(?:^|\s)stats-table-lead(?:\s|$)/.test(className)){
      const text = survivalStatsPanelNodeText(node);
      const placeholder = /^(?:enter at least one group|log-rank test results will appear|enable [“"']?show hazard ratios|enable [“"']?fit cox model)/i;
      return !!text && !placeholder.test(text);
    }
    return Array.isArray(node.children) && node.children.some(survivalStatsPanelNodeHasStatContent);
  }

  function survivalStatsPanelModelHasContent(model){
    const normalized = normalizeSurvivalStatsPanelModel(model);
    return survivalStatsPanelNodeHasStatContent(normalized.resultsModel)
      || survivalStatsPanelNodeHasStatContent(normalized.reportModel);
  }

  function captureSurvivalStatsPanel(target, fallback = null){
    const previous = normalizeSurvivalStatsPanelModel(fallback || {});
    if(!target || !Shared.statsReporting || typeof Shared.statsReporting.capturePanelModel !== 'function'){
      return previous;
    }
    const captured = normalizeSurvivalStatsPanelModel(Shared.statsReporting.capturePanelModel(target) || {});
    return survivalStatsPanelModelHasContent(captured) ? captured : previous;
  }

  function captureSurvivalStatsPanelModels(fallback = null, session = null){
    const context = resolveSurvivalStatsPanelContext(session);
    const owner = context.owner;
    const previous = createDefaultSurvivalStatsPanelModels(
      fallback
      || owner?.results?.statsPanelModels
      || owner?.state?.statsPanelModels
      || (context.canUseLiveProjection ? state.statsPanelModels : null)
      || {}
    );
    const normalized = context.canUseLiveProjection ? {
      summary: captureSurvivalStatsPanel(context.summary, previous.summary),
      logRank: captureSurvivalStatsPanel(context.logRank, previous.logRank),
      hazardRatios: captureSurvivalStatsPanel(context.hazardRatios, previous.hazardRatios),
      cox: captureSurvivalStatsPanel(context.cox, previous.cox)
    } : previous;
    const next = createDefaultSurvivalStatsPanelModels(normalized);
    if(owner){
      owner.state.statsPanelModels = createDefaultSurvivalStatsPanelModels(next);
      owner.results = createDefaultSurvivalResultsState({ stats: owner.results?.stats ?? owner.state?.lastStats ?? null, statsPanelModels: next });
      owner.updatedAt = Date.now();
    }
    if(context.canUseLiveProjection){
      state.statsPanelModels = createDefaultSurvivalStatsPanelModels(next);
    }
    return cloneSimple(next) || next;
  }

  function restoreSurvivalStatsPanel(target, model, options = {}){
    const normalized = normalizeSurvivalStatsPanelModel(model);
    if(!target || !survivalStatsPanelModelHasContent(normalized) || !Shared.statsReporting || typeof Shared.statsReporting.restorePanelModel !== 'function'){
      return false;
    }
    const reportHost = options.ensureReportHost ? options.ensureReportHost() : null;
    const restored = Shared.statsReporting.restorePanelModel(target, normalized, {
      ensureReportHost: reportHost ? () => reportHost : undefined,
      clearMainWhenMissing: false
    });
    return !!(restored?.restoredMain || restored?.restoredReport || target.querySelector?.('.stats-table-card, .stats-report-panel, table'));
  }

  function restoreSurvivalStatsPanelModels(models, session = null){
    const context = resolveSurvivalStatsPanelContext(session);
    const source = createDefaultSurvivalStatsPanelModels(models || {});
    if(context.owner){
      context.owner.state.statsPanelModels = createDefaultSurvivalStatsPanelModels(source);
      context.owner.results = createDefaultSurvivalResultsState({ stats: context.owner.results?.stats ?? context.owner.state?.lastStats ?? null, statsPanelModels: source });
      context.owner.updatedAt = Date.now();
    }
    if(!context.canUseLiveProjection){
      return false;
    }
    let restored = false;
    restored = restoreSurvivalStatsPanel(context.summary, source.summary) || restored;
    restored = restoreSurvivalStatsPanel(context.logRank, source.logRank) || restored;
    restored = restoreSurvivalStatsPanel(context.hazardRatios, source.hazardRatios) || restored;
    restored = restoreSurvivalStatsPanel(context.cox, source.cox, {
      ensureReportHost: () => ensureSurvivalCoxReportHost(context.owner, context.cox)
    }) || restored;
    state.statsPanelModels = createDefaultSurvivalStatsPanelModels(source);
    return restored;
  }
  let survivalLegendControl = null;

  function ensureSurvivalLegendControlPlacement(){
    if(!survivalLegendControl || !refs.svgBox){
      return;
    }
    if(Shared.resizer && typeof Shared.resizer.ensureLegendControlPlacement === 'function'){
      Shared.resizer.ensureLegendControlPlacement({
        svgBox: refs.svgBox,
        control: survivalLegendControl,
        debugLabel: 'survival-legend'
      });
    }
  }

  let parseDebugCounter = 0;

  const survivalAdvisorState = {
    open: false,
    activated: false,
    answers: {},
    lastApplied: null,
    context: null
  };

  function getSurvivalAdvisorState(session = null){
    const shaped = ensureSurvivalSessionOwnershipShape(session || getActiveSurvivalSessionForState());
    if(shaped){
      shaped.advisor = createDefaultSurvivalAdvisorState(shaped.advisor || {});
      return shaped.advisor;
    }
    Object.assign(survivalAdvisorState, createDefaultSurvivalAdvisorState(survivalAdvisorState));
    return survivalAdvisorState;
  }

  function setSurvivalAdvisorState(value, session = null){
    const next = createDefaultSurvivalAdvisorState(value || {});
    const shaped = ensureSurvivalSessionOwnershipShape(session || getActiveSurvivalSessionForState());
    if(shaped){
      shaped.advisor = next;
      shaped.updatedAt = Date.now();
    }
    if(!shaped || isSurvivalSessionActive(shaped)){
      Object.assign(survivalAdvisorState, next);
    }
    return next;
  }

  function persistSurvivalStatsTabState(reason, session = null){
    const owner = ensureSurvivalSessionOwnershipShape(session || getActiveSurvivalSessionForState());
    const tabId = String(owner?.tabId || getSurvivalProjectionTabId() || '').trim();
    if(!tabId){
      return false;
    }
    return Shared.componentLifecycle?.persistOwnedUserState?.(
      'survival',
      { tabId, session: owner },
      { reason: reason || 'survival-stats-state-change' }
    ) === true;
  }

  function $(selector){
    return resolveSurvivalRoot()?.querySelector?.(selector) || null;
  }

  function logDebug(message, payload){
    try {
      survivalDebug(`Debug: survival ${message}`, payload || {});
    } catch (err) {
      // Avoid throwing inside logging helpers.
    }
  }

  function ensureElements(){
    refs.tablePanel = $('#survivalTablePanel');
    refs.graphPanel = $('#survivalGraphPanel');
    refs.panelResizer = $('#survivalPanelResizer');
    refs.svgBox = refs.graphPanel?.querySelector('.svgbox') || null;
    refs.configPanel = refs.graphPanel?.querySelector('.config-panel') || null;
    refs.plotDiv = $('#survivalPlot');
    refs.hotWrapper = $('#survivalHotWrapper');
    refs.hotContainer = $('#survivalHot');
    refs.statsSummary = $('#survivalStatsSummary');
    refs.statsPValueFormat = $('#survivalStatsPValueFormat');
    refs.statsLogRank = $('#survivalStatsLogRank');
    refs.statsHazardRatios = $('#survivalStatsHazardRatios');
    refs.statsCox = $('#survivalStatsCox');
    ensureSurvivalCoxReportHost();
    attachSurvivalStatsPValueControlFactory();
    ensureSurvivalStatsInferenceControls();
    refs.labelColorsDiv = $('#survivalLabelColors');
    refs.labelColorsFieldset = $('#survivalLabelColorsFieldset');
    refs.showCI = $('#survivalShowCI');
    refs.showCensor = $('#survivalShowCensor');
    refs.showRiskTable = $('#survivalShowRiskTable');
    refs.showPlotStats = $('#survivalShowPlotStats');
    refs.showHazardRatios = $('#survivalShowHazardRatios');
    refs.fitCoxModel = $('#survivalFitCox');
    refs.covariateControls = $('#survivalCovariateControls');
    refs.covariateHint = $('#survivalCovariateHint');
    refs.showGrid = $('#survivalShowGrid');
    refs.showFrame = $('#survivalShowFrame');
    refs.timeMax = $('#survivalTimeMax');
    refs.fontSize = $('#survivalFontSize');
    refs.fontSizeVal = $('#survivalFontSizeVal');
    refs.showLegend = $('#survivalShowLegend');
    if(refs.showLegend){
      const legendHost = refs.showLegend.closest('label');
      if(legendHost){
        survivalLegendControl = legendHost;
        ensureSurvivalLegendControlPlacement();
      }
    }
    refs.loadExampleBtn = $('#survivalLoadExample');
    refs.importBtn = $('#survivalImport');
    refs.fileInput = $('#survivalFile');
    refs.openBtn = $('#openSurvivalGraph');
    refs.saveBtn = $('#saveSurvivalGraph');
    refs.saveAsBtn = $('#saveAsSurvival');
    refs.graphFileInput = $('#survivalGraphFile');
    refs.exportContainer = $('#survivalExportControls');
    return !!(refs.tablePanel && refs.graphPanel && refs.hotContainer && refs.plotDiv);
  }

  const markFontEditable = (node, role, key, tabId = null) => {
    if(!node){ return; }
    const payload = { role: role || null, key: key || role || null, tabId: tabId || null, text: node?.textContent || null };
    if(fontControls && typeof fontControls.markText === 'function'){
      fontControls.markText(node, { scopeId: 'survival', role, key, tabId });
    } else if(node.dataset){
      node.dataset.fontEditable = '1';
      node.dataset.fontScope = 'survival';
      if(role){ node.dataset.fontRole = role; }
      if(key || role){ node.dataset.fontKey = key || role; }
    }
    if(role && role.includes('Tick')){ return; }
    logDebug('font mark applied', payload);
  };

  function initHot(){
    const createSurvivalTable = (container) => {
      const baseData = Shared.createEmptyData(DEFAULT_ROWS, SURVIVAL_DEFAULT_COLS);
      logDebug('initHot table schema', { firstRowIsHeader: false, columns: SURVIVAL_DEFAULT_COLS, headers: SURVIVAL_COL_HEADERS });
      return Shared.hot.createStandardTable(container, { rows: DEFAULT_ROWS, cols: SURVIVAL_DEFAULT_COLS }, () => {
        logDebug('table scheduled redraw');
        scheduleActiveSurvivalDraw({ reason: 'survival-table-change', tabId: getSurvivalProjectionTabId() || null });
      }, {
        debugLabel: 'survival',
        data: baseData,
        firstRowIsHeader: false,
        scheduleOnLoadData: true,
        hotOptions: {
          stretchH: 'all',
          contextMenu: true,
          colHeaders: SURVIVAL_COL_HEADERS.slice(),
          afterChange(changes, source){
            if(changes){
              logDebug('table afterChange', { count: changes.length, source });
            }
            if(source !== 'loadData'){
              refreshCovariateControls();
            }
          }
        }
      });
    };
    const ensureSurvivalHotForActiveTab = () => {
      const wrapper = $('#survivalHotWrapper');
      const baseContainer = refs.hotContainer || $('#survivalHot');
      const tableTabId = Shared.hot?.resolveTableTabId?.({
        type: 'survival',
        component: survival,
        wrapper,
        container: baseContainer,
        reason: 'survival-ensure-hot'
      }) || null;
      if(!baseContainer || typeof Shared.hot?.ensureTableForTab !== 'function'){
        if(!state.hot && baseContainer){
          state.hot = createSurvivalTable(baseContainer);
        }
        ensureSurvivalDataViewsForHot(state.hot, {
          wrapper,
          container: state.hot?.__survivalHostContainer || baseContainer
        });
        return state.hot;
      }
      const entry = Shared.hot.ensureTableForTab({
        type: 'survival',
        tabId: tableTabId,
        wrapper,
        container: baseContainer,
        createInstance: createSurvivalTable
      });
      if(entry?.instance){
        state.hot = entry.instance;
        refs.hotContainer = entry.container || baseContainer;
      }
      if(state.hot && tableTabId){
        state.hot.__survivalTabId = tableTabId;
        state.hot.__workspaceTabId = state.hot.__workspaceTabId || tableTabId;
      }
      ensureSurvivalDataViewsForHot(state.hot, {
        wrapper,
        container: state.hot?.__survivalHostContainer || refs.hotContainer || baseContainer
      });
      return state.hot;
    };
    state.hot = ensureSurvivalHotForActiveTab();
    state.ensureHotForActiveTab = ensureSurvivalHotForActiveTab;
    const activeSession = getActiveSurvivalSessionForState();
    if(activeSession?.managers){
      activeSession.managers.hot = state.hot || null;
    }
    ensureSurvivalDataViewsForHot(state.hot, {
      wrapper: $('#survivalHotWrapper'),
      container: state.hot?.__survivalHostContainer || refs.hotContainer || $('#survivalHot')
    });
    syncSurvivalSessionManagersFromActive(activeSession);
    logDebug('Grid initialized', { hasHot: !!state.hot });
    refreshCovariateControls();
  }

  function ensureSurvivalDataViewsForHot(hotInstance, options = {}){
    const ownerTabId = normalizeSurvivalOwnerTabId(
      options.tabId
      || resolveSurvivalHotOwnerTabId(hotInstance)
      || hotInstance?.__survivalTabId
      || hotInstance?.__workspaceTabId
      || getSurvivalProjectionTabId()
      || ''
    );
    const hostWrapper = options.wrapper || $('#survivalHotWrapper');
    const hostContainer = options.container || hotInstance?.__survivalHostContainer || refs.hotContainer || $('#survivalHot');
    const manager = Shared.componentLifecycle?.ensureOwnedDataViewsManager?.({
      hotInstance,
      componentKey: 'survival',
      managerField: '__survivalDataViewsManager',
      ownerTabId,
      hostContainerField: '__survivalHostContainer',
      wrapper: hostWrapper,
      container: hostContainer,
      createOptions: {
        componentKey: 'survival',
        maxViews: SURVIVAL_DATA_VIEW_MAX,
        initialData: hotInstance?.getData?.() || [],
        onActiveViewChanged(view, meta){
          if(!view || !hotInstance || typeof hotInstance.loadData !== 'function'){
            return;
          }
          Shared.dataViews.applyViewToTable(hotInstance, view, {
            loadOptions: { source: 'survival-data-view-switch' },
            exclusionSource: 'survival-data-view-switch',
            filterReason: 'survival-data-view-switch'
          });
          const scheduledTabId = resolveSurvivalHotOwnerTabId(hotInstance) || ownerTabId || getSurvivalProjectionTabId() || null;
          const scheduledSession = getSurvivalSession(scheduledTabId, {
            tabId: scheduledTabId,
            reason: 'survival-data-view-switch'
          }, { create: false, fallbackActive: true });
          const activeTabId = normalizeSurvivalOwnerTabId(getSurvivalProjectionTabId() || null);
          const scheduler = scheduledSession?.timers?.scheduleDraw
            || (!scheduledTabId || scheduledTabId === activeTabId ? state.scheduleDraw : null);
          scheduler?.({
            reason: 'data-view-switch',
            tabId: scheduledTabId || null,
            userInitiated: String(meta?.reason || '').trim().toLowerCase() === 'tab-click'
          });
        },
        onInteraction(){
          Shared.workspaceToolbar?.activateSection?.('survival', 'Data');
        }
      },
      onCreated(){
        logDebug('data views manager created');
      }
    });
    if(!manager){
      return null;
    }
    const managerSession = getSurvivalSession(resolveSurvivalHotOwnerTabId(hotInstance) || ownerTabId || getSurvivalProjectionTabId() || null, {
      reason: 'survival-data-views-manager'
    }, { create: true }) || getActiveSurvivalSessionForState();
    if(managerSession?.managers){
      managerSession.managers.hot = hotInstance;
      managerSession.managers.dataViews = survivalDataViewsManagerBelongsToSession(manager, managerSession) ? manager : managerSession.managers.dataViews || null;
      managerSession.updatedAt = Date.now();
    }
    return manager;
  }

  function syncSurvivalActiveDataViewFromHot(hotInstance, reason){
    const hot = hotInstance || state.hot;
    if(!hot || typeof hot.getData !== 'function'){
      return;
    }
    const ownerTabId = resolveSurvivalHotOwnerTabId(hot);
    const ownerSession = ownerTabId
      ? getSurvivalSession(ownerTabId, { tabId: ownerTabId, reason: reason || 'survival-active-data-view-sync' }, { create: false, fallbackActive: true })
      : null;
    const attachedManager = hot.__survivalDataViewsManager || null;
    const manager = survivalDataViewsManagerBelongsToSession(attachedManager, ownerSession)
      ? attachedManager
      : (survivalDataViewsManagerBelongsToSession(ownerSession?.managers?.dataViews || null, ownerSession)
        ? ownerSession.managers.dataViews
        : null);
    Shared.componentLifecycle?.refreshOwnedDataViewsManagerFromHot?.({
      hotInstance: hot,
      componentKey: 'survival',
      managerField: '__survivalDataViewsManager',
      manager,
      session: ownerSession,
      belongsToSession: survivalDataViewsManagerBelongsToSession,
      reason
    });
  }

  function buildSurvivalAdvisorContext(summary, overrides){
    const safeSummary = summary && typeof summary === 'object' ? summary : {};
    const series = Array.isArray(safeSummary.series) ? safeSummary.series : [];
    const covariateColumns = Array.isArray(safeSummary.covariateColumns)
      ? safeSummary.covariateColumns
      : (Array.isArray(state.covariateColumns) ? state.covariateColumns : []);
    const totals = series.map(group => Number.isFinite(group.total) ? group.total : 0);
    const events = series.map(group => Number.isFinite(group.events) ? group.events : 0);
    const censored = series.map(group => Number.isFinite(group.censored) ? group.censored : 0);
    const totalParticipants = totals.reduce((acc, value) => acc + value, 0);
    const totalEvents = events.reduce((acc, value) => acc + value, 0);
    const zeroEventGroups = series.filter(group => (group.events || 0) === 0).map(group => group.name);
    const enabledCovariates = Object.entries(state.covariateSettings || {}).filter(([, cfg]) => cfg && cfg.enabled);
    const enabledBaseline = enabledCovariates.filter(([, cfg]) => (cfg.type || 'baseline') !== 'time').length;
    const enabledTime = enabledCovariates.filter(([, cfg]) => cfg.type === 'time').length;
    const context = {
      summary: safeSummary,
      groupCount: series.length,
      totals,
      events,
      censored,
      totalParticipants,
      totalEvents,
      zeroEventGroups,
      hasCensoring: censored.some(value => value > 0),
      medianReachedCount: series.filter(group => group?.km?.median != null).length,
      covariateCount: covariateColumns.length,
      enabledCovariateCount: enabledCovariates.length,
      enabledBaselineCovariates: enabledBaseline,
      enabledTimeCovariates: enabledTime,
      hazardRatiosEnabled: !!refs.showHazardRatios?.checked,
      coxEnabled: !!refs.fitCoxModel?.checked,
      coxAnalysisActive: !!refs.showHazardRatios?.checked || !!refs.fitCoxModel?.checked,
      hasLogRank: !!safeSummary?.logRank?.available,
      maxTime: Number.isFinite(safeSummary?.maxTime) ? safeSummary.maxTime : 0,
      supportsTimeDependent: !!safeSummary?.supportsTimeDependent,
      ...overrides
    };
    logDebug('advisor context built', {
      groupCount: context.groupCount,
      covariateCount: context.covariateCount,
      enabledCovariateCount: context.enabledCovariateCount,
      hazardRatiosEnabled: context.hazardRatiosEnabled,
      coxEnabled: context.coxEnabled,
      totalParticipants: context.totalParticipants
    });
    return context;
  }

  function ensureSurvivalAdvisorDefaults(context, advisorState = getSurvivalAdvisorState()){
    if(!advisorState.answers || typeof advisorState.answers !== 'object'){
      advisorState.answers = {};
    }
    const answers = advisorState.answers;
    if(!answers.analysisFocus){
      answers.analysisFocus = context.groupCount >= 2 ? 'compare' : 'describe';
    }
    if(answers.analysisFocus === 'compare' && !answers.comparisonDetail){
      answers.comparisonDetail = context.groupCount >= 2 ? 'hazardRatios' : 'logRankOnly';
    }
    if(answers.analysisFocus === 'adjust' && !answers.covariateStrategy){
      if(context.supportsTimeDependent && context.enabledTimeCovariates > 0){
        answers.covariateStrategy = 'timeDependent';
      } else if(context.enabledBaselineCovariates > 0 || context.covariateCount > 0){
        answers.covariateStrategy = 'baseline';
      } else {
        answers.covariateStrategy = 'none';
      }
    }
    if(answers.covariateStrategy === 'timeDependent' && !context.supportsTimeDependent){
      answers.covariateStrategy = context.covariateCount > 0 ? 'baseline' : 'none';
    }
    return answers;
  }

  function buildSurvivalAdvisorQuestions(context, advisorState = getSurvivalAdvisorState()){
    const answers = ensureSurvivalAdvisorDefaults(context, advisorState);
    const questions = [
      {
        id: 'analysisFocus',
        prompt: 'What is your primary survival analysis goal?',
        help: 'Choose whether you want to describe a single curve, compare groups, or adjust for covariates.',
        options: [
          { value: 'describe', label: 'Describe Kaplan–Meier survival for the groups' },
          { value: 'compare', label: 'Compare survival between groups' },
          { value: 'adjust', label: 'Adjust for covariates with a Cox model' }
        ]
      }
    ];
    if(answers.analysisFocus === 'compare'){
      questions.push({
        id: 'comparisonDetail',
        prompt: 'How much detail do you need when comparing groups?',
        help: 'Pairwise hazard ratios complement the overall log-rank test.',
        options: [
          { value: 'logRankOnly', label: 'Use the overall log-rank test only' },
          { value: 'hazardRatios', label: 'Add pairwise hazard ratios between groups' }
        ]
      });
    }
    if(answers.analysisFocus === 'adjust'){
      const covariateOptions = [
        { value: 'baseline', label: 'Baseline predictors only' }
      ];
      if(context.supportsTimeDependent){
        covariateOptions.push({ value: 'timeDependent', label: 'Include time-dependent covariates' });
      }
      covariateOptions.push({ value: 'none', label: 'No covariates yet—fit the Cox model for groups only' });
      questions.push({
        id: 'covariateStrategy',
        prompt: 'How will you model covariates?',
        help: context.supportsTimeDependent
          ? 'Check covariate columns below to include them in the Cox model. Use time-dependent covariates only when Entry Time defines interval starts.'
          : 'Check covariate columns below to include them in the Cox model. Time-dependent covariates become available when Entry Time contains interval starts.',
        options: covariateOptions
      });
    }
    return questions;
  }

  function computeSurvivalAdvisorRecommendation(answers, context){
    const recommendation = {
      ready: false,
      message: '',
      summary: '',
      rationale: [],
      warnings: [],
      showHazardRatios: context.hazardRatiosEnabled,
      fitCoxModel: context.coxEnabled
    };
    if(context.groupCount === 0){
      recommendation.message = 'Enter at least one group with follow-up times to enable recommendations.';
      return recommendation;
    }
    if(!answers.analysisFocus ||
      (answers.analysisFocus === 'compare' && !answers.comparisonDetail) ||
      (answers.analysisFocus === 'adjust' && !answers.covariateStrategy)){
      recommendation.message = 'Answer the advisor questions to receive a recommendation.';
      return recommendation;
    }
    if(context.groupCount < 2 && answers.analysisFocus === 'compare'){
      recommendation.message = 'Provide at least two groups to compare survival.';
      return recommendation;
    }
    if(context.groupCount < 2 && answers.analysisFocus === 'adjust' && context.enabledCovariateCount === 0 && context.covariateCount === 0){
      recommendation.message = 'Provide at least two groups or add covariates before fitting a Cox model.';
      return recommendation;
    }
    switch(answers.analysisFocus){
      case 'describe':
        recommendation.showHazardRatios = false;
        recommendation.fitCoxModel = false;
        recommendation.summary = 'Focus on Kaplan–Meier curves with the log-rank test for overall differences.';
        recommendation.rationale.push('Disabling hazard ratios and Cox modeling keeps the emphasis on visual survival patterns.');
        if(context.groupCount >= 2 && !context.hasLogRank){
          recommendation.warnings.push('Provide more complete data to enable the log-rank comparison between groups.');
        }
        break;
      case 'compare':
        if(answers.comparisonDetail === 'hazardRatios'){
          recommendation.showHazardRatios = true;
          recommendation.fitCoxModel = false;
          recommendation.summary = 'Use the log-rank test and display pairwise hazard ratios between groups.';
          recommendation.rationale.push('Hazard ratios quantify the magnitude of survival differences between every pair of groups.');
        } else {
          recommendation.showHazardRatios = false;
          recommendation.fitCoxModel = false;
          recommendation.summary = 'Rely on the log-rank test without the hazard ratio table.';
          recommendation.rationale.push('The log-rank test compares survival curves without estimating pairwise hazard ratios.');
        }
        if(context.zeroEventGroups.length){
          recommendation.warnings.push(`Group${context.zeroEventGroups.length > 1 ? 's' : ''} ${context.zeroEventGroups.join(', ')} ha${context.zeroEventGroups.length > 1 ? 've' : 's'} zero events; hazard ratios may be unstable.`);
        }
        if(context.totalEvents < context.groupCount){
          recommendation.warnings.push('Few observed events relative to group count can weaken both log-rank and hazard ratio estimates.');
        }
        break;
      case 'adjust':
        recommendation.fitCoxModel = true;
        recommendation.showHazardRatios = context.groupCount >= 2 && answers.covariateStrategy !== 'none';
        if(answers.covariateStrategy === 'timeDependent'){
          recommendation.summary = 'Fit a Cox model with time-dependent covariates and report adjusted hazard ratios.';
          recommendation.rationale.push('Cox regression handles varying predictors over follow-up when covariates are marked time-dependent.');
          if(context.enabledTimeCovariates === 0){
            recommendation.warnings.push('Mark at least one covariate as time-dependent in the controls to follow this plan.');
          }
        } else if(answers.covariateStrategy === 'baseline'){
          recommendation.summary = 'Fit a Cox model with baseline covariates and show adjusted hazard ratios.';
          recommendation.rationale.push('Baseline Cox regression adjusts survival comparisons for fixed covariates.');
          if(context.enabledBaselineCovariates === 0 && context.covariateCount > 0){
            recommendation.warnings.push('Enable at least one baseline covariate in the selection panel to include it in the Cox model.');
          }
        } else {
          if(context.groupCount === 2){
            recommendation.fitCoxModel = false;
            recommendation.showHazardRatios = true;
            recommendation.summary = 'Report the Cox-derived hazard ratio for the two-group comparison without a duplicate coefficient table.';
            recommendation.rationale.push('With exactly two groups and no covariates, the single Cox coefficient is log(HR), so the hazard-ratio table carries the reportable estimate directly.');
          }else{
            recommendation.summary = 'Fit a Cox model using group indicators only and report baseline-referenced group effects.';
            recommendation.rationale.push('With more than two groups, Cox coefficients and pairwise hazard ratios answer different reporting questions.');
            recommendation.showHazardRatios = context.groupCount >= 2;
          }
        }
        if(context.enabledCovariateCount === 0 && context.covariateCount === 0){
          recommendation.warnings.push('Add extra columns for covariates if you plan to adjust beyond group membership.');
        }
        if(context.totalEvents < 10){
          recommendation.warnings.push('Cox regression is unreliable with very few events; confirm that event counts support the model.');
        }
        break;
      default:
        recommendation.message = 'Select an analysis goal to generate a recommendation.';
        return recommendation;
    }
    recommendation.ready = true;
    return recommendation;
  }

  function renderSurvivalStatsAdvisor(summary, providedContext, session = null){
    const advisorSession = ensureSurvivalSessionOwnershipShape(session || getActiveSurvivalSessionForState());
    if(advisorSession && !isSurvivalSessionActive(advisorSession)){
      return;
    }
    const container = getSurvivalNodeById('survivalStatsAdvisor', advisorSession?.tabId || null);
    if(!container){
      return;
    }
    const advisorState = getSurvivalAdvisorState(advisorSession);
    const isAdvisorOwnerCurrent = () => !advisorSession?.tabId || isSurvivalSessionActive(advisorSession);
    const context = providedContext || buildSurvivalAdvisorContext(summary || state.lastSummary || {});
    advisorState.context = context;
    const answers = ensureSurvivalAdvisorDefaults(context, advisorState);
    setSurvivalAdvisorState(advisorState, advisorSession);
    const recommendation = computeSurvivalAdvisorRecommendation(answers, context);
    const sharedAdvisorUi = Shared.statsUi;
    if(sharedAdvisorUi && typeof sharedAdvisorUi.renderAdvisorPanel === 'function'){
      sharedAdvisorUi.renderAdvisorPanel({
        container,
        state: advisorState,
        title: 'Statistics advisor',
        inactiveMessage: 'Press the "Guide me" button to view advisor recommendations.',
        recommendation,
        answers,
        questions: advisorState.open ? buildSurvivalAdvisorQuestions(context, advisorState) : [],
        namePrefix: 'survival-advisor',
        onToggle: (nextOpen)=>{
          if(!isAdvisorOwnerCurrent()){ return; }
          advisorState.open = !!nextOpen;
          if(advisorState.open && !advisorState.activated){
            advisorState.activated = true;
            logDebug('stats advisor activated');
          }
          logDebug('stats advisor toggled', { open: advisorState.open });
          setSurvivalAdvisorState(advisorState, advisorSession);
          persistSurvivalStatsTabState('survival-stats-advisor-toggle', advisorSession);
          renderSurvivalStatsAdvisor(null, advisorState.context, advisorSession);
        },
        onAnswerChange: (question, value)=>{
          if(!isAdvisorOwnerCurrent()){ return; }
          answers[question.id] = value;
          advisorState.answers = answers;
          logDebug('stats advisor answer change', { question: question.id, value });
          setSurvivalAdvisorState(advisorState, advisorSession);
          persistSurvivalStatsTabState('survival-stats-advisor-answer', advisorSession);
          renderSurvivalStatsAdvisor(null, advisorState.context, advisorSession);
        },
        onApply: ()=>{
          if(!isAdvisorOwnerCurrent()){ return; }
          if(!recommendation.ready){
            return;
          }
          if(refs.showHazardRatios){
            refs.showHazardRatios.checked = !!recommendation.showHazardRatios;
          }
          if(refs.fitCoxModel){
            refs.fitCoxModel.checked = !!recommendation.fitCoxModel;
          }
          advisorState.lastApplied = { ...recommendation, answers: { ...answers } };
          syncSurvivalRuntimeControlsFromDom();
          syncSurvivalStateToSession(advisorSession, { controls: state.controls });
          setSurvivalAdvisorState(advisorState, advisorSession);
          persistSurvivalStatsTabState('survival-stats-advisor-apply', advisorSession);
          logDebug('stats advisor recommendation applied', {
            showHazardRatios: recommendation.showHazardRatios,
            fitCoxModel: recommendation.fitCoxModel,
            answers: { ...answers }
          });
          scheduleActiveSurvivalDraw({ reason: 'survival-advisor-apply', tabId: getSurvivalProjectionTabId() || null });
          renderSurvivalStatsAdvisor(null, advisorState.context, advisorSession);
        },
        onReset: ()=>{
          if(!isAdvisorOwnerCurrent()){ return; }
          advisorState.answers = {};
          setSurvivalAdvisorState(advisorState, advisorSession);
          persistSurvivalStatsTabState('survival-stats-advisor-reset', advisorSession);
          logDebug('stats advisor answers reset');
          renderSurvivalStatsAdvisor(null, advisorState.context, advisorSession);
        }
      });
      return;
    }
    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'stats-advisor';
    wrapper.dataset.open = advisorState.open ? '1' : '0';
    wrapper.setAttribute('data-parameter-observable', 'survival-advisor');
    wrapper.setAttribute('data-parameter-advisor-open', advisorState.open ? 'true' : 'false');
    const header = document.createElement('div');
    header.className = 'stats-advisor__header';
    const title = document.createElement('strong');
    title.textContent = 'Test advisor';
    header.appendChild(title);
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'stats-advisor__toggle';
    toggle.textContent = advisorState.open ? 'Hide advisor' : 'Guide me';
    toggle.addEventListener('click', () => {
      if(!isAdvisorOwnerCurrent()){ return; }
      advisorState.open = !advisorState.open;
      if(advisorState.open && !advisorState.activated){
        advisorState.activated = true;
        logDebug('stats advisor activated');
      }
      logDebug('stats advisor toggled', { open: advisorState.open });
      setSurvivalAdvisorState(advisorState, advisorSession);
      persistSurvivalStatsTabState('survival-stats-advisor-toggle', advisorSession);
      renderSurvivalStatsAdvisor(null, advisorState.context, advisorSession);
    });
    header.appendChild(toggle);
    wrapper.appendChild(header);
    const summaryBlock = document.createElement('div');
    summaryBlock.className = 'stats-advisor__summary';
    if(!advisorState.activated){
      const message = document.createElement('div');
      message.textContent = 'Press the "Guide me" button to view advisor recommendations.';
      summaryBlock.appendChild(message);
    }else if(recommendation.ready){
      const summaryLine = document.createElement('div');
      summaryLine.className = 'stats-advisor__summary-line';
      summaryLine.textContent = `Recommendation: ${recommendation.summary}`;
      summaryBlock.appendChild(summaryLine);
      if(Array.isArray(recommendation.rationale) && recommendation.rationale.length){
        const rationaleList = document.createElement('ul');
        rationaleList.className = 'stats-advisor__rationale';
        recommendation.rationale.forEach(item => {
          const li = document.createElement('li');
          li.textContent = item;
          rationaleList.appendChild(li);
        });
        summaryBlock.appendChild(rationaleList);
      }
      if(Array.isArray(recommendation.warnings) && recommendation.warnings.length){
        const warnTitle = document.createElement('div');
        warnTitle.className = 'stats-advisor__warnings-title';
        warnTitle.textContent = 'Cautions:';
        summaryBlock.appendChild(warnTitle);
        const warnList = document.createElement('ul');
        warnList.className = 'stats-advisor__warnings';
        recommendation.warnings.forEach(item => {
          const li = document.createElement('li');
          li.textContent = item;
          warnList.appendChild(li);
        });
        summaryBlock.appendChild(warnList);
      }
    } else {
      const message = document.createElement('div');
      message.textContent = recommendation.message || 'Answer the advisor questions to receive a recommendation.';
      summaryBlock.appendChild(message);
    }
    wrapper.appendChild(summaryBlock);
    if(advisorState.open){
      const questionsWrap = document.createElement('div');
      questionsWrap.className = 'stats-advisor__questions';
      const questions = buildSurvivalAdvisorQuestions(context, advisorState);
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
        (question.options || []).forEach(option => {
          const label = document.createElement('label');
          label.className = 'stats-advisor__option';
          const input = document.createElement('input');
          input.type = 'radio';
          input.name = `survival-advisor-${question.id}`;
          input.value = option.value;
          input.checked = answers[question.id] === option.value;
          input.addEventListener('change', () => {
            if(!isAdvisorOwnerCurrent()){ return; }
            answers[question.id] = option.value;
            advisorState.answers = answers;
            logDebug('stats advisor answer change', { question: question.id, value: option.value });
            setSurvivalAdvisorState(advisorState, advisorSession);
            persistSurvivalStatsTabState('survival-stats-advisor-answer', advisorSession);
            renderSurvivalStatsAdvisor(null, advisorState.context, advisorSession);
          });
          const span = document.createElement('span');
          span.textContent = option.label;
          label.appendChild(input);
          label.appendChild(span);
          fieldset.appendChild(label);
        });
        questionsWrap.appendChild(fieldset);
      });
      wrapper.appendChild(questionsWrap);
      const actions = document.createElement('div');
      actions.className = 'stats-advisor__actions';
      const applyBtn = document.createElement('button');
      applyBtn.type = 'button';
      applyBtn.textContent = 'Apply recommendation';
      applyBtn.disabled = !recommendation.ready;
      applyBtn.addEventListener('click', () => {
        if(!isAdvisorOwnerCurrent()){ return; }
        if(!recommendation.ready){
          return;
        }
        if(refs.showHazardRatios){
          refs.showHazardRatios.checked = !!recommendation.showHazardRatios;
        }
        if(refs.fitCoxModel){
          refs.fitCoxModel.checked = !!recommendation.fitCoxModel;
        }
        advisorState.lastApplied = { ...recommendation, answers: { ...answers } };
        syncSurvivalRuntimeControlsFromDom();
        syncSurvivalStateToSession(advisorSession, { controls: state.controls });
        setSurvivalAdvisorState(advisorState, advisorSession);
        persistSurvivalStatsTabState('survival-stats-advisor-apply', advisorSession);
        logDebug('stats advisor recommendation applied', {
          showHazardRatios: recommendation.showHazardRatios,
          fitCoxModel: recommendation.fitCoxModel,
          answers: { ...answers }
        });
        scheduleActiveSurvivalDraw({ reason: 'survival-advisor-apply', tabId: getSurvivalProjectionTabId() || null });
        renderSurvivalStatsAdvisor(null, advisorState.context, advisorSession);
      });
      actions.appendChild(applyBtn);
      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className = 'stats-advisor__reset';
      resetBtn.textContent = 'Reset answers';
      resetBtn.addEventListener('click', () => {
        if(!isAdvisorOwnerCurrent()){ return; }
        advisorState.answers = {};
        setSurvivalAdvisorState(advisorState, advisorSession);
        persistSurvivalStatsTabState('survival-stats-advisor-reset', advisorSession);
        logDebug('stats advisor answers reset');
        renderSurvivalStatsAdvisor(null, advisorState.context, advisorSession);
      });
      actions.appendChild(resetBtn);
      wrapper.appendChild(actions);
    }
    container.appendChild(wrapper);
  }

  function updateGroupColorPickers(groupNames){
    const activeNames = Array.isArray(groupNames) ? groupNames : [];
    if(refs.labelColorsDiv){
      refs.labelColorsDiv.innerHTML = '';
    }
    Object.keys(state.labelColors).forEach(name => {
      if(!activeNames.includes(name)){
        delete state.labelColors[name];
      }
    });
    if(!refs.labelColorsDiv || !refs.labelColorsFieldset){
      activeNames.forEach((name, index) => {
        if(!state.labelColors[name]){
          state.labelColors[name] = DEFAULT_COLORS[index % DEFAULT_COLORS.length];
        }
      });
      logDebug('group colors synced without control panel', { count: activeNames.length });
      return;
    }
    activeNames.forEach((name, index) => {
      if(!state.labelColors[name]){
        state.labelColors[name] = DEFAULT_COLORS[index % DEFAULT_COLORS.length];
      }
      const wrapper = document.createElement('label');
      wrapper.style.display = 'inline-flex';
      wrapper.style.alignItems = 'center';
      wrapper.style.gap = '6px';
      wrapper.style.marginRight = '8px';
      wrapper.textContent = `${name}`;
      const input = document.createElement('input');
      input.type = 'color';
      input.value = state.labelColors[name];
      input.dataset.setting = `labelColors.${index}`;
      input.setAttribute('aria-label', `Color for ${name}`);
      if(typeof global.attachColorPickerNear === 'function'){
        global.attachColorPickerNear(input);
      }
      input.addEventListener('input', ev => {
        const owner = getSurvivalSessionForEvent(ev, { reason: 'survival-group-color' }, { create: false });
        applySurvivalColorValue(name, ev.target.value, {
          session: owner,
          source: 'control',
          reason: 'survival-group-color'
        });
      });
      wrapper.appendChild(input);
      refs.labelColorsDiv.appendChild(wrapper);
    });
    refs.labelColorsFieldset.style.display = activeNames.length ? '' : 'none';
    logDebug('group color pickers updated', { count: activeNames.length });
  }

  function projectSurvivalSeriesColor(groupName, value, session = null){
    const key = String(groupName == null ? '' : groupName).trim();
    const color = String(value == null ? '' : value).trim();
    if(!key || !color){
      return false;
    }
    const owner = ensureSurvivalSessionOwnershipShape(session || getActiveSurvivalSessionForState());
    const svg = getSurvivalNodeById('survivalSvg', owner?.tabId || getSurvivalProjectionTabId() || null);
    if(!svg){
      return false;
    }
    const seriesTargets = Array.from(svg.querySelectorAll('[data-survival-series-color-target][data-group]'))
      .filter(node => String(node.getAttribute('data-group') || '').trim() === key);
    seriesTargets.forEach(node => {
      const attribute = node.getAttribute('data-survival-series-color-target');
      if(attribute === 'fill' || attribute === 'stroke'){
        node.setAttribute(attribute, color);
      }
    });
    const legendTargets = Array.from(svg.querySelectorAll('[data-legend-key]'))
      .filter(node => String(node.dataset?.legendKey || '').trim() === key)
      .filter(node => String(node.tagName || '').toLowerCase() !== 'text');
    legendTargets.forEach(node => {
      if(node.hasAttribute('fill') && node.getAttribute('fill') !== 'none'){
        node.setAttribute('fill', color);
      }
      if(node.hasAttribute('stroke') && node.getAttribute('stroke') !== 'none'){
        node.setAttribute('stroke', color);
      }
    });
    return seriesTargets.length > 0;
  }

  function applySurvivalColorValues(groupNames, value, options = {}){
    const names = Array.from(new Set((Array.isArray(groupNames) ? groupNames : [groupNames])
      .map(name => String(name == null ? '' : name).trim())
      .filter(Boolean)));
    if(!names.length){
      return false;
    }
    const owner = ensureSurvivalSessionOwnershipShape(options.session)
      || getSurvivalProjectionSession({ reason: options.reason || 'survival-group-color' });
    if(!owner || !isSurvivalSessionActive(owner)){
      survivalDebug('Debug: survival group color ignored without exact live owner', {
        groups: names,
        tabId: owner?.tabId || null,
        reason: options.reason || 'survival-group-color'
      });
      return false;
    }
    const nextColors = cloneSimple(owner.state?.labelColors || state.labelColors || {}) || {};
    const nextValue = value != null ? String(value) : '';
    const force = options.force === true;
    let changed = false;
    names.forEach(groupName => {
      const previousValue = nextColors[groupName] || '';
      if(nextValue){
        if(force || previousValue !== nextValue){
          nextColors[groupName] = nextValue;
          changed = true;
        }
      }else if(force || previousValue){
        delete nextColors[groupName];
        changed = true;
      }
    });
    if(!changed){
      return false;
    }
    syncSurvivalStateToSession(owner, { labelColors: nextColors });
    state.labelColors = cloneSimple(nextColors) || {};
    Shared.componentLifecycle?.persistOwnedUserState?.('survival', owner, {
      tabId: owner.tabId,
      reason: options.reason || 'survival-group-color'
    });
    logDebug('group color changed', {
      groups: names,
      color: nextValue || null,
      source: options.source || 'apply',
      forced: force,
      tabId: owner.tabId
    });
    const projected = !!nextValue && names.every(groupName => projectSurvivalSeriesColor(groupName, nextValue, owner));
    if(!projected){
      scheduleSurvivalDrawForSession(owner, {
        reason: options.reason || 'survival-group-color',
        tabId: owner.tabId,
        viewOnly: true,
        userInitiated: true
      });
    }
    return true;
  }

  function applySurvivalColorValue(groupName, value, options = {}){
    return applySurvivalColorValues([groupName], value, options);
  }

  function handleSurvivalLegendSwatchClick(payload){
    const entry = payload?.entry;
    const swatch = payload?.swatch;
    const event = payload?.event;
    if(!entry || !swatch || typeof Shared.openColorPicker !== 'function'){
      return;
    }
    event?.stopPropagation?.();
    const labelKey = entry.key || entry.label || entry.raw?.name || '';
    if(!labelKey){
      return;
    }
    const currentColor = state.labelColors[labelKey] || entry.fill || entry.color || '#888888';
    let previousColor = currentColor;
    Shared.openColorPicker({
      anchor: swatch,
      color: currentColor,
      onInput(value){
        applySurvivalColorValue(labelKey, value, { source: 'legend' });
      },
      onChange(value){
        const normalized = value != null ? String(value) : '';
        if(normalized === previousColor){
          return;
        }
        applySurvivalColorValue(labelKey, normalized, { source: 'legend' });
        recordSurvivalChange(`survival:legend-color:${labelKey}`, previousColor, normalized, next => {
          applySurvivalColorValue(labelKey, next, { source: 'undo', force: true });
        });
        previousColor = normalized;
      }
    });
  }

  function drawSurvivalLegend(svg, legendLayout, defaults = {}, svgDimensions = {}, ownerSession = null){
    const renderer = legendLayout?.renderer;
    if(!svg || !renderer || !renderer.entries.length){
      return null;
    }
    const stored = state.labelPositions || {};
    const storedLegend = stored.legend || {};

    // Get SVG dimensions for relative positioning
    const svgWidth = svgDimensions.width || (svg.getAttribute('width') ? parseFloat(svg.getAttribute('width')) : 500);
    const svgHeight = svgDimensions.height || (svg.getAttribute('height') ? parseFloat(svg.getAttribute('height')) : 400);

    const position = chartStyle.resolveLegendPosition(storedLegend, {
      defaultX: Number.isFinite(defaults.x) ? Number(defaults.x) : 0,
      defaultY: Number.isFinite(defaults.y) ? Number(defaults.y) : 0,
      reserveOriginX: Number.isFinite(Number(svgDimensions.reserveOriginX)) ? Number(svgDimensions.reserveOriginX) : defaults.x,
      reserveOriginY: Number.isFinite(Number(svgDimensions.reserveOriginY)) ? Number(svgDimensions.reserveOriginY) : defaults.y,
      reserveScaleX: Number.isFinite(Number(svgDimensions.reserveScaleX)) ? Number(svgDimensions.reserveScaleX) : svgWidth,
      reserveScaleY: Number.isFinite(Number(svgDimensions.reserveScaleY)) ? Number(svgDimensions.reserveScaleY) : svgHeight,
      legacyOriginX: Number.isFinite(Number(svgDimensions.legacyOriginX)) ? Number(svgDimensions.legacyOriginX) : 0,
      legacyOriginY: Number.isFinite(Number(svgDimensions.legacyOriginY)) ? Number(svgDimensions.legacyOriginY) : 0,
      legacyScaleX: svgWidth,
      legacyScaleY: svgHeight
    });

    const legendGroup = renderer.draw(svg, {
      x: position.x,
      y: position.y,
      canonicalX: position.canonicalX,
      canonicalY: position.canonicalY
    });
    if(!legendGroup){
      return null;
    }
    const textNodes = legendGroup.querySelectorAll('text');
    textNodes.forEach((node, index) => {
      markFontEditable(node, 'legend', `legend-${index}`);
    });
    bindSurvivalLegendInteractions(legendGroup, svg, ownerSession, {
      originX: position.originX,
      originY: position.originY,
      scaleX: position.scaleX,
      scaleY: position.scaleY,
      svgWidth: Math.max(svgWidth, 1),
      svgHeight: Math.max(svgHeight, 1)
    });
    return legendGroup;
  }

  function refreshCovariateControls(){
    if(!refs.covariateControls){
      return;
    }
    const columns = Array.isArray(state.covariateColumns) ? state.covariateColumns : [];
    const availableIndices = columns.map(col => col.index);
    Object.keys(state.covariateSettings).forEach(key => {
      if(!availableIndices.includes(Number(key))){
        delete state.covariateSettings[key];
      }
    });
    refs.covariateControls.innerHTML = '';

    const coxAnalysisActive = !!refs.showHazardRatios?.checked || !!refs.fitCoxModel?.checked;
    const supportsTimeDependent = detectTimeDependentSupport(
      state.hot?.getIncludedDataMatrix?.()
        || (Shared.hot?.getIncludedDataMatrix ? Shared.hot.getIncludedDataMatrix(state.hot) : [])
    );

    if(refs.covariateHint){
      refs.covariateHint.style.display = 'none';
    }

    const hint = document.createElement('div');
    hint.className = 'survival-covariate-hint-text';
    hint.style.fontSize = '12px';
    hint.style.color = '#4a5568';
    hint.style.marginBottom = '8px';

    if(!columns.length){
      hint.textContent = 'Add named or populated columns after Entry Time to make them available as Cox covariates.';
      refs.covariateControls.appendChild(hint);
      logDebug('covariate controls hidden - no meaningful covariate columns');
      return;
    }

    if(!coxAnalysisActive){
      hint.textContent = 'Enable "Fit Cox model" or "Show hazard ratios" to include covariates in model-based survival analyses.';
    } else if(supportsTimeDependent){
      hint.textContent = 'Check a column to include it in the Cox model. Unchecked covariates are ignored. Time-dependent covariates require Entry Time to mark interval starts.';
    } else {
      hint.textContent = 'Check a column to include it in the Cox model. Unchecked covariates are ignored. Time-dependent covariates become available when Entry Time contains interval starts.';
    }
    refs.covariateControls.appendChild(hint);

    columns.forEach((col) => {
      const key = String(col.index);
      if(!state.covariateSettings[key]){
        state.covariateSettings[key] = { enabled: false, type: 'baseline' };
      }
      const settings = state.covariateSettings[key];
      if(settings.type === 'time' && !supportsTimeDependent){
        settings.type = 'baseline';
      }

      const row = document.createElement('div');
      row.className = 'survival-covariate-option';
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '6px';
      row.style.flexWrap = 'wrap';
      row.style.marginBottom = '6px';
      row.style.opacity = coxAnalysisActive ? '1' : '0.65';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `survivalCovariateToggle-${col.index}`;
      checkbox.dataset.columnIndex = key;
      checkbox.checked = !!settings.enabled;
      checkbox.disabled = !coxAnalysisActive;
      checkbox.title = coxAnalysisActive
        ? `Include ${col.header} in the Cox model`
        : 'Enable Cox modelling or hazard ratios to include covariates';

      const label = document.createElement('label');
      label.setAttribute('for', checkbox.id);
      label.textContent = col.header;
      label.style.fontWeight = '500';
      label.style.minWidth = '140px';
      label.title = col.derivedHeader
        ? `${col.header} (generated because the column header was blank)`
        : col.header;

      const select = document.createElement('select');
      select.dataset.columnIndex = key;
      select.style.minWidth = '140px';
      const optionBaseline = document.createElement('option');
      optionBaseline.value = 'baseline';
      optionBaseline.textContent = 'Baseline';
      const optionTime = document.createElement('option');
      optionTime.value = 'time';
      optionTime.textContent = 'Time-dependent';
      optionTime.disabled = !supportsTimeDependent;
      select.appendChild(optionBaseline);
      select.appendChild(optionTime);
      select.value = settings.type === 'time' && supportsTimeDependent ? 'time' : 'baseline';
      select.disabled = !coxAnalysisActive || !checkbox.checked;
      select.title = !coxAnalysisActive
        ? 'Enable Cox modelling or hazard ratios first'
        : (!checkbox.checked
          ? 'Check the covariate to include it in the model'
          : (supportsTimeDependent
            ? 'Choose whether the covariate is fixed at baseline or varies across intervals'
            : 'Time-dependent covariates require interval starts in Entry Time'));
      attachSurvivalSelectAutoSize(select, 'survival-covariate');

      checkbox.addEventListener('change', ev => {
        runSurvivalControlOwner(ev, 'survival-covariate-toggle', session => {
          const idx = ev.target.dataset.columnIndex;
          state.covariateSettings[idx] = state.covariateSettings[idx] || { type: select.value };
          state.covariateSettings[idx].enabled = ev.target.checked;
          select.disabled = !coxAnalysisActive || !ev.target.checked;
          logDebug('covariate toggle changed', { columnIndex: Number(idx), enabled: ev.target.checked });
          syncSurvivalStateToSession(session, { covariateSettings: state.covariateSettings });
          scheduleSurvivalDrawForSession(session, {
            reason: 'survival-covariate-toggle',
            tabId: session?.tabId || undefined,
            userInitiated: true
          });
        });
      });

      select.addEventListener('change', ev => {
        runSurvivalControlOwner(ev, 'survival-covariate-type', session => {
          const idx = ev.target.dataset.columnIndex;
          state.covariateSettings[idx] = state.covariateSettings[idx] || { enabled: checkbox.checked };
          state.covariateSettings[idx].type = ev.target.value === 'time' && supportsTimeDependent ? 'time' : 'baseline';
          logDebug('covariate type changed', { columnIndex: Number(idx), type: state.covariateSettings[idx].type });
          syncSurvivalStateToSession(session, { covariateSettings: state.covariateSettings });
          scheduleSurvivalDrawForSession(session, {
            reason: 'survival-covariate-type',
            tabId: session?.tabId || undefined,
            userInitiated: true
          });
        });
      });

      row.appendChild(checkbox);
      row.appendChild(label);
      row.appendChild(select);
      refs.covariateControls.appendChild(row);
    });
    logDebug('covariate controls refreshed', {
      available: columns.map(col => ({ index: col.index, header: col.header })),
      enabled: Object.keys(state.covariateSettings).filter(key => state.covariateSettings[key]?.enabled),
      coxAnalysisActive,
      supportsTimeDependent
    });
  }

  function computeKaplanMeier(records){
    const sorted = records.slice().sort((a, b) => {
      if(a.time === b.time){
        if(a.event === b.event) return 0;
        return a.event ? -1 : 1;
      }
      return a.time - b.time;
    });
    const stepPoints = [{ time: 0, survival: 1 }];
    const lowerSteps = [{ time: 0, value: 1 }];
    const upperSteps = [{ time: 0, value: 1 }];
    const censorPoints = [];
    const z = 1.96;
    let atRisk = sorted.length;
    let survivalProb = 1;
    let cumulativeVar = 0;
    let median = null;
    let lastTime = 0;
    let lastLower = 1;
    let lastUpper = 1;

    for(let i = 0; i < sorted.length; ){
      const currentTime = sorted[i].time;
      const group = [];
      while(i < sorted.length && Math.abs(sorted[i].time - currentTime) < 1e-9){
        group.push(sorted[i]);
        i += 1;
      }
      let events = 0;
      let censored = 0;
      group.forEach(item => {
        if(item.event){ events += 1; } else { censored += 1; }
      });

      stepPoints.push({ time: currentTime, survival: survivalProb });
      lowerSteps.push({ time: currentTime, value: lastLower });
      upperSteps.push({ time: currentTime, value: lastUpper });

      if(events > 0 && atRisk > 0){
        const hazard = events / atRisk;
        survivalProb = survivalProb * (1 - hazard);
        if(atRisk - events > 0){
          cumulativeVar += events / (atRisk * (atRisk - events));
        }
        // Log-log transformed Greenwood interval: range preserving and
        // substantially better behaved than symmetric Wald bounds near 0/1.
        if(survivalProb > 0 && survivalProb < 1 && cumulativeVar > 0){
          const logSurvival = Math.log(survivalProb);
          const seLogLog = Math.sqrt(cumulativeVar) / Math.abs(logSurvival);
          const transformed = Math.log(-logSurvival);
          lastLower = Math.exp(-Math.exp(transformed + z * seLogLog));
          lastUpper = Math.exp(-Math.exp(transformed - z * seLogLog));
        }else{
          lastLower = survivalProb;
          lastUpper = survivalProb;
        }
        stepPoints.push({ time: currentTime, survival: survivalProb });
        lowerSteps.push({ time: currentTime, value: lastLower });
        upperSteps.push({ time: currentTime, value: lastUpper });
        if(median === null && survivalProb <= 0.5){
          median = currentTime;
        }
      }

      if(censored > 0){
        for(let c = 0; c < censored; c += 1){
          censorPoints.push({ time: currentTime, survival: survivalProb });
        }
      }

      atRisk -= (events + censored);
      if(atRisk < 0){
        atRisk = 0;
      }
      lastTime = currentTime;
    }

    const resolveMedianCrossing = points => {
      const safePoints = Array.isArray(points) ? points : [];
      for(let idx = 0; idx < safePoints.length; idx += 1){
        const time = Number(safePoints[idx]?.time);
        const value = Number(
          Number.isFinite(safePoints[idx]?.value)
            ? safePoints[idx].value
            : safePoints[idx]?.survival
        );
        if(Number.isFinite(time) && Number.isFinite(value) && value <= 0.5){
          return time;
        }
      }
      return null;
    };
    let medianCiLow = resolveMedianCrossing(lowerSteps);
    let medianCiHigh = resolveMedianCrossing(upperSteps);
    if(Number.isFinite(medianCiLow) && Number.isFinite(medianCiHigh) && medianCiLow > medianCiHigh){
      const swap = medianCiLow;
      medianCiLow = medianCiHigh;
      medianCiHigh = swap;
    }
    return {
      steps: stepPoints,
      lower: lowerSteps,
      upper: upperSteps,
      censor: censorPoints,
      median,
      medianCiLow,
      medianCiHigh,
      lastSurvival: survivalProb,
      maxTime: lastTime
    };
  }

  function invertMatrix(matrix){
    if(!Array.isArray(matrix) || !matrix.length){
      return null;
    }
    const n = matrix.length;
    const augmented = matrix.map((row, rowIndex) => {
      const extended = row.slice();
      for(let j = 0; j < n; j += 1){
        extended.push(rowIndex === j ? 1 : 0);
      }
      return extended;
    });
    for(let i = 0; i < n; i += 1){
      let pivotRow = i;
      let pivotValue = augmented[i][i];
      for(let r = i + 1; r < n; r += 1){
        if(Math.abs(augmented[r][i]) > Math.abs(pivotValue)){
          pivotValue = augmented[r][i];
          pivotRow = r;
        }
      }
      if(!Number.isFinite(pivotValue) || Math.abs(pivotValue) < 1e-12){
        logDebug('invertMatrix singular pivot', { index: i, pivot: pivotValue });
        return null;
      }
      if(pivotRow !== i){
        const temp = augmented[i];
        augmented[i] = augmented[pivotRow];
        augmented[pivotRow] = temp;
      }
      const divisor = augmented[i][i];
      for(let j = 0; j < 2 * n; j += 1){
        augmented[i][j] /= divisor;
      }
      for(let r = 0; r < n; r += 1){
        if(r === i) continue;
        const factor = augmented[r][i];
        for(let c = 0; c < 2 * n; c += 1){
          augmented[r][c] -= factor * augmented[i][c];
        }
      }
    }
    const inverse = augmented.map(row => row.slice(n));
    return inverse;
  }

  function addDiagonal(matrix, epsilon){
    return matrix.map((row, rowIndex) => row.map((value, colIndex) => value + (rowIndex === colIndex ? epsilon : 0)));
  }

  function tryInvertMatrix(matrix, options){
    if(!Array.isArray(matrix) || !matrix.length){
      return null;
    }
    const epsilons = Array.isArray(options?.epsilons) && options.epsilons.length ? options.epsilons : [0, 1e-8, 1e-6, 1e-4];
    for(let attempt = 0; attempt < epsilons.length; attempt += 1){
      const epsilon = epsilons[attempt];
      const adjusted = epsilon !== 0 ? addDiagonal(matrix, epsilon) : matrix.map(row => row.slice());
      const inverse = invertMatrix(adjusted);
      if(inverse){
        if(epsilon !== 0){
          inverse.__ridgeEpsilon = epsilon;
          logDebug('matrix inversion regularized', {
            context: options?.context || 'matrix',
            epsilon,
            attempt,
            iteration: options?.iteration ?? null
          });
        }
        return inverse;
      }
    }
    logDebug('matrix inversion failed after retries', {
      context: options?.context || 'matrix',
      epsilons
    });
    return null;
  }

  function multiplyMatrixVector(matrix, vector){
    return matrix.map(row => row.reduce((sum, value, index) => sum + value * vector[index], 0));
  }

  function dotProduct(a, b){
    let total = 0;
    for(let i = 0; i < a.length; i += 1){
      total += a[i] * b[i];
    }
    return total;
  }

  function finalizeSurvivalQuadraticTest(diff, variance, options = {}){
    const k = Array.isArray(diff) ? diff.length : 0;
    const scores = Array.isArray(options.scores) ? options.scores.map(Number) : null;
    let chi2 = NaN;
    let df = k - 1;
    if(scores && scores.length === k){
      let numerator = 0;
      let denominator = 0;
      for(let i = 0; i < k; i += 1){
        const scoreI = Number(scores[i]);
        const diffI = Number(diff[i]);
        if(!Number.isFinite(scoreI) || !Number.isFinite(diffI)){
          continue;
        }
        numerator += scoreI * diffI;
        for(let j = 0; j < k; j += 1){
          const scoreJ = Number(scores[j]);
          const varianceValue = Number(variance?.[i]?.[j]);
          if(Number.isFinite(scoreJ) && Number.isFinite(varianceValue)){
            denominator += scoreI * scoreJ * varianceValue;
          }
        }
      }
      chi2 = denominator > 0 ? (numerator * numerator) / denominator : NaN;
      df = 1;
    }else{
      if(df <= 0){
        return { available: false, message: 'Insufficient groups for survival comparison.' };
      }
      const reducedMatrix = [];
      for(let i = 0; i < df; i += 1){
        const row = [];
        for(let j = 0; j < df; j += 1){
          row.push(variance[i][j]);
        }
        reducedMatrix.push(row);
      }
      const inverse = tryInvertMatrix(reducedMatrix, { context: options.context || 'survival variance' });
      if(!inverse){
        return { available: false, message: 'Unable to invert survival comparison variance matrix.' };
      }
      const diffVec = diff.slice(0, df);
      const invTimesDiff = multiplyMatrixVector(inverse, diffVec);
      chi2 = dotProduct(diffVec, invTimesDiff);
    }
    const pValue = Number.isFinite(chi2) ? survivalChiSquareUpperTailPValue(chi2, df) : null;
    return {
      available: Number.isFinite(chi2),
      chi2,
      df,
      p: pValue
    };
  }

  function computeWeightedLogRank(series, options = {}){
    if(!Array.isArray(series) || series.length < 2){
      return { available: false, message: 'Log-rank test requires at least two groups.' };
    }
    const eventTimes = new Set();
    series.forEach(group => {
      group.records.forEach(rec => {
        if(rec.event && Number.isFinite(rec.time)){
          eventTimes.add(rec.time);
        }
      });
    });
    const uniqueTimes = Array.from(eventTimes).sort((a, b) => a - b);
    if(!uniqueTimes.length){
      return { available: false, message: 'No events detected for log-rank test.' };
    }
    const k = series.length;
    const atRisk = series.map(group => group.records.length);
    const eventMaps = series.map(group => {
      const map = new Map();
      group.records.forEach(rec => {
        const existing = map.get(rec.time) || { events: 0, censored: 0 };
        if(rec.event){ existing.events += 1; } else { existing.censored += 1; }
        map.set(rec.time, existing);
      });
      return map;
    });
    const diff = new Array(k).fill(0);
    const variance = Array.from({ length: k }, () => new Array(k).fill(0));

    uniqueTimes.forEach(time => {
      const eventsAtTime = eventMaps.map(map => map.get(time)?.events || 0);
      const censoredAtTime = eventMaps.map(map => map.get(time)?.censored || 0);
      const totalEvents = eventsAtTime.reduce((sum, value) => sum + value, 0);
      const totalAtRisk = atRisk.reduce((sum, value) => sum + value, 0);
      if(totalEvents > 0 && totalAtRisk > 0){
        const weight = typeof options.weightFn === 'function'
          ? Number(options.weightFn({
            time,
            atRisk: atRisk.slice(),
            eventsAtTime: eventsAtTime.slice(),
            totalEvents,
            totalAtRisk
          }))
          : 1;
        const appliedWeight = Number.isFinite(weight) ? weight : 1;
        eventsAtTime.forEach((observed, idx) => {
          const expected = (atRisk[idx] / totalAtRisk) * totalEvents;
          diff[idx] += appliedWeight * (observed - expected);
        });
        if(totalAtRisk > 1){
          const common = totalEvents * (totalAtRisk - totalEvents) / (totalAtRisk * (totalAtRisk - 1));
          for(let g = 0; g < k; g += 1){
            const pg = atRisk[g] / totalAtRisk;
            for(let h = 0; h < k; h += 1){
              const ph = atRisk[h] / totalAtRisk;
              if(g === h){
                variance[g][h] += appliedWeight * appliedWeight * common * pg * (1 - pg);
              } else {
                variance[g][h] -= appliedWeight * appliedWeight * common * pg * ph;
              }
            }
          }
        }
      }
      for(let idx = 0; idx < k; idx += 1){
        atRisk[idx] -= (eventsAtTime[idx] + censoredAtTime[idx]);
        if(atRisk[idx] < 0){
          atRisk[idx] = 0;
        }
      }
    });

    const result = finalizeSurvivalQuadraticTest(diff, variance, {
      context: options.context || 'log-rank variance',
      scores: options.scores
    });
    if(result.available){
      logDebug('weighted survival summary', {
        label: options.label || 'log-rank',
        chi2: result.chi2,
        df: result.df,
        p: result.p
      });
    }
    return {
      ...result,
      label: options.label || 'Log-rank'
    };
  }

  function computeLogRank(series){
    return computeWeightedLogRank(series, {
      label: 'Log-rank',
      context: 'log-rank variance'
    });
  }

  function computeGehanBreslowWilcoxon(series){
    return computeWeightedLogRank(series, {
      label: 'Gehan-Breslow-Wilcoxon',
      context: 'gehan-breslow variance',
      weightFn: ({ totalAtRisk }) => totalAtRisk
    });
  }

  function computeLogRankTrend(series){
    if(!Array.isArray(series) || series.length < 3){
      return { available: false, message: 'Trend test requires at least three ordered groups.' };
    }
    const scores = series.map((_, index) => index + 1);
    const result = computeWeightedLogRank(series, {
      label: 'Log-rank trend',
      context: 'log-rank trend variance',
      scores
    });
    if(result.available){
      result.scores = scores.slice();
    }
    return result;
  }

  function collectSeries(){
    if(!state.hot){
      return { series: [], groupNames: [], maxTime: 0, logRank: { available: false }, covariateColumns: [] };
    }
    const data = typeof state.hot.getIncludedDataMatrix === 'function'
      ? state.hot.getIncludedDataMatrix()
      : (Shared.hot?.getIncludedDataMatrix ? Shared.hot.getIncludedDataMatrix(state.hot) : []);
    const columnCount = typeof state.hot.countCols === 'function' ? state.hot.countCols() : (Array.isArray(data?.[0]) ? data[0].length : SURVIVAL_DEFAULT_COLS);
    const headersRaw = typeof state.hot.getColHeader === 'function' ? state.hot.getColHeader() : SURVIVAL_COL_HEADERS;
    const headerLookup = [];
    for(let col = 0; col < columnCount; col += 1){
      const headerValue = Array.isArray(headersRaw) ? headersRaw[col] : null;
      headerLookup[col] = normalizeHeaderLabel(headerValue, SURVIVAL_COL_HEADERS[col] || `Column ${col + 1}`);
    }
    const covariateColumns = collectMeaningfulCovariateColumns(data, headerLookup, columnCount);
    const supportsTimeDependent = detectTimeDependentSupport(data);
    state.covariateColumns = covariateColumns;
    if(!Array.isArray(data) || !data.length){
      return { series: [], groupNames: [], maxTime: 0, logRank: { available: false }, covariateColumns, headers: headerLookup, supportsTimeDependent };
    }
    const groups = new Map();
    let maxTime = 0;
    let usedRows = 0;
    for(let i = 0; i < data.length; i += 1){
      const row = data[i];
      if(!row){
        continue;
      }
      const groupRaw = row[0];
      const timeRaw = row[1];
      const eventRaw = row[2];
      const entryRaw = row[3];
      const groupName = typeof groupRaw === 'string' ? groupRaw.trim() : (groupRaw != null ? String(groupRaw).trim() : '');
      const time = Number.parseFloat(timeRaw);
      const eventFlag = Number(eventRaw);
      const entry = Number.parseFloat(entryRaw);
      if(!groupName || !Number.isFinite(time)){
        continue;
      }
      usedRows += 1;
      const bucket = groups.get(groupName) || { name: groupName, records: [], events: 0, censored: 0 };
      const record = {
        time,
        event: eventFlag === 1,
        entry: Number.isFinite(entry) ? entry : 0,
        extras: Array.isArray(row) ? row.slice(BASE_COLUMN_COUNT) : [],
        rowIndex: i
      };
      if(Number.isFinite(record.entry) && record.entry > record.time){
        logDebug('entry greater than event time encountered', { rowIndex: i, entry: record.entry, time: record.time });
      }
      bucket.records.push(record);
      if(record.event){ bucket.events += 1; } else { bucket.censored += 1; }
      groups.set(groupName, bucket);
      if(Number.isFinite(time)){
        maxTime = Math.max(maxTime, time);
      }
    }
    const groupNames = Array.from(groups.keys());
    if(!groupNames.length || usedRows === 0){
      return { series: [], groupNames: [], maxTime: 0, logRank: { available: false }, covariateColumns, headers: headerLookup, supportsTimeDependent };
    }
    state.groupOrder = state.groupOrder.filter(name => groups.has(name));
    groupNames.forEach(name => {
      if(!state.groupOrder.includes(name)){
        state.groupOrder.push(name);
      }
    });
    const ordered = state.groupOrder.slice();
    const series = ordered.map(name => {
      const entry = groups.get(name);
      if(!entry){
        return null;
      }
      const km = computeKaplanMeier(entry.records);
      maxTime = Math.max(maxTime, km.maxTime);
      return {
        name,
        records: entry.records,
        events: entry.events,
        censored: entry.censored,
        total: entry.records.length,
        km
      };
    }).filter(Boolean);
    const logRank = computeLogRank(series);
    logDebug('series collected', {
      groupCount: series.length,
      maxTime,
      logRankAvailable: !!logRank.available,
      usedRows,
      covariateColumnCount: covariateColumns.length
    });
    return { series, groupNames: ordered, maxTime, logRank, covariateColumns, headers: headerLookup, supportsTimeDependent };
  }

  function safeExp(value){
    if(!Number.isFinite(value)){
      return 1;
    }
    const clipped = Math.max(Math.min(value, 50), -50);
    return Math.exp(clipped);
  }

  function parseCovariateValue(raw, predictor){
    let value = NaN;
    let handled = false;
    if(typeof raw === 'number' && Number.isFinite(raw)){
      value = raw;
      handled = true;
    }else if(typeof raw === 'boolean'){
      value = raw ? 1 : 0;
      handled = true;
    }else if(raw != null){
      const str = String(raw).trim();
      if(str){
        const numeric = Number(str);
        if(Number.isFinite(numeric)){
          value = numeric;
          handled = true;
        }else{
          const lowered = str.toLowerCase();
          if(['true','yes','y','t','active','on'].includes(lowered)){
            value = 1;
            handled = true;
          }else if(['false','no','n','f','inactive','off'].includes(lowered)){
            value = 0;
            handled = true;
          }else if(predictor?.type === 'time'){
            const match = str.match(/^\s*(-?\d+(?:\.\d+)?)\s*$/);
            if(match){
              value = Number(match[1]);
              handled = Number.isFinite(value);
            }
          }
        }
      }
    }
    if(parseDebugCounter < 5){
      logDebug('covariate parsed',{raw,value,predictorType:predictor?.type || 'baseline',handled});
      parseDebugCounter += 1;
    }
    return handled ? value : NaN;
  }

  function normalCDF(value){
    if(!Number.isFinite(value)){
      return Number.NaN;
    }
    if(global.jStat?.normal?.cdf){
      return global.jStat.normal.cdf(value, 0, 1);
    }
    if(typeof Math.erfc === 'function'){
      return 0.5 * Math.erfc(-value / Math.SQRT2);
    }
    const absZ = Math.abs(value);
    const t = 1 / (1 + 0.2316419 * absZ);
    const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    const approx = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * absZ * absZ) * poly;
    return value >= 0 ? approx : 1 - approx;
  }

  function pValueFromZ(z){
    if(!Number.isFinite(z)){
      return null;
    }
    const pValue = survivalNormalTwoSidedPValue(z);
    return Number.isFinite(pValue) ? pValue : null;
  }

  function pValueFromChiSquare(statistic, df){
    if(!Number.isFinite(statistic) || !Number.isFinite(df) || df <= 0){
      return null;
    }
    const pValue = survivalChiSquareUpperTailPValue(statistic, df);
    return Number.isFinite(pValue) ? pValue : null;
  }

  function createZeroMatrix(size){
    return Array.from({ length: size }, () => new Array(size).fill(0));
  }

  function getSelectedCovariates(columns){
    const selected = [];
    const list = Array.isArray(columns) ? columns : [];
    list.forEach(col => {
      const settings = state.covariateSettings[String(col.index)];
      if(settings?.enabled){
        selected.push({
          columnIndex: col.index,
          header: col.header,
          type: settings.type === 'time' ? 'time' : 'baseline'
        });
      }
    });
    logDebug('selected covariates resolved', { count: selected.length });
    return selected;
  }

  function prepareCoxData(summary){
    if(!summary || !Array.isArray(summary.series) || !summary.series.length){
      return { available: false, message: 'No series available for Cox model.' };
    }
    const series = summary.series;
    const baselineGroup = series[0]?.name || 'Group 1';
    const covariateSelections = getSelectedCovariates(summary.covariateColumns);
    const designPredictors = [];
    for(let idx = 1; idx < series.length; idx += 1){
      const group = series[idx];
      designPredictors.push({
        key: `group:${group?.name ?? idx}`,
        label: `${group?.name ?? `Group ${idx + 1}`} vs ${baselineGroup}`,
        type: 'group',
        groupName: group?.name ?? `Group ${idx + 1}`,
        groupIndex: idx
      });
    }
    covariateSelections.forEach(selection => {
      designPredictors.push({
        key: `cov:${selection.columnIndex}`,
        label: selection.header,
        type: selection.type,
        columnIndex: selection.columnIndex
      });
    });
    const predictors = designPredictors.length;
    if(predictors <= 0){
      return { available: false, message: 'Cox model requires at least one predictor.' };
    }
    const data = [];
    let excludedInvalidCovariates = 0;
    series.forEach((group, groupIndex) => {
      if(!group || !Array.isArray(group.records)){
        return;
      }
      group.records.forEach((rec, recordIndex) => {
        if(!Number.isFinite(rec.time)){
          return;
        }
        const covariates = designPredictors.map(predictor => {
          if(predictor.type === 'group') return predictor.groupIndex === groupIndex ? 1 : 0;
          const offset = predictor.columnIndex - BASE_COLUMN_COUNT;
          const raw = Array.isArray(rec.extras) ? rec.extras[offset] : undefined;
          return parseCovariateValue(raw, predictor);
        });
        if(covariates.some(value => !Number.isFinite(value))){
          excludedInvalidCovariates += 1;
          return;
        }
        data.push({
          time: rec.time,
          entry: Number.isFinite(rec.entry) ? rec.entry : 0,
          event: rec.event ? 1 : 0,
          covariates,
          group: group.name,
          rowIndex: rec.rowIndex ?? recordIndex,
          extras: rec.extras
        });
      });
    });
    if(!data.length){
      return { available: false, message: 'No valid observations to fit Cox model.' };
    }
    const truncated = false;
    data.sort((a, b) => a.time - b.time);
    const eventCount = data.reduce((sum, rec) => sum + (rec.event ? 1 : 0), 0);
    if(eventCount === 0){
      return { available: false, message: 'Cox model requires at least one observed event.' };
    }
    const groupedEvents = new Map();
    data.forEach((obs, idx) => {
      if(!obs.event){
        return;
      }
      const timeKey = Number.isFinite(obs.time) ? obs.time : 0;
      if(!groupedEvents.has(timeKey)){
        groupedEvents.set(timeKey, []);
      }
      groupedEvents.get(timeKey).push(idx);
    });
    const eventsByTime = [];
    const sortedTimes = Array.from(groupedEvents.keys()).sort((a, b) => a - b);
    sortedTimes.forEach(timeValue => {
      const eventIndices = groupedEvents.get(timeValue) || [];
      eventsByTime.push({
        time: timeValue,
        eventIndices,
        eventCount: eventIndices.length,
        atRiskCount: 0
      });
    });
    const entryOrder = data
      .map((obs, idx) => ({ idx, entry: Number.isFinite(obs.entry) ? obs.entry : 0, time: Number.isFinite(obs.time) ? obs.time : 0 }))
      .sort((a, b) => {
        if(a.entry === b.entry){
          if(a.time === b.time){
            return a.idx - b.idx;
          }
          return a.time - b.time;
        }
        return a.entry - b.entry;
      })
      .map(item => item.idx);
    const exitOrder = data.map((_, idx) => idx);
    let entryPointer = 0;
    let exitPointer = 0;
    let atRiskCount = 0;
    let maxRiskCount = 0;
    const epsilon = 1e-9;
    eventsByTime.forEach(group => {
      const timeValue = group.time;
      while(entryPointer < entryOrder.length){
        const candidate = data[entryOrder[entryPointer]];
        if(!candidate){
          entryPointer += 1;
          continue;
        }
        const entryTime = Number.isFinite(candidate.entry) ? candidate.entry : 0;
        if(entryTime <= timeValue + epsilon){
          atRiskCount += 1;
          entryPointer += 1;
        } else {
          break;
        }
      }
      while(exitPointer < exitOrder.length){
        const candidate = data[exitOrder[exitPointer]];
        if(!candidate){
          exitPointer += 1;
          continue;
        }
        if(candidate.time < timeValue - epsilon){
          atRiskCount = Math.max(0, atRiskCount - 1);
          exitPointer += 1;
          continue;
        }
        break;
      }
      group.atRiskCount = atRiskCount;
      maxRiskCount = Math.max(maxRiskCount, atRiskCount);
    });
    logDebug('cox design prepared', {
      predictors,
      baselineGroup,
      totalRecords: data.length,
      events: eventCount,
      extraCovariates: covariateSelections.length,
      tieGroups: eventsByTime.length,
      maxRiskCount,
      truncated
    });
    if(data.length && parseDebugCounter < 5){
      logDebug('cox design sample row', {
        sample: Object.assign({}, data[0], { covariates: data[0].covariates.slice() })
      });
    }
    return {
      available: true,
      baselineGroup,
      predictors,
      data,
      eventCount,
      design: { predictors: designPredictors, covariateSelections },
      eventsByTime,
      entryOrder,
      exitOrder,
      maxRiskCount,
      truncated,
      excludedInvalidCovariates,
      tieMethod: 'efron'
    };
  }

  function evaluateCoxAt(beta, prepared){
    const { data, predictors, eventsByTime } = prepared;
    const gradient = new Array(predictors).fill(0);
    const fisher = Array.from({ length: predictors }, () => new Array(predictors).fill(0));
    let logLik = 0;
    if(!Array.isArray(eventsByTime) || !eventsByTime.length){
      return { gradient, fisher, logLik };
    }
    const entryOrder = Array.isArray(prepared.entryOrder) && prepared.entryOrder.length === data.length
      ? prepared.entryOrder
      : data.map((_, idx) => idx);
    const exitOrder = Array.isArray(prepared.exitOrder) && prepared.exitOrder.length === data.length
      ? prepared.exitOrder
      : data.map((_, idx) => idx);
    const weights = new Array(data.length);
    const xbValues = new Array(data.length);
    for(let i = 0; i < data.length; i += 1){
      const obs = data[i];
      const xb = dotProduct(obs.covariates, beta);
      xbValues[i] = xb;
      weights[i] = safeExp(xb);
    }
    let denom = 0;
    const weightedX = new Array(predictors).fill(0);
    const weightedXX = createZeroMatrix(predictors);
    let entryPointer = 0;
    let exitPointer = 0;
    const epsilon = 1e-9;
    eventsByTime.forEach((group, idx) => {
      const eventIndices = Array.isArray(group.eventIndices) ? group.eventIndices : [];
      if(!eventIndices.length){
        return;
      }
      const timeValue = Number.isFinite(group.time) ? group.time : 0;
      while(entryPointer < entryOrder.length){
        const candidateIndex = entryOrder[entryPointer];
        const obs = data[candidateIndex];
        if(!obs){
          entryPointer += 1;
          continue;
        }
        const entryTime = Number.isFinite(obs.entry) ? obs.entry : 0;
        if(entryTime <= timeValue + epsilon){
          const weight = weights[candidateIndex];
          denom += weight;
          for(let r = 0; r < predictors; r += 1){
            const vr = obs.covariates[r] ?? 0;
            weightedX[r] += vr * weight;
            for(let c = 0; c < predictors; c += 1){
              const vc = obs.covariates[c] ?? 0;
              weightedXX[r][c] += vr * vc * weight;
            }
          }
          entryPointer += 1;
        } else {
          break;
        }
      }
      while(exitPointer < exitOrder.length){
        const candidateIndex = exitOrder[exitPointer];
        const obs = data[candidateIndex];
        if(!obs){
          exitPointer += 1;
          continue;
        }
        if(obs.time < timeValue - epsilon){
          const weight = weights[candidateIndex];
          denom -= weight;
          for(let r = 0; r < predictors; r += 1){
            const vr = obs.covariates[r] ?? 0;
            weightedX[r] -= vr * weight;
            for(let c = 0; c < predictors; c += 1){
              const vc = obs.covariates[c] ?? 0;
              weightedXX[r][c] -= vr * vc * weight;
            }
          }
          exitPointer += 1;
          continue;
        }
        break;
      }
      const eventCount = group.eventCount || eventIndices.length;
      const observedSum = new Array(predictors).fill(0);
      let eventWeightSum = 0;
      const eventWeightedX = new Array(predictors).fill(0);
      const eventWeightedXX = createZeroMatrix(predictors);
      eventIndices.forEach(eventIndex => {
        const obs = data[eventIndex];
        if(!obs){
          return;
        }
        const eventWeight = weights[eventIndex];
        eventWeightSum += eventWeight;
        logLik += xbValues[eventIndex];
        for(let r = 0; r < predictors; r += 1){
          const xr = obs.covariates[r] ?? 0;
          observedSum[r] += xr;
          eventWeightedX[r] += eventWeight * xr;
          for(let c = 0; c < predictors; c += 1){
            const xc = obs.covariates[c] ?? 0;
            eventWeightedXX[r][c] += eventWeight * xr * xc;
          }
        }
      });
      for(let r = 0; r < predictors; r += 1){
        gradient[r] += observedSum[r];
      }
      for(let tiedIndex = 0; tiedIndex < eventCount; tiedIndex += 1){
        const fraction = tiedIndex / eventCount;
        const adjustedDenom = Math.max(denom - fraction * eventWeightSum, 1e-12);
        logLik -= Math.log(adjustedDenom);
        const expectedX = weightedX.map((value, r) => (value - fraction * eventWeightedX[r]) / adjustedDenom);
        for(let r = 0; r < predictors; r += 1){
          gradient[r] -= expectedX[r];
          for(let c = 0; c < predictors; c += 1){
            const expectedXX = (weightedXX[r][c] - fraction * eventWeightedXX[r][c]) / adjustedDenom;
            fisher[r][c] += expectedXX - expectedX[r] * expectedX[c];
          }
        }
      }
      const denomSafe = Math.max(denom, 1e-12);
      while(exitPointer < exitOrder.length){
        const candidateIndex = exitOrder[exitPointer];
        const obs = data[candidateIndex];
        if(!obs){
          exitPointer += 1;
          continue;
        }
        if(obs.time <= timeValue + epsilon){
          const weight = weights[candidateIndex];
          denom -= weight;
          for(let r = 0; r < predictors; r += 1){
            const vr = obs.covariates[r] ?? 0;
            weightedX[r] -= vr * weight;
            for(let c = 0; c < predictors; c += 1){
              const vc = obs.covariates[c] ?? 0;
              weightedXX[r][c] -= vr * vc * weight;
            }
          }
          exitPointer += 1;
          continue;
        }
        break;
      }
      if(idx < 5){
        logDebug('cox risk window evaluated', {
          time: group.time,
          riskCount: group.atRiskCount,
          activeDenom: denomSafe,
          eventCount
        });
      }
    });
    return { gradient, fisher, logLik };
  }

  function summarizeNumericSeries(values){
    const clean = Array.isArray(values) ? values.map(Number).filter(Number.isFinite) : [];
    if(!clean.length){
      return null;
    }
    const mean = clean.reduce((sum, value) => sum + value, 0) / clean.length;
    const variance = clean.length > 1
      ? clean.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / (clean.length - 1)
      : 0;
    return {
      mean,
      sd: Math.sqrt(Math.max(variance, 0)),
      min: Math.min(...clean),
      max: Math.max(...clean),
      count: clean.length
    };
  }

  function computePearsonCorrelation(valuesA, valuesB){
    const points = [];
    const maxLength = Math.min(valuesA?.length || 0, valuesB?.length || 0);
    for(let idx = 0; idx < maxLength; idx += 1){
      const x = Number(valuesA[idx]);
      const y = Number(valuesB[idx]);
      if(Number.isFinite(x) && Number.isFinite(y)){
        points.push({ x, y });
      }
    }
    if(points.length < 3){
      return null;
    }
    const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    points.forEach(point => {
      const dx = point.x - meanX;
      const dy = point.y - meanY;
      sxx += dx * dx;
      syy += dy * dy;
      sxy += dx * dy;
    });
    const denom = Math.sqrt(sxx * syy);
    if(!(denom > 0)){
      return null;
    }
    return sxy / denom;
  }

  function computeCoxDerivedEventStats(prepared, beta){
    if(!prepared || !Array.isArray(prepared.data) || !Array.isArray(prepared.eventsByTime)){
      return null;
    }
    const { data, predictors, eventsByTime } = prepared;
    const entryOrder = Array.isArray(prepared.entryOrder) && prepared.entryOrder.length === data.length
      ? prepared.entryOrder
      : data.map((_, idx) => idx);
    const exitOrder = Array.isArray(prepared.exitOrder) && prepared.exitOrder.length === data.length
      ? prepared.exitOrder
      : data.map((_, idx) => idx);
    const weights = new Array(data.length);
    const linearPredictors = new Array(data.length);
    for(let i = 0; i < data.length; i += 1){
      const xb = dotProduct(data[i].covariates, beta);
      linearPredictors[i] = xb;
      weights[i] = safeExp(xb);
    }
    let denom = 0;
    const weightedX = new Array(predictors).fill(0);
    let entryPointer = 0;
    let exitPointer = 0;
    const epsilon = 1e-9;
    const eventGroups = [];
    eventsByTime.forEach(group => {
      const timeValue = Number.isFinite(group?.time) ? group.time : 0;
      while(entryPointer < entryOrder.length){
        const obs = data[entryOrder[entryPointer]];
        const entryTime = Number.isFinite(obs?.entry) ? obs.entry : 0;
        if(entryTime <= timeValue + epsilon){
          const weight = weights[entryOrder[entryPointer]];
          denom += weight;
          for(let idx = 0; idx < predictors; idx += 1){
            weightedX[idx] += weight * Number(obs?.covariates?.[idx] || 0);
          }
          entryPointer += 1;
        }else{
          break;
        }
      }
      while(exitPointer < exitOrder.length){
        const obs = data[exitOrder[exitPointer]];
        if(Number(obs?.time) < timeValue - epsilon){
          const weight = weights[exitOrder[exitPointer]];
          denom -= weight;
          for(let idx = 0; idx < predictors; idx += 1){
            weightedX[idx] -= weight * Number(obs?.covariates?.[idx] || 0);
          }
          exitPointer += 1;
        }else{
          break;
        }
      }
      if(!(denom > 0) || !Array.isArray(group?.eventIndices) || !group.eventIndices.length){
        return;
      }
      const eventCount=group.eventIndices.length;
      let eventWeightSum=0;
      const eventWeightedX=new Array(predictors).fill(0);
      group.eventIndices.forEach(eventIndex=>{
        const obs=data[eventIndex];
        const weight=weights[eventIndex];
        eventWeightSum+=weight;
        for(let index=0;index<predictors;index++){
          eventWeightedX[index]+=weight*Number(obs?.covariates?.[index] || 0);
        }
      });
      let hazardIncrement=0;
      const meanAccumulator=new Array(predictors).fill(0);
      for(let tiedIndex=0;tiedIndex<eventCount;tiedIndex++){
        const fraction=tiedIndex/eventCount;
        const adjustedDenom=Math.max(denom-fraction*eventWeightSum,1e-12);
        hazardIncrement+=1/adjustedDenom;
        for(let index=0;index<predictors;index++){
          meanAccumulator[index]+=(weightedX[index]-fraction*eventWeightedX[index])/adjustedDenom;
        }
      }
      eventGroups.push({
        time: timeValue,
        eventIndices: group.eventIndices.slice(),
        eventCount,
        hazardIncrement,
        weightedMean: meanAccumulator.map(value=>value/eventCount)
      });
    });
    return { weights, linearPredictors, eventGroups };
  }

  function computeHarrellConcordance(prepared, linearPredictors){
    const data = Array.isArray(prepared?.data) ? prepared.data : [];
    if(!data.length || !Array.isArray(linearPredictors) || linearPredictors.length !== data.length){
      return null;
    }
    let comparable = 0;
    let concordant = 0;
    let tied = 0;
    for(let i = 0; i < data.length; i += 1){
      for(let j = i + 1; j < data.length; j += 1){
        const obsA = data[i];
        const obsB = data[j];
        if(!Number.isFinite(obsA?.time) || !Number.isFinite(obsB?.time) || obsA.time === obsB.time){
          continue;
        }
        let early = obsA;
        let late = obsB;
        let earlyScore = linearPredictors[i];
        let lateScore = linearPredictors[j];
        if(obsB.time < obsA.time){
          early = obsB;
          late = obsA;
          earlyScore = linearPredictors[j];
          lateScore = linearPredictors[i];
        }
        if(!early.event || early.time >= late.time){
          continue;
        }
        comparable += 1;
        if(earlyScore > lateScore){
          concordant += 1;
        }else if(earlyScore === lateScore){
          tied += 1;
        }
      }
    }
    if(comparable <= 0){
      return null;
    }
    const c = (concordant + (0.5 * tied)) / comparable;
    return {
      c,
      comparable,
      concordant,
      tied,
      varianceMethod: null,
      inferenceAvailable: false
    };
  }

  function computeCoxDiagnosticsSummary(prepared, beta, coefficients){
    const derived = computeCoxDerivedEventStats(prepared, beta);
    if(!derived){
      return null;
    }
    const martingale = [];
    const deviance = [];
    const coxSnell = [];
    const schoenfeldByPredictor = Array.from({ length: prepared.predictors }, (_, idx) => ({
      label: coefficients[idx]?.label || `Predictor ${idx + 1}`,
      logTimes: [],
      scaledResiduals: []
    }));
    prepared.data.forEach((obs, obsIndex) => {
      const baselineHazard = derived.eventGroups.reduce((sum, group) => {
        if(group.time + 1e-9 < (Number.isFinite(obs.entry) ? obs.entry : 0)){
          return sum;
        }
        if(group.time <= obs.time + 1e-9){
          return sum + group.hazardIncrement;
        }
        return sum;
      }, 0);
      const cumulativeHazard = derived.weights[obsIndex] * baselineHazard;
      const martingaleResidual = Number(obs.event || 0) - cumulativeHazard;
      const safeArgument = Math.max(1e-12, Number(obs.event || 0) - martingaleResidual);
      const devianceResidual = martingaleResidual === 0
        ? 0
        : Math.sign(martingaleResidual) * Math.sqrt(Math.max(0, -2 * (martingaleResidual + (Number(obs.event || 0) * Math.log(safeArgument)))));
      martingale.push(martingaleResidual);
      deviance.push(devianceResidual);
      coxSnell.push(cumulativeHazard);
    });
    derived.eventGroups.forEach(group => {
      const logTime = Math.log(Math.max(group.time, 1e-6));
      group.eventIndices.forEach(eventIndex => {
        const obs = prepared.data[eventIndex];
        if(!obs){
          return;
        }
        for(let predictorIndex = 0; predictorIndex < prepared.predictors; predictorIndex += 1){
          const residual = Number(obs.covariates?.[predictorIndex] || 0) - Number(group.weightedMean?.[predictorIndex] || 0);
          const scale = Math.max(Number(coefficients[predictorIndex]?.se) || 0, 1e-6);
          schoenfeldByPredictor[predictorIndex].logTimes.push(logTime);
          schoenfeldByPredictor[predictorIndex].scaledResiduals.push(residual / scale);
        }
      });
    });
    return {
      concordance: computeHarrellConcordance(prepared, derived.linearPredictors),
      martingale: summarizeNumericSeries(martingale),
      deviance: summarizeNumericSeries(deviance),
      coxSnell: summarizeNumericSeries(coxSnell),
      schoenfeld: schoenfeldByPredictor.map(entry => ({
        predictor: entry.label,
        correlation: computePearsonCorrelation(entry.logTimes, entry.scaledResiduals),
        meanAbs: entry.scaledResiduals.length
          ? entry.scaledResiduals.reduce((sum, value) => sum + Math.abs(value), 0) / entry.scaledResiduals.length
          : NaN
      }))
    };
  }

  function fitCoxModel(summary, options){
    const enabled = options?.enabled !== false;
    if(!enabled){
      return { available: false, message: 'Cox model fitting disabled.' };
    }
    const prepared = prepareCoxData(summary);
    if(!prepared.available){
      logDebug('cox preparation failed', { message: prepared.message });
      return { available: false, message: prepared.message };
    }
    const { predictors, baselineGroup } = prepared;
    let beta = new Array(predictors).fill(0);
    let covariance = null;
    let converged = false;
    let iterations = 0;
    let ridgeEpsilon = null;
    for(iterations = 0; iterations < 25; iterations += 1){
      const evaluation = evaluateCoxAt(beta, prepared);
      const fisherInv = tryInvertMatrix(evaluation.fisher, { context: 'cox fisher', iteration: iterations });
      if(!fisherInv){
        logDebug('cox iteration inversion failed', { iteration: iterations });
        return { available: false, message: 'Failed to invert Fisher information matrix.' };
      }
      if(fisherInv.__ridgeEpsilon){
        ridgeEpsilon = Math.max(Number(ridgeEpsilon) || 0, Number(fisherInv.__ridgeEpsilon) || 0);
        logDebug('cox fisher ridge applied', { iteration: iterations, epsilon: fisherInv.__ridgeEpsilon });
      }
      const step = multiplyMatrixVector(fisherInv, evaluation.gradient);
      let maxChange = 0;
      beta = beta.map((value, idx) => {
        const limited = Math.max(Math.min(step[idx], 2), -2);
        maxChange = Math.max(maxChange, Math.abs(limited));
        return value + limited;
      });
      logDebug('cox iteration step', { iteration: iterations, maxChange });
      if(maxChange < 1e-6){
        converged = true;
        covariance = fisherInv;
        break;
      }
      covariance = fisherInv;
    }
    if(!covariance){
      const fallbackEval = evaluateCoxAt(beta, prepared);
      covariance = tryInvertMatrix(fallbackEval.fisher, { context: 'cox fisher fallback' });
      if(!covariance){
        logDebug('cox covariance fallback failed');
        return { available: false, message: 'Unable to compute covariance for Cox model.' };
      }
      if(covariance.__ridgeEpsilon){
        ridgeEpsilon = Math.max(Number(ridgeEpsilon) || 0, Number(covariance.__ridgeEpsilon) || 0);
        logDebug('cox covariance ridge applied', { epsilon: covariance.__ridgeEpsilon });
      }
    }
    const finalEval = evaluateCoxAt(beta, prepared);
    const finalCovariance = tryInvertMatrix(finalEval.fisher, { context: 'cox final fisher' });
    if(finalCovariance){
      covariance = finalCovariance;
      if(finalCovariance.__ridgeEpsilon){
        ridgeEpsilon = Math.max(Number(ridgeEpsilon) || 0, Number(finalCovariance.__ridgeEpsilon) || 0);
      }
    }
    const inferenceAvailable = converged && !!covariance && !(Number(ridgeEpsilon) > 0);
    const nullEval = evaluateCoxAt(new Array(predictors).fill(0), prepared);
    const designPredictors = Array.isArray(prepared.design?.predictors) ? prepared.design.predictors : [];
    const coefficients = designPredictors.map((predictor, idx) => {
      const coef = beta[idx];
      const variance = inferenceAvailable ? Math.max(covariance[idx]?.[idx] ?? NaN, 0) : NaN;
      const se = Number.isFinite(variance) ? Math.sqrt(variance) : NaN;
      const hr = Math.exp(coef);
      const ciLow = Number.isFinite(se) && se > 0 ? Math.exp(coef - 1.96 * se) : NaN;
      const ciHigh = Number.isFinite(se) && se > 0 ? Math.exp(coef + 1.96 * se) : NaN;
      const z = Number.isFinite(se) && se > 0 ? coef / se : NaN;
      const p = Number.isFinite(z) ? pValueFromZ(z) : NaN;
      const label = predictor.label || predictor.groupName || `Predictor ${idx + 1}`;
      const entry = {
        key: predictor.key || `predictor:${idx}`,
        label,
        type: predictor.type || 'baseline',
        beta: coef,
        se,
        hazardRatio: hr,
        ciLow,
        ciHigh,
        z,
        p
      };
      if(predictor.type === 'group'){
        entry.group = predictor.groupName;
      } else if(Number.isFinite(predictor.columnIndex)){
        entry.columnIndex = predictor.columnIndex;
      }
      return entry;
    });
    const coefficientIndex = {};
    coefficients.forEach((coef, idx) => {
      coefficientIndex[coef.key] = idx;
      if(coef.type === 'group' && coef.group){
        coefficientIndex[coef.group] = idx;
      }
    });
    const likelihoodRatio = {
      statistic: 2 * (finalEval.logLik - nullEval.logLik),
      df: predictors,
      p: pValueFromChiSquare(2 * (finalEval.logLik - nullEval.logLik), predictors)
    };
    const diagnostics = {
      logLikelihood: finalEval.logLik,
      logLikelihoodNull: nullEval.logLik,
      aic: -2 * finalEval.logLik + 2 * predictors,
      bic: -2 * finalEval.logLik + predictors * Math.log(prepared.data.length),
      likelihoodRatio,
      iterations: iterations + 1,
      converged,
      inferenceAvailable,
      ridgeEpsilon: Number(ridgeEpsilon) > 0 ? Number(ridgeEpsilon) : null
    };
    const residualDiagnostics = computeCoxDiagnosticsSummary(prepared, beta, coefficients);
    if(residualDiagnostics){
      diagnostics.concordance = residualDiagnostics.concordance;
      diagnostics.residuals = {
        martingale: residualDiagnostics.martingale,
        deviance: residualDiagnostics.deviance,
        coxSnell: residualDiagnostics.coxSnell,
        schoenfeld: residualDiagnostics.schoenfeld
      };
    }
    const debugMetrics = {
      recordCount: prepared.data.length,
      eventGroupCount: Array.isArray(prepared.eventsByTime) ? prepared.eventsByTime.length : 0,
      maxRiskCount: prepared.maxRiskCount || 0,
      truncated: !!prepared.truncated
    };
    const result = {
      available: true,
      baselineGroup,
      coefficients,
      covariance,
      coefficientIndex,
      design: prepared.design,
      diagnostics,
      converged,
      message: !converged
        ? 'Cox model reached the iteration limit; coefficient inference is unavailable.'
        : (Number(ridgeEpsilon) > 0
          ? 'Cox model required ridge stabilization; ordinary Wald inference is unavailable.'
          : 'Cox model converged.'),
      debug: debugMetrics
    };
    logDebug('cox model fitted', {
      converged,
      iterations: diagnostics.iterations,
      coefficientCount: coefficients.length,
      logLik: diagnostics.logLikelihood,
      predictorLabels: coefficients.map(coef => coef.label),
      recordCount: debugMetrics.recordCount,
      eventGroupCount: debugMetrics.eventGroupCount,
      truncated: debugMetrics.truncated
    });
    return result;
  }

  function resolveCoxInferenceContract(coxModel){
    if(!coxModel || !coxModel.available){
      return { available: false, reason: coxModel?.message || 'Cox model unavailable.' };
    }
    if(coxModel?.diagnostics?.inferenceAvailable !== true){
      return { available: false, reason: coxModel?.message || 'Ordinary Cox Wald inference is unavailable for this fit.' };
    }
    if(!Array.isArray(coxModel.covariance)){
      return { available: false, reason: 'Cox variance–covariance matrix is unavailable.' };
    }
    return { available: true, reason: null };
  }

  function computeHazardRatios(series, coxModel, options){
    const enabled = options?.enabled !== false;
    if(!enabled){
      return { available: false, inferenceAvailable: false, message: 'Hazard ratio table disabled.' };
    }
    if(!coxModel || !coxModel.available){
      const message = coxModel?.message || 'Hazard ratios unavailable.';
      logDebug('hazard ratios skipped', { message });
      return { available: false, inferenceAvailable: false, message };
    }
    if(!Array.isArray(series) || series.length < 2){
      return { available: false, inferenceAvailable: false, message: 'At least two groups required for hazard ratios.' };
    }
    const inference = resolveCoxInferenceContract(coxModel);
    const rows = [];
    const cov = inference.available ? coxModel.covariance : null;
    const indexMap = coxModel.coefficientIndex || {};
    for(let i = 0; i < series.length; i += 1){
      for(let j = i + 1; j < series.length; j += 1){
        const groupA = series[i];
        const groupB = series[j];
        const idxA = indexMap[groupA.name];
        const idxB = indexMap[groupB.name];
        const betaA = Number.isFinite(idxA) ? coxModel.coefficients[idxA]?.beta ?? 0 : 0;
        const betaB = Number.isFinite(idxB) ? coxModel.coefficients[idxB]?.beta ?? 0 : 0;
        const diff = betaB - betaA;
        const hr = Math.exp(diff);
        let ciLow = null;
        let ciHigh = null;
        let z = null;
        let p = null;
        if(Array.isArray(cov)){
          const varA = Number.isFinite(idxA) ? cov[idxA]?.[idxA] ?? 0 : 0;
          const varB = Number.isFinite(idxB) ? cov[idxB]?.[idxB] ?? 0 : 0;
          const covAB = Number.isFinite(idxA) && Number.isFinite(idxB) ? cov[idxA]?.[idxB] ?? 0 : 0;
          const variance = varA + varB - 2 * covAB;
          if(Number.isFinite(variance) && variance > 0){
            const se = Math.sqrt(variance);
            ciLow = Math.exp(diff - 1.96 * se);
            ciHigh = Math.exp(diff + 1.96 * se);
            z = diff / se;
            p = pValueFromZ(z);
          }
        }
        rows.push({
          groupA: groupA.name,
          groupB: groupB.name,
          hazardRatio: hr,
          ciLow,
          ciHigh,
          z,
          p,
          inferenceAvailable: inference.available,
          inferenceReason: inference.reason
        });
      }
    }
    logDebug('hazard ratios computed', { pairCount: rows.length, inferenceAvailable: inference.available });
    return {
      available: rows.length > 0,
      rows,
      baselineGroup: coxModel.baselineGroup,
      inferenceAvailable: inference.available,
      inferenceReason: inference.reason,
      message: rows.length ? (inference.available ? null : inference.reason) : 'No comparisons available.'
    };
  }

  function computePairwiseSurvivalComparisons(series, method = 'holm-sidak'){
    if(!Array.isArray(series) || series.length < 2){
      return { available: false, message: 'Pairwise survival comparisons require at least two groups.' };
    }
    const rows = [];
    for(let i = 0; i < series.length; i += 1){
      for(let j = i + 1; j < series.length; j += 1){
        const subset = [series[i], series[j]];
        const result = computeLogRank(subset);
        rows.push({
          groupA: series[i].name,
          groupB: series[j].name,
          chi2: result.chi2,
          df: result.df,
          p: result.p
        });
      }
    }
    const adjuster = Shared.stats?.adjustPValues;
    const metaResolver = Shared.stats?.getCorrectionMeta;
    const adjusted = typeof adjuster === 'function'
      ? adjuster(rows.map(row => row.p), { method })
      : rows.map(row => row.p);
    rows.forEach((row, index) => {
      row.adjustedP = Array.isArray(adjusted) && Number.isFinite(adjusted[index]) ? adjusted[index] : row.p;
    });
    const correctionMeta = typeof metaResolver === 'function'
      ? metaResolver(method)
      : { label: method, shortLabel: method, footnote: null };
    return {
      available: rows.length > 0,
      rows,
      correction: correctionMeta,
      message: rows.length ? null : 'No pairwise survival comparisons available.'
    };
  }

  function computeMedianSurvivalRatios(series){
    if(!Array.isArray(series) || series.length < 2){
      return { available: false, inferenceAvailable: false, message: 'Median survival ratios require at least two groups.' };
    }
    const rows = [];
    for(let i = 0; i < series.length; i += 1){
      for(let j = i + 1; j < series.length; j += 1){
        const groupA = series[i];
        const groupB = series[j];
        const medianA = Number(groupA?.km?.median);
        const medianB = Number(groupB?.km?.median);
        if(!(medianA > 0) || !(medianB > 0)){
          continue;
        }
        rows.push({
          groupA: groupA.name,
          groupB: groupB.name,
          ratio: medianB / medianA,
          ciLow: null,
          ciHigh: null,
          inferenceAvailable: false
        });
      }
    }
    return {
      available: rows.length > 0,
      rows,
      inferenceAvailable: false,
      message: rows.length ? 'Median survival ratios are descriptive estimates; no ratio confidence interval is reported.' : 'Median survival ratios unavailable.'
    };
  }

  function extendSteps(points, axisMax){
    const extended = points.map(pt => ({ time: pt.time, survival: pt.survival, value: pt.value }));
    if(!extended.length){
      return extended;
    }
    if(Number.isFinite(axisMax)){
      const last = extended[extended.length - 1];
      const lastTime = Number.isFinite(last.time) ? last.time : 0;
      if(axisMax > lastTime){
        const value = Number.isFinite(last.survival) ? last.survival : (Number.isFinite(last.value) ? last.value : 0);
        extended.push({ time: axisMax, survival: value, value });
      }
    }
    return extended;
  }

  function buildStepPath(points, axisMax, x2px, y2px, accessor){
    const extended = extendSteps(points, axisMax);
    if(!extended.length){
      return '';
    }
    const coords = extended.map(pt => {
      const time = Number.isFinite(pt.time) ? pt.time : 0;
      const value = Number.isFinite(accessor(pt)) ? accessor(pt) : 0;
      return { x: x2px(time), y: y2px(value) };
    });
    return coords.map((coord, index) => `${index === 0 ? 'M' : 'L'}${coord.x} ${coord.y}`).join(' ');
  }

  function buildConfidencePath(upper, lower, axisMax, x2px, y2px){
    const up = extendSteps(upper, axisMax);
    const low = extendSteps(lower, axisMax);
    if(!up.length || !low.length){
      return '';
    }
    const parts = [];
    up.forEach((pt, idx) => {
      const x = x2px(Number.isFinite(pt.time) ? pt.time : 0);
      const y = y2px(Number.isFinite(pt.value) ? pt.value : (Number.isFinite(pt.survival) ? pt.survival : 0));
      parts.push(`${idx === 0 ? 'M' : 'L'}${x} ${y}`);
    });
    for(let i = low.length - 1; i >= 0; i -= 1){
      const pt = low[i];
      const x = x2px(Number.isFinite(pt.time) ? pt.time : 0);
      const y = y2px(Number.isFinite(pt.value) ? pt.value : (Number.isFinite(pt.survival) ? pt.survival : 0));
      parts.push(`L${x} ${y}`);
    }
    parts.push('Z');
    return parts.join(' ');
  }

  function formatNumber(value, digits){
    if(!Number.isFinite(value)){
      return 'n/a';
    }
    const precision = Number.isFinite(digits) ? digits : 2;
    return chartStyle.formatScientific(value, { maxDecimals: precision });
  }

  function sanitizeSurvivalStatsReportPScientific(value){
    return value === true || value === 'true' || value === 1 || value === '1';
  }

  function getSurvivalStatsPValueScientificPreference(){
    const reporting = Shared.statsReporting;
    const tabId = getSurvivalProjectionTabId() || null;
    if(
      reporting
      && typeof reporting.hasPValueFormatScientific === 'function'
      && reporting.hasPValueFormatScientific({ target: refs.statsSummary, tabId })
      && typeof reporting.getPValueFormatScientific === 'function'
    ){
      return reporting.getPValueFormatScientific({ target: refs.statsSummary, tabId }) === true;
    }
    return sanitizeSurvivalStatsReportPScientific(state.statsReportPScientific);
  }

  function syncSurvivalStatsPValuePanelState(options = {}){
    if(!Shared.statsReporting || typeof Shared.statsReporting.setPanelPValueFormatScientific !== 'function'){
      return;
    }
    const preference = Object.prototype.hasOwnProperty.call(options, 'preferenceOverride')
      ? sanitizeSurvivalStatsReportPScientific(options.preferenceOverride)
      : getSurvivalStatsPValueScientificPreference();
    state.statsReportPScientific = preference;
    const select = refs.statsPValueFormat?.querySelector?.('.stats-pvalue-format-select') || null;
    if(select){
      select.value = preference ? 'scientific' : 'decimal';
      select.setAttribute('data-parameter-p-value-scientific', preference ? 'true' : 'false');
    }
    [refs.statsSummary, refs.statsLogRank, refs.statsHazardRatios, refs.statsCox].forEach(panel => {
      if(panel){
        Shared.statsReporting.setPanelPValueFormatScientific(panel, preference, {
          source: 'survival',
          tabId: getSurvivalProjectionTabId() || null
        });
      }
    });
  }

  function setSurvivalStatsPValueScientific(value, options = {}){
    const next = sanitizeSurvivalStatsReportPScientific(value);
    if(state.statsReportPScientific === next && options.force !== true){
      return next;
    }
    state.statsReportPScientific = next;
    syncSurvivalStateToSession(getSurvivalProjectionSession({ reason: 'survival-projection-mutation' }), { statsReportPScientific: next });
    if(Shared.statsReporting && typeof Shared.statsReporting.setPValueFormatScientific === 'function'){
      Shared.statsReporting.setPValueFormatScientific(next, {
        target: refs.statsSummary || null,
        tabId: options.tabId || getSurvivalProjectionTabId() || null,
        source: options.source || 'survival',
        persist: true
      });
    }
    syncSurvivalStatsPValuePanelState();
    if(state.lastSummary && Array.isArray(state.lastSummary.series)){
      updateStats(state.lastSummary);
    }else if(Shared.statsReporting && typeof Shared.statsReporting.refreshEnhancedPanels === 'function'){
      Shared.statsReporting.refreshEnhancedPanels('survival-pvalue-format');
    }
    return next;
  }

  function attachSurvivalStatsPValueControlFactory(){
    const host = refs.statsPValueFormat;
    if(!host || !Shared.statsReporting?.createPValueFormatControl){
      return;
    }
    syncSurvivalStatsPValuePanelState();
    host.textContent = '';
    const control = Shared.statsReporting.createPValueFormatControl(refs.statsSummary || host, {
      document: host.ownerDocument || document,
      tabId: getSurvivalProjectionTabId() || null,
      onChange: (nextScientific, _event, owner) => setSurvivalStatsPValueScientific(nextScientific, {
        source: 'survival-control',
        tabId: owner?.tabId || getSurvivalProjectionTabId() || null
      })
    });
    if(control){
      host.appendChild(control);
      host.hidden = false;
    }else{
      host.hidden = true;
    }
  }

  function formatP(value){
    if(!Number.isFinite(value)){
      return 'n/a';
    }
    const formatter = Shared.formatters?.formatPValue || Shared.formatPValue;
    const scientific = getSurvivalStatsPValueScientificPreference();
    if(typeof formatter === 'function'){
      return formatter(value, { scientific, forceScientific: scientific });
    }
    if(scientific){
      return Shared.formatters?.formatScientificNumber?.(Number(value), { fractionalDigits: 5 }) || String(Number(value));
    }
    return value >= 0 && value <= 0.0001
      ? '<0.0001'
      : Number(value).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  }

  function formatSurvivalPExpression(value){
    const reporting = Shared.statsReporting;
    if(reporting && typeof reporting.formatPValueExpression === 'function'){
      return reporting.formatPValueExpression(value, {
        label: 'p',
        target: refs.statsSummary || refs.statsLogRank || null,
        tabId: getSurvivalProjectionTabId() || null
      });
    }
    const display = String(formatP(value));
    const match = /^(<=|>=|≤|≥|<|>)\s*(.*)$/.exec(display);
    return match ? `p ${match[1]} ${match[2]}` : `p = ${display}`;
  }

  function getSurvivalStatsInferenceTabId(){
    return String(getSurvivalProjectionTabId() || '').trim() || null;
  }

  function getSurvivalStatsAlpha(){
    const inference = Shared.statsInference;
    return inference?.getAlpha?.({ tabId: getSurvivalStatsInferenceTabId() })
      ?? inference?.DEFAULT_ALPHA
      ?? 0.05;
  }

  function createSurvivalInferenceSpec(options = {}){
    const inference = Shared.statsInference;
    if(!inference?.createDecisionSpec){
      return null;
    }
    const method = options.method || 'none';
    return inference.createDecisionSpec({
      tabId: getSurvivalStatsInferenceTabId(),
      method,
      criterion: options.criterion,
      valueKind: options.valueKind || (method === 'none' ? 'raw-p' : 'adjusted-p')
    });
  }

  function getSurvivalPairwiseInferenceSpec(){
    return createSurvivalInferenceSpec({
      method: state.pairwiseCorrection || 'holm-sidak',
      valueKind: 'adjusted-p'
    });
  }

  function getSurvivalInferenceSnapshot(){
    return Shared.statsInference?.createSnapshot?.({
      tabId: getSurvivalStatsInferenceTabId(),
      includeOverall: true,
      includeComparisons: true,
      method: state.pairwiseCorrection || 'holm-sidak'
    }) || null;
  }

  function pValueToken(value, inferenceSpec = null){
    const numeric = Number(value);
    if(!Number.isFinite(numeric)){
      return 'n/a';
    }
    if(Shared.statsReporting && typeof Shared.statsReporting.pValue === 'function'){
      return Shared.statsReporting.pValue(numeric, {
        fallback: String(formatP(numeric)),
        inference: inferenceSpec || undefined
      });
    }
    return formatP(numeric);
  }

  function ensureSurvivalStatsInferenceControls(){
    const host = getSurvivalNodeById('survivalStatsInferenceControls');
    const inference = Shared.statsInference;
    if(!host || !inference?.mountControls){
      return null;
    }
    if(host.__survivalStatsInferenceController){
      host.__survivalStatsInferenceController.refresh?.();
      return host.__survivalStatsInferenceController;
    }
    host.__survivalStatsInferenceController = inference.mountControls(host, {
      tabId: () => getSurvivalStatsInferenceTabId(),
      includeOverall: true,
      includeComparisons: true,
      method: () => state.pairwiseCorrection || 'holm-sidak',
      source: 'survival-stats-inference',
      onChange(){
        const session = getActiveSurvivalSessionForState();
        if(session){
          scheduleSurvivalDrawForSession(session, {
            reason: 'survival-stats-inference-change',
            tabId: session.tabId || undefined,
            userInitiated: true
          });
        }
      }
    });
    return host.__survivalStatsInferenceController;
  }

  function renderStatsValue(value){
    const isPValueObject = value && typeof value === 'object' && String(value.type || '').toLowerCase().replace(/[-_]/g, '') === 'pvalue';
    if((Array.isArray(value) || isPValueObject) && Shared.statsReporting && typeof Shared.statsReporting.renderTextParts === 'function'){
      return Shared.statsReporting.renderTextParts(Array.isArray(value) ? value : [value], {
        scientific: getSurvivalStatsPValueScientificPreference()
      });
    }
    return value != null ? String(value) : '';
  }

  function resolveSurvivalPValue(value){
    const resolver = Shared.stats?.finiteProbabilityOrFallback;
    if(typeof resolver === 'function'){
      return resolver(value, NaN);
    }
    const num = Number(value);
    if(!Number.isFinite(num)){
      return NaN;
    }
    return Math.max(0, Math.min(1, num));
  }

  function survivalNormalTwoSidedPValue(z){
    const helper = Shared.stats?.normalTwoSidedPValue;
    if(typeof helper === 'function'){
      return resolveSurvivalPValue(helper(z));
    }
    const absZ = Math.abs(Number(z));
    const tail = 1 - normalCDF(absZ);
    return resolveSurvivalPValue(2 * tail);
  }

  function survivalChiSquareUpperTailPValue(statistic, df){
    const helper = Shared.stats?.chiSquareUpperTail;
    if(typeof helper === 'function'){
      return resolveSurvivalPValue(helper(statistic, df));
    }
    if(global.jStat?.chisquare?.cdf){
      const cdf = global.jStat.chisquare.cdf(statistic, df);
      return resolveSurvivalPValue(Number.isFinite(cdf) ? 1 - cdf : NaN);
    }
    return NaN;
  }

  function formatInterval(low, high){
    if(Number.isFinite(low) && Number.isFinite(high)){
      return `${formatNumber(low, 3)} – ${formatNumber(high, 3)}`;
    }
    return 'n/a';
  }

  function renderStatsLead(target, text){
    if(!target){
      return;
    }
    clearSurvivalStatsReportHost(target);
    target.innerHTML = '';
    const lead = document.createElement('div');
    lead.className = 'stats-table-lead';
    lead.textContent = text;
    target.appendChild(lead);
  }

  function renderStatsTableCard(target, model){
    if(!target){
      return false;
    }
    const statsRenderer = Shared.statsTable?.render;
    if(typeof statsRenderer === 'function'){
      statsRenderer({ target, ...model });
      return true;
    }
    if(!model?.append){
      clearSurvivalStatsReportHost(target);
      target.innerHTML = '';
    }
    if(model.caption){
      const caption = document.createElement('div');
      caption.className = 'stats-table-lead';
      caption.textContent = model.caption;
      if(typeof model.section === 'string'){
        caption.setAttribute('data-stats-section', model.section);
      }
      target.appendChild(caption);
    }
    if(Array.isArray(model.columns) && model.columns.length){
      const table = document.createElement('table');
      table.className = 'stats-table stats-table--fallback';
      if(typeof model.section === 'string'){
        table.setAttribute('data-stats-section', model.section);
      }
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      model.columns.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col.label;
        th.style.textAlign = col.align === 'right' ? 'right' : (col.align === 'center' ? 'center' : 'left');
        if(col.tooltip){
          th.title = col.tooltip;
        }
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      (model.rows || []).forEach(row => {
        const tr = document.createElement('tr');
        model.columns.forEach(col => {
          const td = document.createElement('td');
          td.style.textAlign = col.align === 'right' ? 'right' : (col.align === 'center' ? 'center' : 'left');
          const value = row?.[col.key];
          td.textContent = renderStatsValue(value);
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      target.appendChild(table);
    }
    if(Array.isArray(model.footnotes) && model.footnotes.length){
      const footnoteList = document.createElement('div');
      footnoteList.className = 'stats-table-footnotes';
      model.footnotes.forEach(note => {
        const entry = document.createElement('div');
        entry.className = 'stats-table-footnote';
        entry.textContent = renderStatsValue(note);
        footnoteList.appendChild(entry);
      });
      target.appendChild(footnoteList);
    }
    return false;
  }

  function autoResizeSvgHelper(svg){
    if(!svg){
      logDebug('autoResizeSvgHelper skipped', { hasSvg: false });
      return;
    }
    const options = {
      padding: 18,
      debugLabel: 'survival-graph',
      component: 'survival',
      preserveAspectRatio: 'xMidYMid meet',
      fitContent: false
    };
    const width = Number(svg.getAttribute?.('width'));
    const height = Number(svg.getAttribute?.('height'));
    if(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0){
      options.baseViewport = { width, height };
    }
    ensureGraphViewport(svg, options);
  }

  const survivalOverlayController = Shared.loadingOverlay?.createPendingController?.({
    component: 'survival',
    message: 'Rendering survival graph...',
    isHeavy: Shared.loadingOverlay?.createTableHeavyPredicate?.({
      getHot: () => state.hot,
      startRow: 0,
      startCol: 0,
      rowThreshold: 1000,
      cellThreshold: 5000
    }),
    getTabId: () => getSurvivalProjectionTabId() || null,
    getHost: () => getSurvivalNodeById('survivalGraphPanel')?.querySelector?.('.svgbox') || getSurvivalNodeById('survivalGraphPanel')
  });

  function survivalAtRiskCount(group, time){
    if(!group || !Array.isArray(group.records) || !Number.isFinite(Number(time))){
      return 0;
    }
    const t = Number(time);
    return group.records.reduce((count, record) => {
      const entry = Number.isFinite(Number(record?.entry)) ? Number(record.entry) : 0;
      const exit = Number(record?.time);
      return count + (entry <= t && Number.isFinite(exit) && exit >= t ? 1 : 0);
    }, 0);
  }

  function survivalCumulativeCensoredCount(group, time){
    if(!group || !Array.isArray(group.records) || !Number.isFinite(Number(time))){
      return 0;
    }
    const t = Number(time);
    return group.records.reduce((count, record) => {
      const entry = Number.isFinite(Number(record?.entry)) ? Number(record.entry) : 0;
      const exit = Number(record?.time);
      const isCensored = record?.event === false || Number(record?.event) === 0;
      return count + (isCensored && entry <= t && Number.isFinite(exit) && exit <= t ? 1 : 0);
    }, 0);
  }

  function buildSurvivalPlotStatsLines(summary){
    if(!summary || !Array.isArray(summary.series) || !summary.series.length){
      return [];
    }
    if(summary.series.length === 2){
      const rows = Array.isArray(summary.hazardRatios?.rows) ? summary.hazardRatios.rows : [];
      const row = rows.length === 1 ? rows[0] : null;
      if(row && Number.isFinite(Number(row.hazardRatio))){
        const label = `HR ${row.groupB} vs ${row.groupA}`;
        const ci = Number.isFinite(Number(row.ciLow)) && Number.isFinite(Number(row.ciHigh))
          ? `; 95% CI [${formatNumber(Number(row.ciLow), 2)}, ${formatNumber(Number(row.ciHigh), 2)}]`
          : '';
        const pText = Number.isFinite(Number(row.p)) ? `; ${formatSurvivalPExpression(Number(row.p))}` : '';
        return [`${label} = ${formatNumber(Number(row.hazardRatio), 2)}${ci}${pText}`];
      }
    }
    const globalTest = summary.logRank;
    if(globalTest?.available && Number.isFinite(Number(globalTest.p))){
      const statistic = Number.isFinite(Number(globalTest.chi2)) ? `χ²(${Number(globalTest.df) || Math.max(1, summary.series.length - 1)}) = ${formatNumber(Number(globalTest.chi2), 2)}; ` : '';
      return [`Overall log-rank: ${statistic}${formatSurvivalPExpression(Number(globalTest.p))}`];
    }
    return [];
  }

  function resolveSurvivalRiskTableMetrics(fontSize){
    const normalizedFontSize = Math.max(1, Number(fontSize) || 12);
    return {
      fontSize: normalizedFontSize,
      rowHeight: Math.max(normalizedFontSize * 1.45, 16),
      titleGap: Math.max(normalizedFontSize * 1.35, 16),
      outerPad: Math.max(10, normalizedFontSize),
      bottomPad: Math.max(10, normalizedFontSize * 0.9),
      separatorPad: Math.max(5, normalizedFontSize * 0.45)
    };
  }

  const SURVIVAL_RISK_TABLE_TITLE = 'Number at risk (number censored)';

  function resolveSurvivalRiskTableLabelWidth(options = {}){
    const groups = Array.isArray(options.groups) ? options.groups : [];
    const metrics = resolveSurvivalRiskTableMetrics(options.fontSize || options.fontMeasure?.fontSizePx);
    const measureFont = options.fontMeasure?.fontSpec
      || (chartStyle.makeFont ? chartStyle.makeFont(metrics.fontSize) : `${metrics.fontSize}px sans-serif`);
    const measure = typeof options.measureText === 'function'
      ? options.measureText
      : (text => chartStyle.measureText
          ? chartStyle.measureText(String(text), measureFont)
          : String(text).length * metrics.fontSize * 0.6);
    const labelWidth = [SURVIVAL_RISK_TABLE_TITLE, ...groups.map(group => String(group?.name || ''))]
      .reduce((max, label) => Math.max(max, Number(measure(label)) || 0), 0);
    const maxRiskCount = groups.reduce((max, group) => Math.max(max, group?.records?.length || 0), 0);
    const countWidth = Math.max(Number(measure(`${maxRiskCount} (${maxRiskCount})`)) || 0, metrics.fontSize * 3);
    return Math.ceil(labelWidth + metrics.separatorPad * 2 + countWidth / 2 + metrics.outerPad);
  }

  function renderSurvivalRiskTable(svg, add, groups, ticks, x2px, options = {}){
    if(!svg || !Array.isArray(groups) || !groups.length || !Array.isArray(ticks) || !ticks.length){
      return 0;
    }
    const metrics = resolveSurvivalRiskTableMetrics(options.fontSize);
    const fontSize = metrics.fontSize;
    const left = Number(options.left) || 0;
    const yStart = Number(options.yStart) || 0;
    const rowHeight = metrics.rowHeight;
    const tabId = options.tabId || null;
    const textColor = chartStyle.TEXT_COLOR || '#000';
    const measureFont = chartStyle.makeFont ? chartStyle.makeFont(fontSize) : `${fontSize}px sans-serif`;
    const firstTick = ticks[0];
    const firstCountWidth = groups.reduce((max, group) => {
      const value = `${survivalAtRiskCount(group, firstTick)} (${survivalCumulativeCensoredCount(group, firstTick)})`;
      const measured = chartStyle.measureText ? chartStyle.measureText(value, measureFont) : value.length * fontSize * 0.6;
      return Math.max(max, Number(measured) || 0);
    }, 0);
    const separatorX = left - firstCountWidth / 2 - metrics.separatorPad;
    const labelX = separatorX - metrics.separatorPad;

    const heading = add('text', {
      x: labelX,
      y: yStart,
      'font-size': fontSize,
      'text-anchor': 'end',
      'dominant-baseline': 'middle',
      fill: textColor,
      'data-survival-risk-table': 'heading'
    });
    heading.textContent = SURVIVAL_RISK_TABLE_TITLE;
    markFontEditable(heading, 'riskTable', 'riskTable', tabId);

    add('line', {
      x1: separatorX,
      y1: yStart - fontSize * 0.8,
      x2: separatorX,
      y2: yStart + metrics.titleGap + rowHeight * groups.length - rowHeight * 0.35,
      stroke: '#000',
      'stroke-width': Math.max(0.6, fontSize * 0.055),
      'data-survival-risk-table': 'separator'
    });

    groups.forEach((group, rowIndex) => {
      const y = yStart + metrics.titleGap + rowHeight * rowIndex;
      const groupColor = group.color || textColor;
      const label = add('text', {
        x: labelX,
        y,
        'font-size': fontSize,
        'text-anchor': 'end',
        'dominant-baseline': 'middle',
        fill: groupColor,
        'data-survival-risk-table': 'label',
        'data-survival-series-color-target': 'fill',
        'data-group': group.name
      });
      label.textContent = group.name;
      markFontEditable(label, 'riskTable', 'riskTable', tabId);
      ticks.forEach(tick => {
        const atRisk = survivalAtRiskCount(group, tick);
        const censored = survivalCumulativeCensoredCount(group, tick);
        const text = add('text', {
          x: x2px(tick),
          y,
          'font-size': fontSize,
          'text-anchor': 'middle',
          'dominant-baseline': 'middle',
          fill: groupColor,
          'data-survival-risk-table': 'count',
          'data-survival-series-color-target': 'fill',
          'data-group': group.name,
          'data-time': tick,
          'data-at-risk': atRisk,
          'data-censored': censored
        });
        text.textContent = `${atRisk} (${censored})`;
        markFontEditable(text, 'riskTable', 'riskTable', tabId);
      });
    });
    return metrics.titleGap + rowHeight * groups.length;
  }

  function survivalParameterSlug(value){
    return String(value == null ? '' : value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function stampSurvivalParameterObservables(svg, session = null){
    if(!svg?.setAttribute){ return; }
    const axis = ensureAxisSettings(session);
    const grid = getGridStyle(axis.strokeWidth);
    const set = (name, value) => svg.setAttribute(`data-parameter-${name}`, value == null ? '' : String(value));
    set('axis-minor-tick-subdivisions-x', axis.x?.minorTickSubdivisions);
    set('axis-minor-tick-subdivisions-y', axis.y?.minorTickSubdivisions);
    set('axis-minor-ticks-x', !!axis.x?.minorTicks);
    set('axis-minor-ticks-y', !!axis.y?.minorTicks);
    set('grid-style-color', grid.color);
    set('grid-style-pattern', grid.pattern);
    set('grid-style-thickness', grid.thickness);
    set('grid-style-transparency', grid.transparency);
    Object.entries(state.labelColors || {}).forEach(([label, color]) => {
      const slug = survivalParameterSlug(label);
      if(slug){ set(`label-colors-${slug}`, color); }
    });
  }

  async function drawSurvival(options = {}, session = null){
    const drawSession = ensureSurvivalSessionOwnershipShape(session || getSurvivalSessionForDrawOptions(options));
    if(drawSession && !isSurvivalSessionActive(drawSession)){
      drawSession.state.drawPending = true;
      drawSession.updatedAt = Date.now();
      return false;
    }
    const drawTabId = drawSession?.tabId || options?.tabId || getSurvivalProjectionTabId() || null;
    const execution = Shared.jobs?.createExecutionContext?.({
      component: 'survival',
      tabId: drawTabId || '',
      kind: 'graph',
      budgetMs: 10,
      drawOptions: options
    }) || null;
    const checkpoint = async () => {
      try{ await execution?.checkpoint?.(); }
      catch(err){
        if(execution?.signal?.aborted || execution?.isCurrent?.() === false){ return false; }
        throw err;
      }
      return execution?.isCurrent?.() !== false;
    };
    let framePublication = null;
    try{
    const plotDiv = getSurvivalNodeById('survivalPlot', drawTabId) || refs.plotDiv || getSurvivalNodeById('survivalPlot');
    if(!plotDiv){
      if(drawSession){
        drawSession.state.drawPending = true;
        drawSession.updatedAt = Date.now();
      }
      return false;
    }
    refs.plotDiv = plotDiv;
    const debugStamp = Date.now();
    const controls = syncSurvivalRuntimeControlsFromDom(drawSession);
    logDebug('draw start', { debugStamp });
    const summary = collectSeries();
    if(!(await checkpoint())){
      return false;
    }
    refreshCovariateControls();
    const hazardRatiosEnabled = !!controls.showHazardRatios;
    const coxEnabled = !!controls.fitCoxModel;
    let coxModelSummary = { available: false, message: coxEnabled ? 'Cox model unavailable.' : 'Cox model fitting disabled.' };
    let hazardSummary = { available: false, message: hazardRatiosEnabled ? 'Hazard ratios unavailable.' : 'Hazard ratio table hidden.' };
    if(summary.series.length){
      const shouldFitCox = hazardRatiosEnabled || coxEnabled;
      if(shouldFitCox){
        coxModelSummary = fitCoxModel(summary, { enabled: shouldFitCox });
        if(!(await checkpoint())){
          return false;
        }
      }
      const selectedCovariateCount = Array.isArray(coxModelSummary?.design?.covariateSelections)
        ? coxModelSummary.design.covariateSelections.length
        : getSelectedCovariates(summary.covariateColumns).length;
      const needsSimpleCoxHazardRatio = coxEnabled && summary.series.length === 2 && selectedCovariateCount === 0;
      if(hazardRatiosEnabled || needsSimpleCoxHazardRatio){
        hazardSummary = computeHazardRatios(summary.series, coxModelSummary, {
          enabled: hazardRatiosEnabled || needsSimpleCoxHazardRatio
        });
      }
    }
    summary.logRankWilcoxon = summary.series.length ? computeGehanBreslowWilcoxon(summary.series) : { available: false };
    if(!(await checkpoint())){
      return false;
    }
    summary.logRankTrend = summary.series.length >= 3 ? computeLogRankTrend(summary.series) : { available: false };
    summary.pairwiseComparisons = summary.series.length >= 2
      ? computePairwiseSurvivalComparisons(summary.series, state.pairwiseCorrection || 'holm-sidak')
      : { available: false };
    summary.medianRatios = summary.series.length >= 2
      ? computeMedianSurvivalRatios(summary.series)
      : { available: false };
    summary.coxModel = coxModelSummary;
    summary.hazardRatios = hazardSummary;
    summary.flags = { hazardRatiosEnabled, coxEnabled };
    summary.inference = getSurvivalInferenceSnapshot();
    state.lastSummary = summary;
    renderSurvivalStatsAdvisor(summary, null, drawSession);
    logDebug('stat toggles resolved', { hazardRatiosEnabled, coxEnabled, coxAvailable: coxModelSummary.available });
    updateGroupColorPickers(summary.groupNames);
    if(!summary.series.length){
      if(typeof Shared.renderPlotNotice === 'function'){
        Shared.renderPlotNotice(refs.plotDiv, Shared.getEmptyPlotNoticeMessage ? Shared.getEmptyPlotNoticeMessage() : null, { resetAspect: true, show: true });
      }else{
        refs.plotDiv.innerHTML = '<i>Add data to the input table to generate a plot.</i>';
      }
      updateStats(summary);
      Shared.cartesianLayout?.clearPublishedLayout?.(refs.svgBox, {
        tabId: drawTabId,
        component: 'survival',
        generation: Number(execution?.owner?.sessionGeneration) || null
      });
      return;
    }
    const drawableFrame = resolveSurvivalDrawableFrame(refs.plotDiv);
    const baseWidth = Math.max(200, Math.floor(drawableFrame.width || 400));
    const height = Math.max(200, Math.floor(drawableFrame.height || 320));
    const fontInfo = chartStyle.resolveScaledFontSize ? chartStyle.resolveScaledFontSize({
      rawSize: controls.fontSize,
      width: drawableFrame.width,
      height: drawableFrame.height,
      svgBox: refs.svgBox,
      input: refs.fontSize
    }) : { scaledPx: Number(controls.fontSize) || 12, pt: Number(controls.fontSize) || 12, scaleInfo: { styleScale: 1 } };
    chartStyle.renderFontSizeLabel?.({ element: refs.fontSizeVal, fontInfo, input: refs.fontSize });
    const fs = fontInfo.scaledPx || 12;
    const styleScaleInfo = fontInfo.scaleInfo || { styleScale: 1 };
    const survivalFontStyles = exportFontStyles('survival', { tabId: drawSession?.tabId || drawTabId || null });
    const riskTableMeasure = chartStyle.resolveScopedLabelMeasureFont
      ? chartStyle.resolveScopedLabelMeasureFont({
          styles: survivalFontStyles,
          role: 'riskTable',
          fallbackPx: fs
        })
      : {
          fontSizePx: fs,
          fontSpec: chartStyle.makeFont?.(fs) || `${fs}px sans-serif`
        };
    const riskTableMetrics = resolveSurvivalRiskTableMetrics(riskTableMeasure.fontSizePx || fs);
    const riskTableFontSize = riskTableMetrics.fontSize;
    const riskTableExtraHeight = controls.showRiskTable
      ? Math.max(48, riskTableMetrics.titleGap + riskTableMetrics.rowHeight * summary.series.length + riskTableMetrics.bottomPad)
      : 0;
    const chartHeight = height;
    logDebug('draw dimensions resolved', { width: baseWidth, height, chartHeight, riskTableExtraHeight, riskTableFontSize });
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', String(baseWidth));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', `0 0 ${baseWidth} ${height}`);
    chartStyle.prepareSvg(svg, { scopeId: 'survival' });
    stampSurvivalParameterObservables(svg, drawSession);
    if(svg.dataset){
      svg.dataset.fontScope = 'survival';
    }
    framePublication = Shared.framePublication.stage({
      container: plotDiv,
      frame: svg,
      publishedId: 'survivalSvg',
      component: 'survival',
      tabId: drawTabId,
      canCommit: () => execution?.isCurrent?.() !== false
        && (!drawSession || isSurvivalSessionActive(drawSession))
    });

    const axisSettings = ensureAxisSettings();
    const axisStrokeWidthBase = axisSettings.strokeWidth;
    const axisStrokeWidth = chartStyle.scaleStrokeWidth ? chartStyle.scaleStrokeWidth(axisStrokeWidthBase, styleScaleInfo, { context: 'survival-axis', min: 0, exact: true }) : axisStrokeWidthBase;
    const axisStroke = axisSettings.color || '#000';
    const gridStyleBase = getGridStyle(axisStrokeWidthBase);
    const gridStrokeStyle = Object.assign({}, gridStyleBase, {
      thickness: chartStyle.scaleStrokeWidth ? chartStyle.scaleStrokeWidth(gridStyleBase.thickness, styleScaleInfo, { context: 'survival-grid', min: 0 }) : gridStyleBase.thickness
    });
    const gridStrokeAttrs = (gridControls && typeof gridControls.getStrokeAttributes === 'function')
      ? gridControls.getStrokeAttributes(gridStrokeStyle, { fallbackColor: DEFAULT_GRID_COLOR, fallbackThickness: axisStrokeWidth })
      : { stroke: DEFAULT_GRID_COLOR, 'stroke-width': axisStrokeWidth };
    const curveStrokeWidth = chartStyle.scaleStrokeWidth ? chartStyle.scaleStrokeWidth(2, styleScaleInfo, { context: 'survival-curve', min: 0.8 }) : 2;

    const axisMetrics = chartStyle.createAxisMetrics ? chartStyle.createAxisMetrics(fontInfo.px, styleScaleInfo) : { tickLength: 6, tickLabelGap: 6, axisTitleGap: 8, outerPadding: 8 };
    const tickLen = axisMetrics.tickLength ?? 6;
    const xMajorTickLength = getAxisMajorTickLength('x') ?? tickLen;
    const yMajorTickLength = getAxisMajorTickLength('y') ?? tickLen;
    const tickGap = axisMetrics.tickLabelGap ?? 6;
    const xLabelText = controls.xLabel?.trim() || 'Time';
    const yLabelText = controls.yLabel?.trim() || 'Survival Probability';
    const hasYTitle = yLabelText.trim().length > 0;

    ensureSurvivalLegendControlPlacement();
    const showLegend = controls.showLegend !== false;
    logDebug('legend state resolved', { showLegend, groupCount: summary.series.length });
    const legendStrokeWidth = curveStrokeWidth;
    const groupsForDraw = summary.series.map((group, index) => {
      const color = state.labelColors[group.name] || DEFAULT_COLORS[index % DEFAULT_COLORS.length];
      const configuredStrokeWidth = Number(state.labelStrokeWidth?.[group.name]);
      const configuredOpacity = Number(state.labelOpacity?.[group.name]);
      const configuredPattern = sanitizeSurvivalLinePattern(state.labelLinePattern?.[group.name] || 'solid');
      return {
        ...group,
        color,
        strokeWidth: Number.isFinite(configuredStrokeWidth) ? configuredStrokeWidth : curveStrokeWidth,
        strokeOpacity: Number.isFinite(configuredOpacity) ? Math.max(0, Math.min(1, configuredOpacity)) : 1,
        strokePattern: configuredPattern
      };
    });
    const legendEditable = typeof Shared.openColorPicker === 'function';
    const legendEntries = showLegend ? groupsForDraw.map(group => ({
      label: group.name,
      key: group.name,
      fill: group.color,
      stroke: group.color,
      strokeWidth: legendStrokeWidth,
      editable: legendEditable
    })) : [];
    const legendLayout = chartStyle.computeLegendLayout({
      entries: legendEntries,
      fontSize: fs,
      viewportHeight: chartHeight,
      scaleInfo: styleScaleInfo,
      strokeWidth: legendStrokeWidth,
      onSwatchClick: legendEditable ? handleSurvivalLegendSwatchClick : undefined
    });
    const legendRenderer = legendLayout.renderer;
    const legendVisible = showLegend && legendRenderer.entries.length > 0;
    const legendWidth = legendVisible ? Math.ceil(legendLayout.legendWidthForMargin) : 0;
    const riskTableTickTarget = chartStyle.estimateTickCount
      ? chartStyle.estimateTickCount(baseWidth, { axis: 'x', fallback: 6 })
      : 6;
    const baseMarginEstimate = chartStyle.computeBaseMargins ? chartStyle.computeBaseMargins({
      fontSize: fs,
      legendWidth: 0,
      maxYLabelWidth: 0,
      hasYTitle,
      axisMetrics
    }) : { top: fs * 3, right: 24, bottom: fs * 4, left: fs * 4 };
    const riskTableLabelWidth = controls.showRiskTable
      ? resolveSurvivalRiskTableLabelWidth({
          fontSize: riskTableFontSize,
          fontMeasure: riskTableMeasure,
          groups: groupsForDraw
        })
      : 0;
    // Risk-table labels and rows are auxiliary presentation geometry. They may
    // extend outside the canonical user frame, but they never shift or shrink
    // the survival plot rectangle.
    const riskTableLeftExtension = Math.max(0, riskTableLabelWidth - baseMarginEstimate.left);

    const axisTickTools = chartStyle.axisTicks || null;
    const buildAxisScale = opts => {
      if(axisTickTools && typeof axisTickTools.buildScale === 'function'){
        return axisTickTools.buildScale(opts);
      }
      const min = Number.isFinite(opts?.manualMin) ? opts.manualMin : Number(opts?.dataMin) || 0;
      const max = Number.isFinite(opts?.manualMax) ? opts.manualMax : Number(opts?.dataMax) || min + 1;
      return { min, max, ticks: [min, max], step: Math.max((max - min) || 1, 1) };
    };

    const autoXMax = summary.maxTime > 0 ? summary.maxTime : 1;
    const manualXMax = Number.parseFloat(controls.timeMax);
    let xMax = Number.isFinite(manualXMax) && manualXMax > 0 ? manualXMax : autoXMax;
    xMax = Math.max(xMax, autoXMax || 1);
    if(Shared.isDebugEnabled?.()){
      survivalDebug('Debug: survival x-axis max resolved', { autoXMax, manualXMax, xMax });
    }
    const xMin = 0;
    const yMin = 0;
    const yMax = 1;
    logDebug('axis range auto',{ yMin, yMax });

    const xTickTarget = riskTableTickTarget;
    const yTickTarget = chartStyle.estimateTickCount ? chartStyle.estimateTickCount(chartHeight, { axis: 'y', fallback: 6 }) : 6;
    const xTickMeasureFont = (chartStyle && typeof chartStyle.resolveScopedLabelMeasureFont === 'function')
      ? chartStyle.resolveScopedLabelMeasureFont({ styles: survivalFontStyles, role: 'xTick', fallbackPx: fs }).fontSpec
      : (chartStyle.makeFont ? chartStyle.makeFont(fs) : `${fs}px sans-serif`);
    const yTickMeasureFont = (chartStyle && typeof chartStyle.resolveScopedLabelMeasureFont === 'function')
      ? chartStyle.resolveScopedLabelMeasureFont({ styles: survivalFontStyles, role: 'yTick', fallbackPx: fs }).fontSpec
      : (chartStyle.makeFont ? chartStyle.makeFont(fs) : `${fs}px sans-serif`);
    const tickFont = yTickMeasureFont;
    const resolveMarginRequirements = (maxYLabelWidth, xTickLabels = []) => {
      if(chartStyle.computeCartesianMarginRequirements){
        return chartStyle.computeCartesianMarginRequirements({
          fontSize: fs,
          maxYLabelWidth,
          hasYTitle,
          axisMetrics,
          xTickLabels,
          xTickMeasureFont
        });
      }
      const required = chartStyle.computeBaseMargins ? chartStyle.computeBaseMargins({
        fontSize: fs,
        legendWidth: 0,
        maxYLabelWidth,
        hasYTitle,
        axisMetrics,
        xTickLabels,
        xTickMeasureFont
      }) : { top: fs * 3, right: 24, bottom: fs * 4, left: fs * 4 };
      const baseline = chartStyle.computeBaseMargins ? chartStyle.computeBaseMargins({
        fontSize: fs,
        legendWidth: 0,
        maxYLabelWidth: 0,
        hasYTitle,
        axisMetrics,
        xTickLabels: [],
        xTickMeasureFont
      }) : { top: fs * 3, right: 24, bottom: fs * 4, left: fs * 4 };
      return { baselineMargins: baseline, requiredMargins: required };
    };
    let cartesianMarginRequirements = resolveMarginRequirements(0, []);
    let margin = { ...cartesianMarginRequirements.baselineMargins };
    let requiredMargins = { ...cartesianMarginRequirements.requiredMargins };
    let plotW = Math.max(20, baseWidth - margin.left - margin.right);
    let plotH = Math.max(20, chartHeight - margin.top - margin.bottom);
    let bottomLayout = chartStyle.computeBottomLayout ? chartStyle.computeBottomLayout({
      labels: [],
      fontSize: fs,
      labelMeasureFont: xTickMeasureFont,
      plotWidth: plotW,
      baseBottom: margin.bottom,
      axisMetrics,
      preservePlotRail: true
    }) : { bottom: margin.bottom, requiredBottom: margin.bottom, shouldRotate: false, titleOffset: fs * 2, labelOffset: fs, tickLength: tickLen, tickLabelGap: tickGap };
    requiredMargins.bottom = Math.max(requiredMargins.bottom, bottomLayout.requiredBottom || margin.bottom);
    let xScale;
    let yScale;
    let xTickLabels = [];
    let yTickLabels = [];

    let maxYLabelWidth = 0;
    const manualIntervalX = getAxisTickInterval('x');
    const manualIntervalY = getAxisTickInterval('y');
    for(let pass = 0; pass < 2; pass += 1){
      plotW = Math.max(20, baseWidth - margin.left - margin.right);
      plotH = Math.max(20, chartHeight - margin.top - margin.bottom);
      xScale = buildAxisScale({
        dataMin: xMin,
        dataMax: xMax,
        manualMin: 0,
        manualMax: Number.isFinite(manualXMax) && manualXMax > 0 ? manualXMax : null,
        targetTickCount: xTickTarget
      });
      yScale = buildAxisScale({
        dataMin: yMin,
        dataMax: yMax,
        manualMin: 0,
        manualMax: 1,
        targetTickCount: yTickTarget
      });
      if(Number.isFinite(manualIntervalX) && manualIntervalX > 0){
        const manualX = buildManualTicks(xScale.min, xScale.max, manualIntervalX);
        if(manualX){
          xScale.min = manualX.min;
          xScale.max = manualX.max;
          xScale.ticks = manualX.ticks;
          xScale.step = manualIntervalX;
        }
      }
      if(Number.isFinite(manualIntervalY) && manualIntervalY > 0){
        const manualY = buildManualTicks(yScale.min, yScale.max, manualIntervalY);
        if(manualY){
          yScale.min = manualY.min;
          yScale.max = manualY.max;
          yScale.ticks = manualY.ticks;
          yScale.step = manualIntervalY;
        }
      }
      xTickLabels = xScale.ticks.map(value => formatNumber(value, 2));
      yTickLabels = yScale.ticks.map(value => formatNumber(value, 2));
      const yLabelWidths = yTickLabels.map(label => chartStyle.measureText ? chartStyle.measureText(label, tickFont) : label.length * fs * 0.6);
      maxYLabelWidth = yLabelWidths.length ? Math.max(...yLabelWidths) : 0;
      cartesianMarginRequirements = resolveMarginRequirements(maxYLabelWidth, xTickLabels);
      margin = { ...cartesianMarginRequirements.baselineMargins };
      plotW = Math.max(20, baseWidth - margin.left - margin.right);
      plotH = Math.max(20, chartHeight - margin.top - margin.bottom);
      bottomLayout = chartStyle.computeBottomLayout ? chartStyle.computeBottomLayout({
        labels: xTickLabels,
        fontSize: fs,
        labelMeasureFont: xTickMeasureFont,
        plotWidth: plotW,
        baseBottom: margin.bottom,
        axisMetrics,
        preservePlotRail: true
      }) : bottomLayout;
      requiredMargins = {
        ...cartesianMarginRequirements.requiredMargins,
        bottom: Math.max(cartesianMarginRequirements.requiredMargins.bottom, bottomLayout.requiredBottom || margin.bottom)
      };
    }
    logDebug('tick targets finalized', { manualIntervalX, manualIntervalY, xTickCount: xScale?.ticks?.length, yTickCount: yScale?.ticks?.length });

    const survivalLayoutOwner = {
      tabId: execution?.tabId || drawSession?.tabId || drawTabId || options?.tabId || null,
      component: 'survival',
      generation: Number(execution?.owner?.sessionGeneration) || null
    };
    const aspectData = refs.svgBox?.dataset || null;
    const survivalCartesianTransaction = aspectData?.resizerAspectLocked === 'true'
      ? refs.svgBox?.__sharedResizableBoxApi?.getCartesianLayoutTransaction?.({ resizePhase: options?.resizePhase })
      : null;
    const lockedSurvivalGeometry = aspectData?.resizerAspectLocked === 'true'
      ? Shared.cartesianLayout?.resolveLockedRenderGeometry?.({
          userFrame: { width: baseWidth, height: chartHeight },
          transaction: survivalCartesianTransaction
        })
      : null;
    if(lockedSurvivalGeometry?.valid === true){
      margin = { ...lockedSurvivalGeometry.margins };
      plotW = lockedSurvivalGeometry.plotRect.width;
      plotH = lockedSurvivalGeometry.plotRect.height;
    }
    let survivalCartesianPlan = Shared.cartesianLayout?.planCartesianLayout?.({
      owner: survivalLayoutOwner,
      userFrame: { width: baseWidth, height: chartHeight },
      baselineMargins: margin,
      requiredMargins,
      auxiliaryReserves: [],
      externalExtensions: {
        left: riskTableLeftExtension,
        right: legendWidth,
        bottom: riskTableExtraHeight
      },
      orientation: 'normal',
      lock: {
        enabled: aspectData?.resizerAspectLocked === 'true',
        targetRatio: Number(aspectData?.resizerCartesianPlotRatio) || null,
        drive: aspectData?.resizerLastAxis === 'x' ? 'width' : (aspectData?.resizerLastAxis === 'y' ? 'height' : 'both')
      },
      minimumPlot: { width: 20, height: 20 },
      rounding: { mode: 'none', precision: 6 }
    }) || null;
    if(survivalCartesianPlan){
      margin = {
        left: survivalCartesianPlan.plotRect.x,
        top: survivalCartesianPlan.plotRect.y,
        right: baseWidth - survivalCartesianPlan.plotRect.x - survivalCartesianPlan.plotRect.width,
        bottom: chartHeight - survivalCartesianPlan.plotRect.y - survivalCartesianPlan.plotRect.height
      };
      plotW = survivalCartesianPlan.plotRect.width;
      plotH = survivalCartesianPlan.plotRect.height;
    }else{
      plotW = Math.max(20, baseWidth - margin.left - margin.right);
      plotH = Math.max(20, chartHeight - margin.top - margin.bottom);
    }
    const legendViewport = chartStyle.stageGraphContentViewport({
      svgBox: refs.svgBox,
      plot: refs.plotDiv,
      svg,
      baseWidth,
      baseHeight: chartHeight,
      rightWidth: survivalCartesianPlan?.contentEnvelope?.extensionRight || legendWidth,
      leftWidth: survivalCartesianPlan?.contentEnvelope?.extensionLeft || riskTableLeftExtension,
      topHeight: survivalCartesianPlan?.contentEnvelope?.extensionTop || 0,
      bottomHeight: survivalCartesianPlan?.contentEnvelope?.extensionBottom || riskTableExtraHeight,
      legendWidth
    });
    const width = legendViewport.width;
    const svgHeight = legendViewport.height;

    const x2px = value => {
      const span = xScale.max - xScale.min || 1;
      return margin.left + (plotW * (value - xScale.min) / span);
    };
    const y2px = value => {
      const span = yScale.max - yScale.min || 1;
      return margin.top + plotH - (plotH * (value - yScale.min) / span);
    };

    function add(tag, attrs, parent){
      const el = document.createElementNS(NS, tag);
      Object.entries(attrs || {}).forEach(([key, value]) => {
        if(value != null){
          el.setAttribute(key, String(value));
        }
      });
      (parent || svg).appendChild(el);
      return el;
    }

    const showGrid = !!controls.showGrid;
    const showFrame = !!controls.showFrame;

    if(showGrid){
      const gridSegments = [];
      xScale.ticks.forEach(val => {
        const x = x2px(val);
        gridSegments.push({ x1: x, y1: margin.top, x2: x, y2: margin.top + plotH });
      });
      yScale.ticks.forEach(val => {
        const y = y2px(val);
        gridSegments.push({ x1: margin.left, y1: y, x2: margin.left + plotW, y2: y });
      });
      const gridPathData = svgGeometry.buildCompoundLinePath?.(gridSegments) || '';
      if(gridPathData){
        add('path', Object.assign({ d: gridPathData, fill: 'none', 'data-grid-control': '1' }, gridStrokeAttrs));
      }
    }

    const xAxisY = margin.top + plotH;
    const yAxisX = margin.left;
    const minorTickStyle = chartStyle.resolveMinorTickStyle({ tickLength: tickLen, strokeWidth: axisStrokeWidth });
    const minorSubdivisionsX = getAxisMinorTickSubdivisions('x');
    const minorSubdivisionsY = getAxisMinorTickSubdivisions('y');
    const minorTicksX = getAxisMinorTicksEnabled('x')
      ? chartStyle.computeMinorTickPositions({
          majorTicks: xScale.ticks,
          min: Number.isFinite(xScale.min) ? xScale.min : 0,
          max: Number.isFinite(xScale.max) ? xScale.max : 1,
          scale: 'linear',
          subdivisions: minorSubdivisionsX
        })
      : [];
    const minorTicksY = getAxisMinorTicksEnabled('y')
      ? chartStyle.computeMinorTickPositions({
          majorTicks: yScale.ticks,
          min: Number.isFinite(yScale.min) ? yScale.min : 0,
          max: Number.isFinite(yScale.max) ? yScale.max : 1,
          scale: 'linear',
          subdivisions: minorSubdivisionsY
        })
      : [];
    const axisControlConfig = axis => buildSurvivalAxisControlConfig(axis, drawSession, {
      effectiveTickInterval: axis === 'x' ? xScale.step : yScale.step
    });
    const xAxisLine = add('line', { x1: margin.left, y1: xAxisY, x2: margin.left + plotW, y2: xAxisY, stroke: axisStroke, 'stroke-width': axisStrokeWidth, 'stroke-linecap': 'square' });
    if(axisControls && typeof axisControls.registerAxisElement === 'function'){
      axisControls.registerAxisElement(xAxisLine, axisControlConfig('x'));
    }
    const yAxisLine = add('line', { x1: yAxisX, y1: margin.top, x2: yAxisX, y2: margin.top + plotH, stroke: axisStroke, 'stroke-width': axisStrokeWidth, 'stroke-linecap': 'square' });
    if(axisControls && typeof axisControls.registerAxisElement === 'function'){
      axisControls.registerAxisElement(yAxisLine, axisControlConfig('y'));
    }
    logDebug('axes stroke scaled',{ axisStrokeWidthBase, axisStrokeWidth, axisStroke });

    if(showFrame){
      logDebug('frame request',{ stroke: axisStroke, showFrame, axisStrokeWidth });
      chartStyle.drawPlotFrame?.({ svg, margin, plotW, plotH, stroke: axisStroke, strokeWidth: axisStrokeWidth, sides: ['top', 'right'] });
    }

    const xTickNodes = [];
    if(minorTicksX.length){
      minorTicksX.forEach(value => {
        const x = x2px(value);
        add('line', {
          x1: x,
          y1: xAxisY,
          x2: x,
          y2: xAxisY + minorTickStyle.length,
          stroke: axisStroke,
          'stroke-width': minorTickStyle.strokeWidth,
          'stroke-linecap': 'round',
          opacity: minorTickStyle.opacity,
          'data-survival-axis-minor-target': '1'
        });
      });
    }
    xScale.ticks.forEach(value => {
      const x = x2px(value);
      add('line', { x1: x, y1: xAxisY, x2: x, y2: xAxisY + xMajorTickLength, stroke: axisStroke, 'stroke-width': axisStrokeWidth, 'data-survival-axis-style-target': '1' });
      const extra = Shared.computeAxisLabelYOffset ? Shared.computeAxisLabelYOffset(fs, xMajorTickLength, tickGap) : 0;
      const text = add('text', {
        x,
        y: xAxisY + xMajorTickLength + tickGap + extra,
        'font-size': fs,
        'text-anchor': 'middle',
        fill: chartStyle.TEXT_COLOR || '#000'
      });
      Shared.applyTextBaseline && Shared.applyTextBaseline(text, 'hanging', fs);
      text.textContent = formatNumber(value, 2);
      markFontEditable(text, 'xTick');
      xTickNodes.push(text);
    });
    chartStyle.applyLabelOrientation?.(xTickNodes, { angle: -45, anchor: 'end', dy: '0.35em', force: bottomLayout.shouldRotate });

    if(minorTicksY.length){
      minorTicksY.forEach(value => {
        const y = y2px(value);
        add('line', {
          x1: yAxisX - minorTickStyle.length,
          y1: y,
          x2: yAxisX,
          y2: y,
          stroke: axisStroke,
          'stroke-width': minorTickStyle.strokeWidth,
          'stroke-linecap': 'round',
          opacity: minorTickStyle.opacity,
          'data-survival-axis-minor-target': '1'
        });
      });
    }
    yScale.ticks.forEach(value => {
      const y = y2px(value);
      add('line', { x1: yAxisX - yMajorTickLength, y1: y, x2: yAxisX, y2: y, stroke: axisStroke, 'stroke-width': axisStrokeWidth, 'data-survival-axis-style-target': '1' });
      const text = add('text', {
        x: yAxisX - (yMajorTickLength + tickGap),
        y,
        'font-size': fs,
        'text-anchor': 'end',
        'dominant-baseline': 'middle',
        fill: chartStyle.TEXT_COLOR || '#000'
      });
      text.textContent = formatNumber(value, 2);
      markFontEditable(text, 'yTick');
    });

    const xTitleY = xAxisY + (bottomLayout.titleOffset || fs * 2);
    const defaultXLabelX = margin.left + plotW / 2;
    const defaultXLabelY = xTitleY;
    const xLabelPos = state.labelPositions?.xLabel;

    // Convert relative positions to absolute if needed for xLabel
    let absoluteXLabelX = defaultXLabelX;
    let absoluteXLabelY = defaultXLabelY;
    if (xLabelPos) {
      if (xLabelPos.relX !== undefined && xLabelPos.relY !== undefined) {
        // Use relative positioning
        absoluteXLabelX = margin.left + xLabelPos.relX * plotW;
        absoluteXLabelY = xAxisY + xLabelPos.relY * (plotH + margin.top);
      } else if (xLabelPos.x !== undefined && xLabelPos.y !== undefined) {
        // Use absolute positioning (backward compatibility)
        absoluteXLabelX = xLabelPos.x;
        absoluteXLabelY = xLabelPos.y;
      }
    }

    const xTitle = add('text', {
      x: absoluteXLabelX,
      y: absoluteXLabelY,
      'font-size': fs,
      'text-anchor': 'middle',
      fill: chartStyle.TEXT_COLOR || '#000'
    });
    xTitle.textContent = xLabelText;
    markFontEditable(xTitle, 'xTitle', 'xTitle');
    bindSurvivalInlineTextInteraction(xTitle, drawSession, 'xLabel');
    // Enable drag for x-axis label
    if(typeof Shared.enableLabelDrag === 'function'){
      Shared.enableLabelDrag(xTitle, svg, {
        onDragEnd: pos => {
          const nextPosition = {
            x: pos.x,
            y: pos.y,
            relX: (pos.x - margin.left) / Math.max(plotW, 1),
            relY: (pos.y - xAxisY) / Math.max(plotH + margin.top, 1)
          };
          patchSurvivalLabelPosition(drawSession, 'xLabel', nextPosition, { reason: 'survival-x-label-position' });
          logDebug('x-label position saved', { absolute: pos, relative: { relX: nextPosition.relX, relY: nextPosition.relY } });
        }
      });
    }

    const yLabelOffsetSpan = (maxYLabelWidth + yMajorTickLength + tickGap + axisMetrics.axisTitleGap + fs * 0.5);
    const defaultYTitleX = margin.left - yLabelOffsetSpan;
    const defaultYTitleY = margin.top + plotH / 2;
    const yLabelPos = state.labelPositions?.yLabel;

    // Convert relative positions to absolute if needed for yLabel
    let yTitleX = defaultYTitleX;
    let yTitleY = defaultYTitleY;
    if (yLabelPos) {
      if (yLabelPos.relX !== undefined && yLabelPos.relY !== undefined) {
        // Use relative positioning
        yTitleX = margin.left + yLabelPos.relX * yLabelOffsetSpan;
        yTitleY = margin.top + yLabelPos.relY * plotH;
      } else if (yLabelPos.x !== undefined && yLabelPos.y !== undefined) {
        // Use absolute positioning (backward compatibility)
        yTitleX = yLabelPos.x;
        yTitleY = yLabelPos.y;
      }
    }

    logDebug('y-axis title placement', { yTitleX, maxYLabelWidth }); // Debug: axis label alignment
    const yTitle = add('text', {
      x: yTitleX,
      y: yTitleY,
      transform: `rotate(-90 ${yTitleX} ${yTitleY})`,
      'font-size': fs,
      'text-anchor': 'middle',
      fill: chartStyle.TEXT_COLOR || '#000'
    });
    yTitle.textContent = yLabelText;
    markFontEditable(yTitle, 'yTitle', 'yTitle');
    bindSurvivalInlineTextInteraction(yTitle, drawSession, 'yLabel');
    // Enable drag for y-axis label
    if(typeof Shared.enableLabelDrag === 'function'){
      Shared.enableLabelDrag(yTitle, svg, {
        onDragEnd: pos => {
          const nextPosition = {
            x: pos.x,
            y: pos.y,
            relX: (pos.x - margin.left) / Math.max(yLabelOffsetSpan, 1),
            relY: (pos.y - margin.top) / Math.max(plotH, 1)
          };
          patchSurvivalLabelPosition(drawSession, 'yLabel', nextPosition, { reason: 'survival-y-label-position' });
          logDebug('y-label position saved', { absolute: pos, relative: { relX: nextPosition.relX, relY: nextPosition.relY } });
        }
      });
    }

    const titleY = Math.max(fs * 1.6, margin.top * 0.5);
    const defaultTitleX = margin.left + plotW / 2;
    const defaultTitleY = titleY;
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

    const titleText = add('text', {
      x: absoluteTitleX,
      y: absoluteTitleY,
      'font-size': fs,
      'text-anchor': 'middle',
      fill: chartStyle.TEXT_COLOR || '#000'
    });
    titleText.textContent = state.titleText != null ? String(state.titleText) : 'Survival curve';
    markFontEditable(titleText, 'graphTitle', 'graphTitle');
    bindSurvivalInlineTextInteraction(titleText, drawSession, 'title');
    // Enable drag for title
    if(typeof Shared.enableLabelDrag === 'function'){
      Shared.enableLabelDrag(titleText, svg, {
        onDragEnd: pos => {
          const nextPosition = {
            x: pos.x,
            y: pos.y,
            relX: (pos.x - margin.left) / Math.max(plotW, 1),
            relY: (pos.y - margin.top) / Math.max(plotH, 1)
          };
          patchSurvivalLabelPosition(drawSession, 'title', nextPosition, { reason: 'survival-title-position' });
          logDebug('title position saved', { absolute: pos, relative: { relX: nextPosition.relX, relY: nextPosition.relY } });
        }
      });
    }

    const showCI = !!controls.showCI;
    const showCensor = !!controls.showCensor;
    for(let groupIndex = 0; groupIndex < groupsForDraw.length; groupIndex += 1){
      if(!(await checkpoint())){
        return false;
      }
      const group = groupsForDraw[groupIndex];
      const groupMaxTime = Number.isFinite(group.km?.maxTime) ? group.km.maxTime : xScale.max;
      if(Shared.isDebugEnabled?.() && Number.isFinite(groupMaxTime) && Number.isFinite(xScale.max) && groupMaxTime < xScale.max){
        survivalDebug('Debug: survival step extent clamped', { group: group.name, groupMaxTime, axisMax: xScale.max });
      }
      if(showCI){
        const ciPath = buildConfidencePath(group.km.upper, group.km.lower, groupMaxTime, x2px, y2px);
        if(ciPath){
          add('path', {
            d: ciPath,
            fill: group.color,
            'fill-opacity': 0.15,
            stroke: 'none',
            'data-survival-series-color-target': 'fill',
            'data-group': group.name
          });
        }
      }
      const stepPath = buildStepPath(group.km.steps, groupMaxTime, x2px, y2px, pt => pt.survival ?? pt.value ?? 0);
      if(stepPath){
        const curveEl = add('path', {
          d: stepPath,
          fill: 'none',
          stroke: group.color,
          'stroke-width': group.strokeWidth,
          'stroke-opacity': group.strokeOpacity,
          'stroke-dasharray': survivalPatternToDasharray(group.strokePattern) || null,
          'stroke-linejoin': 'bevel',
          'data-survival-series-color-target': 'stroke',
          'data-group': group.name
        });
        bindSurvivalCurveFormatInteraction(curveEl);
      }
      if(showCensor && group.km.censor.length){
        const markerSize = Math.max(4, fs * 0.6);
        group.km.censor.forEach(marker => {
          const x = x2px(marker.time);
          const y = y2px(marker.survival);
          const censorSegments = svgGeometry.buildCrossSegments({ x, y, size: markerSize });
          const censorPathData = svgGeometry.buildCompoundLinePath?.(censorSegments) || '';
          if(censorPathData){
            add('path', {
              d: censorPathData,
              fill: 'none',
              stroke: group.color,
              'stroke-width': axisStrokeWidth,
              'data-survival-axis-width-target': '1',
              'data-survival-censor-mark': '1',
              'data-survival-censor-segment-count': '2',
              'data-survival-series-color-target': 'stroke',
              'data-group': group.name
            });
          }
        });
      }
    }

    if(controls.showRiskTable){
      const riskStartY = chartHeight + Math.max(riskTableMetrics.fontSize * 0.9, 10);
      renderSurvivalRiskTable(svg, add, groupsForDraw, xScale.ticks, x2px, {
        fontSize: riskTableFontSize,
        left: margin.left,
        yStart: riskStartY,
        tabId: drawSession?.tabId || drawTabId || null
      });
    }

    if(controls.showPlotStats){
      const statsLines = buildSurvivalPlotStatsLines(summary);
      if(statsLines.length){
        const statsFontSize = chartStyle.resolveStatsAnnotationFontMetrics(fs, { styles: survivalFontStyles }).fontSizePx;
        const statsFrame = { originX: margin.left, originY: margin.top, width: plotW, height: plotH };
        const statsPosition = chartStyle.resolveStatsAnnotationPosition(
          normalizeSurvivalLabelPositions(drawSession?.state?.labelPositions || state.labelPositions).stats,
          { x: margin.left + plotW - 4, y: margin.top + statsFontSize },
          statsFrame
        );
        chartStyle.renderStatsAnnotation(svg, {
          lines: statsLines,
          x: statsPosition.x,
          y: statsPosition.y,
          fontSize: statsFontSize,
          textAnchor: 'end',
          fill: chartStyle.TEXT_COLOR || '#000',
          dataAttributes: { 'survival-plot-stats': '1' },
          fontScopeId: 'survival',
          tabId: drawSession?.tabId || null,
          onDragEnd: pos => {
            patchSurvivalLabelPosition(
              drawSession,
              'stats',
              chartStyle.captureStatsAnnotationPosition(pos, statsFrame),
              { reason: 'survival-stats-position' }
            );
          }
        });
      }
    }

    if(legendVisible){
      const legendGapPx = Number.isFinite(legendLayout.legendGapPx) ? legendLayout.legendGapPx : 12;
      const defaultLegendX = baseWidth + legendGapPx;
      const defaultLegendY = margin.top + (legendRenderer.baselineOffset || 0);
      const legendGroup = drawSurvivalLegend(svg, legendLayout, { x: defaultLegendX, y: defaultLegendY }, {
        width,
        height: svgHeight,
        reserveOriginX: baseWidth,
        reserveOriginY: margin.top,
        reserveScaleX: legendGapPx,
        reserveScaleY: plotH,
        legacyOriginX: 0,
        legacyOriginY: 0
      }, drawSession);
      if(!legendGroup){
        logDebug('legend draw skipped', { reason: 'render-failed', legendVisible, entryCount: legendRenderer.entries.length });
      }
    }else{
      logDebug('legend skipped', { showLegend, entryCount: legendRenderer.entries.length });
    }

    const survivalAxisOwnerTabId = drawSession?.tabId || drawTabId || getSurvivalProjectionTabId() || null;
    Shared.visualProjection?.bind?.(
      svg.querySelectorAll('[data-axis-control="1"], [data-frame-edge], [data-survival-axis-style-target="1"]'),
      {
        component: 'survival',
        channel: 'axis',
        tabId: survivalAxisOwnerTabId,
        strokeWidthBase: axisStrokeWidthBase,
        renderedStrokeWidth: axisStrokeWidth
      }
    );
    Shared.visualProjection?.bind?.(svg.querySelectorAll('[data-survival-axis-minor-target="1"]'), {
      component: 'survival',
      channel: 'axis',
      tabId: survivalAxisOwnerTabId,
      strokeWidthBase: axisStrokeWidthBase,
      renderedStrokeWidth: minorTickStyle.strokeWidth
    });
    Shared.visualProjection?.bind?.(svg.querySelectorAll('[data-survival-axis-width-target="1"]'), {
      component: 'survival',
      channel: 'axis',
      tabId: survivalAxisOwnerTabId,
      strokeWidthBase: axisStrokeWidthBase,
      renderedStrokeWidth: axisStrokeWidth,
      properties: ['strokeWidth']
    });
    registerSurvivalGridControlTarget(svg, { fallbackThickness: axisStrokeWidthBase });
    autoResizeSvgHelper(svg);
    if(!(await checkpoint())){
      return false;
    }
    const measuredSurvivalViewport = legendViewport.measure?.() || legendViewport.getViewport?.() || null;
    if(survivalCartesianPlan && measuredSurvivalViewport){
      survivalCartesianPlan = Shared.cartesianLayout.planCartesianLayout({
        owner: survivalLayoutOwner,
        userFrame: survivalCartesianPlan.userFrame,
        baselineMargins: survivalCartesianPlan.baselineMargins,
        requiredMargins: survivalCartesianPlan.requiredMargins,
        auxiliaryReserves: [],
        externalExtensions: { left: riskTableLeftExtension, right: legendWidth, bottom: riskTableExtraHeight },
        orientation: 'normal',
        lock: survivalCartesianPlan.lock,
        minimumPlot: survivalCartesianPlan.minimumPlot,
        contentBounds: {
          minX: measuredSurvivalViewport.minX,
          minY: measuredSurvivalViewport.minY,
          maxX: measuredSurvivalViewport.maxX,
          maxY: measuredSurvivalViewport.maxY
        },
        rounding: { mode: 'none', precision: 6 }
      });
    }
    const survivalLayoutPublished = survivalCartesianPlan
      ? Shared.cartesianLayout?.publishCartesianLayout?.(refs.svgBox, survivalCartesianPlan, {
          tabId: survivalLayoutOwner.tabId,
          component: 'survival',
          generation: survivalLayoutOwner.generation,
          resizePhase: options?.resizePhase || null,
          canCommit: () => execution?.isCurrent?.() !== false
            && (!drawSession || isSurvivalSessionActive(drawSession)),
          projectionTarget: svg,
          commitFrame: () => framePublication.commit(),
          commitPresentation: () => legendViewport.commit()
        })
      : false;
    if(survivalCartesianPlan && !survivalLayoutPublished){
      return false;
    }
    if(!survivalCartesianPlan){
      if(!framePublication.commit()) return false;
      legendViewport.commit();
    }
    updateStats({ ...summary, series: groupsForDraw });
    state.layout?.syncPanels?.({ skipSchedule: true });
    logDebug('draw complete', { debugStamp });
    return true;
    }finally{
      framePublication?.cleanup();
    }
  }

  function updateStats(summary){
    if(!refs.statsSummary || !refs.statsLogRank){
      return;
    }
    if(!summary.series.length){
      renderStatsLead(refs.statsSummary, 'Enter at least one group with time and event values to compute statistics.');
      renderStatsLead(refs.statsLogRank, 'Log-rank test results will appear after statistics are calculated.');
      if(refs.statsHazardRatios) refs.statsHazardRatios.innerHTML = '';
      if(refs.statsCox){
        clearSurvivalStatsReportHost(refs.statsCox);
        refs.statsCox.innerHTML = '';
      }
      state.lastStats = null;
      state.statsPanelModels = createDefaultSurvivalStatsPanelModels();
      const session = getActiveSurvivalSessionForState();
      if(session){
        session.state.lastSummary = cloneSimple(state.lastSummary) || null;
        session.state.lastStats = null;
        session.state.statsPanelModels = createDefaultSurvivalStatsPanelModels();
        session.results = createDefaultSurvivalResultsState({ stats: null, statsPanelModels: session.state.statsPanelModels });
        session.updatedAt = Date.now();
      }
      return;
    }

    renderSurvivalGroupSummary(summary);
    renderSurvivalLogRank(summary);
    renderSurvivalHazardRatios(summary);
    renderSurvivalCoxModel(summary);
    const statsPayload = {
      groups: summary.series.map(group => ({
        name: group.name,
        total: group.total,
        events: group.events,
        censored: group.censored,
        median: group.km?.median ?? null,
        color: group.color || null
      })),
      logRank: summary.logRank,
      logRankWilcoxon: summary.logRankWilcoxon,
      logRankTrend: summary.logRankTrend,
      pairwiseComparisons: summary.pairwiseComparisons,
      medianRatios: summary.medianRatios,
      hazardRatios: summary.hazardRatios,
      coxModel: summary.coxModel,
      flags: summary.flags,
      inference: summary.inference || getSurvivalInferenceSnapshot()
    };
    state.lastStats = statsPayload;
    if(refs.statsCox && Shared.statsReporting && typeof Shared.statsReporting.appendReportPanel === 'function'){
      const logRankText = summary.logRank?.available
        ? `Log-rank χ²(${summary.logRank.df ?? 'n/a'}) = ${formatNumber(summary.logRank.chi2, 3)}; ${formatSurvivalPExpression(summary.logRank.p)}.`
        : (summary.logRank?.message || 'Log-rank test unavailable.');
      const logRankParts = summary.logRank?.available
        ? [`Log-rank χ²(${summary.logRank.df ?? 'n/a'}) = ${formatNumber(summary.logRank.chi2, 3)}, p = `, pValueToken(summary.logRank.p, createSurvivalInferenceSpec({ method: 'none', valueKind: 'raw-p' })), '.']
        : [summary.logRank?.message || 'Log-rank test unavailable.'];
      const wilcoxonText = summary.logRankWilcoxon?.available
        ? `Gehan-Breslow-Wilcoxon χ²(${summary.logRankWilcoxon.df ?? 'n/a'}) = ${formatNumber(summary.logRankWilcoxon.chi2, 3)}; ${formatSurvivalPExpression(summary.logRankWilcoxon.p)}.`
        : null;
      const wilcoxonParts = summary.logRankWilcoxon?.available
        ? [`Gehan-Breslow-Wilcoxon χ²(${summary.logRankWilcoxon.df ?? 'n/a'}) = ${formatNumber(summary.logRankWilcoxon.chi2, 3)}, p = `, pValueToken(summary.logRankWilcoxon.p, createSurvivalInferenceSpec({ method: 'none', valueKind: 'raw-p' })), '.']
        : null;
      const hazardText = summary.hazardRatios?.available && Array.isArray(summary.hazardRatios.rows)
        ? (isTwoGroupUnadjustedCoxSummary(summary)
          ? 'One Cox-derived hazard ratio was reported for the two-group comparison.'
          : `${summary.hazardRatios.rows.length} ${hasSelectedCoxCovariates(summary) ? 'adjusted ' : ''}pairwise hazard-ratio comparison(s) were available.`)
        : null;
      const pairwiseText = summary.pairwiseComparisons?.available && Array.isArray(summary.pairwiseComparisons.rows)
        ? `${summary.pairwiseComparisons.rows.length} pairwise log-rank comparison(s) were adjusted with ${summary.pairwiseComparisons.correction?.label || state.pairwiseCorrection || 'the selected correction'}.`
        : null;
      const coxText = summary.coxModel?.available && Array.isArray(summary.coxModel.coefficients)
        ? (shouldOmitDuplicateCoxCoefficientTable(summary)
          ? 'The duplicate Cox coefficient table was omitted because the single coefficient equals log(HR).'
          : `${summary.coxModel.coefficients.length} Cox coefficient estimate(s) were reported.`)
        : null;
      Shared.statsReporting.appendReportPanel(refs.statsCox, {
        methodsText: `Kaplan–Meier survival curves were summarized for ${summary.series.length} group(s) using event-time and censoring indicators from the current table. Log-rank testing was used for overall group comparison when estimable at α = ${Shared.statsInference?.formatLevel?.(getSurvivalStatsAlpha()) || getSurvivalStatsAlpha()}, with Gehan-Breslow-Wilcoxon and trend tests reported when enabled and supported by the data. Pairwise log-rank comparisons used ${summary.pairwiseComparisons?.correction?.label || state.pairwiseCorrection || 'the selected correction'}${Shared.statsInference?.getMethodSemantics?.(state.pairwiseCorrection || 'holm-sidak')?.criterion === 'fdr' ? ` at target FDR = ${Shared.statsInference?.formatLevel?.(Shared.statsInference?.getTargetFdr?.({ tabId: getSurvivalStatsInferenceTabId() })) || '0.05'}` : ` at the same family-wise α`}. ${summary.flags?.hazardRatiosEnabled ? 'Pairwise hazard ratios were estimated for requested group comparisons.' : 'Pairwise hazard ratios were not requested.'} ${summary.flags?.coxEnabled ? `A Cox proportional-hazards model was fit by partial likelihood with Efron handling of tied event times when estimable${hasSelectedCoxCovariates(summary) ? ', including the selected covariates' : ''}.` : 'Cox modelling was disabled.'} Rows with invalid survival time, group, event, or covariate values were excluded from the corresponding analysis.`,
        resultsText: [
          `${summary.series.length} group(s) contributed survival data.`,
          logRankText,
          wilcoxonText,
          pairwiseText,
          hazardText,
          coxText
        ].filter(Boolean).join(' '),
        resultsParts: [
          `${summary.series.length} group(s) contributed survival data. `,
          logRankParts,
          wilcoxonParts ? [' ', wilcoxonParts] : null,
          pairwiseText ? ` ${pairwiseText}` : null,
          hazardText ? ` ${hazardText}` : null,
          coxText ? ` ${coxText}` : null
        ].filter(Boolean),
        analysisSpec: {
          component: 'survival',
          groupCount: summary.series.length,
          showHazardRatios: !!summary.flags?.hazardRatiosEnabled,
          fitCox: !!summary.flags?.coxEnabled,
          hazardRatioRows: Array.isArray(summary.hazardRatios?.rows) ? summary.hazardRatios.rows.length : 0,
          pairwiseRows: Array.isArray(summary.pairwiseComparisons?.rows) ? summary.pairwiseComparisons.rows.length : 0,
          coxCoefficientCount: Array.isArray(summary.coxModel?.coefficients) ? summary.coxModel.coefficients.length : 0,
          duplicateCoxCoefficientTableOmitted: shouldOmitDuplicateCoxCoefficientTable(summary),
          logRankAvailable: !!summary.logRank?.available,
          gehanBreslowAvailable: !!summary.logRankWilcoxon?.available,
          trendAvailable: !!summary.logRankTrend?.available,
          covariates: getSelectedCovariates(summary.covariateColumns),
          availableCovariates: Array.isArray(summary.covariateColumns) ? summary.covariateColumns.slice() : [],
          supportsTimeDependent: !!summary.supportsTimeDependent,
          inference: summary.inference || getSurvivalInferenceSnapshot()
        }
      }, { title: 'Reporting and reproducibility' });
    }
    const session = getActiveSurvivalSessionForState();
    captureSurvivalStatsPanelModels(null, session);
    if(session){
      session.state.lastSummary = cloneSimple(state.lastSummary) || null;
      session.state.lastStats = cloneSimple(state.lastStats) || null;
      session.state.statsPanelModels = createDefaultSurvivalStatsPanelModels(state.statsPanelModels || {});
      session.results = createDefaultSurvivalResultsState({ stats: session.state.lastStats, statsPanelModels: session.state.statsPanelModels });
      session.updatedAt = Date.now();
    }
    logDebug('statistics updated', {
      groupCount: summary.series.length,
      logRank: summary.logRank,
      hazardRatiosAvailable: summary.hazardRatios?.available,
      coxAvailable: summary.coxModel?.available
    });
  }

  function renderSurvivalGroupSummary(summary){
    if(!refs.statsSummary){
      return;
    }
    if(!summary.series.length){
      renderStatsLead(refs.statsSummary, 'Enter at least one group with time and event values to compute statistics.');
      return;
    }
    const rows = summary.series.map(group => ({
      group: group.name || '(unnamed)',
      total: Number.isFinite(group.total) ? String(group.total) : String(group.total ?? '0'),
      events: Number.isFinite(group.events) ? String(group.events) : String(group.events ?? '0'),
      censored: Number.isFinite(group.censored) ? String(group.censored) : String(group.censored ?? '0'),
      median: Number.isFinite(group.km?.median) ? formatNumber(group.km.median, 2) : 'Not reached',
      medianCi: Number.isFinite(group.km?.medianCiLow) && Number.isFinite(group.km?.medianCiHigh)
        ? formatInterval(group.km.medianCiLow, group.km.medianCiHigh)
        : 'n/a'
    }));
    const footnotes = [
      'Counts and medians derive from the filtered grid input.',
      '"Not reached" indicates survival remained above 50% at the final timepoint.',
      'Median survival confidence intervals are derived from the Kaplan–Meier confidence bands.'
    ];
    renderStatsTableCard(refs.statsSummary, {
      caption: 'Group Summary',
      section: 'descriptive',
      columns: [
        { key: 'group', label: 'Group', align: 'left' },
        { key: 'total', label: 'N', align: 'right' },
        { key: 'events', label: 'Events', align: 'right' },
        { key: 'censored', label: 'Censored', align: 'right' },
        { key: 'median', label: 'Median survival', align: 'right' },
        { key: 'medianCi', label: 'Median 95% CI', align: 'right' }
      ],
      rows,
      footnotes,
      options: {
        fileName: 'survival-group-summary',
        contextLabel: 'survival-group-summary'
      }
    });
  }

  function renderSurvivalLogRank(summary){
    if(!refs.statsLogRank){
      return;
    }
    const rows = [];
    if(summary.logRank?.available){
      rows.push({
        test: 'Log-rank',
        statistic: formatNumber(summary.logRank.chi2, 3),
        df: Number.isFinite(summary.logRank.df) ? String(summary.logRank.df) : 'n/a',
        p: pValueToken(summary.logRank.p, createSurvivalInferenceSpec({ method: 'none', valueKind: 'raw-p' }))
      });
    }
    if(summary.logRankWilcoxon?.available){
      rows.push({
        test: 'Gehan-Breslow-Wilcoxon',
        statistic: formatNumber(summary.logRankWilcoxon.chi2, 3),
        df: Number.isFinite(summary.logRankWilcoxon.df) ? String(summary.logRankWilcoxon.df) : 'n/a',
        p: pValueToken(summary.logRankWilcoxon.p, createSurvivalInferenceSpec({ method: 'none', valueKind: 'raw-p' }))
      });
    }
    if(summary.logRankTrend?.available){
      rows.push({
        test: 'Log-rank trend',
        statistic: formatNumber(summary.logRankTrend.chi2, 3),
        df: Number.isFinite(summary.logRankTrend.df) ? String(summary.logRankTrend.df) : 'n/a',
        p: pValueToken(summary.logRankTrend.p, createSurvivalInferenceSpec({ method: 'none', valueKind: 'raw-p' }))
      });
    }
    if(rows.length){
      renderStatsTableCard(refs.statsLogRank, {
        caption: 'Survival Curve Comparisons',
        section: 'summary',
        columns: [
          { key: 'test', label: 'Test', align: 'left' },
          { key: 'statistic', label: 'Statistic', align: 'right' },
          { key: 'df', label: 'df', align: 'right' },
          { key: 'p', label: 'p-value', align: 'right' }
        ],
        rows,
        footnotes: [
          'H₀: survival curves are identical across groups.',
          summary.logRankTrend?.available ? 'Trend test uses the displayed group order as the ordinal progression.' : null
        ].filter(Boolean),
        options: {
          fileName: 'survival-curve-comparisons',
          contextLabel: 'survival-log-rank'
        }
      });
      if(summary.pairwiseComparisons?.available && Array.isArray(summary.pairwiseComparisons.rows) && summary.pairwiseComparisons.rows.length){
        renderStatsTableCard(refs.statsLogRank, {
          caption: 'Pairwise Log-rank Comparisons',
          section: 'comparisons',
          columns: [
            { key: 'comparison', label: 'Comparison', align: 'left' },
            { key: 'chi2', label: 'χ²', align: 'right' },
            { key: 'p', label: 'p-value', align: 'right' },
            { key: 'adjustedP', label: typeof Shared.stats?.getAdjustedPLabel === 'function'
              ? Shared.stats.getAdjustedPLabel(summary.pairwiseComparisons.correction?.key || 'holm')
              : `${summary.pairwiseComparisons.correction?.shortLabel || 'Adjusted'}-adjusted p`, align: 'right' }
          ],
          rows: summary.pairwiseComparisons.rows.map(row => ({
            comparison: `${row.groupB} vs ${row.groupA}`,
            chi2: formatNumber(row.chi2, 3),
            p: pValueToken(row.p),
            adjustedP: pValueToken(row.adjustedP, getSurvivalPairwiseInferenceSpec())
          })),
          footnotes: [
            summary.pairwiseComparisons.correction?.footnote
              ? summary.pairwiseComparisons.correction.footnote(summary.pairwiseComparisons.rows.length)
              : `${summary.pairwiseComparisons.correction?.label || 'Selected'} correction applied across pairwise survival comparisons.`
          ],
          options: {
            fileName: 'survival-pairwise-log-rank',
            contextLabel: 'survival-pairwise-log-rank'
          },
          append: true
        });
      }
      return;
    }
    renderStatsLead(refs.statsLogRank, summary.logRank?.message || 'Log-rank test unavailable.');
  }

  function getCoxSelectedCovariates(summary){
    const modelSelections = summary?.coxModel?.design?.covariateSelections;
    if(Array.isArray(modelSelections)){
      return modelSelections;
    }
    return getSelectedCovariates(summary?.covariateColumns);
  }

  function hasSelectedCoxCovariates(summary){
    return getCoxSelectedCovariates(summary).length > 0;
  }

  function isTwoGroupUnadjustedCoxSummary(summary){
    return Array.isArray(summary?.series)
      && summary.series.length === 2
      && !hasSelectedCoxCovariates(summary);
  }

  function shouldOmitDuplicateCoxCoefficientTable(summary){
    return isTwoGroupUnadjustedCoxSummary(summary)
      && !!summary?.coxModel?.available
      && Array.isArray(summary?.coxModel?.coefficients)
      && summary.coxModel.coefficients.length === 1
      && summary.coxModel.coefficients[0]?.type === 'group';
  }

  function getCoxGroupCoefficientCount(summary){
    return Array.isArray(summary?.coxModel?.coefficients)
      ? summary.coxModel.coefficients.filter(coef => coef?.type === 'group').length
      : 0;
  }

  function getHazardRatioTableCaption(summary){
    if(hasSelectedCoxCovariates(summary)){
      return 'Adjusted pairwise hazard ratios';
    }
    return isTwoGroupUnadjustedCoxSummary(summary) ? 'Hazard ratio' : 'Pairwise hazard ratios';
  }

  function buildHazardRatioRows(summary){
    const hazardRows = Array.isArray(summary?.hazardRatios?.rows) ? summary.hazardRatios.rows : [];
    return hazardRows.map(row => ({
      comparison: `${row.groupB} vs ${row.groupA}`,
      hazardRatio: formatNumber(row.hazardRatio, 3),
      ci: formatInterval(row.ciLow, row.ciHigh),
      z: Number.isFinite(row.z) ? formatNumber(row.z, 3) : 'n/a',
      p: pValueToken(row.p, createSurvivalInferenceSpec({ method: 'none', valueKind: 'raw-p' }))
    }));
  }

  function buildHazardRatioFootnotes(summary){
    const notes = ['Ratios > 1 indicate increased hazard for the numerator group.'];
    if(hasSelectedCoxCovariates(summary)){
      notes.push('Adjusted pairwise hazard ratios are Cox model contrasts that include the selected covariates.');
    }else if(isTwoGroupUnadjustedCoxSummary(summary)){
      notes.push('For two groups with no covariates, the hazard ratio is exp(β) from the single Cox group coefficient.');
    }else{
      notes.push('Pairwise hazard ratios are Cox model contrasts between groups.');
    }
    if(summary?.hazardRatios?.inferenceAvailable){
      notes.push('Confidence intervals and p-values derive from the converged, unstabilized Cox variance–covariance matrix.');
    }else{
      notes.push(`Confidence intervals and p-values were suppressed: ${summary?.hazardRatios?.inferenceReason || 'ordinary Cox Wald inference is unavailable.'}`);
    }
    return notes;
  }

  function renderSurvivalHazardRatioTable(target, summary, options = {}){
    const rows = buildHazardRatioRows(summary);
    renderStatsTableCard(target, {
      caption: options.caption || getHazardRatioTableCaption(summary),
      section: 'estimates',
      columns: [
        { key: 'comparison', label: 'Comparison', align: 'left' },
        { key: 'hazardRatio', label: 'Hazard ratio', align: 'right' },
        { key: 'ci', label: '95% CI', align: 'right' },
        { key: 'z', label: 'z', align: 'right' },
        { key: 'p', label: 'p-value', align: 'right' }
      ],
      rows,
      footnotes: Array.isArray(options.footnotes) ? options.footnotes : buildHazardRatioFootnotes(summary),
      options: {
        fileName: options.fileName || 'survival-hazard-ratios',
        contextLabel: options.contextLabel || 'survival-hazard-ratios'
      },
      append: !!options.append
    });
    return rows.length;
  }

  function renderSurvivalMedianRatioTable(target, summary, options = {}){
    if(!(summary.medianRatios?.available) || !Array.isArray(summary.medianRatios.rows) || !summary.medianRatios.rows.length){
      return false;
    }
    renderStatsTableCard(target, {
      caption: 'Median Survival Ratios',
      section: 'estimates',
      columns: [
        { key: 'comparison', label: 'Comparison', align: 'left' },
        { key: 'ratio', label: 'Median ratio', align: 'right' }
      ],
      rows: summary.medianRatios.rows.map(row => ({
        comparison: `${row.groupB} / ${row.groupA}`,
        ratio: formatNumber(row.ratio, 3)
      })),
      footnotes: [
        'Ratios greater than 1 indicate longer median survival in the numerator group.',
        'This ratio is descriptive. A confidence interval for the ratio is not derived from the separate Kaplan–Meier median confidence limits.'
      ],
      options: {
        fileName: options.fileName || 'survival-median-ratios',
        contextLabel: options.contextLabel || 'survival-median-ratios'
      },
      append: options.append !== false
    });
    return true;
  }

  function renderSurvivalHazardRatios(summary){
    if(!refs.statsHazardRatios){
      return;
    }
    if(!summary.flags?.hazardRatiosEnabled){
      renderStatsLead(refs.statsHazardRatios, 'Enable "Show hazard ratios" above to compute pairwise comparisons.');
      return;
    }
    if(!(summary.hazardRatios?.available) || !Array.isArray(summary.hazardRatios.rows) || !summary.hazardRatios.rows.length){
      renderStatsLead(refs.statsHazardRatios, summary.hazardRatios?.message || 'Hazard ratios unavailable.');
      return;
    }
    const rowCount = renderSurvivalHazardRatioTable(refs.statsHazardRatios, summary, {
      caption: getHazardRatioTableCaption(summary),
      fileName: 'survival-hazard-ratios',
      contextLabel: 'survival-hazard-ratios'
    });
    renderSurvivalMedianRatioTable(refs.statsHazardRatios, summary, { append: true });
    logDebug('hazard ratio stats rendered', {
      rowCount,
      adjusted: hasSelectedCoxCovariates(summary),
      simpleTwoGroup: isTwoGroupUnadjustedCoxSummary(summary)
    });
  }

  function renderSurvivalCoxModel(summary){
    if(!refs.statsCox){
      return;
    }
    if(!summary.flags?.coxEnabled){
      renderStatsLead(refs.statsCox, 'Enable "Fit Cox model" above to review coefficient estimates.');
      return;
    }
    if(!(summary.coxModel?.available) || !Array.isArray(summary.coxModel.coefficients) || !summary.coxModel.coefficients.length){
      renderStatsLead(refs.statsCox, summary.coxModel?.message || 'Cox model unavailable.');
      return;
    }
    if(shouldOmitDuplicateCoxCoefficientTable(summary)){
      if(summary.flags?.hazardRatiosEnabled && summary.hazardRatios?.available){
        renderStatsLead(refs.statsCox, 'Cox model coefficients are omitted because, with exactly two groups and no covariates, they duplicate the hazard ratio table (HR = exp(β)).');
      }else if(summary.hazardRatios?.available){
        renderSurvivalHazardRatioTable(refs.statsCox, summary, {
          caption: 'Hazard ratio (Cox model)',
          fileName: 'survival-cox-hazard-ratio',
          contextLabel: 'survival-cox-hazard-ratio'
        });
      }else{
        renderStatsLead(refs.statsCox, summary.hazardRatios?.message || 'Cox model hazard ratio unavailable.');
      }
      logDebug('cox coefficient table omitted as duplicate', {
        groupCount: summary.series.length,
        covariateCount: getCoxSelectedCovariates(summary).length,
        hazardPanelRendered: !!summary.flags?.hazardRatiosEnabled
      });
      return;
    }
    const rows = summary.coxModel.coefficients.map(coef => ({
      predictor: coef.label || coef.group || '',
      type: coef.type === 'group' ? 'Group' : (coef.type === 'time' ? 'Time-dependent' : 'Baseline'),
      beta: formatNumber(coef.beta, 3),
      hazardRatio: formatNumber(coef.hazardRatio, 3),
      ci: formatInterval(coef.ciLow, coef.ciHigh),
      z: Number.isFinite(coef.z) ? formatNumber(coef.z, 3) : 'n/a',
      p: pValueToken(coef.p, createSurvivalInferenceSpec({ method: 'none', valueKind: 'raw-p' }))
    }));
    const diag = summary.coxModel.diagnostics || {};
    const lr = diag.likelihoodRatio || {};
    const adjustedModel = hasSelectedCoxCovariates(summary);
    const groupCoefficientCount = getCoxGroupCoefficientCount(summary);
    const coxCaption = adjustedModel
      ? 'Cox Model Coefficients'
      : (groupCoefficientCount > 0 ? 'Cox Model Group Effects' : 'Cox Model Coefficients');
    const footnotes = [
      `Baseline group: ${summary.coxModel.baselineGroup || 'Reference'}`,
      adjustedModel && groupCoefficientCount > 0 ? 'Group hazard ratios are adjusted for the selected Cox covariates.' : null,
      !adjustedModel && groupCoefficientCount > 0 ? 'Group effects are baseline-referenced Cox coefficients; hazard ratio = exp(β).' : null,
      `Log-likelihood = ${formatNumber(diag.logLikelihood, 3)} | Null = ${formatNumber(diag.logLikelihoodNull, 3)}`,
      [`Likelihood ratio χ²(${lr.df ?? 'n/a'}) = ${formatNumber(lr.statistic, 3)}, p = `, pValueToken(lr.p, createSurvivalInferenceSpec({ method: 'none', valueKind: 'raw-p' }))],
      `AIC = ${formatNumber(diag.aic, 3)} | BIC = ${formatNumber(diag.bic, 3)}`,
      `Iterations = ${diag.iterations ?? 'n/a'} | Converged: ${diag.converged ? 'Yes' : 'No'}`
    ].filter(Boolean);
    renderStatsTableCard(refs.statsCox, {
      caption: coxCaption,
      section: 'estimates',
      columns: [
        { key: 'predictor', label: 'Predictor', align: 'left' },
        { key: 'type', label: 'Type', align: 'left' },
        { key: 'beta', label: 'β', align: 'right' },
        { key: 'hazardRatio', label: 'Hazard Ratio', align: 'right' },
        { key: 'ci', label: '95% CI', align: 'right' },
        { key: 'z', label: 'z', align: 'right' },
        { key: 'p', label: 'p-value', align: 'right' }
      ],
      rows,
      footnotes,
      options: {
        fileName: 'survival-cox-model',
        contextLabel: 'survival-cox-model'
      }
    });
    const concordance = diag.concordance || null;
    if(concordance){
      renderStatsTableCard(refs.statsCox, {
        caption: 'Cox Model Diagnostics',
        section: 'diagnostics',
        columns: [
          { key: 'metric', label: 'Metric', align: 'left' },
          { key: 'value', label: 'Value', align: 'right' }
        ],
        rows: [
          { metric: "Harrell's C", value: formatNumber(concordance.c, 3) },
          { metric: "Harrell's C uncertainty", value: 'Not reported (subject-level influence/bootstrap variance required)' },
          { metric: 'Comparable pairs', value: Number.isFinite(concordance.comparable) ? String(concordance.comparable) : 'n/a' },
          { metric: 'Concordant pairs', value: Number.isFinite(concordance.concordant) ? String(concordance.concordant) : 'n/a' }
        ],
        footnotes: ['Higher concordance indicates better risk ranking. No confidence interval is reported because overlapping comparable pairs require subject-level influence or bootstrap variance.'],
        options: {
          fileName: 'survival-cox-diagnostics',
          contextLabel: 'survival-cox-diagnostics'
        },
        append: true
      });
    }
    const residuals = diag.residuals || {};
    const residualRows = [
      { label: 'Martingale', summary: residuals.martingale },
      { label: 'Deviance', summary: residuals.deviance },
      { label: 'Cox-Snell', summary: residuals.coxSnell }
    ].filter(entry => entry.summary);
    if(residualRows.length){
      renderStatsTableCard(refs.statsCox, {
        caption: 'Residual Summaries',
        section: 'diagnostics',
        columns: [
          { key: 'residual', label: 'Residual', align: 'left' },
          { key: 'mean', label: 'Mean', align: 'right' },
          { key: 'sd', label: 'SD', align: 'right' },
          { key: 'range', label: 'Range', align: 'right' }
        ],
        rows: residualRows.map(entry => ({
          residual: entry.label,
          mean: formatNumber(entry.summary.mean, 3),
          sd: formatNumber(entry.summary.sd, 3),
          range: `${formatNumber(entry.summary.min, 3)} to ${formatNumber(entry.summary.max, 3)}`
        })),
        footnotes: ['Residual summaries help flag lack of fit and influential observations.'],
        options: {
          fileName: 'survival-cox-residuals',
          contextLabel: 'survival-cox-residuals'
        },
        append: true
      });
    }
    if(Array.isArray(residuals.schoenfeld) && residuals.schoenfeld.length){
      renderStatsTableCard(refs.statsCox, {
        caption: 'Exploratory Schoenfeld Residual–Time Correlations',
        section: 'diagnostics',
        columns: [
          { key: 'predictor', label: 'Predictor', align: 'left' },
          { key: 'correlation', label: 'Corr(log time)', align: 'right' },
          { key: 'meanAbs', label: 'Mean |scaled residual|', align: 'right' }
        ],
        rows: residuals.schoenfeld.map(entry => ({
          predictor: entry.predictor,
          correlation: formatNumber(entry.correlation, 3),
          meanAbs: formatNumber(entry.meanAbs, 3)
        })),
        footnotes: ['Exploratory only: these are simple residual–log(time) correlations, not the formal Grambsch–Therneau proportional-hazards test implemented by cox.zph.'],
        options: {
          fileName: 'survival-schoenfeld-checks',
          contextLabel: 'survival-schoenfeld-checks'
        },
        append: true
      });
    }
    logDebug('cox stats rendered', {
      rowCount: rows.length,
      baseline: summary.coxModel.baselineGroup
    });
  }

  function getGraphPayload(meta = {}){
    const requestedSession = getSurvivalSession(meta?.tab || meta?.tabId || null, meta, { create: false, fallbackActive: true })
      || getActiveSurvivalSessionForState();
    const activeSession = getActiveSurvivalSessionForState();
    const usingActiveModuleState = !requestedSession || requestedSession === activeSession;
    if(usingActiveModuleState){
      syncSurvivalRuntimeControlsFromDom();
      captureSurvivalSessionStateFromActive(requestedSession || activeSession, {
        reason: meta?.reason || 'survival-payload-active-capture',
        // Statistics rendering owns panel-model capture. Payload reads must not
        // reinterpret an already durable model from the current DOM shell.
        captureStatsPanels: false
      });
    }
    const payloadSession = requestedSession || activeSession;
    const payloadState = usingActiveModuleState
      ? createDefaultSurvivalDurableState({
          labelColors: state.labelColors,
          labelStrokeWidth: state.labelStrokeWidth,
          labelOpacity: state.labelOpacity,
          labelLinePattern: state.labelLinePattern,
          groupOrder: state.groupOrder,
          minSvgWidth: state.minSvgWidth,
          fileName: state.fileName,
          titleText: state.titleText,
          lastSummary: state.lastSummary,
          lastStats: state.lastStats,
          statsPanelModels: state.statsPanelModels,
          pairwiseCorrection: state.pairwiseCorrection,
          statsReportPScientific: state.statsReportPScientific,
          covariateSettings: state.covariateSettings,
          covariateColumns: state.covariateColumns,
          axisSettings: state.axisSettings,
          gridStyle: state.gridStyle,
          labelPositions: state.labelPositions,
          controls: state.controls
        })
      : createDefaultSurvivalDurableState(payloadSession?.state || {});
    let activeHot = usingActiveModuleState
      ? (state.ensureHotForActiveTab?.() || state.hot)
      : (payloadSession?.managers?.hot || null);
    if(!usingActiveModuleState && !survivalHotBelongsToSession(activeHot, payloadSession)){
      activeHot = null;
    }
    if(!activeHot){
      survivalDebug('Debug: survival.getPayload skipped - no table instance');
      return null;
    }
    const payloadTabId = payloadSession?.tabId || meta?.tabId || getSurvivalProjectionTabId() || null;
    let activeManager = usingActiveModuleState
      ? ensureSurvivalDataViewsForHot(activeHot, {
          wrapper: $('#survivalHotWrapper'),
          container: activeHot.__survivalHostContainer || refs.hotContainer || $('#survivalHot'),
          tabId: payloadTabId
        })
      : (payloadSession?.managers?.dataViews || activeHot.__survivalDataViewsManager || null);
    if(!usingActiveModuleState && !survivalDataViewsManagerBelongsToSession(activeManager, payloadSession)){
      activeManager = null;
    }
    if(usingActiveModuleState){
      syncSurvivalActiveDataViewFromHot(activeHot, 'payload');
    }
    const dataViewsPayload = activeManager?.serialize?.({ includeData: true }) || null;
    const includeDataViews = !!(dataViewsPayload && Array.isArray(dataViewsPayload.views) && dataViewsPayload.views.length > 1);
    const payloadSourceData = Shared.dataViews?.resolveRawDataForPersistence?.(dataViewsPayload, activeHot.getData())
      || activeHot.getData();
    const axisSettings = createDefaultSurvivalDurableState({ axisSettings: payloadState.axisSettings }).axisSettings;
    const notesSnapshot = usingActiveModuleState ? captureSurvivalNotesMirror() : createDefaultSurvivalNotesState(payloadSession?.notes || {});
    const advisorSnapshot = usingActiveModuleState
      ? createDefaultSurvivalAdvisorState(getSurvivalAdvisorState(payloadSession))
      : createDefaultSurvivalAdvisorState(payloadSession?.advisor || {});
    const controls = normalizeSurvivalRuntimeControls(payloadState.controls || {});
    const statsPanelModels = usingActiveModuleState
      ? createDefaultSurvivalStatsPanelModels(payloadState.statsPanelModels || state.statsPanelModels || {})
      : createDefaultSurvivalStatsPanelModels(payloadSession?.results?.statsPanelModels || payloadState.statsPanelModels || {});
    const statsPayload = usingActiveModuleState
      ? (cloneSimple(state.lastStats) || null)
      : (cloneSimple(payloadSession?.results?.stats ?? payloadState.lastStats) || null);
    const payload = {
      type: 'survival',
      data: Shared.hot.trimTrailingEmptyCols(payloadSourceData),
      exclusions: activeHot?.exportExclusions?.() || Shared.hot.exportExclusions(activeHot),
      filters: activeHot?.exportFilters?.() || Shared.hot.exportFilters(activeHot),
      dataViews: includeDataViews ? dataViewsPayload : undefined,
      activeDataViewId: includeDataViews ? (dataViewsPayload?.activeViewId || null) : undefined,
      config: {
        colorScheme: Shared.colorSchemes?.getSelectedSchemeId?.('survival') || 'scientific',
        labelColors: cloneSimple(payloadState.labelColors) || {},
        labelStrokeWidth: cloneSimple(payloadState.labelStrokeWidth) || {},
        labelOpacity: cloneSimple(payloadState.labelOpacity) || {},
        labelLinePattern: cloneSimple(payloadState.labelLinePattern) || {},
        showCI: !!controls.showCI,
        showCensor: !!controls.showCensor,
        showRiskTable: !!controls.showRiskTable,
        showPlotStats: !!controls.showPlotStats,
        showHazardRatios: !!controls.showHazardRatios,
        fitCoxModel: !!controls.fitCoxModel,
        pairwiseCorrection: payloadState.pairwiseCorrection || 'holm-sidak',
        statsReportPScientific: sanitizeSurvivalStatsReportPScientific(payloadState.statsReportPScientific),
        showGrid: !!controls.showGrid,
        gridStyle: sanitizeGridStyle(payloadState.gridStyle, axisSettings.strokeWidth),
        showFrame: !!controls.showFrame,
        showLegend: controls.showLegend !== false,
        timeMax: controls.timeMax || '',
        fontSize: controls.fontSize || '12',
        fontStyles: (exportFontStyles('survival', { tabId: payloadTabId }) || undefined),
        xLabel: controls.xLabel || '',
        yLabel: controls.yLabel || '',
        title: payloadState.titleText,
        covariateSettings: cloneSimple(payloadState.covariateSettings) || {},
        axis: {
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
        },
        notes: notesSnapshot,
        advisor: advisorSnapshot,
        labelPositions: cloneSimple(payloadState.labelPositions) || null,
        statsPanels: statsPanelModels
      },
      stats: statsPayload ? { ...(cloneSimple(statsPayload) || statsPayload), statsPanels: statsPanelModels } : null
    };
    if(payloadSession?.state){
      payloadSession.state = createDefaultSurvivalDurableState({
        ...payloadSession.state,
        ...payloadState,
        lastStats: statsPayload,
        statsPanelModels,
        controls
      });
      payloadSession.results = createDefaultSurvivalResultsState({ stats: statsPayload, statsPanelModels });
      payloadSession.notes = notesSnapshot;
      payloadSession.advisor = advisorSnapshot;
      payloadSession.updatedAt = Date.now();
    }
    survivalDebug('Debug: survival.getPayload captured state', {
      rows: payload.data?.length || 0,
      cols: payload.data?.[0]?.length || 0,
      showCI: payload.config.showCI,
      hazardRatios: payload.config.showHazardRatios,
      fitCoxModel: payload.config.fitCoxModel,
      hasStats: !!payload.stats,
      covariateSettingKeys: Object.keys(payload.config.covariateSettings || {})
    });
    return payload;
  }
  survival.getPayload = getGraphPayload;
  {
    const tableUiHooks = Shared.hot?.makeTableUiStateHooks?.(
      () => (typeof state.ensureHotForActiveTab === 'function' ? state.ensureHotForActiveTab() : null) || state.hot,
      'survival'
    );
    survival.captureUiState = tableUiHooks ? tableUiHooks.capture : () => null;
    survival.applyUiState = tableUiHooks ? tableUiHooks.apply : () => false;
  }
  function syncSurvivalRuntimeControlsFromState(controlSnapshot = {}, session = null){
    state.controls = normalizeSurvivalRuntimeControls(controlSnapshot || state.controls || {});
    const controls = state.controls;
    const hasControl = key => Object.prototype.hasOwnProperty.call(controls, key);
    const setChecked = (control, key) => {
      if(control && hasControl(key)){
        control.checked = !!controls[key];
      }
    };
    setChecked(refs.showCI, 'showCI');
    setChecked(refs.showCensor, 'showCensor');
    setChecked(refs.showRiskTable, 'showRiskTable');
    setChecked(refs.showPlotStats, 'showPlotStats');
    setChecked(refs.showHazardRatios, 'showHazardRatios');
    setChecked(refs.fitCoxModel, 'fitCoxModel');
    setChecked(refs.showGrid, 'showGrid');
    setChecked(refs.showFrame, 'showFrame');
    if(refs.showLegend && hasControl('showLegend')){
      refs.showLegend.checked = controls.showLegend !== false;
      ensureSurvivalLegendControlPlacement();
    }
    if(refs.timeMax && hasControl('timeMax') && controls.timeMax != null){
      refs.timeMax.value = String(controls.timeMax);
    }
    if(refs.fontSize && hasControl('fontSize') && controls.fontSize != null){
      refs.fontSize.value = String(controls.fontSize);
      if(refs.fontSize.dataset){
        refs.fontSize.dataset.fontBasePt = String(refs.fontSize.value);
      }
      chartStyle.renderFontSizeLabel?.({ element: refs.fontSizeVal, pt: Number(refs.fontSize.value), input: refs.fontSize, manual: true });
    }
    const pairwiseCorrectionSelect = getSurvivalNodeById('survivalPairwiseCorrection');
    if(pairwiseCorrectionSelect){
      pairwiseCorrectionSelect.value = state.pairwiseCorrection || 'holm-sidak';
    }
    syncSurvivalStatsPValuePanelState();
    refreshCovariateControls();
    renderSurvivalStatsAdvisor(state.lastSummary || {
      series: [],
      covariateColumns: state.covariateColumns || [],
      logRank: { available: false }
    }, null, ensureSurvivalSessionOwnershipShape(session || getActiveSurvivalSessionForState()));
  }

  survival.captureRuntimeState = function captureSurvivalRuntimeState(meta = {}){
    const requestedSession = getSurvivalSession(meta?.tab || meta?.tabId || null, meta, { create: false, fallbackActive: true })
      || getActiveSurvivalSessionForState();
    const activeSession = getActiveSurvivalSessionForState();
    const session = requestedSession === activeSession
      ? captureSurvivalSessionStateFromActive(requestedSession, {
          reason: meta?.reason || 'survival-runtime-capture',
          // Runtime persistence is owner-state capture, not DOM reconstruction.
          captureStatsPanels: false
        })
      : ensureSurvivalSessionOwnershipShape(requestedSession);
    const sessionState = createDefaultSurvivalDurableState(session?.state || state);
    const sessionResults = createDefaultSurvivalResultsState(session?.results || {
      stats: sessionState.lastStats,
      statsPanelModels: sessionState.statsPanelModels
    });
    const snapshot = {
      state: {
        labelColors: cloneSimple(sessionState.labelColors) || {},
        labelStrokeWidth: cloneSimple(sessionState.labelStrokeWidth) || {},
        labelOpacity: cloneSimple(sessionState.labelOpacity) || {},
        labelLinePattern: cloneSimple(sessionState.labelLinePattern) || {},
        groupOrder: cloneSimple(sessionState.groupOrder) || [],
        minSvgWidth: sessionState.minSvgWidth,
        fileName: sessionState.fileName,
        titleText: sessionState.titleText,
        lastSummary: cloneSimple(sessionState.lastSummary) || null,
        lastStats: cloneSimple(sessionResults.stats ?? sessionState.lastStats) || null,
        statsPanelModels: createDefaultSurvivalStatsPanelModels(sessionResults.statsPanelModels || sessionState.statsPanelModels),
        pairwiseCorrection: sessionState.pairwiseCorrection || 'holm-sidak',
        statsReportPScientific: sanitizeSurvivalStatsReportPScientific(sessionState.statsReportPScientific),
        covariateSettings: cloneSimple(sessionState.covariateSettings) || {},
        covariateColumns: cloneSimple(sessionState.covariateColumns) || [],
        axisSettings: cloneSimple(sessionState.axisSettings) || null,
        gridStyle: cloneSimple(sessionState.gridStyle) || null,
        labelPositions: cloneSimple(sessionState.labelPositions) || {},
        controls: cloneSimple(sessionState.controls) || createDefaultSurvivalRuntimeControls()
      },
      advisor: createDefaultSurvivalAdvisorState(getSurvivalAdvisorState(session)),
      notes: createDefaultSurvivalNotesState(session?.notes || notesState),
      parseDebugCounter: Number(parseDebugCounter) || 0,
      reason: meta?.reason || 'survival-runtime-capture'
    };
    setSurvivalSessionStateFromRuntimeRecord(snapshot, {
      ...(meta || {}),
      tab: meta?.tab || null,
      tabId: meta?.tabId || session?.tabId || getSurvivalProjectionTabId() || null,
      reason: snapshot.reason
    });
    survivalDebug('Debug: survival runtime snapshot captured', {
      tabId: meta?.tabId || session?.tabId || getSurvivalProjectionTabId() || null,
      title: snapshot.state.titleText,
      notesOpen: snapshot.notes.open,
      reason: snapshot.reason
    });
    rememberSurvivalOwnedRuntimeRecord(meta?.tab || meta?.tabId || session?.tabId || null, snapshot, {
      ...(meta || {}),
      reason: snapshot.reason || meta?.reason || 'survival-runtime-capture'
    });
    return Shared.componentLifecycle?.rememberComponentRuntimeSnapshot?.(survival, snapshot, {
      ...(meta || {}),
      reason: snapshot.reason || meta?.reason || 'survival-runtime-capture'
    }) || snapshot;
  };

  survival.applyRuntimeState = function applySurvivalRuntimeState(snapshot, meta = {}){
    snapshot = resolveSurvivalOwnedRuntimeSnapshot(snapshot, meta)
      || Shared.componentLifecycle?.resolveComponentRuntimeSnapshot?.(survival, snapshot, meta)
      || snapshot;
    if(!snapshot || typeof snapshot !== 'object'){
      survivalDebug('Debug: survival runtime snapshot apply skipped', { tabId: meta?.tabId || null, reason: 'missing-snapshot' });
      return false;
    }
    const applySession = bindSurvivalSessionForTab(meta?.tab || meta?.tabId || snapshot.tabId || getSurvivalProjectionTabId() || null, {
      ...(meta || {}),
      reason: meta?.reason || 'survival-runtime-apply-bind'
    }, { apply: false });
    setSurvivalSessionStateFromRuntimeRecord(snapshot, {
      ...(meta || {}),
      tabId: applySession?.tabId || meta?.tabId || getSurvivalProjectionTabId() || null,
      reason: meta?.reason || 'survival-runtime-apply-state'
    });
    if(snapshot.state && typeof snapshot.state === 'object'){
      const nextState = snapshot.state;
      state.labelColors = cloneSimple(nextState.labelColors) || state.labelColors || {};
      state.labelStrokeWidth = cloneSimple(nextState.labelStrokeWidth) || state.labelStrokeWidth || {};
      state.labelOpacity = cloneSimple(nextState.labelOpacity) || state.labelOpacity || {};
      state.labelLinePattern = cloneSimple(nextState.labelLinePattern) || state.labelLinePattern || {};
      state.groupOrder = cloneSimple(nextState.groupOrder) || state.groupOrder || [];
      state.minSvgWidth = Number.isFinite(Number(nextState.minSvgWidth)) ? Number(nextState.minSvgWidth) : state.minSvgWidth;
      state.titleText = typeof nextState.titleText === 'string' ? nextState.titleText : state.titleText;
      if(Object.prototype.hasOwnProperty.call(nextState, 'lastSummary')){ state.lastSummary = cloneSimple(nextState.lastSummary); }
      if(Object.prototype.hasOwnProperty.call(nextState, 'lastStats')){ state.lastStats = cloneSimple(nextState.lastStats); }
      if(Object.prototype.hasOwnProperty.call(nextState, 'statsPanelModels')){
        state.statsPanelModels = cloneSimple(nextState.statsPanelModels) || { summary: null, logRank: null, hazardRatios: null, cox: null };
        restoreSurvivalStatsPanelModels(state.statsPanelModels, applySession);
      }
      state.pairwiseCorrection = typeof nextState.pairwiseCorrection === 'string' ? nextState.pairwiseCorrection : state.pairwiseCorrection;
      if(Object.prototype.hasOwnProperty.call(nextState, 'statsReportPScientific')){
        state.statsReportPScientific = sanitizeSurvivalStatsReportPScientific(nextState.statsReportPScientific);
      }else{
        state.statsReportPScientific = false;
      }
      syncSurvivalStatsPValuePanelState();
      state.covariateSettings = cloneSimple(nextState.covariateSettings) || state.covariateSettings || {};
      state.covariateColumns = cloneSimple(nextState.covariateColumns) || state.covariateColumns || [];
      state.axisSettings = cloneSimple(nextState.axisSettings) || state.axisSettings;
      if(Object.prototype.hasOwnProperty.call(nextState, 'gridStyle')){ state.gridStyle = cloneSimple(nextState.gridStyle); }
      state.labelPositions = normalizeSurvivalLabelPositions(nextState.labelPositions);
    }
    if(snapshot.advisor && typeof snapshot.advisor === 'object'){
      setSurvivalAdvisorState(snapshot.advisor, applySession || getSurvivalProjectionSession({ reason: 'survival-projection-mutation' }));
    }
    syncSurvivalRuntimeControlsFromState(normalizeSurvivalRestoredRuntimeControls(snapshot.state?.controls || {}), applySession);
    if(snapshot.notes && typeof snapshot.notes === 'object'){
      notesState.text = snapshot.notes.text == null ? '' : String(snapshot.notes.text);
      notesState.open = !!snapshot.notes.open;
      if(canUseSurvivalNotesControl(notesState.control)){
        notesState.control.setValue(notesState.text);
        notesState.control.setOpen(notesState.open);
      }
    }
    parseDebugCounter = Number(snapshot.parseDebugCounter) || parseDebugCounter || 0;
    rememberSurvivalOwnedRuntimeRecord(meta?.tab || meta?.tabId || null, snapshot, {
      ...(meta || {}),
      reason: meta?.reason || 'survival-runtime-apply'
    });
    Shared.componentLifecycle?.rememberComponentRuntimeSnapshot?.(survival, snapshot, {
      ...(meta || {}),
      reason: meta?.reason || 'survival-runtime-apply'
    });
    captureSurvivalSessionStateFromActive(applySession || getSurvivalProjectionSession({ reason: 'survival-projection-mutation' }), {
      reason: meta?.reason || 'survival-runtime-apply-capture',
      // The restored snapshot is canonical. Re-capturing the just-projected DOM
      // here can only degrade exact reopen fidelity.
      captureStatsPanels: false
    });
    survivalDebug('Debug: survival runtime snapshot applied', {
      tabId: meta?.tabId || getSurvivalProjectionTabId() || null,
      title: state.titleText,
      reason: meta?.reason || 'survival-runtime-apply'
    });
    return true;
  };

  const baseSurvivalDeactivateTab = Shared.componentLifecycle?.createDeactivateHandler?.({
    component: survival,
    componentKey: 'survival'
  }) || function deactivateSurvivalTab(tab, meta = {}){
    survival.__runtimeGeneration = (Number(survival.__runtimeGeneration) || 0) + 1;
    survivalDebug('Debug: survival tab deactivated', {
      tabId: (tab && typeof tab === 'object' ? tab.id : tab) || meta?.tabId || null,
      generation: survival.__runtimeGeneration,
      reason: meta?.reason || 'deactivate-tab'
    });
    return true;
  };
  survival.deactivateTab = function deactivateSurvivalTabWithSessionCapture(tab, meta = {}){
    const tabId = (tab && typeof tab === 'object' ? tab.id : tab) || meta?.tabId || getSurvivalProjectionTabId() || null;
    const session = getSurvivalSession(tab || tabId || null, { ...(meta || {}), tabId, reason: meta?.reason || 'survival-deactivate-session' }, { create: false })
      || getActiveSurvivalSessionForState();
    const activeSession = getActiveSurvivalSessionForState();
    if(session && (!tabId || String(session.tabId || '') === String(getSurvivalProjectionTabId() || '') || session === activeSession)){
      captureSurvivalSessionStateFromActive(session, {
        reason: meta?.reason || 'survival-deactivate-session-capture',
        captureStatsPanels: false
      });
    }
    return baseSurvivalDeactivateTab(tab, meta);
  };
  survival.captureEmptyPayloadTemplate = function captureSurvivalEmptyPayloadTemplate(){
    const snapshot = survival.createEmptyPayload();
    emptyPayloadTemplate = cloneSimple(snapshot) || snapshot;
    const session = getActiveSurvivalSessionForState();
    if(session?.cache){
      session.cache.emptyPayloadTemplate = cloneSimple(emptyPayloadTemplate) || emptyPayloadTemplate;
      session.updatedAt = Date.now();
    }
    survivalDebug('Debug: survival empty payload template captured', { hasTemplate: !!snapshot });
    return snapshot;
  };
  survival.restoreEmptyPayloadTemplate = function restoreSurvivalEmptyPayloadTemplate(template, options = {}){
    if(!template || typeof template !== 'object'){
      survivalDebug('Debug: survival empty payload template restore skipped', { reason: 'invalid-template', options });
      return false;
    }
    emptyPayloadTemplate = cloneSimple(template);
    const session = getActiveSurvivalSessionForState();
    if(session?.cache){
      session.cache.emptyPayloadTemplate = cloneSimple(emptyPayloadTemplate) || null;
      session.updatedAt = Date.now();
    }
    survivalDebug('Debug: survival empty payload template restored', { hasTemplate: !!emptyPayloadTemplate, reason: options.reason || 'unspecified' });
    return !!emptyPayloadTemplate;
  };
  survival.createEmptyPayload = function createEmptySurvivalPayload(){
    console.debug('Debug: survival.createEmptyPayload pure factory invoked', {
      ready: !!survival.ready,
      boundTabId: getSurvivalProjectionTabId() || null
    });
    const payload = { type: 'survival', config: {} };
    payload.type = 'survival';
    const createEmpty = Shared.createEmptyData;
    const emptyData = typeof createEmpty === 'function'
      ? createEmpty(DEFAULT_ROWS, SURVIVAL_DEFAULT_COLS)
      : Array.from({ length: DEFAULT_ROWS }, () => Array(SURVIVAL_DEFAULT_COLS).fill(''));
    payload.data = emptyData;
    payload.exclusions = [];
    payload.filters = null;
    payload.stats = null;
    payload.config = payload.config && typeof payload.config === 'object' ? payload.config : {};
    if(typeof payload.config.colorScheme !== 'string' || !payload.config.colorScheme.trim()){
      payload.config.colorScheme = Shared.colorSchemes?.getDefaultSchemeId?.('survival') || 'scientific';
    }
    payload.config.showRiskTable = false;
    payload.config.showPlotStats = false;
    payload.config.showLegend = true;
    return payload;
  };

  function applySurvivalPayload(payload, meta){
    const source = meta?.source || 'unknown';
    if(!payload || payload.type !== 'survival'){
      logDebug('payload rejected', { source, hasType: !!payload?.type });
      return false;
    }
    const skipDraw = meta?.skipDraw === true;
    const styleOnly = meta?.styleOnly === true || meta?.colorSchemeOnly === true;
    const skipDataLoad = meta?.skipDataLoad === true || styleOnly;
    const scheduleTargetTab = meta?.tab || meta?.tabId || getSurvivalProjectionTabId() || null;
    const hasExplicitScheduleTarget = !!(meta?.tab || meta?.tabId);
    const scheduleTargetSession = scheduleTargetTab
      ? getSurvivalSession(scheduleTargetTab, { ...(meta || {}), reason: 'survival-payload-scheduler-owner' }, { create: false, fallbackActive: false })
      : getActiveSurvivalSessionForState();
    const canMuteActiveScheduler = hasExplicitScheduleTarget
      ? !!(scheduleTargetSession && isSurvivalSessionActivationTarget(scheduleTargetSession))
      : (!scheduleTargetSession || isSurvivalSessionActivationTarget(scheduleTargetSession));
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
    const rawDataMatrix = Array.isArray(payload.data) ? payload.data : [];
    const serializedViews = (payload.dataViews && typeof payload.dataViews === 'object') ? payload.dataViews : null;
    const requestedActiveViewId = payload.activeDataViewId || serializedViews?.activeViewId || null;
    const dataManager = state.hot
      ? ensureSurvivalDataViewsForHot(state.hot, {
          wrapper: $('#survivalHotWrapper'),
          container: state.hot.__survivalHostContainer || refs.hotContainer || $('#survivalHot')
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
    if(!skipDataLoad && state.hot){
      state.hot.loadData(dataToLoad);
      if(exclusionsToApply){
        state.hot.applyExclusions?.(exclusionsToApply);
      }
      if(filtersToApply){
        state.hot.applyFilters?.(filtersToApply, { schedule: false });
      }
      syncSurvivalActiveDataViewFromHot(state.hot, 'payload-load');
      collectSeries();
    }
    const sharedStatsReporting = payload?.meta?.statsReporting;
    const hasSharedPValueFormat = !!(
      sharedStatsReporting
      && typeof sharedStatsReporting === 'object'
      && Object.prototype.hasOwnProperty.call(sharedStatsReporting, 'pValueScientific')
    );
    applyConfig(payload.config, {
      session: scheduleTargetSession || getActiveSurvivalSessionForState(),
      statsReportPScientific: hasSharedPValueFormat
        ? sharedStatsReporting.pValueScientific
        : payload.config?.statsReportPScientific
    });
    state.lastStats = payload.stats || null;
    state.statsPanelModels = cloneSimple(payload.config?.statsPanels || payload.stats?.statsPanels) || state.statsPanelModels || { summary: null, logRank: null, hazardRatios: null, cox: null };
    if(!payload.stats){
      renderStatsLead(refs.statsSummary, 'Enter at least one group with time and event values to compute statistics.');
      renderStatsLead(refs.statsLogRank, 'Log-rank test results will appear after statistics are calculated.');
      if(refs.statsHazardRatios){
        renderStatsLead(refs.statsHazardRatios, 'Enable "Show hazard ratios" above to compute pairwise comparisons.');
      }
      if(refs.statsCox){
        renderStatsLead(refs.statsCox, 'Enable "Fit Cox model" above to review coefficient estimates.');
      }
    }else{
      restoreSurvivalStatsPanelModels(state.statsPanelModels, scheduleTargetSession || getActiveSurvivalSessionForState());
    }
    if(!skipDraw){
      scheduleActiveSurvivalDraw({ reason: 'survival-payload-applied', tabId: getSurvivalProjectionTabId() || null });
    }
    if(scheduleBackup && state.scheduleDraw === mutedScheduleDraw){
      state.scheduleDraw = scheduleBackup;
    }
    captureSurvivalSessionStateFromActive(getSurvivalProjectionSession({ reason: 'survival-projection-mutation' }), {
      reason: 'survival-payload-applied',
      // The loaded payload is the canonical stats-panel model. Re-reading the
      // rendered shell here changes its representation without a user edit.
      captureStatsPanels: false
    });
    logDebug('payload applied', { source, rows: dataToLoad?.length || 0, hasStats: !!payload.stats });
    return true;
  }

  function applyConfig(config, options = {}){
    if(!config){
      return;
    }
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
    if(canUseSurvivalNotesControl(notesState.control)){
      notesState.control.setValue(notesState.text);
      notesState.control.setOpen(notesState.open);
    }
    const configOwnerSession = ensureSurvivalSessionOwnershipShape(options.session || getActiveSurvivalSessionForState());
    setSurvivalAdvisorState(config.advisor || {}, configOwnerSession);
    state.labelColors = Object.assign({}, config.labelColors || {});
    state.labelStrokeWidth = Object.assign({}, config.labelStrokeWidth || {});
    state.labelOpacity = Object.assign({}, config.labelOpacity || {});
    state.labelLinePattern = Object.assign({}, config.labelLinePattern || {});
    if(config.covariateSettings && typeof config.covariateSettings === 'object'){
      state.covariateSettings = Object.assign({}, config.covariateSettings);
      logDebug('covariate settings restored', { keys: Object.keys(state.covariateSettings) });
    } else {
      if(Object.keys(state.covariateSettings || {}).length){
        logDebug('covariate settings reset due to missing config (legacy payload)');
      }
      state.covariateSettings = {};
    }
    const nextControls = { ...(state.controls || {}) };
    ['showCI', 'showCensor', 'showHazardRatios', 'fitCoxModel', 'showGrid', 'showFrame'].forEach(key => {
      if(Object.prototype.hasOwnProperty.call(config, key)){
        nextControls[key] = config[key];
      }
    });
    nextControls.showLegend = Object.prototype.hasOwnProperty.call(config, 'showLegend')
      ? config.showLegend !== false
      : true;
    nextControls.showRiskTable = Object.prototype.hasOwnProperty.call(config, 'showRiskTable')
      ? !!config.showRiskTable
      : false;
    nextControls.showPlotStats = Object.prototype.hasOwnProperty.call(config, 'showPlotStats')
      ? !!config.showPlotStats
      : false;
    ['timeMax', 'fontSize', 'xLabel', 'yLabel'].forEach(key => {
      if(config[key] != null){
        nextControls[key] = config[key];
      }
    });
    state.controls = normalizeSurvivalRuntimeControls(nextControls);
    syncSurvivalRuntimeControlsFromState(state.controls, configOwnerSession);
    state.pairwiseCorrection = typeof config.pairwiseCorrection === 'string' ? config.pairwiseCorrection : (state.pairwiseCorrection || 'holm-sidak');
    state.statsReportPScientific = Object.prototype.hasOwnProperty.call(options, 'statsReportPScientific')
      ? sanitizeSurvivalStatsReportPScientific(options.statsReportPScientific)
      : sanitizeSurvivalStatsReportPScientific(config.statsReportPScientific);
    syncSurvivalStatsPValuePanelState({ preferenceOverride: state.statsReportPScientific });
    const pairwiseCorrectionSelect = getSurvivalNodeById('survivalPairwiseCorrection');
    if(pairwiseCorrectionSelect){
      pairwiseCorrectionSelect.value = state.pairwiseCorrection;
    }
    setGridStyle(config.gridStyle, config.axis?.strokeWidth);
    importFontStyles('survival', config.fontStyles || null, { tabId: getSurvivalProjectionTabId() || getActiveSurvivalSessionForState()?.tabId || null });
    if(config.title !== undefined){
      state.titleText = config.title != null ? String(config.title) : '';
    }else if(state.titleText == null){
      state.titleText = 'Survival curve';
    }
    // A payload is authoritative for label placement. Missing legacy positions
    // reset to defaults rather than inheriting the previously projected tab.
    state.labelPositions = normalizeSurvivalLabelPositions(config.labelPositions);
    applyAxisSettings(config.axis || config.axisSettings);
    const configSession = configOwnerSession;
    if(configSession?.state){
      configSession.state = createDefaultSurvivalDurableState({
        ...configSession.state,
        labelColors: state.labelColors,
        labelStrokeWidth: state.labelStrokeWidth,
        labelOpacity: state.labelOpacity,
        labelLinePattern: state.labelLinePattern,
        covariateSettings: state.covariateSettings,
        pairwiseCorrection: state.pairwiseCorrection,
        statsReportPScientific: state.statsReportPScientific,
        gridStyle: state.gridStyle,
        titleText: state.titleText,
        labelPositions: state.labelPositions,
        axisSettings: state.axisSettings,
        controls: state.controls
      });
      configSession.notes = createDefaultSurvivalNotesState(notesState);
      configSession.advisor = createDefaultSurvivalAdvisorState(getSurvivalAdvisorState(configSession));
      configSession.updatedAt = Date.now();
    }
    refreshCovariateControls();
    renderSurvivalStatsAdvisor(state.lastSummary || {
      series: [],
      covariateColumns: state.covariateColumns || [],
      logRank: { available: false }
    }, null, configOwnerSession);
    logDebug('config applied', config);
  }

  function loadFromFile(file, options = {}){
    const ownerTabId = String(options?.tabId || options?.operation?.tabId || '').trim() || null;
    const operation = fileIO?.createGraphOpenOperation?.({
      context: 'survival',
      owner: { component: 'survival', tabId: ownerTabId },
      operation: options?.operation
    }) || options?.operation || null;
    const applyPayload = payload => {
      if(typeof fileIO?.routeGraphOpenPayload === 'function'){
        const routed = fileIO.routeGraphOpenPayload({
          context: 'survival',
          component: 'survival',
          operation,
          owner: { component: 'survival', tabId: ownerTabId },
          payload,
          apply: value => applySurvivalPayload(value, { source: 'file', tabId: ownerTabId }),
          reason: 'survival-graph-file-open'
        });
        return routed?.value === true;
      }
      const fallbackOwnerIsCurrent = !ownerTabId || String(getSurvivalProjectionTabId() || '') === ownerTabId;
      return fallbackOwnerIsCurrent && applySurvivalPayload(payload, { source: 'file', tabId: ownerTabId });
    };
    if(file instanceof Blob){
      const reader = new FileReader();
      reader.onload = event => {
        try {
          const parsed = JSON.parse(event.target.result);
          if(!applyPayload(parsed)){
            logDebug('payload rejected from file', { source: 'file', hasType: !!parsed?.type });
          }
        } catch (error){
          console.error('Failed to load survival graph', error);
        }
      };
      reader.readAsText(file);
      return;
    }
    if(typeof file === 'string'){
      try {
        const parsed = JSON.parse(file);
        if(!applyPayload(parsed)){
          logDebug('payload rejected from string', { source: 'string' });
        }
      } catch (error){
        console.error('Failed to load survival graph from string', error);
      }
      return;
    }
    if(file && typeof file === 'object'){
      applyPayload(file);
    }
  }
  survival.loadFromFile = loadFromFile;
  survival.loadFromPayload = function loadFromPayload(payload, options = {}){
    if(!applySurvivalPayload(payload, { source: 'payload', ...options })){
      logDebug('payload rejected from Main payload', { source: 'payload' });
    }
  };

  async function saveFile(){
    const operationSession = getActiveSurvivalSessionForState();
    const payload = getGraphPayload();
    if(!payload){
      return;
    }
    if(!fileIO || typeof fileIO.saveGraphFile !== 'function'){
      console.error('saveSurvivalFile missing fileIO.saveGraphFile');
      return;
    }
    const result = await fileIO.saveGraphFile({
      context: 'survival',
      owner: { component: 'survival', tabId: operationSession?.tabId || getSurvivalProjectionTabId() || null },
      fileHandle: state.fileHandle,
      payload,
      fileName: state.fileName,
      downloadFileName: state.fileName,
      setFileHandle: handle => {
        setSurvivalFileHandleForSession(handle, operationSession);
      },
      setFileName: name => {
        setSurvivalFileNameForSession(name, operationSession);
      }
    });
    logDebug('save result', { success: !!result, hasHandle: !!state.fileHandle });
  }

  async function saveFileAs(){
    const operationSession = getActiveSurvivalSessionForState();
    const payload = getGraphPayload();
    if(!payload){
      return;
    }
    if(!fileIO || typeof fileIO.saveGraphFileAs !== 'function'){
      console.error('saveAsSurvivalFile missing fileIO.saveGraphFileAs');
      return;
    }
    const result = await fileIO.saveGraphFileAs({
      context: 'survival',
      owner: { component: 'survival', tabId: operationSession?.tabId || getSurvivalProjectionTabId() || null },
      payload,
      fileName: state.fileName,
      downloadFileName: state.fileName,
      setFileHandle: handle => {
        setSurvivalFileHandleForSession(handle, operationSession);
      },
      setFileName: name => {
        setSurvivalFileNameForSession(name, operationSession);
      }
    });
    logDebug('saveAs result', { success: !!result, fileName: state.fileName });
  }

  async function openFile(){
    const operationSession = getActiveSurvivalSessionForState();
    const operationTabId = String(operationSession?.tabId || getSurvivalProjectionTabId() || '').trim() || null;
    if(!fileIO || typeof fileIO.openGraphFile !== 'function'){
      console.error('openSurvivalFile missing fileIO.openGraphFile');
      return;
    }
    const result = await fileIO.openGraphFile({
      context: 'survival',
      owner: { component: 'survival', tabId: operationTabId },
      setFileHandle: handle => {
        setSurvivalFileHandleForSession(handle, operationSession);
      },
      setFileName: name => {
        setSurvivalFileNameForSession(name, operationSession);
      },
      loadFromFile: (file, operation) => loadFromFile(file, { operation, tabId: operationTabId }),
      triggerInput: () => {
        if(refs.graphFileInput){
          refs.graphFileInput.value = '';
          refs.graphFileInput.click();
        }
      }
    });
    logDebug('open result', { success: !!result });
  }

  function initControls(){
    ensureSurvivalStatsConfigControls();
    const schedule = (event, reason = 'survival-control-change', options = {}) => {
      const session = getSurvivalSessionForEvent(event, { reason }, { create: true }) || getActiveSurvivalSessionForState();
      if(session?.tabId && !isSurvivalSessionActive(session)){
        session.state.drawPending = true;
        session.updatedAt = Date.now();
        return;
      }
      syncSurvivalRuntimeControlsFromDom(session);
      syncSurvivalStateToSession(session, { controls: state.controls });
      if(options.persistOwnerState === true){
        Shared.componentLifecycle?.persistOwnedUserState?.('survival', session, { reason });
      }
      scheduleSurvivalDrawForSession(session, { reason, tabId: session?.tabId || undefined, userInitiated: true });
    };
    [refs.showCI, refs.showCensor, refs.showRiskTable, refs.showPlotStats, refs.showGrid, refs.showHazardRatios, refs.fitCoxModel].forEach(control => {
      control?.addEventListener('change', event => {
        survivalDebug('Debug: survival control toggle', { id: control.id, checked: control.checked });
        logDebug('control toggled', { id: control.id, checked: control.checked });
        if(control === refs.showHazardRatios || control === refs.fitCoxModel){
          refreshCovariateControls();
        }
        const advisorSession = getSurvivalSessionForEvent(event, { reason: 'survival-control-advisor' }, { create: true })
          || getActiveSurvivalSessionForState();
        renderSurvivalStatsAdvisor(state.lastSummary || {
          series: [],
          covariateColumns: state.covariateColumns,
          supportsTimeDependent: detectTimeDependentSupport(
            state.hot?.getIncludedDataMatrix?.()
              || (Shared.hot?.getIncludedDataMatrix ? Shared.hot.getIncludedDataMatrix(state.hot) : [])
          )
        }, null, advisorSession);
        schedule(event, 'survival-control-change');
      });
    });
    refs.showFrame?.addEventListener('change', event => {
      survivalDebug('Debug: survival control toggle', { id: refs.showFrame.id, checked: refs.showFrame.checked });
      logDebug('control toggled', { id: refs.showFrame.id, checked: refs.showFrame.checked });
      const advisorSession = getSurvivalSessionForEvent(event, { reason: 'survival-frame-advisor' }, { create: true })
        || getActiveSurvivalSessionForState();
      renderSurvivalStatsAdvisor(state.lastSummary || {
        series: [],
        covariateColumns: state.covariateColumns,
        supportsTimeDependent: detectTimeDependentSupport(
          state.hot?.getIncludedDataMatrix?.()
            || (Shared.hot?.getIncludedDataMatrix ? Shared.hot.getIncludedDataMatrix(state.hot) : [])
        )
      }, null, advisorSession);
      schedule(event, 'survival-frame-toggle');
    });
    refs.showLegend?.addEventListener('change', event => {
      survivalDebug('Debug: survival control toggle', { id: refs.showLegend.id, checked: refs.showLegend.checked });
      logDebug('control toggled', { id: refs.showLegend.id, checked: refs.showLegend.checked });
      ensureSurvivalLegendControlPlacement();
      schedule(event, 'survival-legend-toggle', { persistOwnerState: true });
    });
    [refs.timeMax].forEach(input => {
      input?.addEventListener('input', event => {
        logDebug('control input', { id: input.id, value: input.value });
        schedule(event, 'survival-time-max-change');
      });
    });
    refs.fontSize?.addEventListener('input', event => {
      if(refs.fontSize?.dataset){
        refs.fontSize.dataset.fontBasePt = String(refs.fontSize.value);
        logDebug('font size base updated', { value: refs.fontSize.value });
      }
      chartStyle.renderFontSizeLabel?.({ element: refs.fontSizeVal, pt: Number(refs.fontSize.value), input: refs.fontSize, manual: true });
      logDebug('font size input', { value: refs.fontSize.value });
      schedule(event, 'survival-font-size-change');
    });
    if(refs.fontSize?.dataset){
      refs.fontSize.dataset.fontBasePt = String(refs.fontSize.value);
      logDebug('font size base initialized', { value: refs.fontSize.value });
    }
    chartStyle.renderFontSizeLabel?.({ element: refs.fontSizeVal, pt: Number(refs.fontSize?.value), input: refs.fontSize, manual: true });
  }

  function ensureSurvivalStatsConfigControls(){
    const host = getSurvivalNodeById('survivalStatsToggleRow');
    if(!host || getSurvivalNodeById('survivalPairwiseCorrection')){
      return;
    }
    const label = document.createElement('label');
    label.className = 'idx-inline-023';
    label.dataset.survivalStatsExtra = '1';
    label.textContent = 'Pairwise correction ';
    const select = document.createElement('select');
    select.id = 'survivalPairwiseCorrection';
    [
      ['holm-sidak', 'Holm-Sidak'],
      ['holm', 'Holm'],
      ['bh', 'BH FDR']
    ].forEach(([value, text]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      if(value === state.pairwiseCorrection){
        option.selected = true;
      }
      select.appendChild(option);
    });
    select.addEventListener('change', event => {
      runSurvivalControlOwner(event, 'survival-pairwise-correction', session => {
        state.pairwiseCorrection = String(select.value || 'holm-sidak');
        syncSurvivalStateToSession(session, { pairwiseCorrection: state.pairwiseCorrection });
        ensureSurvivalStatsInferenceControls()?.refresh?.();
        logDebug('pairwise correction changed', { value: state.pairwiseCorrection });
        scheduleSurvivalDrawForSession(session, {
          reason: 'survival-pairwise-correction',
          tabId: session?.tabId || undefined,
          userInitiated: true
        });
      });
    });
    label.appendChild(select);
    host.appendChild(label);
  }

  function initNotes(){
    const stack = resolveSurvivalRoot()?.querySelector('#survivalGraphPanel .survival-plot-stack')
      || resolveSurvivalRoot()?.querySelector('#survivalGraphPanel');
    if(!stack){
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        logDebug('notes mount skipped', { reason: 'missing-stack' });
      }
      return;
    }
    notesState.control = Shared.componentLifecycle?.ensureOwnedNotesControl?.({
      componentKey: 'survival',
      ownerTabId: getSurvivalProjectionTabId() || null,
      container: stack,
      notesState,
      control: notesState.control,
      id: 'survival-notes',
      scopeId: 'survival',
      fontKey: 'notes',
      canUseControl: canUseSurvivalNotesControl,
      unavailableMessage: 'survival notes helper unavailable',
      applyToControl: control => {
        control.setValue(notesState.text || '');
        control.setOpen(!!notesState.open);
      },
      onChange: value => {
        notesState.text = value == null ? '' : String(value);
        const session = getActiveSurvivalSessionForState();
        if(session){
          session.notes = createDefaultSurvivalNotesState(notesState);
          session.updatedAt = Date.now();
        }
      },
      onToggle: open => {
        notesState.open = !!open;
        const session = getActiveSurvivalSessionForState();
        if(session){
          session.notes = createDefaultSurvivalNotesState(notesState);
          session.updatedAt = Date.now();
        }
      }
    }) || notesState.control || null;
  }

  function bindSurvivalControlHandler(node, eventName, key, handler){
    if(!node || typeof node.addEventListener !== 'function'){
      return;
    }
    const registryKey = `${eventName}:${key}`;
    if(!node.__survivalControlHandlers){
      Object.defineProperty(node, '__survivalControlHandlers', {
        value: Object.create(null),
        configurable: true
      });
    }
    const previous = node.__survivalControlHandlers[registryKey];
    if(previous){
      node.removeEventListener(eventName, previous);
    }
    const wrapped = event => runSurvivalControlOwner(event, key || registryKey, session => handler(event, session));
    node.__survivalControlHandlers[registryKey] = wrapped;
    node.addEventListener(eventName, wrapped);
  }

  function initExampleAndImport(){
    refs.loadExampleBtn?.addEventListener('click', event => {
      runSurvivalControlOwner(event, 'survival-example-load', session => {
      const ownerHot = session?.managers?.hot || state.hot;
      const exampleRecord = Shared.exampleDatasets?.get?.('survival');
      const example = exampleRecord?.data;
      if(!ownerHot || !Array.isArray(example)){
        console.warn('survival example load skipped: biomedical example registry unavailable');
        return;
      }
      ownerHot.loadData(example, {
        source: 'example-load',
        recordUndo: true,
        undoLabel: 'table:survival:example-load'
      });
      Shared.exampleDatasets?.applyNotesState?.(notesState, exampleRecord);
      logDebug('biomedical example loaded', { rows: example?.length || 0, firstRow: example?.[0] || null });
      syncSurvivalStateToSession(session, { controls: state.controls, notes: notesState });
      captureSurvivalSessionStateFromActive(session, { reason: 'survival-example-load', captureStatsPanel: false });
      scheduleSurvivalDrawForSession(session, { reason: 'survival-example-load', tabId: session?.tabId || undefined });
      });
    });
    bindSurvivalControlHandler(refs.importBtn, 'click', 'import-table', () => {
      if(refs.fileInput){
        refs.fileInput.value = '';
        refs.fileInput.click();
      }
    });
    bindSurvivalControlHandler(refs.fileInput, 'change', 'import-file', (_event, ownerSession) => {
      if(!Shared.tableImport || typeof Shared.tableImport.openFile !== 'function'){
        console.warn('Survival import skipped: Shared.tableImport.openFile unavailable');
        return;
      }
      const applySurvivalPrismStyle = style => {
        if(!style || typeof style !== 'object'){
          return;
        }
        const title = style.title != null ? String(style.title).trim() : '';
        const xLabel = style.xLabel != null ? String(style.xLabel).trim() : '';
        const yLabel = style.yLabel != null ? String(style.yLabel).trim() : '';
        const fontFamily = style.fontFamily != null ? String(style.fontFamily).trim() : '';
        const fontColor = style.fontColor != null ? String(style.fontColor).trim() : '';
        const axisColor = style.axisColor != null ? String(style.axisColor).trim() : '';
        const fontSizeValue = Number(style.fontSize);
        if(title){
          state.titleText = title;
        }
        if(xLabel || yLabel){
          state.controls = normalizeSurvivalRuntimeControls({
            ...(state.controls || {}),
            ...(xLabel ? { xLabel } : {}),
            ...(yLabel ? { yLabel } : {})
          });
        }
        if(Number.isFinite(fontSizeValue) && fontSizeValue > 0 && refs.fontSize){
          refs.fontSize.value = String(fontSizeValue);
          if(refs.fontSize.dataset){
            refs.fontSize.dataset.fontBasePt = String(fontSizeValue);
          }
          chartStyle.renderFontSizeLabel?.({ element: refs.fontSizeVal, pt: fontSizeValue, input: refs.fontSize, manual: true });
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
            importFontStyles('survival', { __graph__: graphStyle }, { tabId: ownerSession?.tabId || getSurvivalProjectionTabId() || getActiveSurvivalSessionForState()?.tabId || null });
        }
        logDebug('prism style applied', { title, xLabel, yLabel, fontFamily, fontSize: fontSizeValue, fontColor, axisColor });
        syncSurvivalRuntimeControlsFromDom(ownerSession || getSurvivalProjectionSession({ reason: 'survival-projection-mutation' }));
        syncSurvivalStateToSession(ownerSession || getSurvivalProjectionSession({ reason: 'survival-projection-mutation' }), {
          titleText: state.titleText,
          controls: state.controls,
          axisSettings: state.axisSettings
        });
        scheduleSurvivalDrawForSession(ownerSession || getActiveSurvivalSessionForState(), { force: true, reason: 'import-prism-style', tabId: ownerSession?.tabId || undefined });
      };
      Shared.tableImport.openFile(refs.fileInput, {
        hot: ownerSession?.managers?.hot || state.hot,
        targetFirstRowIsHeader: false,
        minCols: SURVIVAL_DEFAULT_COLS,
        minRows: DEFAULT_ROWS,
        scheduleDraw: options => scheduleSurvivalDrawForSession(ownerSession || getActiveSurvivalSessionForState(), {
          ...(options || {}),
          reason: options?.reason || options?.source || 'survival-import-load',
          tabId: ownerSession?.tabId || undefined
        }),
        debugLabel: 'survival',
        onPrismStyle: applySurvivalPrismStyle,
        onProcessed: info => logDebug('import processed', info)
      });
    });
  }

  function initExportsAndFiles(){
    if(Shared.exporter && typeof Shared.exporter.mountSvgControls === 'function'){
      Shared.exporter.mountSvgControls({
        container: getSurvivalNodeById('survivalExportControls'),
        getSvg: () => getSurvivalNodeById('survivalSvg'),
        fileName: 'survival',
        contextLabel: 'survival-export',
        componentName: 'survival'
      });
      logDebug('export controls mounted', { hasExporter: true });
    } else {
      logDebug('export controls unavailable', { hasExporter: !!Shared.exporter });
    }
    refs.saveBtn?.addEventListener('click', () => { void saveFile(); });
    refs.saveAsBtn?.addEventListener('click', () => { void saveFileAs(); });
    refs.openBtn?.addEventListener('click', () => { void openFile(); });
    refs.graphFileInput?.addEventListener('change', event => {
      const file = event.target.files?.[0];
      if(file){
        const session = getSurvivalSessionForEvent(event, { reason: 'survival-graph-file-input' }, { create: false }) || getActiveSurvivalSessionForState();
        setSurvivalFileNameForSession(file.name, session);
        setSurvivalFileHandleForSession(null, session);
        loadFromFile(file, { tabId: session?.tabId || null });
      }
    });
  }

  function init(options = {}){
    const targetTabId = options?.tabId || getSurvivalProjectionTabId() || null;
    const targetRoot = options?.root || resolveSurvivalRoot(targetTabId || null) || refs.root || null;
    if(survival.ready && (!targetTabId || survival.__boundTabId === targetTabId) && (!targetRoot || refs.root === targetRoot)){
      logDebug('init skipped', { tabId: getSurvivalProjectionTabId() || null });
      return;
    }
    if(survival.ready){
      logDebug('init rebinding', { previousTabId: getSurvivalProjectionTabId() || null, targetTabId, reason: options?.reason || 'init' });
      survival.ready = false;
    }
    survival.__boundTabId = targetTabId || null;
    const session = bindSurvivalSessionForTab(targetTabId || null, {
      root: targetRoot || null,
      reason: options?.reason || 'survival-init-bind'
    }, { syncUi: false });
    refs.root = targetRoot || session?.refs?.root || resolveSurvivalRoot(targetTabId || null);
    if(session){
      session.root = refs.root || session.root || null;
      session.refs.root = refs.root || session.refs.root || null;
    }
    if(!ensureElements()){
      console.warn('Survival component init skipped: required elements missing');
      return;
    }
    const runSurvivalScheduledDraw = async (drawOptions = {}) => {
      const drawSession = ensureSurvivalSessionOwnershipShape(
        getSurvivalSessionForDrawOptions(drawOptions, { reason: drawOptions?.reason || 'survival-scheduled-draw' })
      );
      let result;
      try{
        result = await drawSurvival(drawOptions || {}, drawSession);
      }finally{
        survivalOverlayController?.resolve({ reason: 'complete', tabId: drawSession?.tabId || drawOptions?.tabId || null });
      }
      captureSurvivalSessionStateFromActive(drawSession, {
        reason: 'survival-scheduled-draw-capture',
        captureStatsPanels: true
      });
      return result;
    };
    const scheduleSurvivalBase = Shared.componentLifecycle?.createTabScopedFrameDebouncer
      ? Shared.componentLifecycle.createTabScopedFrameDebouncer(survival, 'survival', runSurvivalScheduledDraw, { reason: 'survival-draw-frame' })
      : runSurvivalScheduledDraw;
    const scheduleSurvivalInstrumented = drawOptions => {
      const nextOptions = drawOptions || {};
      if(nextOptions.force === true || nextOptions.importTransactionFinal === true){
        survivalOverlayController?.force(nextOptions.reason || 'render', {
          tabId: nextOptions.tabId || getSurvivalProjectionTabId() || null,
          message: 'Rendering survival graph...'
        });
      }
      return scheduleSurvivalBase(nextOptions);
    };
    state.scheduleDraw = Shared.workspaceTabs?.createTabScopedScheduler
      ? Shared.workspaceTabs.createTabScopedScheduler({
          componentKey: 'survival',
          debugLabel: 'survival',
          getTabId: () => getSurvivalProjectionTabId() || null,
          scheduleRaw: scheduleSurvivalInstrumented
        })
      : scheduleSurvivalInstrumented;
    logDebug('scheduleDraw configured', { scheduler: 'tab-scoped lifecycle frame' });
    state.layout = Shared.componentLayout?.createStandardPanels({
      componentName: 'survival',
        tabId: targetTabId || undefined,
        root: refs.root || undefined,
        reason: options?.reason || 'survival-init',
        selectors: {
          tablePanel: '#survivalTablePanel',
          graphPanel: '#survivalGraphPanel',
          panelResizer: '#survivalPanelResizer',
          hotWrapper: '#survivalHotWrapper',
          hotContainer: '#survivalHot',
          svgBox: () => refs.graphPanel?.querySelector('.svgbox'),
          resizeTarget: () => refs.graphPanel?.querySelector('.svgbox')
        },
        scheduleDraw: options => scheduleActiveSurvivalDraw(options && typeof options === 'object' ? options : {}),
        preserveGraphContent: false,
        panelSyncOptions: {
          disableAutoWidthClamp: true,
          lockGraphPanelWidth: false
        },
        onAfterSync: () => {
          ensureSurvivalLegendControlPlacement();
        },
        onMinSvgWidth: value => {
        state.minSvgWidth = Math.max(0, Number(value) || 0);
        logDebug('layout onMinSvgWidth', { value: state.minSvgWidth });
      },
      resizableBoxOptions: {
        cartesianLayoutTransactionEnabled: true,
        onResize: phase => {
          const resizePhase = typeof phase === 'string' ? phase : '';
          ensureSurvivalLegendControlPlacement();
          scheduleSurvivalViewRefresh('resize', {
            force: true,
            silentOverlay: true,
            resizePhase: resizePhase || null
          });
        }
      }
    });
    if(state.layout?.elements?.svgBox){
      refs.svgBox = state.layout.elements.svgBox;
      ensureSurvivalLegendControlPlacement();
    }
    syncSurvivalSessionRefsFromActive(session);
    syncSurvivalSessionManagersFromActive(session);
    Shared.componentLifecycle?.scheduleComponentFrame?.(survival, 'survival', {
      tabId: getSurvivalProjectionTabId() || null,
      reason: 'survival-legend-placement'
    }, () => ensureSurvivalLegendControlPlacement());
    initHot();
    initControls();
    initNotes();
    initExampleAndImport();
    state.layout?.setScheduleDraw?.(options => scheduleActiveSurvivalDraw(options && typeof options === 'object' ? options : {}));
    ensureSurvivalFontEventListener();
    state.layout?.syncPanels?.();
    initExportsAndFiles();
    renderSurvivalStatsAdvisor({
      series: [],
      covariateColumns: state.covariateColumns || [],
      logRank: { available: false }
    }, null, session || getActiveSurvivalSessionForState());
    ensureEmptyPayloadTemplate();
    survival.__domSentinel = getSurvivalNodeById('survivalHot');
    survival.ready = true;
    captureSurvivalSessionStateFromActive(session || getSurvivalProjectionSession({ reason: 'survival-projection-mutation' }), {
      reason: options?.reason || 'survival-init-complete',
      captureStatsPanels: false
    });
    scheduleActiveSurvivalDraw({ reason: options?.reason || 'survival-init-complete', tabId: getSurvivalProjectionTabId() || null });
    logDebug('component initialized', { ready: survival.ready });
    global.scheduleDrawSurvival = options => scheduleActiveSurvivalDraw(options && typeof options === 'object' ? options : {});
  }

  survival.init = init;
  survival.ensure = function ensure(options = {}){
    if(typeof Shared.workspaceTabs?.ensureActiveDomBindings === 'function'){
      const rebound = Shared.workspaceTabs.ensureActiveDomBindings({
        componentKey: 'survival',
        tabLike: options.tab || options.tabId || null,
        meta: options,
        sentinelSelector: '#survivalHot',
        getCurrentRoot: () => refs.root || null,
        getCurrentSentinel: () => survival.__domSentinel || null,
        rebind: (info) => {
          const nextTabId = info?.tab?.id || info?.tabId || options.tabId || null;
          refs.root = info?.root || resolveSurvivalRoot(info?.tab || null) || refs.root || null;
          if(options?.liveDomFastPath === true || options?.liveDomReuse === true || options?.passiveControls === true){
            survival.__boundTabId = nextTabId || getSurvivalProjectionTabId() || null;
            bindSurvivalSessionForTab(info?.tab || nextTabId || null, {
              ...(options || {}),
              root: refs.root || null,
              reason: options.reason || 'survival-passive-dom-rebind'
            }, { syncUi: false });
            ensureElements();
            syncSurvivalSessionRefsFromActive();
            syncSurvivalSessionManagersFromActive();
            survival.__domSentinel = info?.mountedSentinel || getSurvivalNodeById('survivalHot');
            survival.ready = true;
            survivalDebug('Debug: survival passive DOM rebind', { tabId: getSurvivalProjectionTabId() || null });
            return;
          }
          survival.ready = false;
          init({ root: refs.root || undefined, tabId: nextTabId || null, reason: 'workspace-dom-rebind' });
        }
      });
      if(rebound?.rebound){
        return;
      }
    }
    if(!survival.ready){
      init({ ...options, tabId: options.tabId || options.tab?.id || getSurvivalProjectionTabId() || undefined, reason: options.reason || 'ensure' });
    }
  };
  survival.activateTab = Shared.componentLifecycle?.bindTabActivation?.({
    component: survival,
    componentKey: 'survival',
    resolveRoot: tabLike => resolveSurvivalRoot(tabLike || null),
    setRoot: root => { refs.root = root || refs.root || null; },
    ensureBindings: (tabLike, meta) => {
      if(typeof Shared.workspaceTabs?.ensureActiveDomBindings !== 'function'){
        return false;
      }
      const targetTabId = (tabLike && typeof tabLike === 'object' ? tabLike.id : tabLike) || meta?.tabId || null;
      const rebound = Shared.workspaceTabs.ensureActiveDomBindings({
        componentKey: 'survival',
        tabLike: tabLike || null,
        meta,
        sentinelSelector: '#survivalHot',
        getCurrentRoot: () => refs.root || null,
        getCurrentSentinel: () => survival.__domSentinel || null,
        rebind: info => {
          refs.root = info?.root || resolveSurvivalRoot(tabLike || null) || refs.root || null;
          if(meta?.liveDomFastPath === true || meta?.liveDomReuse === true || meta?.passiveControls === true){
            survival.__boundTabId = targetTabId || getSurvivalProjectionTabId() || null;
            bindSurvivalSessionForTab(tabLike || targetTabId || null, {
              ...(meta || {}),
              root: refs.root || null,
              reason: meta?.reason || 'survival-passive-dom-rebind'
            }, { syncUi: false });
            ensureElements();
            syncSurvivalSessionRefsFromActive();
            syncSurvivalSessionManagersFromActive();
            survival.__domSentinel = info?.mountedSentinel || getSurvivalNodeById('survivalHot');
            survival.ready = true;
            survivalDebug('Debug: survival passive DOM rebind', { tabId: getSurvivalProjectionTabId() || null });
            return;
          }
          survival.ready = false;
          init({ root: refs.root || undefined, tabId: info?.tab?.id || targetTabId || null, reason: 'activate-tab-rebind' });
        }
      });
      return !!rebound?.rebound;
    },
    init: options => init(options),
    afterReady: (tabLike, meta = {}) => {
      const session = bindSurvivalSessionForTab(tabLike || meta?.tabId || null, {
        ...(meta || {}),
        root: resolveSurvivalRoot(tabLike || meta?.tabId || null),
        reason: meta?.reason || 'survival-activate-bind'
      }, { syncUi: true });
      const appliedRuntime = applyExistingSurvivalOwnedRuntimeRecord(tabLike || meta?.tabId || null, { ...(meta || {}), reason: meta?.reason || 'survival-activate-apply-owned-runtime' });
      if(!appliedRuntime && session){
        applySurvivalSessionStateToActive(session, { syncUi: true });
      }
      if(typeof state.ensureHotForActiveTab === 'function'){ state.ensureHotForActiveTab(); }
      syncSurvivalSessionRefsFromActive(session);
      syncSurvivalSessionManagersFromActive(session);
    },
    getSentinel: () => getSurvivalNodeById('survivalHot')
  }) || function activateTab(tab, meta = {}){
    const targetTabId = (tab && typeof tab === 'object' ? tab.id : tab) || meta?.tabId || null;
    survival.__boundTabId = targetTabId || getSurvivalProjectionTabId() || null;
    refs.root = resolveSurvivalRoot(tab || targetTabId || null);
    if(!survival.ready){ init({ root: refs.root || undefined, tabId: targetTabId || undefined, reason: meta?.reason || 'activate-tab' }); return; }
    const session = bindSurvivalSessionForTab(tab || targetTabId || null, {
      ...(meta || {}),
      root: refs.root || null,
      reason: meta?.reason || 'activate-tab-bind'
    }, { syncUi: true });
    applySurvivalSessionStateToActive(session, { syncUi: true });
    if(typeof state.ensureHotForActiveTab === 'function'){ state.ensureHotForActiveTab(); }
    syncSurvivalSessionRefsFromActive(session);
    syncSurvivalSessionManagersFromActive(session);
    survival.__domSentinel = getSurvivalNodeById('survivalHot');
  };

  function detachChildren(node){
    return Shared.componentLifecycle?.detachCacheableChildren?.(node) || null;
  }

  function restoreChildren(node, payload){
    if(!node || !payload || !payload.fragment){ return false; }
    while(node.firstChild){
      node.removeChild(node.firstChild);
    }
    node.appendChild(payload.fragment);
    return true;
  }

  function getSurvivalRenderCacheOwner(meta = {}, reason = 'survival-render-cache'){
    const source = meta && typeof meta === 'object' ? meta : {};
    const session = ensureSurvivalSessionOwnershipShape(source.session)
      || getSurvivalSession(source.tab || source.tabId || source.workspaceTabId || null, {
        ...source,
        reason
      }, { create: true })
      || getActiveSurvivalSessionForState();
    if(session && !isSurvivalSessionActive(session)){
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        survivalDebug('Debug: survival render cache skipped for inactive owner', {
          reason,
          ownerTabId: session.tabId || null,
          activeTabId: getSurvivalProjectionTabId() || null
        });
      }
      return null;
    }
    return session;
  }

  survival.captureRenderCache = function captureRenderCache(meta = {}){
    const owner = getSurvivalRenderCacheOwner(meta, 'survival-render-cache-capture');
    if(!owner){ return null; }
    const ownerRoot = resolveSurvivalRoot(owner.tabId || meta?.tab || meta?.tabId || null);
    const plot = ownerRoot?.querySelector?.('#survivalPlot') || null;
    const plotCache = detachChildren(plot);
    if((plotCache?.count || 0) <= 0){
      restoreChildren(plot, plotCache);
      survivalDebug('Debug: survival render cache capture skipped', {
        reason: 'empty-runtime',
        tabId: owner.tabId || null
      });
      return null;
    }
    const complete = Shared.componentLifecycle?.payloadHasRenderableContent?.(plotCache, {
      selectors: ['#survivalSvg', 'svg', 'canvas'],
      markupPattern: /(<svg\b|id=["']survivalSvg["']|<canvas\b)/i
    }) ?? true;
    if(!complete){
      restoreChildren(plot, plotCache);
      survivalDebug('Debug: survival render cache capture skipped', {
        reason: 'graph-not-renderable',
        tabId: owner.tabId || null
      });
      return null;
    }
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      survivalDebug('Debug: survival render cache captured', {
        plotNodes: plotCache.count,
        tabId: owner.tabId || null
      });
    }
    const cacheMeta = Shared.renderCacheSchema?.createMetadata?.({ component: 'survival', tabId: owner.tabId, complete: true })
      || { version: 2, component: 'survival', type: 'survival', tabId: owner.tabId || null, complete: true };
    // Statistics are canonical payload state. Caching their DOM duplicates that
    // authority and loses structured table metadata during archive serialization.
    return {
      plot: plotCache,
      __graphitixRenderCache: cacheMeta
    };
  };

  survival.canRestoreRenderCache = function canRestoreRenderCache(cache, meta = {}){
    return Shared.componentLifecycle?.validateRenderCache?.(cache, meta, {
      componentKey: 'survival',
      graph: { selectors: ['#survivalSvg', 'svg', 'canvas'], markupPattern: /(<svg\b|id=["']survivalSvg["']|<canvas\b)/i },
      requireGraph: true
    }) ?? !!cache;
  };

  survival.isIdleForSnapshot = function isIdleForSnapshot(meta = {}){
    const owner = getSurvivalSession(meta?.session || meta?.tab || meta?.tabId || null, {
      ...(meta || {}),
      reason: meta?.reason || 'survival-idle-snapshot'
    }, { create: false }) || getActiveSurvivalSessionForState();
    if(owner && !isSurvivalSessionActive(owner)){
      return !owner.state?.drawPending;
    }
    return !state.drawPending;
  };

  survival.awaitReadyForSnapshot = function awaitReadyForSnapshot(meta = {}){
    return Shared.componentLifecycle?.awaitReadyForSnapshot?.(survival, { ...meta, componentKey: 'survival' })
      || Promise.resolve({ ok: true, skipped: true, reason: 'missing-componentLifecycle' });
  };

  function bindSurvivalCurveFormatInteraction(curveEl){
    if(!curveEl || curveEl.__graphitixSurvivalStrokeFormatBound === true){ return false; }
    curveEl.style.cursor = 'pointer';
    curveEl.addEventListener('click', event => {
      try{ event.stopPropagation(); }catch(_err){}
      showSurvivalStrokeFormatControls(event.currentTarget);
    });
    curveEl.__graphitixSurvivalStrokeFormatBound = true;
    return true;
  }

  survival.rehydrateGraphInteractions = function rehydrateGraphInteractions(meta = {}){
    const owner = getSurvivalRenderCacheOwner(meta, 'survival-render-cache-interaction-rehydrate');
    const root = meta.root || resolveSurvivalRoot(owner?.tabId || meta.tab || meta.tabId || null);
    const svg = root?.querySelector?.('#survivalSvg') || meta.svgs?.find?.(node => node?.id === 'survivalSvg') || null;
    if(!owner || !svg){ return false; }
    const axesReady = axisControls?.rehydrateAxisElements?.(svg, (axis, _element, metadata) => buildSurvivalAxisControlConfig(axis, owner, {
      effectiveTickInterval: metadata?.effectiveTickInterval ?? null
    })) !== false;
    const textReady = rehydrateSurvivalInlineTextInteractions(svg, owner);
    svg.querySelectorAll?.('path[data-survival-series-color-target="stroke"][data-group]').forEach(bindSurvivalCurveFormatInteraction);
    bindSurvivalLegendInteractions(
      svg.querySelector?.('[data-legend-viewport-content="true"]') || null,
      svg,
      owner
    );
    return axesReady && textReady;
  };

  survival.restoreRenderCache = function restoreRenderCache(cache, meta = {}){
    if(!cache){ return false; }
    const owner = getSurvivalRenderCacheOwner(meta, 'survival-render-cache-restore');
    if(!owner){ return false; }
    const ownerRoot = resolveSurvivalRoot(owner.tabId || meta?.tab || meta?.tabId || null);
    const plot = ownerRoot?.querySelector?.('#survivalPlot') || null;
    const graphCachePayload = cache?.[cache?.__graphitixRenderCache?.graphicKey] || cache?.plot || cache?.preview || cache?.graph || cache?.svg || cache?.stage;
    const restoredPlot = restoreChildren(plot, graphCachePayload);
    if(restoredPlot){
      chartStyle.rehydrateLegendViewports?.(plot);
      const svg = plot?.querySelector?.('#survivalSvg') || null;
      bindSurvivalLegendInteractions(
        svg?.querySelector?.('[data-legend-viewport-content="true"]') || null,
        svg,
        owner
      );
    }
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      survivalDebug('Debug: survival render cache restored', {
        restored: restoredPlot,
        plot: restoredPlot,
        tabId: owner.tabId || null
      });
    }
    return restoredPlot;
  };
  survival.draw = async function drawSurvivalPublic(options = {}){
    const nextReason = options?.reason || 'survival-draw';
    if(Shared.componentLifecycle?.shouldSuppressDraw?.('survival', { ...(options || {}), tabId: options?.tabId || getSurvivalProjectionTabId() || null, reason: nextReason })){
      survivalDebug('Debug: survival draw suppressed by lifecycle', { reason: nextReason, tabId: options?.tabId || getSurvivalProjectionTabId() || null });
      Shared.componentLifecycle?.emitLifecycleEvent?.({ componentKey: 'survival', tabId: options?.tabId || getSurvivalProjectionTabId() || null, action: 'draw-suppressed', reason: nextReason, details: { source: 'survival.draw' } });
      return;
    }
    Shared.componentLifecycle?.emitLifecycleEvent?.({ componentKey: 'survival', tabId: options?.tabId || getSurvivalProjectionTabId() || null, action: 'draw-executed', reason: nextReason, details: { source: 'survival.draw' } });
    const drawSession = ensureSurvivalSessionOwnershipShape(getSurvivalSessionForDrawOptions(options, { reason: nextReason }));
    if(drawSession && !isSurvivalSessionActive(drawSession)){
      drawSession.state.drawPending = true;
      drawSession.updatedAt = Date.now();
      return;
    }
    const overlayForced = options?.force === true
      ? survivalOverlayController?.force(nextReason, { tabId: drawSession?.tabId || options?.tabId || null })
      : false;
    if(overlayForced){
      await Shared.jobs?.nextFrame?.();
      await Shared.jobs?.nextFrame?.();
    }
    let result;
    let status = 'complete';
    try{
      result = await drawSurvival({ ...(options || {}), tabId: drawSession?.tabId || options?.tabId || undefined, reason: nextReason }, drawSession);
      if(result === false){
        status = 'cancelled';
      }
    }catch(err){
      status = 'error';
      throw err;
    }finally{
      const drawTabId = drawSession?.tabId || options?.tabId || null;
      survivalOverlayController?.resolve({ reason: status, status, tabId: drawTabId });
      Shared.componentLifecycle?.emitLifecycleEvent?.({
        componentKey: 'survival',
        tabId: drawTabId,
        action: 'draw-settled',
        reason: nextReason,
        phase: status
      });
    }
    captureSurvivalSessionStateFromActive(drawSession, {
      reason: nextReason,
      captureStatsPanels: true
    });
    return result;
  };
  survival.cancelCurrentDraw = function cancelCurrentDraw(meta = {}){
    const tabId = meta?.tabId || getSurvivalProjectionTabId() || null;
    try{ survival.__asyncScope?.cancelAllForTab?.(tabId, meta?.reason || 'survival-draw-cancel'); }catch(_err){}
    survivalOverlayController?.resolve({ reason: meta?.reason || 'cancelled', tabId });
    return true;
  };
  survival.__getState = function(){
    survivalDebug('Debug: survival.__getState invoked');
    return state;
  };
  survival.__testHooks = Object.assign({}, survival.__testHooks, {
    getSession: tabLike => getSurvivalSession(tabLike || getSurvivalProjectionTabId() || null, { reason: 'survival-test-session' }, { create: false }),
    captureStatsPanelForOwner: tabLike => {
      const session = getSurvivalSession(tabLike || getSurvivalProjectionTabId() || null, { reason: 'survival-test-stats-capture' }, { create: false });
      return session ? cloneSimple(captureSurvivalStatsPanelModels(null, session)) : null;
    },
    restoreStatsPanelForOwner: tabLike => {
      const session = getSurvivalSession(tabLike || getSurvivalProjectionTabId() || null, { reason: 'survival-test-stats-restore' }, { create: false });
      const models = session?.results?.statsPanelModels || session?.state?.statsPanelModels || null;
      return session ? restoreSurvivalStatsPanelModels(models, session) : false;
    },
    collectSeries: () => collectSeries(),
    computeKaplanMeier: records => computeKaplanMeier(Array.isArray(records) ? records : []),
    computeLogRank: series => computeLogRank(Array.isArray(series) ? series : []),
    computeGehanBreslowWilcoxon: series => computeGehanBreslowWilcoxon(Array.isArray(series) ? series : []),
    computeLogRankTrend: series => computeLogRankTrend(Array.isArray(series) ? series : []),
    computePairwiseComparisons: (series, method) => computePairwiseSurvivalComparisons(Array.isArray(series) ? series : [], method || 'holm-sidak'),
    computeMedianSurvivalRatios: series => computeMedianSurvivalRatios(Array.isArray(series) ? series : []),
    fitCoxModel: (summary, options) => fitCoxModel(summary, options || {}),
    resolveCoxInferenceContract: coxModel => resolveCoxInferenceContract(coxModel),
    computeHazardRatios: (series, coxModel, options) => computeHazardRatios(
      Array.isArray(series) ? series : [],
      coxModel,
      options || {}
    ),
    prepareCoxData: summary => prepareCoxData(summary),
    evaluateCoxAt: (beta, prepared) => evaluateCoxAt(beta, prepared),
    atRiskCount: (group, time) => survivalAtRiskCount(group, time),
    cumulativeCensoredCount: (group, time) => survivalCumulativeCensoredCount(group, time),
    buildPlotStatsLines: summary => buildSurvivalPlotStatsLines(summary),
    resolveRiskTableLabelWidth: options => resolveSurvivalRiskTableLabelWidth(options),
    resolveDrawableFrame: plot => resolveSurvivalDrawableFrame(plot)
  });


  Shared.componentLifecycle?.installInternalStateBridge?.(survival, {
    componentKey: 'survival',
    targets: [
      { key: 'state', get: () => state, excludeKeys: ['hot', 'root', 'svg', 'svgBox', 'lastParsedRows', 'lastDesignMatrix', 'statsPanelModels'] },
      { key: 'survivalAdvisorState', get: () => survivalAdvisorState },
      { key: 'notesState', get: () => notesState, excludeKeys: ['control'] }
    ]
  });
})(window);
