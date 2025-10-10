# AGENTS Instructions

## Layout Guidelines

Any new dashboard sections must adhere to the following layout style for consistency with the existing **Line Graph** section:

### Left Panel
- Contains an input table that spans the full height of the page.
- Occupies roughly one-third of the total page width.

### Right Panel
- **Top area:**
  - Graph display on the left.
  - Graph controls on the right.
- **Bottom area:**
  - Display statistics when applicable.

### Separator
- Use a slidable divider between the left and right panels.
- Add matching layout rules in `css/style.css` for the new section's `#<Name>Page` selectors (e.g., panel flex sizing and `.panel-resizer` styling) so the table and divider render correctly.

## Code Guidelines
- Include debugging code (e.g., `console.debug` or `console.log`) whenever new functionality is implemented to trace key inputs and state.
- Preserve the shared Handsontable context menu injection that adds the *Paste → Transposed* action when extending or replacing grid menu configurations.
- Clearly comment any debug output to facilitate removal later.
- Suppress error bars when a series/category has only a single valid observation so plots do not render misleading caps; log the skip for debugging when you do so.
- Follow the existing pattern of exposing features through the `window.Shared` and `window.Components` namespaces so legacy inline code continues to work.
- When creating Handsontable grids through `Shared.hot.createStandardTable`, keep the first (grey) row as headers by default. If a dataset has a fixed schema (such as survival analysis), set `firstRowIsHeader: false` and provide explicit `colHeaders` so the first row behaves like normal input cells.
- The survival workspace now expects four baseline columns (Group, Time, Event, Entry Time) followed by optional covariate columns. Update `SURVIVAL_COL_HEADERS` in `js/components/survival.js` if the schema changes and keep the covariate selection controls in sync.
- The statistics advisors (`renderStatsAdvisor` in `js/components/box.js`, `renderScatterStatsAdvisor`, `renderLineStatsAdvisor`, `renderRocStatsAdvisor`, and `renderSurvivalStatsAdvisor`) share the `.stats-advisor` UI. Keep their question trees, recommendations, and styling aligned whenever analyses or layout rules change.

## Testing
- After making changes, run `npm test` (if available) and ensure the command completes.
- For large scatter/volcano datasets, confirm memory behavior with `node --expose-gc scripts/volcano-benchmark.js` to compare optimized handling against the legacy approach before shipping performance-sensitive updates.

## Codebase Overview

### Top-Level Directories
- `index.html` hosts the full dashboard markup for every visualization tab, the navigation buttons, and the script tags that bootstrap the client-only app.
- `css/` contains both the consolidated stylesheet (`style.css`) that mirrors the inline styles in `index.html` and an earlier `styles.css` stub for future migrations.
- `js/` is the heart of the app and is split into vendor shims, shared utilities, visualization components, and small ES module stubs (`app.js`, `ui.js`, `utils.js`).
- `libs/` ships vendored assets that need to be available offline, currently the XLSX parser used by the table importer.
- `src/` currently holds a trivial `adder` example module that demonstrates Jest coverage of pure utilities.
- `__tests__/` contains Jest suites plus the custom environment bootstrap that mirrors the browser DOM inside JSDOM.
- `node_modules/`, `package.json`, and `jest.config.js` back the Jest-based regression suite.

### Execution Flow
- `index.html` renders every workspace (Venn, Box, Scatter, PCA/MDS, Line, ROC/PR, Histogram, Pie/Proportion) up front. Each section follows the two-panel layout described above and has IDs that the component scripts target.
- Script order in `index.html` is significant: CDN libraries (Handsontable, jStat, Chart.js, SVD-JS) and the vendored XLSX helper load first, followed by `js/vendor.js`, shared utilities, individual component bundles, and finally `js/main.js`.
- `js/main.js` executes immediately, wires tab buttons to `showPage(...)`, boots every `window.Components.*.init`, and coordinates layout syncing through `Shared.syncPanelWidths`. It also exports `Shared` helpers to the global scope for backwards compatibility.
- Legacy inline globals (e.g., `drawFromLists`) still exist in `index.html`; when those functions migrate into modules they should be exposed through `window.Components` or `window.Shared` for compatibility.

## JavaScript Architecture

### Global Namespaces
- `window.Shared` collects cross-cutting helpers (debouncing, DOM utilities, table importers, file IO, color picker overlay, etc.). Each shared module uses an IIFE to extend `Shared` safely even when scripts load out of order.
- `window.Components` holds visualization workspaces. Every component module defines an object such as `Components.box` with `init`, `draw`, `ensure`, and persistence helpers. Modules guard themselves with `component.__installed` and `component.ready` flags so re-importing scripts in tests does not double-initialize the UI.

### Core Scripts
- `js/vendor.js` patches `requestAnimationFrame`/`cancelAnimationFrame` where missing and supplies minimal `$`/`$$` helpers before any component scripts run.
- `js/app.js` and `js/ui.js` are ES module stubs for future refactors—`init` currently just logs configuration but serves as the entry point once inline code migrates.
- `js/utils.js` provides tree-shakeable DOM helpers (`domReady`, `$`, `$$`, delegated `on`) for modules that opt into ES module imports instead of the globals.

## Shared Utilities (`js/shared/`)
- `debounce.js` exposes `Shared.debounceFrame(fn)` which schedules work on the next animation frame (or `setTimeout`) and logs scheduling/cancellation events for debugging.
- `resizer.js` contains two large helpers:
  - `Shared.attachResizableBox` enables drag handles on `.svgbox` containers, enforces min/max dimensions using the defaults from `chartStyle`, and fires optional `onResize` callbacks.
  - `Shared.syncPanelWidths` aligns table and graph panels, honors manual `.svgbox` resizing, and stores the last table width inside dataset attributes so panel widths persist.
- `dom.js` implements `Shared.makeEditable`, `Shared.autoResizeSvg`, and `Shared.serializeCleanSVG`, each guarded with safe logging and fallback logic.
- `chartStyle.js` centralizes typography and plotting math: font normalization/scaling, axis metric calculation, bottom margin management, tick label rotation, frame drawing, and `applySvgDefaults` to stamp fonts/colors on generated SVGs.
- `colorPicker.js` builds a single floating `<input type="color">` overlay and exposes `Shared.attachColorPickerNear(el)` so inputs share a consistent picker even in browsers with limited native UI.
- `hot.js` provides `Shared.ensureHotWrapperStyles` (Handsontable container styling) and a fallback `createEmptyData` helper for tests.
- `fileIO.js` handles `.graph` persistence. `Shared.fileIO.saveGraphFile` and `.saveGraphFileAs` use the File System Access API when available, fall back to download links otherwise, and take callbacks for updating component state with the latest handle/name. `openGraphFile` similarly prefers the picker before deferring to hidden `<input type="file">` elements.
- `tableImport.js` supports CSV/TSV/text/Excel/ODS ingestion and fast clipboard pasting. It lazy-loads `libs/xlsx.full.min.js` as needed, normalizes delimiters, resizes Handsontable grids, and exposes granular hooks (`onBeforeProcess`, `onProcessed`, `onError`).
- `goAnalysis.js` wraps the g:Profiler API. `Shared.goAnalysis.profile` sends POST requests with selected genes, optional background sets, and GO source filters.
- `stringAnalysis.js` drives STRING network/enrichment fetches, including species code resolution (`resolveSpeciesCode`), URL parameter construction, and SVG/JSON parsing.
- `uniprot.js` adds gene-to-UniProt helpers: caching of functional annotations, organism-aware accession lookup, and fallback URLs when the REST API fails.

## Visualization Components (`js/components/`)

### Common Patterns
- Every component file registers itself on `window.Components.<name>` inside an IIFE. A local `state` object caches Handsontable instances, file handles, color selections, stats summaries, etc.
- `init()` finds DOM nodes, applies `Shared.ensureHotWrapperStyles`, binds Handsontable callbacks, attaches resizers (`Shared.attachResizableBox`, `Shared.syncPanelWidths`), and sets `state.scheduleDraw = Shared.debounceFrame(draw)` before triggering an initial render.
- `draw()` reads current Handsontable data plus control panel inputs, computes derived values (bins, correlations, overlaps, etc.), and rebuilds the SVG markup in the `.svgbox` container. Components use `chartStyle` helpers for typography/layout and prefer `Shared.autoResizeSvg`/`serializeCleanSVG` for exports.
- Save/open flows funnel through `Shared.fileIO` and store both the spreadsheet data and configuration (colors, axis settings, test selections, etc.) under a `type`-namespaced payload.
- Example loaders and import buttons call into `Shared.tableImport` so the grid resizing logic stays consistent across modules.
- Each component exposes `ensure()` (idempotent `init` guard) and `draw()` for `js/main.js` to call when tabs become visible.

### Venn (`venn.js`)
- Maintains a comprehensive `state` object covering textarea inputs, numeric count fields, color pickers, GO/STRING controls, tooltip overlays, and cached results (`lastRegions`, `lastCounts`, etc.).
- Core helpers: `parseList`/`splitItems` normalize pasted gene lists, `setsFromLists` builds unique membership sets, and `layoutFromCounts` computes circle radii/positions using iterative circle intersection math.
- `_makeRegionSpec`, `_polylabelRegion`, and related helpers find label centroids inside each overlapping region. Dragging is supported for text nodes via `enableDrag`.
- Statistics: `calcSignificance` hooks into hypergeometric calculations when a total universe size is provided.
- Downstream analysis: integrates `Shared.goAnalysis.profile` to render GO bar charts via Chart.js (`state.goChart`) and `Shared.stringAnalysis.fetchNetwork/ fetchEnrichment` for STRING network SVGs. Exports support PNG/SVG snapshots and `.graph` persistence including GO/STRING settings.
- Layout synchronization leans on `Shared.syncPanelWidths`; GO and STRING option panels use toggled details/fieldset elements defined in `index.html`.

### Box Plot (`box.js`)
- Caches DOM nodes in an `els` object and stores table/order/color/test state separately in `state`.
- Handsontable is configured for 100×10 sheets with header styling, undo/redo, and manual column movement. Example and import flows call `Shared.tableImport`.
- The component builds SVG box/violin/bar charts manually, using `chartStyle` to compute font sizes, margins, and optional rotated tick labels. Users can switch between unified and per-series colors; `updateBoxColorPickers` mirrors Handsontable column headers.
- Statistical testing leverages CDN-loaded `jStat`: t-tests (paired/unpaired), Mann–Whitney, Wilcoxon, ANOVA, and Kruskal–Wallis. Results render both inline and via `renderStatsTable`.
- Saving/opening `.graph` files persists dataset order, color modes, axis limits, and stats configuration.

### Scatter (`scatter.js`)
- Sets up a three-column Handsontable (label, X, Y) with resize observers and shared resizer hooks. Alpha, dot size, border, grid, and log-scale controls trigger debounced redraws.
- `drawScatter` (inside `draw`) plots points with optional regression lines. `global.jStat.corrcoeff` plus Spearman implementations power the statistics panel; formatting helpers keep p-values friendly.
- Label-based coloring uses dynamically generated color inputs stored in `scatterLabelColors`; `Shared.attachColorPickerNear` enables the overlay picker. Export buttons serialize the SVG.
- Confidence/prediction interval shading with residual diagnostics is exposed through dedicated checkboxes; interval summaries and coefficient standard errors are persisted in `.graph` saves alongside regression mode selections.

### PCA / MDS / t-SNE / UMAP (`pca.js`)
- Handsontable defaults to five columns (`Label`, `Var1`–`Var4`). Users choose PCA, MDS, t-SNE, or UMAP along with scaling and color encodings.
- PCA continues to rely on `global.SVDJS` and `global.jStat` for variance/stress metrics; the new t-SNE and UMAP branches run iterative solvers that expect perplexity/learning-rate/epoch controls to stay in sync with the sidebar inputs when the method toggles.
- Axis selects for X/Y/Z components live under `pcaState.axisSelection`; keep them unique and persisted via `getPcaGraphPayload`/`loadPcaGraphFile`. Remember that t-SNE and UMAP are 2D-only and the view select auto-locks to 2D.
- Drag-based 3D rotation still applies to PCA/MDS. Points render in SVG via the active axes; legend entries respect label colors selected through color pickers.

### Line Graph (`line.js`)
- Extends the scatter palette to multiple series (default six columns). Data interpretation expects a header row followed by wide-form values.
- Maintains per-series color pickers, line/point toggles, origin controls, and Pearson/Spearman statistics computed with `global.jStat`.
- Legends dynamically measure text using `chartStyle.measureText` to allocate layout; `Shared.syncPanelWidths` keeps tables aligned after resizes.
- Per-series regression interval bands, coefficient diagnostics, and residual normality checks are toggled in the stats fieldset and included when saving/loading `.graph` files.
- ARIMA and Holt–Winters forecasting modes expose horizon/season controls, auto-tuning helpers, seasonal summaries, and export-safe forecast payloads. Keep debug logs aligned with `regressionTools` helpers when extending interval shading or stats tables.

### Survival (`survival.js`)
- Configures a multi-column Handsontable for group, time, event, optional entry time, and arbitrary covariates with `SURVIVAL_COL_HEADERS` keeping defaults aligned with the UI hints.
- `refreshCovariateControls` rebuilds the Cox covariate selector whenever table columns or saved settings change; ensure new predictors register through `state.covariateSettings` so `.graph` files persist selections.
- `prepareCoxData` constructs time-dependent risk sets using entry times and the selected covariates, while `fitCoxModel` and `computeHazardRatios` rely on the returned `design` metadata. Maintain the debug logging around design matrices and convergence when adjusting these helpers.

### Histogram (`hist.js`)
- Operates on a single numeric column. `draw()` calculates “nice” tick spacing, bins data, and draws axes/bars manually, honoring log-scale and manual Y-range options.
- `updateHistStats` computes mean/median/SD (preferring `global.jStat` but falling back to manual formulas). Font scaling relies on `chartStyle.resolveScaledFontSize`.

### Pie / Proportion Graph (`pie.js`)
- Accepts up to six columns and supports pie, donut, and stacked layouts. Users can toggle percentage labels, frame visibility, start angle, and select observed vs. expected columns for chi-square analysis (handled inline via `global.jStat`).
- Legend widths and slice colors persist through the `state.colors` map. SVG output reuses `chartStyle.ensureSquarePlot` to maintain circular geometry when containers resize.

### ROC / PR Curves (`roc.js`)
- Configured around three-column tables (label + model scores). UI toggles between ROC and Precision-Recall, adjusts grid/frame visibility, and exposes statistical comparisons (DeLong approximations, z-tests, etc.) using `global.jStat`.
- Produces AUC summaries plus optional pairwise comparisons. Label-specific colors mirror other components, and exports go through `Shared.serializeCleanSVG`.

## Data & External Integrations
- **Handsontable** (CDN) supplies spreadsheet editing; every component enforces consistent styling via `Shared.ensureHotWrapperStyles`.
- **jStat** (CDN) underpins statistical routines across modules (box, line, scatter, histogram, ROC, pie).
- **Chart.js** (CDN) is primarily used inside the Venn GO analysis chart, but `Chart.defaults.locale` is set globally in `venn.js` so other modules can adopt it.
- **SVD-JS** (CDN) powers PCA computations.
- **External APIs:** `Shared.goAnalysis` targets g:Profiler, `Shared.stringAnalysis` targets STRING, and `Shared.uniprot` talks to the UniProt REST service. These functions expect `fetch` to be available (the production browser or the Jest setup stubs it).

## Styling
- `css/style.css` mirrors the inline styles from `index.html`, defining the `.wrap` grid, `.panel` look-and-feel, `.svgbox` resizer affordances, and module-specific overrides (`#vennPage`, `#boxPage`, etc.). Updates to layout should occur here rather than inline in HTML.
- `css/styles.css` is a trimmed starter sheet left for future consolidation; new work should focus on `style.css` unless there is a migration plan.

## Testing Infrastructure
- Jest is configured with `testEnvironment: 'jsdom'`. `__tests__/setup/globals.js` installs stubs for Chart.js, Handsontable, ResizeObserver, and browser APIs so component scripts can execute without actual DOM dependencies.
- `__tests__/setup/afterEnv.js` loads `index.html` into JSDOM before each test and strips external `<script>` tags to keep the environment controlled.
- `__tests__/smoke.init.test.js` mirrors the browser load order and asserts that major components initialize (Handsontable constructs, color overlay injection, Chart defaults).
- `__tests__/ui.events.test.js` exercises key button flows such as “Load Example” for each Handsontable workspace and verifies the shared color picker overlay behavior.
- `__tests__/adder.test.js` keeps `src/adder.js` covered; feel free to add similar small-unit tests for extracted logic.
- Always run `npm test` before committing. The stubs rely on scripts being required in the same order as `index.html`, so update the tests if you add new shared/component files.

## Development Tips
- When adding new inputs or configuration controls, update the corresponding component `state` serialization so `.graph` persistence stays accurate.
- Reuse `Shared.debounceFrame` for any redraws triggered by rapid UI events to keep the dashboard responsive.
- When invoking `layout.syncPanels` from within a draw routine, pass `{ skipSchedule: true }` so the automatic panel synchronizer doesn’t immediately requeue another draw on the same frame.
- Prefer `console.debug` with descriptive labels (as the existing codebase does) so logs can be filtered easily in production.
- When assigning workspace tab titles (new tabs, duplication flows, or type switches), call `Main.session.generateUniqueTabTitle` with the current tab ID excluded so names auto-increment (`Scatter Plot #2`, etc.) instead of colliding.
- Keep new modules aligned with the two-panel Handsontable + chart layout, and route imports through `Shared.tableImport` to benefit from shared CSV/XLSX handling.
- If you integrate additional external services, mirror the pattern used in `goAnalysis`, `stringAnalysis`, or `uniprot` and centralize API interaction inside `window.Shared` so tests can stub it cleanly.
