# Graphitix semantic render-impact refactor roadmap

Status: implementation complete; shared foundation and all eleven component semantic waves are verified. The confirmed Heatmap activation defect and separately tracked shared render-cache capture migration remain outside this completed refactor; Box timing results remain diagnostic rather than a product contract.
Audit date: 2026-09-16
Scope: shared draw scheduling, semantic render-impact classification, owner-scoped analysis reuse, and the component regression gates that prove the optimization is safe.

This roadmap addresses the open P2 item in `issues.txt`. It is deliberately separate from the testing-suite roadmap: the testing roadmap governs how tests run, while this roadmap governs how production draw requests describe their work and how components reuse unchanged analysis safely.

### Progress log

- 2026-09-16: verified the shared taxonomy/sanitizer/coalescer contract and preserved the conservative unknown fallback.
- 2026-09-16: confirmed ROC and Heatmap are the current semantic reuse consumers; both are retained as audited references, not copied mechanically into sibling components.
- 2026-09-16: classified Histogram's known scheduling boundaries for paint, layout, analysis, and structural work. Public/legacy callers still receive the conservative fallback.
- 2026-09-16: added Histogram owner-scheduler coverage for explicit presentation metadata; targeted scheduler/reporting tests passed: 2 suites, 22 tests before the added assertion, then 2 tests in the focused scheduler rerun.
- 2026-09-16: broader Histogram UI tests passed: 4 suites, 26 tests; Chromium Histogram isolation/reopen/legend tests passed: 5 tests.
- 2026-09-16: Histogram wave complete for explicit classification and the existing owner-scoped diagnostics cache. No speculative broader cache was added because its eligibility evidence is not yet established.
- 2026-09-16: PCA migration completed for the verified owner-scoped analysis cache. Data signatures now include canonical matrix values, labels, grouped headers, table format, and effective settings; cache reads and writes reject a different owner tab.
- 2026-09-16: PCA scheduling now carries explicit paint/layout/analysis/structural impacts, coalesces the strongest impact, and derives cache eligibility from semantic impact rather than the legacy `viewOnly` flag. A view-mode transition is correctly classified as layout because cached 2D/3D coordinates are already available; data-view, grouping-schema, example-load, and import transitions remain structural.
- 2026-09-16: PCA verification passed: targeted Jest view/cache/style coverage (2 suites, 33 tests), focused Chromium PCA restore/rotation/cache-rebind coverage (5 tests), and `node --check`. The first run caught and fixed two real regressions: a view-mode misclassification and rotation compatibility before scheduling sanitation.
- 2026-09-16: Scatter migration completed at its authoritative scheduler boundaries. Point/style and overlay changes are explicit `paint`, font/axis/legend/label/resize changes are explicit `layout`, regression/statistics changes are explicit `analysis`, and data-view, graph-type, import, example, and 2D/3D changes are explicit `structural`.
- 2026-09-16: Scatter's existing owner-scoped collection cache now has a canonical signature over data revision, graph type, table format, and log-plus-one transforms. Analysis redraws may reuse that collection only when the owner runtime is clean and non-structural; data edits and transforms advance the revision before drawing. No generic worker/render-model cache was added.
- 2026-09-16: Scatter verification passed: focused Jest coverage (7 suites, 62 tests), primary Chromium refresh/isolation/reopen coverage (9 tests), additional import/3D/inline-edit coverage (6 tests), and `node --check`. The first browser run caught and fixed one real regression: trendline analysis must reuse valid collected points rather than recollecting them.
- 2026-09-16: Line's authoritative scheduler boundaries now carry explicit paint/layout/analysis/structural impacts. Legacy `viewOnly` is derived only after sanitation; overlay gating, owner scheduling, draw instrumentation, and settled lifecycle metadata use the semantic impact.
- 2026-09-16: Line audit confirmed that 2D/3D series construction and visual regression preparation are rebuilt inside each draw, while `statsState` and `modeCache` are persistence/projection state rather than reusable render models. No safe owner/signature cache was present, so no speculative Line cache was introduced.
- 2026-09-16: Line verification passed: focused Jest coverage (4 suites, 39 tests), Chromium 2D/3D/uncertainty/table/resize/reopen/isolation coverage (11 tests), and `node --check`. The new rendered-impact test covers example load, style, layout, and data-edit boundaries.
- 2026-09-16: Box migration completed at the authoritative scheduler boundary. Trace/point/summary styling and grid/frame/color changes are `paint`; font, axis, legend, resize, and significance placement changes are `layout`; statistical settings, formulas, whisker/error/point calculations, transforms, and data-dependent controls are `analysis`; table/schema, grouping, graph type, axis flip, import/example, data-view, and category-order changes are `structural`.
- 2026-09-16: Box statistics signatures now include the full per-trace value digest, custom comparison definitions, and grouped configuration in addition to existing settings and moments. Equal-moment datasets are therefore prevented from reusing stale statistical results. The swarm worker receives the originating owner tab explicitly.
- 2026-09-16: Box verification passed: focused Jest coverage (7 suites, 69 tests), `node --check` for the component and new contract test, and focused Chromium behavior coverage (19 tests) for worker statistics, significance, live styles, resize, reopen, and same-type isolation. The broader 25-test Chromium set had 23 passes and 2 failures only in existing 2-second activation timing assertions; those runs still passed the no-recomputation, settled-draw, state-persistence, and draw-duration assertions. No Firefox claim is made.
- 2026-09-16: Heatmap migration completed at its authoritative scheduling boundaries. Palette and non-metric dendrogram styling are `paint`; font, cell size, decimals, value-scale, legend-height, title, resize, and statistics-display formatting are `layout`; significance correction, filtering, clustering, linkage, and normalization remain `analysis`; data-view changes, imports, transforms that replace the correlation source, and payload hydration are `structural`.
- 2026-09-16: Heatmap's correction contract caught a real stale-result defect before the production fix: changing correlation multiple-testing correction from Benjamini-Hochberg to Holm updated the method label while retaining the old adjusted p-values from the cached render path. The correction control now schedules `analysis`, while presentation-only reuse is selected from explicit impact metadata rather than raw `viewOnly` flags.
- 2026-09-16: Heatmap queue sanitation and coalescing preserve the strongest semantic impact, retain owner metadata, and keep compatibility `viewOnly` derived from that impact. No broader analysis cache was introduced; the existing owner-scoped render-model reuse remains limited to matching values/correlation views and projection-safe presentation work.
- 2026-09-16: Heatmap focused verification passed: 3 Jest suites and 53 tests (`renderImpact`, statistics, dendrogram rendering), plus 7 serial Chromium tests covering filter responsiveness, correlation geometry/restore, scale labels, dual-tab example loading, and fixed legend geometry. `node --check` and `git diff --check` passed; no Firefox claim is made.
- 2026-09-16: The production-derived Heatmap tab-context check still fails one of five cases because custom dendrogram mode/thickness/color return to defaults after a tab round-trip. Reverting the semantic optimization experiments did not change that result, confirming a separate activation/runtime ownership defect. It is recorded as a P1 issue in `issues.txt`; the assertion remains unchanged. The next gate is Surface, with Heatmap activation repair handled separately.
- 2026-09-16: Surface migration completed at its authoritative scheduling boundary. Color ramp, grid, frame, and point presentation changes are `paint`; font, axis, legend, title, label, resize, and rotation changes are `layout`; data-view, axis mapping, interpolation, import, example, and payload transitions are `structural`; data-dependent redraws remain `analysis`.
- 2026-09-16: Surface audit found only the existing owner-scoped Plot3D rotation model and direct interaction renderer as a safe reuse path. Normal draws rebuild table-derived geometry, axes, scales, layers, and hit surfaces; no complete owner/signature boundary justified a broader cache. The refactor preserves the narrow rotation reuse path and adds no speculative analysis cache.
- 2026-09-16: Surface verification passed: focused Jest coverage (5 suites, 37 tests), eight serial Chromium tests covering legend geometry, resize, rotation, cache restoration, same-type ownership, and SVG margins, plus `node --check`. No Firefox claim is made.
- 2026-09-16: Survival migration completed at its authoritative scheduling boundary. Curve/grid/frame styling is `paint`; labels, fonts, axes, risk-table, plot-stat, legend, time-range, and resize changes are `layout`; event/censor data, Cox/hazard scope, covariates, pairwise correction, inference, table edits, and advisor-applied analysis settings are `analysis`; data-view, import, example, payload, and initialization transitions are `structural`.
- 2026-09-16: Survival audit confirmed that every draw reconstructs Kaplan–Meier, log-rank, pairwise, hazard-ratio, and Cox outputs from current owner state. No stable reusable model signature was present, so no cache was added; owner tokens, session routing, and full rebuild behavior remain the correctness boundary.
- 2026-09-16: Survival verification passed: focused Jest coverage (4 suites, 62 tests), fourteen serial Chromium tests covering deferred style/reporting, same-type reopen/isolation, risk-table layout, notes, covariates, and shared DataViews ownership, plus `node --check`. No Firefox claim is made.
- 2026-09-16: Venn migration completed at its specialized scheduling boundary. Palette, non-metric line styling, and UpSet presentation controls are `paint`; titles, labels, font/border sizing, axis presentation, counts, and resize are `layout`; list/numeric edits, case sensitivity, and table edits are `analysis`; mode, sample, payload, activation, and other topology/data replacements are `structural`. Compatibility `viewOnly` is derived only after sanitation, and owner-scoped GO/STRING/species async paths are unchanged.
- 2026-09-16: Venn audit found no complete reusable topology/report signature. Venn and UpSet continue to rebuild their specialized set geometry and analysis safely; the existing narrow UpSet resize preview remains the only presentation reuse path. No Cartesian cache or speculative topology cache was introduced.
- 2026-09-16: Venn verification passed: the new contract plus focused UpSet/unit checks passed 17 tests, the broader Venn tab-opening suite passed 21 tests, the remaining focused Venn Jest checks passed 16 tests after updating one owner-metadata expectation, and the serial Chromium isolation/persistence/layout/async set passed 36 tests. `node --check` and `git diff --check` passed; no Firefox claim is made.
- 2026-09-16: Pie migration completed at its specialized scheduling boundary. Slice/frame/color presentation is `paint`; labels, fonts, axes, legend, summary placement, border width, start angle, and resize are `layout`; table edits and statistics/data-dependent changes are `analysis`; chart type, import/example data, DataView replacement, payload hydration, and initialization are `structural`. Compatibility `viewOnly` is derived only after sanitation.
- 2026-09-16: Pie audit found no complete reusable radial analysis/topology signature. Existing owner-scoped radial resize and presentation paths remain intact, while proportions, expected counts, statistics, category topology, and mode changes retain the full rebuild path. No speculative radial cache was introduced.
- 2026-09-16: Pie verification passed: the render-impact contract and focused Jest suites passed 63 tests across five suites; the serial Chromium statistics, DataView, styling, label, resize, stacked-chart, and same-type persistence/isolation set passed 27 tests; `test:suggest`, `node --check`, and `git diff --check` passed.
- 2026-09-16: Final shared gates passed after adding reviewed scenario mappings for all render-impact contracts and the existing logarithmic-axis notation test: 14 shared lifecycle/ownership/cache suites passed 245 tests; testing inventory verified 551 rows; component-contract and inventory checks passed. All eleven components now have explicit audited boundaries, with conservative fallback retained for genuinely unknown callers.

## 1. Confirmed problem

The problem is real, but it is an architecture/performance problem rather than evidence of current cross-tab corruption.

Current source evidence:

- `Shared.componentLifecycle` already defines `paint`, `layout`, `analysis`, and `structural` impacts.
- Sanitization conservatively falls back to `analysis` when a request does not declare an impact. This fallback must remain until each caller is audited.
- The shared frame coalescer preserves the strongest impact, so a later view request cannot downgrade an earlier analysis or structural request.
- ROC is the original pilot: it declares a layout impact for legend changes and uses `isPresentationOnlyDraw()` to reuse an owner-scoped analysis model when its signature still matches. Heatmap now has an explicit-impact boundary and retains its existing owner-scoped render-model reuse, but deliberately adds no broader analysis cache.
- All eleven components now have an explicit-impact consumer at their authoritative scheduling boundary. ROC, Histogram, PCA, Scatter, Box, and Heatmap retain only the owner/signature reuse paths that were proven safe; Line, Surface, Survival, Venn, and Pie retain correct full-rebuild paths where no complete owner/signature reuse boundary was proven.
- The migration establishes a safer performance architecture, but it does not claim that every paint/layout request is faster: source audit and focused behavior coverage prove classification and correctness, while actual performance gains still require representative profiling.

The defect must not be “fixed” by changing the global fallback from `analysis` to `paint` or `layout`. That would make unclassified requests fast by risking stale data, stale scales, stale statistics, or incorrect geometry.

### Current implementation baseline

This is a migration roadmap, not a proposal to recreate work that already exists:

| Area | Verified current state | Treatment in this roadmap |
| --- | --- | --- |
| Shared lifecycle | The taxonomy, conservative sanitation, strongest-impact merge, owner metadata, and tab-scoped coalescing already exist. | Preserve the contract; add only generic assertions or helpers that are justified by all callers. |
| ROC | The pilot has explicit impact merging, a layout classification for legend changes, and an owner/signature-checked reusable analysis path. | Characterize and harden it before using it as a reference. It is not proof that every component needs the same cache design. |
| Histogram | Owner-scoped diagnostics caching and unified goodness-of-fit publication paths already exist, including direct-call coverage. | Retain that work; add explicit semantic classification and verify whether broader reuse is warranted. |
| Heatmap | Explicit-impact sanitation, strongest-impact merging, and matching-view owner-scoped render-model reuse are now verified; correction changes stay on the analysis path. | Preserve the narrow reuse boundary. Repair the separately tracked activation/runtime ownership defect before any broader cache work. |
| Venn and Pie | Both completed 2026-09-16 with explicit specialized classification and no broader cache. | Preserve the no-cache decisions unless complete topology/report signatures and measured benefit justify a later change. |
| Validation | Coverage certification and prior ownership/statistics fixes are separate completed work. | Use their existing gates as evidence; do not conflate coverage certification with this performance refactor. |

The baseline source inventory must be refreshed before each wave because scheduler names and call sites can move. The inventory is evidence for scope, not a substitute for rendered behavior tests.

### Component migration inventory

This is the starting inventory from the 2026-09-16 source audit. It intentionally records the first investigation target, not a pre-approved implementation design.

| Component | Current boundary | First audit target | Initial reuse posture |
| --- | --- | --- | --- |
| ROC | Component sanitizer, queue merge, and analysis publication already carry the pilot path. | Confirm all model inputs, legend/layout behavior, worker/async ownership, and interaction rebinding. | Pilot exists; harden before reuse elsewhere. |
| Histogram | Component sanitizer and multiple analysis/report draw paths. | Confirm every fit/diagnostic entry point uses one owner-scoped signature and classify controls at scheduling boundaries. | Diagnostics cache exists; broader model reuse requires evidence. |
| Scatter | Component sanitizer plus session/runtime draw paths. | Complete: point/label/axis paint and layout are separated from regression, density, worker, and 2D/3D model changes. | Selective owner-scoped collection reuse is verified; worker/render-model reuse remains explicitly deferred. |
| PCA | Shared sanitizer at multiple draw entry points; the owner-scoped analysis cache now has explicit semantic scheduling and signature checks. | Continue audit only for omissions or new model inputs; preserve separate method, metadata, dimensions, worker, and 2D/3D rules. | Presentation reuse is verified for the current cache; no generic embedding cache is added without new evidence. |
| Line | Shared sanitizer and grouped/3D draw paths. | Separate series paint/layout from regression, intervals, forecasts, grouping, and axis-model changes. | Evaluate expensive model paths independently. |
| Box | Explicit-impact scheduler, owner-scoped cached traces, statistics context, significance/report paths, and swarm worker. | Complete: trace/point/summary presentation is separated from statistics, formulas, grouping, significance, swarm, and axis-role changes; verify any future cache expansion against full-value signatures. | Presentation redraws reuse owner-cached trace input; statistical/model reuse remains limited to the existing owner/signature path. |
| Heatmap | Completed 2026-09-16: explicit-impact sanitation, strongest-impact queue merge, owner-scoped presentation reuse, and correction invalidation at the control boundary. | Follow-up only: repair the separately tracked production activation/runtime ownership defect that loses custom dendrogram settings after a tab round-trip. | Existing render-model reuse remains limited to matching value/correlation views; no speculative broader analysis cache. |
| Surface | Completed 2026-09-16: explicit-impact sanitation and Plot3D scheduling boundaries are verified. | Follow-up only: preserve owner-scoped rotation reuse and re-evaluate broader model reuse only with a complete signature and measured benefit. | No broader cache justified; normal full rebuild remains the safe path. |
| Survival | Completed 2026-09-16: explicit-impact sanitation and async statistical/report scheduling boundaries are verified. | Follow-up only: preserve owner tokens and full statistical rebuild; re-evaluate reuse only with a complete model/report signature and measured benefit. | No cache justified; full rebuild remains the safe path. |
| Venn | Completed 2026-09-16: specialized sanitation, explicit impact propagation, owner-scoped scheduling, and async ownership are verified. | Follow-up only: preserve the full specialized topology rebuild and narrow UpSet resize reuse; add a cache only with a complete topology/report signature and measured benefit. | No broader cache justified; Venn/UpSet rebuild safely. |
| Pie | Completed 2026-09-16: explicit sanitation and radial plot/report scheduling boundaries are verified. | Follow-up only: preserve radial resize/reopen behavior and re-evaluate reuse only with a complete radial signature. | No broader cache justified; proportions, statistics, topology, and mode changes rebuild safely. |

For each row, the first deliverable is a call-site inventory and a verified classification table. “Likely eligible” is not a commitment to add a cache.

## 2. Desired end state

Every audited and migrated component draw request has:

1. An explicit, plain-data `renderImpact` selected at the authoritative component scheduling boundary.
2. Owner metadata: component key, tab id, and generation where the component uses generations.
3. A reason for diagnostics, but never a reason-string heuristic as the source of truth.
4. A documented statement of which analysis, scale, layout, paint, and interaction layers are affected.
5. A component-specific analysis/model signature when the reuse eligibility gate approves presentation-only reuse; otherwise, an explicit documented rebuild decision.

The scheduler and coalescer remain shared. Component-specific code owns semantic classification and signatures because only the component knows whether a control changes its statistical model, scale, geometry, or only visual attributes.

The final behavior must satisfy this rule:

```text
canonical owner state change
        -> exact invalidation / signature update
        -> explicit render-impact request
        -> owner-scoped coalescing
        -> reuse only when the owner and signature match
        -> projection and interaction rebind
```

Classification is necessary but is not itself an optimization. A component receives a reuse path only after its expensive derived work, invalidation inputs, and settled-output equivalence have been demonstrated. A component may explicitly classify requests while still rebuilding analysis when profiling shows that a cache would add complexity without meaningful benefit.

## 3. Non-goals and hard constraints

- Do not change `desktop/app/`; it is generated.
- Do not replace all component schedulers with one generic renderer.
- Do not infer impact from arbitrary reason strings in shared code.
- Do not make `paint` or `layout` the default fallback.
- Do not reuse a model across tabs, component modes, data versions, session generations, or incompatible settings.
- Do not store DOM nodes, functions, workers, controllers, AG Grid objects, or managers in payloads or serializable caches.
- Do not turn a headless timing threshold into a product contract. Use call counts, signatures, settled-state checks, and diagnostics; use timing only as supporting evidence.
- Do not combine mechanical module extraction with this behavioral migration.
- Do not silently absorb the separate non-mutating render-cache capture issue from `issues.txt` into this roadmap. Reuse tests must catch interaction and restore regressions, but capture-adapter changes require their own shared design and renderer-specific migration.
- Do not weaken assertions or increase ordinary test timeouts.
- Do not alter scientific results, alpha handling, random seeds, fitting methods, or report text merely to make reuse easier.
- Do not treat `viewOnly: true` as proof that analysis can be reused. It is compatibility metadata; the explicit impact and signature decide.

### 3.1 Recommended architectural decisions

- Keep the unknown/missing-impact fallback at `analysis` for the entire migration. Retire it only when a source audit proves that no relevant legacy caller remains.
- Put classification at each component's authoritative scheduling boundary. Shared lifecycle code may sanitize and merge the result, but must not own a global reason map.
- Keep `viewOnly` as compatibility metadata for existing scheduler behavior. Do not silently reinterpret it as `paint` or `layout`.
- Do not create a generic cross-component analysis cache. Analysis models have different scientific inputs, serialization needs, worker lifecycles, and projection contracts.
- Require every component to classify known draw requests. Require a reusable analysis cache only when an eligibility review shows material expensive work and a stable owner/signature boundary.
- Prefer one complete component wave over a broad mechanical conversion. Each wave must leave the component correct when the cache is disabled.
- Do not introduce a partial layer-renderer abstraction unless at least one component has named, independently rebuildable layers and the abstraction removes duplication without hiding ownership.
- Treat reason strings as diagnostics only. They may be logged or tested for observability, but they cannot determine correctness.

### 3.2 Geometry invariants

Impact classification must preserve the existing geometry contract:

- Keep the canonical graph/frame dimensions distinct from the rendered plot rectangle and the outward SVG/content envelope.
- A legend, title, or other outward element may extend the envelope, but must not silently change the canonical plot geometry unless the component explicitly classifies that as a geometry-affecting layout change.
- Persist graph-frame dimensions in absolute pixels; persist the surrounding workspace split as a relative proportion where that is the established contract.
- For Plot3D components, use canonical base graph dimensions for projection and interaction hit surfaces. A reused analysis model must not make the hit surface stale after resize or rotation.
- Validate geometry after legend changes, font changes, resize, restore, and cache reuse; visual equality of a graph alone is insufficient.

## 4. Shared contract to preserve and extend

### 4.1 Impact taxonomy

Use the smallest correct impact only when the component contract proves it:

| Impact | Meaning | Typical examples | Reuse allowed |
| --- | --- | --- | --- |
| `paint` | Existing geometry, scales, data, and analysis remain valid; only visual attributes change. | Stroke/fill color, opacity, dash pattern, symbol paint, non-metric decoration. | Reuse analysis and geometry; repaint the affected layer. |
| `layout` | Analysis and data geometry remain valid, but measured placement or reserved space can change. | Font size, legend visibility/position, tick labels, title text, axis clearance. | Reuse analysis; rebuild affected layout and projection. |
| `analysis` | Data, statistical settings, model parameters, scale domain, or derived values change. | Table edit, filter/exclusion, transform, axis mapping, regression/statistical setting, diagnostic setting. | Reuse only narrower verified submodels, never the stale affected result. |
| `structural` | The render graph, mode, table schema, panel topology, or renderer changes. | 2D/3D switch, graph type, grouped mode, panel arrangement, dendrogram mode, data schema change. | Rebuild the structural render path. |

When uncertain, classify upward. A request that touches both paint and layout is `layout`; layout and analysis is `analysis`; anything that changes the rendering topology is `structural`.

### 4.2 Shared lifecycle responsibilities

`js/shared/componentLifecycle.js` should remain responsible for:

- validating and normalizing the four-value taxonomy;
- sanitizing plain-data draw options;
- merging pending requests without downgrading impact;
- preserving owner metadata and generation checks;
- exposing small helpers for component classification and signature validation only where they are genuinely generic;
- keeping compatibility behavior for unclassified requests conservative;
- testing the merge and sanitation contract independently of component code.

It should not own component-specific reason maps, statistical signatures, or assumptions about SVG/canvas layers.

### 4.3 Component responsibilities

Each component must provide a small, auditable classification boundary, preferably near its owner scheduler. Only components that pass the reuse eligibility gate in section 5.4 should add the model-cache helpers below:

- `sanitize<Component>DrawOptions(options, owner)` adds the explicit impact after the component has interpreted the request.
- `classify<Component>RenderImpact(reason, options, context)` may be used internally, but must be driven by named control paths or typed flags, not substring guesses.
- `get<Component>AnalysisSignature(session, context)` returns a deterministic signature for reusable analysis/model state.
- `canReuse<Component>Analysis(session, options, signature)` verifies owner, generation, mode, signature, and required model completeness.
- `publish<Component>AnalysisModel(session, model, signature)` stores only the owner-scoped model required for a later presentation draw.

The component may keep an internal implementation, but the ownership and invalidation rules must be visible in tests. A documented no-cache decision is valid when the eligibility gate shows that the derived work is cheap, already independently memoized, or not safely reusable.

## 5. Cache and signature design

### 5.1 Separate three kinds of state

Do not collapse these into one “render cache”:

1. Canonical durable state: session state/results/payload fields.
2. Reusable analysis/model state: derived plain data tied to an exact analysis signature.
3. Render projection/cache: SVG fragments, canvas bitmaps, layout geometry, and interaction metadata.

An analysis model may accelerate a layout or paint draw, but it cannot replace canonical state or a valid render-cache ownership check.

### 5.2 Required signature properties

An analysis signature must include every input that can change the reusable result, including as applicable:

- component type and render mode;
- owner tab id or an equivalent owner key at the cache boundary;
- session generation/data revision;
- exact included data or a stable data revision whose invalidation is proven;
- exclusions, filters, transforms, and DataView identity/revision;
- axis mappings and scale-affecting settings;
- statistical method, parameters, alpha, correction, seed, and iteration count;
- selected series/groups and comparison scope;
- model-specific options such as regression order, distribution, embedding method, or clustering settings.

Presentation-only inputs must not be included in the analysis signature unless they actually change the model. They belong to layout or paint signatures.

Use canonical normalized plain data. Do not build signatures from live DOM, object identity, unordered object serialization, or formatted display text.

### 5.2.1 Input-to-impact review matrix

Use this matrix as a review starting point. The component owns the final classification when a setting has a less obvious effect.

| Input family | Usual impact | Model/cache consequence |
| --- | --- | --- |
| Raw table, schema, exclusions, filters, transforms, or DataView revision | `analysis` or `structural` | Invalidate every derived result that consumes the changed source. |
| Statistical method, alpha, correction, seed, iterations, comparison scope, or model parameter | `analysis` | Invalidate the affected statistical/model result and dependent report. |
| Axis mapping, binning, clustering, scale domain, normalization, or interpolation | `analysis` or `structural` | Rebuild affected values, scales, geometry, and dependent annotations. |
| Chart type, grouped mode, 2D/3D mode, table schema, or panel topology | `structural` | Rebuild the structural render path; never satisfy it from a presentation cache. |
| Font metrics, title/tick text, legend visibility/position, label placement, or reserved-space settings | `layout` | Reuse only a valid analysis model; rebuild layout, envelope, and projection. |
| Color, opacity, dash, symbol paint, grid/frame paint, or other non-metric decoration | `paint` | Reuse analysis and geometry only where the renderer can safely repaint the affected projection. |
| Zoom, pan, rotation, viewport, or graph resize | Renderer-dependent presentation/layout | Preserve analysis; recompute projection/hit surfaces and rebind interactions as required. |
| Owner tab, session generation, worker generation, or async token | Validity guard | Reject stale results/cache entries; do not treat owner changes as a user-facing model setting. |

The review must document exceptions. For example, a color scale that changes numeric mapping is analysis/layout-affecting, while a categorical palette change may be paint-only.

### 5.3 Cache safety

- Cache entries must be owned by the live component session or an explicitly owner-keyed registry.
- Cache reads must verify the owner before returning a model.
- A missing, malformed, incomplete, or mismatched signature is a cache miss.
- A stale async result must not publish a model into the active tab merely because that tab is currently visible.
- Cache invalidation must happen at the canonical state mutation boundary, before scheduling the draw.
- Persist only cache data that is proven JSON-safe and useful for reopen fidelity. Otherwise rebuild it from the restored session.
- Never mutate a cached model in place during projection; clone or treat it as immutable.
- If the model contains functions such as `pdf`, `cdf`, or callbacks, keep those live-only or reconstruct them from the canonical fit parameters. Do not serialize them.

### 5.4 Reuse eligibility gate

Before adding a component analysis cache, record the following evidence in the component's wave notes or test description:

1. The expensive work is identifiable by a stable call count, worker request, or equivalent diagnostic signal.
2. At least one real paint/layout action repeats that work today.
3. The complete invalidation input set can be enumerated and represented as canonical plain data.
4. The result can be reused without mutating cached state or bypassing interaction rebind.
5. A full redraw and the optimized settled redraw produce equivalent scientific output, geometry, report content, and interaction behavior.
6. The cache's memory and reopen behavior are acceptable for the component's data size.

If any item fails, classify the request explicitly but keep the analysis rebuild path. Do not add a speculative cache to satisfy a roadmap checkbox. Record the reason and revisit it only with new evidence.

## 6. Execution order

The migration must be incremental. Each wave ends with focused tests and a source audit before the next component is touched.

### 6.0 Work-package control plan

| Work package | Output | Depends on | Go/no-go gate |
| --- | --- | --- | --- |
| WP-00 | Baseline inventory and shared-contract characterization | Current source and test audit | All eleven owner boundaries are named; unknown fallback is covered. |
| WP-01 | ROC pilot audit and reusable reference contract | WP-00 | ROC reuse is owner-safe, signature-safe, and output-equivalent. |
| WP-02 | Histogram classification and diagnostics reuse decision | WP-01; existing Histogram cache | No direct analysis bypass; repeated diagnostics behavior is proven. |
| WP-03 | Scatter/PCA migration | WP-01 | Worker generations, 2D/3D boundaries, and large-data paths remain owner-safe. |
| WP-04 | Line/Box migration | WP-01 | Regression, forecast, statistics, and significance outputs remain equivalent. |
| WP-05 | Heatmap/Surface/Survival migration | WP-01 | Scale, 3D, clustering, and async report boundaries remain correct. |
| WP-06 | Venn/Pie migration | WP-01 | Specialized topology, async analysis, radial layout, and reopen behavior remain correct. |
| WP-07 | Cleanup, documentation, and release evidence | WP-02 through WP-06 | No proven-unused path remains; docs and backlog reflect the final contract. |

Rules for execution:

- One component is the production scope of a migration batch unless a shared lifecycle change is unavoidable and separately tested.
- A work package may end with an explicit no-cache decision; that is a completed engineering decision, not a failed migration.
- A failed gate blocks dependent packages. Do not compensate by weakening tests or broadening the fallback.

### Phase 0 — Baseline and contract lock (complete)

Files:

- `js/shared/componentLifecycle.js`
- `test-support/componentLifecycleCoreSuite.js`
- `__tests__/unit/*componentLifecycle*`
- `issues.txt`

Tasks:

- Record the current four-value contract, conservative fallback, strongest-impact merge, and owner metadata rules.
- Add a compact shared test matrix for explicit impacts, unknown values, missing impacts, mixed pending requests, and plain-data sanitation.
- Add a source inventory listing every component scheduler and every current `viewOnly`, structural helper, and direct scheduler call.
- Record which component changes are allowed to reuse analysis and which must rebuild.
- Preserve the existing ROC tests as characterization coverage; do not broaden the shared fallback based on ROC alone.
- Record the current implementation baseline from section 1, including the existing Histogram diagnostics cache, the completed Heatmap semantic wave, and the now-completed all-component audit.

Exit criteria:

- Shared tests pass.
- The inventory has one named owner boundary for all eleven components.
- No code path relies on a reason substring in shared lifecycle code.

### Phase 1 — ROC pilot audit and reference contract (complete)

ROC already contains the first pilot. Audit and normalize it before copying any pattern:

- Verify that legend/layout changes reuse only the matching analysis signature.
- Verify that graph-type, classification, data, comparison, and resampling changes invalidate the model.
- Verify that `renderImpact` survives ROC queue merge and sanitation.
- Verify inactive-owner deferral, activation replay, same-type tab isolation, reopen, and interaction rebind.
- Verify that its cached model is plain-data-safe or clearly marked as live-only.
- Add explicit call-count coverage for one presentation-only redraw and one invalidating redraw.

Exit criteria:

- ROC remains green under its focused Jest and Chromium contracts.
- The reference pattern is written as a small shared/component contract, not copied as a wholesale template.

### Phase 2 — Histogram (complete for classification; diagnostics cache retained)

Why first: Histogram has expensive distribution fitting and goodness-of-fit bootstrap work, and its redraw issue already supplied concrete runtime evidence.

Audit and classify:

- Paint: bar fill/border paint, trace opacity, overlay color/pattern/thickness/transparency when geometry and fit settings are unchanged.
- Layout: font size, title/label placement, legend visibility/position, tick presentation, and layout-only panel changes.
- Analysis: table edits, exclusions, transforms, binning that changes derived frequencies, distribution selection, alpha, diagnostic mode, and comparison inputs.
- Structural: plot mode changes, panel topology, shared-Y mode, table schema/series display, and any renderer change.

Tasks:

- Make the main Histogram scheduler emit explicit impacts at the control boundary.
- Keep goodness-of-fit cache entries owner-scoped and keyed by exact values and all effective diagnostic settings.
- Ensure the main publication path and any secondary/report path use the same cache boundary; no direct bootstrap call may bypass it.
- Treat the existing owner-scoped diagnostics cache as an input to this wave, not as a reason to introduce a second cache or duplicate signature.
- Preserve exact fit and report values, including invalid-support messages and sample sizes.
- Add tests for same-session reuse, changed data/settings invalidation, and two same-type tabs with different data.

Exit criteria:

- Histogram targeted statistical/UI tests pass.
- The repeated identical redraw has no additional bootstrap calls.
- A changed data signature causes a new computation.
- Reopen and tab switching preserve the correct owner result.
- The broader render-model cache decision is explicitly deferred unless a later audit identifies expensive repeated work with a complete safe signature.

### Phase 3 — Scatter and PCA (complete)

Why next: both have expensive model/render paths, large-data concerns, workers, and 2D/3D transitions.

Scatter tasks:

- Classify point/line/label paint separately from layout changes such as font, legend, axis/tick, and label placement.
- Treat data edits, exclusions, regression options, axis mapping, adaptive density, and 2D/3D transitions as analysis or structural as appropriate.
- Include worker input revision, model mode, projection dimensions, and rotation/render mode in signatures.
- Never reuse a 2D model for 3D or a canvas model for an incompatible SVG path.
- Preserve canvas bitmap state and rebind selection/tooltip/zoom interactions after reuse.

Scatter completion record:

- The component scheduler now carries explicit semantic impacts through sanitation, queueing, draw instrumentation, and the shared strongest-impact coalescer. Legacy `viewOnly` remains compatibility metadata derived from the explicit impact.
- Point collection reuse is intentionally narrower than full analysis reuse. The cache is session-owned, owner-safe, revision-keyed, and mode-keyed; `analysis` redraws reuse valid collection output, while `structural` redraws rebuild it. This preserves trendline/statistics responsiveness without treating an analysis request as paint-only.
- Log-plus-one transforms explicitly invalidate the data revision. Graph type, table format, data-view, import, example, and 2D/3D transitions cannot satisfy the collection gate. Canvas/worker render preparation is rebuilt or recomputed when its geometry, mode, or density inputs require it.
- Draw instrumentation records the resolved impact, making the classification observable in settled browser tests. Existing cache, 2D/3D, import, reopen, resize, trendline, and same-type isolation behavior remains green.
- No generic Scatter worker or full render-model cache was introduced: worker results and renderer-specific geometry have separate ownership and lifecycle requirements that were not needed to prove this wave. Revisit only with a measured repeated-work case and a complete signature.

Exit criteria:

- Explicit classification is present at all audited Scatter scheduling boundaries.
- Paint/layout requests do not recollect valid point data; analysis requests reuse only the verified collection submodel; structural/data requests rebuild it.
- 2D/3D, canvas, worker, import, reopen, resize, trendline/statistics, and same-type tab isolation gates pass.
- The no-cache decision for worker/full-render-model reuse is documented rather than hidden behind a broad `viewOnly` shortcut.

PCA tasks:

- Treat color/style/font changes as paint/layout only when they do not alter embedding, axes, labels, or scale domains.
- Treat method, dimensions, normalization, grouping, metadata, worker inputs, and 2D/3D transitions as analysis/structural.
- Carry worker generation and stale-result policy through the cache publication boundary.
- Verify MDS/t-SNE/UMAP/PCA signatures separately where their model inputs differ.

PCA completion record:

- Explicit impacts are attached at the data-view, view-mode, method, style, axis, legend, resize, rotation, example, import, and label/style boundaries.
- Presentation redraws reuse only the owner-matching analysis cache and only when the render impact is paint/layout and the data runtime is clean.
- The cache signature covers normalized matrix values, labels, grouped headers, table format, method/settings, and the owner tab; stale or foreign-owner entries are rejected.
- Existing view/cache, style, worker, persistence, and focused Chromium restore/rotation tests remain green. No broader cache was introduced where the eligibility evidence was incomplete.

Exit criteria:

- Worker stale-owner tests remain green.
- 2D/3D, rotation, resize, cache restore, and same-type tab isolation pass.
- Full redraw and presentation reuse produce equivalent settled visible output.

### Phase 4 — Line and Box (complete; Box timing remains diagnostic)

Line tasks:

- Separate line/marker paint from axis/label/legend layout.
- Treat regression, confidence/prediction bands, forecast, grouped-series structure, axis mapping, and data changes as analysis or structural.
- Include forecast horizon, model order, confidence settings, and series selection in signatures.
- Preserve 3D rotation and interaction state when a presentation model is reused.

Line completion record:

- Every audited Line draw request now carries an explicit semantic impact. Series/marker/uncertainty style changes are `paint`; axis, label, legend, font, range, resize, and rotation changes are `layout`; regression, statistics, forecast, log-transform, and data-edit changes are `analysis`; data-view, grouped-schema, import, example, and 2D/3D transitions are `structural`.
- The shared scheduler remains the coalescing and owner-safety boundary. Line sanitation derives compatibility `viewOnly` from the explicit impact, so reason strings no longer decide whether a draw is presentation-only.
- Line's draw path still reconstructs its 2D/3D series and visual regression inputs per draw. The existing statistics context is persisted for result fidelity but is not a complete renderer/model signature. Reuse is therefore explicitly deferred until a measured expensive path has an owner-scoped, mode-aware signature covering data, transforms, regression/forecast settings, intervals, scale, and series structure.
- Draw performance entries and settled lifecycle events record the resolved impact, allowing browser tests to assert the request contract without inferring it from timing.

Line exit evidence:

- Focused Jest: `npx jest --runInBand __tests__/line.view.test.js __tests__/line.regressionOverlaySegmentation.test.js __tests__/unit/line.model.test.js __tests__/ui.events.box-line.test.js` — 4 suites, 39 tests passed.
- Focused Chromium: `npx playwright test e2e/line.errorbar-toolbar.spec.js e2e/line.3d-initial-aspect.spec.js e2e/line.3d-example-table-stability.spec.js e2e/line.uncertainty-band.tab-isolation.spec.js e2e/line.uncertainty-band.reopen-recovery.spec.js e2e/line.reopen-horizontal-resize-axis.spec.js e2e/line.header.sort-drag.spec.js e2e/line.column-insert-style-identity.spec.js --project=chromium --workers=1` — 11 tests passed.
- `node --check js/components/line.js` passed. No Firefox claim is made.

Box tasks:

- Separate trace/point/summary paint from plot geometry and significance layout.
- Treat formula/grouping, exclusions, statistical settings, significance annotations, swarm/radius calculations, and axis flips as analysis or structural as applicable.
- Include every stats variant, correction, seed/iteration setting, and grouped schema in the analysis signature.
- Keep worker and canvas/approximation paths owner-scoped.

Box completion record:

- The authoritative Box scheduler now carries explicit semantic impacts through sanitation, queueing, draw instrumentation, and settled lifecycle metadata. Compatibility `viewOnly` is derived from the impact and no longer decides whether analysis is reusable.
- Paint-only redraws reuse the owner-cached trace input when the data runtime and table/layout identity are clean. The cache remains a projection-input cache, not a generic statistical-result cache.
- The Box statistics signature covers all effective statistical settings, exact custom comparison definitions, grouped configuration, selected columns, and a deterministic digest of every raw trace value. Cached traces receive the digest when created or restored, preventing equal-count/equal-moment data from passing the cache gate.
- The swarm worker request carries the originating Box tab id into its execution context. Worker output therefore retains the same owner boundary as the draw that requested it.
- No broad Box model cache was introduced. Formula, significance, grouped, violin, error, and point-layout paths remain on the rebuild path unless their existing owner/signature contract proves otherwise.

Box exit evidence:

- Focused Jest: `npx jest --runInBand __tests__/box.renderImpact.contract.test.js __tests__/box.architectureOwnership.contract.test.js __tests__/box.internalSanitation.contract.test.js __tests__/box.statsStatePerformance.contract.test.js __tests__/box.statsModelOwnership.contract.test.js __tests__/box.liveStyleRefresh.test.js __tests__/box.swarmOffsets.test.js` — 7 suites, 69 tests passed.
- Focused Chromium: worker statistics, significance layout, stats restore, flip isolation, and live-style coverage — 19 tests passed with `--project=chromium --workers=1`.
- Broader Chromium check: 25 tests executed; 23 passed and 2 failed only because existing activation assertions require under 2 seconds while the environment measured about 2.5–3.2 seconds. The affected tests also passed their functional no-recompute, settled-draw, persistence, and draw-duration checks. This remains diagnostic evidence, not a product contract.
- `node --check js/components/box.js` and `node --check __tests__/box.renderImpact.contract.test.js` passed. No Firefox claim is made.

Exit criteria:

- Statistical oracle and component-specific tests prove no stale summaries, intervals, annotations, or worker outputs.
- Significance geometry and undo behavior remain unchanged.
- Large-data paths do not regress into repeated full analysis on paint-only requests.

### Phase 5 — Heatmap, Surface, and Survival (Heatmap, Surface, and Survival complete)

Heatmap:

- Completed wave: all audited Heatmap scheduling paths now carry explicit semantic impacts through component sanitation, owner-scoped queueing, draw instrumentation, and settled lifecycle metadata. Compatibility `viewOnly` is derived from the impact and is no longer the correctness signal.
- `paint`: categorical palette changes, significance display, value/mask/absolute-value presentation toggles, and dendrogram stroke mode/thickness/color. These preserve the numeric matrix, scale domain, labels, and analysis results.
- `layout`: font, cell size, decimals, value-scale presentation, legend-height mode, title undo/redo, resize, and p-value display formatting. These reuse only the matching value/correlation render model and rebuild the affected projection/layout.
- `analysis`: significance correction, filters, clustering, linkage, normalization, and other data/statistical controls. In particular, correction changes cannot use the cached render model because adjusted p-values are analysis output.
- `structural`: data-view changes, dataset replacement/import, correlation-source transforms, and payload hydration. These rebuild the structural path and cannot be satisfied by presentation reuse.
- The focused failing-first contract proved the correction defect: the old path changed the correction label but retained adjusted p-values calculated under the previous method. The production fix routes that control through the full analysis path and keeps the shared conservative fallback for unaudited callers.
- No generic Heatmap analysis cache was introduced. Existing owner-scoped render-model reuse remains bounded by matching view type and projection-safe inputs; clustering, correlation, scale, and data changes retain the rebuild path.

Heatmap exit evidence:

- Focused Jest: `npx jest --runInBand __tests__/heatmap.renderImpact.contract.test.js __tests__/heatmap.stats.test.js __tests__/heatmap.dendrogram-rendering.test.js` — 3 suites, 53 tests passed.
- Focused Chromium: `npx playwright test e2e/heatmap.legend-height.spec.js e2e/heatmap.color-scale-spacing.spec.js e2e/heatmap.correlation-tab-restore.spec.js e2e/heatmap.dual-tab.example.spec.js e2e/heatmap.adjust-filter.responsiveness.spec.js --project=chromium --workers=1` — 7 tests passed.
- Static checks: `node --check js/components/heatmap.js`, `node --check __tests__/heatmap.renderImpact.contract.test.js`, and `git diff --check` passed. Firefox was not run.
- Separate follow-up: `__tests__/heatmap.tabContext.test.js` still has one production-derived activation failure out of five cases. Custom dendrogram settings revert to defaults after a tab round-trip; the same failure persisted after reverting experimental Heatmap semantic changes. The issue is tracked in `issues.txt` and is not folded into this wave.

Surface:

- Completed wave: all audited Surface scheduling paths now carry explicit semantic impacts through component sanitation, owner-scoped queueing, draw instrumentation, and settled lifecycle metadata. Compatibility `viewOnly` is derived from the impact and is no longer the correctness signal.
- `paint`: color ramp, grid, frame, point, and axis-color changes. These alter presentation while preserving the data, axis mapping, interpolation, and 3D geometry model.
- `layout`: font, axis stroke, title, label, legend, resize, and rotation changes. These can alter margins, the outward envelope, or the projected view and must preserve canonical base dimensions and hit-surface geometry.
- `analysis`: data-dependent redraws and other requests that require current parsed/model inputs.
- `structural`: data-view changes, interpolation, axis mapping, imports, examples, payload hydration, and other mode/schema transitions. These cannot use presentation-only reuse.
- Existing owner-scoped Plot3D rotation state and its direct interaction renderer remain the only approved reuse path. Normal Surface draws rebuild table-derived geometry, axes, scales, layers, and hit surfaces; no broader cache was introduced without a complete signature and measured benefit.

Surface exit evidence:

- Focused Jest: `npx jest --runInBand __tests__/surface.renderImpact.contract.test.js __tests__/surface.legendResize.test.js __tests__/surface.tabContext.test.js __tests__/surface.renderCache.test.js __tests__/shared/plot3d.test.js` — 5 suites, 37 tests passed.
- Focused Chromium: `npx playwright test e2e/surface.legend-fixed-height.spec.js e2e/surface.live-resize-stability.spec.js e2e/surface.recovery-rotation.spec.js e2e/surface.rotation-size-stability.spec.js e2e/surface.settings-dataviews-manual-overlay-tab-isolation.spec.js e2e/surface.svgbox-right-margin.spec.js --project=chromium --workers=1` — 8 tests passed.
- Static checks: `node --check js/components/surface.js`, `node --check __tests__/surface.renderImpact.contract.test.js`, and `git diff --check` passed. Firefox was not run.

Survival:

- Completed wave: all audited Survival scheduling paths now carry explicit semantic impacts through component sanitation, owner-scoped scheduling, draw instrumentation, and settled lifecycle metadata. Compatibility `viewOnly` is derived from the impact and is no longer the correctness signal.
- `paint`: curve color, line width, line pattern, transparency, grid, frame, axis color, confidence-band visibility, and censor-marker visibility. These do not change the survival statistics or axis domain.
- `layout`: labels, fonts, axis tick/angle settings, legend, time range, risk-table and plot-stat presentation, axis stroke, and resize. These affect geometry or the outward envelope without changing the underlying analysis inputs.
- `analysis`: event/censor table edits, Cox and hazard-ratio scope, covariates, pairwise correction, inference settings, and advisor-applied analysis settings. These can change Kaplan–Meier-associated reports or model output and remain on the full rebuild path.
- `structural`: DataViews, imports, examples, payload hydration, and initialization. These replace the table/schema or owner state and require a complete redraw.
- Every draw reconstructs Kaplan–Meier, log-rank, pairwise, hazard-ratio, and Cox outputs from current owner state. No stable reusable model/report signature was present, so no cache was added; async checkpoints, owner tokens, and report-panel ownership remain the correctness boundary.

Survival exit evidence:

- Focused Jest: `npx jest --runInBand __tests__/survival.renderImpact.contract.test.js __tests__/survival.stats.test.js __tests__/componentLifecycle.core.restore-and-scheduling.test.js __tests__/componentLifecycle.core.runtime-ownership.test.js` — 4 suites, 62 tests passed.
- Focused Chromium: `npx playwright test e2e/survival.style-report-deferred-isolation.spec.js e2e/survival.same-type-reopen-isolation.spec.js e2e/survival.risk-table-layout.spec.js e2e/survival.notes-position.spec.js e2e/survival.covariate-reopen-tab-isolation.spec.js e2e/survival-roc-hist.dataviews-notes-isolation.spec.js --project=chromium --workers=1` — 14 tests passed.
- Static checks: `node --check js/components/survival.js`, `node --check __tests__/survival.renderImpact.contract.test.js`, and `git diff --check` passed. Firefox was not run.

Exit criteria:

- Focused statistical, persistence, resize/rotation, and owner-async tests pass for each component.
- No model from one mode or tab can satisfy another mode or tab's signature; Surface rotation reuse remains owner-scoped, while Surface and Survival full redraws do not admit cross-owner reuse.

### Phase 6 — Venn and Pie (complete)

These components have more specialized topology and should be migrated last among the major renderers, not used as generic examples.

Venn:

- Completed wave: all audited Venn/UpSet scheduling paths now carry explicit semantic impacts through component sanitation, owner-scoped queueing, draw instrumentation, and settled lifecycle metadata. Compatibility `viewOnly` is derived from the impact and is no longer the correctness signal.
- `paint`: Venn/UpSet palette, non-metric line styling, opacity, grid, and dot/trace presentation. These preserve set membership, topology, and analysis results.
- `layout`: title and set/region labels, font and border sizing, UpSet counts, axis presentation, and resize. These affect measured placement or reserved space without changing source membership or statistical inputs.
- `analysis`: list and numeric edits, table edits, case sensitivity, exclusions, and significance/data-dependent controls. These can change set membership, counts, regions, or reports and remain on the rebuild path.
- `structural`: Venn/UpSet mode, sample/example data, payload hydration, activation, schema/topology changes, and numeric/list representation changes. These replace the specialized render structure and require a complete redraw.
- Venn and UpSet retain owner-scoped GO/STRING/species async ownership and stale-result rejection. The existing narrow UpSet live-resize preview remains intact.
- No complete reusable topology/report signature was present. Specialized set geometry, report, and analysis paths therefore rebuild on analysis/structural requests; no generic Cartesian or speculative topology cache was introduced.

Venn exit evidence:

- Focused Jest: the new render-impact contract plus UpSet checks passed 17 tests; the broader tab-opening integration suite passed 21 tests; the remaining focused Venn checks passed 16 tests after updating one stale owner-metadata expectation. All were run serially with `--silent` where appropriate.
- Focused Chromium: `npx playwright test e2e/venn.upset-numeric-species-reopen-isolation.spec.js e2e/venn.upset.controls-layout.spec.js e2e/venn.upset.live-resize.text-stability.spec.js e2e/venn.label-layout.spec.js e2e/venn.table-column-persistence.spec.js e2e/venn.exclusions-welcome.spec.js e2e/venn.go-string.async-tab-isolation.spec.js e2e/venn.list-cache-region-tab-isolation.spec.js e2e/venn.paste-scroll.spec.js e2e/venn.restore-recovery.spec.js --project=chromium --workers=1` — 36 tests passed.
- Static checks: `node --check js/components/venn.js`, `node --check __tests__/venn.renderImpact.contract.test.js`, and `git diff --check` passed. Firefox was not run.

Pie:

- Completed wave: all audited Pie/Donut/stacked scheduling paths now carry explicit semantic impacts through component sanitation, owner-scoped queueing, draw instrumentation, and settled lifecycle metadata. Compatibility `viewOnly` is derived from the impact and is no longer the correctness signal.
- `paint`: slice/frame/color presentation and trace styling that do not alter proportions, category membership, or reserved geometry.
- `layout`: labels, fonts, axes, legend placement, summary placement, border width, start angle, and resize. These affect presentation geometry or reserves without changing the statistical inputs.
- `analysis`: table edits and data/statistical changes that can alter proportions, expected counts, goodness-of-fit or proportion tests, and report content.
- `structural`: pie/donut/stacked mode, category schema, DataView replacement, import/example data, payload hydration, and initialization. These replace the radial or Cartesian render structure and require a complete redraw.
- No complete reusable radial analysis/topology signature was present. Radial resize/presentation paths remain specialized; proportions, reports, topology, and mode changes rebuild on analysis/structural requests.

Pie exit evidence:

- Focused Jest: the new render-impact contract, percentage labels, tab isolation, statistics inference, and axis-control suites passed 63 tests across five suites.
- Focused Chromium: `npx playwright test e2e/pie.dataviews-color-label-resize-isolation.spec.js e2e/pie.legend-resize.diagnostic.spec.js e2e/pie.stacked-chart-type.spec.js e2e/pie.stacked-live-resize-flicker.spec.js e2e/pie.stacked-rotated-label-reserve.spec.js e2e/pie.stats-example.spec.js e2e/stats.reopen-presence.contract.spec.js e2e/stats.same-component-isolation-restore.contract.spec.js --project=chromium --workers=1` — 27 tests passed.
- Static and planning checks: `npm run test:suggest -- --files js/components/pie.js __tests__/pie.renderImpact.contract.test.js`, `node --check`, and `git diff --check` passed. Firefox was not run.

Exit criteria:

- Specialized Venn/UpSet and radial Pie paths have their own explicit signatures and no copied Cartesian assumptions.
- Async analysis, tab isolation, persistence, legend interaction, and export behavior remain green.

### Phase 7 — Shared cleanup and documentation

Only after all component waves pass:

- Remove proven-unused local impact or queue logic; do not remove compatibility helpers merely because a new path exists.
- Keep one shared sanitation/merge contract.
- Update `docs/development/component-contracts.md`, `docs/development/module-call-map.md`, and generated inventories where call boundaries changed.
- Update `CHANGELOG.md` with behavior and safety implications.
- Update `issues.txt` only when the migration's acceptance criteria are fully met.
- Re-run the relevant static, architecture, statistical, unit, DOM, worker, and Chromium gates based on changed-path impact.

## 7. Required test matrix

### Shared lifecycle

- Explicit `paint`, `layout`, `analysis`, and `structural` sanitation.
- Unknown impact falls back to `analysis`.
- Missing impact remains conservative.
- A later lower-impact request cannot downgrade a pending higher-impact request.
- A later higher-impact request upgrades the pending request.
- Owner tab id and generation remain plain data.
- DOM nodes, events, sessions, workers, and controllers are removed from scheduled options.

### Each component

For every component, add or adapt a small classification table:

| Case | Required assertion |
| --- | --- |
| Paint-only control | Explicit `paint`; no analysis/model recomputation. |
| Layout-only control | Explicit `layout`; approved reusable model reused, or the documented no-cache rebuild path is taken; layout is correct. |
| Data/model control | Explicit `analysis`; affected cache invalidated. |
| Mode/schema control | Explicit `structural`; full structural path used. |
| Same-tab repeated request | Strongest impact and one coalesced settled draw. |
| Two same-type tabs | Cache and pending work never cross owners. |
| Reopen | Restored output equals the original owner/session state. |
| Stale async result | Result is ignored or written only to its originating owner. |
| Forced full redraw | Output is equivalent to the optimized settled output. |

### Performance evidence

Use deterministic evidence:

- goodness-of-fit, fit, regression, worker, clustering, or embedding call counts;
- cache hit/miss counters gated by debug/test hooks;
- exact signature comparisons;
- settled render/lifecycle events;
- memory-safe repeated redraw probes.

Do not assert a universal millisecond threshold in headless tests. If a timing regression is observed, record the environment and use it to guide diagnosis, not as the sole acceptance rule.

### Executable validation policy

For each changed component, first run the repository's suggestion tool and then the smallest relevant focused tests:

- `npm run test:suggest -- --files <changed-files>` to identify likely gates.
- `npx jest --runInBand <focused-tests>` for the component, shared lifecycle, statistics, or owner-boundary assertions that changed.
- `npx playwright test <focused-specs> --project=chromium --workers=1` for settled browser behavior, tab ownership, reopen, resize, and interaction checks.
- Repeat the focused browser run normally after an initial failure is diagnosed; do not treat a single timing-sensitive pass as proof.
- Shared lifecycle, persistence, archive, async ownership, or render-cache changes justify the broader architecture/DOM/unit/worker gates. A component-only classification change does not automatically justify the full suite.
- Run `npm run test:coverage` only as a final release gate when the cumulative shared-boundary risk warrants it. Coverage certification is a separate concern and must not be presented as proof of semantic reuse correctness.

Record the exact commands, browser project, worker count, and result for each wave. Firefox is not a release claim unless it is explicitly run and passes.

## 8. Safe implementation procedure for every wave

1. Read the component scheduler and the nearest sibling implementation.
2. List every call site that schedules a draw.
3. Identify the canonical state mutation and invalidation point for each call site.
4. Classify the request from its actual state effect.
5. Add the focused failing/regression assertion before production edits when practical.
6. Add explicit impact metadata at the authoritative boundary.
7. Add or verify the owner-scoped signature and cache check.
8. Run focused Jest tests.
9. Run the component's focused Chromium contracts, serially for initial failures and with the normal worker count for the acceptance rerun.
10. Audit the diff for DOM/session/function leakage and accidental broad invalidation.
11. Regenerate architecture/inventory documents when dependency boundaries changed.
12. Record only confirmed new issues, without duplicates, and update the roadmap status.

## 9. Risk register and controls

| Risk | Early warning | Required control |
| --- | --- | --- |
| Weak or incomplete signature | A changed setting leaves call counts unchanged or output stale. | Enumerate inputs from the actual analysis function; add one changed-input invalidation test per input family. |
| `viewOnly`/impact conflation | A legacy view request reuses data after a model-affecting change. | Keep `viewOnly` compatibility-only and assert explicit impact at the component boundary. |
| Active-tab leakage | A delayed worker, timer, or promise changes the visible or cached state of another tab. | Carry tab id and generation through scheduling and completion; test same-type tabs and inactive-owner completion. |
| Cache serialization drift | Reopen loses a fit function, interaction hook, or derived report field. | Store only plain data; reconstruct live functions; compare initial and reopened settled state. |
| SVG/canvas interaction loss | The image looks correct but zoom, selection, rotation, or tooltip behavior stops working. | Rebind interactions after reuse and test the interaction, not only serialized markup. |
| Geometry invalidation hidden by reuse | Legend, font, axis, or graph-frame changes overlap or clip. | Separate analysis, layout, and outward-envelope checks; validate settled geometry after resize and restore. |
| Unbounded cache growth | Repeated edits increase session memory without a bound. | Define an explicit entry limit/eviction policy and exercise repeated signature changes. |
| Over-generalized shared helper | Component assumptions appear in `componentLifecycle` or a global reason map. | Keep scientific classification and signatures in components; reject helpers that cannot remain component-agnostic. |
| Timing-only evidence | A headless benchmark passes while the user-visible regression remains. | Prefer call counts and settled invariants; use timing only as supporting evidence. |

## 10. Failure handling and rollback

Stop the wave if any of these occurs:

- a presentation request changes a statistical result, axis domain, or report;
- a cache entry is accepted with a missing or weak signature;
- a delayed result writes to the active tab instead of its originating owner;
- a reopened file differs from its initial session;
- a canvas/SVG interaction is lost after reuse;
- a render-impact classification requires guessing from a reason string;
- a shared helper needs component-specific assumptions;
- a test passes only after weakening an assertion or adding an ordinary delay.

Rollback at the component boundary: remove that component's explicit classification/reuse path and retain the conservative `analysis` fallback while preserving the shared contract and tests. Do not roll back unrelated owner, persistence, or renderer fixes.

## 11. Definition of done

The refactor is complete only when:

- all eleven components have audited draw call sites;
- every known/migrated request has explicit, tested impact semantics, while genuinely unknown legacy callers retain the conservative fallback until retired;
- the shared fallback remains conservative for genuinely unknown callers;
- reusable analysis is owner-scoped and signature-validated;
- full analysis is not repeated for proven paint/layout-only requests where the eligibility gate approved reuse; components with a documented no-cache decision remain correct through their rebuild path;
- data, settings, mode, schema, worker, and generation changes invalidate correctly;
- same-component tab isolation and reopen fidelity pass;
- render-cache and interaction rehydration remain correct;
- targeted tests and the changed-path release gates pass;
- architecture documentation and `issues.txt` reflect the completed boundary;
- the final change accounting distinguishes intentional refactor edits from pre-existing dirty-worktree changes and does not modify generated `desktop/app/` sources.

All of these criteria are met for this migration. The separate Heatmap activation defect and shared render-cache capture migration remain tracked in `issues.txt`; Box timing results are retained as non-blocking diagnostic evidence, not an open product issue.
