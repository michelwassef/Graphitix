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
- `__tests__/statistical-oracle/stats.differential.python.test.js`
  - Core oracle differential suite (curated + randomized + metamorphic checks).
- `__tests__/statistical-oracle/stats.component.differential.matrix.test.js`
  - Component-engine differential matrix validating Box, Pie, ROC, correlation, and Survival hooks against the Python oracle.
- `__tests__/statistical-oracle/stats.component.differential.edges.test.js`
  - Edge, randomized, histogram, and parameter-wiring checks for component statistical hooks.
- `__tests__/statistical-oracle/stats.survival.cox-delayed-entry.test.js`
  - Checks a 1,200-record Efron Cox fit with left truncation against statsmodels PHReg, including coefficients, likelihood, and LR inference.
- `test-support/statsComponentDifferentialSuite.js`
  - Shared numerical helpers, fixtures, and statistical primitive bootstrap for the component differential suites.
- `__tests__/statistical-oracle/stats.matrix.box.test.js`
  - Generated coverage-matrix suite for `box.js`.
  - Exercises exposed analysis branches and parameter combinations where practical.
- `__tests__/statistical-oracle/stats.matrix.line.test.js`
  - Generated coverage-matrix suite for `line.js`.
  - Exercises visible regression, correlation, and forecast branches.
- `__tests__/statistical-oracle/stats.matrix.scatter.test.js`
  - Generated coverage-matrix suite for `scatter.js`.
  - Exercises regression families, routing, prediction, and LOWESS branches.
- `test-support/statsMatrixSuite.js`
  - Shared numerical comparison, fixture, and primitive-bootstrap helpers for the three component matrices.
- `__tests__/statistical-oracle/stats.extended.coverage.test.js`
  - Deterministic branch-coverage suite for statistical helpers that are not yet oracle-backed.
  - Covers box post-hoc/grouped workflows plus ROC resampling and survival derived analyses.
- `__tests__/integration/stats.ui.presentation.branches.test.js`
  - UI-facing presentation-branch suite for statistics panels and reporting cards.
  - Covers rendered stats branches in box, scatter, line, pie, hist, ROC/PR, survival, PCA, and heatmap workspaces.
- `__tests__/integration/stats.ui.persistence.restore.test.js`
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
- balanced two-condition split-plot ANOVA with subjects nested within independent groups
  - Brown-Forsythe variance diagnostic
  - Bartlett variance diagnostic
  - normal-vs-lognormal AICc comparison
  - linear trend test across ordered groups
  - Tamhane T2 unequal-variance post-hoc approximation
  - Tukey HSD
  - Games-Howell
  - Dunn post-hoc
  - Nemenyi post-hoc
  - Sidak-adjusted pooled/Welch t comparisons versus control (not genuine Dunnett or T3)
  - Dunnett correlated multivariate-t control comparisons and Dunnett T3 all-pairs maximum-modulus comparisons
  - Constant-location ROUT robust fitting and residual screening, including paired differences and original row exclusions
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
  - tie-aware exact and seeded Monte Carlo Spearman inference through the shared helper
  - Heatmap Pearson and tied-Spearman output against the Python/SciPy oracle, including complete-pair counts
  - large-sample Spearman approximation boundary and work-budget unavailability behavior
- Survival:
  - log-rank test
  - Gehan-Breslow-Wilcoxon weighted log-rank test
  - log-rank trend test for ordered groups
  - pairwise survival comparisons with multiplicity adjustment
  - median survival ratios
  - Efron Cox-model group contrasts with delayed entry, checked against statsmodels PHReg
  - likelihood-ratio availability after partial-likelihood stabilization, separated coefficients, and forced early termination

## Component Matrix Coverage

The three component matrix suites add systematic branch coverage on top of the curated/randomized differential suites:

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

`__tests__/statistical-oracle/stats.extended.coverage.test.js` characterizes helper branches; branch presence alone does not establish independent numerical validation:

- `box.js`
  - Tukey, Games-Howell, Dunn, Nemenyi, Sidak control, Dunnett, Dunnett T3 and constant-location ROUT paths
  - grouped row-wise and grouped multiple-comparison workflows
  - tie-heavy Monte Carlo rank-test regressions
- `roc.js`
  - bootstrap and permutation curve-difference helpers
- `survival.js`
  - pairwise comparison correction handling
  - median survival ratio summaries
  - Cox-model and hazard-ratio derived helper outputs

## UI Presentation Coverage

`__tests__/integration/stats.ui.presentation.branches.test.js` covers UI-exposed statistics presentation branches that are outside pure numerical oracle comparison:

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

`__tests__/integration/stats.ui.persistence.restore.test.js` covers statistics persistence and UI restoration paths that are separate from the live rendering assertions:

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

- The oracle uses Python `3.12.10`, pinned in `.python-version`.
- Install the exact oracle dependency set with `python -m pip install -r requirements-stats.txt`.
- Validate the interpreter and every direct/transitive pin with `npm run test:python:check` before running `npm run test:stats`.

The Jest helper tries, in order:

1. `PYTHON_BIN` (if set)
2. `python`
3. `py -3`

## Extending Coverage

1. Add new curated cases to `__tests__/fixtures/stats-oracle-cases.json`.
2. Implement the operation in `scripts/stats_oracle.py`.
3. Add JS-side execution logic in `runJsCase(...)` inside `__tests__/statistical-oracle/stats.differential.python.test.js`.
4. Add case-specific comparison rules in `compareCaseResult(...)`.
5. Add randomized generation and metamorphic properties when applicable.

## Design Notes

- Tests compare with explicit tolerances (absolute + relative) to avoid brittle floating-point failures.
- Randomized tests use deterministic seeds for reproducibility.
- Curated and randomized tests run together to provide both targeted and broad statistical validation.

## Verified coverage boundary (2026-10-11)

Named-method references: [SciPy Dunnett](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.dunnett.html), [PMCMRplus Dunnett T3 source](https://raw.githubusercontent.com/cran/PMCMRplus/master/R/dunnettT3Test.R), and [Motulsky and Brown's ROUT paper](https://link.springer.com/article/10.1186/1471-2105-7-123). ROUT here fits a constant location rather than an arbitrary nonlinear curve.

Reproducible named-method checks use `__tests__/statistical-oracle/stats.namedMethods.test.js` and `scripts/stats_oracle.py`. For Dunnett, groups `[10,12,15,19]`, `[20,21,25]` (control), `[4,8,9,11,14,18]` give first adjusted p = 0.05615419346 versus high-precision SciPy 0.05615416757; the 90% interval is [1.13529217, 14.86470783]. T3 groups `[1,2,3]`, `[2,5,10,12]`, `[0,1,2,3,4,5]` give adjusted p = 0.23183234830 for the first pair, matching independent adaptive integration. ROUT on `[8,9,10,11,12,9,10,11,10,100]` excludes source index 9: fitted location 10.00540066 and RSDR 1.27571337 versus SciPy score-root values 10.00540064 and 1.27571335. SciPy Dunnett's public confidence interval uses randomized integration; its interval check has an explicit 0.012 absolute tolerance, while the more precise probability reference uses two million integration points. These are bounded numerical checks, not universal accuracy guarantees.

Helper existence and finite p-values do not establish statistical correctness. The Box oracle now checks production preprocessing and custom comparisons, missing subject rows, tied Friedman resampling, control-only Sidak families with unequal sample sizes and chosen confidence levels, and decimal signed ranks against independent SciPy/Python Decimal/exhaustive permutations. Raw-data rank tests retain exact ties and adjacent representable observations. Unit contracts check single-Grubbs family thresholds, retained MAD flags, and explicit diagnostic/test separation. Browser contracts check full reports, owner isolation, archive reopen and recalculation; integration contracts preserve historical values while requiring recalculation for changed algorithms.

Paired rank-biserial now shares Wilcoxon's midrank sums, excludes zero differences, and is unavailable when every difference is zero. The oracle compares weighted effects with independent SciPy ranks over Python Decimal differences; cases cover ties, zeros, missing subjects, decimal ties and reversed groups. Friedman mode-selection cases assert the actual calibration separately from its probability: forced Monte Carlo stays Monte Carlo, tractable exact distributions retain within-subject ties, and oversized exact requests explicitly disclose Monte Carlo fallback. Its exact reference enumerates independently ranked row assignments. Worker, historical-result and browser archive tests cover both changes; scenario metadata maps their direct evidence. Algorithm version changes preserve historical values as stale pending explicit recalculation.

The grouped Box `nestedRepeatedTwoWay` analysis treats groups as independent, subjects as nested within groups, and exactly two conditions as the repeated factor. It tests the group effect against subjects-within-group error and condition plus interaction against subjects-within-group-by-condition error. It supports complete balanced data only; missing or unequal group sizes, more than two repeated conditions, and zero error variance are blocked. It reports omnibus tests without automatic post-hoc comparisons. Two conditions make sphericity automatic, but interpretation still assumes independent subjects, approximately normal residuals, and comparable between-group variances for subject means and within-subject differences. The F tests are checked against independent statsmodels OLS contrasts and exercised through the real Box worker, advisor, result report, and archive reopen. This bounded design is consistent with [R's ANOVA documentation](https://stat.ethz.ch/R-manual/R-devel/library/stats/html/aov.html), which describes error strata and warns that multi-stratum unbalanced analyses are inefficient; models beyond this scope require a validated mixed-effects implementation such as [nlme](https://stat.ethz.ch/R-manual/R-devel/library/nlme/html/lme.html).

The legacy saved option keys `dunnett`, `dunnettT3`, and `rout` identify Sidak control procedures and MAD flags respectively; they do not certify the named statistical methods. New saved IDs `dunnettTest`, `dunnettT3Test`, and `routTest` select the named methods without changing those historical IDs. Dunnett uses correlated multivariate-t many-to-one calibration and common residual variance; T3 uses all-pairs studentized maximum modulus with continuous Welch degrees of freedom. Its unequal-variance coverage is approximate, and PMCMRplus rounds the degrees of freedom, so exact R-package parity is not claimed. ROUT specializes the published adaptive Lorentzian algorithm to a constant-location model (one fitted parameter), uses the 68.27% residual percentile with N/(N-1) correction, and screens at most floor(30% of N) residuals. It does not implement arbitrary nonlinear curves or certify universal FDR control. Its subsequent exclusion-based inference is exploratory. Independent references use SciPy Dunnett/multivariate-t, adaptive SciPy integration for T3 and SciPy root solving of the ROUT score equations. Grubbs exclusion is exploratory, Welch/Sidak intervals have approximate marginal calibration, and MAD/BH scores have no validated FDR guarantee. The previously failing complete Box and Scatter statistics integration files now pass (11 and 8 cases respectively); Scatter also passes strict leak enforcement. The complete serial integration lane remains unverified in `issues.txt`.
