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
  let textSizeLocked = false;

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
    const normalized = chartStyle.normalizeFontSize(options?.rawSize);
    const resizeInfo = chartStyle.computeResizeScale({
      width: options?.width,
      height: options?.height,
      defaultWidth: options?.defaultWidth,
      defaultHeight: options?.defaultHeight
    });
    const svgBox = options?.svgBox || null;
    const dataset = svgBox && svgBox.dataset ? svgBox.dataset : null;
    const isManualResize = dataset ? dataset.resizerResized === 'true' : null;
    const lockForUnresized = options?.lockScaleWhenUnresized !== false;
    const autoLock = !isManualResize && !!dataset && lockForUnresized;
    let lockOverride;
    if(typeof options?.lockScale === 'boolean'){
      lockOverride = !!options.lockScale;
    }else if(autoLock){
      lockOverride = true;
    }else if(typeof options?.lockScaleDefault === 'boolean'){
      lockOverride = !!options.lockScaleDefault;
    }else{
      lockOverride = textSizeLocked;
    }
    const textScale = lockOverride ? 1 : resizeInfo.styleScale;
    const scaledPx = Math.max(4, normalized.px * textScale);
    const scaleInfo = { ...resizeInfo, textScale, textLocked: lockOverride, manualResize: !!isManualResize };
    const result = { ...normalized, scaledPx, scaleInfo, textLocked: lockOverride };
    console.debug('Debug: chartStyle.resolveScaledFontSize', {
      raw: options?.rawSize,
      normalizedPt: normalized.pt,
      basePx: normalized.px,
      scaledPx,
      styleScale: resizeInfo.styleScale,
      textScale,
      locked: lockOverride,
      manualResize: isManualResize,
      width: resizeInfo.width,
      height: resizeInfo.height
    }); // Debug: scaled font resolution
    return result;
  };

  chartStyle.setTextSizeLock = function setTextSizeLock(locked){
    textSizeLocked = !!locked;
    console.debug('Debug: chartStyle.setTextSizeLock', { locked: textSizeLocked }); // Debug: text lock toggle trace
    return textSizeLocked;
  };

  chartStyle.isTextSizeLocked = function isTextSizeLocked(){
    console.debug('Debug: chartStyle.isTextSizeLocked query', { locked: textSizeLocked }); // Debug: text lock query trace
    return textSizeLocked;
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
    const ptRaw = Number.isFinite(info.pt) ? info.pt : Number(opts.pt);
    const pxSource = Number.isFinite(info.scaledPx) ? info.scaledPx : Number(opts.scaledPx);
    const roundedPt = Number.isFinite(ptRaw) ? Math.round(ptRaw * 10) / 10 : null;
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
    console.debug('Debug: chartStyle.renderFontSizeLabel applied', { pt: roundedPt, px: roundedPx, label }); // Debug: font label render
    return label;
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



