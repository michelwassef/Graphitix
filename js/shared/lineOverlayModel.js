(function initLineOverlayModel(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const namespace = Shared.lineOverlayModel = Shared.lineOverlayModel || {};
  const LINE_OVERLAY_STYLE_DEFAULTS = Object.freeze({
    trend: Object.freeze({ color: 'auto', thickness: 1, transparency: 0, pattern: 'dashed' }),
    confidence: Object.freeze({ color: 'auto', thickness: 0, transparency: 85, pattern: 'solid' }),
    prediction: Object.freeze({ color: 'auto', thickness: 0, transparency: 92, pattern: 'solid' })
  });

  function normalizeLineOverlaySeriesKey(value){
    return String(value == null ? '' : value).trim();
  }

  function cloneLineOverlayStyleDefaults(){
    return {
      trend: { ...LINE_OVERLAY_STYLE_DEFAULTS.trend },
      confidence: { ...LINE_OVERLAY_STYLE_DEFAULTS.confidence },
      prediction: { ...LINE_OVERLAY_STYLE_DEFAULTS.prediction },
      bySeries: {}
    };
  }

  function sanitizeLineOverlayKey(key){
    const normalized = String(key || '').trim().toLowerCase();
    if(normalized === 'trend' || normalized === 'confidence' || normalized === 'prediction'){
      return normalized;
    }
    return null;
  }

  function sanitizeLineOverlayStyleEntry(entry, key){
    const safeKey = sanitizeLineOverlayKey(key);
    if(!safeKey){
      return null;
    }
    const fallback = LINE_OVERLAY_STYLE_DEFAULTS[safeKey] || LINE_OVERLAY_STYLE_DEFAULTS.trend;
    const next = entry && typeof entry === 'object' ? entry : {};
    const rawColor = typeof next.color === 'string' && next.color.trim()
      ? next.color.trim()
      : fallback.color;
    const color = String(rawColor || '').trim().toLowerCase() === 'auto'
      ? 'auto'
      : (String(rawColor || '').trim() || 'auto');
    const thicknessRaw = Number(next.thickness);
    const thickness = Number.isFinite(thicknessRaw)
      ? Math.max(0, thicknessRaw)
      : fallback.thickness;
    const transparencyRaw = Number(next.transparency);
    const transparency = Number.isFinite(transparencyRaw)
      ? Math.min(100, Math.max(0, transparencyRaw))
      : fallback.transparency;
    const patternRaw = String(next.pattern || next.linePattern || fallback.pattern || 'solid').toLowerCase();
    const pattern = (patternRaw === 'dashed' || patternRaw === 'dotted' || patternRaw === 'solid' || patternRaw === 'continuous')
      ? (patternRaw === 'continuous' ? 'solid' : patternRaw)
      : 'solid';
    return { color, thickness, transparency, pattern };
  }

  function lineOverlayPatternToDasharray(pattern, width){
    const normalized = String(pattern || 'solid').toLowerCase();
    const thickness = Number.isFinite(Number(width)) ? Math.max(0.5, Number(width)) : 1;
    if(normalized === 'dashed'){
      return `${Math.max(2, Math.round(thickness * 4))} ${Math.max(2, Math.round(thickness * 2.4))}`;
    }
    if(normalized === 'dotted'){
      return `${Math.max(1, Math.round(thickness))} ${Math.max(2, Math.round(thickness * 2.2))}`;
    }
    return '';
  }

  function resolveLineOverlayStrokeColor(styleColor, seriesColor, fallbackColor){
    const raw = String(styleColor == null ? '' : styleColor).trim();
    if(!raw || raw.toLowerCase() === 'auto'){
      const fromSeries = String(seriesColor == null ? '' : seriesColor).trim();
      if(fromSeries){
        return fromSeries;
      }
      const fromFallback = String(fallbackColor == null ? '' : fallbackColor).trim();
      if(fromFallback){
        return fromFallback;
      }
      return '#000000';
    }
    return raw;
  }

  function buildLineRegressionTrendPath(samples, options = {}){
    const source = Array.isArray(samples)
      ? samples.slice().sort((a, b) => (a?.x ?? 0) - (b?.x ?? 0))
      : [];
    const projectX = typeof options.projectX === 'function' ? options.projectX : null;
    const projectY = typeof options.projectY === 'function' ? options.projectY : null;
    if(!source.length || !projectX || !projectY){
      return null;
    }
    const logX = !!options.logX;
    const logY = !!options.logY;
    const xMin = Number.isFinite(options.xMin) ? options.xMin : -Infinity;
    const xMax = Number.isFinite(options.xMax) ? options.xMax : Infinity;
    const yMin = Number.isFinite(options.yMin) ? options.yMin : -Infinity;
    const yMax = Number.isFinite(options.yMax) ? options.yMax : Infinity;
    const isXVisible = typeof options.isXVisible === 'function' ? options.isXVisible : (() => true);
    const isYVisible = typeof options.isYVisible === 'function' ? options.isYVisible : (() => true);
    const segments = [];
    let current = [];
    const flush = () => {
      if(current.length >= 2){
        segments.push(current);
      }
      current = [];
    };
    source.forEach(sample => {
      const xRaw = Number(sample?.x);
      const yRaw = Number(sample?.y);
      if(!Number.isFinite(xRaw) || !Number.isFinite(yRaw) || (logX && xRaw <= 0) || (logY && yRaw <= 0)){
        flush();
        return;
      }
      const xValue = logX ? Math.log10(xRaw) : xRaw;
      const yValue = logY ? Math.log10(yRaw) : yRaw;
      if(!Number.isFinite(xValue) || !Number.isFinite(yValue)
        || xValue < xMin || xValue > xMax || yValue < yMin || yValue > yMax
        || !isXVisible(xValue) || !isYVisible(yValue)){
        flush();
        return;
      }
      const x = Number(projectX(xValue));
      const y = Number(projectY(yValue));
      if(!Number.isFinite(x) || !Number.isFinite(y)){
        flush();
        return;
      }
      current.push({ x, y });
    });
    flush();
    if(!segments.length){
      return null;
    }
    const commands = [];
    segments.forEach(segment => {
      segment.forEach((point, index) => {
        commands.push(`${index ? 'L' : 'M'}${point.x},${point.y}`);
      });
    });
    return { d: commands.join(' '), commandCount: commands.length, segmentCount: segments.length };
  }

  function sanitizeLineOverlayStylesMap(value){
    const defaults = cloneLineOverlayStyleDefaults();
    if(!value || typeof value !== 'object'){
      return defaults;
    }
    Object.keys(defaults).forEach(key => {
      if(key === 'bySeries'){
        return;
      }
      defaults[key] = sanitizeLineOverlayStyleEntry(value[key], key) || defaults[key];
    });
    const sourceBySeries = value.bySeries && typeof value.bySeries === 'object' ? value.bySeries : {};
    const bySeries = {};
    Object.keys(sourceBySeries).forEach(rawSeriesKey => {
      const seriesKey = normalizeLineOverlaySeriesKey(rawSeriesKey);
      if(!seriesKey){
        return;
      }
      const sourceEntry = sourceBySeries[rawSeriesKey];
      if(!sourceEntry || typeof sourceEntry !== 'object'){
        return;
      }
      const nextEntry = {};
      ['trend', 'confidence', 'prediction'].forEach(overlayKey => {
        const style = sanitizeLineOverlayStyleEntry(sourceEntry[overlayKey], overlayKey);
        if(style){
          nextEntry[overlayKey] = style;
        }
      });
      if(Object.keys(nextEntry).length){
        bySeries[seriesKey] = nextEntry;
      }
    });
    defaults.bySeries = bySeries;
    return defaults;
  }

  function parseLineOverlayToolbarScope(value){
    const raw = String(value == null ? '' : value).trim();
    if(!raw || raw.toLowerCase() === 'global'){
      return { mode: 'global', overlayKey: null, seriesKey: '' };
    }
    const tokenIndex = raw.indexOf('::');
    if(tokenIndex > 0){
      const overlayKey = sanitizeLineOverlayKey(raw.slice(0, tokenIndex));
      let decodedSeries = raw.slice(tokenIndex + 2);
      try{
        decodedSeries = decodeURIComponent(decodedSeries);
      }catch(_err){
        // Keep the raw scope value when a legacy archive contains bad escaping.
      }
      const seriesKey = normalizeLineOverlaySeriesKey(decodedSeries);
      if(overlayKey && seriesKey){
        return { mode: 'series', overlayKey, seriesKey };
      }
      if(overlayKey){
        return { mode: 'overlay', overlayKey, seriesKey: '' };
      }
      return { mode: 'global', overlayKey: null, seriesKey: '' };
    }
    const overlayKey = sanitizeLineOverlayKey(raw);
    return overlayKey
      ? { mode: 'overlay', overlayKey, seriesKey: '' }
      : { mode: 'global', overlayKey: null, seriesKey: '' };
  }

  function buildLineOverlaySeriesScopeValue(overlayKey, seriesKey){
    const safeKey = sanitizeLineOverlayKey(overlayKey);
    const safeSeriesKey = normalizeLineOverlaySeriesKey(seriesKey);
    if(!safeKey){
      return 'global';
    }
    if(!safeSeriesKey){
      return safeKey;
    }
    return `${safeKey}::${encodeURIComponent(safeSeriesKey)}`;
  }

  function normalizeLineOverlayToolbarScope(value){
    const parsed = parseLineOverlayToolbarScope(value);
    if(parsed.mode === 'global'){
      return 'global';
    }
    if(parsed.mode === 'series'){
      return buildLineOverlaySeriesScopeValue(parsed.overlayKey, parsed.seriesKey);
    }
    return sanitizeLineOverlayKey(parsed.overlayKey) || 'global';
  }

  function getLineOverlayScopeTargets(scopeKey){
    const parsed = parseLineOverlayToolbarScope(scopeKey);
    if(parsed.mode === 'global'){
      return [
        { key: 'trend', seriesKey: '' },
        { key: 'confidence', seriesKey: '' },
        { key: 'prediction', seriesKey: '' }
      ];
    }
    if(parsed.mode === 'series'){
      return [{ key: parsed.overlayKey, seriesKey: parsed.seriesKey }];
    }
    return [{ key: parsed.overlayKey || 'trend', seriesKey: '' }];
  }

  function getLineOverlayToolbarLabels(scopeKey){
    const parsed = parseLineOverlayToolbarScope(scopeKey);
    if(parsed.mode === 'global'){
      return {
        colorLabel: 'Color',
        thicknessLabel: 'Thickness',
        patternLabel: 'Line pattern',
        transparencyLabel: 'Transparency'
      };
    }
    if(parsed.overlayKey === 'trend'){
      return {
        colorLabel: 'Line',
        thicknessLabel: 'Line width',
        patternLabel: 'Line pattern',
        transparencyLabel: 'Line transparency'
      };
    }
    return {
      colorLabel: 'Fill',
      thicknessLabel: 'Border thickness',
      patternLabel: 'Line pattern',
      transparencyLabel: 'Fill transparency'
    };
  }

  Object.assign(namespace, {
    LINE_OVERLAY_STYLE_DEFAULTS,
    normalizeLineOverlaySeriesKey,
    cloneLineOverlayStyleDefaults,
    sanitizeLineOverlayKey,
    sanitizeLineOverlayStyleEntry,
    lineOverlayPatternToDasharray,
    resolveLineOverlayStrokeColor,
    buildLineRegressionTrendPath,
    sanitizeLineOverlayStylesMap,
    parseLineOverlayToolbarScope,
    buildLineOverlaySeriesScopeValue,
    normalizeLineOverlayToolbarScope,
    getLineOverlayScopeTargets,
    getLineOverlayToolbarLabels
  });

  if(typeof module !== 'undefined' && module.exports){
    module.exports = namespace;
  }
})(typeof window !== 'undefined' ? window : globalThis);
