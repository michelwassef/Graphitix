# Venn

Client-side Venn diagram generator using only HTML and JavaScript. Also includes a GraphPad-style box plot tool.

## Usage

Open `index.html` in a web browser. Paste newline-separated lists into the text areas and press **Draw** to render a
Venn diagram. Numbers are automatically positioned in their respective regions.

Switch to the **Box Plot** tab to paste tabular data and generate customizable box plots with downloadable PNG/SVG and basic t-test and Mann–Whitney U test results.

### Recent updates

* Optional log scale for the box plot Y-axis.
* Statistical tests can now be run as paired or unpaired (default).
* Custom pairwise comparisons are supported alongside all pairwise and reference-based modes.
* Scatter and box plots render points in SVG with configurable axis ranges and origin controls.

## Overlap significance

Enter the total number of genes from your analysis in the **Overlap significance** section and press **Calculate** to compute hypergeometric p-values for each overlap.
