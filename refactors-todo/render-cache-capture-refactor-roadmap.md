# Graphitix render-cache capture refactor roadmap

Status: implementation complete for all eleven current component adapters; the shared legacy rollback branch remains intentionally supported for unmarked compatibility captures.
Audit date: 2026-09-16; roadmap recheck: 2026-09-16.
Related issue: the original `issues.txt` P2 render-cache capture entry, resolved for all current adapters on 2026-09-16.
Scope: remove avoidable mutation of mounted graph DOM during render-cache capture while preserving the existing save, recovery, tab-switch, reopen, rendering, and interaction contracts.

## Progress log

- 2026-09-16: ROC pilot completed. Its graph-only cache now snapshots cloned children without mutating the mounted plot. Added a production-bootstrap Jest contract for child identity and MutationObserver stability. Focused ROC Jest coverage passed 6 suites / 38 tests; focused Chromium coverage passed cache reuse, graph-type reopen, and statistics-overlay workflows (3 tests). `node --check`, targeted ESLint, bootstrap validation, and test-inventory validation passed.
- 2026-09-16: Histogram wave completed. Plot and statistics cache sections now snapshot cloned children without mutating either mounted host. Added a production-bootstrap Jest contract for plot/report child identity and MutationObserver stability. Focused Histogram Jest coverage passed 2 suites / 3 tests; Chromium panel-layout/archive/isolation coverage passed 13 tests. `node --check`, targeted ESLint, testing-inventory generation, and inventory validation passed.
- 2026-09-16: Survival wave completed. Its SVG plot cache now snapshots cloned children without mutating the mounted plot; the existing restore path still rehydrates axis, text, curve, and legend interactions, while statistics remain canonical session state. The new production-bootstrap Jest contract first reproduced the empty-plot mutation and then passed after the fix. The existing Survival statistics and Chromium risk-table/same-type isolation coverage remain the compatibility gates. No unrelated confirmed product issue was found during the ROC, Histogram, or Survival waves. The existing Heatmap P1 and remaining backlog entries are unchanged.
- 2026-09-16: Venn wave completed. Both Venn and UpSet stage captures now clone children without mutating the mounted stage; SVG-root viewport state and the existing trace, axis, label, and legend rehydration paths are retained. The new production-bootstrap Jest contract first reproduced the empty-stage mutation and then passed after the fix. Focused Venn Jest coverage passed 2 suites / 15 tests; Chromium mode, layout, tab-isolation, and archive-reopen coverage passed 6 tests. No unrelated confirmed product issue was found during the Venn wave.
- 2026-09-16: Line wave completed for its current SVG 2D and SVG 3D modes. Its graph cache now snapshots cloned plot children without mutating the mounted plot; the existing 3D rotation model, hit surface, and interaction rehydration path remain in place. The new production-bootstrap Jest contract first reproduced the empty-plot mutation and then passed for both modes. Focused Line Jest coverage passed the new two-mode contract plus the existing 3D restore checks (3 selected tests); Chromium 3D rotation, table stability, and aspect coverage passed 4 tests. A source audit found no live canvas creation in Line; the validator's canvas acceptance remains legacy-compatible rather than evidence of a current canvas renderer.
- 2026-09-16 (historical pre-migration audit): PCA renderer audit confirmed a live `canvas.pca-fast-points-layer` for large point sets. PCA was therefore deferred to the hybrid/canvas phase; no generic clone migration was attempted at that stage.
- 2026-09-16: Surface wave completed. Its SVG, statistics, and message cache sections now snapshot cloned children without mutating their mounted hosts; SVG-root viewport state, Plot3D rotation state, geometry pools, and interaction rehydration remain unchanged. The new production-bootstrap Jest contract first reproduced the multi-host detach and then passed. Focused Surface Jest coverage passed the new contract plus the existing render-cache redraw test; Chromium Plot3D containment and recovery/owner-isolation coverage passed 6 tests. No unrelated confirmed product issue was found during the Surface wave.
- 2026-09-16 (historical pre-migration audit): The final remaining-renderer audit amended the plan. Heatmap value mode and Scatter large-point mode use live canvases inside SVG `foreignObject` layers; PCA uses a live `canvas.pca-fast-points-layer`; Box uses a custom moving-section path with canvas/bitmap layers. The shared archive serializer converts the actual live canvas to a bitmap, but `cloneNode(true)` does not copy canvas pixels. Therefore the shared clone helper was initially limited to the SVG-oriented adapters; these four paths then required renderer-specific bitmap and interaction contracts before migration.
- 2026-09-16: Heatmap wave completed. Its SVG and statistics sections now use read-only snapshots; live canvas layers are converted to cache-only bitmap images before archive serialization, while the mounted graph remains unchanged. The production-bootstrap capture contract and focused archive/restore checks passed; the existing Chromium geometry, heavy recovery, and same-type isolation gates passed 5 tests. The known P1 dendrogram ownership failure remains separate and unchanged.
- 2026-09-16: Scatter wave completed. Its read-only snapshot copies the optional live point canvas into a cache-only bitmap and retains the SVG/hit-layer representation. The production-bootstrap contract, focused adaptive-size/architecture/regression checks, and Chromium heavy mixed-tab/reopen/recovery gates passed; the focused Jest run passed 3 suites / 35 selected tests and the browser run passed 5 tests.
- 2026-09-16: PCA wave completed. Its read-only snapshot copies the live fast-point canvas into a cache-only bitmap; restore rehydrates the bitmap or leaves a valid pending image until decoding completes, then rebinds the owner renderer. The production-bootstrap capture contract, selected 3D restore checks, and Chromium 2D/3D/cache-rebind gates passed; no generic blank-canvas clone was accepted.
- 2026-09-16: Box wave completed. Its custom section adapter now snapshots the mounted plot through the shared clone/bitmap helper, retains Box-specific restore and interaction rehydration, and rejects incomplete bitmap snapshots without touching the live graph. The new production-bootstrap contract passed; the focused Box/cache Jest run passed 19 of 20 selected tests, with the one unrelated pre-existing custom-pairs control-identity failure recorded separately. Focused Chromium coverage passed all 5 archive/recovery/cache-reuse tests.
- 2026-09-16: Final usage audit completed. All eleven component capture adapters now declare live-DOM preservation; ten use the shared snapshot helper directly, and Box retains its section-specific wrapper around it. The redundant Pie-specific snapshot helper was removed after confirming it had no behavior beyond the shared contract. The unused shared moving-child helper was removed, its stale existence assertion was deleted, and the architecture call map was regenerated. The session rollback branch remains because the compatibility suite still proves recovery for an unmarked legacy capture; no current component uses that path.

## Executive decision

The common render-cache save and restore pipeline already exists. This refactor must not create a second persistence system, replace the session checkpoint flow, or mechanically convert every component.

The actual refactor target is the component capture adapter. Most adapters originally moved live graph children into a temporary `DocumentFragment`, after which the shared session layer restored the live graph. Pie already demonstrated the intended SVG direction: it copied graph children and left the mounted graph in place. All current adapters now preserve the mounted graph during capture.

The work is justified as a medium-priority hardening effort because the detach-and-restore operation can disturb layout, observers, rendering, and interaction state. A visible Pie regression has already established that this risk can become user-visible. Current evidence does not prove that every component has a present-day visible failure. Therefore:

- migrate only after a component-specific snapshot contract is proven;
- keep the shared orchestration and cache schema unchanged unless a concrete contract gap is found;
- do not replace canvas or hybrid capture with a generic DOM clone;
- leave a component on the existing path when no safe equivalent is demonstrated;
- treat cache as an optimization and fidelity aid, never as the source of truth for data or settings.

## 1. Current architecture and confirmed boundary

### 1.1 The existing common pipeline

The current flow is already centralized:

1. A save, recovery checkpoint, or tab deactivation asks the owning component for a render cache through its descriptor.
2. `Main.session` checks readiness, render currentness, ownership, component type, and payload/layout signatures.
3. The shared session layer validates the component cache through `Shared.renderCacheSchema`.
4. The cache is serialized for archive use and kept in the warm runtime tier when eligible.
5. Reopen or activation first applies canonical payload, runtime, UI, and layout state.
6. An exact owner/signature-matching cache is restored when possible.
7. If the cache is absent, stale, rejected, or visually invalid, the component redraws from canonical state.

Relevant boundaries:

- `js/main/session.js`: capture, validation, serialization, cache tiers, provenance, and restore fallback.
- `js/main/sessionActions.js`: checkpoint policy for manual save, recovery, and autosave.
- `js/main/domControls.js`: payload/layout hydration followed by cache restoration and fallback redraw.
- `js/main/components.js`: the single component descriptor interface.
- `js/shared/componentLifecycle.js`: the shared clone/filter/bitmap snapshot helper.
- `js/components/*`: component-owned capture and restore semantics.

This roadmap preserves that boundary.

### 1.2 The two cache tiers must remain separate

The refactor must preserve the existing distinction:

| Tier | Purpose | Requirements |
| --- | --- | --- |
| Warm runtime cache | Fast same-session tab switching | May contain a runtime-ready representation, but must remain owner- and signature-scoped. |
| Archive render cache | Manual-save and recovery reopen fidelity | Must be serialized, provenance-checked, and independent of mounted DOM identity. |

The refactor changes how a component produces the cache. It does not change when the cache is captured, which tier receives it, or how canonical payload and layout are restored.

### 1.3 The confirmed capture problem

The former shared moving-child helper has been removed after a repository-wide usage audit. Pie uses its existing read-only snapshot; ROC, Histogram, Survival, Venn, Line, Surface, Heatmap, Scatter, and PCA use `snapshotCacheableChildren()`; Box uses a section-specific wrapper around the same helper. Heatmap, Scatter, PCA, and Box request explicit live-canvas-to-bitmap conversion and retain component-specific restore logic.

The shared session layer recognizes this explicit marker for every current adapter. It still calls the component restore method in a `finally` path for an unmarked moving cache because the compatibility suite deliberately covers that legacy contract. This usually prevents permanent loss, but it means an ordinary legacy capture can cause a remove-and-reinsert cycle in the visible graph. Current adapters avoid that cycle by converting each live canvas to a cache-only bitmap image before the shared archive serializer runs; failed pixel export rejects the cache instead of accepting a blank representation.

That cycle is the risk. It is not evidence that the common save/reopen method is missing.

### 1.4 Evidence level

The evidence must remain accurately stated:

| Finding | Evidence level | Meaning |
| --- | --- | --- |
| Shared save/reopen cache orchestration exists | Confirmed by source and focused tests | No new persistence mechanism is needed. |
| The former moving adapters detached live DOM during capture | Confirmed by historical source and focused tests | The temporary mutation was real and is preserved only in the compatibility contract. |
| Detach/restore can disturb the visible graph | Confirmed by the Pie regression and its fixed browser test | The risk was user-visible in at least one real path and is the reason current adapters are read-only. |
| Every component currently exhibits a visible defect | Not established | Do not make this claim or batch-migrate without proof. |
| A generic clone is safe for every renderer | False until proven per renderer | Canvas, hybrid layers, and interaction surfaces need separate contracts. |

### 1.5 Adapter decision matrix

This matrix is the control point for migration order. It is based on the current adapter implementations and must be updated with test evidence as each wave completes. “Risk” describes the number of contracts that must be proven, not the severity of a current user defect.

| Component | Current capture shape | Current renderer risk | Current disposition / next action | Provisional wave |
| --- | --- | --- | --- | --- |
| Pie | Read-only clone of the plot children through the shared snapshot helper | Low for the current radial SVG path | Completed shared-helper migration; preserve the radial-specific graph validation and restore logic | Reference |
| ROC | Read-only clone of the graph plot children; graph-only cache; restore rebinds interactions | Primarily SVG; graph-only cache limits scope | Completed read-only capture; graph-only cache shape retained | 1 |
| Histogram | Read-only clones of plot and statistics children; report model remains canonical | Primarily SVG, but report/overlay state must remain separate from graph cache | Completed read-only capture; restore and report model retained | 1 |
| Survival | Read-only clone of plot children; report state remains canonical | Primarily SVG with report and interaction rehydration | Completed read-only capture; restore path retained and verified | 1 |
| Venn | Read-only clone of stage children; preserves SVG root state; restore rebinds trace interactions | SVG/UpSet interactions and overlays | Completed read-only capture; both plot modes verified | 2 |
| Line | Read-only clone of plot children; preserves 2D/3D SVG layers and rotation metadata | Mode-dependent SVG with labels, tooltips, and rotation interaction; no live canvas found in current renderer audit | Completed for current 2D and 3D modes; retain separate review if a raster renderer is added | 2 |
| PCA | Read-only plot snapshot; live fast-point canvas becomes a cache-only bitmap image | SVG 2D/3D plus a fast point-canvas path, point interactions, labels, and rotation interaction | Completed hybrid capture; restore rehydrates the bitmap or preserves a valid pending image, then rebinds the owner renderer | 4 |
| Surface | Read-only clones of SVG, statistics, and message sections; preserves SVG-root state | Plot3D interaction; current renderer audit found SVG output and no live canvas | Completed read-only capture; Plot3D restore and owner-isolation paths verified | 3 |
| Box | Custom section wrapper snapshots the plot; live `foreignObject` canvases become cache-only bitmap images | SVG plus `foreignObject` canvas/bitmap paths and point interactions | Completed custom hybrid capture; restore, bitmap validation, and interaction rehydration remain Box-owned | 5 |
| Heatmap | Read-only snapshots of SVG/statistics sections; live value canvas becomes a cache-only bitmap image | Mode-dependent SVG/canvas cells, dendrogram, reports, and interactions | Completed hybrid capture; keep the P1 dendrogram ownership work independent | 4 |
| Scatter | Read-only plot snapshot; optional point canvas becomes a cache-only bitmap image | Optional point-canvas path, SVG hit/label layers, 2D/3D rotation, selection, and tooltips | Completed hybrid capture; retain local hit-layer and interaction rehydration | 4 |

The matrix is deliberately conservative. A component may move to an earlier wave only after the source audit proves that its actual mode has fewer obligations. A component may remain on the legacy path permanently if no safe read-only representation preserves its renderer and interaction contract.

### 1.6 Current status and decision gates

| Workstream | Status | Decision |
| --- | --- | --- |
| Shared save/reopen pipeline and ownership boundary | Complete and retained | No architectural replacement is required. |
| Mutation observation, archive serialization, and bitmap regression coverage | Complete for the audited paths | Use these tests as gates for later waves. |
| Read-only SVG adapters | Complete for ROC, Histogram, Survival, Venn, Line, and Surface | Keep their local restore and interaction logic; do not broaden the helper without evidence. |
| Read-only hybrid adapters | Complete for Heatmap, Scatter, PCA, and Box | Their live canvases are copied to cache-only bitmap images; keep bitmap validation and component-specific rehydration. |
| Shared clone/filter/bitmap helper | Complete and centralized | Use clone/filter for settled DOM and opt into bitmap conversion only for audited live-canvas layers. |
| Box custom capture | Complete | Keep the section-specific wrapper and Box-owned restore/interaction validation; do not flatten it into a generic component adapter. |
| Legacy moving-helper removal | Complete for the unused shared helper; compatibility rollback retained | The shared moving helper is gone. Keep the session rollback branch until unmarked legacy descriptors are intentionally retired and their compatibility coverage is removed. |

## 2. Goals

### 2.1 Primary goals

- Make migrated cache capture read-only with respect to the mounted live graph.
- Preserve the exact saved payload, runtime state, UI state, layout, cache provenance, and restore behavior.
- Preserve graph appearance and geometry during capture.
- Preserve canvas pixels and all required interaction rehydration.
- Preserve same-component tab isolation and owner/session generation checks.
- Reduce needless remove/add DOM mutations, redraws, layout recalculation, and transient empty-graph states.
- Keep the component correct when render-cache capture is disabled or unavailable.

### 2.2 Secondary goals

- Make capture behavior explicit in each component adapter.
- Make it easy for tests and diagnostics to prove whether a capture mutates the mounted graph.
- Remove the shared live-DOM restoration step from migrated adapters, but only when the adapter declares and satisfies the read-only contract.
- Keep archive serialization compatible with current cache schema and older supported archives.

### 2.3 Observable invariants

These are the acceptance invariants, not implementation preferences:

- A migrated capture does not change the mounted host's child count, child order, or representative node identities.
- A migrated capture does not produce a temporary empty published graph.
- A migrated capture does not cause the shared session layer to replay the cache into the live graph merely to undo capture.
- Canonical payload, runtime, UI, and layout state are byte-equivalent in meaning before and after capture.
- Cache metadata still identifies the exact owner tab, component, version, completeness, payload signature, and layout signature.
- Warm-cache restore and archive-cache restore are both tested; one does not stand in for the other.
- A cache miss, stale cache, rejected cache, or failed interaction rehydration still produces a correct owner-scoped redraw.
- The first user interaction after restore works without relying on event listeners copied from the old DOM.
- A second tab of the same component cannot be read or modified during capture or restore.
- No test passes merely because an assertion was weakened, a timeout was enlarged, or a redraw was hidden behind a delay.

## 3. Non-goals and hard constraints

- Do not redesign `Main.session` or `Main.sessionActions`.
- Do not create a second save, recovery, or cache pipeline.
- Do not make cache necessary for correctness.
- Do not change the canonical payload/session ownership model.
- Do not capture inactive tabs by reading whichever graph is currently mounted.
- Do not persist DOM nodes, event objects, workers, controllers, sessions, managers, or live AG Grid objects.
- Do not infer cache safety from a reason string, a component name alone, or a passing unit test that does not exercise the browser.
- Do not mechanically replace a moving capture path with `cloneNode(true)`.
- Do not clone canvas-backed graphs without explicit bitmap and interaction verification.
- Do not alter scientific calculations, statistical results, random seeds, data transforms, or report wording to make capture easier.
- Do not combine this work with large-module extraction, testing-file reorganization, or unrelated component fixes.
- Do not edit `desktop/app/`.
- Do not promote headless timing numbers into product requirements.

## 4. Required capture contract

Before a component is migrated, its adapter must satisfy the following contract.

### 4.1 Ownership

Capture must:

- resolve the requested tab and owning session explicitly;
- verify that the mounted root belongs to that tab;
- reject inactive, mismatched, stale, or incomplete graph state;
- include exact component and tab provenance in the existing cache metadata;
- avoid reading another tab's live DOM, controls, managers, or module mirrors.

### 4.2 Mounted-DOM safety

For a migrated adapter:

- the graph host remains connected throughout capture;
- the host's child list is not moved, cleared, or replaced;
- existing live node identity is unchanged;
- no live event target is temporarily detached;
- no observer is forced to process a synthetic empty graph;
- the cache is made from a separate representation;
- the adapter explicitly reports that live DOM was preserved only after that is true.

The test must check both the child list and representative node identity. Checking only that the graph looks correct after capture is insufficient because a remove-and-reinsert cycle can be invisible to a final screenshot.

### 4.3 Cache representation

The capture representation must be suitable for both cache tiers:

- runtime restoration must receive a valid component-owned structure;
- archive serialization must remain JSON-compatible through the existing shared serializer;
- no live node or listener may be treated as durable state;
- form state and relevant SVG attributes must be copied explicitly;
- staged publication nodes must not be captured as if they were settled graph content;
- cache metadata must retain current owner, component, version, completeness, payload signature, and layout signature checks.

### 4.4 Restore and interaction safety

Restoration must:

- rebuild the visible graph under the requested owner only;
- rebind interactions to the restored graph when cloned nodes do not carry listeners;
- restore canvas hit surfaces and pointer behavior where applicable;
- rehydrate shared Cartesian or Plot3D layout state where required;
- leave controls, statistics, notes, and tables owned by the same session;
- fall back to a normal owner-scoped draw if visual validation or interaction rehydration fails.

The fallback is a correctness path, not permission to accept a broken cache. A migrated adapter is not complete until the cache restore path is proven or the adapter deliberately declines migration.

### 4.5 Archive and version compatibility

The first choice is to keep the existing cache shape and schema version. A read-only SVG snapshot should be an internal capture change if the restored structure remains equivalent.

If a renderer needs a new cache field or representation:

- document the incompatibility before changing the schema;
- add an explicit versioned reader for the previous supported representation;
- validate both newly captured and existing archived caches;
- never reinterpret an old cache by guessing its renderer or owner;
- reject an incompatible cache and redraw from canonical state;
- do not mutate or rewrite the user's archive during open merely to upgrade a cache;
- keep payload, runtime, and UI compatibility independent from cache compatibility.

Cache incompatibility must reduce to a cache miss. It must never become a data, settings, or tab-ownership failure.

## 5. Renderer-specific strategy

### 5.1 SVG-only or primarily SVG components

Potentially suitable for a clone-based snapshot, subject to proof:

- clone only cacheable graph children, not the live host;
- exclude staged publication content using the existing publication rule;
- preserve SVG attributes, namespaces, styles, dimensions, transforms, text, and definitions;
- copy relevant form values when a cached control or report fragment includes them;
- do not assume cloned nodes retain event listeners;
- rebind interactions during restore through the component's normal owner-scoped activation path;
- verify that tooltip, selection, drag, label, legend, and hit-area behavior remains intact.

Likely candidates for the first audited waves are components whose settled graph is already represented by SVG and whose cache restore has a clear interaction rebind path. The actual order must be decided after inspecting each component's graph layers, not from component names alone.

### 5.2 Canvas-backed modes

Canvas requires a separate contract. The component must be classified by its actual settled render mode; a 3D component is not automatically a canvas component.

- record the canvas's intrinsic width and height, CSS size, relevant transform/scaling state, and bitmap content;
- use the existing shared canvas bitmap serialization path where appropriate;
- verify that the bitmap survives runtime cloning and archive round-trip;
- preserve or rebuild transparent hit surfaces and pointer coordinate transforms;
- restore owner-scoped camera, rotation, zoom, and projection state from session/runtime data;
- verify first pointer move, drag, wheel, click, hover, and selection after restoration;
- never assume `cloneNode(true)` copies pixels or interaction behavior.

If a canvas renderer needs a live draw to restore a valid interactive surface, its cache may remain a bitmap/display aid rather than a complete interaction snapshot. The component must then rehydrate interaction state or schedule an owner-scoped redraw before interaction is enabled.

Important constraint from the current implementation: the shared archive serializer calls `toDataURL()` on the canvas node present in the captured fragment. A normal `cloneNode(true)` copies the canvas element but not its pixels, so serializing a cloned canvas can produce a blank bitmap. A safe hybrid migration must therefore either copy the live bitmap into a cache-only image/bitmap representation while leaving the host mounted, or rebuild the cache from an owner-scoped render model. It must prove both warm-cache and archive behavior; converting only the archive path is insufficient.

### 5.3 Hybrid SVG/canvas modes

Treat each layer separately:

- identify visual SVG layers;
- identify bitmap canvas layers;
- identify transparent hit layers;
- identify overlays, axes, labels, legends, and publication markers;
- define which layers are cached and which are rebuilt;
- validate that their coordinate systems and z-order remain consistent.

A hybrid adapter must not capture only the visually obvious layer and silently omit the hit layer, axes, or interaction state.

Current source cues that required an explicit mode audit included Heatmap value rendering, Scatter's optional point-canvas path, PCA's fast point-canvas path, and Box's `foreignObject` bitmap path. All four now satisfy the hybrid contract: the live canvas is left mounted, its pixels are copied into a cache-only bitmap image, and restore rehydrates the component-owned interactive representation. Line's current renderer audit found SVG-only 2D/3D output; its cache validator still accepts legacy canvas-shaped payloads, which is compatibility logic rather than proof of a live canvas mode. Surface's current renderer audit likewise found SVG output with Plot3D interaction and no live canvas layer, so it remains outside the hybrid phase unless its renderer changes.

### 5.4 Box's custom capture path

Box must be audited independently because it uses a component-specific section wrapper rather than the generic adapter shape. Its custom section preparation and restore logic must not be assumed equivalent to the other adapters.

The Box wave documented every captured section, restore path, SVG layer, stats/report dependency, bitmap layer, and interaction binding. Its section-local snapshot leaves `els.plotDiv` mounted and uses the existing bitmap representation for any live canvas. Box remains intentionally section-specific: the generic helper supplies cloning and bitmap conversion, while Box owns visual validation, canvas rehydration, and interaction rebinding.

## 6. Implementation phases

### Phase 0 — Freeze the contract and establish a baseline

Deliverables:

- inventory every component capture adapter and every helper it calls;
- inventory every save, recovery, deactivation, duplicate, and reopen path that can request capture;
- record whether each renderer is SVG, canvas, or hybrid;
- record the actual renderer mode for every relevant component mode, including 2D/3D, Heatmap value/correlation, Scatter point rendering, PCA fast points, Line raster paths, and Box canvas-backed paths;
- record graph hosts, cache sections, interactive layers, and restore/rebind functions;
- identify existing cache currentness, readiness, provenance, and signature checks;
- run the existing focused cache and persistence tests;
- run the existing Pie regression test as the baseline proof;
- capture baseline diagnostics for cache hit, miss, stale, rejected, and fallback paths.

Exit gate:

- no ownership or persistence behavior changes;
- all baseline tests pass;
- every adapter has an owner, renderer, capture, restore, and interaction entry in the migration matrix;
- unresolved uncertainty is recorded rather than guessed.

### Phase 1 — Add shared observation and test support only

Do not change capture behavior yet.

Deliverables:

- add narrowly scoped test helpers for recording host child-list mutations and node identity;
- add shared unit coverage for cache serialization, deserialization, provenance, signatures, and canvas bitmap handling;
- verify that the existing shared `finally` restoration still restores the original graph when legacy capture is used;
- verify that the read-only marker is honored only for a capture that genuinely preserved the mounted graph;
- ensure diagnostics distinguish capture mutation, restore, cache rejection, and fallback redraw.

Exit gate:

- observation proves the current detach behavior without changing production behavior;
- shared tests cover both legacy moving capture and read-only capture;
- no broad helper abstraction is introduced unless two audited components have exactly the same safe semantics.

### Phase 2 — Complete one low-risk SVG pilot

Use Pie as the reference behavior, not as a template to copy blindly. The provisional first pilot is ROC because its current cache is graph-only and its restore path already has explicit interaction rehydration. This choice remains conditional on the Phase 0 audit; if ROC's browser contract is not complete, select the next matrix candidate without changing the shared design.

Deliverables for the selected component:

- replace only its capture implementation with a read-only snapshot;
- preserve its current cache shape and metadata unless a tested defect requires a schema change;
- mark live DOM preservation through the existing shared signal or an equally explicit contract;
- keep the normal restore path unchanged unless the current path assumes moved original nodes;
- add unit tests for no mutation, ownership, empty/incomplete capture, serialization, and restore;
- add browser tests for graph geometry, visible summaries, legends, labels, and one representative interaction;
- test manual save, recovery checkpoint, tab deactivation, warm-cache restore, archive-cache restore, and redraw fallback.

Exit gate:

- no host child mutation during capture;
- no visible graph disturbance in the browser test;
- exact cache restore and payload redraw produce equivalent settled output;
- interaction works after warm and archive restore;
- same-component tab isolation passes;
- targeted tests and `node --check` pass.

### Phase 3 — Migrate verified SVG adapters in small waves

Migrate only components that pass the same gate. A wave should contain one component or a small group with identical, proven semantics.

Follow the matrix order, but implement one component at a time. A wave is a planning group, not permission to batch unrelated adapters.

For each component:

1. Write the component capture/restore contract in the migration matrix.
2. Add or update the no-mutation characterization test before changing production code.
3. Implement the smallest adapter-local change.
4. Run the component's focused Jest tests.
5. Run focused Chromium tests for save/recovery, tab switching, reopen, and interaction.
6. Inspect cache diagnostics for owner/signature mismatches and fallback spikes.
7. Review the diff for accidental changes to data, layout, statistics, or controls.

The currently audited SVG migration work is complete: ROC, Histogram, Survival, Venn, Line, and Surface remain compatibility references. Heatmap, PCA, Scatter, and Box completed separately in Phase 4 because of their hybrid/canvas obligations. The order remains evidence-driven for any future renderer change. A component must be deferred if its graph contains a hidden canvas, external renderer state, or interaction layer that has not been accounted for.

### Phase 4 — Migrate audited hybrid/canvas modes

Handle confirmed hybrid/canvas modes individually: Heatmap value-cell rendering, Scatter point-canvas rendering, PCA fast points, Box bitmap/`foreignObject` paths, and any additional mode found during later renderer changes. Heatmap, Scatter, PCA, and Box have completed this phase. Line and Surface remain outside it under the current audit: Line is SVG-only and Surface is SVG with Plot3D interaction but no live canvas layer.

Deliverables:

- layer inventory and bitmap contract for each hybrid adapter;
- explicit interaction rehydration contract;
- tests for intrinsic canvas dimensions, CSS dimensions, device scaling, transforms, and pixel preservation;
- tests for rotation, zoom, drag, hover, selection, and hit testing where supported;
- tests for restoring after tab switch and archive reopen;
- verification that a stale or incomplete bitmap cannot be accepted as a current graph;
- verification that fallback redraw remains owner-scoped and does not overwrite another tab;
- verification that the cache-only bitmap is produced from the live renderer without removing the live canvas, and that a cloned blank canvas can never be accepted as a complete cache.

Completed evidence: Heatmap, Scatter, PCA, and Box each have a production-bootstrap no-mutation contract, explicit bitmap capture/restore coverage, and focused Chromium reopen/recovery/isolation gates.

The Heatmap P1 dendrogram ownership defect must remain separate. If it is encountered during this phase, record it as a separate ownership issue and do not use cache migration to mask it.

### Phase 5 — Complete the usage audit and retain only justified compatibility machinery

After every current component adapter is individually migrated or explicitly retained with a documented exception:

- search for remaining production uses of the shared and component-specific moving capture helpers;
- classify each remaining use as migrated, intentionally retained, or dead;
- remove a helper only when no live adapter, compatibility path, or reviewed test contract uses it;
- remove the shared live-DOM restoration branch only when no supported adapter can return a moving cache;
- update architecture documentation and the issue wording to reflect the final state;
- retain diagnostics that prove cache ownership, currentness, and fallback behavior.

Completed result: the unused shared moving-child helper was removed, all current adapters preserve their mounted graph during capture, and the session rollback branch remains only for the tested unmarked legacy-capture contract. Do not delete that compatibility branch until the contract is intentionally retired in a separately reviewed change.

## 7. Test plan

### 7.1 Shared Jest coverage

Required shared assertions:

- manual save captures an eligible cache;
- recovery uses the same checkpoint contract as manual save;
- autosave remains cache-free;
- inactive tabs use their stored owner-scoped cache and never capture another tab's DOM;
- warm-cache pruning does not remove an archive-ready cache;
- exact payload/layout signatures are required for cache acceptance;
- wrong owner, component, version, or signature is rejected;
- cache serialization/deserialization preserves the current cache shape;
- canvas bitmap state survives the tested serialization path;
- invalid cache restoration falls back to a normal draw;
- read-only capture does not invoke live-DOM restoration;
- legacy moving capture still restores correctly until its final use is removed.

### 7.2 Component Jest coverage

Each migrated component must cover:

- capture leaves the mounted host connected;
- child count and representative node identities are unchanged;
- capture does not clear or replace live SVG/canvas/hit layers;
- incomplete and empty graphs are rejected without damaging the live graph;
- runtime cache restoration produces the expected component-owned structure;
- archive round-trip restores the same structure;
- for canvas modes, the live source canvas remains mounted while a cache-only bitmap is created, and that bitmap is present before and after archive serialization;
- owner and generation mismatches are rejected;
- current component state is unchanged by capture;
- restore rebinds required interactions;
- cache-disabled redraw remains correct.

### 7.3 Focused Chromium coverage

For every migrated component, test the user-visible workflows most likely to expose a detach/restore problem:

- enable or hide a summary/report panel and save;
- resize while a legend, summary, or labels are present;
- switch between two tabs of the same component;
- reopen a saved archive;
- restore from recovery;
- activate a tab after warm-cache pruning;
- perform the first interaction after cache restoration;
- verify graph frame, plot rectangle, outward envelope, and component-specific geometry;
- observe that the mounted graph does not briefly lose its published content during capture where the browser test can reliably observe it;
- verify that no state from another same-type tab appears.

Use settled-state assertions, DOM identity/mutation observation, owner metadata, and functional interaction checks. Use screenshots or pixel comparisons only where they add evidence for a canvas or visual-layer contract; do not replace semantic checks with brittle screenshots.

### 7.4 Cross-component gates

Run the shared save/recovery/cache suites after changes to `js/main/session.js`, `js/main/sessionActions.js`, `js/main/domControls.js`, `js/main/components.js`, or shared lifecycle code.

Run the standard same-type isolation and persistence contracts after shared ownership or restore changes. Use Chromium as the active browser gate unless Firefox is explicitly run; make no Firefox claim otherwise.

Run static checks, `node --check` for changed production files, and `git diff --check` before each handoff. Do not claim full-app readiness from targeted tests alone.

### 7.5 Required evidence package and change control

Each component change set must include a short migration record containing:

- the adapter and renderer mode audited;
- the exact cache sections and interaction layers captured;
- the ownership and signature checks relied upon;
- the before/after DOM-mutation result;
- warm-cache and archive-cache test results;
- cache-disabled redraw and fallback results;
- first-interaction-after-restore results;
- same-type tab-isolation results;
- any cache-size or serialization-cost change observed;
- the reason the component is safe to migrate or must remain on the legacy path.

Change-control rules:

- keep one component's behavior change and its regression tests together;
- do not mix unrelated cleanup or module extraction into the change set;
- do not change the shared cache schema and a component adapter in the same step unless the compatibility review requires it;
- update the matrix after each completed or rejected wave;
- keep the old path available until the migrated component's browser gate passes;
- remove the old path only in a later, separately reviewed cleanup after a repository-wide usage search;
- record any newly discovered product defect in `issues.txt` only after confirming it is not a test or stale-cache artifact.

Performance review must compare the migrated adapter with its own baseline for capture work, serialized cache size, and restore work. These measurements inform decisions; they are not arbitrary product timing contracts. A read-only clone that materially increases memory or archive size without improving visible behavior is a reason to stop and redesign that adapter, not to add a second cache layer.

## 8. Review checklist for every adapter

Before merging a component wave, answer all questions with evidence:

- What exact nodes/layers are captured?
- Are they SVG, canvas, or hybrid?
- Are any nodes interactive?
- Are event listeners expected to survive, or are they rebound?
- Is canvas bitmap state copied explicitly?
- Are CSS size, intrinsic size, transforms, and device scaling preserved?
- Is the graph host untouched during capture?
- Can capture run while a publication frame is staged?
- Does the cache carry exact owner/component/version metadata?
- What payload and layout signatures make the cache valid?
- Does archive serialization preserve the cache?
- Does restore rehydrate layout and interaction state?
- What happens when cache capture is skipped?
- What happens when cache restore is rejected?
- Does the component still work with cache disabled?
- Does a second same-type tab remain isolated?
- Are statistics, notes, controls, and data views untouched?
- Did the change alter any scientific result or only representation?
- Are there any remaining moving capture paths?

An unanswered question is a migration blocker, not an invitation to add a fallback or guess.

## 9. Risks and controls

| Risk | Control |
| --- | --- |
| Cloning loses event listeners | Rebind interactions explicitly and test the first interaction after restore. |
| Cloning loses canvas pixels | Use the shared bitmap path plus component-specific pixel and restore tests. |
| Read-only copies increase memory or archive size | Compare each adapter with its baseline; keep the existing shape, avoid duplicate cache tiers, and stop if the cost is not justified by verified behavior. |
| Capture includes a staged or stale frame | Retain publication-settled and render-currentness gates. |
| Cache is accepted for the wrong tab | Preserve exact owner, component, generation, payload, and layout checks. |
| A visual clone changes geometry | Compare frame, plot, envelope, dimensions, and settled DOM state before/after. |
| Restore causes a second unwanted draw | Keep restore suppression and rehydration contracts; inspect diagnostics. |
| Cache failure becomes data failure | Keep canonical payload/session restore independent of cache availability. |
| A broad helper hides component differences | Add shared helpers only after repeated identical proven semantics. |
| Legacy support is removed too early | Remove moving-capture support only after a complete usage audit. |
| Tests pass while the user-visible defect remains | Require browser workflows and mutation observation, not unit tests alone. |
| Refactor expands into unrelated cleanup | Keep separate commits and separate issue entries for unrelated findings. |

## 10. Rollback and stop conditions

Stop a component wave and retain the previous adapter if any of the following occurs:

- graph geometry differs after capture or restore;
- visible content disappears, shifts, flickers, or is duplicated;
- a canvas bitmap or hit surface differs;
- the first interaction after restore fails;
- cache restore depends on the currently active tab rather than the cache owner;
- statistics, notes, controls, or data views change unexpectedly;
- a cache miss no longer redraws correctly from canonical state;
- the change requires a second persistence source or a broad active-global exception;
- the only passing proof is a timing increase or a weakened assertion.

If the same failure appears in several components, stop local patches and document the larger shared refactor required. The likely shared boundary would be cache representation/interaction rehydration, not the save checkpoint itself.

## 11. Completion criteria

This roadmap is complete only when:

- every component is classified as migrated, intentionally retained with justification, or not applicable;
- all migrated adapters leave mounted graph DOM untouched during capture;
- all retained adapters have documented reasons and tested restoration;
- SVG, canvas, and hybrid cache contracts have separate evidence;
- manual save, recovery, tab switching, archive reopen, pruning, and fallback behavior remain correct;
- same-component tab isolation remains verified;
- cache provenance and signature checks remain strict;
- no new module-global source of truth is introduced;
- obsolete helpers are removed only after a usage audit;
- architecture documentation and `issues.txt` accurately describe the final state;
- focused tests, shared cache tests, static checks, and appropriate Chromium gates pass.

## 12. Recommended execution order

1. Keep the Heatmap dendrogram ownership defect ahead of this P2 refactor work.
2. Preserve the completed read-only capture contracts and their renderer-specific tests.
3. Treat any future renderer change that introduces a moving capture path as a new, separately audited migration.
4. Retire the session rollback branch only after the unmarked legacy-capture compatibility contract is intentionally removed and all callers are re-audited.
5. Keep the unrelated Box custom-pairs control issue separate from this completed cache refactor.

The completion decision must be evidence-based per renderer. A smaller finished migration is preferable to a broad refactor that creates a new cache layer, weakens interaction handling, or hides ownership problems.
