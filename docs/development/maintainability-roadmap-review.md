# Independent review of the maintainability roadmap

Date: 2026-10-03. Decision: **retain the approach, but revise the scope and evidence gates before approving the full initiative.**

This is a review record, not a replacement roadmap or a second backlog. Implementation sequencing belongs in the [roadmap](../../refactors-todo/maintainability-refactor-roadmap.md); confirmed open work belongs in [issues.txt](../../issues.txt).

## Verdict

The roadmap is technically cautious and substantially sound as an initial improvement programme. Its strongest choices are preserving the architecture, making ownership explicit, protecting persistence, using small reviewable changes, and refusing arbitrary file-size targets. I would approve contributor orientation, loader checks, and a carefully bounded extraction pilot.

I would **not yet approve it as a complete answer to making Graphitix easier for new developers to maintain**. Its main weakness is a mismatch between ambition and guaranteed outcome. Much of the difficult design work is deferred to implementation reviews. Several phases can conclude with documentation or a justified decision not to extract anything. Those are legitimate decisions, but they do not establish that everyday development has become materially easier.

The most consequential technical omission is the distinction between **identifying the correct session** and **making that session the source of state changes**. Removing projection-owner fallbacks addresses the former. Current code still contains active-projection-to-session synchronization that requires a broader state-flow assessment before deeper extraction.

There is no evidence here justifying a wholesale framework, language, or module-system rewrite. Nor does this review establish a current cross-tab corruption bug. The recommendations below concern demonstrated maintenance obstacles and the adequacy of the proposed safeguards.

## Evidence and limits

Reviewed working-tree source against HEAD `ed4be0c7462bbd7b199b0e5ad8e2612917879ea7`. Roadmap SHA-256 at initial review: `AA2307CF507E4C3EC2B2155E0FFFBFF3032F57586C1885137EE37F76BC5847FC`.

Read the entire roadmap, current rules, architecture and persistence references, contributor guide, backlog, and relevant historical-audit introductions. Checked loader and documentation generators, test selection and inventory, production bootstrap, CI lanes, the proposed LOWESS boundary and its oracle, and selected ownership/capture paths in Scatter, Pie, and PCA. Searched the projection bridge in all eleven components and inspected the assertions in the recommended browser contracts. Existing and concurrent unrelated edits were preserved.

This is a roadmap review supported by targeted source tracing and checks, not an exhaustive runtime audit of all component modes. Historical findings were not assumed to remain open. Runtime isolation, old-archive compatibility, visual fidelity, and performance are not certified by this review.

**Baseline-count correction (rechecked 2026-10-05):** I recounted the 15 sources in the roadmap's baseline tables and the two comparison files (`exampleDatasets.js` and `boxStatsModel.js`) directly from raw Git blobs at baseline commit `ed4be0c7462bbd7b199b0e5ad8e2612917879ea7`, using the roadmap's single rule: count each LF byte as one line, then add one only for a nonempty blob whose final byte is not LF; blank lines count. All 17 blobs end in LF, so each reported value equals its LF-byte count. The roadmap table records Box at 39,855, Scatter at 31,984, and Line at 20,482. The comparison files count 29,154 (`exampleDatasets.js`) and 6,735 (`boxStatsModel.js`); `exampleDatasets.js` is smaller than Box and Scatter, so the earlier claim that it exceeded every controller was wrong. Earlier `Get-Content <path> | Measure-Object -Line` results measured checked-out files, not these pinned baseline blobs, so they are not used here. Box, Scatter, and the component loader have since changed in the worktree; the roadmap table remains a historical snapshot of the pinned commit and must be recomputed by the same rule at the implementation baseline.

## What should be retained

| Roadmap choice | Assessment |
| --- | --- |
| Preserve existing architecture and public boundaries | Correct. Existing session, lifecycle, table, layout, and test infrastructure should be the starting point. |
| Small extractions with explicit inputs and outputs | Correct. A coherent boundary matters more than the number of files or lines. |
| Preserve archive shapes and component hooks | Essential. Keep this separate from any intentional behavioural change. |
| Recheck old audit claims | Correct. Dated findings are neither current defects nor evidence of present safety. |
| Fix lazy-loading checks | Confirmed useful work. The static bootstrap checker does not examine lazy component paths; the contract generator treats an unavailable component source as supplying its source hook. |
| Preserve existing extracted models | Correct. Repeating completed work would add no value. |
| LOWESS as a bounded pilot | Technically reasonable. The fitter is largely self-contained and its existing numerical test passes. Its benefit should be described narrowly. |
| Per-component owner migration and rollback | Correct. Blanket deletion of `__boundTabId` would be unjustified. |
| No automatic split of shared infrastructure | Correct. Keeping a stable public API does not automatically make a proposed internal split useful. |

## Changes needed before full approval

### 1. Define an outcome that cannot be satisfied by orientation work alone

**Priority: high; programme-design gap.** Roadmap Phase 5 and completion criteria allow the deeper component responsibility to be rejected with coupling evidence. Phase 6 permits keeping shared modules intact. Phase 4 permits documented reasons to retain fallbacks. Each escape is individually sensible, but together they allow the initiative to finish without demonstrating a substantial improvement to a difficult controller change.

LOWESS is a useful numerical boundary, but extracting it does not simplify most control wiring, session updates, table handling, rendering, or persistence. Several successful model extractions already exist, so another pure calculation extraction is not sufficient proof of a broader maintenance strategy.

**Required amendment:** distinguish an initial preparation/pilot milestone from the larger onboarding objective. Select representative developer tasks before selecting the next extraction: changing a persisted graph option, modifying a renderer, and extending a calculation are good candidates. Record the current path through functions, state owner, tests, and review steps. Require at least one meaningful controller task to become demonstrably easier before calling the larger initiative successful.

Use a contributor exercise with a developer unfamiliar with that area, recording navigation difficulties and reviewer interventions. Until such an exercise happens, describe the benefit as an informed expectation, not a measured result. Do not substitute a line-count target. A no-go outcome should trigger a scope decision, not silently count as achieving the original objective.

### 2. Expand the ownership assessment beyond fallback removal

**Priority: high; source-confirmed architectural debt, not a reproduced isolation failure.**

Concrete examples:

- [Scatter](../../js/components/scatter.js#L2818) copies view/grouping state, axes, and grid style from module mirrors into the session. Its owned callback invokes this in `finally` at line 3458, and active runtime capture invokes it at line 5321. The mirror builders at lines 2636 and 2657 expose the fields involved.
- [Pie](../../js/components/pie.js#L1681) reads visible controls and writes `ownerSession.state.controls`. Runtime capture calls that function at line 6015.
- [PCA](../../js/components/pca.js#L6401) has an owner-guarded active capture that constructs session state using `snapshotPcaOwnedStateFromActive`; its owned callback invokes capture at line 6117.

These paths include protections for inactive owners. Their existence therefore does **not** prove that A's data currently reaches B. It does prove that correct owner lookup alone does not eliminate the need to reason about two directions of state synchronization. This is in tension with the intended session-first architecture and is more consequential than renaming or moving resolver functions.

**Required amendment:** before Phase 4, inventory state families, their writers, and their capture paths. Distinguish reference aliases from copied mirrors, immediate session mutations from later reconciliation, and durable values from legitimately DOM-derived transient geometry. A session parameter is not sufficient if the helper still reads active globals.

Where a field depends on mirror/DOM reconstruction, approve a bounded state-flow refactor first: owner mutation, projection, snapshot. Keep existing guards until their replacement is proven. Do not remove synchronization merely because it looks redundant. The completion evidence should show that the selected durable field is already correct in its session before capture, remains independent in another tab, and survives reopen and undo/redo where supported.

This is the broader refactor that must be designed before applying a narrow fallback-removal workaround. It need not become a whole-application rewrite.

### 3. Treat maps and test suggestions as aids, not exhaustive evidence

**Priority: high; verified tooling limitations.**

The [module-map generator](../../scripts/generate-architecture-map.js#L5) scans `js/main`, `js/shared`, and `js/components`. It excludes `js/workers`, root `js/main.js`, and other execution contexts. Its reference scan at line 83 finds direct namespace text; it does not follow aliases or resolve dynamic calls. The generated document itself acknowledges that it is an orientation aid. For example, [Box's worker](../../js/workers/box.worker.js#L51) loads shared code through `importScripts`, outside that map's scan.

The roadmap does require caller mapping, which is good. It should explicitly prohibit treating a map hit list as proof that every consumer has been found. Check aliases, callbacks, worker imports, public namespace access, tests, and production packaging paths for each selected boundary. Dead-code removal needs the same care.

The [test impact rules](../../test-support/impactMap.js#L79) have a more concrete gap. Executing the current planner showed:

| Changed source | Selected mandatory lanes | Limitation |
| --- | --- | --- |
| `js/shared/regression.js` | unit, integration, Chromium contracts | No statistical-oracle lane or oracle manifest entries |
| `js/components/scatter.js` | unit, DOM, integration, Chromium contracts, workers | No statistical-oracle lane or oracle manifest entries |
| `js/shared/scatterDensityModel.js` | none | Extracted model is outside the impact rules |

Keyword suggestions may still surface useful tests, and CI independently runs the statistical lane. This is a local change-impact gap, not a claim that CI never validates statistics. Phase 3 explicitly retaining the LOWESS oracle is a good exception; make that reliability systematic.

**Required amendment:** update impact mappings whenever code moves, verify selection using representative changed paths, and require the exact relevant numerical test for numerical work. Keep the caller inventory in the implementation review; no new hand-maintained global dependency registry is necessary.

### 4. Match acceptance gates to the assertions actually available

**Priority: high for ownership work; incomplete execution specification.**

The roadmap names the right invariants, but its two principal browser references do not cover them all:

- [Same-type switching](../../e2e/ownership/component.same-type-tab-switching.isolation.spec.js#L217) checks active roots, table/layout ownership, and scroll behaviour. It is not comprehensive validation of independent control values and results.
- [Persistence matrix](../../e2e/ownership/component.persistence-matrix.spec.js#L30) exercises declared mutations and one batched archive reopen. Its [driver](../../e2e/helpers/ownerPayloadDriver.js#L1090) creates the archive with the running implementation. This establishes selected same-version round trips, not compatibility with historical saved files.
- [Async statistics completion](../../e2e/stats/stats.async-owner-completion.contract.spec.js#L75) has concrete Scatter and Box cases; it is not evidence for all eleven components or every async operation.

**Required amendment:** attach a small scenario-to-test table to each ownership or persistence slice before editing. Include changed controls and results, A→B→A, relevant pending work, close/dispose and stale generations where applicable, archive reopen, recovery, duplicate, and interaction after cache restore. Name existing tests, identify gaps, and explain genuinely inapplicable scenarios. Use the existing inventory rather than a competing test catalogue.

For serialization-sensitive work, compare a baseline archive produced before the change and representative supported older fixtures, including derived DataViews and cached state where relevant. For rendering work, include the affected live/export paths and SVG/Canvas/3D modes as applicable. For shared heavy paths, record representative cold-load, switch, reopen, and memory/performance baselines before moving code. These are conditional checks, not a demand to run every suite for LOWESS.

### 5. Provide a path for component-private collaborators

**Priority: medium; target-design ambiguity.** Phase 2 correctly discourages making every extracted helper eager and global. But its practical choices are largely to keep component orchestration in the controller or justify another `Shared` model. That leaves the main controller-maintenance problem without a clear route once pure calculations have been extracted.

Component-specific responsibilities can remain owned by the component while residing in separate private collaborators. Ownership, file placement, and load timing are different decisions. A renderer or control adapter should not become shared merely because it is in another file.

**Required amendment:** make the approved placement and loading decision concrete for the first non-pure boundary. Define who constructs it, its explicit inputs, whether it owns any resources, and who disposes them. Preserve the public component facade and the existing loader authority. If private lazy dependencies need a small loader extension, propose and test that bounded extension separately. Do not presuppose either a full module migration or permanent eager loading.

For LOWESS, preserve the current wrapper's formatting callback and runtime prediction function. [The wrapper](../../js/components/scatter.js#L13788) formats span labels differently from the direct test hook. [Information-criteria delegation](../../js/components/scatter.js#L6302) also serves other fitters, so do not remove its component adapter indiscriminately. The Python LOWESS reference is a custom implementation at [stats_oracle.py:720](../../scripts/stats_oracle.py#L720), not an independent SciPy LOWESS routine. It is useful extraction regression evidence, not independent certification of the statistical method.

### 6. Explain how structural tests evolve during a valid refactor

**Priority: medium; testing-policy ambiguity.** Current [Scatter architecture tests](../../__tests__/architecture/scatter.internalArchitecture.contract.test.js#L93) read `scatter.js`, locate named functions, and check literal calls and line counts. Some protect useful architectural rules. Others will necessarily change when a responsibility moves files.

The roadmap's prohibition on relaxing tests is sound, but does not explain the difference between weakening a behavioural guarantee and relocating an assertion that assumes the old implementation structure.

**Required amendment:** classify affected tests before the move. Preserve behavioural and numerical expectations. Migrate source-location assertions to the new boundary, preserving the original ownership/dependency rule, and add direct behavioural coverage where a text match was the only evidence. Record why the revised test still catches the original regression. Do not preserve an unnecessary wrapper solely to satisfy a stale string search, or delete a unique assertion without replacement.

### 7. Correct the onboarding and baseline details

**Priority: medium for onboarding; low for descriptive inaccuracies.**

- [CONTRIBUTING.md](../../CONTRIBUTING.md#L3) says Node 20+ and Python 3.10+ with NumPy/SciPy. The executable requirements are Node `>=20 <25`, exact Python from [.python-version](../../.python-version), and ten pinned packages from [requirements-stats.txt](../../requirements-stats.txt). A contributor can follow the guide and still fail required checks. Phase 1 should include a tested clean setup, browser installation, local serving, and a first successful focused test, with links to the executable versions.
- The checked-in inventory has 606 rows, but current discovery has **607**, including **262** Playwright files. The missing generated row is `e2e/box/box.whisker-geometry.spec.js`. `quality:static` currently stops at inventory freshness. Establish the current baseline before attributing failures to a refactor.
- The initial roadmap said `exampleDatasets.js` was larger than any controller. Using the roadmap's LF-delimited method (count LF bytes, adding one only for a nonempty file without a final LF) on baseline commit `ed4be0c7462bbd7b199b0e5ad8e2612917879ea7`, `exampleDatasets.js` has 29,154 lines, fewer than Scatter's 31,984 and Box's 39,855. All three blobs end with LF. Its broader point that data volume is not behavioural complexity remains correct.
- [ARCHITECTURE.md](../../ARCHITECTURE.md#L24) still points to script tags near the bottom of `index.html`; the script block begins near line 61. Fix the guided route against actual source, not just by adding links.
- The loader has unconditional diagnostic `console.debug` calls at [components.js:29](../../js/main/components.js#L29) and subsequent loading branches, contrary to the project's debug-gating convention. This is a small separate maintenance issue, not a reason to redesign loading.

## Recommended decisions by phase

| Phase | Decision |
| --- | --- |
| 0: reconcile old reports | Keep. Time-box triage; it should not block independent onboarding work. Do not turn this into reproducing every historical failure before any progress. |
| 1: contributor route | Approve early, with reproducible setup and a real first-change exercise. |
| 2: loading/contracts | Approve. Add precise limits of generated evidence and verify real loading/registration rather than wrapper presence alone. |
| 3: LOWESS | Approve as a small pilot, with characterization before moving code, existing oracle retained, and placement decided first. |
| 4: projection fallbacks | Hold broad execution until state writers and capture dependencies are mapped; approve one demonstrated safe slice at a time. |
| 5: deeper component boundary | Bring responsibility assessment earlier. Require a useful developer-task outcome, or explicitly revise the programme's scope. |
| 6: shared modules | Keep conditional. Prioritize by actual coupling, change difficulty, and consumer evidence, not size. |
| 7: reassess | Keep, but define the contributor task and evaluation method before implementation. |

Before approving the larger programme, request one concrete design record for the chosen difficult boundary: current call path, state writes, proposed API and ownership, allowed dependencies, loading/disposal, exact tests, representative compatibility/performance evidence, and rollback unit. The roadmap already contains much of this vocabulary; the missing step is applying it to a real proposed boundary before committing to the migration.

## Validation performed

| Check | Result |
| --- | --- |
| `npm run quality:static` | Lint and component-contract freshness passed; stopped at stale testing inventory. Remaining chained checks did not run in that command. |
| `npm run test:bootstrap:check` separately | Passed; 101 script tags. This does not cover lazy registration. |
| `npm run test:inventory:check` separately | Passed; 345 Jest files, 262 Chromium files / 976 discovered tests, 607 manifest entries. Discovery is not execution. |
| `npm run test:python:check` | Passed; Python 3.12.10 and ten pinned packages. |
| Production-bootstrap and Scatter internal-architecture Jest files | 2 suites, 15 tests passed. |
| Scatter oracle matrix filtered to LOWESS | 1 test passed; 2 unrelated tests excluded by the filter. |
| Read-only inventory regeneration comparison | Confirmed content drift, not line-ending differences. |
| Read-only impact-planner probes | Confirmed the selection gaps described above. |

No browser suite or full Jest suite was executed. No production code, test expectations, historical reports, or original roadmap were changed. Confirmed maintenance findings were recorded in the canonical backlog without duplicating the roadmap's existing loader and large-module entries.
