# Graphitix statistics audit — 2026-10-25

Status: **baseline audit complete; current disposition in §15**. Sections 1–13 record the initial audit against HEAD 92afb33c (2026-10-25); section 14 records the subsequent review. Section 15 supersedes historical status statements and records the current implementation and verification state.

Scope: every statistical procedure exposed by Graphitix (Box, Scatter, Line, Heatmap, PCA, ROC/PR, Survival, Histogram, Pie/Proportion, Venn/UpSet), the shared numerical primitives, the "Help me choose" advisors, and the statistical test/oracle suite.

Method:
1. Read each implementation and its callers (not only the public summary).
2. Check the statistical definition against primary/expert sources (journals, NIST, R/Statsmodels/SciPy reference documentation, original method papers). No forum threads.
3. Recompute representative cases independently where practical (Python/SciPy/statsmodels oracle in this repository plus manual derivations).
4. Compare the test suite against the claimed contracts: does a passing test actually prove the numerical or behavioural property it claims?
5. Record severity: **P0** = wrong or misleading inference on valid input; **P1** = invalid inference in a plausible workflow or a missing guard that produces wrong output; **P2** = methodological/UX limitation with a documented workaround; **P3** = clarity, coverage, or maintainability.

---

## 1. Executive summary

The statistical core is unusually careful for a browser application: Welch t-tests are the two-group default, rank tests use tie-corrected/exact/permutation calibration, variance and normality checks are explicitly diagnostics rather than selectors, multiple-testing corrections are implemented correctly, and several procedures are validated against independent Python oracles. The advisor text repeatedly warns against exactly the abuses that dominate published misuse (normality-test gating, "non-significant = equivalent", rank tests as median tests, post-hoc after a non-significant omnibus, uncorrected pairwise families).

The remaining release risks are concentrated in four places:

1. **Survival with delayed entry**: the Cox model honors entry times, but Kaplan–Meier curves and log-rank/Gehan/trend tests ignore them. The same table therefore produces a valid Cox fit and an invalid KM/log-rank result, with no warning. This is the most serious confirmed defect so far (ST-14).
2. **Guidance gaps rather than numerical errors**: no sphericity guidance at the point of recommendation for repeated-measures ANOVA, no equivalence/TOST route, no exact/Fisher route for sparse proportions, and no multiplicity guidance for some per-panel statistics. Two presentational gaps also matter because they change what a reported number means: no proportional-hazards test behind a Cox hazard ratio (ST-43), and a Yates-corrected chi-square applied by an advisor that describes an uncorrected one (ST-22).
3. **Test-suite design**: oracle coverage is real but uneven; several suites assert presentation or helper existence rather than statistical correctness, and some "contract" tests re-derive expectations from the same implementation (self-fulfilling). Detailed in section 13.
4. **Small numerical/consistency issues**: hard-coded 95% intervals in several places, a mathematically invalid Anderson–Darling exponential tail branch (ST-06) that is confirmed unreachable from the UI but left exposed on the shared API, and inconsistent Monte Carlo p-value conventions.

No wrong p-value, CI, or effect size was found in the **default** paths that were independently checked or recomputed. The single confirmed wrong-inference defect reachable from the UI is delayed entry in Survival (ST-14), and it is wrong because the wrong data are used, not because a formula is wrong.

---

## 2. Confirmed findings

| ID | Severity | Area | Finding | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| ST-01 | — | Core | Welch t-test, pooled t, paired t, one-sample t, ratio t, lognormal t use the correct estimators and Welch–Satterthwaite df; CIs use the matching df. | `js/shared/boxStatsModel.js:2495-2645` | verified correct |
| ST-02 | P3 | Core | Degenerate zero-variance case with a non-zero mean difference returns p = 0 and a zero-width CI. This is a convention, not a sampling result; the UI should not present it as evidence of an effect. | `js/shared/boxStatsModel.js:2475-2493` | confirmed |
| ST-03 | — | Core | Holm, Holm–Šidák, Šidák, Hochberg, Benjamini–Hochberg, Benjamini–Yekutieli adjusted p-values are implemented correctly (step-down/step-up monotonicity verified). | `js/shared/stats.js:1166-1240` | verified correct |
| ST-04 | P3 | Core | `normalCdf` uses the Abramowitz–Stegun 7.1.26 erf approximation (~1.5e-7 absolute). It feeds fitted CDFs and QQ plots, not the main p-value path, which uses regularized incomplete beta/gamma. Acceptable, but `< 1e-7` tail probabilities from CDF-based diagnostics inherit that error. | `js/shared/stats.js:1306-1328` | confirmed, low impact |
| ST-05 | P2 | Core | Fisher-z correlation CI clamps \|r\| to 0.999999999999 and requires n > 3. For \|r\| = 1 or tiny n the interval is not a valid confidence statement; it should be reported as unavailable or as the degenerate endpoint. | `js/shared/stats.js:1349-1372` | confirmed |
| ST-06 | P3 | Histogram | The Anderson–Darling exponential p-value branch `1 - exp(-1.2937 + 5.709a - 0.0186a²)` is not a probability function for the exponential case: it gives p ≈ 0.726 at a = 0 (a perfect fit), becomes 0 at a ≈ 0.226, and jumps to 0.61 at the a = 0.3 branch boundary. **Reachability:** `goodnessOfFit` defaults `parametersEstimated` to `true`, hist.js always passes `true`, and the parametric bootstrap then overwrites `adP`; so the app never reaches this branch. It is reachable only by an external caller of the shared API with `{parametersEstimated:false}`, where it would report a false rejection. | `js/shared/stats.js:1476-1484` (`adPValueExponential`), `1515-1534` (`andersonDarlingPValue`), `1923-2002` (`goodnessOfFit`); `js/components/hist.js:6685` | confirmed, latent only (delete or correct the branch) |
| ST-07 | P3 | Histogram | The AD critical-value interpolation extrapolates a fixed p = 0.25 below the smallest tabulated statistic instead of approaching 1; used only as a fallback when the analytic approximation is non-finite. | `js/shared/stats.js:1488-1513` | confirmed |
| ST-08 | — | Histogram | Fitted-parameter goodness-of-fit uses a parametric bootstrap that refits the model in every replicate, which correctly avoids the Lilliefors problem of one-sample KS/AD with estimated parameters. | `js/shared/stats.js:1936-1985` | verified correct |
| ST-09 | P2 | Histogram | Bootstrap p-value resolution is 1/(B+1) with B default 500 (floor 200), so the smallest attainable p is 0.002 and p-values near 0.05 carry ±0.01 Monte Carlo error. Adequate for a 0.05 decision but should be stated, and B should be raised for reporting. | `js/shared/stats.js:1955-1962` | confirmed |
| ST-10 | — | Box | Mann–Whitney U and Wilcoxon signed-rank implement tie-aware midranks, continuity correction, zero-difference exclusion, and exact/permutation/asymptotic calibration correctly. | `js/shared/boxStatsModel.js:2727-2950` | verified correct |
| ST-11 | P3 | Box | The Monte Carlo Mann–Whitney and signed-rank p-values count `>= observed` without the +1 continuity convention used elsewhere, so p = 0 is possible with finite resamples. | `js/shared/boxStatsModel.js:2677-2694`, `2776-2835` | confirmed |
| ST-12 | — | Box | Kruskal–Wallis (tie-corrected H), Friedman (tie-corrected Q, exact/Monte Carlo, Kendall's W), Welch ANOVA, one-way ANOVA, and Games–Howell, Tukey–Kramer, Dunn, Nemenyi, Dunnett, Dunnett T3, Tamhane T2/Sidak control, and ANOVA-pooled contrasts match their definitions. | `js/shared/boxStatsModel.js:2950-3400`, `3838-4520` | verified correct |
| ST-13 | — | Box | Effect sizes are correct: pooled Cohen's d, Hedges g (1 − 3/(4N − 9)), paired dz, matched-pairs rank-biserial from signed-rank sums, and common-language effect. | `js/shared/boxStatsModel.js:4708-4774` | verified correct |
| ST-14 | **P1** | Survival | Kaplan–Meier and log-rank/Gehan/trend ignore the delayed-entry column, while Cox honors it. At-risk sets start at full group size and never add subjects at their entry time; subjects with entry > 0 are therefore at risk before they were observed, biasing survival probabilities, expected events, and every log-rank-based p-value. No warning is shown. | `js/components/survival.js:3228-3240` (KM at-risk), `3557-3610` (log-rank at-risk), `3958-4120` (Cox honors entry) | confirmed |
| ST-15 | P2 | Survival | The Cox `truncated` flag is hard-coded to `false` regardless of entry times. Any downstream gating that depends on it (e.g. likelihood-ratio reporting and diagnostics text) does not reflect delayed entry. | `js/components/survival.js:4022`, `4108`, `4717`, `4745` | confirmed |
| ST-16 | P2 | Survival | Kaplan–Meier confidence limits are fixed at 1.96 (95%) with no user-selectable level, while other components expose a CI level; the report does not state the level. | `js/components/survival.js:3237` | confirmed |
| ST-17 | P2 | Survival | Cox and KM assume independent censoring and do not test it; the report documents the proportional-hazards limitation but there is no non-informative-censoring caveat. | `js/components/survival.js:7295-7347` | confirmed (documentation gap) |
| ST-18 | — | ROC | DeLong AUC variance, paired DeLong difference covariance, Mann–Whitney p-value, tie handling (0.5 kernel), and threshold metrics (sensitivity/specificity/PPV/NPV with Wilson intervals, LR±, Youden, F1) are implemented correctly. | `js/components/roc.js:4927-5160`, `5229-5298` | verified correct |
| ST-19 | P3 | ROC | The DeLong difference CI and the paired test use a hard-coded 95% critical value even if the analysis CI level is changed; the AUC CI is clipped at 0/1 rather than using a logit transform. | `js/components/roc.js:5293`, `4970-4980` | confirmed |
| ST-20 | P2 | ROC | Threshold "optimal" cutoffs (Youden, maximum F1) are selected on the same data used to estimate the curve; the optimism of that selection is not quantified or disclosed. | `js/components/roc.js:5087-5145` | confirmed |
| ST-21 | — | Pie | Chi-square homogeneity/GOF refuses sparse expected counts and states that neither chi-square nor G resolves them; the advisor withholds a one-click recommendation instead of silently applying an invalid asymptotic test. | `js/components/pie.js:3697-3770` | verified correct (but see ST-22) |
| ST-22 | P2 | Pie | Yates' correction is on by default (`yatesCorrection: true` in the default stats config) and the advisor's apply payload sets it to `true`, while the advisor's own context/blocking computation uses `false`. The advisor summary therefore describes a plain chi-square and the user receives a continuity-corrected one; only a footnote in the stats panel mentions it. Yates is also not recommended practice for 2×2 tables in current guidance (Fisher exact or uncorrected Pearson). | `js/components/pie.js:254`, `281` (defaults), `3596`, `3606` (context, `false`), `3736` (apply, `true`), `4696` (footnote) | confirmed |
| ST-23 | — | Box advisor | Two-group normal recommendation defaults to Welch regardless of variance, requires explicit variance and distribution answers for 3+ groups, blocks lognormal on non-positive data, refuses normality-test-driven selection, and warns about multiplicity, effect sizes, and rank-test interpretation. This matches current guidance. | `js/components/box.js:8774-9060` | verified correct |
| ST-24 | P2 | Box advisor | Repeated-measures ANOVA is recommended without a sphericity caution in the recommendation itself (only in the diagnostics panel), and with no pointer to the GG/HF-corrected p-values that the report also prints. | `js/components/box.js:8960-8985` | confirmed |
| ST-25 | P2 | Box advisor | The lognormal repeated-measures path is identified but cannot be applied; this is honestly disclosed ("not yet exposed"), so it is a product gap rather than a wrong recommendation. | `js/components/box.js:8965-8975` | confirmed |
| ST-26 | — | Hist advisor | Requires individual (not summarized) observations, rejects discrete data for continuous-model checks, refuses paired data for the independent two-sample KS, and warns about exchangeability, ties, and non-significance ≠ equivalence. | `js/components/hist.js:408-480` | verified correct |
| ST-27 | P3 | Hist advisor | The advisor still describes KS/AD as diagnostics but does not disclose the Monte Carlo resolution or that AICc differences are relative only (the latter is in the panel footnote, not the advisor). | `js/components/hist.js:470-480` | confirmed |
| ST-28 | P2 | Box | One-way repeated-measures ANOVA computes and reports Greenhouse–Geisser and Huynh–Feldt epsilons and corrected p-values, but the two-way mixed model (`rowRandomMixed`) does not, even when the within-subject condition factor has more than two levels. Post-hoc paired contrasts also use separate paired t-tests rather than the pooled within-subject error. | `js/shared/boxStatsModel.js:3020-3175` vs `5681-5778`; `js/components/box.js:8960-8985` | confirmed |
| ST-29 | P2 | Survival | The Cox events-per-variable caution triggers on `totalEvents < 10` regardless of how many parameters are estimated. With several covariates or interaction terms, 12 events can pass the warning while EPV is 1–2. EPV is events per estimated coefficient/df, not per dataset. | `js/components/survival.js:2680-2690` | confirmed |
| ST-30 | P2 | ROC | A single-AUC interval is a Wald interval clipped at 0/1. Simulation evidence favours a logit-transformed interval for a single AUC when the estimate is near the boundary; the paired AUC difference should remain on the difference scale. Current code uses the untransformed interval and clips. | `js/components/roc.js:4970-4980` | confirmed |
| ST-31 | P2 | Line advisor | Pearson/Spearman p-values for a time-indexed line series assume independent observations. The advisor warns about autocorrelation only for the forecasting models, not for ordinary correlation or regression. | `js/components/line.js:8738-8900` | confirmed |
| ST-32 | P3 | Line advisor | "A spline smoother adapts to complex fluctuations without overfitting high-degree polynomials" overstates the guarantee: the natural-spline fit is not penalized and can overfit small series. | `js/components/line.js:8810-8820` | confirmed |
| ST-33 | P3 | Histogram | The analytic Anderson–Darling normal p-value applies the Stephens `A(1 + 4/n − 25/n²)` statistic adjustment with the piecewise approximation calibrated for `A(1 + 0.75/n + 2.25/n²)` in R's `nortest`. The difference is small but the pairing is inconsistent; the default bootstrap path is unaffected. | `js/shared/stats.js:1527-1532`; R `nortest::ad.test` | confirmed |
| ST-34 | P2 | Tests | The differential oracle compares only the KS and AD **statistics** for goodness-of-fit; it never compares `ksPValue`/`adPValue`. The unit suite asserts that AD p is in (0, 1], that two samples are ordered correctly, that lognormal support is enforced, and that a NaN CDF yields `available:false` — but nothing pins a p-value to an independent value. Consequently the AD/KS p-value formulas, including the invalid exponential branch (ST-06), have no numerical gate. | `__tests__/statistical-oracle/stats.differential.python.test.js:232-241`; `__tests__/unit/stats.goodnessOfFit.test.js:11-57` | confirmed |
| ST-35 | P3 | Heatmap | Untestable correlation cells are entered into the FDR family as p = 1 and then skipped when writing adjusted values. This inflates the family size and makes the remaining adjusted p-values slightly conservative. | `js/components/heatmap.js:6811-6860` | confirmed |
| ST-36 | P2 | Pie | Sparse expected counts block every recommendation, and no exact or Monte Carlo exact test is available. This is honest but leaves a common 2×2/rare-category workflow with no supported inference. | `js/components/pie.js:3697-3770` | confirmed |
| ST-37 | P2 | All | No equivalence/non-inferiority (TOST) route exists. The advisors correctly say that a non-significant result is not evidence of no difference, but the application cannot produce the analysis that would support such a claim. | advisor text, all components | confirmed (product gap) |
| ST-38 | P3 | Core | Two different correction defaults exist in code: Box UI/engine entry points use `holm`, while `boxStatsModel` falls back to `bonferroni` when a payload omits `statsCorrection`. Normal UI/save flows always supply the field, but a partial external payload or a direct engine call can silently change the reported p-values. | `js/components/box.js:981`; `js/shared/boxStatsModel.js:82` | confirmed |
| ST-39 | P2 | Box | Pairwise paired contrasts delete incomplete rows per pair. In an all-pairs family, different comparisons can therefore be computed on different subject sets, so the family is not a set of contrasts on one analysis sample. | `js/shared/boxStatsModel.js:2459-2474`, `4644-4647` | confirmed |
| ST-40 | P3 | Venn | The Venn overlap table applies Holm across the displayed overlap family and states this correctly, but offers no FDR/BH option even though overlap/enrichment screens are conventionally FDR-controlled and the same repository uses BH for Heatmap correlations. | `js/components/venn.js:386`, `467`, `8809-8845`, `8939` | confirmed (product choice, disclosed) |
| ST-41 | P3 | Venn | GO term results display the provider's `p_value` as a bare p-value with no statement of which correction produced it. The request goes to the g:Profiler `gost/profile` endpoint without a `correction_method`, so the value is the server default (`g_SCS`, a family-wise correction), and STRING enrichment likewise returns provider-corrected values. The numbers are therefore not raw, but a reader cannot tell that from the UI, cannot choose FDR, and cannot see the family size. | `js/components/venn.js:8603`; `js/shared/goAnalysis.js:8`, `13-26` | confirmed (labelling gap; values are provider-corrected) |
| ST-42 | P3 | Survival | The log-rank trend test uses the correct 1-df score statistic `(Σ sᵢdᵢ)² / (sᵀVs)` with the group-index scores; the Gehan–Breslow–Wilcoxon weighting and the multivariate log-rank quadratic form were also verified against their definitions. | `js/components/survival.js:3427-3445`, `3501-3555` | verified correct |
| ST-43 | P2 | Survival | No formal proportional-hazards test. Schoenfeld residual–time correlations are explicitly labelled exploratory and disclaimed, but a Cox HR is reported with no Grambsch–Therneau test or time-interaction check and no statement that PH was untested. | `js/components/survival.js:6740-6755`, `6862` | confirmed |
| ST-44 | P3 | Tests | The `stats` lane runs only the eight `statistical-oracle` suites. The shared-stats unit suites (`__tests__/unit/stats.goodnessOfFit.test.js`, multiple-testing, distribution, formatting) are outside that gate, so a regression in a helper that only the unit suites cover passes the lane. | `scripts/run-test-lane.cjs` stats lane file list; `artifacts/stats-audit-lane.log` | confirmed |

*(Additional sections are appended below as the audit proceeds.)*

---

## 3. Core numerical primitives

### 3.1 Distribution functions

`stats.js` implements log-gamma, regularized incomplete gamma (series + continued fraction), regularized incomplete beta (continued fraction), and Student t two-sided tails from the incomplete beta. These are standard, numerically stable formulations; the continued-fraction cutoffs are conventional. The Python oracle exercises the resulting p-values across the supported tests, so systematic function-level error would be detected at the tested parameter ranges.

### 3.2 Multiple-testing correction

All eight methods are correct, including monotonic enforcement. Invalid/missing p-values are excluded from the family size `m`, which is the right choice (they cannot be tested), but the UI must not then imply the family was fully corrected; this is a wording issue, not a numerical one.

### 3.3 Correlation intervals

Fisher's z interval is the conventional large-sample interval. It is known to have poor coverage for \|r\| near 1 and small n, and several improved intervals exist (e.g. Bonett–Wright, or bootstrap/BCa). The implementation is correct as a Fisher interval; the risk is presentation without a small-sample caveat.

---

## 4. Box / distribution comparisons

### 4.1 What is right

- Welch is the two-group default, and the advisor explains why variance tests do not select the test.
- Rank tests retain ties, handle zero differences correctly, and use exact permutation where the state space permits.
- Post-hoc procedures are the correct families for their designs: Tukey–Kramer for equal-variance all-pairs, Games–Howell for unequal-variance all-pairs, Dunn after Kruskal–Wallis, Nemenyi after Friedman, Dunnett for many-to-one, T3 for unequal-variance all-pairs, Tamhane T2/Sidak for the labelled approximation.
- The report separates omnibus from pairwise inference and the advisor asks for the multiplicity family up front.

### 4.2 Design and model checks (resolved)

- **Sums of squares.** Two-way and higher factorial models require complete, balanced data and refuse otherwise (`boxStatsModel.js:5535-5560`), so there is no silent Type I/II/III ambiguity: the only supported design is the one where all three coincide. The mixed and nested repeated-measures models impose the same requirement and say so in their notes (`7865`, `5878`). This is a limitation, not an error, and it is disclosed.
- **"Auto" post-hoc selection.** It is model-driven, not data-driven: `oneWayAnova`/`lognormalAnova` → Tukey–Kramer, `welchAnova`/`lognormalWelchAnova` → Games–Howell, everything else → the pair-specific standard procedure (`boxStatsModel.js:1319-1335`). The chosen procedure is then checked with `applies(context)` and a reason is produced when unsupported. This is consistent with the omnibus model and the variance assumption; verified correct.
- **Repeated-measures post-hoc error term.** Pairwise contrasts are separate paired t-tests on the pair's own subjects (`2436-2480`, `4644-4647`), not the pooled within-subject error with `df = (a−1)(n−1)`. This is the error term the repeated-measures literature recommends for pairwise comparisons after a within-subject omnibus (Maxwell 1980), which the code does not do (ST-28); it is also the source of the per-pair listwise deletion (ST-39).
- **Normality-diagnostic heuristics.** Shapiro–Wilk is used up to n = 5000 and D'Agostino K² above it; ties route away from Shapiro–Wilk. Both are defensible; the thresholds are not surfaced in the report, which is a wording gap only (the tests are diagnostics and are never used to select the inference method).

---

## 5. Regression and curve fitting

### 5.1 Linear models

OLS inference is correct: coefficient covariance uses the residual variance with `n − p` df, standard errors come from the inverse cross-product matrix, p-values use the Student t distribution with `n − p` df, and confidence/prediction intervals use the matching t critical value (`js/shared/regression.js:562-710`). The Python oracle compares coefficients, standard errors, t statistics, p-values and interval endpoints against NumPy/SciPy, so this path has genuine numerical backing.

Metrics are clearly labelled: `rmse` divides by `n` (a descriptive RMSE) while inference uses `SSE/(n − p)`. This is internally consistent, but users sometimes read RMSE as the residual standard error; the report should keep the distinction explicit.

### 5.2 Nonlinear models

Nonlinear least squares uses model-specific parameterisation, a bounded optimiser, and a numerical Jacobian. Standard errors come from the Gauss–Newton covariance with `SSE/(n − p)` and the t distribution; prediction intervals use the delta method plus residual variance. This is a standard asymptotic treatment. Risks that the code already handles or discloses:

- Separation/non-convergence in logistic and dose–response fits disables ordinary ML inference and draws a diagnostic curve instead (`js/shared/regression.js:1800-1835`, `js/components/scatter.js:18268`).
- Models requiring positive support refuse to fit rather than discarding values (advisor and `requirePositive`-style checks).
- IC50 standard errors use the delta method on the log-IC50 scale (`js/shared/regression.js:1662`).

Remaining limitation: asymptotic Wald intervals for nonlinear parameters and derived quantities (IC50, Vmax, etc.) can be badly skewed and are not profile-likelihood intervals. This is a documented limitation rather than an implementation error, but for a release it should be stated in the model report.

### 5.3 LOWESS

The implementation is a correct local-linear LOWESS: tricube weights, span-based nearest-neighbour bandwidth, two robustness iterations with the bisquare update and 6·MAD median residual scale. It is correctly labelled descriptive and refuses to provide intervals (`js/shared/scatterLowessModel.js:20-165`). The oracle reimplements the same algorithm independently and compares sampled predictions.

### 5.4 Deming / orthogonal

Deming uses an error-variance ratio (default 1) and orthogonal is its equal-error special case. The advisor warns that the ratio must be justified from measurement knowledge, not from the observed association (`js/components/scatter.js:20690`). This is the right caution; the UI should keep the ratio visible in the report rather than only in the settings.

### 5.5 Forecasts (Line)

The ARIMA path is a differenced autoregression (AR on differences), not a full ARIMA(p,d,q) with MA terms, and the advisor says so. Holt–Winters is additive and its intervals are explicitly described as approximate. Forecast variance uses the impulse-response sum for the integrated AR process, which is correct for the implemented model. The oracle validates both against independent Python implementations. The main omission is serial-dependence diagnostics on the residuals of ordinary line regressions (ST-31).

## 6. Correlation and Heatmap

Pearson correlation uses the exact t distribution with `n − 2` df. Heatmap Spearman uses the shared tie-aware exact/permutation test, and the pairwise p-value family is BH-corrected by default over the off-diagonal upper triangle. The complete-pair count is reported. This is a strong implementation.

Gaps:

- The Heatmap family includes unavailable cells as p = 1 (ST-35).
- The Fisher-z interval is used for Pearson and (via shared callers) can be used for Spearman output; the Fisher interval is a large-sample normal-theory interval and has poor coverage for 
  `\|r\|` near 1 or small n. The UI should mark it as approximate.
- The Heatmap's clustering uses 1 − r as a distance. This is a valid dissimilarity but is not a metric (it violates the triangle inequality), which matters for average/complete linkage interpretation. The code should state that it clusters on a dissimilarity, not a Euclidean distance.
- Automatic association selection in Scatter is model-driven (Pearson for linear, Spearman for nonlinear, none for smoothers) rather than data-driven. This is defensible as a default, but a nonlinear monotonic fit does not logically require a rank correlation; the policy is a presentation convention and should be described that way.

## 7. PCA / MDS / t-SNE / UMAP

Parallel analysis follows Horn's permutation scheme: each variable is permuted independently, the permuted matrix is decomposed, and the 95th percentile of each random eigenvalue is compared with the observed eigenvalue. This is a recognised conservative variant (Glorfeld). It is correctly disabled on matrices above the cell budget, with no silent fallback to Kaiser. Kaiser selection is restricted to standardized (correlation) PCA, which is the correct condition for the eigenvalue > 1 rule.

Strengths:

- The random seed is deterministic from matrix dimensions and iteration count, so saved results reproduce.
- `min(rows, cols)` components are compared; no spurious components are manufactured.
- Skipped parallel analysis is surfaced as unavailable rather than treated as “no components”.

Limitations to disclose:

- The number of permutations is a fixed default; the 95th-percentile criterion has Monte Carlo error and the report should state the number of permutations and that the rule is a heuristic.
- MDS stress is reported descriptively; no Shepard diagram or monotonicity check is part of the report.
- t-SNE/UMAP embeddings are inherently stochastic and distances between clusters are not interpretable; the report should say so explicitly if it does not already.

## 8. ROC / PR

Already detailed in the findings table. Summary of verified items:

- AUC equals the Mann–Whitney statistic, ties contribute 0.5, the exact p-value enumerates the null U distribution, and the asymptotic path uses the tie-corrected variance with continuity correction (`js/components/roc.js:4927-5030`).
- DeLong single-AUC variance and paired-AUC difference covariance are correct (`js/components/roc.js:4927-4975`, `5229-5298`).
- The paired bootstrap resamples within outcome class while keeping both scores of a subject together; the permutation test swaps scores within subject (`js/components/roc.js:5147-5226`).
- Threshold metrics and Wilson intervals are correct (`js/components/roc.js:5048-5100`).

Release concerns:

- Threshold selection on the same data as evaluation (ST-20). The report should label the selected cut-point and its metrics as apparent/optimistic.
- Single-AUC interval should be logit-transformed for coverage (ST-30).
- DeLong's test is known to be problematic for comparing nested models fitted and evaluated on the same data (Demler et al. 2012); the advisor mentions training-set optimism but not this specific case.

## 9. Histogram

### 9.1 What is right

- The continuous goodness-of-fit pipeline fits the selected family, computes the one-sample KS and Anderson–Darling statistics on the sorted sample, and then calibrates **both** p-values by parametric bootstrap that refits the parameters in every replicate (`js/shared/stats.js:1923-2002`). Refitting is what makes the calibration valid when μ/σ (or λ) are estimated; a plain asymptotic KS/AD p-value would be anti-conservative (the Lilliefors problem). This is the correct choice and it is the default.
- The bootstrap uses a seeded PRNG derived from the options, the replicate count is reported back (`iterations`), and the calibration label returned with the result says `parametric bootstrap with parameter refitting`.
- The statistic definitions match the standard EDF forms: `D = max(D⁺, D⁻)` and `A² = −n − (1/n)Σ(2i−1)[ln F(xᵢ) + ln(1−F(x_{n+1−i}))]` (`1410-1448`).
- Model comparison uses AICc on the same density scale for normal, lognormal and exponential, and the panel footnote says AICc differences are relative only.
- Support is enforced rather than coerced: lognormal refuses non-positive values and exponential refuses negative values.

### 9.2 Defects and limits

- **Bootstrap resolution (ST-09).** `p = (extreme + 1)/(valid + 1)` with B = 500 default: minimum p = 0.002, Monte Carlo SE ≈ 0.01 near p = 0.05. Honest but coarse for a report; B should be raised for final output and the resolution stated.
- **Analytic fallback branches (ST-06, ST-07, ST-33).** Not reachable from the UI, but they are public shared-API surface and one of them (exponential AD) is not a valid probability function. They should be deleted rather than repaired, because the bootstrap path already covers every case they serve.
- **Non-rejection is not evidence of fit.** The advisor says so; the stats panel should repeat it next to the decision text, since a “Fail to reject H₀” verdict is the single most misread output in this component.
- **No exact/discrete goodness-of-fit.** The component is continuous-only and says so; chi-square GOF for discrete data lives in Pie.

## 10. Pie / Proportion

- Contingency testing implements Pearson χ² and the likelihood-ratio G with the correct `(r−1)(c−1)` df, plus Cramér's V from the **Pearson** statistic even when G is displayed (`js/components/pie.js:3995-4115`). Using the Pearson statistic for V while reporting G is the standard convention and is internally consistent.
- Goodness-of-fit implements χ² and G on `(k−1)` df, requires expected counts to sum to the observed total, and rejects unscaled proportions with a message that says exactly that. This prevents the most common input error in this analysis.
- The advisor blocks every recommendation when expected counts are sparse, states that switching to G does not resolve sparsity, and does not fall back to an asymptotic test. That is the right behaviour (ST-21) but it leaves no route forward (ST-36).
- **Yates mismatch (ST-22).** Default-on, applied by the advisor's apply payload, absent from the advisor's own preview computation, and contrary to current guidance for 2×2 tables. This is the one place in the component where what the advisor describes and what the engine runs differ.
- Pairwise families use Holm at `family-wise α` with the comparison count shown; the overall homogeneity test is kept separate from the pairwise family and the advisor says so.
- No Fisher/Fisher–Freeman–Halton, no Monte Carlo exact calibration, and no Barnard-type unconditional test. For small 2×2 tables (the common case in this component) this is a real gap, not a cosmetic one.

## 11. Survival

### 11.1 What is right

- Kaplan–Meier is computed on distinct event times with `at risk` counting `time ≥ t` and `events` at `t`; censoring removes subjects after their time. Greenwood's variance is accumulated correctly.
- Confidence limits use the **log–log** transform (`exp(−exp(log(−log Ŝ) ± z·SE(log(−log Ŝ)))`), which is the recommended construction because it cannot leave (0, 1) and has better small-sample coverage than the plain Greenwood interval (`js/components/survival.js:3270-3285`).
- The log-rank test forms the observed-minus-expected vector at each event time with the hypergeometric variance, and finalizes with the full covariance quadratic form; pairwise comparisons correct for multiplicity and report the correction used.
- Gehan–Breslow–Wilcoxon uses the at-risk weight `nᵢ`; the trend test uses the 1-df score statistic with group-index scores (ST-42, verified).
- Cox is fitted by partial likelihood with **Efron** handling of ties, honors entry times, and reports HR with a Wald interval; unadjusted pairwise HR p-values carry an explicit warning.
- Schoenfeld residual–time correlations are labelled exploratory and explicitly disclaim being a formal Grambsch–Therneau test (`6746-6750`). That disclosure is unusually honest for this class of app.

### 11.2 Defects

- **Delayed entry (ST-14, P1).** KM, log-rank, Gehan and trend all build risk sets from the full group size and never add subjects at entry. With any entry > 0 the curves are biased (survival too low at early times) and every log-rank-based p-value is computed from the wrong risk sets, while the Cox model on the same table is correct. No warning is shown. This is the release blocker.
- **`truncated` flag hard-coded false (ST-15)** even when entry times are present, so any gating or text keyed to it misdescribes the fit.
- **EPV warning (ST-29)** counts events only, not estimated parameters, so it under-warns exactly when covariates are added.
- **Fixed 95% KM limits (ST-16)** while the component exposes an α for tests; the level is not printed.
- **No formal PH test (ST-43).** The exploratory residual correlation is not a substitute; a Grambsch–Therneau test (or a time-interaction term) is what a reader expects before trusting a Cox HR. Minimum acceptable release position: state in the report that PH was not tested.
- **Independent censoring (ST-17)** is assumed and not discussed in the report.

## 12. Venn / UpSet

- Overlap enrichment is a one-sided upper-tail hypergeometric test on a user-specified universe, evaluated in log space with stable binomial-coefficient terms and explicit underflow handling (`js/shared/stats.js:2064-2150`). Correct.
- The displayed family is Holm-adjusted with the family-wise α printed in the table note and in the methods text. Correct and transparent (ST-40 is only about the absence of an FDR option).
- Set sizes and overlap counts come from the drawn diagram and are validated before testing; the universe size is user-specified rather than assumed. This is the right input contract.
- GO/STRING enrichment is delegated to remote providers, and the returned `p_value` is displayed without saying which correction produced it (ST-41). The app cannot validate or recompute provider statistics, but it can and should label provenance.
- UpSet is a visualisation of the same overlap counts; no separate inference is claimed.

## 13. Test-suite audit

### 13.1 What the suite does well

- The Python oracle uses SciPy/statsmodels and independent implementations (`scripts/stats_oracle.py`), not the JavaScript code under test.
- Tolerances are tight (typically 1e-8 absolute / 1e-6 relative for exact quantities; 1e-5 for optimiser outputs).
- Several properties are tested metamorphically (row-order invariance, reversed-group sign, permutation invariance).
- The suite distinguishes exact vs Monte Carlo vs asymptotic calibration and asserts the selected method, not just a finite p-value.
- The stats lane passed locally: **8 suites, 52 tests, 273 s** on 2026-10-25.

### 13.2 Gaps and poorly designed checks

1. **Goodness-of-fit p-values are not validated (ST-34).** The oracle compares only the KS and AD statistics; the unit suite checks ranges, ordering, support rejection, and invalid-CDF handling — every assertion is one the implementation satisfies by construction or by any monotone transformation, so none of them would catch a wrong tail formula. This is the clearest test-design gap because the code does contain an invalid analytic branch.
2. **Oracle availability silently skips tests.** `testWithOracle = available ? test : test.skip`. The stats lane fails when Python is missing (good), but a plain `npm test` or a filtered Jest run will report skips rather than a hard failure. Skip counts must be governed explicitly.
3. **Existence checks masquerade as coverage.** e.g. `expect(typeof histHooks.computeAutoBinWidth).toBe('function')` (`stats.component.differential.edges.test.js:192-194`) and the LOWESS hook check (`stats.matrix.scatter.test.js:123`). These are smoke checks, not statistical validation.
4. **The oracle matrix is broad but shallow.** 52 oracle tests cover dozens of procedures. Several procedures have one curated dataset and no randomised or edge coverage; a procedure can be “covered” while a boundary case (all ties, constant group, single event, perfect separation) is untested in the oracle.
5. **Some tests preserve historical values.** “Integration contracts preserve historical values while requiring recalculation for changed algorithms” (docs) is good practice for archives, but it can also freeze a wrong number. Historical-value tests need an independent source for the value, not only a previously rendered report.
6. **No numerical assertion on CI coverage.** All tests check point estimates and intervals for specific datasets; none simulate to check nominal coverage. That is acceptable for a unit suite, but it means “95% CI” claims rest on the formula being correct, not on demonstrated coverage.
7. **Browser tests mostly verify presence/wiring, not statistics.** The e2e stats suites assert that panels appear, values are formatted, owner isolation holds, and reopened archives restore. Those are valuable, but they do not catch a numerically wrong p-value.
8. **The test inventory and scenario mapping is a separate gate** and was recently blocked by an unmapped unit suite (issue in `issues.txt`); this is process debt, not statistical risk.

### 13.3 Verdict on tests

The statistical *numerical* tests are above average for an application of this kind, and the oracle is genuinely independent. The suite is not yet strong enough to certify the untested formulas (AD/KS p-values), the assumptions-based guidance, or the survival delayed-entry paths. Passing 52 tests should not be reported as “statistics validated”.

### 13.4 Are the tests wrongly designed, or merely thin?

The distinction matters for the release decision, so it is stated explicitly:

- **Wrongly designed (should be rewritten):** (a) goodness-of-fit tests that assert only `0 ≤ p ≤ 1` and ordering — they pass for the invalid exponential branch and would pass for any monotone formula; (b) “contract” tests that compare the implementation with a previously rendered report rather than an independent value; (c) hook-existence assertions (`typeof fn === 'function'`) presented as coverage of a statistical capability.
- **Thin but sound:** the single-dataset oracle cases. They are correct oracles; they simply do not probe boundaries (all ties, zero variance, perfect separation, single event, n = 3). Adding boundary cases to the existing oracle is cheap and is the highest-value test work available.
- **Correctly designed and worth keeping:** the metamorphic properties (row-order invariance, group-reversal sign flip, permutation invariance), the method-selection assertions, and the exact-vs-Monte-Carlo-vs-asymptotic distinctions. These catch real regressions that value comparisons miss.
- **Process gap:** `testWithOracle = available ? test : test.skip` means a missing Python runtime turns statistical validation into silently skipped tests in any lane that does not pre-check the interpreter. The stats lane does check it; ad-hoc runs do not.

### 13.5 What this audit did **not** verify

Stated so that the release decision does not over-read this document:

- No coverage simulation was run for any confidence interval. “95% CI” claims here mean “the formula is the standard one”, not “coverage was demonstrated at nominal level”.
- Numerical results were recomputed by hand or against SciPy/statsmodels for representative cases only; the audit did not re-derive every estimator for every component.
- The survival delayed-entry defect was established by code reading of the risk-set construction, not by a failing test (no test covers it), so its fix needs a new regression test with a known delayed-entry dataset.
- Provider-side statistics (GO/STRING enrichment) were not validated; only their presentation was reviewed.
- Repeated-measures and mixed-model results were checked for correct error terms and df by inspection, not re-derived numerically for a mixed design.
- Browser/e2e statistical assertions were reviewed for what they actually assert, not re-run individually beyond the stats lane.

## 14. Guidance review (“Help me choose”)

### 14.1 Strengths

The advisors are the strongest part of the statistical surface:

- They ask about design (paired/repeated, independent, number of groups, binary outcome, measurement error) before recommending a method.
- They refuse to use normality or variance p-values as automatic selectors and say so in plain language.
- They require positive data for log models, distinguish geometric means from arithmetic means, and refuse to discard values.
- They warn that rank tests are not median tests, that non-significance is not equivalence, that post-hoc families must be defined, and that effect sizes and intervals belong in the report.
- Box recommends Welch by default for two independent groups, which matches current methodological guidance (Delacre et al. 2017; Ruxton 2006).
- Pie refuses to run an asymptotic test on sparse counts and explains why switching to G does not help.
- Survival warns about non-informative censoring, proportional hazards, unadjusted pairwise hazard-ratio p-values, and zero-event groups.

### 14.2 Guidance gaps to close before release

| Area | Gap | Recommendation |
| --- | --- | --- |
| Repeated measures | Sphericity/GG–HF is only in diagnostics, not in the recommendation; the two-way mixed model has no correction at all | Put the correction policy in the recommendation text and apply GG/HF to every within-subject effect with >1 df, including mixed models |
| Delayed entry | No advisor warning that KM/log-rank ignore entry times | Either implement entry-adjusted risk sets or block/warn the KM/log-rank comparison when any entry > 0; the Cox score test is the natural delayed-entry log-rank |
| Cox EPV | Warning uses total events only | Count estimated parameters (including interaction and categorical df) and warn on events per parameter |
| ROC thresholds | No statement that the chosen cut-point is data-selected | Label threshold metrics as apparent; point to AUC as the threshold-free summary |
| Line/time series | No serial-dependence warning for ordinary correlation/regression | Add a caution when X is a time index or observations are ordered |
| Equivalence | No TOST route | Add an equivalence analysis (or state clearly that the app cannot support a “no meaningful difference” claim) |
| Sparse proportions | Only asymptotic chi-square/G | Add Fisher/Fisher–Freeman–Halton or Monte Carlo exact calibration |
| Multiplicity | Good in Box/Heatmap, but some per-panel statistics are unadjusted and only footnoted | Audit every multi-comparison panel; make the family and adjustment visible next to the p-values |

### 14.3 Wording/accuracy notes

- “Prism compares…” / “Prism switches…” appears in Box advisor rationale. Referencing another product is not wrong, but the recommendation should stand on the method, not on vendor behaviour.
- “Spline … without overfitting” (Line) should become “can fit flexible trends; check for overfitting in small series”.
- “Automatic (recommended)” association in Scatter should explain that the automatic choice follows the fitted model family, not the data distribution.

## 15. Release recommendation

### 15.1 Must fix before release (P1)

1. **ST-14 Delayed entry.** Kaplan–Meier and log-rank/Gehan/trend must either honour entry times or refuse to run when any entry time is > 0. The current combination of a valid Cox fit and an invalid KM/log-rank on the same data is the only confirmed defect that can silently produce a wrong inferential result on valid input. Fixing it also requires a regression test with a known delayed-entry dataset (entry > 0 for part of a group), because no existing test covers it.

### 15.2 Should fix before release (P2)

1. **Sphericity policy for mixed/repeated models (ST-28).** Apply GG/HF to every within-subject effect with >1 df; report epsilon and corrected df. Add Mauchly only as a diagnostic, never as the selector.
2. **Cox EPV warning (ST-29).** Count parameters, not events.
3. **Goodness-of-fit p-value tests (ST-34) and analytic formulas (ST-06, ST-33).** Remove or correct the exponential AD branch; add an oracle comparison for KS/AD p-values against SciPy/R with fixed and estimated parameters; or delete the unused analytic path.
4. **Single-AUC interval (ST-30).** Use a logit-transformed DeLong interval for a single AUC; keep the paired difference on the difference scale. Keep the 95% level consistent with the user's CI setting.
5. **Threshold-selection optimism (ST-20).** Label apparent threshold metrics; report AUC as the threshold-free primary summary.
6. **Yates/model mismatch in Pie (ST-22).** Make the applied correction visible and consistent with the advisor, and add an exact/Monte Carlo route for sparse tables (ST-36).
7. **Equivalence analysis (ST-37).** At minimum, state that the application cannot support an equivalence claim; ideally add TOST for the two-group and paired cases.
8. **Serial-dependence caution in Line (ST-31).**
9. **No proportional-hazards test (ST-43).** Report that PH was not tested, or add a Grambsch–Therneau test / time-interaction term; an untested Cox HR should not be presented as a validated effect estimate.
10. **Yates default (ST-22)** should be off by default for 2×2 (or replaced by an exact/Monte Carlo route), and whatever is applied must appear in the advisor summary, not only in a footnote.

### 15.3 Can ship with documentation (P3)

- AD critical-value extrapolation (ST-07), latent invalid AD exponential branch (ST-06), normal-approximation erf accuracy (ST-04), degenerate zero-variance convention (ST-02), Monte Carlo p-value conventions (ST-11), Fisher-z clamp (ST-05), heatmap family inflation (ST-35), correction-default mismatch (ST-38), spline wording (ST-32), Prism references, pairwise listwise deletion (ST-39), Holm-only overlap family (ST-40), and unlabelled GO/STRING correction provenance (ST-41) should be documented and, where cheap, normalised.

### 15.4 Certification language

The current implementation supports the claim that **the tested numerical procedures agree with independent SciPy/statsmodels implementations on the curated and randomised cases in the suite** (8 suites / 52 tests passing on 2026-10-25). It does **not** yet support “all statistics are validated”, “confidence intervals have nominal coverage”, “the tests are adequate for release”, or “the application implements current best practice everywhere”. The items in 11.1–11.2 are the gap between those statements.

---

## Appendix A — Procedures checked and verdicts

| Procedure | Verdict | Notes |
| --- | --- | --- |
| Welch t | correct | Welch df used for CI |
| Student pooled t | correct | offered as an option; Welch is the advisor default |
| Paired t | correct | dz effect size |
| One-sample t | correct | |
| Ratio t | correct | paired log ratios |
| Lognormal t / Welch | correct | geometric mean ratio, back-transformed CI |
| Mann–Whitney | correct | exact/permutation/asymptotic, ties |
| Wilcoxon signed-rank | correct | zeros excluded, midranks |
| Two-sample KS | correct | permutation calibration, tie-aware |
| One-way ANOVA | correct | balanced/unbalanced SS via group means |
| Welch ANOVA | correct | Welch (1951) |
| Kruskal–Wallis | correct | tie correction, epsilon² |
| Friedman | correct | tie correction, exact/MC, Kendall's W |
| Repeated-measures ANOVA | partly correct | GG/HF present; no Mauchly diagnostic; listwise deletion |
| Two-way ANOVA | correct | balanced only, pooled error |
| Two-way mixed | incomplete | no GG/HF for >2 within levels |
| Nested repeated two-way | correct | checked against statsmodels; two conditions only |
| Three-way ANOVA | correct but restricted | highest-order interaction as error; documented |
| Tukey–Kramer | correct | studentized range, unequal n |
| Games–Howell | correct | Welch df per pair |
| Dunn | correct | pooled ranks, tie correction; correction applied by pipeline |
| Nemenyi | correct | studentized range on mean ranks; exact/MC variant |
| Dunnett | correct | correlated multivariate-t, simultaneous CI |
| Dunnett T3 | approximate | studentized maximum modulus, Welch df; documented approximation |
| Tamhane T2 | labelled approximation | pairwise Welch + Šidák; documented |
| ANOVA-pooled contrasts | correct | nominal CI only; labelled |
| Brown–Forsythe | correct | median-based Levene |
| Bartlett | correct | |
| Shapiro–Wilk | correct | AS R94; n ≤ 5000 flagged |
| D'Agostino K² | correct | n ≥ 8 |
| Grubbs | correct | single outlier, two-sided |
| ROUT | correct | constant-location specialisation, documented |
| MAD+BH flags | heuristic | correctly described as heuristic |
| AICc normal vs lognormal | correct | same-scale densities |
| Linear trend | correct | OLS on group index |
| Effect sizes | correct | d, g, dz, rank-biserial, CLES |
| Hypergeometric | correct | log-space tail, underflow handling |
| Multiple testing | correct | all eight methods |
| Pearson/Spearman | correct | tie-aware, exact/permutation |
| Regression (linear/nonlinear) | correct | asymptotic Wald inference; no profile intervals |
| LOWESS | correct | robustness iterations present |
| Deming/orthogonal | correct | error ratio must be justified |
| ARIMA/Holt–Winters | correct for the implemented models | not full ARIMA; intervals approximate |
| ROC AUC / DeLong / PR | correct | see P2 items |
| Kaplan–Meier | correct without delayed entry | **wrong with delayed entry** |
| Log-rank/Gehan/trend | correct without delayed entry | **wrong with delayed entry** |
| Cox (Efron, delayed entry) | correct | verified against PHReg; EPV warning needs work |
| Chi-square GOF/homogeneity | correct | no exact test for sparse tables |
| PCA parallel analysis | correct | 95th percentile variant, deterministic seed |
| Log-rank trend | correct | 1-df score statistic, group-index scores |
| KM log–log CI | correct | level fixed at 95% (ST-16) |
| Venn hypergeometric overlap | correct | log-space tail, underflow handled |
| Venn overlap correction | correct but Holm-only | no FDR option (ST-40) |
| GO/STRING enrichment | provider-side | g:SCS default; provenance not labelled (ST-41) |
| Cox PH diagnostics | incomplete | exploratory only, no formal test (ST-43) |

## Appendix B — Primary sources consulted

- Delacre M, Lakens D, Leys C. Why psychologists should by default use Welch's t-test instead of Student's t-test. *Int Rev Soc Psychol.* 2017;30(1):92–101. https://rips-irsp.com/articles/10.5334/irsp.82 (correction 2022: https://rips-irsp.com/articles/10.5334/irsp.661)
- Ruxton GD. The unequal variance t-test is an underused alternative to Student's t-test and the Mann–Whitney U test. *Behav Ecol.* 2006;17(4):688–690. https://doi.org/10.1093/beheco/ark016
- Rochon J, Gondan M, Kieser M. To test or not to test: preliminary assessment of normality when comparing two independent samples. *BMC Med Res Methodol.* 2012;12:81. https://doi.org/10.1186/1471-2288-12-81
- Hart A. Mann–Whitney test is not just a test of medians. *BMJ.* 2001;323:391–393. https://doi.org/10.1136/bmj.323.7309.391
- Haviland MG. Yates's correction for continuity and the analysis of 2×2 contingency tables. *Stat Med.* 1990;9:363–367. https://doi.org/10.1002/sim.4780090403
- Campbell I. Chi-squared and Fisher–Irwin tests of two-by-two tables with small sample recommendations. *Stat Med.* 2007;26:3661–3675. https://doi.org/10.1002/sim.2832
- Lang TA, Altman DG. SAMPL guidelines. *Int J Nurs Stud.* 2015;52:5–9. https://doi.org/10.1016/j.ijnurstu.2014.09.006
- Greenland S, Senn SJ, Rothman KJ, et al. Statistical tests, P values, confidence intervals, and power: a guide to misinterpretations. *Eur J Epidemiol.* 2016;31:337–350. https://doi.org/10.1007/s10654-016-0149-3
- R `survival` documentation: `Surv` (counting-process intervals), `survfit`, `survdiff`, `coxph`. https://stat.ethz.ch/R-manual/R-devel/library/survival/html/Surv.html ; https://stat.ethz.ch/R-manual/R-devel/library/survival/html/survdiff.html
- Kim S, et al. Left truncation in survival analysis. *Biom J.* 2017. https://pmc.ncbi.nlm.nih.gov/articles/PMC7039372/
- Sondhi A. Adjusting for dependent truncation. *Pharm Stat.* 2022;21:895–906. https://doi.org/10.1002/pst.2202
- statsmodels `PHReg` (entry times). https://www.statsmodels.org/stable/generated/statsmodels.duration.hazard_regression.PHReg.html
- Stephens MA. Tests based on EDF statistics. In: D'Agostino RB, Stephens MA, eds. *Goodness-of-Fit Techniques.* Marcel Dekker; 1986 (Table 4.9, normality approximation; exponential tables).
- R `nortest::ad.test` documentation and source. https://cran.r-project.org/web/packages/nortest/refman/nortest.html
- SciPy `stats.anderson` (distribution-specific critical values). https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.anderson.html
- R `goftest` (estimated-parameter calibration). https://cran.r-project.org/web/packages/goftest/refman/goftest.html
- DeLong ER, DeLong DM, Clarke-Pearson DL. Comparing the areas under two or more correlated ROC curves: a nonparametric approach. *Biometrics.* 1988;44:837–845. https://doi.org/10.2307/2531595
- Qin G, Hotilovac L. Comparison of non-parametric confidence intervals for the area under the ROC curve of a continuous-scale diagnostic test. *Stat Methods Med Res.* 2008;17:207–221. https://doi.org/10.1177/0962280207087173
- Kottas M, Kuss O, Zapf A. A modified Wald interval for the area under the ROC curve. *Biom J.* 2014. https://pmc.ncbi.nlm.nih.gov/articles/PMC3938139/
- Demler OV, Pencina MJ, D'Agostino RB. Misuse of DeLong test to compare AUCs for nested models. *Stat Med.* 2012;31:2577–2587. https://doi.org/10.1002/sim.5328
- Leeflang MMG, et al. Bias in sensitivity and specificity caused by data-driven selection of optimal cutoff values. *Clin Chem.* 2008;54:729–737. https://doi.org/10.1373/clinchem.2007.092734
- Polley MYC, Dignam JJ. Statistical considerations in the evaluation of cut-points. *Clin Cancer Res.* 2021. https://pmc.ncbi.nlm.nih.gov/articles/PMC8844257/
- Blanca MJ, et al. The performance of the Greenhouse–Geisser and Huynh–Feldt corrections. *Psicothema.* 2023. https://pmc.ncbi.nlm.nih.gov/articles/PMC10499170/
- Maxwell SE. Pairwise multiple comparisons in repeated measures designs. *J Educ Stat.* 1980;5:269–287. https://doi.org/10.3102/10769986005003269
- Park E, Cho M, Ki CS. Correct use of repeated measures analysis of variance. *Korean J Lab Med.* 2009;29:1–9. https://doi.org/10.3343/kjlm.2009.29.1.1
- Peduzzi P, Concato J, Feinstein AR, Holford TR. Importance of events per independent variable in proportional hazards regression. *J Clin Epidemiol.* 1995;48:1503–1510. https://pubmed.ncbi.nlm.nih.gov/8543964/
- Vittinghoff E, McCulloch CE. Relaxing the rule of ten events per variable in logistic and Cox regression. *Am J Epidemiol.* 2007;165:710–718. https://doi.org/10.1093/aje/kwk052
- Ogundimu EO, Altman DG, Collins GS. Adequate sample size for developing prediction models is not simply related to events per variable. *J Clin Epidemiol.* 2016;76:175–182. https://doi.org/10.1016/j.jclinepi.2016.02.031
- Walker E, Nowacki AS. Understanding equivalence and noninferiority testing. *J Gen Intern Med.* 2011;26:192–196. https://doi.org/10.1007/s11606-010-1513-8
- Lakens D. Equivalence tests: a practical primer. *Soc Psychol Personal Sci.* 2017;8:355–362. https://doi.org/10.1177/1948550617697177
- Mehta CR, Patel NR. A network algorithm for Fisher's exact test in r×c contingency tables. *JASA.* 1983;78:427–434. https://doi.org/10.1080/01621459.1983.10477989
- R `fisher.test` documentation (Monte Carlo conditional exact test). https://stat.ethz.ch/R-manual/R-devel/library/stats/html/fisher.test.html
- Grambsch PM, Therneau TM. Proportional hazards tests and diagnostics based on weighted residuals. *Biometrika.* 1994;81(3):515–526. https://doi.org/10.1093/biomet/81.3.515
- Klein JP, Moeschberger ML. *Survival Analysis: Techniques for Censored and Truncated Data.* 2nd ed. Springer; 2003 (log–log transformation of the KM survival interval; Greenwood variance).
- g:Profiler API documentation, `correction_method` — “Default 'g_SCS'. Other options are 'bonferroni' and 'fdr'.” https://biit.cs.ut.ee/gprofiler/page/apis
- Reimand J, Kull M, Peterson H, Hansen J, Vilo J. g:Profiler—a web server for functional interpretation of gene lists (2016 update). *Nucleic Acids Res.* 2016;44(W1):W83–W89. https://doi.org/10.1093/nar/gkw199
- Raudvere U, Kolberg L, Kuzmin I, et al. g:Profiler: a web server for functional enrichment analysis and conversions of gene lists (2019 update). *Nucleic Acids Res.* 2019;47(W1):W191–W198. https://doi.org/10.1093/nar/gkz369
- Stephens MA. EDF statistics for goodness of fit and some comparisons. *JASA.* 1974;69:730–737. https://doi.org/10.1080/01621459.1974.10480196
- Lilliefors HW. On the Kolmogorov–Smirnov test for normality with mean and variance unknown. *JASA.* 1967;62:399–402. https://doi.org/10.1080/01621459.1967.10482916

## Appendix C — Commands run and recomputations

- `npm run test:stats` → Python runtime check passed; **8 suites / 52 tests passed** in 273 s (2026-10-25); lane scripts only the eight `statistical-oracle` suites (ST-44).
- `grep parametersEstimated` across `js/` → only `hist.js:6685` and `stats.js:1947` set it, both to `true` by default; no caller passes `false`, which fixes the reachability of ST-06.
- `grep yatesCorrection` across `pie.js` → defaults `true` (254, 281), advisor context `false` (3596, 3606), apply payload `true` (3736), panel footnote (4696), confirming ST-22.
- `grep correction_method` / reading `js/shared/goAnalysis.js:8` → requests go to `https://biit.cs.ut.ee/gprofiler/api/gost/profile/` with no correction override; g:Profiler documents `g_SCS` as the default, which fixes ST-41 as a labelling defect rather than an invalid p-value.
- Code trace of `inferPostHocAnalysisId` / `resolvePostHocProcedure` (`boxStatsModel.js:1259-1400`) → auto mapping verified: classic → Tukey, Welch → Games–Howell, nonparametric/paired → standard pair-specific tests.
- Code trace of `finalizeSurvivalQuadraticTest` (`survival.js:3501-3555`) → 1-df trend score statistic verified.
- Code trace of the KM interval (`survival.js:3270-3285`) → log–log transform with Greenwood SE verified.
- Independent Python check of the AD normal piecewise approximation against SciPy's A² and R `nortest`'s adjustment: SciPy A² = 0.12307; R-style A* = 0.13507 (p = 0.9789), code-style A* = 0.14153 (p = 0.9728). Difference small; both monotone.
- Code inspection of all statistical modules listed in section 1 of `docs/statistical-validation-framework.md`.

## 14. Independent scholarly review and implementation disposition — 2026-10-25

This review adds peer-reviewed statistical sources only. It checked the disputed claims against the cited papers and the implementation changes in the current worktree. Source links below are journal or PubMed Central records.

### Corrections to the original audit

- **ST-14 bias direction:** ignoring delayed entry generally overestimates survival because participants are counted at risk before observation. The original text described “biasing survival probabilities” without stating direction; the issue entry's “biased” wording was underspecified. Delayed entry must be represented in the risk sets, and this correction still relies on independent (or appropriately conditional) entry. [Delayed-entry selection bias](https://pmc.ncbi.nlm.nih.gov/articles/PMC9190030/); [risk-set adjustment under independent left truncation](https://pmc.ncbi.nlm.nih.gov/articles/PMC9545094/).
- **ST-11 was not a defect:** Monte Carlo Mann–Whitney and signed-rank calculations already used `hits + 1` over `draws + 1`. `empiricalRankPValue` is used for complete enumerations and correctly does not add a Monte Carlo correction. The audit and issue entry confused these paths. Add-one Monte Carlo p-values are supported by Phipson & Smyth (2010), [Permutation P-values Should Never Be Zero](https://pubmed.ncbi.nlm.nih.gov/21044043/).
- **ST-21 understated the implementation gap:** the advisor blocked sparse asymptotic recommendations, but a manually selected asymptotic test could still run on sparse expected counts. The engine now refuses those calculations and offers automatic or explicit exact calibration.
- **ST-28 pooled-error claim was overstated:** paired t-tests are valid pair-specific contrasts when the paired observations are aligned; a pooled ANOVA error term is not a universal requirement. The source already aligns complete subject rows across contrasts. The row-random two-way repeated model did need effect-specific sphericity handling. A first attempt reused one Condition epsilon for the interaction; that is not valid for every repeated-measures effect, so it was removed. The completed implementation projects each tested Group, Condition, and Group × Condition effect into its own orthonormal contrast space and computes separate covariance, GG/HF epsilons, and corrected degrees of freedom. Repeated-measures sources describe corrections at the level of the tested effect ([Armstrong 2017](https://pubmed.ncbi.nlm.nih.gov/28726257/); [N-way repeated-measures implementation](https://pmc.ncbi.nlm.nih.gov/articles/PMC7315100/); [group-by-time interaction example](https://pmc.ncbi.nlm.nih.gov/articles/PMC12489589/)).
- **ST-39 was not a defect:** `preprocessStatsGroups` applies one complete-row alignment before paired contrasts; pairwise contrasts therefore share the same subject set.
- **ST-40 was not an inferential defect:** Holm adjustment controls family-wise error without assumptions about dependence among valid p-values. Offering BH/FDR as an alternative is a product choice, not a correctness requirement for a displayed overlap family. [Holm’s sequentially rejective procedure](https://doi.org/10.2307/4615733).
- **ST-22 guidance was too categorical:** the Yates/Fisher discussion is contested in the literature. The fix removes silent Yates correction from the default and advisor-apply path while retaining an explicit user option and reporting when it is applied. [Yates’s original discussion](https://academic.oup.com/jrsssa/article/147/3/426/7106245); [2024 review of 2×2 methods](https://doi.org/10.1111/2041-210X.14318).

### Confirmed corrections in source

- Survival now adds participants to KM, log-rank, weighted log-rank, trend, and Cox risk sets only after entry; rows with entry at or after exit are excluded. The report states the selected confidence level, independent-censoring assumption, and the independent-entry assumption when delayed entry is present. Invalid or missing event codes are now excluded and counted instead of silently being interpreted as censoring. Cox reports actual delayed-entry handling and a per-parameter event caution; the “10 per parameter” value is explicitly described as a rough heuristic, not a validity threshold. Cox proportional hazards remain untested, and the report says so.
- Survival and ROC intervals now use the selected confidence level. Single-AUC intervals use a range-preserving logit transformation when the estimate is interior; boundary AUC intervals are unavailable. This is consistent with the coverage motivation in Kottas et al. ([2014](https://pmc.ncbi.nlm.nih.gov/articles/PMC3938139/)). Paired DeLong difference intervals use the selected level, and the restriction for nested models evaluated on their development sample is stated beside ROC comparison controls and in reports. The restriction follows Demler et al. ([2013](https://pmc.ncbi.nlm.nih.gov/articles/PMC3684152/)); it should not be generalized to every non-nested comparison.
- ROC threshold-selected metrics are explicitly described as apparent estimates measured on the same sample used to choose the cutoff.
- Pie defaults Yates correction off, aligns advisor context and applied settings, adds a conditional Fisher–Freeman–Halton route for sparse homogeneity tables and an exact multinomial Pearson-tail route for sparse goodness-of-fit, and refuses sparse asymptotic calculations. Exact enumeration is bounded by table and search limits; two-sided conditional exact p-values can be conservative due to discreteness ([RxC study](https://doi.org/10.1080/27658449.2021.1934959)). These are exact null-calibration routes for integer counts; they do not remove the need for independent observations and a correctly specified fixed expected distribution.
- Goodness-of-fit no longer exposes the mismatched analytic KS/AD approximations. Estimated- and fixed-parameter paths use parametric-bootstrap calibration with the add-one p-value, report Monte Carlo standard errors, and default to 5,000 simulations. Histogram cache and analysis signatures were versioned so a prior 500-replicate cache cannot masquerade as a 5,000-replicate result. The Histogram advisor now states the resolution and relative-only interpretation of AICc comparisons.
- Box's missing-correction fallback now matches its Holm UI default; zero-variance t-test results are unavailable rather than presented as p = 0 with a zero-width interval. Heatmap excludes untestable cells from its adjustment family and clears stale adjusted values. The one-way repeated-measures report retains its GG/HF corrections, now using the same shared, numerically stabilized contrast-space estimator. Its zero-within-subject-error case now returns unavailable inference instead of treating a zero denominator as p = 0. The row-random two-way model calculates effect-specific GG and HF corrections; GG corrected p-values are primary and HF values are supplementary. Both result tables render in the grouped Box results panel. Zero within-subject error makes each effect's inference explicitly unavailable. No formal sphericity test is performed.
- The ROC comparison controls now carry the nested-model DeLong caveat. Line guidance now warns that time-ordered/serially dependent observations violate the ordinary correlation/regression independence assumption; spline guidance no longer promises freedom from overfit.
- g:Profiler requests now explicitly specify `g_SCS`, and GO results label the provider-corrected value as g:SCS-adjusted; STRING output labels its FDR values as provider output. g:SCS is a distinct correction, not an FDR procedure ([Raudvere et al. 2019](https://doi.org/10.1093/nar/gkz369)).

### New source finding

- **ST-45 — Survival event coding:** the prior loader treated every event value other than numeric `1` as censoring, including missing, malformed, or out-of-range values. That can turn data-entry errors into false censored observations. The loader now requires an event code of `1` or `0`, excludes invalid rows, counts them, and discloses the exclusion in the report. The survival data structure itself defines event status separately from censoring; the left-truncation literature also formulates the event indicator as binary ([Sondhi 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9545094/)).
- **ST-46 — Survival result migration after row exclusions:** an older saved statistics result could be upgraded to the new analysis signature whenever the remaining parsed rows had zero entry times. That incorrectly reused a result calculated before invalid entry/outcome rows were excluded. Legacy result migration now requires zero invalid entry and outcome rows.
- **ST-47 — Resolved: effect-specific sphericity for the row-random two-way repeated model.** Each Group, Condition, and Group × Condition effect has its own orthonormal contrast projection, subject covariance, GG/HF epsilon, corrected degrees of freedom, and p-values. GG is the primary inference; HF and uncorrected results are labelled references. The shared model records the result contract and method version, and legacy cached results are marked stale on restore. The grouped renderer now projects both the primary ANOVA table and correction-detail table. A deterministic raw-data fixture is checked against independent NumPy eigenvalue projections and SciPy F tails; statsmodels independently checks the uncorrected sums of squares, F values, and degrees of freedom. Focused Chromium coverage calculates through the visible control, checks all correction labels, and confirms report/table parity after archive reopen. Effect-specific corrections are needed because distinct within-subject effects use distinct contrast spaces ([N-way repeated-measures ANOVA](https://pmc.ncbi.nlm.nih.gov/articles/PMC7315100/); [repeated-measures interaction correction](https://pmc.ncbi.nlm.nih.gov/articles/PMC12489589/)). The GG estimator and HF adjustment follow published repeated-measures methods ([Greenhouse & Geisser 1959](https://doi.org/10.1007/BF02289823); [Huynh & Feldt 1976](https://doi.org/10.3102/10769986001001069)).
- **ST-48 — Risk-set tolerance excluded valid near-time entrants:** the parser accepted any `entry < exit`, but KM/log-rank/Cox used `entry < event time - 1e-9`; those same valid subjects could be omitted from the risk set while their event was counted. Near-but-distinct event times were also merged in KM. Risk sets now use the strict mathematical entry/exit comparisons and KM groups only exactly equal event times. Left-truncated risk sets are defined by `entry < event time <= exit time` ([left-truncated Cox risk sets](https://pmc.ncbi.nlm.nih.gov/articles/PMC9290657/)).
- **ST-49 — Resolved: one-way repeated-measures ANOVA had degenerate and scale-dependent error handling.** With zero within-subject error, code returned infinite F and p = 0 despite having no estimable residual variance. Its fixed absolute `1e-10` cleanup threshold also classified valid, rescaled data as zero-error. The calculation now centers and normalizes the complete design, computes condition and residual sums of squares directly in normalized coordinates, uses a scale-relative round-off bound for true zero error, and restores descriptive sums of squares only when representable. For a genuinely zero error term, dfs and descriptive sums remain while F/p and GG/HF corrections are unavailable. This follows the repeated-measures ANOVA error-term definition and avoids claiming a sampling probability without an estimable residual variance ([repeated-measures ANOVA error partition and F ratio](https://pmc.ncbi.nlm.nih.gov/articles/PMC11706242/); [repeated-measures F tests and covariance assumptions](https://pmc.ncbi.nlm.nih.gov/articles/PMC10499170/)).

### Remaining scope

- **Formal Cox proportional-hazards test (ST-43):** the report now clearly labels the current Schoenfeld residual-time summaries as exploratory and states that no formal test was performed. A valid Grambsch–Therneau test needs model-level weighted-residual score statistics and their covariance, plus a tested result contract and report integration; this is a larger Cox-engine extension, not a safe wording-only substitute. [Grambsch & Therneau 1994](https://doi.org/10.1093/biomet/81.3.515).
- **Equivalence/non-inferiority (ST-37):** Box reports now state that equivalence was not tested and that failure to reject a difference does not establish equivalence. A supported TOST workflow still needs pre-specified, owner-persisted equivalence margins and matching independent/paired estimators and reports; this is a shared inference feature. TOST requires justified bounds rather than interpreting a non-significant difference test as equivalence ([Lakens 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5502906/)).
- **Goodness-of-fit p-value oracle (ST-34):** the independent differential suite compares KS/AD statistics rather than pinning bootstrap p-values to an independently calibrated reference. A numerical p-value oracle remains open.
No claim of full statistical release certification is made. The ST-47 implementation has focused numerical, worker-parity, persistence, tab-isolation, advisor, and figure-summary coverage; the full statistical lane was not rerun as part of this refactor. Remaining work above includes broader statistical-engine features and an independent goodness-of-fit p-value oracle gap.

### ST-47 implementation verification

- The independent Box oracle fixture checks all three effects in asymmetric 2 × 3 and 3 × 2 designs, including raw SS/F/df, GG/HF epsilon and corrected p-values; zero-error inputs return unavailable inference. A separate nondegenerate one-way repeated-measures oracle check uses SciPy covariance eigenvalues to guard parity of the shared helper; a degenerate one-way fixture checks the unavailable-inference contract.
- Targeted passes: Box statistical-oracle matrix (22 tests); Box stats model (74 tests); advisor (29 tests); worker parity (30 tests); full figure-summary reporting matrix (25 tests); current/legacy restore and same-type-tab isolation (1 test); Box row-random rendered calculation plus archive reopen (Chromium 1/1); Box delayed-worker owner completion (Chromium 1/1). The shared Chromium same-type tab-isolation contract passed 11/11. In the 11-component persistence matrix, Box and nine other components passed; Survival alone failed an exact `meta.graphSizing.display.widthPx` DOM comparison after reopen.
- The independent implementation uses Python 3.12.10, NumPy 2.4.4, SciPy 1.17.1, and statsmodels 0.14.6. `Rscript` was unavailable, so no afex/car cross-check is claimed. The final Box oracle rerun after the one-way scale-stability change passed (22/22); Box model, report-matrix, owner-restore, inventory, syntax, Python compilation, and targeted ESLint checks also passed. The full statistics lane was not rerun. The unrelated Survival display-width reopen discrepancy reproduced in the standard and isolated Chromium case and is recorded as a separate P3 in `issues.txt`; the ownership batch is not a complete release certification.

## 15. Final statistics issue review and verification — 2026-10-25

This section is the current status. It supersedes the original audit's open/closed labels and the interim “Remaining scope” text in §14.

### Findings and regressions resolved

- **ST-14/15/16/17/29 — Survival risk sets, reporting, and model guidance.** Delayed-entry KM and log-rank-family calculations use `entry < event time <= exit time`; the Cox fit uses left-truncated risk sets and now reports whether delayed entry is present. Invalid entry/outcome rows are excluded and disclosed; blank rows are not counted as observations. Selected confidence levels are used and reported. The report documents independent censoring and the independent-entry assumption, and the Cox caution counts fitted coefficient parameters while identifying ten events per parameter as a rough heuristic. Survival integration and independent delayed-entry Cox checks pass.
- **ST-43 — Formal proportional-hazards check.** A converged, non-regularized Cox fit now gets a global and per-coefficient Efron partial-likelihood efficient score test for rank-transformed event-time interactions. Singular or unsupported fits return an explicit unavailable reason. The global result and Holm-adjusted term tests render in the Cox panel and persist with the model. The chosen rank-time alternative is identified and the report cautions that a non-significant result does not prove proportional hazards. This is a formal score-test route consistent with the weighted score-test family described by Grambsch and Therneau ([1994](https://doi.org/10.1093/biomet/81.3.515)); it is not presented as an omnibus test against every possible time-varying effect.
- **ST-34 — Goodness-of-fit p-value oracle.** The statistical differential suite independently simulates from fitted normal, lognormal, and exponential models in NumPy/SciPy, refits each replicate when parameters were estimated, and compares KS/AD bootstrap p-values within their combined Monte Carlo uncertainty and finite-simulation resolution. The JavaScript uses add-one bootstrap p-values and reports Monte Carlo standard errors. The current default uses 5,000 simulations. Refitting is essential when parameters are estimated; classic EDF results document that the null calibration changes when distribution parameters are estimated ([Lilliefors 1967](https://doi.org/10.1080/01621459.1967.10482916); [Stephens 1974](https://doi.org/10.1080/01621459.1974.10480196)). Invalid fitted CDFs now stop before resampling and return unavailable inference.
- **ST-44 — Statistics test-lane coverage.** The `stats` lane runs eight statistical-oracle suites and six shared-statistics unit suites; its final run passed all 14 suites and 120 tests.
- **ST-30/ROC interval oracle.** Single-AUC intervals use the documented range-preserving logit transformation when estimable; the independent Python reference now checks that interval. Boundary AUCs or unavailable variance produce an unavailable interval rather than a clipped Wald interval. The selected confidence level remains part of the analysis signature and report.
- **ST-46/ST-50 — Survival row filtering and result migration.** A fully blank row is not an observation and no longer increments invalid-outcome counts, which had blocked safe saved-result migration. Malformed populated rows continue to be counted and excluded. A focused regression confirms saved raw pairwise results migrate and remain available after a correction change.
- **Persistence and layout verification.** Pie schema-v2/v3 stats restoration has a legacy-fixture regression. Box significance geometry after toggling the Y log scale passes in Chromium. The Box stats/tab-isolation integration suite passes 13/13 after giving its two-tab calculation case a 60-second budget based on its observed runtime; all settled-state and ownership assertions remain intact. The testing inventory now generates and checks 710 rows.
- **A previous unit expectation was stale.** The invalid-CDF goodness-of-fit case now returns the intended unavailable-p-value message before starting bootstrap work; it does not return p = 1.
- **ST-25 — Lognormal repeated-measures model (resolved).** The Box advisor now applies a dedicated three-or-more-condition model: it aligns complete subjects, requires every included value to be positive, analyzes natural-log outcomes, uses Greenhouse–Geisser corrected inference as primary and Huynh–Feldt as supplementary, and reports equality of geometric means with paired geometric-mean ratios. The report records the univariate covariance/sphericity method, complete-case count, nominal per-comparison intervals, p-value correction, assumptions, and limitations; owner-scoped settings/results survive archive reopen. This is intentionally not a general mixed-effects/covariance-structure model: incomplete subjects are excluded and counted, and the advisor directs users with missing measurements toward a mixed-effects engine. This matches expert guidance to express lognormal effects as ratios and use paired log-ratio tests ([Motulsky et al., 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC12163497/)), while making repeated-measure dependence, sphericity corrections, and complete-case limitations explicit ([Muhammad, 2023](https://jci.org/articles/view/171058)). Independent Python/SciPy coverage checks F, GG/HF epsilons and p-values, paired t statistics, ratio intervals, and Holm adjustment; focused unit, advisor, and Chromium save/reopen checks pass.

### Final validation run

- `npm run test:stats`: Python statistical-oracle runtime check passed; 8/8 statistical-oracle suites (57/57 tests) and 6/6 shared-statistics unit suites (63/63 tests) passed.
- `npx jest --runInBand __tests__/integration/survival.stats.test.js`: 8/8 passed.
- `npx jest --runInBand __tests__/integration/box.statsControls.tabIsolation.test.js`: 13/13 passed.
- Focused legacy Pie restore integration: 1/1 passed. Focused Box Y-log significance-geometry Chromium regression: 1/1 passed.
- After the full lane, added a single-positive ROC edge case to the independent matrix so unavailable DeLong variance is required to produce a missing interval; the affected matrix suite passed 1/1.
- `node scripts/generate-testing-inventory.cjs` and `node scripts/generate-testing-inventory.cjs --check`: passed, 710 rows.
- Node syntax checks on changed statistics modules/tests, Python compilation of `scripts/stats_oracle.py`, and `git diff --check` on touched files: passed.
- ST-25 focused validation: Box model unit tests 77/77, advisor tests 32/32, independent SciPy oracle case 1/1, and Chromium advisor/apply/calculate/archive-reopen regression 1/1 passed.

### Open product work

- **ST-37 — Equivalence and non-inferiority.** `Shared.stats.testMeanEquivalence` now provides paired and Welch-independent TOST calculations, a 1−2α interval, and independently checked input behavior. There is still no component-facing workflow, owner-persisted and justified margins, report route, or one-sided non-inferiority analysis. This needs a shared inference UI/state/report design. TOST requires prespecified bounds based on a smallest effect of interest; a nonsignificant difference test is not evidence of equivalence ([Lakens 2017](https://doi.org/10.1177/1948550617697177)).
- **Nonlinear-curve ROUT (issue `issues.txt` P3).** Current ROUT is for a constant location. Extending it to nonlinear curve fits needs a shared robust fitting boundary, model-specific parameter counts, convergence results, and independently calibrated residual screening. Applying the location detector to curve residuals would be an invalid shortcut.

The statistics lane, component integration checks, and browser regressions pass. They do not constitute full application release certification; the two open model/workflow capabilities above remain explicit product scope.
