# Architecture Guide

This file is the fast-orientation entrypoint for the Graphitix codebase. It complements [README.md](./README.md), [AGENTS.md](./AGENTS.md), [docs/development/main-bootstrap.md](./docs/development/main-bootstrap.md), and the generated [docs/development/module-call-map.md](./docs/development/module-call-map.md).

For component-level contracts, see the generated [docs/development/component-contracts.md](./docs/development/component-contracts.md).

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
  - session dirty flag
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

### Save

1. `Main.sessionActions.warmTabRenderCaches()` activates each cold tab through the normal path so every tab has a populated `tab.renderCache.cache` (or stays cold-skipped if its component bundle isn't ready yet).
2. `Main.sessionActions.buildScopeSnapshot()` builds the tab snapshot array. Each entry funnels through `Main.session.enrichTabSnapshotForArchive` (clone + `Shared.graphSizing.enrich/merge` for non-box types) and includes payload, layout, preview, archive render cache, and `uiState`.
3. `Main.sessionActions.saveWorkspaceArchiveWithScope()` routes to `Shared.graphArchive.buildArchiveBlob()`.
4. `Shared.fileIO.saveGraphFile` / `saveGraphFileAs` persists the archive.

### Load

1. `Main.sessionActions.handleSessionLoadClick()` acquires file.
2. `Shared.graphArchive.parseFile()` parses payload.
3. `Main.session.applySessionData()` rebuilds workspace tabs and activates the target tab.

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
