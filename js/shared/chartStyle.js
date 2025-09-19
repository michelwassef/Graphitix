(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  const NS = 'http://www.w3.org/2000/svg';
  const FONT_FAMILY = 'Arial, Helvetica, sans-serif';
  const TEXT_COLOR = '#000000';
  const BASE_BOTTOM_FACTOR = 2.4;
  const PT_TO_PX = 96 / 72;
  const BASE_FONT_SIZE_PT = 17;
  const BASE_FONT_SIZE_PX = Number((BASE_FONT_SIZE_PT * PT_TO_PX).toFixed(2));
  const DEFAULT_WIDTH = 640;
  const DEFAULT_HEIGHT = 420;
  const RESIZE_MIN_SCALE = 0.3;
  const RESIZE_MAX_SCALE = 3;

  chartStyle.FONT_FAMILY = FONT_FAMILY;
  chartStyle.TEXT_COLOR = TEXT_COLOR;
  chartStyle.PT_TO_PX = PT_TO_PX;
  chartStyle.BASE_FONT_SIZE_PT = BASE_FONT_SIZE_PT;
  chartStyle.BASE_FONT_SIZE_PX = BASE_FONT_SIZE_PX;
  chartStyle.DEFAULT_WIDTH = DEFAULT_WIDTH;
  chartStyle.DEFAULT_HEIGHT = DEFAULT_HEIGHT;
  chartStyle.RESIZE_MIN_SCALE = RESIZE_MIN_SCALE;
  chartStyle.RESIZE_MAX_SCALE = RESIZE_MAX_SCALE;

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
    const scaleW = safeWidth / (defaultWidth || 1);
    const scaleH = safeHeight / (defaultHeight || 1);
    const unclamped = Math.min(scaleW, scaleH);
    const scale = Math.min(RESIZE_MAX_SCALE, Math.max(RESIZE_MIN_SCALE, unclamped));
    const payload = { width: safeWidth, height: safeHeight, defaultWidth, defaultHeight, scaleW, scaleH, unclamped, scale };
    console.debug('Debug: chartStyle.computeResizeScale', payload); // Debug: resize scaling payload
    return payload;
  };

  chartStyle.resolveScaledFontSize = function resolveScaledFontSize(options){
    const normalized = chartStyle.normalizeFontSize(options?.rawSize);
    const scaleInfo = chartStyle.computeResizeScale({
      width: options?.width,
      height: options?.height,
      defaultWidth: options?.defaultWidth,
      defaultHeight: options?.defaultHeight
    });
    const scaledPx = Math.max(4, normalized.px * scaleInfo.scale);
    const result = { ...normalized, scaledPx, scaleInfo };
    console.debug('Debug: chartStyle.resolveScaledFontSize', {
      raw: options?.rawSize,
      normalizedPt: normalized.pt,
      basePx: normalized.px,
      scaledPx,
      scale: scaleInfo.scale,
      width: scaleInfo.width,
      height: scaleInfo.height
    }); // Debug: scaled font resolution
    return result;
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
    const strokeWidthRaw = Number(opts.strokeWidth);
    const strokeWidth = Number.isFinite(strokeWidthRaw) ? strokeWidthRaw : 1;
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
      line.setAttribute('stroke-width', strokeWidth);
      line.setAttribute('stroke-linecap', 'square');
      group.appendChild(line);
      drawn.push(side);
    });
    console.debug("Debug: chartStyle.drawPlotFrame applied", { sides: drawn, stroke, strokeWidth, plotW, plotH }); // Debug: frame draw summary
    return drawn;
  };
})(window);


