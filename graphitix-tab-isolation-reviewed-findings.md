# Graphitix tab-isolation audit — v34 reviewed findings

**Reviewed:** 2026-08-22
**P0 remediation:** completed in this reviewed tree on 2026-08-21; runtime suites added but not executed during this source review.
**Raw DataView persistence remediation:** completed in this reviewed tree on 2026-08-21. The user subsequently ran the targeted Jest set successfully (9/9 suites, 103/103 tests); the first Chromium run passed 14/16 cases and exposed one stale Pie assertion plus one real PCA active-DataView persistence gap, both corrected in this tree. The stale Raw-DataView backlog entry is removed in this 2026-08-22 recheck.
**Scope:** current Graphitix archive supplied in `graphitix-current(20260822-130517).zip`
**Method:** exhaustive static/source audit of the 11 graph components and shared ownership, lifecycle, persistence, sizing, statistics, import, recovery, render-cache, and workspace-tab infrastructure. Jest/Playwright/browser execution was not performed by the assistant; targeted runtime results supplied by the user are recorded where relevant below.

## Executive verdict

v34 is substantially safer than the earlier reviewed revisions: most of the previously critical graph-open, worker/job, PCA, Scatter, Box, and Line ownership defects are genuinely fixed in the current source and must not remain in the active backlog merely because they were historically severe.

The former Venn P0 durable same-component contamination path and the previously reported P1 significance-threshold, delayed graph-sizing, Raw-DataView, and concrete Box palette write-through defects are source-resolved in the current tree. The current source findings therefore contain **no source-verified P0** and **no remaining source-verified P1 tab-isolation root cause**. One adjacent P1 persistence defect remains: the crash-recovery revision window. The narrower open tab-isolation findings are two P2 transient UI leaks plus one P2 shared owner-resolution ambiguity.

The Venn remediation closes the ownerless pre-request boundary rather than cleaning up contamination afterward: the initiating tab/session generation is captured at the event/schedule boundary, immutable launch data is snapshotted before asynchronous work, request creation and durable commits retain that owner, and old A continuations are rejected after A→B→A generation changes. The remaining open findings below should be addressed with the same exact-owner + generation/freshness discipline.

The former live-module-authority P1 is also repaired in this v34 tree. The remediation found that the root cause was broader than the eight components named in the original issue: Scatter and Heatmap still had callback/runtime mirror shortcuts that bypassed their otherwise strict predicates, and Venn retained the same workspace-active compatibility rule in its session predicate. All 11 graph components now route live module/DOM authority through one shared exact-projection gate, with workspace activation intent separated from live-capture authority.

A static audit cannot mathematically prove the absence of every race that depends on browser event ordering. The completion standard should therefore be: fix the source-level root causes below, rerun the static ownership audit, then require targeted same-component **A/B and A/B/A** runtime tests plus archive/recovery parity tests before declaring isolation complete.

## Scope and audit procedure

The review covered all 11 component modules:

- Box
- Scatter
- Line
- Histogram
- PCA
- Pie
- ROC
- Survival
- Surface
- Heatmap
- Venn

It also reviewed the shared/main subsystems that can cross component boundaries or determine durable ownership, especially:

- `js/shared/componentLifecycle.js`
- `js/shared/workspaceTabs.js`
- `js/shared/hot.js`
- `js/shared/jobs.js`
- `js/shared/fileIO.js`
- `js/shared/graphArchive.js`
- `js/shared/dataViewPersistence.js`
- `js/shared/graphSizing.js`
- `js/shared/publicationStyles.js`
- `js/shared/stats.js`
- `js/shared/tableImport.js`
- `js/main/documentState.js`
- `js/main/desktopCommands.js`

The machine-assisted ownership scan was deliberately used as a **candidate generator, not a bug counter**. The focused candidate scan produced 113 matches; the expanded surface scan produced 1,283 conservative candidates across callbacks, timers/async continuations, caches/results, active refs/managers, global listeners, and active schedulers. Each promoted finding in the preceding audit was manually traced to source semantics; this v34 remediation additionally repeated repository-wide ownership-pattern searches after the refactor. The large majority of scanner hits were rejected because owner/session/generation/token guards already make them safe.

The audit also ran two deterministic non-browser source checks:

- `node scripts/generate-welcome-example-thumbnails.cjs --check` — **fails** because the welcome manifest fingerprint and all 11 example SVGs are stale. This is tracked in `issues.txt`, not as a tab-isolation defect.
- `node scripts/generate-component-contracts.js --check` — **passes** for all 11 components.

No Jest, Playwright, Electron, Chromium, or live browser suites were run as part of this audit.

## Ownership invariants used for review

The current Graphitix architecture and project rules imply the following non-negotiable invariants:

1. **A durable operation has one owner before asynchronous work begins.** The owner must survive every `await`, Promise continuation, timer, worker callback, animation frame, and delayed retry.
2. **Owner identity alone is insufficient for ABA races.** Long-lived work also needs a session/generation/request token so an old A continuation cannot become valid merely because A is active again after A→B→A.
3. **Workspace-active and live-projected are different authorities during handoff.** Workspace-active state may decide what should be activated/scheduled; live DOM/module capture is allowed only when the requested owner matches the current projected owner and the relevant session/root authority.
4. **Inactive-owner capture must serialize the inactive owner's stored session/payload, never the active sibling's module mirrors or DOM.**
5. **User-visible durable mutations must write through to the owner session/payload synchronously before relying on redraw/capture.**
6. **Render caches, previews, statistics/results, DataViews, managers, file handles, layout state, and graph sizing are owner-scoped derived/runtime state.**
7. **Reopen/recovery must reproduce the original tab's data, graph size, graph parameters, statistical tests/results, and useful cache state without activating inactive tabs merely to manufacture caches.**
8. **When ownership authorities disagree, the safe behavior is to skip/defer live capture rather than infer ownership from whatever is currently active.**

## P0 remediation completed in this tree

### Resolved — Venn pre-request async analysis ownership leak

The previous audit correctly identified a durable A→B contamination path before GO/STRING request ownership was established. That root cause is now closed in `js/components/venn.js`.

**Implemented ownership contract**

- `bindEventHandlers()` now passes the owner captured by `runVennEventOwnerCallback()` into handlers instead of discarding it.
- `getVennCallbackOwner()` (`:1726`) captures both the Venn session and the workspace session generation; `isVennCallbackOwnerCurrent()` (`:1747`) validates session identity, tab existence, and generation. An inactive A may still receive its own valid background result after A→B, but an old generation is rejected after A→B→A.
- `resolveVennAnalysisOrganism()` (`:6037`) is explicitly owner-bound, snapshots the gene set before awaiting species lookup, uses per-flow request tokens (`goSpecies`, `stringSpecies`, `autoRefreshSpecies`), and commits species only to the originating owner.
- automatic analysis refresh (`:6166`, `:6236`) captures the owner, region genes, species-detection genes, GO options, STRING options, and overlay intent before the asynchronous species boundary.
- `beginVennAnalysisRequest()` (`:6832`), `commitVennAnalysisPatch()`, and `commitVennSpeciesSelection()` (`:6925`) now reject stale owner generations before durable writes.
- STRING overlay import (`:7637`) captures the file-event owner and overlay control model before file parsing, uses an owner request token, commits only to that owner, projects only when that owner is active/current, and keeps error/cleanup UI owner-scoped.
- automatic/manual species detection (`:8520`) accepts the captured owner; scheduled recognition captures ownership when scheduled rather than rediscovering the active Venn tab later.
- GO and STRING launch options are snapshotted before species resolution (`:8615`, `:8633`), and `runGOAnalysis()`/`runStringAnalysis()` (`:8642`, `:8761`) use those immutable owner-specific options instead of rereading sibling controls after an await.
- GO/STRING button handlers (`:11975`, `:12000`) receive the initiating event owner and thread it unchanged through species resolution and request creation.

**Regression coverage added/extended**

`e2e/venn.go-string.async-tab-isolation.spec.js` now covers owner retention for GO and STRING through deferred species resolution, deliberately different A/B analysis options, A→B→A stale-generation rejection, automatic analysis refresh across species await, automatic species cancellation on deactivation, STRING-overlay A→B ownership, overlay A→B→A stale rejection, and owner-safe overlay failure handling. `__tests__/venn.additionalTabOpen.test.js` was updated for the owner-scoped STRING-overlay request token.

These runtime tests were **not executed during this repair**; they are supplied for local certification. Static JavaScript syntax validation was performed on the modified source/spec.

## Live-authority P1 remediation completed in this tree

### Resolved — live module/DOM authority normalized across all 11 components

The original P1 correctly identified a shared architectural weakness: several components treated either the projected/bound owner **or** the workspace-active/activating owner as sufficient authority for module mirrors, refs/managers, controls, runtime capture, callbacks, and draw publication. That is unsafe during a same-component handoff because workspace selection can advance before the mounted DOM projection changes.

The repair is shared rather than eight independent `OR -> AND` patches. `Shared.componentLifecycle` now exposes two deliberately different contracts:

- `canOwnerUseLiveProjection(componentKey, owner, options)` is the only authority for live DOM/module state. It requires the requested owner, workspace component owner, component binding, projected session, owner session id, and the **registered mounted root**, its connected DOM identity, and its owner stamp to agree. The component binding and projected session are independent authorities: disagreement between them is rejected rather than collapsed through fallback ordering. If workspace selection says B while the mounted root still belongs to A, neither A nor B is allowed to consume live module/DOM state.
- `isOwnerActivationTarget(componentKey, owner, options)` answers only whether an owner is the workspace activation target. It never authorizes live capture. Its current production use is deliberately narrow: Histogram, Pie, ROC, Survival, and Surface may use it while suppressing the current projection scheduler during payload hydration, before the incoming owner becomes live.

The originally named Box, PCA, Line, Histogram, Pie, ROC, Survival, and Surface predicates now delegate to the shared live gate. The cross-component review also found and removed equivalent bypasses in the reference/adjacent components:

- Scatter callback and runtime-mirror paths no longer accept workspace-active or `getActiveScatterSessionForState()` identity as a substitute for exact live projection.
- Heatmap callback/runtime capture no longer falls back from projected ownership to workspace-active/session-object identity.
- Venn's session/callback live-state predicate now uses the same shared gate while retaining generation validation for async callback ownership.
- Line font/view refresh now asks `isLineSessionActive(ownerSession)` directly instead of calling `resolveOwnerCaptureContext()` with the owner's stored root, which could describe an incoming session before that root was actually mounted.
- Box and Line manager/ref setters, Histogram/ROC/Survival/Heatmap runtime capture, and Survival payload capture no longer treat equality with an “active session” accessor as live-state authority.

The refactor also preserves the correct behavior for inactive owners: component schedulers store pending work instead of drawing through the currently mounted sibling, and activation subsequently projects the owner before live work is allowed. The architecture contract in `ARCHITECTURE.md` now explicitly distinguishes activation intent from live authority and documents the safe A→B/ABA transition state.

**Regression coverage added**

- `__tests__/componentLifecycle.core.test.js` now models A projected → workspace B, B becoming live only after mounted-root/projection agreement, A→B→A where neither owner is live during the disagreement window, and explicit disagreement between `component.__boundTabId` and `projectedSession.tabId`. It also rejects detached roots even when tab ids otherwise agree.
- `__tests__/ownerCapture.normalization.contract.test.js` requires all 11 components to call the shared live gate, forbids the legacy `SessionActiveOrActivating` family and active-session equality shortcuts, verifies callback gates in Scatter/Heatmap/Surface/Venn, verifies Box controls do not rebind a non-live owner just to service an event, and confines activation-target authority to payload scheduler suppression.

These Jest tests were added/updated but were **not executed by the assistant**. All modified JavaScript and test files pass `node --check`.

## Systematic per-parameter isolation coverage added on 2026-08-22

The previous persistence and same-type switching suites could still miss a leak when a broad payload/style fingerprint changed correctly while one individual parameter was sourced from the wrong sibling. The new coverage extends the existing framework instead of introducing a parallel harness:

- `__tests__/tab-isolation-regression/parameter-harness.js` is shared by `component.persistence-matrix.spec.js`, `component.same-type-tab-switching.isolation.spec.js`, and `tab-isolation-regression/renderer-harness.js`; workspace creation/activation continues to use `e2e/helpers/workspaceHarness.js`.
- Parameters are discovered from canonical component payload/default schemas under `config`, `style`, `notes`, relevant `meta`, and Venn `analysis`. Untouched shared defaults for statistics significance threshold and graph sizing are synthesized from their real owner controls/runtime so “not serialized yet” cannot mean “untested”. A second gate inventories persistent `input`/`select`/`textarea` controls outside the data grid; any visible/persistent control that cannot be mapped to canonical parameter/shared-state ownership is reported as an uncovered defect.
- Each parameter is tested independently: reset to baseline, set exact valid A/B values, switch A/B/A/B, and require the exact value in the DOM projection, authoritative owner/session observables, and stored payload. A workspace archive is then saved/reopened and the same A/B/A/B assertions are repeated. Aggregate fingerprints are not accepted as witnesses.
- Persisted direct-manipulation state such as Euler rotation and label positions is included. Only explicitly classified generated/cache/result/document/technical bookkeeping is exempt; an unknown user-state leaf is reported as uncovered instead of silently skipped.
- Real controls are preferred whenever a semantic control can be identified. The test inspects the owner payload **before** a forced persistence capture so a missing owner-first event write-through cannot be repaired by the test itself.

The static recheck exposed and fixes two root defect classes in this exact archive. First, the shared live gate previously collapsed the component binding and projected-session owner through `A || B`, allowing one authority to hide disagreement with the other; those authorities are now checked independently. Second, the initial Box palette finding proved to be a cross-component owner-write-through inconsistency. Box per-series fill/border colors, Line grouped colors/shapes, Scatter editable-legend color/shape callbacks, and Survival dynamic group colors could mutate component-local mirrors before proving that the originating owner was still the exact live projection. Those paths now capture and validate the originating owner before mutation, patch that owner's session first, persist through the owner-scoped lifecycle API, and schedule only that owner's redraw. Dynamic controls also carry semantic `data-setting`/ARIA identity where applicable so the matrix binds the actual parameter control rather than matching a coincidental primitive value. Shared style-sync and undo workspace projection calls now pass the owner tab id explicitly rather than asking downstream code to infer it.

These new exhaustive runtime suites were **not executed by the assistant** and require local certification. Static JavaScript syntax validation and patch-application validation are performed before delivery.

## Current open tab-isolation findings

### 1. P2 / Medium — Venn UniProt tooltip completion can display in a sibling tab

**Site:** `js/components/venn.js:11806` — `handleRegionListMouseover()`

The handler captures a gene, awaits `fetchUniProtAnnotation(gene)`, then writes/positions the singleton Venn tooltip. It does not preserve the originating tab/root/session generation across the await. A→B can therefore display A's annotation in B.

This is transient UI leakage, not durable graph data corruption, but true tab isolation still requires it to be fixed. Capture the event owner before the await, stale-reject the continuation, and make tooltip state/positioning owner-scoped.

### 2. P2 / Medium — Box/Scatter import completion can settle the wrong loading overlay

The shared table importer itself now protects the **data transaction** with owner metadata. The older backlog's description of this as a durable imported-data leak is therefore stale.

A narrower issue remains:

- Box trailing completion around `js/components/box.js:18966-18971`
- Scatter trailing completion around `js/components/scatter.js:28843-28848`

The outer success-empty/error handlers resolve the loading UI without carrying the original import tab ID. After A→B, cleanup can resolve B's current controller key while A's overlay remains pending when A is revisited.

Preserve the import owner through every completion/cancel/error path. This should be normalized to the already owner-aware transaction logic rather than fixed by globally clearing overlays.

### 3. P2 / Medium — generic `.id` fallback weakens shared owner inference

**Site:** `js/shared/componentLifecycle.js:235-290` — `resolveOwnedObjectTabId()`

The helper considers explicit ownership fields, but also accepts `owner.id` and nested `.id` values and returns the first non-empty candidate without verifying that it corresponds to a real workspace tab/session. An unstamped DOM/component object can therefore contribute an ordinary component element id as if it were a tab id.

This is a shared contract weakness rather than a proven current durable contamination trace. Remove arbitrary `.id` as ownership evidence. Accept explicit tab stamps and validated tab/session records only, with tests for unstamped DOM, nested managers/DataViews, stale objects, and wrong-component identities.

## Adjacent reopen/persistence defects relevant to isolation acceptance

These are tracked in `issues.txt` because the user requires a reopened tab to be indistinguishable from its original open session. They are not sibling-tab leaks in the narrow sense, but they must be resolved before Graphitix can be considered persistence-safe.

### Resolved — lite/adaptive archives could corrupt Raw and lose non-replayable derived DataViews

The original P1 was broader than the first audit wording. Nine components could promote the active derived table into top-level `payload.data`, so lite/adaptive reopen could treat that projection as Raw and replay the transform again. The same lite policy also stripped every derived matrix even though some views cannot be reconstructed from `Shared.dataTransforms` alone (Scatter/Line residuals, Histogram frequency tables, Heatmap materialized/correlation views), and a directly user-edited derived view is no longer equal to the output of its original transform. Both parts are repaired as one shared persistence contract rather than component-specific archive patches.

**Implemented contract**

- new `js/shared/dataViewPersistence.js` owns Raw-view resolution and archive replayability/retention. The first serialized DataView remains the conservative Raw fallback when explicit `kind: "raw"` / `id: "raw"` stamps are absent;
- all ten DataView-enabled component payload getters resolve top-level `payload.data` through that shared Raw authority. PCA's former one-off Raw lookup is replaced by the same contract used by Box, Scatter, Line, Histogram, Pie, ROC, Survival, Heatmap, and Surface;
- `Shared.hot` write-through updates the active DataView first and then reprojects canonical top-level `payload.data` from Raw. A direct user mutation of Raw or a derived source recursively invalidates replayability for every already-materialized descendant; the edited derived source itself is also non-replayable. This prevents an older descendant matrix from being discarded and silently recomputed from newer source data on reopen;
- deterministic DataView creation now serializes the exact `transformOptions` that originally produced the view. Replayability is granted only when the view is explicitly stamped replayable, the transform type is supported by the archive loader, and those execution options are present. Pipelines are replayed through `Shared.dataTransforms.applyPipeline()` rather than being incorrectly sent to `applyTransform()`;
- lite/adaptive retention is dependency-aware. Raw is stored in `raw/data.csv`; a derived matrix is omitted only when its complete source chain can be reconstructed. Specialized/materialized views, user-edited views, unsupported transforms, missing-source/cyclic lineage, views lacking exact replay options, and descendants invalidated by a source-matrix mutation retain their matrices inline. A newly generated replayable child may still be omitted when its source is a retained materialized view because that exact current source matrix is available on reopen;
- `graph-config.json` remains matrix-free, preventing duplicated large materialized views. The main-thread and worker archive builders call the same shared sanitizer, so their lite/full behavior cannot drift independently;
- both archive builders resolve `raw/data.csv` from the serialized Raw DataView and canonicalize full-mode `payload.json` to the same Raw matrix. This also protects inactive tabs saved directly from canonical session payloads without mounting the component;
- archive load performs DataView hydration/reconciliation for full as well as lite payloads. Full payloads whose top-level data disagrees with their serialized Raw DataView are normalized before exposure; lite payloads replay only views that satisfy the explicit replayability contract and leave retained materialized matrices untouched;
- `ARCHITECTURE.md` and the persistence schema now document the invariant: top-level `payload.data` is Raw, while active projection identity, derived matrices, transform specifications, and replay execution options live under `dataViews`.

**Regression coverage added/extended**

Targeted Jest coverage checks Raw resolution; replayability classification; exact transform-option persistence; broken-lineage retention; materialized/user-edited retention; recursive descendant invalidation after Raw, derived-user, and component-style programmatic source mutations; all ten component payload sources; AG Grid/HOT canonical write-through; adaptive lite raw CSV selection; full-mode canonicalization; full-load reconciliation; deterministic/pipeline replay; and main-thread/worker schema parity. Chromium contract coverage additionally performs real browser build→parse cycles in forced-lite mode, verifying both ordinary Raw/replayable/materialized/user-edited views and a descendant created before its source was edited survive with the exact saved matrices and active view.

**Runtime validation follow-up (2026-08-21).** The user executed the nine targeted Jest suites after the remediation: **9/9 suites and 103/103 tests passed**. The first targeted Chromium run passed **14/16** cases and exposed two distinct follow-ups. The first Pie assertion was stale because it still expected the active derived matrix in top-level `payload.data`; that assertion now separately checks canonical Raw in `payload.data` and the numeric offset in the active DataView. The PCA failure was a real persistence defect: generic PCA DataView creation/activation/removal changed the live manager but did not dirty the owning workspace payload, allowing deactivation to trust a previously clean canonical payload and reopen with Raw selected. PCA now marks the exact owner session dirty from DataView state changes while excluding manager initialization, deserialization, and payload hydration; the former RNA-seq-only dirty mark is therefore redundant and has been removed. The user's rerun then passed **37/37 PCA Jest tests** and the PCA Chromium reopen/recovery case. That rerun exposed a second, real Pie persistence gap: Pie DataView creation/activation could likewise change the live per-tab manager without dirtying the owning canonical payload. Because the E2E resize is layout-only (`affectsPayload: false`), the inactive Pie tab could look correct while its per-tab DOM stayed mounted yet reopen from a stale canonical payload after a process reload. Pie now marks persistent DataView changes (`create-derived`, `activate`, and removal) dirty on the exact HOT-owning session, while initialization/deserialization/payload hydration remain silent. A targeted tab-isolation regression also verifies that mutating inactive Pie tab A's DataView state dirties A without contaminating active sibling B. Runtime rerun of the corrected Pie case remains pending at this review point.

`issues.txt` was intentionally left unchanged for this remediation because the user requested to remove/update the backlog item manually.

### A. P1 — crash-recovery debounce leaves the newest revision unjournaled

`js/main/documentState.js` uses `RECOVERY_DELAY_MS = 2500` and `RECOVERY_MAX_DEFER_MS = 10000`. A hard process loss in that interval can restore the previous rich snapshot rather than the newest canonical mutation.

The appropriate architecture is a lightweight owner-scoped revision journal/incremental canonical checkpoint, not heavy archive serialization on every input. Recovery parity should be tested by terminating immediately after edits, during rapid controls, and after tab switches.

### B. P2 — heavy mixed archive/recovery coverage remains parked

Exactly two current `test.fixme` tests remain, both in `e2e/heavy.mixed-tabs.reopen-recovery.canvas.spec.js`:

- mixed heavy Scatter tabs + heavy Box archive reopen (`:1012`)
- mixed heavy Scatter tabs + heavy Box crash recovery (`:1033`)

These are certification gaps, not evidence that the current implementation necessarily fails. Once the remaining P1 source defects are repaired, they should be unparked and expanded to verify first-interaction parity, statistics/results, graph sizing, previews/render caches, owner-specific invalidation, and no cross-tab warm-cache contamination.

The architecture explicitly says checkpoint/save flows must not activate an inactive tab solely to manufacture a render cache. Any future test expectation to the contrary would be wrong.

## Resolved findings removed from the previous report/backlog

The following historical findings were rechecked against current v34 source and should no longer be described as open defects.

| Historical finding | v34 review result |
| --- | --- |
| Graph-file open could apply A's payload to whichever sibling was active after an async read | **Resolved.** File-open routing now carries operation/owner identity and stale-operation checks through read/apply; sizing is passed the exact owner element. The remaining sizing issue is the separate generic/publication delayed caller described above. |
| `Shared.jobs.createExecutionContext()` lost owner validation when no loading job existed | **Resolved.** Current jobs execution context captures workspace session metadata/generation and validates owner currency independently of a loading job, including ABA-style generation protection. |
| PCA inactive-target runtime capture sampled the active sibling | **Resolved.** Current PCA capture resolves an owner capture context and avoids live module/DOM capture when the requested owner is not the live projection. The broader live-authority compatibility predicate has now also been normalized through the shared exact-projection gate in this v34 tree. |
| Scatter draw `finally` could write B module mirrors into A | **Resolved.** Current final synchronization builds/validates the final owner context and skips stale/non-live owners. |
| Box inactive-target runtime capture sampled the active sibling | **Resolved.** `captureRuntimeState` now resolves the target owner and threads ownership into capture rather than blindly sampling the active session. The separate direct-mutation/write-through debt remains. |
| Line font-style event dropped tab ownership | **Resolved.** Current Line font event forwards `detail.tabId` into owner-aware view refresh scheduling. The broader Line active predicate remains part of the shared normalization finding. |
| Venn/UpSet fourth and later columns were lost across switch/reopen | **Resolved.** Current payload/DataView handling preserves additional columns; do not keep the historical three-column persistence bug open. |
| Venn restore erased GO/STRING analysis state | **Resolved.** Current Venn session/results restoration and auto-refresh suppression preserve restored analysis instead of immediately replacing it. |
| Venn forced-ratio state had inconsistent dataset/session ownership | **Resolved** in the current owner/session projection paths. |
| Shared legend drag/undo state was not persistently owner-scoped | **Resolved** by current owner-aware shared legend state/undo handling. |
| Histogram KS summary appeared while comparisons were disabled | **Resolved** in current comparison-mode logic. |
| Heatmap Holm correction preference failed persistence | **Resolved** in current Heatmap statistics/session payload handling. |
| Box grouped example replacement left stale rows/state | **Resolved** by current example-load/data mutation paths. |
| Heatmap correlation lock-ratio projection diverged | **Resolved** in current sizing/projection handling. |
| Heatmap cancel/retry reused a stale heavy render model | **Resolved** by current owner/token-aware heavy draw/cache flow. |
| Scatter 2D capture could sample the sibling | **Resolved** in current owner capture/session synchronization. |
| PCA named color-scheme identity was not restored consistently | **Resolved** in current palette payload/projection handling. |
| Heatmap value-scale statistics were out of sync with displayed data | **Resolved** in current value-scale/statistics flow. |
| Heatmap inline-title replacement lost current state | **Resolved** in current title/control projection. |
| Line restored statistics were not ready before first interaction | **Resolved** by current restored statistics/session readiness flow. |
| Passive Heatmap tab activation could trigger ownerless ResizeObserver work | **Resolved** by current passive projection/owner guards. |
| ROC statistics test lacked its reference fixture | **Obsolete.** The reference data is now embedded immutably in the current test; this is not a product issue. |
| Scatter large rendering was wholly monolithic/main-thread | **Obsolete as written.** v34 has an owner-aware Scatter render worker. Any future performance issue must identify a current fallback/path rather than preserve the historical broad claim. |
| Heatmap SVG export necessarily used the child SVG as physical-size authority | **Obsolete.** Current export projection carries the live source and resolves the owner frame/layout authority. Do not reintroduce a competing payload-size authority. |
| Manual Save should activate never-mounted inactive tabs to manufacture render caches | **Rejected as architecturally wrong.** Current architecture explicitly requires passive checkpointing; inactive tabs must not be activated just to create a cache. Save the canonical payload and any legitimate existing cache instead. |
| Pie reopened width, heavy Heatmap empty preview blob, speculative Scatter durable resize-lock, and historical repository lint-count items | **Removed from the canonical verified backlog.** The v34 source audit did not establish a current root cause sufficient to keep these as product defects. If a current runtime test reproduces one, reopen it with fresh evidence and a current source trace rather than inheriting the old narrative. |

## Reviewed scanner candidates deliberately rejected

The static scanners intentionally over-report. The following representative candidate classes were checked and not promoted as current issues:

- **Current graph-file apply path:** owner/operation is pinned and freshness-validated; no active-sibling payload fallback was found in the repaired path.
- **Shared jobs/worker execution contexts:** current owner/session generation validation remains active even without a loading job.
- **Scatter main draw/stat continuations:** draw/session tokens and owner capture checks guard the reviewed late continuations; the former unconditional final-sync problem is gone.
- **Heatmap heavy worker/draw continuations:** reviewed paths carry owner/draw-generation or worker-token defenses; no matching durable tab leak was established.
- **Surface rotation callbacks:** reviewed rotation callbacks carry/validate the owning session; the open Surface issue is serialization size/performance, not isolation.
- **Shared table importer:** the data transaction itself is owner-scoped. Only Box/Scatter's outer overlay cleanup remains ownerless.
- **Venn region-list click URL opening:** the async continuation navigates/opens a URL but does not mutate sibling graph state, so it is not a tab leak.
- **Generic timers and Promise callbacks with no state sink:** async syntax alone is not evidence of leakage. A finding was promoted only when owner-sensitive data/UI/runtime state was read or committed across the boundary without adequate owner/freshness protection.

## Cross-component normalization guidance

The audit repeatedly shows that Graphitix already contains safer implementations that should be treated as normalization references:

- `Shared.componentLifecycle.resolveOwnerCaptureContext()` — canonical exact-owner live-capture gate.
- Heatmap's `isHeatmapSessionActiveForModuleState()` — explicitly distinguishes projected owner from workspace-active owner during handoff.
- Current Scatter capture/final-sync code — target owner first, inactive target from stored session, live capture only when exact owner context is valid.
- Current file-open sizing — exact owner element passed into shared sizing rather than re-resolving active DOM after an await/delay.
- Current owner-aware shared table-import transaction — captures the data owner and prevents data mutation from following the active tab.
- Current Venn P0 remediation — event-bound owner propagation, immutable pre-await launch snapshots, owner/session-generation validation, and owner-scoped request tokens now cover the earlier species/analysis boundary as well as post-request continuations.

The preferred remediation strategy is therefore **normalization**, not bespoke patches:

1. make shared owner-capture/freshness primitives the only authority for live capture;
2. thread owner + generation through async operations from their first owner-sensitive read to their final state sink;
3. write durable mutations through synchronously to owner session/payload;
4. keep workspace-active state for activation/scheduling, never as a substitute for live projection ownership;
5. make archive Raw-data and graph-sizing ownership shared contracts rather than component conventions;
6. remove compatibility fallbacks only after confirming all callers have migrated.

## Required runtime acceptance after source fixes

Static source review should be followed by targeted runtime certification. At minimum:

1. **Same-component A/B:** start every owner-sensitive async operation in A, switch to B before completion, verify B is unchanged and A either receives the result when valid or rejects it when stale.
2. **ABA generation:** start in A, switch A→B→A, complete the original A request, and prove the old generation cannot publish into the new A session/projection.
3. **Inactive-target capture:** explicitly request capture/save/checkpoint of inactive B while A is projected; no B payload/runtime/cache field may be sourced from A's DOM/module mirrors.
4. **Activation handoff:** force workspace-active B while A is still projected and exercise capture/refs/managers/schedulers; only A may be live-read until B projection is authoritative.
5. **Full/lite/adaptive archive parity:** for every DataView component, save with Raw and each derived view active; reopen and compare Raw, all derived views, filters/exclusions/transforms, graph size, graph controls, stats/tests/results, and render-cache behavior.
6. **Crash recovery:** terminate immediately after durable edits and after rapid gestures; newest owner revision must recover without requiring heavy archive serialization on every mutation.
7. **Graph sizing:** exercise delayed publication/file/reopen sizing through A/B/ABA and verify exact owner frame and persisted layout.
8. **Shared statistics:** edit significance threshold independently in sibling tabs and verify archive/recovery/undo isolation.
9. **Venn analysis:** cover GO, STRING, species detection, auto-refresh, overlay import, tooltip, success/failure/cancel, and restored analysis.
10. **Heavy mixed tabs:** unpark the two existing heavy mixed reopen/recovery tests after the root fixes, then verify first-interaction parity and owner-specific warm-cache reuse.

## Final prioritization

With the former Venn P0 and the source-verified P1 tab-isolation defects above repaired, the audit recommends this order for the remaining backlog:

1. **P1 crash-recovery revision window** — newest canonical edit can be lost on hard failure.
2. Then the narrower P2 owner/UI/certification issues, followed by performance and maintainability debt in `issues.txt`.

There is **no source-verified P0 and no remaining source-verified P1 tab-isolation defect** in this reviewed tree after the current remediation. That statement is based on static/source evidence; the new per-parameter Jest/Playwright/regression coverage still needs to be run locally before runtime certification is complete.
