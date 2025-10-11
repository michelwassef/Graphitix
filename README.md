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
  - [Heatmap Explorer](#heatmap-explorer)
- [Dimensionality Reduction (PCA, MDS, t-SNE, UMAP)](#dimensionality-reduction-pca-mds-t-sne-umap)
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
- **Transpose paste shortcut:** Right-click any selection and choose *Paste → Transposed* to rotate clipboard data as it enters the grid—ideal when swapping rows and columns from spreadsheet tools without manually reformatting the source table.【F:js/shared/hot.js†L64-L184】【F:js/shared/hot.js†L1088-L1156】
- **Interactive column sorting:** Ascend, descend, or reset each Handsontable column through dedicated arrow buttons embedded in every header while the grey first row stays pinned for continuous context.【F:js/shared/hot.js†L694-L889】【F:css/style.css†L24-L63】
- **Rich styling controls:** Adjust colors, fonts, borders, opacity, grid lines, and axis limits directly beside the live plot for every visualization type.【F:index.html†L92-L153】【F:index.html†L704-L781】
- **Shared axis toolbar:** Click the X or Y axis inside the box, scatter, line, histogram, ROC/PR, PCA/MDS, survival, or stacked proportion modules to open an overlay that adjusts tick spacing (where numeric), stroke thickness, and axis color without hunting through side panels.【F:js/components/box.js†L4892-L4910】【F:js/components/scatter.js†L1357-L1383】【F:js/components/line.js†L1859-L1910】【F:js/components/hist.js†L585-L646】【F:js/components/roc.js†L1206-L1267】【F:js/components/pca.js†L2284-L2363】【F:js/components/survival.js†L1923-L1994】【F:js/components/pie.js†L588-L676】
- **Per-tab layout persistence:** Manual panel and canvas resizes are captured per workspace tab and restored whenever you switch, duplicate, or reload sessions, so adjusting one chart no longer forces every graph of the same type to match its dimensions.【F:js/main/session.js†L263-L318】【F:js/main/domControls.js†L73-L178】
- **Style sync across tabs:** Copy fonts, titles, axis bounds, and appearance settings from an example graph to other open tabs with the **Match Styles** toolbar button—perfect for standardizing figures before export without re-entering data.【F:index.html†L1470-L1505】【F:js/main/styleSync.js†L1-L382】
- **Inline text editing:** Double-click any plot title or axis label to edit it in place with an inline input overlay that mirrors the chart font, keeps the font toolbar active during edits, and automatically resizes to match your text so you can update characters while changing typography—or even apply a new font, weight, color, size, underline, or baseline shift to just the selected characters—without modal prompts. The toolbar now stays visible for the full inline editing session, and PNG/SVG exports preserve every per-character font override you apply.【F:js/shared/dom.js†L1-L520】【F:js/shared/fontControls.js†L40-L1340】【F:js/shared/exporter.js†L1-L284】【F:css/style.css†L1005-L1080】
- **Typography toolbar upgrades:** Type any font directly into the combo box, tap the dropdown arrow to browse the curated list, and apply bold, italic, underline, subscript, or superscript formatting from the condensed controls that now sit beside the color picker for a faster styling workflow. The popover filters as you type so both preset and custom fonts stay within a single control.【F:js/shared/fontControls.js†L720-L1100】【F:css/style.css†L1005-L1080】
- **Integrated statistics:** Access module-specific statistical summaries, including overlap significance, parametric/non-parametric correlations, hypothesis tests, Chi², and ROC/PR metrics, with results rendered beneath the plots.【F:index.html†L160-L248】【F:index.html†L320-L408】
- **Guided test selection:** Question-driven advisors now span the box, scatter, line, ROC/PR, and survival workspaces, helping you pick appropriate tests, model families, and reporting detail while keeping the shared styling consistent across modules.【F:js/components/box.js†L418-L520】【F:js/components/scatter.js†L676-L842】【F:js/components/line.js†L360-L516】【F:js/components/roc.js†L240-L424】【F:js/components/survival.js†L184-L523】【F:css/style.css†L644-L665】
- **Correlation heatmap clarity:** Cluster Pearson or Spearman matrices, optionally overlay dendrograms, and reference the built-in color scale legend to interpret coefficient magnitudes at a glance.【F:js/components/heatmap.js†L942-L1089】
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
- **Copy feedback that mirrors desktop spreadsheets:** Copying a selection now draws a dotted blue outline around the staged range so you can see exactly which cells will paste elsewhere, matching Handsontable’s native highlight color, and the border now stays visible even when you click elsewhere until you paste or confirm with Enter.【F:js/shared/hot.js†L640-L858】【F:css/style.css†L32-L40】
- **Incremental clipboard pasting:** Large clipboard imports now stream through Handsontable’s incremental APIs so only the targeted region is updated, dramatically reducing `updateSettings` churn and enabling diff-based undo without cloning the full grid even on 10k×10k sheets.【F:js/shared/tableImport.js†L200-L348】【F:__tests__/tableImport.paste.test.js†L1-L121】
- **Numeric-aware fill handle:** Dragging a single cell whose text ends with a number now increments (right/down) or decrements (left/up) the trailing digits automatically, seamlessly rolling past zero into negative values when needed.【F:js/shared/hot.js†L742-L818】
- **Importer-aware undo for pastes:** Clipboard pastes handled through the accelerated importer now snapshot the sheet so Ctrl+Z restores the previous matrix even when bulk updates bypass Handsontable’s native history.【F:js/shared/tableImport.js†L1-L188】【F:js/shared/tableImport.js†L268-L319】
- **Exclude points without deleting them:** Right-click any selection and choose *Exclude* to remove specific cells, entire rows, or whole columns from charts and statistics while keeping the raw values in the grid. Excluded entries render with a red hatch overlay and persist in saved `.graph` files so downstream analyses stay in sync across modules.【F:js/shared/hot.js†L1202-L1385】【F:css/style.css†L104-L138】
- **Load-and-go consistency:** Heatmap and survival workspaces now reload exclusion metadata alongside table contents, so saved `.graph` sessions restore their filtered analyses exactly as they were when exported—no manual cleanup required after reopening a project.【F:js/components/heatmap.js†L1405-L1512】【F:js/components/survival.js†L2136-L2246】
- **Pinned header sorting cues:** Sorting now leaves the first-row headers anchored while reordering body rows, and every column header exposes paired arrow buttons so users can explicitly choose ascending or descending order without losing context.【F:js/shared/hot.js†L694-L889】【F:css/style.css†L24-L63】
- **Delimiter detection for lists:** The Venn workspace can parse newline, tab, comma, or space-separated entries, with an automatic mode that guesses the correct delimiter.【F:index.html†L80-L129】
- **Numeric input mode:** Switch the Venn module to manual count entry when list data is unavailable, populating each region by hand.【F:index.html†L108-L153】
- **Session persistence:** `.graph` files store both the table contents and all stylistic choices. Use *Open*, *Save*, and *Save As* controls to manage workbooks per module.【F:index.html†L68-L108】【F:index.html†L320-L408】
- **Auto-incremented workspace titles:** Creating additional tabs of the same visualization now appends counters like “Scatter Plot #2” so every open workspace remains uniquely identifiable without extra renaming.【F:js/main/session.js†L90-L133】【F:js/main/tabs.js†L300-L310】

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
- Overlay statistical significance brackets only when needed via the new graph control—kept off by default so exported plots stay clean until explicitly enabled.【F:index.html†L360-L408】【F:js/components/box.js†L3607-L3654】
- Apply unified or per-series color palettes, log-scale the Y axis, and clamp axis ranges for publication-ready aesthetics.【F:index.html†L340-L392】
- Tweak bar error bar stroke widths separately from bar outlines thanks to the Error Bar Thickness control that activates for bar plots and strip summaries, keeping mean ± SEM caps readable without altering box borders.【F:index.html†L348-L372】【F:js/components/box.js†L4376-L4434】【F:js/components/box.js†L5225-L5328】
- Click an axis line to summon the compact axis toolbar beside the font controls; fine-tune tick intervals per axis while adjusting shared color and thickness settings that persist in saved `.graph` sessions. The tick spacing control now activates only when the clicked axis represents numeric data (it disables itself for categorical axes such as the vertical X axis), preserves manual Y-axis overrides, and automatically closes the font toolbar whenever the axis panel appears so the overlays never stack.【F:js/shared/axisControls.js†L1-L287】【F:js/components/box.js†L4520-L5245】【F:css/style.css†L886-L897】【F:js/shared/fontControls.js†L1100-L1185】
- Use the statistics panel to configure comparison modes (all pairwise, reference vs. others, or custom) and run parametric (t-test) or non-parametric (Mann–Whitney U) analyses in paired or unpaired settings. Results render in both summary text and tabular form beneath the plot.【F:index.html†L392-L408】
- Tap the built-in **Test Advisor** to answer a short sequence of questions; the app recommends the most appropriate test family (parametric vs. non-parametric), pairing mode, and post-hoc correction, pre-filling the controls so you can immediately run the suggested analysis.【F:js/components/box.js†L2475-L2687】【F:css/style.css†L627-L652】
- Toggle dedicated post-hoc strategies—standard pairwise corrections, Tukey HSD (studentized range, parametric/unpaired), or Dunn's rank-based contrasts—directly inside the statistics panel. Adjusted P-values, selected effect sizes, and descriptive footnotes persist in `.graph` saves for reproducible reporting.【F:index.html†L392-L408】【F:js/components/box.js†L2143-L2194】【F:js/components/box.js†L2882-L3077】【F:js/components/box.js†L4370-L4520】
- Automatic single-value handling ensures that when a group or bar only contains a lone measurement the workspace now omits SEM/SD error bars while still plotting the mean marker, preventing misleading caps on minimal data.【F:js/components/box.js†L3868-L3879】【F:js/components/box.js†L4329-L4337】【F:js/components/box.js†L4379-L4396】【F:js/components/box.js†L4693-L4702】【F:js/components/box.js†L4758-L4776】
- Inspect accompanying effect sizes for every comparison, with configurable parametric (e.g., Cohen's d or Hedges' g) and non-parametric (rank-biserial r or common language probability) metrics persisted alongside significance results.【F:js/components/box.js†L2506-L2710】

### Scatter Plot Explorer
- Import paired or multi-series data, then adjust dot size, fill, transparency, borders, and per-label color palettes directly from the legend swatches.【F:index.html†L408-L456】【F:js/components/scatter.js†L662-L691】
- Toggle grid lines, log-transform axes, set explicit min/max bounds, and position the origin at the lower-left or a custom coordinate.【F:index.html†L440-L488】
- Click an axis line to launch the shared toolbar and fine-tune tick intervals, stroke weight, or axis color directly on the plot without scrolling through configuration fields.【F:js/components/scatter.js†L1346-L1390】
- Enable Pearson or Spearman correlation statistics and display optional trend lines with fitted equations directly on the chart.【F:index.html†L488-L520】
- Choose from linear, polynomial (quadratic/cubic), exponential, power, spline, or logistic regressions with interval shading and diagnostics persisted in saved `.graph` sessions.【F:index.html†L596-L636】【F:js/shared/regression.js†L1-L451】
- Inspect 95% confidence and prediction interval bands with residual diagnostics (skewness, kurtosis, Jarque–Bera) using the new shading and summary toggles, all captured in `.graph` sessions.【F:index.html†L596-L636】【F:js/components/scatter.js†L1247-L1766】
- **High-volume datasets:** Volcano and MA modes trim label bookkeeping and cap automatic annotations so tens of thousands of differential expression points stay responsive without ballooning memory usage.【F:js/components/scatter.js†L1304-L1398】【F:js/components/scatter.js†L1588-L1635】
- **Test advisor guidance:** Answer a short set of questions to auto-select the right correlation metric, regression family, and diagnostic detail for scatter plots, keeping controls and warnings aligned with your data’s measurement scale.【F:js/components/scatter.js†L382-L842】

### Heatmap Explorer
- Toggle between correlation matrices (row- or column-wise) and raw value heatmaps using the new view selector; each mode shares the same color palette, cell sizing, and optional numeric overlays for consistent interpretation.【F:index.html†L360-L409】【F:js/components/heatmap.js†L1037-L1098】【F:js/components/heatmap.js†L1956-L2044】
- Apply Cluster-style preprocessing filters—percent present, standard deviation, absolute value thresholds, and value range—to focus on informative genes before drawing either heatmap view.【F:index.html†L366-L402】【F:js/components/heatmap.js†L520-L596】
- Perform log transforms, row/column centering (mean or median), and normalization directly from the Adjust Data controls, with matching summaries recorded in the statistics panel for audit trails.【F:index.html†L402-L440】【F:js/components/heatmap.js†L600-L686】【F:js/components/heatmap.js†L1721-L1748】
- Cluster rows and columns independently with selectable Pearson, Spearman, or uncentered correlation metrics plus linkage choices, and display synchronized dendrograms along the right and bottom edges when enabled.【F:index.html†L440-L488】【F:js/components/heatmap.js†L1328-L1524】【F:js/components/heatmap.js†L1940-L2033】
- **Faster dendrogram builds:** Packed Float32 distance buffers and a priority-queue merge planner reuse linkage sums so even wide (50–60 column) matrices cluster without freezing the UI, while preserving the existing debug telemetry around each merge.【F:js/components/heatmap.js†L1320-L1531】

### Dimensionality Reduction (PCA, MDS, t-SNE, UMAP)
- Compute principal components, classical MDS stress maps, and non-linear t-SNE or UMAP embeddings directly in the browser using the bundled SVD routines plus new iterative solvers for stochastic neighbor embedding and manifold approximation.【F:index.html†L520-L640】【F:js/components/pca.js†L1287-L1650】【F:js/components/pca.js†L33-L257】
- Switch algorithms from the method selector to reveal tailored controls for perplexity, learning rate, iteration counts, early exaggeration, neighbor counts, minimum distance, and training epochs so analysts can tune embeddings without leaving the sidebar.【F:index.html†L662-L702】【F:js/components/pca.js†L433-L491】【F:js/components/pca.js†L1028-L1073】
- Review method-aware summaries—variance and scree plots for PCA, stress for MDS, KL divergence for t-SNE, and neighborhood settings for UMAP—while saved `.graph` sessions now persist every projection setting alongside existing axis and styling options.【F:js/components/pca.js†L1582-L1677】【F:js/components/pca.js†L2063-L2125】【F:js/components/pca.js†L2613-L2670】
- Choose which dimensions power each axis, rotate PCA plots in 3D, or rely on automatic 2D locking when algorithms do not support 3D rendering so the workspace keeps projections legible across methods.【F:index.html†L668-L716】【F:js/components/pca.js†L485-L517】【F:js/components/pca.js†L1730-L2004】

### Line Graph Studio
- Plot longitudinal or series-based data while recoloring series by clicking legend swatches, alongside dot styling and adjustable line borders.【F:index.html†L640-L712】【F:js/components/line.js†L1340-L1373】
- Control replicate error bar thickness independently from series lines using the dedicated numeric input so variance caps can remain subtle while trend lines stay bold.【F:index.html†L848-L876】【F:js/components/line.js†L1718-L1759】【F:js/components/line.js†L2118-L2194】
- Configure linear or logarithmic axes, clamp ranges, and reposition the origin to highlight specific domains.【F:index.html†L704-L752】
- Adjust tick spacing, thickness, and axis color from the shared axis toolbar by clicking either axis, keeping styling tweaks close to the chart canvas.【F:js/components/line.js†L1843-L1912】
- Summarize trends by computing Pearson or Spearman correlations in the dedicated statistics block.【F:index.html†L752-L777】
- Switch between linear, polynomial, exponential, power, spline, logistic, ARIMA, or Holt-Winters forecasting modes while reviewing interval shading, residual diagnostics, and coefficient summaries for each series.【F:index.html†L900-L937】【F:js/components/line.js†L446-L1325】【F:js/shared/regression.js†L1-L1194】
- Forecast future observations with configurable horizons, seasonal lengths, and automatic AIC/BIC parameter tuning while exporting seasonal components and accuracy metrics alongside the SVG/PNG snapshots.【F:index.html†L909-L937】【F:js/components/line.js†L680-L1390】【F:js/shared/regression.js†L520-L1194】
- Visualize per-series regression confidence/prediction bands and review coefficient standard errors plus residual diagnostics via the statistics table toggles, with settings persisted for saved workbooks.【F:index.html†L893-L916】【F:js/components/line.js†L478-L662】
- Clean single-point series render without error bars while logging the skip for debugging, so sparsely populated tables do not produce misleading caps.【F:js/components/line.js†L1160-L1187】【F:js/components/line.js†L1446-L1469】
- Launch the **Test Advisor** to choose between correlation families, regression shapes, forecast modes, and diagnostics; the assistant pre-fills the relevant toggles and flags cautions for short or irregular series.【F:js/components/line.js†L360-L516】【F:js/components/line.js†L1414-L1590】

### Classification Curves (ROC & PR)
- Build ROC or precision-recall curves from model scores and labels stored in the integrated table editor.【F:index.html†L800-L848】
- Customize series colors directly from the legend, adjust grid display and line thickness, and switch between ROC and PR modes dynamically.【F:index.html†L848-L904】【F:js/components/roc.js†L933-L963】
- Adjust ROC/PR axis tick spacing, stroke thickness, and color directly from the shared toolbar so probability plots stay readable across saved sessions.【F:js/components/roc.js†L1206-L1267】
- Launch the floating font toolbar directly on ROC/PR titles, axis labels, and annotations to fine-tune typography while editing curves, with adjustments reflected in exports and saved workbooks.【F:js/components/roc.js†L933-L987】【F:js/shared/fontControls.js†L40-L374】
- Review trapezoidal AUC or average precision metrics alongside configurable statistic controls below the chart.【F:index.html†L904-L928】
- Use the ROC/PR **Test Advisor** to pick an appropriate curve-comparison method (DeLong, bootstrap, or permutation) based on sample balance and metric type; apply the suggestion directly from the panel.【F:js/components/roc.js†L240-L424】

### Survival Analysis (Kaplan–Meier & Cox)
- Populate a wide-form table with group, time, event, optional entry time, and any number of covariate columns directly in the survival workspace’s spreadsheet.【F:index.html†L1124-L1189】【F:js/components/survival.js†L401-L474】
- Toggle curve display options next to the plot while managing hazard ratio visibility, Cox-model fitting, and covariate selections directly inside the statistics fieldset for a single consolidated workflow.【F:index.html†L1155-L1257】【F:js/components/survival.js†L107-L198】
- Click the Kaplan–Meier axes to fine-tune tick spacing, stroke weight, and color via the shared axis toolbar, keeping long-term tails legible without diving into sidebar controls.【F:js/components/survival.js†L1923-L1994】
- Fit multivariate Cox models with support for time-dependent risk sets, inspect per-predictor coefficients/intervals, and review convergence diagnostics and pairwise hazard ratios with regularized Fisher inversion for stable estimates even in small-sample examples.【F:js/components/survival.js†L735-L1074】【F:js/components/survival.js†L1500-L1677】
- Consult the survival **Test Advisor** to decide when to rely on Kaplan–Meier summaries, add hazard ratio tables, or fit full Cox models with baseline or time-dependent covariates; recommendations flip the relevant toggles automatically.【F:js/components/survival.js†L184-L523】【F:js/components/survival.js†L1206-L1412】

### Histogram Builder
- Generate histograms from univariate data with configurable bin counts, fill colors, border styling, and optional log-scaled Y axis.【F:index.html†L928-L1000】
- Use the shared axis toolbar to adjust tick intervals, axis stroke weight, and color without leaving the plot, even when toggling between linear and log-scaled counts.【F:js/components/hist.js†L558-L646】
- Apply grid overlays, set Y limits, and inspect summary statistics output beneath the visualization.【F:index.html†L1000-L1032】

### Proportion Graph & Chi² Analysis
- Visualize categorical proportions as pie, donut, or stacked bar charts by providing category, observed, and expected columns.【F:index.html†L1032-L1088】
- Customize slice colors by clicking legend swatches, display percentages, rotate the start angle, and export the resulting chart as PNG/SVG.【F:index.html†L1068-L1096】【F:js/components/pie.js†L470-L600】
- Use the axis toolbar on stacked proportion charts to adjust percentage tick spacing, axis thickness, and stroke color alongside the existing legend controls.【F:js/components/pie.js†L588-L676】
- Select observed/expected columns for the built-in Chi² goodness-of-fit test, with results shown in the statistics panel.【F:index.html†L1096-L1108】

## Statistical Analysis Toolkit
Across modules, statistical helpers are surfaced exactly where you need them:
- **Overlap significance:** Hypergeometric p-values for Venn diagram intersections based on a user-provided universe size.【F:index.html†L160-L208】
- **Hypothesis testing:** Parametric and non-parametric comparisons for box plots, including paired analysis, customizable pairings, and configurable post-hoc adjustments (standard corrections, Tukey HSD, or Dunn) alongside Chi² tests for categorical proportions.【F:index.html†L392-L408】【F:js/components/box.js†L2143-L2194】【F:index.html†L1096-L1108】
- **Correlation and regression:** Pearson or Spearman correlation coefficients for scatter and line graphs with selectable linear, polynomial, exponential, power, spline, logistic, ARIMA, or Holt-Winters models, complete with coefficient summaries, forecast horizons, and residual diagnostics to validate assumptions.【F:index.html†L488-L937】【F:js/shared/regression.js†L1-L1194】
- **Classification metrics:** ROC/PR workspaces compute trapezoidal area under the curve, average precision, and related diagnostics via inline summaries.【F:index.html†L800-L928】
- **Dimension summaries:** PCA/MDS output includes eigenvalue or stress statistics to contextualize ordination quality.【F:index.html†L520-L640】

## Gene Enrichment & Protein Network Integrations
The Venn workspace integrates post-overlap biological analysis without leaving the app:
- **Gene Ontology enrichment:** Trigger GO term analysis with selectable category filters (Biological Process, Molecular Function, Cellular Component) and optional background adjustment. Results can be plotted and exported as charts.【F:index.html†L184-L216】
- **STRING network exploration:** Request STRING protein-protein interaction networks with configurable network types, edge semantics, and active data sources, then export the rendered network visualization.【F:index.html†L208-L224】
- **Stable downstream views:** GO and STRING results remain visible when the Venn diagram redraws or the layout resizes; analyses are only cleared when you switch regions or edit the underlying gene lists, keeping enrichment context in place while you tweak styling.【F:js/components/venn.js†L672-L707】【F:js/components/venn.js†L1030-L1095】

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
5. Workspace components are lazily ensured based on the active tab. When writing tests or debugging in JSDOM, call `Main.tabs.handleGraphSelection(type)` (or otherwise activate the tab) before asserting that Handsontable grids or stats panels exist so deferred bootstraps can run.【F:js/main/bootstrap.js†L44-L93】【F:js/main/domControls.js†L64-L201】

## Troubleshooting & Tips
- **Large tables:** For wide datasets, drag the panel resizers to allocate more screen real estate to the spreadsheet or chart as needed.【F:index.html†L320-L360】【F:index.html†L704-L731】
- **Unlimited horizontal graph resizing:** Use the right-edge resize handle on any visualization canvas to extend charts as wide as needed—the shared resizer now keeps its unbounded width even after panel synchronization, so you can craft ultra-wide layouts and scroll the diagram panel horizontally when the plot exceeds the viewport.【F:js/shared/resizer.js†L389-L475】【F:js/shared/resizer.js†L1121-L1309】
- **Performance considerations:** Log-scaled axes and dense scatter plots can incur rendering costs. Adjust point transparency or limit visible data when working with tens of thousands of rows.
- **Volcano plot memory benchmark:** Compare legacy and optimized processing on the bundled dataset with `node --expose-gc scripts/volcano-benchmark.js`; the script reports heap deltas so you can verify lightweight handling for ~18k rows.【F:scripts/volcano-benchmark.js†L1-L89】
- **Avoid redraw loops:** When reflowing layouts from inside a draw routine, call `layout.syncPanels({ skipSchedule: true })` so the Shared panel synchronizer does not immediately queue another draw on your behalf.【F:js/shared/componentLayout.js†L96-L126】【F:js/components/scatter.js†L1929-L1934】
- **Consistent graph dimensions:** Reuse `Shared.componentLayout.createStandardPanels` or call `Shared.graphSizing.getSizing({ context })` so every chart canvas starts with the shared scatter-plot defaults; `Shared.graphSizing.ensureCssVariables()` also updates the CSS custom properties that back `.svgbox` sizing. The shared resizer now clamps auto-width calculations to those defaults unless the user manually resizes, preventing example datasets from stretching the canvas beyond its starting footprint.【F:js/shared/componentLayout.js†L1-L210】【F:js/shared/graphSizing.js†L1-L137】【F:js/shared/resizer.js†L1000-L1450】
- **Graph viewport helper:** After constructing SVG content, call `Shared.graphViewport.ensure(svg, { padding, debugLabel })` to normalize the viewBox and container overflow so titles, legends, and annotations stay inside the visible graph area across modules.【F:js/shared/dom.js†L118-L168】
- **Keyboard shortcuts:** Handsontable supports familiar spreadsheet shortcuts (copy, paste, undo/redo), making it easy to prototype analyses before exporting results.
- **Offline usage:** With the exception of GO/STRING integrations, all functionality works without an internet connection—ideal for secure lab environments.

