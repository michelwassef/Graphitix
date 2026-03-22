# Venn Data Visualization Studio

Venn is a browser-based analytics workspace that turns tabular data into publication-ready graphics. The app combines spreadsheet-style data entry, rich styling controls, and statistical tooling across multiple visualization workspaces—no server or build tooling required.

## Architecture Docs (Start Here)
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) - Fast-orientation map of runtime flow, namespaces, component contracts, and persistence.
- [`docs/development/main-bootstrap.md`](./docs/development/main-bootstrap.md) - Required `Main.*` bootstrap/load order and dependency guards.
- [`docs/development/module-call-map.md`](./docs/development/module-call-map.md) - Generated namespace dependency/call map.
- [`docs/development/component-contracts.md`](./docs/development/component-contracts.md) - Generated per-component contract matrix (registry hooks, host element IDs, payload baseline keys).
- [`docs/development/state-persistence-schema.md`](./docs/development/state-persistence-schema.md) - Canonical workspace/tab payload and `.graph` persistence schema.

## Why Venn?
- **One workspace, many charts.** Switch between Venn diagrams, box plots, scatter plots, 3D surfaces, dimensionality reduction, line charts, ROC/PR curves, histogram/density plots, and proportion plots without leaving the page.
- **Spreadsheet comfort.** Each module embeds an AG Grid table with undo/redo, paste-special helpers (including transpose), CSV/TSV/Excel/ODS import, and column reordering.
- **Inline styling & stats.** Workspace toolbars with undo/redo, axis controls, typography tools, and per-module statistics live beside every chart so you can tune visuals and analyses in real time.
- **Offline friendly.** Everything runs client-side in HTML, CSS, and vanilla JavaScript; only GO and STRING enrichment lookups require network access.
- **Reusable workspaces.** Save `.graph` archives for either the current tab or all tabs, then reopen them later to pick up where you left off.

## Visualization Modules
| Module | Primary use cases | Notable tools |
| --- | --- | --- |
| **Venn** | Compare list overlaps, perform GO enrichment, fetch STRING networks | Region inspector, hypergeometric significance, GO/STRING exports |
| **Box Plot** | Group comparisons, violin overlays, bar charts | One-sample / paired / unpaired workflows, ratio t tests, lognormal t/ANOVA workflows, Welch t/ANOVA, one-way / repeated-measures / grouped two-way / grouped three-way analyses, grouped multiple-comparison scopes, Mann-Whitney / Wilcoxon / Kolmogorov-Smirnov / Kruskal-Wallis / Friedman, Tukey / Games-Howell / Tamhane T2 / Dunn / Dunnett / Dunnett T3 / Nemenyi follow-ups, Bonferroni / Holm / Holm-Šidák / Šidák / Hochberg / BH / BY corrections, normality plus variance/log-normal diagnostics, lognormal-aware stats advisor guidance, Grubbs / ROUT-style outlier screening, effect sizes |
| **Scatter / Volcano / MA** | Relationship exploration, differential expression, regression | Pearson/Spearman correlation, regression models (linear, Deming, orthogonal, LOWESS, quadratic, cubic, exponential, power-law, logistic, spline), R²/adjusted R², RMSE, MAE, AIC/AICc/BIC, residual and influence diagnostics, confidence/prediction intervals, linear-regression comparison, Volcano & MA plot variants, 2D/3D views, density coloring, label-based colors |
| **3D Surface** | 3D data visualization, topography, response surfaces | Interactive rotation, grid interpolation, color gradients, mesh/surface toggling |
| **Heatmap** | Correlation matrices, hierarchical clustering | Pearson/Spearman correlation, hierarchical clustering, dendrogram overlays, distance metrics, color scale legend |
| **PCA / MDS / t-SNE / UMAP** | Dimensionality reduction for multivariate data | Axis selectors, 2D/3D views, method-specific controls, component-retention controls in the config panel (parallel/Kaiser/threshold), lazy-loaded solvers, variance explained summaries, scree overlays, PC loadings tables and loadings plots in advanced stats, biplots |
| **Line Graph** | Time series, longitudinal trends, forecasting | Pearson/Spearman correlation, shared regression-engine models (linear, polynomial, exponential, spline, and additional implemented nonlinear families), ARIMA & Holt–Winters forecasts, R²/adjusted R², RMSE, MAE, AIC/BIC, residual diagnostics, coefficient tables, confidence/prediction intervals |
| **ROC / PR** | Model evaluation | ROC/PR curve toggle, ROC AUC and PR area / average-precision summaries, AUC SE/CI, sensitivity/specificity/PPV/NPV/LR summaries, cutoff-by-cutoff ROC tables with Wilson CIs in advanced stats, pairwise comparisons (DeLong for ROC, bootstrap, permutation), guided test selection |
| **Survival** | Kaplan–Meier curves, Cox modeling | Kaplan-Meier estimator, log-rank / Gehan-Breslow-Wilcoxon / trend tests, primary hazard-ratio and Cox-coefficient tables with advanced pairwise/diagnostic sections, median survival CIs and ratios, time-dependent covariates, covariate selection, stats advisor |
| **Histogram / Density Plot** | Distribution summaries | Descriptive statistics (N, mean, median, SD, min, Q1, Q3, max), histogram or KDE density mode, log scaling, auto binning, PDF/CDF overlays, best-fit distribution summary |
| **Proportion (Pie/Donut/Stacked)** | Category proportions, Chi² tests | Chi² goodness-of-fit test, observed vs. expected frequencies, slice styling, stacked bar axis tools |

All modules share a two-panel layout: AG Grid workspace on the left, responsive SVG canvas with contextual controls on the right. Drag the center divider or canvas resize handle to rebalance your layout per tab-the app remembers your choices for each workspace.

## Statistical Tests & Analyses

This section is intended to track what is implemented in code today, not planned parity with Prism.

Each visualization module includes statistical tools tailored to its use case. Below is a comprehensive guide to the tests and analyses available in each workspace.

### Box Plot
**Parametric Tests:**
- One-sample t-test
- Paired t-test (for matched/repeated measurements)
- Ratio t test (paired positive-valued measurements on the ratio scale)
- Unpaired t-test (standard Student's t-test)
- Welch t-test (for unequal variances)
- Lognormal t test (pooled log-scale t test; reports geometric-mean ratios)
- Lognormal Welch's t test (Welch log-scale t test; reports geometric-mean ratios)
- One-way ANOVA (for three or more groups)
- Welch ANOVA
- Lognormal one-way ANOVA
- Lognormal Welch ANOVA
- Repeated-measures ANOVA
- Two-way ANOVA (group × condition designs)
- Two-way mixed model
- Three-way ANOVA (group × condition × row/subject designs)
- Three-way mixed model

**Non-parametric Tests:**
- One-sample Wilcoxon signed-rank test
- Mann-Whitney U test (rank-based two-group comparison)
- Wilcoxon signed-rank test (paired non-parametric alternative)
- Kolmogorov-Smirnov two-sample test
- Kruskal-Wallis test (non-parametric ANOVA alternative)
- Friedman test

**Post-hoc Tests:**
- Tukey HSD
- Games-Howell test (for Welch ANOVA scenarios with ≥3 groups)
- Tamhane T2 (Welch/Sidak-style unequal-variance post-hoc)
- Dunn's test (non-parametric post-hoc following Kruskal-Wallis)
- Dunnett and Dunnett T3 (reference-group comparisons)
- Nemenyi test (post-Friedman paired rank comparisons)
- Pairwise tests with configurable multiple-comparison correction families

**Multiple Comparison Corrections:**
- Bonferroni correction
- Holm correction
- Holm-Šidák correction
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
- Grouped multiple-comparison scopes:
  - groups within each condition
  - conditions within each group
  - group marginal means
  - condition marginal means
  - all cell means
- Shapiro-Wilk and D'Agostino-Pearson normality diagnostics
- Brown-Forsythe and Bartlett variance diagnostics
- Normal-vs-log-normal distribution comparison
- Linear trend testing across ordered multi-group designs
- Grubbs and ROUT-style outlier screening
- Stats advisor for guided test selection based on data characteristics

### Scatter / Volcano / MA Plot
**Correlation Analysis:**
- Pearson correlation (linear relationships)
- Spearman correlation (monotonic relationships, rank-based)

**Regression Models:**
- Linear regression
- Deming regression
- Orthogonal regression
- LOWESS smoothing
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
- AIC, AICc, and BIC
- Log loss (for logistic regression)

**Residual Analysis:**
- Residual mean and standard deviation
- Residual skewness
- Residual kurtosis
- Jarque-Bera normality test for residuals
- Runs test
- Breusch-Pagan heteroscedasticity test
- RESET specification test
- Lack-of-fit test
- Influence diagnostics (studentized residuals, leverage, Cook's distance, DFFITS)

**Intervals:**
- Confidence intervals for regression line
- Prediction intervals for individual observations

**Additional Features:**
- Linear-regression comparison workflow for grouped scatter series
- Trapezoidal AUC / mean-response summaries on XY data
- Inverse prediction / interpolation from fitted curves

### Line Graph
**Correlation & Regression:**
- Pearson and Spearman correlation
- Shared regression-engine models exposed in the regression selector, including linear, quadratic, cubic, exponential, power-law, logistic, spline, and other implemented nonlinear families
- Regression diagnostics: R², adjusted R², RMSE, MAE, AIC, BIC, model F
- Residual analysis with Jarque-Bera, runs, and lack-of-fit summaries
- Coefficient tables with estimates, standard errors, t statistics, p values, and confidence intervals
- Confidence and prediction interval summaries

**Time Series Forecasting:**
- ARIMA (AutoRegressive Integrated Moving Average) models for non-seasonal forecasting
- Holt-Winters exponential smoothing for seasonal time series
- Forecast accuracy metrics (MAE, RMSE, MAPE, sMAPE, AIC, BIC)

### ROC / PR Curves
**Curve Metrics:**
- ROC (Receiver Operating Characteristic) curves
- PR (Precision-Recall) curves
- ROC AUC calculation
- ROC AUC standard error and 95% confidence interval
- PR area and Average Precision calculation
- Best-threshold summary with sensitivity, specificity, PPV, NPV, LR+/LR-, accuracy, and F1
- Cutoff-by-cutoff ROC table with Wilson confidence intervals for sensitivity, specificity, PPV, and NPV (reported in the advanced statistics section)

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
- Gehan-Breslow-Wilcoxon survival-curve comparison
- Log-rank trend test for ordered groups
- Pairwise hazard ratios between groups (primary stats card)
- Pairwise log-rank comparisons with selectable multiplicity correction (advanced statistics section)

**Regression Modeling:**
- Cox proportional hazards regression
- Baseline covariates (fixed predictors)
- Time-dependent covariates (predictors that vary over follow-up)
- Adjusted hazard ratios with confidence intervals
- Cox coefficient tables with likelihood-ratio / AIC / BIC diagnostics (coefficients in the main card, diagnostics in advanced statistics)
- Harrell's C concordance with confidence interval
- Residual summaries for Martingale, Deviance, Cox-Snell, and scaled Schoenfeld checks

**Additional Features:**
- Stats advisor for guided analysis selection
- Support for censored observations
- Median survival confidence intervals from Kaplan-Meier bands
- Median survival ratio summaries across groups

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

### Histogram / Density Plot
**Descriptive Statistics:**
- N
- Mean
- Median
- Standard deviation
- Minimum
- First quartile (Q1 / 25th percentile)
- Third quartile (Q3 / 75th percentile)
- Maximum

**Distribution Visualization:**
- Histogram mode with automatic or manual binning
- Density plot mode with kernel density estimation
- PDF (Probability Density Function) overlay
- CDF (Cumulative Distribution Function) overlay in histogram mode
- Log-scale axis support for skewed distributions
- Best-fit distribution summary when fitting succeeds

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

**Additional Features:**
- Matrix value summaries (rows, columns, min, max, mean, finite-cell counts)
- Correlation-matrix summary panel with strongest positive / negative associations

### PCA / MDS / t-SNE / UMAP
**Dimensionality Reduction Methods:**
- PCA (Principal Component Analysis) with variance explained per component
- MDS (Multidimensional Scaling) for distance-preserving embeddings
- t-SNE (t-Distributed Stochastic Neighbor Embedding) for local structure preservation
- UMAP (Uniform Manifold Approximation and Projection) for topology preservation

**PCA-Specific Outputs:**
- Variance explained by each principal component (percentage and cumulative)
- Component-selection rules: parallel analysis, Kaiser > 1, custom eigenvalue threshold, or show-all, exposed in the PCA config panel
- PC loadings table (top contributing features per component)
- Scree plot export and eigenvalue tables
- Parallel-analysis overlay on scree plots when available
- Loadings plot (advanced statistics) and biplot summary (main statistics) for PCA

**Visualization Options:**
- 2D and 3D projections (PCA and MDS)
- Interactive 3D rotation controls
- Configurable perplexity and learning rate (t-SNE)
- Configurable n_neighbors and min_dist (UMAP)

### Graph Variants
Some modules support multiple visualization variants accessible via dropdown controls:
- **Scatter:** Standard scatter plot, Volcano plot (for differential expression), MA plot (mean-difference)
- **Box:** Box plot, violin plot, bar chart, strip chart (individual values)
- **Histogram:** Histogram or density plot mode, plus welcome-screen quick launcher entries for both
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
- **Create tabs:** Click the "+" button or use the quick launcher on the welcome screen to add new visualization workspaces or launch specific variants such as Density plot directly.
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
- `npm run test:e2e:contracts` runs the cross-browser Playwright contract suite (smoke, clipboard paste, and feature matrix). Use `npm run test:e2e:contracts:firefox` for Firefox-only local verification and `npm run test:e2e:contracts:chromium` for Chromium.
- `npm run test:e2e:matrix` runs the full workspace stress matrix; use `npm run test:e2e:matrix:firefox` for Firefox-only deep runs.
- CI now treats Firefox as a first-class target:
  - `.github/workflows/e2e-cross-browser-contracts.yml` runs contracts on every PR/push to `main` for both Chromium and Firefox.
  - `.github/workflows/e2e-nightly-feature-matrix.yml` runs the full feature matrix nightly for both Chromium and Firefox.
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
