## 2026-09-01 — Cartesian acceptance and cache provenance

- Completed the in-scope Cartesian layout acceptance gates for Box, Scatter, PCA, Line, ROC, Survival, Histogram, and stacked Pie. Verified shared planning, Lock-ratio behavior, geometry, same-component isolation, reopen/recovery, and render-cache restoration while keeping 3D, Heatmap, Venn/UpSet, and radial Pie/Donut outside the Cartesian transaction.
- Fixed a shared session boundary bug where render-equivalent payload updates changed the cache envelope signature but left embedded Cartesian provenance on the old payload signature. Cache provenance now remains exact while retaining valid geometry.
- Fixed Histogram panel drawing to receive its owner-scoped draw options explicitly, and strengthened panel tests to wait for the settled plot mode before asserting geometry.
- Fixed Box statistics worker results being discarded during owner activation before deferred results could materialize; deferred owner results now survive until their matching context is ready. Box advisor visibility is also persisted in the owner payload for archive/reopen fidelity.
- Fixed Surface archive-cache validation to accept the explicit activation target before DOM projection while continuing to reject genuinely inactive owners.

## 2026-08-28 — Cross-component statistics ownership normalization

- Extended ROC-proven owner-explicit statistics ownership to PCA, Heatmap, Histogram, Surface, Survival, Pie, Venn, Scatter, and Box while preserving each component's statistical schema and UI.
- Inactive same-component tabs no longer capture live sibling statistics DOM; durable panel models remain canonical and are restored only when the owner has a live projection.
- Heatmap, Histogram, and Surface now restore durable statistics models before considering cached stats DOM, demoting stats DOM cache to an optional optimization.
- Scatter and Box statistics computations now use dedicated per-tab async scopes that survive ordinary deactivation, validate the originating owner/context, persist inactive-owner results to that owner, and defer DOM projection until activation.
- Preserved Survival's four-panel statistics ownership and intentionally detached Cox report-host behavior; normalized Pie advisor/results ownership and Venn significance-panel ownership without force-fitting unrelated enrichment state.
- Follow-up runtime validation fixed defects exposed only after the normalization landed: Pie runtime-control hydration is now module-scoped, PCA crash-recovery redraws re-project the owner's durable scree/biplot state, Surface render-cache capture no longer mutates durable statistics before signature validation, Scatter clears its owner computation-pending flag before publishing a finished async result, and Venn analysis/tab callbacks resolve the clicked or workspace-active owner instead of a stale projected sibling.
- Hardened the new regression matrix from the same runtime evidence: deterministic worker fixtures, settled-owner parameter discovery, derived/inactive statistics classification, contextual PCA axis witnesses, and owner-panel assertions now test durable component state without treating synthetic sentinel DOM as canonical after legitimate redraws.

## Unreleased
- Added an owner-scoped canonical recovery journal so the newest user revision survives abrupt loss before the rich recovery snapshot debounce; rich previews and render caches remain off the mutation path. Certified mixed heavy-tab archive/recovery isolation and statistics persistence across all components.
- Fixed immediate crash-recovery persistence for ordinary native controls across graph types, density/mode selectors, and 2D/3D view selectors. The shared event boundary now captures after each control handler, preserves select ordering, mirrors synchronously for hard reload, and advances the durable journal from settled owner state.
- Fixed legacy locked-resize drift in UpSet by preserving the established lock target between drags and reapplying the shared axis-ratio correction after its renderer's final layout pass.
- Axis reserve/layout transaction acceptance: the fresh Windows Chromium R4 gates are green for all migrated Cartesian modes, including the complete Histogram panel suite, Box transposition/significance/reserve coverage, Survival risk-table geometry, PCA envelope behavior, same-component isolation, archive/recovery cache reuse, the broader persistence/statistics matrix, and the combined Lock-ratio/3D non-regression suite. Resolved harness assumptions and confirmed runtime causes are recorded in `issues.txt`.
- Render-cache Cartesian provenance is now explicit at the settled cache boundary: publication owner/component/generation come from the committed Cartesian frame; component currentness and publication-settled checks run before capture; then the owning tab's canonical payload/layout signatures are bound to the cache and must match exactly on restore. Optional signatures embedded in a live SVG still reject on mismatch, but their absence is not treated as stale geometry. The cache contract now exercises stacked Pie explicitly so radial Pie/Donut cannot accidentally satisfy the migrated-Pie R3 gate.
- UpSet remains outside the Cartesian transaction, but its legacy locked-resize path now preserves the established ratio target and reapplies the final rendered-axis correction; the opt-in `LOCK_RATIO_COMPONENT=venn` characterization gate is green without widening tolerance.
- Moved every primary Download/Copy row into a shared attached footer below the SVG content envelope. Axis titles, legends, significance annotations, and risk tables can no longer collide with export controls; all 11 components now share the same placement, zoom independence, border geometry, and live-menu contract.
- Unified 2D Cartesian layout reserves and Lock-ratio geometry through one owner-scoped transaction. Line, Scatter, ROC/PR, Survival, Histogram overlay/panels, stacked Pie, Box, and PCA 2D now resolve the canonical user frame, plot rectangle, measured/semantic reserves, special panel/metric constraints, rendered-axis Lock target, and outward SVG envelope before atomic publication. Labels, significance annotations, legends, risk tables, and metric overflow are derived presentation geometry rather than persisted frame authority; render caches carry owner/generation/payload/layout provenance and rehydrate that derived plan on reopen. Box no longer grows its physical frame or persists automatic reserve fields, Histogram panels publish one repeated-track axis model, PCA preserves exact 2D metric scaling, and 3D/matrix/Pie/Donut/Venn/UpSet exclusions retain their existing contracts.
- Fixed Box trace formatting leaking into associated symbols and error whiskers. Trace body paint, point fallback paint, and overlay width now remain independent through redraws; thick bar borders meet one-sided whiskers without gaps in either orientation.
- Reduced the default tick-label clearance across 2D and 3D graphs, UpSet, Heatmap scales, Surface scales, and PCA scree plots. Rotated X labels now retain the same optical tick clearance instead of moving away when their baseline turns; shared geometry preserves resize behavior and tab-owned render state.
- Fixed multi-dataset Prism and PZFX imports. Every supported data table is now discovered in document order, fully rendered before ownership moves to the next tab, imported into its own component-appropriate tab, and named from its Prism table title. The inspected first-table ID no longer suppresses the remaining batch. Singleton-condition grouped tables become single Box tables so individual sample names remain the plotted categories, while true multi-condition tables remain grouped. PZFX TwoWay and summary-XY tables now match modern Prism component routing, modern summary-XY series retain the correct mean columns, and graph metadata is matched to its owning data sheet.
- Fixed the thin gap below pinned editable AG Grid rows. Pinned records now live only in AG Grid's pinned model instead of remaining as 1 px hidden body duplicates; shared row mapping preserves editing, selection, keyboard navigation, filtering, and clipboard behavior for single- and multi-row headers.
- Made equal PCA axis lengths the default presentation. New and legacy-unspecified PCA payloads now use equal numerical spans and a square/cubic frame without rescaling coordinates; explicit saved choices remain unchanged.
- Fixed Box Single-to-Grouped example reloads. Table-format changes now write through immediately to the owning session and payload before later table reuse, and grouped header normalization stops at the meaningful dataset width instead of inventing groups in AG Grid's spare editable columns. Added exact reload plus existing tab-isolation/archive coverage.
- Fixed empty grouped-tab lifecycle handling. Restore and tab previews now distinguish persisted table structure from payloads capable of producing a graph across all components; AG Grid instances retire their APIs before destruction; Box no longer queues redundant refreshes against obsolete grids; and cancelled Box draws remove only their own staged SVG. Added unit contracts plus exact duplicate, clear, repopulate, hover-preview, and cross-component regressions.
- Fixed Heatmap row/column label font-size reporting and added distinct Row labels and Column labels toolbar scopes. Named sizes now match rendered and exported text through redraw and resize, and the legend rail reflows from the final styled label width. The shared named-collection path remains tab-owned and persistent.
- Added native Save As selection for graph image downloads. PNG, SVG, hybrid SVG, EMF, PDF, and TIFF exports now ask for the destination and filename before rendering, with equivalent browser and desktop behavior; Venn GO/STRING image exports use the same shared contract.
- Made p-value display format tab-owned across every statistics panel. Decimal/Scientific changes now persist immediately in the owning payload, survive same-component switching and archive reopen, and cannot be overwritten by stale restored panel models; Box and Survival legacy settings hydrate into the same shared contract, and Heatmap/ROC use the component-neutral change event.
- Fixed shared p-value report metadata so formatter-generated display thresholds remain distinct from explicit statistical bounds. Decimal/scientific switching now preserves underflowed zero as a valid threshold and restores representable tiny probabilities in scientific notation instead of ever producing the impossible `<0` output.
- Fixed Heatmap dendrogram thickness editing in Auto width mode. The thickness field remains editable and an explicit thickness change switches the independent width mode to Fixed, with both changes retained in undo history.
- Centered every welcome-page graph icon within its frame by normalizing each canonical SVG viewBox to the artwork's actual bounds, removing the shared upward offset, and optically balancing PCA's heavier lower-left cluster. Added all-component rendered alignment coverage.
- Corrected the cross-component persistence matrix so Line's derived `config.stats.version` freshness counter is classified like Scatter's context generation instead of being mutated as a user graph parameter. Real statistics controls and naturally produced calculation/reopen behavior remain covered.
- Fixed Venn AG Grid exclusions so cell, row, and column exclusions immediately update the graph and remain owner-scoped across Welcome switches, saves, reopen, and recovery. Venn now derives plots from the shared exclusion-aware analysis matrix while preserving raw table data and persisting the exclusion state.
- Increased the shared downloaded/saved PNG default from 192 to 300 DPI while preserving graph dimensions. Clipboard PNG wrappers use the same 300-DPI raster; TIFF and other export defaults remain unchanged.
- Fixed copied PNGs losing either physical size or resolution. Shared SVG and SVG-string copy actions now place the same high-resolution raster used by PNG downloads inside a size-preserving SVG clipboard representation, with a correctly sized PNG fallback for raster-only applications.
- Fixed copied SVGs importing oversized or stretched in Inkscape. The shared exporter now materializes the outer SVG viewport projection on the paste wrapper before serialization, so dropping the document root during clipboard import preserves the same physical size, aspect ratio, strokes, and layout as Download SVG across all components.
- Fixed Heatmap dendrogram joins and copied-SVG weight. Live compact branches now use overlap-safe square caps, while export materializes the displayed non-scaling width into separate editable horizontal and vertical strokes so Inkscape preserves the on-screen thickness under stretched SVG projection.
- Reworked Heatmap correlation layout around one measured projection contract: row and column labels now share the established column-label sizing rule, row dendrograms render left of the matrix, row labels render right, and the color scale reserves stable readable typography, thickness, ticks, title, and collision-safe spacing for both fixed and matrix-matched heights. Longer labels now reflow the legend rail automatically, graph titles default to the matrix center, and actual recovery draws use accurate lifecycle telemetry.
- Fixed left-positioned legends leaving the SVG after resize. Reused legend nodes now reapply the live rendered-edge clamp whenever their drag metrics are rebound, and the corrected owner-relative position is published back to the owning session instead of retaining an out-of-bounds pre-resize coordinate.
- Fixed draggable legends stopping at the fitted SVG `viewBox` instead of the rendered SVG border. Shared legend dragging now includes letterboxed side bands while still keeping the complete visible legend inside the SVG element; Surface can therefore reach both horizontal edges.
- Rebuilt the Surface color legend to match Heatmap's fixed-height scale: a stable 15 x 80 px gradient, five right-side ticks, and the same visible #333 1 px border. Removed obsolete Surface legend CSS that overrode the SVG renderer with a pale 0.6 px outline and stale text styling. Surface retains owner-scoped dragging, redraw persistence, and restored-cache interaction rebinding.
- Fixed the welcome page's split first paint. Its canonical cards and inline example thumbnails now render before AG Grid and the main application bootstrap, while the later workspace initialization only binds interactions; the complete welcome layout is visible in the first frame without external SVG image requests.
- Fixed Box statistics editable controls so current values write through to the owning tab session while the user edits them. Custom-pair changes now update multiplicity controls in place instead of forcing a graph redraw on blur, so the first `Calculate statistics` click is no longer consumed when moving from one pair to multiple pairs; stale statistics/significance output is invalidated immediately, and targeted Jest/Chromium regressions cover first-click calculation and owner-state write-through.
- Fixed same-component notes ownership and PCA cached-control rehydration after recovery/reopen. The shared notes lifecycle now reuses a notes control only when its DOM root and owner match the target tab; Box, Scatter, PCA, and Line now commit note edits immediately to their owning runtime state instead of relying on a transient component mirror. PCA render-cache restore additionally rebuilds and enables X/Y/Z component selectors from the restored analysis cache metadata without recomputing the dimensional reduction, so the controls remain consistent with the already-restored SVG. Shared same-type isolation coverage now exercises notes, DataViews, representative controls, archive reopen, and crash recovery using Survival's owner-scoped behavior as the reference contract.
- Refactored PCA config persistence so the owning tab session is the serialization authority instead of the transient module-level `pcaState` projection. Axis selection and the metric presentation/standardization controls now write through synchronously to the owning canonical workspace payload, preventing same-component activation from reverting PC selections during archive reopen or crash recovery; targeted regressions now assert canonical payload parity before persistence and prove owner-session serialization remains correct even with a deliberately stale projection mirror.
- Corrected the second formerly unreachable R09 large-Heatmap export assertion exposed after the cache fix reached the full 7,358 x 3 render. Exported column labels always preserve their `rotate(-90 ...)` base transform, but an aspect-correction `matrix(...)` is required only when the corresponding live column labels are actually aspect-scaled; the original test incorrectly required a matrix unconditionally. The regression now checks matrix-presence parity between the live and exported column labels while retaining full-vector export and label-count assertions.
- Corrected the large-Heatmap R09 acceptance contract after the settled Windows rerun reached the correct 7,358 x 3 `values` model but exposed a stale settings-signature assertion. The WDBC example has 40 conditions and therefore defaults `Show correlation/value text` off, while the imported matrix has two conditions and intentionally defaults it on; the committed settings signature must therefore change with the successful large-model commit. The regression now asserts that data-aware setting transition explicitly instead of requiring equality with the old example signature.
- Fixed large Data-values Heatmap cancel/retry cache coherence. The 7,358-row exact-clustering worker was already completing; the stall came from publishing candidate data/settings signatures into the committed render runtime before the matching model survived its render checkpoint. Cancelling there left the old WDBC model mislabeled as current, so Retry reused stale content. Request signatures now remain transient until model commit, model-derived value-scale state follows the same atomic boundary, and committed-model invalidation clears its signature pair together. The large-data Chromium regression now verifies committed cache identity remains unchanged through worker completion and cancellation, then advances atomically to the 7,358 x 3 model on Retry.
- Fixed shared fallback axis-length editing after Windows R06 validation exposed a nullable-offset coercion bug. Manual axis-length commits intentionally carry no wheel basis offset, but `Number(null)` was interpreted as an explicit zero and collapsed the graph basis onto the requested axis length before refinement. `axisControls` now distinguishes an absent basis offset from a valid numeric zero and preserves the measured non-axis frame offset; the latest-wins regression now asserts the exact 140 -> 155 -> 170 geometry sequence, and browser coverage now verifies manual X/Y numeric length edits preserve the pre-existing frame offset. The corrected true-burst Chromium R06 tests pass 3/3 on Windows.
- Corrected the R11 legend-envelope regression exposed by authoritative Windows Chromium validation. The first shared fix replaced the original conservative full SVG extension with `svgWidth - svgBoxWidth`; because the SVG starts inside `.svgbox` after its left border and padding, that under-reserved the shell and could leave categorical legends visibly outside the container. The shared `chartStyle` geometry change is now reverted exactly to original v25 (`rendered.extensionWidth`) rather than replaced by another speculative formula. The browser regression now asserts the actual contract—complete SVG/legend containment plus unchanged canonical plot geometry—without requiring exact shell-width equality or artificial symmetric hidden-content margins. Survival's R11 persistence change is also narrowed to legend mutations only instead of altering every scheduled control.
- Completed R06 numeric-wheel re-analysis from authoritative Windows request timestamps. The first shared production correction remains: idle commit timing starts only after RAF-coalesced live publication and closed/rebound gestures cannot be resurrected. The remaining X/Y browser failures were a stale burst simulation, not a second production race: the test awaited a complete expensive resize frame before creating each next synthetic wheel event, producing 430–680 ms live-to-live gaps against the intentional 120 ms idle boundary and therefore several valid gestures. The E2E now dispatches one contiguous raw wheel burst before yielding to rAF while retaining move-phase, one-commit, bounded-refinement, monotonic-input, undo, and owner-isolation assertions. No debounce increase or second timing workaround was added.
- Strengthened Line restore readiness after authoritative archive/recovery E2E still reported `Statistics unavailable until data is loaded.` The render-cache restore reconciliation remains, but the compute action now has an owner-scoped lazy reconciliation backstop: if transient `statsState.context` is absent when the user recalculates, Line ensures the active owner's HOT manager through the same normal activation path when necessary, rebuilds context from that owner's included-data matrix, and calculates immediately. No redraw or transient-state serialization is introduced.
- Normalized targeted Jest lifetime isolation uncovered by the Windows run. Venn tests now dispose prior owner sessions/jobs before replacing `Main`/`Components`, Survival tests tear down prior component/session globals before fresh module loading, and the axis fallback fixture mirrors a real shared resizable box. These changes address suite-lifetime/fixture pollution without weakening final restored species, payload, SVG, or refinement assertions.
- Fixed Venn same-component analysis restore across archive/runtime rehydration. Derived-region invalidation now clears `lastRegionSignature`/`lastRegionCode` together with the parsed data they describe, and each owner session carries a transient analysis-projection baseline marker so the first post-restore region draw establishes restored GO/STRING/significance/selection/background/species state instead of treating it as a user data mutation. This resolves both independent GO/STRING result-family loss and numeric `ABC` selected-region loss without serializing transient state or weakening ordinary data-change invalidation. Corrected two unrelated full-suite harness assumptions discovered during prioritization: Scatter's forced snapshot flags now use Main.session's supported `snapshotIntent`, and synthetic Surface setup explicitly commits its active owner before archive capture.
- Corrected stale statistics regressions after the shared on-graph summary update: Line's density-aware summary test now asserts the current semantic `slope = value` output rather than legacy whitespace, and Scatter's Jest isolation case now targets the actual second-tab statistics-report ownership failure with one calculation while the full Linear-vs-Exponential two-model switch/reopen workflow remains in Chromium E2E. Removed the resolved Scatter timer-settling backlog item.
- Fixed Scatter same-component statistics isolation by normalizing its passive/live-DOM binding to the Line contract: every transient control, statistics target, plot, and resizer handle is rebound as one owner-scoped projection before callbacks run. Two Scatter tabs can now calculate independent regression models (including Linear vs Exponential), render their own statistics tables and overlays, switch through render-cache reuse without cross-tab DOM refs, and preserve those results through archive reopen. Added direct same-component regression-model/panel coverage and included Scatter in the shared statistics isolation/reopen E2E contract.
- Normalized Scatter statistics persistence to the owner-first contract used by Line: successful calculations now commit the current regression model and report state directly to the owning session before redraw/snapshot persistence; runtime capture no longer reconstructs statistics from active mirrors or report DOM; failed/stale calculations cannot be marked current; and legacy report-only restores recompute the missing regression model so trend lines, CI/PI, and on-graph statistics survive reopen/recovery.
- Fixed on-graph statistics placement through the shared annotation contract. Multiline summaries are now measured and kept inside the live SVG viewport during redraws, legend changes, resizing, and dragging; Line starts in its clear lower-right region, Scatter no longer extends past the right edge, and font edits preserve the authored multiline tspan layout.
- Fixed Box worker statistics checking `Show pairwise comparisons` without publishing its lines and labels. Local and worker results now share one publication order, data-only stats refreshes preserve live graph geometry, and completion projects stored comparisons onto the latest committed owner frame before significance layout.
- Fixed legend formatting clicks being retargeted to the draggable legend container. Pointer capture now begins only after a real drag, so legend text opens the extended font toolbar while drag, tab ownership, live border updates, persisted commits, and undo remain intact. Legend text now defaults to a dedicated Legend scope. Continuous Heatmap and Surface scales retain their numeric-scale sizing and use a separate Scale scope without categorical Legend border, Style, or Transparency controls. Heatmap font changes now redraw only from the shared committed style event, eliminating the scale-font redraw loop caused by observing its own rendered attributes.
- Fixed Box feature edits causing unnecessary full redraws. Palette and theme changes now update the published graph in place, Density samples refreshes only the violin layer, payload projection cannot leak through the tab-owned draw scheduler, and geometry-changing view-only updates retain the previous frame until atomic replacement.
- Split PCA examples by table contract. Standard mode now loads all 6 subjects and 11 time points from the Indomethacin pharmacokinetics study, with PC1–PC3 retaining 96.29% of standardized profile variance; Grouped samples retains the 540-measurement mouse-protein design built for explicit group headers.
- Normalized Scatter's automatic palette around effective point formats. Unique-label and rare-label one-format data now use Grayscale without hidden per-label colors, while repeated multi-format labels use Color (high contrast); example loading, table paste/import, rendered points, point controls, and the palette picker now remain consistent.
- Fixed shared statistical-report decoration being delayed until tab reactivation. Creating any tracked component report now synchronously installs its significance threshold, p-value format toggle, and significance badges on the owning results panel; Pie exposes these controls immediately after its first calculation without relying on a tab switch.
- Added tab-owned point-label typography for Scatter and PCA. The shared font toolbar now offers Selection, Labels, and Graph scopes; individual/all-label sizes persist across reopen, feed the collision and boundary layout, preserve existing label positions during formatting, and retain dragging and connector behavior.
- Fixed Scatter and PCA point-label leaders remaining visibly detached after 3D rotation. The shared geometry now uses clearance only for placement and renders every straight connector exactly from the point boundary to the label boundary.
- Fixed Scatter 3D point labeling and recovery capture. Cached 3D point projections now receive row-label selection changes, and legend interaction rehydration accepts valid legend-free graphs without aborting live-DOM restoration.
- Set new Scatter and PCA point labels to a shared 10 pt baseline while retaining density-driven reduction and the 7 pt readability floor. Simplified Scatter's point-label context menu to one compact border with no padded outer layer or shadow.
- Fixed one-dataset Pie goodness-of-fit statistics. A single count column now uses an explicit equal-proportions null model instead of comparing the column with itself; the controls, result footnote, persisted analysis specification, and reproducibility report all identify that expectation.
- Fixed Data-values Heatmap color-scale endpoints by deriving cell colors, gradient stops, tick values, and tick positions from one canonical domain. Diverging ranges now label both symmetric endpoints, while all-negative ranges map from the negative color to zero in the correct direction; custom bounds and SVG exports use the same contract.
- Fixed empty Scatter graphs showing a blank plot. Empty axis columns now use the same shared input-table notice as other components instead of returning from the axis-availability branch after clearing the plot.
- Unified shared symbol numeric display formatting across all components: compact Fill/Shape size, Border width, and their picker fields now round to at most two decimal places while retaining full internal precision.
- Smoothed Surface resizing by publishing the same canonical 3D projection during pointer movement and release. Resize rendering no longer yields after touching visible geometry, and Surface now uses the fixed 3D viewport contract shared by Scatter, PCA, and Line, preventing half-rendered meshes, two-pass content fitting, and release-time geometry jumps.
- Refactored shared aggregate style undo around optional atomic owner snapshots. Symbol and additional-line controls can now restore heterogeneous multi-target state with one callback instead of replaying every scope; Scatter uses this path for all symbol fields, making 600-point Global shape undo/redo complete without the previous multi-second toolbar block.
- Fixed Scatter Fill/Shape edits for individual and Global scopes. Explicit point overrides now outrank unique-label uniform defaults, while Global shape uses owner-session state even when per-label shape maps are intentionally empty; both paths work in 2D and 3D.
- Refactored toolbar numeric wheel editing into owner-scoped gesture transactions: rapid wheel events now update live at most once per animation frame, respect each control's declared step/min/max/precision, and commit once after idle for a single undo transaction. Removed legacy hard-coded 0.5 px wheel deltas from shared thickness/size controls, normalized portaled picker numeric mirrors, and made Axis length use move-phase live resizing followed by one generation-guarded latest-wins refinement so stale corrections cannot reverse the resize.
- Completed the restored-graph interaction contract. Axis controls now persist serializable axis identity/bounds metadata and re-adopt cached hit targets; inline editors persist a semantic editable marker; all 11 components rebuild owner-bound graph interactions immediately after cache deserialization. Shared lifecycle validation now rejects any restored SVG that declares an axis or inline-edit interaction without a live binding, so reopen/recovery never publishes a visually restored but behaviorally dead graph. Fresh rendering and restore reuse the same component binders, including Box, Line, ROC, Survival, Histogram, stacked-bar Pie, PCA, Venn/UpSet, Scatter, Heatmap, and Surface.
- Fixed crash-recovered PCA and Line legends being clipped or collapsing the SVG container. Legend envelopes now use their canonical placement rather than a dragged position; stale pre-contract legend caches are rejected, and current caches restore live owner-scoped drag handlers without a click-triggered redraw.
- Fixed legend dragging across all components so reopened and recovered render caches rebind a shared owner-scoped drag contract before input. The first gesture now moves and persists the legend without cache invalidation or SVG redraw; Surface uses the same contract for its scale.
- Fixed same-component deactivation forwarding so owner-scoped cancellation runs before workspace switching. ROC now owns and invalidates staged frames, refreshes mismatched graph types before snapshots, restores large-dataset manual-update controls, and never archives another tab's stale ROC frame.
- Corrected the component-layout aspect-policy regression fixture so it runs with its required Line DOM rather than inheriting unrelated ROC markup.
- Fixed Heatmap tab-preview fidelity: previews now use the live rendered panel dimensions instead of stale resizer metadata, preserve Data-values proportions when rasterized, and scale non-scaling dendrogram strokes with the thumbnail rather than rendering them at full-screen weight.
- Fixed the Box Violin density/axis contract: density always uses the complete dataset and point visibility affects only the overlay. Added a persisted, tab-owned Violin extent choice; new graphs use extended KDE tails by default and expand the automatic axis before scale creation, while optional data-range truncation uses closed, fully stroked caps. Legacy files retain their historical extended-tail behavior.
- Fixed Box axis flipping after Dataset spacing changes: flip transitions now transpose the allocated plot extents, so categorical spacing is applied exactly once and both visible axis lengths preserve their proportions across repeated flips.
- Fixed shared Cartesian SVG margins so the outer 8 px gutter starts after the rightmost X-axis endpoint label; categorical axes account for their half-band inset instead of adding blanket padding.
- Fixed Box palette replacement so transparency-only style overrides remain color-neutral: overlays use the unified color in Unified mode and their dataset palette color in Individual mode.
- Added direct dragging for Scatter and PCA point labels. Dragging updates only the chosen label and its straight connector; the label becomes a tab-owned pinned obstacle, later labels optimize around it, and relative positions survive resizing, tab switches, payload save/reopen, and 3D rotation redraws. New PCA sessions now project their own defaults before DOM setup, preventing fresh same-component tabs from inheriting the previous tab's label state.
- Fixed oversized PCA graph height: shared 2D aspect fitting now preserves the canonical Y-axis span and varies or extends only the X-axis span, so PCA keeps its equal-scale default without becoming taller than sibling plots. Fixed PCA, Scatter, and Line 3D plots being shrunk by a second content-bound viewport fit.
- Refactored individual-point labels in Scatter and PCA around one bounded global layout engine: it jointly minimizes label/label, label/leader, leader/leader, and point collisions, trims leaders at their source marker, remains independent of label input order, and uses spatial indexing plus adaptive search limits for dense plots. Connectors are always single straight lines with a hard 90-degree minimum attachment angle, label boxes are strictly contained by the SVG viewport, and density scaling plateaus at a publication-readable 7 pt in 2D and 3D.
- Fixed Survival legend sizing when `Number at risk` is enabled: the shared SVG viewport fitter now keeps non-legend right-side reserves in its aspect baseline before appending the legend reserve, so toggling the legend extends the viewport without shrinking the survival plot or compounding the risk-table envelope. Added shared-unit and Chromium regressions for the combined risk-table + legend layout.
- Fixed the remaining first-drag axis-margin parity defect after render-cache restore. The shared one-axis margin stabilizer now distinguishes provisional multi-pass layout estimates from committed baselines; Box, PCA, and Survival no longer let their pre-tick-measurement margin pass seed an empty post-restore lock. Restored Box graphs therefore keep the same Y-axis and Y-title X anchor during the first horizontal resize as a continuously live graph.
- Reworked the August 9–10 E2E regression fixes from the Windows evidence: Box significance reserve now uses the existing exact two-dimensional resizer path and commits the ratio of the physical frame without changing the shared resizer contract; Histogram keeps the shared orthogonal viewport lock; Heatmap reuses completed exact clustering by processed-data/algorithm identity after render-only cancellation; Line and Scatter preserve the Y-title anchor during width-only live resize while Scatter skips non-geometric live-frame work; Surface binds and resolves only the requested owner root and preserves its committed viewport through 3D rotation; and Venn hydrates a lazy active owner from its durable payload before runtime projection so GO/STRING results survive reopen. The only assertion adjustment remains the stale UpSet pixel-only font check, now coupled to the actual SVG font-size change, while the Surface recovery test waits for the owner rotation transaction to settle before applying the unchanged strict fit assertion.
- Fixed Scatter 3D redraws to carry the explicit owner tab into font-style resolution, preventing style and tab-return redraws from aborting the owner draw cycle.
- Hid the Survival legend by default when creating a new graph because the default number-at-risk table already identifies each group; saved and legacy graphs retain their recorded or historical legend state.
- Fixed Survival series-color edits so curves, confidence bands, censor marks, risk-table text, and legend swatches update from one owner-session value immediately and remain consistent in crash-recovery render caches.
- Refined Survival number-at-risk figures to publication-style `at risk (cumulative censored)` rows, group-colored values, a regular-weight title, a measured balanced separator, and axis-label-matched typography while preserving colors during partial font edits, tick alignment, and SVG export.

- Audited and normalized the new on-graph statistical display system end-to-end: annotation typography/geometry now share one stateless renderer, affected components import/export font styles with explicit tab ownership, async draw completion persists to the draw owner rather than the projected tab, Match Styles covers the new visibility/risk-table controls, legacy archives preserve pre-feature visual semantics, ROC reuses one AUC analysis per curve, and focused regressions cover restored defaults, effect-size labeling, risk-table typography, relative positioning, and concise multi-series summaries.
- Fixed graph statistical-summary typography across Scatter, Line, Histogram/Density, Pie, ROC comparisons, and Survival: all shared summaries now use one normalized default size, participate in the shared font toolbar, and retain per-tab font styling through the existing font-style persistence contract. Scatter now uses the same shared SVG statistical-annotation primitive as the newer components instead of a private text renderer.
- Fixed Survival number-at-risk row labels colliding with the first time-point counts by reserving a measured label gutter and right-aligning group names immediately left of the aligned risk-count columns.

- Added publication-oriented statistical annotations across the figure types where they improve interpretation without duplicating full reports: Survival now supports an SVG-integrated number-at-risk table plus compact HR/log-rank summaries; ROC/PR legends include AUC confidence intervals/AP and can show the selected curve comparison; Line uses density-aware regression summaries; Histogram/Density supports single-series descriptive or two-series KS summaries; Pie/stacked charts support compact global-test summaries; and a shared stateless SVG annotation primitive normalizes rendering/drag behavior while leaving ownership and persistence component-local.
- Corrected correlation-heatmap significance for multiplicity: each unique off-diagonal pair is adjusted once, Benjamini-Hochberg FDR is the default, BY/Holm/raw-p alternatives are available, and rendered values use q/adjusted-p semantics rather than treating adjusted values as raw p.
- Corrected Pie goodness-of-fit reporting so the computed effect size is identified as Cohen's w rather than Cramer's V; contingency/homogeneity analyses continue to report Cramer's V.
- Persisted all new annotation visibility and draggable-position controls through owner-session state, runtime/recovery snapshots, and saved payloads, including explicit empty-payload defaults for reopen parity.
- Fixed the Line stats-on-plot toggle to resolve its owner through the existing projected-session contract; the initial implementation referenced a nonexistent event-session helper and failed at runtime after statistics were calculated. Added same-component regression coverage for annotation ownership and tab isolation.
- Corrected the Line 3D interaction regression test to assert the real animation-frame contract: rotation is transiently pending until the scheduled in-place frame runs, then settles without replacing the SVG.
- Refactored 3D draw/gesture lifecycle consistency: the shared Plot3D registry now reconciles detached owners before publishing a new gesture, Line 3D header normalization no longer schedules redundant nested draws, and Surface/PCA expose explicit draw-in-flight snapshot barriers plus settled lifecycle events.
- Hardened the targeted 3D Jest contracts so Line waits for its true 3D example draw and Surface render-cache assertions wait for the completed owner draw rather than sampling an intermediate frame.
- Corrected the focused 3D/recovery regression suite after Windows validation without adding production interaction churn: rotation unit tests now close every pointer transaction explicitly, Line view tests derive labels from the current literature example and exercise the real managed-pointer path, Surface render-cache coverage loads its example registry explicitly, and the recovery-race fixture models the intended in-flight race rather than starting behind the outer interaction gate.
- Refactored all interactive 3D rotation into one shared owner-scoped interaction transaction. Pointer capture now survives SVG boundary exits, harmless same-owner rebinding cannot terminate an active drag, canceled gestures roll back without dirtying the document, and Line, Scatter, PCA, and Surface rehydrate their fast rotation path from the exact active tab owner. Recovery checkpoints now treat an active rotation as an absolute barrier at scheduling, readiness, and live-owner capture boundaries, retain a pending checkpoint across in-flight races, and resume exactly once after the gesture settles; focused Jest and Chromium contracts cover boundary crossing, tab switching, stable SVG identity, dirty-state timing, and recovery interlocking.
- Refactored restored-graph click replay around one canonical owner token: the listener registration, captured tab object, and `workspaceState.activeTabId` are validated after asynchronous redraw, before hit-testing, and again before dispatch, so listener replacement, stale compatibility getters, and cross-tab DOM targets cannot revive an interaction. Replaced platform-dependent welcome-asset byte hashing with versioned, LF-canonical text provenance and structural SVG ID rewriting, making full/targeted publication and source, SVG, and inline-registry hashes deterministic across Windows, Unix, and tab creation order without weakening freshness checks.
- Fixed graph-edit capture listener ownership so fresh module/bootstrap evaluation replaces stale document listeners instead of duplicating drag/click handling. Heatmap color-scale IDs are now deterministic and owner-scoped, eliminating nondeterministic welcome SVG publication.
- Audited the complete post-`main` change set for owner isolation and corrective code paths. Active 3D gestures now capture one immutable owner binding, cancel cleanly before SVG/session rebinding or lost pointer capture, and cannot mutate a newly active tab; restored-graph click replay likewise requires the exact original active tab, component, mounted owner root, and connected graph target before dispatch.
- Fixed Windows portability and test isolation in the post-audit targeted suite: generated contract paths now use POSIX output, graph-edit listeners can be explicitly uninstalled, and replay tests track the exact active owner.
- Normalized Box restored-cache replacement onto the shared atomic frame publisher instead of maintaining a second swap implementation. Scatter and Heatmap data-aware defaults now write through to their owner session and canonical tab payload immediately, including automatic Scatter legend restoration when uniform-label data is replaced, so save/reopen and recovery no longer depend on a later incidental capture.
- Hardened generated-artifact quality gates: targeted welcome-thumbnail generation can no longer reuse stale SVGs and relabel them with fresh provenance or leave ignored staging directories after an early failure, all 11 owner-rendered SVG assets were regenerated, and the component-contract `--check` command is now strictly read-only. Removed an unreferenced SVG scratch page and stale/resolved backlog entries.
- Rebalanced welcome-page typography so the product title, tagline, action headings, section headings, graph-family titles, and example labels form a clear descending hierarchy without oversized card headings.
- Reordered the welcome import card copy so its purpose appears before the supported file-extension list.
- Simplified the welcome-page hierarchy by removing redundant introductory and eyebrow copy, shortening the graph-family heading to "Choose a graph type", compacting the Browse action, and reallocating the recovered width and height to substantially larger Popular examples thumbnails while retaining four equal-width cards and the existing carousel behavior.
- Smoothed welcome carousel wheel navigation by coalescing mouse-wheel and trackpad deltas into one requestAnimationFrame-driven motion, temporarily suspending CSS snap during the gesture, then settling cleanly onto the nearest card.
- Converted the existing Popular examples strip into an accessible horizontal carousel containing all 11 examples, with equal-width cards, discreet previous/next controls, mouse-wheel and keyboard navigation, responsive visible-card counts, and correct disabled states at each end.
- Removed the decorative purple-to-blue gradient rule from the Popular examples panel on the welcome page.
- Welcome example gallery cards no longer render the redundant "Open example" footer; the full card remains the single interaction target.

- Tightened the all-examples gallery with centered, bounded responsive card tracks (190–212 px), fitting five previews across the standard desktop dialog while preserving readable copy and the existing single-column mobile layout.
- Regenerated every welcome example from the canonical component viewport with the existing canonical legend policy and **Show graph title** disabled through the real component controls. The generator now preserves the source SVG viewport and `preserveAspectRatio` mapping before fitting the card, then bakes `non-scaling-stroke` widths into scalable SVG geometry so heatmap dendrograms, scale borders, and future responsive thumbnails shrink proportionally at every card size.
- Added manifest provenance and asset regressions for graph-title suppression, source viewport projection, responsive stroke baking, and complete removal of residual non-scaling strokes.
- Eliminated Box graph flicker when the first axis, symbol, or text edit rehydrates a cache-restored graph. Shared graph-edit redraws now explicitly request committed-frame preservation; Box builds the replacement SVG offscreen and swaps it atomically before replaying the original click.
- Increased raster tab-preview fidelity without enlarging the tooltip: PNG previews now render at a device-aware 2×–3× backing resolution, retain their logical preview dimensions, record their raster scale and pixel dimensions, and regenerate when that scale changes.
- Fixed Scatter 3D tab previews that collapsed every transformed marker into the upper-left corner. Static scatter export optimization now preserves transformed/depth-sorted and mixed marker layers, keeps the original layer attributes and paint order, batches only safe opaque fill-only circle runs, and applies the rewrite only when it actually reduces serialized size.
- Added focused unit and Chromium preview-contract assertions for supersampled PNG dimensions, transformed Scatter 3D marker preservation, mixed-marker safety, and owner-scoped raster metadata.

- Replaced Line 3D and Scatter 3D rotation-time full component redraws with owner-scoped geometry renderers. Rotation frames now reuse stable SVG, title, legend, paths, and marker nodes; update only projected axes, grid, series, points, and manual labels; reject stale tab/SVG owners; and restore the serializable geometry model from the owning render cache after reopen or crash recovery.
- Normalized interactive 3D rotation to an explicit owner-scoped gesture contract across Surface, PCA, Scatter, and Line. Asynchronous frames now require the captured tab, component type, mounted root, and exact SVG projection to remain current; canceled, stale, or rejected work clears only that owner’s pending rotation state; a moved rotation consumes only its synthetic follow-up click, while ordinary graph edits keep the shared restored-cache behavior.
- Reworked Surface rotation around a serializable owner-owned geometry model and transient DOM pools held in session refs and rebuilt from the owning restored SVG. Fast frames hide unused pooled nodes, preserve the color-scale legend in a stable overlay layer, retain editable/font-aware axis labels, and reject stale owners or incomplete pools instead of retaining old orientations.
- Fixed Scatter 3D recovery publication by emitting the canonical points-layer and render-mode metadata required by its visual-readiness validator, eliminating false empty-graph fallback failures after crash recovery. The fallback statistics renderer also now creates its table before applying section metadata, removing a latent declaration-order ReferenceError.
- Preserved PCA's precomputed 3D rotation renderer and analysis cache across tab switches, including round trips through Scatter 3D, and removed its redundant release-time full redraw.
- Removed Line's redundant release-time redraw, corrected its rotation binder to receive the resolved invocation owner, and retained the exact owner SVG in the session reference schema.
- Added focused unit and Chromium coverage for managed-gesture click semantics, exact owner/SVG rejection, Scatter 3D recovery publication, Surface mixed-3D recovery without ghost frames, PCA geometry reuse, and Line 3D owner binding.

- Made Scatter's untouched color-scheme default data-aware: single-dataset and sparse/unique-label plots now start in Grayscale, sparse/unique labels render as one point type with the legend hidden by default, and explicit user color/legend choices remain authoritative across save and reopen.
- Defaulted Heatmap correlation values off above ten conditions while preserving any explicit user toggle, shortened the Box ToothGrowth example labels, and fixed Box's restored-cache first-click toolbar replay by tracking queued draws as non-idle tab-owned work.
- Defaulted multi-dataset Histogram fills and borders to the same 65% opacity (35% transparency), including separate-panel layouts and the Trace toolbar's reported value.
- Replaced Venn's title-unaware set-label nudging with one measured initial layout pass that reserves a fixed graph-title band, fits the circles into the remaining frame, and evaluates top/bottom outer-arc placements for all two- and three-set combinations. After that automatic placement, Venn and UpSet titles plus Venn set/region labels are free presentation elements: dragging them never schedules a graph redraw, never changes the SVG viewport or plot geometry, and may intentionally overlap other content. The exact owner-scoped Venn layout is cached by data, graph size, and typography inputs, reused across non-geometric redraws, invalidated when those inputs change, and all manual positions persist independently per tab through undo/redo, save, reopen, and recovery.
- Replaced the weak showcase datasets after a literature-backed review: Scatter now uses all 569 WDBC tumors with the strongly correlated measured radius/perimeter pair; PCA uses 540 balanced control-mouse protein measurements and the 11 successful-learning proteins validated by Kulan and Dag; Line uses daily summaries of the 180-observation chronic sleep-restriction study; Histogram uses valid Pima two-hour glucose measurements by five-year diabetes outcome; Pie uses the four directly published TCGA breast-cancer subtype counts; and Surface uses the standard 21 × 21 MATLAB `peaks` benchmark. Updated every affected Notes block and provenance table, selected the PCA grouped schema through durable example metadata, improved the default Surface camera, regenerated all eleven Graphitix-rendered SVG thumbnails, and added focused richness, preprocessing, correlation, geometry, and strict Notes-format regressions.
- Rebuilt the welcome gallery as eleven flattened, self-contained vector SVG projections generated from the real owner-mounted examples. The generator now uses each component’s canonical export source when available, disables ordinary legends through the component’s real **Show legend** control, rejects raster `<image>` payloads, prefixes every internal SVG ID/reference, and validates both inline rendering and standalone browser decoding before publication. Heatmap is now a genuine vector SVG rather than an SVG wrapper around an embedded PNG.
- Removed external `<img src="…svg">` thumbnail loading from the welcome page. A generated, hash-validated `thumbnails.js` registry mounts the SVGs inline, avoiding MIME/server-dependent SVG decoding failures while retaining the individual SVG files for inspection and packaging. Missing or invalid registry entries degrade to the existing graph-family icon instead of exposing broken-image UI.
- Added per-component source fingerprints covering the built-in datasets, component renderer, shared rendering/runtime code, workers, styles, and generator contract. Pages and desktop synchronization validate those fingerprints and automatically regenerate stale thumbnails before packaging; the manifest records source provenance, capture mode, vector/raster status, registry hash, and content hashes.
- Added the missing Surface **Show legend** setting and normalized it to the shared geometry-neutral legend contract: hiding its continuous scale changes only the SVG envelope, never the plotted surface coordinates. Focused asset contracts reject stale files, executable/external or nested SVG content, raster payloads, retained legacy PNGs, or a rendered legend after canonical suppression.
- Redesigned the welcome workspace around a restrained scientific-editorial hierarchy: a compact product statement, aligned import/search/example entry points, clearer graph-family cards, a four-item Popular examples strip, and an accessible gallery covering all eleven graph families. The complete asset tree is now copied into both Pages and desktop builds so dynamically referenced gallery examples cannot be omitted.
- Added Histogram and Density small multiples inside the existing single SVG: multi-series distributions can remain overlaid or render as horizontal, vertical, automatic, or grid panels with a mandatory shared X domain, optional shared Y scaling, adaptive tick/title layout, and owner-scoped save/reopen/tab-isolation persistence. Histogram panels reuse pooled common bin edges; Density panels evaluate each KDE on the same X domain.
- Unified Histogram and Density under one durable `config.seriesLayout` rendering contract, eliminating the density-only fallback that disabled panel controls and restoring the exact selected arrangement when switching plot modes, tabs, reopened files, or recovery sessions.
- Prevented histogram and density SVGs from entering the shared orthogonal viewport-lock stretch path during resize; redraws now preserve `xMidYMid meet` geometry instead of non-uniformly scaling bars, curves, axes, and labels.
- Added focused unit and Chromium contracts for histogram/density panel geometry, common domains, shared/independent Y scales, one-SVG publication, mode transitions, resize aspect invariants, and durable layout state.
- Reworked Histogram/Density panel tracks so every small-multiple plot rectangle has identical X- and Y-axis lengths while axis-label reserves are allocated only to the rows and columns that display them; panel titles are now centered on the plot rectangle rather than the surrounding label cell.
- Released the transient legend viewport envelope before measuring any no-legend or separate-panel render, preventing a previous overlay legend from leaving an artificial right-side reserve after switching layouts.
- Fixed Histogram/Density panel Y-axis graduations by sizing vertical tick capacity from label height instead of label width and thinning automatic ticks with one regular stride, eliminating skipped intermediate graduations caused by irregular index sampling.
- Moved Histogram/Density panel-only controls to a dedicated second row in the Graph section, shown only for Separate panels, so the primary graph-type row remains compact at narrow widths.
- Audited the complete Histogram/Density small-multiple implementation against `AGENTS.md`: panel settings remain owner-session state, user changes synchronously flush through the standard owner-session persistence API, scheduled draw metadata is plain and tab-scoped, all panel geometry is derived, and save/reopen/recovery retain the same `config.seriesLayout` contract.
- Prevented stale Histogram runtime snapshots from overwriting a newer owner-session `seriesLayout`; runtime replay may seed the panel contract only when no owner session exists, while hydrated or user-modified session state remains canonical.
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
- Lock ratio is now geometry-neutral when toggled and preserves rendered x/y axis lengths across migrated Cartesian components, including Pie Stacked bar. ROC no longer forces a square plot. The current SVG viewport now enforces the ratio during the canonical render, including staged SVGs, with no delayed box-correction redraws. Heatmap Data values separately preserves its visible matrix ratio without axis semantics. Venn/UpSet remains on its legacy integrated-layout sizing path and is explicitly outside this Cartesian transaction. Ratio geometry remains tab-owned and survives `.graph` reopen.
- Fixed stacked Pie Lock-ratio persistence across subtype switching and archive reopen. Radial Pie/Donut's forced Lock-ratio policy no longer creates a false stacked preference during hydration; only a real stacked-to-radial transition captures the user's stacked choice, and that preference is retained in owner runtime/config snapshots until stacked mode is restored.
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
