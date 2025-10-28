# Venn Data Visualization Studio

Venn is a browser-based analytics workspace that turns tabular data into publication-ready graphics. The app combines spreadsheet-style data entry, rich styling controls, and statistical tooling across multiple visualization workspaces—no server or build tooling required.

## Why Venn?
- **One workspace, many charts.** Switch between Venn diagrams, box plots, scatter plots, dimensionality reduction, line charts, ROC/PR curves, histograms, and proportion plots without leaving the page.
- **Spreadsheet comfort.** Each module embeds a Handsontable grid with undo/redo, paste-special helpers (including transpose), CSV/TSV/Excel import, and column reordering.
- **Inline styling & stats.** Axis toolbars, typography controls, and per-module statistics live beside every chart so you can tune visuals and analyses in real time.
- **Offline friendly.** Everything runs client-side in HTML, CSS, and vanilla JavaScript; only GO and STRING enrichment lookups require network access.
- **Reusable sessions.** Save `.graph` files that capture both data and appearance, then reopen them later to pick up where you left off.

## Visualization Modules
| Module | Primary use cases | Notable tools |
| --- | --- | --- |
| **Venn** | Compare list overlaps, perform GO enrichment, fetch STRING networks | Region inspector, hypergeometric significance, GO/STRING exports |
| **Box Plot** | Group comparisons, violin overlays, bar charts | Parametric/non-parametric tests, stats advisor, per-series color pickers |
| **Scatter** | Relationship exploration, regression, clustering inspection | Regression toolbox, label-based colors, residual diagnostics |
| **Heatmap** | Correlation matrices, hierarchical clustering | Dendrogram overlays, color scale legend |
| **PCA / MDS / t-SNE / UMAP** | Dimensionality reduction for multivariate data | Axis selectors, method-specific controls, lazy-loaded solvers |
| **Line Graph** | Time series, longitudinal trends, forecasting | Pearson/Spearman stats, ARIMA & Holt–Winters forecasts, interval bands |
| **ROC / PR** | Model evaluation | AUC summaries, pairwise comparisons, guided test selection |
| **Survival** | Kaplan–Meier curves, Cox modeling | Covariate selection, hazard ratio tables, stats advisor |
| **Histogram** | Distribution summaries | Log scaling, auto binning, descriptive stats |
| **Proportion (Pie/Donut/Stacked)** | Category proportions, Chi² tests | Slice styling, stacked bar axis tools, Chi² goodness-of-fit |

All modules share a two-panel layout: Handsontable workspace on the left, responsive SVG canvas with contextual controls on the right. Drag the center divider or canvas resize handle to rebalance your layout per tab—the app remembers your choices for each workspace.

## Working with Data
1. **Load examples or import files.** Use the *Load Example* buttons to see expected schemas, or import CSV, TSV, TXT, XLS, XLSX, ODS, and clipboard content directly into the grid.
2. **Edit like a spreadsheet.** Sort columns, undo mistakes, and use *Paste → Transposed* to rotate clipboard selections when switching between wide and tall formats.
3. **Configure visuals.** Adjust colors, fonts, axes, and overlays from the side controls. Inline text editing keeps the font toolbar active so you can fine-tune titles and labels without modal dialogs.
4. **Run analyses.** Enable overlap significance, hypothesis tests, regression models, Chi² checks, or AUC comparisons from the module-specific statistics panels.
5. **Save or export.** Download SVG/PNG snapshots or persist a `.graph` session to capture data, layout, and styling for later use.

## Example Workflow
1. Open `index.html` in a modern browser.
2. Navigate to **Scatter Plot** and click *Load Example* to populate the table.
3. Use the regression controls to test linear vs. polynomial fits while adjusting axis ranges via the in-canvas toolbar.
4. Duplicate the tab, switch to **Line Graph**, and apply *Match Styles* to reuse fonts and colors across plots.
5. Save both charts as `.graph` files or export SVGs for reports.

## Architecture Overview
- **HTML (`index.html`).** Hosts every workspace, navigation controls, and script includes. Load order is critical: vendor libraries, shared utilities, component bundles, then `main.js` bootstrap.
- **CSS (`css/style.css`).** Centralizes layout (two-panel grid, resizers, toolbars) and module-specific styling. Additional legacy styles remain in `css/styles.css`.
- **JavaScript (`js/`).** Organized into shared utilities (`js/shared/`), component modules (`js/components/`), and bootstrap logic (`js/main/`). Modules expose themselves via `window.Shared` and `window.Components` so inline legacy helpers continue to operate.
- **Vendor assets (`libs/`).** Bundled XLSX parser supports offline spreadsheet imports. Other libraries (Chart.js, SVD-JS) are lazy-loaded when requested.
- **Scripts & tests.** Jest-based smoke and UI tests live in `__tests__/`. Helper scripts (e.g., the volcano benchmark) sit under `scripts/` for targeted performance checks.

## Getting Started (Developers)
1. **Install dependencies:** `npm install`
2. **Run tests:** `npm test`
3. **Open the app:** Serve the repository or open `index.html` directly in the browser.
4. **Debug logging:** Toggle verbose output with `Shared.enableDebugLogging()` / `Shared.disableDebugLogging()` in the browser console.

## Testing & Quality
- `npm test` spins up JSDOM, loads `index.html`, and verifies each component initializes correctly.
- Performance guards exercise heavy workloads such as the heatmap clusterer and report when thresholds are exceeded.
- No linting is configured; Jest is the authoritative automated check.

## Troubleshooting
- **Large datasets:** Widen the Handsontable pane or SVG canvas using the resizer handles. For extremely wide tables, duplicate tabs to keep context while exploring subsets.
- **Slow renders:** Reduce point counts, enable transparency, or switch to log axes to maintain clarity on dense scatter plots.
- **Network calls:** GO enrichment and STRING network fetches require internet access; all other features operate offline.
- **Avoid redraw loops:** When modifying layouts from draw routines, call `layout.syncPanels({ skipSchedule: true })` to prevent recursive scheduling.
- **Memory profiling:** Run `node --expose-gc scripts/volcano-benchmark.js` to compare optimized volcano handling against legacy behavior.

## Contributing
1. Follow the existing `window.Shared` / `window.Components` namespace patterns when adding functionality.
2. Gate verbose logging behind the shared debug toggle and reuse cached data helpers to keep the memory footprint low.
3. Update automated tests or add new coverage for workflow changes.
4. Submit pull requests with clear descriptions of user-facing changes and run `npm test` before committing.

