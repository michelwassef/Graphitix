# Graphitix Testing Infrastructure Audit

**Audit date:** 2026-07-31
**Audited baseline:** `graphitix-current-v11-final-professional-v2`
**Scope:** Jest configuration and setup, all `__tests__` test sources, all Playwright specifications and helpers, test runners, package scripts, documentation, and repository validation gates.

## Executive assessment

Graphitix has unusually broad regression coverage, especially around statistical behavior, AG Grid interactions, graph layout, tab switching, archive reopening, recovery, and heavy rendering. The problem is not lack of effort or lack of tests. The problem is that the suite grew reactively and now has too many overlapping sources of truth.

The current suite is capable of catching subtle regressions, but it is also vulnerable to four failure modes:

1. **A stale test can contradict the current architecture while looking authoritative.** This already occurred with recovery cache policy and runtime tab-ID rehoming.
2. **A test can pass for the wrong reason.** Generic payload mutation and internal UI fallbacks previously produced invalid Venn/ROC scenarios or bypassed the interface being tested.
3. **The full run can conceal flakiness.** The full runner retries failures and exits successfully when the retry passes.
4. **Coverage is difficult to reason about.** Generic contracts, component regressions, source-text assertions, and one-off diagnostic harnesses overlap without a requirement-to-test map.

The suite should be refactored, not merely expanded.

## Quantitative inventory

Static inventory of the supplied archive:

| Measure | Current value |
|---|---:|
| Test source files | 330 |
| Jest-style sources under `__tests__` | 182, including one Playwright `.spec.js` |
| Jest files matched by current configuration | 181 |
| Playwright specs under `e2e` | 148 |
| Approximate test-source lines | 81,563 |
| Statically detectable test declarations | about 1,740; dynamic matrices add more at runtime |
| `page.waitForTimeout(...)` calls | 324 across 95 Playwright specs |
| `setTimeout(...)` calls in test sources | 348 across 175 files |
| Largest Jest file | `hot.aggrid.clipboard-selection.test.js`, 5,654 lines |
| Largest shared E2E helper | `e2e/helpers/workspaceHarness.js`, 831 lines |
| Configured CI workflows | none in the supplied archive |
| Enforced coverage command | none |

The complete machine-readable inventory is in `docs/development/testing-suite-inventory.csv`.

## Confirmed structural defects

### 1. One test is silently outside the configured suite

`__tests__/heatmap.heavy-recovery-authoritative.spec.js` is Playwright code stored under `__tests__`. Jest only matches `**/__tests__/**/*.test.js`; Playwright only scans `e2e`. The file is therefore not part of the normal Jest or Playwright run. A newer E2E test with the same title exists under `e2e`, so the orphan should be deleted after confirming the E2E version is the maintained superset.

### 2. Coverage thresholds are dormant

`jest.config.js` declares global thresholds, but `npm test` runs `jest` without `--coverage`, and no `test:coverage` command exists. The thresholds do not protect the project during normal validation.

### 3. No executable CI gate is present

`AGENTS.md` identifies `.github/workflows` as an executable source of truth, but the supplied archive contains no workflow. Validation depends on manually selected commands and local discipline.

### 4. The full runner can normalize flakiness into success

`scripts/run-full-tests.ps1` reruns failed Jest tests in-band and failed Playwright tests with one worker. Tests that fail initially and pass on retry are reported as potentially flaky, but the script exits successfully when no failure remains after retry. This makes an unstable change eligible to pass the nominal full gate.

### 5. Playwright trace policy is ineffective for the configured run

`trace: 'on-first-retry'` is configured while `retries: 0`. The separate `--last-failed` invocation is a new run, not a Playwright retry of the original test. A useful trace is therefore not guaranteed for the original failure.

### 6. The Jest integration environment is global and expensive

Every integration test receives JSDOM and rewrites the complete `index.html` before every test. Pure algorithms, formatters, model tests, source-contract tests, and small service tests all pay for and inherit the same full DOM environment. Global AG Grid, jStat, SVD, canvas, image, and animation stubs further blur the distinction between unit and integration coverage.

### 7. The full-app Jest loader can drift from production bootstrap

`__tests__/setup/fullAppHarness.js` manually lists and requires more than forty modules in an exact order. This is a second bootstrap manifest alongside `index.html`. It can omit a new module, preserve a removed one, or initialize modules differently from the application.

### 8. E2E helpers mix incompatible responsibilities

`e2e/helpers/workspaceHarness.js` contains the component catalog, CDN interception, issue collection, component navigation, import helpers, readiness waits, broad UI exercise, and performance snapshots. It is effectively a second application control plane.

Most concerning, `openComponentFromWelcome` can fall back to invoking internal application functions if clicking the UI does not launch the component. That is acceptable for an API-level fixture, but not for an acceptance test intended to prove the Welcome UI works. A broken button can be bypassed and the test can still pass.

### 9. Fixed delays are widespread

The audit found 324 `waitForTimeout` calls in Playwright specs. Some are legitimate animation samples, but many are generic settling delays after activation, drawing, resizing, or recovery. These produce machine-dependent failures and encourage timeout inflation instead of settled-state assertions.

### 10. Contract tests frequently assert implementation text

The suite contains a large group of tests that read production source and assert exact function names, strings, code fragments, or the absence of particular expressions. Static scanning found roughly 300 substring/regular-expression assertions of this kind.

Examples include ownership contracts for Box/PCA/Scatter, Heatmap scheduling contracts, tick-length wiring, AG Grid paste internals, and statistics reporting markup. Some forbidden-pattern checks are valuable, but most should be runtime behavior tests or explicit AST/lint rules. Raw source text tests make harmless refactoring expensive while still failing to prove runtime behavior.

### 11. The persistence matrices can mutate the wrong semantic field

`component.persistence-matrix.spec.js` discovers and mutates payload leaves generically. The recent ROC and Venn failures demonstrated the risk: a generic numeric mutation can alter a class label or a derived count rather than an authoritative user parameter. Persistence tests need explicit component mutation adapters.

### 12. Component capability knowledge is duplicated

`COMPONENT_MATRIX` contains only type, page ID, and example button. Statistics capabilities, primary graph selectors, readiness, canvas behavior, external async behavior, expected archive sections, and mutation strategies are separately hard-coded in multiple specs. Missing coverage is therefore implicit rather than declared as supported or not applicable.

### 13. Recovery/reopen coverage is broad but overlapping

The following groups substantially overlap:

- `component.persistence-matrix.spec.js`
- `render-cache.persistence-contract.spec.js`
- `component.same-type-tab-switching.isolation.spec.js`
- `component.same-type-tab-resize-switch.isolation.spec.js`
- `component.resize-exit-reenter.persistence.spec.js`
- four general recovery specs
- four statistics restore/persistence specs
- the standalone tab-isolation regression harness

They are not exact duplicates, but each recreates its own setup, component matrix, mutation method, readiness rule, and parity assertion. This is why one test can be current while another silently retains an obsolete policy.

### 14. The standalone tab-isolation harness duplicates Playwright infrastructure

`__tests__/tab-isolation-regression` contains a 113 KB renderer harness, a custom static server, browser control, log analysis, archive analysis, and a PowerShell wrapper. It exercises valuable scenarios, but it is outside Jest and the standard Playwright runner, has its own artifact model, and duplicates logic now present in E2E contracts. It should be migrated into tagged Playwright projects and then retired.

### 15. Several large test files have become subsystems

High-priority splits:

| File | Approximate size | Problem |
|---|---:|---|
| `hot.aggrid.clipboard-selection.test.js` | 5,654 lines | selection, clipboard, paste transaction, headers, undo, and source contracts are mixed |
| `componentLifecycle.core.test.js` | 2,323 lines | cache, async scopes, runtime ownership, publication, scheduling, and session teardown are mixed |
| `ui.events.test.js` | 1,843 lines | unrelated event families share one fixture and state |
| `box.swarmOffsets.test.js` | 1,341 lines | algorithm and integration behavior are interleaved |
| `e2e/helpers/workspaceHarness.js` | 831 lines | fixture, driver, diagnostics, and component catalog are combined |

### 16. Skipped and parked tests are not governed consistently

The suite contains an unconditional skipped Box column-reorder test, two heavy mixed `fixme` tests, and browser-conditioned skips. The relevant heavy defects are recorded in `issues.txt`, but there is no mechanical rule requiring every skip/fixme to carry an issue ID, owner, rationale, and removal condition.

### 17. Repository test artifacts are not cleanly separated

The supplied root contains `failing-tests.txt` and an old patch file, and no `.gitignore` was present in the archive. Temporary Playwright directories are often spec-local fixed paths. This increases the risk of stale artifacts and parallel collisions.

## Coverage strengths to preserve

The refactor must not discard the suite’s strongest assets:

- cross-component archive round trips;
- owner-scoped runtime and async lifecycle tests;
- detailed AG Grid editing/clipboard behavior;
- Python/SciPy statistical oracle checks;
- component-specific statistics tests;
- heavy Heatmap/Scatter/Box browser regressions;
- first-interaction and cache invalidation checks;
- explicit console/page-error collection;
- component matrices covering all eleven workspaces;
- Venn GO/STRING ownership tests;
- detailed layout and resize regressions.

## High-risk missing or incomplete coverage

1. Never-mounted inactive archive tabs with reusable render caches.
2. Crash checkpoints at distinct lifecycle boundaries rather than only after a settled graph.
3. Recovery while owner-scoped async or worker work is pending.
4. Close/dispose while async work is pending, followed by tab-ID reuse avoidance.
5. Corrupt archive cache fallback with proof that durable payload/layout remain intact.
6. First interaction after cache restore for every component, not only selected regressions.
7. Five-plus same-component tabs and mixed documents with lazy activation order permutations.
8. Explicit dirty-state contracts after manual open, recovery, activation, redraw, and first edit.
9. Browser-parity core contracts in Firefox.
10. Archive schema migration and backward-compatibility fixtures by version.
11. Parallel-safety validation after fixed temporary paths and global fallbacks are removed.
12. Requirement-level coverage accounting, especially for component-specific persisted controls.

## Audit conclusion

The suite should move from **test-file accumulation** to a **capability-driven contract system**. Shared architectural rules should have one canonical matrix. Component-specific tests should exist only for behavior that cannot be expressed through that matrix. Every test should declare its layer, capability, owner semantics, persistence mode, and expected readiness signal.
