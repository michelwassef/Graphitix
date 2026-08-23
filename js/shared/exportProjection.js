(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const exportProjection = Shared.exportProjection = Shared.exportProjection || {};

  const CSS_DPI = 96;
  const PDF_POINTS_PER_INCH = 72;
  const CSS_PX_PER_POINT = CSS_DPI / PDF_POINTS_PER_INCH;
  const PDF_POINTS_PER_CSS_PX = PDF_POINTS_PER_INCH / CSS_DPI;

  function positiveNumber(value){
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : NaN;
  }

  function nonNegativeNumber(value){
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : NaN;
  }

  function parseDimension(value){
    if(value === undefined || value === null){
      return NaN;
    }
    const raw = String(value).trim();
    if(!raw || /%$/i.test(raw)){
      return NaN;
    }
    const parsed = Number.parseFloat(raw);
    if(!Number.isFinite(parsed) || parsed <= 0){
      return NaN;
    }
    if(/pt$/i.test(raw)) return parsed * CSS_PX_PER_POINT;
    if(/pc$/i.test(raw)) return parsed * (CSS_DPI / 6);
    if(/in$/i.test(raw)) return parsed * CSS_DPI;
    if(/cm$/i.test(raw)) return parsed * (CSS_DPI / 2.54);
    if(/mm$/i.test(raw)) return parsed * (CSS_DPI / 25.4);
    if(/q$/i.test(raw)) return parsed * (CSS_DPI / 101.6);
    return parsed;
  }

  function parseViewBoxValue(value){
    const parts = String(value || '').trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if(parts.length !== 4 || parts.some(part => !Number.isFinite(part)) || parts[2] <= 0 || parts[3] <= 0){
      return null;
    }
    return {
      minX: parts[0],
      minY: parts[1],
      width: parts[2],
      height: parts[3]
    };
  }

  function resolveViewBox(svg){
    if(!svg){
      return null;
    }
    const parsed = parseViewBoxValue(svg.getAttribute?.('viewBox'));
    if(parsed){
      return parsed;
    }
    const width = positiveNumber(parseDimension(svg.getAttribute?.('width')))
      || positiveNumber(svg.clientWidth)
      || positiveNumber(svg.getBoundingClientRect?.().width);
    const height = positiveNumber(parseDimension(svg.getAttribute?.('height')))
      || positiveNumber(svg.clientHeight)
      || positiveNumber(svg.getBoundingClientRect?.().height);
    if(!(width > 0) || !(height > 0)){
      return null;
    }
    return { minX: 0, minY: 0, width, height };
  }

  function normalizeFrame(frame, authority){
    if(!frame || typeof frame !== 'object'){
      return null;
    }
    const width = positiveNumber(frame.width);
    const height = positiveNumber(frame.height);
    if(!(width > 0) || !(height > 0)){
      return null;
    }
    return {
      ...frame,
      width,
      height,
      authority: frame.authority || frame.source || authority || 'explicit-frame'
    };
  }

  function resolveProjectionSource(svg, options = {}){
    if(options.sourceSvg){
      return options.sourceSvg;
    }
    if(svg?.__graphitixExportProjectionSource){
      return svg.__graphitixExportProjectionSource;
    }
    return svg || null;
  }

  function attachSource(targetSvg, sourceSvg){
    if(!targetSvg || !sourceSvg){
      return targetSvg || null;
    }
    try{
      Object.defineProperty(targetSvg, '__graphitixExportProjectionSource', {
        configurable: true,
        enumerable: false,
        writable: true,
        value: sourceSvg
      });
    }catch(_err){
      targetSvg.__graphitixExportProjectionSource = sourceSvg;
    }
    return targetSvg;
  }

  function resolveOwnerFrame(svg, options = {}){
    if(typeof options.getOwnerFrame === 'function'){
      try{
        const explicit = normalizeFrame(options.getOwnerFrame(svg), 'get-owner-frame');
        if(explicit){
          return explicit;
        }
      }catch(err){
        if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
          console.debug('Debug: exportProjection owner-frame callback failed', {
            component: options.componentName || null,
            contextLabel: options.contextLabel || null,
            error: err?.message || String(err)
          });
        }
      }
    }
    const direct = normalizeFrame(options.ownerFrame, 'owner-frame');
    if(direct){
      return direct;
    }

    const sourceSvg = resolveProjectionSource(svg, options);
    const ownerElement = options.ownerElement || sourceSvg || svg || null;
    const svgBox = options.svgBox
      || ownerElement?.closest?.('.svgbox')
      || sourceSvg?.closest?.('.svgbox')
      || null;
    const plot = options.plot
      || options.ownerPlot
      || sourceSvg?.parentElement
      || ownerElement?.parentElement
      || sourceSvg
      || ownerElement
      || null;

    const resolver = Shared.componentLayout?.resolveDrawableFrame;
    if(typeof resolver === 'function' && svgBox){
      const resolved = normalizeFrame(resolver({
        plot,
        svgBox,
        componentName: options.componentName || null,
        source: options.contextLabel || 'export-projection'
      }), 'component-layout');
      if(resolved){
        return resolved;
      }
    }

    const fallbackNodes = [
      options.ownerFrameElement,
      svgBox,
      options.ownerElement,
      sourceSvg,
      svg
    ].filter(Boolean);
    for(const node of fallbackNodes){
      let rect = null;
      try{
        rect = node.getBoundingClientRect?.() || null;
      }catch(_err){
        rect = null;
      }
      const measured = normalizeFrame({
        width: rect?.width,
        height: rect?.height,
        node,
        source: 'rendered-frame'
      }, 'rendered-frame');
      if(measured){
        return measured;
      }
    }

    const viewBox = resolveViewBox(sourceSvg || svg);
    const attrWidth = parseDimension((sourceSvg || svg)?.getAttribute?.('width'));
    const attrHeight = parseDimension((sourceSvg || svg)?.getAttribute?.('height'));
    return normalizeFrame({
      width: attrWidth || viewBox?.width,
      height: attrHeight || viewBox?.height,
      source: 'svg-fallback'
    }, 'svg-fallback');
  }

  function resolvePreserveAspectRatio(svg){
    const raw = String(svg?.getAttribute?.('preserveAspectRatio') || 'xMidYMid meet').trim();
    if(!raw || raw.toLowerCase() === 'none'){
      return { raw: raw || 'none', none: true, align: 'none', mode: 'none' };
    }
    const parts = raw.split(/\s+/);
    return {
      raw,
      none: false,
      align: parts[0] || 'xMidYMid',
      mode: parts[1] === 'slice' ? 'slice' : 'meet'
    };
  }

  function resolveDeclaredContentExtension(sourceSvg, frame, logicalViewBox){
    const dataset = sourceSvg?.dataset || {};
    const baseWidth = positiveNumber(dataset.legendBaseWidth);
    const baseHeight = positiveNumber(dataset.legendBaseHeight);
    const reserveRight = nonNegativeNumber(dataset.graphContentReserveRight);
    const reserveBottom = nonNegativeNumber(dataset.graphContentReserveBottom);
    const sourceRight = Number.isFinite(reserveRight) ? reserveRight : 0;
    const sourceBottom = Number.isFinite(reserveBottom) ? reserveBottom : 0;
    const declaredWidth = (baseWidth > 0 ? baseWidth : 0) + sourceRight;
    const declaredHeight = (baseHeight > 0 ? baseHeight : 0) + sourceBottom;
    const baseLogicalWidth = logicalViewBox && baseWidth > 0 && declaredWidth > 0
      ? logicalViewBox.width * (baseWidth / declaredWidth)
      : logicalViewBox?.width;
    const baseLogicalHeight = logicalViewBox && baseHeight > 0 && declaredHeight > 0
      ? logicalViewBox.height * (baseHeight / declaredHeight)
      : logicalViewBox?.height;
    const right = sourceRight > 0
      ? sourceRight * ((baseWidth > 0 ? frame.width / baseWidth : 1))
      : 0;
    const bottom = sourceBottom > 0
      ? sourceBottom * ((baseHeight > 0 ? frame.height / baseHeight : 1))
      : 0;
    return {
      right,
      bottom,
      sourceRight,
      sourceBottom,
      baseWidth: baseWidth > 0 ? baseWidth : null,
      baseHeight: baseHeight > 0 ? baseHeight : null,
      baseLogicalViewBox: logicalViewBox ? {
        minX: logicalViewBox.minX,
        minY: logicalViewBox.minY,
        width: baseLogicalWidth,
        height: baseLogicalHeight
      } : null
    };
  }

  function computeLogicalScale(viewBox, frame, preserve){
    const rawScaleX = frame.width / viewBox.width;
    const rawScaleY = frame.height / viewBox.height;
    if(preserve.none){
      return { x: rawScaleX, y: rawScaleY, uniform: false };
    }
    const scale = preserve.mode === 'slice'
      ? Math.max(rawScaleX, rawScaleY)
      : Math.min(rawScaleX, rawScaleY);
    return { x: scale, y: scale, uniform: true };
  }

  function resolve(svg, options = {}){
    const sourceSvg = resolveProjectionSource(svg, options);
    if(!sourceSvg){
      return null;
    }
    const logicalSvg = svg || sourceSvg;
    const logicalViewBox = resolveViewBox(logicalSvg) || resolveViewBox(sourceSvg);
    const ownerFrame = resolveOwnerFrame(sourceSvg, options);
    if(!logicalViewBox || !ownerFrame){
      return null;
    }
    const preserveAspectRatio = resolvePreserveAspectRatio(logicalSvg);
    const declaredExtension = resolveDeclaredContentExtension(sourceSvg, ownerFrame, logicalViewBox);
    const baseLogicalViewBox = declaredExtension.baseLogicalViewBox || logicalViewBox;
    const logicalToPhysical = computeLogicalScale(baseLogicalViewBox, ownerFrame, preserveAspectRatio);
    const physicalBase = { width: ownerFrame.width, height: ownerFrame.height };
    const physical = {
      width: ownerFrame.width + declaredExtension.right,
      height: ownerFrame.height + declaredExtension.bottom
    };
    return {
      sourceSvg,
      ownerFrame,
      logicalViewBox,
      baseLogicalViewBox,
      preserveAspectRatio,
      logicalToPhysical,
      declaredExtension,
      physicalBase,
      physical,
      cssDpi: CSS_DPI,
      pdf: {
        widthPt: physical.width * PDF_POINTS_PER_CSS_PX,
        heightPt: physical.height * PDF_POINTS_PER_CSS_PX
      }
    };
  }

  function measureViewBoxExtension(baseViewBox, targetViewBox){
    if(!baseViewBox || !targetViewBox){
      return { left: 0, top: 0, right: 0, bottom: 0 };
    }
    const baseRight = baseViewBox.minX + baseViewBox.width;
    const baseBottom = baseViewBox.minY + baseViewBox.height;
    const targetRight = targetViewBox.minX + targetViewBox.width;
    const targetBottom = targetViewBox.minY + targetViewBox.height;
    return {
      left: Math.max(0, baseViewBox.minX - targetViewBox.minX),
      top: Math.max(0, baseViewBox.minY - targetViewBox.minY),
      right: Math.max(0, targetRight - baseRight),
      bottom: Math.max(0, targetBottom - baseBottom)
    };
  }

  function resolveForViewBox(projection, targetViewBox){
    if(!projection){
      return null;
    }
    const normalizedTarget = targetViewBox || projection.logicalViewBox;
    const extension = measureViewBoxExtension(projection.logicalViewBox, normalizedTarget);
    const scaleX = Math.abs(projection.logicalToPhysical.x || 1);
    const scaleY = Math.abs(projection.logicalToPhysical.y || 1);
    const extraWidth = (extension.left + extension.right) * scaleX;
    const extraHeight = (extension.top + extension.bottom) * scaleY;
    const width = projection.physical.width + extraWidth;
    const height = projection.physical.height + extraHeight;
    return {
      ...projection,
      targetViewBox: normalizedTarget,
      measuredExtension: extension,
      physical: { width, height },
      pdf: {
        widthPt: width * PDF_POINTS_PER_CSS_PX,
        heightPt: height * PDF_POINTS_PER_CSS_PX
      }
    };
  }

  function formatNumber(value){
    if(!Number.isFinite(value)){
      return '0';
    }
    const rounded = Math.round(value * 1000000) / 1000000;
    return String(Object.is(rounded, -0) ? 0 : rounded);
  }

  function applyToSvg(svg, projection, options = {}){
    if(!svg || !projection){
      return null;
    }
    const targetViewBox = options.viewBox
      ? (typeof options.viewBox === 'string' ? parseViewBoxValue(options.viewBox) : options.viewBox)
      : resolveViewBox(svg) || projection.logicalViewBox;
    const resolved = resolveForViewBox(projection, targetViewBox);
    if(!resolved){
      return null;
    }
    if(targetViewBox){
      svg.setAttribute('viewBox', [
        targetViewBox.minX,
        targetViewBox.minY,
        targetViewBox.width,
        targetViewBox.height
      ].map(formatNumber).join(' '));
    }
    svg.setAttribute('width', formatNumber(resolved.physical.width));
    svg.setAttribute('height', formatNumber(resolved.physical.height));
    svg.setAttribute('data-export-physical-width-px', formatNumber(resolved.physical.width));
    svg.setAttribute('data-export-physical-height-px', formatNumber(resolved.physical.height));
    svg.setAttribute('data-export-css-dpi', String(CSS_DPI));
    return resolved;
  }

  function resolveRaster(projection, scale = 1, targetViewBox = null){
    const resolved = targetViewBox ? resolveForViewBox(projection, targetViewBox) : projection;
    if(!resolved){
      return null;
    }
    const rasterScale = positiveNumber(scale) || 1;
    const widthPx = Math.max(1, Math.round(resolved.physical.width * rasterScale));
    const heightPx = Math.max(1, Math.round(resolved.physical.height * rasterScale));
    return {
      widthPx,
      heightPx,
      physicalWidthPx: resolved.physical.width,
      physicalHeightPx: resolved.physical.height,
      scale: rasterScale,
      dpiX: CSS_DPI * rasterScale,
      dpiY: CSS_DPI * rasterScale
    };
  }

  function cssPxToPoints(value){
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric * PDF_POINTS_PER_CSS_PX : NaN;
  }

  function pointsToCssPx(value){
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric * CSS_PX_PER_POINT : NaN;
  }

  exportProjection.CSS_DPI = CSS_DPI;
  exportProjection.PDF_POINTS_PER_INCH = PDF_POINTS_PER_INCH;
  exportProjection.CSS_PX_PER_POINT = CSS_PX_PER_POINT;
  exportProjection.PDF_POINTS_PER_CSS_PX = PDF_POINTS_PER_CSS_PX;
  exportProjection.parseViewBox = parseViewBoxValue;
  exportProjection.resolveViewBox = resolveViewBox;
  exportProjection.resolveOwnerFrame = resolveOwnerFrame;
  exportProjection.resolve = resolve;
  exportProjection.resolveForViewBox = resolveForViewBox;
  exportProjection.resolveRaster = resolveRaster;
  exportProjection.applyToSvg = applyToSvg;
  exportProjection.attachSource = attachSource;
  exportProjection.cssPxToPoints = cssPxToPoints;
  exportProjection.pointsToCssPx = pointsToCssPx;

  if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
    console.debug('Debug: exportProjection module ready', {
      cssDpi: CSS_DPI,
      cssPxPerPoint: CSS_PX_PER_POINT
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
