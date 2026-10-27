'use strict';

const REVIEWED_SCENARIO_METADATA = Object.freeze({
  'ARCHIVE.welcome-drop-save-target': Object.freeze({ requirement: 'Welcome graph drops acquire the native file handle during the drop event and retain it through delayed Save; unavailable handles preserve readable data, dirty edits and explicit Save As guidance', capability: 'dropped-file-save', evidence: 'native-chromium-file-drop-delayed-toolbar-save-and-unsupported-null-rejected-handle-contract', setup: 'ui', transition: 'native-file-drop-open-edit-expire-gesture-toolbar-save', environment: 'real-vendor-chromium-native-file-handle-with-mocked-permission-and-write' }),
  'ARCHIVE.save-picker-before-preparation': Object.freeze({ requirement: 'First Save and Save As choose a destination before capture; cancellation does no preparation and failures never write or mark saved; replacement and tab ownership remain isolated', capability: 'destination-first-save', evidence: 'picker-order-cancel-failure-replacement-dom-and-three-toolbar-save-modes-chromium', setup: 'mixed', transition: 'first-save-save-as-picker-prepare-write-cancel-replace', environment: 'jsdom-and-real-vendor-chromium-with-mocked-file-picker' }),
  'ARCHIVE.reopened-write-permission': Object.freeze({ requirement: 'Reopened files acquire write permission during the Save click before slow checkpoint preparation; permission waits preserve document ownership and revision dirtiness', capability: 'existing-file-save', evidence: 'permission-expiry-replacement-revision-dom-and-toolbar-chromium-contract', setup: 'mixed', transition: 'archive-reopen-toolbar-save-slow-capture-existing-file-write', environment: 'jsdom-and-real-vendor-chromium-with-mocked-file-handle' }),
  'REC.background-preparation': Object.freeze({ requirement: 'Background preparation never activates inactive tabs and publishes only exact owner snapshots; first restored presentation is complete; workload predictions show feedback immediately or stay silent, retained views are inert and isolated, and highlight/content commit together', capability: 'owner-scoped-preparation', evidence: 'sliced-copy-prediction-timing-retained-shadow-presentation-and-real-browser-reopen-recovery', setup: 'mixed', transition: 'open-prepare-switch-close-replace-fast-slow-error', environment: 'jest-and-real-vendor-chromium' }),
  'STATS.box-advisor-plan-parity': Object.freeze({ requirement:'Box advice names and applies the exact engine test, validates grouped subject structure, and refreshes aligned diagnostic targets after value or design edits', capability:'advisor-engine-parity', evidence:'unit-engine-resolution-and-chromium-calculated-test-and-diagnostic-contract', setup:'mixed', transition:'prior-test-answer-apply-calculate-edit-recheck', environment:'real-vendor-chromium-and-unit' }),
  'STATS.box-lognormal-repeated': Object.freeze({ requirement:'Box lognormal repeated-measures advice applies a complete-case log-scale model, reports corrected omnibus inference and geometric-mean ratio effects with explicit covariance assumptions, and preserves settings and report through archive reopen', capability:'lognormal-repeated-measures-inference', evidence:'independent-scipy-oracle-and-calculated-advisor-archive-reopen-contract', setup:'mixed', transition:'positive-paired-data-answer-apply-calculate-save-reopen', environment:'python-scipy-and-real-vendor-chromium' }),
  'STATS.box-nested-repeated': Object.freeze({ requirement:'The advisor blocks nested repeated-measures interaction tests with three conditions; the supported two-condition design uses the correct split-plot error terms, matches an independent model, and preserves its report through archive reopen', capability:'nested-repeated-anova', evidence:'three-condition-block-two-condition-statsmodels-contrasts-worker-report-archive-reopen', setup:'mixed', transition:'grouped-data-design-answer-block-or-apply-compute-save-reopen', environment:'statsmodels-and-real-vendor-chromium' }),
  'STATS.box-crossed-sphericity': Object.freeze({ requirement:'Fully crossed Box row-random repeated-measures effects use separate GG-primary and HF-supplementary covariance corrections; the one-way path shares the stable estimator and refuses zero-error inference; calculations are scale-stable, match independent SciPy/statsmodels references, and retain the versioned result through worker and archive paths', capability:'effect-specific-sphericity', evidence:'numpy-eigenvalue-scipy-f-tail-statsmodels-anovarm-production-worker-report-restore-and-one-way-scale-edge-checks', setup:'mixed', transition:'crossed-subject-data-to-three-corrections-worker-calculate-save-reopen', environment:'python-numpy-scipy-statsmodels-jest-and-box-integration' }),
  'STATS.survival-delayed-entry-logrank': Object.freeze({ requirement:'Log-rank risk sets exclude subjects before entry and after event or censoring, matching an independent calculation at each event time', capability:'survival-inference', evidence:'independent-delayed-entry-logrank-risk-set-reference', setup:'api', transition:'entry-exit-event-records-to-logrank', environment:'python-scipy-oracle-and-jest' }),
  'STATS.box-methods-guidance': Object.freeze({ requirement:'Grouped Box controls use concise design cues while copyable Methods text reports row-random assumptions and corrections, nested-design assumptions and error terms, and selected comparison scope and multiplicity family', capability:'statistical-guidance', evidence:'grouped-guidance-control-length-and-methods-report-browser-contract-plus-model-unit-contract', setup:'mixed', transition:'select-grouped-analysis-read-control-cue-calculate-and-read-methods', environment:'unit-and-real-vendor-chromium' }),
  'STATS.heatmap-correlation-oracle': Object.freeze({ requirement:'Heatmap Pearson and tied Spearman coefficients and p-values match an independent SciPy reference with complete-pair missing-data handling', capability:'correlation-inference', evidence:'heatmap-production-hook-scipy-pearson-and-tied-spearman-reference', setup:'api', transition:'paired-vectors-to-correlation-and-p-value', environment:'python-scipy-oracle-and-jest' }),
  'STATS.heatmap-correlation-inference': Object.freeze({ requirement:'Heatmap adjusts only computable pairwise p-values across the unique off-diagonal family, leaves unavailable adjusted values null, and reports the same family count', capability:'correlation-inference', evidence:'rendered-heatmap-available-pair-bh-holm-and-report-family-contract', setup:'mixed', transition:'correlation-data-enable-inference-adjust-save-report', environment:'jest-jsdom' }),
  'STATS.heatmap-inference-guidance': Object.freeze({ requirement:'Heatmap keeps only a concise Methods cue in Graph controls and places method, pair-handling, and computable-family details in copyable Methods text when inference is enabled', capability:'statistical-guidance', evidence:'heatmap-report-methods-guidance-browser-contract', setup:'ui', transition:'load-correlation-toggle-inference-read-methods-report', environment:'real-vendor-chromium' }),
  'STATS.venn-universe-guidance': Object.freeze({ requirement:'Venn overlap help directs users to the full eligible reference universe instead of assuming the observed list union is a valid background', capability:'enrichment-background', evidence:'venn-reference-universe-help-browser-contract', setup:'ui', transition:'open-overlap-significance-read-universe-guidance', environment:'real-vendor-chromium' }),
  'STATS.pca-parallel-analysis': Object.freeze({ requirement:'PCA parallel analysis is repeatable, applies the empirical 95th-percentile rule, and retains a clearly separated component count across 200 and 500 simulations', capability:'component-retention', evidence:'seeded-parallel-analysis-rule-and-budget-sensitivity-contract', setup:'api', transition:'matrix-to-seeded-null-and-retained-count', environment:'jest-and-svd-js' }),
  'STATS.cox-delayed-entry': Object.freeze({ requirement:'Efron Cox estimates, partial likelihood and LR inference for delayed-entry data match statsmodels PHReg', capability:'survival-inference', evidence:'1200-record-left-truncated-efron-independent-reference', setup:'api', transition:'time-entry-event-covariates-to-cox-fit', environment:'python-statsmodels-oracle-and-jest' }),
  'STATS.cox-lr-convergence': Object.freeze({ requirement:'Cox LR inference remains available after stabilized monotone likelihood despite a diverging coefficient, and is unavailable when the partial likelihood has not stabilized', capability:'survival-inference', evidence:'separated-cox-likelihood-stabilization-and-iteration-limit-contract', setup:'api', transition:'separated-or-forced-early-cox-fit-to-lr-availability', environment:'jest-and-r-survival-documented-contract' }),
  'STATS.cox-identifiability': Object.freeze({ requirement:'Cox fitting rejects redundant selected predictors that cannot be estimated separately within the event risk sets', capability:'survival-model-identifiability', evidence:'duplicate-treatment-group-covariate-risk-set-information-contract', setup:'api', transition:'redundant-group-and-covariate-design-to-clear-unavailable-result', environment:'jest' }),
  'STATS.cox-scale-invariance': Object.freeze({ requirement:'Rescaling a Cox covariate preserves the fitted partial likelihood and inversely rescales its coefficient', capability:'survival-numerics', evidence:'same-production-fit-at-unit-and-micro-unit-covariate-scales', setup:'api', transition:'covariate-unit-rescaling-to-invariant-likelihood-and-effect', environment:'jest' }),
  'LAYOUT.workspace-root-hydration': Object.freeze({ requirement:'Hydrating persisted workspace split state applies sizing to the component outer panels without changing nested table layout', capability:'workspace-layout-hydration', evidence:'venn-root-hydration-split-and-nested-table-contract', setup:'api', transition:'persisted-split-state-to-root-panel-flex-projection', environment:'jest-jsdom' }),
  'LAYOUT.legend-font-reserve-undo': Object.freeze({ requirement:'Legend and scale text size changes update reserved viewport space and outer layout, and undo/redo restores the corresponding geometry', capability:'legend-viewport-layout', evidence:'ten-component-rendered-font-reserve-change-and-undo-redo-contract', setup:'ui', transition:'open-font-controls-resize-text-undo-redo', environment:'real-vendor-chromium' }),
  'OWN.closed-tab-session-disposal': Object.freeze({ requirement:'Closing active or inactive Box, Scatter, PCA, Line, Surface, Pie, ROC and Survival tabs releases only that owner session and preserves its same-type sibling', capability:'session-disposal', evidence:'owner-registry-and-live-close-reopen-contract', setup:'mixed', transition:'create-switch-close-active-or-inactive-reopen', environment:'real-vendor-chromium-same-type-tabs' }),
  'LAYOUT.workspace-document-responsive': Object.freeze({ requirement:'Workspace title, Autosave and status remain readable and non-overlapping at narrow widths, enlarged text and actual browser zoom', capability:'responsive-workspace-header', evidence:'bounding-box-and-chromium-screenshot-contract', setup:'mixed', transition:'long-short-title-dirty-state-autosave-off-on-viewport-resize', environment:'320-1280-css-pixels-enlarged-text-and-200-percent-zoom' }),
  'STATS.advisor-model-design': Object.freeze({ requirement:'Line and Scatter curve recommendations require sufficient distinct design points, and Scatter preserves explicit origin constraints when X has measurement error', capability:'regression-advisor-design', evidence:'shared-model-metadata-two-component-browser-design-gates-and-association-only-positive-control', setup:'ui', transition:'curve-answer-ineligible-design-association-only', environment:'real-vendor-chromium' }),
  'STATS.roc-advisor-class-replication': Object.freeze({ requirement:'ROC and PR bootstrap guidance requires replicated matched subjects in each outcome class and warns about the smaller class independently of the total sample size', capability:'roc-advisor-replication', evidence:'policy-unit-and-current-matched-class-chromium-contract', setup:'mixed', transition:'matched-score-data-to-class-specific-eligibility', environment:'unit-and-real-vendor-chromium' }),
  'STATS.advisor-contract': Object.freeze({ requirement:'Advisor plans use current owner data, preserve live state and keyboard focus, apply supported settings exactly, validate variation, paired subjects, covariate strategy and each requested comparison family, and reject retired callbacks', capability:'statistics-advisor', evidence:'shared-dom-contract-and-six-component-chromium-decisions', setup:'mixed', transition:'answer-capture-change-data-apply-reset-switch-save-reopen', environment:'jsdom-and-real-vendor-chromium' }),
  'LAYOUT.stats-table-scroll': Object.freeze({ requirement: 'Statistics tables retain semantic headers, keyboard scrolling and separate export controls in narrow panels and restored older markup', capability: 'statistics-table-layout', evidence: 'shared-renderer-dom-and-histogram-chromium-scroll-export-contract', setup: 'mixed', transition: 'render-shrink-scroll-export-serialize-rehydrate', environment: 'jsdom-and-real-vendor-chromium' }),
  'LAYOUT.stats-analysis-settings': Object.freeze({ requirement: 'Histogram, Box, Scatter, Line, Pie, ROC and Survival place the advisor disclosure in the Analysis settings heading, contain compact settings and calculation controls in one aligned surface, and keep the Results heading and p-value control together after calculation', capability: 'statistics-settings-layout', evidence: 'seven-component-chromium-render-measurement-and-result-screenshot-contract', setup: 'mixed', transition: 'load-example-calculate-disclose-capture', environment: 'real-vendor-chromium' }),
  'LAYOUT.stats-calculate-button': Object.freeze({ requirement: 'Existing Calculate statistics buttons use Histogram’s accent, border, typography and disabled styling across Venn, Box, Scatter, Line, Pie, ROC and Survival without adding an Analysis settings section to Venn', capability: 'statistics-action-button-style', evidence: 'computed-enabled-disabled-style-parity-and-venn-disclosure-chromium-contract', setup: 'mixed', transition: 'load-component-compare-enabled-and-disabled-styles', environment: 'real-vendor-chromium' }),
  'STATS.hist-advisor': Object.freeze({ requirement: 'Histogram advisor distinguishes descriptive, fitted-distribution and two-sample distribution goals, recommends tie-aware KS calibration for independent ordered samples, validates design and preserves isolated answers across snapshots and reopen', capability: 'histogram-advisor', evidence: 'pure-decision-matrix-and-chromium-owner-archive-screenshot-contract', setup: 'mixed', transition: 'answer-validate-apply-reset-switch-save-reopen', environment: 'raw-included-observations' }),
  'STATS.hist-distribution-calibration': Object.freeze({ requirement: 'Two-sample KS uses exact or Monte Carlo permutation calibration when selected, retains ties, reports its method and matches an exhaustive small-sample oracle', capability: 'distribution-comparison-calibration', evidence: 'exhaustive-label-permutation-and-real-example-browser-report', setup: 'mixed', transition: 'pooled-samples-to-calibrated-p-value', environment: 'independent-ordered-samples-with-ties' }),
  'STATS.hist-ks-result-reclassification': Object.freeze({ requirement: 'An explicitly calculated Histogram KS result remains in its owning analysis model, panel and plot after alpha changes without rerunning the test', capability: 'statistics-result-reclassification', evidence: 'chromium-explicit-ks-alpha-change-panel-and-plot-retention', setup: 'ui', transition: 'select-ks-calculate-change-alpha-retain-panel-and-plot', environment: 'real-vendor-chromium' }),
  'STATS.hist-aicc-availability': Object.freeze({ requirement: 'Unavailable Histogram AICc values remain null through normalization and archive reopen and render without a preferred model or fabricated score', capability: 'statistics-result-validity', evidence: 'small-sample-render-json-archive-reopen-contract', setup: 'mixed', transition: 'calculate-normal-lognormal-json-save-reopen', environment: 'real-vendor-chromium' }),
  'ASYNC.hist-analysis-snapshot': Object.freeze({ requirement: 'Histogram Calculate statistics work blocks save and recovery snapshots until its owner result is published', capability: 'snapshot-readiness', evidence: 'controlled-ks-worker-save-and-recovery-checkpoint', setup: 'mixed', transition: 'calculate-pause-save-recovery-release-publish', environment: 'real-vendor-chromium' }),
  'OWN.hist-analysis-cancel': Object.freeze({ requirement: 'Histogram statistics work is cancelled for its owner on settings changes, same-type switching and tab close without leaking results', capability: 'async-owner-isolation', evidence: 'controlled-worker-supersede-switch-and-close-contract', setup: 'mixed', transition: 'calculate-cancel-owner-replace-or-dispose', environment: 'real-vendor-chromium' }),
  'STATS.heatmap-correction-reclassification': Object.freeze({ requirement: 'Heatmap inference remains opt-in and correction changes reclassify saved raw p-values without repeating pairwise tests', capability: 'statistics-correction-reclassification', evidence: 'chromium-inference-opt-in-correction-and-no-recalculation-contract', setup: 'ui', transition: 'show-inference-calculate-change-correction-hide-inference', environment: 'real-vendor-chromium' }),
  'STATS.roc-single-curve-result-projection': Object.freeze({ requirement: 'Calculated single-curve ROC inference remains owner-scoped and is projected after redraw and payload hydration before switching to multi-curve comparison', capability: 'statistics-result-projection', evidence: 'chromium-single-curve-calculate-redraw-payload-roundtrip-and-comparison-transition', setup: 'ui', transition: 'select-method-calculate-redraw-restore-payload-switch-to-comparison', environment: 'real-vendor-chromium' }),
  'WORKER.hist-distribution-comparison': Object.freeze({ requirement: 'Histogram KS resampling runs in an owner-scoped worker, reuses exact-sample pending and completed results across redraws, and only projects them for the current draw', capability: 'worker', evidence: 'session-cache-owner-isolation-real-worker-exact-and-seeded-monte-carlo-contract-plus-chromium-report', setup: 'mixed', transition: 'owner-draw-to-worker-result-cache-and-current-draw-publication', environment: 'browser-worker' }),

  'OWN.inactive-runtime': Object.freeze({ requirement: 'Inactive runtime restore and capture preserve both owner sessions and the mounted sibling projection', capability: 'runtime-ownership', evidence: 'eleven-component-inactive-apply-capture-switch-contract', setup: 'mixed', transition: 'edit-owner-capture-switch-restore-inactive-capture-return', environment: 'real-vendor-empty-workspaces' }),
  'OWN.internal-runtime-bridge': Object.freeze({ requirement: 'The runtime bridge retains owner snapshots and reads or applies live targets only for the matching mounted owner', capability: 'runtime-ownership', evidence: 'synthetic-owner-root-sync-async-null-and-rejected-restore-contract', setup: 'api', transition: 'capture-switch-restore-inactive-or-settle-async-then-project-owner', environment: 'jsdom' }),
  'STATS.advisor-owner-persistence': Object.freeze({ requirement: 'Box, Scatter, Line, Pie, ROC and Survival advisor controls retain canonical state through snapshot capture, sibling tabs and file reopen', capability: 'advisor-owner-persistence', evidence: 'chromium-live-reference-answer-and-archive-parity', setup: 'ui', transition: 'answer-capture-switch-save-reopen', environment: 'loaded-example' }),
  'STATS.advisor-disclosure': Object.freeze({ requirement: 'Closing an advisor hides all guidance without losing answers; suggestions do not imply applied settings', capability: 'advisor-disclosure', evidence: 'six-component-chromium-toggle-and-answer-retention', setup: 'ui', transition: 'open-close-open-answer-close-reopen', environment: 'loaded-example' }),
  'OWN.fixture-bootstrap-lifetime': Object.freeze({requirement:'Each full-app fixture preserves native callback receivers and arguments, retires its owners, observers, listeners, timers and frames before replacing its DOM or namespaces, and retains pre-deletion leak evidence',capability:'integration-isolation',evidence:'fixture-resource-retirement-rebootstrap-and-owner-report-contract',setup:'api',transition:'bootstrap-to-retirement-to-rebootstrap'}),
  'OWN.live-session-access': Object.freeze({requirement:'Session reads preserve canonical state, refs and pending-work records; normalization occurs at creation and hydration',capability:'session-ownership',evidence:'box-scatter-read-identity-dom-connectedness-owner-isolation',setup:'api',transition:'create-owner-to-repeated-live-read'}),
  'STATS.box-friedman-mode': Object.freeze({ requirement: 'Friedman honors requested calibration, preserves tied ranks and reports exact-state-limit fallback across reopen', capability: 'rank-calibration-selection', evidence: 'independent-exhaustive-oracle-historical-browser-reopen', setup: 'mixed', transition: 'requested-mode-to-calculation-save-reopen' }),
  'STATS.box-paired-rank-effect': Object.freeze({ requirement: 'Paired rank-biserial shares signed ranks, excludes zero differences and preserves corrected saved results', capability: 'paired-effect-size', evidence: 'scipy-weighted-ranks-worker-historical-browser-reopen', setup: 'mixed', transition: 'paired-data-to-effect-save-reopen' }),
  'STATS.box-control-sidak': Object.freeze({ requirement: 'Control method labels, probabilities, orientation and chosen intervals agree with SciPy', capability: 'control-comparisons', evidence: 'scipy-unequal-size-control-reference', setup: 'api', transition: 'control-family-to-report' }),
  'STATS.box-named-comparisons': Object.freeze({ requirement: 'Dunnett and Dunnett T3 probabilities and simultaneous intervals agree with independent SciPy calculations', capability: 'multiple-comparisons', evidence: 'scipy-named-box-comparison-reference', setup: 'mixed', transition:'selected-procedure-to-calculation-save-reopen' }),
  'STATS.box-rout-location': Object.freeze({ requirement: 'ROUT location and RSDR estimates agree with the independent SciPy score-equation solution', capability: 'robust-outlier-detection', evidence: 'scipy-rout-score-equations', setup: 'mixed', transition:'screening-to-inference-save-reopen' }),
  'STATS.box-decimal-ranks': Object.freeze({ requirement: 'Decimal signed ranks retain mathematical ties and distinct observations', capability: 'rank-numerics', evidence: 'python-decimal-scipy-exhaustive-sign-flips', setup: 'api', transition: 'paired-decimals-to-inference' }),
  'STATS.box-outlier-guidance': Object.freeze({ requirement: 'Grubbs excludes one extreme, MAD flags retain data, diagnostics do not select tests', capability: 'statistical-preprocessing', evidence: 'production-screening-diagnostic-contract', setup: 'api', transition: 'screening-to-selected-analysis' }),
  'STATS.box-method-reopen': Object.freeze({ requirement: 'Accurate control methods, retained MAD data and diagnostics survive archive reopen and owner-bound recalculation', capability: 'statistical-persistence', evidence: 'rendered-control-screening-reopen', setup: 'mixed', transition: 'calculate-save-reopen-recalculate' }),
  'STATS.box-one-sample-control-order': Object.freeze({ requirement: 'Selecting one-sample scope places Null value immediately below Comparison scope and commits edits to the owning Box session', capability: 'statistics-control-order', evidence: 'chromium-one-sample-row-adjacency-and-session-edit-contract', setup: 'ui', transition: 'all-comparisons-to-one-sample-edit-back', environment: 'loaded-example' }),
  'STATS.box-subject-alignment': Object.freeze({ requirement: 'Production Box preprocessing, paired tests, repeated measures, and grouped marginals retain source subjects', capability: 'paired-statistics', evidence: 'production-model-worker-scipy-row-intersection', setup: 'api', transition: 'source-rows-to-statistical-results' }),
  'STATS.box-tied-friedman': Object.freeze({ requirement: 'Friedman Monte Carlo preserves observed within-subject ties and agrees with exhaustive SciPy-ranked permutations', capability: 'rank-resampling', evidence: 'scipy-ranks-exhaustive-permutation-reference', setup: 'api', transition: 'tied-subject-ranks-to-null-distribution' }),
  'STATS.box-screened-custom': Object.freeze({ requirement: 'Custom comparisons calculate from the screened groups used by summaries and reports', capability: 'statistical-preprocessing', evidence: 'screened-custom-production-model-scipy-reference', setup: 'api', transition: 'outlier-screening-to-custom-comparisons' }),
  'STATS.box-aligned-reopen': Object.freeze({ requirement: 'Paired missing-row results survive archive reopen and owner-bound recalculation', capability: 'statistical-persistence', evidence: 'rendered-paired-scipy-reference-reopen', setup: 'mixed', transition: 'calculate-save-reopen-recalculate' }),
  'GOVERNANCE.component-catalog': Object.freeze({ requirement: 'Single component catalog governs test discovery', capability: 'test-governance', evidence: 'component-catalog-contract' }),
  'GOVERNANCE.discovery-inventory': Object.freeze({ requirement: 'Test discovery inventory is reproducible', capability: 'test-governance', evidence: 'test-inventory-contract' }),
  'GOVERNANCE.layer-manifest': Object.freeze({ requirement: 'Every test declares one execution layer', capability: 'test-governance', evidence: 'layer-manifest-contract' }),
  'GOVERNANCE.jest-project-boundaries': Object.freeze({ requirement: 'Jest projects enforce layer boundaries', capability: 'test-governance', evidence: 'jest-project-boundary-contract' }),
  'GOVERNANCE.lane-runner': Object.freeze({ requirement: 'Test lanes preserve initial gate status', capability: 'test-governance', evidence: 'lane-runner-contract' }),
  'GOVERNANCE.jest-shard-runner': Object.freeze({ requirement: 'Jest shard reports preserve per-test outcomes and partial results', capability: 'test-governance', evidence: 'jest-shard-runner-contract' }),
  'GOVERNANCE.case-evidence': Object.freeze({ requirement: 'Passing cases join to requirement, component, transition, and environment metadata', capability: 'test-governance', evidence: 'per-case-manifest-evidence' }),
  'GOVERNANCE.tab-isolation-scanner-helper-sinks': Object.freeze({ requirement: 'Tab-isolation scanner finds direct local-helper state and table sinks while excluding read-only and local-only helpers', capability: 'architecture-governance', evidence: 'scanner-fixture-and-production-scatter-helper-sink-contract', setup: 'api', transition: 'registered-callback-to-direct-helper-sink', environment: 'jest' }),
  'GOVERNANCE.tab-isolation-scanner-lexical-callbacks': Object.freeze({ requirement: 'Tab-isolation scanner attributes named callback registrations to the lexically resolved function when names are shadowed', capability: 'architecture-governance', evidence: 'shadowed-callback-registration-site-fixture-contract', setup: 'api', transition: 'same-name-callbacks-to-exact-registration-site', environment: 'jest' }),
  'GOVERNANCE.tab-isolation-review-queue': Object.freeze({ requirement: 'Pending tab-isolation candidates are ordered by mutation risk and grouped only as source-review routes without merging dispositions', capability: 'architecture-governance', evidence: 'review-queue-risk-order-and-independent-candidate-contract', setup: 'api', transition: 'pending-callbacks-to-ranked-source-review-routes', environment: 'jest' }),
  'GOVERNANCE.tab-isolation-scanner-file-save-sinks': Object.freeze({ requirement: 'Tab-isolation scanner exposes graph-file save target and owner selectors without claiming they are unsafe', capability: 'architecture-governance', evidence: 'scanner-file-save-sink-selector-fixture-contract', setup: 'api', transition: 'async-owner-save-to-external-file-sink', environment: 'jest' }),
  'GOVERNANCE.coverage-trend': Object.freeze({ requirement: 'Coverage trend thresholds are enforced', capability: 'test-governance', evidence: 'coverage-trend-contract' }),
  'GOVERNANCE.integration-teardown': Object.freeze({ requirement: 'Integration fixtures enforce teardown and leak checks', capability: 'test-governance', evidence: 'integration-teardown-contract' }),
  'GOVERNANCE.production-bootstrap-manifest': Object.freeze({ requirement: 'Production bootstrap follows the script manifest', capability: 'bootstrap', evidence: 'production-bootstrap-manifest-contract' }),
  'GOVERNANCE.browser-helper-bootstrap': Object.freeze({ requirement: 'Browser-only shared helpers load safely in the non-browser production-module test bootstrap', capability: 'bootstrap', evidence: 'browser-helper-node-bootstrap-contract' }),
  'GOVERNANCE.vendor-provenance': Object.freeze({ requirement: 'Browser vendor provenance is pinned and checked', capability: 'test-governance', evidence: 'vendor-provenance-contract' }),
  'GOVERNANCE.change-impact-map': Object.freeze({ requirement: 'Changed paths select mandatory contract lanes', capability: 'test-governance', evidence: 'change-impact-map-contract' }),
  'GOVERNANCE.component-mutation-catalog': Object.freeze({ requirement: 'Component mutation plans are explicit', capability: 'component-modes', evidence: 'component-mutation-catalog-contract' }),
  'OWN.readiness-observability': Object.freeze({ requirement: 'Owner readiness is observable', capability: 'readiness', evidence: 'readiness-observability-contract' }),
  'OWN.readiness-projection': Object.freeze({ requirement: 'Visible projection follows settled owner readiness', capability: 'readiness', evidence: 'readiness-projection-contract' }),
  'OWN.component-dom-binding': Object.freeze({ requirement: 'Mounted component DOM binds to its owner', capability: 'tab-isolation', evidence: 'component-dom-binding-contract' }),
  'OWN.cross-browser-feature-matrix': Object.freeze({ requirement: 'Browser feature coverage is declared by lane', capability: 'test-governance', evidence: 'cross-browser-feature-matrix-contract' }),
  'ARCHIVE.session-save-policies': Object.freeze({ requirement: 'Save policies use canonical session state', capability: 'archive', evidence: 'session-save-policy-contract' }),
  'ARCHIVE.zip-entry-bounds': Object.freeze({ requirement: 'ZIP archive members decompress within their declared byte limit and oversized streams stop before excess output is retained', capability: 'archive-bounds', evidence: 'jszip-valid-bound-overrun-and-stream-pause-contract', setup: 'api', transition: 'compressed-member-at-limit-and-over-limit-stream' , environment: 'jest-with-jszip-stream' }),
  'REC.archive-restore-transaction': Object.freeze({ requirement: 'Archive restore is staged as one transaction', capability: 'recovery', evidence: 'archive-restore-transaction-contract' }),
  'REC.primary-graph-publication': Object.freeze({ requirement: 'Recovery publishes one owner-valid primary graph', capability: 'recovery', evidence: 'primary-graph-publication-contract' }),
  'REC.single-tab-recovery-checkpoint': Object.freeze({ requirement: 'Single-tab recovery checkpoints are owner-scoped', capability: 'recovery', evidence: 'single-tab-recovery-checkpoint-contract' }),
  'REC.reopen-data-redraw': Object.freeze({ requirement: 'Reopen redraws from restored durable data', capability: 'recovery', evidence: 'reopen-data-redraw-contract' }),
  'REC.stats-recovery': Object.freeze({ requirement: 'Statistical recovery restores durable results', capability: 'recovery', evidence: 'stats-recovery-contract' }),
  'REC.document-state-recovery': Object.freeze({ requirement: 'Document recovery restores canonical state and dirty policy', capability: 'recovery', evidence: 'document-state-recovery-contract' }),
  'REC.stale-checkpoint-owner-guard': Object.freeze({ requirement: 'Stale empty recovery work cannot clear a newer workspace checkpoint', capability: 'recovery-owner', evidence: 'stale-empty-checkpoint-owner-guard', setup: 'api', transition: 'pause-checkpoint-work-change-workspace-release-and-check-storage' }),
  'REC.stale-storage-write-order': Object.freeze({ requirement: 'A delayed older recovery write cannot replace the latest stored workspace revision', capability: 'recovery-owner', evidence: 'delayed-recovery-storage-write-order', setup: 'api', transition: 'pause-old-storage-write-advance-revision-then-release-and-check-stored-revision' }),
  'PERSIST.grid-clipboard': Object.freeze({ requirement: 'Grid clipboard edits write through to the owner', capability: 'grid', evidence: 'grid-clipboard-contract' }),
  'PERSIST.scatter-label-copy-scope': Object.freeze({ requirement: 'Scatter point-label row selection does not widen a focused cell copy', capability: 'clipboard-selection', evidence: 'scatter-labelled-cell-copy-browser-contract' }),
  'PERSIST.table-format-tab-isolation': Object.freeze({ requirement: 'Replicate mode and segmented selection remain tab-owned across switching and archive reopen', capability: 'persistence', evidence: 'table-format-isolation-contract' }),
  'OWN.pca-component-selection-stale-owner': Object.freeze({ requirement: 'Inactive PCA component-selection controls cannot change the active tab settings', capability: 'owner-isolation', evidence: 'pca-component-selection-inactive-root-ab-contract', setup: 'api', transition: 'inactive-owner-controls-fired-while-sibling-active' }),
  'OWN.pca-cancelled-view-draw': Object.freeze({ requirement: 'A cancelled PCA view draw remains dirty in its owner session and redraws from that session when reactivated', capability: 'owner-isolation', evidence: 'pca-cancelled-view-draw-delayed-switch-and-return-contract', setup: 'api', transition: 'delayed-owner-draw-cancelled-switch-away-and-return' }),
  'OWN.pca-stale-font-owner': Object.freeze({ requirement: 'A PCA font event for a missing owner cannot dirty the active sibling session', capability: 'owner-isolation', evidence: 'pca-stale-font-event-missing-owner-ab-session-contract', setup: 'api', transition: 'dispatch-font-event-for-nonexistent-owner-while-sibling-active' }),
  'OWN.scatter-stale-font-owner': Object.freeze({ requirement: 'A Scatter font event for a missing owner cannot schedule the active sibling session', capability: 'owner-isolation', evidence: 'scatter-stale-font-event-missing-owner-ab-session-contract', setup: 'api', transition: 'dispatch-font-event-for-nonexistent-owner-while-sibling-active' }),
  'OWN.scatter-cancelled-draw': Object.freeze({ requirement: 'A Scatter draw cancelled after collection leaves the originating owner data dirty and leaves the active sibling untouched', capability: 'owner-isolation', evidence: 'scatter-cancelled-draw-delayed-switch-and-owner-state-contract', setup: 'api', transition: 'post-collection-render-paused-switch-away-and-cancel' }),
  'OWN.scatter-canvas-frame-cancellation': Object.freeze({ requirement: 'A cancelled Scatter canvas frame releases its pending draw after tab deactivation', capability: 'async-ownership', evidence: 'scatter-canvas-draw-frame-cancellation-settlement', setup: 'browser', transition: 'pause-canvas-frame-switch-same-type-owner' }),
  'OWN.venn-cancelled-draw': Object.freeze({ requirement: 'A cancelled Venn draw preserves a newer queued draw request in its owner session', capability: 'owner-isolation', evidence: 'venn-cancelled-draw-preserves-newer-owner-request-contract', setup: 'api', transition: 'draw-paused-new-owner-request-then-cancel-old-draw' }),
  'OWN.venn-disposed-draw-owner': Object.freeze({ requirement: 'A Venn draw completion after its owner tab is removed cannot clear a sibling tab draw request', capability: 'owner-isolation', evidence: 'venn-disposed-draw-preserves-sibling-pending-owner-contract', setup: 'api', transition: 'pause-owner-draw-create-sibling-request-remove-owner-release-stale-draw' }),
  'OWN.venn-stale-public-draw-owner': Object.freeze({ requirement: 'A public draw for an inactive Venn owner cannot rebind the active sibling projection', capability: 'owner-isolation', evidence: 'venn-public-draw-inactive-owner-projection-and-session-contract', setup: 'api', transition: 'explicit-inactive-owner-draw-while-sibling-active' }),
  'OWN.venn-stale-refresh-owner': Object.freeze({ requirement: 'A refresh requested for an inactive Venn tab cannot update the active sibling session', capability: 'owner-isolation', evidence: 'venn-refresh-inactive-owner-session-and-render-contract', setup: 'api', transition: 'same-type-tab-switch-explicit-inactive-refresh' }),
  'OWN.venn-save-async-owner': Object.freeze({ requirement: 'A Venn save completion updates only the session that started the save after a same-type tab switch', capability: 'owner-isolation', evidence: 'venn-save-and-save-as-delayed-owner-session-payload-controls-contract', setup: 'api', transition: 'save-paused-switch-to-sibling-then-complete' }),
  'OWN.hist-cancelled-draw': Object.freeze({ requirement: 'A delayed Histogram draw cancelled by tab switching leaves both owners unchanged and reports cancellation', capability: 'owner-isolation', evidence: 'hist-cancelled-draw-delayed-switch-owner-and-status-contract', setup: 'api', transition: 'owner-draw-paused-switch-to-sibling-then-cancelled' }),
  'OWN.pie-cancelled-draw': Object.freeze({ requirement: 'A cancelled Pie draw is reported as cancelled by its owner cycle', capability: 'owner-isolation', evidence: 'pie-cancelled-draw-settled-owner-contract', setup: 'api', transition: 'draw-paused-then-cancelled' }),
  'OWN.pie-draw-switch-isolation': Object.freeze({ requirement: 'A delayed Pie draw cannot change a sibling owner after the active tab switches', capability: 'async-ownership', evidence: 'pie-delayed-draw-switch-owner-payload-and-render-contract', setup: 'api', transition: 'pause-owner-draw-activate-sibling-release' }),
  'OWN.hist-control-stale-owner': Object.freeze({ requirement: 'Inactive Histogram control events cannot capture the active tab mirror into another tab', capability: 'owner-isolation', evidence: 'hist-legend-inactive-root-ab-session-contract', setup: 'api', transition: 'inactive-owner-event-after-same-type-switch' }),
  'OWN.cartesian-axis-length-stale-owner': Object.freeze({ requirement: 'Line and Scatter axes-length controls cannot change a different active tab', capability: 'owner-isolation', evidence: 'line-scatter-inactive-axes-control-ab-session-contract', setup: 'api', transition: 'inactive-owner-axes-event-after-same-type-switch' }),
  'OWN.scatter-view-mode-stale-owner': Object.freeze({ requirement: 'Scatter view-mode events cannot write through a stale component owner binding', capability: 'owner-isolation', evidence: 'scatter-view-mode-stale-owner-session-regression', setup: 'api', transition: 'active-owner-mismatch-during-view-mode-change' }),
  'OWN.scatter-example-stale-owner': Object.freeze({ requirement: 'Retained Scatter example button cannot load data into the active sibling tab', capability: 'owner-isolation', evidence: 'scatter-example-stale-owner-session-regression', setup: 'api', transition: 'same-type-tab-switch-retained-example-button' }),
  'OWN.welcome-example-launch-owner': Object.freeze({ requirement: 'A delayed welcome example launch cannot project or persist into a same-type tab activated while the launch is pending', capability: 'owner-isolation', evidence: 'welcome-example-delayed-activation-owner-session-and-render-contract', setup: 'ui', transition: 'same-type-tab-switch-during-delayed-activation' }),
  'OWN.line-example-stale-owner': Object.freeze({ requirement: 'Retained Line example button cannot load data into the active sibling tab', capability: 'owner-isolation', evidence: 'line-example-stale-owner-session-regression', setup: 'api', transition: 'same-type-tab-switch-retained-example-button' }),
  'OWN.line-display-mode-stale-owner': Object.freeze({ requirement: 'Inactive Line display-mode events cannot change the active sibling tab', capability: 'owner-isolation', evidence: 'line-display-mode-stale-owner-session-regression', setup: 'api', transition: 'same-type-tab-switch-retained-display-mode-event' }),
  'OWN.line-viewmode-stale-owner': Object.freeze({ requirement: 'Inactive Line 2D/3D view-mode events cannot change the active sibling view or table', capability: 'owner-isolation', evidence: 'line-viewmode-stale-owner-session-and-table-regression', setup: 'api', transition: 'same-type-tab-switch-retained-viewmode-event' }),
  'OWN.line-data-toolbar-stale-owner': Object.freeze({ requirement: 'An inactive Line table wrapper cannot activate the shared toolbar section for its sibling', capability: 'owner-isolation', evidence: 'line-data-toolbar-stale-owner-activation-regression', setup: 'api', transition: 'same-type-tab-switch-retained-table-mousedown' }),
  'OWN.scatter-data-toolbar-stale-owner': Object.freeze({ requirement: 'An inactive Scatter table wrapper cannot activate the shared toolbar section for its sibling', capability: 'owner-isolation', evidence: 'scatter-data-toolbar-stale-owner-activation-regression', setup: 'api', transition: 'same-type-tab-switch-retained-table-mousedown' }),
  'OWN.tab-scoped-file-target-isolation': Object.freeze({ requirement: 'A tab-scoped graph file remains bound to its owning tab across autosave, explicit save, reload, and recovery', capability: 'owner-isolation', evidence: 'tab-file-target-owner-save-autosave-journal-recovery-contract', setup: 'mixed', transition: 'load-owner-a-switch-to-b-autosave-save-recovery-and-return' }),
  'OWN.line-stats-button-stale-owner': Object.freeze({ requirement: 'A retained inactive Line statistics button cannot compute into the active sibling tab', capability: 'owner-isolation', evidence: 'line-stats-button-stale-owner-session-regression', setup: 'api', transition: 'same-type-tab-switch-retained-stats-button' }),
  'OWN.line-cancelled-draw-owner': Object.freeze({ requirement: 'A delayed Line draw cancelled by tab switching leaves the sibling unchanged and redraws the owner on return', capability: 'owner-isolation', evidence: 'line-cancelled-draw-delayed-switch-owner-and-render-contract', setup: 'api', transition: 'owner-draw-paused-switch-to-sibling-then-reactivated' }),
  'OWN.line-replicate-controls-stale-owner': Object.freeze({ requirement: 'Inactive Line table-format and replicate-count events cannot reshape the active sibling table', capability: 'owner-isolation', evidence: 'line-replicate-controls-stale-owner-session-regression', setup: 'api', transition: 'same-type-tab-switch-retained-table-structure-event' }),
  'OWN.scatter-replicate-controls-stale-owner': Object.freeze({ requirement: 'Inactive Scatter table-format, replicate-count, and grouped-X events cannot reshape the active sibling table', capability: 'owner-isolation', evidence: 'scatter-replicate-controls-stale-owner-session-regression', setup: 'api', transition: 'same-type-tab-switch-retained-table-structure-event' }),
  'OWN.line-inactive-payload-owner': Object.freeze({ requirement: 'Inactive Line payloads cannot replace the active sibling projection or session', capability: 'owner-isolation', evidence: 'line-inactive-payload-owner-session-regression', setup: 'api', transition: 'active-sibling-then-explicit-inactive-payload', environment: 'jest' }),
  'OWN.scatter-inactive-payload-owner': Object.freeze({ requirement: 'Inactive Scatter payloads cannot mutate the active sibling projection or session', capability: 'owner-isolation', evidence: 'scatter-inactive-payload-owner-session-regression', setup: 'api', transition: 'active-sibling-then-explicit-inactive-payload', environment: 'jest' }),
  'OWN.line-save-file-owner': Object.freeze({ requirement: 'Line save and save-as use the active tab session file name and file handle', capability: 'owner-isolation', evidence: 'line-delayed-save-session-file-target-isolation', setup: 'api', transition: 'save-a-switch-to-b-save-b', environment: 'jest' }),
  'OWN.scatter-save-file-owner': Object.freeze({ requirement: 'Scatter save and save-as use the active tab session file name and file handle', capability: 'owner-isolation', evidence: 'scatter-delayed-save-session-file-target-isolation', setup: 'api', transition: 'save-a-switch-to-b-save-b', environment: 'jest' }),
  'OWN.component-save-target-owner-isolation': Object.freeze({ requirement: 'Component graph-save APIs use each active session file name and handle after creating an empty same-type tab', capability: 'owner-isolation', evidence: 'six-component-empty-duplicate-save-and-save-as-session-target-matrix', setup: 'api', transition: 'save-as-a-create-empty-b-save-b-and-recheck-a', environment: 'jest' }),
  'OWN.survival-file-target-owner-isolation': Object.freeze({ requirement: 'An empty Survival tab does not inherit another tab file name or handle during activation', capability: 'owner-isolation', evidence: 'survival-empty-tab-file-target-session-activation-regression', setup: 'api', transition: 'set-a-file-target-activate-empty-b-check-b-and-a', environment: 'jest' }),
  'OWN.heatmap-inactive-payload-owner': Object.freeze({ requirement: 'Inactive Heatmap payloads are rejected before changing the active sibling projection', capability: 'owner-isolation', evidence: 'heatmap-inactive-payload-owner-projection-regression', setup: 'api', transition: 'active-sibling-then-explicit-inactive-payload', environment: 'jest' }),
  'OWN.heatmap-stale-pvalue-owner': Object.freeze({ requirement: 'A stale Heatmap formatting event cannot schedule a draw in the active sibling', capability: 'owner-isolation', evidence: 'disposed-heatmap-owner-pvalue-event-ab-regression', setup: 'api', transition: 'dispose-owner-switch-to-sibling-dispatch-stale-owner-event', environment: 'jest' }),
  'OWN.pie-inactive-payload-owner': Object.freeze({ requirement: 'Inactive Pie payloads are rejected before changing the active sibling projection', capability: 'owner-isolation', evidence: 'pie-inactive-payload-owner-projection-regression', setup: 'api', transition: 'active-sibling-then-explicit-inactive-payload', environment: 'jest' }),
  'OWN.roc-grid-stale-owner': Object.freeze({ requirement: 'Retained ROC grid controls cannot mix active sibling controls into the inactive owner session', capability: 'owner-isolation', evidence: 'roc-grid-stale-owner-session-regression', setup: 'api', transition: 'same-type-tab-switch-retained-grid-control' }),
  'OWN.roc-snapshot-missing-owner': Object.freeze({ requirement: 'ROC snapshot readiness with an explicit missing owner cannot schedule work on the active sibling', capability: 'owner-isolation', evidence: 'roc-snapshot-explicit-owner-does-not-fall-back-to-active-session', setup: 'api', transition: 'remove-owner-session-keep-sibling-active-request-snapshot-for-owner' }),
  'OWN.cartesian-axis-length-stale-owner-browser': Object.freeze({ requirement: 'Inactive Line and Scatter axes-length controls cannot change active-tab session or rendered controls', capability: 'owner-isolation', evidence: 'line-scatter-browser-stale-control-session-and-render-contract', setup: 'mixed', transition: 'same-type-tab-switch-dispatch-retained-owner-controls' }),
  'PERSIST.line-uncertainty-band-reopen': Object.freeze({ requirement: 'Line uncertainty bands survive reopen', capability: 'persistence', evidence: 'line-uncertainty-reopen-contract' }),
  'PERSIST.ui-originated-component-mutations': Object.freeze({ requirement: 'UI-originated component mutations write through and survive reopen', capability: 'component-modes', evidence: 'ui-component-mutation-persistence-contract', setup: 'ui' }),
  'LAYOUT.ui-originated-component-resize': Object.freeze({ requirement: 'Visible component resizing writes through and survives reopen', capability: 'layout', evidence: 'ui-component-layout-persistence-contract', setup: 'ui' }),
  'LAYOUT.full-range-panel-split': Object.freeze({ requirement: 'Scatter panel divider reaches both workspace edges and collapsed panes survive archive reopen', capability: 'layout', evidence: 'full-range-panel-divider-chrome-contract', setup: 'ui' }),
  'PERSIST.dataview-lite-archive': Object.freeze({ requirement: 'Lite DataView archives preserve replayable source state', capability: 'data-views', evidence: 'dataview-lite-archive-contract' }),
  'PERSIST.welcome-example-persistence': Object.freeze({ requirement: 'Welcome examples persist their selected component state', capability: 'persistence', evidence: 'welcome-example-persistence-contract' }),
  'PERSIST.regression-summary': Object.freeze({ requirement: 'Regression summaries survive persistence transitions', capability: 'persistence', evidence: 'regression-summary-persistence-contract' }),
  'OWN.scatter-inline-edit-preview': Object.freeze({ requirement: 'Scatter inline edits update the owner preview', capability: 'interaction', evidence: 'scatter-inline-edit-preview-contract' }),
  'STATS.figure-summary-layout': Object.freeze({ requirement: 'Figure summaries preserve semantic report layout', capability: 'statistics', evidence: 'figure-summary-layout-contract' }),
  'STATS.venn-plot-stats': Object.freeze({ requirement: 'Venn plot statistics restore per tab and match the active significance result', capability: 'statistics', evidence: 'venn-plot-stats-owner-tab-contract', setup: 'ui', transition: 'same-type-tab-switch', environment: 'chromium' }),
  'REC.heatmap-exclusion-archive-parity': Object.freeze({ requirement: 'Heatmap exclusions remain identical after archive recovery', capability: 'recovery', evidence: 'heatmap-exclusion-archive-contract' }),
  'LAYOUT.axis-tick-label-optical-clearance': Object.freeze({ requirement: 'Axis labels retain optical clearance', capability: 'layout', evidence: 'axis-tick-label-clearance-contract' }),
  'LAYOUT.cartesian-x-label-reserve': Object.freeze({ requirement: 'Cartesian layouts reserve space for x-axis labels', capability: 'layout', evidence: 'cartesian-label-reserve-contract' }),
  'LAYOUT.multiline-title-exact-reserve': Object.freeze({ requirement: 'Each added title line reserves exactly its rendered line-height without shrinking the plot', capability: 'layout', evidence: 'multiline-title-exact-reserve-browser-contract', setup: 'ui' }),
  'LAYOUT.plot3d-multiline-title-exact-reserve': Object.freeze({ requirement: '3D multiline titles move their rendered lines and anchors together, retain readable Y endpoints, and preserve exact outer reserves through redraw, formatting, and rotation', capability: 'layout', evidence: 'plot3d-multiline-title-exact-reserve-browser-contract', setup: 'ui' }),
  'LAYOUT.plot3d-glyph-containment': Object.freeze({ requirement: '3D axis titles keep compact rendered tick clearance; legends leave projected geometry unchanged, stay outside axis annotations, and preserve viewport sizing through redraw, cache restore, rotation, and archive reopen; collapsed axes omit annotations', capability: 'three-dimensional-view', evidence: 'plot3d-glyph-containment-browser-contract', setup: 'ui', environment: 'loaded-examples' }),
  'LAYOUT.cartesian-axis-title-reserve-all': Object.freeze({ requirement: 'Cartesian graph and applicable X/Y titles shift the plot by exactly their rendered line-height', capability: 'layout', evidence: 'cartesian-axis-title-reserve-browser-contract', setup: 'ui' }),
  'LAYOUT.multiline-title-mode-matrix': Object.freeze({ requirement: 'Graph and applicable axis titles edit, render, and remain contained in every supported component graph mode', capability: 'layout', evidence: 'multiline-title-mode-matrix-browser-contract', setup: 'ui' }),
  'LAYOUT.title-alignment-persistence-all': Object.freeze({ requirement: 'Left, center, and right title alignment survive component archive reopen', capability: 'persistence', evidence: 'title-alignment-persistence-browser-contract', setup: 'ui' }),
  'LAYOUT.title-alignment-scopes': Object.freeze({ requirement: 'Selection and Graph alignment scopes affect supported title blocks and preserve unsupported ticks', capability: 'layout', evidence: 'title-alignment-scope-browser-contract', setup: 'ui' }),
  'LAYOUT.title-alignment-undo-order': Object.freeze({ requirement: 'Title text and font alignment undo and redo in the exact order they were changed during inline editing', capability: 'undo-redo', evidence: 'title-alignment-undo-order-browser-contract', setup: 'ui' }),
  'LAYOUT.title-alignment-live-undo': Object.freeze({ requirement: 'Graph and applicable axis title undo and redo update the active editor in every component', capability: 'undo-redo', evidence: 'title-alignment-live-undo-browser-contract', setup: 'ui' }),
  'LAYOUT.multiline-title-empty-row-editor': Object.freeze({ requirement: 'The inline title editor displays empty logical lines and keeps earlier lines visible', capability: 'title-editing', evidence: 'multiline-title-empty-row-editor-browser-contract', setup: 'ui' }),
  'PERSIST.title-alignment-cache-miss': Object.freeze({ requirement: 'A stale title render-cache signature falls back to canonical multiline text and alignment with live editing restored', capability: 'render-cache', evidence: 'title-alignment-cache-miss-browser-contract', setup: 'ui' }),
  'PERSIST.title-alignment-duplicate': Object.freeze({ requirement: 'Duplicated title text and alignment start equal, then remain isolated when either owner is edited', capability: 'persistence', evidence: 'title-alignment-duplicate-browser-contract', setup: 'ui' }),
  'PERSIST.title-alignment-recovery': Object.freeze({ requirement: 'Recovery restores multiline title text, alignment, and an active edit binding', capability: 'persistence', evidence: 'title-alignment-recovery-browser-contract', setup: 'ui' }),
  'LAYOUT.title-alignment-owner-switch': Object.freeze({ requirement: 'Multiline title text and alignment remain isolated when returning to a same-component tab', capability: 'persistence', evidence: 'title-alignment-owner-switch-browser-contract', setup: 'ui' }),
  'PERSIST.multiline-title-draft-save-all': Object.freeze({ requirement: 'Graph and axis title drafts are saved from their owning session while inline editing remains active', capability: 'persistence', evidence: 'multiline-title-live-draft-archive-contract', setup: 'ui' }),
  'LAYOUT.box-reserve-invariants': Object.freeze({ requirement: 'Box layouts preserve panel reserve invariants', capability: 'layout', evidence: 'box-reserve-invariant-contract' }),
  'LAYOUT.box-axis-comparison-clearance': Object.freeze({ requirement: 'Box comparison levels and labels remain separated after manual axis edits with absent or explicit zero tick origins', capability: 'comparison-layout', evidence: 'mixed-sign-five-column-three-comparison-rendered-clearance', setup: 'mixed', transition: 'hydrate-calculate-edit-axis-bounds-rehydrate-tick-origin', environment: 'real-vendor-chromium' }),
  'LAYOUT.scatter-optional-tick-origin': Object.freeze({ requirement: 'Scatter preserves absent versus explicit numeric tick origins on both rendered axes and through archive reopen', capability: 'axis-tick-placement', evidence: 'fractional-manual-bounds-unit-interval-null-blank-missing-zero-custom-origins', setup: 'mixed', transition: 'hydrate-redraw-capture-archive-reopen', environment: 'real-vendor-chromium' }),
  'LAYOUT.small-viewport-stability': Object.freeze({ requirement: 'All eleven component pages avoid document and body overflow from phone through desktop widths after cross-component activation, including a 640×450 CSS viewport equivalent to a 1280×900 desktop at 200% zoom', capability: 'layout', evidence: 'small-viewport-stability-contract' }),
  'LAYOUT.live-resize-responsive-stack': Object.freeze({ requirement: 'Surface and UpSet graph marks remain visible during graph-frame resizing in stacked responsive layouts', capability: 'layout', evidence: 'responsive-stacked-live-resize-browser-contract' }),
  'LAYOUT.scatter-dense-live-resize': Object.freeze({ requirement: 'Dense Scatter marks remain visible and its graph frame changes during continuous resize in a stacked mobile layout', capability: 'layout', evidence: 'dense-scatter-live-resize-frame-contract' }),
  'LAYOUT.reduced-motion-live-resize': Object.freeze({ requirement: 'All component graphs expand and shrink on both axes before pointer release and every published graph remains visible with reduced motion enabled', capability: 'layout', evidence: 'reduced-motion-live-size-and-publication-browser-contract', setup: 'ui', environment: 'reduced-motion' }),
  'LAYOUT.legend-viewport-invariant': Object.freeze({ requirement: 'Legend visibility does not alter plot geometry', capability: 'layout', evidence: 'legend-viewport-invariant-contract' }),
  'CACHE.tab-switch-reuse': Object.freeze({ requirement: 'Tab switching reuses only owner-valid render state', capability: 'render-cache', evidence: 'tab-switch-cache-reuse-contract' }),
  'CACHE.render-cache-mutation-adapters': Object.freeze({ requirement: 'Render-cache variants use explicit component data adapters', capability: 'render-cache', evidence: 'render-cache-mutation-adapter-contract' }),
  'OWN.workspace-grid-dimensions': Object.freeze({ requirement: 'Workspace grid dimensions remain owner-scoped', capability: 'tab-isolation', evidence: 'workspace-grid-dimensions-contract' }),
  'OWN.style-control-tab-isolation': Object.freeze({ requirement: 'Style controls remain isolated by tab', capability: 'tab-isolation', evidence: 'style-control-isolation-contract' }),
  'OWN.unsaved-close-decisions': Object.freeze({ requirement: 'Close decisions use the owning document dirty state', capability: 'dirty-state', evidence: 'unsaved-close-decision-contract' }),
  'OWN.workspace-tab-reorder': Object.freeze({ requirement: 'Pointer and keyboard tab reordering preserve moved tab identity, focus, and active component ownership; normal reopen and crash recovery keep only the active-tab highlight while keyboard focus on inactive tabs remains inset and visible in normal and forced colors', capability: 'tab-isolation', evidence: 'workspace-tab-reorder-and-reopen-recovery-focus-contract', setup: 'mixed', transition: 'reorder-reopen-recover-focus-pointer-forced-colors', environment: 'real-vendor-chromium' })
  , 'OWN.ag-grid-edit-overflow': Object.freeze({ requirement: 'AG Grid overflow edits remain owner-scoped', capability: 'grid-ownership', evidence: 'ag-grid-edit-overflow-contract' })
  , 'LAYOUT.ag-grid-grouped-header-seams': Object.freeze({ requirement: 'Grouped AG Grid headers hide internal seams and preserve visible outer borders for populated native column spans, including hover, while outer resize handles stay usable in Box, Scatter, Line 2D/3D, and PCA', capability: 'grid-border-contract', evidence: 'ag-grid-grouped-header-seam-contract', setup: 'ui' })
  , 'OWN.ag-grid-keyboard-selection': Object.freeze({ requirement: 'AG Grid keyboard selection remains owner-scoped', capability: 'grid-ownership', evidence: 'ag-grid-keyboard-selection-contract' })
  , 'OWN.ag-grid-clipboard-outline-late-paste': Object.freeze({ requirement: 'A delayed paste may clear only the clipboard outline captured when that paste began', capability: 'tab-isolation', evidence: 'delayed-paste-outline-generation-and-owner-contract', setup: 'ui', transition: 'same-type-tab-switch-and-new-copy-during-delayed-paste' })
  , 'OWN.ag-grid-header-menu-paste-owner': Object.freeze({ requirement: 'An asynchronous column-header paste commits to the table that opened its menu across a same-type tab switch', capability: 'tab-isolation', evidence: 'delayed-header-menu-paste-owner-contract', setup: 'ui', transition: 'same-type-tab-switch-during-header-menu-clipboard-read' })
  , 'LAYOUT.ag-grid-selection-scrollbar': Object.freeze({ requirement: 'AG Grid keeps colored selection outlines, compact 20px data rows, visible range-fill cell borders, and pinned-row outline geometry clear of the scrollbar', capability: 'grid-selection-visual-state', evidence: 'ag-grid-selection-outline-and-fill-contract', setup: 'ui' })
  , 'LAYOUT.ag-grid-native-selection': Object.freeze({ requirement: 'Selection and clipboard borders and fill handles share native scrolling content, preserve cell-relative offsets immediately on both axes, split pinned panes without extra internal borders, and keep pinned-row corner handles fully visible and clickable without moving the body seam or blocking the first body row, including actual 300 percent browser zoom', capability: 'native-grid-selection-anchoring', evidence: 'immediate-before-callback-chromium-pane-and-corner-geometry-handle-hit-testing-and-actual-browser-zoom-screenshots', setup: 'mixed', transition: 'select-body-range-pinned-rows-pinned-columns-copy-native-scroll-pinned-corner-hit-test-browser-zoom', environment: 'real-vendor-chromium' })
  , 'LAYOUT.ag-grid-formula-reference-outline': Object.freeze({ requirement: 'Box and Scatter formula reference outlines share their referenced cells native row panes, retain cell-relative offsets during immediate two-axis scroll, and use square corners with a selected-cell-matched stroke', capability: 'native-grid-formula-reference-anchoring', evidence: 'real-vendor-chromium-immediate-scroll-pane-ancestry-and-computed-stroke', setup: 'ui', transition: 'edit-formula-select-references-and-scroll-both-axes', environment: 'real-vendor-chromium' })
  , 'DOM.hot-native-selection': Object.freeze({ requirement: 'Shared native selection projections preserve pinned seams, merged headers, virtualized rows, cell geometry and table-owned observer disposal', capability: 'native-grid-selection-projection', evidence: 'native-pane-fixture-and-mutation-microtask-contract', setup: 'api', transition: 'select-scroll-recycle-virtualize-destroy-sibling-owner', environment: 'jsdom-fake-vendor-no-compositing-claim' })
  , 'LAYOUT.ag-grid-pinned-row-scroll': Object.freeze({ requirement: 'Pinned AG Grid columns remain visibly aligned when horizontal scrolling is routed through the shared scrollbar', capability: 'grid-layout', evidence: 'ag-grid-pinned-row-scroll-contract' })
  , 'PERSIST.ag-grid-column-reorder-undo': Object.freeze({ requirement: 'AG Grid column reorder undo is durable and owner-scoped', capability: 'grid-persistence', evidence: 'ag-grid-column-reorder-undo-contract' })
    , 'IMPORT.prism-multi-dataset': Object.freeze({ requirement: 'Prism imports route and render every supported v1 single-table fixture, preserve mixed-table and multi-graph boundaries, persist styles and graph subtype metadata when the owning tab becomes inactive, render PZFX parts-of-a-whole data, and apply confirmed styles, axes, and saved automatic bounds', capability: 'data-import', evidence: 'prism-v1-render-sweep-multi-dataset-owner-inactive-confirmed-style-and-automatic-axis-range-browser-contract' })
  , 'EXPORT.format-dimensions': Object.freeze({ requirement: 'Export format dimensions preserve the requested physical geometry', capability: 'export-geometry', evidence: 'export-format-dimensions-contract' })
  , 'EXPORT.multiline-hybrid-title': Object.freeze({ requirement: 'Hybrid SVG raster layers preserve positioned multiline title text and alignment', capability: 'export-fidelity', evidence: 'hybrid-svg-multiline-title-browser-contract' })
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
  , 'OWN.line-uncertainty-band-isolation': Object.freeze({ requirement: 'Line uncertainty and statistics-advisor state remain isolated by tab and survive reopen', capability: 'tab-isolation', evidence: 'line-uncertainty-and-advisor-tab-isolation-contract' })
  , 'OWN.box-svg-drag-deactivation': Object.freeze({ requirement: 'Box SVG label drags are cancelled when their owner tab deactivates', capability: 'tab-isolation', evidence: 'shared-svg-drag-owner-deactivation-contract' })
  , 'OWN.font-toolbar-graph-text': Object.freeze({ requirement: 'Graph text font controls remain isolated by component owner', capability: 'style-ownership', evidence: 'font-toolbar-graph-text-contract' })
  , 'OWN.legend-font-toolbar': Object.freeze({ requirement: 'Legend font controls remain isolated by component owner', capability: 'style-ownership', evidence: 'legend-font-toolbar-contract' })
  , 'OWN.pie-chart-type-controls': Object.freeze({ requirement: 'Pie chart-type controls remain isolated by tab', capability: 'component-modes', evidence: 'pie-chart-type-control-contract' })
  , 'OWN.pie-advisor-stale-owner': Object.freeze({ requirement: 'Retained Pie advisor toggle cannot mutate an inactive tab session', capability: 'owner-isolation', evidence: 'pie-advisor-stale-owner-session-regression', setup: 'api', transition: 'same-type-tab-switch-retained-advisor-toggle' })
  , 'OWN.pie-example-stale-owner': Object.freeze({ requirement: 'Retained Pie example button cannot load data into an inactive tab session', capability: 'owner-isolation', evidence: 'pie-example-stale-owner-session-regression', setup: 'api', transition: 'same-type-tab-switch-retained-example-button' })
  , 'BOOTSTRAP.browser-smoke': Object.freeze({ requirement: 'Browser smoke uses the supported application bootstrap', capability: 'bootstrap', evidence: 'browser-bootstrap-smoke' })
  , 'BOOTSTRAP.browser-component-bundles': Object.freeze({ requirement: 'Declared browser component bundles register their matching workspace component', capability: 'bootstrap', evidence: 'lazy-component-bundle-registration-contract', setup: 'api' })
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
  , 'STATS.ui-presentation-branches': Object.freeze({ requirement: 'Rendered statistical panels expose their supported presentation branches', capability: 'statistics', evidence: 'rendered-statistics-branches', setup: 'mixed' })
  , 'STATS.ui-persistence-restore': Object.freeze({ requirement: 'Statistical panels survive component switching and payload or cache restore', capability: 'statistics', evidence: 'ui-statistics-restore-contract', setup: 'mixed' })
  , 'PERSIST.box-indexed-style-session-write': Object.freeze({ requirement: 'Box indexed style edits write through to the owning session before capture', capability: 'session-persistence', evidence: 'box-indexed-style-session-write-contract', setup: 'mixed' })
  , 'PERSIST.box-indexed-styles.tab-isolation': Object.freeze({ requirement: 'Box indexed styles remain independent across same-type tab activation', capability: 'session-ownership', evidence: 'box-indexed-style-tab-isolation-contract', setup: 'mixed' })
  , 'PERSIST.box-indexed-styles.recovery': Object.freeze({ requirement: 'Box indexed styles survive canonical recovery through owner-session persistence', capability: 'recovery-persistence', evidence: 'box-indexed-style-canonical-recovery', setup: 'mixed' })
  , 'UNIT.box-indexed-styles-model': Object.freeze({ requirement: 'Box indexed-style transformations preserve column identity through structural edits', capability: 'component-model', evidence: 'box-indexed-styles-model-unit', setup: 'api' })
  , 'ARCH.static-contracts': Object.freeze({ requirement: 'Architecture rules enforce source and ownership boundaries', capability: 'architecture-governance', evidence: 'static-architecture-contracts' })
  , 'ARCH.module-call-map': Object.freeze({ requirement: 'Generated module map includes bootstrap and worker files plus literal worker consumers', capability: 'architecture-governance', evidence: 'generated-module-call-map-coverage' })
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
  , 'UNIT.scatter-lowess-model': Object.freeze({ requirement: 'Scatter LOWESS model preserves fit inputs, predictions, and diagnostics', capability: 'statistics', evidence: 'scatter-lowess-model-unit-contract' })
  , 'UNIT.regression-catalog': Object.freeze({ requirement: 'Regression catalog entries expose complete model metadata', capability: 'statistics', evidence: 'regression-catalog-unit-contract' })
  , 'UNIT.stats-adjust': Object.freeze({ requirement: 'Multiple-comparison adjustment methods preserve statistical definitions', capability: 'statistics', evidence: 'stats-adjust-unit-contract' })
  , 'UNIT.stats-goodness-of-fit': Object.freeze({ requirement: 'Goodness-of-fit helpers report valid diagnostics', capability: 'statistics', evidence: 'stats-goodness-of-fit-unit-contract' })
  , 'UNIT.stats-corrections': Object.freeze({ requirement: 'P-value correction helpers preserve supported correction semantics', capability: 'statistics', evidence: 'stats-corrections-unit-contract' })
  , 'UNIT.svg-geometry': Object.freeze({ requirement: 'SVG geometry helpers produce stable rendered coordinates', capability: 'svg-geometry', evidence: 'svg-geometry-unit-contract' })
  , 'UNIT.theme-adapters': Object.freeze({ requirement: 'Theme adapters normalize supported theme inputs', capability: 'theme-model', evidence: 'theme-adapters-unit-contract' })
  , 'UNIT.theme-catalog': Object.freeze({ requirement: 'Theme catalog entries and per-type defaults remain complete and unique', capability: 'theme-model', evidence: 'theme-catalog-defaults-unit-contract' })
  , 'UNIT.theme-compiler': Object.freeze({ requirement: 'Theme compiler emits deterministic style tokens', capability: 'theme-model', evidence: 'theme-compiler-unit-contract' })
  , 'UNIT.cartesian-layout': Object.freeze({ requirement: 'Cartesian layout helpers preserve frame and plot contracts', capability: 'layout-model', evidence: 'cartesian-layout-unit-contract' })
  , 'UNIT.text-block-layout': Object.freeze({ requirement: 'Multiline SVG text blocks preserve styled lines, spacing, alignment anchors, and rotation when positioned', capability: 'text-layout-model', evidence: 'text-block-layout-unit-contract' })
  , 'UNIT.data-view-persistence': Object.freeze({ requirement: 'DataView persistence preserves replayable source state', capability: 'data-views', evidence: 'data-view-persistence-unit-contract' })
  , 'UNIT.string-analysis': Object.freeze({ requirement: 'STRING analysis request normalization is deterministic', capability: 'external-analysis', evidence: 'string-analysis-unit-contract' })
  , 'UNIT.uniprot': Object.freeze({ requirement: 'UniProt helper requests preserve supported identifiers', capability: 'external-analysis', evidence: 'uniprot-unit-contract' })
  , 'UNIT.graph-archive': Object.freeze({ requirement: 'Graph archive helpers preserve archive schema boundaries', capability: 'archive', evidence: 'graph-archive-unit-contract' })
  , 'UNIT.debug-contract': Object.freeze({ requirement: 'Debug instrumentation remains gated and structured', capability: 'diagnostics', evidence: 'debug-contract-unit-contract' })
  , 'UNIT.diagnostic-evidence': Object.freeze({ requirement: 'Diagnostic evidence keeps bounded owner, lifecycle, and cache provenance', capability: 'diagnostics', evidence: 'diagnostic-evidence-unit-contract' })
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
  , 'UNIT.box-report-text-migration': Object.freeze({ requirement: 'New Box reports use grammatical methods text and saved v3 reports migrate with corrected sentence boundaries', capability: 'statistics-reporting-migration', evidence: 'box-report-text-migration-unit-contract' })
  , 'UNIT.component-load-benchmarks': Object.freeze({ requirement: 'Component load benchmarks report reproducible boundaries', capability: 'performance', evidence: 'component-load-benchmark-unit-contract' })
  , 'UNIT.go-analysis': Object.freeze({ requirement: 'GO analysis helpers preserve supported request semantics', capability: 'external-analysis', evidence: 'go-analysis-unit-contract' })
  , 'UNIT.graph-archive-roundtrip': Object.freeze({ requirement: 'Graph archive round trips preserve durable session fields', capability: 'archive', evidence: 'graph-archive-roundtrip-unit-contract' })
  , 'UNIT.hot-ui-state': Object.freeze({ requirement: 'Shared table UI-state capture and restore preserve viewport, selection, widths, and owner isolation', capability: 'grid-persistence', evidence: 'hot-ui-state-unit-contract' })
  , 'UNIT.line-model-helpers': Object.freeze({ requirement: 'Line model helpers preserve series and projection semantics', capability: 'rendering-model', evidence: 'line-model-helpers-unit-contract' })
  , 'UNIT.regression-logistic-summary': Object.freeze({ requirement: 'Logistic regression summaries preserve interpretation fields', capability: 'statistics-reporting', evidence: 'regression-logistic-summary-unit-contract' })
  , 'UNIT.welcome-assets': Object.freeze({ requirement: 'Welcome assets remain generated from the declared source examples', capability: 'generated-artifacts', evidence: 'welcome-assets-unit-contract' })
  , 'DOM.color-scheme-svg': Object.freeze({ requirement: 'Color-scheme projection updates rendered SVG state', capability: 'style-projection', evidence: 'color-scheme-svg-dom-contract' })
  , 'DOM.color-scheme-default-authority': Object.freeze({ requirement: 'Component color-scheme defaults resolve through the theme catalog', capability: 'theme-model', evidence: 'color-scheme-default-authority-dom-contract', setup: 'api', transition: 'catalog-default-update-to-component-resolution', environment: 'jest-dom' })
  , 'DOM.color-scheme-ownership': Object.freeze({ requirement: 'Color-scheme controls remain isolated by owner', capability: 'style-ownership', evidence: 'color-scheme-ownership-dom-contract', setup: 'api', transition: 'edit-colors-refresh-select-palette-and-undo', environment: 'jest-dom' })
  , 'DOM.color-scheme-live-owner': Object.freeze({ requirement: 'Color-scheme identity and application use the active owner session when the saved payload is stale', capability: 'live-style-ownership', evidence: 'color-scheme-live-owner-dom-contract' })
  , 'DOM.svg-sizing': Object.freeze({ requirement: 'SVG sizing projection preserves graph-frame dimensions', capability: 'svg-layout', evidence: 'svg-sizing-dom-contract' })
  , 'DOM.svg-interaction': Object.freeze({ requirement: 'SVG interactions update the owning projection', capability: 'svg-interaction', evidence: 'svg-interaction-dom-contract' })
  , 'DOM.frame-publication': Object.freeze({ requirement: 'Frame publication exposes one owner-valid rendered frame', capability: 'render-publication', evidence: 'frame-publication-dom-contract' })
  , 'DOM.title-editing': Object.freeze({ requirement: 'Title editing projects and persists the owner value', capability: 'interaction', evidence: 'title-editing-dom-contract' })
  , 'DOM.title-edit-checkpoint-undo': Object.freeze({ requirement: 'Inline title checkpoints join font changes in owner-scoped chronological undo without tracking the temporary editor', capability: 'undo-redo', evidence: 'title-edit-checkpoint-dom-contract' })
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
  , 'DOM.venn-numeric-controls': Object.freeze({ requirement: 'Venn numeric set names and counts remain aligned and editable', capability: 'component-controls', evidence: 'venn-numeric-mode-controls' })
  , 'DOM.plot3d-rendering': Object.freeze({ requirement: '3D projection and rendering preserve viewport geometry', capability: 'three-dimensional-view', evidence: 'plot3d-rendering-dom-contract' })
  , 'DOM.plot3d-gestures': Object.freeze({ requirement: '3D gestures update the owning viewport only', capability: 'three-dimensional-view', evidence: 'plot3d-gestures-dom-contract' })
  , 'DOM.hist-scheduler-ownership': Object.freeze({ requirement: 'Histogram scheduler updates the owning tab only', capability: 'async-ownership', evidence: 'hist-scheduler-ownership-dom-contract' })
  , 'DOM.grid-controls': Object.freeze({ requirement: 'Grid controls project through the owning table', capability: 'grid-ownership', evidence: 'grid-controls-dom-contract' })
  , 'DOM.significance-controls': Object.freeze({ requirement: 'Significance controls preserve Box inference state', capability: 'statistics', evidence: 'significance-controls-dom-contract' })
  , 'DOM.notes': Object.freeze({ requirement: 'Notes controls remain owned by the active tab', capability: 'notes', evidence: 'notes-dom-contract' })
  , 'DOM.toolbar-overflow': Object.freeze({ requirement: 'Toolbar overflow preserves control reachability', capability: 'toolbar', evidence: 'toolbar-overflow-dom-contract' })
  , 'DOM.chart-style': Object.freeze({ requirement: 'Chart-style controls project stable shared styles', capability: 'style-projection', evidence: 'chart-style-dom-contract' })
  , 'DOM.exporter-projection': Object.freeze({ requirement: 'Exporter projection preserves rendered content and explicit background policy for SVG and SVG-string sources', capability: 'export', evidence: 'exporter-projection-dom-contract', setup: 'api', transition: 'source-and-export-policy-to-serialized-artifact', environment: 'jsdom' })
  , 'DOM.exporter-multiline-title': Object.freeze({ requirement: 'Static SVG export preserves multiline title baselines, alignment, and viewport geometry', capability: 'export', evidence: 'exporter-multiline-title-dom-contract' })
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
  , 'DOM.welcome-graph-actions': Object.freeze({ requirement: 'Grouped welcome actions launch new graphs and built-in examples', capability: 'welcome-entry', evidence: 'welcome-graph-actions-contract', setup: 'ui' })
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
  , 'DOM.requested-defaults': Object.freeze({ requirement: 'Data-aware defaults project without overriding explicit choices and examples use the default palette on their first rendered frame', capability: 'component-modes', evidence: 'payload-picker-first-rendered-example-palette-and-sibling-owner-regression', setup: 'ui', transition: 'load-welcome-example-check-first-frame-default-and-return-to-sibling', environment: 'jsdom-and-real-vendor-chromium' })
  , 'DOM.scatter-adaptive-size': Object.freeze({ requirement: 'Scatter adaptive sizing preserves readable projection bounds', capability: 'layout', evidence: 'scatter-adaptive-size-dom-contract' })
  , 'DOM.table-import-aggrid-paste': Object.freeze({ requirement: 'AG Grid paste imports into the canonical table source', capability: 'data-import', evidence: 'table-import-aggrid-paste-dom-contract' })
  , 'DOM.table-import-owner': Object.freeze({ requirement: 'Table import commits to the owning component tab', capability: 'data-import', evidence: 'table-import-owner-dom-contract' })
  , 'OWN.table-import-delayed-owner-switch': Object.freeze({ requirement: 'A delayed shared table import updates its originating tab after switching to a same-type sibling', capability: 'owner-isolation', evidence: 'table-import-delayed-file-read-owner-session-and-projection-regression', setup: 'api', transition: 'pause-file-read-switch-to-sibling-then-complete-owner-import' })
  , 'DOM.table-import-prism': Object.freeze({ requirement: 'Prism import projects the selected dataset into the owning table and scopes axis thickness/tick decoding away from per-series border records', capability: 'data-import', evidence: 'table-import-prism-dom-and-axis-record-contract' })
  , 'DOM.fileio-activation': Object.freeze({ requirement: 'File I/O activation preserves the active owner boundary', capability: 'archive', evidence: 'fileio-activation-dom-contract' })
  , 'OWN.workspace-save-owner-scope': Object.freeze({ requirement: 'Workspace archive saves remain workspace-scoped while a component tab is active', capability: 'owner-isolation', evidence: 'workspace-save-unscoped-from-component-owner', setup: 'api', transition: 'save-workspace-archive-with-active-component-tab' })
  , 'DOM.hot-aggrid-binding': Object.freeze({ requirement: 'AG Grid binding preserves owner and table identity', capability: 'grid-ownership', evidence: 'hot-aggrid-binding-dom-contract' })
  , 'DOM.hot-aggrid-clipboard': Object.freeze({ requirement: 'AG Grid clipboard projection preserves table data', capability: 'grid-clipboard', evidence: 'hot-aggrid-clipboard-dom-contract' })
  , 'DOM.hot-filter-owner-isolation': Object.freeze({ requirement: 'Shared AG Grid column filters remain independent across table instances', capability: 'grid-ownership', evidence: 'hot-filter-model-table-instance-isolation', setup: 'api', transition: 'two-table-filter-apply-to-owner-local-models' })
  , 'DOM.hot-aggrid-dimensions': Object.freeze({ requirement: 'AG Grid dimensions project stable table geometry', capability: 'grid-layout', evidence: 'hot-aggrid-dimensions-dom-contract' })
  , 'DOM.hot-exclusions': Object.freeze({ requirement: 'Grid exclusions project through the canonical payload', capability: 'data-views', evidence: 'hot-exclusions-dom-contract' })
  , 'DOM.surface-legend': Object.freeze({ requirement: 'Surface legend projection preserves viewport geometry', capability: 'layout', evidence: 'surface-legend-dom-contract' })
  , 'DOM.toolbar-numeric-shared': Object.freeze({ requirement: 'Shared numeric toolbar controls preserve valid projection values', capability: 'shared-controls', evidence: 'toolbar-numeric-shared-dom-contract' })
  , 'A11Y.accessible-workspace-controls': Object.freeze({ requirement: 'Workspace controls expose names and linked tab panels; keyboard activation, pointer-focus modality, target-size debt outside compact grid rows, narrow layout, reduced motion, and forced-colors focus are checked', capability: 'accessibility-responsive-motion', evidence: 'axe-target-size-keyboard-responsive-motion-forced-colors-browser-contract' })
  , 'A11Y.pointer-focus-modality': Object.freeze({ requirement: 'Pointer focus leaves value fields, checkboxes, Notes, graph zoom, portaled filters, and their focus wrappers visually unchanged while keyboard focus stays visible', capability: 'focus-modality', evidence: 'pointer-focus-rings-and-keyboard-indicator-browser-contract' })
  , 'A11Y.shared-css-hidden-utilities': Object.freeze({ requirement: 'Visually hidden text remains available to accessible names, and native hidden elements stay hidden against later component display rules', capability: 'css-accessibility-utilities', evidence: 'shared-css-accessibility-utilities-computed-style-contract' })
  , 'A11Y.aggrid-filter-condition-fields': Object.freeze({ requirement: 'The numeric AG Grid filter portal preserves value-field styling while condition modes show, hide, and reveal one or two inputs', capability: 'ag-grid-filter-controls', evidence: 'ag-grid-numeric-condition-field-styling-browser-contract' })
  , 'A11Y.customizable-select-behavior': Object.freeze({ requirement: 'Native selects keep themed customizable pickers where supported and preserve keyboard selection with visible focus', capability: 'native-select-accessibility', evidence: 'native-select-picker-theme-and-keyboard-browser-contract' })
  , 'A11Y.coarse-pointer-grid-targets': Object.freeze({ requirement: 'Graph resize corners remain 24px targets on touch-capable devices while AG Grid rows stay compact', capability: 'target-size', evidence: 'coarse-pointer-all-workspace-grid-target-contract' })
  , 'LAYOUT.ag-grid-fixed-compact-layout': Object.freeze({ requirement: 'All component tables preserve the fixed 20px row layout and matching header geometry', capability: 'ag-grid-single-layout', evidence: 'all-component-ag-grid-fixed-layout-and-header-contract' })
  , 'A11Y.forced-colors-state-cues': Object.freeze({ requirement: 'Selected and pressed controls remain visually identifiable in forced-colors mode across all component workspaces', capability: 'forced-colors', evidence: 'forced-colors-selected-state-browser-contract' })
  , 'A11Y.text-spacing-reflow': Object.freeze({ requirement: 'WCAG text-spacing overrides keep welcome dialogs and component controls usable at narrow widths', capability: 'text-spacing-reflow', evidence: 'wcag-text-spacing-viewport-contract' })
  , 'A11Y.actual-browser-zoom': Object.freeze({ requirement: 'Welcome and all component workspaces remain reachable at actual 200% browser zoom', capability: 'browser-zoom', evidence: 'actual-200-percent-browser-zoom-contract' })
  , 'A11Y.enlarged-ui-text': Object.freeze({ requirement: 'Welcome, its example gallery, and all eleven component workspaces remain reachable when rendered UI text is enlarged to 200%', capability: 'text-enlargement', evidence: 'welcome-and-all-workspaces-200-percent-ui-text-contract' })
  , 'LAYOUT.enlarged-ui-text-reflow': Object.freeze({ requirement: 'At 1024×768 with 200% UI text, visible actions remain reachable without page overflow or clipping', capability: 'text-enlargement-reflow', evidence: '1024x768-200-percent-ui-text-reflow-contract' })
  , 'A11Y.toolbar-menu-keyboard': Object.freeze({ requirement: 'Workspace toolbar menus support keyboard navigation, dismissal, and focus return', capability: 'keyboard-menu', evidence: 'workspace-toolbar-menu-keyboard-contract' })
  , 'A11Y.application-menu-keyboard': Object.freeze({ requirement: 'Workspace-tab and DataViews export menus support keyboard opening or activation, roving focus, dismissal, and focus return', capability: 'keyboard-menu', evidence: 'shared-application-menu-keyboard-contract' })
  , 'A11Y.data-view-menu-owner-lifecycle': Object.freeze({ requirement: 'DataViews export menus close with their owning workspaces and remain closed on same-type return', capability: 'owner-lifecycle', evidence: 'data-view-menu-owner-deactivation-contract' })
  , 'A11Y.ag-grid-context-menu-keyboard': Object.freeze({ requirement: 'AG Grid context actions use named menu semantics, keyboard navigation, focus return, and short-viewport positioning', capability: 'keyboard-menu', evidence: 'ag-grid-context-menu-keyboard-contract' })
  , 'A11Y.ag-grid-context-menu-owner-lifecycle': Object.freeze({ requirement: 'AG Grid context and column-filter popups close when their owning workspace tab deactivates, and the newly active same-type owner can open a fresh filter popup', capability: 'owner-lifecycle-and-rebind', evidence: 'ag-grid-popup-owner-deactivation-contract' })
  , 'A11Y.ag-grid-popup-archive-reopen': Object.freeze({ requirement: 'AG Grid context and column-filter popups close across archive reopen and their controls remain usable', capability: 'archive-popup-lifecycle', evidence: 'ag-grid-popup-archive-reopen-contract' })
  , 'A11Y.ag-grid-filter-popup-state': Object.freeze({ requirement: 'AG Grid column-filter triggers expose expanded state and identify their open dialog', capability: 'popup-expanded-state', evidence: 'ag-grid-column-filter-expanded-controls-contract' })
  , 'A11Y.ag-grid-filter-popup-targets': Object.freeze({ requirement: 'AG Grid column-filter controls and choice rows meet 24px targets and remain inside a short viewport', capability: 'popup-target-sizing', evidence: 'ag-grid-filter-popup-target-and-viewport-contract' })
  , 'A11Y.data-view-switcher': Object.freeze({ requirement: 'Data view buttons expose their named group and pressed state, retain focus after activation, and focus the active view after close', capability: 'keyboard-button-group', evidence: 'data-view-switcher-keyboard-focus-contract' })
  , 'LAYOUT.font-combo-short-viewport': Object.freeze({ requirement: 'Font-family and preset-size listboxes open by pointer, stay inside a 320×400 viewport, and close without dismissing the active editor across all eleven workspaces', capability: 'responsive-popup', evidence: 'short-viewport-font-combo-listbox-contract' })
  , 'LAYOUT.color-scheme-short-viewport': Object.freeze({ requirement: 'The shared color-scheme listbox stays within a 320×400 viewport with reachable 24px options in all eleven workspaces', capability: 'responsive-popup', evidence: 'short-viewport-color-scheme-listbox-contract' })
  , 'LAYOUT.graph-options-short-viewport': Object.freeze({ requirement: 'The Heatmap graph-options menu and visible controls stay within a 320×400 viewport', capability: 'responsive-menu', evidence: 'short-viewport-graph-options-contract' })
  , 'A11Y.color-scheme-listbox-keyboard': Object.freeze({ requirement: 'The color-scheme listbox opens and moves by keyboard, exposes its active option, and returns focus when Escape closes it', capability: 'keyboard-listbox', evidence: 'color-scheme-listbox-keyboard-browser-contract' })
  , 'A11Y.color-scheme-owner-lifecycle': Object.freeze({ requirement: 'The shared color-scheme listbox closes on owner deactivation and stays closed on same-type return across all eleven workspaces', capability: 'owner-lifecycle', evidence: 'color-scheme-listbox-owner-deactivation-contract' })
  , 'A11Y.box-formula-suggestion-target-size': Object.freeze({ requirement: 'Box formula function suggestions meet the 24px minimum pointer-target size', capability: 'target-size', evidence: 'box-formula-suggestion-target-size-browser-contract' })
  , 'A11Y.box-formula-suggestion-combobox': Object.freeze({ requirement: 'The shared formula editor exposes a labeled combobox, its controlled suggestion list, and the active option during keyboard navigation', capability: 'combobox-accessibility', evidence: 'box-formula-suggestion-combobox-browser-contract' })
  , 'A11Y.box-formula-signature-tooltip': Object.freeze({ requirement: 'The shared function-signature tooltip is exposed as a tooltip and associated with its active formula editor', capability: 'accessible-description', evidence: 'shared-formula-signature-tooltip-relationship-contract' })
  , 'LAYOUT.box-formula-assist-short-viewport': Object.freeze({ requirement: 'Box formula suggestions and function-signature tooltip stay within a 320×400 viewport', capability: 'responsive-popup', evidence: 'box-formula-assist-short-viewport-contract' })
  , 'A11Y.box-formula-suggestion-owner-lifecycle': Object.freeze({ requirement: 'The body-portaled Box formula suggestion list closes when its same-type workspace tab deactivates and stays closed on return', capability: 'owner-lifecycle', evidence: 'box-formula-suggestion-owner-deactivation-contract' })
  , 'A11Y.box-formula-tooltip-owner-lifecycle': Object.freeze({ requirement: 'The body-portaled Box formula-signature tooltip closes when its same-type workspace tab deactivates and stays closed on return', capability: 'owner-lifecycle', evidence: 'box-formula-tooltip-owner-deactivation-contract' })
  , 'A11Y.font-combo-keyboard': Object.freeze({ requirement: 'Shared font family and size comboboxes retain input focus, announce active listbox options, and support keyboard selection and dismissal across all eleven workspaces', capability: 'combobox-accessibility', evidence: 'shared-font-combobox-keyboard-contract' })
  , 'A11Y.font-combo-owner-lifecycle': Object.freeze({ requirement: 'Font-family suggestions and preset or editable font-size menus close on same-component tab changes and remain closed when the original owner is restored across all eleven workspaces', capability: 'owner-lifecycle', evidence: 'font-combobox-same-type-owner-lifecycle-contract' })
  , 'A11Y.dropdown-cursor': Object.freeze({ requirement: 'Dropdown options use a selection pointer without selectable text while editable fields retain text editing', capability: 'dropdown-pointer', evidence: 'all-component-dropdown-hover-and-keyboard-contract', setup: 'ui', transition: 'open-hover-dismiss-keyboard-select', environment: 'browser' })
  , 'A11Y.overlay-checkbox-row': Object.freeze({ requirement: 'Scatter and Line overlay labels toggle once from text, row padding and the checkbox while preserving the open menu; disabled rows stay inert and keyboard and outside dismissal remain usable', capability: 'checkbox-disclosure-activation', evidence: 'real-browser-text-padding-native-checkbox-disabled-and-keyboard-contract', setup: 'mixed', transition: 'calculate-open-toggle-text-padding-checkbox-disable-keyboard-dismiss', environment: 'real-vendor-chromium' })
  , 'DIRTY.overlay-menu-disclosure': Object.freeze({ requirement: 'Opening the Scatter or Line overlay menu preserves a clean document and its revision; changing an overlay marks the owning document dirty', capability: 'presentation-disclosure-dirty-tracking', evidence: 'real-browser-clean-revision-open-and-native-checkbox-change-contract', setup: 'mixed', transition: 'calculate-mark-clean-open-menu-toggle-overlay', environment: 'real-vendor-chromium' })
  , 'A11Y.editable-combobox-state': Object.freeze({ requirement: 'Editable comboboxes share available-option filtering, active-option projection, and predictable keyboard movement', capability: 'combobox-state', evidence: 'editable-combobox-shared-state-contract' })
  , 'A11Y.shared-resizer-menu-target-size': Object.freeze({ requirement: 'Graph-options triggers and visible graph-option controls meet the 24px minimum pointer-target size across graph workspaces', capability: 'target-size', evidence: 'shared-resizer-menu-target-size-browser-contract' })
  , 'A11Y.shared-panel-svg-keyboard': Object.freeze({ requirement: 'All workspace dividers and graph labels are keyboard reachable and preserve their positions through archive reopen', capability: 'keyboard-resize-and-svg-movement', evidence: 'shared-panel-divider-label-legend-keyboard-browser-contract' })
  , 'A11Y.point-label-position-reopen': Object.freeze({ requirement: 'Scatter and PCA point labels remain keyboard-movable and owner-scoped after 2D and 3D cache archive reopen', capability: 'keyboard-label-persistence', evidence: 'point-label-cache-rehydrate-browser-contract', setup: 'ui', environment: 'archive-reopen' })
  , 'A11Y.axis-number-format-listbox': Object.freeze({ requirement: 'The axis number-format listbox exposes its controlled popup, supports keyboard navigation, and returns focus on Escape in four supported Cartesian workspaces', capability: 'keyboard-listbox', evidence: 'axis-number-format-listbox-browser-contract' })
  , 'A11Y.axis-number-format-owner-lifecycle': Object.freeze({ requirement: 'The axis number-format listbox closes on same-type owner deactivation in four supported Cartesian workspaces', capability: 'owner-lifecycle', evidence: 'axis-number-format-owner-deactivation-contract' })
  , 'LAYOUT.axis-number-format-short-viewport': Object.freeze({ requirement: 'The axis number-format listbox stays within a 320×400 viewport in four supported Cartesian workspaces', capability: 'responsive-popup', evidence: 'short-viewport-axis-number-format-contract' })
  , 'A11Y.axis-config-popup-dialogs': Object.freeze({ requirement: 'Box, Line and Scatter axis additional-ticks and broken-axis popups expose named controlled dialogs, move focus into content on open, and restore it on Escape', capability: 'dialog-focus-return', evidence: 'axis-config-dialog-focus-browser-contract' })
  , 'LAYOUT.axis-config-popup-short-viewport': Object.freeze({ requirement: 'Box, Line and Scatter axis additional-ticks and broken-axis dialogs stay within a 320×400 viewport', capability: 'responsive-dialog', evidence: 'short-viewport-axis-config-dialog-contract' })
  , 'A11Y.axis-config-popup-owner-lifecycle': Object.freeze({ requirement: 'Box, Line and Scatter additional-ticks and broken-axis dialogs close on same-type owner deactivation and remain closed after return', capability: 'owner-lifecycle', evidence: 'axis-config-popup-owner-deactivation-contract' })
  , 'LAYOUT.floating-menu-viewport-clamping': Object.freeze({ requirement: 'Shared floating-menu positioning measures hidden menus before viewport clamping and preserves visibility state', capability: 'menu-positioning', evidence: 'shared-hidden-menu-viewport-clamp-contract' })
  , 'A11Y.color-picker-open-state': Object.freeze({ requirement: 'The shared color picker returns keyboard focus, suppresses pointer rings on its portaled value field, and keeps its expanded palette usable on short phone screens', capability: 'keyboard-popup-reflow-focus-modality', evidence: 'expanded-palette-axe-geometry-and-portaled-value-focus-contract' })
  , 'A11Y.color-picker-owner-lifecycle': Object.freeze({ requirement: 'The shared color picker closes for a deactivated tab and discards native or eyedropper results from an earlier owner', capability: 'owner-scoped-async-popup', evidence: 'color-picker-owner-deactivation-and-stale-picker-result-contract' })
  , 'LAYOUT.light-only-color-preference': Object.freeze({ requirement: 'The shared picker matches the declared light color scheme under light and dark OS preferences', capability: 'color-scheme-consistency', evidence: 'light-only-color-preference-picker-contract' })
  , 'LAYOUT.format-tabs-phone-hit-targets': Object.freeze({ requirement: 'All eleven component Format tabs receive pointer input at 320px after cross-component activation', capability: 'responsive-toolbar', evidence: 'all-component-format-tab-phone-hit-target-contract' })
  , 'A11Y.point-context-menu-keyboard': Object.freeze({ requirement: 'PCA and Scatter point menus support keyboard navigation, close on owner-tab deactivation, reject stale actions, and return focus after redraw', capability: 'keyboard-menu-owner-lifecycle', evidence: 'point-context-menu-keyboard-contract' })
  , 'A11Y.chart-point-keyboard-navigation': Object.freeze({ requirement: 'Charts provide a named plot entry and owner-safe keyboard navigation to interactive marks; dense Scatter avoids per-point tab stops and remains available through its data grid', capability: 'keyboard-chart-navigation', evidence: 'sparse-and-dense-chart-point-keyboard-contract' })
  , 'A11Y.3d-rotation-keyboard': Object.freeze({ requirement: 'Scatter, PCA, Line, and Surface 3D graphs expose a named keyboard rotation target, rotate with Shift+Arrow keys, preserve visible focus, and update only the owning session', capability: 'keyboard-3d-rotation', evidence: 'all-3d-component-keyboard-rotation-browser-contract' })
  , 'A11Y.shared-grid-keyboard-entry': Object.freeze({ requirement: 'Dense Scatter fallback enters its named AG Grid through one viewport Tab stop, focuses the first displayed cell, and retains visible keyboard focus', capability: 'keyboard-grid-entry', evidence: 'dense-scatter-grid-keyboard-entry-contract' })
  , 'A11Y.analysis-result-tabs-keyboard': Object.freeze({ requirement: 'Venn, Box, and Pie result tablists support arrow/Home/End focus movement and manual keyboard activation', capability: 'keyboard-tabs', evidence: 'analysis-result-tabs-keyboard-browser-contract' })
  , 'A11Y.analysis-result-tabs-owner-isolation': Object.freeze({ requirement: 'Venn, Box, and Pie result-tab choices persist with their owning sessions across same-type tab activation', capability: 'tab-state-ownership', evidence: 'analysis-result-tabs-owner-isolation-browser-contract', setup: 'ui', transition: 'same-type-tab-switch' })
  , 'A11Y.reduced-motion-document-open': Object.freeze({ requirement: 'Document-open progress and transaction feedback remain available with reduced motion', capability: 'reduced-motion', evidence: 'document-open-reduced-motion-browser-contract' })
  , 'A11Y.reduced-motion-clipboard-outline': Object.freeze({ requirement: 'AG Grid clipboard outlines keep their marching animation when reduced motion is enabled', capability: 'reduced-motion', evidence: 'ag-grid-clipboard-outline-reduced-motion-browser-contract', setup: 'ui', transition: 'copy-cell-under-reduced-motion', environment: 'reduced-motion' })
  , 'A11Y.reduced-motion-heavy-draw': Object.freeze({ requirement: 'Heavy-draw status, cancellation, retry, and successful completion remain available with reduced motion', capability: 'reduced-motion', evidence: 'heavy-draw-reduced-motion-browser-contract' })
  , 'A11Y.reduced-motion-scroll-controls': Object.freeze({ requirement: 'Welcome carousel and workspace-tab arrows honor reduced-motion changes at startup and during the session', capability: 'reduced-motion', evidence: 'reduced-motion-explicit-scroll-browser-contract' })
  , 'A11Y.modal-lifecycle': Object.freeze({ requirement: 'Dialogs contain keyboard focus, block the background, and restore focus with explicit Escape behavior', capability: 'modal-accessibility', evidence: 'shared-modal-lifecycle-browser-contract' })
  , 'A11Y.help-center': Object.freeze({ requirement: 'Help topics work from Welcome and every workspace toolbar, remain usable on short viewports, preserve modal keyboard behavior, and provide a GitHub issue link and direct email option for feedback', capability: 'help-center', evidence: 'help-center-navigation-responsive-feedback-links-contract', setup: 'ui', transition: 'welcome-or-toolbar-to-help-topic' })
  , 'A11Y.shared-style-panel-owner-lifecycle': Object.freeze({ requirement: 'Box Grid and Heatmap Dendrogram panels close when their owning tab deactivates', capability: 'owner-lifecycle', evidence: 'shared-style-panel-owner-deactivation-contract', setup: 'ui', transition: 'same-type-tab-switch', environment: 'same-type-tabs' })
});

const RAW_SCENARIO_CATALOG = Object.freeze([
  Object.freeze({ id: 'STYLE.publication-live-projection', kind: 'contract', contract: 'STYLE', components: ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'], requirement: 'Publication presets project typography and visibility into the owning live component without loading tables, resetting data views, or replacing statistical results and notes; same-type tab switching retains the styled owner and original sibling defaults', capability: 'publication-live-projection', evidence: 'all-component-live-table-view-and-statistics-browser-contract', setup: 'mixed', transition: 'example-and-existing-results-to-style-new-tab-and-owner-return', environment: 'real-vendor-chromium' }),
  Object.freeze({ id: 'LAYOUT.publication-axis-strokes', kind: 'contract', contract: 'LAYOUT', components: ['box'], requirement: 'All publisher presets render print-point axis thickness scaled to preset width, reaching the full-width maximum, while PLOS retains fixed 0.2 mm strokes', capability: 'publication-axis-strokes', evidence: 'sixteen-publisher-width-presets-rendered-stroke-browser-contract', setup: 'ui', transition: 'apply-each-publisher-width-preset', environment: 'real-vendor-chromium' }),
  Object.freeze({ id: 'LAYOUT.publication-manual-sizing', kind: 'contract', contract: 'LAYOUT', components: ['box'], requirement: 'Publication frame resizing preserves dataset spacing and the live automatic marker baseline, matches equivalent manual axis edits, and survives undo, redo, same-type switching and archive reopen', capability: 'publication-sizing', evidence: 'manual-axis-preset-geometry-marker-browser-contract', setup: 'mixed', transition: 'preset-undo-redo-switch-save-reopen-manual-axis-edit', environment: 'real-vendor-chromium' }),
  Object.freeze({ id: 'DOM.publication-live-style-source', kind: 'contract', contract: 'DOM', components: [], requirement: 'Publisher presets capture live owner state, preserve dataset spacing and retain manual resize defaults rather than replacing them with preset dimensions', capability: 'publication-sizing', evidence: 'live-source-stale-layout-preset-dom-contract', setup: 'api', transition: 'live-style-to-preset', environment: 'jsdom' }),
  Object.freeze({ id: 'LAYOUT.axis-length-zoom', kind: 'contract', contract: 'LAYOUT', components: ['venn', 'box', 'scatter', 'pca', 'line', 'roc', 'survival', 'hist', 'pie'], requirement: 'Axis toolbar lengths, millimetre conversion and physical-size edits stay independent of display zoom in editable 2D modes; zoom alone preserves frame, SVG geometry and export dimensions', capability: 'axis-length-editing', evidence: 'independent-svg-matrix-and-toolbar-browser-contract', setup: 'ui', transition: 'zoom-read-edit-half-zoom-convert-units', environment: 'real-vendor-chromium' }),
  Object.freeze({ id: 'LAYOUT.pca-explicit-axis-model', kind: 'contract', contract: 'LAYOUT', components: ['pca'], requirement: 'Explicit PCA numerical domains and plot rails survive full redraw, archive hydration with and without a render cache, and sibling tab edits; stale automatic-layout caches are rejected; data, method, selected axes, tick interval and equal-length changes invalidate the model while preserving equal physical coordinate scales', capability: 'axis-length-persistence', evidence: 'pca-explicit-axis-model-browser-contract', setup: 'ui', transition: 'edit-stale-cache-rejection-redraw-cached-and-uncached-reopen-sibling-edit-coordinate-invalidation', environment: 'real-vendor-chromium' }),
  Object.freeze({ id: 'LAYOUT.axis-length-zoom-reopen', kind: 'contract', contract: 'LAYOUT', components: ['box', 'pca'], requirement: 'Canonical axis dimensions edited at half zoom survive archive reopen at a different display zoom', capability: 'axis-length-persistence', evidence: 'production-archive-axis-geometry-browser-contract', setup: 'ui', transition: 'half-zoom-axis-edit-save-reopen', environment: 'real-vendor-chromium' }),
  Object.freeze({ id: 'DOM.zoom-frame-projection', kind: 'contract', contract: 'LAYOUT', components: [], requirement: 'Display zoom preserves canonical dimensions and aspect policy without rerunning legacy or Cartesian resize constraints', capability: 'figure-viewing', evidence: 'locked-frame-zoom-projection-dom-contract', setup: 'api', transition: 'locked-frame-zoom-half-enlarged-full', environment: 'jsdom' }),
  Object.freeze({ id: 'DOM.axis-length-zoom-refinement', kind: 'contract', contract: 'DOM', components: [], requirement: 'Canonical wheel and input axis-length edits retain latest-owner generation semantics at half, full and enlarged zoom and display measured rather than cached requested values', capability: 'axis-length-editing', evidence: 'scaled-dom-frame-and-axis-refinement-contract', setup: 'api', transition: 'wheel-input-newer-request-refinement', environment: 'jsdom-fake-timers' }),
  Object.freeze({ id: 'PERSIST.scatter-data-aware-color-override', kind: 'contract', contract: 'PERSIST', components: ['scatter'], requirement: 'A blank Scatter tab keeps its automatic palette policy in its owner session until a palette is explicitly chosen; repeated category labels select the categorical palette, unique point labels retain the grayscale special case, and explicit palette choices survive paste and payload capture', capability: 'scatter-data-aware-palette-policy', evidence: 'data-aware-defaults-scatter-owner-policy-chromium-contract', setup: 'blank-tab-and-example-dataset', transition: 'automatic-manual-override-grouped-and-unique-label-paste', environment: 'real-vendor-chromium' }),
  Object.freeze({ id: 'STYLE.scatter-point-toolbar-color', kind: 'contract', components: ['scatter'], requirement: 'Scatter fill controls display the current rendered point color after palette changes and scope changes, and preserve individual color edits', capability: 'point-color-toolbar', evidence: 'chromium-example-palette-and-scoped-color-edit-contract', setup: 'mixed', transition: 'palette-change-select-point-switch-scope-edit-color', environment: 'real-vendor-chromium' }),
  Object.freeze({ id: 'LAYOUT.data-transform-selection-position', kind: 'contract', contract: 'LAYOUT', components: ['box', 'scatter', 'line', 'pca', 'heatmap', 'hist', 'surface'], requirement: 'Multiple remains at its lower centered position before and after Apply and Clear appear, without shifting adjacent toolbar content', capability: 'toolbar', evidence: 'checkbox-label-and-row-geometry-across-toggle', setup: 'ui', transition: 'unchecked-checked-unchecked', environment: 'chromium-wide-and-narrow' }),
  Object.freeze({ id: 'LAYOUT.new-tab-defaults-after-reopen', kind: 'contract', contract: 'LAYOUT', components: ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'], requirement: 'Blank same-component tabs use original divider proportions and graph dimensions before and after archive reopen; returning to the saved tab preserves its modified layout', capability: 'layout', evidence: 'new-tab-layout-reopen-all-component-browser-contract', setup: 'ui', transition: 'resize-save-new-tab-reopen-new-tab-return', environment: 'chromium-loaded-examples-and-blank-tabs' }),
  Object.freeze({id:'OWN.fixture-bootstrap-lifetime',kind:'contract',contract:'OWN',components:['box','scatter']}),
  Object.freeze({id:'OWN.live-session-access',kind:'contract',contract:'OWN',components:['box','scatter']}),
  Object.freeze({ id: 'LAYOUT.view-mode-owner-archive', kind: 'contract', contract: 'LAYOUT', components: ['scatter'], requirement: 'Fit/manual view intent and canonical size controls remain owner-isolated; manual zoom and non-default pixel dimensions survive archive reopen and legacy archives retain saved zoom', capability: 'figure-view-persistence', evidence: 'scatter-view-mode-owner-archive-browser-contract', setup: 'hybrid', transition: 'same-type-owner-switch-archive-legacy-reopen' }),
  Object.freeze({ id: 'LAYOUT.fixed-default-fit', kind: 'contract', contract: 'LAYOUT', components: ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'], requirement: 'New figures use 360px square frames and identical default zoom for each browser size; the separate controls header contains its buttons without constraining graph zoom; session-owned fit/manual intent preserves saved geometry and exports', capability: 'figure-sizing', evidence: 'fixed-default-fit-all-component-browser-contract', setup: 'ui', transition: 'new-window-fit-manual-export' }),
  Object.freeze({ id: 'GOVERNANCE.component-catalog', kind: 'governance', components: ['*'] }),
  Object.freeze({ id: 'A11Y.accessible-workspace-controls', kind: 'contract', contract: 'A11Y', components: ['*'], requirement: 'Workspace controls expose names and linked tab panels; keyboard activation, pointer-focus modality, compact-grid target debt, narrow layout, reduced motion, and forced-colors focus are checked', capability: 'accessibility-responsive-motion', evidence: 'axe-target-size-keyboard-responsive-motion-forced-colors-browser-contract', setup: 'ui' }),
  Object.freeze({ id: 'A11Y.pointer-focus-modality', kind: 'contract', contract: 'A11Y', components: ['*'], requirement: 'Across every toolbar section, pointer focus leaves value fields, checkboxes, and their wrappers visually unchanged while keyboard focus stays visible', capability: 'focus-modality', evidence: 'pointer-focus-rings-and-keyboard-indicator-browser-contract', setup: 'ui' }),
  Object.freeze({ id: 'A11Y.shared-css-hidden-utilities', kind: 'contract', contract: 'A11Y', components: ['*'], requirement: 'Visually hidden text remains available to accessible names, and native hidden elements stay hidden against later component display rules', capability: 'css-accessibility-utilities', evidence: 'shared-css-accessibility-utilities-computed-style-contract', setup: 'ui', environment: 'chromium' }),
  Object.freeze({ id: 'A11Y.aggrid-filter-condition-fields', kind: 'contract', contract: 'A11Y', components: ['scatter'], requirement: 'The real numeric AG Grid filter portal retains field styling across one-field, two-field, and hidden condition modes', capability: 'ag-grid-filter-controls', evidence: 'ag-grid-numeric-condition-field-styling-browser-contract', setup: 'ui' }),
  Object.freeze({ id: 'A11Y.customizable-select-behavior', kind: 'contract', contract: 'A11Y', components: ['scatter'], requirement: 'Native selects keep their themed customizable picker and keyboard selection works with visible focus in Chrome', capability: 'native-select-accessibility', evidence: 'native-select-picker-theme-and-keyboard-browser-contract', setup: 'ui' }),
  Object.freeze({ id: 'A11Y.coarse-pointer-grid-targets', kind: 'contract', contract: 'A11Y', components: ['*'], requirement: 'Graph resize corners remain 24px targets on touch-capable devices while AG Grid rows stay compact', capability: 'target-size', evidence: 'coarse-pointer-all-workspace-grid-target-contract', setup: 'ui' }),
  Object.freeze({ id: 'LAYOUT.ag-grid-fixed-compact-layout', kind: 'contract', contract: 'LAYOUT', components: ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'], requirement: 'All component tables preserve the fixed 20px row layout and matching header geometry', capability: 'ag-grid-single-layout', evidence: 'all-component-ag-grid-fixed-layout-and-header-contract', setup: 'ui' }),
  Object.freeze({ id: 'A11Y.forced-colors-state-cues', kind: 'contract', contract: 'A11Y', components: ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'], requirement: 'Selected and pressed controls remain visually identifiable in forced-colors mode across all component workspaces', capability: 'forced-colors', evidence: 'forced-colors-selected-state-browser-contract', setup: 'ui' }),
  Object.freeze({ id: 'A11Y.text-spacing-reflow', kind: 'contract', contract: 'A11Y', components: ['*'], requirement: 'WCAG text-spacing overrides keep welcome dialogs and component controls usable at narrow widths', capability: 'text-spacing-reflow', evidence: 'wcag-text-spacing-viewport-contract', setup: 'ui' }),
  Object.freeze({ id: 'A11Y.actual-browser-zoom', kind: 'contract', contract: 'A11Y', components: ['*'], requirement: 'Welcome and all component workspaces remain reachable at actual 200% browser zoom', capability: 'browser-zoom', evidence: 'actual-200-percent-browser-zoom-contract', setup: 'ui' }),
  Object.freeze({ id: 'A11Y.enlarged-ui-text', kind: 'contract', contract: 'A11Y', components: ['*'], requirement: 'Welcome, its example gallery, and all eleven component workspaces remain reachable when rendered UI text is enlarged to 200%', capability: 'text-enlargement', evidence: 'welcome-and-all-workspaces-200-percent-ui-text-contract', setup: 'ui', environment: '1024x768-text-200-percent' }),
  Object.freeze({ id: 'LAYOUT.enlarged-ui-text-reflow', kind: 'contract', contract: 'LAYOUT', components: ['*'], requirement: 'At 1024×768 with 200% UI text, visible actions remain reachable without page overflow or clipping', capability: 'text-enlargement-reflow', evidence: '1024x768-200-percent-ui-text-reflow-contract', setup: 'ui', environment: '1024x768-text-200-percent' }),
  Object.freeze({ id: 'A11Y.toolbar-menu-keyboard', kind: 'contract', contract: 'A11Y', components: ['line'], requirement: 'Workspace toolbar menus support keyboard navigation, dismissal, and focus return', capability: 'keyboard-menu', evidence: 'workspace-toolbar-menu-keyboard-contract', setup: 'ui' }),
  Object.freeze({ id: 'A11Y.application-menu-keyboard', kind: 'contract', contract: 'A11Y', components: ['line'], requirement: 'Workspace-tab and DataViews export menus support keyboard opening or activation, roving focus, dismissal, and focus return', capability: 'keyboard-menu', evidence: 'shared-application-menu-keyboard-contract', setup: 'ui' }),
  Object.freeze({ id: 'A11Y.data-view-menu-owner-lifecycle', kind: 'contract', contract: 'A11Y', components: ['box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'], requirement: 'DataViews export menus close with their owning workspaces and remain closed on same-type return across all ten DataViews-enabled workspaces', capability: 'owner-lifecycle', evidence: 'data-view-menu-owner-deactivation-contract', setup: 'same-type-tabs' }),
  Object.freeze({ id: 'A11Y.shared-style-panel-owner-lifecycle', kind: 'contract', contract: 'A11Y', components: ['box', 'heatmap'], requirement: 'Box Grid and Heatmap Dendrogram panels close when their owning tab deactivates', capability: 'owner-lifecycle', evidence: 'shared-style-panel-owner-deactivation-contract', setup: 'ui', transition: 'same-type-tab-switch', environment: 'same-type-tabs' }),
  Object.freeze({ id: 'A11Y.ag-grid-context-menu-keyboard', kind: 'contract', contract: 'A11Y', components: ['scatter'], requirement: 'AG Grid context actions use named menu semantics, keyboard navigation, focus return, and short-viewport positioning', capability: 'keyboard-menu', evidence: 'ag-grid-context-menu-keyboard-contract', setup: 'ui', environment: '320x400' }),
  Object.freeze({ id: 'A11Y.ag-grid-context-menu-owner-lifecycle', kind: 'contract', contract: 'A11Y', components: ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'], requirement: 'AG Grid context and column-filter popups close when their owning workspace tab deactivates across all eleven workspaces, and each new same-type owner can open a fresh filter popup', capability: 'owner-lifecycle-and-rebind', evidence: 'ag-grid-popup-owner-deactivation-contract', setup: 'same-type-tabs' }),
  Object.freeze({ id: 'A11Y.ag-grid-popup-archive-reopen', kind: 'contract', contract: 'A11Y', components: ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'], requirement: 'AG Grid context and column-filter popups close across archive reopen and their controls remain usable', capability: 'archive-popup-lifecycle', evidence: 'ag-grid-popup-archive-reopen-contract', setup: 'ui', environment: 'archive-reopen' }),
  Object.freeze({ id: 'A11Y.ag-grid-filter-popup-state', kind: 'contract', contract: 'A11Y', components: ['scatter'], requirement: 'AG Grid column-filter triggers expose expanded state and identify their open dialog', capability: 'popup-expanded-state', evidence: 'ag-grid-column-filter-expanded-controls-contract', setup: 'same-type-tabs' }),
  Object.freeze({ id: 'A11Y.ag-grid-filter-popup-targets', kind: 'contract', contract: 'A11Y', components: ['scatter'], requirement: 'AG Grid column-filter controls and choice rows meet 24px targets and remain inside a short viewport', capability: 'popup-target-sizing', evidence: 'ag-grid-filter-popup-target-and-viewport-contract', setup: 'ui', environment: '320x400' }),
  Object.freeze({ id: 'A11Y.data-view-switcher', kind: 'contract', contract: 'A11Y', components: ['*'], requirement: 'Data view buttons expose their named group and pressed state, retain focus after activation, and focus the active view after close', capability: 'keyboard-button-group', evidence: 'data-view-switcher-keyboard-focus-contract', setup: 'ui' }),
  Object.freeze({ id: 'A11Y.color-picker-open-state', kind: 'contract', contract: 'A11Y', components: ['box', 'venn'], requirement: 'The shared color picker returns keyboard focus, suppresses pointer rings on its portaled value field, and keeps its expanded palette usable on short phone screens', capability: 'keyboard-popup-reflow-focus-modality', evidence: 'expanded-palette-axe-geometry-and-portaled-value-focus-contract', setup: 'ui' }),
  Object.freeze({ id: 'A11Y.color-picker-owner-lifecycle', kind: 'contract', contract: 'A11Y', components: ['box', 'venn', 'scatter', 'pca', 'line', 'hist', 'pie', 'roc', 'survival'], requirement: 'The shared color picker closes for a deactivated tab and discards native or eyedropper results from an earlier owner', capability: 'owner-scoped-async-popup', evidence: 'color-picker-owner-deactivation-and-stale-picker-result-contract', setup: 'ui', environment: 'same-type-tabs' }),
  Object.freeze({ id: 'LAYOUT.light-only-color-preference', kind: 'contract', contract: 'LAYOUT', components: ['box'], requirement: 'The shared picker matches the declared light color scheme under light and dark OS preferences', capability: 'color-scheme-consistency', evidence: 'light-only-color-preference-picker-contract', setup: 'ui', environment: 'light-and-dark-color-scheme' }),
  Object.freeze({ id: 'LAYOUT.box-conditional-controls', kind: 'contract', contract: 'LAYOUT', components: ['box'], requirement: 'Box conditional controls remain visible for supported graph types and grouped table format', capability: 'component-controls', evidence: 'box-conditional-control-visibility-contract', setup: 'ui' }),
  Object.freeze({ id: 'LAYOUT.graph-resize-boundary', kind: 'contract', contract: 'LAYOUT', components: ['box', 'scatter', 'pie', 'venn', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist'], requirement: 'Small graphs retain a visible hittable resize grip; detached boundaries appear on graph hover and during drag without changing export geometry', capability: 'resize-boundary-presentation', evidence: 'all-component-small-graph-grip-and-guide-contract', transition: 'resize-and-hover', setup: 'ui' }),
  Object.freeze({ id: 'LAYOUT.graph-frame-theme', kind: 'contract', contract: 'LAYOUT', components: ['scatter'], requirement: 'Graph frame and attached footer seam follow dark-to-light theme changes', capability: 'graph-frame-theme', evidence: 'scatter-dark-to-light-frame-and-footer-contract', transition: 'dark-to-light-theme', setup: 'ui' }),
  Object.freeze({ id: 'LAYOUT.graph-controls-header', kind: 'contract', contract: 'LAYOUT', components: ['box', 'scatter', 'pie', 'venn', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist'], requirement: 'Graph controls are unique and remain in their owner-local normal-flow header above the SVG container', capability: 'controls-host-projection', evidence: 'all-component-header-placement-and-control-uniqueness-contract', transition: 'initial-render', setup: 'ui' }),
  Object.freeze({ id: 'LAYOUT.graph-envelope-containment', kind: 'contract', contract: 'LAYOUT', components: ['box', 'scatter', 'pie', 'venn', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist'], requirement: 'Published graph reserves have a visible container envelope and resize grips stay within the outer frame', capability: 'content-envelope-containment', evidence: 'all-component-small-graph-envelope-and-handle-contract', transition: 'resize', setup: 'ui' }),
  Object.freeze({ id: 'LAYOUT.surface-envelope-zoom', kind: 'contract', contract: 'LAYOUT', components: ['surface'], requirement: 'Surface color-scale labels and resize grips remain inside the visible frame at 50, 95, and 100 percent zoom without changing the SVG viewBox', capability: 'content-envelope-containment', evidence: 'surface-color-scale-frame-and-zoom-contract', transition: 'zoom', setup: 'ui' }),
  Object.freeze({ id: 'LAYOUT.grouped-controls-visibility', kind: 'contract', contract: 'LAYOUT', components: ['box', 'pca', 'line', 'scatter'], requirement: 'Data toolbar Replicates group precedes transforms, supports mouse and keyboard switching at wide/narrow widths, and preserves grouped input visibility', capability: 'component-controls', evidence: 'cross-component-grouped-controls-visibility-contract', setup: 'ui' }),
  Object.freeze({ id: 'LAYOUT.venn-conditional-controls', kind: 'contract', contract: 'LAYOUT', components: ['venn'], requirement: 'Venn region-copy, analysis-export, and advanced-option controls use native hidden state and track visible transitions', capability: 'component-controls', evidence: 'venn-conditional-controls-visibility-contract', setup: 'ui' }),
  Object.freeze({ id: 'LAYOUT.scatter-graph-control-visibility', kind: 'contract', contract: 'LAYOUT', components: ['scatter'], requirement: 'Scatter graph-type, view, threshold, significant-label, and density-palette controls use native hidden state through type and view transitions', capability: 'component-controls', evidence: 'scatter-graph-controls-visibility-contract', setup: 'ui' }),
  Object.freeze({ id: 'LAYOUT.line-forecast-controls-visibility', kind: 'contract', contract: 'LAYOUT', components: ['line'], requirement: 'Line forecast controls use native hidden state across regression modes', capability: 'component-controls', evidence: 'line-forecast-controls-visibility-contract', setup: 'ui' }),
  Object.freeze({ id: 'LAYOUT.heatmap-inference-controls-visibility', kind: 'contract', contract: 'LAYOUT', components: ['heatmap'], requirement: 'Heatmap decision-marker, multiple-testing, and target-FDR controls are hidden until correlation inference is enabled', capability: 'component-controls', evidence: 'heatmap-inference-checkbox-browser-visibility-contract', setup: 'ui', transition: 'show-inference-off-on-off', environment: 'real-vendor-chromium' }),
  Object.freeze({ id: 'LAYOUT.heatmap-title-undo-viewport', kind: 'contract', contract: 'LAYOUT', components: ['heatmap'], requirement: 'Heatmap title undo and redo restore the original graph viewport geometry', capability: 'title-undo-viewport', evidence: 'heatmap-title-undo-viewport-browser-contract', setup: 'ui', transition: 'expand-title-undo-redo-and-compare-viewport', environment: 'real-vendor-chromium' }),
  Object.freeze({ id: 'PERSIST.box-conditional-controls-reopen', kind: 'contract', contract: 'PERSIST', components: ['box'], requirement: 'Box conditional-control visibility restores from the saved graph type and table format after archive reopen', capability: 'component-controls', evidence: 'box-conditional-control-archive-reopen-contract', setup: 'ui' }),
  Object.freeze({ id: 'LAYOUT.format-tabs-phone-hit-targets', kind: 'contract', contract: 'LAYOUT', components: ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'], requirement: 'All eleven component Format tabs receive pointer input at 320px after cross-component activation', capability: 'responsive-toolbar', evidence: 'all-component-format-tab-phone-hit-target-contract', setup: 'ui', environment: '320x400' }),
  Object.freeze({ id: 'A11Y.point-context-menu-keyboard', kind: 'contract', contract: 'A11Y', components: ['pca', 'scatter'], requirement: 'PCA and Scatter point menus support keyboard navigation, close on owner-tab deactivation, reject stale actions, and return focus after redraw', capability: 'keyboard-menu-owner-lifecycle', evidence: 'point-context-menu-keyboard-contract', setup: 'ui' }),
  Object.freeze({ id: 'A11Y.chart-point-keyboard-navigation', kind: 'contract', contract: 'A11Y', components: ['venn', 'heatmap', 'pca', 'scatter', 'box', 'line', 'pie', 'hist', 'roc', 'survival'], requirement: 'Charts provide a named plot entry and owner-safe keyboard navigation to interactive marks; dense Scatter avoids per-point tab stops and remains available through its data grid', capability: 'keyboard-chart-navigation', evidence: 'sparse-and-dense-chart-point-keyboard-contract', setup: 'ui' }),
  Object.freeze({ id: 'A11Y.3d-rotation-keyboard', kind: 'contract', contract: 'A11Y', components: ['scatter', 'pca', 'line', 'surface'], requirement: 'Scatter, PCA, Line, and Surface 3D graphs expose a named keyboard rotation target, rotate with Shift+Arrow keys, preserve visible focus, and update only the owning session', capability: 'keyboard-3d-rotation', evidence: 'all-3d-component-keyboard-rotation-browser-contract', setup: 'ui', environment: 'loaded-examples' }),
  Object.freeze({ id: 'A11Y.shared-grid-keyboard-entry', kind: 'contract', contract: 'A11Y', components: ['scatter'], requirement: 'Dense Scatter fallback enters its named AG Grid through one viewport Tab stop, focuses the first displayed cell, and retains visible keyboard focus', capability: 'keyboard-grid-entry', evidence: 'dense-scatter-grid-keyboard-entry-contract', setup: 'ui' }),
  Object.freeze({ id: 'A11Y.analysis-result-tabs-keyboard', kind: 'contract', contract: 'A11Y', components: ['venn', 'box', 'pie'], requirement: 'Venn, Box, and Pie result tablists support arrow/Home/End focus movement and manual keyboard activation', capability: 'keyboard-tabs', evidence: 'analysis-result-tabs-keyboard-browser-contract', setup: 'ui' }),
  Object.freeze({ id: 'A11Y.analysis-result-tabs-owner-isolation', kind: 'contract', contract: 'A11Y', components: ['venn', 'box', 'pie'], requirement: 'Venn, Box, and Pie result-tab choices persist with their owning sessions across same-type tab activation', capability: 'tab-state-ownership', evidence: 'analysis-result-tabs-owner-isolation-browser-contract', setup: 'ui', transition: 'same-type-tab-switch', environment: 'same-type-tabs' }),
  Object.freeze({ id: 'A11Y.reduced-motion-document-open', kind: 'contract', contract: 'A11Y', components: ['*'], requirement: 'Document-open progress and transaction feedback remain available with reduced motion', capability: 'reduced-motion', evidence: 'document-open-reduced-motion-browser-contract', setup: 'ui' }),
  Object.freeze({ id: 'A11Y.reduced-motion-clipboard-outline', kind: 'contract', contract: 'A11Y', components: ['box'], requirement: 'AG Grid clipboard outlines keep their marching animation when reduced motion is enabled', capability: 'reduced-motion', evidence: 'ag-grid-clipboard-outline-reduced-motion-browser-contract', setup: 'ui', transition: 'copy-cell-under-reduced-motion', environment: 'reduced-motion' }),
  Object.freeze({ id: 'A11Y.reduced-motion-heavy-draw', kind: 'contract', contract: 'A11Y', components: ['box'], requirement: 'Heavy-draw status, cancellation, retry, and successful completion remain available with reduced motion', capability: 'reduced-motion', evidence: 'heavy-draw-reduced-motion-browser-contract', setup: 'ui' }),
  Object.freeze({ id: 'A11Y.reduced-motion-scroll-controls', kind: 'contract', contract: 'A11Y', components: ['*'], requirement: 'Welcome carousel and workspace-tab arrows honor reduced-motion changes at startup and during the session', capability: 'reduced-motion', evidence: 'reduced-motion-explicit-scroll-browser-contract', setup: 'ui', environment: 'runtime-media-change' }),
  Object.freeze({ id: 'A11Y.modal-lifecycle', kind: 'contract', contract: 'A11Y', components: ['*'], requirement: 'Dialogs contain keyboard focus, block the background, and restore focus with explicit Escape behavior', capability: 'modal-accessibility', evidence: 'shared-modal-lifecycle-browser-contract', setup: 'ui' }),
  Object.freeze({ id: 'A11Y.help-center', kind: 'contract', contract: 'A11Y', components: ['*'], requirement: 'Help topics work from Welcome and every workspace toolbar, remain usable on short viewports, preserve modal keyboard behavior, and provide a GitHub issue link and direct email option for feedback', capability: 'help-center', evidence: 'help-center-navigation-responsive-feedback-links-contract', setup: 'ui', transition: 'welcome-or-toolbar-to-help-topic' }),
  Object.freeze({ id: 'LAYOUT.modal-short-viewport', kind: 'contract', contract: 'LAYOUT', components: ['*'], requirement: 'Open-mode, replace-unsaved, and duplicate modal actions remain fully visible and reachable at 320×400', capability: 'responsive-dialog', evidence: 'short-viewport-shared-modal-actions-contract', setup: 'ui', environment: '320x400' }),
  Object.freeze({ id: 'LAYOUT.welcome-search-short-viewport', kind: 'contract', contract: 'LAYOUT', components: ['*'], requirement: 'Welcome graph-search results stay inside a 320×400 viewport and remain pointer-selectable', capability: 'responsive-popup', evidence: 'short-viewport-welcome-search-results-contract', setup: 'ui', environment: '320x400' }),
  Object.freeze({ id: 'LAYOUT.toolbar-menu-short-viewport', kind: 'contract', contract: 'LAYOUT', components: ['line'], requirement: 'The workspace toolbar menu stays inside a 320×400 viewport after toolbar overflow scrolling', capability: 'responsive-menu', evidence: 'short-viewport-toolbar-menu-containment-contract', setup: 'ui', environment: '320x400' }),
  Object.freeze({ id: 'LAYOUT.toolbar-panel-transitions', kind: 'contract', contract: 'LAYOUT', components: ['box'], requirement: 'Trace, reference, grid, axis and font transitions replace complete panels while intentional Symbol + Trace panels remain contained', capability: 'contextual-toolbar-composition', evidence: 'settled-panel-and-control-containment-browser-contract', setup: 'ui', transition: 'trace-reference-grid-axis-font-and-combined-panels', environment: '1920x1080,1024x1080,400px-toolbar' }),
  Object.freeze({ id: 'OWN.toolbar-panel-transitions', kind: 'contract', contract: 'OWN', components: ['box'], requirement: 'Reference-line pattern edits remain owned by their Box tab after toolbar replacement, same-type activation and archive reopen', capability: 'toolbar-edit-ownership', evidence: 'reference-pattern-same-type-owner-browser-contract', setup: 'ui', transition: 'same-type-tab-switch-return-and-archive-reopen', environment: 'same-type-tabs-and-archive' }),
  Object.freeze({ id: 'OWN.reference-line-cache-rehydration', kind: 'contract', contract: 'OWN', components: ['box', 'line', 'scatter'], requirement: 'Cached axis reference lines recover owner-scoped click controls after archive reopen', capability: 'toolbar-edit-ownership', evidence: 'axis-reference-line-click-after-archive-reopen', setup: 'ui', transition: 'axis-add-mark-style-edit-archive-reopen-click', environment: 'chromium-archive-reopen' }),
  Object.freeze({ id: 'LAYOUT.toolbar-font-axis-panels', kind: 'contract', contract: 'LAYOUT', components: ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'], requirement: 'Every workspace opens graph font controls and replaces them with axis controls where the example exposes editable axes', capability: 'contextual-toolbar-composition', evidence: 'per-component-font-axis-transition-browser-contract', setup: 'ui', transition: 'font-axis-font', environment: '1920x1080' }),
  Object.freeze({ id: 'LAYOUT.toolbar-heatmap-companion-panels', kind: 'contract', contract: 'LAYOUT', components: ['heatmap'], requirement: 'Graph palette, font and dendrogram clicks replace the previous complete toolbar panel', capability: 'contextual-toolbar-composition', evidence: 'heatmap-palette-font-dendrogram-browser-contract', setup: 'ui', transition: 'palette-font-palette-dendrogram', environment: '1920x1080' }),
  Object.freeze({ id: 'LAYOUT.workspace-tab-menu-short-viewport', kind: 'contract', contract: 'LAYOUT', components: ['*'], requirement: 'The workspace-tab context menu stays inside a 320×400 viewport', capability: 'responsive-menu', evidence: 'short-viewport-workspace-tab-menu-containment-contract', setup: 'ui', environment: '320x400' }),
  Object.freeze({ id: 'LAYOUT.point-context-menu-short-viewport', kind: 'contract', contract: 'LAYOUT', components: ['pca', 'scatter'], requirement: 'PCA and Scatter point context menus stay inside a 320×400 viewport', capability: 'responsive-menu', evidence: 'short-viewport-point-context-menu-containment-contract', setup: 'ui', environment: '320x400' }),
  Object.freeze({ id: 'LAYOUT.graph-options-short-viewport', kind: 'contract', contract: 'LAYOUT', components: ['heatmap'], requirement: 'The Heatmap graph-options menu and visible controls stay within a 320×400 viewport', capability: 'responsive-menu', evidence: 'short-viewport-graph-options-contract', setup: 'ui', environment: '320x400' }),
  Object.freeze({ id: 'LAYOUT.floating-menu-viewport-clamping', kind: 'contract', contract: 'LAYOUT', components: ['pca', 'scatter'], requirement: 'Shared floating-menu positioning measures hidden menus before viewport clamping and preserves visibility state', capability: 'menu-positioning', evidence: 'shared-hidden-menu-viewport-clamp-contract', setup: 'ui' }),
  Object.freeze({ id: 'LAYOUT.font-combo-short-viewport', kind: 'contract', contract: 'LAYOUT', components: ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'], requirement: 'Font-family and preset-size listboxes open by pointer, stay inside a 320×400 viewport, and close without dismissing the active editor across all eleven workspaces', capability: 'responsive-popup', evidence: 'short-viewport-font-combo-listbox-contract', setup: 'ui', environment: '320x400' }),
  Object.freeze({ id: 'LAYOUT.color-scheme-short-viewport', kind: 'contract', contract: 'LAYOUT', components: ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'], requirement: 'The shared color-scheme listbox stays within a 320×400 viewport with reachable 24px options in all eleven workspaces', capability: 'responsive-popup', evidence: 'short-viewport-color-scheme-listbox-contract', setup: 'ui', environment: '320x400' }),
  Object.freeze({ id: 'A11Y.color-scheme-listbox-keyboard', kind: 'contract', contract: 'A11Y', components: ['box'], requirement: 'The color-scheme listbox opens and moves by keyboard, exposes its active option, and returns focus when Escape closes it', capability: 'keyboard-listbox', evidence: 'color-scheme-listbox-keyboard-browser-contract', setup: 'ui' }),
  Object.freeze({ id: 'A11Y.color-scheme-owner-lifecycle', kind: 'contract', contract: 'A11Y', components: ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'], requirement: 'The shared color-scheme listbox closes on owner deactivation and stays closed on same-type return across all eleven workspaces', capability: 'owner-lifecycle', evidence: 'color-scheme-listbox-owner-deactivation-contract', setup: 'ui', environment: 'same-type-tabs' }),
  Object.freeze({ id: 'A11Y.box-formula-suggestion-target-size', kind: 'contract', contract: 'A11Y', components: ['box'], requirement: 'Box formula function suggestions meet the 24px minimum pointer-target size while remaining usable during formula editing', capability: 'target-size', evidence: 'box-formula-suggestion-target-size-browser-contract', setup: 'ui' }),
  Object.freeze({ id: 'A11Y.box-formula-suggestion-combobox', kind: 'contract', contract: 'A11Y', components: ['box'], requirement: 'The shared formula editor exposes a labeled combobox, its controlled suggestion list, and the active option during keyboard navigation', capability: 'combobox-accessibility', evidence: 'box-formula-suggestion-combobox-browser-contract', setup: 'ui', environment: 'keyboard' }),
  Object.freeze({ id: 'A11Y.box-formula-signature-tooltip', kind: 'contract', contract: 'A11Y', components: ['box', 'scatter'], requirement: 'The shared function-signature tooltip is exposed as a tooltip and associated with its active formula editor', capability: 'accessible-description', evidence: 'shared-formula-signature-tooltip-relationship-contract', setup: 'ui', environment: 'keyboard' }),
  Object.freeze({ id: 'LAYOUT.box-formula-assist-short-viewport', kind: 'contract', contract: 'LAYOUT', components: ['box'], requirement: 'Box formula suggestions and function-signature tooltip stay within a 320×400 viewport', capability: 'responsive-popup', evidence: 'box-formula-assist-short-viewport-contract', setup: 'ui', environment: '320x400' }),
  Object.freeze({ id: 'A11Y.box-formula-suggestion-owner-lifecycle', kind: 'contract', contract: 'A11Y', components: ['box'], requirement: 'The body-portaled Box formula suggestion list closes when its same-type workspace tab deactivates and stays closed on return', capability: 'owner-lifecycle', evidence: 'box-formula-suggestion-owner-deactivation-contract', setup: 'ui', environment: 'same-type-tabs' }),
  Object.freeze({ id: 'A11Y.box-formula-tooltip-owner-lifecycle', kind: 'contract', contract: 'A11Y', components: ['box'], requirement: 'The body-portaled Box formula-signature tooltip closes when its same-type workspace tab deactivates and stays closed on return', capability: 'owner-lifecycle', evidence: 'box-formula-tooltip-owner-deactivation-contract', setup: 'ui', environment: 'same-type-tabs' }),
  Object.freeze({ id: 'A11Y.dropdown-cursor', kind: 'contract', contract: 'A11Y', components: ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'], requirement: 'Dropdown options use a selection pointer without selectable text while editable fields retain text editing', capability: 'dropdown-pointer', evidence: 'all-component-dropdown-hover-and-keyboard-contract', setup: 'ui', transition: 'open-hover-dismiss-keyboard-select', environment: 'browser' }),
  Object.freeze({ id: 'A11Y.font-combo-keyboard', kind: 'contract', contract: 'A11Y', components: ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'], requirement: 'Shared font family and size comboboxes retain input focus, announce active listbox options, and support keyboard selection and dismissal across all eleven workspaces', capability: 'combobox-accessibility', evidence: 'shared-font-combobox-keyboard-contract', setup: 'ui', environment: '320x400-keyboard' }),
  Object.freeze({ id: 'A11Y.font-combo-owner-lifecycle', kind: 'contract', contract: 'A11Y', components: ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'], requirement: 'Font-family suggestions and preset or editable font-size menus close on same-component tab changes and remain closed when the original owner is restored across all eleven workspaces', capability: 'owner-lifecycle', evidence: 'font-combobox-same-type-owner-lifecycle-contract', setup: 'same-type-tabs' }),
  Object.freeze({ id: 'A11Y.overlay-checkbox-row', kind: 'contract', contract: 'A11Y', components: ['scatter', 'line'] }),
  Object.freeze({ id: 'DIRTY.overlay-menu-disclosure', kind: 'contract', contract: 'DIRTY', components: ['scatter', 'line'] }),
  Object.freeze({ id: 'A11Y.editable-combobox-state', kind: 'contract', contract: 'A11Y', components: ['*'], requirement: 'Editable comboboxes share available-option filtering, active-option projection, and predictable keyboard movement', capability: 'combobox-state', evidence: 'editable-combobox-shared-state-contract' }),
  Object.freeze({ id: 'A11Y.shared-resizer-menu-target-size', kind: 'contract', contract: 'A11Y', components: ['*'], requirement: 'Graph-options triggers and visible graph-option controls meet the 24px minimum pointer-target size across graph workspaces', capability: 'target-size', evidence: 'shared-resizer-menu-target-size-browser-contract', setup: 'ui', environment: 'loaded-examples' }),
  Object.freeze({ id: 'A11Y.graph-options-owner-lifecycle', kind: 'contract', contract: 'A11Y', components: ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'], requirement: 'Graph-options disclosures close on owner deactivation across all eleven workspaces; nested axes-length disclosures are covered in Line, PCA and Scatter, and Scatter remains closed after archive render-cache restore', capability: 'owner-lifecycle', evidence: 'graph-options-owner-and-archive-contract', setup: 'same-type-tabs', environment: 'archive-reopen' }),
  Object.freeze({ id: 'A11Y.workspace-toolbar-menu-owner-lifecycle', kind: 'contract', contract: 'A11Y', components: ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'], requirement: 'Workspace toolbar menus close with their owner and stay closed on return across all eleven workspaces', capability: 'owner-lifecycle', evidence: 'workspace-toolbar-menu-owner-deactivation-contract', setup: 'same-type-tabs' }),
  Object.freeze({ id: 'LAYOUT.shared-ui-token-values', kind: 'contract', contract: 'LAYOUT', requirement: 'Shared borders, typography, spacing, control and menu padding, SVG icon sizing, minimum target dimensions, component-owned corner radii, sibling control widths, and Axis disclosure labels retain their established computed values in Chrome', capability: 'css-design-tokens', evidence: 'shared-ui-token-computed-style-contract', setup: 'ui' }),
  Object.freeze({ id: 'LAYOUT.resizer-axes-menu-host-parity', kind: 'contract', contract: 'LAYOUT', requirement: 'Axes-length menus have the same closed and open styling in SVG and graph-control hosts', capability: 'resizer-menu-parity', evidence: 'shared-resizer-axes-menu-style-contract', setup: 'ui' }),
  Object.freeze({ id: 'LAYOUT.pca-grouped-meta-row-surface', kind: 'contract', contract: 'LAYOUT', components: ['pca'], requirement: 'PCA grouped metadata rows retain the shared muted surface color through the normal app cascade without a priority override', capability: 'css-cascade-contract', evidence: 'pca-grouped-meta-row-computed-surface-contract', setup: 'ui', transition: 'grouped-example-load-style-check', environment: 'loaded-example' }),
  Object.freeze({ id: 'A11Y.shared-panel-svg-keyboard', kind: 'contract', contract: 'A11Y', components: ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'], requirement: 'All workspace dividers and graph labels are keyboard reachable and preserve their positions through archive reopen', capability: 'keyboard-resize-and-svg-movement', evidence: 'shared-panel-divider-label-legend-keyboard-browser-contract', setup: 'ui', environment: 'loaded-examples' }),
  Object.freeze({ id: 'A11Y.point-label-position-reopen', kind: 'contract', contract: 'A11Y', components: ['scatter', 'pca'], requirement: 'Scatter and PCA point labels remain keyboard-movable and owner-scoped after 2D and 3D cache archive reopen', capability: 'keyboard-label-persistence', evidence: 'point-label-cache-rehydrate-browser-contract', setup: 'ui', environment: 'archive-reopen' }),
  Object.freeze({ id: 'A11Y.axis-number-format-listbox', kind: 'contract', contract: 'A11Y', components: ['box', 'scatter', 'line', 'hist'], requirement: 'The axis number-format listbox exposes its controlled popup, supports keyboard navigation, and returns focus on Escape in four supported Cartesian workspaces', capability: 'keyboard-listbox', evidence: 'axis-number-format-listbox-browser-contract', setup: 'ui' }),
  Object.freeze({ id: 'A11Y.axis-number-format-owner-lifecycle', kind: 'contract', contract: 'A11Y', components: ['box', 'scatter', 'line', 'hist'], requirement: 'The axis number-format listbox closes on same-type owner deactivation in four supported Cartesian workspaces', capability: 'owner-lifecycle', evidence: 'axis-number-format-owner-deactivation-contract', setup: 'ui', environment: 'same-type-tabs' }),
  Object.freeze({ id: 'LAYOUT.axis-number-format-short-viewport', kind: 'contract', contract: 'LAYOUT', components: ['box', 'scatter', 'line', 'hist'], requirement: 'The axis number-format listbox stays within a 320×400 viewport in four supported Cartesian workspaces', capability: 'responsive-popup', evidence: 'short-viewport-axis-number-format-contract', setup: 'ui', environment: '320x400' }),
  Object.freeze({ id: 'A11Y.axis-config-popup-dialogs', kind: 'contract', contract: 'A11Y', components: ['line', 'box', 'scatter'], requirement: 'Box, Line and Scatter axis additional-ticks and broken-axis popups expose named controlled dialogs, move focus into content on open, and restore it on Escape', capability: 'dialog-focus-return', evidence: 'axis-config-dialog-focus-browser-contract', setup: 'ui' }),
  Object.freeze({ id: 'A11Y.graph-size-controls', kind: 'contract', contract: 'A11Y', components: ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'], requirement: 'Every graph workspace exposes labeled keyboard-operable width and height controls that resize the owning graph while keeping its rendered content available', capability: 'keyboard-resize', evidence: 'all-component-graph-size-keyboard-browser-contract', setup: 'ui', environment: 'loaded-examples' }),
  Object.freeze({ id: 'A11Y.venn-analysis-option-disclosures', kind: 'contract', contract: 'A11Y', components: ['venn'], requirement: 'Venn analysis option disclosure buttons synchronize expanded state with their panels, support keyboard activation, and close on owner deactivation', capability: 'keyboard-disclosure-owner-lifecycle', evidence: 'venn-analysis-option-disclosure-browser-contract', setup: 'ui', environment: 'same-type-tabs' }),
  Object.freeze({ id: 'LAYOUT.graph-control-font-size', kind: 'contract', contract: 'LAYOUT', components: ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'], requirement: 'Visible graph control labels use their shared graph-control text size across all component workspaces', capability: 'typography-scale', evidence: 'all-component-graph-control-font-size-browser-contract', setup: 'ui', environment: 'loaded-examples' }),
  Object.freeze({ id: 'LAYOUT.axis-config-popup-short-viewport', kind: 'contract', contract: 'LAYOUT', components: ['line', 'box', 'scatter'], requirement: 'Box, Line and Scatter axis additional-ticks and broken-axis dialogs stay within a 320×400 viewport', capability: 'responsive-dialog', evidence: 'short-viewport-axis-config-dialog-contract', setup: 'ui', environment: '320x400' }),
  Object.freeze({ id: 'A11Y.axis-config-popup-owner-lifecycle', kind: 'contract', contract: 'A11Y', components: ['line', 'box', 'scatter'], requirement: 'Box, Line and Scatter additional-ticks and broken-axis dialogs close on same-type owner deactivation and remain closed after return', capability: 'owner-lifecycle', evidence: 'axis-config-popup-owner-deactivation-contract', setup: 'ui', environment: 'same-type-tabs' }),
  Object.freeze({ id: 'GOVERNANCE.discovery-inventory', kind: 'governance', components: ['*'] }),
  Object.freeze({ id: 'GOVERNANCE.layer-manifest', kind: 'governance', components: ['*'] }),
  Object.freeze({ id: 'GOVERNANCE.jest-project-boundaries', kind: 'governance', components: ['*'] }),
  Object.freeze({ id: 'GOVERNANCE.lane-runner', kind: 'governance', components: ['*'] }),
  Object.freeze({ id: 'GOVERNANCE.jest-shard-runner', kind: 'governance', components: ['*'] }),
  Object.freeze({ id: 'GOVERNANCE.case-evidence', kind: 'governance', components: ['*'] }),
  Object.freeze({ id: 'GOVERNANCE.tab-isolation-scanner-helper-sinks', kind: 'governance', components: ['*'] }),
  Object.freeze({ id: 'GOVERNANCE.tab-isolation-scanner-lexical-callbacks', kind: 'governance', components: ['*'] }),
  Object.freeze({ id: 'GOVERNANCE.tab-isolation-review-queue', kind: 'governance', components: ['*'] }),
  Object.freeze({ id: 'GOVERNANCE.tab-isolation-scanner-file-save-sinks', kind: 'governance', components: ['*'] }),
  Object.freeze({ id: 'GOVERNANCE.coverage-trend', kind: 'governance', components: ['*'] }),
  Object.freeze({ id: 'GOVERNANCE.test-trend-report', kind: 'governance', components: ['*'], requirement: 'Publish test health trend metrics', capability: 'test-governance', evidence: 'lane-inventory-trend-report' }),
  Object.freeze({ id: 'GOVERNANCE.integration-teardown', kind: 'governance', components: ['*'] }),
  Object.freeze({ id: 'GOVERNANCE.production-bootstrap-manifest', kind: 'governance', components: ['*'] }),
  Object.freeze({ id: 'GOVERNANCE.browser-helper-bootstrap', kind: 'governance', components: ['*'] }),
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
  Object.freeze({ id: 'OWN.reopen-owner-isolation.all-components', kind: 'contract', contract: 'OWN', components: ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'], requirement: 'Reopening a single-format Box tab after activating every other workspace preserves each tab payload and prevents grouped-label leakage', capability: 'tab-isolation', evidence: 'all-component-reopen-owner-payload-contract', setup: 'component-api', transition: 'grouped-box-to-all-workspaces-to-single-box-reopen', environment: 'fake-vendor-integration' }),
  Object.freeze({ id: 'OWN.mixed-table-format-reopen', kind: 'contract', contract: 'OWN', components: ['box', 'scatter', 'line', 'pca'], requirement: 'Single and grouped owners preserve populated cells, headers, grouping metadata and visible format through legacy hydration, alternating switches and archive reopen', capability: 'mixed-table-formats', evidence: 'mixed-format-owner-browser-roundtrip', setup: 'ui-examples-and-legacy-payload', transition: 'single-grouped-single-legacy-hydration-archive-reopen-alternating-owners', environment: 'chromium-real-vendors' }),
  Object.freeze({ id: 'PERSIST.grouped-header-idempotence', kind: 'contract', contract: 'PERSIST', components: ['box', 'line'], requirement: 'A grouped-only archive preserves original named headers and group labels without materializing spare grid columns as extra groups', capability: 'grouped-table-hydration', evidence: 'grouped-only-control-browser-roundtrip', setup: 'ui-grouped-example', transition: 'grouped-only-archive-reopen', environment: 'chromium-real-vendors' }),
  Object.freeze({ id: 'OWN.cross-browser-feature-matrix', kind: 'contract', contract: 'OWN', components: ['*'] }),
  Object.freeze({ id: 'PERSIST.explicit-component-mutations', kind: 'contract', contract: 'PERSIST', components: ['*'], requirement: 'Component-specific mode and style persistence', capability: 'component-modes', evidence: 'component-mutation-matrix', setup: 'api' }),
  Object.freeze({ id: 'PERSIST.ui-originated-component-mutations', kind: 'contract', contract: 'PERSIST', components: ['*'], requirement: 'UI-originated component mutations write through and survive reopen', capability: 'component-modes', evidence: 'ui-component-mutation-persistence-contract', setup: 'ui' }),
  Object.freeze({ id: 'LAYOUT.ui-originated-component-resize', kind: 'contract', contract: 'LAYOUT', components: ['*'], requirement: 'Visible component resizing writes through and survives reopen', capability: 'layout', evidence: 'ui-component-layout-persistence-contract', setup: 'ui' }),
  Object.freeze({ id: 'LAYOUT.workspace-root-hydration', kind: 'contract', contract: 'LAYOUT', components: ['venn'] }),
  Object.freeze({ id: 'LAYOUT.legend-font-reserve-undo', kind: 'contract', contract: 'LAYOUT', components: ['box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'] }),
  Object.freeze({ id: 'PERSIST.session-payload-write-through', kind: 'contract', contract: 'PERSIST', components: ['*'], requirement: 'Owner session payload write-through', capability: 'persistence', evidence: 'owner-payload-write-through-contract' }),
  Object.freeze({ id: 'ARCHIVE.session-save-policies', kind: 'contract', contract: 'ARCHIVE', components: ['*'] }),
  Object.freeze({ id: 'ARCHIVE.zip-entry-bounds', kind: 'contract', contract: 'ARCHIVE', components: ['*'] }),
  Object.freeze({ id: 'ARCHIVE.welcome-drop-save-target', kind: 'contract', contract: 'ARCHIVE', components: ['scatter'] }),
  Object.freeze({ id: 'ARCHIVE.reopened-write-permission', kind: 'contract', contract: 'ARCHIVE', components: ['scatter'] }),
  Object.freeze({ id: 'ARCHIVE.save-picker-before-preparation', kind: 'contract', contract: 'ARCHIVE', components: ['scatter'] }),
  Object.freeze({ id: 'ARCH.semantic-render-impact', kind: 'contract', contract: 'ARCH', components: ['*'], requirement: 'Semantic render-impact scheduling', capability: 'render-scheduling', evidence: 'shared-draw-impact-contract' }),
  Object.freeze({ id: 'REC.archive-restore-transaction', kind: 'contract', contract: 'REC', components: ['*'] }),
  Object.freeze({ id: 'REC.background-preparation', kind: 'contract', contract: 'REC', components: ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'] }),
  Object.freeze({ id: 'PERSIST.grid-clipboard', kind: 'contract', contract: 'PERSIST', components: ['*'] }),
  Object.freeze({ id: 'PERSIST.scatter-label-copy-scope', kind: 'contract', contract: 'PERSIST', components: ['scatter'], setup: 'ui' }),
  Object.freeze({ id: 'OWN.ag-grid-edit-overflow', kind: 'contract', contract: 'OWN', components: ['scatter'] }),
  Object.freeze({ id: 'LAYOUT.ag-grid-grouped-header-seams', kind: 'contract', contract: 'LAYOUT', components: ['box', 'scatter', 'line', 'pca'], setup: 'ui' }),
  Object.freeze({ id: 'OWN.ag-grid-keyboard-selection', kind: 'contract', contract: 'OWN', components: ['scatter'] }),
  Object.freeze({ id: 'OWN.ag-grid-clipboard-outline-late-paste', kind: 'contract', contract: 'OWN', components: ['box'], setup: 'ui' }),
  Object.freeze({ id: 'OWN.ag-grid-header-menu-paste-owner', kind: 'contract', contract: 'OWN', components: ['box'], setup: 'ui' }),
  Object.freeze({ id: 'LAYOUT.ag-grid-pinned-row-scroll', kind: 'contract', contract: 'LAYOUT', components: ['scatter'], setup: 'ui' }),
  Object.freeze({ id: 'LAYOUT.ag-grid-selection-scrollbar', kind: 'contract', contract: 'LAYOUT', components: ['box'] }),
  Object.freeze({ id: 'LAYOUT.ag-grid-native-selection', kind: 'contract', contract: 'LAYOUT', components: ['box', 'pca'], setup: 'mixed' }),
  Object.freeze({ id: 'LAYOUT.ag-grid-formula-reference-outline', kind: 'contract', contract: 'LAYOUT', components: ['box', 'scatter'], setup: 'ui' }),
  Object.freeze({ id: 'PERSIST.ag-grid-column-reorder-undo', kind: 'contract', contract: 'PERSIST', components: ['box'] }),
  Object.freeze({ id: 'STATS.same-type-archive-restore', kind: 'contract', contract: 'STATS', components: ['*'], requirement: 'Same-type statistical archive restore', capability: 'statistics', evidence: 'same-type-stats-restore' }),
  Object.freeze({ id: 'PERSIST.stats-archive-restore', kind: 'contract', contract: 'PERSIST', components: ['*'], requirement: 'Statistical archive persistence', capability: 'persistence', evidence: 'stats-archive-roundtrip' }),
  Object.freeze({ id: 'STATS.reopen-presence', kind: 'contract', contract: 'STATS', components: ['*'], requirement: 'Statistical panel reopen presence', capability: 'statistics', evidence: 'stats-panel-reopen-presence' }),
  Object.freeze({ id: 'PERSIST.stats-reopen', kind: 'contract', contract: 'PERSIST', components: ['*'], requirement: 'Statistical state reopen persistence', capability: 'persistence', evidence: 'stats-state-roundtrip' }),
  Object.freeze({ id: 'PERSIST.table-format-tab-isolation', kind: 'contract', contract: 'PERSIST', components: ['box', 'pca', 'scatter', 'line'] }),
  Object.freeze({ id: 'OWN.pca-component-selection-stale-owner', kind: 'contract', contract: 'OWN', components: ['pca'], requirement: 'Inactive PCA component-selection controls cannot change the active tab settings', capability: 'owner-isolation', evidence: 'pca-component-selection-inactive-root-ab-contract', setup: 'api', transition: 'inactive-owner-controls-fired-while-sibling-active' }),
  Object.freeze({ id: 'OWN.hist-control-stale-owner', kind: 'contract', contract: 'OWN', components: ['hist'], requirement: 'Inactive Histogram control events cannot capture the active tab mirror into another tab', capability: 'owner-isolation', evidence: 'hist-legend-inactive-root-ab-session-contract', setup: 'api', transition: 'inactive-owner-event-after-same-type-switch' }),
  Object.freeze({ id: 'OWN.cartesian-axis-length-stale-owner', kind: 'contract', contract: 'OWN', components: ['line', 'scatter'], requirement: 'Line and Scatter axes-length controls cannot change a different active tab', capability: 'owner-isolation', evidence: 'line-scatter-inactive-axes-control-ab-session-contract', setup: 'api', transition: 'inactive-owner-axes-event-after-same-type-switch' }),
  Object.freeze({ id: 'OWN.scatter-view-mode-stale-owner', kind: 'contract', contract: 'OWN', components: ['scatter'], requirement: 'Scatter view-mode events cannot write through a stale component owner binding', capability: 'owner-isolation', evidence: 'scatter-view-mode-stale-owner-session-regression', setup: 'api', transition: 'active-owner-mismatch-during-view-mode-change' }),
  Object.freeze({ id: 'OWN.scatter-example-stale-owner', kind: 'contract', contract: 'OWN', components: ['scatter'], requirement: 'Retained Scatter example button cannot load data into the active sibling tab', capability: 'owner-isolation', evidence: 'scatter-example-stale-owner-session-regression', setup: 'api', transition: 'same-type-tab-switch-retained-example-button' }),
  Object.freeze({ id: 'OWN.line-example-stale-owner', kind: 'contract', contract: 'OWN', components: ['line'], requirement: 'Retained Line example button cannot load data into the active sibling tab', capability: 'owner-isolation', evidence: 'line-example-stale-owner-session-regression', setup: 'api', transition: 'same-type-tab-switch-retained-example-button' }),
  Object.freeze({ id: 'OWN.welcome-example-launch-owner', kind: 'contract', contract: 'OWN', components: ['hist'], requirement: 'A delayed welcome example launch cannot project or persist into a same-type tab activated while the launch is pending', capability: 'owner-isolation', evidence: 'welcome-example-delayed-activation-owner-session-and-render-contract', setup: 'ui', transition: 'same-type-tab-switch-during-delayed-activation' }),
  Object.freeze({ id: 'OWN.line-display-mode-stale-owner', kind: 'contract', contract: 'OWN', components: ['line'], requirement: 'Inactive Line display-mode events cannot change the active sibling tab', capability: 'owner-isolation', evidence: 'line-display-mode-stale-owner-session-regression', setup: 'api', transition: 'same-type-tab-switch-retained-display-mode-event' }),
  Object.freeze({ id: 'OWN.line-viewmode-stale-owner', kind: 'contract', contract: 'OWN', components: ['line'], requirement: 'Inactive Line 2D/3D view-mode events cannot change the active sibling view or table', capability: 'owner-isolation', evidence: 'line-viewmode-stale-owner-session-and-table-regression', setup: 'api', transition: 'same-type-tab-switch-retained-viewmode-event' }),
  Object.freeze({ id: 'OWN.line-data-toolbar-stale-owner', kind: 'contract', contract: 'OWN', components: ['line'], requirement: 'An inactive Line table wrapper cannot activate the shared toolbar section for its sibling', capability: 'owner-isolation', evidence: 'line-data-toolbar-stale-owner-activation-regression', setup: 'api', transition: 'same-type-tab-switch-retained-table-mousedown' }),
  Object.freeze({ id: 'OWN.scatter-data-toolbar-stale-owner', kind: 'contract', contract: 'OWN', components: ['scatter'], requirement: 'An inactive Scatter table wrapper cannot activate the shared toolbar section for its sibling', capability: 'owner-isolation', evidence: 'scatter-data-toolbar-stale-owner-activation-regression', setup: 'api', transition: 'same-type-tab-switch-retained-table-mousedown' }),
  Object.freeze({ id: 'OWN.tab-scoped-file-target-isolation', kind: 'contract', contract: 'OWN', components: ['*'], requirement: 'A tab-scoped graph file remains bound to its owning tab across autosave, explicit save, reload, and recovery', capability: 'owner-isolation', evidence: 'tab-file-target-owner-save-autosave-journal-recovery-contract', setup: 'mixed', transition: 'load-owner-a-switch-to-b-autosave-save-recovery-and-return' }),
  Object.freeze({ id: 'OWN.line-stats-button-stale-owner', kind: 'contract', contract: 'OWN', components: ['line'], requirement: 'A retained inactive Line statistics button cannot compute into the active sibling tab', capability: 'owner-isolation', evidence: 'line-stats-button-stale-owner-session-regression', setup: 'api', transition: 'same-type-tab-switch-retained-stats-button' }),
  Object.freeze({ id: 'OWN.line-cancelled-draw-owner', kind: 'contract', contract: 'OWN', components: ['line'], requirement: 'A delayed Line draw cancelled by tab switching leaves the sibling unchanged and redraws the owner on return', capability: 'owner-isolation', evidence: 'line-cancelled-draw-delayed-switch-owner-and-render-contract', setup: 'api', transition: 'owner-draw-paused-switch-to-sibling-then-reactivated' }),
  Object.freeze({ id: 'OWN.line-replicate-controls-stale-owner', kind: 'contract', contract: 'OWN', components: ['line'], requirement: 'Inactive Line table-format and replicate-count events cannot reshape the active sibling table', capability: 'owner-isolation', evidence: 'line-replicate-controls-stale-owner-session-regression', setup: 'api', transition: 'same-type-tab-switch-retained-table-structure-event' }),
  Object.freeze({ id: 'OWN.scatter-replicate-controls-stale-owner', kind: 'contract', contract: 'OWN', components: ['scatter'], requirement: 'Inactive Scatter table-format, replicate-count, and grouped-X events cannot reshape the active sibling table', capability: 'owner-isolation', evidence: 'scatter-replicate-controls-stale-owner-session-regression', setup: 'api', transition: 'same-type-tab-switch-retained-table-structure-event' }),
  Object.freeze({ id: 'OWN.line-inactive-payload-owner', kind: 'contract', contract: 'OWN', components: ['line'], requirement: 'Inactive Line payloads cannot replace the active sibling projection or session', capability: 'owner-isolation', evidence: 'line-inactive-payload-owner-session-regression', setup: 'api', transition: 'active-sibling-then-explicit-inactive-payload', environment: 'jest' }),
  Object.freeze({ id: 'OWN.scatter-inactive-payload-owner', kind: 'contract', contract: 'OWN', components: ['scatter'], requirement: 'Inactive Scatter payloads cannot mutate the active sibling projection or session', capability: 'owner-isolation', evidence: 'scatter-inactive-payload-owner-session-regression', setup: 'api', transition: 'active-sibling-then-explicit-inactive-payload', environment: 'jest' }),
  Object.freeze({ id: 'OWN.line-save-file-owner', kind: 'contract', contract: 'OWN', components: ['line'], requirement: 'Line save and save-as use the active tab session file name and file handle', capability: 'owner-isolation', evidence: 'line-delayed-save-session-file-target-isolation', setup: 'api', transition: 'save-a-switch-to-b-save-b', environment: 'jest' }),
  Object.freeze({ id: 'OWN.scatter-save-file-owner', kind: 'contract', contract: 'OWN', components: ['scatter'], requirement: 'Scatter save and save-as use the active tab session file name and file handle', capability: 'owner-isolation', evidence: 'scatter-delayed-save-session-file-target-isolation', setup: 'api', transition: 'save-a-switch-to-b-save-b', environment: 'jest' }),
  Object.freeze({ id: 'OWN.component-save-target-owner-isolation', kind: 'contract', contract: 'OWN', components: ['box', 'heatmap', 'hist', 'pie', 'roc', 'surface'], requirement: 'Component graph-save APIs use each active session file name and handle after creating an empty same-type tab', capability: 'owner-isolation', evidence: 'six-component-empty-duplicate-save-and-save-as-session-target-matrix', setup: 'api', transition: 'save-as-a-create-empty-b-save-b-and-recheck-a', environment: 'jest' }),
  Object.freeze({ id: 'OWN.survival-file-target-owner-isolation', kind: 'contract', contract: 'OWN', components: ['survival'], requirement: 'An empty Survival tab does not inherit another tab file name or handle during activation', capability: 'owner-isolation', evidence: 'survival-empty-tab-file-target-session-activation-regression', setup: 'api', transition: 'set-a-file-target-activate-empty-b-check-b-and-a', environment: 'jest' }),
  Object.freeze({ id: 'OWN.heatmap-inactive-payload-owner', kind: 'contract', contract: 'OWN', components: ['heatmap'], requirement: 'Inactive Heatmap payloads are rejected before changing the active sibling projection', capability: 'owner-isolation', evidence: 'heatmap-inactive-payload-owner-projection-regression', setup: 'api', transition: 'active-sibling-then-explicit-inactive-payload', environment: 'jest' }),
  Object.freeze({ id: 'OWN.heatmap-stale-pvalue-owner', kind: 'contract', contract: 'OWN', components: ['heatmap'], requirement: 'A stale Heatmap formatting event cannot schedule a draw in the active sibling', capability: 'owner-isolation', evidence: 'disposed-heatmap-owner-pvalue-event-ab-regression', setup: 'api', transition: 'dispose-owner-switch-to-sibling-dispatch-stale-owner-event', environment: 'jest' }),
  Object.freeze({ id: 'OWN.pie-inactive-payload-owner', kind: 'contract', contract: 'OWN', components: ['pie'], requirement: 'Inactive Pie payloads are rejected before changing the active sibling projection', capability: 'owner-isolation', evidence: 'pie-inactive-payload-owner-projection-regression', setup: 'api', transition: 'active-sibling-then-explicit-inactive-payload', environment: 'jest' }),
  Object.freeze({ id: 'OWN.roc-grid-stale-owner', kind: 'contract', contract: 'OWN', components: ['roc'], requirement: 'Retained ROC grid controls cannot mix active sibling controls into the inactive owner session', capability: 'owner-isolation', evidence: 'roc-grid-stale-owner-session-regression', setup: 'api', transition: 'same-type-tab-switch-retained-grid-control' }),
  Object.freeze({ id: 'OWN.roc-snapshot-missing-owner', kind: 'contract', contract: 'OWN', components: ['roc'], requirement: 'ROC snapshot readiness with an explicit missing owner cannot schedule work on the active sibling', capability: 'owner-isolation', evidence: 'roc-snapshot-explicit-owner-does-not-fall-back-to-active-session', setup: 'api', transition: 'remove-owner-session-keep-sibling-active-request-snapshot-for-owner' }),
  Object.freeze({ id: 'OWN.cartesian-axis-length-stale-owner-browser', kind: 'contract', contract: 'OWN', components: ['line', 'scatter'], requirement: 'Inactive Line and Scatter axes-length controls cannot change active-tab session or rendered controls', capability: 'owner-isolation', evidence: 'line-scatter-browser-stale-control-session-and-render-contract', setup: 'browser', transition: 'same-type-tab-switch-dispatch-retained-owner-controls' }),
  Object.freeze({ id: 'STATS.box-significance-restore', kind: 'contract', contract: 'STATS', components: ['box'], requirement: 'Box significance restore with one shared Label selector, owner-bound settings, both cached orientations, two populated tabs, inactive undo and archive reopen', capability: 'statistics', evidence: 'box-significance-restore', setup: 'mixed', transition: 'archive-reopen-same-type-owner-switch-undo' }),
  Object.freeze({ id: 'PERSIST.line-uncertainty-band-reopen', kind: 'contract', contract: 'PERSIST', components: ['line'] }),
  Object.freeze({ id: 'OWN.scatter-inline-edit-preview', kind: 'contract', contract: 'OWN', components: ['scatter'] }),
  Object.freeze({ id: 'STATS.figure-summary-layout', kind: 'contract', contract: 'STATS', components: ['box', 'scatter', 'line', 'hist', 'pca', 'pie', 'roc', 'survival', 'heatmap', 'surface', 'venn'], requirement: 'Summary tables project every selected owner report field and preserve graph scale across repeated toggles', capability: 'statistics', evidence: 'figure-summary-field-projection-and-scale-contract', setup: 'mixed', transition: 'example-stats-summary-repeat-show-hide', environment: 'chromium' }),
  Object.freeze({ id: 'STATS.venn-plot-stats', kind: 'contract', contract: 'STATS', components: ['venn'], requirement: 'Venn plot statistics restore per tab and match the active significance result', capability: 'statistics', evidence: 'venn-plot-stats-owner-tab-contract', setup: 'ui', transition: 'same-type-tab-switch', environment: 'chromium' }),
  Object.freeze({ id: 'REC.heatmap-exclusion-archive-parity', kind: 'contract', contract: 'REC', components: ['heatmap'] }),
  Object.freeze({ id: 'STATS.box-dark-theme-regression', kind: 'contract', contract: 'STATS', components: ['box'], requirement: 'Box statistics in dark theme', capability: 'statistics', evidence: 'box-dark-theme-statistics' }),
  Object.freeze({ id: 'STATS.box-controls-isolation', kind: 'contract', contract: 'STATS', components: ['box'], requirement: 'Box statistics control isolation', capability: 'statistics', evidence: 'box-statistics-control-isolation' }),
  Object.freeze({ id: 'STATS.advisor-owner-persistence', kind: 'contract', contract: 'STATS', components: ['box', 'scatter', 'line', 'pie', 'roc', 'survival'], setup: 'ui' }),
  Object.freeze({ id: 'STATS.hist-advisor', kind: 'contract', contract: 'STATS', components: ['hist'], setup: 'mixed' }),
  Object.freeze({ id: 'STATS.hist-aicc-availability', kind: 'contract', contract: 'STATS', components: ['hist'], setup: 'mixed' }),
  Object.freeze({ id: 'ASYNC.hist-analysis-snapshot', kind: 'contract', contract: 'ASYNC', components: ['hist'], setup: 'mixed' }),
  Object.freeze({ id: 'OWN.hist-analysis-cancel', kind: 'contract', contract: 'OWN', components: ['hist'], setup: 'mixed' }),
  Object.freeze({ id: 'STATS.box-advisor-plan-parity', kind: 'contract', contract: 'STATS', components: ['box'], setup: 'mixed' }),
  Object.freeze({ id: 'STATS.box-lognormal-repeated', kind: 'contract', contract: 'STATS', components: ['box'], setup: 'mixed' }),
  Object.freeze({ id: 'STATS.box-nested-repeated', kind: 'contract', contract: 'STATS', components: ['box'], setup: 'mixed' }),
  Object.freeze({ id: 'STATS.box-methods-guidance', kind: 'contract', contract: 'STATS', components: ['box'], setup: 'mixed' }),
  Object.freeze({ id: 'OWN.closed-tab-session-disposal', kind: 'contract', contract: 'OWN', components: ['box', 'scatter', 'pca', 'line', 'surface', 'pie', 'roc', 'survival'], setup: 'mixed' }),
  Object.freeze({ id: 'LAYOUT.workspace-document-responsive', kind: 'contract', contract: 'LAYOUT', components: ['*'], setup: 'mixed' }),
  Object.freeze({ id: 'STATS.advisor-model-design', kind: 'contract', contract: 'STATS', components: ['line','scatter'], setup: 'ui' }),
  Object.freeze({ id: 'STATS.roc-advisor-class-replication', kind: 'contract', contract: 'STATS', components: ['roc'], setup: 'mixed' }),
  Object.freeze({ id: 'STATS.hist-distribution-calibration', kind: 'contract', contract: 'STATS', components: ['hist', 'box'], setup: 'mixed' }),
  Object.freeze({ id: 'WORKER.hist-distribution-comparison', kind: 'worker', components: ['hist'], requirement: 'Histogram KS resampling runs in an owner-scoped worker, reuses exact-sample pending and completed results across redraws, and only projects them for the current draw', capability: 'worker', evidence: 'session-cache-owner-isolation-real-worker-exact-and-seeded-monte-carlo-contract-plus-chromium-report', setup: 'mixed', transition: 'owner-draw-to-worker-result-cache-and-current-draw-publication', environment: 'browser-worker' }),
  Object.freeze({ id:'STATS.advisor-contract', kind:'contract', contract:'STATS', components:['box','scatter','line','pie','roc','survival'], setup:'mixed' }),
  Object.freeze({ id: 'LAYOUT.stats-table-scroll', kind: 'contract', contract: 'LAYOUT', components: ['hist'], setup: 'mixed' }),
  Object.freeze({ id: 'STATS.advisor-disclosure', kind: 'contract', contract: 'STATS', components: ['box', 'scatter', 'line', 'pie', 'roc', 'survival'], setup: 'ui' }),
  Object.freeze({ id: 'STATS.box-one-sample-control-order', kind: 'contract', contract: 'STATS', components: ['box'], requirement: 'Selecting one-sample scope places Null value immediately below Comparison scope and commits edits to the owning Box session', capability: 'statistics-control-order', evidence: 'chromium-one-sample-row-adjacency-and-session-edit-contract', setup: 'ui', transition: 'all-comparisons-to-one-sample-edit-back', environment: 'loaded-example' }),
  Object.freeze({ id: 'STATS.heatmap-presentation', kind: 'contract', contract: 'STATS', components: ['heatmap'], requirement: 'Heatmap statistics presentation', capability: 'statistics', evidence: 'heatmap-statistics-presentation' }),
  Object.freeze({ id: 'STATS.heatmap-correction-reclassification', kind: 'contract', contract: 'STATS', components: ['heatmap'], setup: 'ui' }),
  Object.freeze({ id: 'STATS.heatmap-correlation-oracle', kind: 'contract', contract: 'STATS', components: ['heatmap'], setup: 'api' }),
  Object.freeze({ id: 'STATS.heatmap-correlation-inference', kind: 'contract', contract: 'STATS', components: ['heatmap'], setup: 'mixed' }),
  Object.freeze({ id: 'STATS.heatmap-inference-guidance', kind: 'contract', contract: 'STATS', components: ['heatmap'], setup: 'ui' }),
  Object.freeze({ id: 'STATS.venn-universe-guidance', kind: 'contract', contract: 'STATS', components: ['venn'], setup: 'ui' }),
  Object.freeze({ id: 'STATS.pca-parallel-analysis', kind: 'contract', contract: 'STATS', components: ['pca'], setup: 'api' }),
  Object.freeze({ id: 'STATS.cox-delayed-entry', kind: 'contract', contract: 'STATS', components: ['survival'], setup: 'api' }),
  Object.freeze({ id: 'STATS.cox-lr-convergence', kind: 'contract', contract: 'STATS', components: ['survival'], setup: 'api' }),
  Object.freeze({ id: 'STATS.cox-identifiability', kind: 'contract', contract: 'STATS', components: ['survival'], setup: 'api' }),
  Object.freeze({ id: 'STATS.cox-scale-invariance', kind: 'contract', contract: 'STATS', components: ['survival'], setup: 'api' }),
  Object.freeze({ id: 'STATS.hist-ks-result-reclassification', kind: 'contract', contract: 'STATS', components: ['hist'], setup: 'ui' }),
  Object.freeze({ id: 'STATS.roc-single-curve-result-projection', kind: 'contract', contract: 'STATS', components: ['roc'], setup: 'ui' }),
  Object.freeze({ id: 'STATS.scatter-statistics-isolation', kind: 'contract', contract: 'STATS', components: ['scatter'], requirement: 'Scatter statistics isolation', capability: 'statistics', evidence: 'scatter-statistics-isolation' }),
  Object.freeze({
    id: 'STATS.survival-pipeline',
    kind: 'contract',
    contract: 'STATS',
    components: ['survival'],
    requirement: 'Survival inference controls, calculated results, correction reuse, visible guidance, and legacy options follow the owning session state',
    capability: 'survival-statistics-pipeline',
    evidence: 'survival-visible-guidance-calculation-correction-reuse-and-legacy-restore',
    setup: 'mixed',
    transition: 'new-session-to-selected-analysis-results-correction-reuse-and-legacy-hydration',
    environment: 'jest-jsdom-production-bootstrap-fake-vendor'
  }),
  Object.freeze({ id: 'OWN.legend-3d-drag', kind: 'contract', contract: 'OWN', components: ['pca', 'line'], requirement: 'PCA and Line 3D interaction ownership', capability: '3d', evidence: 'plot3d-owner-interaction' }),
  Object.freeze({ id: 'REC.primary-graph-publication', kind: 'contract', contract: 'REC', components: ['*'] }),
  Object.freeze({ id: 'REC.single-tab-recovery-checkpoint', kind: 'contract', contract: 'REC', components: ['box', 'scatter', 'hist', 'heatmap', 'line'] }),
  Object.freeze({ id: 'REC.reopen-data-redraw', kind: 'contract', contract: 'REC', components: ['*'] }),
  Object.freeze({ id: 'LAYOUT.axis-tick-label-optical-clearance', kind: 'contract', contract: 'LAYOUT', components: ['*'] }),
  Object.freeze({ id: 'PERSIST.dataview-lite-archive', kind: 'contract', contract: 'PERSIST', components: ['*'] }),
  Object.freeze({ id: 'IMPORT.prism-multi-dataset', kind: 'contract', contract: 'IMPORT', components: ['box', 'line', 'survival', 'scatter', 'pie'] }),
  Object.freeze({ id: 'EXPORT.background', kind: 'contract', contract: 'EXPORT', components: ['scatter'], requirement: 'PNG, SVG and hybrid downloads and image copy honor explicit theme or transparent backgrounds; keyboard menus share a tab-owned preference across switching and archive reopen', capability: 'export-background', evidence: 'real-pixel-menu-tab-and-archive-contract', setup: 'mixed', transition: 'light-dark-copy-download-switch-save-reopen', environment: 'real-vendor-chromium' }),
  Object.freeze({ id: 'EXPORT.format-dimensions', kind: 'contract', contract: 'EXPORT', components: ['*'] }),
  Object.freeze({ id: 'EXPORT.multiline-hybrid-title', kind: 'contract', contract: 'EXPORT', components: ['scatter'], requirement: 'Hybrid SVG raster layers preserve positioned multiline title text and alignment', capability: 'export-fidelity', evidence: 'hybrid-svg-multiline-title-browser-contract', setup: 'ui' }),
  Object.freeze({ id: 'LAYOUT.cartesian-x-label-reserve', kind: 'contract', contract: 'LAYOUT', components: ['line'] }),
  Object.freeze({ id: 'LAYOUT.multiline-title-exact-reserve', kind: 'contract', contract: 'LAYOUT', components: ['line', 'box'], requirement: 'Multiline graph and axis titles reserve exact rendered line-height', capability: 'layout', evidence: 'multiline-title-exact-reserve-browser-contract', setup: 'ui' }),
  Object.freeze({ id: 'LAYOUT.plot3d-multiline-title-exact-reserve', kind: 'contract', contract: 'LAYOUT', components: ['scatter', 'line', 'pca', 'surface'], requirement: '3D multiline titles retain readable Y endpoints and synchronized anchors through redraw, formatting, and rotation, with exact line-height reserves', capability: 'layout', evidence: 'plot3d-multiline-title-exact-reserve-browser-contract', setup: 'ui' }),
  Object.freeze({ id: 'LAYOUT.plot3d-glyph-containment', kind: 'contract', contract: 'LAYOUT', components: ['scatter', 'line', 'pca', 'surface'], requirement: '3D axis titles keep compact rendered tick clearance; legends leave projected geometry unchanged, stay outside axis annotations, and preserve viewport sizing through redraw, cache restore, rotation, and archive reopen; collapsed axes omit annotations', capability: 'three-dimensional-view', evidence: 'plot3d-glyph-containment-browser-contract', setup: 'ui', environment: 'loaded-examples' }),
  Object.freeze({ id: 'LAYOUT.cartesian-axis-title-reserve-all', kind: 'contract', contract: 'LAYOUT', components: ['box', 'scatter', 'pca', 'line', 'roc', 'survival', 'hist', 'pie'], requirement: 'Cartesian graph and applicable X/Y titles shift the plot by exactly their rendered line-height', capability: 'layout', evidence: 'cartesian-axis-title-reserve-browser-contract', setup: 'ui' }),
  Object.freeze({ id: 'LAYOUT.multiline-title-mode-matrix', kind: 'contract', contract: 'LAYOUT', components: ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'], requirement: 'Graph and applicable axis titles remain editable and geometrically contained in every supported graph mode', capability: 'layout', evidence: 'multiline-title-mode-matrix-browser-contract', setup: 'ui' }),
  Object.freeze({ id: 'LAYOUT.title-alignment-persistence-all', kind: 'contract', contract: 'LAYOUT', components: ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'], requirement: 'Graph and axis title alignment survives real workspace archive reopen for every component', capability: 'persistence', evidence: 'title-alignment-persistence-browser-contract', setup: 'ui' }),
  Object.freeze({ id: 'LAYOUT.title-alignment-scopes', kind: 'contract', contract: 'LAYOUT', components: ['line'], requirement: 'Selection scope disables alignment for ticks; Graph scope aligns supported title blocks and restores overrides on undo', capability: 'layout', evidence: 'title-alignment-scope-browser-contract', setup: 'ui' }),
  Object.freeze({ id: 'LAYOUT.title-alignment-undo-order', kind: 'contract', contract: 'LAYOUT', components: ['line'], requirement: 'Line graph-title text edits and alignment undo/redo in chronological order across a live multiline edit', capability: 'undo-redo', evidence: 'title-alignment-undo-order-browser-contract', setup: 'ui' }),
  Object.freeze({ id: 'LAYOUT.title-alignment-live-undo', kind: 'contract', contract: 'LAYOUT', components: ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'], requirement: 'Graph and applicable axis title undo and redo update the active editor in every component', capability: 'undo-redo', evidence: 'title-alignment-live-undo-browser-contract', setup: 'ui' }),
  Object.freeze({ id: 'LAYOUT.multiline-title-empty-row-editor', kind: 'contract', contract: 'LAYOUT', components: ['line'], requirement: 'The inline title editor displays empty logical lines and keeps earlier lines visible', capability: 'title-editing', evidence: 'multiline-title-empty-row-editor-browser-contract', setup: 'ui' }),
  Object.freeze({ id: 'PERSIST.title-alignment-cache-miss', kind: 'contract', contract: 'PERSIST', components: ['line'], requirement: 'A stale title render-cache signature is rejected while canonical multiline text, alignment, and edit binding survive', capability: 'render-cache', evidence: 'title-alignment-cache-miss-browser-contract', setup: 'ui' }),
  Object.freeze({ id: 'PERSIST.title-alignment-duplicate', kind: 'contract', contract: 'PERSIST', components: ['line'], requirement: 'A reused duplicate preserves title text/alignment and subsequent title edits remain tab-isolated', capability: 'persistence', evidence: 'title-alignment-duplicate-browser-contract', setup: 'ui' }),
  Object.freeze({ id: 'PERSIST.title-alignment-recovery', kind: 'contract', contract: 'PERSIST', components: ['line'], requirement: 'Recovery restores multiline graph title text, alignment, and edit bindings', capability: 'persistence', evidence: 'title-alignment-recovery-browser-contract', setup: 'ui' }),
  Object.freeze({ id: 'LAYOUT.title-alignment-owner-switch', kind: 'contract', contract: 'LAYOUT', components: ['line'], requirement: 'Line multiline title text, alignment, and toolbar state stay with the original tab after same-type switching', capability: 'persistence', evidence: 'title-alignment-owner-switch-browser-contract', setup: 'ui' }),
  Object.freeze({ id: 'PERSIST.multiline-title-draft-save-all', kind: 'contract', contract: 'PERSIST', components: ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'], requirement: 'Live graph and axis title drafts are stored in their owner payload and survive archive reopen', capability: 'persistence', evidence: 'multiline-title-live-draft-archive-contract', setup: 'ui' }),
  Object.freeze({ id: 'LAYOUT.upset-multiline-title-exact-reserve', kind: 'contract', contract: 'LAYOUT', components: ['venn'], requirement: 'UpSet graph and X/Y title lines reserve exact rendered line-height and shift the plot without resizing it', capability: 'layout', evidence: 'upset-multiline-title-exact-reserve-browser-contract', setup: 'ui' }),
  Object.freeze({ id: 'LAYOUT.box-reserve-invariants', kind: 'contract', contract: 'LAYOUT', components: ['box'] }),
  Object.freeze({ id: 'LAYOUT.box-axis-comparison-clearance', kind: 'contract', contract: 'LAYOUT', components: ['box'] }),
  Object.freeze({ id: 'LAYOUT.scatter-optional-tick-origin', kind: 'contract', contract: 'LAYOUT', components: ['scatter'] }),
  Object.freeze({ id: 'LAYOUT.box-flip-reserve-invariants', kind: 'contract', contract: 'LAYOUT', components: ['box'], requirement: 'Box flip-axis reserve invariants', capability: 'layout', evidence: 'box-flip-reserve-invariants' }),
  Object.freeze({ id: 'LAYOUT.small-viewport-stability', kind: 'contract', contract: 'LAYOUT', components: ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'] }),
  Object.freeze({ id: 'LAYOUT.live-resize-responsive-stack', kind: 'contract', contract: 'LAYOUT', components: ['surface', 'venn'], requirement: 'Surface and UpSet graph marks remain visible during graph-frame resizing in stacked responsive layouts', capability: 'layout', evidence: 'responsive-stacked-live-resize-browser-contract', setup: 'ui' }),
  Object.freeze({ id: 'LAYOUT.scatter-dense-live-resize', kind: 'contract', contract: 'LAYOUT', components: ['scatter'], requirement: 'Dense Scatter marks remain visible and its graph frame changes during continuous resize in a stacked mobile layout', capability: 'layout', evidence: 'dense-scatter-live-resize-frame-contract', setup: 'ui' }),
  Object.freeze({ id: 'LAYOUT.reduced-motion-live-resize', kind: 'contract', contract: 'LAYOUT', components: ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'], requirement: 'All component graphs expand and shrink on both axes before pointer release and every published graph remains visible with reduced motion enabled', capability: 'layout', evidence: 'reduced-motion-live-size-and-publication-browser-contract', setup: 'ui', environment: 'reduced-motion' }),
  Object.freeze({ id: 'LAYOUT.pca-legend-envelope', kind: 'contract', contract: 'LAYOUT', components: ['pca'], requirement: 'PCA legend envelope', capability: 'layout', evidence: 'pca-legend-content-envelope' }),
  Object.freeze({ id: 'LAYOUT.heatmap-label-font-resize', kind: 'contract', contract: 'LAYOUT', components: ['heatmap'], requirement: 'Heatmap label font resize', capability: 'layout', evidence: 'heatmap-label-font-toolbar' }),
  Object.freeze({ id: 'LAYOUT.legend-viewport-invariant', kind: 'contract', contract: 'LAYOUT', components: ['*'] }),
  Object.freeze({ id: 'PERSIST.pca-color-scheme-roundtrip', kind: 'contract', contract: 'PERSIST', components: ['pca'], requirement: 'PCA color scheme persistence', capability: 'persistence', evidence: 'pca-color-scheme-roundtrip' }),
  Object.freeze({ id: 'CACHE.pca-view-only-rotation', kind: 'contract', contract: 'CACHE', components: ['pca'], requirement: 'PCA view-only rotation cache', capability: 'render-cache', evidence: 'pca-view-cache' }),
  Object.freeze({ id: 'CACHE.pca-redraw-cache-reuse', kind: 'contract', contract: 'CACHE', components: ['pca'], requirement: 'PCA redraw and render-cache reuse', capability: 'render-cache', evidence: 'pca-redraw-cache-reuse' }),
  Object.freeze({ id: 'OWN.pca-cancelled-view-draw', kind: 'contract', contract: 'OWN', components: ['pca'], requirement: 'Cancelled PCA view draws preserve owner dirty state and redraw on reactivation', capability: 'owner-isolation', evidence: 'pca-cancelled-view-draw-delayed-switch-and-return-contract', setup: 'api', transition: 'delayed-owner-draw-cancelled-switch-away-and-return' }),
  Object.freeze({ id: 'OWN.pca-stale-font-owner', kind: 'contract', contract: 'OWN', components: ['pca'], requirement: 'A PCA font event for a missing owner cannot dirty the active sibling session', capability: 'owner-isolation', evidence: 'pca-stale-font-event-missing-owner-ab-session-contract', setup: 'api', transition: 'dispatch-font-event-for-nonexistent-owner-while-sibling-active' }),
  Object.freeze({ id: 'OWN.scatter-stale-font-owner', kind: 'contract', contract: 'OWN', components: ['scatter'], requirement: 'A Scatter font event for a missing owner cannot schedule the active sibling session', capability: 'owner-isolation', evidence: 'scatter-stale-font-event-missing-owner-ab-session-contract', setup: 'api', transition: 'dispatch-font-event-for-nonexistent-owner-while-sibling-active' }),
  Object.freeze({ id: 'OWN.scatter-cancelled-draw', kind: 'contract', contract: 'OWN', components: ['scatter'], requirement: 'Cancelled Scatter draws preserve owner dirty state and do not mutate the active sibling', capability: 'owner-isolation', evidence: 'scatter-cancelled-draw-delayed-switch-and-owner-state-contract', setup: 'api', transition: 'post-collection-render-paused-switch-away-and-cancel' }),
  Object.freeze({ id: 'OWN.scatter-canvas-frame-cancellation', kind: 'contract', contract: 'OWN', components: ['scatter'], requirement: 'A cancelled Scatter canvas frame releases its pending draw after tab deactivation', capability: 'async-ownership', evidence: 'scatter-canvas-draw-frame-cancellation-settlement', setup: 'browser', transition: 'pause-canvas-frame-switch-same-type-owner' }),
  Object.freeze({ id: 'OWN.venn-cancelled-draw', kind: 'contract', contract: 'OWN', components: ['venn'], requirement: 'Cancelled Venn draws preserve newer pending owner requests', capability: 'owner-isolation', evidence: 'venn-cancelled-draw-preserves-newer-owner-request-contract', setup: 'api', transition: 'draw-paused-new-owner-request-then-cancel-old-draw' }),
  Object.freeze({ id: 'OWN.venn-disposed-draw-owner', kind: 'contract', contract: 'OWN', components: ['venn'], requirement: 'A disposed Venn owner draw cannot clear sibling pending state, payload, controls or render root', capability: 'owner-isolation', evidence: 'venn-disposed-draw-preserves-sibling-pending-owner-contract', setup: 'api', transition: 'pause-owner-draw-create-sibling-request-remove-owner-release-stale-draw' }),
  Object.freeze({ id: 'OWN.venn-stale-public-draw-owner', kind: 'contract', contract: 'OWN', components: ['venn'], requirement: 'Inactive-owner Venn public draws cannot rebind or mutate the active sibling projection', capability: 'owner-isolation', evidence: 'venn-public-draw-inactive-owner-projection-and-session-contract', setup: 'api', transition: 'explicit-inactive-owner-draw-while-sibling-active' }),
  Object.freeze({ id: 'OWN.venn-stale-refresh-owner', kind: 'contract', contract: 'OWN', components: ['venn'], requirement: 'An explicit inactive Venn refresh cannot update its active sibling', capability: 'owner-isolation', evidence: 'venn-refresh-inactive-owner-session-and-render-contract', setup: 'api', transition: 'same-type-tab-switch-explicit-inactive-refresh' }),
  Object.freeze({ id: 'OWN.venn-save-async-owner', kind: 'contract', contract: 'OWN', components: ['venn'], requirement: 'A Venn save completion updates only the session that started the save after a same-type tab switch', capability: 'owner-isolation', evidence: 'venn-save-and-save-as-delayed-owner-session-payload-controls-contract', setup: 'api', transition: 'save-paused-switch-to-sibling-then-complete' }),
  Object.freeze({ id: 'OWN.hist-cancelled-draw', kind: 'contract', contract: 'OWN', components: ['hist'], requirement: 'Cancelled delayed Histogram draws preserve both tab owners and report cancellation', capability: 'owner-isolation', evidence: 'hist-cancelled-draw-delayed-switch-owner-and-status-contract', setup: 'api', transition: 'owner-draw-paused-switch-to-sibling-then-cancelled' }),
  Object.freeze({ id: 'OWN.pie-cancelled-draw', kind: 'contract', contract: 'OWN', components: ['pie'], requirement: 'Cancelled Pie draws settle with their actual owner outcome', capability: 'owner-isolation', evidence: 'pie-cancelled-draw-settled-owner-contract', setup: 'api', transition: 'draw-paused-then-cancelled' }),
  Object.freeze({ id: 'OWN.pie-draw-switch-isolation', kind: 'contract', contract: 'OWN', components: ['pie'], requirement: 'A delayed Pie draw cannot change a sibling owner after the active tab switches', capability: 'async-ownership', evidence: 'pie-delayed-draw-switch-owner-payload-and-render-contract', setup: 'api', transition: 'pause-owner-draw-activate-sibling-release' }),
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
  Object.freeze({ id: 'CACHE.render-cache-mutation-adapters', kind: 'contract', contract: 'CACHE', components: ['*'], requirement: 'Render-cache variants use explicit component data adapters', capability: 'render-cache', evidence: 'render-cache-mutation-adapter-contract' }),
  Object.freeze({ id: 'CACHE.reopened-first-interaction', kind: 'contract', contract: 'CACHE', components: ['*'], requirement: 'First interaction after render-cache restore', capability: 'render-cache', evidence: 'reopened-first-interaction-contract' }),
  Object.freeze({ id: 'CACHE.legacy-box-cache-resave', kind: 'contract', contract: 'CACHE', components: ['box'], requirement: 'Legacy Box cache redraws, resaves and reopens under the current cache contract', capability: 'render-cache', evidence: 'legacy-box-cache-resave' }),
  Object.freeze({ id: 'PERSIST.venn-empty-payload-defaults', kind: 'contract', contract: 'PERSIST', components: ['venn'], requirement: 'Venn empty-payload defaults', capability: 'persistence', evidence: 'venn-default-payload-reset' }),
  Object.freeze({ id: 'PERSIST.venn-notes-direct', kind: 'contract', contract: 'PERSIST', components: ['venn'], requirement: 'Venn notes ownership', capability: 'notes', evidence: 'venn-notes-owner-isolation' }),
  Object.freeze({ id: 'PERSIST.pie-percent-labels', kind: 'contract', contract: 'PERSIST', components: ['pie'], requirement: 'Pie percent-label persistence', capability: 'persistence', evidence: 'pie-percent-labels-roundtrip' }),
  Object.freeze({ id: 'OWN.pie-tab-host-isolation', kind: 'contract', contract: 'OWN', components: ['pie'], requirement: 'Pie tab host isolation', capability: 'tab-isolation', evidence: 'pie-tab-isolation' }),
  Object.freeze({ id: 'OWN.pie-advisor-stale-owner', kind: 'contract', contract: 'OWN', components: ['pie'], requirement: 'Retained Pie advisor toggle cannot mutate an inactive tab session', capability: 'owner-isolation', evidence: 'pie-advisor-stale-owner-session-regression', setup: 'api', transition: 'same-type-tab-switch-retained-advisor-toggle' }),
  Object.freeze({ id: 'OWN.pie-example-stale-owner', kind: 'contract', contract: 'OWN', components: ['pie'], requirement: 'Retained Pie example button cannot load data into an inactive tab session', capability: 'owner-isolation', evidence: 'pie-example-stale-owner-session-regression', setup: 'api', transition: 'same-type-tab-switch-retained-example-button' }),
  Object.freeze({ id: 'OWN.workspace-grid-dimensions', kind: 'contract', contract: 'OWN', components: ['*'] }),
  Object.freeze({ id: 'OWN.style-control-tab-isolation', kind: 'contract', contract: 'OWN', components: ['*'] }),
  Object.freeze({ id: 'PERSIST.style-sync-across-tabs', kind: 'contract', contract: 'PERSIST', components: ['scatter'], requirement: 'Cross-tab style persistence', capability: 'persistence', evidence: 'source-and-target-payload-contract' }),
  Object.freeze({ id: 'OWN.unsaved-close-decisions', kind: 'contract', contract: 'OWN', components: ['*'] }),
  Object.freeze({ id: 'OWN.workspace-tab-reorder', kind: 'contract', contract: 'OWN', components: ['*'] }),
  Object.freeze({ id: 'OWN.surface-tab-context', kind: 'contract', contract: 'OWN', components: ['surface'], requirement: 'Surface tab context isolation', capability: 'tab-isolation', evidence: 'surface-tab-context' }),
  Object.freeze({ id: 'OWN.venn-runtime-isolation', kind: 'contract', contract: 'OWN', components: ['venn'], requirement: 'Venn runtime isolation', capability: 'tab-isolation', evidence: 'venn-tab-runtime' }),
  Object.freeze({ id: 'OWN.venn-upset-controls', kind: 'contract', contract: 'OWN', components: ['venn'], requirement: 'Venn UpSet control ownership', capability: 'component-modes', evidence: 'venn-upset-controls' }),
  Object.freeze({ id: 'OWN.heatmap-tab-context', kind: 'contract', contract: 'OWN', components: ['heatmap'], requirement: 'Heatmap tab context isolation', capability: 'tab-isolation', evidence: 'heatmap-tab-context' }),
  Object.freeze({ id: 'OWN.heatmap-live-color-scheme-snapshot', kind: 'contract', contract: 'OWN', components: ['heatmap'], requirement: 'Heatmap palette snapshots come from the active owner session and cannot read an inactive sibling', capability: 'live-style-owner-isolation', evidence: 'heatmap-live-palette-owner-session-contract', setup: 'mixed', transition: 'edit-owner-palette-switch-sibling-capture-or-refresh-menu-with-stale-payload', environment: 'jest-and-real-vendor-chromium' }),
  Object.freeze({ id: 'OWN.heatmap-worker-session-isolation', kind: 'contract', contract: 'OWN', components: ['heatmap'], requirement: 'Late Heatmap clustering workers update only the initiating tab session after a same-type switch', capability: 'async-owner-isolation', evidence: 'heatmap-cluster-worker-owner-session', setup: 'api', transition: 'start-worker-switch-tab-resolve-and-reject', environment: 'jest-controlled-worker' }),
  Object.freeze({ id: 'OWN.heatmap-dendrogram-settings-owner', kind: 'contract', contract: 'OWN', components: ['heatmap'], requirement: 'Dendrogram settings survive same-type switching in only their owning Heatmap tab', capability: 'tab-isolation-and-persistence', evidence: 'heatmap-dendrogram-settings-owner-switch', setup: 'ui', transition: 'edit-dendrogram-switch-to-sibling-return', environment: 'chromium-loaded-examples' }),
  Object.freeze({ id: 'CACHE.heatmap-render-cache-restore', kind: 'contract', contract: 'CACHE', components: ['heatmap'], requirement: 'Heatmap render-cache restoration', capability: 'render-cache', evidence: 'heatmap-render-cache-restore' }),
  Object.freeze({ id: 'CACHE.heavy-canvas-recovery', kind: 'contract', contract: 'CACHE', components: ['box', 'scatter', 'heatmap'], requirement: 'Heavy canvas recovery', capability: 'canvas', evidence: 'canvas-owner-recovery' }),
  Object.freeze({ id: 'OWN.line-view-lifecycle', kind: 'contract', contract: 'OWN', components: ['line'], requirement: 'Line view lifecycle ownership', capability: 'tab-isolation', evidence: 'line-view-lifecycle' }),
  Object.freeze({ id: 'OWN.pca-view-controls', kind: 'contract', contract: 'OWN', components: ['pca'], requirement: 'PCA view-control ownership', capability: 'component-modes', evidence: 'pca-view-controls' }),
  Object.freeze({ id: 'OWN.venn-tab-opening', kind: 'contract', contract: 'OWN', components: ['venn'], requirement: 'Venn tab opening ownership', capability: 'tab-isolation', evidence: 'venn-tab-opening' }),
  Object.freeze({ id: 'PERSIST.box-column-style-identity', kind: 'contract', contract: 'PERSIST', components: ['box'], requirement: 'Box indexed styles follow columns through insertion and deletion undo/redo and appear in exported SVG', capability: 'persistence', evidence: 'box-indexed-style-structural-edit-export' }),
  Object.freeze({ id: 'PERSIST.box-column-reorder-undo', kind: 'contract', contract: 'PERSIST', components: ['box'], requirement: 'Box reorder undo restores headers and indexed style identity', capability: 'persistence', evidence: 'box-column-reorder-style-undo' }),
  Object.freeze({ id: 'STATS.box-dual-tab-isolation', kind: 'contract', contract: 'STATS', components: ['box'], requirement: 'Box dual-tab statistics isolation', capability: 'statistics', evidence: 'box-dual-tab-significance-resize-isolation' }),
  Object.freeze({ id: 'STATS.box-dual-tab-no-crash', kind: 'contract', contract: 'STATS', components: ['box'], requirement: 'Box dual-tab statistics stability', capability: 'statistics', evidence: 'box-dual-tab-no-crash' }),
  Object.freeze({ id: 'STATS.box-duplicate-recompute', kind: 'contract', contract: 'STATS', components: ['box'], requirement: 'Box duplicate statistics recomputation', capability: 'statistics', evidence: 'box-duplicate-recompute' }),
  Object.freeze({ id: 'OWN.box-example-controls', kind: 'contract', contract: 'OWN', components: ['box'], requirement: 'Box example control ownership', capability: 'tab-isolation', evidence: 'box-example-controls' }),
  Object.freeze({ id: 'OWN.box-flip-isolation', kind: 'contract', contract: 'OWN', components: ['box'], requirement: 'Box flip isolation', capability: 'tab-isolation', evidence: 'box-flip-isolation' }),
  Object.freeze({ id: 'LAYOUT.box-axis-role-tick-length', kind: 'contract', contract: 'LAYOUT', components: ['box'], requirement: 'Box axis-role tick length', capability: 'layout', evidence: 'box-axis-role-tick-length' }),
  Object.freeze({ id: 'LAYOUT.box-category-spacing', kind: 'contract', contract: 'LAYOUT', components: ['box'], requirement: 'Every Box graph keeps two-thirds-pitch category edge reserves, matching Individual Values summary widths and half-width whisker caps through resize in both orientations', capability: 'layout', evidence: 'rendered-category-axis-symbol-summary-and-cap-geometry', setup: 'mixed', transition: 'single-and-multiple-categories-to-mean-and-median-to-each-graph-type-to-resize-and-grouped-layouts', environment: 'chromium-real-vendors' }),
  Object.freeze({ id: 'LAYOUT.box-whisker-geometry', kind: 'contract', contract: 'LAYOUT', components: ['box'], requirement: 'Box and notched whiskers extend outward from interpolated quartiles after data and orientation changes', capability: 'layout', evidence: 'box-whisker-geometry-browser-contract', setup: 'ui' }),
  Object.freeze({ id: 'LAYOUT.box-inward-borders', kind: 'contract', contract: 'LAYOUT', components: ['box'], requirement: 'Bar, Box, Notched Box and Violin borders grow inward without changing painted bounds, semantic thickness or native vector output across redraw, resize and archive reopen', capability: 'symbol-border-geometry', evidence: 'chromium-pixel-bounds-formatting-redraw-native-pdf-emf-reopen-and-resize', setup: 'mixed', transition: 'zero-to-thick-border-to-redraw-export-cache-reopen-resize', environment: 'chromium-real-vendors' }),
  Object.freeze({ id: 'LAYOUT.inward-stroke-vector', kind: 'contract', contract: 'LAYOUT', components: ['*'], requirement: 'Inward stroke geometry keeps semantic thickness and unique clone clips; transformed nested path clips remain native PDF/EMF with restored sibling clipping', capability: 'vector-clipping', evidence: 'svg-helper-geometry-identity-and-pdf-emf-native-record-contracts', setup: 'api', transition: 'geometry-to-inner-stroke-to-clone-and-transformed-nested-vector-clips', environment: 'jsdom' }),
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
  Object.freeze({ id: 'OWN.box-svg-drag-deactivation', kind: 'contract', contract: 'OWN', components: ['box'] }),
  Object.freeze({ id: 'OWN.font-toolbar-graph-text', kind: 'contract', contract: 'OWN', components: ['line', 'scatter'] }),
  Object.freeze({ id: 'OWN.legend-font-toolbar', kind: 'contract', contract: 'OWN', components: ['box', 'surface'] }),
  Object.freeze({ id: 'OWN.pie-chart-type-controls', kind: 'contract', contract: 'OWN', components: ['pie'] }),
  Object.freeze({ id: 'OWN.pie-color-scheme', kind: 'contract', contract: 'OWN', components: ['pie'], requirement: 'Pie palettes update owner state and rendered marks in radial and stacked views and survive undo, same-type switching and archive reopen', capability: 'color-scheme-ownership', evidence: 'pie-color-scheme-render-session-reopen', setup: 'mixed', transition: 'select-palette-match-replace-undo-redo-add-category-switch-and-reopen' }),
  Object.freeze({ id: 'OWN.color-scheme-application', kind: 'contract', contract: 'OWN', components: ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'], requirement: 'Default example palettes change without custom-color prompts and agree with live owner payloads and visible selectors', capability: 'color-scheme-ownership', evidence: 'all-component-default-palette-application', setup: 'ui', transition: 'load-example-select-palette-settle-check-owner-and-selector' }),
  Object.freeze({ id: 'REC.stats-recovery', kind: 'contract', contract: 'REC', components: ['box', 'roc'] }),
  Object.freeze({ id: 'REC.document-state-recovery', kind: 'contract', contract: 'REC', components: ['*'] }),
  Object.freeze({ id: 'REC.stale-checkpoint-owner-guard', kind: 'contract', contract: 'REC', components: ['*'], requirement: 'Stale empty recovery work cannot clear a newer workspace checkpoint', capability: 'recovery-owner', evidence: 'stale-empty-checkpoint-owner-guard', setup: 'api', transition: 'pause-checkpoint-work-change-workspace-release-and-check-storage' }),
  Object.freeze({ id: 'REC.stale-storage-write-order', kind: 'contract', contract: 'REC', components: ['*'], requirement: 'A delayed older recovery write cannot replace the latest stored workspace revision', capability: 'recovery-owner', evidence: 'delayed-recovery-storage-write-order', setup: 'api', transition: 'pause-old-storage-write-advance-revision-then-release-and-check-stored-revision' }),
  Object.freeze({ id: 'ASYNC.inactive-owner-completion', kind: 'contract', contract: 'ASYNC', components: ['box', 'scatter'], requirement: 'Stale asynchronous owner isolation', capability: 'async-ownership', evidence: 'inactive-owner-completion-contract' }),
  Object.freeze({ id: 'BOOTSTRAP.browser-smoke', kind: 'contract', contract: 'OWN', components: ['*'] }),
  Object.freeze({ id: 'BOOTSTRAP.browser-component-bundles', kind: 'contract', contract: 'OWN', components: ['*'] }),
  Object.freeze({ id: 'BOOTSTRAP.production-derived-loader', kind: 'contract', contract: 'OWN', components: ['*'] }),
  Object.freeze({ id: 'BOOTSTRAP.ui-events-lazy', kind: 'contract', contract: 'OWN', components: ['*'] }),
  Object.freeze({ id: 'BOOTSTRAP.app-initialization', kind: 'contract', contract: 'OWN', components: ['*'] }),
  Object.freeze({ id: 'BOOTSTRAP.format-toolbar-exclusivity', kind: 'contract', contract: 'OWN', components: ['box', 'heatmap'] }),
  Object.freeze({ id: 'BOOTSTRAP.form-controls-autosize', kind: 'contract', contract: 'OWN', components: ['*'] }),
  Object.freeze({ id: 'VENDOR.real-npm-runtime', kind: 'contract', components: ['*'] }),
  Object.freeze({ id: 'VENDOR.browser-runtime', kind: 'contract', components: ['*'] }),
  Object.freeze({ id: 'PERSIST.regression-summary', kind: 'contract', contract: 'PERSIST', components: ['scatter', 'line'] }),
  Object.freeze({ id: 'PERSIST.box-indexed-style-session-write', kind: 'contract', contract: 'PERSIST', components: ['box'] }),
  Object.freeze({ id: 'PERSIST.box-indexed-styles.tab-isolation', kind: 'contract', contract: 'PERSIST', components: ['box'] }),
  Object.freeze({ id: 'PERSIST.box-indexed-styles.recovery', kind: 'contract', contract: 'PERSIST', components: ['box'] }),
  Object.freeze({ id: 'CACHE.surface-render-cache', kind: 'contract', contract: 'CACHE', components: ['surface'] }),
  Object.freeze({ id: 'UNIT.color-scheme-math', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.box-statistics-model', kind: 'unit', components: ['box'] }),
  Object.freeze({ id: 'UNIT.box-named-multiple-comparisons', kind: 'unit', components: ['box'], requirement: 'Dunnett and Dunnett T3 engines preserve exact single-pair limits and reject unsupported inputs', capability: 'multiple-comparisons', evidence: 'box-named-multiple-comparison-engines-unit-contract', setup: 'api' }),
  Object.freeze({ id: 'UNIT.box-stats-model-ownership', kind: 'unit', components: ['box'] }),
  Object.freeze({ id: 'UNIT.box-indexed-styles-model', kind: 'unit', components: ['box'] }),
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
  Object.freeze({ id: 'UNIT.scatter-lowess-model', kind: 'unit', components: ['scatter'] }),
  Object.freeze({ id: 'UNIT.regression-catalog', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.stats-adjust', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.stats-goodness-of-fit', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.stats-corrections', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.svg-geometry', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.theme-adapters', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.theme-catalog', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.theme-compiler', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.cartesian-layout', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.text-block-layout', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.data-view-persistence', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.string-analysis', kind: 'unit', components: ['venn'] }),
  Object.freeze({ id: 'UNIT.uniprot', kind: 'unit', components: ['venn'] }),
  Object.freeze({ id: 'UNIT.graph-archive', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.debug-contract', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.diagnostic-evidence', kind: 'unit', components: ['*'] }),
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
  Object.freeze({ id: 'UNIT.stats-figure-summary-matrix', kind: 'unit', components: ['box', 'scatter', 'line', 'hist', 'pca', 'pie', 'roc', 'survival', 'heatmap', 'surface', 'venn'], requirement: 'Calculated test statistics, probabilities, intervals and descriptive metrics reach the existing compact summary fields', capability: 'statistics-reporting', evidence: 'stats-figure-summary-result-to-projection-matrix', setup: 'api', transition: 'calculated-result-to-report-to-compact-summary', environment: 'jest' }),
  Object.freeze({ id: 'DOM.summary-statistic-projection', kind: 'dom-unit', components: ['box'], requirement: 'Studentized-range q and Friedman Q remain statistics while adjusted q retains probability formatting', capability: 'statistics-reporting', evidence: 'summary-statistic-versus-probability-svg-regression', setup: 'api', transition: 'typed-result-text-to-summary-svg', environment: 'jest' }),
  Object.freeze({ id: 'UNIT.stats-remediation-components', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.box-advisor', kind: 'unit', components: ['box'] }),
  Object.freeze({ id: 'UNIT.box-assumptions', kind: 'unit', components: ['box'] }),
  Object.freeze({ id: 'UNIT.box-axis-autoscale', kind: 'unit', components: ['box'] }),
  Object.freeze({ id: 'UNIT.box-bar-geometry', kind: 'unit', components: ['box'] }),
  Object.freeze({ id: 'UNIT.box-theme-colors', kind: 'unit', components: ['box'] }),
  Object.freeze({ id: 'UNIT.box-point-connections', kind: 'unit', components: ['box'] }),
  Object.freeze({ id: 'UNIT.box-summary', kind: 'unit', components: ['box'] }),
  Object.freeze({ id: 'UNIT.box-report-text-migration', kind: 'unit', components: ['box'] }),
  Object.freeze({ id: 'UNIT.component-load-benchmarks', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.go-analysis', kind: 'unit', components: ['venn'] }),
  Object.freeze({ id: 'UNIT.graph-archive-roundtrip', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.hot-ui-state', kind: 'unit', components: ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'] }),
  Object.freeze({ id: 'UNIT.line-regression-overlay', kind: 'unit', components: ['line'], requirement: 'Line regression overlay segmentation', capability: 'rendering', evidence: 'line-regression-overlay-unit-contract' }),
  Object.freeze({ id: 'UNIT.line-model-helpers', kind: 'unit', components: ['line'] }),
  Object.freeze({ id: 'UNIT.regression-logistic-summary', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'UNIT.roc-classification', kind: 'unit', components: ['roc'], requirement: 'ROC classification setup normalization', capability: 'statistics', evidence: 'roc-classification-unit-contract' }),
  Object.freeze({ id: 'UNIT.scatter-context-selection', kind: 'unit', components: ['scatter'], requirement: 'Scatter point selection semantics', capability: 'interaction', evidence: 'scatter-context-selection-unit-contract' }),
  Object.freeze({ id: 'UNIT.scatter-point-style', kind: 'unit', components: ['scatter'], requirement: 'Scatter point style override semantics', capability: 'component-modes', evidence: 'scatter-point-style-unit-contract' }),
  Object.freeze({ id: 'UNIT.scatter-regression-overlay', kind: 'unit', components: ['scatter'], requirement: 'Scatter regression overlay segmentation', capability: 'rendering', evidence: 'scatter-regression-overlay-unit-contract' }),
  Object.freeze({ id: 'UNIT.welcome-assets', kind: 'unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.color-scheme-svg', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.color-scheme-default-authority', kind: 'dom-unit', components: ['*'], requirement: 'Component color-scheme defaults resolve through the theme catalog', capability: 'theme-model', evidence: 'color-scheme-default-authority-dom-contract', setup: 'api', transition: 'catalog-default-update-to-component-resolution', environment: 'jest-dom' }),
  Object.freeze({ id: 'DOM.color-scheme-live-owner', kind: 'dom-unit', components: ['line', 'heatmap'], requirement: 'Color-scheme identity and application use the active owner session when the saved payload is stale', capability: 'live-style-ownership', evidence: 'color-scheme-live-owner-dom-contract', setup: 'api', transition: 'stale-payload-to-live-owner-scheme-and-style-commit', environment: 'jest-dom' }),
  Object.freeze({ id: 'DOM.color-appearance-identity', kind: 'dom-unit', components: ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'], requirement: 'Independent appearances preserve category assignments, custom styles, value scales, and legacy scheme definitions', capability: 'palette-identity', evidence: 'color-appearance-payload-roundtrip-and-reorder', setup: 'api', transition: 'light-dark-light-serialize-and-reorder', environment: 'jest-dom' }),
  Object.freeze({ id: 'LAYOUT.color-scheme-selector', kind: 'contract', contract: 'LAYOUT', components: ['box'], requirement: 'Palette selector has aligned previews, an explicit selected indicator, and accurate light/dark swatches without decorative black blocks', capability: 'palette-selector-layout', evidence: 'color-scheme-selector-browser-screenshots', setup: 'ui', transition: 'open-light-dark-selector-at-desktop-and-narrow-widths', environment: 'chromium-1280-and-320' }),
  Object.freeze({ id: 'PERSIST.color-appearance-identity', kind: 'contract', contract: 'PERSIST', components: ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'], requirement: 'Rendered appearance and palette assignments survive same-type switching and a real archive reopen', capability: 'palette-persistence-and-isolation', evidence: 'color-appearance-browser-archive-contract', setup: 'ui', transition: 'light-dark-light-sibling-return-archive-reopen', environment: 'chromium-loaded-examples' }),
  Object.freeze({ id: 'DOM.color-scheme-ownership', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.svg-sizing', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.svg-interaction', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.frame-publication', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.title-editing', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.title-edit-checkpoint-undo', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.export-projection', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.visual-projection', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.component-registry', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.stats-formatting', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.dom-controls-ownership', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.font-controls', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.symbol-toolbar', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.style-undo', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'OWN.scheduler-isolation', kind: 'contract', contract: 'OWN', components: ['*'] }),
  Object.freeze({ id: 'OWN.inactive-runtime', kind: 'contract', contract: 'OWN', components: ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'] }),
  Object.freeze({ id: 'OWN.internal-runtime-bridge', kind: 'dom-unit', contract: 'OWN', components: ['*'] }),
  Object.freeze({ id: 'OWN.document-operation-lock', kind: 'contract', contract: 'OWN', components: ['*'] }),
  Object.freeze({ id: 'OWN.component-transition-boundary', kind: 'contract', contract: 'OWN', components: ['*'] }),
  Object.freeze({ id: 'OWN.toolbar-control-isolation', kind: 'contract', contract: 'OWN', components: ['*'], requirement: 'Toolbar state isolation', capability: 'tab-isolation', evidence: 'toolbar-owner-projection' }),
  Object.freeze({ id: 'PERSIST.component-reopen-fidelity', kind: 'contract', contract: 'PERSIST', components: ['*'], requirement: 'Component reopen fidelity', capability: 'reopen-fidelity', evidence: 'payload-runtime-roundtrip-contract' }),
  Object.freeze({ id: 'PERSIST.notes-and-dataviews', kind: 'contract', contract: 'PERSIST', components: ['*'], requirement: 'Notes and DataViews persistence', capability: 'persistence', evidence: 'notes-and-dataviews-roundtrip' }),
  Object.freeze({ id: 'REC.archive-recovery-matrix', kind: 'contract', contract: 'REC', components: ['*'], requirement: 'Archive and recovery fidelity', capability: 'reopen-fidelity', evidence: 'archive-recovery-matrix' }),
  Object.freeze({ id: 'ASYNC.job-cancellation', kind: 'contract', contract: 'ASYNC', components: ['*'] }),
  Object.freeze({ id: 'LAYOUT.component-resize-persistence', kind: 'contract', contract: 'LAYOUT', components: ['*'], requirement: 'Component resize persistence', capability: 'layout', evidence: 'resize-layout-roundtrip' }),
  Object.freeze({ id: 'LAYOUT.cartesian-locked-resize-envelope', kind: 'contract', contract: 'LAYOUT', components: ['box', 'scatter', 'line', 'roc', 'survival', 'hist'], requirement: 'Locked Cartesian resizing keeps the rendered SVG within its frame and content reserves below 200 pixels', capability: 'locked-resize', evidence: 'chromium-width-height-and-corner-resize-envelope', setup: 'mixed', transition: 'example-to-locked-shrink-grow' }),
  Object.freeze({ id: 'LAYOUT.survival-small-frame', kind: 'contract', contract: 'LAYOUT', components: ['survival'], requirement: 'Survival honors small locked frames and contains rendered content', capability: 'locked-resize', evidence: 'chromium-small-frame-svg-content-and-screen-bounds', setup: 'mixed', transition: 'example-to-locked-width-and-height-resize' }),
  Object.freeze({ id: 'LAYOUT.full-range-panel-split', kind: 'contract', contract: 'LAYOUT', components: ['scatter'], requirement: 'Scatter panel divider reaches both workspace edges and collapsed panes survive archive reopen', capability: 'layout', evidence: 'full-range-panel-divider-chrome-contract', setup: 'ui' }),
  Object.freeze({ id: 'LAYOUT.zoom-redraw', kind: 'contract', contract: 'LAYOUT', components: ['*'] }),
  Object.freeze({ id: 'LAYOUT.legend-label-reserve', kind: 'contract', contract: 'LAYOUT', components: ['*'] }),
  Object.freeze({ id: 'STATS.component-reporting', kind: 'contract', contract: 'STATS', components: ['*'], requirement: 'Component statistical reporting', capability: 'statistics', evidence: 'component-statistical-reporting' }),
  Object.freeze({ id: 'MODE.component-persistence-matrix-direct', kind: 'contract', contract: 'PERSIST', components: ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'], requirement: 'Component mode persistence matrix', capability: 'component-modes', evidence: 'per-component-mutation-plan', setup: 'api' }),
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
  Object.freeze({ id: 'DOM.replicates-toolbar-projection', kind: 'dom-unit', components: ['box', 'scatter', 'line', 'pca'], requirement: 'Replicate buttons preserve native owner-bound controls, project restored selection without user changes, and resolve cloned controls locally', capability: 'toolbar', evidence: 'replicates-segmented-projection-and-clone-contract', setup: 'ui' }),
  Object.freeze({ id: 'DOM.dendrogram-controls', kind: 'dom-unit', components: ['heatmap'] }),
  Object.freeze({ id: 'DOM.heatmap-render-publication', kind: 'dom-unit', components: ['heatmap'] }),
  Object.freeze({ id: 'DOM.roc-statistics-presentation', kind: 'dom-unit', components: ['roc'], requirement: 'ROC statistics presentation', capability: 'statistics', evidence: 'roc-statistics-presentation' }),
  Object.freeze({ id: 'DOM.venn-label-layout', kind: 'dom-unit', components: ['venn'] }),
  Object.freeze({ id: 'DOM.venn-numeric-controls', kind: 'dom-unit', components: ['venn'] }),
  Object.freeze({ id: 'DOM.plot3d-rendering', kind: 'dom-unit', components: ['scatter', 'line', 'pca', 'surface'] }),
  Object.freeze({ id: 'DOM.plot3d-gestures', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.hist-scheduler-ownership', kind: 'dom-unit', components: ['hist'] }),
  Object.freeze({ id: 'DOM.grid-controls', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.significance-controls', kind: 'dom-unit', components: ['box'] }),
  Object.freeze({ id: 'DOM.notes', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.toolbar-overflow', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.chart-style', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.exporter-projection', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.exporter-multiline-title', kind: 'dom-unit', components: ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'] }),
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
  Object.freeze({ id: 'DOM.welcome-graph-actions', kind: 'dom-unit', components: ['*'] }),
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
  Object.freeze({ id: 'DOM.requested-defaults', kind: 'dom-unit', components: ['venn', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'] }),
  Object.freeze({ id: 'DOM.scatter-adaptive-size', kind: 'dom-unit', components: ['scatter'] }),
  Object.freeze({ id: 'DOM.table-import-aggrid-paste', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.table-import-owner', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'OWN.table-import-delayed-owner-switch', kind: 'contract', contract: 'OWN', components: ['pca'], requirement: 'A delayed shared table import updates its originating tab after switching to a same-type sibling', capability: 'owner-isolation', evidence: 'table-import-delayed-file-read-owner-session-and-projection-regression', setup: 'api', transition: 'pause-file-read-switch-to-sibling-then-complete-owner-import' }),
  Object.freeze({ id: 'DOM.table-import-prism', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.fileio-activation', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'OWN.workspace-save-owner-scope', kind: 'contract', contract: 'OWN', components: ['*'], requirement: 'Workspace archive saves remain workspace-scoped while a component tab is active', capability: 'owner-isolation', evidence: 'workspace-save-unscoped-from-component-owner', setup: 'api', transition: 'save-workspace-archive-with-active-component-tab' }),
  Object.freeze({ id: 'DOM.hot-aggrid-binding', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.hot-aggrid-clipboard', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.hot-native-selection', kind: 'dom-unit', components: ['*'] }),
  Object.freeze({ id: 'DOM.hot-filter-owner-isolation', kind: 'dom-unit', components: ['*'] }),
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
  Object.freeze({ id: 'STATS.survival-delayed-entry-logrank', kind: 'contract', contract: 'STATS', components: ['survival'] }),
  Object.freeze({ id: 'STATS.box-subject-alignment', kind: 'contract', contract: 'STATS', components: ['box'] }),
  Object.freeze({ id: 'STATS.box-crossed-sphericity', kind: 'contract', contract: 'STATS', components: ['box'] }),
  Object.freeze({ id: 'STATS.box-tied-friedman', kind: 'contract', contract: 'STATS', components: ['box'] }),
  Object.freeze({ id: 'STATS.box-screened-custom', kind: 'contract', contract: 'STATS', components: ['box'] }),
  Object.freeze({ id: 'STATS.box-aligned-reopen', kind: 'contract', contract: 'STATS', components: ['box'] }),
  Object.freeze({ id: 'STATS.box-control-sidak', kind: 'contract', contract: 'STATS', components: ['box'] }),
  Object.freeze({ id: 'STATS.box-named-comparisons', kind: 'contract', contract: 'STATS', components: ['box'], requirement: 'Dunnett and Dunnett T3 probabilities and simultaneous intervals agree with independent SciPy calculations', capability: 'multiple-comparisons', evidence: 'scipy-named-box-comparison-reference', setup: 'mixed', transition:'selected-procedure-to-calculation-save-reopen' }),
  Object.freeze({ id: 'STATS.box-rout-location', kind: 'contract', contract: 'STATS', components: ['box'], requirement: 'ROUT location and RSDR estimates agree with the independent SciPy score-equation solution', capability: 'robust-outlier-detection', evidence: 'scipy-rout-score-equations', setup: 'mixed', transition:'screening-to-inference-save-reopen' }),
  Object.freeze({ id: 'STATS.box-decimal-ranks', kind: 'contract', contract: 'STATS', components: ['box'] }),
  Object.freeze({ id: 'STATS.box-outlier-guidance', kind: 'contract', contract: 'STATS', components: ['box'] }),
  Object.freeze({ id: 'STATS.box-method-reopen', kind: 'contract', contract: 'STATS', components: ['box'] }),
  Object.freeze({ id: 'STATS.box-paired-rank-effect', kind: 'contract', contract: 'STATS', components: ['box'] }),
  Object.freeze({ id: 'STATS.box-friedman-mode', kind: 'contract', contract: 'STATS', components: ['box'] }),
  Object.freeze({ id: 'STATS.ui-presentation-branches', kind: 'contract', contract: 'STATS', components: ['box', 'scatter', 'line', 'pie', 'hist', 'roc', 'survival', 'pca', 'heatmap'] }),
  Object.freeze({ id: 'STATS.ui-persistence-restore', kind: 'contract', contract: 'STATS', components: ['box', 'scatter', 'line', 'pie', 'hist', 'roc', 'survival', 'pca', 'heatmap'] }),
  Object.freeze({ id: 'STATS.box-grouped-owner-reopen', kind: 'contract', contract: 'STATS', components: ['box'], requirement: 'Paired single-format Box results, custom pairs, and grouped metadata survive legacy archive hydration after a grouped Box owner was active', capability: 'statistical-persistence', evidence: 'box-grouped-owner-statistics-reopen-contract', setup: 'computed-stats-payload', transition: 'grouped-box-owner-to-single-box-reopen', environment: 'fake-vendor-integration' }),
  Object.freeze({ id: 'STATS.box-legacy-signature-boundaries', kind: 'contract', contract: 'STATS', components: ['box'], requirement: 'Legacy paired results and custom pairs survive delimiter-bearing names and pair text; changed observations, pairing, or confidence settings invalidate them', capability: 'statistical-persistence', evidence: 'fusion-label-historical-result-reopen', setup: 'computed-paired-stats-with-fusion-label', transition: 'legacy-statistical-version-hydration-to-current-row-identity', environment: 'fake-vendor-integration' }),
  Object.freeze({ id: 'STYLE.box-legend-outline-parity', kind: 'contract', contract: 'STYLE', components: ['box'], requirement: 'Grouped bar legend borders match their symbols at default zero width, positive global width, distinct group overrides, and explicit zero after restoration', capability: 'style-projection', evidence: 'box-grouped-symbol-legend-stroke-parity', setup: 'mixed', transition: 'default-to-global-to-group-overrides-to-zero-payload-restore', environment: 'fake-vendor-integration' }),
  Object.freeze({ id: 'LAYOUT.hist-statistics-settings', kind: 'contract', contract: 'LAYOUT', components: ['hist'], requirement: 'Histogram presents aligned section headings above their boxes and compact analysis controls that retain their widths when the significance field appears and wrap at narrow widths, preserving alpha, calculation and result formatting through archive reopen; the advisor is a keyboard-operable disclosure beside the Analysis settings heading', capability: 'statistics-settings-layout', evidence: 'chromium-alignment-overflow-calculation-format-and-archive-contract', setup: 'mixed', transition: 'configure-calculate-format-resize-reopen-advisor', environment: 'real-vendor-chromium' }),
  Object.freeze({ id: 'LAYOUT.stats-setting-stale-results', kind: 'contract', contract: 'LAYOUT', components: ['box', 'hist', 'line', 'pie', 'roc', 'scatter', 'survival'], requirement: 'Changing a report-only analysis setting keeps the prior result panel visibly marked stale at stable height and does not redraw the unchanged plot', capability: 'statistics-refresh-presentation', evidence: 'chromium-cross-component-stale-panel-and-svg-identity-contract', setup: 'mixed', transition: 'calculate-change-report-setting-retain-stale-panel', environment: 'real-vendor-chromium' }),
  Object.freeze({ id: 'LAYOUT.stats-analysis-settings', kind: 'contract', contract: 'LAYOUT', components: ['hist', 'box', 'scatter', 'line', 'pie', 'roc', 'survival'], requirement: 'Analysis settings, advisor disclosure, calculate action and Results header follow a consistent compact layout; Box balances its six main settings in two columns and places grouped Advanced parameters below, with equal dropdown widths', capability: 'statistics-settings-layout', evidence: 'seven-component-chromium-render-measurement-and-result-screenshot-contract', setup: 'mixed', transition: 'load-example-calculate-disclose-capture', environment: 'real-vendor-chromium' }),
  Object.freeze({ id: 'LAYOUT.stats-calculate-button', kind: 'contract', contract: 'LAYOUT', components: ['venn', 'hist', 'box', 'scatter', 'line', 'pie', 'roc', 'survival'], requirement: 'Existing Calculate statistics buttons share Histogram’s enabled and disabled appearance; Venn keeps its existing disclosure and gains no manual-analysis settings section', capability: 'statistics-action-button-style', evidence: 'computed-enabled-disabled-style-parity-and-venn-disclosure-chromium-contract', setup: 'mixed', transition: 'load-component-compare-enabled-and-disabled-styles', environment: 'real-vendor-chromium' }),
  Object.freeze({ id: 'LAYOUT.shared-statistics-panel-surfaces', kind: 'contract', contract: 'LAYOUT', components: ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'], requirement: 'Shared result cards retain consistent gaps across semantic sections and rounded footer backgrounds without clipping export menus', capability: 'shared-statistics-card-layout', evidence: 'histogram-live-results-and-shared-renderer-primary-advanced-descriptive-restore-fixtures', setup: 'mixed', transition: 'calculate-render-open-details-export-capture-restore', environment: 'real-vendor-chromium-shared-renderer-with-histogram-integration' }),
  Object.freeze({ id: 'LAYOUT.workspace-content-grid', kind: 'contract', contract: 'LAYOUT', components: ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'], requirement: 'Graph controls fill the available width and row height beside the figure; Statistics spans the full right-pane content width; the divider margin alone separates input and graph; controls stay alongside figures on laptop viewports and stack below when content is under 600 pixels; controls narrow to 300 pixels before oversized figures expand the whole right-pane content and use its bottom horizontal scrollbar, while very wide layouts cap controls at 600 pixels, with canonical figure dimensions unchanged', capability: 'responsive-workspace-layout', evidence: 'eleven-component-divider-inset-laptop-and-constrained-pane-geometry-two-stage-resize-600px-control-cap-whole-pane-scroll-and-statistics-width-screenshot-contract', setup: 'ui', transition: 'wide-narrow-wide-viewport-resize-set-oversized-figure-scroll', environment: 'real-vendor-chromium' }),
  Object.freeze({ id: 'LAYOUT.workspace-browser-zoom', kind: 'contract', contract: 'LAYOUT', components: ['hist', 'scatter'], requirement: 'Real browser zoom preserves canonical figure dimensions, full-width Statistics, pane-level scrolling, and a 600-pixel maximum for controls when extra width is available', capability: 'responsive-workspace-layout', evidence: 'histogram-and-scatter-real-browser-zoom-50-67-100-125-200-percent-geometry-and-screenshot-contract', setup: 'ui', transition: 'browser-zoom-out-and-in', environment: 'real-vendor-chromium-with-zoom-extension' }),
  Object.freeze({ id: 'UNIT.axis-range-rules', kind: 'contract', contract: 'LAYOUT', components: [], requirement: 'Shared axis range helpers include zero and custom values only for automatic compatible limits, preserve exact manual limits, and clamp axis origins to their selected ranges', capability: 'axis-range-rules', evidence: 'pure-axis-range-zero-value-manual-limit-and-origin-unit-contract', setup: 'api', transition: 'automatic-manual-linear-log-range-resolution', environment: 'jest-jsdom-pure-helper' }),
  Object.freeze({ id: 'ARCH.static-contracts', kind: 'architecture', components: ['*'] }),
  Object.freeze({ id: 'ARCH.module-call-map', kind: 'architecture', components: ['*'] }),
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
  'OWN.reopen-owner-isolation.all-components',
  'OWN.mixed-table-format-reopen',
  'PERSIST.grouped-header-idempotence',
  'STATS.box-grouped-owner-reopen',
  'STATS.box-legacy-signature-boundaries',
  'PERSIST.explicit-component-mutations',
  'PERSIST.session-payload-write-through',
  'PERSIST.component-reopen-fidelity',
  'REC.archive-recovery-matrix',
  'ASYNC.inactive-owner-completion',
  'CACHE.reopened-first-interaction',
  'PERSIST.style-sync-across-tabs'
]);

const SCENARIOS_BY_FILE = Object.freeze({
  '__tests__/unit/axisRange.test.js': Object.freeze(['UNIT.axis-range-rules']),
  '__tests__/dom/componentLayout.rootHydration.test.js': Object.freeze(['LAYOUT.workspace-root-hydration']),
  '__tests__/dom/productionFixtureLifetime.test.js': Object.freeze(['OWN.fixture-bootstrap-lifetime']),
  '__tests__/dom/session.liveAccess.test.js': Object.freeze(['OWN.live-session-access']),
  '__tests__/unit/componentCatalog.contract.test.js': Object.freeze(['GOVERNANCE.component-catalog']),
  '__tests__/unit/testInventory.contract.test.js': Object.freeze(['GOVERNANCE.discovery-inventory']),
  '__tests__/unit/testManifest.contract.test.js': Object.freeze(['GOVERNANCE.layer-manifest']),
  '__tests__/unit/auditTabLeakSurfaces.helperCalls.test.js': Object.freeze(['GOVERNANCE.tab-isolation-scanner-helper-sinks', 'GOVERNANCE.tab-isolation-scanner-lexical-callbacks', 'GOVERNANCE.tab-isolation-scanner-file-save-sinks']),
  '__tests__/unit/tabIsolationReviewQueue.test.js': Object.freeze(['GOVERNANCE.tab-isolation-review-queue']),
  '__tests__/unit/jestConfig.contract.test.js': Object.freeze(['GOVERNANCE.jest-project-boundaries']),
  '__tests__/unit/testLaneRunner.contract.test.js': Object.freeze(['GOVERNANCE.lane-runner', 'GOVERNANCE.case-evidence']),
  '__tests__/unit/jestShardRunner.contract.test.js': Object.freeze(['GOVERNANCE.jest-shard-runner', 'GOVERNANCE.case-evidence']),
  '__tests__/unit/coverageTrend.contract.test.js': Object.freeze(['GOVERNANCE.coverage-trend']),
  '__tests__/unit/testTrendReport.contract.test.js': Object.freeze(['GOVERNANCE.test-trend-report']),
  '__tests__/unit/integrationTeardown.contract.test.js': Object.freeze(['GOVERNANCE.integration-teardown']),
  '__tests__/workers/box.worker.test.js': Object.freeze(['STATS.box-named-comparisons','STATS.box-rout-location','WORKER.box-actions', 'STATS.box-subject-alignment', 'STATS.box-paired-rank-effect', 'STATS.box-friedman-mode', 'STATS.box-nested-repeated', 'STATS.box-crossed-sphericity']),
  '__tests__/workers/hist.worker.test.js': Object.freeze(['WORKER.hist-distribution-comparison']),
  '__tests__/workers/graphArchive.worker.test.js': Object.freeze(['WORKER.archive-protocol']),
  '__tests__/workers/heatmap.worker.test.js': Object.freeze(['WORKER.heatmap-clustering']),
  '__tests__/workers/pca.worker.test.js': Object.freeze(['WORKER.pca-svd']),
  '__tests__/workers/pca-embed.worker.test.js': Object.freeze(['WORKER.pca-embedding']),
  '__tests__/workers/scatter.worker.test.js': Object.freeze(['WORKER.scatter-render-stats']),
  '__tests__/integration/heatmap.tabContext.test.js': Object.freeze(['OWN.heatmap-tab-context', 'OWN.heatmap-live-color-scheme-snapshot', 'OWN.heatmap-worker-session-isolation', 'OWN.heatmap-inactive-payload-owner', 'OWN.heatmap-stale-pvalue-owner', 'CACHE.heatmap-render-cache-restore', 'PERSIST.heatmap-notes-direct']),
  '__tests__/integration/heavy.canvas.reopen.recovery.regression.test.js': Object.freeze(['CACHE.heavy-canvas-recovery']),
  '__tests__/integration/line.view.test.js': Object.freeze(['OWN.line-view-lifecycle', 'OWN.cartesian-axis-length-stale-owner']),
  '__tests__/integration/scatter.axesLengthOwnerIsolation.test.js': Object.freeze(['OWN.cartesian-axis-length-stale-owner', 'OWN.scatter-view-mode-stale-owner', 'OWN.scatter-example-stale-owner', 'OWN.scatter-replicate-controls-stale-owner']),
  'e2e/ownership/cartesian-axes-length-owner-isolation.spec.js': Object.freeze(['OWN.cartesian-axis-length-stale-owner-browser']),
  '__tests__/integration/line.view.styles.test.js': Object.freeze(['OWN.line-view-lifecycle']),
  '__tests__/integration/line.view.ownership.test.js': Object.freeze(['OWN.line-view-lifecycle', 'OWN.line-example-stale-owner', 'OWN.line-display-mode-stale-owner', 'OWN.line-viewmode-stale-owner', 'OWN.line-data-toolbar-stale-owner', 'OWN.line-stats-button-stale-owner', 'OWN.line-inactive-payload-owner', 'OWN.line-save-file-owner', 'OWN.line-cancelled-draw-owner', 'OWN.line-replicate-controls-stale-owner', 'STATS.line-reporting-direct']),
  '__tests__/integration/graphFileSave.ownerIsolation.test.js': Object.freeze(['OWN.component-save-target-owner-isolation']),
  '__tests__/integration/survival.graphSave.ownerIsolation.test.js': Object.freeze(['OWN.survival-file-target-owner-isolation']),
  '__tests__/integration/pca.view.test.js': Object.freeze(['OWN.pca-view-controls', 'PERSIST.pca-data-views-direct', 'OWN.pca-component-selection-stale-owner']),
  '__tests__/integration/hist.controlOwnerIsolation.test.js': Object.freeze(['OWN.hist-control-stale-owner']),
  '__tests__/integration/pca.view.statistics.test.js': Object.freeze(['STATS.pca-reporting-direct']),
  '__tests__/integration/pca.view.redraw.test.js': Object.freeze(['CACHE.pca-redraw-cache-reuse', 'OWN.pca-cancelled-view-draw', 'OWN.pca-stale-font-owner']),
  '__tests__/integration/scatter.cancelledDrawOwnership.test.js': Object.freeze(['OWN.scatter-cancelled-draw']),
  '__tests__/integration/venn.cancelledDrawOwnership.test.js': Object.freeze(['OWN.venn-cancelled-draw', 'OWN.venn-disposed-draw-owner', 'OWN.venn-stale-public-draw-owner', 'OWN.venn-stale-refresh-owner', 'OWN.venn-save-async-owner']),
  '__tests__/integration/hist.cancelledDrawOwnership.test.js': Object.freeze(['OWN.hist-cancelled-draw']),
  '__tests__/integration/pie.cancelledDrawOwnership.test.js': Object.freeze(['OWN.pie-cancelled-draw', 'OWN.pie-draw-switch-isolation']),
  '__tests__/integration/pca.preprocessing.test.js': Object.freeze(['PERSIST.pca-data-views-direct']),
  '__tests__/integration/venn.additionalTabOpen.test.js': Object.freeze(['OWN.venn-tab-opening']),
  '__tests__/integration/venn.go-string.ownership.test.js': Object.freeze(['ASYNC.venn-analysis-owner']),
  '__tests__/integration/venn.cache-recovery.test.js': Object.freeze(['CACHE.venn-read-only-capture', 'PERSIST.component-reopen-fidelity']),
  'e2e/box/box.column-insert-style-identity.spec.js': Object.freeze(['PERSIST.box-column-style-identity']),
  'e2e/box/box.indexed-styles.session-write.spec.js': Object.freeze(['PERSIST.box-indexed-style-session-write', 'PERSIST.box-indexed-styles.tab-isolation']),
  'e2e/box/box.column-reorder.undo-race.spec.js': Object.freeze(['PERSIST.box-column-reorder-undo']),
  'e2e/recovery/recovery.box-indexed-style.spec.js': Object.freeze(['REC.archive-recovery-matrix', 'PERSIST.component-reopen-fidelity', 'PERSIST.box-indexed-styles.recovery']),
  '__tests__/unit/box.indexedStylesModel.test.js': Object.freeze(['UNIT.box-indexed-styles-model']),
  'e2e/box/box.comma-decimal-values.spec.js': Object.freeze(['IMPORT.component-data-import']),
  'e2e/box/box.dual-tab.significance-resize.isolation.spec.js': Object.freeze(['STATS.box-dual-tab-isolation', 'LAYOUT.box-flip-resize']),
  'e2e/box/box.dual-tab.stats-no-crash.spec.js': Object.freeze(['STATS.box-dual-tab-no-crash']),
  'e2e/box/box.duplicate-computed-stats.recalc.spec.js': Object.freeze(['STATS.box-duplicate-recompute']),
  'e2e/box/box.example-control-panel.spec.js': Object.freeze(['OWN.box-example-controls', 'PERSIST.box-notes-direct']),
  'e2e/box/box.flip-axes.tab-isolation.spec.js': Object.freeze(['OWN.box-flip-isolation']),
  'e2e/box/box.flip-axes.tick-length.spec.js': Object.freeze(['LAYOUT.box-axis-role-tick-length']),
  'e2e/box/box.category-spacing.spec.js': Object.freeze(['LAYOUT.box-category-spacing']),
  'e2e/box/box.whisker-geometry.spec.js': Object.freeze(['LAYOUT.box-whisker-geometry']),
  'e2e/box/box.inward-borders.spec.js': Object.freeze(['LAYOUT.box-inward-borders']),
  'e2e/box/box.conditional-controls.visibility.spec.js': Object.freeze(['LAYOUT.box-conditional-controls', 'PERSIST.box-conditional-controls-reopen']),
  'e2e/box/box.flip-axes.transpose-manual-resize.spec.js': Object.freeze(['LAYOUT.box-flip-resize']),
  'e2e/box/box.formula-editor.spec.js': Object.freeze(['OWN.box-formula-editor', 'LAYOUT.ag-grid-formula-reference-outline']),
  'e2e/box/box.formula-fill-handle.spec.js': Object.freeze(['OWN.box-formula-fill']),
  'e2e/box/box.formula-function-assist.spec.js': Object.freeze(['OWN.box-formula-assist', 'A11Y.box-formula-suggestion-target-size', 'A11Y.box-formula-suggestion-combobox', 'A11Y.box-formula-signature-tooltip', 'LAYOUT.box-formula-assist-short-viewport', 'A11Y.box-formula-suggestion-owner-lifecycle', 'A11Y.box-formula-tooltip-owner-lifecycle']),
  'e2e/box/box.formula.first-edit-render.regression.spec.js': Object.freeze(['OWN.box-formula-first-render']),
  'e2e/box/box.formula.numeric-edit.regression.spec.js': Object.freeze(['OWN.box-formula-edit']),
  'e2e/box/box.grouped-empty-duplicate-lifecycle.spec.js': Object.freeze(['OWN.box-grouped-lifecycle']),
  'e2e/box/box.grouped-grid-seam.spec.js': Object.freeze(['LAYOUT.box-grouped-grid']),
  'e2e/box/box.horizontal-resize-axis.spec.js': Object.freeze(['LAYOUT.box-horizontal-resize-axis']),
  'e2e/box/box.horizontal-shrink.layout-invariants.spec.js': Object.freeze(['LAYOUT.box-horizontal-shrink']),
  'e2e/box/box.initial-bottom-reserve.spec.js': Object.freeze(['LAYOUT.box-initial-reserve']),
  'e2e/box/box.inline-edit-selection-bg.spec.js': Object.freeze(['OWN.box-inline-edit']),
  '__tests__/unit/productionBootstrap.contract.test.js': Object.freeze(['GOVERNANCE.production-bootstrap-manifest']),
  '__tests__/unit/focusModality.bootstrap.test.js': Object.freeze(['GOVERNANCE.browser-helper-bootstrap']),
  '__tests__/unit/vendorProvenance.contract.test.js': Object.freeze(['GOVERNANCE.vendor-provenance']),
  '__tests__/unit/impactMap.contract.test.js': Object.freeze(['GOVERNANCE.change-impact-map']),
  '__tests__/unit/componentMutationCatalog.contract.test.js': Object.freeze(['GOVERNANCE.component-mutation-catalog']),
  '__tests__/unit/renderCacheMutationAdapters.contract.test.js': Object.freeze(['CACHE.render-cache-mutation-adapters']),
  '__tests__/unit/componentLifecycle.model.test.js': Object.freeze(['UNIT.component-lifecycle-renderability']),
  '__tests__/unit/componentLifecycle.sessionShape.test.js': Object.freeze(['OWN.session-shape-idempotence']),
  '__tests__/unit/componentLifecycle.ownerControlBinding.test.js': Object.freeze(['OWN.component-dom-binding', 'ARCH.semantic-render-impact']),
  '__tests__/integration/componentSessionShape.idempotence.test.js': Object.freeze(['OWN.session-shape-idempotence']),
  '__tests__/architecture/hot.pasteScheduling.contract.test.js': Object.freeze(['ARCH.hot-paste-scheduling']),
  '__tests__/unit/vendorRuntime.smoke.test.js': Object.freeze(['VENDOR.real-npm-runtime']),
  '__tests__/unit/colorSchemes.colorMath.test.js': Object.freeze(['UNIT.color-scheme-math']),
  '__tests__/unit/box.statsTestSelection.model.test.js': Object.freeze(['UNIT.box-statistics-model', 'STATS.box-subject-alignment', 'STATS.box-crossed-sphericity', 'STATS.box-lognormal-repeated', 'STATS.box-methods-guidance', 'STATS.box-screened-custom', 'STATS.box-tied-friedman', 'STATS.box-control-sidak', 'STATS.box-decimal-ranks', 'STATS.box-outlier-guidance', 'STATS.box-paired-rank-effect', 'STATS.box-friedman-mode']),
  '__tests__/unit/stats.reportingText.migration.test.js': Object.freeze(['UNIT.box-report-text-migration']),
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
  '__tests__/unit/scatterLowessModel.test.js': Object.freeze(['UNIT.scatter-lowess-model']),
  '__tests__/unit/regression.catalog.test.js': Object.freeze(['UNIT.regression-catalog']),
  '__tests__/unit/stats.adjust.test.js': Object.freeze(['UNIT.stats-adjust']),
  '__tests__/unit/stats.goodnessOfFit.test.js': Object.freeze(['UNIT.stats-goodness-of-fit']),
  '__tests__/unit/stats.pvalue.corrections.test.js': Object.freeze(['UNIT.stats-corrections']),
  '__tests__/unit/svgGeometry.test.js': Object.freeze(['UNIT.svg-geometry']),
  '__tests__/unit/theme.adapters.test.js': Object.freeze(['UNIT.theme-adapters']),
  '__tests__/unit/theme.catalog.test.js': Object.freeze(['UNIT.theme-catalog']),
  '__tests__/unit/theme.compiler.test.js': Object.freeze(['UNIT.theme-compiler']),
  '__tests__/unit/cartesianLayout.test.js': Object.freeze(['UNIT.cartesian-layout']),
  '__tests__/unit/textBlock.test.js': Object.freeze(['UNIT.text-block-layout']),
  '__tests__/unit/dataViewPersistence.test.js': Object.freeze(['UNIT.data-view-persistence']),
  '__tests__/unit/stringAnalysis.test.js': Object.freeze(['UNIT.string-analysis']),
  '__tests__/unit/uniprot.test.js': Object.freeze(['UNIT.uniprot']),
  '__tests__/unit/graphArchive.adaptiveCompression.test.js': Object.freeze(['UNIT.graph-archive']),
  '__tests__/unit/graphArchive.boundedZipRead.test.js': Object.freeze(['ARCHIVE.zip-entry-bounds']),
  '__tests__/unit/graphArchive.payloadLiteLoad.test.js': Object.freeze(['UNIT.graph-archive']),
  '__tests__/unit/debug.contract.test.js': Object.freeze(['UNIT.debug-contract']),
  '__tests__/unit/diagnostics.contract.test.js': Object.freeze(['UNIT.diagnostic-evidence']),
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
  '__tests__/unit/stats.figureSummary.reportingMatrix.test.js': Object.freeze(['UNIT.stats-figure-summary-matrix','STATS.box-crossed-sphericity']),
  '__tests__/unit/stats.audit.remediation.components.test.js': Object.freeze(['UNIT.stats-remediation-components']),
  '__tests__/unit/hist.advisor.test.js': Object.freeze(['STATS.hist-advisor','STATS.hist-aicc-availability','WORKER.hist-distribution-comparison']),
  '__tests__/unit/stats.twoSampleKolmogorovSmirnov.test.js': Object.freeze(['STATS.hist-distribution-calibration']),
  '__tests__/unit/stats.advisorPolicies.test.js': Object.freeze(['STATS.advisor-contract','STATS.roc-advisor-class-replication']),
  '__tests__/unit/box.advisor.test.js': Object.freeze(['UNIT.box-advisor','STATS.box-advisor-plan-parity','STATS.box-lognormal-repeated','STATS.box-nested-repeated','STATS.box-crossed-sphericity']),
  '__tests__/unit/box.assumptions.test.js': Object.freeze(['UNIT.box-assumptions']),
  '__tests__/unit/box.axisAutoScale.test.js': Object.freeze(['UNIT.box-axis-autoscale']),
  '__tests__/unit/box.barNegativeGeometry.test.js': Object.freeze(['UNIT.box-bar-geometry']),
  '__tests__/unit/box.fillColorTheme.test.js': Object.freeze(['UNIT.box-theme-colors']),
  '__tests__/unit/box.pointConnections.test.js': Object.freeze(['UNIT.box-point-connections']),
  '__tests__/unit/box.statsModelOwnership.contract.test.js': Object.freeze(['UNIT.box-stats-model-ownership']),
  '__tests__/unit/box.namedMethods.model.test.js': Object.freeze(['UNIT.box-named-multiple-comparisons','STATS.box-named-comparisons','STATS.box-rout-location']),
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
  '__tests__/integration/roc.renderCacheCapture.test.js': Object.freeze(['CACHE.roc-read-only-capture', 'OWN.roc-grid-stale-owner', 'OWN.roc-snapshot-missing-owner']),
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
  '__tests__/dom/menuKeyboard.test.js': Object.freeze(['A11Y.application-menu-keyboard', 'LAYOUT.floating-menu-viewport-clamping']),
  '__tests__/dom/editableCombobox.test.js': Object.freeze(['A11Y.editable-combobox-state']),
  '__tests__/dom/chartPointKeyboard.test.js': Object.freeze(['A11Y.chart-point-keyboard-navigation']),
  '__tests__/dom/modalLifecycle.test.js': Object.freeze(['A11Y.modal-lifecycle']),
  '__tests__/dom/tabListKeyboard.test.js': Object.freeze(['A11Y.analysis-result-tabs-keyboard']),
  '__tests__/dom/statsSummaryTabs.test.js': Object.freeze(['A11Y.analysis-result-tabs-keyboard', 'A11Y.analysis-result-tabs-owner-isolation']),
  '__tests__/unit/scatter.pointContextMenuSelection.test.js': Object.freeze(['UNIT.scatter-context-selection']),
  '__tests__/unit/scatter.pointStyleOverrides.test.js': Object.freeze(['UNIT.scatter-point-style']),
  '__tests__/unit/scatter.regressionOverlayRange.test.js': Object.freeze(['UNIT.scatter-regression-overlay']),
  '__tests__/unit/welcome.example-assets.test.js': Object.freeze(['UNIT.welcome-assets']),
  '__tests__/dom/session.assignTabPayload.assignment-guards.test.js': Object.freeze(['PERSIST.session-payload-write-through']),
  '__tests__/dom/session.assignTabPayload.cache-capture.test.js': Object.freeze(['PERSIST.session-payload-write-through']),
  '__tests__/dom/session.assignTabPayload.dirty-state.test.js': Object.freeze(['PERSIST.session-payload-write-through']),
  '__tests__/dom/session.assignTabPayload.canonical-ui-events.test.js': Object.freeze(['PERSIST.session-payload-write-through']),
  '__tests__/dom/session.assignTabPayload.signature-and-cache-persistence.test.js': Object.freeze(['PERSIST.session-payload-write-through']),
  '__tests__/dom/documentState.recoveryThrottle.test.js': Object.freeze(['REC.document-state-recovery','REC.stale-checkpoint-owner-guard','REC.stale-storage-write-order','OWN.tab-scoped-file-target-isolation']),
  '__tests__/dom/documentState.canonicalJournalTabCoalescing.test.js': Object.freeze(['REC.document-state-recovery','OWN.tab-scoped-file-target-isolation']),
  '__tests__/dom/sessionActions.saveLazyBuild.test.js': Object.freeze(['ARCHIVE.session-save-policies', 'ARCHIVE.reopened-write-permission', 'ARCHIVE.save-picker-before-preparation']),
  '__tests__/dom/sessionActions.ownerReadiness.test.js': Object.freeze(['REC.archive-recovery-matrix','OWN.tab-scoped-file-target-isolation']),
  '__tests__/dom/sessionActions.cacheSerialization.test.js': Object.freeze(['CACHE.tab-switch-reuse', 'ARCHIVE.session-save-policies']),
  '__tests__/dom/sessionActions.uiSaveLoad.test.js': Object.freeze(['ARCHIVE.session-save-policies','OWN.tab-scoped-file-target-isolation']),
  '__tests__/dom/sessionActions.restoreParity.test.js': Object.freeze(['REC.archive-restore-transaction']),
  '__tests__/dom/colorSchemes.core.test.js': Object.freeze(['DOM.color-scheme-svg', 'DOM.color-scheme-default-authority', 'DOM.color-appearance-identity', 'DOM.color-scheme-live-owner']),
  '__tests__/dom/colorSchemes.customChoice.test.js': Object.freeze(['DOM.color-scheme-ownership', 'DOM.color-scheme-live-owner']),
  '__tests__/dom/colorSchemes.defaultIsolation.test.js': Object.freeze(['DOM.color-scheme-ownership']),
  '__tests__/dom/colorSchemes.undo.test.js': Object.freeze(['DOM.color-scheme-ownership']),
  '__tests__/dom/dom.autoResizeSvg.test.js': Object.freeze(['DOM.svg-sizing']),
  '__tests__/dom/dom.enableLabelDrag.test.js': Object.freeze(['DOM.svg-interaction']),
  '__tests__/dom/dom.enableLegendDrag.test.js': Object.freeze(['DOM.svg-interaction']),
  '__tests__/dom/dom.framePublication.test.js': Object.freeze(['DOM.frame-publication']),
  '__tests__/dom/dom.titleEmptyEdit.test.js': Object.freeze(['DOM.title-editing', 'DOM.title-edit-checkpoint-undo']),
  '__tests__/dom/exportProjection.contract.test.js': Object.freeze(['DOM.export-projection']),
  '__tests__/dom/visualProjection.test.js': Object.freeze(['DOM.visual-projection']),
  '__tests__/dom/main.components.ensureComponent.test.js': Object.freeze(['DOM.component-registry']),
  '__tests__/dom/domControls.defaultPayloads.test.js': Object.freeze(['DOM.dom-controls-ownership']),
  '__tests__/dom/domControls.renderCacheActivation.test.js': Object.freeze(['DOM.dom-controls-ownership']),
  '__tests__/dom/workspacePresentation.test.js': Object.freeze(['REC.background-preparation']),
  '__tests__/dom/workspacePreparation.test.js': Object.freeze(['REC.background-preparation']),
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
  '__tests__/dom/workspaceToolbar.overflow.test.js': Object.freeze(['DOM.workspace-toolbar-overflow', 'DOM.replicates-toolbar-projection']),
  '__tests__/dom/dendrogramControls.numericWheel.test.js': Object.freeze(['DOM.dendrogram-controls']),
  '__tests__/dom/heatmap.dendrogram-rendering.test.js': Object.freeze(['DOM.heatmap-render-publication']),
  '__tests__/dom/roc.statistics.standard.test.js': Object.freeze(['DOM.roc-statistics-presentation']),
  '__tests__/dom/venn.labelLayout.test.js': Object.freeze(['DOM.venn-label-layout']),
  '__tests__/shared/plot3d.test.js': Object.freeze(['DOM.plot3d-rendering']),
  '__tests__/shared/plot3d.rotationGestures.test.js': Object.freeze(['DOM.plot3d-gestures']),
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
  '__tests__/dom/publicationStyles.core.test.js': Object.freeze(['DOM.publication-live-style-source']),
  '__tests__/dom/exporter.dropdownStacking.test.js': Object.freeze(['DOM.exporter-projection']),
  '__tests__/dom/exporter.titleVisibility.test.js': Object.freeze(['DOM.exporter-projection', 'DOM.exporter-multiline-title']),
  '__tests__/dom/exporter.statsFigureSummary.test.js': Object.freeze(['DOM.exporter-projection']),
  '__tests__/dom/exporter.significanceHitOverlay.test.js': Object.freeze(['DOM.exporter-projection']),
  '__tests__/dom/exporter.hybridSource.test.js': Object.freeze(['DOM.exporter-projection']),
  '__tests__/dom/exporter.physicalProjection.test.js': Object.freeze(['DOM.exporter-projection', 'LAYOUT.inward-stroke-vector']),
  '__tests__/dom/exporter.inkscapeUngroupStability.test.js': Object.freeze(['DOM.exporter-projection']),
  '__tests__/dom/exporter.savePicker.test.js': Object.freeze(['DOM.exporter-projection']),
  '__tests__/dom/exporter.firefoxSvgCopy.test.js': Object.freeze(['DOM.exporter-projection']),
  '__tests__/dom/tableImport.formats.test.js': Object.freeze(['DOM.table-import-format-registry']),
  '__tests__/dom/tableImport.firefoxExcelPaste.test.js': Object.freeze(['DOM.table-import-format-registry']),
  '__tests__/dom/tableImport.affordances.test.js': Object.freeze(['DOM.table-import-format-registry', 'DOM.shared-controls']),
  '__tests__/dom/additionalLineControls.pathCompatibility.test.js': Object.freeze(['DOM.shared-controls']),
  '__tests__/dom/axisControls.init.test.js': Object.freeze(['DOM.shared-controls']),
  '__tests__/dom/axisControls.editing.test.js': Object.freeze(['DOM.shared-controls', 'DOM.axis-length-zoom-refinement']),
  '__tests__/dom/axisControls.ownership.test.js': Object.freeze(['DOM.shared-controls']),
  '__tests__/dom/resizer.canvasReuse.test.js': Object.freeze(['DOM.shared-controls']),
  '__tests__/dom/resizer.optionsMenu.controls.test.js': Object.freeze(['DOM.shared-controls']),
  '__tests__/dom/resizer.optionsMenu.geometry.test.js': Object.freeze(['DOM.shared-controls', 'DOM.zoom-frame-projection']),
  '__tests__/dom/resizer.panelLayoutPersistence.test.js': Object.freeze(['DOM.shared-controls']),
  '__tests__/dom/componentLayout.zoomBehavior.test.js': Object.freeze(['DOM.shared-controls']),
  '__tests__/dom/jobs.controller.test.js': Object.freeze(['DOM.shared-controls']),
  '__tests__/dom/graphSizing.defaultBaseline.test.js': Object.freeze(['DOM.graph-sizing']),
  '__tests__/dom/stats.reporting.layout.test.js': Object.freeze(['DOM.statistics-projection']),
  '__tests__/dom/stats.reportingNotation.test.js': Object.freeze(['DOM.statistics-projection']),
  '__tests__/dom/stats.figureSummary.state.contract.test.js': Object.freeze(['DOM.statistics-projection']),
  '__tests__/dom/stats.figureSummary.renderer.layout.test.js': Object.freeze(['DOM.statistics-projection']),
  '__tests__/dom/stats.figureSummary.renderer.reporting.test.js': Object.freeze(['DOM.statistics-projection', 'DOM.summary-statistic-projection']),
  '__tests__/dom/stats.figureSummary.renderer.ownership.test.js': Object.freeze(['DOM.statistics-projection']),
  '__tests__/dom/componentLifecycle.ownerPersistence.test.js': Object.freeze(['DOM.lifecycle-ownership']),
  '__tests__/dom/componentLifecycle.core.authority-and-readiness.test.js': Object.freeze(['DOM.lifecycle-core', 'OWN.negative-owner-handoffs']),
  '__tests__/unit/componentLifecycle.negativeOwnerMatrix.test.js': Object.freeze(['OWN.negative-owner-handoffs']),
  '__tests__/dom/componentLifecycle.core.cache-and-editing.test.js': Object.freeze(['DOM.lifecycle-core']),
  '__tests__/dom/componentLifecycle.core.payload-and-async.test.js': Object.freeze(['DOM.lifecycle-core']),
  '__tests__/dom/componentLifecycle.core.runtime-ownership.test.js': Object.freeze(['DOM.lifecycle-core', 'OWN.internal-runtime-bridge']),
  '__tests__/dom/componentLifecycle.core.restore-and-scheduling.test.js': Object.freeze(['DOM.lifecycle-core','OWN.tab-scoped-file-target-isolation']),
  '__tests__/dom/componentLifecycle.core.cleanup-and-publication.test.js': Object.freeze(['DOM.lifecycle-core']),
  '__tests__/dom/componentDrawableFrame.authority.test.js': Object.freeze(['DOM.component-frame-authority']),
  '__tests__/dom/stats.inference.tabIsolation.test.js': Object.freeze(['DOM.statistics-projection']),
  '__tests__/dom/stats.pvalueFormat.tabIsolation.test.js': Object.freeze(['DOM.statistics-projection']),
  '__tests__/dom/theme.runtime.test.js': Object.freeze(['DOM.theme-runtime']),
  '__tests__/dom/pca.pointStyleScopes.test.js': Object.freeze(['DOM.pca-point-styles']),
  '__tests__/dom/pca.preprocessing.test.js': Object.freeze(['DOM.pca-preprocessing', 'STATS.pca-parallel-analysis']),
  '__tests__/dom/formControls.autosize.test.js': Object.freeze(['DOM.form-controls-autosize']),
  '__tests__/dom/heatmap.model.test.js': Object.freeze(['DOM.heatmap-model-helpers']),
  '__tests__/dom/welcome.ready.test.js': Object.freeze(['DOM.welcome-startup']),
  '__tests__/dom/stats.abbreviations.test.js': Object.freeze(['DOM.stats-formatting']),
  '__tests__/dom/box.liveStyleRefresh.test.js': Object.freeze(['DOM.box-live-style']),
  '__tests__/dom/box.significanceWhiskers.test.js': Object.freeze(['DOM.box-significance-whiskers']),
  '__tests__/dom/box.statsReportingSurface.contract.test.js': Object.freeze(['DOM.box-stats-reporting']),
  '__tests__/dom/box.swarmOffsets.test.js': Object.freeze(['DOM.box-swarm-offsets']),
  '__tests__/dom/box.swarmOffsets.pointStyles.test.js': Object.freeze(['DOM.box-swarm-offsets']),
  '__tests__/dom/box.swarmOffsets.interaction.test.js': Object.freeze(['DOM.box-swarm-offsets']),
  '__tests__/dom/box.swarmOffsets.previewResize.test.js': Object.freeze(['DOM.box-swarm-offsets']),
  '__tests__/dom/colorPicker.toolbarOwnership.test.js': Object.freeze(['DOM.color-picker-toolbar-ownership']),
  '__tests__/dom/dataViews.exportTabs.test.js': Object.freeze(['DOM.data-views-export', 'A11Y.application-menu-keyboard']),
  '__tests__/dom/exporter.scatterOptimization.test.js': Object.freeze(['DOM.exporter-scatter-optimization']),
  '__tests__/dom/graphArchive.renderCacheSerialization.test.js': Object.freeze(['DOM.graph-archive-render-cache']),
  '__tests__/dom/hist.drawableFrame.test.js': Object.freeze(['DOM.hist-frame']),
  '__tests__/dom/hist.panel-layout.test.js': Object.freeze(['DOM.hist-panel-layout']),
  '__tests__/dom/previews.pngFallback.test.js': Object.freeze(['DOM.previews-png-fallback']),
  '__tests__/dom/requested-defaults.contract.test.js': Object.freeze(['DOM.requested-defaults']),
  '__tests__/dom/scatter.adaptiveSize.test.js': Object.freeze(['DOM.scatter-adaptive-size']),
  '__tests__/dom/tableImport.ownerTransaction.test.js': Object.freeze(['DOM.table-import-owner','OWN.table-import-delayed-owner-switch']),
  '__tests__/dom/tableImport.paste.aggrid.test.js': Object.freeze(['DOM.table-import-aggrid-paste']),
  '__tests__/dom/tableImport.prism.test.js': Object.freeze(['DOM.table-import-prism']),
  '__tests__/dom/tabs.documentOperation.test.js': Object.freeze(['OWN.document-operation-lock']),
  '__tests__/dom/fileIO.activation.test.js': Object.freeze(['DOM.fileio-activation', 'OWN.workspace-save-owner-scope']),
  '__tests__/dom/hot.aggrid.binding.selection-and-payload.test.js': Object.freeze(['DOM.hot-aggrid-binding']),
  '__tests__/dom/hot.aggrid.binding.editor-behavior.test.js': Object.freeze(['DOM.hot-aggrid-binding']),
  '__tests__/dom/hot.aggrid.binding.filters-and-analysis.test.js': Object.freeze(['DOM.hot-aggrid-binding']),
  '__tests__/dom/hot.aggrid.binding.structural-and-scroll.test.js': Object.freeze(['DOM.hot-aggrid-binding']),
  '__tests__/dom/hot.aggrid.clipboard-selection.paste-and-selection.test.js': Object.freeze(['DOM.hot-aggrid-clipboard']),
  '__tests__/dom/hot.aggrid.clipboard-selection.selection-geometry.test.js': Object.freeze(['DOM.hot-aggrid-clipboard', 'DOM.hot-native-selection']),
  '__tests__/dom/hot.aggrid.clipboard-selection.column-reorder.test.js': Object.freeze(['DOM.hot-aggrid-clipboard']),
  '__tests__/dom/hot.aggrid.clipboard-selection.menus-and-filtering.test.js': Object.freeze(['DOM.hot-aggrid-clipboard', 'DOM.hot-filter-owner-isolation']),
  '__tests__/dom/hot.aggrid.clipboard-selection.clipboard.test.js': Object.freeze(['DOM.hot-aggrid-clipboard', 'OWN.ag-grid-clipboard-outline-late-paste']),
  '__tests__/dom/hot.aggrid.clipboard-selection.clipboard-undo.test.js': Object.freeze(['DOM.hot-aggrid-clipboard']),
  '__tests__/dom/hot.aggrid.dimensions.test.js': Object.freeze(['DOM.hot-aggrid-dimensions']),
  '__tests__/dom/hot.exclusionPersistence.test.js': Object.freeze(['DOM.hot-exclusions']),
  '__tests__/dom/surface.legendResize.test.js': Object.freeze(['DOM.surface-legend']),
  '__tests__/dom/toolbar.numericWheel.sharedControls.test.js': Object.freeze(['DOM.toolbar-numeric-shared', 'DOM.significance-controls']),
  '__tests__/dom/stats.inference.contract.test.js': Object.freeze(['DOM.stats-formatting']),
  '__tests__/dom/stats.pvalueFormatting.contract.test.js': Object.freeze(['DOM.stats-formatting']),
  '__tests__/dom/stats-table.semantic.test.js': Object.freeze(['DOM.stats-formatting', 'LAYOUT.stats-table-scroll']),
  '__tests__/dom/statsAdvisor.contract.test.js': Object.freeze(['STATS.advisor-contract']),
  '__tests__/statistical-oracle/stats.differential.python.test.js': Object.freeze(['STATS.numerical-oracle']),
  '__tests__/statistical-oracle/stats.component.differential.matrix.test.js': Object.freeze(['STATS.numerical-oracle']),
  '__tests__/statistical-oracle/stats.component.differential.edges.test.js': Object.freeze(['STATS.numerical-oracle', 'STATS.heatmap-correlation-oracle', 'STATS.survival-delayed-entry-logrank']),
  '__tests__/statistical-oracle/stats.matrix.box.test.js': Object.freeze(['STATS.numerical-oracle', 'STATS.box-subject-alignment', 'STATS.box-tied-friedman', 'STATS.box-screened-custom', 'STATS.box-control-sidak', 'STATS.box-decimal-ranks', 'STATS.box-paired-rank-effect', 'STATS.box-friedman-mode', 'STATS.box-nested-repeated', 'STATS.box-crossed-sphericity', 'STATS.box-lognormal-repeated']),
  '__tests__/statistical-oracle/stats.namedMethods.test.js': Object.freeze(['STATS.box-named-comparisons', 'STATS.box-rout-location']),
  '__tests__/statistical-oracle/stats.matrix.line.test.js': Object.freeze(['STATS.numerical-oracle']),
  '__tests__/statistical-oracle/stats.matrix.scatter.test.js': Object.freeze(['STATS.numerical-oracle']),
  '__tests__/statistical-oracle/stats.extended.coverage.test.js': Object.freeze(['STATS.numerical-oracle', 'STATS.cox-lr-convergence', 'STATS.cox-identifiability', 'STATS.cox-scale-invariance']),
  '__tests__/statistical-oracle/stats.survival.cox-delayed-entry.test.js': Object.freeze(['STATS.cox-delayed-entry']),
  '__tests__/integration/stats.ui.presentation.branches.test.js': Object.freeze(['STATS.ui-presentation-branches']),
  '__tests__/integration/stats.ui.persistence.restore.test.js': Object.freeze(['STATS.ui-persistence-restore', 'STATS.box-grouped-owner-reopen', 'STATS.box-legacy-signature-boundaries', 'STATS.box-paired-rank-effect', 'STATS.box-friedman-mode', 'STATS.box-crossed-sphericity']),
  '__tests__/architecture/audit.remaining-issues.contract.test.js': Object.freeze(['ARCH.static-contracts']),
  '__tests__/architecture/axis-major-tick-length.contract.test.js': Object.freeze(['ARCH.static-contracts']),
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
  '__tests__/architecture/moduleCallMap.coverage.test.js': Object.freeze(['ARCH.module-call-map']),
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
  '__tests__/integration/box.layoutReserves.flipAxes.test.js': Object.freeze(['LAYOUT.box-flip-reserve-invariants']),
  '__tests__/integration/box.statsControls.tabIsolation.test.js': Object.freeze(['OWN.live-session-access','OWN.fixture-bootstrap-lifetime','STATS.box-controls-isolation']),
  '__tests__/integration/format-mixing.test.js': Object.freeze(['BOOTSTRAP.format-toolbar-exclusivity']),
  '__tests__/integration/formControls.autosize.test.js': Object.freeze(['BOOTSTRAP.form-controls-autosize']),
  '__tests__/integration/heatmap.stats.test.js': Object.freeze(['STATS.heatmap-presentation']),
  '__tests__/integration/heatmap.stats.transforms.test.js': Object.freeze(['PERSIST.heatmap-data-views-direct']),
  '__tests__/integration/heatmap.stats.correlation.test.js': Object.freeze(['STATS.heatmap-presentation', 'STATS.heatmap-correlation-inference']),
  '__tests__/integration/regression.persistence.test.js': Object.freeze(['PERSIST.regression-summary']),
  '__tests__/integration/scatter.statsDefaults.isolation.test.js': Object.freeze(['OWN.live-session-access','OWN.fixture-bootstrap-lifetime','OWN.scatter-inactive-payload-owner','OWN.scatter-save-file-owner','OWN.scatter-data-toolbar-stale-owner','OWN.scatter-stale-font-owner','STATS.scatter-statistics-isolation']),
  '__tests__/integration/smoke.init.test.js': Object.freeze(['BOOTSTRAP.app-initialization']),
  '__tests__/integration/surface.renderCache.test.js': Object.freeze(['CACHE.surface-render-cache', 'STATS.surface-reporting-direct']),
  '__tests__/integration/survival.stats.test.js': Object.freeze(['STATS.survival-pipeline']),
  'e2e/cross-component/component.small-viewport.layout-stability.spec.js': Object.freeze(['LAYOUT.small-viewport-stability']),
  'e2e/cross-component/grouped-controls.visibility.spec.js': Object.freeze(['LAYOUT.grouped-controls-visibility']),
  'e2e/line/line.forecast-controls.visibility.spec.js': Object.freeze(['LAYOUT.line-forecast-controls-visibility']),
  'e2e/cross-component/graph.live-resize.responsive-stack.spec.js': Object.freeze(['LAYOUT.live-resize-responsive-stack']),
  'e2e/cross-component/graph.reduced-motion.live-resize.spec.js': Object.freeze(['LAYOUT.reduced-motion-live-resize']),
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
  '__tests__/integration/pie.tabIsolation.test.js': Object.freeze(['OWN.pie-tab-host-isolation', 'OWN.pie-advisor-stale-owner', 'OWN.pie-example-stale-owner', 'OWN.pie-inactive-payload-owner', 'PERSIST.pie-data-views-direct', 'PERSIST.pie-notes-direct', 'CACHE.pie-read-only-capture']),
  '__tests__/integration/tabs.grid.dimensions.test.js': Object.freeze(['OWN.workspace-grid-dimensions']),
  '__tests__/integration/tabs.styleControls.tabIsolation.test.js': Object.freeze(['OWN.style-control-tab-isolation']),
  '__tests__/integration/tabs.componentDomBinding.switchIsolation.test.js': Object.freeze(['OWN.component-dom-binding']),
  '__tests__/integration/tabs.configIsolation.allComponents.test.js': Object.freeze(['OWN.config-isolation.all-components', 'OWN.reopen-owner-isolation.all-components', 'PERSIST.explicit-component-mutations']),
  '__tests__/integration/ui.events.box-line.test.js': Object.freeze(['BOOTSTRAP.ui-events-lazy', 'STYLE.box-legend-outline-parity']),
  '__tests__/integration/ui.events.scatter.test.js': Object.freeze(['BOOTSTRAP.ui-events-lazy']),
  '__tests__/integration/ui.events.histogram-and-statistics.test.js': Object.freeze(['BOOTSTRAP.ui-events-lazy']),
  '__tests__/integration/ui.events.venn.test.js': Object.freeze(['BOOTSTRAP.ui-events-lazy']),
  '__tests__/unit/readiness.contract.test.js': Object.freeze(['OWN.readiness-observability']),
  '__tests__/dom/readinessProjection.contract.test.js': Object.freeze(['OWN.readiness-projection']),
  '__tests__/integration/productionBootstrap.loader.test.js': Object.freeze(['BOOTSTRAP.production-derived-loader']),
  '__tests__/architecture/productionBootstrap.manifest.contract.test.js': Object.freeze(['GOVERNANCE.production-bootstrap-manifest']),
  'e2e/workspace/workspace.smoke.spec.js': Object.freeze(['BOOTSTRAP.browser-smoke', 'DOM.welcome-graph-actions', 'A11Y.modal-lifecycle']),
  'e2e/workspace/help-center.spec.js': Object.freeze(['A11Y.help-center', 'A11Y.modal-lifecycle']),
  'e2e/workspace/component-lazy-load.contract.spec.js': Object.freeze(['BOOTSTRAP.browser-component-bundles']),
  'e2e/ownership/component.same-type-tab-switching.isolation.spec.js': Object.freeze(['OWN.same-type-switching.all-components']),
  'e2e/ownership/component.inactive-runtime.isolation.spec.js': Object.freeze(['OWN.inactive-runtime']),
  'e2e/ownership/welcome-example.launch-owner.spec.js': Object.freeze(['OWN.welcome-example-launch-owner']),
  'e2e/ownership/component.owner-order.repeated.spec.js': Object.freeze(['OWN.repeated-owner-order']),
  'e2e/ownership/component.same-type-parameter-isolation.spec.js': Object.freeze(['OWN.same-type-switching.all-components', 'PERSIST.explicit-component-mutations']),
  'e2e/ownership/component.persistence-matrix.spec.js': Object.freeze(['PERSIST.explicit-component-mutations', 'MODE.component-persistence-matrix-direct']),
  'e2e/ownership/component.mixed-table-formats.reopen.spec.js': Object.freeze(['OWN.mixed-table-format-reopen', 'PERSIST.grouped-header-idempotence']),
  'e2e/ownership/component.ui-parameter-persistence.spec.js': Object.freeze(['PERSIST.ui-originated-component-mutations', 'LAYOUT.ui-originated-component-resize']),
  'e2e/cross-component/cross-browser.feature-matrix.spec.js': Object.freeze(['OWN.cross-browser-feature-matrix', 'PERSIST.grid-clipboard']),
  'e2e/aggrid/aggrid.paste.spec.js': Object.freeze(['PERSIST.grid-clipboard']),
  'e2e/aggrid/aggrid.active-tab-paste.spec.js': Object.freeze(['PERSIST.grid-clipboard', 'OWN.ag-grid-clipboard-outline-late-paste', 'OWN.ag-grid-header-menu-paste-owner', 'A11Y.reduced-motion-clipboard-outline']),
  'e2e/aggrid/aggrid.edit-overflow.spec.js': Object.freeze(['OWN.ag-grid-edit-overflow']),
  'e2e/aggrid/aggrid.grouped-header-drag-handles.spec.js': Object.freeze(['LAYOUT.ag-grid-grouped-header-seams']),
  'e2e/aggrid/aggrid.keyboard-navigation.spec.js': Object.freeze(['OWN.ag-grid-keyboard-selection', 'LAYOUT.ag-grid-pinned-row-scroll']),
  'e2e/aggrid/aggrid.selection-outline-scrollbar.spec.js': Object.freeze(['LAYOUT.ag-grid-selection-scrollbar']),
  'e2e/aggrid/aggrid.selection-native-scroll.spec.js': Object.freeze(['LAYOUT.ag-grid-native-selection']),
  'e2e/aggrid/aggrid.undo-redo.reorder.spec.js': Object.freeze(['PERSIST.ag-grid-column-reorder-undo']),
  'e2e/stats/stats.same-component-isolation-restore.contract.spec.js': Object.freeze(['STATS.same-type-archive-restore', 'PERSIST.stats-archive-restore']),
  'e2e/stats/stats.reopen-presence.contract.spec.js': Object.freeze(['STATS.reopen-presence', 'PERSIST.stats-reopen', 'REC.stats-recovery']),
  'e2e/stats/stats.async-owner-completion.contract.spec.js': Object.freeze(['ASYNC.inactive-owner-completion']),
  'e2e/workspace/style-sync.contract.spec.js': Object.freeze(['PERSIST.style-sync-across-tabs', 'A11Y.modal-lifecycle']),
  'e2e/workspace/unsaved-decisions.contract.spec.js': Object.freeze(['OWN.unsaved-close-decisions', 'A11Y.modal-lifecycle', 'REC.archive-recovery-matrix']),
  'e2e/ownership/shared-style-panels.deactivation.spec.js': Object.freeze(['A11Y.shared-style-panel-owner-lifecycle']),
  'e2e/workspace/tab-reorder.contract.spec.js': Object.freeze(['OWN.workspace-tab-reorder']),
  'e2e/diagnostics/vendor.runtime.smoke.spec.js': Object.freeze(['VENDOR.browser-runtime']),
  'e2e/cross-component/replicates.table-format-tab-isolation.spec.js': Object.freeze(['PERSIST.table-format-tab-isolation']),
  'e2e/box/box.significance-restore.spec.js': Object.freeze(['STATS.box-significance-restore']),
  'e2e/line/line.uncertainty-band.reopen-recovery.spec.js': Object.freeze(['PERSIST.line-uncertainty-band-reopen']),
  'e2e/scatter/scatter.inline-edit.preview-layer.spec.js': Object.freeze(['OWN.scatter-inline-edit-preview']),
  'e2e/stats/stats.figure-summary.layout.spec.js': Object.freeze(['STATS.figure-summary-layout']),
  'e2e/heatmap/heatmap.exclusions.reopen-recovery.parity.spec.js': Object.freeze(['REC.heatmap-exclusion-archive-parity']),
  'e2e/heatmap/heatmap.label-font-toolbar.spec.js': Object.freeze(['LAYOUT.heatmap-label-font-resize']),
  'e2e/layout/legend.viewport-invariant.spec.js': Object.freeze(['LAYOUT.legend-viewport-invariant']),
  'e2e/layout/legend.font-toolbar.spec.js': Object.freeze(['OWN.legend-font-toolbar']),
  'e2e/layout/legend.font-reserve-responsive.spec.js': Object.freeze(['LAYOUT.legend-font-reserve-undo']),
  'e2e/box/box.stats-controls-reopen-recovery.spec.js': Object.freeze(['STATS.box-controls-isolation', 'PERSIST.stats-archive-restore', 'REC.stats-recovery']),
  'e2e/layout/font.toolbar.size-no-spin.spec.js': Object.freeze(['DOM.font-controls']),
  'e2e/layout/toolbar.font-visibility.regression.spec.js': Object.freeze(['OWN.font-toolbar-graph-text']),
  'e2e/workspace/data-transform-toolbar.visual.spec.js': Object.freeze(['LAYOUT.data-transform-selection-position']),
  'e2e/pca/pca.example-load.cached-rebind.spec.js': Object.freeze(['CACHE.pca-example-rebind']),
  'e2e/pca/pca.legend-content-envelope.spec.js': Object.freeze(['LAYOUT.pca-legend-envelope']),
  'e2e/line/line.3d-example-table-stability.spec.js': Object.freeze(['OWN.line-3d-table-stability']),
  'e2e/line/line.uncertainty-band.tab-isolation.spec.js': Object.freeze(['OWN.line-uncertainty-band-isolation']),
  'e2e/ownership/shared-svg-drag.deactivation.spec.js': Object.freeze(['OWN.box-svg-drag-deactivation']),
  'e2e/pie/pie.stacked-chart-type.spec.js': Object.freeze(['OWN.pie-chart-type-controls']),
  'e2e/pie/pie.color-scheme.spec.js': Object.freeze(['OWN.pie-color-scheme']),
  'e2e/workspace/color-scheme.application.spec.js': Object.freeze(['OWN.color-scheme-application']),
  'e2e/scatter/scatter.example-load.cached-rebind.spec.js': Object.freeze(['CACHE.scatter-example-rebind']),
  'e2e/recovery/reopen.graph-edit-cache-invalidation.spec.js': Object.freeze(['CACHE.reopened-first-interaction']),
  'e2e/box/box.dark-theme.stats.regression.spec.js': Object.freeze(['STATS.box-dark-theme-regression']),
  'e2e/layout/legend-3d-drag.spec.js': Object.freeze(['OWN.legend-3d-drag']),
  'e2e/recovery/recovery.primary-graph-publication.spec.js': Object.freeze(['REC.primary-graph-publication']),
  'e2e/recovery/workspace.background-preparation.spec.js': Object.freeze(['REC.background-preparation']),
  'e2e/recovery/recovery.single-tab.e2e.spec.js': Object.freeze(['REC.single-tab-recovery-checkpoint']),
  'e2e/recovery/reopen.redraw-on-data-change.spec.js': Object.freeze(['REC.reopen-data-redraw']),
  'e2e/layout/axis.tick-label-optical-clearance.spec.js': Object.freeze(['LAYOUT.axis-tick-label-optical-clearance']),
  'e2e/layout/axis.log-notation.uniform.spec.js': Object.freeze(['LAYOUT.axis-tick-label-optical-clearance']),
  'e2e/layout/axis-major-tick-length.reopen-recovery.spec.js': Object.freeze(['PERSIST.axis-major-tick-length-reopen']),
  'e2e/workspace/dataview-lite-archive.persistence.spec.js': Object.freeze(['PERSIST.dataview-lite-archive']),
  'e2e/workspace/prism.multi-dataset-import.spec.js': Object.freeze(['IMPORT.prism-multi-dataset']),
  'e2e/layout/export.background.spec.js': Object.freeze(['EXPORT.background']),
  'e2e/layout/export.format-dimensions.spec.js': Object.freeze(['EXPORT.format-dimensions', 'EXPORT.multiline-hybrid-title']),
  'e2e/layout/cartesian.proactive-x-label-reserve.spec.js': Object.freeze(['LAYOUT.cartesian-x-label-reserve']),
  'e2e/layout/multiline-title-exact-reserve.spec.js': Object.freeze(['LAYOUT.multiline-title-exact-reserve']),
  'e2e/layout/plot3d-multiline-title-reserve.spec.js': Object.freeze(['LAYOUT.plot3d-multiline-title-exact-reserve']),
  'e2e/layout/cartesian-axis-title-reserve.all-components.spec.js': Object.freeze(['LAYOUT.cartesian-axis-title-reserve-all']),
  'e2e/layout/multiline-title-mode-matrix.spec.js': Object.freeze(['LAYOUT.multiline-title-mode-matrix']),
  'e2e/layout/title-alignment.persistence.spec.js': Object.freeze(['LAYOUT.title-alignment-persistence-all', 'LAYOUT.title-alignment-scopes', 'LAYOUT.title-alignment-undo-order', 'LAYOUT.title-alignment-live-undo', 'LAYOUT.multiline-title-empty-row-editor']),
  'e2e/layout/title-alignment.owner-switch.spec.js': Object.freeze(['LAYOUT.title-alignment-owner-switch']),
  'e2e/layout/title-alignment.lifecycle.spec.js': Object.freeze(['PERSIST.title-alignment-cache-miss', 'PERSIST.title-alignment-duplicate', 'PERSIST.title-alignment-recovery']),
  'e2e/layout/multiline-title.save-during-edit.spec.js': Object.freeze(['PERSIST.multiline-title-draft-save-all']),
  'e2e/venn/venn.upset.multiline-title-exact-reserve.spec.js': Object.freeze(['LAYOUT.upset-multiline-title-exact-reserve']),
  'e2e/diagnostics/box-scatter.render-cache-lifecycle.diagnostic.spec.js': Object.freeze(['DIAGNOSTIC.render-cache-lifecycle']),
  'e2e/workspace/workspace.exercise.spec.js': Object.freeze(['DIAGNOSTIC.component-exercise']),
  'e2e/workspace/welcome.example-persistence.spec.js': Object.freeze(['PERSIST.welcome-example-persistence']),
  'e2e/layout/x-axis-label-angle.layout.spec.js': Object.freeze(['LAYOUT.axis-tick-label-angle']),
  'e2e/layout/x-axis-label-angle.reopen-recovery.spec.js': Object.freeze(['PERSIST.axis-tick-label-angle-reopen']),
  'e2e/layout/x-axis-label-angle.tab-isolation.spec.js': Object.freeze(['OWN.axis-tick-label-angle-isolation']),
  'e2e/box/box.large-resize-live-svg.spec.js': Object.freeze(['LAYOUT.box-reserve-invariants', 'LAYOUT.component-resize-persistence']),
  'e2e/box/box.live-style-redraw.spec.js': Object.freeze(['OWN.style-control-tab-isolation', 'DOM.box-live-style']),
  'e2e/cross-component/color-appearance.persistence.spec.js': Object.freeze(['PERSIST.color-appearance-identity']),
  'e2e/box/box.loading-overlay.stop.spec.js': Object.freeze(['ASYNC.job-cancellation', 'ASYNC.inactive-owner-completion', 'A11Y.reduced-motion-heavy-draw']),
  'e2e/box/box.opacity-style-tab-isolation.spec.js': Object.freeze(['OWN.style-control-tab-isolation']),
  'e2e/box/box.significance-layout.spec.js': Object.freeze(['STATS.box-significance-restore', 'LAYOUT.box-reserve-invariants', 'LAYOUT.box-axis-comparison-clearance']),
  'e2e/box/box.single-values-point-size-resize.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'LAYOUT.box-reserve-invariants']),
  'e2e/box/box.stats-custom-pairs.spec.js': Object.freeze(['STATS.component-reporting', 'STATS.box-controls-isolation']),
  'e2e/stats/stats.panel-surfaces.spec.js': Object.freeze(['LAYOUT.shared-statistics-panel-surfaces']),
  'e2e/stats/stats.analysis-settings-layout.spec.js': Object.freeze(['LAYOUT.stats-analysis-settings', 'LAYOUT.stats-calculate-button']),
  'e2e/hist/hist.statistics-layout.spec.js': Object.freeze(['LAYOUT.hist-statistics-settings']),
  'e2e/stats/stats.settings-stale-panel.spec.js': Object.freeze(['LAYOUT.stats-setting-stale-results']),
  'e2e/hist/hist.advisor.spec.js': Object.freeze(['STATS.hist-advisor', 'STATS.hist-distribution-calibration', 'STATS.hist-ks-result-reclassification', 'STATS.hist-aicc-availability', 'ASYNC.hist-analysis-snapshot', 'OWN.hist-analysis-cancel', 'WORKER.hist-distribution-comparison', 'LAYOUT.stats-table-scroll']),
  'e2e/stats/stats.advisor-disclosure.spec.js': Object.freeze(['STATS.advisor-disclosure', 'STATS.advisor-owner-persistence']),
  'e2e/stats/stats.advisor-contract.spec.js': Object.freeze(['STATS.advisor-contract']),
  'e2e/stats/stats.advisor-reviewed-plans.spec.js': Object.freeze(['STATS.box-advisor-plan-parity','STATS.box-lognormal-repeated','STATS.box-nested-repeated','STATS.advisor-model-design','STATS.hist-advisor','STATS.roc-advisor-class-replication']),
  'e2e/ownership/component.close-tab.disposes-session.spec.js': Object.freeze(['OWN.closed-tab-session-disposal']),
  'e2e/layout/workspace-toolbar.document-responsive.spec.js': Object.freeze(['LAYOUT.workspace-document-responsive']),
  'e2e/box/box.stats-one-sample-controls.spec.js': Object.freeze(['STATS.box-one-sample-control-order']),
  'e2e/box/box.stats-performance.regression.spec.js': Object.freeze(['STATS.box-controls-isolation', 'UNIT.performance-framework']),
  'e2e/box/box.stats-reporting-sections.regression.spec.js': Object.freeze(['STATS.component-reporting', 'STATS.box-significance-restore']),
  'e2e/box/box.stats-test-selection.regression.spec.js': Object.freeze(['STATS.box-named-comparisons','STATS.box-rout-location','STATS.box-controls-isolation', 'STATS.box-aligned-reopen', 'STATS.box-subject-alignment', 'STATS.box-method-reopen', 'STATS.box-paired-rank-effect', 'STATS.box-friedman-mode', 'STATS.box-crossed-sphericity', 'STATS.box-methods-guidance']),
  'e2e/box/box.title-new-tab-isolation.spec.js': Object.freeze(['OWN.same-type-switching.all-components', 'OWN.style-control-tab-isolation']),
  'e2e/layout/canvas-tab-preview.spec.js': Object.freeze(['CACHE.preview-reuse', 'CACHE.tab-switch-reuse']),
  'e2e/ownership/component.duplicate-reuse.payload-fidelity.spec.js': Object.freeze(['PERSIST.component-reopen-fidelity', 'CACHE.tab-switch-reuse']),
  'e2e/ownership/component.resize-exit-reenter.persistence.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'PERSIST.component-reopen-fidelity']),
  'e2e/ownership/component.same-type-dual-preview.spec.js': Object.freeze(['OWN.same-type-switching.all-components', 'CACHE.preview-reuse']),
  'e2e/ownership/component.same-type-second-tab.undo-redo.hot.spec.js': Object.freeze(['OWN.same-type-switching.all-components', 'PERSIST.session-payload-write-through']),
  'e2e/ownership/component.same-type-tab-resize-switch.isolation.spec.js': Object.freeze(['OWN.same-type-switching.all-components', 'LAYOUT.component-resize-persistence']),
  'e2e/ownership/component.second-tab.manual-resize-undo-redo.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'PERSIST.session-payload-write-through']),
  'e2e/layout/dark-theme.resize-text.spec.js': Object.freeze(['OWN.style-control-tab-isolation', 'LAYOUT.component-resize-persistence']),
  'e2e/workspace/data-aware-defaults.spec.js': Object.freeze(['PERSIST.explicit-component-mutations', 'DOM.requested-defaults', 'PERSIST.scatter-data-aware-color-override']),
  'e2e/workspace/document-open.transaction.spec.js': Object.freeze(['ARCHIVE.session-save-policies', 'ARCHIVE.reopened-write-permission', 'ARCHIVE.save-picker-before-preparation', 'REC.archive-restore-transaction', 'A11Y.reduced-motion-document-open', 'A11Y.modal-lifecycle']),
  'e2e/workspace/welcome.graph-drop-save.spec.js': Object.freeze(['ARCHIVE.welcome-drop-save-target']),
  'e2e/workspace/modal-lifecycle.contract.spec.js': Object.freeze(['A11Y.modal-lifecycle', 'LAYOUT.modal-short-viewport']),
  'e2e/layout/export.physical-projection.all-components.spec.js': Object.freeze(['EXPORT.component-artifact', 'EXPORT.format-dimensions']),
  'e2e/layout/graph-axis-resize-invariants.spec.js': Object.freeze(['LAYOUT.axis-tick-label-optical-clearance', 'LAYOUT.component-resize-persistence', 'LAYOUT.cartesian-locked-resize-envelope']),
  'e2e/layout/graph-loading-overlay.empty-tabs.spec.js': Object.freeze(['OWN.readiness-observability', 'ASYNC.job-cancellation']),
  'e2e/layout/graph-resize-undo.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'PERSIST.session-payload-write-through']),
  'e2e/layout/graph-sizing.owner-isolation.spec.js': Object.freeze(['OWN.negative-owner-handoffs', 'OWN.same-type-switching.all-components', 'LAYOUT.component-resize-persistence']),
  'e2e/layout/graph.atomic-publication.spec.js': Object.freeze(['REC.primary-graph-publication', 'OWN.readiness-projection']),
  'e2e/layout/graph.cross-viewport-reopen.spec.js': Object.freeze(['PERSIST.component-reopen-fidelity', 'LAYOUT.component-resize-persistence']),
  'e2e/layout/axis-length.zoom.spec.js': Object.freeze(['LAYOUT.axis-length-zoom', 'LAYOUT.axis-length-zoom-reopen', 'LAYOUT.pca-explicit-axis-model']),
  'e2e/box/box.publication-manual-sizing.spec.js': Object.freeze(['LAYOUT.publication-manual-sizing', 'LAYOUT.publication-axis-strokes']),
  'e2e/cross-component/publication.styles.live-state.spec.js': Object.freeze(['STYLE.publication-live-projection']),
  'e2e/layout/graph.fixed-default-fit.spec.js': Object.freeze(['LAYOUT.fixed-default-fit', 'LAYOUT.view-mode-owner-archive']),
  'e2e/layout/new-tab-layout.reopen.spec.js': Object.freeze(['LAYOUT.new-tab-defaults-after-reopen']),
  'e2e/workspace/config-panel.fieldset-containment.spec.js': Object.freeze(['LAYOUT.legend-label-reserve', 'LAYOUT.component-resize-persistence']),
  'e2e/layout/workspace-content-layout.spec.js': Object.freeze(['LAYOUT.workspace-content-grid', 'LAYOUT.workspace-browser-zoom']),
  'e2e/layout/graph.export-controls-layout.spec.js': Object.freeze(['EXPORT.component-artifact', 'EXPORT.format-dimensions', 'LAYOUT.graph-resize-boundary', 'LAYOUT.graph-frame-theme', 'LAYOUT.graph-controls-header', 'LAYOUT.graph-envelope-containment']),
  'e2e/layout/graph.live-resize.spec.js': Object.freeze(['LAYOUT.component-resize-persistence']),
  'e2e/layout/graph.live-style.spec.js': Object.freeze(['OWN.style-control-tab-isolation', 'DOM.style-undo']),
  'e2e/layout/graph.zoom-redraw.spec.js': Object.freeze(['LAYOUT.zoom-redraw', 'OWN.readiness-projection'])
  ,'e2e/heatmap/heatmap.adjust-filter.responsiveness.spec.js': Object.freeze(['ASYNC.job-cancellation', 'OWN.readiness-observability'])
  ,'e2e/heatmap/heatmap.color-scale-spacing.spec.js': Object.freeze(['OWN.style-control-tab-isolation', 'LAYOUT.legend-label-reserve'])
  ,'e2e/heatmap/heatmap.correlation-tab-restore.spec.js': Object.freeze(['OWN.heatmap-tab-context', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/heatmap/heatmap.data-values.label-scaling.spec.js': Object.freeze(['LAYOUT.legend-label-reserve', 'OWN.style-control-tab-isolation'])
  ,'e2e/heatmap/heatmap.dual-tab.example.spec.js': Object.freeze(['OWN.heatmap-tab-context', 'OWN.heatmap-live-color-scheme-snapshot', 'OWN.same-type-switching.all-components', 'OWN.style-control-tab-isolation', 'STATS.heatmap-inference-guidance'])
  ,'e2e/heatmap/heatmap.dendrogram-settings.tab-isolation.spec.js': Object.freeze(['OWN.heatmap-tab-context', 'OWN.heatmap-dendrogram-settings-owner'])
  ,'e2e/heatmap/heatmap.duplicate-reuse.headers-view-switch.spec.js': Object.freeze(['CACHE.tab-switch-reuse', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/heatmap/heatmap.first-heavy-paste.owner-transaction.spec.js': Object.freeze(['ASYNC.job-cancellation', 'PERSIST.session-payload-write-through'])
  ,'e2e/heatmap/heatmap.graph-scope-font-size.spec.js': Object.freeze(['OWN.style-control-tab-isolation', 'LAYOUT.component-resize-persistence'])
  ,'e2e/heatmap/heatmap.heavy-recovery-authoritative.spec.js': Object.freeze(['CACHE.heavy-canvas-recovery', 'REC.archive-recovery-matrix'])
  ,'e2e/heatmap/heatmap.heavy-small-tab-isolation.spec.js': Object.freeze(['CACHE.heavy-canvas-recovery', 'OWN.same-type-switching.all-components'])
  ,'e2e/heatmap/heatmap.inference-controls.visibility.spec.js': Object.freeze(['LAYOUT.heatmap-inference-controls-visibility', 'STATS.heatmap-correction-reclassification'])
  ,'e2e/heatmap/heatmap.large-data-values.responsiveness.spec.js': Object.freeze(['ASYNC.job-cancellation', 'CACHE.heavy-canvas-recovery'])
  ,'e2e/heatmap/heatmap.legend-height.spec.js': Object.freeze(['LAYOUT.legend-label-reserve'])
  ,'e2e/heatmap/heatmap.live-resize.text-stability.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'OWN.readiness-projection'])
  ,'e2e/heatmap/heatmap.mixed-export.spec.js': Object.freeze(['EXPORT.component-artifact', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/heatmap/heatmap.reopen-recovery.geometry.spec.js': Object.freeze(['PERSIST.component-reopen-fidelity', 'REC.archive-recovery-matrix'])
  ,'e2e/heatmap/heatmap.summary-resize-frame.spec.js': Object.freeze(['STATS.figure-summary-layout', 'LAYOUT.component-resize-persistence'])
  ,'e2e/heatmap/heatmap.tab-preview-fidelity.spec.js': Object.freeze(['CACHE.preview-reuse', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/heatmap/heatmap.title-clearance.spec.js': Object.freeze(['LAYOUT.axis-tick-label-optical-clearance', 'LAYOUT.legend-label-reserve'])
  ,'e2e/heatmap/heatmap.title-undo-viewport.spec.js': Object.freeze(['LAYOUT.heatmap-title-undo-viewport'])
  ,'e2e/heatmap/heatmap.title-drag-speed.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'OWN.toolbar-control-isolation'])
  ,'e2e/heatmap/heatmap.title-inline-edit-background.spec.js': Object.freeze(['OWN.style-control-tab-isolation', 'OWN.toolbar-control-isolation'])
  ,'e2e/heatmap/heatmap.view-switch-lock-ratio.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'PERSIST.component-reopen-fidelity', 'A11Y.shared-resizer-menu-target-size', 'LAYOUT.graph-options-short-viewport'])
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
  ,'e2e/layout/panel-split-edge-reopen.spec.js': Object.freeze(['LAYOUT.full-range-panel-split', 'PERSIST.component-reopen-fidelity', 'LAYOUT.component-resize-persistence'])
  ,'e2e/pca/pca.3d-rotation-restore.spec.js': Object.freeze(['OWN.legend-3d-drag', 'CACHE.reopened-first-interaction', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/pca/pca.default-plot-height.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'LAYOUT.pca-grouped-meta-row-surface'])
  ,'e2e/pca/pca.label-toggle.regression.spec.js': Object.freeze(['A11Y.point-label-position-reopen', 'OWN.style-control-tab-isolation', 'OWN.pca-view-controls'])
  ,'e2e/pca/pca.large-import-transaction.spec.js': Object.freeze(['IMPORT.component-data-import', 'ASYNC.job-cancellation'])
  ,'e2e/pca/pca.metric-geometry.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'LAYOUT.axis-tick-label-optical-clearance', 'LAYOUT.pca-explicit-axis-model'])
  ,'e2e/pca/pca.standard-example.spec.js': Object.freeze(['OWN.pca-view-controls', 'CACHE.pca-example-rebind'])
  ,'e2e/pca/pca.stats-restore.spec.js': Object.freeze(['STATS.same-type-archive-restore', 'PERSIST.stats-reopen', 'STATS.pca-reporting-direct', 'PERSIST.pca-data-views-direct'])
  ,'e2e/pie/pie.dataviews-color-label-resize-isolation.spec.js': Object.freeze(['PERSIST.notes-and-dataviews', 'LAYOUT.component-resize-persistence', 'PERSIST.pie-data-views-direct', 'PERSIST.pie-notes-direct'])
  ,'e2e/pie/pie.legend-resize.diagnostic.spec.js': Object.freeze(['LAYOUT.legend-viewport-invariant', 'LAYOUT.legend-label-reserve'])
  ,'e2e/pie/pie.stacked-live-resize-flicker.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'OWN.readiness-projection'])
  ,'e2e/pie/pie.stacked-rotated-label-reserve.spec.js': Object.freeze(['LAYOUT.legend-label-reserve', 'LAYOUT.component-resize-persistence'])
  ,'e2e/pie/pie.stats-example.spec.js': Object.freeze(['STATS.component-reporting', 'PERSIST.stats-reopen', 'STATS.pie-reporting-direct'])
  ,'e2e/layout/plot3d.viewport-containment.spec.js': Object.freeze(['LAYOUT.plot3d-glyph-containment'])
  ,'e2e/recovery/recovery.canonical-journal.spec.js': Object.freeze(['REC.archive-recovery-matrix', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/recovery/recovery.graph-view-controls.spec.js': Object.freeze(['REC.document-state-recovery', 'OWN.toolbar-control-isolation'])
  ,'e2e/recovery/recovery.no-loop.spec.js': Object.freeze(['REC.single-tab-recovery-checkpoint'])
  ,'e2e/recovery/recovery.single-tab.live-capture.spec.js': Object.freeze(['REC.document-state-recovery', 'PERSIST.session-payload-write-through'])
  ,'e2e/layout/redraw.audit.spec.js': Object.freeze(['OWN.readiness-projection', 'OWN.component-transition-boundary'])
  ,'e2e/layout/release-rendering-smoke.spec.js': Object.freeze(['EXPORT.component-artifact', 'EXPORT.format-dimensions'])
   ,'e2e/cache/render-cache.persistence-contract.spec.js': Object.freeze(['CACHE.reopened-first-interaction', 'CACHE.legacy-box-cache-resave', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/cache/roc-box.render-cache-reopen.spec.js': Object.freeze(['CACHE.reopened-first-interaction', 'REC.stats-recovery'])
  ,'e2e/roc/roc.advisor-compare-tab-isolation.spec.js': Object.freeze(['STATS.component-reporting', 'OWN.same-type-switching.all-components'])
  ,'e2e/roc/roc.classification-ui.spec.js': Object.freeze(['UNIT.roc-classification', 'STATS.component-reporting'])
  ,'e2e/roc/roc.default-axis-geometry.spec.js': Object.freeze(['LAYOUT.axis-tick-label-optical-clearance', 'LAYOUT.component-resize-persistence'])
  ,'e2e/roc/roc.graph-type-reopen.spec.js': Object.freeze(['PERSIST.component-reopen-fidelity', 'STATS.component-reporting'])
  ,'e2e/roc/roc.legend-layout.regression.spec.js': Object.freeze(['LAYOUT.legend-viewport-invariant', 'LAYOUT.legend-label-reserve'])
  ,'e2e/roc/roc.scheduled-autodraw-tab-isolation.spec.js': Object.freeze(['OWN.scheduler-isolation', 'OWN.same-type-switching.all-components'])
  ,'e2e/roc/roc.single-curve-stats-overlay.spec.js': Object.freeze(['STATS.component-reporting', 'STATS.reopen-presence', 'STATS.roc-reporting-direct', 'STATS.roc-single-curve-result-projection'])
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
  ,'e2e/scatter/scatter.labelled-cell-copy.spec.js': Object.freeze(['PERSIST.scatter-label-copy-scope'])
  ,'e2e/scatter/scatter.duplicate-reuse.stats-trendline.spec.js': Object.freeze(['PERSIST.component-reopen-fidelity', 'STATS.component-reporting'])
  ,'e2e/scatter/scatter.empty-plot-notice.spec.js': Object.freeze(['OWN.readiness-observability', 'OWN.readiness-projection'])
  ,'e2e/scatter/scatter.exponential-trend-autoscale.spec.js': Object.freeze(['STATS.component-reporting', 'LAYOUT.component-resize-persistence'])
  ,'e2e/scatter/scatter.formula-evaluation.spec.js': Object.freeze(['OWN.scatter-inline-edit-preview', 'PERSIST.session-payload-write-through', 'A11Y.box-formula-signature-tooltip', 'LAYOUT.ag-grid-formula-reference-outline'])
  ,'e2e/scatter/scatter.global-shape-undo.spec.js': Object.freeze(['OWN.style-control-tab-isolation', 'PERSIST.session-payload-write-through'])
  ,'e2e/scatter/scatter.horizontal-resize-axis.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'LAYOUT.axis-tick-label-optical-clearance'])
  ,'e2e/scatter/scatter.loading-overlay.threshold.spec.js': Object.freeze(['ASYNC.job-cancellation', 'OWN.readiness-observability'])
  ,'e2e/scatter/scatter.manual-view-refresh.spec.js': Object.freeze(['OWN.readiness-projection', 'OWN.component-transition-boundary', 'OWN.scatter-canvas-frame-cancellation', 'A11Y.chart-point-keyboard-navigation'])
  ,'e2e/scatter/scatter.tick-origin.spec.js': Object.freeze(['LAYOUT.scatter-optional-tick-origin'])
  ,'e2e/scatter/scatter.graph-controls.visibility.spec.js': Object.freeze(['LAYOUT.scatter-graph-control-visibility'])
  ,'e2e/scatter/scatter.overlay-controls.stats-gating.spec.js': Object.freeze(['STATS.component-reporting', 'OWN.readiness-projection'])
  ,'e2e/scatter/scatter.panel-resizer.undo-entry-count.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'PERSIST.session-payload-write-through'])
  ,'e2e/scatter/scatter.point-label-drag.spec.js': Object.freeze(['A11Y.point-label-position-reopen', 'PERSIST.component-reopen-fidelity', 'OWN.style-control-tab-isolation'])
  ,'e2e/scatter/scatter.point-color-toolbar.spec.js': Object.freeze(['STYLE.scatter-point-toolbar-color'])
  ,'e2e/scatter/scatter.pvalue-formatting.spec.js': Object.freeze(['STATS.component-reporting'])
  ,'e2e/scatter/scatter.reopen.trendline-persists.spec.js': Object.freeze(['PERSIST.regression-summary', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/scatter/scatter.second-tab.resize-undo-routing.spec.js': Object.freeze(['OWN.same-type-switching.all-components', 'LAYOUT.component-resize-persistence'])
  ,'e2e/scatter/scatter.second-tab.undo-debug.spec.js': Object.freeze(['OWN.same-type-switching.all-components', 'PERSIST.session-payload-write-through'])
  ,'e2e/scatter/scatter.stats-trendline-resize.live-update.spec.js': Object.freeze(['STATS.component-reporting', 'LAYOUT.component-resize-persistence'])
  ,'e2e/scatter/scatter.dense-live-resize.spec.js': Object.freeze(['LAYOUT.scatter-dense-live-resize'])
  ,'e2e/scatter/scatter.tab-grid-leak.repro.spec.js': Object.freeze(['OWN.same-type-switching.all-components', 'PERSIST.grid-clipboard'])
  ,'e2e/stats/stats-annotation.bounds-and-font.spec.js': Object.freeze(['STATS.figure-summary-layout', 'LAYOUT.legend-label-reserve'])
  ,'e2e/stats/stats.archive-reopen-tab-switch.persistence.spec.js': Object.freeze(['PERSIST.stats-archive-restore', 'OWN.same-type-switching.all-components'])
  ,'e2e/stats/stats.figure-summary.font-toolbar.spec.js': Object.freeze(['STATS.figure-summary-layout', 'OWN.toolbar-control-isolation'])
  ,'e2e/stats/stats.figure-summary.live-resize.spec.js': Object.freeze(['STATS.figure-summary-layout', 'LAYOUT.component-resize-persistence'])
  ,'e2e/stats/stats.figure-summary.reopen-recovery.spec.js': Object.freeze(['STATS.figure-summary-layout', 'REC.archive-recovery-matrix', 'STATS.venn-plot-stats'])
  ,'e2e/stats/stats.figure-summary.tab-isolation.spec.js': Object.freeze(['STATS.figure-summary-layout', 'OWN.same-type-switching.all-components', 'STATS.venn-plot-stats'])
  ,'e2e/stats/stats.inference.tab-isolation.spec.js': Object.freeze(['STATS.component-reporting', 'OWN.same-type-switching.all-components'])
  ,'e2e/stats/stats.owner-panel.additional-components.contract.spec.js': Object.freeze(['STATS.component-reporting', 'OWN.component-transition-boundary'])
  ,'e2e/stats/stats.restore-roundtrip.spec.js': Object.freeze(['PERSIST.stats-reopen', 'REC.archive-recovery-matrix'])
  ,'e2e/layout/structural-redraw.loading-overlay.spec.js': Object.freeze(['ASYNC.job-cancellation', 'OWN.readiness-observability'])
  ,'e2e/surface/surface.legend-fixed-height.spec.js': Object.freeze(['LAYOUT.legend-label-reserve', 'OWN.surface-tab-context'])
  ,'e2e/surface/surface.live-resize-stability.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'OWN.surface-tab-context'])
  ,'e2e/surface/surface.recovery-rotation.spec.js': Object.freeze(['CACHE.surface-render-cache', 'REC.archive-recovery-matrix', 'OWN.legend-3d-drag', 'OWN.surface-3d-direct'])
  ,'e2e/surface/surface.rotation-size-stability.spec.js': Object.freeze(['CACHE.surface-render-cache', 'LAYOUT.component-resize-persistence'])
  ,'e2e/surface/surface.settings-dataviews-manual-overlay-tab-isolation.spec.js': Object.freeze(['PERSIST.notes-and-dataviews', 'OWN.same-type-switching.all-components', 'PERSIST.surface-data-views-direct', 'PERSIST.surface-notes-direct'])
  ,'e2e/surface/surface.svgbox-right-margin.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'LAYOUT.legend-label-reserve', 'LAYOUT.surface-envelope-zoom'])
  ,'e2e/cross-component/survival-roc-hist.dataviews-notes-isolation.spec.js': Object.freeze(['PERSIST.notes-and-dataviews', 'OWN.same-type-switching.all-components', 'PERSIST.component-dataviews-direct', 'PERSIST.component-notes-direct'])
  ,'e2e/survival/survival.covariate-reopen-tab-isolation.spec.js': Object.freeze(['PERSIST.component-reopen-fidelity', 'STATS.component-reporting'])
  ,'e2e/survival/survival.notes-position.spec.js': Object.freeze(['PERSIST.notes-and-dataviews', 'LAYOUT.component-resize-persistence', 'PERSIST.survival-notes-direct'])
  ,'e2e/survival/survival.risk-table-layout.spec.js': Object.freeze(['STATS.component-reporting', 'LAYOUT.component-resize-persistence', 'LAYOUT.survival-small-frame'])
  ,'e2e/survival/survival.same-type-reopen-isolation.spec.js': Object.freeze(['OWN.same-type-switching.all-components', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/survival/survival.style-report-deferred-isolation.spec.js': Object.freeze(['OWN.style-control-tab-isolation', 'STATS.component-reporting'])
  ,'e2e/cache/tab-preview-components.spec.js': Object.freeze(['CACHE.preview-reuse', 'OWN.same-type-switching.all-components'])
  ,'e2e/layout/title-empty-edit.restore.spec.js': Object.freeze(['PERSIST.component-reopen-fidelity', 'OWN.toolbar-control-isolation'])
  ,'e2e/layout/title-visibility.all-components.spec.js': Object.freeze(['OWN.style-control-tab-isolation', 'LAYOUT.legend-label-reserve', 'A11Y.shared-resizer-menu-target-size'])
  ,'e2e/layout/toolbar.color-picker-ownership.spec.js': Object.freeze(['DOM.color-picker-toolbar-ownership', 'OWN.toolbar-control-isolation', 'A11Y.color-picker-open-state', 'A11Y.color-picker-owner-lifecycle', 'LAYOUT.light-only-color-preference'])
  ,'e2e/layout/toolbar.symbol-picker-owner-coverage.spec.js': Object.freeze(['A11Y.color-picker-owner-lifecycle'])
    ,'e2e/layout/toolbar.legend-color-picker-owner-coverage.spec.js': Object.freeze(['A11Y.color-picker-owner-lifecycle'])
  ,'e2e/layout/toolbar.general-vs-data.regression.spec.js': Object.freeze(['OWN.toolbar-control-isolation', 'OWN.data-toolbar-activation'])
  ,'e2e/layout/toolbar.numeric-wheel-gesture.spec.js': Object.freeze(['OWN.toolbar-control-isolation', 'PERSIST.session-payload-write-through'])
  ,'e2e/layout/toolbar.overflow.spec.js': Object.freeze(['DOM.toolbar-overflow', 'OWN.toolbar-control-isolation', 'LAYOUT.toolbar-menu-short-viewport'])
  ,'e2e/layout/toolbar.panel-transitions.spec.js': Object.freeze(['LAYOUT.toolbar-panel-transitions', 'OWN.toolbar-panel-transitions', 'OWN.reference-line-cache-rehydration', 'LAYOUT.toolbar-font-axis-panels', 'LAYOUT.toolbar-heatmap-companion-panels'])
  ,'e2e/venn/venn.exclusions-welcome.spec.js': Object.freeze(['OWN.venn-runtime-isolation', 'PERSIST.welcome-example-persistence'])
  ,'e2e/venn/venn.go-string.async-tab-isolation.spec.js': Object.freeze(['OWN.venn-runtime-isolation', 'ASYNC.job-cancellation', 'ASYNC.venn-analysis-owner', 'LAYOUT.venn-conditional-controls'])
  ,'e2e/venn/venn.notes.persistence.spec.js': Object.freeze(['PERSIST.notes-and-dataviews', 'OWN.same-type-switching.all-components', 'PERSIST.venn-notes-direct'])
  ,'e2e/venn/venn.label-layout.spec.js': Object.freeze(['DOM.venn-label-layout', 'LAYOUT.legend-label-reserve'])
   ,'e2e/venn/venn.numeric-mode.controls.spec.js': Object.freeze(['DOM.venn-numeric-controls', 'OWN.venn-runtime-isolation', 'PERSIST.component-reopen-fidelity'])
  ,'e2e/venn/venn.list-cache-region-tab-isolation.spec.js': Object.freeze(['OWN.venn-runtime-isolation', 'CACHE.tab-switch-reuse'])
  ,'e2e/venn/venn.paste-scroll.spec.js': Object.freeze(['PERSIST.grid-clipboard', 'OWN.venn-runtime-isolation'])
  ,'e2e/venn/venn.restore-recovery.spec.js': Object.freeze(['PERSIST.component-reopen-fidelity', 'REC.archive-recovery-matrix'])
  ,'e2e/venn/venn.table-column-persistence.spec.js': Object.freeze(['PERSIST.session-payload-write-through', 'OWN.venn-runtime-isolation'])
  ,'e2e/venn/venn.upset-numeric-species-reopen-isolation.spec.js': Object.freeze(['OWN.venn-upset-controls', 'PERSIST.component-reopen-fidelity', 'STATS.venn-universe-guidance'])
  ,'e2e/venn/venn.upset.controls-layout.spec.js': Object.freeze(['OWN.venn-upset-controls', 'LAYOUT.component-resize-persistence'])
  ,'e2e/venn/venn.upset.live-resize.text-stability.spec.js': Object.freeze(['LAYOUT.component-resize-persistence', 'LAYOUT.zoom-redraw', 'OWN.readiness-projection'])
  ,'e2e/workspace/welcome.first-frame.spec.js': Object.freeze(['DOM.welcome-startup', 'OWN.readiness-observability'])
  ,'e2e/accessibility/workspace.accessibility.spec.js': Object.freeze(['A11Y.accessible-workspace-controls', 'A11Y.pointer-focus-modality', 'A11Y.aggrid-filter-condition-fields', 'A11Y.customizable-select-behavior', 'A11Y.coarse-pointer-grid-targets', 'LAYOUT.ag-grid-fixed-compact-layout', 'A11Y.forced-colors-state-cues', 'A11Y.text-spacing-reflow', 'A11Y.toolbar-menu-keyboard', 'LAYOUT.welcome-search-short-viewport'])
  ,'e2e/accessibility/shared-css-utilities.computed-style.spec.js': Object.freeze(['A11Y.shared-css-hidden-utilities'])
  ,'e2e/accessibility/reduced-motion.scroll.spec.js': Object.freeze(['A11Y.reduced-motion-scroll-controls'])
  ,'e2e/accessibility/workspace.browser-zoom.spec.js': Object.freeze(['A11Y.actual-browser-zoom'])
  ,'e2e/accessibility/workspace.enlarged-text.spec.js': Object.freeze(['A11Y.enlarged-ui-text', 'LAYOUT.enlarged-ui-text-reflow'])
  ,'e2e/accessibility/analysis-result-tabs.keyboard.spec.js': Object.freeze(['A11Y.analysis-result-tabs-keyboard', 'A11Y.analysis-result-tabs-owner-isolation'])
  ,'e2e/accessibility/dropdown-cursor.spec.js': Object.freeze(['A11Y.dropdown-cursor'])
  ,'e2e/accessibility/overlay-checkbox-row.spec.js': Object.freeze(['A11Y.overlay-checkbox-row', 'DIRTY.overlay-menu-disclosure'])
   ,'e2e/accessibility/shared-menus.keyboard.spec.js': Object.freeze(['A11Y.application-menu-keyboard', 'A11Y.data-view-menu-owner-lifecycle', 'A11Y.ag-grid-context-menu-keyboard', 'A11Y.ag-grid-context-menu-owner-lifecycle', 'A11Y.ag-grid-popup-archive-reopen', 'A11Y.ag-grid-filter-popup-state', 'A11Y.ag-grid-filter-popup-targets', 'A11Y.data-view-switcher', 'A11Y.font-combo-keyboard', 'A11Y.font-combo-owner-lifecycle', 'A11Y.graph-options-owner-lifecycle', 'A11Y.workspace-toolbar-menu-owner-lifecycle', 'A11Y.venn-analysis-option-disclosures', 'LAYOUT.workspace-tab-menu-short-viewport', 'LAYOUT.font-combo-short-viewport'])
   ,'e2e/layout/shared-ui-tokens.computed-style.spec.js': Object.freeze(['LAYOUT.shared-ui-token-values', 'LAYOUT.resizer-axes-menu-host-parity'])
  ,'e2e/accessibility/color-scheme-picker.keyboard.spec.js': Object.freeze(['A11Y.color-scheme-listbox-keyboard', 'A11Y.color-scheme-owner-lifecycle', 'LAYOUT.color-scheme-short-viewport', 'LAYOUT.color-scheme-selector'])
  ,'e2e/accessibility/axis-number-format.keyboard.spec.js': Object.freeze(['A11Y.axis-number-format-listbox', 'A11Y.axis-number-format-owner-lifecycle', 'LAYOUT.axis-number-format-short-viewport'])
  ,'e2e/accessibility/axis-config-dialogs.keyboard.spec.js': Object.freeze(['A11Y.axis-config-popup-dialogs', 'LAYOUT.axis-config-popup-short-viewport', 'A11Y.axis-config-popup-owner-lifecycle'])
  ,'e2e/accessibility/graph-resize.keyboard.spec.js': Object.freeze(['A11Y.graph-size-controls'])
  ,'e2e/accessibility/shared-resize-label-legend.keyboard.spec.js': Object.freeze(['A11Y.shared-panel-svg-keyboard', 'LAYOUT.component-resize-persistence'])
  ,'e2e/accessibility/plot3d-rotation.keyboard.spec.js': Object.freeze(['A11Y.3d-rotation-keyboard'])
  ,'e2e/accessibility/graph-control-font-size.spec.js': Object.freeze(['LAYOUT.graph-control-font-size'])
  ,'e2e/accessibility/chart-point-context.keyboard.spec.js': Object.freeze(['A11Y.point-context-menu-keyboard', 'A11Y.chart-point-keyboard-navigation', 'A11Y.shared-grid-keyboard-entry', 'LAYOUT.point-context-menu-short-viewport'])
  ,'e2e/accessibility/format-toolbar.components.spec.js': Object.freeze(['LAYOUT.format-tabs-phone-hit-targets'])
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
