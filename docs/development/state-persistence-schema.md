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
  sessionFileScope: 'tab' | 'workspace' | null,
  sessionDirty: boolean,
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
  layoutState: object | null,
  layoutSignature: string | null
}
```

## 2. Session Payload Shape (Archive-Level)

`Main.session.buildSessionPayload()` returns:

```js
{
  version: 1,
  savedAt: string,        // ISO timestamp
  activeIndex: number,    // index in graph tabs only (excludes welcome tab)
  tabs: [
    {
      title: string,
      type: string,
      payload: object | null,
      layout: object | null
    }
  ]
}
```

`Main.session.applySessionData()` expects this same shape when restoring.

## 3. Component Payload Contract

Each component payload is a JSON-serializable object with top-level keys:

- `type` (required): component type slug
- `data` (common): table matrix / workspace input data
- `config` (common): style + behavior settings
- `exclusions` (common): row/point exclusion metadata
- optional component-specific keys (`stats`, `series`, `analysis`, `style`, etc.)

## 4. Default Payload Baselines by Component

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
  - top-level: `type`, `data`, `exclusions`, `config`

- `surface` (`js/components/surface.js`)
  - top-level: `type`, `data`, `exclusions`, `config`

- `roc` (`js/components/roc.js`)
  - top-level: `type`, `data`, `exclusions`, `stats`, `config`

- `survival` (`js/components/survival.js`)
  - top-level: `type`, `data`, `exclusions`, `stats`, `config`

- `hist` (`js/components/hist.js`)
  - top-level: `type`, `data`, `exclusions`, `config`

- `pie` (`js/components/pie.js`)
  - top-level: `type`, `data`, `exclusions`, `config`

## 5. Dirty-Tracking and Signatures

`Main.session` computes payload/layout signatures via `serializePayloadSignature` and tracks deltas in:

- `tab.payloadSignature`
- `tab.layoutSignature`
- `workspaceState.sessionDirty`

Dirty is set when payload/layout changes and cleared after successful archive save/load.

## 6. Scope Semantics

Current save/load supports two scopes via `Main.sessionActions`:

- `tab`: single active workspace tab persisted
- `workspace`: all graph tabs persisted

The last used scope is tracked in `workspaceState.sessionFileScope` and influences default save behavior.

## 7. Safe Change Checklist (Persistence)

When adding/changing persisted fields:

1. Update `getPayload()` and `loadFromPayload()` in the owning component together.
2. Ensure `createEmptyPayload()` initializes sensible defaults for missing keys.
3. Keep payload JSON-serializable (avoid DOM nodes/functions/cyclic refs).
4. Verify `buildSessionPayload()` and `applySessionData()` still round-trip.
5. Add/update tests for both fresh tab creation and loaded archives.
6. If schema behavior changes materially, note migration/fallback behavior in component loader logic.
