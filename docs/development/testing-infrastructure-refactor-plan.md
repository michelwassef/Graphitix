# Graphitix Testing Infrastructure Refactor Plan

**Status:** proposed migration design
**Date:** 2026-07-31
**Audited baseline:** `graphitix-current-v11-final-professional-v2`
**Companion evidence:** `docs/development/testing-suite-audit.md` and `docs/development/testing-suite-inventory.csv`

## 1. Objective

Refactor the testing infrastructure so that it reliably enforces Graphitix’s defining contracts:

- true owner-scoped tab isolation;
- exact Save → reopen fidelity;
- exact crash-recovery fidelity;
- correct lazy hydration of inactive tabs;
- correct render-cache provenance, reuse, rejection, and invalidation;
- no post-restore payload/layout drift;
- no stale async, worker, timer, or scheduled work crossing owners;
- complete persistence of controls, table state, notes, DataViews, statistics, previews, layouts, and component runtime state;
- trustworthy statistical results;
- deterministic failure diagnostics.

The refactor must reduce duplicated setup and stale assumptions without weakening behavior coverage.

## 2. Non-negotiable design rules

1. **One invariant, one canonical contract.** Component-specific tests may extend a shared contract but must not redefine it.
2. **Explicit capabilities, never inferred applicability.** A component is either covered or explicitly marked not applicable with a reason.
3. **Test settled state, not elapsed time.** Fixed waits are permitted only for deliberate animation sampling or performance measurement.
4. **UI acceptance tests must use the UI.** Internal application fallbacks belong in API/integration fixtures, not UI acceptance helpers.
5. **Test authoritative state and visible projection separately.** A passing DOM assertion must not substitute for owner/session/payload assertions.
6. **Recovery and manual reopen share durable-state assertions.** Recovery-only assertions cover checkpoint origin, fresh-ID rehoming, dirty-state policy, and incomplete-work handling.
7. **No raw source-string test when behavior or AST can express the rule.** Static architecture rules belong in lint/AST checks.
8. **No retry-based success.** A test that fails initially fails the gate. Diagnostic reruns are reported separately.
9. **Every skip/fixme is tracked.** It must include an `issues.txt` identifier, reason, and removal criterion.
10. **No test-order dependence.** Every file must pass alone, after another component, and in the full configured order.

## 3. Target test architecture

### 3.1 Directory structure

Migrate incrementally toward:

```text
__tests__/
  unit/
    shared/
    main/
    components/
  dom/
    shared/
    components/
  integration/
    session/
    archive/
    lifecycle/
    components/
  architecture/
    ownership.rules.test.js
    scheduler.rules.test.js
    bootstrap.rules.test.js
  workers/
  statistical-oracle/
  fixtures/
  support/

e2e/
  smoke/
  contracts/
    tab-ownership.contract.spec.js
    state-persistence.contract.spec.js
    render-cache.contract.spec.js
    crash-recovery.contract.spec.js
    stats-persistence.contract.spec.js
    layout-persistence.contract.spec.js
    async-ownership.contract.spec.js
    archive-compatibility.contract.spec.js
    dirty-state.contract.spec.js
  components/
    box/
    scatter/
    ...
  heavy/
  cross-browser/
  support/
    fixtures.js
    componentCatalog.js
    workspaceDriver.js
    archiveDriver.js
    recoveryDriver.js
    readiness.js
    diagnostics.js
    mutations/
    assertions/
```

Physical moves should occur only after scripts and CI support the new layout. During migration, naming and tags may establish the layers before directories change.

### 3.2 Jest projects

Replace the single broad integration project with explicit projects:

#### `unit-node`

- Environment: Node.
- Pure algorithms, models, serialization, signatures, statistics primitives, formatters, and policy logic.
- No `index.html`, JSDOM, global AG Grid, or canvas stubs.
- Fake timers only when timer behavior is the subject.

#### `dom-unit`

- Environment: JSDOM.
- Minimal per-suite fixture markup.
- Shared control binders, SVG helpers, editing, menus, small component projection tests.
- Must not load the full app.

#### `app-integration`

- Environment: JSDOM.
- Session, tabs, lifecycle, archive, activation, and complete component initialization.
- Uses one canonical production-derived bootstrap helper.
- Runs in-band initially because application globals are intentionally exercised.

#### `workers`

- Existing Node worker project, retained and expanded.
- Common worker protocol contract parameterized across every worker.

#### `statistical-oracle`

- Serial project.
- Real jStat and Python/SciPy oracle, no simplified global statistical stub.
- Explicit dependency check with a clear skip/fail policy.

#### `architecture`

- Node project using AST/lint rules.
- Forbidden unowned maps, active-tab fallbacks, direct legacy schedulers, duplicate bootstrap manifests, and source-boundary rules.
- No exact formatting or implementation-name assertions unless the public contract specifically requires a symbol.

### 3.3 Playwright projects and tags

Use Playwright tags or project grep definitions:

- `@smoke`: launch, one representative graph, file open transaction.
- `@contract`: all-component ownership/persistence/recovery contracts.
- `@component`: focused user-facing component regressions.
- `@heavy`: large datasets, canvas, expensive stats, long recovery.
- `@cross-browser`: essential Chromium/Firefox parity.
- `@soak`: repeated activation/recovery/permutation tests.
- `@diagnostic`: opt-in deep lifecycle trace; never a substitute for acceptance coverage.

Default PR execution must not include `@heavy`, `@soak`, or broad diagnostics unless changed paths require them.

## 4. Single component capability catalog

Create `test-support/componentCatalog.js` as the only test-side component matrix. Both Jest and Playwright should import it.

Each entry should declare:

```js
{
  type: 'roc',
  pageId: 'rocPage',
  launch: { exampleAction: 'rocLoadExample' },
  primaryGraph: {
    selector: '#rocSvg',
    published: 'roc-series-published'
  },
  capabilities: {
    renderCache: true,
    graphOnlyCache: true,
    statistics: true,
    notes: true,
    dataViews: true,
    canvas: false,
    threeD: false,
    externalAsync: false,
    worker: true
  },
  mutationAdapter: 'roc',
  semanticSnapshotAdapter: 'roc',
  statsAdapter: 'roc'
}
```

The catalog must include all eleven components and make unsupported capabilities explicit.

### Why this is required

The current generic parameter mutation already changed a ROC class label and a Venn derived count. Explicit adapters prevent tests from constructing invalid data while claiming to test persistence.

### Required adapters per component

Each component receives deterministic functions:

- `createBaselinePayload()`
- `createDistinctPayloadVariant('A' | 'B')`
- `applyRepresentativeConfigMutation()`
- `applyRepresentativeStyleMutation()`
- `applyRepresentativeLayoutMutation()`
- `computeStatsIfSupported()`
- `captureSemanticGraphFingerprint()`
- `assertPublishedGraph()`
- `assertRestoredInteractions()`

Adapters must mutate authoritative user inputs only.

## 5. Canonical architectural contract matrices

### 5.1 Tab ownership contract

Target: `e2e/contracts/tab-ownership.contract.spec.js` and corresponding Jest integration coverage.

For every component:

1. Open tab A and establish payload/config/style/layout A.
2. Open same-component tab B with distinct authoritative state.
3. Alternate activation A → B → A repeatedly.
4. Assert on every activation:
   - workspace active tab ID;
   - component session owner ID;
   - mounted root owner ID;
   - payload owner and canonical signature;
   - layout owner and canonical semantic signature;
   - visible controls match the active session;
   - inactive owner state is unchanged;
   - no cache or async record is relabeled.
5. Close B while it has scheduled or async work.
6. Assert disposal cancels only B and A remains usable.

Add permutation coverage for three and five same-component tabs in nightly/soak tests.

### 5.2 State persistence contract

Target: `e2e/contracts/state-persistence.contract.spec.js`.

For every component, assert Save → reopen fidelity for:

- canonical payload;
- representative graph parameter;
- representative style;
- table/grid state and exclusions when supported;
- notes/DataViews when supported;
- statistics settings/results when supported;
- graph layout and aspect state;
- preview metadata;
- toolbar/UI state;
- component-specific runtime state declared durable.

The test must compare semantic normalizations, not raw runtime IDs or unstable DOM serialization.

### 5.3 Render-cache contract

Target: `e2e/contracts/render-cache.contract.spec.js` plus focused Jest validation tests.

For every cache-capable component:

- valid owner/type/payload/layout cache is accepted;
- wrong owner is rejected;
- wrong component is rejected;
- stale payload signature is rejected;
- stale layout signature is rejected when layout affects the cache;
- incomplete component cache is rejected;
- valid cache restores without fallback redraw;
- invalid cache falls back to redraw without losing durable state;
- restored interactions are live;
- first graph-affecting edit invalidates only the owner cache;
- graph-only caches rebuild controls/statistics from durable state;
- inactive cache capture never reads active DOM.

### 5.4 Crash-recovery contract

Target: `e2e/contracts/crash-recovery.contract.spec.js`.

Run the same semantic state assertions as manual reopen, plus recovery-specific scenarios:

1. checkpoint after canonical payload commit but before draw;
2. checkpoint during scheduled draw;
3. checkpoint after graph publication but before cache promotion;
4. checkpoint with pending owner async/worker work;
5. checkpoint after complete cache capture;
6. corrupt or stale cache in an otherwise valid checkpoint;
7. failed active-tab activation with atomic rollback;
8. inactive lazy tabs activated in a different order after recovery;
9. no recovery loop or repeated dirtying after accepted recovery;
10. fresh runtime tab IDs with correct rehoming of every owner-scoped field.

Use explicit test hooks or lifecycle events to place checkpoints. Do not approximate lifecycle boundaries with timeouts.

### 5.5 Statistics persistence contract

Target: `e2e/contracts/stats-persistence.contract.spec.js`.

Replace duplicated statistics matrices with one capability-driven matrix that asserts:

- selected statistical method/options;
- computed durable result model;
- rendered report presence and key semantic values;
- same-component tab isolation;
- Save → reopen;
- crash recovery;
- activation after lazy reopen;
- no unwanted recomputation when restored results are authoritative;
- recomputation only after an actual input/statistical-setting change.

Component-specific statistical correctness remains in focused unit/oracle suites.

### 5.6 Layout persistence contract

Target: `e2e/contracts/layout-persistence.contract.spec.js`.

For every component:

- resize table/graph/config surfaces where supported;
- toggle aspect lock and representative subtype/mode;
- switch away and back;
- Save → reopen;
- recover;
- compare semantic dimensions within documented browser tolerance;
- verify owner-scoped dataset IDs are rehomed correctly;
- ensure no graph/control overlap and no clipping.

Replace raw JSON equality and arbitrary pixel deltas with normalized geometry and semantic constraints.

### 5.7 Async ownership contract

Target: `e2e/contracts/async-ownership.contract.spec.js` and Jest async-scope tests.

For every component declaring scheduled, worker, or external async capability:

- launch operation in A;
- switch to B before completion;
- complete A’s operation;
- assert only A session changes;
- assert B DOM/session stays unchanged;
- close A before completion and assert result is dropped;
- reopen/recover with pending work and assert only durable settled state survives;
- retry/cancel and verify generation/token replacement.

Keep Venn GO/STRING, PCA embeddings, Heatmap workers, Scatter heavy work, and Box statistics as specialized cases extending this contract.

### 5.8 Dirty-state contract

Target: `e2e/contracts/dirty-state.contract.spec.js`.

Explicitly document and test dirty behavior for:

- blank tab creation;
- example load;
- user table edit;
- style/config edit;
- tab activation only;
- passive redraw/resize observer;
- manual file open;
- Save completion;
- accepted recovery;
- cache restore;
- fallback redraw;
- first user edit after restore;
- async result that changes durable state.

### 5.9 Archive compatibility contract

Target: `e2e/contracts/archive-compatibility.contract.spec.js` and Jest archive schema tests.

Maintain versioned fixture archives under `__tests__/fixtures/archives/vN/` and assert:

- migration to current schema;
- owner rehoming;
- missing optional fields default correctly;
- deprecated fields are ignored or migrated;
- corrupt sections fail locally rather than discarding the entire valid document;
- Save after migration produces current schema.

## 6. Existing test disposition

### 6.1 Consolidate into canonical matrices

| Current files | Target |
|---|---|
| `component.same-type-tab-switching.isolation.spec.js` | tab ownership contract |
| `component.same-type-tab-resize-switch.isolation.spec.js` | ownership + layout contracts |
| `component.resize-exit-reenter.persistence.spec.js` | layout contract |
| `component.persistence-matrix.spec.js` | state persistence contract with explicit adapters |
| `render-cache.persistence-contract.spec.js` | render-cache contract plus mixed-document recovery scenario |
| `recovery.single-tab.e2e.spec.js` | crash-recovery contract |
| `recovery.single-tab.live-capture.spec.js` | crash-recovery lifecycle checkpoint case |
| `recovery.primary-graph-publication.spec.js` | recovery publication case |
| `recovery.no-loop.spec.js` | recovery dirty/no-loop case |
| `stats.archive-reopen-tab-switch.persistence.spec.js` | stats persistence contract |
| `stats.reopen-presence.contract.spec.js` | stats persistence contract |
| `stats.same-component-isolation-restore.contract.spec.js` | stats + ownership contract |
| generic parts of `stats.restore-roundtrip.spec.js` | stats persistence contract |

Delete original files only after each scenario ID is mapped to and passing in the target contract.

### 6.2 Retain as focused component regressions

Retain tests where behavior is genuinely component-specific, including:

- Venn GO/STRING/species ownership and restored authority;
- Heatmap canvas/raster publication, heavy paste, exclusions, dendrograms, and heavy recovery;
- Box significance geometry, formulas, grouped statistics, horizontal mode, and swarm algorithms;
- Scatter 2D/3D state, trendlines, labels, large-point rendering, and selection behavior;
- PCA embedding workers, biplot, 3D rotation, and RNA-seq PCA path;
- Surface rotation and 3D geometry;
- ROC classification semantics and statistical methods;
- Survival covariates, reports, and model outputs;
- Histogram distribution/frequency mode;
- Pie stacked/proportion labeling;
- component statistical oracle tests.

Each retained file should state which shared contract it extends and avoid repeating generic reopen/tab setup assertions.

### 6.3 Remove or replace

1. Delete `__tests__/heatmap.heavy-recovery-authoritative.spec.js` after confirming the `e2e` version is the maintained superset.
2. Migrate `__tests__/tab-isolation-regression` scenarios to Playwright contracts, then remove the custom server/renderer harness.
3. Convert `box-scatter.render-cache-lifecycle.diagnostic.spec.js` into either:
   - a current `@heavy` acceptance test using the shared cache contract; or
   - an opt-in diagnostic tool with no architectural assertions.
   Its obsolete “lean recovery has no cache” assertion must not remain.
4. Remove root test artifacts and obsolete patch files; add a repository `.gitignore` for generated outputs.
5. Replace duplicated component catalogs and stats case arrays with the shared capability catalog.

## 7. Source-contract migration

### 7.1 Convert to runtime behavior

Source assertions such as “contains function X,” “calls helper Y,” or “does not contain exact statement Z” should generally become tests that invoke the public/registered behavior and assert owner/session effects.

Priority conversions:

- Heatmap draw scheduling and restoration checks;
- AG Grid paste transaction internals;
- Box frame-commit and statistics reporting contracts;
- PCA/Scatter ownership implementation names;
- major tick-length wiring;
- component import binding checks.

### 7.2 Convert true architecture rules to AST/lint

Rules suitable for static enforcement:

- no `Shared.debounceFrame` in components;
- no unowned module-level mutable `Map`/`Set` matching known state patterns;
- no active-tab fallback in owner-required APIs;
- component runtime ownership uses `createRuntimeOwner`;
- no generated desktop source edits;
- no Playwright spec under `__tests__`;
- no `test.skip`/`test.fixme` without issue annotation;
- no direct fixed waits in `e2e/contracts`;
- no duplicate component catalog definitions.

Use an AST parser or custom ESLint rules, not source substrings sensitive to formatting.

## 8. Harness refactor

### 8.1 Jest

1. Stop loading full `index.html` in the global `beforeEach` for every test.
2. Introduce fixture builders for minimal DOM needs.
3. Generate the full-app bootstrap list from `index.html` or expose one production bootstrap entry point usable in tests.
4. Separate statistical stubs from real-statistics projects.
5. Make global polyfills minimal and standards-compatible.
6. Reset owner registries, fake timers, listeners, and pending async scopes explicitly after each integration test.
7. Fail on unexpected console warnings in architecture/integration projects, with small explicit allowlists.

### 8.2 Playwright

Split the 831-line helper into:

- `componentCatalog.js`: immutable capabilities and selectors;
- `fixtures.js`: Playwright `test.extend` fixtures;
- `workspaceDriver.js`: UI-only tab/component actions;
- `appApiDriver.js`: explicit internal API actions for non-UI setup;
- `archiveDriver.js`: save/open/archive inspection;
- `recoveryDriver.js`: IndexedDB checkpoint/recovery actions;
- `readiness.js`: lifecycle-based settled waits;
- `diagnostics.js`: console, lifecycle, owner, payload, layout, and archive attachments;
- `mutations/*.js`: explicit component adapters;
- `assertions/*.js`: semantic owner/persistence assertions.

UI tests must use `workspaceDriver`. Contract setup may use `appApiDriver`, but tests must declare this in their name or metadata.

## 9. Deterministic readiness model

Expose stable test-observable lifecycle signals in debug/test mode:

- `graph-published` with component, tab ID, generation, payload signature;
- `owner-idle` with no pending timer/frame/worker/request;
- `archive-checkpoint-complete` with snapshot kind and tab signatures;
- `render-cache-restored` or `render-cache-rejected` with reason;
- `document-restore-complete` with active owner and lazy tab count;
- `stats-published` with result generation;
- `layout-settled` after authoritative programmatic resize.

Create waits:

- `waitForActiveOwner(page, type, tabId)`
- `waitForGraphPublished(page, type, tabId, signature?)`
- `waitForOwnerIdle(page, type, tabId)`
- `waitForStatsPublished(page, type, tabId)`
- `waitForArchiveCheckpoint(page, kind)`
- `waitForDocumentRestore(page)`
- `waitForCacheOutcome(page, tabId)`

Policy:

- Contract files: zero arbitrary `waitForTimeout` calls.
- Component regressions: fixed waits require an inline reason.
- Animation tests: sample explicit animation frames, not wall-clock sleeps.
- Performance tests: use measured durations only in `@heavy`/benchmark lanes.

## 10. Test data and archive fixtures

1. Move loose CSV and `.graph` fixtures into named fixture directories.
2. Add provenance metadata for statistical reference datasets.
3. Use deterministic generators for large matrices and point clouds.
4. Store only small versioned archive fixtures; generate heavy archives at runtime.
5. Never mutate shared fixture objects in place.
6. Give every fixture a semantic purpose, component, schema version, and expected fingerprint.

Suggested structure:

```text
__tests__/fixtures/
  data/
  statistics/
  archives/v1/
  archives/v2/
  expected/
```

## 11. Diagnostics and artifact policy

On every Playwright failure, retain:

- trace from the failing attempt;
- screenshot and video;
- last owner-scoped lifecycle events;
- active/inactive tab summary;
- payload/layout/cache signatures;
- archive manifest without base64 payload;
- pending timers/workers/requests by owner;
- critical console/page/request errors.

Changes:

- use `trace: 'retain-on-failure'` or actual Playwright retries;
- never rely on a separate invocation to obtain a trace;
- use `testInfo.outputPath()` rather than fixed shared temp directories;
- cap lifecycle event attachments;
- sanitize large canvas/cache payloads;
- include random seed and worker count in reports.

## 12. Flakiness policy

1. Initial failure always fails PR CI.
2. An optional diagnostic rerun may classify the failure but cannot turn the job green.
3. Track flaky test identity and seed in artifacts.
4. No unconditional skip/fixme without an open issue.
5. Quarantine is time-limited and run in a separate non-blocking lane.
6. Nightly run repeats ownership/recovery contracts with randomized component and activation order.
7. Weekly run verifies both `--workers=1` and parallel execution.

## 13. Coverage policy

### 13.1 Line/branch coverage

Add `test:coverage` and enforce coverage in CI after projects are split. Do not immediately raise the global threshold from an unknown baseline.

Phase approach:

1. Record current project-specific baselines.
2. Enforce “no decrease” per project.
3. Set higher thresholds for critical shared modules:
   - `componentLifecycle.js`
   - `session.js`
   - `sessionActions.js`
   - `snapshotPolicy.js`
   - `documentState.js`
   - graph archive modules
   - workspace tabs and component layout.
4. Exclude generated/vendor libraries and test-only hooks.

### 13.2 Contract coverage

Line coverage does not prove tab/reopen/recovery fidelity. Generate a contract report from the component catalog showing, for every component:

- ownership;
- Save/reopen;
- recovery;
- render cache;
- layout;
- stats;
- notes/DataViews;
- async/worker;
- first restored interaction;
- Firefox core coverage.

A missing cell must be either failing or explicitly `N/A` with rationale.

## 14. CI design

Add `.github/workflows/test.yml` and a nightly workflow.

### Pull request gates

1. **Static**
   - ESLint and architecture AST rules;
   - generated docs checks;
   - orphan/skip/fixed-wait checks.
2. **Jest unit/dom**
   - parallel.
3. **Jest app integration**
   - in-band initially.
4. **Statistical smoke/oracle**
   - focused reference set.
5. **Chromium smoke and core contracts**
   - ownership, persistence, render cache, recovery, dirty state.
6. **Firefox core contract subset**
   - launch, same-type isolation, Save/reopen, recovery, clipboard/import essentials.

### Nightly gates

- complete Chromium suite;
- complete Firefox contract suite;
- heavy/canvas/large-data tests;
- full Python oracle;
- coverage;
- randomized contract order;
- repeat-each ownership/recovery;
- parallel-safety lane.

### Release gate

- all PR and nightly suites green;
- no unexpired P1/P2 quarantined ownership/recovery test;
- full archive compatibility fixtures;
- desktop packaging smoke if relevant.

## 15. Test selection

Replace token-only `scripts/suggest-tests.js` scoring with an explicit dependency/contract map:

- changed production module → unit/integration owner;
- shared lifecycle/session/archive changes → mandatory all-component contracts;
- component change → component-focused tests plus shared capability rows;
- stats module change → statistical oracle and UI persistence rows;
- layout/resizer change → all-component layout contract;
- grid/import change → AG Grid adapter tests and browser import matrix.

The suggestion tool should print mandatory and optional groups, not merely ranked filenames.

## 16. Large-file split plan

### `componentLifecycle.core.test.js`

Split into:

- cache validation and publication;
- restore transactions and suppression;
- async scope and schedulers;
- runtime ownership;
- workspace shared controls and teardown;
- session apply/rollback/rehoming;
- draw/overlay scheduling.

### `hot.aggrid.clipboard-selection.test.js`

Split into:

- selection model/ranges;
- clipboard copy/cut;
- paste transaction and payload commits;
- row/column header selection;
- undo/redo and reorder;
- visual outline/scroll behavior;
- architecture/static rules migrated elsewhere.

### `ui.events.test.js`

Split by event owner: workspace tabs, graph controls, toolbar, editing, file actions, and keyboard shortcuts.

### `box.swarmOffsets.test.js`

Separate pure packing algorithms from component/session projection tests.

## 17. Implementation phases

### Phase 0 — Baseline and freeze

- Run current complete suites without applying behavior changes.
- Save machine-readable timings, failures, skips, and seeds.
- Confirm orphan tests and stale assertions.
- Create requirement IDs for ownership, persistence, recovery, cache, and dirty-state contracts.

**Exit:** reproducible baseline and test inventory committed.

### Phase 1 — Foundation

- Add component capability catalog.
- Split Playwright helper responsibilities.
- Add deterministic readiness helpers.
- Add skip/fixme and orphan-test checks.
- Add `.gitignore` and clean generated artifacts.

**Exit:** new tests can use one catalog/fixture stack; existing tests still run.

### Phase 2 — Jest separation

- Create Jest projects.
- Move pure tests out of global JSDOM.
- Replace manual full-app module list with production-derived bootstrap.
- Isolate real statistical dependencies.

**Exit:** no pure unit test loads `index.html`; app integration remains behaviorally equivalent.

### Phase 3 — Ownership and lifecycle contracts

- Build canonical ownership/async/disposal matrices.
- Migrate same-type tab switching tests.
- Convert related source contracts to behavior/AST.

**Exit:** all eleven components pass owner matrices alone, full-suite, randomized, and repeated.

### Phase 4 — Persistence, cache, and recovery contracts

- Build explicit mutation and semantic snapshot adapters.
- Migrate persistence and render-cache matrices.
- Add lifecycle checkpoint recovery cases.
- Add versioned archive fixtures.

**Exit:** one canonical contract proves Save/reopen and recovery for every component.

### Phase 5 — Stats, layout, UI-state matrices

- Consolidate statistics restore specs.
- Consolidate layout/resize persistence specs.
- Add capability-based notes/DataViews/grid/toolbar state assertions.

**Exit:** component coverage report contains no unexplained gaps.

### Phase 6 — Component regression cleanup

- Review every remaining component file.
- Delete duplicated generic setup/assertions.
- Split monoliths.
- Retain only unique component behavior.

**Exit:** every remaining component test declares the shared contract it extends.

### Phase 7 — CI, coverage, and flake enforcement

- Add workflows.
- Replace retry-to-green behavior.
- Activate coverage.
- Add nightly heavy/soak/parallel lanes.

**Exit:** local and CI commands are documented and executable; initial failures cannot pass silently.

### Phase 8 — Retire legacy infrastructure

- Remove standalone tab-isolation harness after scenario parity.
- Remove orphan and obsolete diagnostics.
- Remove migration aliases and duplicate catalogs.
- Regenerate test inventory.

**Exit:** only one supported test runner stack remains.

## 18. Acceptance criteria for the completed refactor

The refactor is complete only when:

1. Every one of the eleven components has explicit capability rows.
2. Shared ownership, Save/reopen, recovery, cache, layout, and dirty-state contracts are canonical and pass independently.
3. No contract spec uses arbitrary fixed waits.
4. No UI acceptance helper invokes internal app APIs as a fallback.
5. No test file is outside configured discovery.
6. No unconditional skip/fixme lacks an open issue and expiry/removal condition.
7. Initial failures cannot be converted to success by rerun.
8. Failure traces and owner snapshots are always available.
9. Coverage is executed and enforced.
10. Chromium and Firefox core contracts run in CI.
11. Heavy and randomized ownership/recovery suites run nightly.
12. The custom tab-isolation harness is retired.
13. Source-text tests are reduced to true AST/static architecture rules.
14. Large test files are split below an agreed maintainability limit, recommended 800 lines except generated tables/fixtures.
15. A generated contract-coverage report has no unexplained gaps.
16. The full suite passes both serially and in its supported parallel configuration.

## 19. Immediate first implementation batch

The safest first code batch should be limited to infrastructure and no production behavior:

1. Add `test-support/componentCatalog.js` with all eleven components and capabilities.
2. Add Playwright fixtures and split UI driver from API driver.
3. Add lifecycle-based `waitForGraphPublished`, `waitForOwnerIdle`, and `waitForDocumentRestore`.
4. Move/delete the orphan Heatmap spec.
5. Add a static test-inventory gate for orphan files, untracked skips, and fixed waits in contract folders.
6. Change trace to `retain-on-failure`.
7. Change the full runner so diagnostic retries never change the final exit status.
8. Add the initial CI workflow.
9. Migrate only `component.same-type-tab-switching.isolation.spec.js` to the new ownership contract as a pilot.
10. Run the pilot for all components, alone, after randomized predecessors, with one worker and parallel workers.

Only after this pilot is stable should persistence/recovery consolidation begin.

## 20. Governance

This document is a migration design, not a second permanent backlog. During implementation:

- track executable work in `issues.txt`;
- record completed batches in `CHANGELOG.md`;
- update `ARCHITECTURE.md` when test-observable lifecycle contracts become part of the architecture;
- remove this plan after all acceptance criteria are met and any remaining work is represented in `issues.txt`.
