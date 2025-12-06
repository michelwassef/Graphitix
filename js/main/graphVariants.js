(function() {
  "use strict";
  const Main = window.Main = window.Main || {};
  const namespace = Main.graphVariants = Main.graphVariants || {};

  function createVariant(config) {
    const entry = {
      id: config.id,
      type: config.type,
      label: config.label,
      description: config.description || '',
      groupLabel: config.groupLabel || 'Workspace',
      keywords: Array.isArray(config.keywords) ? config.keywords.slice() : []
    };
    return entry;
  }

  function setSelectValue(id, value) {
    const el = document.getElementById(id);
    if (!el) {
      console.debug('Graph variant select missing', { id, value });
      return false;
    }
    if (el.value !== value) {
      el.value = value;
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function applyBoxVariant(value) {
    return setSelectValue('boxGraphType', value);
  }

  function applyScatterVariant(graphType, viewMode) {
    const graphTypeApplied = setSelectValue('scatterGraphType', graphType);
    if (!graphTypeApplied) {
      return false;
    }
    if (viewMode) {
      return setSelectValue('scatterViewMode', viewMode);
    }
    return true;
  }

  function applyPcaVariant(method, viewMode) {
    const methodApplied = setSelectValue('pcaMethod', method);
    if (!methodApplied) {
      return false;
    }
    return setSelectValue('pcaViewMode', viewMode || '2d');
  }

  function applySurfaceVariant(mode) {
    return setSelectValue('surfaceInterpolation', mode);
  }

  function applyLineVariant(mode) {
    return setSelectValue('lineDisplayMode', mode);
  }

  function applyHeatmapVariant(mode) {
    return setSelectValue('heatmapView', mode);
  }

  function applyRocVariant(mode) {
    return setSelectValue('rocGraphType', mode);
  }

  function applyPieVariant(mode) {
    return setSelectValue('pieChartType', mode);
  }

  const VARIANTS = [
    createVariant({
      id: 'venn:diagram',
      type: 'venn',
      label: 'Venn diagram',
      description: 'Compare up to three sets with overlap counts and analysis hooks.',
      groupLabel: 'Venn Diagram',
      keywords: ['sets', 'overlap']
    }),
    createVariant({
      id: 'box:box',
      type: 'box',
      label: 'Box plot',
      description: 'Classic quartile whiskers for side-by-side groups.',
      groupLabel: 'Distribution Charts',
      keywords: ['distribution', 'quartile']
    }),
    createVariant({
      id: 'box:notched',
      type: 'box',
      label: 'Notched box plot',
      description: 'Show medians with confidence notch overlays.',
      groupLabel: 'Distribution Charts',
      keywords: ['median', 'notch']
    }),
    createVariant({
      id: 'box:bar',
      type: 'box',
      label: 'Bar plot',
      description: 'Mean-centered bars with optional error bars.',
      groupLabel: 'Distribution Charts',
      keywords: ['bar', 'mean', 'error']
    }),
    createVariant({
      id: 'box:strip',
      type: 'box',
      label: 'Individual values',
      description: 'Strip plot of every observation with optional summary overlay.',
      groupLabel: 'Distribution Charts',
      keywords: ['strip', 'points', 'swarm']
    }),
    createVariant({
      id: 'box:violin',
      type: 'box',
      label: 'Violin plot',
      description: 'Kernel density silhouettes per group.',
      groupLabel: 'Distribution Charts',
      keywords: ['density', 'violin']
    }),
    createVariant({
      id: 'scatter:scatter-2d',
      type: 'scatter',
      label: 'Scatter plot (2D)',
      description: 'Standard XY scatter for correlations or expression.',
      groupLabel: 'XY Plots',
      keywords: ['correlation', 'expression', 'xy']
    }),
    createVariant({
      id: 'scatter:scatter-bubble',
      type: 'scatter',
      label: 'Bubble plot',
      description: 'Area-encoded scatter plot for three-field datasets.',
      groupLabel: 'XY Plots',
      keywords: ['bubble', 'size', '3-field']
    }),
    createVariant({
      id: 'scatter:scatter-3d',
      type: 'scatter',
      label: 'Scatter plot (3D)',
      description: 'Interactive 3D scatter for up to three measures.',
      groupLabel: 'XY Plots',
      keywords: ['3d', 'point cloud']
    }),
    createVariant({
      id: 'scatter:volcano',
      type: 'scatter',
      label: 'Volcano plot',
      description: 'Fold-change vs. significance for differential expression.',
      groupLabel: 'XY Plots',
      keywords: ['volcano', 'differential', 'genes']
    }),
    createVariant({
      id: 'scatter:ma',
      type: 'scatter',
      label: 'MA plot',
      description: 'Mean versus log ratio visualization.',
      groupLabel: 'XY Plots',
      keywords: ['ma', 'microarray']
    }),
    createVariant({
      id: 'pca:pca-2d',
      type: 'pca',
      label: 'PCA (2D)',
      description: 'Principal component projection in two dimensions.',
      groupLabel: 'Dimensionality Reduction',
      keywords: ['pca', 'variance']
    }),
    createVariant({
      id: 'pca:pca-3d',
      type: 'pca',
      label: 'PCA (3D)',
      description: 'Three-axis PCA scatter with rotation.',
      groupLabel: 'Dimensionality Reduction',
      keywords: ['pca', '3d']
    }),
    createVariant({
      id: 'pca:mds-2d',
      type: 'pca',
      label: 'MDS (2D)',
      description: 'Metric multidimensional scaling in 2D.',
      groupLabel: 'Dimensionality Reduction',
      keywords: ['mds', 'distance']
    }),
    createVariant({
      id: 'pca:mds-3d',
      type: 'pca',
      label: 'MDS (3D)',
      description: 'Three-axis MDS exploration.',
      groupLabel: 'Dimensionality Reduction',
      keywords: ['mds', '3d']
    }),
    createVariant({
      id: 'pca:tsne-2d',
      type: 'pca',
      label: 't-SNE (2D)',
      description: 't-SNE embedding with interactive controls.',
      groupLabel: 'Dimensionality Reduction',
      keywords: ['tsne', 'nonlinear']
    }),
    createVariant({
      id: 'pca:tsne-3d',
      type: 'pca',
      label: 't-SNE (3D)',
      description: 'Three-dimensional t-SNE layout.',
      groupLabel: 'Dimensionality Reduction',
      keywords: ['tsne', '3d']
    }),
    createVariant({
      id: 'pca:umap-2d',
      type: 'pca',
      label: 'UMAP (2D)',
      description: 'Uniform Manifold Approximation projection.',
      groupLabel: 'Dimensionality Reduction',
      keywords: ['umap', 'manifold']
    }),
    createVariant({
      id: 'pca:umap-3d',
      type: 'pca',
      label: 'UMAP (3D)',
      description: 'Three-axis UMAP scatter.',
      groupLabel: 'Dimensionality Reduction',
      keywords: ['umap', '3d']
    }),
    createVariant({
      id: 'surface:grid',
      type: 'surface',
      label: 'Surface plot (grid)',
      description: 'Interpolated mesh surface from gridded data.',
      groupLabel: '3D Surface Plot',
      keywords: ['surface', 'grid', 'mesh']
    }),
    createVariant({
      id: 'surface:points',
      type: 'surface',
      label: 'Surface plot (points)',
      description: 'Scatter surface rendering without interpolation.',
      groupLabel: '3D Surface Plot',
      keywords: ['surface', 'points']
    }),
    createVariant({
      id: 'line:line',
      type: 'line',
      label: 'Line chart',
      description: 'Linked lines for tracking trends over time.',
      groupLabel: 'Line & Area Charts',
      keywords: ['line', 'trend']
    }),
    createVariant({
      id: 'line:area',
      type: 'line',
      label: 'Area chart',
      description: 'Filled areas for cumulative signal.',
      groupLabel: 'Line & Area Charts',
      keywords: ['area', 'fill']
    }),
    createVariant({
      id: 'heatmap:values',
      type: 'heatmap',
      label: 'Heatmap (data values)',
      description: 'Numerical matrix view of raw intensities.',
      groupLabel: 'Heatmap & Clustering',
      keywords: ['heatmap', 'values', 'matrix']
    }),
    createVariant({
      id: 'heatmap:corr-columns',
      type: 'heatmap',
      label: 'Heatmap (sample correlation)',
      description: 'Correlation heatmap across columns/arrays.',
      groupLabel: 'Heatmap & Clustering',
      keywords: ['correlation', 'samples']
    }),
    createVariant({
      id: 'heatmap:corr-rows',
      type: 'heatmap',
      label: 'Heatmap (gene correlation)',
      description: 'Correlation heatmap across genes/rows.',
      groupLabel: 'Heatmap & Clustering',
      keywords: ['correlation', 'genes']
    }),
    createVariant({
      id: 'roc:roc',
      type: 'roc',
      label: 'ROC curve',
      description: 'Receiver operating characteristic analysis.',
      groupLabel: 'Classification Curves',
      keywords: ['roc', 'classification']
    }),
    createVariant({
      id: 'roc:pr',
      type: 'roc',
      label: 'Precision-recall curve',
      description: 'PR curve for imbalanced classifiers.',
      groupLabel: 'Classification Curves',
      keywords: ['precision', 'recall']
    }),
    createVariant({
      id: 'survival:km',
      type: 'survival',
      label: 'Kaplan-Meier',
      description: 'Survival probability curves with censoring.',
      groupLabel: 'Survival Analysis',
      keywords: ['survival', 'km', 'censor']
    }),
    createVariant({
      id: 'hist:hist',
      type: 'hist',
      label: 'Histogram',
      description: 'Frequency distribution with adjustable bins.',
      groupLabel: 'Histogram',
      keywords: ['histogram', 'distribution']
    }),
    createVariant({
      id: 'pie:pie',
      type: 'pie',
      label: 'Pie chart',
      description: 'Circle slices for part-to-whole comparisons.',
      groupLabel: 'Pie, Donut & Stacked Bar',
      keywords: ['pie', 'proportion']
    }),
    createVariant({
      id: 'pie:donut',
      type: 'pie',
      label: 'Donut chart',
      description: 'Ring style part-to-whole visualization.',
      groupLabel: 'Pie, Donut & Stacked Bar',
      keywords: ['donut', 'ring']
    }),
    createVariant({
      id: 'pie:stacked',
      type: 'pie',
      label: 'Stacked bar',
      description: 'Stacked columns for categorical proportions.',
      groupLabel: 'Pie, Donut & Stacked Bar',
      keywords: ['stacked', 'bar', 'proportion']
    })
  ];

  const APPLY_HANDLERS = {
    'venn:diagram': () => true,
    'box:box': () => applyBoxVariant('box'),
    'box:notched': () => applyBoxVariant('notched'),
    'box:bar': () => applyBoxVariant('bar'),
    'box:strip': () => applyBoxVariant('strip'),
    'box:violin': () => applyBoxVariant('violin'),
    'scatter:scatter-2d': () => applyScatterVariant('scatter', '2d'),
    'scatter:scatter-bubble': () => applyScatterVariant('scatter', 'bubble'),
    'scatter:scatter-3d': () => applyScatterVariant('scatter', '3d'),
    'scatter:volcano': () => applyScatterVariant('volcano'),
    'scatter:ma': () => applyScatterVariant('ma'),
    'pca:pca-2d': () => applyPcaVariant('pca', '2d'),
    'pca:pca-3d': () => applyPcaVariant('pca', '3d'),
    'pca:mds-2d': () => applyPcaVariant('mds', '2d'),
    'pca:mds-3d': () => applyPcaVariant('mds', '3d'),
    'pca:tsne-2d': () => applyPcaVariant('tsne', '2d'),
    'pca:tsne-3d': () => applyPcaVariant('tsne', '3d'),
    'pca:umap-2d': () => applyPcaVariant('umap', '2d'),
    'pca:umap-3d': () => applyPcaVariant('umap', '3d'),
    'surface:grid': () => applySurfaceVariant('grid'),
    'surface:points': () => applySurfaceVariant('scatter'),
    'line:line': () => applyLineVariant('line'),
    'line:area': () => applyLineVariant('area'),
    'heatmap:values': () => applyHeatmapVariant('values'),
    'heatmap:corr-columns': () => applyHeatmapVariant('corr-columns'),
    'heatmap:corr-rows': () => applyHeatmapVariant('corr-rows'),
    'roc:roc': () => applyRocVariant('roc'),
    'roc:pr': () => applyRocVariant('pr'),
    'survival:km': () => true,
    'hist:hist': () => true,
    'pie:pie': () => applyPieVariant('pie'),
    'pie:donut': () => applyPieVariant('donut'),
    'pie:stacked': () => applyPieVariant('stacked')
  };

  function cloneVariant(entry) {
    return {
      id: entry.id,
      type: entry.type,
      label: entry.label,
      description: entry.description,
      groupLabel: entry.groupLabel,
      keywords: entry.keywords.slice()
    };
  }

  namespace.list = function listVariants() {
    return VARIANTS.map(cloneVariant);
  };

  namespace.getById = function getVariantById(id) {
    if (!id) {
      return null;
    }
    const match = VARIANTS.find(item => item.id === id);
    return match ? cloneVariant(match) : null;
  };

  namespace.applyVariant = function applyVariant(input, meta = {}) {
    if (!input) {
      return false;
    }
    const variant = typeof input === 'string' ? namespace.getById(input) : input;
    if (!variant) {
      console.debug('Graph variant apply skipped', { reason: 'missing-entry', input });
      return false;
    }
    const handler = APPLY_HANDLERS[variant.id];
    if (typeof handler !== 'function') {
      console.debug('Graph variant handler missing', { id: variant.id });
      return false;
    }
    const applied = handler(meta) !== false;
    if (applied) {
      console.debug('Graph variant applied', { id: variant.id, type: variant.type });
    } else {
      console.debug('Graph variant apply failed', { id: variant.id, type: variant.type });
    }
    return applied;
  };

  console.debug('Debug: graphVariants module initialized', { count: VARIANTS.length });
})();
