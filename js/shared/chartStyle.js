(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  const FONT_FAMILY = 'Arial, Helvetica, sans-serif';
  const TEXT_COLOR = '#000000';
  const BASE_BOTTOM_FACTOR = 2.4;

  chartStyle.FONT_FAMILY = FONT_FAMILY;
  chartStyle.TEXT_COLOR = TEXT_COLOR;

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

  chartStyle.computeBottomLayout = function computeBottomLayout(options){
    const labels = options?.labels || [];
    const fontSize = options?.fontSize || 12;
    const plotWidth = options?.plotWidth || 0;
    const baseBottom = options?.baseBottom || (Math.max(36, Math.round(fontSize * BASE_BOTTOM_FACTOR)) + fontSize + 8);
    const font = chartStyle.makeFont(fontSize);
    const widths = labels.map(label => chartStyle.measureText(label || '', font));
    const maxLabelWidth = widths.length ? Math.max(...widths) : 0;
    const bandWidth = labels.length ? plotWidth / labels.length : plotWidth;
    const shouldRotate = labels.length > 1 && widths.some(w => w > bandWidth * 0.9);
    const extra = shouldRotate ? Math.min(220, Math.max(fontSize * 1.8, Math.ceil(Math.SQRT1_2 * maxLabelWidth) + fontSize)) : 0;
    const bottom = baseBottom + extra;
    console.debug('Debug: chartStyle.computeBottomLayout', {
      labelCount: labels.length,
      fontSize,
      plotWidth,
      shouldRotate,
      extra,
      bottom
    }); // Debug: bottom layout computation
    return {bottom, shouldRotate, widths, bandWidth, maxLabelWidth};
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
    const top = Math.max(36, Math.round(fontSize * BASE_BOTTOM_FACTOR));
    const left = Math.max(56, Math.round(fontSize * 3.2), maxYLabelWidth + fontSize * 2, yTitleWidth * 0.5 + fontSize * 1.5);
    const right = 24 + legendWidth;
    const bottom = Math.max(36, Math.round(fontSize * BASE_BOTTOM_FACTOR)) + fontSize + 8;
    console.debug('Debug: chartStyle.computeBaseMargins', {
      fontSize,
      legendWidth,
      maxYLabelWidth,
      yTitleWidth,
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

})(window);
