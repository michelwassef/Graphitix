# Progress: Box row-random effect-specific sphericity

Completed scope: P1 ST-47 in `issues.txt` and the implementation disposition in section 14 of the statistics audit. The temporary execution plan has been retired after completion; this requested progress record remains as the implementation and verification log.

## Status

Implementation and focused verification are complete. The working tree contains unrelated user changes; they remain preserved. This progress file is retained because the user requested a second tracking file.

## Phase log

- Phase 0 — complete. Confirmed `rowRandomMixed` is a fully crossed within-subject Group × Condition design and `nestedRepeatedTwoWay` is a separate independent-subjects-within-group design. Production local/worker paths delegate to `Shared.boxStatsModel.computeBoxStatsModel`; the component-local row-random and incomplete-data GLS paths were reachable only through a test hook.
- Phase 1 — complete with a documented limit. Added a deterministic raw 3 × 3 fixture and reproducible SciPy/NumPy/statsmodels generator/reference operation. Runtime: Python 3.12.10, NumPy 2.4.4, SciPy 1.17.1, statsmodels 0.14.6. `statsmodels.AnovaRM` raw F/df match; NumPy eigenvalue GG/HF calculations and SciPy F tails independently reproduce corrected references. HF formula and boundaries were checked against Huynh & Feldt (1976). Rscript is unavailable, so no afex/car execution is claimed.
- Phase 2 — complete. Added one shared orthonormal effect-space projection/covariance implementation and reused its stable GG/HF estimator in one-way repeated measures. Added compensated sums, offset-aware means, scale normalization, finite JSON result contracts, explicit zero-error unavailability, theoretical epsilon bounds, rank-deficient support, and a one-million-cell covariance allocation limit (8 MB per effect; corrections explicitly unavailable above it).
- Phase 3 — complete. The shared model now returns one structured repeated-measures result, a GG-primary ANOVA table and a correction-detail table. Report fields, methods/results text, schema/version metadata, and figure-summary effects come from that result; methods/results arrays exactly back their joined text.
- Phase 4 — complete. Advisor/help text describes the fully crossed complete-subject model and GG/HF roles. Worker still delegates to the shared engine; worker parity passes. Timings (7-run median, warmed): 1000 subjects × 3 × 4 = 14.617 ms; 100 subjects × 6 × 6 = 3.786 ms. Existing 8000-value worker threshold sends the first workload to a worker and leaves the second local; no new scheduler was needed.
- Phase 5 — complete. Added `row-random-sphericity-v1` to Box statistics signatures and historical-version recognition. Restore validates the structured contract, preserves current results, marks old row-random results stale, clears incompatible deferred models, and persists the stale flag in payload state.
- Phase 6 — complete. Added independent fixture/oracle coverage, asymmetric 2 × 3 and 3 × 2 tests, scale/common-baseline invariance, N − 1 < d rank-deficient covariance and HF boundary cases, zero-error JSON safety, figure-summary p-value checks, worker parity, advisor alias checks, and current/legacy same-type-tab restore tests. Registered explicit scenario metadata and file mappings.
- Phase 7 — complete. Removed the proven-unused component-local row-random ANOVA, partial-data GLS engine and its private matrix routines after confirming the only live reference was the test hook. Tests now call the shared production model. `nestedRepeatedTwoWay` remains separate.
- Phase 8 — complete. Updated the audit, issue list, architecture contract, changelog, and explicit test scenarios. The final independent Box oracle, worker suite, Box model/advisor/report/persistence tests, rendered-results archive round trip, delayed-worker owner completion, same-type isolation, lint/syntax checks, and test inventory all pass. One unrelated Survival SVG display-width comparison fails in the standard 11-component persistence matrix; see the limitations below.

## Verification evidence

Initial failing evidence: `node .\\node_modules\\jest\\bin\\jest.js --runInBand --selectProjects statistical-oracle --runTestsByPath __tests__/statistical-oracle/stats.matrix.box.test.js --testNamePattern "row-random"` — 2 intended contract failures before the implementation, 20 unrelated tests skipped.

Passing evidence so far:

- Final Box statistical-oracle matrix: 22 tests passed, including the independent SciPy/statsmodels crossed-model reference, one-way GG/HF eigenvalue parity, zero-error behavior, and nested-design preservation.
- Final Box model: 74 tests passed, including rank-deficient/HF-boundary cases, one-way zero-error behavior, and scale/baseline invariance down to a 1e-100 scale.
- Box advisor: 29 tests passed, including aliases and the shared calculation entry point.
- Final Box worker suite: 30 tests passed, including row-random worker/shared parity.
- Full figure-summary reporting matrix: 25 tests passed, including GG-primary figure projection. Repaired its stale Histogram mock assertion to compare inferential values and owner-cache decisions instead of full cached and uncached objects.
- Current-result reopen, legacy-stale migration, and A→B→A same-type tab isolation: 1 targeted integration test passed.
- Real Chromium Box row-random calculation: correction detail table renders with GG, HF, and uncorrected labels; report and displayed results match after archive reopen (1/1).
- Delayed Box worker completion after switching to a sibling tab: inactive owner result is stored and materialized only on return (1/1).
- Standard Chromium ownership batch: all same-type tab-switching cases passed (11/11); 10/11 persistence cases passed, including Box. The Survival `meta.graphSizing.display.widthPx` DOM value drift after archive reopen reproduced in isolation and was added as a separate P3 issue; it is outside this Box refactor.
- Targeted ESLint, JS syntax, Python compilation, `git diff --check` on scoped files, and the generated 710-row testing inventory check passed.
- A first stress-test attempt used a `1e12` baseline; floating-point input quantization changed values at that magnitude. The fixture was reduced to a still-large `1e9` offset and its focused test passed. This is input representation precision, not a correction-specific threshold.
- The first row-random browser assertion caught a missing projection: grouped Box rendering showed only the primary ANOVA table and omitted the already-computed correction detail table. The grouped renderer now renders every table in the shared model; the rerun passed through actual archive save/reopen.
- The first one-way oracle assertion used a zero-error dataset with no estimable covariance. It was replaced by a valid nondegenerate numerical reference plus an explicit unavailable-inference contract. That exercise also exposed and fixed an absolute 1e-10 SS cutoff that had rejected valid small-scale data.
- `Rscript`/afex/car was unavailable, so no separate R corrected-ANOVA output is claimed. The independent NumPy/SciPy oracle and statsmodels raw ANOVA reference passed. `npm run test:stats` and full product release certification were not run.

## Finalization

- Retired-plan provenance was removed from the fixture generator and regenerated fixture; both now point to section 14 of the statistics audit. The audit header distinguishes the original HEAD snapshot (sections 1–13) from subsequent ST-47/ST-49 implementation verification (section 14).
- Regenerated `docs/development/testing-suite-inventory.csv` from the current scenario catalog and rechecked all 710 rows successfully.
- Re-ran the two focused row-random oracle tests against the regenerated fixture; both passed. Scoped `git diff --check` passed. No references to the retired execution-plan path remain.
