(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};
  const heatmap = Components.heatmap = Components.heatmap || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  const fontControls = Shared.fontControls = Shared.fontControls || {};
  const exportFontStyles = scopeId => (fontControls && typeof fontControls.exportScopeStyles === 'function')
    ? fontControls.exportScopeStyles(scopeId)
    : null;
  const importFontStyles = (scopeId, styles) => {
    if(fontControls && typeof fontControls.importScopeStyles === 'function'){
      fontControls.importScopeStyles(scopeId, styles, { prune: true });
    }
  };
  const formControls = Shared.formControls = Shared.formControls || {};
  heatmap.__installed = true;
  heatmap.ready = false;

  function debugLog(label, payload){
    try{
      if(typeof Shared.isDebugEnabled === 'function' && !Shared.isDebugEnabled()){
        return;
      }
    }catch(err){
      // Ignore toggle errors and log by default
    }
    if(typeof console !== 'undefined' && typeof console.debug === 'function'){
      console.debug(label, payload);
    }
  }

  const nowMs = () => {
    if(global.performance && typeof global.performance.now === 'function'){
      return global.performance.now();
    }
    return Date.now();
  };

  const fileIO = Shared.fileIO = Shared.fileIO || {};
  if(!fileIO.saveGraphFile){
    console.debug('Debug: heatmap component awaiting Shared.fileIO helpers');
  }
  if(!Shared.tableImport || typeof Shared.tableImport.openFile !== 'function'){
    console.debug('Debug: heatmap component awaiting Shared.tableImport helpers');
  }

  const ensureGraphViewport = Shared.graphViewport?.createEnsurer
    ? Shared.graphViewport.createEnsurer('heatmap')
    : (svg, options = {}) => {
      const fn = Shared.ensureGraphViewport || Shared.autoResizeSvg || global.ensureGraphViewport || global.autoResizeSvg;
      if(typeof fn === 'function'){
        fn(svg, { component: 'heatmap', debugLabel: 'heatmap-viewport-fallback', ...options });
        return;
      }
      console.debug('Debug: heatmap ensureGraphViewport helper missing', {
        hasShared: !!Shared,
        hasAutoResize: typeof Shared?.autoResizeSvg === 'function'
      });
    };
  console.debug('Debug: heatmap graph viewport helper configured', {
    hasGraphViewport: typeof Shared.graphViewport?.ensure === 'function',
    usesFactory: typeof Shared.graphViewport?.createEnsurer === 'function'
  });

  const DEFAULT_ROWS = 100;
  const DEFAULT_COLS = 6;
  const NS = 'http://www.w3.org/2000/svg';
  const COLUMN_LABEL_VERTICAL_ANGLE = 90;
  const HEATMAP_AUTO_DRAW_ROW_THRESHOLD = 5000;
  const HEATMAP_AUTO_DRAW_COL_THRESHOLD = 5000;
  const HEATMAP_AUTO_DRAW_CELL_THRESHOLD = 50000;

  let heatmapRenderRowEl = null;
  let heatmapRenderButtonEl = null;
  let heatmapAutoDrawNoticeEl = null;

  const state = {
    hot: null,
    scheduleDraw: () => {},
    fileHandle: null,
    fileName: 'correlation-heatmap.graph',
    svg: null,
    svgBox: null,
    statsEl: null,
    layout: null,
    minSvgWidth: 0,
    autoDrawEnabled: true,
    autoDrawReason: null,
    autoDrawLockedByThreshold: false,
    drawPending: false,
    lastDataShape: { rows: 0, cols: 0 },
    lastAutoDrawEvaluation: null,
    lastRenderModel: null,
    lastViewOptions: null,
    lastStats: null
  };

  const refs = {};

  let scheduleDrawHeatmapRaw = () => {};
  let pendingDrawOptions = {};

  function clearCachedRenderState(){
    state.lastRenderModel = null;
    state.lastViewOptions = null;
    state.lastStats = null;
    if(!state.drawPending){
      debugLog('Debug: heatmap cached render cleared');
    }
  }

  function normalizeDrawOptions(options){
    if(!options){
      return {};
    }
    if(typeof options === 'string'){
      return { reason: options };
    }
    if(typeof options === 'object'){
      return options;
    }
    return {};
  }

  function mergePendingDrawOptions(opts){
    const previous = pendingDrawOptions || {};
    if(!opts || typeof opts !== 'object'){
      if(previous.viewOnly){
        pendingDrawOptions = { ...previous };
        return;
      }
      pendingDrawOptions = {};
      return;
    }
    const next = { ...previous, ...opts };
    if(opts.force){
      next.viewOnly = false;
    }else if(Object.prototype.hasOwnProperty.call(opts, 'viewOnly')){
      next.viewOnly = !!opts.viewOnly;
    }else if(previous.viewOnly){
      next.viewOnly = true;
    }else{
      next.viewOnly = false;
    }
    if(!Object.prototype.hasOwnProperty.call(opts, 'reason') && previous.viewOnly && next.viewOnly){
      next.reason = previous.reason;
    }
    pendingDrawOptions = next;
  }

  function updateHeatmapDataShape(shape){
    if(!shape || typeof shape !== 'object'){
      return;
    }
    const rows = Number(shape.rows);
    const cols = Number(shape.cols);
    const normalizedRows = Number.isFinite(rows) ? rows : state.lastDataShape.rows;
    const normalizedCols = Number.isFinite(cols) ? cols : state.lastDataShape.cols;
    if(normalizedRows === state.lastDataShape.rows && normalizedCols === state.lastDataShape.cols){
      return;
    }
    state.lastDataShape = { rows: normalizedRows, cols: normalizedCols };
    debugLog('Debug: heatmap data shape updated', { rows: normalizedRows, cols: normalizedCols });
  }

  function setAutoDrawEnabled(enabled, meta = {}){
    const nextEnabled = !!enabled;
    const previousEnabled = !!state.autoDrawEnabled;
    let disabledNow = false;
    state.autoDrawEnabled = nextEnabled;
    if(!nextEnabled){
      if(previousEnabled && meta.renderImmediate !== false){
        disabledNow = true;
      }
      if(meta.reason === 'threshold'){
        const rows = Number(meta.rows ?? meta.totalRows);
        const cols = Number(meta.cols ?? meta.totalCols);
        state.autoDrawReason = {
          type: 'threshold',
          rows: Number.isFinite(rows) ? rows : null,
          cols: Number.isFinite(cols) ? cols : null
        };
      }else if(meta.reason){
        state.autoDrawReason = { type: meta.reason };
      }else if(!state.autoDrawReason){
        state.autoDrawReason = { type: 'manual' };
      }
    }else if(meta.reason === 'threshold-cleared' || !meta.preserveReason){
      state.autoDrawReason = null;
    }
    if(nextEnabled){
      state.drawPending = false;
    }
    updateAutoDrawUi(meta);
    if(previousEnabled !== nextEnabled){
      debugLog('Debug: heatmap autoDraw toggled', {
        enabled: nextEnabled,
        reason: meta.reason || null
      });
    }
    return {
      changed: previousEnabled !== nextEnabled,
      disabledNow
    };
  }

  function updateAutoDrawUi(){
    const manualMode = !state.autoDrawEnabled;
    const pendingWhileAuto = !manualMode && !!state.drawPending;
    const shouldShowRenderRow = manualMode || pendingWhileAuto;
    if(heatmapRenderRowEl && heatmapRenderRowEl.hidden === shouldShowRenderRow){
      heatmapRenderRowEl.hidden = !shouldShowRenderRow;
    }
    if(heatmapRenderButtonEl){
      const shouldDisable = !manualMode && !state.drawPending;
      if(heatmapRenderButtonEl.disabled !== shouldDisable){
        heatmapRenderButtonEl.disabled = shouldDisable;
      }
      if(heatmapRenderButtonEl.hidden === shouldShowRenderRow){
        heatmapRenderButtonEl.hidden = !shouldShowRenderRow;
      }
    }
    if(heatmapAutoDrawNoticeEl){
      let text = '';
      let hidden = !shouldShowRenderRow;
      if(!hidden && manualMode){
        const reason = state.autoDrawReason?.type || 'manual';
        if(reason === 'threshold'){
          const rows = state.autoDrawReason?.rows;
          const summary = Number.isFinite(rows) ? ` (${rows.toLocaleString()} rows)` : '';
          text = `Live updates are paused for large datasets${summary}. Use Update Plot after making changes.`;
        }else{
          text = 'Live updates are disabled. Use Update Plot after making changes.';
        }
        if(state.drawPending){
          text += ' Changes are waiting to be rendered.';
        }
      }else if(!hidden && pendingWhileAuto){
        hidden = false;
        text = 'Changes are waiting to be rendered. Use Update Plot to redraw immediately.';
      }
      heatmapAutoDrawNoticeEl.textContent = text;
      heatmapAutoDrawNoticeEl.hidden = hidden || !text;
    }
  }

  function evaluateAutoDrawThresholds(meta = {}){
    const hot = state.hot;
    const perfStart = nowMs();
    if(!hot){
      return { autoDrawEnabled: state.autoDrawEnabled, disabledNow: false, reason: null };
    }
    let totalRows = Number(meta?.shape?.rows);
    let totalCols = Number(meta?.shape?.cols);
    if(!Number.isFinite(totalRows) || totalRows < 0){
      if(typeof hot.countSourceRows === 'function'){
        totalRows = hot.countSourceRows();
      }else if(typeof hot.getSourceData === 'function'){
        const source = hot.getSourceData();
        totalRows = Array.isArray(source) ? source.length : 0;
      }else if(typeof hot.countRows === 'function'){
        totalRows = hot.countRows();
      }else{
        totalRows = state.lastDataShape.rows;
      }
    }
    if(!Number.isFinite(totalCols) || totalCols < 0){
      if(typeof hot.countSourceCols === 'function'){
        totalCols = hot.countSourceCols();
      }else if(typeof hot.getSourceData === 'function'){
        const source = hot.getSourceData();
        const firstRow = Array.isArray(source) && source.length ? source[0] : null;
        totalCols = Array.isArray(firstRow) ? firstRow.length : 0;
      }else if(typeof hot.countCols === 'function'){
        totalCols = hot.countCols();
      }else{
        totalCols = state.lastDataShape.cols;
      }
    }
    const cellEstimate = Math.max(0, totalRows) * Math.max(1, totalCols);
    const thresholdExceeded = totalRows >= HEATMAP_AUTO_DRAW_ROW_THRESHOLD
      || totalCols >= HEATMAP_AUTO_DRAW_COL_THRESHOLD
      || cellEstimate >= HEATMAP_AUTO_DRAW_CELL_THRESHOLD;
    state.lastAutoDrawEvaluation = {
      totalRows,
      totalCols,
      cellEstimate,
      thresholdExceeded,
      totalMs: nowMs() - perfStart
    };
    updateHeatmapDataShape({ rows: totalRows, cols: totalCols });
    debugLog('Debug: heatmap autoDraw evaluation', state.lastAutoDrawEvaluation);
    if(thresholdExceeded){
      state.autoDrawLockedByThreshold = true;
      const toggleResult = setAutoDrawEnabled(false, {
        reason: 'threshold',
        rows: totalRows,
        cols: totalCols,
        preserveReason: true
      });
      return {
        autoDrawEnabled: state.autoDrawEnabled,
        disabledNow: !!toggleResult?.disabledNow,
        reason: 'threshold'
      };
    }
    const previouslyLocked = !!state.autoDrawLockedByThreshold;
    state.autoDrawLockedByThreshold = false;
    if(previouslyLocked){
      setAutoDrawEnabled(true, { reason: 'threshold-cleared', preserveReason: false });
    }
    return { autoDrawEnabled: state.autoDrawEnabled, disabledNow: false, reason: null };
  }

  function scheduleDrawHeatmap(options){
    const opts = normalizeDrawOptions(options);
    mergePendingDrawOptions(opts);
    if(opts.viewOnly){
      if(typeof scheduleDrawHeatmapRaw === 'function'){
        scheduleDrawHeatmapRaw();
      }
      return;
    }
    if(opts.force){
      if(!opts.skipThresholdEvaluation){
        evaluateAutoDrawThresholds();
      }
      state.drawPending = false;
      updateAutoDrawUi();
      if(typeof scheduleDrawHeatmapRaw === 'function'){
        scheduleDrawHeatmapRaw();
      }
      return;
    }
    const evalResult = evaluateAutoDrawThresholds({ markPending: true });
    if(evalResult?.disabledNow){
      state.drawPending = false;
      updateAutoDrawUi();
      if(typeof scheduleDrawHeatmapRaw === 'function'){
        scheduleDrawHeatmapRaw();
      }
      return;
    }
    if(!state.autoDrawEnabled){
      state.drawPending = true;
      updateAutoDrawUi();
      debugLog('Debug: heatmap draw suppressed', { reason: opts.reason || 'auto-draw-disabled' });
      return;
    }
    state.drawPending = false;
    updateAutoDrawUi();
    if(typeof scheduleDrawHeatmapRaw === 'function'){
      scheduleDrawHeatmapRaw();
    }
  }

  state.scheduleDraw = (opts) => scheduleDrawHeatmap(opts);

  function attachHeatmapSelectAutoSize(select, label){
    if(!select){ return; }
    const debugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
    const watcher = typeof formControls.watchSelectAutoSize === 'function' ? formControls.watchSelectAutoSize : null;
    const autoSizer = typeof formControls.autoSizeSelect === 'function' ? formControls.autoSizeSelect : null;
    const contextLabel = label || 'heatmap';
    try{
      if(watcher){
        watcher(select);
        if(debugEnabled){
          console.debug('Debug: heatmap select auto-size watcher attached', {
            id: select.id || null,
            label: contextLabel
          });
        }
      }else if(autoSizer){
        autoSizer(select);
        if(debugEnabled){
          console.debug('Debug: heatmap select auto-size applied without watcher', {
            id: select.id || null,
            label: contextLabel
          });
        }
      }else if(debugEnabled){
        console.debug('Debug: heatmap select auto-size helper unavailable', {
          id: select.id || null,
          label: contextLabel
        });
      }
    }catch(err){
      if(debugEnabled){
        console.debug('Debug: heatmap select auto-size attach error', {
          id: select.id || null,
          label: contextLabel,
          error: err?.message || String(err)
        });
      }
    }
  }

  const markFontEditable = (node, role, key) => {
    if(!node){ return; }
    const payload = { role: role || null, key: key || role || null, text: node?.textContent || null };
    if(fontControls && typeof fontControls.markText === 'function'){
      fontControls.markText(node, { scopeId: 'heatmap', role, key });
    } else if(node.dataset){
      node.dataset.fontEditable = '1';
      node.dataset.fontScope = 'heatmap';
      if(role){ node.dataset.fontRole = role; }
      if(key || role){ node.dataset.fontKey = key || role; }
    }
    if(role && (role === 'cellValue' || role.includes('Tick'))){ return; }
    console.debug('Debug: heatmap font mark applied', payload); // Debug: font tagging summary
  };

  function $(id){
    return global.document.getElementById(id);
  }

  function initHot(){
    const container = $('heatmapHot');
    if(typeof Shared.hot?.createStandardTable !== 'function'){
      console.error('heatmap initHot missing Shared.hot.createStandardTable');
      return;
    }
    const data = Shared.createEmptyData ? Shared.createEmptyData(DEFAULT_ROWS, DEFAULT_COLS) : [];
    console.debug('Debug: heatmap initHot using shared factory', { hasDataHelper: !!Shared.createEmptyData });
    state.hot = Shared.hot.createStandardTable(container, { rows: DEFAULT_ROWS, cols: DEFAULT_COLS }, () => state.scheduleDraw(), {
      debugLabel: 'heatmap',
      data,
      scheduleOnLoadData: true,
      hotOptions: {
        stretchH: 'all',
        minSpareRows: 5,
        afterChange(changes, source){
          if(changes && source !== 'loadData'){
            console.log('heatmap afterChange', { count: changes.length, source });
          }
        },
        afterUndo(){
          console.log('heatmap undo');
        },
        afterRedo(){
          console.log('heatmap redo');
        }
      }
    });
  }

  function clampDecimals(value){
    const num = Number(value);
    if(!Number.isFinite(num)) return 2;
    return Math.min(6, Math.max(0, Math.round(num)));
  }

  function getCheckedRadioValue(name){
    const checked = global.document.querySelector(`input[name="${name}"]:checked`);
    if(checked){
      console.debug('Debug: heatmap radio value read', { name, value: checked.value });
      return checked.value;
    }
    console.debug('Debug: heatmap radio value missing', { name });
    return null;
  }

  function initControls(){
    refs.view = $('heatmapView');
    refs.method = $('heatmapMethod');
    refs.absValues = $('heatmapAbsValues');
    refs.maskLower = $('heatmapMaskLower');
    refs.showValues = $('heatmapShowValues');
    refs.decimals = $('heatmapDecimals');
    refs.colorNegative = $('heatmapColorNegative');
    refs.colorZero = $('heatmapColorZero');
    refs.colorPositive = $('heatmapColorPositive');
    refs.cellSize = $('heatmapCellSize');
    refs.cellSizeVal = $('heatmapCellSizeVal');
    refs.labelAngle = $('heatmapLabelAngle');
    refs.fontSize = $('heatmapFontSize');
    refs.fontSizeVal = $('heatmapFontSizeVal');
    refs.filterPresentEnable = $('heatmapFilterPresentEnable');
    refs.filterPresentValue = $('heatmapFilterPresentValue');
    refs.filterSdEnable = $('heatmapFilterSdEnable');
    refs.filterSdValue = $('heatmapFilterSdValue');
    refs.filterAbsEnable = $('heatmapFilterAbsEnable');
    refs.filterAbsCount = $('heatmapFilterAbsCount');
    refs.filterAbsValue = $('heatmapFilterAbsValue');
    refs.filterRangeEnable = $('heatmapFilterRangeEnable');
    refs.filterRangeValue = $('heatmapFilterRangeValue');
    refs.logTransform = $('heatmapLogTransform');
    refs.centerGenes = $('heatmapCenterGenes');
    refs.centerArrays = $('heatmapCenterArrays');
    refs.normalizeGenes = $('heatmapNormalizeGenes');
    refs.normalizeArrays = $('heatmapNormalizeArrays');
    refs.clusterGenes = $('heatmapClusterGenes');
    refs.clusterArrays = $('heatmapClusterArrays');
    refs.genesMetric = $('heatmapGenesMetric');
    refs.arraysMetric = $('heatmapArraysMetric');
    refs.linkage = $('heatmapLinkage');
    const heatmapAutoSizeTargets=[
      refs.view,
      refs.method,
      refs.genesMetric,
      refs.arraysMetric,
      refs.linkage
    ];
    heatmapAutoSizeTargets.filter(Boolean).forEach(select=>{
      attachHeatmapSelectAutoSize(select, 'heatmap');
    });
    refs.showRowDendrogram = $('heatmapShowRowDendrogram');
    refs.showColumnDendrogram = $('heatmapShowColumnDendrogram');
    if(refs.labelAngle){
      refs.labelAngle.value = String(COLUMN_LABEL_VERTICAL_ANGLE);
      refs.labelAngle.setAttribute('disabled', 'disabled');
      refs.labelAngle.setAttribute('title', 'Column labels render vertically to avoid overlap.');
      console.debug('Debug: heatmap label angle control locked vertical', {
        enforced: COLUMN_LABEL_VERTICAL_ANGLE
      });
    }
    state.statsEl = $('heatmapStatsContent');

    if(refs.cellSizeVal && refs.cellSize){
      refs.cellSizeVal.textContent = refs.cellSize.value;
    }
    if(refs.fontSize?.dataset){
      refs.fontSize.dataset.fontBasePt = String(refs.fontSize.value);
      console.debug('Debug: heatmap font size base initialized', { value: refs.fontSize.value });
    }
    chartStyle.renderFontSizeLabel({ element: refs.fontSizeVal, pt: Number(refs.fontSize?.value || 12), input: refs.fontSize, manual: true });

    const schedule = () => state.scheduleDraw();
    const scheduleViewOnly = reason => state.scheduleDraw({ viewOnly: true, reason });

    const updateViewControlState = () => {
      const view = refs.view?.value || 'corr-columns';
      const isCorrelation = view.startsWith('corr');
      if(refs.method){
        refs.method.disabled = !isCorrelation;
      }
      if(refs.absValues){
        refs.absValues.disabled = !isCorrelation;
        if(!isCorrelation){
          refs.absValues.checked = false;
        }
      }
      if(refs.maskLower){
        refs.maskLower.disabled = !isCorrelation;
        if(!isCorrelation){
          refs.maskLower.checked = false;
        }
      }
      if(refs.showValues){
        refs.showValues.disabled = false;
      }
      console.debug('Debug: heatmap view state updated', { view, isCorrelation });
    };

    const registerFilter = (enableEl, valueEls = []) => {
      if(!enableEl) return;
      const toggle = () => {
        const disabled = !enableEl.checked;
        valueEls.forEach(el => {
          if(!el) return;
          el.disabled = disabled;
          el.classList.toggle('disabled', disabled);
        });
      };
      enableEl.addEventListener('change', () => {
        toggle();
        console.debug('Debug: heatmap filter toggled', { id: enableEl.id, enabled: enableEl.checked });
        schedule();
      });
      valueEls.forEach(el => {
        el?.addEventListener('input', () => {
          console.debug('Debug: heatmap filter value changed', { id: el.id, value: el.value });
          schedule();
        });
      });
      toggle();
    };

    const registerCenter = (checkbox, radioName) => {
      if(!checkbox) return;
      const radios = Array.from(global.document.querySelectorAll(`input[name="${radioName}"]`));
      const toggle = () => {
        const disabled = !checkbox.checked;
        radios.forEach(radio => {
          radio.disabled = disabled;
        });
      };
      checkbox.addEventListener('change', () => {
        toggle();
        console.debug('Debug: heatmap center toggle', { id: checkbox.id, enabled: checkbox.checked });
        schedule();
      });
      radios.forEach(radio => {
        radio.addEventListener('change', () => {
          console.debug('Debug: heatmap center mode changed', { name: radioName, value: radio.value });
          schedule();
        });
      });
      toggle();
    };

    const registerCluster = (checkbox, select, dendrogramToggle) => {
      if(!checkbox) return;
      const update = () => {
        const enabled = checkbox.checked;
        if(select){ select.disabled = !enabled; }
        if(dendrogramToggle){ dendrogramToggle.disabled = !enabled; }
      };
      checkbox.addEventListener('change', () => {
        update();
        console.debug('Debug: heatmap cluster toggle', { id: checkbox.id, enabled: checkbox.checked });
        schedule();
      });
      select?.addEventListener('change', () => {
        console.debug('Debug: heatmap cluster metric change', { id: select.id, value: select.value });
        schedule();
      });
      dendrogramToggle?.addEventListener('change', () => {
        console.debug('Debug: heatmap dendrogram toggle', { id: dendrogramToggle.id, checked: dendrogramToggle.checked });
        schedule();
      });
      update();
    };

    refs.view?.addEventListener('change', () => {
      updateViewControlState();
      console.debug('Debug: heatmap view changed', { value: refs.view.value });
      schedule();
    });
    refs.method?.addEventListener('change', () => {
      console.debug('Debug: heatmap method changed', { value: refs.method.value });
      schedule();
    });
    [refs.logTransform, refs.normalizeGenes, refs.normalizeArrays, refs.showRowDendrogram, refs.showColumnDendrogram].forEach(el => {
      el?.addEventListener('change', () => {
        console.debug('Debug: heatmap toggle changed', { id: el.id, checked: el.checked });
        schedule();
      });
    });
    [refs.absValues, refs.maskLower, refs.showValues].forEach(el => {
      el?.addEventListener('change', () => {
        console.debug('Debug: heatmap view toggle changed', { id: el.id, checked: el.checked });
        scheduleViewOnly(`toggle-${el?.id || 'unknown'}`);
      });
    });
    refs.decimals?.addEventListener('input', () => {
      if(refs.decimals){
        refs.decimals.value = String(clampDecimals(refs.decimals.value));
        console.debug('Debug: heatmap decimals changed', { value: refs.decimals.value });
      }
      scheduleViewOnly('decimals');
    });
    [refs.colorNegative, refs.colorZero, refs.colorPositive].forEach(el => {
      if(!el) return;
      if(typeof global.attachColorPickerNear === 'function'){
        global.attachColorPickerNear(el);
      }
      el.addEventListener('input', () => {
        console.debug('Debug: heatmap color changed', { id: el.id, value: el.value });
        scheduleViewOnly(`color-${el.id}`);
      });
    });
    refs.cellSize?.addEventListener('input', () => {
      if(refs.cellSizeVal && refs.cellSize){
        refs.cellSizeVal.textContent = refs.cellSize.value;
      }
      console.debug('Debug: heatmap cell size changed', { value: refs.cellSize?.value });
      scheduleViewOnly('cell-size');
    });
    refs.fontSize?.addEventListener('input', () => {
      if(refs.fontSize){
        if(refs.fontSize.dataset){
          refs.fontSize.dataset.fontBasePt = String(refs.fontSize.value);
        }
        chartStyle.renderFontSizeLabel({ element: refs.fontSizeVal, pt: Number(refs.fontSize.value), input: refs.fontSize, manual: true });
        console.debug('Debug: heatmap font size changed', { value: refs.fontSize.value });
      }
      scheduleViewOnly('font-size');
    });
    refs.labelAngle?.addEventListener('input', () => {
      if(refs.labelAngle){
        const attempted = Number(refs.labelAngle.value);
        if(attempted !== COLUMN_LABEL_VERTICAL_ANGLE){
          console.debug('Debug: heatmap label angle input overridden', { attempted, enforced: COLUMN_LABEL_VERTICAL_ANGLE });
        }
        refs.labelAngle.value = String(COLUMN_LABEL_VERTICAL_ANGLE);
      }
      schedule();
    });

    registerFilter(refs.filterPresentEnable, [refs.filterPresentValue]);
    registerFilter(refs.filterSdEnable, [refs.filterSdValue]);
    registerFilter(refs.filterAbsEnable, [refs.filterAbsCount, refs.filterAbsValue]);
    registerFilter(refs.filterRangeEnable, [refs.filterRangeValue]);
    registerCenter(refs.centerGenes, 'heatmapCenterGenesMode');
    registerCenter(refs.centerArrays, 'heatmapCenterArraysMode');
    registerCluster(refs.clusterGenes, refs.genesMetric, refs.showRowDendrogram);
    registerCluster(refs.clusterArrays, refs.arraysMetric, refs.showColumnDendrogram);
    refs.linkage?.addEventListener('change', () => {
      console.debug('Debug: heatmap linkage method changed', { value: refs.linkage.value });
      schedule();
    });

    const example = [
      ['Gene', 'Baseline_A', 'Baseline_B', 'Treatment_A', 'Treatment_B', 'Stress_A', 'Stress_B', 'Recovery'],
      ['GeneA', 2.1, 2.4, 6.8, 7.1, 9.5, 9.1, 3.2],
      ['GeneB', 5.5, 5.8, 2.2, 2.0, 3.1, 3.5, 6.7],
      ['GeneC', 1.2, 1.0, 7.9, 7.5, 2.6, 2.1, 4.3],
      ['GeneD', 3.8, 3.5, 1.6, 1.8, 8.4, 8.7, 2.4],
      ['GeneE', 4.5, 4.2, 3.1, 3.4, 6.9, 7.2, 5.1]
    ];
    $('heatmapLoadExample')?.addEventListener('click', () => {
      if(!state.hot){
        console.warn('heatmap example skipped - hot not ready');
        return;
      }
      state.hot.loadData(example);
      console.log('heatmap example loaded');
      schedule();
    });

    const importBtn = $('heatmapImport');
    const fileInput = $('heatmapFile');
    importBtn?.addEventListener('click', () => {
      if(fileInput){
        fileInput.value = '';
        fileInput.click();
      }
    });
    fileInput?.addEventListener('change', async () => {
      const tableImport = Shared.tableImport;
      if(!tableImport || typeof tableImport.openFile !== 'function'){
        console.warn('heatmap import skipped - Shared.tableImport.openFile unavailable');
        return;
      }
      await tableImport.openFile(fileInput, {
        hot: state.hot,
        minCols: 2,
        minRows: DEFAULT_ROWS,
        scheduleDraw: () => state.scheduleDraw(),
        debugLabel: 'heatmap',
        onProcessed: info => console.log('heatmap data imported', info)
      });
    });

    const hotContainer = $('heatmapHot');
    if(hotContainer && Shared.tableImport && typeof Shared.tableImport.handlePaste === 'function'){
      hotContainer.addEventListener('paste', async evt => {
        console.debug('Debug: heatmap paste detected');
        try{
          await Shared.tableImport.handlePaste(evt, state.hot, {
            minCols: 2,
            minRows: DEFAULT_ROWS,
            scheduleDraw: () => state.scheduleDraw(),
            debugLabel: 'heatmap',
            onProcessed: info => console.log('heatmap paste processed', info)
          });
        }catch(err){
          console.error('heatmap paste error', err);
        }
      }, true);
    }

    if(Shared.exporter && typeof Shared.exporter.mountSvgControls === 'function'){
      Shared.exporter.mountSvgControls({
        container: '#heatmapExportControls',
        svgSelector: '#heatmapSvg',
        fileName: () => (state.fileName || 'correlation-heatmap.graph').replace(/\.graph$/i, '') || 'correlation-heatmap'
      });
    }

    updateViewControlState();
  }

  function initFileButtons(){
    $('openHeatmapGraph')?.addEventListener('click', () => heatmap.open());
    $('saveHeatmapGraph')?.addEventListener('click', () => heatmap.save());
    $('saveAsHeatmap')?.addEventListener('click', () => heatmap.saveAs());
    $('heatmapGraphFile')?.addEventListener('change', event => {
      const file = event.target.files && event.target.files[0];
      if(file){
        state.fileName = file.name;
        state.fileHandle = null;
        heatmap.loadFromFile(file);
      }
    });
  }

  function parseNumber(value){
    if(value === null || value === undefined) return NaN;
    if(typeof value === 'number' && Number.isFinite(value)) return value;
    const text = String(value).trim();
    if(!text) return NaN;
    const normalized = text.replace(/,/g, '');
    const num = Number(normalized);
    return Number.isFinite(num) ? num : NaN;
  }

  function cloneMatrix(matrix){
    return Array.isArray(matrix) ? matrix.map(row => row.slice()) : [];
  }

  function collectTableData(){
    if(!state.hot || typeof state.hot.getData !== 'function'){
      console.debug('Debug: heatmap collectTableData missing hot reference');
      return null;
    }
    const data = state.hot.getData();
    if(!Array.isArray(data) || data.length < 2){
      console.debug('Debug: heatmap collectTableData insufficient rows', { length: data?.length || 0 });
      return null;
    }
    const header = Array.isArray(data[0]) ? data[0] : [];
    if(header.length < 1){
      console.debug('Debug: heatmap collectTableData insufficient columns', { columnCount: header.length });
      return null;
    }
    const bodyRows = data.slice(1).filter(row => Array.isArray(row));
    const firstColumnHasNonNumericText = bodyRows.some(row => {
      const cell = row[0];
      if(cell === undefined || cell === null){ return false; }
      const trimmed = String(cell).trim();
      if(trimmed === ''){ return false; }
      const numeric = parseNumber(cell);
      return !Number.isFinite(numeric);
    });
    const startColumnIndex = firstColumnHasNonNumericText ? 1 : 0;
    console.debug('Debug: heatmap collectTableData header interpretation', {
      firstColumnHasNonNumericText,
      startColumnIndex,
      headerLength: header.length
    }); // Debug: record header parsing heuristics
    if(header.length - startColumnIndex < 1){
      console.debug('Debug: heatmap collectTableData insufficient data columns', {
        headerLength: header.length,
        startColumnIndex
      });
      return null;
    }
    const rawColumnLabels = header.slice(startColumnIndex);
    const columnLabels = [];
    const columnMeta = [];
    for(let colIndex = 0; colIndex < rawColumnLabels.length; colIndex += 1){
      const label = rawColumnLabels[colIndex];
      const clean = label !== undefined && label !== null && String(label).trim() !== ''
        ? String(label).trim()
        : `Column ${colIndex + 1}`;
      columnLabels.push(clean);
      columnMeta.push({ label: clean, originalIndex: colIndex + startColumnIndex });
    }
    const rowLabels = [];
    const rowMeta = [];
    const matrix = [];
    let skippedRows = 0;
    for(let rowIndex = 0; rowIndex < bodyRows.length; rowIndex += 1){
      const row = bodyRows[rowIndex];
      if(!Array.isArray(row)){ continue; }
      const values = [];
      let hasNumeric = false;
      for(let colIndex = startColumnIndex; colIndex < header.length; colIndex += 1){
        const value = parseNumber(row[colIndex]);
        if(Number.isFinite(value)){
          hasNumeric = true;
          values.push(value);
        }else{
          values.push(NaN);
        }
      }
      if(!hasNumeric){
        skippedRows += 1;
        continue;
      }
      const rawLabel = firstColumnHasNonNumericText ? row[0] : null;
      const cleanLabel = firstColumnHasNonNumericText
        ? (rawLabel !== undefined && rawLabel !== null && String(rawLabel).trim() !== ''
          ? String(rawLabel).trim()
          : `Row ${rowLabels.length + 1}`)
        : `Row ${rowLabels.length + 1}`;
      rowLabels.push(cleanLabel);
      rowMeta.push({ label: cleanLabel, originalIndex: rowIndex });
      matrix.push(values);
    }
    const keepColumns = columnLabels.map((_, colIndex) => matrix.some(row => Number.isFinite(row[colIndex])));
    const filteredMatrix = matrix.map(() => []);
    const filteredColumnLabels = [];
    const filteredColumnMeta = [];
    let removedColumns = 0;
    keepColumns.forEach((keep, colIndex) => {
      if(keep){
        filteredColumnLabels.push(columnLabels[colIndex]);
        filteredColumnMeta.push({ label: columnLabels[colIndex], originalIndex: colIndex });
        matrix.forEach((row, rowIdx) => {
          filteredMatrix[rowIdx].push(row[colIndex]);
        });
      }else{
        removedColumns += 1;
      }
    });
    console.debug('Debug: heatmap collectTableData summary', {
      rowsInSheet: data.length - 1,
      usableRows: filteredMatrix.length,
      rawColumns: columnLabels.length,
      usableColumns: filteredColumnLabels.length,
      removedEmptyColumns: removedColumns,
      skippedRows
    });
    if(filteredMatrix.length === 0 || filteredColumnLabels.length === 0){
      return null;
    }
    return {
      rowLabels,
      columnLabels: filteredColumnLabels,
      matrix: filteredMatrix,
      rowMeta,
      columnMeta: filteredColumnMeta,
      skippedRows,
      removedEmptyColumns: removedColumns
    };
  }

  function computeMean(values){
    if(!Array.isArray(values) || values.length === 0){
      return NaN;
    }
    const finite = values.filter(value => Number.isFinite(value));
    if(finite.length === 0){
      return NaN;
    }
    const sum = finite.reduce((acc, value) => acc + value, 0);
    return sum / finite.length;
  }

  function computeMedian(values){
    if(!Array.isArray(values) || values.length === 0){
      return NaN;
    }
    const finite = values.filter(value => Number.isFinite(value)).sort((a, b) => a - b);
    if(finite.length === 0){
      return NaN;
    }
    const mid = Math.floor(finite.length / 2);
    if(finite.length % 2 === 0){
      return (finite[mid - 1] + finite[mid]) / 2;
    }
    return finite[mid];
  }

  function computeStd(values){
    if(!Array.isArray(values) || values.length === 0){
      return NaN;
    }
    const finite = values.filter(value => Number.isFinite(value));
    if(finite.length < 2){
      return NaN;
    }
    const mean = computeMean(finite);
    const variance = finite.reduce((acc, value) => acc + Math.pow(value - mean, 2), 0) / (finite.length - 1);
    return Math.sqrt(Math.max(variance, 0));
  }

  function computeRange(values){
    const finite = values.filter(value => Number.isFinite(value));
    if(finite.length === 0){
      return NaN;
    }
    const min = Math.min(...finite);
    const max = Math.max(...finite);
    return { min, max, span: max - min };
  }

  function filterRowsBySettings(matrix, rowLabels, rowMeta, filters, columnCount){
    if(!filters){
      return { matrix, rowLabels, rowMeta, removed: [] };
    }
    const keptMatrix = [];
    const keptLabels = [];
    const keptMeta = [];
    const removed = [];
    const presentThreshold = Number.isFinite(filters.presentThreshold) ? filters.presentThreshold : null;
    const sdThreshold = Number.isFinite(filters.sdThreshold) ? filters.sdThreshold : null;
    const absThreshold = Number.isFinite(filters.absValue) ? filters.absValue : null;
    const absCountThreshold = Number.isFinite(filters.absCount) ? filters.absCount : null;
    const rangeThreshold = Number.isFinite(filters.rangeThreshold) ? filters.rangeThreshold : null;
    for(let i = 0; i < matrix.length; i += 1){
      const row = matrix[i];
      const values = Array.isArray(row) ? row : [];
      const finiteValues = values.filter(value => Number.isFinite(value));
      const percentPresent = columnCount > 0 ? (finiteValues.length / columnCount) * 100 : 0;
      const sd = computeStd(values);
      const rangeInfo = computeRange(values);
      const absPassCount = Number.isFinite(absThreshold)
        ? finiteValues.filter(value => Math.abs(value) >= absThreshold).length
        : finiteValues.length;
      const passesPresent = !filters.presentEnabled || presentThreshold === null || percentPresent >= presentThreshold;
      const passesSd = !filters.sdEnabled || sdThreshold === null || (Number.isFinite(sd) && sd >= sdThreshold);
      const passesAbs = !filters.absEnabled || absThreshold === null || absCountThreshold === null || absPassCount >= absCountThreshold;
      const passesRange = !filters.rangeEnabled || rangeThreshold === null || (Number.isFinite(rangeInfo?.span) && rangeInfo.span >= rangeThreshold);
      if(passesPresent && passesSd && passesAbs && passesRange){
        keptMatrix.push(values);
        keptLabels.push(rowLabels[i]);
        keptMeta.push(rowMeta[i]);
      }else{
        removed.push({
          label: rowLabels[i],
          percentPresent,
          sd,
          absPassCount,
          range: rangeInfo?.span
        });
      }
    }
    console.debug('Debug: heatmap filterRowsBySettings result', {
      originalRows: matrix.length,
      keptRows: keptMatrix.length,
      removedRows: removed.length,
      filters
    });
    return { matrix: keptMatrix, rowLabels: keptLabels, rowMeta: keptMeta, removed };
  }

  function pruneEmptyColumns(matrix, columnLabels, columnMeta){
    if(!Array.isArray(matrix) || matrix.length === 0){
      return { matrix, columnLabels, columnMeta, removed: 0 };
    }
    const columnCount = columnLabels.length;
    const keep = Array.from({ length: columnCount }, (_, colIndex) => matrix.some(row => Number.isFinite(row[colIndex])));
    const newMatrix = matrix.map(() => []);
    const newLabels = [];
    const newMeta = [];
    let removed = 0;
    keep.forEach((shouldKeep, colIndex) => {
      if(shouldKeep){
        newLabels.push(columnLabels[colIndex]);
        newMeta.push(columnMeta[colIndex]);
        matrix.forEach((row, rowIndex) => {
          newMatrix[rowIndex].push(row[colIndex]);
        });
      }else{
        removed += 1;
      }
    });
    console.debug('Debug: heatmap pruneEmptyColumns summary', {
      originalColumns: columnCount,
      keptColumns: newLabels.length,
      removed
    });
    return { matrix: newMatrix, columnLabels: newLabels, columnMeta: newMeta, removed };
  }

  function applyLogTransform(matrix){
    let converted = 0;
    let invalid = 0;
    const log2 = value => Math.log(value) / Math.log(2);
    for(let i = 0; i < matrix.length; i += 1){
      for(let j = 0; j < matrix[i].length; j += 1){
        const value = matrix[i][j];
        if(!Number.isFinite(value)) continue;
        if(value > 0){
          matrix[i][j] = log2(value);
          converted += 1;
        }else{
          matrix[i][j] = NaN;
          invalid += 1;
        }
      }
    }
    console.debug('Debug: heatmap applyLogTransform complete', { converted, invalid });
    return { converted, invalid };
  }

  function centerRows(matrix, mode){
    let adjusted = 0;
    for(let i = 0; i < matrix.length; i += 1){
      const row = matrix[i];
      const center = mode === 'median' ? computeMedian(row) : computeMean(row);
      if(!Number.isFinite(center) || center === 0){
        continue;
      }
      for(let j = 0; j < row.length; j += 1){
        if(Number.isFinite(row[j])){
          row[j] -= center;
          adjusted += 1;
        }
      }
    }
    console.debug('Debug: heatmap centerRows applied', { mode, adjusted });
    return adjusted;
  }

  function normalizeRows(matrix){
    let normalized = 0;
    let skipped = 0;
    for(let i = 0; i < matrix.length; i += 1){
      const row = matrix[i];
      const mean = computeMean(row);
      const std = computeStd(row);
      if(!Number.isFinite(std) || std === 0){
        skipped += 1;
        continue;
      }
      for(let j = 0; j < row.length; j += 1){
        if(Number.isFinite(row[j])){
          row[j] = (row[j] - (Number.isFinite(mean) ? mean : 0)) / std;
          normalized += 1;
        }
      }
    }
    console.debug('Debug: heatmap normalizeRows applied', { normalized, skipped });
    return { normalized, skipped };
  }

  function centerColumns(matrix, mode){
    if(!Array.isArray(matrix) || matrix.length === 0){
      return 0;
    }
    const columnCount = matrix[0].length;
    let adjusted = 0;
    for(let colIndex = 0; colIndex < columnCount; colIndex += 1){
      const columnValues = matrix.map(row => row[colIndex]);
      const center = mode === 'median' ? computeMedian(columnValues) : computeMean(columnValues);
      if(!Number.isFinite(center) || center === 0){
        continue;
      }
      matrix.forEach((row, rowIndex) => {
        if(Number.isFinite(row[colIndex])){
          row[colIndex] -= center;
          adjusted += 1;
        }
      });
    }
    console.debug('Debug: heatmap centerColumns applied', { mode, adjusted });
    return adjusted;
  }

  function normalizeColumns(matrix){
    if(!Array.isArray(matrix) || matrix.length === 0){
      return { normalized: 0, skipped: 0 };
    }
    const columnCount = matrix[0].length;
    let normalized = 0;
    let skipped = 0;
    for(let colIndex = 0; colIndex < columnCount; colIndex += 1){
      const columnValues = matrix.map(row => row[colIndex]);
      const mean = computeMean(columnValues);
      const std = computeStd(columnValues);
      if(!Number.isFinite(std) || std === 0){
        skipped += 1;
        continue;
      }
      matrix.forEach((row, rowIndex) => {
        const value = row[colIndex];
        if(Number.isFinite(value)){
          row[colIndex] = (value - (Number.isFinite(mean) ? mean : 0)) / std;
          normalized += 1;
        }
      });
    }
    console.debug('Debug: heatmap normalizeColumns applied', { normalized, skipped });
    return { normalized, skipped };
  }

  function applyAdjustments(matrix, adjust){
    if(!adjust){
      return {};
    }
    const summary = {};
    if(adjust.centerRowsMode){
      summary.centerRows = centerRows(matrix, adjust.centerRowsMode);
    }
    if(adjust.normalizeRows){
      summary.normalizeRows = normalizeRows(matrix);
    }
    if(adjust.centerColumnsMode){
      summary.centerColumns = centerColumns(matrix, adjust.centerColumnsMode);
    }
    if(adjust.normalizeColumns){
      summary.normalizeColumns = normalizeColumns(matrix);
    }
    console.debug('Debug: heatmap applyAdjustments summary', summary);
    return summary;
  }

  function buildAxisItems(matrix, labels, axis){
    if(!Array.isArray(matrix) || !Array.isArray(labels)){
      return [];
    }
    if(axis === 'rows'){
      return labels.map((label, index) => ({ label, index, vector: matrix[index] ? matrix[index].slice() : [] }));
    }
    if(axis === 'columns'){
      const columnCount = labels.length;
      const items = [];
      for(let colIndex = 0; colIndex < columnCount; colIndex += 1){
        const vector = matrix.map(row => row[colIndex]);
        items.push({ label: labels[colIndex], index: colIndex, vector });
      }
      return items;
    }
    return [];
  }

  function alignVectors(vecA, vecB){
    const length = Math.min(vecA?.length || 0, vecB?.length || 0);
    const xs = [];
    const ys = [];
    for(let i = 0; i < length; i += 1){
      const a = vecA[i];
      const b = vecB[i];
      if(Number.isFinite(a) && Number.isFinite(b)){
        xs.push(a);
        ys.push(b);
      }
    }
    return { xs, ys };
  }

  function computeUncenteredCorrelation(xs, ys){
    const n = xs.length;
    if(n === 0){
      return NaN;
    }
    let sumXY = 0;
    let sumX2 = 0;
    let sumY2 = 0;
    for(let i = 0; i < n; i += 1){
      const x = xs[i];
      const y = ys[i];
      sumXY += x * y;
      sumX2 += x * x;
      sumY2 += y * y;
    }
    const denom = Math.sqrt(sumX2 * sumY2);
    if(denom === 0){
      return NaN;
    }
    return sumXY / denom;
  }

  function calculateCorrelationEntry(vecA, vecB, method){
    const { xs, ys } = alignVectors(vecA, vecB);
    const count = xs.length;
    if(count < 2 && method !== 'uncentered'){
      return { corr: NaN, count };
    }
    let corr;
    if(method === 'spearman'){
      corr = computeCorrelation(xs, ys, 'spearman');
    }else if(method === 'uncentered'){
      corr = computeUncenteredCorrelation(xs, ys);
    }else{
      corr = computeCorrelation(xs, ys, 'pearson');
    }
    const normalized = Number.isFinite(corr) ? Math.max(-1, Math.min(1, corr)) : NaN;
    return { corr: normalized, count };
  }

  function distanceBetweenVectors(vecA, vecB, metric){
    const { xs, ys } = alignVectors(vecA, vecB);
    const count = xs.length;
    if(count === 0){
      return { distance: 1, count: 0 };
    }
    if(metric === 'euclidean'){
      let sumSq = 0;
      for(let i = 0; i < count; i += 1){
        const diff = xs[i] - ys[i];
        sumSq += diff * diff;
      }
      const distance = Math.sqrt(sumSq / count);
      return { distance, count };
    }
    const entry = calculateCorrelationEntry(xs, ys, metric === 'pearson' || metric === 'spearman' ? metric : 'uncentered');
    const corr = entry.corr;
    const distance = Number.isFinite(corr) ? 1 - corr : 1;
    return { distance, count, corr };
  }

  function hierarchicalCluster(items, metric, linkage){
    const countItems = Array.isArray(items) ? items.length : 0;
    const now = () => (global.performance && typeof global.performance.now === 'function') ? global.performance.now() : Date.now();
    const startTime = now();
    if(countItems === 0){
      const emptyStore = { size: 0, values: new Float32Array(0), released: true };
      console.debug('Debug: heatmap hierarchicalCluster skipped - no items', { metric, linkage });
      return { order: [], tree: null, maxDistance: 0, steps: [], baseDistances: emptyStore };
    }
    if(countItems === 1){
      const singletonStore = { size: 1, values: new Float32Array(0), released: true };
      const durationSingleton = now() - startTime;
      console.debug('Debug: heatmap hierarchicalCluster trivial', {
        itemCount: 1,
        metric,
        linkage,
        durationMs: Number(durationSingleton.toFixed(2))
      });
      return {
        order: [items[0].index],
        tree: { indices: [0], left: null, right: null, distance: 0 },
        maxDistance: 0,
        steps: [],
        baseDistances: singletonStore
      };
    }

    const baseDistanceStore = {
      size: countItems,
      values: new Float32Array((countItems * (countItems - 1)) / 2),
      released: false
    };
    const baseValues = baseDistanceStore.values;
    const writeBaseDistance = (i, j, value) => {
      if(i === j){ return; }
      const idx = packedDistanceIndex(countItems, i, j);
      if(idx >= 0){
        baseValues[idx] = value;
      }
    };
    const readBaseDistance = (i, j) => {
      if(i === j){ return 0; }
      const idx = packedDistanceIndex(countItems, i, j);
      if(idx < 0){ return 0; }
      return baseValues[idx];
    };

    for(let i = 0; i < countItems; i += 1){
      for(let j = i + 1; j < countItems; j += 1){
        const { distance } = distanceBetweenVectors(items[i].vector, items[j].vector, metric);
        const safeDistance = Number.isFinite(distance) ? distance : 1;
        writeBaseDistance(i, j, safeDistance);
      }
    }

    const computeCentroidForIndices = indices => {
      const length = items[0]?.vector?.length || 0;
      const sums = Array.from({ length }, () => 0);
      const counts = Array.from({ length }, () => 0);
      for(const idx of indices){
        const vector = items[idx].vector;
        for(let i = 0; i < length; i += 1){
          const value = vector[i];
          if(Number.isFinite(value)){
            sums[i] += value;
            counts[i] += 1;
          }
        }
      }
      return sums.map((sum, idx) => counts[idx] > 0 ? sum / counts[idx] : NaN);
    };

    const getClusterCentroid = cluster => {
      if(!cluster){ return []; }
      if(!cluster.centroid){
        cluster.centroid = computeCentroidForIndices(cluster.indices);
      }
      return cluster.centroid;
    };

    const linkageDistance = (clusterA, clusterB) => {
      if(!clusterA || !clusterB){ return 1; }
      const indicesA = clusterA.indices;
      const indicesB = clusterB.indices;
      if(linkage === 'centroid'){
        const centroidA = getClusterCentroid(clusterA);
        const centroidB = getClusterCentroid(clusterB);
        const { distance } = distanceBetweenVectors(centroidA, centroidB, metric);
        return Number.isFinite(distance) ? distance : 1;
      }
      let best = Infinity;
      let worst = -Infinity;
      let sum = 0;
      let pairCount = 0;
      for(const idxA of indicesA){
        for(const idxB of indicesB){
          const dist = readBaseDistance(idxA, idxB);
          if(!Number.isFinite(dist)){ continue; }
          if(linkage === 'single'){
            if(dist < best){ best = dist; }
          }else if(linkage === 'complete'){
            if(dist > worst){ worst = dist; }
          }else{
            sum += dist;
            pairCount += 1;
          }
        }
      }
      if(linkage === 'single'){
        return Number.isFinite(best) ? best : 1;
      }
      if(linkage === 'complete'){
        return Number.isFinite(worst) ? worst : 1;
      }
      return pairCount > 0 ? sum / pairCount : 1;
    };

    const clusters = items.map((item, index) => ({
      id: index,
      indices: [index],
      left: null,
      right: null,
      distance: 0,
      centroid: null,
      version: 0
    }));
    const active = new Map();
    clusters.forEach(cluster => {
      active.set(cluster.id, cluster);
    });
    const steps = [];
    let maxDistance = 0;
    let nextClusterId = countItems;
    const heap = createMinHeap((a, b) => a.distance - b.distance);

    const pushCandidate = (idA, idB) => {
      if(idA === idB){ return; }
      const clusterA = active.get(idA);
      const clusterB = active.get(idB);
      if(!clusterA || !clusterB){ return; }
      const firstId = idA < idB ? idA : idB;
      const secondId = idA < idB ? idB : idA;
      const distance = linkageDistance(clusterA, clusterB);
      const safeDistance = Number.isFinite(distance) ? distance : 1;
      heap.push({
        distance: safeDistance,
        aId: firstId,
        bId: secondId,
        aVersion: clusterA.version,
        bVersion: clusterB.version
      });
    };

    for(let i = 0; i < clusters.length; i += 1){
      for(let j = i + 1; j < clusters.length; j += 1){
        pushCandidate(clusters[i].id, clusters[j].id);
      }
    }

    const pollNextPair = () => {
      while(heap.size() > 0){
        const entry = heap.pop();
        if(!entry){ continue; }
        const clusterA = active.get(entry.aId);
        const clusterB = active.get(entry.bId);
        if(!clusterA || !clusterB){
          continue;
        }
        if(clusterA.version !== entry.aVersion || clusterB.version !== entry.bVersion){
          continue;
        }
        return { clusterA, clusterB, distance: entry.distance };
      }
      return null;
    };

    while(active.size > 1){
      let nextPair = pollNextPair();
      if(!nextPair){
        const remaining = Array.from(active.values());
        if(remaining.length < 2){
          break;
        }
        const clusterA = remaining[0];
        const clusterB = remaining[1];
        const fallbackDistance = linkageDistance(clusterA, clusterB);
        console.debug('Debug: heatmap hierarchicalCluster fallback merge', {
          clusterA: clusterA.id,
          clusterB: clusterB.id,
          linkage,
          fallbackDistance
        });
        nextPair = { clusterA, clusterB, distance: Number.isFinite(fallbackDistance) ? fallbackDistance : 1 };
      }

      const { clusterA, clusterB } = nextPair;
      const mergeDistance = Number.isFinite(nextPair.distance) ? nextPair.distance : 0;
      active.delete(clusterA.id);
      active.delete(clusterB.id);
      const mergedIndices = clusterA.indices.concat(clusterB.indices).sort((a, b) => a - b);
      const mergedCluster = {
        id: nextClusterId,
        indices: mergedIndices,
        left: clusterA,
        right: clusterB,
        distance: mergeDistance,
        centroid: null,
        version: 0
      };
      if(linkage === 'centroid'){
        mergedCluster.centroid = computeCentroidForIndices(mergedIndices);
      }
      steps.push({ left: clusterA.indices.slice(), right: clusterB.indices.slice(), distance: mergeDistance });
      maxDistance = Math.max(maxDistance, mergeDistance);
      nextClusterId += 1;
      active.set(mergedCluster.id, mergedCluster);
      for(const other of active.values()){
        if(other.id === mergedCluster.id){ continue; }
        pushCandidate(mergedCluster.id, other.id);
      }
    }

    const root = Array.from(active.values())[0] || null;
    const flatten = node => {
      if(!node || !node.left || !node.right){
        return node ? node.indices.slice() : [];
      }
      const leftOrder = flatten(node.left);
      const rightOrder = flatten(node.right);
      const leftMin = Math.min(...leftOrder);
      const rightMin = Math.min(...rightOrder);
      return leftMin <= rightMin ? leftOrder.concat(rightOrder) : rightOrder.concat(leftOrder);
    };
    const orderIndices = flatten(root);
    const order = orderIndices.length > 0
      ? orderIndices.map(idx => items[idx].index)
      : items.map(item => item.index);

    baseDistanceStore.released = true;
    baseDistanceStore.values = new Float32Array(0);

    const durationMs = now() - startTime;
    console.debug('Debug: heatmap hierarchicalCluster summary', {
      itemCount: countItems,
      metric,
      linkage,
      maxDistance,
      steps: steps.length,
      durationMs: Number(durationMs.toFixed(2)),
      candidatesProcessed: steps.length + 1
    });
    return { order, tree: root, steps, maxDistance, baseDistances: baseDistanceStore };
  }

  function collectSettings(){
    const view = refs.view?.value || 'corr-columns';
    const isCorrelation = view.startsWith('corr');
    const decimals = clampDecimals(refs.decimals?.value);
    const settings = {
      view,
      decimals,
      correlationMethod: refs.method?.value || 'pearson',
      useAbsolute: isCorrelation ? !!refs.absValues?.checked : false,
      maskLower: isCorrelation ? !!refs.maskLower?.checked : false,
      showValues: !!refs.showValues?.checked,
      cellSize: Math.max(12, Number(refs.cellSize?.value) || 60),
      fontSize: Math.max(8, Number(refs.fontSize?.value) || 12),
      palette: {
        negative: refs.colorNegative?.value || '#313695',
        zero: refs.colorZero?.value || '#f7f7f7',
        positive: refs.colorPositive?.value || '#a50026'
      },
      filters: {
        presentEnabled: !!refs.filterPresentEnable?.checked,
        presentThreshold: Number(refs.filterPresentValue?.value),
        sdEnabled: !!refs.filterSdEnable?.checked,
        sdThreshold: Number(refs.filterSdValue?.value),
        absEnabled: !!refs.filterAbsEnable?.checked,
        absCount: Number(refs.filterAbsCount?.value),
        absValue: Number(refs.filterAbsValue?.value),
        rangeEnabled: !!refs.filterRangeEnable?.checked,
        rangeThreshold: Number(refs.filterRangeValue?.value)
      },
      adjust: {
        logTransform: !!refs.logTransform?.checked,
        centerRowsMode: refs.centerGenes?.checked ? (getCheckedRadioValue('heatmapCenterGenesMode') || 'mean') : null,
        normalizeRows: !!refs.normalizeGenes?.checked,
        centerColumnsMode: refs.centerArrays?.checked ? (getCheckedRadioValue('heatmapCenterArraysMode') || 'mean') : null,
        normalizeColumns: !!refs.normalizeArrays?.checked
      },
      clustering: {
        rows: {
          enabled: !!refs.clusterGenes?.checked,
          metric: refs.genesMetric?.value || 'pearson',
          showDendrogram: !!refs.showRowDendrogram?.checked
        },
        columns: {
          enabled: !!refs.clusterArrays?.checked,
          metric: refs.arraysMetric?.value || 'pearson',
          showDendrogram: !!refs.showColumnDendrogram?.checked
        },
        linkage: refs.linkage?.value || 'average'
      }
    };
    console.debug('Debug: heatmap collectSettings summary', settings);
    return settings;
  }

  function extractViewOptions(settings){
    if(!settings){
      return null;
    }
    return {
      view: settings.view,
      decimals: settings.decimals,
      useAbsolute: settings.useAbsolute,
      maskLower: settings.maskLower,
      showValues: settings.showValues,
      cellSize: settings.cellSize,
      fontSize: settings.fontSize,
      palette: settings.palette,
      colors: settings.palette,
      correlationMethod: settings.correlationMethod
    };
  }

  function prepareProcessedData(settings){
    const raw = collectTableData();
    if(!raw){
      console.debug('Debug: heatmap prepareProcessedData missing raw data');
      return { ok: false, reason: 'no-data' };
    }
    let matrix = cloneMatrix(raw.matrix);
    const logResult = settings.adjust?.logTransform ? applyLogTransform(matrix) : null;
    const filterResult = filterRowsBySettings(matrix, raw.rowLabels, raw.rowMeta, settings.filters, raw.columnLabels.length);
    matrix = filterResult.matrix;
    let rowLabels = filterResult.rowLabels;
    let rowMeta = filterResult.rowMeta;
    let columnLabels = raw.columnLabels.slice();
    let columnMeta = raw.columnMeta.slice();
    let pruneResult = pruneEmptyColumns(matrix, columnLabels, columnMeta);
    matrix = pruneResult.matrix;
    columnLabels = pruneResult.columnLabels;
    columnMeta = pruneResult.columnMeta;
    if(matrix.length === 0 || columnLabels.length === 0){
      console.debug('Debug: heatmap prepareProcessedData filtered all data', {
        rowsRemaining: matrix.length,
        columnsRemaining: columnLabels.length
      });
      return {
        ok: false,
        reason: 'filtered-out',
        filterResult,
        pruneResult
      };
    }
    const adjustConfig = {
      centerRowsMode: settings.adjust?.centerRowsMode,
      normalizeRows: !!settings.adjust?.normalizeRows,
      centerColumnsMode: settings.adjust?.centerColumnsMode,
      normalizeColumns: !!settings.adjust?.normalizeColumns
    };
    const adjustmentSummary = applyAdjustments(matrix, adjustConfig);
    pruneResult = pruneEmptyColumns(matrix, columnLabels, columnMeta);
    matrix = pruneResult.matrix;
    columnLabels = pruneResult.columnLabels;
    columnMeta = pruneResult.columnMeta;
    if(matrix.length === 0 || columnLabels.length === 0){
      console.debug('Debug: heatmap prepareProcessedData removed all columns after adjustment');
      return {
        ok: false,
        reason: 'adjustment-empty',
        filterResult,
        adjustmentSummary,
        pruneResult
      };
    }
    rowLabels = rowLabels.slice();
    rowMeta = rowMeta.slice();
    let finiteCount = 0;
    let finiteSum = 0;
    let min = Infinity;
    let max = -Infinity;
    for(const row of matrix){
      for(const value of row){
        if(!Number.isFinite(value)){
          continue;
        }
        finiteCount++;
        finiteSum += value;
        if(value < min) min = value;
        if(value > max) max = value;
      }
    }
    if(!finiteCount){
      min = NaN;
      max = NaN;
    }
    const mean = finiteCount ? (finiteSum / finiteCount) : NaN;
    return {
      ok: true,
      matrix,
      rowLabels,
      columnLabels,
      rowMeta,
      columnMeta,
      raw,
      filterResult,
      adjustmentSummary,
      logResult,
      stats: {
        min,
        max,
        mean,
        finiteCount,
        initialRows: raw.rowLabels.length,
        initialColumns: raw.columnLabels.length,
        rowsFiltered: filterResult.removed.length,
        columnsRemoved: raw.columnLabels.length - columnLabels.length,
        skippedRows: raw.skippedRows,
        logApplied: !!settings.adjust?.logTransform
      }
    };
  }

  function buildOrderedMatrix(matrix, rowOrder, columnOrder){
    return rowOrder.map(rowIdx => {
      const sourceRow = matrix[rowIdx];
      return columnOrder.map(colIdx => sourceRow[colIdx]);
    });
  }

  function createValueColorMapper(stats, palette){
    const min = stats?.min;
    const max = stats?.max;
    if(!Number.isFinite(min) || !Number.isFinite(max) || min === max){
      const zeroColor = rgbToCss(hexToRgb(palette.zero || '#f7f7f7'));
      return () => zeroColor;
    }
    if(min < 0 && max > 0){
      const maxAbs = Math.max(Math.abs(min), Math.abs(max)) || 1;
      return value => {
        if(!Number.isFinite(value)) return '#d0d0d0';
        const normalized = value / maxAbs;
        return colorForValue({ raw: normalized, value: normalized }, {
          negative: hexToRgb(palette.negative || '#313695'),
          zero: hexToRgb(palette.zero || '#f7f7f7'),
          positive: hexToRgb(palette.positive || '#a50026')
        }, false);
      };
    }
    if(max <= 0){
      const span = Math.abs(min - max) || Math.abs(min) || 1;
      return value => {
        if(!Number.isFinite(value)) return '#d0d0d0';
        const normalized = (value - max) / (min - max || -span);
        return mixColor(hexToRgb(palette.negative || '#313695'), hexToRgb(palette.zero || '#f7f7f7'), Math.min(1, Math.max(0, normalized)));
      };
    }
    const range = max - min || 1;
    return value => {
      if(!Number.isFinite(value)) return '#d0d0d0';
      const normalized = (value - min) / range;
      return mixColor(hexToRgb(palette.zero || '#f7f7f7'), hexToRgb(palette.positive || '#a50026'), Math.min(1, Math.max(0, normalized)));
    };
  }

  function computePearson(xs, ys){
    const n = xs.length;
    if(n <= 1) return NaN;
    if(global.jStat && typeof global.jStat.corrcoeff === 'function'){
      return global.jStat.corrcoeff(xs, ys);
    }
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    for(let i = 0; i < n; i += 1){
      const x = xs[i];
      const y = ys[i];
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
      sumY2 += y * y;
    }
    const numerator = (n * sumXY) - (sumX * sumY);
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    if(denominator === 0) return NaN;
    return numerator / denominator;
  }

  function rankValues(values){
    const entries = values.map((value, index) => ({ value, index }));
    entries.sort((a, b) => a.value - b.value);
    const ranks = new Array(values.length);
    let i = 0;
    while(i < entries.length){
      let j = i + 1;
      while(j < entries.length && entries[j].value === entries[i].value){
        j += 1;
      }
      const rank = (i + j + 1) / 2;
      for(let k = i; k < j; k += 1){
        ranks[entries[k].index] = rank;
      }
      i = j;
    }
    return ranks;
  }

  function computeCorrelation(xs, ys, method){
    if(xs.length !== ys.length || xs.length < 2) return NaN;
    if(method === 'spearman'){
      const rankX = rankValues(xs);
      const rankY = rankValues(ys);
      return computePearson(rankX, rankY);
    }
    return computePearson(xs, ys);
  }

  function alignColumnValues(columnA, columnB){
    if(!columnA || !columnB) return { xs: [], ys: [] };
    const mapB = new Map(columnB.values.map(entry => [entry.rowIndex, entry.value]));
    const xs = [];
    const ys = [];
    for(const entry of columnA.values){
      if(mapB.has(entry.rowIndex)){
        xs.push(entry.value);
        ys.push(mapB.get(entry.rowIndex));
      }
    }
    return { xs, ys };
  }

  function calculateColumnCorrelation(columnA, columnB, method){
    const { xs, ys } = alignColumnValues(columnA, columnB);
    const count = xs.length;
    if(count < 2){
      return { corr: NaN, count };
    }
    const corr = computeCorrelation(xs, ys, method);
    if(!Number.isFinite(corr)){
      return { corr: NaN, count };
    }
    const normalized = Math.max(-1, Math.min(1, corr));
    return { corr: normalized, count };
  }

  function packedDistanceIndex(size, i, j){
    if(i === j){ return -1; }
    let a = i;
    let b = j;
    if(a > b){
      a = j;
      b = i;
    }
    return (a * (2 * size - a - 1)) / 2 + (b - a - 1);
  }

  function readPackedDistance(store, i, j){
    if(!store || typeof store.size !== 'number'){ return 0; }
    if(i === j){ return 0; }
    const idx = packedDistanceIndex(store.size, i, j);
    if(idx < 0){ return 0; }
    return store.values[idx];
  }

  function writePackedDistance(store, i, j, value){
    if(!store || typeof store.size !== 'number' || i === j){ return; }
    const idx = packedDistanceIndex(store.size, i, j);
    if(idx >= 0){
      store.values[idx] = value;
    }
  }

  function buildDistanceMatrix(columns, method){
    const n = columns.length;
    if(n <= 1){
      return { size: n, values: new Float32Array(0) };
    }
    const values = new Float32Array((n * (n - 1)) / 2);
    const store = { size: n, values };
    for(let i = 0; i < n; i += 1){
      for(let j = i + 1; j < n; j += 1){
        const { corr } = calculateColumnCorrelation(columns[i], columns[j], method);
        const distance = Number.isFinite(corr) ? 1 - corr : 1;
        writePackedDistance(store, i, j, distance);
      }
    }
    console.debug('Debug: heatmap distance matrix prepared', {
      method,
      columnCount: n,
      preview: Array.from(values.slice(0, Math.min(10, values.length)))
    });
    return store;
  }

  function createMinHeap(compare){
    const data = [];
    const swap = (i, j) => {
      const tmp = data[i];
      data[i] = data[j];
      data[j] = tmp;
    };
    const bubbleUp = index => {
      let i = index;
      while(i > 0){
        const parent = Math.floor((i - 1) / 2);
        if(compare(data[i], data[parent]) >= 0){ break; }
        swap(i, parent);
        i = parent;
      }
    };
    const bubbleDown = index => {
      let i = index;
      while(true){
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if(left < data.length && compare(data[left], data[smallest]) < 0){
          smallest = left;
        }
        if(right < data.length && compare(data[right], data[smallest]) < 0){
          smallest = right;
        }
        if(smallest === i){ break; }
        swap(i, smallest);
        i = smallest;
      }
    };
    return {
      push(item){
        data.push(item);
        bubbleUp(data.length - 1);
      },
      pop(){
        if(data.length === 0){ return null; }
        const top = data[0];
        const last = data.pop();
        if(data.length > 0 && last !== undefined){
          data[0] = last;
          bubbleDown(0);
        }
        return top;
      },
      size(){
        return data.length;
      }
    };
  }

  function performHierarchicalClustering(baseDistances){
    const n = Number(baseDistances?.size) || 0;
    if(n <= 0){
      console.debug('Debug: heatmap hierarchical clustering skipped - empty distance matrix');
      return { order: [], tree: null, steps: [], maxDistance: 0 };
    }
    const clusters = Array.from({ length: n }, (_, index) => ({
      id: index,
      indices: [index],
      size: 1,
      left: null,
      right: null,
      distance: 0
    }));
    if(n === 1){
      console.debug('Debug: heatmap hierarchical clustering trivial - single column');
      return { order: [0], tree: clusters[0], steps: [], maxDistance: 0 };
    }

    const active = new Map();
    clusters.forEach(cluster => {
      active.set(cluster.id, cluster);
    });
    const pairSums = new Map();
    const heap = createMinHeap((a, b) => a.distance - b.distance);

    for(let i = 0; i < n; i += 1){
      for(let j = i + 1; j < n; j += 1){
        const base = readPackedDistance(baseDistances, i, j);
        const safeDistance = Number.isFinite(base) ? base : 1;
        const key = getPairKey(i, j);
        pairSums.set(key, safeDistance);
        heap.push({ distance: safeDistance, aId: i, bId: j });
      }
    }

    const mergeSteps = [];
    let maxDistance = 0;
    let nextClusterId = n;

    const getPairKey = (aId, bId) => {
      return aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
    };

    const pollNextPair = () => {
      while(heap.size() > 0){
        const entry = heap.pop();
        if(!entry){ break; }
        if(!active.has(entry.aId) || !active.has(entry.bId)){
          continue;
        }
        const key = getPairKey(entry.aId, entry.bId);
        const sum = pairSums.get(key);
        if(!Number.isFinite(sum)){
          continue;
        }
        const clusterA = active.get(entry.aId);
        const clusterB = active.get(entry.bId);
        const avgDistance = sum / (clusterA.size * clusterB.size);
        return { clusterA, clusterB, sum, avgDistance, key };
      }
      return null;
    };

    while(active.size > 1){
      let next = pollNextPair();
      if(!next){
        const remaining = Array.from(active.values());
        if(remaining.length < 2){
          break;
        }
        const clusterA = remaining[0];
        const clusterB = remaining[1];
        const key = getPairKey(clusterA.id, clusterB.id);
        const sum = pairSums.get(key) || 0;
        const fallbackDistance = sum / (clusterA.size * clusterB.size) || 0;
        console.debug('Debug: heatmap hierarchical clustering fallback merge', {
          clusterA: clusterA.id,
          clusterB: clusterB.id,
          distance: fallbackDistance
        });
        next = { clusterA, clusterB, sum, avgDistance: fallbackDistance, key };
      }

      const { clusterA, clusterB, avgDistance, key } = next;
      pairSums.delete(key);
      active.delete(clusterA.id);
      active.delete(clusterB.id);

      const merged = {
        id: nextClusterId,
        indices: clusterA.indices.concat(clusterB.indices),
        size: clusterA.size + clusterB.size,
        left: clusterA,
        right: clusterB,
        distance: Number.isFinite(avgDistance) ? avgDistance : 0
      };
      nextClusterId += 1;
      const survivors = Array.from(active.values());
      active.set(merged.id, merged);

      survivors.forEach(other => {
        const keyA = getPairKey(clusterA.id, other.id);
        const keyB = getPairKey(clusterB.id, other.id);
        const sumA = pairSums.get(keyA) || 0;
        const sumB = pairSums.get(keyB) || 0;
        pairSums.delete(keyA);
        pairSums.delete(keyB);
        const combinedSum = sumA + sumB;
        const combinedKey = getPairKey(merged.id, other.id);
        pairSums.set(combinedKey, combinedSum);
        const combinedDistance = combinedSum / (merged.size * other.size);
        heap.push({
          distance: Number.isFinite(combinedDistance) ? combinedDistance : 0,
          aId: merged.id,
          bId: other.id
        });
      });

      mergeSteps.push({
        left: clusterA.indices.slice(),
        right: clusterB.indices.slice(),
        distance: Number.isFinite(avgDistance) ? avgDistance : 0
      });
      maxDistance = Math.max(maxDistance, Number.isFinite(avgDistance) ? avgDistance : 0);
    }

    const [root] = active.values();
    if(!root){
      console.debug('Debug: heatmap hierarchical clustering missing root', {
        columnCount: n,
        stepCount: mergeSteps.length
      });
      return {
        order: clusters.map(cluster => cluster.id),
        tree: null,
        steps: mergeSteps,
        maxDistance
      };
    }
    const flatten = node => {
      if(!node.left || !node.right){
        return node.indices.slice();
      }
      const leftOrder = flatten(node.left);
      const rightOrder = flatten(node.right);
      const leftMin = Math.min(...leftOrder);
      const rightMin = Math.min(...rightOrder);
      return leftMin <= rightMin ? leftOrder.concat(rightOrder) : rightOrder.concat(leftOrder);
    };
    const order = flatten(root);
    console.debug('Debug: heatmap hierarchical clustering merges', {
      columnCount: n,
      stepCount: mergeSteps.length,
      maxDistance
    });
    return { order, tree: root, steps: mergeSteps, maxDistance };
  }

  function clusterColumns(columns, method){
    if(!Array.isArray(columns) || columns.length === 0){
      return { order: [], tree: null, steps: [], maxDistance: 0, baseDistances: [] };
    }
    const baseDistances = buildDistanceMatrix(columns, method);
    const clustering = performHierarchicalClustering(baseDistances);
    if(!Array.isArray(clustering.order) || clustering.order.length !== columns.length){
      console.debug('Debug: heatmap clustering order fallback', {
        requestedColumns: columns.length,
        receivedLength: clustering?.order?.length,
        method
      });
      return {
        order: columns.map((_, index) => index),
        tree: null,
        steps: clustering.steps || [],
        maxDistance: clustering.maxDistance || 0,
        baseDistances
      };
    }
    console.debug('Debug: heatmap clustering order computed', {
      method,
      order: clustering.order,
      maxDistance: clustering.maxDistance
    });
    return Object.assign({ baseDistances }, clustering);
  }

  function renderDendrogram({
    doc,
    parent,
    tree,
    order,
    startX,
    startY,
    length,
    cellSize,
    maxDistance,
    orientation = 'vertical'
  }){
    const hasBasics = doc && parent && tree && Array.isArray(order) && order.length > 0;
    if(!hasBasics || !Number.isFinite(length) || length <= 0){
      console.debug('Debug: heatmap renderDendrogram skipped', {
        hasBasics,
        startX,
        startY,
        length,
        orientation
      });
      return null;
    }
    const orderIndex = new Map();
    order.forEach((itemIndex, position) => {
      orderIndex.set(itemIndex, position);
    });
    const safeMaxDistance = maxDistance > 0 ? maxDistance : 1;
    const group = doc.createElementNS(NS, 'g');
    group.setAttribute('class', 'heatmap-dendrogram');
    group.setAttribute('fill', 'none');
    group.setAttribute('stroke', '#555');
    group.setAttribute('stroke-width', '1');
    group.setAttribute('stroke-linecap', 'square');
    parent.appendChild(group);

    const visitVertical = node => {
      if(!node){
        return { x: startX, y: startY };
      }
      if(!node.left || !node.right){
        const rawIndex = Array.isArray(node.indices) ? node.indices[0] : null;
        const orderPos = orderIndex.has(rawIndex) ? orderIndex.get(rawIndex) : 0;
        const y = startY + orderPos * cellSize + cellSize / 2;
        return { x: startX, y };
      }
      const leftPos = visitVertical(node.left);
      const rightPos = visitVertical(node.right);
      const distance = Math.max(0, Number(node.distance) || 0);
      const nodeX = startX + (distance / safeMaxDistance) * length;
      const nodeY = (leftPos.y + rightPos.y) / 2;
      const path = doc.createElementNS(NS, 'path');
      path.setAttribute('d', [
        `M ${leftPos.x} ${leftPos.y} H ${nodeX}`,
        `M ${rightPos.x} ${rightPos.y} H ${nodeX}`,
        `M ${nodeX} ${leftPos.y} V ${rightPos.y}`
      ].join(' '));
      group.appendChild(path);
      return { x: nodeX, y: nodeY };
    };

    const visitHorizontal = node => {
      if(!node){
        return { x: startX, y: startY };
      }
      if(!node.left || !node.right){
        const rawIndex = Array.isArray(node.indices) ? node.indices[0] : null;
        const orderPos = orderIndex.has(rawIndex) ? orderIndex.get(rawIndex) : 0;
        const x = startX + orderPos * cellSize + cellSize / 2;
        return { x, y: startY };
      }
      const leftPos = visitHorizontal(node.left);
      const rightPos = visitHorizontal(node.right);
      const distance = Math.max(0, Number(node.distance) || 0);
      const nodeY = startY + (distance / safeMaxDistance) * length;
      const nodeX = (leftPos.x + rightPos.x) / 2;
      const path = doc.createElementNS(NS, 'path');
      path.setAttribute('d', [
        `M ${leftPos.x} ${leftPos.y} V ${nodeY}`,
        `M ${rightPos.x} ${rightPos.y} V ${nodeY}`,
        `M ${leftPos.x} ${nodeY} H ${rightPos.x}`
      ].join(' '));
      group.appendChild(path);
      return { x: nodeX, y: nodeY };
    };

    const rootPos = orientation === 'horizontal' ? visitHorizontal(tree) : visitVertical(tree);
    console.debug('Debug: heatmap renderDendrogram complete', {
      orientation,
      startX,
      startY,
      length,
      maxDistance,
      root: rootPos,
      leafCount: order.length
    });
    return group;
  }

  function hexToRgb(hex){
    const normalized = hex?.toString?.().replace('#', '');
    if(!normalized || normalized.length < 6) return { r: 200, g: 200, b: 200 };
    const bigint = parseInt(normalized.length === 3 ? normalized.split('').map(ch => ch + ch).join('') : normalized, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return { r, g, b };
  }

  function mixColor(a, b, t){
    const clamped = Math.min(1, Math.max(0, t));
    const r = Math.round(a.r + (b.r - a.r) * clamped);
    const g = Math.round(a.g + (b.g - a.g) * clamped);
    const bVal = Math.round(a.b + (b.b - a.b) * clamped);
    return `rgb(${r},${g},${bVal})`;
  }

  function rgbToCss(rgb){
    if(!rgb || !Number.isFinite(rgb.r) || !Number.isFinite(rgb.g) || !Number.isFinite(rgb.b)){
      console.debug('Debug: heatmap rgbToCss received invalid rgb', { rgb });
      return '#000000';
    }
    const clamp = value => Math.min(255, Math.max(0, Math.round(value)));
    const css = `rgb(${clamp(rgb.r)},${clamp(rgb.g)},${clamp(rgb.b)})`;
    console.debug('Debug: heatmap rgbToCss computed css string', { rgb, css });
    return css;
  }

  function colorForValue(entry, palette, useAbs){
    if(!entry || !Number.isFinite(entry.raw) || !Number.isFinite(entry.value)){
      return '#d0d0d0';
    }
    if(useAbs){
      return mixColor(palette.zero, palette.positive, Math.abs(entry.raw));
    }
    if(entry.raw >= 0){
      return mixColor(palette.zero, palette.positive, entry.raw);
    }
    return mixColor(palette.negative, palette.zero, Math.abs(entry.raw));
  }

  function textColorForBackground(fill){
    const rgb = hexToRgb(fill.startsWith('#') ? fill : (() => {
      const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(fill);
      if(m){
        return `#${Number(m[1]).toString(16).padStart(2,'0')}${Number(m[2]).toString(16).padStart(2,'0')}${Number(m[3]).toString(16).padStart(2,'0')}`;
      }
      return '#d0d0d0';
    })());
    const luminance = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
    return luminance > 160 ? '#222' : '#fff';
  }

  function isSvgBoxAspectLocked(svgBox){
    if(!svgBox){ return false; }
    const dataset = svgBox.dataset || {};
    if(dataset.resizerAspectLocked === 'false'){ return false; }
    if(dataset.resizerAspectLocked === 'true'){ return true; }
    if(dataset.lockRatio === '1' || dataset.lock === '1'){ return true; }
    return false;
  }

  function applySvgBoxAspect(svgBox, options){
    if(!svgBox || typeof svgBox.style?.setProperty !== 'function'){ return; }
    const opts = options || {};
    const locked = !!opts.locked;
    if(locked){
      const width = Number(opts.width);
      const height = Number(opts.height);
      if(Number.isFinite(width) && Number.isFinite(height) && height > 0){
        const ratio = width / height;
        svgBox.style.setProperty('--graph-aspect-ratio', String(ratio));
        try{
          svgBox.style.aspectRatio = String(ratio);
        }catch(err){
          console.debug('Debug: heatmap aspect ratio style assignment error', { error: err?.message || String(err) });
        }
      }
      return;
    }
    svgBox.style.setProperty('--graph-aspect-ratio', 'auto');
    try{
      svgBox.style.aspectRatio = 'auto';
    }catch(err){
      console.debug('Debug: heatmap aspect ratio auto assignment error', { error: err?.message || String(err) });
    }
  }

  function applyTextAspectCorrection(options){
    const opts = options || {};
    const svg = opts.svg;
    if(!svg || typeof chartStyle.computeViewBoxScale !== 'function'){ return; }
    const svgBox = opts.svgBox || svg.closest?.('.svgbox') || null;
    const viewBoxWidth = Number.isFinite(opts.viewBoxWidth) ? Number(opts.viewBoxWidth) : Number(svg.viewBox?.baseVal?.width);
    const viewBoxHeight = Number.isFinite(opts.viewBoxHeight) ? Number(opts.viewBoxHeight) : Number(svg.viewBox?.baseVal?.height);
    const viewScale = chartStyle.computeViewBoxScale({
      svg,
      svgBox,
      viewBoxWidth,
      viewBoxHeight,
      displayWidth: Number(opts.displayWidth),
      displayHeight: Number(opts.displayHeight),
      debugLabel: opts.debugLabel || 'heatmap-text-scale'
    });
    const scaleX = Number(viewScale?.scaleX);
    const scaleY = Number(viewScale?.scaleY);
    if(!Number.isFinite(scaleX) || !Number.isFinite(scaleY)){ return; }
    if(Math.abs(scaleX - scaleY) < 0.001){ return; }
    const uniform = Number.isFinite(viewScale.scale) && viewScale.scale > 0
      ? viewScale.scale
      : Math.sqrt(Math.max(scaleX * scaleY, 0)) || 1;
    const adjustX = scaleX > 0 ? uniform / scaleX : 1;
    const adjustY = scaleY > 0 ? uniform / scaleY : 1;
    const texts = svg.querySelectorAll ? svg.querySelectorAll('text') : [];
    texts.forEach(text => {
      const x = Number(text.getAttribute('x'));
      const y = Number(text.getAttribute('y'));
      if(!Number.isFinite(x) || !Number.isFinite(y)){ return; }
      const matrix = `matrix(${adjustX},0,0,${adjustY},${x - adjustX * x},${y - adjustY * y})`;
      const existing = text.getAttribute('transform');
      text.setAttribute('transform', existing ? `${matrix} ${existing}` : matrix);
      text.dataset.heatmapAspectCorrected = '1';
    });
    console.debug('Debug: heatmap text aspect correction applied', {
      scaleX,
      scaleY,
      adjustX,
      adjustY,
      uniform
    });
  }

  function renderEmpty(message){
    clearCachedRenderState();
    if(!state.svg) return;
    while(state.svg.firstChild){
      state.svg.removeChild(state.svg.firstChild);
    }
    state.svg.setAttribute('viewBox', '0 0 400 200');

    const svgBox = state.svgBox || state.svg?.closest('.svgbox') || null;
    const aspectLocked = isSvgBoxAspectLocked(svgBox);
    state.svg.setAttribute('preserveAspectRatio', aspectLocked ? 'xMidYMid meet' : 'none');
    applySvgBoxAspect(svgBox, { locked: aspectLocked, width: 400, height: 200 });
    console.debug('Debug: heatmap empty viewBox set', {
      aspectLocked,
      preserveAspectRatio: state.svg.getAttribute('preserveAspectRatio')
    });

    const text = global.document.createElementNS(NS, 'text');
    text.setAttribute('x', '200');
    text.setAttribute('y', '100');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('font-size', '16');
    text.setAttribute('fill', '#555');
    text.textContent = message;
    state.svg.appendChild(text);
    markFontEditable(text, 'emptyMessage', 'heatmap-empty');
    ensureGraphViewport(state.svg, { padding: 16, debugLabel: 'heatmap-empty' });
  }

  function appendStatRow(labelText, strongValueText, options = {}){
    const { trailing = [] } = options;
    const row = global.document.createElement('div');
    const labelSpan = global.document.createElement('span');
    labelSpan.textContent = `${labelText}: `;
    row.append(labelSpan);
    if(strongValueText !== undefined){
      const strongEl = global.document.createElement('strong');
      strongEl.textContent = strongValueText;
      row.append(strongEl);
    }
    trailing.forEach(text => {
      if(text !== undefined && text !== null && text !== ''){
        row.append(global.document.createTextNode(String(text)));
      }
    });
    state.statsEl.append(row);
    console.debug('Debug: heatmap appendStatRow executed', { labelText, hasStrongValue: strongValueText !== undefined, trailingCount: trailing.length }); // Debug: track stat row creation
    return row;
  }

  function updateStats(stats){
    state.lastStats = stats ? { ...stats } : null;
    if(!state.statsEl){
      console.debug('Debug: heatmap stats element missing');
      return;
    }
    state.statsEl.textContent = '';
    if(!stats){
      state.statsEl.textContent = 'Add numeric data to draw the heatmap.';
      return;
    }
    if(stats.type === 'correlation'){
      const methodLookup = {
        pearson: 'Pearson (linear)',
        spearman: 'Spearman (rank)',
        uncentered: 'Correlation (uncentered)'
      };
      const methodLabel = methodLookup[stats.method] || stats.method || 'Pearson (linear)';
      appendStatRow('Items analysed', String(stats.itemCount || 0));
      appendStatRow('Pairs evaluated', String(stats.pairCount || 0));
      appendStatRow('Method', methodLabel, { trailing: stats.useAbs ? [' (absolute values shown)'] : [] });
      if(stats.rowClusterLabel){
        appendStatRow('Row clustering', stats.rowClusterLabel + (stats.rowDendrogram ? ' (dendrogram)' : ''));
      }
      if(stats.columnClusterLabel && (!stats.rowClusterLabel || stats.columnClusterLabel !== stats.rowClusterLabel)){
        appendStatRow('Column clustering', stats.columnClusterLabel + (stats.columnDendrogram ? ' (dendrogram)' : ''));
      }else if(stats.columnDendrogram && stats.rowClusterLabel === stats.columnClusterLabel && stats.columnDendrogram !== stats.rowDendrogram){
        appendStatRow('Column dendrogram', 'Shown');
      }
      if(stats.strongest){
        const label = Array.isArray(stats.strongest.labels)
          ? stats.strongest.labels.join(' vs ')
          : String(stats.strongest.labels || '');
        const displayValue = Number.isFinite(stats.strongest.value)
          ? stats.strongest.value
          : Number.isFinite(stats.strongest.abs)
            ? stats.strongest.abs
            : Number.isFinite(stats.strongest.raw)
              ? Math.abs(stats.strongest.raw)
              : NaN;
        const row = appendStatRow('Strongest |r|', label);
        const formatted = Number.isFinite(displayValue) ? displayValue.toFixed(stats.decimals ?? 2) : 'n/a';
        row.append(global.document.createTextNode(` = ${formatted}`));
        const details = [];
        if(Number.isFinite(stats.strongest.raw)){
          details.push(`raw r = ${stats.strongest.raw.toFixed(stats.decimals ?? 2)}`);
        }
        if(Number.isFinite(stats.strongest.count)){
          details.push(`n=${stats.strongest.count}`);
        }
        if(details.length){
          row.append(global.document.createTextNode(` (${details.join(', ')})`));
        }
      }
      if(stats.mostNegative && !stats.useAbs){
        const label = Array.isArray(stats.mostNegative.labels)
          ? stats.mostNegative.labels.join(' vs ')
          : String(stats.mostNegative.labels || '');
        const row = appendStatRow('Most negative r', label);
        const pieces = [];
        if(Number.isFinite(stats.mostNegative.value)){
          pieces.push(` = ${stats.mostNegative.value.toFixed(stats.decimals ?? 2)}`);
        }
        if(Number.isFinite(stats.mostNegative.count)){
          pieces.push(` (n=${stats.mostNegative.count})`);
        }
        row.append(global.document.createTextNode(pieces.join('')));
      }
      return;
    }
    if(stats.type === 'values'){
      appendStatRow('Rows', String(stats.rowCount || 0));
      appendStatRow('Columns', String(stats.columnCount || 0));
      if(Number.isFinite(stats.finiteCount)){
        appendStatRow('Cells with data', String(stats.finiteCount));
      }
      if(Number.isFinite(stats.min)){
        appendStatRow('Minimum', stats.min.toFixed(stats.decimals ?? 2));
      }
      if(Number.isFinite(stats.max)){
        appendStatRow('Maximum', stats.max.toFixed(stats.decimals ?? 2));
      }
      if(Number.isFinite(stats.mean)){
        appendStatRow('Mean', stats.mean.toFixed(stats.decimals ?? 2));
      }
      if(stats.logApplied !== undefined){
        appendStatRow('Log transform', stats.logApplied ? 'Applied' : 'Not applied');
      }
      if(stats.rowsFiltered){
        appendStatRow('Rows filtered', String(stats.rowsFiltered));
      }
      if(stats.columnsRemoved){
        appendStatRow('Columns removed', String(stats.columnsRemoved));
      }
      if(stats.rowClusterLabel){
        appendStatRow('Row clustering', stats.rowClusterLabel + (stats.rowDendrogram ? ' (dendrogram)' : ''));
      }
      if(stats.columnClusterLabel){
        appendStatRow('Column clustering', stats.columnClusterLabel + (stats.columnDendrogram ? ' (dendrogram)' : ''));
      }
      if(stats.adjustments){
        if(stats.adjustments.centerRows){
          appendStatRow('Rows centered', String(stats.adjustments.centerRows));
        }
        if(stats.adjustments.normalizeRows && stats.adjustments.normalizeRows.normalized !== undefined){
          appendStatRow('Rows normalized', String(stats.adjustments.normalizeRows.normalized));
        }
        if(stats.adjustments.centerColumns){
          appendStatRow('Columns centered', String(stats.adjustments.centerColumns));
        }
        if(stats.adjustments.normalizeColumns && stats.adjustments.normalizeColumns.normalized !== undefined){
          appendStatRow('Columns normalized', String(stats.adjustments.normalizeColumns.normalized));
        }
      }
      return;
    }
    if(stats.type === 'empty'){
      state.statsEl.textContent = stats.message || 'No data available for the current configuration.';
      return;
    }
    state.statsEl.textContent = 'Add numeric data to draw the heatmap.';
  }

  function drawHeatmap({
    orderedRowLabels,
    orderedColumnLabels,
    orderedCells,
    rowOrder,
    columnOrder,
    rowClustering,
    columnClustering,
    showRowDendrogram,
    showColumnDendrogram,
    maskLower,
    cellSize,
    fontSize,
    showValues,
    decimals,
    colorScale
  }){
    const rowCount = orderedRowLabels.length;
    const columnCount = orderedColumnLabels.length;
    if(rowCount === 0 || columnCount === 0){
      renderEmpty('Add numeric data to draw the heatmap.');
      return;
    }
    const doc = global.document;
    while(state.svg.firstChild){
      state.svg.removeChild(state.svg.firstChild);
    }
    const containerRect = state.svgBox?.getBoundingClientRect?.();
    let fontInfo = null;
    if(typeof chartStyle.resolveScaledFontSize === 'function'){
      fontInfo = chartStyle.resolveScaledFontSize({
        rawSize: refs.fontSize?.value ?? fontSize,
        basePt: fontSize,
        width: containerRect?.width,
        height: containerRect?.height,
        svgBox: state.svgBox,
        input: refs.fontSize,
        scopeId: 'heatmap'
      });
      if(typeof chartStyle.renderFontSizeLabel === 'function'){
        chartStyle.renderFontSizeLabel({ element: refs.fontSizeVal, fontInfo, input: refs.fontSize });
      }
    }
    const scaledFontSize = Number.isFinite(fontInfo?.scaledPx) ? fontInfo.scaledPx : fontSize;
    let marginLeft = 160;
    let marginTop = 160;
    let marginRight = 120;
    let marginBottom = 120;
    const maxRowLabelLength = orderedRowLabels.reduce((acc, label) => Math.max(acc, String(label || '').length), 0);
    const maxColumnLabelLength = orderedColumnLabels.reduce((acc, label) => Math.max(acc, String(label || '').length), 0);
    marginLeft = Math.max(marginLeft, Math.min(280, scaledFontSize * (maxRowLabelLength * 0.6 + 4)));
    marginTop = Math.max(marginTop, Math.min(260, scaledFontSize * (maxColumnLabelLength * 0.6 + 4)));
    const rowDendroWidth = showRowDendrogram && rowClustering?.tree ? Math.min(220, Math.max(60, Math.round(cellSize * 1.5))) : 0;
    const columnDendroHeight = showColumnDendrogram && columnClustering?.tree ? Math.min(180, Math.max(60, Math.round(cellSize * 1.2))) : 0;
    const dendroPadding = (rowDendroWidth || columnDendroHeight) ? Math.max(12, Math.round(cellSize * 0.3)) : Math.max(8, Math.round(cellSize * 0.2));
    if(rowDendroWidth){
      marginRight += rowDendroWidth + dendroPadding;
    }
    if(columnDendroHeight){
      marginBottom += columnDendroHeight + dendroPadding;
    }
    const scaleWidth = 36;
    const scalePadding = 24;
    const scaleLabelGap = 48;
    marginRight += scaleWidth + scalePadding + scaleLabelGap;
    const heatmapWidth = columnCount * cellSize;
    const heatmapHeight = rowCount * cellSize;
    const totalWidth = marginLeft + heatmapWidth + marginRight;
    const totalHeight = marginTop + heatmapHeight + marginBottom;
    state.svg.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);

    const svgBox = state.svgBox || state.svg?.closest('.svgbox') || null;
    const aspectLocked = isSvgBoxAspectLocked(svgBox);
    const preserveAspect = aspectLocked ? 'xMidYMid meet' : 'none';
    state.svg.setAttribute('preserveAspectRatio', preserveAspect);
    applySvgBoxAspect(svgBox, { locked: aspectLocked, width: totalWidth, height: totalHeight });
    console.debug('Debug: heatmap graph viewBox set', {
      aspectLocked,
      preserveAspect,
      totalWidth,
      totalHeight,
      preserveAspectRatio: state.svg.getAttribute('preserveAspectRatio')
    });

    const defs = doc.createElementNS(NS, 'defs');
    
    
    state.svg.appendChild(defs);
    const gradientId = `heatmap-scale-${Math.floor((global.performance?.now?.() || Date.now()) * 1000)}`;
    const gradient = doc.createElementNS(NS, 'linearGradient');
    gradient.setAttribute('id', gradientId);
    gradient.setAttribute('x1', '0%');
    gradient.setAttribute('x2', '0%');
    gradient.setAttribute('y1', '100%');
    gradient.setAttribute('y2', '0%');
    (colorScale?.stops || []).forEach(stopInfo => {
      const stop = doc.createElementNS(NS, 'stop');
      stop.setAttribute('offset', `${stopInfo.offset}%`);
      stop.setAttribute('stop-color', stopInfo.color);
      gradient.appendChild(stop);
    });
    defs.appendChild(gradient);
    const g = doc.createElementNS(NS, 'g');
    state.svg.appendChild(g);
    orderedRowLabels.forEach((label, index) => {
      const text = doc.createElementNS(NS, 'text');
      text.setAttribute('x', String(marginLeft - 12));
      text.setAttribute('y', String(marginTop + index * cellSize + cellSize / 2));
      text.setAttribute('text-anchor', 'end');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('font-size', String(scaledFontSize));
      text.textContent = label;
      markFontEditable(text, 'rowLabel', `row-label-${index}`);
      g.appendChild(text);
    });
    orderedColumnLabels.forEach((label, index) => {
      const text = doc.createElementNS(NS, 'text');
      const x = marginLeft + index * cellSize + cellSize / 2;
      const y = marginTop - 12;
      text.setAttribute('x', String(x));
      text.setAttribute('y', String(y));
      text.setAttribute('font-size', String(scaledFontSize));
      text.setAttribute('text-anchor', 'start');
      text.setAttribute('dominant-baseline', 'text-before-edge');
      text.setAttribute('transform', `rotate(-90 ${x} ${y})`);
      text.textContent = label;
      markFontEditable(text, 'columnLabel', `column-label-${index}`);
      g.appendChild(text);
    });
    for(let rowIndex = 0; rowIndex < rowCount; rowIndex += 1){
      for(let columnIndex = 0; columnIndex < columnCount; columnIndex += 1){
        if(maskLower && columnIndex < rowIndex){
          continue;
        }
        const cell = orderedCells[rowIndex]?.[columnIndex] || {};
        const x = marginLeft + columnIndex * cellSize;
        const y = marginTop + rowIndex * cellSize;
        const rect = doc.createElementNS(NS, 'rect');
        rect.setAttribute('x', String(x));
        rect.setAttribute('y', String(y));
        rect.setAttribute('width', String(cellSize));
        rect.setAttribute('height', String(cellSize));
        rect.setAttribute('stroke', '#fff');
        rect.setAttribute('stroke-width', '1');
        rect.setAttribute('fill', cell.fill || '#d0d0d0');
        if(cell.title){
          const title = doc.createElementNS(NS, 'title');
          title.textContent = cell.title;
          rect.appendChild(title);
        }
        g.appendChild(rect);
        if(showValues && Number.isFinite(cell.value)){
          const text = doc.createElementNS(NS, 'text');
          text.setAttribute('x', String(x + cellSize / 2));
          text.setAttribute('y', String(y + cellSize / 2));
          text.setAttribute('text-anchor', 'middle');
          text.setAttribute('dominant-baseline', 'middle');
          const cellFont = Math.max(8, Math.round(scaledFontSize * 0.85));
          text.setAttribute('font-size', String(cellFont));
          text.setAttribute('fill', textColorForBackground(cell.fill || '#d0d0d0'));
          text.textContent = cell.value.toFixed(decimals ?? 2);
          markFontEditable(text, 'cellValue', `cell-${rowIndex}-${columnIndex}`);
          g.appendChild(text);
        }
      }
    }
    const scaleStartX = marginLeft + heatmapWidth + (rowDendroWidth ? rowDendroWidth + dendroPadding : 0) + scalePadding;
    const scaleStartY = marginTop;
    const scaleHeight = heatmapHeight;
    const scaleGroup = doc.createElementNS(NS, 'g');
    scaleGroup.setAttribute('class', 'heatmap-color-scale');
    const scaleRect = doc.createElementNS(NS, 'rect');
    scaleRect.setAttribute('x', String(scaleStartX));
    scaleRect.setAttribute('y', String(scaleStartY));
    scaleRect.setAttribute('width', String(scaleWidth));
    scaleRect.setAttribute('height', String(scaleHeight));
    scaleRect.setAttribute('fill', `url(#${gradientId})`);
    scaleRect.setAttribute('stroke', '#333');
    scaleRect.setAttribute('stroke-width', '1');
    scaleGroup.appendChild(scaleRect);
    const tickStartX = scaleStartX + scaleWidth;
    const tickLabelX = tickStartX + Math.max(8, Math.round(scaleLabelGap * 0.4));
    const tickLength = Math.max(6, Math.round(scaleWidth * 0.35));
    const ticks = colorScale?.ticks || [];
    ticks.forEach(tick => {
      const ratio = colorScale?.valueToRatio ? Math.min(1, Math.max(0, colorScale.valueToRatio(tick.value))) : 0;
      const y = scaleStartY + (1 - ratio) * scaleHeight;
      const line = doc.createElementNS(NS, 'line');
      line.setAttribute('x1', String(tickStartX));
      line.setAttribute('x2', String(tickStartX + tickLength));
      line.setAttribute('y1', String(y));
      line.setAttribute('y2', String(y));
      line.setAttribute('stroke', '#333');
      line.setAttribute('stroke-width', '1');
      scaleGroup.appendChild(line);
      const tickLabel = doc.createElementNS(NS, 'text');
      tickLabel.setAttribute('x', String(tickLabelX));
      tickLabel.setAttribute('y', String(y));
      tickLabel.setAttribute('dominant-baseline', 'middle');
      const tickFont = Math.max(8, Math.round(scaledFontSize * 0.9));
      tickLabel.setAttribute('font-size', String(tickFont));
      tickLabel.textContent = tick.label !== undefined ? String(tick.label) : (colorScale?.tickFormatter ? colorScale.tickFormatter(tick.value) : String(tick.value));
      markFontEditable(tickLabel, 'scaleTick', `scale-tick-${tick.value}`);
      scaleGroup.appendChild(tickLabel);
    });
    g.appendChild(scaleGroup);
    if(showRowDendrogram && rowClustering?.tree){
      renderDendrogram({
        doc,
        parent: g,
        tree: rowClustering.tree,
        order: rowOrder,
        startX: marginLeft + heatmapWidth + dendroPadding,
        startY: marginTop,
        length: rowDendroWidth,
        cellSize,
        maxDistance: rowClustering.maxDistance,
        orientation: 'vertical'
      });
    }
    if(showColumnDendrogram && columnClustering?.tree){
      renderDendrogram({
        doc,
        parent: g,
        tree: columnClustering.tree,
        order: columnOrder,
        startX: marginLeft,
        startY: marginTop + heatmapHeight + dendroPadding,
        length: columnDendroHeight,
        cellSize,
        maxDistance: columnClustering.maxDistance,
        orientation: 'horizontal'
      });
    }
    ensureGraphViewport(state.svg, { padding: Math.max(fontSize, 16), debugLabel: 'heatmap-graph' });
    if(!aspectLocked){
      applyTextAspectCorrection({
        svg: state.svg,
        svgBox,
        viewBoxWidth: totalWidth,
        viewBoxHeight: totalHeight,
        displayWidth: containerRect?.width,
        displayHeight: containerRect?.height,
        debugLabel: 'heatmap-text-correction'
      });
    }
    state.layout?.syncPanels?.({ skipSchedule: true });
    console.debug('Debug: heatmap drawHeatmap complete', {
      rows: rowCount,
      columns: columnCount,
      showRowDendrogram,
      showColumnDendrogram
    });
  }

  function renderCorrelationHeatmap(processed, settings){
    const axis = settings.view === 'corr-columns' ? 'columns' : 'rows';
    const labels = axis === 'columns' ? processed.columnLabels : processed.rowLabels;
    const items = buildAxisItems(processed.matrix, labels, axis);
    if(items.length < 2){
      renderEmpty('Add at least two entries with numeric values to calculate correlations.');
      updateStats(null);
      return;
    }
    const matrix = Array.from({ length: items.length }, () => Array(items.length).fill(null));
    let pairCount = 0;
    let strongest = null;
    let mostNegative = null;
    for(let i = 0; i < items.length; i += 1){
      const selfCount = items[i].vector.filter(value => Number.isFinite(value)).length;
      matrix[i][i] = { raw: 1, count: selfCount };
      for(let j = i + 1; j < items.length; j += 1){
        const entry = calculateCorrelationEntry(items[i].vector, items[j].vector, settings.correlationMethod);
        const raw = Number.isFinite(entry.corr) ? entry.corr : NaN;
        matrix[i][j] = { raw, count: entry.count };
        matrix[j][i] = { raw, count: entry.count };
        if(Number.isFinite(raw)){
          pairCount += 1;
          const absValue = Math.abs(raw);
          if(!strongest || absValue > strongest.abs){
            strongest = {
              labels: [items[i].label, items[j].label],
              raw,
              abs: absValue,
              value: absValue,
              count: entry.count
            };
          }
          if(!mostNegative || raw < mostNegative.value){
            mostNegative = {
              labels: [items[i].label, items[j].label],
              value: raw,
              count: entry.count
            };
          }
        }
      }
    }
    const clusterConfig = axis === 'columns' ? settings.clustering.columns : settings.clustering.rows;
    const positionByIndex = new Map(items.map((item, idx) => [item.index, idx]));
    const clusterResult = clusterConfig.enabled && items.length > 1
      ? hierarchicalCluster(items, clusterConfig.metric, settings.clustering.linkage)
      : null;
    const orderPositions = clusterResult
      ? clusterResult.order.map(idx => positionByIndex.get(idx)).filter(idx => idx !== undefined)
      : items.map((_, idx) => idx);
    const orderedRowLabels = orderPositions.map(pos => items[pos].label);
    const orderedEntries = orderPositions.map(rowPos => orderPositions.map(colPos => {
      const entry = matrix[rowPos][colPos];
      if(!entry){
        return { raw: NaN, count: 0 };
      }
      return { raw: entry.raw, count: entry.count };
    }));
    const showRowDendrogram = !!(clusterResult && clusterConfig.showDendrogram);
    const showColumnDendrogram = showRowDendrogram;
    const model = {
      type: 'correlation',
      orderedRowLabels,
      orderedColumnLabels: orderedRowLabels,
      cells: orderedEntries,
      rowOrder: orderPositions.map(pos => items[pos].index),
      columnOrder: orderPositions.map(pos => items[pos].index),
      rowClustering: clusterResult,
      columnClustering: clusterResult,
      showRowDendrogram,
      showColumnDendrogram
    };
    const viewOptions = extractViewOptions(settings);
    renderModelWithView(model, viewOptions);
    updateStats({
      type: 'correlation',
      itemCount: items.length,
      pairCount,
      method: settings.correlationMethod,
      useAbs: settings.useAbsolute,
      decimals: settings.decimals,
      strongest,
      mostNegative: settings.useAbsolute ? null : mostNegative,
      rowClusterLabel: clusterResult && clusterConfig.enabled ? `${clusterConfig.metric} (${settings.clustering.linkage})` : null,
      columnClusterLabel: clusterResult && clusterConfig.enabled ? `${clusterConfig.metric} (${settings.clustering.linkage})` : null,
      rowDendrogram: showRowDendrogram,
      columnDendrogram: showColumnDendrogram
    });
  }

  function renderValuesHeatmap(processed, settings){
    const rowItems = buildAxisItems(processed.matrix, processed.rowLabels, 'rows');
    const columnItems = buildAxisItems(processed.matrix, processed.columnLabels, 'columns');
    const rowPositionByIndex = new Map(rowItems.map((item, idx) => [item.index, idx]));
    const columnPositionByIndex = new Map(columnItems.map((item, idx) => [item.index, idx]));
    const rowCluster = settings.clustering.rows.enabled && rowItems.length > 1
      ? hierarchicalCluster(rowItems, settings.clustering.rows.metric, settings.clustering.linkage)
      : null;
    const columnCluster = settings.clustering.columns.enabled && columnItems.length > 1
      ? hierarchicalCluster(columnItems, settings.clustering.columns.metric, settings.clustering.linkage)
      : null;
    const rowOrderPositions = rowCluster
      ? rowCluster.order.map(idx => rowPositionByIndex.get(idx)).filter(idx => idx !== undefined)
      : rowItems.map((_, idx) => idx);
    const columnOrderPositions = columnCluster
      ? columnCluster.order.map(idx => columnPositionByIndex.get(idx)).filter(idx => idx !== undefined)
      : columnItems.map((_, idx) => idx);
    const orderedRowLabels = rowOrderPositions.map(pos => processed.rowLabels[pos]);
    const orderedColumnLabels = columnOrderPositions.map(pos => processed.columnLabels[pos]);
    const orderedMatrix = rowOrderPositions.map(rowPos => columnOrderPositions.map(colPos => processed.matrix[rowPos][colPos]));
    const orderedCells = orderedMatrix.map(row => row.map(value => ({ value })));
    const min = processed.stats.min;
    const max = processed.stats.max;
    const showRowDendrogram = !!(rowCluster && settings.clustering.rows.showDendrogram);
    const showColumnDendrogram = !!(columnCluster && settings.clustering.columns.showDendrogram);
    const model = {
      type: 'values',
      orderedRowLabels,
      orderedColumnLabels,
      cells: orderedCells,
      rowOrder: rowOrderPositions.map(pos => rowItems[pos].index),
      columnOrder: columnOrderPositions.map(pos => columnItems[pos].index),
      rowClustering: rowCluster,
      columnClustering: columnCluster,
      showRowDendrogram,
      showColumnDendrogram,
      valueStats: { min, max, stats: processed.stats },
      adjustmentSummary: processed.adjustmentSummary
    };
    const viewOptions = extractViewOptions(settings);
    renderModelWithView(model, viewOptions);
    updateStats({
      type: 'values',
      rowCount: orderedRowLabels.length,
      columnCount: orderedColumnLabels.length,
      min,
      max,
      mean: processed.stats.mean,
      decimals: settings.decimals,
      finiteCount: processed.stats.finiteCount,
      rowsFiltered: processed.stats.rowsFiltered,
      columnsRemoved: processed.stats.columnsRemoved,
      logApplied: processed.stats.logApplied,
      rowClusterLabel: rowCluster && settings.clustering.rows.enabled ? `${settings.clustering.rows.metric} (${settings.clustering.linkage})` : null,
      columnClusterLabel: columnCluster && settings.clustering.columns.enabled ? `${settings.clustering.columns.metric} (${settings.clustering.linkage})` : null,
      rowDendrogram: showRowDendrogram,
      columnDendrogram: showColumnDendrogram,
      adjustments: processed.adjustmentSummary
    });
  }

  function createCorrelationColorScale(viewOptions){
    if(!viewOptions){
      return null;
    }
    if(viewOptions.useAbsolute){
      return {
        stops: [
          { offset: 0, color: rgbToCss(hexToRgb(viewOptions.palette?.zero || '#f7f7f7')) },
          { offset: 100, color: rgbToCss(hexToRgb(viewOptions.palette?.positive || '#a50026')) }
        ],
        ticks: [0, 0.25, 0.5, 0.75, 1].map(value => ({ value, label: value.toFixed(viewOptions.decimals ?? 2) })),
        valueToRatio: value => Math.min(1, Math.max(0, value))
      };
    }
    return {
      stops: [
        { offset: 0, color: rgbToCss(hexToRgb(viewOptions.palette?.negative || '#313695')) },
        { offset: 50, color: rgbToCss(hexToRgb(viewOptions.palette?.zero || '#f7f7f7')) },
        { offset: 100, color: rgbToCss(hexToRgb(viewOptions.palette?.positive || '#a50026')) }
      ],
      ticks: [-1, -0.5, 0, 0.5, 1].map(value => ({ value, label: value.toFixed(viewOptions.decimals ?? 2) })),
      valueToRatio: value => (Math.min(1, Math.max(-1, value)) + 1) / 2
    };
  }

  function createValueColorScale(stats, palette, decimals){
    if(!stats){
      return null;
    }
    const min = stats.min;
    const max = stats.max;
    let stops;
    if(Number.isFinite(min) && Number.isFinite(max) && min < 0 && max > 0){
      stops = [
        { offset: 0, color: rgbToCss(hexToRgb(palette?.negative || '#313695')) },
        { offset: 50, color: rgbToCss(hexToRgb(palette?.zero || '#f7f7f7')) },
        { offset: 100, color: rgbToCss(hexToRgb(palette?.positive || '#a50026')) }
      ];
    }else if(Number.isFinite(max) && max <= 0){
      stops = [
        { offset: 0, color: rgbToCss(hexToRgb(palette?.negative || '#313695')) },
        { offset: 100, color: rgbToCss(hexToRgb(palette?.zero || '#f7f7f7')) }
      ];
    }else{
      stops = [
        { offset: 0, color: rgbToCss(hexToRgb(palette?.zero || '#f7f7f7')) },
        { offset: 100, color: rgbToCss(hexToRgb(palette?.positive || '#a50026')) }
      ];
    }
    const tickValues = [];
    if(Number.isFinite(min) && Number.isFinite(max)){
      for(let i = 0; i <= 4; i += 1){
        const ratio = i / 4;
        const value = min + (max - min) * ratio;
        tickValues.push({ value, label: value.toFixed(decimals ?? 2) });
      }
    }
    return {
      stops,
      ticks: tickValues,
      valueToRatio: value => {
        if(!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || min === max){
          return 0;
        }
        if(min < 0 && max > 0){
          const maxAbs = Math.max(Math.abs(min), Math.abs(max));
          return (Math.min(maxAbs, Math.max(-maxAbs, value)) + maxAbs) / (2 * maxAbs);
        }
        return (value - min) / (max - min);
      }
    };
  }

  function buildDrawPayloadFromModel(model, viewOptions){
    if(!model || !viewOptions){
      return null;
    }
    if(model.type === 'correlation'){
      const palette = {
        negative: hexToRgb(viewOptions.palette?.negative || '#313695'),
        zero: hexToRgb(viewOptions.palette?.zero || '#f7f7f7'),
        positive: hexToRgb(viewOptions.palette?.positive || '#a50026')
      };
      const orderedCells = model.cells.map((row, rowIndex) => row.map((cell, columnIndex) => {
        const raw = Number(cell?.raw);
        const count = Number(cell?.count);
        const displayValue = Number.isFinite(raw)
          ? (viewOptions.useAbsolute ? Math.abs(raw) : raw)
          : NaN;
        const fill = Number.isFinite(raw)
          ? colorForValue({ raw, value: displayValue }, palette, viewOptions.useAbsolute)
          : '#d0d0d0';
        const baseLabel = `${model.orderedRowLabels[rowIndex]} vs ${model.orderedColumnLabels[columnIndex]}`;
        const parts = [`${baseLabel}: ${Number.isFinite(displayValue) ? displayValue.toFixed(viewOptions.decimals ?? 2) : 'n/a'}`];
        if(Number.isFinite(count)){
          parts.push(`(n=${count})`);
        }
        return { fill, value: displayValue, title: parts.join(' ') };
      }));
      return {
        orderedRowLabels: model.orderedRowLabels,
        orderedColumnLabels: model.orderedColumnLabels,
        orderedCells,
        rowOrder: model.rowOrder,
        columnOrder: model.columnOrder,
        rowClustering: model.rowClustering,
        columnClustering: model.columnClustering,
        showRowDendrogram: model.showRowDendrogram,
        showColumnDendrogram: model.showColumnDendrogram,
        maskLower: !!viewOptions.maskLower,
        cellSize: viewOptions.cellSize,
        fontSize: viewOptions.fontSize,
        showValues: viewOptions.showValues,
        decimals: viewOptions.decimals,
        colorScale: createCorrelationColorScale(viewOptions)
      };
    }
    if(model.type === 'values'){
      const stats = model.valueStats?.stats || {};
      const colorMapper = createValueColorMapper(stats, viewOptions.palette);
      const orderedCells = model.cells.map((row, rowIndex) => row.map((cell, columnIndex) => {
        const value = cell?.value;
        const fill = colorMapper(value);
        const title = `${model.orderedRowLabels[rowIndex]} vs ${model.orderedColumnLabels[columnIndex]}: ${Number.isFinite(value) ? value.toFixed(viewOptions.decimals ?? 2) : 'n/a'}`;
        return { fill, value, title };
      }));
      return {
        orderedRowLabels: model.orderedRowLabels,
        orderedColumnLabels: model.orderedColumnLabels,
        orderedCells,
        rowOrder: model.rowOrder,
        columnOrder: model.columnOrder,
        rowClustering: model.rowClustering,
        columnClustering: model.columnClustering,
        showRowDendrogram: model.showRowDendrogram,
        showColumnDendrogram: model.showColumnDendrogram,
        maskLower: false,
        cellSize: viewOptions.cellSize,
        fontSize: viewOptions.fontSize,
        showValues: viewOptions.showValues,
        decimals: viewOptions.decimals,
        colorScale: createValueColorScale({ min: model.valueStats?.min, max: model.valueStats?.max }, viewOptions.palette, viewOptions.decimals)
      };
    }
    return null;
  }

  function renderModelWithView(model, viewOptions){
    const payload = buildDrawPayloadFromModel(model, viewOptions);
    if(!payload){
      debugLog('Debug: heatmap renderModelWithView skipped - missing payload');
      return false;
    }
    drawHeatmap(payload);
    state.lastRenderModel = model;
    state.lastViewOptions = viewOptions;
    return true;
  }

  function refreshStatsForView(viewOptions){
    if(!state.lastStats){
      return;
    }
    const stats = { ...state.lastStats };
    stats.decimals = viewOptions?.decimals ?? stats.decimals;
    if(stats.type === 'correlation'){
      stats.useAbs = !!viewOptions?.useAbsolute;
    }
    updateStats(stats);
  }

  function draw(){
    const drawOpts = pendingDrawOptions || {};
    pendingDrawOptions = {};
    try{
      if(!state.hot || !state.svg){
        console.debug('Debug: heatmap draw skipped - missing hot or svg');
        return;
      }
      const settings = collectSettings();
      const viewMatches = (state.lastRenderModel?.type === 'values' && settings.view === 'values')
        || (state.lastRenderModel?.type === 'correlation' && settings.view.startsWith('corr'));
      if(drawOpts.viewOnly){
        if(state.lastRenderModel && viewMatches){
          const viewOptions = extractViewOptions(settings);
          const applied = renderModelWithView(state.lastRenderModel, viewOptions);
          if(applied){
            refreshStatsForView(viewOptions);
            debugLog('Debug: heatmap view-only redraw applied', { reason: drawOpts.reason });
            return;
          }
          debugLog('Debug: heatmap view-only redraw fallback triggered');
        }else{
          debugLog('Debug: heatmap view-only redraw skipped - no cached render');
        }
        return;
      }
      const processed = prepareProcessedData(settings);
      if(!processed.ok){
        clearCachedRenderState();
        const reason = processed.reason;
        if(reason === 'no-data'){
          renderEmpty('Add numeric data to draw the heatmap.');
          updateStats(null);
        }else if(reason === 'filtered-out'){
          renderEmpty('No rows passed the current filters. Adjust your thresholds to view data.');
          updateStats({ type: 'empty', message: 'No rows passed the current filters.' });
        }else if(reason === 'adjustment-empty'){
          renderEmpty('All columns were removed after adjustments. Check normalization and centering settings.');
          updateStats({ type: 'empty', message: 'All columns were removed after adjustments.' });
        }
        return;
      }
      if(settings.view === 'values'){
        renderValuesHeatmap(processed, settings);
      }else{
        renderCorrelationHeatmap(processed, settings);
      }
    }catch(err){
      console.error('heatmap draw error', err);
    }
  }
  function getConfig(){
    return {
      view: refs.view?.value || 'corr-columns',
      method: refs.method?.value || 'pearson',
      useAbsolute: !!refs.absValues?.checked,
      maskLower: !!refs.maskLower?.checked,
      showValues: !!refs.showValues?.checked,
      decimals: clampDecimals(refs.decimals?.value),
      colors: {
        negative: refs.colorNegative?.value || '#313695',
        zero: refs.colorZero?.value || '#f7f7f7',
        positive: refs.colorPositive?.value || '#a50026'
      },
      cellSize: Number(refs.cellSize?.value) || 60,
      fontSize: Number(refs.fontSize?.value) || 12,
      fontStyles: exportFontStyles('heatmap') || undefined,
      filters: {
        presentEnabled: !!refs.filterPresentEnable?.checked,
        presentThreshold: Number(refs.filterPresentValue?.value),
        sdEnabled: !!refs.filterSdEnable?.checked,
        sdThreshold: Number(refs.filterSdValue?.value),
        absEnabled: !!refs.filterAbsEnable?.checked,
        absCount: Number(refs.filterAbsCount?.value),
        absValue: Number(refs.filterAbsValue?.value),
        rangeEnabled: !!refs.filterRangeEnable?.checked,
        rangeThreshold: Number(refs.filterRangeValue?.value)
      },
      adjust: {
        logTransform: !!refs.logTransform?.checked,
        centerRows: refs.centerGenes?.checked ? (getCheckedRadioValue('heatmapCenterGenesMode') || 'mean') : null,
        centerColumns: refs.centerArrays?.checked ? (getCheckedRadioValue('heatmapCenterArraysMode') || 'mean') : null,
        normalizeRows: !!refs.normalizeGenes?.checked,
        normalizeColumns: !!refs.normalizeArrays?.checked
      },
      clustering: {
        rows: {
          enabled: !!refs.clusterGenes?.checked,
          metric: refs.genesMetric?.value || 'pearson',
          showDendrogram: !!refs.showRowDendrogram?.checked
        },
        columns: {
          enabled: !!refs.clusterArrays?.checked,
          metric: refs.arraysMetric?.value || 'pearson',
          showDendrogram: !!refs.showColumnDendrogram?.checked
        },
        linkage: refs.linkage?.value || 'average'
      }
    };
  }

  function applyConfig(config){
    if(!config) return;
    if(refs.view){
      refs.view.value = config.view || 'corr-columns';
      refs.view.dispatchEvent(new Event('change'));
    }
    if(refs.method) refs.method.value = config.method || 'pearson';
    if(refs.absValues) refs.absValues.checked = !!config.useAbsolute;
    if(refs.maskLower) refs.maskLower.checked = !!config.maskLower;
    if(refs.showValues) refs.showValues.checked = config.showValues !== false;
    if(refs.decimals) refs.decimals.value = String(clampDecimals(config.decimals));
    if(refs.colorNegative) refs.colorNegative.value = config.colors?.negative || '#313695';
    if(refs.colorZero) refs.colorZero.value = config.colors?.zero || '#f7f7f7';
    if(refs.colorPositive) refs.colorPositive.value = config.colors?.positive || '#a50026';
    if(refs.cellSize){
      refs.cellSize.value = String(config.cellSize || 60);
      if(refs.cellSizeVal){ refs.cellSizeVal.textContent = refs.cellSize.value; }
      refs.cellSize.dispatchEvent(new Event('input'));
    }
    if(refs.fontSize){
      refs.fontSize.value = String(config.fontSize || 12);
      refs.fontSize.dispatchEvent(new Event('input'));
    }
    importFontStyles('heatmap', config.fontStyles || null);
    if(refs.filterPresentEnable){
      refs.filterPresentEnable.checked = !!config.filters?.presentEnabled;
      if(refs.filterPresentValue) refs.filterPresentValue.value = Number.isFinite(config.filters?.presentThreshold) ? config.filters.presentThreshold : 80;
      refs.filterPresentEnable.dispatchEvent(new Event('change'));
    }
    if(refs.filterSdEnable){
      refs.filterSdEnable.checked = !!config.filters?.sdEnabled;
      if(refs.filterSdValue) refs.filterSdValue.value = Number.isFinite(config.filters?.sdThreshold) ? config.filters.sdThreshold : 0;
      refs.filterSdEnable.dispatchEvent(new Event('change'));
    }
    if(refs.filterAbsEnable){
      refs.filterAbsEnable.checked = !!config.filters?.absEnabled;
      if(refs.filterAbsCount) refs.filterAbsCount.value = Number.isFinite(config.filters?.absCount) ? config.filters.absCount : 1;
      if(refs.filterAbsValue) refs.filterAbsValue.value = Number.isFinite(config.filters?.absValue) ? config.filters.absValue : 0;
      refs.filterAbsEnable.dispatchEvent(new Event('change'));
    }
    if(refs.filterRangeEnable){
      refs.filterRangeEnable.checked = !!config.filters?.rangeEnabled;
      if(refs.filterRangeValue) refs.filterRangeValue.value = Number.isFinite(config.filters?.rangeThreshold) ? config.filters.rangeThreshold : 0;
      refs.filterRangeEnable.dispatchEvent(new Event('change'));
    }
    if(refs.logTransform) refs.logTransform.checked = !!config.adjust?.logTransform;
    if(refs.centerGenes){
      refs.centerGenes.checked = !!config.adjust?.centerRows;
      const mode = config.adjust?.centerRows || 'mean';
      const radio = global.document.querySelector(`input[name="heatmapCenterGenesMode"][value="${mode}"]`);
      if(radio) radio.checked = true;
      refs.centerGenes.dispatchEvent(new Event('change'));
    }
    if(refs.centerArrays){
      refs.centerArrays.checked = !!config.adjust?.centerColumns;
      const mode = config.adjust?.centerColumns || 'mean';
      const radio = global.document.querySelector(`input[name="heatmapCenterArraysMode"][value="${mode}"]`);
      if(radio) radio.checked = true;
      refs.centerArrays.dispatchEvent(new Event('change'));
    }
    if(refs.normalizeGenes){
      refs.normalizeGenes.checked = !!config.adjust?.normalizeRows;
      refs.normalizeGenes.dispatchEvent(new Event('change'));
    }
    if(refs.normalizeArrays){
      refs.normalizeArrays.checked = !!config.adjust?.normalizeColumns;
      refs.normalizeArrays.dispatchEvent(new Event('change'));
    }
    if(refs.clusterGenes){
      refs.clusterGenes.checked = !!config.clustering?.rows?.enabled;
      if(refs.genesMetric) refs.genesMetric.value = config.clustering?.rows?.metric || 'pearson';
      if(refs.showRowDendrogram) refs.showRowDendrogram.checked = !!config.clustering?.rows?.showDendrogram;
      refs.clusterGenes.dispatchEvent(new Event('change'));
    }
    if(refs.clusterArrays){
      refs.clusterArrays.checked = !!config.clustering?.columns?.enabled;
      if(refs.arraysMetric) refs.arraysMetric.value = config.clustering?.columns?.metric || 'pearson';
      if(refs.showColumnDendrogram) refs.showColumnDendrogram.checked = !!config.clustering?.columns?.showDendrogram;
      refs.clusterArrays.dispatchEvent(new Event('change'));
    }
    if(refs.linkage){
      refs.linkage.value = config.clustering?.linkage || 'average';
      refs.linkage.dispatchEvent(new Event('change'));
    }
  }
  function getPayload(){
    const payload = {
      type: 'heatmap',
      data: state.hot ? state.hot.getData() : [],
      exclusions: state.hot?.exportExclusions?.() || (state.hot ? Shared.hot.exportExclusions(state.hot) : Shared.hot.exportExclusions(null)),
      config: getConfig()
    };
    console.debug('Debug: heatmap.getPayload captured state', {
      hasHot: !!state.hot,
      rows: payload.data?.length || 0,
      cols: payload.data?.[0]?.length || 0,
      method: payload.config?.method
    });
    return payload;
  }
  heatmap.getPayload = getPayload;

  heatmap.save = async function saveHeatmap(){
    console.debug('Debug: heatmap.save invoked', { hasHandle: !!state.fileHandle });
    if(!fileIO || typeof fileIO.saveGraphFile !== 'function'){
      console.error('heatmap.save missing fileIO.saveGraphFile');
      return;
    }
    const result = await fileIO.saveGraphFile({
      context: 'heatmap',
      fileHandle: state.fileHandle,
      getPayload,
      fileName: state.fileName,
      downloadFileName: state.fileName,
      setFileHandle: handle => { state.fileHandle = handle; },
      setFileName: name => { state.fileName = name; }
    });
    console.debug('Debug: heatmap.save result', result);
  };

  heatmap.saveAs = async function saveAsHeatmap(){
    console.debug('Debug: heatmap.saveAs invoked', { currentName: state.fileName });
    if(!fileIO || typeof fileIO.saveGraphFileAs !== 'function'){
      console.error('heatmap.saveAs missing fileIO.saveGraphFileAs');
      return;
    }
    const result = await fileIO.saveGraphFileAs({
      context: 'heatmap',
      getPayload,
      fileName: state.fileName,
      downloadFileName: state.fileName,
      setFileHandle: handle => { state.fileHandle = handle; },
      setFileName: name => { state.fileName = name; }
    });
    console.debug('Debug: heatmap.saveAs result', result);
  };

  heatmap.open = async function openHeatmap(){
    console.debug('Debug: heatmap.open invoked');
    if(!fileIO || typeof fileIO.openGraphFile !== 'function'){
      console.error('heatmap.open missing fileIO.openGraphFile');
      return;
    }
    const result = await fileIO.openGraphFile({
      context: 'heatmap',
      setFileHandle: handle => { state.fileHandle = handle; },
      setFileName: name => { state.fileName = name; },
      loadFromFile: file => heatmap.loadFromFile(file),
      triggerInput: () => {
        const input = $('heatmapGraphFile');
        if(input){
          input.value = '';
          input.click();
        }
      }
    });
    console.debug('Debug: heatmap.open result', result);
  };

  heatmap.loadFromFile = function loadHeatmapFromFile(file){
    const reader = new FileReader();
    reader.onload = e => {
      try{
        const obj = JSON.parse(e.target.result);
        console.log('heatmap graph loaded', obj);
        if(obj.type !== 'heatmap'){
          throw new Error('Invalid graph type');
        }
        state.hot?.loadData(obj.data || []);
        if(obj.exclusions && state.hot){
          state.hot.applyExclusions?.(obj.exclusions);
        }
        applyConfig(obj.config || {});
        state.scheduleDraw();
      }catch(err){
        console.error('heatmap load error', err);
      }
    };
    reader.readAsText(file);
  };

  heatmap.__internals = Object.assign({}, heatmap.__internals, {
    hierarchicalCluster,
    distanceBetweenVectors
  });

  heatmap.draw = draw;

  heatmap.init = function init(){
    if(heatmap.ready){
      console.debug('Debug: heatmap.init skipped - already ready');
      return;
    }
    console.debug('Debug: heatmap.init start');
    state.svg = $('heatmapSvg');
    if(state.svg){
      if(typeof chartStyle.applySvgDefaults === 'function'){
        chartStyle.applySvgDefaults(state.svg);
      }
      if(state.svg.dataset){
        state.svg.dataset.fontScope = 'heatmap';
      }
      if(fontControls && typeof fontControls.enableForSvg === 'function'){
        fontControls.enableForSvg(state.svg, { scopeId: 'heatmap' });
        console.debug('Debug: heatmap fontControls enableForSvg invoked', { hasFontControls: !!fontControls }); // Debug: font toolbar binding
      } else {
        console.debug('Debug: heatmap fontControls enableForSvg missing', { hasFontControls: !!fontControls });
      }
    }
    state.layout = Shared.componentLayout?.createStandardPanels({
      componentName: 'heatmap',
      selectors: {
        tablePanel: '#heatmapTablePanel',
        graphPanel: '#heatmapGraphPanel',
        panelResizer: '#heatmapPanelResizer',
        hotWrapper: '#heatmapHotWrapper',
        hotContainer: '#heatmapHot',
        svgBox: () => state.svg?.closest('.svgbox'),
        resizeTarget: () => state.svg?.closest('.svgbox')
      },
      onMinSvgWidth: value => {
        state.minSvgWidth = value;
        console.debug('Debug: heatmap layout minSvgWidth updated', { value });
      }
    });
    state.svgBox = state.layout?.elements?.svgBox || state.svg?.closest('.svgbox') || null;
    heatmapRenderRowEl = $('heatmapRenderRow');
    heatmapRenderButtonEl = $('heatmapRenderButton');
    heatmapAutoDrawNoticeEl = $('heatmapAutoDrawNotice');
    if(heatmapRenderButtonEl){
      heatmapRenderButtonEl.addEventListener('click', () => {
        debugLog('Debug: heatmap manual render button');
        state.scheduleDraw({ force: true, reason: 'manual-render' });
      });
    }
    initHot();
    initControls();
    initFileButtons();
    scheduleDrawHeatmapRaw = Shared.debounceFrame ? Shared.debounceFrame(draw) : draw;
    debugLog('Debug: heatmap scheduler configured', { hasDebounce: !!Shared.debounceFrame });
    state.layout?.setScheduleDraw?.(() => state.scheduleDraw());
    state.layout?.syncPanels?.();
    updateAutoDrawUi();
    evaluateAutoDrawThresholds();
    heatmap.ready = true;
    state.scheduleDraw();
  };

  heatmap.ensure = function ensure(){
    if(!heatmap.ready){
      heatmap.init();
    }
  };

})(window);

