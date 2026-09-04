(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  const NS = 'http://www.w3.org/2000/svg';
  const FONT_FAMILY = 'Arial, Helvetica, sans-serif';
  const TEXT_COLOR = '#000000';
  const BASE_BOTTOM_FACTOR = 2.4;
  const PT_TO_PX = 96 / 72;
  const BASE_FONT_SIZE_PX = 16;
  const BASE_FONT_SIZE_PT = Number((BASE_FONT_SIZE_PX / PT_TO_PX).toFixed(2));
  // New graphs use an 80% frame relative to the established one-third viewport
  // baseline. Content such as legends remains an outward viewport extension.
  const DEFAULT_GRAPH_SIZE_SCALE = 0.8;
  const MIN_DEFAULT_SIZE = 256;
  const FALLBACK_VIEWPORT_WIDTH = 960;
  const COLOR_SWATCH_SIZE = 20;
  // Canonical horizontal whitespace between the SVG viewport edge and the
  // nearest rendered graph content. Axis-specific reserves are added inward
  // from this edge so every component can share the same outer gutter.
  const GRAPH_HORIZONTAL_EDGE_PADDING_PX = 8;
  const LEGEND_LAYOUT_CONSTANTS = Object.freeze({
    gapScale: 0.55,
    minGapPx: 12,
    guardPaddingPx: 24,
    basePlotMinWidth: 320,
    columnGapScale: 1.5,
    minColumnGapPx: 12,
    verticalReserveScale: 5.5,
    minVerticalReservePx: 64
  });
  chartStyle.LEGEND_LAYOUT_CONSTANTS = LEGEND_LAYOUT_CONSTANTS;
  chartStyle.GRAPH_HORIZONTAL_EDGE_PADDING_PX = GRAPH_HORIZONTAL_EDGE_PADDING_PX;
  chartStyle.resolveGraphHorizontalEdgePadding = function resolveGraphHorizontalEdgePadding(value){
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : GRAPH_HORIZONTAL_EDGE_PADDING_PX;
  };

  function normalizeSwatchSize(candidate){
    const parsed = Number(candidate);
    if(Number.isFinite(parsed) && parsed > 2){
      return Math.round(parsed);
    }
    return COLOR_SWATCH_SIZE;
  }

  function normalizeColorInput(input, options){
    if(!input || typeof input !== 'object'){ return null; }
    const el = input;
    const opts = options || {};
    const requestedSize = normalizeSwatchSize(opts.size);
    const px = `${requestedSize}px`;
    const dataset = el.dataset || null;
    const payload = {
      id: el.id || null,
      className: typeof el.className === 'string' ? el.className : undefined,
      size: requestedSize,
      reason: opts.reason || 'normalize',
      alreadyNormalized: dataset?.colorSwatchNormalized === '1'
    };
    try {
      el.style.width = px;
      el.style.height = px;
      el.style.minWidth = px;
      el.style.minHeight = px;
      el.style.flex = `0 0 ${px}`;
      el.style.boxSizing = el.style.boxSizing || 'border-box';
      if(dataset){
        dataset.colorSwatchSize = String(requestedSize);
        dataset.colorSwatchNormalized = '1';
      }
      if(!payload.alreadyNormalized){
        console.debug('Debug: chartStyle.normalizeColorInput applied', payload); // Debug: color swatch normalization
      }
      return requestedSize;
    }catch(err){
      console.error('chartStyle.normalizeColorInput error', err);
      return null;
    }
  }
  chartStyle.normalizeColorInput = normalizeColorInput;
  chartStyle.COLOR_SWATCH_SIZE = COLOR_SWATCH_SIZE;

  function buildOpenRectPath(rect, openSide){
    const left = Number(rect?.left ?? rect?.x);
    const top = Number(rect?.top ?? rect?.y);
    const right = Number(rect?.right ?? (left + Number(rect?.width)));
    const bottom = Number(rect?.bottom ?? (top + Number(rect?.height)));
    if(!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)){
      return '';
    }
    const safeLeft = Math.min(left, right);
    const safeRight = Math.max(left, right);
    const safeTop = Math.min(top, bottom);
    const safeBottom = Math.max(top, bottom);
    const side = String(openSide || 'bottom').toLowerCase();
    switch(side){
      case 'top':
        return `M ${safeLeft} ${safeTop} L ${safeLeft} ${safeBottom} L ${safeRight} ${safeBottom} L ${safeRight} ${safeTop}`;
      case 'right':
        return `M ${safeRight} ${safeTop} L ${safeLeft} ${safeTop} L ${safeLeft} ${safeBottom} L ${safeRight} ${safeBottom}`;
      case 'left':
        return `M ${safeLeft} ${safeTop} L ${safeRight} ${safeTop} L ${safeRight} ${safeBottom} L ${safeLeft} ${safeBottom}`;
      case 'bottom':
      default:
        return `M ${safeLeft} ${safeBottom} L ${safeLeft} ${safeTop} L ${safeRight} ${safeTop} L ${safeRight} ${safeBottom}`;
    }
  }
  chartStyle.buildOpenRectPath = buildOpenRectPath;

  function computeDefaultGraphSize(reason){
    const doc = global.document || null;
    const winWidth = Number(global.innerWidth) || 0;
    const docElWidth = doc?.documentElement?.clientWidth || 0;
    const bodyWidth = doc?.body?.clientWidth || 0;
    let reference = Math.max(winWidth, docElWidth, bodyWidth);
    if(!Number.isFinite(reference) || reference <= 0){
      reference = FALLBACK_VIEWPORT_WIDTH;
    }
    const normalized = Math.max(
      MIN_DEFAULT_SIZE,
      Math.round((reference / 3) * DEFAULT_GRAPH_SIZE_SCALE)
    );
    const payload = {
      reason: reason || 'initial',
      winWidth,
      docElWidth,
      bodyWidth,
      reference,
      scale: DEFAULT_GRAPH_SIZE_SCALE,
      normalized
    };
    console.debug('Debug: chartStyle.computeDefaultGraphSize', payload); // Debug: default graph dimension computation
    return { width: normalized, height: normalized };
  }

  const initialGraphSize = computeDefaultGraphSize('initial');
  let DEFAULT_WIDTH = initialGraphSize.width;
  let DEFAULT_HEIGHT = initialGraphSize.height;
  const RESIZE_MIN_SCALE = 0.3;
  const RESIZE_MAX_SCALE = 3;
  const DEFAULT_ASPECT_RATIO = 1;
  const DEFAULT_ASPECT_LOCKED = false;
  const TAB_SCOPE_TOKEN_PREFIX = '@tab:';
  const GLOBAL_TEXT_SCOPE = '__chartstyle_global__';
  let proportionalFontResizeEnabled = false;
  // DOM/runtime registries for the proportional-font-resize option. Durable graph text style state is not stored here.
  const proportionalFontResizeState = new Map();
  const proportionalFontResizeInputs = new Map();
  const proportionalFontResizeListeners = new Map();

  function normalizeScopeId(raw){
    if(typeof raw === 'string'){
      const trimmed = raw.trim();
      if(trimmed){
        return trimmed;
      }
    }
    return null;
  }

  function normalizeTabId(raw){
    if(raw == null){ return null; }
    const trimmed = String(raw).trim();
    return trimmed ? trimmed : null;
  }

  function stripTabScopeSuffix(scopeId){
    const normalized = normalizeScopeId(scopeId);
    if(!normalized){ return null; }
    const token = `::${TAB_SCOPE_TOKEN_PREFIX}`;
    const idx = normalized.indexOf(token);
    if(idx < 0){
      return normalized;
    }
    const base = normalized.slice(0, idx);
    return normalizeScopeId(base);
  }

  function resolveActiveWorkspaceTabId(){
    try{
      const hot = Shared.hot || global.Shared?.hot;
      if(hot && typeof hot.resolveActiveTabId === 'function'){
        const fromHot = normalizeTabId(hot.resolveActiveTabId());
        if(fromHot){ return fromHot; }
      }
    }catch(err){
      console.debug('Debug: chartStyle active tab resolve via hot failed', { error: err?.message || String(err) });
    }
    try{
      const session = global.Main?.session || null;
      if(session && typeof session.getActiveTab === 'function'){
        const active = session.getActiveTab();
        const fromSession = normalizeTabId(active?.id);
        if(fromSession){ return fromSession; }
      }
    }catch(err){
      console.debug('Debug: chartStyle active tab resolve via session failed', { error: err?.message || String(err) });
    }
    try{
      const doc = global.document;
      if(doc && typeof doc.querySelector === 'function'){
        const activeBtn = doc.querySelector('.workspace-tab[data-tab-id][aria-selected="true"], .workspace-tab.workspace-tab--active[data-tab-id], .workspace-tab.is-active[data-tab-id]');
        const fromDom = normalizeTabId(activeBtn?.dataset?.tabId);
        if(fromDom){ return fromDom; }
      }
    }catch(err){
      console.debug('Debug: chartStyle active tab resolve via dom failed', { error: err?.message || String(err) });
    }
    return null;
  }

  function resolveNearestWorkspaceTabId(node){
    if(!node || typeof node.closest !== 'function'){
      return null;
    }
    const owner = node.closest('[data-workspace-tab-id], [data-tab-id]');
    return normalizeTabId(owner?.dataset?.workspaceTabId || owner?.dataset?.tabId || null);
  }

  function resolveScopeTabToken(options){
    const opts = options || {};
    const svgBox = opts.svgBox || opts.container || opts.element || null;
    const input = opts.input || opts.control || null;
    const explicit = normalizeTabId(opts.tabId || opts.workspaceTabId || null);
    const fromInputOwner = resolveNearestWorkspaceTabId(input);
    const fromSvgOwner = resolveNearestWorkspaceTabId(svgBox);
    const fromInput = normalizeTabId(input?.dataset?.workspaceTabId || input?.dataset?.fontTabId || input?.dataset?.tabId || null);
    const fromSvg = normalizeTabId(svgBox?.dataset?.workspaceTabId || svgBox?.dataset?.fontTabId || svgBox?.dataset?.tabId || null);
    const active = resolveActiveWorkspaceTabId();
    return normalizeScopeId(explicit || fromInputOwner || fromSvgOwner || fromInput || fromSvg || active || null);
  }

  function applyTabScope(scopeId, options){
    const baseScope = stripTabScopeSuffix(scopeId);
    if(!baseScope){ return null; }
    const tabToken = resolveScopeTabToken(options);
    if(!tabToken){
      return baseScope;
    }
    return `${baseScope}::${TAB_SCOPE_TOKEN_PREFIX}${tabToken}`;
  }

  function resolveScopeKey(options){
    if(typeof options === 'string'){
      return applyTabScope(options, {});
    }
    const opts = options || {};
    const directScope = normalizeScopeId(opts.scopeId || opts.scope);
    if(directScope){
      return applyTabScope(directScope, opts);
    }
    const svgBox = opts.svgBox || opts.container || opts.element || null;
    if(svgBox && svgBox.dataset){
      const datasetScope = normalizeScopeId(svgBox.dataset.resizerProportionalFontResizeScope);
      if(datasetScope){
        return applyTabScope(datasetScope, opts);
      }
    }
    const input = opts.input || opts.control || null;
    if(input && input.dataset){
      const inputScope = normalizeScopeId(input.dataset.proportionalFontResizeScope);
      if(inputScope){
        return applyTabScope(inputScope, opts);
      }
    }
    if(svgBox && svgBox.id){
      return applyTabScope(svgBox.id, opts);
    }
    if(typeof opts.origin === 'string'){
      return applyTabScope(opts.origin, opts);
    }
    return null;
  }

  function getScopedProportionalFontResize(scopeId){
    if(scopeId && proportionalFontResizeState.has(scopeId)){
      return !!proportionalFontResizeState.get(scopeId);
    }
    return !!proportionalFontResizeEnabled;
  }

  function setScopedProportionalFontResize(scopeId, value){
    const normalized = !!value;
    if(scopeId){
      proportionalFontResizeState.set(scopeId, normalized);
    }else{
      proportionalFontResizeEnabled = normalized;
    }
    return normalized;
  }

  function snapshotProportionalFontResizeSummary(){
    const summary = { global: !!proportionalFontResizeEnabled, scoped: {} };
    proportionalFontResizeState.forEach((val, key) => {
      summary.scoped[key] = !!val;
    });
    return summary;
  }

  function syncProportionalFontResizeInputs(origin, scopeFilter){
    const stale = [];
    proportionalFontResizeInputs.forEach((scopeId, input) => {
      if(!input || typeof input !== 'object' || typeof input.addEventListener !== 'function'){
        stale.push(input);
        return;
      }
      const effectiveScope = scopeId || GLOBAL_TEXT_SCOPE;
      if(scopeFilter && effectiveScope !== scopeFilter){
        return;
      }
      const enabled = getScopedProportionalFontResize(scopeId);
      if('checked' in input && input.checked !== enabled){
        try {
          input.checked = enabled;
        } catch(syncErr){
          console.error('chartStyle.syncProportionalFontResizeInputs assignment error', syncErr);
        }
      }
    });
    if(stale.length){
      stale.forEach(item => proportionalFontResizeInputs.delete(item));
    }
    console.debug('Debug: chartStyle.syncProportionalFontResizeInputs', {
      origin: origin || 'unknown',
      scope: scopeFilter || 'all',
      controlCount: proportionalFontResizeInputs.size,
      staleCount: stale.length,
      stateSummary: snapshotProportionalFontResizeSummary()
    }); // Debug: proportional font resize control sync trace
  }

  function emitProportionalFontResizeChange(origin, scopeId, enabledValue){
    const effectiveScope = scopeId || GLOBAL_TEXT_SCOPE;
    console.debug('Debug: chartStyle.emitProportionalFontResizeChange start', {
      origin: origin || 'unknown',
      enabled: enabledValue,
      scope: effectiveScope,
      listenerCount: proportionalFontResizeListeners.size
    }); // Debug: proportional font resize listener broadcast start
    proportionalFontResizeListeners.forEach((info, listener) => {
      if(!info || typeof listener !== 'function'){
        return;
      }
      if(info.scope && info.scope !== effectiveScope){
        console.debug('Debug: chartStyle.emitProportionalFontResizeChange skip listener', {
          listenerScope: info.scope,
          eventScope: effectiveScope,
          listenerOrigin: info.origin || listener.name || 'anonymous'
        }); // Debug: listener scope filter
        return;
      }
      try {
        listener(enabledValue, origin || 'unknown', { scopeId: scopeId || null, enabled: enabledValue });
      } catch(err){
        console.error('chartStyle proportional font resize listener error', err);
      }
    });
  }

  function clampScale(value){
    const numeric = Number(value);
    if(!Number.isFinite(numeric)){
      return 1;
    }
    return Math.min(RESIZE_MAX_SCALE, Math.max(RESIZE_MIN_SCALE, numeric));
  }

  function resolveStyleScale(scaleInfo){
    if(scaleInfo && typeof scaleInfo === 'object'){
      if(Number.isFinite(scaleInfo.styleScale)){
        return scaleInfo.styleScale;
      }
      if(Number.isFinite(scaleInfo.scale)){
        return scaleInfo.scale;
      }
    }
    return 1;
  }

  chartStyle.FONT_FAMILY = FONT_FAMILY;
  chartStyle.TEXT_COLOR = TEXT_COLOR;
  chartStyle.PT_TO_PX = PT_TO_PX;
  chartStyle.BASE_FONT_SIZE_PT = BASE_FONT_SIZE_PT;
  chartStyle.BASE_FONT_SIZE_PX = BASE_FONT_SIZE_PX;
  chartStyle.DEFAULT_GRAPH_SIZE_SCALE = DEFAULT_GRAPH_SIZE_SCALE;
  chartStyle.DEFAULT_WIDTH = DEFAULT_WIDTH;
  chartStyle.DEFAULT_HEIGHT = DEFAULT_HEIGHT;
  chartStyle.RESIZE_MIN_SCALE = RESIZE_MIN_SCALE;
  chartStyle.RESIZE_MAX_SCALE = RESIZE_MAX_SCALE;
  chartStyle.DEFAULT_ASPECT_RATIO = DEFAULT_ASPECT_RATIO;
  chartStyle.DEFAULT_ASPECT_LOCKED = DEFAULT_ASPECT_LOCKED;

  function refreshDefaultGraphSize(context){
    const updated = computeDefaultGraphSize(context || 'refresh');
    DEFAULT_WIDTH = updated.width;
    DEFAULT_HEIGHT = updated.height;
    chartStyle.DEFAULT_WIDTH = DEFAULT_WIDTH;
    chartStyle.DEFAULT_HEIGHT = DEFAULT_HEIGHT;
    console.debug('Debug: chartStyle.refreshDefaultGraphSize', { context, updated }); // Debug: default size refresh
    return updated;
  }

  chartStyle.getDefaultGraphSize = function getDefaultGraphSize(options){
    const context = options?.context || 'cached';
    const refresh = options?.refresh === true;
    if(refresh){
      const refreshed = refreshDefaultGraphSize(context);
      console.debug('Debug: chartStyle.getDefaultGraphSize refresh result', { context, refreshed }); // Debug: refresh branch trace
      return { width: refreshed.width, height: refreshed.height };
    }
    const current = { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
    console.debug('Debug: chartStyle.getDefaultGraphSize cached result', { context, current }); // Debug: cached branch trace
    return current;
  };

  chartStyle.getSquareGraphSizing = function getSquareGraphSizing(options){
    const context = options?.context || 'default';
    const refresh = options?.refresh === true;
    const baseSize = chartStyle.getDefaultGraphSize({ context, refresh });
    let width = Number(baseSize?.width);
    let height = Number(baseSize?.height);
    if(!Number.isFinite(width) || width <= 0){
      width = DEFAULT_WIDTH;
    }
    if(!Number.isFinite(height) || height <= 0){
      height = DEFAULT_HEIGHT;
    }
    if(!Number.isFinite(width) || width <= 0){
      const fallback = computeDefaultGraphSize(`fallback-${context}`);
      width = fallback.width;
      height = fallback.height;
    }
    if(!Number.isFinite(height) || height <= 0){
      height = width;
    }
    const rawMinScale = Number(options?.minScale);
    const rawMaxScale = Number(options?.maxScale);
    const minScale = clampScale(Number.isFinite(rawMinScale) ? rawMinScale : RESIZE_MIN_SCALE);
    const maxScale = clampScale(Number.isFinite(rawMaxScale) ? rawMaxScale : RESIZE_MAX_SCALE);
    const effectiveMaxScale = Math.max(maxScale, minScale);
    const minWidth = Math.max(1, Math.round(width * minScale));
    const minHeight = Math.max(1, Math.round(height * minScale));
    const maxWidth = Math.max(width, Math.round(width * effectiveMaxScale));
    const maxHeight = Math.max(height, Math.round(height * effectiveMaxScale));
    const sizing = {
      width,
      height,
      minWidth,
      minHeight,
      maxWidth,
      maxHeight,
      aspectRatio: DEFAULT_ASPECT_RATIO,
      aspectLocked: DEFAULT_ASPECT_LOCKED
    };
    console.debug('Debug: chartStyle.getSquareGraphSizing', {
      context,
      refresh,
      minScale,
      maxScale: effectiveMaxScale,
      sizing
    }); // Debug: square sizing helper
    return sizing;
  };

  chartStyle.ptToPx = function ptToPx(pt){
    const numeric = Number(pt);
    const px = Number.isFinite(numeric) ? numeric * PT_TO_PX : BASE_FONT_SIZE_PX;
    console.debug('Debug: chartStyle.ptToPx',{input:pt, numeric, px}); // Debug: pt to px conversion trace
    return px;
  };

  chartStyle.pxToPt = function pxToPt(px){
    const numeric = Number(px);
    const pt = Number.isFinite(numeric) ? numeric / PT_TO_PX : BASE_FONT_SIZE_PT;
    console.debug('Debug: chartStyle.pxToPt',{input:px, numeric, pt}); // Debug: px to pt conversion trace
    return pt;
  };

  chartStyle.normalizeFontSize = function normalizeFontSize(raw){
    const numeric = Number(raw);
    const pt = Number.isFinite(numeric) ? numeric : BASE_FONT_SIZE_PT;
    const px = chartStyle.ptToPx(pt);
    console.debug('Debug: chartStyle.normalizeFontSize',{raw, pt, px}); // Debug: font normalization trace
    return {pt, px};
  };

  function getCanvas(){
    const doc = global.document;
    if(!doc){
      console.warn('chartStyle.getCanvas missing document context');
      return null;
    }
    if(!chartStyle._canvas){
      chartStyle._canvas = doc.createElement('canvas');
      console.debug('Debug: chartStyle created measurement canvas'); // Debug helper creation
    }
    return chartStyle._canvas;
  }

  chartStyle.makeFont = function makeFont(size){
    const font = `${size}px ${FONT_FAMILY}`;
    return font;
  };

  function parsePositiveNumber(value){
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : NaN;
  }

  function readElementSizePx(element, axis){
    if(!element || typeof element !== 'object'){
      return NaN;
    }
    const dataset = element.dataset || {};
    const keys = axis === 'width'
      ? ['resizerBaseWidth', 'graphWidthPx', 'svgWidth', 'resizerDefaultWidth', 'graphDefaultWidth']
      : ['resizerBaseHeight', 'graphHeightPx', 'svgHeight', 'resizerDefaultHeight', 'graphDefaultHeight'];
    for(let i = 0; i < keys.length; i += 1){
      const value = parsePositiveNumber(dataset[keys[i]]);
      if(Number.isFinite(value)){
        return value;
      }
    }
    if(typeof element.getBoundingClientRect === 'function'){
      const rect = element.getBoundingClientRect();
      const rectValue = parsePositiveNumber(axis === 'width' ? rect?.width : rect?.height);
      if(Number.isFinite(rectValue)){
        return rectValue;
      }
    }
    const styleValue = parsePositiveNumber(axis === 'width' ? element.style?.width : element.style?.height);
    return Number.isFinite(styleValue) ? styleValue : NaN;
  }

  function resolveFontResizeReferenceSize(svgBox, width, height, zoomScale){
    const scale = Number.isFinite(zoomScale) && zoomScale > 0 ? zoomScale : 1;
    const rawWidth = parsePositiveNumber(width);
    const rawHeight = parsePositiveNumber(height);
    const widthFromBox = readElementSizePx(svgBox, 'width');
    const heightFromBox = readElementSizePx(svgBox, 'height');
    return {
      width: Number.isFinite(rawWidth) ? rawWidth / scale : widthFromBox,
      height: Number.isFinite(rawHeight) ? rawHeight / scale : heightFromBox
    };
  }

  function resolveCurrentDisplayFontPt(options){
    const opts = options || {};
    const inputEl = opts.input || opts.control || null;
    const svgBox = opts.svgBox || null;
    const inputDataset = inputEl?.dataset || null;
    const svgDataset = svgBox?.dataset || null;
    const candidates = [
      opts.displayPt,
      opts.fontPt,
      opts.pt,
      opts.scaledPt,
      inputDataset?.fontDisplayPt,
      svgDataset?.fontDisplayPt,
      svgDataset?.fontBasePt,
      inputDataset?.fontBasePt,
      inputEl?.value,
      opts.rawSize,
      opts.basePt
    ];
    for(let i = 0; i < candidates.length; i += 1){
      const value = Number(candidates[i]);
      if(Number.isFinite(value) && value > 0){
        return value;
      }
    }
    return NaN;
  }

  function syncFontInputBaseline(inputEl, pt, options = {}){
    if(!inputEl || !inputEl.dataset || !Number.isFinite(pt) || pt <= 0){
      return false;
    }
    inputEl.dataset.fontBasePt = String(pt);
    inputEl.dataset.fontDisplayPt = String(pt);
    delete inputEl.dataset.fontResizeBaselinePending;
    if(options.syncValue === true && 'value' in inputEl){
      const min = Number(inputEl.min);
      const max = Number(inputEl.max);
      const bounded = Math.min(
        Number.isFinite(max) ? max : pt,
        Math.max(Number.isFinite(min) ? min : pt, pt)
      );
      try{
        inputEl.value = String(Math.round(bounded * 10) / 10);
      }catch(err){
        console.error('chartStyle.syncFontInputBaseline value sync error', err);
      }
    }
    return true;
  }

  function commitFontResizeBaseline(options){
    const opts = options || {};
    const svgBox = opts.svgBox || null;
    const dataset = svgBox?.dataset || null;
    const inputEl = opts.input || opts.control || null;
    const displayPt = resolveCurrentDisplayFontPt(opts);
    const size = resolveFontResizeReferenceSize(svgBox, opts.width, opts.height, opts.zoomScale);
    if(dataset){
      if(Number.isFinite(size.width) && size.width > 0){
        dataset.resizerFontResizeBaseWidth = String(size.width);
      }
      if(Number.isFinite(size.height) && size.height > 0){
        dataset.resizerFontResizeBaseHeight = String(size.height);
      }
      if(Number.isFinite(displayPt) && displayPt > 0){
        dataset.fontBasePt = String(displayPt);
        dataset.fontDisplayPt = String(displayPt);
      }
    }
    syncFontInputBaseline(inputEl, displayPt, { syncValue: opts.syncInputValue === true });
    console.debug('Debug: chartStyle.commitFontResizeBaseline', {
      origin: opts.origin || 'unknown',
      scope: opts.scopeId || dataset?.resizerProportionalFontResizeScope || 'global',
      width: Number.isFinite(size.width) ? size.width : null,
      height: Number.isFinite(size.height) ? size.height : null,
      displayPt: Number.isFinite(displayPt) ? displayPt : null,
      hasSvgBox: !!svgBox,
      inputId: inputEl?.id || null
    }); // Debug: font resize baseline commit
    return {
      width: Number.isFinite(size.width) ? size.width : null,
      height: Number.isFinite(size.height) ? size.height : null,
      displayPt: Number.isFinite(displayPt) ? displayPt : null
    };
  }

  chartStyle.commitFontResizeBaseline = commitFontResizeBaseline;

  chartStyle.computeResizeScale = function computeResizeScale(options){
    const svgBox = options?.svgBox || null;
    const dataset = svgBox?.dataset || null;
    const resizerState = typeof svgBox?.__sharedResizableBoxApi?.getState === 'function'
      ? svgBox.__sharedResizableBoxApi.getState()
      : null;
    const explicitDefaultWidth = parsePositiveNumber(options?.defaultWidth);
    const explicitDefaultHeight = parsePositiveNumber(options?.defaultHeight);
    const apiDefaultWidth = parsePositiveNumber(resizerState?.defaultWidth);
    const apiDefaultHeight = parsePositiveNumber(resizerState?.defaultHeight);
    const storedDefaultWidth = parsePositiveNumber(dataset?.resizerDefaultWidth);
    const storedDefaultHeight = parsePositiveNumber(dataset?.resizerDefaultHeight);
    const defaultWidth = explicitDefaultWidth || apiDefaultWidth || storedDefaultWidth || DEFAULT_WIDTH;
    const defaultHeight = explicitDefaultHeight || apiDefaultHeight || storedDefaultHeight || DEFAULT_HEIGHT;
    const rawWidth = Number(options?.width);
    const rawHeight = Number(options?.height);
    const safeWidth = Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : defaultWidth;
    const safeHeight = Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : defaultHeight;
    const scaleX = safeWidth / (defaultWidth || 1);
    const scaleY = safeHeight / (defaultHeight || 1);
    const fontBaseWidth = dataset ? parsePositiveNumber(dataset.resizerFontResizeBaseWidth) : NaN;
    const fontBaseHeight = dataset ? parsePositiveNumber(dataset.resizerFontResizeBaseHeight) : NaN;
    const fontReferenceWidth = Number.isFinite(fontBaseWidth) ? fontBaseWidth : defaultWidth;
    const fontReferenceHeight = Number.isFinite(fontBaseHeight) ? fontBaseHeight : defaultHeight;
    const fontScaleX = safeWidth / (fontReferenceWidth || 1);
    const fontScaleY = safeHeight / (fontReferenceHeight || 1);
    const aspectLocked = dataset
      ? (Shared.aspectLock?.resolveLocked
        ? Shared.aspectLock.resolveLocked(dataset, { fallback: false })
        : dataset.resizerAspectLocked === 'true')
      : false;
    const resizeAxis = dataset && (dataset.resizerLastAxis === 'x' || dataset.resizerLastAxis === 'y') ? dataset.resizerLastAxis : 'both';
    const unlockedStyleScaleBase = dataset ? Number(dataset.resizerUnlockedStyleScaleBase) : NaN;
    const lockedStyleScaleBase = dataset ? Number(dataset.resizerLockedStyleScaleBase) : NaN;
    const rawStyleScale = Math.sqrt(Math.max(scaleX * scaleY, 0));
    const rawFontScale = Math.sqrt(Math.max(fontScaleX * fontScaleY, 0));
    let fontResizeUnclamped = rawFontScale;
    if(!aspectLocked && resizeAxis === 'x' && Number.isFinite(fontScaleX) && fontScaleX > 0){
      fontResizeUnclamped = fontScaleX;
    }else if(!aspectLocked && resizeAxis === 'y' && Number.isFinite(fontScaleY) && fontScaleY > 0){
      fontResizeUnclamped = fontScaleY;
    }
    let styleUnclamped = rawStyleScale;
    // Keep non-text style metrics stable in unlocked manual resize flows so
    // one-axis drags change only axis length unless text explicitly opts into
    // proportional font resizing.
    if(!aspectLocked && Number.isFinite(unlockedStyleScaleBase) && unlockedStyleScaleBase > 0){
      styleUnclamped = unlockedStyleScaleBase;
    }else if(aspectLocked && Number.isFinite(lockedStyleScaleBase) && lockedStyleScaleBase > 0){
      styleUnclamped = styleUnclamped / lockedStyleScaleBase;
    }
    const styleScale = clampScale(styleUnclamped);
    const fontResizeScale = clampScale(fontResizeUnclamped);
    const radiusScale = Math.sqrt(styleScale);
    if(dataset){
      dataset.resizerRenderedRawStyleScale = String(rawStyleScale);
      dataset.resizerRenderedStyleScale = String(styleScale);
    }
    const payload = {
      width: safeWidth,
      height: safeHeight,
      defaultWidth,
      defaultHeight,
      scaleX,
      scaleY,
      fontScaleX,
      fontScaleY,
      fontReferenceWidth,
      fontReferenceHeight,
      scaleW: scaleX,
      scaleH: scaleY,
      rawStyleScale,
      styleUnclamped,
      styleScale,
      fontResizeUnclamped,
      fontResizeScale,
      radiusScale,
      strokeScale: radiusScale,
      aspectLocked,
      resizeAxis,
      unlockedStyleScaleBase: Number.isFinite(unlockedStyleScaleBase) ? unlockedStyleScaleBase : null,
      lockedStyleScaleBase: Number.isFinite(lockedStyleScaleBase) ? lockedStyleScaleBase : null,
      legacyMinScale: Math.min(scaleX, scaleY),
      scale: styleScale
    };
    console.debug('Debug: chartStyle.computeResizeScale', payload); // Debug: resize scaling payload
    return payload;
  };

  chartStyle.resolveScaledFontSize = function resolveScaledFontSize(options){
    const opts = options || {};
    const inputEl = opts.input || opts.control || null;
    const svgBox = opts.svgBox || null;
    const dataset = svgBox && svgBox.dataset ? svgBox.dataset : null;
    const rawSizeNumeric = Number(opts.rawSize);
    const manualBaselinePending = inputEl?.dataset?.fontResizeBaselinePending === 'true';
    let basePt = Number(opts.basePt);
    if(manualBaselinePending){
      const pendingBase = Number(inputEl.dataset.fontBasePt);
      basePt = Number.isFinite(pendingBase) && pendingBase > 0
        ? pendingBase
        : (Number.isFinite(rawSizeNumeric) ? rawSizeNumeric : basePt);
    }
    if(!manualBaselinePending && !Number.isFinite(basePt)){
      const storedGraphBase = Number(dataset?.fontBasePt);
      if(Number.isFinite(storedGraphBase) && storedGraphBase > 0){
        basePt = storedGraphBase;
      }
    }
    if(!Number.isFinite(basePt)){
      const storedControlBase = Number(inputEl?.dataset?.fontBasePt);
      if(Number.isFinite(storedControlBase) && storedControlBase > 0){
        basePt = storedControlBase;
      }
    }
    if(!Number.isFinite(basePt)){
      basePt = Number.isFinite(rawSizeNumeric) ? rawSizeNumeric : undefined;
    }
    let normalized = chartStyle.normalizeFontSize(basePt);
    if(inputEl && inputEl.dataset){
      const datasetBase = Number(inputEl.dataset.fontBasePt);
      if(!Number.isFinite(datasetBase)){
        inputEl.dataset.fontBasePt = String(normalized.pt);
        console.debug('Debug: chartStyle.resolveScaledFontSize init control base', {
          inputId: inputEl.id || null,
          basePt: normalized.pt
        }); // Debug: base initialization for control
      }
    }
    const explicitZoomScale = Number(opts.zoomScale);
    const datasetZoomScale = Number(dataset?.resizerZoomLevel || dataset?.resizerZoom);
    const zoomScale = Number.isFinite(explicitZoomScale) && explicitZoomScale > 0
      ? explicitZoomScale
      : (Number.isFinite(datasetZoomScale) && datasetZoomScale > 0 ? datasetZoomScale : 1);
    const rawWidth = Number(opts.width);
    const rawHeight = Number(opts.height);
    const effectiveWidth = Number.isFinite(rawWidth) ? (rawWidth / zoomScale) : opts.width;
    const effectiveHeight = Number.isFinite(rawHeight) ? (rawHeight / zoomScale) : opts.height;
    if(manualBaselinePending){
      commitFontResizeBaseline({
        svgBox,
        input: inputEl,
        displayPt: normalized.pt,
        width: effectiveWidth,
        height: effectiveHeight,
        zoomScale: 1,
        origin: 'manual-font-size',
        syncInputValue: false
      });
    }
    const resizeInfo = chartStyle.computeResizeScale({
      width: effectiveWidth,
      height: effectiveHeight,
      defaultWidth: opts.defaultWidth,
      defaultHeight: opts.defaultHeight,
      svgBox
    });
    const scopeId = resolveScopeKey({ scopeId: opts.scopeId, svgBox, input: inputEl });
    const isManualResize = dataset ? dataset.resizerResized === 'true' : null;
    let proportionalResizeEnabled;
    if(typeof opts.proportionalFontResize === 'boolean'){
      proportionalResizeEnabled = !!opts.proportionalFontResize;
    }else if(dataset && typeof dataset.resizerProportionalFontResize === 'string'){
      proportionalResizeEnabled = dataset.resizerProportionalFontResize === 'true';
    }else if(scopeId){
      proportionalResizeEnabled = getScopedProportionalFontResize(scopeId);
    }else{
      proportionalResizeEnabled = proportionalFontResizeEnabled;
    }
    const textScale = proportionalResizeEnabled
      ? (Number.isFinite(resizeInfo.fontResizeScale) && resizeInfo.fontResizeScale > 0
        ? resizeInfo.fontResizeScale
        : resizeInfo.styleScale)
      : 1;
    const scaledPxRaw = normalized.px * textScale;
    // Preserve exact pt values when proportional resizing is disabled: rounding
    // 7pt (9.333px) down to 9px causes visible drift in toolbar readback.
    const scaledPx = proportionalResizeEnabled
      ? Math.max(4, Math.round(scaledPxRaw))
      : Math.max(4, scaledPxRaw);
    const scaledPt = chartStyle.pxToPt(scaledPx);
    if(inputEl && inputEl.dataset){
      inputEl.dataset.fontDisplayPt = String(scaledPt);
      console.debug('Debug: chartStyle.resolveScaledFontSize display stored', {
        inputId: inputEl.id || null,
        scaledPt
      }); // Debug: display pt tracking
    }
    if(dataset){
      dataset.fontDisplayPt = String(scaledPt);
      console.debug('Debug: chartStyle.resolveScaledFontSize dataset display stored', {
        scope: scopeId || 'global',
        scaledPt
      }); // Debug: dataset display tracking
    }
    const scaleInfo = {
      ...resizeInfo,
      zoomScale: 1,
      displayZoomScale: zoomScale,
      textScale,
      proportionalFontResize: proportionalResizeEnabled,
      manualResize: !!isManualResize,
      scopeId
    };
    const result = {
      ...normalized,
      scaledPx,
      scaledPt,
      displayPt: scaledPt,
      basePt: normalized.pt,
      scaleInfo,
      proportionalFontResize: proportionalResizeEnabled,
      scopeId
    };
    console.debug('Debug: chartStyle.resolveScaledFontSize', {
      raw: opts.rawSize,
      normalizedPt: normalized.pt,
      basePx: normalized.px,
      scaledPx,
      scaledPt,
      styleScale: resizeInfo.styleScale,
      textScale,
      zoomScale,
      rawWidth,
      rawHeight,
      effectiveWidth: Number.isFinite(effectiveWidth) ? effectiveWidth : null,
      effectiveHeight: Number.isFinite(effectiveHeight) ? effectiveHeight : null,
      proportionalFontResize: proportionalResizeEnabled,
      manualResize: isManualResize,
      width: resizeInfo.width,
      height: resizeInfo.height,
      scope: scopeId || 'global'
    }); // Debug: scaled font resolution
    return result;
  };

  chartStyle.computeFontInfoForSvg = function computeFontInfoForSvg(options){
    const opts = options || {};
    const svgBox = opts.svgBox || null;
    let rect = null;
    if(svgBox && typeof svgBox.getBoundingClientRect === 'function'){
      rect = svgBox.getBoundingClientRect();
    }
    const width = Number.isFinite(opts.width) ? opts.width : rect?.width;
    const height = Number.isFinite(opts.height) ? opts.height : rect?.height;
    const scopeId = opts.scopeId || null;
    const fontInfo = chartStyle.resolveScaledFontSize({
      rawSize: opts.rawSize,
      width,
      height,
      defaultWidth: opts.defaultWidth,
      defaultHeight: opts.defaultHeight,
      svgBox,
      scopeId,
      proportionalFontResize: opts.proportionalFontResize,
      input: opts.input
    });
    console.debug('Debug: chartStyle.computeFontInfoForSvg', {
      debugLabel: opts.debugLabel || 'chartStyle.computeFontInfoForSvg',
      rawSize: opts.rawSize,
      width,
      height,
      scope: fontInfo.scopeId || scopeId || 'global',
      proportionalFontResize: fontInfo.proportionalFontResize,
      scaledPx: fontInfo.scaledPx
    }); // Debug: svg font helper summary
    return fontInfo;
  };

  chartStyle.computeViewBoxScale = function computeViewBoxScale(options){
    const opts = options || {};
    const svg = opts.svg || null;
    const svgBox = opts.svgBox || (svg && typeof svg.closest === 'function' ? svg.closest('.svgbox') : null);
    const rawViewWidth = Number(opts.viewBoxWidth);
    const rawViewHeight = Number(opts.viewBoxHeight);
    let displayWidth = Number.isFinite(opts.displayWidth) ? opts.displayWidth : NaN;
    let displayHeight = Number.isFinite(opts.displayHeight) ? opts.displayHeight : NaN;
    if((!Number.isFinite(displayWidth) || !Number.isFinite(displayHeight)) && svgBox && typeof svgBox.getBoundingClientRect === 'function'){
      try{
        const rect = svgBox.getBoundingClientRect();
        if(!Number.isFinite(displayWidth)) displayWidth = rect?.width;
        if(!Number.isFinite(displayHeight)) displayHeight = rect?.height;
      }catch(rectErr){
        console.error('chartStyle.computeViewBoxScale rect error', rectErr);
      }
    }
    if((!Number.isFinite(displayWidth) || !Number.isFinite(displayHeight)) && svg && typeof svg.getBoundingClientRect === 'function'){
      try{
        const rect = svg.getBoundingClientRect();
        if(!Number.isFinite(displayWidth)) displayWidth = rect?.width;
        if(!Number.isFinite(displayHeight)) displayHeight = rect?.height;
      }catch(svgErr){
        console.error('chartStyle.computeViewBoxScale svg rect error', svgErr);
      }
    }
    if(!Number.isFinite(displayWidth) && svg && svg.viewBox && svg.viewBox.baseVal){
      const base = svg.viewBox.baseVal;
      if(Number.isFinite(base?.width)) displayWidth = base.width;
      if(Number.isFinite(base?.height)) displayHeight = base.height;
    }
    const safeViewWidth = Number.isFinite(rawViewWidth) && rawViewWidth > 0 ? rawViewWidth : (Number.isFinite(displayWidth) && displayWidth > 0 ? displayWidth : 1);
    const safeViewHeight = Number.isFinite(rawViewHeight) && rawViewHeight > 0 ? rawViewHeight : (Number.isFinite(displayHeight) && displayHeight > 0 ? displayHeight : safeViewWidth);
    const safeDisplayWidth = Number.isFinite(displayWidth) && displayWidth > 0 ? displayWidth : safeViewWidth;
    const safeDisplayHeight = Number.isFinite(displayHeight) && displayHeight > 0 ? displayHeight : safeViewHeight;
    const scaleX = safeViewWidth > 0 ? safeDisplayWidth / safeViewWidth : 1;
    const scaleY = safeViewHeight > 0 ? safeDisplayHeight / safeViewHeight : 1;
    let scale = Math.sqrt(Math.max(scaleX * scaleY, 0));
    if(!Number.isFinite(scale) || scale <= 0){
      scale = 1;
    }
    const payload = {
      scaleX,
      scaleY,
      scale,
      displayWidth: safeDisplayWidth,
      displayHeight: safeDisplayHeight,
      viewBoxWidth: safeViewWidth,
      viewBoxHeight: safeViewHeight,
      debugLabel: opts.debugLabel || 'chartStyle.computeViewBoxScale'
    };
    console.debug('Debug: chartStyle.computeViewBoxScale', payload); // Debug: viewBox scale computation
    return payload;
  };

  chartStyle.adjustFontSizeForViewBox = function adjustFontSizeForViewBox(fontInfo, viewScale, options){
    const info = fontInfo || {};
    const opts = options || {};
    const base = Number.isFinite(info.scaledPx) ? info.scaledPx : Number.isFinite(opts.basePx) ? opts.basePx : Number(info);
    const scale = Number.isFinite(viewScale?.scale) && viewScale.scale > 0 ? viewScale.scale : 1;
    const inverse = scale > 0 ? 1 / scale : 1;
    const min = Number.isFinite(opts.min) ? opts.min : 0;
    let adjusted = Number.isFinite(base) ? base * inverse : base;
    if(Number.isFinite(adjusted) && adjusted < min){
      adjusted = min;
    }
    console.debug('Debug: chartStyle.adjustFontSizeForViewBox', {
      debugLabel: opts.debugLabel || 'chartStyle.adjustFontSizeForViewBox',
      base,
      scale,
      inverse,
      adjusted,
      min
    }); // Debug: font adjustment for viewBox
    return {
      fontSizePx: Number.isFinite(adjusted) ? adjusted : base,
      basePx: base,
      scaleApplied: scale,
      inverseScale: inverse
    };
  };

  chartStyle.setProportionalFontResize = function setProportionalFontResize(enabled, options){
    const nextValue = !!enabled;
    const opts = options || {};
    const origin = opts.origin || 'setProportionalFontResize';
    const svgBox = opts.svgBox || null;
    const scopeId = resolveScopeKey({ ...opts, svgBox });
    const effectiveScope = scopeId || GLOBAL_TEXT_SCOPE;
    const force = opts.force === true;
    const previous = getScopedProportionalFontResize(scopeId);
    if(previous === nextValue && !force){
      console.debug('Debug: chartStyle.setProportionalFontResize noop', { enabled: previous, origin, scope: effectiveScope });
      return previous;
    }
    commitFontResizeBaseline({
      svgBox,
      displayPt: opts.displayPt,
      width: opts.width,
      height: opts.height,
      zoomScale: opts.zoomScale,
      scopeId,
      origin,
      syncInputValue: true
    });
    setScopedProportionalFontResize(scopeId, nextValue);
    if(svgBox && svgBox.dataset){
      if(scopeId){
        svgBox.dataset.resizerProportionalFontResizeScope = scopeId;
      }
      svgBox.dataset.resizerProportionalFontResize = nextValue ? 'true' : 'false';
    }
    console.debug('Debug: chartStyle.setProportionalFontResize', {
      enabled: nextValue,
      origin,
      force,
      scope: effectiveScope,
      stateSummary: snapshotProportionalFontResizeSummary()
    });
    syncProportionalFontResizeInputs(origin, effectiveScope);
    emitProportionalFontResizeChange(origin, scopeId, nextValue);
    return nextValue;
  };

  chartStyle.isProportionalFontResizeEnabled = function isProportionalFontResizeEnabled(scopeOptions){
    const scopeId = resolveScopeKey(scopeOptions);
    const result = getScopedProportionalFontResize(scopeId);
    console.debug('Debug: chartStyle.isProportionalFontResizeEnabled query', {
      enabled: result,
      scope: scopeId || 'global'
    });
    return result;
  };

  chartStyle.registerProportionalFontResizeControl = function registerProportionalFontResizeControl(input, options){
    const el = input;
    const opts = options || {};
    const origin = opts.origin || el?.id || 'proportional-font-resize-control';
    if(!el || typeof el.addEventListener !== 'function'){
      console.debug('Debug: chartStyle.registerProportionalFontResizeControl skipped', { origin, reason: 'invalid element' });
      return function noopUnregister(){
        console.debug('Debug: chartStyle.unregisterProportionalFontResizeControl noop', { origin });
      };
    }
    const scopeId = resolveScopeKey({ ...opts, input: el });
    const effectiveScope = scopeId || GLOBAL_TEXT_SCOPE;
    const svgBox = opts.svgBox || null;
    if(svgBox && svgBox.dataset){
      if(scopeId){
        svgBox.dataset.resizerProportionalFontResizeScope = scopeId;
      }
      if(typeof svgBox.dataset.resizerProportionalFontResize !== 'string'){
        svgBox.dataset.resizerProportionalFontResize = getScopedProportionalFontResize(scopeId) ? 'true' : 'false';
      }
    }
    if(el.dataset){
      el.dataset.proportionalFontResizeScope = scopeId || '';
    }
    if(el.__chartStyleProportionalFontResizeHandler){
      el.removeEventListener('change', el.__chartStyleProportionalFontResizeHandler);
      delete el.__chartStyleProportionalFontResizeHandler;
      console.debug('Debug: chartStyle.registerProportionalFontResizeControl removed existing handler', { origin });
    }
    if('checked' in el){
      try {
        el.checked = getScopedProportionalFontResize(scopeId);
      } catch(assignErr){
        console.error('chartStyle.registerProportionalFontResizeControl assign error', assignErr);
      }
    }
    const handler = () => {
      const enabled = !!el.checked;
      if(svgBox && svgBox.dataset){
        svgBox.dataset.resizerProportionalFontResize = enabled ? 'true' : 'false';
      }
      console.debug('Debug: chartStyle.proportionalFontResizeControl change', { origin, enabled, scope: effectiveScope });
      chartStyle.setProportionalFontResize(enabled, { origin: `control-${origin}`, scopeId, svgBox });
    };
    el.addEventListener('change', handler);
    el.__chartStyleProportionalFontResizeHandler = handler;
    proportionalFontResizeInputs.set(el, scopeId);
    console.debug('Debug: chartStyle.registerProportionalFontResizeControl', {
      origin,
      enabled: getScopedProportionalFontResize(scopeId),
      controlCount: proportionalFontResizeInputs.size,
      scope: effectiveScope
    });
    const cleanup = () => {
      if(el.__chartStyleProportionalFontResizeHandler){
        el.removeEventListener('change', el.__chartStyleProportionalFontResizeHandler);
        delete el.__chartStyleProportionalFontResizeHandler;
      }
      proportionalFontResizeInputs.delete(el);
      console.debug('Debug: chartStyle.unregisterProportionalFontResizeControl', {
        origin,
        remaining: proportionalFontResizeInputs.size,
        scope: effectiveScope
      });
    };
    if(opts.signal && typeof opts.signal.addEventListener === 'function'){
      opts.signal.addEventListener('abort', cleanup, { once: true });
    }
    return cleanup;
  };

  chartStyle.onProportionalFontResizeChange = function onProportionalFontResizeChange(callback, options){
    if(typeof callback !== 'function'){
      console.debug('Debug: chartStyle.onProportionalFontResizeChange skipped', { reason: 'invalid callback' });
      return function noopRemove(){
        console.debug('Debug: chartStyle.onProportionalFontResizeChange noop remove');
      };
    }
    const opts = options || {};
    const origin = opts.origin || callback.name || 'anonymous';
    const scopeId = resolveScopeKey(opts);
    const effectiveScope = scopeId || null;
    proportionalFontResizeListeners.set(callback, { origin, scope: effectiveScope ? effectiveScope : null });
    console.debug('Debug: chartStyle.onProportionalFontResizeChange registered', {
      origin,
      listenerCount: proportionalFontResizeListeners.size,
      scope: effectiveScope || 'all'
    });
    if(opts.immediate){
      try {
        const initial = getScopedProportionalFontResize(scopeId);
        callback(initial, 'immediate', { scopeId: scopeId || null, enabled: initial });
      } catch(err){
        console.error('chartStyle proportional font resize immediate callback error', err);
      }
    }
    const cleanup = () => {
      proportionalFontResizeListeners.delete(callback);
      console.debug('Debug: chartStyle.onProportionalFontResizeChange removed', {
        origin,
        remaining: proportionalFontResizeListeners.size,
        scope: effectiveScope || 'all'
      });
    };
    if(opts.signal && typeof opts.signal.addEventListener === 'function'){
      opts.signal.addEventListener('abort', cleanup, { once: true });
    }
    return cleanup;
  };

  chartStyle.scaleLength = function scaleLength(base, scaleInfo, options){
    const opts = options || {};
    const numeric = Number(base);
    if(!Number.isFinite(numeric)){
      return 0;
    }
    const styleScale = clampScale(resolveStyleScale(scaleInfo));
    const zoomScaleRaw = Number(scaleInfo?.zoomScale);
    const zoomScale = Number.isFinite(zoomScaleRaw) && zoomScaleRaw > 0 ? zoomScaleRaw : 1;
    const zoomActive = Math.abs(zoomScale - 1) > 1e-4;
    const rawStyleScale = Number(scaleInfo?.styleUnclamped);
    const styleScaleForZoom = Number.isFinite(rawStyleScale) && rawStyleScale > 0 ? rawStyleScale : styleScale;
    const resizeOnlyScale = zoomActive
      ? clampScale(styleScaleForZoom / zoomScale)
      : styleScale;
    const lengthScale = zoomActive
      ? (Math.sqrt(resizeOnlyScale) * zoomScale)
      : Math.sqrt(styleScale);
    const scaled = numeric * lengthScale;
    const min = Number.isFinite(opts.min) ? opts.min : 0;
    const max = Number.isFinite(opts.max) ? opts.max : Infinity;
    const clamped = Math.min(max, Math.max(min, scaled));
    return clamped;
  };

  chartStyle.scaleRadius = function scaleRadius(base, scaleInfo, options){
    const opts = options || {};
    return chartStyle.scaleLength(base, scaleInfo, { ...opts, context: opts.context || 'radius' });
  };

  chartStyle.scaleStrokeWidth = function scaleStrokeWidth(base, scaleInfo, options){
    const opts = options || {};
    const min = Number.isFinite(opts.min) ? opts.min : 0;
    const max = Number.isFinite(opts.max) ? opts.max : Infinity;
    const numeric = Number(base);
    if(opts.exact === true){
      const exactValue = Number.isFinite(numeric) ? numeric : 0;
      const clampedExact = Math.min(max, Math.max(min, exactValue));
      return clampedExact;
    }
    const result = chartStyle.scaleLength(base, scaleInfo, { ...opts, min, max, context: opts.context || 'stroke' });
    return result;
  };

  chartStyle.estimateTickCount = function estimateTickCount(spanPx, options){
    const px = Number(spanPx);
    const fallback = Number.isFinite(options?.fallback) ? options.fallback : 6;
    if(!Number.isFinite(px) || px <= 0){
      const fallbackCount = Math.max(2, fallback);
      console.debug('Debug: chartStyle.estimateTickCount fallback', {
        spanPx: spanPx,
        fallback: fallbackCount,
        reason: 'invalid span',
        axis: options?.axis || 'generic'
      });
      return fallbackCount;
    }
    const baseSpacing = Number.isFinite(options?.baseSpacing) ? options.baseSpacing : 80;
    const minTicks = Number.isFinite(options?.min) ? options.min : 3;
    const maxTicks = Number.isFinite(options?.max) ? options.max : 12;
    const rawEstimate = px / Math.max(baseSpacing, 1);
    const rounded = Math.round(rawEstimate);
    const clamped = Math.min(maxTicks, Math.max(minTicks, rounded));
    const final = Math.max(2, Number.isFinite(clamped) ? clamped : fallback);
    console.debug('Debug: chartStyle.estimateTickCount', {
      spanPx: px,
      baseSpacing,
      rawEstimate,
      rounded,
      minTicks,
      maxTicks,
      final,
      axis: options?.axis || 'generic'
    }); // Debug: tick estimation trace
    return final;
  };

  chartStyle.measureText = function measureText(text, font){
    const canvas = getCanvas();
    if(!canvas){
      const fallback = (text || '').length * 8;
      console.warn('chartStyle.measureText fallback width', {text, fallback});
      return fallback;
    }
    const ctx = canvas.getContext('2d');
    ctx.font = font || chartStyle.makeFont(12);
    return ctx.measureText(text || '').width;
  };

  function parseFontSizePx(value, fallbackPx){
    const fallback = Number.isFinite(fallbackPx) && fallbackPx > 0 ? fallbackPx : 12;
    if(value === null || value === undefined || value === ''){
      return fallback;
    }
    if(typeof value === 'number'){
      return Number.isFinite(value) && value > 0 ? value : fallback;
    }
    const raw = String(value).trim();
    if(!raw){
      return fallback;
    }
    const match = raw.match(/^(-?\d*\.?\d+)\s*(px|pt)?$/i);
    if(!match){
      return fallback;
    }
    const numeric = Number(match[1]);
    if(!Number.isFinite(numeric) || numeric <= 0){
      return fallback;
    }
    const unit = (match[2] || 'px').toLowerCase();
    if(unit === 'pt'){
      return numeric * PT_TO_PX;
    }
    return numeric;
  }

  function extractFontSizePxFromFontSpec(fontSpec, fallbackPx){
    const fallback = Number.isFinite(fallbackPx) && fallbackPx > 0 ? fallbackPx : 12;
    if(typeof fontSpec !== 'string'){
      return fallback;
    }
    const raw = fontSpec.trim();
    if(!raw){
      return fallback;
    }
    const matches = raw.match(/(-?\d*\.?\d+)\s*(px|pt)\b/ig);
    if(!matches || !matches.length){
      return fallback;
    }
    const token = String(matches[matches.length - 1] || '').trim();
    if(!token){
      return fallback;
    }
    return parseFontSizePx(token, fallback);
  }

  chartStyle.resolveScopedLabelMeasureFont = function resolveScopedLabelMeasureFont(options){
    const opts = options || {};
    const styles = opts.styles && typeof opts.styles === 'object' ? opts.styles : null;
    const role = typeof opts.role === 'string' ? opts.role.trim() : '';
    const collection = typeof opts.collection === 'string' ? opts.collection.trim() : '';
    const fallbackPxRaw = Number(opts.fallbackPx);
    const fallbackPx = Number.isFinite(fallbackPxRaw) && fallbackPxRaw > 0 ? fallbackPxRaw : 12;
    const defaultFamily = typeof chartStyle.FONT_FAMILY === 'string' && chartStyle.FONT_FAMILY.trim()
      ? chartStyle.FONT_FAMILY.trim()
      : 'Arial, Helvetica, sans-serif';
    let fontSizePx = fallbackPx;
    let fontFamily = defaultFamily;
    let fontStyle = 'normal';
    let fontWeight = 'normal';
    const applyStyle = style => {
      if(!style || typeof style !== 'object'){
        return;
      }
      fontSizePx = parseFontSizePx(style.fontSize, fontSizePx);
      const family = typeof style.fontFamily === 'string' ? style.fontFamily.trim() : '';
      if(family){
        fontFamily = family;
      }
      const nextStyle = typeof style.fontStyle === 'string' ? style.fontStyle.trim() : '';
      if(nextStyle){
        fontStyle = nextStyle;
      }
      if(style.fontWeight !== null && style.fontWeight !== undefined){
        const nextWeight = String(style.fontWeight).trim();
        if(nextWeight){
          fontWeight = nextWeight;
        }
      }
    };
    if(styles){
      applyStyle(styles.__graph__);
      if(collection){
        applyStyle(styles[`__${collection}__`]);
      }
      if(role){
        applyStyle(styles[role]);
      }
    }
    const safeSize = Number.isFinite(fontSizePx) && fontSizePx > 0 ? fontSizePx : fallbackPx;
    const safeFamily = fontFamily || defaultFamily;
    const safeStyle = fontStyle || 'normal';
    const safeWeight = fontWeight || 'normal';
    const fontSpec = `${safeStyle} ${safeWeight} ${safeSize}px ${safeFamily}`;
    return {
      fontSpec,
      fontSizePx: safeSize,
      fontFamily: safeFamily,
      fontStyle: safeStyle,
      fontWeight: safeWeight
    };
  };

  /**
   * Unicode superscript digits for rendering exponents.
   * @type {Object<string, string>}
   */
  const SUPERSCRIPT_MAP = {
    '-': '⁻',
    '0': '⁰',
    '1': '¹',
    '2': '²',
    '3': '³',
    '4': '⁴',
    '5': '⁵',
    '6': '⁶',
    '7': '⁷',
    '8': '⁸',
    '9': '⁹'
  };

  /**
   * Tolerance for floating point comparison when determining integer mantissa.
   * @type {number}
   */
  const MANTISSA_INTEGER_TOLERANCE = 1e-9;

  /**
   * Default maximum decimal places for mantissas on compact chart axes.
   * Reporting contexts may opt into a higher limit without changing axis defaults.
   * @type {number}
   */
  const MANTISSA_MAX_DECIMALS = 2;

  /**
   * Convert a number string to Unicode superscript characters.
   * Only processes digits 0-9 and the minus sign; other characters pass through unchanged.
   * @param {string|number} num - The number to convert (e.g., "-3", "10")
   * @returns {string} - The superscript version (e.g., "⁻³", "¹⁰")
   */
  function toSuperscript(num){
    const str = String(num);
    let result = '';
    for(let i = 0; i < str.length; i++){
      const char = str[i];
      // Only map known characters; others pass through (shouldn't happen for valid exponents)
      result += SUPERSCRIPT_MAP[char] || char;
    }
    return result;
  }

  /**
   * Threshold for using scientific notation (absolute value >= this uses scientific notation)
   * @type {number}
   */
  const SCIENTIFIC_THRESHOLD_HIGH = 10000;

  /**
   * Threshold for small numbers (absolute value > 0 and <= this uses scientific notation).
   * Zero is handled separately and always formatted as "0".
   * @type {number}
   */
  const SCIENTIFIC_THRESHOLD_LOW = 0.001;

  /**
   * Format a number for axis tick labels, using scientific notation for
   * very large (>=10000) or very small (<=0.001 and >0) numbers unless
   * forceScientific is provided, which bypasses the thresholds.
   * Uses Unicode superscript for the exponent (e.g., 10³ instead of 10^3).
   *
   * Note: Zero is always formatted as "0", not in scientific notation.
   * The low threshold check excludes zero to avoid "0×10⁰" formatting.
   *
   * @param {number} value - The numeric value to format
   * @param {Object} [options] - Formatting options
   * @param {number} [options.maxDecimals=2] - Maximum decimal places for non-scientific notation.
   * @param {number} [options.mantissaMaxDecimals=2] - Maximum decimal places for the scientific mantissa.
   * @param {number} [options.thresholdHigh=10000] - Threshold above which to use scientific notation
   * @param {number} [options.thresholdLow=0.001] - Threshold at or below which to use scientific notation (for non-zero values)
   * @param {boolean} [options.forceScientific=false] - Always use scientific notation when true
   * @param {boolean} [options.spaceAroundMultiplication=false] - Render spaces around the multiplication sign.
   * @param {boolean} [options.omitUnitMantissa=true] - Omit a mantissa of ±1 (compact axis style).
   * @returns {string} - The formatted string representation
   */
  chartStyle.formatScientific = function formatScientific(value, options){
    const opts = options || {};
    const maxDecimals = Number.isFinite(opts.maxDecimals) ? Math.max(0, Math.min(15, opts.maxDecimals)) : 2;
    const mantissaMaxDecimals = Number.isFinite(opts.mantissaMaxDecimals)
      ? Math.max(0, Math.min(15, opts.mantissaMaxDecimals))
      : MANTISSA_MAX_DECIMALS;
    const thresholdHigh = Number.isFinite(opts.thresholdHigh) ? opts.thresholdHigh : SCIENTIFIC_THRESHOLD_HIGH;
    const thresholdLow = Number.isFinite(opts.thresholdLow) ? opts.thresholdLow : SCIENTIFIC_THRESHOLD_LOW;
    const forceScientific = opts.forceScientific === true;
    const multiplication = opts.spaceAroundMultiplication === true ? ' × ' : '×';
    const omitUnitMantissa = opts.omitUnitMantissa !== false;

    // Handle non-finite values
    if(!Number.isFinite(value)){
      return String(value);
    }

    // Handle zero specially - never use scientific notation for zero
    if(value === 0){
      return '0';
    }

    const absValue = Math.abs(value);

    // Check if scientific notation is needed.
    // For small values, we check absValue > 0 to exclude zero (already handled above).
    const needsScientific = forceScientific || absValue >= thresholdHigh || (absValue > 0 && absValue <= thresholdLow);

    if(needsScientific){
      // Calculate exponent
      const exponent = Math.floor(Math.log10(absValue));
      const mantissa = value / Math.pow(10, exponent);

      // Format mantissa with appropriate precision
      // Mantissa decimals capped at MANTISSA_MAX_DECIMALS for axis readability
      let mantissaStr;
      if(Math.abs(mantissa - Math.round(mantissa)) < MANTISSA_INTEGER_TOLERANCE){
        // Integer mantissa
        mantissaStr = String(Math.round(mantissa));
      }else{
        // Decimal mantissa - compact axes keep the default cap; reporting may request more precision.
        mantissaStr = mantissa.toFixed(Math.min(mantissaMaxDecimals, maxDecimals));
        // Remove trailing zeros after decimal point
        mantissaStr = mantissaStr.replace(/\.?0+$/, '');
      }

      // Format: mantissa × 10ⁿ. Compact axes may omit a unit mantissa; reports retain it.
      const superExp = toSuperscript(exponent);
      if(omitUnitMantissa && mantissaStr === '1'){
        return `10${superExp}`;
      }else if(omitUnitMantissa && mantissaStr === '-1'){
        return `−10${superExp}`;
      }
      const normalizedMantissa = mantissaStr.startsWith('-') ? `−${mantissaStr.slice(1)}` : mantissaStr;
      return `${normalizedMantissa}${multiplication}10${superExp}`;
    }

    // Standard formatting for regular numbers
    // Use toLocaleString for nice formatting without excessive decimals
    const formatted = value.toLocaleString('en-US', {
      maximumFractionDigits: maxDecimals,
      useGrouping: false
    });

    return formatted;
  };

  function formatDecimal(value, options){
    if(!Number.isFinite(value)){
      return String(value);
    }
    const opts = options || {};
    const maxDigits = Number.isFinite(opts.maxDecimals) ? Math.min(12, Math.max(0, opts.maxDecimals)) : 6;
    const minDigits = Number.isFinite(opts.minDecimals) ? Math.max(0, Math.min(maxDigits, opts.minDecimals)) : 0;
    const digits = Math.max(minDigits, maxDigits);
    let text;
    try{
      text = value.toFixed(digits);
    }catch(err){
      text = String(value);
    }
    if(text && text.indexOf('e') !== -1){
      // Fallback when toFixed resorts to exponential form
      text = Number(value).toLocaleString('en-US', {
        useGrouping: false,
        maximumFractionDigits: digits,
        minimumFractionDigits: minDigits
      });
    }
    if(opts.trimTrailingZeros !== false){
      text = text.replace(/\.0+$/,'').replace(/(\.\d*?[1-9])0+$/,'$1');
    }
    if(text === '-0'){
      return '0';
    }
    return text;
  }

  chartStyle.formatDecimal = formatDecimal;

  const AXIS_NOTATION_ALLOWED = new Set(['auto','decimal','scientific']);

  function normalizeAxisNotation(value){
    if(typeof value !== 'string'){ return 'auto'; }
    const trimmed = value.trim().toLowerCase();
    return AXIS_NOTATION_ALLOWED.has(trimmed) ? trimmed : 'auto';
  }

  /**
   * Format axis ticks using the requested notation mode.
   * @param {number} value
   * @param {Object} [options]
   * @param {'auto'|'decimal'|'scientific'} [options.notation='auto']
   * @param {number} [options.maxDecimals=2]
   * @param {number} [options.decimalDigits]
   * @returns {string}
   */
  chartStyle.formatAxisValue = function formatAxisValue(value, options){
    const opts = options || {};
    const notation = normalizeAxisNotation(opts.notation);
    if(notation === 'scientific'){
      return chartStyle.formatScientific(value, {
        ...opts,
        forceScientific: true
      });
    }
    if(notation === 'decimal'){
      const decimalDigits = Number.isFinite(opts.decimalDigits)
        ? Math.max(0, Math.min(12, opts.decimalDigits))
        : Math.max(4, Math.min(8, (Number.isFinite(opts.maxDecimals) ? opts.maxDecimals + 4 : 6)));
      return formatDecimal(value, {
        maxDecimals: decimalDigits,
        trimTrailingZeros: opts.trimTrailingZeros !== false
      });
    }
    return chartStyle.formatScientific(value, opts);
  };

  /**
   * Create a tick formatter function that uses scientific notation
   * for very large or very small values.
   *
   * @param {Object} [options] - Options to pass to formatScientific
   * @returns {function(number): string} - A formatter function
   */
  chartStyle.createTickFormatter = function createTickFormatter(options){
    const opts = options || {};
    return function formatTick(value){
      return chartStyle.formatScientific(value, opts);
    };
  };

  const DEFAULT_MAJOR_TICK_LENGTH = 6;
  chartStyle.DEFAULT_MAJOR_TICK_LENGTH = DEFAULT_MAJOR_TICK_LENGTH;

  chartStyle.normalizeOptionalMajorTickLength = function normalizeOptionalMajorTickLength(value){
    if(value === null || value === undefined || value === ''){
      return null;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 && numeric <= 100 ? numeric : null;
  };

  chartStyle.resolveTickLabelGap = function resolveTickLabelGap(fontSize){
    const safeFont = Number(fontSize) || BASE_FONT_SIZE_PX;
    return Math.max(2, Math.round(safeFont * 0.2));
  };

  chartStyle.createAxisMetrics = function createAxisMetrics(fontSize, scaleInfo){
    const safeFont = Number(fontSize) || BASE_FONT_SIZE_PX;
    const hasScaleInfo = !!(scaleInfo && (Number.isFinite(scaleInfo.styleScale) || Number.isFinite(scaleInfo.scale)));
    const resizeScale = hasScaleInfo ? clampScale(resolveStyleScale(scaleInfo)) : 1;
    const baseMetrics = {
      tickLength: DEFAULT_MAJOR_TICK_LENGTH,
      tickLabelGap: chartStyle.resolveTickLabelGap(safeFont),
      axisTitleGap: Math.max(4, Math.round(safeFont * 0.75)),
      outerPadding: Math.max(6, Math.round(safeFont * 0.6)),
      yTitleGap: Math.max(4, Math.round(safeFont * 0.5))
    };
    const scaleMetric = (base, min) => Math.max(min, base * resizeScale);
    const tickLengthRaw = scaleMetric(baseMetrics.tickLength, 1);
    const tickLengthPx = Math.max(1, Math.floor(tickLengthRaw));
    const metrics = hasScaleInfo
      ? {
          tickLength: tickLengthPx,
          tickLabelGap: scaleMetric(baseMetrics.tickLabelGap, 1.5),
          axisTitleGap: scaleMetric(baseMetrics.axisTitleGap, 1.5),
          outerPadding: scaleMetric(baseMetrics.outerPadding, 2),
          yTitleGap: scaleMetric(baseMetrics.yTitleGap, 1.5)
        }
      : baseMetrics;
    console.debug('Debug: chartStyle.createAxisMetrics',{
      fontSize:safeFont,
      hasScaleInfo,
      scale: scaleInfo?.styleScale ?? scaleInfo?.scale ?? null,
      resizeScale,
      baseMetrics,
      tickLengthRaw,
      tickLengthPx,
      metrics
    }); // Debug: axis metric computation
    return metrics;
  };

  chartStyle.computeBottomLayout = function computeBottomLayout(options){
    const labels = options?.labels || [];
    const fontSize = options?.fontSize || 12;
    const plotWidth = options?.plotWidth || 0;
    const axisMetrics = options?.axisMetrics || chartStyle.createAxisMetrics(fontSize);
    const tickLength = axisMetrics.tickLength ?? DEFAULT_MAJOR_TICK_LENGTH;
    const tickLabelGap = axisMetrics.tickLabelGap ?? chartStyle.resolveTickLabelGap(fontSize);
    const axisTitleGap = axisMetrics.axisTitleGap ?? Math.max(4, Math.round(fontSize * 0.75));
    const outerPadding = axisMetrics.outerPadding ?? Math.max(6, Math.round(fontSize * 0.6));
    const baseLabelOffset = tickLength + tickLabelGap;
    const customMeasureFontRaw = typeof options?.labelMeasureFont === 'string' ? options.labelMeasureFont.trim() : '';
    const labelMeasureFont = customMeasureFontRaw || chartStyle.makeFont(fontSize);
    const explicitLabelFontSize = Number(options?.labelFontSizePx);
    const tickLabelFontSize = (Number.isFinite(explicitLabelFontSize) && explicitLabelFontSize > 0)
      ? explicitLabelFontSize
      : extractFontSizePxFromFontSpec(labelMeasureFont, fontSize);
    const adjustedLabelOffset = baseLabelOffset + tickLabelFontSize;
    const includeAxisTitleReserve = options?.includeAxisTitleReserve !== false;
    const axisTitleReserve = includeAxisTitleReserve ? axisTitleGap + fontSize : 0;
    const nominalTitleOffset = adjustedLabelOffset + axisTitleReserve;
    const labelReserveMarginRaw = Number(options?.labelReserveMarginPx);
    const labelReserveMarginPx = Number.isFinite(labelReserveMarginRaw) && labelReserveMarginRaw >= 0
      ? labelReserveMarginRaw
      : outerPadding;
    const baseBottom = options?.baseBottom || Math.max(
      nominalTitleOffset + labelReserveMarginPx,
      Math.round(fontSize * BASE_BOTTOM_FACTOR) + tickLabelFontSize + 8
    );
    const widths = labels.map(label => chartStyle.measureText(label || '', labelMeasureFont));
    const maxLabelWidth = widths.length ? Math.max(...widths) : 0;
    const explicitBandWidth = Number(options?.bandWidth);
    const bandWidth = labels.length
      ? (
          Number.isFinite(explicitBandWidth) && explicitBandWidth > 0
            ? explicitBandWidth
            : plotWidth / labels.length
        )
      : plotWidth;
    const maxLabelWidthRatio = labels.length > 1 && Number.isFinite(bandWidth) && bandWidth > 0
      ? (maxLabelWidth / bandWidth)
      : 0;
    let maxAdjacentOverlapRatio = 0;
    if(labels.length > 1 && Number.isFinite(bandWidth) && bandWidth > 0){
      for(let i = 1; i < widths.length; i += 1){
        const leftWidth = Number(widths[i - 1]) || 0;
        const rightWidth = Number(widths[i]) || 0;
        const pairHalfSpan = (leftWidth + rightWidth) / 2;
        const overlapRatio = pairHalfSpan / bandWidth;
        if(overlapRatio > maxAdjacentOverlapRatio){
          maxAdjacentOverlapRatio = overlapRatio;
        }
      }
    }
    const rotationHysteresis = options?.rotationHysteresis && typeof options.rotationHysteresis === 'object'
      ? options.rotationHysteresis
      : null;
    const previousRotate = rotationHysteresis ? (rotationHysteresis.previousRotate === true) : null;
    const baseRotateRatioRaw = Number(options?.rotateRatioThreshold);
    const baseRotateRatio = Number.isFinite(baseRotateRatioRaw) && baseRotateRatioRaw > 0
      ? baseRotateRatioRaw
      : 1.0;
    const enterRatioRaw = Number(rotationHysteresis?.enterRatio);
    const enterRatio = Number.isFinite(enterRatioRaw) && enterRatioRaw > 0
      ? enterRatioRaw
      : baseRotateRatio;
    const exitRatioRaw = Number(rotationHysteresis?.exitRatio);
    const fallbackExitRatio = Math.max(0.1, enterRatio - 0.08);
    let exitRatio = Number.isFinite(exitRatioRaw) && exitRatioRaw > 0
      ? exitRatioRaw
      : fallbackExitRatio;
    if(exitRatio >= enterRatio){
      exitRatio = Math.max(0.1, enterRatio - 0.01);
    }
    // Cartesian transaction users reserve the possible rotated projection from
    // the first render. Rotation may still switch later, but that switch must
    // not make the SVG envelope jump. Legacy callers keep their opt-in policy.
    const preservePlotRail = options?.preservePlotRail === true;
    const reserveRotatedLabelSpace = typeof options?.reserveRotatedLabelSpace === 'boolean'
      ? options.reserveRotatedLabelSpace
      : preservePlotRail;
    const projectedTickLabelReserve = options?.bottomReserveMode === 'projected-tick-label'
      || preservePlotRail;
    const shouldRotateRaw = labels.length > 1 && maxAdjacentOverlapRatio > baseRotateRatio;
    const shouldRotate = labels.length > 1
      ? (
          previousRotate === true
            ? (maxAdjacentOverlapRatio > exitRatio)
            : (maxAdjacentOverlapRatio > enterRatio)
        )
      : false;
    const rotationAngleDegRaw = Number(options?.labelRotationAngleDeg);
    const rotationAngleDeg = Number.isFinite(rotationAngleDegRaw) ? Math.abs(rotationAngleDegRaw) : 45;
    const rotationAngleRad = rotationAngleDeg * Math.PI / 180;
    const projectedRotatedLabelHeight = Math.ceil(
      Math.abs(Math.sin(rotationAngleRad)) * maxLabelWidth
      + Math.abs(Math.cos(rotationAngleRad)) * tickLabelFontSize
    );
    const rotatedLabelHorizontalProjections = widths.map(width => Math.ceil(
      Math.abs(Math.cos(rotationAngleRad)) * width
      + Math.abs(Math.sin(rotationAngleRad)) * tickLabelFontSize
    ));
    const rotatedExtra = projectedTickLabelReserve
      ? Math.max(0, projectedRotatedLabelHeight - tickLabelFontSize)
      : Math.min(220, Math.max(tickLabelFontSize * 1.8, Math.ceil(Math.SQRT1_2 * maxLabelWidth) + tickLabelFontSize));
    const activeExtra = shouldRotate ? rotatedExtra : 0;
    const reservedExtra = (shouldRotate || reserveRotatedLabelSpace) ? rotatedExtra : 0;
    const requiredBottom = preservePlotRail
      // baseBottom is the complete nominal tick/title rail. Keep the entire
      // possible rotation displacement outside that rail so pre-existing slack
      // cannot consume the proactive reserve and make the envelope jump later.
      ? baseBottom + reservedExtra
      : (
          projectedTickLabelReserve
            ? Math.max(baseBottom, adjustedLabelOffset + axisTitleReserve + labelReserveMarginPx + reservedExtra)
            : Math.max(baseBottom, nominalTitleOffset + outerPadding + reservedExtra)
        );
    // Cartesian transaction users keep the nominal plot rail fixed and render
    // the measured excess outside the canonical user frame. Legacy/excluded
    // layouts retain the historical content-dependent bottom margin.
    const bottom = preservePlotRail ? baseBottom : requiredBottom;
    // Keep the title at its normal position until labels actually rotate. The
    // proactive reserve is an outward envelope allowance, not an active gap.
    const titleOffset = preservePlotRail
      ? adjustedLabelOffset + activeExtra + axisTitleReserve
      : nominalTitleOffset;
    console.debug('Debug: chartStyle.computeBottomLayout', {
      labelCount: labels.length,
      fontSize,
      plotWidth,
      shouldRotate,
      shouldRotateRaw,
      maxLabelWidthRatio,
      maxAdjacentOverlapRatio,
      previousRotate,
      enterRatio,
      exitRatio,
      reserveRotatedLabelSpace,
      projectedTickLabelReserve,
      includeAxisTitleReserve,
      labelMeasureFont,
      tickLabelFontSize,
      labelReserveMarginPx,
      activeExtra,
      reservedExtra,
      rotatedExtra,
      projectedRotatedLabelHeight,
      rotatedLabelHorizontalProjections,
      bottom,
      requiredBottom,
      preservePlotRail,
      labelOffset: adjustedLabelOffset,
      titleOffset,
      tickLength
    }); // Debug: bottom layout computation
    return {bottom, requiredBottom, contentReserveBottom: Math.max(0, requiredBottom - baseBottom), shouldRotate, shouldRotateRaw, widths, bandWidth, maxLabelWidth, maxLabelWidthRatio, maxAdjacentOverlapRatio, projectedRotatedLabelHeight, rotatedExtra, activeExtra, reservedExtra, rotatedLabelHorizontalProjections, labelOffset: adjustedLabelOffset, titleOffset, nominalTitleOffset, tickLength, tickLabelGap, axisTitleGap, outerPadding, labelMeasureFont, tickLabelFontSize};
  };

  chartStyle.resolveRotatedXAxisLeadingInset = function resolveRotatedXAxisLeadingInset(bottomLayout, marginLeft){
    if(bottomLayout?.shouldRotate !== true){
      return 0;
    }
    const firstProjection = Number(bottomLayout?.rotatedLabelHorizontalProjections?.[0]);
    if(!Number.isFinite(firstProjection) || firstProjection <= 0){
      return 0;
    }
    const safeMarginLeft = Math.max(0, Number(marginLeft) || 0);
    const firstTickOffset = Math.max(0, (Number(bottomLayout?.bandWidth) || 0) / 2);
    const outerPadding = Math.max(0, Number(bottomLayout?.outerPadding) || 0);
    const requiredInset = firstProjection + outerPadding - safeMarginLeft - firstTickOffset;
    return requiredInset > 0 ? Math.ceil(requiredInset) + 4 : 0;
  };

  function readAxisLabelLengthPx(value, fontSize){
    const raw = String(value == null ? '' : value).trim();
    const numeric = Number.parseFloat(raw);
    if(!Number.isFinite(numeric)){
      return 0;
    }
    if(/em$/i.test(raw)){
      return numeric * fontSize;
    }
    if(/rem$/i.test(raw)){
      return numeric * BASE_FONT_SIZE_PX;
    }
    return numeric;
  }

  function readAxisLabelFontSizePx(node){
    const candidates = [
      node?.getAttribute?.('font-size'),
      node?.style?.fontSize
    ];
    if(typeof global.getComputedStyle === 'function' && node){
      try{
        candidates.push(global.getComputedStyle(node).fontSize);
      }catch(_err){
        // Detached SVG labels retain their explicit font-size fallback.
      }
    }
    for(let index = 0; index < candidates.length; index += 1){
      const value = Number.parseFloat(candidates[index]);
      if(Number.isFinite(value) && value > 0){
        return value;
      }
    }
    return BASE_FONT_SIZE_PX;
  }

  chartStyle.resolveRotatedTickLabelDy = function resolveRotatedTickLabelDy(options){
    const angle = Number(options?.angle) || 0;
    const fontSize = Math.max(1, Number(options?.fontSize) || BASE_FONT_SIZE_PX);
    const baseDy = readAxisLabelLengthPx(options?.dy, fontSize);
    const cosine = Math.abs(Math.cos(angle * Math.PI / 180));
    if(cosine < 0.25 || cosine > 0.9999){
      return baseDy;
    }
    const ascent = fontSize * 0.8;
    return ascent + ((baseDy - ascent) / cosine);
  };

  chartStyle.applyLabelOrientation = function applyLabelOrientation(nodes, options){
    const list = Array.from(nodes || []);
    if(!list.length){
      console.debug('Debug: chartStyle.applyLabelOrientation skipped (no labels)');
      return false;
    }
    const angle = options?.angle ?? -45;
    const anchor = options?.anchor ?? 'end';
    const dy = options?.dy ?? '0.35em';
    const preserveOpticalGap = options?.preserveOpticalGap !== false;
    const force = options?.force ?? false;
    const disableAuto = options?.disableAuto === true;
    let rotate = !!force;
    if(!rotate && !disableAuto){
      for(let i=1;i<list.length;i+=1){
        const prev = list[i-1];
        const curr = list[i];
        if(prev?.getBBox && curr?.getBBox){
          const prevBox = prev.getBBox();
          const currBox = curr.getBBox();
          if(prevBox.x + prevBox.width > currBox.x){
            rotate = true;
            break;
          }
        }
      }
    }
    if(rotate){
      list.forEach(node => {
        if(!node) return;
        const x = node.getAttribute('x');
        const y = node.getAttribute('y');
        if(x==null || y==null) return;
        const pivotX = Number(x);
        const pivotY = Number(y);
        let unrotatedBox = null;
        if(preserveOpticalGap && typeof node.getBBox === 'function'){
          try{
            const measured = node.getBBox();
            if(measured && Number.isFinite(measured.y) && Number.isFinite(measured.height) && measured.height > 0){
              unrotatedBox = measured;
            }
          }catch(_err){
            unrotatedBox = null;
          }
        }
        node.setAttribute('text-anchor', anchor);
        if(dy !== null){
          node.setAttribute('dy', dy);
        }
        if(preserveOpticalGap && dy !== null && Number.isFinite(pivotX) && Number.isFinite(pivotY)){
          const fontSize = readAxisLabelFontSizePx(node);
          let adjustedDy = chartStyle.resolveRotatedTickLabelDy({ angle, dy, fontSize });
          if(unrotatedBox && typeof node.getBBox === 'function'){
            try{
              const anchoredBox = node.getBBox();
              const radians = angle * Math.PI / 180;
              const sine = Math.sin(radians);
              const cosine = Math.cos(radians);
              if(anchoredBox && Number.isFinite(anchoredBox.x) && Number.isFinite(anchoredBox.y)
                && Number.isFinite(anchoredBox.width) && Number.isFinite(anchoredBox.height)
                && Math.abs(cosine) >= 0.25){
                const xs = [anchoredBox.x, anchoredBox.x + anchoredBox.width];
                const ys = [anchoredBox.y, anchoredBox.y + anchoredBox.height];
                let rotatedTop = Infinity;
                xs.forEach(boxX => {
                  ys.forEach(boxY => {
                    const transformedY = pivotY
                      + ((boxX - pivotX) * sine)
                      + ((boxY - pivotY) * cosine);
                    rotatedTop = Math.min(rotatedTop, transformedY);
                  });
                });
                const currentDy = readAxisLabelLengthPx(dy, fontSize);
                if(Number.isFinite(rotatedTop)){
                  adjustedDy = currentDy + ((unrotatedBox.y - rotatedTop) / cosine);
                }
              }
            }catch(_err){
              // Use the deterministic font-metric fallback above.
            }
          }
          if(Number.isFinite(adjustedDy)){
            node.setAttribute('dy', `${Number(adjustedDy.toFixed(4))}px`);
          }
        }
        node.setAttribute('transform', `rotate(${angle} ${x} ${y})`);
      });
    }
    console.debug('Debug: chartStyle.applyLabelOrientation result', {count: list.length, rotated: rotate, angle, disableAuto}); // Debug: label orientation summary
    return rotate;
  };

  function axisTicksDebug(label, payload){
    try{
      if(typeof Shared.isDebugEnabled === 'function' && !Shared.isDebugEnabled()){
        return;
      }
    }catch(err){
      // Ignore debug toggle lookup failures and log by default
    }
    console.debug(label, payload);
  }

  function normalizePrecision(value){
    if(!Number.isFinite(value)){
      return value;
    }
    return Number.parseFloat(value.toPrecision(12));
  }

  function clampTickTarget(value){
    if(!Number.isFinite(value)){
      return 6;
    }
    const rounded = Math.round(value);
    return Math.max(5, Math.min(8, rounded));
  }

  function selectTickStep(span, targetCount, manualSpan){
    const safeSpan = Number.isFinite(span) && span > 0 ? span : 1;
    const safeTarget = Number.isFinite(targetCount) && targetCount > 1 ? targetCount : 6;
    const approxStep = safeSpan / Math.max(safeTarget - 1, 1);
    let baseExp = Math.floor(Math.log10(Math.abs(approxStep)));
    if(!Number.isFinite(baseExp)){
      baseExp = 0;
    }
    const multipliers = [1, 2, 2.5, 5, 10];
    let best = null;
    const manualSpanFinite = Number.isFinite(manualSpan) && manualSpan > 0;
    for(let exp = baseExp - 1; exp <= baseExp + 1; exp += 1){
      const pow = Math.pow(10, exp);
      for(let i = 0; i < multipliers.length; i += 1){
        const step = multipliers[i] * pow;
        if(!Number.isFinite(step) || step <= 0){
          continue;
        }
        const tickEstimate = Math.ceil(safeSpan / step) + 1;
        const tickCount = Math.max(2, tickEstimate);
        const diffScore = Math.abs(tickCount - safeTarget);
        const rangePenalty = (tickCount < 5 || tickCount > 8) ? 2 : 0;
        let manualPenalty = 0;
        if(manualSpanFinite){
          const multiples = manualSpan / step;
          const nearest = Math.round(multiples);
          manualPenalty = Math.min(Math.abs(multiples - nearest), 0.5);
        }
        const score = diffScore + rangePenalty + manualPenalty;
        if(!best || score < best.score - 1e-9 || (Math.abs(score - best.score) <= 1e-9 && step < best.step)){
          best = { step, score };
        }
      }
    }
    if(best){
      return best.step;
    }
    const fallbackStep = multipliers[0] * Math.pow(10, baseExp);
    return Number.isFinite(fallbackStep) && fallbackStep > 0 ? fallbackStep : 1;
  }

  function buildAxisScale(options){
    const {
      dataMin,
      dataMax,
      manualMin,
      manualMax,
      targetTickCount,
      fixedStep
    } = options || {};
    const manualMinFinite = Number.isFinite(manualMin);
    const manualMaxFinite = Number.isFinite(manualMax);
    let normalizedManualMin = manualMinFinite ? manualMin : NaN;
    let normalizedManualMax = manualMaxFinite ? manualMax : NaN;
    if(manualMinFinite && manualMaxFinite && normalizedManualMax < normalizedManualMin){
      const swap = normalizedManualMin;
      normalizedManualMin = normalizedManualMax;
      normalizedManualMax = swap;
    }
    const dataMinFinite = Number.isFinite(dataMin);
    const dataMaxFinite = Number.isFinite(dataMax);
    let normalizedDataMin = dataMinFinite ? dataMin : NaN;
    let normalizedDataMax = dataMaxFinite ? dataMax : NaN;
    if(dataMinFinite && dataMaxFinite && normalizedDataMax < normalizedDataMin){
      const swap = normalizedDataMin;
      normalizedDataMin = normalizedDataMax;
      normalizedDataMax = swap;
    }
    const baseLowerCandidates = [];
    const baseUpperCandidates = [];
    if(Number.isFinite(normalizedDataMin)){ baseLowerCandidates.push(normalizedDataMin); }
    if(Number.isFinite(normalizedDataMax)){ baseUpperCandidates.push(normalizedDataMax); }
    if(manualMinFinite){ baseLowerCandidates.push(normalizedManualMin); }
    if(manualMaxFinite){ baseUpperCandidates.push(normalizedManualMax); }
    let baseLower = baseLowerCandidates.length ? Math.min(...baseLowerCandidates) : 0;
    let baseUpper = baseUpperCandidates.length ? Math.max(...baseUpperCandidates) : (baseLower + 1);
    if(!Number.isFinite(baseUpper) || baseUpper <= baseLower){
      const offset = Math.max(Math.abs(baseLower), 1);
      baseUpper = baseLower + offset;
    }
    const requiredLower = manualMinFinite ? normalizedManualMin : baseLower;
    const requiredUpper = manualMaxFinite ? normalizedManualMax : baseUpper;
    const spanCandidates = [];
    if(Number.isFinite(normalizedDataMin) && Number.isFinite(normalizedDataMax)){
      spanCandidates.push(Math.abs(normalizedDataMax - normalizedDataMin));
    }
    spanCandidates.push(Math.abs(requiredUpper - requiredLower));
    const spanValues = spanCandidates.filter(v => Number.isFinite(v) && v > 0);
    const span = spanValues.length ? Math.max(...spanValues) : 1;
    if(!spanValues.length){
      axisTicksDebug('Debug: chartStyle.axisTicks span fallback',{
        dataMin,
        dataMax,
        manualMin: manualMinFinite ? normalizedManualMin : null,
        manualMax: manualMaxFinite ? normalizedManualMax : null,
        requiredLower,
        requiredUpper
      });
    }
    const manualSpan = manualMinFinite && manualMaxFinite
      ? Math.abs(normalizedManualMax - normalizedManualMin)
      : NaN;
    const step = Number.isFinite(fixedStep) && fixedStep > 0
      ? fixedStep
      : selectTickStep(span, clampTickTarget(targetTickCount), manualSpan);
    const tolerance = Math.max(Math.abs(step) * 1e-9, 1e-9);
    const ticks = [];
    const maxGuard = 8192;
    if(manualMinFinite){
      let current = normalizedManualMin;
      let guard = 0;
      while(current <= requiredUpper + tolerance && guard < maxGuard){
        ticks.push(normalizePrecision(current));
        current += step;
        guard += 1;
      }
      if(ticks.length){
        const last = ticks[ticks.length - 1];
        if(last < requiredUpper - tolerance){
          ticks.push(normalizePrecision(last + step));
        }
      }
      if(manualMaxFinite && ticks.length){
        const lastIdx = ticks.length - 1;
        if(Math.abs(ticks[lastIdx] - normalizedManualMax) <= tolerance){
          ticks[lastIdx] = normalizePrecision(normalizedManualMax);
        }
      }
    }else if(manualMaxFinite){
      let current = normalizedManualMax;
      let guard = 0;
      while(current >= requiredLower - tolerance && guard < maxGuard){
        ticks.unshift(normalizePrecision(current));
        current -= step;
        guard += 1;
      }
      if(ticks.length){
        if(ticks[0] > requiredLower + tolerance){
          ticks.unshift(normalizePrecision(ticks[0] - step));
        }
        const lastIdx = ticks.length - 1;
        ticks[lastIdx] = normalizePrecision(normalizedManualMax);
      }
    }else{
      const baseStartReference = Number.isFinite(normalizedDataMin) ? normalizedDataMin : requiredLower;
      let start = Math.floor(baseStartReference / step) * step;
      if(!Number.isFinite(start)){
        start = baseStartReference;
      }
      let current = start;
      let guard = 0;
      while(current <= requiredUpper + tolerance && guard < maxGuard){
        ticks.push(normalizePrecision(current));
        current += step;
        guard += 1;
      }
      if(ticks.length){
        const last = ticks[ticks.length - 1];
        if(last < requiredUpper - tolerance){
          ticks.push(normalizePrecision(last + step));
        }
        if(ticks[0] > requiredLower + tolerance){
          ticks.unshift(normalizePrecision(ticks[0] - step));
        }
      }
    }
    if(!ticks.length){
      ticks.push(normalizePrecision(requiredLower));
    }
    if(ticks.length === 1){
      ticks.push(normalizePrecision(ticks[0] + step));
    }
    ticks.sort((a, b) => a - b);
    if(manualMinFinite){
      ticks[0] = normalizePrecision(normalizedManualMin);
    }else if(ticks[0] > requiredLower + tolerance){
      ticks.unshift(normalizePrecision(ticks[0] - step));
    }
    const lastTick = ticks[ticks.length - 1];
    if(manualMaxFinite){
      if(Math.abs(lastTick - normalizedManualMax) <= tolerance){
        ticks[ticks.length - 1] = normalizePrecision(normalizedManualMax);
      }else if(lastTick < normalizedManualMax - tolerance){
        ticks.push(normalizePrecision(lastTick + step));
        ticks[ticks.length - 1] = normalizePrecision(ticks[ticks.length - 1]);
      }
    }else if(lastTick < requiredUpper - tolerance){
      ticks.push(normalizePrecision(lastTick + step));
    }
    if(ticks.length === 1){
      ticks.push(normalizePrecision(ticks[0] + step));
    }
    ticks.sort((a, b) => a - b);
    const cleanTicks = ticks.filter(v => Number.isFinite(v)).map(normalizePrecision);
    const minTick = cleanTicks[0];
    const maxTick = cleanTicks[cleanTicks.length - 1];
    const finalMin = Number.isFinite(minTick) ? minTick : requiredLower;
    const finalMax = Number.isFinite(maxTick) ? maxTick : requiredUpper;
    axisTicksDebug('Debug: chartStyle.axisTicks scale computed',{
      dataMin,
      dataMax,
      manualMin: manualMinFinite ? normalizedManualMin : null,
      manualMax: manualMaxFinite ? normalizedManualMax : null,
      step,
      tickCount: cleanTicks.length,
      min: finalMin,
      max: finalMax
    });
    return {
      min: finalMin,
      max: finalMax,
      ticks: cleanTicks,
      step
    };
  }

  function applyLogTicks(scale, options){
    if(!scale || typeof scale !== 'object'){
      return false;
    }
    const manualMin = Number.isFinite(options?.manualMin) ? options.manualMin : null;
    const manualMax = Number.isFinite(options?.manualMax) ? options.manualMax : null;
    const fallbackMin = Number.isFinite(options?.fallbackMin) ? options.fallbackMin : null;
    const fallbackMax = Number.isFinite(options?.fallbackMax) ? options.fallbackMax : null;
    let resolvedMin = Number.isFinite(scale.min) ? scale.min : fallbackMin;
    let resolvedMax = Number.isFinite(scale.max) ? scale.max : fallbackMax;
    const autoRangeSource = { min: 'scale', max: 'scale' };
    if(manualMin === null && Number.isFinite(fallbackMin)){
      resolvedMin = fallbackMin;
      autoRangeSource.min = 'fallback';
    }
    if(manualMax === null && Number.isFinite(fallbackMax)){
      resolvedMax = fallbackMax;
      autoRangeSource.max = 'fallback';
    }
    if((autoRangeSource.min !== 'scale' || autoRangeSource.max !== 'scale') && (fallbackMin !== null || fallbackMax !== null)){
      axisTicksDebug('Debug: chartStyle.axisTicks log range source',{
        resolvedMin,
        resolvedMax,
        fallbackMin,
        fallbackMax,
        scaleMin: Number.isFinite(scale.min) ? scale.min : null,
        scaleMax: Number.isFinite(scale.max) ? scale.max : null,
        manualMinApplied: manualMin !== null,
        manualMaxApplied: manualMax !== null,
        source: autoRangeSource
      });
    }
    if(!Number.isFinite(resolvedMin) || !Number.isFinite(resolvedMax) || resolvedMin >= resolvedMax){
      return false;
    }
    const epsilon = Math.max(1e-9, Math.abs(resolvedMax - resolvedMin) * 1e-6);
    if(manualMin === null){
      const alignedMin = Math.floor(resolvedMin - epsilon);
      if(Number.isFinite(alignedMin)){
        scale.min = alignedMin;
        resolvedMin = alignedMin;
      }
    }else{
      scale.min = manualMin;
      resolvedMin = manualMin;
    }
    if(Object.is(scale.min, -0)){
      scale.min = 0;
      resolvedMin = 0;
    }
    if(manualMax === null){
      const alignedMax = Math.ceil(resolvedMax + epsilon);
      if(Number.isFinite(alignedMax)){
        scale.max = alignedMax;
        resolvedMax = alignedMax;
      }
    }else{
      scale.max = manualMax;
      resolvedMax = manualMax;
    }
    if(Object.is(scale.max, -0)){
      scale.max = 0;
      resolvedMax = 0;
    }
    if(!Number.isFinite(resolvedMin) || !Number.isFinite(resolvedMax) || resolvedMin >= resolvedMax){
      return false;
    }
    const tickStart = Math.ceil(resolvedMin - epsilon);
    const tickEnd = Math.floor(resolvedMax + epsilon);
    if(tickStart > tickEnd){
      return false;
    }
    const ticks = [];
    for(let exp = tickStart; exp <= tickEnd; exp += 1){
      ticks.push(exp);
    }
    if(!ticks.length){
      return false;
    }
    const normalizedTicks = ticks.map(value => (Object.is(value, -0) ? 0 : value));
    scale.ticks = normalizedTicks;
    scale.step = 1;
    axisTicksDebug('Debug: chartStyle.axisTicks log override',{
      min: resolvedMin,
      max: resolvedMax,
      tickCount: normalizedTicks.length,
      manualMinApplied: manualMin !== null,
      manualMaxApplied: manualMax !== null
    });
    return true;
  }

  chartStyle.axisTicks = Object.freeze({
    clampTickTarget,
    selectStep: selectTickStep,
    buildScale: buildAxisScale,
    applyLogTicks
  });

  const DEFAULT_MINOR_TICK_SUBDIVISIONS = 3;
  chartStyle.DEFAULT_MINOR_TICK_SUBDIVISIONS = DEFAULT_MINOR_TICK_SUBDIVISIONS;

  chartStyle.computeMinorTickPositions = function computeMinorTickPositions(options){
    const opts = options || {};
    const majorTicks = Array.isArray(opts.majorTicks)
      ? opts.majorTicks.filter(v => Number.isFinite(v)).slice().sort((a, b) => a - b)
      : [];
    if(majorTicks.length < 2){
      return [];
    }
    const min = Number.isFinite(opts.min) ? opts.min : majorTicks[0];
    const max = Number.isFinite(opts.max) ? opts.max : majorTicks[majorTicks.length - 1];
    const scale = opts.scale === 'log' ? 'log' : 'linear';
    const subdivisionsRaw = Number.isFinite(opts.subdivisions) ? opts.subdivisions : DEFAULT_MINOR_TICK_SUBDIVISIONS;
    const subdivisions = Math.max(1, Math.min(12, Math.round(subdivisionsRaw)));
    const tolerance = Math.max(Math.abs(max - min) * 1e-9, 1e-9);
    const minors = [];

    if(
      scale === 'log' &&
      Number.isFinite(opts.domainMin) && opts.domainMin > 0 &&
      Number.isFinite(opts.domainMax) && opts.domainMax > 0
    ){
      const base = Number.isFinite(opts.logBase) && opts.logBase > 1 ? opts.logBase : 10;
      const logFn = typeof opts.logFn === 'function'
        ? opts.logFn
        : (value => Math.log(value) / Math.log(base));
      const domainTicks = majorTicks.map(t => Math.pow(base, t));
      for(let i = 0; i < domainTicks.length - 1; i += 1){
        const start = domainTicks[i];
        const end = domainTicks[i + 1];
        if(!Number.isFinite(start) || !Number.isFinite(end) || !(start > 0) || !(end > start)){
          continue;
        }
        for(let m = 2; m < base; m += 1){
          const candidate = start * m;
          if(candidate >= end - tolerance){
            break;
          }
          if(candidate <= start + tolerance){
            continue;
          }
          const logValue = logFn(candidate);
          if(!Number.isFinite(logValue)){
            continue;
          }
          if(logValue <= min - tolerance || logValue >= max + tolerance){
            continue;
          }
          minors.push(logValue);
        }
      }
    }else{
      for(let i = 0; i < majorTicks.length - 1; i += 1){
        const start = majorTicks[i];
        const end = majorTicks[i + 1];
        const span = end - start;
        if(!Number.isFinite(span) || span <= tolerance){
          continue;
        }
        const step = span / (subdivisions + 1);
        for(let sub = 1; sub <= subdivisions; sub += 1){
          const value = start + step * sub;
          if(value <= min + tolerance || value >= max - tolerance){
            continue;
          }
          minors.push(value);
        }
      }
    }

    const unique = [];
    minors.forEach(value => {
      if(!Number.isFinite(value)){
        return;
      }
      if(value < min - tolerance || value > max + tolerance){
        return;
      }
      const nearMajor = majorTicks.some(major => Math.abs(major - value) <= tolerance * 1.5);
      if(nearMajor){
        return;
      }
      const duplicate = unique.some(existing => Math.abs(existing - value) <= tolerance * 0.5);
      if(!duplicate){
        unique.push(value);
      }
    });
    unique.sort((a, b) => a - b);
    if(Shared.isDebugEnabled?.()){
      console.debug('Debug: chartStyle.computeMinorTickPositions', {
        majorCount: majorTicks.length,
        minorCount: unique.length,
        min,
        max,
        scale,
        subdivisions,
        domainMin: opts.domainMin ?? null,
        domainMax: opts.domainMax ?? null
      });
    }
    return unique;
  };

  chartStyle.resolveMinorTickStyle = function resolveMinorTickStyle(options){
    const tickLength = Number.isFinite(options?.tickLength) ? options.tickLength : 6;
    const axisStrokeWidth = Number.isFinite(options?.strokeWidth) ? options.strokeWidth : 1;
    const length = Math.max(2, Math.round(tickLength * 0.55));
    const strokeWidth = Math.max(0.5, Math.max(axisStrokeWidth * 0.75, axisStrokeWidth - 0.25));
    const opacity = Number.isFinite(options?.opacity) ? options.opacity : 0.85;
    return { length, strokeWidth, opacity };
  };

  chartStyle.computeLabelPadding = function computeLabelPadding(options){
    const opts = options || {};
    const labels = Array.isArray(opts.labels) ? opts.labels.map(label => label == null ? '' : String(label)) : [];
    const angleDeg = Math.abs(Number(opts.angle) || 0);
    const rad = angleDeg * (Math.PI / 180);
    const sin = Math.sin(rad);
    const cos = Math.cos(rad);
    const units = typeof opts.units === 'string' ? opts.units.toLowerCase() : 'pt';
    let fontPx;
    let fontPt;
    const rawSize = Number(opts.fontSize);
    if(units === 'px'){
      fontPx = Number.isFinite(rawSize) && rawSize > 0 ? rawSize : BASE_FONT_SIZE_PX;
      fontPt = fontPx / PT_TO_PX;
    }else{
      const normalized = chartStyle.normalizeFontSize(rawSize);
      fontPt = normalized.pt;
      fontPx = normalized.px;
    }
    const basePadding = Number.isFinite(opts.basePadding) ? opts.basePadding : Math.max(fontPx * 0.4, 8);
    const fontForMeasure = chartStyle.makeFont(Math.max(4, Math.round(fontPx)));
    let maxLabelWidth = 0;
    labels.forEach(label => {
      const width = chartStyle.measureText(label, fontForMeasure);
      if(Number.isFinite(width) && width > maxLabelWidth){
        maxLabelWidth = width;
      }
    });
    const verticalSpan = angleDeg === 0 ? fontPx : Math.abs(sin) * maxLabelWidth + Math.abs(cos) * fontPx;
    const horizontalSpan = angleDeg === 0 ? maxLabelWidth : Math.abs(cos) * maxLabelWidth + Math.abs(sin) * fontPx;
    const vertical = Math.ceil(verticalSpan + basePadding);
    const horizontal = Math.ceil(horizontalSpan + basePadding);
    const summary = {
      debugLabel: opts.debugLabel || 'chartStyle.computeLabelPadding',
      labelCount: labels.length,
      angle: angleDeg,
      basePadding,
      maxLabelWidth,
      fontPx,
      fontPt,
      vertical,
      horizontal
    };
    console.debug('Debug: chartStyle.computeLabelPadding', summary); // Debug: label padding computation
    return { ...summary, sin, cos };
  };

  chartStyle.ensureLabelPadding = function ensureLabelPadding(currentMargin, options){
    const info = chartStyle.computeLabelPadding(options);
    const directionRaw = options?.direction || 'vertical';
    const direction = typeof directionRaw === 'string' ? directionRaw.toLowerCase() : 'vertical';
    const applied = Number.isFinite(currentMargin) ? currentMargin : 0;
    const required = direction === 'horizontal' ? info.horizontal : info.vertical;
    const margin = Math.max(applied, required);
    console.debug('Debug: chartStyle.ensureLabelPadding', {
      debugLabel: options?.debugLabel || 'chartStyle.ensureLabelPadding',
      direction,
      applied,
      required,
      margin
    }); // Debug: label padding safeguard summary
    return { margin, required, applied, info };
  };

  chartStyle.computeXAxisEndpointLabelMargins = function computeXAxisEndpointLabelMargins(options){
    const labels = Array.isArray(options?.labels) ? options.labels.map(value => String(value ?? '')) : [];
    const edgePadding = chartStyle.resolveGraphHorizontalEdgePadding(options?.horizontalEdgePadding);
    if(!labels.length){
      return { left: edgePadding, right: edgePadding, firstLabelWidth: 0, lastLabelWidth: 0 };
    }
    const fallbackSize = Number(options?.fontSize) || 12;
    const font = options?.labelMeasureFont || chartStyle.makeFont(fallbackSize);
    const firstLabelWidth = chartStyle.measureText(labels[0], font);
    const lastLabelWidth = chartStyle.measureText(labels[labels.length - 1], font);
    const startInset = Math.max(0, Number(options?.startInset) || 0);
    const endInset = Math.max(0, Number(options?.endInset) || 0);
    return {
      left: edgePadding + Math.max(0, firstLabelWidth / 2 - startInset),
      right: edgePadding + Math.max(0, lastLabelWidth / 2 - endInset),
      firstLabelWidth,
      lastLabelWidth
    };
  };

  chartStyle.computeBaseMargins = function computeBaseMargins(options){
    const fontSize = options?.fontSize || 12;
    const legendWidth = options?.legendWidth || 0;
    const maxYLabelWidth = options?.maxYLabelWidth || 0;
    const legacyYTitleWidthRaw = Number(options?.yTitleWidth);
    const legacyYTitleWidth = Number.isFinite(legacyYTitleWidthRaw) && legacyYTitleWidthRaw > 0 ? legacyYTitleWidthRaw : 0;
    const explicitHasYTitle = typeof options?.hasYTitle === 'boolean' ? options.hasYTitle : null;
    const yTickFontSizeRaw = Number(options?.yTickFontSize);
    const yTickFontSize = Number.isFinite(yTickFontSizeRaw) && yTickFontSizeRaw > 0 ? yTickFontSizeRaw : fontSize;
    const xTickFontSizeRaw = Number(options?.xTickFontSize);
    const xTickFontSize = Number.isFinite(xTickFontSizeRaw) && xTickFontSizeRaw > 0 ? xTickFontSizeRaw : fontSize;
    const axisMetrics = options?.axisMetrics || chartStyle.createAxisMetrics(fontSize);
    const tickLength = axisMetrics.tickLength ?? DEFAULT_MAJOR_TICK_LENGTH;
    const tickLabelGap = axisMetrics.tickLabelGap ?? chartStyle.resolveTickLabelGap(fontSize);
    const axisTitleGap = axisMetrics.axisTitleGap ?? Math.max(4, Math.round(fontSize * 0.75));
    const outerPadding = axisMetrics.outerPadding ?? Math.max(6, Math.round(fontSize * 0.6));
    const horizontalEdgePadding = chartStyle.resolveGraphHorizontalEdgePadding(
      options?.horizontalEdgePadding ?? axisMetrics.horizontalEdgePadding
    );
    const xEndpointMargins = chartStyle.computeXAxisEndpointLabelMargins({
      labels: options?.xTickLabels,
      labelMeasureFont: options?.xTickMeasureFont,
      fontSize: xTickFontSize,
      horizontalEdgePadding,
      startInset: options?.xTickStartInset,
      endInset: options?.xTickEndInset
    });
    const yTitleThicknessRaw = Number(options?.yTitleThickness ?? options?.yTitleFontSize);
    const yTitleThickness = Number.isFinite(yTitleThicknessRaw) && yTitleThicknessRaw > 0 ? yTitleThicknessRaw : fontSize;
    const hasYTitle = explicitHasYTitle !== null ? explicitHasYTitle : legacyYTitleWidth > 0;
    const top = Math.max(36, Math.round(fontSize * BASE_BOTTOM_FACTOR));
    const leftTickReserve = maxYLabelWidth + tickLength + tickLabelGap;
    const leftTickLabelReserve = leftTickReserve + horizontalEdgePadding;
    const leftTitleReserve = hasYTitle
      ? leftTickReserve + axisTitleGap + yTitleThickness + horizontalEdgePadding
      : 0;
    const left = Math.max(leftTickLabelReserve, leftTitleReserve, xEndpointMargins.left);
    const right = xEndpointMargins.right + legendWidth;
    const bottomSpacing = tickLength + tickLabelGap + xTickFontSize + axisTitleGap + fontSize + outerPadding;
    const bottom = Math.max(bottomSpacing, Math.max(36, Math.round(fontSize * BASE_BOTTOM_FACTOR)) + fontSize * 0.5);
    console.debug('Debug: chartStyle.computeBaseMargins', {
      fontSize,
      legendWidth,
      maxYLabelWidth,
      legacyYTitleWidth,
      hasYTitle,
      yTitleThickness,
      horizontalEdgePadding,
      xEndpointMargins,
      xTickFontSize,
      yTickFontSize,
      axisMetrics,
      top,
      left,
      right,
      bottom
    }); // Debug: margin base computation
    return chartStyle.stabilizeAxisResizeMargins({top, right, bottom, left}, options);
  };

  chartStyle.computeCartesianMarginRequirements = function computeCartesianMarginRequirements(options){
    const opts = options && typeof options === 'object' ? options : {};
    const measurementOptions = {
      ...opts,
      legendWidth: 0,
      svgBox: null,
      container: null,
      resizeTarget: null
    };
    const baselineMargins = chartStyle.computeBaseMargins({
      ...measurementOptions,
      maxYLabelWidth: 0,
      xTickLabels: []
    });
    const requiredMargins = chartStyle.computeBaseMargins(measurementOptions);
    return {
      baselineMargins: { ...baselineMargins },
      requiredMargins: {
        top: Math.max(baselineMargins.top, requiredMargins.top),
        right: Math.max(baselineMargins.right, requiredMargins.right),
        bottom: Math.max(baselineMargins.bottom, requiredMargins.bottom),
        left: Math.max(baselineMargins.left, requiredMargins.left)
      }
    };
  };

  const axisResizeMarginLocks = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

  function normalizeMarginLock(margin){
    if(!margin || typeof margin !== 'object'){
      return null;
    }
    return {
      top: Number(margin.top) || 0,
      right: Number(margin.right) || 0,
      bottom: Number(margin.bottom) || 0,
      left: Number(margin.left) || 0
    };
  }

  chartStyle.stabilizeAxisResizeMargins = function stabilizeAxisResizeMargins(margin, options){
    const locked = normalizeMarginLock(margin);
    if(!locked){
      return margin;
    }
    const svgBox = options?.svgBox || options?.container || options?.resizeTarget || null;
    const dataset = svgBox?.dataset || null;
    if(!dataset){
      return locked;
    }
    const axis = dataset.resizerLastAxis === 'x' || dataset.resizerLastAxis === 'y'
      ? dataset.resizerLastAxis
      : 'both';
    const aspectLocked = dataset.resizerAspectLocked === 'true';
    const markedAxis = dataset.resizerAxisViewportLockAxis;
    const lockUntil = Number(dataset.resizerAxisViewportLockUntil);
    const lockActive = !aspectLocked
      && (axis === 'x' || axis === 'y')
      && markedAxis === axis
      && Number.isFinite(lockUntil)
      && Date.now() <= lockUntil;
    const previous = axisResizeMarginLocks ? axisResizeMarginLocks.get(svgBox) : svgBox.__chartStyleAxisResizeMarginLock;
    const commitBaseline = options?.commitBaseline !== false;
    if(lockActive && previous){
      locked.top = previous.top;
      locked.right = previous.right;
      locked.bottom = previous.bottom;
      locked.left = previous.left;
    }
    // Multi-pass renderers may need a provisional margin to calculate ticks before
    // their final measured margin exists. A provisional pass may consume an
    // existing baseline, but it must not publish a new one: after render-cache
    // restore the WeakMap is empty, and publishing an estimate there would make
    // the first one-axis resize freeze the estimate instead of the final margin.
    if(commitBaseline){
      if(axisResizeMarginLocks){
        axisResizeMarginLocks.set(svgBox, { ...locked });
      }else{
        svgBox.__chartStyleAxisResizeMarginLock = { ...locked };
      }
    }
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug('Debug: chartStyle.stabilizeAxisResizeMargins', {
        scope: options?.scopeId || options?.scope || svgBox.id || null,
        axis,
        aspectLocked,
        lockActive,
        commitBaseline,
        previous: previous || null,
        margin: locked
      });
    }
    return locked;
  };

  chartStyle.fitPlotAspectPreservingHeight = function fitPlotAspectPreservingHeight(totalWidth, totalHeight, margin, aspectValue){
    const baseMargin = {
      top: Number(margin?.top) || 0,
      right: Number(margin?.right) || 0,
      bottom: Number(margin?.bottom) || 0,
      left: Number(margin?.left) || 0
    };
    const width = Number(totalWidth);
    const height = Number(totalHeight);
    const innerW = Math.max(20, width - baseMargin.left - baseMargin.right);
    const innerH = Math.max(20, height - baseMargin.top - baseMargin.bottom);
    const aspect = Number(aspectValue);
    if(!Number.isFinite(aspect) || aspect <= 0){
      return {
        margin: baseMargin,
        plotW: innerW,
        plotH: innerH,
        rightExtension: 0,
        renderWidth: width
      };
    }

    // The Y span is the cross-component visual baseline. Aspect constraints vary
    // the X span and, only when needed, extend the shared envelope to the right.
    // They must never make the graph taller than its canonical frame.
    const targetH = innerH;
    const targetW = targetH * aspect;
    if(!Number.isFinite(targetW) || targetW <= 0){
      return {
        margin: baseMargin,
        plotW: innerW,
        plotH: innerH,
        rightExtension: 0,
        renderWidth: width
      };
    }
    const adjusted = { ...baseMargin };
    let rightExtension = 0;
    if(targetW < innerW){
      adjusted.right += innerW - targetW;
    }else if(targetW > innerW){
      rightExtension = targetW - innerW;
    }
    const renderWidth = Math.max(1, width + rightExtension);
    console.debug('Debug: chartStyle.fitPlotAspectPreservingHeight', {
      totalWidth: width,
      totalHeight: height,
      aspect,
      originalMargin: baseMargin,
      adjustedMargin: adjusted,
      plotW: targetW,
      plotH: targetH,
      rightExtension,
      renderWidth
    });
    return {
      margin: adjusted,
      plotW: Math.max(20, targetW),
      plotH: Math.max(20, targetH),
      rightExtension,
      renderWidth
    };
  };

  chartStyle.applySvgDefaults = function applySvgDefaults(svg){
    if(!svg){
      return false;
    }
    svg.setAttribute('font-family', FONT_FAMILY);
    svg.setAttribute('color', TEXT_COLOR);
    console.debug('Debug: chartStyle.applySvgDefaults', { hasSvg: true }); // Debug: svg defaults applied
    return true;
  };

  chartStyle.bindSvgInteractions = function bindSvgInteractions(svg, options = {}){
    if(!svg){
      return false;
    }
    const fontControls = global.Shared?.fontControls || null;
    if(typeof fontControls?.enableForSvg !== 'function'){
      return false;
    }
    const scopeId = options.scopeId || svg.id || svg.dataset?.fontScope || svg.closest?.('.svgbox')?.id || null;
    try{
      fontControls.enableForSvg(svg, { scopeId, tabId: options.tabId || null });
      console.debug('Debug: chartStyle.bindSvgInteractions fontControls attached', { scope: scopeId }); // Debug: font panel binding
      return true;
    }catch(err){
      console.error('chartStyle.bindSvgInteractions fontControls error', err);
      return false;
    }
  };

  chartStyle.prepareSvg = function prepareSvg(svg, options = {}){
    const styled = chartStyle.applySvgDefaults(svg);
    if(!styled){
      return false;
    }
    const scopeId = options.scopeId || svg.id || svg.dataset?.fontScope || svg.closest?.('.svgbox')?.id || null;
    if(options.applyTheme !== false && scopeId && typeof global.Shared?.colorSchemes?.applyToSvg === 'function'){
      global.Shared.colorSchemes.applyToSvg(scopeId, svg, { schemeId: options.colorScheme });
    }
    if(options.bindInteractions !== false){
      chartStyle.bindSvgInteractions(svg, options);
    }
    return true;
  };

  chartStyle.renderFontSizeLabel = function renderFontSizeLabel(options){
    const opts = options || {};
    const el = opts.element;
    if(!el){
      console.debug('Debug: chartStyle.renderFontSizeLabel skipped', { reason: 'missing element', options: opts }); // Debug: font label skip
      return '';
    }
    const info = opts.fontInfo || {};
    const inputEl = opts.input || opts.control || null;
    const manualUpdate = opts.manual === true;
    const dataset = inputEl && inputEl.dataset ? inputEl.dataset : null;
    let basePt = Number.isFinite(info.basePt) ? info.basePt : Number(opts.basePt);
    if(!Number.isFinite(basePt)){
      basePt = Number.isFinite(info.pt) ? info.pt : Number(opts.pt);
    }
    let displayPt = Number.isFinite(info.displayPt) ? info.displayPt : Number(opts.displayPt);
    if(!Number.isFinite(displayPt)){
      displayPt = Number.isFinite(info.scaledPt) ? info.scaledPt : Number(opts.pt);
    }
    let pxSource = Number.isFinite(info.scaledPx) ? info.scaledPx : Number(opts.scaledPx);
    if(!Number.isFinite(pxSource)){
      if(Number.isFinite(displayPt)){
        pxSource = chartStyle.ptToPx(displayPt);
      }else if(Number.isFinite(basePt)){
        pxSource = chartStyle.ptToPx(basePt);
      }
    }
    if(dataset){
      if(manualUpdate){
        if(Number.isFinite(displayPt)){
          dataset.fontBasePt = String(displayPt);
          dataset.fontDisplayPt = String(displayPt);
          dataset.fontResizeBaselinePending = 'true';
        }else if(Number.isFinite(basePt)){
          dataset.fontBasePt = String(basePt);
          dataset.fontDisplayPt = String(basePt);
          dataset.fontResizeBaselinePending = 'true';
        }
        console.debug('Debug: chartStyle.renderFontSizeLabel manual control sync', {
          inputId: inputEl?.id || null,
          basePt: Number(dataset.fontBasePt),
          displayPt: Number(dataset.fontDisplayPt)
        }); // Debug: manual slider sync
      }else{
        if(Number.isFinite(basePt) && !Number.isFinite(Number(dataset.fontBasePt))){
          dataset.fontBasePt = String(basePt);
          console.debug('Debug: chartStyle.renderFontSizeLabel base cached', {
            inputId: inputEl?.id || null,
            basePt
          }); // Debug: cache base for control
        }
        if(Number.isFinite(displayPt)){
          dataset.fontDisplayPt = String(displayPt);
          if(inputEl){
            const min = Number(inputEl.min);
            const max = Number(inputEl.max);
            const payload = {
              inputId: inputEl.id || null,
              displayPt,
              min,
              max
            };
            console.debug('Debug: chartStyle.renderFontSizeLabel control observed', payload); // Debug: control state observation
          }
        }
      }
    }
    const effectivePt = Number.isFinite(displayPt) ? displayPt : basePt;
    const roundedPt = Number.isFinite(effectivePt) ? Math.round(effectivePt * 10) / 10 : null;
    const roundedPx = Number.isFinite(pxSource) ? Math.round(pxSource) : null;
    let label = '';
    if(roundedPt !== null && roundedPx !== null){
      label = roundedPt + ' pt (' + roundedPx + 'px)';
    } else if(roundedPt !== null){
      label = roundedPt + ' pt';
    } else if(roundedPx !== null){
      label = roundedPx + 'px';
    }
    el.textContent = label;
    console.debug('Debug: chartStyle.renderFontSizeLabel applied', {
      pt: roundedPt,
      px: roundedPx,
      label,
      inputId: inputEl?.id || null,
      manualUpdate
    }); // Debug: font label render
    return label;
  };

  function markLegendViewportContent(node){
    if(node && typeof node.setAttribute === 'function'){
      node.setAttribute('data-legend-viewport-content', 'true');
    }
    return node || null;
  }

  chartStyle.createLegendRenderer = function createLegendRenderer(options){
    const opts = options || {};
    const rawEntries = Array.isArray(opts.entries) ? opts.entries : [];
    const defaultFill = typeof opts.defaultFill === 'string' ? opts.defaultFill : chartStyle.TEXT_COLOR;
    const defaultStroke = typeof opts.defaultStroke === 'string' ? opts.defaultStroke : 'none';
    const textColor = (typeof opts.textColor === 'string' && opts.textColor.trim())
      ? opts.textColor
      : chartStyle.TEXT_COLOR;
    const defaultStrokeWidth = Number.isFinite(opts.strokeWidth) ? Number(opts.strokeWidth) : 0;
    const normalizedEntries = [];
    rawEntries.forEach((entry, index) => {
      if(!entry){ return; }
      const labelRaw = entry.label ?? entry.name ?? entry.title ?? '';
      const label = labelRaw == null ? '' : String(labelRaw);
      const fill = typeof entry.fill === 'string' ? entry.fill : (typeof entry.color === 'string' ? entry.color : defaultFill);
      const stroke = typeof entry.stroke === 'string' ? entry.stroke : (typeof entry.border === 'string' ? entry.border : defaultStroke);
      const strokeWidth = Number.isFinite(entry.strokeWidth) ? Number(entry.strokeWidth) : defaultStrokeWidth;
      const keyRaw = entry.key ?? entry.id ?? label;
      const key = keyRaw == null ? '' : String(keyRaw);
      const editable = entry.editable === true;
      const seriesIndex = Number.isInteger(entry.seriesIndex) ? entry.seriesIndex : null;
      const swatch = entry.swatch && typeof entry.swatch === 'object'
        ? entry.swatch
        : null;
      normalizedEntries.push({ label, fill, stroke, strokeWidth, sourceIndex: index, key, editable, seriesIndex, swatch, raw: entry });
    });
    const fontSize = Math.max(4, Number(opts.fontSize) || 12);
    const rowGap = Number.isFinite(opts.rowGap) ? Number(opts.rowGap) : Math.max(4, Math.round(fontSize * 0.3));
    // Keep legend symbols compact by default while scaling with legend font size.
    const swatchSize = Number.isFinite(opts.swatchSize) ? Number(opts.swatchSize) : Math.max(4, Math.round(fontSize * 0.6));
    const hasLineMarkerSwatch = normalizedEntries.some(entry => entry.swatch?.type === 'line-marker');
    const defaultSwatchWidth = hasLineMarkerSwatch
      ? Math.max(swatchSize, Math.round(fontSize * 1.6))
      : swatchSize;
    const swatchWidth = Number.isFinite(opts.swatchWidth) ? Math.max(1, Number(opts.swatchWidth)) : defaultSwatchWidth;
    const swatchHeight = Number.isFinite(opts.swatchHeight) ? Math.max(1, Number(opts.swatchHeight)) : swatchSize;
    const swatchGap = Number.isFinite(opts.swatchGap) ? Number(opts.swatchGap) : Math.max(8, Math.round(fontSize * 0.4));
    const minWidth = Number.isFinite(opts.minWidth) ? Number(opts.minWidth) : Math.max(60, Math.round(fontSize * 5.5));
    const columnGap = Number.isFinite(opts.columnGap)
      ? Math.max(0, Number(opts.columnGap))
      : Math.max(LEGEND_LAYOUT_CONSTANTS.minColumnGapPx, Math.round(fontSize * LEGEND_LAYOUT_CONSTANTS.columnGapScale));
    const fontForMeasure = chartStyle.makeFont(fontSize);
    let maxLabelWidth = 0;
    normalizedEntries.forEach(entry => {
      const width = chartStyle.measureText(entry.label, fontForMeasure);
      entry.labelWidth = Number.isFinite(width) ? width : 0;
      if(Number.isFinite(width) && width > maxLabelWidth){
        maxLabelWidth = width;
      }
    });
    // Keep row spacing large enough for either text or swatch content to avoid overlap at small fonts.
    const rowContentHeight = Math.max(fontSize, swatchHeight);
    const rowHeight = rowContentHeight + rowGap;
    const baselineOffset = Number.isFinite(opts.baselineOffset) ? Number(opts.baselineOffset) : 0;
    const textCenterOffset = rowContentHeight / 2;
    const swatchOffsetY = (rowContentHeight - swatchHeight) / 2;
    const requestedMaxHeight = Number(opts.maxHeight);
    const maxHeight = Number.isFinite(requestedMaxHeight) && requestedMaxHeight > 0
      ? requestedMaxHeight
      : Infinity;
    const maximumRows = Number.isFinite(maxHeight)
      ? Math.max(1, Math.floor(Math.max(0, maxHeight - baselineOffset - rowContentHeight) / rowHeight) + 1)
      : Math.max(1, normalizedEntries.length);
    const columnCount = normalizedEntries.length ? Math.ceil(normalizedEntries.length / maximumRows) : 0;
    const rowsPerColumn = columnCount ? Math.ceil(normalizedEntries.length / columnCount) : 0;
    const columnWidths = Array.from({ length: columnCount }, () => minWidth);
    normalizedEntries.forEach((entry, index) => {
      const columnIndex = Math.floor(index / rowsPerColumn);
      columnWidths[columnIndex] = Math.max(columnWidths[columnIndex], swatchWidth + swatchGap + entry.labelWidth);
    });
    const columnOffsets = [];
    let width = 0;
    columnWidths.forEach((columnWidth, index) => {
      columnOffsets.push(width);
      width += columnWidth;
      if(index < columnWidths.length - 1){
        width += columnGap;
      }
    });
    const renderedRows = normalizedEntries.length ? Math.min(rowsPerColumn, normalizedEntries.length) : 0;
    const height = renderedRows ? baselineOffset + (renderedRows - 1) * rowHeight + rowContentHeight : 0;
    const applyLegendIdentity = (node, entry, idx, role) => {
      if(entry.key){
        node.dataset.legendKey = entry.key;
      }
      if(role){
        node.dataset[role] = '1';
      }
      node.dataset.legendIndex = String(idx);
      return node;
    };
    const createLegendMarker = (doc, entry, idx, options) => {
      const markerOptions = options || {};
      const rawShape = markerOptions.shape ?? entry?.raw?.shape;
      const shape = typeof rawShape === 'string' ? rawShape : 'square';
      const centerX = Number.isFinite(markerOptions.centerX) ? markerOptions.centerX : swatchWidth / 2;
      const centerY = Number.isFinite(markerOptions.centerY) ? markerOptions.centerY : 0;
      const radius = Number.isFinite(markerOptions.radius)
        ? Math.max(1, markerOptions.radius)
        : Math.max(1, Math.min(swatchWidth, swatchHeight) * 0.42);
      const markerFill = typeof markerOptions.fill === 'string' ? markerOptions.fill : entry.fill;
      const markerStroke = typeof markerOptions.stroke === 'string' ? markerOptions.stroke : entry.stroke;
      const markerStrokeWidth = Number.isFinite(markerOptions.strokeWidth)
        ? Math.max(0, Number(markerOptions.strokeWidth))
        : Math.max(0, entry.strokeWidth);
      const markerOpacity = Number.isFinite(markerOptions.opacity)
        ? Math.max(0, Math.min(1, Number(markerOptions.opacity)))
        : 1;
      let node = null;
      if(shape === 'circle'){
        node = doc.createElementNS(NS, 'circle');
        node.setAttribute('cx', String(centerX));
        node.setAttribute('cy', String(centerY));
        node.setAttribute('r', String(radius));
      }else if(shape === 'triangle'){
        node = doc.createElementNS(NS, 'path');
        const d = `M ${centerX} ${centerY - radius} L ${centerX + radius} ${centerY + radius} L ${centerX - radius} ${centerY + radius} Z`;
        node.setAttribute('d', d);
      }else if(shape === 'diamond'){
        node = doc.createElementNS(NS, 'path');
        const d = `M ${centerX} ${centerY - radius} L ${centerX + radius} ${centerY} L ${centerX} ${centerY + radius} L ${centerX - radius} ${centerY} Z`;
        node.setAttribute('d', d);
      }else if(shape === 'cross'){
        node = doc.createElementNS(NS, 'path');
        const half = radius;
        const bar = Math.max((radius * 2) / 3, 2);
        const hb = bar / 2;
        const top = centerY - half;
        const bottom = centerY + half;
        const left = centerX - half;
        const right = centerX + half;
        const d = [
          `M ${left} ${top + hb}`,
          `L ${left + hb} ${top}`,
          `L ${centerX} ${centerY - hb}`,
          `L ${right - hb} ${top}`,
          `L ${right} ${top + hb}`,
          `L ${centerX + hb} ${centerY}`,
          `L ${right} ${bottom - hb}`,
          `L ${right - hb} ${bottom}`,
          `L ${centerX} ${centerY + hb}`,
          `L ${left + hb} ${bottom}`,
          `L ${left} ${bottom - hb}`,
          `L ${centerX - hb} ${centerY}`,
          'Z'
        ].join(' ');
        node.setAttribute('d', d);
      }else if(shape === 'plus'){
        node = doc.createElementNS(NS, 'path');
        const half = radius;
        const bar = Math.max((radius * 2) / 3, 2);
        const halfBar = bar / 2;
        const d = `M ${centerX - halfBar} ${centerY - half} H ${centerX + halfBar} V ${centerY - halfBar} H ${centerX + half} V ${centerY + halfBar} H ${centerX + halfBar} V ${centerY + half} H ${centerX - halfBar} V ${centerY + halfBar} H ${centerX - half} V ${centerY - halfBar} H ${centerX - halfBar} Z`;
        node.setAttribute('d', d);
      }else if(shape === 'star'){
        node = doc.createElementNS(NS, 'path');
        const outer = Math.max(radius, 1);
        const inner = Math.max(outer * 0.45, 1);
        const points = [];
        for(let i = 0; i < 5; i += 1){
          const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
          points.push({ x: centerX + Math.cos(a) * outer, y: centerY + Math.sin(a) * outer });
          const b = a + Math.PI / 5;
          points.push({ x: centerX + Math.cos(b) * inner, y: centerY + Math.sin(b) * inner });
        }
        const d = points.map((pt, pointIdx) => `${pointIdx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ') + ' Z';
        node.setAttribute('d', d);
      }else if(shape === 'rect' || shape === 'rectangle'){
        node = doc.createElementNS(NS, 'rect');
        if(markerOptions.legacySizing === true){
          node.setAttribute('x', '0');
          node.setAttribute('y', String(centerY - (swatchHeight / 2)));
          node.setAttribute('width', String(swatchWidth));
          node.setAttribute('height', String(swatchHeight));
        }else{
          node.setAttribute('x', String(centerX - radius));
          node.setAttribute('y', String(centerY - radius));
          node.setAttribute('width', String(radius * 2));
          node.setAttribute('height', String(radius * 2));
        }
      }else{
        node = doc.createElementNS(NS, 'rect');
        if(markerOptions.legacySizing === true){
          node.setAttribute('x', '0');
          node.setAttribute('y', String(centerY - (swatchSize / 2)));
          node.setAttribute('width', String(swatchSize));
          node.setAttribute('height', String(swatchSize));
        }else{
          node.setAttribute('x', String(centerX - radius));
          node.setAttribute('y', String(centerY - radius));
          node.setAttribute('width', String(radius * 2));
          node.setAttribute('height', String(radius * 2));
        }
      }
      node.setAttribute('fill', markerFill);
      node.setAttribute('opacity', String(markerOpacity));
      const effectiveStrokeWidth = markerStrokeWidth > 0 ? markerStrokeWidth : 0;
      if(effectiveStrokeWidth > 0){
        node.setAttribute('stroke', markerStroke || markerFill);
        node.setAttribute('stroke-width', effectiveStrokeWidth);
      }else if(markerStroke){
        node.setAttribute('stroke', markerStroke);
        node.setAttribute('stroke-width', '0');
      }
      return node;
    };
    const createLegendSwatch = (doc, entry, idx, swatchCenterY) => {
      if(entry.swatch?.type === 'line-marker'){
        const swatch = doc.createElementNS(NS, 'g');
        applyLegendIdentity(swatch, entry, idx, 'legendSwatch');
        const lineOptions = entry.swatch.line && typeof entry.swatch.line === 'object'
          ? entry.swatch.line
          : {};
        const markerOptions = entry.swatch.marker && typeof entry.swatch.marker === 'object'
          ? entry.swatch.marker
          : {};
        const line = doc.createElementNS(NS, 'line');
        line.setAttribute('x1', '0');
        line.setAttribute('x2', String(swatchWidth));
        line.setAttribute('y1', String(swatchCenterY));
        line.setAttribute('y2', String(swatchCenterY));
        line.setAttribute('stroke', typeof lineOptions.stroke === 'string' ? lineOptions.stroke : entry.fill);
        line.setAttribute('stroke-width', String(
          Number.isFinite(lineOptions.strokeWidth) ? Math.max(0, Number(lineOptions.strokeWidth)) : Math.max(1, entry.strokeWidth)
        ));
        line.setAttribute('stroke-opacity', String(
          Number.isFinite(lineOptions.opacity) ? Math.max(0, Math.min(1, Number(lineOptions.opacity))) : 1
        ));
        if(typeof lineOptions.dasharray === 'string' && lineOptions.dasharray.trim()){
          line.setAttribute('stroke-dasharray', lineOptions.dasharray.trim());
        }
        applyLegendIdentity(line, entry, idx, 'legendLine');
        swatch.appendChild(line);
        if(markerOptions.visible !== false){
          const marker = createLegendMarker(doc, entry, idx, {
            ...markerOptions,
            centerX: swatchWidth / 2,
            centerY: swatchCenterY,
            radius: Math.max(1, Math.min(swatchHeight, swatchSize) * 0.42)
          });
          applyLegendIdentity(marker, entry, idx, 'legendMarker');
          swatch.appendChild(marker);
        }
        return swatch;
      }
      const marker = createLegendMarker(doc, entry, idx, {
        centerX: swatchWidth / 2,
        centerY: swatchCenterY,
        legacySizing: true
      });
      applyLegendIdentity(marker, entry, idx, 'legendSwatch');
      return marker;
    };
    const renderer = {
      entries: normalizedEntries,
      width,
      height,
      fontSize,
      rowGap,
      rowHeight,
      rowContentHeight,
      swatchSize,
      swatchWidth,
      swatchHeight,
      swatchGap,
      baselineOffset,
      minWidth,
      maxLabelWidth,
      maxHeight: Number.isFinite(maxHeight) ? maxHeight : null,
      columnGap,
      columnCount,
      rowsPerColumn,
      columnWidths,
      draw(svg, position){
        if(!svg || typeof svg.appendChild !== 'function'){
          console.warn('chartStyle.createLegendRenderer.draw skipped: invalid svg target');
          return null;
        }
        if(!normalizedEntries.length){
          return null;
        }
        const doc = svg.ownerDocument || global.document;
        const group = doc.createElementNS(NS, 'g');
        const posX = Number.isFinite(position?.x) ? Number(position.x) : 0;
        const posY = Number.isFinite(position?.y) ? Number(position.y) : 0;
        const canonicalX = Number.isFinite(position?.canonicalX) ? Number(position.canonicalX) : posX;
        const canonicalY = Number.isFinite(position?.canonicalY) ? Number(position.canonicalY) : posY;
        group.setAttribute('transform', `translate(${posX},${posY})`);
        // Preserve the renderer-owned origin separately from the transform. Legend
        // dragging may later replace the transform, while viewport finalization
        // still needs a reliable fallback when SVG transform APIs are unavailable.
        group.dataset.legendOriginX = String(posX);
        group.dataset.legendOriginY = String(posY);
        group.dataset.legendCanonicalOriginX = String(canonicalX);
        group.dataset.legendCanonicalOriginY = String(canonicalY);
        group.dataset.legendColumnCount = String(columnCount);
        group.dataset.legendRowsPerColumn = String(rowsPerColumn);
        // Persist renderer-owned local bounds so shared legend decoration can be
        // reconstructed deterministically in DOM environments where getBBox() is
        // unavailable (tests, cached/reopened SVG before layout is ready).
        group.dataset.legendContentX = '0';
        group.dataset.legendContentY = '0';
        group.dataset.legendContentWidth = String(width);
        group.dataset.legendContentHeight = String(height);
        group.dataset.legendContentFontSize = String(fontSize);
        markLegendViewportContent(group);
        normalizedEntries.forEach((entry, idx) => {
          const columnIndex = Math.floor(idx / rowsPerColumn);
          const rowIndex = idx % rowsPerColumn;
          const columnX = columnOffsets[columnIndex] || 0;
          const rowStartY = rowIndex * rowHeight + baselineOffset;
          const textCenterY = rowStartY + textCenterOffset;
          const swatchCenterY = rowStartY + swatchOffsetY + (swatchHeight / 2);
          const swatch = createLegendSwatch(doc, entry, idx, swatchCenterY);
          if(columnX){
            swatch.setAttribute('transform', `translate(${columnX},0)`);
          }
          if(entry.editable && typeof opts.onSwatchClick === 'function'){
            swatch.style.cursor = 'pointer';
            swatch.addEventListener('click', (evt) => {
              opts.onSwatchClick({
                event: evt,
                entry,
                index: idx,
                swatch,
                textNode: null,
                renderer,
                svg
              });
            });
          }
          group.appendChild(swatch);
          const text = doc.createElementNS(NS, 'text');
          text.setAttribute('x', columnX + swatchWidth + swatchGap);
          text.setAttribute('y', textCenterY);
          text.setAttribute('font-size', fontSize);
          text.setAttribute('fill', textColor);
          text.setAttribute('dominant-baseline', 'middle');
          text.textContent = entry.label;
          if(entry.editable && typeof opts.onSwatchClick === 'function'){
            text.dataset.legendIndex = String(idx);
            if(entry.key){ text.dataset.legendKey = entry.key; }
          }
          group.appendChild(text);
        });
        svg.appendChild(group);
        return group;
      }
    };
    return renderer;
  };

  chartStyle.computeLegendLayout = function computeLegendLayout(options){
    const opts = options || {};
    const requestedViewportHeight = Number(opts.viewportHeight);
    const requestedMaxHeight = Number(opts.maxHeight);
    const requestedFontSize = Math.max(4, Number(opts.fontSize) || 12);
    const defaultVerticalReserve = Math.max(
      LEGEND_LAYOUT_CONSTANTS.minVerticalReservePx,
      Math.round(requestedFontSize * LEGEND_LAYOUT_CONSTANTS.verticalReserveScale)
    );
    const verticalReserve = Number.isFinite(Number(opts.verticalReserve))
      ? Math.max(0, Number(opts.verticalReserve))
      : defaultVerticalReserve;
    const maxHeight = Number.isFinite(requestedMaxHeight) && requestedMaxHeight > 0
      ? requestedMaxHeight
      : (Number.isFinite(requestedViewportHeight) && requestedViewportHeight > 0
        ? Math.max(requestedFontSize, requestedViewportHeight - verticalReserve)
        : undefined);
    const renderer = chartStyle.createLegendRenderer({
      entries: opts.entries,
      fontSize: opts.fontSize,
      strokeWidth: opts.strokeWidth,
      swatchSize: opts.swatchSize,
      swatchWidth: opts.swatchWidth,
      swatchHeight: opts.swatchHeight,
      swatchGap: opts.swatchGap,
      rowGap: opts.rowGap,
      minWidth: opts.minWidth,
      maxHeight,
      columnGap: opts.columnGap,
      baselineOffset: opts.baselineOffset,
      textColor: opts.textColor,
      onSwatchClick: opts.onSwatchClick
    });
    const entryCount = renderer.entries.length;
    const fontSize = renderer.fontSize;
    const gapScale = Number.isFinite(opts.gapScale) ? opts.gapScale : LEGEND_LAYOUT_CONSTANTS.gapScale;
    const minGapPx = Number.isFinite(opts.minGapPx) ? opts.minGapPx : LEGEND_LAYOUT_CONSTANTS.minGapPx;
    const legendGapPx = entryCount ? Math.max(minGapPx, Math.round(fontSize * gapScale)) : 0;
    const legendWidthForMargin = entryCount ? renderer.width + legendGapPx : 0;
    const guardPaddingPx = Number.isFinite(opts.guardPaddingPx)
      ? Math.max(0, opts.guardPaddingPx)
      : LEGEND_LAYOUT_CONSTANTS.guardPaddingPx;
    const basePlotWidth = Number.isFinite(opts.basePlotWidth)
      ? Math.max(0, opts.basePlotWidth)
      : LEGEND_LAYOUT_CONSTANTS.basePlotMinWidth;
    const minSvgWidth = entryCount ? basePlotWidth + legendWidthForMargin + guardPaddingPx : basePlotWidth;
    return {
      renderer,
      legendGapPx,
      legendWidthForMargin,
      minSvgWidth,
      basePlotWidth,
      guardPaddingPx
    };
  };

  chartStyle.computeGraphContentViewport = function computeGraphContentViewport(options){
    const opts = options || {};
    const rawBaseWidth = Number(opts.baseWidth);
    const rawBaseHeight = Number(opts.baseHeight);
    const rawRightWidth = Number(opts.rightWidth ?? opts.legendWidth);
    const rawBottomHeight = Number(opts.bottomHeight);
    const rawLeftWidth = Number(opts.leftWidth);
    const rawTopHeight = Number(opts.topHeight);
    const rawMinimumWidth = Number(opts.minimumWidth);
    const baseWidth = Number.isFinite(rawBaseWidth) && rawBaseWidth > 0 ? rawBaseWidth : 1;
    const baseHeight = Number.isFinite(rawBaseHeight) && rawBaseHeight > 0 ? rawBaseHeight : 1;
    const requestedRightWidth = Number.isFinite(rawRightWidth) && rawRightWidth > 0 ? rawRightWidth : 0;
    const requestedBottomHeight = Number.isFinite(rawBottomHeight) && rawBottomHeight > 0 ? rawBottomHeight : 0;
    const requestedLeftWidth = Number.isFinite(rawLeftWidth) && rawLeftWidth > 0 ? rawLeftWidth : 0;
    const requestedTopHeight = Number.isFinite(rawTopHeight) && rawTopHeight > 0 ? rawTopHeight : 0;
    const minimumWidth = Number.isFinite(rawMinimumWidth) && rawMinimumWidth > 0 ? rawMinimumWidth : 0;
    const contentBounds = opts.contentBounds && typeof opts.contentBounds === 'object' ? opts.contentBounds : {};
    const suppliedMinX = Number(contentBounds.minX);
    const suppliedMinY = Number(contentBounds.minY);
    const suppliedMaxX = Number(contentBounds.maxX);
    const suppliedMaxY = Number(contentBounds.maxY);
    const minX = Math.min(0, -requestedLeftWidth, Number.isFinite(suppliedMinX) ? suppliedMinX : 0);
    const minY = Math.min(0, -requestedTopHeight, Number.isFinite(suppliedMinY) ? suppliedMinY : 0);
    const maxX = Math.max(baseWidth + requestedRightWidth, minimumWidth, Number.isFinite(suppliedMaxX) ? suppliedMaxX : baseWidth);
    const maxY = Math.max(baseHeight + requestedBottomHeight, Number.isFinite(suppliedMaxY) ? suppliedMaxY : baseHeight);
    const width = maxX - minX;
    const height = maxY - minY;
    const leftWidth = Math.max(0, -minX);
    const topHeight = Math.max(0, -minY);
    const rightWidth = Math.max(0, maxX - baseWidth);
    const bottomHeight = Math.max(0, maxY - baseHeight);
    return {
      baseWidth,
      baseHeight,
      minX,
      minY,
      maxX,
      maxY,
      rightWidth,
      bottomHeight,
      leftWidth,
      topHeight,
      legendWidth: requestedRightWidth,
      extensionWidth: leftWidth + rightWidth,
      extensionHeight: topHeight + bottomHeight,
      width,
      height,
      baseOffsetX: leftWidth,
      baseOffsetY: topHeight
    };
  };

  chartStyle.computeLegendViewport = function computeLegendViewport(options){
    return chartStyle.computeGraphContentViewport(options);
  };

  chartStyle.stageGraphContentViewport = function stageGraphContentViewport(options){
    const opts = options || {};
    let viewport = chartStyle.computeGraphContentViewport(opts);
    const svg = opts.svg || null;
    const plot = opts.plot || svg?.parentElement || null;
    const svgBox = opts.svgBox || plot?.closest?.('.svgbox') || svg?.closest?.('.svgbox') || null;
    const format = value => String(Math.round(value * 1000) / 1000);
    const requestedLegendWidth = Number(opts.legendWidth);
    const hasExplicitLegendWidth = Object.prototype.hasOwnProperty.call(opts, 'legendWidth');
    let legendReserveWidth = hasExplicitLegendWidth && Number.isFinite(requestedLegendWidth) && requestedLegendWidth >= 0
      ? requestedLegendWidth
      : 0;
    const applyViewportSlot = target => {
      if(!target?.dataset || !target?.style) return;
      const hasHorizontalExtension = viewport.extensionWidth > 0;
      const hasVerticalExtension = viewport.extensionHeight > 0;
      const hasExtension = hasHorizontalExtension || hasVerticalExtension;
      if(hasExtension){
        target.dataset.graphContentViewport = 'true';
        const zoomCandidate = Number(svgBox?.dataset?.resizerZoomLevel || svgBox?.dataset?.resizerZoom);
        const zoomScale = Number.isFinite(zoomCandidate) && zoomCandidate > 0 ? zoomCandidate : 1;
        // The SVG itself spans the complete logical envelope. Its containing plot
        // only needs the canonical frame plus right/bottom outward growth because
        // left/top growth is translated outward and must not move the base frame.
        const slotWidth = target === svg ? viewport.width : (viewport.baseWidth + viewport.rightWidth);
        const slotHeight = target === svg ? viewport.height : (viewport.baseHeight + viewport.bottomHeight);
        if(hasHorizontalExtension){
          target.style.setProperty('--graph-content-viewport-width', `${format(slotWidth)}px`);
          target.style.setProperty('--graph-content-rendered-width', `${format(slotWidth * zoomScale)}px`);
        }else{
          target.style.removeProperty('--graph-content-viewport-width');
          target.style.removeProperty('--graph-content-rendered-width');
        }
        if(hasVerticalExtension){
          target.style.setProperty('--graph-content-viewport-height', `${format(slotHeight)}px`);
          target.style.setProperty('--graph-content-rendered-height', `${format(slotHeight * zoomScale)}px`);
        }else{
          target.style.removeProperty('--graph-content-viewport-height');
          target.style.removeProperty('--graph-content-rendered-height');
        }
      }else{
        delete target.dataset.graphContentViewport;
        target.style.removeProperty('--graph-content-viewport-width');
        target.style.removeProperty('--graph-content-rendered-width');
        target.style.removeProperty('--graph-content-viewport-height');
        target.style.removeProperty('--graph-content-rendered-height');
      }
      if(target === svg){
        if(viewport.leftWidth > 0){
          target.style.setProperty('--graph-content-origin-left', `${format(viewport.leftWidth)}px`);
        }else{
          target.style.removeProperty('--graph-content-origin-left');
        }
        if(viewport.topHeight > 0){
          target.style.setProperty('--graph-content-origin-top', `${format(viewport.topHeight)}px`);
        }else{
          target.style.removeProperty('--graph-content-origin-top');
        }
      }
    };
    const syncSvgViewportDatasets = () => {
      if(!svg?.dataset) return;
      svg.dataset.legendBaseWidth = format(viewport.baseWidth);
      svg.dataset.legendBaseHeight = format(viewport.baseHeight);
      svg.dataset.legendReserveWidth = format(legendReserveWidth);
      svg.dataset.graphContentBaseWidth = format(viewport.baseWidth);
      svg.dataset.graphContentBaseHeight = format(viewport.baseHeight);
      svg.dataset.graphContentEnvelopeMinX = format(viewport.minX);
      svg.dataset.graphContentEnvelopeMinY = format(viewport.minY);
      svg.dataset.graphContentEnvelopeMaxX = format(viewport.maxX);
      svg.dataset.graphContentEnvelopeMaxY = format(viewport.maxY);
      svg.dataset.graphContentReserveRight = format(viewport.rightWidth);
      svg.dataset.graphContentReserveBottom = format(viewport.bottomHeight);
      svg.dataset.graphContentReserveLeft = format(viewport.leftWidth);
      svg.dataset.graphContentReserveTop = format(viewport.topHeight);
    };
    const readLegendTranslateX = legendNode => {
      try{
        const consolidated = legendNode?.transform?.baseVal?.consolidate?.();
        const matrixX = Number(consolidated?.matrix?.e);
        if(Number.isFinite(matrixX)) return matrixX;
      }catch(err){}
      const transform = String(legendNode?.getAttribute?.('transform') || '');
      const match = transform.match(/translate\(\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)/i);
      if(match){
        const parsed = Number(match[1]);
        if(Number.isFinite(parsed)) return parsed;
      }
      const fallback = Number(legendNode?.dataset?.legendOriginX);
      return Number.isFinite(fallback) ? fallback : 0;
    };
    const refineLegendReserveFromRenderedContent = () => {
      if(opts.refineLegendReserve === false || !svg || legendReserveWidth <= 0){
        return false;
      }
      const legendNode = svg.querySelector?.('[data-legend-viewport-content="true"]') || null;
      if(!legendNode || typeof legendNode.getBBox !== 'function'){
        return false;
      }
      let bbox = null;
      try{
        bbox = legendNode.getBBox();
      }catch(err){
        return false;
      }
      if(!bbox || !Number.isFinite(Number(bbox.x)) || !Number.isFinite(Number(bbox.width))){
        return false;
      }
      const canonicalOriginX = Number(legendNode.dataset?.legendCanonicalOriginX);
      const rightEdge = (Number.isFinite(canonicalOriginX) ? canonicalOriginX : readLegendTranslateX(legendNode))
        + Number(bbox.x) + Number(bbox.width);
      if(!Number.isFinite(rightEdge)){
        return false;
      }
      const nonLegendRightReserve = Math.max(0, viewport.rightWidth - legendReserveWidth);
      const horizontalEdgePadding = chartStyle.resolveGraphHorizontalEdgePadding(opts.horizontalEdgePadding);
      const desiredTotalExtension = Math.max(
        nonLegendRightReserve,
        rightEdge + horizontalEdgePadding - viewport.baseWidth
      );
      let desiredLegendReserve = Math.max(0, desiredTotalExtension - nonLegendRightReserve);
      if(opts.allowLegendReserveShrink === false){
        desiredLegendReserve = Math.max(legendReserveWidth, desiredLegendReserve);
      }
      const deltaLegendReserve = desiredLegendReserve - legendReserveWidth;
      if(Math.abs(deltaLegendReserve) <= 0.25){
        return false;
      }

      const viewBox = String(svg.getAttribute?.('viewBox') || '').trim().split(/[\s,]+/).map(Number);
      const canAdjustViewBox = viewBox.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0;
      if(canAdjustViewBox){
        // autoResizeSvg appends legend width after fitting the non-legend viewport.
        // Apply the same scale when replacing the pre-draw estimate with the
        // measured legend width so the base plot keeps exactly the same scale.
        const contentHeight = Math.max(1, viewport.height);
        const legendScale = viewBox[3] / contentHeight;
        const nextViewWidth = Math.max(1, viewBox[2] + deltaLegendReserve * legendScale);
        svg.setAttribute('viewBox', `${format(viewBox[0])} ${format(viewBox[1])} ${format(nextViewWidth)} ${format(viewBox[3])}`);
      }

      const previousViewportWidth = viewport.width;
      legendReserveWidth = desiredLegendReserve;
      viewport = chartStyle.computeGraphContentViewport({
        baseWidth: viewport.baseWidth,
        baseHeight: viewport.baseHeight,
        rightWidth: desiredTotalExtension,
        bottomHeight: viewport.bottomHeight,
        leftWidth: viewport.leftWidth,
        topHeight: viewport.topHeight,
        contentBounds: {
          minX: viewport.minX,
          minY: viewport.minY,
          maxX: viewport.baseWidth + desiredTotalExtension,
          maxY: viewport.maxY
        }
      });
      const numericSvgWidth = Number(svg.getAttribute?.('width'));
      if(Number.isFinite(numericSvgWidth) && Math.abs(numericSvgWidth - previousViewportWidth) <= 0.5){
        svg.setAttribute('width', format(viewport.width));
      }
      syncSvgViewportDatasets();
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        console.debug('Debug: chartStyle legend viewport refined from rendered content', {
          baseWidth: viewport.baseWidth,
          rightEdge,
          horizontalEdgePadding,
          nonLegendRightReserve,
          desiredLegendReserve,
          desiredTotalExtension,
          viewportWidth: viewport.width
        });
      }
      return true;
    };
    if(svg){
      if(opts.applySvgViewport !== false){
        svg.setAttribute('width', format(viewport.width));
        svg.setAttribute('height', format(viewport.height));
        svg.setAttribute('viewBox', `${format(viewport.minX)} ${format(viewport.minY)} ${format(viewport.width)} ${format(viewport.height)}`);
        syncSvgViewportDatasets();
      }
      if(svg.style && (viewport.extensionWidth > 0 || viewport.extensionHeight > 0)){
        svg.style.overflow = 'visible';
      }else if(svg.style){
        svg.style.removeProperty('overflow');
      }
      applyViewportSlot(svg);
    }
    const refineContentBoundsFromRenderedSvg = () => {
      if(opts.refineContentBounds === false || !svg || typeof svg.getBBox !== 'function') return false;
      let bounds = null;
      try{ bounds = svg.getBBox(); }catch(_err){ return false; }
      const x = Number(bounds?.x);
      const y = Number(bounds?.y);
      const width = Number(bounds?.width);
      const height = Number(bounds?.height);
      if(!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height) || width < 0 || height < 0) return false;
      const next = chartStyle.computeGraphContentViewport({
        baseWidth: viewport.baseWidth,
        baseHeight: viewport.baseHeight,
        rightWidth: viewport.rightWidth,
        bottomHeight: viewport.bottomHeight,
        leftWidth: viewport.leftWidth,
        topHeight: viewport.topHeight,
        contentBounds: {
          minX: Math.min(viewport.minX, x),
          minY: Math.min(viewport.minY, y),
          maxX: Math.max(viewport.maxX, x + width),
          maxY: Math.max(viewport.maxY, y + height)
        }
      });
      if(Math.abs(next.minX - viewport.minX) <= 0.25
        && Math.abs(next.minY - viewport.minY) <= 0.25
        && Math.abs(next.maxX - viewport.maxX) <= 0.25
        && Math.abs(next.maxY - viewport.maxY) <= 0.25){
        return false;
      }
      viewport = next;
      syncSvgViewportDatasets();
      return true;
    };
    const applySvgViewport = () => {
      if(!svg || opts.applySvgViewport === false) return;
      svg.setAttribute('width', format(viewport.width));
      svg.setAttribute('height', format(viewport.height));
      svg.setAttribute('viewBox', `${format(viewport.minX)} ${format(viewport.minY)} ${format(viewport.width)} ${format(viewport.height)}`);
      syncSvgViewportDatasets();
    };
    let measured = false;
    let committed = false;
    const measure = () => {
      if(!measured){
        refineLegendReserveFromRenderedContent();
        refineContentBoundsFromRenderedSvg();
        measured = true;
      }
      return { ...viewport, legendWidth: legendReserveWidth };
    };
    return Object.assign({}, viewport, {
      getViewport(){ return { ...viewport, legendWidth: legendReserveWidth }; },
      measure,
      commit(){
        if(committed) return true;
        committed = true;
        measure();
        applySvgViewport();
        applyViewportSlot(svg);
        applyViewportSlot(plot);
        if(svgBox?.dataset && svgBox?.style){
          const hasExtension = viewport.extensionWidth > 0 || viewport.extensionHeight > 0;
          if(hasExtension){
            const zoomCandidate = Number(svgBox?.dataset?.resizerZoomLevel || svgBox?.dataset?.resizerZoom);
            const zoomScale = Number.isFinite(zoomCandidate) && zoomCandidate > 0 ? zoomCandidate : 1;
            svgBox.style.setProperty('--graph-content-extra-left', `${format(viewport.leftWidth * zoomScale)}px`);
            svgBox.style.setProperty('--graph-content-extra-top', `${format(viewport.topHeight * zoomScale)}px`);
            svgBox.style.setProperty('--graph-content-extra-right', `${format(viewport.rightWidth * zoomScale)}px`);
            svgBox.style.setProperty('--graph-content-extra-bottom', `${format(viewport.bottomHeight * zoomScale)}px`);
            svgBox.dataset.graphContentEnvelope = 'true';
          }else{
            delete svgBox.dataset.graphContentEnvelope;
            svgBox.style.removeProperty('--graph-content-extra-left');
            svgBox.style.removeProperty('--graph-content-extra-top');
            svgBox.style.removeProperty('--graph-content-extra-right');
            svgBox.style.removeProperty('--graph-content-extra-bottom');
          }
        }
        return true;
      }
    });
  };

  chartStyle.stageLegendViewport = function stageLegendViewport(options){
    const opts = options && typeof options === 'object' ? options : {};
    // The legend compatibility path already has an explicit right-side
    // reserve.  Do not fit the whole SVG here: rotated axis labels and other
    // graph content can legitimately have negative local bounds, and that
    // would turn into a left margin on the canonical frame.
    return chartStyle.stageGraphContentViewport({
      ...opts,
      refineContentBounds: false
    });
  };

  chartStyle.rehydrateGraphContentViewports = function rehydrateGraphContentViewports(root){
    if(!root){
      return 0;
    }
    const svgs = [];
    if(root.matches?.('svg[data-graph-content-base-width], svg[data-legend-base-width][data-legend-reserve-width]')){
      svgs.push(root);
    }
    root.querySelectorAll?.('svg[data-graph-content-base-width], svg[data-legend-base-width][data-legend-reserve-width]').forEach(svg => svgs.push(svg));
    let restored = 0;
    svgs.forEach(svg => {
      const baseWidth = Number(svg.dataset?.graphContentBaseWidth ?? svg.dataset?.legendBaseWidth);
      const reserveWidth = Number(svg.dataset?.legendReserveWidth);
      const contentReserveWidth = Number(svg.dataset?.graphContentReserveRight);
      if(!Number.isFinite(baseWidth) || baseWidth <= 0){
        return;
      }
      const viewBoxValues = String(svg.getAttribute?.('viewBox') || '').trim().split(/[\s,]+/).map(Number);
      const fallbackHeight = Number.isFinite(viewBoxValues[3]) && viewBoxValues[3] > 0 ? viewBoxValues[3] : 1;
      const baseHeight = Number(svg.dataset?.graphContentBaseHeight ?? svg.dataset?.legendBaseHeight);
      const bottomHeight = Number(svg.dataset?.graphContentReserveBottom);
      const leftWidth = Number(svg.dataset?.graphContentReserveLeft);
      const topHeight = Number(svg.dataset?.graphContentReserveTop);
      const minX = Number(svg.dataset?.graphContentEnvelopeMinX);
      const minY = Number(svg.dataset?.graphContentEnvelopeMinY);
      const maxX = Number(svg.dataset?.graphContentEnvelopeMaxX);
      const maxY = Number(svg.dataset?.graphContentEnvelopeMaxY);
      const plot = root !== svg && root.contains?.(svg)
        ? root
        : (svg.parentElement || null);
      chartStyle.stageGraphContentViewport({
        svg,
        plot,
        svgBox: svg.closest?.('.svgbox') || null,
        baseWidth,
        baseHeight: Number.isFinite(baseHeight) && baseHeight > 0 ? baseHeight : fallbackHeight,
        rightWidth: Number.isFinite(contentReserveWidth) && contentReserveWidth >= 0 ? contentReserveWidth : (Number.isFinite(reserveWidth) ? reserveWidth : 0),
        legendWidth: Number.isFinite(reserveWidth) && reserveWidth >= 0 ? reserveWidth : 0,
        bottomHeight: Number.isFinite(bottomHeight) && bottomHeight > 0 ? bottomHeight : 0,
        leftWidth: Number.isFinite(leftWidth) && leftWidth > 0 ? leftWidth : 0,
        topHeight: Number.isFinite(topHeight) && topHeight > 0 ? topHeight : 0,
        contentBounds: {
          minX: Number.isFinite(minX) ? minX : 0,
          minY: Number.isFinite(minY) ? minY : 0,
          maxX: Number.isFinite(maxX) ? maxX : baseWidth,
          maxY: Number.isFinite(maxY) ? maxY : (Number.isFinite(baseHeight) && baseHeight > 0 ? baseHeight : fallbackHeight)
        },
        applySvgViewport: false,
        allowLegendReserveShrink: false
      }).commit();
      restored += 1;
    });
    return restored;
  };

  // Compatibility name retained because component restore hooks predate the
  // generalized content-envelope contract.
  chartStyle.rehydrateLegendViewports = chartStyle.rehydrateGraphContentViewports;

  chartStyle.hasCurrentLegendViewportContract = function hasCurrentLegendViewportContract(root){
    if(!root){
      return true;
    }
    const legends = [];
    if(root.matches?.('[data-legend-viewport-content="true"]')){
      legends.push(root);
    }
    root.querySelectorAll?.('[data-legend-viewport-content="true"]').forEach(node => legends.push(node));
    return legends.every(legend => Number.isFinite(Number(legend.dataset?.legendCanonicalOriginX)));
  };

  chartStyle.drawPlotFrame = function drawPlotFrame(options){
    const opts = options || {};
    const svg = opts.svg;
    const margin = opts.margin;
    const plotW = Number(opts.plotW);
    const plotH = Number(opts.plotH);
    const doc = svg && (svg.ownerDocument || global.document);
    const stroke = opts.stroke || "#000";
    const strokeWidth = Number.isFinite(opts.strokeWidth) && opts.strokeWidth > 0 ? Number(opts.strokeWidth) : null;
    let sides = Array.isArray(opts.sides) ? opts.sides.slice() : (opts.sides === "all" ? ["top","right","bottom","left"] : []);
    if(!sides.length){ sides = ["top","right"]; }
    if(!svg || !margin || !Number.isFinite(plotW) || !Number.isFinite(plotH) || plotW <= 0 || plotH <= 0 || !doc){
      console.debug("Debug: chartStyle.drawPlotFrame skipped", { hasSvg: !!svg, hasMargin: !!margin, plotW, plotH, sides }); // Debug: frame skip reasoning
      return [];
    }
    const group = opts.group && typeof opts.group.appendChild === 'function' ? opts.group : svg;
    const coords = {
      top: { x1: margin.left, y1: margin.top, x2: margin.left + plotW, y2: margin.top },
      right: { x1: margin.left + plotW, y1: margin.top, x2: margin.left + plotW, y2: margin.top + plotH },
      bottom: { x1: margin.left, y1: margin.top + plotH, x2: margin.left + plotW, y2: margin.top + plotH },
      left: { x1: margin.left, y1: margin.top, x2: margin.left, y2: margin.top + plotH }
    };
    const drawn = [];
    sides.forEach(side => {
      const pos = coords[side];
      if(!pos) return;
      const line = doc && doc.createElementNS ? doc.createElementNS(NS, 'line') : null;
      if(!line) return;
      line.setAttribute('x1', pos.x1);
      line.setAttribute('y1', pos.y1);
      line.setAttribute('x2', pos.x2);
      line.setAttribute('y2', pos.y2);
      line.setAttribute('stroke', stroke);
      line.setAttribute('stroke-linecap', 'square');
      line.setAttribute('data-frame-edge', side);
      if(strokeWidth !== null){
        line.setAttribute('stroke-width', strokeWidth);
      }
      group.appendChild(line);
      drawn.push(side);
    });
    console.debug("Debug: chartStyle.drawPlotFrame applied", { sides: drawn, stroke, plotW, plotH, strokeWidth: strokeWidth ?? 'auto' }); // Debug: frame draw summary with stroke scaling
    return drawn;
  };

  const labelLayout = Shared.labelLayout = Shared.labelLayout || {};
  const POINT_LABEL_DEFAULT_FONT_SIZE_PT = 10;
  const POINT_LABEL_DEFAULT_FONT_SIZE_PX = POINT_LABEL_DEFAULT_FONT_SIZE_PT * PT_TO_PX;
  const POINT_LABEL_MIN_FONT_SIZE_PT = 7;
  const POINT_LABEL_MIN_FONT_SIZE_PX = POINT_LABEL_MIN_FONT_SIZE_PT * PT_TO_PX;

  labelLayout.POINT_LABEL_DEFAULT_FONT_SIZE_PT = POINT_LABEL_DEFAULT_FONT_SIZE_PT;
  labelLayout.POINT_LABEL_DEFAULT_FONT_SIZE_PX = POINT_LABEL_DEFAULT_FONT_SIZE_PX;
  labelLayout.POINT_LABEL_MIN_FONT_SIZE_PT = POINT_LABEL_MIN_FONT_SIZE_PT;
  labelLayout.POINT_LABEL_MIN_FONT_SIZE_PX = POINT_LABEL_MIN_FONT_SIZE_PX;

  labelLayout.resolvePointLabelBaseFontSize = function resolvePointLabelBaseFontSize(){
    return POINT_LABEL_DEFAULT_FONT_SIZE_PX;
  };

  labelLayout.resolvePointLabelLeaderGeometry = function resolvePointLabelLeaderGeometry(bbox, point, options){
    const minX = Number(bbox?.minX) || 0;
    const maxX = Number(bbox?.maxX) || 0;
    const minY = Number(bbox?.minY) || 0;
    const maxY = Number(bbox?.maxY) || 0;
    const cx = Number(point?.cx) || 0;
    const cy = Number(point?.cy) || 0;
    const textY = Number(options?.textY) || 0;
    const leaderGap = Math.max(2, Number(options?.leaderGap) || 2);
    const sourceRadius = Math.max(0, Number(options?.sourceRadius) || 0);
    const startX = minX - leaderGap;
    const endX = maxX + leaderGap;
    const topY = minY - leaderGap;
    const bottomY = maxY + leaderGap;
    const trimSource = points => {
      if(sourceRadius <= 0 || points.length < 2){
        return points;
      }
      const dx = points[1].x - cx;
      const dy = points[1].y - cy;
      const length = Math.hypot(dx, dy);
      if(length <= sourceRadius + 0.5){
        return points;
      }
      const inset = Math.min(length * 0.45, sourceRadius);
      return [
        { x: cx + dx * inset / length, y: cy + dy * inset / length },
        ...points.slice(1)
      ];
    };
    if(cx <= startX + 1e-6){
      return {
        style: 'straight',
        side: 'start',
        points: trimSource([{ x: cx, y: cy }, { x: minX, y: textY }]),
        outsidePenalty: 0
      };
    }
    if(cx >= endX - 1e-6){
      return {
        style: 'straight',
        side: 'end',
        points: trimSource([{ x: cx, y: cy }, { x: maxX, y: textY }]),
        outsidePenalty: 0
      };
    }
    if(cy <= topY + 1e-6 && cx >= minX && cx <= maxX){
      return {
        style: 'straight',
        side: 'top',
        points: trimSource([{ x: cx, y: cy }, { x: cx, y: minY }]),
        outsidePenalty: 0
      };
    }
    if(cy >= bottomY - 1e-6 && cx >= minX && cx <= maxX){
      return {
        style: 'straight',
        side: 'bottom',
        points: trimSource([{ x: cx, y: cy }, { x: cx, y: maxY }]),
        outsidePenalty: 0
      };
    }
    return null;
  };

  labelLayout.resolvePinnedPointLabelPlacement = function resolvePinnedPointLabelPlacement(entry, position, options){
    const cx = Number(entry?.cx) || 0;
    const cy = Number(entry?.cy) || 0;
    const textWidth = Math.max(1, Number(options?.textWidth) || 1);
    const labelHeight = Math.max(1, Number(options?.labelHeight) || 1);
    const leaderGap = Math.max(2, Number(options?.leaderGap) || 2);
    const containerLeft = Number.isFinite(Number(options?.containerLeft)) ? Number(options.containerLeft) : 0;
    const containerRight = Number.isFinite(Number(options?.containerRight)) ? Number(options.containerRight) : containerLeft + textWidth + 4;
    const containerTop = Number.isFinite(Number(options?.containerTop)) ? Number(options.containerTop) : 0;
    const containerBottom = Number.isFinite(Number(options?.containerBottom)) ? Number(options.containerBottom) : containerTop + labelHeight + 4;
    const padding = Math.max(0, Number(options?.containerPadding) || 2);
    const anchor = position?.anchor === 'end' || position?.anchor === 'middle' ? position.anchor : 'start';
    const proposedX = Number(position?.x);
    const proposedY = Number(position?.y);
    if(!Number.isFinite(proposedX) || !Number.isFinite(proposedY)){
      return null;
    }
    const boxFromText = (textX, textY) => ({
      minX: anchor === 'start' ? textX : (anchor === 'end' ? textX - textWidth : textX - textWidth * 0.5),
      maxX: anchor === 'start' ? textX + textWidth : (anchor === 'end' ? textX : textX + textWidth * 0.5),
      minY: textY - labelHeight * 0.5,
      maxY: textY + labelHeight * 0.5
    });
    const textFromBox = box => ({
      x: anchor === 'start' ? box.minX : (anchor === 'end' ? box.maxX : (box.minX + box.maxX) * 0.5),
      y: (box.minY + box.maxY) * 0.5
    });
    const clampBox = source => {
      const box = { ...source };
      let shiftX = 0;
      let shiftY = 0;
      if(box.minX < containerLeft + padding){ shiftX = containerLeft + padding - box.minX; }
      else if(box.maxX > containerRight - padding){ shiftX = containerRight - padding - box.maxX; }
      if(box.minY < containerTop + padding){ shiftY = containerTop + padding - box.minY; }
      else if(box.maxY > containerBottom - padding){ shiftY = containerBottom - padding - box.maxY; }
      box.minX += shiftX;
      box.maxX += shiftX;
      box.minY += shiftY;
      box.maxY += shiftY;
      return box;
    };
    const fitsContainer = box => box.minX >= containerLeft + padding - 1e-6
      && box.maxX <= containerRight - padding + 1e-6
      && box.minY >= containerTop + padding - 1e-6
      && box.maxY <= containerBottom - padding + 1e-6;
    const makePlacement = box => {
      const clamped = clampBox(box);
      if(!fitsContainer(clamped)){ return null; }
      const text = textFromBox(clamped);
      const geometry = labelLayout.resolvePointLabelLeaderGeometry(clamped, { cx, cy }, {
        textY: text.y,
        leaderGap,
        sourceRadius: Math.max(0, Number(entry?.radius) || 0)
      });
      if(!geometry){ return null; }
      const leaderSegments = geometry.points.slice(1).map((point, index) => ({
        x1: geometry.points[index].x,
        y1: geometry.points[index].y,
        x2: point.x,
        y2: point.y
      }));
      return {
        textX: text.x,
        textY: text.y,
        anchor,
        leaderStyle: geometry.style,
        leaderSide: geometry.side,
        leaderPoints: geometry.points,
        leaderSegments,
        bbox: clamped,
        envelope: leaderSegments.reduce((envelope, segment) => ({
          minX: Math.min(envelope.minX, segment.x1, segment.x2),
          maxX: Math.max(envelope.maxX, segment.x1, segment.x2),
          minY: Math.min(envelope.minY, segment.y1, segment.y2),
          maxY: Math.max(envelope.maxY, segment.y1, segment.y2)
        }), { ...clamped }),
        outsidePenalty: 0,
        aesthetic: 0,
        pinned: true
      };
    };
    const proposedBox = clampBox(boxFromText(proposedX, proposedY));
    const direct = makePlacement(proposedBox);
    if(direct){ return direct; }
    const width = proposedBox.maxX - proposedBox.minX;
    const height = proposedBox.maxY - proposedBox.minY;
    const candidates = [];
    const addCandidate = box => {
      const placement = makePlacement(box);
      if(!placement){ return; }
      const dx = placement.textX - proposedX;
      const dy = placement.textY - proposedY;
      candidates.push({ placement, distance: dx * dx + dy * dy });
    };
    addCandidate({ ...proposedBox, minX: cx + leaderGap, maxX: cx + leaderGap + width });
    addCandidate({ ...proposedBox, minX: cx - leaderGap - width, maxX: cx - leaderGap });
    const verticalMinX = Math.min(Math.max(cx - width * 0.5, containerLeft + padding), containerRight - padding - width);
    addCandidate({ minX: verticalMinX, maxX: verticalMinX + width, minY: cy + leaderGap, maxY: cy + leaderGap + height });
    addCandidate({ minX: verticalMinX, maxX: verticalMinX + width, minY: cy - leaderGap - height, maxY: cy - leaderGap });
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates[0]?.placement || null;
  };

  labelLayout.enablePointLabelDrag = function enablePointLabelDrag(options = {}){
    const textNode = options.textNode;
    const leaderNode = options.leaderNode;
    const svg = options.svg;
    const entry = options.entry;
    const initialPlacement = options.placement;
    if(!textNode || !leaderNode || !svg || !entry || !initialPlacement || typeof Shared.enableLabelDrag !== 'function'){
      return false;
    }
    const containerLeft = Number.isFinite(Number(options.containerLeft)) ? Number(options.containerLeft) : 0;
    const containerRight = Number(options.containerRight);
    const containerTop = Number.isFinite(Number(options.containerTop)) ? Number(options.containerTop) : 0;
    const containerBottom = Number(options.containerBottom);
    if(!Number.isFinite(containerRight) || !Number.isFinite(containerBottom)){
      return false;
    }
    const textWidth = Math.max(1, initialPlacement.bbox.maxX - initialPlacement.bbox.minX);
    const labelHeight = Math.max(1, initialPlacement.bbox.maxY - initialPlacement.bbox.minY);
    const anchor = initialPlacement.anchor || 'start';
    let currentPlacement = initialPlacement;
    const applyLeader = placement => {
      const start = placement?.leaderPoints?.[0];
      const end = placement?.leaderPoints?.[1];
      if(!start || !end){ return; }
      leaderNode.setAttribute('x1', String(start.x));
      leaderNode.setAttribute('y1', String(start.y));
      leaderNode.setAttribute('x2', String(end.x));
      leaderNode.setAttribute('y2', String(end.y));
    };
    const resolve = position => {
      const placement = labelLayout.resolvePinnedPointLabelPlacement(entry, {
        x: position.x,
        y: position.y,
        anchor
      }, {
        textWidth,
        labelHeight,
        leaderGap: options.leaderGap,
        containerLeft,
        containerRight,
        containerTop,
        containerBottom
      });
      if(placement){ currentPlacement = placement; }
      return placement || currentPlacement;
    };
    textNode.setAttribute('pointer-events', 'all');
    textNode.setAttribute('data-point-label-key', String(entry.labelKey || ''));
    if(textNode.dataset){
      textNode.dataset.pointLabelContainerLeft = String(containerLeft);
      textNode.dataset.pointLabelContainerRight = String(containerRight);
      textNode.dataset.pointLabelContainerTop = String(containerTop);
      textNode.dataset.pointLabelContainerBottom = String(containerBottom);
    }
    applyLeader(initialPlacement);
    Shared.enableLabelDrag(textNode, svg, {
      normalizeDuringDrag: true,
      recordUndo: true,
      normalizePosition(position){
        const placement = resolve(position);
        return { x: placement.textX, y: placement.textY };
      },
      onDragMove(position){
        const placement = resolve(position);
        applyLeader(placement);
      },
      onPositionChange(position){
        const placement = resolve(position);
        applyLeader(placement);
        if(typeof options.onPositionChange === 'function'){
          const width = Math.max(1, containerRight - containerLeft);
          const height = Math.max(1, containerBottom - containerTop);
          options.onPositionChange({
            x: placement.textX,
            y: placement.textY,
            relX: (placement.textX - containerLeft) / width,
            relY: (placement.textY - containerTop) / height,
            anchor: placement.anchor
          });
        }
      }
    });
    return true;
  };

  labelLayout.computeConvexHull2d = function computeConvexHull2d(points){
    if(!Array.isArray(points) || points.length === 0){
      return [];
    }
    const cleaned = [];
    for(let i = 0; i < points.length; i += 1){
      const pt = points[i];
      const x = Number(pt?.x);
      const y = Number(pt?.y);
      if(Number.isFinite(x) && Number.isFinite(y)){
        cleaned.push({ x, y });
      }
    }
    if(cleaned.length <= 2){
      return cleaned;
    }
    const sorted = cleaned.slice().sort((a, b) => {
      if(a.x === b.x){
        return a.y - b.y;
      }
      return a.x - b.x;
    });
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower = [];
    for(let i = 0; i < sorted.length; i += 1){
      const p = sorted[i];
      while(lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0){
        lower.pop();
      }
      lower.push(p);
    }
    const upper = [];
    for(let i = sorted.length - 1; i >= 0; i -= 1){
      const p = sorted[i];
      while(upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0){
        upper.pop();
      }
      upper.push(p);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
  };

  labelLayout.readFontSizeFromNodes = function readFontSizeFromNodes(nodes){
    if(!nodes || typeof nodes.length !== 'number'){
      return null;
    }
    let minSize = Infinity;
    let found = false;
    for(let i = 0; i < nodes.length; i += 1){
      const node = nodes[i];
      const attr = node && typeof node.getAttribute === 'function' ? node.getAttribute('font-size') : null;
      const size = Number.parseFloat(attr);
      if(Number.isFinite(size) && size > 0){
        found = true;
        if(size < minSize){
          minSize = size;
        }
      }
    }
    if(!found){
      return null;
    }
    return minSize;
  };

  labelLayout.computePointLabelLayout = function computePointLabelLayout(entries, options){
    if(!Array.isArray(entries) || !entries.length){
      return [];
    }
    const plotLeft = Number(options?.plotLeft) || 0;
    const plotRight = Number(options?.plotRight) || 0;
    const plotTop = Number(options?.plotTop) || 0;
    const plotBottom = Number(options?.plotBottom) || 0;
    const resolveContainerEdge = (value, fallback) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : fallback;
    };
    const containerLeft = resolveContainerEdge(options?.containerLeft, plotLeft);
    const containerRight = resolveContainerEdge(options?.containerRight, plotRight);
    const containerTop = resolveContainerEdge(options?.containerTop, plotTop);
    const containerBottom = resolveContainerEdge(options?.containerBottom, plotBottom);
    const labelFontSize = Math.max(6, Number(options?.labelFontSize) || 10);
    const leaderGap = Math.max(2, Number(options?.leaderGap) || 2);
    const leaderScale = Math.max(0.45, Math.min(1, Number(options?.leaderScale) || 1));
    const angleSteps = Math.max(8, Math.min(36, Number(options?.angleSteps) || 16));
    const maxLeaderScale = Math.max(1, Math.min(5, Number(options?.maxLeaderScale) || 5));
    const labelClearance = Math.max(1.5, labelFontSize * 0.12);
    const leaderClearance = Math.max(1, labelFontSize * 0.08);
    const pointClearance = Math.max(1, labelFontSize * 0.1);
    const measureText = typeof options?.measureText === 'function' ? options.measureText : null;
    const font = options?.font || null;
    const fontStyles = options?.fontStyles && typeof options.fontStyles === 'object'
      ? options.fontStyles
      : null;
    const enforceHull = options?.enforceHull === true;
    const hullPenalty = Math.max(1, Number(options?.hullPenalty) || 14);
    const pointObstacleMap = new Map();
    (Array.isArray(options?.pointBounds) ? options.pointBounds : []).forEach((point, index) => {
      const normalized = {
        cx: Number(point?.cx) || 0,
        cy: Number(point?.cy) || 0,
        r: Math.max(0, Number(point?.r) || 0),
        pointId: point?.pointId ?? index,
        count: 1
      };
      const key = `${Math.round(normalized.cx * 100)}:${Math.round(normalized.cy * 100)}:${Math.round(normalized.r * 100)}`;
      const existing = pointObstacleMap.get(key);
      if(existing){
        existing.count += 1;
        existing.pointId = null;
      }else{
        pointObstacleMap.set(key, normalized);
      }
    });
    const pointBounds = Array.from(pointObstacleMap.values());
    const obstacleBoxes = Array.isArray(options?.obstacleBoxes) ? options.obstacleBoxes : [];
    const obstacleSegments = Array.isArray(options?.obstacleSegments) ? options.obstacleSegments : [];
    const normalizedHull = (Array.isArray(options?.plotHull) ? options.plotHull : [])
      .map(point => ({ x: Number(point?.x), y: Number(point?.y) }))
      .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
    if(normalizedHull.length < 3){
      normalizedHull.length = 0;
    }

    const makeScore = (collisions = 0, severity = 0, aesthetic = 0) => ({ collisions, severity, aesthetic });
    const addScore = (target, source) => {
      target.collisions += source.collisions;
      target.severity += source.severity;
      target.aesthetic += source.aesthetic;
      return target;
    };
    const compareScores = (a, b) => {
      if(a.collisions !== b.collisions){ return a.collisions - b.collisions; }
      if(a.severity !== b.severity){ return a.severity - b.severity; }
      const aestheticDelta = a.aesthetic - b.aesthetic;
      return Math.abs(aestheticDelta) > 1e-9 ? aestheticDelta : 0;
    };
    const pointOnSegment = (px, py, ax, ay, bx, by) => {
      const cross = (px - ax) * (by - ay) - (py - ay) * (bx - ax);
      if(Math.abs(cross) > 1e-6){ return false; }
      const dot = (px - ax) * (bx - ax) + (py - ay) * (by - ay);
      const lengthSq = (bx - ax) ** 2 + (by - ay) ** 2;
      return dot >= -1e-6 && dot <= lengthSq + 1e-6;
    };
    const pointInPolygon = (x, y, polygon) => {
      if(polygon.length < 3){ return true; }
      let inside = false;
      for(let i = 0, j = polygon.length - 1; i < polygon.length; j = i++){
        const a = polygon[i];
        const b = polygon[j];
        if(pointOnSegment(x, y, a.x, a.y, b.x, b.y)){ return true; }
        if(((a.y > y) !== (b.y > y)) && (x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x)){
          inside = !inside;
        }
      }
      return inside;
    };
    const boxInsideHull = box => !normalizedHull.length || (
      pointInPolygon(box.minX, box.minY, normalizedHull)
      && pointInPolygon(box.maxX, box.minY, normalizedHull)
      && pointInPolygon(box.maxX, box.maxY, normalizedHull)
      && pointInPolygon(box.minX, box.maxY, normalizedHull)
    );
    const nudgeBoxInsideHull = (box, sourceX, sourceY) => {
      if(!normalizedHull.length || boxInsideHull(box)){
        return { shiftX: 0, shiftY: 0, inside: true };
      }
      const dx = sourceX - (box.minX + box.maxX) / 2;
      const dy = sourceY - (box.minY + box.maxY) / 2;
      for(let step = 1; step <= 12; step += 1){
        const factor = step / 12;
        const shifted = {
          minX: box.minX + dx * factor,
          maxX: box.maxX + dx * factor,
          minY: box.minY + dy * factor,
          maxY: box.maxY + dy * factor
        };
        if(boxInsideHull(shifted)){
          return { shiftX: dx * factor, shiftY: dy * factor, inside: true };
        }
      }
      return { shiftX: 0, shiftY: 0, inside: false };
    };
    const boxesIntersect = (a, b, clearance = 0) => a.minX < b.maxX + clearance
      && a.maxX > b.minX - clearance
      && a.minY < b.maxY + clearance
      && a.maxY > b.minY - clearance;
    const circleIntersectsBox = (point, box, clearance = 0) => {
      const nearestX = Math.max(box.minX, Math.min(point.cx, box.maxX));
      const nearestY = Math.max(box.minY, Math.min(point.cy, box.maxY));
      return Math.hypot(point.cx - nearestX, point.cy - nearestY) < point.r + clearance;
    };
    const distancePointToSegment = (px, py, segment) => {
      const dx = segment.x2 - segment.x1;
      const dy = segment.y2 - segment.y1;
      if(dx === 0 && dy === 0){ return Math.hypot(px - segment.x1, py - segment.y1); }
      const raw = ((px - segment.x1) * dx + (py - segment.y1) * dy) / (dx * dx + dy * dy);
      const t = Math.max(0, Math.min(1, raw));
      return Math.hypot(px - (segment.x1 + t * dx), py - (segment.y1 + t * dy));
    };
    const segmentsIntersect = (a, b) => {
      const orient = (p, q, r) => (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
      const p1 = { x: a.x1, y: a.y1 };
      const q1 = { x: a.x2, y: a.y2 };
      const p2 = { x: b.x1, y: b.y1 };
      const q2 = { x: b.x2, y: b.y2 };
      const o1 = orient(p1, q1, p2);
      const o2 = orient(p1, q1, q2);
      const o3 = orient(p2, q2, p1);
      const o4 = orient(p2, q2, q1);
      if(Math.abs(o1) < 1e-6 && pointOnSegment(p2.x, p2.y, p1.x, p1.y, q1.x, q1.y)){ return true; }
      if(Math.abs(o2) < 1e-6 && pointOnSegment(q2.x, q2.y, p1.x, p1.y, q1.x, q1.y)){ return true; }
      if(Math.abs(o3) < 1e-6 && pointOnSegment(p1.x, p1.y, p2.x, p2.y, q2.x, q2.y)){ return true; }
      if(Math.abs(o4) < 1e-6 && pointOnSegment(q1.x, q1.y, p2.x, p2.y, q2.x, q2.y)){ return true; }
      return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
    };
    const segmentDistance = (a, b) => {
      if(segmentsIntersect(a, b)){ return 0; }
      return Math.min(
        distancePointToSegment(a.x1, a.y1, b),
        distancePointToSegment(a.x2, a.y2, b),
        distancePointToSegment(b.x1, b.y1, a),
        distancePointToSegment(b.x2, b.y2, a)
      );
    };
    const segmentIntersectsBox = (segment, box, clearance = 0) => {
      const expanded = {
        minX: box.minX - clearance,
        maxX: box.maxX + clearance,
        minY: box.minY - clearance,
        maxY: box.maxY + clearance
      };
      const inside = (x, y) => x >= expanded.minX && x <= expanded.maxX && y >= expanded.minY && y <= expanded.maxY;
      if(inside(segment.x1, segment.y1) || inside(segment.x2, segment.y2)){ return true; }
      const edges = [
        { x1: expanded.minX, y1: expanded.minY, x2: expanded.maxX, y2: expanded.minY },
        { x1: expanded.maxX, y1: expanded.minY, x2: expanded.maxX, y2: expanded.maxY },
        { x1: expanded.maxX, y1: expanded.maxY, x2: expanded.minX, y2: expanded.maxY },
        { x1: expanded.minX, y1: expanded.maxY, x2: expanded.minX, y2: expanded.minY }
      ];
      return edges.some(edge => segmentsIntersect(segment, edge));
    };
    const pathIntersectsBox = (segments, box, clearance = 0) => segments.some(segment => segmentIntersectsBox(segment, box, clearance));
    const pathsConflict = (a, b, clearance = 0) => a.some(first => b.some(second => segmentDistance(first, second) < clearance));
    const leaderSegmentsFromPoints = points => points.slice(1).map((point, index) => ({
      x1: points[index].x,
      y1: points[index].y,
      x2: point.x,
      y2: point.y
    }));
    const leaderLength = segments => segments.reduce((total, segment) => total + Math.hypot(
      segment.x2 - segment.x1,
      segment.y2 - segment.y1
    ), 0);
    const envelopeFor = (box, segments) => segments.reduce((envelope, segment) => ({
      minX: Math.min(envelope.minX, segment.x1, segment.x2),
      maxX: Math.max(envelope.maxX, segment.x1, segment.x2),
      minY: Math.min(envelope.minY, segment.y1, segment.y2),
      maxY: Math.max(envelope.maxY, segment.y1, segment.y2)
    }), { ...box });

    const maxPointRadius = pointBounds.reduce((maximum, point) => Math.max(maximum, point.r), 0);
    const pointCellSize = Math.max(16, labelFontSize * 2, maxPointRadius * 2 + pointClearance);
    const pointGrid = new Map();
    if(pointBounds.length > 128){
      pointBounds.forEach(point => {
        const cellX = Math.floor(point.cx / pointCellSize);
        const cellY = Math.floor(point.cy / pointCellSize);
        const key = `${cellX}:${cellY}`;
        const bucket = pointGrid.get(key) || [];
        bucket.push(point);
        pointGrid.set(key, bucket);
      });
    }
    const queryPoints = envelope => {
      if(!pointGrid.size){ return pointBounds; }
      const minCellX = Math.floor((envelope.minX - maxPointRadius - pointClearance) / pointCellSize);
      const maxCellX = Math.floor((envelope.maxX + maxPointRadius + pointClearance) / pointCellSize);
      const minCellY = Math.floor((envelope.minY - maxPointRadius - pointClearance) / pointCellSize);
      const maxCellY = Math.floor((envelope.maxY + maxPointRadius + pointClearance) / pointCellSize);
      if((maxCellX - minCellX + 1) * (maxCellY - minCellY + 1) > 256){ return pointBounds; }
      const points = [];
      for(let cellX = minCellX; cellX <= maxCellX; cellX += 1){
        for(let cellY = minCellY; cellY <= maxCellY; cellY += 1){
          const bucket = pointGrid.get(`${cellX}:${cellY}`);
          if(bucket){ points.push(...bucket); }
        }
      }
      return points;
    };
    const isOwnPoint = (entry, point) => {
      if(entry?.pointId !== null && entry?.pointId !== undefined){
        return point.count === 1 && entry.pointId === point.pointId;
      }
      return point.count === 1
        && Math.abs((Number(entry?.cx) || 0) - point.cx) < 1e-6
        && Math.abs((Number(entry?.cy) || 0) - point.cy) < 1e-6;
    };
    const estimateWidth = (text, fontSpec, fontSize) => {
      if(measureText && fontSpec){
        const measured = measureText(text, fontSpec);
        const width = Number.isFinite(measured) ? measured : Number(measured?.width);
        if(Number.isFinite(width) && width > 0){ return width; }
      }
      return Math.max(fontSize * 0.6, text.length * fontSize * 0.6);
    };
    const staticCollisionScore = (entry, candidate, insideHull) => {
      const score = makeScore(0, 0, candidate.aesthetic);
      queryPoints(candidate.envelope).forEach(point => {
        if(circleIntersectsBox(point, candidate.bbox, pointClearance)){
          score.collisions += 1;
          score.severity += 12;
        }
        if(!isOwnPoint(entry, point) && candidate.leaderSegments.some(segment =>
          distancePointToSegment(point.cx, point.cy, segment) < point.r + pointClearance)){
          score.collisions += 1;
          score.severity += 7;
        }
      });
      obstacleBoxes.forEach(box => {
        if(boxesIntersect(candidate.bbox, box, labelClearance)){
          score.collisions += 1;
          score.severity += 12;
        }
        if(pathIntersectsBox(candidate.leaderSegments, box, leaderClearance)){
          score.collisions += 1;
          score.severity += 9;
        }
      });
      obstacleSegments.forEach(segment => {
        if(segmentIntersectsBox(segment, candidate.bbox, labelClearance)){
          score.collisions += 1;
          score.severity += 10;
        }
        if(candidate.leaderSegments.some(leader => segmentDistance(leader, segment) < leaderClearance)){
          score.collisions += 1;
          score.severity += 6;
        }
      });
      const overflow = Math.max(0, containerLeft - candidate.bbox.minX)
        + Math.max(0, candidate.bbox.maxX - containerRight)
        + Math.max(0, containerTop - candidate.bbox.minY)
        + Math.max(0, candidate.bbox.maxY - containerBottom);
      if(overflow > 0){
        score.collisions += 1;
        score.severity += 15 + overflow;
      }
      if(candidate.outsidePenalty > 0){
        score.collisions += 1;
        score.severity += 12 + candidate.outsidePenalty;
      }
      if(normalizedHull.length && (!insideHull || (enforceHull && candidate.leaderPoints.some(point =>
        !pointInPolygon(point.x, point.y, normalizedHull))))){
        score.collisions += 1;
        score.severity += hullPenalty;
      }
      return score;
    };

    const tau = Math.PI * 2;
    const angles = Array.from({ length: angleSteps }, (_, index) => index * tau / angleSteps);
    const ringStep = entries.length <= 80 ? 0.5 : 1;
    const scaleSteps = [];
    for(let scale = 1; scale <= maxLeaderScale + 1e-6; scale += ringStep){
      scaleSteps.push(scale);
    }
    const candidateBudget = Math.max(24, Math.min(160, Number(options?.maxCandidatesPerLabel) || (
      entries.length <= 24 ? 160 : entries.length <= 80 ? 96 : entries.length <= 200 ? 64 : 40
    )));
    let candidateId = 0;
    const buildCandidates = model => {
      const { entry, cx, cy, textWidth, baseOffset, fontSize, fontSpec, labelHeight: modelLabelHeight, leaderGap: modelLeaderGap } = model;
      const pinned = entry?.pinnedPosition && typeof entry.pinnedPosition === 'object'
        ? entry.pinnedPosition
        : null;
      if(pinned){
        const width = Math.max(1, containerRight - containerLeft);
        const height = Math.max(1, containerBottom - containerTop);
        const pinnedX = Number.isFinite(Number(pinned.relX))
          ? containerLeft + Number(pinned.relX) * width
          : Number(pinned.x);
        const pinnedY = Number.isFinite(Number(pinned.relY))
          ? containerTop + Number(pinned.relY) * height
          : Number(pinned.y);
        const placement = labelLayout.resolvePinnedPointLabelPlacement(entry, {
          x: pinnedX,
          y: pinnedY,
          anchor: pinned.anchor
        }, {
          textWidth,
          labelHeight: modelLabelHeight,
          leaderGap: modelLeaderGap,
          containerLeft,
          containerRight,
          containerTop,
          containerBottom
        });
        if(!placement){ return []; }
        const candidate = {
          id: candidateId++,
          ...placement,
          fontSize,
          fontSpec,
          leaderGap: modelLeaderGap
        };
        candidate.staticScore = staticCollisionScore(entry, candidate, boxInsideHull(candidate.bbox));
        return [candidate];
      }
      const candidates = [];
      const seen = new Set();
      angles.forEach(angle => {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        scaleSteps.forEach(scale => {
          let textX = cx + cos * baseOffset * scale;
          let textY = cy + sin * baseOffset * scale;
          const anchor = cos >= 0 ? 'start' : 'end';
          let bbox = {
            minX: anchor === 'start' ? textX : textX - textWidth,
            maxX: anchor === 'start' ? textX + textWidth : textX,
            minY: textY - modelLabelHeight * 0.5,
            maxY: textY + modelLabelHeight * 0.5
          };
          let shiftX = 0;
          let shiftY = 0;
          if(bbox.minX < containerLeft + 2){ shiftX = containerLeft + 2 - bbox.minX; }
          else if(bbox.maxX > containerRight - 2){ shiftX = containerRight - 2 - bbox.maxX; }
          if(bbox.minY < containerTop + 2){ shiftY = containerTop + 2 - bbox.minY; }
          else if(bbox.maxY > containerBottom - 2){ shiftY = containerBottom - 2 - bbox.maxY; }
          if(shiftX || shiftY){
            textX += shiftX;
            textY += shiftY;
            bbox = {
              minX: bbox.minX + shiftX,
              maxX: bbox.maxX + shiftX,
              minY: bbox.minY + shiftY,
              maxY: bbox.maxY + shiftY
            };
          }
          if(bbox.minX < containerLeft + 2 - 1e-6
            || bbox.maxX > containerRight - 2 + 1e-6
            || bbox.minY < containerTop + 2 - 1e-6
            || bbox.maxY > containerBottom - 2 + 1e-6){
            return;
          }
          let insideHull = boxInsideHull(bbox);
          if(normalizedHull.length && enforceHull && !insideHull){
            const nudge = nudgeBoxInsideHull(bbox, cx, cy);
            const nudgedBox = {
              minX: bbox.minX + nudge.shiftX,
              maxX: bbox.maxX + nudge.shiftX,
              minY: bbox.minY + nudge.shiftY,
              maxY: bbox.maxY + nudge.shiftY
            };
            const nudgedGeometry = labelLayout.resolvePointLabelLeaderGeometry(nudgedBox, { cx, cy }, {
              textY: textY + nudge.shiftY,
              leaderGap: modelLeaderGap,
              sourceRadius: Math.max(0, Number(entry?.radius) || 0)
            });
            if(nudge.inside && nudgedGeometry && (nudge.shiftX || nudge.shiftY)){
              textX += nudge.shiftX;
              textY += nudge.shiftY;
              bbox = nudgedBox;
            }
            insideHull = nudge.inside && !!nudgedGeometry;
          }
          if(bbox.minX < containerLeft + 2 - 1e-6
            || bbox.maxX > containerRight - 2 + 1e-6
            || bbox.minY < containerTop + 2 - 1e-6
            || bbox.maxY > containerBottom - 2 + 1e-6){
            return;
          }
          const geometry = labelLayout.resolvePointLabelLeaderGeometry(bbox, { cx, cy }, {
            textY,
            leaderGap: modelLeaderGap,
            sourceRadius: Math.max(0, Number(entry?.radius) || 0)
          });
          if(geometry){
            const key = [
              Math.round(textX * 10), Math.round(textY * 10), anchor,
              geometry.side
            ].join(':');
            if(seen.has(key)){ return; }
            seen.add(key);
            const leaderSegments = leaderSegmentsFromPoints(geometry.points);
            const verticalPreference = (sin + 1) * 0.06;
            const verticalAttachmentCost = geometry.side === 'top' || geometry.side === 'bottom' ? 0.4 : 0;
            const shiftCost = Math.hypot(shiftX, shiftY) / Math.max(1, fontSize) * 0.04;
            const candidate = {
              id: candidateId++,
              textX,
              textY,
              anchor,
              leaderStyle: geometry.style,
              leaderSide: geometry.side,
              leaderPoints: geometry.points,
              leaderSegments,
              bbox,
              fontSize,
              fontSpec,
              leaderGap: modelLeaderGap,
              outsidePenalty: geometry.outsidePenalty || 0,
              aesthetic: (scale - 1) * 0.14
                + leaderLength(leaderSegments) / Math.max(1, baseOffset) * 0.035
                + verticalPreference + verticalAttachmentCost + shiftCost
            };
            candidate.envelope = envelopeFor(bbox, leaderSegments);
            candidate.staticScore = staticCollisionScore(entry, candidate, insideHull);
            candidates.push(candidate);
          }
        });
      });
      candidates.sort((a, b) => compareScores(a.staticScore, b.staticScore) || a.id - b.id);
      return candidates.slice(0, candidateBudget);
    };

    let models = entries.map(entry => {
      const text = entry?.text ? String(entry.text).trim() : '';
      if(!text){ return null; }
      const cx = Number(entry?.cx) || 0;
      const cy = Number(entry?.cy) || 0;
      const fontKey = typeof entry?.fontKey === 'string' && entry.fontKey.trim()
        ? entry.fontKey.trim()
        : (entry?.labelKey ? `pointLabel:${entry.labelKey}` : '');
      const fontMetrics = chartStyle.resolveScopedLabelMeasureFont({
        styles: fontStyles,
        collection: 'labels',
        role: fontKey,
        fallbackPx: labelFontSize
      });
      const fontSize = Math.max(6, Number(fontMetrics?.fontSizePx) || labelFontSize);
      const fontSpec = fontMetrics?.fontSpec || font || chartStyle.makeFont(fontSize);
      const modelLabelHeight = Math.max(6, fontSize * 1.05);
      const modelLeaderGap = Math.max(2, Number(entry?.leaderGap) || Math.max(leaderGap, fontSize * 0.2));
      const baseOffset = Math.max(fontSize * 0.85, 8, (Number(entry?.radius) || 0) * 1.6) * 2 * leaderScale;
      return {
        entry,
        cx,
        cy,
        text,
        stableKey: `${entry?.pointId ?? ''}|${cx.toFixed(6)}|${cy.toFixed(6)}|${text}`,
        // Keep a layout candidate available when a compact exported/test SVG is
        // narrower than the label itself. The rendered text may extend beyond
        // this planning box, but the point-label leader still has valid geometry.
        textWidth: Math.min(
          estimateWidth(text, fontSpec, fontSize),
          Math.max(1, containerRight - containerLeft - 4)
        ),
        fontSize,
        fontSpec,
        labelHeight: modelLabelHeight,
        leaderGap: modelLeaderGap,
        baseOffset,
        candidates: []
      };
    }).filter(Boolean);
    models.forEach(model => {
      model.candidates = buildCandidates(model);
      model.zeroStaticCandidates = model.candidates.reduce((count, candidate) =>
        count + (candidate.staticScore.collisions === 0 ? 1 : 0), 0);
      model.crowding = pointBounds.reduce((count, point) => count + (
        Math.hypot(point.cx - model.cx, point.cy - model.cy) < labelFontSize * 6 ? 1 : 0
      ), 0);
    });
    models = models.filter(model => model.candidates.length > 0);
    if(!models.length){
      return [];
    }

    const pairScore = (first, second) => {
      const score = makeScore();
      if(!boxesIntersect(first.envelope, second.envelope, labelClearance)){ return score; }
      if(boxesIntersect(first.bbox, second.bbox, labelClearance)){
        score.collisions += 1;
        score.severity += 14;
      }
      if(pathIntersectsBox(first.leaderSegments, second.bbox, leaderClearance)){
        score.collisions += 1;
        score.severity += 11;
      }
      if(pathIntersectsBox(second.leaderSegments, first.bbox, leaderClearance)){
        score.collisions += 1;
        score.severity += 11;
      }
      if(pathsConflict(first.leaderSegments, second.leaderSegments, leaderClearance)){
        score.collisions += 1;
        score.severity += 8;
      }
      return score;
    };
    const candidateContribution = (modelIndex, candidateIndex, selected) => {
      const candidate = models[modelIndex].candidates[candidateIndex];
      const score = makeScore();
      addScore(score, candidate.staticScore);
      selected.forEach((selectedIndex, otherIndex) => {
        if(otherIndex === modelIndex || selectedIndex < 0){ return; }
        addScore(score, pairScore(candidate, models[otherIndex].candidates[selectedIndex]));
      });
      return score;
    };
    const chooseCandidate = (modelIndex, selected) => {
      let bestIndex = 0;
      let bestScore = null;
      models[modelIndex].candidates.forEach((candidate, index) => {
        const score = candidateContribution(modelIndex, index, selected);
        if(bestScore === null || compareScores(score, bestScore) < 0
          || (compareScores(score, bestScore) === 0 && candidate.id < models[modelIndex].candidates[bestIndex].id)){
          bestIndex = index;
          bestScore = score;
        }
      });
      return bestIndex;
    };
    const selectionScore = selected => {
      const score = makeScore();
      selected.forEach((candidateIndex, modelIndex) => {
        addScore(score, models[modelIndex].candidates[candidateIndex].staticScore);
        for(let otherIndex = modelIndex + 1; otherIndex < selected.length; otherIndex += 1){
          addScore(score, pairScore(
            models[modelIndex].candidates[candidateIndex],
            models[otherIndex].candidates[selected[otherIndex]]
          ));
        }
      });
      return score;
    };
    const constrainedOrder = models.map((model, index) => index).sort((a, b) => {
      const first = models[a];
      const second = models[b];
      return first.zeroStaticCandidates - second.zeroStaticCandidates
        || second.crowding - first.crowding
        || second.textWidth - first.textWidth
        || first.stableKey.localeCompare(second.stableKey);
    });
    const stableOrder = models.map((model, index) => index).sort((a, b) =>
      models[a].stableKey.localeCompare(models[b].stableKey));
    const startOrders = [constrainedOrder];
    if(models.length <= 80){ startOrders.push(stableOrder); }
    if(models.length <= 8){ startOrders.push(constrainedOrder.slice().reverse()); }
    const uniqueOrders = startOrders.filter((order, index, all) =>
      all.findIndex(candidate => candidate.join(',') === order.join(',')) === index);
    const maxPasses = models.length <= 8 ? 5 : models.length <= 60 ? 3 : models.length <= 150 ? 2 : 1;
    const constrainedRank = new Map(constrainedOrder.map((modelIndex, rank) => [modelIndex, rank]));
    const refineSelection = (selected, passLimit = maxPasses) => {
      for(let pass = 0; pass < passLimit; pass += 1){
        const conflictLoad = selected.map((candidateIndex, modelIndex) => {
          const score = models[modelIndex].candidates[candidateIndex].staticScore;
          let collisions = score.collisions;
          selected.forEach((otherCandidateIndex, otherIndex) => {
            if(otherIndex === modelIndex){ return; }
            collisions += pairScore(
              models[modelIndex].candidates[candidateIndex],
              models[otherIndex].candidates[otherCandidateIndex]
            ).collisions;
          });
          return collisions;
        });
        const order = constrainedOrder.slice().sort((a, b) => conflictLoad[b] - conflictLoad[a]
          || constrainedRank.get(a) - constrainedRank.get(b));
        let changed = false;
        order.forEach(modelIndex => {
          const next = chooseCandidate(modelIndex, selected);
          if(next !== selected[modelIndex]){
            selected[modelIndex] = next;
            changed = true;
          }
        });
        if(!changed){ break; }
      }
      return selected;
    };

    let bestSelection = null;
    let bestScore = null;
    uniqueOrders.forEach(order => {
      const selected = new Array(models.length).fill(-1);
      order.forEach(modelIndex => {
        selected[modelIndex] = chooseCandidate(modelIndex, selected);
      });
      refineSelection(selected);
      const score = selectionScore(selected);
      if(bestScore === null || compareScores(score, bestScore) < 0){
        bestSelection = selected.slice();
        bestScore = score;
      }
    });

    if(bestSelection && bestScore.collisions > 0 && models.length <= 40){
      const conflictingPairs = [];
      for(let first = 0; first < models.length; first += 1){
        for(let second = first + 1; second < models.length; second += 1){
          const score = pairScore(
            models[first].candidates[bestSelection[first]],
            models[second].candidates[bestSelection[second]]
          );
          if(score.collisions > 0){ conflictingPairs.push({ first, second, score }); }
        }
      }
      conflictingPairs.sort((a, b) => b.score.severity - a.score.severity
        || `${models[a.first].stableKey}|${models[a.second].stableKey}`
          .localeCompare(`${models[b.first].stableKey}|${models[b.second].stableKey}`));
      conflictingPairs.slice(0, 6).forEach(({ first, second }) => {
        const firstLimit = Math.min(24, models[first].candidates.length);
        const secondLimit = Math.min(24, models[second].candidates.length);
        let bestFirst = bestSelection[first];
        let bestSecond = bestSelection[second];
        let bestPairScore = null;
        const scorePairChoice = (firstCandidateIndex, secondCandidateIndex) => {
          const firstCandidate = models[first].candidates[firstCandidateIndex];
          const secondCandidate = models[second].candidates[secondCandidateIndex];
          const score = makeScore();
          addScore(score, firstCandidate.staticScore);
          addScore(score, secondCandidate.staticScore);
          addScore(score, pairScore(firstCandidate, secondCandidate));
          bestSelection.forEach((candidateIndex, otherIndex) => {
            if(otherIndex === first || otherIndex === second){ return; }
            const other = models[otherIndex].candidates[candidateIndex];
            addScore(score, pairScore(firstCandidate, other));
            addScore(score, pairScore(secondCandidate, other));
          });
          return score;
        };
        for(let firstCandidate = 0; firstCandidate < firstLimit; firstCandidate += 1){
          for(let secondCandidate = 0; secondCandidate < secondLimit; secondCandidate += 1){
            const score = scorePairChoice(firstCandidate, secondCandidate);
            if(bestPairScore === null || compareScores(score, bestPairScore) < 0){
              bestPairScore = score;
              bestFirst = firstCandidate;
              bestSecond = secondCandidate;
            }
          }
        }
        const currentPairScore = scorePairChoice(bestSelection[first], bestSelection[second]);
        if(compareScores(bestPairScore, currentPairScore) < 0){
          bestSelection[first] = bestFirst;
          bestSelection[second] = bestSecond;
        }
      });
      refineSelection(bestSelection, 2);
      bestScore = selectionScore(bestSelection);
    }

    return models.map((model, index) => {
      const candidate = models[index].candidates[bestSelection[index]];
      const localScore = candidateContribution(index, bestSelection[index], bestSelection);
      return {
        entry: model.entry,
        placement: {
          ...candidate,
          collisionCount: localScore.collisions,
          layoutCollisionCount: bestScore.collisions,
          score: candidate.staticScore.aesthetic
        }
      };
    });
  };

  labelLayout.computePointLabelFontSize = function computePointLabelFontSize(baseFontSize, labelCount, plotWidth, plotHeight, options){
    const requestedMinimum = Number(options?.minFontSize);
    const minimum = Math.max(
      POINT_LABEL_MIN_FONT_SIZE_PX,
      Number.isFinite(requestedMinimum) && requestedMinimum > 0 ? requestedMinimum : 0
    );
    const maximum = Number(options?.maxFontSize);
    const applyBounds = value => {
      const capped = Number.isFinite(maximum) && maximum > 0 ? Math.min(value, maximum) : value;
      return Math.max(minimum, capped);
    };
    const safeBase = Math.max(minimum, Number(baseFontSize) || 10);
    const count = Math.max(0, Number(labelCount) || 0);
    const width = Math.max(1, Number(plotWidth) || 0);
    const height = Math.max(1, Number(plotHeight) || 0);
    if(count <= 0){
      return applyBounds(safeBase);
    }
    const area = width * height;
    const density = count / Math.max(1, area);
    const axisReference = 520;
    const axisScale = Math.max(0.25, Math.min(2.2, width / axisReference));
    const targetCount = 12;
    const countRatio = (targetCount + 2) / (count + 2);
    const countScale = Math.max(0.25, Math.min(3, countRatio * countRatio));
    const targetDensity = 0.0008;
    const densityRatio = density / targetDensity;
    const densityScale = 1 / Math.sqrt(1 + densityRatio * densityRatio);
    const combinedScale = axisScale * countScale * densityScale;
    const scale = Math.max(0.12, Math.min(2.6, combinedScale));
    return applyBounds(safeBase * scale);
  };

  /**
   * Render a compact SVG-native statistical annotation.
   * The helper is deliberately stateless: components own visibility, position,
   * persistence, and owner/session writes. This keeps the shared layer safe for
   * same-component tab isolation while normalizing presentation and dragging.
   */
  chartStyle.STATS_ANNOTATION_FONT_SCALE = 0.75;
  chartStyle.STATS_ANNOTATION_MIN_FONT_SIZE = 8;
  chartStyle.STATS_ANNOTATION_FONT_ROLE = 'statsSummary';
  chartStyle.STATS_ANNOTATION_FONT_KEY = 'statsSummary';

  function toFiniteChartNumber(value){
    if(value === null || value === undefined || value === ''){ return null; }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  chartStyle.resolveStatsAnnotationFontSize = function resolveStatsAnnotationFontSize(baseFontSize, options = {}){
    const base = Math.max(1, Number(baseFontSize) || 12);
    const scale = Number.isFinite(Number(options.scale))
      ? Math.max(0.1, Number(options.scale))
      : chartStyle.STATS_ANNOTATION_FONT_SCALE;
    const min = Number.isFinite(Number(options.min))
      ? Math.max(1, Number(options.min))
      : chartStyle.STATS_ANNOTATION_MIN_FONT_SIZE;
    return Math.max(min, base * scale);
  };

  chartStyle.resolveStatsAnnotationFontMetrics = function resolveStatsAnnotationFontMetrics(baseFontSize, options = {}){
    const fallbackPx = chartStyle.resolveStatsAnnotationFontSize(baseFontSize, options);
    if(typeof chartStyle.resolveScopedLabelMeasureFont !== 'function'){
      return {
        fontSizePx: fallbackPx,
        fontSpec: chartStyle.makeFont(fallbackPx),
        fontFamily: chartStyle.FONT_FAMILY,
        fontStyle: 'normal',
        fontWeight: 'normal'
      };
    }
    return chartStyle.resolveScopedLabelMeasureFont({
      styles: options.styles,
      role: options.role || chartStyle.STATS_ANNOTATION_FONT_ROLE,
      fallbackPx
    });
  };

  /**
   * Resolve a persisted statistical-annotation position against the current plot
   * frame. Relative coordinates are authoritative when present so annotations
   * preserve their visual position after graph resizing and archive reopen.
   */
  chartStyle.resolveStatsAnnotationPosition = function resolveStatsAnnotationPosition(stored, fallback, frame = {}){
    const originX = toFiniteChartNumber(frame.originX) ?? 0;
    const originY = toFiniteChartNumber(frame.originY) ?? 0;
    const width = Math.max(1, toFiniteChartNumber(frame.width) ?? 1);
    const height = Math.max(1, toFiniteChartNumber(frame.height) ?? 1);
    const fallbackX = toFiniteChartNumber(fallback?.x);
    const fallbackY = toFiniteChartNumber(fallback?.y);
    const relX = toFiniteChartNumber(stored?.relX);
    const relY = toFiniteChartNumber(stored?.relY);
    if(relX !== null && relY !== null){
      return { x: originX + relX * width, y: originY + relY * height };
    }
    const x = toFiniteChartNumber(stored?.x);
    const y = toFiniteChartNumber(stored?.y);
    if(x !== null && y !== null){
      return { x, y };
    }
    return {
      x: fallbackX ?? (originX + width),
      y: fallbackY ?? originY
    };
  };

  /**
   * Persist both absolute and frame-relative annotation coordinates. Components
   * remain the sole owners of the returned state and decide how it is committed
   * to their tab/session payload.
   */
  chartStyle.captureStatsAnnotationPosition = function captureStatsAnnotationPosition(position, frame = {}){
    const x = toFiniteChartNumber(position?.x);
    const y = toFiniteChartNumber(position?.y);
    if(x === null || y === null){
      return null;
    }
    const originX = toFiniteChartNumber(frame.originX) ?? 0;
    const originY = toFiniteChartNumber(frame.originY) ?? 0;
    const width = Math.max(1, toFiniteChartNumber(frame.width) ?? 1);
    const height = Math.max(1, toFiniteChartNumber(frame.height) ?? 1);
    return {
      x,
      y,
      relX: (x - originX) / width,
      relY: (y - originY) / height
    };
  };

  // Legends live in the outward right reserve, not on the plot's right rail.
  // New positions are relative to that stable reserve origin. Positions without
  // the anchor marker remain on the old plot-relative contract for compatibility.
  chartStyle.LEGEND_POSITION_ANCHOR = 'right-reserve';
  chartStyle.resolveLegendPosition = function resolveLegendPosition(stored, options = {}){
    const defaultX = toFiniteChartNumber(options.defaultX) ?? 0;
    const defaultY = toFiniteChartNumber(options.defaultY) ?? 0;
    const reserveOriginX = toFiniteChartNumber(options.reserveOriginX) ?? defaultX;
    const reserveOriginY = toFiniteChartNumber(options.reserveOriginY) ?? defaultY;
    const reserveScaleX = Math.max(1, toFiniteChartNumber(options.reserveScaleX) ?? 1);
    const reserveScaleY = Math.max(1, toFiniteChartNumber(options.reserveScaleY) ?? 1);
    const legacyOriginX = toFiniteChartNumber(options.legacyOriginX) ?? reserveOriginX;
    const legacyOriginY = toFiniteChartNumber(options.legacyOriginY) ?? reserveOriginY;
    const legacyScaleX = Math.max(1, toFiniteChartNumber(options.legacyScaleX) ?? reserveScaleX);
    const legacyScaleY = Math.max(1, toFiniteChartNumber(options.legacyScaleY) ?? reserveScaleY);
    const useReserveAnchor = String(stored?.anchor || '') === chartStyle.LEGEND_POSITION_ANCHOR;
    const relX = toFiniteChartNumber(stored?.relX);
    const relY = toFiniteChartNumber(stored?.relY);
    const absoluteX = toFiniteChartNumber(stored?.x);
    const absoluteY = toFiniteChartNumber(stored?.y);
    const x = useReserveAnchor && relX !== null
      ? reserveOriginX + relX * reserveScaleX
      : (!useReserveAnchor && relX !== null
        ? legacyOriginX + relX * legacyScaleX
        : (absoluteX ?? defaultX));
    const y = useReserveAnchor && relY !== null
      ? reserveOriginY + relY * reserveScaleY
      : (!useReserveAnchor && relY !== null
        ? legacyOriginY + relY * legacyScaleY
        : (absoluteY ?? defaultY));
    return {
      x,
      y,
      canonicalX: defaultX,
      canonicalY: defaultY,
      originX: reserveOriginX,
      originY: reserveOriginY,
      scaleX: reserveScaleX,
      scaleY: reserveScaleY,
      positionAnchor: chartStyle.LEGEND_POSITION_ANCHOR
    };
  };

  function readStatsAnnotationViewport(svg){
    const base = svg?.viewBox?.baseVal;
    if(base && Number.isFinite(base.x) && Number.isFinite(base.y)
      && Number.isFinite(base.width) && base.width > 0
      && Number.isFinite(base.height) && base.height > 0){
      return { left: base.x, top: base.y, right: base.x + base.width, bottom: base.y + base.height };
    }
    const viewBox = String(svg?.getAttribute?.('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    if(viewBox.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0){
      return {
        left: viewBox[0],
        top: viewBox[1],
        right: viewBox[0] + viewBox[2],
        bottom: viewBox[1] + viewBox[3]
      };
    }
    const width = toFiniteChartNumber(svg?.getAttribute?.('width'));
    const height = toFiniteChartNumber(svg?.getAttribute?.('height'));
    return width !== null && width > 0 && height !== null && height > 0
      ? { left: 0, top: 0, right: width, bottom: height }
      : null;
  }

  function measureStatsAnnotationOffsets(text, lines, options = {}){
    const x = Number(text?.getAttribute?.('x')) || 0;
    const y = Number(text?.getAttribute?.('y')) || 0;
    try{
      const box = text?.getBBox?.();
      if(box && Number.isFinite(box.x) && Number.isFinite(box.y)
        && Number.isFinite(box.width) && box.width >= 0
        && Number.isFinite(box.height) && box.height >= 0){
        return {
          minX: box.x - x,
          maxX: box.x + box.width - x,
          minY: box.y - y,
          maxY: box.y + box.height - y
        };
      }
    }catch(_err){}
    const fontSize = Math.max(1, Number(options.fontSize) || 10);
    const lineHeight = Math.max(fontSize, Number(options.lineHeight) || fontSize * 1.2);
    const fontSpec = options.fontSpec || chartStyle.makeFont(fontSize);
    const width = Math.max(1, ...lines.map(line => chartStyle.measureText(line, fontSpec)));
    const anchor = options.textAnchor === 'start' || options.textAnchor === 'middle' ? options.textAnchor : 'end';
    const minX = anchor === 'start' ? 0 : (anchor === 'middle' ? -width / 2 : -width);
    return {
      minX,
      maxX: minX + width,
      minY: -fontSize * 0.82,
      maxY: Math.max(fontSize * 0.22, (lines.length - 1) * lineHeight + fontSize * 0.22)
    };
  }

  function constrainStatsAnnotationPosition(position, offsets, viewport, padding){
    const x = Number(position?.x);
    const y = Number(position?.y);
    if(!Number.isFinite(x) || !Number.isFinite(y) || !viewport || !offsets){
      return { x, y };
    }
    const minX = viewport.left + padding - offsets.minX;
    const maxX = viewport.right - padding - offsets.maxX;
    const minY = viewport.top + padding - offsets.minY;
    const maxY = viewport.bottom - padding - offsets.maxY;
    return {
      x: maxX >= minX ? Math.min(Math.max(x, minX), maxX) : minX,
      y: maxY >= minY ? Math.min(Math.max(y, minY), maxY) : minY
    };
  }

  function wrapStatsAnnotationLine(line, maxWidth, fontSpec){
    if(!(maxWidth > 0) || chartStyle.measureText(line, fontSpec) <= maxWidth){
      return [line];
    }
    const chunks = [];
    const splitLongToken = token => {
      let chunk = '';
      Array.from(token).forEach(character => {
        const candidate = chunk + character;
        if(chunk && chartStyle.measureText(candidate, fontSpec) > maxWidth){
          chunks.push(chunk);
          chunk = character;
        }else{
          chunk = candidate;
        }
      });
      return chunk;
    };
    let current = '';
    String(line).split(/\s+/).filter(Boolean).forEach(word => {
      const candidate = current ? `${current} ${word}` : word;
      if(chartStyle.measureText(candidate, fontSpec) <= maxWidth){
        current = candidate;
        return;
      }
      if(current){ chunks.push(current); }
      current = chartStyle.measureText(word, fontSpec) <= maxWidth ? word : splitLongToken(word);
    });
    if(current){ chunks.push(current); }
    return chunks.length ? chunks : [line];
  }

  function parseStatsAnnotationMathFragments(source){
    const text = String(source == null ? '' : source);
    const fragments = [];
    const push = (value, scriptDepth = 0) => {
      if(!value){ return; }
      const previous = fragments[fragments.length - 1];
      if(previous && previous.scriptDepth === scriptDepth){
        previous.text += value;
      }else{
        fragments.push({ text: value, scriptDepth });
      }
    };
    const findBalancedEnd = (start, open, close) => {
      let depth = 1;
      for(let index = start; index < text.length; index += 1){
        const char = text[index];
        if(char === open){ depth += 1; }
        else if(char === close){
          depth -= 1;
          if(depth === 0){ return index; }
        }
      }
      return -1;
    };
    const parseRange = (start, end, scriptDepth = 0) => {
      let cursor = start;
      let plainStart = start;
      const flushPlain = until => {
        if(until > plainStart){ push(text.slice(plainStart, until), scriptDepth); }
      };
      while(cursor < end){
        const expMatch = text.slice(cursor, end).match(/^exp\s*([\[(])/);
        if(expMatch){
          const open = expMatch[1];
          const close = open === '(' ? ')' : ']';
          const openIndex = cursor + expMatch[0].lastIndexOf(open);
          const closeIndex = findBalancedEnd(openIndex + 1, open, close);
          if(closeIndex >= 0 && closeIndex < end){
            flushPlain(cursor);
            push('e', scriptDepth);
            parseRange(openIndex + 1, closeIndex, scriptDepth + 1);
            cursor = closeIndex + 1;
            plainStart = cursor;
            continue;
          }
        }
        if(text[cursor] === '^'){
          let exponentStart = cursor + 1;
          let exponentEnd = exponentStart;
          let wrapped = false;
          const open = text[exponentStart];
          if(open === '(' || open === '['){
            const close = open === '(' ? ')' : ']';
            const closeIndex = findBalancedEnd(exponentStart + 1, open, close);
            if(closeIndex >= 0 && closeIndex < end){
              exponentStart += 1;
              exponentEnd = closeIndex;
              wrapped = true;
            }
          }else{
            while(exponentEnd < end && /[0-9A-Za-z.+−-]/.test(text[exponentEnd])){
              exponentEnd += 1;
            }
          }
          if(exponentEnd > exponentStart){
            flushPlain(cursor);
            parseRange(exponentStart, exponentEnd, scriptDepth + 1);
            cursor = wrapped ? exponentEnd + 1 : exponentEnd;
            plainStart = cursor;
            continue;
          }
        }
        cursor += 1;
      }
      flushPlain(end);
    };
    parseRange(0, text.length, 0);
    return fragments.length ? fragments : [{ text, scriptDepth: 0 }];
  }

  function appendStatsAnnotationMathLine(textNode, line, options = {}){
    const doc = textNode?.ownerDocument;
    if(!doc){ return []; }
    const fragments = parseStatsAnnotationMathFragments(line);
    const lineIndex = Number(options.lineIndex) || 0;
    const x = Number(options.x);
    const lineHeightEm = Number(options.lineHeightEm) || 1.2;
    const created = [];
    fragments.forEach((fragment, fragmentIndex) => {
      const span = doc.createElementNS(NS, 'tspan');
      const isLineStart = fragmentIndex === 0;
      if(isLineStart && Number.isFinite(x)){
        span.setAttribute('x', String(x));
        span.setAttribute('dy', lineIndex === 0 ? '0' : `${lineHeightEm}em`);
        span.setAttribute('data-stats-line-start', '1');
      }
      const depth = Math.max(0, Number(fragment.scriptDepth) || 0);
      if(depth > 0){
        const scale = Math.pow(0.78, depth);
        span.setAttribute('font-size', `${scale.toFixed(4)}em`);
        span.setAttribute('baseline-shift', depth === 1 ? 'super' : `${(0.58 * depth).toFixed(3)}em`);
        span.setAttribute('data-stats-math-script-depth', String(depth));
      }
      span.setAttribute('data-font-structure-part', 'line-fragment');
      span.setAttribute('data-font-structure-text', fragment.text);
      span.textContent = fragment.text;
      textNode.appendChild(span);
      created.push(span);
    });
    return created;
  }

  chartStyle.parseStatsAnnotationMathFragments = parseStatsAnnotationMathFragments;

  chartStyle.renderStatsAnnotation = function renderStatsAnnotation(svg, options = {}){
    if(!svg || !svg.ownerDocument){
      return null;
    }
    const notationNormalizer = Shared.statsReporting && typeof Shared.statsReporting.normalizeNotationText === 'function'
      ? Shared.statsReporting.normalizeNotationText
      : null;
    const sourceLines = Array.isArray(options.lines)
      ? options.lines
          .map(value => String(value ?? '').trim())
          .filter(Boolean)
          .map(line => notationNormalizer ? notationNormalizer(line, { context: 'plot-annotation' }) : line)
      : [];
    if(!sourceLines.length){
      return null;
    }
    const x = Number(options.x);
    const y = Number(options.y);
    const fontSize = Math.max(1, Number(options.fontSize) || 10);
    if(!Number.isFinite(x) || !Number.isFinite(y)){
      return null;
    }
    const padding = Math.max(0, Number(options.containerPadding) || Math.max(2, fontSize * 0.25));
    const viewport = readStatsAnnotationViewport(svg);
    const availableWidth = viewport ? Math.max(1, viewport.right - viewport.left - padding * 2) : Infinity;
    const fontSpec = options.fontSpec || chartStyle.makeFont(fontSize);
    const lines = sourceLines.flatMap(line => wrapStatsAnnotationLine(line, availableWidth, fontSpec));
    const text = svg.ownerDocument.createElementNS(NS, 'text');
    text.setAttribute('x', String(x));
    text.setAttribute('y', String(y));
    text.setAttribute('font-size', String(fontSize));
    text.setAttribute('text-anchor', options.textAnchor || 'end');
    text.setAttribute('fill', options.fill || TEXT_COLOR);
    text.setAttribute('data-plot-stats-annotation', '1');
    if(options.className){
      text.setAttribute('class', String(options.className));
    }
    if(options.dataAttributes && typeof options.dataAttributes === 'object'){
      Object.entries(options.dataAttributes).forEach(([key, value]) => {
        if(value == null){ return; }
        const attr = String(key).startsWith('data-') ? String(key) : `data-${String(key)}`;
        text.setAttribute(attr, String(value));
      });
    }
    const lineHeight = Math.max(fontSize, Number(options.lineHeight) || fontSize * 1.2);
    const lineHeightEm = lineHeight / fontSize;
    lines.forEach((line, index) => {
      appendStatsAnnotationMathLine(text, line, {
        lineIndex: index,
        x,
        lineHeightEm
      });
    });
    text.setAttribute('data-font-preserve-structure', 'children');
    svg.appendChild(text);
    const fontScopeId = options.fontScopeId || options.scopeId || svg.dataset?.fontScope || null;
    const fontKey = options.fontKey || chartStyle.STATS_ANNOTATION_FONT_KEY;
    const fontRole = options.fontRole || chartStyle.STATS_ANNOTATION_FONT_ROLE;
    if(global.Shared?.fontControls && typeof global.Shared.fontControls.markText === 'function'){
      global.Shared.fontControls.markText(text, {
        scopeId: fontScopeId,
        role: fontRole,
        key: fontKey,
        tabId: options.tabId || null
      });
    }else if(text.dataset){
      text.dataset.fontEditable = '1';
      if(fontScopeId){ text.dataset.fontScope = fontScopeId; }
      if(options.tabId){ text.dataset.fontTabId = String(options.tabId); }
      text.dataset.fontRole = fontRole;
      text.dataset.fontKey = fontKey;
    }
    const constrain = position => {
      const viewport = readStatsAnnotationViewport(svg);
      const offsets = measureStatsAnnotationOffsets(text, lines, {
        fontSize,
        lineHeight,
        fontSpec: options.fontSpec,
        textAnchor: options.textAnchor
      });
      return constrainStatsAnnotationPosition(position, offsets, viewport, padding);
    };
    const applyPosition = position => {
      const next = constrain(position);
      text.setAttribute('x', String(next.x));
      text.setAttribute('y', String(next.y));
      Array.from(text.children || []).forEach(child => {
        if(child.dataset?.statsLineStart === '1'){
          child.setAttribute('x', String(next.x));
        }else{
          child.removeAttribute('x');
        }
      });
      return next;
    };
    applyPosition({ x, y });
    if(options.draggable !== false && typeof Shared.enableLabelDrag === 'function'){
      Shared.enableLabelDrag(text, svg, {
        syncChildX: true,
        normalizeDuringDrag: true,
        normalizePosition: constrain,
        onDragEnd: typeof options.onDragEnd === 'function'
          ? position => options.onDragEnd(constrain(position))
          : undefined
      });
    }
    return text;
  };

})(window);
