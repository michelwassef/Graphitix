# Venn Data Visualization Studio

Venn is a browser-based analytics workspace that turns tabular data into publication-ready graphics. The app combines spreadsheet-style data entry, rich styling controls, and statistical tooling across multiple visualization workspaces—no server or build tooling required.

## Why Venn?
- **One workspace, many charts.** Switch between Venn diagrams, box plots, scatter plots, 3D surfaces, dimensionality reduction, line charts, ROC/PR curves, histograms, and proportion plots without leaving the page.
- **Spreadsheet comfort.** Each module embeds a Handsontable grid with undo/redo, paste-special helpers (including transpose), CSV/TSV/Excel/ODS import, and column reordering.
- **Inline styling & stats.** Workspace toolbars with undo/redo, axis controls, typography tools, and per-module statistics live beside every chart so you can tune visuals and analyses in real time.
- **Offline friendly.** Everything runs client-side in HTML, CSS, and vanilla JavaScript; only GO and STRING enrichment lookups require network access.
- **Reusable sessions.** Save `.graph` files for individual charts or `.session` files for entire multi-tab workspaces, then reopen them later to pick up where you left off.

## Visualization Modules
| Module | Primary use cases | Notable tools |
| --- | --- | --- |
| **Venn** | Compare list overlaps, perform GO enrichment, fetch STRING networks | Region inspector, hypergeometric significance, GO/STRING exports |
| **Box Plot** | Group comparisons, violin overlays, bar charts | Parametric/non-parametric tests, stats advisor, per-series color pickers |
| **Scatter / Volcano / MA** | Relationship exploration, differential expression, regression | Volcano & MA plot variants, regression toolbox, 2D/3D views, density coloring, label-based colors |
| **3D Surface** | 3D data visualization, topography, response surfaces | Interactive rotation, grid interpolation, color gradients, mesh/surface toggling |
| **Heatmap** | Correlation matrices, hierarchical clustering | Dendrogram overlays, color scale legend |
| **PCA / MDS / t-SNE / UMAP** | Dimensionality reduction for multivariate data | Axis selectors, 2D/3D views, method-specific controls, lazy-loaded solvers, variance summaries |
| **Line Graph** | Time series, longitudinal trends, forecasting | Pearson/Spearman stats, ARIMA & Holt–Winters forecasts, interval bands |
| **ROC / PR** | Model evaluation | ROC/PR curve toggle, AUC summaries, DeLong pairwise comparisons, guided test selection |
| **Survival** | Kaplan–Meier curves, Cox modeling | Covariate selection, hazard ratio tables, log-rank tests, stats advisor |
| **Histogram** | Distribution summaries | Log scaling, auto binning, PDF/CDF overlays, descriptive stats |
| **Proportion (Pie/Donut/Stacked)** | Category proportions, Chi² tests | Slice styling, stacked bar axis tools, Chi² goodness-of-fit |

All modules share a two-panel layout: Handsontable workspace on the left, responsive SVG canvas with contextual controls on the right. Drag the center divider or canvas resize handle to rebalance your layout per tab—the app remembers your choices for each workspace.

### Graph Variants
Some modules support multiple visualization variants accessible via dropdown controls:
- **Scatter:** Standard scatter plot, Volcano plot (for differential expression), MA plot (mean-difference)
- **Box:** Box plot, violin plot, bar chart, strip chart (individual values)
- **PCA:** 2D or 3D views with interactive rotation
- **Pie:** Pie chart, donut chart, stacked bar chart

## Working with Data
1. **Load examples or import files.** Use the *Load Example* buttons to see expected schemas, or import CSV, TSV, TXT, XLS, XLSX, ODS, and clipboard content directly into the grid.
2. **Edit like a spreadsheet.** Sort columns, undo/redo changes, and use *Paste → Transposed* to rotate clipboard selections when switching between wide and tall formats. The workspace toolbar provides quick access to undo/redo buttons.
3. **Configure visuals.** Adjust colors, fonts, axes, and overlays from the side controls. Inline text editing keeps the font toolbar active so you can fine-tune titles and labels without modal dialogs.
4. **Run analyses.** Enable overlap significance, hypothesis tests, regression models, Chi² checks, or AUC comparisons from the module-specific statistics panels.
5. **Save or export.** Download SVG/PNG snapshots, save individual charts as `.graph` files, or persist entire multi-tab workspaces as `.session` files to capture all your work.

## Example Workflow
1. Open `index.html` in a modern browser.
2. Navigate to **Scatter Plot** and click *Load Example* to populate the table.
3. Use the regression controls to test linear vs. polynomial fits while adjusting axis ranges via the in-canvas toolbar.
4. Click *Duplicate Tab* from the toolbar menu and choose whether to reuse the current data or start empty.
5. In the new tab, switch to a **Volcano** plot variant using the graph type dropdown to visualize differential expression.
6. Use *Match Styles* from the toolbar to copy fonts, colors, and axis settings from your scatter plot.
7. Create additional tabs for **Line Graph** or **Box Plot** visualizations of the same dataset.
8. Save the entire workspace as a `.session` file to preserve all tabs, or export individual charts as `.graph` files or SVG/PNG images.

### Tab Management
- **Create tabs:** Click the "+" button or use the quick launcher on the welcome screen to add new visualization workspaces.
- **Duplicate tabs:** Right-click a tab or use the toolbar menu to duplicate it—choose to reuse data or start with an empty table.
- **Drag and reorder:** Click and drag tabs to reorder them in your workspace.
- **Match styles:** Copy typography, colors, and axis settings from one tab to another using the *Match Styles* toolbar option.
- **Rename tabs:** Double-click a tab title to rename it inline.
- **Close tabs:** Click the × button on any tab (the welcome screen cannot be closed).

## Architecture Overview
- **HTML (`index.html`).** Hosts every workspace, navigation controls, and script includes. Load order is critical: vendor libraries, shared utilities, component bundles, then `main.js` bootstrap.
- **CSS (`css/style.css`).** Centralizes layout (two-panel grid, resizers, toolbars) and module-specific styling. Additional legacy styles remain in `css/styles.css`.
- **JavaScript (`js/`).** Organized into:
  - `js/shared/` - Shared utilities (debouncing, DOM helpers, file I/O, table import, GO/STRING/UniProt integrations, color picker, workspace toolbar)
  - `js/components/` - Visualization modules (venn, box, scatter, surface, pca, line, heatmap, roc, survival, hist, pie)
  - `js/main/` - Bootstrap logic, session management, tab controls, style syncing, and workspace coordination
  - Modules expose themselves via `window.Shared` and `window.Components` namespaces
- **Vendor assets (`libs/`).** Bundled XLSX parser supports offline spreadsheet imports. Other libraries (Chart.js, SVD-JS) are lazy-loaded when requested.
- **Scripts & tests.** Jest-based smoke and UI tests live in `__tests__/`. Helper scripts (e.g., the volcano benchmark) sit under `scripts/` for targeted performance checks.

## Getting Started (Developers)
1. **Install dependencies:** `npm install`
2. **Run tests:** `npm test`
3. **Open the app:** Serve the repository or open `index.html` directly in the browser.
4. **Debug logging:** Toggle verbose output with `Shared.enableDebugLogging()` / `Shared.disableDebugLogging()` in the browser console.

### File Formats
- **`.graph` files:** JSON format storing data, styling, and layout for a single chart. Can be opened via the toolbar *Open* menu or drag-dropped onto the welcome screen.
- **`.session` files:** JSON format storing an entire multi-tab workspace including all charts, tab order, and active tab state. Use *File → Save Session* or *Load Session* from the toolbar.
- **Data imports:** CSV, TSV, TXT, XLS, XLSX, ODS formats supported via the *Import* toolbar button or paste operations.

## Testing & Quality
- `npm test` spins up JSDOM, loads `index.html`, and verifies each component initializes correctly.
- Performance guards exercise heavy workloads such as the heatmap clusterer and report when thresholds are exceeded.
- `npm run bench -- [options]` executes `scripts/run-benchmarks.js`, a lightweight CLI that calls each component’s synthetic workload hooks and reports mean/median durations. Use `--json bench.json` to capture a baseline and `--compare bench.json` on future runs to see deltas. Inputs can be overridden inline (`box.rows=50000`) or via `--config overrides.json`.
- No linting is configured; Jest is the authoritative automated check.

## Troubleshooting
- **Large datasets:** Widen the Handsontable pane or SVG canvas using the resizer handles. For extremely wide tables, duplicate tabs to keep context while exploring subsets.
- **Slow renders:** Reduce point counts, enable transparency, or switch to log axes to maintain clarity on dense scatter plots. For volcano plots with thousands of points, consider filtering to show only significant genes.
- **Network calls:** GO enrichment and STRING network fetches require internet access; all other features operate offline.
- **Avoid redraw loops:** When modifying layouts from draw routines, call `Shared.syncPanelWidths({ skipSchedule: true })` to prevent recursive scheduling.
- **Memory profiling:** Run `node --expose-gc scripts/volcano-benchmark.js` to compare optimized volcano handling against legacy behavior.
- **Session files:** If a `.session` file fails to load, verify it's valid JSON and contains the expected `tabs` array structure. Individual `.graph` files can be recovered from corrupted sessions by extracting the `payload` field from each tab.
- **Undo/Redo:** Each workspace maintains its own undo stack. Use the toolbar undo/redo buttons or keyboard shortcuts (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z).
- **Tab management:** Tabs are auto-saved to browser storage. Closing the browser preserves your workspace, but explicitly saving a `.session` file provides a permanent backup.
- **Style matching:** The *Match Styles* feature copies fonts, colors, and axis settings but not data or analysis configurations.

## Contributing
1. Follow the existing `window.Shared` / `window.Components` namespace patterns when adding functionality.
2. Gate verbose logging behind the shared debug toggle and reuse cached data helpers to keep the memory footprint low.
3. Update automated tests or add new coverage for workflow changes.
4. Submit pull requests with clear descriptions of user-facing changes and run `npm test` before committing.

