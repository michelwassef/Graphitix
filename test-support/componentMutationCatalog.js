'use strict';

// Explicit persistence probes used by the browser contract matrix.  These are
// test metadata, not payload defaults and not a second application state store.
// A probe names one real durable field, its valid alternative, and the evidence
// expected from the owner/session boundary.
const COMPONENT_MUTATION_CATALOG = Object.freeze({
  venn: {
    baseline: {
      source: 'welcome-load-example',
      requiredPayloadPaths: ['style.plotType', 'style.title', 'meta.graphSizing.display.widthPx']
    },
    mutations: [
      { id: 'venn.plot-mode', kind: 'parameter', path: 'style.plotType', operation: 'enum-cycle', values: ['venn', 'upset'], fingerprint: ['style.plotType'] },
      { id: 'venn.title', kind: 'style', path: 'style.title', operation: 'text-suffix', suffix: ' [restored]', fingerprint: ['style.title'] },
      { id: 'venn.width', kind: 'layout', path: 'meta.graphSizing.display.widthPx', operation: 'number-delta', delta: 72, fingerprint: ['meta.graphSizing.display.widthPx'] }
    ],
    uiMutations: [
      { id: 'venn.plot-mode', kind: 'parameter', path: 'style.plotType', selector: '#vennPlotType', action: 'select-alternative', values: ['venn', 'upset'] },
      { id: 'venn.color-scheme', kind: 'style', path: 'style.colorScheme', selector: 'select[data-color-scheme-select="1"][data-component-type="venn"]', action: 'select-alternative', values: ['scientific', 'soft', 'normal', 'grayscale'] },
      { id: 'venn.width', kind: 'layout', authority: 'layout', path: 'display.widthPx', selector: '.svgbox .resizer-vertical', action: 'drag-horizontal', delta: 72, minDelta: 16 }
    ],
    interactionRestore: { selector: '.svgbox svg', targetSelector: 'svg text[data-font-role="graphTitle"]', action: 'inline-title-edit' }
  },
  box: {
    baseline: {
      source: 'welcome-load-example',
      requiredPayloadPaths: ['config.graphType', 'config.colorScheme', 'meta.graphSizing.display.widthPx']
    },
    mutations: [
      { id: 'box.graph-type', kind: 'parameter', path: 'config.graphType', operation: 'enum-cycle', values: ['strip', 'box', 'violin'], fingerprint: ['config.graphType'] },
      { id: 'box.color-scheme', kind: 'style', path: 'config.colorScheme', operation: 'scheme-cycle', values: ['grayscale', 'scientific', 'soft'], fingerprint: ['config.colorScheme', 'config.fill', 'config.border'] },
      { id: 'box.indexed-shape-style', kind: 'style', path: 'config.shapeStyles.0.fill', operation: 'set-value', value: '#0e7490', fingerprint: ['config.shapeStyles.0.fill'], requiresDomWitness: false },
      { id: 'box.connect-points', kind: 'parameter', path: 'config.connectPointsAcrossDatasets', operation: 'boolean-toggle', fingerprint: ['config.connectPointsAcrossDatasets'] },
      { id: 'box.width', kind: 'layout', path: 'meta.graphSizing.display.widthPx', operation: 'number-delta', delta: 72, fingerprint: ['meta.graphSizing.display.widthPx'] }
    ],
    uiMutations: [
      { id: 'box.graph-type', kind: 'parameter', path: 'config.graphType', selector: '#boxGraphType', action: 'select-alternative', values: ['strip', 'box', 'notched', 'bar', 'violin'] },
      { id: 'box.color-scheme', kind: 'style', path: 'config.colorScheme', selector: 'select[data-color-scheme-select="1"][data-component-type="box"]', action: 'select-alternative', values: ['scientific', 'soft', 'normal', 'grayscale'] },
      { id: 'box.width', kind: 'layout', authority: 'layout', path: 'display.widthPx', selector: '.svgbox .resizer-vertical', action: 'drag-horizontal', delta: 72, minDelta: 16 }
    ],
    interactionRestore: { selector: '.svgbox svg', targetSelector: 'svg text[data-font-role="graphTitle"]', action: 'inline-title-edit' }
  },
  scatter: {
    baseline: {
      source: 'welcome-load-example',
      requiredPayloadPaths: ['config.showErrorBars', 'config.colorScheme', 'meta.graphSizing.display.widthPx']
    },
    mutations: [
      { id: 'scatter.error-bars', kind: 'parameter', path: 'config.showErrorBars', operation: 'boolean-toggle', sideEffects: [{ path: 'config.showGroupedReplicatePoints', value: false }], fingerprint: ['config.showErrorBars'] },
      { id: 'scatter.color-scheme', kind: 'style', path: 'config.colorScheme', operation: 'scheme-cycle', values: ['grayscale', 'scientific', 'soft', 'normal'], sideEffects: [{ path: 'config.colorSchemeUserOverride', value: true }], fingerprint: ['config.colorScheme'] },
      { id: 'scatter.width', kind: 'layout', path: 'meta.graphSizing.display.widthPx', operation: 'number-delta', delta: 72, fingerprint: ['meta.graphSizing.display.widthPx'] }
    ],
    uiMutations: [
      { id: 'scatter.view-mode', kind: 'parameter', path: 'config.viewMode', selector: '#scatterViewMode', action: 'select-alternative', values: ['2d', 'bubble', '3d'] },
      { id: 'scatter.color-scheme', kind: 'style', path: 'config.colorScheme', selector: 'select[data-color-scheme-select="1"][data-component-type="scatter"]', action: 'select-alternative', values: ['scientific', 'soft', 'normal', 'grayscale'] },
      { id: 'scatter.width', kind: 'layout', authority: 'layout', path: 'display.widthPx', selector: '.svgbox .resizer-vertical', action: 'drag-horizontal', delta: 72, minDelta: 16 }
    ],
    interactionRestore: { selector: '.svgbox svg, .svgbox canvas', targetSelector: 'svg text[data-font-editable="1"]', action: 'label-toolbar' }
  },
  pca: {
    baseline: {
      source: 'welcome-load-example',
      requiredPayloadPaths: ['config.standardizeVariables', 'config.colorScheme', 'meta.graphSizing.display.widthPx']
    },
    mutations: [
      { id: 'pca.standardization', kind: 'parameter', path: 'config.standardizeVariables', operation: 'boolean-toggle', fingerprint: ['config.standardizeVariables'] },
      { id: 'pca.color-scheme', kind: 'style', path: 'config.colorScheme', operation: 'scheme-cycle', values: ['scientific', 'soft', 'normal'], fingerprint: ['config.colorScheme'] },
      { id: 'pca.width', kind: 'layout', path: 'meta.graphSizing.display.widthPx', operation: 'number-delta', delta: 72, fingerprint: ['meta.graphSizing.display.widthPx'] }
    ],
    uiMutations: [
      { id: 'pca.standardization', kind: 'parameter', path: 'config.standardizeVariables', selector: '#pcaStandardizeVariables', action: 'toggle' },
      { id: 'pca.color-scheme', kind: 'style', path: 'config.colorScheme', selector: 'select[data-color-scheme-select="1"][data-component-type="pca"]', action: 'select-alternative', values: ['scientific', 'soft', 'normal', 'grayscale'] },
      { id: 'pca.width', kind: 'layout', authority: 'layout', path: 'display.widthPx', selector: '.svgbox .resizer-vertical', action: 'drag-horizontal', delta: 72, minDelta: 16 }
    ],
    interactionRestore: { selector: '.svgbox svg', targetSelector: '[data-plot-point="1"]', action: 'label-toolbar' }
  },
  line: {
    baseline: {
      source: 'welcome-load-example',
      requiredPayloadPaths: ['config.displayMode', 'config.colorScheme', 'meta.graphSizing.display.widthPx']
    },
    mutations: [
      { id: 'line.display-mode', kind: 'parameter', path: 'config.displayMode', operation: 'enum-cycle', values: ['line', 'area'], fingerprint: ['config.displayMode'] },
      { id: 'line.color-scheme', kind: 'style', path: 'config.colorScheme', operation: 'scheme-cycle', values: ['scientific', 'soft', 'normal'], fingerprint: ['config.colorScheme'] },
      { id: 'line.width', kind: 'layout', path: 'meta.graphSizing.display.widthPx', operation: 'number-delta', delta: 72, fingerprint: ['meta.graphSizing.display.widthPx'] }
    ],
    uiMutations: [
      { id: 'line.display-mode', kind: 'parameter', path: 'config.displayMode', selector: '#lineDisplayMode', action: 'select-alternative', values: ['line', 'area'] },
      { id: 'line.color-scheme', kind: 'style', path: 'config.colorScheme', selector: 'select[data-color-scheme-select="1"][data-component-type="line"]', action: 'select-alternative', values: ['scientific', 'soft', 'normal', 'grayscale'] },
      { id: 'line.width', kind: 'layout', authority: 'layout', path: 'display.widthPx', selector: '.svgbox .resizer-vertical', action: 'drag-horizontal', delta: 72, minDelta: 16 }
    ],
    interactionRestore: { selector: '.svgbox svg', targetSelector: 'svg text[data-font-role="graphTitle"]', action: 'inline-title-edit' }
  },
  heatmap: {
    baseline: {
      source: 'welcome-load-example',
      requiredPayloadPaths: [
        'config.view',
        'config.colorScheme',
        'config.colors.negative',
        'config.colors.zero',
        'config.colors.positive',
        'meta.graphSizing.display.widthPx'
      ]
    },
    mutations: [
      { id: 'heatmap.view', kind: 'parameter', path: 'config.view', operation: 'enum-cycle', values: ['corr-columns', 'values'], fingerprint: ['config.view', 'activeDataViewId'] },
      {
        id: 'heatmap.color-scheme',
        kind: 'style',
        path: 'config.colorScheme',
        operation: 'scheme-cycle',
        values: ['scientific', 'soft', 'normal'],
        fingerprint: ['config.colorScheme'],
        projectionContract: {
          domExpectedOwnerKey: 'ownerProjection.config.displayedColorSchemeId',
          palettePairs: [
            { payloadPath: 'config.colors.negative', ownerKey: 'ownerProjection.config.palette.negative' },
            { payloadPath: 'config.colors.zero', ownerKey: 'ownerProjection.config.palette.zero' },
            { payloadPath: 'config.colors.positive', ownerKey: 'ownerProjection.config.palette.positive' }
          ]
        }
      },
      { id: 'heatmap.width', kind: 'layout', path: 'meta.graphSizing.display.widthPx', operation: 'number-delta', delta: 72, fingerprint: ['meta.graphSizing.display.widthPx'] }
    ],
    uiMutations: [
      { id: 'heatmap.view', kind: 'parameter', path: 'config.view', selector: '#heatmapView', action: 'select-alternative', values: ['corr-columns', 'values', 'corr-rows'] },
      { id: 'heatmap.color-scheme', kind: 'style', path: 'config.colorScheme', selector: 'select[data-color-scheme-select="1"][data-component-type="heatmap"]', action: 'select-alternative', values: ['scientific', 'soft', 'normal', 'grayscale'] },
      { id: 'heatmap.width', kind: 'layout', authority: 'layout', path: 'display.widthPx', selector: '.svgbox .resizer-vertical', action: 'drag-horizontal', delta: 72, minDelta: 16 }
    ],
    interactionRestore: { selector: '.svgbox svg, .svgbox canvas', targetSelector: '[data-export-layer="heatmap-cells"] rect:not([data-heatmap-cell-hit-layer])', action: 'heatmap-palette-toolbar' }
  },
  surface: {
    baseline: {
      source: 'welcome-load-example',
      requiredPayloadPaths: ['config.colorScheme', 'config.settings.backgroundColor', 'meta.graphSizing.display.widthPx']
    },
    mutations: [
      { id: 'surface.background', kind: 'parameter', path: 'config.settings.backgroundColor', operation: 'color-alternative', value: '#f2f5fa', fingerprint: ['config.settings.backgroundColor'] },
      { id: 'surface.color-scheme', kind: 'style', path: 'config.colorScheme', operation: 'scheme-cycle', values: ['surface-viridis', 'surface-plasma', 'surface-magma'], fingerprint: ['config.colorScheme'] },
      { id: 'surface.width', kind: 'layout', path: 'meta.graphSizing.display.widthPx', operation: 'number-delta', delta: 72, fingerprint: ['meta.graphSizing.display.widthPx'] }
    ],
    uiMutations: [
      { id: 'surface.interpolation', kind: 'parameter', path: 'config.settings.interpolation', selector: '#surfaceInterpolation', action: 'select-alternative', values: ['grid', 'scatter'] },
      { id: 'surface.color-scheme', kind: 'style', path: 'config.settings.colorScheme', selector: 'select[data-color-scheme-select="1"][data-component-type="surface"]', action: 'select-alternative', values: ['surface-viridis', 'surface-plasma', 'surface-magma'] },
      { id: 'surface.width', kind: 'layout', authority: 'layout', path: 'display.widthPx', selector: '.svgbox .resizer-vertical', action: 'drag-horizontal', delta: 72, minDelta: 16 }
    ],
    interactionRestore: { selector: '.svgbox svg', targetSelector: '[data-plot3d-rotation-hit-surface="1"]', action: '3d-rotation' }
  },
  roc: {
    baseline: {
      source: 'welcome-load-example',
      requiredPayloadPaths: ['config.graphType', 'config.colorScheme', 'meta.graphSizing.display.widthPx']
    },
    mutations: [
      { id: 'roc.graph-type', kind: 'parameter', path: 'config.graphType', operation: 'enum-cycle', values: ['roc', 'pr'], fingerprint: ['config.graphType'] },
      { id: 'roc.color-scheme', kind: 'style', path: 'config.colorScheme', operation: 'scheme-cycle', values: ['scientific', 'soft', 'normal'], fingerprint: ['config.colorScheme'] },
      { id: 'roc.width', kind: 'layout', path: 'meta.graphSizing.display.widthPx', operation: 'number-delta', delta: 72, fingerprint: ['meta.graphSizing.display.widthPx'] }
    ],
    uiMutations: [
      { id: 'roc.graph-type', kind: 'parameter', path: 'config.graphType', selector: '#rocGraphType', action: 'select-alternative', values: ['roc', 'pr'] },
      { id: 'roc.color-scheme', kind: 'style', path: 'config.colorScheme', selector: 'select[data-color-scheme-select="1"][data-component-type="roc"]', action: 'select-alternative', values: ['scientific', 'soft', 'normal', 'grayscale'] },
      { id: 'roc.width', kind: 'layout', authority: 'layout', path: 'display.widthPx', selector: '.svgbox .resizer-vertical', action: 'drag-horizontal', delta: 72, minDelta: 16 }
    ],
    interactionRestore: { selector: '.svgbox svg', targetSelector: 'svg text[data-font-role="graphTitle"]', action: 'inline-title-edit' }
  },
  survival: {
    baseline: {
      source: 'welcome-load-example',
      requiredPayloadPaths: ['config.showRiskTable', 'config.colorScheme', 'meta.graphSizing.display.widthPx']
    },
    mutations: [
      { id: 'survival.risk-table', kind: 'parameter', path: 'config.showRiskTable', operation: 'boolean-toggle', fingerprint: ['config.showRiskTable'] },
      { id: 'survival.color-scheme', kind: 'style', path: 'config.colorScheme', operation: 'scheme-cycle', values: ['scientific', 'soft', 'normal'], fingerprint: ['config.colorScheme'] },
      { id: 'survival.width', kind: 'layout', path: 'meta.graphSizing.display.widthPx', operation: 'number-delta', delta: 72, fingerprint: ['meta.graphSizing.display.widthPx'] }
    ],
    uiMutations: [
      { id: 'survival.risk-table', kind: 'parameter', path: 'config.showRiskTable', selector: '#survivalShowRiskTable', action: 'toggle' },
      { id: 'survival.color-scheme', kind: 'style', path: 'config.colorScheme', selector: 'select[data-color-scheme-select="1"][data-component-type="survival"]', action: 'select-alternative', values: ['scientific', 'soft', 'normal', 'grayscale'] },
      { id: 'survival.width', kind: 'layout', authority: 'layout', path: 'display.widthPx', selector: '.svgbox .resizer-vertical', action: 'drag-horizontal', delta: 72, minDelta: 16 }
    ],
    interactionRestore: { selector: '.svgbox svg', targetSelector: 'svg text[data-font-role="graphTitle"]', action: 'inline-title-edit' }
  },
  hist: {
    baseline: {
      source: 'welcome-load-example',
      requiredPayloadPaths: ['config.plotMode', 'config.colorScheme', 'meta.graphSizing.display.widthPx']
    },
    mutations: [
      { id: 'hist.plot-mode', kind: 'parameter', path: 'config.plotMode', operation: 'enum-cycle', values: ['histogram', 'density'], fingerprint: ['config.plotMode'] },
      { id: 'hist.color-scheme', kind: 'style', path: 'config.colorScheme', operation: 'scheme-cycle', values: ['scientific', 'soft', 'normal'], fingerprint: ['config.colorScheme'] },
      { id: 'hist.width', kind: 'layout', path: 'meta.graphSizing.display.widthPx', operation: 'number-delta', delta: 72, fingerprint: ['meta.graphSizing.display.widthPx'] }
    ],
    uiMutations: [
      { id: 'hist.plot-mode', kind: 'parameter', path: 'config.plotMode', selector: '#histPlotMode', action: 'select-alternative', values: ['histogram', 'density'] },
      { id: 'hist.color-scheme', kind: 'style', path: 'config.colorScheme', selector: 'select[data-color-scheme-select="1"][data-component-type="hist"]', action: 'select-alternative', values: ['scientific', 'soft', 'normal', 'grayscale'] },
      { id: 'hist.width', kind: 'layout', authority: 'layout', path: 'display.widthPx', selector: '.svgbox .resizer-vertical', action: 'drag-horizontal', delta: 72, minDelta: 16 }
    ],
    interactionRestore: { selector: '.svgbox svg', targetSelector: 'svg text[data-font-role="graphTitle"]', action: 'inline-title-edit' }
  },
  pie: {
    baseline: {
      source: 'welcome-load-example',
      requiredPayloadPaths: ['config.chartType', 'config.showPercents', 'meta.graphSizing.display.widthPx']
    },
    mutations: [
      { id: 'pie.chart-type', kind: 'parameter', path: 'config.chartType', operation: 'enum-cycle', values: ['pie', 'donut'], fingerprint: ['config.chartType'] },
      { id: 'pie.percent-labels', kind: 'style', path: 'config.showPercents', operation: 'boolean-toggle', fingerprint: ['config.showPercents'] },
      { id: 'pie.width', kind: 'layout', path: 'meta.graphSizing.display.widthPx', operation: 'number-delta', delta: 72, fingerprint: ['meta.graphSizing.display.widthPx'] }
    ],
    uiMutations: [
      { id: 'pie.chart-type', kind: 'parameter', path: 'config.chartType', selector: '#pieChartType', action: 'select-alternative', values: ['pie', 'donut', 'stacked'] },
      { id: 'pie.percent-labels', kind: 'style', path: 'config.showPercents', selector: '#pieShowPercents', action: 'toggle' },
      { id: 'pie.width', kind: 'layout', authority: 'layout', path: 'display.widthPx', selector: '.svgbox .resizer-vertical', action: 'drag-horizontal', delta: 72, minDelta: 16 }
    ],
    interactionRestore: { selector: '.svgbox svg', targetSelector: 'svg text[data-font-role="graphTitle"]', action: 'inline-title-edit' }
  }
});

const REQUIRED_KINDS = new Set(['parameter', 'style', 'layout']);
for (const [type, plan] of Object.entries(COMPONENT_MUTATION_CATALOG)) {
  if (!plan.baseline?.source || !Array.isArray(plan.baseline.requiredPayloadPaths)) {
    throw new Error(`Mutation plan for ${type} has no explicit baseline`);
  }
  const kinds = new Set((plan.mutations || []).map(mutation => mutation.kind));
  for (const kind of REQUIRED_KINDS) {
    if (!kinds.has(kind)) throw new Error(`Mutation plan for ${type} has no ${kind} probe`);
  }
  if (!plan.interactionRestore?.selector || !plan.interactionRestore?.targetSelector || !plan.interactionRestore?.action) {
    throw new Error(`Mutation plan for ${type} has no interaction-restore contract`);
  }
  for (const mutation of plan.mutations) {
    if (!mutation.id || !mutation.path || !mutation.operation || !Array.isArray(mutation.fingerprint)) {
      throw new Error(`Mutation plan for ${type} contains an incomplete probe`);
    }
  }
  if (!Array.isArray(plan.uiMutations) || plan.uiMutations.length < 2) {
    throw new Error(`Mutation plan for ${type} has no reviewed UI mutation probes`);
  }
  for (const mutation of plan.uiMutations) {
    if (!mutation.id || !mutation.path || !mutation.selector || !mutation.action) {
      throw new Error(`Mutation plan for ${type} contains an incomplete UI probe`);
    }
    if (mutation.action === 'select-alternative' && !Array.isArray(mutation.values)) {
      throw new Error(`UI select probe for ${type}/${mutation.id} has no candidate values`);
    }
    if (mutation.action === 'drag-horizontal'
      && (mutation.authority !== 'layout'
        || !Number.isFinite(Number(mutation.delta))
        || !Number.isFinite(Number(mutation.minDelta)))) {
      throw new Error(`UI resize probe for ${type}/${mutation.id} has no numeric drag contract`);
    }
  }
}

module.exports = {
  COMPONENT_MUTATION_CATALOG,
  REQUIRED_MUTATION_KINDS: Object.freeze(Array.from(REQUIRED_KINDS))
};
