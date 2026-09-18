(function initBoxPointSizing(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const namespace = Shared.boxPointSizing = Shared.boxPointSizing || {};

  function resolveNumericFromKeys(source, keys){
    if(!source || typeof source !== 'object' || !Array.isArray(keys)){
      return NaN;
    }
    for(let index = 0; index < keys.length; index += 1){
      const value = Number(source[keys[index]]);
      if(Number.isFinite(value) && value > 0){
        return value;
      }
    }
    return NaN;
  }

  function resolveBoxPointResizeScaleInfo(scaleInfo){
    const chartStyle = Shared.chartStyle || {};
    const minScaleBound = Number.isFinite(Number(chartStyle.RESIZE_MIN_SCALE)) ? Number(chartStyle.RESIZE_MIN_SCALE) : 0.3;
    const maxScaleBound = Number.isFinite(Number(chartStyle.RESIZE_MAX_SCALE)) ? Number(chartStyle.RESIZE_MAX_SCALE) : 3;
    const clampScale = value => {
      const numeric = Number(value);
      if(!Number.isFinite(numeric) || numeric <= 0){
        return NaN;
      }
      return Math.max(minScaleBound, Math.min(maxScaleBound, numeric));
    };
    const uniformScale = clampScale(resolveNumericFromKeys(scaleInfo, [
      'scale',
      'resizeScale',
      'styleScale',
      'lengthScale',
      'radiusScale'
    ]));
    let widthScale = clampScale(resolveNumericFromKeys(scaleInfo, [
      'boxPointScaleW',
      'boxPointScaleX',
      'pointScaleW',
      'pointScaleX',
      'scaleW',
      'scaleX',
      'widthScale',
      'resizeScaleX',
      'resizeScaleW',
      'xScale'
    ]));
    let heightScale = clampScale(resolveNumericFromKeys(scaleInfo, [
      'boxPointScaleH',
      'boxPointScaleY',
      'pointScaleH',
      'pointScaleY',
      'scaleH',
      'scaleY',
      'heightScale',
      'resizeScaleY',
      'resizeScaleH',
      'yScale'
    ]));
    if(!Number.isFinite(widthScale) && Number.isFinite(uniformScale)){
      widthScale = uniformScale;
    }
    if(!Number.isFinite(heightScale) && Number.isFinite(uniformScale)){
      heightScale = uniformScale;
    }
    if(!Number.isFinite(widthScale) || !Number.isFinite(heightScale)){
      return null;
    }
    return {
      widthScale,
      heightScale,
      minAxisScale: Math.min(widthScale, heightScale),
      maxAxisScale: Math.max(widthScale, heightScale),
      minScaleBound,
      maxScaleBound
    };
  }

  function resolveResponsivePointRadius(baseRadius, scaleInfo, options = {}){
    const base = Number(baseRadius);
    const minRadius = Number.isFinite(Number(options?.min)) ? Number(options.min) : 0;
    const context = typeof options?.context === 'string' && options.context.trim()
      ? options.context.trim()
      : 'box-point';
    const chartStyle = Shared.chartStyle || {};
    const scaleRadiusFn = typeof chartStyle.scaleRadius === 'function'
      ? chartStyle.scaleRadius
      : null;
    const fallbackRadius = scaleRadiusFn
      ? scaleRadiusFn(base, scaleInfo, { context, min: minRadius })
      : Math.max(minRadius, Number.isFinite(base) && base > 0 ? base : minRadius);
    if(!Number.isFinite(base) || base <= 0){
      return fallbackRadius;
    }
    const scale = resolveBoxPointResizeScaleInfo(scaleInfo);
    if(!scale){
      return fallbackRadius;
    }
    const scaledRadius = base * scale.minAxisScale;
    const maxRadius = Math.max(minRadius, base * scale.maxScaleBound);
    if(!Number.isFinite(scaledRadius) || scaledRadius <= 0){
      return fallbackRadius;
    }
    return Math.max(minRadius, Math.min(maxRadius, scaledRadius));
  }

  function resolveBoxPointFrameDimension(source, keys){
    if(!source || typeof source !== 'object' || !Array.isArray(keys)){
      return NaN;
    }
    for(let index = 0; index < keys.length; index += 1){
      const value = Number(source[keys[index]]);
      if(Number.isFinite(value) && value > 0){
        return value;
      }
    }
    return NaN;
  }

  function buildBoxPointFrameScaleInfo(scaleInfo, frameSize = {}){
    const baseInfo = scaleInfo && typeof scaleInfo === 'object' ? scaleInfo : {};
    const width = resolveBoxPointFrameDimension(frameSize, ['width', 'widthPx', 'w']);
    const height = resolveBoxPointFrameDimension(frameSize, ['height', 'heightPx', 'h']);
    if(!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0){
      return baseInfo;
    }

    const existing = resolveBoxPointResizeScaleInfo(baseInfo);
    const explicitBaseWidth = resolveNumericFromKeys(baseInfo, [
      'defaultWidth',
      'defaultWidthPx',
      'baseWidth',
      'baseWidthPx',
      'graphDefaultWidth',
      'graphDefaultWidthPx',
      'resizerDefaultWidth',
      'resizerBaseWidth'
    ]);
    const explicitBaseHeight = resolveNumericFromKeys(baseInfo, [
      'defaultHeight',
      'defaultHeightPx',
      'baseHeight',
      'baseHeightPx',
      'graphDefaultHeight',
      'graphDefaultHeightPx',
      'resizerDefaultHeight',
      'resizerBaseHeight'
    ]);

    const baseWidthFromScale = existing && Number.isFinite(existing.widthScale) && existing.widthScale > 0
      ? width / existing.widthScale
      : NaN;
    const baseWidth = Number.isFinite(explicitBaseWidth) && explicitBaseWidth > 0
      ? explicitBaseWidth
      : baseWidthFromScale;
    const baseHeight = Number.isFinite(explicitBaseHeight) && explicitBaseHeight > 0
      ? explicitBaseHeight
      : (Number.isFinite(baseWidth) && baseWidth > 0
        ? baseWidth
        : (existing && Number.isFinite(existing.heightScale) && existing.heightScale > 0 ? height / existing.heightScale : NaN));

    const widthScale = Number.isFinite(baseWidth) && baseWidth > 0 ? width / baseWidth : NaN;
    const heightScale = Number.isFinite(baseHeight) && baseHeight > 0 ? height / baseHeight : NaN;
    if(!Number.isFinite(widthScale) || widthScale <= 0 || !Number.isFinite(heightScale) || heightScale <= 0){
      return baseInfo;
    }

    return {
      ...baseInfo,
      boxPointScaleW: widthScale,
      boxPointScaleH: heightScale,
      pointScaleW: widthScale,
      pointScaleH: heightScale,
      scaleW: widthScale,
      scaleH: heightScale
    };
  }

  function resolveBoxSemanticPointResizeProfile(currentSpans = {}, storedBaseline = {}, fallbackScaleInfo = null){
    const categorySpanPx = Number(currentSpans?.categorySpanPx);
    const valueSpanPx = Number(currentSpans?.valueSpanPx);
    const fallbackScale = resolveBoxPointResizeScaleInfo(fallbackScaleInfo);
    const fallbackMinScale = Number.isFinite(Number(fallbackScale?.minAxisScale)) && Number(fallbackScale.minAxisScale) > 0
      ? Number(fallbackScale.minAxisScale)
      : 1;
    const orientation = currentSpans?.orientation === 'horizontal' ? 'horizontal' : 'vertical';
    const fallbackCategoryScaleRaw = orientation === 'horizontal'
      ? Number(fallbackScale?.heightScale)
      : Number(fallbackScale?.widthScale);
    const fallbackValueScaleRaw = orientation === 'horizontal'
      ? Number(fallbackScale?.widthScale)
      : Number(fallbackScale?.heightScale);
    const fallbackCategoryScale = Number.isFinite(fallbackCategoryScaleRaw) && fallbackCategoryScaleRaw > 0
      ? fallbackCategoryScaleRaw
      : fallbackMinScale;
    const fallbackValueScale = Number.isFinite(fallbackValueScaleRaw) && fallbackValueScaleRaw > 0
      ? fallbackValueScaleRaw
      : fallbackMinScale;
    if(!Number.isFinite(categorySpanPx) || categorySpanPx <= 0 || !Number.isFinite(valueSpanPx) || valueSpanPx <= 0){
      return {
        scale: fallbackMinScale,
        baseline: null,
        initialized: false
      };
    }

    let baseCategorySpanPx = Number(storedBaseline?.baseCategorySpanPx);
    let baseValueSpanPx = Number(storedBaseline?.baseValueSpanPx);
    const hasStoredBaseline = Number.isFinite(baseCategorySpanPx) && baseCategorySpanPx > 0
      && Number.isFinite(baseValueSpanPx) && baseValueSpanPx > 0;
    if(!hasStoredBaseline){
      // Legacy payloads have no semantic baseline. Reconstruct each semantic
      // axis independently from the old physical resize scales so an archive
      // saved after a width-only/height-only resize keeps responding correctly.
      baseCategorySpanPx = categorySpanPx / fallbackCategoryScale;
      baseValueSpanPx = valueSpanPx / fallbackValueScale;
    }

    const chartStyle = Shared.chartStyle || {};
    const minScaleBound = Number.isFinite(Number(chartStyle.RESIZE_MIN_SCALE)) ? Number(chartStyle.RESIZE_MIN_SCALE) : 0.3;
    const maxScaleBound = Number.isFinite(Number(chartStyle.RESIZE_MAX_SCALE)) ? Number(chartStyle.RESIZE_MAX_SCALE) : 3;
    const rawScale = Math.min(
      categorySpanPx / baseCategorySpanPx,
      valueSpanPx / baseValueSpanPx
    );
    const scale = Number.isFinite(rawScale) && rawScale > 0
      ? Math.max(minScaleBound, Math.min(maxScaleBound, rawScale))
      : fallbackMinScale;
    return {
      scale,
      baseline: { baseCategorySpanPx, baseValueSpanPx },
      initialized: !hasStoredBaseline
    };
  }

  Object.assign(namespace, {
    resolveNumericFromKeys,
    resolveBoxPointResizeScaleInfo,
    resolveResponsivePointRadius,
    resolveBoxPointFrameDimension,
    buildBoxPointFrameScaleInfo,
    resolveBoxSemanticPointResizeProfile
  });

  if(typeof module !== 'undefined' && module.exports){
    module.exports = namespace;
  }
})(typeof window !== 'undefined' ? window : globalThis);
