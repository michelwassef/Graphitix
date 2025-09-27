(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  const NS = 'http://www.w3.org/2000/svg';
  const FONT_FAMILY = 'Arial, Helvetica, sans-serif';
  const TEXT_COLOR = '#000000';
  const BASE_BOTTOM_FACTOR = 2.4;
  const PT_TO_PX = 96 / 72;
  const BASE_FONT_SIZE_PT = 13;
  const BASE_FONT_SIZE_PX = Number((BASE_FONT_SIZE_PT * PT_TO_PX).toFixed(2));
  const MIN_DEFAULT_SIZE = 320;
  const FALLBACK_VIEWPORT_WIDTH = 960;
  const COLOR_SWATCH_SIZE = 20;

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

  function resolveScopeKey(options){
    if(typeof options === 'string'){
      return normalizeScopeId(options);
    }
    const opts = options || {};
    const directScope = normalizeScopeId(opts.scopeId || opts.scope);
    if(directScope){
      return directScope;
    }
    const svgBox = opts.svgBox || opts.container || opts.element || null;
    if(svgBox && svgBox.dataset){
      const datasetScope = normalizeScopeId(svgBox.dataset.resizerTextLockScope || svgBox.dataset.textLockScope);
      if(datasetScope){
        return datasetScope;
      }
    }
    const input = opts.input || opts.control || null;
    if(input && input.dataset){
      const inputScope = normalizeScopeId(input.dataset.textLockScope);
      if(inputScope){
        return inputScope;
      }
    }
    if(svgBox && svgBox.id){
      return normalizeScopeId(svgBox.id);
    }
    if(typeof opts.origin === 'string'){
      return normalizeScopeId(opts.origin);
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
    const scaledPx = Math.max(4, normalized.px * textScale);
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
    const scaleInfo = { ...resizeInfo, textScale, textLocked: lockOverride, manualResize: !!isManualResize, scopeId };
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
    const gentle = Math.sqrt(styleScale);
    const scaled = numeric * gentle;
    const min = Number.isFinite(opts.min) ? opts.min : 0;
    const max = Number.isFinite(opts.max) ? opts.max : Infinity;
    const clamped = Math.min(max, Math.max(min, scaled));
    console.debug('Debug: chartStyle.scaleLength', {
      base: numeric,
      styleScale,
      gentle,
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

  chartStyle.createAxisMetrics = function createAxisMetrics(fontSize){
    const safeFont = Number(fontSize) || BASE_FONT_SIZE_PX;
    const tickLength = 6;
    const tickLabelGap = Math.max(3, Math.round(safeFont * 0.35));
    const axisTitleGap = Math.max(4, Math.round(safeFont * 0.75));
    const outerPadding = Math.max(6, Math.round(safeFont * 0.6));
    const yTitleGap = Math.max(4, Math.round(safeFont * 0.5));
    const metrics = {tickLength, tickLabelGap, axisTitleGap, outerPadding, yTitleGap};
    console.debug('Debug: chartStyle.createAxisMetrics',{fontSize:safeFont, metrics}); // Debug: axis metric computation
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
            let clamped = displayPt;
            if(Number.isFinite(min)) clamped = Math.max(min, clamped);
            if(Number.isFinite(max)) clamped = Math.min(max, clamped);
            if(String(inputEl.value) !== String(clamped)){
              inputEl.value = String(clamped);
            }
            console.debug('Debug: chartStyle.renderFontSizeLabel control sync', {
              inputId: inputEl.id || null,
              displayPt,
              clamped,
              min,
              max
            }); // Debug: auto slider sync
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
    const defaultStrokeWidth = Number.isFinite(opts.strokeWidth) ? Number(opts.strokeWidth) : 0;
    const normalizedEntries = [];
    rawEntries.forEach((entry, index) => {
      if(!entry){ return; }
      const labelRaw = entry.label ?? entry.name ?? entry.title ?? '';
      const label = labelRaw == null ? '' : String(labelRaw);
      const fill = typeof entry.fill === 'string' ? entry.fill : (typeof entry.color === 'string' ? entry.color : defaultFill);
      const stroke = typeof entry.stroke === 'string' ? entry.stroke : (typeof entry.border === 'string' ? entry.border : defaultStroke);
      const strokeWidth = Number.isFinite(entry.strokeWidth) ? Number(entry.strokeWidth) : defaultStrokeWidth;
      normalizedEntries.push({ label, fill, stroke, strokeWidth, sourceIndex: index });
    });
    const fontSize = Math.max(4, Number(opts.fontSize) || 12);
    const rowGap = Number.isFinite(opts.rowGap) ? Number(opts.rowGap) : Math.max(4, Math.round(fontSize * 0.3));
    const swatchSize = Number.isFinite(opts.swatchSize) ? Number(opts.swatchSize) : Math.max(12, Math.round(fontSize * 0.8));
    const swatchGap = Number.isFinite(opts.swatchGap) ? Number(opts.swatchGap) : Math.max(8, Math.round(fontSize * 0.4));
    const minWidth = Number.isFinite(opts.minWidth) ? Number(opts.minWidth) : Math.max(60, Math.round(fontSize * 5.5));
    const fontForMeasure = chartStyle.makeFont(fontSize);
    let maxLabelWidth = 0;
    normalizedEntries.forEach(entry => {
      const width = chartStyle.measureText(entry.label, fontForMeasure);
      if(Number.isFinite(width) && width > maxLabelWidth){
        maxLabelWidth = width;
      }
    });
    const width = normalizedEntries.length ? Math.max(minWidth, swatchSize + swatchGap + maxLabelWidth) : 0;
    const rowHeight = fontSize + rowGap;
    const baselineOffset = Number.isFinite(opts.baselineOffset) ? Number(opts.baselineOffset) : 0;
    const height = normalizedEntries.length ? baselineOffset + (normalizedEntries.length - 1) * rowHeight + fontSize : 0;
    const debugSummary = {
      entryCount: normalizedEntries.length,
      fontSize,
      rowGap,
      swatchSize,
      swatchGap,
      minWidth,
      width,
      height
    };
    console.debug('Debug: chartStyle.createLegendRenderer metrics', debugSummary);
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
          const swatch = doc.createElementNS(NS, 'rect');
          swatch.setAttribute('x', 0);
          swatch.setAttribute('y', baselineY - fontSize + rowGap);
          swatch.setAttribute('width', swatchSize);
          swatch.setAttribute('height', swatchSize);
          swatch.setAttribute('fill', entry.fill);
          const effectiveStrokeWidth = entry.strokeWidth > 0 ? entry.strokeWidth : 0;
          if(effectiveStrokeWidth > 0){
            swatch.setAttribute('stroke', entry.stroke || entry.fill);
            swatch.setAttribute('stroke-width', effectiveStrokeWidth);
          }else if(entry.stroke){
            swatch.setAttribute('stroke', entry.stroke);
            swatch.setAttribute('stroke-width', 0);
          }
          group.appendChild(swatch);
          const text = doc.createElementNS(NS, 'text');
          text.setAttribute('x', swatchSize + swatchGap);
          text.setAttribute('y', baselineY);
          text.setAttribute('font-size', fontSize);
          text.setAttribute('fill', chartStyle.TEXT_COLOR);
          text.setAttribute('dominant-baseline', 'alphabetic');
          text.textContent = entry.label;
          group.appendChild(text);
        });
        svg.appendChild(group);
        console.debug('Debug: chartStyle.createLegendRenderer.draw applied',{ entryCount: normalizedEntries.length, x: posX, y: posY });
        return group;
      }
    };
    return renderer;
  };

  chartStyle.drawPlotFrame = function drawPlotFrame(options){
    const opts = options || {};
    const svg = opts.svg;
    const margin = opts.margin;
    const plotW = Number(opts.plotW);
    const plotH = Number(opts.plotH);
    const doc = svg && (svg.ownerDocument || global.document);
    const stroke = opts.stroke || "#000";
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
      group.appendChild(line);
      drawn.push(side);
    });
    console.debug("Debug: chartStyle.drawPlotFrame applied", { sides: drawn, stroke, plotW, plotH, strokeWidthAttribute: 'default-scaling' }); // Debug: frame draw summary with default stroke scaling
    return drawn;
  };
})(window);



