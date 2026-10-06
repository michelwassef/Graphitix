# Main Namespace Bootstrap Order

This document summarizes the initialization sequence that the `Main` namespace expects when the dashboard boots in the browser. The guidance below is derived from the guard clauses in [`js/main.js`](../../js/main.js), so refer to that file when updating the startup logic.

## Required Order Before `js/main.js`

`js/main.js` executes immediately once the script tag is evaluated. At the top of the file it enforces a strict dependency order using hard `throw` guards:

1. **`Main.session`** must exist first. [`js/main.js`](../../js/main.js) aborts with `main.js requires Main.session to be initialized before loading.` if the namespace is missing.
2. **`Main.snapshotPolicy`** is loaded next because session and action code consume its snapshot contract.
3. **`Main.domControls`**, **`Main.sessionActions`**, and **`Main.tabDrag`** must be defined before the main bootstrap. A combined guard throws `main.js requires domControls, sessionActions, and tabDrag to be initialized before loading.` when one is absent.
4. **`Main.previews`** must be created before `js/main.js` runs, otherwise it throws `main.js requires Main.previews to be initialized before loading.`

Because the module throws immediately, these namespaces have to be loaded in the page **before** including `js/main.js`.

## Where Each Namespace Lives

| Namespace | Definition | Responsibilities |
|-----------|------------|------------------|
| `Main.session` | [`js/main/session.js`](../../js/main/session.js) | Owns the canonical `workspaceState`, exposes helpers such as `getActiveTab`, `createTab`, `applySessionData`, `enrichTabSnapshotForArchive`, the workspace UI-state capture/apply hooks, and guards the "dirty" flag. It also coordinates preview invalidation for tabs so the preview overlay stays in sync. |
| `Main.snapshotPolicy` | [`js/main/snapshotPolicy.js`](../../js/main/snapshotPolicy.js) | Centralizes snapshot intent and render-cache capture rules for manual save, autosave, and recovery paths so document restore fidelity and background cost are controlled in one place. |
| `Main.previews` | [`js/main/previews.js`](../../js/main/previews.js) | Produces and caches hover previews for workspaces. It surfaces `syncTabPreviewIndicator` that `Main.session` calls after payload updates and exposes rendering hooks consumed by `Main.sessionActions`. |
| `Main.domControls` | [`js/main/domControls.js`](../../js/main/domControls.js) | Generates cached DOM handles, drives workspace visibility, and applies payload defaults to components during tab switches. |
| `Main.sessionActions` | [`js/main/sessionActions.js`](../../js/main/sessionActions.js) | Binds DOM events (save, load, duplicate, rename) to `Main.session` helpers and to `Main.previews`/`Main.domControls` utilities. |
| `Main.tabDrag` | [`js/main/tabDrag.js`](../../js/main/tabDrag.js) | Keeps drag-and-drop state for the workspace tab strip, delegating persistence to `Main.session` and DOM mutations to `Main.domControls`. |

## How Startup Wiring Fits Together

When the page loads, the scripts that define the namespaces above run in order before `js/main.js` executes:

1. `Main.session` seeds `workspaceState` and exports helpers (`getActiveTab`, `createTab`, `persistActiveTabState`, etc.). These helpers satisfy the `requiredSessionHelpers` check inside `js/main.js`.
2. `Main.snapshotPolicy` publishes snapshot intent and archive capture defaults consumed by `Main.sessionActions`/`Main.documentState`.
3. `Main.domControls` exposes `createDomHandles()` plus workspace show/hide helpers. `js/main.js` immediately calls `createDomHandles()` once the dependency guard passes to capture DOM references for the rest of startup.
4. `Main.sessionActions` listens to click/submit events and, during startup, installs handlers that call back into `Main.session` and `Main.previews`.
5. `Main.tabDrag` wires pointer events to manage tab dragging, using `Main.session.workspaceState` and `Main.sessionActions` callbacks to finalize drops.
6. `Main.previews` registers generators and `syncTabPreviewIndicator`, which `Main.session` uses while tabs change payloads and previews.

Only after all six namespaces are registered does `js/main.js` continue bootstrapping the component registry (`Main.components`), color picker overlay, and chart redraw scheduling.

## Updating the Sequence

If you introduce a new namespace that `js/main.js` depends on, add a guard alongside the existing checks so that incorrect load order fails fast. Whenever you rename or relocate one of the modules above, update this document and the guard strings to keep developers oriented.

## Lazy Component Bundles

Visualization modules are not part of the static script sequence. [`js/main/components.js`](../../js/main/components.js) keeps one descriptor per workspace type with a browser dynamic-import path and a Node `require` path. Both paths must resolve to the same component file; that file registers its module under `window.Components[type]`. The generated [component contract](./component-contracts.md) checks the descriptor, source registration, and required restore hook. The browser bundle contract loads each workspace type through the real dynamic-import path.

The loader may also declare component-private model dependencies. It loads those before the component in both browser and Node paths, so they remain lazy with their component. Box uses this for [`boxIndexedStylesModel.js`](../../js/components/boxIndexedStylesModel.js): it contains only pure indexed-array/map transforms, holds no tab or DOM state, and is registered under the non-enumerable `Components.__models` namespace. The Box controller remains the owner of session lookup, HOT history, payload writes, and dirty-state updates. A missing model fails the Box load; no fallback copy of the transformations is kept in the controller.
