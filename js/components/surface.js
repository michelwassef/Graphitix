(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};
  const surface = Components.surface = Components.surface || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  const plot3d = Shared.plot3d = Shared.plot3d || {};
  const hotNS = Shared.hot = Shared.hot || {};
  const componentLayout = Shared.componentLayout = Shared.componentLayout || {};
  const fileIO = Shared.fileIO = Shared.fileIO || {};
  const tableImport = Shared.tableImport = Shared.tableImport || {};
  const exporter = Shared.exporter = Shared.exporter || {};
  const fontControls = Shared.fontControls = Shared.fontControls || {};
  const gridControls = Shared.gridControls = Shared.gridControls || {};
  if((typeof gridControls.show !== 'function' || typeof gridControls.registerGraphElement !== 'function') && typeof require === 'function'){
    try{
      require('../shared/gridControls.js');
    }catch(err){
      console.debug('Debug: surface component gridControls helper require failed', { message: err?.message || String(err) });
    }
  }
  const notesHelper = Shared.notes = Shared.notes || {};
  if(typeof notesHelper.mountFoldable !== 'function' && typeof require === 'function'){
    try{
      require('../shared/notes.js');
    }catch(err){
      console.debug('Debug: surface component notes helper require failed', { message: err?.message || String(err) });
    }
  }
  const dataTransformsApi = Shared.dataTransforms = Shared.dataTransforms || {};
  if(typeof dataTransformsApi.applyTransform !== 'function' && typeof require === 'function'){
    try{
      require('../shared/dataTransforms.js');
    }catch(err){
      console.debug('Debug: surface component dataTransforms helper require failed', { message: err?.message || String(err) });
    }
  }
  const dataViewsApi = Shared.dataViews = Shared.dataViews || {};
  if(typeof dataViewsApi.createManager !== 'function' && typeof require === 'function'){
    try{
      require('../shared/dataViews.js');
    }catch(err){
      console.debug('Debug: surface component dataViews helper require failed', { message: err?.message || String(err) });
    }
  }
  const notesState = { text: '', open: false, control: null };
  const exportFontStyles = scope => (fontControls && typeof fontControls.exportScopeStyles === 'function')
    ? fontControls.exportScopeStyles(scope)
    : null;
  const importFontStyles = (scope, styles) => {
    if(fontControls && typeof fontControls.importScopeStyles === 'function'){
      fontControls.importScopeStyles(scope, styles, { prune: true });
    }
  };

  surface.__installed = true;
  surface.ready = false;
  // Unique instance identifier for DOM ids and per-instance caching
  const SURFACE_INSTANCE_ID = `${Date.now().toString(36)}-${Math.floor(Math.random() * 0xFFFFF).toString(36)}`;
  surface.__instanceId = SURFACE_INSTANCE_ID;

  const NS = 'http://www.w3.org/2000/svg';
  const DEFAULT_ROWS = 80;
  const DEFAULT_COLS = 3;
  const DEFAULT_GRID_COLOR = '#dddddd';
  let emptyPayloadTemplate = null;

  function cloneSimple(value){
    if(!value) return null;
    try{
      return JSON.parse(JSON.stringify(value));
    }catch(err){
      console.error('surface cloneSimple error', err);
      return null;
    }
  }

  function ensureEmptyPayloadTemplate(){
    if(emptyPayloadTemplate || typeof getSurfacePayload !== 'function'){
      return;
    }
    const snapshot = getSurfacePayload();
    if(snapshot){
      emptyPayloadTemplate = cloneSimple(snapshot);
    }
  }
  const DEFAULT_FILE_NAME = 'surface.graph';
  const DEFAULT_ROTATION = { x: 0.24, y: 1.96 };

  const COLOR_RAMPS = Object.freeze({
    viridis: { label: 'Viridis', stops: ['#440154', '#3b528b', '#21908d', '#5dc863', '#fde725'] },
    plasma: { label: 'Plasma', stops: ['#0d0887', '#6a00a8', '#b12a90', '#e16462', '#fca636', '#f0f921'] },
    magma: { label: 'Magma', stops: ['#0c081b', '#2a115b', '#5c1f78', '#933d6c', '#c75b54', '#f48834', '#fbf671'] },
    turbo: { label: 'Turbo', stops: ['#30123b', '#4145ab', '#2f9df4', '#43ecb0', '#fde54c', '#f45f2a', '#821529'] },
    bluered: { label: 'Blue-Red', stops: ['#1f77b4', '#6baed6', '#c7e9ff', '#fee0d2', '#fcbba1', '#ef3b2c'] }
  });

  const INTERPOLATION_OPTIONS = Object.freeze({
    grid: { label: 'Grid (rectangular)' },
    scatter: { label: 'Points only' }
  });

  const DEFAULT_AXIS_LABELS = Object.freeze({ x: 'X', y: 'Y', z: 'Z' });
  const SURFACE_AUTO_DRAW_ROW_THRESHOLD = 5000;
  const SURFACE_AUTO_DRAW_COL_THRESHOLD = 5000;
  const SURFACE_AUTO_DRAW_CELL_THRESHOLD = 50000;
  const SURFACE_DATA_VIEW_MAX = 12;
  const SURFACE_TRANSFORM_SCOPE_DEFAULT = Object.freeze({
    headerRows: 1,
    startCol: 0
  });
  // Parse safety caps to avoid blocking the main thread on extremely large tables
  const SURFACE_MAX_PARSE_ROWS = 20000;
  const SURFACE_MAX_PARSE_POINTS = 100000;

  const state = {
    hot: null,
    layout: null,
    svg: null,
    svgBox: null,
    statsEl: null,
    messageEl: null,
    exportContainer: null,
    renderRow: null,
    renderButton: null,
    autoDrawNotice: null,
    autoDrawEnabled: true,
    autoDrawReason: null,
    autoDrawLockedByThreshold: false,
    drawPending: false,
    lastDataShape: { rows: 0, cols: 0 },
    lastAutoDrawEvaluation: null,
    axisSelects: { x: null, y: null, z: null },
    controls: {},
    axisMap: { x: 0, y: 1, z: 2 },
    legendPosition: null, // Legacy field, kept for backward compatibility
    labelPositions: { title: null, legend: null },
    _listeners: [],
    _hotHooks: [],
    _facePool: [],
    _pointPool: [],
    _facePoolUsed: 0,
    _pointPoolUsed: 0,
    settings: {
      colorRamp: 'viridis',
      interpolation: 'grid',
      fontSize: 13,
      axisStroke: 1.2,
      axisColor: '#3b3b3b',
      textColor: chartStyle.TEXT_COLOR || '#1f2a3d',
      backgroundColor: '#ffffff',
      colorScheme: 'scientific',
      showGrid: false,
      showFrame: true,
      showPoints: false,
      showLegend: true
    },
    gridStyle: null,
    labels: { title: 'Surface Plot', x: DEFAULT_AXIS_LABELS.x, y: DEFAULT_AXIS_LABELS.y, z: DEFAULT_AXIS_LABELS.z },
    rotation: typeof plot3d.createRotationState === 'function'
      ? plot3d.createRotationState(DEFAULT_ROTATION)
      : { x: DEFAULT_ROTATION.x, y: DEFAULT_ROTATION.y },
    scheduleDraw: () => {},
    fileName: DEFAULT_FILE_NAME,
    fileHandle: null
  };
  let surfaceDataViewsManager = null;
  let surfaceDataToolbarBound = false;
  let surfaceDataToolbarLastActivation = 0;

  function getAxisStrokeWidthBase(){
    const numeric = Number(state.settings?.axisStroke);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 1.2;
  }

  function normalizeSurfaceThemeColor(value, fallback){
    return (typeof value === 'string' && value.trim()) ? value.trim() : fallback;
  }

  function isSurfaceDarkTheme(){
    return String(state.settings?.colorScheme || '').toLowerCase() === 'dark';
  }

  function createDefaultGridStyle(fallbackThickness){
    const thickness = Number.isFinite(Number(fallbackThickness)) && Number(fallbackThickness) >= 0
      ? Number(fallbackThickness)
      : 1.2;
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

  function activateSurfaceDataToolbar(reason){
    const now = Date.now();
    if(now - surfaceDataToolbarLastActivation < 80){
      return false;
    }
    surfaceDataToolbarLastActivation = now;
    const activated = !!Shared.workspaceToolbar?.activateSection?.('surface', 'Data');
    if(activated){
      debugLog('Debug: surface data toolbar activated', { reason: reason || 'unknown' });
    }
    return activated;
  }

  function ensureSurfaceDataViewsForHot(hotInstance, options = {}){
    if(!hotInstance || typeof hotInstance.getData !== 'function'){
      return null;
    }
    if(typeof Shared.dataViews?.createManager !== 'function'){
      return null;
    }
    if(!hotInstance.__surfaceDataViewsManager){
      hotInstance.__surfaceDataViewsManager = Shared.dataViews.createManager({
        componentKey: 'surface',
        maxViews: SURFACE_DATA_VIEW_MAX,
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
          updateAxisOptions();
          markSurfaceOverlayPending('data-view-switch');
          state.scheduleDraw?.({ reason: 'data-view-switch' });
        },
        onInteraction(){
          activateSurfaceDataToolbar('data-tab-interaction');
        }
      });
      debugLog('Debug: surface data views manager created', {
        tabId: hotInstance.__surfaceTabId || null
      });
    }
    const manager = hotInstance.__surfaceDataViewsManager;
    const hostWrapper = options.wrapper || global.document?.getElementById?.('surfaceHotWrapper') || null;
    const hostContainer = options.container || hotInstance.__surfaceHostContainer || global.document?.getElementById?.('surfaceHot') || null;
    if(hostWrapper && hostContainer){
      manager.mount({
        wrapper: hostWrapper,
        tableContainer: hostContainer
      });
      manager.refresh?.();
    }
    surfaceDataViewsManager = manager;
    return manager;
  }

  function syncSurfaceActiveDataViewFromHot(hotInstance, reason){
    const hot = hotInstance || state.hot;
    if(!hot || typeof hot.getData !== 'function'){
      return;
    }
    const manager = hot.__surfaceDataViewsManager || surfaceDataViewsManager;
    if(!manager){
      return;
    }
    manager.updateActiveData(hot.getData() || []);
    manager.updateActiveExclusions(hot?.exportExclusions?.() || null);
    if(reason === 'afterLoadData'){
      manager.refresh?.();
    }
  }

  function applySurfaceTransformToNewView(transformSpec, options = {}){
    const hot = state.ensureHotForActiveTab?.() || state.hot;
    if(!hot){
      return false;
    }
    const manager = ensureSurfaceDataViewsForHot(hot, {
      wrapper: global.document?.getElementById?.('surfaceHotWrapper') || null,
      container: hot.__surfaceHostContainer || global.document?.getElementById?.('surfaceHot') || null
    });
    if(!manager || typeof manager.applyTransform !== 'function'){
      console.warn('surface data transform skipped: Shared.dataViews unavailable');
      return false;
    }
    syncSurfaceActiveDataViewFromHot(hot, 'transform-before');
    const result = manager.applyTransform(transformSpec, {
      title: options.title,
      reason: options.reason || 'toolbar-transform',
      transformOptions: Object.assign({}, SURFACE_TRANSFORM_SCOPE_DEFAULT, options.transformOptions || {})
    });
    if(!result?.ok){
      const message = result?.error || 'Transformation failed.';
      if(typeof global.alert === 'function'){
        global.alert(`Unable to transform data: ${message}`);
      }
      debugLog('Debug: surface transform failed', {
        message,
        transform: transformSpec?.type || null
      });
      return false;
    }
    activateSurfaceDataToolbar('transform-applied');
    debugLog('Debug: surface transform created view', {
      title: result?.view?.title || null,
      summary: result?.result?.summary || null
    });
    return true;
  }

  const SURFACE_TRANSFORM_OPTION_MAP = Object.freeze({
    cpm: { spec: { type: 'cpm', orientation: 'column' }, title: 'CPM' },
    log2p1: { spec: { type: 'log', base: 2, pseudoCount: 1 }, title: 'log2(x+1)' },
    centerRowsMean: { spec: { type: 'centerRows', method: 'mean' }, title: 'Center rows (mean)' },
    centerRowsMedian: { spec: { type: 'centerRows', method: 'median' }, title: 'Center rows (median)' },
    centerColsMean: { spec: { type: 'centerColumns', method: 'mean' }, title: 'Center cols (mean)' },
    centerColsMedian: { spec: { type: 'centerColumns', method: 'median' }, title: 'Center cols (median)' },
    normalizeRows: { spec: { type: 'normalizeRows' }, title: 'Normalize rows (z)' },
    normalizeCols: { spec: { type: 'normalizeColumns' }, title: 'Normalize cols (z)' }
  });

  function promptSurfaceCustomExpression(){
    const toolbarApi = Shared.workspaceToolbar || null;
    const expression = String(toolbarApi?.getCustomTransformExpression?.('surface') || '').trim();
    if(expression){
      return expression;
    }
    toolbarApi?.openCustomTransformEditor?.('surface');
    if(typeof global.alert === 'function'){
      global.alert('Enter a custom transformation formula using x, then click "Apply custom".');
    }
    return null;
  }

  function resolveSurfaceToolbarTransformOption(optionKey, customExpression){
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
    const preset = SURFACE_TRANSFORM_OPTION_MAP[key];
    if(!preset){
      return null;
    }
    return {
      spec: Object.assign({}, preset.spec),
      title: preset.title
    };
  }

  function applySurfaceTransformPipelineToNewView(transformSpecs, options = {}){
    const hot = state.ensureHotForActiveTab?.() || state.hot;
    if(!hot){
      return false;
    }
    const manager = ensureSurfaceDataViewsForHot(hot, {
      wrapper: global.document?.getElementById?.('surfaceHotWrapper') || null,
      container: hot.__surfaceHostContainer || global.document?.getElementById?.('surfaceHot') || null
    });
    if(!manager || typeof manager.applyPipeline !== 'function'){
      console.warn('surface data transform pipeline skipped: Shared.dataViews unavailable');
      return false;
    }
    const specs = Array.isArray(transformSpecs) ? transformSpecs.filter(Boolean) : [];
    if(!specs.length){
      return false;
    }
    syncSurfaceActiveDataViewFromHot(hot, 'transform-before');
    const result = manager.applyPipeline(specs, {
      title: options.title,
      reason: options.reason || 'toolbar-transform-pipeline',
      transformOptions: Object.assign({}, SURFACE_TRANSFORM_SCOPE_DEFAULT, options.transformOptions || {})
    });
    if(!result?.ok){
      const message = result?.error || 'Transformation failed.';
      if(typeof global.alert === 'function'){
        global.alert(`Unable to transform data: ${message}`);
      }
      debugLog('Debug: surface transform pipeline failed', {
        message,
        stepCount: specs.length
      });
      return false;
    }
    activateSurfaceDataToolbar('transform-pipeline-applied');
    debugLog('Debug: surface transform pipeline created view', {
      title: result?.view?.title || null,
      stepCount: Array.isArray(result?.result?.steps) ? result.result.steps.length : specs.length
    });
    return true;
  }

  function applySurfaceSelectedTransforms(){
    const toolbarApi = Shared.workspaceToolbar || null;
    const selected = toolbarApi?.getSelectedTransforms?.('surface') || [];
    if(!Array.isArray(selected) || !selected.length){
      return false;
    }
    const resolved = [];
    for(let i = 0; i < selected.length; i += 1){
      const optionKey = selected[i];
      if(optionKey === 'custom'){
        const customExpression = promptSurfaceCustomExpression();
        if(!customExpression){
          return false;
        }
        const customTransform = resolveSurfaceToolbarTransformOption('custom', customExpression);
        if(customTransform){
          resolved.push(customTransform);
        }
        continue;
      }
      const next = resolveSurfaceToolbarTransformOption(optionKey);
      if(next){
        resolved.push(next);
      }
    }
    if(!resolved.length){
      return false;
    }
    const ok = resolved.length === 1
      ? applySurfaceTransformToNewView(resolved[0].spec, {
        title: resolved[0].title,
        reason: 'toolbar-transform-multi-single'
      })
      : applySurfaceTransformPipelineToNewView(
        resolved.map(item => item.spec),
        { reason: 'toolbar-transform-multi' }
      );
    if(ok){
      toolbarApi?.clearSelectedTransforms?.('surface');
    }
    return ok;
  }

  function bindSurfaceDataToolbar(){
    if(surfaceDataToolbarBound || !global.document){
      return;
    }
    global.document.addEventListener('click', event => {
      const button = event.target?.closest?.(
        '#surfaceTransformApplySelected, #surfaceTransformCustomApply, #surfaceTransformCpm, #surfaceTransformLog2p1, #surfaceTransformCenterRowsMean, #surfaceTransformCenterRowsMedian, #surfaceTransformCenterColsMean, #surfaceTransformCenterColsMedian, #surfaceTransformNormalizeRows, #surfaceTransformNormalizeCols, #surfaceTransformCustom'
      );
      if(!button){
        return;
      }
      const transformSection = button.closest?.('.workspace-toolbar__section[data-transform-section="1"]');
      if(button.id === 'surfaceTransformApplySelected'){
        applySurfaceSelectedTransforms();
        return;
      }
      if(button.id === 'surfaceTransformCustomApply'){
        const customExpression = promptSurfaceCustomExpression();
        if(!customExpression){
          return;
        }
        const customTransform = resolveSurfaceToolbarTransformOption('custom', customExpression);
        if(!customTransform){
          return;
        }
        if(transformSection?.dataset?.transformMultiMode === '1'){
          const selected = Shared.workspaceToolbar?.getSelectedTransforms?.('surface') || [];
          if(Array.isArray(selected) && selected.includes('custom')){
            applySurfaceSelectedTransforms();
          }else{
            applySurfaceTransformToNewView(customTransform.spec, { title: customTransform.title });
          }
          return;
        }
        applySurfaceTransformToNewView(customTransform.spec, { title: customTransform.title });
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
        const customExpression = promptSurfaceCustomExpression();
        if(!customExpression){
          return;
        }
        const customTransform = resolveSurfaceToolbarTransformOption(optionKey, customExpression);
        if(customTransform){
          applySurfaceTransformToNewView(customTransform.spec, { title: customTransform.title });
        }
        return;
      }
      const resolved = resolveSurfaceToolbarTransformOption(optionKey);
      if(resolved){
        applySurfaceTransformToNewView(resolved.spec, { title: resolved.title });
      }
    }, true);
    const wrapper = global.document?.getElementById?.('surfaceHotWrapper');
    if(wrapper && !wrapper.__surfaceDataToolbarFocusBound){
      wrapper.addEventListener('mousedown', () => {
        activateSurfaceDataToolbar('table-mousedown');
      }, true);
      wrapper.__surfaceDataToolbarFocusBound = true;
    }
    surfaceDataToolbarBound = true;
  }

  function registerSurfaceGridControlTarget(target, options){
    if(!target || !gridControls || typeof gridControls.registerGraphElement !== 'function'){
      return;
    }
    const opts = options && typeof options === 'object' ? options : {};
    const fallbackThickness = Number.isFinite(Number(opts.fallbackThickness)) ? Number(opts.fallbackThickness) : getAxisStrokeWidthBase();
    gridControls.registerGraphElement(target, {
      scopeId: 'surface',
      getVisible: () => !!state.settings.showGrid,
      onVisibleChange: value => {
        state.settings.showGrid = !!value;
        if(state.controls.showGrid){
          state.controls.showGrid.checked = !!value;
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

  function attachListener(node, type, handler, options){
    if(!node || typeof node.addEventListener !== 'function'){ return; }
    node.addEventListener(type, handler, options);
    try{ state._listeners.push({ node, type, handler, options }); }catch(e){ /* ignore */ }
  }
  const surfaceOverlayController = Shared.loadingOverlay?.createPendingController?.({
    component: 'surface',
    message: 'Rendering surface plot...',
    getHost: () => (
      state.svgBox
      || state.layout?.elements?.svgBox
      || global.document?.querySelector?.('#surfaceGraphPanel .svgbox')
      || global.document?.getElementById?.('surfaceGraphPanel')
    )
  });

  function markSurfaceOverlayPending(reason){
    surfaceOverlayController?.markPending(reason);
    debugLog('Debug: surface overlay pending flagged', { reason: reason || 'data-change' });
    try{
      if(_surfaceOverlayTimeout){ clearTimeout(_surfaceOverlayTimeout); }
      _surfaceOverlayTimeout = (global.setTimeout || setTimeout)(() => {
        try{ resolveSurfaceOverlay('timeout'); }catch(e){}
        debugLog('Debug: surface overlay auto-resolved due to timeout', { reason });
      }, SURFACE_OVERLAY_TIMEOUT_MS);
    }catch(e){ /* ignore */ }
  }

  function queueSurfaceOverlay(reason, options = {}){
    return surfaceOverlayController?.queue(reason, options) || false;
  }

  function resolveSurfaceOverlay(reason){
    surfaceOverlayController?.resolve(reason);
    try{ if(_surfaceOverlayTimeout){ clearTimeout(_surfaceOverlayTimeout); _surfaceOverlayTimeout = null; } }catch(e){}
  }

  function forceSurfaceOverlay(reason, options = {}){
    return surfaceOverlayController?.force(reason, options) || false;
  }
  let surfaceAutoDrawManager = null;
  let surfaceNoticeBoundWidth = null;
  const syncSurfaceAutoDrawNoticeWidth = (reason) => {
    const svgBox = state.svgBox || state.layout?.elements?.svgBox || global.document.querySelector('#surfaceGraphPanel .svgbox');
    const renderRow = state.renderRow || global.document.getElementById('surfaceRenderRow');
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
    if(state.autoDrawNotice && state.autoDrawNotice.style.maxWidth !== widthPx){
      state.autoDrawNotice.style.maxWidth = widthPx;
    }
    if(surfaceNoticeBoundWidth !== width){
      surfaceNoticeBoundWidth = width;
      debugLog('Debug: surface auto draw notice width synced', { width, reason: reason || null });
    }
  };
  const scheduleSurfaceNoticeWidth = (() => {
    if(typeof Shared.debounceFrame === 'function'){
      let lastReason = 'frame';
      const debounced = Shared.debounceFrame(() => syncSurfaceAutoDrawNoticeWidth(lastReason));
      return reason => {
        lastReason = reason || 'frame';
        debounced();
      };
    }
    return reason => syncSurfaceAutoDrawNoticeWidth(reason || 'immediate');
  })();
  let scheduleDrawSurfaceRaw = () => {};
  const surfaceUndoManager = Shared.undoManager || null;
  function recordSurfaceChange(label, previous, next, apply){
    if(!surfaceUndoManager || typeof surfaceUndoManager.recordStateChange !== 'function'){
      return;
    }
    if(typeof apply !== 'function'){
      return;
    }
    surfaceUndoManager.recordStateChange({
      label,
      scope: 'surfaceGraphPanel',
      from: previous,
      to: next,
      apply(value){
        apply(value);
        return true;
      }
    });
  }

  const makeEditableHelper = (node, onChange, options) => {
    const fn = Shared.makeEditable || global.makeEditable;
    if(typeof fn === 'function'){
      return fn(node, onChange, options);
    }
    console.warn('surface component makeEditable fallback missing');
    return undefined;
  };

  const markFontEditable = (node, role, key) => {
    if(!node){ return; }
    const payload = { role: role || null, key: key || role || null, text: node?.textContent || null };
    if(fontControls && typeof fontControls.markText === 'function'){
      fontControls.markText(node, { scopeId: 'surface', role, key });
    }
    if(node.dataset){
      node.dataset.fontEditable = '1';
      node.dataset.fontScope = 'surface';
      if(role){ node.dataset.fontRole = role; }
      if(key || role){ node.dataset.fontKey = key || role; }
    }
    debugLog('Debug: surface markFontEditable', payload);
  };

  function debugLog(message, payload){
    if(typeof Shared.isDebugEnabled === 'function' && !Shared.isDebugEnabled()){
      return;
    }
    if(typeof console !== 'undefined' && typeof console.debug === 'function'){
      console.debug(message, payload || {});
    }
  }

  function hexToRgb(hex){
    if(typeof hex !== 'string'){ return { r: 0, g: 0, b: 0 }; }
    const normalized = hex.replace('#', '');
    if(normalized.length === 3){
      const r = parseInt(normalized[0] + normalized[0], 16);
      const g = parseInt(normalized[1] + normalized[1], 16);
      const b = parseInt(normalized[2] + normalized[2], 16);
      return { r, g, b };
    }
    const parsed = parseInt(normalized, 16);
    if(Number.isNaN(parsed)){
      return { r: 0, g: 0, b: 0 };
    }
    return {
      r: (parsed >> 16) & 255,
      g: (parsed >> 8) & 255,
      b: parsed & 255
    };
  }

  function mixColor(a, b, t){
    const ratio = Math.min(1, Math.max(0, t));
    return {
      r: Math.round(a.r + (b.r - a.r) * ratio),
      g: Math.round(a.g + (b.g - a.g) * ratio),
      b: Math.round(a.b + (b.b - a.b) * ratio)
    };
  }

  function colorScaleFactory(min, max, rampKey){
    // Memoize factories per range + ramp to avoid recomputing stops for many points
    const cacheKey = `${min}|${max}|${String(rampKey)}`;
    if(!colorScaleFactory._cache){ colorScaleFactory._cache = new Map(); }
    if(colorScaleFactory._cache.has(cacheKey)){
      return colorScaleFactory._cache.get(cacheKey);
    }
    const ramp = COLOR_RAMPS[rampKey] || COLOR_RAMPS.viridis;
    const stops = Array.isArray(ramp.stops) && ramp.stops.length ? ramp.stops : COLOR_RAMPS.viridis.stops;
    const rgbStops = stops.map(hex => hexToRgb(hex));
    const span = max - min;
    const fn = (value) => {
      if(!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || span === 0){
        const mid = rgbStops[Math.floor(rgbStops.length / 2)] || { r: 128, g: 128, b: 128 };
        return `rgb(${mid.r},${mid.g},${mid.b})`;
      }
      const normalized = (value - min) / span;
      const scaled = Math.min(rgbStops.length - 1, Math.max(0, normalized * (rgbStops.length - 1)));
      const idx = Math.floor(scaled);
      const frac = scaled - idx;
      const a = rgbStops[idx] || rgbStops[0];
      const b = rgbStops[Math.min(idx + 1, rgbStops.length - 1)] || rgbStops[rgbStops.length - 1];
      const mixed = mixColor(a, b, frac);
      return `rgb(${mixed.r},${mixed.g},${mixed.b})`;
    };
    colorScaleFactory._cache.set(cacheKey, fn);
    return fn;
  }

  function niceNum(range, round){
    if(range === 0){ return 0; }
    const exponent = Math.floor(Math.log10(Math.abs(range)));
    const fraction = range / Math.pow(10, exponent);
    let niceFraction;
    if(round){
      if(fraction < 1.5){ niceFraction = 1; }
      else if(fraction < 3){ niceFraction = 2; }
      else if(fraction < 7){ niceFraction = 5; }
      else { niceFraction = 10; }
    } else {
      if(fraction <= 1){ niceFraction = 1; }
      else if(fraction <= 2){ niceFraction = 2; }
      else if(fraction <= 5){ niceFraction = 5; }
      else { niceFraction = 10; }
    }
    return niceFraction * Math.pow(10, exponent);
  }

  function niceScale(min, max, maxTicks){
    if(!Number.isFinite(min) || !Number.isFinite(max) || min === max){
      const base = Number.isFinite(min) ? Math.abs(min) : 1;
      const pad = Math.max(base * 0.5, 1);
      return {
        min: min - pad,
        max: max + pad,
        step: pad,
        ticks: [min - pad, min, max + pad]
      };
    }
    const range = niceNum(max - min, false);
    const step = niceNum(range / Math.max(maxTicks - 1, 1), true);
    const graphMin = Math.floor(min / step) * step;
    const graphMax = Math.ceil(max / step) * step;
    const ticks = [];
    for(let tick = graphMin; tick <= graphMax + step * 0.5; tick += step){
      ticks.push(Number(tick.toFixed(6)));
    }
    return { min: graphMin, max: graphMax, step, ticks };
  }

  function formatNumber(value){
    if(!Number.isFinite(value)){
      return 'n/a';
    }
    return chartStyle.formatScientific(value, { maxDecimals: 2 });
  }

  function cacheDom(){
    const doc = global.document;
    if(!doc){ return; }
    state.svg = doc.getElementById('surfaceSvg') || state.svg;
    state.svgBox = state.layout?.elements?.svgBox || doc.querySelector('#surfaceGraphPanel .svgbox') || state.svgBox;
    state.statsEl = doc.getElementById('surfaceStatsSummary') || state.statsEl;
    state.messageEl = doc.getElementById('surfaceMessage') || state.messageEl;
    state.exportContainer = doc.getElementById('surfaceExportControls') || state.exportContainer;
    state.renderRow = doc.getElementById('surfaceRenderRow') || state.renderRow;
    state.renderButton = doc.getElementById('surfaceRenderButton') || state.renderButton;
    state.autoDrawNotice = doc.getElementById('surfaceAutoDrawNotice') || state.autoDrawNotice;
    state.axisSelects.x = doc.getElementById('surfaceXAxis') || state.axisSelects.x;
    state.axisSelects.y = doc.getElementById('surfaceYAxis') || state.axisSelects.y;
    state.axisSelects.z = doc.getElementById('surfaceZAxis') || state.axisSelects.z;
    state.controls.colorRamp = doc.getElementById('surfaceColorRamp') || state.controls.colorRamp;
    state.controls.interpolation = doc.getElementById('surfaceInterpolation') || state.controls.interpolation;
    state.controls.fontSize = doc.getElementById('surfaceFontSize') || state.controls.fontSize;
    state.controls.fontSizeVal = doc.getElementById('surfaceFontSizeVal') || state.controls.fontSizeVal;
    state.controls.axisStroke = doc.getElementById('surfaceAxisStroke') || state.controls.axisStroke;
    state.controls.axisStrokeVal = doc.getElementById('surfaceAxisStrokeVal') || state.controls.axisStrokeVal;
    state.controls.axisColor = doc.getElementById('surfaceAxisColor') || state.controls.axisColor;
    state.controls.showGrid = doc.getElementById('surfaceShowGrid') || state.controls.showGrid;
    state.controls.showFrame = doc.getElementById('surfaceShowFrame') || state.controls.showFrame;
    state.controls.showPoints = doc.getElementById('surfaceShowPoints') || state.controls.showPoints;
    state.controls.showLegend = doc.getElementById('surfaceShowLegend') || state.controls.showLegend;
    state.controls.loadExample = doc.getElementById('surfaceLoadExample') || state.controls.loadExample;
    state.controls.importBtn = doc.getElementById('surfaceImport') || state.controls.importBtn;
    state.controls.importFile = doc.getElementById('surfaceFile') || state.controls.importFile;
    state.controls.graphFileInput = doc.getElementById('surfaceGraphFile') || state.controls.graphFileInput;
  }

  function updateAxisOptions(){
    const hot = state.hot;
    if(!hot){ return; }
    const columns = typeof hot.countCols === 'function' ? hot.countCols() : (hot.getData?.()[0]?.length || DEFAULT_COLS);
    const headers = [];
    const data = typeof hot.getData === 'function' ? hot.getData() : [];
    const headerRow = Array.isArray(data?.[0]) ? data[0] : [];
    for(let col = 0; col < columns; col += 1){
      const value = headerRow[col];
      const normalized = value != null ? String(value).trim() : '';
      headers.push(normalized || `Column ${col + 1}`);
    }
    ['x', 'y', 'z'].forEach((axis, idx) => {
      const select = state.axisSelects[axis];
      if(!select){ return; }
      const previous = state.axisMap[axis];
      while(select.firstChild){ select.removeChild(select.firstChild); }
      headers.forEach((label, colIndex) => {
        const option = global.document.createElement('option');
        option.value = String(colIndex);
        option.textContent = label;
        if(previous === colIndex || (previous === undefined && colIndex === idx)){
          option.selected = true;
          state.axisMap[axis] = colIndex;
        }
        select.appendChild(option);
      });
      if(headers.length === 0){
        state.axisMap[axis] = 0;
      } else if(state.axisMap[axis] >= headers.length){
        state.axisMap[axis] = headers.length - 1;
        select.value = String(state.axisMap[axis]);
      }
    });
    updateAxisLabelsFromHeaders();
    debugLog('Debug: surface axis options refreshed', {
      columns,
      axisMap: Object.assign({}, state.axisMap)
    });
  }

  function getHeaderLabelForColumn(colIndex){
    if(!state.hot || typeof colIndex !== 'number' || colIndex < 0){
      return '';
    }
    const data = typeof state.hot.getData === 'function' ? state.hot.getData() : [];
    const headerRow = Array.isArray(data?.[0]) ? data[0] : [];
    const value = headerRow[colIndex];
    return value != null ? String(value).trim() : '';
  }

  function updateAxisLabelsFromHeaders(){
    const selected = getSelectedColumns();
    ['x', 'y', 'z'].forEach(axis => {
      const header = getHeaderLabelForColumn(selected[axis]);
      state.labels[axis] = header || DEFAULT_AXIS_LABELS[axis];
    });
  }

  function ensureHeaderRowFromConfig(config){
    if(!state.hot || typeof state.hot.getData !== 'function'){
      return;
    }
    const data = state.hot.getData();
    if(!Array.isArray(data) || !data.length){
      return;
    }
    const isHeaderTextual = (row) => Array.isArray(row) && row.some(cell => {
      if(cell == null || cell === ''){ return false; }
      const str = String(cell).trim();
      if(!str){ return false; }
      const numeric = Number(str);
      return Number.isNaN(numeric);
    });
    let headerRow = Array.isArray(data[0]) ? data[0] : [];
    if(!isHeaderTextual(headerRow)){
      if(typeof state.hot.alter === 'function'){
        state.hot.alter('insert_row_above', 0, 1, 'surface-header-migrate');
      }
      const refreshed = state.hot.getData();
      headerRow = Array.isArray(refreshed?.[0]) ? refreshed[0] : [];
    }
    const labelConfig = config?.labels || {};
    const axisMap = Object.assign({}, state.axisMap);
    ['x', 'y', 'z'].forEach(axis => {
      const idx = Number(axisMap[axis]);
      if(!Number.isInteger(idx) || idx < 0){ return; }
      const desiredRaw = labelConfig[axis];
      const desired = desiredRaw != null && String(desiredRaw).trim()
        ? String(desiredRaw).trim()
        : DEFAULT_AXIS_LABELS[axis];
      const current = getHeaderLabelForColumn(idx);
      if(current !== desired && typeof state.hot.setDataAtCell === 'function'){
        state.hot.setDataAtCell(0, idx, desired, 'surface-header-sync');
      }
    });
  }

  function getSelectedColumns(){
    const maxCol = state.hot && typeof state.hot.countCols === 'function' ? state.hot.countCols() - 1 : DEFAULT_COLS - 1;
    const resolveIndex = (value, fallback) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    return {
      x: Math.min(Math.max(0, resolveIndex(state.axisMap.x, 0)), maxCol),
      y: Math.min(Math.max(0, resolveIndex(state.axisMap.y, 1)), maxCol),
      z: Math.min(Math.max(0, resolveIndex(state.axisMap.z, 2)), maxCol)
    };
  }

  function initHot(){
    if(state.hot){ return state.hot; }
    const baseData = typeof Shared.createEmptyData === 'function'
      ? Shared.createEmptyData(DEFAULT_ROWS, DEFAULT_COLS)
      : null;
    if(baseData && baseData[0]){
      baseData[0][0] = DEFAULT_AXIS_LABELS.x;
      baseData[0][1] = DEFAULT_AXIS_LABELS.y;
      baseData[0][2] = DEFAULT_AXIS_LABELS.z;
    }
    const overrides = {
      data: baseData,
      pinFirstRow: true,
      columns: [
        { type: 'numeric', numericFormat: { pattern: '0[.]0000' } },
        { type: 'numeric', numericFormat: { pattern: '0[.]0000' } },
        { type: 'numeric', numericFormat: { pattern: '0[.]0000' } }
      ],
      minRows: DEFAULT_ROWS,
      minCols: DEFAULT_COLS,
      maxCols: 6,
      afterChange: (changes, source) => {
        if(source === 'loadData'){ return; }
        updateAxisOptions();
        if(Array.isArray(changes) && changes.length){
          syncSurfaceActiveDataViewFromHot(state.hot, 'afterChange');
        }
        state.scheduleDraw();
      },
      afterLoadData: () => {
        updateAxisOptions();
        syncSurfaceActiveDataViewFromHot(state.hot, 'afterLoadData');
        state.scheduleDraw();
      },
      afterSelectionEnd: () => {
        activateSurfaceDataToolbar('table-selection');
      }
    };
    const createSurfaceTable = (container) => {
      if(typeof hotNS.createStandardTable !== 'function'){
        return null;
      }
      const instance = hotNS.createStandardTable(container, { rows: DEFAULT_ROWS, cols: DEFAULT_COLS }, () => state.scheduleDraw(), overrides);
      if(instance){
        instance.__surfaceHostContainer = container || null;
      }
      return instance;
    };
    const ensureSurfaceHotForActiveTab = () => {
      const wrapper = global.document && global.document.getElementById('surfaceHotWrapper');
      const baseContainer = global.document && global.document.getElementById('surfaceHot');
      if(typeof Shared.hot?.ensureTableForTab !== 'function' || !wrapper || !baseContainer){
        if(!state.hot){
          state.hot = createSurfaceTable(baseContainer);
        }
        if(state.hot){
          state.hot.__surfaceHostContainer = baseContainer;
          state.hot.__surfaceTabId = Shared.hot.resolveActiveTabId?.() || 'surface-default';
          ensureSurfaceDataViewsForHot(state.hot, {
            wrapper,
            container: baseContainer
          });
          syncSurfaceActiveDataViewFromHot(state.hot, 'ensure-active-tab');
        }
        return state.hot;
      }
      const entry = Shared.hot.ensureTableForTab({
        type: 'surface',
        tabId: Shared.hot.resolveActiveTabId?.() || 'surface-default',
        wrapper,
        container: baseContainer,
        createInstance: createSurfaceTable
      });
      if(entry?.instance){
        state.hot = entry.instance;
      }
      if(state.hot){
        state.hot.__surfaceHostContainer = entry?.container || baseContainer;
        state.hot.__surfaceTabId = entry?.tabId || Shared.hot.resolveActiveTabId?.() || 'surface-default';
        ensureSurfaceDataViewsForHot(state.hot, {
          wrapper,
          container: entry?.container || baseContainer
        });
        syncSurfaceActiveDataViewFromHot(state.hot, 'ensure-active-tab');
      }
      return state.hot;
    };
    state.hot = ensureSurfaceHotForActiveTab();
    state.ensureHotForActiveTab = ensureSurfaceHotForActiveTab;
    bindSurfaceDataToolbar();
    if(state.hot && typeof state.hot.addHook === 'function'){
      state.hot.addHook('afterCreateCol', updateAxisOptions);
      state._hotHooks.push({ name: 'afterCreateCol', fn: updateAxisOptions });
      state.hot.addHook('afterRemoveCol', updateAxisOptions);
      state._hotHooks.push({ name: 'afterRemoveCol', fn: updateAxisOptions });
      state.hot.addHook('afterColumnMove', updateAxisOptions);
      state._hotHooks.push({ name: 'afterColumnMove', fn: updateAxisOptions });
    }
    debugLog('Debug: surface grid initialized', { hasHot: !!state.hot });
    return state.hot;
  }

  function parseSurfaceTable(){
    const hot = state.hot;
    if(!hot || typeof hot.getData !== 'function'){
      return { points: [], faces: [], ranges: null, stats: { skipped: 0 } };
    }
    const data = hot.getData();
    if(!Array.isArray(data) || !data.length){
      return { points: [], faces: [], ranges: null, stats: { skipped: 0 } };
    }
    // Safety: avoid parsing extremely large tables synchronously
    if(data.length > SURFACE_MAX_PARSE_ROWS){
      const stats = { vertexCount: 0, faceCount: 0, gridColumns: 0, gridRows: 0, gridCells: 0, gridExpected: 0, gridComplete: false, skipped: data.length, zMin: NaN, zMax: NaN, tooLarge: true };
      debugLog('Debug: surface parse aborted - table too large', { rows: data.length, threshold: SURFACE_MAX_PARSE_ROWS });
      return { points: [], faces: [], ranges: null, stats };
    }
    const cols = getSelectedColumns();
    const xValues = new Set();
    const yValues = new Set();
    const pointMap = new Map();
    const points = [];
    let skipped = 0;
    let zMin = Infinity;
    let zMax = -Infinity;
    const headerRow = Array.isArray(data[0]) ? data[0] : [];
    const headerLooksText = headerRow.some(cell => {
      if(cell == null || cell === ''){ return false; }
      const str = String(cell).trim();
      if(!str){ return false; }
      const num = Number(str);
      return Number.isNaN(num);
    });
    const startRow = headerLooksText ? 1 : 0;
    for(let rowIndex = startRow; rowIndex < data.length; rowIndex += 1){
      const row = data[rowIndex];
      if(!row){ continue; }
      // Treat empty/whitespace cells as missing (skip) instead of coercing to 0
      const rawX = row[cols.x];
      const rawY = row[cols.y];
      const rawZ = row[cols.z];
      const sx = rawX == null ? '' : String(rawX).trim();
      const sy = rawY == null ? '' : String(rawY).trim();
      const sz = rawZ == null ? '' : String(rawZ).trim();
      if(sx === '' || sy === '' || sz === ''){
        skipped += 1;
        continue;
      }
      const x = Number(sx);
      const y = Number(sy);
      const z = Number(sz);
      if(!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)){
        skipped += 1;
        continue;
      }
      // Protect against extremely large point counts
      if(points.length >= SURFACE_MAX_PARSE_POINTS){
        skipped += 1;
        continue;
      }
      const key = `${x}|${y}`;
      if(pointMap.has(key)){
        pointMap.get(key).z = z;
        zMin = Math.min(zMin, z);
        zMax = Math.max(zMax, z);
        continue;
      }
      const point = { x, y, z };
      pointMap.set(key, point);
      points.push(point);
      xValues.add(x);
      yValues.add(y);
      zMin = Math.min(zMin, z);
      zMax = Math.max(zMax, z);
    }
    const xArray = Array.from(xValues).sort((a, b) => a - b);
    const yArray = Array.from(yValues).sort((a, b) => a - b);
    const xIndex = new Map();
    const yIndex = new Map();
    xArray.forEach((value, idx) => xIndex.set(value, idx));
    yArray.forEach((value, idx) => yIndex.set(value, idx));
    const matrix = new Array(yArray.length);
    for(let yi = 0; yi < yArray.length; yi += 1){
      matrix[yi] = new Array(xArray.length).fill(null);
    }
    pointMap.forEach(point => {
      const xi = xIndex.get(point.x);
      const yi = yIndex.get(point.y);
      if(xi === undefined || yi === undefined){ return; }
      matrix[yi][xi] = point;
    });
    const faces = [];
    if(xArray.length >= 2 && yArray.length >= 2){
      for(let yi = 0; yi < yArray.length - 1; yi += 1){
        for(let xi = 0; xi < xArray.length - 1; xi += 1){
          const v00 = matrix[yi][xi];
          const v10 = matrix[yi][xi + 1];
          const v01 = matrix[yi + 1][xi];
          const v11 = matrix[yi + 1][xi + 1];
          if(!v00 || !v10 || !v01 || !v11){
            continue;
          }
          faces.push({ vertices: [v00, v10, v01], value: (v00.z + v10.z + v01.z) / 3 });
          faces.push({ vertices: [v11, v01, v10], value: (v11.z + v01.z + v10.z) / 3 });
        }
      }
    }
    const ranges = {
      x: { min: xArray.length ? xArray[0] : 0, max: xArray.length ? xArray[xArray.length - 1] : 0 },
      y: { min: yArray.length ? yArray[0] : 0, max: yArray.length ? yArray[yArray.length - 1] : 0 },
      z: { min: zMin, max: zMax }
    };
    const expectedCells = Math.max(0, (xArray.length - 1) * (yArray.length - 1));
    const actualCells = Math.max(0, Math.round(faces.length / 2));
    const stats = {
      vertexCount: points.length,
      faceCount: faces.length,
      gridColumns: xArray.length,
      gridRows: yArray.length,
      gridCells: actualCells,
      gridExpected: expectedCells,
      gridComplete: actualCells > 0 && actualCells === expectedCells,
      skipped,
      zMin,
      zMax
    };
    for(let yi = 0; yi < matrix.length; yi += 1){
      matrix[yi] = null;
    }
    debugLog('Debug: surface parsed data', stats);
    return { points, faces, xArray, yArray, ranges, stats };
  }

  function displayMessage(text){
    if(!state.messageEl){ return; }
    if(text){
      state.messageEl.textContent = text;
      state.messageEl.hidden = false;
    } else {
      state.messageEl.textContent = '';
      state.messageEl.hidden = true;
    }
  }

  function updateStats(info){
    const container = state.statsEl;
    if(!container){ return; }
    while(container.firstChild){ container.removeChild(container.firstChild); }
    const entries = [];
    if(info && info.vertexCount){
      entries.push({ label: 'Vertices', value: String(info.vertexCount) });
    }
    if(info && info.faceCount){
      entries.push({ label: 'Faces', value: String(info.faceCount) });
    }
    if(info && Number.isFinite(info.zMin) && Number.isFinite(info.zMax)){
      entries.push({ label: 'Z range', value: `${formatNumber(info.zMin)} – ${formatNumber(info.zMax)}` });
    }
    if(info && info.gridColumns && info.gridRows){
      const status = info.gridExpected ? (info.gridComplete ? 'complete' : 'partial') : 'insufficient';
      entries.push({ label: 'Grid', value: `${info.gridColumns} × ${info.gridRows} (${status})` });
    }
    if(info && info.skipped){
      entries.push({ label: 'Skipped rows', value: String(info.skipped) });
    }
    if(!entries.length){
      entries.push({ label: 'Status', value: 'Enter numeric X, Y, Z columns to generate the surface.' });
    }
    entries.forEach(entry => {
      const row = global.document.createElement('span');
      const label = global.document.createElement('strong');
      label.textContent = `${entry.label}:`;
      const value = global.document.createElement('span');
      value.textContent = entry.value;
      row.appendChild(label);
      row.appendChild(value);
      container.appendChild(row);
    });
    if(info && Shared.statsReporting && typeof Shared.statsReporting.appendReportPanel === 'function'){
      Shared.statsReporting.appendReportPanel(container, {
        methodsText: 'Surface summary statistics were generated from the parsed X/Y/Z grid or point cloud.',
        resultsText: [
          Number.isFinite(info.vertexCount) ? `Vertices = ${info.vertexCount}.` : null,
          Number.isFinite(info.faceCount) ? `Faces = ${info.faceCount}.` : null,
          Number.isFinite(info.zMin) && Number.isFinite(info.zMax) ? `Z range = ${formatNumber(info.zMin)} to ${formatNumber(info.zMax)}.` : null
        ].filter(Boolean).join(' '),
        analysisSpec: {
          component: 'surface',
          vertexCount: Number.isFinite(info.vertexCount) ? info.vertexCount : 0,
          faceCount: Number.isFinite(info.faceCount) ? info.faceCount : 0,
          zMin: Number.isFinite(info.zMin) ? info.zMin : null,
          zMax: Number.isFinite(info.zMax) ? info.zMax : null,
          gridColumns: info.gridColumns || 0,
          gridRows: info.gridRows || 0,
          gridComplete: !!info.gridComplete,
          skipped: info.skipped || 0
        }
      }, { title: 'Reporting and reproducibility' });
    }
  }
  function ensureAxisRange(range){
    if(!range){ return { min: -1, max: 1 }; }
    let min = Number(range.min);
    let max = Number(range.max);
    if(!Number.isFinite(min) || !Number.isFinite(max)){
      return { min: -1, max: 1 };
    }
    if(min === max){
      const pad = Math.max(Math.abs(min) || 1, 1);
      min -= pad;
      max += pad;
    }
    return { min, max };
  }

  function renderLegend(svg, options){
    const pos = options.position;
    const positionSummary = pos ? `x:${pos.x},y:${pos.y},relX:${pos.relX},relY:${pos.relY}` : 'null';
    console.log(`SURFACE: renderLegend function called - position: ${positionSummary}, width: ${options.width}, height: ${options.height}`);
    if(!svg || !options){ return; }
    const legendTextColor = normalizeSurfaceThemeColor(
      options.textColor,
      chartStyle.TEXT_COLOR || '#1f2a3d'
    );
    const legendStrokeColor = normalizeSurfaceThemeColor(options.axisColor, '#cbd5e1');
    const doc = svg.ownerDocument || global.document;
    const targetLayer = options.layer && options.layer.ownerDocument === doc && options.layer.nodeType === 1 ? options.layer : svg;
    let defs = svg.querySelector('defs');
    if(!defs){
      defs = doc.createElementNS(NS, 'defs');
      svg.insertBefore(defs, svg.firstChild || null);
    }
    const gradientId = `surfaceGradientScale-${SURFACE_INSTANCE_ID}`;
    let gradient = defs.querySelector(`#${gradientId}`);
    if(!gradient){
      gradient = doc.createElementNS(NS, 'linearGradient');
      gradient.id = gradientId;
      defs.appendChild(gradient);
    }
    gradient.setAttribute('x1', '0%');
    gradient.setAttribute('y1', '100%');
    gradient.setAttribute('x2', '0%');
    gradient.setAttribute('y2', '0%');
    
    // Create gradient stops based on the color ramp
    const ramp = COLOR_RAMPS[options.colorRamp] || COLOR_RAMPS.viridis;
    const stops = Array.isArray(ramp.stops) && ramp.stops.length ? ramp.stops : COLOR_RAMPS.viridis.stops;
    const stopCount = Math.max(1, stops.length - 1);
    
    // Clear existing stops
    while(gradient.firstChild){ 
      gradient.removeChild(gradient.firstChild); 
    }
    
    // Create new stops
    stops.forEach((hex, index) => {
      const stop = doc.createElementNS(NS, 'stop');
      stop.setAttribute('offset', `${(index / stopCount) * 100}%`);
      stop.setAttribute('stop-color', hex);
      gradient.appendChild(stop);
    });
    let legend = svg.querySelector('g.surface-legend');
    if(!legend){
      legend = doc.createElementNS(NS, 'g');
      legend.setAttribute('class', 'surface-legend');
      legend.setAttribute('data-legend-key', 'surface-scale');
    } else if(legend.parentNode !== targetLayer){
      legend.parentNode.removeChild(legend);
    }
    targetLayer.appendChild(legend);
    if(!legend.getAttribute('data-legend-key')){
      legend.setAttribute('data-legend-key', 'surface-scale');
    }
    while(legend.firstChild){ legend.removeChild(legend.firstChild); }
    // mark which gradient id this legend relies on so we can safely remove it later
    try{ legend.setAttribute('data-gradient-id', gradientId); }catch(e){}
    const marginTop = Number.isFinite(options?.margin?.top) ? options.margin.top : 0;
    const marginBottom = Number.isFinite(options?.margin?.bottom) ? options.margin.bottom : 0;
    const rawHeight = Number.isFinite(options?.height)
      ? options.height - marginTop - marginBottom
      : NaN;
    const fallbackBarHeight = Math.max(120, options.fontSize * 6);
    let barHeight = fallbackBarHeight;
    if(Number.isFinite(rawHeight) && rawHeight > 0){
      barHeight = Math.min(fallbackBarHeight, rawHeight);
    }
    barHeight = Math.max(60, barHeight);
    // Calculate legend dimensions based on font size and available space (following roc.js pattern)
    const fontSize = options.fontSize || 13;
    const barWidth = Math.max(14, fontSize * 0.8);
    const legendRightPad = Math.max(36, fontSize * 1.9);
    
    // Make legend height responsive based on graph height
    const availableHeight = Math.max(0, options.height - options.margin.top - options.margin.bottom);
    const minLegendHeight = Math.max(80, fontSize * 6);
    const maxLegendHeight = Math.min(200, availableHeight * 0.6);
    const legendHeight = Math.max(minLegendHeight, availableHeight * 0.3);
    
    // Ensure legend height is reasonable
    const finalLegendHeight = Number.isFinite(legendHeight) && legendHeight > 0 ? legendHeight : minLegendHeight;
    
    const defaultLegendX = options.width - options.margin.right + legendRightPad;
    const defaultLegendY = options.margin.top;
    const position = options.position || state.labelPositions?.legend || state.legendPosition || null;
    
    // Convert relative positions to absolute if needed for legend (following roc.js pattern)
    let absoluteLegendX = defaultLegendX;
    let absoluteLegendY = defaultLegendY;
    if (position) {
      if (position.relX !== undefined && position.relY !== undefined) {
        // Use relative positioning with validation to prevent NaN errors
        const width = Number(options.width);
        const marginRight = Number(options.margin.right);
        const height = Number(options.height);
        const marginTop = Number(options.margin.top);
        const relX = Number(position.relX);
        const relY = Number(position.relY);
        
        if (Number.isFinite(width) && Number.isFinite(marginRight) && Number.isFinite(relX)) {
          absoluteLegendX = width - marginRight + relX * legendRightPad;
        }
        if (Number.isFinite(height) && Number.isFinite(marginTop) && Number.isFinite(relY) && Number.isFinite(options.margin.bottom)) {
          // Use plotHeight as reference (like roc.js) instead of options.height
          // Ensure we use the same calculation as in the drag handler
          const plotHeight = height - marginTop - options.margin.bottom;
          if (Number.isFinite(plotHeight) && plotHeight > 0) {
            absoluteLegendY = marginTop + relY * plotHeight;
          }
        }
        // If any calculation failed, fall back to default positions
        if (!Number.isFinite(absoluteLegendX)) absoluteLegendX = defaultLegendX;
        if (!Number.isFinite(absoluteLegendY)) absoluteLegendY = defaultLegendY;
      } else if (position.x !== undefined && position.y !== undefined) {
        // Use absolute positioning (backward compatibility) with validation
        const absX = Number(position.x);
        const absY = Number(position.y);
        if (Number.isFinite(absX)) absoluteLegendX = absX;
        if (Number.isFinite(absY)) absoluteLegendY = absY;
      }
    }
    
    // Final validation to ensure we don't set invalid transform values
    if (!Number.isFinite(absoluteLegendX)) absoluteLegendX = defaultLegendX;
    if (!Number.isFinite(absoluteLegendY)) absoluteLegendY = defaultLegendY;
    
    // Debug logging for legend positioning
    if (Shared.isDebugEnabled?.()) {
      console.debug('Debug: surface legend positioning', {
        absoluteLegendX,
        absoluteLegendY,
        defaultLegendX,
        defaultLegendY,
        finalLegendHeight,
        legendHeight,
        barWidth,
        legendRightPad,
        position,
        plotHeight: options.height - options.margin.top - options.margin.bottom,
        options: {
          width: options.width,
          height: options.height,
          margin: options.margin
        }
      });
    }
    
    legend.setAttribute('transform', `translate(${absoluteLegendX},${absoluteLegendY})`);
    const rect = doc.createElementNS(NS, 'rect');
    rect.setAttribute('width', barWidth);
    rect.setAttribute('height', finalLegendHeight);
    rect.setAttribute('fill', `url(#${gradientId})`);
    rect.setAttribute('stroke', legendStrokeColor);
    rect.setAttribute('stroke-width', Math.max(0.6, options.fontSize * 0.04));
    rect.setAttribute('data-legend-key', 'surface-scale');
    legend.appendChild(rect);
    const minText = doc.createElementNS(NS, 'text');
    const legendFontSize = Math.max(9, fontSize * 0.75);
    const labelOffset = Math.max(10, legendFontSize * 0.9);
    minText.setAttribute('x', barWidth / 2);
    minText.setAttribute('y', finalLegendHeight + labelOffset);
    minText.setAttribute('font-size', legendFontSize);
    minText.setAttribute('fill', legendTextColor);
    minText.setAttribute('text-anchor', 'middle');
    minText.setAttribute('data-legend-key', 'surface-scale');
    minText.textContent = formatNumber(options.min);
    legend.appendChild(minText);
    const maxText = doc.createElementNS(NS, 'text');
    maxText.setAttribute('x', barWidth / 2);
    maxText.setAttribute('y', -Math.max(6, legendFontSize * 0.4));
    maxText.setAttribute('font-size', legendFontSize);
    maxText.setAttribute('fill', legendTextColor);
    maxText.setAttribute('text-anchor', 'middle');
    maxText.setAttribute('dominant-baseline', 'baseline');
    maxText.setAttribute('data-legend-key', 'surface-scale');
    maxText.textContent = formatNumber(options.max);
    legend.appendChild(maxText);

    if(typeof plot3d.applyLegendPointerGuards === 'function'){
      plot3d.applyLegendPointerGuards(legend, { label: 'surface-scale' });
      plot3d.applyLegendPointerGuards(rect, { label: 'surface-scale' });
      plot3d.applyLegendPointerGuards(minText, { label: 'surface-scale' });
      plot3d.applyLegendPointerGuards(maxText, { label: 'surface-scale' });
    }

    if(typeof Shared.enableLegendDrag === 'function' && legend.dataset){
      if(legend.dataset.dragBound !== '1'){
        legend.dataset.dragBound = '1';
        Shared.enableLegendDrag(legend, svg, {
          onDragEnd: pos => {
            // Store both absolute and relative positions for legend (following roc.js pattern)
            // Use plotHeight as reference (like roc.js) instead of options.height
            const plotHeight = options.height - options.margin.top - options.margin.bottom;
            const relX = (pos.x - (options.width - options.margin.right)) / legendRightPad;
            const relY = Number.isFinite(plotHeight) && plotHeight > 0 
              ? (pos.y - options.margin.top) / plotHeight 
              : 0;
            state.labelPositions.legend = { 
              x: pos.x, 
              y: pos.y,
              relX: relX, 
              relY: relY 
            };
            // Also update legacy field for backward compatibility
            state.legendPosition = state.labelPositions.legend;
            debugLog('Debug: surface legend position saved', { absolute: pos, relative: { relX, relY } });
          },
          undoLabel: 'surface-legend-position'
        });
      }
    }
    
    // Return legend dimensions for layout calculations (following roc.js pattern)
    return {
      width: barWidth + legendRightPad,
      height: finalLegendHeight
    };
  }

  function removeLegend(svg){
    if(!svg){ return; }
    const legend = svg.querySelector('g.surface-legend');
    if(legend && legend.parentNode){
      // remove associated gradient if present
      try{
        const gradId = legend.getAttribute && legend.getAttribute('data-gradient-id');
        if(gradId){
          const defs = svg.querySelector('defs');
          const grad = defs && defs.querySelector && defs.querySelector(`#${gradId}`);
          if(grad && grad.parentNode){ grad.parentNode.removeChild(grad); }
        }
      }catch(e){ /* defensive */ }
      legend.parentNode.removeChild(legend);
    }
  }

  function applySettingsToControls(){
    if(state.controls.colorRamp){ state.controls.colorRamp.value = state.settings.colorRamp; }
    if(state.controls.interpolation){ state.controls.interpolation.value = state.settings.interpolation; }
    if(state.controls.fontSize){ state.controls.fontSize.value = String(state.settings.fontSize); }
    if(state.controls.fontSize && chartStyle.renderFontSizeLabel){
      chartStyle.renderFontSizeLabel({ element: state.controls.fontSizeVal, pt: Number(state.settings.fontSize), input: state.controls.fontSize });
    }
    if(state.controls.axisStroke){
      state.controls.axisStroke.value = String(state.settings.axisStroke);
      if(state.controls.axisStrokeVal){ state.controls.axisStrokeVal.textContent = Number(state.settings.axisStroke).toFixed(2); }
    }
    if(state.controls.axisColor){ state.controls.axisColor.value = state.settings.axisColor; }
    if(state.controls.showGrid){ state.controls.showGrid.checked = !!state.settings.showGrid; }
    if(state.controls.showFrame){ state.controls.showFrame.checked = !!state.settings.showFrame; }
    if(state.controls.showPoints){ state.controls.showPoints.checked = !!state.settings.showPoints; }
    if(state.controls.showLegend){ state.controls.showLegend.checked = !!state.settings.showLegend; }
  }

  function buildExampleDataset(){
    const rows = [[DEFAULT_AXIS_LABELS.x, DEFAULT_AXIS_LABELS.y, DEFAULT_AXIS_LABELS.z]];
    const xs = [];
    const ys = [];
    for(let x = -3; x <= 3.0001; x += 0.6){
      xs.push(Number(x.toFixed(2)));
    }
    for(let y = -3; y <= 3.0001; y += 0.6){
      ys.push(Number(y.toFixed(2)));
    }
    for(let yi = 0; yi < ys.length; yi += 1){
      const y = ys[yi];
      for(let xi = 0; xi < xs.length; xi += 1){
        const x = xs[xi];
        const peakNorth = Math.exp(-((x - 1.2) * (x - 1.2) + (y + 0.8) * (y + 0.8)) * 1.4);
        const peakSouth = Math.exp(-((x + 1.0) * (x + 1.0) + (y - 1.5) * (y - 1.5)) * 2.1);
        const valleyCenter = Math.exp(-((x + 0.2) * (x + 0.2) + (y + 0.1) * (y + 0.1)) * 3.2);
        const ridge = 0.35 * Math.sin(x * 2.3) * Math.cos(y * 1.8);
        const z = peakNorth * 5.0 + peakSouth * 3.5 - valleyCenter * 6.0 + ridge * 2.0;
        rows.push([x, y, Number(z.toFixed(3))]);
      }
    }
    return rows;
  }

  function initControls(){
    cacheDom();
    applySettingsToControls();
    const colorRampSelect = state.controls.colorRamp;
    if(colorRampSelect){
      attachListener(colorRampSelect, 'change', () => {
        const value = colorRampSelect.value;
        state.settings.colorRamp = COLOR_RAMPS[value] ? value : 'viridis';
        debugLog('Debug: surface color ramp updated', { value: state.settings.colorRamp });
        state.scheduleDraw();
      });
    }
    const interpolationSelect = state.controls.interpolation;
    if(interpolationSelect){
      attachListener(interpolationSelect, 'change', () => {
        const value = interpolationSelect.value;
        state.settings.interpolation = INTERPOLATION_OPTIONS[value] ? value : 'grid';
        debugLog('Debug: surface interpolation updated', { value: state.settings.interpolation });
        state.scheduleDraw();
      });
    }
    if(state.controls.fontSize){
      attachListener(state.controls.fontSize, 'input', () => {
        state.settings.fontSize = Number(state.controls.fontSize.value) || 13;
        if(chartStyle.renderFontSizeLabel){
          chartStyle.renderFontSizeLabel({ element: state.controls.fontSizeVal, pt: state.settings.fontSize, input: state.controls.fontSize, manual: true });
        }
        state.scheduleDraw();
      });
    }
    if(state.controls.axisStroke){
      attachListener(state.controls.axisStroke, 'input', () => {
        state.settings.axisStroke = Number(state.controls.axisStroke.value) || 1.2;
        if(state.controls.axisStrokeVal){ state.controls.axisStrokeVal.textContent = Number(state.settings.axisStroke).toFixed(2); }
        state.scheduleDraw();
      });
    }
    if(state.controls.axisColor){
      if(typeof Shared.attachColorPickerNear === 'function'){
        Shared.attachColorPickerNear(state.controls.axisColor);
      }
      attachListener(state.controls.axisColor, 'input', () => {
        state.settings.axisColor = state.controls.axisColor.value || '#3b3b3b';
        state.scheduleDraw();
      });
    }
    ['showGrid', 'showFrame', 'showPoints', 'showLegend'].forEach(key => {
      const control = state.controls[key];
      if(!control){ return; }
      attachListener(control, 'change', () => {
        state.settings[key] = !!control.checked;
        state.scheduleDraw();
      });
    });
    ['x', 'y', 'z'].forEach(axis => {
      const select = state.axisSelects[axis];
      if(!select){ return; }
      attachListener(select, 'change', () => {
        const next = Number(select.value);
        if(Number.isFinite(next)){
          state.axisMap[axis] = next;
        }
        state.scheduleDraw();
      });
    });
    if(state.controls.loadExample){
      attachListener(state.controls.loadExample, 'click', () => {
        const example = buildExampleDataset();
        if(state.hot && typeof state.hot.loadData === 'function'){
          markSurfaceOverlayPending('example-data');
          state.hot.loadData(example);
          debugLog('Debug: surface example dataset loaded', { rows: example.length });
          updateAxisOptions();
          state.scheduleDraw();
        }
      });
    }
    if(state.controls.importBtn && state.controls.importFile){
      attachListener(state.controls.importBtn, 'click', () => {
        state.controls.importFile.value = '';
        state.controls.importFile.click();
      });
      attachListener(state.controls.importFile, 'change', () => {
        if(!tableImport || typeof tableImport.openFile !== 'function'){
          console.warn('surface import skipped: tableImport unavailable');
          return;
        }
        const hasFile = !!(state.controls.importFile?.files && state.controls.importFile.files[0]);
        let forcedOverlay = false;
        if(hasFile){
          forcedOverlay = !!forceSurfaceOverlay('file-import', { message: 'Importing table data...' });
          markSurfaceOverlayPending('file-import');
        }
        tableImport.openFile(state.controls.importFile, {
          hot: state.hot,
          minCols: 3,
          minRows: 5,
          scheduleDraw: () => {
            markSurfaceOverlayPending('file-import');
            state.scheduleDraw?.({ force: true, reason: 'import-load', skipThresholdEvaluation: true });
          },
          debugLabel: 'surface',
          onProcessed: info => {
            debugLog('Debug: surface data imported', info);
            updateAxisOptions();
          },
          onCompleted: () => {
            const renderReason = 'import-load';
            markSurfaceOverlayPending(renderReason);
            forceSurfaceOverlay(renderReason, { message: 'Rendering surface plot...' });
          }
        }).then(result => {
          if(!result && forcedOverlay){
            resolveSurfaceOverlay('file-import-empty');
          }
        }).catch(err => {
          if(forcedOverlay){
            resolveSurfaceOverlay('file-import-error');
          }
          console.error('surface import failed', err);
        });
      });
    }
    if(exporter && typeof exporter.mountSvgControls === 'function'){
      exporter.mountSvgControls({
        container: '#surfaceExportControls',
        svgSelector: '#surfaceSvg',
        fileName: 'surface-plot',
        contextLabel: 'surface-export'
      });
    }
    const saveBtn = global.document.getElementById('saveSurfaceGraph');
    if(saveBtn){ attachListener(saveBtn, 'click', () => surface.save()); }
    const saveAsBtn = global.document.getElementById('saveAsSurface');
    if(saveAsBtn){ attachListener(saveAsBtn, 'click', () => surface.saveAs()); }
    const openBtn = global.document.getElementById('openSurfaceGraph');
    if(openBtn){ attachListener(openBtn, 'click', () => surface.open()); }
  }
  function draw(){
    drawSurface();
  }

  function runSurfaceDrawCycle(){
    let status = 'complete';
    try{
      draw();
    }catch(err){
      status = 'error';
      throw err;
    }finally{
      resolveSurfaceOverlay(status);
    }
  }

  function drawSurface(){
    cacheDom();
    const svg = state.svg;
    const svgBox = state.svgBox;
    if(!svg || !svgBox){
      debugLog('Debug: surface draw skipped', { reason: 'missing-svg' });
      return;
    }
    const parsed = parseSurfaceTable();
    if(!parsed.points.length){
      while(svg.firstChild){ svg.removeChild(svg.firstChild); }
      displayMessage('Add at least three rows of numeric X, Y, Z values to render a surface.');
      updateStats(parsed.stats);
      removeLegend(svg);
      return;
    }
    updateAxisLabelsFromHeaders();
    displayMessage('');
    const boxRect = svgBox.getBoundingClientRect ? svgBox.getBoundingClientRect() : { width: svg.clientWidth || 640, height: svg.clientHeight || 420 };
    const width = Math.max(280, Math.floor(boxRect.width || svg.clientWidth || 640));
    const height = Math.max(240, Math.floor(boxRect.height || svg.clientHeight || 420));
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('font-family', chartStyle.FONT_FAMILY || 'Segoe UI, sans-serif');
    if(typeof chartStyle.applySvgDefaults === 'function'){
      chartStyle.applySvgDefaults(svg);
    }
    if(fontControls && typeof fontControls.enableForSvg === 'function'){
      fontControls.enableForSvg(svg, { scopeId: 'surface' });
    }
    const doc = svg.ownerDocument || global.document;
    // Ensure <defs> exists for gradients/etc
    let defs = svg.querySelector('defs');
    if(!defs){
      defs = doc.createElementNS(NS, 'defs');
      svg.insertBefore(defs, svg.firstChild || null);
    }
    // Reuse or create stable layer groups to avoid removing/recreating every draw
    let backgroundLayer = svg.querySelector('g.surface-layer-background');
    if(!backgroundLayer){
      backgroundLayer = doc.createElementNS(NS, 'g');
      backgroundLayer.setAttribute('class', 'surface-layer surface-layer-background');
      svg.appendChild(backgroundLayer);
    }
    let geometryLayer = svg.querySelector('g.surface-layer-geometry');
    if(!geometryLayer){
      geometryLayer = doc.createElementNS(NS, 'g');
      geometryLayer.setAttribute('class', 'surface-layer surface-layer-geometry');
      svg.appendChild(geometryLayer);
    }
    let frontLayer = svg.querySelector('g.surface-layer-foreground');
    if(!frontLayer){
      frontLayer = doc.createElementNS(NS, 'g');
      frontLayer.setAttribute('class', 'surface-layer surface-layer-foreground');
      svg.appendChild(frontLayer);
    }
    let axisLayer = svg.querySelector('g.surface-layer-axes');
    if(!axisLayer){
      axisLayer = doc.createElementNS(NS, 'g');
      axisLayer.setAttribute('class', 'surface-layer surface-layer-axes');
      svg.appendChild(axisLayer);
    }
    const fontInfo = typeof chartStyle.resolveScaledFontSize === 'function'
      ? chartStyle.resolveScaledFontSize({ rawSize: state.settings.fontSize, width, height, svgBox: state.svgBox, input: state.controls.fontSize })
      : { scaledPx: state.settings.fontSize, scaleInfo: null };
    if(state.controls.fontSize && chartStyle.renderFontSizeLabel){
      chartStyle.renderFontSizeLabel({ element: state.controls.fontSizeVal, fontInfo, input: state.controls.fontSize });
    }
    const fs = fontInfo.scaledPx || state.settings.fontSize;
    const axisStrokeWidthBase = getAxisStrokeWidthBase();
    const axisStrokeWidth = typeof chartStyle.scaleStrokeWidth === 'function'
      ? chartStyle.scaleStrokeWidth(axisStrokeWidthBase, fontInfo.scaleInfo, { context: 'surface-axis', min: 0.4 })
      : axisStrokeWidthBase;
    const gridStyleBase = getGridStyle(axisStrokeWidthBase);
    const gridStrokeStyle = Object.assign({}, gridStyleBase, {
      thickness: typeof chartStyle.scaleStrokeWidth === 'function'
        ? chartStyle.scaleStrokeWidth(gridStyleBase.thickness, fontInfo.scaleInfo, { context: 'surface-grid', min: 0 })
        : gridStyleBase.thickness
    });
    const gridDash = (gridControls && typeof gridControls.patternToDasharray === 'function')
      ? gridControls.patternToDasharray(gridStrokeStyle.pattern, gridStrokeStyle.thickness)
      : null;
    const gridOpacity = (gridControls && typeof gridControls.transparencyToOpacity === 'function')
      ? gridControls.transparencyToOpacity(gridStrokeStyle.transparency)
      : Math.max(0, Math.min(1, 1 - (Number(gridStrokeStyle.transparency || 0) / 100)));
    const surfaceThemeDark = isSurfaceDarkTheme();
    const surfaceTextColor = normalizeSurfaceThemeColor(
      state.settings?.textColor,
      surfaceThemeDark ? '#f2f2f2' : (chartStyle.TEXT_COLOR || '#1f2a3d')
    );
    const surfaceBackgroundColor = normalizeSurfaceThemeColor(
      state.settings?.backgroundColor,
      surfaceThemeDark ? '#000000' : '#ffffff'
    );
    const surfaceGeometryStroke = surfaceThemeDark
      ? normalizeSurfaceThemeColor(state.settings?.axisColor, '#d1d5db')
      : 'rgba(0,0,0,0.25)';
    const surfaceGeometryStrokeOpacity = surfaceThemeDark ? 0.65 : 1;
    const margin = {
      top: Math.max(fs * 3.2, 42),
      right: Math.max(fs * 6.5, state.settings.showLegend ? 140 : 60),
      bottom: Math.max(fs * 3.4, 44),
      left: Math.max(fs * 3.6, 58)
    };
    const legendShiftX = typeof plot3d.resolveLegendShiftX === 'function'
      ? plot3d.resolveLegendShiftX({ legendVisible: state.settings.showLegend, margin, fontSize: fs })
      : 0;
    const plotWidth = Math.max(40, width - margin.left - margin.right);
    const plotHeight = Math.max(40, height - margin.top - margin.bottom);
    const ranges = {
      x: ensureAxisRange(parsed.ranges?.x),
      y: ensureAxisRange(parsed.ranges?.y),
      z: ensureAxisRange(parsed.ranges?.z)
    };
    const rotatePoint = typeof plot3d.rotatePoint === 'function'
      ? (pt) => plot3d.rotatePoint(pt, state.rotation)
      : (pt) => ({ x: pt.x, y: pt.y, z: pt.z });
    const corners = [
      { x: ranges.x.min, y: ranges.y.min, z: ranges.z.min },
      { x: ranges.x.max, y: ranges.y.min, z: ranges.z.min },
      { x: ranges.x.min, y: ranges.y.max, z: ranges.z.min },
      { x: ranges.x.max, y: ranges.y.max, z: ranges.z.min },
      { x: ranges.x.min, y: ranges.y.min, z: ranges.z.max },
      { x: ranges.x.max, y: ranges.y.min, z: ranges.z.max },
      { x: ranges.x.min, y: ranges.y.max, z: ranges.z.max },
      { x: ranges.x.max, y: ranges.y.max, z: ranges.z.max }
    ];
    const rotatedCorners = corners.map(rotatePoint);
    const rotatedPoints = parsed.points.map(rotatePoint);
    let projector = null;
    if(typeof plot3d.createProjector === 'function'){
      projector = plot3d.createProjector({
        rotatedPoints: rotatedPoints.concat(rotatedCorners),
        rotatedCorners,
        width,
        height,
        margin,
        shiftX: legendShiftX
      });
    } else {
      projector = {
        project(pt){
          return {
            x: margin.left + ((pt.x - ranges.x.min) / (ranges.x.max - ranges.x.min || 1)) * plotWidth,
            y: margin.top + plotHeight - ((pt.y - ranges.y.min) / (ranges.y.max - ranges.y.min || 1)) * plotHeight,
            depth: pt.z
          };
        }
      };
    }
    const projectRotated = (rot) => projector.project(rot);
    if(svg && typeof plot3d.attachRotationControls === 'function'){
      plot3d.attachRotationControls(svg, {
        state: state.rotation,
        onChange: () => state.scheduleDraw(),
        debugLabel: 'surface-plot',
        shouldIgnorePointer: (event) => {
          if(typeof plot3d.isInteractivePointerTarget === 'function'){
            return plot3d.isInteractivePointerTarget(event?.target);
          }
          return typeof plot3d.isLegendPointerTarget === 'function' && plot3d.isLegendPointerTarget(event?.target);
        }
      });
    }
    const tickTargetX = Math.max(3, typeof chartStyle.estimateTickCount === 'function'
      ? chartStyle.estimateTickCount(plotWidth, { axis: 'x', fallback: 6 })
      : 6);
    const tickTargetY = Math.max(3, typeof chartStyle.estimateTickCount === 'function'
      ? chartStyle.estimateTickCount(plotHeight, { axis: 'y', fallback: 6 })
      : 6);
    const tickTargetZ = Math.max(3, typeof chartStyle.estimateTickCount === 'function'
      ? chartStyle.estimateTickCount(Math.max(plotWidth, plotHeight), { axis: 'z', fallback: 6 })
      : 6);
    const scaleX = niceScale(ranges.x.min, ranges.x.max, tickTargetX);
    const scaleY = niceScale(ranges.y.min, ranges.y.max, tickTargetY);
    const scaleZ = niceScale(ranges.z.min, ranges.z.max, tickTargetZ);
    const clampTicks = (ticks, range) => ticks.filter(value => value >= range.min - 1e-9 && value <= range.max + 1e-9);
    const ensureMinTicks = (ticks, range, count = 3) => {
      if(ticks.length >= count){
        return ticks;
      }
      const span = range.max - range.min;
      if(!Number.isFinite(span) || span === 0){
        return ticks;
      }
      const step = span / (count - 1);
      const fallback = [];
      for(let i = 0; i < count; i += 1){
        fallback.push(Number((range.min + step * i).toFixed(6)));
      }
      return fallback;
    };
    const axisTicks = {
      x: ensureMinTicks(clampTicks(scaleX.ticks, ranges.x), ranges.x),
      y: ensureMinTicks(clampTicks(scaleY.ticks, ranges.y), ranges.y),
      z: ensureMinTicks(clampTicks(scaleZ.ticks, ranges.z), ranges.z)
    };
    if(typeof plot3d.renderAxesAndGrid === 'function'){
      // Clear previous render output from axis and background layers to avoid
      // accumulation when renderers append new nodes each draw (e.g., on rotate).
      try{ while(axisLayer.firstChild){ axisLayer.removeChild(axisLayer.firstChild); } }catch(e){}
      try{ while(backgroundLayer.firstChild){ backgroundLayer.removeChild(backgroundLayer.firstChild); } }catch(e){}
      try{ while(frontLayer.firstChild){ frontLayer.removeChild(frontLayer.firstChild); } }catch(e){}
      svg.style.backgroundColor = surfaceThemeDark ? surfaceBackgroundColor : '';
      if(surfaceThemeDark){
        const bgRect = doc.createElementNS(NS, 'rect');
        bgRect.setAttribute('x', '0');
        bgRect.setAttribute('y', '0');
        bgRect.setAttribute('width', String(Math.max(1, width)));
        bgRect.setAttribute('height', String(Math.max(1, height)));
        bgRect.setAttribute('fill', surfaceBackgroundColor);
        bgRect.setAttribute('pointer-events', 'none');
        bgRect.setAttribute('data-color-scheme-background', '1');
        backgroundLayer.appendChild(bgRect);
      }
      plot3d.renderAxesAndGrid({
        svg: axisLayer,
        project: projectRotated,
        rotatePoint,
        axisRanges: ranges,
        axisTicks,
        axisLabels: { x: state.labels.x, y: state.labels.y, z: state.labels.z },
        fontSize: fs,
        axisStrokeWidth,
        chartStyle,
        showGrid: state.settings.showGrid,
        showFrame: state.settings.showFrame,
        showPanes: state.settings.showFrame,
        axisColor: state.settings.axisColor,
        frameColor: state.settings.axisColor,
        tickTextColor: surfaceTextColor,
        axisLabelColor: surfaceTextColor,
        paneFill: surfaceThemeDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.03)',
        paneOpacityRange: surfaceThemeDark ? { min: 0.10, max: 0.22 } : { min: 0.01, max: 0.05 },
        gridColor: gridStrokeStyle.color,
        gridDash: gridDash || undefined,
        gridOpacity,
        gridStrokeWidth: gridStrokeStyle.thickness,
        gridOutlineColors: { primary: gridStrokeStyle.color, secondary: gridStrokeStyle.color },
        debugLabel: 'surface-axes',
        paneTarget: backgroundLayer,
        gridTarget: backgroundLayer,
        backFrameTarget: backgroundLayer,
        backAxisTarget: backgroundLayer,
        frontFrameTarget: frontLayer,
        axisTarget: axisLayer,
        labelTarget: axisLayer,
        onAxisLabel: (el, axisKey) => {
          if(!el){ return; }
          const role = axisKey ? `${axisKey}Title` : 'axisTitle';
          markFontEditable(el, role, role);
          const applyAxisLabel = value => {
            const trimmed = value != null ? String(value).trim() : '';
            const resolved = trimmed || DEFAULT_AXIS_LABELS[axisKey] || DEFAULT_AXIS_LABELS.x;
            state.labels[axisKey] = resolved;
            if(state.hot && typeof state.hot.setDataAtCell === 'function'){
              const columns = getSelectedColumns();
              const targetCol = columns[axisKey];
              if(Number.isInteger(targetCol)){
                const current = getHeaderLabelForColumn(targetCol);
                if(current !== resolved){
                  state.hot.setDataAtCell(0, targetCol, resolved, 'surface-axis-inline');
                }
              }
            }
            state.scheduleDraw?.();
            if(el.textContent !== resolved){
              el.textContent = resolved;
            }
            return resolved;
          };
          makeEditableHelper(el, text => {
            const previous = state.labels[axisKey] || DEFAULT_AXIS_LABELS[axisKey] || DEFAULT_AXIS_LABELS.x;
            const nextValue = applyAxisLabel(text);
            if(previous === nextValue){
              return;
            }
            recordSurfaceChange(`surface:${axisKey}-label`, previous, nextValue, val => { applyAxisLabel(val); return true; });
          }, { scopeId: 'surface', key: role });
        }
      });
    }
    const axisLabelBounds = [];
    if(axisLayer && typeof axisLayer.querySelectorAll === 'function'){
      const axisNodes = axisLayer.querySelectorAll('[data-axis-label]');
      for(let idx = 0; idx < axisNodes.length; idx += 1){
        const node = axisNodes[idx];
        if(!node || typeof node.getBBox !== 'function'){ continue; }
        try {
          const bbox = node.getBBox();
          const valid = Number.isFinite(bbox?.x) && Number.isFinite(bbox?.y)
            && Number.isFinite(bbox?.width) && Number.isFinite(bbox?.height);
          if(!valid){ continue; }
          axisLabelBounds.push({
            x: bbox.x,
            y: bbox.y,
            width: bbox.width,
            height: bbox.height
          });
        } catch(err){
          debugLog('Debug: surface axis label bbox error', {
            message: err?.message || String(err)
          });
        }
      }
    }
    const colorFor = colorScaleFactory(parsed.stats.zMin, parsed.stats.zMax, state.settings.colorRamp);
    const effectiveMode = (state.settings.interpolation === 'grid' && parsed.faces.length)
      ? 'grid'
      : (parsed.faces.length ? state.settings.interpolation : 'scatter');
    const shouldRenderFaces = parsed.faces.length && effectiveMode === 'grid';
    const shouldRenderPoints = state.settings.showPoints || effectiveMode !== 'grid';
    if(shouldRenderFaces){
      let faceGroup = geometryLayer.querySelector('g.surface-faces');
      if(!faceGroup){
        faceGroup = doc.createElementNS(NS, 'g');
        faceGroup.setAttribute('class', 'surface-faces');
        geometryLayer.appendChild(faceGroup);
      }
      const projectedFaces = parsed.faces.map(face => {
        const rotated = face.vertices.map(rotatePoint);
        const projected = rotated.map(projectRotated);
        const depth = rotated.reduce((sum, value) => sum + value.z, 0) / rotated.length;
        return { projected, depth, value: face.value };
      }).sort((a, b) => a.depth - b.depth);
      state._facePoolUsed = 0;
      projectedFaces.forEach(face => {
        let polygon = state._facePool[state._facePoolUsed];
        if(!polygon){
          polygon = doc.createElementNS(NS, 'polygon');
          polygon.setAttribute('class', 'surface-face');
          state._facePool.push(polygon);
        }
        polygon.setAttribute('points', face.projected.map(pt => `${pt.x.toFixed(2)},${pt.y.toFixed(2)}`).join(' '));
        polygon.setAttribute('fill', colorFor(face.value));
        polygon.setAttribute('fill-opacity', 0.95);
        polygon.setAttribute('stroke', surfaceGeometryStroke);
        polygon.setAttribute('stroke-opacity', String(surfaceGeometryStrokeOpacity));
        polygon.setAttribute('stroke-width', Math.max(axisStrokeWidth * 0.6, 0.6));
        // append to group to ensure draw order
        if(polygon.parentNode !== faceGroup){
          faceGroup.appendChild(polygon);
        } else {
          faceGroup.appendChild(polygon);
        }
        polygon.style.display = '';
        state._facePoolUsed += 1;
      });
      // hide any unused polygons but keep in pool
      for(let i = state._facePoolUsed; i < state._facePool.length; i += 1){
        const extra = state._facePool[i];
        try{ if(extra && extra.style){ extra.style.display = 'none'; } }catch(e){}
      }
      if(faceGroup.style.display !== ''){
        faceGroup.style.display = '';
      }
    } else {
      const faceGroup = geometryLayer.querySelector('g.surface-faces');
      if(faceGroup){
        faceGroup.style.display = 'none';
      }
    }
    if(shouldRenderPoints){
      let pointGroup = geometryLayer.querySelector('g.surface-points');
      if(!pointGroup){
        pointGroup = doc.createElementNS(NS, 'g');
        pointGroup.setAttribute('class', 'surface-points');
        geometryLayer.appendChild(pointGroup);
      }
      const projectedPoints = parsed.points.map(point => {
        const rotated = rotatePoint(point);
        const projected = projectRotated(rotated);
        return { x: projected.x, y: projected.y, depth: rotated.z, value: point.z };
      }).sort((a, b) => a.depth - b.depth);
      const radius = Math.max(2.5, Math.min(6, Math.sqrt(Math.max(plotWidth * plotHeight / Math.max(projectedPoints.length * 45, 1), 4))));
      state._pointPoolUsed = 0;
      projectedPoints.forEach(entry => {
        let circle = state._pointPool[state._pointPoolUsed];
        if(!circle){
          circle = doc.createElementNS(NS, 'circle');
          circle.setAttribute('class', 'surface-point');
          state._pointPool.push(circle);
        }
        circle.setAttribute('cx', entry.x);
        circle.setAttribute('cy', entry.y);
        circle.setAttribute('r', radius);
        circle.setAttribute('fill', colorFor(entry.value));
        circle.setAttribute('stroke', surfaceGeometryStroke);
        circle.setAttribute('stroke-opacity', String(surfaceGeometryStrokeOpacity));
        circle.setAttribute('stroke-width', Math.max(axisStrokeWidth * 0.4, 0.4));
        circle.setAttribute('opacity', effectiveMode === 'grid' ? 0.78 : 0.95);
        if(circle.parentNode !== pointGroup){
          pointGroup.appendChild(circle);
        } else {
          pointGroup.appendChild(circle);
        }
        circle.style.display = '';
        state._pointPoolUsed += 1;
      });
      for(let i = state._pointPoolUsed; i < state._pointPool.length; i += 1){
        const extra = state._pointPool[i];
        try{ if(extra && extra.style){ extra.style.display = 'none'; } }catch(e){}
      }
      if(pointGroup.style.display !== ''){
        pointGroup.style.display = '';
      }
    } else {
      const pointGroup = geometryLayer.querySelector('g.surface-points');
      if(pointGroup){
        pointGroup.style.display = 'none';
      }
    }
    let title = svg.querySelector('text[data-graph-title]');
    const titleBaseY = Math.max(fs, margin.top * 0.55);
    const titleBaseX = margin.left + plotWidth / 2;
    const titlePos = state.labelPositions?.title;
    const hasTitlePos = Number.isFinite(titlePos?.x) && Number.isFinite(titlePos?.y);
    const applySurfaceTitle = value => {
      const trimmed = value != null ? String(value).trim() : '';
      const resolved = trimmed || 'Surface Plot';
      state.labels.title = resolved;
      if(title && title.textContent !== resolved){
        title.textContent = resolved;
      }
      state.scheduleDraw?.();
      return resolved;
    };
    if(!title){
      title = doc.createElementNS(NS, 'text');
      
      // Convert relative positions to absolute if needed
      let absoluteTitleX = titleBaseX;
      let absoluteTitleY = titleBaseY;
      if (titlePos) {
        if (titlePos.relX !== undefined && titlePos.relY !== undefined) {
          // Use relative positioning
          absoluteTitleX = margin.left + titlePos.relX * plotWidth;
          absoluteTitleY = margin.top + titlePos.relY * plotHeight;
        } else if (titlePos.x !== undefined && titlePos.y !== undefined) {
          // Use absolute positioning (backward compatibility)
          absoluteTitleX = titlePos.x;
          absoluteTitleY = titlePos.y;
        }
      }
      
      title.setAttribute('x', absoluteTitleX);
      title.setAttribute('y', absoluteTitleY);
      title.setAttribute('text-anchor', 'middle');
      title.setAttribute('font-size', fs);
      title.setAttribute('fill', surfaceTextColor);
      title.textContent = state.labels.title;
      markFontEditable(title, 'graphTitle', 'graphTitle');
      makeEditableHelper(title, text => {
        const previous = state.labels.title || 'Surface Plot';
        const nextValue = applySurfaceTitle(text);
        if(previous === nextValue){ return; }
        recordSurfaceChange('surface:title', previous, nextValue, val => { applySurfaceTitle(val); return true; });
      }, { scopeId: 'surface', key: 'graphTitle' });
      if(typeof Shared.enableLabelDrag === 'function'){
        Shared.enableLabelDrag(title, svg, {
          onDragEnd: pos => {
            // Store both absolute and relative positions
            const relX = (pos.x - margin.left) / plotWidth;
            const relY = (pos.y - margin.top) / plotHeight;
            state.labelPositions.title = { 
              x: pos.x, 
              y: pos.y,
              relX: relX, 
              relY: relY 
            };
            debugLog('Debug: surface title position saved', { absolute: pos, relative: { relX, relY } });
          }
        });
      }
      if(typeof plot3d.applyLegendPointerGuards === 'function'){
        plot3d.applyLegendPointerGuards(title, { label: 'surface-title' });
      }
      title.setAttribute('data-graph-title', '1');
      svg.appendChild(title);
    } else {
      // update position/size and text only
      
      // Convert relative positions to absolute if needed for update
      let absoluteTitleX = titleBaseX;
      let absoluteTitleY = titleBaseY;
      if (titlePos) {
        if (titlePos.relX !== undefined && titlePos.relY !== undefined) {
          // Use relative positioning
          absoluteTitleX = margin.left + titlePos.relX * plotWidth;
          absoluteTitleY = margin.top + titlePos.relY * plotHeight;
        } else if (titlePos.x !== undefined && titlePos.y !== undefined) {
          // Use absolute positioning (backward compatibility)
          absoluteTitleX = titlePos.x;
          absoluteTitleY = titlePos.y;
        }
      }
      
      try{ title.setAttribute('x', absoluteTitleX); }catch(e){}
      try{ title.setAttribute('y', absoluteTitleY); }catch(e){}
      try{ title.setAttribute('font-size', fs); }catch(e){}
      try{ title.setAttribute('fill', surfaceTextColor); }catch(e){}
      if(title.textContent !== state.labels.title){ title.textContent = state.labels.title; }
    }
    if(!hasTitlePos && axisLabelBounds.length && typeof title.getBBox === 'function'){
      try {
        const padding = Math.max(fs * 0.45, 10);
        const minAxisTop = axisLabelBounds.reduce((min, bounds) => (
          Number.isFinite(bounds?.y) ? Math.min(min, bounds.y) : min
        ), Number.POSITIVE_INFINITY);
        if(Number.isFinite(minAxisTop)){
          let titleBox = title.getBBox();
          const desiredBottom = minAxisTop - padding;
          if(Number.isFinite(desiredBottom)){
            const currentBottom = titleBox.y + titleBox.height;
            if(currentBottom > desiredBottom){
              const baseY = Number(title.getAttribute('y')) || titleBaseY;
              const shift = desiredBottom - currentBottom;
              const minTitleY = Math.max(fs * 0.5, 0);
              const nextY = Math.max(minTitleY, baseY + shift);
              title.setAttribute('y', nextY);
              titleBox = title.getBBox();
              const adjustedBottom = titleBox.y + titleBox.height;
              if(adjustedBottom > desiredBottom){
                const correction = desiredBottom - adjustedBottom;
                const correctedY = Math.max(minTitleY, nextY + correction);
                if(correctedY !== nextY){
                  title.setAttribute('y', correctedY);
                  titleBox = title.getBBox();
                }
              }
              debugLog('Debug: surface title vertical adjusted', {
                previousY: baseY,
                adjustedY: Number(title.getAttribute('y')) || baseY,
                desiredBottom,
                padding,
                minAxisTop
              });
            }
          }
        }
      } catch(err){
        debugLog('Debug: surface title bbox adjust error', {
          message: err?.message || String(err)
        });
      }
    }
    // Render legend and capture its dimensions for layout calculations
    let legendDimensions = { width: 0, height: 0 };
    if(state.settings.showLegend && Number.isFinite(parsed.stats.zMin) && Number.isFinite(parsed.stats.zMax) && parsed.stats.zMin !== parsed.stats.zMax){
      const legendPosition = state.labelPositions.legend || state.legendPosition;
      const positionSummary = legendPosition ? `x:${legendPosition.x},y:${legendPosition.y},relX:${legendPosition.relX},relY:${legendPosition.relY}` : 'null';
      console.log(`SURFACE: renderLegend called - position: ${positionSummary}`);
      debugLog('Debug: surface renderLegend called', {
        legendPosition,
        stateLabelPositions: state.labelPositions,
        stateLegendPosition: state.legendPosition
      });
      legendDimensions = renderLegend(svg, {
        min: parsed.stats.zMin,
        max: parsed.stats.zMax,
        colorRamp: state.settings.colorRamp,
        width,
        height,
        margin,
        fontSize: fs,
        layer: axisLayer,
        textColor: surfaceTextColor,
        axisColor: state.settings.axisColor,
        position: legendPosition
      }) || { width: 0, height: 0 };
    } else {
      console.log('SURFACE: removeLegend called');
      removeLegend(svg);
    }
    registerSurfaceGridControlTarget(svg, { fallbackThickness: axisStrokeWidthBase });
    updateStats(parsed.stats);
    state.layout?.syncPanels?.({ skipSchedule: true });
    syncSurfaceAutoDrawNoticeWidth('draw');
    debugLog('Debug: surface draw complete', {
      mode: effectiveMode,
      points: parsed.points.length,
      faces: parsed.faces.length
    });
  }

  surface.draw = () => { runSurfaceDrawCycle(); };

  function initNotes(){
    const stack = global.document.querySelector('#surfaceGraphPanel .surface-plot-stack')
      || global.document.querySelector('#surfaceGraphPanel .diagram-area');
    if(!stack){
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        console.debug('Debug: surface notes mount skipped (missing stack)');
      }
      return;
    }
    const helper = Shared.notes;
    if(!helper || typeof helper.mountFoldable !== 'function'){
      console.warn('surface notes helper unavailable', { hasSharedNotes: !!helper });
      return;
    }
    if(notesState.control?.root && notesState.control.root.isConnected){
      notesState.control.setValue(notesState.text || '');
      notesState.control.setOpen(!!notesState.open);
      return;
    }
    notesState.control = helper.mountFoldable({
      container: stack,
      id: 'surface-notes',
      title: 'Notes',
      placeholder: 'Write notes about the data being analyzed...',
      richText: true,
      scopeId: 'surface',
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

  surface.init = function init(){
    if(surface.ready){
      debugLog('Debug: surface.init skipped', { reason: 'ready' });
      return;
    }
    cacheDom();
    state.scheduleDraw = () => {};
    if(state.renderButton){
      attachListener(state.renderButton, 'click', () => {
        debugLog('Debug: surface manual render button');
        const overlayReason = 'manual-render';
        markSurfaceOverlayPending(overlayReason);
        forceSurfaceOverlay(overlayReason, { message: 'Rendering surface plot...' });
        state.scheduleDraw?.({ force: true, reason: overlayReason });
      });
    }
    state.layout = componentLayout && typeof componentLayout.createStandardPanels === 'function'
      ? componentLayout.createStandardPanels({
        componentName: 'surface',
        selectors: {
          tablePanel: '#surfaceTablePanel',
          graphPanel: '#surfaceGraphPanel',
        panelResizer: '#surfacePanelResizer',
        hotWrapper: '#surfaceHotWrapper',
        hotContainer: '#surfaceHot',
        svgBox: () => global.document.querySelector('#surfaceGraphPanel .svgbox'),
        resizeTarget: () => global.document.querySelector('#surfaceGraphPanel .svgbox')
      },
        scheduleDraw: state.scheduleDraw,
        preserveGraphContent: false,
        panelSyncOptions: {
          disableAutoWidthClamp: true,
          lockGraphPanelWidth: false
        },
        onAfterSync: () => syncSurfaceAutoDrawNoticeWidth('panel-sync'),
        resizableBoxOptions: {
          onResize: () => {
            debugLog('Debug: surface layout onResize schedule trigger');
            scheduleSurfaceNoticeWidth('resize');
            state.scheduleDraw?.({ viewOnly: true, reason: 'resize' });
          }
        }
      })
      : null;
    if(state.layout && typeof state.layout.setScheduleDraw === 'function'){
      state.layout.setScheduleDraw(state.scheduleDraw);
    }
    if(state.layout && state.layout.elements && state.layout.elements.svgBox){
      state.svgBox = state.layout.elements.svgBox;
    }
    if(state.layout && typeof state.layout.syncPanels === 'function'){
      state.layout.syncPanels();
    }
    cacheDom();
    scheduleSurfaceNoticeWidth('init');
    initHot();
    initControls();
    initNotes();
    if(!surfaceAutoDrawManager && Shared.hot?.createAutoDrawManager){
      surfaceAutoDrawManager = Shared.hot.createAutoDrawManager({
        component: 'surface',
        state,
        thresholds: {
          rows: SURFACE_AUTO_DRAW_ROW_THRESHOLD,
          cols: SURFACE_AUTO_DRAW_COL_THRESHOLD,
          cells: SURFACE_AUTO_DRAW_CELL_THRESHOLD
        },
        getHot: () => state.hot,
        elements: {
          renderRow: () => state.renderRow,
          renderButton: () => state.renderButton,
          notice: () => state.autoDrawNotice
        },
        debugLog
      });
    }
    const scheduleSurfaceDrawBase = typeof Shared.debounceFrame === 'function'
      ? Shared.debounceFrame(runSurfaceDrawCycle)
      : (() => setTimeout(runSurfaceDrawCycle, 16));
    const scheduleSurfaceDrawInstrumented = (opts) => {
      const nextOpts = opts || {};
      const overlayReason = nextOpts.reason || (nextOpts.force ? 'manual-render' : 'schedule');
      if(nextOpts.force){
        markSurfaceOverlayPending(overlayReason);
        forceSurfaceOverlay(overlayReason, { message: 'Rendering surface plot...' });
      }else{
        queueSurfaceOverlay(overlayReason);
      }
      const runSchedule = () => scheduleSurfaceDrawBase(nextOpts);
      const shouldDelayForOverlay = surfaceOverlayController?.isActive?.() && !nextOpts.viewOnly;
      if(shouldDelayForOverlay){
        const scheduleAfterPaint = () => {
          debugLog('Debug: surface autoDraw deferred for overlay',{ reason: overlayReason });
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
    scheduleDrawSurfaceRaw = scheduleSurfaceDrawInstrumented;
    if(surfaceAutoDrawManager){
      surfaceAutoDrawManager.setScheduleRaw(scheduleDrawSurfaceRaw);
      surfaceAutoDrawManager.setElements({
        renderRow: state.renderRow,
        renderButton: state.renderButton,
        notice: state.autoDrawNotice
      });
      state.scheduleDraw = (opts) => surfaceAutoDrawManager.schedule(opts);
      surfaceAutoDrawManager.updateUi();
      surfaceAutoDrawManager.evaluateThresholds();
      syncSurfaceAutoDrawNoticeWidth('auto-draw-init');
    }else{
      state.scheduleDraw = scheduleDrawSurfaceRaw;
    }
    if(state.layout && typeof state.layout.setScheduleDraw === 'function'){
      state.layout.setScheduleDraw(state.scheduleDraw);
    }
    if(state.layout && typeof state.layout.syncPanels === 'function'){
      state.layout.syncPanels();
    }
    syncSurfaceAutoDrawNoticeWidth('panel-resync');
    updateAxisOptions();
    ensureEmptyPayloadTemplate();
    surface.ready = true;
    state.scheduleDraw();
  };

  surface.ensure = function ensure(){
    if(!surface.ready){ surface.init(); }
  };
  surface.prepareForTab = function prepareForTab(tab){
    if(!surface.ready){
      surface.init();
      return;
    }
    if(typeof state.ensureHotForActiveTab === 'function'){
      const hot = state.ensureHotForActiveTab();
      if(hot){
        ensureSurfaceDataViewsForHot(hot, {
          wrapper: global.document?.getElementById?.('surfaceHotWrapper') || null,
          container: hot.__surfaceHostContainer || global.document?.getElementById?.('surfaceHot') || null
        });
        syncSurfaceActiveDataViewFromHot(hot, 'prepare-tab');
      }
    }
    cacheDom();
    const cacheSignature = tab?.renderCacheSignature ?? tab?.renderCache?.payloadSignature ?? null;
    const layoutSignature = tab?.renderCacheLayoutSignature ?? tab?.renderCache?.layoutSignature ?? null;
    const canRestore = !!(tab && tab.renderCache && tab.renderCache.cache
      && cacheSignature === (tab.payloadSignature ?? null)
      && layoutSignature === (tab.layoutSignature ?? null));
    if(canRestore){
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        debugLog('Debug: surface prepareForTab skipped clear (render cache)', { tabId: tab?.id || null });
      }
      return;
    }
    // When switching to a tab, ensure any prior rendered geometry is cleared
    try{
      if(state.svg){
        const geometryLayer = state.svg.querySelector && state.svg.querySelector('g.surface-layer-geometry');
        if(geometryLayer){
          const faceGroup = geometryLayer.querySelector && geometryLayer.querySelector('g.surface-faces');
          const pointGroup = geometryLayer.querySelector && geometryLayer.querySelector('g.surface-points');
          try{ if(faceGroup){ while(faceGroup.firstChild){ faceGroup.removeChild(faceGroup.firstChild); } } }catch(e){}
          try{ if(pointGroup){ while(pointGroup.firstChild){ pointGroup.removeChild(pointGroup.firstChild); } } }catch(e){}
        }
        // reset pools so we don't reuse nodes from previous tab
        try{ if(Array.isArray(state._facePool)){ state._facePool.length = 0; state._facePoolUsed = 0; } }catch(e){}
        try{ if(Array.isArray(state._pointPool)){ state._pointPool.length = 0; state._pointPoolUsed = 0; } }catch(e){}
      }
    }catch(e){ debugLog('Debug: surface prepareForTab clear failed', { message: e?.message || String(e) }); }
    // schedule a fresh draw for the active tab
    state.scheduleDraw?.();
  };

  function applySurfacePayload(payload, meta){
    const source = meta?.source || 'unknown';
    if(!payload || payload.type !== 'surface'){
      debugLog('Debug: surface payload rejected', { source, hasType: !!payload?.type });
      return false;
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
      ? ensureSurfaceDataViewsForHot(state.hot, {
          wrapper: global.document?.getElementById?.('surfaceHotWrapper') || null,
          container: state.hot.__surfaceHostContainer || global.document?.getElementById?.('surfaceHot') || null
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
      syncSurfaceActiveDataViewFromHot(state.hot, 'payload-load');
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
    if(config.axisMap && typeof config.axisMap === 'object'){
      state.axisMap = Object.assign({}, state.axisMap, config.axisMap);
    }
    if(config.settings && typeof config.settings === 'object'){
      state.settings = Object.assign({}, state.settings, config.settings);
    }
    if(typeof config.colorScheme === 'string' && config.colorScheme.trim()){
      state.settings.colorScheme = config.colorScheme.trim().toLowerCase();
    }
    if(typeof config.textColor === 'string' && config.textColor.trim()){
      state.settings.textColor = config.textColor.trim();
    }
    if(typeof config.backgroundColor === 'string' && config.backgroundColor.trim()){
      state.settings.backgroundColor = config.backgroundColor.trim();
    }
    setGridStyle(config.gridStyle, config.settings?.axisStroke ?? state.settings?.axisStroke);
    if(config.labels && typeof config.labels === 'object'){
      state.labels = Object.assign({}, state.labels, config.labels);
    }
    // Handle legacy legendPosition field for backward compatibility
    if(Object.prototype.hasOwnProperty.call(config, 'legendPosition')){
      const pos = config.legendPosition;
      const x = Number(pos?.x);
      const y = Number(pos?.y);
      const relX = Number(pos?.relX);
      const relY = Number(pos?.relY);
      if(Number.isFinite(x) && Number.isFinite(y)) {
        state.labelPositions.legend = { 
          x, 
          y,
          relX: Number.isFinite(relX) ? relX : undefined,
          relY: Number.isFinite(relY) ? relY : undefined
        };
        // Also set legacy field for backward compatibility
        state.legendPosition = state.labelPositions.legend;
      }
    }
    if(config.labelPositions && typeof config.labelPositions === 'object'){
      const titlePos = config.labelPositions.title;
      const x = Number(titlePos?.x);
      const y = Number(titlePos?.y);
      state.labelPositions.title = (Number.isFinite(x) && Number.isFinite(y)) ? { x, y } : null;
    }
    ensureHeaderRowFromConfig(config);
    if(config.rotation && typeof plot3d.createRotationState === 'function'){
      const restored = plot3d.createRotationState(config.rotation);
      state.rotation.x = restored.x;
      state.rotation.y = restored.y;
      state.rotation.z = restored.z;
      state.rotation.quaternion = restored.quaternion ? {
        w: restored.quaternion.w,
        x: restored.quaternion.x,
        y: restored.quaternion.y,
        z: restored.quaternion.z
      } : state.rotation.quaternion;
    }
    if(config.fontStyles){
      importFontStyles('surface', config.fontStyles);
    }
    applySettingsToControls();
    updateAxisOptions();
    if(!skipDraw){
      state.lastStats = null;
      updateStats(null);
      if(typeof state.scheduleDraw === 'function'){
        state.scheduleDraw();
      }
    }
    if(scheduleBackup){
      state.scheduleDraw = scheduleBackup;
    }
    const rowCount = Array.isArray(dataToLoad) ? dataToLoad.length : 0;
    debugLog('Debug: surface payload applied', { source, rows: rowCount });
    return true;
  }

  function getPayload(){
    const activeHot = state.hot || state.ensureHotForActiveTab?.();
    if(!activeHot || typeof activeHot.getData !== 'function'){
      return { type: 'surface', data: [] };
    }
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
      type: 'surface',
      data: activeHot.getData(),
      exclusions: activeHot.exportExclusions ? activeHot.exportExclusions() : (Shared.hot && typeof Shared.hot.exportExclusions === 'function' ? Shared.hot.exportExclusions(activeHot) : undefined),
      config: {
        axisMap: Object.assign({}, state.axisMap),
        colorScheme: state.settings?.colorScheme || 'scientific',
        textColor: state.settings?.textColor || (chartStyle.TEXT_COLOR || '#1f2a3d'),
        backgroundColor: state.settings?.backgroundColor || '#ffffff',
        settings: Object.assign({}, state.settings),
        gridStyle: getGridStyle(state.settings?.axisStroke),
        labels: Object.assign({}, state.labels),
        // Also save legacy field for backward compatibility
        legendPosition: state.legendPosition ? { 
          x: state.legendPosition.x, 
          y: state.legendPosition.y,
          relX: state.legendPosition.relX,
          relY: state.legendPosition.relY
        } : null,
        labelPositions: {
          title: state.labelPositions?.title ? { x: state.labelPositions.title.x, y: state.labelPositions.title.y } : null
        },
        rotation: {
          x: state.rotation.x,
          y: state.rotation.y,
          z: state.rotation.z,
          quaternion: state.rotation.quaternion ? {
            w: state.rotation.quaternion.w,
            x: state.rotation.quaternion.x,
            y: state.rotation.quaternion.y,
            z: state.rotation.quaternion.z
          } : null
        },
        fontStyles: exportFontStyles ? exportFontStyles('surface') : undefined,
        notes: {
          text: notesText,
          open: notesOpen
        }
      }
    };
    const activeManager = ensureSurfaceDataViewsForHot(activeHot, {
      wrapper: global.document?.getElementById?.('surfaceHotWrapper') || null,
      container: activeHot.__surfaceHostContainer || global.document?.getElementById?.('surfaceHot') || null
    });
    syncSurfaceActiveDataViewFromHot(activeHot, 'payload');
    const dataViewsPayload = activeManager?.serialize?.({ includeData: true }) || null;
    const includeDataViews = !!(dataViewsPayload && Array.isArray(dataViewsPayload.views) && dataViewsPayload.views.length > 1);
    if(includeDataViews){
      payload.dataViews = dataViewsPayload;
      payload.activeDataViewId = dataViewsPayload?.activeViewId || null;
    }
    debugLog('Debug: surface payload captured', { rows: payload.data.length });
    return payload;
  }

  surface.getPayload = getPayload;
  surface.captureEmptyPayloadTemplate = function captureSurfaceEmptyPayloadTemplate(){
    ensureEmptyPayloadTemplate();
    const snapshot = cloneSimple(emptyPayloadTemplate);
    console.debug('Debug: surface empty payload template captured', { hasTemplate: !!snapshot });
    return snapshot;
  };
  surface.restoreEmptyPayloadTemplate = function restoreSurfaceEmptyPayloadTemplate(template, options = {}){
    if(!template || typeof template !== 'object'){
      console.debug('Debug: surface empty payload template restore skipped', { reason: 'invalid-template', options });
      return false;
    }
    emptyPayloadTemplate = cloneSimple(template);
    console.debug('Debug: surface empty payload template restored', { hasTemplate: !!emptyPayloadTemplate, reason: options.reason || 'unspecified' });
    return !!emptyPayloadTemplate;
  };
  surface.createEmptyPayload = function createEmptySurfacePayload(){
    surface.ensure();
    ensureEmptyPayloadTemplate();
    const payload = cloneSimple(emptyPayloadTemplate) || { type: 'surface', config: {} };
    payload.type = 'surface';
    const createEmpty = Shared.createEmptyData;
    const emptyData = typeof createEmpty === 'function'
      ? createEmpty(DEFAULT_ROWS, DEFAULT_COLS)
      : Array.from({ length: DEFAULT_ROWS }, () => Array(DEFAULT_COLS).fill(''));
    payload.data = emptyData;
    payload.exclusions = [];
    return payload;
  };

  surface.save = async function save(){
    if(!fileIO || typeof fileIO.saveGraphFile !== 'function'){
      console.error('surface.save missing Shared.fileIO.saveGraphFile');
      return;
    }
    const result = await fileIO.saveGraphFile({
      context: 'surface',
      fileHandle: state.fileHandle,
      getPayload,
      fileName: state.fileName,
      downloadFileName: state.fileName,
      setFileHandle: handle => { state.fileHandle = handle; },
      setFileName: name => { state.fileName = name; }
    });
    debugLog('Debug: surface save result', result);
  };

  surface.saveAs = async function saveAs(){
    if(!fileIO || typeof fileIO.saveGraphFileAs !== 'function'){
      console.error('surface.saveAs missing Shared.fileIO.saveGraphFileAs');
      return;
    }
    const result = await fileIO.saveGraphFileAs({
      context: 'surface',
      getPayload,
      fileName: state.fileName,
      downloadFileName: state.fileName,
      setFileHandle: handle => { state.fileHandle = handle; },
      setFileName: name => { state.fileName = name; }
    });
    debugLog('Debug: surface saveAs result', result);
  };

  surface.open = async function open(){
    if(!fileIO || typeof fileIO.openGraphFile !== 'function'){
      console.error('surface.open missing Shared.fileIO.openGraphFile');
      return;
    }
    const result = await fileIO.openGraphFile({
      context: 'surface',
      setFileHandle: handle => { state.fileHandle = handle; },
      setFileName: name => { state.fileName = name; },
      loadFromFile: blob => surface.loadFromFile(blob),
      triggerInput: () => {
        if(state.controls.graphFileInput){
          state.controls.graphFileInput.value = '';
          state.controls.graphFileInput.click();
        }
      }
    });
    debugLog('Debug: surface open result', result);
  };

  surface.loadFromFile = function loadFromFile(file){
    const apply = payload => applySurfacePayload(payload, { source: 'file' });
    if(file instanceof Blob){
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target.result);
          if(!apply(parsed)){
            console.warn('surface payload rejected from file', { hasType: !!parsed?.type });
          }
        } catch(err){
          console.error('surface load parse error', err);
        }
      };
      reader.readAsText(file);
      return;
    }
    if(typeof file === 'string'){
      try {
        const parsed = JSON.parse(file);
        if(!apply(parsed)){
          console.warn('surface payload rejected from string');
        }
      } catch(err){
        console.error('surface load string parse error', err);
      }
      return;
    }
    if(file && typeof file === 'object'){
      apply(file);
    }
  };

  surface.loadFromPayload = function loadFromPayload(payload, options = {}){
    if(!applySurfacePayload(payload, { source: 'payload', ...options })){
      console.warn('surface payload application failed', { source: 'payload' });
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

  surface.captureRenderCache = function captureRenderCache(){
    cacheDom();
    const svgCache = detachChildren(state.svg);
    const statsCache = detachChildren(state.statsEl);
    const messageCache = detachChildren(state.messageEl);
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      debugLog('Debug: surface render cache captured', {
        svgNodes: svgCache?.count || 0,
        statsNodes: statsCache?.count || 0,
        messageNodes: messageCache?.count || 0
      });
    }
    return { svg: svgCache, stats: statsCache, message: messageCache };
  };

  surface.restoreRenderCache = function restoreRenderCache(cache){
    if(!cache){ return false; }
    cacheDom();
    const restoredSvg = restoreChildren(state.svg, cache.svg);
    const restoredStats = restoreChildren(state.statsEl, cache.stats);
    const restoredMessage = restoreChildren(state.messageEl, cache.message);
    const restored = restoredSvg || restoredStats || restoredMessage;
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      debugLog('Debug: surface render cache restored', {
        restored,
        svg: restoredSvg,
        stats: restoredStats,
        message: restoredMessage
      });
    }
    return restored;
  };

  surface.__getState = () => state;

  surface.destroy = function destroy(){
    try{
      if(state.layout && typeof state.layout.destroy === 'function'){
        try{ state.layout.destroy(); }catch(e){ debugLog('Debug: surface layout.destroy failed', { message: e?.message || String(e) }); }
      }
      // remove any DOM listeners we attached
      try{
        if(Array.isArray(state._listeners)){
          for(let i = 0; i < state._listeners.length; i += 1){
            const rec = state._listeners[i];
            try{ if(rec && rec.node && typeof rec.node.removeEventListener === 'function'){ rec.node.removeEventListener(rec.type, rec.handler, rec.options); } }catch(e){ /* ignore */ }
          }
        }
      }catch(e){ /* ignore */ }

      // remove registered hot hooks
      try{
        if(Array.isArray(state._hotHooks) && state.hot){
          for(let i = 0; i < state._hotHooks.length; i += 1){
            const h = state._hotHooks[i];
            try{ if(h && typeof state.hot.removeHook === 'function'){ state.hot.removeHook(h.name, h.fn); } }catch(e){ /* ignore */ }
          }
        }
      }catch(e){ /* ignore */ }
      if(surfaceAutoDrawManager){
        try{
          if(typeof surfaceAutoDrawManager.dispose === 'function'){
            surfaceAutoDrawManager.dispose();
          } else if(typeof surfaceAutoDrawManager.destroy === 'function'){
            surfaceAutoDrawManager.destroy();
          }
        }catch(e){ debugLog('Debug: surface autoDrawManager cleanup failed', { message: e?.message || String(e) }); }
        surfaceAutoDrawManager = null;
      }
      if(state.svg){
        try{ while(state.svg.firstChild){ state.svg.removeChild(state.svg.firstChild); } }catch(e){ /* noop */ }
      }
      // clear pooled elements arrays
      try{ if(Array.isArray(state._facePool)){ state._facePool.length = 0; state._facePoolUsed = 0; } }catch(e){}
      try{ if(Array.isArray(state._pointPool)){ state._pointPool.length = 0; state._pointPoolUsed = 0; } }catch(e){}
      try{ resolveSurfaceOverlay('destroy'); }catch(e){}
      if(fontControls && typeof fontControls.disableForSvg === 'function'){
        try{ fontControls.disableForSvg(state.svg, { scopeId: 'surface' }); }catch(e){}
      }
      // clear heavy references to allow GC
      state.hot = null;
      state.layout = null;
      state.svg = null;
      state.svgBox = null;
      state.statsEl = null;
      state.messageEl = null;
      state.exportContainer = null;
      state.renderRow = null;
      state.renderButton = null;
      state.autoDrawNotice = null;
      state.scheduleDraw = () => {};
      state.controls = {};
      state.axisSelects = { x: null, y: null, z: null };
      state.axisMap = { x: 0, y: 1, z: 2 };
      // clear cached color factories
      try{ if(colorScaleFactory._cache && typeof colorScaleFactory._cache.clear === 'function'){ colorScaleFactory._cache.clear(); } }catch(e){}
      surface.ready = false;
      debugLog('Debug: surface destroyed');
    }catch(err){
      console.error('surface.destroy error', err);
    }
  };

  if(typeof module !== 'undefined' && module.exports){
    module.exports = surface;
  }

})(window);
