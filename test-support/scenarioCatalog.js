'use strict';

const SCENARIO_CATALOG = Object.freeze([
  Object.freeze({ id: 'GOVERNANCE.component-catalog', kind: 'governance', components: ['*'] }),
  Object.freeze({ id: 'GOVERNANCE.discovery-inventory', kind: 'governance', components: ['*'] }),
  Object.freeze({ id: 'GOVERNANCE.layer-manifest', kind: 'governance', components: ['*'] }),
  Object.freeze({ id: 'GOVERNANCE.jest-project-boundaries', kind: 'governance', components: ['*'] }),
  Object.freeze({ id: 'GOVERNANCE.lane-runner', kind: 'governance', components: ['*'] }),
  Object.freeze({ id: 'GOVERNANCE.jest-shard-runner', kind: 'governance', components: ['*'] }),
  Object.freeze({ id: 'GOVERNANCE.coverage-trend', kind: 'governance', components: ['*'] }),
  Object.freeze({ id: 'GOVERNANCE.production-bootstrap-manifest', kind: 'governance', components: ['*'] }),
  Object.freeze({ id: 'GOVERNANCE.vendor-provenance', kind: 'governance', components: ['*'] }),
  Object.freeze({ id: 'GOVERNANCE.change-impact-map', kind: 'governance', components: ['*'] }),
  Object.freeze({ id: 'GOVERNANCE.component-mutation-catalog', kind: 'governance', components: ['*'] }),
  Object.freeze({ id: 'OWN.readiness-observability', kind: 'contract', contract: 'OWN', components: ['*'] }),
  Object.freeze({ id: 'OWN.readiness-projection', kind: 'contract', contract: 'OWN', components: ['*'] }),
  Object.freeze({ id: 'OWN.same-type-switching.all-components', kind: 'contract', contract: 'OWN', components: ['*'], requirement: 'Same-type tab isolation', capability: 'tab-isolation', evidence: 'owner-session-and-ui-contract' }),
  Object.freeze({ id: 'OWN.component-dom-binding', kind: 'contract', contract: 'OWN', components: ['*'] }),
  Object.freeze({ id: 'OWN.config-isolation.all-components', kind: 'contract', contract: 'OWN', components: ['*'], requirement: 'Configuration isolation between tabs', capability: 'tab-isolation', evidence: 'owner-payload-isolation-contract' }),
  Object.freeze({ id: 'OWN.cross-browser-feature-matrix', kind: 'contract', contract: 'OWN', components: ['*'] }),
  Object.freeze({ id: 'PERSIST.explicit-component-mutations', kind: 'contract', contract: 'PERSIST', components: ['*'], requirement: 'Component-specific mode and style persistence', capability: 'component-modes', evidence: 'component-mutation-matrix' }),
  Object.freeze({ id: 'PERSIST.session-payload-write-through', kind: 'contract', contract: 'PERSIST', components: ['*'], requirement: 'Owner session payload write-through', capability: 'persistence', evidence: 'owner-payload-write-through-contract' }),
  Object.freeze({ id: 'ARCHIVE.session-save-policies', kind: 'contract', contract: 'ARCHIVE', components: ['*'] }),
  Object.freeze({ id: 'REC.archive-restore-transaction', kind: 'contract', contract: 'REC', components: ['*'] }),
  Object.freeze({ id: 'PERSIST.grid-clipboard', kind: 'contract', contract: 'PERSIST', components: ['*'] }),
  Object.freeze({ id: 'OWN.ag-grid-edit-overflow', kind: 'contract', contract: 'OWN', components: ['scatter'] }),
  Object.freeze({ id: 'OWN.ag-grid-grouped-header-ownership', kind: 'contract', contract: 'OWN', components: ['box', 'scatter', 'line', 'pca'] }),
  Object.freeze({ id: 'OWN.ag-grid-keyboard-selection', kind: 'contract', contract: 'OWN', components: ['scatter'] }),
  Object.freeze({ id: 'LAYOUT.ag-grid-selection-scrollbar', kind: 'contract', contract: 'LAYOUT', components: ['box'] }),
  Object.freeze({ id: 'PERSIST.ag-grid-column-reorder-undo', kind: 'contract', contract: 'PERSIST', components: ['box'] }),
  Object.freeze({ id: 'STATS.same-type-archive-restore', kind: 'contract', contract: 'STATS', components: ['*'] }),
  Object.freeze({ id: 'PERSIST.stats-archive-restore', kind: 'contract', contract: 'PERSIST', components: ['*'] }),
  Object.freeze({ id: 'STATS.reopen-presence', kind: 'contract', contract: 'STATS', components: ['*'] }),
  Object.freeze({ id: 'PERSIST.stats-reopen', kind: 'contract', contract: 'PERSIST', components: ['*'] }),
  Object.freeze({ id: 'PERSIST.table-format-tab-isolation', kind: 'contract', contract: 'PERSIST', components: ['box', 'pca'] }),
  Object.freeze({ id: 'STATS.box-significance-restore', kind: 'contract', contract: 'STATS', components: ['box'] }),
  Object.freeze({ id: 'PERSIST.line-uncertainty-band-reopen', kind: 'contract', contract: 'PERSIST', components: ['line'] }),
  Object.freeze({ id: 'OWN.scatter-inline-edit-preview', kind: 'contract', contract: 'OWN', components: ['scatter'] }),
  Object.freeze({ id: 'STATS.figure-summary-layout', kind: 'contract', contract: 'STATS', components: ['*'] }),
  Object.freeze({ id: 'REC.heatmap-exclusion-archive-parity', kind: 'contract', contract: 'REC', components: ['heatmap'] }),
  Object.freeze({ id: 'STATS.box-dark-theme-regression', kind: 'contract', contract: 'STATS', components: ['box'] }),
  Object.freeze({ id: 'STATS.box-controls-isolation', kind: 'contract', contract: 'STATS', components: ['box'] }),
  Object.freeze({ id: 'STATS.heatmap-presentation', kind: 'contract', contract: 'STATS', components: ['heatmap'] }),
  Object.freeze({ id: 'STATS.scatter-statistics-isolation', kind: 'contract', contract: 'STATS', components: ['scatter'] }),
  Object.freeze({ id: 'STATS.survival-pipeline', kind: 'contract', contract: 'STATS', components: ['survival'] }),
  Object.freeze({ id: 'OWN.legend-3d-drag', kind: 'contract', contract: 'OWN', components: ['pca', 'line'] }),
  Object.freeze({ id: 'REC.primary-graph-publication', kind: 'contract', contract: 'REC', components: ['*'] }),
  Object.freeze({ id: 'REC.single-tab-recovery-checkpoint', kind: 'contract', contract: 'REC', components: ['box', 'scatter', 'hist', 'heatmap', 'line'] }),
  Object.freeze({ id: 'REC.reopen-data-redraw', kind: 'contract', contract: 'REC', components: ['*'] }),
  Object.freeze({ id: 'LAYOUT.axis-tick-label-optical-clearance', kind: 'contract', contract: 'LAYOUT', components: ['*'] }),
  Object.freeze({ id: 'PERSIST.dataview-lite-archive', kind: 'contract', contract: 'PERSIST', components: ['*'] }),
  Object.freeze({ id: 'IMPORT.prism-multi-dataset', kind: 'contract', contract: 'IMPORT', components: ['box', 'line', 'survival', 'scatter'] }),
  Object.freeze({ id: 'EXPORT.format-dimensions', kind: 'contract', contract: 'EXPORT', components: ['*'] }),
  Object.freeze({ id: 'LAYOUT.cartesian-x-label-reserve', kind: 'contract', contract: 'LAYOUT', components: ['line'] }),
  Object.freeze({ id: 'LAYOUT.box-reserve-invariants', kind: 'contract', contract: 'LAYOUT', components: ['box'] }),
  Object.freeze({ id: 'LAYOUT.small-viewport-stability', kind: 'contract', contract: 'LAYOUT', components: ['roc', 'surface'] }),
  Object.freeze({ id: 'LAYOUT.pca-legend-envelope', kind: 'contract', contract: 'LAYOUT', components: ['pca'], requirement: 'PCA legend envelope', capability: 'layout', evidence: 'pca-legend-content-envelope' }),
  Object.freeze({ id: 'LAYOUT.heatmap-label-font-resize', kind: 'contract', contract: 'LAYOUT', components: ['heatmap'], requirement: 'Heatmap label font resize', capability: 'layout', evidence: 'heatmap-label-font-toolbar' }),
  Object.freeze({ id: 'LAYOUT.legend-viewport-invariant', kind: 'contract', contract: 'LAYOUT', components: ['*'] }),
  Object.freeze({ id: 'PERSIST.pca-color-scheme-roundtrip', kind: 'contract', contract: 'PERSIST', components: ['pca'], requirement: 'PCA color scheme persistence', capability: 'persistence', evidence: 'pca-color-scheme-roundtrip' }),
  Object.freeze({ id: 'CACHE.pca-view-only-rotation', kind: 'contract', contract: 'CACHE', components: ['pca'], requirement: 'PCA view-only rotation cache', capability: 'render-cache', evidence: 'pca-view-cache' }),
  Object.freeze({ id: 'CACHE.pca-example-rebind', kind: 'contract', contract: 'CACHE', components: ['pca'], requirement: 'PCA example cache rebind', capability: 'render-cache', evidence: 'pca-example-load-cached-rebind' }),
  Object.freeze({ id: 'CACHE.scatter-example-rebind', kind: 'contract', contract: 'CACHE', components: ['scatter'], requirement: 'Scatter example cache rebind', capability: 'render-cache', evidence: 'scatter-example-load-cached-rebind' }),
  Object.freeze({ id: 'CACHE.tab-switch-reuse', kind: 'contract', contract: 'CACHE', components: ['*'] }),
  Object.freeze({ id: 'CACHE.reopened-first-interaction', kind: 'contract', contract: 'CACHE', components: ['*'], requirement: 'First interaction after render-cache restore', capability: 'render-cache', evidence: 'reopened-first-interaction-contract' }),
  Object.freeze({ id: 'PERSIST.venn-empty-payload-defaults', kind: 'contract', contract: 'PERSIST', components: ['venn'], requirement: 'Venn empty-payload defaults', capability: 'persistence', evidence: 'venn-default-payload-reset' }),
  Object.freeze({ id: 'PERSIST.pie-percent-labels', kind: 'contract', contract: 'PERSIST', components: ['pie'], requirement: 'Pie percent-label persistence', capability: 'persistence', evidence: 'pie-percent-labels-roundtrip' }),
  Object.freeze({ id: 'OWN.pie-tab-host-isolation', kind: 'contract', contract: 'OWN', components: ['pie'], requirement: 'Pie tab host isolation', capability: 'tab-isolation', evidence: 'pie-tab-isolation' }),
  Object.freeze({ id: 'OWN.workspace-grid-dimensions', kind: 'contract', contract: 'OWN', components: ['*'] }),
  Object.freeze({ id: 'OWN.style-control-tab-isolation', kind: 'contract', contract: 'OWN', components: ['*'] }),
  Object.freeze({ id: 'PERSIST.style-sync-across-tabs', kind: 'contract', contract: 'PERSIST', components: ['scatter'], requirement: 'Cross-tab style persistence', capability: 'persistence', evidence: 'source-and-target-payload-contract' }),
  Object.freeze({ id: 'OWN.unsaved-close-decisions', kind: 'contract', contract: 'OWN', components: ['*'] }),
  Object.freeze({ id: 'OWN.workspace-tab-reorder', kind: 'contract', contract: 'OWN', components: ['*'] }),
  Object.freeze({ id: 'OWN.surface-tab-context', kind: 'contract', contract: 'OWN', components: ['surface'], requirement: 'Surface tab context isolation', capability: 'tab-isolation', evidence: 'surface-tab-context' }),
  Object.freeze({ id: 'OWN.venn-runtime-isolation', kind: 'contract', contract: 'OWN', components: ['venn'], requirement: 'Venn runtime isolation', capability: 'tab-isolation', evidence: 'venn-tab-runtime' }),
  Object.freeze({ id: 'OWN.venn-upset-controls', kind: 'contract', contract: 'OWN', components: ['venn'], requirement: 'Venn UpSet control ownership', capability: 'component-modes', evidence: 'venn-upset-controls' }),
  Object.freeze({ id: 'OWN.heatmap-tab-context', kind: 'contract', contract: 'OWN', components: ['heatmap'], requirement: 'Heatmap tab context isolation', capability: 'tab-isolation', evidence: 'heatmap-tab-context' }),
  Object.freeze({ id: 'CACHE.heatmap-render-cache-restore', kind: 'contract', contract: 'CACHE', components: ['heatmap'], requirement: 'Heatmap render-cache restoration', capability: 'render-cache', evidence: 'heatmap-render-cache-restore' }),
  Object.freeze({ id: 'CACHE.heavy-canvas-recovery', kind: 'contract', contract: 'CACHE', components: ['box', 'scatter'] }),
  Object.freeze({ id: 'OWN.line-view-lifecycle', kind: 'contract', contract: 'OWN', components: ['line'], requirement: 'Line view lifecycle ownership', capability: 'tab-isolation', evidence: 'line-view-lifecycle' }),
  Object.freeze({ id: 'OWN.pca-view-controls', kind: 'contract', contract: 'OWN', components: ['pca'], requirement: 'PCA view-control ownership', capability: 'component-modes', evidence: 'pca-view-controls' }),
  Object.freeze({ id: 'OWN.venn-tab-opening', kind: 'contract', contract: 'OWN', components: ['venn'], requirement: 'Venn tab opening ownership', capability: 'tab-isolation', evidence: 'venn-tab-opening' }),
  Object.freeze({ id: 'PERSIST.box-column-style-identity', kind: 'contract', contract: 'PERSIST', components: ['box'], requirement: 'Box column style identity', capability: 'persistence', evidence: 'box-column-insert-style-identity' }),
  Object.freeze({ id: 'PERSIST.box-column-reorder-undo', kind: 'contract', contract: 'PERSIST', components: ['box'], requirement: 'Box column reorder undo', capability: 'persistence', evidence: 'box-column-reorder-undo' }),
  Object.freeze({ id: 'STATS.box-dual-tab-isolation', kind: 'contract', contract: 'STATS', components: ['box'], requirement: 'Box dual-tab statistics isolation', capability: 'statistics', evidence: 'box-dual-tab-significance-resize-isolation' }),
  Object.freeze({ id: 'STATS.box-dual-tab-no-crash', kind: 'contract', contract: 'STATS', components: ['box'], requirement: 'Box dual-tab statistics stability', capability: 'statistics', evidence: 'box-dual-tab-no-crash' }),
  Object.freeze({ id: 'STATS.box-duplicate-recompute', kind: 'contract', contract: 'STATS', components: ['box'], requirement: 'Box duplicate statistics recomputation', capability: 'statistics', evidence: 'box-duplicate-recompute' }),
  Object.freeze({ id: 'OWN.box-example-controls', kind: 'contract', contract: 'OWN', components: ['box'], requirement: 'Box example control ownership', capability: 'tab-isolation', evidence: 'box-example-controls' }),
  Object.freeze({ id: 'OWN.box-flip-isolation', kind: 'contract', contract: 'OWN', components: ['box'], requirement: 'Box flip isolation', capability: 'tab-isolation', evidence: 'box-flip-isolation' }),
  Object.freeze({ id: 'LAYOUT.box-axis-role-tick-length', kind: 'contract', contract: 'LAYOUT', components: ['box'], requirement: 'Box axis-role tick length', capability: 'layout', evidence: 'box-axis-role-tick-length' }),
  Object.freeze({ id: 'LAYOUT.box-flip-resize', kind: 'contract', contract: 'LAYOUT', components: ['box'], requirement: 'Box flip resize', capability: 'layout', evidence: 'box-flip-resize' }),
  Object.freeze({ id: 'OWN.box-formula-editor', kind: 'contract', contract: 'OWN', components: ['box'], requirement: 'Box formula editor ownership', capability: 'tab-isolation', evidence: 'box-formula-editor' }),
  Object.freeze({ id: 'OWN.box-formula-fill', kind: 'contract', contract: 'OWN', components: ['box'] }),
  Object.freeze({ id: 'OWN.box-formula-assist', kind: 'contract', contract: 'OWN', components: ['box'] }),
  Object.freeze({ id: 'OWN.box-formula-first-render', kind: 'contract', contract: 'OWN', components: ['box'] }),
  Object.freeze({ id: 'OWN.box-formula-edit', kind: 'contract', contract: 'OWN', components: ['box'] }),
  Object.freeze({ id: 'OWN.box-grouped-lifecycle', kind: 'contract', contract: 'OWN', components: ['box'] }),
  Object.freeze({ id: 'LAYOUT.box-grouped-grid', kind: 'contract', contract: 'LAYOUT', components: ['box'] }),
  Object.freeze({ id: 'LAYOUT.box-horizontal-resize-axis', kind: 'contract', contract: 'LAYOUT', components: ['box'] }),
  Object.freeze({ id: 'LAYOUT.box-horizontal-shrink', kind: 'contract', contract: 'LAYOUT', components: ['box'] }),
  Object.freeze({ id: 'LAYOUT.box-initial-reserve', kind: 'contract', contract: 'LAYOUT', components: ['box'] }),
  Object.freeze({ id: 'OWN.box-inline-edit', kind: 'contract', contract: 'OWN', components: ['box'] }),
  Object.freeze({ id: 'DIAGNOSTIC.render-cache-lifecycle', kind: 'diagnostic', components: ['box', 'scatter', 'line'] }),
  Object.freeze({ id: 'DIAGNOSTIC.component-exercise', kind: 'diagnostic', components: ['*'] }),
  Object.freeze({ id: 'PERSIST.welcome-example-persistence', kind: 'contract', contract: 'PERSIST', components: ['*'] }),
  Object.freeze({ id: 'LAYOUT.axis-tick-label-angle', kind: 'contract', contract: 'LAYOUT', components: ['*'] }),
  Object.freeze({ id: 'PERSIST.axis-tick-label-angle-reopen', kind: 'contract', contract: 'PERSIST', components: ['*'] }),
  Object.freeze({ id: 'PERSIST.axis-major-tick-length-reopen', kind: 'contract', contract: 'PERSIST', components: ['scatter', 'line', 'hist', 'venn'] }),
  Object.freeze({ id: 'OWN.axis-tick-label-angle-isolation', kind: 'contract', contract: 'OWN', components: ['*'] }),
  Object.freeze({ id: 'OWN.data-toolbar-activation', kind: 'contract', contract: 'OWN', components: ['box', 'heatmap', 'hist', 'line', 'pca', 'scatter', 'surface'] }),
  Object.freeze({ id: 'OWN.line-3d-table-stability', kind: 'contract', contract: 'OWN', components: ['line'] }),
  Object.freeze({ id: 'OWN.line-uncertainty-band-isolation', kind: 'contract', contract: 'OWN', components: ['line'] }),
  Object.freeze({ id: 'OWN.font-toolbar-graph-text', kind: 'contract', contract: 'OWN', components: ['line', 'scatter'] }),
  Object.freeze({ id: 'OWN.legend-font-toolbar', kind: 'contract', contract: 'OWN', components: ['box', 'surface'] }),
  Object.freeze({ id: 'OWN.pie-chart-type-controls', kind: 'contract', contract: 'OWN', components: ['pie'] }),
  Object.freeze({ id: 'REC.stats-recovery', kind: 'contract', contract: 'REC', components: ['box', 'roc'] }),
  Object.freeze({ id: 'REC.document-state-recovery', kind: 'contract', contract: 'REC', components: ['*'] }),
  Object.freeze({ id: 'ASYNC.inactive-owner-completion', kind: 'contract', contract: 'ASYNC', components: ['box', 'scatter'], requirement: 'Stale asynchronous owner isolation', capability: 'async-ownership', evidence: 'inactive-owner-completion-contract' }),
  Object.freeze({ id: 'BOOTSTRAP.browser-smoke', kind: 'contract', contract: 'OWN', components: ['*'] }),
  Object.freeze({ id: 'BOOTSTRAP.production-derived-loader', kind: 'contract', contract: 'OWN', components: ['*'] }),
  Object.freeze({ id: 'BOOTSTRAP.ui-events-lazy', kind: 'contract', contract: 'OWN', components: ['*'] }),
  Object.freeze({ id: 'BOOTSTRAP.app-initialization', kind: 'contract', contract: 'OWN', components: ['*'] }),
  Object.freeze({ id: 'BOOTSTRAP.format-toolbar-exclusivity', kind: 'contract', contract: 'OWN', components: ['box', 'heatmap'] }),
  Object.freeze({ id: 'BOOTSTRAP.form-controls-autosize', kind: 'contract', contract: 'OWN', components: ['*'] }),
  Object.freeze({ id: 'VENDOR.real-npm-runtime', kind: 'contract', components: ['*'] }),
  Object.freeze({ id: 'VENDOR.browser-runtime', kind: 'contract', components: ['*'] }),
  Object.freeze({ id: 'PERSIST.regression-summary', kind: 'contract', contract: 'PERSIST', components: ['scatter', 'line'] }),
  Object.freeze({ id: 'CACHE.surface-render-cache', kind: 'contract', contract: 'CACHE', components: ['surface'] }),
  Object.freeze({ id: 'UNIT.color-scheme-math', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.box-statistics-model', kind: 'unit', components: ['box'] }),
  Object.freeze({ id: 'UNIT.box-stats-model-ownership', kind: 'unit', components: ['box'] }),
  Object.freeze({ id: 'UNIT.data-pipeline', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.data-transforms', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.desktop-commands', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.example-datasets', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.formula-engine', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.forecast-regression', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.regression-reporting', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.render-cache-schema', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.resampling', kind: 'unit', components: ['roc'] }),
  Object.freeze({ id: 'UNIT.scatter-statistics-primitives', kind: 'unit', components: ['scatter'] }),
  Object.freeze({ id: 'UNIT.regression-catalog', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.stats-adjust', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.stats-goodness-of-fit', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.stats-corrections', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.svg-geometry', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.theme-adapters', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.theme-catalog', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.theme-compiler', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.cartesian-layout', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.data-view-persistence', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.string-analysis', kind: 'unit', components: ['venn'] }),
  Object.freeze({ id: 'UNIT.uniprot', kind: 'unit', components: ['venn'] }),
  Object.freeze({ id: 'UNIT.graph-archive', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.debug-contract', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.production-workspace-fixture', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.contract-waits', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.component-lifecycle-renderability', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.performance-framework', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.box-statistics-fallback', kind: 'unit', components: ['box'] }),
  Object.freeze({ id: 'UNIT.box-swarm-model', kind: 'unit', components: ['box'] }),
  Object.freeze({ id: 'UNIT.chart-style-axis', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.chart-style-formatting', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.cache-diagnostics', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.snapshot-policy', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.stats-remediation-engine', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.stats-figure-summary-matrix', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.stats-remediation-components', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.box-advisor', kind: 'unit', components: ['box'] }),
  Object.freeze({ id: 'UNIT.box-assumptions', kind: 'unit', components: ['box'] }),
  Object.freeze({ id: 'UNIT.box-axis-autoscale', kind: 'unit', components: ['box'] }),
  Object.freeze({ id: 'UNIT.box-bar-geometry', kind: 'unit', components: ['box'] }),
  Object.freeze({ id: 'UNIT.box-theme-colors', kind: 'unit', components: ['box'] }),
  Object.freeze({ id: 'UNIT.box-point-connections', kind: 'unit', components: ['box'] }),
  Object.freeze({ id: 'UNIT.box-summary', kind: 'unit', components: ['box'] }),
  Object.freeze({ id: 'UNIT.component-load-benchmarks', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.go-analysis', kind: 'unit', components: ['venn'] }),
  Object.freeze({ id: 'UNIT.graph-archive-roundtrip', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.hot-ui-state', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.line-regression-overlay', kind: 'unit', components: ['line'] }),
  Object.freeze({ id: 'UNIT.line-model-helpers', kind: 'unit', components: ['line'] }),
  Object.freeze({ id: 'UNIT.regression-logistic-summary', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.roc-classification', kind: 'unit', components: ['roc'] }),
  Object.freeze({ id: 'UNIT.scatter-context-selection', kind: 'unit', components: ['scatter'] }),
  Object.freeze({ id: 'UNIT.scatter-point-style', kind: 'unit', components: ['scatter'] }),
  Object.freeze({ id: 'UNIT.scatter-regression-overlay', kind: 'unit', components: ['scatter'] }),
  Object.freeze({ id: 'UNIT.welcome-assets', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.color-scheme-svg', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.color-scheme-ownership', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.svg-sizing', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.svg-interaction', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.frame-publication', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.title-editing', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.export-projection', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.visual-projection', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.component-registry', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.stats-formatting', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.dom-controls-ownership', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.font-controls', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.symbol-toolbar', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.style-undo', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'OWN.scheduler-isolation', kind: 'contract', contract: 'OWN', components: ['*'] }),
  Object.freeze({ id: 'OWN.document-operation-lock', kind: 'contract', contract: 'OWN', components: ['*'] }),
  Object.freeze({ id: 'OWN.component-transition-boundary', kind: 'contract', contract: 'OWN', components: ['*'] }),
  Object.freeze({ id: 'OWN.toolbar-control-isolation', kind: 'contract', contract: 'OWN', components: ['*'] }),
  Object.freeze({ id: 'PERSIST.component-reopen-fidelity', kind: 'contract', contract: 'PERSIST', components: ['*'], requirement: 'Component reopen fidelity', capability: 'reopen-fidelity', evidence: 'payload-runtime-roundtrip-contract' }),
  Object.freeze({ id: 'PERSIST.notes-and-dataviews', kind: 'contract', contract: 'PERSIST', components: ['*'] }),
  Object.freeze({ id: 'REC.archive-recovery-matrix', kind: 'contract', contract: 'REC', components: ['*'], requirement: 'Archive and recovery fidelity', capability: 'reopen-fidelity', evidence: 'archive-recovery-matrix' }),
  Object.freeze({ id: 'ASYNC.job-cancellation', kind: 'contract', contract: 'ASYNC', components: ['*'] }),
  Object.freeze({ id: 'LAYOUT.component-resize-persistence', kind: 'contract', contract: 'LAYOUT', components: ['*'] }),
  Object.freeze({ id: 'LAYOUT.zoom-redraw', kind: 'contract', contract: 'LAYOUT', components: ['*'] }),
  Object.freeze({ id: 'LAYOUT.legend-label-reserve', kind: 'contract', contract: 'LAYOUT', components: ['*'] }),
  Object.freeze({ id: 'STATS.component-reporting', kind: 'contract', contract: 'STATS', components: ['*'] }),
  Object.freeze({ id: 'IMPORT.component-data-import', kind: 'contract', contract: 'IMPORT', components: ['*'] }),
  Object.freeze({ id: 'EXPORT.component-artifact', kind: 'contract', contract: 'EXPORT', components: ['*'] }),
  Object.freeze({ id: 'CACHE.preview-reuse', kind: 'contract', contract: 'CACHE', components: ['*'] }),
  Object.freeze({ id: 'DOM.workspace-toolbar-numeric', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.workspace-toolbar-overflow', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.dendrogram-controls', kind: 'dom-unit', components: ['heatmap'] }),
  Object.freeze({ id: 'DOM.heatmap-render-publication', kind: 'dom-unit', components: ['heatmap'] }),
  Object.freeze({ id: 'DOM.roc-statistics-presentation', kind: 'dom-unit', components: ['roc'] }),
  Object.freeze({ id: 'DOM.venn-label-layout', kind: 'dom-unit', components: ['venn'] }),
  Object.freeze({ id: 'DOM.plot3d-gestures', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.hist-scheduler-ownership', kind: 'dom-unit', components: ['hist'] }),
  Object.freeze({ id: 'DOM.grid-controls', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.significance-controls', kind: 'dom-unit', components: ['box'] }),
  Object.freeze({ id: 'DOM.notes', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.toolbar-overflow', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.chart-style', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.exporter-projection', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.table-import-format-registry', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.shared-controls', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.graph-sizing', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.statistics-projection', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.lifecycle-ownership', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.component-frame-authority', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.lifecycle-core', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.theme-runtime', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.pca-point-styles', kind: 'dom-unit', components: ['pca'] }),
  Object.freeze({ id: 'DOM.pca-preprocessing', kind: 'dom-unit', components: ['pca'] }),
  Object.freeze({ id: 'DOM.form-controls-autosize', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.heatmap-model-helpers', kind: 'dom-unit', components: ['heatmap'] }),
  Object.freeze({ id: 'DOM.welcome-startup', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.box-live-style', kind: 'dom-unit', components: ['box'] }),
  Object.freeze({ id: 'DOM.box-significance-whiskers', kind: 'dom-unit', components: ['box'] }),
  Object.freeze({ id: 'DOM.box-stats-reporting', kind: 'dom-unit', components: ['box'] }),
  Object.freeze({ id: 'DOM.box-swarm-offsets', kind: 'dom-unit', components: ['box'] }),
  Object.freeze({ id: 'DOM.color-picker-toolbar-ownership', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.data-views-export', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.exporter-scatter-optimization', kind: 'dom-unit', components: ['scatter'] }),
  Object.freeze({ id: 'DOM.graph-archive-render-cache', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.hist-frame', kind: 'dom-unit', components: ['hist'] }),
  Object.freeze({ id: 'DOM.hist-panel-layout', kind: 'dom-unit', components: ['hist'] }),
  Object.freeze({ id: 'DOM.previews-png-fallback', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.requested-defaults', kind: 'dom-unit', components: ['scatter', 'heatmap', 'hist'] }),
  Object.freeze({ id: 'DOM.scatter-adaptive-size', kind: 'dom-unit', components: ['scatter'] }),
  Object.freeze({ id: 'DOM.table-import-aggrid-paste', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.table-import-owner', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.table-import-prism', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.fileio-activation', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.hot-aggrid-binding', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.hot-aggrid-clipboard', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.hot-aggrid-dimensions', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.hot-exclusions', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.surface-legend', kind: 'dom-unit', components: ['surface'] }),
  Object.freeze({ id: 'DOM.toolbar-numeric-shared', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'WORKER.shared-cancellation', kind: 'worker', components: ['*'] }),
  Object.freeze({ id: 'WORKER.box-actions', kind: 'worker', components: ['box'] }),
  Object.freeze({ id: 'WORKER.archive-protocol', kind: 'worker', components: ['*'] }),
  Object.freeze({ id: 'WORKER.heatmap-clustering', kind: 'worker', components: ['heatmap'] }),
  Object.freeze({ id: 'WORKER.pca-svd', kind: 'worker', components: ['pca'] }),
  Object.freeze({ id: 'WORKER.pca-embedding', kind: 'worker', components: ['pca'] }),
  Object.freeze({ id: 'WORKER.scatter-render-stats', kind: 'worker', components: ['scatter'] }),
  Object.freeze({ id: 'STATS.numerical-oracle', kind: 'contract', contract: 'STATS', components: ['*'] }),
  Object.freeze({ id: 'ARCH.static-contracts', kind: 'architecture', components: ['*'] }),
  Object.freeze({ id: 'ARCH.owner-capture-normalization', kind: 'architecture', components: ['*'] }),
  Object.freeze({ id: 'ARCH.hot-paste-scheduling', kind: 'architecture', components: ['*'] })
]);

// These are the first explicitly evidenced categories for the control-plane
// contracts. Other scenarios retain their reviewed ID mapping and remain
// visibly inferred until their requirement evidence is reviewed.
const CRITICAL_SCENARIO_IDS = Object.freeze([
  'OWN.same-type-switching.all-components',
  'OWN.config-isolation.all-components',
  'PERSIST.explicit-component-mutations',
  'PERSIST.session-payload-write-through',
  'PERSIST.component-reopen-fidelity',
  'REC.archive-recovery-matrix',
  'ASYNC.inactive-owner-completion',
  'CACHE.reopened-first-interaction',
  'PERSIST.style-sync-across-tabs'
]);

const SCENARIOS_BY_FILE = Object.freeze({
  '__tests__/unit/componentCatalog.contract.test.js': Object.freeze(['GOVERNANCE.component-catalog']),
  '__tests__/unit/testInventory.contract.test.js': Object.freeze(['GOVERNANCE.discovery-inventory']),
  '__tests__/unit/testManifest.contract.test.js': Object.freeze(['GOVERNANCE.layer-manifest']),
  '__tests__/unit/jestConfig.contract.test.js': Object.freeze(['GOVERNANCE.jest-project-boundaries']),
  '__tests__/unit/testLaneRunner.contract.test.js': Object.freeze(['GOVERNANCE.lane-runner']),
  '__tests__/unit/jestShardRunner.contract.test.js': Object.freeze(['GOVERNANCE.jest-shard-runner']),
  '__tests__/unit/coverageTrend.contract.test.js': Object.freeze(['GOVERNANCE.coverage-trend']),
  '__tests__/workers/box.worker.test.js': Object.freeze(['WORKER.box-actions']),
  '__tests__/workers/graphArchive.worker.test.js': Object.freeze(['WORKER.archive-protocol']),
  '__tests__/workers/heatmap.worker.test.js': Object.freeze(['WORKER.heatmap-clustering']),
  '__tests__/workers/pca.worker.test.js': Object.freeze(['WORKER.pca-svd']),
  '__tests__/workers/pca-embed.worker.test.js': Object.freeze(['WORKER.pca-embedding']),
  '__tests__/workers/scatter.worker.test.js': Object.freeze(['WORKER.scatter-render-stats']),
  '__tests__/heatmap.tabContext.test.js': Object.freeze(['OWN.heatmap-tab-context', 'CACHE.heatmap-render-cache-restore']),
  '__tests__/heavy.canvas.reopen.recovery.regression.test.js': Object.freeze(['CACHE.heavy-canvas-recovery']),
  '__tests__/line.view.test.js': Object.freeze(['OWN.line-view-lifecycle']),
  '__tests__/pca.view.test.js': Object.freeze(['OWN.pca-view-controls']),
  '__tests__/venn.additionalTabOpen.test.js': Object.freeze(['OWN.venn-tab-opening']),
  'e2e/box.column-insert-style-identity.spec.js': Object.freeze(['PERSIST.box-column-style-identity']),
  'e2e/box.column-reorder.undo-race.spec.js': Object.freeze(['PERSIST.box-column-reorder-undo']),
  'e2e/box.dual-tab.significance-resize.isolation.spec.js': Object.freeze(['STATS.box-dual-tab-isolation', 'LAYOUT.box-flip-resize']),
  'e2e/box.dual-tab.stats-no-crash.spec.js': Object.freeze(['STATS.box-dual-tab-no-crash']),
  'e2e/box.duplicate-computed-stats.recalc.spec.js': Object.freeze(['STATS.box-duplicate-recompute']),
  'e2e/box.example-control-panel.spec.js': Object.freeze(['OWN.box-example-controls']),
  'e2e/box.flip-axes.tab-isolation.spec.js': Object.freeze(['OWN.box-flip-isolation']),
  'e2e/box.flip-axes.tick-length.spec.js': Object.freeze(['LAYOUT.box-axis-role-tick-length']),
  'e2e/box.flip-axes.transpose-manual-resize.spec.js': Object.freeze(['LAYOUT.box-flip-resize']),
  'e2e/box.formula-editor.spec.js': Object.freeze(['OWN.box-formula-editor']),
  'e2e/box.formula-fill-handle.spec.js': Object.freeze(['OWN.box-formula-fill']),
  'e2e/box.formula-function-assist.spec.js': Object.freeze(['OWN.box-formula-assist']),
  'e2e/box.formula.first-edit-render.regression.spec.js': Object.freeze(['OWN.box-formula-first-render']),
  'e2e/box.formula.numeric-edit.regression.spec.js': Object.freeze(['OWN.box-formula-edit']),
  'e2e/box.grouped-empty-duplicate-lifecycle.spec.js': Object.freeze(['OWN.box-grouped-lifecycle']),
  'e2e/box.grouped-grid-seam.spec.js': Object.freeze(['LAYOUT.box-grouped-grid']),
  'e2e/box.horizontal-resize-axis.spec.js': Object.freeze(['LAYOUT.box-horizontal-resize-axis']),
  'e2e/box.horizontal-shrink.layout-invariants.spec.js': Object.freeze(['LAYOUT.box-horizontal-shrink']),
  'e2e/box.initial-bottom-reserve.spec.js': Object.freeze(['LAYOUT.box-initial-reserve']),
  'e2e/box.inline-edit-selection-bg.spec.js': Object.freeze(['OWN.box-inline-edit']),
  '__tests__/unit/productionBootstrap.contract.test.js': Object.freeze(['GOVERNANCE.production-bootstrap-manifest']),
  '__tests__/unit/vendorProvenance.contract.test.js': Object.freeze(['GOVERNANCE.vendor-provenance']),
  '__tests__/unit/impactMap.contract.test.js': Object.freeze(['GOVERNANCE.change-impact-map']),
  '__tests__/unit/componentMutationCatalog.contract.test.js': Object.freeze(['GOVERNANCE.component-mutation-catalog']),
  '__tests__/unit/componentLifecycle.model.test.js': Object.freeze(['UNIT.component-lifecycle-renderability']),
  '__tests__/architecture/hot.pasteScheduling.contract.test.js': Object.freeze(['ARCH.hot-paste-scheduling']),
  '__tests__/unit/vendorRuntime.smoke.test.js': Object.freeze(['VENDOR.real-npm-runtime']),
  '__tests__/colorSchemes.colorMath.test.js': Object.freeze(['UNIT.color-scheme-math']),
  '__tests__/box.statsTestSelection.model.test.js': Object.freeze(['UNIT.box-statistics-model']),
  '__tests__/dataPipeline.test.js': Object.freeze(['UNIT.data-pipeline']),
  '__tests__/dataTransforms.test.js': Object.freeze(['UNIT.data-transforms']),
  '__tests__/desktopCommands.test.js': Object.freeze(['UNIT.desktop-commands']),
  '__tests__/exampleDatasets.biomedical.test.js': Object.freeze(['UNIT.example-datasets']),
  '__tests__/formulaEngine.test.js': Object.freeze(['UNIT.formula-engine']),
  '__tests__/forecast.regression.test.js': Object.freeze(['UNIT.forecast-regression']),
  '__tests__/regression.reportingNotation.test.js': Object.freeze(['UNIT.regression-reporting']),
  '__tests__/renderCacheSchema.test.js': Object.freeze(['UNIT.render-cache-schema']),
  '__tests__/resampling.contract.test.js': Object.freeze(['UNIT.resampling']),
  '__tests__/scatter.sharedStatisticsPrimitives.test.js': Object.freeze(['UNIT.scatter-statistics-primitives']),
  '__tests__/regression.catalog.test.js': Object.freeze(['UNIT.regression-catalog']),
  '__tests__/stats.adjust.test.js': Object.freeze(['UNIT.stats-adjust']),
  '__tests__/stats.goodnessOfFit.test.js': Object.freeze(['UNIT.stats-goodness-of-fit']),
  '__tests__/stats.pvalue.corrections.test.js': Object.freeze(['UNIT.stats-corrections']),
  '__tests__/svgGeometry.test.js': Object.freeze(['UNIT.svg-geometry']),
  '__tests__/theme.adapters.test.js': Object.freeze(['UNIT.theme-adapters']),
  '__tests__/theme.catalog.test.js': Object.freeze(['UNIT.theme-catalog']),
  '__tests__/theme.compiler.test.js': Object.freeze(['UNIT.theme-compiler']),
  '__tests__/cartesianLayout.test.js': Object.freeze(['UNIT.cartesian-layout']),
  '__tests__/dataViewPersistence.test.js': Object.freeze(['UNIT.data-view-persistence']),
  '__tests__/stringAnalysis.test.js': Object.freeze(['UNIT.string-analysis']),
  '__tests__/uniprot.test.js': Object.freeze(['UNIT.uniprot']),
  '__tests__/graphArchive.adaptiveCompression.test.js': Object.freeze(['UNIT.graph-archive']),
  '__tests__/graphArchive.payloadLiteLoad.test.js': Object.freeze(['UNIT.graph-archive']),
  '__tests__/debug.contract.test.js': Object.freeze(['UNIT.debug-contract']),
  '__tests__/unit/productionWorkspace.contract.test.js': Object.freeze(['UNIT.production-workspace-fixture']),
  '__tests__/unit/contractWaits.contract.test.js': Object.freeze(['UNIT.contract-waits']),
  '__tests__/simple-performance.test.js': Object.freeze(['UNIT.performance-framework']),
  '__tests__/performance.test.js': Object.freeze(['UNIT.performance-framework']),
  '__tests__/box.stats.fallback.test.js': Object.freeze(['UNIT.box-statistics-fallback']),
  '__tests__/chartStyle.axisTicks.buildScale.test.js': Object.freeze(['UNIT.chart-style-axis']),
  '__tests__/chartStyle.axisTicks.logScale.test.js': Object.freeze(['UNIT.chart-style-axis']),
  '__tests__/chartStyle.xAxisEndpointMargins.test.js': Object.freeze(['UNIT.chart-style-axis']),
  '__tests__/chartStyle.formatScientific.test.js': Object.freeze(['UNIT.chart-style-formatting']),
  '__tests__/renderCacheDiagnostics.contract.test.js': Object.freeze(['UNIT.cache-diagnostics']),
  '__tests__/snapshotPolicy.recoveryParity.test.js': Object.freeze(['UNIT.snapshot-policy']),
  '__tests__/stats.audit.remediation.core.test.js': Object.freeze(['UNIT.stats-remediation-engine']),
  '__tests__/stats.figureSummary.reportingMatrix.test.js': Object.freeze(['UNIT.stats-figure-summary-matrix']),
  '__tests__/stats.audit.remediation.components.test.js': Object.freeze(['UNIT.stats-remediation-components']),
  '__tests__/box.advisor.test.js': Object.freeze(['UNIT.box-advisor']),
  '__tests__/box.assumptions.test.js': Object.freeze(['UNIT.box-assumptions']),
  '__tests__/box.axisAutoScale.test.js': Object.freeze(['UNIT.box-axis-autoscale']),
  '__tests__/box.barNegativeGeometry.test.js': Object.freeze(['UNIT.box-bar-geometry']),
  '__tests__/box.fillColorTheme.test.js': Object.freeze(['UNIT.box-theme-colors']),
  '__tests__/box.pointConnections.test.js': Object.freeze(['UNIT.box-point-connections']),
  '__tests__/box.statsModelOwnership.contract.test.js': Object.freeze(['UNIT.box-stats-model-ownership']),
  '__tests__/box.summary.performance.test.js': Object.freeze(['UNIT.box-summary']),
  '__tests__/box.summaryOverlayColor.test.js': Object.freeze(['UNIT.box-summary']),
  '__tests__/unit/box.swarm.model.test.js': Object.freeze(['UNIT.box-swarm-model']),
  '__tests__/component.load-benchmark.test.js': Object.freeze(['UNIT.component-load-benchmarks']),
  '__tests__/goAnalysis.test.js': Object.freeze(['UNIT.go-analysis']),
  '__tests__/graphArchive.roundtrip.components.test.js': Object.freeze(['UNIT.graph-archive-roundtrip']),
  '__tests__/hot.uiState.test.js': Object.freeze(['UNIT.hot-ui-state']),
  '__tests__/line.regressionOverlaySegmentation.test.js': Object.freeze(['UNIT.line-regression-overlay']),
  '__tests__/unit/line.model.test.js': Object.freeze(['UNIT.line-model-helpers']),
  '__tests__/unit/regression.logisticSummary.test.js': Object.freeze(['UNIT.regression-logistic-summary']),
  '__tests__/roc.classificationSetup.test.js': Object.freeze(['UNIT.roc-classification']),
  '__tests__/scatter.pointContextMenuSelection.test.js': Object.freeze(['UNIT.scatter-context-selection']),
  '__tests__/scatter.pointStyleOverrides.test.js': Object.freeze(['UNIT.scatter-point-style']),
  '__tests__/scatter.regressionOverlayRange.test.js': Object.freeze(['UNIT.scatter-regression-overlay']),
  '__tests__/welcome.example-assets.test.js': Object.freeze(['UNIT.welcome-assets']),
  '__tests__/session.assignTabPayload.assignment-guards.test.js': Object.freeze(['PERSIST.session-payload-write-through']),
  '__tests__/session.assignTabPayload.cache-capture.test.js': Object.freeze(['PERSIST.session-payload-write-through']),
  '__tests__/session.assignTabPayload.dirty-state.test.js': Object.freeze(['PERSIST.session-payload-write-through']),
  '__tests__/session.assignTabPayload.canonical-ui-events.test.js': Object.freeze(['PERSIST.session-payload-write-through']),
  '__tests__/session.assignTabPayload.signature-and-cache-persistence.test.js': Object.freeze(['PERSIST.session-payload-write-through']),
  '__tests__/documentState.recoveryThrottle.test.js': Object.freeze(['REC.document-state-recovery']),
  '__tests__/sessionActions.saveLazyBuild.test.js': Object.freeze(['ARCHIVE.session-save-policies']),
  '__tests__/sessionActions.restoreParity.test.js': Object.freeze(['REC.archive-restore-transaction']),
  '__tests__/colorSchemes.core.test.js': Object.freeze(['DOM.color-scheme-svg']),
  '__tests__/colorSchemes.customChoice.test.js': Object.freeze(['DOM.color-scheme-ownership']),
  '__tests__/colorSchemes.defaultIsolation.test.js': Object.freeze(['DOM.color-scheme-ownership']),
  '__tests__/colorSchemes.undo.test.js': Object.freeze(['DOM.color-scheme-ownership']),
  '__tests__/dom.autoResizeSvg.test.js': Object.freeze(['DOM.svg-sizing']),
  '__tests__/dom.enableLabelDrag.test.js': Object.freeze(['DOM.svg-interaction']),
  '__tests__/dom.enableLegendDrag.test.js': Object.freeze(['DOM.svg-interaction']),
  '__tests__/dom.framePublication.test.js': Object.freeze(['DOM.frame-publication']),
  '__tests__/dom.titleEmptyEdit.test.js': Object.freeze(['DOM.title-editing']),
  '__tests__/exportProjection.contract.test.js': Object.freeze(['DOM.export-projection']),
  '__tests__/visualProjection.test.js': Object.freeze(['DOM.visual-projection']),
  '__tests__/main.components.ensureComponent.test.js': Object.freeze(['DOM.component-registry']),
  '__tests__/domControls.defaultPayloadIsolation.test.js': Object.freeze(['DOM.dom-controls-ownership']),
  '__tests__/domControls.payloadSizingOwnership.test.js': Object.freeze(['DOM.dom-controls-ownership']),
  '__tests__/fontControls.colorParsing.test.js': Object.freeze(['DOM.font-controls']),
  '__tests__/fontControls.debugLogging.test.js': Object.freeze(['DOM.font-controls']),
  '__tests__/fontControls.legendBorder.test.js': Object.freeze(['DOM.font-controls']),
  '__tests__/fontControls.openerClickGuard.test.js': Object.freeze(['DOM.font-controls']),
  '__tests__/fontControls.proportionalFontResize.test.js': Object.freeze(['DOM.font-controls']),
  '__tests__/fontControls.tabIsolation.test.js': Object.freeze(['DOM.font-controls']),
  '__tests__/fontControls.titleVisibility.test.js': Object.freeze(['DOM.font-controls']),
  '__tests__/symbolToolbar.numericFormatting.test.js': Object.freeze(['DOM.symbol-toolbar']),
  '__tests__/styleUndo.test.js': Object.freeze(['DOM.style-undo']),
  '__tests__/workspaceTabs.schedulerIsolation.test.js': Object.freeze(['OWN.scheduler-isolation']),
  '__tests__/workspaceToolbar.numericWheel.test.js': Object.freeze(['DOM.workspace-toolbar-numeric']),
  '__tests__/workspaceToolbar.overflow.test.js': Object.freeze(['DOM.workspace-toolbar-overflow']),
  '__tests__/dendrogramControls.numericWheel.test.js': Object.freeze(['DOM.dendrogram-controls']),
  '__tests__/heatmap.dendrogram-rendering.test.js': Object.freeze(['DOM.heatmap-render-publication']),
  '__tests__/roc.statistics.standard.test.js': Object.freeze(['DOM.roc-statistics-presentation']),
  '__tests__/venn.labelLayout.test.js': Object.freeze(['DOM.venn-label-layout']),
  '__tests__/shared/plot3d.test.js': Object.freeze(['DOM.plot3d-gestures']),
  '__tests__/hist.schedulerOwnership.test.js': Object.freeze(['DOM.hist-scheduler-ownership']),
  '__tests__/gridControls.liveProjection.test.js': Object.freeze(['DOM.grid-controls']),
  '__tests__/significanceControls.overlay.test.js': Object.freeze(['DOM.significance-controls']),
  '__tests__/notes.mountFoldable.test.js': Object.freeze(['DOM.notes']),
  '__tests__/toolbarOverflow.test.js': Object.freeze(['DOM.toolbar-overflow']),
  '__tests__/symbolToolbar.undo.test.js': Object.freeze(['DOM.symbol-toolbar']),
  '__tests__/chartStyle.defaultGraphSize.test.js': Object.freeze(['DOM.chart-style']),
  '__tests__/chartStyle.fontLabel.test.js': Object.freeze(['DOM.chart-style']),
  '__tests__/chartStyle.svgPreparation.test.js': Object.freeze(['DOM.chart-style']),
  '__tests__/chartStyle.fontResize.tabscope.test.js': Object.freeze(['DOM.chart-style']),
  '__tests__/chartStyle.axisResizeMargins.test.js': Object.freeze(['DOM.chart-style']),
  '__tests__/chartStyle.labelOrientation.test.js': Object.freeze(['DOM.chart-style']),
  '__tests__/chartStyle.xAxisLabelAngle.test.js': Object.freeze(['DOM.chart-style']),
  '__tests__/chartStyle.bottomLayout.test.js': Object.freeze(['DOM.chart-style']),
  '__tests__/chartStyle.statsAnnotation.test.js': Object.freeze(['DOM.chart-style']),
  '__tests__/chartStyle.fontResize.test.js': Object.freeze(['DOM.chart-style']),
  '__tests__/chartStyle.legendViewport.test.js': Object.freeze(['DOM.chart-style']),
  '__tests__/chartStyle.pointLabelLayout.test.js': Object.freeze(['DOM.chart-style']),
  '__tests__/publicationStyles.core.test.js': Object.freeze(['DOM.exporter-projection']),
  '__tests__/exporter.dropdownStacking.test.js': Object.freeze(['DOM.exporter-projection']),
  '__tests__/exporter.statsFigureSummary.test.js': Object.freeze(['DOM.exporter-projection']),
  '__tests__/exporter.significanceHitOverlay.test.js': Object.freeze(['DOM.exporter-projection']),
  '__tests__/exporter.hybridSource.test.js': Object.freeze(['DOM.exporter-projection']),
  '__tests__/exporter.physicalProjection.test.js': Object.freeze(['DOM.exporter-projection']),
  '__tests__/exporter.inkscapeUngroupStability.test.js': Object.freeze(['DOM.exporter-projection']),
  '__tests__/exporter.savePicker.test.js': Object.freeze(['DOM.exporter-projection']),
  '__tests__/tableImport.formats.test.js': Object.freeze(['DOM.table-import-format-registry']),
  '__tests__/dom/tableImport.affordances.test.js': Object.freeze(['DOM.table-import-format-registry', 'DOM.shared-controls']),
  '__tests__/additionalLineControls.pathCompatibility.test.js': Object.freeze(['DOM.shared-controls']),
  '__tests__/axisControls.init.test.js': Object.freeze(['DOM.shared-controls']),
  '__tests__/resizer.canvasReuse.test.js': Object.freeze(['DOM.shared-controls']),
  '__tests__/resizer.optionsMenu.test.js': Object.freeze(['DOM.shared-controls']),
  '__tests__/resizer.panelLayoutPersistence.test.js': Object.freeze(['DOM.shared-controls']),
  '__tests__/componentLayout.zoomBehavior.test.js': Object.freeze(['DOM.shared-controls']),
  '__tests__/jobs.controller.test.js': Object.freeze(['DOM.shared-controls']),
  '__tests__/graphSizing.defaultBaseline.test.js': Object.freeze(['DOM.graph-sizing']),
  '__tests__/stats.reporting.layout.test.js': Object.freeze(['DOM.statistics-projection']),
  '__tests__/stats.reportingNotation.test.js': Object.freeze(['DOM.statistics-projection']),
  '__tests__/stats.figureSummary.state.contract.test.js': Object.freeze(['DOM.statistics-projection']),
  '__tests__/stats.figureSummary.renderer.contract.test.js': Object.freeze(['DOM.statistics-projection']),
  '__tests__/componentLifecycle.ownerPersistence.test.js': Object.freeze(['DOM.lifecycle-ownership']),
  '__tests__/componentLifecycle.core.authority-and-readiness.test.js': Object.freeze(['DOM.lifecycle-core']),
  '__tests__/componentLifecycle.core.cache-and-editing.test.js': Object.freeze(['DOM.lifecycle-core']),
  '__tests__/componentLifecycle.core.payload-and-async.test.js': Object.freeze(['DOM.lifecycle-core']),
  '__tests__/componentLifecycle.core.runtime-ownership.test.js': Object.freeze(['DOM.lifecycle-core']),
  '__tests__/componentLifecycle.core.restore-and-scheduling.test.js': Object.freeze(['DOM.lifecycle-core']),
  '__tests__/componentLifecycle.core.cleanup-and-publication.test.js': Object.freeze(['DOM.lifecycle-core']),
  '__tests__/componentDrawableFrame.authority.test.js': Object.freeze(['DOM.component-frame-authority']),
  '__tests__/stats.inference.tabIsolation.test.js': Object.freeze(['DOM.statistics-projection']),
  '__tests__/stats.pvalueFormat.tabIsolation.test.js': Object.freeze(['DOM.statistics-projection']),
  '__tests__/theme.runtime.test.js': Object.freeze(['DOM.theme-runtime']),
  '__tests__/pca.pointStyleScopes.test.js': Object.freeze(['DOM.pca-point-styles']),
  '__tests__/dom/pca.preprocessing.test.js': Object.freeze(['DOM.pca-preprocessing']),
  '__tests__/dom/formControls.autosize.test.js': Object.freeze(['DOM.form-controls-autosize']),
  '__tests__/dom/heatmap.model.test.js': Object.freeze(['DOM.heatmap-model-helpers']),
  '__tests__/welcome.ready.test.js': Object.freeze(['DOM.welcome-startup']),
  '__tests__/stats.abbreviations.test.js': Object.freeze(['DOM.stats-formatting']),
  '__tests__/box.liveStyleRefresh.test.js': Object.freeze(['DOM.box-live-style']),
  '__tests__/box.significanceWhiskers.test.js': Object.freeze(['DOM.box-significance-whiskers']),
  '__tests__/box.statsReportingSurface.contract.test.js': Object.freeze(['DOM.box-stats-reporting']),
  '__tests__/box.swarmOffsets.test.js': Object.freeze(['DOM.box-swarm-offsets']),
  '__tests__/colorPicker.toolbarOwnership.test.js': Object.freeze(['DOM.color-picker-toolbar-ownership']),
  '__tests__/dataViews.exportTabs.test.js': Object.freeze(['DOM.data-views-export']),
  '__tests__/exporter.scatterOptimization.test.js': Object.freeze(['DOM.exporter-scatter-optimization']),
  '__tests__/graphArchive.renderCacheSerialization.test.js': Object.freeze(['DOM.graph-archive-render-cache']),
  '__tests__/hist.drawableFrame.test.js': Object.freeze(['DOM.hist-frame']),
  '__tests__/hist.panel-layout.test.js': Object.freeze(['DOM.hist-panel-layout']),
  '__tests__/previews.pngFallback.test.js': Object.freeze(['DOM.previews-png-fallback']),
  '__tests__/requested-defaults.contract.test.js': Object.freeze(['DOM.requested-defaults']),
  '__tests__/scatter.adaptiveSize.test.js': Object.freeze(['DOM.scatter-adaptive-size']),
  '__tests__/tableImport.ownerTransaction.test.js': Object.freeze(['DOM.table-import-owner']),
  '__tests__/tableImport.paste.aggrid.test.js': Object.freeze(['DOM.table-import-aggrid-paste']),
  '__tests__/tableImport.prism.test.js': Object.freeze(['DOM.table-import-prism']),
  '__tests__/tabs.documentOperation.test.js': Object.freeze(['OWN.document-operation-lock']),
  '__tests__/fileIO.activation.test.js': Object.freeze(['DOM.fileio-activation']),
  '__tests__/hot.aggrid.binding.selection-and-payload.test.js': Object.freeze(['DOM.hot-aggrid-binding']),
  '__tests__/hot.aggrid.binding.editor-behavior.test.js': Object.freeze(['DOM.hot-aggrid-binding']),
  '__tests__/hot.aggrid.binding.filters-and-analysis.test.js': Object.freeze(['DOM.hot-aggrid-binding']),
  '__tests__/hot.aggrid.binding.structural-and-scroll.test.js': Object.freeze(['DOM.hot-aggrid-binding']),
  '__tests__/hot.aggrid.clipboard-selection.paste-and-selection.test.js': Object.freeze(['DOM.hot-aggrid-clipboard']),
  '__tests__/hot.aggrid.clipboard-selection.selection-geometry.test.js': Object.freeze(['DOM.hot-aggrid-clipboard']),
  '__tests__/hot.aggrid.clipboard-selection.column-reorder.test.js': Object.freeze(['DOM.hot-aggrid-clipboard']),
  '__tests__/hot.aggrid.clipboard-selection.menus-and-filtering.test.js': Object.freeze(['DOM.hot-aggrid-clipboard']),
  '__tests__/hot.aggrid.clipboard-selection.clipboard.test.js': Object.freeze(['DOM.hot-aggrid-clipboard']),
  '__tests__/hot.aggrid.clipboard-selection.clipboard-undo.test.js': Object.freeze(['DOM.hot-aggrid-clipboard']),
  '__tests__/hot.aggrid.dimensions.test.js': Object.freeze(['DOM.hot-aggrid-dimensions']),
  '__tests__/hot.exclusionPersistence.test.js': Object.freeze(['DOM.hot-exclusions']),
  '__tests__/surface.legendResize.test.js': Object.freeze(['DOM.surface-legend']),
  '__tests__/toolbar.numericWheel.sharedControls.test.js': Object.freeze(['DOM.toolbar-numeric-shared']),
  '__tests__/stats.inference.contract.test.js': Object.freeze(['DOM.stats-formatting']),
  '__tests__/stats.pvalueFormatting.contract.test.js': Object.freeze(['DOM.stats-formatting']),
  '__tests__/stats-table.figureSummary.semantic.test.js': Object.freeze(['DOM.stats-formatting']),
  '__tests__/stats.differential.python.test.js': Object.freeze(['STATS.numerical-oracle']),
  '__tests__/stats.component.differential.test.js': Object.freeze(['STATS.numerical-oracle']),
  '__tests__/stats.matrix.components.test.js': Object.freeze(['STATS.numerical-oracle']),
  '__tests__/stats.extended.coverage.test.js': Object.freeze(['STATS.numerical-oracle']),
  '__tests__/stats.ui.presentation.branches.test.js': Object.freeze(['STATS.numerical-oracle']),
  '__tests__/stats.ui.persistence.restore.test.js': Object.freeze(['STATS.numerical-oracle']),
  '__tests__/audit.remaining-issues.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/axis-major-tick-length.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/axis-toolbar-layout.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/box.architectureOwnership.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/box.frameCommit.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/box.internalSanitation.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/box.referenceStats.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/box.statsAspect.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/box.statsStatePerformance.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/box.stripDatasetGap.regression.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/box.stripRadius.regression.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/component.exportProjectionWiring.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/component.exportSources.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/componentImportBindings.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/dataViews.payloadRaw.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/generateComponentContracts.check.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/graph.horizontalGutter.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/architecture/graph.exportControlsAlignment.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/graphArchive.worker.schema.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/graphFileOwnership.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/hist.stats-font.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/letterSpacing.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/unit/ownerPayloadDriver.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/pca.lifecycleOwnership.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/unit/rocMutation.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/roc.statsPanelOwnership.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/runtime.localDependencies.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/scatter.internalArchitecture.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/scatter.listenerBinding.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/statistics.cross-component.regression.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/stats.inference.components.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/stats.ownerNormalization.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/ownerCapture.normalization.contract.test.js': Object.freeze(['ARCH.owner-capture-normalization']),
  '__tests__/svgComposition.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/welcome.icons.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/workers.localDependencies.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/box.layoutReserves.regression.test.js': Object.freeze(['LAYOUT.box-reserve-invariants']),
  '__tests__/box.statsControls.tabIsolation.test.js': Object.freeze(['STATS.box-controls-isolation']),
  '__tests__/format-mixing.test.js': Object.freeze(['BOOTSTRAP.format-toolbar-exclusivity']),
  '__tests__/formControls.autosize.test.js': Object.freeze(['BOOTSTRAP.form-controls-autosize']),
  '__tests__/heatmap.stats.test.js': Object.freeze(['STATS.heatmap-presentation']),
  '__tests__/regression.persistence.test.js': Object.freeze(['PERSIST.regression-summary']),
  '__tests__/scatter.statsDefaults.isolation.test.js': Object.freeze(['STATS.scatter-statistics-isolation']),
  '__tests__/smoke.init.test.js': Object.freeze(['BOOTSTRAP.app-initialization']),
  '__tests__/surface.renderCache.test.js': Object.freeze(['CACHE.surface-render-cache']),
  '__tests__/survival.stats.test.js': Object.freeze(['STATS.survival-pipeline']),
  'e2e/component.small-viewport.layout-stability.spec.js': Object.freeze(['LAYOUT.small-viewport-stability']),
  'e2e/data-toolbar.same-component-activation.spec.js': Object.freeze(['OWN.data-toolbar-activation']),
  '__tests__/workers/shared.test.js': Object.freeze(['WORKER.shared-cancellation']),
  '__tests__/pca.colorScheme.roundTrip.test.js': Object.freeze(['PERSIST.pca-color-scheme-roundtrip']),
  '__tests__/pca.viewCache.test.js': Object.freeze(['CACHE.pca-view-only-rotation']),
  '__tests__/tabSwitch.reuseCache.test.js': Object.freeze(['CACHE.tab-switch-reuse']),
  '__tests__/surface.tabContext.test.js': Object.freeze(['OWN.surface-tab-context']),
  '__tests__/venn.defaultPayloadReset.test.js': Object.freeze(['PERSIST.venn-empty-payload-defaults']),
  '__tests__/venn.tabRuntime.test.js': Object.freeze(['OWN.venn-runtime-isolation']),
  '__tests__/venn.upset.test.js': Object.freeze(['OWN.venn-upset-controls']),
  '__tests__/pie.percentLabels.test.js': Object.freeze(['PERSIST.pie-percent-labels']),
  '__tests__/pie.tabIsolation.test.js': Object.freeze(['OWN.pie-tab-host-isolation']),
  '__tests__/tabs.grid.dimensions.test.js': Object.freeze(['OWN.workspace-grid-dimensions']),
  '__tests__/tabs.styleControls.tabIsolation.test.js': Object.freeze(['OWN.style-control-tab-isolation']),
  '__tests__/tabs.componentDomBinding.switchIsolation.test.js': Object.freeze(['OWN.component-dom-binding']),
  '__tests__/tabs.configIsolation.allComponents.test.js': Object.freeze(['OWN.config-isolation.all-components', 'PERSIST.explicit-component-mutations']),
  '__tests__/ui.events.box-line.test.js': Object.freeze(['BOOTSTRAP.ui-events-lazy']),
  '__tests__/ui.events.scatter.test.js': Object.freeze(['BOOTSTRAP.ui-events-lazy']),
  '__tests__/ui.events.histogram-and-statistics.test.js': Object.freeze(['BOOTSTRAP.ui-events-lazy']),
  '__tests__/ui.events.venn.test.js': Object.freeze(['BOOTSTRAP.ui-events-lazy']),
  '__tests__/unit/readiness.contract.test.js': Object.freeze(['OWN.readiness-observability']),
  '__tests__/dom/readinessProjection.contract.test.js': Object.freeze(['OWN.readiness-projection']),
  '__tests__/productionBootstrap.loader.test.js': Object.freeze(['BOOTSTRAP.production-derived-loader']),
  'e2e/workspace.smoke.spec.js': Object.freeze(['BOOTSTRAP.browser-smoke']),
  'e2e/component.same-type-tab-switching.isolation.spec.js': Object.freeze(['OWN.same-type-switching.all-components']),
  'e2e/component.same-type-parameter-isolation.spec.js': Object.freeze(['OWN.same-type-switching.all-components', 'PERSIST.explicit-component-mutations']),
  'e2e/component.persistence-matrix.spec.js': Object.freeze(['PERSIST.explicit-component-mutations']),
  'e2e/cross-browser.feature-matrix.spec.js': Object.freeze(['OWN.cross-browser-feature-matrix', 'PERSIST.grid-clipboard']),
  'e2e/aggrid.firefox-paste.spec.js': Object.freeze(['PERSIST.grid-clipboard']),
  'e2e/aggrid.active-tab-paste.spec.js': Object.freeze(['PERSIST.grid-clipboard']),
  'e2e/aggrid.edit-overflow.spec.js': Object.freeze(['OWN.ag-grid-edit-overflow']),
  'e2e/aggrid.grouped-header-drag-handles.spec.js': Object.freeze(['OWN.ag-grid-grouped-header-ownership']),
  'e2e/aggrid.keyboard-navigation.spec.js': Object.freeze(['OWN.ag-grid-keyboard-selection']),
  'e2e/aggrid.selection-outline-scrollbar.spec.js': Object.freeze(['LAYOUT.ag-grid-selection-scrollbar']),
  'e2e/aggrid.undo-redo.reorder.spec.js': Object.freeze(['PERSIST.ag-grid-column-reorder-undo']),
  'e2e/stats.same-component-isolation-restore.contract.spec.js': Object.freeze(['STATS.same-type-archive-restore', 'PERSIST.stats-archive-restore']),
  'e2e/stats.reopen-presence.contract.spec.js': Object.freeze(['STATS.reopen-presence', 'PERSIST.stats-reopen', 'REC.stats-recovery']),
  'e2e/stats.async-owner-completion.contract.spec.js': Object.freeze(['ASYNC.inactive-owner-completion']),
  'e2e/workspace/style-sync.contract.spec.js': Object.freeze(['PERSIST.style-sync-across-tabs']),
  'e2e/workspace/unsaved-decisions.contract.spec.js': Object.freeze(['OWN.unsaved-close-decisions']),
  'e2e/workspace/tab-reorder.contract.spec.js': Object.freeze(['OWN.workspace-tab-reorder']),
  'e2e/vendor.runtime.smoke.spec.js': Object.freeze(['VENDOR.browser-runtime']),
  'e2e/box-pca.table-format-tab-isolation.spec.js': Object.freeze(['PERSIST.table-format-tab-isolation']),
  'e2e/box.significance-restore.spec.js': Object.freeze(['STATS.box-significance-restore']),
  'e2e/line.uncertainty-band.reopen-recovery.spec.js': Object.freeze(['PERSIST.line-uncertainty-band-reopen']),
  'e2e/scatter.inline-edit.preview-layer.spec.js': Object.freeze(['OWN.scatter-inline-edit-preview']),
  'e2e/stats.figure-summary.layout.spec.js': Object.freeze(['STATS.figure-summary-layout']),
  'e2e/heatmap.exclusions.reopen-recovery.parity.spec.js': Object.freeze(['REC.heatmap-exclusion-archive-parity']),
  'e2e/heatmap.label-font-toolbar.spec.js': Object.freeze(['LAYOUT.heatmap-label-font-resize']),
  'e2e/legend.viewport-invariant.spec.js': Object.freeze(['LAYOUT.legend-viewport-invariant']),
  'e2e/legend.font-toolbar.spec.js': Object.freeze(['OWN.legend-font-toolbar']),
  'e2e/box.stats-controls-reopen-recovery.spec.js': Object.freeze(['STATS.box-controls-isolation', 'PERSIST.stats-archive-restore', 'REC.stats-recovery']),
  'e2e/font.toolbar.size-no-spin.spec.js': Object.freeze(['DOM.font-controls']),
  'e2e/toolbar.font-visibility.regression.spec.js': Object.freeze(['OWN.font-toolbar-graph-text']),
  'e2e/data-transform-toolbar.visual.spec.js': Object.freeze(['DOM.shared-controls']),
  'e2e/pca.example-load.cached-rebind.spec.js': Object.freeze(['CACHE.pca-example-rebind']),
  'e2e/pca.legend-content-envelope.spec.js': Object.freeze(['LAYOUT.pca-legend-envelope']),
  'e2e/line.3d-example-table-stability.spec.js': Object.freeze(['OWN.line-3d-table-stability']),
  'e2e/line.uncertainty-band.tab-isolation.spec.js': Object.freeze(['OWN.line-uncertainty-band-isolation']),
  'e2e/pie.stacked-chart-type.spec.js': Object.freeze(['OWN.pie-chart-type-controls']),
  'e2e/scatter.example-load.cached-rebind.spec.js': Object.freeze(['CACHE.scatter-example-rebind']),
  'e2e/reopen.graph-edit-cache-invalidation.spec.js': Object.freeze(['CACHE.reopened-first-interaction']),
  'e2e/box.dark-theme.stats.regression.spec.js': Object.freeze(['STATS.box-dark-theme-regression']),
  'e2e/legend-3d-drag.spec.js': Object.freeze(['OWN.legend-3d-drag']),
  'e2e/recovery.primary-graph-publication.spec.js': Object.freeze(['REC.primary-graph-publication']),
  'e2e/recovery.single-tab.e2e.spec.js': Object.freeze(['REC.single-tab-recovery-checkpoint']),
  'e2e/reopen.redraw-on-data-change.spec.js': Object.freeze(['REC.reopen-data-redraw']),
  'e2e/axis.tick-label-optical-clearance.spec.js': Object.freeze(['LAYOUT.axis-tick-label-optical-clearance']),
  'e2e/axis-major-tick-length.reopen-recovery.spec.js': Object.freeze(['PERSIST.axis-major-tick-length-reopen']),
  'e2e/dataview-lite-archive.persistence.spec.js': Object.freeze(['PERSIST.dataview-lite-archive']),
  'e2e/prism.multi-dataset-import.spec.js': Object.freeze(['IMPORT.prism-multi-dataset']),
  'e2e/export.format-dimensions.spec.js': Object.freeze(['EXPORT.format-dimensions']),
  'e2e/cartesian.proactive-x-label-reserve.spec.js': Object.freeze(['LAYOUT.cartesian-x-label-reserve']),
  'e2e/box-scatter.render-cache-lifecycle.diagnostic.spec.js': Object.freeze(['DIAGNOSTIC.render-cache-lifecycle']),
  'e2e/workspace.exercise.spec.js': Object.freeze(['DIAGNOSTIC.component-exercise']),
  'e2e/welcome.example-persistence.spec.js': Object.freeze(['PERSIST.welcome-example-persistence']),
  'e2e/x-axis-label-angle.layout.spec.js': Object.freeze(['LAYOUT.axis-tick-label-angle']),
  'e2e/x-axis-label-angle.reopen-recovery.spec.js': Object.freeze(['PERSIST.axis-tick-label-angle-reopen']),
  'e2e/x-axis-label-angle.tab-isolation.spec.js': Object.freeze(['OWN.axis-tick-label-angle-isolation']),
  'e2e/box.large-resize-live-svg.spec.js': Object.freeze(['LAYOUT.box-reserve-invariants', 'LAYOUT.component-resize-persistence']),
  'e2e/box.live-style-redraw.spec.js': Object.freeze(['OWN.style-control-tab-isolation', 'DOM.box-live-style']),
  'e2e/box.loading-overlay.stop.spec.js': Object.freeze(['ASYNC.job-cancellation', 'ASYNC.inactive-owner-completion']),
  'e2e/box.opacity-style-tab-isolation.spec.js': Object.freeze(['OWN.style-control-tab-isolation']),
  'e2e/box.significance-layout.spec.js': Object.freeze(['STATS.box-significance-restore', 'LAYOUT.box-reserve-invariants']),
  'e2e/box.single-values-point-size-resize.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'LAYOUT.box-reserve-invariants']),
  'e2e/box.stats-custom-pairs.spec.js': Object.freeze(['STATS.component-reporting', 'STATS.box-controls-isolation']),
  'e2e/box.stats-performance.regression.spec.js': Object.freeze(['STATS.box-controls-isolation', 'UNIT.performance-framework']),
  'e2e/box.stats-reporting-sections.regression.spec.js': Object.freeze(['STATS.component-reporting', 'STATS.box-significance-restore']),
  'e2e/box.stats-test-selection.regression.spec.js': Object.freeze(['STATS.box-controls-isolation']),
  'e2e/box.title-new-tab-isolation.spec.js': Object.freeze(['OWN.same-type-switching.all-components', 'OWN.style-control-tab-isolation']),
  'e2e/canvas-tab-preview.spec.js': Object.freeze(['CACHE.preview-reuse', 'CACHE.tab-switch-reuse']),
  'e2e/component.duplicate-reuse.payload-fidelity.spec.js': Object.freeze(['PERSIST.component-reopen-fidelity', 'CACHE.tab-switch-reuse']),
  'e2e/component.resize-exit-reenter.persistence.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'PERSIST.component-reopen-fidelity']),
  'e2e/component.same-type-dual-preview.spec.js': Object.freeze(['OWN.same-type-switching.all-components', 'CACHE.preview-reuse']),
  'e2e/component.same-type-second-tab.undo-redo.hot.spec.js': Object.freeze(['OWN.same-type-switching.all-components', 'PERSIST.session-payload-write-through']),
  'e2e/component.same-type-tab-resize-switch.isolation.spec.js': Object.freeze(['OWN.same-type-switching.all-components', 'LAYOUT.component-resize-persistence']),
  'e2e/component.second-tab.manual-resize-undo-redo.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'PERSIST.session-payload-write-through']),
  'e2e/dark-theme.resize-text.spec.js': Object.freeze(['OWN.style-control-tab-isolation', 'LAYOUT.component-resize-persistence']),
  'e2e/data-aware-defaults.spec.js': Object.freeze(['PERSIST.explicit-component-mutations', 'DOM.requested-defaults']),
  'e2e/document-open.transaction.spec.js': Object.freeze(['ARCHIVE.session-save-policies', 'REC.archive-restore-transaction']),
  'e2e/export.physical-projection.all-components.spec.js': Object.freeze(['EXPORT.component-artifact', 'EXPORT.format-dimensions']),
  'e2e/graph-axis-resize-invariants.spec.js': Object.freeze(['LAYOUT.axis-tick-label-optical-clearance', 'LAYOUT.component-resize-persistence']),
  'e2e/graph-loading-overlay.empty-tabs.spec.js': Object.freeze(['OWN.readiness-observability', 'ASYNC.job-cancellation']),
  'e2e/graph-resize-undo.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'PERSIST.session-payload-write-through']),
  'e2e/graph-sizing.owner-isolation.spec.js': Object.freeze(['OWN.same-type-switching.all-components', 'LAYOUT.component-resize-persistence']),
  'e2e/graph.atomic-publication.spec.js': Object.freeze(['REC.primary-graph-publication', 'OWN.readiness-projection']),
  'e2e/graph.cross-viewport-reopen.spec.js': Object.freeze(['PERSIST.component-reopen-fidelity', 'LAYOUT.component-resize-persistence']),
  'e2e/config-panel.fieldset-containment.spec.js': Object.freeze(['LAYOUT.legend-label-reserve', 'LAYOUT.component-resize-persistence']),
  'e2e/graph.export-controls-layout.spec.js': Object.freeze(['EXPORT.component-artifact', 'EXPORT.format-dimensions']),
  'e2e/graph.live-resize.spec.js': Object.freeze(['LAYOUT.component-resize-persistence']),
  'e2e/graph.live-style.spec.js': Object.freeze(['OWN.style-control-tab-isolation', 'DOM.style-undo']),
  'e2e/graph.zoom-redraw.spec.js': Object.freeze(['LAYOUT.zoom-redraw', 'OWN.readiness-projection'])
  ,'e2e/heatmap.adjust-filter.responsiveness.spec.js': Object.freeze(['ASYNC.job-cancellation', 'OWN.readiness-observability'])
  ,'e2e/heatmap.color-scale-spacing.spec.js': Object.freeze(['OWN.style-control-tab-isolation', 'LAYOUT.legend-label-reserve'])
  ,'e2e/heatmap.correlation-tab-restore.spec.js': Object.freeze(['OWN.heatmap-tab-context', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/heatmap.data-values.label-scaling.spec.js': Object.freeze(['LAYOUT.legend-label-reserve', 'OWN.style-control-tab-isolation'])
  ,'e2e/heatmap.dual-tab.example.spec.js': Object.freeze(['OWN.heatmap-tab-context', 'OWN.same-type-switching.all-components'])
  ,'e2e/heatmap.duplicate-reuse.headers-view-switch.spec.js': Object.freeze(['CACHE.tab-switch-reuse', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/heatmap.first-heavy-paste.owner-transaction.spec.js': Object.freeze(['ASYNC.job-cancellation', 'PERSIST.session-payload-write-through'])
  ,'e2e/heatmap.graph-scope-font-size.spec.js': Object.freeze(['OWN.style-control-tab-isolation', 'LAYOUT.component-resize-persistence'])
  ,'e2e/heatmap.heavy-recovery-authoritative.spec.js': Object.freeze(['CACHE.heavy-canvas-recovery', 'REC.archive-recovery-matrix'])
  ,'e2e/heatmap.heavy-small-tab-isolation.spec.js': Object.freeze(['CACHE.heavy-canvas-recovery', 'OWN.same-type-switching.all-components'])
  ,'e2e/heatmap.large-data-values.responsiveness.spec.js': Object.freeze(['ASYNC.job-cancellation', 'CACHE.heavy-canvas-recovery'])
  ,'e2e/heatmap.legend-height.spec.js': Object.freeze(['LAYOUT.legend-label-reserve'])
  ,'e2e/heatmap.live-resize.text-stability.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'OWN.readiness-projection'])
  ,'e2e/heatmap.mixed-export.spec.js': Object.freeze(['EXPORT.component-artifact', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/heatmap.reopen-recovery.geometry.spec.js': Object.freeze(['PERSIST.component-reopen-fidelity', 'REC.archive-recovery-matrix'])
  ,'e2e/heatmap.summary-resize-frame.spec.js': Object.freeze(['STATS.figure-summary-layout', 'LAYOUT.component-resize-persistence'])
  ,'e2e/heatmap.tab-preview-fidelity.spec.js': Object.freeze(['CACHE.preview-reuse', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/heatmap.title-clearance.spec.js': Object.freeze(['LAYOUT.axis-tick-label-optical-clearance', 'LAYOUT.legend-label-reserve'])
  ,'e2e/heatmap.title-drag-speed.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'OWN.toolbar-control-isolation'])
  ,'e2e/heatmap.title-inline-edit-background.spec.js': Object.freeze(['OWN.style-control-tab-isolation', 'OWN.toolbar-control-isolation'])
  ,'e2e/heatmap.view-switch-lock-ratio.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/heavy.mixed-tabs.reopen-recovery.canvas.spec.js': Object.freeze(['CACHE.heavy-canvas-recovery', 'REC.archive-recovery-matrix'])
  ,'e2e/hist.frequency-distribution-autodraw-tab-isolation.spec.js': Object.freeze(['OWN.same-type-switching.all-components', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/hist.multiseries-legend-aspect.spec.js': Object.freeze(['LAYOUT.legend-label-reserve', 'LAYOUT.component-resize-persistence'])
  ,'e2e/hist.panel-layout.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'STATS.component-reporting'])
  ,'e2e/hist.recovery-first-resize.spec.js': Object.freeze(['REC.single-tab-recovery-checkpoint', 'LAYOUT.component-resize-persistence'])
  ,'e2e/inactive-payload-capture-isolation.spec.js': Object.freeze(['OWN.same-type-switching.all-components', 'PERSIST.session-payload-write-through'])
  ,'e2e/label.viewport-boundary.spec.js': Object.freeze(['LAYOUT.legend-label-reserve', 'OWN.readiness-projection'])
  ,'e2e/legend.drag-viewport-bounds.spec.js': Object.freeze(['LAYOUT.legend-viewport-invariant', 'LAYOUT.legend-label-reserve'])
  ,'e2e/line-hist.axis-resize-tab-isolation.spec.js': Object.freeze(['PERSIST.axis-major-tick-length-reopen', 'LAYOUT.component-resize-persistence'])
  ,'e2e/line-scatter.3d-rotation-tab-switch.spec.js': Object.freeze(['OWN.legend-3d-drag', 'OWN.same-type-switching.all-components'])
  ,'e2e/line.3d-initial-aspect.spec.js': Object.freeze(['OWN.legend-3d-drag', 'LAYOUT.component-resize-persistence'])
  ,'e2e/line.column-insert-style-identity.spec.js': Object.freeze(['PERSIST.session-payload-write-through', 'OWN.style-control-tab-isolation'])
  ,'e2e/line.errorbar-toolbar.spec.js': Object.freeze(['OWN.toolbar-control-isolation', 'OWN.line-view-lifecycle'])
  ,'e2e/line.header.sort-drag.spec.js': Object.freeze(['OWN.component-transition-boundary', 'PERSIST.session-payload-write-through'])
  ,'e2e/line.reopen-horizontal-resize-axis.spec.js': Object.freeze(['PERSIST.component-reopen-fidelity', 'LAYOUT.component-resize-persistence'])
  ,'e2e/line.selection-outline.pinned-first-column.spec.js': Object.freeze(['OWN.component-transition-boundary', 'PERSIST.grid-clipboard'])
  ,'e2e/lock-ratio-axis-geometry.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'LAYOUT.axis-tick-label-optical-clearance'])
  ,'e2e/lock-ratio-subtype-enforcement.spec.js': Object.freeze(['OWN.component-transition-boundary', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/panel-layout.tab-switch.spec.js': Object.freeze(['OWN.same-type-switching.all-components', 'LAYOUT.component-resize-persistence'])
  ,'e2e/pca.3d-rotation-restore.spec.js': Object.freeze(['OWN.legend-3d-drag', 'CACHE.reopened-first-interaction', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/pca.default-plot-height.spec.js': Object.freeze(['LAYOUT.component-resize-persistence'])
  ,'e2e/pca.label-toggle.regression.spec.js': Object.freeze(['OWN.style-control-tab-isolation', 'OWN.pca-view-controls'])
  ,'e2e/pca.large-import-transaction.spec.js': Object.freeze(['IMPORT.component-data-import', 'ASYNC.job-cancellation'])
  ,'e2e/pca.metric-geometry.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'LAYOUT.axis-tick-label-optical-clearance'])
  ,'e2e/pca.standard-example.spec.js': Object.freeze(['OWN.pca-view-controls', 'CACHE.pca-example-rebind'])
  ,'e2e/pca.stats-restore.spec.js': Object.freeze(['STATS.same-type-archive-restore', 'PERSIST.stats-reopen'])
  ,'e2e/pie.dataviews-color-label-resize-isolation.spec.js': Object.freeze(['PERSIST.notes-and-dataviews', 'LAYOUT.component-resize-persistence'])
  ,'e2e/pie.legend-resize.diagnostic.spec.js': Object.freeze(['LAYOUT.legend-viewport-invariant', 'LAYOUT.legend-label-reserve'])
  ,'e2e/pie.stacked-live-resize-flicker.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'OWN.readiness-projection'])
  ,'e2e/pie.stacked-rotated-label-reserve.spec.js': Object.freeze(['LAYOUT.legend-label-reserve', 'LAYOUT.component-resize-persistence'])
  ,'e2e/pie.stats-example.spec.js': Object.freeze(['STATS.component-reporting', 'PERSIST.stats-reopen'])
  ,'e2e/plot3d.viewport-containment.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'OWN.legend-3d-drag'])
  ,'e2e/recovery.canonical-journal.spec.js': Object.freeze(['REC.archive-recovery-matrix', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/recovery.graph-view-controls.spec.js': Object.freeze(['REC.document-state-recovery', 'OWN.toolbar-control-isolation'])
  ,'e2e/recovery.no-loop.spec.js': Object.freeze(['REC.single-tab-recovery-checkpoint'])
  ,'e2e/recovery.single-tab.live-capture.spec.js': Object.freeze(['REC.document-state-recovery', 'PERSIST.session-payload-write-through'])
  ,'e2e/redraw.audit.spec.js': Object.freeze(['OWN.readiness-projection', 'OWN.component-transition-boundary'])
  ,'e2e/release-rendering-smoke.spec.js': Object.freeze(['EXPORT.component-artifact', 'EXPORT.format-dimensions'])
  ,'e2e/render-cache.persistence-contract.spec.js': Object.freeze(['CACHE.reopened-first-interaction', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/roc-box.render-cache-reopen.spec.js': Object.freeze(['CACHE.reopened-first-interaction', 'REC.stats-recovery'])
  ,'e2e/roc.advisor-compare-tab-isolation.spec.js': Object.freeze(['STATS.component-reporting', 'OWN.same-type-switching.all-components'])
  ,'e2e/roc.classification-ui.spec.js': Object.freeze(['UNIT.roc-classification', 'STATS.component-reporting'])
  ,'e2e/roc.default-axis-geometry.spec.js': Object.freeze(['LAYOUT.axis-tick-label-optical-clearance', 'LAYOUT.component-resize-persistence'])
  ,'e2e/roc.graph-type-reopen.spec.js': Object.freeze(['PERSIST.component-reopen-fidelity', 'STATS.component-reporting'])
  ,'e2e/roc.legend-layout.regression.spec.js': Object.freeze(['LAYOUT.legend-viewport-invariant', 'LAYOUT.legend-label-reserve'])
  ,'e2e/roc.scheduled-autodraw-tab-isolation.spec.js': Object.freeze(['OWN.scheduler-isolation', 'OWN.same-type-switching.all-components'])
  ,'e2e/roc.single-curve-stats-overlay.spec.js': Object.freeze(['STATS.component-reporting', 'STATS.reopen-presence'])
  ,'e2e/rotation.recovery-interlock.spec.js': Object.freeze(['REC.archive-recovery-matrix', 'OWN.legend-3d-drag', 'CACHE.reopened-first-interaction'])
  ,'e2e/scatter-line.live-horizontal-resize-comparison.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'OWN.same-type-switching.all-components'])
  ,'e2e/scatter.2d-3d-controls.isolation.spec.js': Object.freeze(['OWN.component-transition-boundary', 'OWN.style-control-tab-isolation'])
  ,'e2e/scatter.3d-example-table-stability.spec.js': Object.freeze(['OWN.legend-3d-drag', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/scatter.3d-view.color-scheme-persists.spec.js': Object.freeze(['OWN.style-control-tab-isolation', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/scatter.close-tab-dispose-loop.spec.js': Object.freeze(['OWN.component-transition-boundary', 'ASYNC.job-cancellation'])
  ,'e2e/scatter.color-scheme-grid-isolation.spec.js': Object.freeze(['OWN.style-control-tab-isolation', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/scatter.csv-import.mixed-tabs.reopen.spec.js': Object.freeze(['IMPORT.component-data-import', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/scatter.default-table-headers.spec.js': Object.freeze(['OWN.component-transition-boundary', 'PERSIST.session-payload-write-through'])
  ,'e2e/scatter.duplicate-reuse.stats-trendline.spec.js': Object.freeze(['PERSIST.component-reopen-fidelity', 'STATS.component-reporting'])
  ,'e2e/scatter.empty-plot-notice.spec.js': Object.freeze(['OWN.readiness-observability', 'OWN.readiness-projection'])
  ,'e2e/scatter.exponential-trend-autoscale.spec.js': Object.freeze(['STATS.component-reporting', 'LAYOUT.component-resize-persistence'])
  ,'e2e/scatter.formula-evaluation.spec.js': Object.freeze(['OWN.scatter-inline-edit-preview', 'PERSIST.session-payload-write-through'])
  ,'e2e/scatter.global-shape-undo.spec.js': Object.freeze(['OWN.style-control-tab-isolation', 'PERSIST.session-payload-write-through'])
  ,'e2e/scatter.horizontal-resize-axis.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'LAYOUT.axis-tick-label-optical-clearance'])
  ,'e2e/scatter.loading-overlay.threshold.spec.js': Object.freeze(['ASYNC.job-cancellation', 'OWN.readiness-observability'])
  ,'e2e/scatter.manual-view-refresh.spec.js': Object.freeze(['OWN.readiness-projection', 'OWN.component-transition-boundary'])
  ,'e2e/scatter.overlay-controls.stats-gating.spec.js': Object.freeze(['STATS.component-reporting', 'OWN.readiness-projection'])
  ,'e2e/scatter.panel-resizer.undo-entry-count.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'PERSIST.session-payload-write-through'])
  ,'e2e/scatter.point-label-drag.spec.js': Object.freeze(['PERSIST.component-reopen-fidelity', 'OWN.style-control-tab-isolation'])
  ,'e2e/scatter.pvalue-formatting.spec.js': Object.freeze(['STATS.component-reporting'])
  ,'e2e/scatter.reopen.trendline-persists.spec.js': Object.freeze(['PERSIST.regression-summary', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/scatter.second-tab.resize-undo-routing.spec.js': Object.freeze(['OWN.same-type-switching.all-components', 'LAYOUT.component-resize-persistence'])
  ,'e2e/scatter.second-tab.undo-debug.spec.js': Object.freeze(['OWN.same-type-switching.all-components', 'PERSIST.session-payload-write-through'])
  ,'e2e/scatter.stats-trendline-resize.live-update.spec.js': Object.freeze(['STATS.component-reporting', 'LAYOUT.component-resize-persistence'])
  ,'e2e/scatter.tab-grid-leak.repro.spec.js': Object.freeze(['OWN.same-type-switching.all-components', 'PERSIST.grid-clipboard'])
  ,'e2e/stats-annotation.bounds-and-font.spec.js': Object.freeze(['STATS.figure-summary-layout', 'LAYOUT.legend-label-reserve'])
  ,'e2e/stats.archive-reopen-tab-switch.persistence.spec.js': Object.freeze(['PERSIST.stats-archive-restore', 'OWN.same-type-switching.all-components'])
  ,'e2e/stats.figure-summary.font-toolbar.spec.js': Object.freeze(['STATS.figure-summary-layout', 'OWN.toolbar-control-isolation'])
  ,'e2e/stats.figure-summary.live-resize.spec.js': Object.freeze(['STATS.figure-summary-layout', 'LAYOUT.component-resize-persistence'])
  ,'e2e/stats.figure-summary.reopen-recovery.spec.js': Object.freeze(['STATS.figure-summary-layout', 'REC.archive-recovery-matrix'])
  ,'e2e/stats.figure-summary.tab-isolation.spec.js': Object.freeze(['STATS.figure-summary-layout', 'OWN.same-type-switching.all-components'])
  ,'e2e/stats.inference.tab-isolation.spec.js': Object.freeze(['STATS.component-reporting', 'OWN.same-type-switching.all-components'])
  ,'e2e/stats.owner-panel.additional-components.contract.spec.js': Object.freeze(['STATS.component-reporting', 'OWN.component-transition-boundary'])
  ,'e2e/stats.restore-roundtrip.spec.js': Object.freeze(['PERSIST.stats-reopen', 'REC.archive-recovery-matrix'])
  ,'e2e/structural-redraw.loading-overlay.spec.js': Object.freeze(['ASYNC.job-cancellation', 'OWN.readiness-observability'])
  ,'e2e/surface.legend-fixed-height.spec.js': Object.freeze(['LAYOUT.legend-label-reserve', 'OWN.surface-tab-context'])
  ,'e2e/surface.live-resize-stability.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'OWN.surface-tab-context'])
  ,'e2e/surface.recovery-rotation.spec.js': Object.freeze(['CACHE.surface-render-cache', 'REC.archive-recovery-matrix', 'OWN.legend-3d-drag'])
  ,'e2e/surface.rotation-size-stability.spec.js': Object.freeze(['CACHE.surface-render-cache', 'LAYOUT.component-resize-persistence'])
  ,'e2e/surface.settings-dataviews-manual-overlay-tab-isolation.spec.js': Object.freeze(['PERSIST.notes-and-dataviews', 'OWN.same-type-switching.all-components'])
  ,'e2e/surface.svgbox-right-margin.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'LAYOUT.legend-label-reserve'])
  ,'e2e/survival-roc-hist.dataviews-notes-isolation.spec.js': Object.freeze(['PERSIST.notes-and-dataviews', 'OWN.same-type-switching.all-components'])
  ,'e2e/survival.covariate-reopen-tab-isolation.spec.js': Object.freeze(['PERSIST.component-reopen-fidelity', 'STATS.component-reporting'])
  ,'e2e/survival.notes-position.spec.js': Object.freeze(['PERSIST.notes-and-dataviews', 'LAYOUT.component-resize-persistence'])
  ,'e2e/survival.risk-table-layout.spec.js': Object.freeze(['STATS.component-reporting', 'LAYOUT.component-resize-persistence'])
  ,'e2e/survival.same-type-reopen-isolation.spec.js': Object.freeze(['OWN.same-type-switching.all-components', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/survival.style-report-deferred-isolation.spec.js': Object.freeze(['OWN.style-control-tab-isolation', 'STATS.component-reporting'])
  ,'e2e/tab-preview-components.spec.js': Object.freeze(['CACHE.preview-reuse', 'OWN.same-type-switching.all-components'])
  ,'e2e/title-empty-edit.restore.spec.js': Object.freeze(['PERSIST.component-reopen-fidelity', 'OWN.toolbar-control-isolation'])
  ,'e2e/title-visibility.all-components.spec.js': Object.freeze(['OWN.style-control-tab-isolation', 'LAYOUT.legend-label-reserve'])
  ,'e2e/toolbar.color-picker-ownership.spec.js': Object.freeze(['DOM.color-picker-toolbar-ownership', 'OWN.toolbar-control-isolation'])
  ,'e2e/toolbar.general-vs-data.regression.spec.js': Object.freeze(['OWN.toolbar-control-isolation', 'OWN.data-toolbar-activation'])
  ,'e2e/toolbar.numeric-wheel-gesture.spec.js': Object.freeze(['OWN.toolbar-control-isolation', 'PERSIST.session-payload-write-through'])
  ,'e2e/toolbar.overflow.spec.js': Object.freeze(['DOM.toolbar-overflow', 'OWN.toolbar-control-isolation'])
  ,'e2e/venn.exclusions-welcome.spec.js': Object.freeze(['OWN.venn-runtime-isolation', 'PERSIST.welcome-example-persistence'])
  ,'e2e/venn.go-string.async-tab-isolation.spec.js': Object.freeze(['OWN.venn-runtime-isolation', 'ASYNC.job-cancellation'])
  ,'e2e/venn.label-layout.spec.js': Object.freeze(['DOM.venn-label-layout', 'LAYOUT.legend-label-reserve'])
  ,'e2e/venn.list-cache-region-tab-isolation.spec.js': Object.freeze(['OWN.venn-runtime-isolation', 'CACHE.tab-switch-reuse'])
  ,'e2e/venn.paste-scroll.spec.js': Object.freeze(['PERSIST.grid-clipboard', 'OWN.venn-runtime-isolation'])
  ,'e2e/venn.restore-recovery.spec.js': Object.freeze(['PERSIST.component-reopen-fidelity', 'REC.archive-recovery-matrix'])
  ,'e2e/venn.table-column-persistence.spec.js': Object.freeze(['PERSIST.session-payload-write-through', 'OWN.venn-runtime-isolation'])
  ,'e2e/venn.upset-numeric-species-reopen-isolation.spec.js': Object.freeze(['OWN.venn-upset-controls', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/venn.upset.controls-layout.spec.js': Object.freeze(['OWN.venn-upset-controls', 'LAYOUT.component-resize-persistence'])
  ,'e2e/venn.upset.live-resize.text-stability.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'OWN.readiness-projection'])
  ,'e2e/welcome.first-frame.spec.js': Object.freeze(['DOM.welcome-startup', 'OWN.readiness-observability'])
  ,'e2e/welcome.icons.contract.spec.js': Object.freeze(['ARCH.static-contracts', 'DOM.welcome-startup'])
});

const SCENARIO_IDS = new Set(SCENARIO_CATALOG.map(scenario => scenario.id));
const SCENARIOS_BY_ID = new Map(SCENARIO_CATALOG.map(scenario => [scenario.id, scenario]));
for (const [file, ids] of Object.entries(SCENARIOS_BY_FILE)) {
  for (const id of ids) {
    if (!SCENARIO_IDS.has(id)) {
      throw new Error(`Scenario mapping references unknown ID ${id} for ${file}`);
    }
  }
}

function getScenarioIdsForFile(file) {
  const normalized = String(file || '').replace(/\\/g, '/').replace(/^\.\//, '');
  return SCENARIOS_BY_FILE[normalized] || Object.freeze([]);
}

function getScenariosForIds(ids) {
  return (Array.isArray(ids) ? ids : [])
    .map(id => SCENARIOS_BY_ID.get(id))
    .filter(Boolean);
}

module.exports = {
  SCENARIO_CATALOG,
  CRITICAL_SCENARIO_IDS,
  SCENARIOS_BY_FILE,
  getScenarioIdsForFile,
  getScenariosForIds
};
