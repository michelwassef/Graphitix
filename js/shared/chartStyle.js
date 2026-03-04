(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  const NS = 'http://www.w3.org/2000/svg';
  const FONT_FAMILY = 'Arial, Helvetica, sans-serif';
  const TEXT_COLOR = '#000000';
  const BASE_BOTTOM_FACTOR = 2.4;
  const PT_TO_PX = 96 / 72;
  const BASE_FONT_SIZE_PX = 17;
  const BASE_FONT_SIZE_PT = Number((BASE_FONT_SIZE_PX / PT_TO_PX).toFixed(2));
  const MIN_DEFAULT_SIZE = 320;
  const FALLBACK_VIEWPORT_WIDTH = 960;
  const COLOR_SWATCH_SIZE = 20;
  const LEGEND_LAYOUT_CONSTANTS = Object.freeze({
    gapScale: 0.55,
    minGapPx: 12,
    guardPaddingPx: 24,
    basePlotMinWidth: 320
  });
  chartStyle.LEGEND_LAYOUT_CONSTANTS = LEGEND_LAYOUT_CONSTANTS;

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

  function computeDefaultGraphSize(reason){
    const doc = global.document || null;
    const winWidth = Number(global.innerWidth) || 0;
    const docElWidth = doc?.documentElement?.clientWidth || 0;
    const bodyWidth = doc?.body?.clientWidth || 0;
    let reference = Math.max(winWidth, docElWidth, bodyWidth);
    if(!Number.isFinite(reference) || reference <= 0){
      reference = FALLBACK_VIEWPORT_WIDTH;
    }
    const normalized = Math.max(MIN_DEFAULT_SIZE, Math.round(reference / 3));
    const payload = {
      reason: reason || 'initial',
      winWidth,
      docElWidth,
      bodyWidth,
      reference,
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
  const DEFAULT_ASPECT_LOCKED = true;
  const TAB_SCOPE_TOKEN_PREFIX = '@tab:';
  const GLOBAL_TEXT_SCOPE = '__chartstyle_global__';
  let textSizeLocked = false;
  const textLockState = new Map();
  const textLockInputs = new Map();
  const textLockListeners = new Map();

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
        const activeBtn = doc.querySelector('.workspace-tab.is-active[data-tab-id]');
        const fromDom = normalizeTabId(activeBtn?.dataset?.tabId);
        if(fromDom){ return fromDom; }
      }
    }catch(err){
      console.debug('Debug: chartStyle active tab resolve via dom failed', { error: err?.message || String(err) });
    }
    return null;
  }

  function resolveScopeTabToken(options){
    const opts = options || {};
    const svgBox = opts.svgBox || opts.container || opts.element || null;
    const input = opts.input || opts.control || null;
    const explicit = normalizeTabId(opts.tabId || opts.workspaceTabId || null);
    const fromInput = normalizeTabId(input?.dataset?.workspaceTabId || input?.dataset?.fontTabId || input?.dataset?.tabId || null);
    const fromSvg = normalizeTabId(svgBox?.dataset?.workspaceTabId || svgBox?.dataset?.fontTabId || svgBox?.dataset?.tabId || null);
    const active = resolveActiveWorkspaceTabId();
    return normalizeScopeId(explicit || fromInput || fromSvg || active || null);
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
      const datasetScope = normalizeScopeId(svgBox.dataset.resizerTextLockScope || svgBox.dataset.textLockScope);
      if(datasetScope){
        return applyTabScope(datasetScope, opts);
      }
    }
    const input = opts.input || opts.control || null;
    if(input && input.dataset){
      const inputScope = normalizeScopeId(input.dataset.textLockScope);
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

  function getScopedLock(scopeId){
    if(scopeId && textLockState.has(scopeId)){
      return !!textLockState.get(scopeId);
    }
    return !!textSizeLocked;
  }

  function setScopedLock(scopeId, value){
    const normalized = !!value;
    if(scopeId){
      textLockState.set(scopeId, normalized);
    }else{
      textSizeLocked = normalized;
    }
    return normalized;
  }

  function snapshotLockSummary(){
    const summary = { global: !!textSizeLocked, scoped: {} };
    textLockState.forEach((val, key) => {
      summary.scoped[key] = !!val;
    });
    return summary;
  }

  function syncTextLockInputs(origin, scopeFilter){
    const stale = [];
    textLockInputs.forEach((scopeId, input) => {
      if(!input || typeof input !== 'object' || typeof input.addEventListener !== 'function'){
        stale.push(input);
        return;
      }
      const effectiveScope = scopeId || GLOBAL_TEXT_SCOPE;
      if(scopeFilter && effectiveScope !== scopeFilter){
        return;
      }
      const scopedLock = getScopedLock(scopeId);
      if('checked' in input && input.checked !== scopedLock){
        try {
          input.checked = scopedLock;
        } catch(syncErr){
          console.error('chartStyle.syncTextLockInputs assignment error', syncErr);
        }
      }
    });
    if(stale.length){
      stale.forEach(item => textLockInputs.delete(item));
    }
    console.debug('Debug: chartStyle.syncTextLockInputs', {
      origin: origin || 'unknown',
      scope: scopeFilter || 'all',
      controlCount: textLockInputs.size,
      staleCount: stale.length,
      stateSummary: snapshotLockSummary()
    }); // Debug: text lock control sync trace
  }

  function emitTextLockChange(origin, scopeId, lockedValue){
    const effectiveScope = scopeId || GLOBAL_TEXT_SCOPE;
    console.debug('Debug: chartStyle.emitTextLockChange start', {
      origin: origin || 'unknown',
      locked: lockedValue,
      scope: effectiveScope,
      listenerCount: textLockListeners.size
    }); // Debug: text lock listener broadcast start
    textLockListeners.forEach((info, listener) => {
      if(!info || typeof listener !== 'function'){
        return;
      }
      if(info.scope && info.scope !== effectiveScope){
        console.debug('Debug: chartStyle.emitTextLockChange skip listener', {
          listenerScope: info.scope,
          eventScope: effectiveScope,
          listenerOrigin: info.origin || listener.name || 'anonymous'
        }); // Debug: listener scope filter
        return;
      }
      try {
        listener(lockedValue, origin || 'unknown', { scopeId: scopeId || null, locked: lockedValue });
      } catch(err){
        console.error('chartStyle text lock listener error', err);
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
    console.debug('Debug: chartStyle.makeFont', {size, font}); // Debug: font computation trace
    return font;
  };

  chartStyle.computeResizeScale = function computeResizeScale(options){
    const defaultWidth = Number(options?.defaultWidth) || DEFAULT_WIDTH;
    const defaultHeight = Number(options?.defaultHeight) || DEFAULT_HEIGHT;
    const rawWidth = Number(options?.width);
    const rawHeight = Number(options?.height);
    const safeWidth = Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : defaultWidth;
    const safeHeight = Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : defaultHeight;
    const scaleX = safeWidth / (defaultWidth || 1);
    const scaleY = safeHeight / (defaultHeight || 1);
    const styleUnclamped = Math.sqrt(Math.max(scaleX * scaleY, 0));
    const styleScale = clampScale(styleUnclamped);
    const radiusScale = Math.sqrt(styleScale);
    const payload = {
      width: safeWidth,
      height: safeHeight,
      defaultWidth,
      defaultHeight,
      scaleX,
      scaleY,
      scaleW: scaleX,
      scaleH: scaleY,
      styleUnclamped,
      styleScale,
      radiusScale,
      strokeScale: radiusScale,
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
    let basePt = Number(opts.basePt);
    if(!Number.isFinite(basePt)){
      if(inputEl && inputEl.dataset){
        const storedBase = Number(inputEl.dataset.fontBasePt);
        if(Number.isFinite(storedBase)){
          basePt = storedBase;
        }
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
    let lastDisplayPt = Number.isFinite(Number(inputEl?.dataset?.fontDisplayPt))
      ? Number(inputEl.dataset.fontDisplayPt)
      : NaN;
    if(!Number.isFinite(lastDisplayPt) && dataset){
      const datasetDisplay = Number(dataset.fontDisplayPt);
      if(Number.isFinite(datasetDisplay)){
        lastDisplayPt = datasetDisplay;
      }
    }
    const resizeInfo = chartStyle.computeResizeScale({
      width: opts.width,
      height: opts.height,
      defaultWidth: opts.defaultWidth,
      defaultHeight: opts.defaultHeight
    });
    const scopeId = resolveScopeKey({ scopeId: opts.scopeId, svgBox, input: inputEl });
    const isManualResize = dataset ? dataset.resizerResized === 'true' : null;
    const lockForUnresized = opts.lockScaleWhenUnresized !== false;
    const autoLock = !isManualResize && !!dataset && lockForUnresized;
    let lockOverride;
    if(typeof opts.lockScale === 'boolean'){
      lockOverride = !!opts.lockScale;
    }else if(autoLock){
      lockOverride = true;
    }else if(typeof opts.lockScaleDefault === 'boolean'){
      lockOverride = !!opts.lockScaleDefault;
    }else if(dataset && typeof dataset.resizerTextLock === 'string'){
      lockOverride = dataset.resizerTextLock === 'true';
    }else if(scopeId){
      lockOverride = getScopedLock(scopeId);
    }else{
      lockOverride = textSizeLocked;
    }
    if(lockOverride){
      const manualResizeActive = dataset ? dataset.resizerResized === 'true' : false;
      const resizeScale = Number.isFinite(resizeInfo?.styleScale) ? resizeInfo.styleScale : 1;
      if(manualResizeActive){
        const fallbackDisplayPt = chartStyle.pxToPt(normalized.px * resizeScale);
        const displayCandidate = Number.isFinite(lastDisplayPt) ? lastDisplayPt : fallbackDisplayPt;
        if(Number.isFinite(displayCandidate) && Math.abs(displayCandidate - normalized.pt) > 0.01){
          const normalizedDisplay = chartStyle.normalizeFontSize(displayCandidate);
          normalized = normalizedDisplay;
          basePt = normalizedDisplay.pt;
          if(inputEl && inputEl.dataset){
            inputEl.dataset.fontBasePt = String(normalizedDisplay.pt);
            inputEl.dataset.fontDisplayPt = String(normalizedDisplay.pt);
          }
          if(dataset){
            dataset.fontBasePt = String(normalizedDisplay.pt);
            dataset.fontDisplayPt = String(normalizedDisplay.pt);
          }
          console.debug('Debug: chartStyle.resolveScaledFontSize lock base updated', {
            scope: scopeId || 'global',
            manualResize: manualResizeActive,
            displayCandidate,
            normalizedPt: normalizedDisplay.pt
          }); // Debug: lock base sync after manual resize
        }
      }
    }
    const textScale = lockOverride ? 1 : resizeInfo.styleScale;
    const scaledPxRaw = normalized.px * textScale;
    // Preserve exact pt values when text is locked: rounding 7pt (9.333px)
    // down to 9px causes a visible 6.75pt drift in the toolbar/readback.
    const scaledPx = lockOverride
      ? Math.max(4, scaledPxRaw)
      : Math.max(4, Math.round(scaledPxRaw));
    const scaledPt = chartStyle.pxToPt(scaledPx);
    if(inputEl && inputEl.dataset){
      inputEl.dataset.fontDisplayPt = String(scaledPt);
      console.debug('Debug: chartStyle.resolveScaledFontSize display stored', {
        inputId: inputEl.id || null,
        scaledPt,
        textLocked: lockOverride
      }); // Debug: display pt tracking
    }
    if(dataset){
      dataset.fontDisplayPt = String(scaledPt);
      console.debug('Debug: chartStyle.resolveScaledFontSize dataset display stored', {
        scope: scopeId || 'global',
        scaledPt,
        textLocked: lockOverride
      }); // Debug: dataset display tracking
    }
    const explicitZoomScale = Number(opts.zoomScale);
    const datasetZoomScale = Number(dataset?.resizerZoomLevel || dataset?.resizerZoom);
    const zoomScale = Number.isFinite(explicitZoomScale) && explicitZoomScale > 0
      ? explicitZoomScale
      : (Number.isFinite(datasetZoomScale) && datasetZoomScale > 0 ? datasetZoomScale : 1);
    const scaleInfo = {
      ...resizeInfo,
      zoomScale,
      textScale,
      textLocked: lockOverride,
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
      textLocked: lockOverride,
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
      locked: lockOverride,
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
      lockScale: opts.lockScale,
      lockScaleDefault: opts.lockScaleDefault,
      lockScaleWhenUnresized: opts.lockScaleWhenUnresized,
      input: opts.input
    });
    console.debug('Debug: chartStyle.computeFontInfoForSvg', {
      debugLabel: opts.debugLabel || 'chartStyle.computeFontInfoForSvg',
      rawSize: opts.rawSize,
      width,
      height,
      scope: fontInfo.scopeId || scopeId || 'global',
      locked: fontInfo.textLocked,
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

  chartStyle.setTextSizeLock = function setTextSizeLock(locked, options){
    const nextValue = !!locked;
    const opts = options || {};
    const origin = opts.origin || 'setTextSizeLock';
    const svgBox = opts.svgBox || null;
    const scopeId = resolveScopeKey({ ...opts, svgBox });
    const effectiveScope = scopeId || GLOBAL_TEXT_SCOPE;
    const force = opts.force === true;
    const previous = getScopedLock(scopeId);
    if(previous === nextValue && !force){
      console.debug('Debug: chartStyle.setTextSizeLock noop', { locked: previous, origin, scope: effectiveScope }); // Debug: no change branch
      return previous;
    }
    setScopedLock(scopeId, nextValue);
    if(svgBox && svgBox.dataset){
      if(scopeId){
        svgBox.dataset.resizerTextLockScope = scopeId;
      }
      svgBox.dataset.resizerTextLock = nextValue ? 'true' : 'false';
    }
    console.debug('Debug: chartStyle.setTextSizeLock', {
      locked: nextValue,
      origin,
      force,
      scope: effectiveScope,
      stateSummary: snapshotLockSummary()
    }); // Debug: text lock toggle trace
    syncTextLockInputs(origin, effectiveScope);
    emitTextLockChange(origin, scopeId, nextValue);
    return nextValue;
  };

  chartStyle.isTextSizeLocked = function isTextSizeLocked(scopeOptions){
    const scopeId = resolveScopeKey(scopeOptions);
    const result = getScopedLock(scopeId);
    console.debug('Debug: chartStyle.isTextSizeLocked query', {
      locked: result,
      scope: scopeId || 'global'
    }); // Debug: text lock query trace
    return result;
  };

  chartStyle.registerTextSizeLockControl = function registerTextSizeLockControl(input, options){
    const el = input;
    const opts = options || {};
    const origin = opts.origin || el?.id || 'text-lock-control';
    if(!el || typeof el.addEventListener !== 'function'){
      console.debug('Debug: chartStyle.registerTextSizeLockControl skipped', { origin, reason: 'invalid element' }); // Debug: invalid control
      return function noopUnregister(){
        console.debug('Debug: chartStyle.unregisterTextSizeLockControl noop', { origin });
      };
    }
    const scopeId = resolveScopeKey({ ...opts, input: el });
    const effectiveScope = scopeId || GLOBAL_TEXT_SCOPE;
    const svgBox = opts.svgBox || null;
    if(svgBox && svgBox.dataset){
      if(scopeId){
        svgBox.dataset.resizerTextLockScope = scopeId;
      }
      if(typeof svgBox.dataset.resizerTextLock !== 'string'){
        svgBox.dataset.resizerTextLock = getScopedLock(scopeId) ? 'true' : 'false';
      }
    }
    if(el.dataset){
      el.dataset.textLockScope = scopeId || '';
    }
    if(el.__chartStyleTextLockHandler){
      el.removeEventListener('change', el.__chartStyleTextLockHandler);
      delete el.__chartStyleTextLockHandler;
      console.debug('Debug: chartStyle.registerTextSizeLockControl removed existing handler', { origin });
    }
    if('checked' in el){
      try {
        el.checked = getScopedLock(scopeId);
      } catch(assignErr){
        console.error('chartStyle.registerTextSizeLockControl assign error', assignErr);
      }
    }
    const handler = () => {
      const desired = !!el.checked;
      if(svgBox && svgBox.dataset){
        svgBox.dataset.resizerTextLock = desired ? 'true' : 'false';
      }
      console.debug('Debug: chartStyle.textLockControl change', { origin, desired, scope: effectiveScope }); // Debug: control change event
      chartStyle.setTextSizeLock(desired, { origin: `control-${origin}`, scopeId, svgBox });
    };
    el.addEventListener('change', handler);
    el.__chartStyleTextLockHandler = handler;
    textLockInputs.set(el, scopeId);
    console.debug('Debug: chartStyle.registerTextSizeLockControl', {
      origin,
      locked: getScopedLock(scopeId),
      controlCount: textLockInputs.size,
      scope: effectiveScope
    }); // Debug: control registration summary
    const cleanup = () => {
      if(el.__chartStyleTextLockHandler){
        el.removeEventListener('change', el.__chartStyleTextLockHandler);
        delete el.__chartStyleTextLockHandler;
      }
      textLockInputs.delete(el);
      console.debug('Debug: chartStyle.unregisterTextSizeLockControl', {
        origin,
        remaining: textLockInputs.size,
        scope: effectiveScope
      }); // Debug: control cleanup
    };
    if(opts.signal && typeof opts.signal.addEventListener === 'function'){
      opts.signal.addEventListener('abort', cleanup, { once: true });
    }
    return cleanup;
  };

  chartStyle.onTextSizeLockChange = function onTextSizeLockChange(callback, options){
    if(typeof callback !== 'function'){
      console.debug('Debug: chartStyle.onTextSizeLockChange skipped', { reason: 'invalid callback' }); // Debug: invalid listener guard
      return function noopRemove(){
        console.debug('Debug: chartStyle.onTextSizeLockChange noop remove');
      };
    }
    const opts = options || {};
    const origin = opts.origin || callback.name || 'anonymous';
    const scopeId = resolveScopeKey(opts);
    const effectiveScope = scopeId || null;
    textLockListeners.set(callback, { origin, scope: effectiveScope ? effectiveScope : null });
    console.debug('Debug: chartStyle.onTextSizeLockChange registered', {
      origin,
      listenerCount: textLockListeners.size,
      scope: effectiveScope || 'all'
    }); // Debug: listener registration
    if(opts.immediate){
      try {
        const initial = getScopedLock(scopeId);
        callback(initial, 'immediate', { scopeId: scopeId || null, locked: initial });
      } catch(err){
        console.error('chartStyle text lock immediate callback error', err);
      }
    }
    const cleanup = () => {
      textLockListeners.delete(callback);
      console.debug('Debug: chartStyle.onTextSizeLockChange removed', {
        origin,
        remaining: textLockListeners.size,
        scope: effectiveScope || 'all'
      }); // Debug: listener cleanup
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
      console.debug('Debug: chartStyle.scaleLength fallback', { base, context: opts.context || 'length' });
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
    console.debug('Debug: chartStyle.scaleLength', {
      base: numeric,
      styleScale,
      resizeOnlyScale,
      lengthScale,
      zoomScale,
      zoomActive,
      result: clamped,
      context: opts.context || 'length'
    }); // Debug: length scaling trace
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
      console.debug('Debug: chartStyle.scaleStrokeWidth exact applied', {
        base,
        min,
        max,
        result: clampedExact,
        context: opts.context || 'stroke'
      });
      return clampedExact;
    }
    const result = chartStyle.scaleLength(base, scaleInfo, { ...opts, min, max, context: opts.context || 'stroke' });
    console.debug('Debug: chartStyle.scaleStrokeWidth applied', {
      base,
      min,
      max,
      result,
      context: opts.context || 'stroke'
    }); // Debug: stroke scaling trace
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
    const width = ctx.measureText(text || '').width;
    console.debug('Debug: chartStyle.measureText', {text, font: ctx.font, width}); // Debug: measurement trace
    return width;
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
   * Maximum decimal places for mantissa in scientific notation.
   * Kept at 2 for readability on chart axes regardless of maxDecimals setting.
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
   *        Note: Mantissa in scientific notation is capped at 2 decimals for readability.
   * @param {number} [options.thresholdHigh=10000] - Threshold above which to use scientific notation
   * @param {number} [options.thresholdLow=0.001] - Threshold at or below which to use scientific notation (for non-zero values)
   * @param {boolean} [options.forceScientific=false] - Always use scientific notation when true
   * @returns {string} - The formatted string representation
   */
  chartStyle.formatScientific = function formatScientific(value, options){
    const opts = options || {};
    const maxDecimals = Number.isFinite(opts.maxDecimals) ? opts.maxDecimals : 2;
    const thresholdHigh = Number.isFinite(opts.thresholdHigh) ? opts.thresholdHigh : SCIENTIFIC_THRESHOLD_HIGH;
    const thresholdLow = Number.isFinite(opts.thresholdLow) ? opts.thresholdLow : SCIENTIFIC_THRESHOLD_LOW;
    const forceScientific = opts.forceScientific === true;

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
        // Decimal mantissa - use up to MANTISSA_MAX_DECIMALS for readability
        mantissaStr = mantissa.toFixed(Math.min(MANTISSA_MAX_DECIMALS, maxDecimals));
        // Remove trailing zeros after decimal point
        mantissaStr = mantissaStr.replace(/\.?0+$/, '');
      }

      // Format: mantissa×10ⁿ or just 10ⁿ if mantissa is 1
      const superExp = toSuperscript(exponent);
      if(mantissaStr === '1'){
        return `10${superExp}`;
      }else if(mantissaStr === '-1'){
        return `-10${superExp}`;
      }
      return `${mantissaStr}×10${superExp}`;
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

  chartStyle.createAxisMetrics = function createAxisMetrics(fontSize, scaleInfo){
    const safeFont = Number(fontSize) || BASE_FONT_SIZE_PX;
    const hasScaleInfo = !!(scaleInfo && (Number.isFinite(scaleInfo.styleScale) || Number.isFinite(scaleInfo.scale)));
    const resizeScale = hasScaleInfo ? clampScale(resolveStyleScale(scaleInfo)) : 1;
    const baseMetrics = {
      tickLength: 6,
      tickLabelGap: Math.max(3, Math.round(safeFont * 0.35)),
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
    const tickLength = axisMetrics.tickLength ?? 6;
    const tickLabelGap = axisMetrics.tickLabelGap ?? Math.max(3, Math.round(fontSize * 0.35));
    const axisTitleGap = axisMetrics.axisTitleGap ?? Math.max(4, Math.round(fontSize * 0.75));
    const outerPadding = axisMetrics.outerPadding ?? Math.max(6, Math.round(fontSize * 0.6));
    const baseLabelOffset = tickLength + tickLabelGap;
    const labelOffset = baseLabelOffset + fontSize;
    const titleOffset = labelOffset + axisTitleGap + fontSize;
    const baseBottom = options?.baseBottom || Math.max(titleOffset + outerPadding, Math.round(fontSize * BASE_BOTTOM_FACTOR) + fontSize + 8);
    const font = chartStyle.makeFont(fontSize);
    const widths = labels.map(label => chartStyle.measureText(label || '', font));
    const maxLabelWidth = widths.length ? Math.max(...widths) : 0;
    const bandWidth = labels.length ? plotWidth / labels.length : plotWidth;
    const shouldRotate = labels.length > 1 && widths.some(w => w > bandWidth * 0.9);
    const extra = shouldRotate ? Math.min(220, Math.max(fontSize * 1.8, Math.ceil(Math.SQRT1_2 * maxLabelWidth) + fontSize)) : 0;
    const bottom = Math.max(baseBottom, titleOffset + outerPadding + extra);
    console.debug('Debug: chartStyle.computeBottomLayout', {
      labelCount: labels.length,
      fontSize,
      plotWidth,
      shouldRotate,
      extra,
      bottom,
      labelOffset,
      titleOffset,
      tickLength
    }); // Debug: bottom layout computation
    return {bottom, shouldRotate, widths, bandWidth, maxLabelWidth, labelOffset, titleOffset, tickLength, tickLabelGap, axisTitleGap, outerPadding};
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
    const force = options?.force ?? false;
    let rotate = !!force;
    if(!rotate){
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
        node.setAttribute('transform', `rotate(${angle} ${x} ${y})`);
        node.setAttribute('text-anchor', anchor);
        if(dy !== null){
          node.setAttribute('dy', dy);
        }
      });
    }
    console.debug('Debug: chartStyle.applyLabelOrientation result', {count: list.length, rotated: rotate, angle}); // Debug: label orientation summary
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

  chartStyle.computeBaseMargins = function computeBaseMargins(options){
    const fontSize = options?.fontSize || 12;
    const legendWidth = options?.legendWidth || 0;
    const maxYLabelWidth = options?.maxYLabelWidth || 0;
    const yTitleWidth = options?.yTitleWidth || 0;
    const axisMetrics = options?.axisMetrics || chartStyle.createAxisMetrics(fontSize);
    const tickLength = axisMetrics.tickLength ?? 6;
    const tickLabelGap = axisMetrics.tickLabelGap ?? Math.max(3, Math.round(fontSize * 0.35));
    const axisTitleGap = axisMetrics.axisTitleGap ?? Math.max(4, Math.round(fontSize * 0.75));
    const outerPadding = axisMetrics.outerPadding ?? Math.max(6, Math.round(fontSize * 0.6));
    const yTitleGap = axisMetrics.yTitleGap ?? Math.max(4, Math.round(fontSize * 0.5));
    const top = Math.max(36, Math.round(fontSize * BASE_BOTTOM_FACTOR));
    const leftBase = maxYLabelWidth + tickLength + tickLabelGap + fontSize + outerPadding;
    const left = Math.max(56, Math.round(fontSize * 3.2), leftBase, yTitleWidth * 0.5 + yTitleGap + outerPadding);
    const right = 24 + legendWidth;
    const bottomSpacing = tickLength + tickLabelGap + fontSize + axisTitleGap + fontSize + outerPadding;
    const bottom = Math.max(bottomSpacing, Math.max(36, Math.round(fontSize * BASE_BOTTOM_FACTOR)) + fontSize * 0.5);
    console.debug('Debug: chartStyle.computeBaseMargins', {
      fontSize,
      legendWidth,
      maxYLabelWidth,
      yTitleWidth,
      axisMetrics,
      top,
      left,
      right,
      bottom
    }); // Debug: margin base computation
    return {top, right, bottom, left};
  };

  chartStyle.ensureSquarePlot = function ensureSquarePlot(totalWidth, totalHeight, margin){
    const innerW = Math.max(20, totalWidth - margin.left - margin.right);
    const innerH = Math.max(20, totalHeight - margin.top - margin.bottom);
    const size = Math.min(innerW, innerH);
    const adjusted = {top: margin.top, right: margin.right, bottom: margin.bottom, left: margin.left};
    if(innerW > size){
      adjusted.right += innerW - size;
    }
    if(innerH > size){
      adjusted.bottom += innerH - size;
    }
    console.debug('Debug: chartStyle.ensureSquarePlot', {
      totalWidth,
      totalHeight,
      originalMargin: margin,
      adjustedMargin: adjusted,
      targetSize: size
    }); // Debug: square enforcement summary
    return {margin: adjusted, plotW: size, plotH: size};
  };

  chartStyle.applySvgDefaults = function applySvgDefaults(svg){
    if(svg){
      svg.setAttribute('font-family', FONT_FAMILY);
      svg.setAttribute('color', TEXT_COLOR);
      const fontControls = (global.Shared && global.Shared.fontControls) || {};
      if(fontControls && typeof fontControls.enableForSvg === 'function'){
        try {
          fontControls.enableForSvg(svg,{ scopeId: svg.id || svg.dataset?.fontScope || svg.closest?.('.svgbox')?.id || null });
          console.debug('Debug: chartStyle.applySvgDefaults fontControls attached',{ scope: svg.id || svg.dataset?.fontScope || null }); // Debug: font panel auto-binding
        } catch(fontErr){
          console.error('chartStyle.applySvgDefaults fontControls error', fontErr);
        }
      }
    }
    console.debug('Debug: chartStyle.applySvgDefaults', {hasSvg: !!svg}); // Debug: svg defaults applied
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
        }else if(Number.isFinite(basePt)){
          dataset.fontBasePt = String(basePt);
          dataset.fontDisplayPt = String(basePt);
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
      normalizedEntries.push({ label, fill, stroke, strokeWidth, sourceIndex: index, key, editable, raw: entry });
    });
    const fontSize = Math.max(4, Number(opts.fontSize) || 12);
    const rowGap = Number.isFinite(opts.rowGap) ? Number(opts.rowGap) : Math.max(4, Math.round(fontSize * 0.3));
    // Keep legend symbols compact by default while scaling with legend font size.
    const swatchSize = Number.isFinite(opts.swatchSize) ? Number(opts.swatchSize) : Math.max(4, Math.round(fontSize * 0.6));
    const swatchGap = Number.isFinite(opts.swatchGap) ? Number(opts.swatchGap) : Math.max(8, Math.round(fontSize * 0.4));
    const minWidth = Number.isFinite(opts.minWidth) ? Number(opts.minWidth) : Math.max(60, Math.round(fontSize * 5.5));
    const fontForMeasure = chartStyle.makeFont(fontSize);
    let maxLabelWidth = 0;
    normalizedEntries.forEach(entry => {
      const width = chartStyle.measureText(entry.label, fontForMeasure);
      entry.labelWidth = Number.isFinite(width) ? width : 0;
      if(Number.isFinite(width) && width > maxLabelWidth){
        maxLabelWidth = width;
      }
    });
    const width = normalizedEntries.length ? Math.max(minWidth, swatchSize + swatchGap + maxLabelWidth) : 0;
    // Keep row spacing large enough for either text or swatch content to avoid overlap at small fonts.
    const rowHeight = Math.max(fontSize, swatchSize) + rowGap;
    const baselineOffset = Number.isFinite(opts.baselineOffset) ? Number(opts.baselineOffset) : 0;
    const rowBottomOffset = Math.max(fontSize, (swatchSize - fontSize) + rowGap);
    const height = normalizedEntries.length ? baselineOffset + (normalizedEntries.length - 1) * rowHeight + rowBottomOffset : 0;
    const debugSummary = {
      entryCount: normalizedEntries.length,
      fontSize,
      rowGap,
      swatchSize,
      swatchGap,
      minWidth,
      width,
      height,
      maxLabelWidth
    };
    console.debug('Debug: chartStyle.createLegendRenderer metrics', debugSummary);
    const createLegendSwatch = (doc, entry, idx, baselineY) => {
      const rawShape = entry?.raw?.shape;
      const shape = typeof rawShape === 'string' ? rawShape : 'square';
      const swatchTop = baselineY - fontSize + rowGap;
      const centerX = swatchSize / 2;
      const centerY = swatchTop + (swatchSize / 2);
      const radius = Math.max(1, swatchSize * 0.42);
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
      }else{
        node = doc.createElementNS(NS, 'rect');
        node.setAttribute('x', '0');
        node.setAttribute('y', String(swatchTop));
        node.setAttribute('width', String(swatchSize));
        node.setAttribute('height', String(swatchSize));
      }
      if(entry.key){
        node.dataset.legendKey = entry.key;
      }
      node.dataset.legendIndex = String(idx);
      node.setAttribute('fill', entry.fill);
      const effectiveStrokeWidth = entry.strokeWidth > 0 ? entry.strokeWidth : 0;
      if(effectiveStrokeWidth > 0){
        node.setAttribute('stroke', entry.stroke || entry.fill);
        node.setAttribute('stroke-width', effectiveStrokeWidth);
      }else if(entry.stroke){
        node.setAttribute('stroke', entry.stroke);
        node.setAttribute('stroke-width', '0');
      }
      return node;
    };
    const renderer = {
      entries: normalizedEntries,
      width,
      height,
      fontSize,
      rowGap,
      rowHeight,
      swatchSize,
      swatchGap,
      baselineOffset,
      minWidth,
      maxLabelWidth,
      draw(svg, position){
        if(!svg || typeof svg.appendChild !== 'function'){
          console.warn('chartStyle.createLegendRenderer.draw skipped: invalid svg target');
          return null;
        }
        if(!normalizedEntries.length){
          console.debug('Debug: chartStyle.createLegendRenderer.draw skipped',{ reason: 'no entries' });
          return null;
        }
        const doc = svg.ownerDocument || global.document;
        const group = doc.createElementNS(NS, 'g');
        const posX = Number.isFinite(position?.x) ? Number(position.x) : 0;
        const posY = Number.isFinite(position?.y) ? Number(position.y) : 0;
        group.setAttribute('transform', `translate(${posX},${posY})`);
        normalizedEntries.forEach((entry, idx) => {
          const baselineY = idx * rowHeight + baselineOffset;
          const swatch = createLegendSwatch(doc, entry, idx, baselineY);
          if(entry.editable && typeof opts.onSwatchClick === 'function'){
            swatch.style.cursor = 'pointer';
            swatch.addEventListener('click', (evt) => {
              console.debug('Debug: legend swatch click', {
                label: entry.label,
                key: entry.key,
                index: idx
              });
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
          text.setAttribute('x', swatchSize + swatchGap);
          text.setAttribute('y', baselineY);
          text.setAttribute('font-size', fontSize);
          text.setAttribute('fill', textColor);
          text.setAttribute('dominant-baseline', 'alphabetic');
          text.textContent = entry.label;
          if(entry.editable && typeof opts.onSwatchClick === 'function'){
            text.dataset.legendIndex = String(idx);
            if(entry.key){ text.dataset.legendKey = entry.key; }
          }
          group.appendChild(text);
        });
        svg.appendChild(group);
        console.debug('Debug: chartStyle.createLegendRenderer.draw applied',{ entryCount: normalizedEntries.length, x: posX, y: posY });
        return group;
      }
    };
    return renderer;
  };

  chartStyle.computeLegendLayout = function computeLegendLayout(options){
    const opts = options || {};
    const renderer = chartStyle.createLegendRenderer({
      entries: opts.entries,
      fontSize: opts.fontSize,
      strokeWidth: opts.strokeWidth,
      swatchSize: opts.swatchSize,
      swatchGap: opts.swatchGap,
      rowGap: opts.rowGap,
      minWidth: opts.minWidth,
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
    console.debug('Debug: chartStyle.computeLegendLayout',{ entryCount, legendGapPx, legendWidthForMargin, minSvgWidth, basePlotWidth, guardPaddingPx });
    return {
      renderer,
      legendGapPx,
      legendWidthForMargin,
      minSvgWidth,
      basePlotWidth,
      guardPaddingPx
    };
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
    const labelFontSize = Math.max(6, Number(options?.labelFontSize) || 10);
    const leaderGap = Math.max(2, Number(options?.leaderGap) || 2);
    const angleSteps = Math.max(8, Math.min(36, Number(options?.angleSteps) || 16));
    const maxLeaderScale = Math.max(1, Math.min(5, Number(options?.maxLeaderScale) || 5));
    const pointBounds = Array.isArray(options?.pointBounds) ? options.pointBounds : [];
    const measureText = typeof options?.measureText === 'function' ? options.measureText : null;
    const font = options?.font || null;
    const labelHeight = Math.max(6, labelFontSize);
    const leaderScale = Math.max(0.45, Math.min(1, Number(options?.leaderScale) || 1));
    const minOffset = Math.max(labelFontSize * 0.85, 8);
    const plotHull = Array.isArray(options?.plotHull) ? options.plotHull : null;
    const enforceHull = options?.enforceHull === true;
    const hullPenalty = Number.isFinite(options?.hullPenalty) ? options.hullPenalty : 12;
    let normalizedHull = null;
    if(plotHull && plotHull.length >= 3){
      normalizedHull = [];
      for(let i = 0; i < plotHull.length; i += 1){
        const pt = plotHull[i];
        const x = Number(pt?.x);
        const y = Number(pt?.y);
        if(Number.isFinite(x) && Number.isFinite(y)){
          normalizedHull.push({ x, y });
        }
      }
      if(normalizedHull.length < 3){
        normalizedHull = null;
      }
    }
    const angles = [];
    const tau = Math.PI * 2;
    for(let i = 0; i < angleSteps; i += 1){
      angles.push((i / angleSteps) * tau);
    }
    const estimateWidth = text => {
      const value = text ? String(text) : '';
      if(!value){
        return labelFontSize * 0.5;
      }
      if(measureText && font){
        const measured = measureText(value, font);
        if(Number.isFinite(measured)){
          return measured;
        }
      }
      return Math.max(labelFontSize * 0.6, value.length * labelFontSize * 0.6);
    };
    const overlapArea = (a, b) => {
      const overlapX = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
      const overlapY = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
      return overlapX * overlapY;
    };
    const pointOnSegment = (px, py, ax, ay, bx, by) => {
      const crossVal = (px - ax) * (by - ay) - (py - ay) * (bx - ax);
      if(Math.abs(crossVal) > 1e-6){
        return false;
      }
      const dot = (px - ax) * (bx - ax) + (py - ay) * (by - ay);
      if(dot < -1e-6){
        return false;
      }
      const lenSq = (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
      if(dot - lenSq > 1e-6){
        return false;
      }
      return true;
    };
    const pointInPolygon = (x, y, polygon) => {
      if(!Array.isArray(polygon) || polygon.length < 3){
        return true;
      }
      for(let i = 0, j = polygon.length - 1; i < polygon.length; j = i++){
        const xi = polygon[i].x;
        const yi = polygon[i].y;
        const xj = polygon[j].x;
        const yj = polygon[j].y;
        if(pointOnSegment(x, y, xi, yi, xj, yj)){
          return true;
        }
      }
      let inside = false;
      for(let i = 0, j = polygon.length - 1; i < polygon.length; j = i++){
        const xi = polygon[i].x;
        const yi = polygon[i].y;
        const xj = polygon[j].x;
        const yj = polygon[j].y;
        const intersect = ((yi > y) !== (yj > y))
          && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if(intersect){
          inside = !inside;
        }
      }
      return inside;
    };
    const boxInsideHull = (minX, maxX, minY, maxY) => {
      if(!normalizedHull){
        return true;
      }
      return pointInPolygon(minX, minY, normalizedHull)
        && pointInPolygon(maxX, minY, normalizedHull)
        && pointInPolygon(maxX, maxY, normalizedHull)
        && pointInPolygon(minX, maxY, normalizedHull);
    };
    const tryNudgeBoxInsideHull = (box, cx, cy) => {
      if(!normalizedHull){
        return { shiftX: 0, shiftY: 0, inside: true };
      }
      if(boxInsideHull(box.minX, box.maxX, box.minY, box.maxY)){
        return { shiftX: 0, shiftY: 0, inside: true };
      }
      const centerX = (box.minX + box.maxX) / 2;
      const centerY = (box.minY + box.maxY) / 2;
      const targetX = Number.isFinite(cx) ? cx : centerX;
      const targetY = Number.isFinite(cy) ? cy : centerY;
      const dx = targetX - centerX;
      const dy = targetY - centerY;
      const steps = 8;
      for(let step = 1; step <= steps; step += 1){
        const t = step / steps;
        const shiftX = dx * t;
        const shiftY = dy * t;
        const nextMinX = box.minX + shiftX;
        const nextMaxX = box.maxX + shiftX;
        const nextMinY = box.minY + shiftY;
        const nextMaxY = box.maxY + shiftY;
        if(boxInsideHull(nextMinX, nextMaxX, nextMinY, nextMaxY)){
          return { shiftX, shiftY, inside: true };
        }
      }
      return { shiftX: 0, shiftY: 0, inside: false };
    };
    const placedBoxes = [];
    const placedLeaders = [];
    const placements = [];
    const distancePointToSegment = (px, py, ax, ay, bx, by) => {
      const dx = bx - ax;
      const dy = by - ay;
      if(dx === 0 && dy === 0){
        const rx = px - ax;
        const ry = py - ay;
        return Math.hypot(rx, ry);
      }
      const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
      const clamped = Math.max(0, Math.min(1, t));
      const cx = ax + clamped * dx;
      const cy = ay + clamped * dy;
      return Math.hypot(px - cx, py - cy);
    };
    const segmentsIntersect = (ax, ay, bx, by, cx, cy, dx, dy) => {
      const eps = 1e-6;
      const orient = (px, py, qx, qy, rx, ry) => (qy - py) * (rx - qx) - (qx - px) * (ry - qy);
      const onSegment = (px, py, qx, qy, rx, ry) =>
        Math.min(px, rx) - eps <= qx && qx <= Math.max(px, rx) + eps
        && Math.min(py, ry) - eps <= qy && qy <= Math.max(py, ry) + eps;
      const o1 = orient(ax, ay, bx, by, cx, cy);
      const o2 = orient(ax, ay, bx, by, dx, dy);
      const o3 = orient(cx, cy, dx, dy, ax, ay);
      const o4 = orient(cx, cy, dx, dy, bx, by);
      if(Math.abs(o1) < eps && onSegment(ax, ay, cx, cy, bx, by)) return true;
      if(Math.abs(o2) < eps && onSegment(ax, ay, dx, dy, bx, by)) return true;
      if(Math.abs(o3) < eps && onSegment(cx, cy, ax, ay, dx, dy)) return true;
      if(Math.abs(o4) < eps && onSegment(cx, cy, bx, by, dx, dy)) return true;
      return (o1 > 0 && o2 < 0 || o1 < 0 && o2 > 0)
        && (o3 > 0 && o4 < 0 || o3 < 0 && o4 > 0);
    };
    const scaleSteps = [];
    for(let scale = 1; scale <= maxLeaderScale; scale += 1){
      scaleSteps.push(scale);
    }
    entries.forEach(entry => {
      const cx = Number(entry?.cx) || 0;
      const cy = Number(entry?.cy) || 0;
      const textValue = entry?.text ? String(entry.text) : '';
      if(!textValue){
        return;
      }
      const baseOffset = Math.max(minOffset, (Number(entry?.radius) || 0) * 1.6) * 2 * leaderScale;
      const textWidth = estimateWidth(textValue);
      let best = null;
      angles.forEach(angle => {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        scaleSteps.forEach(scale => {
          let textX = cx + cos * (baseOffset * scale);
          let textY = cy + sin * (baseOffset * scale);
          const anchor = cos >= 0 ? 'start' : 'end';
          let minX = anchor === 'start' ? textX : textX - textWidth;
          let maxX = anchor === 'start' ? textX + textWidth : textX;
          let minY = textY - labelHeight * 0.5;
          let maxY = textY + labelHeight * 0.5;
          let shiftX = 0;
          if(minX < plotLeft + 2){
            shiftX = (plotLeft + 2) - minX;
          }else if(maxX > plotRight - 2){
            shiftX = (plotRight - 2) - maxX;
          }
          let shiftY = 0;
          if(minY < plotTop + 2){
            shiftY = (plotTop + 2) - minY;
          }else if(maxY > plotBottom - 2){
            shiftY = (plotBottom - 2) - maxY;
          }
          if(shiftX || shiftY){
            textX += shiftX;
            textY += shiftY;
            minX += shiftX;
            maxX += shiftX;
            minY += shiftY;
            maxY += shiftY;
          }
          let insideHull = true;
          if(normalizedHull){
            if(enforceHull){
              const nudge = tryNudgeBoxInsideHull({ minX, maxX, minY, maxY }, cx, cy);
              if(nudge.shiftX || nudge.shiftY){
                textX += nudge.shiftX;
                textY += nudge.shiftY;
                minX += nudge.shiftX;
                maxX += nudge.shiftX;
                minY += nudge.shiftY;
                maxY += nudge.shiftY;
              }
              insideHull = nudge.inside;
            }else{
              insideHull = boxInsideHull(minX, maxX, minY, maxY);
            }
          }
          let score = 0;
          const labelArea = Math.max(1, textWidth * labelHeight);
          placedBoxes.forEach(box => {
            const area = overlapArea({ minX, maxX, minY, maxY }, box);
            if(area > 0){
              score += (area / labelArea) * 14;
            }
          });
          pointBounds.forEach(point => {
            const pr = Math.max(0, Number(point?.r) || 0);
            const px = Number(point?.cx) || 0;
            const py = Number(point?.cy) || 0;
            if(px >= minX - pr && px <= maxX + pr && py >= minY - pr && py <= maxY + pr){
              score += 3;
            }
            const leaderDist = distancePointToSegment(px, py, cx, cy, textX, textY);
            if(leaderDist < pr + 2){
              score += 1 + (pr + 2 - leaderDist) * 0.2;
            }
          });
          const lineX2 = textX + (anchor === 'start' ? -leaderGap : leaderGap);
          let leaderCross = false;
          placedLeaders.forEach(seg => {
            if(segmentsIntersect(seg.x1, seg.y1, seg.x2, seg.y2, cx, cy, lineX2, textY)){
              leaderCross = true;
            }
          });
          if(leaderCross){
            score += 3;
          }
          const overflow = Math.max(0, plotLeft - minX)
            + Math.max(0, maxX - plotRight)
            + Math.max(0, plotTop - minY)
            + Math.max(0, maxY - plotBottom);
          if(overflow > 0){
            score += overflow * 0.2 + 6;
          }
          if(normalizedHull && !insideHull){
            score += hullPenalty;
          }
          if(shiftX || shiftY){
            score += 0.5;
          }
          score += (scale - 1) * 0.2;
          if(best === null || score < best.score){
            best = {
              textX,
              textY,
              anchor,
              lineX2,
              lineY2: textY,
              bbox: { minX, maxX, minY, maxY },
              score
            };
          }
        });
      });
      if(best){
        placements.push({ entry, placement: best });
        placedBoxes.push(best.bbox);
        placedLeaders.push({ x1: entry.cx, y1: entry.cy, x2: best.lineX2, y2: best.lineY2 });
      }
    });
    return placements;
  };

  labelLayout.computePointLabelFontSize = function computePointLabelFontSize(baseFontSize, labelCount, plotWidth, plotHeight){
    const safeBase = Math.max(5, Number(baseFontSize) || 10);
    const count = Math.max(0, Number(labelCount) || 0);
    const width = Math.max(1, Number(plotWidth) || 0);
    const height = Math.max(1, Number(plotHeight) || 0);
    if(count <= 0){
      return safeBase;
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
    return Math.max(4, safeBase * scale);
  };
})(window);


