# Venn

Client-side Venn diagram generator using only HTML and JavaScript. Also includes box plot, scatter plot, principal component analysis, line graph, histogram, pie chart, and ROC/PR curve tools.

## Usage

Open `index.html` in a web browser. Paste newline-separated lists into the text areas and press **Draw** to render a
Venn diagram. Numbers are automatically positioned in their respective regions.

Switch to the **Box Plot** tab to paste tabular data and generate customizable box plots with downloadable PNG/SVG and basic t-test and Mann–Whitney U test results. Switch to the **ROC & PR Curves** tab to input model scores and labels, plot ROC or precision-recall curves, and compute area under the curve and average precision.

### Recent updates

* Optional log scale for the box plot Y-axis.
* Statistical tests can now be run as paired or unpaired (default).
* Custom pairwise comparisons are supported alongside all pairwise and reference-based modes.
* Scatter and box plots render points in SVG with configurable axis ranges and origin controls.
* Scatter plots can optionally display a trend line with equation and statistics.
* Graph data and styling can be saved to `.graph` files and reloaded later.
* New dimensionality reduction section supports PCA or MDS and renders PC1 vs PC2 or MDS dimensions.

## Overlap significance

Enter the total number of genes from your analysis in the **Overlap significance** section and press **Calculate** to compute hypergeometric p-values for each overlap.

## Graph files

Each section provides **open file**, **save file**, and **save as** buttons. The **save file** option overwrites the currently opened graph. These use a `.graph` extension containing a JSON document with the table data and any customized styles (colors, line widths, etc.). JSON is human‑readable and native to the browser, making it a simple and portable format for sharing or reloading graphs.
