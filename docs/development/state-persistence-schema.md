# State & Persistence Schema

This document describes the current persistence model used by `Main.session`, `.graph` archive save/load flows, and component payload contracts.

## 1. Canonical Workspace State (`Main.session.workspaceState`)

Defined in `js/main/session.js`.

```js
{
  tabs: WorkspaceTab[],
  activeTabId: string | null,
  nextId: number,
  pendingDuplicateSource: string | null,
  lastActiveGraphId: string | null,
  loadedWorkspaces: Record<string, { tabId, type, payloadSignature, layoutSignature }>,
  renderedWorkspaceByType: Record<string, string>,
  renameFocusId: string | null,
  pendingClosePrompt: object | null,
  sessionFileHandle: FileSystemFileHandle | object | null,
  sessionFileName: string,
  sessionFilePath: string,
  sessionFileScope: 'tab' | 'workspace' | null,
  sessionDirty: boolean,
  sessionRevision: number,
  draggingTabId: string | null,
  dragStartIndex: number | null,
  dragOverTabId: string | null,
  dragInsertBefore: boolean
}
```

`WorkspaceTab` currently contains:

```js
{
  id: string,
  title: string,
  type: string | null,
  payload: object | null,
  payloadSignature: string | null,
  duplicateSource: string | null,
  isWelcome: boolean,
  allowClose: boolean,
  isRenaming: boolean,
  previewMarkup: string | null,
  previewSignature: string | null,
  previewMeta: object | null,
  renderCache: object | null,
  renderCacheSignature: string | null,
  renderCacheLayoutSignature: string | null,
  archiveRenderCache: object | null,
  archiveRenderCacheSignature: string | null,
  archiveRenderCacheLayoutSignature: string | null,
  layoutState: object | null,
  layoutSignature: string | null,
  uiState: object | null
}
```

`uiState` carries non-component UI state that the user expects to round-trip across save/reopen but that does not belong in the component payload:

```js
{
  toolbarActiveSection: string | undefined,   // 'general' | 'data' | 'format' | …
  toolbarManualSection: string | undefined,
  component: {
    table: {
      firstDisplayedRow: number | undefined,
      scrollTopPx:        number | undefined,
      selection: { from: { row, col }, to: { row, col } } | undefined
    } | undefined,
    // future per-component additions go here
  } | undefined
}
```

The toolbar fields are captured/applied by `Main.session.captureWorkspaceToolbarUiState` / `applyWorkspaceToolbarUiState`. The `component` sub-tree is dispatched via the workspace registry (`Main.components.registry[type].captureUiState` / `applyUiState`) — each component reads its `Shared.hot` instance and uses `Shared.hot.captureHotUiState` / `applyHotUiState` for the table sub-state. Missing fields fall back to component defaults so older `.graph` archives still load.

Document lifecycle state is shared by the web and Electron builds. `sessionFileHandle` is a File System Access API handle in browsers and a lightweight desktop path handle in Electron. `sessionFilePath` is populated only when the desktop bridge has a real filesystem path. Dirty-state updates increment `sessionRevision` and emit `graphitix:document-state-change` so document UI, Autosave, and recovery do not need to duplicate tab-change logic or repeatedly snapshot an unchanged dirty session.

## 2. Document UI, Autosave, And Recovery

`js/main/documentState.js` owns the filename/status cluster rendered in each workspace toolbar tab row, to the right of the `General`, `Data`, and `Format` tabs. It is not rendered on the Welcome page because the Welcome page has no workspace toolbar.

Autosave is off by default and persisted in `localStorage` under `graphitix.autosave.enabled`. When Autosave is on and the current `.graph` file has a writable target, `Main.sessionActions.autosaveWorkspace` writes through the same archive save path as manual save. If there is no writable target, Autosave still keeps the private recovery snapshot current without silently overwriting a user file.

Crash recovery is separate from Autosave. `Main.documentState` writes a private `.graph` archive snapshot using `Main.sessionActions.buildWorkspaceArchiveBlob`, so recovery uses the same serialization contract as manual save. Browser builds store the private archive in IndexedDB. Electron builds store `active-recovery.graph` plus metadata under `app.getPath('userData')/recovery` through preload IPC and atomic main-process writes. Recovery scheduling is revision-aware: intervals only write when `sessionRevision` has advanced since the last successful snapshot, and large payload signatures use a longer debounce before archive construction.

Recovery snapshots are eligible only when the workspace has at least one graph tab with meaningful data according to the same `Main.session.graphTabsHaveData()` / `tabHasTableData()` heuristics used by unload prompts. Explicit discard paths clear the private recovery snapshot before continuing, so discarded changes are not offered again on the next launch.

## 3. Session Payload Shape (Archive-Level)

`Main.sessionActions.buildScopeSnapshot(context, 'workspace', options)` is the single
canonical builder. It funnels every tab through `Main.session.enrichTabSnapshotForArchive`
(clone + `Shared.graphSizing.enrich/merge` for non-box types) and returns:

```js
{
  activeIndex: number,    // index in graph tabs only (excludes welcome tab)
  tabs: [
    {
      title: string,
      type: string,
      payload: object | null,
      layout: object | null,
      previewMarkup: string | null,
      previewSignature: string | null,
      previewMeta: object | null,
      archiveRenderCache: object | null,
      archiveRenderCacheSignature: string | null,
      archiveRenderCacheLayoutSignature: string | null,
      uiState: object | null
    }
  ]
}
```

`Main.session.applySessionData()` expects this same shape when restoring.

## 4. Component Payload Contract

Each component payload is a JSON-serializable object with top-level keys:

- `type` (required): component type slug
- `data` (common): table matrix / workspace input data
- `config` (common): style + behavior settings
- `exclusions` (common): row/point exclusion metadata
- optional component-specific keys (`stats`, `series`, `analysis`, `style`, etc.)

## 5. Default Payload Baselines by Component

Derived from each `createEmptyPayload` implementation.

- `venn` (`js/components/venn.js`)
  - top-level: `type`, `data`, `style`, `notes`, `analysis`
  - data includes labels/lists/count fields (`labelA..labelC`, `listA..listC`, `nA..nABC`)

- `box` (`js/components/box.js`)
  - top-level: `type`, `data`, `exclusions`, `config`
  - `config.stats` pre-seeded with test/correction/assumption defaults

- `scatter` (`js/components/scatter.js`)
  - top-level: `type`, `data`, `exclusions`, `series`, `config`
  - `config.regression` and `config.stats` pre-seeded

- `pca` (`js/components/pca.js`)
  - top-level: `type`, `data`, `exclusions`, `stats`, `config`
  - defaults for method title, axis selection, rotation quaternion

- `line` (`js/components/line.js`)
  - top-level: `type`, `data`, `exclusions`, `series`, `config`
  - `config.series` initialized

- `heatmap` (`js/components/heatmap.js`)
  - top-level: `type`, `data`, `exclusions`, `stats`, `config`

- `surface` (`js/components/surface.js`)
  - top-level: `type`, `data`, `exclusions`, `stats`, `config`

- `roc` (`js/components/roc.js`)
  - top-level: `type`, `data`, `exclusions`, `stats`, `config`

- `survival` (`js/components/survival.js`)
  - top-level: `type`, `data`, `exclusions`, `stats`, `config`

- `hist` (`js/components/hist.js`)
  - top-level: `type`, `data`, `exclusions`, `config`

- `pie` (`js/components/pie.js`)
  - top-level: `type`, `data`, `exclusions`, `config`

## 6. Dirty-Tracking and Signatures

`Main.session` computes payload/layout signatures via `serializePayloadSignature` and tracks deltas in:

- `tab.payloadSignature`
- `tab.layoutSignature`
- `workspaceState.sessionDirty`

Dirty is set when payload/layout changes and cleared after successful archive save/load.

## 7. Scope Semantics

Current save/load supports two scopes via `Main.sessionActions`:

- `tab`: single active workspace tab persisted
- `workspace`: all graph tabs persisted

The last used scope is tracked in `workspaceState.sessionFileScope` and influences default save behavior.

## 8. Safe Change Checklist (Persistence)

When adding/changing persisted fields:

1. Update `getPayload()` and `loadFromPayload()` in the owning component together.
2. Ensure `createEmptyPayload()` initializes sensible defaults for missing keys.
3. Keep payload JSON-serializable (avoid DOM nodes/functions/cyclic refs).
4. Verify `buildScopeSnapshot()` and `applySessionData()` still round-trip.
5. Add/update tests for both fresh tab creation and loaded archives.
6. If schema behavior changes materially, note migration/fallback behavior in component loader logic.
