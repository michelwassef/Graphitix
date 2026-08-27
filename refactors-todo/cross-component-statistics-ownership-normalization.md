GRAPHITIX — CROSS-COMPONENT STATISTICS OWNERSHIP NORMALIZATION

GOAL

Normalize the statistics sections of all Graphitix components to the owner-safe architecture now proven in ROC, while using Line only as an audited reference for specific clean patterns.

This is primarily a tab-ownership / persistence refactor. It must NOT change statistical methods, numerical results, defaults, UI behavior, graph appearance, or component-specific functionality except where a current behavior is demonstrably caused by an ownership/persistence bug.

The final result must guarantee true same-component tab isolation and exact archive reopen fidelity for:
- statistical settings;
- computed statistical results;
- statistics panel contents;
- reporting/reproducibility panels;
- advisor state;
- advanced stats controls;
- comparison selections/results;
- inference settings;
- asynchronous/worker-derived results;
- statistics-related render/cache state.

Do not implement defensive “redraw if missing” workarounds. Fix ownership and persistence at the source.


============================================================
1. READ THESE FIRST
============================================================

Before modifying code, read:

- AGENTS.md
- ARCHITECTURE.md
- issues.txt
- graphitix-tab-isolation-reviewed-findings.md
- js/shared/stats.js
- js/components/roc.js
- the statistics-related sections of js/components/line.js

Important Graphitix architecture:

1. Every workspace tab owns one component session.
2. After hydration, the live owner session is canonical.
3. Payloads are the archive/hydration representation.
4. DOM, module-level refs, controls, SVGs and stats panels are projections only.
5. Inactive same-component roots are normally DETACHED while a sibling tab is active.
6. An inactive detached tab must therefore NOT be treated as a live DOM restoration target.
7. Scheduled/async work must retain the owner tab/session and must never write to whichever tab happens to be active when it finishes.
8. Reopened .graph files must behave exactly like the original live session.
9. Do not assume Line is universally correct. AGENTS.md explicitly says Line is not a blanket template. Copy only audited patterns.
10. ROC's statistics lifecycle has just been extensively normalized and browser-tested. Use it as the strongest reference for the complete stats ownership lifecycle.


============================================================
2. WHY THIS REFACTOR IS NEEDED
============================================================

The ROC work exposed several classes of bugs that may exist in sibling components.

A typical unsafe pattern is:

    operation starts for tab A
        ↓
    explicit owner/session is known
        ↓
    downstream helper forgets that owner
        ↓
    helper uses module-global refs / active DOM / getActive...()
        ↓
    tab B becomes active
        ↓
    A's operation reads/writes B's statistics surface

ROC contained examples of this in stats capture/restore, report-host handling and advisor/result persistence.

The ROC work also established several less obvious requirements:

A. EMPTY LIVE CAPTURE MUST NOT DESTROY DURABLE RESULTS

Shared.statsReporting.capturePanelModel() can legitimately produce an empty model such as:

    {
      resultsModel: null,
      reportModel: null
    }

during a transient or empty DOM state.

An empty live capture must NOT overwrite an already valid durable stats model.

The component must retain the previous owner model unless the new capture contains meaningful component-valid content.


B. INACTIVE DETACHED DOM MUST NOT BE RESTORED

If tab A is inactive while same-component tab B is active, A's workspace root may be detached.

Do NOT manufacture/rebuild A's DOM in that state.

Correct behavior is:

    B active
    → A remains session/payload state only
    → activate A
    → bind A's refs
    → project A's controls
    → restore A's stats surface from A's durable model

This is the Line/ROC contract.


C. REPORT HOSTS MUST BE OWNER-LOCAL

Multiple tabs of one component contain duplicate internal IDs by design.

Never find an attached stats report host with a document-global ID lookup.

Shared.statsReporting.ensureReportHost() has already been corrected so an attached host is resolved inside the owning workspace root.

Components must pass the correct OWNER stats target into it.

Survival is a special case because its Cox report host is deliberately detached
(attachToTarget:false). Preserve that design explicitly.


D. ASYNC/DERIVED RESULTS MUST REACH THE OWNER PAYLOAD

ROC exposed this sequence:

    Bootstrap finishes
    → live session has correct ΔAUC result
    → visible panel is correct
    → workspace tab payload still contains old/empty result
    → tab becomes inactive
    → archive saves stale payload
    → reopen loses result

Therefore, when a user-visible derived result is successfully published:

    computation result
        ↓
    owner session
        ↓
    owner results/state
        ↓
    owning workspace payload/runtime snapshot
        ↓
    active DOM only if owner is active

If the result corresponds exactly to a frame just published, use the existing session API's render-equivalent semantics where appropriate rather than unnecessarily invalidating that frame.

Do NOT derive the destination owner from current active DOM.


E. ADVISOR CALLBACKS MUST RETAIN THEIR OWNER

Advisor toggle / answer / Apply / Reset callbacks must close over the session that owns the advisor UI.

They must not later call getActive<Component>Session...() and assume the same tab is active.

User-visible advisor mutations must also enter the normal persistence path.


============================================================
3. CURRENT COMPONENT REVIEW
============================================================

Re-audit this against the code before editing, but the current final tree has approximately the following status.


LINE

Line currently provides one of the cleanest local patterns:

    resolveLineRefsContext(session, options)
    captureLineStatsPanelModel(..., { session, refs })
    restoreLineStatsPanelModel(..., { session, refs })
    ensureLineStatsReportHost({ session, refs })

Good pattern:
once an owner context is supplied, downstream stats helpers continue using it.

Do NOT blindly copy Line's remaining active-mirror / compatibility patterns.


ROC

ROC is the reference for the complete lifecycle after the recent refactor:

- owner-specific stats refs;
- durable stats panel model;
- empty-capture fallback;
- capture at appropriate owner boundaries;
- activation-time restore;
- inactive detached-root refusal;
- owner-local report host;
- advisor callbacks bound to owner;
- comparison result owned by session;
- derived async result written through to owner payload;
- graph cache independent from durable stats state;
- archive reopen without requiring a corrective redraw.

Preserve this behavior.


SCATTER

Scatter is relatively close.

Good:
- captureScatterStatsPanelModel(session) explicitly prevents inactive sessions from reading live DOM.
- it already has substantial per-session stats/runtime machinery.

Remaining normalization candidate:
- restoreScatterStatsPanelModel() and runtime report-host helpers still resolve primarily through the current projection rather than an explicit immutable owner/ref context.

This should be one of the first migrations.


PCA

PCA already stores useful refs in its session:

    session.refs.statsSummary
    session.refs.statsResults

But capturePcaStatsPanelState() / restorePcaStatsPanelState() currently resolve targets through getPcaNodeById() without carrying an explicit owner context through the full call chain.

PCA also has TWO stats surfaces:
- pcaStatsSummary
- pcaStatsResults + report host

Normalize both together.


HEATMAP

Heatmap has session-aware stats models but capture/restore still depend heavily on:

    state.statsEl

even when a session argument exists.

This creates split authority between:
- owner session/results;
- projected state.statsEl.

Heatmap also currently includes stats DOM in its render cache.

Do not immediately delete that optimization.
First make durable stats restoration correct without it.
Then either:
- remove stats DOM from the cache; or
- formally demote it to an optional owner-validated performance cache.

A test must prove stats restore still works when the stats portion of the render cache is absent.


HISTOGRAM

Histogram owns a statsPanelModel in its session/results, but capture/restore helpers remain largely projected-target based.

Its render cache directly detaches/restores stats DOM.

Same migration principle as Heatmap:
durable model first; cached stats DOM optional only.


SURFACE

Surface still has a strong projected singleton:

    state.statsEl
    state.statsPanelModel

captureSurfaceStatsPanelModel() and restoreSurfaceStatsPanelModel() operate through those active mirrors.

Surface also caches stats DOM directly.

Normalize target/session ownership and then demote the stats DOM cache.


SURVIVAL

Survival is more complex because it has FOUR statistical panels:

- summary
- log-rank
- hazard ratios
- Cox

captureSurvivalStatsPanelModels() currently operates through module-level refs.

Its advisor also resolves an active session in several paths.

Migrate all four panels as ONE ownership unit.

Important:
the Survival Cox report host intentionally uses:

    attachToTarget: false

Do not accidentally convert this to the normal attached-host contract.


PIE

Pie requires particular care.

Its stats configuration currently combines:
- statistical settings;
- selections;
- advancedOpen;
- advisor;
- resultsModel;
- reportModel;
- context signatures.

exportPieStatsConfig() can capture the current stats DOM directly.

That means configuration serialization and live projected results are more coupled than they should be.

Refactor Pie toward a clean separation:

    owner.stats settings
    owner.advisor
    owner.results / statsPanelModel

while preserving the existing external payload schema unless a schema change is genuinely necessary.

issues.txt already mentions Pie advanced-panel ownership as a production candidate. Explicitly test:
- Advanced parameters open/closed state;
- sparse threshold;
- Yates correction;
- advisor;
- result panel;
- report;
- same-Pie-tab isolation;
- reopen.


BOX

Box is the highest-risk migration and should NOT be the first component.

It already has sophisticated canonical structures such as:
- stats results state;
- table model;
- significance results;
- assumptions;
- report;
- panel model;
- stats runtime/context;
- advisor;
- grouped statistics.

However, a number of statistics panel helpers still enter through projected:

    els.statsResults
    els.statsReportHost
    state.*

Examples to audit carefully include:
- captureBoxStatsPanelModel()
- captureBoxStatsResultsState()
- restoreBoxStatsResultsState()
- ensureBoxStatsReportHost()
- report clearing/ordering
- stats p-value toolbar
- advisor callbacks
- async statistics completion
- significance restoration

Do NOT flatten Box into a simplistic generic stats model.
Keep its richer existing owner results model and make the DOM-facing lifecycle owner-explicit.

Also preserve grouped/single replicate behavior and significance geometry.


VENN

Venn does not have the same general-purpose stats UI, but its significance results are still a persisted statistical surface:

    state.analysis.significancePanelModel
    state.ui.significanceResults

captureVennSignificancePanelModel() and restoreVennSignificancePanelModel() are projected-state based.

Normalize this last because Venn's architecture differs from the other components and AGENTS.md explicitly warns against force-fitting Venn into shared component patterns.

Do NOT mix this task with GO/STRING/UniProt ownership unless the stats refactor actually exposes a related root cause.


============================================================
4. TARGET STATS OWNERSHIP CONTRACT
============================================================

Every migrated component must satisfy all of the following.


4.1 OWNER CONTEXT

Provide one component-local owner resolver equivalent in spirit to:

    resolve<Component>StatsContext(session, options)

or reuse an already-clean equivalent.

It should return/resolve only data belonging to that owner, for example:

    {
      session,
      tabId,
      root,
      refs,
      stats target(s)
    }

Do not create another module-global durable registry.

If the component already has a generic owner refs resolver, reuse it instead of adding a second stats-specific system.


4.2 SESSION REFS

Stats-related DOM refs should live in the owner session refs where appropriate:

    session.refs.statsResults
    session.refs.statsSummary
    ...

These refs are runtime pointers only.

They must be cleared/rejected when disconnected or when they do not belong to the session's root.

Module-level refs may mirror the CURRENT owner only.


4.3 CAPTURE

Every stats model capture helper must receive or resolve the owner.

Rules:

- Only read live stats DOM if that DOM belongs to the owner and is valid for live capture.
- Never capture active tab B's DOM into inactive tab A.
- If A is inactive/detached, return A's durable model.
- Normalize the capture.
- Reject an empty/transient capture when a previous durable model exists.
- Do not invent one universal "has content" detector by copying Line blindly.
  Each component's valid model shapes must be respected.
- Never let a transient empty panel erase real persisted results.


4.4 RESTORE

Restore must preserve the explicit owner all the way down.

Never:

    restore(ownerA)
      → helper
      → getActiveSession()
      → global refs.statsResults

Correct:

    restore(ownerA)
      → ownerA refs/root
      → ownerA stats target
      → restore

If owner A is inactive and its root is detached:
- do NOT mutate it;
- return a clear "not restored now" result;
- retain durable state;
- restore when A activates.


4.5 ACTIVATION

Same-component activation order must be:

    resolve active tab
    → resolve owner session
    → bind owner mirrors
    → bind owner DOM refs
    → project stats controls/advisor
    → restore durable stats panel if appropriate
    → restore/render graph

Never capture the previous sibling's DOM during this transition.


4.6 REPORT HOST

All normal attached report hosts must use:

    Shared.statsReporting.ensureReportHost(ownerStatsTarget, ...)

The target must already belong to the correct owner root.

Do not use document-global lookup in component code.

Keep Survival's explicitly detached host as an explicit special case.


4.7 ADVISOR

Advisor state must be session-owned.

Callbacks must capture the owner session/ref context at render/bind time.

For:
- toggle;
- answer;
- Apply;
- Reset;

do:

    mutate owner session
    → update canonical owner state
    → update payload/runtime through standard session APIs
    → redraw/project only that owner if appropriate

Do not rediscover the owner from whichever component tab is active at callback completion.


4.8 DERIVED / ASYNC STATISTICAL RESULTS

Workers, bootstrap, permutation, Monte Carlo, embedding-related stats or other delayed work must retain:

    tabId
    owner session
    generation/token when appropriate
    computation signature

On completion:

    verify owner/token/signature
    → commit result to owner session
    → commit durable panel/report/result representation
    → update owner workspace payload/runtime
    → render only if owner is still active

Never write a result only to:
- live DOM;
- module-global state;
- active payload.

The ROC Bootstrap persistence bug is the canonical example to avoid.


4.9 PAYLOAD CAPTURE

getPayload() / runtime capture / deactivation capture must use the owner session.

Active DOM may be harvested only when:
- that session is the active owner;
- the refs belong to it;
- the DOM is authoritative enough to capture.

Inactive payload capture must never activate the tab merely to read its DOM.


4.10 RENDER CACHE

Stats models are durable state.
Render cache is an optimization.

A component must be able to restore its stats after reopen/tab switch even if the cached stats DOM is absent.

For Histogram/Heatmap/Surface, which currently cache stats DOM:
1. first prove durable restore independently;
2. then decide whether stats DOM caching has measurable value;
3. if retained, validate owner/signature/generation and rehydrate interactions;
4. never use cached stats DOM as the canonical source.

Do not remove a useful optimization without first proving it is redundant.


============================================================
5. IMPLEMENTATION ORDER
============================================================

Do this incrementally.


PHASE 0 — CHARACTERIZATION / NO BEHAVIOR CHANGE

Before production edits:

- map stats settings/results/advisor/panel/report ownership for each component;
- identify stats DOM targets;
- identify every capture/restore call;
- identify report-host creation;
- identify delayed callbacks;
- identify async/worker result publication;
- identify payload/runtime/deactivation capture;
- identify render-cache interaction.

Record any newly confirmed problem in issues.txt, avoiding duplicates.

Do not call every suspicious projected ref a bug until its caller/activation invariant has been checked.


PHASE 1 — SCATTER + PCA

Reason:
they already have relatively strong session/ref infrastructure.

Scatter:
- make restore/report host owner-explicit;
- keep the existing inactive-capture protection.

PCA:
- make summary + results + report host owner-explicit;
- use existing session.refs.statsSummary/statsResults;
- stop capture/restore from implicitly selecting the projected PCA tab.

Run all targeted tests before continuing.


PHASE 2 — HEATMAP + HISTOGRAM + SURFACE

Normalize:
- stats targets;
- capture;
- restore;
- report hosts;
- payload/runtime ownership.

Then explicitly test operation WITHOUT stats DOM render-cache restoration.

Only after that decide whether cached stats DOM should remain as an optional optimization.


PHASE 3 — PIE + SURVIVAL

Pie:
- separate owner settings/advisor/results internally;
- normalize advanced-panel ownership;
- remove inactive DOM dependence from export/capture.

Survival:
- migrate all four stats panels together;
- owner-bind advisor callbacks;
- preserve detached Cox report-host semantics.


PHASE 4 — BOX

Perform only after the owner context approach has passed in smaller components.

Do not redesign Box statistics.

Normalize its existing rich stats state so:
- every panel operation knows the owner;
- async result publication reaches owner session/payload;
- advisor is owner-bound;
- report host is owner-local;
- significance state remains owner-specific;
- grouped/single stats remain identical numerically and visually.

This phase deserves its own focused audit because Box is very large and statistically complex.


PHASE 5 — VENN

Normalize only Venn's significance stats surface using Venn-native owner/session mechanisms.

Do not force a generic multi-component abstraction onto Venn.


PHASE 6 — LINE AUDIT

Line is a reference, but after the other migrations re-audit it against the final common contract.

Change Line only where a genuine mismatch remains.

Do not refactor Line merely for cosmetic uniformity.


============================================================
6. TEST CONTRACT FOR EVERY COMPONENT
============================================================

Each migrated component must receive a SAME-COMPONENT TWO-TAB regression.

Use tabs A and B with deliberately different statistical configurations/results.

At minimum test:

1. A computes/populates stats.
2. B computes/populates different stats.
3. A and B sessions contain different canonical stats.
4. Their report hosts are distinct.
5. The active session's stats refs point into its own root.
6. Switch A → B → A repeatedly.
7. No results/settings/advisor/report state crosses tabs.
8. While B is active, confirm A is inactive/detached.
9. Attempting a live restore for inactive detached A must NOT mutate B and must not manufacture A's detached DOM.
10. Activate A.
11. A's stats surface must restore from A's durable model.
12. B's durable stats remain unchanged.
13. Save archive while at least one stats-bearing sibling is inactive.
14. Reopen.
15. Verify exact A/B settings, advisor state, result text/model and reporting panel.
16. Do NOT call draw() merely to make the assertion pass if durable panel restoration is expected.
17. First post-reopen interaction must operate on the correct owner.
18. An empty/transient panel capture must not erase a valid durable result.
19. Duplicate report-host IDs across tabs must remain owner-local.
20. If async statistics exist:
    - start work for A;
    - switch to B;
    - completion must patch A only;
    - B must remain unchanged;
    - A's owner payload must receive the finished result.

Additional component-specific coverage:

PCA:
- summary panel and results panel independently.

Pie:
- Advanced parameters;
- sparse threshold;
- Yates;
- advisor;
- comparison selections/results.

Survival:
- summary;
- log-rank;
- hazard ratios;
- Cox;
- detached report host.

Box:
- single/grouped;
- assumptions;
- pairwise/omnibus results;
- significance;
- stats results tabs;
- advisor;
- asynchronous calculations where applicable.

Histogram/Heatmap/Surface:
- repeat restore with the stats DOM portion of render cache deliberately unavailable.

Venn:
- significance result panel only; keep unrelated enrichment tests separate.


============================================================
7. TEST QUALITY RULES LEARNED FROM ROC
============================================================

Do NOT repeat the mistakes encountered during the ROC refactor.

A. Do not make source-contract tests depend on brittle exact function boundaries such as:

    "function saveFile()"

when the actual declaration may be:

    "async function saveFile()"

Prefer runtime/behavioral tests.

If a source-level contract test is genuinely useful, use stable markers or AST/structural logic rather than assumptions about the next function declaration.


B. Do not test an architecturally invalid intermediate state.

Specifically:
an inactive detached tab is NOT expected to accept live DOM restoration.

Test the correct final invariant:
restore when that owner becomes active.


C. Do not hide restoration defects with draw().

If the durable stats model should restore a panel, activating/reopening the tab must prove that directly.

A forced redraw can mask the exact bug being tested.


D. Do not use large Monte-Carlo defaults in tests whose purpose is ownership/persistence.

If a Bootstrap/Permutation/Monte-Carlo test is testing persistence rather than numerical convergence, set a small deterministic iteration count through the component's canonical API BEFORE triggering the expensive operation.

Do not change production defaults merely to make tests fast.


E. Add useful failure diagnostics.

For same-component isolation failures report, where useful:

- tabId;
- active owner;
- session result model presence;
- target/root identity;
- target.isConnected;
- refs owner match;
- report-host parent/root;
- payload result;
- live result;
- advisor settings;
- report metadata.

A failed E2E should tell us WHICH contract broke.


============================================================
8. SHARED ABSTRACTION POLICY
============================================================

Do not immediately create a giant Shared.statsOwnership manager.

The components differ substantially:
- PCA has two stats panels;
- Survival has four;
- Box has a rich results model;
- Venn has a significance-only panel;
- Pie mixes contingency-specific settings;
- some report hosts are detached.

First normalize two or three components using small component-local owner resolvers.

Then inspect the resulting duplication.

Only extract a shared primitive when it is genuinely identical across components.

Likely shared candidates may eventually include:
- normalize panel model;
- capture-with-nonempty-fallback;
- owner-root/target validation;
- report-host ownership assertions;
- generic stats model restore outcome handling.

Component-specific:
- session lookup;
- targets;
- result schema;
- advisor contents;
- async calculations;
- payload structure.

Shared.statsReporting should remain responsible for rendering/capturing generic statistics DOM.
Component sessions remain responsible for ownership.


============================================================
9. DEFINITION OF DONE FOR EACH COMPONENT
============================================================

A component is NOT normalized merely because its tests pass.

It is done only when:

- durable statistical state belongs to its tab session;
- stats DOM is only a projection;
- explicit owner context is never dropped downstream;
- inactive sessions never read active DOM;
- disconnected refs are rejected;
- empty live captures cannot destroy durable results;
- report hosts cannot cross same-component tabs;
- advisor callbacks retain their owner;
- delayed/async results patch their originating owner;
- finished derived results reach the owner's persisted payload;
- activation restores the owner's stats surface;
- archive reopen restores settings/results/advisor/report without corrective redraw;
- render cache is optional rather than authoritative for statistical state;
- no redundant parallel source of truth has been introduced.


============================================================
10. REPOSITORY HYGIENE
============================================================

For every phase:

- fix root causes, not symptoms;
- compare sibling components before introducing component-specific code;
- remove old code only after proving it is unused;
- do not add compatibility code for nonexistent legacy files;
- preserve CRLF/LF formatting already used by each source file;
- run git diff --check;
- update issues.txt for confirmed remaining issues, avoiding duplicates;
- update CHANGELOG.md for completed refactors;
- update ARCHITECTURE.md / generated component-contract docs if the public architecture changes;
- regenerate architecture documentation if registries/dependency maps change.

Keep the existing broad P1 stats/tab-isolation issue open until ALL component migrations and the final cross-component matrix pass.


============================================================
11. FINAL VALIDATION
============================================================

After EACH component/batch:

1. Run component-specific Jest suites.
2. Run stats persistence/restore Jest suites.
3. Run targeted same-component Chromium isolation/reopen tests.
4. Run component-specific reopen tests.
5. Run npm run test:suggest -- --files <changed files> and assess its recommendations.
6. Run relevant render-cache tests if cache behavior changed.
7. Run inactive-payload-capture isolation coverage.

After ALL components are normalized:

- run the complete stats.same-component isolation/reopen matrix;
- run component.persistence-matrix;
- run inactive-payload-capture-isolation;
- run render-cache persistence contracts;
- run the full targeted Jest integration set;
- run the full Chromium tab-isolation regression matrix;
- investigate every remaining failure individually;
- do not classify failures as harness defects without evidence.

Only then close/update the corresponding P1 in issues.txt.


============================================================
12. REQUIRED DELIVERABLES
============================================================

For every implementation phase provide:

- concise root-cause / architectural assessment;
- complete list of modified files;
- root-relative git patch applicable from Graphitix root;
- updated clean Graphitix ZIP;
- targeted Jest results;
- targeted Chromium Playwright results;
- one copy-paste-ready Windows PowerShell test block;
- explicit distinction between tests actually run by the agent and tests left for the user;
- any remaining risks/issues.

Do not deliver an incremental patch that depends on one of your earlier patches unless explicitly requested.
Work from the CURRENT code supplied for that phase.


============================================================
13. IMPORTANT IMPLEMENTATION PRINCIPLE
============================================================

Do not interpret this task as:

    "make every component look textually like ROC or Line"

Interpret it as:

    "give every stats-producing component the same ownership invariants,
     while preserving the component's own statistical model and UI."

The invariant is the thing being standardized, not the exact code shape.

If, during a component migration, you discover that the required correction belongs in shared infrastructure rather than that component, STOP the local workaround and fix/describe the shared architectural cause first.

The program must be cleaner and easier to reason about after every phase.