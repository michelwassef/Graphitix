# Venn Data Visualization Studio

Venn is a browser-based analytics workspace that turns tabular data into publication-ready graphics. The app combines spreadsheet-style data entry, rich styling controls, and statistical tooling across multiple visualization workspaces—no server or build tooling required.

## Why Venn?
- **One workspace, many charts.** Switch between Venn diagrams, box plots, scatter plots, 3D surfaces, dimensionality reduction, line charts, ROC/PR curves, histograms, and proportion plots without leaving the page.
- **Spreadsheet comfort.** Each module embeds an AG Grid table with undo/redo, paste-special helpers (including transpose), CSV/TSV/Excel/ODS import, and column reordering.
- **Inline styling & stats.** Workspace toolbars with undo/redo, axis controls, typography tools, and per-module statistics live beside every chart so you can tune visuals and analyses in real time.
- **Offline friendly.** Everything runs client-side in HTML, CSS, and vanilla JavaScript; only GO and STRING enrichment lookups require network access.
- **Reusable workspaces.** Save `.graph` archives for either the current tab or all tabs, then reopen them later to pick up where you left off.

## Visualization Modules
| Module | Primary use cases | Notable tools |
| --- | --- | --- |
| **Venn** | Compare list overlaps, perform GO enrichment, fetch STRING networks | Region inspector, hypergeometric significance, GO/STRING exports |
| **Box Plot** | Group comparisons, violin overlays, bar charts | t-tests (paired/unpaired), Welch, ANOVA, Mann-Whitney U, Wilcoxon, Kruskal-Wallis, Games-Howell, Dunn's test, multiple comparison corrections (Bonferroni, Holm, Šidák, Hochberg, BH/BY FDR), effect sizes (Cohen's d, Glass's delta, Hedges' g, rank-biserial r), stats advisor, per-series color pickers |
| **Scatter / Volcano / MA** | Relationship exploration, differential expression, regression | Pearson/Spearman correlation, regression models (linear, quadratic, cubic, exponential, power-law, logistic, spline), R²/adjusted R², RMSE, MAE, residual diagnostics, Jarque-Bera test, confidence/prediction intervals, Volcano & MA plot variants, 2D/3D views, density coloring, label-based colors |
| **3D Surface** | 3D data visualization, topography, response surfaces | Interactive rotation, grid interpolation, color gradients, mesh/surface toggling |
| **Heatmap** | Correlation matrices, hierarchical clustering | Pearson/Spearman correlation, hierarchical clustering, dendrogram overlays, distance metrics, color scale legend |
| **PCA / MDS / t-SNE / UMAP** | Dimensionality reduction for multivariate data | Axis selectors, 2D/3D views, method-specific controls, lazy-loaded solvers, variance explained summaries, PC loadings tables |
| **Line Graph** | Time series, longitudinal trends, forecasting | Pearson/Spearman correlation, regression models (linear, quadratic, cubic, exponential, power-law, logistic, spline), ARIMA & Holt–Winters forecasts, R²/adjusted R², RMSE, MAE, residual diagnostics, interval bands |
| **ROC / PR** | Model evaluation | ROC/PR curve toggle, AUC summaries, pairwise comparisons (DeLong, bootstrap, permutation), sensitivity/specificity analysis, guided test selection |
| **Survival** | Kaplan–Meier curves, Cox modeling | Kaplan-Meier estimator, log-rank test, Cox proportional hazards regression, hazard ratios (pairwise/adjusted), time-dependent covariates, covariate selection, stats advisor |
| **Histogram** | Distribution summaries | Descriptive statistics (mean, median, SD, Q1, Q3), log scaling, auto binning, PDF/CDF overlays |
| **Proportion (Pie/Donut/Stacked)** | Category proportions, Chi² tests | Chi² goodness-of-fit test, observed vs. expected frequencies, slice styling, stacked bar axis tools |

All modules share a two-panel layout: AG Grid workspace on the left, responsive SVG canvas with contextual controls on the right. Drag the center divider or canvas resize handle to rebalance your layout per tab-the app remembers your choices for each workspace.

## Statistical Tests & Analyses

Each visualization module includes statistical tools tailored to its use case. Below is a comprehensive guide to the tests and analyses available in each workspace.

### Box Plot
**Parametric Tests:**
- Paired t-test (for matched/repeated measurements)
- Unpaired t-test (standard Student's t-test)
- Welch t-test (for unequal variances)
- One-way ANOVA (for three or more groups)
- Two-way ANOVA (group × condition designs)
- Three-way ANOVA (group × condition × row/subject designs)

**Non-parametric Tests:**
- Mann-Whitney U test (rank-based two-group comparison)
- Wilcoxon signed-rank test (paired non-parametric alternative)
- Kruskal-Wallis test (non-parametric ANOVA alternative)

**Post-hoc Tests:**
- Pairwise tests with multiple comparison corrections
- Games-Howell test (for Welch ANOVA scenarios with ≥3 groups)
- Dunn's test (non-parametric post-hoc following Kruskal-Wallis)

**Multiple Comparison Corrections:**
- Bonferroni correction
- Holm correction
- Šidák correction
- Hochberg correction
- Benjamini-Hochberg (FDR control)
- Benjamini-Yekutieli (FDR control for dependent tests)

**Effect Size Measures:**
- Cohen's d (standardized mean difference)
- Glass's delta (uses control group SD)
- Hedges' g (bias-corrected Cohen's d)
- Rank-biserial correlation r (effect size for rank tests)

**Additional Features:**
- Row-wise t-tests for within-condition comparisons
- Stats advisor for guided test selection based on data characteristics

### Scatter / Volcano / MA Plot
**Correlation Analysis:**
- Pearson correlation (linear relationships)
- Spearman correlation (monotonic relationships, rank-based)

**Regression Models:**
- Linear regression
- Quadratic regression
- Cubic regression
- Exponential regression
- Power-law regression
- Logistic regression (S-shaped growth curves)
- Spline regression (flexible curve fitting)

**Regression Diagnostics:**
- R² (coefficient of determination)
- Adjusted R² (penalized for model complexity)
- RMSE (root mean squared error)
- MAE (mean absolute error)
- Log loss (for logistic regression)

**Residual Analysis:**
- Residual mean and standard deviation
- Residual skewness
- Residual kurtosis
- Jarque-Bera normality test for residuals

**Intervals:**
- Confidence intervals for regression line
- Prediction intervals for individual observations

### Line Graph
**Correlation & Regression:**
- Pearson and Spearman correlation
- All regression models available in Scatter plots (linear, quadratic, cubic, exponential, power-law, logistic, spline)
- Regression diagnostics: R², adjusted R², RMSE, MAE
- Residual analysis with interval bands

**Time Series Forecasting:**
- ARIMA (AutoRegressive Integrated Moving Average) models for non-seasonal forecasting
- Holt-Winters exponential smoothing for seasonal time series
- Forecast confidence intervals

### ROC / PR Curves
**Curve Metrics:**
- ROC (Receiver Operating Characteristic) curves
- PR (Precision-Recall) curves
- AUC (Area Under Curve) calculation for both ROC and PR
- Sensitivity and specificity at various thresholds

**Pairwise Comparisons:**
- DeLong test (fast analytic variance estimate for ROC curves)
- Bootstrap resampling (works for both ROC and PR curves)
- Permutation test (distribution-free label shuffling approach)

### Survival Analysis
**Survival Estimation:**
- Kaplan-Meier survival curves
- At-risk counts and event summaries at each time point

**Hypothesis Tests:**
- Log-rank test (overall comparison of survival curves across groups)
- Pairwise hazard ratios between groups

**Regression Modeling:**
- Cox proportional hazards regression
- Baseline covariates (fixed predictors)
- Time-dependent covariates (predictors that vary over follow-up)
- Adjusted hazard ratios with confidence intervals

**Additional Features:**
- Stats advisor for guided analysis selection
- Support for censored observations

### Venn Diagrams
**Overlap Testing:**
- Hypergeometric test for overlap enrichment significance (one-sided test)
- p-values for all pairwise and multi-way overlaps
- Significance threshold indicators (p < 0.05)

**Enrichment Analysis:**
- GO (Gene Ontology) enrichment via g:Profiler
  - Biological Process, Molecular Function, Cellular Component categories
  - Multiple organism support
  - Adjusted p-values (Benjamini-Hochberg FDR)
- STRING protein-protein interaction network retrieval and visualization

### Histogram
**Descriptive Statistics:**
- Mean
- Median
- Standard deviation
- First quartile (Q1 / 25th percentile)
- Third quartile (Q3 / 75th percentile)

**Distribution Visualization:**
- Automatic or manual binning
- PDF (Probability Density Function) overlay
- CDF (Cumulative Distribution Function) overlay
- Log-scale axis support for skewed distributions

### Proportion (Pie/Donut/Stacked)
**Goodness-of-Fit Testing:**
- Chi-square (χ²) goodness-of-fit test
- Comparison of observed vs. expected frequencies
- Degrees of freedom calculation
- p-value interpretation

### Heatmap
**Correlation Analysis:**
- Pearson correlation matrices
- Spearman rank correlation matrices

**Clustering:**
- Hierarchical clustering of rows and/or columns
- Dendrogram visualization overlays
- Multiple distance metrics (Euclidean, correlation-based)
- Linkage methods for cluster merging

### PCA / MDS / t-SNE / UMAP
**Dimensionality Reduction Methods:**
- PCA (Principal Component Analysis) with variance explained per component
- MDS (Multidimensional Scaling) for distance-preserving embeddings
- t-SNE (t-Distributed Stochastic Neighbor Embedding) for local structure preservation
- UMAP (Uniform Manifold Approximation and Projection) for topology preservation

**PCA-Specific Outputs:**
- Variance explained by each principal component (percentage and cumulative)
- PC loadings table (top contributing features per component)
- Scree plots implicitly available via variance summaries

**Visualization Options:**
- 2D and 3D projections (PCA and MDS)
- Interactive 3D rotation controls
- Configurable perplexity and learning rate (t-SNE)
- Configurable n_neighbors and min_dist (UMAP)

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
5. **Save or export.** Download SVG/PNG snapshots and save `.graph` archives (current tab or all tabs) to capture your work.

## Example Workflow
1. Open `index.html` in a modern browser.
2. Navigate to **Scatter Plot** and click *Load Example* to populate the table.
3. Use the regression controls to test linear vs. polynomial fits while adjusting axis ranges via the in-canvas toolbar.
4. Click *Duplicate Tab* from the toolbar menu and choose whether to reuse the current data or start empty.
5. In the new tab, switch to a **Volcano** plot variant using the graph type dropdown to visualize differential expression.
6. Use *Match Styles* from the toolbar to copy fonts, colors, and axis settings from your scatter plot.
7. Create additional tabs for **Line Graph** or **Box Plot** visualizations of the same dataset.
8. Save a `.graph` archive and choose whether to include the current tab only or all tabs, or export individual charts as SVG/PNG images.

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
- **Scripts & tests.** Jest-based smoke and UI tests live in `__tests__/`. Helper scripts (e.g., the volcano benchmark and Python stats oracle) sit under `scripts/` for targeted performance and validation checks.

## Getting Started (Developers)
1. **Install dependencies:** `npm install`
2. **Run tests:** `npm test`
3. **Open the app:** Serve the repository or open `index.html` directly in the browser.
4. **Debug logging:** Toggle verbose output with `Shared.enableDebugLogging()` / `Shared.disableDebugLogging()` in the browser console.

### File Formats
- **`.graph` files:** ZIP archive format that stores each tab in its own folder with `raw/data.csv`, `graph-config.json`, and full payload/layout JSON for fast, lossless reloads. A `.graph` file can contain one tab or multiple tabs.
- **Legacy `.session` files:** Older JSON session files are still loadable for backward compatibility.
- **Data imports:** CSV, TSV, TXT, XLS, XLSX, ODS formats supported via the *Import* toolbar button or paste operations.

## Testing & Quality
- `npm test` spins up JSDOM, loads `index.html`, and verifies each component initializes correctly.
- `npm run test:stats` runs differential statistical validation suites (`JS vs Python SciPy/NumPy oracle`) for shared engines, component hooks, and generated coverage matrices for `box.js`, `line.js`, and `scatter.js`, including box test matrices, line forecast validation (ARIMA / Holt-Winters), scatter LOWESS, and the main scatter nonlinear families.
- Performance guards exercise heavy workloads such as the heatmap clusterer and report when thresholds are exceeded.
- `npm run bench -- [options]` executes `scripts/run-benchmarks.js`, a lightweight CLI that calls each component’s synthetic workload hooks and reports mean/median durations. Use `--json bench.json` to capture a baseline and `--compare bench.json` on future runs to see deltas. Inputs can be overridden inline (`box.rows=50000`) or via `--config overrides.json`.
- No linting is configured; Jest is the authoritative automated check.
- The differential suites expect Python with `scipy` and `numpy` installed (`python`, `py -3`, or `PYTHON_BIN`).

## Troubleshooting
- **Large datasets:** Widen the AG Grid pane or SVG canvas using the resizer handles. For extremely wide tables, duplicate tabs to keep context while exploring subsets.
- **Slow renders:** Reduce point counts, enable transparency, or switch to log axes to maintain clarity on dense scatter plots. For volcano plots with thousands of points, consider filtering to show only significant genes.
- **Network calls:** GO enrichment and STRING network fetches require internet access; all other features operate offline.
- **Avoid redraw loops:** When modifying layouts from draw routines, call `Shared.syncPanelWidths({ skipSchedule: true })` to prevent recursive scheduling.
- **Memory profiling:** Run `node --expose-gc scripts/volcano-benchmark.js` to compare optimized volcano handling against legacy behavior.
- **Archive files:** If a `.graph` file fails to load, verify it is a valid ZIP archive containing `manifest.json`. Legacy `.session` JSON files should include a `tabs` array.
- **Undo/Redo:** Each workspace maintains its own undo stack. Use the toolbar undo/redo buttons or keyboard shortcuts (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z).
- **Tab management:** Tabs are auto-saved to browser storage. Closing the browser preserves your workspace, but explicitly saving a `.graph` archive provides a permanent backup.
- **Style matching:** The *Match Styles* feature copies fonts, colors, and axis settings but not data or analysis configurations.

## Contributing
1. Follow the existing `window.Shared` / `window.Components` namespace patterns when adding functionality.
2. Gate verbose logging behind the shared debug toggle and reuse cached data helpers to keep the memory footprint low.
3. Update automated tests or add new coverage for workflow changes.
4. Submit pull requests with clear descriptions of user-facing changes and run `npm test` before committing.
