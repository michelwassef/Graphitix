# Graphitix

Graphitix is a browser-based scientific plotting and statistics application. It turns spreadsheet-style data into publication-ready figures, statistical reports, and reusable multi-tab workspaces.

Open the web app here: **https://michelwassef.github.io/Graphitix/**

Graphitix runs in the browser and is designed for static hosting. Most work is done locally in the page: enter data, import a file, build graphs, run analyses, export figures, or save the full workspace as a `.graph` archive.

## What Graphitix Does

- Creates publication-style scientific graphs from tabular data.
- Combines editable data tables, graph controls, statistics, and exports in one workspace.
- Supports many independent tabs in the same session.
- Preserves tab state, graph size, styling, analysis settings, results, notes, previews, and render caches in `.graph` files.
- Reopens saved files so they behave like the original live workspace.
- Imports common data formats, including CSV, TSV, TXT, Excel, ODS, Graphitix archives, and experimental Prism/PZFX data tables.
- Exports figures as SVG and PNG.
- Provides built-in statistical summaries, tests, regression models, diagnostics, and comparison tools.
- Includes optional GO enrichment, STRING network, and UniProt integrations for biological datasets.
- Can be used as the hosted web app, opened locally from `index.html`, or packaged with the optional Electron desktop wrapper.

## Main Interface

The app opens on a graph finder. You can search for a graph type, start from a blank graph, load an example, drag in a file, or open an existing Graphitix archive.

Each workspace uses a consistent layout:

- Left side: spreadsheet-like AG Grid table for data entry and import.
- Right side: graph output, graph controls, statistics, notes, and exports.
- Bottom tab bar: multiple graph tabs, duplication, tab saving, drag reordering, and tab-specific state.

Graph tabs are isolated from each other. Data, styling, statistics, cached results, graph dimensions, preview images, and undo history are stored per tab.

## Supported Graphs

| Area | Graphs and analyses |
| --- | --- |
| Distribution charts | Box plots, notched box plots, violin plots, bar plots, individual-value strip plots, summary overlays, point connections, error bars, significance annotations |
| XY plots | 2D scatter, bubble plots, 3D scatter, volcano plots, MA plots, grouped points, labels, regression, trendlines, density coloring |
| Line and area charts | Line charts, area charts, time-series style plots, regression, correlation, forecasting, error bars |
| Histogram and density | Histograms, frequency distributions, density plots, PDF/CDF overlays, bin controls, distribution fitting |
| Heatmap and clustering | Data-value heatmaps, row/column correlation heatmaps, clustering, dendrograms, matrix summaries |
| Dimensionality reduction | PCA, MDS, t-SNE, UMAP, 2D and 3D views, scree summaries, loadings tables, biplot-style outputs |
| 3D surface | Grid and point-based 3D surface plots, interpolation, rotation, color ramps |
| Classification curves | ROC curves, precision-recall curves, AUC/AP metrics, threshold tables, model comparisons |
| Survival analysis | Kaplan-Meier curves, censoring, confidence intervals, log-rank tests, Cox regression |
| Proportions | Pie charts, donut charts, stacked bars, observed/expected comparisons |
| Sets | Venn diagrams, UpSet plots, overlap counts, region inspection, enrichment/network analysis |

## Data Input

Graphitix uses AG Grid-backed tables with spreadsheet-style behavior:

- Paste data directly from spreadsheets.
- Paste transposed data from the context menu.
- Import CSV, TSV, TXT, XLS, XLSX, ODS, `.graph`, `.json`, `.prism`, and `.pzfx` files.
- Preview imported data and choose delimiter, sheet, start row, title row, and trimming options.
- Sort and reorder columns where supported.
- Use undo/redo for table and graph edits.
- Use formula-enabled cells in supported workspaces, with raw formula preservation and computed values.
- Keep large parsed datasets cached for faster tab switching and reopening.

Prism/PZFX import is experimental. Graphitix imports data tables from those files; it does not preserve Prism graph settings or export back to Prism/PZFX.

## Saving and Reopening Work

Graphitix saves work as `.graph` archives. A saved archive can contain one tab or the full workspace.

Saved archives include:

- data tables and headers
- graph type and subtype
- styling and publication settings
- graph dimensions and layout
- analysis settings and statistical results
- notes and embedded result tables
- 2D/3D view state where supported
- cached render data for faster reopen
- tab titles, previews, and tab order

You can reopen a file into the current workspace or replace the current tabs. The app also tracks unsaved changes and prompts before destructive replacement.

## Styling and Export

Graphitix is built for figure preparation:

- SVG export for editable vector output.
- PNG export for direct use in documents and slides.
- Shared styling controls for fonts, labels, axes, colors, legends, symbols, line widths, opacity, and graph sizing.
- Publication style presets and style synchronization across selected tabs.
- Editable labels and draggable graph text in supported workspaces.
- 3D rotation and persisted camera/view settings for 3D graphs.

## Statistics

Statistics are built into the relevant graph workspaces instead of being separated into another tool.

| Workspace | Statistical support |
| --- | --- |
| Distribution charts | Group comparisons, paired/unpaired tests, ANOVA-style workflows, non-parametric alternatives, multiple comparisons, effect sizes, assumptions, trend checks, and outlier screening |
| XY plots | Correlation, regression families, confidence/prediction intervals, residual diagnostics, grouped comparisons, and differential-expression summaries for volcano/MA views |
| Line and area charts | Correlation, regression, model diagnostics, error summaries, ARIMA forecasting, and Holt-Winters forecasting |
| Histogram and density | Descriptive statistics, bin summaries, density estimates, distribution fits, PDF/CDF overlays, and fit diagnostics |
| Heatmap and clustering | Matrix summaries, row/column correlation views, clustering summaries, and dendrogram-based exploration |
| Dimensionality reduction | PCA variance summaries, loadings, MDS stress/inertia summaries, t-SNE/UMAP projection reporting, and 2D/3D group summaries |
| Classification curves | ROC AUC, PR average precision, threshold metrics, uncertainty summaries, DeLong comparison, bootstrap, and permutation workflows |
| Survival analysis | Kaplan-Meier summaries, censoring-aware curves, log-rank family tests, pairwise comparisons, Cox modeling, and hazard-ratio reporting |
| Proportions | Observed/expected summaries, chi-square goodness-of-fit, contingency-style comparisons, and part-to-whole reporting |
| Sets | Overlap counts, hypergeometric overlap testing, region summaries, GO enrichment, STRING network retrieval, and UniProt-assisted annotation |
| 3D surface | X/Y/Z summaries, grid/point inspection, interpolation-aware views, and persisted 3D orientation for reproducible visual review |

## Privacy and External Services

The core app is client-side. Data entry, plotting, most statistics, saving, and exporting run in the browser.

External network access is used for:

- CDN-loaded runtime libraries when using the hosted/static app.
- Optional GO enrichment requests.
- Optional STRING network requests.
- Optional UniProt lookups.

## Project Structure

- `index.html`: application shell and workspace markup.
- `css/style.css`: main stylesheet.
- `js/main/`: session, tabs, loading, previews, prompts, and workspace orchestration.
- `js/shared/`: shared services for grids, imports, exports, archives, statistics, styling, undo, workers, themes, and integrations.
- `js/components/`: graph-specific modules.
- `js/workers/`: background workers for heavier archive, box, scatter, PCA, and heatmap work.
- `libs/`: vendored browser libraries used by the static app.
- `__tests__/`: Jest tests.
- `e2e/`: Playwright browser tests.
- `scripts/`: build, validation, benchmark, architecture, and diagnostic scripts.
- `docs/`: architecture, contracts, persistence schema, and statistical validation notes.
- `desktop/`: optional Electron wrapper. The web app is the source; desktop assets are synchronized from it.

## Development

Requirements:

- Node.js 20+ recommended.
- Python 3.10+ with NumPy and SciPy for the independent statistical oracle tests.

Common commands:

- `npm install`
- `npm test`
- `npm run test:stats`
- `npm run test:e2e`
- `npm run test:e2e:contracts`
- `npm run test:e2e:matrix`
- `npm run bench`
- `npm run pages:check`

Desktop commands:

- `npm run desktop:dev`
- `npm run desktop:sync`
- `npm run desktop:build`
- `npm run desktop:build:portable`
- `npm run desktop:build:installer`

## Validation

The test suite covers:

- component lifecycle and tab isolation
- file reopen and archive round trips
- render-cache restoration
- table import and clipboard behavior
- formula handling
- graph sizing and resize behavior
- export behavior
- shared styling and themes
- statistical engines and statistical UI panels
- browser-level workflows through Playwright
- differential statistical checks against a Python/SciPy oracle

More detail is available in:

- `AGENTS.md` — normative engineering and ownership rules
- `ARCHITECTURE.md` — current runtime structure and orientation
- `issues.txt` — verified open engineering work
- `CHANGELOG.md` — completed changes
- `CONTRIBUTING.md` — development and validation workflow
- `docs/development/main-bootstrap.md`
- `docs/development/module-call-map.md`
- `docs/development/component-contracts.md`
- `docs/development/state-persistence-schema.md`
- `docs/statistical-validation-framework.md`

## Deployment

The web app is deployed to GitHub Pages:

https://michelwassef.github.io/Graphitix/

The repository includes a Pages check/build flow. `npm run pages:check` validates the static app and builds the `_site/` artifact used by the GitHub Pages workflow.

## License

Graphitix is licensed under the MIT License. See `LICENSE`.
