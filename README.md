# Venn Graphing & Statistics Workspace

Venn is now a full browser-based data visualization and statistical analysis studio. What began as a Venn diagram generator has grown into a multi-panel dashboard that lets you explore datasets, run hypothesis tests, perform dimensionality reduction, and export publication-quality graphics without leaving your web browser. Everything runs client-side in HTML, CSS, and JavaScript, so you can work offline, share the app as a static site, or drop it into an internal portal without server infrastructure.

## Table of Contents
- [Overview](#overview)
- [Feature Highlights](#feature-highlights)
- [Quick Start](#quick-start)
- [Developer Setup](#developer-setup)
- [Data Input & Management](#data-input--management)
- [Visualization Modules](#visualization-modules)
  - [Venn Diagram Workspace](#venn-diagram-workspace)
  - [Box Plot & Statistical Testing](#box-plot--statistical-testing)
  - [Scatter Plot Explorer](#scatter-plot-explorer)
  - [Dimensionality Reduction (PCA & MDS)](#dimensionality-reduction-pca--mds)
  - [Line Graph Studio](#line-graph-studio)
- [Classification Curves (ROC & PR)](#classification-curves-roc--pr)
- [Survival Analysis (Kaplan–Meier & Cox)](#survival-analysis-kaplanmeier--cox)
  - [Histogram Builder](#histogram-builder)
  - [Proportion Graph & Chi² Analysis](#proportion-graph--chi²-analysis)
- [Statistical Analysis Toolkit](#statistical-analysis-toolkit)
- [Gene Enrichment & Protein Network Integrations](#gene-enrichment--protein-network-integrations)
- [Exporting & Sharing Results](#exporting--sharing-results)
- [Technology Stack](#technology-stack)
- [Development & Testing](#development--testing)
- [Troubleshooting & Tips](#troubleshooting--tips)

## Overview
The application presents a consistent two-panel layout across graph types: a spreadsheet-like editor on the left and a responsive visualization canvas with configuration controls on the right. Resizable splitters let you balance table space against the live preview, and every module exposes context-aware styling and statistical options. Common workflows include:

* Exploring biological or omics datasets by combining Venn-based overlap analysis with downstream GO/STRING enrichment.
* Comparing experimental groups with box plots, violin-style overlays, or bar charts plus pairwise statistical tests.
* Visualizing multivariate relationships through scatter plots, PCA or MDS ordinations, and customizable line graphs.
* Summarizing distributions with histograms or proportion plots paired with Chi² goodness-of-fit tests.

Because everything runs client-side, sensitive data never leaves the browser session. You can drag-and-drop `.graph` workbooks or standard tabular files, tweak styling, compute summary statistics, and export PNG/SVG figures ready for reports or manuscripts.

## Feature Highlights
- **Multi-graph dashboard:** Switch instantly between Venn, box, scatter, PCA/MDS, line, ROC/PR, histogram, and proportion graph modules from the top navigation bar.【F:index.html†L12-L24】【F:index.html†L640-L795】
- **Handsontable-powered data entry:** Each module embeds a fully featured spreadsheet editor with undo/redo, column reordering, context menus, and CSV/TSV/Excel/ODS import utilities.【F:index.html†L68-L129】【F:index.html†L704-L731】
- **Rich styling controls:** Adjust colors, fonts, borders, opacity, grid lines, and axis limits directly beside the live plot for every visualization type.【F:index.html†L92-L153】【F:index.html†L704-L781】
- **Integrated statistics:** Access module-specific statistical summaries, including overlap significance, parametric/non-parametric correlations, hypothesis tests, Chi², and ROC/PR metrics, with results rendered beneath the plots.【F:index.html†L160-L248】【F:index.html†L320-L408】
- **Reusable `.graph` sessions:** Open, save, and “save as” persistent graph files that capture table data plus visual settings, making it easy to revisit or share analyses.【F:index.html†L76-L108】【F:index.html†L656-L671】
- **Zero-install deployment:** Launch by opening `index.html` in any modern browser; no build step or server-side components required.【F:index.html†L1-L20】

## Quick Start
1. **Download or clone** the repository and ensure all files remain in the same directory.
2. **Open `index.html`** in Chrome, Firefox, or another modern browser. (For large datasets, a local static server can improve file loading performance, but it is optional.)
3. **Choose a module** from the navigation bar (e.g., Venn, Box Plot, Scatter Plot).
4. **Enter or import data** into the left-hand table. Use the *Load Example* buttons to see the expected column layout for each visualization.【F:index.html†L704-L731】
5. **Configure the visualization** using the right-hand controls (colors, grid, axis limits, statistical options) and observe live updates on the canvas.【F:index.html†L92-L153】【F:index.html†L320-L408】
6. **Run analyses** by enabling statistical features relevant to the selected module—overlap significance, regression, AUC calculations, Chi², etc.【F:index.html†L160-L248】【F:index.html†L704-L781】
7. **Export results** with the built-in PNG/SVG download buttons or save the session to a `.graph` file for future editing.【F:index.html†L108-L153】【F:index.html†L656-L671】

## Developer Setup
Before editing the bootstrap scripts, review how the `Main` namespace is assembled. The [Main Namespace Bootstrap Order](docs/development/main-bootstrap.md) guide explains the required initialization order for `Main.session`, `Main.previews`, `Main.domControls`, `Main.sessionActions`, and `Main.tabDrag`, plus where each module is defined.

## Data Input & Management
- **Spreadsheet editing:** Each tab provides a Handsontable grid pre-populated with empty rows and columns, ready for paste operations from Excel, Google Sheets, R, or Python notebooks.【F:index.html†L704-L731】
- **File imports:** Use the *Import File* buttons to ingest CSV, TSV, TXT, XLS, XLSX, ODS, or ODG files. Column headers should occupy the first row for best results.【F:index.html†L704-L731】【F:index.html†L816-L891】
- **Undo/redo and column reordering:** Built-in table controls allow exploratory manipulation without losing the original data order. Changes trigger redraws automatically.
- **Delimiter detection for lists:** The Venn workspace can parse newline, tab, comma, or space-separated entries, with an automatic mode that guesses the correct delimiter.【F:index.html†L80-L129】
- **Numeric input mode:** Switch the Venn module to manual count entry when list data is unavailable, populating each region by hand.【F:index.html†L108-L153】
- **Session persistence:** `.graph` files store both the table contents and all stylistic choices. Use *Open*, *Save*, and *Save As* controls to manage workbooks per module.【F:index.html†L68-L108】【F:index.html†L320-L408】

## Visualization Modules
### Venn Diagram Workspace
- Paste up to three gene or item lists, choose case sensitivity, and control delimiter parsing before drawing the proportional Venn diagram.【F:index.html†L68-L129】
- Optional numeric mode accepts explicit region counts when list data is unavailable.【F:index.html†L108-L153】
- Customize fill colors, transparency, borders, and label fonts directly adjacent to the SVG canvas, then export as PNG or SVG.【F:index.html†L108-L153】
- Inspect individual regions via the region selector, copy their contents, and view live counts for each overlap category.【F:index.html†L129-L208】
- Calculate hypergeometric overlap significance using the **Total Genes** input, with results displayed inline.【F:index.html†L160-L208】
- Launch downstream GO or STRING analyses with configurable background, categories, network type, and interaction sources, displaying charts and network exports in place.【F:index.html†L184-L232】

### Box Plot & Statistical Testing
- Maintain tabular data in a resizable spreadsheet with import/export and example loaders.【F:index.html†L320-L360】
- Switch between box, notched box, or bar charts; toggle whisker caps; and control overlay or side-by-side point displays.【F:index.html†L360-L408】
- Apply unified or per-series color palettes, log-scale the Y axis, and clamp axis ranges for publication-ready aesthetics.【F:index.html†L340-L392】
- Use the statistics panel to configure comparison modes (all pairwise, reference vs. others, or custom) and run parametric (t-test) or non-parametric (Mann–Whitney U) analyses in paired or unpaired settings. Results render in both summary text and tabular form beneath the plot.【F:index.html†L392-L408】
- Inspect accompanying effect sizes for every comparison, with configurable parametric (e.g., Cohen's d or Hedges' g) and non-parametric (rank-biserial r or common language probability) metrics persisted alongside significance results.【F:js/components/box.js†L2506-L2710】

### Scatter Plot Explorer
- Import paired or multi-series data, then adjust dot size, fill, transparency, borders, and per-label color palettes.【F:index.html†L408-L456】
- Toggle grid lines, log-transform axes, set explicit min/max bounds, and position the origin at the lower-left or a custom coordinate.【F:index.html†L440-L488】
- Enable Pearson or Spearman correlation statistics and display optional trend lines with fitted equations directly on the chart.【F:index.html†L488-L520】
- Inspect 95% confidence and prediction interval bands with residual diagnostics (skewness, kurtosis, Jarque–Bera) using the new shading and summary toggles, all captured in `.graph` sessions.【F:index.html†L596-L636】【F:js/components/scatter.js†L1247-L1766】
- **High-volume datasets:** Volcano and MA modes trim label bookkeeping and cap automatic annotations so tens of thousands of differential expression points stay responsive without ballooning memory usage.【F:js/components/scatter.js†L1304-L1398】【F:js/components/scatter.js†L1588-L1635】

### Dimensionality Reduction (PCA & MDS)
- Compute principal components or multidimensional scaling from wide-form tables using in-browser SVD routines.【F:index.html†L520-L640】
- Scale variables before analysis, choose point styling, and color observations by label categories using customizable palettes.【F:index.html†L552-L616】
- Inspect resulting eigenvalue summaries with toggleable scree plots and downloadable eigen tables directly from the statistics panel.【F:index.html†L640-L700】【F:js/components/pca.js†L180-L460】

### Line Graph Studio
- Plot longitudinal or series-based data with per-series color pickers, dot styling, and adjustable line borders.【F:index.html†L640-L712】
- Configure linear or logarithmic axes, clamp ranges, and reposition the origin to highlight specific domains.【F:index.html†L704-L752】
- Summarize trends by computing Pearson or Spearman correlations in the dedicated statistics block.【F:index.html†L752-L777】
- Visualize per-series regression confidence/prediction bands and review coefficient standard errors plus residual diagnostics via the statistics table toggles, with settings persisted for saved workbooks.【F:index.html†L893-L916】【F:js/components/line.js†L478-L662】

### Classification Curves (ROC & PR)
- Build ROC or precision-recall curves from model scores and labels stored in the integrated table editor.【F:index.html†L800-L848】
- Customize series colors, grid display, and line thickness; switch between ROC and PR modes dynamically.【F:index.html†L848-L904】
- Review trapezoidal AUC or average precision metrics alongside configurable statistic controls below the chart.【F:index.html†L904-L928】

### Survival Analysis (Kaplan–Meier & Cox)
- Populate a wide-form table with group, time, event, optional entry time, and any number of covariate columns directly in the survival workspace’s spreadsheet.【F:index.html†L1124-L1189】【F:js/components/survival.js†L401-L474】
- Toggle curve display options, select which covariate columns feed the Cox proportional hazards model, and flag time-dependent predictors through the dedicated control panel beside the plot.【F:index.html†L1155-L1189】【F:js/components/survival.js†L107-L175】
- Fit multivariate Cox models with support for time-dependent risk sets, inspect per-predictor coefficients/intervals, and review convergence diagnostics and pairwise hazard ratios in the statistics panel.【F:js/components/survival.js†L740-L1033】【F:js/components/survival.js†L1480-L1663】

### Histogram Builder
- Generate histograms from univariate data with configurable bin counts, fill colors, border styling, and optional log-scaled Y axis.【F:index.html†L928-L1000】
- Apply grid overlays, set Y limits, and inspect summary statistics output beneath the visualization.【F:index.html†L1000-L1032】

### Proportion Graph & Chi² Analysis
- Visualize categorical proportions as pie, donut, or stacked bar charts by providing category, observed, and expected columns.【F:index.html†L1032-L1088】
- Customize slice colors, display percentages, rotate the start angle, and export the resulting chart as PNG/SVG.【F:index.html†L1068-L1096】
- Select observed/expected columns for the built-in Chi² goodness-of-fit test, with results shown in the statistics panel.【F:index.html†L1096-L1108】

## Statistical Analysis Toolkit
Across modules, statistical helpers are surfaced exactly where you need them:
- **Overlap significance:** Hypergeometric p-values for Venn diagram intersections based on a user-provided universe size.【F:index.html†L160-L208】
- **Hypothesis testing:** Parametric and non-parametric comparisons for box plots, including paired analysis and customizable pairings, plus Chi² tests for categorical proportions.【F:index.html†L392-L408】【F:index.html†L1096-L1108】
- **Correlation and regression:** Pearson or Spearman correlation coefficients for scatter and line graphs, optional regression overlays, coefficient standard errors, interval bounds, and residual diagnostics to validate model assumptions.【F:index.html†L488-L520】【F:index.html†L752-L777】【F:js/components/line.js†L478-L662】
- **Classification metrics:** ROC/PR workspaces compute trapezoidal area under the curve, average precision, and related diagnostics via inline summaries.【F:index.html†L800-L928】
- **Dimension summaries:** PCA/MDS output includes eigenvalue or stress statistics to contextualize ordination quality.【F:index.html†L520-L640】

## Gene Enrichment & Protein Network Integrations
The Venn workspace integrates post-overlap biological analysis without leaving the app:
- **Gene Ontology enrichment:** Trigger GO term analysis with selectable category filters (Biological Process, Molecular Function, Cellular Component) and optional background adjustment. Results can be plotted and exported as charts.【F:index.html†L184-L216】
- **STRING network exploration:** Request STRING protein-protein interaction networks with configurable network types, edge semantics, and active data sources, then export the rendered network visualization.【F:index.html†L208-L224】

Internet access is required for these external services; all other features operate fully offline.

## Exporting & Sharing Results
- **Image exports:** Every module exposes PNG and SVG download buttons adjacent to the visualization canvas for quick sharing or publication use.【F:index.html†L108-L153】【F:index.html†L704-L795】
- **Graph sessions:** `.graph` files encapsulate tabular data, configuration settings, and styling. Opening a saved file restores the exact state of the module, enabling reproducible analyses.【F:index.html†L68-L108】【F:index.html†L320-L408】
- **Copy region data:** The Venn region inspector includes a quick *Copy List* button to move selected intersection entries into other tools or documents.【F:index.html†L129-L176】

## Technology Stack
- **Client technologies:** HTML5, vanilla JavaScript, and CSS drive the UI with zero build tooling required at runtime.【F:index.html†L1-L24】
- **Visualization libraries:** Chart.js powers many charts, D3-inspired helpers render SVG-based diagrams, and SVD-JS provides numerical routines for PCA/MDS computations.【F:index.html†L1120-L1156】
- **Table management:** Handsontable delivers spreadsheet-like editing, while custom shared modules handle file I/O, import parsing, layout synchronization, and reusable color pickers.【F:index.html†L1120-L1156】

## Development & Testing
1. Install dependencies once if you plan to run automated tests: `npm install`.
2. Execute the Jest test suite with `npm test` to validate UI utilities and smoke-test module initialization.【F:package.json†L6-L13】
3. Static analysis and linting are not currently configured; Jest is the authoritative automated check.
4. No bundler is required—edit HTML/CSS/JS directly and reload the browser to see changes.

## Troubleshooting & Tips
- **Large tables:** For wide datasets, drag the panel resizers to allocate more screen real estate to the spreadsheet or chart as needed.【F:index.html†L320-L360】【F:index.html†L704-L731】
- **Performance considerations:** Log-scaled axes and dense scatter plots can incur rendering costs. Adjust point transparency or limit visible data when working with tens of thousands of rows.
- **Volcano plot memory benchmark:** Compare legacy and optimized processing on the bundled dataset with `node --expose-gc scripts/volcano-benchmark.js`; the script reports heap deltas so you can verify lightweight handling for ~18k rows.【F:scripts/volcano-benchmark.js†L1-L89】
- **Avoid redraw loops:** When reflowing layouts from inside a draw routine, call `layout.syncPanels({ skipSchedule: true })` so the Shared panel synchronizer does not immediately queue another draw on your behalf.【F:js/shared/componentLayout.js†L96-L126】【F:js/components/scatter.js†L1929-L1934】
- **Keyboard shortcuts:** Handsontable supports familiar spreadsheet shortcuts (copy, paste, undo/redo), making it easy to prototype analyses before exporting results.
- **Offline usage:** With the exception of GO/STRING integrations, all functionality works without an internet connection—ideal for secure lab environments.

