# State & Persistence Schema

This document describes the current persistence model used by `Main.session`, `.graph` archive save/load flows, and component payload contracts.

PCA 2D physical axis edits store `config.explicitAxisLayout` (version 1) in the owning session and archive payload. It contains numerical scales/ticks, vertical plot margins, and a coordinate-context key. Frame size stays in shared layout state; equal pixels per coordinate unit stays renderer-owned. PCA declares `cartesianRatioSource: 'layout'` so each published coordinate layout supplies the shared resize ratio, including after tick/domain changes; ordinary user ratio locks retain their existing authority. Normal draws and archive hydration use this same model, and render caches must match it before restoring. Changes to analysis data/settings, method, selected axes, manual tick intervals, or equal-axis-length mode invalidate the model. Zoom, ordinary resizing, titles, and appearance preserve it. Older archives without the model retain automatic layout.

Graph image exports store `uiState.export.transparentBackground` per workspace tab. Missing or false means an opaque background matching the graph appearance; true means transparent. Copy and Download project the same value when opened. `Main.session.setExportOptions` writes it immediately and marks the document changed; normal workspace UI capture, duplication, recovery, and archive save/load preserve it. This export preference does not change graph geometry or graph appearance.

## 1. Canonical Workspace State (`Main.session.workspaceState`)

Background workspace preparation is disposable runtime state in `Main.workspacePreparation`, not an archive field or a canonical component session. Prepared payloads are independently copied; graph fragments remain detached. Both are invalidated by owner/document identity, source references, signatures and payload/layout/render-commit versions. Reopening always hydrates normal owner sessions through the existing activation path. Preparation neither changes dirty state nor serializes DOM, managers, promises or component bindings. A loaded-workspace record is committed only after successful graph publication, including the explicit no-primary-graph case for non-renderable saved data.

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
  sessionUserDirty: boolean,
  sessionRevision: number,
  documentOperation: { active: boolean, token: string, kind: string, status: string, fileName: string } | null,
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
  userModified: boolean,
  payloadDirty: boolean,
  payloadDirtyReason: string,
  uiState: object | null
}
```

`previewMarkup` is either a bounded SVG thumbnail or one `<img>` containing a PNG data URL.
Canvas-backed graphs and SVGs above the shared size limit use the PNG form. `previewMeta.format`
is `svg` or `png`; PNG metadata also records `rasterized: true`. Checkpoints await pending PNG
work and validate tab owner, payload, layout, and generation before persisting it.

`uiState` carries non-component UI state that the user expects to round-trip across save/reopen but that does not belong in the component payload:

```js
{
  toolbarActiveSection: string | undefined,   // 'general' | 'data' | 'format' | …
  toolbarManualSection: string | undefined,
  component: {
    table: {
      firstDisplayedRow: number | undefined,
      scrollTopPx:        number | undefined,
      selection: { from: { row, col }, to: { row, col } } | undefined,
      columnWidths: Record<string, number> | undefined
    } | undefined,
    // future per-component additions go here
  } | undefined
}
```

The toolbar fields are captured/applied by `Main.session.captureWorkspaceToolbarUiState` / `applyWorkspaceToolbarUiState`. The `component` sub-tree is dispatched via the workspace registry (`Main.components.registry[type].captureUiState` / `applyUiState`) — each component reads its `Shared.hot` instance and uses `Shared.hot.captureHotUiState` / `applyHotUiState` for the table sub-state. Missing fields fall back to component defaults so older `.graph` archives still load.

The component `layout` snapshot keeps graph-frame width and height in absolute CSS pixels. Its surrounding workspace split is separate:

```js
layout.workspace = {
  version: 1,
  tableFraction: number // relative share of the horizontal table/graph split
}
```

Panel width/flex pixels are not archived. On reopen, the split is recalculated against the recipient viewport and normal component minimum widths; vertical responsive layouts use their CSS stacking rules. Older archives with two panel pixel widths are converted to a proportion when possible, otherwise they use responsive defaults.

Document lifecycle state is shared by the web and Electron builds. `sessionFileHandle` is a File System Access API handle in browsers and a lightweight desktop path handle in Electron. `sessionFilePath` is populated only when the desktop bridge has a real filesystem path. Dirty-state updates increment `sessionRevision` and emit `graphitix:document-state-change` so document UI, Autosave, and recovery do not need to duplicate tab-change logic or repeatedly snapshot an unchanged dirty session.

`documentOperation` is transient, plain-data UI state for an active document-level transaction. It is never archived. While it is active, tab activation, add/close, rename, context, and drag mutations are rejected at their command boundaries and the application shell is inert.

Manual archive saves enter `Shared.fileIO` before preparing a checkpoint. FileIO obtains the destination or existing-file write permission during the click, then requests the lazy archive payload. Canceling a picker performs no checkpoint capture or serialization. The save owns its starting document identity, target tab and revision: replacement or owner closure cancels stale work, and newer edits remain dirty. Ownership is checked across readiness, preview capture, serialization and completion; destination metadata is published only after a successful write to the current document. Autosave retains its existing readiness deferral and never opens a picker.

`sessionDirty` means the in-memory workspace has observed any state transition. `sessionUserDirty` means a user-originated change still needs persistence. Lifecycle transitions such as tab activation, archive save, autosave, recovery snapshots, and workspace binding can update runtime/cache metadata without setting `sessionUserDirty` only when they pass explicit `origin: 'lifecycle'` metadata. Missing origin metadata is treated as user-originated so future callers fail dirty rather than silently dropping a user edit.

## 2. Document UI, Autosave, And Recovery

`js/main/documentState.js` owns the filename/status cluster rendered in each workspace toolbar tab row, to the right of the `General`, `Data`, and `Format` tabs. It is not rendered on the Welcome page because the Welcome page has no workspace toolbar.

Autosave is off by default and persisted in `localStorage` under `graphitix.autosave.enabled`. When Autosave is on, there are user-originated changes, and the current `.graph` file has a writable target, `Main.sessionActions.autosaveWorkspace` writes through the same archive save path as manual save. If there is no writable target, Autosave still keeps the private recovery snapshot current without silently overwriting a user file.

Crash recovery is separate from Autosave. `Main.documentState` writes a private `.graph` archive from canonical tab payload/layout/UI state through `Main.sessionActions.buildWorkspaceArchiveBlob`. Lean recovery skips live DOM projection capture when that canonical state is current, and falls back to capture only when a tab is still payload-dirty. Browser builds store the Blob in IndexedDB. Electron writes `active-recovery.graph` plus metadata under `app.getPath('userData')/recovery` through binary preload IPC and atomic main-process writes. Recovery scheduling is revision-aware and rejects a completed checkpoint if `sessionRevision` changed while it was serialized.

To cover a renderer/process loss before that rich archive finishes, dirty document events also write a small owner-scoped canonical journal in the `canonical-journal` IndexedDB store. Native controls are marked dirty in the capture phase, then the owning payload/layout is captured after the control handler; a synchronous `localStorage` mirror is written for a hard reload, while the IndexedDB journal is coalesced from the settled owner state. A stopped-propagation control uses a next-turn fallback, and the unload path repeats the synchronous owner capture. The journal contains the latest revision, tab order/metadata, and canonical payload/layout/UI state; it deliberately contains no preview or render-cache data. Only the changed tab is written after the initial workspace baseline, and recovery promotes the journal or mirror to a lean archive when its revision is newer than the rich private snapshot. This keeps mutation-time protection cheap while leaving heavy preview/cache serialization on the existing recovery path.

Advisor state is live, tab-owned state: Box uses `session.state.stats.statsAdvisor`, Line uses `session.state.advisorState`, and Scatter, Pie, ROC, Survival and Histogram use `session.advisor`. Reads and snapshot capture preserve these objects and their answers so mounted controls keep editing the owner. Serialization creates detached copies; loading a payload or applying a runtime snapshot may replace state, followed by rebuilding its controls. Capture must never apply its own exported snapshot back into the live session.

Box, Scatter, Line, Pie, ROC and Survival use `Shared.statsAdvisor` for owner-bound projection and fresh-plan application. Disclosure hides summaries, warnings and questions together. Answer changes retain settings until explicit Apply. Line and Survival runtime capture/remember paths export snapshots without rehydrating their live sessions; explicit payload/runtime application remains the hydration boundary.

Scatter analysis controls are canonical in `session.state.analysisSettings`, separate from statistical results. The existing archive fields (`config.stats`, `config.regression` and overlay flags) retain their schema. Runtime snapshots include `analysisSettings`; older snapshots without that field retain the already hydrated owner settings. User events and advisor Apply patch these settings before controls/rendering.

Histogram stores advisor state in `config.stats.advisor` and the top-level runtime snapshot `advisor` field. Only the disclosure flag and whitelisted question answers are persisted; recommendations and data summaries are recomputed from the owning tab's included, unbinned source observations, following generated frequency views back to their source. Answer changes do not apply statistical settings. Explicit Apply rechecks the current data, patches the owning `statsSettings`, then projects active controls and schedules an owner-scoped analysis draw. Capturing/remembering a Histogram runtime snapshot does not hydrate the session; explicit runtime application does. Older payloads without advisor state start closed with no answers.

Snapshot capture policy is centralized in `js/main/snapshotPolicy.js` and consumed by `Main.sessionActions` + `Main.documentState`. This keeps manual save, autosave, and recovery behavior consistent:

- Manual save / explicit archive snapshot (`archive-save`, `document-snapshot`):
  - capture render cache by default (`captureRenderCache=true`) to maximize reopen fidelity
  - preserve cache metadata for all graph tabs during snapshot flow
- Autosave (`autosave`):
  - keep snapshots lean (`captureRenderCache=false`) to reduce background overhead
  - preserve active-tab metadata only where possible
- Recovery (`lifecycle-checkpoint` with recovery mode):
  - default lean capture
  - optional **Hi-Fi recovery** opt-in through `localStorage` key `graphitix.recovery.highFidelity.enabled`
  - in Hi-Fi mode, recovery upgrades to render-cache capture only when the workspace is idle (idle gate is policy controlled), so crash restore can rehydrate visuals/stats faster without adding heavy capture on every active edit event
  - checkpoint, worker-transfer, worker-build, serialization, and storage timings are available from `Main.documentState.getRecoveryPerformance()`

Recovery snapshots are eligible only when the workspace has at least one graph tab with meaningful data according to the same `Main.session.graphTabsHaveData()` / `tabHasTableData()` heuristics used by unload prompts. Explicit discard paths clear the private recovery snapshot before continuing, so discarded changes are not offered again on the next launch.

## 3. Session Payload Shape (Archive-Level)

`Main.sessionActions.buildScopeSnapshot(context, 'workspace', options)` is the single
canonical session snapshot builder. Manual archives funnel every tab through
`Main.session.enrichTabSnapshotForArchive`. Lean recovery passes canonical owner state directly to the
archive worker, which performs cloning and runtime-id rehoming off the main thread.

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
      matrixSignatures: Array<{ path: Array<string | number>, signature: string }>,
      archiveRenderCache: object | null,
      archiveRenderCacheSignature: string | null,
      archiveRenderCacheLayoutSignature: string | null,
      uiState: object | null
    }
  ]
}
```

`matrixSignatures` is optional for older archives. New archives include the non-enumerable matrix signature sidecars by payload path in each tab's `tab.json`; parsing restores them before the archive cache signature is validated. The main-thread and worker writers emit the same field. This preserves render-cache provenance across JSON cloning and CSV-backed Raw data in both full and lite payload modes.

`Main.session.applySessionData()` expects this same shape when restoring.

New figures have a screen-independent 360 × 360 pixel outer frame. `layout.graphView` stores `{ version: 1, mode: 'fit' }` or `{ version: 1, mode: 'manual', zoomLevel }`. During live use, viewing intent belongs to the component session record's `runtime.graphView`; controls and the current numeric zoom are projections. Fit captures serialize unzoomed frame dimensions and zoom 1, then recalculate display scale using the recipient's browser dimensions. All components share that calculation: 80% of one third of browser width and 80% of browser height, relative to the default frame, capped at 100% and bounded by the shared zoom limits. Panel widths, labels, legends, and summary envelopes do not change default zoom. Manual zoom and resizing replace fit intent and preserve the chosen zoom. Layouts without `graphView` retain their saved numeric zoom and frame dimensions.

Viewing scale never becomes figure geometry or export size. Controls occupy the separate shared frame header and may wrap without constraining graph zoom or manual shrinking; constrained panels keep their existing horizontal scrolling. Saved resize bounds remain authoritative on hydration, including frames smaller than today's new-figure minimum. Canonical drawable dimensions subtract unzoomed frame insets. Shared text-bound measurement still has a documented zoom-dependent export-envelope defect in `issues.txt`.

Font style records are persisted inside each component's existing payload path (`config.fontStyles`, or Venn's `style.fontStyles`) through `Shared.fontControls` import/export. Title-block alignment is the optional `textAlign` property on those records; archives without it retain centered title alignment. Multiline title text remains canonical component state, while SVG line wrappers, measured bounds, and reserves are rendered or derived state and are not additional archive fields.

### Cartesian layout publication metadata

For migrated 2D Cartesian renderers, the durable sizing authority remains the tab-owned `layout`/`.svgbox` user frame. `Shared.cartesianLayout` publishes the completed `userFrame`, `plotRect`, `contentEnvelope`, rendered-axis Lock metadata, owner tab/component, publication generation, payload signature, and layout signature as derived live SVG/resizer metadata. Automatic label/significance/legend/risk-table/panel/metric reserves are **not** independent payload or layout fields. This live publication metadata describes the current rendered projection; it is not durable payload state.

The signatures have separate authority: `payloadSignature` identifies the canonical tab payload, and `layoutSignature` identifies the durable user-frame/layout state. Manual-save render caches may carry those same values only as render-cache provenance, alongside the cached Cartesian publication metadata. This provenance certifies which owner/payload/layout produced a cache; it does not publish new live geometry and is discarded when the cache is stale. A cache signature or cached publication is never a second sizing authority. Rehydration may restore that derived projection metadata and interactions, but it must never merge the cached `contentEnvelope` or measured reserves back over the canonical user frame. Lean recovery may omit the render cache and recompute the same plan from canonical owner state. Download/Copy footers and resizer controls are external UI chrome and are never persisted as graph geometry.

When a component explicitly marks a payload change as render-equivalent, the session updates both the cache envelope signature and any embedded Cartesian payload signature together. This retains valid geometry without weakening exact cache provenance; ordinary payload changes still invalidate the cache.

The archive writer schema shared by the main-thread and worker builders is defined in `js/shared/graphArchiveSchema.js`, which owns README content and per-tab archive file paths. This keeps optional entries such as `preview.json`, `render-cache.json`, and `ui-state.json` aligned between writer implementations.

## 4. Component Payload Contract

Each component payload is a JSON-serializable object with top-level keys:

- `type` (required): component type slug
- `data` (common): table matrix / workspace input data
- `config` (common): style + behavior settings
- `exclusions` (common): row/point exclusion metadata
- optional component-specific keys (`stats`, `series`, `analysis`, `style`, etc.)

For DataView-enabled components, top-level `payload.data` is the canonical **Raw** table matrix, not the currently displayed derived projection. `activeDataViewId` / `dataViews.activeViewId` identifies the visible view, while derived matrices, transform specifications, and replay execution options live under `dataViews`. `Shared.dataViewPersistence.resolveRawDataForPersistence()` is the common Raw-view authority used by component payload capture, shared table write-through, and both archive builders. Full and lite/adaptive `.graph` saves canonicalize top-level data to Raw. Lite/adaptive saves move that Raw matrix to `raw/data.csv`; deterministic transform views may omit their matrices only when their transform and exact execution options are serialized, and are replayed on reopen, while specialized/materialized or user-edited derived views retain their matrices inline because replay would not reproduce the saved session exactly. A source-view matrix mutation recursively invalidates replayability for every existing descendant view, so a descendant generated before the mutation is materialized rather than silently recomputed from newer source data on reopen.

## 5. Default Payload Baselines by Component

Derived from each `createEmptyPayload` implementation.

- `venn` (`js/components/venn.js`)
  - top-level: `type`, `data`, `style`, `notes`, `analysis`
  - `data.table` stores the complete table matrix, including sets beyond the first three columns
  - legacy labels/lists/count fields (`labelA..labelC`, `listA..listC`, `nA..nABC`) remain for backward compatibility; legacy A/B/C values override only their corresponding first three table columns when they differ

- `box` (`js/components/box.js`)
  - top-level: `type`, `data`, `exclusions`, `config`
  - `config.stats` pre-seeded with test/correction/assumption defaults; new sessions request automatic post-hoc selection, while archives missing `postHoc` hydrate as legacy `standard`
  - `config.stats.correctionExplicit` records whether the correction was explicitly selected, so ANOVA-pooled comparisons can default to Holm without replacing a saved correction choice

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
  - `config.seriesLayout`: `{ display, arrangement, sharedY }`; `display` is `overlay` or `panels`, and `arrangement` is `auto`, `horizontal`, `vertical`, or `grid`. The contract applies identically to Histogram and Density modes. Separate panels always share the X domain; Histogram panels also share pooled bin edges, while Density panels evaluate each KDE over that common domain. `sharedY` controls whether panel Y domains are common or series-specific. A user layout change updates the owning Histogram session first and then synchronously flushes the complete owner payload/runtime through `Main.session.persistUserModifiedTabState()` before its structural redraw is scheduled. Runtime snapshots may seed `seriesLayout` only for a tab with no existing Histogram owner session; otherwise the live owner value is retained during runtime replay. The second-row panel controls, axis-label reserves, regular tick thinning, and legend viewport envelopes are derived rendering state only: they are recomputed/projected per draw or activation, never persisted independently, and cannot change the common panel plot dimensions.

- `pie` (`js/components/pie.js`)
  - top-level: `type`, `data`, `exclusions`, `config`

## 6. Dirty-Tracking and Signatures

`Main.session` computes payload/layout signatures via `serializePayloadSignature` and tracks deltas in:

- `tab.payloadSignature`
- `tab.layoutSignature`
- `workspaceState.sessionDirty`
- `workspaceState.sessionUserDirty`
- `tab.userModified`
- `tab.payloadDirty`

For clean, loaded tabs, `tab.payload` is authoritative. Save/recovery/archive paths with autosave-like reasons return the existing payload unchanged and do not query the live component. During the migration period, live component state is flushed only for mounted tabs whose payload is dirty. Standard AG Grid edits update payloads directly through `Main.session.updateTabPayload()`, using component `applyTablePayloadChanges()` hooks for non-matrix payload shapes and preserving attached `dataViews` payloads when a component has them. Shared style helpers, Venn controls/analysis/style updates, and tab-state undo/redo also route through explicit user-origin session APIs. Stats-heavy components use `Main.session.persistUserModifiedTabState()` to mark user-origin changes before flushing their mounted component state, while layout-only user actions mark the tab/session user-dirty without forcing payload capture. Dirty state is cleared after successful archive save/load.

## 7. Scope Semantics

Current save/load supports two scopes via `Main.sessionActions`:

- `tab`: single active workspace tab persisted
- `workspace`: all graph tabs persisted

The last used scope is tracked in `workspaceState.sessionFileScope` and influences default save behavior.

## 8. Cross-Component Persistence Validation

Run `npm run test:persistence-matrix` after payload, session, archive, recovery, or shared-control changes.

The browser matrix opens every component, discovers scalar graph parameters from its canonical payload roots, applies safe non-default sentinels, and checks the real manual-save and recovery archive paths. It then resets the component and verifies file reopen and recovery restoration. Structured modes and complex collections are explicitly classified because they require component-specific semantic tests.

## 9. Safe Change Checklist (Persistence)

When adding/changing persisted fields:

1. Update `getPayload()` and `loadFromPayload()` in the owning component together.
2. Ensure `createEmptyPayload()` initializes sensible defaults for missing keys.
3. Keep payload JSON-serializable (avoid DOM nodes/functions/cyclic refs).
4. Verify `buildScopeSnapshot()` and `applySessionData()` still round-trip.
5. Add/update tests for both fresh tab creation and loaded archives.
6. If schema behavior changes materially, note migration/fallback behavior in component loader logic.
