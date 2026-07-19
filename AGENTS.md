# Graphitix Engineering Playbook

This file is the working guide for coding agents in Graphitix. Follow it repository-wide unless a more specific instruction file overrides it.

## 0. Communication Mode

- Use few words.
- Keep user-facing reports very concise.
- Avoid unnecessary jargon.
- Do not paste long code blocks, stack traces, or raw error logs unless explicitly asked.
- Report changed files, root cause, fix strategy, tests, and remaining risks only.
- Reduce token use whenever possible, but never reduce the work needed to solve the task.

## 1. Non-Negotiable Fix Rules

- Fix root causes. Do not use defensive cleanup as the solution.
- After finding a root cause, check whether it is part of a broader architectural problem.
- If the correct fix is a bigger refactor, stop and report that refactor before applying a narrow workaround.
- Remove legacy or redundant code only after proving it is unused.
- Report any refactor need, inconsistency, or architectural smell even when it is outside the immediate task.
- Also record each confirmed issue in root `issues.txt`; check first to avoid duplicates.
- Keep the testing framework coherent with code changes. Update tests when behavior or contracts change.
- Keep one source of truth per documentation role: `AGENTS.md` for engineering rules, `ARCHITECTURE.md` for the current system map, `issues.txt` for verified open work, `CHANGELOG.md` for completed changes, and `package.json`/`.github/workflows/` for executable validation gates.
- Remove completed or abandoned roadmaps instead of retaining them as parallel architecture or backlog documents. Migrate any still-valid rule or task to the appropriate canonical file first.

## 2. Graphitix Golden Rules

- True tab isolation is mandatory. No state may leak between tabs, including tabs of the same component.
- Reopened `.graph` files must behave exactly like the original open session.
- Save and restore all user-visible state: table data, AG Grid UI state, exclusions, graph size, graph style, graph parameters, notes, statistical settings, statistical results, previews, render cache, toolbar state, and component-specific runtime state.
- Cache heavy data where possible for fast tab switching, and persist reusable cache data when it is safe and part of reopen fidelity.
- Components must be as homogeneous as possible. When fixing one component, compare equivalent behavior in sibling components and normalize shared logic first.
- Use component-specific fixes only when shared normalization is not appropriate.
- Future changes must preserve the architecture contract below, even when a narrow local test can be made to pass another way.

## 3. Architecture Contract

### 3.1 Session and payload hierarchy

- Persisted payload is canonical only during file load, file reopen, import, duplicate, or recovery hydration.
- After hydration, the owning live component session is canonical while the app is running.
- DOM controls, rendered SVG, rendered tables, DataViews DOM, active refs, HOT instances, roots, managers, and toolbar mirrors are projections only. They are never durable state.
- User-visible changes must patch the owning session immediately, then update payload/runtime snapshots through the standard session APIs.
- Capture must write from the owning session into payload/runtime snapshots. It must not reconstruct inactive state from visible DOM.

### 3.2 Session ownership

- Every workspace tab owns exactly one component session for its component type.
- Durable tab-affecting state must live in the session, for example `session.state`, `session.results`, `session.cache`, `session.notes`, `session.advisor`, `session.managers`, `session.runtime`, or `session.timers`.
- Module globals may hold only immutable constants, listener/setup guards with no tab state, static caches keyed by all tab-varying inputs, transient active mirrors, or documented compatibility shims awaiting deletion.
- A component is not refactored if durable state can still change only in module globals and later be captured opportunistically.

### 3.3 Activation and DOM projection

Same-component activation must follow this order:

1. Resolve the workspace-active tab id.
2. Resolve the owning session for that tab.
3. Bind active mirrors from that session.
4. Project the session into visible DOM controls and render roots.
5. Only then allow DOM reads that are explicitly part of active-tab capture.

Rules:

- Activation must never capture transient DOM from one tab into another tab's session.
- If requested tab id, workspace-active tab id, root owner tab id, and session owner tab id disagree, skip DOM capture and use stored session/payload state.
- Inactive tabs must never read live DOM, active refs, active HOT instances, active DataViews managers, active layout objects, loading overlays, or active visual mirrors.
- Visible controls must be refreshed from the active session on activation, reopen, and runtime snapshot application.

### 3.4 Scheduled, async, worker, and timer work

- Scheduled draw/update work must be tab-scoped and plain-data only.
- Scheduled options may contain owner metadata and serializable flags, for example `{ tabId, reason, flags, plainOptions }`.
- Scheduled options must not contain DOM nodes, `Event` objects, sessions, refs, HOT instances, managers, component roots, scheduler functions, workers, controllers, or circular objects.
- Every async operation that can finish after a tab switch must carry owner metadata: `tabId`, operation type, stale-result policy, and a token/generation when appropriate.
- On completion, async work must resolve the owning session, verify the token/generation when used, patch only that session, update payload/runtime snapshots, and project to DOM only if that tab is still active.
- Stale async results must be ignored. They must not write to whichever singleton is active when they finish.

### 3.5 Render caches and live DOM reuse

- Same-component live-DOM reuse is an optimization, not a state source.
- A reused DOM root is valid only when its owner matches the tab being activated, or after explicit rebinding and full projection from the new owner session.
- Render-cache fragments may restore graph/state geometry only when owner tab, component type, payload signature, and session generation match.
- Restored graph DOM must either be rehydrated with live interactions or redrawn from payload/session before user edits are accepted.

### 3.6 DataViews, notes, HOT, and managers

- DataViews managers, notes controls, HOT managers, auxiliary UI managers, and analysis panels must be owned by the tab session or by a documented owner-keyed registry.
- Component code and tests must be able to resolve the manager for a tab without relying on the currently active component singleton.
- Lazy manager creation must take the owner tab id/session explicitly.

### 3.7 Module-global registry retirement

- Old module-global control registries are refactor targets. Remove or demote them whenever touched and proven replaceable.
- Examples include `state.distributionInputs`, `state.frequencyInputs`, `state.statsInputs`, component-level refs/control registries, module-level DataViews/notes/HOT mirrors, and cached render models not keyed by owner and data/settings signature.
- Such registries are allowed only as transient DOM projection handles for the currently active owner.
- Forbidden pattern: module-global registry or visible DOM controls -> opportunistic capture -> guessed session/payload owner.
- Required pattern: owning session state -> projection helper updates active DOM -> active DOM events patch owning session immediately -> capture reads owning session.
- When payload/session and visible controls disagree, remove or demote the duplicate source of truth instead of adding a local sync guard.

### 3.8 Line.js policy

- `line.js` is not a blanket template.
- Use Line only as an audited reference for a specific clean pattern.
- Safe patterns may include owner/session binding before scheduling, owner-scoped draw metadata, and explicit payload/runtime capture by tab.
- Do not copy Line patterns that depend on active mirrors, `__boundTabId` bridges, legacy globals, or compatibility fallbacks.

## 4. Source Boundaries

- Edit source files in `index.html`, `css/`, `js/`, `libs/`, `__tests__/`, `e2e/`, `scripts/`, and docs.
- Do not edit `desktop/app/`. It is generated from the web source during desktop builds.
- Desktop shell code lives under `desktop/`; packaged app assets are copied there by the desktop sync/build workflow.
- `node_modules/`, `test-results/`, `artifacts/`, and Playwright output are generated or third-party content. Do not treat them as source.

## 5. Current Architecture Map

- `index.html`: workspace DOM and strict script load order.
- `css/style.css`: canonical UI/layout styling.
- `js/vendor.js`: vendor shims.
- `js/shared/`: reusable services and cross-component contracts.
- `js/main/`: workspace, tab, session, save/load, preview, dirty-state, and bootstrap control plane.
- `js/main/tabs/`: tab rendering and tab prompts.
- `js/components/`: visualization workspaces.
- `js/workers/`: worker entry points for heavy computations and archive work.
- `__tests__/`: Jest unit/integration tests.
- `e2e/`: Playwright browser regressions.
- `scripts/`: diagnostics, benchmarks, architecture docs, and test suggestion tools.
- `docs/development/`: generated and hand-written architecture notes.

Start with:

- `ARCHITECTURE.md`
- `docs/development/main-bootstrap.md`
- `docs/development/component-contracts.md`
- `docs/development/state-persistence-schema.md`
- `docs/development/module-call-map.md`

Regenerate architecture docs after registry or dependency-map changes with `npm run docs:component-contracts` and `npm run docs:arch-map`.

## 6. Runtime Ownership Model

- `window.Shared` owns reusable infrastructure: AG Grid adapter, table import, data views, notes, resizers, graph sizing, chart styling, font controls, symbol controls, axis controls, stats, exports, workers, themes, archive IO, GO/STRING/UniProt utilities, and lifecycle helpers.
- `window.Main` owns workspace orchestration: component registry, active tab, session payloads, dirty state, save/load, previews, recovery, document status, and tab rendering.
- `window.Components` owns component modules: `venn`, `box`, `scatter`, `pca`, `line`, `heatmap`, `surface`, `roc`, `survival`, `hist`, and `pie`.
- Components are lazy-loaded through `Main.components.ensureComponent` / `loadComponentBundle`; do not add ad hoc component script loading.
- `Shared.componentLifecycle`, `Shared.workspaceTabs`, `Shared.tabContext`, and `Main.session` are the standard tools for session ownership, active-tab checks, runtime capture, and restore.

## 7. Component Contract

Every component must keep these methods complete and payload-safe:

| Method | Purpose |
| --- | --- |
| `ensure` / `init` | Build DOM bindings once, safely. |
| `draw` | Render only for the owning tab/session. |
| `getPayload` | Return JSON-serializable persisted state. |
| `loadFromPayload` | Hydrate the owner session from payload without DOM reads or active-global leakage. |
| `createEmptyPayload` | Provide a stable default payload. |
| `activateTab` | Resolve owner, bind session mirrors, then project visible DOM/runtime. |
| `captureRuntimeState` / `applyRuntimeState` | Preserve non-payload runtime needed for fidelity. |
| `captureUiState` / `applyUiState` | Preserve table/toolbar/UI state. |
| `captureRenderCache` / `restoreRenderCache` | Save and restore previews/graph DOM safely using owner/signature/generation checks. |
| `getLayoutState` / `applyLayoutState` | Persist graph/table layout and resizing. |

Payloads must remain JSON-serializable. Do not store DOM nodes, functions, class instances, workers, controllers, managers, sessions, or live AG Grid objects in payloads.

## 8. State and Persistence Rules

- Saved payload is the archive representation and the hydration source for load/reopen/import/recovery.
- The owning component session is canonical after hydration while the app is live.
- Mounted component state may exist for speed, but it must be owned by the tab session and write through when user-visible state changes.
- Dirty user changes must call the session APIs that mark tab/session user dirty, invalidate stale previews/render caches, and update signatures.
- Layout-only changes should update layout state without forcing unrelated payload capture.
- Render caches are performance/fidelity helpers, not a substitute for correct payload/session restore.
- Save, autosave, recovery, duplicate, close/reopen, and tab switch paths must use the same ownership rules.

## 9. Shared UI and Data Standards

- Build AG Grid tables through `Shared.hot.createStandardTable` unless a component has a proven special case.
- Preserve shared clipboard and context-menu behavior, including transposed paste.
- Route import/export through `Shared.tableImport`, `Shared.fileIO`, `Shared.graphArchive`, and `Shared.exporter`.
- Use `Shared.dataViews` for derived table views; bind managers to the owning tab.
- Use `Shared.notes` for notes panels and persist notes through payload/runtime state as the component contract requires.
- Use `Shared.chartStyle`, `Shared.graphSizing`, `Shared.componentLayout`, and `Shared.resizer` for sizing, text, axes, and graph frames.
- Use `Shared.fontControls`, `Shared.axisControls`, `Shared.symbolToolbar`, `Shared.gridControls`, `Shared.significanceControls`, and `Shared.styleUndo` instead of per-component toolbar clones.
- Use `Shared.plot3d` for 3D rotation/projection behavior in Scatter, PCA, Line, and Surface.
- Keep CSS in `css/style.css`; avoid inline layout/style patches except transient SVG attributes produced by renderers.

## 10. Debugging and Logging

- Prefer targeted `console.debug` messages gated by `Shared.isDebugEnabled()`.
- Use clear labels that can be filtered.
- Remove noisy temporary logs before finishing unless they are useful debug instrumentation.
- Do not leave repeated draw spam, unguarded console noise, broad catch blocks, or swallowed errors that hide root causes.

## 11. Testing Strategy

- Run targeted tests first. If you edit `js/components/box.js`, start with Box Jest/Playwright coverage, not the whole suite.
- Use broad tests only when shared code, lifecycle, persistence, archive, tab switching, async ownership, or styling could affect multiple components.
- Use `npm run test:suggest -- --files <changed-files>` to identify likely Jest and Playwright tests.
- Use `npx jest --runInBand <tests>` for targeted Jest runs.
- Use `npx playwright test <specs> --project=chromium` for targeted browser runs.
- Run `npm test` or larger Playwright suites only when risk justifies the cost.
- For tab isolation/reopen regressions on Windows PowerShell, use `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`, then `.\__tests__\tab-isolation-regression\run-regression.ps1`; use `-Components "box,scatter"` for targeted runs.
- Tests must assert settled architectural invariants, not timing artifacts.
- Before changing code for a failing test, confirm the test waits for a stable owner state and checks a valid final session/payload/DOM agreement.
- If a test samples a documented intermediate draw, resize, hydration, or async loading state, repair the wait instead of weakening the expected final state.
- Do not weaken failing tests before proving they assert the wrong final contract.
- Keep tests updated with code behavior. Do not preserve stale pixel assumptions or obsolete behavior just because tests expect them.

## 12. Component Playbooks

### Venn (`js/components/venn.js`)

- Owns Venn and UpSet plots, list parsing, count inputs, exclusions, species recognition, notes, GO enrichment, STRING network analysis, UniProt helpers, and result/export state.
- Keep parsed-list caches and GO/STRING async results tab-owned.
- Preserve Venn/UpSet style state, label positions, analysis results, and API-derived caches across save/reopen.
- Async GO/STRING callbacks must verify the originating tab before writing UI, results, or render cache.
- Do not mix Venn GO/STRING ownership work into unrelated cleanup unless that blocker is the explicit task.

### Box (`js/components/box.js`)

- Owns box, notched box, violin, strip, and bar-style plots, formulas, grouped tables, extensive statistics, assumption/advisor panels, significance annotations, point/summary styling, and workers.
- Keep stats settings/results, significance geometry, formulas, trace styles, data views, notes, and render caches tab-owned.
- Normalize behavior against Scatter/Line for table formulas, against shared stats helpers for tests, and against shared style toolbar contracts for visual edits.

### Scatter (`js/components/scatter.js`)

- Owns scatter, volcano, and MA plots, single/grouped table formats, 2D/3D views, regression/statistics, trendlines, selection, point labels, adaptive density/canvas paths, and worker acceleration.
- Keep stats/trendline results, 3D rotation, point styles, label positions, selections, data views, and heavy render caches tab-owned.
- Scatter is often the reference for session-owned runtime and cache invalidation patterns, but still verify before copying.

### PCA (`js/components/pca.js`)

- Owns PCA, MDS, t-SNE, and UMAP modes, grouped/sample metadata rows, 2D/3D views, embeddings, workers, color schemes, labels, notes, and rotation state.
- Preserve method, axis selection, embedding output, stats, color scheme, labels, data views, and 3D rotation across tab switches and reopen.
- Keep long-running embedding work stale-owner safe.

### Line (`js/components/line.js`)

- Owns line and area plots, single/grouped/3D table formats, regression diagnostics, confidence/prediction intervals, forecasts, series styles, grouped styles, labels, notes, and 3D rotation.
- Keep series/group/style state session-owned, not module-global authoritative.
- Normalize label editing, formulas, style undo, axes, and 3D behavior with Scatter/PCA where applicable.
- Use Line only as an audited pattern reference, never as a wholesale template.

### Heatmap (`js/components/heatmap.js`)

- Owns value heatmaps, correlation heatmaps, clustering/dendrogram controls, palettes, value scales, stats/report panels, data transforms, notes, workers, and render models.
- Keep active render model, palette state, dendrogram state, correlation data views, exclusions, stats, and render caches tab-owned.
- Avoid stale value/correlation model reuse when switching views or reopening.

### Surface (`js/components/surface.js`)

- Owns 3D surface/point rendering, X/Y/Z axis mapping, interpolation mode, color ramps, grid/frame/point/legend toggles, transforms, data views, notes, stats summary, and rotation.
- Preserve axis mapping, color ramp, interpolation, grid style, labels, legend position, notes, render cache, and rotation across tab switch/reopen.
- Use `Shared.plot3d`, `Shared.gridControls`, `Shared.dataViews`, and `Shared.componentLifecycle`; do not create Surface-only lifecycle shortcuts unless necessary.

### ROC (`js/components/roc.js`)

- Owns ROC and precision-recall views, threshold metrics, AUC uncertainty, DeLong/bootstrap/permutation comparisons, advisor state, notes, and stats tables.
- Preserve graph type, comparisons, thresholds, advisor answers, stats panels, labels, and render cache.
- Rehydrate stats table export controls after restoring cached DOM.
- Keep scheduled/manual redraw state and DataViews managers owner-scoped.

### Survival (`js/components/survival.js`)

- Owns Kaplan-Meier curves, log-rank tests, hazard ratios, Cox models/covariates, censor markers, advisor state, notes, and multiple stats panels.
- Preserve fixed survival schema expectations, covariate controls, stats/report panels, notes, line styles, label positions, and render cache.
- Rebuild Cox/covariate UI from restored schema without leaking from another Survival tab.

### Histogram (`js/components/hist.js`)

- Owns histogram, density/cumulative/frequency modes, binning controls, frequency table generation, diagnostics/comparison settings, stats panels, notes, and data views.
- Preserve plot mode, binning, axis settings, generated frequency/distribution data views, labels, notes, stats results, and render cache.
- Keep auto-draw and generated-view callbacks owner-scoped.
- Treat distribution/frequency/stats control registries as projections, not durable state.

### Pie / Proportion (`js/components/pie.js`)

- Owns pie, donut, and stacked proportion views, percent labels, chi-square/proportion statistics, palettes, notes, data views, and legends.
- Preserve chart type, slice/legend styles, label positions, percent-label settings, stats results, notes, and render cache.
- Keep stacked chart behavior aligned with shared layout/style controls.

## 13. Shared Module Guide

- Lifecycle/session: `componentLifecycle.js`, `workspaceTabs.js`, `tabContext.js`, `undo.js`, `styleUndo.js`.
- Persistence/archive: `fileIO.js`, `graphArchive.js`, `graphArchiveSchema.js`, `graphSizing.js`.
- Layout/rendering: `componentLayout.js`, `resizer.js`, `dom.js`, `chartStyle.js`, `plot3d.js`.
- Tables/data: `hot.js`, `agGridAdapter.js`, `tableImport.js`, `formulaEngine.js`, `dataPipeline.js`, `dataTransforms.js`, `dataViews.js`.
- Styling/toolbars: `workspaceToolbar.js`, `fontControls.js`, `axisControls.js`, `symbolToolbar.js`, `gridControls.js`, `significanceControls.js`, `colorSchemes.js`, `publicationStyles.js`.
- Stats/integrations: `stats.js`, `boxStatsModel.js`, `regression.js`, `stats-table.js`, `goAnalysis.js`, `stringAnalysis.js`, `uniprot.js`.
- Async/performance: `workers.js`, `jobs.js`, `loadingOverlay.js`, `performance.js`, `debounce.js`.

## 14. Safe Change Checklist

Before editing:

- Identify whether the change is component-specific or shared.
- Check sibling components for the same behavior.
- Check current tests and open issues.

While editing:

- Change the canonical owner of state, not projections only.
- Keep payload, session, runtime state, UI state, layout, preview, and render cache contracts aligned.
- Remove unused legacy code once proven unused.
- Update docs/tests when contracts change.

Before finishing:

- Run targeted tests.
- Add or update tests for regressions.
- Record any confirmed unrelated issue in `issues.txt` without duplication.
- Report only concise root cause, files changed, tests run, and remaining risks.
