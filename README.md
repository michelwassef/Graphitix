# Graphitix

Graphitix is a browser-based data visualization and statistical analysis studio for turning tabular data into publication-ready figures. It runs client-side in HTML, CSS, and vanilla JavaScript, combines spreadsheet-style editing with chart-specific controls, and supports reusable multi-tab workspaces through `.graph` archives.

## Highlights

- Multi-tab visualization workspace with reusable data, tab duplication, style matching, and session persistence
- Spreadsheet-style AG Grid input with undo/redo, clipboard import, transpose paste, and CSV/TSV/TXT/XLS/XLSX/ODS ingestion
- Publication-ready SVG and PNG export across all graph workspaces
- Client-side architecture with optional network access only for external enrichment/integration features
- Statistical tooling built into the relevant workspaces instead of split across separate utilities
- Optional Electron desktop wrapper under [`desktop/`](./desktop)

## Visualization Workspaces

| Workspace | Purpose | Key capabilities |
| --- | --- | --- |
| **Venn / UpSet** | Set overlap analysis | Region inspection, hypergeometric overlap testing, GO enrichment, STRING network retrieval, Venn and UpSet views |
| **Box / Violin / Bar / Strip** | Group comparison workflows | Parametric and non-parametric tests, multiple-comparison procedures, effect sizes, diagnostics, outlier screening |
| **Scatter / Volcano / MA** | Relationship and differential-expression analysis | Correlation, regression families, confidence/prediction intervals, residual diagnostics, grouped comparisons, density coloring |
| **3D Surface** | Surface and response visualization | Mesh/surface rendering, interpolation, interactive rotation, color gradients |
| **Heatmap** | Matrix and clustering workflows | Pearson/Spearman matrices, clustering, dendrogram overlays, matrix summary stats |
| **PCA / MDS / t-SNE / UMAP** | Dimensionality reduction | 2D/3D projections, scree and loadings outputs, biplots, solver-specific controls |
| **Line Graph** | Time series and longitudinal data | Regression models, diagnostics, ARIMA, Holt-Winters, forecast summaries |
| **ROC / PR** | Classifier evaluation | ROC/PR toggles, AUC/AP metrics, threshold tables, DeLong/bootstrap/permutation comparisons |
| **Survival** | Time-to-event analysis | Kaplan-Meier, log-rank family tests, Cox modeling, hazard ratios, residual summaries |
| **Histogram / Density** | Distribution summaries | Auto/manual binning, KDE, PDF/CDF overlays, log scaling, descriptive stats |
| **Proportion** | Composition and expected-frequency analysis | Pie/donut/stacked views, chi-square goodness-of-fit, observed vs expected summaries |

## Statistical Coverage

Graphitix includes substantial built-in statistical tooling. The major implemented areas include:

- Box workflows: one-sample, paired, unpaired, Welch, ratio, lognormal, ANOVA/Welch ANOVA/lognormal variants, repeated-measures, grouped two-way and three-way analyses, rank-based tests, multiple-comparison corrections, effect sizes, assumption checks, trend testing, and outlier screening
- Scatter and line workflows: Pearson/Spearman correlation, linear and nonlinear regression families, fit diagnostics, residual analysis, confidence/prediction intervals, inverse prediction, and forecast validation
- ROC/PR workflows: ROC AUC, PR area / average precision, uncertainty summaries, best-threshold metrics, and pairwise comparison procedures
- Survival workflows: Kaplan-Meier summaries, log-rank / Gehan-Breslow-Wilcoxon / trend tests, Cox proportional-hazards modeling, hazard ratios, concordance, and residual cards
- Venn workflows: overlap significance, GO enrichment through g:Profiler, and STRING network retrieval
- Heatmap, histogram, and proportion workflows: clustering, descriptive statistics, goodness-of-fit tests, and matrix summaries

For implementation-level detail, see [`docs/statistical-validation-framework.md`](./docs/statistical-validation-framework.md) and [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## User Workflow

1. Open `index.html` in a modern browser, or serve the repository locally for development and e2e testing.
2. Create a workspace from the welcome launcher.
3. Enter or import data into the left-hand AG Grid table.
4. Configure graph styling and analysis options from the right-hand controls.
5. Export SVG/PNG output or save a `.graph` archive for later reuse.

## Project Structure

- [`index.html`](./index.html): main application shell and workspace markup
- [`css/style.css`](./css/style.css): canonical styling source
- [`js/shared/`](./js/shared): shared utilities, loaders, file IO, import/export, analysis helpers, toolbar logic
- [`js/components/`](./js/components): workspace-specific rendering and payload logic
- [`js/main/`](./js/main): tab/session/bootstrap orchestration
- [`__tests__/`](./__tests__): Jest suites
- [`e2e/`](./e2e): Playwright browser workflows
- [`docs/`](./docs): architecture and development references
- [`desktop/`](./desktop): Electron wrapper

## Development

### Requirements

- Node.js 20+ recommended
- Python 3.10+ with `numpy` and `scipy` for the differential stats suite

### Install

```bash
npm install
```

### Run Tests

```bash
npm test
```

Additional useful commands:

- `npm run test:stats` for JS vs Python differential validation
- `npm run test:e2e:contracts` for cross-browser contract coverage
- `npm run test:e2e:matrix` for the heavier Playwright workspace matrix
- `npm run bench -- --json bench.json` for synthetic benchmark runs

### Desktop Wrapper

The Electron wrapper is optional and lives in [`desktop/`](./desktop).

- `npm run desktop:dev`
- `npm run desktop:sync`
- `npm run desktop:build`
- `npm run desktop:build:portable`
- `npm run desktop:build:installer`

## Architecture References

- [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- [`docs/development/main-bootstrap.md`](./docs/development/main-bootstrap.md)
- [`docs/development/module-call-map.md`](./docs/development/module-call-map.md)
- [`docs/development/component-contracts.md`](./docs/development/component-contracts.md)
- [`docs/development/state-persistence-schema.md`](./docs/development/state-persistence-schema.md)

## Publication Checklist

Before publishing the repository or packaging a release:

- Run `npm test`
- Run `npm run test:stats` if Python-based differential validation is part of the release bar
- Run the relevant Playwright suite for the target release
- Remove generated artifacts and local build output that should not ship in source control
- Verify package metadata, installer metadata, and README text all use the `Graphitix` brand

## License

This project is licensed under the MIT License. See [`LICENSE`](./LICENSE).
