'use strict';

const REVIEWED_SCENARIO_METADATA = Object.freeze({
  'GOVERNANCE.component-catalog': Object.freeze({ requirement: 'Single component catalog governs test discovery', capability: 'test-governance', evidence: 'component-catalog-contract' }),
  'GOVERNANCE.discovery-inventory': Object.freeze({ requirement: 'Test discovery inventory is reproducible', capability: 'test-governance', evidence: 'test-inventory-contract' }),
  'GOVERNANCE.layer-manifest': Object.freeze({ requirement: 'Every test declares one execution layer', capability: 'test-governance', evidence: 'layer-manifest-contract' }),
  'GOVERNANCE.jest-project-boundaries': Object.freeze({ requirement: 'Jest projects enforce layer boundaries', capability: 'test-governance', evidence: 'jest-project-boundary-contract' }),
  'GOVERNANCE.lane-runner': Object.freeze({ requirement: 'Test lanes preserve initial gate status', capability: 'test-governance', evidence: 'lane-runner-contract' }),
  'GOVERNANCE.jest-shard-runner': Object.freeze({ requirement: 'Jest shard reports preserve partial results', capability: 'test-governance', evidence: 'jest-shard-runner-contract' }),
  'GOVERNANCE.coverage-trend': Object.freeze({ requirement: 'Coverage trend thresholds are enforced', capability: 'test-governance', evidence: 'coverage-trend-contract' }),
  'GOVERNANCE.integration-teardown': Object.freeze({ requirement: 'Integration fixtures enforce teardown and leak checks', capability: 'test-governance', evidence: 'integration-teardown-contract' }),
  'GOVERNANCE.production-bootstrap-manifest': Object.freeze({ requirement: 'Production bootstrap follows the script manifest', capability: 'bootstrap', evidence: 'production-bootstrap-manifest-contract' }),
  'GOVERNANCE.vendor-provenance': Object.freeze({ requirement: 'Browser vendor provenance is pinned and checked', capability: 'test-governance', evidence: 'vendor-provenance-contract' }),
  'GOVERNANCE.change-impact-map': Object.freeze({ requirement: 'Changed paths select mandatory contract lanes', capability: 'test-governance', evidence: 'change-impact-map-contract' }),
  'GOVERNANCE.component-mutation-catalog': Object.freeze({ requirement: 'Component mutation plans are explicit', capability: 'component-modes', evidence: 'component-mutation-catalog-contract' }),
  'OWN.readiness-observability': Object.freeze({ requirement: 'Owner readiness is observable', capability: 'readiness', evidence: 'readiness-observability-contract' }),
  'OWN.readiness-projection': Object.freeze({ requirement: 'Visible projection follows settled owner readiness', capability: 'readiness', evidence: 'readiness-projection-contract' }),
  'OWN.component-dom-binding': Object.freeze({ requirement: 'Mounted component DOM binds to its owner', capability: 'tab-isolation', evidence: 'component-dom-binding-contract' }),
  'OWN.cross-browser-feature-matrix': Object.freeze({ requirement: 'Browser feature coverage is declared by lane', capability: 'test-governance', evidence: 'cross-browser-feature-matrix-contract' }),
  'ARCHIVE.session-save-policies': Object.freeze({ requirement: 'Save policies use canonical session state', capability: 'archive', evidence: 'session-save-policy-contract' }),
  'REC.archive-restore-transaction': Object.freeze({ requirement: 'Archive restore is staged as one transaction', capability: 'recovery', evidence: 'archive-restore-transaction-contract' }),
  'REC.primary-graph-publication': Object.freeze({ requirement: 'Recovery publishes one owner-valid primary graph', capability: 'recovery', evidence: 'primary-graph-publication-contract' }),
  'REC.single-tab-recovery-checkpoint': Object.freeze({ requirement: 'Single-tab recovery checkpoints are owner-scoped', capability: 'recovery', evidence: 'single-tab-recovery-checkpoint-contract' }),
  'REC.reopen-data-redraw': Object.freeze({ requirement: 'Reopen redraws from restored durable data', capability: 'recovery', evidence: 'reopen-data-redraw-contract' }),
  'REC.stats-recovery': Object.freeze({ requirement: 'Statistical recovery restores durable results', capability: 'recovery', evidence: 'stats-recovery-contract' }),
  'REC.document-state-recovery': Object.freeze({ requirement: 'Document recovery restores canonical state and dirty policy', capability: 'recovery', evidence: 'document-state-recovery-contract' }),
  'PERSIST.grid-clipboard': Object.freeze({ requirement: 'Grid clipboard edits write through to the owner', capability: 'grid', evidence: 'grid-clipboard-contract' }),
  'PERSIST.table-format-tab-isolation': Object.freeze({ requirement: 'Table format state remains isolated by tab', capability: 'persistence', evidence: 'table-format-isolation-contract' }),
  'PERSIST.line-uncertainty-band-reopen': Object.freeze({ requirement: 'Line uncertainty bands survive reopen', capability: 'persistence', evidence: 'line-uncertainty-reopen-contract' }),
  'PERSIST.dataview-lite-archive': Object.freeze({ requirement: 'Lite DataView archives preserve replayable source state', capability: 'data-views', evidence: 'dataview-lite-archive-contract' }),
  'PERSIST.welcome-example-persistence': Object.freeze({ requirement: 'Welcome examples persist their selected component state', capability: 'persistence', evidence: 'welcome-example-persistence-contract' }),
  'PERSIST.regression-summary': Object.freeze({ requirement: 'Regression summaries survive persistence transitions', capability: 'persistence', evidence: 'regression-summary-persistence-contract' }),
  'OWN.scatter-inline-edit-preview': Object.freeze({ requirement: 'Scatter inline edits update the owner preview', capability: 'interaction', evidence: 'scatter-inline-edit-preview-contract' }),
  'STATS.figure-summary-layout': Object.freeze({ requirement: 'Figure summaries preserve semantic report layout', capability: 'statistics', evidence: 'figure-summary-layout-contract' }),
  'REC.heatmap-exclusion-archive-parity': Object.freeze({ requirement: 'Heatmap exclusions remain identical after archive recovery', capability: 'recovery', evidence: 'heatmap-exclusion-archive-contract' }),
  'LAYOUT.axis-tick-label-optical-clearance': Object.freeze({ requirement: 'Axis labels retain optical clearance', capability: 'layout', evidence: 'axis-tick-label-clearance-contract' }),
  'LAYOUT.cartesian-x-label-reserve': Object.freeze({ requirement: 'Cartesian layouts reserve space for x-axis labels', capability: 'layout', evidence: 'cartesian-label-reserve-contract' }),
  'LAYOUT.box-reserve-invariants': Object.freeze({ requirement: 'Box layouts preserve panel reserve invariants', capability: 'layout', evidence: 'box-reserve-invariant-contract' }),
  'LAYOUT.small-viewport-stability': Object.freeze({ requirement: 'Small viewports preserve stable component geometry', capability: 'layout', evidence: 'small-viewport-stability-contract' }),
  'LAYOUT.legend-viewport-invariant': Object.freeze({ requirement: 'Legend visibility does not alter plot geometry', capability: 'layout', evidence: 'legend-viewport-invariant-contract' }),
  'CACHE.tab-switch-reuse': Object.freeze({ requirement: 'Tab switching reuses only owner-valid render state', capability: 'render-cache', evidence: 'tab-switch-cache-reuse-contract' }),
  'OWN.workspace-grid-dimensions': Object.freeze({ requirement: 'Workspace grid dimensions remain owner-scoped', capability: 'tab-isolation', evidence: 'workspace-grid-dimensions-contract' }),
  'OWN.style-control-tab-isolation': Object.freeze({ requirement: 'Style controls remain isolated by tab', capability: 'tab-isolation', evidence: 'style-control-isolation-contract' }),
  'OWN.unsaved-close-decisions': Object.freeze({ requirement: 'Close decisions use the owning document dirty state', capability: 'dirty-state', evidence: 'unsaved-close-decision-contract' }),
  'OWN.workspace-tab-reorder': Object.freeze({ requirement: 'Tab reorder preserves component ownership', capability: 'tab-isolation', evidence: 'workspace-tab-reorder-contract' })
  , 'OWN.ag-grid-edit-overflow': Object.freeze({ requirement: 'AG Grid overflow edits remain owner-scoped', capability: 'grid-ownership', evidence: 'ag-grid-edit-overflow-contract' })
  , 'OWN.ag-grid-grouped-header-ownership': Object.freeze({ requirement: 'Grouped AG Grid headers preserve component ownership', capability: 'grid-ownership', evidence: 'ag-grid-grouped-header-owner-contract' })
  , 'OWN.ag-grid-keyboard-selection': Object.freeze({ requirement: 'AG Grid keyboard selection remains owner-scoped', capability: 'grid-ownership', evidence: 'ag-grid-keyboard-selection-contract' })
  , 'LAYOUT.ag-grid-selection-scrollbar': Object.freeze({ requirement: 'AG Grid selection outlines preserve scrollbar geometry', capability: 'grid-layout', evidence: 'ag-grid-selection-scrollbar-contract' })
  , 'PERSIST.ag-grid-column-reorder-undo': Object.freeze({ requirement: 'AG Grid column reorder undo is durable and owner-scoped', capability: 'grid-persistence', evidence: 'ag-grid-column-reorder-undo-contract' })
  , 'IMPORT.prism-multi-dataset': Object.freeze({ requirement: 'Prism multi-dataset import preserves dataset boundaries', capability: 'data-import', evidence: 'prism-multi-dataset-import-contract' })
  , 'EXPORT.format-dimensions': Object.freeze({ requirement: 'Export format dimensions preserve the requested physical geometry', capability: 'export-geometry', evidence: 'export-format-dimensions-contract' })
  , 'OWN.box-formula-fill': Object.freeze({ requirement: 'Box formula fill edits write through to the owning table', capability: 'formula-editing', evidence: 'box-formula-fill-contract' })
  , 'OWN.box-formula-assist': Object.freeze({ requirement: 'Box formula assistance edits the owning table safely', capability: 'formula-editing', evidence: 'box-formula-assist-contract' })
  , 'OWN.box-formula-first-render': Object.freeze({ requirement: 'Box formula changes publish a valid first render', capability: 'formula-rendering', evidence: 'box-formula-first-render-contract' })
  , 'OWN.box-formula-edit': Object.freeze({ requirement: 'Box formula edits preserve source and rendered ownership', capability: 'formula-editing', evidence: 'box-formula-edit-contract' })
  , 'OWN.box-grouped-lifecycle': Object.freeze({ requirement: 'Box grouped lifecycle operations preserve owner state', capability: 'tab-isolation', evidence: 'box-grouped-lifecycle-contract' })
  , 'LAYOUT.box-grouped-grid': Object.freeze({ requirement: 'Box grouped grids preserve stable layout seams', capability: 'grid-layout', evidence: 'box-grouped-grid-contract' })
  , 'LAYOUT.box-horizontal-resize-axis': Object.freeze({ requirement: 'Box horizontal resize preserves axis geometry', capability: 'layout', evidence: 'box-horizontal-resize-axis-contract' })
  , 'LAYOUT.box-horizontal-shrink': Object.freeze({ requirement: 'Box horizontal shrink preserves layout reserves', capability: 'layout', evidence: 'box-horizontal-shrink-contract' })
  , 'LAYOUT.box-initial-reserve': Object.freeze({ requirement: 'Box initial layout reserves remain valid', capability: 'layout', evidence: 'box-initial-reserve-contract' })
  , 'OWN.box-inline-edit': Object.freeze({ requirement: 'Box inline edits remain bound to the owning table', capability: 'interaction', evidence: 'box-inline-edit-contract' })
  , 'DIAGNOSTIC.render-cache-lifecycle': Object.freeze({ requirement: 'Render-cache lifecycle diagnostics retain bounded owner evidence', capability: 'diagnostics', evidence: 'render-cache-lifecycle-diagnostic' })
  , 'DIAGNOSTIC.component-exercise': Object.freeze({ requirement: 'Diagnostic component exercises remain explicitly non-acceptance evidence', capability: 'diagnostics', evidence: 'component-exercise-diagnostic' })
  , 'LAYOUT.axis-tick-label-angle': Object.freeze({ requirement: 'Axis tick-label angle preserves readable geometry', capability: 'layout', evidence: 'axis-tick-label-angle-contract' })
  , 'PERSIST.axis-tick-label-angle-reopen': Object.freeze({ requirement: 'Axis tick-label angle survives reopen', capability: 'persistence', evidence: 'axis-tick-label-angle-reopen-contract' })
  , 'PERSIST.axis-major-tick-length-reopen': Object.freeze({ requirement: 'Axis major-tick length survives reopen', capability: 'persistence', evidence: 'axis-major-tick-length-reopen-contract' })
  , 'OWN.axis-tick-label-angle-isolation': Object.freeze({ requirement: 'Axis tick-label angle remains isolated by tab', capability: 'tab-isolation', evidence: 'axis-tick-label-angle-isolation-contract' })
  , 'OWN.data-toolbar-activation': Object.freeze({ requirement: 'Data toolbar activation projects the active owner only', capability: 'toolbar-ownership', evidence: 'data-toolbar-activation-contract' })
  , 'OWN.line-3d-table-stability': Object.freeze({ requirement: 'Line 3D table stability survives view activation', capability: 'three-dimensional-view', evidence: 'line-3d-table-stability-contract' })
  , 'OWN.line-uncertainty-band-isolation': Object.freeze({ requirement: 'Line uncertainty-band settings remain isolated by tab', capability: 'tab-isolation', evidence: 'line-uncertainty-band-isolation-contract' })
  , 'OWN.font-toolbar-graph-text': Object.freeze({ requirement: 'Graph text font controls remain isolated by component owner', capability: 'style-ownership', evidence: 'font-toolbar-graph-text-contract' })
  , 'OWN.legend-font-toolbar': Object.freeze({ requirement: 'Legend font controls remain isolated by component owner', capability: 'style-ownership', evidence: 'legend-font-toolbar-contract' })
  , 'OWN.pie-chart-type-controls': Object.freeze({ requirement: 'Pie chart-type controls remain isolated by tab', capability: 'component-modes', evidence: 'pie-chart-type-control-contract' })
  , 'BOOTSTRAP.browser-smoke': Object.freeze({ requirement: 'Browser smoke uses the supported application bootstrap', capability: 'bootstrap', evidence: 'browser-bootstrap-smoke' })
  , 'BOOTSTRAP.production-derived-loader': Object.freeze({ requirement: 'Isolated application tests use the production-derived loader', capability: 'bootstrap', evidence: 'production-derived-loader-contract' })
  , 'BOOTSTRAP.ui-events-lazy': Object.freeze({ requirement: 'Lazy UI event bootstrap preserves component boundaries', capability: 'bootstrap', evidence: 'ui-events-lazy-bootstrap-contract' })
  , 'BOOTSTRAP.app-initialization': Object.freeze({ requirement: 'Application initialization follows the declared bootstrap order', capability: 'bootstrap', evidence: 'app-initialization-contract' })
  , 'BOOTSTRAP.format-toolbar-exclusivity': Object.freeze({ requirement: 'Format toolbar sections remain mutually exclusive', capability: 'bootstrap', evidence: 'format-toolbar-exclusivity-contract' })
  , 'BOOTSTRAP.form-controls-autosize': Object.freeze({ requirement: 'Form controls initialize with stable autosize behavior', capability: 'bootstrap', evidence: 'form-controls-autosize-contract' })
  , 'VENDOR.real-npm-runtime': Object.freeze({ requirement: 'Approved npm vendors execute in the browser smoke lane', capability: 'vendor-provenance', evidence: 'real-npm-vendor-smoke' })
  , 'VENDOR.browser-runtime': Object.freeze({ requirement: 'Browser vendor shims match the pinned runtime contract', capability: 'vendor-provenance', evidence: 'browser-vendor-runtime-contract' })
  , 'CACHE.surface-render-cache': Object.freeze({ requirement: 'Surface render cache restores only matching owner state', capability: 'render-cache', evidence: 'surface-render-cache-contract' })
  , 'OWN.scheduler-isolation': Object.freeze({ requirement: 'Scheduled work remains isolated by owner tab', capability: 'async-ownership', evidence: 'scheduler-isolation-contract' })
  , 'OWN.document-operation-lock': Object.freeze({ requirement: 'Document operations serialize against the owning workspace', capability: 'document-lifecycle', evidence: 'document-operation-lock-contract' })
  , 'OWN.component-transition-boundary': Object.freeze({ requirement: 'Component transitions preserve owner and readiness boundaries', capability: 'tab-isolation', evidence: 'component-transition-boundary-contract' })
  , 'ASYNC.job-cancellation': Object.freeze({ requirement: 'Cancelled jobs cannot publish stale owner results', capability: 'async-ownership', evidence: 'job-cancellation-contract' })
  , 'LAYOUT.zoom-redraw': Object.freeze({ requirement: 'Zoom changes redraw the correct owner geometry', capability: 'layout', evidence: 'zoom-redraw-contract' })
  , 'LAYOUT.legend-label-reserve': Object.freeze({ requirement: 'Legend and label reserves preserve graph geometry', capability: 'layout', evidence: 'legend-label-reserve-contract' })
  , 'IMPORT.component-data-import': Object.freeze({ requirement: 'Component data import commits to the owning session', capability: 'data-import', evidence: 'component-data-import-contract' })
  , 'EXPORT.component-artifact': Object.freeze({ requirement: 'Component exports contain the owner-valid rendered artifact', capability: 'export', evidence: 'component-artifact-export-contract' })
  , 'WORKER.shared-cancellation': Object.freeze({ requirement: 'Shared worker cancellation rejects stale work', capability: 'worker-ownership', evidence: 'shared-worker-cancellation-contract' })
  , 'WORKER.archive-protocol': Object.freeze({ requirement: 'Archive workers preserve the declared message protocol', capability: 'worker-protocol', evidence: 'archive-worker-protocol-contract' })
  , 'STATS.numerical-oracle': Object.freeze({ requirement: 'Numerical results match the required external oracle', capability: 'statistical-validation', evidence: 'statistical-oracle-contract' })
  , 'ARCH.static-contracts': Object.freeze({ requirement: 'Architecture rules enforce source and ownership boundaries', capability: 'architecture-governance', evidence: 'static-architecture-contracts' })
  , 'ARCH.owner-capture-normalization': Object.freeze({ requirement: 'Owner capture normalizes through the canonical session boundary', capability: 'session-ownership', evidence: 'owner-capture-normalization-contract' })
  , 'ARCH.hot-paste-scheduling': Object.freeze({ requirement: 'Grid paste scheduling preserves owner-scoped mutation order', capability: 'grid-ownership', evidence: 'hot-paste-scheduling-contract' })
  , 'UNIT.color-scheme-math': Object.freeze({ requirement: 'Color-scheme math produces deterministic palette values', capability: 'style-model', evidence: 'color-scheme-math-unit-contract' })
  , 'UNIT.box-statistics-model': Object.freeze({ requirement: 'Box statistics model normalizes supported analysis inputs', capability: 'statistics', evidence: 'box-statistics-model-unit-contract' })
  , 'UNIT.box-stats-model-ownership': Object.freeze({ requirement: 'Box statistics models remain scoped to their owner', capability: 'statistics-ownership', evidence: 'box-stats-model-ownership-unit-contract' })
  , 'UNIT.data-pipeline': Object.freeze({ requirement: 'Data pipeline transformations preserve declared source semantics', capability: 'data-pipeline', evidence: 'data-pipeline-unit-contract' })
  , 'UNIT.data-transforms': Object.freeze({ requirement: 'Data transforms preserve row and column semantics', capability: 'data-pipeline', evidence: 'data-transforms-unit-contract' })
  , 'UNIT.desktop-commands': Object.freeze({ requirement: 'Desktop command adapters expose the supported command contract', capability: 'desktop-integration', evidence: 'desktop-commands-unit-contract' })
  , 'UNIT.example-datasets': Object.freeze({ requirement: 'Example datasets remain deterministic and component-valid', capability: 'fixtures', evidence: 'example-datasets-unit-contract' })
  , 'UNIT.formula-engine': Object.freeze({ requirement: 'Formula engine evaluation is deterministic and bounded', capability: 'formula-engine', evidence: 'formula-engine-unit-contract' })
  , 'UNIT.forecast-regression': Object.freeze({ requirement: 'Forecast regression helpers preserve model semantics', capability: 'statistics', evidence: 'forecast-regression-unit-contract' })
  , 'UNIT.regression-reporting': Object.freeze({ requirement: 'Regression reporting notation preserves interpretation', capability: 'statistics-reporting', evidence: 'regression-reporting-unit-contract' })
  , 'UNIT.scatter-statistics-primitives': Object.freeze({ requirement: 'Scatter statistical primitives preserve component semantics', capability: 'statistics', evidence: 'scatter-statistics-primitives-unit-contract' })
  , 'UNIT.regression-catalog': Object.freeze({ requirement: 'Regression catalog entries expose complete model metadata', capability: 'statistics', evidence: 'regression-catalog-unit-contract' })
  , 'UNIT.stats-adjust': Object.freeze({ requirement: 'Multiple-comparison adjustment methods preserve statistical definitions', capability: 'statistics', evidence: 'stats-adjust-unit-contract' })
  , 'UNIT.stats-goodness-of-fit': Object.freeze({ requirement: 'Goodness-of-fit helpers report valid diagnostics', capability: 'statistics', evidence: 'stats-goodness-of-fit-unit-contract' })
  , 'UNIT.stats-corrections': Object.freeze({ requirement: 'P-value correction helpers preserve supported correction semantics', capability: 'statistics', evidence: 'stats-corrections-unit-contract' })
  , 'UNIT.svg-geometry': Object.freeze({ requirement: 'SVG geometry helpers produce stable rendered coordinates', capability: 'svg-geometry', evidence: 'svg-geometry-unit-contract' })
  , 'UNIT.theme-adapters': Object.freeze({ requirement: 'Theme adapters normalize supported theme inputs', capability: 'theme-model', evidence: 'theme-adapters-unit-contract' })
  , 'UNIT.theme-catalog': Object.freeze({ requirement: 'Theme catalog entries remain complete and unique', capability: 'theme-model', evidence: 'theme-catalog-unit-contract' })
  , 'UNIT.theme-compiler': Object.freeze({ requirement: 'Theme compiler emits deterministic style tokens', capability: 'theme-model', evidence: 'theme-compiler-unit-contract' })
  , 'UNIT.cartesian-layout': Object.freeze({ requirement: 'Cartesian layout helpers preserve frame and plot contracts', capability: 'layout-model', evidence: 'cartesian-layout-unit-contract' })
  , 'UNIT.data-view-persistence': Object.freeze({ requirement: 'DataView persistence preserves replayable source state', capability: 'data-views', evidence: 'data-view-persistence-unit-contract' })
  , 'UNIT.string-analysis': Object.freeze({ requirement: 'STRING analysis request normalization is deterministic', capability: 'external-analysis', evidence: 'string-analysis-unit-contract' })
  , 'UNIT.uniprot': Object.freeze({ requirement: 'UniProt helper requests preserve supported identifiers', capability: 'external-analysis', evidence: 'uniprot-unit-contract' })
  , 'UNIT.graph-archive': Object.freeze({ requirement: 'Graph archive helpers preserve archive schema boundaries', capability: 'archive', evidence: 'graph-archive-unit-contract' })
  , 'UNIT.debug-contract': Object.freeze({ requirement: 'Debug instrumentation remains gated and structured', capability: 'diagnostics', evidence: 'debug-contract-unit-contract' })
  , 'UNIT.production-workspace-fixture': Object.freeze({ requirement: 'Production workspace fixtures establish explicit owner state', capability: 'test-fixtures', evidence: 'production-workspace-fixture-contract' })
  , 'UNIT.contract-waits': Object.freeze({ requirement: 'Contract waits use owner-scoped readiness signals', capability: 'readiness', evidence: 'contract-waits-unit-contract' })
  , 'UNIT.component-lifecycle-renderability': Object.freeze({ requirement: 'Lifecycle renderability follows the component owner contract', capability: 'lifecycle', evidence: 'component-lifecycle-renderability-unit-contract' })
  , 'UNIT.performance-framework': Object.freeze({ requirement: 'Performance measurements retain bounded component context', capability: 'diagnostics', evidence: 'performance-framework-unit-contract' })
  , 'UNIT.box-statistics-fallback': Object.freeze({ requirement: 'Box statistics fallback preserves valid result semantics', capability: 'statistics', evidence: 'box-statistics-fallback-unit-contract' })
  , 'UNIT.box-swarm-model': Object.freeze({ requirement: 'Box swarm model produces stable point offsets', capability: 'rendering-model', evidence: 'box-swarm-model-unit-contract' })
  , 'UNIT.chart-style-axis': Object.freeze({ requirement: 'Chart axis helpers preserve scale and tick contracts', capability: 'layout-model', evidence: 'chart-style-axis-unit-contract' })
  , 'UNIT.chart-style-formatting': Object.freeze({ requirement: 'Chart formatting helpers preserve scientific display semantics', capability: 'layout-model', evidence: 'chart-style-formatting-unit-contract' })
  , 'UNIT.cache-diagnostics': Object.freeze({ requirement: 'Render-cache diagnostics retain typed owner provenance', capability: 'render-cache', evidence: 'cache-diagnostics-unit-contract' })
  , 'UNIT.snapshot-policy': Object.freeze({ requirement: 'Snapshot policy selects the canonical capture mode', capability: 'archive', evidence: 'snapshot-policy-unit-contract' })
  , 'UNIT.stats-remediation-engine': Object.freeze({ requirement: 'Statistics remediation preserves supported analysis decisions', capability: 'statistics', evidence: 'stats-remediation-engine-unit-contract' })
  , 'UNIT.stats-figure-summary-matrix': Object.freeze({ requirement: 'Figure-summary matrix branches retain semantic report rows', capability: 'statistics-reporting', evidence: 'stats-figure-summary-matrix-unit-contract' })
  , 'UNIT.stats-remediation-components': Object.freeze({ requirement: 'Component statistics remediation preserves owner results', capability: 'statistics', evidence: 'stats-remediation-components-unit-contract' })
  , 'UNIT.box-advisor': Object.freeze({ requirement: 'Box advisor decisions remain separate from selected tests', capability: 'statistics', evidence: 'box-advisor-unit-contract' })
  , 'UNIT.box-assumptions': Object.freeze({ requirement: 'Box assumption diagnostics remain advisory and typed', capability: 'statistics', evidence: 'box-assumptions-unit-contract' })
  , 'UNIT.box-axis-autoscale': Object.freeze({ requirement: 'Box axis autoscale produces valid geometry bounds', capability: 'layout-model', evidence: 'box-axis-autoscale-unit-contract' })
  , 'UNIT.box-bar-geometry': Object.freeze({ requirement: 'Box bar geometry preserves positive and negative extents', capability: 'rendering-model', evidence: 'box-bar-geometry-unit-contract' })
  , 'UNIT.box-theme-colors': Object.freeze({ requirement: 'Box theme colors preserve component style semantics', capability: 'style-model', evidence: 'box-theme-colors-unit-contract' })
  , 'UNIT.box-point-connections': Object.freeze({ requirement: 'Box point connections preserve data-series identity', capability: 'rendering-model', evidence: 'box-point-connections-unit-contract' })
  , 'UNIT.box-summary': Object.freeze({ requirement: 'Box summary helpers preserve compact statistical meaning', capability: 'statistics-reporting', evidence: 'box-summary-unit-contract' })
  , 'UNIT.component-load-benchmarks': Object.freeze({ requirement: 'Component load benchmarks report reproducible boundaries', capability: 'performance', evidence: 'component-load-benchmark-unit-contract' })
  , 'UNIT.go-analysis': Object.freeze({ requirement: 'GO analysis helpers preserve supported request semantics', capability: 'external-analysis', evidence: 'go-analysis-unit-contract' })
  , 'UNIT.graph-archive-roundtrip': Object.freeze({ requirement: 'Graph archive round trips preserve durable session fields', capability: 'archive', evidence: 'graph-archive-roundtrip-unit-contract' })
  , 'UNIT.hot-ui-state': Object.freeze({ requirement: 'Grid UI state serialization preserves supported controls', capability: 'grid-persistence', evidence: 'hot-ui-state-unit-contract' })
  , 'UNIT.line-model-helpers': Object.freeze({ requirement: 'Line model helpers preserve series and projection semantics', capability: 'rendering-model', evidence: 'line-model-helpers-unit-contract' })
  , 'UNIT.regression-logistic-summary': Object.freeze({ requirement: 'Logistic regression summaries preserve interpretation fields', capability: 'statistics-reporting', evidence: 'regression-logistic-summary-unit-contract' })
  , 'UNIT.welcome-assets': Object.freeze({ requirement: 'Welcome assets remain generated from the declared source examples', capability: 'generated-artifacts', evidence: 'welcome-assets-unit-contract' })
  , 'DOM.color-scheme-svg': Object.freeze({ requirement: 'Color-scheme projection updates rendered SVG state', capability: 'style-projection', evidence: 'color-scheme-svg-dom-contract' })
  , 'DOM.color-scheme-ownership': Object.freeze({ requirement: 'Color-scheme controls remain isolated by owner', capability: 'style-ownership', evidence: 'color-scheme-ownership-dom-contract' })
  , 'DOM.svg-sizing': Object.freeze({ requirement: 'SVG sizing projection preserves graph-frame dimensions', capability: 'svg-layout', evidence: 'svg-sizing-dom-contract' })
  , 'DOM.svg-interaction': Object.freeze({ requirement: 'SVG interactions update the owning projection', capability: 'svg-interaction', evidence: 'svg-interaction-dom-contract' })
  , 'DOM.frame-publication': Object.freeze({ requirement: 'Frame publication exposes one owner-valid rendered frame', capability: 'render-publication', evidence: 'frame-publication-dom-contract' })
  , 'DOM.title-editing': Object.freeze({ requirement: 'Title editing projects and persists the owner value', capability: 'interaction', evidence: 'title-editing-dom-contract' })
  , 'DOM.export-projection': Object.freeze({ requirement: 'Export projection reads the rendered owner frame', capability: 'export', evidence: 'export-projection-dom-contract' })
  , 'DOM.visual-projection': Object.freeze({ requirement: 'Visual projection follows canonical session state', capability: 'projection', evidence: 'visual-projection-dom-contract' })
  , 'DOM.component-registry': Object.freeze({ requirement: 'Component registry exposes the declared workspace components', capability: 'bootstrap', evidence: 'component-registry-dom-contract' })
  , 'DOM.stats-formatting': Object.freeze({ requirement: 'Statistics formatting preserves semantic display values', capability: 'statistics-reporting', evidence: 'stats-formatting-dom-contract' })
  , 'DOM.dom-controls-ownership': Object.freeze({ requirement: 'DOM controls bind to the active owner session', capability: 'tab-isolation', evidence: 'dom-controls-ownership-contract' })
  , 'DOM.font-controls': Object.freeze({ requirement: 'Font controls project through the shared owner boundary', capability: 'style-projection', evidence: 'font-controls-dom-contract' })
  , 'DOM.symbol-toolbar': Object.freeze({ requirement: 'Symbol toolbar changes remain owner-scoped', capability: 'style-ownership', evidence: 'symbol-toolbar-dom-contract' })
  , 'DOM.style-undo': Object.freeze({ requirement: 'Style undo restores the owning component state', capability: 'style-ownership', evidence: 'style-undo-dom-contract' })
  , 'DOM.workspace-toolbar-numeric': Object.freeze({ requirement: 'Workspace numeric toolbar controls preserve valid values', capability: 'toolbar', evidence: 'workspace-toolbar-numeric-dom-contract' })
  , 'DOM.workspace-toolbar-overflow': Object.freeze({ requirement: 'Workspace toolbar overflow preserves reachable controls', capability: 'toolbar', evidence: 'workspace-toolbar-overflow-dom-contract' })
  , 'DOM.dendrogram-controls': Object.freeze({ requirement: 'Dendrogram controls project Heatmap clustering state', capability: 'component-controls', evidence: 'dendrogram-controls-dom-contract' })
  , 'DOM.heatmap-render-publication': Object.freeze({ requirement: 'Heatmap publication requires a complete render model', capability: 'render-publication', evidence: 'heatmap-render-publication-dom-contract' })
  , 'DOM.venn-label-layout': Object.freeze({ requirement: 'Venn label layout preserves readable geometry', capability: 'layout', evidence: 'venn-label-layout-dom-contract' })
  , 'DOM.plot3d-gestures': Object.freeze({ requirement: '3D gestures update the owning viewport only', capability: 'three-dimensional-view', evidence: 'plot3d-gestures-dom-contract' })
  , 'DOM.hist-scheduler-ownership': Object.freeze({ requirement: 'Histogram scheduler updates the owning tab only', capability: 'async-ownership', evidence: 'hist-scheduler-ownership-dom-contract' })
  , 'DOM.grid-controls': Object.freeze({ requirement: 'Grid controls project through the owning table', capability: 'grid-ownership', evidence: 'grid-controls-dom-contract' })
  , 'DOM.significance-controls': Object.freeze({ requirement: 'Significance controls preserve Box inference state', capability: 'statistics', evidence: 'significance-controls-dom-contract' })
  , 'DOM.notes': Object.freeze({ requirement: 'Notes controls remain owned by the active tab', capability: 'notes', evidence: 'notes-dom-contract' })
  , 'DOM.toolbar-overflow': Object.freeze({ requirement: 'Toolbar overflow preserves control reachability', capability: 'toolbar', evidence: 'toolbar-overflow-dom-contract' })
  , 'DOM.chart-style': Object.freeze({ requirement: 'Chart-style controls project stable shared styles', capability: 'style-projection', evidence: 'chart-style-dom-contract' })
  , 'DOM.exporter-projection': Object.freeze({ requirement: 'Exporter projection preserves rendered content', capability: 'export', evidence: 'exporter-projection-dom-contract' })
  , 'DOM.table-import-format-registry': Object.freeze({ requirement: 'Table import format registry exposes supported formats', capability: 'data-import', evidence: 'table-import-format-registry-dom-contract' })
  , 'DOM.shared-controls': Object.freeze({ requirement: 'Shared controls preserve common projection contracts', capability: 'shared-controls', evidence: 'shared-controls-dom-contract' })
  , 'DOM.graph-sizing': Object.freeze({ requirement: 'Graph sizing projects owner-valid dimensions', capability: 'layout', evidence: 'graph-sizing-dom-contract' })
  , 'DOM.statistics-projection': Object.freeze({ requirement: 'Statistics panels project owner results', capability: 'statistics-projection', evidence: 'statistics-projection-dom-contract' })
  , 'DOM.lifecycle-ownership': Object.freeze({ requirement: 'Lifecycle DOM references remain owner-scoped', capability: 'lifecycle', evidence: 'lifecycle-ownership-dom-contract' })
  , 'DOM.component-frame-authority': Object.freeze({ requirement: 'Component frame authority rejects stale projections', capability: 'render-publication', evidence: 'component-frame-authority-dom-contract' })
  , 'DOM.lifecycle-core': Object.freeze({ requirement: 'Lifecycle core preserves activation and disposal contracts', capability: 'lifecycle', evidence: 'lifecycle-core-dom-contract' })
  , 'DOM.theme-runtime': Object.freeze({ requirement: 'Theme runtime projects the active theme consistently', capability: 'theme-projection', evidence: 'theme-runtime-dom-contract' })
  , 'DOM.pca-point-styles': Object.freeze({ requirement: 'PCA point styles project per-owner settings', capability: 'style-projection', evidence: 'pca-point-styles-dom-contract' })
  , 'DOM.pca-preprocessing': Object.freeze({ requirement: 'PCA preprocessing controls preserve data semantics', capability: 'data-pipeline', evidence: 'pca-preprocessing-dom-contract' })
  , 'DOM.form-controls-autosize': Object.freeze({ requirement: 'Form controls autosize without breaking projection layout', capability: 'shared-controls', evidence: 'form-controls-autosize-dom-contract' })
  , 'DOM.heatmap-model-helpers': Object.freeze({ requirement: 'Heatmap model helpers preserve matrix projection semantics', capability: 'rendering-model', evidence: 'heatmap-model-helpers-dom-contract' })
  , 'DOM.welcome-startup': Object.freeze({ requirement: 'Welcome startup exposes a stable component launch surface', capability: 'bootstrap', evidence: 'welcome-startup-dom-contract' })
  , 'DOM.box-live-style': Object.freeze({ requirement: 'Box live styles redraw the owning graph', capability: 'style-projection', evidence: 'box-live-style-dom-contract' })
  , 'DOM.box-significance-whiskers': Object.freeze({ requirement: 'Box significance whiskers preserve inference geometry', capability: 'statistics', evidence: 'box-significance-whiskers-dom-contract' })
  , 'DOM.box-stats-reporting': Object.freeze({ requirement: 'Box statistics reporting preserves semantic sections', capability: 'statistics-reporting', evidence: 'box-stats-reporting-dom-contract' })
  , 'DOM.box-swarm-offsets': Object.freeze({ requirement: 'Box swarm offsets project stable point positions', capability: 'rendering-model', evidence: 'box-swarm-offsets-dom-contract' })
  , 'DOM.color-picker-toolbar-ownership': Object.freeze({ requirement: 'Color-picker toolbar changes remain owner-scoped', capability: 'style-ownership', evidence: 'color-picker-toolbar-ownership-dom-contract' })
  , 'DOM.data-views-export': Object.freeze({ requirement: 'DataView exports use the canonical source projection', capability: 'data-views', evidence: 'data-views-export-dom-contract' })
  , 'DOM.exporter-scatter-optimization': Object.freeze({ requirement: 'Scatter exporter optimization preserves artifact content', capability: 'export', evidence: 'exporter-scatter-optimization-dom-contract' })
  , 'DOM.graph-archive-render-cache': Object.freeze({ requirement: 'Archive render-cache projection preserves valid metadata', capability: 'render-cache', evidence: 'graph-archive-render-cache-dom-contract' })
  , 'DOM.hist-frame': Object.freeze({ requirement: 'Histogram frame projection preserves drawable geometry', capability: 'layout', evidence: 'hist-frame-dom-contract' })
  , 'DOM.hist-panel-layout': Object.freeze({ requirement: 'Histogram panel layout preserves control and graph space', capability: 'layout', evidence: 'hist-panel-layout-dom-contract' })
  , 'DOM.previews-png-fallback': Object.freeze({ requirement: 'Preview PNG fallback preserves a usable artifact', capability: 'preview', evidence: 'previews-png-fallback-dom-contract' })
  , 'DOM.requested-defaults': Object.freeze({ requirement: 'Data-aware defaults project without overriding explicit choices', capability: 'component-modes', evidence: 'requested-defaults-dom-contract' })
  , 'DOM.scatter-adaptive-size': Object.freeze({ requirement: 'Scatter adaptive sizing preserves readable projection bounds', capability: 'layout', evidence: 'scatter-adaptive-size-dom-contract' })
  , 'DOM.table-import-aggrid-paste': Object.freeze({ requirement: 'AG Grid paste imports into the canonical table source', capability: 'data-import', evidence: 'table-import-aggrid-paste-dom-contract' })
  , 'DOM.table-import-owner': Object.freeze({ requirement: 'Table import commits to the owning component tab', capability: 'data-import', evidence: 'table-import-owner-dom-contract' })
  , 'DOM.table-import-prism': Object.freeze({ requirement: 'Prism import projects the selected dataset into the owning table', capability: 'data-import', evidence: 'table-import-prism-dom-contract' })
  , 'DOM.fileio-activation': Object.freeze({ requirement: 'File I/O activation preserves the active owner boundary', capability: 'archive', evidence: 'fileio-activation-dom-contract' })
  , 'DOM.hot-aggrid-binding': Object.freeze({ requirement: 'AG Grid binding preserves owner and table identity', capability: 'grid-ownership', evidence: 'hot-aggrid-binding-dom-contract' })
  , 'DOM.hot-aggrid-clipboard': Object.freeze({ requirement: 'AG Grid clipboard projection preserves table data', capability: 'grid-clipboard', evidence: 'hot-aggrid-clipboard-dom-contract' })
  , 'DOM.hot-aggrid-dimensions': Object.freeze({ requirement: 'AG Grid dimensions project stable table geometry', capability: 'grid-layout', evidence: 'hot-aggrid-dimensions-dom-contract' })
  , 'DOM.hot-exclusions': Object.freeze({ requirement: 'Grid exclusions project through the canonical payload', capability: 'data-views', evidence: 'hot-exclusions-dom-contract' })
  , 'DOM.surface-legend': Object.freeze({ requirement: 'Surface legend projection preserves viewport geometry', capability: 'layout', evidence: 'surface-legend-dom-contract' })
  , 'DOM.toolbar-numeric-shared': Object.freeze({ requirement: 'Shared numeric toolbar controls preserve valid projection values', capability: 'shared-controls', evidence: 'toolbar-numeric-shared-dom-contract' })
});

const RAW_SCENARIO_CATALOG = Object.freeze([
  Object.freeze({ id: 'GOVERNANCE.component-catalog', kind: 'governance', components: ['*'] }),
  Object.freeze({ id: 'GOVERNANCE.discovery-inventory', kind: 'governance', components: ['*'] }),
  Object.freeze({ id: 'GOVERNANCE.layer-manifest', kind: 'governance', components: ['*'] }),
  Object.freeze({ id: 'GOVERNANCE.jest-project-boundaries', kind: 'governance', components: ['*'] }),
  Object.freeze({ id: 'GOVERNANCE.lane-runner', kind: 'governance', components: ['*'] }),
  Object.freeze({ id: 'GOVERNANCE.jest-shard-runner', kind: 'governance', components: ['*'] }),
  Object.freeze({ id: 'GOVERNANCE.coverage-trend', kind: 'governance', components: ['*'] }),
  Object.freeze({ id: 'GOVERNANCE.test-trend-report', kind: 'governance', components: ['*'], requirement: 'Publish test health trend metrics', capability: 'test-governance', evidence: 'lane-inventory-trend-report' }),
  Object.freeze({ id: 'GOVERNANCE.integration-teardown', kind: 'governance', components: ['*'] }),
  Object.freeze({ id: 'GOVERNANCE.production-bootstrap-manifest', kind: 'governance', components: ['*'] }),
  Object.freeze({ id: 'GOVERNANCE.vendor-provenance', kind: 'governance', components: ['*'] }),
  Object.freeze({ id: 'GOVERNANCE.change-impact-map', kind: 'governance', components: ['*'] }),
  Object.freeze({ id: 'GOVERNANCE.component-mutation-catalog', kind: 'governance', components: ['*'] }),
  Object.freeze({ id: 'OWN.readiness-observability', kind: 'contract', contract: 'OWN', components: ['*'] }),
  Object.freeze({ id: 'OWN.readiness-projection', kind: 'contract', contract: 'OWN', components: ['*'] }),
  Object.freeze({ id: 'OWN.negative-owner-handoffs', kind: 'contract', contract: 'OWN', components: ['*'], requirement: 'Reject mismatched and stale owner handoffs', capability: 'async-ownership', evidence: 'lifecycle-negative-owner-handoff-contract' }),
  Object.freeze({ id: 'OWN.repeated-owner-order', kind: 'contract', contract: 'OWN', components: ['*'], requirement: 'Repeated randomized owner-order isolation', capability: 'tab-isolation', evidence: 'nightly-repeated-owner-order-contract' }),
  Object.freeze({ id: 'OWN.same-type-switching.all-components', kind: 'contract', contract: 'OWN', components: ['*'], requirement: 'Same-type tab isolation', capability: 'tab-isolation', evidence: 'owner-session-and-ui-contract' }),
  Object.freeze({ id: 'OWN.session-shape-idempotence', kind: 'contract', contract: 'OWN', components: ['*'], requirement: 'Idempotent owner session shaping', capability: 'session-ownership', evidence: 'session-shape-identity-contract' }),
  Object.freeze({ id: 'OWN.component-dom-binding', kind: 'contract', contract: 'OWN', components: ['*'] }),
  Object.freeze({ id: 'OWN.config-isolation.all-components', kind: 'contract', contract: 'OWN', components: ['*'], requirement: 'Configuration isolation between tabs', capability: 'tab-isolation', evidence: 'owner-payload-isolation-contract' }),
  Object.freeze({ id: 'OWN.cross-browser-feature-matrix', kind: 'contract', contract: 'OWN', components: ['*'] }),
  Object.freeze({ id: 'PERSIST.explicit-component-mutations', kind: 'contract', contract: 'PERSIST', components: ['*'], requirement: 'Component-specific mode and style persistence', capability: 'component-modes', evidence: 'component-mutation-matrix' }),
  Object.freeze({ id: 'PERSIST.session-payload-write-through', kind: 'contract', contract: 'PERSIST', components: ['*'], requirement: 'Owner session payload write-through', capability: 'persistence', evidence: 'owner-payload-write-through-contract' }),
  Object.freeze({ id: 'ARCHIVE.session-save-policies', kind: 'contract', contract: 'ARCHIVE', components: ['*'] }),
  Object.freeze({ id: 'ARCH.semantic-render-impact', kind: 'contract', contract: 'ARCH', components: ['*'], requirement: 'Semantic render-impact scheduling', capability: 'render-scheduling', evidence: 'shared-draw-impact-contract' }),
  Object.freeze({ id: 'REC.archive-restore-transaction', kind: 'contract', contract: 'REC', components: ['*'] }),
  Object.freeze({ id: 'PERSIST.grid-clipboard', kind: 'contract', contract: 'PERSIST', components: ['*'] }),
  Object.freeze({ id: 'OWN.ag-grid-edit-overflow', kind: 'contract', contract: 'OWN', components: ['scatter'] }),
  Object.freeze({ id: 'OWN.ag-grid-grouped-header-ownership', kind: 'contract', contract: 'OWN', components: ['box', 'scatter', 'line', 'pca'] }),
  Object.freeze({ id: 'OWN.ag-grid-keyboard-selection', kind: 'contract', contract: 'OWN', components: ['scatter'] }),
  Object.freeze({ id: 'LAYOUT.ag-grid-selection-scrollbar', kind: 'contract', contract: 'LAYOUT', components: ['box'] }),
  Object.freeze({ id: 'PERSIST.ag-grid-column-reorder-undo', kind: 'contract', contract: 'PERSIST', components: ['box'] }),
  Object.freeze({ id: 'STATS.same-type-archive-restore', kind: 'contract', contract: 'STATS', components: ['*'], requirement: 'Same-type statistical archive restore', capability: 'statistics', evidence: 'same-type-stats-restore' }),
  Object.freeze({ id: 'PERSIST.stats-archive-restore', kind: 'contract', contract: 'PERSIST', components: ['*'], requirement: 'Statistical archive persistence', capability: 'persistence', evidence: 'stats-archive-roundtrip' }),
  Object.freeze({ id: 'STATS.reopen-presence', kind: 'contract', contract: 'STATS', components: ['*'], requirement: 'Statistical panel reopen presence', capability: 'statistics', evidence: 'stats-panel-reopen-presence' }),
  Object.freeze({ id: 'PERSIST.stats-reopen', kind: 'contract', contract: 'PERSIST', components: ['*'], requirement: 'Statistical state reopen persistence', capability: 'persistence', evidence: 'stats-state-roundtrip' }),
  Object.freeze({ id: 'PERSIST.table-format-tab-isolation', kind: 'contract', contract: 'PERSIST', components: ['box', 'pca'] }),
  Object.freeze({ id: 'STATS.box-significance-restore', kind: 'contract', contract: 'STATS', components: ['box'], requirement: 'Box significance restore', capability: 'statistics', evidence: 'box-significance-restore' }),
  Object.freeze({ id: 'PERSIST.line-uncertainty-band-reopen', kind: 'contract', contract: 'PERSIST', components: ['line'] }),
  Object.freeze({ id: 'OWN.scatter-inline-edit-preview', kind: 'contract', contract: 'OWN', components: ['scatter'] }),
  Object.freeze({ id: 'STATS.figure-summary-layout', kind: 'contract', contract: 'STATS', components: ['*'] }),
  Object.freeze({ id: 'REC.heatmap-exclusion-archive-parity', kind: 'contract', contract: 'REC', components: ['heatmap'] }),
  Object.freeze({ id: 'STATS.box-dark-theme-regression', kind: 'contract', contract: 'STATS', components: ['box'], requirement: 'Box statistics in dark theme', capability: 'statistics', evidence: 'box-dark-theme-statistics' }),
  Object.freeze({ id: 'STATS.box-controls-isolation', kind: 'contract', contract: 'STATS', components: ['box'], requirement: 'Box statistics control isolation', capability: 'statistics', evidence: 'box-statistics-control-isolation' }),
  Object.freeze({ id: 'STATS.heatmap-presentation', kind: 'contract', contract: 'STATS', components: ['heatmap'], requirement: 'Heatmap statistics presentation', capability: 'statistics', evidence: 'heatmap-statistics-presentation' }),
  Object.freeze({ id: 'STATS.scatter-statistics-isolation', kind: 'contract', contract: 'STATS', components: ['scatter'], requirement: 'Scatter statistics isolation', capability: 'statistics', evidence: 'scatter-statistics-isolation' }),
  Object.freeze({ id: 'STATS.survival-pipeline', kind: 'contract', contract: 'STATS', components: ['survival'], requirement: 'Survival statistics pipeline', capability: 'statistics', evidence: 'survival-statistics-pipeline' }),
  Object.freeze({ id: 'OWN.legend-3d-drag', kind: 'contract', contract: 'OWN', components: ['pca', 'line'], requirement: 'PCA and Line 3D interaction ownership', capability: '3d', evidence: 'plot3d-owner-interaction' }),
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
  Object.freeze({ id: 'CACHE.box-read-only-capture', kind: 'contract', contract: 'CACHE', components: ['box'], requirement: 'Box read-only render-cache capture', capability: 'render-cache', evidence: 'box-render-cache-capture-no-mutation' }),
  Object.freeze({ id: 'CACHE.heatmap-read-only-capture', kind: 'contract', contract: 'CACHE', components: ['heatmap'], requirement: 'Heatmap read-only render-cache capture', capability: 'render-cache', evidence: 'heatmap-render-cache-capture-no-mutation' }),
  Object.freeze({ id: 'CACHE.pca-read-only-capture', kind: 'contract', contract: 'CACHE', components: ['pca'], requirement: 'PCA read-only render-cache capture', capability: 'render-cache', evidence: 'pca-render-cache-capture-no-mutation' }),
  Object.freeze({ id: 'CACHE.scatter-read-only-capture', kind: 'contract', contract: 'CACHE', components: ['scatter'], requirement: 'Scatter read-only render-cache capture', capability: 'render-cache', evidence: 'scatter-render-cache-capture-no-mutation' }),
  Object.freeze({ id: 'CACHE.roc-read-only-capture', kind: 'contract', contract: 'CACHE', components: ['roc'], requirement: 'ROC read-only render-cache capture', capability: 'render-cache', evidence: 'roc-render-cache-capture-no-mutation' }),
  Object.freeze({ id: 'CACHE.hist-read-only-capture', kind: 'contract', contract: 'CACHE', components: ['hist'], requirement: 'Histogram read-only render-cache capture', capability: 'render-cache', evidence: 'hist-render-cache-capture-no-mutation' }),
  Object.freeze({ id: 'CACHE.survival-read-only-capture', kind: 'contract', contract: 'CACHE', components: ['survival'], requirement: 'Survival read-only render-cache capture', capability: 'render-cache', evidence: 'survival-render-cache-capture-no-mutation' }),
  Object.freeze({ id: 'CACHE.venn-read-only-capture', kind: 'contract', contract: 'CACHE', components: ['venn'], requirement: 'Venn and UpSet read-only render-cache capture', capability: 'render-cache', evidence: 'venn-render-cache-capture-no-mutation' }),
  Object.freeze({ id: 'CACHE.line-read-only-capture', kind: 'contract', contract: 'CACHE', components: ['line'], requirement: 'Line 2D and 3D read-only render-cache capture', capability: 'render-cache', evidence: 'line-render-cache-capture-no-mutation' }),
  Object.freeze({ id: 'CACHE.surface-read-only-capture', kind: 'contract', contract: 'CACHE', components: ['surface'], requirement: 'Surface Plot3D read-only render-cache capture', capability: 'render-cache', evidence: 'surface-render-cache-capture-no-mutation' }),
  Object.freeze({ id: 'CACHE.tab-switch-reuse', kind: 'contract', contract: 'CACHE', components: ['*'] }),
  Object.freeze({ id: 'CACHE.reopened-first-interaction', kind: 'contract', contract: 'CACHE', components: ['*'], requirement: 'First interaction after render-cache restore', capability: 'render-cache', evidence: 'reopened-first-interaction-contract' }),
  Object.freeze({ id: 'PERSIST.venn-empty-payload-defaults', kind: 'contract', contract: 'PERSIST', components: ['venn'], requirement: 'Venn empty-payload defaults', capability: 'persistence', evidence: 'venn-default-payload-reset' }),
  Object.freeze({ id: 'PERSIST.venn-notes-direct', kind: 'contract', contract: 'PERSIST', components: ['venn'], requirement: 'Venn notes ownership', capability: 'notes', evidence: 'venn-notes-owner-isolation' }),
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
  Object.freeze({ id: 'CACHE.heavy-canvas-recovery', kind: 'contract', contract: 'CACHE', components: ['box', 'scatter', 'heatmap'], requirement: 'Heavy canvas recovery', capability: 'canvas', evidence: 'canvas-owner-recovery' }),
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
  Object.freeze({ id: 'UNIT.render-cache-schema', kind: 'unit', components: ['*'], requirement: 'Reject corrupt and obsolete render-cache schemas', capability: 'render-cache', evidence: 'render-cache-schema-validation' }),
  Object.freeze({ id: 'UNIT.resampling', kind: 'unit', components: ['roc'], requirement: 'Seeded ROC resampling reproducibility', capability: 'statistics', evidence: 'roc-resampling-unit-contract' }),
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
  Object.freeze({ id: 'UNIT.line-regression-overlay', kind: 'unit', components: ['line'], requirement: 'Line regression overlay segmentation', capability: 'rendering', evidence: 'line-regression-overlay-unit-contract' }),
  Object.freeze({ id: 'UNIT.line-model-helpers', kind: 'unit', components: ['line'] }),
  Object.freeze({ id: 'UNIT.regression-logistic-summary', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.roc-classification', kind: 'unit', components: ['roc'], requirement: 'ROC classification setup normalization', capability: 'statistics', evidence: 'roc-classification-unit-contract' }),
  Object.freeze({ id: 'UNIT.scatter-context-selection', kind: 'unit', components: ['scatter'], requirement: 'Scatter point selection semantics', capability: 'interaction', evidence: 'scatter-context-selection-unit-contract' }),
  Object.freeze({ id: 'UNIT.scatter-point-style', kind: 'unit', components: ['scatter'], requirement: 'Scatter point style override semantics', capability: 'component-modes', evidence: 'scatter-point-style-unit-contract' }),
  Object.freeze({ id: 'UNIT.scatter-regression-overlay', kind: 'unit', components: ['scatter'], requirement: 'Scatter regression overlay segmentation', capability: 'rendering', evidence: 'scatter-regression-overlay-unit-contract' }),
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
  Object.freeze({ id: 'OWN.toolbar-control-isolation', kind: 'contract', contract: 'OWN', components: ['*'], requirement: 'Toolbar state isolation', capability: 'tab-isolation', evidence: 'toolbar-owner-projection' }),
  Object.freeze({ id: 'PERSIST.component-reopen-fidelity', kind: 'contract', contract: 'PERSIST', components: ['*'], requirement: 'Component reopen fidelity', capability: 'reopen-fidelity', evidence: 'payload-runtime-roundtrip-contract' }),
  Object.freeze({ id: 'PERSIST.notes-and-dataviews', kind: 'contract', contract: 'PERSIST', components: ['*'], requirement: 'Notes and DataViews persistence', capability: 'persistence', evidence: 'notes-and-dataviews-roundtrip' }),
  Object.freeze({ id: 'REC.archive-recovery-matrix', kind: 'contract', contract: 'REC', components: ['*'], requirement: 'Archive and recovery fidelity', capability: 'reopen-fidelity', evidence: 'archive-recovery-matrix' }),
  Object.freeze({ id: 'ASYNC.job-cancellation', kind: 'contract', contract: 'ASYNC', components: ['*'] }),
  Object.freeze({ id: 'LAYOUT.component-resize-persistence', kind: 'contract', contract: 'LAYOUT', components: ['*'], requirement: 'Component resize persistence', capability: 'layout', evidence: 'resize-layout-roundtrip' }),
  Object.freeze({ id: 'LAYOUT.zoom-redraw', kind: 'contract', contract: 'LAYOUT', components: ['*'] }),
  Object.freeze({ id: 'LAYOUT.legend-label-reserve', kind: 'contract', contract: 'LAYOUT', components: ['*'] }),
  Object.freeze({ id: 'STATS.component-reporting', kind: 'contract', contract: 'STATS', components: ['*'], requirement: 'Component statistical reporting', capability: 'statistics', evidence: 'component-statistical-reporting' }),
  Object.freeze({ id: 'MODE.component-persistence-matrix-direct', kind: 'contract', contract: 'PERSIST', components: ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'], requirement: 'Component mode persistence matrix', capability: 'component-modes', evidence: 'per-component-mutation-plan' }),
  Object.freeze({ id: 'PERSIST.box-notes-direct', kind: 'contract', contract: 'PERSIST', components: ['box'], requirement: 'Box notes ownership', capability: 'notes', evidence: 'box-notes-layout-and-owner' }),
  Object.freeze({ id: 'PERSIST.pca-data-views-direct', kind: 'contract', contract: 'PERSIST', components: ['pca'], requirement: 'PCA DataViews ownership', capability: 'data-views', evidence: 'pca-dataview-owner-payload' }),
  Object.freeze({ id: 'PERSIST.heatmap-data-views-direct', kind: 'contract', contract: 'PERSIST', components: ['heatmap'], requirement: 'Heatmap DataViews ownership', capability: 'data-views', evidence: 'heatmap-dataview-owner-payload' }),
  Object.freeze({ id: 'PERSIST.pie-data-views-direct', kind: 'contract', contract: 'PERSIST', components: ['pie'], requirement: 'Pie DataViews ownership', capability: 'data-views', evidence: 'pie-dataview-owner-payload' }),
  Object.freeze({ id: 'PERSIST.surface-data-views-direct', kind: 'contract', contract: 'PERSIST', components: ['surface'], requirement: 'Surface DataViews ownership', capability: 'data-views', evidence: 'surface-dataview-owner-payload' }),
  Object.freeze({ id: 'PERSIST.component-dataviews-direct', kind: 'contract', contract: 'PERSIST', components: ['survival', 'roc', 'hist', 'box', 'scatter', 'pca', 'line'], requirement: 'Component DataViews ownership (reviewed batch)', capability: 'data-views', evidence: 'shared-dataview-owner-isolation' }),
  Object.freeze({ id: 'PERSIST.component-notes-direct', kind: 'contract', contract: 'PERSIST', components: ['survival', 'roc', 'hist', 'box', 'scatter', 'pca', 'line'], requirement: 'Component notes ownership (reviewed batch)', capability: 'notes', evidence: 'shared-notes-owner-isolation' }),
  Object.freeze({ id: 'PERSIST.heatmap-notes-direct', kind: 'contract', contract: 'PERSIST', components: ['heatmap'], requirement: 'Heatmap notes ownership', capability: 'notes', evidence: 'heatmap-notes-root-binding' }),
  Object.freeze({ id: 'PERSIST.pie-notes-direct', kind: 'contract', contract: 'PERSIST', components: ['pie'], requirement: 'Pie notes ownership', capability: 'notes', evidence: 'pie-notes-owner-isolation' }),
  Object.freeze({ id: 'CACHE.pie-read-only-capture', kind: 'contract', contract: 'CACHE', components: ['pie'], requirement: 'Pie read-only render-cache capture', capability: 'render-cache', evidence: 'pie-render-cache-capture-no-mutation' }),
  Object.freeze({ id: 'PERSIST.surface-notes-direct', kind: 'contract', contract: 'PERSIST', components: ['surface'], requirement: 'Surface notes ownership', capability: 'notes', evidence: 'surface-notes-owner-isolation' }),
  Object.freeze({ id: 'PERSIST.survival-notes-direct', kind: 'contract', contract: 'PERSIST', components: ['survival'], requirement: 'Survival notes ownership', capability: 'notes', evidence: 'survival-notes-owner-isolation' }),
  Object.freeze({ id: 'STATS.pca-reporting-direct', kind: 'contract', contract: 'STATS', components: ['pca'], requirement: 'PCA statistical reporting', capability: 'statistics', evidence: 'pca-stats-restore' }),
  Object.freeze({ id: 'STATS.line-reporting-direct', kind: 'contract', contract: 'STATS', components: ['line'], requirement: 'Line statistical reporting', capability: 'statistics', evidence: 'line-stats-owner-roundtrip' }),
  Object.freeze({ id: 'STATS.surface-reporting-direct', kind: 'contract', contract: 'STATS', components: ['surface'], requirement: 'Surface statistical reporting', capability: 'statistics', evidence: 'surface-stats-cache-roundtrip' }),
  Object.freeze({ id: 'STATS.roc-reporting-direct', kind: 'contract', contract: 'STATS', components: ['roc'], requirement: 'ROC statistical reporting', capability: 'statistics', evidence: 'roc-stats-overlay' }),
  Object.freeze({ id: 'STATS.hist-reporting-direct', kind: 'contract', contract: 'STATS', components: ['hist'], requirement: 'Histogram statistical reporting', capability: 'statistics', evidence: 'hist-stats-panel' }),
  Object.freeze({ id: 'STATS.pie-reporting-direct', kind: 'contract', contract: 'STATS', components: ['pie'], requirement: 'Pie statistical reporting', capability: 'statistics', evidence: 'pie-stats-example' }),
  Object.freeze({ id: 'OWN.scatter-3d-direct', kind: 'contract', contract: 'OWN', components: ['scatter'], requirement: 'Scatter 3D interaction ownership', capability: '3d', evidence: 'scatter-2d-3d-isolation' }),
  Object.freeze({ id: 'OWN.surface-3d-direct', kind: 'contract', contract: 'OWN', components: ['surface'], requirement: 'Surface 3D interaction ownership', capability: '3d', evidence: 'surface-rotation-recovery' }),
  Object.freeze({ id: 'ASYNC.venn-analysis-owner', kind: 'contract', contract: 'ASYNC', components: ['venn'], requirement: 'Venn external analysis ownership', capability: 'async-ownership', evidence: 'venn-analysis-stale-owner-guard' }),
  Object.freeze({ id: 'IMPORT.component-data-import', kind: 'contract', contract: 'IMPORT', components: ['*'] }),
  Object.freeze({ id: 'EXPORT.component-artifact', kind: 'contract', contract: 'EXPORT', components: ['*'] }),
  Object.freeze({ id: 'CACHE.preview-reuse', kind: 'contract', contract: 'CACHE', components: ['*'], requirement: 'Preview cache reuse', capability: 'render-cache', evidence: 'preview-cache-reuse' }),
  Object.freeze({ id: 'DOM.workspace-toolbar-numeric', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.workspace-toolbar-overflow', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.dendrogram-controls', kind: 'dom-unit', components: ['heatmap'] }),
  Object.freeze({ id: 'DOM.heatmap-render-publication', kind: 'dom-unit', components: ['heatmap'] }),
  Object.freeze({ id: 'DOM.roc-statistics-presentation', kind: 'dom-unit', components: ['roc'], requirement: 'ROC statistics presentation', capability: 'statistics', evidence: 'roc-statistics-presentation' }),
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
  Object.freeze({ id: 'WORKER.box-actions', kind: 'worker', components: ['box'], requirement: 'Box worker actions', capability: 'worker', evidence: 'box-worker-entrypoint' }),
  Object.freeze({ id: 'WORKER.archive-protocol', kind: 'worker', components: ['*'] }),
  Object.freeze({ id: 'WORKER.heatmap-clustering', kind: 'worker', components: ['heatmap'], requirement: 'Heatmap clustering worker', capability: 'worker', evidence: 'heatmap-worker-entrypoint' }),
  Object.freeze({ id: 'WORKER.pca-svd', kind: 'worker', components: ['pca'], requirement: 'PCA SVD worker', capability: 'worker', evidence: 'pca-svd-worker-entrypoint' }),
  Object.freeze({ id: 'WORKER.pca-embedding', kind: 'worker', components: ['pca'], requirement: 'PCA embedding worker', capability: 'worker', evidence: 'pca-embedding-worker-entrypoint' }),
  Object.freeze({ id: 'WORKER.scatter-render-stats', kind: 'worker', components: ['scatter'], requirement: 'Scatter render statistics worker', capability: 'worker', evidence: 'scatter-worker-entrypoint' }),
  Object.freeze({ id: 'STATS.numerical-oracle', kind: 'contract', contract: 'STATS', components: ['*'] }),
  Object.freeze({ id: 'ARCH.static-contracts', kind: 'architecture', components: ['*'] }),
  Object.freeze({ id: 'ARCH.owner-capture-normalization', kind: 'architecture', components: ['*'] }),
  Object.freeze({ id: 'ARCH.hot-paste-scheduling', kind: 'architecture', components: ['*'] })
]);

const SCENARIO_CATALOG = Object.freeze(RAW_SCENARIO_CATALOG.map(scenario => {
  const metadata = REVIEWED_SCENARIO_METADATA[scenario.id];
  return metadata ? Object.freeze({ ...scenario, ...metadata }) : scenario;
}));

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
  '__tests__/unit/testTrendReport.contract.test.js': Object.freeze(['GOVERNANCE.test-trend-report']),
  '__tests__/unit/integrationTeardown.contract.test.js': Object.freeze(['GOVERNANCE.integration-teardown']),
  '__tests__/workers/box.worker.test.js': Object.freeze(['WORKER.box-actions']),
  '__tests__/workers/graphArchive.worker.test.js': Object.freeze(['WORKER.archive-protocol']),
  '__tests__/workers/heatmap.worker.test.js': Object.freeze(['WORKER.heatmap-clustering']),
  '__tests__/workers/pca.worker.test.js': Object.freeze(['WORKER.pca-svd']),
  '__tests__/workers/pca-embed.worker.test.js': Object.freeze(['WORKER.pca-embedding']),
  '__tests__/workers/scatter.worker.test.js': Object.freeze(['WORKER.scatter-render-stats']),
  '__tests__/integration/heatmap.tabContext.test.js': Object.freeze(['OWN.heatmap-tab-context', 'CACHE.heatmap-render-cache-restore', 'PERSIST.heatmap-notes-direct']),
  '__tests__/integration/heavy.canvas.reopen.recovery.regression.test.js': Object.freeze(['CACHE.heavy-canvas-recovery']),
  '__tests__/integration/line.view.test.js': Object.freeze(['OWN.line-view-lifecycle', 'STATS.line-reporting-direct']),
  '__tests__/integration/pca.view.test.js': Object.freeze(['OWN.pca-view-controls', 'PERSIST.pca-data-views-direct', 'STATS.pca-reporting-direct']),
  '__tests__/integration/venn.additionalTabOpen.test.js': Object.freeze(['OWN.venn-tab-opening']),
  'e2e/box/box.column-insert-style-identity.spec.js': Object.freeze(['PERSIST.box-column-style-identity']),
  'e2e/box/box.column-reorder.undo-race.spec.js': Object.freeze(['PERSIST.box-column-reorder-undo']),
  'e2e/box/box.comma-decimal-values.spec.js': Object.freeze(['IMPORT.component-data-import']),
  'e2e/box/box.dual-tab.significance-resize.isolation.spec.js': Object.freeze(['STATS.box-dual-tab-isolation', 'LAYOUT.box-flip-resize']),
  'e2e/box/box.dual-tab.stats-no-crash.spec.js': Object.freeze(['STATS.box-dual-tab-no-crash']),
  'e2e/box/box.duplicate-computed-stats.recalc.spec.js': Object.freeze(['STATS.box-duplicate-recompute']),
  'e2e/box/box.example-control-panel.spec.js': Object.freeze(['OWN.box-example-controls', 'PERSIST.box-notes-direct']),
  'e2e/box/box.flip-axes.tab-isolation.spec.js': Object.freeze(['OWN.box-flip-isolation']),
  'e2e/box/box.flip-axes.tick-length.spec.js': Object.freeze(['LAYOUT.box-axis-role-tick-length']),
  'e2e/box/box.flip-axes.transpose-manual-resize.spec.js': Object.freeze(['LAYOUT.box-flip-resize']),
  'e2e/box/box.formula-editor.spec.js': Object.freeze(['OWN.box-formula-editor']),
  'e2e/box/box.formula-fill-handle.spec.js': Object.freeze(['OWN.box-formula-fill']),
  'e2e/box/box.formula-function-assist.spec.js': Object.freeze(['OWN.box-formula-assist']),
  'e2e/box/box.formula.first-edit-render.regression.spec.js': Object.freeze(['OWN.box-formula-first-render']),
  'e2e/box/box.formula.numeric-edit.regression.spec.js': Object.freeze(['OWN.box-formula-edit']),
  'e2e/box/box.grouped-empty-duplicate-lifecycle.spec.js': Object.freeze(['OWN.box-grouped-lifecycle']),
  'e2e/box/box.grouped-grid-seam.spec.js': Object.freeze(['LAYOUT.box-grouped-grid']),
  'e2e/box/box.horizontal-resize-axis.spec.js': Object.freeze(['LAYOUT.box-horizontal-resize-axis']),
  'e2e/box/box.horizontal-shrink.layout-invariants.spec.js': Object.freeze(['LAYOUT.box-horizontal-shrink']),
  'e2e/box/box.initial-bottom-reserve.spec.js': Object.freeze(['LAYOUT.box-initial-reserve']),
  'e2e/box/box.inline-edit-selection-bg.spec.js': Object.freeze(['OWN.box-inline-edit']),
  '__tests__/unit/productionBootstrap.contract.test.js': Object.freeze(['GOVERNANCE.production-bootstrap-manifest']),
  '__tests__/unit/vendorProvenance.contract.test.js': Object.freeze(['GOVERNANCE.vendor-provenance']),
  '__tests__/unit/impactMap.contract.test.js': Object.freeze(['GOVERNANCE.change-impact-map']),
  '__tests__/unit/componentMutationCatalog.contract.test.js': Object.freeze(['GOVERNANCE.component-mutation-catalog']),
  '__tests__/unit/componentLifecycle.model.test.js': Object.freeze(['UNIT.component-lifecycle-renderability']),
  '__tests__/unit/componentLifecycle.sessionShape.test.js': Object.freeze(['OWN.session-shape-idempotence']),
  '__tests__/unit/componentLifecycle.ownerControlBinding.test.js': Object.freeze(['OWN.component-dom-binding', 'ARCH.semantic-render-impact']),
  '__tests__/integration/componentSessionShape.idempotence.test.js': Object.freeze(['OWN.session-shape-idempotence']),
  '__tests__/architecture/hot.pasteScheduling.contract.test.js': Object.freeze(['ARCH.hot-paste-scheduling']),
  '__tests__/unit/vendorRuntime.smoke.test.js': Object.freeze(['VENDOR.real-npm-runtime']),
  '__tests__/unit/colorSchemes.colorMath.test.js': Object.freeze(['UNIT.color-scheme-math']),
  '__tests__/unit/box.statsTestSelection.model.test.js': Object.freeze(['UNIT.box-statistics-model']),
  '__tests__/unit/dataPipeline.test.js': Object.freeze(['UNIT.data-pipeline']),
  '__tests__/unit/dataTransforms.test.js': Object.freeze(['UNIT.data-transforms']),
  '__tests__/unit/desktopCommands.test.js': Object.freeze(['UNIT.desktop-commands']),
  '__tests__/unit/exampleDatasets.biomedical.test.js': Object.freeze(['UNIT.example-datasets']),
  '__tests__/unit/formulaEngine.test.js': Object.freeze(['UNIT.formula-engine']),
  '__tests__/unit/forecast.regression.test.js': Object.freeze(['UNIT.forecast-regression']),
  '__tests__/unit/regression.reportingNotation.test.js': Object.freeze(['UNIT.regression-reporting']),
  '__tests__/unit/renderCacheSchema.test.js': Object.freeze(['UNIT.render-cache-schema']),
  '__tests__/unit/resampling.contract.test.js': Object.freeze(['UNIT.resampling']),
  '__tests__/unit/scatter.sharedStatisticsPrimitives.test.js': Object.freeze(['UNIT.scatter-statistics-primitives']),
  '__tests__/unit/regression.catalog.test.js': Object.freeze(['UNIT.regression-catalog']),
  '__tests__/unit/stats.adjust.test.js': Object.freeze(['UNIT.stats-adjust']),
  '__tests__/unit/stats.goodnessOfFit.test.js': Object.freeze(['UNIT.stats-goodness-of-fit']),
  '__tests__/unit/stats.pvalue.corrections.test.js': Object.freeze(['UNIT.stats-corrections']),
  '__tests__/unit/svgGeometry.test.js': Object.freeze(['UNIT.svg-geometry']),
  '__tests__/unit/theme.adapters.test.js': Object.freeze(['UNIT.theme-adapters']),
  '__tests__/unit/theme.catalog.test.js': Object.freeze(['UNIT.theme-catalog']),
  '__tests__/unit/theme.compiler.test.js': Object.freeze(['UNIT.theme-compiler']),
  '__tests__/unit/cartesianLayout.test.js': Object.freeze(['UNIT.cartesian-layout']),
  '__tests__/unit/dataViewPersistence.test.js': Object.freeze(['UNIT.data-view-persistence']),
  '__tests__/unit/stringAnalysis.test.js': Object.freeze(['UNIT.string-analysis']),
  '__tests__/unit/uniprot.test.js': Object.freeze(['UNIT.uniprot']),
  '__tests__/unit/graphArchive.adaptiveCompression.test.js': Object.freeze(['UNIT.graph-archive']),
  '__tests__/unit/graphArchive.payloadLiteLoad.test.js': Object.freeze(['UNIT.graph-archive']),
  '__tests__/unit/debug.contract.test.js': Object.freeze(['UNIT.debug-contract']),
  '__tests__/unit/productionWorkspace.contract.test.js': Object.freeze(['UNIT.production-workspace-fixture']),
  '__tests__/unit/contractWaits.contract.test.js': Object.freeze(['UNIT.contract-waits']),
  '__tests__/unit/simple-performance.test.js': Object.freeze(['UNIT.performance-framework']),
  '__tests__/unit/performance.test.js': Object.freeze(['UNIT.performance-framework']),
  '__tests__/unit/box.stats.fallback.test.js': Object.freeze(['UNIT.box-statistics-fallback']),
  '__tests__/unit/chartStyle.axisTicks.buildScale.test.js': Object.freeze(['UNIT.chart-style-axis']),
  '__tests__/unit/chartStyle.axisTicks.logScale.test.js': Object.freeze(['UNIT.chart-style-axis']),
  '__tests__/unit/chartStyle.xAxisEndpointMargins.test.js': Object.freeze(['UNIT.chart-style-axis']),
  '__tests__/unit/chartStyle.formatAxisValue.test.js': Object.freeze(['UNIT.chart-style-formatting']),
  '__tests__/unit/chartStyle.formatScientific.test.js': Object.freeze(['UNIT.chart-style-formatting']),
  '__tests__/dom/box.renderImpact.contract.test.js': Object.freeze(['ARCH.semantic-render-impact']),
  '__tests__/integration/heatmap.renderImpact.contract.test.js': Object.freeze(['ARCH.semantic-render-impact']),
  '__tests__/dom/renderImpact.components.contract.test.js': Object.freeze(['ARCH.semantic-render-impact']),
  '__tests__/unit/renderCacheDiagnostics.contract.test.js': Object.freeze(['UNIT.cache-diagnostics']),
  '__tests__/unit/snapshotPolicy.recoveryParity.test.js': Object.freeze(['UNIT.snapshot-policy']),
  '__tests__/unit/stats.audit.remediation.core.test.js': Object.freeze(['UNIT.stats-remediation-engine']),
  '__tests__/unit/stats.figureSummary.reportingMatrix.test.js': Object.freeze(['UNIT.stats-figure-summary-matrix']),
  '__tests__/unit/stats.audit.remediation.components.test.js': Object.freeze(['UNIT.stats-remediation-components']),
  '__tests__/unit/box.advisor.test.js': Object.freeze(['UNIT.box-advisor']),
  '__tests__/unit/box.assumptions.test.js': Object.freeze(['UNIT.box-assumptions']),
  '__tests__/unit/box.axisAutoScale.test.js': Object.freeze(['UNIT.box-axis-autoscale']),
  '__tests__/unit/box.barNegativeGeometry.test.js': Object.freeze(['UNIT.box-bar-geometry']),
  '__tests__/unit/box.fillColorTheme.test.js': Object.freeze(['UNIT.box-theme-colors']),
  '__tests__/unit/box.pointConnections.test.js': Object.freeze(['UNIT.box-point-connections']),
  '__tests__/unit/box.statsModelOwnership.contract.test.js': Object.freeze(['UNIT.box-stats-model-ownership']),
  '__tests__/unit/box.summary.performance.test.js': Object.freeze(['UNIT.box-summary']),
  '__tests__/unit/box.summaryOverlayColor.test.js': Object.freeze(['UNIT.box-summary']),
  '__tests__/unit/box.swarm.model.test.js': Object.freeze(['UNIT.box-swarm-model']),
  '__tests__/unit/component.load-benchmark.test.js': Object.freeze(['UNIT.component-load-benchmarks']),
  '__tests__/unit/goAnalysis.test.js': Object.freeze(['UNIT.go-analysis']),
  '__tests__/unit/graphArchive.roundtrip.components.test.js': Object.freeze(['UNIT.graph-archive-roundtrip']),
  '__tests__/unit/hot.uiState.test.js': Object.freeze(['UNIT.hot-ui-state']),
  '__tests__/unit/line.regressionOverlaySegmentation.test.js': Object.freeze(['UNIT.line-regression-overlay']),
  '__tests__/unit/line.model.test.js': Object.freeze(['UNIT.line-model-helpers']),
  '__tests__/unit/regression.logisticSummary.test.js': Object.freeze(['UNIT.regression-logistic-summary']),
  '__tests__/unit/roc.classificationSetup.test.js': Object.freeze(['UNIT.roc-classification']),
  '__tests__/integration/roc.renderCacheCapture.test.js': Object.freeze(['CACHE.roc-read-only-capture']),
  '__tests__/integration/box.renderCacheCapture.test.js': Object.freeze(['CACHE.box-read-only-capture']),
  '__tests__/integration/heatmap.renderCacheCapture.test.js': Object.freeze(['CACHE.heatmap-read-only-capture']),
  '__tests__/integration/hist.renderCacheCapture.test.js': Object.freeze(['CACHE.hist-read-only-capture']),
  '__tests__/integration/pca.renderCacheCapture.test.js': Object.freeze(['CACHE.pca-read-only-capture']),
  '__tests__/integration/scatter.renderCacheCapture.test.js': Object.freeze(['CACHE.scatter-read-only-capture']),
  '__tests__/integration/survival.renderCacheCapture.test.js': Object.freeze(['CACHE.survival-read-only-capture']),
  '__tests__/integration/venn.renderCacheCapture.test.js': Object.freeze(['CACHE.venn-read-only-capture']),
  '__tests__/integration/line.renderCacheCapture.test.js': Object.freeze(['CACHE.line-read-only-capture']),
  '__tests__/integration/surface.renderCacheCapture.test.js': Object.freeze(['CACHE.surface-read-only-capture']),
  '__tests__/dom/componentLifecycle.snapshot.test.js': Object.freeze(['DOM.lifecycle-core']),
  '__tests__/unit/scatter.pointContextMenuSelection.test.js': Object.freeze(['UNIT.scatter-context-selection']),
  '__tests__/unit/scatter.pointStyleOverrides.test.js': Object.freeze(['UNIT.scatter-point-style']),
  '__tests__/unit/scatter.regressionOverlayRange.test.js': Object.freeze(['UNIT.scatter-regression-overlay']),
  '__tests__/unit/welcome.example-assets.test.js': Object.freeze(['UNIT.welcome-assets']),
  '__tests__/dom/session.assignTabPayload.assignment-guards.test.js': Object.freeze(['PERSIST.session-payload-write-through']),
  '__tests__/dom/session.assignTabPayload.cache-capture.test.js': Object.freeze(['PERSIST.session-payload-write-through']),
  '__tests__/dom/session.assignTabPayload.dirty-state.test.js': Object.freeze(['PERSIST.session-payload-write-through']),
  '__tests__/dom/session.assignTabPayload.canonical-ui-events.test.js': Object.freeze(['PERSIST.session-payload-write-through']),
  '__tests__/dom/session.assignTabPayload.signature-and-cache-persistence.test.js': Object.freeze(['PERSIST.session-payload-write-through']),
  '__tests__/dom/documentState.recoveryThrottle.test.js': Object.freeze(['REC.document-state-recovery']),
  '__tests__/integration/sessionActions.saveLazyBuild.test.js': Object.freeze(['ARCHIVE.session-save-policies']),
  '__tests__/dom/sessionActions.restoreParity.test.js': Object.freeze(['REC.archive-restore-transaction']),
  '__tests__/dom/colorSchemes.core.test.js': Object.freeze(['DOM.color-scheme-svg']),
  '__tests__/dom/colorSchemes.customChoice.test.js': Object.freeze(['DOM.color-scheme-ownership']),
  '__tests__/dom/colorSchemes.defaultIsolation.test.js': Object.freeze(['DOM.color-scheme-ownership']),
  '__tests__/dom/colorSchemes.undo.test.js': Object.freeze(['DOM.color-scheme-ownership']),
  '__tests__/dom/dom.autoResizeSvg.test.js': Object.freeze(['DOM.svg-sizing']),
  '__tests__/dom/dom.enableLabelDrag.test.js': Object.freeze(['DOM.svg-interaction']),
  '__tests__/dom/dom.enableLegendDrag.test.js': Object.freeze(['DOM.svg-interaction']),
  '__tests__/dom/dom.framePublication.test.js': Object.freeze(['DOM.frame-publication']),
  '__tests__/dom/dom.titleEmptyEdit.test.js': Object.freeze(['DOM.title-editing']),
  '__tests__/dom/exportProjection.contract.test.js': Object.freeze(['DOM.export-projection']),
  '__tests__/dom/visualProjection.test.js': Object.freeze(['DOM.visual-projection']),
  '__tests__/dom/main.components.ensureComponent.test.js': Object.freeze(['DOM.component-registry']),
  '__tests__/dom/domControls.defaultPayloadIsolation.test.js': Object.freeze(['DOM.dom-controls-ownership']),
  '__tests__/dom/domControls.payloadSizingOwnership.test.js': Object.freeze(['DOM.dom-controls-ownership']),
  '__tests__/dom/fontControls.colorParsing.test.js': Object.freeze(['DOM.font-controls']),
  '__tests__/dom/fontControls.debugLogging.test.js': Object.freeze(['DOM.font-controls']),
  '__tests__/dom/fontControls.legendBorder.test.js': Object.freeze(['DOM.font-controls']),
  '__tests__/dom/fontControls.openerClickGuard.test.js': Object.freeze(['DOM.font-controls']),
  '__tests__/dom/fontControls.proportionalFontResize.test.js': Object.freeze(['DOM.font-controls']),
  '__tests__/dom/fontControls.tabIsolation.test.js': Object.freeze(['DOM.font-controls']),
  '__tests__/dom/fontControls.titleVisibility.test.js': Object.freeze(['DOM.font-controls']),
  '__tests__/dom/symbolToolbar.numericFormatting.test.js': Object.freeze(['DOM.symbol-toolbar']),
  '__tests__/dom/styleUndo.test.js': Object.freeze(['DOM.style-undo']),
  '__tests__/dom/workspaceTabs.schedulerIsolation.test.js': Object.freeze(['OWN.scheduler-isolation']),
  '__tests__/dom/workspaceToolbar.numericWheel.test.js': Object.freeze(['DOM.workspace-toolbar-numeric']),
  '__tests__/dom/workspaceToolbar.overflow.test.js': Object.freeze(['DOM.workspace-toolbar-overflow']),
  '__tests__/dom/dendrogramControls.numericWheel.test.js': Object.freeze(['DOM.dendrogram-controls']),
  '__tests__/dom/heatmap.dendrogram-rendering.test.js': Object.freeze(['DOM.heatmap-render-publication']),
  '__tests__/dom/roc.statistics.standard.test.js': Object.freeze(['DOM.roc-statistics-presentation']),
  '__tests__/dom/venn.labelLayout.test.js': Object.freeze(['DOM.venn-label-layout']),
  '__tests__/shared/plot3d.test.js': Object.freeze(['DOM.plot3d-gestures']),
  '__tests__/dom/hist.schedulerOwnership.test.js': Object.freeze(['DOM.hist-scheduler-ownership']),
  '__tests__/dom/gridControls.liveProjection.test.js': Object.freeze(['DOM.grid-controls']),
  '__tests__/dom/significanceControls.overlay.test.js': Object.freeze(['DOM.significance-controls']),
  '__tests__/dom/notes.mountFoldable.test.js': Object.freeze(['DOM.notes']),
  '__tests__/dom/toolbarOverflow.test.js': Object.freeze(['DOM.toolbar-overflow']),
  '__tests__/dom/symbolToolbar.undo.test.js': Object.freeze(['DOM.symbol-toolbar']),
  '__tests__/dom/chartStyle.defaultGraphSize.test.js': Object.freeze(['DOM.chart-style']),
  '__tests__/dom/chartStyle.fontLabel.test.js': Object.freeze(['DOM.chart-style']),
  '__tests__/dom/chartStyle.svgPreparation.test.js': Object.freeze(['DOM.chart-style']),
  '__tests__/dom/chartStyle.fontResize.tabscope.test.js': Object.freeze(['DOM.chart-style']),
  '__tests__/dom/chartStyle.axisResizeMargins.test.js': Object.freeze(['DOM.chart-style']),
  '__tests__/dom/chartStyle.labelOrientation.test.js': Object.freeze(['DOM.chart-style']),
  '__tests__/dom/chartStyle.xAxisLabelAngle.test.js': Object.freeze(['DOM.chart-style']),
  '__tests__/dom/chartStyle.bottomLayout.test.js': Object.freeze(['DOM.chart-style']),
  '__tests__/dom/chartStyle.statsAnnotation.test.js': Object.freeze(['DOM.chart-style']),
  '__tests__/dom/chartStyle.fontResize.test.js': Object.freeze(['DOM.chart-style']),
  '__tests__/dom/chartStyle.legendViewport.test.js': Object.freeze(['DOM.chart-style']),
  '__tests__/dom/chartStyle.pointLabelLayout.test.js': Object.freeze(['DOM.chart-style']),
  '__tests__/dom/publicationStyles.core.test.js': Object.freeze(['DOM.exporter-projection']),
  '__tests__/dom/exporter.dropdownStacking.test.js': Object.freeze(['DOM.exporter-projection']),
  '__tests__/dom/exporter.statsFigureSummary.test.js': Object.freeze(['DOM.exporter-projection']),
  '__tests__/dom/exporter.significanceHitOverlay.test.js': Object.freeze(['DOM.exporter-projection']),
  '__tests__/dom/exporter.hybridSource.test.js': Object.freeze(['DOM.exporter-projection']),
  '__tests__/dom/exporter.physicalProjection.test.js': Object.freeze(['DOM.exporter-projection']),
  '__tests__/dom/exporter.inkscapeUngroupStability.test.js': Object.freeze(['DOM.exporter-projection']),
  '__tests__/dom/exporter.savePicker.test.js': Object.freeze(['DOM.exporter-projection']),
  '__tests__/dom/exporter.firefoxSvgCopy.test.js': Object.freeze(['DOM.exporter-projection']),
  '__tests__/dom/tableImport.formats.test.js': Object.freeze(['DOM.table-import-format-registry']),
  '__tests__/dom/tableImport.firefoxExcelPaste.test.js': Object.freeze(['DOM.table-import-format-registry']),
  '__tests__/dom/tableImport.affordances.test.js': Object.freeze(['DOM.table-import-format-registry', 'DOM.shared-controls']),
  '__tests__/dom/additionalLineControls.pathCompatibility.test.js': Object.freeze(['DOM.shared-controls']),
  '__tests__/dom/axisControls.init.test.js': Object.freeze(['DOM.shared-controls']),
  '__tests__/dom/resizer.canvasReuse.test.js': Object.freeze(['DOM.shared-controls']),
  '__tests__/dom/resizer.optionsMenu.test.js': Object.freeze(['DOM.shared-controls']),
  '__tests__/dom/resizer.panelLayoutPersistence.test.js': Object.freeze(['DOM.shared-controls']),
  '__tests__/dom/componentLayout.zoomBehavior.test.js': Object.freeze(['DOM.shared-controls']),
  '__tests__/dom/jobs.controller.test.js': Object.freeze(['DOM.shared-controls']),
  '__tests__/dom/graphSizing.defaultBaseline.test.js': Object.freeze(['DOM.graph-sizing']),
  '__tests__/dom/stats.reporting.layout.test.js': Object.freeze(['DOM.statistics-projection']),
  '__tests__/dom/stats.reportingNotation.test.js': Object.freeze(['DOM.statistics-projection']),
  '__tests__/dom/stats.figureSummary.state.contract.test.js': Object.freeze(['DOM.statistics-projection']),
  '__tests__/dom/stats.figureSummary.renderer.contract.test.js': Object.freeze(['DOM.statistics-projection']),
  '__tests__/dom/componentLifecycle.ownerPersistence.test.js': Object.freeze(['DOM.lifecycle-ownership']),
  '__tests__/dom/componentLifecycle.core.authority-and-readiness.test.js': Object.freeze(['DOM.lifecycle-core', 'OWN.negative-owner-handoffs']),
  '__tests__/unit/componentLifecycle.negativeOwnerMatrix.test.js': Object.freeze(['OWN.negative-owner-handoffs']),
  '__tests__/dom/componentLifecycle.core.cache-and-editing.test.js': Object.freeze(['DOM.lifecycle-core']),
  '__tests__/dom/componentLifecycle.core.payload-and-async.test.js': Object.freeze(['DOM.lifecycle-core']),
  '__tests__/dom/componentLifecycle.core.runtime-ownership.test.js': Object.freeze(['DOM.lifecycle-core']),
  '__tests__/dom/componentLifecycle.core.restore-and-scheduling.test.js': Object.freeze(['DOM.lifecycle-core']),
  '__tests__/dom/componentLifecycle.core.cleanup-and-publication.test.js': Object.freeze(['DOM.lifecycle-core']),
  '__tests__/dom/componentDrawableFrame.authority.test.js': Object.freeze(['DOM.component-frame-authority']),
  '__tests__/dom/stats.inference.tabIsolation.test.js': Object.freeze(['DOM.statistics-projection']),
  '__tests__/dom/stats.pvalueFormat.tabIsolation.test.js': Object.freeze(['DOM.statistics-projection']),
  '__tests__/dom/theme.runtime.test.js': Object.freeze(['DOM.theme-runtime']),
  '__tests__/dom/pca.pointStyleScopes.test.js': Object.freeze(['DOM.pca-point-styles']),
  '__tests__/dom/pca.preprocessing.test.js': Object.freeze(['DOM.pca-preprocessing']),
  '__tests__/dom/formControls.autosize.test.js': Object.freeze(['DOM.form-controls-autosize']),
  '__tests__/dom/heatmap.model.test.js': Object.freeze(['DOM.heatmap-model-helpers']),
  '__tests__/dom/welcome.ready.test.js': Object.freeze(['DOM.welcome-startup']),
  '__tests__/dom/stats.abbreviations.test.js': Object.freeze(['DOM.stats-formatting']),
  '__tests__/dom/box.liveStyleRefresh.test.js': Object.freeze(['DOM.box-live-style']),
  '__tests__/dom/box.significanceWhiskers.test.js': Object.freeze(['DOM.box-significance-whiskers']),
  '__tests__/dom/box.statsReportingSurface.contract.test.js': Object.freeze(['DOM.box-stats-reporting']),
  '__tests__/dom/box.swarmOffsets.test.js': Object.freeze(['DOM.box-swarm-offsets']),
  '__tests__/dom/colorPicker.toolbarOwnership.test.js': Object.freeze(['DOM.color-picker-toolbar-ownership']),
  '__tests__/dom/dataViews.exportTabs.test.js': Object.freeze(['DOM.data-views-export']),
  '__tests__/dom/exporter.scatterOptimization.test.js': Object.freeze(['DOM.exporter-scatter-optimization']),
  '__tests__/dom/graphArchive.renderCacheSerialization.test.js': Object.freeze(['DOM.graph-archive-render-cache']),
  '__tests__/dom/hist.drawableFrame.test.js': Object.freeze(['DOM.hist-frame']),
  '__tests__/dom/hist.panel-layout.test.js': Object.freeze(['DOM.hist-panel-layout']),
  '__tests__/dom/previews.pngFallback.test.js': Object.freeze(['DOM.previews-png-fallback']),
  '__tests__/dom/requested-defaults.contract.test.js': Object.freeze(['DOM.requested-defaults']),
  '__tests__/dom/scatter.adaptiveSize.test.js': Object.freeze(['DOM.scatter-adaptive-size']),
  '__tests__/dom/tableImport.ownerTransaction.test.js': Object.freeze(['DOM.table-import-owner']),
  '__tests__/dom/tableImport.paste.aggrid.test.js': Object.freeze(['DOM.table-import-aggrid-paste']),
  '__tests__/dom/tableImport.prism.test.js': Object.freeze(['DOM.table-import-prism']),
  '__tests__/dom/tabs.documentOperation.test.js': Object.freeze(['OWN.document-operation-lock']),
  '__tests__/dom/fileIO.activation.test.js': Object.freeze(['DOM.fileio-activation']),
  '__tests__/dom/hot.aggrid.binding.selection-and-payload.test.js': Object.freeze(['DOM.hot-aggrid-binding']),
  '__tests__/dom/hot.aggrid.binding.editor-behavior.test.js': Object.freeze(['DOM.hot-aggrid-binding']),
  '__tests__/dom/hot.aggrid.binding.filters-and-analysis.test.js': Object.freeze(['DOM.hot-aggrid-binding']),
  '__tests__/dom/hot.aggrid.binding.structural-and-scroll.test.js': Object.freeze(['DOM.hot-aggrid-binding']),
  '__tests__/dom/hot.aggrid.clipboard-selection.paste-and-selection.test.js': Object.freeze(['DOM.hot-aggrid-clipboard']),
  '__tests__/dom/hot.aggrid.clipboard-selection.selection-geometry.test.js': Object.freeze(['DOM.hot-aggrid-clipboard']),
  '__tests__/dom/hot.aggrid.clipboard-selection.column-reorder.test.js': Object.freeze(['DOM.hot-aggrid-clipboard']),
  '__tests__/dom/hot.aggrid.clipboard-selection.menus-and-filtering.test.js': Object.freeze(['DOM.hot-aggrid-clipboard']),
  '__tests__/dom/hot.aggrid.clipboard-selection.clipboard.test.js': Object.freeze(['DOM.hot-aggrid-clipboard']),
  '__tests__/dom/hot.aggrid.clipboard-selection.clipboard-undo.test.js': Object.freeze(['DOM.hot-aggrid-clipboard']),
  '__tests__/dom/hot.aggrid.dimensions.test.js': Object.freeze(['DOM.hot-aggrid-dimensions']),
  '__tests__/dom/hot.exclusionPersistence.test.js': Object.freeze(['DOM.hot-exclusions']),
  '__tests__/dom/surface.legendResize.test.js': Object.freeze(['DOM.surface-legend']),
  '__tests__/dom/toolbar.numericWheel.sharedControls.test.js': Object.freeze(['DOM.toolbar-numeric-shared']),
  '__tests__/dom/stats.inference.contract.test.js': Object.freeze(['DOM.stats-formatting']),
  '__tests__/dom/stats.pvalueFormatting.contract.test.js': Object.freeze(['DOM.stats-formatting']),
  '__tests__/dom/stats-table.figureSummary.semantic.test.js': Object.freeze(['DOM.stats-formatting']),
  '__tests__/statistical-oracle/stats.differential.python.test.js': Object.freeze(['STATS.numerical-oracle']),
  '__tests__/statistical-oracle/stats.component.differential.test.js': Object.freeze(['STATS.numerical-oracle']),
  '__tests__/statistical-oracle/stats.matrix.components.test.js': Object.freeze(['STATS.numerical-oracle']),
  '__tests__/statistical-oracle/stats.extended.coverage.test.js': Object.freeze(['STATS.numerical-oracle']),
  '__tests__/statistical-oracle/stats.ui.presentation.branches.test.js': Object.freeze(['STATS.numerical-oracle']),
  '__tests__/statistical-oracle/stats.ui.persistence.restore.test.js': Object.freeze(['STATS.numerical-oracle']),
  '__tests__/architecture/audit.remaining-issues.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/architecture/axis-major-tick-length.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/architecture/axis-toolbar-layout.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/architecture/box.architectureOwnership.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/architecture/box.frameCommit.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/architecture/box.internalSanitation.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/architecture/box.referenceStats.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/architecture/box.statsAspect.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/architecture/box.statsStatePerformance.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/architecture/box.stripDatasetGap.regression.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/architecture/box.stripRadius.regression.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/architecture/component.exportProjectionWiring.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/architecture/componentImportBindings.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/architecture/dataViews.payloadRaw.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/architecture/generateComponentContracts.check.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/architecture/graph.horizontalGutter.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/architecture/graph.exportControlsAlignment.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/architecture/graphArchive.worker.schema.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/architecture/graphFileOwnership.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/architecture/hist.stats-font.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/architecture/letterSpacing.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/unit/ownerPayloadDriver.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/architecture/pca.lifecycleOwnership.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/unit/rocMutation.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/architecture/roc.statsPanelOwnership.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/architecture/runtime.localDependencies.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/architecture/scatter.internalArchitecture.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/architecture/scatter.listenerBinding.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/architecture/statistics.cross-component.regression.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/architecture/stats.inference.components.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/architecture/stats.ownerNormalization.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/architecture/ownerCapture.normalization.contract.test.js': Object.freeze(['ARCH.owner-capture-normalization']),
  '__tests__/architecture/svgComposition.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/architecture/welcome.icons.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/architecture/workers.localDependencies.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/integration/box.layoutReserves.regression.test.js': Object.freeze(['LAYOUT.box-reserve-invariants']),
  '__tests__/integration/box.statsControls.tabIsolation.test.js': Object.freeze(['STATS.box-controls-isolation']),
  '__tests__/integration/format-mixing.test.js': Object.freeze(['BOOTSTRAP.format-toolbar-exclusivity']),
  '__tests__/integration/formControls.autosize.test.js': Object.freeze(['BOOTSTRAP.form-controls-autosize']),
  '__tests__/integration/heatmap.stats.test.js': Object.freeze(['STATS.heatmap-presentation', 'PERSIST.heatmap-data-views-direct']),
  '__tests__/integration/regression.persistence.test.js': Object.freeze(['PERSIST.regression-summary']),
  '__tests__/integration/scatter.statsDefaults.isolation.test.js': Object.freeze(['STATS.scatter-statistics-isolation']),
  '__tests__/integration/smoke.init.test.js': Object.freeze(['BOOTSTRAP.app-initialization']),
  '__tests__/integration/surface.renderCache.test.js': Object.freeze(['CACHE.surface-render-cache', 'STATS.surface-reporting-direct']),
  '__tests__/integration/survival.stats.test.js': Object.freeze(['STATS.survival-pipeline']),
  'e2e/cross-component/component.small-viewport.layout-stability.spec.js': Object.freeze(['LAYOUT.small-viewport-stability']),
  'e2e/workspace/data-toolbar.same-component-activation.spec.js': Object.freeze(['OWN.data-toolbar-activation']),
  '__tests__/workers/shared.test.js': Object.freeze(['WORKER.shared-cancellation']),
  '__tests__/integration/pca.colorScheme.roundTrip.test.js': Object.freeze(['PERSIST.pca-color-scheme-roundtrip']),
  '__tests__/integration/pca.viewCache.test.js': Object.freeze(['CACHE.pca-view-only-rotation']),
  '__tests__/dom/tabSwitch.reuseCache.test.js': Object.freeze(['CACHE.tab-switch-reuse']),
  '__tests__/integration/surface.tabContext.test.js': Object.freeze(['OWN.surface-tab-context']),
  '__tests__/integration/venn.defaultPayloadReset.test.js': Object.freeze(['PERSIST.venn-empty-payload-defaults']),
  '__tests__/integration/venn.tabRuntime.test.js': Object.freeze(['OWN.venn-runtime-isolation']),
  '__tests__/integration/venn.upset.test.js': Object.freeze(['OWN.venn-upset-controls']),
  '__tests__/integration/pie.percentLabels.test.js': Object.freeze(['PERSIST.pie-percent-labels', 'STATS.pie-reporting-direct']),
  '__tests__/integration/pie.tabIsolation.test.js': Object.freeze(['OWN.pie-tab-host-isolation', 'PERSIST.pie-data-views-direct', 'PERSIST.pie-notes-direct', 'CACHE.pie-read-only-capture']),
  '__tests__/integration/tabs.grid.dimensions.test.js': Object.freeze(['OWN.workspace-grid-dimensions']),
  '__tests__/integration/tabs.styleControls.tabIsolation.test.js': Object.freeze(['OWN.style-control-tab-isolation']),
  '__tests__/integration/tabs.componentDomBinding.switchIsolation.test.js': Object.freeze(['OWN.component-dom-binding']),
  '__tests__/integration/tabs.configIsolation.allComponents.test.js': Object.freeze(['OWN.config-isolation.all-components', 'PERSIST.explicit-component-mutations']),
  '__tests__/integration/ui.events.box-line.test.js': Object.freeze(['BOOTSTRAP.ui-events-lazy']),
  '__tests__/integration/ui.events.scatter.test.js': Object.freeze(['BOOTSTRAP.ui-events-lazy']),
  '__tests__/integration/ui.events.histogram-and-statistics.test.js': Object.freeze(['BOOTSTRAP.ui-events-lazy']),
  '__tests__/integration/ui.events.venn.test.js': Object.freeze(['BOOTSTRAP.ui-events-lazy']),
  '__tests__/unit/readiness.contract.test.js': Object.freeze(['OWN.readiness-observability']),
  '__tests__/dom/readinessProjection.contract.test.js': Object.freeze(['OWN.readiness-projection']),
  '__tests__/integration/productionBootstrap.loader.test.js': Object.freeze(['BOOTSTRAP.production-derived-loader']),
  '__tests__/architecture/productionBootstrap.manifest.contract.test.js': Object.freeze(['GOVERNANCE.production-bootstrap-manifest']),
  'e2e/workspace/workspace.smoke.spec.js': Object.freeze(['BOOTSTRAP.browser-smoke']),
  'e2e/ownership/component.same-type-tab-switching.isolation.spec.js': Object.freeze(['OWN.same-type-switching.all-components']),
  'e2e/ownership/component.owner-order.repeated.spec.js': Object.freeze(['OWN.repeated-owner-order']),
  'e2e/ownership/component.same-type-parameter-isolation.spec.js': Object.freeze(['OWN.same-type-switching.all-components', 'PERSIST.explicit-component-mutations']),
  'e2e/ownership/component.persistence-matrix.spec.js': Object.freeze(['PERSIST.explicit-component-mutations', 'MODE.component-persistence-matrix-direct']),
  'e2e/cross-component/cross-browser.feature-matrix.spec.js': Object.freeze(['OWN.cross-browser-feature-matrix', 'PERSIST.grid-clipboard']),
  'e2e/aggrid.firefox-paste.spec.js': Object.freeze(['PERSIST.grid-clipboard']),
  'e2e/aggrid/aggrid.active-tab-paste.spec.js': Object.freeze(['PERSIST.grid-clipboard']),
  'e2e/aggrid/aggrid.edit-overflow.spec.js': Object.freeze(['OWN.ag-grid-edit-overflow']),
  'e2e/aggrid/aggrid.grouped-header-drag-handles.spec.js': Object.freeze(['OWN.ag-grid-grouped-header-ownership']),
  'e2e/aggrid/aggrid.keyboard-navigation.spec.js': Object.freeze(['OWN.ag-grid-keyboard-selection']),
  'e2e/aggrid/aggrid.selection-outline-scrollbar.spec.js': Object.freeze(['LAYOUT.ag-grid-selection-scrollbar']),
  'e2e/aggrid/aggrid.undo-redo.reorder.spec.js': Object.freeze(['PERSIST.ag-grid-column-reorder-undo']),
  'e2e/stats/stats.same-component-isolation-restore.contract.spec.js': Object.freeze(['STATS.same-type-archive-restore', 'PERSIST.stats-archive-restore']),
  'e2e/stats/stats.reopen-presence.contract.spec.js': Object.freeze(['STATS.reopen-presence', 'PERSIST.stats-reopen', 'REC.stats-recovery']),
  'e2e/stats/stats.async-owner-completion.contract.spec.js': Object.freeze(['ASYNC.inactive-owner-completion']),
  'e2e/workspace/style-sync.contract.spec.js': Object.freeze(['PERSIST.style-sync-across-tabs']),
  'e2e/workspace/unsaved-decisions.contract.spec.js': Object.freeze(['OWN.unsaved-close-decisions']),
  'e2e/workspace/tab-reorder.contract.spec.js': Object.freeze(['OWN.workspace-tab-reorder']),
  'e2e/diagnostics/vendor.runtime.smoke.spec.js': Object.freeze(['VENDOR.browser-runtime']),
  'e2e/cross-component/box-pca.table-format-tab-isolation.spec.js': Object.freeze(['PERSIST.table-format-tab-isolation']),
  'e2e/box/box.significance-restore.spec.js': Object.freeze(['STATS.box-significance-restore']),
  'e2e/line/line.uncertainty-band.reopen-recovery.spec.js': Object.freeze(['PERSIST.line-uncertainty-band-reopen']),
  'e2e/scatter/scatter.inline-edit.preview-layer.spec.js': Object.freeze(['OWN.scatter-inline-edit-preview']),
  'e2e/stats/stats.figure-summary.layout.spec.js': Object.freeze(['STATS.figure-summary-layout']),
  'e2e/heatmap/heatmap.exclusions.reopen-recovery.parity.spec.js': Object.freeze(['REC.heatmap-exclusion-archive-parity']),
  'e2e/heatmap/heatmap.label-font-toolbar.spec.js': Object.freeze(['LAYOUT.heatmap-label-font-resize']),
  'e2e/layout/legend.viewport-invariant.spec.js': Object.freeze(['LAYOUT.legend-viewport-invariant']),
  'e2e/layout/legend.font-toolbar.spec.js': Object.freeze(['OWN.legend-font-toolbar']),
  'e2e/box/box.stats-controls-reopen-recovery.spec.js': Object.freeze(['STATS.box-controls-isolation', 'PERSIST.stats-archive-restore', 'REC.stats-recovery']),
  'e2e/layout/font.toolbar.size-no-spin.spec.js': Object.freeze(['DOM.font-controls']),
  'e2e/layout/toolbar.font-visibility.regression.spec.js': Object.freeze(['OWN.font-toolbar-graph-text']),
  'e2e/workspace/data-transform-toolbar.visual.spec.js': Object.freeze(['DOM.shared-controls']),
  'e2e/pca/pca.example-load.cached-rebind.spec.js': Object.freeze(['CACHE.pca-example-rebind']),
  'e2e/pca/pca.legend-content-envelope.spec.js': Object.freeze(['LAYOUT.pca-legend-envelope']),
  'e2e/line/line.3d-example-table-stability.spec.js': Object.freeze(['OWN.line-3d-table-stability']),
  'e2e/line/line.uncertainty-band.tab-isolation.spec.js': Object.freeze(['OWN.line-uncertainty-band-isolation']),
  'e2e/pie/pie.stacked-chart-type.spec.js': Object.freeze(['OWN.pie-chart-type-controls']),
  'e2e/scatter/scatter.example-load.cached-rebind.spec.js': Object.freeze(['CACHE.scatter-example-rebind']),
  'e2e/recovery/reopen.graph-edit-cache-invalidation.spec.js': Object.freeze(['CACHE.reopened-first-interaction']),
  'e2e/box/box.dark-theme.stats.regression.spec.js': Object.freeze(['STATS.box-dark-theme-regression']),
  'e2e/layout/legend-3d-drag.spec.js': Object.freeze(['OWN.legend-3d-drag']),
  'e2e/recovery/recovery.primary-graph-publication.spec.js': Object.freeze(['REC.primary-graph-publication']),
  'e2e/recovery/recovery.single-tab.e2e.spec.js': Object.freeze(['REC.single-tab-recovery-checkpoint']),
  'e2e/recovery/reopen.redraw-on-data-change.spec.js': Object.freeze(['REC.reopen-data-redraw']),
  'e2e/layout/axis.tick-label-optical-clearance.spec.js': Object.freeze(['LAYOUT.axis-tick-label-optical-clearance']),
  'e2e/layout/axis.log-notation.uniform.spec.js': Object.freeze(['LAYOUT.axis-tick-label-optical-clearance']),
  'e2e/layout/axis-major-tick-length.reopen-recovery.spec.js': Object.freeze(['PERSIST.axis-major-tick-length-reopen']),
  'e2e/workspace/dataview-lite-archive.persistence.spec.js': Object.freeze(['PERSIST.dataview-lite-archive']),
  'e2e/workspace/prism.multi-dataset-import.spec.js': Object.freeze(['IMPORT.prism-multi-dataset']),
  'e2e/layout/export.format-dimensions.spec.js': Object.freeze(['EXPORT.format-dimensions']),
  'e2e/layout/cartesian.proactive-x-label-reserve.spec.js': Object.freeze(['LAYOUT.cartesian-x-label-reserve']),
  'e2e/diagnostics/box-scatter.render-cache-lifecycle.diagnostic.spec.js': Object.freeze(['DIAGNOSTIC.render-cache-lifecycle']),
  'e2e/workspace/workspace.exercise.spec.js': Object.freeze(['DIAGNOSTIC.component-exercise']),
  'e2e/workspace/welcome.example-persistence.spec.js': Object.freeze(['PERSIST.welcome-example-persistence']),
  'e2e/layout/x-axis-label-angle.layout.spec.js': Object.freeze(['LAYOUT.axis-tick-label-angle']),
  'e2e/layout/x-axis-label-angle.reopen-recovery.spec.js': Object.freeze(['PERSIST.axis-tick-label-angle-reopen']),
  'e2e/layout/x-axis-label-angle.tab-isolation.spec.js': Object.freeze(['OWN.axis-tick-label-angle-isolation']),
  'e2e/box/box.large-resize-live-svg.spec.js': Object.freeze(['LAYOUT.box-reserve-invariants', 'LAYOUT.component-resize-persistence']),
  'e2e/box/box.live-style-redraw.spec.js': Object.freeze(['OWN.style-control-tab-isolation', 'DOM.box-live-style']),
  'e2e/box/box.loading-overlay.stop.spec.js': Object.freeze(['ASYNC.job-cancellation', 'ASYNC.inactive-owner-completion']),
  'e2e/box/box.opacity-style-tab-isolation.spec.js': Object.freeze(['OWN.style-control-tab-isolation']),
  'e2e/box/box.significance-layout.spec.js': Object.freeze(['STATS.box-significance-restore', 'LAYOUT.box-reserve-invariants']),
  'e2e/box/box.single-values-point-size-resize.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'LAYOUT.box-reserve-invariants']),
  'e2e/box/box.stats-custom-pairs.spec.js': Object.freeze(['STATS.component-reporting', 'STATS.box-controls-isolation']),
  'e2e/box/box.stats-performance.regression.spec.js': Object.freeze(['STATS.box-controls-isolation', 'UNIT.performance-framework']),
  'e2e/box/box.stats-reporting-sections.regression.spec.js': Object.freeze(['STATS.component-reporting', 'STATS.box-significance-restore']),
  'e2e/box/box.stats-test-selection.regression.spec.js': Object.freeze(['STATS.box-controls-isolation']),
  'e2e/box/box.title-new-tab-isolation.spec.js': Object.freeze(['OWN.same-type-switching.all-components', 'OWN.style-control-tab-isolation']),
  'e2e/layout/canvas-tab-preview.spec.js': Object.freeze(['CACHE.preview-reuse', 'CACHE.tab-switch-reuse']),
  'e2e/ownership/component.duplicate-reuse.payload-fidelity.spec.js': Object.freeze(['PERSIST.component-reopen-fidelity', 'CACHE.tab-switch-reuse']),
  'e2e/ownership/component.resize-exit-reenter.persistence.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'PERSIST.component-reopen-fidelity']),
  'e2e/ownership/component.same-type-dual-preview.spec.js': Object.freeze(['OWN.same-type-switching.all-components', 'CACHE.preview-reuse']),
  'e2e/ownership/component.same-type-second-tab.undo-redo.hot.spec.js': Object.freeze(['OWN.same-type-switching.all-components', 'PERSIST.session-payload-write-through']),
  'e2e/ownership/component.same-type-tab-resize-switch.isolation.spec.js': Object.freeze(['OWN.same-type-switching.all-components', 'LAYOUT.component-resize-persistence']),
  'e2e/ownership/component.second-tab.manual-resize-undo-redo.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'PERSIST.session-payload-write-through']),
  'e2e/layout/dark-theme.resize-text.spec.js': Object.freeze(['OWN.style-control-tab-isolation', 'LAYOUT.component-resize-persistence']),
  'e2e/workspace/data-aware-defaults.spec.js': Object.freeze(['PERSIST.explicit-component-mutations', 'DOM.requested-defaults']),
  'e2e/workspace/document-open.transaction.spec.js': Object.freeze(['ARCHIVE.session-save-policies', 'REC.archive-restore-transaction']),
  'e2e/layout/export.physical-projection.all-components.spec.js': Object.freeze(['EXPORT.component-artifact', 'EXPORT.format-dimensions']),
  'e2e/layout/graph-axis-resize-invariants.spec.js': Object.freeze(['LAYOUT.axis-tick-label-optical-clearance', 'LAYOUT.component-resize-persistence']),
  'e2e/layout/graph-loading-overlay.empty-tabs.spec.js': Object.freeze(['OWN.readiness-observability', 'ASYNC.job-cancellation']),
  'e2e/layout/graph-resize-undo.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'PERSIST.session-payload-write-through']),
  'e2e/layout/graph-sizing.owner-isolation.spec.js': Object.freeze(['OWN.negative-owner-handoffs', 'OWN.same-type-switching.all-components', 'LAYOUT.component-resize-persistence']),
  'e2e/layout/graph.atomic-publication.spec.js': Object.freeze(['REC.primary-graph-publication', 'OWN.readiness-projection']),
  'e2e/layout/graph.cross-viewport-reopen.spec.js': Object.freeze(['PERSIST.component-reopen-fidelity', 'LAYOUT.component-resize-persistence']),
  'e2e/workspace/config-panel.fieldset-containment.spec.js': Object.freeze(['LAYOUT.legend-label-reserve', 'LAYOUT.component-resize-persistence']),
  'e2e/layout/graph.export-controls-layout.spec.js': Object.freeze(['EXPORT.component-artifact', 'EXPORT.format-dimensions']),
  'e2e/layout/graph.live-resize.spec.js': Object.freeze(['LAYOUT.component-resize-persistence']),
  'e2e/layout/graph.live-style.spec.js': Object.freeze(['OWN.style-control-tab-isolation', 'DOM.style-undo']),
  'e2e/layout/graph.zoom-redraw.spec.js': Object.freeze(['LAYOUT.zoom-redraw', 'OWN.readiness-projection'])
  ,'e2e/heatmap/heatmap.adjust-filter.responsiveness.spec.js': Object.freeze(['ASYNC.job-cancellation', 'OWN.readiness-observability'])
  ,'e2e/heatmap/heatmap.color-scale-spacing.spec.js': Object.freeze(['OWN.style-control-tab-isolation', 'LAYOUT.legend-label-reserve'])
  ,'e2e/heatmap/heatmap.correlation-tab-restore.spec.js': Object.freeze(['OWN.heatmap-tab-context', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/heatmap/heatmap.data-values.label-scaling.spec.js': Object.freeze(['LAYOUT.legend-label-reserve', 'OWN.style-control-tab-isolation'])
  ,'e2e/heatmap/heatmap.dual-tab.example.spec.js': Object.freeze(['OWN.heatmap-tab-context', 'OWN.same-type-switching.all-components'])
  ,'e2e/heatmap/heatmap.duplicate-reuse.headers-view-switch.spec.js': Object.freeze(['CACHE.tab-switch-reuse', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/heatmap/heatmap.first-heavy-paste.owner-transaction.spec.js': Object.freeze(['ASYNC.job-cancellation', 'PERSIST.session-payload-write-through'])
  ,'e2e/heatmap/heatmap.graph-scope-font-size.spec.js': Object.freeze(['OWN.style-control-tab-isolation', 'LAYOUT.component-resize-persistence'])
  ,'e2e/heatmap/heatmap.heavy-recovery-authoritative.spec.js': Object.freeze(['CACHE.heavy-canvas-recovery', 'REC.archive-recovery-matrix'])
  ,'e2e/heatmap/heatmap.heavy-small-tab-isolation.spec.js': Object.freeze(['CACHE.heavy-canvas-recovery', 'OWN.same-type-switching.all-components'])
  ,'e2e/heatmap/heatmap.large-data-values.responsiveness.spec.js': Object.freeze(['ASYNC.job-cancellation', 'CACHE.heavy-canvas-recovery'])
  ,'e2e/heatmap/heatmap.legend-height.spec.js': Object.freeze(['LAYOUT.legend-label-reserve'])
  ,'e2e/heatmap/heatmap.live-resize.text-stability.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'OWN.readiness-projection'])
  ,'e2e/heatmap/heatmap.mixed-export.spec.js': Object.freeze(['EXPORT.component-artifact', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/heatmap/heatmap.reopen-recovery.geometry.spec.js': Object.freeze(['PERSIST.component-reopen-fidelity', 'REC.archive-recovery-matrix'])
  ,'e2e/heatmap/heatmap.summary-resize-frame.spec.js': Object.freeze(['STATS.figure-summary-layout', 'LAYOUT.component-resize-persistence'])
  ,'e2e/heatmap/heatmap.tab-preview-fidelity.spec.js': Object.freeze(['CACHE.preview-reuse', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/heatmap/heatmap.title-clearance.spec.js': Object.freeze(['LAYOUT.axis-tick-label-optical-clearance', 'LAYOUT.legend-label-reserve'])
  ,'e2e/heatmap/heatmap.title-drag-speed.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'OWN.toolbar-control-isolation'])
  ,'e2e/heatmap/heatmap.title-inline-edit-background.spec.js': Object.freeze(['OWN.style-control-tab-isolation', 'OWN.toolbar-control-isolation'])
  ,'e2e/heatmap/heatmap.view-switch-lock-ratio.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/recovery/heavy.mixed-tabs.reopen-recovery.canvas.spec.js': Object.freeze(['CACHE.heavy-canvas-recovery', 'REC.archive-recovery-matrix'])
  ,'e2e/hist/hist.frequency-distribution-autodraw-tab-isolation.spec.js': Object.freeze(['OWN.same-type-switching.all-components', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/hist/hist.multiseries-legend-aspect.spec.js': Object.freeze(['LAYOUT.legend-label-reserve', 'LAYOUT.component-resize-persistence'])
  ,'e2e/hist/hist.panel-layout.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'STATS.component-reporting', 'STATS.hist-reporting-direct'])
  ,'e2e/hist/hist.recovery-first-resize.spec.js': Object.freeze(['REC.single-tab-recovery-checkpoint', 'LAYOUT.component-resize-persistence'])
  ,'e2e/ownership/inactive-payload-capture-isolation.spec.js': Object.freeze(['OWN.negative-owner-handoffs', 'OWN.same-type-switching.all-components', 'PERSIST.session-payload-write-through'])
  ,'e2e/layout/label.viewport-boundary.spec.js': Object.freeze(['LAYOUT.legend-label-reserve', 'OWN.readiness-projection'])
  ,'e2e/layout/legend.drag-viewport-bounds.spec.js': Object.freeze(['LAYOUT.legend-viewport-invariant', 'LAYOUT.legend-label-reserve'])
  ,'e2e/line/line-hist.axis-resize-tab-isolation.spec.js': Object.freeze(['PERSIST.axis-major-tick-length-reopen', 'LAYOUT.component-resize-persistence'])
  ,'e2e/line/line-scatter.3d-rotation-tab-switch.spec.js': Object.freeze(['OWN.legend-3d-drag', 'OWN.same-type-switching.all-components'])
  ,'e2e/line/line.3d-initial-aspect.spec.js': Object.freeze(['OWN.legend-3d-drag', 'LAYOUT.component-resize-persistence'])
  ,'e2e/line/line.column-insert-style-identity.spec.js': Object.freeze(['PERSIST.session-payload-write-through', 'OWN.style-control-tab-isolation'])
  ,'e2e/line/line.errorbar-toolbar.spec.js': Object.freeze(['OWN.toolbar-control-isolation', 'OWN.line-view-lifecycle'])
  ,'e2e/line/line.header.sort-drag.spec.js': Object.freeze(['OWN.component-transition-boundary', 'PERSIST.session-payload-write-through'])
  ,'e2e/line/line.reopen-horizontal-resize-axis.spec.js': Object.freeze(['PERSIST.component-reopen-fidelity', 'LAYOUT.component-resize-persistence'])
  ,'e2e/line/line.selection-outline.pinned-first-column.spec.js': Object.freeze(['OWN.component-transition-boundary', 'PERSIST.grid-clipboard'])
  ,'e2e/layout/lock-ratio-axis-geometry.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'LAYOUT.axis-tick-label-optical-clearance'])
  ,'e2e/layout/lock-ratio-subtype-enforcement.spec.js': Object.freeze(['OWN.component-transition-boundary', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/layout/panel-layout.tab-switch.spec.js': Object.freeze(['OWN.same-type-switching.all-components', 'LAYOUT.component-resize-persistence'])
  ,'e2e/pca/pca.3d-rotation-restore.spec.js': Object.freeze(['OWN.legend-3d-drag', 'CACHE.reopened-first-interaction', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/pca/pca.default-plot-height.spec.js': Object.freeze(['LAYOUT.component-resize-persistence'])
  ,'e2e/pca/pca.label-toggle.regression.spec.js': Object.freeze(['OWN.style-control-tab-isolation', 'OWN.pca-view-controls'])
  ,'e2e/pca/pca.large-import-transaction.spec.js': Object.freeze(['IMPORT.component-data-import', 'ASYNC.job-cancellation'])
  ,'e2e/pca/pca.metric-geometry.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'LAYOUT.axis-tick-label-optical-clearance'])
  ,'e2e/pca/pca.standard-example.spec.js': Object.freeze(['OWN.pca-view-controls', 'CACHE.pca-example-rebind'])
  ,'e2e/pca/pca.stats-restore.spec.js': Object.freeze(['STATS.same-type-archive-restore', 'PERSIST.stats-reopen', 'STATS.pca-reporting-direct', 'PERSIST.pca-data-views-direct'])
  ,'e2e/pie/pie.dataviews-color-label-resize-isolation.spec.js': Object.freeze(['PERSIST.notes-and-dataviews', 'LAYOUT.component-resize-persistence', 'PERSIST.pie-data-views-direct', 'PERSIST.pie-notes-direct'])
  ,'e2e/pie/pie.legend-resize.diagnostic.spec.js': Object.freeze(['LAYOUT.legend-viewport-invariant', 'LAYOUT.legend-label-reserve'])
  ,'e2e/pie/pie.stacked-live-resize-flicker.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'OWN.readiness-projection'])
  ,'e2e/pie/pie.stacked-rotated-label-reserve.spec.js': Object.freeze(['LAYOUT.legend-label-reserve', 'LAYOUT.component-resize-persistence'])
  ,'e2e/pie/pie.stats-example.spec.js': Object.freeze(['STATS.component-reporting', 'PERSIST.stats-reopen', 'STATS.pie-reporting-direct'])
  ,'e2e/layout/plot3d.viewport-containment.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'OWN.legend-3d-drag'])
  ,'e2e/recovery/recovery.canonical-journal.spec.js': Object.freeze(['REC.archive-recovery-matrix', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/recovery/recovery.graph-view-controls.spec.js': Object.freeze(['REC.document-state-recovery', 'OWN.toolbar-control-isolation'])
  ,'e2e/recovery/recovery.no-loop.spec.js': Object.freeze(['REC.single-tab-recovery-checkpoint'])
  ,'e2e/recovery/recovery.single-tab.live-capture.spec.js': Object.freeze(['REC.document-state-recovery', 'PERSIST.session-payload-write-through'])
  ,'e2e/layout/redraw.audit.spec.js': Object.freeze(['OWN.readiness-projection', 'OWN.component-transition-boundary'])
  ,'e2e/layout/release-rendering-smoke.spec.js': Object.freeze(['EXPORT.component-artifact', 'EXPORT.format-dimensions'])
  ,'e2e/cache/render-cache.persistence-contract.spec.js': Object.freeze(['CACHE.reopened-first-interaction', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/cache/roc-box.render-cache-reopen.spec.js': Object.freeze(['CACHE.reopened-first-interaction', 'REC.stats-recovery'])
  ,'e2e/roc/roc.advisor-compare-tab-isolation.spec.js': Object.freeze(['STATS.component-reporting', 'OWN.same-type-switching.all-components'])
  ,'e2e/roc/roc.classification-ui.spec.js': Object.freeze(['UNIT.roc-classification', 'STATS.component-reporting'])
  ,'e2e/roc/roc.default-axis-geometry.spec.js': Object.freeze(['LAYOUT.axis-tick-label-optical-clearance', 'LAYOUT.component-resize-persistence'])
  ,'e2e/roc/roc.graph-type-reopen.spec.js': Object.freeze(['PERSIST.component-reopen-fidelity', 'STATS.component-reporting'])
  ,'e2e/roc/roc.legend-layout.regression.spec.js': Object.freeze(['LAYOUT.legend-viewport-invariant', 'LAYOUT.legend-label-reserve'])
  ,'e2e/roc/roc.scheduled-autodraw-tab-isolation.spec.js': Object.freeze(['OWN.scheduler-isolation', 'OWN.same-type-switching.all-components'])
  ,'e2e/roc/roc.single-curve-stats-overlay.spec.js': Object.freeze(['STATS.component-reporting', 'STATS.reopen-presence', 'STATS.roc-reporting-direct'])
  ,'e2e/layout/rotation.recovery-interlock.spec.js': Object.freeze(['REC.archive-recovery-matrix', 'OWN.legend-3d-drag', 'CACHE.reopened-first-interaction'])
  ,'e2e/cross-component/scatter-line.live-horizontal-resize-comparison.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'OWN.same-type-switching.all-components'])
  ,'e2e/scatter/scatter.2d-3d-controls.isolation.spec.js': Object.freeze(['OWN.component-transition-boundary', 'OWN.style-control-tab-isolation', 'OWN.scatter-3d-direct'])
  ,'e2e/scatter/scatter.3d-example-table-stability.spec.js': Object.freeze(['OWN.legend-3d-drag', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/scatter/scatter.3d-view.color-scheme-persists.spec.js': Object.freeze(['OWN.style-control-tab-isolation', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/scatter/scatter.close-tab-dispose-loop.spec.js': Object.freeze(['OWN.component-transition-boundary', 'ASYNC.job-cancellation'])
  ,'e2e/scatter/scatter.color-scheme-grid-isolation.spec.js': Object.freeze(['OWN.style-control-tab-isolation', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/scatter/scatter.csv-import.mixed-tabs.reopen.spec.js': Object.freeze(['IMPORT.component-data-import', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/scatter/scatter.comma-decimal-values.spec.js': Object.freeze(['IMPORT.component-data-import'])
  ,'e2e/scatter/scatter.default-table-headers.spec.js': Object.freeze(['OWN.component-transition-boundary', 'PERSIST.session-payload-write-through'])
  ,'e2e/scatter/scatter.duplicate-reuse.stats-trendline.spec.js': Object.freeze(['PERSIST.component-reopen-fidelity', 'STATS.component-reporting'])
  ,'e2e/scatter/scatter.empty-plot-notice.spec.js': Object.freeze(['OWN.readiness-observability', 'OWN.readiness-projection'])
  ,'e2e/scatter/scatter.exponential-trend-autoscale.spec.js': Object.freeze(['STATS.component-reporting', 'LAYOUT.component-resize-persistence'])
  ,'e2e/scatter/scatter.formula-evaluation.spec.js': Object.freeze(['OWN.scatter-inline-edit-preview', 'PERSIST.session-payload-write-through'])
  ,'e2e/scatter/scatter.global-shape-undo.spec.js': Object.freeze(['OWN.style-control-tab-isolation', 'PERSIST.session-payload-write-through'])
  ,'e2e/scatter/scatter.horizontal-resize-axis.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'LAYOUT.axis-tick-label-optical-clearance'])
  ,'e2e/scatter/scatter.loading-overlay.threshold.spec.js': Object.freeze(['ASYNC.job-cancellation', 'OWN.readiness-observability'])
  ,'e2e/scatter/scatter.manual-view-refresh.spec.js': Object.freeze(['OWN.readiness-projection', 'OWN.component-transition-boundary'])
  ,'e2e/scatter/scatter.overlay-controls.stats-gating.spec.js': Object.freeze(['STATS.component-reporting', 'OWN.readiness-projection'])
  ,'e2e/scatter/scatter.panel-resizer.undo-entry-count.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'PERSIST.session-payload-write-through'])
  ,'e2e/scatter/scatter.point-label-drag.spec.js': Object.freeze(['PERSIST.component-reopen-fidelity', 'OWN.style-control-tab-isolation'])
  ,'e2e/scatter/scatter.pvalue-formatting.spec.js': Object.freeze(['STATS.component-reporting'])
  ,'e2e/scatter/scatter.reopen.trendline-persists.spec.js': Object.freeze(['PERSIST.regression-summary', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/scatter/scatter.second-tab.resize-undo-routing.spec.js': Object.freeze(['OWN.same-type-switching.all-components', 'LAYOUT.component-resize-persistence'])
  ,'e2e/scatter/scatter.second-tab.undo-debug.spec.js': Object.freeze(['OWN.same-type-switching.all-components', 'PERSIST.session-payload-write-through'])
  ,'e2e/scatter/scatter.stats-trendline-resize.live-update.spec.js': Object.freeze(['STATS.component-reporting', 'LAYOUT.component-resize-persistence'])
  ,'e2e/scatter/scatter.tab-grid-leak.repro.spec.js': Object.freeze(['OWN.same-type-switching.all-components', 'PERSIST.grid-clipboard'])
  ,'e2e/stats/stats-annotation.bounds-and-font.spec.js': Object.freeze(['STATS.figure-summary-layout', 'LAYOUT.legend-label-reserve'])
  ,'e2e/stats/stats.archive-reopen-tab-switch.persistence.spec.js': Object.freeze(['PERSIST.stats-archive-restore', 'OWN.same-type-switching.all-components'])
  ,'e2e/stats/stats.figure-summary.font-toolbar.spec.js': Object.freeze(['STATS.figure-summary-layout', 'OWN.toolbar-control-isolation'])
  ,'e2e/stats/stats.figure-summary.live-resize.spec.js': Object.freeze(['STATS.figure-summary-layout', 'LAYOUT.component-resize-persistence'])
  ,'e2e/stats/stats.figure-summary.reopen-recovery.spec.js': Object.freeze(['STATS.figure-summary-layout', 'REC.archive-recovery-matrix'])
  ,'e2e/stats/stats.figure-summary.tab-isolation.spec.js': Object.freeze(['STATS.figure-summary-layout', 'OWN.same-type-switching.all-components'])
  ,'e2e/stats/stats.inference.tab-isolation.spec.js': Object.freeze(['STATS.component-reporting', 'OWN.same-type-switching.all-components'])
  ,'e2e/stats/stats.owner-panel.additional-components.contract.spec.js': Object.freeze(['STATS.component-reporting', 'OWN.component-transition-boundary'])
  ,'e2e/stats/stats.restore-roundtrip.spec.js': Object.freeze(['PERSIST.stats-reopen', 'REC.archive-recovery-matrix'])
  ,'e2e/layout/structural-redraw.loading-overlay.spec.js': Object.freeze(['ASYNC.job-cancellation', 'OWN.readiness-observability'])
  ,'e2e/surface/surface.legend-fixed-height.spec.js': Object.freeze(['LAYOUT.legend-label-reserve', 'OWN.surface-tab-context'])
  ,'e2e/surface/surface.live-resize-stability.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'OWN.surface-tab-context'])
  ,'e2e/surface/surface.recovery-rotation.spec.js': Object.freeze(['CACHE.surface-render-cache', 'REC.archive-recovery-matrix', 'OWN.legend-3d-drag', 'OWN.surface-3d-direct'])
  ,'e2e/surface/surface.rotation-size-stability.spec.js': Object.freeze(['CACHE.surface-render-cache', 'LAYOUT.component-resize-persistence'])
  ,'e2e/surface/surface.settings-dataviews-manual-overlay-tab-isolation.spec.js': Object.freeze(['PERSIST.notes-and-dataviews', 'OWN.same-type-switching.all-components', 'PERSIST.surface-data-views-direct', 'PERSIST.surface-notes-direct'])
  ,'e2e/surface/surface.svgbox-right-margin.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'LAYOUT.legend-label-reserve'])
  ,'e2e/cross-component/survival-roc-hist.dataviews-notes-isolation.spec.js': Object.freeze(['PERSIST.notes-and-dataviews', 'OWN.same-type-switching.all-components', 'PERSIST.component-dataviews-direct', 'PERSIST.component-notes-direct'])
  ,'e2e/survival/survival.covariate-reopen-tab-isolation.spec.js': Object.freeze(['PERSIST.component-reopen-fidelity', 'STATS.component-reporting'])
  ,'e2e/survival/survival.notes-position.spec.js': Object.freeze(['PERSIST.notes-and-dataviews', 'LAYOUT.component-resize-persistence', 'PERSIST.survival-notes-direct'])
  ,'e2e/survival/survival.risk-table-layout.spec.js': Object.freeze(['STATS.component-reporting', 'LAYOUT.component-resize-persistence'])
  ,'e2e/survival/survival.same-type-reopen-isolation.spec.js': Object.freeze(['OWN.same-type-switching.all-components', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/survival/survival.style-report-deferred-isolation.spec.js': Object.freeze(['OWN.style-control-tab-isolation', 'STATS.component-reporting'])
  ,'e2e/cache/tab-preview-components.spec.js': Object.freeze(['CACHE.preview-reuse', 'OWN.same-type-switching.all-components'])
  ,'e2e/layout/title-empty-edit.restore.spec.js': Object.freeze(['PERSIST.component-reopen-fidelity', 'OWN.toolbar-control-isolation'])
  ,'e2e/layout/title-visibility.all-components.spec.js': Object.freeze(['OWN.style-control-tab-isolation', 'LAYOUT.legend-label-reserve'])
  ,'e2e/layout/toolbar.color-picker-ownership.spec.js': Object.freeze(['DOM.color-picker-toolbar-ownership', 'OWN.toolbar-control-isolation'])
  ,'e2e/layout/toolbar.general-vs-data.regression.spec.js': Object.freeze(['OWN.toolbar-control-isolation', 'OWN.data-toolbar-activation'])
  ,'e2e/layout/toolbar.numeric-wheel-gesture.spec.js': Object.freeze(['OWN.toolbar-control-isolation', 'PERSIST.session-payload-write-through'])
  ,'e2e/layout/toolbar.overflow.spec.js': Object.freeze(['DOM.toolbar-overflow', 'OWN.toolbar-control-isolation'])
  ,'e2e/venn/venn.exclusions-welcome.spec.js': Object.freeze(['OWN.venn-runtime-isolation', 'PERSIST.welcome-example-persistence'])
  ,'e2e/venn/venn.go-string.async-tab-isolation.spec.js': Object.freeze(['OWN.venn-runtime-isolation', 'ASYNC.job-cancellation', 'ASYNC.venn-analysis-owner'])
  ,'e2e/venn/venn.notes.persistence.spec.js': Object.freeze(['PERSIST.notes-and-dataviews', 'OWN.same-type-switching.all-components', 'PERSIST.venn-notes-direct'])
  ,'e2e/venn/venn.label-layout.spec.js': Object.freeze(['DOM.venn-label-layout', 'LAYOUT.legend-label-reserve'])
  ,'e2e/venn/venn.list-cache-region-tab-isolation.spec.js': Object.freeze(['OWN.venn-runtime-isolation', 'CACHE.tab-switch-reuse'])
  ,'e2e/venn/venn.paste-scroll.spec.js': Object.freeze(['PERSIST.grid-clipboard', 'OWN.venn-runtime-isolation'])
  ,'e2e/venn/venn.restore-recovery.spec.js': Object.freeze(['PERSIST.component-reopen-fidelity', 'REC.archive-recovery-matrix'])
  ,'e2e/venn/venn.table-column-persistence.spec.js': Object.freeze(['PERSIST.session-payload-write-through', 'OWN.venn-runtime-isolation'])
  ,'e2e/venn/venn.upset-numeric-species-reopen-isolation.spec.js': Object.freeze(['OWN.venn-upset-controls', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/venn/venn.upset.controls-layout.spec.js': Object.freeze(['OWN.venn-upset-controls', 'LAYOUT.component-resize-persistence'])
  ,'e2e/venn/venn.upset.live-resize.text-stability.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'OWN.readiness-projection'])
  ,'e2e/workspace/welcome.first-frame.spec.js': Object.freeze(['DOM.welcome-startup', 'OWN.readiness-observability'])
  ,'e2e/workspace/welcome.icons.contract.spec.js': Object.freeze(['ARCH.static-contracts', 'DOM.welcome-startup'])
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
