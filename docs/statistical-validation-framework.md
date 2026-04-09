# Statistical Validation Framework

This repository includes a differential testing framework that compares Graphitix statistical outputs against an independent Python oracle (`SciPy`/`NumPy`).

## Goal

Catch statistical implementation regressions by validating that:

1. Graphitix JavaScript outputs stay numerically aligned with an external reference implementation.
2. Invariants (metamorphic properties) hold for key analyses.
3. Curated reference datasets and randomized datasets are both covered.

## Files

- `scripts/stats_oracle.py`
  - Python oracle runner.
  - Accepts JSON cases on `stdin`, returns JSON results on `stdout`.
- `__tests__/helpers/pythonOracle.js`
  - Jest helper that invokes the Python oracle.
- `__tests__/fixtures/stats-oracle-cases.json`
  - Curated baseline cases.
- `__tests__/stats.differential.python.test.js`
  - Core oracle differential suite (curated + randomized + metamorphic checks).
- `__tests__/stats.component.differential.test.js`
  - Component-engine differential suite validating component statistical hooks against the Python oracle.
- `__tests__/stats.matrix.components.test.js`
  - Generated coverage-matrix suite for `box.js`, `line.js`, and `scatter.js`.
  - Exhaustively exercises exposed analysis branches and parameter combinations where practical.
- `__tests__/stats.extended.coverage.test.js`
  - Deterministic branch-coverage suite for statistical helpers that are not yet oracle-backed.
  - Covers box post-hoc/grouped workflows plus ROC resampling and survival derived analyses.
- `__tests__/stats.ui.presentation.branches.test.js`
  - UI-facing presentation-branch suite for statistics panels and reporting cards.
  - Covers rendered stats branches in box, scatter, line, pie, hist, ROC/PR, survival, PCA, and heatmap workspaces.
- `__tests__/stats.ui.persistence.restore.test.js`
  - UI-facing persistence/restore suite for statistics panels and cached statistical render payloads.
  - Covers payload restore and render-cache restoration across the major stats workspaces.

## Supported Statistical Operations

Current differential coverage includes:

- Multiple-testing corrections:
  - `none`, `bonferroni`, `sidak`, `holm`, `holm-sidak`, `hochberg`, `bh`, `by`
- Hypergeometric right-tail probability
- Distribution fit parameters:
  - normal, log-normal, exponential
- Goodness-of-fit statistics:
  - Kolmogorov-Smirnov statistic
  - Anderson-Darling statistic
- Regression models:
  - linear
  - linear through origin
  - polynomial (quadratic, cubic)
  - exponential
  - power
  - logistic
  - Gaussian
  - one-phase association / decay
  - Gompertz
  - dose-response 3PL / 4PL / 5PL
  - binding saturation / competitive
  - enzyme kinetics (substrate / inhibition)
  - Deming / orthogonal
  - natural spline
  - ARIMA
  - Holt-Winters
- Box/statistics engine tests:
  - Welch t-test
  - pooled-variance unpaired t-test
  - paired t-test
  - ratio t-test
  - lognormal t-test
  - lognormal Welch t-test
  - one-sample t-test
  - Mann-Whitney U
  - Wilcoxon signed-rank (paired and one-sample)
  - Kolmogorov-Smirnov two-sample
  - one-way ANOVA
  - Welch ANOVA
  - lognormal one-way ANOVA
  - lognormal Welch ANOVA
  - Kruskal-Wallis (tie-corrected)
  - Friedman test
  - repeated-measures ANOVA
  - Brown-Forsythe variance diagnostic
  - Bartlett variance diagnostic
  - normal-vs-lognormal AICc comparison
  - linear trend test across ordered groups
  - Tamhane T2 unequal-variance post-hoc approximation
  - Tukey HSD
  - Games-Howell
  - Dunn post-hoc
  - Nemenyi post-hoc
  - Dunnett / Dunnett T3 approximations
  - grouped row-wise Welch t-tests
  - grouped multiple-comparison scopes and multiplicity-family handling
- Pie/proportion:
  - chi-square goodness-of-fit
- ROC/PR:
  - ROC AUC
  - ROC AUC standard error and confidence interval
  - ROC cutoff-by-cutoff threshold metrics
  - PR average precision
  - paired DeLong ROC AUC difference
  - bootstrap curve-difference resampling
  - permutation curve-difference resampling
- Correlation engines:
  - Pearson
  - Spearman
  - exact-permutation Spearman branch in `line.js` when eligible
- Survival:
  - log-rank test
  - Gehan-Breslow-Wilcoxon weighted log-rank test
  - log-rank trend test for ordered groups
  - pairwise survival comparisons with multiplicity adjustment
  - median survival ratios
  - Cox-model group contrasts and derived hazard-ratio tables

## Component Matrix Coverage

`__tests__/stats.matrix.components.test.js` adds systematic branch coverage on top of the curated/randomized differential suites:

- `box.js`
  - parametric vs non-parametric
  - paired vs unpaired vs one-sample
  - pooled-variance vs Welch vs ratio vs lognormal branches
  - exact-eligible vs asymptotic rank-test branches
  - ANOVA / Welch ANOVA / lognormal ANOVA / lognormal Welch ANOVA / Kruskal / Friedman / repeated-measures ANOVA
  - Brown-Forsythe and Bartlett variance diagnostics
  - normal-vs-lognormal AICc comparison
  - ordered-group linear trend testing
  - Tamhane T2 pairwise engine
  - Monte Carlo seed and iteration wiring checks
- `line.js`
  - Pearson and Spearman correlation across all visible regression modes
  - visible regression modes: linear, quadratic, cubic, exponential, power, spline, logistic
  - shared nonlinear regression families continue to be validated primarily through the regression oracle and `scatter.js` matrix coverage because `line.js` delegates to the shared regression engine
  - exact Spearman permutation branch
  - oracle-backed ARIMA and Holt-Winters forecast validation, including manual and auto-tuned parameter branches
- `scatter.js`
  - oracle-backed component validation for linear, linear-through-origin, quadratic, cubic, exponential, power, logistic, spline, LOWESS, Deming, orthogonal, dose-response 3PL/4PL/5PL, one-phase association/decay, Gompertz, Gaussian, binding saturation/competitive, and enzyme kinetics substrate/inhibition
  - visible-mode execution coverage for every regression option exposed by the UI
  - auto-association policy checks
  - logistic-to-4PL routing for non-binary responses
  - fit-method wiring checks, including LOWESS span propagation
- `roc.js`
  - ROC AUC, DeLong AUC difference, AUC uncertainty, and threshold-table diagnostic metrics
  - bootstrap and permutation curve-difference helpers
- `survival.js`
  - log-rank, Gehan-Breslow-Wilcoxon, and ordered log-rank trend engines
  - pairwise survival-comparison correction paths
  - median survival ratios
  - Cox-model fitting and derived hazard-ratio helpers

## Extended Helper Coverage

`__tests__/stats.extended.coverage.test.js` closes several deterministic gaps that were previously outside the oracle-backed suites:

- `box.js`
  - Tukey, Games-Howell, Dunn, Nemenyi, and Dunnett helper paths
  - grouped row-wise and grouped multiple-comparison workflows
  - tie-heavy Monte Carlo rank-test regressions
- `roc.js`
  - bootstrap and permutation curve-difference helpers
- `survival.js`
  - pairwise comparison correction handling
  - median survival ratio summaries
  - Cox-model and hazard-ratio derived helper outputs

## UI Presentation Coverage

`__tests__/stats.ui.presentation.branches.test.js` covers UI-exposed statistics presentation branches that are outside pure numerical oracle comparison:

- `box.js`
  - pairwise post-hoc presentation
  - repeated-measures non-parametric presentation
  - grouped multiple-comparison presentation
- `scatter.js`
  - ungrouped regression summary, model-detail, and coefficient-card rendering
- `line.js`
  - correlation summary rendering
  - forecast accuracy card rendering
  - reporting-card integration
- `pie.js`
  - goodness-of-fit summary rendering
  - pairwise contingency rendering
- `hist.js`
  - descriptive summary cards
  - fit-diagnostic cards
  - distribution-comparison card rendering
- `roc.js`
  - ROC metrics presentation
  - PR metrics presentation
  - graph-type-specific comparison-control options
- `survival.js`
  - log-rank and pairwise log-rank cards
  - hazard-ratio and median-ratio cards
  - Cox coefficient, diagnostics, residual, and Schoenfeld cards
- `pca.js`
  - PCA summary/reporting cards
  - MDS inertia/stress presentation
- `heatmap.js`
  - correlation-matrix statistics presentation
  - value-summary / matrix-summary presentation

## UI Persistence Coverage

`__tests__/stats.ui.persistence.restore.test.js` covers statistics persistence and UI restoration paths that are separate from the live rendering assertions:

- payload restore for `box`, `scatter`, `line`, `pca`, and `heatmap`
- cached stats-panel restore for `pie`, `hist`, `roc`, `survival`, `pca`, and `heatmap`
- saved statistics HTML reattachment and stats-panel hydration after component restore

## Current Scope Boundary

The Python oracle intentionally focuses on deterministic numerical outputs.

Currently excluded from oracle coverage:

- config-only or UI-only options that do not change deterministic numeric outputs
- only purely cosmetic report-layout choices that do not change which statistics cards are rendered
- PCA graphics such as scree overlays, loadings plots, and biplots, unless a stable numeric hook is exposed
- Cox-model secondary summaries such as Harrell's C and residual cards, until dedicated deterministic hooks/oracle implementations are added

## Running

- Full test suite:
  - `npm test`
- Statistical differential suite only:
  - `npm run test:stats`

## Environment Requirements

- Python 3.10+ recommended
- `scipy` and `numpy` available in the Python environment used by `python` (or `PYTHON_BIN`)

The Jest helper tries, in order:

1. `PYTHON_BIN` (if set)
2. `python`
3. `py -3`

## Extending Coverage

1. Add new curated cases to `__tests__/fixtures/stats-oracle-cases.json`.
2. Implement the operation in `scripts/stats_oracle.py`.
3. Add JS-side execution logic in `runJsCase(...)` inside `__tests__/stats.differential.python.test.js`.
4. Add case-specific comparison rules in `compareCaseResult(...)`.
5. Add randomized generation and metamorphic properties when applicable.

## Design Notes

- Tests compare with explicit tolerances (absolute + relative) to avoid brittle floating-point failures.
- Randomized tests use deterministic seeds for reproducibility.
- Curated and randomized tests run together to provide both targeted and broad statistical validation.
