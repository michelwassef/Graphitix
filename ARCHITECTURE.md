# Architecture Guide

This file is the fast-orientation entrypoint for the Graphitix codebase. It complements [README.md](./README.md), [docs/development/main-bootstrap.md](./docs/development/main-bootstrap.md), and the generated [docs/development/module-call-map.md](./docs/development/module-call-map.md).

For component-level contracts, see the generated [docs/development/component-contracts.md](./docs/development/component-contracts.md).

## Documentation Sources of Truth

- [AGENTS.md](./AGENTS.md) is the normative engineering and ownership contract.
- This file describes the current runtime structure and orientation path.
- [issues.txt](./issues.txt) is the only live engineering backlog.
- [CHANGELOG.md](./CHANGELOG.md) records completed work; completed roadmaps are not retained as active documentation.
- `package.json` scripts and `.github/workflows/` are the executable validation source of truth.
- Generated contracts and maps under `docs/development/` must be regenerated from source rather than edited as parallel specifications.

## 1. Runtime Bootstrap Order

`index.html` loads scripts in a strict sequence. The order matters because modules attach to global namespaces (`window.Shared`, `window.Main`, `window.Components`) and expect prior modules to exist.

1. External libs (`ag-grid`, `jStat`)
2. Core vendor shim (`js/vendor.js`)
3. Shared utilities (`js/shared/*.js`)
4. Main namespace modules (`js/main/*.js`, `js/main/tabs/*.js`)
5. Root bootstrap (`js/main.js`)

The exact script order is in `index.html` near the bottom (`<script src=...>` tags around lines ~2008-2067).

## 2. Namespace Ownership

- `window.Shared`
  - Cross-cutting primitives and adapters.
  - Source of truth for reusable services: grid wiring, file IO, import/export, styling, stats, resizers, analysis integrations.
  - Title visibility is stored with tab-scoped font styles; the shared resizer menu projects graph-title and relevant axis-title toggles.
  - Lock ratio stores tab-owned rendered geometry. Axis charts enforce it once while finalizing their current SVG viewport; the resizer never performs delayed box corrections. Measurement is bound to the SVG being committed, including staged renderers. Non-axis renderers may provide an explicit content measurement, as Heatmap Data values does for its matrix.
  - `Shared.framePublication` keeps the previous committed graph visible while a detached replacement is built in the owning plot. Publication removes the previous frame only after final job-generation and owner validation; cancellation discards only the staged frame.
  - Ratio locking is a tab-owned resize constraint: toggling and handle clicks without movement are geometry-neutral, Cartesian targets use rendered axis lengths, and component resize callbacks are the sole draw-request owner. Automatic content-reserve sizing uses transient resizer authority and must not mark the graph as manually resized.
  - `Shared.visualProjection` applies presentation-only SVG attributes to tagged targets in the exact owning tab after the component session is updated. Unsupported or structural changes remain normal owner-scoped redraws; cooperative cancellation is not part of this synchronous projection path.
  - `Shared.chartStyle.computeLegendLayout()` wraps long legends into height-bounded columns shared by 2D and 3D renderers. `stageLegendViewport()` preserves the canonical plot width, stages the resulting full SVG content viewport, then atomically publishes its transient visible envelope with the rendered frame. Component plot geometry must use the canonical base width; the legend extension is added only when the final SVG viewport is published. Legend content is excluded from automatic viewport fitting. Render-cache restoration rehydrates this derived envelope from SVG metadata without changing the cached viewBox or persisted graph size.
  - `Shared.exampleDatasets` is the single provenance authority for built-in biomedical examples. Registry records are deeply frozen and cloned per load; component loaders apply the cloned table plus owner-scoped Notes through their normal persistence contract rather than sharing mutable literals across tabs.
  - Primarily implemented under `js/shared/`.

- `window.Components`
  - Visualization workspaces (`venn`, `box`, `scatter`, `surface`, `pca`, `line`, `heatmap`, `roc`, `survival`, `hist`, `pie`).
  - Each component owns UI bindings and graph-specific payload shape.
  - Implemented under `js/components/`.

- `window.Main`
  - Multi-tab workspace orchestration.
  - Owns active tab/session lifecycle, page switching, save/load orchestration, prompts, tab drag, render scheduling hooks.
  - Implemented under `js/main/` and finalized by `js/main.js`.

## 3. Main Session/Tab Control Plane

Primary state lives in `js/main/session.js`:

- `Main.session.workspaceState`
  - tab list, active tab id
  - duplication/close prompt metadata
  - session dirty flags (`sessionDirty` for any state transition, `sessionUserDirty` for unsaved user-originated changes; lifecycle captures must pass `origin: 'lifecycle'`)
  - file handle/name/scope for `.graph`
  - drag-and-drop transient state

Primary coordination points:

- `Main.components` (`js/main/components.js`)
  - Registry mapping workspace `type` to `ensure`, `draw`, `getPayload`, `loadFromPayload`, layout hooks.
- `Main.tabs` (`js/main/tabs.js` + `js/main/tabs/*.js`)
  - tab add/close/activate/render/duplicate behavior.
- `Main.sessionActions` (`js/main/sessionActions.js`)
  - save/load flows (`tab` vs `workspace` scope) and before-unload warning behavior.
- `Main.domControls` (`js/main/domControls.js`)
  - page activation and DOM handle wiring.

## 4. Component Contract (What Main Expects)

Each workspace component should expose these (directly or via equivalent wrapper in `Main.components.registry`):

- `ensure()` or `init()`
- `draw()`
- `getPayload()`
- `loadFromPayload(payload, options)`
- `createEmptyPayload()`

Optional but already supported:

- `activateTab(tab, meta)`
- `captureRenderCache(meta)` / `restoreRenderCache(cache, meta)`
- `hasRenderedGraph(meta)` for an authoritative publication check scoped to the component's primary graph surface and, where available, its component-owned data marks. Axes, grids, statistics plots, toolbar icons, scree plots, and other auxiliary SVG/canvas content must not satisfy this contract.
  Renderer-owned semantic publication marks are authoritative even when transient DOM geometry is zero during deactivation or in non-layout test environments; publication checks must not require a measurable bounding box when the component can prove completion semantically.

Render-cache validation is split deliberately: the component owns semantic completeness and embedded cache provenance (`type`, owner tab, `complete`), while shared orchestration owns archive wrapper signatures and activation order. `canRestoreRenderCache()` must be a pure, projection-free eligibility check; it must not reject a complete exact cache merely because another tab currently owns the visible module projection or because a presentation state already contained in the cached graph is non-default. `restoreRenderCache()` remains the owner-guarded DOM mutation boundary. Graph caches must not serialize statistics/control DOM whose listeners cannot survive serialization; rebuild those surfaces from durable owner state after graph hydration.

Passive DOM projection is valid only after a component has completed full initialization for an owner session. Component ensure and activation both enforce this boundary: a newly imported or otherwise uninitialized component must create its table, layout, schedulers, and owner-scoped runtime first; draw suppression during restore does not permit marking a partial bind as `ready`.

An authoritative `draw(meta)` must return its real synchronous result or Promise. Registry wrappers must not detach completion behind a second scheduler. When a renderer replaces its own frame recursively (for example, a layout reflow), the superseded render must transfer ownership explicitly so its cleanup cannot invalidate the replacement frame.

Async SVG renderers must stage replacement frames through `Shared.framePublication`, finalize their viewport, perform a final owner/job check, and only then commit. They must not clear or mutate the committed graph before that boundary.

### Workspace toolbar overflow and popup projection

`Shared.workspaceToolbar` remains the authority for toolbar sections, contextual Format hosts, active-section state, and owner resolution. `Shared.toolbarOverflow` is a presentation-only adapter attached to the rendered toolbar:

- Every General, Data, and Format section has one horizontal viewport and one track. The adapter wraps the section's existing children once; it never clones controls, duplicates event handlers, or moves actions into a second menu/state surface.
- Overflow is determined from the section's natural content width versus its available shell width. Directional chevrons and edge fades reflect only the currently hidden direction, and item-aware scrolling reveals the next clipped control or contextual panel.
- Native touch/trackpad horizontal scrolling remains available. Shift+wheel is the only vertical-wheel translation, and keyboard focus automatically reveals an offscreen control without intercepting arrow keys needed by inputs, selects, and sliders.
- Raw `scrollLeft` is transient projection state. It resets when the active toolbar section or owning workspace tab changes and is never persisted into `tab.uiState` or `.graph` archives. The stable active section ID is persisted and restored through `workspaceToolbar.activateSectionById()`.
- Toolbar popups that would otherwise be clipped by the horizontal viewport use `Shared.toolbarOverflow.positionPopup()`. The original popup node remains under its owner control, is positioned against its trigger in viewport coordinates, and has its prior inline styles restored on close. Components and shared controls must not introduce separate overflow-specific popup copies.
- Overflow state is keyed by concrete toolbar/section DOM nodes in `WeakMap`s. No process-global active toolbar, owner, or scroll offset is authoritative.

## 5. Persistence Flow

Graphitix has one document checkpoint transaction and one document restore transaction. Manual file operations and private crash recovery differ only in destination metadata; they use the same authoritative payload, layout, preview, and render-cache contract and do not own separate hydration logic.

### Checkpoint and serialization

1. `Main.sessionActions.createDocumentCheckpoint()` resolves the snapshot policy, waits for the active component's snapshot-ready contract, and captures the active live payload through `Main.session.persistActiveTabState()` with save-grade intent.
2. `Main.sessionActions.buildScopeSnapshot()` clones the already committed payload, layout, `uiState`, preview metadata, and only render caches whose owner, component, payload signature, and layout signature exactly match that detached checkpoint snapshot. Archive construction never re-enriches or mutates canonical payload/layout after cache capture and never manufactures a cache by cloning mounted DOM. The owner-captured layout is authoritative; payload `meta.graphSizing` is a compatibility mirror and must never be merged back over an existing canonical layout. When no canonical layout exists, payload sizing may seed a default layout template; explicit finite or unlimited payload bounds override that template, while omitted bound policy preserves the template's defaults. Completed component-owned captures maintain an archive-ready serialized checkpoint, so warm runtime-cache pruning cannot remove a valid cache from later manual-save or crash-recovery snapshots.
   `Shared.renderCacheSchema` is the sole owner/component provenance parser. New captures must carry exact version-2 component-owned metadata and are validated before shared presentation metadata is added; shared code must never rewrite `tabId`, `component`, `type`, or `complete`. Legacy schema versions may be accepted only when loading or re-saving an otherwise exact older archive checkpoint.
   Pending heavy tab previews are awaited first. Their single PNG image is committed only when the owner, payload, layout, and generation still match.
3. `Main.sessionActions.serializeDocumentCheckpoint()` is the only archive serialization entry for a detached checkpoint snapshot.
4. Manual Save and crash recovery both include every exact owner-scoped completed cache checkpoint and capture the active owner only when its current checkpoint is missing or stale. Autosave remains intentionally cache-free. No checkpoint path activates inactive tabs to manufacture caches.

Venn snapshot readiness is owner-scoped and includes its scheduled draw, automatic region-analysis refresh, and species-detection work. Automatic species detection that has not produced visible state is cancelled at the checkpoint boundary rather than being allowed to mutate the payload after cache capture. Restored GO, STRING, and species results establish an input/region baseline: passive hydration, resize, and cache-restoration draws must not rerun those external analyses until the owning tab's actual list or selected-region signature changes. Manual analysis requests remain authoritative, are awaited, and clear their owner tokens on every completion path.

### Owner deactivation and render-cache tiers

Any navigation operation that preserves the outgoing tab—ordinary activation, Add tab, or Duplicate tab—must persist payload/layout and capture its completed owner-scoped render cache before unmounting. These flows share one helper; no tab-creation path may bypass this boundary.

`tab.renderCache` is the bounded warm runtime cache used for immediate tab switching. `tab.archiveRenderCache` is the serialized, owner-scoped checkpoint of the latest completed render for the same payload/layout signatures. Successful capture updates both tiers before warm-cache pruning. Payload or render-affecting layout changes invalidate both tiers. Pruning may clear only the warm runtime tier; it must never erase an otherwise valid archive-ready checkpoint. Archive eligibility requires exact embedded owner and component provenance in addition to payload/layout signature parity; invalid checkpoint objects are discarded during restore staging.

`Shared.renderCacheDiagnostics` records bounded, owner-scoped diagnostic events for cache capture, archive provenance, runtime rehoming, eligibility, component validation, hydration, visual validation, and fallback redraw. It is observational only and never participates in cache eligibility or state authority.

### Restore

1. `Main.sessionActions.restoreDocumentArchive()` parses every `.graph` source through `Shared.graphArchive.parseFile()`.
2. `Main.sessionActions.applyParsedSession()` passes the parsed session to `Main.session.applySessionData()`.
3. `Main.session.applySessionData()` stages new, non-colliding tab owners while the current document remains recoverable.
4. Only the archive's saved active tab is activated and hydrated. Inactive tabs remain canonical payload/session records and hydrate lazily on first selection.
5. The staged document commits only after active-workspace readiness. Activation failure restores the previous tabs and file metadata.
6. Cache restoration requires exact owner, payload-signature, and layout-signature parity. A rejected or absent cache falls back to the component's normal live draw. Restore completion validates the primary graph publication contract rather than scanning the entire workspace root for unrelated SVG/canvas content.
7. A clean restored tab with an exact completed checkpoint keeps its canonical layout when deactivated or inspected. Lifecycle persistence must not recapture the DOM projection merely because another tab is selected. After crash recovery, the consumed recovery archive is treated as the current checkpoint for the newly marked dirty revision; recovery does not immediately serialize the just-restored projection again.
8. The caller then applies the only legitimate source-specific state: a normal file open may retain a file handle and is clean; crash recovery clears any trusted destination and marks the restored document dirty.

`Shared.hot` exclusion mutations are owner-scoped payload transactions. Cell, row, and column exclusions immediately update only the owning tab's canonical `payload.exclusions`, invalidate that tab's caches, increment the session revision, and schedule recovery. Archive/recovery hydration applies exclusions silently.

Detailed schema references are in [docs/development/state-persistence-schema.md](./docs/development/state-persistence-schema.md).

## 6. Directory Responsibilities

- `js/shared/`: reusable infrastructure and cross-component helpers
- `js/components/`: per-graph UI + rendering + component payload
- `js/main/`: workspace/tab/session orchestration
- `css/style.css`: layout + visual styling (source of truth)
- `__tests__/`: Jest unit/integration coverage
- `e2e/`: Playwright browser workflows
- `scripts/`: benchmarks, diagnostics, and now architecture map generator

## 7. Orientation Workflow (Fast Path)

For most changes, this sequence is fastest:

1. Identify workspace type (`tab.type`, component file in `js/components`) or run `npm run dev:entrypoint -- --type <component>`.
2. Inspect `Main.components.registry` entry for the type in `js/main/components.js`.
3. Follow payload path (`getPayload` / `loadFromPayload` / `createEmptyPayload`) in that component.
4. If tab/session behavior is involved, trace through `js/main/session.js` and `js/main/tabs.js`.
5. If helper ambiguity exists, check generated [module-call-map](./docs/development/module-call-map.md).
6. For quick test targeting after edits, run `npm run test:suggest`.

## 8. Regenerating Dependency/Call Map

Run:

```bash
npm run docs:arch-map
```

This rebuilds [docs/development/module-call-map.md](./docs/development/module-call-map.md) from the current source tree.
