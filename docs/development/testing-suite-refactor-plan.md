# Testing Suite Refactor Plan

## Goal
Move from brittle, setup-heavy tests to a coherent, tab-isolated, contract-driven test suite with stable harnesses and clear ownership boundaries.

## Current Baseline
- Full suite currently passes (`npm test -- --runInBand`).
- Shared harness introduced for tab-scoped/unit-integration style suites:
  - `__tests__/setup/workspaceHarness.js`
- Initial high-churn suites migrated to shared harness patterns.
- Remaining fragility identified in full-app bootstrap suites that require strict startup sequencing.

## Refactor Principles
1. Prefer behavior-contract assertions over implementation-detail assertions.
2. Preserve tab isolation as a first-class invariant in every harness and assertion helper.
3. Separate "component/tab-scoped integration" tests from "full-app bootstrap" tests.
4. Standardize setup so lifecycle/cache changes do not create false regressions.

## Suite Taxonomy (Target End State)
1. `unit`
- Pure/stateless logic (`chartStyle`, math/stat helpers, transforms).
- No DOM or minimal synthetic DOM.

2. `tab-scoped integration`
- Component + shared modules, tab-bound mounted root, synthetic session/workspaceTabs.
- Uses `workspaceHarness`.

3. `full-app integration`
- Boots `js/main.js` and tab system end-to-end.
- Must use dedicated bootstrap helper (no preseeded session unless explicitly supported).

4. `regression contract`
- Focused contract tests for cache restore, tab ownership, payload/layout signatures, preview ownership.

## Workstreams

### A. Harness Standardization
1. Keep `workspaceHarness` as canonical tab-scoped bootstrap.
2. Add explicit modes:
- `mode: "tab-scoped"` (preseeded session/workspaceTabs allowed).
- `mode: "full-app"` (no preseeded session; app owns initialization order).
3. Add validation guards that fail fast on mixed-mode misuse.

### B. Assertion Standardization
1. Introduce helpers for:
- cache ownership checks
- preview ownership/token checks
- payload/layout signature matching checks
2. Replace brittle identity checks (`toBe` for cloned payloads) with structural/contract checks.
3. Keep precision-tolerant layout assertions where sub-pixel drift is expected.

### C. Suite Migration Waves
1. Wave 1 (done): highest-churn tab/caching/preview suites.
2. Wave 2: remaining tab-scoped suites with ad-hoc session/root wiring.
3. Wave 3: full-app suites migrated to explicit full-app bootstrap helper.
4. Wave 4: cleanup duplicated helpers/utilities across tests.

### D. CI/Execution Strategy
1. Add scripts:
- `test:unit`
- `test:tab`
- `test:app`
- `test:contracts`
2. Keep full `npm test` umbrella run.
3. Allow targeted lanes to isolate failures faster.

## Prioritized Backlog
1. Build full-app bootstrap helper (explicitly non-preseeded).
2. Migrate current full-app suites to helper.
3. Consolidate duplicated async flush helpers and tab-activation helpers.
4. Add lint/check rule for forbidden ad-hoc `window.Main.session` patching in full-app mode suites.
5. Add test docs with examples for each suite taxonomy.

## Success Criteria
1. No ad-hoc tab/session bootstrap outside approved helpers.
2. Cache/preview/tab-isolation regressions produce actionable failures (not harness noise).
3. Full suite remains green while lifecycle/cache internals evolve.
4. New tests can be added with minimal setup boilerplate.
