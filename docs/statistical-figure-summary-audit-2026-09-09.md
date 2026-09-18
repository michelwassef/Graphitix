# Statistical Figure Summary Audit

**Audit date:** 2026-09-09  
**Scope:** New uncommitted SVG summary-table feature for graph-associated statistics  
**Audited workspace:** `C:\Users\Michel\Graphitix`  
**Audit mode:** Initial audit plus 2026-09-09 defect-resolution follow-up

## Executive assessment

The feature has a strong technical foundation:

- one shared renderer is used across all 11 graph components;
- summary state is owner-scoped and persisted;
- resize, SVG export, reopen, recovery, and focused tab-isolation paths are covered, including the recovered Venn render-cache path;
- the two-column typography, wrapping, horizontal rules, and graph-envelope extension are appropriate publication-oriented choices.

The feature is now publication-oriented and materially safer. The visible projection remains compact by design, but its selection is traceable, essential context is retained for the affected analyses, omissions are disclosed, and the same normalized model feeds SVG, accessible HTML, and structured export. The Venn lifecycle and recovered-cache geometry defects documented below remain resolved.

**Release recommendation: the six findings in this audit are resolved in the working tree.** Broader component-level archive and statistical-method debt remains outside this feature audit.

## First-principles re-audit — 2026-09-09

The central conclusion remains valid, but the original wording was too broad in several places.

The correct product contract is not “put the complete statistical report inside the figure.” A publication figure may use a compact, selective summary when the selection is deliberate, traceable, and disclosed. The separate full report remains the authoritative detailed record. The defect is that the current projection does not consistently disclose when it is compact, and its component-specific rules do not consistently protect the information needed to interpret the displayed result.

The reporting baseline used here is appropriate for biomedical/publication-oriented output, but it is not a universal journal rule. Nature asks for sample sizes, test direction, assumptions/corrections, estimates and uncertainty, test statistics, effect sizes, degrees of freedom, and exact P values where suitable. SAMPL similarly asks for group sizes, descriptive statistics, effect estimates, precision, numerators/denominators where relevant, and multiplicity reporting. These requirements should be applied according to the analysis type, not as one fixed row template. [Nature Reporting Summary](https://www.nature.com/documents/nr-reporting-summary-flat.pdf), [SAMPL Guidelines](https://www.equator-network.org/wp-content/uploads/2013/03/SAMPL-Guidelines-3-13-13.pdf)

### Corrections to the original audit

- The `α = 0.005` claim in F-04 was incorrect. `formatCompactNumber()` increases significant digits for values below one, so the current formatter preserves values such as `0.005` and `0.015`. That claim is removed.
- The P-value concern remains valid, but it is a precision-policy problem rather than an unconditional violation: SAMPL permits a display floor of `P < 0.001`, whereas Nature asks for exact P values whenever suitable. The application chooses the conventional `P < 0.001` floor for compact figure summaries; detailed reports and source-faithful outputs retain their finer bound or exact value.
- The ROC/PR cutoff concern is conditional. Cutoffs and sensitivity/specificity or precision/recall/F1 are essential when the figure supports a diagnostic decision threshold; they are not required in every descriptive AUC/average-precision figure. The current model excludes them without an omission marker, so the gap is real but context-dependent. [STARD 2015 checklist](https://www.equator-network.org/wp-content/uploads/2015/03/STARD-2015-checklist.pdf)
- The font mismatch is a style-consistency recommendation, not a scientific-validity blocker. The hard-coded title is a separate, confirmed semantic defect because descriptive summaries are rendered as `Statistics`.
- The accessibility finding is a representation gap, not a claim that the SVG has already failed a formal WCAG conformance audit. The renderer exposes text nodes and data attributes, but not table row/cell semantics or a dedicated structured summary export. W3C recommends text alternatives for non-text content and table markup for tabular information where applicable. [WCAG 2.2](https://www.w3.org/TR/wcag/), [W3C table technique H51](https://www.w3.org/WAI/WCAG22/Techniques/html/H51.html)

### Re-audit conclusion

The six release findings are resolved in the working tree. This audit does not establish that any underlying statistical calculation is numerically wrong; it audits the figure-summary projection, reporting contract, and presentation. The separate full-report probability-formatting issue remains outside this remediation.

The root issue is architectural: one canonical structured model is projected through component-specific compact selectors. The selectors now define essential rows explicitly and intentionally omit lower-priority detail from the short figure view; the full report remains the authoritative destination for that detail. The same validated model feeds SVG, accessible HTML, and structured export. Legacy readiness also depends on a valid figure-summary model, not merely on the existence of a report object.

## Implementation resolution — 2026-09-09

The audit findings were addressed at the shared projection boundary and then aligned in the affected component builders:

- F-01: compact selection now has an explicit essential-row contract. Required rows may exceed the nominal compact budget deliberately; lower-priority detail is omitted without adding audit prose to the user-facing short summary.
- F-02: Box reports post-exclusion group sample sizes; Survival retains every group’s sample size, events, censoring count, and median-survival summary; ROC/PR retains computed threshold metrics; Heatmap reports the significant-pair result as a key result; Surface retains geometry, mesh, range, exclusions, and resource-limit context; Pie reports the overall denominator; Histogram reports the per-series `n` for displayed goodness-of-fit rows.
- F-03: report registration validates a non-empty structured figure-summary model. Legacy reports without one remain unavailable to the Summary table control, and a stale report registry entry is cleared.
- F-04: raw structured P-value tokens are formatted before generic report text rendering; the compact figure uses the documented `p < 0.001` display floor for very small values, zero-valued tail results are never rendered as `p = 0`, detailed reports retain the source value, and finite values outside `[0, 1]` are reported as invalid/unavailable rather than clamped.
- F-05: the SVG remains the publication projection, while the mounted owner-scoped projection also exposes a semantic HTML table with scoped headers and Download/Copy CSV, Excel, and JSON actions.
- F-06: the SVG title now follows the normalized model: inferential summaries use “Statistical summary” and descriptive summaries use “Analysis summary.”

Focused validation after the implementation:

- Jest: **6 suites, 52 tests passed**, including renderer, reporting-matrix, persistence, state, Box reporting, and semantic table contracts.
- Chromium: **23 tests passed** across all 11 component render checks, live resize, reopen/recovery, and same-component tab isolation.

The compact SVG and semantic/export projection now consume the same validated normalized model. The full analysis report remains the authoritative record for rows intentionally omitted from the compact figure projection; the short summary does not expose an internal “Coverage” row.

### Denominator and diagnostic-sample-size follow-up — 2026-09-09

The first-principles recheck identified two interpretation-critical values that were already available from the calculations but were dropped by presentation models:

- Pie goodness-of-fit and overall homogeneity summaries now carry the computed overall `N` into both the compact figure summary and the ordinary overall statistics table. Pairwise rows retain their existing per-comparison totals.
- Histogram goodness-of-fit rows now carry the finite-observation count for their own series. The total across visible series remains in the Analysis row, but it no longer substitutes for per-series `n`.

The fix is at the canonical report-model boundary; no completeness or Coverage row was added. Focused validation passed: the reporting matrix passed 20 tests, and the mounted Pie statistics branch passed its targeted UI test.

## Validation performed

### Static checks

- `node --check js/shared/statsFigureSummary.js`
- `node --check js/shared/stats.js`
- `node --check js/shared/exporter.js`
- staged feature diff whitespace check

All passed.

### Focused Jest

Passed: **4 suites, 41 tests**.

Covered areas include:

- reporting matrix builders;
- summary state capture/apply and persistence;
- renderer ownership and geometry;
- multiline SVG export baseline handling.

### Focused Chromium

Passed: **19 tests**.

Covered areas include:

- all 11 components rendering a summary;
- summary hide/show;
- resize and redraw;
- font-toolbar editing;
- Box reopen/recovery;
- recovered Venn render-cache spacing;
- same-component Box isolation.

These tests establish lifecycle and geometry confidence. They do not establish statistical completeness, accessibility, exact-value preservation, legacy-report behavior, or all-component reopen/isolation parity.

## Follow-up runtime evidence: Venn same-component switch and resize (historical diagnosis)

The user-reported Venn failure is only partially predicted by this audit. The test-gap section correctly identified the missing all-component same-component isolation coverage, but the audit's broader statement of geometry confidence was too strong: the focused browser coverage exercised this path for Box, not Venn.

The supplied log confirms an owner-local stale-geometry failure, not a statistics-content leak between tabs:

- Venn activation takes the `workspace reuse without redraw` path after same-component cache reuse: [domControls.js:1830](/C:/Users/Michel/Graphitix/js/main/domControls.js:1830).
- The Venn renderer uses the generic `autoResizeSvg` viewport path directly after drawing: [venn.js:9952](/C:/Users/Michel/Graphitix/js/components/venn.js:9952) and [venn.js:11127](/C:/Users/Michel/Graphitix/js/components/venn.js:11127).
- Venn's resizer callback deliberately skips `observe` (the phase visible in the supplied log), so that frame change does not schedule a Venn redraw: [venn.js:11542](/C:/Users/Michel/Graphitix/js/components/venn.js:11542).
- The summary renderer publishes its table through the separate `stageGraphContentViewport` extension path: [statsFigureSummary.js:1398](/C:/Users/Michel/Graphitix/js/shared/statsFigureSummary.js:1398).
- Venn does not emit the `draw-settled` lifecycle event that the summary renderer uses to re-project after a completed redraw; the sibling Box path does: [box.js:38422](/C:/Users/Michel/Graphitix/js/components/box.js:38422), [statsFigureSummary.js:1668](/C:/Users/Michel/Graphitix/js/shared/statsFigureSummary.js:1668).
- The log then shows a hidden-panel `ResizeObserver` sync and graph-size authority update after activation, without evidence of a matching Venn summary re-projection.

This explains the screenshot: the summary rows remain present and contain the correct report, but their transform/reserve is stale relative to the current Venn graph frame, so the table is painted over the circles. The `requestAnimationFrame` violation is a timing/performance symptom, not the root cause.

Before repair, this was a release-blocking rendering/lifecycle defect. A local cleanup or arbitrary delay would not establish the required owner/frame invariant.

### Resolution status — 2026-09-09

The defect is resolved in the working tree at the owner-binding boundary:

- Venn passive root rebinding now refreshes the tab-owned table panel, graph panel, panel resizer, and SVG frame together: [venn.js:12997](/C:/Users/Michel/Graphitix/js/components/venn.js:12997). This prevents a returned tab from drawing with the other same-component tab's frame.
- Venn draw completion now emits an owner-scoped `draw-settled` event: [venn.js:13267](/C:/Users/Michel/Graphitix/js/components/venn.js:13267). The shared summary projection can therefore rerender after the graph has replaced its SVG content.
- The summary renderer now reprojects after an observer-driven layout change: [statsFigureSummary.js:1642](/C:/Users/Michel/Graphitix/js/shared/statsFigureSummary.js:1642).
- Regression coverage now exercises two Venn tabs, summary enabled on one, resize on the other, and return to the first while asserting screen-space separation between circles and summary: [stats.figure-summary.tab-isolation.spec.js:110](/C:/Users/Michel/Graphitix/e2e/stats/stats.figure-summary.tab-isolation.spec.js:110).

Focused validation after the repair:

- Jest: **2 suites, 22 tests passed** (`stats.figureSummary.renderer.contract.test.js`, `venn.tabRuntime.test.js`), including the legacy-cache compatibility case.
- Chromium: **2 same-component summary-isolation tests passed**.
- Chromium: **15 shared summary layout/live-resize tests passed**, including all 11 component render checks.
- Chromium: **9 Venn restore/recovery tests passed**.

The original Venn overlap finding is therefore closed. The overall publication-readiness recommendation remains **hold** because F-01 through F-06 are still open audit findings.

## Findings

### F-01 — High: silent and inconsistent row truncation — resolved

The renderer declares a five-row compact limit, but `required:true` bypasses that limit. Box, Line, ROC, and Venn can therefore exceed five rows, while other components are truncated. The five-row number is not itself a scientific requirement; the confirmed defect is the absence of an explicit, consistent completeness contract and omission disclosure.

Evidence:

- compact limit: [statsFigureSummary.js:702](/C:/Users/Michel/Graphitix/js/shared/statsFigureSummary.js:702);
- limit bypass: [statsFigureSummary.js:746](/C:/Users/Michel/Graphitix/js/shared/statsFigureSummary.js:746);
- required component rows: [statsFigureSummary.js:844](/C:/Users/Michel/Graphitix/js/shared/statsFigureSummary.js:844);
- explanatory/omission rows are filtered: [statsFigureSummary.js:703](/C:/Users/Michel/Graphitix/js/shared/statsFigureSummary.js:703).

The screenshots already show this inconsistency: the XY summary displays more than five result rows, while Survival displays no group-level rows.

The Survival renderer selects the analysis, log-rank, one hazard-ratio result, and model fit, but can omit every group’s `n`, events, censoring count, and median survival. The test suite explicitly encodes that omission: [renderer contract test:529](/C:/Users/Michel/Graphitix/__tests__/dom/stats.figureSummary.renderer.contract.test.js:529).

This is unsafe because a reader may interpret the visible summary as complete. Scientific reporting guidance expects group sizes, estimates, uncertainty, test statistics, degrees of freedom, P values, and multiplicity information, subject to the analysis type. See the [Nature reporting summary](https://www.nature.com/documents/nr-reporting-summary-flat.pdf) and [SAMPL guidelines](https://www.equator-network.org/wp-content/uploads/2013/03/SAMPL-Guidelines-3-13-13.pdf).

**Required direction:** define a bounded, explicit projection contract. Essential rows must always survive. Optional detail may be omitted from the short figure summary; omission accounting belongs to the canonical report/model, not in the user-facing result table.

### F-02 — High: essential information is missing from several component summaries — resolved

The current builders do not consistently preserve the minimum information needed to interpret the displayed analysis. This finding is about the figure projection, not about whether the full report or the underlying calculation contains the information.

| Component | Concern |
|---|---|
| Box | The visual result generally contains the test, statistic, df, difference, CI, P value, and effect size, but not explicit group sample sizes for ordinary two-group analyses. |
| Survival | Group `n`, events, censoring, and median-survival rows can all disappear from the visual summary. |
| ROC/PR | Cutoff, sensitivity, specificity, precision, recall, and F1 rows are marked metadata and excluded from the figure projection: [roc.js:5586](/C:/Users/Michel/Graphitix/js/components/roc.js:5586). This is a defect when the figure is used to communicate a diagnostic threshold, but not necessarily for a descriptive AUC/average-precision figure. |
| Heatmap | Pairwise results are reduced to a small leading subset. Some tested pairs have no visible omission notice; when the builder does add a “showing 5” notice, the compact selector can still display only the first few of those rows. |
| Surface | The canonical model includes excluded-row and resource-limit warnings, but the compact renderer selects only geometry and range rows. |
| Venn | Full overlap families are retained, but required rows can make the output arbitrarily large. |

For diagnostic curves used to support a classification decision, cutoff and accuracy reporting are particularly important. STARD recommends reporting the definition of positivity cutoffs and estimates of diagnostic accuracy with precision such as 95% confidence intervals. See the [STARD 2015 checklist](https://www.equator-network.org/wp-content/uploads/2015/03/STARD-2015-checklist.pdf).

### F-03 — High: legacy saved reports can enable an empty summary — resolved

Older saved statistics reports have no `figureSummary` field. The restore path still appends and registers those reports:

- old report normalization permits `figureSummary: null`: [stats.js:2104](/C:/Users/Michel/Graphitix/js/shared/stats.js:2104);
- restoration calls `appendReportPanel`: [stats.js:3524](/C:/Users/Michel/Graphitix/js/shared/stats.js:3524);
- registration accepts any report object: [statsFigureSummary.js:1611](/C:/Users/Michel/Graphitix/js/shared/statsFigureSummary.js:1611);
- control readiness checks only registry presence: [stats.js:2562](/C:/Users/Michel/Graphitix/js/shared/stats.js:2562).

Result: a legacy file can show an enabled Summary table checkbox that renders no summary.

**Required direction:** register a report only when it contains a valid structured figure-summary model. For legacy reports, either regenerate the model from canonical statistics or keep the control disabled. Add a legacy archive regression for every component type.

### F-04 — Medium/high: compact formatting loses useful precision — resolved for the figure-summary projection

The summary formatter converts source-reported lower bounds such as `p < 0.0001` to the conventional compact floor `p < 0.001`: [statsFigureSummary.js:487](/C:/Users/Michel/Graphitix/js/shared/statsFigureSummary.js:487). This behavior is intentional for the figure projection; detailed reports remain more precise.

The formatter clamps out-of-range finite P values into `[0, 1]`, which can hide an upstream statistical defect. This overlaps the existing open issue in `issues.txt` concerning invalid P-value clamping.

**Required direction:** apply the documented `p < 0.001` floor only to compact lower-tail/equality displays, never reverse an explicit upper-tail comparator, and keep source operators and precision in detailed/source-faithful outputs. Do not silently clamp invalid probabilities; show an unavailable/invalid result instead.

This aligns with [Nature’s reporting requirements](https://www.nature.com/documents/nr-reporting-summary-flat.pdf), which request exact P values whenever suitable, while adopting the common compact-figure convention supported by SAMPL: report values below the reporting floor as `P < 0.001`. The distinction between compact and detailed/source-faithful output is deliberate and documented.

### F-05 — Medium: the output is visual SVG text, not a semantic table — resolved

The UI calls the control “Summary table”: [index.html:325](/C:/Users/Michel/Graphitix/index.html:325). The renderer creates an SVG group containing text nodes rather than a semantic table: [statsFigureSummary.js:1270](/C:/Users/Michel/Graphitix/js/shared/statsFigureSummary.js:1270).

There is no accessible row/cell structure, structured summary export, or dedicated CSV/TSV representation. This limits screen-reader access, copy/paste reuse, and reproducible extraction from a publication figure. This is a product/accessibility gap; formal WCAG conformance requires a separate accessibility evaluation.

**Required direction:** retain the SVG projection for figures, but expose the same structured model through an accessible HTML table and a text/CSV/TSV export path. Add SVG title/description metadata where appropriate.

### F-06 — Medium: publication style and title semantics are inconsistent — title semantics resolved

The summary defaults to Georgia/Times: [statsFigureSummary.js:9](/C:/Users/Michel/Graphitix/js/shared/statsFigureSummary.js:9), while the visible publication preset describes Arial/Helvetica. A separate serif choice may be defensible, but it should be deliberate, documented, and consistent with the selected publication preset.

The renderer also hardcodes the title “Statistics” and ignores the model’s distinction between “Statistics” and “Analysis summary”: [statsFigureSummary.js:1156](/C:/Users/Michel/Graphitix/js/shared/statsFigureSummary.js:1156). Descriptive PCA, Surface, and non-inferential summaries should not be presented as inferential statistics. This title issue is a correctness finding; the font mismatch is a lower-priority style finding.

## Positive design decisions

- Canonical structured report models are used instead of scraping visible report text.
- State is owner-scoped and persisted through the shared statistics-reporting contract.
- The summary extends the SVG content envelope without resizing the canonical graph frame.
- Multiline values wrap instead of using ellipsis.
- Horizontal rules and the absence of vertical boxes are appropriate restrained table styling.
- Export sanitization correctly handles summary multiline baselines and child `tspan` spacing.
- PCA and Surface avoid inventing inferential statistics when only descriptive information exists.

## Historical test gaps identified before remediation

Add focused tests for:

1. legacy report models without `figureSummary`;
2. exact and bounded P-value preservation;
3. alpha/FDR values such as `0.005` and `0.015`;
4. invalid P values outside `[0, 1]`;
5. large Box, Heatmap, ROC, Venn, and Survival result families;
6. explicit omission notes and bounded output height;
7. all-component reopen and same-component tab isolation;
8. accessibility and structured table export;
9. cutoff metrics for ROC/PR;
10. preservation of exclusions/resource-limit warnings.

## Acceptance criteria applied

The feature should be considered publication-ready only when:

- every visible result is traceable to a structured canonical row;
- essential denominators, sample sizes, effects, uncertainty, test statistics, df, P values, and corrections are retained;
- the short table contains only essential parameters and key results; the complete report remains available for additional detail;
- exact source precision is preserved unless a documented display policy applies;
- legacy files never expose an enabled-but-empty summary;
- figure output, accessible table output, and exported structured data use the same model;
- all 11 components pass focused summary rendering, with representative reopen/recovery and same-component isolation coverage; broader all-component archive parity remains a separate test program.

## Follow-up runtime evidence: recovered Venn cache spacing

The later recovered-file screenshot exposed a second Venn geometry defect that was not covered by the first repair. The graph and summary belonged to the correct tab and the report text was intact, but the recovered figure contained a large blank interval between the circles and the table.

The supplied recovery log shows the relevant sequence: the archive render cache was promoted to runtime, the workspace cache was restored, and the summary/statistics projection was rebuilt. The root cause was the Venn render-cache contract. `captureRenderCache()` detached the stage children and saved only the SVG presentation attributes. It did not save the SVG data attributes that describe the canonical graph viewport, the graph-content envelope, and the summary base viewport. On recovery, the summary group was restored with a viewBox already including its old bottom reserve, but the renderer had no saved base viewport from which to remove that reserve. It captured the expanded viewBox as the new graph base and added the summary reserve again.

This was a persistence-boundary defect, not a layout timing problem. The root fix is now in Venn cache serialization: SVG root `data-*` publication metadata is captured with the root state, stale root data attributes are cleared on restore, and the serialized metadata is reapplied before the cached graph children are projected: [venn.js:13680](/C:/Users/Michel/Graphitix/js/components/venn.js:13680) and [venn.js:13721](/C:/Users/Michel/Graphitix/js/components/venn.js:13721). This preserves the distinction between the graph base viewport and the outward summary extension through crash recovery and same-component remounts.

Regression coverage now creates two Venn tabs, enables the summary on the first, creates a recovery archive, reloads it, returns to the summary owner, and asserts that the recovered graph-to-table gap remains bounded and non-overlapping: [stats.figure-summary.reopen-recovery.spec.js:118](/C:/Users/Michel/Graphitix/e2e/stats/stats.figure-summary.reopen-recovery.spec.js:118).

Focused validation after this repair:

- Jest: **2 suites, 22 tests passed** (`stats.figureSummary.renderer.contract.test.js`, `venn.tabRuntime.test.js`), including the legacy-cache compatibility case.
- Chromium: **2 summary reopen/recovery tests passed**, including the new Venn recovery case.
- Chromium: **2 same-component summary-isolation tests passed**.
- Chromium: **9 existing Venn restore/recovery tests passed**.

The recovered-file spacing defect is closed in the working tree. The publication-readiness recommendation remains **hold** because F-01 through F-05 and the F-06 title-semantics issue remain open; the F-06 font mismatch is not a release blocker.

The first-principles renderer recheck also passed: **1 Jest suite, 19 tests passed** (`stats.figureSummary.renderer.contract.test.js`). This confirms the current implementation and its intentional compact-selection behavior; it does not validate the scientific completeness of that behavior.

The repair also identified a broader maintainability risk, recorded separately in `issues.txt`: specialized SVG cache serializers still duplicate root-state contracts in Heatmap and Surface. No sibling failure is claimed without reproduction, but a shared graph-viewport metadata capture/restore helper should be implemented before declaring recovery fidelity complete for every summary-enabled component.

## Implementation follow-up — shared cache state and live resize — 2026-09-09

The identified recovery and resize defects are now fixed in the working tree.

The root cache-state problem was broader than Venn: specialized SVG cache paths in Venn, Heatmap, and Surface each carried their own partial root-state serializer. The shared [`Shared.graphViewport.captureSvgRootState()` and `restoreSvgRootState()` contract`](/C:/Users/Michel/Graphitix/js/shared/dom.js:61) now captures and restores publication attributes, all SVG root `data-*` viewport/envelope metadata, and configured inline styles. Restore clears stale root metadata before applying the snapshot. [Venn](/C:/Users/Michel/Graphitix/js/components/venn.js:13765), [Heatmap](/C:/Users/Michel/Graphitix/js/components/heatmap.js:14793), and [Surface](/C:/Users/Michel/Graphitix/js/components/surface.js:5864) now use this one contract. This preserves the distinction between the canonical graph viewport and the outward summary-table reserve during tab reuse and recovery.

Surface had two additional ordering defects:

- recovery could restore cached report markup without re-registering the structured summary model, leaving the checkbox/report projection out of sync;
- payload hydration could be followed by a stale empty session model, which reintroduced the wrong layout state.

Surface now [seeds the owner session from the hydrated payload](/C:/Users/Michel/Graphitix/js/components/surface.js:5445) before later capture, [prefers the payload’s valid structured panel model during cache restore](/C:/Users/Michel/Graphitix/js/components/surface.js:5968), and restores it through the shared statistics-reporting API. Raw cached markup remains a compatibility fallback only.

Surface also [reprojects the summary synchronously after each draw](/C:/Users/Michel/Graphitix/js/components/surface.js:4762), including resize draws, with the explicit resize-safe path. The table and its bottom reserve therefore remain present and are updated while the handle moves; they no longer disappear until release.

Heatmap exhibited the same class of lifecycle defect with a different visible symptom: its committed resize retained the summary reserve on the SVG root but cleared the summary group while rebuilding the heatmap scene. Heatmap now [reprojects the summary after its committed layout](/C:/Users/Michel/Graphitix/js/components/heatmap.js:11993), including resize draws. Its logical matrix viewport is intentionally stable while the physical frame changes, so the regression checks continuous table presence, live reserve, and valid projected geometry rather than requiring a changed logical viewBox or transform.

New regression coverage asserts:

- Venn, Heatmap, and Surface recovery preserves a visible summary, positive reserve, and bounded graph-to-table spacing;
- all currently covered summary components keep the summary and reserve stable during repeated live resizes;
- Surface’s existing live-resize frame-publication contract remains intact;
- shared root-state capture/restore removes stale SVG metadata before applying a snapshot ([unit contract](/C:/Users/Michel/Graphitix/__tests__/dom.framePublication.test.js:156));
- recovery assertions cover Venn, Heatmap, and Surface ([browser coverage](/C:/Users/Michel/Graphitix/e2e/stats/stats.figure-summary.reopen-recovery.spec.js:249));
- live-resize assertions cover Heatmap and Surface alongside the existing summary-enabled resize cases ([browser coverage](/C:/Users/Michel/Graphitix/e2e/stats/stats.figure-summary.live-resize.spec.js:135)).

Focused validation after this repair:

- Jest: **3 suites, 28 tests passed** (`dom.framePublication.test.js`, `stats.figureSummary.renderer.contract.test.js`, `venn.tabRuntime.test.js`);
- Heatmap Jest: **3 suites, 61 tests passed** (`heatmap.dendrogram-rendering.test.js`, `heatmap.stats.test.js`, `heatmap.tabContext.test.js`);
- Chromium: **4 summary reopen/recovery tests passed** (Box, Venn, Heatmap, Surface);
- Chromium: **6 summary live-resize tests passed** (Box, Histogram, Pie, PCA, Heatmap, Surface);
- Chromium: **1 existing Surface live-resize stability test passed**.

The duplicate specialized cache-serializer issue is resolved and removed from the actionable `issues.txt` backlog. The publication-readiness recommendation remains **hold**: F-01 through F-05 and the F-06 title-semantics issue are still open. The fixes establish lifecycle, recovery, and live-resize integrity; they do not establish scientific completeness, accessible-table parity, or the remaining precision and legacy-report requirements.

## Heatmap summary-frame invariance follow-up — 2026-09-09

The subsequent Heatmap resize report identified a separate defect from table disappearance. When a summary was already present, Heatmap reused its SVG root for the next matrix draw but left the summary projection’s viewport metadata and rendered-height slot in place. The shared summary renderer then treated those stale values as the newly resized Heatmap base. Its outward table reserve was folded into the new graph viewport, causing the matrix, title, and colour scale to shrink or shift. The same resize without the table used the real canonical Heatmap frame, hence the divergent result.

This is a shared summary-projection lifecycle contract, exposed by Heatmap’s reused SVG root rather than a general resizer defect. The new [`beginGraphRedraw()`](/C:/Users/Michel/Graphitix/js/shared/statsFigureSummary.js:1539) handoff removes only the old derived presentation slot while retaining the mounted summary group. The final projection is explicitly told that Heatmap supplied a new graph frame, so it reads the current SVG viewBox rather than stale `graphContent*` metadata. [Heatmap](/C:/Users/Michel/Graphitix/js/components/heatmap.js:10961) invokes that handoff before a full graph redraw and marks the post-draw summary projection accordingly.

The table remains mounted throughout the synchronous redraw, while the outer SVG viewport grows only after the new matrix frame is established. This restores the intended invariant: resizing with a table produces the same matrix, title, and colour-scale geometry as resizing without it and then enabling the table.

Regression coverage compares both user paths in Chromium: [heatmap.summary-resize-frame.spec.js](/C:/Users/Michel/Graphitix/e2e/heatmap/heatmap.summary-resize-frame.spec.js). It also has a shared renderer contract for a reused SVG root: [stats.figureSummary.renderer.contract.test.js](/C:/Users/Michel/Graphitix/__tests__/dom/stats.figureSummary.renderer.contract.test.js). The earlier precision assertion is now covered by the explicit compact `p < 0.001` display-floor contract; it is independent of this geometry path.

## Surface delayed disappearance and shared 3D recovery follow-up — 2026-09-09

The later Surface report showed that the summary could appear correctly and then disappear or lose its layout after cache restoration. The cause was shared, not statistical: 3D viewport rehydration restored the canonical graph height after the cached summary group had already been restored. Rebinding the 3D rotation interaction then sized its transparent hit surface from the full SVG, including the summary extension, so the interaction layer also overlapped the table.

The shared 3D rehydration path now reapplies a mounted summary’s serialized outward reserve after restoring the canonical 3D viewport. The shared rotation hit surface now uses the canonical Plot3D base dimensions, never the outward summary envelope. Surface initialization also honors passive recovery and does not queue a competing initial draw while a valid render cache is being restored. These fixes preserve summary visibility, graph-to-table spacing, and interaction boundaries across delayed cache work for Surface and sibling 3D components.

Regression coverage now includes the exact delayed recovery path and the shared Plot3D contracts: **4 summary reopen/recovery tests passed**, **4 Plot3D viewport-containment tests passed**, **1 Surface duplicate-draw/coalescing test passed**, and **75 focused Jest tests passed** across Plot3D, chart-style viewport rehydration, and summary rendering. Temporary diagnostic tracing was removed after verification.
