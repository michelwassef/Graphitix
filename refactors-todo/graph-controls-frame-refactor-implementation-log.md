# Graph controls frame refactor implementation log

Date: 2026-10-10

## Scope

Moved shared graph options and zoom controls into a normal-flow header inside a shared visual frame. The existing `.svgbox` remains the graph sizing, resizer, content-envelope and persistence authority. Download/Copy remains below the frame.

## Changes made

- `Shared.componentLayout.createStandardPanels()` now creates/reuses `.graph-frame` and `.graph-controls-header` per owned graph root.
- Resizer controls resolve their tray through the explicit controls host or the owning graph frame. Legacy trays are consolidated and empty stale trays are removed.
- The shared resizer exposes owner-local controls-host/tray lookup and mirrors published content-envelope values and graph surface color to the frame/footer seam.
- Chart envelope publication updates the frame presentation without changing persisted graph dimensions.
- Line, Scatter and Venn component control-placement paths resolve the shared header instead of assuming controls are descendants of `.svgbox`.
- CSS keeps the header in normal flow, preserves the graph box as the sizing boundary, supports envelope extensions, and keeps options menus visible outside clipping. The frame uses an inset border and the footer uses a one-pixel seam; no negative frame inset is used. The graph body no longer retains the old 40px controls-tray top inset.
- Export-layout, fit/zoom, PCA envelope, component-layout and Venn recovery tests were updated for the new shared boundary.

## Verification

- JavaScript syntax checks and `git diff --check` passed for changed source files.
- Focused Jest: resizer options, component-layout zoom, panel persistence, architecture export alignment and Venn cache recovery passed.
- Chromium export/layout suite: all five tests passed after the frame and dark-surface corrections.
- Chromium fit/default suite: the cross-component default-zoom test passed; most component persistence cases passed. Survival and Histogram still expose an existing approximately 1px SVG content-envelope drift after a 1280→1920→1280 viewport cycle; this is separate from the header geometry and needs shared envelope stabilization before claiming full cross-viewport export fidelity.
- Browser screenshots were inspected for Box, Scatter, Pie and dark Scatter. Controls are above the graph, outside `.svgbox`, and graph titles no longer intersect the controls.

## Final validation status

- Focused Jest: 27 tests passed across resizer options, component-layout zoom, export-alignment architecture, and Venn cache-recovery contracts.
- Chromium export-controls layout: 5/5 passed. The checked frame has a visible left/right/top/bottom border, the footer seam is one pixel, controls are outside `.svgbox`, and graph titles do not intersect the header.
- Chromium PCA/envelope and redraw checks: 5/6 passed. Scatter, Heatmap, Venn, PCA, and delayed-redraw checks passed; Line retains the separately tracked 0.7px reserve-rounding mismatch (224 versus 223.3px).
- Syntax checks and `git diff --check` passed. Fresh screenshots inspected: `test-results/box-graph-frame-verified.png`, `test-results/scatter-graph-frame-verified.png`, and `test-results/pie-graph-frame-verified.png`.
- Same-type tab isolation and persistence/reopen contracts: 22/22 Chromium tests passed. The shared frame has no durable state and remains owner-stamped.

## Resize-boundary follow-up

- Final Chromium validation: 6/6 passed, including all eleven components, the aligned-boundary case, dark styling, drag retention, and 50% zoom.
- Root cause: the graph/content envelope can shrink below the surrounding controls frame, while its corner handle had no visible grip. Kept the existing resize authority and envelope positions; added a 24px grab area and a contrasting diagonal grip.
- The shared resizer compares the published graph envelope with the outer frame and observes their displayed sizes. Only the wrapper receives transient detached/drag markers. The guide uses the same envelope reserves as the handles; it never measures SVG text, changes graph dimensions, or enters the persisted graph state.
- A faint guide appears over the graph area (including spare space beside the graph), during size-field keyboard focus, or throughout a pointer drag. Header/footer hover does not reveal it. Coincident boundaries use the existing outer border.
- Removed the obsolete corner gradient and envelope-specific transparent corner rule, replaced by the single shared grip.
- Focused Jest: 26/26 passed. ESLint, Stylelint, and generated test-inventory checks passed. The small-graph browser regression covers all eleven components, hit testing, hover states, stable export dimensions, and unchanged viewBox/base dimensions. Box additionally checks drag retention and 50% zoom; Scatter checks dark-surface contrast.
- Initial diagnostic failures came from test assumptions: fractional CSS borders render at a minimum of 1px in Chromium, and a default graph is not guaranteed to fill the surrounding frame at every viewport or control size. The zoom check now uses the actual rendered border, and the aligned-boundary case explicitly enlarges Venn beyond its header footprint. Production sizing was not changed to satisfy those assumptions.
- Screenshots: `artifacts/resize-boundary-review/box-guide-hover.png`, `box-grip-idle.png`, `scatter-dark-grip.png`, and the Scatter/Pie/Venn resize-guide screenshots. The prior content-envelope measurement follow-up remains separate in `issues.txt`.

## Session review and cleanup

- Reviewed shared frame creation, owner stamping, control placement, envelope publication, surface/theme projection, observer teardown, resize handles, footer seams, and relevant component/test consumers. Preserved the user's updated preferences/zoom button markup and styling.
- Fixed the setup source: a missing tray is now created directly in the resolved controls host. Removed the resizer's subsequent tray-consolidation pass. Shared frame creation still relocates controls that components initialized before the frame existed.
- Removed duplicate frame background decoration, repeated frame/envelope/corner rules, unused envelope values/markers on the wrapper, and the obsolete graph-width-dependent zoom-bound helper. The graph box still publishes the envelope; handles and the transient guide use it directly.
- Confirmed a dark-to-light theme regression with a failing browser assertion: transparent light graph bodies left the frame and footer seam black. Shared frame projection now resolves the white default explicitly; theme application invokes that shared projection immediately. Removed the separate theme seam assignment.
- Added direct-header creation coverage and dark-to-light browser coverage, with explicit scenario evidence. Retained the existing graph-size/export/tab contracts.
- Completed the controls-host migration for component Lock ratio lookups, Line/Scatter menu closing, PCA equal-axis control creation/capture, and shared aspect projection. Removed the obsolete layout-capture checkbox writeback: the resizer already publishes changes to the owning layout state. Capture must not promote a stale checkbox projection to canonical state.
- Removed the completed proposal after checking its enduring rules were already in `ARCHITECTURE.md` and its remaining envelope work was recorded in `issues.txt`. Completed entries now live in `CHANGELOG.md` and this implementation log rather than the open backlog.
- Final checks: 91/91 Jest tests across nine focused suites; 6/6 Chromium frame/export/resize tests; 3/3 Heatmap/PCA control/axis checks; 22/22 same-component isolation and archive-reopen checks. Fresh Box/dark Scatter screenshots were inspected. ESLint, Stylelint, scoped diff checks, generated component-contract checks, and the 646-row test-inventory check passed; the dependency map was regenerated.
- The first Heatmap/PCA review invocation could not start because its server port was occupied. The separate-port run passed all three checks. No assertion was weakened to address that infrastructure failure or the confirmed theme regression.
- Remaining limitation: the already-recorded display-zoom content-envelope measurement/rounding issue is separate and remains open in `issues.txt`; this review does not claim a full-app test pass or resolve that rendering refactor.

## 2026-10-11 — Surface container containment

- Reproduced the screenshot defect with a failing browser containment assertion: scale labels exceeded the clipping viewport by roughly 15px. Surface explicitly disabled the outer envelope while still publishing legend reserves; the resizer consumed those reserves, so the handle and visible frame disagreed.
- Removed the shared container-envelope opt-out, the Surface-specific false flag, and the obsolete cache marker/reader. Every shared content-viewport publication now projects its visible reserves and envelope marker together. Plot3D follows that same rule; graph dimensions, SVG viewBox, plot geometry, button appearance, and owner state are unchanged.
- Extended the existing all-eleven-component resize regression to require grips inside the visible frame and visible envelopes for published reserves. Surface additionally checks 50%, 95%, and 100% zoom, exact single-reserve accounting after CSS-pixel rounding, unclipped labels, and unchanged viewBox. Older cached opt-outs cannot suppress the restored envelope.
- Verification: 34/34 focused Jest tests; 6/6 cross-component frame/resize browser tests; 6/6 Surface legend, live resize, and recovery browser tests. The updated three-zoom Surface case subsequently passed 1/1. ESLint and scoped diff checks passed; test scenarios/inventory and dependency documentation were updated. Inspected `artifacts/surface-containment-review/surface-fixed.png` confirms complete scale labels and the grip inside the outer outline.
- The broader Plot3D suite exposed two separate glyph/viewBox boundary failures in PCA and rotated Surface. A browser-only reconstruction of the prior opt-out reproduced the same bounds; both are recorded in `issues.txt`, and their assertions were retained. Baseline and initial failures remain in `artifacts/surface-containment-review/`; the temporary diagnostic test was removed.
- The legend-size test also failed identically before this fix because its 15px/80px expectations ignored 95% display zoom. It now checks the same dimensions divided by actual zoom. The new reserve check initially assumed subpixel CSS values after manual zoom; source inspection confirmed `resizer.px()` rounds to whole pixels, so the assertion now checks that exact rounding contract while retaining strict visible containment.

## 2026-10-11 — Shared Plot3D glyph follow-up

- Reproduced both remaining boundary failures independently: PCA's `PC2 (17.1%)` title crossed the left viewBox edge; Surface's rotated Y title crossed its bottom edge. The overflowing glyph diagnostics and initial failing results remain in `artifacts/plot3d-glyph-review/`.
- PCA's legend offset was applied after fitting, consuming reserved label space. The shared projector now fits that requested translation within its unused horizontal space. Surface's label layout projected unrotated `getBBox()` corners; both clearance passes now use each tick's rotated corners. No component-specific margin patches, graph-size changes, or control styling edits were needed.
- Removed the provably unreachable tilt branch: the starting relative angle is always 90 degrees, and the capped required angle can never exceed it by the branch's 0.1-degree gate. Removed its unused font measurement helpers and registry metadata. Edge-on axis visibility/tick density needs a separate shared policy, recorded in `issues.txt`; the cleanup does not claim to solve those overlaps.
- Added unit checks for constrained projector offsets without scale changes and exact tick/title clearance on oblique axes. Browser checks expose individual overflowing glyphs and attach initial/rotated screenshots for Scatter, Line, PCA, and Surface. Added explicit scenario/manifest coverage and regenerated the test inventory.
- Validation: 58/58 targeted Jest checks; 4/4 original viewport checks; 5/5 PCA/Surface reopen, sibling-tab rotation, recovery, and size-stability checks; 3/4 multiline-title checks. The initial multiline screen-size assertions failed equally before this fix because they ignored 95% zoom; their screen measurements now convert to SVG units without loosening tolerances. Surface's subsequently reached exact Y-title width check still fails identically in the reconstructed baseline (17.997px versus a 16px title line); its canonical/title/display-scale adapter contract is recorded separately for refactoring. Initial failures and both baseline reports were retained; temporary diagnostic specs were removed.
- Inspected the four components' rotated screenshots plus PCA's initial frame. The PCA title and Surface labels remain inside their fixed viewports, and the preferences/zoom controls retain the user's appearance. Evidence: `final-containment.json`, `validation.json`, `title-validation.json`, and `surface-title-baseline.json` in `artifacts/plot3d-glyph-review/`.


## 2026-10-11 — Fix 3D annotation density and Surface multiline scale sizing

- Surface reserved its scale using a title-extended width but rendered it using the base width. Reserve and rendering now share one canonical-frame options object. Restored scale drag also uses the shared base-frame metadata rather than title-extended rotation-model dimensions. A 16px Y-title line adds exactly 16px at 95% and 100% zoom; the scale stays 15 by 80 SVG units. Recovery, drag, and redraw preserve its position.
- All four 3D components reproduced annotation overlaps before the fix. Shared Plot3D now omits annotations for collapsed axes and selects non-overlapping actual rotated text bounds, prioritizing titles, longer projected axes, and endpoint tick values. Grid/axis geometry, graph dimensions, user settings, rotation, and owner state remain unchanged. Rotation and restored caches use that same renderer.
- Added rendered overlap/collapsed-axis checks for Scatter, Line, PCA, and Surface, unit checks for collapsed axes and font-dependent tick thinning, and Surface multiline recovery/drag coverage. PCA title-edit coverage now rotates its default edge-on Z axis into view. JSDOM structural tests use an explicitly approximate SVG text fixture; Chromium verifies real glyphs. Removed the stale mapping for the deleted temporary diagnostic spec.
- Validation: 74 tests passed across four focused Jest suites; the separate PCA statistics suite passed 7 tests. All 15 focused Chromium scenarios passed across targeted runs: 4 shared layout/rotation, 5 multiline sizing including Surface at 100%, and 6 legend/reopen/recovery scenarios. The strengthened multiline recovery scenario also passed. The initial four overlap failures, missing JSDOM geometry, PCA edge-on fixture failure, and new 100% test's incorrect accessible-name selector are retained in the diagnostic reports; no assertions were weakened. ESLint, scoped whitespace checks, and the 649-row test inventory passed. Reviewed screenshots of all four rotated components; evidence is in artifacts/plot3d-layout-fix/.
- Removed the two completed backlog entries. Button appearance and unrelated worktree changes were preserved. No full-app test pass is claimed.


- Final multiline screenshots exposed a separate shared title-positioning defect: explicit tspan coordinates do not follow later parent-anchor movement, leaving Y ticks suppressed in Surface despite sufficient axis length. Recorded the required shared text-layout refactor in `issues.txt` and stopped that additional work under engineering rule 2. The exact reserve and edge-on/dense-axis fixes remain validated. Native SVG and screenshots are retained; multiline sizing passes do not establish complete multiline annotation legibility.


## 2026-10-11 — Move multiline 3D titles as complete formatted blocks

- Added `Shared.textBlock.setPosition()` to move parent coordinates, explicit styled-line coordinates, alignment anchors, and rotation pivots together without rebuilding spans. Shared Plot3D now measures the nearest painted title edge for tick clearance. Its rotation-safe estimate includes full perpendicular tick width, title height, and effective title font size, preventing the corrected text from crossing the frame.
- Verified readable Y endpoints, synchronized anchors, exact added-line reserves, native glyph containment, and annotation separation in Scatter, Line, PCA, and Surface. Surface additionally covers 95%/100% zoom, right alignment, a 24px title font, rotation, and recovered multiline scale drag/redraw. Existing title dragging already synchronizes line coordinates; Surface/PCA and Heatmap parent-only graph-title adjustment paths exclude multiline blocks, so no unrelated adapter rewrite was needed for title positioning.
- Reused one browser containment helper and updated the existing projected-clearance unit check to assert the painted edge rather than the parent anchor. Focused validation passed 82 Jest tests across six suites; nine layout/rotation Chromium scenarios and four reopen/recovery scenarios passed, followed by five strengthened multiline/formatting/rotation scenarios. Initial failing anchor assertions and the recovery/frame-estimate failure are preserved in artifacts/plot3d-title-position/. Reviewed native SVGs and screenshots; Surface's Y values are restored at both zoom levels and after larger-font/right-alignment edits. This is targeted validation, not a full-app claim.
- Removed the completed multiline title-positioning backlog entry. Final Line/PCA screenshots exposed a separate pre-existing adapter frame/legend-width inconsistency. Recorded its required 3D frame/cache refactor in `issues.txt` and stopped that additional work under engineering rule 2. Axis/tick assertions do not establish title/legend separation. Preserved button appearance and other worktree changes.


## 2026-10-11 — 3D frame and legend separation completed

Canonical implementation and validation record: [CHANGELOG.md](../CHANGELOG.md), entry “Separate 3D graph frames from legend viewports”. All four 3D adapters use an independent legend/scale rail; user preference/zoom styling is preserved. Native screenshot evidence: `artifacts/plot3d-legend-frame/screenshots/`.
