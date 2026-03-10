# Statistical Validation Framework

This repository includes a differential testing framework that compares Venn statistical outputs against an independent Python oracle (`SciPy`/`NumPy`).

## Goal

Catch statistical implementation regressions by validating that:

1. Venn JavaScript outputs stay numerically aligned with an external reference implementation.
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
- Box/statistics engine tests:
  - Welch t-test
  - paired t-test
  - one-sample t-test
  - Mann-Whitney U
  - Wilcoxon signed-rank (paired and one-sample)
  - one-way ANOVA
  - Kruskal-Wallis (tie-corrected)
  - Friedman test
  - repeated-measures ANOVA
- Pie/proportion:
  - chi-square goodness-of-fit
- ROC/PR:
  - ROC AUC
  - PR average precision
  - paired DeLong ROC AUC difference
- Correlation engines:
  - Pearson
  - Spearman
- Survival:
  - log-rank test

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
