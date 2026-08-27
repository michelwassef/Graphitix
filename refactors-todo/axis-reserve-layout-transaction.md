# Axis reserve and locked-geometry refactor plan

Status: planned; do not implement as a narrow component patch.

Related issue: `issues.txt` entry dated 2026-08-27, “Axis-label reserves and locked-axis geometry lack one shared transaction.”

## 1. Background

Axis charts must preserve the usable plot rectangle when labels need more room. Long category labels, tick rotation, significance annotations, legends, panel rails, and metric constraints may enlarge the SVG viewport, but they must not silently shrink or distort the plotted data area.

Box currently demonstrates why this cannot be solved only by increasing a renderer margin. Its automatic x-label reserve must coexist with:

- normal and flipped axes;
- significance lines and labels;
- manual width and height resizing;
- Lock ratio;
- double-click reset;
- legend extensions;
- save, reopen, recovery, tab switching, and render-cache restoration.

A trial generic rollout measured the extra axis margin and added it to the SVG content envelope. Ordinary unlocked charts behaved correctly. Locked Line geometry did not: after a width resize, the rendered axis ratio differed from the stored ratio by about 8.5%. The shared resizer had captured its frame-to-axis constraint before the new reserve was known. The renderer then changed the insets independently, so two authorities were solving the same geometry at different times.

Another rejected approach subtracted the current content envelope from `Shared.componentLayout.resolveDrawableFrame()`. Removing datasets or a legend then reduced the next canonical graph frame, causing the graph to shrink. The `.svgbox` drawable frame is already the user-owned canonical viewport. Content outside that frame is a derived extension and must never be fed back as a smaller user frame.

The root problem is architectural: frame size, plot geometry, automatic reserves, locked ratio, and final SVG envelope are resolved by separate helpers at separate stages. They need one owner-scoped transaction.

## 2. Required outcome

Create one shared Cartesian layout transaction that atomically resolves:

1. the canonical user frame;
2. baseline renderer margins;
3. measured automatic reserves;
4. component-specific auxiliary reserves;
5. locked plot geometry, when enabled;
6. the final plot rectangle;
7. the final SVG content envelope;
8. the geometry metadata published to the resizer.

The transaction must be pure for a given input snapshot. Rendering may measure text before calling it, but the transaction must not read active globals or whichever tab happens to be visible.

## 3. Non-negotiable invariants

### 3.1 Geometry ownership

- The canonical user frame is the size explicitly established by default layout, manual resize, reset, or persisted layout.
- Automatic labels, significance, legends, risk tables, and similar content do not mutate that user frame.
- The plot rectangle is resolved inside the transaction from the user frame and semantic constraints.
- The SVG content envelope may extend beyond the user frame. It is derived presentation geometry.
- `resolveDrawableFrame()` must continue returning canonical drawable geometry. It must not subtract a prior content extension.
- Showing or hiding a legend, or adding or removing a dataset, must not change plot geometry.

### 3.2 Locked geometry

- Lock ratio constrains rendered axis lengths, not raw SVG width and height.
- The lock target and final automatic insets must be solved together.
- No later renderer step may change an inset used by the locked solution.
- Lock toggle without a resize is geometry-neutral.
- Live drag and release must use the same target and produce the same settled geometry.
- Double-click reset must restore the orientation-specific default user frame, then recompute derived reserves.

### 3.3 Ownership and persistence

- All inputs are resolved for an explicit owner tab/session.
- Scheduled work carries owner ID and generation. A stale measurement cannot commit to a newer draw or another tab.
- Durable user choices are written to the owning session immediately.
- Measured reserves are derived state and normally are not payload fields.
- Layout/runtime/cache snapshots must contain enough canonical geometry and provenance to restore the exact visible result without treating cached DOM as state authority.
- Save/reopen, recovery, duplicate, and same-component tab switching must preserve the same graph size and behavior.

### 3.4 Stability

- A settled draw must not schedule corrective resize loops.
- Text measurement may use a bounded two-pass render only when the first pass is required to obtain real font metrics.
- Rotation decisions need a stable threshold or hysteresis so a one-pixel change cannot alternate between rotated and horizontal layouts.
- Repeating the transaction with unchanged inputs must return unchanged output.

## 4. Recommended architecture

### 4.1 Add a dedicated shared module

Prefer a new `js/shared/cartesianLayout.js` module instead of expanding `chartStyle.js`. `chartStyle.js` should remain responsible for text/style measurement and legend staging; `componentLayout.js` should remain responsible for canonical component frames; `resizer.js` should remain responsible for user resize interaction. The new module coordinates their geometry contracts without taking ownership of sessions or DOM.

Load it through the normal shared script order in `index.html`. Regenerate the component/dependency architecture documentation after the module is introduced.

Suggested public API:

- `planCartesianLayout(input)` — pure geometry planning.
- `composeAutomaticReserves(reserves)` — combines semantic reserves per side without double counting.
- `transposeCartesianLayout(input)` — maps semantic axes and reserves for flipped layouts.
- `publishCartesianLayout(target, plan, ownerContext)` — guarded publication of already planned metadata; no measurement and no state inference.

Do not expose component-specific conditionals from the shared planner. Components provide adapters that translate their semantics into shared inputs.

### 4.2 Input contract

Use a plain JSON-compatible snapshot containing at least:

- `owner`: tab ID, component type, render generation;
- `userFrame`: canonical width and height;
- `baselineMargins`: top, right, bottom, left;
- `requiredMargins`: margins required by measured ticks, labels, and titles;
- `auxiliaryReserves`: named semantic contributions such as significance, risk table, or panel rail;
- `externalExtensions`: legend or other content that extends the envelope without changing plot geometry;
- `orientation`: normal or flipped semantic-axis mapping;
- `lock`: enabled flag, target rendered-axis ratio, and resize-driving dimension;
- `plotConstraint`: optional component-owned metric constraint;
- `minimumPlot`: minimum usable plot width and height;
- `rounding`: the component's existing pixel rounding policy.

Do not pass DOM nodes, sessions, callbacks, scales, events, resizer instances, or mutable component state.

### 4.3 Output contract

Return one immutable plan containing:

- canonical user frame, unchanged unless the user resize transaction explicitly supplies a new one;
- resolved margins;
- automatic reserve deltas per side and per semantic source;
- final plot rectangle and rendered axis lengths;
- final SVG viewBox/content envelope;
- lock metadata derived from the final plot rectangle;
- publication metadata, including owner and generation;
- diagnostic reason codes usable only behind the debug gate.

The plan must distinguish three rectangles explicitly:

1. `userFrame` — persisted/manual sizing authority;
2. `plotRect` — data-coordinate geometry;
3. `contentEnvelope` — final SVG visibility/export extent.

Names throughout the implementation and tests should preserve this distinction.

### 4.4 Reserve composition

For an ordinary axis, compute the automatic label reserve as the positive delta between required and baseline margin:

`labelReserve[side] = max(0, requiredMargin[side] - baselineMargin[side])`

Semantic contributions must then be composed by declared behavior:

- `stack`: independent bands that must be added, such as category labels followed by an axis title;
- `max`: alternative occupants of the same band where only the largest is needed;
- `external`: extends the SVG envelope but cannot affect the plot rectangle, such as a legend;
- `metric`: participates in a component-owned plot-ratio solve, such as PCA equal-axis scaling.

Do not add every measured bounding box blindly. Each adapter must state which composition rule applies.

### 4.5 Transaction sequence

Implement this sequence as one logical commit:

1. Resolve the explicit owner and canonical user frame.
2. Resolve durable user settings from that owner session.
3. Perform the component's label/tick measurement pass against the candidate plot width.
4. Convert measurements into semantic reserve requests.
5. Compose ordinary and component-specific reserves.
6. Solve the locked or metric plot rectangle using the final insets.
7. Validate minimum plot dimensions and existing component bounds.
8. Stage legend and other external extensions from the solved plot geometry.
9. Publish plot geometry, SVG envelope, and resizer metadata together if owner and generation still match.
10. Capture runtime/cache projections only after publication is complete.

If a second text-measurement pass is required, it must occur before step 9 and be bounded. The first result must never be published as canonical geometry and then corrected asynchronously.

## 5. Resizer refactor

Current resizer metadata includes `resizerLockedGeometryRatio`, `resizerLockedConstraintRatio`, and geometry insets. These values can become stale when a renderer changes automatic reserves after capture.

Refactor the lock contract as follows:

- Capture the target ratio from the rendered `plotRect` when Lock ratio is enabled.
- During resize, pass the proposed user frame and stored plot-ratio target into the Cartesian transaction.
- Let the transaction return the final plot rectangle and the frame constraint needed for that exact reserve set.
- Commit new user-frame dimensions and lock metadata once, in the same owner generation.
- Remove the need for a post-render `calibrateLockedGeometryConstraint()` correction. Retain it only temporarily for non-migrated components, then remove it after usage proof.
- Do not let `resizer.js` independently infer future automatic insets from old dataset values.
- Do not perform delayed box corrections from `ResizeObserver`, `requestAnimationFrame`, or draw callbacks.

Preserve the existing rule that component resize callbacks own draw scheduling. The resizer supplies the resize proposal; the component adapter and shared transaction supply the solved geometry.

## 6. Component adapters

### 6.1 Ordinary 2D Cartesian adapter

Use one common adapter contract for:

- Line 2D;
- Scatter 2D;
- ROC and precision-recall;
- Survival;
- Histogram overlay mode.

Each component keeps its scales and mark rendering, but supplies baseline margins, measured axis requirements, titles, minimum plot bounds, and existing external legend input. Migrate Line first because it has direct lock-ratio coverage, then reuse the proven adapter.

### 6.2 Stacked Pie / proportion charts

Only the stacked Cartesian mode uses this transaction. Pie and donut modes do not.

The adapter must:

- measure category labels and decide rotation from available category bandwidth;
- reserve the longest rotated projection smoothly as width tightens;
- treat percent/value labels according to whether they are inside or outside the stack;
- remove any older physical bottom-frame growth only after parity is proven;
- keep legend extension external to canonical plot geometry.

### 6.3 Histogram panels

Panel geometry is a specialized repeated-axis layout, not several independent graph frames.

The adapter must:

- solve one common panel plot width and height before rendering panels;
- reserve bottom x-label space only for the last visible row;
- with shared Y, reserve one outer Y-label rail; otherwise reserve the required rail per visible column;
- keep hidden interior labels from consuming space;
- preserve common X domain, pooled histogram bins, regular tick thinning, and equal track plot rectangles;
- apply the transaction to the whole SVG, not separately to each panel.

Test overlay and panel modes independently.

### 6.4 Box

Box must be migrated only after the ordinary transaction and resizer contract are stable. It currently has specialized automatic frame authority and is the highest-risk adapter.

The Box adapter must compose:

- dynamic category-label reserve and rotation;
- axis title reserve;
- significance line and label reserve;
- normal/flipped orientation;
- Lock ratio;
- manual resize and double-click reset;
- legend extension.

Use semantic sides before transposition. For example, category-label reserve belongs to the category-axis outward side; the adapter maps it to bottom in normal mode and left/right as required in flipped mode. Do not copy numeric pixel reserves between orientations.

Replace `applyBoxAutomaticFrameReserveAuthority()` only after tests prove that the shared transaction preserves its valid behavior. Remove its associated stored reserve helpers only after an exhaustive usage search and migration of persistence/reset paths.

Existing Box issues must remain separate acceptance gates:

- the approximately 6 px flip/unflip geometry discrepancy;
- locked significance geometry;
- significance typography alignment.

Do not hide these failures by widening tolerances in the new reserve work.

### 6.5 PCA 2D

PCA equal-axis mode owns a physical coordinate metric. A generic margin adapter previously destabilized its legend/publication geometry.

Integrate reserves inside `resolvePca2dMetricLayout()` or its replacement:

- solve label reserves first;
- solve equal physical x/y unit scaling inside the remaining plot rectangle;
- preserve explicit `equalScaleAxes`/equal-axis choices and legacy migration;
- extend the SVG for legends only after the metric plot is final;
- keep 3D PCA excluded.

Metric equality is an independent invariant and must not be approximated by the ordinary Lock-ratio frame calculation.

### 6.6 Explicit exclusions

Do not apply the generic Cartesian reserve adapter to:

- Scatter 3D;
- Line 3D;
- PCA 3D;
- Surface 3D;
- Heatmap matrix/dendrogram layouts;
- Venn, Pie, or Donut;
- UpSet's integrated matrix/set-size layout.

These modes have projection, matrix, or integrated-layout semantics. Add a separate future design only if a demonstrated label clipping issue requires it.

## 7. Persistence and cache migration

- Persist canonical user-frame sizing through the existing layout/session APIs.
- Keep automatic reserves derived unless a component needs a versioned semantic decision, such as a stable user-selected rotation mode.
- Runtime snapshots may record the completed plan version and envelope metadata for fidelity, but cannot become a second sizing authority.
- Render-cache provenance must include owner, component, payload signature, layout signature, and completed publication generation.
- On cache restore, rehydrate interactions and derived envelope metadata without merging envelope dimensions back into the user frame.
- Legacy Box and stacked-Pie payloads may contain sizing influenced by old automatic frame growth. Add an explicit, versioned migration only if current fixtures prove such fields are persisted. Do not guess from DOM size.
- Verify duplicate, manual save/reopen, autosave recovery, and warm tab restoration.

## 8. Implementation phases

### Phase 0 — characterize current behavior

Before editing runtime code:

1. Record current short-label and long-label plot rectangles for every in-scope component.
2. Record unlocked and locked live-drag/release geometry for Line.
3. Record dataset/legend removal behavior.
4. Record Box normal, flipped, significance, and reset behavior.
5. Record Histogram panel tracks and PCA equal-axis metrics.
6. Separate pre-existing failures from regressions. Do not change tests merely to make the baseline green.

Commit only characterization tests in this phase.

### Phase 1 — pure planner

Add `cartesianLayout.js` and unit tests for:

- margin delta calculation;
- stack/max/external composition;
- orientation transposition;
- minimum plot bounds;
- locked plot-ratio solving;
- deterministic repeated calls;
- no mutation of inputs;
- user-frame invariance when only content changes.

No component migration yet.

### Phase 2 — resizer transaction contract

Integrate proposed user frames with the planner. Keep the old path for non-migrated components behind an explicit capability flag, not component-name checks. Add unit tests for width-driven, height-driven, corner, no-movement, unlock, and reset flows.

### Phase 3 — Line canary and ordinary adapter

Migrate Line 2D first. Require lock-ratio and live-resize tests to pass before migrating Scatter 2D, ROC, Survival, and Histogram overlay. Confirm that dataset and legend removal remain geometry-neutral after every migration.

### Phase 4 — stacked Pie and Histogram panels

Migrate categorical rotation/reserve behavior in stacked Pie, then repeated-axis behavior in Histogram panels. Keep their specialized tests separate from ordinary Cartesian tests.

### Phase 5 — Box

Migrate Box semantic reserves and orientation mapping. Preserve existing automatic-frame behavior until the new path demonstrates parity. Test significance-heavy layouts and repeated double-click resets before deleting legacy helpers.

### Phase 6 — PCA 2D metric adapter

Integrate the transaction with PCA's metric solver. Validate ordinary and equal-axis modes, labels, legends, manual resize, tab switching, and reopen. Do not touch PCA 3D.

### Phase 7 — persistence and isolation

Run targeted same-component dual-tab tests, cache restoration, save/reopen, recovery, and duplicate tests. Confirm no transaction input is obtained from active global mirrors or foreign DOM.

### Phase 8 — cleanup and documentation

After all consumers migrate:

- prove and remove obsolete reserve/frame helpers;
- remove obsolete resizer calibration metadata and compatibility branches;
- update `ARCHITECTURE.md`, component contracts, persistence schema, and `CHANGELOG.md`;
- regenerate architecture maps;
- close or revise the corresponding `issues.txt` entry;
- retain separate unresolved Box issues if they are not fixed by this refactor.

Each phase should be a reviewable commit and leave tests green for all components migrated up to that point.

## 9. Test plan

### 9.1 Shared Jest coverage

Add focused tests for the pure planner and extend:

- `__tests__/resizer.optionsMenu.test.js`;
- `__tests__/componentLayout.zoomBehavior.test.js`;
- `__tests__/chartStyle.legendViewport.test.js`;
- component drawable-frame authority tests;
- render-cache/persistence tests affected by new plan metadata.

Assertions must use public outputs and settled geometry, not source-string matching.

### 9.2 Browser geometry coverage

Use or extend these focused suites:

- `e2e/lock-ratio-axis-geometry.spec.js`;
- `e2e/graph.live-resize.spec.js`;
- `e2e/legend.viewport-invariant.spec.js`;
- `e2e/hist.panel-layout.spec.js`;
- stacked-Pie rotated-label reserve coverage;
- Box horizontal-shrink, significance-layout, flip/transposition, and dual-tab resize coverage;
- PCA metric/equal-axis geometry coverage.

Add a shared axis-reserve geometry suite covering each migrated 2D component with:

1. short labels;
2. long labels;
3. width tightening across the rotation threshold;
4. width expansion back across the threshold;
5. manual width and height resize;
6. Lock ratio where supported;
7. legend show/hide;
8. dataset add/remove;
9. double-click reset;
10. same-component tab switch;
11. save/reopen and recovery.

For each case assert separately:

- canonical user-frame width and height;
- rendered x/y axis lengths;
- plot rectangle position;
- content-envelope extent;
- absence of clipping;
- settled equality between live release and final draw;
- owner/session identity.

Use existing component tolerances. Do not relax a tolerance unless measurement proves the old assertion did not represent the intended invariant.

Run tests serially where ordered UI state or same-type tab switching requires it. Follow the repository's targeted-test policy at each phase; run broad shared suites only after shared resizer/layout code changes.

## 10. Acceptance criteria

The refactor is complete only when all of the following are true:

- Longer or rotated labels gain space without reducing the intended plot rectangle.
- Narrowing and widening are smooth and do not oscillate at the rotation threshold.
- Locked rendered-axis ratio remains within the existing tested tolerance during live drag and after release.
- Dataset removal and legend removal do not shrink the canonical graph or change plot geometry.
- Box normal/flipped reset restores the correct orientation-specific default proportions.
- Box significance reserves remain correct through repeated resize and reset cycles.
- Histogram panels retain equal plot tracks and correct shared/non-shared label rails.
- PCA equal-axis physical scaling remains exact under label and legend changes.
- No excluded 3D/matrix/integrated component changes behavior.
- Same-component tabs cannot affect one another.
- Save/reopen, recovery, duplicate, and cache restore reproduce the original graph size and settings.
- No corrective redraw loop, stale-owner commit, or duplicated sizing authority remains.
- Legacy helpers are removed only after proven unused.

## 11. Forbidden shortcuts

- Do not subtract the SVG content envelope from `resolveDrawableFrame()`.
- Do not persist a measured DOM bounding box as canonical graph size.
- Do not solve Lock ratio in `resizer.js` and automatic reserves later in the renderer.
- Do not add a delayed calibration redraw to hide the ordering problem.
- Do not add component-name branches to shared code.
- Do not duplicate Box's physical frame mutation across sibling components.
- Do not force the ordinary adapter onto PCA metric layouts, Histogram panels, or 3D modes.
- Do not weaken geometry tests to accommodate the new implementation.
- Do not read active DOM or module-global mirrors for an inactive owner.
- Do not edit `desktop/app/`.

## 12. Expected files

Likely shared changes:

- `index.html`;
- new `js/shared/cartesianLayout.js`;
- `js/shared/resizer.js`;
- `js/shared/componentLayout.js` only if its public contract needs metadata plumbing;
- `js/shared/chartStyle.js` for measurement/legend integration only.

Likely component adapters:

- `js/components/line.js`;
- `js/components/scatter.js`;
- `js/components/roc.js`;
- `js/components/survival.js`;
- `js/components/hist.js`;
- `js/components/pie.js`;
- `js/components/box.js`;
- `js/components/pca.js`.

Likely documentation and tests:

- `ARCHITECTURE.md`;
- `CHANGELOG.md`;
- `docs/development/component-contracts.md`;
- `docs/development/state-persistence-schema.md`;
- targeted Jest and Playwright files listed above;
- generated architecture maps after dependency changes;
- `issues.txt` status update when complete.

## 13. First-task checklist for the future coding agent

1. Read this plan, `AGENTS.md`, the related `issues.txt` entries, and current architecture contracts.
2. Inspect the current worktree and preserve unrelated edits.
3. Reproduce and record the Line lock-ratio failure and dataset-removal invariant on current code.
4. Verify the current Box automatic-reserve helpers and PCA metric solver before designing APIs; file names and line numbers may have moved.
5. Write characterization tests before runtime changes.
6. Implement only Phase 1 first and review the pure contract before connecting it to the resizer.
7. Stop if the proposed transaction cannot keep user frame, plot rectangle, and content envelope as separate authorities. Do not replace it with a local workaround.

