## 2026-07-28 — Full test runner

- Added one PowerShell command for the complete Jest and Playwright suites.
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
