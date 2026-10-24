# Graphitix tab-isolation audit — reviewed findings and current recheck

**Original review:** 2026-08-22, supplied archive `graphitix-current(20260822-130517).zip`
**Current source recheck:** 2026-10-16, working tree
**P0 remediation:** completed in this reviewed tree on 2026-08-21; runtime suites added but not executed during this source review.
**Raw DataView persistence remediation:** completed in this reviewed tree on 2026-08-21. The user subsequently ran the targeted Jest set successfully (9/9 suites, 103/103 tests); the first Chromium run passed 14/16 cases and exposed one stale Pie assertion plus one real PCA active-DataView persistence gap, both corrected in this tree. The stale Raw-DataView backlog entry is removed in this 2026-08-22 recheck.
**Original scope:** Graphitix archive supplied in `graphitix-current(20260822-130517).zip`
**Original method:** broad manual source review of the 11 graph components and shared ownership, lifecycle, persistence, sizing, statistics, import, recovery, render-cache, and workspace-tab infrastructure. It was not exhaustive proof of isolation, and the assistant did not run Jest, Playwright, or a browser during that 2026-08-22 review; user-supplied targeted runtime results are labeled below. The bounded 2026-10-16 scan and browser validation are documented separately.
**Status:** The 2026-08-22 findings below are historical. The 2026-10-15 and 2026-10-16 rechecks are recorded in the current sections. The separate pre-capture timing gap and Box large-worker fallback were fixed with focused evidence. The callback audit and historical 407-row reconciliation remain open.

## Executive verdict from the original review

v34 is substantially safer than the earlier reviewed revisions: most of the previously critical graph-open, worker/job, PCA, Scatter, Box, and Line ownership defects are genuinely fixed in the current source and must not remain in the active backlog merely because they were historically severe.

The former Venn P0 durable same-component contamination path and the previously reported P1 significance-threshold, delayed graph-sizing, Raw-DataView, and concrete Box palette write-through defects were source-resolved in the reviewed tree. That review found **no source-verified P0** and **no remaining source-verified P1 tab-isolation root cause**. One adjacent P1 persistence defect remained: the crash-recovery revision window. The narrower open tab-isolation findings were two P2 transient UI leaks plus one P2 shared owner-resolution ambiguity; their later disposition is summarized above.

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

The original 2026-08-22 machine-assisted scans were deliberately used as **candidate generators, not bug counters**. The focused scan produced 113 matches; the expanded scan produced 1,283 conservative candidates across callbacks, timers/async continuations, caches/results, active refs/managers, global listeners, and active schedulers. The new 2026-10-15 scan and its different scope/count are described below; do not compare the two totals as if they measured bugs.

The audit also ran two deterministic non-browser source checks:

- `node scripts/generate-welcome-example-thumbnails.cjs --check` — **fails** because the welcome manifest fingerprint and all 11 example SVGs are stale. This is tracked in `issues.txt`, not as a tab-isolation defect.
- `node scripts/generate-component-contracts.js --check` — **passes** for all 11 components.

The original 2026-08-22 source review did not run Jest, Playwright, Electron, Chromium, or live browser suites. The 2026-10-15 recheck ran the focused ownership and UI-persistence cases listed in the current conclusion; those results must not be attributed to the original review.

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

`e2e/venn/venn.go-string.async-tab-isolation.spec.js` now covers owner retention for GO and STRING through deferred species resolution, deliberately different A/B analysis options, A→B→A stale-generation rejection, automatic analysis refresh across species await, automatic species cancellation on deactivation, STRING-overlay A→B ownership, overlay A→B→A stale rejection, and owner-safe overlay failure handling. `__tests__/integration/venn.additionalTabOpen.test.js` was updated for the owner-scoped STRING-overlay request token.

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

- `e2e/helpers/ownerPayloadDriver.js` is shared by the two explicit owner-payload mutation matrices. The former standalone renderer/server harness was retired; workspace creation and activation use the narrow Playwright drivers. UI-originated behavior remains in the strict UI contracts.
- Parameters are discovered from canonical component payload/default schemas under `config`, `style`, `notes`, relevant `meta`, and Venn `analysis`. Untouched shared defaults for statistics significance threshold and graph sizing are synthesized from their real owner controls/runtime so “not serialized yet” cannot mean “untested”. A second gate inventories persistent `input`/`select`/`textarea` controls outside the data grid; any visible/persistent control that cannot be mapped to canonical parameter/shared-state ownership is reported as an uncovered defect.
- Each parameter is tested independently: reset to baseline, set exact valid A/B values, switch A/B/A/B, and require the exact value in the DOM projection, authoritative owner/session observables, and stored payload. A workspace archive is then saved/reopened and the same A/B/A/B assertions are repeated. Aggregate fingerprints are not accepted as witnesses.
- Persisted direct-manipulation state such as Euler rotation and label positions is included. Only explicitly classified generated/cache/result/document/technical bookkeeping is exempt; an unknown user-state leaf is reported as uncovered instead of silently skipped.
- Real controls are preferred whenever a semantic control can be identified. The test inspects the owner payload **before** a forced persistence capture so a missing owner-first event write-through cannot be repaired by the test itself.

The static recheck exposed and fixes two root defect classes in this exact archive. First, the shared live gate previously collapsed the component binding and projected-session owner through `A || B`, allowing one authority to hide disagreement with the other; those authorities are now checked independently. Second, the initial Box palette finding proved to be a cross-component owner-write-through inconsistency. Box per-series fill/border colors, Line grouped colors/shapes, Scatter editable-legend color/shape callbacks, and Survival dynamic group colors could mutate component-local mirrors before proving that the originating owner was still the exact live projection. Those paths now capture and validate the originating owner before mutation, patch that owner's session first, persist through the owner-scoped lifecycle API, and schedule only that owner's redraw. Dynamic controls also carry semantic `data-setting`/ARIA identity where applicable so the matrix binds the actual parameter control rather than matching a coincidental primitive value. Shared style-sync and undo workspace projection calls now pass the owner tab id explicitly rather than asking downstream code to infer it.

These new exhaustive runtime suites were **not executed by the assistant** and require local certification. Static JavaScript syntax validation and patch-application validation are performed before delivery.

## Findings recorded as open in the 2026-08-22 snapshot

### 1. Resolved — Venn UniProt tooltip completion could display in a sibling tab

**Current site:** `js/components/venn.js:12757` — `handleRegionListMouseover()`

The current handler captures its owner from the event target before awaiting UniProt. On return, `isVennCallbackOwnerActive()` checks the same session, session generation, and active projection before touching the tooltip. The scheduled sizing frame carries the owner tab id and uses the shared stale-frame guard. The old A→B display path is closed.

The source contract is also covered by `__tests__/architecture/ownerCapture.normalization.contract.test.js`.

### 2. Resolved — Box/Scatter import completion could settle the wrong loading overlay

The importer carries its transaction tab id through success, inactive-owner, empty-result, and error paths. Its `onPrismStyle` and `onBeforeCompleted` callbacks run only inside the current owner transaction. Box and Scatter pass the captured `importOwnerTabId` to trailing overlay cleanup; `Shared.loadingOverlay` keeps controller entries keyed by tab id. A→B completion can no longer resolve B's overlay in place of A's.

The formerly reported sites are now:

- `js/components/box.js:18646-18654`
- `js/components/scatter.js:29678-29686`

Both pass the original tab id to `resolveBoxLoading` / `resolveScatterOverlay`, including empty and rejected imports. This closes the reported overlay leak.

### 3. Resolved at the reported source — generic `.id` no longer counts as owner identity

**Current site:** `js/shared/componentLifecycle.js:450` — `resolveOwnedObjectTabId()`

The helper now reads explicit tab ownership stamps, `tabId`/session metadata, or tab data attributes. It does not read generic `id` or nested `id`. Existing tests assert that `{ id: 'tab-a' }` and `{ manager: { id: 'tab-a' } }` resolve to no owner. Live capture separately requires workspace, projected owner, session, and mounted root agreement; owned persistence validates that the tab exists, has the expected component type, and is active.

This closes the reported generic-id inference. The helper is still an identity extractor; every caller must pass authoritative metadata, and the capture/persistence boundaries remain responsible for validating it. No new leak was established here.

## Current candidate scan and validation — 2026-10-15

### P1 recovery checkpoint — fixed and verified

The original gap was the macrotask delay between the capture-phase dirty mark and the first canonical payload/journal capture. A completed input/change now checkpoints at window bubble, after control handlers; select and commit-style inputs wait for `change`. Button-like actions checkpoint after their click handlers. Both paths use `checkpointCanonicalUserMutation`, which validates the exact workspace tab, component type, and active owner, then updates the existing tab payload and canonical journal. The checkpoint uses the existing local journal and IndexedDB writer; it does not build a `.graph` archive or render cache per event. The queued capture remains a fallback when propagation prevents the bubble checkpoint.

Evidence: the fresh focused recovery Jest run passed 5 suites / 56 tests, including immediate session and journal checks before the timer, queued tab-journal writes, and delayed recovery/save races. The exact immediate Box control-change/reload/recovery Chromium case passed 1/1 in this recheck. An earlier broader Chromium recovery/document-open batch passed 9/9 and was not rerun here. This closes the reported tracked-control timing gap. It does not certify every mutation path; the 392-row candidate review remains open.

### Reproduced and fixed — overlapping unsaved-close saves

`handleUnsavedSave` previously hid its modal while awaiting the archive save. That released workspace inertness, allowing a second tab close to replace the single `pendingClosePrompt`. When the first save completed, it cleared and hid the second tab's prompt. The browser regression reproduced this sequence before the fix.

The busy prompt now stays open and keeps the workspace inert. `closeTab` rejects overlapping close requests except the exact prompt owner completing its save; the async completion also verifies that both the pending prompt object and tab object still belong to the request before mutating workspace state. The test checks both tabs remain present during the pending save, the second payload stays unchanged, and only the first tab closes after save completion. `e2e/workspace/unsaved-decisions.contract.spec.js` passes 2/2, including the existing Cancel/Discard case.

### Reproduced and fixed — discarding one tab erased other tabs' recovery

`handleUnsavedDiscard` cleared the workspace-wide recovery snapshot and canonical journal before closing only the selected tab. Chromium reproduced the loss: with dirty Venn tabs A and B, discarding A left both local and IndexedDB journals empty, so B had no recovery checkpoint.

Tab removal now checkpoints the remaining canonical workspace synchronously to the existing local journal and lets the existing IndexedDB queue publish its changed tab order. Recovery is cleared only when no recoverable graph data remains. The regression verifies B's exact payload in both journals and after reload/recovery; the last-tab discard check confirms that intentionally discarded data is not offered again.

The old line-based scan produced long hit lists without showing which captured state a callback writes. `scripts/audit-tab-leak-surfaces.cjs` now uses the installed parser and scope analyzer to shortlist registered or async callbacks that write captured variables. It covers `js/components`, `js/shared`, `js/main`, and `js/workers`. It is a triage tool, not a defect counter. Use `node scripts/audit-tab-leak-surfaces.cjs --active-after-await` for the async-owner subset and `--json --all` for the full candidate records.

The current scan reports **391 callback candidates across 126 files**: 243 have module-scope writes and 170 have enclosing-function writes (the sets may overlap). It flags 312 candidates without a syntactic owner clue and 342 without an inline owner check; these are clues only because ownership may be supplied by the registration root or caller. Eight callbacks read the projected tab after an `await`; all eight were individually traced and have owner/session freshness checks before their final write. Scatter cancels by owner token, both Line paths validate the execution owner, Pie and ROC validate session/generation, Surface validates its exact-tab execution context, Survival validates draw ownership, and Venn validates the captured session/generation and its owner-scoped follow-up frame. The Venn tooltip callback was separately traced through its owner-binding wrapper. Box's staged draw publication was reviewed separately; the earlier scanner version incorrectly attributed a nested helper's `await` to the callback. The ledger also records two additional high-ranked safe paths (`applySessionData` under the document-open transaction and the tab-keyed statistics-summary lifecycle listener) and the reproduced/fixed unsaved-close prompt race.

The scan has explicit blind spots: it counts a guard if the callback mentions one anywhere, without proving the guard runs before the write; an `owner`/`tabId` variable is a naming clue, not a validated identity; custom registration wrappers are recognized only by name; and only captured writes within the nearest two long-lived scopes are considered. It detects callbacks with captured writes, not fail-open guard functions by themselves, helper calls that hide the final write, inline HTML handlers, or runtime behavior. Keep its output as a review queue. The independent `component.ui-parameter-persistence` matrix exercises real controls and archive reopen; `UI_MUTATION_IDS` now lets a reviewer run a single declared UI mutation. The same-type parameter matrix checks owner A/B/A payload, session, DOM, and archive witnesses one field at a time. Source tracing decides whether a candidate is a defect; a failing bounded runtime case confirms user-visible impact.

A separate source pass over optional-owner checks found the Grid guard below. This was not inferred from the 392-candidate count: the guard accepted missing identity, and all eight component registration sites resolve through stamped SVG roots. The guard now requires both IDs and exact equality; its Jest contract test covers matching, mismatched, and missing IDs. Similar permissive checks remain in cached aspect-ratio controls in Line, Pie, and Venn. Their normal roots are stamped, and their Chromium A/B/A same-type isolation cases pass. Source tracing shows workspace switching deactivates the outgoing tab before assigning the incoming active tab id, then stamps the incoming root before its activation hooks. No valid transition was found where a missing owner ID authorizes a connected sibling node while another owner is active. The no-ID fallback remains permissive, but no cross-tab leak is reproduced; do not change it without a valid lifecycle-boundary counterexample.

The broad callback category is **not fully audited**: the scanner's other candidates have not all been traced from registration through the final session, payload, or DOM sink. No count in this section should be read as a count of defects. The next review should process the remaining records in this order: shared/document-level controls and listeners; module-scope writes in component modules; owner-keyed timer/cache registries; ordinary root-local controls. Mark each candidate as `safe by owner trace`, `contract gap`, `reproduced leak`, or `needs a bounded test`; only the last two categories are product findings. Do not describe the application as leak-free until that triage is complete.

The runtime coverage in this checkout exercises 11 component types for same-type switching/persistence, repeated owner order, and duplicate/reuse fidelity. The explicit mutation catalog contains **35 declared fields** across the 11 types; this is a cross-component sample, not exhaustive coverage of every control.

The Heatmap `config.colorScheme` row exposed a reopen projection defect, not evidence that a sibling tab's palette was written into B. The real picker/archive test reproduces it. The same-type parameter test originally reported no DOM witness because the shared picker is represented by a hidden select outside the mounted graph root; that was a test-observation gap, not product evidence. The test helper now records each component's palette select only when its owning tab is active. The full parameter-level suite then passed 10/11 components: A/B/A checks passed for every component, while Heatmap failed only on return to B after archive reopen, where the selector disagrees with the displayed-scheme resolver. Before archive reopen, B's Soft preset is consistent: the saved gradient is `#4e79a7 / #f7f7f7 / #e15759` and its dendrogram color is `#222222`. After reopen, the canonical payload still has dendrogram `#222222`, but the owner session and active mirror hold the default `#3d3d3d`; the real-control case fails on this session/payload mismatch. The source path is `applyWorkspacePayload` followed by `applyRuntimeState(..., preservePayloadState: true)`. `setHeatmapSessionStateFromRuntimeRecord()` preserves a hand-picked list of payload-backed fields but omits `dendrogramSettings`, allowing the runtime snapshot to overwrite the just-hydrated archive value. The config-to-session mapping was checked: `dendrogramSettings` is serialized as `config.dendrogram`; control state, palette, scale, labels, title, notes, scheme, and active DataView each have an existing preservation/restore path, while render performance and cluster-default bookkeeping remain runtime state. Preserve `dendrogramSettings` in the payload-authoritative merge. Validate with the real palette-picker and same-type A/B/A archive cases; assert B's config dendrogram, owner session, live `getPayload()`, and visible scheme control all agree. This is a confirmed reopen/fidelity defect with a source-traced root; it is not classified as cross-tab data contamination.

### Rechecked false positives — manifest and Venn UpSet resize

The stale manifest finding is closed: the exact scenario contract includes all three registered statistics-restore scenarios. The inventory check initially caught empty cleanup catches in the two new delayed-paste E2Es; both now ignore errors only after the Playwright page has closed, and unexpected cleanup errors still fail the test. The current `npm run docs:testing-inventory:check` verifies all 661 inventory rows. This validates manifest consistency, not behavioral coverage by itself.

The Venn integration failure was a test-fixture mismatch. It changed the mocked CSS rectangle but left the published canonical graph dimensions unchanged, while UpSet correctly computes dot radii from that canonical frame. The fixture now changes/restores both canonical dimensions; previous focused integration Jest and Chromium UpSet live-resize evidence passed 14/14 and 3/3. No Venn renderer fix was warranted. The separate current list/cache/region A/B/A Chromium regression also passes 1/1 after the species-selection race fix below.

A separate Heatmap palette A/B test initially appeared to show state leakage because it changed the positive color to #ff0000, which is already the component default. The fixture now uses non-default #12ab34; the A/B check passes 1/1, with no palette leak established and no product patch warranted.

### Reproduced and paused — zoom-dependent shared SVG bounds

A current Chromium run with Histogram and Survival confirms the issue: zooming from 95% to 100% changes `getBBox()` while leaving the published viewBox/export unchanged; forcing a redraw then republishes a different right reserve and export width. Histogram changes from `582.963×362.771` to `582.245×362.771`; Survival changes from `621.776×362.771` to `622.716×362.771`. The canonical frame remains `360×360`. The current `graph.fixed-default-fit.spec.js` run also fails its exact export-size contract for both components. Source traces the measurement through `Shared.chartStyle.refineContentBoundsFromRenderedSvg()` and its `svg.getBBox()` call.

This needs one shared measurement contract that measures content in canonical, unscaled coordinates and only then projects the full envelope for display/export. Its consumers include legend measurement and rendered-content refinement across shared chart layout; a component-only correction would leave the same feedback path elsewhere. Per AGENTS.md rule 2, keep this production fix paused until the shared measurement design and consumer audit are ready. The exact export assertions remain strict.

### Box annotation/statistics coupling — architectural work remains open

Current source confirms `primeStatsComputation()` can call `handleStatsComputeClick()` when stored annotation projection fails, and the shared Box statistics model consumes annotation maxima as `rangeMax`/`overallRangeMax`. The focused ownership/whisker Jest checks pass 28/28, and the current browser restore/two-tab checks are being rerun. No display or tab-leak regression is established by this coupling. The needed bounded refactor separates owner-scoped numerical results, geometry-dependent annotation placement, and projection scheduling while retaining worker generation/signature guards and existing archive behavior. Per AGENTS.md rule 2, do not add a local workaround or remove the recomputation fallback before that design is reviewed.

### Rechecked, not confirmed — Heatmap view and Histogram plot-mode persistence

The handlers do omit their component-level persist helpers, which made them credible source candidates. That omission alone does not establish a bug: the shared document capture listener handles trusted browser input, resolves the tab from the event target's workspace root, and queues canonical capture for that owner. Current Chromium tests confirm both controls survive archive reopen: `heatmap.view` passed (1/1) and `hist.plot-mode` passed (1/1) in `component.ui-parameter-persistence.spec.js`. Remove these from the open-defect list. Keep the passing archive cases as regression evidence; revisit only if a real interaction path bypasses trusted capture or a bounded A/B/A test shows owner/payload disagreement.

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
**Current checkout recheck (2026-10-04):** the corrected Pie persistence path is no longer pending. `npx playwright test e2e/pie/pie.dataviews-color-label-resize-isolation.spec.js --project=chromium --workers=1` passed its same-type DataView/color/label/resize/reopen case (1/1).

`issues.txt` was intentionally left unchanged for this remediation because the user requested to remove/update the backlog item manually.

### A. P1 — crash-recovery checkpoint (closed for tracked controls)

The immediate checkpoint is now run at the end of trusted `input`, `change`, and eligible `click` events after their component handlers. It captures only after the event target resolves to the active tab and matching component root, updates that owner's canonical session payload, writes the existing local journal, and queues the existing IndexedDB journal path. `RECOVERY_DELAY_MS` continues to govern the richer archive snapshot; the immediate control path does not build that archive. Immediate Box control, journal, reload, and restored-render behavior passed the focused Jest and Chromium checks listed above. Mutations that do not pass through these tracked events remain subject to the candidate audit and their own session-write contracts.

### B. P2 — heavy mixed archive/recovery coverage (parked at review date; now enabled)

At the 2026-08-22 review, exactly two `test.fixme` tests remained in `e2e/recovery/heavy.mixed-tabs.reopen-recovery.canvas.spec.js`:

- mixed heavy Scatter tabs + heavy Box archive reopen (`:1012`)
- mixed heavy Scatter tabs + heavy Box crash recovery (`:1033`)

These were certification gaps, not evidence that the reviewed implementation necessarily failed. On 2026-10-04 both tests were enabled and passed in Chromium: mixed heavy archive reopen (2.4 minutes) and mixed heavy crash recovery (1.9 minutes). They verify restored previews and owner-specific cache invalidation after user edits. They are no longer parked coverage.

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

## Scanner candidates rejected during the original review

The static scanners intentionally over-report. The following representative candidate classes were checked and not promoted as current issues:

- **Current graph-file apply path:** owner/operation is pinned and freshness-validated; no active-sibling payload fallback was found in the repaired path.
- **Shared jobs/worker execution contexts:** current owner/session generation validation remains active even without a loading job.
- **Scatter main draw/stat continuations:** draw/session tokens and owner capture checks guard the reviewed late continuations; the former unconditional final-sync problem is gone.
- **Heatmap heavy worker/draw continuations:** reviewed paths carry owner/draw-generation or worker-token defenses; no matching durable tab leak was established.
- **Surface rotation callbacks:** reviewed rotation callbacks carry/validate the owning session; the open Surface issue is serialization size/performance, not isolation.
- **Shared table importer:** the data transaction was already owner-scoped in the original review. Its separately reported Box/Scatter overlay cleanup was fixed in the current source, as detailed above.
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

## Original runtime acceptance checklist

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
10. **Heavy mixed tabs:** keep the two heavy mixed archive/recovery tests enabled; both passed in Chromium on 2026-10-04. Repeat if a related ownership or cache path changes.

## Current conclusion — 2026-10-15

Three source defects from the prior recheck are fixed and have focused regression evidence. None was a reproduced durable write from one tab into another:

1. **Heatmap reopen fidelity — fixed.** Runtime-after-payload restoration now preserves `dendrogramSettings`, alongside the other payload-owned Heatmap settings. The real palette-picker/archive check now agrees across canonical payload, owner session, selector, displayed-scheme resolver, and rendered dendrogram stroke. The same-type parameter A/B/A + archive-reopen case passes.

2. **Grid owner guard — fixed.** `gridControls.isOwnerActive()` now permits callbacks only when both registered and active tab IDs exist and match. Its focused Jest tests cover exact match, mismatch, missing graph identity, missing active identity, and a queued panel-open rejected after owner change. Browser checks also open a Box Grid panel and confirm it closes when its Box tab deactivates.

3. **Shared style-panel deactivation — fixed.** AdditionalLine, Grid, and Dendrogram panels previously had no workspace deactivation hook, so a panel could remain open as its owning tab changed. `workspaceTabs.deactivateWorkspace()` now closes each panel only for its owner. Owner-mismatch unit cases pass; Chromium confirms Line AdditionalLine, Box Grid, and Heatmap Dendrogram panels are hidden after opening a second tab of the same type.

Heatmap view and Histogram plot mode remain non-defects: their real-control archive-reopen checks pass. The focused Heatmap checks pass 2/2; the targeted Grid Jest file passes 5/5; the standard same-type switch suite passes 11/11. These are bounded transition checks, not proof for every control or callback. The focused Box toolbar regressions also pass: one shared Label selector, independent A/B formatting through cached restore, and rejection of a retired selector callback after owner deactivation. The separate narrow-graph pairwise-label collision is fixed by reserving vertical lanes using measured label width; focused Box Jest and fresh/narrow/archive-reopen Chromium regressions pass.

High-impact source triage found the shared HOT callback candidates use a manager pool keyed by tab and table-local filter state; no cross-tab sink was found in the traced filter callbacks. The shared color picker records its anchor owner, closes on that owner's deactivation, and rejects stale eyedropper results by generation/owner/anchor. The eight active-owner-after-await candidates were previously traced to session/token checks before publication. The six ROC advisor callback rows now have individual owner-path dispositions and passed the same-type A/B and archive-reopen Chromium case (1/1). A delayed HOT column-reorder callback was also traced through its table instance and passed an A-to-B payload-isolation Jest case (5/5). These paths have focused ownership coverage, but that does not clear unrelated callbacks in those modules.

The highest-impact journal queue candidate was confirmed and fixed. `documentState.scheduleCanonicalJournal` used to overwrite the single pending request, while the writer stored only the tab named by that request. A controlled IndexedDB transaction test reproduced A/B/C updates leaving B's recovery record stale. Pending writes now merge the affected tab IDs; the test passes and confirms all three saved records are current. This was recovery fidelity loss, not a live session write into another tab. The separate pre-capture timing gap is now closed for tracked input/change/click controls: the active owner payload and existing local journal are updated after control handlers in the same event dispatch, before timer or IndexedDB work. Fresh in this continuation, the focused recovery/session Jest set passes 5 suites / 56 tests and the immediate Box control-change, reload, and recovery Chromium case passes 1/1. The existing journal remains the only per-input persistence path; no `.graph` archive is built per input. Line/Pie/Venn normal stamped-root A/B/A browser cases pass; source tracing found no valid owner transition that exposes an unowned connected sibling to these controls.

Running that recovery regression through the full DOM suite exposed an adjacent service-lifecycle defect: `documentState.bindUi()` registered an anonymous autosave listener, so `dispose()` could not remove it. A later autosave event then called into a null service state. The listener is now named and removed during disposal; a dispose/event regression passes. This did not reproduce a tab-to-tab payload write.

The scanner remains a prioritization tool, not proof of completeness. The verified current ledger contains 391 callback candidates across 126 files: 96 are safe by owner trace, 11 reproduced leaks, 3 owner-contract gaps (2 fixed and 1 open), and 281 lower-band candidates remain pending source trace. All 3 high and all 84 medium rows have dispositions. The ledger retains 200 historical candidates no longer emitted by the current scan; 176 still have pending reviews. Reconcile those historical rows with the original 407-candidate queue before closing the audit. Candidate counts and scanner scores are not defect counts. The JSON ledger carries scanner triage band, score, reasons, registration site, and await count alongside each manual disposition; these cues rank review only. Continue with the highest-ranked lower-band durable session/payload and delayed-work candidates, then reconcile the historical rows. Do not claim the program leak-free while any current or historical candidate remains unresolved.

### Reproduced and fixed — Venn manual species choice overwritten by automatic detection

A deferred Jest reproduction showed that an automatic species lookup could finish after the user selected a species and replace that selection in both the selector and the owner tab payload. The lookup retained the correct Venn owner; the defect was that `handleSpeciesSelectChange()` persisted the manual choice without cancelling the pending timer or invalidating the active species request. The handler now cancels that owner’s scheduled/in-flight detection before capturing and publishing the manual choice. The race regression failed before the change and passes afterward; the Venn UI-event file passes 7/7, the A/B/A list/cache/region browser case passes 1/1, and two delayed species-owner browser cases pass 2/2. This was stale same-owner async state replacing a newer user intent, not evidence of A writing into B.

The scanner's Box draw candidates were separately traced to captured-session checkpoints, draw tokens, and staged SVG publication guards. Significance-control Jest (4), Box isolation Jest (11), the focused Chromium A/B test (1), and ESLint on changed JavaScript passed in the prior Box repair. A broader DOM-project run also exposed one failing figure-summary test outside this audit slice and still needs separate triage. Full-worktree `git diff --check` reports trailing whitespace in unrelated pre-existing edits; reviewed files pass that check.

### Reproduced and fixed — Scatter render summary crossed tab owners

`renderScatter2dPointLayer()` wrote its completed render mode into `scatter.__lastLargeDatasetRenderSummary`, a single component-level object. That value was only consumed by a test hook, but overlapping same-component draws could replace the summary between tabs. A focused integration test created four points in A and three in B; after B rendered, asking for A's summary returned 3. The summary now belongs to `session.timers.drawRuntime`, and `getLargeDatasetRenderSummary(tabId)` reads the requested session and its own graph root. The regression failed before the fix and passed after it; the focused Scatter integration file passes 9/9, the same-type Chromium ownership case passes 1/1, and the large-Scatter browser test using the hook passes 1/1. This was a diagnostics-only leak, not a user-facing plot error.

The enclosing `drawScatter()` path has exact live-owner checks, but its completion contract was initially missed. `drawScatter()` can update the owner collection cache and mark it clean before the post-collection token check; a stale cancellation then returns `undefined`. `runScatterDrawCycle()` ignores the returned value and marks the runtime clean after any resolved call. The current ledger now records this as an open contract gap, not safe. This is a stale write to Scatter's originating owner session; no cross-tab payload copy was reproduced.

### Async draw completion recheck — 2026-10-15

The component comparison found inconsistent completion handling. It does **not** establish that every mismatch corrupts durable state; only the PCA behavior below has a bounded runtime reproduction, and the Scatter behavior is currently source-confirmed.

| Components | Current completion behavior | Finding |
| --- | --- | --- |
| Box, Line, ROC, Surface, Survival | Their cycle/public draw path checks an explicit `false` result and can label it cancelled. | Better reference behavior, but each renderer's return paths still need review; this alone does not prove every branch correct. |
| PCA | The cycle recognizes `false`, but stale async branches can return `undefined`; `drawPca` finalization clears `viewDirty` unconditionally. | Reproduced: delayed SVD completion after A→B clears A's pending view redraw. `dataDirty` remained set in a separate control. |
| Scatter | The cycle ignores the renderer result and marks render state clean after any resolved return. The renderer also updates/cleans its collection cache before a later stale-token check. | Source-confirmed stale owner-runtime update; bounded runtime reproduction remains pending. |
| Heatmap | The cycle passes through the result but records every fulfilled result, including `false`, as complete. | Status/finalization contract mismatch; durable state consequence not established. |
| Histogram | The draw returns `false` on cancellation paths, but the cycle ignores it and reports completion; public capture still has an exact live-owner guard. | Status mismatch; durable cross-owner capture was not established. |
| Pie | The draw result is returned to its caller, but the cycle's `finally` reports completion regardless of the result. | Status/overlay mismatch; durable state consequence not established. |
| Venn | `refreshDiagram` can return `false` on a stale checkpoint, while the cycle reports completion and clears pending draw state unconditionally. | Potential lost-work path; reproduce whether a newer queued owner request can be cleared before classifying it as a separate confirmed defect. |

The architectural defect is the missing consistent boundary between “render published,” “render cancelled/stale,” and “nothing to draw.” A small cross-component outcome contract is needed so each caller finalizes only the state allowed by that outcome. Keep rendering and component-specific cleanup in their current owners; do not add a general draw coordinator without a demonstrated net reduction in branches. Per the repository rule, pause component-only patches until this broader contract is designed and its call sites are mapped.

## Latest source recheck — 2026-10-16

- The current ledger has 391 candidates across 126 files: 130 safe by owner trace, 11 reproduced leaks, 3 contract gaps, and 247 pending lower-band synchronous candidates. All 3 high and all 84 medium candidates have dispositions; no await-bearing candidates remain pending. The ledger verifier reports no missing, stale, changed-source, bucket, scanner-summary, or disposition-count mismatches.
- Traced `js/main/session.js:2554:<anonymous callback>`, the highest-priority pending canonical-mutation queue callback. Its module-scope writes reset a pending map and a scheduling flag; the pending map is keyed by tab id. Ordinary tracked controls checkpoint after their handlers at window bubble. The timer handles propagation-stopped controls, resolves the same queued tab, and exits before `getPayload` or journal writes if that tab is no longer active. It cannot read the active sibling as the queued owner. Classified safe by owner trace; no source fix indicated.
- Fresh `npx jest --runInBand --runTestsByPath __tests__/dom/session.assignTabPayload.canonical-ui-events.test.js` passed 1 suite / 14 tests, including after-handler capture and the propagation-stopped fallback. This is focused evidence, not completion of the remaining candidate audit.
- Traced the shared HOT filter callbacks at `js/shared/hot.js:13013` and `:13064`. `activeColumnFilters` is local to one `createStandardTableAgGrid` instance; the table pool mounts/restores instances by component type and tab id. Added a two-table regression that applies different column filters and checks each filter model and visible row count remains independent. The existing filter suite passes 1 suite / 24 tests. Added explicit `DOM.hot-filter-owner-isolation` manifest evidence for this scenario.
- The current ledger retains 250 retired IDs, 192 pending. The earlier 407-row review has 176 historical rows pending recheck; the sets are not yet mapped one-to-one. Continue source-tracing current pending callbacks by durable sink/owner impact, then reconcile the historical queue before audit closure.

## PCA component-selection control leak — 2026-10-16

- Reproduced an inactive-root write in `js/components/pca.js`: while PCA tab B was active with an eigenvalue threshold of 82, firing tab A's retained threshold control changed B's threshold to 55. This was a control-owner gap in the existing active `pcaState` projection, not missing persisted statistics or a general session-manager failure.
- Routed PCA component rule, threshold, parallel-iteration, and include-non-retained events through PCA's existing `createOwnerControlBinder` boundary. The same source review found and owner-bound the dynamic biplot sample-score toggle, loadings-limit input, and example-load button; the desktop example-load entry now also resolves and validates its owner.
- The A/B regression covers all four component-selection settings. `pca.view.test.js` and `pca.viewCache.test.js` pass 2 suites / 11 tests. The cache test was updated to use an explicitly three-dimensional dataset and the shared SVG text-geometry test shim; its previous assertion targeted a hidden thickness input as if it were a visible labeled field and could not reach a valid 3D render with its example fixture.
- Ledger dispositions now read 391 current candidates: 136 safe by owner trace, 12 reproduced leaks, 3 contract gaps, and 240 pending lower-band synchronous candidates. The PCA threshold candidate records the reproduced leak; sibling handlers in the same family record their current owner-bound paths. The 250 retired IDs still include 192 pending, and the original 407-row list still has 176 historical items awaiting identity reconciliation.
- Next review: rank the remaining lower-band callbacks by durable sink and inspect the pending Histogram `state` writers first; establish whether each closure writes an owner session or only an active projection before choosing runtime tests.

## Histogram control and import source review — 2026-10-16

- Traced the pending Histogram distribution, plot-mode, series-layout, legend, statistics, PDF/CDF, font-size, and import-picker callbacks. The 21 scanner rows in this family are not evidence of 21 separate defects: their control paths resolve the event's stamped tab, require `canOwnerUseLiveProjection` to match the active session/root, and commit or schedule against that owner. Import selection additionally captures the owner HOT before `Shared.tableImport` and keeps it through async completion.
- Added a two-Histogram regression that sets distinct owner state, fires an inactive A legend event while B is active, and verifies neither session changes. The focused Jest case passed 1/1. The existing async import isolation case passed in Chromium 1/1, and shared table-import transaction coverage passed 3/3 in the earlier checkpoint. Classified the 21 reviewed scanner rows safe by owner trace; no Histogram source fix indicated.
- Updated ledger: 391 current candidates; 157 safe by owner trace, 12 reproduced leaks, 3 contract gaps, 219 pending lower-band synchronous callbacks. All 3 high and 84 medium candidates remain disposed; no await-bearing candidates remain pending. The retired and original 407-row queues remain unreconciled.
- Next priority is determined by actual sink, not scanner score alone: inspect remaining candidates that can overwrite session/payload/data/results first, then ref/control-only candidates. Continue ranking and validating each family rather than treating a high candidate count as defect count.

## Line and Scatter axes-length control leak and projection fix — 2026-10-16

- Reproduced the inactive-control write in both components before the fix: stale Tab A axes-length events changed Tab B through the active module mirrors. Fixed all three controls in each component with the existing owner-bound handlers.
- Rendered-browser validation exposed a second part of the same ownership defect: the shared resizer relocates these controls into `.graph-controls-header`, while Line and Scatter searched inside `.svgbox`. Line’s activation sync therefore held null control references; Scatter also lacked an activation sync call. Both now resolve controls through `Shared.resizer.getGraphControlsHost`; Scatter runs its existing sync after owner activation.
- Added a real Chromium A/B/A regression that dispatches retained inactive controls, checks the active session and rendered state, and confirms the original tab projects its own settings when reactivated. Chromium passed 2/2; `line.view.test.js` plus the Scatter owner regression passed 2 suites / 8 tests.
- The refreshed ledger has 387 current candidates: 155 safe by owner trace, 18 reproduced leaks, 3 contract gaps, and 211 pending lower-band callbacks. It passes `--check` with no missing, stale, changed-source, or count mismatches. The ledger has 360 retired rows (359 unique IDs), 278 pending; the older 407-row audit still has 176 pending historical rows. These inventories remain unreconciled.
- Next: source-trace the pending Heatmap worker-session callbacks, then continue ranking by the actual session/payload/data/result sink rather than scanner score.

## Heatmap clustering worker owner trace — 2026-10-16

- Traced both pending callbacks in `resolveCluster`. The worker tab id comes from the draw's explicit async metadata, and `workerSession` is resolved once from that id before scheduling. Success and failure update only that captured session's `workers` map; success also stores the reusable result in that session's `completedClusters` cache. The shared async-scope generation map is keyed by tab id.
- Added a controlled A/B test that starts two worker tasks for A, activates B, then resolves one and rejects the other. The records and completed result land only in A; B remains empty. The focused regression passed.
- Classified both scanner candidates safe by owner trace. No production behavior fix was indicated; the test hook exposes the existing resolver only to the established component test-hook object.
- The 387-row ledger now has 157 safe traces, 18 reproduced leaks, 3 contract gaps, and 209 pending traces. Continue ranking the remaining candidates by their actual final sinks; scanner scores remain triage only.

## Heatmap runtime-test contract correction — 2026-10-16

- The full Heatmap context file exposed a stale test assumption: its “non-payload” runtime fixture set `dendrogramSettings` and `labelPositions`, both serialized in payload config, while leaving Tab B's payload at defaults. Reopen/switch correctly applies payload-owned values, so preserving the runtime-only fixture value was not a valid isolation contract.
- Confirmed the expected runtime snapshot for B remained owner-keyed after switching away. Added a real Chromium control test that edits dendrogram mode, thickness, and color, verifies the session and payload write-through, opens another Heatmap tab, then returns and checks the owner controls and rendered graph. Chromium passed 1/1; the sibling retained its independent default color.
- Removed payload-owned fields from the runtime-only Jest contract. No production fix was justified by this failure; real interaction, persistence, projection, and same-type isolation passed.

## Pie advisor reset callback source trace — 2026-10-16

- Traced `js/components/pie.js:3966`. `renderPieStatsControls` passes its explicit owner session to `renderPieStatsAdvisor`; the reset callback captures that session and exits unless it is still the active Pie projection.
- The callback mutates only the captured session's advisor state. `rememberPieStatsState` and `persistPieStatsTabState` carry that same owner tab id to persistence, so the active sibling is not used as a fallback sink.
- Classified safe by owner trace; no source fix indicated. The standalone reset-click test fixture did not reach the advisor-open state and was not counted as validation. Existing Pie tab-session integration coverage remains the bounded test evidence.
- Ledger verifier passes: 387 current candidates; 158 safe by owner trace, 18 reproduced leaks, 3 contract gaps, and 208 pending source traces. Historical retirement reconciliation remains open.

## Shared resizer aspect-lock integration — 2026-10-16

- Corrected the browser helpers to locate detached lock controls through `Shared.resizer.getGraphControlsHost`. The old `.svgbox .resizer-aspect-checkbox` selector missed controls placed in `.graph-controls-header`.
- Chromium reproduced Line/Scatter remaining unchecked after switching to 3D and Pie remaining unchecked in forced Pie mode. Venn and Surface enforcement passed.
- Fixed Line, Scatter, and Pie to call the resizer API through the active owner's SVG-box reference. The tests now assert the checkbox and persisted graph layout. The archive comparator omits `sharedState.layout.resizer`, which is a runtime mirror; it still checks the saved `layoutState`, active resizer API, visible mode, and checkbox.
- Focused Chromium lock-ratio matrix passed 9/9; after the Scatter owner-listener change, its 3D enforcement, A/B archive, and 2D/3D control cases passed 3/3.

## Scatter stale-owner view-mode leak — 2026-10-16

- Added a controlled A/B regression with workspace tab B active and the component's bound id deliberately stale at A. Before the fix, changing B to 3D wrote `viewMode: 3d` into A's session. This confirmed a cross-tab write in the pending callback, beyond the resizer defect.
- Routed the view-mode change through `bindScatterControlListener`, which resolves the event owner and rejects the active-workspace/component-owner mismatch before the callback runs. The pre-fix test failed; the post-fix `scatter.axesLengthOwnerIsolation.test.js` suite passed 2/2. The scanner now recognizes this existing owner binder.
- Revalidated adjacent async Line candidates against identical retired function identities: file open and Prism import callbacks remain owner-scoped. Their four focused Jest suites passed 90/90.
- Current ledger: 387 candidates; 160 safe, 13 reproduced leaks, 3 contract gaps, 211 pending. The current pending set has no high, medium, or await-bearing candidates. There are 424 retired rows (421 unique IDs), with 315 pending; the separate original 407-row review still has 176 historical rows pending identity reconciliation. Inventory checks pass at 665 rows and manifest contract at 17/17.
- **Next exact step:** source-trace the pending Pie advisor callback at `js/components/pie.js:3823`, following its captured session through the state write and persistence sink; compare sibling advisor paths before deciding whether an A/B test is needed. Continue current and historical reconciliation without treating scanner scores or suite counts as proof.

## Example-data action owner audit — 2026-10-16

- Pie's example-load callback resolves the event owner through `runPieControlOwner`, loads through that session's HOT manager, captures into that session, and schedules its tab id. A retained A button leaves both A and B data unchanged; the focused integration regression passes.
- The sibling comparison found a real shared-pattern gap: Box already uses its owner binder and Histogram/Pie validate the event owner, but Line and Scatter attached example callbacks directly. With B active, retained A buttons loaded the example into B. Both pre-fix regressions reproduced the write; both callbacks now use their existing component owner binders and pass post-fix tests.
- Current ledger: 387 candidates; 164 safe owner traces, 15 reproduced leaks including repaired findings, 3 contract gaps, and 205 pending. No current high-, medium-, or await-bearing candidates are pending. Retired queue remains 424 rows / 315 pending; the separate original 407-row audit has 176 historical rows pending identity reconciliation. Testing inventory remains 665 files; explicit requirement evidence is being regenerated after these scenarios.
- **Next exact step:** trace the pending ROC statistics-control family beginning at `js/components/roc.js:4289`. Follow its event-owner gate through `state`, session commit, invalidation, persistence, and draw sinks; compare the equivalent Box/Scatter control flow and classify only after the same-owner boundary is proven. Continue to prioritize durable state and data sinks.

## ROC runtime-control stale-owner leak — 2026-10-16

- The ROC statistics callbacks around `js/components/roc.js:4289` are protected by `runRocControlOwner`: it resolves the event tab, checks `isRocSessionActive`, then commits and persists through that owner. The import picker also uses the shared owner binder. These candidates are source-traced safe.
- Grid/frame/legend/graph-type/runtime controls were a different path. They resolved a session but did not reject inactive owners before `syncRocRuntimeControlsFromEvent` merged the event target with active module controls. A controlled A/B regression reproduced B's `graphType: pr` and A's grid event being combined and written into A's durable controls.
- Routed the state-changing ROC controls through `bindRocControlHandler`, preserving the existing component boundary. The focused Jest file passes 2/2 and the scheduled draw/auto-draw/reopen Chromium contract passes 1/1. Existing ROC statistics callbacks needed no production change.
- Current ledger: 387 candidates; 175 safe owner traces, 16 reproduced leaks including fixed findings, 3 contract gaps, 193 pending. Retired queue: 425 rows / 422 unique IDs / 315 pending. The old 407-row audit has 176 historical rows pending identity reconciliation.
- **Next exact step:** trace the highest remaining durable Line toolbar callback `js/components/line.js:6411:applyLiveValue`. Follow its setting from event owner through session/payload persistence and compare Line/Scatter/Box shared toolbar bindings; reproduce only if the source path leaves an owner mismatch possible.

## Line display-mode stale-owner leak — 2026-10-16

- A retained display-mode control in Line tab A changed active tab B from line to area. The A/B integration test reproduced the session write before the fix.
- The callback bypassed Line's existing owner-control binder, changed the module display-mode mirror, and scheduled against the active projection. Routed it through `bindLineControlHandler` and passed the resolved owner tab id into structural draw options. This is a missing use of the existing ownership boundary; the source trace does not indicate a need for a larger lifecycle refactor.
- The stale-owner regression and active multi-series area-rendering test pass (2/2). Line source, test, and scenario-catalog syntax checks pass; test inventory and manifest contract pass.
- Current ledger: 387 candidates; 175 safe owner traces, 16 reproduced leaks including repaired findings, 3 contract gaps, and 193 pending. Retired rows: 436 / 430 unique IDs / 324 pending. The original 407-item audit still has 176 historical rows pending identity reconciliation.
- **Next exact step:** trace `js/components/line.js:6411:applyLiveValue` through its owner, session/payload persistence, and equivalent Scatter/Box bindings. Classify from the final state sink; reproduce only if source leaves an owner mismatch possible.

## Line grouped uncertainty toolbar owner trace — 2026-10-16

- `syncLineUncertaintyToolbarControl` stamps its active inline panel with the Line projection tab id. The live transparency handler requires a connected control and matching owner/projection before it updates the backing input; the backing listener redraws the same projection.
- Compared with `Shared.additionalLineControls`, whose shared controls also require an active owner. This Line-only panel uses a local active-owner guard; no cross-tab write was found, so no production change was justified.
- Chromium A/B/reopen contract passed 1/1 with distinct uncertainty settings restored per tab. Both the current and matching retired source rows are classified safe.
- Current ledger: 387 candidates; 176 safe owner traces, 16 reproduced leaks, 3 contract gaps, 192 pending. Retired rows: 436 / 430 unique IDs / 323 pending; the original 407-item audit has 176 historical rows pending identity reconciliation.
- **Next exact step:** trace the remaining Line SVG overlay callback `js/components/line.js:8182:handler` to determine whether its interaction can still run from an inactive tab and where its mutations land.

## Line SVG overlay callback reachability — 2026-10-16

- The click callback is synchronous and updates only the active Line overlay-toolbar scope before opening its active toolbar. It is attached to overlay nodes created during an owner-scoped draw or rehydrated into a validated owner cache.
- A/B DOM inspection found the old SVG overlay disconnected after switching owners; the inactive control is no longer in the rendered document. No async completion path or durable write occurs in the callback itself. Classified current and identical retired rows safe; no source change indicated.
- Current ledger: 387 candidates; 177 safe owner traces, 16 reproduced leaks, 3 contract gaps, 191 pending. Retired rows: 436 / 430 unique IDs / 322 pending; the original 407-item audit still has 176 historical rows pending reconciliation.
- **Next exact step:** trace Line's replicate-count callbacks at `js/components/line.js:17856` and `:17870`, following table transformation and state/payload sinks. Compare Line with the equivalent Scatter/Box controls; prove their owner behavior before classifying.

## Line and Scatter table-structure control leaks — 2026-10-16

- Reproduced two Line leaks: stale Tab A replicate-count and table-format events reshaped active Tab B's HOT table and grouped state. Bound both callbacks with Line's existing owner binder.
- Compared sibling behavior. Box already binds grouped replicate changes to its owner. Scatter had the same direct-listener gap in table format, replicate count, and grouped-X controls; A/B tests reproduced all three. Routed them through `bindScatterControlListener`, which resolves and validates the event session before callback mutation.
- Line focused tests pass 4/4; the full Scatter owner-isolation integration file passes 6/6. Scenario entries were mapped directly, test inventory passes at 665 rows / 1020 explicit evidence, manifest contract passes 17/17, and source syntax checks pass.
- The table-format Scatter callback was absent from the scanner ledger because its write and HOT transformation happen inside the called `applyScatterTableFormatMode` helper. This is a confirmed scanner recall gap; the repaired leak is tracked outside the 387 emitted-candidate dispositions. Add same-file helper-sink tracing before treating candidate review as comprehensive.
- Current emitted-candidate ledger: 387 candidates; 177 safe owner traces, 20 reproduced leaks, 3 contract gaps, 187 pending. Retired rows: 455 / 446 unique IDs / 339 pending. Historical 407-row reconciliation remains at 176 pending.
- **Next exact step:** extend the scanner to include bounded local-helper mutation sinks, with a focused test proving the Scatter table-format callback is emitted and safe callbacks are not indiscriminately expanded. Then regenerate and reconcile the ledger before selecting the next component candidate.

## Current recheck — 2026-10-16

### P1 recovery checkpoint revalidated and extended

The original gap was a trusted control event marking the session dirty before the component handler had committed its final value, while the canonical journal waited for a deferred owner capture. The current shared listener checkpoints at window bubble after the component handler: it resolves the event target's stamped tab and component, captures that owner's canonical session state, writes the existing local journal synchronously, and queues the existing IndexedDB journal path. It does not build the richer recovery archive for each input. The immediate Box regression inspects the owner payload and local journal during the same change event, reloads into recovery, and verifies the active controls and rendered graph; a fresh-context `.graph` reopen now verifies the same values. Chromium passes 1/1; four focused session/journal Jest files pass 48/48. This closes the tracked-control gap; other mutation paths remain subject to the candidate review.

### Scanner helper recall gap fixed; candidate queue expanded and reclassified

The prior scanner missed Scatter's table-format callback because it had no direct captured write. The new bounded scan follows one same-file identifier helper and reports the callback's `scatterTableFormat` writes and HOT mutation methods. The old direct-write scan finds 391 current candidates; the default helper-aware scan finds 778 across 126 files, adding 387 helper-only rows. It skips local-only mutations, includes helper sinks in module-scope filters and ledger cues, and leaves guard ordering through a helper unresolved. The focused scanner fixture and production Scatter check pass 2/2. The ledger verifier passes with 177 safe owner traces, 21 reproduced leaks (including the repaired Scatter format leak), 3 contract gaps, and 577 pending traces. It has 455 retired rows / 446 unique IDs / 339 pending; 176 rows from the original 407-candidate review still need historical identity reconciliation. One-helper static tracing does not cover object-method/dynamic dispatch or prove safety; keep every remaining candidate in source review.

### Named open findings rechecked

- **Box annotation/statistics coupling remains architectural work.** Current `primeStatsComputation()` still calls the full calculation path when stored annotations cannot be projected, and `Shared.boxStatsModel.createRangeHelpers()` still puts rendered annotation maxima into statistical result geometry. Current focused Box stats/ownership Jest passes 41/41; the two-tab selector/settings/reopen and saved-significance restore Chromium checks pass 2/2. No user-visible leak was reproduced. Keep the bounded refactor in `issues.txt`: separate owner-scoped numerical results, frame-dependent annotation placement, and projection scheduling; retain the current renderer, signatures/generations, deferred worker results, archive compatibility, and grouped-mode behavior. Do not add a coordinator or remove recomputation fallbacks until result invariance and zero unnecessary recalculation are measured.
- **The earlier test-manifest mismatch remains resolved, but a new test exposed the same governance gate.** `auditTabLeakSurfaces.helperCalls.test.js` initially had no reviewed scenario mapping. Added its explicit scanner-helper scenario, regenerated the inventory, and verified 666 rows; the manifest Jest contract passes 17/17.
- **Zoom-dependent graph bounds remain reproduced.** The current fixed-frame Chromium cases fail for both Histogram and Survival: actual-size/redraw changes export width from 582.962 to 582.245 and 621.776 to 622.716 respectively. `chartStyle.refineContentBoundsFromRenderedSvg()` still revises canonical bounds from `svg.getBBox()`. This requires the shared zoom-independent measurement boundary and consumer audit already described in `issues.txt`; do not patch a component or relax exact export checks.
- **The Venn UpSet resize issue remains a fixture mismatch, not a renderer defect.** The fixture now updates canonical graph dimensions as well as its CSS rectangle, matching UpSet's sizing authority. All three current UpSet live-resize Chromium cases pass 3/3; no Venn production change is indicated.

**Next exact step:** recheck the open cross-component draw-completion contract in `issues.txt` against current PCA/Scatter code and its delayed-switch regressions. Determine whether the minimal shared result contract is already implemented or still needs a shared refactor; keep the component renderers owner-specific. Then resume the highest-impact pending callback rows by durable sink and async reach, updating this ledger after each disposition.

## Continued ownership review — 2026-10-16

- The pending draw-completion review is complete for the cited PCA and Scatter cancellation cases; their owner redraw regressions are passing. A source/runtime check of Line's delayed draw also found the existing behavior sound: its frame scheduler carries the owner tab, execution checkpoints reject stale work, tab deactivation deliberately clears transient `drawPending`, and activation redraws that owner's graph. The A/B Line regression verifies B remains unchanged and A redraws on return. An exploratory assertion that `drawPending` survive deactivation was invalid and was removed; no Line code change was made.
- A/B activation tests confirmed same-type save-target metadata defects: Heatmap, Histogram, ROC, and Surface copied A's file handle into an empty B; Histogram and Pie also lost the saved filename from the durable snapshot. The fixes now project/capture metadata from the exact session. A separate Survival regression reproduced the same handle copy; its session projection no longer falls back to the previous active handle, and its save methods now read the owner session. The six-component graph-save API matrix passed 6/6; the Survival regression failed before the fix and passes 1/1 after it. The matrix stubs fileIO and verifies component API arguments/session state; it is not a test of the Main workspace archive-save toolbar.
- Traced all 24 scanner candidates that reach `saveGraphFile` or `saveGraphFileAs`. Component callbacks pass the captured tab owner and session setters; shared fileIO keeps the operation owner through Save As, resolves inactive-owner data from that tab's canonical payload, and validates setters. DataViews export passes a prebuilt Blob and does not mutate graph-session state. All 24 are classified safe by owner trace; the metadata restore defects above were in session projection/snapshot paths, not these final file-write callbacks.
- The refreshed ledger is 798 candidates across 126 files: 222 safe owner traces, 24 reproduced leaks including repaired findings, 2 contract gaps, and 550 pending. Triage bands are 32 high, 183 medium, and 583 lower; these are rankings, not dispositions. Retired records: 1,142 rows / 591 unique identities / 838 pending. The historical 407-row queue still has 176 identity reconciliations pending. One-helper static analysis still misses dynamic and object-method dispatch and does not prove safety.
- The new Survival regression is explicitly cataloged. `npm run test:inventory:check` passes with 672 files and no legacy-unmapped tests; the test-manifest and shared graph-file ownership contracts pass 63/63. A repeat combined Jest run was stopped after over a minute without output because the same matrix had already passed and the runner showed the previously observed high-memory stall; that stopped run is not counted as a pass.
- **Next exact step:** continue from the refreshed ledger, starting with the highest-ranked pending medium candidate after the Line/Pie source traces, and record its actual owner-to-sink path before choosing a bounded test. Keep the audit open until all 798 current rows and the historical 407-row identities are accounted for.

## 2026-10-16 continuation — scanner attribution and owner-path checks

This section supersedes the older candidate totals and next-step note above. The audit remains open.

- **Scanner callback attribution corrected.** `addReferencedFunction()` previously mapped a registered identifier to every function sharing its name, even when lexical scope resolved it to one nested function. A synthetic shadowing test reproduced the false registration (the outer `cancel` was attributed to the nested timer); it failed before the scanner change and passes after. The production `dom.js` scan now attributes the timer only to `queueSvgKeyboardFocusRestore`'s nested `cancel` at line 2786; the former `makeEditable` row at line 2453 is retired with the false site recorded. Scanner tests pass 3/3. Lexically resolved identifiers are used; name fallback is allowed only when unique.
- **Venn draw ownership defects fixed.** The public inactive-tab draw regression showed `venn.draw({tabId:A})` rebinding active B's projection; the shared `workspaceTabs.ensureActiveDomBindings()` now rejects inactive or conflicting requested owners before root reads or rebinding. The all-component same-type switch/persistence Chromium matrix passes 22/22. A second controlled test showed disposal of A made a late draw finalizer clear B's pending work through an implicit active-session fallback. Venn pending-state cleanup now requires the captured session; the red/green A-disposed/B-pending test and full Venn cancellation suite pass (7/7).
- **Venn species cache completion is owner-bound.** Deferred GO and STRING pre-analysis tests switch A→B before species resolution completes and inspect both tabs' caches and payloads; all three relevant Chromium cases pass 3/3. Persistence validates the captured owner session/generation and updates that session's runtime. The Venn runtime/cache Jest suites pass 5/5.
- **Shared projection and async paths source-traced.** Axis and Dendrogram document click handlers only dismiss their projected panels; exact-owner deactivation closes them, and the shared panel suite passes 7/7. Line and Scatter draw paths reject stale owner work at their session/token checkpoints; their delayed A/B regressions pass. Archive restoration is an intentional document replacement protected by one active transaction and an interaction lock; its transaction browser contract passes 3/3. EyeDropper results retain owner, operation token, generation, anchor, and target; the cross-component stale-result Chromium matrix passes 9/9. HOT copy/cut completes against the creating table instance; the system clipboard and its single outline owner are intentionally document-global. Archive blob construction serializes only its explicit cloned tab snapshot and does not resolve active session state after awaiting ZIP setup.
- **Current ledger:** 790 candidates across 126 files; 261 safe by owner trace, 32 reproduced leaks (including repaired findings), 3 contract gaps, and 494 pending source traces. Triage bands are 32 high, 178 medium, and 580 lower; they rank review only. Retired rows: 1,479 / 532 unique identities / 1,063 pending. The original 407-row audit still has 176 historical identities awaiting reconciliation. Ledger rebuild and `--check` pass with no missing, stale, changed-source, bucket, or count mismatch. A single-helper scan still does not cover object-method or dynamic dispatch and does not prove safety.
- The test inventory regenerates and verifies at 673 rows with 1,058 explicit requirements, zero inferred requirements, and all 9 critical requirements covered; the test manifest contract passes 17/17. The four named rechecks above remain as previously recorded: Box annotation/statistics coupling needs the bounded architecture split; zoom-dependent Histogram/Survival bounds require the shared measurement refactor; UpSet resize is a fixture mismatch; the manifest mismatch is resolved.

**Next:** continue the rank-ordered ledger at the highest remaining plausible owner-to-sink paths. The current candidate review is not complete, and no leak-free claim is warranted.

## 2026-10-16 continuation — queue triage and delayed paste ownership

This section supersedes the candidate and retired-row counts above. The review remains open.

- **Candidate sorting:** `scripts/sort-tab-isolation-review-queue.cjs` groups rows only when file, registration helper, and sink signature match; it never merges dispositions or treats a wrapper name as proof. It places async/shared/durable writes ahead of synchronous owner-bound callbacks, while exposing a fast-trace lane for likely false positives. Queue tests cover independent row disposition, route grouping, and risk ordering. The current output is 483 pending rows across 51 files and 378 review routes; 95 synchronous rows in recognized owner-wrapper routes are candidates for quicker individual tracing. The top risks are Pie draw, Scatter canvas collection, PCA, ROC, and Venn async work. The scanner reports no durable sinks among the pending rows; this means those surfaced sink candidates were already individually classified, not that the remaining queue cannot reach durable state.
- **Scatter draw:** traced the async cycle, draw-session resolution, yield/token checks, explicit owner DOM root, and final session/module sync. Its bounded A→B test verifies cancellation leaves A dirty and leaves B's session, payload, table, and active owner untouched. Classified safe by owner trace; the regression passes 1/1.
- **Clipboard outline leak fixed:** a delayed Box A paste could clear a newer outline belonging to B after awaiting clipboard extraction. Both HOT's registered paste handler and the public `tableImport.handlePaste` helper now capture outline owner/revision before awaiting and conditionally clear that exact generation. The Box delayed A→B test failed before the root fix and passes; a direct delayed helper regression and same-table recopy token test cover stale generations. The Venn delayed-paste sibling case also passes. Focused Jest suites pass 23/23 and the Box/Venn browser batch passes 4/4.
- **Current ledger:** 790 candidates across 126 files; 270 safe by owner trace, 34 reproduced leaks including repaired findings, 3 contract gaps, 483 pending. Triage bands are 32 high, 178 medium, 580 lower. Retired rows are 1,514 / 565 unique identities / 1,090 pending; the historical 407-row set still has 176 identities pending reconciliation. Ledger rebuild/check passes. The test inventory verifies 674 rows and 1,061 explicit requirements; manifest and queue contracts pass 19/19.
- **Limits and next work:** route counts and static cues prioritize review only. A route may share setup but still requires tracing each callback to its sink; no candidate is auto-discarded. One-helper scanning can miss object-method and dynamic dispatch. Continue with the highest-ranked pending Pie/Scatter/PCA/ROC/Venn paths, using delayed owner-switch tests where the source trace identifies a plausible stale-owner write. No leak-free conclusion is justified yet.

## 2026-10-16 continuation — Pie draw owner trace

- The Pie async cycle was traced from scheduled owner metadata through the captured session, explicit owner plot root, execution/draw-generation checkpoints, staged SVG commit guard, active-owner-only capture, and tab-keyed overlay completion. A delayed A→B regression pauses the production graph operation, switches to B, releases A, and checks both payloads/sessions/tables plus B's rendered plot. It passes with A reported cancelled and B unchanged. The Pie candidate is classified safe by owner trace; the two focused integration cases pass 2/2.
- The queue now has 482 pending candidates. Ledger totals: 790 current candidates across 126 files; 271 safe, 34 reproduced (including repaired), 3 contract gaps, and 482 pending. The new Pie scenario is explicit in the manifest; inventory has 674 rows and 1,062 explicit requirements with no inferred requirements. Static prioritization remains a shortlist only.
- **Next:** inspect the highest remaining candidate, `scatter.js:21801:renderScatterPointCanvasBucketCollection`, tracing its caller and the actual SVG/canvas sinks before deciding whether a delayed A/B test is needed.

## 2026-10-16 continuation — Scatter canvas frame cancellation

- The high-ranked Scatter canvas candidate was a real async lifecycle leak. The render awaited a tab-scoped animation frame; tab deactivation cancelled its RAF, but the promise had no owner cleanup and remained pending, so the owner draw never emitted `draw-settled`. The candidate's rendered group is staged and token-checked, so evidence points to a stuck owner draw rather than a write into the sibling.
- The production A→B regression holds the exact canvas frame callback, switches to another Scatter tab, and checks the original draw outcome plus the sibling payload, table, and plot. It timed out before the repair and passes after with a cancelled outcome. The root fix binds the frame wait to `drawTabId` and registers its settle-once resolver in the same owner async scope; stale completion returns through the existing staged-frame cleanup. Both render modes share this path.
- Compared component code: Scatter is the only component with a promise waiting on `scheduleComponentFrame`; the shared scope already supports owner-specific cancellation cleanup, so this did not require a cross-component lifecycle redesign. Individual candidate rows for the canvas helper, wrappers, renderer, draw, and cycle are recorded independently in the ledger.
- Verification: delayed canvas A→B browser test 1/1; large-dataset Scatter render/update browser test 1/1; cancellation and render-cache Jest suites 2/2. Ledger rebuild/check passes.
- **Current ledger:** 790 candidates across 126 files; 273 safe by owner trace, 35 reproduced leaks including repaired findings, 3 contract gaps, and 479 pending. The risk-sorted queue has 375 routes across 51 files, with 95 rows in the fast-trace lane; the highest remaining paths are PCA draw/control, ROC draw/snapshot, and Venn GO/STRING. Retired rows: 1,514 / 565 unique identities / 1,090 pending; 176 identities from the original 407 remain unreconciled. These are review counts, not proof of completeness.
- **Next:** source-trace PCA's delayed draw path, then continue the async/shared candidates in queue order.

## 2026-10-16 continuation — PCA async candidates

- `pca.js:12774:drawPca` is safe by owner trace: the draw captures its session/tab, checks token and async-scope generation after each of five worker/SVD awaits, guards staged publication, and only clears owner dirty state or writes cache after completed rendering. A delayed-SVD A→B regression confirms the owner stays dirty during cancellation and redraws correctly when reactivated (1/1).
- `pca.js:19703` file-input callback is safe by owner trace. Its binder validates the initiating tab; it captures that tab's HOT and id before awaiting. Shared `tableImport` applies rows and payload to the HOT's owner transaction, gates PCA active-mirror callbacks on that same owner being active, and gates final draw/completion callbacks with the transaction tab id. The delayed FileReader A→B owner-transaction regression passes (1/1); B's table and payload stay unchanged.
- Current ledger: 790 candidates across 126 files; 275 safe owner traces, 35 reproduced leaks including repaired findings, 3 contract gaps, and 477 pending. The sorter reports 373 routes and 95 synchronous owner-wrapper rows in its fast-trace lane; these are review aids only. Retired records: 1,550 rows / 565 identities / 1,120 pending. The historical 407-row queue still has 176 identities awaiting reconciliation.
- Ledger verification passes with no missing, stale, changed-source, bucket, or count mismatch. The sorter reports 8 pending await-bearing callbacks and no scanner-detected durable sinks among pending candidates; this only describes the bounded scanner's cues.
- **Next:** source-trace the remaining highest-ranked ROC draw/snapshot and Venn GO/STRING async paths, adding a bounded delayed-switch test where the path leaves an owner ambiguity.

## 2026-10-16 top-priority callback recheck

The current risk sorter and ledger were rechecked after the latest owner traces. All 11 rows in the highest-priority batch are accounted for individually: ROC snapshot readiness at `js/components/roc.js:8821` was a reproduced active-sibling fallback leak and is fixed with exact explicit-owner resolution; ten shared callbacks are safe by owner trace (color schemes, lifecycle waiter timeout, Grid and significance outside-click projection, publication-style hint projection, per-container resizer, global selection policy, and three workspace-toolbar gesture/blur paths). See the candidate ledger for each row's owner path, final sink, and evidence.

Focused validation: 9 Jest suites / 99 tests, 2 selected Chromium cases, 19 manifest/queue tests, and testing-inventory checks for 674 rows passed. A broader style-control matrix run timed out in PCA/Pie and then observed PCA state during Line; this is recorded as a test reliability issue and is not evidence of a product leak.

Current ledger: 790 candidates across 126 files; 288 safe, 36 reproduced including repaired findings, 3 contract gaps, and 463 pending. The sorter reports 361 routes across 50 files and 95 fast-trace rows. The original 407-row queue still has 176 historical identities awaiting reconciliation. The bounded scanner may miss object-method/dynamic dispatch; its cues do not prove safety or completeness. No leak-free conclusion is justified.

The next ranked rows are `pca.js:4082:runPcaSvdWorker`, `pca.js:4149:runPcaEmbedWorker`, and `hot.js:13614:action` (priority 50), then `scatter.js:25545:checkpointScatterDraw` (priority 40). Review stopped at the user's requested top-candidate boundary.


## 2026-10-16 priority-50 candidate recheck

The next three ranked candidates were traced individually. Both PCA worker helpers are safe by owner trace: all internal callers pass the initiating draw session; invocation records and completions stay in that session; each draw rejects stale results after the await. The shared HOT header-menu paste action is safe by owner trace: it retains its table instance/container through the clipboard await and commits through that instance’s stamped tab owner. A delayed Chromium A-to-B test verifies both table and payload ownership, B’s visible grid, and A after reactivation. The existing PCA delayed-switch test verifies the caller cancellation guard but does not delay `Shared.Workers.runTask`; the worker paths were source-traced and no sibling sink was found.

Ledger: 790 candidates across 126 files; 291 safe, 36 reproduced including repaired findings, 3 contract gaps, and 460 pending. The sorter reports 359 routes across 50 files. The original 407-row queue still has 176 historical identities awaiting reconciliation. Static scanning remains a shortlist and does not prove completeness.

Validation: AG Grid active-tab-paste Chromium spec 3/3 (including delayed header-menu case 1/1); focused PCA delayed-cancel Jest test 1/1; manifest/queue tests 19/19; testing inventory 674 rows / 1,065 explicit requirements; ledger check passes. Stopped after this priority-50 group. The next ranked Scatter checkpoint (`scatter.js:25545`) remains unreviewed.