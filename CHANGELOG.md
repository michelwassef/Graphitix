## Unreleased

- Fixed Line 3D example loading so descriptive, user-editable axis titles remain a canonical two-row 3D schema instead of triggering repeated legacy conversion, dataset-column growth, and duplicated header rows.
- Constrained every shared draggable legend to the complete current SVG viewport, including restored positions and 2D/3D views, so no legend edge can be moved outside its container.
- Made legend visibility geometry-neutral across Box, Scatter, PCA, Line, ROC, Survival, Histogram, and Pie: the SVG and visible graph card extend around the legend, while the plot keeps its exact size. Long legends wrap into height-bounded columns, the new frame and card envelope publish together to prevent toggle flicker, radial Pie expands its clipping plot host on the initial render, and manual resize handles remain on the visible outer edge.
- Fixed narrow stacked Pie graphs so rotated x-axis labels use the shared projected rotation geometry; the SVG/card gains the exact bottom reserve, while the shared Box/Pie categorical inset keeps the first label inside the left edge and moves the Y axis with its datasets.
- Fixed grouped-replicate Box graphs so the legend extension is applied only to the final SVG viewport and never fed back into plot, font, or axis sizing.
- Rehydrated legend envelopes after owner-validated render-cache restoration without changing cached SVG geometry.
- Fixed rotated Box x-axis labels at the left edge with an internal categorical inset, keeping labels in bounds while preserving the Y-axis-to-dataset spacing and graph frame.
- Replaced every built-in component example, including mode-specific Scatter, PCA, Line, and Box variants, with curated biomedical-literature data and explicit paper/figure provenance in the component Notes section.
- Fixed opened example provenance Notes so their intrinsic text width cannot expand plot stacks and push graph control panels offscreen, and changed the shared Notes content default to 10 pt.
- Normalized Data and Format toolbars to one shared panel contract: 70px height, white surfaces, standard title slots, 52px control rows, and consistent outer insets and inner horizontal padding.
- Added an immutable shared biomedical example registry that deep-clones records per load, eliminating duplicated component literals while preserving same-component tab isolation and normal Notes persistence through save, reopen, and recovery.
- Added rich paired/repeated designs, including three paired aSAH ROC predictors for all 113 patients, all six Indomethacin pharmacokinetic profiles, the complete 23-patient AML survival dataset, complete ToothGrowth measurements, WDBC multivariate views, and TCGA subtype gene sets.
- Added a provenance manifest and focused contracts for registry coverage, clone isolation, Notes integration, dataset richness, and paired ROC composition.

- Fixed the shared Playwright workspace launcher to wait for welcome-card hydration before clicking, removing four failed 10-second retries for later cards such as ROC, Survival, and Pie.
- Added one shared owner-safe toolbar overflow rail for General, Data, and Format sections. Controls remain in their original DOM/state surface while directional chevrons, item-aware scrolling, touch/trackpad support, Shift+wheel scrolling, and focus reveal make every action reachable at constrained widths.
- Fixed toolbar scrollers so clicks only move the active rail, context panels open at the left edge, and flat full-height Excel-style arrows replace floating shadowed buttons and gradient fades.
- Normalized Data transforms and simultaneous Format panels to a single non-wrapping row; overflow position is transient UI projection that resets on toolbar-section or tab-owner changes and is never serialized into `.graph` state.
- Added shared fixed-position toolbar popup placement so Open, custom-transform, font, notation, additional-tick, and broken-axis menus escape the horizontal viewport without cloning controls or creating a second state authority.
- Added stable section-ID activation for toolbar UI-state restore, replacing the previous incompatible DOM-element/label call boundary.
- Added focused unit and Chromium contracts for DOM identity, directional affordances, owner resets, focus and wheel behavior, popup clipping, narrow General/Data sections, and multi-panel Format overflow.
- Made inactive Scatter, PCA, and ROC payload reads projection-free: when persistence requests a non-projected owner, each component now returns that tab's canonical payload verbatim instead of reading the currently mounted sibling's grid, controls, or statistics. This fixes same-component Save/reopen signature drift that could appear in unchanged components after shared persistence timing changed.
- Fixed Scatter table access so explicitly resolving an inactive owner no longer replaces the module's projected AG Grid, and corrected grouped-header normalization to operate on the exact target grid.
- Made Scatter and PCA example loading commit the owner-scoped canonical payload synchronously through the shared AG Grid write-through API, eliminating the race where a graph was visible before `tab.payload.data` existed.
- Normalized Survival render caching to graph-only checkpoints. Statistics remain canonical payload models instead of duplicated serialized DOM, preventing table-model degradation in two-tab reopen/recovery.
- Strengthened persistence readiness and added focused inactive-payload and Scatter color-scheme/AG Grid ownership regressions.

## 2026-08-01 — Component-owned render-cache provenance enforcement

- Validate newly captured version-2 render caches before any shared presentation normalization, rejecting missing, wrong-owner, wrong-component, incomplete, or conflicting provenance instead of relabelling it with the active tab.
- Standardized all eleven graph components to emit owner-resolved `version`, `component`/`type`, `tabId`, and semantic `complete` metadata from their capture hooks.
- Added one shared `renderCacheSchema` authority used by session persistence and archive construction, removing duplicated owner/component parsing and preserving legacy archive compatibility only on reopen/save paths.
- Removed the remaining mounted-DOM archive fallback so Save and recovery can include only exact component-owned checkpoints.
- Added rollback-only restoration for DOM detached by a rejected capture; the temporary corrected view is never stored and the component-produced cache is never mutated.
- Added schema, capture-provenance, prior-checkpoint preservation, conflicting-alias, and non-mutating normalization regressions.

## 2026-07-31 — Testing infrastructure audit and refactor design

- Audited the complete Jest and Playwright infrastructure, including 330 test sources, setup harnesses, component matrices, persistence/recovery coverage, runners, discovery rules, fixed waits, source-text contracts, and validation gates.
- Added an evidence-based testing infrastructure refactor plan, a detailed audit, and a machine-readable per-file inventory under `docs/development/`.
- Recorded the migration as an actionable backlog item while keeping the plan explicitly temporary and subordinate to `issues.txt`.

## 2026-07-31 — Venn test-suite normalization and checkpoint regression cleanup

- Replaced the legacy `venn.additionalTabOpen.test.js` grab-bag with focused runtime-ownership, GO/STRING ownership, and render-cache/recovery suites built on one shared full-app harness.
- Removed Venn-only duplicates of shared tab-switch, clean-default, and component-binding contracts; those behaviors remain covered by the all-component isolation suites and persistence matrix.
- Corrected stale checkpoint tests to require invalid archive caches to be discarded, recovery to use the same rich cache policy as manual Save, and mocked active tabs to be the canonical workspace tab object.
- Removed the Jest dependency on native `structuredClone` from archive tests.
- Fixed graph-sizing projection so an explicit finite payload bound can replace an unlimited default-layout bound, while omitted payload bound policy continues to preserve the layout default.

## 2026-07-31 — Final render-cache lifecycle cleanup and full-component parity matrix

- Removed the generic mounted-DOM archive-cache fallback; manual Save and recovery now serialize only exact component-owned checkpoints with matching owner, component, payload, and layout provenance.
- Consolidated runtime render-cache envelope installation and made finite/unlimited graph-sizing merges symmetric.
- Standardized Venn and ROC cache metadata on the shared version-2 component contract.
- Refactored the persistence browser matrix around reusable archive/hydration assertions: every component retains focused one-tab and same-component two-tab Save/reopen coverage, while one mixed document now verifies two tabs per component across both Save/reopen and recovery.
- Reduced diagnostic attachments by omitting archive base64 payloads while preserving archive size, provenance, signatures, and event traces.
- Added regressions proving archive construction cannot manufacture caches from mounted DOM and finite graph bounds can replace previously unlimited bounds.

## 2026-07-31 — Recovery parity test explicitly verifies runtime rehoming

- Strengthened the owner-neutral recovery layout comparison with independent assertions that each recovered layout's tab ID, workspace ID, resizer scope, cache owner, and runtime owner all match the newly allocated runtime tab.
- This keeps legitimate ID rebasing out of durable-layout equality while ensuring the normalization cannot hide a missed or cross-tab rehome.

## 2026-07-31 — Recovery cache contract test uses owner-neutral layout comparison

- Corrected the render-cache recovery parity test to compare canonical layout content after normalizing runtime workspace IDs.
- Retained raw runtime layout signatures in diagnostic attachments and continued to verify cache owner identity separately.
- This prevents legitimate recovery rehoming (for example `workspace-2` to `workspace-5`) from being reported as layout-state corruption.

## 2026-07-31 — Venn/ROC semantic cache publication fix

- Replaced geometry-dependent Venn and ROC publication checks with renderer-owned semantic trace/series markers, so completed graphs remain cacheable during deactivation and under zero-geometry test DOMs.
- Corrected the render-cache persistence fixture for ROC to vary a score column while preserving the binary classification label column.
- Stabilized focused Venn/ROC cache tests by awaiting the components' asynchronous draw/readiness contracts before direct capture.

## 2026-07-31 — Component render-cache contract normalization

- Gave Venn and ROC component-owned published-graph checks and complete owner/type cache metadata so save/recovery capture no longer depends on generic workspace DOM heuristics.
- Made ROC cache graph-only and rebuild its statistics surface from durable owner state after hydration; restored ROC curve interaction listeners explicitly instead of serializing dead stats/control DOM.
- Made Scatter cache eligibility projection-free by removing presentation-state and active-module checks from validation; DOM mutation remains guarded in restore.
- Added focused Venn, Scatter, and ROC cache completeness, tab-provenance, inactive-validation, and graph-only statistics restoration coverage.

## 2026-07-31 — Canonical layout authority and recovery checkpoint stability

- Stopped persistence from merging payload graph-sizing metadata back over an exact owner-captured layout; `meta.graphSizing` remains a one-way compatibility mirror.
- Preserved a clean restored tab's canonical layout and exact cache checkpoint across ordinary tab deactivation instead of recapturing normalized DOM defaults.
- Added explicit unlimited-height persistence and synchronized the projected CSS aspect ratio with the canonical graph dimensions.
- Treat the consumed recovery archive as current after restoration, preventing the delayed `recovery-restored` checkpoint from rewriting payload/layout and clearing successfully restored caches.
- Recorded the remaining hard-crash durability window created by the 2.5-second trailing recovery debounce.

## 2026-07-31 — Save/recovery cache and canonical-state parity

- Removed the hidden idle/high-fidelity recovery split. Crash recovery now persists the same exact owner-scoped completed render-cache checkpoints as manual Save.
- Separated cache capture from cache inclusion and reuse an already-exact active checkpoint instead of recapturing it on every recovery write.
- Removed the volatile Box descriptive-table timestamp from canonical payload state.
- Stopped Survival payload hydration and payload reads from replacing durable statistics-panel models with a different DOM-shell representation.
- Added focused Box/Survival crash-recovery cache parity coverage alongside updated snapshot-policy and session checkpoint contracts.

## 2026-07-30 — Durable render-cache checkpoint tier

- Separated bounded warm runtime caches from archive-ready cache checkpoints: every successful owner-scoped capture now stores an exact serialized cache before runtime pruning.
- Warm-cache limits can no longer make a completed inactive tab disappear from manual Save or crash recovery; payload/layout changes still invalidate both cache tiers.
- Tightened the deactivation helper contract and added a four-tab regression proving that a pruned runtime cache remains recoverable from its owner-scoped archive checkpoint.
- Enforced embedded component provenance during save and restore, and discard invalid archive cache objects instead of retaining unusable cache payloads with null signatures.

## 2026-07-30 — Owner-complete render-cache checkpoints

- Capture each completed graph cache while its owner is still active during tab deactivation, so manual save and crash recovery can serialize inactive tabs without reading another tab's projection.
- Removed stale-cache relabeling after payload changes; changed payload now invalidates the exact render provenance until the next completed owner-scoped capture.
- Removed archive-only payload/layout enrichment. Checkpoints now clone the already committed canonical tab state, keeping cache signatures and archived geometry in the same render commit.
- Updated persistence unit contracts to reject stale cache preservation and to assert that archive construction does not mutate or re-normalize canonical state.

## 2026-07-30 — Render-cache matrix fixture correction

- Fixed the render-cache persistence fixture so canonical numeric variants are created correctly in matrix-style payloads whose data cells are primitive array elements.

## 2026-07-30 — Render-cache persistence diagnostics follow-up

- Count archive-backed live-DOM reuse as a structured hydration hit.
- Build cache persistence fixtures through canonical data edits and the shared resizer API instead of unsupported test-only layout fields.
## 2026-07-30 — Render-cache save/reopen contract diagnostics

- Added one shared owner-scoped render-cache diagnostic event stream covering capture, archive provenance, runtime rehoming, eligibility, component validation, hydration hits, visual rejection, and fallback redraws.
- Added separate save-phase and reopen-phase assertions so failures identify whether a cache was omitted/corrupted during archive creation or rejected/missed during reopening.
- Added a component matrix covering one tab, two same-component tabs with distinct payload/layout/statistics variants, and one mixed archive with two tabs for every component.
- Cache-contract tests now fail on fallback redraws for unchanged archives instead of accepting eventual graph publication.

## 2026-07-30 — Robust Box recovery publication validation

- Fixed a false-negative Box publication check that could roll back an otherwise successful multi-tab crash recovery after a forced payload redraw.
- Box recovery now recognizes semantic box/bar/individual-value graph marks while still rejecting pending or unpainted raster frames.
- Enabled readback-optimized Canvas2D measurement for significance-label ink scans.
- Added contract coverage for the publication validator and canvas context.

## 2026-07-30 — Regression contract cleanup

- Replaced stale global-DOM and pre-reopen tab-id assumptions in Box, Venn, and lock-ratio browser regressions with owner-scoped session and restored-tab resolution.
- Reframed resize assertions around semantic axis geometry instead of incidental SVG viewport offsets or outer-box proportions.
- Removed loading-spinner implementation assumptions while retaining Heatmap job-state, progress, responsiveness, and exact-clustering checks.
- Made forced-ratio resize undo coverage wait for the settled subtype contract before deciding whether a component is user-unlockable.

## 2026-07-30 — Bounded multi-workspace recovery activation

- Defined document restore completion by publication of the active owner graph instead of misusing snapshot-idle readiness during activation.
- Prevented recovery/open transactions from waiting on owner-scoped queued layout or statistics work that can remain pending behind the restore gate.
- Added recovery-contract coverage for cache-backed activation and archives containing two distinct tabs for every component, including different data and statistical options.
- Marked Box significance-label measurement canvases as readback-oriented to avoid repeated Canvas2D readback penalties.

## 2026-07-30 — Smooth Line 3D live rotation

- Kept Line's mounted 3D SVG as the live rotation surface so pointer capture remains uninterrupted.
- Suppressed cooperative rendering yields only for the bounded, view-only rotation frame, preventing the reused SVG from being painted between clear and rebuild.
- Removed detached-SVG rotation staging because SVG geometry measurement on an unmounted frame collapsed its viewport to the padding-only fallback.
- Extended the Line/Scatter browser regression to require non-empty marks and a valid measurable viewport in every sampled animation frame.

## 2026-07-30 — Smooth Line 3D rotation publication

- Line 3D rotation now renders each replacement frame off-DOM and atomically transfers it into the still-mounted owner SVG, preserving pointer capture without exposing a cleared intermediate frame.
- A final normal atomic publication after pointer release restores the full interaction bindings without changing the saved tab-owned rotation state.
- Expanded Line/Scatter 3D rotation coverage to sample painted animation frames and fail if graph marks disappear during a drag.

## 2026-07-30 — Small-viewport layout stability
- Fixed Line 3D rotation being interrupted after each small pointer movement by reusing the mounted owner-scoped SVG during rotation redraws, matching Scatter behavior; expanded 3D rotation tests to require continuous full-distance drags and stable SVG identity.

- Stopped `ResizeObserver` panel synchronization from forcing graph redraws when shared panel geometry did not change, eliminating the ROC redraw loop and page blinking on narrow/mobile viewports.
- Preserved reporting-panel and nested technical-record disclosure state across statistics re-render, tab capture, and restore, so Surface reporting sections no longer close after opening on constrained screens.
- Added shared unit coverage and a Chromium small-viewport regression for ROC settling and Surface disclosure stability.

## 2026-07-29 — Atomic graph publication

- Line, Histogram, ROC, Survival, Pie, and stacked-bar now build replacement SVG frames invisibly, finalize their viewport, and swap them into view in one step.
- Added one shared owner-aware frame-publication contract instead of component-specific staging copies.
- Cancelled or stale draws discard only the unpublished replacement and retain the last valid graph.
- Added focused publication, cancellation, live-resize, 3D-aspect, and tab-isolation coverage across the migrated renderers.

## 2026-07-29 — Owner-scoped draw completion

- PCA payload hydration now projects view mode silently instead of firing user control callbacks.
- Line, ROC, and Survival publish owner-scoped settled draw events; ROC and Survival public draws can be awaited directly.
- Replaced timer-based Line overlay, ROC statistics, and Survival Cox assertions with settled-render checks.

## 2026-07-29 — Flicker-free live graph styling

- Histogram, ROC, Survival, Line, and stacked-bar axis, grid, and trace style edits now update the committed SVG directly instead of starting a full redraw.
- Added one shared owner-scoped visual projection contract with resize-aware stroke scaling and stale-tab rejection.
- Cooperative cancellation remains unchanged for structural and data renders.
- Added unit and browser regressions for live publication, persistence, undo, and same-component tab isolation.

## 2026-07-29 — Canonical Line legends

- Line legends now show a short series line crossing the centered marker in 2D, 3D, and exported SVGs.
- Legend symbols inherit the rendered series line and marker styles through the shared legend renderer.

## 2026-07-29 — Histogram graph options and trace rendering

- Moved Histogram's legend toggle into the shared graph-options menu.
- Added global and per-series Trace transparency with tab-isolated archive persistence.
- Rebuilt histogram traces as one compound fill and one joint border per series; empty bins emit no baseline, adjacent bars share one separator up to the taller bar, and group-level transparency prevents doubled alpha at joins.

## 2026-07-29 — Smooth live graph resizing

- Restored uninterrupted live redraws for Histogram, ROC, Survival, Line, and stacked-bar graphs.
- Shared cooperative draw checkpoints no longer yield a blank painted frame during active resize phases; cancellation and normal long-render yielding remain intact.
- Added a cross-component browser regression using Scatter as the smooth-resize reference.

## 2026-07-29 — Histogram axis and multi-series layout

- Histogram X-min now defaults to Auto in the UI, session, payload, hydration, and renderer, so negative observations remain visible.
- Automatic density-domain padding now covers both X bounds; explicit manual limits remain exact.
- Multi-series legends now use the same fixed base viewport contract as ROC and Survival, preserving uniform graph and font scaling.
- Removed Histogram's duplicate legend minimum-width authority, which reduced the entire rendered graph when extra series were present.

## 2026-07-29 — E2E server URL parsing

- Replaced the deprecated Node URL parser in the local Playwright server.

## 2026-07-29 — PCA RNA-seq filtered data view

- RNA-seq normalized log preprocessing now creates a persisted AG Grid DataView containing the filtered, normalized genes.
- Moved the transformation math into the shared replayable data-transform contract.

## 2026-07-28 — Full test runner

- Added one PowerShell command for the complete Jest and Chromium Playwright suites.
- Failures are retried serially and summarized with errors and raw-log paths.

## 2026-07-28 — Cross-component statistics validation

- Fixed PCA statistics redraw metadata ownership, ARIMA forecast variance, and through-origin regression metrics.
- Standardized logistic error metrics and strict log-normal/exponential support validation.
- Corrected the ROC DeLong oracle quantile and replaced non-estimable logistic fixtures.
- Made all Python oracle dependencies explicit and capability-checked.
- All 35 cross-component statistics tests now pass.

## 2026-07-28 — Cross-component persistence matrix

- Added one browser matrix that discovers scalar graph parameters in every component and verifies hydration, manual archive reopen, and crash recovery.
- Safe fields are changed to non-default sentinels; remaining scalar fields are checked for exact round-trip preservation, with structured modes explicitly classified.
- Fixed shared Notes projection so programmatic text/open restoration cannot emit user callbacks and overwrite canonical session state.

## 2026-07-28 — Pie goodness-of-fit statistics

- Removed a copied contingency-table loop that referenced undefined dimensions in Pie goodness-of-fit calculations.
- Pearson chi-square and G statistics are now computed from the category vectors, and Cohen's w consistently uses the Pearson statistic.
- Updated the existing oracle regression to assert the correct goodness-of-fit effect-size contract.

## 2026-07-28 — Effective axis tick intervals

- Axis toolbars now show the rendered automatic X/Y tick interval, so spinner changes start from the visible value and increment by ±1.
- Box value-axis tick settings now follow the data axis across repeated flips and preserve decimal intervals in payloads.
- Pie stacked-axis edits now commit directly to their owning tab, so changing tick length preserves a manual tick interval.
- Scatter, Line, Histogram, and UpSet tick lengths now survive file reopen and crash recovery.

## 2026-07-28 — Active-tab AG Grid paste routing

- Paste now targets the highlighted cell in the visible AG Grid owned by the active workspace tab, even when tab creation or switching leaves DOM focus on the tab bar.
- Replaced competing per-grid document paste listeners with one owner-aware shared router; editable controls retain native paste behavior.
- Added new-tab, same-component switch, and cross-tab isolation regressions.

## 2026-07-28 — AG Grid numeric re-editing

- Plain numeric cells now reopen from the owning raw table matrix instead of a stale formula cache.
- Added shared lifecycle and browser regressions for edit, blur, double-click re-edit, and unchanged Enter commit.

## 2026-07-28 — Unified heavy tab previews

- Lightweight previews remain SVG; oversized or canvas-backed graphs now become one native-size, 1× PNG through the shared exporter. Download/Save remains 2×.
- Removed Box, Scatter, and Heatmap preview-only SVG/canvas composition and sampling paths.
- PNG completion is tab-, payload-, layout-, and generation-scoped. Stale work is rejected.
- Save, recovery, and reopen now persist and reuse the completed PNG, and checkpoints wait for pending conversion instead of archiving placeholders.

## 2026-07-28 — Responsive Heatmap data adjustments

- Moved Adjust data and Filter rows matrix materialization to a latest-only, tab-owned worker after the initiating control has painted.
- Coalesced rapid threshold changes, cancelled stale work on tab deactivation, and removed the duplicate pre-materialization redraw.
- Reduced full-matrix allocations and scans during parsing, filtering, empty-column pruning, and row normalization.
- Added worker parity tests and a browser responsiveness regression using an 8,000 × 12 matrix.

## 2026-07-28 — Heatmap render transaction and document-open completion

- Fixed the actual cause of Heatmap reopening/recovery never completing: label-clearance reflow recursively rendered a complete replacement frame, then the superseded outer render's `finally` block marked that frame incomplete. Heatmap now transfers render ownership explicitly during reflow so only the current transaction may publish or invalidate the graph.
- Normalized the workspace contract to call Heatmap's owner-scoped draw cycle directly and await its real result. The main registry no longer wraps Heatmap in a second detached frame scheduler.
- Normalized live graph publication to the shared primary-data-mark validator used by sibling components. Heatmap's stricter atomic completion and matrix-dimension checks remain confined to render-cache capture/restoration, where partial frames must be rejected.
- Added owner-scoped draw-cycle state so completion, cancellation, loading state, and snapshot readiness can only be settled by the current tab's current draw.
- Added unit coverage for nested render handoff and live/cache publication separation, and strengthened reopen/recovery browser coverage to require a committed frame, canonical graph publication, completed session application, and a cleared document overlay.

## 2026-07-27 — Export and axis refinements

- Exported dotted reference lines are now retained as one dedicated SVG subgroup per line, so a first Inkscape ungroup keeps each dotted line selectable as a single logical object.
- Fixed major tick-length defaults across axis-enabled components: an unset tab-owned value is no longer coerced from `null` to `0`, so new and legacy graphs retain their normal nonzero publication-style tick length until the user explicitly sets a custom value.
- Fixed Box axis font persistence across axis flipping: categorical x-axis labels, numeric y-axis labels, and the y-axis title now retain their saved semantic font styles after moving to the opposite physical axis.

## 2026-07-27 — AG Grid column sizing persistence

- Fixed major tick-length regressions across Cartesian components: Scatter now passes resolved X/Y tick lengths into its extracted axes renderer, and persisted unset values are normalized without `Number(null) -> 0`, restoring the canonical nonzero default in Line, Histogram, PCA, stacked Pie, ROC, Survival, Scatter, and UpSet axes.
- Normalized X/Y axis toolbar layout so every item uses its intrinsic widest label/control width with one consistent inter-item gap; renamed axis labels to sentence case, including “Tick length”.

- Auto-sizing a fully selected table now covers every titled column, including virtualized off-screen columns.
- Manual and automatic column widths now persist per tab through save, reopen, autosave, and crash recovery.

## 2026-07-27 — Atomic, interruption-safe document opening

- Replaced visible post-load tab activation and cache warming with lazy hydration: only the archive's saved active tab is restored during open.
- Added one full-application opening transaction with clear file-aware progress, accessible busy state, and locked tab/add/close/drag interactions.
- Session replacement now stages non-colliding tab owners, commits only after active-workspace readiness, and rolls back the prior tabs and file metadata on failure.
- Failed opens keep the current document intact and present concise recovery actions instead of console-only feedback.
- Removed obsolete warmup APIs, delays, overlay wording, and test waits; save/recovery snapshots reuse valid caches without navigating inactive tabs.
- Normalized save/recovery snapshot intent flags so the persistence contract and its tests use one explicit shape.
- Made the restored active tab’s side delimiters explicit CSS borders and projected the preceding-tab separator class directly, avoiding stale shadow/`:has()` painting after the opening lock clears.
- ROC hydration now suppresses initialization, payload, and resize redraws when a valid saved render cache is restored.
- Resizable graphs now ignore the ResizeObserver's unchanged first measurement, preventing false post-restore redraws across components.
- Added a mixed Scatter/Box/ROC archive regression proving Box and ROC reuse their saved graph caches without fallback redraws.

## 2026-07-27 — Explicit ROC classification setup

- ROC and precision–recall analyses now use an explicit positive class and global score direction.
- All curve, cutoff, inference, resampling, and comparison paths consume canonical higher-is-positive analysis pairs while retaining original-scale cutoff reporting.
- Classification settings persist per tab and are included in reports and cache signatures; low AUC values now warn without automatic reversal.
- Positive-class and score-direction controls now commit on `input` before recovery capture, and class options use stable typed identities so session projection cannot reinterpret class 0 as class 1.
- ROC statistics are now committed from the completed owner-scoped draw instead of being reconstructed from visible DOM during save, tab switching, reopen, or recovery.
- Draw generations and snapshot readiness prevent an older ROC/PR calculation from publishing or persisting statistics after a newer settings change.
- Every analysis-setting change invalidates its prior statistics model before payload persistence, and restored models are validated against the exact included analysis matrix.
- Removed ROC's duplicate activation-time runtime replay, which could overwrite the newly hydrated owner session with an older statistics snapshot.

## 2026-07-27 — Palette matching for custom dataset colors

- Named palette selection now offers a compact, contextual choice when custom dataset colors exist.
- The recommended action maps custom colors to distinct perceptually nearest colors in the selected palette; full replacement remains available.
- Equal-colored datasets are matched as one visual group, even when one occurrence coincides with its old positional palette default.
- Box Unified point colors now retain their global and indexed override precedence during the immediate palette projection, matching the subsequent full renderer.
- Palette matching, replacement, and exact restoration remain single owner-scoped undo actions.

## 2026-07-27 — Heatmap recovery redraw

- Invalid or missing Heatmap render caches now trigger one owner-scoped redraw from the authoritative payload after hydration settles.
- Recovery awaits graph publication, including heavy canvas Heatmaps, instead of leaving a blank graph.
- Restore hydration suppresses automatic component draws, preventing duplicate Heatmap work and removing the 12-second readiness timeout before fallback redraw.
- Heavy Heatmap recovery now persists the completed render model, validates it against the full processed matrix, reuses its clustering during the single fallback repaint, and keeps the loading spinner visible until publication.
- Recovery redraws now use the standard owner-scoped scheduler and lifecycle transaction; duplicate overlay and timer-based suppression paths were removed.

## 2026-07-24 — Cross-component statistical standards overhaul

- Preserved missing/invalid p-values through multiplicity adjustment instead of converting failures to significance.
- Replaced the ad hoc finite-df studentized-range scaling and corrected Games–Howell standardization.
- Renamed approximation-based Box procedures and the MAD/BH outlier screen to match their actual calculations.
- Enforced coherent expected totals and corrected effect-size definitions in Pie statistics.
- Removed silent PCA method fallback and restricted Kaiser selection to standardized PCA.
- Rejected invalid Cox covariates and removed silent first-20,000-row truncation.
- Added Holm adjustment to Venn overlap-enrichment families.
- Replaced binary logistic regression with a validated-likelihood IRLS/Newton workflow and disabled invalid Gaussian grouped-logistic comparisons.
- Fixed owner-scoped frame debouncing silently dropping a current Heatmap draw when payload commit or lifecycle invalidation advanced the async generation between the overlay frame and the render frame. Heatmap now requeues the latest pending draw only while its owner tab remains active, preserving cancellation on tab disposal while allowing the first heavy paste to render without a tab switch.
- Fixed first heavy Heatmap paste rendering: owner-scoped overlay paint frames now report lifecycle invalidation and Heatmap requeues the still-current draw instead of silently losing it until a tab switch.
- Fixed the first large Heatmap paste being lost or left permanently behind the loading overlay when a table-import projection transaction was still pending. Shared paste handling now cancels the stale projection, commits the custom and native AG Grid paste paths through one owner-payload transaction, schedules one final heavy draw, and preserves the pasted matrix across tab switches.
- Fixed native AG Grid paste transactions so thousands of per-cell change events are committed as one payload update, one undo step, one filter refresh, and one graph schedule. This prevents heavy Heatmap paste draws from being repeatedly invalidated after the loading overlay appears.
- Fixed AG Grid clipboard marquee ownership for full-table, row, and column copy/cut selections by emitting the adapter's canonical `{ from, to }` range shape; the previous header-selection builders produced an incompatible range schema that was discarded before rendering.
- Heatmap now forwards shared table scheduling metadata unchanged, so heavy pastes retain `forceOverlay`/`heavy` flags and paint the cancellable loading overlay before drawing.
- Removed Scatter's call to the nonexistent `chartStyle.clearSvg` API; excluded-axis redraws now clear their owned plot container directly.
- Completed a professional cleanup of Heatmap's owner-sensitive rendering stack after the mixed canvas/SVG work: removed the duplicate SVG-number formatter and dead transform helper, separated compact on-screen coordinates from high-precision export coordinates, extracted deterministic label/layout/cell-value geometry helpers, and removed redundant projection and payload-session lookups.
- Normalized Heatmap lifecycle ownership: font/resize observers and live-resize frame work are now tab-scoped, are torn down only for their owning root, are reattached on activation, and are cleared together with hidden draws and resize markers on deactivation. Closing a Heatmap tab now releases its session, listeners, worker records, and toolbar activation state.
- Split Heatmap preview and export projection preparation so SVG export no longer performs discarded preview bitmap work, made render-model cloning explicit across owner boundaries, and added regression coverage for model isolation, deterministic logical geometry, session disposal, compact dendrogram coordinates, and existing heavy-render behavior.


- Reduced heavy Heatmap tab-preview payloads without weakening the shared preview size guard: preview-only matrix, dense-label and dendrogram rasters now use compact WebP encoding with PNG fallback, and SVG preview images store the bitmap URL only once instead of duplicating it in both `href` and `xlink:href`.
- Fixed heavy Heatmap tab previews being downgraded to the large-dataset placeholder because the shared preview pipeline recognized HTML `img` bitmap markers but not SVG `image` markers. Verified bitmap-backed previews now bypass the vector SVG character budget after canvas downsampling, while ordinary oversized vector previews retain the existing limit.
- Fixed Heatmap activation/capture crashes caused by treating the tab-owned notes controller as a DOM Node during root-membership checks. Ownership validation now resolves controller roots before calling `Node.contains`, preventing cascading workspace binding, payload persistence, and async draw failures.

## 2026-07-23 - Heatmap activation binding recursion fix

- Removed DOM projection as a side effect of `bindHeatmapSessionForTab`; session ownership and visible-DOM projection are separate lifecycle steps again.
- Passive same-component Heatmap activation now binds the target root and table manager before projecting durable controls.
- Prevented partial Heatmap initialization from throwing through `workspaceTabs.ensureActiveDomBindings` and `bindPerTabRootIfNeeded`.
# Changelog

All notable changes to this project should be documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning.

## [Unreleased]

### Fixed
- Fixed Venn two-tab cache omission and post-recovery cache invalidation. Snapshot readiness now tracks owner-scoped draw and analysis work, cancels delayed automatic species detection before capture, suppresses redundant GO/STRING/species reruns for restored input baselines, and clears async tokens on every completion/cancellation path. The Venn persistence fixture now mutates list data rather than derived count fields, and direct cache-transfer tests assert the intentionally empty live stage between capture and restore.
- Crash recovery now validates publication against each component's primary graph surface and component-owned data marks instead of accepting axes, grids, or unrelated SVG/canvas content elsewhere in the workspace. PCA, Pie, ROC, Survival, Surface, Venn, Line, and Histogram therefore fall back to their authoritative payload draw when a lean recovery has no usable graph cache, matching Scatter's existing behavior.
- Component ensure and activation no longer permit a passive restore bind to mark an uninitialized component as ready. Full owner-scoped table/layout/scheduler initialization now occurs under the shared draw-suppression transaction, fixing Venn recovery states where the graph stayed blank and resize redraw requests had no scheduler.
- Flipped Box/Distribution charts now position categorical labels, ticks, points, and drag targets from the same canonical band-layout centers, eliminating the cumulative label-to-point offset caused by ignoring inter-category gaps.
- Fixed heavy Heatmap paste rendering being stranded behind the loading-wheel hand-off. Heatmap now treats the overlay as a passive visual layer and sends the committed paste directly to its single owner-scoped draw frame, removing the redundant overlay animation-frame gate that could prevent the renderer from ever starting.
- AG Grid clipboard marquees now use the visible selection perimeter for ordinary ranges, full-table selections, and row/column-header selections, including virtualized or scrolled endpoints. Contiguous header selections are coalesced into one marching outline instead of fragmented per-row or per-column borders.
- Large clipboard pastes now mark their shared table redraw request as heavy before component scheduling, so owner-scoped graph overlays paint before expensive rendering starts instead of appearing only for file imports.
- Box bar charts now keep the categorical axis at the lower value-axis boundary while every bar still starts at zero. Linear bar plots that cross zero render the same dotted zero reference used by the other distribution graphs. One-sided error bars now extend away from zero for negative as well as positive means, including stacked bars, and automatic limits include the displayed directional interval.
- Shared AG Grid analysis now ignores titled columns with no body data, preserves those table edits without invalidating graph caches, and schedules one redraw only when a mutation changes the effective analysis matrix. PCA no longer maintains a competing local table scheduler.
- Double-clicking one header separator now auto-sizes every data column when the complete column set is selected, including pinned first-row content.
- Data exclusions now persist across Raw and shape-compatible derived Data Views. Schema-changing analytical views retain isolated exclusion state so positional exclusions cannot leak into correlation or frequency tables.
- AG Grid copy, cut, and delete now support contiguous and non-contiguous multi-row header selections in current display order, including sorted tables. Adapter-owned row/column header selections are no longer overwritten by AG Grid selection-change callbacks that report no replacement cell range. Ctrl/Cmd+C and Ctrl/Cmd+X are routed by the table's logical selection owner when AG Grid moves DOM focus after modifier-click row selection; routing remains active-tab scoped, stops after outside interaction, and starts Clipboard API access synchronously within the keyboard event.
- Recovery checkpoints now use a 2.5-second trailing debounce with a 10-second maximum deferral during continuous editing. Periodic recovery no longer bypasses a pending debounce. Archive serialization remains worker-backed; owner/session capture stays on the owner-aware main thread.
- Heatmap dendrogram rendering now builds complete three-segment merges for both orientations, computes geometry iteratively, normalizes non-monotonic linkage heights only in display geometry, and unions overlapping collinear segments before emitting one precision-preserving SVG path. Column branches no longer terminate at the merge midpoint, and dense row dendrograms no longer darken through repeated overdraw.
- Heavy Data-values Heatmaps now publish a bounded pixel-aware live label projection while retaining the complete owner-scoped render model. Explicit export reconstructs every row and column label with the live aspect-correction transform, so on-screen responsiveness no longer trades away export fidelity.
- Heatmap rendering now yields through the owner-scoped graph execution context after worker clustering and before live DOM publication. Stop/retry can therefore cancel the post-worker render phase instead of waiting for a monolithic dense-label commit.
- Heavy Heatmap tab previews now rasterize only the matrix canvas. Row labels, column labels, color scales, and dendrograms remain sampled vector overlays; preview interaction rectangles and ownership markers are stripped without removing dendrogram geometry, compact SVG path commands are parsed correctly, and thumbnail label density is capped to prevent black overdraw bands.
- Updated the Heatmap vector-export regression to validate the canonical fill-bucket path representation through `data-heatmap-vector-cell-count`; the previous assertion incorrectly required one `<rect>` per cell after the exporter had deliberately compacted cells into paths.

### Added
- Shared graph-options toggles for graph-title and contextually relevant axis-title visibility across all graph types, persisted per tab and through `.graph` reopen. Empty title edits now hide reversibly without erasing text or formatting.
- Publication governance files: `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`.
- CI workflow for Jest unit tests on push/PR.
- GitHub Pages build and deployment workflow for the static web app.
- Publication-readiness scripts for validating runtime references and building `_site/`.

### Changed
- Lean recovery now snapshots canonical tab state without live DOM capture, defers archive normalization to the worker, rejects stale revisions, and captures render caches only after explicit Hi-Fi opt-in. Desktop recovery sends binary data without main-thread base64 conversion.
- Shared loading overlays are now owner-tab scoped, including completion after same-component tab switches.
- Test contracts updated to match current PCA auto-draw and line toolbar behavior.
- Heatmap regression tests made resilient to current correlation/data-view flow.
- Repository cleanup rules now ignore generated coverage, Playwright artifacts, temporary scratch files, and local assistant/editor settings.
- UpSet color controls now use a compact two-column layout.

### Fixed
- Heavy Data-values Heatmap previews now rebuild directly from the owning inactive tab's render-cache fragment even when optional SVG root metadata is absent. The matrix canvas is downsampled into a real preview bitmap before shared serialization, and stale "Preview simplified / Large dataset" placeholders are invalidated as soon as an owner-scoped Heatmap source is available.
- Heavy Data-values Heatmaps now keep their full mixed canvas/SVG projection strictly owner-tab scoped. Same-component activation rebinds the exact tab root, controls, grid, layout, render state, and font store before any projection work; inactive previews retain their owner token and replace stale large-dataset placeholders with a real sampled bitmap. The existing normal label-font contract is unchanged, while only normalized huge matrices derive row/column fit from their actual cell dimensions. Live resize reuses the current canvas and SVG nodes without stretching text, then performs one owner-scoped redraw on release.
- Heavy Data-values heatmaps now render only the matrix through a tab-owned canvas while retaining every SVG row/column label plus SVG dendrograms, titles, and legends. Their live scene uses bounded display geometry shared by the raster and every SVG overlay, preventing large logical row counts from displacing the color scale or dendrograms; preview-only sampling bounds unreadable thumbnail detail, and each dendrogram is emitted as one SVG path without losing branch geometry. During resize the existing mixed canvas/SVG scene scales with the resize box, then one release redraw regenerates both projections. PNG export uses complete matrix content, standard SVG export converts the matrix to compact fill-batched vector paths, rasterized SVG export embeds the exact matrix bitmap, and clipboard generation is deferred until after the browser clipboard write begins so heavy copies retain user activation.
- Font-control diagnostic traces now honor the canonical debug gate, preventing per-label console work from becoming a large-Heatmap rendering cost when ordinary debug logging is disabled.
- Structural graph/view changes now use one owner-scoped overlay request across components. The overlay appears before heavy Box, Heatmap, Scatter, Histogram, Line, PCA, Pie, Surface, and Venn redraws without forcing reusable analysis geometry to be recomputed.
- Stop/retry is now owner-tab scoped across every graph component. Long Box, Line, ROC, Histogram, Surface, Pie, Survival, and Venn draws yield cooperatively; PCA, Heatmap, Scatter, and Box workers inherit the same cancellation signal and terminate without restarting synchronous fallback work.
- Shared table analysis now reads ordinary owner data directly while preserving formulas and exclusions, avoiding repeated per-cell display projection during large graph draws.
- Large Data-values heatmaps now keep exact clustering cancellable in an owner-scoped worker, reuse the canonical render model without repeated deep clones, build unchanged SVG geometry off-DOM, and preserve visible dendrogram height and stroke thickness at every dataset size.
- Retrying a stopped graph draw now preserves one owner-scoped overlay controller, restores the wheel before work resumes, and clears it when the new draw settles; stale replaced handles cannot orphan the overlay. Scatter imports request the wheel before parsing instead of waiting for the populated-table threshold.
- Full-table imports now run as one owner-scoped transaction: canonical grid/session state commits once, intermediate graph requests are suppressed, AG Grid receives two paint frames, and only the still-active owner receives the final graph projection. Import renames and inactive completion remain owner-safe.
- Large PCA import and recovery coverage now verifies 75,440-row grid-first latency, final graph parity, canonical recovery parity, one final projection, stale-owner rejection, and same-component tab isolation.
- Large AG Grid dataset loads no longer rebuild the formula engine for plain data; formula evaluation now stays dormant until a formula is imported or entered.
- PCA point-label toggles now update only tab-owned label metadata, color schemes recolor semantic SVG paint targets in place without exposing axis hit areas, dark themes cover frames, ticks, and label leaders, and 3D rotation reuses cached analysis while leaving unchanged statistics mounted.
- Owner-tab table edits and color-scheme changes now use structural payload updates, avoiding full large-matrix clones and redundant single-view DataViews serialization.
- AG Grid full-table selection now shows a continuous top border after Ctrl+A and during copy/cut.
- AG Grid paste now preserves Excel/LibreOffice table structure, converts decimal commas to dots, and still splits plain comma-delimited CSV text into columns.
- Lock ratio is now geometry-neutral when toggled and preserves rendered x/y axis lengths across Cartesian components, including UpSet and Pie Stacked bar. ROC no longer forces a square plot. The current SVG viewport now enforces the ratio during the canonical render, including staged SVGs, with no delayed box-correction redraws. Heatmap Data values separately preserves its visible matrix ratio without axis semantics. Ratio geometry remains tab-owned and survives `.graph` reopen.
- Lock/unlock transitions now preserve the renderer's exact style baseline, and clicking a resize handle without moving it no longer starts a resize or redraws the graph.
- Component resize phases now have one draw-request owner; component-specific resize callbacks replace the former duplicate generic schedule.
- AG Grid selection outlines that include a pinned top row now scroll beneath the vertical scrollbar like normal-row selections.
- AG Grid’s top-right scrollbar gutter now matches the bottom scrollbar spacer instead of leaving an empty corner.
- Box adaptive pairwise whiskers now use a stable shared stack anchor and each endpoint's actual lower obstacles, so partial sets fill unobstructed gaps without stretching obstructed whiskers.
- Box significance asterisks are optically centered against regular `ns` labels; bracket clearance now uses visible ink bounds instead of SVG font boxes.
- Box significance labels now sit 50% closer to their corresponding bracket line in both graph orientations.
- Box significance stacks now keep about 13 px above labels, retaining compact levels while preventing label-clamped adaptive whiskers from becoming too short.
- Box significance stacks now start 13 px from the rendered data envelope, shifting the full annotation block closer to points without touching them.
- Box plot frames now expand around rendered significance lines and labels, including flipped-axis layouts.
- Box flipped adaptive significance levels now use each preceding bracket's rendered position, keeping P-value whiskers correctly shortened after wide labels shift the stack.
- Component-tab table imports now open the shared preview/options wizard immediately, with the current tab’s graph type fixed and import settings captured reliably before asynchronous parsing.
- UpSet resizing now uses tab-owned render data, atomic live frames, a coordinated two-panel layout, and collision-aware narrow-width labels, eliminating transient jumps and overlap between set names and matrix dots.
- UpSet now defaults to an unlocked ratio while preserving a user-selected ratio lock across mode changes, tabs, and archive reopen.
- Hiding graph or axis titles now preserves the user-set graph geometry and proportions across all graph types; Heatmap no longer shifts, clips column labels, or shrinks text after tab return.
- Inline title editing now keeps renderer-replaced text projections hidden, preventing Heatmap’s unchanged title from appearing behind the editor.
- Removed unreleased `.session` file support and its obsolete multi-tab JSON loader; the welcome importer no longer advertises JSON workspace files.
- Removed unused production dependency `puppeteer-core` to eliminate critical transitive vulnerability path.
- Removed obsolete generated output, duplicate/unused Prism fixtures, scratch debug files, redundant desktop icon output, and the placeholder adder test/module.

- Fixed SVG copy/download fidelity after ungrouping in Inkscape: export-time relative text offsets are resolved to user units, and round-cap zero-dash dotted lines are materialized as vector dots while retaining the top-level export group.

- Added per-axis **Major Tick Length** controls to every 2D component that exposes clickable X/Y axes (Box, Scatter, Line, PCA, ROC, Histogram, Survival, Pie stacked bars, and Venn UpSet). Values are owned by each tab's component session, persisted in `.graph` payloads, restored on reopen, and applied independently to X- and Y-axis tick geometry and label spacing.
- Major Tick Length editors now display the renderer's current nonzero default when no custom value is stored, so native up/down steppers begin from that default instead of zero while the underlying tab-owned state remains unset until the user changes it.
- Axis length controls now use a minimal top bracket around the section title, visually grouping the length value, unit, and preserve-ratio control without adding a full box.
- Axis length toolbar brackets now use square corners and terminate exactly at the compound control row edges, with no extra horizontal overhang.

- Axis-toolbar Number format dropdowns now use the canonical 26 px control height and border-box sizing, matching and vertically aligning with Thickness and adjacent action controls.

## 2026-07-30 — Render-cache persistence contract test correction

- Corrected the new render-cache persistence matrix so it compares canonical payload/layout signatures instead of unsupported test-only payload fields that component serializers intentionally discard.
- Reopen audits now detect dirtiness introduced by passive activation relative to the post-open baseline, rather than incorrectly requiring archives created from edited tabs to have no historical dirty state.
- Save and reopen phases retain separate diagnostics, while same-component and mixed-document cases now verify distinct canonical data/layout signatures and per-tab statistics selections.
- Corrected the Box font-toolbar regression assertion to use the actual visible toolbar contract instead of a nonexistent `data-open` attribute.

- Fixed render-cache loss when creating or duplicating a tab: all tab-preserving deactivation paths now use the same completed-owner persistence boundary and capture the outgoing tab's owner-scoped render cache before unmounting.
