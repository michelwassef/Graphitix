(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};
  const box = Components.box = Components.box || {};
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
  const axisControls = Shared.axisControls = Shared.axisControls || {};
  const formControls = Shared.formControls = Shared.formControls || {};
  box.__installed = true;
  box.ready = false;
  const fileIO = Shared.fileIO = Shared.fileIO || {};
  if(!fileIO.saveGraphFile){
    console.debug('Debug: box component awaiting Shared.fileIO helpers');
  }
  if(!Shared.tableImport || typeof Shared.tableImport.openFile !== 'function'){
    console.debug('Debug: box component awaiting Shared.tableImport helpers');
  }

  // PART: UTILS
  const NS='http://www.w3.org/2000/svg';
  const DEFAULT_BOX_COLORS=['#66c2a5','#fc8d62','#8da0cb','#e78ac3','#a6d854','#ffd92f','#e5c494','#b3b3b3'];
  const DEFAULT_ROWS=100, DEFAULT_COLS=10;
  const DEFAULT_AXIS_COLOR='#000000';
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
  const DEFAULT_VIOLIN_BANDWIDTH=1;
  const DEFAULT_VIOLIN_SAMPLE_COUNT=80;
  const VIOLIN_SAMPLE_MIN=8;
  const VIOLIN_SAMPLE_MAX=2048;
  const SEPARATED_GROUP_GAP_MULTIPLIER = 1.5;
  const ANN_BASE_OFFSET=25;
  const ANN_LEVEL_GAP=25;
  const DEFAULT_CORRECTION='bonferroni';
  const ASSUMPTION_ALPHA=0.05;
  const DEFAULT_WHISKER_RULE='iqr15';
  const DEFAULT_WHISKER_MULTIPLIER=1.5;
	  const DEFAULT_SIGNIFICANCE_COLOR = '#000000';
	  const DEFAULT_SIGNIFICANCE_THICKNESS = 1;
	  const DEFAULT_SIGNIFICANCE_WHISKERS = true;
	  const DEFAULT_SIGNIFICANCE_WHISKER_MODE = 'fixed'; // 'fixed' | 'adaptive'
	  const ASSUMPTION_QQ_SAMPLE_LIMIT=4000;
	  const BOX_AUTO_DRAW_ROW_THRESHOLD = 5000;
	  const BOX_AUTO_DRAW_COL_THRESHOLD = 5000;
	  const BOX_AUTO_DRAW_CELL_THRESHOLD = 50000;
  const BROKEN_AXIS_GAP_SIZE_PX = 20;
  const BROKEN_AXIS_BREAK_WIDTH = 8;
  const BROKEN_AXIS_BREAK_HEIGHT = 6;
  const BROKEN_AXIS_DEFAULT_SEGMENT = { start: 0, end: 1 };
  const BOX_POINT_BATCH_THRESHOLD = 1500; // when exceeded, batch points into a single path
  const BATCHABLE_POINT_SHAPES = new Set(['circle','square','triangle','diamond','cross','plus','star']);
  const WHISKER_RULE_META=Object.freeze({
    iqr15:{ key:'iqr15', mode:'iqr', multiplier:1.5, label:'1.5×IQR (Tukey)' },
    iqr3:{ key:'iqr3', mode:'iqr', multiplier:3, label:'3×IQR' },
    sd:{ key:'sd', mode:'sd', multiplier:1, label:'Mean ± SD' },
    custom:{ key:'custom', mode:'iqr', multiplier:null, label:'Custom multiplier' }
  });

  const INDIVIDUAL_SUMMARY_OPTIONS = Object.freeze([
    { value:'mean-point', label:'Mean' },
    { value:'mean-sd', label:'Mean with SD' },
    { value:'mean-sem', label:'Mean with SEM' },
    { value:'mean-ci', label:'Mean with 95% CI' },
    { value:'mean-range', label:'Mean with range' },
    { value:'geo-mean', label:'Geometric mean' },
    { value:'geo-mean-ci', label:'Geometric mean with 95% CI' },
    { value:'geo-mean-gsd', label:'Geometric mean with geometric SD' },
    { value:'median-point', label:'Median' },
    { value:'median-ci', label:'Median with 95% CI' },
    { value:'median-range', label:'Median with range' },
    { value:'median-iqr', label:'Median with interquartile range' },
    { value:'none', label:'No line or error bar' }
  ]);
  const INDIVIDUAL_SUMMARY_DEFAULT = 'mean-sd';
  const INDIVIDUAL_SUMMARY_SET = new Set(INDIVIDUAL_SUMMARY_OPTIONS.map(opt=>opt.value));

  function normalizeIndividualSummaryValue(rawValue){
    const value = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
    if(INDIVIDUAL_SUMMARY_SET.has(value)){
      return value;
    }
    if(value === 'mean'){
      return 'mean-sd';
    }
    if(value === 'median'){
      return 'median-iqr';
    }
    if(value === 'none'){
      return 'none';
    }
    return INDIVIDUAL_SUMMARY_DEFAULT;
  }

  function resolveWhiskerMeta(rule){
    return WHISKER_RULE_META[rule] || WHISKER_RULE_META[DEFAULT_WHISKER_RULE];
  }

  const boxRefs = {};
  let boxTooltipEl = null;
  let boxRenderRowEl = null;
  let boxRenderButtonEl = null;
  let boxAutoDrawNoticeEl = null;
  let scheduleDrawBoxRaw = () => {};
  let boxAutoDrawManager = null;
  
  function boxDebug(label, payload){
    try{
      if(typeof Shared.isDebugEnabled === 'function' && !Shared.isDebugEnabled()){
        return;
      }
    }catch(err){
      // ignore toggle errors and log by default
    }
    console.debug(label, payload);
  }

  function ensureBoxTooltipHost(tooltip, doc){
    if(!tooltip){ return null; }
    const documentRef = doc || tooltip.ownerDocument || global.document;
    if(!documentRef){ return tooltip; }
    const parent = tooltip.parentElement;
    if(!parent){ return tooltip; }
    let needsDetach = false;
    if(typeof tooltip.closest === 'function'){
      const hiddenAncestor = tooltip.closest('[hidden]');
      if(hiddenAncestor && hiddenAncestor !== tooltip){
        needsDetach = true;
      }
    }
    if(!needsDetach){
      try{
        const view = documentRef.defaultView;
        if(view && typeof view.getComputedStyle === 'function'){
          const parentDisplay = view.getComputedStyle(parent).display;
          if(parentDisplay === 'none'){
            needsDetach = true;
          }
        }else if(typeof parent.style?.display === 'string' && parent.style.display === 'none'){
          needsDetach = true;
        }
      }catch(err){
        boxDebug('Debug: box tooltip host inspection error',{ error: err?.message || String(err) });
      }
    }
    const host = documentRef.body || documentRef.documentElement;
    if(needsDetach && host && parent !== host){
      host.appendChild(tooltip);
      boxDebug('Debug: box tooltip host realigned',{ previousParent: parent.id || parent.className || parent.tagName || null });
    }
    return tooltip;
  }

  function getBoxTooltipElement(){
    if(boxTooltipEl && boxTooltipEl.isConnected){
      return boxTooltipEl;
    }
    const doc = global.document;
    const tooltip = boxRefs.tooltip || doc?.getElementById?.('tooltip') || null;
    if(tooltip){
      ensureBoxTooltipHost(tooltip, doc);
      boxTooltipEl = tooltip;
      boxRefs.tooltip = tooltip;
    }
    return boxTooltipEl;
  }

  function formatBoxTooltipNumber(value){
    if(value === null || value === undefined){ return 'n/a'; }
    if(typeof value === 'number'){
      if(!Number.isFinite(value)){ return String(value); }
      return value.toLocaleString('en-US',{ maximumSignificantDigits: 6 });
    }
    const numeric = Number(value);
    if(Number.isFinite(numeric)){
      return numeric.toLocaleString('en-US',{ maximumSignificantDigits: 6 });
    }
    return String(value);
  }

  function updateBoxTooltipContent(tooltip, data){
    if(!tooltip || !data){ return false; }
    const doc = tooltip.ownerDocument || global.document;
    tooltip.textContent = '';
    tooltip.style.fontSize = '12px';
    tooltip.style.columnCount = 1;
    tooltip.style.columnWidth = 'auto';
    tooltip.style.columnGap = '0';
    tooltip.style.maxWidth = '320px';
    tooltip.style.maxHeight = 'none';
    tooltip.style.width = 'auto';
    tooltip.style.height = 'auto';
    tooltip.style.whiteSpace = 'normal';
    tooltip.style.overflow = 'visible';
    const fragment = doc.createDocumentFragment();
    const appendRow = (text, bold) => {
      if(!text){ return; }
      const row = doc.createElement('div');
      if(bold){ row.style.fontWeight = '600'; }
      row.textContent = text;
      fragment.appendChild(row);
    };
    if(data.seriesName){
      appendRow(data.seriesName, true);
    }
    if(data.categoryName && data.categoryName !== data.seriesName){
      appendRow(`Category: ${data.categoryName}`);
    }
    if(data.groupName && data.groupName !== data.seriesName){
      appendRow(`Group: ${data.groupName}`);
    }
    if(typeof data.label === 'string' && data.label){
      appendRow(`Label: ${data.label}`);
    }
    if(Number.isInteger(data.index)){
      appendRow(`Point #${data.index + 1}`);
    }
    if(data.value !== undefined){
      appendRow(`Value: ${formatBoxTooltipNumber(data.value)}`);
    }
    if(Number.isFinite(data.rawValue) && data.rawValue !== data.value){
      appendRow(`Raw: ${formatBoxTooltipNumber(data.rawValue)}`);
    }
    if(!fragment.childNodes.length){
      return false;
    }
    tooltip.appendChild(fragment);
    return true;
  }

  function getBoxEventPagePosition(evt){
    const win = global.window;
    const scrollX = win?.scrollX ?? win?.pageXOffset ?? global.document?.documentElement?.scrollLeft ?? 0;
    const scrollY = win?.scrollY ?? win?.pageYOffset ?? global.document?.documentElement?.scrollTop ?? 0;
    const pageX = typeof evt?.pageX === 'number' ? evt.pageX : ((evt?.clientX || 0) + scrollX);
    const pageY = typeof evt?.pageY === 'number' ? evt.pageY : ((evt?.clientY || 0) + scrollY);
    return { x: pageX, y: pageY };
  }

  function positionBoxTooltipAt(tooltip, pageX, pageY){
    if(!tooltip){ return; }
    const win = global.window;
    const offset = 12;
    let left = pageX + offset;
    let top = pageY + offset;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    const rect = tooltip.getBoundingClientRect();
    const scrollX = win?.scrollX ?? win?.pageXOffset ?? global.document?.documentElement?.scrollLeft ?? 0;
    const scrollY = win?.scrollY ?? win?.pageYOffset ?? global.document?.documentElement?.scrollTop ?? 0;
    const maxX = scrollX + (win?.innerWidth ?? rect.width) - 8;
    const maxY = scrollY + (win?.innerHeight ?? rect.height) - 8;
    if(rect.right > maxX){
      left = Math.max(scrollX + 8, maxX - rect.width);
    }
    if(rect.bottom > maxY){
      top = Math.max(scrollY + 8, maxY - rect.height);
    }
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  function hideBoxTooltip(reason){
    const tooltip = getBoxTooltipElement();
    if(!tooltip){ return; }
    const wasVisible = tooltip.style.display !== 'none';
    tooltip.style.display = 'none';
    tooltip.textContent = '';
    tooltip.style.width = 'auto';
    tooltip.style.height = 'auto';
    if(wasVisible){
      boxDebug('Debug: box tooltip hide',{ reason });
    }
  }

  function showBoxTooltip(data, evt){
    const tooltip = getBoxTooltipElement();
    if(!tooltip){ return; }
    if(!updateBoxTooltipContent(tooltip, data)){ return; }
    tooltip.style.display = 'block';
    const pos = getBoxEventPagePosition(evt);
    positionBoxTooltipAt(tooltip, pos.x, pos.y);
    boxDebug('Debug: box tooltip show',{
      series: data?.seriesName || null,
      category: data?.categoryName || null,
      value: data?.value ?? null
    });
  }

  function handleBoxPointEnter(evt){
    const data = evt?.currentTarget?.__boxPointData;
    if(!data){ return; }
    showBoxTooltip(data, evt);
  }

  function handleBoxPointMove(evt){
    const tooltip = getBoxTooltipElement();
    if(!tooltip || tooltip.style.display === 'none'){ return; }
    const pos = getBoxEventPagePosition(evt);
    positionBoxTooltipAt(tooltip, pos.x, pos.y);
  }

  function handleBoxPointLeave(){
    hideBoxTooltip('point-leave');
  }

  function handleBoxPlotMouseLeave(){
    hideBoxTooltip('plot-leave');
  }

  function attachBoxPointTooltip(el, data){
    if(!el || !data){ return; }
    el.__boxPointData = data;
    el.addEventListener('mouseenter', handleBoxPointEnter);
    el.addEventListener('mousemove', handleBoxPointMove);
    el.addEventListener('mouseleave', handleBoxPointLeave);
    el.addEventListener('click', handleBoxPointClick);
    }

  function handleBoxPointClick(evt){
    const el = evt?.currentTarget;
    if(!el){ return; }
    // prevent the click from bubbling to other handlers
    try{ evt.stopPropagation(); }catch(e){}
    const data = el.__boxPointData;
    showPointFormatControls(el, data);
  }

  function handleBoxSummaryClick(evt){
    const el = evt?.currentTarget;
    if(!el){ return; }
    try{ evt.stopPropagation(); }catch(e){}
    showSummaryFormatControls(el);
  }

  function handleBoxShapeClick(evt){
    const el = evt?.currentTarget;
    if(!el){ return; }
    try{ evt.stopPropagation(); }catch(e){}
    showBoxShapeFormatControls(el);
  }

  function attachBoxShapeHandler(node){
    if(!node){ return; }
    try{ node.style.cursor = 'pointer'; }catch(e){}
    node.addEventListener('click', handleBoxShapeClick);
  }

  function clampSummaryOpacity(value){
    const numeric = Number(value);
    if(!Number.isFinite(numeric)){ return null; }
    return Math.min(1, Math.max(0, numeric));
  }
  function isEmptyStyleObject(value){
    return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0;
  }

  function normalizeStyleObject(value){
    if(!value || typeof value !== 'object' || Array.isArray(value)){
      return null;
    }
    return isEmptyStyleObject(value) ? null : value;
  }

  function mergePointStyles(localStyle){
    const globalStyle = normalizeStyleObject(state.pointGlobalStyle);
    const specific = normalizeStyleObject(localStyle);
    if(!globalStyle && !specific){
      return null;
    }
    return Object.assign({}, globalStyle || {}, specific || {});
  }

  function getTraceShapeStyle(index){
    if(index == null){ return state.traceShapeGlobalStyle || null; }
    const specific = state.traceShapeStyles && state.traceShapeStyles[index] ? state.traceShapeStyles[index] : null;
    return normalizeStyleObject(specific) || state.traceShapeGlobalStyle || null;
  }
  function getPointStyle(index){
    if(index == null){ return state.pointGlobalStyle || null; }
    const specific = state.pointStyles && state.pointStyles[index] ? state.pointStyles[index] : null;
    return mergePointStyles(specific);
  }
  function getSummaryStyle(index){
    if(index == null){ return state.summaryGlobalStyle || null; }
    const specific = state.summaryStyles && state.summaryStyles[index] ? state.summaryStyles[index] : null;
    return normalizeStyleObject(specific) || state.summaryGlobalStyle || null;
  }

  function persistBoxSummaryStyle(traceIndexValue, patch){
    if(traceIndexValue == null){ return; }
    state.summaryStyles = state.summaryStyles || {};
    const previous = cloneSimple(state.summaryStyles[traceIndexValue]) || {};
    const next = Object.assign({}, previous, patch);
    state.summaryStyles[traceIndexValue] = next;
    try{
      recordBoxChange(`box:summary-style:${traceIndexValue}`, previous, next, value => {
        state.summaryStyles[traceIndexValue] = value || null;
        if(typeof state.scheduleDraw === 'function') state.scheduleDraw();
      });
    }catch(err){ console.warn('persistBoxSummaryStyle error', err); }
  }

  function persistTraceShapeStyle(traceIndexValue, patch){
    if(traceIndexValue == null){ return; }
    state.traceShapeStyles = state.traceShapeStyles || {};
    const previous = cloneSimple(state.traceShapeStyles[traceIndexValue]) || {};
    const next = Object.assign({}, previous, patch);
    state.traceShapeStyles[traceIndexValue] = next;
    try{
      recordBoxChange(`box:shape-style:${traceIndexValue}`, previous, next, value => {
        state.traceShapeStyles[traceIndexValue] = value || null;
        if(typeof state.scheduleDraw === 'function') state.scheduleDraw();
      });
    }catch(err){ console.warn('persistTraceShapeStyle error', err); }
  }

  function applyTraceShapeGlobalStyle(patch){
    const previous = cloneSimple(state.traceShapeStyles || {}) || {};
    const nextStyles = cloneSimple(state.traceShapeStyles || {}) || {};
    Object.keys(nextStyles).forEach(key => {
      nextStyles[key] = Object.assign({}, nextStyles[key] || {}, patch);
    });
    state.traceShapeStyles = nextStyles;
    state.traceShapeGlobalStyle = Object.assign({}, state.traceShapeGlobalStyle || {}, patch);
    if(typeof state.scheduleDraw === 'function'){
      try{ state.scheduleDraw(); }catch(err){ console.warn('applyTraceShapeGlobalStyle scheduleDraw error', err); }
    }
    try{
      recordBoxChange('box:shape-style:global', previous, nextStyles, value => {
        state.traceShapeStyles = value || {};
        if(typeof state.scheduleDraw === 'function') state.scheduleDraw();
      });
    }catch(err){ console.warn('applyTraceShapeGlobalStyle error', err); }
  }

  // Apply opacity to every box element (points, shapes, summaries) in a single frame
  let pendingBoxGlobalOpacity = null;
  const runBoxGlobalOpacityApply = () => {
    if(pendingBoxGlobalOpacity == null){ return; }
    const doc = global.document;
    const plot = doc ? doc.getElementById('boxPlot') : null;
    if(plot){
      const nodes = plot.querySelectorAll('[data-box-shape],[data-export-layer="box-points"] circle,[data-export-layer="box-points"] path,[data-export-layer="box-points"] rect,[data-summary-line="1"]');
      nodes.forEach(node => {
        const next = String(pendingBoxGlobalOpacity);
        const tag = (node.tagName || '').toLowerCase();
        if(tag === 'line' || node.hasAttribute('stroke')){ node.setAttribute('stroke-opacity', next); }
        if(tag === 'rect' || tag === 'path' || tag === 'circle' || node.hasAttribute('fill')){ node.setAttribute('fill-opacity', next); }
      });
    }
    pendingBoxGlobalOpacity = null;
  };
  const scheduleBoxGlobalOpacityApply = (() => {
    const runner = typeof Shared.debounceFrame === 'function'
      ? Shared.debounceFrame(runBoxGlobalOpacityApply)
      : (fn => () => {
          if(typeof global.requestAnimationFrame === 'function'){ global.requestAnimationFrame(fn); }
          else{ fn(); }
        })(runBoxGlobalOpacityApply);
    return (opacity) => {
      pendingBoxGlobalOpacity = opacity;
      runner();
    };
  })();

  function showPointFormatControls(el, data){
    const doc = global.document;
    if(!doc){ return; }
    try{ if(typeof Shared.hideAllFormatControls === 'function') Shared.hideAllFormatControls(); }catch(e){}
    const anchor = doc.getElementById('boxFontHost');
    if(!anchor){ return; }

    // Find or create the real toolbar host that sits after the anchor
    let toolbarHost = anchor.nextElementSibling && anchor.nextElementSibling.classList && anchor.nextElementSibling.classList.contains('font-toolbar-host')
      ? anchor.nextElementSibling
      : null;
    if(!toolbarHost){
      toolbarHost = doc.createElement('div');
      toolbarHost.className = 'font-toolbar-host';
      toolbarHost.dataset.fontToolbarScope = 'box';
      toolbarHost.style.display = 'none';
      anchor.insertAdjacentElement('afterend', toolbarHost);
    }

    // Hide other visible hosts
    doc.querySelectorAll('.font-toolbar-host.font-toolbar-host--visible').forEach(h => {
      if(h !== toolbarHost){
        h.classList.remove('font-toolbar-host--visible');
        h.style.display = 'none';
      }
    });

    // Prepare single-line form so toolbar height doesn't increase
    toolbarHost.innerHTML = '';
    const wrap = doc.createElement('div');
    wrap.className = 'workspace-toolbar__form workspace-toolbar__form--single box-point-controls';
    wrap.dataset.pointControls = '1';

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

    // Determine parent group for the points (all points in the same point layer if present)
    const parentGroup = el.closest
      ? (el.closest('g[data-export-layer="box-points"]') || el.closest('g[data-trace]'))
      : null;
    const traceIndex = parentGroup && parentGroup.dataset && parentGroup.dataset.trace != null ? String(parentGroup.dataset.trace) : null;
    const resolveTargetPoints = () => parentGroup
      ? Array.from(parentGroup.querySelectorAll('circle,rect,path'))
      : [el];
    const scopeName = `boxPointScope_${Date.now()}`;
    const scopeField = doc.createElement('label');
    scopeField.className = 'workspace-toolbar__input workspace-toolbar__input--compact workspace-toolbar__input--scope';
    const scopeLabel = doc.createElement('span');
    scopeLabel.className = 'workspace-toolbar__input-label';
    scopeLabel.textContent = 'Scope';
    const scopeSelect = doc.createElement('select');
    scopeSelect.name = scopeName;
    scopeSelect.className = 'workspace-toolbar__select';
    const optTrace = doc.createElement('option');
    optTrace.value = 'trace';
    optTrace.textContent = 'Trace';
    optTrace.disabled = traceIndex == null;
    const optGlobal = doc.createElement('option');
    optGlobal.value = 'global';
    optGlobal.textContent = 'Global';
    scopeSelect.appendChild(optTrace);
    scopeSelect.appendChild(optGlobal);
    scopeSelect.value = traceIndex != null ? 'trace' : 'global';
    scopeField.appendChild(scopeLabel);
    scopeField.appendChild(scopeSelect);
    wrap.appendChild(scopeField);

    // Helper: create a new marker element for a given shape based on an existing point
    function createMarkerFor(shape, src){
      const NS = 'http://www.w3.org/2000/svg';
      const tag = typeof src?.tagName === 'string' ? src.tagName.toLowerCase() : 'circle';
      // Resolve center and size robustly from the source element.
      let cx = 0;
      let cy = 0;
      let r = 4;
      try{
        if(src && typeof src.getBBox === 'function'){
          const bb = src.getBBox();
          if(bb && Number.isFinite(bb.x) && Number.isFinite(bb.y) && Number.isFinite(bb.width) && Number.isFinite(bb.height)){
            cx = bb.x + bb.width / 2;
            cy = bb.y + bb.height / 2;
            r = Math.max(1, Math.max(bb.width, bb.height) / 2);
          }
        }
      }catch(e){
        // getBBox may throw in some contexts; fall back to attributes below
      }
      // Fallbacks if bbox didn't produce values
      if((!Number.isFinite(cx) || !Number.isFinite(cy)) || (cx === 0 && cy === 0)){
        const tag = (src && src.tagName) ? String(src.tagName).toLowerCase() : '';
        if(tag === 'circle'){
          cx = Number(src.getAttribute('cx')) || cx || 0;
          cy = Number(src.getAttribute('cy')) || cy || 0;
          r = Number(src.getAttribute('r')) || r;
        }else if(tag === 'rect'){
          const x = Number(src.getAttribute('x')) || 0;
          const y = Number(src.getAttribute('y')) || 0;
          const w = Number(src.getAttribute('width')) || 0;
          const h = Number(src.getAttribute('height')) || 0;
          cx = (Number.isFinite(x) ? x : 0) + (Number.isFinite(w) ? w / 2 : 0);
          cy = (Number.isFinite(y) ? y : 0) + (Number.isFinite(h) ? h / 2 : 0);
          r = Math.max(1, Math.max(w, h) / 2 || r);
        }else{
          // try generic attributes
          cx = Number(src.getAttribute('cx')) || Number(src.getAttribute('x')) || cx || 0;
          cy = Number(src.getAttribute('cy')) || Number(src.getAttribute('y')) || cy || 0;
          r = Number(src.getAttribute('r')) || r;
        }
      }
      const sizeAttrRaw = Number(src?.getAttribute?.('data-point-size'));
      if(Number.isFinite(sizeAttrRaw) && sizeAttrRaw > 0){
        r = sizeAttrRaw / 2;
      }
      if((!Number.isFinite(cx) || !Number.isFinite(cy)) || (cx === 0 && cy === 0)){
        const cxAttr = Number(src?.getAttribute?.('data-point-cx'));
        const cyAttr = Number(src?.getAttribute?.('data-point-cy'));
        if(Number.isFinite(cxAttr) && Number.isFinite(cyAttr)){
          cx = cxAttr;
          cy = cyAttr;
        }
      }
      const fill = src.getAttribute('fill') || 'black';
      const stroke = src.getAttribute('stroke') || 'none';
      const fillOpacity = src.getAttribute('fill-opacity') || src.style?.opacity || '1';
      const normalized = typeof shape === 'string' ? shape.toLowerCase() : '';
      let node = null;
      if(normalized === 'square'){
        node = document.createElementNS(NS, 'rect');
        const size = r * 2;
        node.setAttribute('x', String(cx - r));
        node.setAttribute('y', String(cy - r));
        node.setAttribute('width', String(size));
        node.setAttribute('height', String(size));
      }else if(normalized === 'triangle'){
        node = document.createElementNS(NS, 'path');
        const d = `M ${cx} ${cy - r} L ${cx + r} ${cy + r} L ${cx - r} ${cy + r} Z`;
        node.setAttribute('d', d);
      }else if(normalized === 'diamond'){
        node = document.createElementNS(NS, 'path');
        const d = `M ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} L ${cx - r} ${cy} Z`;
        node.setAttribute('d', d);
      }else if(normalized === 'cross'){
        node = document.createElementNS(NS, 'path');
        const size = Math.max(r * 2, 2);
        const half = size / 2;
        const bar = Math.max(Math.round(size / 3), 2);
        const hb = bar / 2;
        const top = cy - half; const bottom = cy + half; const left = cx - half; const right = cx + half;
        const d = [
          `M ${left} ${top + hb}`,
          `L ${left + hb} ${top}`,
          `L ${cx} ${cy - hb}`,
          `L ${right - hb} ${top}`,
          `L ${right} ${top + hb}`,
          `L ${cx + hb} ${cy}`,
          `L ${right} ${bottom - hb}`,
          `L ${right - hb} ${bottom}`,
          `L ${cx} ${cy + hb}`,
          `L ${left + hb} ${bottom}`,
          `L ${left} ${bottom - hb}`,
          `L ${cx - hb} ${cy}`,
          'Z'
        ].join(' ');
        node.setAttribute('d', d);
      }else if(normalized === 'plus'){
        node = document.createElementNS(NS, 'path');
        const size = Math.max(r * 2, 2);
        const half = size / 2;
        const bar = Math.max(size / 3, 2);
        const hb = bar / 2;
        const d = `M ${cx - hb} ${cy - half} H ${cx + hb} V ${cy - hb} H ${cx + half} V ${cy + hb} H ${cx + hb} V ${cy + half} H ${cx - hb} V ${cy + hb} H ${cx - half} V ${cy - hb} H ${cx - hb} Z`;
        node.setAttribute('d', d);
      }else if(normalized === 'star'){
        node = document.createElementNS(NS, 'path');
        // simple 5-point star approximation
        const R = r; const r2 = Math.max(r * 0.45, 1);
        const points = [];
        for(let i=0;i<5;i+=1){
          const a = (Math.PI * 2 * i) / 5 - Math.PI/2;
          points.push({ x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R });
          const b = a + Math.PI / 5;
          points.push({ x: cx + Math.cos(b) * r2, y: cy + Math.sin(b) * r2 });
        }
        const d = points.map((pt,i)=> `${i===0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ') + ' Z';
        node.setAttribute('d', d);
      }else{
        node = document.createElementNS(NS, 'circle');
        node.setAttribute('cx', String(cx));
        node.setAttribute('cy', String(cy));
        node.setAttribute('r', String(r));
      }
      if(!node){ return null; }
      node.setAttribute('fill', fill);
      if(stroke && stroke !== 'none') node.setAttribute('stroke', stroke);
      node.setAttribute('fill-opacity', String(fillOpacity));
      node.setAttribute('data-shape', normalized || 'circle');
      if(Number.isFinite(r) && r > 0){
        node.setAttribute('data-point-size', String(r * 2));
        node.setAttribute('data-point-cx', String(cx));
        node.setAttribute('data-point-cy', String(cy));
      }
      return node;
    }

    function replacePointsWithShape(points, shape){
      points.forEach(oldPt => {
        const parent = oldPt.parentElement;
        if(!parent){ return; }
        const tag = (oldPt.tagName || '').toLowerCase();
        if(tag === 'path' && Array.isArray(oldPt.__batchedPoints)){
          const size = Number(oldPt.__batchedSize) || Math.max(1, Math.round((Number(oldPt.getAttribute('stroke-width')) || 1) * 2));
          const normalizedShape = typeof shape === 'string' ? shape : 'square';
          oldPt.setAttribute('d', buildBatchedPointPathD(oldPt.__batchedPoints, size, normalizedShape));
          oldPt.setAttribute('data-shape', normalizedShape);
          oldPt.__batchedShape = normalizedShape;
          return;
        }
        const newNode = createMarkerFor(shape, oldPt);
        if(!newNode){ return; }
        // insert new node at same position
        parent.insertBefore(newNode, oldPt);
        // reattach tooltip/handlers
        try{ attachBoxPointTooltip(newNode, oldPt.__boxPointData || oldPt.__boxPointData); }catch(e){}
        // remove old element
        parent.removeChild(oldPt);
      });
    }

    // Helper: persist style for a trace index
    function persistTraceStyle(patch){
      if(traceIndex == null){ return; }
      state.pointStyles = state.pointStyles || {};
      const previous = normalizeStyleObject(cloneSimple(state.pointStyles[traceIndex]));
      const next = Object.assign({}, previous || {}, patch);
      state.pointStyles[traceIndex] = next;
      // record undoable change
      try{
        recordBoxChange(`box:point-style:${traceIndex}`, previous, next, value => {
          state.pointStyles[traceIndex] = normalizeStyleObject(value);
          if(typeof state.scheduleDraw === 'function') state.scheduleDraw();
        });
      }catch(err){ console.warn('persistTraceStyle error', err); }
    }

    function applyPointStyleGlobal(patch){
      const previous = {
        pointStyles: cloneSimple(state.pointStyles || {}) || {},
        pointGlobalStyle: normalizeStyleObject(cloneSimple(state.pointGlobalStyle))
      };
      const nextStyles = cloneSimple(state.pointStyles || {}) || {};
      Object.keys(nextStyles).forEach(key => {
        nextStyles[key] = Object.assign({}, nextStyles[key] || {}, patch);
      });
      state.pointStyles = nextStyles;
      state.pointGlobalStyle = Object.assign({}, state.pointGlobalStyle || {}, patch);
      if(typeof state.scheduleDraw === 'function'){
        try{ state.scheduleDraw(); }catch(e){ console.warn('applyPointStyleGlobal scheduleDraw error', e); }
      }
      try{
        recordBoxChange('box:point-style:global', previous, {
          pointStyles: nextStyles,
          pointGlobalStyle: normalizeStyleObject(cloneSimple(state.pointGlobalStyle))
        }, value => {
          state.pointStyles = value?.pointStyles || {};
          state.pointGlobalStyle = normalizeStyleObject(value?.pointGlobalStyle);
          if(typeof state.scheduleDraw === 'function') state.scheduleDraw();
        });
      }catch(err){ console.warn('applyPointStyleGlobal error', err); }
    }

    // Fill color + shape
    const BOX_SHAPE_OPTIONS = Shared.getShapePickerOptions
      ? Shared.getShapePickerOptions()
      : [
          { value: 'circle', label: 'Circle' },
          { value: 'triangle', label: 'Triangle' },
          { value: 'square', label: 'Square' },
          { value: 'diamond', label: 'Diamond' },
          { value: 'cross', label: 'Cross' },
          { value: 'plus', label: 'Plus' },
          { value: 'star', label: 'Star' }
        ];
    const currentFill = (resolveTargetPoints()[0]?.getAttribute('fill') || el.getAttribute('fill') || '#000000');
    // determine current shape from element tag or data attribute
    const detectShape = (node) => {
      if(!node) return 'circle';
      const ds = node.getAttribute('data-shape');
      if(ds) return ds;
      const tag = (node.tagName || '').toLowerCase();
      if(tag === 'rect') return 'square';
      if(tag === 'path') return node.getAttribute('data-shape') || 'circle';
      return 'circle';
    };
    let currentShape = detectShape(resolveTargetPoints()[0]);
    const shapeSwatch = Shared.createShapeColorSwatch
      ? Shared.createShapeColorSwatch({
          document: doc,
          label: 'Fill/Shape',
          color: currentFill,
          shape: currentShape,
          shapeOptions: BOX_SHAPE_OPTIONS,
          onColorInput(value){
            resolveTargetPoints().forEach(p => p.setAttribute('fill', value));
          },
          onColorChange(value){
            resolveTargetPoints().forEach(p => p.setAttribute('fill', value));
            if(scopeSelect.value === 'trace'){
              try{ persistTraceStyle({ fill: value }); }catch(e){console.warn(e);} 
            }else{
              applyPointStyleGlobal({ fill: value });
            }
          },
          onShapeChange(nextShape){
            currentShape = nextShape;
            replacePointsWithShape(resolveTargetPoints(), nextShape);
            if(scopeSelect.value === 'trace'){
              try{ persistTraceStyle({ shape: nextShape }); }catch(e){console.warn(e);} 
            }else{
              applyPointStyleGlobal({ shape: nextShape });
            }
          }
        })
      : null;
    if(!shapeSwatch){
      console.warn('Shared.createShapeColorSwatch unavailable; falling back to basic color input.');
    }
    const fillLabelEl = makeInput('Fill/Shape', shapeSwatch ? shapeSwatch.element : document.createElement('div'));
    fillLabelEl.classList.add('workspace-toolbar__input--color');
    wrap.appendChild(fillLabelEl);

    // Border color
    const borderInput = doc.createElement('input');
    borderInput.type = 'color';
    const currentStroke = (el.getAttribute('stroke') && el.getAttribute('stroke') !== 'none') ? el.getAttribute('stroke') : '#000000';
    try{ borderInput.value = currentStroke; }catch(e){}
    borderInput.addEventListener('input', ()=>{ resolveTargetPoints().forEach(p => p.setAttribute('stroke', borderInput.value)); });
    borderInput.addEventListener('change', ()=>{
      if(scopeSelect.value === 'trace'){
        try{ persistTraceStyle({ stroke: borderInput.value }); }catch(e){console.warn(e);} 
      }else{
        applyPointStyleGlobal({ stroke: borderInput.value });
      }
    });
    if(typeof Shared.attachColorPickerNear === 'function'){
      try{ Shared.attachColorPickerNear(borderInput); }catch(e){}
    }
    const borderLabelEl = makeInput('Border', borderInput);
    borderLabelEl.classList.add('workspace-toolbar__input--color');
    wrap.appendChild(borderLabelEl);
    const syncFillSwatchSize = () => {
      if(!shapeSwatch || !shapeSwatch.swatch || !shapeSwatch.element || !borderInput){ return; }
      const rect = borderInput.getBoundingClientRect();
      if(!rect || !Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0){
        return;
      }
      const widthPx = `${Math.round(rect.width)}px`;
      const heightPx = `${Math.round(rect.height)}px`;
      shapeSwatch.swatch.style.width = widthPx;
      shapeSwatch.swatch.style.height = heightPx;
      shapeSwatch.element.style.width = widthPx;
      shapeSwatch.element.style.height = heightPx;
    };
    const scheduleFillSwatchSync = typeof Shared.debounceFrame === 'function'
      ? Shared.debounceFrame(syncFillSwatchSize)
      : () => {
          if(typeof global.requestAnimationFrame === 'function'){
            global.requestAnimationFrame(syncFillSwatchSize);
          }else{
            syncFillSwatchSize();
          }
        };

    // Size slider (compact)
    function updatePointsSize(points, newSize){
      const numeric = Number(newSize) || 0;
      points.forEach(pt => {
        const parent = pt.parentElement;
        if(!parent) return;
        const tag = (pt.tagName || '').toLowerCase();
        if(tag === 'path' && Array.isArray(pt.__batchedPoints)){
          const nextSize = Math.max(1, Math.round(numeric * 2));
          const shape = pt.getAttribute('data-shape') || pt.__batchedShape || 'square';
          pt.setAttribute('d', buildBatchedPointPathD(pt.__batchedPoints, nextSize, shape));
          pt.__batchedSize = nextSize;
          return;
        }
        let bbox;
        try{ bbox = pt.getBBox(); }catch(e){ bbox = null; }
        const cx = bbox ? (bbox.x + bbox.width / 2) : (Number(pt.getAttribute('cx')) || 0);
        const cy = bbox ? (bbox.y + bbox.height / 2) : (Number(pt.getAttribute('cy')) || 0);
        const fill = pt.getAttribute('fill') || 'black';
        const stroke = pt.getAttribute('stroke') || 'none';
        const fillOpacity = pt.getAttribute('fill-opacity') || pt.style?.opacity || '1';
        const shape = pt.getAttribute('data-shape') || (pt.tagName || 'circle').toLowerCase();
        const synthetic = {
          tagName: pt.tagName,
          getAttribute(name){
            if(name === 'cx') return String(cx);
            if(name === 'cy') return String(cy);
            if(name === 'r') return String(numeric);
            if(name === 'fill') return fill;
            if(name === 'stroke') return stroke;
            if(name === 'fill-opacity') return fillOpacity;
            return null;
          }
        };
        const newNode = createMarkerFor(shape, synthetic);
        if(!newNode) return;
        parent.insertBefore(newNode, pt);
        try{ attachBoxPointTooltip(newNode, pt.__boxPointData); }catch(e){}
        parent.removeChild(pt);
      });
    }

    const targetPoints = resolveTargetPoints();

    // Size selection box
    // derive current size
    let derivedSize = 4;
    try{
      if(targetPoints[0]){
        const t0 = targetPoints[0];
        const explicitSize = Number(t0.getAttribute('data-point-size'));
        if(Number.isFinite(explicitSize) && explicitSize > 0){
          derivedSize = explicitSize / 2;
        }else if((t0.tagName||'').toLowerCase() === 'path' && Number.isFinite(t0.__batchedSize)){
          derivedSize = t0.__batchedSize / 2;
        }else if((t0.tagName||'').toLowerCase() === 'circle'){
          const r0 = Number(t0.getAttribute('r'));
          if(Number.isFinite(r0) && r0 > 0) derivedSize = r0;
        }else{
          const b = t0.getBBox();
          if(b){ derivedSize = Math.max(b.width, b.height) / 2; }
        }
      }
    }catch(e){}
    const sizeValues = [2,4,6,8,10,12,16,20,24,30];
    const sizeCombo = doc.createElement('div');
    sizeCombo.className = 'font-controls-panel__combo font-controls-panel__combo--size';
    const sizeRow = doc.createElement('div');
    sizeRow.className = 'font-controls-panel__combo-row';
    const sizeInput = doc.createElement('input');
    sizeInput.type = 'number';
    sizeInput.min = '1';
    sizeInput.step = '0.5';
    sizeInput.className = 'font-controls-panel__input font-controls-panel__input--combo font-controls-panel__input--number';
    sizeInput.setAttribute('aria-label', 'Point size');
    sizeInput.setAttribute('aria-haspopup', 'listbox');
    sizeInput.setAttribute('aria-expanded', 'false');
    const sizeMenuId = `box-point-size-menu-${Date.now()}`;
    sizeInput.setAttribute('aria-controls', sizeMenuId);
    const normalizedDerived = Number.isFinite(derivedSize) ? Math.round(derivedSize * 10) / 10 : 4;
    sizeInput.value = String(normalizedDerived);
    sizeRow.appendChild(sizeInput);

    const sizeMenuToggle = doc.createElement('button');
    sizeMenuToggle.type = 'button';
    sizeMenuToggle.className = 'font-controls-panel__combo-toggle';
    sizeMenuToggle.setAttribute('aria-label', 'Show preset sizes');
    sizeMenuToggle.setAttribute('aria-haspopup', 'listbox');
    sizeMenuToggle.setAttribute('aria-expanded', 'false');
    sizeMenuToggle.setAttribute('aria-controls', sizeMenuId);
    const sizeMenuIcon = doc.createElement('span');
    sizeMenuIcon.className = 'font-controls-panel__combo-toggle-icon';
    sizeMenuIcon.textContent = '?';
    sizeMenuIcon.setAttribute('aria-hidden', 'true');
    sizeMenuToggle.appendChild(sizeMenuIcon);
    sizeRow.appendChild(sizeMenuToggle);
    sizeCombo.appendChild(sizeRow);

    const sizeMenuPopup = doc.createElement('div');
    sizeMenuPopup.id = sizeMenuId;
    sizeMenuPopup.className = 'font-controls-panel__combo-menu';
    sizeMenuPopup.setAttribute('role', 'listbox');
    sizeMenuPopup.setAttribute('aria-label', 'Point sizes');
    sizeMenuPopup.hidden = true;
    sizeCombo.appendChild(sizeMenuPopup);

    const schedulePointSizeRelayout = typeof Shared.debounceFrame === 'function'
      ? Shared.debounceFrame(() => {
          if(typeof state.scheduleDraw === 'function'){
            state.scheduleDraw();
          }
        })
      : () => {
          if(typeof state.scheduleDraw === 'function'){
            state.scheduleDraw();
          }
        };

    const applySizeValue = (value, persist) => {
      const v = Number(value);
      if(!Number.isFinite(v) || v <= 0){ return; }
      updatePointsSize(resolveTargetPoints(), v);
      schedulePointSizeRelayout();
      if(persist){
        if(scopeSelect.value === 'trace'){
          try{ persistTraceStyle({ size: v }); }catch(e){console.warn(e);} 
        }else{
          applyPointStyleGlobal({ size: v });
        }
      }
    };

    const syncSizeMenuActive = () => {
      const current = Number(sizeInput.value);
      const rounded = Number.isFinite(current) ? Math.round(current) : null;
      const options = sizeMenuPopup.querySelectorAll('.font-controls-panel__combo-option');
      options.forEach(option => {
        const value = Number(option.dataset.value);
        const isActive = rounded != null && Number.isFinite(value) && value === rounded;
        option.classList.toggle('font-controls-panel__combo-option--active', isActive);
      });
    };

    let sizeMenuVisible = false;
    const openSizeMenu = () => {
      if(sizeMenuVisible){ return; }
      sizeMenuVisible = true;
      sizeMenuPopup.hidden = false;
      sizeMenuPopup.classList.add('font-controls-panel__combo-menu--open');
      sizeInput.setAttribute('aria-expanded', 'true');
      sizeMenuToggle.setAttribute('aria-expanded', 'true');
      syncSizeMenuActive();
    };
    const closeSizeMenu = () => {
      if(!sizeMenuVisible){ return; }
      sizeMenuVisible = false;
      sizeMenuPopup.classList.remove('font-controls-panel__combo-menu--open');
      sizeMenuPopup.hidden = true;
      sizeInput.setAttribute('aria-expanded', 'false');
      sizeMenuToggle.setAttribute('aria-expanded', 'false');
    };
    const toggleSizeMenu = () => {
      if(sizeMenuVisible){
        closeSizeMenu();
      }else{
        openSizeMenu();
      }
    };

    const createSizeOption = value => {
      const optionBtn = doc.createElement('button');
      optionBtn.type = 'button';
      optionBtn.className = 'font-controls-panel__combo-option';
      optionBtn.dataset.value = String(value);
      optionBtn.dataset.label = `${value}px`;
      optionBtn.textContent = `${value}px`;
      optionBtn.setAttribute('role', 'option');
      optionBtn.setAttribute('tabindex', '-1');
      optionBtn.addEventListener('mousedown', evt => {
        evt.preventDefault();
      });
      optionBtn.addEventListener('click', () => {
        sizeInput.value = String(value);
        applySizeValue(value, true);
        syncSizeMenuActive();
        closeSizeMenu();
        try{
          sizeInput.focus({ preventScroll: true });
        }catch(focusErr){
          sizeInput.focus();
        }
      });
      return optionBtn;
    };

    sizeValues.forEach(value => {
      sizeMenuPopup.appendChild(createSizeOption(value));
    });

    sizeInput.addEventListener('input', () => {
      applySizeValue(sizeInput.value, false);
      syncSizeMenuActive();
    });
    sizeInput.addEventListener('change', () => {
      applySizeValue(sizeInput.value, true);
      syncSizeMenuActive();
    });

    sizeMenuToggle.addEventListener('mousedown', evt => {
      evt.preventDefault();
    });
    sizeMenuToggle.addEventListener('click', () => {
      toggleSizeMenu();
      try{
        sizeInput.focus({ preventScroll: true });
      }catch(focusErr){
        sizeInput.focus();
      }
    });

    wrap.addEventListener('click', evt => {
      if(!sizeMenuVisible){ return; }
      const target = evt?.target;
      if(target && sizeCombo.contains(target)){ return; }
      closeSizeMenu();
    });

    const sizeLabel = makeInput('Size', sizeCombo);
    wrap.appendChild(sizeLabel);

    // Transparency slider (compact): 0 = opaque, 100 = fully transparent
    const opInput = doc.createElement('input');
    opInput.type = 'range'; opInput.min = '0'; opInput.max = '100';
    const currentOpacity = Number(el.getAttribute('fill-opacity'));
    const initialTransparency = Number.isFinite(currentOpacity) ? Math.round((1 - currentOpacity) * 100) : 0;
    opInput.value = String(initialTransparency);
    const opValue = doc.createElement('span');
    opValue.className = 'workspace-toolbar__input-value';
    opValue.textContent = opInput.value + '%';
    let pendingPointOpacity = null;
    const applyPointOpacityLive = typeof Shared.debounceFrame === 'function'
      ? Shared.debounceFrame(() => {
          if(pendingPointOpacity == null){ return; }
          resolveTargetPoints().forEach(p => p.setAttribute('fill-opacity', String(pendingPointOpacity)));
        })
      : null;
    opInput.addEventListener('input', ()=>{
      const pct = Number(opInput.value);
      const bounded = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
      const transparency = bounded / 100;
      const opacity = 1 - transparency;
      pendingPointOpacity = opacity;
      if(scopeSelect.value === 'global'){
        scheduleBoxGlobalOpacityApply(opacity);
      }else if(applyPointOpacityLive){
        applyPointOpacityLive();
      }else{
        resolveTargetPoints().forEach(p => p.setAttribute('fill-opacity', String(opacity)));
      }
      opValue.textContent = `${Math.round(bounded)}%`;
    });
    opInput.addEventListener('change', ()=>{
      const pct = Number(opInput.value);
      const bounded = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
      const opacity = 1 - (bounded / 100);
      if(scopeSelect.value === 'trace'){
        try{ persistTraceStyle({ opacity: opacity }); }catch(e){console.warn(e);} 
      }else{
        scheduleBoxGlobalOpacityApply(opacity);
        applyPointStyleGlobal({ opacity: opacity });
      }
    });
    const opWrap = doc.createElement('div');
    opWrap.style.display = 'inline-flex';
    opWrap.style.alignItems = 'center';
    opWrap.appendChild(opInput);
    opWrap.appendChild(opValue);
    wrap.appendChild(makeInput('Transparency', opWrap));

    toolbarHost.appendChild(wrap);
    scheduleFillSwatchSync();
    // show host and mark dock active
    toolbarHost.style.display = 'block';
    toolbarHost.classList.add('font-toolbar-host--visible');
    const dock = toolbarHost.closest('.workspace-toolbar__dock');
    if(dock){ dock.classList.add('workspace-toolbar__dock--active'); }
    // attach a document click handler to clear the FORMAT host when clicking away
    try{
      if(toolbarHost.__boxDocClickHandler){
        document.removeEventListener('click', toolbarHost.__boxDocClickHandler);
        toolbarHost.__boxDocClickHandler = null;
      }
      const onDocClick = function(evt){
        try{
          const tgt = evt && evt.target ? evt.target : null;
          if(!tgt){ return; }
          if(toolbarHost.contains(tgt)){ return; }
          // ignore clicks inside the shared color picker overlay
          if(tgt.closest && tgt.closest('.shared-color-picker')){ return; }
          // hide the toolbar host
          closeSizeMenu();
          toolbarHost.classList.remove('font-toolbar-host--visible');
          toolbarHost.style.display = 'none';
          try{ if(typeof Shared.hideAllFormatControls === 'function') Shared.hideAllFormatControls(); }catch(e){}
          const d = toolbarHost.closest('.workspace-toolbar__dock');
          if(d){ d.classList.remove('workspace-toolbar__dock--active'); }
          document.removeEventListener('click', onDocClick);
          toolbarHost.__boxDocClickHandler = null;
        }catch(err){ console.warn('box.format docClick error', err); }
      };
      document.addEventListener('click', onDocClick);
      toolbarHost.__boxDocClickHandler = onDocClick;
    }catch(err){ console.warn('attach doc click for box point controls failed', err); }
  }

  function showSummaryFormatControls(target){
    const doc = global.document;
    if(!doc || !target){ return; }
    try{ if(typeof Shared.hideAllFormatControls === 'function') Shared.hideAllFormatControls(); }catch(e){}
    const anchor = doc.getElementById('boxFontHost');
    if(!anchor){ return; }

    let toolbarHost = anchor.nextElementSibling && anchor.nextElementSibling.classList && anchor.nextElementSibling.classList.contains('font-toolbar-host')
      ? anchor.nextElementSibling
      : null;
    if(!toolbarHost){
      toolbarHost = doc.createElement('div');
      toolbarHost.className = 'font-toolbar-host';
      toolbarHost.dataset.fontToolbarScope = 'box';
      toolbarHost.style.display = 'none';
      anchor.insertAdjacentElement('afterend', toolbarHost);
    }

    doc.querySelectorAll('.font-toolbar-host.font-toolbar-host--visible').forEach(h => {
      if(h !== toolbarHost){
        h.classList.remove('font-toolbar-host--visible');
        h.style.display = 'none';
      }
    });

    toolbarHost.innerHTML = '';
    const wrap = doc.createElement('div');
    wrap.className = 'workspace-toolbar__form workspace-toolbar__form--single box-summary-controls';
    wrap.dataset.summaryControls = '1';

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

    const parentGroup = target.closest && target.closest('g[data-trace]') ? target.closest('g[data-trace]') : null;
    const traceIndex = parentGroup?.dataset?.trace != null ? String(parentGroup.dataset.trace) : null;
    const resolveTargets = () => parentGroup ? Array.from(parentGroup.querySelectorAll('line[data-summary-line="1"]')) : [target];
    const persisted = traceIndex != null && state.summaryStyles ? state.summaryStyles[traceIndex] : null;
    const scopeName = `boxSummaryScope_${Date.now()}`;
    const scopeField = doc.createElement('label');
    scopeField.className = 'workspace-toolbar__input workspace-toolbar__input--compact workspace-toolbar__input--scope';
    const scopeLabel = doc.createElement('span');
    scopeLabel.className = 'workspace-toolbar__input-label';
    scopeLabel.textContent = 'Scope';
    const scopeSelect = doc.createElement('select');
    scopeSelect.name = scopeName;
    scopeSelect.className = 'workspace-toolbar__select';
    const optTrace = doc.createElement('option');
    optTrace.value = 'trace';
    optTrace.textContent = 'Trace';
    optTrace.disabled = traceIndex == null;
    const optGlobal = doc.createElement('option');
    optGlobal.value = 'global';
    optGlobal.textContent = 'Global';
    scopeSelect.appendChild(optTrace);
    scopeSelect.appendChild(optGlobal);
    scopeSelect.value = traceIndex != null ? 'trace' : 'global';
    scopeField.appendChild(scopeLabel);
    scopeField.appendChild(scopeSelect);
    wrap.appendChild(scopeField);

    // Color picker
    const colorInput = doc.createElement('input');
    colorInput.type = 'color';
    const initialColor = persisted?.color || target.getAttribute('stroke') || '#000000';
    try{ colorInput.value = initialColor; }catch(e){}
    colorInput.addEventListener('input', () => {
      const next = colorInput.value;
      resolveTargets().forEach(node => node.setAttribute('stroke', next));
      if(scopeSelect.value === 'global'){
        state.summaryGlobalStyle = Object.assign({}, state.summaryGlobalStyle || {}, { color: next });
        if(state.summaryStyles && typeof state.summaryStyles === 'object'){
          Object.keys(state.summaryStyles).forEach(k => {
            state.summaryStyles[k] = Object.assign({}, state.summaryStyles[k] || {}, { color: next });
          });
        }
        if(typeof state.scheduleDraw === 'function'){ state.scheduleDraw(); }
      }
    });
    colorInput.addEventListener('change', () => {
      if(scopeSelect.value === 'global'){
        state.summaryGlobalStyle = Object.assign({}, state.summaryGlobalStyle || {}, { color: colorInput.value });
        if(typeof state.scheduleDraw === 'function'){ state.scheduleDraw(); }
      }else if(traceIndex != null){
        persistBoxSummaryStyle(traceIndex, { color: colorInput.value });
      }
    });
    if(typeof Shared.attachColorPickerNear === 'function'){
      try{ Shared.attachColorPickerNear(colorInput); }catch(e){}
    }
    const colorLabel = makeInput('Color', colorInput);
    colorLabel.classList.add('workspace-toolbar__input--color');
    wrap.appendChild(colorLabel);

    // Thickness
    const thicknessInput = doc.createElement('input');
    thicknessInput.type = 'number';
    thicknessInput.min = '0.2';
    thicknessInput.step = '0.1';
    const derivedThickness = Number.isFinite(Number(persisted?.thickness))
      ? Number(persisted.thickness)
      : Number(target.getAttribute('stroke-width'));
    if(Number.isFinite(derivedThickness)){
      thicknessInput.value = String(derivedThickness);
    }
    thicknessInput.addEventListener('input', () => {
      const numeric = Number(thicknessInput.value);
      const value = Number.isFinite(numeric) ? Math.max(0.2, numeric) : 0.2;
      resolveTargets().forEach(node => node.setAttribute('stroke-width', String(value)));
    });
    thicknessInput.addEventListener('change', () => {
      const numeric = Number(thicknessInput.value);
      const normalized = Number.isFinite(numeric) ? Math.max(0.2, numeric) : null;
      if(scopeSelect.value === 'global'){
        state.summaryGlobalStyle = Object.assign({}, state.summaryGlobalStyle || {}, { thickness: normalized });
        if(typeof state.scheduleDraw === 'function'){ state.scheduleDraw(); }
        if(state.summaryStyles && typeof state.summaryStyles === 'object'){
          Object.keys(state.summaryStyles).forEach(k => {
            state.summaryStyles[k] = Object.assign({}, state.summaryStyles[k] || {}, { thickness: normalized });
          });
        }
      }else if(traceIndex != null){
        persistBoxSummaryStyle(traceIndex, { thickness: normalized });
      }
    });
    wrap.appendChild(makeInput('Thickness', thicknessInput));

    // Transparency: slider indicates transparency (0 = opaque, 100 = fully transparent)
    const opacityInput = doc.createElement('input');
    opacityInput.type = 'range';
    opacityInput.min = '0';
    opacityInput.max = '100';
    opacityInput.step = '1';
    const initialOpacity = clampSummaryOpacity(persisted?.opacity);
    const derivedOpacity = initialOpacity != null
      ? initialOpacity
      : clampSummaryOpacity(target.getAttribute('stroke-opacity'));
    const initialTransparency = Number.isFinite(derivedOpacity) ? Math.round((1 - derivedOpacity) * 100) : 0;
    const opacityValue = doc.createElement('span');
    opacityValue.className = 'workspace-toolbar__input-value';
    opacityInput.value = String(initialTransparency);
    opacityValue.textContent = `${opacityInput.value}%`;
    let pendingSummaryOpacity = null;
    const applySummaryOpacityLive = typeof Shared.debounceFrame === 'function'
      ? Shared.debounceFrame(() => {
          if(pendingSummaryOpacity == null){ return; }
          resolveTargets().forEach(node => node.setAttribute('stroke-opacity', String(pendingSummaryOpacity)));
        })
      : null;
    opacityInput.addEventListener('input', () => {
      const pct = Number(opacityInput.value);
      const bounded = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
      const transparency = bounded / 100;
      const normalized = 1 - transparency;
      pendingSummaryOpacity = normalized;
      if(scopeSelect.value === 'global'){
        scheduleBoxGlobalOpacityApply(normalized);
      }else if(applySummaryOpacityLive){
        applySummaryOpacityLive();
      }else{
        resolveTargets().forEach(node => node.setAttribute('stroke-opacity', String(normalized)));
      }
      opacityValue.textContent = `${Math.round(bounded)}%`;
    });
    opacityInput.addEventListener('change', () => {
      const pct = Number(opacityInput.value);
      const bounded = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
      const normalized = 1 - (bounded / 100);
      if(scopeSelect.value === 'global'){
        scheduleBoxGlobalOpacityApply(normalized);
        state.summaryGlobalStyle = Object.assign({}, state.summaryGlobalStyle || {}, { opacity: normalized });
        if(typeof state.scheduleDraw === 'function'){ state.scheduleDraw(); }
        if(state.summaryStyles && typeof state.summaryStyles === 'object'){
          Object.keys(state.summaryStyles).forEach(k => {
            state.summaryStyles[k] = Object.assign({}, state.summaryStyles[k] || {}, { opacity: normalized });
          });
        }
      }else if(traceIndex != null){
        persistBoxSummaryStyle(traceIndex, { opacity: normalized });
      }
    });
    const opacityWrap = doc.createElement('div');
    opacityWrap.style.display = 'inline-flex';
    opacityWrap.style.alignItems = 'center';
    opacityWrap.appendChild(opacityInput);
    opacityWrap.appendChild(opacityValue);
    wrap.appendChild(makeInput('Transparency', opacityWrap));

    toolbarHost.appendChild(wrap);
    toolbarHost.style.display = 'block';
    toolbarHost.classList.add('font-toolbar-host--visible');
    const dock = toolbarHost.closest('.workspace-toolbar__dock');
    if(dock){ dock.classList.add('workspace-toolbar__dock--active'); }

    try{
      if(toolbarHost.__boxDocClickHandler){
        document.removeEventListener('click', toolbarHost.__boxDocClickHandler);
        toolbarHost.__boxDocClickHandler = null;
      }
      const onDocClick = function(evt){
        try{
          const tgt = evt && evt.target ? evt.target : null;
          if(!tgt){ return; }
          if(toolbarHost.contains(tgt)){ return; }
          if(tgt.closest && tgt.closest('.shared-color-picker')){ return; }
          toolbarHost.classList.remove('font-toolbar-host--visible');
          toolbarHost.style.display = 'none';
          try{ if(typeof Shared.hideAllFormatControls === 'function') Shared.hideAllFormatControls(); }catch(e){}
          const d = toolbarHost.closest('.workspace-toolbar__dock');
          if(d){ d.classList.remove('workspace-toolbar__dock--active'); }
          document.removeEventListener('click', onDocClick);
          toolbarHost.__boxDocClickHandler = null;
        }catch(err){ console.warn('box.summary docClick error', err); }
      };
      document.addEventListener('click', onDocClick);
      toolbarHost.__boxDocClickHandler = onDocClick;
    }catch(err){ console.warn('attach doc click for box summary controls failed', err); }
  }

  function showBoxShapeFormatControls(target){
    const doc = global.document;
    if(!doc || !target){ return; }
    try{ if(typeof Shared.hideAllFormatControls === 'function') Shared.hideAllFormatControls(); }catch(e){}
    const anchor = doc.getElementById('boxFontHost');
    if(!anchor){ return; }

    let toolbarHost = anchor.nextElementSibling && anchor.nextElementSibling.classList && anchor.nextElementSibling.classList.contains('font-toolbar-host')
      ? anchor.nextElementSibling
      : null;
    if(!toolbarHost){
      toolbarHost = doc.createElement('div');
      toolbarHost.className = 'font-toolbar-host';
      toolbarHost.dataset.fontToolbarScope = 'box';
      toolbarHost.style.display = 'none';
      anchor.insertAdjacentElement('afterend', toolbarHost);
    }

    doc.querySelectorAll('.font-toolbar-host.font-toolbar-host--visible').forEach(h => {
      if(h !== toolbarHost){
        h.classList.remove('font-toolbar-host--visible');
        h.style.display = 'none';
      }
    });

    toolbarHost.innerHTML = '';
    const wrap = doc.createElement('div');
    wrap.className = 'workspace-toolbar__form workspace-toolbar__form--single box-shape-controls';
    wrap.dataset.shapeControls = '1';

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

    const traceAttr = target.getAttribute('data-trace');
    const traceIndex = traceAttr != null && traceAttr !== '' && traceAttr !== 'null' ? Number(traceAttr) : null;
    const colorIndexAttr = target.getAttribute('data-color-index');
    const colorIndex = colorIndexAttr != null && colorIndexAttr !== '' ? Number(colorIndexAttr) : (traceIndex != null ? traceIndex : null);
    const plotRoot = doc.getElementById('boxPlot');
    const resolveTargets = () => {
      if(traceIndex == null){
        return plotRoot ? Array.from(plotRoot.querySelectorAll('[data-box-shape=\"body\"]')) : [target];
      }
      return plotRoot ? Array.from(plotRoot.querySelectorAll(`[data-box-shape=\"body\"][data-trace=\"${traceIndex}\"]`)) : [target];
    };
    const scopeName = `boxShapeScope_${Date.now()}`;
    const scopeField = doc.createElement('label');
    scopeField.className = 'workspace-toolbar__input workspace-toolbar__input--compact workspace-toolbar__input--scope';
    const scopeLabel = doc.createElement('span');
    scopeLabel.className = 'workspace-toolbar__input-label';
    scopeLabel.textContent = 'Scope';
    const scopeSelect = doc.createElement('select');
    scopeSelect.name = scopeName;
    scopeSelect.className = 'workspace-toolbar__select';
    const optTrace = doc.createElement('option');
    optTrace.value = 'trace';
    optTrace.textContent = 'Trace';
    optTrace.disabled = traceIndex == null;
    const optGlobal = doc.createElement('option');
    optGlobal.value = 'global';
    optGlobal.textContent = 'Global';
    scopeSelect.appendChild(optTrace);
    scopeSelect.appendChild(optGlobal);
    scopeSelect.value = traceIndex != null ? 'trace' : 'global';
    scopeField.appendChild(scopeLabel);
    scopeField.appendChild(scopeSelect);
    wrap.appendChild(scopeField);

    const currentStyle = getTraceShapeStyle(traceIndex);
    const fallbackFill = target.getAttribute('fill') || state.fillColors?.[colorIndex] || state.lastDefaultFill || '#4472c4';
    const fallbackBorder = target.getAttribute('stroke') || state.borderColors?.[colorIndex] || shadeColor(fallbackFill, -30);

    const openColorPicker = (inputEl, opts = {}) => {
      inputEl.addEventListener('click', evt => {
        evt.preventDefault();
        if(typeof Shared.openColorPicker === 'function'){
          const current = inputEl.value;
          Shared.openColorPicker({
            anchor: inputEl,
            color: current,
            onInput(value){
              if(!value){ return; }
              inputEl.value = value;
              if(typeof opts.onPreview === 'function') opts.onPreview(value);
            },
            onChange(value){
              if(!value){ return; }
              inputEl.value = value;
              if(typeof opts.onCommit === 'function') opts.onCommit(value);
            }
          });
          return;
        }
        if(typeof Shared.attachColorPickerNear === 'function'){
          try{ Shared.attachColorPickerNear(inputEl); }catch(e){}
        }
      });
    };

    // Fill
    const fillInput = doc.createElement('input');
    fillInput.type = 'color';
    try{ fillInput.value = currentStyle?.fill || fallbackFill; }catch(e){}
    openColorPicker(fillInput, {
      onPreview(next){
        resolveTargets().forEach(node => node.setAttribute('fill', next));
      },
      onCommit(next){
        resolveTargets().forEach(node => node.setAttribute('fill', next));
        if(scopeSelect.value === 'global'){
          applyTraceShapeGlobalStyle({ fill: next });
          if(Array.isArray(state.fillColors)){
            for(let i=0;i<state.fillColors.length;i+=1){ state.fillColors[i] = next; }
          }
          if(els?.boxFill){ try{ els.boxFill.value = next; }catch(e){} }
          state.lastDefaultFill = next;
        }else if(traceIndex != null){
          persistTraceShapeStyle(traceIndex, { fill: next });
          if(colorIndex != null && colorIndex >= 0){
            state.fillColors[colorIndex] = next;
          }
        }
        if(typeof state.scheduleDraw === 'function'){ state.scheduleDraw(); }
      }
    });
    const fillLabel = makeInput('Fill', fillInput);
    fillLabel.classList.add('workspace-toolbar__input--color');
    wrap.appendChild(fillLabel);

    // Border
    const borderInput = doc.createElement('input');
    borderInput.type = 'color';
    try{ borderInput.value = currentStyle?.border || fallbackBorder; }catch(e){}
    openColorPicker(borderInput, {
      onPreview(next){
        resolveTargets().forEach(node => node.setAttribute('stroke', next));
      },
      onCommit(next){
        resolveTargets().forEach(node => node.setAttribute('stroke', next));
        if(scopeSelect.value === 'global'){
          applyTraceShapeGlobalStyle({ border: next });
          if(Array.isArray(state.borderColors)){
            for(let i=0;i<state.borderColors.length;i+=1){ state.borderColors[i] = next; }
          }
          if(els?.boxBorder){ try{ els.boxBorder.value = next; }catch(e){} }
        }else if(traceIndex != null){
          persistTraceShapeStyle(traceIndex, { border: next });
          if(colorIndex != null && colorIndex >= 0){
            state.borderColors[colorIndex] = next;
          }
        }
        if(typeof state.scheduleDraw === 'function'){ state.scheduleDraw(); }
      }
    });
    const borderLabel = makeInput('Border', borderInput);
    borderLabel.classList.add('workspace-toolbar__input--color');
    wrap.appendChild(borderLabel);

    // Thickness
    const thicknessInput = doc.createElement('input');
    thicknessInput.type = 'number';
    thicknessInput.min = '0';
    thicknessInput.step = '0.1';
    const fallbackThickness = currentStyle?.thickness != null
      ? Number(currentStyle.thickness)
      : Number(target.getAttribute('stroke-width')) || Number(els?.boxBorderWidth?.value) || 1;
    if(Number.isFinite(fallbackThickness)){ thicknessInput.value = String(fallbackThickness); }
    thicknessInput.addEventListener('input', ()=>{
      const numeric = Number(thicknessInput.value);
      const normalized = Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
      resolveTargets().forEach(node => node.setAttribute('stroke-width', String(normalized)));
    });
    thicknessInput.addEventListener('change', ()=>{
      const numeric = Number(thicknessInput.value);
      const normalized = Number.isFinite(numeric) ? Math.max(0, numeric) : null;
      if(scopeSelect.value === 'global'){
        applyTraceShapeGlobalStyle({ thickness: normalized });
      }else if(traceIndex != null){
        persistTraceShapeStyle(traceIndex, { thickness: normalized });
      }
      if(typeof state.scheduleDraw === 'function'){ state.scheduleDraw(); }
    });
    wrap.appendChild(makeInput('Thickness', thicknessInput));

    // Transparency: slider indicates transparency (0 = opaque, 100 = fully transparent)
    const opacityInput = doc.createElement('input');
    opacityInput.type = 'range';
    opacityInput.min = '0';
    opacityInput.max = '100';
    opacityInput.step = '1';
    const currentOpacity = currentStyle?.opacity != null ? currentStyle.opacity : target.getAttribute('fill-opacity');
    const derivedOpacity = Number.isFinite(Number(currentOpacity)) ? Number(currentOpacity) : 1;
    const initialTransparency = Math.round((1 - derivedOpacity) * 100);
    opacityInput.value = String(initialTransparency);
    const opacityValue = doc.createElement('span');
    opacityValue.className = 'workspace-toolbar__input-value';
    opacityValue.textContent = `${opacityInput.value}%`;
    let pendingShapeOpacity = null;
    const applyShapeOpacityLive = typeof Shared.debounceFrame === 'function'
      ? Shared.debounceFrame(() => {
          if(pendingShapeOpacity == null){ return; }
          resolveTargets().forEach(node => {
            node.setAttribute('fill-opacity', String(pendingShapeOpacity));
            node.setAttribute('stroke-opacity', String(pendingShapeOpacity));
          });
        })
      : null;
    opacityInput.addEventListener('input', ()=>{
      const pct = Number(opacityInput.value);
      const bounded = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
      const transparency = bounded / 100;
      const normalized = 1 - transparency;
      pendingShapeOpacity = normalized;
      if(scopeSelect.value === 'global'){
        scheduleBoxGlobalOpacityApply(normalized);
      }else if(applyShapeOpacityLive){
        applyShapeOpacityLive();
      }else{
        resolveTargets().forEach(node => {
          node.setAttribute('fill-opacity', String(normalized));
          node.setAttribute('stroke-opacity', String(normalized));
        });
      }
      opacityValue.textContent = `${Math.round(bounded)}%`;
    });
    opacityInput.addEventListener('change', ()=>{
      const pct = Number(opacityInput.value);
      const bounded = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
      const normalized = 1 - (bounded / 100);
      if(scopeSelect.value === 'global'){
        scheduleBoxGlobalOpacityApply(normalized);
        applyTraceShapeGlobalStyle({ opacity: normalized });
      }else if(traceIndex != null){
        persistTraceShapeStyle(traceIndex, { opacity: normalized });
      }
      if(typeof state.scheduleDraw === 'function'){ state.scheduleDraw(); }
    });
    const opacityWrap = doc.createElement('div');
    opacityWrap.style.display = 'inline-flex';
    opacityWrap.style.alignItems = 'center';
    opacityWrap.appendChild(opacityInput);
    opacityWrap.appendChild(opacityValue);
    wrap.appendChild(makeInput('Transparency', opacityWrap));

    toolbarHost.appendChild(wrap);
    toolbarHost.style.display = 'block';
    toolbarHost.classList.add('font-toolbar-host--visible');
    const dock = toolbarHost.closest('.workspace-toolbar__dock');
    if(dock){ dock.classList.add('workspace-toolbar__dock--active'); }
    try{
      if(toolbarHost.__boxDocClickHandler){
        document.removeEventListener('click', toolbarHost.__boxDocClickHandler);
        toolbarHost.__boxDocClickHandler = null;
      }
      const onDocClick = function(evt){
        try{
          const tgt = evt && evt.target ? evt.target : null;
          if(!tgt){ return; }
          if(toolbarHost.contains(tgt)){ return; }
          if(tgt.closest && tgt.closest('.shared-color-picker')){ return; }
          toolbarHost.classList.remove('font-toolbar-host--visible');
          toolbarHost.style.display = 'none';
          const d = toolbarHost.closest('.workspace-toolbar__dock');
          if(d){ d.classList.remove('workspace-toolbar__dock--active'); }
          document.removeEventListener('click', onDocClick);
          toolbarHost.__boxDocClickHandler = null;
        }catch(err){ console.warn('box.format docClick error', err); }
      };
      document.addEventListener('click', onDocClick);
      toolbarHost.__boxDocClickHandler = onDocClick;
    }catch(err){ console.warn('attach doc click for box shape controls failed', err); }
  }

  function clampWhiskerMultiplier(value){
    const numeric=Number(value);
    if(!Number.isFinite(numeric) || numeric<=0){
      return DEFAULT_WHISKER_MULTIPLIER;
    }
    return Math.max(0.1, numeric);
  }

  function formatWhiskerAnnotation(meta,multiplier){
    if(!meta || meta.key===DEFAULT_WHISKER_RULE){
      return null;
    }
    const resolvedMultiplier=Number.isFinite(multiplier)?multiplier:(meta.multiplier??DEFAULT_WHISKER_MULTIPLIER);
    if(meta.mode==='sd'){
      return `Whiskers use mean ± ${resolvedMultiplier.toLocaleString('en-US',{ maximumFractionDigits:2 })} SD.`;
    }
    if(meta.key==='custom'){
      return `Whiskers use custom ${resolvedMultiplier.toLocaleString('en-US',{ maximumFractionDigits:2 })}×IQR fences.`;
    }
    return `${resolvedMultiplier.toLocaleString('en-US',{ maximumFractionDigits:2 })}×IQR whiskers applied.`;
  }

  function computeWhiskerFences(context){
    const { q1, q3, iqr, mean, sd, rule, customMultiplier, debugEnabled, meta: metaInput } = context || {};
    const meta=metaInput || resolveWhiskerMeta(rule);
    let lowerFence=q1;
    let upperFence=q3;
    let multiplierUsed=meta.multiplier;
    if(meta.mode==='sd'){
      const deviation=(Number.isFinite(sd)?sd:0)*(meta.multiplier||1);
      multiplierUsed=meta.multiplier||1;
      lowerFence=(Number.isFinite(mean)?mean:0)-deviation;
      upperFence=(Number.isFinite(mean)?mean:0)+deviation;
    }else{
      const multiplier=meta.multiplier!=null?meta.multiplier:clampWhiskerMultiplier(customMultiplier);
      const spread=Number.isFinite(iqr)?iqr:0;
      lowerFence=(Number.isFinite(q1)?q1:0)-multiplier*spread;
      upperFence=(Number.isFinite(q3)?q3:0)+multiplier*spread;
      multiplierUsed=multiplier;
    }
    if(debugEnabled){
      console.debug('Debug: box whisker fences resolved',{ rule: meta.key, lowerFence, upperFence, multiplierUsed });
    }
    const annotation=formatWhiskerAnnotation(meta,multiplierUsed);
    return { lowerFence, upperFence, meta, multiplierUsed, annotation };
  }

  function resolveWhiskerExtents(sortedValues, fences, options){
    const values = Array.isArray(sortedValues) ? sortedValues : [];
    const lowerFence = fences?.lowerFence;
    const upperFence = fences?.upperFence;
    const q1 = fences?.q1;
    const q3 = fences?.q3;
    const debugEnabled = !!options?.debugEnabled;
    const label = options?.label || 'trace';
    const orientation = options?.orientation || 'vertical';
    const token = options?.token;
    const outliers = [];
    let wMin = Infinity;
    let wMax = -Infinity;
    let iterCount = 0;
    let observedMin = Infinity;
    let observedMax = -Infinity;
    for(const raw of values){
      const v = Number(raw);
      if(!Number.isFinite(v)){
        continue;
      }
      observedMin = v < observedMin ? v : observedMin;
      observedMax = v > observedMax ? v : observedMax;
      if(v < lowerFence || v > upperFence){
        outliers.push(v);
      }else{
        if(v < wMin) wMin = v;
        if(v > wMax) wMax = v;
      }
      iterCount += 1;
      if(debugEnabled && iterCount % 10000 === 0){
        console.debug('Debug: box whisker iterate',{ label, orientation, iterCount, lowerFence, upperFence, token });
      }
    }
    const fallbackMinSource = Number.isFinite(lowerFence)
      ? lowerFence
      : (Number.isFinite(options?.minValue) ? options.minValue : (Number.isFinite(observedMin) ? observedMin : (Number.isFinite(q1) ? q1 : 0)));
    const fallbackMaxSource = Number.isFinite(upperFence)
      ? upperFence
      : (Number.isFinite(options?.maxValue) ? options.maxValue : (Number.isFinite(observedMax) ? observedMax : (Number.isFinite(q3) ? q3 : fallbackMinSource)));
    const fallbackApplied = !Number.isFinite(wMin) || !Number.isFinite(wMax);
    if(!Number.isFinite(wMin)){
      wMin = fallbackMinSource;
    }
    if(!Number.isFinite(wMax)){
      wMax = fallbackMaxSource;
    }
    if(wMin > wMax){
      const mid = (wMin + wMax) / 2;
      wMin = mid;
      wMax = mid;
    }
    if(debugEnabled){
      console.debug('Debug: box whisker extents',{ label, orientation, wMin, wMax, outlierCount: outliers.length, fallbackApplied, token });
    }
    return { wMin, wMax, outliers };
  }

  function percentileFromSorted(sorted, p){
    if(!Array.isArray(sorted) || !sorted.length){
      return NaN;
    }
    const clamped = Math.min(Math.max(p, 0), 1);
    const pos = (sorted.length - 1) * clamped;
    const base = Math.floor(pos);
    const rest = pos - base;
    const baseVal = sorted[base];
    const nextVal = sorted[base + 1];
    if(nextVal === undefined){
      return baseVal;
    }
    return baseVal + rest * (nextVal - baseVal);
  }

  // Create a compact SVG path representing many small squares (approximate points).
  // Returns an SVGPathElement. Points is array of { x, y } in user coordinates.
  function buildBatchedPointPathD(points, size, shape){
    const half = size / 2;
    const normalizedShape = typeof shape === 'string' ? shape : 'square';
    const parts = [];
    for(let i = 0; i < points.length; i++){
      const pt = points[i];
      if(!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
      if(normalizedShape === 'circle'){
        const r = half;
        const x = pt.x;
        const y = pt.y;
        if(r > 0){
          parts.push(`M ${x + r} ${y} a ${r} ${r} 0 1 0 ${-2 * r} 0 a ${r} ${r} 0 1 0 ${2 * r} 0`);
        }
      }else if(normalizedShape === 'triangle'){
        const r = half;
        const x = pt.x;
        const y = pt.y;
        parts.push(`M ${x} ${y - r} L ${x + r} ${y + r} L ${x - r} ${y + r} Z`);
      }else if(normalizedShape === 'diamond'){
        const r = half;
        const x = pt.x;
        const y = pt.y;
        parts.push(`M ${x} ${y - r} L ${x + r} ${y} L ${x} ${y + r} L ${x - r} ${y} Z`);
      }else if(normalizedShape === 'cross'){
        const r = half;
        const sizeVal = Math.max(r * 2, 2);
        const halfVal = sizeVal / 2;
        const bar = Math.max(sizeVal / 3, 2);
        const hb = bar / 2;
        const x = pt.x;
        const y = pt.y;
        const top = y - halfVal; const bottom = y + halfVal; const left = x - halfVal; const right = x + halfVal;
        parts.push([
          `M ${left} ${top + hb}`,
          `L ${left + hb} ${top}`,
          `L ${x} ${y - hb}`,
          `L ${right - hb} ${top}`,
          `L ${right} ${top + hb}`,
          `L ${x + hb} ${y}`,
          `L ${right} ${bottom - hb}`,
          `L ${right - hb} ${bottom}`,
          `L ${x} ${y + hb}`,
          `L ${left + hb} ${bottom}`,
          `L ${left} ${bottom - hb}`,
          `L ${x - hb} ${y}`,
          'Z'
        ].join(' '));
      }else if(normalizedShape === 'plus'){
        const r = half;
        const sizeVal = Math.max(r * 2, 2);
        const halfVal = sizeVal / 2;
        const bar = Math.max(sizeVal / 3, 2);
        const t = bar / 2;
        const x = pt.x;
        const y = pt.y;
        parts.push(`M ${x - t} ${y - halfVal} H ${x + t} V ${y - t} H ${x + halfVal} V ${y + t} H ${x + t} V ${y + halfVal} H ${x - t} V ${y + t} H ${x - halfVal} V ${y - t} H ${x - t} Z`);
      }else if(normalizedShape === 'star'){
        const r = half;
        const r2 = Math.max(r * 0.45, 1);
        const x = pt.x;
        const y = pt.y;
        const starPoints = [];
        for(let k = 0; k < 5; k += 1){
          const a = (Math.PI * 2 * k) / 5 - Math.PI / 2;
          starPoints.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
          const b = a + Math.PI / 5;
          starPoints.push({ x: x + Math.cos(b) * r2, y: y + Math.sin(b) * r2 });
        }
        const d = starPoints.map((ptVal, idx) => `${idx === 0 ? 'M' : 'L'} ${ptVal.x} ${ptVal.y}`).join(' ') + ' Z';
        parts.push(d);
      }else{
        const x0 = pt.x - half;
        const y0 = pt.y - half;
        // draw small rect using relative h/v commands for compactness
        parts.push(`M ${x0} ${y0} h ${size} v ${size} h -${size} Z`);
      }
    }
    return parts.join(' ');
  }

  function createBatchedPointPath(doc, points, size, opts){
    const shape = typeof opts?.shape === 'string' ? opts.shape : 'square';
    const path = doc.createElementNS(NS, 'path');
    path.setAttribute('d', buildBatchedPointPathD(points, size, shape));
    if(opts?.fill) path.setAttribute('fill', opts.fill);
    if(opts?.fillOpacity != null) path.setAttribute('fill-opacity', String(opts.fillOpacity));
    if(opts?.stroke) path.setAttribute('stroke', opts.stroke);
    if(opts?.strokeWidth) path.setAttribute('stroke-width', String(opts.strokeWidth));
    if(opts?.dataTrace != null) path.setAttribute('data-trace', String(opts.dataTrace));
    if(opts?.shape) path.setAttribute('data-shape', String(opts.shape));
    path.__batchedPoints = points;
    path.__batchedShape = shape;
    path.__batchedSize = size;
    return path;
  }

  function partitionArray(arr, left, right, pivotIndex){
    const pivotValue = arr[pivotIndex];
    [arr[pivotIndex], arr[right]] = [arr[right], arr[pivotIndex]];
    let storeIndex = left;
    for(let i = left; i < right; i++){
      if(arr[i] < pivotValue){
        [arr[storeIndex], arr[i]] = [arr[i], arr[storeIndex]];
        storeIndex += 1;
      }
    }
    [arr[right], arr[storeIndex]] = [arr[storeIndex], arr[right]];
    return storeIndex;
  }

  function nthValueInPlace(arr, n, left = 0, right = arr.length - 1){
    let start = left;
    let end = right;
    while(start <= end){
      if(start === end){
        return arr[start];
      }
      const pivotIndex = Math.floor((start + end) / 2);
      const newPivotIndex = partitionArray(arr, start, end, pivotIndex);
      if(n === newPivotIndex){
        return arr[n];
      }
      if(n < newPivotIndex){
        end = newPivotIndex - 1;
      }else{
        start = newPivotIndex + 1;
      }
    }
    return arr[start];
  }

  function quantileFromUnsorted(values, p){
    if(!Array.isArray(values) || !values.length){
      return NaN;
    }
    const pos = (values.length - 1) * Math.min(Math.max(p, 0), 1);
    const lowerIndex = Math.floor(pos);
    const upperIndex = Math.ceil(pos);
    const working = values.slice();
    const lowerValue = nthValueInPlace(working, lowerIndex);
    if(upperIndex === lowerIndex){
      return lowerValue;
    }
    const upperValue = nthValueInPlace(working, upperIndex);
    return lowerValue + (upperValue - lowerValue) * (pos - lowerIndex);
  }

  function selectQuantileInPlace(work, p){
    if(!work.length){
      return NaN;
    }
    const pos = (work.length - 1) * Math.min(Math.max(p, 0), 1);
    const lowerIndex = Math.floor(pos);
    const upperIndex = Math.ceil(pos);
    const lowerValue = nthValueInPlace(work, lowerIndex);
    if(upperIndex === lowerIndex){
      return lowerValue;
    }
    const upperValue = nthValueInPlace(work, upperIndex);
    return lowerValue + (upperValue - lowerValue) * (pos - lowerIndex);
  }

  function computeTraceSummary(values, options){
    const requireSorted = !!options?.requireSorted;
    const assumeFiniteValues = options?.assumeFiniteValues === true;
    const precomputed = options?.precomputedMoments && Number.isFinite(options.precomputedMoments.count)
      ? options.precomputedMoments
      : null;
    if(!Array.isArray(values) || !values.length){
      return {
        count: 0,
        mean: 0,
        variance: 0,
        sd: 0,
        min: NaN,
        max: NaN,
        q1: NaN,
        median: NaN,
        q3: NaN,
        iqr: 0,
        sortedValues: requireSorted ? [] : null,
        sum: 0,
        sumSquares: 0,
        sumCubes: 0,
        sumFourth: 0
      };
    }
    const sourceValues = Array.isArray(values) ? values : [];
    let numericValues;
    if(assumeFiniteValues){
      numericValues = sourceValues.slice();
    }else{
      numericValues = [];
      for(let idx = 0; idx < sourceValues.length; idx++){
        const v = Number(sourceValues[idx]);
        if(Number.isFinite(v)){
          numericValues.push(v);
        }
      }
    }
    const count = precomputed?.count ?? numericValues.length;
    if(!count){
      return {
        count: 0,
        mean: 0,
        variance: 0,
        sd: 0,
        min: NaN,
        max: NaN,
        q1: NaN,
        median: NaN,
        q3: NaN,
        iqr: 0,
        sortedValues: requireSorted ? [] : null,
        sum: 0,
        sumSquares: 0,
        sumCubes: 0,
        sumFourth: 0
      };
    }
    let min = Number.isFinite(precomputed?.min) ? precomputed.min : numericValues[0];
    let max = Number.isFinite(precomputed?.max) ? precomputed.max : numericValues[0];
    let sum = Number.isFinite(precomputed?.sum) ? precomputed.sum : 0;
    let sumSquares = Number.isFinite(precomputed?.sumSquares) ? precomputed.sumSquares : 0;
    let sumCubes = Number.isFinite(precomputed?.sumCubes) ? precomputed.sumCubes : 0;
    let sumFourth = Number.isFinite(precomputed?.sumFourth) ? precomputed.sumFourth : 0;
    if(!precomputed){
      for(let idx = 0; idx < numericValues.length; idx++){
        const value = numericValues[idx];
        if(value < min) min = value;
        if(value > max) max = value;
        sum += value;
        const square = value * value;
        sumSquares += square;
        sumCubes += square * value;
        sumFourth += square * square;
      }
    }
    const mean = sum / count;
    const variance = count > 1 ? Math.max(0, (sumSquares - (sum * sum) / count) / (count - 1)) : 0;
    const sd = Math.sqrt(variance);
    let q1;
    let median;
    let q3;
    let sortedValues = null;
    if(requireSorted){
      const sorted = numericValues.slice().sort((a, b) => a - b);
      sortedValues = sorted;
      q1 = percentileFromSorted(sorted, 0.25);
      median = percentileFromSorted(sorted, 0.5);
      q3 = percentileFromSorted(sorted, 0.75);
    }else{
      const working = numericValues;
      q1 = selectQuantileInPlace(working, 0.25);
      median = selectQuantileInPlace(working, 0.5);
      q3 = selectQuantileInPlace(working, 0.75);
    }
    return {
      count,
      mean,
      variance,
      sd,
      min,
      max,
      q1,
      median,
      q3,
      iqr: Number.isFinite(q3) && Number.isFinite(q1) ? q3 - q1 : 0,
      sortedValues,
      sum,
      sumSquares,
      sumCubes,
      sumFourth
    };
  }

  function benchmarkTraceSummaries(config){
    const rows = Math.max(1, Math.floor(Number(config?.rows) || 1));
    const cols = Math.max(1, Math.floor(Number(config?.cols) || 1));
    const generator = typeof config?.generator === 'function'
      ? config.generator
      : ((rowIdx, colIdx) => ((rowIdx * 131 + colIdx * 17) % 100) + (rowIdx % 5));
    const dataset = Array.from({ length: cols }, (_, colIdx) => {
      const col = new Array(rows);
      for(let r = 0; r < rows; r++){
        col[r] = Number(generator(r, colIdx)) || 0;
      }
      return col;
    });
    const perf = global.performance;
    const start = perf?.now ? perf.now() : Date.now();
    dataset.forEach(values => {
      computeTraceSummary(values, { requireSorted: config?.requireSorted === true });
    });
    const end = perf?.now ? perf.now() : Date.now();
    return {
      rows,
      cols,
      points: rows * cols,
      durationMs: Number((end - start).toFixed(3))
    };
  }

  function benchmarkDatasetLoad(config){
    const matrix = Array.isArray(config?.matrix) ? config.matrix : null;
    if(!matrix || matrix.length < 2){
      return { ok:false, reason:'Matrix requires header row plus data rows.' };
    }
    const headerRow = Array.isArray(matrix[0]) ? matrix[0] : [];
    const totalCols = headerRow.length;
    if(!totalCols){
      return { ok:false, reason:'Header row is empty.' };
    }
    const colLimitRaw = Number(config?.columns);
    const colLimit = Number.isFinite(colLimitRaw) && colLimitRaw > 0
      ? Math.min(totalCols, Math.floor(colLimitRaw))
      : totalCols;
    const targets = config?.columnIndices;
    const perf = global.performance;
    const now = typeof perf?.now === 'function' ? () => perf.now() : () => Date.now();
    const traces = [];
    const collectStart = now();
    const chosenColumns = Array.isArray(targets) && targets.length
      ? targets.map(idx => Math.max(0, Math.min(totalCols - 1, idx)))
      : Array.from({ length: colLimit }, (_, idx) => idx);
    chosenColumns.forEach(colIndex => {
      const labelRaw = headerRow[colIndex];
      const label = typeof labelRaw === 'string' && labelRaw.trim() ? labelRaw.trim() : `Col ${colIndex + 1}`;
      const values = [];
      const moments = {
        count: 0,
        sum: 0,
        sumSquares: 0,
        sumCubes: 0,
        sumFourth: 0,
        min: Infinity,
        max: -Infinity
      };
      for(let rowIndex = 1; rowIndex < matrix.length; rowIndex++){
        const row = matrix[rowIndex];
        if(!row){ continue; }
        const rawValue = row[colIndex];
        if(rawValue === null || rawValue === undefined || rawValue === ''){
          continue;
        }
        const numeric = typeof rawValue === 'number' ? rawValue : parseFloat(rawValue);
        if(Number.isFinite(numeric)){
          values.push(numeric);
          moments.count += 1;
          moments.sum += numeric;
          const square = numeric * numeric;
          moments.sumSquares += square;
          moments.sumCubes += square * numeric;
          moments.sumFourth += square * square;
          if(numeric < moments.min) moments.min = numeric;
          if(numeric > moments.max) moments.max = numeric;
        }
      }
      if(values.length){
        traces.push({ name: label, rawY: values, __moments: moments });
      }
    });
    const collectEnd = now();
    const summaryStart = now();
    const summaries = [];
    traces.forEach(trace => {
      trace.summary = computeTraceSummary(trace.rawY, {
        requireSorted: false,
        assumeFiniteValues: true,
        precomputedMoments: trace.__moments
      });
      summaries.push(trace.summary);
      delete trace.__moments;
    });
    const summaryEnd = now();
    let assumption = null;
    const assumptionStart = now();
    if(traces.length >= 2){
      const groups = traces.map(t => t.rawY);
      const labels = traces.map(t => t.name);
      assumption = computeAssumptionDiagnostics(groups, labels, {
        qqSampleLimit: ASSUMPTION_QQ_SAMPLE_LIMIT,
        summaries
      });
    }
    const assumptionEnd = now();
    const duration = total => Number(total.toFixed(3));
    const totalMs = duration(assumptionEnd - collectStart);
    return {
      ok: true,
      rows: matrix.length - 1,
      cols: totalCols,
      traceCount: traces.length,
      collectMs: duration(collectEnd - collectStart),
      summaryMs: duration(summaryEnd - summaryStart),
      assumptionMs: duration(assumptionEnd - assumptionStart),
      totalMs,
      durationMs: totalMs,
      warnings: assumption?.warnings?.length || 0
    };
  }

  function computeSeparatedCategoryUnits(groupIndices){
    if(!Array.isArray(groupIndices) || !groupIndices.length){
      return null;
    }
    const baseUnits = 1;
    const centers = [];
    let current = baseUnits / 2;
    for(let idx = 0; idx < groupIndices.length; idx++){
      centers.push(current);
      if(idx < groupIndices.length - 1){
        const group = Number.isFinite(groupIndices[idx]) ? groupIndices[idx] : null;
        const nextGroup = Number.isFinite(groupIndices[idx + 1]) ? groupIndices[idx + 1] : null;
        const sameGroup = group !== null && nextGroup !== null && group === nextGroup;
        const gapUnits = sameGroup ? baseUnits : baseUnits * SEPARATED_GROUP_GAP_MULTIPLIER;
        current += gapUnits;
      }
    }
    const totalSpan = current + baseUnits / 2;
    console.debug('Debug: box separated spacing units',{ categories: centers.length, totalUnits: totalSpan, gapMultiplier: SEPARATED_GROUP_GAP_MULTIPLIER });
    return { centers, baseUnits, totalSpan };
  }

  function scaleSeparatedCategoryUnits(units, plotSize, marginStart){
    if(!units || !Number.isFinite(plotSize) || plotSize <= 0){
      return null;
    }
    const scale = plotSize / units.totalSpan;
    const bandWidth = units.baseUnits * scale;
    const centers = units.centers.map(unit => marginStart + unit * scale);
    const spacing = {
      centers,
      bandWidth,
      halfBand: bandWidth / 2,
      start: centers.length ? centers[0] - bandWidth / 2 : marginStart,
      end: centers.length ? centers[centers.length - 1] + bandWidth / 2 : marginStart + plotSize,
      scale
    };
    console.debug('Debug: box separated spacing scaled',{ categories: centers.length, bandWidth, start: spacing.start, end: spacing.end });
    return spacing;
  }

  function attachBoxSelectAutoSize(select, label){
    if(!select){ return; }
    const debugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
    const watcher = typeof formControls.watchSelectAutoSize === 'function' ? formControls.watchSelectAutoSize : null;
    const autoSizer = typeof formControls.autoSizeSelect === 'function' ? formControls.autoSizeSelect : null;
    const contextLabel = label || 'box';
    try{
      if(watcher){
        watcher(select);
        if(debugEnabled){
          console.debug('Debug: box select auto-size watcher attached', {
            id: select.id || null,
            label: contextLabel
          });
        }
      }else if(autoSizer){
        autoSizer(select);
        if(debugEnabled){
          console.debug('Debug: box select auto-size applied without watcher', {
            id: select.id || null,
            label: contextLabel
          });
        }
      }else if(debugEnabled){
        console.debug('Debug: box select auto-size helper unavailable', {
          id: select.id || null,
          label: contextLabel
        });
      }
    }catch(err){
      if(debugEnabled){
        console.debug('Debug: box select auto-size attach error', {
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
      x: { tickInterval: null, minorTicks: false, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS, notation: 'auto' },
      y: { tickInterval: null, minorTicks: false, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS, notation: 'auto', brokenAxis: { enabled: false, segments: [] } }
    };
  }

  function sanitizeBoxAxisNotation(value){
    if(value === 'decimal' || value === 'scientific'){ return value; }
    return 'auto';
  }
  function fallbackSanitizeP(value){
    const num=Number(value);
    if(!Number.isFinite(num)||num<0){
      return 0;
    }
    if(num>1){
      return 1;
    }
    return num;
  }
  function fallbackClampUnit(value){
    if(!Number.isFinite(value)){
      return 1;
    }
    if(value<0){
      return 0;
    }
    if(value>1){
      return 1;
    }
    return value;
  }
  function fallbackAdjustNone(values){
    return values.map(v=>fallbackClampUnit(fallbackSanitizeP(v)));
  }
  function fallbackAdjustBonferroni(values){
    const m=values.length||1;
    return values.map(v=>fallbackClampUnit(fallbackSanitizeP(v)*m));
  }
  function fallbackAdjustSidak(values){
    const m=values.length||1;
    return values.map(v=>{
      const p=fallbackSanitizeP(v);
      return fallbackClampUnit(1-Math.pow(1-p,m));
    });
  }
  function fallbackAdjustHolm(values){
    const m=values.length;
    const ordered=values.map((v,index)=>({ p:fallbackSanitizeP(v), index }));
    ordered.sort((a,b)=>a.p-b.p);
    const adjusted=new Array(m).fill(1);
    let running=0;
    ordered.forEach((entry,idx)=>{
      const rank=m-idx;
      const raw=fallbackClampUnit(entry.p*rank);
      running=Math.max(running,raw);
      adjusted[entry.index]=fallbackClampUnit(running);
    });
    return adjusted;
  }
  function fallbackAdjustHochberg(values){
    const m=values.length;
    const ordered=values.map((v,index)=>({ p:fallbackSanitizeP(v), index }));
    ordered.sort((a,b)=>b.p-a.p);
    const adjusted=new Array(m).fill(1);
    let running=1;
    ordered.forEach((entry,idx)=>{
      const rank=idx+1;
      const raw=fallbackClampUnit(entry.p*rank);
      running=Math.min(running,raw);
      adjusted[entry.index]=fallbackClampUnit(running);
    });
    return adjusted;
  }
  function fallbackAdjustBH(values){
    const m=values.length;
    const ordered=values.map((v,index)=>({ p:fallbackSanitizeP(v), index }));
    ordered.sort((a,b)=>a.p-b.p);
    const adjusted=new Array(m).fill(1);
    let running=1;
    for(let i=m-1;i>=0;i--){
      const entry=ordered[i];
      const rank=i+1;
      const raw=fallbackClampUnit((entry.p*m)/rank);
      running=Math.min(running,raw);
      adjusted[entry.index]=fallbackClampUnit(running);
    }
    return adjusted;
  }
  function fallbackAdjustBY(values){
    const m=values.length;
    const harmonic=Array.from({ length: Math.max(m,1) },(_,idx)=>1/(idx+1)).reduce((sum,val)=>sum+val,0);
    const ordered=values.map((v,index)=>({ p:fallbackSanitizeP(v), index }));
    ordered.sort((a,b)=>a.p-b.p);
    const adjusted=new Array(m).fill(1);
    let running=1;
    for(let i=m-1;i>=0;i--){
      const entry=ordered[i];
      const rank=i+1;
      const raw=fallbackClampUnit((entry.p*m*harmonic)/rank);
      running=Math.min(running,raw);
      adjusted[entry.index]=fallbackClampUnit(running);
    }
    return adjusted;
  }
  const FALLBACK_CORRECTION_META={
    none:{ label:'None (unadjusted)', shortLabel:'None', footnote:count=>`P-values are unadjusted${count>0?` (${count} comparison${count===1?'':'s'})`:''}.`, adjust:fallbackAdjustNone },
    bonferroni:{ label:'Bonferroni', shortLabel:'Bonferroni', footnote:count=>`Bonferroni-adjusted P values across ${count} test${count===1?'':'s'}.`, adjust:fallbackAdjustBonferroni },
    holm:{ label:'Holm', shortLabel:'Holm', footnote:count=>`Holm correction applied across ${count} test${count===1?'':'s'}.`, adjust:fallbackAdjustHolm },
    sidak:{ label:'Šidák', shortLabel:'Šidák', footnote:count=>`Šidák correction applied across ${count} test${count===1?'':'s'}.`, adjust:fallbackAdjustSidak },
    hochberg:{ label:'Hochberg', shortLabel:'Hochberg', footnote:count=>`Hochberg correction applied across ${count} test${count===1?'':'s'}.`, adjust:fallbackAdjustHochberg },
    bh:{ label:'Benjamini–Hochberg (FDR)', shortLabel:'BH', footnote:count=>`Benjamini–Hochberg FDR correction across ${count} test${count===1?'':'s'}.`, adjust:fallbackAdjustBH },
    by:{ label:'Benjamini–Yekutieli (FDR)', shortLabel:'BY', footnote:count=>`Benjamini–Yekutieli FDR correction across ${count} test${count===1?'':'s'}.`, adjust:fallbackAdjustBY }
  };
  function fallbackCorrectionsList(){
    return Object.entries(FALLBACK_CORRECTION_META).map(([value,cfg])=>({ value, label:cfg.label }));
  }
  function getAvailableCorrections(){
    const statsHelpers=Shared.stats;
    if(statsHelpers && typeof statsHelpers.listCorrections==='function'){
      try{
        const list=statsHelpers.listCorrections();
        if(Array.isArray(list) && list.length){
          console.debug('Debug: box corrections sourced from Shared.stats',{ methods:list.map(item=>item.value) });
          return list.map(item=>({ value:item.value, label:item.label }));
        }
      }catch(err){
        console.debug('Debug: box getAvailableCorrections Shared.stats error',{ message:err?.message });
      }
    }
    const fallback=fallbackCorrectionsList();
    console.debug('Debug: box getAvailableCorrections fallback',{ methods:fallback.map(item=>item.value) });
    return fallback;
  }
  function ensureValidCorrectionValue(value){
    const options=getAvailableCorrections();
    const has=options.some(opt=>opt.value===value);
    if(has){
      return value;
    }
    const fallbackValue=options[0]?.value || DEFAULT_CORRECTION;
    console.debug('Debug: box ensureValidCorrectionValue fallback',{ requested:value, fallback:fallbackValue });
    return fallbackValue;
  }
  function resolveCorrectionMeta(method,count){
    const statsHelpers=Shared.stats;
    if(statsHelpers && typeof statsHelpers.getCorrectionMeta==='function'){
      try{
        const metaRaw=statsHelpers.getCorrectionMeta(method);
        const note=typeof metaRaw?.footnote==='function'?metaRaw.footnote(count || 0):metaRaw?.footnote;
        const resolved={
          key:metaRaw?.key || method || DEFAULT_CORRECTION,
          label:metaRaw?.label || metaRaw?.shortLabel || method || DEFAULT_CORRECTION,
          shortLabel:metaRaw?.shortLabel || metaRaw?.label || method || DEFAULT_CORRECTION,
          footnote:note || ''
        };
        console.debug('Debug: box resolveCorrectionMeta via Shared.stats',{ method:resolved.key, count });
        return resolved;
      }catch(err){
        console.debug('Debug: box resolveCorrectionMeta error',{ method, message:err?.message });
      }
    }
    const fallbackKey=FALLBACK_CORRECTION_META[method]?method:DEFAULT_CORRECTION;
    const cfg=FALLBACK_CORRECTION_META[fallbackKey];
    const footnote=typeof cfg.footnote==='function'?cfg.footnote(count || 0):cfg.footnote;
    console.debug('Debug: box resolveCorrectionMeta fallback',{ method, resolved:fallbackKey, count });
    return {
      key:fallbackKey,
      label:cfg.label,
      shortLabel:cfg.shortLabel || cfg.label,
      footnote:footnote || ''
    };
  }
  function applyPValueCorrection(values,method){
    const arr=Array.isArray(values)?values.slice():[];
    const statsHelpers=Shared.stats;
    if(statsHelpers && typeof statsHelpers.adjustPValues==='function'){
      try{
        const adjusted=statsHelpers.adjustPValues(arr,{ method });
        if(Array.isArray(adjusted) && adjusted.length===arr.length){
          console.debug('Debug: box applyPValueCorrection via Shared.stats',{ method, count:arr.length });
          return adjusted;
        }
      }catch(err){
        console.debug('Debug: box applyPValueCorrection Shared.stats error',{ method, message:err?.message });
      }
    }
    const fallbackKey=FALLBACK_CORRECTION_META[method]?method:DEFAULT_CORRECTION;
    const adjustFn=FALLBACK_CORRECTION_META[fallbackKey].adjust;
    console.debug('Debug: box applyPValueCorrection fallback',{ method, fallback:fallbackKey, count:arr.length });
    return adjustFn(arr);
  }

  function shadeColor(color, percent){
    const num=parseInt(color.slice(1),16);
    const amt=Math.round(2.55*percent);
    const R=(num>>16)+amt; const G=(num>>8&0x00FF)+amt; const B=(num&0x0000FF)+amt;
    const newColor='#'+(0x1000000+(R<255?(R<0?0:R):255)*0x10000+(G<255?(G<0?0:G):255)*0x100+(B<255?(B<0?0:B):255)).toString(16).slice(1);
    console.debug('Debug: shadeColor',{color,percent,newColor}); // Debug
    return newColor;
  }

  function computeSampleSpreadFactor(sampleSize){
    const n = Number(sampleSize) || 0;
    if(n <= 1){
      console.debug('Debug: computeSampleSpreadFactor minimal',{ sampleSize: n, factor: 0.2 });
      return 0.2;
    }
    const sqrtScaled = Math.sqrt(n) / 7;
    const factor = Math.min(1, Math.max(0.2, sqrtScaled));
    console.debug('Debug: computeSampleSpreadFactor',{ sampleSize: n, sqrtScaled, factor });
    return factor;
  }

  function computeSwarmOffsets(points, options){
    const entries = Array.isArray(points) ? points.slice() : [];
    const sampleSize = Number(options?.sampleSize) || entries.length;
    let pointRadiusValue = Number(options?.pointRadius);
    if(!Number.isFinite(pointRadiusValue) || pointRadiusValue <= 0){
      pointRadiusValue = 1;
    }
    const basePointRadius = pointRadiusValue;
    const axisSpacing = Number(options?.axisSpacing) || 0;
    const orientation = options?.orientation || 'vertical';
    const widthScaleMode = options?.widthScaleMode || 'none';
    const maxHalfWidthOverride = Number(options?.maxHalfWidth);
    const spreadFactor = computeSampleSpreadFactor(sampleSize);
    const debugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
    const PREFERRED_GAP_FACTOR = 2.05;
    const densityDistance = Math.max(0.5, basePointRadius * PREFERRED_GAP_FACTOR);
    let axisBoundary = Math.max(0, axisSpacing / 2 - basePointRadius);
    const violinScale = 0.45;
    const stripScale = 0.18;
    const baseScale = stripScale / violinScale;
    let effectiveHalfSpan = axisBoundary > 0
      ? axisSpacing * stripScale * spreadFactor
      : basePointRadius * 2.2 * spreadFactor;
    let globalMaxHalfWidth = Math.max(basePointRadius * 1.05, Math.min(effectiveHalfSpan, axisBoundary || effectiveHalfSpan));
    if(Number.isFinite(maxHalfWidthOverride) && maxHalfWidthOverride > 0){
      globalMaxHalfWidth = Math.max(basePointRadius * 1.05, maxHalfWidthOverride);
      if(axisBoundary > 0){
        globalMaxHalfWidth = Math.min(globalMaxHalfWidth, axisBoundary);
      }
    }
    const offsetsMap = new Map();
    if(!entries.length || !Number.isFinite(globalMaxHalfWidth) || globalMaxHalfWidth <= 0){
      console.debug('Debug: computeSwarmOffsets empty',{ orientation, sampleSize, axisSpacing });
      return { offsets: entries.map(()=>0), maxOffsetUsed: 0, spreadFactor, maxOffset: 0 };
    }
    const buildEntryJitterKey = (entry, seed) => {
      const raw = Number(entry?.raw);
      const baseValue = Number.isFinite(raw) ? raw : Number(entry?.coord) || 0;
      const scaled = Math.round(baseValue * 1000);
      let hash = (scaled ^ (seed || 0)) >>> 0;
      hash = ((hash >>> 16) ^ hash) * 0x45d9f3b;
      hash = ((hash >>> 16) ^ hash) * 0x45d9f3b;
      hash = ((hash >>> 16) ^ hash) >>> 0;
      hash = (hash + (Number(entry?.index) + 1) * 1013) >>> 0;
      return hash;
    };
    const buildSortedEntries = seed => {
      const sorted = [];
      entries.forEach(entry => {
        if(!entry || typeof entry.index !== 'number'){
          return;
        }
        const coord = Number(entry.coord);
        const safeCoord = Number.isFinite(coord) ? coord : 0;
        const jitter = buildEntryJitterKey(entry, seed);
        sorted.push({ entry, coord: safeCoord, jitter });
      });
      sorted.sort((a, b) => (a.coord - b.coord) || (a.jitter - b.jitter) || (a.entry.index - b.entry.index));
      return sorted;
    };
    const getMaxOverlapCount = (sorted, distance) => {
      if(!sorted.length || !Number.isFinite(distance) || distance <= 0){
        return 0;
      }
      let maxCount = 0;
      let start = 0;
      for(let i = 0; i < sorted.length; i++){
        const coord = sorted[i].coord;
        while(start < i && coord - sorted[start].coord > distance){
          start += 1;
        }
        const count = i - start + 1;
        if(count > maxCount){
          maxCount = count;
        }
      }
      return maxCount;
    };
    let seedBase = Math.round((sampleSize || entries.length) * 17 + pointRadiusValue * 1000);
    let sortedEntries = buildSortedEntries(seedBase);
    let collisionDistance = Math.max(0.5, pointRadiusValue * PREFERRED_GAP_FACTOR);
    let maxCount = getMaxOverlapCount(sortedEntries, collisionDistance);
    if(debugEnabled && maxCount > 1){
      console.debug('Debug: computeSwarmOffsets overlap scan',{
        orientation,
        pointRadius: pointRadiusValue,
        collisionDistance,
        maxCount
      });
    }
    if(maxCount <= 0){
      console.debug('Debug: computeSwarmOffsets noBins',{ orientation, sampleSize, axisSpacing });
      return { offsets: entries.map(()=>0), maxOffsetUsed: 0, spreadFactor, maxOffset: 0 };
    }

    if(maxCount > 1){
      const initialRadius = pointRadiusValue;
      const minRadius = 0.15;
      const maxAllowedRadius = (globalMaxHalfWidth * 2) / ((maxCount - 1) * PREFERRED_GAP_FACTOR);
      if(Number.isFinite(maxAllowedRadius) && maxAllowedRadius < pointRadiusValue){
        const adjusted = Math.max(minRadius, Math.min(pointRadiusValue, maxAllowedRadius));
        if(adjusted < pointRadiusValue){
          console.debug('Debug: computeSwarmOffsets auto-adjust radius',{ previousRadius: pointRadiusValue, adjustedRadius: adjusted, maxCount });
          pointRadiusValue = adjusted;
        }
      }
      if(pointRadiusValue !== initialRadius){
        seedBase = Math.round((sampleSize || entries.length) * 17 + pointRadiusValue * 1000);
        sortedEntries = buildSortedEntries(seedBase);
        collisionDistance = Math.max(0.5, pointRadiusValue * PREFERRED_GAP_FACTOR);
        maxCount = getMaxOverlapCount(sortedEntries, collisionDistance);
        if(debugEnabled && maxCount > 1){
          console.debug('Debug: computeSwarmOffsets overlap scan adjusted',{
            orientation,
            pointRadius: pointRadiusValue,
            collisionDistance,
            maxCount
          });
        }
      }
    }

    let localCounts = null;
    let densityMax = maxCount;
    if(widthScaleMode === 'density' && sortedEntries.length){
      localCounts = new Map();
      let left = 0;
      let right = 0;
      let maxLocal = 0;
      for(let i = 0; i < sortedEntries.length; i++){
        const coord = sortedEntries[i].coord;
        if(right < i){
          right = i;
        }
        while(right + 1 < sortedEntries.length && sortedEntries[right + 1].coord - coord <= densityDistance){
          right += 1;
        }
        while(coord - sortedEntries[left].coord > densityDistance){
          left += 1;
        }
        const count = right - left + 1;
        localCounts.set(sortedEntries[i].entry.index, count);
        if(count > maxLocal){
          maxLocal = count;
        }
      }
      densityMax = Math.max(1, maxLocal);
    }

    const groupMetaByIndex = new Map();
    const groupBuckets = new Map();
    const coordGroupSizeByIndex = new Map();
    if(sortedEntries.length){
      const coordQuantum = 1;
      sortedEntries.forEach(item => {
        const coord = Number(item?.coord);
        const coordKey = Number.isFinite(coord)
          ? Math.round(coord / coordQuantum) * coordQuantum
          : coord;
        let bucket = groupBuckets.get(coordKey);
        if(!bucket){
          bucket = [];
          groupBuckets.set(coordKey, bucket);
        }
        bucket.push(item.entry.index);
      });
      groupBuckets.forEach(bucket => {
        const size = bucket.length;
        for(let i = 0; i < size; i++){
          groupMetaByIndex.set(bucket[i], { size, index: i });
          coordGroupSizeByIndex.set(bucket[i], size);
        }
      });
    }

    const pairBuckets = [];
    if(sortedEntries.length > 1){
      const neighborInfoByIndex = new Map();
      let left = 0;
      let right = 0;
      for(let i = 0; i < sortedEntries.length; i++){
        const coord = sortedEntries[i].coord;
        if(right < i){
          right = i;
        }
        while(right + 1 < sortedEntries.length && sortedEntries[right + 1].coord - coord <= collisionDistance){
          right += 1;
        }
        while(coord - sortedEntries[left].coord > collisionDistance){
          left += 1;
        }
        neighborInfoByIndex.set(sortedEntries[i].entry.index, { left, right, count: right - left + 1 });
      }
      const paired = new Set();
      for(let i = 0; i < sortedEntries.length; i++){
        const entryIndex = sortedEntries[i].entry.index;
        if(paired.has(entryIndex)){
          continue;
        }
        if((coordGroupSizeByIndex.get(entryIndex) || 0) > 1){
          continue;
        }
        const info = neighborInfoByIndex.get(entryIndex);
        if(!info || info.count !== 2){
          continue;
        }
        let otherIndex = null;
        for(let k = info.left; k <= info.right; k++){
          const candidate = sortedEntries[k].entry.index;
          if(candidate !== entryIndex){
            otherIndex = candidate;
            break;
          }
        }
        if(otherIndex == null || paired.has(otherIndex)){
          continue;
        }
        if((coordGroupSizeByIndex.get(otherIndex) || 0) > 1){
          continue;
        }
        const otherInfo = neighborInfoByIndex.get(otherIndex);
        if(!otherInfo || otherInfo.count !== 2){
          continue;
        }
        paired.add(entryIndex);
        paired.add(otherIndex);
        pairBuckets.push([entryIndex, otherIndex]);
      }
    }

    const collisionDistanceSq = collisionDistance * collisionDistance;
    let maxUsed = 0;
    const placed = [];
    const maxHalfWidthByIndex = new Map();
    let activeStart = 0;
    sortedEntries.forEach((item, idx) => {
      const coord = item.coord;
      const groupMeta = groupMetaByIndex.get(item.entry.index) || null;
      while(activeStart < placed.length && coord - placed[activeStart].coord > collisionDistance){
        activeStart += 1;
      }
      let maxHalfWidth = globalMaxHalfWidth;
      if(widthScaleMode === 'density' && localCounts){
        const localCount = localCounts.get(item.entry.index) || 1;
        const scale = densityMax > 1 ? (localCount / densityMax) : 1;
        const scaledWidth = globalMaxHalfWidth * scale;
        maxHalfWidth = Math.max(pointRadiusValue * 1.05, Math.min(globalMaxHalfWidth, scaledWidth));
      }
      maxHalfWidthByIndex.set(item.entry.index, maxHalfWidth);
      const resolveOffset = maxHalfWidthValue => {
        if(!Number.isFinite(maxHalfWidthValue) || maxHalfWidthValue <= 0){
          return null;
        }
        const groupSize = groupMeta && Number.isFinite(groupMeta.size) ? groupMeta.size : 1;
        const groupIndex = groupMeta && Number.isFinite(groupMeta.index) ? groupMeta.index : 0;
        const preferSymmetric = groupSize > 1;
        const evenGroup = preferSymmetric && groupSize % 2 === 0;
        const intervals = [];
        for(let j = activeStart; j < placed.length; j++){
          const neighbor = placed[j];
          const dy = coord - neighbor.coord;
          const absDy = Math.abs(dy);
          if(absDy >= collisionDistance){
            continue;
          }
          const dx = Math.sqrt(Math.max(0, collisionDistanceSq - dy * dy));
          let start = neighbor.offset - dx;
          let end = neighbor.offset + dx;
          if(end < -maxHalfWidthValue || start > maxHalfWidthValue){
            continue;
          }
          if(start < -maxHalfWidthValue){ start = -maxHalfWidthValue; }
          if(end > maxHalfWidthValue){ end = maxHalfWidthValue; }
          if(end > start){
            intervals.push({ start, end });
          }
        }
        if(!intervals.length && !preferSymmetric){
          return 0;
        }
        let freeIntervals = null;
        if(!intervals.length){
          freeIntervals = [{ start: -maxHalfWidthValue, end: maxHalfWidthValue }];
        }else{
          intervals.sort((a, b) => (a.start - b.start) || (a.end - b.end));
          freeIntervals = [];
          let cursor = -maxHalfWidthValue;
          let curStart = intervals[0].start;
          let curEnd = intervals[0].end;
          for(let i = 1; i < intervals.length; i++){
            const next = intervals[i];
            if(next.start <= curEnd){
              curEnd = Math.max(curEnd, next.end);
            }else{
              if(curStart > cursor){
                freeIntervals.push({ start: cursor, end: curStart });
              }
              cursor = curEnd;
              curStart = next.start;
              curEnd = next.end;
            }
          }
          if(curStart > cursor){
            freeIntervals.push({ start: cursor, end: curStart });
          }
          cursor = Math.max(cursor, curEnd);
          if(cursor < maxHalfWidthValue){
            freeIntervals.push({ start: cursor, end: maxHalfWidthValue });
          }
        }
        freeIntervals = freeIntervals.filter(interval => interval.end - interval.start > 0.0001);
        let allowOverlap = false;
        if(!freeIntervals.length){
          allowOverlap = true;
          freeIntervals = [{ start: -maxHalfWidthValue, end: maxHalfWidthValue }];
        }
        const totalFree = freeIntervals.reduce((sum, interval) => sum + (interval.end - interval.start), 0);
        if(!Number.isFinite(totalFree) || totalFree <= 0){
          return null;
        }
        const candidateCount = Math.min(9, Math.max(5, Math.round(Math.log(entries.length + 2) * 2)));
        let rng = (item.jitter ^ (seedBase + idx * 2654435761)) >>> 0;
        const nextRand = () => {
          rng = (rng * 1664525 + 1013904223) >>> 0;
          return rng / 4294967295;
        };
        let candidates = [];
        const addCandidate = cand => {
          if(Number.isFinite(cand)){
            candidates.push(cand);
          }
        };
        let preferredOffset = null;
        if(preferSymmetric){
          const gapLimit = groupSize > 1 ? (maxHalfWidthValue * 2) / Math.max(1, groupSize - 1) : 0;
          const preferredGap = Math.min(collisionDistance, Number.isFinite(gapLimit) && gapLimit > 0 ? gapLimit : collisionDistance);
          const centerIndex = (groupSize - 1) / 2;
          preferredOffset = (groupIndex - centerIndex) * preferredGap;
          if(!Number.isFinite(preferredOffset)){
            preferredOffset = 0;
          }
          if(preferredOffset > maxHalfWidthValue){
            preferredOffset = maxHalfWidthValue;
          }else if(preferredOffset < -maxHalfWidthValue){
            preferredOffset = -maxHalfWidthValue;
          }
          addCandidate(preferredOffset);
        }
        for(let i = 0; i < candidateCount; i++){
          const u = nextRand();
          let target = u * totalFree;
          for(let k = 0; k < freeIntervals.length; k++){
            const interval = freeIntervals[k];
            const length = interval.end - interval.start;
            if(target <= length || k === freeIntervals.length - 1){
              const cand = interval.start + Math.min(length, Math.max(0, target));
              addCandidate(cand);
              break;
            }
            target -= length;
          }
        }
        if(allowOverlap){
          addCandidate(-maxHalfWidthValue);
          addCandidate(maxHalfWidthValue);
        }
        for(let k = 0; k < freeIntervals.length; k++){
          const interval = freeIntervals[k];
          if(!evenGroup && interval.start <= 0 && interval.end >= 0){
            addCandidate(0);
            break;
          }
        }
        if(!candidates.length){
          return null;
        }
        if(evenGroup){
          const zeroEps = 0.0001;
          const nonZero = candidates.filter(cand => Math.abs(cand) > zeroEps);
          if(nonZero.length){
            candidates = nonZero;
          }
        }
        let bestScore = -Infinity;
        let bestAbs = Infinity;
        let bestPreferredDist = Infinity;
        let chosenLocal = null;
        for(let i = 0; i < candidates.length; i++){
          const cand = candidates[i];
          let minDistSq = Infinity;
          for(let j = activeStart; j < placed.length; j++){
            const neighbor = placed[j];
            const dx = cand - neighbor.offset;
            const dy = coord - neighbor.coord;
            const distSq = dx * dx + dy * dy;
            if(distSq < minDistSq){
              minDistSq = distSq;
            }
          }
          const abs = Math.abs(cand);
          const preferredDist = Number.isFinite(preferredOffset) ? Math.abs(cand - preferredOffset) : Infinity;
          const scoreDelta = minDistSq - bestScore;
          if(scoreDelta > 0.0001){
            bestScore = minDistSq;
            bestAbs = abs;
            bestPreferredDist = preferredDist;
            chosenLocal = cand;
            continue;
          }
          if(Math.abs(scoreDelta) <= 0.0001){
            if(preferSymmetric && preferredDist + 0.0001 < bestPreferredDist){
              bestScore = minDistSq;
              bestAbs = abs;
              bestPreferredDist = preferredDist;
              chosenLocal = cand;
              continue;
            }
            if((!preferSymmetric || Math.abs(preferredDist - bestPreferredDist) <= 0.0001) && abs < bestAbs){
              bestScore = minDistSq;
              bestAbs = abs;
              bestPreferredDist = preferredDist;
              chosenLocal = cand;
              continue;
            }
          }
        }
        return chosenLocal;
      };
      let chosen = resolveOffset(maxHalfWidth);
      if(chosen == null && widthScaleMode !== 'density' && maxHalfWidth < globalMaxHalfWidth){
        chosen = resolveOffset(globalMaxHalfWidth);
        maxHalfWidth = globalMaxHalfWidth;
      }
      if(chosen == null){
        chosen = Math.max(-maxHalfWidth, Math.min(maxHalfWidth, 0));
      }
      offsetsMap.set(item.entry.index, chosen);
      placed.push({ coord, offset: chosen });
      const abs = Math.abs(chosen);
      if(abs > maxUsed){
        maxUsed = abs;
      }
    });
    const centerBuckets = [];
    if(groupBuckets.size){
      groupBuckets.forEach(bucket => {
        centerBuckets.push(bucket);
      });
    }
    if(pairBuckets.length){
      pairBuckets.forEach(bucket => {
        centerBuckets.push(bucket);
      });
    }
    if(centerBuckets.length){
      centerBuckets.forEach(bucket => {
        if(!Array.isArray(bucket) || bucket.length <= 1){
          return;
        }
        let sum = 0;
        let minShift = -Infinity;
        let maxShift = Infinity;
        for(let i = 0; i < bucket.length; i++){
          const index = bucket[i];
          const offset = offsetsMap.get(index) || 0;
          sum += offset;
          const limit = maxHalfWidthByIndex.has(index)
            ? maxHalfWidthByIndex.get(index)
            : globalMaxHalfWidth;
          if(Number.isFinite(limit) && limit > 0){
            minShift = Math.max(minShift, -limit - offset);
            maxShift = Math.min(maxShift, limit - offset);
          }
        }
        const mean = sum / bucket.length;
        let shift = -mean;
        if(Number.isFinite(minShift) && Number.isFinite(maxShift)){
          shift = Math.max(minShift, Math.min(maxShift, shift));
        }
        if(!Number.isFinite(shift) || Math.abs(shift) < 0.0001){
          return;
        }
        for(let i = 0; i < bucket.length; i++){
          const index = bucket[i];
          offsetsMap.set(index, (offsetsMap.get(index) || 0) + shift);
        }
      });
      maxUsed = 0;
      offsetsMap.forEach(value => {
        const abs = Math.abs(value || 0);
        if(abs > maxUsed){
          maxUsed = abs;
        }
      });
    }
    const offsets = entries.map(entry => offsetsMap.get(entry.index) || 0);
    console.debug('Debug: computeSwarmOffsets density',{ orientation, sampleSize, spreadFactor, axisSpacing, axisBoundary, globalMaxHalfWidth, maxOffsetUsed: maxUsed, pointCount: entries.length, maxBinSize: maxCount, adjustedRadius: pointRadiusValue, densityDistance, basePointRadius });
    return { offsets, maxOffsetUsed: maxUsed, spreadFactor, maxOffset: globalMaxHalfWidth, adjustedRadius: pointRadiusValue };
  }

  function createViolinBoundLookup(densityInfo, halfSpanPx, peakOverride){
    const positions = Array.isArray(densityInfo?.positions) ? densityInfo.positions : null;
    const densities = Array.isArray(densityInfo?.densities) ? densityInfo.densities : null;
    const valid = positions && densities && positions.length && positions.length === densities.length;
    if(!valid || !Number.isFinite(halfSpanPx) || halfSpanPx <= 0){
      return null;
    }
    const peak = Number.isFinite(peakOverride) && peakOverride > 0
      ? peakOverride
      : densities.reduce((max, v) => v > max ? v : max, 0);
    if(!peak){
      return null;
    }
    return value => {
      if(!Number.isFinite(value)){
        return 0;
      }
      let idx = positions.findIndex(p => p >= value);
      if(idx === -1){
        idx = positions.length - 1;
      }
      let densityAtValue;
      if(idx === 0){
        densityAtValue = densities[0];
      }else{
        const prevIdx = idx - 1;
        const p0 = positions[prevIdx];
        const p1 = positions[idx];
        const d0 = densities[prevIdx];
        const d1 = densities[idx];
        const span = p1 - p0;
        const tRaw = span > 0 ? (value - p0) / span : 0;
        const t = tRaw < 0 ? 0 : tRaw > 1 ? 1 : tRaw;
        densityAtValue = d0 + (d1 - d0) * t;
      }
      const normalized = densityAtValue / peak;
      const width = normalized * halfSpanPx;
      return Number.isFinite(width) && width > 0 ? width : 0;
    };
  }

  function populateIndividualSummarySelect(selectEl){
    if(!selectEl){ return; }
    const doc = selectEl.ownerDocument || global.document;
    if(!doc){ return; }
    const existingValues = new Set(Array.from(selectEl.options || []).map(opt => opt.value));
    const optionsChanged = INDIVIDUAL_SUMMARY_OPTIONS.some(opt => !existingValues.has(opt.value) || selectEl.querySelector(`option[value="${opt.value}"]`)?.textContent !== opt.label);
    if(!optionsChanged && selectEl.options.length === INDIVIDUAL_SUMMARY_OPTIONS.length){
      return;
    }
    selectEl.innerHTML = '';
    INDIVIDUAL_SUMMARY_OPTIONS.forEach(opt => {
      const option = doc.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      selectEl.appendChild(option);
    });
  }

  function computeSortedNumericValues(values){
    if(!Array.isArray(values) || !values.length){
      return [];
    }
    const filtered = values.filter(v => Number.isFinite(v));
    filtered.sort((a, b) => a - b);
    return filtered;
  }

  function getStudentTCritical(df, alpha){
    const fallback = 1.96;
    const dof = Number(df);
    if(!Number.isFinite(dof) || dof <= 0){
      return fallback;
    }
    const targetAlpha = Number.isFinite(alpha) ? alpha : 0.05;
    const jStatLib = global.jStat || global.jstat || global.window?.jStat;
    const invFn = jStatLib?.studentt?.inv;
    if(typeof invFn === 'function'){
      try{
        const critical = Math.abs(invFn(1 - targetAlpha / 2, dof));
        if(Number.isFinite(critical)){
          return critical;
        }
      }catch(err){
        console.debug('Debug: box getStudentTCritical fallback',{ message: err?.message, df: dof });
      }
    }
    return fallback;
  }

  function computeMeanCI95(summary){
    const count = Number(summary?.count) || 0;
    const mean = summary?.mean;
    const sd = summary?.sd;
    if(count < 2 || !Number.isFinite(mean) || !Number.isFinite(sd)){
      return null;
    }
    const sem = sd / Math.sqrt(count);
    if(!Number.isFinite(sem) || sem <= 0){
      return null;
    }
    const multiplier = getStudentTCritical(count - 1, 0.05);
    if(!Number.isFinite(multiplier)){
      return null;
    }
    return { low: mean - multiplier * sem, high: mean + multiplier * sem };
  }

  function computeMedianCIApprox(sortedValues, confidence){
    if(!Array.isArray(sortedValues) || !sortedValues.length){
      return null;
    }
    const n = sortedValues.length;
    if(n === 1){
      const value = sortedValues[0];
      return { low: value, high: value };
    }
    const targetConfidence = Number.isFinite(confidence) ? confidence : 0.95;
    const z = targetConfidence >= 0.99 ? 2.576 : 1.96;
    const center = (n + 1) / 2;
    const halfWidth = z * Math.sqrt(n) / 2;
    const lowerRank = Math.max(1, Math.floor(center - halfWidth));
    const upperRank = Math.min(n, Math.ceil(center + halfWidth));
    return {
      low: sortedValues[lowerRank - 1],
      high: sortedValues[upperRank - 1]
    };
  }

  function computeGeometricSummary(values){
    const filtered = Array.isArray(values)
      ? values.filter(v => Number.isFinite(v) && v > 0)
      : [];
    if(!filtered.length){
      return null;
    }
    const logValues = filtered.map(Math.log);
    const n = logValues.length;
    const meanLog = logValues.reduce((sum,val)=>sum+val,0)/n;
    let varianceLog = 0;
    for(const val of logValues){
      varianceLog += Math.pow(val - meanLog, 2);
    }
    varianceLog = n > 1 ? varianceLog / (n - 1) : 0;
    const sdLog = Math.sqrt(Math.max(varianceLog, 0));
    const semLog = n > 0 ? sdLog / Math.sqrt(n) : NaN;
    const multiplier = getStudentTCritical(n - 1, 0.05);
    const geoMean = Math.exp(meanLog);
    const ciLow = Number.isFinite(semLog) ? Math.exp(meanLog - multiplier * semLog) : NaN;
    const ciHigh = Number.isFinite(semLog) ? Math.exp(meanLog + multiplier * semLog) : NaN;
    const gsd = Math.exp(sdLog);
    return {
      sampleCount: n,
      geoMean,
      ciLow: Number.isFinite(ciLow) ? ciLow : NaN,
      ciHigh: Number.isFinite(ciHigh) ? ciHigh : NaN,
      gsdLow: Number.isFinite(gsd) ? geoMean / gsd : NaN,
      gsdHigh: Number.isFinite(gsd) ? geoMean * gsd : NaN
    };
  }

  function applyIndividualSummaryOverlay(mode, summary, valueList, operations){
    if(!operations){
      return;
    }
    const normalized = normalizeIndividualSummaryValue(mode);
    if(normalized === 'none'){
      return;
    }
    const sampleCount = Number(summary?.count) || (Array.isArray(valueList) ? valueList.filter(v=>Number.isFinite(v)).length : 0);
    const mean = summary?.mean;
    const sd = summary?.sd;
    const q1 = summary?.q1;
    const q3 = summary?.q3;
    const median = summary?.median;
    const minVal = summary?.min;
    const maxVal = summary?.max;
    const sortedValues = Array.isArray(summary?.sortedValues) && summary.sortedValues.length
      ? summary.sortedValues
      : computeSortedNumericValues(valueList);
    const debug = !!operations.debug;
    const drawPoint = typeof operations.drawPoint === 'function' ? operations.drawPoint : null;
    const drawInterval = typeof operations.drawInterval === 'function' ? operations.drawInterval : null;
    const drawMedianLine = typeof operations.drawMedianLine === 'function' ? operations.drawMedianLine : null;
    const logSkip = (label, extra) => {
      if(debug){
        console.debug('Debug: box summary overlay skipped',{ mode: normalized, label, ...extra });
      }
    };
    const ensurePoint = (value, radius, label) => {
      if(!drawPoint){ return false; }
      if(!Number.isFinite(value)){
        logSkip(label || 'point',{ value });
        return false;
      }
      drawPoint(value, radius);
      return true;
    };
    const ensureInterval = (low, high, label, opts) => {
      if(!drawInterval){ return false; }
      if(!Number.isFinite(low) || !Number.isFinite(high)){
        logSkip(label || 'interval',{ low, high });
        return false;
      }
      drawInterval(low, high, opts);
      return true;
    };
    const ensureMedianLine = value => {
      if(!drawMedianLine){ return false; }
      if(!Number.isFinite(value)){
        logSkip('median-line',{ value });
        return false;
      }
      drawMedianLine(value);
      return true;
    };
    const getGeoStats = () => {
      if(!operations.__geoSummary){
        operations.__geoSummary = computeGeometricSummary(valueList);
      }
      return operations.__geoSummary;
    };
    switch(normalized){
      case 'mean-point':
        ensurePoint(mean, 1.4, 'mean-point');
        break;
      case 'mean-sd':
        if(sampleCount > 1 && Number.isFinite(sd)){
          ensureInterval(mean - sd, mean + sd, 'mean-sd');
        }else{
          logSkip('mean-sd spread',{ sampleCount, sd });
        }
        ensurePoint(mean, 1.4, 'mean-sd-center');
        break;
      case 'mean-sem':
        if(sampleCount > 1 && Number.isFinite(sd)){
          const semValue = sd / Math.sqrt(sampleCount);
          ensureInterval(mean - semValue, mean + semValue, 'mean-sem');
        }else{
          logSkip('mean-sem spread',{ sampleCount, sd });
        }
        ensurePoint(mean, 1.4, 'mean-sem-center');
        break;
      case 'mean-ci':{
        const ci = computeMeanCI95(summary);
        if(ci){
          ensureInterval(ci.low, ci.high, 'mean-ci');
        }else{
          logSkip('mean-ci',{ sampleCount, sd });
        }
        ensurePoint(mean, 1.4, 'mean-ci-center');
        break;
      }
      case 'mean-range':
        ensureInterval(minVal, maxVal, 'mean-range');
        ensurePoint(mean, 1.4, 'mean-range-center');
        break;
      case 'geo-mean':{
        const geo = getGeoStats();
        if(geo){
          ensurePoint(geo.geoMean, 1.4, 'geo-mean');
        }else{
          logSkip('geo-mean',{ reason:'invalid-data' });
        }
        break;
      }
      case 'geo-mean-ci':{
        const geo = getGeoStats();
        if(geo){
          ensureInterval(geo.ciLow, geo.ciHigh, 'geo-mean-ci');
          ensurePoint(geo.geoMean, 1.4, 'geo-mean-ci-center');
        }else{
          logSkip('geo-mean-ci',{ reason:'invalid-data' });
        }
        break;
      }
      case 'geo-mean-gsd':{
        const geo = getGeoStats();
        if(geo){
          ensureInterval(geo.gsdLow, geo.gsdHigh, 'geo-mean-gsd');
          ensurePoint(geo.geoMean, 1.4, 'geo-mean-gsd-center');
        }else{
          logSkip('geo-mean-gsd',{ reason:'invalid-data' });
        }
        break;
      }
      case 'median-point':
        ensureMedianLine(median);
        ensurePoint(median, 1.2, 'median-point');
        break;
      case 'median-ci':{
        const ci = computeMedianCIApprox(sortedValues);
        if(ci){
          ensureInterval(ci.low, ci.high, 'median-ci');
        }else{
          logSkip('median-ci',{ reason:'ci-missing' });
        }
        ensureMedianLine(median);
        ensurePoint(median, 1.2, 'median-ci-point');
        break;
      }
      case 'median-range':
        ensureInterval(minVal, maxVal, 'median-range');
        ensureMedianLine(median);
        ensurePoint(median, 1.2, 'median-range-point');
        break;
      case 'median-iqr':
        ensureInterval(q1, q3, 'median-iqr');
        ensureMedianLine(median);
        ensurePoint(median, 1.2, 'median-iqr-point');
        break;
      default:
        break;
    }
  }
  const makeEditable = (el,onChange,options) => {
    const fn = Shared.makeEditable || global.makeEditable;
    if (typeof fn === 'function') {
      return fn(el,onChange,options);
    }
    console.warn('box component makeEditable fallback missing');
    return undefined;
  };
  const serializeSvg = (svgEl, options) => {
    const fn = Shared.serializeCleanSVG || global.serializeCleanSVG;
    if (typeof fn === 'function') {
      return fn(svgEl, options);
    }
    if (!svgEl) return '';
    const serializer = new (global.XMLSerializer || XMLSerializer)();
    return serializer.serializeToString(svgEl);
  };
  const ensureGraphViewport = Shared.graphViewport?.createEnsurer
    ? Shared.graphViewport.createEnsurer('box')
    : (svg, options = {}) => {
      const fn = Shared.ensureGraphViewport || Shared.autoResizeSvg || global.ensureGraphViewport || global.autoResizeSvg;
      if(typeof fn === 'function'){
        fn(svg, { component: 'box', debugLabel: 'box-viewport-fallback', ...options });
        return;
      }
      console.debug('Debug: box ensureGraphViewport helper missing', {
        hasShared: !!Shared,
        hasAutoResize: typeof Shared?.autoResizeSvg === 'function'
      });
    };
  console.debug('Debug: box component DOM helpers resolved', {
    hasSharedEditable: typeof Shared.makeEditable === 'function',
    hasSharedResize: typeof Shared.graphViewport?.ensure === 'function' || typeof Shared.autoResizeSvg === 'function',
    hasSharedSerialize: typeof Shared.serializeCleanSVG === 'function'
  }); // Debug: helper resolution summary
  const markFontEditable = (node, role, key) => {
    if (!node) { return; }
    const payload = { role: role || null, key: key || role || null, text: node?.textContent || null };
    if (fontControls && typeof fontControls.markText === 'function') {
      fontControls.markText(node, { scopeId: 'box', role, key });
    } else if (node.dataset) {
      node.dataset.fontEditable = '1';
      node.dataset.fontScope = 'box';
      if (role) node.dataset.fontRole = role;
      if (key || role) node.dataset.fontKey = key || role;
    }
    if (!role || role.indexOf('Tick') === -1) {
      console.debug('Debug: box markFontEditable', payload); // Debug: font target tagging summary
    }
  };
  const EFFECT_SIZE_PARAM_OPTIONS=[
    { value:'cohenD', label:"Cohen's d", shortLabel:"Cohen's d", tooltip:"Difference in means scaled by the pooled standard deviation.", format:'decimal' },
    { value:'hedgesG', label:"Hedges' g", shortLabel:"Hedges' g", tooltip:"Small-sample corrected Cohen's d using a bias adjustment.", format:'decimal' }
  ];
  const EFFECT_SIZE_NONPARAM_OPTIONS=[
    { value:'rankBiserial', label:'Rank-biserial r', shortLabel:'Rank-biserial r', tooltip:'Rank-biserial correlation (−1 to 1) comparing favorable vs. unfavorable pairings.', format:'decimal' },
    { value:'commonLanguage', label:'Common language (A)', shortLabel:'Common language A', tooltip:'Probability that a score from the first sample exceeds the second (expressed as a percentage).', format:'percent' }
  ];
  function listEffectOptions(type){
    return type==='parametric'?EFFECT_SIZE_PARAM_OPTIONS.slice():EFFECT_SIZE_NONPARAM_OPTIONS.slice();
  }

  const POST_HOC_META={
    standard:{
      value:'standard',
      label:'Pairwise + correction',
      shortLabel:'Standard',
      tooltip:'Run pairwise tests and adjust P values using the selected multiple-testing correction.',
      applies:context=>context?.mode!=='custom',
      summary:()=>'Pairwise tests with the chosen correction.'
    },
    tukey:{
      value:'tukey',
      label:'Tukey HSD',
      shortLabel:'Tukey',
      tooltip:'Parametric Tukey Honestly Significant Difference using the studentized range distribution (unpaired, ≥3 groups).',
      applies:context=>context && context.mode!=='custom' && context.test==='parametric' && context.variant!=='welch' && !context.paired && context.groupCount>=3,
      summary:context=>`Tukey HSD on ${context?.groupCount || 0} groups (family-wise adjusted).`
    },
    gamesHowell:{
      value:'gamesHowell',
      label:'Games–Howell',
      shortLabel:'Games–Howell',
      tooltip:'Games–Howell post-hoc test using Welch-standardized differences (unpaired, ≥3 groups, unequal variances).',
      applies:context=>context && context.mode!=='custom' && context.test==='parametric' && !context.paired && context.groupCount>=3 && (context.variant==='welch' || context.varianceConcern===true),
      summary:context=>`Games–Howell comparisons across ${context?.groupCount || 0} groups with Welch-standardized SE.`
    },
    dunn:{
      value:'dunn',
      label:"Dunn's test",
      shortLabel:'Dunn',
      tooltip:"Non-parametric Dunn's post-hoc test using rank sums (unpaired, ≥3 groups).",
      applies:context=>context && context.mode!=='custom' && context.test==='nonparametric' && !context.paired && context.groupCount>=3,
      summary:context=>`Dunn's rank-based post-hoc across ${context?.groupCount || 0} groups.`
    }
  };
  const POST_HOC_ORDER=['standard','tukey','gamesHowell','dunn'];
  function listPostHocOptions(){
    return POST_HOC_ORDER.map(key=>({
      value:key,
      label:POST_HOC_META[key]?.label || key,
      tooltip:POST_HOC_META[key]?.tooltip || ''
    }));
  }
  function isPostHocSupported(method,context){
    const meta=POST_HOC_META[method];
    if(!meta||typeof meta.applies!=='function'){ return false; }
    try{
      return !!meta.applies(context||{});
    }catch(err){
      console.debug('Debug: box isPostHocSupported error',{ method, message:err?.message });
      return false;
    }
  }
  function ensureValidPostHoc(method,context){
    const ctx=context||{};
    const requested=(typeof method==='string'?method:'').toLowerCase();
    if(requested && isPostHocSupported(requested,ctx)){
      return requested;
    }
    if(ctx.variant==='welch' && isPostHocSupported('gamesHowell',ctx)){
      if(requested && requested!=='gamesHowell'){
        console.debug('Debug: box postHoc welch fallback',{ requested, fallback:'gamesHowell', context:ctx });
      }
      return 'gamesHowell';
    }
    for(const key of POST_HOC_ORDER){
      if(isPostHocSupported(key,ctx)){
        if(requested && requested!==key){
          console.debug('Debug: box postHoc fallback',{ requested, fallback:key, context:ctx });
        }
        return key;
      }
    }
    console.debug('Debug: box postHoc default to standard',{ requested, context:ctx });
    return 'standard';
  }
  function getPostHocSummary(method,context){
    const meta=POST_HOC_META[method];
    if(meta){
      const summary=typeof meta.summary==='function'?meta.summary(context):meta.summary;
      return summary || meta.tooltip || meta.label || method;
    }
    return method || 'standard';
  }

  const ADVISOR_GROUP_OPTIONS=[
    { value:'two', label:'Two groups' },
    { value:'threePlus', label:'Three or more groups' }
  ];
  const ADVISOR_PAIRED_OPTIONS=[
    { value:'unpaired', label:'No, groups are independent' },
    { value:'paired', label:'Yes, measurements are paired/repeated' }
  ];
  const ADVISOR_DISTRIBUTION_OPTIONS=[
    { value:'normal', label:'Yes, roughly bell-shaped' },
    { value:'nonnormal', label:'No, noticeably non-normal' },
    { value:'unsure', label:"I am not sure yet" }
  ];
  const ADVISOR_VARIANCE_OPTIONS=[
    { value:'yes', label:'Yes, variances look similar' },
    { value:'no', label:'No, variances differ a lot' },
    { value:'unsure', label:"Not sure / haven’t checked" }
  ];
  const GROUPED_GOAL_OPTIONS=[
    { value:'interaction', label:'Study group × condition effects together' },
    { value:'perCondition', label:'Compare groups within each condition separately' }
  ];
  const GROUPED_REPEATED_OPTIONS=[
    { value:'yes', label:'Yes, rows are repeated measurements of the same subjects' },
    { value:'no', label:'No, rows are independent observations' }
  ];
  const GROUPED_ROW_FACTOR_OPTIONS=[
    { value:'yes', label:'Yes, include the row/subject dimension as a factor' },
    { value:'no', label:'No, focus on group and condition only' }
  ];

  function normalizeAdvisorGroupAnswer(answer,context){
    const fallback=(context?.groupCount||0)>=3?'threePlus':(context?.groupCount===2?'two':null);
    if(answer==='two'||answer==='threePlus'){ return answer; }
    return fallback;
  }

  function computeGroupedAdvisorRecommendation(rawAnswers,rawContext){
    const answers=rawAnswers || {};
    const context=rawContext || {};
    const groupCount=Number.isFinite(context.groupCount)?context.groupCount:0;
    const conditionCount=Number.isFinite(context.conditionCount)?context.conditionCount:0;
    const rowCount=Number.isFinite(context.rowCount)?context.rowCount:0;
    if(groupCount<2){
      return {
        format:'grouped',
        ready:false,
        message:'Add at least two groups before running the advisor for grouped analyses.',
        missing:['groupedGoal']
      };
    }
    if(conditionCount<1){
      return {
        format:'grouped',
        ready:false,
        message:'Increase the conditions per group to at least one before running grouped analyses.',
        missing:['groupedGoal']
      };
    }
    const goal=answers.groupedGoal;
    if(goal!=='interaction' && goal!=='perCondition'){
      return {
        format:'grouped',
        ready:false,
        message:'Tell the advisor whether you want interaction tests or per-condition comparisons.',
        missing:['groupedGoal']
      };
    }
    const rationale=[];
    const warnings=[];
    if(goal==='perCondition'){
      const summary=`Run row-wise t-tests to compare groups within each of the ${conditionCount} condition${conditionCount===1?'':'s'}.`;
      rationale.push('Row-wise t-tests provide simple group comparisons within each condition.');
      if(!context.ok && context.message){
        warnings.push(context.message);
      }
      if((context.partialRowsSkipped||0)>0){
        warnings.push(`${context.partialRowsSkipped} incomplete row${context.partialRowsSkipped===1?' was':'s were'} skipped; ensure rows are fully populated.`);
      }
      return {
        format:'grouped',
        ready:true,
        analysis:'rowTTests',
        summary,
        rationale,
        warnings,
        detail:{ goal }
      };
    }
    const repeated=answers.groupedRepeated;
    if(repeated!=='yes' && repeated!=='no'){
      return {
        format:'grouped',
        ready:false,
        message:'Specify whether rows represent repeated measurements of the same subjects across conditions.',
        missing:['groupedRepeated'],
        goal
      };
    }
    let includeRowFactor=false;
    if(rowCount>=2){
      const rowAnswer=answers.groupedRowFactor;
      if(rowAnswer!=='yes' && rowAnswer!=='no'){
        return {
          format:'grouped',
          ready:false,
          message:'Tell the advisor whether the row/subject dimension should be included as a factor.',
          missing:['groupedRowFactor'],
          goal,
          repeated:repeated==='yes'
        };
      }
      includeRowFactor=rowAnswer==='yes';
    }else if(answers.groupedRowFactor==='yes'){
      warnings.push('At least two complete rows are required to include the row/subject dimension; defaulting to a two-way model.');
    }
    let analysis='twoWayAnova';
    let summary='Use a two-way ANOVA to assess group and condition main effects plus their interaction.';
    if(includeRowFactor){
      if(repeated==='yes'){
        analysis='threeWayMixed';
        summary='Use a three-way mixed model to evaluate group, condition, and row effects with repeated measurements.';
      }else{
        analysis='threeWayAnova';
        summary='Use a three-way ANOVA to evaluate group, condition, and row factors together.';
      }
    }else if(repeated==='yes'){
      analysis='twoWayMixed';
      summary='Use a two-way mixed model to assess group and condition effects with repeated measurements across conditions.';
    }
    if(repeated==='yes'){
      rationale.push('Rows track repeated observations for each subject, so a mixed-model approach accounts for within-subject correlation.');
    }else{
      rationale.push('Groups and conditions are independent, so a standard ANOVA is appropriate.');
    }
    if(includeRowFactor){
      rationale.push('Including the row/subject factor lets you test for row-level trends and higher-order interactions.');
    }
    if(!context.ok && context.message){
      warnings.push(context.message);
    }
    if((context.partialRowsSkipped||0)>0){
      warnings.push(`${context.partialRowsSkipped} incomplete row${context.partialRowsSkipped===1?' was':'s were'} skipped; fill missing values to retain balance.`);
    }
    return {
      format:'grouped',
      ready:true,
      analysis,
      summary,
      rationale,
      warnings,
      detail:{ goal, repeated, includeRowFactor, rowCount }
    };
  }

  function computeAdvisorRecommendation(rawAnswers,rawContext){
    const answers=rawAnswers||{};
    const context=rawContext||{};
    if(context?.format==='grouped'){
      return computeGroupedAdvisorRecommendation(answers,context);
    }
    const groupCount=Number.isFinite(context.groupCount)?context.groupCount:0;
    if(groupCount<2){
      return {
        ready:false,
        message:'Select at least two groups before running the advisor.',
        missing:['groups']
      };
    }
    const groupsAnswer=normalizeAdvisorGroupAnswer(answers.groups,context);
    if(!groupsAnswer){
      return {
        ready:false,
        message:'Tell the advisor how many groups you are comparing.',
        missing:['groups']
      };
    }
    const pairedAnswer=answers.paired;
    if(pairedAnswer!=='paired' && pairedAnswer!=='unpaired'){
      return {
        ready:false,
        message:'Specify whether the measurements are paired/repeated.',
        missing:['paired'],
        groups:groupsAnswer
      };
    }
    const distributionAnswer=answers.distribution;
    if(!distributionAnswer){
      return {
        ready:false,
        message:'Let the advisor know whether the data look approximately normal.',
        missing:['distribution'],
        groups:groupsAnswer,
        paired:pairedAnswer==='paired'
      };
    }
    const equalVarianceAnswer=answers.equalVariance;
    const paired=pairedAnswer==='paired';
    const sampleSizes=Array.isArray(context.sampleSizes)
      ? context.sampleSizes.map(n=>Number.isFinite(n)?n:0)
      : [];
    const assumptionDiagnostics=context.assumptions||null;

    let statsTest='parametric';
    let postHoc='standard';
    let primaryLabel='';
    let postHocLabel='';
    const rationale=[];
    const warnings=[];
    let recommendationVariant='classic';

    if(groupsAnswer==='two'){
      if(paired){
        if(distributionAnswer==='normal'){
          statsTest='parametric';
          primaryLabel='Paired t-test';
          rationale.push('Paired measurements with approximately normal differences favour parametric tests.');
        }else if(distributionAnswer==='nonnormal'){
          statsTest='nonparametric';
          primaryLabel='Wilcoxon signed-rank test';
          rationale.push('Non-normal paired differences are handled best with rank-based Wilcoxon tests.');
        }else{
          statsTest='nonparametric';
          primaryLabel='Wilcoxon signed-rank test';
          rationale.push('When normality is uncertain, rank-based paired tests offer robustness.');
        }
      }else{
        if(distributionAnswer==='normal'){
          statsTest='parametric';
          primaryLabel='Welch t-test';
          rationale.push('Independent groups with roughly normal distributions support the Welch t-test.');
        }else if(distributionAnswer==='nonnormal'){
          statsTest='nonparametric';
          primaryLabel='Mann–Whitney U test';
          rationale.push('Rank-based Mann–Whitney tests are robust for non-normal independent groups.');
        }else{
          statsTest='nonparametric';
          primaryLabel='Mann–Whitney U test';
          rationale.push('When unsure about normality, Mann–Whitney offers a safer default for independent groups.');
        }
      }
    }else{
      if(paired){
        if(distributionAnswer==='normal'){
          statsTest='parametric';
          primaryLabel='Paired contrasts with Holm correction';
          rationale.push('Repeated measures with normal-ish differences can use paired t-tests plus Holm correction.');
        }else if(distributionAnswer==='nonnormal'){
          statsTest='nonparametric';
          primaryLabel='Wilcoxon signed-rank contrasts with Holm correction';
          rationale.push('Rank-based paired contrasts protect against non-normal repeated measures.');
        }else{
          statsTest='nonparametric';
          primaryLabel='Wilcoxon signed-rank contrasts with Holm correction';
          rationale.push('When normality is uncertain for repeated measures, start with rank-based paired contrasts.');
        }
        postHoc='standard';
        postHocLabel='Apply the selected multiple-testing correction across paired contrasts.';
      }else{
        if(distributionAnswer==='normal'){
          if(equalVarianceAnswer==='no'){
            statsTest='parametric';
            primaryLabel='Welch ANOVA';
            postHoc='gamesHowell';
            postHocLabel='Use Games–Howell for unequal-variance pairwise comparisons.';
            recommendationVariant='welch';
            rationale.push('Welch ANOVA tolerates unequal variances while retaining parametric power.');
            rationale.push('Games–Howell post-hoc controls family-wise error without assuming equal variances.');
          }else{
            statsTest='parametric';
            primaryLabel='ANOVA';
            postHoc='tukey';
            postHocLabel='Use Tukey HSD for adjusted pairwise comparisons.';
            rationale.push('Normal, independent groups support ANOVA with Tukey-controlled post-hoc tests.');
            if(equalVarianceAnswer==='unsure' || !equalVarianceAnswer){
              warnings.push('Check variance homogeneity (e.g., Levene/Bartlett). If variances differ, prefer Welch ANOVA or non-parametric tests.');
            }
          }
        }else if(distributionAnswer==='nonnormal'){
          statsTest='nonparametric';
          primaryLabel='Kruskal–Wallis test';
          postHoc='dunn';
          postHocLabel='Follow up with Dunn post-hoc comparisons (rank-based).';
          rationale.push('Rank-based Kruskal–Wallis handles non-normal independent groups.');
        }else{
          statsTest='nonparametric';
          primaryLabel='Kruskal–Wallis test';
          postHoc='dunn';
          postHocLabel='Follow up with Dunn post-hoc comparisons (rank-based).';
          rationale.push('When normality is uncertain, Kruskal–Wallis offers a robust default for multiple groups.');
        }
      }
    }

    if(Array.isArray(sampleSizes) && sampleSizes.some(n=>n>0 && n<3) && groupsAnswer!=='two'){
      warnings.push('Some groups have fewer than 3 observations; post-hoc comparisons may have limited power.');
    }
    if(assumptionDiagnostics?.recommendNonParametric && statsTest==='parametric' && recommendationVariant!=='welch'){
      warnings.push('Recent assumption diagnostics flagged issues with parametric assumptions.');
    }

    const groupPhrase=groupsAnswer==='two'
      ? 'the two selected groups'
      : `${groupCount} selected groups`;
    const methodLabel=statsTest==='parametric'?'parametric':'non-parametric';
    const summaryParts=[`Use ${methodLabel} ${primaryLabel} on ${groupPhrase}.`];
    if(postHocLabel){
      summaryParts.push(postHocLabel);
    }else if(groupsAnswer!=='two'){
      summaryParts.push('Keep the current multiple-testing correction for pairwise follow-ups.');
    }

    return {
      ready:true,
      statsTest,
      paired,
      postHoc,
      summary:summaryParts.join(' '),
      rationale,
      warnings,
      groups:groupsAnswer,
      distribution:distributionAnswer,
      detail:{
        primaryLabel,
        postHocLabel
      },
      parametricVariant:recommendationVariant
    };
  }

  const GAUSS_HERMITE_NODES=[
    -3.889724897869781,
    -3.020637025120889,
    -2.2795070805010594,
    -1.5976826351526044,
    -0.9477883912401637,
    -0.3142403762543591,
    0.3142403762543591,
    0.9477883912401637,
    1.5976826351526044,
    2.2795070805010594,
    3.020637025120889,
    3.889724897869781
  ];
  const GAUSS_HERMITE_WEIGHTS=[
    2.6585516843563013e-07,
    0.00001761400713915212,
    0.0009322840086241802,
    0.02697315497843491,
    0.3982821276709972,
    1.830103131080486,
    1.830103131080486,
    0.3982821276709972,
    0.02697315497843491,
    0.0009322840086241802,
    0.00001761400713915212,
    2.6585516843563013e-07
  ];
  function studentizedRangeCDFInfinite(q,r){
    if(!Number.isFinite(q) || q<=0){
      return 0;
    }
    if(!Number.isFinite(r) || r<2){
      return 1;
    }
    const jStatLib=global.jStat;
    const normalCdf=(value)=>{
      if(jStatLib && jStatLib.normal && typeof jStatLib.normal.cdf==='function'){
        return jStatLib.normal.cdf(value,0,1);
      }
      return 0.5*(1+Math.erf(value/Math.SQRT2));
    };
    let acc=0;
    for(let i=0;i<GAUSS_HERMITE_NODES.length;i++){
      const node=GAUSS_HERMITE_NODES[i];
      const weight=GAUSS_HERMITE_WEIGHTS[i];
      const t=node*Math.SQRT2;
      const upper=normalCdf(t+q);
      const lower=normalCdf(t);
      const span=Math.max(0,Math.min(1,upper-lower));
      acc+=weight*Math.pow(span,r-1);
    }
    const result=acc/Math.sqrt(Math.PI);
    const clamped=Math.max(0,Math.min(1,result));
    console.debug('Debug: box studentizedRangeCDFInfinite',{ q, r, result:clamped });
    return clamped;
  }
  function studentizedRangeCDF(q,r,df){
    if(!Number.isFinite(q) || q<=0){
      return 0;
    }
    if(!Number.isFinite(df) || df<=2){
      const fallback=studentizedRangeCDFInfinite(q*Math.SQRT1_2,r);
      console.debug('Debug: box studentizedRangeCDF df<=2 fallback',{ q, r, df, fallback });
      return fallback;
    }
    const scale=Math.sqrt(df/(df-2));
    const adjusted=q*scale;
    const result=studentizedRangeCDFInfinite(adjusted,r);
    console.debug('Debug: box studentizedRangeCDF',{ q, r, df, scale, adjusted, result });
    return result;
  }
  function computeAnovaComponents(groups){
    const cleaned=(Array.isArray(groups)?groups:[]).map(group=>group.filter(Number.isFinite));
    const counts=cleaned.map(group=>group.length);
    const validCounts=counts.every(n=>n>0);
    if(!validCounts){
      return { ok:false, reason:'Each group needs at least one observation for Tukey HSD.' };
    }
    const k=cleaned.length;
    const totals=cleaned.map(group=>group.reduce((sum,val)=>sum+val,0));
    const totalN=counts.reduce((sum,val)=>sum+val,0);
    if(totalN<=k){
      return { ok:false, reason:'Tukey HSD requires more observations than groups.' };
    }
    const means=totals.map((sum,idx)=>sum/(counts[idx]||1));
    const grandMean=totals.reduce((sum,val)=>sum+val,0)/totalN;
    let sse=0;
    cleaned.forEach((group,idx)=>{
      const meanVal=means[idx];
      group.forEach(value=>{ sse+=Math.pow(value-meanVal,2); });
    });
    const dfWithin=totalN-k;
    const mse=dfWithin>0?sse/dfWithin:NaN;
    return {
      ok:Number.isFinite(mse) && mse>0 && dfWithin>0,
      mse,
      dfWithin,
      means,
      counts,
      grandMean,
      totalN,
      groupCount:k,
      sse
    };
  }
  function computeTukeyComparisons(groups,labels){
    const base=computeAnovaComponents(groups);
    if(!base.ok){
      console.debug('Debug: box computeTukeyComparisons unavailable',base);
      return { ok:false, message:base.reason || 'Unable to compute Tukey HSD.' };
    }
    const pairs=[];
    for(let i=0;i<base.groupCount;i++){
      for(let j=i+1;j<base.groupCount;j++){
        const ni=base.counts[i];
        const nj=base.counts[j];
        const se=Math.sqrt(base.mse*0.5*(1/ni+1/nj));
        if(!Number.isFinite(se) || se<=0){
          console.debug('Debug: box computeTukeyComparisons skip pair',{ i,j,se });
          continue;
        }
        const diff=base.means[i]-base.means[j];
        const q=Math.abs(diff)/se;
        const cdf=studentizedRangeCDF(q,base.groupCount,base.dfWithin);
        const pAdj=Math.max(0,Math.min(1,1-cdf));
        pairs.push({
          i,
          j,
          diff,
          se,
          q,
          pAdj,
          df:base.dfWithin,
          mse:base.mse,
          ni,
          nj,
          labelA:labels?.[i],
          labelB:labels?.[j]
        });
      }
    }
    console.debug('Debug: box computeTukeyComparisons summary',{ pairCount:pairs.length, df:base.dfWithin, mse:base.mse });
    return {
      ok:pairs.length>0,
      pairs,
      df:base.dfWithin,
      mse:base.mse,
      footnote:`Tukey HSD adjusted via studentized range (df = ${base.dfWithin})`,
      counts:base.counts,
      means:base.means
    };
  }
  function computeGamesHowellComparisons(groups,labels){
    const cleaned=(Array.isArray(groups)?groups:[]).map(group=>group.filter(Number.isFinite));
    const counts=cleaned.map(group=>group.length);
    const k=cleaned.length;
    if(k<2){
      return { ok:false, message:'Games–Howell requires at least two groups.' };
    }
    if(counts.some(n=>n<2)){
      return { ok:false, message:'Games–Howell needs ≥2 observations per group.' };
    }
    const means=cleaned.map(group=>group.reduce((sum,val)=>sum+val,0)/group.length);
    const variances=cleaned.map((group,idx)=>{
      const m=means[idx];
      const sumSq=group.reduce((sum,val)=>sum+Math.pow(val-m,2),0);
      const denom=Math.max(group.length-1,1);
      const variance=sumSq/denom;
      return variance>0?variance:Number.EPSILON;
    });
    const pairs=[];
    for(let i=0;i<k;i++){
      for(let j=i+1;j<k;j++){
        const ni=counts[i];
        const nj=counts[j];
        const varI=variances[i];
        const varJ=variances[j];
        const se2=varI/ni+varJ/nj;
        const se=Math.sqrt(se2>0?se2:Number.EPSILON);
        const diff=means[i]-means[j];
        const q=Math.abs(diff)/se;
        const denom=(Math.pow(varI/ni,2)/(ni-1))+(Math.pow(varJ/nj,2)/(nj-1));
        const df=denom>0?Math.pow(se2,2)/denom:Number.POSITIVE_INFINITY;
        const cdf=studentizedRangeCDF(q,k,df);
        const p=Math.max(0,Math.min(1,1-cdf));
        pairs.push({
          i,
          j,
          diff,
          se,
          q,
          p,
          pAdj:p,
          df,
          ni,
          nj,
          varI,
          varJ,
          labelA:labels?.[i],
          labelB:labels?.[j]
        });
      }
    }
    console.debug('Debug: box computeGamesHowell summary',{ pairCount:pairs.length, k, variances:variances.map(v=>Number.isFinite(v)?Number(v.toFixed(4)):v) });
    return {
      ok:pairs.length>0,
      pairs,
      means,
      counts,
      variances,
      footnote:'Games–Howell adjusted via studentized range (Welch df per pair)'
    };
  }
  function computeDunnComparisons(groups,labels){
    const cleaned=(Array.isArray(groups)?groups:[]).map(group=>group.filter(Number.isFinite));
    const counts=cleaned.map(group=>group.length);
    if(counts.some(n=>n===0)){
      return { ok:false, message:"Dunn's test requires at least one value per group." };
    }
    const k=cleaned.length;
    if(k<2){
      return { ok:false, message:"Dunn's test needs at least two groups." };
    }
    const flat=[];
    cleaned.forEach((group,gi)=>{
      group.forEach(value=>flat.push({ value, group:gi }));
    });
    flat.sort((a,b)=>a.value-b.value);
    let idx=0;
    let tieSum=0;
    while(idx<flat.length){
      let j=idx+1;
      while(j<flat.length && flat[j].value===flat[idx].value){ j++; }
      const t=j-idx;
      const avg=(idx+j-1)/2+1;
      for(let m=idx;m<j;m++){ flat[m].rank=avg; }
      if(t>1){ tieSum+=t*t*t-t; }
      idx=j;
    }
    const rankSums=new Array(k).fill(0);
    flat.forEach(item=>{ rankSums[item.group]+=item.rank; });
    const totalN=flat.length;
    if(totalN<=1){
      return { ok:false, message:"Dunn's test requires more than one observation." };
    }
    const varianceBase=totalN*(totalN+1)/12;
    const tieCorrectionDenom=Math.pow(totalN,3)-totalN;
    const tieCorrection=tieCorrectionDenom!==0?1-tieSum/tieCorrectionDenom:1;
    const corrected=Math.max(tieCorrection,1e-6);
    const pairs=[];
    for(let i=0;i<k;i++){
      for(let j=i+1;j<k;j++){
        const meanRankI=rankSums[i]/counts[i];
        const meanRankJ=rankSums[j]/counts[j];
        const diff=meanRankI-meanRankJ;
        const se=Math.sqrt(varianceBase*corrected*((1/counts[i])+(1/counts[j])));
        if(!Number.isFinite(se) || se<=0){
          console.debug('Debug: box computeDunnComparisons skip pair',{ i,j,se });
          continue;
        }
        const z=diff/se;
        const absZ=Math.abs(z);
        const jStatLib=global.jStat;
        const cdf=jStatLib && jStatLib.normal && typeof jStatLib.normal.cdf==='function'
          ? jStatLib.normal.cdf(absZ,0,1)
          : 0.5*(1+Math.erf(absZ/Math.SQRT2));
        const p=Math.max(0,Math.min(1,2*(1-cdf)));
        pairs.push({
          i,
          j,
          diff,
          z,
          se,
          p,
          labelA:labels?.[i],
          labelB:labels?.[j],
          counts:{ a:counts[i], b:counts[j] },
          rankMeans:{ a:meanRankI, b:meanRankJ }
        });
      }
    }
    console.debug('Debug: box computeDunnComparisons summary',{ pairCount:pairs.length, totalN, tieCorrection:corrected });
    return {
      ok:pairs.length>0,
      pairs,
      footnote:"Dunn's test uses rank sums with tie correction.",
      totalN,
      counts
    };
  }

  function resolveEffectOptionMeta(type,value){
    const list=listEffectOptions(type);
    const found=list.find(opt=>opt.value===value);
    if(found){
      return found;
    }
    const fallback=list[0];
    console.debug('Debug: box resolveEffectOptionMeta fallback',{ type, requested:value, fallback:fallback?.value });
    return fallback;
  }
  function ensureValidEffectOption(type,value){
    const meta=resolveEffectOptionMeta(type,value);
    return meta?.value;
  }
  function safeRound(value,digits){
    if(!Number.isFinite(value)) return null;
    const factor=Math.pow(10,digits||0);
    return Math.round(value*factor)/factor;
  }
  function clamp(value,min,max){
    if(!Number.isFinite(value)) return value;
    if(value<min) return min;
    if(value>max) return max;
    return value;
  }
  function formatEffectValue(value,meta){
    if(value==null||!Number.isFinite(value)){
      return '—';
    }
    if(meta?.format==='percent'){
      const percent=clamp(value,0,1)*100;
      return `${percent.toFixed(1)}%`;
    }
    return value.toFixed(3);
  }
  function buildEffectFootnotes(paramMeta,nonParamMeta){
    const notes=[];
    if(paramMeta?.tooltip){
      notes.push(`Parametric effect (${paramMeta.shortLabel || paramMeta.label}): ${paramMeta.tooltip}`);
    }
    if(nonParamMeta?.tooltip){
      notes.push(`Non-parametric effect (${nonParamMeta.shortLabel || nonParamMeta.label}): ${nonParamMeta.tooltip}`);
    }
    return notes;
  }
  function computeVectorStats(values){
    const arr=(Array.isArray(values)?values:[]).map(Number).filter(v=>Number.isFinite(v));
    const n=arr.length;
    if(!n){
      return { n:0, mean:NaN, variance:NaN, sd:NaN };
    }
    const meanVal=arr.reduce((sum,v)=>sum+v,0)/n;
    let variance=0;
    if(n>1){
      const sumSq=arr.reduce((sum,v)=>sum+Math.pow(v-meanVal,2),0);
      variance=sumSq/(n-1);
    }
    const sd=Math.sqrt(Math.max(variance,0));
    return { n, mean:meanVal, variance, sd };
  }
  function computePairedSamples(a,b){
    const len=Math.min(Array.isArray(a)?a.length:0,Array.isArray(b)?b.length:0);
    const samples=[];
    for(let i=0;i<len;i++){
      const av=Number(a[i]);
      const bv=Number(b[i]);
      if(Number.isFinite(av)&&Number.isFinite(bv)){
        samples.push({ a:av, b:bv });
      }
    }
    return samples;
  }
  function computeDiffStats(pairedSamples){
    const diffs=[];
    let positive=0,negative=0,ties=0;
    pairedSamples.forEach(pair=>{
      const diff=pair.a-pair.b;
      diffs.push(diff);
      if(diff>0) positive++;
      else if(diff<0) negative++;
      else ties++;
    });
    const stats=computeVectorStats(diffs);
    return { ...stats, positive, negative, ties, total:stats.n };
  }
  function computePairwiseCounts(a,b){
    // Optimized pairwise counts: avoid O(nA * nB) loops by sorting and using binary searches.
    const arrA=(Array.isArray(a)?a:[]).map(Number).filter(v=>Number.isFinite(v));
    const arrB=(Array.isArray(b)?b:[]).map(Number).filter(v=>Number.isFinite(v));
    const nA=arrA.length; const nB=arrB.length;
    if(nA===0 || nB===0){
      return { greater:0, less:0, equal:0, totalPairs:0, nA, nB };
    }
    arrB.sort((x,y)=>x-y);
    // binary search helpers
    function lowerBound(arr, value){
      let lo=0, hi=arr.length;
      while(lo<hi){
        const mid=(lo+hi)>>1;
        if(arr[mid]<value) lo=mid+1; else hi=mid;
      }
      return lo;
    }
    function upperBound(arr, value){
      let lo=0, hi=arr.length;
      while(lo<hi){
        const mid=(lo+hi)>>1;
        if(arr[mid]<=value) lo=mid+1; else hi=mid;
      }
      return lo;
    }
    let greater=0, less=0, equal=0;
    for(let i=0;i<nA;i++){
      const av=arrA[i];
      const lessCount = lowerBound(arrB, av); // number of b < av
      const leCount = upperBound(arrB, av); // number of b <= av
      const eq = leCount - lessCount;
      greater += lessCount;
      equal += eq;
      less += (nB - leCount);
    }
    const totalPairs = greater + less + equal;
    return { greater, less, equal, totalPairs, nA, nB };
  }
  function computeEffectSizeMetrics(a,b,options){
    const paired=!!options?.paired;
    const statsA=computeVectorStats(a);
    const statsB=computeVectorStats(b);
    const pairedSamples=paired?computePairedSamples(a,b):[];
    const diffStats=paired?computeDiffStats(pairedSamples):null;
    const counts=!paired?computePairwiseCounts(a,b):null;
    const metrics={ parametric:{}, nonParametric:{}, context:{ nA:statsA.n, nB:statsB.n, paired } };
    if(paired){
      metrics.context.nPairs=diffStats?.total || 0;
    }
    if(statsA.n>0 && statsB.n>0){
      if(paired){
        if(diffStats && diffStats.total>1 && Number.isFinite(diffStats.sd) && diffStats.sd>0){
          const d=diffStats.mean/(diffStats.sd||1);
          metrics.parametric.cohenD=d;
          const correctionDenom=4*diffStats.total-9;
          const correction=correctionDenom!==0?1-3/correctionDenom:1;
          if(Number.isFinite(correction)){
            metrics.parametric.hedgesG=d*correction;
          }
        }
      }else{
        const pooledDenom=(statsA.n-1)+(statsB.n-1);
        if(pooledDenom>0){
          const pooledVar=((statsA.variance*(statsA.n-1))+(statsB.variance*(statsB.n-1)))/pooledDenom;
          const pooledSd=Math.sqrt(Math.max(pooledVar,0));
          if(pooledSd>0){
            const d=(statsA.mean-statsB.mean)/pooledSd;
            metrics.parametric.cohenD=d;
            const correctionDenom=4*(statsA.n+statsB.n)-9;
            const correction=correctionDenom!==0?1-3/correctionDenom:1;
            if(Number.isFinite(correction)){
              metrics.parametric.hedgesG=d*correction;
            }
          }
        }
      }
    }
    if(!paired && counts && counts.totalPairs>0){
      const delta=(counts.greater-counts.less)/counts.totalPairs;
      metrics.nonParametric.rankBiserial=clamp(delta,-1,1);
      const commonLanguage=(counts.greater+0.5*counts.equal)/counts.totalPairs;
      metrics.nonParametric.commonLanguage=clamp(commonLanguage,0,1);
    }
    if(paired && diffStats && diffStats.total>0){
      const rb=(diffStats.positive-diffStats.negative)/diffStats.total;
      metrics.nonParametric.rankBiserial=clamp(rb,-1,1);
      const cl=(diffStats.positive+0.5*diffStats.ties)/diffStats.total;
      metrics.nonParametric.commonLanguage=clamp(cl,0,1);
    }
    const debugPayload={
      paired,
      nA:statsA.n,
      nB:statsB.n,
      nPairs:diffStats?.total || 0,
      parametric:Object.fromEntries(Object.entries(metrics.parametric).map(([key,val])=>[key,safeRound(val,4)])),
      nonParametric:Object.fromEntries(Object.entries(metrics.nonParametric).map(([key,val])=>[key,safeRound(val,4)])),
      counts:counts?{ ...counts, totalPairs:counts.totalPairs }:null,
      diffCounts:diffStats?{ positive:diffStats.positive, negative:diffStats.negative, ties:diffStats.ties }:null
    };
    console.debug('Debug: box computeEffectSizeMetrics',debugPayload);
    return { ...metrics, statsA, statsB, diffStats, counts };
  }
  // Local state and element cache
	  const state = { hot: null, scheduleDraw: function(){}, fileHandle: null, fileName: 'box.graph', titleText: 'Boxplot', yLabelText: 'Value', lastDefaultFill: '#4472c4', selectedCols: new Set(), statsTest: 'parametric', statsMode: 'all', statsRef: 0, statsPaired: false, statsPairsText: '', statsCustomPairs: [], statsCorrection: DEFAULT_CORRECTION, statsEffectParametric: EFFECT_SIZE_PARAM_OPTIONS[0].value, statsEffectNonParametric: EFFECT_SIZE_NONPARAM_OPTIONS[0].value, statsPostHoc: POST_HOC_ORDER[0], statsParametricVariant: 'classic', colOrder: [], fillColors: [], borderColors: [], drawToken: 0, flipAxes: false, tableFormat: 'single', grouped: { replicatesPerGroup: 3, groups: ['Control', 'Treated'] }, groupedStats: { analysis: 'twoWayAnova' }, layout: null, minSvgWidth: 0, individualSummary: INDIVIDUAL_SUMMARY_DEFAULT, lastAxisLabels: [], showSignificanceBars: false, significanceLabelMode: 'stars', significanceStyle: { thickness: DEFAULT_SIGNIFICANCE_THICKNESS, color: DEFAULT_SIGNIFICANCE_COLOR, showWhiskers: DEFAULT_SIGNIFICANCE_WHISKERS, whiskerMode: DEFAULT_SIGNIFICANCE_WHISKER_MODE }, statsAdvisor: { open: false, answers: {} }, axisSettings: createDefaultAxisSettings(), groupLayout: 'interleaved', violin: { autoBandwidth: true, bandwidth: null, sampleCount: DEFAULT_VIOLIN_SAMPLE_COUNT, lastUsedBandwidth: null, lastSampleCount: DEFAULT_VIOLIN_SAMPLE_COUNT }, whiskerRule: DEFAULT_WHISKER_RULE, whiskerCustomMultiplier: DEFAULT_WHISKER_MULTIPLIER, drawPending: false, autoDrawEnabled: true, autoDrawReason: null, autoDrawLockedByThreshold: false, lastDataShape: { rows: 0, cols: 0 }, lastAutoDrawEvaluation: null, logPlusOne: false, labelPositions: { title: null, xLabel: null, yLabel: null, legend: null }, statsContext: null, statsContextVersion: 0, statsComputationPending: false, statsLastRunVersion: 0, statsContextSignature: null, statsLastSignificanceEnabled: false, significanceMaxLevel: null, traceShapeStyles: {}, traceShapeGlobalStyle: null, pointGlobalStyle: { fill: '#000000', size: 5 }, summaryStyles: {}, summaryGlobalStyle: null };
  let emptyPayloadTemplate = null;

  function cloneSimple(value){
    if(!value) return null;
    try{
      return JSON.parse(JSON.stringify(value));
    }catch(err){
      console.error('box cloneSimple error', err);
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
  const boxUndoManager = Shared.undoManager || null;
  function recordBoxChange(label, previous, next, apply){
    if(!boxUndoManager || typeof boxUndoManager.recordStateChange !== 'function'){
      return;
    }
    if(typeof apply !== 'function'){
      return;
    }
    boxUndoManager.recordStateChange({
      label,
      scope: 'boxGraphPanel',
      from: previous,
      to: next,
      apply(value){
        apply(value);
        return true;
      }
    });
  }

  function ensureAxisSettings(){
    const settings = state.axisSettings && typeof state.axisSettings === 'object' ? state.axisSettings : createDefaultAxisSettings();
    if(!settings.x || typeof settings.x !== 'object'){ settings.x = { tickInterval: null, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS, notation: 'auto' }; }
    if(!settings.y || typeof settings.y !== 'object'){ settings.y = { tickInterval: null, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS, notation: 'auto', brokenAxis: { enabled: false, segments: [] } }; }
    if(settings.x.tickInterval === undefined){ settings.x.tickInterval = null; }
    if(settings.y.tickInterval === undefined){ settings.y.tickInterval = null; }
    if(typeof settings.x.minorTicks !== 'boolean'){ settings.x.minorTicks = false; }
    if(typeof settings.y.minorTicks !== 'boolean'){ settings.y.minorTicks = false; }
    settings.x.minorTickSubdivisions = clampMinorTickSubdivisions(settings.x.minorTickSubdivisions);
    settings.y.minorTickSubdivisions = clampMinorTickSubdivisions(settings.y.minorTickSubdivisions);
    settings.x.notation = sanitizeBoxAxisNotation(settings.x.notation);
    settings.y.notation = sanitizeBoxAxisNotation(settings.y.notation);
    // Ensure broken axis settings for y-axis
    if(!settings.y.brokenAxis || typeof settings.y.brokenAxis !== 'object'){
      settings.y.brokenAxis = { enabled: false, segments: [] };
    }
    if(typeof settings.y.brokenAxis.enabled !== 'boolean'){
      settings.y.brokenAxis.enabled = false;
    }
    if(!Array.isArray(settings.y.brokenAxis.segments)){
      settings.y.brokenAxis.segments = [];
    }
    const strokeNumeric = Number(settings.strokeWidth);
    if(!Number.isFinite(strokeNumeric) || strokeNumeric <= 0){
      settings.strokeWidth = 1;
    }
    if(typeof settings.color !== 'string' || !settings.color.trim()){
      settings.color = DEFAULT_AXIS_COLOR;
    }
    state.axisSettings = settings;
    return settings;
  }

  function getAxisNotation(axis){
    if(axis !== 'x' && axis !== 'y'){ return 'auto'; }
    const settings = ensureAxisSettings();
    return sanitizeBoxAxisNotation(settings[axis]?.notation);
  }

  function updateAxisNotation(axis, value){
    if(axis !== 'x' && axis !== 'y'){ return; }
    const settings = ensureAxisSettings();
    const normalized = sanitizeBoxAxisNotation(value);
    if(settings[axis].notation === normalized){ return; }
    settings[axis].notation = normalized;
    console.debug('Debug: box axis notation updated',{ axis, notation: normalized });
    if(typeof state.scheduleDraw === 'function'){
      state.scheduleDraw();
    }
  }

  function isAxisNumeric(axis){
    if(axis === 'x'){ return !!state.flipAxes; }
    if(axis === 'y'){ return !state.flipAxes; }
    return false;
  }

  function getAxisMinorTicksEnabled(axis){
    if(axis !== 'x' && axis !== 'y'){ return false; }
    const settings = ensureAxisSettings();
    if(!isAxisNumeric(axis)){
      return false;
    }
    return !!settings[axis]?.minorTicks;
  }

  function updateAxisMinorTicks(axis, enabled){
    if(axis !== 'x' && axis !== 'y'){ return; }
    const settings = ensureAxisSettings();
    const nextValue = !!enabled && isAxisNumeric(axis);
    if(settings[axis].minorTicks === nextValue){
      return;
    }
    settings[axis].minorTicks = nextValue;
    console.debug('Debug: box minor ticks updated',{ axis, enabled: nextValue, flipAxes: state.flipAxes });
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
    console.debug('Debug: box minor tick subdivisions updated',{ axis, subdivisions: nextValue });
    if(typeof state.scheduleDraw === 'function'){
      state.scheduleDraw();
    }
  }

  function getAxisTickInterval(axis){
    if(axis !== 'x' && axis !== 'y'){ return null; }
    const settings = ensureAxisSettings();
    if(!isAxisNumeric(axis)){
      const stored = settings[axis]?.tickInterval;
      if(stored){
        console.debug('Debug: box axis tick interval ignored for categorical axis',{ axis, stored, flipAxes: state.flipAxes });
      }
      return null;
    }
    const raw = settings[axis]?.tickInterval;
    const numeric = typeof raw === 'string' ? Number(raw) : raw;
    if(Number.isFinite(numeric) && numeric > 0){
      const resolved = axis === 'x' ? Math.max(1, Math.round(numeric)) : numeric;
      return resolved;
    }
    return null;
  }

  function updateAxisTickInterval(axis, value){
    if(axis !== 'x' && axis !== 'y'){ return; }
    const settings = ensureAxisSettings();
    if(!isAxisNumeric(axis)){
      settings[axis].tickInterval = null;
      console.debug('Debug: box axis tick interval blocked for categorical axis',{ axis, flipAxes: state.flipAxes, attempted: value });
      if(typeof state.scheduleDraw === 'function'){
        state.scheduleDraw();
      }
      return;
    }
    if(value === null || value === undefined || value === ''){
      settings[axis].tickInterval = null;
    } else {
      const numeric = Number(value);
      if(Number.isFinite(numeric) && numeric > 0){
        settings[axis].tickInterval = axis === 'x' ? Math.max(1, Math.round(numeric)) : numeric;
      } else {
        settings[axis].tickInterval = null;
      }
    }
    console.debug('Debug: box axis tick interval updated',{ axis, tickInterval: settings[axis].tickInterval });
    if(typeof state.scheduleDraw === 'function'){
      state.scheduleDraw();
    }
  }

  function getAxisStrokeWidthBase(){
    const settings = ensureAxisSettings();
    const numeric = Number(settings.strokeWidth);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
  }

  function updateAxisStrokeWidth(value){
    const settings = ensureAxisSettings();
    if(value === null || value === undefined || value === ''){
      settings.strokeWidth = 1;
    } else {
      const numeric = Number(value);
      settings.strokeWidth = Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
    }
    console.debug('Debug: box axis stroke width updated',{ strokeWidth: settings.strokeWidth });
    if(typeof state.scheduleDraw === 'function'){
      state.scheduleDraw();
    }
  }

  function getBrokenAxisEnabled(axis){
    if(axis !== 'y'){ return false; }
    const settings = ensureAxisSettings();
    return !!settings.y?.brokenAxis?.enabled;
  }

  function updateBrokenAxisEnabled(axis, enabled){
    if(axis !== 'y'){ return; }
    const settings = ensureAxisSettings();
    const previousValue = !!settings.y.brokenAxis.enabled;
    settings.y.brokenAxis.enabled = !!enabled;
    console.debug('Debug: box broken axis enabled updated',{ axis, enabled: settings.y.brokenAxis.enabled });
    if(typeof state.scheduleDraw === 'function'){
      state.scheduleDraw();
    }
  }

  function getBrokenAxisSegments(axis){
    if(axis !== 'y'){ return []; }
    const settings = ensureAxisSettings();
    return settings.y?.brokenAxis?.segments || [];
  }

  function updateBrokenAxisSegments(axis, segments){
    if(axis !== 'y'){ return; }
    const settings = ensureAxisSettings();
    if(!Array.isArray(segments)){
      settings.y.brokenAxis.segments = [];
      return;
    }
    // Validate and sanitize segments
    settings.y.brokenAxis.segments = segments.filter(seg => {
      if(!seg || typeof seg !== 'object'){ return false; }
      const start = Number(seg.start);
      const end = Number(seg.end);
      return Number.isFinite(start) && Number.isFinite(end) && start < end;
    }).map(seg => ({
      start: Number(seg.start),
      end: Number(seg.end)
    }));
    console.debug('Debug: box broken axis segments updated',{ axis, segments: settings.y.brokenAxis.segments });
    if(typeof state.scheduleDraw === 'function'){
      state.scheduleDraw();
    }
  }

  function getAxisColor(){
    const settings = ensureAxisSettings();
    return typeof settings.color === 'string' && settings.color ? settings.color : DEFAULT_AXIS_COLOR;
  }

  function updateAxisColor(value){
    const settings = ensureAxisSettings();
    if(typeof value === 'string' && value.trim()){
      settings.color = value;
    } else {
      settings.color = DEFAULT_AXIS_COLOR;
    }
    console.debug('Debug: box axis color updated',{ color: settings.color });
    if(typeof state.scheduleDraw === 'function'){
      state.scheduleDraw();
    }
  }

  // PART: BROKEN AXIS SCALE COMPUTATION
  
  function computeBrokenAxisScale(config){
    const { dataMin, dataMax, segments, plotHeight } = config;
    
    if(!Array.isArray(segments) || segments.length === 0){
      // No broken axis, return standard linear scale
      return {
        isBroken: false,
        min: dataMin,
        max: dataMax,
        valueToPixel: (value, baseY, plotH) => {
          const range = dataMax - dataMin || 1;
          return baseY + plotH * (1 - (value - dataMin) / range);
        },
        segments: []
      };
    }
    
    // Sort and validate segments
    const validSegments = segments
      .filter(seg => Number.isFinite(seg.start) && Number.isFinite(seg.end) && seg.start < seg.end)
      .sort((a, b) => a.start - b.start);
    
    if(validSegments.length === 0){
      // No valid segments, return standard scale
      return {
        isBroken: false,
        min: dataMin,
        max: dataMax,
        valueToPixel: (value, baseY, plotH) => {
          const range = dataMax - dataMin || 1;
          return baseY + plotH * (1 - (value - dataMin) / range);
        },
        segments: []
      };
    }
    
    // Merge overlapping segments and calculate display ranges
    const mergedSegments = [];
    let current = { ...validSegments[0] };
    
    for(let i = 1; i < validSegments.length; i++){
      const seg = validSegments[i];
      if(seg.start <= current.end){
        // Overlapping or adjacent, merge
        current.end = Math.max(current.end, seg.end);
      }else{
        mergedSegments.push(current);
        current = { ...seg };
      }
    }
    mergedSegments.push(current);
    
    // Calculate the total data range covered by segments
    const totalDataRange = mergedSegments.reduce((sum, seg) => sum + (seg.end - seg.start), 0);
    
    // Define gap size in pixels
    const gapSizePx = BROKEN_AXIS_GAP_SIZE_PX;
    const numGaps = mergedSegments.length - 1;
    const totalGapHeight = numGaps * gapSizePx;
    const availableHeight = plotHeight - totalGapHeight;
    
    // Assign pixel heights to each segment proportionally
    const segmentMeta = mergedSegments.map((seg, idx) => {
      const dataRange = seg.end - seg.start;
      const heightPx = (dataRange / totalDataRange) * availableHeight;
      return {
        start: seg.start,
        end: seg.end,
        dataRange,
        heightPx,
        pixelStart: 0, // Will be calculated next
        pixelEnd: 0
      };
    });
    
    // Calculate pixel positions from top
    let currentPixel = 0;
    for(let i = 0; i < segmentMeta.length; i++){
      segmentMeta[i].pixelStart = currentPixel;
      segmentMeta[i].pixelEnd = currentPixel + segmentMeta[i].heightPx;
      currentPixel = segmentMeta[i].pixelEnd + gapSizePx;
    }
    
    // Create value-to-pixel mapping function
    const valueToPixel = (value, baseY, plotH) => {
      const mapPixel = pixel => baseY + plotH - pixel;
      // Find which segment contains this value
      for(let i = 0; i < segmentMeta.length; i++){
        const seg = segmentMeta[i];
        if(value >= seg.start && value <= seg.end){
          // Map value within this segment to pixels
          const fraction = (value - seg.start) / seg.dataRange;
          const pixelInSegment = seg.pixelStart + fraction * seg.heightPx;
          return mapPixel(pixelInSegment);
        }
      }
      
      // Value not in any segment - clamp to nearest segment
      if(value < segmentMeta[0].start){
        return baseY + plotH;
      }
      if(value > segmentMeta[segmentMeta.length - 1].end){
        return baseY;
      }
      
      // Value falls in a gap - return the bottom of the segment above it
      for(let i = 0; i < segmentMeta.length - 1; i++){
        if(value > segmentMeta[i].end && value < segmentMeta[i + 1].start){
          // In gap between segment i and i+1
          return mapPixel(segmentMeta[i].pixelEnd);
        }
      }
      
      return baseY + plotH / 2; // Fallback
    };
    
    return {
      isBroken: true,
      min: mergedSegments[0].start,
      max: mergedSegments[mergedSegments.length - 1].end,
      segments: segmentMeta,
      gapSizePx,
      valueToPixel
    };
  }

  function clampViolinSampleCount(value){
    const numeric = Number(value);
    if(!Number.isFinite(numeric)){
      return DEFAULT_VIOLIN_SAMPLE_COUNT;
    }
    const rounded = Math.round(numeric);
    if(rounded < VIOLIN_SAMPLE_MIN){
      return VIOLIN_SAMPLE_MIN;
    }
    if(rounded > VIOLIN_SAMPLE_MAX){
      return VIOLIN_SAMPLE_MAX;
    }
    return rounded;
  }

  function ensureViolinState(){
    if(!state.violin || typeof state.violin !== 'object'){
      state.violin = {
        autoBandwidth: true,
        bandwidth: null,
        sampleCount: DEFAULT_VIOLIN_SAMPLE_COUNT,
        lastUsedBandwidth: null,
        lastSampleCount: DEFAULT_VIOLIN_SAMPLE_COUNT
      };
      return state.violin;
    }
    state.violin.autoBandwidth = state.violin.autoBandwidth === false ? false : true;
    const manualValue = Number(state.violin.bandwidth);
    if(Number.isFinite(manualValue) && manualValue > 0){
      state.violin.bandwidth = manualValue;
    }else{
      state.violin.bandwidth = null;
    }
    state.violin.sampleCount = clampViolinSampleCount(state.violin.sampleCount);
    const lastSample = clampViolinSampleCount(state.violin.lastSampleCount || state.violin.sampleCount);
    state.violin.lastSampleCount = lastSample;
    const lastBandwidth = Number(state.violin.lastUsedBandwidth);
    state.violin.lastUsedBandwidth = Number.isFinite(lastBandwidth) && lastBandwidth > 0 ? lastBandwidth : null;
    return state.violin;
  }
  const els = {};
  const boxOverlayController = Shared.loadingOverlay?.createPendingController?.({
    component: 'box',
    message: 'Rendering box plot...',
    getHost: () => (
      els.svgBox
      || els.graphPanel?.querySelector?.('.svgbox')
      || global.document?.getElementById?.('boxGraphPanel')?.querySelector?.('.svgbox')
      || global.document?.getElementById?.('boxGraphPanel')
    )
  });

  function markBoxOverlayPending(reason){
    boxOverlayController?.markPending(reason);
    boxDebug('Debug: box overlay pending flagged',{ reason: reason || 'data-change' });
  }

  function queueBoxLoading(reason, options = {}){
    return boxOverlayController?.queue(reason, options) || false;
  }

  function resolveBoxLoading(reason){
    boxOverlayController?.resolve(reason);
  }

  function forceBoxOverlay(reason, options = {}){
    return boxOverlayController?.force(reason, options) || false;
  }
  let boxLegendControl = null;
  let boxNoticeBoundWidth = null;

  const syncBoxAutoDrawNoticeWidth = (reason) => {
    const svgBox = els.svgBox || els.graphPanel?.querySelector?.('.svgbox');
    const renderRow = els.renderRow || global.document?.getElementById?.('boxRenderRow');
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
    if(els.autoDrawNotice && els.autoDrawNotice.style.maxWidth !== widthPx){
      els.autoDrawNotice.style.maxWidth = widthPx;
    }
    if(boxNoticeBoundWidth !== width){
      boxNoticeBoundWidth = width;
      boxDebug('Debug: box auto draw notice width synced', { width, reason: reason || null });
    }
  };
  const scheduleBoxNoticeWidth = (() => {
    if(typeof Shared.debounceFrame === 'function'){
      let lastReason = 'frame';
      const debounced = Shared.debounceFrame(() => syncBoxAutoDrawNoticeWidth(lastReason));
      return reason => {
        lastReason = reason || 'frame';
        debounced();
      };
    }
    return reason => syncBoxAutoDrawNoticeWidth(reason || 'immediate');
  })();

  function ensureBoxLegendControlPlacement(){
    if(!boxLegendControl || !els.svgBox){
      return;
    }
    if(Shared.resizer && typeof Shared.resizer.ensureLegendControlPlacement === 'function'){
      Shared.resizer.ensureLegendControlPlacement({
        svgBox: els.svgBox,
        control: boxLegendControl,
        debugLabel: 'box-legend'
      });
    }
  }
  let boxLogWarningEl = null;
  const boxDebugEnabled = () => typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();

  function ensureBoxLogWarningElement(){
    if(boxLogWarningEl && boxLogWarningEl.isConnected){
      return boxLogWarningEl;
    }
    const host = els.boxLogScale?.closest('fieldset') || els.boxLogScale?.parentElement;
    if(!host){
      if(boxDebugEnabled()){
        console.debug('Debug: box log warning host unavailable');
      }
      return null;
    }
    const el = global.document.createElement('div');
    el.className = 'config-panel__warning';
    el.setAttribute('role', 'alert');
    el.setAttribute('aria-live', 'polite');
    el.hidden = true;
    host.appendChild(el);
    boxLogWarningEl = el;
    if(boxDebugEnabled()){
      console.debug('Debug: box log warning element created');
    }
    return boxLogWarningEl;
  }

  function showBoxLogWarning(message){
    const el = ensureBoxLogWarningElement();
    if(!el){
      return;
    }
    el.textContent = message;
    el.hidden = false;
    if(boxDebugEnabled()){
      console.debug('Debug: box log warning shown', { message });
    }
  }

  function clearBoxLogWarning(){
    if(!boxLogWarningEl){
      return;
    }
    boxLogWarningEl.textContent = '';
    boxLogWarningEl.hidden = true;
    if(boxDebugEnabled()){
      console.debug('Debug: box log warning cleared');
    }
  }

  function validateBoxLogScale(){
    const axisLabel = els.boxFlipAxes?.checked ? 'Values' : 'Y';
    const manualMin = parseFloat(els.boxYMin?.value);
    if(Number.isFinite(manualMin) && manualMin <= 0){
      const message = `Cannot enable log scale because the ${axisLabel} minimum (${manualMin}) is not positive.`;
      if(boxDebugEnabled()){
        console.debug('Debug: box log scale blocked by manual minimum', { value: manualMin, axisLabel });
      }
      return { allowed: false, reason: 'axis-limit', value: manualMin, message, hasZeros: manualMin === 0, hasNegatives: manualMin < 0 };
    }
    const manualMax = parseFloat(els.boxYMax?.value);
    if(Number.isFinite(manualMax) && manualMax <= 0){
      const message = `Cannot enable log scale because the ${axisLabel} maximum (${manualMax}) is not positive.`;
      if(boxDebugEnabled()){
        console.debug('Debug: box log scale blocked by manual maximum', { value: manualMax, axisLabel });
      }
      return { allowed: false, reason: 'axis-limit', value: manualMax, message, hasZeros: manualMax === 0, hasNegatives: manualMax < 0 };
    }
    const analysis = state.hot?.getAnalysisData?.() || Shared.hot.getAnalysisData(state.hot);
    const dataMatrix = analysis?.data || [];
    const rowCount = analysis?.rowCount || dataMatrix.length;
    const colCount = analysis?.colCount || (dataMatrix[0]?.length || 0);
    if(!rowCount || !colCount){
      if(boxDebugEnabled()){
        console.debug('Debug: box log scale validation skipped (empty data)', { rowCount, colCount });
      }
      return { allowed: true };
    }
    let hasZeros = false;
    let hasNegatives = false;
    let firstZeroLocation = null;
    let firstNegativeLocation = null;
    for(let c = 0; c < colCount; c += 1){
      if(analysis.isColumnExcluded?.(c)){
        continue;
      }
      const headerCell = dataMatrix?.[0]?.[c];
      const columnLabel = (headerCell && String(headerCell).trim()) || `Column ${c + 1}`;
      for(let r = 1; r < rowCount; r += 1){
        if(analysis.isRowExcluded?.(r) || analysis.isCellExcluded?.(r, c)){
          continue;
        }
        const raw = dataMatrix?.[r]?.[c];
        if(raw === null || typeof raw === 'undefined' || raw === ''){
          continue;
        }
        const value = parseFloat(raw);
        if(Number.isFinite(value)){
          if(value < 0){
            hasNegatives = true;
            if(!firstNegativeLocation){
              firstNegativeLocation = { column: c, row: r, value, columnLabel };
            }
          }else if(value === 0){
            hasZeros = true;
            if(!firstZeroLocation){
              firstZeroLocation = { column: c, row: r, value, columnLabel };
            }
          }
        }
      }
    }
    if(hasNegatives){
      const loc = firstNegativeLocation;
      const formatted = loc.value.toPrecision(4);
      const message = `Cannot enable log scale because ${axisLabel} data in "${loc.columnLabel}" includes ${formatted} at row ${loc.row + 1}.`;
      if(boxDebugEnabled()){
        console.debug('Debug: box log scale blocked by negative data', { column: loc.column, row: loc.row, value: loc.value, columnLabel: loc.columnLabel });
      }
      return { allowed: false, reason: 'data', value: loc.value, message, hasZeros, hasNegatives: true };
    }
    if(hasZeros){
      const loc = firstZeroLocation;
      const message = `Data contains zero values. Would you like to use log(x+1) transform instead?`;
      if(boxDebugEnabled()){
        console.debug('Debug: box log scale has zeros', { column: loc.column, row: loc.row, columnLabel: loc.columnLabel });
      }
      return { allowed: false, reason: 'zeros', value: 0, message, hasZeros: true, hasNegatives: false, canUsePlusOne: true };
    }
    if(boxDebugEnabled()){
      console.debug('Debug: box log scale validation passed');
    }
    return { allowed: true };
  }

  function applyBoxLogScaleValidationFailure(validation, context){
    if(!validation || validation.allowed !== false){
      return;
    }
    if(els.boxLogScale){
      els.boxLogScale.checked = false;
    }
    const warningMessage = validation.message || 'Cannot enable log scale while non-positive values are present in the data.';
    showBoxLogWarning(warningMessage);
    if(boxDebugEnabled()){
      console.debug('Debug: box log scale auto-disabled', { context, reason: validation.reason, value: validation.value });
    }
  }

  function revalidateActiveBoxLogScale(context){
    if(!els.boxLogScale?.checked){
      return true;
    }
    const validation = validateBoxLogScale();
    if(!validation.allowed){
      applyBoxLogScaleValidationFailure(validation, context);
      console.warn('box log scale disabled', { context, reason: validation.reason, value: validation.value });
      if(typeof state.scheduleDraw === 'function'){
        state.scheduleDraw();
      }
      return false;
    }
    clearBoxLogWarning();
    return true;
  }

  function updateViolinBandwidthDisplays(value){
    const resolved = Number.isFinite(value) && value > 0 ? value : DEFAULT_VIOLIN_BANDWIDTH;
    if(els.violinBandwidthValue){
      els.violinBandwidthValue.value = String(resolved);
    }
    if(els.violinBandwidthVal){
      els.violinBandwidthVal.textContent = resolved.toLocaleString('en-US',{ maximumFractionDigits: 3 });
    }
    if(els.violinBandwidth){
      let sliderValue = resolved;
      const sliderMin = Number(els.violinBandwidth.min);
      const sliderMax = Number(els.violinBandwidth.max);
      if(Number.isFinite(sliderMin) && sliderValue < sliderMin){
        sliderValue = sliderMin;
      }
      if(Number.isFinite(sliderMax) && sliderValue > sliderMax){
        sliderValue = sliderMax;
      }
      els.violinBandwidth.value = String(sliderValue);
    }
  }

  function updateViolinSampleDisplays(value){
    const sampleValue = clampViolinSampleCount(value);
    if(els.violinSamplesValue){
      els.violinSamplesValue.value = String(sampleValue);
    }
    if(els.violinSamplesVal){
      els.violinSamplesVal.textContent = String(sampleValue);
    }
    if(els.violinSamples){
      let sliderValue = sampleValue;
      const sliderMin = Number(els.violinSamples.min);
      const sliderMax = Number(els.violinSamples.max);
      if(Number.isFinite(sliderMin) && sliderValue < sliderMin){
        sliderValue = sliderMin;
      }
      if(Number.isFinite(sliderMax) && sliderValue > sliderMax){
        sliderValue = sliderMax;
      }
      els.violinSamples.value = String(sliderValue);
    }
  }

  function refreshViolinControlAvailability(){
    const violinState = ensureViolinState();
    const auto = violinState.autoBandwidth !== false;
    if(els.violinBandwidth){
      els.violinBandwidth.disabled = auto;
    }
    if(els.violinBandwidthValue){
      els.violinBandwidthValue.disabled = auto;
    }
  }

  function syncViolinControlsFromState(){
    const violinState = ensureViolinState();
    if(els.violinBandwidthAuto){
      els.violinBandwidthAuto.checked = violinState.autoBandwidth !== false;
    }
    const manualCandidate = violinState.autoBandwidth === false && Number.isFinite(violinState.bandwidth) && violinState.bandwidth > 0
      ? violinState.bandwidth
      : (Number.isFinite(violinState.lastUsedBandwidth) && violinState.lastUsedBandwidth > 0
        ? violinState.lastUsedBandwidth
        : DEFAULT_VIOLIN_BANDWIDTH);
    updateViolinBandwidthDisplays(manualCandidate);
    if(violinState.autoBandwidth === false && (!Number.isFinite(violinState.bandwidth) || violinState.bandwidth <= 0)){
      violinState.bandwidth = manualCandidate;
    }
    updateViolinSampleDisplays(violinState.sampleCount);
    refreshViolinControlAvailability();
  }

  function updateStatsCorrectionSummary(count){
    const noteEl=global.document.getElementById('statsCorrectionNote');
    if(!noteEl){
      console.debug('Debug: box updateStatsCorrectionSummary missing element');
      return;
    }
    const rawCount=Number(count);
    const safeCount=Number.isFinite(rawCount) && rawCount>0 ? Math.round(rawCount) : 0;
    if(state.statsPostHoc==='tukey'){
      const detail=safeCount>0?`${safeCount} comparison${safeCount===1?'':'s'}`:'awaiting data';
      noteEl.textContent=`Post-hoc: Tukey HSD (${detail}, studentized range).`;
      noteEl.dataset.method='tukey';
      noteEl.dataset.correctionLabel='Tukey HSD';
      console.debug('Debug: box updateStatsCorrectionSummary tukey',{ count:safeCount });
      return;
    }
    if(state.statsPostHoc==='gamesHowell'){
      const detail=safeCount>0?`${safeCount} comparison${safeCount===1?'':'s'}`:'awaiting data';
      noteEl.textContent=`Post-hoc: Games–Howell (${detail}, Welch-adjusted).`;
      noteEl.dataset.method='gamesHowell';
      noteEl.dataset.correctionLabel='Games–Howell';
      console.debug('Debug: box updateStatsCorrectionSummary gamesHowell',{ count:safeCount });
      return;
    }
    const meta=resolveCorrectionMeta(state.statsCorrection,safeCount);
    const detail=safeCount>0?`${safeCount} test${safeCount===1?'':'s'}`:'awaiting data';
    const labelPrefix=state.statsPostHoc==='dunn'?"Dunn's test correction":"Multiple-testing correction";
    noteEl.textContent=`${labelPrefix}: ${meta.label} (${detail}).`;
    noteEl.dataset.method=meta.key;
    noteEl.dataset.correctionLabel=meta.shortLabel || meta.label;
    console.debug('Debug: box updateStatsCorrectionSummary',{ method:meta.key, label:meta.label, count:safeCount });
  }

  // PART: CACHE_ELS
  function cacheEls(){
    els.tablePanel = global.document.getElementById('boxTablePanel');
    els.graphPanel = global.document.getElementById('boxGraphPanel');
    els.panelResizer = global.document.getElementById('boxPanelResizer');
    els.svgBox = els.graphPanel?.querySelector('.svgbox');
    els.configPanel = els.graphPanel?.querySelector('.config-options');
    els.renderRow = global.document.getElementById('boxRenderRow');
    els.renderButton = global.document.getElementById('boxRenderButton');
    els.autoDrawNotice = global.document.getElementById('boxAutoDrawNotice');
    els.hotContainer = global.document.getElementById('hot');
    els.hotWrapper = global.document.getElementById('hotWrapper');
    els.plotDiv = global.document.getElementById('boxPlot');
    els.tableFormat = global.document.getElementById('boxTableFormat');
    els.groupedControls = global.document.getElementById('boxGroupedControls');
    els.groupedReplicates = global.document.getElementById('boxGroupedReplicates');
    els.groupedList = global.document.getElementById('boxGroupedList');
    els.groupedAdd = global.document.getElementById('boxGroupedAdd');
    els.groupedRemove = global.document.getElementById('boxGroupedRemove');
    // Controls
    els.boxColorUnified=global.$('#boxColorUnified');
    els.boxColorIndividual=global.$('#boxColorIndividual');
    els.boxUnifiedColors=global.$('#boxUnifiedColors');
    els.boxFill=global.$('#boxFill');
    els.boxBorder=global.$('#boxBorder');
    els.boxBorderWidth=global.$('#boxBorderWidth');
    els.boxErrorBarWidth=global.$('#boxErrorBarWidth');
    els.boxErrorBarWidthCtl=global.$('#boxErrorBarWidthCtl');
    els.boxFontSize=global.$('#boxFontSize');
    els.boxFontSizeVal=global.$('#boxFontSizeVal');
    els.violinBandwidthCtl=global.$('#boxViolinBandwidthCtl');
    els.violinBandwidth=global.$('#boxViolinBandwidth');
    els.violinBandwidthValue=global.$('#boxViolinBandwidthValue');
    els.violinBandwidthVal=global.$('#boxViolinBandwidthVal');
    els.violinBandwidthAuto=global.$('#boxViolinBandwidthAuto');
    els.violinSamplesCtl=global.$('#boxViolinSamplesCtl');
    els.violinSamples=global.$('#boxViolinSamples');
    els.violinSamplesValue=global.$('#boxViolinSamplesValue');
    els.violinSamplesVal=global.$('#boxViolinSamplesVal');
    if (typeof chartStyle.renderFontSizeLabel === 'function') {
      if(els.boxFontSize?.dataset){
        els.boxFontSize.dataset.fontBasePt = String(els.boxFontSize.value);
        console.debug('Debug: box font size base initialized',{ value: els.boxFontSize.value }); // Debug: initial base size
      }
      chartStyle.renderFontSizeLabel({ element: els.boxFontSizeVal, pt: Number(els.boxFontSize.value), input: els.boxFontSize, manual: true });
    } else {
      console.debug('Debug: box renderFontSizeLabel missing helper'); // Debug: chartStyle guard
    }
    els.boxShowGrid=global.$('#boxShowGrid');
    els.boxShowFrame=global.$('#boxShowFrame');
    els.boxShowLegend=global.$('#boxShowLegend');
    if(els.boxShowLegend){
      const legendHost=els.boxShowLegend.closest('label');
      if(legendHost){
        boxLegendControl=legendHost;
      }
    }
    els.boxLogScale=global.$('#boxLogScale');
    els.boxLogScaleLabel=global.$('#boxLogScaleLabel');
    clearBoxLogWarning();
    els.boxFlipAxes=global.$('#boxFlipAxes');
    els.boxWhiskerRuleCtl=global.$('#boxWhiskerRuleCtl');
    els.boxWhiskerRule=global.$('#boxWhiskerRule');
    els.boxWhiskerCustom=global.$('#boxWhiskerCustomMultiplier');
    els.boxWhiskerCustomLabel=global.$('#boxWhiskerCustomLabel');
    els.boxGraphType=global.$('#boxGraphType');
    els.boxLayoutModeCtl=global.$('#boxLayoutModeCtl');
    els.boxLayoutMode=global.$('#boxLayoutMode');
    if(els.boxLayoutMode){
      const allowedLayouts = new Set(['interleaved','separated','stacked']);
      const fallbackLayout = allowedLayouts.has(state.groupLayout) ? state.groupLayout : 'interleaved';
      state.groupLayout = fallbackLayout;
      els.boxLayoutMode.value = fallbackLayout;
      console.debug('Debug: box layout mode initialised',{ value: fallbackLayout });
    }
    els.boxIndividualSummaryCtl=global.$('#boxIndividualSummaryCtl');
    els.boxIndividualSummary=global.$('#boxIndividualSummary');
    if(els.boxIndividualSummary){
      populateIndividualSummarySelect(els.boxIndividualSummary);
      const fallbackSummary = normalizeIndividualSummaryValue(state.individualSummary);
      state.individualSummary = fallbackSummary;
      els.boxIndividualSummary.value = fallbackSummary;
      console.debug('Debug: box individual summary initialised',{ value: els.boxIndividualSummary.value });
    }
    els.boxPointMode=global.$('#boxPointMode');
    els.boxShowCaps=global.$('#boxShowCaps');
    els.boxShowSignificance=global.$('#boxShowSignificance');
    els.boxSignificanceLabelCtl=global.$('#boxSignificanceLabelCtl');
    els.boxSignificanceLabelMode=global.$('#boxSignificanceLabelMode');
    if(els.boxShowSignificance){
      els.boxShowSignificance.checked = !!state.showSignificanceBars;
      els.boxShowSignificance.addEventListener('change',()=>{
        state.showSignificanceBars = !!els.boxShowSignificance.checked;
        console.debug('Debug: box significance toggle',{ enabled: state.showSignificanceBars });
        requestStatsContextRefresh('significance-toggle');
      });
    }
    if(els.boxSignificanceLabelMode && !els.boxSignificanceLabelMode.dataset?.boxHandlerAttached){
      els.boxSignificanceLabelMode.addEventListener('change',()=>{
        const raw = els.boxSignificanceLabelMode.value === 'p' ? 'p' : 'stars';
        if(state.significanceLabelMode !== raw){
          state.significanceLabelMode = raw;
          console.debug('Debug: box significance label mode changed',{ mode: raw });
          if(state.showSignificanceBars){
            requestStatsContextRefresh('significance-label-mode');
            refreshSignificanceAnnotations('label-mode');
          }
        }
      });
      els.boxSignificanceLabelMode.dataset.boxHandlerAttached = 'true';
    }
    if(els.boxSignificanceLabelMode){
      const mode = state.significanceLabelMode === 'p' ? 'p' : 'stars';
      state.significanceLabelMode = mode;
      els.boxSignificanceLabelMode.value = mode;
    }
    els.boxErrorMode=global.$('#boxErrorMode');
    els.boxErrorModeCtl=global.$('#boxErrorModeCtl');
    ensureBoxLegendControlPlacement();
    els.boxColorPerBox=global.$('#boxColorPerBox');
    els.boxYMin=global.$('#boxYMin');
    els.boxYMax=global.$('#boxYMax');
    els.statsControls=global.document.getElementById('statsControls');
    els.statsResults=global.document.getElementById('statsResults');
    els.statsTable=global.document.getElementById('statsTable');
    els.statsButton=global.document.getElementById('boxComputeStats');
    els.statsStatus=global.document.getElementById('boxStatsStatus');
    if(els.statsButton && !els.statsButton.dataset?.boxHandlerAttached){
      els.statsButton.addEventListener('click', handleStatsComputeClick);
      els.statsButton.dataset.boxHandlerAttached='true';
    }
    ensureWhiskerState();
    if(els.boxWhiskerRule){
      els.boxWhiskerRule.value = state.whiskerRule;
    }
    if(els.boxWhiskerCustom){
      els.boxWhiskerCustom.value = String(state.whiskerCustomMultiplier);
    }
    syncWhiskerControlsFromState();
    const boxAutoSizeTargets=[
      els.boxTableFormat,
      els.boxGraphType,
      els.boxLayoutMode,
      els.boxIndividualSummary,
      els.boxErrorMode,
      els.boxPointMode,
      els.boxWhiskerRule,
      els.boxSignificanceLabelMode
    ];
    boxAutoSizeTargets.filter(Boolean).forEach(select=>{
      attachBoxSelectAutoSize(select, 'box');
    });
  }

	  function ensureWhiskerState(ruleCandidate){
	    const meta=resolveWhiskerMeta(ruleCandidate || state.whiskerRule);
	    state.whiskerRule=meta.key;
	    state.whiskerCustomMultiplier=clampWhiskerMultiplier(state.whiskerCustomMultiplier);
	    return meta;
	  }

	  function normalizeSignificanceWhiskerMode(value){
	    if(typeof value !== 'string'){ return DEFAULT_SIGNIFICANCE_WHISKER_MODE; }
	    const trimmed = value.trim().toLowerCase();
	    return trimmed === 'adaptive' ? 'adaptive' : 'fixed';
	  }

	  function ensureSignificanceStyle(){
	    const style = state.significanceStyle && typeof state.significanceStyle === 'object'
	      ? state.significanceStyle
	      : {};
	    const thickness = Number(style.thickness);
	    style.thickness = Number.isFinite(thickness) && thickness > 0 ? thickness : DEFAULT_SIGNIFICANCE_THICKNESS;
	    style.color = typeof style.color === 'string' && style.color.trim() ? style.color.trim() : DEFAULT_SIGNIFICANCE_COLOR;
	    style.showWhiskers = style.showWhiskers !== false;
	    style.whiskerMode = normalizeSignificanceWhiskerMode(style.whiskerMode);
	    state.significanceStyle = style;
	    return style;
	  }

  function getSignificanceThickness(){
    return ensureSignificanceStyle().thickness;
  }

  function getSignificanceColor(){
    return ensureSignificanceStyle().color;
  }

	  function getSignificanceWhiskers(){
	    return ensureSignificanceStyle().showWhiskers;
	  }

	  function getSignificanceWhiskerMode(){
	    return ensureSignificanceStyle().whiskerMode;
	  }

	  function syncSignificanceStyleToStatsContext(){
	    const ctx = state.statsContext;
	    if(!ctx || !ctx.helpers || !ctx.helpers.annotationStyle){
	      return false;
	    }
    const style = ensureSignificanceStyle();
    const annotationStyle = ctx.helpers.annotationStyle;
    const scaleInfo = annotationStyle.styleScaleInfo;
	    const scaledStroke = chartStyle.scaleStrokeWidth(style.thickness, scaleInfo, { context: 'box-annotation', min: 0.5 });
	    annotationStyle.strokeWidth = scaledStroke;
	    annotationStyle.color = style.color;
	    annotationStyle.showWhiskers = style.showWhiskers !== false;
	    annotationStyle.whiskerMode = normalizeSignificanceWhiskerMode(style.whiskerMode);
	    annotationStyle.controlConfig = createSignificanceControlConfig(annotationStyle.orientation || 'vertical');
	    return true;
	  }

  function refreshSignificanceAnnotations(reason){
    const hasContext = state.statsContext && Array.isArray(state.statsContext.traces) && state.statsContext.traces.length > 0;
    const hasFreshResults = state.statsLastRunVersion === state.statsContextVersion && state.statsLastRunVersion > 0;
    if(!hasContext || !hasFreshResults || state.statsComputationPending || !state.showSignificanceBars){
      return false;
    }
    const synced = syncSignificanceStyleToStatsContext();
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug('Debug: box significance annotations refresh',{ reason, synced });
    }
    handleStatsComputeClick();
    return true;
  }

  function updateSignificanceThickness(value){
    const style = ensureSignificanceStyle();
    if(value === null || value === undefined || value === ''){
      style.thickness = DEFAULT_SIGNIFICANCE_THICKNESS;
    }else{
      const numeric = Number(value);
      style.thickness = Number.isFinite(numeric) && numeric > 0 ? numeric : DEFAULT_SIGNIFICANCE_THICKNESS;
    }
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug('Debug: box significance thickness updated',{ thickness: style.thickness });
    }
    if(typeof state.scheduleDraw === 'function'){
      state.scheduleDraw();
    }
    refreshSignificanceAnnotations('thickness');
  }

  function updateSignificanceColor(value){
    const style = ensureSignificanceStyle();
    const nextColor = typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_SIGNIFICANCE_COLOR;
    style.color = nextColor;
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug('Debug: box significance color updated',{ color: style.color });
    }
    if(typeof state.scheduleDraw === 'function'){
      state.scheduleDraw();
    }
    refreshSignificanceAnnotations('color');
  }

	  function updateSignificanceWhiskers(enabled){
	    const style = ensureSignificanceStyle();
	    style.showWhiskers = enabled !== false;
	    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
	      console.debug('Debug: box significance whiskers updated',{ showWhiskers: style.showWhiskers });
	    }
	    if(typeof state.scheduleDraw === 'function'){
	      state.scheduleDraw();
	    }
	    refreshSignificanceAnnotations('whiskers');
	  }

	  function updateSignificanceWhiskerMode(mode){
	    const style = ensureSignificanceStyle();
	    style.whiskerMode = normalizeSignificanceWhiskerMode(mode);
	    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
	      console.debug('Debug: box significance whisker mode updated',{ whiskerMode: style.whiskerMode });
	    }
	    if(typeof state.scheduleDraw === 'function'){
	      state.scheduleDraw();
	    }
	    refreshSignificanceAnnotations('whisker-mode');
	  }

	  function createSignificanceControlConfig(orientation){
	    // Use the shared 'box' toolbar scope so the FORMAT host exists
	    const scopeId = 'box';
	    return {
	      orientation: orientation === 'horizontal' ? 'horizontal' : 'vertical',
	      scopeId: scopeId,
	      undoScope: `${scopeId}GraphPanel`,
	      getThickness: () => getSignificanceThickness(),
	      getColor: () => getSignificanceColor(),
	      getWhiskers: () => getSignificanceWhiskers(),
	      getWhiskerMode: () => getSignificanceWhiskerMode(),
	      onThicknessChange: value => updateSignificanceThickness(value),
	      onColorChange: value => updateSignificanceColor(value),
	      onWhiskersChange: value => updateSignificanceWhiskers(value),
	      onWhiskerModeChange: value => updateSignificanceWhiskerMode(value)
	    };
	  }

  function syncWhiskerControlsFromState(){
    const debugActive=typeof Shared.isDebugEnabled==='function' && Shared.isDebugEnabled();
    ensureWhiskerState();
    if(els.boxWhiskerRule && els.boxWhiskerRule.value!==state.whiskerRule){
      els.boxWhiskerRule.value=state.whiskerRule;
    }
    const showCustom=state.whiskerRule==='custom';
    if(els.boxWhiskerCustomLabel){
      els.boxWhiskerCustomLabel.style.display=showCustom?'':'none';
    }
    if(els.boxWhiskerCustom){
      els.boxWhiskerCustom.value=String(state.whiskerCustomMultiplier);
      els.boxWhiskerCustom.disabled=!showCustom;
    }
    if(debugActive){
      console.debug('Debug: box whisker controls synced',{ rule: state.whiskerRule, multiplier: state.whiskerCustomMultiplier });
    }
  }

  // PART: INIT_TABLE
  function ensureGroupedDefaults(){
    if(!state.grouped || typeof state.grouped !== 'object'){
      state.grouped = { replicatesPerGroup: 3, groups: ['Control', 'Treated'] };
    }
    const rawReplicates = Number(state.grouped.replicatesPerGroup);
    if(!Number.isFinite(rawReplicates) || rawReplicates < 1){
      state.grouped.replicatesPerGroup = 1;
    }else{
      state.grouped.replicatesPerGroup = Math.max(1, Math.round(rawReplicates));
    }
    if(!Array.isArray(state.grouped.groups) || !state.grouped.groups.length){
      state.grouped.groups = ['Group 1', 'Group 2'];
    }
    state.grouped.groups = state.grouped.groups.map((name, idx)=>{
      const trimmed = typeof name === 'string' ? name.trim() : '';
      return trimmed || `Group ${idx + 1}`;
    });
    console.debug('Debug: ensureGroupedDefaults',{ replicates: state.grouped.replicatesPerGroup, groups: [...state.grouped.groups] });
  }

  function buildGroupedNestedHeaders(){
    ensureGroupedDefaults();
    const headers = state.grouped.groups.map((name, idx)=>({ label: name || `Group ${idx + 1}`, colspan: state.grouped.replicatesPerGroup }));
    console.debug('Debug: buildGroupedNestedHeaders',{ headers });
    return [headers];
  }

  function updateGroupedHeaders(){
    if(state.tableFormat !== 'grouped' || !state.hot){
      console.debug('Debug: updateGroupedHeaders skipped',{ tableFormat: state.tableFormat, hasHot: !!state.hot });
      return;
    }
    const nested = buildGroupedNestedHeaders();
    state.hot.updateSettings({ nestedHeaders: nested });
    console.debug('Debug: updateGroupedHeaders applied',{ nested });
  }

  function renderGroupedList(){
    if(!els.groupedList){
      console.debug('Debug: renderGroupedList skipped no container');
      return;
    }
    ensureGroupedDefaults();
    els.groupedList.innerHTML='';
    state.grouped.groups.forEach((name, idx)=>{
      const row = global.document.createElement('div');
      row.className = 'grouped-row';
      const label = global.document.createElement('label');
      label.textContent = `Group ${idx + 1}`;
      const input = global.document.createElement('input');
      input.type = 'text';
      input.value = name;
      input.addEventListener('input', e=>{
        state.grouped.groups[idx] = e.target.value;
        console.debug('Debug: grouped name updated',{ index: idx, value: state.grouped.groups[idx] });
        updateGroupedHeaders();
        state.scheduleDraw();
      });
      const removeBtn = global.document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'grouped-remove';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click',()=>{
        if(state.grouped.groups.length <= 1){
          console.debug('Debug: grouped remove prevented minimum',{ length: state.grouped.groups.length });
          return;
        }
        const removed = state.grouped.groups.splice(idx,1);
        console.debug('Debug: grouped remove',{ index: idx, removed });
        renderGroupedList();
        applyTableFormatToHot();
        state.scheduleDraw();
      });
      row.appendChild(label);
      row.appendChild(input);
      row.appendChild(removeBtn);
      els.groupedList.appendChild(row);
    });
    if(els.groupedReplicates){
      els.groupedReplicates.value = String(state.grouped.replicatesPerGroup);
    }
  }

  function adjustColumnsForGrouped(){
    if(!state.hot){
      console.debug('Debug: adjustColumnsForGrouped skipped no hot');
      return;
    }
    ensureGroupedDefaults();
    const groupsCount = state.grouped.groups.length;
    const replicates = Math.max(1, state.grouped.replicatesPerGroup);
    const targetCols = Math.max(0, groupsCount * replicates);
    const currentCols = state.hot.countCols();
    if(targetCols > currentCols){
      const extra = targetCols - currentCols;
      const action = currentCols > 0 ? 'insert_col_end' : 'insert_col_start';
      const index = currentCols > 0 ? currentCols - 1 : 0;
      console.debug('Debug: adjustColumnsForGrouped inserting cols', { extra, action, index, currentCols, targetCols });
      state.hot.alter(action, index, extra);
    }else if(targetCols < currentCols){
      state.hot.alter('remove_col', targetCols, currentCols - targetCols);
    }
    state.colOrder = Array.from({ length: state.hot.countCols() }, (_, i)=>i);
    console.debug('Debug: adjustColumnsForGrouped',{ groupsCount, replicates, targetCols, currentCols });
  }

  function applyTableFormatToHot(){
    if(!state.hot){
      console.debug('Debug: applyTableFormatToHot skipped no hot');
      return;
    }
    if(state.tableFormat === 'grouped'){
      ensureGroupedDefaults();
      adjustColumnsForGrouped();
      const nested = buildGroupedNestedHeaders();
      state.hot.updateSettings({ nestedHeaders: nested });
      console.debug('Debug: applyTableFormatToHot grouped',{ nested });
    }else{
      state.hot.updateSettings({ nestedHeaders: false });
      console.debug('Debug: applyTableFormatToHot single');
    }
  }

  function updateTableFormatUI(){
    if(els.tableFormat){
      els.tableFormat.value = state.tableFormat;
    }
    if(els.groupedControls){
      els.groupedControls.style.display = state.tableFormat === 'grouped' ? '' : 'none';
    }
    if(els.boxLayoutModeCtl){
      const groupedActive = state.tableFormat === 'grouped';
      els.boxLayoutModeCtl.style.display = groupedActive ? '' : 'none';
      if(els.boxLayoutMode){
        els.boxLayoutMode.disabled = !groupedActive;
      }
    }
    if(state.tableFormat === 'grouped'){
      renderGroupedList();
      updateGroupedHeaders();
    }
    console.debug('Debug: updateTableFormatUI',{ tableFormat: state.tableFormat });
  }

  function setTableFormat(mode, options){
    const opts = options || {};
    const normalized = mode === 'grouped' ? 'grouped' : 'single';
    if(state.tableFormat === normalized){
      console.debug('Debug: setTableFormat no change',{ mode: normalized });
      if(!opts.skipUI){
        updateTableFormatUI();
      }
      applyTableFormatToHot();
      if(!opts.skipDraw){
        state.scheduleDraw();
      }
      return;
    }
    state.tableFormat = normalized;
    console.debug('Debug: setTableFormat',{ mode: normalized });
    if(normalized === 'grouped' && els.boxColorUnified?.checked && !opts.skipColorSwitch){
      els.boxColorIndividual.checked = true;
      toggleColorMode();
      console.debug('Debug: auto color mode switch for grouped');
    }
    if(!opts.skipUI){
      updateTableFormatUI();
    }
    applyTableFormatToHot();
    if(!opts.skipDraw){
      state.scheduleDraw();
    }
  }

  // PART: INIT_HOT
  function initHot(){
    console.debug('Debug: box initHot using shared factory', { hasFactory: typeof Shared.hot?.createStandardTable === 'function' });
    if(typeof Shared.hot?.createStandardTable !== 'function'){
      console.error('box initHot missing Shared.hot.createStandardTable');
      return;
    }
    const data = Shared.createEmptyData(DEFAULT_ROWS, DEFAULT_COLS);
    let boxScheduleProxyCount = 0;
    const scheduleBoxDrawProxy = () => {
      boxScheduleProxyCount += 1;
      if(boxScheduleProxyCount <= 5){
        console.debug('Debug: box scheduleDraw proxy invoked', { count: boxScheduleProxyCount }); // Debug: table change trigger
        if(boxScheduleProxyCount === 5){
          console.debug('Debug: box scheduleDraw proxy suppressing further logs'); // Debug: proxy log suppression notice
        }
      }
      if(typeof state.scheduleDraw === 'function'){
        state.scheduleDraw();
      }
    };

    const createBoxTable = (container) => Shared.hot.createStandardTable(container, { rows: DEFAULT_ROWS, cols: DEFAULT_COLS }, scheduleBoxDrawProxy, {
      debugLabel: 'box',
      data,
      disablePaste: true,
      hotOptions: {
        manualColumnMove: true,
        afterChange(changes, source){
          if(!changes || source === 'loadData') return;
          console.log('boxplot afterChange', { count: changes.length, source });
          revalidateActiveBoxLogScale('data-edit');
        },
        afterCreateCol(){
          state.selectedCols.clear();
          console.debug('Debug: box afterCreateCol cleared selection');
        },
        afterRemoveCol(){
          state.selectedCols.clear();
          console.debug('Debug: box afterRemoveCol cleared selection');
        },
        afterUndo(){
          console.log('boxplot undo');
        },
        afterRedo(){
          console.log('boxplot redo');
        },
        afterColumnMove(_moved, _finalIndex, _dropIndex, _possible, orderChanged){
          if(orderChanged){
            console.log('boxplot afterColumnMove');
          }
        }
      }
    });
    const ensureBoxHotForActiveTab = () => {
      const wrapper = global.document.getElementById('hotWrapper');
      const baseContainer = global.document.getElementById('hot');
      if(typeof Shared.hot?.ensureTableForTab !== 'function' || !wrapper || !baseContainer){
        if(!state.hot){
          state.hot = createBoxTable(baseContainer);
        }
        els.hotContainer = baseContainer;
        return state.hot;
      }
      const entry = Shared.hot.ensureTableForTab({
        type: 'box',
        tabId: Shared.hot.resolveActiveTabId?.() || 'box-default',
        wrapper,
        container: baseContainer,
        createInstance: createBoxTable
      });
      if(entry?.instance){
        state.hot = entry.instance;
        els.hotContainer = entry.container || baseContainer;
      }
      const tableImport = Shared.tableImport;
      if(tableImport?.handlePaste && els.hotContainer && !els.hotContainer.__boxPasteBound){
        els.hotContainer.addEventListener('paste',async e=>{
          console.time('boxplotPaste');
          let forcedOverlay = false;
          try{
            forcedOverlay = !!forceBoxOverlay('table-paste-start', { message: 'Processing pasted data...' });
            await tableImport.handlePaste(e, state.hot, {
              minCols: DEFAULT_COLS,
              minRows: DEFAULT_ROWS,
              scheduleDraw: () => {
                markBoxOverlayPending('table-paste');
                state.scheduleDraw();
              },
              debugLabel: 'box',
              onBeforeProcess: meta => console.log('boxplot fast paste',{rows: meta.rowCount, cols: meta.colCount, startRow: meta.startRow, startCol: meta.startCol}),
              onProcessed: info => console.log('boxplot data imported', {rows: info?.rows, cols: info?.cols})
            });
          }catch(err){
            if(forcedOverlay){
              resolveBoxLoading('table-paste-error');
            }
            console.error('boxplot paste failed', err);
          }finally{
            console.timeEnd('boxplotPaste');
          }
        }, true);
        els.hotContainer.__boxPasteBound = true;
      }
      return state.hot;
    };
    state.hot = ensureBoxHotForActiveTab();
    state.ensureHotForActiveTab = ensureBoxHotForActiveTab;
  
    const loadExampleBtn=global.$('#boxLoadExample'), importBtn=global.$('#boxImport'), fileInput=global.$('#boxFile');
    const exampleSingle=[
      ['Control','Treatment A','Treatment B'],
      [12,15,14],
      [14,17,15],
      [11,14,13],
      [13,16,16],
      [15,18,18],
      [16,19,17],
      [14,16,15],
      [13,15,14],
      [12,14,13],
      [15,17,16],
      [17,20,21]
    ];
    const exampleGrouped=[['Wild type','Knock-out A','Knock-out B','Wild type','Knock-out A','Knock-out B'],[23,24,21,67,29,65],[21,23,25,79,31,69],[19,25,27,98,32,71],[22,26,24,88,30,67]];
    console.debug('Debug: example datasets prepared',{ singleCols: exampleSingle[0]?.length, groupedCols: exampleGrouped[0]?.length });
    loadExampleBtn.addEventListener('click',()=>{
      const overlayReason = 'example-data';
      const overlayMessage = state.tableFormat === 'grouped'
        ? 'Loading grouped example data...'
        : 'Loading example data...';
      forceBoxOverlay(overlayReason, { message: overlayMessage });
      markBoxOverlayPending(overlayReason);
      state.selectedCols.clear();
      if(state.tableFormat === 'grouped'){
        state.grouped.replicatesPerGroup = 3;
        state.grouped.groups = ['Control','Treated'];
        renderGroupedList();
        updateTableFormatUI();
        applyTableFormatToHot();
        state.hot.loadData(exampleGrouped);
        console.log('boxplot grouped example loaded');
      }else{
        state.hot.loadData(exampleSingle);
        console.log('boxplot example loaded');
      }
      state.axisSettings = createDefaultAxisSettings();
      console.debug('Debug: box axis settings reset from example load');
      state.scheduleDraw();
    });
    importBtn.addEventListener('click',()=>{ fileInput.value=''; fileInput.click(); });
    const tableImport = Shared.tableImport;
    const applyBoxPrismStyle = style => {
      if(!style || typeof style !== 'object'){
        return;
      }
      const title = style.title != null ? String(style.title).trim() : '';
      const yLabel = style.yLabel != null ? String(style.yLabel).trim() : '';
      const fontFamily = style.fontFamily != null ? String(style.fontFamily).trim() : '';
      const fontColor = style.fontColor != null ? String(style.fontColor).trim() : '';
      const axisColor = style.axisColor != null ? String(style.axisColor).trim() : '';
      const fontSizeValue = Number(style.fontSize);
      if(title){
        state.titleText = title;
      }
      if(yLabel){
        state.yLabelText = yLabel;
      }
      if(Number.isFinite(fontSizeValue) && fontSizeValue > 0 && els.boxFontSize){
        els.boxFontSize.value = String(fontSizeValue);
        if(els.boxFontSize.dataset){
          els.boxFontSize.dataset.fontBasePt = String(fontSizeValue);
        }
        chartStyle.renderFontSizeLabel({ element: els.boxFontSizeVal, pt: fontSizeValue, input: els.boxFontSize, manual: true });
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
        importFontStyles('box', { __graph__: graphStyle });
      }
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        console.debug('Debug: box prism style applied', { title, yLabel, fontFamily, fontSize: fontSizeValue, fontColor, axisColor });
      }
      state.scheduleDraw({ force: true, reason: 'import-prism-style', skipThresholdEvaluation: true });
    };
    fileInput.addEventListener('change',()=>{
      if(!tableImport || typeof tableImport.openFile !== 'function'){
        console.warn('boxplot import skipped: Shared.tableImport.openFile unavailable');
        return;
      }
      const hasFile = !!(fileInput?.files && fileInput.files[0]);
      let forcedOverlay = false;
      if(hasFile){
        forcedOverlay = !!forceBoxOverlay('file-import', { message: 'Importing table data...' });
        markBoxOverlayPending('file-import');
      }
      const importPromise = tableImport.openFile(fileInput, {
        hot: state.hot,
        minCols: DEFAULT_COLS,
        minRows: DEFAULT_ROWS,
        scheduleDraw: () => {
          markBoxOverlayPending('file-import');
          state.scheduleDraw({ force: true, reason: 'import-load', skipThresholdEvaluation: true });
        },
        debugLabel: 'box',
        onPrismStyle: applyBoxPrismStyle,
        onProcessed: info => console.log('boxplot data imported', {rows: info?.rows, cols: info?.cols}),
        onCompleted: () => {
          const renderReason = 'import-load';
          markBoxOverlayPending(renderReason);
          forceBoxOverlay(renderReason, { message: 'Rendering box plot...' });
        }
      });
      Promise.resolve(importPromise).then(result => {
        if(!result && forcedOverlay){
          resolveBoxLoading('file-import-empty');
        }
      }).catch(err => {
        if(forcedOverlay){
          resolveBoxLoading('file-import-error');
        }
        console.error('boxplot import failed', err);
      });
    });

    applyTableFormatToHot();
    updateTableFormatUI();
  }

  // PART: UI
  function toggleColorMode(){
    const mode=els.boxColorUnified.checked?'unified':'individual';
    els.boxUnifiedColors.style.display=mode==='unified'?'':'none';
    if(mode==='unified'){ els.boxColorPerBox.innerHTML=''; }
    console.log('box color mode toggled',mode);
    state.scheduleDraw();
  }
  function updateBoxColorPickers(labels, options){
    const opts = options || {};
    const grouped = !!opts.grouped;
    if(els.boxColorUnified.checked){ els.boxColorPerBox.innerHTML=''; return; }
    els.boxColorPerBox.innerHTML='';
    labels.forEach((lab,i)=>{
      const colorIndex=i;
      if(!state.fillColors[colorIndex]) state.fillColors[colorIndex]=DEFAULT_BOX_COLORS[colorIndex%DEFAULT_BOX_COLORS.length];
      if(!state.borderColors[colorIndex]) state.borderColors[colorIndex]=shadeColor(state.fillColors[colorIndex],-30);
      const fillInput=document.createElement('input');
      fillInput.type='color';
      fillInput.value=state.fillColors[colorIndex];
      if(global.attachColorPickerNear) global.attachColorPickerNear(fillInput);
      fillInput.addEventListener('input',e=>{
        state.fillColors[colorIndex]=e.target.value;
        console.log('box fill color changed',{index:colorIndex,color:state.fillColors[colorIndex],grouped});
        state.scheduleDraw();
      });
      const borderInput=document.createElement('input');
      borderInput.type='color';
      borderInput.value=state.borderColors[colorIndex];
      if(global.attachColorPickerNear) global.attachColorPickerNear(borderInput);
      borderInput.addEventListener('input',e=>{
        state.borderColors[colorIndex]=e.target.value;
        console.log('box border color changed',{index:colorIndex,color:state.borderColors[colorIndex],grouped});
        state.scheduleDraw();
      });
      const lbl=document.createElement('label'); lbl.textContent=lab+' '; lbl.appendChild(fillInput); lbl.appendChild(borderInput); els.boxColorPerBox.appendChild(lbl);
    });
    state.fillColors.length=labels.length;
    state.borderColors.length=labels.length;
    console.debug('Debug: updateBoxColorPickers applied',{ labelsCount: labels.length, grouped, fillColors: [...state.fillColors], borderColors: [...state.borderColors] });
  }
  function initUI(){
    ensureViolinState();
    syncViolinControlsFromState();
    if(els.renderButton){
      boxRenderButtonEl = els.renderButton;
      boxRenderRowEl = els.renderRow || boxRenderRowEl;
      boxAutoDrawNoticeEl = els.autoDrawNotice || boxAutoDrawNoticeEl;
      els.renderButton.addEventListener('click',()=>{
        boxDebug('Debug: box manual render button');
        const overlayReason = 'manual-render';
        markBoxOverlayPending(overlayReason);
        forceBoxOverlay(overlayReason, { message: 'Rendering box plot...' });
        state.scheduleDraw({ force: true, reason: 'manual-render' });
      });
    }
    if(els.tableFormat){
      els.tableFormat.addEventListener('change', e=>{
        console.debug('Debug: tableFormat select change',{ value: e.target.value });
        setTableFormat(e.target.value);
      });
    }
    if(els.groupedReplicates){
      els.groupedReplicates.addEventListener('change', e=>{
        const raw = Number(e.target.value);
        const resolved = Number.isFinite(raw) && raw >= 1 ? Math.round(raw) : state.grouped.replicatesPerGroup;
        state.grouped.replicatesPerGroup = resolved;
        console.debug('Debug: grouped replicates change',{ raw, resolved });
        renderGroupedList();
        applyTableFormatToHot();
        state.scheduleDraw();
      });
    }
    if(els.groupedAdd){
      els.groupedAdd.addEventListener('click',()=>{
        ensureGroupedDefaults();
        const nextLabel = `Group ${state.grouped.groups.length + 1}`;
        state.grouped.groups.push(nextLabel);
        console.debug('Debug: grouped add button',{ nextLabel, groups: [...state.grouped.groups] });
        renderGroupedList();
        applyTableFormatToHot();
        state.scheduleDraw();
      });
    }
    if(els.groupedRemove){
      els.groupedRemove.addEventListener('click',()=>{
        ensureGroupedDefaults();
        if(state.grouped.groups.length <= 1){
          console.debug('Debug: grouped remove button blocked',{ length: state.grouped.groups.length });
          return;
        }
        const removed = state.grouped.groups.pop();
        console.debug('Debug: grouped remove button',{ removed, groups: [...state.grouped.groups] });
        renderGroupedList();
        applyTableFormatToHot();
        state.scheduleDraw();
      });
    }
    els.boxColorUnified.addEventListener('change',toggleColorMode);
    els.boxColorIndividual.addEventListener('change',toggleColorMode);
    toggleColorMode();
    const applyViolinBandwidthChange = value => {
      const violinState = ensureViolinState();
      const numeric = Number(value);
      if(!Number.isFinite(numeric) || numeric <= 0){
        syncViolinControlsFromState();
        return false;
      }
      updateViolinBandwidthDisplays(numeric);
      if(violinState.autoBandwidth === false){
        if(violinState.bandwidth !== numeric){
          violinState.bandwidth = numeric;
          state.scheduleDraw();
        }
      }
      return true;
    };
    if(els.violinBandwidth){
      els.violinBandwidth.addEventListener('input',()=>{
        applyViolinBandwidthChange(els.violinBandwidth.value);
      });
    }
    if(els.violinBandwidthValue){
      const handleBandwidthInput = ()=>{
        applyViolinBandwidthChange(els.violinBandwidthValue.value);
      };
      els.violinBandwidthValue.addEventListener('change',handleBandwidthInput);
      els.violinBandwidthValue.addEventListener('blur',handleBandwidthInput);
      els.violinBandwidthValue.addEventListener('input',()=>{
        const numeric = Number(els.violinBandwidthValue.value);
        if(Number.isFinite(numeric) && numeric > 0){
          updateViolinBandwidthDisplays(numeric);
        }
      });
    }
    if(els.violinBandwidthAuto){
      els.violinBandwidthAuto.addEventListener('change',()=>{
        const violinState = ensureViolinState();
        violinState.autoBandwidth = !!els.violinBandwidthAuto.checked;
        if(violinState.autoBandwidth){
          violinState.bandwidth = null;
        }else{
          let manual = Number(els.violinBandwidthValue?.value);
          if(!Number.isFinite(manual) || manual <= 0){
            manual = Number(violinState.lastUsedBandwidth);
          }
          if(!Number.isFinite(manual) || manual <= 0){
            manual = DEFAULT_VIOLIN_BANDWIDTH;
          }
          violinState.bandwidth = manual;
        }
        syncViolinControlsFromState();
        state.scheduleDraw();
      });
    }
    const applyViolinSampleChange = value => {
      const violinState = ensureViolinState();
      const numeric = clampViolinSampleCount(value);
      const changed = violinState.sampleCount !== numeric;
      violinState.sampleCount = numeric;
      violinState.lastSampleCount = numeric;
      updateViolinSampleDisplays(numeric);
      if(changed){
        state.scheduleDraw();
      }
    };
    if(els.violinSamples){
      els.violinSamples.addEventListener('input',()=>{
        applyViolinSampleChange(els.violinSamples.value);
      });
    }
    if(els.violinSamplesValue){
      const handleSampleInput = ()=>{
        applyViolinSampleChange(els.violinSamplesValue.value);
      };
      els.violinSamplesValue.addEventListener('change',handleSampleInput);
      els.violinSamplesValue.addEventListener('blur',handleSampleInput);
      els.violinSamplesValue.addEventListener('input',()=>{
        const numeric = Number(els.violinSamplesValue.value);
        if(Number.isFinite(numeric) && els.violinSamplesVal){
          els.violinSamplesVal.textContent = String(clampViolinSampleCount(numeric));
        }
      });
    }
    els.boxFontSize.addEventListener('input',()=>{
      if(els.boxFontSize.dataset){
        els.boxFontSize.dataset.fontBasePt = String(els.boxFontSize.value);
        console.debug('Debug: box font size input manual set',{ value: els.boxFontSize.value }); // Debug: manual slider update
      }
      chartStyle.renderFontSizeLabel({ element: els.boxFontSizeVal, pt: Number(els.boxFontSize.value), input: els.boxFontSize, manual: true });
      state.scheduleDraw();
    });
    els.boxShowGrid.addEventListener('change',()=>{ console.log('boxShowGrid changed', els.boxShowGrid.checked); state.scheduleDraw(); });
    els.boxShowFrame?.addEventListener('change',()=>{ console.debug('Debug: box showFrame change',{checked:els.boxShowFrame.checked}); state.scheduleDraw(); });
    els.boxShowLegend?.addEventListener('change',()=>{
      console.debug('Debug: box showLegend change',{checked:els.boxShowLegend.checked});
      ensureBoxLegendControlPlacement();
      state.scheduleDraw();
    });
    els.boxLogScale.addEventListener('change',()=>{
      const enabling=!!els.boxLogScale.checked;
      if(enabling){
        const validation=validateBoxLogScale();
        if(!validation.allowed){
          if(validation.canUsePlusOne && validation.hasZeros && !validation.hasNegatives){
            const useLogPlusOne = global.confirm('Your data contains zero values. Would you like to add +1 to all values before log transform?\n\nThis will plot log(x+1) instead of log(x).');
            if(useLogPlusOne){
              state.logPlusOne = true;
              clearBoxLogWarning();
              console.debug('Debug: box log+1 enabled by user confirmation');
              state.scheduleDraw();
              return;
            }else{
              els.boxLogScale.checked = false;
              state.logPlusOne = false;
              console.debug('Debug: box log scale cancelled by user');
              return;
            }
          }
          applyBoxLogScaleValidationFailure(validation,'toggle');
          console.warn('box log scale blocked',{ reason: validation.reason, value: validation.value });
          return;
        }
        state.logPlusOne = false;
        clearBoxLogWarning();
      }else{
        state.logPlusOne = false;
        clearBoxLogWarning();
      }
      console.log('boxLogScale changed', els.boxLogScale.checked);
      state.scheduleDraw();
    });
    const updateGraphTypeControls = () => {
      const graphTypeValue = els.boxGraphType.value;
      const showErrorControls = graphTypeValue === 'bar';
      const showErrorBarThickness = graphTypeValue === 'bar' || graphTypeValue === 'strip' || graphTypeValue === 'box' || graphTypeValue === 'notched';
      const isViolin = graphTypeValue === 'violin';
      if(els.violinBandwidthCtl){
        els.violinBandwidthCtl.style.display = isViolin ? '' : 'none';
      }
      if(els.violinSamplesCtl){
        els.violinSamplesCtl.style.display = isViolin ? '' : 'none';
      }
      if(isViolin){
        syncViolinControlsFromState();
      }
      if(els.boxErrorModeCtl){
        els.boxErrorModeCtl.style.display = showErrorControls ? '' : 'none';
      }
      if(els.boxErrorBarWidthCtl){
        els.boxErrorBarWidthCtl.style.display = showErrorBarThickness ? 'inline-flex' : 'none';
        console.debug('Debug: box error bar thickness visibility',{ graphTypeValue, showErrorBarThickness });
      }
      if(els.boxWhiskerRuleCtl){
        const whiskerVisible = graphTypeValue !== 'bar' && graphTypeValue !== 'strip';
        els.boxWhiskerRuleCtl.style.display = whiskerVisible ? '' : 'none';
        console.debug('Debug: box whisker rule visibility',{ graphTypeValue, whiskerVisible });
      }
      const showCapsLabel = els.boxShowCaps?.closest('label');
      if(showCapsLabel){
        const capsVisible = graphTypeValue === 'box' || graphTypeValue === 'notched';
        showCapsLabel.style.display = capsVisible ? '' : 'none';
        console.debug('Debug: box showCaps visibility updated',{ graphTypeValue, capsVisible });
      }
      if(els.boxIndividualSummaryCtl){
        const summaryVisible = graphTypeValue === 'strip';
        els.boxIndividualSummaryCtl.style.display = summaryVisible ? '' : 'none';
        if(summaryVisible && els.boxIndividualSummary){
          const summaryValue = normalizeIndividualSummaryValue(state.individualSummary);
          state.individualSummary = summaryValue;
          if(els.boxIndividualSummary.value !== summaryValue){
            els.boxIndividualSummary.value = summaryValue;
            console.debug('Debug: box individual summary sync',{ summaryValue });
          }
        }
        console.debug('Debug: box individual summary visibility',{ graphTypeValue, summaryVisible });
      }
      if(els.boxLayoutModeCtl){
        const groupedActive = state.tableFormat === 'grouped';
        els.boxLayoutModeCtl.style.display = groupedActive ? '' : 'none';
        if(els.boxLayoutMode){
          els.boxLayoutMode.disabled = !groupedActive;
          Array.from(els.boxLayoutMode.options || []).forEach(option => {
            if(option.value === 'stacked'){
              option.disabled = graphTypeValue !== 'bar';
            }
          });
          if(graphTypeValue !== 'bar' && state.groupLayout === 'stacked'){
            state.groupLayout = 'interleaved';
            els.boxLayoutMode.value = 'interleaved';
            console.debug('Debug: box layout reset to interleaved due to graph type',{ graphTypeValue });
          }
        }
      }
      console.debug('Debug: box graph type controls',{ graphTypeValue, showErrorControls });
    };
    els.updateGraphTypeControls = updateGraphTypeControls;
    els.boxGraphType.addEventListener('change',()=>{ console.log('boxGraphType changed', els.boxGraphType.value); updateGraphTypeControls(); state.scheduleDraw(); });
    if(els.boxLayoutMode){
      els.boxLayoutMode.addEventListener('change',()=>{
        const requested = els.boxLayoutMode.value;
        let normalized = 'interleaved';
        if(requested === 'separated'){ normalized = 'separated'; }
        else if(requested === 'stacked'){ normalized = 'stacked'; }
        if(normalized === 'stacked' && els.boxGraphType.value !== 'bar'){
          normalized = 'interleaved';
          els.boxLayoutMode.value = 'interleaved';
          console.debug('Debug: box stacked layout rejected for non-bar graph',{ graphType: els.boxGraphType.value });
        }
        state.groupLayout = normalized;
        console.debug('Debug: box layout mode change',{ requested, normalized });
        state.scheduleDraw();
      });
    }
    updateGraphTypeControls();
    if(els.boxWhiskerRule){
      els.boxWhiskerRule.addEventListener('change',()=>{
        const meta=ensureWhiskerState(els.boxWhiskerRule.value);
        state.whiskerRule=meta.key;
        syncWhiskerControlsFromState();
        if(typeof Shared.isDebugEnabled==='function' && Shared.isDebugEnabled()){
          console.debug('Debug: box whisker rule change',{ rule: state.whiskerRule });
        }
        state.scheduleDraw();
      });
    }
    if(els.boxWhiskerCustom){
      const handleCustomMultiplier=()=>{
        const next=clampWhiskerMultiplier(els.boxWhiskerCustom.value);
        const changed=state.whiskerCustomMultiplier!==next;
        state.whiskerCustomMultiplier=next;
        els.boxWhiskerCustom.value=String(next);
        if(typeof Shared.isDebugEnabled==='function' && Shared.isDebugEnabled()){
          console.debug('Debug: box whisker multiplier change',{ rule: state.whiskerRule, multiplier: next });
        }
        if(changed && state.whiskerRule==='custom'){
          state.scheduleDraw();
        }
      };
      els.boxWhiskerCustom.addEventListener('change',handleCustomMultiplier);
      els.boxWhiskerCustom.addEventListener('blur',handleCustomMultiplier);
    }
    if(els.boxIndividualSummary){
      els.boxIndividualSummary.addEventListener('change',()=>{
        const summaryValue = normalizeIndividualSummaryValue(els.boxIndividualSummary.value);
        state.individualSummary = summaryValue;
        console.debug('Debug: box individual summary change',{ summaryValue });
        state.scheduleDraw();
      });
    }
    els.boxPointMode.addEventListener('change',()=>{ console.log('boxPointMode changed', els.boxPointMode.value); state.scheduleDraw(); });
    els.boxShowCaps.addEventListener('change',()=>{ console.log('boxShowCaps changed', els.boxShowCaps.checked); state.scheduleDraw(); });
    if(els.boxShowSignificance){
      els.boxShowSignificance.checked = !!state.showSignificanceBars;
      els.boxShowSignificance.addEventListener('change',()=>{
        state.showSignificanceBars = !!els.boxShowSignificance.checked;
        console.debug('Debug: box significance toggle',{ enabled: state.showSignificanceBars });
        state.scheduleDraw();
      });
    }
    els.boxErrorMode.addEventListener('change',()=>{ console.log('boxErrorMode changed', els.boxErrorMode.value); state.scheduleDraw(); });
    const handleBoxAxisLimitInput=(event)=>{
      const target=event?.target;
      if(target===els.boxYMin){
        console.log('boxYMin changed', els.boxYMin.value);
        if(!revalidateActiveBoxLogScale('axis-min-input')){
          return;
        }
      }else if(target===els.boxYMax){
        console.log('boxYMax changed', els.boxYMax.value);
        if(!revalidateActiveBoxLogScale('axis-max-input')){
          return;
        }
      }
      if(!els.boxLogScale?.checked){
        const validation=validateBoxLogScale();
        if(validation.allowed){
          clearBoxLogWarning();
        }
      }
      state.scheduleDraw();
    };
    els.boxYMin.addEventListener('input',handleBoxAxisLimitInput);
    els.boxYMax.addEventListener('input',handleBoxAxisLimitInput);
    if(els.boxFlipAxes){
      state.flipAxes = !!els.boxFlipAxes.checked;
      els.boxFlipAxes.addEventListener('change',()=>{
        state.flipAxes = !!els.boxFlipAxes.checked;
        console.debug('Debug: box flipAxes toggled',{ flipAxes: state.flipAxes }); // Debug: flip axis change trace
        state.scheduleDraw();
      });
    }
    updateGraphTypeControls();
    els.boxFill.addEventListener('input',()=>{ console.log('boxFill changed',{newColor:els.boxFill.value,oldColor:state.lastDefaultFill}); state.fillColors=state.fillColors.map(c=>c===state.lastDefaultFill?els.boxFill.value:c); state.lastDefaultFill=els.boxFill.value; state.scheduleDraw(); });
    els.boxBorder.addEventListener('input',()=>{ console.log('boxBorder changed', els.boxBorder.value); state.scheduleDraw(); });
    els.boxBorderWidth.addEventListener('input',()=>{ console.log('boxBorderWidth changed', els.boxBorderWidth.value); state.scheduleDraw(); });
    if(els.boxErrorBarWidth){
      els.boxErrorBarWidth.addEventListener('input',()=>{
        console.debug('Debug: boxErrorBarWidth changed',{ value: els.boxErrorBarWidth.value });
        state.scheduleDraw();
      });
    }
    if (Shared.exporter && typeof Shared.exporter.mountSvgControls === 'function') {
      Shared.exporter.mountSvgControls({
        container: '#boxExportControls',
        svgSelector: '#boxSvg',
        fileName: 'boxplot',
        contextLabel: 'box-export',
        hybridOptions: {
          label: 'SVG (points as PNG)',
          fileNameSuffix: '-light',
          layers: [
            {
              selector: '[data-export-layer="box-points"]',
              label: 'box-points',
              padding: 2,
              scale: 4
            }
          ]
        }
      });
      console.debug('Debug: box export controls mounted', { hasExporter: true }); // Debug: box export mount
    } else {
      console.debug('Debug: box export controls unavailable', { hasExporter: !!Shared.exporter }); // Debug: box export fallback
    }
    global.$('#openBoxGraph')?.addEventListener('click', box.open);
    global.$('#saveBoxGraph')?.addEventListener('click', box.save);
    global.$('#saveAsBox').addEventListener('click', box.saveAs);
    global.$('#boxGraphFile').addEventListener('change', e=>{ const f=e.target.files[0]; if(f){ state.fileName=f.name; state.fileHandle=null; box.loadFromFile(f); } });
  }

  // PART: STATS
  function p2stars(p){ return p<0.0001?'****':p<0.001?'***':p<0.01?'**':p<0.05?'*':'ns'; }
  function formatSignificanceLabel(p, mode){
    if(!Number.isFinite(p)){
      return String(p);
    }
    const resolvedMode = mode === 'p' ? 'p' : 'stars';
    if(resolvedMode === 'p'){
      return formatP(p, { compact: true });
    }
    return p2stars(p);
  }
  function formatP(value, options){
    if(typeof Shared?.formatPValue === 'function'){
      return Shared.formatPValue(value, options);
    }
    if(!Number.isFinite(value)){
      return String(value);
    }
    return Number(value).toExponential(5);
  }
  const mean=arr=>arr.reduce((s,v)=>s+v,0)/arr.length;
  const missingDistributionWarnings=Object.create(null);
  function warnDistributionUnavailable(distribution,context){
    if(missingDistributionWarnings[distribution]){
      return;
    }
    missingDistributionWarnings[distribution]=true;
    const debugEnabled=typeof Shared.isDebugEnabled==='function' && Shared.isDebugEnabled();
    if(debugEnabled){
      console.warn('Debug: box stats distribution unavailable',{ distribution, helper:context?.helper||null, hasJStat:!!global.jStat });
    }else{
      console.warn(`Box plot statistics unavailable: ${distribution} CDF missing.`);
    }
  }
  function createUnavailableStatResult(base,message){
    return { available:false, message, ...base };
  }
  function tTest(a,b){
    const jStatLib=global.jStat;
    const cdf=jStatLib && jStatLib.studentt && typeof jStatLib.studentt.cdf==='function'
      ? jStatLib.studentt.cdf
      : null;
    if(!cdf){
      warnDistributionUnavailable('student-t',{ helper:'tTest' });
      return createUnavailableStatResult({ t:NaN, df:NaN, p:NaN },'Student-t distribution unavailable.');
    }
    const na=a.length, nb=b.length;
    const ma=mean(a), mb=mean(b);
    const va=a.reduce((s,v)=>s+Math.pow(v-ma,2),0)/(na-1||1);
    const vb=b.reduce((s,v)=>s+Math.pow(v-mb,2),0)/(nb-1||1);
    const se=Math.sqrt(va/na+vb/nb);
    const t=(ma-mb)/se;
    const df=Math.pow(va/na+vb/nb,2)/(Math.pow(va/na,2)/(na-1||1)+Math.pow(vb/nb,2)/(nb-1||1));
    const p=2*(1-cdf(Math.abs(t),df));
    return {t,df,p};
  }
  function tTestPaired(a,b){
    const jStatLib=global.jStat;
    const cdf=jStatLib && jStatLib.studentt && typeof jStatLib.studentt.cdf==='function'
      ? jStatLib.studentt.cdf
      : null;
    if(!cdf){
      warnDistributionUnavailable('student-t',{ helper:'tTestPaired' });
      return createUnavailableStatResult({ t:NaN, df:NaN, p:NaN },'Student-t distribution unavailable.');
    }
    const diffs=a.map((v,i)=>v-b[i]).filter(v=>!isNaN(v));
    const n=diffs.length;
    const md=mean(diffs);
    const sd=Math.sqrt(diffs.reduce((s,v)=>s+Math.pow(v-md,2),0)/(n-1||1));
    const t=md/(sd/Math.sqrt(n));
    const p=2*(1-cdf(Math.abs(t),n-1));
    return {t,df:n-1,p};
  }
  function rankArray(arr){ const sorted=arr.map((v,i)=>({v,i})).sort((a,b)=>a.v-b.v); const ranks=new Array(arr.length); let i=0; while(i<sorted.length){ let j=i; while(j<sorted.length && sorted[j].v===sorted[i].v) j++; const avg=(i+j-1)/2+1; for(let k=i;k<j;k++) ranks[sorted[k].i]=avg; i=j; } return ranks; }
  function mannWhitney(a,b){
    const jStatLib=global.jStat;
    const cdf=jStatLib && jStatLib.normal && typeof jStatLib.normal.cdf==='function'
      ? jStatLib.normal.cdf
      : null;
    if(!cdf){
      warnDistributionUnavailable('normal',{ helper:'mannWhitney' });
      return createUnavailableStatResult({ U:NaN, z:NaN, p:NaN },'Normal distribution unavailable.');
    }
    const all=[...a.map(v=>({v,g:0})),...b.map(v=>({v,g:1}))];
    all.sort((x,y)=>x.v-y.v);
    let rank=1;
    for(let idx=0;idx<all.length;idx++){
      let j=idx;
      while(j<all.length && all[j].v===all[idx].v){ j++; }
      const avg=(rank+(j-1))/2;
      for(let k=idx;k<j;k++){ all[k].rank=avg; }
      rank=j+1;
    }
    const Ra=all.filter(o=>o.g===0).reduce((s,o)=>s+o.rank,0);
    const Rb=all.filter(o=>o.g===1).reduce((s,o)=>s+o.rank,0);
    const na=a.length, nb=b.length;
    const Ua=Ra-na*(na+1)/2;
    const Ub=Rb-nb*(nb+1)/2;
    const U=Math.min(Ua,Ub);
    const mu=na*nb/2;
    const sigma=Math.sqrt(na*nb*(na+nb+1)/12);
    const z=(U-mu)/sigma;
    const p=2*(1-cdf(Math.abs(z),0,1));
    return {U,z,p};
  }
  function wilcoxonSignedRank(a,b){
    const jStatLib=global.jStat;
    const cdf=jStatLib && jStatLib.normal && typeof jStatLib.normal.cdf==='function'
      ? jStatLib.normal.cdf
      : null;
    if(!cdf){
      warnDistributionUnavailable('normal',{ helper:'wilcoxonSignedRank' });
      return createUnavailableStatResult({ W:NaN, z:NaN, p:NaN },'Normal distribution unavailable.');
    }
    const diffs=a.map((v,i)=>v-b[i]).filter(v=>v!==0);
    const abs=diffs.map(Math.abs);
    const ranks=rankArray(abs);
    let Wpos=0,Wneg=0;
    ranks.forEach((rk,i)=>{ if(diffs[i]>0) Wpos+=rk; else Wneg+=rk; });
    const W=Math.min(Wpos,Wneg);
    const nEff=ranks.length;
    const mu=nEff*(nEff+1)/4;
    const sigma=Math.sqrt(nEff*(nEff+1)*(2*nEff+1)/24);
    const z=(W-mu)/sigma;
    const p=2*(1-cdf(Math.abs(z),0,1));
    return {W,z,p};
  }
  function anova(groups){
    const jStatLib=global.jStat;
    const cdf=jStatLib && jStatLib.centralF && typeof jStatLib.centralF.cdf==='function'
      ? jStatLib.centralF.cdf
      : null;
    if(!cdf){
      warnDistributionUnavailable('central-F',{ helper:'anova' });
      return createUnavailableStatResult({ F:NaN, p:NaN, dfBetween:NaN, dfWithin:NaN },'F distribution unavailable.');
    }
    const k=groups.length;
    const n=groups.reduce((s,g)=>s+g.length,0);
    const grand=groups.reduce((s,g)=>s+mean(g)*g.length,0)/n;
    let ssBetween=0;
    let ssWithin=0;
    groups.forEach(g=>{
      const m=mean(g);
      ssBetween+=g.length*Math.pow(m-grand,2);
      ssWithin+=g.reduce((s,v)=>s+Math.pow(v-m,2),0);
    });
    const dfBetween=k-1;
    const dfWithin=n-k;
    const msBetween=ssBetween/dfBetween;
    const msWithin=ssWithin/dfWithin;
    const F=msBetween/msWithin;
    const p=1-cdf(F,dfBetween,dfWithin);
    return {F,p,dfBetween,dfWithin};
  }
  function kruskalWallis(groups){
    const jStatLib=global.jStat;
    const cdf=jStatLib && jStatLib.chisquare && typeof jStatLib.chisquare.cdf==='function'
      ? jStatLib.chisquare.cdf
      : null;
    if(!cdf){
      warnDistributionUnavailable('chi-square',{ helper:'kruskalWallis' });
      return createUnavailableStatResult({ H:NaN, p:NaN },'Chi-square distribution unavailable.');
    }
    const n=groups.reduce((s,g)=>s+g.length,0);
    const all=groups.flat();
    const ranks=rankArray(all);
    let idx=0;
    const R=groups.map(g=>{
      const r=ranks.slice(idx, idx+g.length).reduce((a,b)=>a+b,0);
      idx+=g.length;
      return r;
    });
    const H=(12/(n*(n+1)))*R.reduce((sum,ri,i)=>sum+Math.pow(ri,2)/groups[i].length,0)-3*(n+1);
    const df=groups.length-1;
    const p=1-cdf(H,df);
    return {H,p};
  }
  function computeWelchAnova(groups){
    const cleaned=(Array.isArray(groups)?groups:[]).map(group=>group.filter(Number.isFinite));
    const counts=cleaned.map(group=>group.length);
    const k=cleaned.length;
    if(k<2){
      return { ok:false, message:'Welch ANOVA requires at least two groups.' };
    }
    if(counts.some(n=>n<2)){
      return { ok:false, message:'Welch ANOVA needs at least two observations per group.' };
    }
    const means=cleaned.map(group=>group.reduce((sum,val)=>sum+val,0)/group.length);
    const variances=cleaned.map((group,idx)=>{
      const m=means[idx];
      const sumSq=group.reduce((sum,val)=>sum+Math.pow(val-m,2),0);
      const denom=Math.max(group.length-1,1);
      const variance=sumSq/denom;
      return variance>0?variance:Number.EPSILON;
    });
    const weights=variances.map((variance,idx)=>counts[idx]/variance);
    const weightSum=weights.reduce((sum,val)=>sum+val,0);
    if(!Number.isFinite(weightSum) || weightSum<=0){
      return { ok:false, message:'Unable to normalize Welch weights (degenerate variances).' };
    }
    const meanWeighted=weights.reduce((sum,val,idx)=>sum+val*means[idx],0)/weightSum;
    let between=0;
    let sumTerm=0;
    for(let idx=0;idx<k;idx++){
      const meanDiff=means[idx]-meanWeighted;
      between+=weights[idx]*meanDiff*meanDiff;
      const weightFrac=weights[idx]/weightSum;
      sumTerm+=Math.pow(1-weightFrac,2)/Math.max(counts[idx]-1,1);
    }
    const df1=k-1;
    const numerator=between/Math.max(df1,1);
    const correctionDenom=Math.pow(k,2)-1;
    const correction=correctionDenom!==0?1+(2*(k-2)/correctionDenom)*sumTerm:1;
    const F=correction>0?numerator/correction:NaN;
    const df2Den=3*sumTerm;
    const df2=df2Den>0?(Math.pow(k,2)-1)/df2Den:Number.POSITIVE_INFINITY;
    const p=Number.isFinite(F)?1-fcdf(F,df1,df2):1;
    console.debug('Debug: box welchAnova',{ k, df1, df2, F, p, weightSum, sumTerm });
    return {
      ok:Number.isFinite(F) && Number.isFinite(df2) && df2>0,
      F,
      p,
      df1,
      df2,
      means,
      counts,
      variances,
      footnote:`Welch ANOVA (df₁ = ${df1}, df₂ ≈ ${Number.isFinite(df2)?df2.toFixed(2):'∞'})`
    };
  }

  function normalQuantile(p){
    const clipped=Math.min(Math.max(p,Number.EPSILON),1-Number.EPSILON);
    const a=[-3.969683028665376e+01,2.209460984245205e+02,-2.759285104469687e+02,1.38357751867269e+02,-3.066479806614716e+01,2.506628277459239e+00];
    const b=[-5.447609879822406e+01,1.615858368580409e+02,-1.556989798598866e+02,6.680131188771972e+01,-1.328068155288572e+01];
    const c=[-7.784894002430293e-03,-3.223964580411365e-01,-2.400758277161838e+00,-2.549732539343734e+00,4.374664141464968e+00,2.938163982698783e+00];
    const d=[7.784695709041462e-03,3.224671290700398e-01,2.445134137142996e+00,3.754408661907416e+00];
    const plow=0.02425;
    const phigh=1-plow;
    let q,r;
    if(clipped<plow){
      q=Math.sqrt(-2*Math.log(clipped));
      return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    }
    if(clipped>phigh){
      q=Math.sqrt(-2*Math.log(1-clipped));
      return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    }
    q=clipped-0.5;
    r=q*q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4]+1);
  }

  function logGamma(z){
    const coeffs=[0.99999999999980993,676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-0.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7];
    if(z<0.5){
      return Math.log(Math.PI)-Math.log(Math.sin(Math.PI*z))-logGamma(1-z);
    }
    z-=1;
    let x=coeffs[0];
    for(let i=1;i<coeffs.length;i++){
      x+=coeffs[i]/(z+i);
    }
    const t=z+7.5;
    return 0.5*Math.log(2*Math.PI)+(z+0.5)*Math.log(t)-t+Math.log(x);
  }

  function betacf(x,a,b){
    const MAX_ITER=100;
    const EPS=1e-12;
    const FPMIN=Number.MIN_VALUE/EPS;
    let qab=a+b;
    let qap=a+1;
    let qam=a-1;
    let c=1;
    let d=1-qab*x/qap;
    if(Math.abs(d)<FPMIN) d=FPMIN;
    d=1/d;
    let h=d;
    for(let m=1;m<=MAX_ITER;m++){
      const m2=2*m;
      let aa=m*(b-m)*x/((qam+m2)*(a+m2));
      d=1+aa*d;
      if(Math.abs(d)<FPMIN) d=FPMIN;
      c=1+aa/c;
      if(Math.abs(c)<FPMIN) c=FPMIN;
      d=1/d;
      h*=d*c;
      aa=-(a+m)*(qab+m)*x/((a+m2)*(qap+m2));
      d=1+aa*d;
      if(Math.abs(d)<FPMIN) d=FPMIN;
      c=1+aa/c;
      if(Math.abs(c)<FPMIN) c=FPMIN;
      d=1/d;
      const del=d*c;
      h*=del;
      if(Math.abs(del-1)<EPS) break;
    }
    return h;
  }

  function regularizedIncompleteBeta(x,a,b){
    if(x<=0) return 0;
    if(x>=1) return 1;
    const bt=Math.exp(logGamma(a+b)-logGamma(a)-logGamma(b)+a*Math.log(x)+b*Math.log(1-x));
    if(x<(a+1)/(a+b+2)){
      return bt*betacf(x,a,b)/a;
    }
    return 1-bt*betacf(1-x,b,a)/b;
  }

  function fcdf(x,d1,d2){
    if(!Number.isFinite(x)||x<0){
      return 0;
    }
    const transformed=(d1*x)/(d1*x+d2);
    const result=regularizedIncompleteBeta(transformed,d1/2,d2/2);
    return Number.isFinite(result)?result:0;
  }

  function sampleArrayEvenly(values,limit){
    if(!Array.isArray(values) || !values.length){
      return [];
    }
    const maxSamples=Math.max(0,Math.floor(limit));
    if(!maxSamples){
      return [];
    }
    if(values.length<=maxSamples){
      return values.slice().filter(Number.isFinite);
    }
    if(maxSamples===1){
      const firstFinite=values.find(Number.isFinite);
      return Number.isFinite(firstFinite)?[Number(firstFinite)]:[];
    }
    const sample=[];
    const step=(values.length-1)/(maxSamples-1);
    for(let idx=0;idx<maxSamples;idx++){
      const target=Math.min(values.length-1,Math.round(idx*step));
      let candidate=Number(values[target]);
      if(!Number.isFinite(candidate)){
        let offset=1;
        while(!Number.isFinite(candidate) && (target-offset>=0 || target+offset<values.length)){
          if(target-offset>=0){
            const left=Number(values[target-offset]);
            if(Number.isFinite(left)){
              candidate=left;
              break;
            }
          }
          if(target+offset<values.length){
            const right=Number(values[target+offset]);
            if(Number.isFinite(right)){
              candidate=right;
              break;
            }
          }
          offset++;
        }
      }
      if(Number.isFinite(candidate)){
        sample.push(candidate);
      }
    }
    return sample;
  }

  function computeQQPoints(values,options){
    const maxSample=Number.isFinite(options?.maxSampleSize)
      ? Math.max(25,Math.floor(options.maxSampleSize))
      : ASSUMPTION_QQ_SAMPLE_LIMIT;
    const source=Array.isArray(values)?values:[];
    const baseValues=source.length>maxSample
      ? sampleArrayEvenly(source,maxSample)
      : source.slice().filter(Number.isFinite);
    if(baseValues.length<3){
      return [];
    }
    const sorted=baseValues.slice().sort((a,b)=>a-b);
    const n=sorted.length;
    const mean=sorted.reduce((sum,v)=>sum+v,0)/n;
    const variance=sorted.reduce((sum,v)=>{ const diff=v-mean; return sum+diff*diff; },0)/(n-1||1);
    const sd=Math.sqrt(variance)||0;
    if(sd===0){
      return [];
    }
    const sampleCount=Math.min(25,n);
    const points=[];
    for(let j=0;j<sampleCount;j++){
      const frac=(j+0.5)/sampleCount;
      const index=Math.min(n-1,Math.max(0,Math.round(frac*n-0.5)));
      const theoretical=normalQuantile((index+0.5)/n);
      const observed=(sorted[index]-mean)/sd;
      points.push({ theoretical, observed });
    }
    const sampled=source.length>maxSample;
    console.debug('Debug: box QQ points computed',{ sampleCount: points.length, sourceSize: source.length, sampled });
    return points;
  }

  function computeDagostino(values, summary){
    const series=Array.isArray(values)?values:[];
    const readySummary=summary && Number.isFinite(summary.count) && summary.count>0
      && Number.isFinite(summary.sum) && Number.isFinite(summary.sumSquares)
      && Number.isFinite(summary.sumCubes) && Number.isFinite(summary.sumFourth)
      ? summary
      : null;
    let n=readySummary ? readySummary.count : 0;
    let sum=readySummary ? readySummary.sum : 0;
    let sumSquares=readySummary ? readySummary.sumSquares : 0;
    let sumCubes=readySummary ? readySummary.sumCubes : 0;
    let sumFourth=readySummary ? readySummary.sumFourth : 0;
    if(!readySummary){
      for(let idx=0;idx<series.length;idx++){
        const value=Number(series[idx]);
        if(!Number.isFinite(value)){
          continue;
        }
        n+=1;
        sum+=value;
        const square=value*value;
        sumSquares+=square;
        sumCubes+=square*value;
        sumFourth+=square*square;
      }
    }
    if(n<8){
      console.debug('Debug: box dagostino insufficient sample',{ n });
      return { method:'dagostino', sampleSize:n, statistic:NaN, pValue:NaN, passed:null, reason:'Sample size < 8' };
    }
    const meanVal=sum/n;
    const m2=sumSquares-(sum*sum)/n;
    const meanSquared=meanVal*meanVal;
    const meanCubed=meanSquared*meanVal;
    const meanFourth=meanSquared*meanSquared;
    const m3=sumCubes-3*meanVal*sumSquares+2*n*meanCubed;
    const m4=sumFourth-4*meanVal*sumCubes+6*meanSquared*sumSquares-3*n*meanFourth;
    const s2=m2/(n-1||1);
    const s=Math.sqrt(Math.max(s2,0));
    if(!Number.isFinite(s)||s===0){
      console.debug('Debug: box dagostino zero variance',{ n });
      return { method:'dagostino', sampleSize:n, statistic:0, pValue:1, passed:true, reason:'Zero variance' };
    }
    const s3=Math.pow(s,3);
    const s4=Math.pow(s,4);
    const g1=(n*m3)/((n-1)*(n-2)*s3);
    const g2=((n*(n+1)*m4)/((n-1)*(n-2)*(n-3)*s4))-(3*Math.pow(n-1,2))/((n-2)*(n-3));
    const mu2=6*(n-2)/((n+1)*(n+3));
    const gamma2=36*(n-7)*(n*n+2*n-5)/((n-2)*(n+5)*(n+7)*(n+9));
    const w2=Math.sqrt(2*gamma2+4)-1;
    const alpha=Math.sqrt(2/(w2-1));
    const delta=1/Math.sqrt(Math.log(w2));
    const z1=delta*Math.asinh(g1/(alpha*Math.sqrt(mu2)));
    const mu1g2=-6/(n+1);
    const mu2g2=24*n*(n-2)*(n-3)/(Math.pow(n+1,2)*(n+3)*(n+5));
    const gamma1g2=(6*(n*n-5*n+2)/((n+7)*(n+9)))*Math.sqrt(6*(n+3)*(n+5)/(n*(n-2)*(n-3)));
    const gamma2g2=36*(15*Math.pow(n,6)-36*Math.pow(n,5)-628*Math.pow(n,4)+982*Math.pow(n,3)+5777*Math.pow(n,2)-6402*n+900)/(n*(n-3)*(n-2)*(n+7)*(n+9)*(n+11)*(n+13));
    const A=6+(8/gamma2g2)*(2/gamma2g2+gamma1g2*gamma1g2);
    const term=(g2-mu1g2)/Math.sqrt(mu2g2)*Math.sqrt(2/(A-4));
    const base=Math.pow((1-2/A)/(1+term),1/3);
    const z2=Math.sqrt(9*A/2)*(1-2/(9*A)-base);
    const statistic=z1*z1+z2*z2;
    const pValue=Math.exp(-statistic/2);
    const passed=Number.isFinite(pValue)?pValue>=ASSUMPTION_ALPHA:null;
    console.debug('Debug: box dagostino metrics',{ n, g1, g2, z1, z2, statistic, pValue, passed });
    return { method:'dagostino', sampleSize:n, statistic, pValue, passed, z1, z2, g1, g2 };
  }

  function computeVarianceDiagnostics(groups,labels,options){
    const summaries=[];
    let totalN=0;
    let grandSum=0;
    const sparklineValues=[];
    const summaryList=Array.isArray(options?.summaries)?options.summaries:null;
    for(let idx=0; idx<groups.length; idx++){
      const group=Array.isArray(groups[idx])?groups[idx]:[];
      const label=labels[idx];
      console.debug('Debug: box variance group summary',{ index: idx, label, size: group.length });
      if(!group.length){
        summaries.push({ count:0, sum:0, sumSquares:0, mean:0, median:NaN });
        sparklineValues.push({ label, value: 0 });
        continue;
      }
      const summaryRef=summaryList && summaryList[idx];
      const median=Number.isFinite(summaryRef?.median)
        ? summaryRef.median
        : quantileFromUnsorted(group,0.5);
      let count=0;
      let sum=0;
      let sumSquares=0;
      for(let j=0;j<group.length;j++){
        const value=Number(group[j]);
        if(!Number.isFinite(value)){
          continue;
        }
        const deviation=Math.abs(value-(Number.isFinite(median)?median:0));
        sum+=deviation;
        sumSquares+=deviation*deviation;
        count++;
      }
      totalN+=count;
      grandSum+=sum;
      const mean=count?sum/count:0;
      sparklineValues.push({ label, value: mean });
      summaries.push({ count, sum, sumSquares, mean, median });
    }
    const k=summaries.length;
    if(k<2){
      return { method:'brown-forsythe', statistic:NaN, pValue:NaN, passed:null, df1:0, df2:0, sparkline:[], reason:'Need >=2 groups' };
    }
    if(totalN<=k){
      return { method:'brown-forsythe', statistic:NaN, pValue:NaN, passed:null, df1:k-1, df2:Math.max(totalN-k,0), sparkline:[], reason:'Insufficient observations' };
    }
    const grandMean=grandSum/totalN;
    let ssBetween=0;
    let ssWithin=0;
    summaries.forEach(summary=>{
      if(!summary.count){
        return;
      }
      const mean=summary.mean;
      ssBetween+=summary.count*Math.pow(mean-grandMean,2);
      const within=summary.sumSquares-(summary.sum*summary.sum)/(summary.count||1);
      if(Number.isFinite(within)){
        ssWithin+=within;
      }
    });
    const df1=k-1;
    const df2=totalN-k;
    const msBetween=ssBetween/(df1||1);
    const msWithin=ssWithin/(df2||1);
    const F=msWithin===0?Infinity:msBetween/msWithin;
    const pValue=Number.isFinite(F)?1-fcdf(F,df1,df2):0;
    const passed=Number.isFinite(pValue)?pValue>=ASSUMPTION_ALPHA:null;
    console.debug('Debug: box variance diagnostics',{ df1, df2, F, pValue, passed, grandMean });
    return { method:'brown-forsythe', statistic:F, pValue, passed, df1, df2, sparkline:sparklineValues };
  }

  function countFiniteValues(values){
    if(!Array.isArray(values) || !values.length){
      return 0;
    }
    let count=0;
    for(let idx=0; idx<values.length; idx++){
      if(Number.isFinite(values[idx])){
        count++;
      }
    }
    return count;
  }

  function computeAssumptionDiagnostics(groups,labels,options){
    const diagnostics={
      normalityMethod:'dagostino',
      varianceMethod:'brown-forsythe',
      alpha:ASSUMPTION_ALPHA,
      groups:[],
      warnings:[]
    };
    const qqSampleLimit=Number.isFinite(options?.qqSampleLimit)
      ? Math.max(25,Math.floor(options.qqSampleLimit))
      : ASSUMPTION_QQ_SAMPLE_LIMIT;
    const summaryList=Array.isArray(options?.summaries)?options.summaries:null;
    const failReasons=[];
    let normalityFailures=0;
    groups.forEach((group,idx)=>{
      const label=labels[idx] || `Group ${idx + 1}`;
      const summaryRef=summaryList && summaryList[idx];
      const dagostino=computeDagostino(group,summaryRef);
      const sampleSize=Number.isFinite(dagostino?.sampleSize)
        ? dagostino.sampleSize
        : Number.isFinite(summaryRef?.count)
          ? summaryRef.count
          : countFiniteValues(group);
      const qqPoints=sampleSize>0
        ? computeQQPoints(group,{ maxSampleSize: qqSampleLimit })
        : [];
      diagnostics.groups.push({
        label,
        size:sampleSize,
        normality:dagostino,
        qqPoints
      });
      if(dagostino && dagostino.passed===false){
        const formatted=Number.isFinite(dagostino.pValue)?formatP(dagostino.pValue):'—';
        failReasons.push(`${label} failed normality (p = ${formatted})`);
        normalityFailures++;
      }
    });
    const variance=computeVarianceDiagnostics(groups,labels,{ summaries: summaryList });
    diagnostics.variance=variance;
    const varianceConcern=variance && variance.passed===false;
    if(variance && variance.passed===false){
      const formatted=Number.isFinite(variance.pValue)?formatP(variance.pValue):'—';
      failReasons.push(`Variance equality violated (p = ${formatted})`);
    }
    diagnostics.warnings=failReasons;
    diagnostics.normalityFailures=normalityFailures;
    diagnostics.varianceConcern=!!varianceConcern;
    diagnostics.recommendWelch=!!varianceConcern && normalityFailures===0;
    diagnostics.recommendNonParametric=normalityFailures>0;
    console.debug('Debug: box assumption diagnostics',{ failCount: failReasons.length, variancePassed: variance?.passed, normalityFailures, recommendWelch: diagnostics.recommendWelch });
    return diagnostics;
  }

  function createAssumptionBadge(result,label){
    const badge=document.createElement('span');
    badge.className='assumption-badge';
    badge.textContent=label || (result ? 'PASS' : result===false ? 'FAIL' : 'N/A');
    badge.dataset.result=result===false?'fail':result?'pass':'na';
    return badge;
  }

  function createQQSparkline(points){
    const width=104;
    const height=40;
    const padding=6;
    const svg=document.createElementNS(NS,'svg');
    svg.classList.add('assumption-sparkline','assumption-sparkline--qq');
    svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
    svg.setAttribute('width',String(width));
    svg.setAttribute('height',String(height));
    svg.setAttribute('preserveAspectRatio','none');
    if(!points || !points.length){
      return svg;
    }
    const values=points.reduce((acc,p)=>{
      acc.push(p.theoretical);
      acc.push(p.observed);
      return acc;
    },[]);
    let min=Math.min(...values);
    let max=Math.max(...values);
    if(!Number.isFinite(min) || !Number.isFinite(max)){
      return svg;
    }
    if(min===max){
      min-=1;
      max+=1;
    }
    const scale=v=>(v-min)/(max-min);
    const xCoord=v=>padding+scale(v)*(width-padding*2);
    const yCoord=v=>height-padding-scale(v)*(height-padding*2);
    const identity=document.createElementNS(NS,'line');
    identity.setAttribute('x1',String(xCoord(min)));
    identity.setAttribute('y1',String(yCoord(min)));
    identity.setAttribute('x2',String(xCoord(max)));
    identity.setAttribute('y2',String(yCoord(max)));
    identity.setAttribute('stroke','#cccccc');
    identity.setAttribute('stroke-width','1');
    svg.appendChild(identity);
    const path=document.createElementNS(NS,'polyline');
    const sorted=points.slice().sort((a,b)=>a.theoretical-b.theoretical);
    path.setAttribute('fill','none');
    path.setAttribute('stroke','#1d78c8');
    path.setAttribute('stroke-width','1.5');
    path.setAttribute('points',sorted.map(p=>`${xCoord(p.theoretical)},${yCoord(p.observed)}`).join(' '));
    svg.appendChild(path);
    return svg;
  }

  function createResidualSparkline(values){
    const width=104;
    const height=40;
    const padding=6;
    const svg=document.createElementNS(NS,'svg');
    svg.classList.add('assumption-sparkline','assumption-sparkline--variance');
    svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
    svg.setAttribute('width',String(width));
    svg.setAttribute('height',String(height));
    svg.setAttribute('preserveAspectRatio','none');
    if(!values || !values.length){
      return svg;
    }
    const data=values.map(v=>Number(v.value)).filter(Number.isFinite);
    if(!data.length){
      return svg;
    }
    const min=Math.min(...data);
    const max=Math.max(...data);
    const yScale=v=>height-padding-((v-min)/(max-min || 1))*(height-padding*2);
    const xScale=idx=>padding+(idx/(data.length-1 || 1))*(width-padding*2);
    const polyline=document.createElementNS(NS,'polyline');
    polyline.setAttribute('fill','none');
    polyline.setAttribute('stroke','#8e44ad');
    polyline.setAttribute('stroke-width','1.5');
    polyline.setAttribute('points',data.map((v,idx)=>`${xScale(idx)},${yScale(v)}`).join(' '));
    svg.appendChild(polyline);
    return svg;
  }

  function renderAssumptionSection(container,diagnostics){
    if(!container){
      return;
    }
    container.innerHTML='';
    const section=document.createElement('div');
    section.className='stats-assumption-section';
    const heading=document.createElement('div');
    heading.className='stats-table-lead';
    heading.textContent='Assumption Checks';
    section.appendChild(heading);
    if(!diagnostics){
      const message=document.createElement('div');
      message.className='assumption-message';
      message.textContent='Assumption metrics will appear once groups are selected.';
      section.appendChild(message);
      container.appendChild(section);
      return;
    }
    const table=document.createElement('table');
    table.className='stats-table stats-assumption-table';
    table.setAttribute('aria-label','Assumption checks');

    const colgroup=document.createElement('colgroup');
    const colGroup=document.createElement('col');
    colGroup.style.width='220px';
    colgroup.appendChild(colGroup);
    const colNormality=document.createElement('col');
    colNormality.style.width='110px';
    colgroup.appendChild(colNormality);
    const colP=document.createElement('col');
    colP.style.width='120px';
    colgroup.appendChild(colP);
    const colQq=document.createElement('col');
    colQq.style.width='132px';
    colgroup.appendChild(colQq);
    table.appendChild(colgroup);

    const thead=document.createElement('thead');
    const headerRow=document.createElement('tr');
    ;[
      { label:'Group', align:'left' },
      { label:'Normality', align:'center' },
      { label:'p-value', align:'right' },
      { label:'QQ', align:'center' }
    ].forEach(col=>{
      const th=document.createElement('th');
      th.className=`stats-table__cell stats-table__header stats-table__cell--${col.align}`;
      th.textContent=col.label;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);
    const tbody=document.createElement('tbody');
    diagnostics.groups.forEach(group=>{
      const tr=document.createElement('tr');
      const labelCell=document.createElement('td');
      labelCell.className='stats-table__cell stats-table__cell--left stats-assumption__group';
      labelCell.textContent=group.label;
      tr.appendChild(labelCell);
      const badgeCell=document.createElement('td');
      badgeCell.className='stats-table__cell stats-table__cell--center stats-assumption__badge';
      badgeCell.appendChild(createAssumptionBadge(group.normality?.passed));
      tr.appendChild(badgeCell);
      const pCell=document.createElement('td');
      const pValue=group.normality?.pValue;
      pCell.className='stats-table__cell stats-table__cell--left stats-assumption__pvalue';
      pCell.textContent=Number.isFinite(pValue)?formatP(pValue):'—';
      tr.appendChild(pCell);
      const sparkCell=document.createElement('td');
      sparkCell.className='stats-table__cell stats-table__cell--center stats-assumption__qq';
      sparkCell.appendChild(createQQSparkline(group.qqPoints));
      tr.appendChild(sparkCell);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    section.appendChild(table);
    if(diagnostics.variance){
      const varianceRow=document.createElement('div');
      varianceRow.className='assumption-variance-row';
      const label=document.createElement('span');
      label.textContent='Variance test:';
      label.className='assumption-variance-label';
      varianceRow.appendChild(label);
      varianceRow.appendChild(createAssumptionBadge(diagnostics.variance.passed, diagnostics.variance.passed===false?'FAIL':'PASS'));
      const detail=document.createElement('span');
      const pValue=diagnostics.variance?.pValue;
      detail.textContent=` p = ${Number.isFinite(pValue)?formatP(pValue):'—'}`;
      detail.className='assumption-variance-detail';
      varianceRow.appendChild(detail);
      if(Array.isArray(diagnostics.variance.sparkline) && diagnostics.variance.sparkline.length){
        const spark=createResidualSparkline(diagnostics.variance.sparkline);
        varianceRow.appendChild(spark);
      }
      section.appendChild(varianceRow);
    }
    if(Array.isArray(diagnostics.warnings) && diagnostics.warnings.length){
      const warningList=document.createElement('div');
      warningList.className='assumption-warning-list';
      diagnostics.warnings.forEach(msg=>{
        const warn=document.createElement('div');
        warn.className='assumption-warning';
        warn.textContent=msg;
        warningList.appendChild(warn);
      });
      section.appendChild(warningList);
    }
    if(diagnostics.parametricOverrideActive){
      const override=document.createElement('div');
      override.className='assumption-info';
      override.textContent='Parametric results remain visible despite failed assumptions; consider alternative tests if violations persist.';
      section.appendChild(override);
    }
    if(diagnostics.appliedVariant==='welch'){
      const info=document.createElement('div');
      info.className='assumption-info';
      info.textContent='Welch ANOVA with Games–Howell post-hoc applied to address unequal variances.';
      section.appendChild(info);
    } else if(diagnostics.recommendWelch){
      const info=document.createElement('div');
      info.className='assumption-info';
      info.textContent='Welch ANOVA is available to handle unequal variances without switching to non-parametric tests.';
      section.appendChild(info);
    }
    container.appendChild(section);
  }

  function serializeAssumptions(diag){
    if(!diag){
      return null;
    }
    return {
      normalityMethod:diag.normalityMethod,
      varianceMethod:diag.variance?.method || null,
      alpha:diag.alpha,
      normalityFailures:Number.isFinite(diag.normalityFailures)?diag.normalityFailures:0,
      varianceConcern:!!diag.varianceConcern,
      recommendWelch:!!diag.recommendWelch,
      appliedVariant:diag.appliedVariant || null,
      appliedTest:diag.appliedTest || null,
      groups:diag.groups.map(g=>({
        label:g.label,
        size:g.size,
        statistic:Number.isFinite(g.normality?.statistic)?g.normality.statistic:null,
        pValue:Number.isFinite(g.normality?.pValue)?g.normality.pValue:null,
        passed:g.normality?.passed
      })),
      variance:diag.variance?{
        statistic:Number.isFinite(diag.variance.statistic)?diag.variance.statistic:null,
        pValue:Number.isFinite(diag.variance.pValue)?diag.variance.pValue:null,
        passed:diag.variance.passed,
        df1:diag.variance.df1,
        df2:diag.variance.df2
      }:null,
      warnings:Array.isArray(diag.warnings)?diag.warnings.slice():[],
      recommendNonParametric:!!diag.recommendNonParametric
    };
  }


  function parsePairString(str,traces){ return str.split(/[\n,]+/).map(p=>p.trim()).filter(p=>p).map(p=>{ const [a,b]=p.split('-').map(s=>s.trim()); const ai=isNaN(parseInt(a))?traces.findIndex(t=>t.name===a):parseInt(a)-1; const bi=isNaN(parseInt(b))?traces.findIndex(t=>t.name===b):parseInt(b)-1; return (ai>=0&&bi>=0)?{ai,bi}:null; }).filter(Boolean); }
  function ensureGroupedStatsDefaults(){
    if(!state.groupedStats || typeof state.groupedStats !== 'object'){
      state.groupedStats = { analysis: 'twoWayAnova' };
    }
    const allowed = new Set(['twoWayAnova','twoWayMixed','threeWayAnova','threeWayMixed','rowTTests']);
    if(!allowed.has(state.groupedStats.analysis)){
      state.groupedStats.analysis = 'twoWayAnova';
      console.debug('Debug: grouped stats analysis reset to default');
    }
  }
  function formatStatNumber(value, digits){
    const places = Number.isInteger(digits) ? digits : 4;
    if(!Number.isFinite(value)){
      return '—';
    }
    return value.toFixed(places);
  }
  function prepareGroupedStatsData(traces, helpers){
    ensureGroupedDefaults();
    ensureGroupedStatsDefaults();
    const hotInstance = state.hot;
    const groups = Array.isArray(state.grouped?.groups) ? state.grouped.groups : [];
    const groupsCount = groups.length;
    const replicatesRaw = Number(state.grouped?.replicatesPerGroup);
    const conditionsCount = Number.isFinite(replicatesRaw) && replicatesRaw >= 1 ? Math.round(replicatesRaw) : 1;
    const axisLabelsSource = Array.isArray(helpers?.axisLabels) && helpers.axisLabels.length >= conditionsCount
      ? helpers.axisLabels
      : (Array.isArray(state.lastAxisLabels) && state.lastAxisLabels.length >= conditionsCount ? state.lastAxisLabels : []);
    const conditionLabels = [];
    for(let i = 0; i < conditionsCount; i++){
      const rawLabel = axisLabelsSource[i];
      const trimmed = typeof rawLabel === 'string' ? rawLabel.trim() : '';
      conditionLabels.push(trimmed || `Condition ${i + 1}`);
    }
    if(!hotInstance || typeof hotInstance.getData !== 'function'){
      console.debug('Debug: prepareGroupedStatsData missing hot instance');
      return { ok: false, message: 'Table data unavailable for grouped analysis.', groupsCount, conditionsCount, groupLabels: [], conditionLabels, rows: [], cellData: [], rowsWithData: 0, totalRows: 0, partialRowsSkipped: 0 };
    }
    const tableData = hotInstance.getData();
    const normalizedGroups = groups.map((name, idx)=>{
      const trimmed = typeof name === 'string' ? name.trim() : '';
      return trimmed || `Group ${idx + 1}`;
    });
    if(!groupsCount){
      return { ok: false, message: 'Add at least one group to run grouped analyses.', groupsCount, conditionsCount, groupLabels: normalizedGroups, conditionLabels, rows: [], cellData: [], rowsWithData: 0, totalRows: 0, partialRowsSkipped: 0 };
    }
    const rows = [];
    let candidateRows = 0;
    for(let r = 1; r < tableData.length; r++){
      const row = tableData[r];
      if(!row) continue;
      let rowHasAny = false;
      let rowComplete = true;
      const entry = Array.from({ length: groupsCount }, () => Array(conditionsCount).fill(null));
      for(let gIdx = 0; gIdx < groupsCount; gIdx++){
        for(let cIdx = 0; cIdx < conditionsCount; cIdx++){
          const colIndex = gIdx * conditionsCount + cIdx;
          const rawValue = Array.isArray(row) ? row[colIndex] : undefined;
          const parsed = typeof rawValue === 'number' ? rawValue : parseFloat(rawValue);
          if(Number.isFinite(parsed)){
            entry[gIdx][cIdx] = parsed;
            rowHasAny = true;
          }else{
            rowComplete = false;
          }
        }
      }
      if(rowHasAny){
        candidateRows++;
      }
      if(rowHasAny && rowComplete){
        rows.push(entry);
      }
    }
    if(!rows.length){
      return {
        ok: false,
        message: 'Enter complete rows (no missing values) to run grouped analyses.',
        groupsCount,
        conditionsCount,
        groupLabels: normalizedGroups,
        conditionLabels,
        rows: [],
        cellData: [],
        rowsWithData: 0,
        totalRows: candidateRows,
        partialRowsSkipped: Math.max(0, candidateRows)
      };
    }
    const cellData = Array.from({ length: groupsCount }, () => Array.from({ length: conditionsCount }, () => []));
    rows.forEach((rowEntry, rowIdx) => {
      for(let gIdx = 0; gIdx < groupsCount; gIdx++){
        for(let cIdx = 0; cIdx < conditionsCount; cIdx++){
          const value = rowEntry[gIdx][cIdx];
          cellData[gIdx][cIdx].push(value);
        }
      }
    });
    const info = {
      ok: true,
      groupsCount,
      conditionsCount,
      groupLabels: normalizedGroups,
      conditionLabels,
      rows,
      cellData,
      rowsWithData: rows.length,
      totalRows: candidateRows,
      partialRowsSkipped: Math.max(0, candidateRows - rows.length)
    };
    console.debug('Debug: grouped stats dataset summary', {
      groups: info.groupsCount,
      conditions: info.conditionsCount,
      rowsWithData: info.rowsWithData,
      partialRowsSkipped: info.partialRowsSkipped
    });
    return info;
  }
  function collectGroupedMomentInfo(data){
    const I = data.groupsCount;
    const J = data.conditionsCount;
    const K = data.rowsWithData;
    if(I === 0 || J === 0 || K === 0){
      return { ok: false, message: 'Insufficient data for grouped statistics.', detail: { groups: I, conditions: J, rows: K } };
    }
    const cellMeans = Array.from({ length: I }, () => Array(J).fill(0));
    const totalsByGroup = new Array(I).fill(0);
    const totalsByCondition = new Array(J).fill(0);
    let grandTotal = 0;
    let sse = 0;
    let balanced = true;
    let mismatch = null;
    for(let i = 0; i < I; i++){
      for(let j = 0; j < J; j++){
        const arr = data.cellData[i][j];
        if(arr.length !== K){
          balanced = false;
          mismatch = { groupIndex: i, conditionIndex: j, count: arr.length, expected: K };
        }
        const sum = arr.reduce((acc, val)=>acc + val, 0);
        const mean = arr.length ? sum / arr.length : 0;
        cellMeans[i][j] = mean;
        totalsByGroup[i] += sum;
        totalsByCondition[j] += sum;
        grandTotal += sum;
        sse += arr.reduce((acc, val)=>acc + Math.pow(val - mean, 2), 0);
      }
    }
    if(!balanced){
      console.debug('Debug: grouped stats imbalance detected', mismatch);
      return { ok: false, message: 'Each group/condition combination must contain the same number of complete rows.', detail: mismatch };
    }
    const N = I * J * K;
    const grandMean = grandTotal / N;
    const meanByGroup = totalsByGroup.map(sum => sum / (J * K));
    const meanByCondition = totalsByCondition.map(sum => sum / (I * K));
    let ssa = 0;
    for(let i = 0; i < I; i++){
      ssa += Math.pow(meanByGroup[i] - grandMean, 2);
    }
    ssa *= J * K;
    let ssb = 0;
    for(let j = 0; j < J; j++){
      ssb += Math.pow(meanByCondition[j] - grandMean, 2);
    }
    ssb *= I * K;
    let ssab = 0;
    for(let i = 0; i < I; i++){
      for(let j = 0; j < J; j++){
        ssab += Math.pow(cellMeans[i][j] - meanByGroup[i] - meanByCondition[j] + grandMean, 2);
      }
    }
    ssab *= K;
    const subjectMeans = new Array(K).fill(0);
    const asMeans = Array.from({ length: I }, () => Array(K).fill(0));
    const bsMeans = Array.from({ length: J }, () => Array(K).fill(0));
    let sstotal = 0;
    for(let k = 0; k < K; k++){
      let subjectSum = 0;
      for(let i = 0; i < I; i++){
        let rowSumForGroup = 0;
        for(let j = 0; j < J; j++){
          const value = data.rows[k][i][j];
          subjectSum += value;
          rowSumForGroup += value;
          sstotal += Math.pow(value - grandMean, 2);
        }
        asMeans[i][k] = rowSumForGroup / J;
      }
      subjectMeans[k] = subjectSum / (I * J);
    }
    for(let j = 0; j < J; j++){
      for(let k = 0; k < K; k++){
        let rowSumForCondition = 0;
        for(let i = 0; i < I; i++){
          rowSumForCondition += data.rows[k][i][j];
        }
        bsMeans[j][k] = rowSumForCondition / I;
      }
    }
    return {
      ok: true,
      I,
      J,
      K,
      cellMeans,
      meanByGroup,
      meanByCondition,
      subjectMeans,
      asMeans,
      bsMeans,
      grandMean,
      ssa,
      ssb,
      ssab,
      sse,
      sstotal
    };
  }
  function analyzeTwoWayAnova(data){
    const base = collectGroupedMomentInfo(data);
    if(!base.ok){
      return { ok: false, message: base.message };
    }
    const jStatLib = global.jStat;
    if(!jStatLib){
      return { ok: false, message: 'Statistics unavailable (jStat missing).' };
    }
    const { I, J, K, ssa, ssb, ssab, sse } = base;
    if(I < 2 || J < 2){
      return { ok: false, message: 'Two-way ANOVA requires at least two groups and two conditions.' };
    }
    if(K < 2){
      return { ok: false, message: 'Two-way ANOVA requires at least two complete rows.' };
    }
    const dfA = I - 1;
    const dfB = J - 1;
    const dfAB = (I - 1) * (J - 1);
    const dfError = I * J * (K - 1);
    if(dfError <= 0){
      return { ok: false, message: 'Two-way ANOVA requires at least two replicates per group/condition combination.' };
    }
    const msa = ssa / dfA;
    const msb = ssb / dfB;
    const msab = ssab / dfAB;
    const mse = sse / dfError;
    const fA = mse > 0 ? msa / mse : NaN;
    const fB = mse > 0 ? msb / mse : NaN;
    const fAB = mse > 0 ? msab / mse : NaN;
    const pA = Number.isFinite(fA) ? 1 - jStatLib.centralF.cdf(fA, dfA, dfError) : NaN;
    const pB = Number.isFinite(fB) ? 1 - jStatLib.centralF.cdf(fB, dfB, dfError) : NaN;
    const pAB = Number.isFinite(fAB) ? 1 - jStatLib.centralF.cdf(fAB, dfAB, dfError) : NaN;
    console.debug('Debug: two-way ANOVA stats',{ dfA, dfB, dfAB, dfError, fA, fB, fAB });
    return {
      ok: true,
      caption: 'Two-way ANOVA',
      columns: [
        { key: 'source', label: 'Source', align: 'left' },
        { key: 'df', label: 'df', align: 'right' },
        { key: 'ss', label: 'SS', align: 'right' },
        { key: 'ms', label: 'MS', align: 'right' },
        { key: 'f', label: 'F', align: 'right' },
        { key: 'p', label: 'P value', align: 'right' }
      ],
      rows: [
        { source: 'Group', df: String(dfA), ss: formatStatNumber(ssa), ms: formatStatNumber(msa), f: formatStatNumber(fA), p: formatP(pA) },
        { source: 'Condition', df: String(dfB), ss: formatStatNumber(ssb), ms: formatStatNumber(msb), f: formatStatNumber(fB), p: formatP(pB) },
        { source: 'Group × Condition', df: String(dfAB), ss: formatStatNumber(ssab), ms: formatStatNumber(msab), f: formatStatNumber(fAB), p: formatP(pAB) },
        { source: 'Error', df: String(dfError), ss: formatStatNumber(sse), ms: formatStatNumber(mse), f: '—', p: '—' }
      ],
      options:{ fileName:'box-two-way-anova', contextLabel:'box-grouped-anova2' },
      footnotes: ['F-tests use the pooled within-cell error term.'],
      diagnostics: { dfA, dfB, dfAB, dfError }
    };
  }
  function analyzeTwoWayMixed(data){
    const base = collectGroupedMomentInfo(data);
    if(!base.ok){
      return { ok: false, message: base.message };
    }
    const jStatLib = global.jStat;
    if(!jStatLib){
      return { ok: false, message: 'Statistics unavailable (jStat missing).' };
    }
    const { I, J, K, ssa, ssb, ssab, sse, meanByGroup, meanByCondition, subjectMeans, asMeans, bsMeans, grandMean } = base;
    if(I < 2 || J < 2 || K < 2){
      return { ok: false, message: 'Two-way mixed model requires at least two groups, two conditions, and two complete rows.' };
    }
    const dfA = I - 1;
    const dfB = J - 1;
    const dfS = K - 1;
    const dfAS = (I - 1) * (K - 1);
    const dfBS = (J - 1) * (K - 1);
    const dfAB = (I - 1) * (J - 1);
    const dfABS = (I - 1) * (J - 1) * (K - 1);
    if(dfAS <= 0 || dfBS <= 0 || dfABS <= 0){
      return { ok: false, message: 'Two-way mixed model requires at least two rows to estimate error terms.' };
    }
    let sss = 0;
    for(let k = 0; k < K; k++){
      sss += Math.pow(subjectMeans[k] - grandMean, 2);
    }
    sss *= I * J;
    let ssas = 0;
    for(let i = 0; i < I; i++){
      for(let k = 0; k < K; k++){
        const value = asMeans[i][k] - meanByGroup[i] - subjectMeans[k] + grandMean;
        ssas += Math.pow(value, 2);
      }
    }
    ssas *= J;
    let ssbs = 0;
    for(let j = 0; j < J; j++){
      for(let k = 0; k < K; k++){
        const value = bsMeans[j][k] - meanByCondition[j] - subjectMeans[k] + grandMean;
        ssbs += Math.pow(value, 2);
      }
    }
    ssbs *= I;
    let ssabs = 0;
    for(let k = 0; k < K; k++){
      for(let i = 0; i < I; i++){
        for(let j = 0; j < J; j++){
          const term = data.rows[k][i][j]
            - base.cellMeans[i][j]
            - asMeans[i][k]
            - bsMeans[j][k]
            + meanByGroup[i]
            + meanByCondition[j]
            + subjectMeans[k]
            - grandMean;
          ssabs += Math.pow(term, 2);
        }
      }
    }
    const msa = ssa / dfA;
    const msas = ssas / dfAS;
    const msb = ssb / dfB;
    const msbs = ssbs / dfBS;
    const msab = ssab / dfAB;
    const msabs = ssabs / dfABS;
    const fA = msas > 0 ? msa / msas : NaN;
    const fB = msbs > 0 ? msb / msbs : NaN;
    const fAB = msabs > 0 ? msab / msabs : NaN;
    const pA = Number.isFinite(fA) ? 1 - jStatLib.centralF.cdf(fA, dfA, dfAS) : NaN;
    const pB = Number.isFinite(fB) ? 1 - jStatLib.centralF.cdf(fB, dfB, dfBS) : NaN;
    const pAB = Number.isFinite(fAB) ? 1 - jStatLib.centralF.cdf(fAB, dfAB, dfABS) : NaN;
    console.debug('Debug: two-way mixed stats',{ dfA, dfAS, dfB, dfBS, dfAB, dfABS, fA, fB, fAB });
    return {
      ok: true,
      caption: 'Two-way Mixed Model',
      columns: [
        { key: 'source', label: 'Source', align: 'left' },
        { key: 'df', label: 'df', align: 'right' },
        { key: 'ss', label: 'SS', align: 'right' },
        { key: 'ms', label: 'MS', align: 'right' },
        { key: 'f', label: 'F', align: 'right' },
        { key: 'p', label: 'P value', align: 'right' }
      ],
      rows: [
        { source: 'Group', df: String(dfA), ss: formatStatNumber(ssa), ms: formatStatNumber(msa), f: formatStatNumber(fA), p: formatP(pA) },
        { source: 'Condition', df: String(dfB), ss: formatStatNumber(ssb), ms: formatStatNumber(msb), f: formatStatNumber(fB), p: formatP(pB) },
        { source: 'Group × Condition', df: String(dfAB), ss: formatStatNumber(ssab), ms: formatStatNumber(msab), f: formatStatNumber(fAB), p: formatP(pAB) },
        { source: 'Row (random)', df: String(dfS), ss: formatStatNumber(sss), ms: formatStatNumber(dfS ? sss / dfS : NaN), f: '—', p: '—' },
        { source: 'Group × Row', df: String(dfAS), ss: formatStatNumber(ssas), ms: formatStatNumber(msas), f: '—', p: '—' },
        { source: 'Condition × Row', df: String(dfBS), ss: formatStatNumber(ssbs), ms: formatStatNumber(msbs), f: '—', p: '—' },
        { source: 'Group × Condition × Row', df: String(dfABS), ss: formatStatNumber(ssabs), ms: formatStatNumber(msabs), f: '—', p: '—' }
      ],
      options:{ fileName:'box-two-way-mixed', contextLabel:'box-grouped-mixed2' },
      footnotes: ['Mixed model treats rows as a random effect; F-tests for fixed effects use row interactions as denominators.']
    };
  }
  function analyzeThreeWayAnova(data){
    const base = collectGroupedMomentInfo(data);
    if(!base.ok){
      return { ok: false, message: base.message };
    }
    const jStatLib = global.jStat;
    if(!jStatLib){
      return { ok: false, message: 'Statistics unavailable (jStat missing).' };
    }
    const { I, J, K, meanByGroup, meanByCondition, subjectMeans, asMeans, bsMeans, grandMean, cellMeans, ssa, ssb, ssab, sstotal } = base;
    if(I < 2 || J < 2 || K < 2){
      return { ok: false, message: 'Three-way ANOVA requires at least two groups, two conditions, and two rows.' };
    }
    let ssc = 0;
    for(let k = 0; k < K; k++){
      ssc += Math.pow(subjectMeans[k] - grandMean, 2);
    }
    ssc *= I * J;
    let ssac = 0;
    for(let i = 0; i < I; i++){
      for(let k = 0; k < K; k++){
        const term = asMeans[i][k] - meanByGroup[i] - subjectMeans[k] + grandMean;
        ssac += Math.pow(term, 2);
      }
    }
    ssac *= J;
    let ssbc = 0;
    for(let j = 0; j < J; j++){
      for(let k = 0; k < K; k++){
        const term = bsMeans[j][k] - meanByCondition[j] - subjectMeans[k] + grandMean;
        ssbc += Math.pow(term, 2);
      }
    }
    ssbc *= I;
    let ssabc = 0;
    for(let i = 0; i < I; i++){
      for(let j = 0; j < J; j++){
        for(let k = 0; k < K; k++){
          const value = data.rows[k][i][j];
          const abMean = cellMeans[i][j];
          const acMean = asMeans[i][k];
          const bcMean = bsMeans[j][k];
          const term = value - abMean - acMean - bcMean + meanByGroup[i] + meanByCondition[j] + subjectMeans[k] - grandMean;
          ssabc += Math.pow(term, 2);
        }
      }
    }
    const residual = sstotal - (ssa + ssb + ssc + ssab + ssac + ssbc + ssabc);
    const dfA = I - 1;
    const dfB = J - 1;
    const dfC = K - 1;
    const dfAB = (I - 1) * (J - 1);
    const dfAC = (I - 1) * (K - 1);
    const dfBC = (J - 1) * (K - 1);
    const dfABC = (I - 1) * (J - 1) * (K - 1);
    if(dfABC <= 0){
      return { ok: false, message: 'Three-way ANOVA requires at least two rows to estimate interaction variance.' };
    }
    const msabc = ssabc / dfABC;
    const msa = ssa / dfA;
    const msb = ssb / dfB;
    const msc = ssc / dfC;
    const msab = ssab / dfAB;
    const msac = ssac / dfAC;
    const msbc = ssbc / dfBC;
    const fA = msabc > 0 ? msa / msabc : NaN;
    const fB = msabc > 0 ? msb / msabc : NaN;
    const fC = msabc > 0 ? msc / msabc : NaN;
    const fAB = msabc > 0 ? msab / msabc : NaN;
    const fAC = msabc > 0 ? msac / msabc : NaN;
    const fBC = msabc > 0 ? msbc / msabc : NaN;
    const pA = Number.isFinite(fA) ? 1 - jStatLib.centralF.cdf(fA, dfA, dfABC) : NaN;
    const pB = Number.isFinite(fB) ? 1 - jStatLib.centralF.cdf(fB, dfB, dfABC) : NaN;
    const pC = Number.isFinite(fC) ? 1 - jStatLib.centralF.cdf(fC, dfC, dfABC) : NaN;
    const pAB = Number.isFinite(fAB) ? 1 - jStatLib.centralF.cdf(fAB, dfAB, dfABC) : NaN;
    const pAC = Number.isFinite(fAC) ? 1 - jStatLib.centralF.cdf(fAC, dfAC, dfABC) : NaN;
    const pBC = Number.isFinite(fBC) ? 1 - jStatLib.centralF.cdf(fBC, dfBC, dfABC) : NaN;
    console.debug('Debug: three-way ANOVA stats',{ dfA, dfB, dfC, dfAB, dfAC, dfBC, dfABC, fA, fB, fC, fAB, fAC, fBC });
    return {
      ok: true,
      caption: 'Three-way ANOVA',
      columns: [
        { key: 'source', label: 'Source', align: 'left' },
        { key: 'df', label: 'df', align: 'right' },
        { key: 'ss', label: 'SS', align: 'right' },
        { key: 'ms', label: 'MS', align: 'right' },
        { key: 'f', label: 'F', align: 'right' },
        { key: 'p', label: 'P value', align: 'right' }
      ],
      rows: [
        { source: 'Group', df: String(dfA), ss: formatStatNumber(ssa), ms: formatStatNumber(msa), f: formatStatNumber(fA), p: formatP(pA) },
        { source: 'Condition', df: String(dfB), ss: formatStatNumber(ssb), ms: formatStatNumber(msb), f: formatStatNumber(fB), p: formatP(pB) },
        { source: 'Row', df: String(dfC), ss: formatStatNumber(ssc), ms: formatStatNumber(msc), f: formatStatNumber(fC), p: formatP(pC) },
        { source: 'Group × Condition', df: String(dfAB), ss: formatStatNumber(ssab), ms: formatStatNumber(msab), f: formatStatNumber(fAB), p: formatP(pAB) },
        { source: 'Group × Row', df: String(dfAC), ss: formatStatNumber(ssac), ms: formatStatNumber(msac), f: formatStatNumber(fAC), p: formatP(pAC) },
        { source: 'Condition × Row', df: String(dfBC), ss: formatStatNumber(ssbc), ms: formatStatNumber(msbc), f: formatStatNumber(fBC), p: formatP(pBC) },
        { source: 'Group × Condition × Row', df: String(dfABC), ss: formatStatNumber(ssabc), ms: formatStatNumber(msabc), f: '—', p: '—' },
        { source: 'Residual', df: '—', ss: formatStatNumber(residual), ms: '—', f: '—', p: '—' }
      ],
      options:{ fileName:'box-three-way-anova', contextLabel:'box-grouped-anova3' },
      footnotes: ['Highest-order interaction is used as the error term for F-tests.'],
      diagnostics: { dfA, dfB, dfC, dfAB, dfAC, dfBC, dfABC }
    };
  }
  function analyzeThreeWayMixed(data){
    const base = collectGroupedMomentInfo(data);
    if(!base.ok){
      return { ok: false, message: base.message };
    }
    const jStatLib = global.jStat;
    if(!jStatLib){
      return { ok: false, message: 'Statistics unavailable (jStat missing).' };
    }
    const { I, J, K, ssa, ssb, ssab, meanByGroup, meanByCondition, subjectMeans, asMeans, bsMeans, grandMean } = base;
    if(I < 2 || J < 2 || K < 2){
      return { ok: false, message: 'Three-way mixed model requires at least two groups, two conditions, and two rows.' };
    }
    const dfA = I - 1;
    const dfB = J - 1;
    const dfC = K - 1;
    const dfAS = (I - 1) * (K - 1);
    const dfBS = (J - 1) * (K - 1);
    const dfAB = (I - 1) * (J - 1);
    const dfABS = (I - 1) * (J - 1) * (K - 1);
    if(dfAS <= 0 || dfBS <= 0 || dfABS <= 0){
      return { ok: false, message: 'Three-way mixed model requires at least two rows to estimate random effects.' };
    }
    let sss = 0;
    for(let k = 0; k < K; k++){
      sss += Math.pow(subjectMeans[k] - grandMean, 2);
    }
    sss *= I * J;
    let ssas = 0;
    for(let i = 0; i < I; i++){
      for(let k = 0; k < K; k++){
        const term = asMeans[i][k] - meanByGroup[i] - subjectMeans[k] + grandMean;
        ssas += Math.pow(term, 2);
      }
    }
    ssas *= J;
    let ssbs = 0;
    for(let j = 0; j < J; j++){
      for(let k = 0; k < K; k++){
        const term = bsMeans[j][k] - meanByCondition[j] - subjectMeans[k] + grandMean;
        ssbs += Math.pow(term, 2);
      }
    }
    ssbs *= I;
    let ssabs = 0;
    for(let k = 0; k < K; k++){
      for(let i = 0; i < I; i++){
        for(let j = 0; j < J; j++){
          const term = data.rows[k][i][j]
            - base.cellMeans[i][j]
            - asMeans[i][k]
            - bsMeans[j][k]
            + meanByGroup[i]
            + meanByCondition[j]
            + subjectMeans[k]
            - grandMean;
          ssabs += Math.pow(term, 2);
        }
      }
    }
    const msa = ssa / dfA;
    const msas = ssas / dfAS;
    const msb = ssb / dfB;
    const msbs = ssbs / dfBS;
    const msab = ssab / dfAB;
    const msabs = ssabs / dfABS;
    const fA = msas > 0 ? msa / msas : NaN;
    const fB = msbs > 0 ? msb / msbs : NaN;
    const fAB = msabs > 0 ? msab / msabs : NaN;
    const pA = Number.isFinite(fA) ? 1 - jStatLib.centralF.cdf(fA, dfA, dfAS) : NaN;
    const pB = Number.isFinite(fB) ? 1 - jStatLib.centralF.cdf(fB, dfB, dfBS) : NaN;
    const pAB = Number.isFinite(fAB) ? 1 - jStatLib.centralF.cdf(fAB, dfAB, dfABS) : NaN;
    console.debug('Debug: three-way mixed stats',{ dfA, dfAS, dfB, dfBS, dfAB, dfABS, fA, fB, fAB });
    return {
      ok: true,
      caption: 'Three-way Mixed Model',
      columns: [
        { key: 'source', label: 'Source', align: 'left' },
        { key: 'df', label: 'df', align: 'right' },
        { key: 'ss', label: 'SS', align: 'right' },
        { key: 'ms', label: 'MS', align: 'right' },
        { key: 'f', label: 'F', align: 'right' },
        { key: 'p', label: 'P value', align: 'right' }
      ],
      rows: [
        { source: 'Group', df: String(dfA), ss: formatStatNumber(ssa), ms: formatStatNumber(msa), f: formatStatNumber(fA), p: formatP(pA) },
        { source: 'Condition', df: String(dfB), ss: formatStatNumber(ssb), ms: formatStatNumber(msb), f: formatStatNumber(fB), p: formatP(pB) },
        { source: 'Row (random)', df: String(dfC), ss: formatStatNumber(sss), ms: formatStatNumber(dfC ? sss / dfC : NaN), f: '—', p: '—' },
        { source: 'Group × Condition', df: String(dfAB), ss: formatStatNumber(ssab), ms: formatStatNumber(msab), f: formatStatNumber(fAB), p: formatP(pAB) },
        { source: 'Group × Row', df: String(dfAS), ss: formatStatNumber(ssas), ms: formatStatNumber(msas), f: '—', p: '—' },
        { source: 'Condition × Row', df: String(dfBS), ss: formatStatNumber(ssbs), ms: formatStatNumber(msbs), f: '—', p: '—' },
        { source: 'Group × Condition × Row', df: String(dfABS), ss: formatStatNumber(ssabs), ms: formatStatNumber(msabs), f: '—', p: '—' }
      ],
      options:{ fileName:'box-three-way-mixed', contextLabel:'box-grouped-mixed3' },
      footnotes: ['Rows treated as a random effect; F-tests reported for fixed factors only.']
    };
  }
  function analyzeRowWiseTTests(data){
    const jStatLib = global.jStat;
    if(!jStatLib){
      return { ok: false, message: 'Statistics unavailable (jStat missing).' };
    }
    if(data.groupsCount < 2){
      return { ok: false, message: 'Row-wise t-tests require at least two groups.' };
    }
    const conditionLabels = data.conditionLabels;
    const tests = [];
    for(let condIdx = 0; condIdx < data.conditionsCount; condIdx++){
      for(let gA = 0; gA < data.groupsCount; gA++){
        for(let gB = gA + 1; gB < data.groupsCount; gB++){
          const sampleA = data.cellData[gA][condIdx];
          const sampleB = data.cellData[gB][condIdx];
          if(sampleA.length < 2 || sampleB.length < 2){
            console.debug('Debug: row-wise t-test skipped due to insufficient replicates',{ condIdx, gA, gB, aCount: sampleA.length, bCount: sampleB.length });
            continue;
          }
          const result = tTest(sampleA, sampleB);
          tests.push({
            condition: conditionLabels[condIdx] || `Condition ${condIdx + 1}`,
            groupA: data.groupLabels[gA],
            groupB: data.groupLabels[gB],
            t: result.t,
            df: result.df,
            p: result.p
          });
        }
      }
    }
    if(!tests.length){
      return { ok: false, message: 'Not enough replicates to compute row-wise t-tests.' };
    }
    const m = tests.length;
    const adjustedValues = applyPValueCorrection(tests.map(test => test.p), state.statsCorrection);
    adjustedValues.forEach((adj, idx) => {
      tests[idx].padjust = adj;
    });
    const correctionMeta = resolveCorrectionMeta(state.statsCorrection, m);
    updateStatsCorrectionSummary(m);
    console.debug('Debug: row-wise t-tests computed',{ count: tests.length, correction: correctionMeta.key });
    return {
      ok: true,
      caption: 'Row-wise t-tests',
      columns: [
        { key: 'condition', label: 'Condition', align: 'left' },
        { key: 'comparison', label: 'Comparison', align: 'left' },
        { key: 't', label: 't', align: 'right' },
        { key: 'df', label: 'df', align: 'right' },
        { key: 'p', label: 'P value', align: 'right' },
        { key: 'padjust', label: `P (adj, ${correctionMeta.shortLabel})`, align: 'right' }
      ],
      rows: tests.map(test => ({
        condition: test.condition,
        comparison: `${test.groupA} vs ${test.groupB}`,
        t: formatStatNumber(test.t),
        df: Number.isFinite(test.df) ? formatStatNumber(test.df, 2) : '—',
        p: formatP(test.p),
        padjust: formatP(test.padjust)
      })),
      options:{ fileName:'box-rowwise-ttest', contextLabel:'box-grouped-ttests' },
      footnotes: correctionMeta.footnote ? [correctionMeta.footnote] : []
    };
  }
  function getAdvisorState(){
    if(!state.statsAdvisor || typeof state.statsAdvisor!=='object'){
      state.statsAdvisor={ open:false, activated:false, answers:{} };
    }
    if(typeof state.statsAdvisor.activated!=='boolean'){
      state.statsAdvisor.activated=false;
    }
    if(!state.statsAdvisor.answers || typeof state.statsAdvisor.answers!=='object'){
      state.statsAdvisor.answers={};
    }
    return state.statsAdvisor;
  }
  function buildAdvisorContext(traces){
    if(state.tableFormat==='grouped'){
      const prepared=prepareGroupedStatsData(traces,{ axisLabels: state.lastAxisLabels });
      const groupsCount=Number.isFinite(prepared?.groupsCount)?prepared.groupsCount:0;
      const conditionsCount=Number.isFinite(prepared?.conditionsCount)?prepared.conditionsCount:0;
      const rowsWithData=Number.isFinite(prepared?.rowsWithData)?prepared.rowsWithData:0;
      return {
        format:'grouped',
        groupCount:groupsCount,
        conditionCount:conditionsCount,
        rowCount:rowsWithData,
        ok:!!prepared?.ok,
        message:prepared?.message || '',
        partialRowsSkipped:Number.isFinite(prepared?.partialRowsSkipped)?prepared.partialRowsSkipped:0,
        analysis:state.groupedStats?.analysis || 'twoWayAnova',
        prepared
      };
    }
    const indices=[...state.selectedCols].filter(idx=>Number.isInteger(idx) && idx<traces.length);
    const sampleSizes=indices.map(idx=>{
      const trace=traces[idx] || {};
      const values=Array.isArray(trace.rawY)?trace.rawY:(Array.isArray(trace.y)?trace.y:[]);
      return values.filter(Number.isFinite).length;
    });
    return {
      format:'standard',
      groupCount: indices.length,
      sampleSizes,
      assumptions: state.assumptionDiagnostics || null,
      currentTest: state.statsTest,
      currentPaired: state.statsPaired,
      currentPostHoc: state.statsPostHoc
    };
  }
  function ensureAdvisorDefaults(context){
    const advisor=getAdvisorState();
    const answers=advisor.answers;
    if(context?.format==='grouped'){
      const analysis=context?.analysis || state.groupedStats?.analysis;
      if(answers.groupedGoal===undefined){
        answers.groupedGoal=analysis==='rowTTests'?'perCondition':'interaction';
      }
      if(answers.groupedRepeated===undefined){
        if(analysis==='twoWayMixed' || analysis==='threeWayMixed'){
          answers.groupedRepeated='yes';
        }else if(analysis==='twoWayAnova' || analysis==='threeWayAnova'){
          answers.groupedRepeated='no';
        }
      }
      const rowCount=Number.isFinite(context?.rowCount)?context.rowCount:0;
      if(rowCount>=2){
        if(answers.groupedRowFactor===undefined){
          answers.groupedRowFactor=(analysis==='threeWayAnova' || analysis==='threeWayMixed')?'yes':'no';
        }
      }else if(answers.groupedRowFactor!==undefined){
        delete answers.groupedRowFactor;
      }
      return answers;
    }
    if(answers.groups===undefined && (context.groupCount||0)>=2){
      answers.groups=context.groupCount>=3?'threePlus':'two';
    }
    if(answers.paired===undefined){
      answers.paired=state.statsPaired?'paired':'unpaired';
    }
    if(answers.distribution===undefined){
      if(context.assumptions?.recommendNonParametric){
        answers.distribution='nonnormal';
      }else if(state.statsTest==='parametric'){
        answers.distribution='normal';
      }
    }
    if((context.groupCount||0)>=3){
      if(context.assumptions?.varianceConcern){
        if(answers.equalVariance!=='yes'){
          answers.equalVariance='no';
        }
      }else if(answers.equalVariance===undefined){
        answers.equalVariance='unsure';
      }
    }
    return answers;
  }
  function buildAdvisorQuestions(context,answers){
    if(context?.format==='grouped'){
      const questions=[];
      const conditionHelp=`Detected ${context.conditionCount || 0} condition${context.conditionCount===1?'':'s'} per group.`;
      questions.push({
        id:'groupedGoal',
        prompt:'What is your grouped-analysis goal?',
        help:conditionHelp,
        options:GROUPED_GOAL_OPTIONS
      });
      const multiCondition=(context.conditionCount||0)>=2;
      if(multiCondition && (answers.groupedGoal==='interaction' || !answers.groupedGoal)){
        const repeatedHelp=context.rowCount>=2
          ? 'Rows appear aligned across groups/conditions. Confirm if they represent repeated subjects.'
          : 'With a single complete row the mixed-model option is limited.';
        questions.push({
          id:'groupedRepeated',
          prompt:'Are rows repeated measures of the same subjects across conditions?',
          help:repeatedHelp,
          options:GROUPED_REPEATED_OPTIONS
        });
        if((context.rowCount||0)>=2){
          questions.push({
            id:'groupedRowFactor',
            prompt:'Do you want to include the row/subject dimension as a factor?',
            help:`Detected ${context.rowCount || 0} complete row${context.rowCount===1?'':'s'} available for modeling row-level effects.`,
            options:GROUPED_ROW_FACTOR_OPTIONS
          });
        }
      }
      return questions;
    }
    const questions=[];
    const groupsHelp=`Detected ${context.groupCount || 0} selected column${context.groupCount===1?'':'s'}.`;
    questions.push({
      id:'groups',
      prompt:'How many groups are you comparing?',
      help:groupsHelp,
      options:ADVISOR_GROUP_OPTIONS
    });
    questions.push({
      id:'paired',
      prompt:'Are the observations paired/repeated on the same subjects?',
      help:'Paired means each row links the groups (e.g., before/after or matched pairs).',
      options:ADVISOR_PAIRED_OPTIONS
    });
    questions.push({
      id:'distribution',
      prompt:'Do the group distributions look approximately normal?',
      help:'Inspect the boxplots, QQ plots, or normality diagnostics when available.',
      options:ADVISOR_DISTRIBUTION_OPTIONS
    });
    const resolvedGroups=normalizeAdvisorGroupAnswer(answers.groups,context);
    const resolvedPaired=(answers.paired==='paired' || (answers.paired===undefined && state.statsPaired))?'paired':'unpaired';
    if(resolvedGroups==='threePlus' && resolvedPaired!=='paired'){
      questions.push({
        id:'equalVariance',
        prompt:'For parametric tests, can you assume equal variances across groups?',
        help:'Large variance differences call for Welch-type or non-parametric methods.',
        options:ADVISOR_VARIANCE_OPTIONS
      });
    }
    return questions;
  }
  function renderStatsAdvisor(traces,controls,providedContext){
    const debugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
    const advisorState=getAdvisorState();
    const context=providedContext || buildAdvisorContext(traces);
    const answers=ensureAdvisorDefaults(context);
    const recommendation=computeAdvisorRecommendation(answers,context);
    const container=document.createElement('div');
    container.className='stats-advisor';
    container.dataset.open=advisorState.open?'1':'0';

    const header=document.createElement('div');
    header.className='stats-advisor__header';
    const title=document.createElement('strong');
    title.textContent='Test advisor';
    header.appendChild(title);
    const toggle=document.createElement('button');
    toggle.type='button';
    toggle.className='stats-advisor__toggle';
    toggle.textContent=advisorState.open?'Hide advisor':'Guide me';
    toggle.addEventListener('click',()=>{
      advisorState.open=!advisorState.open;
      if(advisorState.open && !advisorState.activated){
        advisorState.activated=true;
        console.debug('Debug: box statsAdvisor activated');
      }
      console.debug('Debug: box statsAdvisor toggled',{ open:advisorState.open });
      renderStatsControls(traces);
    });
    header.appendChild(toggle);
    container.appendChild(header);

    const summary=document.createElement('div');
    summary.className='stats-advisor__summary';
    if(!advisorState.activated){
      const msg=document.createElement('div');
      msg.textContent='Press the "Guide me" button to view advisor recommendations.';
      summary.appendChild(msg);
    }else if(recommendation.ready){
      const summaryLine=document.createElement('div');
      summaryLine.className='stats-advisor__summary-line';
      summaryLine.textContent=`Recommendation: ${recommendation.summary}`;
      summary.appendChild(summaryLine);
      if(Array.isArray(recommendation.rationale) && recommendation.rationale.length){
        const rationaleList=document.createElement('ul');
        rationaleList.className='stats-advisor__rationale';
        recommendation.rationale.forEach(item=>{
          const li=document.createElement('li');
          li.textContent=item;
          rationaleList.appendChild(li);
        });
        summary.appendChild(rationaleList);
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
      const msg=document.createElement('div');
      msg.textContent=recommendation.message || 'Answer the advisor questions to receive a recommendation.';
      summary.appendChild(msg);
    }
    if(els.boxGraphType?.value === 'violin'){
      const violinState = ensureViolinState();
      const sampleCount = violinState.lastSampleCount || violinState.sampleCount;
      const bandwidthSource = Number.isFinite(violinState.lastUsedBandwidth) && violinState.lastUsedBandwidth > 0
        ? violinState.lastUsedBandwidth
        : violinState.bandwidth;
      const smoothingNote=document.createElement('div');
      smoothingNote.className='stats-advisor__hint';
      const modeLabel = violinState.autoBandwidth === false ? 'Manual' : 'Auto';
      const bandwidthText = Number.isFinite(bandwidthSource) && bandwidthSource > 0
        ? bandwidthSource.toLocaleString('en-US',{ maximumFractionDigits: 3 })
        : 'not yet estimated';
      smoothingNote.textContent=`Violin smoothing: ${modeLabel} bandwidth (${bandwidthText}) with ${sampleCount} samples.`;
      summary.appendChild(smoothingNote);
      if(debugEnabled){
        console.debug('Debug: box stats advisor smoothing note',{ mode: modeLabel.toLowerCase(), bandwidth: bandwidthSource, samples: sampleCount });
      }
    }else if(debugEnabled){
      console.debug('Debug: box stats advisor smoothing note skipped',{ graphType: els.boxGraphType?.value });
    }
    container.appendChild(summary);

    if(advisorState.open){
      const questionsWrap=document.createElement('div');
      questionsWrap.className='stats-advisor__questions';
      const questions=buildAdvisorQuestions(context,answers);
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
        (question.options||[]).forEach(opt=>{
          const optionWrap=document.createElement('label');
          optionWrap.className='stats-advisor__option';
          const input=document.createElement('input');
          input.type='radio';
          input.name=`advisor-${question.id}`;
          input.value=opt.value;
          input.checked=answers[question.id]===opt.value;
          input.addEventListener('change',()=>{
            answers[question.id]=opt.value;
            console.debug('Debug: box statsAdvisor answer change',{ question:question.id, value:opt.value });
            renderStatsControls(traces);
          });
          const span=document.createElement('span');
          span.textContent=opt.label;
          optionWrap.appendChild(input);
          optionWrap.appendChild(span);
          fieldset.appendChild(optionWrap);
        });
        questionsWrap.appendChild(fieldset);
      });
      container.appendChild(questionsWrap);

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
        if(context?.format==='grouped' || recommendation.format==='grouped'){
          ensureGroupedStatsDefaults();
          if(!state.groupedStats || typeof state.groupedStats!=='object'){
            state.groupedStats={ analysis:'twoWayAnova' };
          }
          if(recommendation.analysis){
            state.groupedStats.analysis=recommendation.analysis;
          }
          advisorState.lastApplied={ ...recommendation };
          console.debug('Debug: box grouped statsAdvisor applied',{
            analysis: state.groupedStats.analysis,
            answers:{ ...answers }
          });
          renderStatsControls(traces);
          requestStatsContextRefresh('stats-advisor-apply-grouped');
          state.scheduleDraw();
          return;
        }
        state.statsTest=recommendation.statsTest;
        state.statsPaired=recommendation.paired;
        const postHocContext={
          mode: state.statsMode,
          test: recommendation.statsTest,
          paired: recommendation.paired,
          groupCount: context.groupCount
        };
        state.statsPostHoc=ensureValidPostHoc(recommendation.postHoc,postHocContext);
        if(recommendation.statsTest==='parametric'){
          const variantCandidate=recommendation.parametricVariant==='welch'?'welch':'classic';
          state.statsParametricVariant=variantCandidate;
        }else{
          state.statsParametricVariant='nonparametric';
        }
        advisorState.lastApplied={ ...recommendation };
        console.debug('Debug: box statsAdvisor applied',{
          statsTest: state.statsTest,
          statsPaired: state.statsPaired,
          statsPostHoc: state.statsPostHoc,
          statsVariant: state.statsParametricVariant,
          answers:{ ...answers }
        });
        renderStatsControls(traces);
        requestStatsContextRefresh('stats-advisor-apply');
        state.scheduleDraw();
      });
      actions.appendChild(applyBtn);
      const resetBtn=document.createElement('button');
      resetBtn.type='button';
      resetBtn.className='stats-advisor__reset';
      resetBtn.textContent='Reset answers';
      resetBtn.addEventListener('click',()=>{
        advisorState.answers={};
        console.debug('Debug: box statsAdvisor reset');
        renderStatsControls(traces);
      });
      actions.appendChild(resetBtn);
      container.appendChild(actions);
    }

    controls.appendChild(container);
  }

  function renderStatsControls(traces){
  const controls=document.getElementById('statsControls');
  if(!controls){
    return;
  }
  controls.innerHTML='';
  const correctionOptions=getAvailableCorrections();
  const normalizedCorrection=ensureValidCorrectionValue(state.statsCorrection);
  if(normalizedCorrection!==state.statsCorrection){
    console.debug('Debug: box statsCorrection normalized',{ before:state.statsCorrection, after:normalizedCorrection });
    state.statsCorrection=normalizedCorrection;
  }
  const normalizedParamEffect=ensureValidEffectOption('parametric',state.statsEffectParametric);
  if(normalizedParamEffect!==state.statsEffectParametric){
    console.debug('Debug: box statsEffectParametric normalized',{ before:state.statsEffectParametric, after:normalizedParamEffect });
    state.statsEffectParametric=normalizedParamEffect;
  }
  const normalizedNonParamEffect=ensureValidEffectOption('nonparametric',state.statsEffectNonParametric);
  if(normalizedNonParamEffect!==state.statsEffectNonParametric){
    console.debug('Debug: box statsEffectNonParametric normalized',{ before:state.statsEffectNonParametric, after:normalizedNonParamEffect });
    state.statsEffectNonParametric=normalizedNonParamEffect;
  }
  const varianceConcern=state.assumptionDiagnostics?.varianceConcern===true;
  const normalityFailures=Number.isFinite(state.assumptionDiagnostics?.normalityFailures)
    ? state.assumptionDiagnostics.normalityFailures
    : 0;
  let desiredVariant=state.statsParametricVariant;
  if(state.statsTest!=='parametric'){
    desiredVariant='nonparametric';
  }else if(state.statsPaired){
    desiredVariant='classic';
  }else{
    const comparisonCount=Array.isArray(traces)?traces.length:0;
    if(comparisonCount>=3 && varianceConcern && normalityFailures===0){
      desiredVariant='welch';
    }else{
      desiredVariant='classic';
    }
  }
  if(desiredVariant!==state.statsParametricVariant){
    console.debug('Debug: box statsParametricVariant adjusted',{ before:state.statsParametricVariant, after:desiredVariant, varianceConcern, normalityFailures });
    state.statsParametricVariant=desiredVariant;
  }
  const postHocContext={
    mode: state.statsMode,
    test: state.statsTest,
    paired: state.statsPaired,
    groupCount: Array.isArray(traces)?traces.length:0,
    variant: state.statsParametricVariant,
    varianceConcern
  };
  const normalizedPostHoc=ensureValidPostHoc(state.statsPostHoc,postHocContext);
  if(normalizedPostHoc!==state.statsPostHoc){
    console.debug('Debug: box statsPostHoc normalized',{ before:state.statsPostHoc, after:normalizedPostHoc, context:postHocContext });
    state.statsPostHoc=normalizedPostHoc;
  }
  if(state.selectedCols && state.selectedCols.size){
    const beforeSize = state.selectedCols.size;
    const filteredSelection = [...state.selectedCols].filter(idx => idx < traces.length);
    if(filteredSelection.length !== beforeSize){
      state.selectedCols = new Set(filteredSelection);
      console.debug('Debug: box selectedCols pruned for trace count',{ before: beforeSize, after: filteredSelection.length, traces: traces.length });
    }
  }
  if(state.selectedCols.size<2 && traces.length>=2){
    state.selectedCols.clear();
    state.selectedCols.add(0);
    state.selectedCols.add(1);
  }
  if(state.statsMode==='reference' && !state.selectedCols.has(state.statsRef)){
    state.selectedCols.add(state.statsRef);
  }

  const advisorContext=buildAdvisorContext(traces);
  renderStatsAdvisor(traces, controls, advisorContext);

  if(state.tableFormat==='grouped'){
    renderGroupedStatsControls(traces, controls, advisorContext?.prepared);
    return;
  }

  const optionWrap=document.createElement('div');
  // Arrange controls in compact rows: label + control side-by-side
  optionWrap.style.display = 'flex';
  optionWrap.style.flexDirection = 'column';
  optionWrap.style.gap = '8px';

  function persistTabState(reason){
    try{
      const sess = (window && window.Main && window.Main.session) ? window.Main.session : null;
      if(sess && typeof sess.persistActiveTabState === 'function'){
        sess.persistActiveTabState(undefined, { reason: reason || 'stats-controls-change' });
      }
    }catch(e){
      console.debug('Debug: persistTabState failed', { err: e?.message || String(e) });
    }
  }

  function appendInline(labelEl, inputEl){
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '8px';
    row.style.alignItems = 'center';
    // keep labels compact and aligned
    try{ labelEl.style.minWidth = '120px'; }catch(e){}
    row.appendChild(labelEl);
    row.appendChild(inputEl);
    optionWrap.appendChild(row);
  }
  const testLabel=document.createElement('label');
  testLabel.textContent='Test:';
  const testSel=document.createElement('select');
  ['parametric','nonparametric'].forEach(v=>{
    const option=document.createElement('option');
    option.value=v;
    option.textContent=v==='parametric'?'Parametric':'Non-parametric';
    if(state.statsTest===v) option.selected=true;
    testSel.appendChild(option);
  });
  testSel.addEventListener('change',()=>{
    state.statsTest=testSel.value;
    console.log('boxplot statsTest changed', state.statsTest);
    requestStatsContextRefresh('stats-test-change');
    persistTabState('stats-test-change');
    state.scheduleDraw();
  });
  appendInline(testLabel, testSel);

  const pairedLabel=document.createElement('label');
  pairedLabel.textContent='Pairing:';
  const pairedSel=document.createElement('select');
  [['unpaired','Unpaired'],['paired','Paired']].forEach(([value,text])=>{
    const option=document.createElement('option');
    option.value=value;
    option.textContent=text;
    if((state.statsPaired && value==='paired')||(!state.statsPaired && value==='unpaired')) option.selected=true;
    pairedSel.appendChild(option);
  });
  pairedSel.addEventListener('change',()=>{
    state.statsPaired=pairedSel.value==='paired';
    console.log('boxplot statsPaired changed', state.statsPaired);
    requestStatsContextRefresh('stats-pairing-change');
    persistTabState('stats-pairing-change');
    state.scheduleDraw();
  });
  appendInline(pairedLabel, pairedSel);

  const modeLabel=document.createElement('label');
  modeLabel.textContent='Comparison:';
  const modeSel=document.createElement('select');
  [['all','All pairwise'],['reference','Versus reference'],['custom','Custom pairs']].forEach(([value,text])=>{
    const option=document.createElement('option');
    option.value=value;
    option.textContent=text;
    if(state.statsMode===value) option.selected=true;
    modeSel.appendChild(option);
  });
  modeSel.addEventListener('change',()=>{
    state.statsMode=modeSel.value;
    console.log('boxplot statsMode changed', state.statsMode);
    if(state.selectedCols && state.selectedCols.size){
      const beforeSize = state.selectedCols.size;
      const filteredSelection = [...state.selectedCols].filter(idx => idx < traces.length);
      if(filteredSelection.length !== beforeSize){
        state.selectedCols = new Set(filteredSelection);
        console.debug('Debug: selectedCols pruned',{ before: beforeSize, after: filteredSelection.length });
      }
    }
    requestStatsContextRefresh('stats-mode-change');
    persistTabState('stats-mode-change');
    renderStatsControls(traces);
    state.scheduleDraw();
  });
  appendInline(modeLabel, modeSel);

  const postHocLabel=document.createElement('label');
  postHocLabel.textContent='Post-hoc:';
  const postHocSel=document.createElement('select');
  const postHocOptions=listPostHocOptions();
  postHocOptions.forEach(opt=>{
    const option=document.createElement('option');
    option.value=opt.value;
    option.textContent=opt.label;
    option.title=opt.tooltip || '';
    const supported=isPostHocSupported(opt.value,postHocContext);
    option.disabled=!supported;
    if(opt.value===state.statsPostHoc){ option.selected=true; }
    postHocSel.appendChild(option);
  });
  postHocSel.addEventListener('change',()=>{
    state.statsPostHoc=postHocSel.value;
    console.debug('Debug: box statsPostHoc changed',{ value:state.statsPostHoc });
    requestStatsContextRefresh('stats-posthoc-change');
    persistTabState('stats-posthoc-change');
    renderStatsControls(traces);
    state.scheduleDraw();
  });
  appendInline(postHocLabel, postHocSel);

  const correctionLabel=document.createElement('label');
  correctionLabel.textContent='Correction:';
  const correctionSel=document.createElement('select');
  correctionOptions.forEach(opt=>{
    const option=document.createElement('option');
    option.value=opt.value;
    option.textContent=opt.label;
    if(opt.value===state.statsCorrection) option.selected=true;
    correctionSel.appendChild(option);
  });
  correctionSel.addEventListener('change',()=>{
    const value=ensureValidCorrectionValue(correctionSel.value);
    state.statsCorrection=value;
    console.debug('Debug: box statsCorrection changed',{ value, source:'main-controls' });
    updateStatsCorrectionSummary(0);
    requestStatsContextRefresh('stats-correction-change');
    persistTabState('stats-correction-change');
    state.scheduleDraw();
  });
  correctionSel.disabled=state.statsPostHoc==='tukey' || state.statsPostHoc==='gamesHowell';
  if(state.statsPostHoc==='tukey'){
    correctionSel.title='Tukey HSD already adjusts for multiple comparisons.';
  }else if(state.statsPostHoc==='gamesHowell'){
    correctionSel.title='Games–Howell already incorporates unequal-variance adjustment.';
  }else{
    correctionSel.removeAttribute('title');
  }
  appendInline(correctionLabel, correctionSel);

  const paramEffectLabel=document.createElement('label');
  paramEffectLabel.textContent='Param effect size:';
  const paramEffectSel=document.createElement('select');
  listEffectOptions('parametric').forEach(opt=>{
    const option=document.createElement('option');
    option.value=opt.value;
    option.textContent=opt.label;
    option.title=opt.tooltip;
    if(opt.value===state.statsEffectParametric) option.selected=true;
    paramEffectSel.appendChild(option);
  });
  paramEffectSel.addEventListener('change',()=>{
    const value=ensureValidEffectOption('parametric',paramEffectSel.value);
    state.statsEffectParametric=value;
    console.debug('Debug: box statsEffectParametric changed',{ value });
    requestStatsContextRefresh('stats-param-effect-change');
    persistTabState('stats-param-effect-change');
    state.scheduleDraw();
  });
  appendInline(paramEffectLabel, paramEffectSel);

  const nonParamEffectLabel=document.createElement('label');
  nonParamEffectLabel.textContent='Non-param effect size:';
  const nonParamEffectSel=document.createElement('select');
  listEffectOptions('nonparametric').forEach(opt=>{
    const option=document.createElement('option');
    option.value=opt.value;
    option.textContent=opt.label;
    option.title=opt.tooltip;
    if(opt.value===state.statsEffectNonParametric) option.selected=true;
    nonParamEffectSel.appendChild(option);
  });
  nonParamEffectSel.addEventListener('change',()=>{
    const value=ensureValidEffectOption('nonparametric',nonParamEffectSel.value);
    state.statsEffectNonParametric=value;
    console.debug('Debug: box statsEffectNonParametric changed',{ value });
    requestStatsContextRefresh('stats-nonparam-effect-change');
    persistTabState('stats-nonparam-effect-change');
    state.scheduleDraw();
  });
  appendInline(nonParamEffectLabel, nonParamEffectSel);

  const postHocHelp=document.getElementById('statsPostHocHelp');
  if(postHocHelp){
    postHocHelp.textContent=getPostHocSummary(state.statsPostHoc,postHocContext);
  }

  if(state.statsMode==='reference'){
    const refLabel=document.createElement('label');
    refLabel.textContent='Reference:';
    const refSel=document.createElement('select');
    traces.forEach((trace,index)=>{
      const option=document.createElement('option');
      option.value=index;
      option.textContent=trace.name;
      if(index===state.statsRef) option.selected=true;
      refSel.appendChild(option);
    });
    refSel.addEventListener('change',()=>{
      state.statsRef=+refSel.value;
      console.log('boxplot statsRef changed', state.statsRef);
      requestStatsContextRefresh('stats-reference-change');
      persistTabState('stats-reference-change');
      renderStatsControls(traces);
      state.scheduleDraw();
    });
    appendInline(refLabel, refSel);
  }else if(state.statsMode==='custom'){
    const pairLabel=document.createElement('label');
    pairLabel.textContent='Pairs:';
    const pairInput=document.createElement('input');
    pairInput.type='text';
    pairInput.value=state.statsPairsText;
    pairInput.placeholder='1-3,2-4';
    pairInput.addEventListener('change',()=>{
      state.statsPairsText=pairInput.value;
      state.statsCustomPairs=parsePairString(state.statsPairsText,traces);
      console.log('boxplot custom pairs changed', state.statsPairsText);
      requestStatsContextRefresh('stats-custom-pairs-change');
      persistTabState('stats-custom-pairs-change');
      state.scheduleDraw();
    });
    appendInline(pairLabel, pairInput);
    state.statsCustomPairs=parsePairString(state.statsPairsText,traces);
  }

  controls.appendChild(optionWrap);

  traces.forEach((trace,index)=>{
    const id=`statCol${index}`;
    const checkbox=document.createElement('input');
    checkbox.type='checkbox';
    checkbox.id=id;
    checkbox.dataset.index=index;
    checkbox.checked=state.selectedCols.has(index);
    checkbox.addEventListener('change',()=>{
      if(checkbox.checked) state.selectedCols.add(index);
      else state.selectedCols.delete(index);
      console.log('boxplot column toggle',{index,checked:checkbox.checked});
      requestStatsContextRefresh('stats-column-toggle');
      persistTabState('stats-column-toggle');
      state.scheduleDraw();
    });
    const label=document.createElement('label');
    label.setAttribute('for',id);
    label.textContent=trace.name;
    controls.appendChild(checkbox);
    controls.appendChild(label);
  });
  updateStatsCorrectionSummary(state.selectedCols.size>=2?state.selectedCols.size*(state.selectedCols.size-1)/2:0);
}
function renderGroupedStatsControls(traces, controls, precomputed){
  ensureGroupedStatsDefaults();
  const prepared=precomputed && precomputed.ok!==undefined ? precomputed : prepareGroupedStatsData(traces,{ axisLabels: state.lastAxisLabels });
  const summary=document.createElement('div');
  summary.className='stats-table-lead';
  summary.textContent=`Groups: ${prepared.groupsCount} | Conditions: ${prepared.conditionsCount} | Rows with data: ${prepared.rowsWithData || 0}`;
  controls.appendChild(summary);
  if(prepared.partialRowsSkipped){
    const note=document.createElement('div');
    note.style.fontSize='12px';
    note.style.color='#555';
    note.textContent=`${prepared.partialRowsSkipped} row(s) skipped due to missing values.`;
    controls.appendChild(note);
  }
  const analysisWrap=document.createElement('div');
  analysisWrap.style.display='flex';
  analysisWrap.style.gap='8px';
  analysisWrap.style.alignItems='center';
  const label=document.createElement('label');
  label.textContent='Analysis:';
  const select=document.createElement('select');
  const options=[
    { value:'twoWayAnova', text:'Two-way ANOVA' },
    { value:'twoWayMixed', text:'Two-way Mixed Model' },
    { value:'threeWayAnova', text:'Three-way ANOVA' },
    { value:'threeWayMixed', text:'Three-way Mixed Model' },
    { value:'rowTTests', text:'Multiple t tests (row-wise)' }
  ];
  const allowed=new Set(options.map(opt=>opt.value));
  if(!allowed.has(state.groupedStats.analysis)){
    state.groupedStats.analysis='twoWayAnova';
  }
  options.forEach(opt=>{
    const option=document.createElement('option');
    option.value=opt.value;
    option.textContent=opt.text;
    if(state.groupedStats.analysis===opt.value) option.selected=true;
    select.appendChild(option);
  });
  select.addEventListener('change',()=>{
    state.groupedStats.analysis=select.value;
    console.debug('Debug: grouped stats analysis changed',{ analysis: state.groupedStats.analysis });
    state.scheduleDraw();
  });
  analysisWrap.appendChild(label);
  analysisWrap.appendChild(select);
  controls.appendChild(analysisWrap);
  const correctionWrap=document.createElement('div');
  correctionWrap.style.display='flex';
  correctionWrap.style.gap='8px';
  correctionWrap.style.alignItems='center';
  const correctionLabel=document.createElement('label');
  correctionLabel.textContent='Correction:';
  const correctionSel=document.createElement('select');
  const correctionOptions=getAvailableCorrections();
  correctionOptions.forEach(opt=>{
    const option=document.createElement('option');
    option.value=opt.value;
    option.textContent=opt.label;
    if(opt.value===state.statsCorrection) option.selected=true;
    correctionSel.appendChild(option);
  });
  correctionSel.addEventListener('change',()=>{
    const value=ensureValidCorrectionValue(correctionSel.value);
    state.statsCorrection=value;
    console.debug('Debug: box statsCorrection changed',{ value, source:'grouped-controls' });
    updateStatsCorrectionSummary(0);
    state.scheduleDraw();
  });
  correctionWrap.appendChild(correctionLabel);
  correctionWrap.appendChild(correctionSel);
  controls.appendChild(correctionWrap);
  console.debug('Debug: renderGroupedStatsControls summary',{ analysis: state.groupedStats.analysis, rowsWithData: prepared.rowsWithData });
  updateStatsCorrectionSummary(prepared.conditionsCount>1?prepared.conditionsCount*(prepared.conditionsCount-1)/2:0);
}
		  function buildSignificanceBracketGeometry(options){
		    const opts = options || {};
		    const orientation = opts.orientation === 'horizontal' ? 'horizontal' : 'vertical';
		    const x1 = opts.x1;
		    const x2 = opts.x2;
		    const valueCoord = opts.valueCoord;
		    const bracketSize = Number.isFinite(opts.bracketSize) ? opts.bracketSize : 10;
		    const showWhiskers = opts.showWhiskers !== false;
		    const whiskerMode = opts.whiskerMode === 'adaptive' ? 'adaptive' : 'fixed';
		    let outerCoordA = valueCoord;
		    let outerCoordB = valueCoord;
		    if(showWhiskers && whiskerMode === 'adaptive'){
		      outerCoordA = Number.isFinite(opts.outerCoordA) ? opts.outerCoordA : valueCoord;
		      outerCoordB = Number.isFinite(opts.outerCoordB) ? opts.outerCoordB : valueCoord;
		    }
		    if(orientation === 'horizontal'){
		      const refOuter = valueCoord;
		      const innerX = valueCoord + bracketSize;
		      const d = showWhiskers
		        ? `M${outerCoordA},${x1} L${innerX},${x1} L${innerX},${x2} L${outerCoordB},${x2}`
		        : `M${innerX},${x1} L${innerX},${x2}`;
		      return { d, refOuter, innerCoord: innerX, outerCoordA, outerCoordB };
		    }
		    const refOuter = valueCoord;
		    const innerY = valueCoord - bracketSize;
		    const d = showWhiskers
		      ? `M${x1},${outerCoordA} L${x1},${innerY} L${x2},${innerY} L${x2},${outerCoordB}`
		      : `M${x1},${innerY} L${x2},${innerY}`;
		    return { d, refOuter, innerCoord: innerY, outerCoordA, outerCoordB };
		  }

		  function annotatePair(svg,x1,x2,valueCoord,p,styleOptions){
		    const opts=styleOptions||{};
		    const orientation=opts.orientation==='horizontal'?'horizontal':'vertical';
		    const strokeWidth=typeof opts.strokeWidth==='number'
		      ? opts.strokeWidth
		      : chartStyle.scaleStrokeWidth(1, opts.styleScaleInfo, { context: 'box-annotation', min: 0.5 });
		    const bracketSize=Number.isFinite(opts.bracketSize)?opts.bracketSize:10;
		    const minY = Number.isFinite(opts.minY) ? opts.minY : null;
		    const color = typeof opts.color === 'string' && opts.color.trim()
		      ? opts.color.trim()
		      : DEFAULT_SIGNIFICANCE_COLOR;
		    const showWhiskers = opts.showWhiskers !== false;
		    const whiskerMode = opts.whiskerMode === 'adaptive' ? 'adaptive' : 'fixed';
		    const controlConfig = opts.controlConfig;
		    const path=document.createElementNS(NS,'path');
		    if(path.classList){
		      path.classList.add('box-significance-annotation');
	    }else{
	      path.setAttribute('class','box-significance-annotation');
	    }
		    let bracketGeom = null;
		    let labelOuterCoord = valueCoord;
		    if(orientation==='horizontal'){
		      bracketGeom = buildSignificanceBracketGeometry({
		        orientation,
		        x1,
		        x2,
		        valueCoord,
		        bracketSize,
		        showWhiskers,
		        whiskerMode,
		        outerCoordA: opts.outerCoordA,
		        outerCoordB: opts.outerCoordB
		      });
		      labelOuterCoord = bracketGeom.refOuter;
		      path.setAttribute('d', bracketGeom.d);
		    }else{
		      let outerY=valueCoord;
		      if(minY != null){
		        const fontSize = Number.isFinite(opts.fontSize) ? opts.fontSize : 12;
	        const textYOffset = Number.isFinite(opts.fontSize) ? opts.fontSize * 0.2 : 12;
	        const minOuterY = minY + bracketSize + textYOffset + Math.max(2, fontSize * 0.1);
		        if(Number.isFinite(minOuterY)){
		          outerY = Math.max(outerY, minOuterY);
		        }
		      }
		      let outerCoordA = outerY;
		      let outerCoordB = outerY;
		      if(showWhiskers && whiskerMode === 'adaptive'){
		        if(Number.isFinite(opts.outerCoordA)){ outerCoordA = Math.max(outerY, opts.outerCoordA); }
		        if(Number.isFinite(opts.outerCoordB)){ outerCoordB = Math.max(outerY, opts.outerCoordB); }
		      }
		      bracketGeom = buildSignificanceBracketGeometry({
		        orientation,
		        x1,
		        x2,
		        valueCoord: outerY,
		        bracketSize,
		        showWhiskers,
		        whiskerMode,
		        outerCoordA,
		        outerCoordB
		      });
		      labelOuterCoord = bracketGeom.refOuter;
		      path.setAttribute('d', bracketGeom.d);
		    }
		    path.setAttribute('stroke',color);
		    if(Number.isFinite(strokeWidth)){
		      path.setAttribute('stroke-width',strokeWidth);
	    }
    path.setAttribute('fill','none');
    svg.appendChild(path);
    const txt=document.createElementNS(NS,'text');
    if(txt.classList){
      txt.classList.add('box-significance-annotation');
    }else{
      txt.setAttribute('class','box-significance-annotation');
	    }
	    const labelText = formatSignificanceLabel(p, state.significanceLabelMode);
		    if(orientation==='horizontal'){
		      txt.setAttribute('x',labelOuterCoord+bracketSize*1.4);
		      txt.setAttribute('y',(x1+x2)/2);
		      txt.setAttribute('text-anchor','start');
		      txt.setAttribute('dominant-baseline','middle');
		    }else{
		      const textYOffset=Number.isFinite(opts.fontSize)?opts.fontSize*0.2:12;
		      txt.setAttribute('x',(x1+x2)/2);
		      txt.setAttribute('y',labelOuterCoord-bracketSize-textYOffset);
		      txt.setAttribute('text-anchor','middle');
		    }
    if(Number.isFinite(opts.fontSize)){
      txt.setAttribute('font-size',opts.fontSize);
    }
    if(color){
      txt.setAttribute('fill',color);
    }
    txt.textContent=labelText;
    svg.appendChild(txt);
    if(controlConfig && Shared?.significanceControls?.registerSignificanceElement){
      Shared.significanceControls.registerSignificanceElement(path, controlConfig);
      Shared.significanceControls.registerSignificanceElement(txt, controlConfig);
    }
    console.debug('Debug: box annotatePair scaling',{strokeWidth,fontSize:opts.fontSize,orientation,color,showWhiskers});
  }
  function annotateOverall(svg,xCenters,valueToCoord,maxVal,p,level=0,styleOptions){
    const opts=styleOptions||{};
    const orientation=opts.orientation==='horizontal'?'horizontal':'vertical';
    const baseOffset=Number.isFinite(opts.baseOffset)?opts.baseOffset:ANN_BASE_OFFSET;
    const levelGap=Number.isFinite(opts.levelGap)?opts.levelGap:ANN_LEVEL_GAP;
    const fontSize=opts.fontSize;
    const bracketSize=Number.isFinite(opts.bracketSize)?opts.bracketSize:10;
    const minY = Number.isFinite(opts.minY) ? opts.minY : null;
    const color = typeof opts.color === 'string' && opts.color.trim()
      ? opts.color.trim()
      : DEFAULT_SIGNIFICANCE_COLOR;
    const controlConfig = opts.controlConfig;
    const coordFn=typeof valueToCoord==='function'?valueToCoord:v=>v;
    const baseCoord=coordFn(maxVal);
    if(!Number.isFinite(baseCoord)) return;
    const txt=document.createElementNS(NS,'text');
    if(txt.classList){
      txt.classList.add('box-significance-annotation');
    }else{
      txt.setAttribute('class','box-significance-annotation');
    }
    const labelText = formatSignificanceLabel(p, state.significanceLabelMode);
    if(orientation==='horizontal'){
      const x=baseCoord+baseOffset+level*levelGap+bracketSize*0.6;
      const y=(Math.min(...xCenters)+Math.max(...xCenters))/2;
      txt.setAttribute('x',x);
      txt.setAttribute('y',y);
      txt.setAttribute('text-anchor','start');
      txt.setAttribute('dominant-baseline','middle');
    }else{
      let y=baseCoord-baseOffset-level*levelGap;
      if(minY != null){
        const minOverall = minY + 12 + Math.max(2, (Number.isFinite(fontSize) ? fontSize : 12) * 0.1);
        if(Number.isFinite(minOverall)){
          y = Math.max(y, minOverall);
        }
      }
      txt.setAttribute('x',(Math.min(...xCenters)+Math.max(...xCenters))/2);
      txt.setAttribute('y',y-12);
      txt.setAttribute('text-anchor','middle');
    }
    if(Number.isFinite(fontSize)){
      txt.setAttribute('font-size',fontSize);
    }
    if(color){
      txt.setAttribute('fill',color);
    }
    txt.textContent=labelText;
    svg.appendChild(txt);
    if(controlConfig && Shared?.significanceControls?.registerSignificanceElement){
      Shared.significanceControls.registerSignificanceElement(txt, controlConfig);
    }
    console.debug('Debug: box annotateOverall scaling',{baseOffset,levelGap,fontSize,orientation,color});
  }
  function renderStatsTable(traces){
    const tableDiv=document.getElementById('statsTable');
    if(!tableDiv) return;
    const tableRows=traces.map(t=>{
      const summary = (t.summary && Number.isFinite(t.summary.count))
        ? t.summary
        : (t.summary = computeTraceSummary(Array.isArray(t.rawY) ? t.rawY : [], { requireSorted: false }));
      if(!summary.count){
        return {
          name:t.name,
          n:'0',
          mean:'—',
          median:'—',
          sd:'—',
          min:'—',
          q1:'—',
          q3:'—',
          max:'—'
        };
      }
      const mean = summary.mean;
      const med = summary.median;
      const sd = summary.sd;
      const min = summary.min;
      const q1 = summary.q1;
      const q3 = summary.q3;
      const max = summary.max;
      return {
        name:t.name,
        n:String(summary.count),
        mean:Number.isFinite(mean)?mean.toFixed(2):'—',
        median:Number.isFinite(med)?med.toFixed(2):'—',
        sd:Number.isFinite(sd)?sd.toFixed(2):'—',
        min:Number.isFinite(min)?min.toFixed(2):'—',
        q1:Number.isFinite(q1)?q1.toFixed(2):'—',
        q3:Number.isFinite(q3)?q3.toFixed(2):'—',
        max:Number.isFinite(max)?max.toFixed(2):'—'
      };
    });
    if(Shared.statsTable && typeof Shared.statsTable.render==='function'){
      Shared.statsTable.render({
        target:tableDiv,
        columns:[
          {key:'name',label:'Column',align:'left'},
          {key:'n',label:'N',align:'right'},
          {key:'mean',label:'Mean',align:'right'},
          {key:'median',label:'Median',align:'right'},
          {key:'sd',label:'SD',align:'right'},
          {key:'min',label:'Min',align:'right'},
          {key:'q1',label:'Q1',align:'right'},
          {key:'q3',label:'Q3',align:'right'},
          {key:'max',label:'Max',align:'right'}
        ],
        rows:tableRows,
        caption:'Descriptive statistics',
        options:{
          fileName:'box-summary-statistics',
          contextLabel:'box-summary'
        }
      });
      console.debug('Debug: box renderStatsTable using Shared.statsTable',{rowCount:tableRows.length});
    }else{
      const header=['Column','N','Mean','Median','SD','Min','Q1','Q3','Max'];
      let html='<table><thead><tr>'+header.map(h=>`<th>${h}</th>`).join('')+'</tr></thead>';
      html+='<tbody>'+tableRows.map(r=>`<tr><td>${r.name}</td><td>${r.n}</td><td>${r.mean}</td><td>${r.median}</td><td>${r.sd}</td><td>${r.min}</td><td>${r.q1}</td><td>${r.q3}</td><td>${r.max}</td></tr>`).join('')+'</tbody></table>';
      tableDiv.innerHTML=html;
      console.debug('Debug: box renderStatsTable fallback',{rowCount:tableRows.length});
    }
  }

  function setStatsStatus(message){
    if(!els.statsStatus){
      return;
    }
    els.statsStatus.textContent = message || '';
  }

  function clearStatsOutputs(message){
    const placeholder = message || 'Statistics (and significance bars) will appear after calculation.';
    if(els.statsResults){
      els.statsResults.textContent = placeholder;
    }
    if(els.statsTable){
      els.statsTable.innerHTML = '';
    }
    state.significanceMaxLevel = null;
  }

  function updateStatsButtonState(config){
    if(!els.statsButton){
      return;
    }
    if(config && Object.prototype.hasOwnProperty.call(config,'disabled')){
      els.statsButton.disabled = !!config.disabled;
    }
    if(config && typeof config.label === 'string' && config.label){
      els.statsButton.textContent = config.label;
    }
  }

  function updateSignificanceControlState(options){
    if(!els.boxShowSignificance){
      return;
    }
    const statsReady = !!options?.statsReady;
    els.boxShowSignificance.disabled = !statsReady;
    const label = (typeof els.boxShowSignificance.closest === 'function'
      ? els.boxShowSignificance.closest('label')
      : els.boxShowSignificance.parentElement) || null;
    if(!statsReady){
      const msg = 'Compute statistics first to enable significance bars.';
      els.boxShowSignificance.title = msg;
      if(label){ label.title = msg; }
      if(els.boxSignificanceLabelMode){
        els.boxSignificanceLabelMode.disabled = true;
      }
      if(state.showSignificanceBars){
        state.showSignificanceBars = false;
        els.boxShowSignificance.checked = false;
      }
    }else{
      els.boxShowSignificance.title = '';
      if(label){ label.title = ''; }
      if(els.boxSignificanceLabelMode){
        els.boxSignificanceLabelMode.disabled = false;
      }
    }
  }

  function buildStatsSignature(traces){
    if(!Array.isArray(traces) || !traces.length){
      return 'empty';
    }
    const configKey = [
      state.statsTest,
      state.statsMode,
      state.statsRef,
      state.statsPaired ? 'paired' : 'unpaired',
      state.statsCorrection,
      state.statsEffectParametric,
      state.statsEffectNonParametric,
      state.statsPostHoc,
      state.statsPairsText,
      state.statsCustomPairs?.length || 0
    ].join('|');
    const selectionKey = Array.from(state.selectedCols).sort((a,b)=>a-b).join(',');
    const traceParts = traces.map((trace, idx)=>{
      const summary = trace.summary && Number.isFinite(trace.summary.count)
        ? trace.summary
        : (trace.summary = computeTraceSummary(Array.isArray(trace.rawY) ? trace.rawY : [], { requireSorted: false }));
      const count = Number.isFinite(summary.count) ? summary.count : 0;
      const sum = Number.isFinite(summary.sum) ? summary.sum : 0;
      const sumSquares = Number.isFinite(summary.sumSquares) ? summary.sumSquares : 0;
      return `${trace.name || idx}:${count}:${sum}:${sumSquares}`;
    });
    return `${configKey}::${selectionKey}::${traceParts.join(';')}`;
  }

  function reconcileStatsContextSignature(traces){
    const ctx=state.statsContext;
    if(!ctx){
      return;
    }
    const referenceTraces=Array.isArray(traces) && traces.length?traces:ctx.traces;
    if(!Array.isArray(referenceTraces) || !referenceTraces.length){
      return;
    }
    const nextSignature=buildStatsSignature(referenceTraces);
    if(nextSignature && nextSignature!==state.statsContextSignature){
      console.debug('Debug: box stats signature reconciled',{ previous:state.statsContextSignature, next:nextSignature });
      state.statsContextSignature=nextSignature;
      ctx.signature=nextSignature;
    }
  }

  function primeStatsComputation(traces, svg, helpers){
    const hasTraces = Array.isArray(traces) && traces.length > 0;
    if(!hasTraces){
      state.statsContext = null;
      state.statsContextSignature = null;
      state.statsContextVersion = 0;
      state.statsLastRunVersion = 0;
      state.statsComputationPending = false;
      state.assumptionDiagnostics = null;
      clearStatsOutputs('Add data to enable statistics.');
      setStatsStatus('');
      updateStatsButtonState({ disabled: true, label: 'Calculate statistics' });
      updateSignificanceControlState({ statsReady: false });
      return;
    }
    const previousContext = state.statsContext;
    const signature = buildStatsSignature(traces);
    const svgChanged = previousContext?.svg && previousContext.svg !== svg;
    const contextChanged = signature !== state.statsContextSignature;
    let version = state.statsContextVersion || 0;
    if(contextChanged){
      version += 1;
      state.statsLastRunVersion = 0;
      state.statsComputationPending = false;
      state.assumptionDiagnostics = null;
    }else if(!version){
      version = 1;
    }
    state.statsContextVersion = version;
    state.statsContextSignature = signature;
    state.statsContext = { traces: traces.slice(), svg, helpers, version, signature };
    const hasResults = !!(els.statsResults && els.statsResults.childNodes && els.statsResults.childNodes.length);
    if(state.statsLastRunVersion === version && hasResults){
      setStatsStatus('Statistics up to date.');
      updateStatsButtonState({ disabled: false, label: 'Recalculate statistics' });
      updateSignificanceControlState({ statsReady: true });
    }else{
      clearStatsOutputs('Statistics will appear after calculation.');
      setStatsStatus('Statistics ready to calculate.');
      updateStatsButtonState({ disabled: false, label: 'Calculate statistics' });
      updateSignificanceControlState({ statsReady: false });
    }
    const needsSvgReapply = svgChanged && (state.showSignificanceBars || state.statsLastSignificanceEnabled) && !state.statsComputationPending;
    if(needsSvgReapply){
      console.debug('Debug: box stats recompute for new svg',{ svgChanged, significance: state.showSignificanceBars, version });
      handleStatsComputeClick();
    }
  }

  function handleStatsComputeClick(){
    if(state.statsComputationPending){
      return;
    }
    const context = state.statsContext;
    if(!context || !Array.isArray(context.traces) || !context.traces.length){
      setStatsStatus('Statistics unavailable until data is loaded.');
      return;
    }
    state.statsComputationPending = true;
    updateStatsButtonState({ disabled: true, label: 'Calculating…' });
    setStatsStatus('Calculating statistics…');
    try{
      computeStats(context.traces, context.svg, context.helpers);
      renderStatsTable(context.traces);
      state.statsLastRunVersion = context.version;
      reconcileStatsContextSignature(context.traces);
      setStatsStatus('Statistics up to date.');
      updateSignificanceControlState({ statsReady: true });
    }catch(err){
      console.error('box stats computation failed', err);
      if(els.statsResults){
        els.statsResults.textContent = 'Unable to compute statistics. See console for details.';
      }
      setStatsStatus('Failed to compute statistics.');
    }finally{
      state.statsComputationPending = false;
      const stillCurrent = state.statsContext === context && state.statsContextSignature === context.signature;
      const label = stillCurrent && state.statsLastRunVersion === context.version
        ? 'Recalculate statistics'
        : 'Calculate statistics';
      updateStatsButtonState({ disabled: !stillCurrent, label });
      if(!stillCurrent){
        updateSignificanceControlState({ statsReady: false });
      }
      // Persist the tab payload immediately if the computed results belong to the current context
      try{
        if(stillCurrent && state.statsLastRunVersion === context.version){
          const sess = (window && window.Main && window.Main.session) ? window.Main.session : null;
          if(sess && typeof sess.persistActiveTabState === 'function'){
            sess.persistActiveTabState(undefined, { reason: 'stats-computed' });
          }
        }
      }catch(e){
        console.debug('Debug: persistActiveTabState after stats compute failed', { err: e?.message || String(e) });
      }
    }
  }

  function requestStatsContextRefresh(reason){
    const ctx = state.statsContext;
    const hasContext = ctx && Array.isArray(ctx.traces) && ctx.traces.length > 0;
    if(!hasContext){
      console.debug('Debug: box stats context refresh skipped',{ reason, hasContext: !!ctx });
      if(!ctx){
        clearStatsOutputs('Statistics will appear after calculation.');
        setStatsStatus('');
        updateStatsButtonState({ disabled: true, label: 'Calculate statistics' });
      }
      return false;
    }
    const mergedHelpers = {
      ...(ctx.helpers || {}),
      significance: {
        ...(ctx.helpers?.significance || {}),
        enabled: !!state.showSignificanceBars
      }
    };
    console.debug('Debug: box stats context refresh requested',{
      reason,
      traceCount: ctx.traces.length,
      significanceEnabled: mergedHelpers.significance.enabled
    });
    primeStatsComputation(ctx.traces, ctx.svg, mergedHelpers);
    const significanceChanged = state.statsLastSignificanceEnabled !== !!state.showSignificanceBars;
    const hasFreshResults = state.statsLastRunVersion === state.statsContextVersion && state.statsLastRunVersion > 0;
    if(significanceChanged && hasFreshResults && !state.statsComputationPending){
      console.debug('Debug: box stats auto-recompute for significance',{ significanceChanged, version: state.statsContextVersion });
      handleStatsComputeClick();
    }
    return true;
  }

  // Compute and render statistics and p-value annotations
  function computeStats(traces,svg,helpers){
    const statsDiv=document.getElementById('statsResults');
    if(!statsDiv){ console.warn('Debug: statsResults element not found'); return; }
    statsDiv.innerHTML='';
    if(svg && typeof svg.querySelectorAll==='function'){
      const existingAnnotations=svg.querySelectorAll('.box-significance-annotation');
      existingAnnotations.forEach(node=>{
        if(node && node.parentNode){ node.parentNode.removeChild(node); }
      });
    }
    const hasStatsTable=Shared.statsTable && typeof Shared.statsTable.render==='function';
    let resultsContainer=statsDiv;
    let assumptionContainer=null;
    const renderTableModel=(model,append=false,targetOverride)=>{
      const target=targetOverride || resultsContainer || statsDiv;
      if(hasStatsTable){
        Shared.statsTable.render({ target, append, ...model });
        console.debug('Debug: box stats render via Shared.statsTable',{
          caption:model.caption || null,
          rowCount:model.rows?.length || 0,
          append
        });
        return;
      }
      if(!append){
        target.innerHTML='';
      }
      if(model.caption){
        const captionEl=document.createElement('div');
        captionEl.className='stats-table-lead';
        captionEl.textContent=model.caption;
        target.appendChild(captionEl);
      }
      const table=document.createElement('table');
      const thead=document.createElement('thead');
      const headRow=document.createElement('tr');
      (model.columns||[]).forEach(col=>{
        const th=document.createElement('th');
        th.textContent=col.label;
        if(col.tooltip){
          th.title=col.tooltip;
        }
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);
      const tbody=document.createElement('tbody');
      (model.rows||[]).forEach(row=>{
        const tr=document.createElement('tr');
        (model.columns||[]).forEach(col=>{
          const td=document.createElement('td');
          const value=Array.isArray(row)?row[col.index]:(row?.[col.key]);
          td.textContent=value ?? '';
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      target.appendChild(table);
      if(Array.isArray(model.footnotes) && model.footnotes.length){
        const list=document.createElement('div');
        model.footnotes.forEach(note=>{
          const item=document.createElement('div');
          item.textContent=note;
          list.appendChild(item);
        });
        target.appendChild(list);
      }
      console.debug('Debug: box stats render fallback',{ caption:model.caption || null, rowCount:model.rows?.length || 0, append });
    };
    const setResultsMessage=text=>{
      if(!resultsContainer){
        return;
      }
      resultsContainer.innerHTML='';
      if(typeof text==='string'){
        const msg=document.createElement('div');
        msg.textContent=text;
        resultsContainer.appendChild(msg);
      }
    };
    const significanceEnabled = helpers?.significance?.enabled ?? !!state.showSignificanceBars;
    state.statsLastSignificanceEnabled = !!significanceEnabled;
    state.significanceMaxLevel = null;
    console.debug('Debug: box significance annotations status',{ enabled: significanceEnabled });
    const annotationOpts=helpers?.annotationStyle||{};
    const orientation=annotationOpts.orientation==='horizontal'?'horizontal':'vertical';
    const categoryCenter=typeof helpers?.categoryCenter==='function'
      ? helpers.categoryCenter
      : (typeof helpers?.xCenter==='function'?helpers.xCenter:(idx=>idx));
    const valueToCoord=typeof helpers?.valueToCoord==='function'
      ? helpers.valueToCoord
      : (typeof helpers?.y2px==='function'?helpers.y2px:(val=>val));
    const baseOffset=Number.isFinite(annotationOpts.baseOffset)?annotationOpts.baseOffset:ANN_BASE_OFFSET;
    const levelGap=Number.isFinite(annotationOpts.levelGap)?annotationOpts.levelGap:ANN_LEVEL_GAP;
    console.debug('Debug: box annotation offsets',{baseOffset,levelGap,orientation});
    const annotationMaxByTrace = Array.isArray(helpers?.annotationMaxByTrace) ? helpers.annotationMaxByTrace : null;
    const fallbackTraceMax = idx => {
      const trace = traces?.[idx];
      const values = Array.isArray(trace?.rawY) ? trace.rawY : (Array.isArray(trace?.y) ? trace.y : []);
      if(!values.length){
        return -Infinity;
      }
      let max = -Infinity;
      for(let i = 0; i < values.length; i++){
        const v = values[i];
        if(Number.isFinite(v) && v > max){
          max = v;
        }
      }
      return max;
    };
    const getRenderedMaxValue = idx => {
      if(annotationMaxByTrace && Number.isFinite(annotationMaxByTrace[idx])){
        return annotationMaxByTrace[idx];
      }
      return fallbackTraceMax(idx);
    };
	    const getRenderedRangeMax = (idxA, idxB) => {
	      const start = Math.min(idxA, idxB);
	      const end = Math.max(idxA, idxB);
	      let max = -Infinity;
	      for(let k = start; k <= end; k++){
	        max = Math.max(max, getRenderedMaxValue(k));
	      }
	      return max;
	    };
	    const adaptiveWhiskersEnabled = annotationOpts.whiskerMode === 'adaptive' && annotationOpts.showWhiskers !== false;
	    const annotationBracketSize = Number.isFinite(annotationOpts.bracketSize) ? annotationOpts.bracketSize : 10;
	    const annotationStrokeWidth = Number.isFinite(annotationOpts.strokeWidth) ? annotationOpts.strokeWidth : 1;
	    const minClearance = Math.max(2, annotationStrokeWidth * 1.5);
	    const rawClearance = Math.max(minClearance, Math.min(annotationBracketSize, levelGap * 0.6));
	    const maxClearance = Math.max(minClearance, levelGap - Math.max(2, annotationStrokeWidth));
	    const adaptiveWhiskerClearance = Math.min(rawClearance, maxClearance);
	    const resolveAdaptiveWhiskerOuterCoord = (traceIdx, level) => {
	      if(!adaptiveWhiskersEnabled){ return null; }
	      const renderedMaxValue = getRenderedMaxValue(traceIdx);
	      if(!Number.isFinite(renderedMaxValue)){ return null; }
	      const baseCoord = valueToCoord(renderedMaxValue);
	      if(!Number.isFinite(baseCoord)){ return null; }
	      const lvl = Number.isFinite(level) ? level : 0;
	      return orientation === 'horizontal'
	        ? baseCoord + baseOffset + lvl * levelGap
	        : baseCoord - baseOffset - lvl * levelGap;
	    };
	    const resolveLowerInnerCoord = (traceIdx, level, placedPairs) => {
	      if(!adaptiveWhiskersEnabled || !Array.isArray(placedPairs) || level <= 0){
	        return null;
	      }
	      let candidate = null;
	      for(let i = 0; i < placedPairs.length; i++){
	        const pr = placedPairs[i];
	        if(!pr || !Number.isFinite(pr.innerCoord) || pr.level == null){
	          continue;
	        }
	        if(pr.level >= level){
	          continue;
	        }
	        if(traceIdx < pr.ai || traceIdx > pr.bi){
	          continue;
	        }
	        const coord = pr.innerCoord;
	        if(orientation === 'horizontal'){
	          candidate = candidate == null ? coord : Math.max(candidate, coord);
	        }else{
	          candidate = candidate == null ? coord : Math.min(candidate, coord);
	        }
	      }
	      return candidate;
	    };
	    const clampAdaptiveOuterCoord = (outerCoord, lowerInnerCoord) => {
	      if(!Number.isFinite(outerCoord) || !Number.isFinite(lowerInnerCoord)){
	        return outerCoord;
	      }
	      return orientation === 'horizontal'
	        ? Math.max(outerCoord, lowerInnerCoord + adaptiveWhiskerClearance)
	        : Math.min(outerCoord, lowerInnerCoord - adaptiveWhiskerClearance);
	    };
	    const buildPairAnnotationStyle = (idxA, idxB, level, placedPairs) => {
	      if(!adaptiveWhiskersEnabled){
	        return helpers.annotationStyle;
	      }
	      const outerCoordA = resolveAdaptiveWhiskerOuterCoord(idxA, level);
	      const outerCoordB = resolveAdaptiveWhiskerOuterCoord(idxB, level);
	      const lowerInnerCoordA = resolveLowerInnerCoord(idxA, level, placedPairs);
	      const lowerInnerCoordB = resolveLowerInnerCoord(idxB, level, placedPairs);
	      return {
	        ...helpers.annotationStyle,
	        outerCoordA: clampAdaptiveOuterCoord(outerCoordA, lowerInnerCoordA),
	        outerCoordB: clampAdaptiveOuterCoord(outerCoordB, lowerInnerCoordB)
	      };
	    };
	    if(state.tableFormat==='grouped'){
	      const prepared=prepareGroupedStatsData(traces, helpers || { axisLabels: state.lastAxisLabels });
	      statsDiv.innerHTML='';
	      const summary=document.createElement('div');
      summary.className='stats-table-lead';
      summary.textContent=`Groups: ${prepared.groupsCount} | Conditions: ${prepared.conditionsCount} | Rows with data: ${prepared.rowsWithData || 0}`;
      statsDiv.appendChild(summary);
      if(prepared.partialRowsSkipped){
        const note=document.createElement('div');
        note.style.fontSize='12px';
        note.style.color='#555';
        note.textContent=`${prepared.partialRowsSkipped} row(s) skipped due to missing values.`;
        statsDiv.appendChild(note);
      }
      if(!prepared.ok){
        const warn=document.createElement('div');
        warn.textContent=prepared.message || 'Unable to compute grouped statistics.';
        statsDiv.appendChild(warn);
        return;
      }
      const analysis=state.groupedStats?.analysis || 'twoWayAnova';
      let resultModel;
      if(analysis==='twoWayAnova') resultModel=analyzeTwoWayAnova(prepared);
      else if(analysis==='twoWayMixed') resultModel=analyzeTwoWayMixed(prepared);
      else if(analysis==='threeWayAnova') resultModel=analyzeThreeWayAnova(prepared);
      else if(analysis==='threeWayMixed') resultModel=analyzeThreeWayMixed(prepared);
      else if(analysis==='rowTTests') resultModel=analyzeRowWiseTTests(prepared);
      if(!resultModel || !resultModel.ok){
        const warn=document.createElement('div');
        warn.textContent=resultModel?.message || 'Unable to compute grouped statistics for the selected analysis.';
        statsDiv.appendChild(warn);
        console.debug('Debug: grouped stats unavailable',{ analysis, reason: resultModel?.message });
        return;
      }
      renderTableModel(resultModel, true, statsDiv);
      console.debug('Debug: grouped stats rendered',{ analysis });
      state.assumptionDiagnostics=null;
      return;
    }
    assumptionContainer=document.createElement('div');
    assumptionContainer.className='stats-assumption-container';
    statsDiv.appendChild(assumptionContainer);
    resultsContainer=document.createElement('div');
    resultsContainer.className='stats-results-main';
    statsDiv.appendChild(resultsContainer);
    const indices=[...state.selectedCols];
    if(indices.length<2){
      state.assumptionDiagnostics=null;
      renderAssumptionSection(assumptionContainer,null);
      setResultsMessage('Select at least two columns for statistical analysis.');
      return;
    }
    const groups=indices.map(i=>traces[i].rawY);
    const labels=indices.map(i=>traces[i].name);
    const summaryList=indices.map(i=>{
      const trace=traces[i];
      if(!trace.summary){
        trace.summary=computeTraceSummary(Array.isArray(trace.rawY)?trace.rawY:[],{ requireSorted:false });
      }
      return trace.summary;
    });
    const assumptionDiagnostics=computeAssumptionDiagnostics(groups,labels,{
      qqSampleLimit: ASSUMPTION_QQ_SAMPLE_LIMIT,
      summaries: summaryList
    });
    state.assumptionDiagnostics=assumptionDiagnostics;
    if(assumptionDiagnostics){
      assumptionDiagnostics.parametricOverrideActive=assumptionDiagnostics.recommendNonParametric && state.statsTest==='parametric';
      if(assumptionDiagnostics.parametricOverrideActive){
        console.debug('Debug: box assumptions override active',{ warnings: assumptionDiagnostics.warnings });
      }
    }
    renderAssumptionSection(assumptionContainer,assumptionDiagnostics);
    if(assumptionDiagnostics){
      const varianceConcern=assumptionDiagnostics.varianceConcern===true;
      const normalityFailures=Number.isFinite(assumptionDiagnostics.normalityFailures)
        ? assumptionDiagnostics.normalityFailures
        : 0;
      let variant=state.statsParametricVariant;
      if(state.statsTest!=='parametric'){
        variant='nonparametric';
      }else if(state.statsPaired){
        variant='classic';
      }else if(indices.length>=3 && varianceConcern && normalityFailures===0){
        variant='welch';
      }else{
        variant='classic';
      }
      if(variant!==state.statsParametricVariant){
        console.debug('Debug: box computeStats variant update',{ before:state.statsParametricVariant, after:variant, varianceConcern, normalityFailures });
        state.statsParametricVariant=variant;
        renderStatsControls(traces);
      }
      assumptionDiagnostics.appliedTest=state.statsTest;
      assumptionDiagnostics.appliedVariant=variant;
    }
    // Custom pairs mode
    if(state.statsMode==='custom'){
      if(!state.statsCustomPairs.length){ setResultsMessage('Specify pairs for comparison.'); return; }
      const pairTest=state.statsTest==='parametric'?(state.statsPaired?tTestPaired:tTest):(state.statsPaired?wilcoxonSignedRank:mannWhitney);
      const pairs=[];
      state.statsCustomPairs.forEach(pr=>{
        const aData=traces[pr.ai].rawY; const bData=traces[pr.bi].rawY;
        if(state.statsPaired && aData.length!==bData.length) return;
        const r=pairTest(aData,bData);
        const statName=r.t!==undefined?'t':r.U!==undefined?'U':r.W!==undefined?'W':'stat';
        const statVal=r[statName];
        const effectMetrics=computeEffectSizeMetrics(aData,bData,{ paired:state.statsPaired });
        const formattedParamEffect=formatEffectValue(effectMetrics.parametric?.[paramEffectMeta?.value],paramEffectMeta);
        const formattedNonParamEffect=formatEffectValue(effectMetrics.nonParametric?.[nonParamEffectMeta?.value],nonParamEffectMeta);
        console.debug('Debug: box custom pair effect metrics',{
          pair:{ a:traces[pr.ai].name, b:traces[pr.bi].name },
          parametric:Object.fromEntries(Object.entries(effectMetrics.parametric).map(([key,val])=>[key,safeRound(val,4)])),
          nonParametric:Object.fromEntries(Object.entries(effectMetrics.nonParametric).map(([key,val])=>[key,safeRound(val,4)]))
        });
        const rangeMax = getRenderedRangeMax(pr.ai, pr.bi);
        pairs.push({
          ...pr,
          p:r.p,
          rangeMax,
          labelA:traces[pr.ai].name,
          labelB:traces[pr.bi].name,
          stat:statVal,
          statName,
          df:r.df,
          effects:effectMetrics,
          effectParametric:formattedParamEffect,
          effectNonParametric:formattedNonParamEffect
        });
      });
      const m=pairs.length;
      if(m){
        const adjusted=applyPValueCorrection(pairs.map(pr=>pr.p), state.statsCorrection);
        adjusted.forEach((adj, idx)=>{ pairs[idx].adjP=adj; });
      }
      const correctionMeta=resolveCorrectionMeta(state.statsCorrection,m);
      updateStatsCorrectionSummary(m);
      const tableRows=pairs.map(pr=>({
        comparison:`${pr.labelA} vs ${pr.labelB}`,
        statistic:`${pr.statName} = ${pr.stat.toFixed(4)}`,
        df:pr.df!=null?pr.df:'—',
        padj:formatP(pr.adjP),
        effectParametric:pr.effectParametric,
        effectNonParametric:pr.effectNonParametric
      }));
      renderTableModel({
        caption:'Custom pairwise comparisons',
        columns:[
          {key:'comparison',label:'Comparison',align:'left',index:0},
          {key:'statistic',label:'Statistic',align:'left',index:1},
          {key:'df',label:'df',align:'right',index:2},
          {key:'padj',label:`P (adj, ${correctionMeta.shortLabel})`,align:'right',index:3},
          {key:'effectParametric',label:`Effect (${paramEffectMeta.shortLabel || paramEffectMeta.label})`,align:'right',index:4,tooltip:paramEffectMeta.tooltip},
          {key:'effectNonParametric',label:`Effect (${nonParamEffectMeta.shortLabel || nonParamEffectMeta.label})`,align:'right',index:5,tooltip:nonParamEffectMeta.tooltip}
        ],
        rows:tableRows,
        footnotes:[
          ...(correctionMeta.footnote ? [correctionMeta.footnote] : []),
          ...effectFootnotes
        ],
        options:{
          fileName:'box-custom-comparisons',
          contextLabel:'box-custom'
        }
      });
	      if(pairs.length){
	        pairs.sort((a,b)=>(a.bi-a.ai)-(b.bi-b.ai));
	        const placed=[];
	        pairs.forEach(pr=>{
	          let level=0; while(placed.some(pl=>!(pl.bi<pr.ai||pl.ai>pr.bi)&&pl.level===level)) level++;
	          const baseCoord=valueToCoord(pr.rangeMax);
	          const annotationCoord=orientation==='horizontal'
	            ? baseCoord+baseOffset+level*levelGap
	            : baseCoord-baseOffset-level*levelGap;
	          const innerCoord=orientation==='horizontal'
	            ? annotationCoord+annotationBracketSize
	            : annotationCoord-annotationBracketSize;
	          const annotationStyle = buildPairAnnotationStyle(pr.ai, pr.bi, level, placed);
	          annotatePair(svg,categoryCenter(pr.ai),categoryCenter(pr.bi),annotationCoord,pr.p,annotationStyle);
	          pr.level=level;
	          pr.annotationCoord=annotationCoord;
	          pr.innerCoord=innerCoord;
	          placed.push(pr);
	        });
	        if(significanceEnabled){
	          const maxLevel = Math.max(...pairs.map(pr=>pr.level));
	          state.significanceMaxLevel = Number.isFinite(maxLevel) ? maxLevel : 0;
	        }
      }
      return;
    }
    const param=state.statsTest==='parametric';
    const paramVariant=param?state.statsParametricVariant:'nonparametric';
    const pairTest=param?(state.statsPaired?tTestPaired:tTest):(state.statsPaired?wilcoxonSignedRank:mannWhitney);
    const paramEffectMeta=resolveEffectOptionMeta('parametric',state.statsEffectParametric);
    const nonParamEffectMeta=resolveEffectOptionMeta('nonparametric',state.statsEffectNonParametric);
    const effectFootnotes=buildEffectFootnotes(paramEffectMeta,nonParamEffectMeta);
    console.debug('Debug: box effect meta',{ parametric:paramEffectMeta?.value, nonParametric:nonParamEffectMeta?.value });
    if(state.statsPaired && groups.some(g=>g.length!==groups[0].length)){
      setResultsMessage('Paired tests require equal group sizes.'); return;
    }
    // Two-group case
    if(indices.length===2){
      const res=pairTest(groups[0],groups[1]);
      const statName=res.t!==undefined?'t':res.U!==undefined?'U':res.W!==undefined?'W':'stat';
      const effectMetrics=computeEffectSizeMetrics(groups[0],groups[1],{ paired:state.statsPaired });
      console.debug('Debug: box pair summary effect metrics',{
        labels:labels,
        parametric:Object.fromEntries(Object.entries(effectMetrics.parametric).map(([key,val])=>[key,safeRound(val,4)])),
        nonParametric:Object.fromEntries(Object.entries(effectMetrics.nonParametric).map(([key,val])=>[key,safeRound(val,4)]))
      });
      const formattedParamEffect=formatEffectValue(effectMetrics.parametric?.[paramEffectMeta?.value],paramEffectMeta);
      const formattedNonParamEffect=formatEffectValue(effectMetrics.nonParametric?.[nonParamEffectMeta?.value],nonParamEffectMeta);
      const summaryRows=[
        { metric:'Comparison', value:`${labels[0]} vs ${labels[1]}` },
        { metric:'Test', value:param?(state.statsPaired?'Paired t-test':'t-test'):(state.statsPaired?'Wilcoxon signed-rank':'Mann-Whitney U') },
        { metric:statName, value:res[statName].toFixed(4) }
      ];
      if(res.df!==undefined){ summaryRows.push({ metric:'df', value:res.df.toFixed(4) }); }
      summaryRows.push({ metric:'P value', value:formatP(res.p) });
      const correctionMeta=resolveCorrectionMeta(state.statsCorrection,1);
      const adjusted=applyPValueCorrection([res.p], state.statsCorrection);
      const adjValue=Array.isArray(adjusted) && adjusted.length?adjusted[0]:res.p;
      summaryRows.push({ metric:`P (${correctionMeta.shortLabel})`, value:formatP(adjValue) });
      summaryRows.push({ metric:`Effect (${paramEffectMeta.shortLabel || paramEffectMeta.label})`, value:formattedParamEffect });
      summaryRows.push({ metric:`Effect (${nonParamEffectMeta.shortLabel || nonParamEffectMeta.label})`, value:formattedNonParamEffect });
      updateStatsCorrectionSummary(1);
      const footnotes=[
        ...(correctionMeta.footnote ? [correctionMeta.footnote] : []),
        ...effectFootnotes
      ];
      renderTableModel({
        caption:'Pairwise test summary',
        columns:[
          {key:'metric',label:'Metric',align:'left',index:0},
          {key:'value',label:'Value',align:'left',index:1}
        ],
        rows:summaryRows,
        footnotes,
        options:{
          fileName:'box-pairwise-summary',
          contextLabel:'box-pairwise'
        }
      });
      const from=Math.min(indices[0],indices[1]);
      const to=Math.max(indices[0],indices[1]);
	      const rangeMax=getRenderedRangeMax(from,to);
	      const baseCoord=valueToCoord(rangeMax);
	      const annotationCoord=orientation==='horizontal'?baseCoord+baseOffset:baseCoord-baseOffset;
	      if(significanceEnabled){
	        annotatePair(svg,categoryCenter(indices[0]),categoryCenter(indices[1]),annotationCoord,res.p,buildPairAnnotationStyle(indices[0], indices[1], 0, null));
	        state.significanceMaxLevel = 0;
	      }else{
	        console.debug('Debug: box significance annotation skipped for pair',{ p: res.p, significanceEnabled });
	      }
      return;
    }
    // Multi-group
    let overall=null;
    const overallFootnotes=[];
    if(!state.statsPaired){
      if(param){
        if(paramVariant==='welch'){
          const welch=computeWelchAnova(groups);
          if(welch.ok){
            overall={ method:'welch', F:welch.F, p:welch.p, df1:welch.df1, df2:welch.df2, footnote:welch.footnote };
            if(welch.footnote){ overallFootnotes.push(welch.footnote); }
          }else{
            console.debug('Debug: box welchAnova unavailable', welch);
          }
        }
        if(!overall){
          const classic=anova(groups);
          if(classic){
            overall={ method:'anova', F:classic.F, p:classic.p, df1:classic.dfBetween, df2:classic.dfWithin };
          }
        }
      }else{
        const kw=kruskalWallis(groups);
        overall={ method:'kruskal', H:kw.H, p:kw.p, df:groups.length-1 };
      }
    }
    const maxVal=Math.max(...indices.map(i=>Math.max(...traces[i].y)));
    const xs=indices.map(i=>categoryCenter(i));
    let pairs=[];
    let referenceLabel=null;
    let methodFootnotes=[];
    const postHocMode=ensureValidPostHoc(state.statsPostHoc,{
      mode: state.statsMode,
      test: param?'parametric':'nonparametric',
      paired: state.statsPaired,
      groupCount: indices.length,
      variant: paramVariant,
      varianceConcern: state.assumptionDiagnostics?.varianceConcern===true
    });
    if(postHocMode!==state.statsPostHoc){
      console.debug('Debug: box computeStats postHoc normalized',{ before:state.statsPostHoc, after:postHocMode });
      state.statsPostHoc=postHocMode;
    }
    if(state.statsMode==='all'){
      if(postHocMode==='tukey'){
        const tukey=computeTukeyComparisons(groups,labels);
        if(!tukey.ok){
          setResultsMessage(tukey.message || 'Unable to compute Tukey HSD.');
          updateStatsCorrectionSummary(0);
          return;
        }
        methodFootnotes.push(tukey.footnote);
        pairs=tukey.pairs.map(pr=>{
          const ai=indices[pr.i];
          const bi=indices[pr.j];
          const effectMetrics=computeEffectSizeMetrics(traces[ai].rawY,traces[bi].rawY,{ paired:false });
          const formattedParamEffect=formatEffectValue(effectMetrics.parametric?.[paramEffectMeta?.value],paramEffectMeta);
          const formattedNonParamEffect=formatEffectValue(effectMetrics.nonParametric?.[nonParamEffectMeta?.value],nonParamEffectMeta);
          const rangeMax = getRenderedRangeMax(ai, bi);
          return {
            a:pr.i,
            b:pr.j,
            ai,
            bi,
            p:pr.pAdj,
            adjP:pr.pAdj,
            stat:pr.q,
            statName:'q',
            df:pr.df,
            labelA:labels[pr.i],
            labelB:labels[pr.j],
            effects:effectMetrics,
            effectParametric:formattedParamEffect,
            effectNonParametric:formattedNonParamEffect,
            rangeMax,
            method:'tukey'
          };
        });
        updateStatsCorrectionSummary(pairs.length);
      }else if(postHocMode==='gamesHowell'){
        const gh=computeGamesHowellComparisons(groups,labels);
        if(!gh.ok){
          setResultsMessage(gh.message || 'Unable to compute Games–Howell comparisons.');
          updateStatsCorrectionSummary(0);
          return;
        }
        methodFootnotes.push(gh.footnote);
        pairs=gh.pairs.map(pr=>{
          const ai=indices[pr.i];
          const bi=indices[pr.j];
          const effectMetrics=computeEffectSizeMetrics(traces[ai].rawY,traces[bi].rawY,{ paired:false });
          const formattedParamEffect=formatEffectValue(effectMetrics.parametric?.[paramEffectMeta?.value],paramEffectMeta);
          const formattedNonParamEffect=formatEffectValue(effectMetrics.nonParametric?.[nonParamEffectMeta?.value],nonParamEffectMeta);
          const rangeMax = getRenderedRangeMax(ai, bi);
          return {
            a:pr.i,
            b:pr.j,
            ai,
            bi,
            p:pr.p,
            adjP:pr.pAdj,
            stat:pr.q,
            statName:'q',
            df:pr.df,
            labelA:labels[pr.i],
            labelB:labels[pr.j],
            effects:effectMetrics,
            effectParametric:formattedParamEffect,
            effectNonParametric:formattedNonParamEffect,
            rangeMax,
            method:'gamesHowell'
          };
        });
        updateStatsCorrectionSummary(pairs.length);
      }else if(postHocMode==='dunn'){
        const dunn=computeDunnComparisons(groups,labels);
        if(!dunn.ok){
          setResultsMessage(dunn.message || "Unable to compute Dunn's test.");
          updateStatsCorrectionSummary(0);
          return;
        }
        methodFootnotes.push(dunn.footnote);
        pairs=dunn.pairs.map(pr=>{
          const ai=indices[pr.i];
          const bi=indices[pr.j];
          const effectMetrics=computeEffectSizeMetrics(traces[ai].rawY,traces[bi].rawY,{ paired:false });
          const formattedParamEffect=formatEffectValue(effectMetrics.parametric?.[paramEffectMeta?.value],paramEffectMeta);
          const formattedNonParamEffect=formatEffectValue(effectMetrics.nonParametric?.[nonParamEffectMeta?.value],nonParamEffectMeta);
          const rangeMax = getRenderedRangeMax(ai, bi);
          return {
            a:pr.i,
            b:pr.j,
            ai,
            bi,
            p:pr.p,
            stat:pr.z,
            statName:'z',
            df:null,
            labelA:labels[pr.i],
            labelB:labels[pr.j],
            effects:effectMetrics,
            effectParametric:formattedParamEffect,
            effectNonParametric:formattedNonParamEffect,
            rangeMax,
            method:'dunn'
          };
        });
        if(pairs.length && postHocMode!=='gamesHowell'){
          const adjusted=applyPValueCorrection(pairs.map(pr=>pr.p), state.statsCorrection);
          adjusted.forEach((adj, idx)=>{ pairs[idx].adjP=adj; });
        }
        updateStatsCorrectionSummary(pairs.length);
      }else{
        for(let i=0;i<indices.length;i++){
          for(let j=i+1;j<indices.length;j++){
            const aIdx=indices[i],bIdx=indices[j];
            const aValues=traces[aIdx].rawY;
            const bValues=traces[bIdx].rawY;
            const r=pairTest(aValues,bValues);
            const statName=r.t!==undefined?'t':r.U!==undefined?'U':r.W!==undefined?'W':'stat';
            const statVal=r[statName];
            const effectMetrics=computeEffectSizeMetrics(aValues,bValues,{ paired:state.statsPaired });
            const formattedParamEffect=formatEffectValue(effectMetrics.parametric?.[paramEffectMeta?.value],paramEffectMeta);
            const formattedNonParamEffect=formatEffectValue(effectMetrics.nonParametric?.[nonParamEffectMeta?.value],nonParamEffectMeta);
            console.debug('Debug: box pair effect metrics',{ comparison:`${labels[i]} vs ${labels[j]}`, parametric:Object.fromEntries(Object.entries(effectMetrics.parametric).map(([key,val])=>[key,safeRound(val,4)])), nonParametric:Object.fromEntries(Object.entries(effectMetrics.nonParametric).map(([key,val])=>[key,safeRound(val,4)])) });
            const rangeMax = getRenderedRangeMax(aIdx, bIdx);
            pairs.push({
              a:i,
              b:j,
              ai:aIdx,
              bi:bIdx,
              p:r.p,
              rangeMax,
              stat:statVal,
              statName,
              df:r.df,
              labelA:labels[i],
              labelB:labels[j],
              effects:effectMetrics,
              effectParametric:formattedParamEffect,
              effectNonParametric:formattedNonParamEffect,
              method:'standard'
            });
          }
        }
        if(pairs.length && postHocMode!=='gamesHowell'){
          const adjusted=applyPValueCorrection(pairs.map(pr=>pr.p), state.statsCorrection);
          adjusted.forEach((adj, idx)=>{ pairs[idx].adjP=adj; });
        }
        updateStatsCorrectionSummary(pairs.length);
      }
    } else if(state.statsMode==='reference'){
      const refIdx=indices.indexOf(state.statsRef); if(refIdx===-1){ setResultsMessage('Select reference column among the chosen groups.'); return; }
      const refData=groups[refIdx];
      referenceLabel=labels[refIdx];
      if(postHocMode==='tukey'){
        const tukey=computeTukeyComparisons(groups,labels);
        if(!tukey.ok){
          setResultsMessage(tukey.message || 'Unable to compute Tukey HSD.');
          updateStatsCorrectionSummary(0);
          return;
        }
        methodFootnotes.push(tukey.footnote);
        const filtered=tukey.pairs.filter(pr=>pr.i===refIdx || pr.j===refIdx);
        pairs=filtered.map(pr=>{
          const ai=indices[pr.i];
          const bi=indices[pr.j];
          const effectMetrics=computeEffectSizeMetrics(traces[ai].rawY,traces[bi].rawY,{ paired:false });
          const formattedParamEffect=formatEffectValue(effectMetrics.parametric?.[paramEffectMeta?.value],paramEffectMeta);
          const formattedNonParamEffect=formatEffectValue(effectMetrics.nonParametric?.[nonParamEffectMeta?.value],nonParamEffectMeta);
          const rangeMax = getRenderedRangeMax(ai, bi);
          return {
            a:pr.i,
            b:pr.j,
            ai,
            bi,
            p:pr.pAdj,
            adjP:pr.pAdj,
            stat:pr.q,
            statName:'q',
            df:pr.df,
            labelA:labels[pr.i],
            labelB:labels[pr.j],
            effects:effectMetrics,
            effectParametric:formattedParamEffect,
            effectNonParametric:formattedNonParamEffect,
            rangeMax,
            method:'tukey'
          };
        });
        updateStatsCorrectionSummary(pairs.length);
      }else if(postHocMode==='gamesHowell'){
        const gh=computeGamesHowellComparisons(groups,labels);
        if(!gh.ok){
          setResultsMessage(gh.message || 'Unable to compute Games–Howell comparisons.');
          updateStatsCorrectionSummary(0);
          return;
        }
        methodFootnotes.push(gh.footnote);
        const filtered=gh.pairs.filter(pr=>pr.i===refIdx || pr.j===refIdx);
        pairs=filtered.map(pr=>{
          const ai=indices[pr.i];
          const bi=indices[pr.j];
          const effectMetrics=computeEffectSizeMetrics(traces[ai].rawY,traces[bi].rawY,{ paired:false });
          const formattedParamEffect=formatEffectValue(effectMetrics.parametric?.[paramEffectMeta?.value],paramEffectMeta);
          const formattedNonParamEffect=formatEffectValue(effectMetrics.nonParametric?.[nonParamEffectMeta?.value],nonParamEffectMeta);
          const rangeMax = getRenderedRangeMax(ai, bi);
          return {
            a:pr.i,
            b:pr.j,
            ai,
            bi,
            p:pr.p,
            adjP:pr.pAdj,
            stat:pr.q,
            statName:'q',
            df:pr.df,
            labelA:labels[pr.i],
            labelB:labels[pr.j],
            effects:effectMetrics,
            effectParametric:formattedParamEffect,
            effectNonParametric:formattedNonParamEffect,
            rangeMax,
            method:'gamesHowell'
          };
        });
        updateStatsCorrectionSummary(pairs.length);
      }else if(postHocMode==='dunn'){
        const dunn=computeDunnComparisons(groups,labels);
        if(!dunn.ok){
          setResultsMessage(dunn.message || "Unable to compute Dunn's test.");
          updateStatsCorrectionSummary(0);
          return;
        }
        methodFootnotes.push(dunn.footnote);
        const filtered=dunn.pairs.filter(pr=>pr.i===refIdx || pr.j===refIdx);
        pairs=filtered.map(pr=>{
          const ai=indices[pr.i];
          const bi=indices[pr.j];
          const effectMetrics=computeEffectSizeMetrics(traces[ai].rawY,traces[bi].rawY,{ paired:false });
          const formattedParamEffect=formatEffectValue(effectMetrics.parametric?.[paramEffectMeta?.value],paramEffectMeta);
          const formattedNonParamEffect=formatEffectValue(effectMetrics.nonParametric?.[nonParamEffectMeta?.value],nonParamEffectMeta);
          const rangeMax = getRenderedRangeMax(ai, bi);
          return {
            a:pr.i,
            b:pr.j,
            ai,
            bi,
            p:pr.p,
            stat:pr.z,
            statName:'z',
            df:null,
            labelA:labels[pr.i],
            labelB:labels[pr.j],
            effects:effectMetrics,
            effectParametric:formattedParamEffect,
            effectNonParametric:formattedNonParamEffect,
            rangeMax,
            method:'dunn'
          };
        });
        if(pairs.length && postHocMode!=='gamesHowell'){
          const adjusted=applyPValueCorrection(pairs.map(pr=>pr.p), state.statsCorrection);
          adjusted.forEach((adj, idx)=>{ pairs[idx].adjP=adj; });
        }
        updateStatsCorrectionSummary(pairs.length);
      }else{
        indices.forEach((idx,i)=>{
          if(i===refIdx) return;
          const compareValues=traces[idx].rawY;
          const r=pairTest(refData,compareValues);
          const statName=r.t!==undefined?'t':r.U!==undefined?'U':r.W!==undefined?'W':'stat';
          const statVal=r[statName];
          const effectMetrics=computeEffectSizeMetrics(refData,compareValues,{ paired:state.statsPaired });
          const formattedParamEffect=formatEffectValue(effectMetrics.parametric?.[paramEffectMeta?.value],paramEffectMeta);
          const formattedNonParamEffect=formatEffectValue(effectMetrics.nonParametric?.[nonParamEffectMeta?.value],nonParamEffectMeta);
          console.debug('Debug: box reference pair effect metrics',{ comparison:`${labels[refIdx]} vs ${labels[i]}`, parametric:Object.fromEntries(Object.entries(effectMetrics.parametric).map(([key,val])=>[key,safeRound(val,4)])), nonParametric:Object.fromEntries(Object.entries(effectMetrics.nonParametric).map(([key,val])=>[key,safeRound(val,4)])) });
          const rangeMax = getRenderedRangeMax(state.statsRef, idx);
          pairs.push({
            a:refIdx,
            b:i,
            ai:state.statsRef,
            bi:idx,
            p:r.p,
            rangeMax,
            labelA:labels[refIdx],
            labelB:labels[i],
            stat:statVal,
            statName,
            df:r.df,
            effects:effectMetrics,
            effectParametric:formattedParamEffect,
            effectNonParametric:formattedNonParamEffect,
            method:'standard'
          });
        });
        if(pairs.length && postHocMode!=='gamesHowell'){
          const adjusted=applyPValueCorrection(pairs.map(pr=>pr.p), state.statsCorrection);
          adjusted.forEach((adj, idx)=>{ pairs[idx].adjP=adj; });
        }
        updateStatsCorrectionSummary(pairs.length);
      }
    }
    if(pairs.length){
      let correctionMeta;
      if(postHocMode==='tukey'){
        correctionMeta={ key:'tukey', label:'Tukey HSD', shortLabel:'Tukey HSD', footnote:null };
      }else if(postHocMode==='gamesHowell'){
        correctionMeta={ key:'gamesHowell', label:'Games–Howell', shortLabel:'Games–Howell', footnote:null };
      }else{
        correctionMeta=resolveCorrectionMeta(state.statsCorrection,pairs.length);
      }
      updateStatsCorrectionSummary(pairs.length);
      console.debug('Debug: box pairwise correction applied',{ method:correctionMeta.key, count:pairs.length });
      const footnotes=[];
      if(correctionMeta.footnote){ footnotes.push(correctionMeta.footnote); }
      methodFootnotes.forEach(note=>{ if(note){ footnotes.push(note); } });
      let appendForPairs=false;
      if(!state.statsPaired && overall){
        const overallLabel=overall.method==='welch'
          ? 'Welch ANOVA'
          : overall.method==='anova'
            ? 'ANOVA'
            : 'Kruskal-Wallis';
        const overallStatName=overall.method==='kruskal'?'H':'F';
        const statValue=overall.method==='kruskal'?overall.H:overall.F;
        const overallRows=[
          { metric:'Overall test', value:overallLabel },
          { metric:overallStatName, value:Number.isFinite(statValue)?statValue.toFixed(4):'—' }
        ];
        if(overall.method==='welch' || overall.method==='anova'){
          const dfLabel=overall.method==='welch'
            ? `df = ${overall.df1}, ${Number.isFinite(overall.df2)?overall.df2.toFixed(2):'∞'}`
            : `${groups.length-1},${groups.reduce((s,g)=>s+g.length,0)-groups.length}`;
          overallRows.push({ metric:'df', value:dfLabel });
        }else if(overall?.df!=null){
          overallRows.push({ metric:'df', value:String(overall.df) });
        }
        overallRows.push({ metric:'P value', value:formatP(overall.p) });
        renderTableModel({
          caption:'Overall test summary',
          columns:[
            {key:'metric',label:'Metric',align:'left',index:0},
            {key:'value',label:'Value',align:'left',index:1}
          ],
          rows:overallRows,
          footnotes:overallFootnotes.slice(),
          options:{
            fileName:'box-overall-test',
            contextLabel:'box-overall'
          }
        });
        appendForPairs=true;
      }
      const pairRows=pairs.map(pr=>({
        comparison:`${pr.labelA ?? labels[pr.a]} vs ${pr.labelB ?? labels[pr.b]}`,
        statistic:`${pr.statName} = ${pr.stat.toFixed(4)}`,
        df:Number.isFinite(pr.df)?pr.df.toFixed(2):(pr.df===Infinity?'∞':'—'),
        padj:formatP(pr.adjP),
        effectParametric:pr.effectParametric,
        effectNonParametric:pr.effectNonParametric
      }));
      if(referenceLabel){
        footnotes.push(`Reference group: ${referenceLabel}`);
      }
      effectFootnotes.forEach(note=>footnotes.push(note));
      const pLabel=postHocMode==='tukey'
        ? 'P (Tukey HSD)'
        : postHocMode==='gamesHowell'
          ? 'P (Games–Howell)'
          : `P (adj, ${correctionMeta.shortLabel})`;
      renderTableModel({
        caption: state.statsMode==='reference' ? 'Comparisons vs reference' : 'Pairwise comparisons',
        columns:[
          {key:'comparison',label:'Comparison',align:'left',index:0},
          {key:'statistic',label:'Statistic',align:'left',index:1},
          {key:'df',label:'df',align:'right',index:2},
          {key:'padj',label:pLabel,align:'right',index:3},
          {key:'effectParametric',label:`Effect (${paramEffectMeta.shortLabel || paramEffectMeta.label})`,align:'right',index:4,tooltip:paramEffectMeta.tooltip},
          {key:'effectNonParametric',label:`Effect (${nonParamEffectMeta.shortLabel || nonParamEffectMeta.label})`,align:'right',index:5,tooltip:nonParamEffectMeta.tooltip}
        ],
        rows:pairRows,
        footnotes,
        options:{
          fileName:'box-pairwise-comparisons',
          contextLabel:'box-pairs'
        }
      },appendForPairs);
	      if(significanceEnabled && pairs.length){
	        pairs.sort((a,b)=>(a.bi-a.ai)-(b.bi-b.ai));
	        const placed=[];
	        pairs.forEach(pr=>{
	          let level=0; while(placed.some(pl=>!(pl.bi<pr.ai||pl.ai>pr.bi)&&pl.level===level)) level++;
	          const baseCoord=valueToCoord(pr.rangeMax);
	          const annotationCoord=orientation==='horizontal'
	            ? baseCoord+baseOffset+level*levelGap
	            : baseCoord-baseOffset-level*levelGap;
	          const innerCoord=orientation==='horizontal'
	            ? annotationCoord+annotationBracketSize
	            : annotationCoord-annotationBracketSize;
	          const annotationStyle = buildPairAnnotationStyle(pr.ai, pr.bi, level, placed);
	          annotatePair(svg,categoryCenter(pr.ai),categoryCenter(pr.bi),annotationCoord,pr.p,annotationStyle);
	          pr.level=level;
	          pr.annotationCoord=annotationCoord;
	          pr.innerCoord=innerCoord;
	          placed.push(pr);
	        });
        const maxLevel=Math.max(...pairs.map(pr=>pr.level));
        state.significanceMaxLevel = Number.isFinite(maxLevel) ? maxLevel : 0;
      }else{
        console.debug('Debug: box significance annotation skipped for pairs',{ pairCount: pairs.length, significanceEnabled });
      }
    } else {
      // No pairwise; show overall only if available
      if(significanceEnabled && !state.statsPaired && indices.length>2 && overall){
        annotateOverall(svg,xs,valueToCoord,maxVal,overall.p,0,helpers.annotationStyle);
        state.significanceMaxLevel = 0;
      }else if(!significanceEnabled){
        console.debug('Debug: box overall significance annotation skipped',{ significanceEnabled, groupCount: indices.length, overallP: overall?.p });
      }
      updateStatsCorrectionSummary(0);
    }
  }

  // PART: DRAW

  function draw(){
    const token = ++state.drawToken;
    console.log('boxplot draw start',{token});
    hideBoxTooltip('draw-start');
    const debugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
    ensureWhiskerState();
    const significanceStyle = ensureSignificanceStyle();
    const whiskerRuleCurrent = state.whiskerRule;
    const whiskerCustomValue = state.whiskerCustomMultiplier;
    const whiskerMetaGlobal = resolveWhiskerMeta(whiskerRuleCurrent);
    const whiskerNeedsSd = whiskerMetaGlobal.mode === 'sd';
    const annotateWithTitle = (node,text)=>{
      if(!node || !text){ return; }
      const title=document.createElementNS(NS,'title');
      title.textContent=text;
      node.appendChild(title);
    };
    const violinState = ensureViolinState();
    const colorMode = els.boxColorUnified.checked ? 'unified' : 'individual';
    const defaultFill = els.boxFill.value;
    const defaultBorder = els.boxBorder.value;
    const borderWidthRaw = Number(els.boxBorderWidth.value);
    const errorBarWidthInput = Number(els.boxErrorBarWidth?.value);
    const errorBarWidthRaw = Number.isFinite(errorBarWidthInput) ? errorBarWidthInput : borderWidthRaw;
    const containerRect = els.svgBox?.getBoundingClientRect?.();
    const fontInfo = chartStyle.resolveScaledFontSize({
      rawSize: els.boxFontSize.value,
      width: containerRect?.width,
      height: containerRect?.height,
      svgBox: els.svgBox,
      input: els.boxFontSize
    });
    const fs = fontInfo.scaledPx;
    const styleScaleInfo = fontInfo.scaleInfo;
    const axisSettings = ensureAxisSettings();
    console.debug('Debug: box axis settings current',{
      strokeWidth: axisSettings.strokeWidth,
      color: axisSettings.color,
      tickIntervalX: axisSettings.x?.tickInterval || null,
      tickIntervalY: axisSettings.y?.tickInterval || null
    });
    const axisStrokeBase = getAxisStrokeWidthBase();
    const axisStrokeWidth = chartStyle.scaleStrokeWidth(axisStrokeBase, styleScaleInfo, { context: 'box-axis', min: 0.5 });
    const axisStrokeColor = getAxisColor();
    const gridStrokeWidth = chartStyle.scaleStrokeWidth(1, styleScaleInfo, { context: 'box-grid', min: 0.25 });
    const borderWidthPx = chartStyle.scaleStrokeWidth(borderWidthRaw, styleScaleInfo, { context: 'box-border', min: 0 });
    const errorBarWidthPx = chartStyle.scaleStrokeWidth(errorBarWidthRaw, styleScaleInfo, { context: 'box-errorbar', min: 0 });
    const pointRadius = chartStyle.scaleRadius(5, styleScaleInfo, { context: 'box-point', min: 0.75 });
    const annotationStrokeWidthBase = Number.isFinite(significanceStyle.thickness) && significanceStyle.thickness > 0
      ? significanceStyle.thickness
      : DEFAULT_SIGNIFICANCE_THICKNESS;
    const annotationStrokeWidth = chartStyle.scaleStrokeWidth(annotationStrokeWidthBase, styleScaleInfo, { context: 'box-annotation', min: 0.5 });
	    const annotationColor = typeof significanceStyle.color === 'string' && significanceStyle.color.trim()
	      ? significanceStyle.color.trim()
	      : DEFAULT_SIGNIFICANCE_COLOR;
	    const annotationShowWhiskers = significanceStyle.showWhiskers !== false;
	    const annotationWhiskerMode = normalizeSignificanceWhiskerMode(significanceStyle.whiskerMode);
	    let annotationBaseOffset = chartStyle.scaleLength(ANN_BASE_OFFSET, styleScaleInfo, { context: 'box-annotation-offset', min: 10 });
	    const annotationLevelGap = chartStyle.scaleLength(ANN_LEVEL_GAP, styleScaleInfo, { context: 'box-annotation-gap', min: 8 });
	    const annotationBracketSize = chartStyle.scaleLength(12, styleScaleInfo, { context: 'box-annotation-bracket', min: 8 });
	    const showSignificance = !!state.showSignificanceBars;
    console.debug('Debug: box showSignificance flag',{ showSignificance });
    chartStyle.renderFontSizeLabel({ element: els.boxFontSizeVal, fontInfo, input: els.boxFontSize });
    console.debug('Debug: box font scaling applied',{
      input: els.boxFontSize.value,
      fontSizePt: fontInfo.pt,
      baseFontPx: fontInfo.px,
      scaledFontPx: fs,
      scale: fontInfo.scaleInfo?.scale,
      containerWidth: containerRect?.width,
      containerHeight: containerRect?.height
    });
    console.debug('Debug: box style scaling applied',{
      borderWidthRaw,
      borderWidthPx,
      errorBarWidthRaw,
      errorBarWidthPx,
      axisStrokeWidth,
      gridStrokeWidth,
      pointRadius,
      annotationStrokeWidth,
      annotationStrokeWidthBase,
      annotationColor,
      annotationShowWhiskers,
      annotationBaseOffset,
      annotationLevelGap,
      annotationBracketSize,
      styleScale: styleScaleInfo?.styleScale
    });
    const axisMetrics = chartStyle.createAxisMetrics(fs);
    console.debug('Debug: box axis metrics', axisMetrics);
    const showGrid = els.boxShowGrid.checked;
    const showFrame = !!els.boxShowFrame?.checked;
    console.debug('Debug: box showFrame state',{ showFrame });
    ensureBoxLegendControlPlacement();
    const showLegend = !els.boxShowLegend || !!els.boxShowLegend.checked;
    console.debug('Debug: box showLegend state',{ showLegend });
    const logScale = els.boxLogScale.checked;
    const graphTypeRaw = els.boxGraphType.value;
    const annotationClearanceMin = Math.max(
      6,
      (fs || 12) * 0.35,
      (pointRadius || 0) * 1.5,
      (borderWidthPx || 0) * 1.5,
      (errorBarWidthPx || 0) * 1.25
    );
    const annotationOffsetFactor = (graphTypeRaw === 'box' || graphTypeRaw === 'notched')
      ? 0.65
      : (graphTypeRaw === 'violin')
        ? 0.8
        : 0.9;
    annotationBaseOffset = Math.max(annotationClearanceMin, annotationBaseOffset * annotationOffsetFactor);
    if(debugEnabled && graphTypeRaw === 'violin'){
      console.debug('Debug: box violin draw settings',{ auto: violinState.autoBandwidth !== false, manualBandwidth: violinState.bandwidth, sampleCount: violinState.sampleCount });
    }
    const isIndividualValues = graphTypeRaw === 'strip';
    let individualSummaryMode = 'none';
    if(isIndividualValues){
      const domValue = els.boxIndividualSummary?.value;
      const normalizedDom = domValue ? normalizeIndividualSummaryValue(domValue) : null;
      const summaryValue = normalizedDom || normalizeIndividualSummaryValue(state.individualSummary);
      individualSummaryMode = summaryValue;
      if(summaryValue !== state.individualSummary){
        state.individualSummary = summaryValue;
        console.debug('Debug: box individual summary state sync',{ summaryValue });
      }
      if(els.boxIndividualSummary && els.boxIndividualSummary.value !== summaryValue){
        els.boxIndividualSummary.value = summaryValue;
      }
    }
    console.debug('Debug: box individual summary mode',{ graphTypeRaw, individualSummaryMode });
    const pointMode = els.boxPointMode.value;
    const showCaps = els.boxShowCaps.checked;
    const errorMode = els.boxErrorMode.value;
    const isFlipped = !!els.boxFlipAxes?.checked;
    state.flipAxes = isFlipped;
    if(els.boxLogScaleLabel){
      els.boxLogScaleLabel.textContent = isFlipped ? 'Log Scale (Values)' : 'Log Scale (Y)';
    }
    console.debug('Debug: box draw orientation',{ isFlipped });
    let legendRenderer = chartStyle.createLegendRenderer({ entries: [], fontSize: fs, strokeWidth: borderWidthPx });
    let legendGapPx = 0;
    let legendWidthForMargin = 0;
    console.debug('Debug: box legend initial state',{ legendWidthForMargin, legendGapPx, entryCount: legendRenderer.entries.length });
    const traces = [];
    const traceLabels = [];
    let axisLabels = [];
    let axisGroupIndices = [];
    const groupColorAssignments = new Map();
    const resolveTraceColor = (trace, index) => {
      const rawColorIndex = isGroupedMode && Number.isInteger(trace?.groupIndex) ? trace.groupIndex : index;
      const colorIndex = Number.isInteger(rawColorIndex) && rawColorIndex >= 0 ? rawColorIndex : 0;
      console.debug('Debug: box resolveTraceColor',{ traceIndex: index, colorIndex, rawColorIndex, groupName: trace?.groupName, grouped: isGroupedMode });
      const styleOverride = getTraceShapeStyle(index);
      if(colorMode === 'individual'){
        let fillColor = state.fillColors[colorIndex];
        if(!fillColor){
          if(isGroupedMode && trace?.groupName && groupColorAssignments.has(trace.groupName)){
            fillColor = groupColorAssignments.get(trace.groupName).fill;
          }else{
            fillColor = DEFAULT_BOX_COLORS[colorIndex % DEFAULT_BOX_COLORS.length];
          }
          state.fillColors[colorIndex] = fillColor;
        }
        let borderColor = state.borderColors[colorIndex];
        if(!borderColor){
          if(isGroupedMode && trace?.groupName && groupColorAssignments.has(trace.groupName)){
            borderColor = groupColorAssignments.get(trace.groupName).border;
          }else{
            borderColor = shadeColor(fillColor, -30);
          }
          state.borderColors[colorIndex] = borderColor;
        }
        if(isGroupedMode && trace?.groupName){
          groupColorAssignments.set(trace.groupName, { fill: fillColor, border: borderColor, colorIndex });
        }
        const strokeWidth = styleOverride && styleOverride.thickness != null ? Number(styleOverride.thickness) : null;
        const opacity = styleOverride && styleOverride.opacity != null ? Math.min(1, Math.max(0, Number(styleOverride.opacity))) : null;
        const fillResolved = styleOverride && styleOverride.fill ? styleOverride.fill : fillColor;
        const borderResolved = styleOverride && styleOverride.border ? styleOverride.border : borderColor;
        return { fillColor: fillResolved, borderColor: borderResolved, colorIndex, strokeWidth, opacity };
      }
      const fillColor = defaultFill;
      const borderColor = defaultBorder;
      if(isGroupedMode && trace?.groupName){
        if(!groupColorAssignments.has(trace.groupName)){
          groupColorAssignments.set(trace.groupName, { fill: fillColor, border: borderColor, colorIndex });
        }
      }
      const strokeWidth = styleOverride && styleOverride.thickness != null ? Number(styleOverride.thickness) : null;
      const opacity = styleOverride && styleOverride.opacity != null ? Math.min(1, Math.max(0, Number(styleOverride.opacity))) : null;
      const fillResolved = styleOverride && styleOverride.fill ? styleOverride.fill : fillColor;
      const borderResolved = styleOverride && styleOverride.border ? styleOverride.border : borderColor;
      return { fillColor: fillResolved, borderColor: borderResolved, colorIndex, strokeWidth, opacity };
    };
    const isGroupedMode = state.tableFormat === 'grouped';
    if(isGroupedMode){
      ensureGroupedDefaults();
    }
    let layoutMode = typeof state.groupLayout === 'string' ? state.groupLayout : 'interleaved';
    if(layoutMode !== 'interleaved' && layoutMode !== 'separated' && layoutMode !== 'stacked'){
      layoutMode = 'interleaved';
    }
    if(graphTypeRaw !== 'bar' && layoutMode === 'stacked'){
      layoutMode = 'interleaved';
    }
    if(layoutMode !== state.groupLayout){
      console.debug('Debug: box layout normalized',{ previous: state.groupLayout, applied: layoutMode, graphType: graphTypeRaw });
      state.groupLayout = layoutMode;
      if(els.boxLayoutMode && els.boxLayoutMode.value !== layoutMode){
        els.boxLayoutMode.value = layoutMode;
      }
    }
    const isStackedLayout = layoutMode === 'stacked';
    const usesGroupedSpacing = isGroupedMode && layoutMode === 'interleaved';
    const groupedGroups = isGroupedMode ? state.grouped.groups.map((name, idx)=>{ const trimmed = typeof name === 'string' ? name.trim() : ''; return trimmed || `Group ${idx + 1}`; }) : [];
    const groupedReplicates = isGroupedMode ? Math.max(1, state.grouped.replicatesPerGroup) : 1;
    const analysis = state.hot?.getAnalysisData?.() || Shared.hot.getAnalysisData(state.hot);
    const dataMatrix = analysis.data || [];
    const nCols = analysis.colCount || state.hot.countCols();
    const nRows = analysis.rowCount || state.hot.countRows?.() || dataMatrix.length;
    console.debug('Debug: box analysis snapshot',{ nCols, nRows, excludedCols: analysis.excluded?.cols?.length || 0, excludedRows: analysis.excluded?.rows?.length || 0 });
    if(!isGroupedMode){
      if(state.colOrder.length !== nCols){
        state.colOrder = Array.from({ length: nCols }, (_, i) => i);
      }
      state.colOrder = state.colOrder.filter(index=>index < nCols);
      if(!state.colOrder.length){
        state.colOrder = Array.from({ length: nCols }, (_, i) => i);
      }
      for(let orderIdx = 0; orderIdx < state.colOrder.length; orderIdx++){
        const i = state.colOrder[orderIdx];
        if(i >= nCols){
          continue;
        }
        if(analysis.isColumnExcluded?.(i)){
          console.debug('Debug: box column skipped due to exclusion',{ column: i });
          continue;
        }
        const headerCell = dataMatrix?.[0]?.[i];
        const label = (headerCell && String(headerCell).trim()) || `Col ${i + 1}`;
        const col = [];
        console.time(`boxColCollect_${i}_${token}`);
        for(let r = 1; r < nRows; r++){
          const rawValue = dataMatrix?.[r]?.[i];
          if(rawValue === null || typeof rawValue === 'undefined'){
            continue;
          }
          const v = parseFloat(rawValue);
          if(!isNaN(v)) col.push(v);
          if(r % 10000 === 0 && Shared.isDebugEnabled?.()){
            console.debug('boxplot collect progress',{ component: 'box', col: i, row: r, token });
          }
        }
        console.timeEnd(`boxColCollect_${i}_${token}`);
        console.log('boxplot collected column',{ index: i, values: col.length });
        if(token !== state.drawToken){
          console.log('boxplot draw cancelled after collect',{ token });
          return;
        }
        if(col.length){
          const categoryIndex = axisLabels.length;
          axisLabels.push(label);
          axisGroupIndices.push(null);
          traceLabels.push(label);
          traces.push({ name: label, rawY: col, categoryName: label, categoryIndex, columnIndex: i });
        }
      }
      if(!axisLabels.length && traceLabels.length){
        axisLabels = traceLabels.slice();
        axisGroupIndices = traceLabels.map(() => null);
      }
    }else{
      state.colOrder = Array.from({ length: nCols }, (_, i) => i);
      const replicateEntries = [];
      const groupEntries = groupedGroups.map((groupName, gIdx)=>({ groupName, groupIndex: gIdx, replicates: [] }));
      for(let repIdx = 0; repIdx < groupedReplicates; repIdx++){
        const replicateBucket = [];
        let categoryName = '';
        for(let gIdx = 0; gIdx < groupedGroups.length; gIdx++){
          const groupName = groupedGroups[gIdx];
          const colIndex = gIdx * groupedReplicates + repIdx;
          if(colIndex >= nCols){
            console.debug('Debug: grouped column missing',{ colIndex, gIdx, repIdx, nCols });
            continue;
          }
          if(analysis.isColumnExcluded?.(colIndex)){
            console.debug('Debug: grouped column excluded',{ colIndex, gIdx, repIdx });
            continue;
          }
          const headerCell = dataMatrix?.[0]?.[colIndex];
          const headerText = headerCell && String(headerCell).trim();
          if(headerText && !categoryName){
            categoryName = headerText;
          }
          const values = [];
          console.time(`boxColCollect_${colIndex}_${token}`);
          for(let r = 1; r < nRows; r++){
            const rawValue = dataMatrix?.[r]?.[colIndex];
            if(rawValue === null || typeof rawValue === 'undefined'){
              continue;
            }
            const v = parseFloat(rawValue);
            if(!isNaN(v)) values.push(v);
            if(r % 10000 === 0 && Shared.isDebugEnabled?.()){
              console.debug('boxplot collect progress',{ component: 'box', col: colIndex, row: r, token, groupIndex: gIdx, replicate: repIdx });
            }
          }
          console.timeEnd(`boxColCollect_${colIndex}_${token}`);
          console.log('boxplot collected column',{ index: colIndex, values: values.length, groupIndex: gIdx, replicate: repIdx });
          if(token !== state.drawToken){
            console.log('boxplot draw cancelled after grouped collect',{ token });
            return;
          }
          if(values.length){
            const entry = { groupName, groupIndex: gIdx, rawY: values, columnIndex: colIndex, replicateIndex: repIdx };
            replicateBucket.push(entry);
            groupEntries[gIdx].replicates.push(entry);
          }
        }
        if(!replicateBucket.length){
          console.debug('Debug: grouped replicate without data',{ replicateIndex: repIdx });
          continue;
        }
        const finalCategoryName = categoryName || `Category ${replicateEntries.length + 1}`;
        replicateBucket.forEach(entry => { entry.replicateName = finalCategoryName; });
        replicateEntries.push({ name: finalCategoryName, replicateIndex: repIdx, traces: replicateBucket });
      }
      if(layoutMode === 'separated'){
        groupEntries.forEach(groupEntry => {
          groupEntry.replicates.forEach(entry => {
            const replicateLabel = entry.replicateName || `Category ${axisLabels.length + 1}`;
            const categoryIndex = axisLabels.length;
            axisLabels.push(replicateLabel);
            axisGroupIndices.push(Number.isFinite(entry.groupIndex) ? entry.groupIndex : null);
            const trace = {
              name: replicateLabel,
              rawY: entry.rawY,
              groupName: entry.groupName,
              groupIndex: entry.groupIndex,
              categoryName: replicateLabel,
              categoryIndex,
              replicateIndex: entry.replicateIndex,
              columnIndex: entry.columnIndex
            };
            traces.push(trace);
            traceLabels.push(replicateLabel);
          });
        });
      }else{
        axisLabels = replicateEntries.map(rep => rep.name);
        axisGroupIndices = replicateEntries.map(() => null);
        replicateEntries.forEach((rep, catIdx) => {
          rep.traces.forEach(entry => {
            const label = `${entry.groupName} – ${rep.name}`;
            const trace = {
              name: label,
              rawY: entry.rawY,
              groupName: entry.groupName,
              groupIndex: entry.groupIndex,
              categoryName: rep.name,
              categoryIndex: catIdx,
              replicateIndex: entry.replicateIndex,
              columnIndex: entry.columnIndex
            };
            traces.push(trace);
            traceLabels.push(label);
          });
        });
      }
      if(!axisLabels.length && traceLabels.length){
        axisLabels = traceLabels.slice();
        axisGroupIndices = traceLabels.map(() => null);
      }
    }
    if(token !== state.drawToken){
      console.log('boxplot draw cancelled before traces ready',{ token });
      return;
    }
    if(!traces.length){
      state.lastAxisLabels = [];
      renderStatsControls([]);
      els.boxColorPerBox.innerHTML='';
      global.document.getElementById('boxPlot').innerHTML='';
      global.document.getElementById('statsResults').innerHTML='';
      global.document.getElementById('statsTable').innerHTML='';
      return;
    }
    const colorPrimeSample = [];
    traces.forEach((trace, index) => {
      const colorInfo = resolveTraceColor(trace, index);
      trace.fillColor = colorInfo.fillColor;
      trace.borderColor = colorInfo.borderColor;
      trace.colorIndex = colorInfo.colorIndex;
      trace.shapeStyle = { strokeWidth: colorInfo.strokeWidth, opacity: colorInfo.opacity };
      if(colorPrimeSample.length < 5){
        colorPrimeSample.push({
          index,
          name: trace.name,
          fill: colorInfo.fillColor,
          border: colorInfo.borderColor,
          group: trace.groupName || null
        });
      }
    });
    console.debug('Debug: box trace colors primed',{ traceCount: traces.length, sample: colorPrimeSample });
    const colorPickerLabels = isGroupedMode ? groupedGroups : traceLabels;
    console.debug('Debug: box color picker labels resolved',{ isGroupedMode, labelCount: colorPickerLabels.length, labels: colorPickerLabels });
    state.lastAxisLabels = Array.isArray(axisLabels) ? axisLabels.slice() : [];
    if(els.boxColorIndividual.checked){
      updateBoxColorPickers(colorPickerLabels, { grouped: isGroupedMode });
    }else{
      els.boxColorPerBox.innerHTML='';
    }
    renderStatsControls(traces);
    if(logScale){
      const logPlusOne = !!state.logPlusOne;
      const hasNonPos = traces.some(t => t.rawY.some(v => Number.isFinite(v) && v <= 0));
      if(hasNonPos && !logPlusOne){
        global.document.getElementById('boxPlot').innerHTML='<i>Log scale requires positive values.</i>';
        global.document.getElementById('statsResults').innerHTML='';
        global.document.getElementById('statsTable').innerHTML='';
        return;
      }
      if(logPlusOne){
        traces.forEach(t => { t.y = t.rawY.map(v => Number.isFinite(v) ? Math.log10(v + 1) : v); });
        console.debug('Debug: box log+1 transform applied');
      }else{
        traces.forEach(t => { t.y = t.rawY.map(v => Number.isFinite(v) ? Math.log10(v) : v); });
      }
    }else{
      traces.forEach(t => { t.y = [...t.rawY]; });
    }
    while (els.plotDiv.firstChild) els.plotDiv.removeChild(els.plotDiv.firstChild);
    const W = Math.max(50, Math.floor(els.plotDiv.clientWidth || 50));
    const H = Math.max(40, Math.floor(els.plotDiv.clientHeight || 40));
    els.plotDiv.style.position = 'relative';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('id', 'boxSvg');
    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(H));
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('font-family', chartStyle.FONT_FAMILY);
    chartStyle.applySvgDefaults(svg);
    svg.addEventListener('mouseleave', handleBoxPlotMouseLeave);
    els.plotDiv.appendChild(svg);
    const doc = svg.ownerDocument || global.document;
    const gridLayer = doc?.createElementNS ? doc.createElementNS(NS, 'g') : null;
    const dataLayer = doc?.createElementNS ? doc.createElementNS(NS, 'g') : null;
    const axisLayer = doc?.createElementNS ? doc.createElementNS(NS, 'g') : null;
    if(gridLayer){
      gridLayer.dataset.layer = 'box-grid';
      svg.appendChild(gridLayer);
    }
    if(dataLayer){
      dataLayer.dataset.layer = 'box-data';
      svg.appendChild(dataLayer);
    }
    if(axisLayer){
      axisLayer.dataset.layer = 'box-axis';
      svg.appendChild(axisLayer);
    }
    if(fontControls && typeof fontControls.enableForSvg === 'function'){
      fontControls.enableForSvg(svg,{ scopeId: 'box' });
      console.debug('Debug: box fontControls enableForSvg invoked',{ width: W, height: H }); // Debug: font panel binding
    } else {
      console.debug('Debug: box fontControls enableForSvg missing',{ hasFontControls: !!fontControls }); // Debug: font panel missing
    }
    const needSortedValues = graphTypeRaw === 'violin';
    let ymin = Infinity;
    let ymax = -Infinity;
    traces.forEach((trace, traceIndex) => {
      const summary = computeTraceSummary(trace.y, { requireSorted: needSortedValues });
      trace.__distribution = summary;
      if(summary.count){
        if(Number.isFinite(summary.min) && summary.min < ymin){
          ymin = summary.min;
        }
        if(Number.isFinite(summary.max) && summary.max > ymax){
          ymax = summary.max;
        }
      }
      if(traceIndex % 5 === 0 && Shared.isDebugEnabled?.()){
        console.debug('boxplot distribution summary',{ component: 'box', trace: traceIndex, count: summary.count, needSortedValues, token });
      }
      trace.__barStats = {
        sampleCount: summary.count,
        mean: summary.mean,
        variance: summary.variance,
        sd: summary.sd,
        hasSpread: summary.count > 1
      };
    });
    if(token !== state.drawToken){
      console.log('boxplot draw cancelled after range calc',{ token });
      return;
    }
    console.log('boxplot ymin/ymax',{ ymin, ymax });
    const computeStackedErrorExtents = (baseValue, meanValue, sdValue, mode) => {
      if(!Number.isFinite(baseValue) || !Number.isFinite(meanValue)){
        return null;
      }
      const safeSd = Number.isFinite(sdValue) && sdValue > 0 ? sdValue : 0;
      const segmentEnd = baseValue + meanValue;
      let highValue = segmentEnd;
      let lowValue = segmentEnd;
      if(meanValue >= 0){
        highValue = Math.max(segmentEnd, baseValue + meanValue + safeSd);
        if(mode === 'both'){
          const proposed = baseValue + meanValue - safeSd;
          if(proposed < baseValue){
            console.debug('Debug: box stacked bar lower clamp',{ baseValue, mean: meanValue, sd: safeSd, proposed, clamp: baseValue });
            lowValue = baseValue;
          }else{
            lowValue = Math.min(segmentEnd, proposed);
          }
        }
      }else{
        lowValue = Math.min(segmentEnd, baseValue + meanValue - safeSd);
        if(mode === 'both'){
          const proposed = baseValue + meanValue + safeSd;
          if(proposed > baseValue){
            console.debug('Debug: box stacked bar upper clamp',{ baseValue, mean: meanValue, sd: safeSd, proposed, clamp: baseValue });
            highValue = baseValue;
          }else{
            highValue = Math.max(segmentEnd, proposed);
          }
        }else if(mode === 'upper'){
          const proposed = baseValue + meanValue + safeSd;
          if(proposed > baseValue){
            console.debug('Debug: box stacked bar upper-only clamp',{ baseValue, mean: meanValue, sd: safeSd, proposed, clamp: baseValue });
            highValue = baseValue;
          }else{
            highValue = Math.max(segmentEnd, proposed);
          }
        }
      }
      if(highValue < lowValue){
        const mid = (highValue + lowValue) / 2;
        console.debug('Debug: box stacked bar extent swap',{ baseValue, mean: meanValue, sd: safeSd, highValue, lowValue, mode });
        highValue = mid;
        lowValue = mid;
      }
      return { highValue, lowValue, segmentEnd };
    };
    let barErrorMin = Infinity;
    let barErrorMax = -Infinity;
    if(graphTypeRaw === 'bar'){
      const stackedPreview = isStackedLayout ? new Map() : null;
      traces.forEach((t, traceIndex) => {
        const stats = t.__barStats;
        const sampleCount = stats?.sampleCount ?? t.y.length;
        if(!sampleCount){
          return;
        }
        const mean = stats?.mean ?? 0;
        const hasSpread = !!(stats && stats.hasSpread);
        const sd = stats?.sd ?? 0;
        if(isStackedLayout){
          const key = Number.isFinite(t.categoryIndex) ? t.categoryIndex : traceIndex;
          if(!stackedPreview.has(key)){
            stackedPreview.set(key, { pos: 0, neg: 0 });
          }
          const entry = stackedPreview.get(key);
          const baseValue = mean >= 0 ? entry.pos : entry.neg;
          const segmentEnd = baseValue + mean;
          if(hasSpread){
            const extents = computeStackedErrorExtents(baseValue, mean, sd, errorMode);
            if(extents){
              barErrorMin = Math.min(barErrorMin, extents.lowValue);
              barErrorMax = Math.max(barErrorMax, extents.highValue);
            }
          }else{
            console.debug('Debug: box stacked bar extent single value',{ trace: t.name, sampleCount, mean });
            barErrorMin = Math.min(barErrorMin, baseValue, segmentEnd);
            barErrorMax = Math.max(barErrorMax, baseValue, segmentEnd);
          }
          if(mean >= 0){
            entry.pos = segmentEnd;
            barErrorMax = Math.max(barErrorMax, entry.pos);
          }else{
            entry.neg = segmentEnd;
            barErrorMin = Math.min(barErrorMin, entry.neg);
          }
        }else{
          const lowerCandidate = hasSpread ? mean - sd : mean;
          const upperCandidate = hasSpread ? mean + sd : mean;
          if(!hasSpread){
            console.debug('Debug: box skip bar extent for single value',{ trace: t.name, sampleCount, mean });
          }
          barErrorMin = Math.min(barErrorMin, lowerCandidate);
          barErrorMax = Math.max(barErrorMax, upperCandidate);
        }
      });
      if(isFinite(barErrorMin)) ymin = Math.min(ymin, barErrorMin);
      if(isFinite(barErrorMax)) ymax = Math.max(ymax, barErrorMax);
      if(isStackedLayout && stackedPreview){
        console.debug('Debug: box stacked extent',{ categories: stackedPreview.size, ymin, ymax });
      }
    }
    const userYMin = parseFloat(els.boxYMin.value);
    const userYMax = parseFloat(els.boxYMax.value);
    if(isFinite(userYMin)) ymin = logScale ? Math.log10(userYMin) : userYMin;
    if(isFinite(userYMax)) ymax = logScale ? Math.log10(userYMax) : userYMax;
    console.log('boxplot axis override',{ userYMin, userYMax, ymin, ymax });
    console.log('boxplot range',{ ymin, ymax });
    if(graphTypeRaw === 'bar' && !logScale){
      const beforeYMin = ymin;
      const beforeYMax = ymax;
      ymin = Math.min(ymin, 0);
      ymax = Math.max(ymax, 0);
      console.debug('Debug: box bar axis zero clamp',{ beforeYMin, beforeYMax, ymin, ymax });
    }
    const manualYMinValue = Number.isFinite(userYMin) ? (logScale ? Math.log10(userYMin) : userYMin) : null;
    const manualYMaxValue = Number.isFinite(userYMax) ? (logScale ? Math.log10(userYMax) : userYMax) : null;
    const axisTickTools = chartStyle.axisTicks || null;
    const buildAxisScale = opts => {
      if(axisTickTools && typeof axisTickTools.buildScale === 'function'){
        return axisTickTools.buildScale(opts);
      }
      const min = Number.isFinite(opts?.manualMin) ? opts.manualMin : Number(opts?.dataMin) || 0;
      const max = Number.isFinite(opts?.manualMax) ? opts.manualMax : Number(opts?.dataMax) || min + 1;
      return { min, max, ticks: [min, max], step: Math.max((max - min) || 1, 1) };
    };
    const applyLogTickOverride = scale => {
      if(!logScale || !scale || !axisTickTools?.applyLogTicks){
        return false;
      }
      const applied = axisTickTools.applyLogTicks(scale, {
        manualMin: Number.isFinite(manualYMinValue) ? manualYMinValue : null,
        manualMax: Number.isFinite(manualYMaxValue) ? manualYMaxValue : null,
        fallbackMin: ymin,
        fallbackMax: ymax
      });
      if(applied && Shared.isDebugEnabled?.()){
        console.debug('Debug: box log tick override',{ tickCount: scale.ticks.length, orientation: state.flipAxes ? 'horizontal' : 'vertical' });
      }
      return applied;
    };
    const labelTexts = axisLabels.map((lab, i) => lab || `Category ${i + 1}`);
    const separatedCategoryUnits = (isGroupedMode && layoutMode === 'separated' && axisLabels.length)
      ? computeSeparatedCategoryUnits(axisGroupIndices)
      : null;
    if(isGroupedMode && groupColorAssignments.size && showLegend){
      const legendEntries = Array.from(groupColorAssignments.entries()).map(([name, colors]) => ({
        label: name,
        fill: colors.fill,
        stroke: colors.border,
        strokeWidth: borderWidthPx
      }));
      legendRenderer = chartStyle.createLegendRenderer({
        entries: legendEntries,
        fontSize: fs,
        strokeWidth: borderWidthPx
      });
      legendGapPx = legendRenderer.entries.length ? Math.max(12, Math.round(fs * 0.5)) : 0;
      legendWidthForMargin = legendRenderer.entries.length ? legendRenderer.width + legendGapPx : 0;
      console.debug('Debug: box legend metrics',{ legendWidthForMargin, legendGapPx, entryCount: legendRenderer.entries.length, showLegend });
    }else{
      legendRenderer = chartStyle.createLegendRenderer({ entries: [], fontSize: fs, strokeWidth: borderWidthPx });
      legendGapPx = 0;
      legendWidthForMargin = 0;
      console.debug('Debug: box legend disabled',{ grouped: isGroupedMode, groupCount: groupColorAssignments.size, showLegend });
    }
    const boxAxisNotationX = getAxisNotation('x');
    const boxAxisNotationY = getAxisNotation('y');
    const numericAxisKey = state.flipAxes ? 'x' : 'y';
    function formatTick(v){
      const notation = numericAxisKey === 'x' ? boxAxisNotationX : boxAxisNotationY;
      return chartStyle.formatAxisValue(v,{ notation, maxDecimals: 2 });
    }
    const appendToLayer = (layer, tag, attrs) => {
      const target = layer || dataLayer || svg;
      const el = document.createElementNS(NS, tag);
      for(const [k, v] of Object.entries(attrs)){
        el.setAttribute(k, String(v));
      }
      target.appendChild(el);
      return el;
    };
    const add = (tag, attrs) => appendToLayer(dataLayer || svg, tag, attrs);
    const addGrid = (tag, attrs) => appendToLayer(gridLayer || svg, tag, attrs);
    const axisStroke = axisStrokeColor || DEFAULT_AXIS_COLOR;
    function estimateBandwidth(sorted){
      if(!sorted.length) return 1;
      const n = sorted.length;
      const meanVal = sorted.reduce((acc, v) => acc + v, 0) / n;
      const variance = sorted.reduce((acc, v) => acc + Math.pow(v - meanVal, 2), 0) / (n - 1 || 1);
      const sigma = Math.sqrt(variance) || 0;
      const iqrVal = percentileFromSorted(sorted, 0.75) - percentileFromSorted(sorted, 0.25);
      const scale = Math.min(sigma, iqrVal / 1.349 || Infinity) || sigma || Math.abs(sorted[0]) || 1;
      const bandwidth = 0.9 * scale * Math.pow(n, -0.2);
      const fallback = (sorted[n - 1] - sorted[0]) / (Math.sqrt(n) || 1) || 1;
      const resolved = Number.isFinite(bandwidth) && bandwidth > 0 ? bandwidth : fallback;
      console.debug('Debug: box violin auto bandwidth',{ n, sigma, iqr: iqrVal, scale, bandwidth, fallback, resolved });
      return resolved;
    }
    function resolveViolinBandwidth(sorted){
      const violinState = ensureViolinState();
      const debugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
      if(violinState.autoBandwidth === false){
        const manual = Number(violinState.bandwidth);
        if(Number.isFinite(manual) && manual > 0){
          violinState.lastUsedBandwidth = manual;
          if(debugEnabled){
            console.debug('Debug: box violin bandwidth resolved manual',{ bandwidth: manual });
          }
          return manual;
        }
        if(debugEnabled){
          console.debug('Debug: box violin bandwidth manual fallback',{ bandwidth: violinState.bandwidth });
        }
      }
      const auto = estimateBandwidth(sorted);
      violinState.lastUsedBandwidth = auto;
      if(debugEnabled){
        console.debug('Debug: box violin bandwidth resolved auto',{ bandwidth: auto });
      }
      return auto;
    }

    if(graphTypeRaw === 'violin'){
      const debugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
      const beforeYMin = ymin;
      const beforeYMax = ymax;
      traces.forEach((trace, traceIndex) => {
        const summary = trace?.__distribution;
        const sorted = Array.isArray(summary?.sortedValues) ? summary.sortedValues : null;
        if(!sorted || !sorted.length){
          return;
        }
        const bandwidth = resolveViolinBandwidth(sorted);
        const dataMin = sorted[0];
        const dataMax = sorted[sorted.length - 1];
        const dataSpan = dataMax - dataMin;
        const pad = Math.max(bandwidth * 3, (Number.isFinite(dataSpan) ? dataSpan : 0) * 0.05);
        const domainMin = dataMin - pad;
        const domainMax = dataMax + pad;
        if(manualYMinValue == null && Number.isFinite(domainMin)){
          ymin = Math.min(ymin, domainMin);
        }
        if(manualYMaxValue == null && Number.isFinite(domainMax)){
          ymax = Math.max(ymax, domainMax);
        }
        if(debugEnabled && traceIndex % 5 === 0){
          console.debug('Debug: box violin axis expand trace',{
            trace: traceIndex,
            bandwidth,
            dataMin,
            dataMax,
            domainMin,
            domainMax
          });
        }
      });
      if(debugEnabled){
        console.debug('Debug: box violin axis expanded',{
          beforeYMin,
          beforeYMax,
          afterYMin: ymin,
          afterYMax: ymax,
          manualYMinValue,
          manualYMaxValue
        });
      }
    }

    function computeDensity(sorted, minVal, maxVal, sampleCount){
      const violinState = ensureViolinState();
      const requestedCount = Number(sampleCount);
      const count = clampViolinSampleCount(Number.isFinite(requestedCount) && requestedCount > 0 ? requestedCount : violinState.sampleCount);
      violinState.sampleCount = clampViolinSampleCount(violinState.sampleCount);
      violinState.lastSampleCount = count;
      if(!sorted.length){
        return { positions: [], densities: [], bandwidth: resolveViolinBandwidth(sorted) };
      }
      const bandwidth = resolveViolinBandwidth(sorted);
      const dataMin = sorted[0];
      const dataMax = sorted[sorted.length - 1];
      const dataSpan = dataMax - dataMin;
      const pad = Math.max(bandwidth * 3, (Number.isFinite(dataSpan) ? dataSpan : 0) * 0.05);
      let domainMin = dataMin - pad;
      let domainMax = dataMax + pad;
      if(Number.isFinite(minVal)){
        domainMin = Math.max(domainMin, minVal);
      }
      if(Number.isFinite(maxVal)){
        domainMax = Math.min(domainMax, maxVal);
      }
      if(!isFinite(domainMin) || !isFinite(domainMax)){
        domainMin = dataMin;
        domainMax = dataMax;
      }
      if(domainMax === domainMin){
        domainMin -= 0.5;
        domainMax += 0.5;
      }
      const positions = [];
      const densities = [];
      const step = (domainMax - domainMin) / Math.max(count - 1, 1);
      const denom = sorted.length * bandwidth * Math.sqrt(2 * Math.PI);
      for(let idx = 0; idx < count; idx++){
        const x = domainMin + step * idx;
        let sum = 0;
        for(let j = 0; j < sorted.length; j++){
          const u = (x - sorted[j]) / bandwidth;
          sum += Math.exp(-0.5 * u * u);
        }
        const density = denom ? sum / denom : 0;
        positions.push(x);
        densities.push(density);
      }
      const peak = densities.length ? densities.reduce((max, d) => (d > max ? d : max), 0) : 0;
      const debugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
      if(debugEnabled){
        const mode = violinState.autoBandwidth === false && Number.isFinite(violinState.bandwidth) && violinState.bandwidth > 0 ? 'manual' : 'auto';
        console.debug('Debug: box violin density',{ bandwidth, domainMin, domainMax, sampleCount: count, peak, mode });
      }
      return { positions, densities, bandwidth };
    }
    const annotationOrientation = isFlipped ? 'horizontal' : 'vertical';
    const significanceControlConfig = createSignificanceControlConfig(annotationOrientation);
	    const annotationStyle = {
	      styleScaleInfo,
	      fontSize: fs,
	      strokeWidth: annotationStrokeWidth,
	      color: annotationColor,
	      showWhiskers: annotationShowWhiskers,
	      whiskerMode: annotationWhiskerMode,
	      controlConfig: significanceControlConfig,
	      baseOffset: annotationBaseOffset,
	      levelGap: annotationLevelGap,
	      bracketSize: annotationBracketSize,
	      orientation: annotationOrientation
	    };
    const selectionCount = state.selectedCols.size || 0;
    let maxLevelEstimate = 0;
    if(showSignificance){
      if(Number.isFinite(state.significanceMaxLevel) && state.significanceMaxLevel >= 0){
        maxLevelEstimate = state.significanceMaxLevel;
      }else if(selectionCount > 1){
        if(selectionCount === 2){
          maxLevelEstimate = 0;
        }else{
          maxLevelEstimate = Math.min(selectionCount - 1, 3);
        }
      }
    }

    function buildManualTicks(minVal, maxVal, step){
      const safeStep = Number(step);
      if(!Number.isFinite(minVal) || !Number.isFinite(maxVal)){
        console.debug('Debug: box manual ticks skipped',{ minVal, maxVal, step, reason: 'non-finite-range' });
        return null;
      }
      if(!Number.isFinite(safeStep) || safeStep <= 0){
        console.debug('Debug: box manual ticks skipped',{ minVal, maxVal, step });
        return null;
      }
      let graphMin = Math.floor(minVal / safeStep) * safeStep;
      let graphMax = Math.ceil(maxVal / safeStep) * safeStep;
      if(graphMin === graphMax){
        graphMax = graphMin + safeStep;
      }
      const ticks = [];
      let current = graphMin;
      let guard = 0;
      while(current <= graphMax + safeStep * 0.25 && guard < 1000){
        ticks.push(Number.parseFloat(current.toPrecision(12)));
        current += safeStep;
        guard += 1;
      }
      if(!ticks.length){
        ticks.push(Number.parseFloat(graphMin.toPrecision(12)));
      }
      console.debug('Debug: box manual ticks generated',{ minVal, maxVal, step: safeStep, tickCount: ticks.length });
      return {
        min: Math.min(graphMin, ticks[0], minVal),
        max: Math.max(graphMax, ticks[ticks.length - 1], maxVal),
        ticks,
        step: safeStep
      };
    }

    const axisControlConfig = axis => ({
      axis,
      scopeId: 'box',
      getTickInterval: () => getAxisTickInterval(axis),
      getThickness: () => getAxisStrokeWidthBase(),
      getColor: () => getAxisColor(),
      isTickIntervalEnabled: () => isAxisNumeric(axis),
      getTickIntervalDisabledMessage: () => {
        if(axis === 'x'){
          return 'Tick interval is only available when the X axis shows numeric values. Enable Flip Axes to adjust X ticks.';
        }
        if(axis === 'y'){
          return 'Tick interval is only available when the Y axis shows numeric values. Disable Flip Axes to adjust Y ticks.';
        }
        return 'Tick interval available only for numeric axes.';
      },
      tickPlaceholder: 'Auto',
      onTickIntervalChange: value => updateAxisTickInterval(axis, value),
      getMinorTicksEnabled: () => getAxisMinorTicksEnabled(axis),
      onMinorTicksChange: value => updateAxisMinorTicks(axis, value),
      isMinorTicksSupported: () => isAxisNumeric(axis),
      getMinorTickSubdivisions: () => getAxisMinorTickSubdivisions(axis),
      onMinorTickSubdivisionsChange: value => updateAxisMinorTickSubdivisions(axis, value),
      onThicknessChange: value => updateAxisStrokeWidth(value),
      onColorChange: value => updateAxisColor(value),
        getNotationMode: () => getAxisNotation(axis),
        onNotationChange: value => {
          if(!isAxisNumeric(axis)){
            console.debug('Debug: box axis notation ignored for categorical axis',{ axis, flipAxes: state.flipAxes, requested: value });
            return;
          }
          updateAxisNotation(axis, value);
        },
        isNotationSupported: () => isAxisNumeric(axis),
        isBrokenAxisSupported: () => axis === 'y',
        getBrokenAxisEnabled: () => getBrokenAxisEnabled(axis),
        onBrokenAxisEnabledChange: (enabled) => updateBrokenAxisEnabled(axis, enabled),
        getBrokenAxisSegments: () => getBrokenAxisSegments(axis),
        onBrokenAxisSegmentChange: (axis, index, segment) => {
          const segments = getBrokenAxisSegments(axis);
        if(index >= 0 && index < segments.length){
          segments[index] = segment;
          updateBrokenAxisSegments(axis, segments);
        }
      },
      onBrokenAxisAddSegment: () => {
        const segments = getBrokenAxisSegments(axis);
        segments.push({ ...BROKEN_AXIS_DEFAULT_SEGMENT });
        updateBrokenAxisSegments(axis, segments);
      },
      onBrokenAxisRemoveSegment: (axis, index) => {
        const segments = getBrokenAxisSegments(axis);
        if(index >= 0 && index < segments.length){
          segments.splice(index, 1);
          updateBrokenAxisSegments(axis, segments);
        }
      }
    });

    function renderVertical(){
      const tickFont = chartStyle.makeFont(fs);
      const axisLabelFont = chartStyle.makeFont(fs);
      const yTitleWidthBase = chartStyle.measureText(state.yLabelText, axisLabelFont);
      const tickLen = axisMetrics.tickLength;
      const tickGap = axisMetrics.tickLabelGap;
      const annotationLabelClearance = showSignificance && maxLevelEstimate >= 0
        ? (annotationBracketSize + (fs || 12))
        : 0;
      const topExtra = showSignificance && maxLevelEstimate >= 0
        ? (annotationBaseOffset + Math.max(0, maxLevelEstimate) * annotationLevelGap + annotationLabelClearance)
        : 0;
      const titleBand = showSignificance && maxLevelEstimate >= 0
        ? Math.max(30, (fs || 12) * 3.0)
        : 0;
      const titleGap = showSignificance && maxLevelEstimate >= 0
        ? Math.max(6, (fs || 12) * 0.45)
        : 0;
      const annotationMinY = (titleBand && titleGap) ? (titleBand + titleGap) : null;
      let marginLocal = chartStyle.computeBaseMargins({ fontSize: fs, maxYLabelWidth: 0, yTitleWidth: yTitleWidthBase, axisMetrics, legendWidth: legendWidthForMargin });
      marginLocal.top += topExtra + titleBand + titleGap;
      marginLocal.left = Math.max(marginLocal.left, fs * 0.5);
      let plotWLocal = Math.max(20, W - marginLocal.left - marginLocal.right);
      let plotHLocal = Math.max(20, H - marginLocal.top - marginLocal.bottom);
      let bottomLayout = chartStyle.computeBottomLayout({ labels: labelTexts, fontSize: fs, plotWidth: plotWLocal, baseBottom: marginLocal.bottom, axisMetrics });
      marginLocal.bottom = bottomLayout.bottom;
      plotWLocal = Math.max(20, W - marginLocal.left - marginLocal.right);
      plotHLocal = Math.max(20, H - marginLocal.top - marginLocal.bottom);
      const yIntervalSetting = getAxisTickInterval('y');
      let yTickTarget = chartStyle.estimateTickCount(plotHLocal, { axis: 'y', fallback: 6 });
      let yScale = buildAxisScale({
        dataMin: ymin,
        dataMax: ymax,
        manualMin: manualYMinValue,
        manualMax: manualYMaxValue,
        targetTickCount: yTickTarget
      });
      let manualYScale = null;
      if(yIntervalSetting){
        const manual = buildManualTicks(ymin, ymax, yIntervalSetting);
        if(manual){
          manualYScale = manual;
          yScale = manual;
          yTickTarget = manual.ticks.length;
          console.debug('Debug: box y-axis manual override',{ step: manual.step, tickCount: manual.ticks.length, min: manual.min, max: manual.max });
        }
      }
      let tickLabels = [];
      let tickWidths = [];
      let maxTickWidth = 0;
      let yLabelGap = 0;
      const tickPasses = manualYScale ? 1 : 2;
      for(let pass = 0; pass < tickPasses; pass++){
        if(!manualYScale){
          yScale = buildAxisScale({
            dataMin: ymin,
            dataMax: ymax,
            manualMin: manualYMinValue,
            manualMax: manualYMaxValue,
            targetTickCount: yTickTarget
          });
          applyLogTickOverride(yScale);
        }
        tickLabels = yScale.ticks.map(t => formatTick(logScale ? Math.pow(10, t) : t));
        tickWidths = tickLabels.map(lbl => chartStyle.measureText(lbl, tickFont));
        maxTickWidth = Math.max(...tickWidths, 0);
        yLabelGap = maxTickWidth + tickLen + tickGap;
        marginLocal = chartStyle.computeBaseMargins({ fontSize: fs, maxYLabelWidth: maxTickWidth, yTitleWidth: yTitleWidthBase, axisMetrics, legendWidth: legendWidthForMargin });
        marginLocal.top += topExtra;
        marginLocal.left = Math.max(marginLocal.left, yLabelGap + fs * 0.5);
        plotWLocal = Math.max(20, W - marginLocal.left - marginLocal.right);
        plotHLocal = Math.max(20, H - marginLocal.top - marginLocal.bottom);
        bottomLayout = chartStyle.computeBottomLayout({ labels: labelTexts, fontSize: fs, plotWidth: plotWLocal, baseBottom: marginLocal.bottom, axisMetrics });
        marginLocal.bottom = bottomLayout.bottom;
        plotWLocal = Math.max(20, W - marginLocal.left - marginLocal.right);
        plotHLocal = Math.max(20, H - marginLocal.top - marginLocal.bottom);
        if(manualYScale){
          break;
        }
        const refinedTickTarget = chartStyle.estimateTickCount(plotHLocal, { axis: 'y', fallback: yTickTarget });
        console.debug('Debug: box tick target evaluation',{ pass, plotH: plotHLocal, yTickTarget, refinedTickTarget });
        if(refinedTickTarget === yTickTarget){
          break;
        }
        yTickTarget = refinedTickTarget;
      }
      console.debug('Debug: box layout',{ margin: marginLocal, plotW: plotWLocal, plotH: plotHLocal, rotate: bottomLayout.shouldRotate, yTickTarget, manualTicks: !!manualYScale });
      const axisCount = Math.max(axisLabels.length, 1);
      // Add a small gap between adjacent category bands so datasets don't touch
      // each other. Compute a gap as a fraction of the raw band width and
      // subtract total gap space from the plot width before deriving bandW.
      const rawBandW = plotWLocal / axisCount;
      const datasetGapFraction = 0.06; // fraction of band used as gap
      const datasetGapPxCandidate = rawBandW * datasetGapFraction;
      const datasetGapPx = Math.max(2, Math.min(40, datasetGapPxCandidate));
      let bandW = (plotWLocal - datasetGapPx * Math.max(0, axisCount - 1)) / axisCount;
      const totalGapSpace = datasetGapPx * Math.max(0, axisCount - 1);
      const plotWForSpacing = Math.max(0, plotWLocal - totalGapSpace);
      const separatedSpacing = separatedCategoryUnits
        ? scaleSeparatedCategoryUnits(separatedCategoryUnits, plotWForSpacing, marginLocal.left)
        : null;
      if(separatedSpacing && Number.isFinite(separatedSpacing.bandWidth) && separatedSpacing.bandWidth > 0){
        bandW = separatedSpacing.bandWidth;
      }
      const groupCountLocal = usesGroupedSpacing ? Math.max(1, groupedGroups.length) : 1;
      const clusterGap = usesGroupedSpacing ? Math.min(bandW * 0.25, 16) : 0;
      let perGroupBand = usesGroupedSpacing ? (bandW - clusterGap) / groupCountLocal : bandW;
      if(!Number.isFinite(perGroupBand) || perGroupBand <= 0){
        perGroupBand = bandW / Math.max(groupCountLocal, 1);
      }
      const groupOffset = usesGroupedSpacing ? (bandW - perGroupBand * groupCountLocal) / 2 : 0;
      
      // Broken axis support
      const brokenAxisEnabled = getBrokenAxisEnabled('y');
      const brokenAxisSegments = brokenAxisEnabled ? getBrokenAxisSegments('y') : [];
      const brokenScale = brokenAxisEnabled && brokenAxisSegments.length > 0
        ? computeBrokenAxisScale({
            dataMin: yScale.min,
            dataMax: yScale.max,
            segments: brokenAxisSegments,
            plotHeight: plotHLocal
          })
        : null;
      
      console.debug('Debug: box broken axis',{ enabled: brokenAxisEnabled, segments: brokenAxisSegments, isBroken: brokenScale?.isBroken });
      const isYValueVisible = value => {
        if(!brokenScale || !brokenScale.isBroken){ return true; }
        return brokenScale.segments.some(seg => value >= seg.start && value <= seg.end);
      };
      
      const valueRange = yScale.max - yScale.min || 1;
      const clampToScale = v => {
        if(!Number.isFinite(v)){ return yScale.min; }
        if(v < yScale.min){
          if(typeof Shared !== 'undefined' && typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
            console.debug('Debug: box value clamped below axis',{ value: v, min: yScale.min });
          }
          return yScale.min;
        }
        if(v > yScale.max){
          if(typeof Shared !== 'undefined' && typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
            console.debug('Debug: box value clamped above axis',{ value: v, max: yScale.max });
          }
          return yScale.max;
        }
        return v;
      };
      const y2px = v => {
        const safeV = clampToScale(v);
        if(brokenScale && brokenScale.isBroken){
          return brokenScale.valueToPixel(safeV, marginLocal.top, plotHLocal);
        }
        return marginLocal.top + plotHLocal * (1 - (safeV - yScale.min) / valueRange);
      };
      const minorTickStyle = chartStyle.resolveMinorTickStyle({ tickLength: tickLen, strokeWidth: axisStrokeWidth });
      const minorSubdivisionsY = getAxisMinorTickSubdivisions('y');
      const minorTicksY = getAxisMinorTicksEnabled('y')
        ? chartStyle.computeMinorTickPositions({
            majorTicks: yScale.ticks,
            min: Number.isFinite(yScale.min) ? yScale.min : ymin,
            max: Number.isFinite(yScale.max) ? yScale.max : ymax,
            scale: logScale ? 'log' : 'linear',
            domainMin: logScale ? ymin : null,
            domainMax: logScale ? ymax : null,
            logBase: 10,
            subdivisions: minorSubdivisionsY
          }).filter(value => {
            if(!brokenScale || !brokenScale.isBroken){ return true; }
            return brokenScale.segments.some(seg => value >= seg.start && value <= seg.end);
          })
        : [];
      const boxWidthForTrace = () => Math.max(6, Math.min(60, perGroupBand * 0.6));
      const localBandWidthForTrace = () => {
        if(separatedSpacing){
          return separatedSpacing.bandWidth;
        }
        return usesGroupedSpacing ? perGroupBand : bandW;
      };
      const xCenter = (trace, traceIndex) => {
        if(usesGroupedSpacing){
          const categoryIdx = Number.isFinite(trace?.categoryIndex) ? trace.categoryIndex : traceIndex;
          const groupIdx = Number.isFinite(trace?.groupIndex) ? trace.groupIndex : 0;
          const left = marginLocal.left + categoryIdx * (bandW + datasetGapPx) + groupOffset;
          return left + (groupIdx + 0.5) * perGroupBand;
        }
        if(separatedSpacing){
          const categoryIdx = Number.isFinite(trace?.categoryIndex) ? trace.categoryIndex : traceIndex;
          if(categoryIdx >= 0 && categoryIdx < separatedSpacing.centers.length){
            return separatedSpacing.centers[categoryIdx];
          }
        }
        const categoryIdx = Number.isFinite(trace?.categoryIndex) ? trace.categoryIndex : traceIndex;
        // account for gap between bands when computing center
        const x = marginLocal.left + categoryIdx * (bandW + datasetGapPx) + bandW / 2;
        return x;
      };
      const addAxisElement = (tag, attrs) => appendToLayer(axisLayer || svg, tag, attrs);
      let stackOffsets = null;
      const yAxisX = marginLocal.left;
      const xAxisY = graphTypeRaw === 'bar' ? y2px(0) : marginLocal.top + plotHLocal;
      if(showGrid){
        yScale.ticks.forEach(t => {
          const y = y2px(t);
          addGrid('line',{ x1: yAxisX, y1: y, x2: yAxisX + plotWLocal, y2: y, stroke: '#ddd', 'stroke-width': gridStrokeWidth });
        });
        console.debug('Debug: box grid stroke scaled',{ horizontal: yScale.ticks.length, gridStrokeWidth });
      }
      const yTickPositions = yScale.ticks.map(t => y2px(t));
      let axisYStart = yTickPositions.length ? Math.min(...yTickPositions) : marginLocal.top;
      let axisYEnd = yTickPositions.length ? Math.max(...yTickPositions) : marginLocal.top + plotHLocal;
      if(axisYStart === axisYEnd){
        axisYStart = marginLocal.top;
        axisYEnd = marginLocal.top + plotHLocal;
      }
      axisYStart = Math.min(axisYStart, xAxisY);
      axisYEnd = Math.max(axisYEnd, xAxisY);
      console.debug('Debug: box axis join span',{ axisYStart, axisYEnd, xAxisY, yAxisX });
      
      // Draw y-axis with broken axis support
      if(brokenScale && brokenScale.isBroken){
        // Draw each segment separately but register one combined hit area
        // spanning from the top of the first segment to the bottom of the last.
        const axisPixelTop = y2px(yScale.max);
        const axisPixelBottom = y2px(yScale.min);
        const segmentCoords = seg => {
          // Clamp segment pixel bounds so they never extend beyond
          // the continuous axis extent used for ticks.
          const rawTop = marginLocal.top + plotHLocal - seg.pixelEnd;
          const rawBottom = marginLocal.top + plotHLocal - seg.pixelStart;
          const top = Math.max(axisPixelTop, Math.min(axisPixelBottom, rawTop));
          const bottom = Math.max(axisPixelTop, Math.min(axisPixelBottom, rawBottom));
          return {
            top: Math.min(top, bottom),
            bottom: Math.max(top, bottom)
          };
        };

        let combinedTop = Infinity;
        let combinedBottom = -Infinity;

        brokenScale.segments.forEach(seg => {
          const { top: segYTop, bottom: segYBottom } = segmentCoords(seg);

          // Visible axis line for this segment
          addAxisElement('line',{
            x1: yAxisX,
            y1: segYTop,
            x2: yAxisX,
            y2: segYBottom,
            stroke: axisStroke,
            'stroke-linecap': 'square',
            'stroke-width': axisStrokeWidth
          });

          combinedTop = Math.min(combinedTop, segYTop);
          combinedBottom = Math.max(combinedBottom, segYBottom);
        });

        // Single transparent hit area covering the whole broken axis range.
        if(isFinite(combinedTop) && isFinite(combinedBottom)){
          const hitLine = addAxisElement('line',{
            x1: yAxisX,
            y1: combinedTop,
            x2: yAxisX,
            y2: combinedBottom,
            stroke: 'transparent',
            'stroke-width': 20,
            'pointer-events': 'stroke'
          });
          if(axisControls && typeof axisControls.registerAxisElement === 'function'){
            axisControls.registerAxisElement(hitLine, axisControlConfig('y'));
          }
        }
      }else{
        // Standard continuous y-axis
        const yAxisLine = addAxisElement('line',{ x1: yAxisX, y1: axisYStart, x2: yAxisX, y2: axisYEnd, stroke: axisStroke, 'stroke-linecap': 'square', 'stroke-width': axisStrokeWidth });
        if(axisControls && typeof axisControls.registerAxisElement === 'function'){
          axisControls.registerAxisElement(yAxisLine, axisControlConfig('y'));
        }
      }
      let yTickFontCount = 0;
      if(minorTicksY.length){
        minorTicksY.forEach(value => {
          if(!isYValueVisible(value)){ return; }
          const y = y2px(value);
          addAxisElement('line',{
            x1: yAxisX - minorTickStyle.length,
            y1: y,
            x2: yAxisX,
            y2: y,
            stroke: axisStroke,
            'stroke-width': minorTickStyle.strokeWidth,
            'stroke-linecap': 'round',
            opacity: minorTickStyle.opacity
          });
        });
      }
      yScale.ticks.forEach((t, i) => {
        if(!isYValueVisible(t)){
          return; // Skip ticks that fall in gaps
        }
        const y = y2px(t);
        addAxisElement('line',{ x1: yAxisX - tickLen, y1: y, x2: yAxisX, y2: y, stroke: axisStroke, 'stroke-width': axisStrokeWidth });
        const txt = addAxisElement('text',{ x: yAxisX - (tickLen + tickGap), y, 'font-size': fs, 'text-anchor': 'end', 'dominant-baseline': 'middle', fill: chartStyle.TEXT_COLOR });
        txt.textContent = formatTick(logScale ? Math.pow(10, t) : t);
        markFontEditable(txt,'yTick');
        yTickFontCount += 1;
      });
      const xTickPositions = separatedSpacing
        ? separatedSpacing.centers.slice()
        : axisLabels.map((_, i) => marginLocal.left + i * (bandW + datasetGapPx) + bandW / 2);
      const xIntervalSetting = getAxisTickInterval('x');
      const xInterval = Number.isFinite(xIntervalSetting) && xIntervalSetting > 1 ? Math.max(1, Math.round(xIntervalSetting)) : null;
      let axisXStart = xTickPositions.length ? Math.min(...xTickPositions) : yAxisX;
      let axisXEnd = xTickPositions.length ? Math.max(...xTickPositions) : yAxisX + plotWLocal;
      if(xTickPositions.length === 1){
        const halfBand = Math.max(6, bandW * 0.5);
        axisXStart = xTickPositions[0] - halfBand;
        axisXEnd = xTickPositions[0] + halfBand;
      }
      if(axisXStart === axisXEnd){
        axisXStart = yAxisX;
        axisXEnd = yAxisX + plotWLocal;
      }
      axisXStart = Math.min(axisXStart, yAxisX);
      const frameXMax = yAxisX + plotWLocal;
      axisXEnd = Math.max(axisXEnd, frameXMax);
      console.debug('Debug: box x-axis span',{ axisXStart, axisXEnd, yAxisX, frameXMax });
      const xAxisLine = addAxisElement('line',{ x1: yAxisX, y1: xAxisY, x2: axisXEnd, y2: xAxisY, stroke: axisStroke, 'stroke-linecap': 'square', 'stroke-width': axisStrokeWidth });
      if(axisControls && typeof axisControls.registerAxisElement === 'function'){
        axisControls.registerAxisElement(xAxisLine, axisControlConfig('x'));
      }
      console.debug('Debug: box axes stroke scaled',{ axisStrokeWidth });
      if(showFrame){
        console.debug('Debug: box frame request',{ stroke: axisStroke, showFrame, axisStrokeWidth });
        const doc = svg.ownerDocument || global.document;
        const frameGroup = doc?.createElementNS ? doc.createElementNS(NS, 'g') : null;
        if(frameGroup){
          frameGroup.setAttribute('stroke-width', axisStrokeWidth);
          frameGroup.setAttribute('fill', 'none');
          (axisLayer || svg).appendChild(frameGroup);
          chartStyle.drawPlotFrame({ svg, group: frameGroup, margin: marginLocal, plotW: plotWLocal, plotH: plotHLocal, stroke: axisStroke, strokeWidth: axisStrokeWidth, sides: ['top', 'right'] });
          console.debug('Debug: box frame stroke scaled',{ axisStrokeWidth });
        }else{
          chartStyle.drawPlotFrame({ svg, margin: marginLocal, plotW: plotWLocal, plotH: plotHLocal, stroke: axisStroke, strokeWidth: axisStrokeWidth, sides: ['top', 'right'], group: axisLayer || svg });
          console.debug('Debug: box frame group fallback used');
        }
      }
      const xLabelOffset = tickLen + tickGap;
      const xLabels = [];
      let xTickFontCount = 0;
      let renderedXTicks = 0;
      axisLabels.forEach((lab, i) => {
        if(xInterval && i % xInterval !== 0){
          return;
        }
        const x = separatedSpacing ? separatedSpacing.centers[i] : marginLocal.left + i * (bandW + datasetGapPx) + bandW / 2;
        addAxisElement('line',{ x1: x, y1: xAxisY, x2: x, y2: xAxisY + tickLen, stroke: axisStroke, 'stroke-width': axisStrokeWidth });
        const labelText = lab || `Category ${i + 1}`;
        const extra = Shared.computeAxisLabelYOffset ? Shared.computeAxisLabelYOffset(fs, tickLen, tickGap) : 0;
        const t = addAxisElement('text',{ x, y: xAxisY + xLabelOffset + extra, 'font-size': fs, 'text-anchor': 'middle', fill: chartStyle.TEXT_COLOR });
        t.textContent = labelText;
        Shared.applyTextBaseline && Shared.applyTextBaseline(t, 'hanging', fs);
        markFontEditable(t,'xTick');
        xTickFontCount += 1;
        if(isGroupedMode){
          t.style.cursor = 'default';
        }else{
          t.style.cursor = 'ew-resize';
          enableLabelDrag(t, i);
        }
        xLabels.push(t);
        renderedXTicks += 1;
      });
      console.debug('Debug: box font tick binding',{ xTickFontCount, yTickFontCount }); // Debug: tick font binding counts
      console.debug('Debug: box ticks stroke scaled',{ yTickCount: yScale.ticks.length, xTickCount: renderedXTicks, axisStrokeWidth });
      chartStyle.applyLabelOrientation(xLabels,{ angle: -45, anchor: 'end', dy: '0.35em', force: bottomLayout.shouldRotate });
      if(xInterval && axisLabels.length){
        console.debug('Debug: box x-axis tick filter',{ interval: xInterval, rendered: renderedXTicks, total: axisLabels.length });
      }
      function enableLabelDrag(t, idx){
        if(isGroupedMode){
          return;
        }
        t.addEventListener('mousedown', e => {
          e.preventDefault();
          const svgRect = svg.getBoundingClientRect();
          const onMove = ev => {
            const svgX = ev.clientX - svgRect.left;
            t.setAttribute('x', svgX);
          };
          const onUp = ev => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            const svgX = ev.clientX - svgRect.left;
            let targetIdx;
            if(separatedSpacing){
              let best = 0;
              let bestDist = Infinity;
              for(let j = 0; j < separatedSpacing.centers.length; j++){
                const d = Math.abs(svgX - separatedSpacing.centers[j]);
                if(d < bestDist){ bestDist = d; best = j; }
              }
              targetIdx = best;
            }else{
              const bandSpan = bandW + datasetGapPx;
              targetIdx = Math.floor((svgX - marginLocal.left) / bandSpan);
              targetIdx = Math.max(0, Math.min(axisLabels.length - 1, targetIdx));
            }
            if(targetIdx !== idx){
              const moved = state.colOrder.splice(idx, 1)[0];
              state.colOrder.splice(targetIdx, 0, moved);
            }
            if(Shared.isDebugEnabled?.()){
              console.log('boxplot label drag end',{ component: 'box', from: idx, to: targetIdx, orientation: 'horizontal-axis' });
            }
            state.scheduleDraw();
          };
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        });
      }
      const defaultYX = marginLocal.left - (maxTickWidth + tickLen + tickGap + axisMetrics.axisTitleGap + fs * 0.5);
      const defaultYY = marginLocal.top + plotHLocal / 2;
      const yLabelPos = state.labelPositions?.yLabel;
      const yTextX = yLabelPos?.x ?? defaultYX;
      const yTextY = yLabelPos?.y ?? defaultYY;
      const yText = addAxisElement('text',{ x: yTextX, y: yTextY, transform: `rotate(-90 ${yTextX} ${yTextY})`, 'text-anchor': 'middle', 'font-size': fs, fill: chartStyle.TEXT_COLOR });
      yText.textContent = state.yLabelText;
      markFontEditable(yText,'yTitle','yTitle');
      const applyBoxYLabel = value => {
        const nextValue = value != null ? String(value) : '';
        state.yLabelText = nextValue;
        if(yText.textContent !== nextValue){
          yText.textContent = nextValue;
        }
        state.scheduleDraw();
      };
      makeEditable(yText, txt => {
        const previous = state.yLabelText != null ? String(state.yLabelText) : '';
        const nextValue = txt != null ? String(txt) : '';
        if(previous === nextValue){
          return;
        }
        applyBoxYLabel(nextValue);
        recordBoxChange('box:y-label', previous, nextValue, applyBoxYLabel);
      });
      // Enable drag for y-axis label
      if(typeof Shared.enableLabelDrag === 'function'){
        Shared.enableLabelDrag(yText, svg, {
          onDragEnd: pos => {
            state.labelPositions.yLabel = { x: pos.x, y: pos.y };
            console.debug('Debug: box y-label position saved', pos);
          }
        });
      }
      const renderSwarmPointsVertical = params => {
        const {
          valueList,
          cx,
          localBand,
          sampleCount,
          traceIndex,
          tooltipSeriesName,
          tooltipCategoryName,
          tooltipGroupName,
          fillColor,
          borderColor,
          violinBounds = null,
          groupAttrs = {},
          opacityMultiplier = 1,
          debugLabel = 'individual',
          mean: meanValue = null,
          widthScaleMode = 'none',
          maxHalfWidth = null
        } = params || {};
        const pointEntries = Array.isArray(valueList) ? valueList.map((value, idx)=>({ index: idx, coord: y2px(value), raw: value })) : [];
        const traceStyle = getPointStyle(traceIndex);
        const baseRadius = traceStyle && Number.isFinite(Number(traceStyle.size)) ? Number(traceStyle.size) : null;
        const swarm = computeSwarmOffsets(pointEntries, {
          axisSpacing: localBand,
          pointRadius: baseRadius != null ? baseRadius : pointRadius,
          sampleSize: sampleCount,
          orientation: 'vertical',
          widthScaleMode,
          maxHalfWidth
        });
        const effectiveRadius = baseRadius != null ? baseRadius : (swarm && Number.isFinite(Number(swarm.adjustedRadius)) ? swarm.adjustedRadius : pointRadius);
        const effectiveFill = (traceStyle && traceStyle.fill) ? traceStyle.fill : fillColor;
        const effectiveStroke = (traceStyle && traceStyle.stroke) ? traceStyle.stroke : 'none';
        const baseOpacity = traceStyle && traceStyle.opacity != null ? Number(traceStyle.opacity) : 1;
        const effectiveOpacity = Math.max(0, Math.min(1, baseOpacity * (opacityMultiplier != null ? opacityMultiplier : 1)));
        const effectiveShape = traceStyle && traceStyle.shape ? traceStyle.shape : 'circle';
        const clampOffset = (offset, entry) => {
          if(!violinBounds){
            return offset;
          }
          const maxHalf = violinBounds(entry.raw);
          if(!Number.isFinite(maxHalf) || maxHalf <= 0){
            return 0;
          }
          const limit = Math.max(0, maxHalf - effectiveRadius);
          if(limit <= 0){
            return 0;
          }
          return Math.max(-limit, Math.min(limit, offset));
        };
        const groupAttributes = { 'data-trace': traceIndex, 'data-export-layer': 'box-points', ...groupAttrs };
        const group = add('g', groupAttributes);
        let maxOffsetUsed = 0;
        if(pointEntries.length > BOX_POINT_BATCH_THRESHOLD && BATCHABLE_POINT_SHAPES.has(effectiveShape)){
          const pts = pointEntries.map(entry => {
            const offset = clampOffset(swarm.offsets[entry.index] || 0, entry);
            const abs = Math.abs(offset);
            if(abs > maxOffsetUsed){
              maxOffsetUsed = abs;
            }
            return { x: cx + offset, y: entry.coord };
          });
          const pathNode = createBatchedPointPath(document, pts, Math.max(1, Math.round(effectiveRadius * 2)), { fill: effectiveFill, fillOpacity: effectiveOpacity, stroke: effectiveStroke, strokeWidth: Math.max(0.2, borderWidthPx || 0.6), dataTrace: traceIndex, shape: effectiveShape });
          pathNode.__batchedPoints = pts;
          group.appendChild(pathNode);
          attachBoxPointTooltip(pathNode, {
            seriesName: tooltipSeriesName,
            categoryName: tooltipCategoryName,
            groupName: tooltipGroupName,
            value: null,
            rawValue: null,
            index: null
          });
        }else{
          const frag = document.createDocumentFragment();
          pointEntries.forEach(entry => {
            const rawOffset = swarm.offsets[entry.index] || 0;
            const offset = clampOffset(rawOffset, entry);
            const abs = Math.abs(offset);
            if(abs > maxOffsetUsed){
              maxOffsetUsed = abs;
            }
            let node = null;
            if(effectiveShape === 'circle'){
              node = document.createElementNS(NS, 'circle');
              node.setAttribute('cx', cx + offset);
              node.setAttribute('cy', entry.coord);
              node.setAttribute('r', effectiveRadius);
            }else if(effectiveShape === 'square'){
              node = document.createElementNS(NS, 'rect');
              const size = effectiveRadius * 2;
              node.setAttribute('x', String(cx + offset - effectiveRadius));
              node.setAttribute('y', String(entry.coord - effectiveRadius));
              node.setAttribute('width', String(size));
              node.setAttribute('height', String(size));
            }else if(effectiveShape === 'triangle'){
              node = document.createElementNS(NS, 'path');
              const d = `M ${cx + offset} ${entry.coord - effectiveRadius} L ${cx + offset + effectiveRadius} ${entry.coord + effectiveRadius} L ${cx + offset - effectiveRadius} ${entry.coord + effectiveRadius} Z`;
              node.setAttribute('d', d);
            }else if(effectiveShape === 'diamond'){
              node = document.createElementNS(NS, 'path');
              const d = `M ${cx + offset} ${entry.coord - effectiveRadius} L ${cx + offset + effectiveRadius} ${entry.coord} L ${cx + offset} ${entry.coord + effectiveRadius} L ${cx + offset - effectiveRadius} ${entry.coord} Z`;
              node.setAttribute('d', d);
            }else{
              node = document.createElementNS(NS, 'circle');
              node.setAttribute('cx', cx + offset);
              node.setAttribute('cy', entry.coord);
              node.setAttribute('r', effectiveRadius);
            }
            if(node){
              node.setAttribute('fill', effectiveFill);
              if(effectiveStroke && effectiveStroke !== 'none') node.setAttribute('stroke', effectiveStroke);
              node.setAttribute('fill-opacity', String(effectiveOpacity));
              node.setAttribute('data-shape', effectiveShape);
              node.setAttribute('data-point-size', String(effectiveRadius * 2));
              node.setAttribute('data-point-cx', String(cx + offset));
              node.setAttribute('data-point-cy', String(entry.coord));
              attachBoxPointTooltip(node, {
                seriesName: tooltipSeriesName,
                categoryName: tooltipCategoryName,
                groupName: tooltipGroupName,
                value: entry.raw,
                rawValue: entry.raw,
                index: entry.index
              });
              frag.appendChild(node);
            }
          });
          group.appendChild(frag);
        }
        if(debugEnabled){
          console.debug('Debug: box individual vertical render',{ index: traceIndex, mean: meanValue, maxOffsetUsed: Math.max(maxOffsetUsed, swarm?.maxOffsetUsed || 0), spreadFactor: swarm?.spreadFactor, pointCount: sampleCount, mode: debugLabel, bounded: !!violinBounds });
        }
        return { swarm, maxOffsetUsed: Math.max(maxOffsetUsed, swarm?.maxOffsetUsed || 0), effectiveRadius };
      };
      const stackedErrorQueue = [];
      const annotationMaxByTrace = new Array(traces.length).fill(null);
      for(let i = 0; i < traces.length; i++){
        if(token !== state.drawToken){
          console.log('boxplot draw cancelled during render loop',{ token });
          return null;
        }
        const t = traces[i];
        const summary = t.__distribution || computeTraceSummary(t.y, { requireSorted: graphTypeRaw === 'violin' });
        if(!summary || !summary.count){
          continue;
        }
        const valueList = summary.sortedValues || t.y;
        const tooltipSeriesName = t?.name || `Trace ${i + 1}`;
        const tooltipCategoryName = t?.categoryName || axisLabels?.[i] || tooltipSeriesName;
        const tooltipGroupName = t?.groupName || null;
        const cx = xCenter(t, i);
        const localBand = localBandWidthForTrace();
        const boxW = Math.max(6, Math.min(60, localBand * 0.6));
        const x0 = cx - boxW / 2;
        const x1 = cx + boxW / 2;
        const q1 = summary.q1;
        const med = summary.median;
        const q3 = summary.q3;
        const iqr = summary.iqr;
        const sampleCount = summary.count;
        const mean = summary.mean;
        const sdForRule = whiskerNeedsSd ? summary.sd : 0;
        const whiskerInfo = computeWhiskerFences({
          q1,
          q3,
          iqr,
          mean,
          sd: sdForRule,
          rule: whiskerRuleCurrent,
          customMultiplier: whiskerCustomValue,
          debugEnabled,
          meta: whiskerMetaGlobal
        });
        const lowerFence = whiskerInfo.lowerFence;
        const upperFence = whiskerInfo.upperFence;
        const whiskerAnnotation = whiskerInfo.annotation;
        const outlierAnnotation = whiskerAnnotation ? `${whiskerAnnotation} Outlier.` : null;
        const whiskerExtents = resolveWhiskerExtents(valueList,
          { lowerFence, upperFence, q1, q3 },
          {
            debugEnabled,
            label: t?.name || `Trace ${i + 1}`,
            orientation: 'vertical',
            token,
            minValue: summary.min,
            maxValue: summary.max
          }
        );
        const { wMin, wMax, outliers } = whiskerExtents;
        const yQ1 = y2px(q1);
        const yMed = y2px(med);
        const yQ3 = y2px(q3);
        const yWMin = y2px(wMin);
        const yWMax = y2px(wMax);
        const colorInfo = resolveTraceColor(t, i);
        const fillColor = t.fillColor || colorInfo.fillColor;
        const borderColor = t.borderColor || colorInfo.borderColor || defaultBorder || '#000';
        const strokeOverrideRaw = Number.isFinite(Number(colorInfo.strokeWidth))
          ? Number(colorInfo.strokeWidth)
          : (Number.isFinite(borderWidthPx) ? borderWidthPx : null);
        const strokeWidthEffective = Number.isFinite(strokeOverrideRaw) && strokeOverrideRaw > 0
          ? strokeOverrideRaw
          : Math.max(0.5, Number.isFinite(borderWidthPx) && borderWidthPx > 0 ? borderWidthPx : 1);
        const opacityOverride = colorInfo.opacity != null ? Math.min(1, Math.max(0, Number(colorInfo.opacity))) : null;
        const yMean = y2px(mean);
        let violinPointBounds = null;
        if(graphTypeRaw === 'box' || graphTypeRaw === 'notched'){
          annotationMaxByTrace[i] = wMax;
          if(graphTypeRaw === 'box'){
            const boxAttrs = { x: x0, y: yQ3, width: boxW, height: Math.max(1, yQ1 - yQ3), fill: fillColor, stroke: borderColor, 'stroke-width': strokeWidthEffective, 'data-trace': i, 'data-color-index': colorInfo.colorIndex, 'data-box-shape': 'body' };
            if(opacityOverride != null){
              boxAttrs['fill-opacity'] = opacityOverride;
              boxAttrs['stroke-opacity'] = opacityOverride;
            }
            const boxRect = add('rect', boxAttrs);
            attachBoxShapeHandler(boxRect);
            annotateWithTitle(boxRect, whiskerAnnotation);
            const medianAttrs = { x1: x0, y1: yMed, x2: x1, y2: yMed, stroke: borderColor, 'stroke-width': strokeWidthEffective, 'data-trace': i, 'data-color-index': colorInfo.colorIndex, 'data-box-shape': 'body' };
            if(opacityOverride != null){ medianAttrs['stroke-opacity'] = opacityOverride; }
            const medianLine = add('line', medianAttrs);
            attachBoxShapeHandler(medianLine);
            annotateWithTitle(medianLine, whiskerAnnotation);
          }else{
            const notchSpan = 1.57 * (iqr) / Math.sqrt(sampleCount);
            let notchLower = Math.max(q1, med - notchSpan);
            let notchUpper = Math.min(q3, med + notchSpan);
            if(notchLower > notchUpper){
              const mid = (notchLower + notchUpper) / 2;
              notchLower = notchUpper = mid;
            }
            const yNL = y2px(notchLower);
            const yNU = y2px(notchUpper);
            const notchWidth = boxW * 0.4;
            const xNL = cx - notchWidth / 2;
            const xNR = cx + notchWidth / 2;
            const d = [
              `M ${x0} ${yQ3}`,
              `L ${x1} ${yQ3}`,
              `L ${x1} ${yNU}`,
              `L ${xNR} ${yMed}`,
              `L ${x1} ${yNL}`,
              `L ${x1} ${yQ1}`,
              `L ${x0} ${yQ1}`,
              `L ${x0} ${yNL}`,
              `L ${xNL} ${yMed}`,
              `L ${x0} ${yNU}`,
              'Z'
            ].join(' ');
            const notchAttrs = { d, fill: fillColor, stroke: borderColor, 'stroke-width': strokeWidthEffective, 'data-trace': i, 'data-color-index': colorInfo.colorIndex, 'data-box-shape': 'body' };
            if(opacityOverride != null){
              notchAttrs['fill-opacity'] = opacityOverride;
              notchAttrs['stroke-opacity'] = opacityOverride;
            }
            const notchPath = add('path', notchAttrs);
            attachBoxShapeHandler(notchPath);
            annotateWithTitle(notchPath, whiskerAnnotation);
            const notchMedianAttrs = { x1: xNL, y1: yMed, x2: xNR, y2: yMed, stroke: borderColor, 'stroke-width': strokeWidthEffective, 'data-trace': i, 'data-color-index': colorInfo.colorIndex, 'data-box-shape': 'body' };
            if(opacityOverride != null){ notchMedianAttrs['stroke-opacity'] = opacityOverride; }
            const notchMedian = add('line', notchMedianAttrs);
            attachBoxShapeHandler(notchMedian);
            annotateWithTitle(notchMedian, whiskerAnnotation);
          }
          const whiskerUpperAttrs = { x1: cx, y1: yQ3, x2: cx, y2: yWMax, stroke: borderColor, 'stroke-width': strokeWidthEffective != null ? strokeWidthEffective : errorBarWidthPx, 'data-trace': i, 'data-color-index': colorInfo.colorIndex, 'data-box-shape': 'body' };
          if(opacityOverride != null){ whiskerUpperAttrs['stroke-opacity'] = opacityOverride; }
          const whiskerUpperLine = add('line', whiskerUpperAttrs);
          attachBoxShapeHandler(whiskerUpperLine);
          annotateWithTitle(whiskerUpperLine, whiskerAnnotation);
          const whiskerLowerAttrs = { x1: cx, y1: yQ1, x2: cx, y2: yWMin, stroke: borderColor, 'stroke-width': strokeWidthEffective != null ? strokeWidthEffective : errorBarWidthPx, 'data-trace': i, 'data-color-index': colorInfo.colorIndex, 'data-box-shape': 'body' };
          if(opacityOverride != null){ whiskerLowerAttrs['stroke-opacity'] = opacityOverride; }
          const whiskerLowerLine = add('line', whiskerLowerAttrs);
          attachBoxShapeHandler(whiskerLowerLine);
          annotateWithTitle(whiskerLowerLine, whiskerAnnotation);
          if(showCaps){
            const cap = Math.max(6, boxW * 0.4);
            const capAttrsTop = { x1: cx - cap / 2, y1: yWMax, x2: cx + cap / 2, y2: yWMax, stroke: borderColor, 'stroke-width': strokeWidthEffective != null ? strokeWidthEffective : errorBarWidthPx, 'data-trace': i, 'data-color-index': colorInfo.colorIndex, 'data-box-shape': 'body' };
            if(opacityOverride != null){ capAttrsTop['stroke-opacity'] = opacityOverride; }
            const capTop = add('line', capAttrsTop);
            attachBoxShapeHandler(capTop);
            annotateWithTitle(capTop, whiskerAnnotation);
            const capAttrsBottom = { x1: cx - cap / 2, y1: yWMin, x2: cx + cap / 2, y2: yWMin, stroke: borderColor, 'stroke-width': strokeWidthEffective != null ? strokeWidthEffective : errorBarWidthPx, 'data-trace': i, 'data-color-index': colorInfo.colorIndex, 'data-box-shape': 'body' };
            if(opacityOverride != null){ capAttrsBottom['stroke-opacity'] = opacityOverride; }
            const capBottom = add('line', capAttrsBottom);
            attachBoxShapeHandler(capBottom);
            annotateWithTitle(capBottom, whiskerAnnotation);
          }
        }else if(graphTypeRaw === 'bar'){
          const stats = t.__barStats;
          const sampleCountBar = stats?.sampleCount ?? sampleCount;
          const hasSpread = !!(stats && stats.hasSpread);
          const sd = stats?.sd ?? 0;
          let barStartValue = 0;
          let barEndValue = mean;
          if(isStackedLayout){
            if(!stackOffsets){
              stackOffsets = new Map();
            }
            const stackKey = Number.isFinite(t.categoryIndex) ? t.categoryIndex : i;
            if(!stackOffsets.has(stackKey)){
              stackOffsets.set(stackKey, { pos: 0, neg: 0 });
            }
            const entry = stackOffsets.get(stackKey);
            if(mean >= 0){
              barStartValue = entry.pos;
              barEndValue = entry.pos + mean;
              entry.pos = barEndValue;
            }else{
              barStartValue = entry.neg;
              barEndValue = entry.neg + mean;
              entry.neg = barEndValue;
            }
          }
          const yStart = y2px(barStartValue);
          const yEnd = y2px(barEndValue);
          const rawTop = Math.min(yStart, yEnd);
          const rawBottom = Math.max(yStart, yEnd);
          const strokeInset = strokeWidthEffective > 0 ? strokeWidthEffective / 2 : 0;
          let rectY = rawTop + strokeInset;
          let rectBottom = rawBottom - strokeInset;
          if(rectBottom < rectY){
            const mid = (rawTop + rawBottom) / 2;
            rectY = mid;
            rectBottom = mid;
          }
          const rectH = Math.max(0, rectBottom - rectY);
          const barAttrs = {
            x: x0,
            y: rectY,
            width: boxW,
            height: rectH,
            fill: fillColor,
            stroke: borderColor,
            'stroke-width': strokeWidthEffective,
            'data-trace': i,
            'data-color-index': colorInfo.colorIndex,
            'data-box-shape': 'body'
          };
          if(opacityOverride != null){
            barAttrs['fill-opacity'] = opacityOverride;
            barAttrs['stroke-opacity'] = opacityOverride;
          }
          const barRect = add('rect', barAttrs);
          attachBoxShapeHandler(barRect);
          console.debug('Debug: box bar vertical bounds adjusted',{ index: i, rawTop, rawBottom, rectY, rectBottom, strokeInset });
          {
            let maxVisualValue = Math.max(barStartValue, barEndValue);
            if(hasSpread){
              if(isStackedLayout){
                const errorExtents = computeStackedErrorExtents(barStartValue, mean, sd, errorMode);
                if(errorExtents && Number.isFinite(errorExtents.highValue)){
                  maxVisualValue = Math.max(maxVisualValue, errorExtents.highValue);
                }
              }else{
                maxVisualValue = Math.max(maxVisualValue, mean + sd);
              }
            }
            annotationMaxByTrace[i] = maxVisualValue;
          }
          if(hasSpread){
            const cap = Math.max(6, boxW * 0.4);
            if(isStackedLayout){
              const errorExtents = computeStackedErrorExtents(barStartValue, mean, sd, errorMode);
              if(errorExtents){
                const yHigh = y2px(errorExtents.highValue);
                const yLowValue = errorMode === 'both' ? errorExtents.lowValue : errorExtents.segmentEnd;
                const yLow = y2px(yLowValue);
                stackedErrorQueue.push({
                  cx,
                  yHigh,
                  yLow,
                  cap,
                  borderColor,
                  showLowerCap: errorMode === 'both'
                });
              }
            }else{
              const ySdTop = y2px(mean + sd);
              if(errorMode === 'both'){
                const ySdBottom = y2px(mean - sd);
                add('line',{ x1: cx, y1: ySdTop, x2: cx, y2: ySdBottom, stroke: borderColor, 'stroke-width': strokeWidthEffective != null ? strokeWidthEffective : errorBarWidthPx, 'data-trace': i, 'data-color-index': colorInfo.colorIndex, 'data-box-shape': 'body', ...(opacityOverride != null ? { 'stroke-opacity': opacityOverride } : {}) });
                add('line',{ x1: cx - cap / 2, y1: ySdBottom, x2: cx + cap / 2, y2: ySdBottom, stroke: borderColor, 'stroke-width': strokeWidthEffective != null ? strokeWidthEffective : errorBarWidthPx, 'data-trace': i, 'data-color-index': colorInfo.colorIndex, 'data-box-shape': 'body', ...(opacityOverride != null ? { 'stroke-opacity': opacityOverride } : {}) });
              }else{
                add('line',{ x1: cx, y1: ySdTop, x2: cx, y2: yMean, stroke: borderColor, 'stroke-width': strokeWidthEffective != null ? strokeWidthEffective : errorBarWidthPx, 'data-trace': i, 'data-color-index': colorInfo.colorIndex, 'data-box-shape': 'body', ...(opacityOverride != null ? { 'stroke-opacity': opacityOverride } : {}) });
              }
              add('line',{ x1: cx - cap / 2, y1: ySdTop, x2: cx + cap / 2, y2: ySdTop, stroke: borderColor, 'stroke-width': strokeWidthEffective != null ? strokeWidthEffective : errorBarWidthPx, 'data-trace': i, 'data-color-index': colorInfo.colorIndex, 'data-box-shape': 'body', ...(opacityOverride != null ? { 'stroke-opacity': opacityOverride } : {}) });
            }
          }else{
            console.debug('Debug: box bar error bar skipped for single value',{ index: i, sampleCount: sampleCountBar, mean });
          }
        }else if(graphTypeRaw === 'violin'){
          const densitySource = summary.sortedValues || valueList.slice().sort((a, b) => a - b);
          const densityInfo = computeDensity(densitySource, yScale.min, yScale.max, violinState.sampleCount);
          const violinMaxValue = densityInfo.positions.length
            ? densityInfo.positions[densityInfo.positions.length - 1]
            : summary.max;
          annotationMaxByTrace[i] = Math.max(wMax, violinMaxValue);
          const peak = densityInfo.densities.length ? densityInfo.densities.reduce((max, d) => (d > max ? d : max), 0) : 1;
          const halfWidth = Math.max(6, Math.min(80, localBand * 0.45));
          violinPointBounds = createViolinBoundLookup(densityInfo, halfWidth, peak) || (() => halfWidth);
          const pathParts = [];
          for(let idx = 0; idx < densityInfo.positions.length; idx++){
            const pos = densityInfo.positions[idx];
            const density = peak ? densityInfo.densities[idx] / peak : 0;
            const y = y2px(pos);
            const offset = density * halfWidth;
            const xLeft = cx - offset;
            pathParts.push(`${idx === 0 ? 'M' : 'L'} ${xLeft} ${y}`);
          }
          for(let idx = densityInfo.positions.length - 1; idx >= 0; idx--){
            const pos = densityInfo.positions[idx];
            const density = peak ? densityInfo.densities[idx] / peak : 0;
            const y = y2px(pos);
            const offset = density * halfWidth;
            const xRight = cx + offset;
            pathParts.push(`L ${xRight} ${y}`);
          }
          pathParts.push('Z');
          const violinAttrs = { d: pathParts.join(' '), fill: fillColor, 'fill-opacity': opacityOverride != null ? opacityOverride : 0.7, stroke: borderColor, 'stroke-width': strokeWidthEffective, 'data-trace': i, 'data-color-index': colorInfo.colorIndex, 'data-box-shape': 'body' };
          if(opacityOverride != null){ violinAttrs['stroke-opacity'] = opacityOverride; }
          const violinPath = add('path', violinAttrs);
          attachBoxShapeHandler(violinPath);
          const insetBoxWidth = Math.max(3, Math.min(halfWidth * 0.175, boxW * 0.1));
          const insetStrokeWidth = Math.max(0.6, (strokeWidthEffective || borderWidthPx || 1) * 0.6);
          const whiskerStrokeWidth = Math.max(0.6, (strokeWidthEffective != null ? strokeWidthEffective : (errorBarWidthPx || insetStrokeWidth)));
          const insetX0 = cx - insetBoxWidth / 2;
          const insetX1 = insetX0 + insetBoxWidth;
          const violinWhisker = add('line',{ x1: cx, y1: yWMax, x2: cx, y2: yWMin, stroke: borderColor, 'stroke-width': whiskerStrokeWidth, 'data-trace': i, 'data-color-index': colorInfo.colorIndex, 'data-box-shape': 'body', ...(opacityOverride != null ? { 'stroke-opacity': opacityOverride } : {}) });
          attachBoxShapeHandler(violinWhisker);
          const violinRect = add('rect',{ x: insetX0, y: yQ3, width: insetBoxWidth, height: Math.max(1, yQ1 - yQ3), fill: '#fff', stroke: borderColor, 'stroke-width': insetStrokeWidth, 'data-trace': i, 'data-color-index': colorInfo.colorIndex, 'data-box-shape': 'body', ...(opacityOverride != null ? { 'stroke-opacity': opacityOverride } : {}) });
          attachBoxShapeHandler(violinRect);
          const violinMedian = add('line',{ x1: insetX0, y1: yMed, x2: insetX1, y2: yMed, stroke: borderColor, 'stroke-width': insetStrokeWidth, 'data-trace': i, 'data-color-index': colorInfo.colorIndex, 'data-box-shape': 'body', ...(opacityOverride != null ? { 'stroke-opacity': opacityOverride } : {}) });
          attachBoxShapeHandler(violinMedian);
          if(debugEnabled){
            console.debug('Debug: box violin vertical render',{ index: i, points: sampleCount, peak, halfWidth, insetBoxWidth });
          }
        }else if(graphTypeRaw === 'strip'){
          annotationMaxByTrace[i] = summary.max;
          const swarmResult = renderSwarmPointsVertical({
            valueList,
            cx,
            localBand,
            sampleCount,
            traceIndex: i,
            tooltipSeriesName,
            tooltipCategoryName,
            tooltipGroupName,
            fillColor,
            borderColor,
            groupAttrs: { 'data-individual': 'true' },
            opacityMultiplier: 1,
            debugLabel: 'individual',
            mean,
            widthScaleMode: 'density'
          });
          if(individualSummaryMode !== 'none'){
            const swarm = swarmResult?.swarm;
            const summaryRadius = swarmResult?.effectiveRadius != null
              ? swarmResult.effectiveRadius
              : (swarm && Number.isFinite(Number(swarm.adjustedRadius)) ? swarm.adjustedRadius : pointRadius);
            const summaryGroup = add('g',{ 'data-trace': i, 'data-summary': individualSummaryMode });
            summaryGroup.dataset.boxSummary = '1';
            summaryGroup.style.cursor = 'pointer';
            summaryGroup.addEventListener('click', handleBoxSummaryClick);
            const summaryCap = Math.max(6, localBand * 0.12);
            const summaryStyle = getSummaryStyle(i);
            const summaryColor = (summaryStyle && summaryStyle.color) ? summaryStyle.color : borderColor;
            const summaryOpacityRaw = summaryStyle ? clampSummaryOpacity(summaryStyle.opacity) : null;
            const summaryOpacity = summaryOpacityRaw == null ? 1 : summaryOpacityRaw;
            const summaryThicknessRaw = summaryStyle && Number.isFinite(Number(summaryStyle.thickness)) ? Number(summaryStyle.thickness) : null;
            const baseStroke = Math.max(errorBarWidthPx || 0, borderWidthPx || 0.8, 0.8);
            const summaryStrokeWidth = Math.max(0.2, summaryThicknessRaw != null ? summaryThicknessRaw : baseStroke * 1.5);
            const summaryIntervalWidth = Math.max(0.2, summaryThicknessRaw != null ? summaryThicknessRaw : (errorBarWidthPx || borderWidthPx || summaryStrokeWidth));
            const summaryStrokeAttrs = width => {
              const attrs = {
                stroke: summaryColor,
                'stroke-width': Math.max(0.2, Number.isFinite(width) ? width : summaryStrokeWidth),
                'data-summary-line': '1'
              };
              if(summaryOpacity !== 1){
                attrs['stroke-opacity'] = summaryOpacity;
              }
              return attrs;
            };
            const summaryAdd = (tag, attrs) => {
              const node = document.createElementNS(NS, tag);
              for(const [key, value] of Object.entries(attrs)){
                node.setAttribute(key, String(value));
              }
              if(tag === 'line' || tag === 'path' || tag === 'rect'){
                const widthOverride = attrs['stroke-width'];
                const merged = summaryStrokeAttrs(widthOverride);
                Object.entries(merged).forEach(([k,v]) => node.setAttribute(k,String(v)));
              }
              summaryGroup.appendChild(node);
              return node;
            };
            const summaryOps = {
              drawInterval: (low, high, opts = {}) => {
                if(!Number.isFinite(low) || !Number.isFinite(high)){
                  return false;
                }
                let start = low;
                let end = high;
                if(end < start){
                  [start, end] = [end, start];
                }
                const yStart = y2px(end);
                const yEnd = y2px(start);
                summaryAdd('line',{ x1: cx, y1: yStart, x2: cx, y2: yEnd, ...summaryStrokeAttrs(summaryIntervalWidth) });
                const capsEnabled = opts.caps !== false;
                const capSize = opts.capSize ?? summaryCap;
                if(capsEnabled && capSize > 0){
                  summaryAdd('line',{ x1: cx - capSize / 2, y1: yStart, x2: cx + capSize / 2, y2: yStart, ...summaryStrokeAttrs(summaryIntervalWidth) });
                  summaryAdd('line',{ x1: cx - capSize / 2, y1: yEnd, x2: cx + capSize / 2, y2: yEnd, ...summaryStrokeAttrs(summaryIntervalWidth) });
                }
                return true;
              },
              drawPoint: (value, radiusMultiplier = 1.4) => {
                if(!Number.isFinite(value)){
                  return false;
                }
                const cySummary = y2px(value);
                const halfWidth = Math.max(summaryCap, (summaryRadius || pointRadius) * radiusMultiplier, 4);
                summaryAdd('line',{ x1: cx - halfWidth, y1: cySummary, x2: cx + halfWidth, y2: cySummary, ...summaryStrokeAttrs(summaryStrokeWidth) });
                return true;
              },
              drawMedianLine: value => {
                if(!Number.isFinite(value)){
                  return false;
                }
                const yMid = y2px(value);
                summaryAdd('line',{ x1: cx - Math.max(summaryCap, 4), y1: yMid, x2: cx + Math.max(summaryCap, 4), y2: yMid, ...summaryStrokeAttrs(summaryStrokeWidth) });
                return true;
              },
              debug: debugEnabled
            };
            applyIndividualSummaryOverlay(individualSummaryMode, summary, valueList, summaryOps);
          }
        }
        if(pointMode !== 'none' && graphTypeRaw !== 'strip'){
          console.time(`boxplotPoints_${token}_${i}`);
          if(pointMode === 'outliers'){
            const frag = document.createDocumentFragment();
            let ptIdx = 0;
            for(const v of outliers){
              const c = document.createElementNS(NS, 'circle');
              c.setAttribute('cx', cx);
              c.setAttribute('cy', y2px(v));
              c.setAttribute('r', pointRadius);
              c.setAttribute('fill', fillColor);
              c.setAttribute('stroke', borderColor);
              annotateWithTitle(c, outlierAnnotation);
              attachBoxPointTooltip(c, {
                seriesName: tooltipSeriesName,
                categoryName: tooltipCategoryName,
                groupName: tooltipGroupName,
                value: v,
                rawValue: v,
                index: ptIdx
              });
              frag.appendChild(c);
              ptIdx++;
              if(ptIdx % 10000 === 0 && Shared.isDebugEnabled?.()){
                console.debug('boxplot outlier progress',{ component: 'box', index: i, ptIdx, token });
              }
            }
            add('g',{ 'data-trace': i, 'data-export-layer': 'box-points' }).appendChild(frag);
          }else if(graphTypeRaw === 'violin' && pointMode === 'overlay'){
            renderSwarmPointsVertical({
              valueList,
              cx,
              localBand,
              sampleCount,
              traceIndex: i,
              tooltipSeriesName,
              tooltipCategoryName,
              tooltipGroupName,
              fillColor,
              borderColor,
              violinBounds: violinPointBounds,
              groupAttrs: { 'data-individual': 'true' },
              opacityMultiplier: 0.6,
              debugLabel: 'violin-overlay',
              mean
            });
          }else{
            const overlayMode = pointMode === 'overlay';
            const centerX = overlayMode ? cx : (x0 - boxW * 0.3);
            const halfWidth = overlayMode
              ? Math.max(pointRadius * 1.1, boxW * 0.3)
              : Math.max(pointRadius * 1.1, boxW * 0.1);
            renderSwarmPointsVertical({
              valueList,
              cx: centerX,
              localBand,
              sampleCount,
              traceIndex: i,
              tooltipSeriesName,
              tooltipCategoryName,
              tooltipGroupName,
              fillColor,
              borderColor,
              groupAttrs: { 'data-individual': 'true' },
              opacityMultiplier: overlayMode ? 0.6 : 1,
              debugLabel: overlayMode ? 'overlay' : 'side',
              mean,
              maxHalfWidth: halfWidth
            });
          }
          console.timeEnd(`boxplotPoints_${token}_${i}`);
        }
      }
      if(isStackedLayout && stackedErrorQueue.length){
        stackedErrorQueue.forEach(item => {
          add('line',{ x1: item.cx, y1: item.yHigh, x2: item.cx, y2: item.yLow, stroke: item.borderColor, 'stroke-width': errorBarWidthPx });
          add('line',{ x1: item.cx - item.cap / 2, y1: item.yHigh, x2: item.cx + item.cap / 2, y2: item.yHigh, stroke: item.borderColor, 'stroke-width': errorBarWidthPx });
          if(item.showLowerCap){
            add('line',{ x1: item.cx - item.cap / 2, y1: item.yLow, x2: item.cx + item.cap / 2, y2: item.yLow, stroke: item.borderColor, 'stroke-width': errorBarWidthPx });
          }
        });
        console.debug('Debug: box stacked error overlay',{ count: stackedErrorQueue.length, orientation: 'vertical' });
      }
      const traceCenter = idx => {
        const trace = traces[idx];
        if(trace){
          return xCenter(trace, idx);
        }
        if(separatedSpacing && idx >= 0 && idx < separatedSpacing.centers.length){
          return separatedSpacing.centers[idx];
        }
        return marginLocal.left + (idx + 0.5) * bandW;
      };
      return {
        margin: marginLocal,
        plotW: plotWLocal,
        plotH: plotHLocal,
        categoryCenter: traceCenter,
        valueToCoord: y2px,
        annotationMaxByTrace,
        titleX: marginLocal.left + plotWLocal / 2,
        titleY: titleBand ? Math.max((fs || 12) * 1.25, titleBand * 0.55) : (marginLocal.top / 2),
        annotationMinY
      };
    }

    function renderHorizontal(){
      const tickFont = chartStyle.makeFont(fs);
      const axisLabelFont = chartStyle.makeFont(fs);
      const categoryWidths = labelTexts.map(lbl => chartStyle.measureText(lbl, axisLabelFont));
      const maxCategoryWidth = Math.max(...categoryWidths, 0);
      const tickLen = axisMetrics.tickLength;
      const tickGap = axisMetrics.tickLabelGap;
      const rightExtra = showSignificance && maxLevelEstimate ? (annotationBaseOffset + maxLevelEstimate * annotationLevelGap) : 0;
      let marginLocal = chartStyle.computeBaseMargins({ fontSize: fs, maxYLabelWidth: maxCategoryWidth, yTitleWidth: 0, axisMetrics, legendWidth: legendWidthForMargin });
      marginLocal.top = Math.max(marginLocal.top, fs * 2);
      marginLocal.left = Math.max(marginLocal.left, maxCategoryWidth + tickLen + tickGap + fs * 0.5);
      marginLocal.right = Math.max(marginLocal.right, rightExtra + fs);
      marginLocal.bottom = Math.max(marginLocal.bottom, tickLen + tickGap + fs + axisMetrics.axisTitleGap + fs);
      let plotWLocal = Math.max(20, W - marginLocal.left - marginLocal.right);
      let plotHLocal = Math.max(20, H - marginLocal.top - marginLocal.bottom);
      const xIntervalSetting = getAxisTickInterval('x');
      let yScale = buildAxisScale({
        dataMin: ymin,
        dataMax: ymax,
        manualMin: manualYMinValue,
        manualMax: manualYMaxValue,
        targetTickCount: chartStyle.estimateTickCount(Math.max(plotWLocal, 40), { axis: 'x', fallback: 6 })
      });
      if(xIntervalSetting){
        const manual = buildManualTicks(ymin, ymax, xIntervalSetting);
        if(manual){
          yScale = manual;
          console.debug('Debug: box x-axis manual override',{ step: manual.step, tickCount: manual.ticks.length });
        }
      }else{
        applyLogTickOverride(yScale);
      }
      const valueRange = yScale.max - yScale.min || 1;
      const valueToX = v => marginLocal.left + ((v - yScale.min) / valueRange) * plotWLocal;
      const minorTickStyle = chartStyle.resolveMinorTickStyle({ tickLength: tickLen, strokeWidth: axisStrokeWidth });
      const minorSubdivisionsX = getAxisMinorTickSubdivisions('x');
      const minorTicksX = getAxisMinorTicksEnabled('x')
        ? chartStyle.computeMinorTickPositions({
            majorTicks: yScale.ticks,
            min: Number.isFinite(yScale.min) ? yScale.min : ymin,
            max: Number.isFinite(yScale.max) ? yScale.max : ymax,
            scale: logScale ? 'log' : 'linear',
            domainMin: logScale ? ymin : null,
            domainMax: logScale ? ymax : null,
            logBase: 10,
            subdivisions: minorSubdivisionsX
          })
        : [];
      const renderSwarmPointsHorizontal = params => {
        const {
          valueList,
          cy,
          localBand,
          sampleCount,
          traceIndex,
          tooltipSeriesName,
          tooltipCategoryName,
          tooltipGroupName,
          fillColor,
          borderColor,
          violinBounds = null,
          groupAttrs = {},
          opacityMultiplier = 1,
          debugLabel = 'individual',
          mean: meanValue = null,
          widthScaleMode = 'none',
          maxHalfWidth = null
        } = params || {};
        const pointEntries = Array.isArray(valueList) ? valueList.map((value, idx)=>({ index: idx, coord: valueToX(value), raw: value })) : [];
        const traceStyleH = getPointStyle(traceIndex);
        const baseRadius = traceStyleH && Number.isFinite(Number(traceStyleH.size)) ? Number(traceStyleH.size) : null;
        const swarm = computeSwarmOffsets(pointEntries, {
          axisSpacing: localBand,
          pointRadius: baseRadius != null ? baseRadius : pointRadius,
          sampleSize: sampleCount,
          orientation: 'horizontal',
          widthScaleMode,
          maxHalfWidth
        });
        const effectiveRadius = baseRadius != null ? baseRadius : (swarm && Number.isFinite(Number(swarm.adjustedRadius)) ? swarm.adjustedRadius : pointRadius);
        const effectiveFill = (traceStyleH && traceStyleH.fill) ? traceStyleH.fill : fillColor;
        const effectiveStroke = (traceStyleH && traceStyleH.stroke) ? traceStyleH.stroke : 'none';
        const baseOpacity = traceStyleH && traceStyleH.opacity != null ? Number(traceStyleH.opacity) : 1;
        const effectiveOpacity = Math.max(0, Math.min(1, baseOpacity * (opacityMultiplier != null ? opacityMultiplier : 1)));
        const effectiveShape = traceStyleH && traceStyleH.shape ? traceStyleH.shape : 'circle';
        const clampOffset = (offset, entry) => {
          if(!violinBounds){
            return offset;
          }
          const maxHalf = violinBounds(entry.raw);
          if(!Number.isFinite(maxHalf) || maxHalf <= 0){
            return 0;
          }
          const limit = Math.max(0, maxHalf - effectiveRadius);
          if(limit <= 0){
            return 0;
          }
          return Math.max(-limit, Math.min(limit, offset));
        };
        const groupAttributes = { 'data-trace': traceIndex, 'data-export-layer': 'box-points', ...groupAttrs };
        const group = add('g', groupAttributes);
        let maxOffsetUsed = 0;
        if(pointEntries.length > BOX_POINT_BATCH_THRESHOLD && BATCHABLE_POINT_SHAPES.has(effectiveShape)){
          const pts = pointEntries.map(entry => {
            const offset = clampOffset(swarm.offsets[entry.index] || 0, entry);
            const abs = Math.abs(offset);
            if(abs > maxOffsetUsed){
              maxOffsetUsed = abs;
            }
            return { x: entry.coord, y: cy + offset };
          });
          const pathNode = createBatchedPointPath(document, pts, Math.max(1, Math.round(effectiveRadius * 2)), { fill: effectiveFill, fillOpacity: effectiveOpacity, stroke: effectiveStroke, strokeWidth: Math.max(0.2, borderWidthPx || 0.6), dataTrace: traceIndex, shape: effectiveShape });
          pathNode.__batchedPoints = pts;
          group.appendChild(pathNode);
          attachBoxPointTooltip(pathNode, {
            seriesName: tooltipSeriesName,
            categoryName: tooltipCategoryName,
            groupName: tooltipGroupName,
            value: null,
            rawValue: null,
            index: null
          });
        }else{
          const frag = document.createDocumentFragment();
          pointEntries.forEach(entry => {
            const rawOffset = swarm.offsets[entry.index] || 0;
            const offset = clampOffset(rawOffset, entry);
            const abs = Math.abs(offset);
            if(abs > maxOffsetUsed){
              maxOffsetUsed = abs;
            }
            let node = null;
            if(effectiveShape === 'circle'){
              node = document.createElementNS(NS, 'circle');
              node.setAttribute('cx', entry.coord);
              node.setAttribute('cy', cy + offset);
              node.setAttribute('r', effectiveRadius);
            }else if(effectiveShape === 'square'){
              node = document.createElementNS(NS, 'rect');
              const size = effectiveRadius * 2;
              node.setAttribute('x', String(entry.coord - effectiveRadius));
              node.setAttribute('y', String(cy + offset - effectiveRadius));
              node.setAttribute('width', String(size));
              node.setAttribute('height', String(size));
            }else if(effectiveShape === 'triangle'){
              node = document.createElementNS(NS, 'path');
              const d = `M ${entry.coord} ${cy + offset - effectiveRadius} L ${entry.coord + effectiveRadius} ${cy + offset + effectiveRadius} L ${entry.coord - effectiveRadius} ${cy + offset + effectiveRadius} Z`;
              node.setAttribute('d', d);
            }else if(effectiveShape === 'diamond'){
              node = document.createElementNS(NS, 'path');
              const d = `M ${entry.coord} ${cy + offset - effectiveRadius} L ${entry.coord + effectiveRadius} ${cy + offset} L ${entry.coord} ${cy + offset + effectiveRadius} L ${entry.coord - effectiveRadius} ${cy + offset} Z`;
              node.setAttribute('d', d);
            }else{
              node = document.createElementNS(NS, 'circle');
              node.setAttribute('cx', entry.coord);
              node.setAttribute('cy', cy + offset);
              node.setAttribute('r', effectiveRadius);
            }
            if(node){
              node.setAttribute('fill', effectiveFill);
              if(effectiveStroke && effectiveStroke !== 'none') node.setAttribute('stroke', effectiveStroke);
              node.setAttribute('fill-opacity', String(effectiveOpacity));
              node.setAttribute('data-shape', effectiveShape);
              node.setAttribute('data-point-size', String(effectiveRadius * 2));
              node.setAttribute('data-point-cx', String(entry.coord));
              node.setAttribute('data-point-cy', String(cy + offset));
              attachBoxPointTooltip(node, {
                seriesName: tooltipSeriesName,
                categoryName: tooltipCategoryName,
                groupName: tooltipGroupName,
                value: entry.raw,
                rawValue: entry.raw,
                index: entry.index
              });
              frag.appendChild(node);
            }
          });
          group.appendChild(frag);
        }
        if(debugEnabled){
          console.debug('Debug: box individual horizontal render',{ index: traceIndex, mean: meanValue, maxOffsetUsed: Math.max(maxOffsetUsed, swarm?.maxOffsetUsed || 0), spreadFactor: swarm?.spreadFactor, pointCount: sampleCount, mode: debugLabel, bounded: !!violinBounds });
        }
        return { swarm, maxOffsetUsed: Math.max(maxOffsetUsed, swarm?.maxOffsetUsed || 0), effectiveRadius };
      };
      const axisCount = Math.max(axisLabels.length, 1);
      // Add a small gap between adjacent category bands so datasets don't touch
      const rawBandH = plotHLocal / axisCount;
      const datasetGapFractionH = 0.06;
      const datasetGapPxH = Math.max(2, Math.min(40, rawBandH * datasetGapFractionH));
      let bandH = (plotHLocal - datasetGapPxH * Math.max(0, axisCount - 1)) / axisCount;
      const separatedSpacing = separatedCategoryUnits
        ? scaleSeparatedCategoryUnits(separatedCategoryUnits, plotHLocal, marginLocal.top)
        : null;
      if(separatedSpacing && Number.isFinite(separatedSpacing.bandWidth) && separatedSpacing.bandWidth > 0){
        bandH = separatedSpacing.bandWidth;
      }
      const groupCountLocal = usesGroupedSpacing ? Math.max(1, groupedGroups.length) : 1;
      const clusterGap = usesGroupedSpacing ? Math.min(bandH * 0.25, 16) : 0;
      let perGroupBand = usesGroupedSpacing ? (bandH - clusterGap) / groupCountLocal : bandH;
      if(!Number.isFinite(perGroupBand) || perGroupBand <= 0){
        perGroupBand = bandH / Math.max(groupCountLocal, 1);
      }
      const groupOffset = usesGroupedSpacing ? (bandH - perGroupBand * groupCountLocal) / 2 : 0;
      const boxHeightForTrace = () => Math.max(6, Math.min(60, perGroupBand * 0.6));
      const localBandHeightForTrace = () => {
        if(separatedSpacing){
          return separatedSpacing.bandWidth;
        }
        return usesGroupedSpacing ? perGroupBand : bandH;
      };
      const categoryCenter = (trace, traceIndex) => {
        if(usesGroupedSpacing){
          const categoryIdx = Number.isFinite(trace?.categoryIndex) ? trace.categoryIndex : traceIndex;
          const groupIdx = Number.isFinite(trace?.groupIndex) ? trace.groupIndex : 0;
          const top = marginLocal.top + categoryIdx * bandH + groupOffset;
          return top + (groupIdx + 0.5) * perGroupBand;
        }
        if(separatedSpacing){
          const categoryIdx = Number.isFinite(trace?.categoryIndex) ? trace.categoryIndex : traceIndex;
          if(categoryIdx >= 0 && categoryIdx < separatedSpacing.centers.length){
            return separatedSpacing.centers[categoryIdx];
          }
        }
        const categoryIdx = Number.isFinite(trace?.categoryIndex) ? trace.categoryIndex : traceIndex;
        // account for vertical gap between bands
        return marginLocal.top + categoryIdx * (bandH + datasetGapPxH) + bandH / 2;
      };
      const addAxisElement = (tag, attrs) => appendToLayer(axisLayer || svg, tag, attrs);
      let stackOffsets = null;
      if(showGrid){
        yScale.ticks.forEach(t => {
          const x = valueToX(t);
          addGrid('line',{ x1: x, y1: marginLocal.top, x2: x, y2: marginLocal.top + plotHLocal, stroke: '#ddd', 'stroke-width': gridStrokeWidth });
        });
        console.debug('Debug: box grid stroke scaled',{ vertical: yScale.ticks.length, gridStrokeWidth });
      }
      const yAxisLeft = marginLocal.left;
      const xAxisBottom = marginLocal.top + plotHLocal;
      const yAxisLine = addAxisElement('line',{ x1: yAxisLeft, y1: marginLocal.top, x2: yAxisLeft, y2: xAxisBottom, stroke: axisStroke, 'stroke-linecap': 'square', 'stroke-width': axisStrokeWidth });
      if(axisControls && typeof axisControls.registerAxisElement === 'function'){
        axisControls.registerAxisElement(yAxisLine, axisControlConfig('y'));
      }
      const yIntervalSetting = getAxisTickInterval('y');
      const yInterval = Number.isFinite(yIntervalSetting) && yIntervalSetting > 1 ? Math.max(1, Math.round(yIntervalSetting)) : null;
      let renderedYTicks = 0;
      axisLabels.forEach((lab, i) => {
        if(yInterval && i % yInterval !== 0){
          return;
        }
        const y = separatedSpacing ? separatedSpacing.centers[i] : marginLocal.top + (i + 0.5) * bandH;
        addAxisElement('line',{ x1: yAxisLeft, y1: y, x2: yAxisLeft - tickLen, y2: y, stroke: axisStroke, 'stroke-width': axisStrokeWidth });
        const labelText = lab || `Category ${i + 1}`;
        const t = addAxisElement('text',{ x: yAxisLeft - (tickLen + tickGap), y, 'font-size': fs, 'text-anchor': 'end', 'dominant-baseline': 'middle', fill: chartStyle.TEXT_COLOR });
        t.textContent = labelText;
        if(isGroupedMode){
          t.style.cursor = 'default';
        }else{
          t.style.cursor = 'ns-resize';
          enableVerticalLabelDrag(t, i);
        }
        renderedYTicks += 1;
      });
      if(yInterval && axisLabels.length){
        console.debug('Debug: box y-axis tick filter',{ interval: yInterval, rendered: renderedYTicks, total: axisLabels.length });
      }
      if(minorTicksX.length){
        minorTicksX.forEach(value => {
          const x = valueToX(value);
          addAxisElement('line',{
            x1: x,
            y1: xAxisBottom,
            x2: x,
            y2: xAxisBottom + minorTickStyle.length,
            stroke: axisStroke,
            'stroke-width': minorTickStyle.strokeWidth,
            'stroke-linecap': 'round',
            opacity: minorTickStyle.opacity
          });
        });
      }
      yScale.ticks.forEach(t => {
        const x = valueToX(t);
        addAxisElement('line',{ x1: x, y1: xAxisBottom, x2: x, y2: xAxisBottom + tickLen, stroke: axisStroke, 'stroke-width': axisStrokeWidth });
        const extra = Shared.computeAxisLabelYOffset ? Shared.computeAxisLabelYOffset(fs, tickLen, tickGap) : 0;
        const txt = addAxisElement('text',{ x, y: xAxisBottom + tickLen + tickGap + extra, 'font-size': fs, 'text-anchor': 'middle', fill: chartStyle.TEXT_COLOR });
        txt.textContent = formatTick(logScale ? Math.pow(10, t) : t);
        Shared.applyTextBaseline && Shared.applyTextBaseline(txt, 'hanging', fs);
      });
      const xAxisLine = addAxisElement('line',{ x1: yAxisLeft, y1: xAxisBottom, x2: marginLocal.left + plotWLocal, y2: xAxisBottom, stroke: axisStroke, 'stroke-linecap': 'square', 'stroke-width': axisStrokeWidth });
      if(axisControls && typeof axisControls.registerAxisElement === 'function'){
        axisControls.registerAxisElement(xAxisLine, axisControlConfig('x'));
      }
      if(showFrame){
        console.debug('Debug: box frame request',{ stroke: axisStroke, showFrame, axisStrokeWidth });
        const doc = svg.ownerDocument || global.document;
        const frameGroup = doc?.createElementNS ? doc.createElementNS(NS, 'g') : null;
        if(frameGroup){
          frameGroup.setAttribute('stroke-width', axisStrokeWidth);
          frameGroup.setAttribute('fill', 'none');
          (axisLayer || svg).appendChild(frameGroup);
          chartStyle.drawPlotFrame({ svg, group: frameGroup, margin: marginLocal, plotW: plotWLocal, plotH: plotHLocal, stroke: axisStroke, strokeWidth: axisStrokeWidth, sides: ['top', 'right'] });
        }else{
          chartStyle.drawPlotFrame({ svg, margin: marginLocal, plotW: plotWLocal, plotH: plotHLocal, stroke: axisStroke, strokeWidth: axisStrokeWidth, sides: ['top', 'right'], group: axisLayer || svg });
        }
      }
      const defaultXLabelX = marginLocal.left + plotWLocal / 2;
      const defaultXLabelY = xAxisBottom + tickLen + tickGap + axisMetrics.axisTitleGap + fs * 0.8;
      const xLabelPos = state.labelPositions?.xLabel;
      const xLabel = addAxisElement('text',{ x: xLabelPos?.x ?? defaultXLabelX, y: xLabelPos?.y ?? defaultXLabelY, 'text-anchor': 'middle', 'font-size': fs, fill: chartStyle.TEXT_COLOR });
      xLabel.textContent = state.yLabelText;
      const applyBoxXLabel = value => {
        const nextValue = value != null ? String(value) : '';
        state.yLabelText = nextValue;
        if(xLabel.textContent !== nextValue){
          xLabel.textContent = nextValue;
        }
        state.scheduleDraw();
      };
      makeEditable(xLabel, txt => {
        const previous = state.yLabelText != null ? String(state.yLabelText) : '';
        const nextValue = txt != null ? String(txt) : '';
        if(previous === nextValue){
          return;
        }
        applyBoxXLabel(nextValue);
        recordBoxChange('box:x-label', previous, nextValue, applyBoxXLabel);
      });
      // Enable drag for x-axis label (flipped mode)
      if(typeof Shared.enableLabelDrag === 'function'){
        Shared.enableLabelDrag(xLabel, svg, {
          onDragEnd: pos => {
            state.labelPositions.xLabel = { x: pos.x, y: pos.y };
            console.debug('Debug: box x-label position saved', pos);
          }
        });
      }
      function enableVerticalLabelDrag(t, idx){
        if(isGroupedMode){
          return;
        }
        t.addEventListener('mousedown', e => {
          e.preventDefault();
          const svgRect = svg.getBoundingClientRect();
          const onMove = ev => {
            const svgY = ev.clientY - svgRect.top;
            t.setAttribute('y', svgY);
          };
          const onUp = ev => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            const svgY = ev.clientY - svgRect.top;
            let targetIdx = Math.floor((svgY - marginLocal.top) / bandH);
            targetIdx = Math.max(0, Math.min(axisLabels.length - 1, targetIdx));
            if(targetIdx !== idx){
              const moved = state.colOrder.splice(idx, 1)[0];
              state.colOrder.splice(targetIdx, 0, moved);
            }
            if(Shared.isDebugEnabled?.()){
              console.log('boxplot label drag end',{ component: 'box', from: idx, to: targetIdx, orientation: 'vertical-axis' });
            }
            state.scheduleDraw();
          };
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        });
      }
      const stackedErrorQueue = [];
      const annotationMaxByTrace = new Array(traces.length).fill(null);
      for(let i = 0; i < traces.length; i++){
        if(token !== state.drawToken){
          console.log('boxplot draw cancelled during render loop',{ token });
          return null;
        }
        const t = traces[i];
        const summary = t.__distribution || computeTraceSummary(t.y, { requireSorted: graphTypeRaw === 'violin' });
        if(!summary || !summary.count){
          continue;
        }
        const valueList = summary.sortedValues || t.y;
        const tooltipSeriesName = t?.name || `Trace ${i + 1}`;
        const tooltipCategoryName = t?.categoryName || axisLabels?.[i] || tooltipSeriesName;
        const tooltipGroupName = t?.groupName || null;
        const cy = categoryCenter(t, i);
        const localBand = localBandHeightForTrace();
        const boxH = Math.max(6, Math.min(60, localBand * 0.6));
        const y0 = cy - boxH / 2;
        const y1 = cy + boxH / 2;
        const q1 = summary.q1;
        const med = summary.median;
        const q3 = summary.q3;
        const iqr = summary.iqr;
        const sampleCount = summary.count;
        const mean = summary.mean;
        const sdForRule = whiskerNeedsSd ? summary.sd : 0;
        const whiskerInfo = computeWhiskerFences({
          q1,
          q3,
          iqr,
          mean,
          sd: sdForRule,
          rule: whiskerRuleCurrent,
          customMultiplier: whiskerCustomValue,
          debugEnabled,
          meta: whiskerMetaGlobal
        });
        const lowerFence = whiskerInfo.lowerFence;
        const upperFence = whiskerInfo.upperFence;
        const whiskerAnnotation = whiskerInfo.annotation;
        const outlierAnnotation = whiskerAnnotation ? `${whiskerAnnotation} Outlier.` : null;
        const whiskerExtents = resolveWhiskerExtents(valueList,
          { lowerFence, upperFence, q1, q3 },
          {
            debugEnabled,
            label: t?.name || `Trace ${i + 1}`,
            orientation: 'horizontal',
            token,
            minValue: summary.min,
            maxValue: summary.max
          }
        );
        const { wMin, wMax, outliers } = whiskerExtents;
        const xQ1 = valueToX(q1);
        const xMed = valueToX(med);
        const xQ3 = valueToX(q3);
        const xWMin = valueToX(wMin);
        const xWMax = valueToX(wMax);
        const colorInfoH = resolveTraceColor(t, i);
        const fillColor = t.fillColor || colorInfoH.fillColor;
        const borderColor = t.borderColor || colorInfoH.borderColor || defaultBorder || '#000';
        const strokeOverrideRawH = Number.isFinite(Number(colorInfoH.strokeWidth))
          ? Number(colorInfoH.strokeWidth)
          : (Number.isFinite(borderWidthPx) ? borderWidthPx : null);
        const strokeWidthEffectiveH = Number.isFinite(strokeOverrideRawH) && strokeOverrideRawH > 0
          ? strokeOverrideRawH
          : Math.max(0.5, Number.isFinite(borderWidthPx) && borderWidthPx > 0 ? borderWidthPx : 1);
        const opacityOverride = colorInfoH.opacity != null ? Math.min(1, Math.max(0, Number(colorInfoH.opacity))) : null;
        const xMean = valueToX(mean);
        let violinPointBounds = null;
        if(graphTypeRaw === 'box' || graphTypeRaw === 'notched'){
          annotationMaxByTrace[i] = wMax;
          const left = Math.min(xQ1, xQ3);
          const right = Math.max(xQ1, xQ3);
          if(graphTypeRaw === 'box'){
            const boxAttrs = { x: left, y: y0, width: Math.max(1, right - left), height: Math.max(1, boxH), fill: fillColor, stroke: borderColor, 'stroke-width': strokeWidthEffectiveH, 'data-trace': i, 'data-color-index': colorInfoH.colorIndex, 'data-box-shape': 'body' };
            if(opacityOverride != null){
              boxAttrs['fill-opacity'] = opacityOverride;
              boxAttrs['stroke-opacity'] = opacityOverride;
            }
            const boxRect = add('rect', boxAttrs);
            attachBoxShapeHandler(boxRect);
            annotateWithTitle(boxRect, whiskerAnnotation);
            const medianAttrs = { x1: xMed, y1: y0, x2: xMed, y2: y1, stroke: borderColor, 'stroke-width': strokeWidthEffectiveH, 'data-trace': i, 'data-color-index': colorInfoH.colorIndex, 'data-box-shape': 'body' };
            if(opacityOverride != null){ medianAttrs['stroke-opacity'] = opacityOverride; }
            const medianLine = add('line', medianAttrs);
            attachBoxShapeHandler(medianLine);
            annotateWithTitle(medianLine, whiskerAnnotation);
          }else{
            const notchSpan = 1.57 * (iqr) / Math.sqrt(sampleCount);
            let notchLower = Math.max(q1, med - notchSpan);
            let notchUpper = Math.min(q3, med + notchSpan);
            if(notchLower > notchUpper){
              const mid = (notchLower + notchUpper) / 2;
              notchLower = notchUpper = mid;
            }
            const xNotchLow = valueToX(notchLower);
            const xNotchHigh = valueToX(notchUpper);
            const notchDepth = boxH * 0.4;
            const notchHalf = notchDepth / 2;
            let yNotchTop = cy - notchHalf;
            let yNotchBottom = cy + notchHalf;
            if(yNotchTop < y0) yNotchTop = y0;
            if(yNotchBottom > y1) yNotchBottom = y1;
            if(yNotchTop > yNotchBottom){
              const mid = (yNotchTop + yNotchBottom) / 2;
              yNotchTop = yNotchBottom = mid;
            }
            const d = [
              `M ${left} ${y0}`,
              `L ${xNotchLow} ${y0}`,
              `L ${xMed} ${yNotchTop}`,
              `L ${xNotchHigh} ${y0}`,
              `L ${right} ${y0}`,
              `L ${right} ${y1}`,
              `L ${xNotchHigh} ${y1}`,
              `L ${xMed} ${yNotchBottom}`,
              `L ${xNotchLow} ${y1}`,
              `L ${left} ${y1}`,
              'Z'
            ].join(' ');
            const notchAttrs = { d, fill: fillColor, stroke: borderColor, 'stroke-width': strokeWidthEffectiveH, 'data-trace': i, 'data-color-index': colorInfoH.colorIndex, 'data-box-shape': 'body' };
            if(opacityOverride != null){
              notchAttrs['fill-opacity'] = opacityOverride;
              notchAttrs['stroke-opacity'] = opacityOverride;
            }
            const notchPath = add('path', notchAttrs);
            attachBoxShapeHandler(notchPath);
            annotateWithTitle(notchPath, whiskerAnnotation);
            const notchMedianAttrs = { x1: xMed, y1: yNotchTop, x2: xMed, y2: yNotchBottom, stroke: borderColor, 'stroke-width': strokeWidthEffectiveH, 'data-trace': i, 'data-color-index': colorInfoH.colorIndex, 'data-box-shape': 'body' };
            if(opacityOverride != null){ notchMedianAttrs['stroke-opacity'] = opacityOverride; }
            const notchMedian = add('line', notchMedianAttrs);
            attachBoxShapeHandler(notchMedian);
            annotateWithTitle(notchMedian, whiskerAnnotation);
            // Debug: log the horizontal notch geometry so future tweaks keep parity with vertical boxes.
            console.debug('Debug: box horizontal notch path',{ notchLower, notchUpper, xNotchLow, xNotchHigh, yNotchTop, yNotchBottom, boxHeight: boxH, token });
          }
          const whiskerLeft = add('line',{ x1: xWMin, y1: cy, x2: left, y2: cy, stroke: borderColor, 'stroke-width': strokeWidthEffectiveH != null ? strokeWidthEffectiveH : errorBarWidthPx, 'data-trace': i, 'data-color-index': colorInfoH.colorIndex, 'data-box-shape': 'body', ...(opacityOverride != null ? { 'stroke-opacity': opacityOverride } : {}) });
          attachBoxShapeHandler(whiskerLeft);
          annotateWithTitle(whiskerLeft, whiskerAnnotation);
          const whiskerRight = add('line',{ x1: right, y1: cy, x2: xWMax, y2: cy, stroke: borderColor, 'stroke-width': strokeWidthEffectiveH != null ? strokeWidthEffectiveH : errorBarWidthPx, 'data-trace': i, 'data-color-index': colorInfoH.colorIndex, 'data-box-shape': 'body', ...(opacityOverride != null ? { 'stroke-opacity': opacityOverride } : {}) });
          attachBoxShapeHandler(whiskerRight);
          annotateWithTitle(whiskerRight, whiskerAnnotation);
          if(showCaps){
            const cap = Math.max(6, boxH * 0.4);
            const capLeft = add('line',{ x1: xWMin, y1: cy - cap / 2, x2: xWMin, y2: cy + cap / 2, stroke: borderColor, 'stroke-width': strokeWidthEffectiveH != null ? strokeWidthEffectiveH : errorBarWidthPx, 'data-trace': i, 'data-color-index': colorInfoH.colorIndex, 'data-box-shape': 'body', ...(opacityOverride != null ? { 'stroke-opacity': opacityOverride } : {}) });
            annotateWithTitle(capLeft, whiskerAnnotation);
            const capRight = add('line',{ x1: xWMax, y1: cy - cap / 2, x2: xWMax, y2: cy + cap / 2, stroke: borderColor, 'stroke-width': strokeWidthEffectiveH != null ? strokeWidthEffectiveH : errorBarWidthPx, 'data-trace': i, 'data-color-index': colorInfoH.colorIndex, 'data-box-shape': 'body', ...(opacityOverride != null ? { 'stroke-opacity': opacityOverride } : {}) });
            annotateWithTitle(capRight, whiskerAnnotation);
          }
        }else if(graphTypeRaw === 'bar'){
          const stats = t.__barStats;
          const sampleCountBar = stats?.sampleCount ?? sampleCount;
          const hasSpread = !!(stats && stats.hasSpread);
          const sd = stats?.sd ?? 0;
          let barStartValue = 0;
          let barEndValue = mean;
          if(isStackedLayout){
            if(!stackOffsets){
              stackOffsets = new Map();
            }
            const stackKey = Number.isFinite(t.categoryIndex) ? t.categoryIndex : i;
            if(!stackOffsets.has(stackKey)){
              stackOffsets.set(stackKey, { pos: 0, neg: 0 });
            }
            const entry = stackOffsets.get(stackKey);
            if(mean >= 0){
              barStartValue = entry.pos;
              barEndValue = entry.pos + mean;
              entry.pos = barEndValue;
            }else{
              barStartValue = entry.neg;
              barEndValue = entry.neg + mean;
              entry.neg = barEndValue;
            }
          }
          const xStart = valueToX(barStartValue);
          const xEnd = valueToX(barEndValue);
          const rawLeft = Math.min(xStart, xEnd);
          const rawRight = Math.max(xStart, xEnd);
          const strokeInset = strokeWidthEffectiveH > 0 ? strokeWidthEffectiveH / 2 : 0;
          let rectX = rawLeft + strokeInset;
          let rectRight = rawRight - strokeInset;
          if(rectRight < rectX){
            const mid = (rawLeft + rawRight) / 2;
            rectX = mid;
            rectRight = mid;
          }
          const rectW = Math.max(0, rectRight - rectX);
          let rectY = y0 + strokeInset;
          let rectBottom = y1 - strokeInset;
          if(rectBottom < rectY){
            const midY = (y0 + y1) / 2;
            rectY = midY;
            rectBottom = midY;
          }
          const rectH = Math.max(0, rectBottom - rectY);
          const barAttrsH = {
            x: rectX,
            y: rectY,
            width: rectW,
            height: rectH,
            fill: fillColor,
            stroke: borderColor,
            'stroke-width': strokeWidthEffectiveH,
            'data-trace': i,
            'data-color-index': colorInfoH.colorIndex,
            'data-box-shape': 'body'
          };
          if(opacityOverride != null){
            barAttrsH['fill-opacity'] = opacityOverride;
            barAttrsH['stroke-opacity'] = opacityOverride;
          }
          const barRectH = add('rect', barAttrsH);
          attachBoxShapeHandler(barRectH);
          console.debug('Debug: box bar horizontal bounds adjusted',{ index: i, rawLeft, rawRight, rectX, rectRight, strokeInset, rectY, rectBottom });
          {
            let maxVisualValue = Math.max(barStartValue, barEndValue);
            if(hasSpread){
              if(isStackedLayout){
                const errorExtents = computeStackedErrorExtents(barStartValue, mean, sd, errorMode);
                if(errorExtents && Number.isFinite(errorExtents.highValue)){
                  maxVisualValue = Math.max(maxVisualValue, errorExtents.highValue);
                }
              }else{
                maxVisualValue = Math.max(maxVisualValue, mean + sd);
              }
            }
            annotationMaxByTrace[i] = maxVisualValue;
          }
          if(hasSpread){
            const cap = Math.max(6, boxH * 0.4);
            if(isStackedLayout){
              const errorExtents = computeStackedErrorExtents(barStartValue, mean, sd, errorMode);
              if(errorExtents){
                const xHigh = valueToX(errorExtents.highValue);
                const xLowValue = errorMode === 'both' ? errorExtents.lowValue : errorExtents.segmentEnd;
                const xLow = valueToX(xLowValue);
                stackedErrorQueue.push({
                  cy,
                  xHigh,
                  xLow,
                  cap,
                  borderColor,
                  showLowerCap: errorMode === 'both'
                });
              }
            }else{
              const xSdPos = valueToX(mean + sd);
              if(errorMode === 'both'){
              const xSdNeg = valueToX(mean - sd);
                add('line',{ x1: xSdNeg, y1: cy, x2: xSdPos, y2: cy, stroke: borderColor, 'stroke-width': strokeWidthEffectiveH != null ? strokeWidthEffectiveH : errorBarWidthPx, 'data-trace': i, 'data-color-index': colorInfoH.colorIndex, 'data-box-shape': 'body', ...(opacityOverride != null ? { 'stroke-opacity': opacityOverride } : {}) });
                add('line',{ x1: xSdNeg, y1: cy - cap / 2, x2: xSdNeg, y2: cy + cap / 2, stroke: borderColor, 'stroke-width': strokeWidthEffectiveH != null ? strokeWidthEffectiveH : errorBarWidthPx, 'data-trace': i, 'data-color-index': colorInfoH.colorIndex, 'data-box-shape': 'body', ...(opacityOverride != null ? { 'stroke-opacity': opacityOverride } : {}) });
              }else{
                add('line',{ x1: xMean, y1: cy, x2: xSdPos, y2: cy, stroke: borderColor, 'stroke-width': strokeWidthEffectiveH != null ? strokeWidthEffectiveH : errorBarWidthPx, 'data-trace': i, 'data-color-index': colorInfoH.colorIndex, 'data-box-shape': 'body', ...(opacityOverride != null ? { 'stroke-opacity': opacityOverride } : {}) });
              }
              add('line',{ x1: xSdPos, y1: cy - cap / 2, x2: xSdPos, y2: cy + cap / 2, stroke: borderColor, 'stroke-width': strokeWidthEffectiveH != null ? strokeWidthEffectiveH : errorBarWidthPx, 'data-trace': i, 'data-color-index': colorInfoH.colorIndex, 'data-box-shape': 'body', ...(opacityOverride != null ? { 'stroke-opacity': opacityOverride } : {}) });
            }
          }else{
            console.debug('Debug: box horizontal bar error bar skipped for single value',{ index: i, sampleCount: sampleCountBar, mean });
          }
        }else if(graphTypeRaw === 'violin'){
          const densitySource = summary.sortedValues || valueList.slice().sort((a, b) => a - b);
          const densityInfo = computeDensity(densitySource, yScale.min, yScale.max, violinState.sampleCount);
          const violinMaxValue = densityInfo.positions.length
            ? densityInfo.positions[densityInfo.positions.length - 1]
            : summary.max;
          annotationMaxByTrace[i] = Math.max(wMax, violinMaxValue);
          const peak = densityInfo.densities.length ? densityInfo.densities.reduce((max, d) => (d > max ? d : max), 0) : 1;
          const halfHeight = Math.max(6, Math.min(80, localBand * 0.45));
          violinPointBounds = createViolinBoundLookup(densityInfo, halfHeight, peak) || (() => halfHeight);
          const pathParts = [];
          for(let idx = 0; idx < densityInfo.positions.length; idx++){
            const pos = densityInfo.positions[idx];
            const density = peak ? densityInfo.densities[idx] / peak : 0;
            const x = valueToX(pos);
            const offset = density * halfHeight;
            const yTop = cy - offset;
            pathParts.push(`${idx === 0 ? 'M' : 'L'} ${x} ${yTop}`);
          }
          for(let idx = densityInfo.positions.length - 1; idx >= 0; idx--){
            const pos = densityInfo.positions[idx];
            const density = peak ? densityInfo.densities[idx] / peak : 0;
            const x = valueToX(pos);
            const offset = density * halfHeight;
            const yBottom = cy + offset;
            pathParts.push(`L ${x} ${yBottom}`);
          }
          pathParts.push('Z');
          const violinAttrsH = { d: pathParts.join(' '), fill: fillColor, 'fill-opacity': opacityOverride != null ? opacityOverride : 0.7, stroke: borderColor, 'stroke-width': strokeOverride, 'data-trace': i, 'data-color-index': colorInfoH.colorIndex, 'data-box-shape': 'body' };
          if(opacityOverride != null){ violinAttrsH['stroke-opacity'] = opacityOverride; }
          const violinPathH = add('path', violinAttrsH);
          attachBoxShapeHandler(violinPathH);
          const insetBoxHeight = Math.max(3, Math.min(halfHeight * 0.175, boxH * 0.1));
          const insetStrokeWidth = Math.max(0.6, (strokeOverride || borderWidthPx || 1) * 0.6);
          const whiskerStrokeWidth = Math.max(0.6, (strokeOverride != null ? strokeOverride : (errorBarWidthPx || insetStrokeWidth)));
          const insetY0 = cy - insetBoxHeight / 2;
          const insetY1 = insetY0 + insetBoxHeight;
          const insetLeft = Math.min(xQ1, xQ3);
          const insetWidth = Math.max(1, Math.abs(xQ3 - xQ1));
          const violinWhiskerH = add('line',{ x1: xWMin, y1: cy, x2: xWMax, y2: cy, stroke: borderColor, 'stroke-width': whiskerStrokeWidth, 'data-trace': i, 'data-color-index': colorInfoH.colorIndex, 'data-box-shape': 'body', ...(opacityOverride != null ? { 'stroke-opacity': opacityOverride } : {}) });
          attachBoxShapeHandler(violinWhiskerH);
          const violinRectH = add('rect',{ x: insetLeft, y: insetY0, width: insetWidth, height: insetBoxHeight, fill: '#fff', stroke: borderColor, 'stroke-width': insetStrokeWidth, 'data-trace': i, 'data-color-index': colorInfoH.colorIndex, 'data-box-shape': 'body', ...(opacityOverride != null ? { 'stroke-opacity': opacityOverride } : {}) });
          attachBoxShapeHandler(violinRectH);
          const violinMedianH = add('line',{ x1: xMed, y1: insetY0, x2: xMed, y2: insetY1, stroke: borderColor, 'stroke-width': insetStrokeWidth, 'data-trace': i, 'data-color-index': colorInfoH.colorIndex, 'data-box-shape': 'body', ...(opacityOverride != null ? { 'stroke-opacity': opacityOverride } : {}) });
          attachBoxShapeHandler(violinMedianH);
          if(debugEnabled){
            console.debug('Debug: box violin horizontal render',{ index: i, points: sampleCount, peak, halfHeight, insetBoxHeight });
          }
        }else if(graphTypeRaw === 'strip'){
          annotationMaxByTrace[i] = summary.max;
          const swarmResult = renderSwarmPointsHorizontal({
            valueList,
            cy,
            localBand,
            sampleCount,
            traceIndex: i,
            tooltipSeriesName,
            tooltipCategoryName,
            tooltipGroupName,
            fillColor,
            borderColor,
            groupAttrs: { 'data-individual': 'true' },
            opacityMultiplier: 1,
            debugLabel: 'individual',
            mean,
            widthScaleMode: 'density'
          });
          if(individualSummaryMode !== 'none'){
            const swarm = swarmResult?.swarm;
            const summaryRadius = swarmResult?.effectiveRadius != null
              ? swarmResult.effectiveRadius
              : (swarm && Number.isFinite(Number(swarm.adjustedRadius)) ? swarm.adjustedRadius : pointRadius);
            const summaryGroup = add('g',{ 'data-trace': i, 'data-summary': individualSummaryMode });
            summaryGroup.dataset.boxSummary = '1';
            summaryGroup.style.cursor = 'pointer';
            summaryGroup.addEventListener('click', handleBoxSummaryClick);
            const summaryCap = Math.max(6, localBand * 0.12);
            const summaryStyle = getSummaryStyle(i);
            const summaryColor = (summaryStyle && summaryStyle.color) ? summaryStyle.color : borderColor;
            const summaryOpacityRaw = summaryStyle ? clampSummaryOpacity(summaryStyle.opacity) : null;
            const summaryOpacity = summaryOpacityRaw == null ? 1 : summaryOpacityRaw;
            const summaryThicknessRaw = summaryStyle && Number.isFinite(Number(summaryStyle.thickness)) ? Number(summaryStyle.thickness) : null;
            const baseStroke = Math.max(errorBarWidthPx || 0, borderWidthPx || 0.8, 0.8);
            const summaryStrokeWidth = Math.max(0.2, summaryThicknessRaw != null ? summaryThicknessRaw : baseStroke * 1.5);
            const summaryIntervalWidth = Math.max(0.2, summaryThicknessRaw != null ? summaryThicknessRaw : (errorBarWidthPx || borderWidthPx || summaryStrokeWidth));
            const summaryStrokeAttrs = width => {
              const attrs = {
                stroke: summaryColor,
                'stroke-width': Math.max(0.2, Number.isFinite(width) ? width : summaryStrokeWidth),
                'data-summary-line': '1'
              };
              if(summaryOpacity !== 1){
                attrs['stroke-opacity'] = summaryOpacity;
              }
              return attrs;
            };
            const summaryAdd = (tag, attrs) => {
              const node = document.createElementNS(NS, tag);
              for(const [key, value] of Object.entries(attrs)){
                node.setAttribute(key, String(value));
              }
              summaryGroup.appendChild(node);
              return node;
            };
            const summaryOps = {
              drawInterval: (low, high, opts = {}) => {
                if(!Number.isFinite(low) || !Number.isFinite(high)){
                  return false;
                }
                let start = low;
                let end = high;
                if(end < start){
                  [start, end] = [end, start];
                }
                const xStart = valueToX(start);
                const xEnd = valueToX(end);
                summaryAdd('line',{ x1: xStart, y1: cy, x2: xEnd, y2: cy, ...summaryStrokeAttrs(summaryIntervalWidth) });
                const capsEnabled = opts.caps !== false;
                const capSize = opts.capSize ?? summaryCap;
                if(capsEnabled && capSize > 0){
                  summaryAdd('line',{ x1: xStart, y1: cy - capSize / 2, x2: xStart, y2: cy + capSize / 2, ...summaryStrokeAttrs(summaryIntervalWidth) });
                  summaryAdd('line',{ x1: xEnd, y1: cy - capSize / 2, x2: xEnd, y2: cy + capSize / 2, ...summaryStrokeAttrs(summaryIntervalWidth) });
                }
                return true;
              },
              drawPoint: (value, radiusMultiplier = 1.4) => {
                if(!Number.isFinite(value)){
                  return false;
                }
                const xVal = valueToX(value);
                const halfWidth = Math.max(summaryCap, (summaryRadius || pointRadius) * radiusMultiplier, 4);
                summaryAdd('line',{ x1: xVal - halfWidth, y1: cy, x2: xVal + halfWidth, y2: cy, ...summaryStrokeAttrs(summaryStrokeWidth) });
                return true;
              },
              drawMedianLine: value => {
                if(!Number.isFinite(value)){
                  return false;
                }
                const xMid = valueToX(value);
                const cap = Math.max(summaryCap, 4);
                summaryAdd('line',{ x1: xMid, y1: cy - cap, x2: xMid, y2: cy + cap, ...summaryStrokeAttrs(summaryStrokeWidth) });
                return true;
              },
              debug: debugEnabled
            };
            applyIndividualSummaryOverlay(individualSummaryMode, summary, valueList, summaryOps);
          }
        }

        if(pointMode !== 'none' && graphTypeRaw !== 'strip'){
          console.time(`boxplotPoints_${token}_${i}`);
          if(pointMode === 'outliers'){
            const frag = document.createDocumentFragment();
            let ptIdx = 0;
            for(const v of outliers){
              const c = document.createElementNS(NS, 'circle');
              c.setAttribute('cx', valueToX(v));
              c.setAttribute('cy', cy);
              c.setAttribute('r', pointRadius);
              c.setAttribute('fill', fillColor);
              c.setAttribute('stroke', borderColor);
              annotateWithTitle(c, outlierAnnotation);
              attachBoxPointTooltip(c, {
                seriesName: tooltipSeriesName,
                categoryName: tooltipCategoryName,
                groupName: tooltipGroupName,
                value: v,
                rawValue: v,
                index: ptIdx
              });
              frag.appendChild(c);
              ptIdx++;
              if(ptIdx % 10000 === 0 && Shared.isDebugEnabled?.()){
                console.debug('boxplot outlier progress',{ component: 'box', index: i, ptIdx, token, orientation: 'horizontal' });
              }
            }
            add('g',{ 'data-trace': i, 'data-export-layer': 'box-points' }).appendChild(frag);
          }else if(graphTypeRaw === 'violin' && pointMode === 'overlay'){
            renderSwarmPointsHorizontal({
              valueList,
              cy,
              localBand,
              sampleCount,
              traceIndex: i,
              tooltipSeriesName,
              tooltipCategoryName,
              tooltipGroupName,
              fillColor,
              borderColor,
              violinBounds: violinPointBounds,
              groupAttrs: { 'data-individual': 'true' },
              opacityMultiplier: 0.6,
              debugLabel: 'violin-overlay',
              mean
            });
          }else{
            const overlayMode = pointMode === 'overlay';
            const centerY = overlayMode ? cy : (y0 - boxH * 0.3);
            const halfHeight = overlayMode
              ? Math.max(pointRadius * 1.1, boxH * 0.3)
              : Math.max(pointRadius * 1.1, boxH * 0.1);
            renderSwarmPointsHorizontal({
              valueList,
              cy: centerY,
              localBand,
              sampleCount,
              traceIndex: i,
              tooltipSeriesName,
              tooltipCategoryName,
              tooltipGroupName,
              fillColor,
              borderColor,
              groupAttrs: { 'data-individual': 'true' },
              opacityMultiplier: overlayMode ? 0.6 : 1,
              debugLabel: overlayMode ? 'overlay' : 'side',
              mean,
              maxHalfWidth: halfHeight
            });
          }
          console.timeEnd(`boxplotPoints_${token}_${i}`);
        }
      }
      if(isStackedLayout && stackedErrorQueue.length){
        stackedErrorQueue.forEach(item => {
          add('line',{ x1: item.xLow, y1: item.cy, x2: item.xHigh, y2: item.cy, stroke: item.borderColor, 'stroke-width': errorBarWidthPx });
          add('line',{ x1: item.xHigh, y1: item.cy - item.cap / 2, x2: item.xHigh, y2: item.cy + item.cap / 2, stroke: item.borderColor, 'stroke-width': errorBarWidthPx });
          if(item.showLowerCap){
            add('line',{ x1: item.xLow, y1: item.cy - item.cap / 2, x2: item.xLow, y2: item.cy + item.cap / 2, stroke: item.borderColor, 'stroke-width': errorBarWidthPx });
          }
        });
        console.debug('Debug: box stacked error overlay',{ count: stackedErrorQueue.length, orientation: 'horizontal' });
      }
      const traceCenter = idx => {
        const trace = traces[idx];
        if(trace){
          return categoryCenter(trace, idx);
        }
        if(separatedSpacing && idx >= 0 && idx < separatedSpacing.centers.length){
          return separatedSpacing.centers[idx];
        }
        return marginLocal.top + (idx + 0.5) * bandH;
      };
      return {
        margin: marginLocal,
        plotW: plotWLocal,
        plotH: plotHLocal,
        categoryCenter: traceCenter,
        valueToCoord: valueToX,
        annotationMaxByTrace,
        titleX: marginLocal.left + plotWLocal / 2,
        titleY: marginLocal.top / 2
      };
    }

    const orientationResult = isFlipped ? renderHorizontal() : renderVertical();
    if(!orientationResult){
      ensureGraphViewport(svg, { padding: Math.max(fs || 14, 16), debugLabel: 'box-graph' });
      state.layout?.syncPanels?.({ skipSchedule: true });
      syncBoxAutoDrawNoticeWidth('draw');
      return;
    }
    if(token !== state.drawToken){
      console.log('boxplot draw cancelled before finalize',{ token });
      return;
    }
    const defaultTitleX = orientationResult.titleX;
    const defaultTitleY = orientationResult.titleY;
    const titlePos = state.labelPositions?.title;
    const titleText = add('text',{ x: titlePos?.x ?? defaultTitleX, y: titlePos?.y ?? defaultTitleY, 'text-anchor': 'middle', 'font-size': fs, fill: chartStyle.TEXT_COLOR });
    titleText.textContent = state.titleText;
    markFontEditable(titleText,'graphTitle','graphTitle');
    const applyBoxTitle = value => {
      const nextValue = value != null ? String(value) : '';
      state.titleText = nextValue;
      if(titleText.textContent !== nextValue){
        titleText.textContent = nextValue;
      }
      state.scheduleDraw();
    };
    makeEditable(titleText, txt => {
      const previous = state.titleText != null ? String(state.titleText) : '';
      const nextValue = txt != null ? String(txt) : '';
      if(previous === nextValue){
        return;
      }
      applyBoxTitle(nextValue);
      recordBoxChange('box:title', previous, nextValue, applyBoxTitle);
    });
    // Enable drag for title
    if(typeof Shared.enableLabelDrag === 'function'){
      Shared.enableLabelDrag(titleText, svg, {
        onDragEnd: pos => {
          state.labelPositions.title = { x: pos.x, y: pos.y };
          console.debug('Debug: box title position saved', pos);
        }
      });
    }
    if(showLegend && legendRenderer.entries.length){
      const plotRight = orientationResult.margin.left + orientationResult.plotW;
      const defaultLegendX = plotRight + legendGapPx;
      const defaultLegendY = orientationResult.margin.top;
      const legendPos = state.labelPositions?.legend;
      const legendGroup = legendRenderer.draw(svg, {
        x: legendPos?.x ?? defaultLegendX,
        y: legendPos?.y ?? defaultLegendY
      });
      if(legendGroup && typeof Shared.enableLegendDrag === 'function'){
        Shared.enableLegendDrag(legendGroup, svg, {
          onDragEnd: pos => {
            state.labelPositions = state.labelPositions || {};
            state.labelPositions.legend = { x: pos.x, y: pos.y };
            if(Shared.isDebugEnabled?.()){
              console.debug('Debug: box legend position saved', pos);
            }
          }
        });
      }
      console.debug('Debug: box legend rendered shared helper',{
        legendX: legendPos?.x ?? defaultLegendX,
        legendY: legendPos?.y ?? defaultLegendY,
        legendGapPx,
        entryCount: legendRenderer.entries.length
      });
    }
    const annotationStyleForStats = Number.isFinite(orientationResult.annotationMinY)
      ? { ...annotationStyle, minY: orientationResult.annotationMinY }
      : annotationStyle;
    const helpers = {
      xCenter: orientationResult.categoryCenter,
      categoryCenter: orientationResult.categoryCenter,
      y2px: orientationResult.valueToCoord,
      valueToCoord: orientationResult.valueToCoord,
      annotationMaxByTrace: orientationResult.annotationMaxByTrace,
      annotationStyle: annotationStyleForStats,
      significance: { enabled: showSignificance }
    };
    console.debug('Debug: box annotation style forwarded', { annotationStyle: helpers.annotationStyle, significance: helpers.significance });
    primeStatsComputation(traces, svg, helpers);
    if(!showSignificance){
      const otherBoxes = Array.from(svg.children)
        .filter(el => el !== titleText && el.getBBox)
        .map(el => el.getBBox());
      if(otherBoxes.length){
        const topMost = Math.min(...otherBoxes.map(b => b.y));
        const spacing = fs + 4;
        const newY = Math.max(spacing, topMost - spacing);
        titleText.setAttribute('y', newY);
      }
    }
    ensureGraphViewport(svg, { padding: Math.max(fs || 14, 16), debugLabel: 'box-graph' });
    state.layout?.syncPanels?.({ skipSchedule: true });
    syncBoxAutoDrawNoticeWidth('draw');
    console.log('boxplot render complete');
  }
  // PART: SAVE_OPEN
  function getPayload(){
    const selectedColumns = Array.from(state.selectedCols || [])
      .map(idx => Number(idx))
      .filter(idx => Number.isInteger(idx));
    selectedColumns.sort((a,b)=>a-b);
    const axisSnapshot = ensureAxisSettings();
    const violinState = ensureViolinState();
    ensureWhiskerState();
    const significanceStyle = ensureSignificanceStyle();
    const payload = {
      type:'box',
      version:4,
      data: state.hot.getData(),
      exclusions: state.hot?.exportExclusions?.() || Shared.hot.exportExclusions(state.hot),
      config: {
        title:state.titleText,
        yLabel:state.yLabelText,
        colorMode:els.boxColorUnified.checked?'unified':'individual',
        fill:els.boxFill.value,
        border:els.boxBorder.value,
        borderWidth:els.boxBorderWidth.value,
        errorBarWidth:els.boxErrorBarWidth?.value ?? els.boxBorderWidth.value,
        fontSize:els.boxFontSize.value,
        fontStyles: (exportFontStyles('box') || undefined),
        showGrid:els.boxShowGrid.checked,
        showFrame:!!els.boxShowFrame?.checked,
        showLegend:els.boxShowLegend ? !!els.boxShowLegend.checked : true,
        logScale:els.boxLogScale.checked,
        logPlusOne:!!state.logPlusOne,
        graphType:els.boxGraphType.value,
        groupLayout: state.groupLayout,
        individualSummary: state.individualSummary,
        pointMode:els.boxPointMode.value,
        showCaps:els.boxShowCaps.checked,
        showSignificanceBars: state.showSignificanceBars,
	        significance: {
	          thickness: significanceStyle.thickness,
	          color: significanceStyle.color,
	          showWhiskers: significanceStyle.showWhiskers,
	          whiskerMode: significanceStyle.whiskerMode
	        },
        errorMode:els.boxErrorMode.value,
        colors:[...state.fillColors],
        borderColors:[...state.borderColors],
        shapeStyles: state.traceShapeStyles || null,
        shapeGlobalStyle: state.traceShapeGlobalStyle || null,
        pointStyles: state.pointStyles || null,
        pointGlobalStyle: state.pointGlobalStyle || null,
        summaryStyles: state.summaryStyles || null,
        summaryGlobalStyle: state.summaryGlobalStyle || null,
        yMin:els.boxYMin.value,
        yMax:els.boxYMax.value,
        flipAxes: state.flipAxes,
        tableFormat: state.tableFormat,
        grouped: {
          replicatesPerGroup: state.grouped?.replicatesPerGroup,
          groups: Array.isArray(state.grouped?.groups) ? [...state.grouped.groups] : []
        },
        whisker: {
          rule: state.whiskerRule,
          customMultiplier: state.whiskerCustomMultiplier
        },
        violin: {
          autoBandwidth: violinState.autoBandwidth !== false,
          bandwidth: violinState.autoBandwidth === false && Number.isFinite(violinState.bandwidth) && violinState.bandwidth > 0
            ? violinState.bandwidth
            : null,
          sampleCount: violinState.sampleCount
        },
        axis: {
          strokeWidth: axisSnapshot.strokeWidth,
          color: axisSnapshot.color,
          tickInterval: {
            x: axisSnapshot.x?.tickInterval ?? null,
            y: axisSnapshot.y?.tickInterval ?? null
          },
          minorTicks: {
            x: axisSnapshot.x?.minorTicks ?? false,
            y: axisSnapshot.y?.minorTicks ?? false
          },
          minorTickSubdivisions: {
            x: clampMinorTickSubdivisions(axisSnapshot.x?.minorTickSubdivisions),
            y: clampMinorTickSubdivisions(axisSnapshot.y?.minorTickSubdivisions)
          },
          notation: {
            x: axisSnapshot.x?.notation ?? 'auto',
            y: axisSnapshot.y?.notation ?? 'auto'
          },
          brokenAxis: {
            y: {
              enabled: axisSnapshot.y?.brokenAxis?.enabled ?? false,
              segments: axisSnapshot.y?.brokenAxis?.segments ?? []
            }
          }
        },
        stats: {
          test: state.statsTest,
          paired: state.statsPaired,
          mode: state.statsMode,
          referenceIndex: state.statsRef,
          pairsText: state.statsPairsText,
          postHoc: state.statsPostHoc,
          correction: state.statsCorrection,
          effectParametric: state.statsEffectParametric,
          effectNonParametric: state.statsEffectNonParametric,
          parametricVariant: state.statsParametricVariant,
          groupedAnalysis: state.groupedStats?.analysis,
          selectedColumns,
          assumptions: serializeAssumptions(state.assumptionDiagnostics),
          // Persist last computed statistics output so each tab can restore its results
          resultsHtml: (els.statsResults && typeof els.statsResults.innerHTML === 'string') ? els.statsResults.innerHTML : null,
          lastRunVersion: Number.isFinite(Number(state.statsLastRunVersion)) ? Number(state.statsLastRunVersion) : 0,
          contextSignature: state.statsContextSignature || null
        },
        labelPositions: state.labelPositions || null
      }
    };
    console.debug('Debug: box.getPayload captured state', {
      rows: payload.data?.length || 0,
      cols: payload.data?.[0]?.length || 0,
      colorMode: payload.config.colorMode,
      statsTest: payload.config.stats?.test,
      statsMode: payload.config.stats?.mode,
      statsPostHoc: payload.config.stats?.postHoc,
      statsCorrection: payload.config.stats?.correction,
      effectParametric: payload.config.stats?.effectParametric,
      effectNonParametric: payload.config.stats?.effectNonParametric,
      parametricVariant: payload.config.stats?.parametricVariant,
      statsSelection: payload.config.stats?.selectedColumns?.length || 0,
      assumptionWarnings: payload.config.stats?.assumptions?.warnings?.length || 0,
      violinAuto: payload.config.violin?.autoBandwidth,
      violinBandwidth: payload.config.violin?.bandwidth,
      violinSamples: payload.config.violin?.sampleCount,
      whiskerRule: payload.config.whisker?.rule,
      whiskerMultiplier: payload.config.whisker?.customMultiplier
    });
    return payload;
  }
  box.getPayload = getPayload;
  box.createEmptyPayload = function createEmptyBoxPayload(){
    box.ensure();
    ensureEmptyPayloadTemplate();
    const payload = cloneSimple(emptyPayloadTemplate) || { type: 'box', config: {} };
    payload.type = 'box';
    const createEmpty = Shared.createEmptyData;
    const emptyData = typeof createEmpty === 'function'
      ? createEmpty(DEFAULT_ROWS, DEFAULT_COLS)
      : Array.from({ length: DEFAULT_ROWS }, () => Array(DEFAULT_COLS).fill(''));
    payload.data = emptyData;
    payload.exclusions = [];
    if(payload.config){
      payload.config.stats = payload.config.stats || {};
      payload.config.stats.selectedColumns = [];
      payload.config.stats.pairsText = '';
    }
    return payload;
  };
  box.save = async function(){
    console.debug('Debug: box.save invoked', { hasHandle: !!state.fileHandle });
    if(!fileIO || typeof fileIO.saveGraphFile !== 'function'){
      console.error('box.save missing fileIO.saveGraphFile');
      return;
    }
    const result = await fileIO.saveGraphFile({
      context: 'box',
      fileHandle: state.fileHandle,
      getPayload,
      fileName: state.fileName,
      downloadFileName: state.fileName,
      setFileHandle: handle => { state.fileHandle = handle; },
      setFileName: name => { state.fileName = name; }
    });
    console.debug('Debug: box.save result', result);
  };
  box.saveAs = async function(){
    console.debug('Debug: box.saveAs invoked', { currentName: state.fileName });
    if(!fileIO || typeof fileIO.saveGraphFileAs !== 'function'){
      console.error('box.saveAs missing fileIO.saveGraphFileAs');
      return;
    }
    const result = await fileIO.saveGraphFileAs({
      context: 'box',
      getPayload,
      fileName: state.fileName,
      downloadFileName: state.fileName,
      setFileHandle: handle => { state.fileHandle = handle; },
      setFileName: name => { state.fileName = name; }
    });
    console.debug('Debug: box.saveAs result', result);
  };
  box.open = async function(){
    console.debug('Debug: box.open invoked');
    if(!fileIO || typeof fileIO.openGraphFile !== 'function'){
      console.error('box.open missing fileIO.openGraphFile');
      return;
    }
    const result = await fileIO.openGraphFile({
      context: 'box',
      setFileHandle: handle => { state.fileHandle = handle; },
      setFileName: name => { state.fileName = name; },
      loadFromFile: file => box.loadFromFile(file),
      triggerInput: () => {
        const input = global.document.getElementById('boxGraphFile');
        if(input){
          input.value='';
          input.click();
        }
      }
    });
    console.debug('Debug: box.open result', result);
  };
  function applyBoxPayload(obj, meta = {}){
    const overlayReason = meta?.overlayReason || (typeof meta?.source === 'string' ? `payload-${meta.source}` : 'payload');
    const overlayMessage = meta?.overlayMessage || (meta?.source === 'file' ? 'Loading saved box graph...' : 'Loading box data...');
    const overlayEnabled = meta?.flagOverlay === true;
    if(overlayEnabled){
      forceBoxOverlay(overlayReason, { message: overlayMessage });
    }
    let overlaySettled = false;
    const resolveOverlay = reason => {
      if(overlayEnabled && !overlaySettled){
        overlaySettled = true;
        resolveBoxLoading(reason || `${overlayReason}-done`);
      }
    };
    if(overlayEnabled){
      markBoxOverlayPending(overlayReason);
    }
    if(!obj || typeof obj !== 'object'){
      resolveOverlay('payload-invalid');
      console.error('box payload missing or invalid', { meta });
      return false;
    }
    if(obj.type && obj.type!=='box'){
      resolveOverlay('payload-invalid-type');
      console.error('Invalid graph type for box payload', { type: obj.type, meta });
      return false;
    }
    try{
    const version=Number.isFinite(obj?.version)?Number(obj.version):Number(obj?.version)||Number(obj?.configVersion)||1;
    console.debug('Debug: box.applyPayload version parse',{ version, hasStats:!!obj?.config?.stats, hasEffectOptions:!!obj?.config?.stats?.effectParametric });
    state.hot.loadData(obj.data||[]);
    if(obj.exclusions){
      state.hot.applyExclusions?.(obj.exclusions);
    }
    const c=obj.config||{};
    importFontStyles('box', c.fontStyles || null);
    state.titleText=c.title||state.titleText;
    state.yLabelText=c.yLabel||state.yLabelText;
    els.boxFill.value=c.fill||els.boxFill.value;
    els.boxBorder.value=c.border||els.boxBorder.value;
    els.boxBorderWidth.value=c.borderWidth||els.boxBorderWidth.value;
    if(els.boxErrorBarWidth){
      if(c.errorBarWidth != null){
        els.boxErrorBarWidth.value = c.errorBarWidth;
      }else if(!els.boxErrorBarWidth.value){
        els.boxErrorBarWidth.value = els.boxBorderWidth.value;
      }
    }
    els.boxFontSize.value=c.fontSize||els.boxFontSize.value;
    if(els.boxFontSize.dataset){
      els.boxFontSize.dataset.fontBasePt = String(els.boxFontSize.value);
      console.debug('Debug: box font size base restored',{ value: els.boxFontSize.value });
    }
    chartStyle.renderFontSizeLabel({ element: els.boxFontSizeVal, pt: Number(els.boxFontSize.value), input: els.boxFontSize, manual: true });
    els.boxShowGrid.checked=!!c.showGrid;
    if(els.boxShowFrame) els.boxShowFrame.checked=!!c.showFrame;
    if(els.boxShowLegend) els.boxShowLegend.checked=c.showLegend !== false;
    els.boxLogScale.checked=!!c.logScale;
    state.logPlusOne=!!c.logPlusOne;
    els.boxGraphType.value=c.graphType||els.boxGraphType.value;
    const violinConfig = c.violin || {};
    const violinState = ensureViolinState();
    violinState.autoBandwidth = violinConfig.autoBandwidth === false ? false : true;
    if(violinState.autoBandwidth){
      violinState.bandwidth = null;
    }else{
      const manualCandidate = Number(violinConfig.bandwidth);
      violinState.bandwidth = Number.isFinite(manualCandidate) && manualCandidate > 0 ? manualCandidate : null;
    }
    const restoredSamples = clampViolinSampleCount(violinConfig.sampleCount ?? violinState.sampleCount);
    violinState.sampleCount = restoredSamples;
    violinState.lastSampleCount = restoredSamples;
    violinState.lastUsedBandwidth = violinState.bandwidth && violinState.bandwidth > 0 ? violinState.bandwidth : null;
    syncViolinControlsFromState();
    if(typeof els.updateGraphTypeControls === 'function'){
      els.updateGraphTypeControls();
    }
    if(typeof c.groupLayout === 'string'){
      const allowedLayouts = new Set(['interleaved','separated','stacked']);
      const requestedLayout = allowedLayouts.has(c.groupLayout) ? c.groupLayout : 'interleaved';
      state.groupLayout = requestedLayout;
    }else if(typeof state.groupLayout !== 'string'){
      state.groupLayout = 'interleaved';
    }
    if(els.boxLayoutMode){
      let uiLayout = state.groupLayout;
      if(uiLayout === 'stacked' && els.boxGraphType.value !== 'bar'){
        uiLayout = 'interleaved';
        state.groupLayout = uiLayout;
      }
      const allowedLayouts = new Set(['interleaved','separated','stacked']);
      if(!allowedLayouts.has(uiLayout)){
        uiLayout = 'interleaved';
        state.groupLayout = uiLayout;
      }
      els.boxLayoutMode.value = uiLayout;
      Array.from(els.boxLayoutMode.options || []).forEach(option => {
        if(option.value === 'stacked'){
          option.disabled = els.boxGraphType.value !== 'bar';
        }
      });
    }
    const restoredSummary = typeof c.individualSummary === 'string'
      ? normalizeIndividualSummaryValue(c.individualSummary)
      : normalizeIndividualSummaryValue(state.individualSummary);
    state.individualSummary = restoredSummary;
    if(els.boxIndividualSummary){
      if(!els.boxIndividualSummary.options?.length){
        populateIndividualSummarySelect(els.boxIndividualSummary);
      }
      els.boxIndividualSummary.value = restoredSummary;
    }
    els.boxPointMode.value=c.pointMode||els.boxPointMode.value;
    els.boxShowCaps.checked=!!c.showCaps;
    state.showSignificanceBars = !!c.showSignificanceBars;
    if(els.boxShowSignificance){
      els.boxShowSignificance.checked = state.showSignificanceBars;
    }
    const significanceConfig = c.significance && typeof c.significance === 'object' ? c.significance : null;
    const significanceStyle = ensureSignificanceStyle();
	    if(significanceConfig){
	      const thicknessValue = Number(significanceConfig.thickness);
	      significanceStyle.thickness = Number.isFinite(thicknessValue) && thicknessValue > 0
	        ? thicknessValue
	        : DEFAULT_SIGNIFICANCE_THICKNESS;
	      significanceStyle.color = typeof significanceConfig.color === 'string' && significanceConfig.color.trim()
	        ? significanceConfig.color.trim()
	        : DEFAULT_SIGNIFICANCE_COLOR;
	      significanceStyle.showWhiskers = significanceConfig.showWhiskers !== false;
	      significanceStyle.whiskerMode = normalizeSignificanceWhiskerMode(significanceConfig.whiskerMode);
	    }else{
	      significanceStyle.thickness = DEFAULT_SIGNIFICANCE_THICKNESS;
	      significanceStyle.color = DEFAULT_SIGNIFICANCE_COLOR;
	      significanceStyle.showWhiskers = DEFAULT_SIGNIFICANCE_WHISKERS;
	      significanceStyle.whiskerMode = DEFAULT_SIGNIFICANCE_WHISKER_MODE;
	    }
    state.significanceStyle = significanceStyle;
	    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
	      console.debug('Debug: box significance style restored', {
	        thickness: significanceStyle.thickness,
	        color: significanceStyle.color,
	        showWhiskers: significanceStyle.showWhiskers,
	        whiskerMode: significanceStyle.whiskerMode
	      });
	    }
    els.boxErrorMode.value=c.errorMode||els.boxErrorMode.value;
    if(c.whisker){
      if(c.whisker.customMultiplier != null){
        state.whiskerCustomMultiplier = clampWhiskerMultiplier(c.whisker.customMultiplier);
      }
      const metaWhisker = ensureWhiskerState(c.whisker.rule);
      state.whiskerRule = metaWhisker.key;
    }else{
      ensureWhiskerState();
    }
    syncWhiskerControlsFromState();
    if(typeof Shared.isDebugEnabled==='function' && Shared.isDebugEnabled()){
      console.debug('Debug: box whisker config restored',{ rule: state.whiskerRule, multiplier: state.whiskerCustomMultiplier });
    }
    const graphTypeValue = els.boxGraphType.value;
    if(els.boxErrorModeCtl){
      els.boxErrorModeCtl.style.display = graphTypeValue==='bar'?'':'none';
    }
    if(els.boxErrorBarWidthCtl){
      const showErrorThickness = graphTypeValue==='bar' || graphTypeValue==='strip' || graphTypeValue==='box' || graphTypeValue==='notched';
      els.boxErrorBarWidthCtl.style.display = showErrorThickness ? 'inline-flex' : 'none';
    }
    if(els.boxIndividualSummaryCtl){
      els.boxIndividualSummaryCtl.style.display = graphTypeValue==='strip' ? '' : 'none';
    }
    state.fillColors=c.colors||[];
    state.borderColors=c.borderColors||[];
    state.traceShapeStyles = cloneSimple(c.shapeStyles) || {};
    state.traceShapeGlobalStyle = cloneSimple(c.shapeGlobalStyle) || null;
    state.pointStyles = cloneSimple(c.pointStyles) || {};
    state.pointGlobalStyle = cloneSimple(c.pointGlobalStyle) || null;
    state.summaryStyles = cloneSimple(c.summaryStyles) || {};
    state.summaryGlobalStyle = cloneSimple(c.summaryGlobalStyle) || null;
    if(c.colorMode==='individual'){ els.boxColorIndividual.checked=true; } else { els.boxColorUnified.checked=true; }
    toggleColorMode();
    const restoredFormat = c.tableFormat === 'grouped' ? 'grouped' : 'single';
    if(c.grouped && typeof c.grouped === 'object'){
      const groupCfg = c.grouped;
      const repValue = Number(groupCfg.replicatesPerGroup);
      if(Number.isFinite(repValue) && repValue >= 1){
        state.grouped.replicatesPerGroup = Math.round(repValue);
      }
      if(Array.isArray(groupCfg.groups) && groupCfg.groups.length){
        state.grouped.groups = groupCfg.groups.map((name, idx)=>{
          const trimmed = typeof name === 'string' ? name.trim() : '';
          return trimmed || `Group ${idx + 1}`;
        });
      }
    }
    setTableFormat(restoredFormat, { skipColorSwitch: true, skipDraw: true });
    els.boxYMin.value=c.yMin||'';
    els.boxYMax.value=c.yMax||'';
    state.flipAxes=!!c.flipAxes;
    if(els.boxFlipAxes){ els.boxFlipAxes.checked=state.flipAxes; }
    if(c.axis && typeof c.axis === 'object'){
      const axisCfg = c.axis;
      const axisState = ensureAxisSettings();
      if(axisCfg.strokeWidth !== undefined){
        const numeric = Number(axisCfg.strokeWidth);
        axisState.strokeWidth = Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
      }
      if(typeof axisCfg.color === 'string' && axisCfg.color.trim()){
        axisState.color = axisCfg.color;
      } else {
        axisState.color = DEFAULT_AXIS_COLOR;
      }
      const tickCfg = axisCfg.tickInterval || {};
      const tickX = tickCfg.x;
      const tickY = tickCfg.y;
      axisState.x.tickInterval = Number.isFinite(Number(tickX)) && Number(tickX) > 0 ? Math.max(1, Math.round(Number(tickX))) : null;
      axisState.y.tickInterval = Number.isFinite(Number(tickY)) && Number(tickY) > 0 ? Number(tickY) : null;
      if(axisCfg.minorTicks){
        axisState.x.minorTicks = !!axisCfg.minorTicks.x;
        axisState.y.minorTicks = !!axisCfg.minorTicks.y;
      }else{
        axisState.x.minorTicks = !!axisState.x.minorTicks;
        axisState.y.minorTicks = !!axisState.y.minorTicks;
      }
      if(axisCfg.minorTickSubdivisions){
        axisState.x.minorTickSubdivisions = clampMinorTickSubdivisions(
          axisCfg.minorTickSubdivisions.x ?? axisCfg.minorTickSubdivisionsX ?? axisCfg.minorSubdivisionsX ?? axisCfg.minorTickSubdivisions
        );
        axisState.y.minorTickSubdivisions = clampMinorTickSubdivisions(
          axisCfg.minorTickSubdivisions.y ?? axisCfg.minorTickSubdivisionsY ?? axisCfg.minorSubdivisionsY ?? axisCfg.minorTickSubdivisions
        );
      }else{
        axisState.x.minorTickSubdivisions = clampMinorTickSubdivisions(axisState.x.minorTickSubdivisions);
        axisState.y.minorTickSubdivisions = clampMinorTickSubdivisions(axisState.y.minorTickSubdivisions);
      }
      
      // Restore notation settings
      if(axisCfg.notation){
        axisState.x.notation = sanitizeBoxAxisNotation(axisCfg.notation.x);
        axisState.y.notation = sanitizeBoxAxisNotation(axisCfg.notation.y);
      }
      
      // Restore broken axis settings
      if(axisCfg.brokenAxis && axisCfg.brokenAxis.y){
        const brokenY = axisCfg.brokenAxis.y;
        axisState.y.brokenAxis = {
          enabled: !!brokenY.enabled,
          segments: Array.isArray(brokenY.segments) ? brokenY.segments.filter(seg => {
            return seg && typeof seg === 'object' && 
                   Number.isFinite(seg.start) && Number.isFinite(seg.end) && 
                   seg.start < seg.end;
          }).map(seg => ({ start: Number(seg.start), end: Number(seg.end) })) : []
        };
      }
      
      console.debug('Debug: box axis settings restored from payload',{
        strokeWidth: axisState.strokeWidth,
        color: axisState.color,
        tickIntervalX: axisState.x.tickInterval,
        tickIntervalY: axisState.y.tickInterval,
        brokenAxisEnabled: axisState.y?.brokenAxis?.enabled,
        segmentCount: axisState.y?.brokenAxis?.segments?.length || 0
      });
    } else {
      state.axisSettings = createDefaultAxisSettings();
      console.debug('Debug: box axis settings reset to default from payload');
    }
    const statsAnalysis = state.hot?.getAnalysisData?.() || Shared.hot.getAnalysisData(state.hot);
    const labels=(statsAnalysis.data?.[0] || []).map(value=>value === null ? '' : value);
    const labelCount=labels.length;
    const statsConfig=c.stats||{};
    state.statsTest=statsConfig.test==='nonparametric'?'nonparametric':'parametric';
    state.statsPaired=!!statsConfig.paired;
    const allowedModes=new Set(['all','reference','custom']);
    state.statsMode=allowedModes.has(statsConfig.mode)?statsConfig.mode:'all';
    state.statsCorrection=ensureValidCorrectionValue(statsConfig.correction || state.statsCorrection);
    state.statsEffectParametric=ensureValidEffectOption('parametric',statsConfig.effectParametric || state.statsEffectParametric);
    state.statsEffectNonParametric=ensureValidEffectOption('nonparametric',statsConfig.effectNonParametric || state.statsEffectNonParametric);
    const variantCandidate=typeof statsConfig.parametricVariant==='string'?statsConfig.parametricVariant:'classic';
    const allowedVariants=new Set(['classic','welch','nonparametric']);
    state.statsParametricVariant=allowedVariants.has(variantCandidate)?variantCandidate:'classic';
    if(state.statsTest!=='parametric'){
      state.statsParametricVariant='nonparametric';
    }
    const candidateRef=Number(statsConfig.referenceIndex);
    const maxIndex=labelCount>0?labelCount-1:-1;
    if(Number.isInteger(candidateRef) && candidateRef>=0 && (maxIndex>=0?candidateRef<=maxIndex:true)){
      state.statsRef=candidateRef;
    }else if(maxIndex>=0 && state.statsRef>maxIndex){
      state.statsRef=maxIndex;
    }else if(!Number.isInteger(state.statsRef) || state.statsRef<0){
      state.statsRef=0;
    }
    if(typeof statsConfig.pairsText==='string'){
      state.statsPairsText=statsConfig.pairsText;
    }else if(typeof state.statsPairsText!=='string'){
      state.statsPairsText='';
    }
    ensureGroupedStatsDefaults();
    const allowedGroupedAnalyses=new Set(['twoWayAnova','twoWayMixed','threeWayAnova','threeWayMixed','rowTTests']);
    if(typeof statsConfig.groupedAnalysis==='string' && allowedGroupedAnalyses.has(statsConfig.groupedAnalysis)){
      state.groupedStats.analysis=statsConfig.groupedAnalysis;
    }else if(!allowedGroupedAnalyses.has(state.groupedStats.analysis)){
      state.groupedStats.analysis='twoWayAnova';
    }
    const selectedFromFile=Array.isArray(statsConfig.selectedColumns)
      ? statsConfig.selectedColumns
          .map(idx=>Number(idx))
          .filter(idx=>Number.isInteger(idx) && idx>=0 && (maxIndex>=0?idx<=maxIndex:true))
      : [];
    state.selectedCols=new Set(selectedFromFile);
    if(state.statsMode==='reference' && !state.selectedCols.has(state.statsRef)){
      state.selectedCols.add(state.statsRef);
    }
    const postHocContextOnLoad={
      mode: state.statsMode,
      test: state.statsTest,
      paired: state.statsPaired,
      groupCount: state.selectedCols.size || labels.filter(l=>l!=null && l!=='').length,
      variant: state.statsParametricVariant,
      varianceConcern: !!statsConfig.assumptions?.varianceConcern
    };
    const restoredPostHoc=ensureValidPostHoc(statsConfig.postHoc || state.statsPostHoc,postHocContextOnLoad);
    if(restoredPostHoc!==state.statsPostHoc){
      console.debug('Debug: box statsPostHoc restored',{ before:state.statsPostHoc, after:restoredPostHoc, context:postHocContextOnLoad });
      state.statsPostHoc=restoredPostHoc;
    }
    state.statsCustomPairs=[];
    if(statsConfig.assumptions){
      const restoredAssumptions={
        ...statsConfig.assumptions,
        groups:Array.isArray(statsConfig.assumptions.groups)
          ? statsConfig.assumptions.groups.map(group=>({ ...group }))
          : [],
        variance:statsConfig.assumptions.variance
          ? { ...statsConfig.assumptions.variance }
          : null,
        warnings:Array.isArray(statsConfig.assumptions.warnings)
          ? statsConfig.assumptions.warnings.slice()
          : []
      };
      state.assumptionDiagnostics=restoredAssumptions;
      console.debug('Debug: box assumption diagnostics restored',{ warningCount: restoredAssumptions.warnings.length });
    }else{
      state.assumptionDiagnostics=null;
      console.debug('Debug: box assumption diagnostics cleared on load');
    }
    console.debug('Debug: box stats config restored', {
      statsTest: state.statsTest,
      statsMode: state.statsMode,
      statsPaired: state.statsPaired,
      statsRef: state.statsRef,
      statsPostHoc: state.statsPostHoc,
      statsCorrection: state.statsCorrection,
      statsEffectParametric: state.statsEffectParametric,
      statsEffectNonParametric: state.statsEffectNonParametric,
      selectedCount: state.selectedCols.size,
      hasPairsText: !!state.statsPairsText
    });
    const colorPickerRestoreLabels = state.tableFormat === 'grouped'
      ? (ensureGroupedDefaults(), state.grouped.groups.map((name, idx)=>{ const trimmed = typeof name === 'string' ? name.trim() : ''; return trimmed || `Group ${idx + 1}`; }))
      : labels;
    console.debug('Debug: box restore color labels',{ tableFormat: state.tableFormat, labelCount: colorPickerRestoreLabels.length });
    if(els.boxColorIndividual.checked){ updateBoxColorPickers(colorPickerRestoreLabels, { grouped: state.tableFormat === 'grouped' }); } else { els.boxColorPerBox.innerHTML=''; }
    ensureBoxLegendControlPlacement();
    // Restore label positions if saved
    if(c.labelPositions){
      state.labelPositions = {
        title: c.labelPositions.title || null,
        xLabel: c.labelPositions.xLabel || null,
        yLabel: c.labelPositions.yLabel || null,
        legend: c.labelPositions.legend || null
      };
    }
    // Restore previously computed statistics results (if present in payload)
    try{
      if(c.stats && typeof c.stats === 'object'){
        const savedHtml = c.stats.resultsHtml;
        const savedVersion = Number.isFinite(Number(c.stats.lastRunVersion)) ? Number(c.stats.lastRunVersion) : 0;
        const savedSig = typeof c.stats.contextSignature === 'string' ? c.stats.contextSignature : null;
        if(els.statsResults && savedHtml != null){
          try{ els.statsResults.innerHTML = savedHtml; }catch(e){ els.statsResults.textContent = String(savedHtml || ''); }
        }
        state.statsLastRunVersion = savedVersion;
        state.statsContextVersion = Number.isFinite(Number(savedVersion)) ? Number(savedVersion) : state.statsContextVersion || 0;
        state.statsContextSignature = savedSig;
        state.statsContext = null;
        state.statsComputationPending = false;
        const hasResults = !!(els.statsResults && els.statsResults.childNodes && els.statsResults.childNodes.length);
        if(state.statsLastRunVersion === state.statsContextVersion && hasResults){
          setStatsStatus('Statistics up to date.');
          updateStatsButtonState({ disabled: false, label: 'Recalculate statistics' });
          updateSignificanceControlState({ statsReady: true });
        }
      }
    }catch(err){
      console.debug('Debug: box restore stats results failed', { err: err?.message || String(err) });
    }
    state.scheduleDraw();
    console.debug('Debug: box payload applied', { source: meta.source || 'unknown', rows: obj.data?.length || 0 });
    return true;
    }catch(err){
      resolveOverlay('payload-error');
      throw err;
    }
  }

  function runBoxDrawCycle(){
    let status = 'complete';
    try{
      draw();
    }catch(err){
      status = 'error';
      throw err;
    }finally{
      resolveBoxLoading(status);
    }
  }

  box.loadFromFile = function(file){
    const reader = new FileReader();
    const readOverlayReason = 'graph-file-read';
    const readOverlayForced = forceBoxOverlay(readOverlayReason, { message: 'Opening saved box graph...' });
    reader.onerror = err => {
      if(readOverlayForced){
        resolveBoxLoading('graph-file-error');
      }
      console.error('loadBoxGraph error', err);
    };
    reader.onload = e => {
      if(readOverlayForced){
        resolveBoxLoading(readOverlayReason);
      }
      try{
        const obj = JSON.parse(e.target.result);
        if(!applyBoxPayload(obj, { source: 'file', flagOverlay: true, overlayReason: 'graph-file' })){
          console.warn('box payload rejected from file', { hasType: !!obj?.type });
        }
      }catch(err){
        console.error('loadBoxGraph error', err);
      }
    };
    reader.readAsText(file);
  };

  box.loadFromPayload = function loadBoxFromPayload(payload, options = {}){
    if(!applyBoxPayload(payload, { source: 'payload', ...options })){
      console.warn('box payload application failed', { source: 'payload' });
    }
  };

  box.init = function init(){
    if (box.ready) { console.debug('Debug: Components.box.init skipped'); return; }
    console.debug('Debug: Components.box.init');
    // Will be filled by placeholders
    // cache elements, ensure styles, set up resizers, hot, ui, and schedule
    if (typeof cacheEls === 'function') cacheEls();
    if(!boxAutoDrawManager && Shared.hot?.createAutoDrawManager){
      boxAutoDrawManager = Shared.hot.createAutoDrawManager({
        component: 'box',
        state,
        thresholds: {
          rows: BOX_AUTO_DRAW_ROW_THRESHOLD,
          cols: BOX_AUTO_DRAW_COL_THRESHOLD,
          cells: BOX_AUTO_DRAW_CELL_THRESHOLD
        },
        getHot: () => state.hot || state.ensureHotForActiveTab?.(),
        elements: {
          renderRow: () => els.renderRow,
          renderButton: () => els.renderButton,
          notice: () => els.autoDrawNotice
        },
        debugLog: boxDebug
      });
    }
    state.layout = Shared.componentLayout?.createStandardPanels({
      componentName: 'box',
      selectors: {
        tablePanel: '#boxTablePanel',
        graphPanel: '#boxGraphPanel',
        panelResizer: '#boxPanelResizer',
        hotWrapper: '#hotWrapper',
        hotContainer: '#hot',
        svgBox: () => els.graphPanel?.querySelector('.svgbox'),
        resizeTarget: () => els.plotDiv?.closest('.svgbox') || els.graphPanel?.querySelector('.svgbox')
      },
      scheduleDraw: state.scheduleDraw,
      onAfterSync: () => syncBoxAutoDrawNoticeWidth('panel-sync'),
      onMinSvgWidth: value => {
        state.minSvgWidth = Math.max(0, Number(value) || 0);
        console.debug('Debug: box layout min width update', { value: state.minSvgWidth });
      },
      resizableBoxOptions: {
        onResize: () => {
          boxDebug('Debug: box layout onResize schedule trigger');
          scheduleBoxNoticeWidth('resize');
          state.scheduleDraw?.({ viewOnly: true, reason: 'resize' });
        }
      }
    });
    if(state.layout?.elements?.svgBox){
      els.svgBox = state.layout.elements.svgBox;
    }
    state.layout?.setScheduleDraw?.(state.scheduleDraw);
    state.layout?.syncPanels?.();
    syncBoxAutoDrawNoticeWidth('init');
    ensureBoxLegendControlPlacement();
    const scheduleLegendPlacement = typeof Shared.debounceFrame === 'function'
      ? Shared.debounceFrame(()=>ensureBoxLegendControlPlacement())
      : null;
    if(scheduleLegendPlacement){
      scheduleLegendPlacement();
    }else if(typeof global.requestAnimationFrame === 'function'){
      global.requestAnimationFrame(()=>ensureBoxLegendControlPlacement());
    }
    if (typeof initHot === 'function') initHot();
    if (typeof initUI === 'function') initUI();
    const scheduleBoxDrawBase = Shared.debounceFrame ? Shared.debounceFrame(runBoxDrawCycle) : runBoxDrawCycle;
    const scheduleBoxDrawInstrumented = (opts) => {
      const nextOpts = opts || {};
      const overlayReason = nextOpts.reason || (nextOpts.force ? 'manual-render' : 'schedule');
      if(nextOpts.force){
        markBoxOverlayPending(overlayReason);
        forceBoxOverlay(overlayReason, { message: 'Rendering box plot...' });
      }else{
        queueBoxLoading(overlayReason);
      }
      const runSchedule = () => scheduleBoxDrawBase(nextOpts);
      const shouldDelayForOverlay = boxOverlayController?.isActive?.() && !nextOpts.viewOnly;
      if(shouldDelayForOverlay){
        const scheduleAfterPaint = () => {
          boxDebug('Debug: box autoDraw deferred for overlay',{ reason: overlayReason });
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
    scheduleDrawBoxRaw = scheduleBoxDrawInstrumented;
    if(boxAutoDrawManager){
      boxAutoDrawManager.setScheduleRaw(scheduleDrawBoxRaw);
      boxAutoDrawManager.setElements({
        renderRow: els.renderRow,
        renderButton: els.renderButton,
        notice: els.autoDrawNotice
      });
      state.scheduleDraw = (opts) => boxAutoDrawManager.schedule(opts);
      boxAutoDrawManager.updateUi();
      boxAutoDrawManager.evaluateThresholds();
      syncBoxAutoDrawNoticeWidth('auto-draw-init');
    }else{
      state.scheduleDraw = scheduleDrawBoxRaw;
    }
    console.debug('Debug: box scheduleDraw configured via Shared.debounceFrame', { guarded: !!boxAutoDrawManager }); // Debug: scheduler setup
    state.layout?.setScheduleDraw?.(() => state.scheduleDraw());
    ensureEmptyPayloadTemplate();
    box.ready = true;
    try{ state.scheduleDraw(); } catch(e){ console.error('box init initial draw error', e); }
  };

  box.draw = function(){
    try{
      box.ensure();
      if(typeof state.scheduleDraw === 'function'){
        state.scheduleDraw();
      }else{
        runBoxDrawCycle();
      }
    }catch(e){
      console.error('box.draw error', e);
    }
  };
  box.ensure = function(){ if(!box.ready) box.init(); };
  box.prepareForTab = function prepareForTab(){
    if(!box.ready){
      box.init();
      return;
    }
    if(typeof state.ensureHotForActiveTab === 'function'){
      state.ensureHotForActiveTab();
    }
  };
  box.getAdvisorRecommendation = function(answers,context){
    return computeAdvisorRecommendation(answers || {}, context || {});
  };
  box.__getState = function(){
    console.debug('Debug: box.__getState invoked');
    return state;
  };
	  box.__testHooks = Object.assign({}, box.__testHooks, {
	    tTest:(a,b)=>tTest(a,b),
	    tTestPaired:(a,b)=>tTestPaired(a,b),
	    mannWhitney:(a,b)=>mannWhitney(a,b),
	    wilcoxonSignedRank:(a,b)=>wilcoxonSignedRank(a,b),
	    anova:groups=>anova(groups),
	    kruskalWallis:groups=>kruskalWallis(groups),
	    computeWhiskerFences:ctx=>computeWhiskerFences(ctx),
	    resolveWhiskerExtents:(values,fences,options)=>resolveWhiskerExtents(values,fences,options),
	    computeTraceSummary:(values,opts)=>computeTraceSummary(values,opts),
	    benchmarkSummaries:opts=>benchmarkTraceSummaries(opts),
	    benchmarkDatasetLoad:opts=>benchmarkDatasetLoad(opts),
	    computeDagostino:(values,summary)=>computeDagostino(values,summary),
	    computeQQPoints:(values,opts)=>computeQQPoints(values,opts),
	    computeVarianceDiagnostics:(groups,labels,opts)=>computeVarianceDiagnostics(groups,labels,opts),
	    buildSignificanceBracketGeometry:opts=>buildSignificanceBracketGeometry(opts)
	  });
})(window);
