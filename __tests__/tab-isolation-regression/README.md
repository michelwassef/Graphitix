# Graphitix tab isolation / preview / cache regression suite

This folder automates the manual regression procedure you have been doing:

1. Create two tabs per component.
2. Give the two tabs deliberately different states: data, graph type/view mode where available, color scheme, font size, grid/legend/stat options, graph drawing-zone dimensions, payload markers, and a small SVG watermark.
3. Boot the app and install the browser-side harness, recorded as `00_boot.log`.
4. Create the workspace and record `01_create_workspace.log`.
5. Switch through all tabs before saving and record `02_initial_switching.log`.
6. Save a `.graph` file and record `03_file_save.log`.
7. Reopen the saved `.graph` file and run the first activation pass, recorded as `04_reopened_cold_cache.log`.
8. Switch through all tabs again and record `05_reopened_live_switching.log`.
9. Run the resize-after-switch probe and record `06_resize_after_switch.log`.
10. Run the homogeneous same-state switch probe and record `07_homogeneous_switching.log`.
11. Inspect the saved `.graph` archive and the logs for tab-isolation, preview, render-cache, layout, and drift problems.

The runner produces a folder containing:

```text
00_boot.log
01_create_workspace.log
02_initial_switching.log
03_file_save.log
04_reopened_cold_cache.log
05_reopened_live_switching.log
06_resize_after_switch.log
07_homogeneous_switching.log
full-console.log
workspace-regression.graph
regression-summary.json
```

## Installation

Copy the `tests/tab-isolation-regression` folder and the provided `package.json` into the root of the Graphitix project, next to `index.html`.

Then open PowerShell in the project root and run:

```powershell
.\tests\tab-isolation-regression\run-regression.ps1
```

The first run installs the npm dependencies and Playwright Chromium. Later runs are faster.


## Variant design

For every component, the two tabs are intentionally not equivalent:

```text
box:      strip plot vs violin plot
scatter:  scatter/2D/solid/linear vs volcano/3D/density/quadratic
line:     line/2D/linear vs area/3D/cubic
hist:     histogram/frequency/count vs density/cumulative/percent
heatmap:  values view vs column-correlation view
pca:      2D PCA vs 3D PCA
pie:      pie vs donut
roc:      ROC vs precision-recall
survival: CI/censor/grid on vs hazard-ratio/grid-off variant
venn:     Venn diagram vs UpSet plot
surface:  gridded surface vs point/scatter surface
```

The harness checks this twice: at runtime while switching tabs, and again inside the saved `.graph` archive. If a component silently reuses another tab's state, the variant-property fingerprint or layout fingerprint should become duplicated and the suite should fail.

The homogeneous same-state switch probe deliberately aligns paired tabs of each component to the same configuration before switching. This catches blank-graph and missed-redraw regressions that can stay hidden when variant differences force redraws.

## Running a smaller test while debugging

```powershell
.\tests\tab-isolation-regression\run-regression.ps1 -Components "box,scatter,pca"
```

## Debugging a hang

The runner now prints phase progress directly to PowerShell and writes a diagnostic JSON plus screenshot if a phase times out. To shorten the watchdog while debugging, use:

```powershell
.\tests\tab-isolation-regression\run-regression.ps1 -Components "box" -PhaseTimeoutMs 60000
```

## Running with the browser visible

```powershell
.\tests\tab-isolation-regression\run-regression.ps1 -Headed
```

## Keeping the browser open after the test

```powershell
.\tests\tab-isolation-regression\run-regression.ps1 -Headed -KeepOpen
```

## Choosing an output folder

```powershell
.\tests\tab-isolation-regression\run-regression.ps1 -OutDir "C:\temp\graphitix-regression"
```

## What counts as failure

The suite flags these as failures:

- missing `payload.json`, `layout.json`, `preview.json`, `render-cache.json`, or `ui-state.json` for any tab;
- duplicate saved previews between tabs of the same component;
- duplicate saved variant-property fingerprints between tabs of the same component;
- duplicate saved graph drawing-zone layout fingerprints between tabs of the same component;
- render-cache owner tab ID not matching the tab runtime ID;
- stale `workspace-*` IDs inside layout, preview, cache, or UI state;
- `persistActiveTabState DRIFT on skipped path` during save;
- render-cache validation failures;
- layout application skipped/failing;
- exact-layout capture failures;
- AG Grid zero-row-height warnings;
- JavaScript page errors.

It also reports warnings for things worth checking manually:

- same-component render cache unavailable;
- preview capture failures;
- preview sources outside the target tab root;
- suspicious identical preview-capture lengths;
- browser performance violations.

## Important notes

This test uses a local HTTP server and Playwright Chromium. It tests the Graphitix renderer and workspace/session architecture. It does not test OS-specific Electron menus or native file dialogs.

The saved `.graph` file is produced directly through Graphitix's internal archive builder, not via the browser file picker. This is intentional: the goal is to test tab state, archive contents, previews, and render caches without depending on the operating system save dialog.

## Manual interpretation tips

Open `regression-summary.json` first. If `status` is `PASS`, the main automated checks passed.

If the status is `FAIL`, inspect:

```text
regression-summary.json
03_file_save.log
04_reopened_cold_cache.log
05_reopened_live_switching.log
06_resize_after_switch.log
07_homogeneous_switching.log
workspace-regression.graph
```

A common failure to investigate is duplicate previews within a component. The archive analyzer normalizes `workspace-*` IDs before hashing previews, so duplicate preview hashes usually mean the actual SVG content is the same, not merely that tab IDs were normalized.
