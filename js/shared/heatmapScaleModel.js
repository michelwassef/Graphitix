(function initHeatmapScaleModel(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const namespace = Shared.heatmapScaleModel = Shared.heatmapScaleModel || {};
  const DEFAULT_HEATMAP_PALETTE = Object.freeze({
    negative: '#0000ff',
    zero: '#ffffff',
    positive: '#ff0000'
  });
  const DEFAULT_HEATMAP_LEGEND_HEIGHT_MODE = 'match-heatmap';

  function normalizeHeatmapPalette(palette){
    const next = palette && typeof palette === 'object' ? palette : {};
    const normalize = (value, fallback) => {
      const text = typeof value === 'string' ? value.trim() : '';
      return text || fallback;
    };
    return {
      negative: normalize(next.negative, DEFAULT_HEATMAP_PALETTE.negative),
      zero: normalize(next.zero, DEFAULT_HEATMAP_PALETTE.zero),
      positive: normalize(next.positive, DEFAULT_HEATMAP_PALETTE.positive)
    };
  }

  function normalizeHeatmapScaleNumber(value){
    if(value == null){
      return null;
    }
    if(typeof value === 'string' && value.trim() === ''){
      return null;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function normalizeHeatmapValueScale(scale){
    const next = scale && typeof scale === 'object' ? scale : {};
    return {
      min: normalizeHeatmapScaleNumber(next.min),
      max: normalizeHeatmapScaleNumber(next.max)
    };
  }

  function normalizeHeatmapLegendHeightMode(value){
    return value === 'fixed' ? 'fixed' : DEFAULT_HEATMAP_LEGEND_HEIGHT_MODE;
  }

  function isHeatmapValueView(view){
    const normalized = typeof view === 'string' ? view.trim() : '';
    return normalized ? !normalized.startsWith('corr') : false;
  }

  function normalizeHeatmapMetric(value, fallback = 'pearson'){
    const normalized = typeof value === 'string' ? value.trim() : '';
    return normalized || fallback;
  }

  function resolveHeatmapCorrelationLegendTitle(method){
    const normalized = normalizeHeatmapMetric(method, 'pearson').toLowerCase();
    const methodLabels = {
      pearson: 'Pearson',
      spearman: 'Spearman',
      uncentered: 'Uncentered'
    };
    const methodLabel = methodLabels[normalized]
      || `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
    return {
      method: normalized,
      text: `${methodLabel} correlation`,
      lines: [methodLabel, 'correlation']
    };
  }

  Object.assign(namespace, {
    DEFAULT_HEATMAP_PALETTE,
    DEFAULT_HEATMAP_LEGEND_HEIGHT_MODE,
    normalizeHeatmapPalette,
    normalizeHeatmapScaleNumber,
    normalizeHeatmapValueScale,
    normalizeHeatmapLegendHeightMode,
    isHeatmapValueView,
    normalizeHeatmapMetric,
    resolveHeatmapCorrelationLegendTitle
  });

  if(typeof module !== 'undefined' && module.exports){
    module.exports = namespace;
  }
})(typeof window !== 'undefined' ? window : globalThis);
