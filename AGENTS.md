# Venn Workspace – Engineering Playbook

This guide captures the conventions that keep the Venn dashboard consistent across its many visualization workspaces. Every rule applies repository-wide unless a component-specific note states otherwise.

## 0. Architecture Docs (Start Here)
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) – primary orientation map for runtime flow, namespaces, and component contracts.
- [`docs/development/main-bootstrap.md`](./docs/development/main-bootstrap.md) – strict `Main.*` bootstrap sequence and load-order guards.
- [`docs/development/module-call-map.md`](./docs/development/module-call-map.md) – generated dependency map for `Shared`, `Components`, and `Main` symbol usage.
- [`docs/development/component-contracts.md`](./docs/development/component-contracts.md) – generated per-component contract matrix (registry hooks, host IDs, payload baseline keys).
- [`docs/development/state-persistence-schema.md`](./docs/development/state-persistence-schema.md) – canonical session/tab payload and `.graph` persistence schema.

## 1. Layout & UX Framework
- **Two-panel structure:** The left third of each workspace hosts the full-height AG Grid input; the right two thirds contain visual output and controls. Keep a draggable divider (`.panel-resizer`) between the panels and mirror the sizing rules in `css/style.css` under `#<Name>Page` selectors.
- **Right panel stack:** Place charts on the upper-left, chart controls to their upper-right, and derived statistics in the lower segment. New dashboards should follow the precedent set by the Line Graph page.

## 2. Coding Standards
- **Debug instrumentation:** When implementing new logic, add `console.debug`/`console.log` statements gated by `Shared.isDebugEnabled()`. Offer toggle helpers through `Shared.enableDebugLogging()` / `Shared.disableDebugLogging()` and label the messages for easy filtering.
- **AG Grid behavior:** Build grids through `Shared.hot.createStandardTable` (AG Grid-backed) so the grey header row remains intact. For fixed-schema datasets (e.g., survival analysis) disable header rows explicitly and provide `colHeaders`.
- **Context menu:** Preserve the shared AG Grid context menu extension that injects the *Paste → Transposed* action.
- **Data reuse:** Use the cached parsing helpers (`ensureParsedLists`, `state.analysis.lastParsedLists`) instead of cloning large data sets. This keeps the memory footprint minimal.
- **Error bars:** Suppress error bars when a series/category has a single valid value and log the skip for debugging clarity.
- **Namespace access:** Expose new helpers through `window.Shared` or `window.Components`. Load lazily via `Main.components.ensureComponent` / `loadComponentBundle` rather than adding inline `<script>` tags.
- **Resizer etiquette:** When triggering layout syncs during redraws, call `Shared.syncPanelWidths` with `{ skipSchedule: true }` to avoid redundant work.
- **Species recognition hooks:** The Venn workspace relies on `scheduleSpeciesRecognition` / `recognizeSpeciesFromInput`; reuse them when wiring new triggers.

## 3. Architecture Reference
### 3.1 Directory Overview
- `index.html` – boots every workspace, defines tab markup, and orders script execution.
- `css/style.css` – canonical style sheet; update this file (not inline styles) when adjusting layouts. `css/styles.css` remains a legacy stub.
- `js/` – contains vendor shims, shared utilities, and component modules (`app.js`, `ui.js`, `utils.js`, etc.).
- `libs/` – vendored assets such as the XLSX parser used by the importer.
- `__tests__/` – Jest suites with custom DOM bootstrapping.
- `src/` – sample utilities (e.g., `adder.js`) covered by unit tests.

### 3.2 Execution Flow
1. CDN libraries load first, followed by `js/vendor.js`, shared utilities, component bundles, and finally `js/main.js`.
2. `js/main.js` activates tab switching (`showPage`), initializes every `window.Components.*.init`, exports helpers to `window.Shared`, and coordinates layout syncing.
3. Legacy inline functions in `index.html` must continue to expose behavior through `window.Shared` / `window.Components` during migrations.

### 3.3 Global Namespaces
- `window.Shared` – cross-cutting utilities: debouncing, DOM helpers, file IO, table import, GO/STRING/UniProt integrations, color picker overlay, etc. Modules extend the namespace via IIFEs.
- `window.Components` – visualization workspaces. Each module (e.g., `Components.box`) exposes `init`, `draw`, `ensure`, and persistence helpers while guarding against double initialization with `__installed`/`ready` flags.

## 4. Shared Utility Highlights (`js/shared/`)
- `debounce.js` – `Shared.debounceFrame(fn)` schedules work on the next animation frame and logs lifecycle events.
- `resizer.js` – `Shared.attachResizableBox` and `Shared.syncPanelWidths` manage `.svgbox` resizing, enforce `chartStyle` defaults, and persist widths.
- `dom.js` – editable text, SVG autoresize, and sanitized SVG export helpers.
- `chartStyle.js` – typography scaling, axis math, font normalization, and SVG default styling.
- `colorPicker.js` – floating palette overlay with shared `<input type="color">` control.
- `hot.js` – Grid wrapper that hosts AG Grid wiring plus a `createEmptyData` fallback for tests.
- `fileIO.js` – `.graph` file persistence with File System Access API fallbacks and callbacks for saving handles.
- `tableImport.js` – CSV/TSV/text/Excel/ODS ingestion, lazy XLSX loading, and hook-based preprocessing.
- `goAnalysis.js`, `stringAnalysis.js`, `uniprot.js` – external API integrations with caching, SVG parsing, and dataset preparation utilities.

## 5. Component Playbooks
- **Venn (`venn.js`):** Uses cached list parsing, integrates GO/STRING analysis via Chart.js and network SVGs, and coordinates PNG/SVG/`.graph` exports. Ensure layout sync and API caching stay intact.
- **Box (`box.js`):** Manages AG Grid state, builds SVG box/violin charts, hooks jStat statistics (t-tests, ANOVA, etc.), and persists configuration/state.
- **Scatter (`scatter.js`):** Three-column table, regression statistics, label-based color controls, and SVG exports with optional interval shading.
- **PCA/MDS/t-SNE/UMAP (`pca.js`):** Multi-column table, solver selection, axis persistence, t-SNE/UMAP control sync, and optional 3D rotation for PCA/MDS.
- **Line (`line.js`):** Multi-series plotting, regression diagnostics, ARIMA/Holt-Winters forecasting, and legend sizing via `chartStyle`.
- **Survival (`survival.js`):** Enforces the baseline four columns via `SURVIVAL_COL_HEADERS`, rebuilds Cox covariate controls on schema changes, and logs design matrices during model fitting.
- **Histogram (`hist.js`):** Single-column numeric input, adaptive binning, log-scale toggles, and descriptive statistics updates.
- **Pie/Proportion (`pie.js`):** Pie/donut/stacked layouts, chi-square analysis via jStat, and legend color persistence.
- **ROC/PR (`roc.js`):** Score-based tables, ROC/PR toggles, DeLong comparisons, and SVG export tools.

## 6. Data & External Integrations
- **AG Grid:** Always style via `Shared.ensureHotWrapperStyles`. Maintain the clipboard importer and context menu consistency.
- **jStat:** Shared statistical backbone across components.
- **Chart.js:** Primarily used within the Venn GO analysis; `Chart.defaults.locale` is set in `venn.js`.
- **SVD-JS:** Powers PCA computations.
- **APIs:** g:Profiler (`goAnalysis`), STRING (`stringAnalysis`), and UniProt (`uniprot`) expect `fetch` availability and are mocked in tests.

## 7. Styling Guidelines
- Update `css/style.css` for layout or typography tweaks; keep `.wrap`, `.panel`, `.svgbox`, and module-specific selectors aligned with HTML.
- Maintain consistent styles across `.stats-advisor` panels for box, scatter, line, ROC, and survival components.

## 8. Testing & Benchmarks
- Run `npm test` after code changes. Tests load `index.html` into JSDOM and rely on scripts being required in the same order as the browser.
- For performance-sensitive scatter/volcano work, validate memory behavior with `node --expose-gc scripts/volcano-benchmark.js` to compare optimizations.

## 9. Development Tips
- Keep state serialization in sync with new inputs so `.graph` persistence remains accurate.
- Use `Shared.debounceFrame` for rapid UI event redraws.
- Call `Main.session.generateUniqueTabTitle` when generating workspace tabs to avoid naming collisions.
- When integrating new external services, mirror the patterns in `goAnalysis`, `stringAnalysis`, or `uniprot` and centralize stubs under `window.Shared` for testability.
- Prefer `console.debug` with descriptive labels to keep logs filterable in production.
