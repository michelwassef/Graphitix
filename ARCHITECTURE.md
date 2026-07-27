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
  - Ratio locking is a tab-owned resize constraint: toggling and handle clicks without movement are geometry-neutral, Cartesian targets use rendered axis lengths, and component resize callbacks are the sole draw-request owner.
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

## 5. Persistence Flow

Graphitix has one document checkpoint transaction and one document restore transaction. Manual file operations and private crash recovery differ only in destination metadata and optional render-cache policy; they do not own separate payload or hydration logic.

### Checkpoint and serialization

1. `Main.sessionActions.createDocumentCheckpoint()` resolves the snapshot policy, waits for the active component's snapshot-ready contract, and captures the active live payload through `Main.session.persistActiveTabState()` with save-grade intent.
2. `Main.sessionActions.buildScopeSnapshot()` clones the committed payload, layout, `uiState`, preview metadata, and only render caches whose owner, payload signature, and layout signature exactly match that detached checkpoint snapshot.
3. `Main.sessionActions.serializeDocumentCheckpoint()` is the only archive serialization entry for a detached checkpoint snapshot.
4. Manual Save, Autosave, and recovery call those shared primitives. They reuse already-valid owner-scoped caches but never activate inactive tabs to manufacture caches. Omitting a cache changes only first-activation speed, never canonical document content.

### Restore

1. `Main.sessionActions.restoreDocumentArchive()` parses every `.graph` source through `Shared.graphArchive.parseFile()`.
2. `Main.sessionActions.applyParsedSession()` passes the parsed session to `Main.session.applySessionData()`.
3. `Main.session.applySessionData()` stages new, non-colliding tab owners while the current document remains recoverable.
4. Only the archive's saved active tab is activated and hydrated. Inactive tabs remain canonical payload/session records and hydrate lazily on first selection.
5. The staged document commits only after active-workspace readiness. Activation failure restores the previous tabs and file metadata.
6. Cache restoration requires exact owner, payload-signature, and layout-signature parity. A rejected or absent cache falls back to the component's normal live draw.
7. The caller then applies the only legitimate source-specific state: a normal file open may retain a file handle and is clean; crash recovery clears any trusted destination and marks the restored document dirty.

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
