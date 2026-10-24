## 2026-10-12 — Complete the automated Chrome acceptance matrix

- Fixed Scatter point-label focus loss at its source: the owning session consumes the expected delayed AG Grid selection event once, avoiding a second redraw after focus restoration.
- The complete serial installed-Chrome accessibility matrix passes 247/247 in 39.1 minutes. The point-menu keyboard suite passes 20/20; the Scatter focus case passes five repeated runs; focused Jest selection/keyboard tests pass 8/8.
- `npm run quality:static` passes with 655 manifest rows, 989 explicit/0 inferred requirements, 1,316 Chromium cases and 360 Jest files discovered. All 11 Welcome previews are fresh; the retained 48 CSS priorities have owner, reason, and rendered Chrome evidence. Firefox was not run.
- Automated implementation and Chrome gates are complete (about 99%). Manual screen-reader/keyboard checks, OS text scaling and native color-picker checks, and visual SVG-overlap review remain; no WCAG conformance claim is made.

## 2026-10-11 — Close the automated CSS/HTML acceptance tranche

- `npm run quality:static` and the CI `npm run test:static` lane both pass on the latest source snapshot. This covers CSS/HTML lint, repository ESLint, all 48 priority contracts, generated docs, bootstrap/vendor/runtime checks, fresh SVG previews, and the explicit test inventory.
- Final inventory: 654 manifest rows, 983 explicit/0 inferred requirements, 9/9 critical checks; 359 Jest files and 1,316 Chromium cases discovered. Discovery counts are not execution results. Installed Chrome is the only browser tested for this continuation; no Firefox tests were run.
- The updated forced-colors keyboard-focus case passed in Chrome (1/1). All 11 Welcome SVG previews were regenerated and verified against the current source fingerprints.
- Manual screen-reader/keyboard use, Windows text scaling and native target sampling, the operating-system color picker, and visual SVG-overlap review remain required; this is not WCAG certification.

## 2026-10-11 — Complete the CSS priority winner review

- Traced all 48 retained declarations by selector, property, owner and active state against rendered Chrome assertions. Coverage spans forced colors (8), reduced motion (6), Box editing (1), shared graph sizing (8), hidden utilities (10), focus modality (8), AG Grid selection/editing (3), native select options (2), and Welcome focus (2).
- Removed an unreachable forced-colors selected-state branch from the Welcome examples dialog: static markup and every dialog builder contain no selected/pressed/checked option. The forced-colors contract now checks the live Welcome search result and keyboard focus in that dialog. Installed Chrome passes the updated case; the priority gate passes 48/48.
- Added explicit inventory scenarios for the current uncommitted Box named-comparison unit and SciPy-oracle tests; neither test file was altered. The generated inventory now has 654 mapped rows and 983 explicit/0 inferred requirements.
- Manual screen-reader/keyboard use, Windows text scaling and native target sampling, the operating-system color picker, and visual SVG-overlap review remain required; this is not WCAG certification.

## 2026-10-11 — Cover ROC and Survival legend picker owners

- Added real legend-swatch owner-switch coverage for ROC and Survival. Both cases verify the picker closes on deactivation, a late eyedropper result changes neither owner, and the original legend appearance returns unchanged.
- Installed Chrome passes 2/2. Added both components to the lifecycle scenario and regenerated the test inventory to 651 rows. System color-picker interaction remains a manual OS check.

## 2026-10-11 — Consolidate repeated interface measurements

- Routed 43 repeated control/layout measurements through seven shared tokens; four matching heights reuse the existing control-height token. Rendered values remain unchanged.
- The focused installed-Chrome computed-style suite passes 9/9. All 11 generated SVG previews are fresh. `quality:static` and CI `test:static` pass; inventory reports 650 mapped checks, 973 explicit/0 inferred requirements, and 48 reviewed CSS priorities. The static lane discovered 1,311 Chromium tests and 356 Jest files; those discovery counts are not execution results.
- Estimated roadmap progress remains about 99%. Open work remains the selector-by-selector computed-winner review, uncovered popup/grid owner states, and manual assistive-technology, native text-size, and SVG-overlap evidence.

## 2026-10-11 — Remove duplicate inline-editor presentation

- Moved formatted-text preview styling from repeated inline properties to the shared preview class; preview-related runtime state now writes only the derived text-color custom property. Split active AG Grid edit fill from the normal selection reset and retained the focus and edit priorities Chrome showed are needed.
- The combined installed-Chrome batch passes 8/8 across AG Grid selection/edit, Box's selected fill, and Scatter's formatted/plain inline editor. The priority budget falls from 55 to 48: 7 net removals, or 12.7% of the reviewed set at the start of this tranche. The overall roadmap estimate remains about 99%; manual assistive-technology evidence and remaining owner/state review still bound completion.

## 2026-10-11 — Remove redundant AG Grid selection priorities

- Removed the three selection-fill and pointer-reset priorities after app-scoped selectors preserved their computed colors and effects over the deferred vendor stylesheet. Kept the two keyboard-focus priorities because the shared focus rule uses importance, and kept the edit-border priority because the active cell border is inline.
- Installed Chrome passes the selection, range-fill, scrollbar, and long-edit contracts 4/4. The priority gate now holds 52 entries. This retires 3 of the 55 entries present at the start of this slice (5.5%); the overall estimate moves from about 98% to 99%.

## 2026-10-11 — Share result-tab projection and close owner-isolation gaps

- Moved Box/Pie summary-tab markup, panel visibility, ARIA selection, and projection into `Shared.statsSummaryTabs`, with component-neutral CSS classes. Box writes selection immediately to its owning session; Pie restores nested summary tabs after owner activation and runtime restore. Venn keeps its distinct GO/STRING controls and now has the same owner-isolation browser contract.
- Added shared-module tests and explicit scenario evidence, then regenerated the test inventory and architecture map. Chrome passes all six result-tab keyboard/owner cases; Venn passes three repeated owner runs after its fixture waits for the component and root to bind to the same active owner. Jest passes 8/8. `quality:static` and CI `test:static` pass; all 11 previews are fresh, 55/55 priorities are reviewed, and all 650 manifest rows have scenario mappings.
- The broader 244-case Chrome accessibility matrix passed before this code tranche; the focused six-case run validates these changes. Estimated roadmap progress is about 98%. Remaining work includes manual assistive-technology evidence and the selector-by-selector CSS priority winner review.

## 2026-10-11 — Link CSS priorities to browser evidence

- Added registered Chrome scenario links to all 55 priority entries across 12 owners; the local gate validates each link against the scenario catalog.
- The shared inline-label preview test now asserts the rendered text, selection color, and transparent overlay behavior directly. The full per-selector winner audit remains open.

## 2026-10-11 — Close shared-style evidence tranche

- Removed two unused root color aliases and routed six white UI surfaces through the shared surface token, preserving computed colors.
- Added direct Chrome evidence for graph sizing, reduced motion, forced-colors cues across all eleven workspaces, AG Grid keyboard selection, and Scatter inline-label preview. All eleven generated Welcome previews were refreshed.
- UI lint and the targeted nine-case Chrome batch pass. Estimated roadmap progress moves from about 87% to 92%; manual assistive-technology review, the compact desktop checkbox exception, remaining popup/grid states, and the full priority-winner audit remain open.

## 2026-10-11 — Consolidate repeated description text color

- Added the semantic description-text token and routed four Welcome copy, hint, and card-description rules through it without changing their color.
- The focused token and accessibility batch passes 9/9 in Chrome. UI lint, targeted ESLint, priority and inventory gates pass, and all eleven previews are fresh. CSS is 8,651 lines; progress remains about 87%.

## 2026-10-11 — Consolidate disabled-control text color

- Added the --ui-color-disabled token for five matching disabled-state rules across AG Grid filters, Axis controls, and workspace menus; rendered colors stay unchanged.
- The combined Chrome batch passes 9/9. UI lint, targeted ESLint, the 55/55 priority gate, both inventory checks, and all-eleven-preview freshness pass. CSS is 8,651 lines; progress remains about 87%.

## 2026-10-11 — Verify shared CSS visibility utilities in Chrome

- Added a computed-style contract proving all nine `.visually-hidden` declarations preserve the accessible button name and `[hidden]` defeats a later component display rule.
- The focused installed-Chrome test, targeted ESLint, test inventory, and generated inventory checks pass. The full selector-by-selector priority audit and remaining accessibility gates stay open; progress remains about 87%.

## 2026-10-11 — Extend shared icon sizing tokens

- Added 18px and 24px icon tokens and routed the shared color-picker shape, import warning, and component-import icon through them. The imported icon container also uses the token for its minimum width and flex basis.
- The focused installed-Chrome computed-style case passes, verifying all four icon-size tiers and token ownership. Stylelint, targeted ESLint, syntax, the 55/55 priority gate, and all-eleven-preview freshness checks pass. Progress remains about 87%; final cascade and accessibility gates remain open.

## 2026-10-11 — Align Box significance checks with the graph header

- The two failing Chrome contracts retained the old expectation that the control tray overlays the SVG. The shared layout places the tray in a separate header; the header now stays on the graph-envelope edge and keeps the tray centered above the chart content. Updated the assertions to check that layout before and after resize; no production workaround was needed.
- The two Box cases, shared-token dimensions, and all-workspace touch targets pass together 4/4 in installed Chrome. Targeted ESLint and syntax checks pass; the stale issue entry was removed. Roadmap progress remains about 87%.

## 2026-10-11 — Consolidate icon and touch-target dimensions

- Routed repeated small and standard SVG icon sizes through shared tokens. Graph resize-corner dimensions use the shared 24px minimum-target token; AG Grid row height stays fixed at 20px on all pointer types.
- Focused installed-Chrome computed-style and all-eleven-workspace touch-target checks pass 2/2. Stylelint, targeted ESLint, syntax, inventory, and the 55/55 priority gate pass; all eleven CSS-fingerprinted previews are fresh. Broader static gates remain for the roadmap end; progress remains about 87%.

## 2026-10-11 — Require CSS priority ownership metadata

- Upgraded the CSS priority allowlist to require an owner and reason for every reviewed declaration. The gate validates the metadata and reports the 55 reviewed declarations across 12 owners; no CSS priorities changed.
- `npm run css:priority-budget`, script syntax check, and targeted diff check pass. Selector-by-selector computed-winner evidence remains an open final audit item; roadmap progress remains about 87%.

## 2026-10-11 — Route action-box dimensions through the target-size token

- Corrected the three action rules whose rendered dimensions were 24px but whose CSS still hard-coded those values. DataViews close/save and the graph-options summary now both use `--ui-target-size-minimum` for width and height; the browser contract checks source references and computed dimensions.
- All six shared-token contracts pass in installed Chrome. Stylelint, targeted ESLint, and the 55/55 priority gate pass; all eleven CSS-fingerprinted previews are fresh. Full static gates remain reserved for the roadmap end; progress remains about 87%.

## 2026-10-11 — Consolidate shared control-chip colors

- Added exact-value semantic tokens for the shared chip surface and text across Style Sync, shared controls, Axis, Venn, and graph controls. Removed six older Style Sync color declarations that the later shared rule always superseded.
- All six computed-style contracts pass in installed Chrome, including eight chip paths, the existing per-control override, and Axis's distinct text color. Stylelint, targeted ESLint, and the 55/55 priority gate pass; all eleven CSS-fingerprinted previews are fresh. Full static gates remain reserved for the roadmap end; CSS is 8,646 lines and progress remains about 87%.

## 2026-10-11 — Consolidate subtle UI surface colors

- Routed seven repeated UI backgrounds through the exact-value `--ui-surface-subtle` token. Kept the two SVG mark colors and the separately styled significance badge distinct.
- Installed Chrome computed-style probes pass for normal/disabled filter controls, the import preview and its row-number cells (1/1). Stylelint and targeted ESLint pass; priorities remain 55. All eleven CSS-fingerprinted previews are fresh. Full static gates remain reserved for the roadmap end; CSS is 8,650 lines and progress remains about 87%.
## 2026-10-11 — Tokenize repeated interface foreground colors

- Routed six control-text and seven supporting-text declarations through two exact-value semantic tokens, preserving rendered colors. The installed-Chrome computed-style contract checks every affected consumer.
- The two Welcome focus priorities remain because removing them changes the 2px outline to the later shared 3px outline. The focused Chrome checks pass 2/2; Stylelint passes, and the reviewed priority set remains 55/55. `quality:static` and `test:static` pass with 647 manifest rows, 942 explicit/0 inferred requirements, 1,295 Chromium tests across 292 files, 355 Jest files, and 11 fresh previews. CSS is 8,649 lines; roadmap progress remains about 87%.
## 2026-10-11 — PCA divider cascade and priority reduction

- Traced the PCA divider loss to the later shared pinned-row border reset. Scoped the divider rules to PCA floating rows, removed three priorities, and lowered the reviewed ceiling from 58 to 55.
- Installed Chrome passes the Box/PCA same-type tab and archive-reopen contracts 2/2; the combined CSS-token and Box/PCA specs pass 7/7. Stylelint passes. `quality:static` and `test:static` pass with 647 manifest rows, 942 explicit/0 inferred requirements, 1,295 Chromium tests across 292 files, 355 Jest files, and 11 fresh previews; priority review passes 55/55.
- Roadmap progress remains about 87%. Manual assistive-technology evidence, the compact desktop checkbox exception, non-default popup/grid states, and selector-by-selector cascade evidence remain open. Firefox was skipped.

## 2026-10-11 — Repeated interface foreground tokens

- Routed 43 exact foreground declarations through four semantic tokens, preserving their colors. Removed one superseded Axis checkbox color declaration after Chrome confirmed the later shared-chip rule owns the computed color.
- The installed-Chrome shared-token contract passes 5/5; Stylelint passes. This slice did not change the priority count. Roadmap progress remains about 87%; manual assistive-technology, target-size, popup/grid-state, and cascade evidence remain open.

## 2026-10-11 — Make shared formatting-panel layout CSS-owned

- Axis, Dendrogram, Grid, Significance, and Additional Line panels now use native `hidden` as their sole open/closed state. Removed duplicate inline `display` writes; CSS owns their visible flex/grid layout. The grid layout is scoped to the shared Additional Line panel modifier so Significance and Line's inline editor keep their intended layout.
- Targeted Jest passes 7/7; installed Chrome passes six Axis dialog cases plus Significance, Line uncertainty, and shared-panel computed-style checks. `lint:ui`, `npm run quality:static`, and `npm run test:static` pass; all eleven Welcome previews are fresh. The static inventory discovers 1,295 Chromium tests across 292 files and 355 Jest files. CSS is 8,643 lines with 58 priorities; estimated roadmap progress remains about 87%.

## 2026-10-11 — Use semantic visibility for shared control fields

- The shared Significance toolbar projects Whisker Style, Label, and Decimals through native `hidden`. Axis Add Mark, Add Break, and break-segment controls use the same state contract, with CSS owning their visible display.
- Installed Chrome passes the Significance toolbar visibility case and Add Mark visibility on Line, Box, and Scatter. CSS/HTML lint and targeted ESLint pass. Two Box significance-tray geometry contracts remain failing at an about 50px tray gap versus the expected 10px; tracked in `issues.txt` without changing layout or weakening the tests.
## 2026-10-11 — Require reviewed CSS priority declarations

- Replaced the count-only priority check with a PostCSS audit of the current selector, property, value, and at-rule context against a reasoned allowlist. Removals are accepted; new and duplicate declarations fail even if total count stays flat.
- Added PostCSS as a pinned direct development dependency. The allowlist passes live CSS and both removal/addition smoke checks. All eleven Welcome previews were refreshed with installed Chrome; `npm run quality:static` and `npm run test:static` now pass.
## 2026-10-11 — Keep AG Grid checkbox keyboard focus visible

- Removed the broad focus reset selected by `.ag-cell[style]`; inline geometry is not a focus-style writer. Pointer modality continues to suppress click rings, and keyboard-focused checkbox wrappers now show the shared green focus outline.
- The pointer/keyboard regression plus shared computed styles, AG Grid selection outlines, pinned scrolling, and keyboard navigation pass 7/7 in installed Chrome. Targeted ESLint, CSS lint, and the priority-budget check pass at 58/58.
- CSS is 8,642 lines. Estimated completion remains about 87%; manual assistive-technology evidence, the compact desktop grid-target exception, uncovered popup/grid states, and per-rule cascade evidence remain open.

## 2026-10-11 — Scope AG Grid pinned-row borders and shadows

- Replaced nine priorities on pinned-row borders, divider shadows, left-pinned cell edges, and hidden WebKit scrollbar dimensions with `#appShell` specificity. Source review found no runtime inline writers for these properties; app ownership now beats the deferred vendor selectors.
- The vendor-loaded computed-style contract checks generic and grouped cells, top-edge resets, five pinned-section shadows, left-pinned borders, and zero-size hidden scrollbars. Real Box and Line 3D divider checks plus selection, pinned scrolling, Line sorting, and PCA label interactions pass 12/12 targeted cases in installed Chrome; the additional Line 3D grouped-divider case passes 1/1. `npm run lint:css` and the priority budget pass at 60/60.
- CSS remains 8,645 lines. Estimated completion remains about 87%; manual assistive-technology evidence, the compact desktop grid-target exception, uncovered popup/grid states, and per-rule cascade evidence remain open.

## 2026-10-11 — Scope AG Grid seam and scrollbar styles

- The header/pinned-row seams, scroll behavior, scrollbar track, and gutter resets now use #appShell-owned selectors, removing ten priorities after vendor-loaded Chrome checks preserved the 1px seams, track color, zero gutters, and pinned-row geometry.
- The shared UI contract, AG Grid selection/scrollbar behavior, and Line header sort/selection batch pass 8/8 in Chrome. CSS remains 8,645 lines at 69/69 priorities. Both npm run quality:static and npm run test:static pass with 647 manifest rows, 942 explicit/0 inferred requirements, 1,294 Chromium tests across 292 files, 355 Jest files, and 11 fresh previews. Roadmap estimate remains about 87%.

## 2026-10-11 — Align runtime AG Grid header sizing with CSS

- A serial Chrome run initially completed 240/241; the single failure showed 24×20px header-action targets because `Shared.hot` derived header height from the compact body-row value. It now reads the dedicated `--graphitix-ag-header-row-height` token, keeping 20px data rows and producing 24px header targets.
- The full-workspace target sweep passes 1/1, checking 450 controls across all eleven grids and reporting only the 23 compact-row checkboxes. Nearby installed-Chrome header drag, keyboard, sort and style tests pass 18/18; three targeted AG Grid Jest suites pass 21/21. The post-fix serial Chrome accessibility matrix passes 241/241 in 42.5 minutes. Both static gates pass, with 647 manifest rows, 942 explicit/0 inferred requirements, 1,294 Chromium tests across 292 files, 355 Jest files, 11 refreshed Chrome previews, and 79/79 CSS priorities. Roadmap estimate remains about 87%.

## 2026-10-11 — Scope AG Grid header styling to the application

- The shared AG Grid header seam and selected-column states now use #appShell specificity instead of three priorities. No inline writers compete with these class-owned styles.
- The computed-style contract verifies the zero-width header-cell seam and accent selected-header state after the deferred vendor theme loads; it and the Line live-header sort/selection case pass 5/5 in Chrome. Both local and CI static gates pass with 647 manifest rows, 942 explicit/0 inferred requirements, 1,294 Chromium tests across 292 files, 355 Jest files, and 11 fresh previews. CSS is 8,645 lines with 79 priorities; roadmap estimate remains about 87%.

## 2026-10-11 — Consolidate PCA pinned-row divider rules

- The shared PCA divider selectors already match pinned cells, so removed duplicate pinned/floating selector blocks and kept one app-scoped rule per divider. Chrome showed the borders need !important even with app scope: normal declarations collapsed the divider to 0px.
- Added computed-style checks against the shared border token for standard, grouped, pinned, owner-return, and archive-reopened tables. The Chrome PCA contract passes 1/1. CSS is 8,645 lines with 82 priorities; roadmap estimate remains about 87%.

## 2026-10-11 — Remove the unproduced PCA nested-header branch

- Source search found no producer for pca-grouped-nested-only; the only runtime occurrence merely removed it. Removed its three dead CSS rules and the stale cleanup call, including two unused priorities.
- The Chrome PCA grouped-table tab-isolation and archive-reopen contract passes 1/1. Both npm run quality:static and npm run test:static pass with 647 manifest rows, 942 explicit/0 inferred requirements, 1,294 Chromium tests across 292 files, 355 Jest files, and 11 fresh previews. CSS is 8,654 lines with 85 priorities under the local/CI ceiling. Roadmap estimate remains about 87%.

## 2026-10-11 — Remove superseded AG Grid anchor styling

- Removed the early transparent cell/anchor backgrounds; the later app-shell selection rule already owns those states. The anchor priority and normal cell rule were redundant.
- Chrome confirms the focused selection keeps the teal token fill and outline; the six-case edit, selection/fill, keyboard-navigation, and pinned-scroll batch passes. CSS is 8,663 lines with 87 priorities; the local and CI ceilings are 87. Roadmap estimate remains about 87%.

## 2026-10-11 — Scope AG Grid inline-edit styling to the application

- Replaced nineteen inline-editor appearance and overflow priorities with app-shell specificity. The range-fill border rules also use the app-owned scope; Chrome showed the active range edge still needs one priority on the editing cell right border to avoid a duplicate edge.
- Extended the real long-edit contract to assert editor appearance and overflow while preserving the cell geometry. Installed Chrome passes the six-case edit, selection/fill, keyboard-navigation, and pinned-scroll batch. Priority ceiling is now 88; broader cascade winner review remains open.

## 2026-10-11 — Remove obsolete AG Grid focus rules and priorities

- Scoped live cell-focus resets to `#appShell`, which beats deferred vendor selectors without `!important`. Removed 14 focus-reset priorities and deleted selectors for range-border, inner-focus, and wrapper classes absent from the pinned AG Grid bundle and runtime. Kept the inline-style reset for cells whose styles are written dynamically.
- Installed Chrome passes 7/7 focused cases for selection outlines, keyboard navigation, pinned scrolling, edit overflow, and inline-edit appearance. Stylelint passes; the local/CI CSS priority ceiling is now 108.
- CSS is 8,669 lines with 108 priorities. `npm run quality:static` and `npm run test:static` pass with 647 manifest rows, 942 explicit/0 inferred requirements, 1,294 Chromium tests across 292 files, 355 Jest files, and 11 fresh previews. Roadmap estimate remains about 87%; per-rule winner review, remaining popup/grid states, the compact desktop target-size exception, and manual assistive-technology review remain open.

## 2026-10-11 — Retire shared AG Grid base priorities

- Scoped shared cell/header border, spacing, and sizing rules to `#appShell`, so app ownership specificity beats deferred vendor selectors and removes 13 `!important` declarations without changing the established values. The computed-style contract now locks cell borders, 2px × 3px padding, 16px line heights, and 24px header sizing.
- Installed Chrome passes 10/10 focused cases across the shared style contract, AG Grid selection/scroll, Line pinned selection, and Box grouped-grid behavior. CSS/HTML lint, ESLint, and `npm run quality:static` pass; the gate reports 647 manifest rows, 942 explicit/0 inferred requirements, 1,294 Chromium tests across 292 files, 355 Jest files, and 11 fresh previews.
- CSS remains 8,709 lines; priority count and CI/local ceiling are now 122. Estimated completion remains about 87%; manual assistive-technology review, the compact desktop grid-target exception, uncovered popup/grid states, and selector-by-selector priority evidence remain open.

## 2026-10-11 — Scope AG Grid header pseudo resets

- Scoped header separator/focus pseudo resets to `#appShell`, whose ID specificity outranks the deferred vendor selectors. The existing hidden content/display behavior remains, with four `!important` declarations removed.
- Installed Chrome passes the Line header-sort/pseudo-style and Heatmap exclusion archive/recovery contracts (2/2). `npm run quality:static` and CI `npm run test:static` pass with 647 manifest rows, 942 explicit/0 inferred requirements, 1,294 Chromium tests across 292 files, 355 Jest files, 11 fresh previews, and 135/135 priority declarations. CSS is 8,709 lines.
- The final serial installed-Chrome accessibility matrix passes 241/241 in 42.5 minutes. A repeated PCA point-menu failure came from the test's forced locator click auto-scrolling a clipped graph panel and triggering the menu's intended close-on-scroll behavior. The test now sends a real mouse event to a point already inside the visible plot and asserts scroll stability; focused PCA/Scatter repetitions pass 8/8. No product interaction change was needed.
- The estimate remains about 87%. Manual assistive-technology review, the fine-pointer desktop grid-target exception, remaining non-default popup/grid states, and per-rule priority-winner evidence remain open.

## 2026-10-11 — Consolidate AG Grid exclusion styling

- Replaced repeated excluded-cell/row/column color and stripe declarations with five named HOT exclusion tokens. The app-shell selector now wins against the generic vendor theme, removing nine `!important` declarations while retaining the established styles and row/column indicators.
- Extended the existing archive/recovery parity contract to assert computed colors and stripe patterns for each exclusion type. Installed Chrome passes 1/1; `npm run quality:static` and CI `npm run test:static` both pass with 647 manifest rows, 942 explicit/0 inferred requirements, 1,294 Chromium tests across 292 files, 355 Jest files, 11 fresh previews, and 139/139 priority declarations. CSS is 8,711 lines.
- Estimated progress remains about 87%. The last full 240-case accessibility run predates the added Venn owner-return case; current discovery is 241. The final matrix rerun, manual assistive-technology review, compact desktop grid-target exception, remaining popup/grid states, and selector-by-selector cascade evidence remain open.

## 2026-10-10 — Complete the full Chrome accessibility rerun

- The serial accessibility folder completed 228/229 in 40.4 minutes. The only failure was the PCA point-menu target check reading bounds before its menu item was visible; the focused test passed in isolation.
- Added an explicit visible-menu-item wait before the unchanged 24px target assertion. The PCA case passes 1/1 in installed Chrome. The full matrix has not been rerun after this test-readiness correction.
- The separate 3-case shared-style contract and CSS/HTML static quality gate pass. Manual keyboard/screen-reader evidence, the desktop compact-grid exception, remaining popup states, and per-rule cascade review remain open; roadmap estimate stays about 85%.

## 2026-10-10 — Reuse shared spacing and resizer menu rules

- Four disclosure markers now use the existing compact-gap token, and four custom select rules share a named 22px arrow reserve.
- The axes-length menu's identical base, closed-state, and nested options-menu sizing rules are shared across both graph-control hosts. A Chrome computed-style contract covers the disclosure gaps, four select paths, and both menu states in both hosts.
- All three shared-style cases pass in installed Chrome. npm run quality:static passes: 646 manifest rows, 1,274 Chromium tests discovered, 355 Jest files, 11 fresh previews, and 149/149 priorities. CSS is 8,764 lines.
- Roadmap estimate remains about 85%. Manual keyboard/screen-reader evidence, other overlay states, the compact desktop grid target-size exception, per-rule cascade review, and the post-correction full accessibility matrix remain open.

## 2026-10-10 — Finish source-traced CSS hook cleanup

- Rechecked 1,044 current CSS classes against 890 authored/runtime/test/script/asset files. The original 41 absent names are resolved: 38 stale hooks were removed across the cleanup slices; the remaining three loading-overlay child classes are formed from the shared fixed base class in `js/shared/loadingOverlay.js`. The unused Grid toggle selector was found in the expanded scan and removed after tracing all Grid field producers.
- Restored the pre-edit stylesheet snapshot, then re-applied the known current-worktree CSS deltas before the cleanup. Confirmed `:root`, keyboard `:focus-visible`, pointer suppression, the intentional Welcome focus cue, and 150 priorities are retained. Current CSS is 8,762 lines.
- CSS ID tracing checked 107 selectors and found one dead Survival hint ID; the live hint uses `.survival-covariate-hint-text`, so the stale grouped ID branch is removed. The attribute scan found only the documented manual `data-debug-qq` diagnostic without a runtime writer; it is retained intentionally. Current CSS IDs: 106.
- A source-aware custom-property inventory found two unused definitions: the removed secondary Welcome icon color and a toolbar divider inset with no consumer. Both are removed; the remaining 210 non-vendor custom properties have CSS or JavaScript references. CSS is 8,762 lines.
- `npm run lint:ui` passes at 150/150. In installed Chrome, 13 focused cases passed; the Heatmap 320×400 case initially exposed a stale `.svgbox` locator because graph controls now live in the graph panel header. The test now uses the active graph panel and passes 1/1 in isolation. The Survival covariate tab/reopen contract also passes 1/1 in Chrome. `git diff --check` passes (Git only reports existing LF/CRLF conversion notices).
- After the ID and custom-property cleanup, `npm run lint:ui` passes at 150/150 and five targeted installed-Chrome cases pass for toolbar overflow, Welcome icons and Survival tab/reopen. The Heatmap viewport test passes 1/1 in isolation.
- The CSS-hook issue is resolved. Estimated roadmap completion is about 85%; manual assistive-technology evidence, remaining overlay/menu states, the documented desktop target-size exception, and broader selector-winner review remain open.

# CSS/HTML Quality Implementation Progress

## 2026-10-11 — Centralize repeated interface text colors

- Routed 41 repeated near-black text colors and eight muted text colors through four semantic CSS tokens. Each token preserves its existing exact color; no rendered UI color changed.
- The shared Chrome style contract passes 4/4 and checks token values and all 49 mapped declarations. CSS/HTML lint, ESLint, and `npm run quality:static` pass; the static lane reports 647 manifest rows, 1,293 Chromium tests / 292 files, 355 Jest files, 11 fresh previews, and 148/148 priorities. CSS is 8,724 lines.
- Progress remains about 87%. Manual assistive-technology review, the compact desktop grid-target exception, remaining popup/grid states, and selector-by-selector priority evidence remain open.

## 2026-10-11 — Close Venn analysis disclosures on owner change

- A test-first keyboard and same-type tab-return contract found the GO/STRING option panels stayed open in the restored Venn root. The Venn `deactivateTab` hook now closes both transient panels and resets their expanded state only when the mounted root matches the departing tab id.
- Installed Chrome passes the new disclosure contract and existing GO/STRING async-isolation test (2/2). Both local `quality:static` and CI `test:static` pass after refreshing all eleven Welcome previews and the testing inventory; 647 manifest rows, 942 explicit/0 inferred requirements, and 1,294 Chromium tests across 292 files.
- Progress remains about 87%; manual assistive-technology review, the compact desktop grid-target exception, remaining popup/grid states, and selector-by-selector priority evidence remain open.

## 2026-10-11 — Consolidate workspace frame sizing

- Replaced ten duplicate workspace-page width blocks with one shared rule; those pages now rely on the existing `.workspace-page` minimum width. Normalized plot-stack sizing across all eleven components and removed duplicate component overrides.
- The focused Chrome matrix passes all 99 component/viewport combinations, checking computed page/stack sizing, overflow, and graph/control placement. Stylelint and targeted ESLint pass. The static quality gate initially flagged stale CSS-fingerprinted Welcome previews; after regenerating them in installed Chrome, `npm run quality:static` passes with 647 manifest rows, 1,281 Chromium tests / 292 files, 355 Jest files, 11 fresh previews, and 149/149 priorities. CSS is 8,720 lines. No rendered geometry changed.

## 2026-10-11 — Exercise shared color-picker lifecycle through real owners

- Added seven Chrome cases using each component's actual symbol-formatting toolbar: Venn, Box, Scatter, PCA, Line, Histogram, and Pie. Every case switches between same-type tabs, checks picker closure, and proves a pending eyedropper result cannot alter either owner's rendered mark.
- All seven focused cases pass in installed Chrome. This expands real-consumer coverage; no production behavior changed. `npm run quality:static` passes: 647 manifest rows, 941 explicit/0 inferred requirements, 1,281 Chromium tests across 292 files, 355 Jest files, 11 fresh previews, and 149/149 priorities.

## 2026-10-11 — Close font controls on tab deactivation

- The eleven-workspace owner test exposed that the editable font-size listbox returned open when its tab was reactivated. Font-family and preset-size paths had hidden that gap because an inactive page masks an open portal.
- Added an owner-matched font-controls deactivation hook and invoked it after inline-title finalization. This follows the existing Axis-controls lifecycle boundary and closes the singleton panel and both popup types for only the departing owner.
- Installed Chrome passes 22 font-family/font-size owner-transition cases across all eleven workspaces and the seven real-toolbar color-picker owner cases. Targeted ESLint and `npm run quality:static` pass; the gate reports 647 manifest rows, 1,292 Chromium tests across 292 files, 355 Jest files, 11 fresh previews, and 149/149 priorities.

## 2026-10-11 — Remove a superseded AG Grid row-border priority

- The app row selector has greater specificity than the later generic AG Grid row rule; no same-specificity themed rule or inline border writer exists. Removed the unnecessary priority while preserving the zero-width row border.
- The shared Chrome computed-style contract confirms a 0px, none row border after vendor load. Stylelint, targeted ESLint and npm run quality:static pass; the gate reports 647 manifest rows, 1,292 Chromium tests across 292 files, 355 Jest files, 11 fresh previews and 148/148 priorities.

## 2026-10-11 — Complete the serial Chrome accessibility matrix

- All 240 tests in `e2e/accessibility` passed serially in installed Chrome in 42.3 minutes, including the PCA menu readiness correction and font-family/font-size owner transitions. A later Venn keyboard/owner-return test raised current discovery to 241; the full matrix needs one final rerun. Firefox remains deferred as requested.
- Manual assistive-technology review, remaining menu/grid states, the compact desktop grid-target exception, and per-rule cascade evidence remain open; estimated completion is about 87%.

**Started:** 2026-10-07. **Updated:** 2026-10-11. **Plan:** [css-html-quality-roadmap.md](css-html-quality-roadmap.md)
**Goal state:** active; completion requires all roadmap phases and the complete verification matrix.
**Estimated completion:** about 87%, using a rough phase-weighted estimate; manual accessibility review, the compact desktop target-size exception, the selector-by-selector priority audit, and final evidence remain.
**Current browser-test scope:** installed Google Chrome only (`PLAYWRIGHT_BROWSER_CHANNEL=chrome`); Firefox runs are deferred by the user's instruction.

## 2026-10-10 — AG Grid radius cascade cleanup

- Replaced two vendor-facing corner-radius priorities with app-scoped selectors. The computed-style contract passes in installed Chrome and preserves square corners; the stylesheet now has 154 priorities, with the CI ceiling lowered from 156 to 154. `npm run quality:static` passes with 645 manifest rows, 930 explicit/0 inferred requirements, 1,246 Chromium tests, 355 Jest files, 11 fresh thumbnails, and a 154/154 priority ceiling.

## 2026-10-10 — Formula signature tooltip accessibility

- Fixed the shared formula editor's tooltip state: visible signatures have tooltip semantics and an `aria-describedby` link; hiding the signature removes that link. The Box rendered contract checks the shared editor at 320×400 and passes 2/2 in installed Chrome; Box/Scatter formula-editing regressions pass 7/7, and the HOT editor Jest suite passes 6/6. After regenerating stale Welcome thumbnails with installed Chrome, `npm run quality:static` passes with 645 manifest rows, 930 explicit/0 inferred requirements, 1,246 Chromium tests, 355 Jest files, 11 fresh thumbnails, and 156/156 CSS priorities.

## 2026-10-10 — CSS priority ceiling tightened

- Lowered the lint/CI ceiling from 166 to the verified current count, 156. `npm run quality:static` passes at 156/156 with 645 manifest rows, 928 explicit/0 inferred requirements, 1,246 Chromium tests, 355 Jest files, and 11 fresh thumbnails.
- The selector-by-selector cascade audit remains open; the aggregate ceiling only prevents new priority growth.

## 2026-10-10 — Box formula popup owner lifecycle

- Added a same-type tab-switch contract for Box’s body-portaled formula suggestions. Installed Chrome confirms the popup closes when its owner deactivates and remains closed on return.
- The focused owner contract passes 1/1 and the full formula-assist spec passes 2/2. The latest `npm run quality:static` passes: 645 manifest rows, 928 explicit/0 inferred requirements, 1,246 Chromium tests, 355 Jest files, 11 fresh thumbnails, and 156/156 CSS priorities. The stylesheet currently has 8,821 lines under the roadmap's UTF-8 physical-line method.

## 2026-10-10 — Axis popup accessibility matrix

- Expanded Axis number-format keyboard, short-viewport, and same-type owner-return coverage to Box, Scatter, Line, and Histogram. Additional-ticks and broken-axis dialog focus, viewport, and owner-return checks cover Box, Line, and Scatter. Installed Chrome passes 21/21; the current accessibility folder lists 217 cases, and the scenario inventory was regenerated.
- Estimated roadmap progress remains about 84%; manual accessibility evidence, compact desktop target sizing, the selector-by-selector priority audit, remaining states, and final verification remain open.

## 2026-10-10 — Font picker workspace matrix

- Expanded 320×400 font-family/font-size popup, keyboard/editing, and same-type owner-return checks to all eleven workspaces. Installed Chrome passes 22/22; scenario metadata and the generated inventory now cover each component explicitly. `npm run quality:static` passes with 645 manifest rows, 926 explicit/0 inferred requirements, 1,229 Chromium tests, 355 Jest files, 11 fresh previews, and 156/166 CSS priorities.
- Roadmap progress remains about 84%; manual accessibility evidence, the compact desktop target-size exception, the selector-by-selector cascade audit, and final verification remain open.

## 2026-10-10 — Hidden import-picker sizing

- The custom import picker’s native select now wins against generic form sizing through its owner-scoped selector. Removed five ineffective priority flags and the overflow declaration, which Chrome does not apply to this native select; the contract checks its actual 1×1 clipped geometry.
- The full modal lifecycle contract passes 6/6 in installed Chrome. `npm run quality:static` passes with 645 manifest rows, 926 explicit/0 inferred requirements, 1,211 Chromium tests, 355 Jest files, 11 fresh previews, and 156/166 CSS priorities.
- Roadmap progress remains about 84%; manual accessibility evidence, the compact desktop target-size exception, the selector-by-selector cascade audit, and final verification remain open.

## 2026-10-10 — Graph-options owner checks across all workspaces

- Expanded graph-options owner-deactivation coverage to all eleven workspaces. Nested axes-length closure is checked where Line, PCA, and Scatter render it. Installed Chrome passes 11/11.
- `npm run quality:static` passes with 645 manifest rows, 926 explicit/0 inferred requirements, 1,211 Chromium tests, 355 Jest files, 11 fresh previews, and 161/166 CSS priority occurrences.
- Estimated roadmap progress remains about 84%; remaining gates are listed below.

## 2026-10-10 — Chrome accessibility matrix review

- All 172 accessibility cases passed across the four-worker run and focused serial reruns. The parallel run had two font-listbox timeouts and one pointer-focus mismatch; all three passed serially without code changes.
- Static quality passes with 645 manifest rows, 926 explicit/0 inferred requirements, 1,200 Chromium tests, 355 Jest files, 11 fresh previews, and 161/166 CSS priority occurrences. Progress remains about 84%; manual assistive-technology evidence, remaining overlays, the desktop compact-grid exception, full cascade review, and final matrix remain open.

## 2026-10-10 — Color-scheme popup viewport matrix

- Expanded the shared 320×400 popup-bound and 24px option-target contract across all eleven workspaces. Installed Chrome passes 11/11.
- `npm run quality:static` passes with 645 manifest rows, 926 explicit/0 inferred requirements, 1,200 discovered Chromium tests, 355 Jest files, 11 fresh previews, and 161/166 CSS priority occurrences.
- Estimated roadmap progress remains about 84%; manual assistive-technology evidence, remaining overlay states, desktop compact-grid exception, cascade review, and the final matrix remain open.

## 2026-10-10 — Color-scheme popup owner checks across all workspaces

- Expanded the shared palette listbox owner-return contract to all eleven workspaces. Installed Chrome passes 11/11.
- Estimated roadmap progress remains about 84%; other menu/grid states, owner changes during activation, manual assistive-technology evidence, cascade review, and final matrix work remain open.

## 2026-10-10 — Workspace toolbar menu owner checks across all workspaces

- Expanded same-type owner-deactivation coverage to all eleven workspaces. Installed Chrome passes 11/11; the original owner’s menu remains closed when that tab returns.
- Estimated roadmap progress remains about 84%; other menu/grid states, owner changes during activation, manual assistive-technology evidence, cascade review, and final matrix work remain open.

## 2026-10-10 — DataViews export-menu owner checks across all workspaces

- Expanded same-type owner-deactivation coverage to all ten DataViews-enabled workspaces. Installed Chrome passes 10/10; the static gate passes with 645 manifest rows, 926 explicit/0 inferred requirements, 1,170 Chromium tests, 355 Jest files, and 11 fresh previews.
- Estimated roadmap progress remains about 84%; other menu/grid states, owner changes during activation, manual assistive-technology evidence, cascade review, and final matrix work remain open.

## 2026-10-10 — AG Grid popup owner checks across all workspaces

- Expanded the same-type owner-deactivation contract across all eleven AG Grid owners. Context menus and column filters close when their owner deactivates; a replacement owner opens and dismisses a fresh filter popup.
- Installed Chrome passes 11/11. The static quality gate passes with 645 manifest rows, 926 explicit/0 inferred requirements, 1,162 Chromium tests, 355 Jest files, and 11 fresh previews.
- Estimated roadmap progress remains about 84%; other menu/grid states, owner changes during activation, manual assistive-technology evidence, cascade review, and final matrix work remain open.

## 2026-10-10 — Font color-input overlay cascade

- Removed the priority from the custom Font color input's absolute overlay after source and runtime-writer tracing found no competing position rule.
- The shared computed-style and toolbar color-picker Chrome contracts pass 10/10. The static quality gate passes, and the priority budget is now 161/166.
- Progress remains about 84%; owner-by-owner cascade review and final accessibility evidence remain open.

## 2026-10-10 — Owner-scoped color-input alignment

- The late shared color-input primitive overrode lower-specificity toolbar centering styles. Added `#appShell` ownership to the five relevant selector paths and removed four `!important` occurrences without changing computed alignment.
- The shared computed-style contract and the existing color-picker Chrome suite pass (1/1 and 9/9). CSS/HTML lint, full ESLint and the static quality gate pass. The later overlay slice lowers the priority count to 161/166.
- Roadmap progress remains about 84%; the owner-by-owner cascade review and final accessibility evidence remain open.

## 2026-10-10 — Shared compact UI measurement tokens

- Replaced repeated compact/dense line heights, 3px gaps, shared popup and Axis action padding, and 16px remove-action glyph sizes with semantic tokens. Removed the redundant DataView export base padding while preserving computed values and intentional Font-combo/tab-context overrides.
- The computed-style Chrome contract passes 1/1. `npm run quality:static` passes with 645 manifest rows, 926 explicit/0 inferred requirements, 1,153 Chromium tests, 355 Jest files, and 11 refreshed previews. CSS is 8,818 lines; the later color-alignment and overlay slices reduce priorities to 161.
- Progress remains about 84%; the selector-by-selector winner audit, remaining manual accessibility evidence, and final matrix are open.

## 2026-10-10 — Anchored AG Grid filter popup

- The shared filter popup now tracks window and nested grid scrolling, stays anchored while its trigger is visible, and closes when the trigger leaves view. Opening focuses without browser scrolling and repositions after focus.
- The full Chrome pointer-focus sweep passes across all eleven workspaces. Direct AG Grid context-menu, nested-scroll, owner and numeric-filter checks pass 4/4; the shared HOT Jest suite passes 23/23. The static lane passes with 645 manifest rows, 926 explicit/0 inferred requirements, 1,153 Chromium tests, 355 Jest files, and 11 fresh previews.

## 2026-10-10 — Shared Notes editor cascade cleanup

- Removed the redundant Notes editor filter/shadow reset after source tracing found no competing editor declarations; both properties already compute to their defaults. Lowered the CSS priority ceiling to 166.
- The all-workspace Chrome pointer/keyboard sweep and final static lane pass; the current stylesheet has 166 priority declarations against the 166 ceiling.

## 2026-10-10 — Shared live-preview sizing rule

- Consolidated the identical SVG viewport, preview-target, and canvas sizing declarations into one owner rule group, retiring eight duplicate `!important` occurrences while retaining the four renderer overrides.
- All 14 targeted installed-Chrome resize checks pass: stacked Surface/UpSet, reduced-motion resizing across eleven graph types, and dense Scatter live resize. The owner-by-owner priority audit remains open.

## 2026-10-10 — CSS priority growth guard

- Added `scripts/check-css-priority-budget.cjs` and wired it into `lint:ui`, so local `quality:static` and the CI static lane reject counts above 166. The ceiling was lowered from 176 after eight duplicate occurrences were retired.
- This blocks net growth, not selector replacement; the owner-by-owner winner audit remains open. The CI static lane passes after refreshing all eleven CSS-fingerprinted previews: 645 manifest rows, 926 explicit/0 inferred requirements, 1,153 Chromium tests, and 355 Jest files. The priority check reports 168/168.

## 2026-10-10 — Compact export-control width ownership

- Compact Download/Copy selects no longer run the shared auto-sizer that writes inline widths. App-owned CSS now wins over generic configuration-panel select sizing; six redundant `!important` declarations were removed.
- Chrome export layout and component statistics reopen/recovery checks pass 16/16. Stylelint and ESLint pass.
- At that checkpoint CSS had 8,815 lines and 176 priorities: 108 AG Grid/HOT, 35 shared, 19 workspace, and 14 conditional. All eleven previews were fresh; the static lane passed with 645 manifest rows, 926 explicit/0 inferred requirements, 1,153 Chromium tests, and 355 Jest files.

## 2026-10-10 — Active-state cascade cleanup

- Removed six priorities from app-owned selected/active styles for statistics tabs, filter sorting, data transforms, Font controls, formula suggestions, and import options. Their owner selectors now win by specificity.
- Chrome computed styles cover seven states; Box/Pie result tabs, Scatter transform ownership, and Box formula assistance pass. The five-test targeted batch passes, and Stylelint/ESLint plus `npm run quality:static` pass.
- Refreshed all eleven previews. At that checkpoint the CSS had 8,817 lines and 182 priorities; the owner-family map was 108 AG Grid/HOT, 41 shared, 19 workspace, and 14 conditional. Overall progress remained about 84%; remaining owner-by-owner review and final accessibility evidence are open.

## 2026-10-10 — AG Grid and font-control priority cleanup

- Moved grid typography and row height to the app-scoped theme selector, and removed a redundant font-picker pointer-border priority. Removed six `!important` flags in total.
- The computed-style and all-workspace coarse-pointer checks pass; Line/Scatter font picker pointer and keyboard paths pass. Chrome passes 4/4; CSS/ESLint and `npm run quality:static` pass.
- Regenerated all eleven previews. Current CSS: 8,836 lines and 188 priorities (109 AG Grid/HOT, 46 shared, 19 workspace, 14 conditional). Estimated overall completion remains about 84%; final evidence and remaining cascade/accessibility work stay open.

## 2026-10-10 — Floating-popup and native-select cascade cleanup

- Removed two unnecessary priorities. The fixed popup keeps zero margin, and a specific Heatmap selector preserves the themed-select background reset.
- The installed-Chrome popup and native-picker tests pass 2/2, including the actual transform dropdown and Scatter/Heatmap select paths. Stylelint and changed-test ESLint pass.
- CSS is 8,836 lines with 194 priorities: 114 AG Grid/HOT, 47 shared, 19 workspace, and 14 conditional (8 forced-colors, 6 reduced-motion). Refreshed previews and the static gate remain pending.
- Regenerated all eleven previews; `npm run quality:static` passes with 645 manifest entries, 926 explicit/0 inferred requirements, 1,153 Chromium tests, and 355 Jest files.

## 2026-10-10 — Statistics form-row spacing token

- Replaced three repeated statistics-control row gaps with `--ui-gap-form-row: 6px 12px`; Chrome computed styles preserve the previous spacing.
- The owner-scoped summary test now permits the responsive wrapping already defined by CSS and checks that heading/options stay inside the row without overlap. The shared token and all eleven component summaries pass 13/13 in Chrome; CSS lint and focused ESLint pass.
- Current CSS is 8,835 lines with 196 `!important` declarations.
- Regenerated all eleven CSS-fingerprinted previews. `npm run quality:static` passes with 645 manifest entries, 926 explicit/0 inferred requirements, 1,153 Chromium tests, and 355 Jest files.
- Rechecked dependency advisories: `npm audit --omit=dev` reports zero findings; the full audit still reports the 25 known development-tool findings already tracked in `issues.txt`.
- Corrected the roadmap's current-worktree metric row from live source counts: 2,559 HTML lines, 8,835 CSS lines, and 196 priorities.

## 2026-10-10 — Resizer spinner cascade cleanup

- Removed the WebKit spin-button pseudo rule after confirming the resizer number input itself computes to `appearance:textfield` and `-webkit-appearance:textfield` in Chrome; the pseudo appearance and margin overrides were redundant. Four priorities are retired, bringing the CSS total to 196.
- The computed-style and graph zoom redraw checks pass 6/6; Stylelint passes. `npm run quality:static` passes with 645 manifest rows, 926 explicit/0 inferred requirements, 1,153 Chromium tests, 355 Jest files, and 11 fresh previews.

## 2026-10-10 — Compact UI spacing tokens

- Added `--ui-gap-small: 5px` for six live compact-interface gaps and `--ui-menu-max-height: 220px` for AG Grid filter and shared Font option lists; computed values are unchanged.
- Removed the compact Welcome-card base padding/gap rule after tracing its only runtime producer to the stronger `.welcome-popular` rule. The Chrome style contract asserts the preserved 0px geometry.
- The final installed-Chrome batch passes 9/9 across computed styles, AG Grid/Font menus, toolbar overflow/owner return, and DataViews archive fidelity. Stylelint and `npm run quality:static` pass; the gate reports 645 manifest rows, 926 explicit/0 inferred requirements, 1,153 Chromium tests, 355 Jest files, and 11 fresh previews.

## 2026-10-10 — Shared tokens and priority cleanup

- Routed 42 exact 1px gray top/right/bottom/left borders through `--ui-border-default`, including the AG Grid rules whose priority protects them from deferred vendor styles. Existing edge priorities and custom AG Grid edge-color variables remain intact.
- Added `--ui-content-padding-panel: 10px 12px 12px` for the four repeated graph/statistics panel and fieldset surfaces; computed padding remains identical.
- Added `--ui-target-size-minimum: 24px` for seven compact menu/filter/toolbar/DataViews targets, preserving each measured size and the fixed 20px AG Grid rows across pointer types.
- Added `--ui-menu-item-min-height: 26px` across four menu families and removed the duplicate Font-family option minimum; preset-size options retain their separate 28px value.
- Removed the duplicate resizer number-input subclass rule after confirming the shared selector already covers it; four redundant priorities were retired. Chrome confirms the field retains `appearance:textfield`. CSS is 8,834 lines with 196 priorities.
- The Chrome token/computed-style and all-workspace target audit pass 2/2; 456 controls were reviewed and the 23 documented compact-grid checkbox exceptions remain unchanged. Earlier AG Grid selection/scroll and Line pinned-column checks pass 5/5. All eleven CSS-fingerprinted Welcome previews were refreshed.
- `npm run quality:static` passes for the combined changes: 645 manifest rows, 926 explicit/0 inferred requirements, 1,153 Chromium tests discovered, 355 Jest files, and 11 fresh previews. `git diff --check` reports no whitespace errors.

## 2026-10-10 — Shared CSS cleanup and accessibility test settling

- Centralized five repeated native-select paddings, five paired layout gaps, five roomy card paddings, and the shared 96px transparency-control width without changing computed geometry.
- Added regular, medium, semibold, and bold UI font-weight tokens for 154 repeated declarations. The expanded installed-Chrome computed-style contract confirms representative consumers remain at 400/500/600/700.
- Removed eight redundant Axis label priorities and seven redundant corner-radius priorities after rendered winner checks. CSS was 8,838 lines with 206 `!important` declarations at that checkpoint; the remaining priority inventory is still triage, not a complete winner audit.
- The Chrome style contract and CSS lint pass. The full installed-Chrome accessibility sweep now passes 125/125 after the PCA point-menu test waits for its owner to settle after point activation. The chart-point spec passes 20/20, including five repeated passes of the PCA case.
- The refreshed `npm run quality:static` gate passes: 645 manifest rows, 926 explicit/0 inferred requirements, 1,153 discovered Chromium tests, 355 Jest files, and 11 fresh previews.

## 2026-10-10 — Static chart accessibility and acceptance follow-up

- A full Chrome accessibility sweep initially passed 121/125. The failures exposed focus/ARIA retained on chart-navigation roots in the static Heatmap thumbnail, a dense-Scatter test expectation that incorrectly excluded keyboard-movable labels/legend, and two font-editor timeouts under three-worker load.
- Static SVG sanitization now removes keyboard-only focus/help attributes from chart roots while preserving the chart role/name, and clears all interaction semantics from the transparent Heatmap hit layer. All eleven preview assets were regenerated. Exporter Jest passes 3/3, the Welcome+Heatmap axe audit passes, the dense-Scatter contract passes after asserting zero per-point tab stops, and both font-editor cases pass serially.
- The shared workspace-toolbar menu owner test also passes in the full Chrome sweep. Broader menu/archive states and manual assistive-technology review remain open; the roadmap estimate remains about 83%.

## 2026-10-10 — Shared CSS tokens and graph-popup lifecycle

- Added `--ui-content-padding-standard: 10px 16px` for six repeated statistics/PCA content rules. The existing `--ui-border-default` now serves 56 default-border declarations, including 29 neutral-gray border declarations aligned to `--gt-border`; seven stronger control borders use existing strong-border tokens. Disabled-state border and decorative icon colors remain specialized.
- Source tracing found that graph-options and nested axes-length `<details>` states were copied into render-cache snapshots and were not closed by shared tab deactivation. The shared snapshot boundary now stores them closed, and the shared resizer closes them for the deactivated owner. A focused installed-Chrome archive/same-type-tab test passes; the lifecycle and snapshot Jest tests pass 12/12.
- Installed Chrome confirms the default panel/menu border and standard content padding across representative Import, Stats, and Fit surfaces. The computed-style and popup-lifecycle checks pass 2/2; CSS and changed-JavaScript lint pass.
- Removed a duplicated Phase 5 tokenization paragraph from the roadmap. Broader selector-owner and responsive-constraint review remains open.

## 2026-10-10 — Workspace toolbar popup ownership

- A test-first same-type Scatter switch confirmed that an open workspace-toolbar menu stayed expanded in the shared component root and reopened on return.
- Shared workspace deactivation now closes menus within the resolved owner root. The installed-Chrome switch-away/return contract passes; focused workspace-toolbar and lifecycle Jest suites pass 10/10. Other menu/grid states and manual accessibility evidence remain open.

## 2026-10-09 — Shared 16px spacing token

- Added `--ui-gap-spacious: 16px` for nine exact repeated gap/row-gap/column-gap values across Welcome, shared dialogs, PCA, Scatter, and Heatmap. The alias preserves the previous computed spacing.
- The 11-workspace Chrome viewport matrix passes in 1.7 minutes, preserving its recorded widths and overflow checks. `npm run quality:static` passes: 643 manifest rows, 916 explicit/0 inferred requirements, 1,142 Chromium tests, and 11 fresh thumbnails.

## 2026-10-09 — Color selection cue and filter-popup targets

- Removed the color picker swatch checkmark; selection remains visible through its outline, including an explicit system-color outline in forced-colors mode.
- Test-first Chrome checks found 23px filter-choice rows and a filter popup extending to 463px in a 400px viewport. Rows now meet 24px and the popup scrolls within viewport bounds. The combined Chrome menu and picker suites pass 17/17; the forced-colors selection contract passes again after the final cascade adjustment. The shared-grid Jest suite passes 23/23. `npm run quality:static` passes with 643 manifest rows, 916 explicit/0 inferred requirements, 1,142 Chromium tests, and 11 fresh thumbnails.
- Estimated roadmap completion remains about 76%; remaining menu/archive states and manual assistive-technology review are open.

## 2026-10-09 — AG Grid filter-trigger popup relationship

- AG Grid can recreate a header button while its body-ported filter dialog remains open. The current trigger now projects the dialog's `aria-expanded` state and `aria-controls` id; closing clears both on the original and current header controls.
- Chrome verifies popup state across header recreation and same-type owner deactivation. The first 8-test menu run had one focus-return mismatch; the case passed in isolation and the full file passed 8/8 on rerun. The focused shared-grid Jest suite passes 23/23, and focused ESLint passes. The regenerated inventory and `npm run quality:static` pass: 643 manifest rows, 915 explicit/0 inferred requirements, 1,142 Chromium tests, and 11 fresh thumbnails.
- Estimated roadmap completion remains about 76%; manual screen-reader review and remaining menu/archive states stay open.

## 2026-10-09 — AG Grid filter popup owner coverage

- Extended the same-type Scatter owner test to open the body-ported column-filter popup, switch tabs, and verify the popup is removed. It passes alongside the context-menu owner check.
- The updated scenario inventory and `npm run quality:static` pass with 643 manifest rows, 914 explicit/0 inferred requirements, 1,142 Chromium tests, and 11 fresh thumbnails. Manual screen-reader review and remaining menu/archive states stay open.

## 2026-10-09 — Owner-safe native color-picker fallback

- The native color input fallback now uses the same owner/generation guard as EyeDropper; closing or reopening the picker invalidates its pending input. The fallback also calls the native input when `showPicker()` is unavailable.
- The focused Chrome same-type Box regression passes stale-result rejection; the picker Jest contract passes 2/2, including the no-`showPicker()` path. Actual OS picker behavior and other component callbacks remain open.
- Estimated roadmap completion remains about 75%; manual screen-reader evidence and remaining acceptance states are still outstanding.

## 2026-10-09 — Shared menu-item padding token

- Added `--ui-menu-item-padding: 6px 10px` for the shared AG Grid and Scatter point-menu items; rendered spacing is unchanged.
- The existing installed-Chrome keyboard contracts assert the computed padding and still verify targets, focus, and viewport bounds. `npm run quality:static` passes with 643 manifest rows, 914 explicit/0 inferred requirements, 1,142 Chromium tests, and 11 fresh thumbnails.
- Estimated roadmap completion is about 76%; manual screen-reader evidence and remaining acceptance states remain open.

## 2026-10-09 — Comfortable control-height token

- Added `--ui-control-height-comfortable: 36px` for the Welcome drop-zone action, graph search, graph-card actions, gallery close, and import choices. Narrow-screen controls keep their existing 44px override.
- Installed Chrome confirms the 36px desktop values and the 44px short-screen graph actions; the import-dialog contract also checks its option height. `npm run quality:static` passes with 643 manifest rows, 914 explicit/0 inferred requirements, 1,142 Chromium tests, and 11 fresh thumbnails.
- Estimated roadmap completion remains about 76%; manual screen-reader evidence and remaining acceptance states are open.

## 2026-10-09 — AG Grid context-menu owner lifecycle

- The test first reproduced a body-ported table menu remaining visible after switching between two Scatter tabs. The shared grid pool now closes only the menu owned by the tab being deactivated, at the workspace lifecycle boundary.
- The same-type-tab Chrome regression now covers both the context menu and the body-ported column-filter popup; both close on owner deactivation. The existing short-viewport/keyboard menu contract passes (2/2); the targeted shared-grid Jest suite passes 23/23. The standard owner-isolation and archive-reopen matrix passes 22/22, and `npm run quality:static` passes with 643 manifest rows, 913 explicit/0 inferred requirements, 1,140 Chromium tests, and 11 fresh thumbnails.
- Estimated roadmap completion is about 74%. Other menu/grid state coverage and manual screen-reader review remain open.

## 2026-10-09 — Shared color-picker owner and async result

- The test reproduced a pending EyeDropper result changing a second tab's shared color picker after switching Box tabs. The picker now records its owner, closes on owner deactivation, and discards results from an earlier open operation.
- The same-type Box Chrome regression passes closure and stale-result rejection. The complete color-picker Chrome file passes 8/8; the color-picker Jest contract passes 1/1; Box owner-isolation and archive-reopen pass 2/2. `npm run quality:static` passes with 643 manifest rows, 914 explicit/0 inferred requirements, 1,141 Chromium tests, and 11 fresh thumbnails.
- Estimated roadmap completion is about 75%; native OS picker behavior, other asynchronous popup owners, and manual screen-reader checks remain open.

## 2026-10-09 — Compact content spacing tokens

- Added `--ui-content-padding-compact: 8px 10px` for seven repeated content paddings and routed all six exact 2px top offsets through `--ui-gap-micro`; computed values are unchanged.
- Installed Chrome confirms all 13 affected computed paddings/offsets are unchanged. `npm run quality:static` passes: 643 manifest rows, 912 explicit/0 inferred requirements, 1,139 Chromium tests discovered, and 11 fresh thumbnails.
- This continues the bounded cascade/token pass. The rough roadmap estimate remains 73%; rendered-state, cascade-owner, and manual accessibility gates remain open. Firefox was not run.

## 2026-10-09 — Divider endpoints and point-label archive restore

- Verified pointer dragging reaches both workspace edges; the 0% and 100% collapsed states survive `.graph` reopen. All eleven workspaces already pass the pointer/keyboard endpoint matrix.
- Root causes for cache rebind: JSON/CSV archive conversion dropped non-enumerable matrix signatures, invalidating cache provenance; Scatter/PCA 3D titles omitted the geometry and owner metadata required by the shared rebind path. Tab metadata now preserves/re-homes signatures, and both 3D title bindings use the shared serialized contract.
- Scatter/PCA 2D and 3D `.graph` reopen checks verify point-label geometry and leader attachment, keyboard movement, and owner-session/payload writes. The six-case Chrome batch passes 6/6; seven focused Jest suites pass 146/146.
- `npm run quality:static` passes: 643 manifest files, 911 explicit/0 inferred requirements, 1,136 Chromium tests, and 11 fresh thumbnails.
- Phase estimate remains about 71%: menu/grid states, owner changes during activation, manual screen-reader review, other component/state matrix entries, cascade review, and final evidence remain open. Firefox was not run.

## 2026-10-09 — Pointer divider edge regression

- Installed Chrome pointer-drag testing reaches both physical workspace edges (within 1 CSS pixel); archive reopen also preserves the 0% and 100% collapsed states. Both focused cases pass. The shared implementation already met the behavior, so this adds direct pointer evidence and an explicit scenario mapping without changing runtime code.
- `npm run quality:static` passes: 643 manifest rows, 909 explicit/0 inferred requirements, 1,136 Chromium tests, and 11 fresh thumbnails.

## 2026-10-09 — Full-range workspace dividers and interaction persistence

- Root cause: shared split normalization clamped proportions to 5–95%, while resizer pixel floors and graph-frame sizing locks rejected the endpoints. The shared layout now supports 0–100%, including true collapsed panes, and split sizing takes precedence over graph-frame width locks. Stacked layouts keep their vertical geometry. Collapse projection is idempotent and always clears stale `inert`, `aria-hidden`, and visibility state when a pane reopens.
- Rechecked at 1920px: Chrome verifies pointer and keyboard movement to both edges in all eleven workspaces, including the usable viewport edge. The same Scatter endpoint interaction passes against the user's `127.0.0.1:5500` server; its divider markup, CSS, and shared resize scripts match the current checkout. No further runtime defect reproduced. Scatter archive restore at both endpoints also passes (12/12 total). A collapsed pane is hidden from the accessibility tree and focus order. Pie legend keyboard position survives its owning session update and archive reopen (1/1). Five focused Jest suites pass 125/125. The earlier stacked Surface/UpSet live-resize follow-up passed 3/3.
- The shared label/legend handlers stop movement keys before chart-point navigation and restore SVG focus by logical item after redraw. All eleven graph labels move by keyboard; Scatter title and Pie legend positions are archive-covered.
- `npm run quality:static` passes after refreshing the test inventory and all 11 CSS-fingerprinted thumbnails: 643 manifest rows, 908 explicit/0 inferred requirements, and 1,127 Chromium tests. Current source: 2,558 HTML lines, 8,806 CSS lines, and 221 literal `!important` declarations. Five Jest suites pass separately as noted above.
- Remaining work includes archive coverage for non-title graph labels, remaining menu/grid states, owner changes during activation, manual screen-reader review, desktop compact-grid target exception, complex chart-text contrast, and broader cascade review. Overall estimate: about 69%; Firefox was not run.

## 2026-10-09 — Owner-safe graph-label positions after archive reopen

- The Histogram single-plot renderer omitted the relative-position metrics already emitted by its multi-panel renderer. Added the same coordinate metadata so the shared cache rehydrator can restore the keyboard handler against the owning tab session.
- Chrome verifies graph-title position after archive reopen across all eleven components (11/11), and axis-title position across seven Cartesian components (7/7). Pie legend archive movement also passes. The shared label-drag and lifecycle Jest suites pass 42/42; ESLint passes for the changed interaction code and browser spec.
- Component-specific point/Venn label archive positions, remaining menu/grid states, owner changes during activation, and manual screen-reader review remain open. `npm run quality:static` passes with 643 manifest rows, 908 explicit/0 inferred requirements, 1,127 Chromium tests and 11 fresh thumbnails. The rough phase-weighted estimate is now about 71%; Firefox was not run.
## 2026-10-09 — Shared 3D keyboard rotation and Heatmap label sizing

- `Shared.plot3d` now handles Shift+Arrow rotation through the same owner-checked callbacks used by pointer rotation. Scatter, PCA and Line use the chart’s existing tab stop; Surface exposes a named, focusable SVG target. Rotation stays session-owned and keyboard focus remains visible.
- Installed Chrome passes all four 3D keyboard-rotation cases and six existing pointer rotation/tab-switch/reopen/recovery cases; the shared Plot3D/chart-keyboard Jest suites pass 19/19. The all-workspace graph-control typography contract passes 11/11, including Heatmap “Decimals” and “Clustering method” at the shared 13px standard.
- The mismatch came from a generic 16px `label` rule overriding the graph-control token. `.config-panel label` now applies the shared token across graph panels; the Heatmap lower controls use that same value.
- `npm run quality:static` passes: 641 manifest rows, 904 explicit/zero inferred requirements, 1,102 Chromium tests discovered, and 11 fresh thumbnails. Panel-divider and free SVG label/legend keyboard movement, manual accessibility review, and the later phase gates remain open. The rough roadmap estimate remains about 66%; Firefox was not run.

## 2026-10-09 — Chart-mark keyboard access across five components

- Extended `Shared.chartPointKeyboard` to Box data-point marks, Line markers and series paths, and Pie slices. Keyboard entry is one named plot root; arrow/Home/End moves between owner-scoped marks, and Enter/Space invokes each mark's existing format action. Pie reapplies the same contract after render-cache restoration. The shared helper now includes horizontal/vertical marks whose bounding rectangle has only one nonzero dimension.
- Test-first Chrome and Jest checks reproduced the missing Pie/Line-path entry and rejected zero-height/width marks before the helper change. The shared helper Jest behavior plus Pie isolation tests pass 11/11. Chrome chart navigation and formatting pass 6/6; Box/Line same-type isolation and archive reopen pass 4/4; and Pie reopen keyboard navigation passes inside its isolation contract (1/1).
- The scenario catalog names five directly covered chart components. Box shapes/summary marks, Heatmap, ROC, Survival, Histogram and other Venn marks still need direct keyboard access; resizing and free label/legend movement remain separate shared-interaction work in `issues.txt`.
- Roadmap estimate stays about 65%; this closes one component-coverage slice, not the interaction phase. Firefox was not run.

## 2026-10-09 — Axis control cascade cleanup

- Consolidated both Axis action styles into one shared rule after the generic button defaults, removing duplicate declarations and seven unnecessary priorities while preserving token-backed values.
- The Chrome contract opens the SVG axis controls before checking both rendered buttons against shared height, padding, line-height, font-size and weight tokens. The Axis dialog/focus suite passes 3/3.
- CSS/HTML lint and `npm run quality:static` pass after refreshing the test inventory and CSS-fingerprinted welcome assets: 638 manifest rows, 901 explicit/0 inferred requirements, 1,061 Chromium tests discovered, and 11 fresh thumbnails.
- Current source is 2,558 HTML lines, 8,786 CSS lines, and 221 literal `!important` declarations. Overall roadmap estimate remains about 65%; manual accessibility evidence, remaining overlay/state coverage, target/contrast exceptions, broad cascade review and final verification remain open.

## 2026-10-09 — Box draw-cache normalization and cancellation responsiveness

- Chrome profiling traced the intermittent cancellation stall to `createDefaultBoxRenderRuntime` deep-cloning the tab-owned `cachedDrawInput` on each live runtime read; the clone consumed about 1.0 seconds of sampled CPU during the large draw.
- Live Box runtime normalization now retains the owning session's cache reference. New runtime records still clone input, preserving tab isolation. This aligns Box with the cache ownership pattern in its sibling components.
- The reduced-motion Box contract checks that no browser event-loop gap reaches one second while Stop is handled, then verifies retry and the rendered graph. It passes 3/3 repeated Chrome runs. Box same-component tab isolation and batched archive reopen pass 2/2.
- Roadmap progress remains about 65%: this closes the Box responsiveness gate, while manual accessibility evidence, remaining component states and overlays, target/contrast exceptions, broad cascade review and final evidence remain open. No Firefox tests were run.

## 2026-10-09 — Shared helper bootstrap review

- Full Jest review found that the browser focus-modality script was loaded by the Node component bootstrap without a document. It now has a keyboard-default non-browser mode; a focused unit contract covers that boundary.
- A source-level Axis layout assertion now accepts the valid optional trailing semicolon instead of requiring formatting. Four targeted Jest suites pass 6/6. The subsequent full-Jest attempt stopped during the sequential integration phase; it did not establish a full-suite pass.

## 2026-10-09 — Cross-component cascade review

- Removed one unnecessary `!important` from the shared stats fieldset radius rule. Its ID selectors outrank the generic fieldset rules; `overflow:hidden` remains intact.
- Added a computed-style invariant for all ten stats workspaces. Installed Chrome passed before and after the change (1/1 each); the run also passed the existing axe, contrast, and target checks across those workspaces.
- Routed nine repeated `2px 8px` compact form-control declarations through the existing token; the status badge keeps its separate spacing. CSS/HTML semantics are unchanged.
- Removed the duplicate selected/hovered option colors from the customizable-select support block; the unconditional rule has the same selectors and values. The Chromium picker test checks computed option colors, keyboard selection, and open/close behavior before and after (1/1 each).
- Added `--ui-font-size-xxsmall: 10px` and routed eight repeated interface labels through it without changing their rendered size.
- The two Line axis-dialog tests exceeded their 30-second limit during shared browser startup; both pass in isolation and now allow 60 seconds without relaxing assertions. Axis dialog checks pass 3/3, the color-picker suite passes 8/8, and the ten-workspace Chrome accessibility/contrast/target check passes 1/1.
- Current source is 2,558 HTML lines, 8,778 CSS lines, and 228 literal `!important` declarations. `npm run quality:static` passes with 637 manifest rows, 900 explicit/0 inferred requirements, 1,059 Chromium tests, and 11 fresh thumbnails.

## 2026-10-09 — Cascade cleanup and current validation

- Removed the redundant symbol-fill/border centering rule: the shared field's flex alignment already centers these controls. Installed Chrome measured identical centered geometry for both color inputs and swatches with and without the rule. The stylesheet loses eight lines and two `!important` declarations.
- Removed duplicated Axis popup background, border and shadow declarations. Chrome's rendered-surface, keyboard-entry, focus-return and 320×400 checks pass for both popup variants (3/3).
- At that point, source was 2,560 HTML lines, 8,782 CSS lines and 231 literal `!important` declarations.
- Corrected the Box paired-exclusion audit note to use grammatical singular/plural wording. Updated the advisor unit contract to preserve its `auto` post-hoc request while checking that the resolver selects Games–Howell for unequal variances. The two focused Jest suites pass 11/11.
- The installed-Chrome color-picker/toolbar suite passes 7/7. `npm run quality:static` passes with 637 test-manifest rows, 900 explicit/0 inferred requirements, 1,059 Chromium tests discovered, and 11 fresh thumbnails. `git diff --check` passes.
- The full Jest lane remains incomplete: it was stopped during the sequential integration phase after five of 56 integration files; the combined Scatter stats-default suite also timed out in two cases, while those cases passed individually. No full-suite pass is claimed. Roadmap progress remains about 65%; manual assistive-technology review, remaining overlay/state coverage, desktop target-size exception, chart-overlap contrast, and broad cascade review remain open. No Firefox tests were run.

## 2026-10-09 — DataViews focus continuity and value-field retest

- Rebuilding the DataViews tab strip dropped keyboard focus after switching views. The shared renderer now restores focus by view/action identity and moves focus to the active view after closing the current one.
- The new keyboard contract and 19 DataViews DOM tests pass. The shared Chrome DataViews/ownership/archive batch passed 20/20; its Surface archive case passed 1/1 when rerun alone after a transient unsettled-frame failure.
- The reported value-field ring does not reproduce on the current exact Live Server page: installed Chrome leaves the Scatter X max and Custom formula fields at their resting 1px border with no outline or shadow after clicks and typing. The all-workspace field sweep and focused checkbox/select/formula checks pass; no extra CSS override is warranted.
- Roadmap Phase 2 now records DataViews activation/close focus coverage. Other menu families, owner-change paths, manual assistive-technology evidence, and the existing Phase 2 interaction gaps remain open.

## 2026-10-09 — Line forecast visibility authority

- The forecasting fieldset now starts with native `hidden`, and Line updates only that property when regression mode changes. The rendered Chrome contract checks hidden/visible state and empty inline display for Linear, ARIMA, and Holt-Winters.
- The focused Line visibility and four-component grouped-controls contracts pass 2/2 in installed Chrome. The test inventory now has 635 rows. Mixed visibility writers remain in other control families and are still open.

## 2026-10-09 — Box conditional controls and stale hooks

- Box summary, point-mode, and custom-whisker controls now use native `hidden` state through graph-type, whisker-rule, and restore projections. The CSS row rule no longer supplies a second visibility authority.
- Removed error-width and unified-color DOM hooks after confirming their IDs had no static markup or runtime builder; retained the archived error-width value used by rendering. Box mode/reopen, Line visibility, and grouped-panel Chrome contracts pass 4/4; Box and Line ESLint plus UI lint pass.

## 2026-10-09 — Shared hidden-state authority

- ROC's hidden comparison label was still rendered because the shared stats-label selector assigned `display:inline-flex`, overriding the browser's native hidden style. A single global `[hidden]` rule now wins over component display declarations; 28 duplicate component hidden rules were removed, including 17 redundant `!important` declarations.
- ROC comparison controls now toggle native `hidden`. Installed Chrome passes 26/26 across the all-workspace accessibility matrix, Box and Line transitions, grouped controls, ROC same-type isolation/archive reopen, and modal lifecycle. Current source is 2,560 HTML lines, 8,786 CSS lines, and 236 literal `!important` declarations. Static gate and thumbnail refresh remain pending.

## Baseline

- HEAD: `2e6aaff9ff04f35353a3368513fe7f7752d1cc3a`; existing worktree edits were present and are retained.
- Roadmap-start snapshot: `index.html` 2,559 lines, `css/style.css` 8,935 lines, and 336 `!important` declarations; 72 was the original static naming-candidate count, not a live failure count. Current source is 2,558/8,806 lines, 221 `!important` declarations, and zero static inline style attributes. PCA and Box visibility migrations removed all 12 reviewed static inline styles. Unused range, axis-summary, and nine numbered inline-migration hooks were removed after whole-repository consumer searches. All remaining numbered hooks were subsequently mapped and renamed.
- Initial focused real-vendor snapshot (issues since repaired): Chromium 148 and Firefox 150; welcome carousel cards 57.5px at 390px; reduced-motion still had smooth carousel scrolling. Box/Heatmap controls lacked accessible names; tab rename nested an input inside a button.
- Baseline version/tool checks: project CI runs Node 20. Validators must support it.

## Phase status

| Phase | State | Evidence / remaining work |
| --- | --- | --- |
| 0. Inventory and guardrails | In progress | Pinned validators and axe are wired into local and CI static checks; the latest mounted scan passes Welcome and all eleven components in Chrome. Earlier Firefox results are historical only. Full consumer/state matrix and dependency advisories remain. |
| 1. Shared names, focus and valid markup | In progress | Identified static/dynamic names, search, and tab rename structure are repaired. The shared input-modality helper removes pointer rings from controls and their AG Grid/font-control wrappers, including controls rendered under `body`; the root focus token is also disabled in pointer mode, so more-specific value-field rules cannot restore a ring. Keyboard focus remains visible. The Welcome search focus border is keyboard-only. Chrome tests compare full focused/unfocused styles after repeated clicks and value entry. A 1920×1080 real-pointer sweep checks every visible editable value field and its ancestors across all eleven workspaces. A fresh Chrome page on the exact Live Server URL also confirms Scatter X max and Custom formula retain their resting border, outline and shadow when clicked. A numeric filter reproduced the deferred AG Grid portal override; scoped specificity now covers that field family. Selected AG Grid cells retain their separate green outline. Manual assistive-technology checks and unmounted states remain. |
| 2. Custom interactions | In progress | Owner-aware menu coverage includes workspace tabs and toolbar, DataViews export, AG Grid, PCA/Scatter point menus, font/color-scheme listboxes, four number-format menus, three axis-dialog families, and Box formula suggestions. Chart-point keyboard access now covers all eleven graph workspaces, with dedicated Heatmap and dense-Scatter data entry. All eleven graph workspaces support keyboard graph sizing and 0–100% pointer/keyboard divider movement; all eleven support keyboard label movement with focus retained. Chrome verifies divider endpoints and Scatter collapsed-pane reopen (12/12); All eleven graph titles and seven Cartesian axis titles survive archive reopen; Pie legend movement is also archive-covered. Five focused shared Jest suites pass 125/125. Remaining uncovered menu/grid states and owner changes during activation, non-title label archive positions, and manual screen-reader review remain. Current checks use Chrome; Firefox evidence is historical.
| 3. Responsive/visual accessibility | In progress | Welcome carousel and all-eleven-component overflow checks pass at 320×568, 360×740, 390×844, 430×932, 640×450 (200%-equivalent CSS width), 768×600, 1024×768, and 1440×900. Shared stacked layout preserves the saved graph/split state. A broad desktop dialog width had reduced its usable grid by 2px and dropped the fifth gallery card; the content-box width is restored while the phone dialog remains viewport-bound. Chrome short-screen checks cover the gallery/import dialog, open-mode, replace-unsaved and duplicate prompts, workspace-tab and toolbar overflow menus, DataViews export, PCA/Scatter point menus, both Font toolbar listboxes, Welcome search, and the shared color-scheme listbox across all eleven workspaces at 320×400. The Font controls remain horizontally scrollable at narrow widths, keeping the trigger reachable; Escape closes a listbox without dismissing its editor. Welcome search stays in view after resize; the color-scheme listbox fits the viewport and supports pointer and keyboard use. The Chrome mounted axe scan reports zero violations on Welcome and all eleven components, with 234 contrast-text nodes reviewed at a minimum of 9.51:1; these results do not settle complex graph overlap. Browser assertions keep desktop data rows at 20px on all eleven components and discrete header actions at least 24×24px; all-pointer contracts verify fixed 20px rows and 24px graph resize corners on every component. The 16px row-checkbox targets remain documented accessibility debt in the 456-control scan. Actual 200% Chrome zoom passes. A test-only 200% UI-text override at 1024×768 also passes on Welcome, the gallery and all eleven components; native OS text-size settings, contrast overlap review, remaining overlays/menus, other target families, and non-default forced-colors states remain. |
| 4. Reduced motion | In progress | Shared CSS plus explicit carousel/tab scrolling honor reduced motion at startup and after runtime preference changes. A new Chrome contract verifies both scroll paths switch from smooth to automatic and the CSS scroll behavior updates live. Browser contracts exercise document-open focus/progress through completion and a large Box draw through loading, cancellation, retry, and successful rendered completion. Box cancellation now also checks a sub-second maximum event-loop gap; the fixed case passes three repeated Chrome runs. Native OS preference behavior remains for manual evidence. |
| 5. Cascade/markup cleanup | In progress | Conditional form/control visibility is now normalized across Box, PCA, Line, ROC, Scatter, Survival and Venn; the 18-case Chrome transition/reopen/ownership batch and all-field pointer-focus sweep pass. Box grouped-stat rows use stylesheet classes and existing spacing/font tokens instead of inline layout styles. The visibility backlog issue is closed. All 12 reviewed static inline styles are gone. Twenty-eight duplicate component hidden rules were retired, including 17 unnecessary priority declarations. Unused range/axis-summary selectors, nine component `grid-template-columns` breakpoints on flex wrappers, the adjacent duplicate Heatmap rule, and redundant important color-label, color-picker radius, workspace-tab radius, and shared control-radius priorities are removed after source/winner inspection. A source-order and runtime-style-writer map now lives in `ARCHITECTURE.md`, including deferred AG Grid stylesheet order. A global control-radius rule excludes the square toolbar overflow rail; its existing overflow contract passes. Shared AG Grid geometry uses separate 20px body-row and 24px header-action tokens. Standard and compact control-padding tokens replace repeated 4px 8px and 2px 8px declarations. Ten exact 150px data-panel floors share `--workspace-data-panel-min-width`; the 99-case Chrome matrix checks the CSS floor and restores live resizer overrides. The green AG Grid selection perimeter and pinned-row edge are covered. Shared pointer/keyboard modality removes pointer focus rings while keyboard indicators remain visible. Eight semantic UI layer tokens preserve overlay values; a stale Style Sync selector was replaced with its active data-form hook. AG Grid resize overrides were checked against deferred vendor order; 14 unnecessary priorities were removed. Subsequent Chrome audits moved shared cell border, spacing, header sizing, and focus resets to app-shell specificity. Consumer-specific selection and seam overrides remain covered by focused tests. A PostCSS scan found no exact duplicate declaration on the same selector/condition path, but does not explain every remaining priority. 108 `!important` declarations remain under the tightened 108/108 cap. Follow-up Chrome audits removed shared border/spacing/header-sizing and focus-reset priorities by app-shell specificity, and retired selectors for unproduced legacy grid markup. Per-rule owner/winner review and repeated-measurement tokenization remain open. |
| 6. Final evidence/docs | In progress | The generated inventory has 643 rows, 908 explicit/0 inferred requirements, and 1,127 Chromium tests discovered. The current static quality gate passes; focused shared Jest and Chrome checks pass for this batch. The full component/state matrix, contrast review, manual accessibility evidence, compact desktop grid target-size exception, and unpatched developer-tool advisories remain.

## Change log

### 2026-10-09 — Customizable native select verification

- Added a rendered Chrome contract for `appearance: base-select` theme tokens, pointer open/Escape, keyboard open/ArrowDown/Enter selection, and visible keyboard focus; unsupported browsers still exercise native keyboard selection.
- The focused Chrome contract passes 1/1. The generated inventory reports 633 manifest rows and 1,055 Chromium tests; `npm run quality:static` passes with 894 explicit/0 inferred requirements and 11 fresh thumbnails.

### 2026-10-09 — Value-entry focus check and Windows-safe asset publishing

- Extended the installed-Chrome regression at the reported 1920×1080 viewport to enter `-8` in Scatter X max, double-click it, open the Custom transform field from the screenshot, and double-click that field. Both preserve their resting border, outline, and shadow; the all-workspace scan passes. Current source reproduces no pointer ring in these states, so no additional focus CSS override was justified. Keyboard focus remains visible.
- Replaced whole-directory thumbnail swapping with staged per-file promotion and rollback, writing the manifest last. All 11 thumbnails regenerated successfully while the Live Server directory remained open; the publisher's open-directory and failed-promotion rollback tests pass.
- The same cascade slice reuses the existing panel-border token across Welcome, configuration, graph, and color-picker surfaces, and routes 56 vertical margins at 4px, 6px, 8px, and 12px through existing spacing tokens with unchanged computed values.
- Replaced the value-field pointer sweep's programmatic focus with real pointer clicks on representative visible field patterns across every toolbar section. The expanded Chrome contract passes for all eleven workspaces; a direct fresh Chrome visit to `127.0.0.1:5500` also reports unchanged outline, shadow, and border on Scatter X max and Custom formula. Keyboard focus remains visible.
- Confirmed graph-edge handles and panel split dividers are aria-hidden and pointer-only; shared SVG label/legend drag helpers also lack keyboard routes. Their session-safe interaction work and the remaining chart-selection audit are tracked separately in `issues.txt`.
- Validation: welcome-asset Jest suite 11/11; installed Chrome all-workspace focus contract 1/1; `npm run quality:static` passes with 633 manifest rows, 892 explicit/0 inferred requirements, 1,052 Chromium tests, and 11 fresh thumbnails. Firefox was not run.

- Roadmap audit revised on 2026-10-07 with current code/browser evidence and seven implementation phases.
- Added pinned Stylelint, HTML-validate, and axe dependencies; `lint:ui` passes and runs in both static quality entry points. `npm audit` reports five high findings rooted in `braces@3.0.3`; no newer registry release is available.
- Repaired identified labels/focus and search semantics; axe passes Welcome plus all eleven mounted components in Chromium.
- Workspace tabs now use linked panels, roving focus, manual keyboard activation, focus restoration, and a valid sibling rename overlay. Rename/overflow tests pass.
- On 2026-10-08, keyboard tab rename via F2 and focused Chromium/Firefox rename/tab tests passed. The all-component viewport sequence traced Surface overflow to `Shared.syncPanelWidths` applying graph-resize pixel widths while panels were stacked. The shared fix preserves graph and saved split state. All eleven components now pass sequential document/body overflow checks at 320×568, 360×740, 390×844, 430×932, 768×600, 1024×768, and 1440×900; the resolved issue was removed from `issues.txt`. The inventory was regenerated and `npm run quality:static` passed.
- Workspace tabs now also reorder from the keyboard with Control/Command+Shift+Left/Right. The handler uses `Main.tabDrag.moveWorkspaceTab`, the shared dirty-state recorder, and existing rerender focus restoration; Chromium and Firefox contracts cover both modifier families, both directions, moved-tab focus, and active-owner preservation.
- The same responsive boundary could recapture a stacked panel ratio over an existing desktop split. `componentLayout.captureState` now ignores measured split geometry while CSS stacks panels. Focused tests verify both the panel-style reset and saved split preservation.
- Reduced-motion checks now cover a held document-open transaction through completion and a large Box render through loading, cancellation, and retry; dialog focus, live status, and short one-shot animation timing are asserted. The stale hard-coded tab border color check now compares against the pre-operation design token.
- Forced-colors keyboard coverage now verifies visible tab focus and the selected state. A separate modal audit confirmed inconsistent prompt focus ownership; the roadmap and `issues.txt` now require a shared lifecycle/stack refactor instead of isolated prompt patches.
- Carousel cards now adapt to phone widths; 320px/390px browser checks verify readable cards, hit targets, page width, and reduced-motion wheel behavior.
- Browser theme metadata now matches the teal token. PCA t-SNE/UMAP/3D visibility uses `hidden` without stale inline display state in both activation projection paths.
- Removed unused legacy range and axis-summary selector families after searches across source, tests, and runtime builders; reduced the stylesheet from 8,951/319 to 8,903 lines/317 `!important` declarations. Axis-control Jest and Box flipped-axis browser checks pass.
- A PostCSS selector inventory identified an adjacent duplicate Heatmap config-panel rule. Merged its declarations after confirming identical selector and global condition; other repeats are responsive/theme rules or non-adjacent overrides and remain untouched pending consumer/winner analysis.
- The shared color-label audit found a later `text-align:center !important` rule duplicating the earlier same-selector `text-align:center` declaration. Removed the redundant override after checking all class consumers and competing selectors; the earlier complete label rule remains authoritative.
- After the CSS consolidations, `npm run lint:css` passed, the all-component seven-viewport Chromium contract passed (3 tests), and the shared color-picker ownership browser check passed (1 test).
- The complete `npm run quality:static` gate passed after regenerating the eleven CSS-fingerprinted welcome thumbnails. A fresh `npm audit` still reports 5 high and 20 moderate findings; `braces` remains at registry version 3.0.3, and npm's proposed Stylelint fix is a major downgrade, so the recorded dependency issue remains open.
- After keyboard reorder implementation, the four-case Chromium/Firefox pointer-plus-keyboard tab suite passed, and `npm run quality:static` passed after refreshing the application-fingerprinted welcome thumbnails and the 614-row test inventory.
- Updated the workspace accessibility contract for the additional tab shortcuts; its full Chromium run passed all 5 tests, including the axe scan over Welcome and all eleven components. The final `npm run quality:static` run passed with 990 Chromium tests discovered and all generated assets/inventory current.
- Recomputed exact source counts against HEAD using UTF-8 physical lines with the trailing empty split excluded: `index.html` 2,557 lines and `css/style.css` 8,899 lines (316 `!important`).
- Removed resolved naming, rename, focus/search, carousel, motion, validation, metadata, and PCA findings from `issues.txt`; retained cascade debt and the dependency advisory.
- WCAG target-size audit found shared AG Grid cells at 20px high and filter-action buttons at 18×20px across mounted component examples. The shared CSS token is now 24px; AG Grid row/header defaults read that token, and the scroll calculation uses it with the same fallback. The all-component accessibility test now asserts every visible grid cell and header action is at least 24×24px. The first settled scan had 1,639 target-size incomplete nodes; the repeat scan has none. Axe still reports 294 contrast items as incomplete review prompts (188 are scaled Welcome thumbnail text/images; the remainder are layered or pseudo-element component controls), not violations. The full component axe/geometry test passes, as do the focused AG Grid structural/scroll (6 tests), selection geometry, and editor-behavior (15 tests) Jest checks. Actual browser zoom, enlarged-text, contrast, overlay, and assistive-technology evidence remain open.
- Added a 640×450 CSS viewport case to the all-component layout matrix, representing the width of a 1280×900 desktop at 200% zoom without claiming actual zoom behavior. All eleven components passed the expanded matrix in Chromium; actual browser zoom remains open.
- Regenerated the 614-row test inventory after updating its viewport coverage. The final `npm run quality:static` gate passes with CSS/HTML lint, ESLint, architecture docs, asset freshness, and test inventory checks current. Source counts remain `index.html` 2,557 lines and `css/style.css` 8,899 lines/316 `!important` declarations.
- Added `Shared.modalLifecycle` and migrated all eight DOM modal flows to one stack/focus owner. Linked modal descriptions in source; unit and browser contracts cover focus trapping, background inerting, cancellation, nested picker dismissal, document loading/error behavior, and focus return. Chromium passed the nine-test modal/document/unsaved/style-sync batch; Firefox passed seven modal/document cases; the shared modal Jest suite passed two tests. A separate document-open load/error/retry suite passed 3/3 in Chromium and Firefox. A stale `.style-sync-panel form` rule no longer matched the data-form div; the corrected flex hook keeps Apply visible and usable. The Welcome smoke contract now checks the 28px carousel controls and immediate wheel behavior under reduced motion. `npm run quality:static` passed with 616 manifest rows, 997 Chromium tests discovered, fresh assets, and current generated docs. Remaining full-roadmap, manual accessibility, zoom, contrast, and viewport evidence stays open.
- The shared modal issue was removed from `issues.txt` after the full dialog migration and focused browser evidence passed. Other CSS/HTML and dependency work remains open.
- Audited AG Grid resize and merged-header rules against the later-loaded vendor CSS. Removed 14 redundant resize-handle flags and five redundant grouped-header overflow flags. A new rendered assertion caught that shared important cell borders still win over normal seam clears, so those 20 flags remain until the shared border contract is refactored. The 10-case Chromium grouped-header/resize suite and `npx stylelint css/style.css` pass; 317 declarations remain.
- Regenerated all 11 CSS-fingerprinted welcome thumbnails. `npm run quality:static` passes, including CSS/HTML lint, ESLint, generated architecture/test docs, bootstrap/vendor/runtime checks, asset freshness, and the test inventory (632 manifest rows; 1,042 Chromium tests discovered). No Firefox tests were run.
- Extended the keyboard-accessibility contract to focus a rendered Scatter header by keyboard and check the visible app outline plus both suppressed vendor pseudos. Chrome passes the 3-test chart-point/grid keyboard suite; the retained important flags are now tied to a rendered behavior assertion.
- After that focus audit, regenerated all 11 CSS-fingerprinted thumbnails and reran `npm run quality:static`; CSS/HTML lint, ESLint, generated docs, bootstrap/vendor/runtime checks, asset freshness, and inventory all pass (632 manifest rows, 1,042 Chromium tests discovered; no Firefox run).
- The shared-color token slice replaced 43 exact-white UI surface declarations/fallbacks with `--gt-surface` and 15 exact-ink foreground/icon/border declarations with `--gt-ink`. Plot canvases, the white fill-handle border, and white action text remain intentional literals. Each token has only its root definition and resolves to its unchanged color. Chrome workspace accessibility and color-scheme checks pass 11/11 (zero axe violations; 234 text nodes reviewed, minimum 9.51:1); the static gate passes with fresh thumbnails.
- A short-screen overlay check at 320×400 found the welcome gallery panel extended 16px past the viewport: its declared width excluded padding. Adding `box-sizing:border-box` fixes the panel at its owning CSS boundary. Welcome gallery and import dialog short-screen geometry pass in Chromium and Firefox; the full modal/document/unsaved/Style Sync Chromium batch passes 11/11, and the modal suite passes 6/6 in both browsers. The final static gate passes with 616 manifest rows, 998 Chromium tests discovered, and fresh generated assets/docs. Actual browser zoom, remaining overlay/menu states, contrast and manual assistive-technology evidence remain open.
- Forced-colors review found the selected component-toolbar tab lost its underline after the theme override set `border-bottom:0`; active foreground/background then mapped to the same Canvas colors. Added system-color outlines for selected/pressed/checked controls and a Highlight underline for selected workspace-toolbar tabs. The all-eleven-component contract passes in Chromium and Firefox. A headless Chromium keyboard probe did not change browser zoom (`innerWidth`, DPR, and visual viewport scale remained unchanged), so actual browser-zoom evidence remains open.
- Resize follow-up added per-frame SVG/mark visibility checks. Thirty focused checks pass across Chromium and Firefox, covering graph-frame drags, responsive stacked layouts, table/graph dividers, and component-specific redraw stability. The reported disappearance/stutter is still not reproduced; the exact handle, component, and browser are needed to target the failure. No production resize edit was made during this follow-up.
- A follow-up rechecked live resize after the report: six graph types pass in both Chromium and Firefox; Box, Heatmap, Pie, Surface and UpSet live-redraw cases pass in Chromium; four table/graph-divider cases keep rendered graphs visible. The failure remains unreproduced; the exact component, browser and handle are still needed. The geometry/render path was left intact.
- A real CSS cascade failure overrode square corners on the toolbar overflow rail. The broad control-radius selector now excludes that rail; the existing 3-case Chromium overflow contract passes unchanged. The shared toolbar keyboard-menu contract now tests navigation, dismissal and focus return in Chromium and Firefox. CSS lint, HTML lint, scenario inventory check, targeted Jest, and E2E checks passed.
- The shared resizer and component-layout helpers emitted debug records on every pointer move while debug mode was disabled. All debug logging in those two shared modules now uses the canonical debug switch. The focused resizer/layout Jest suites pass 15/15, ESLint passes, and the six-component Chromium live-resize suite passes 6/6. This removes logging overhead; the reported graph disappearance is still not reproduced.
- Recomputed the current CSS/HTML baseline against `HEAD` using UTF-8 line counts with a trailing empty split excluded: `index.html` 2,559 lines and `css/style.css` 8,915 lines; the stylesheet has 322 literal `!important` occurrences.
- Added `Shared.tabListKeyboard` for the Venn, Box, and Pie result tablists. Arrow keys and Home/End move focus and the tab stop without changing selection; Enter/Space continue through each component's existing handler. Unit coverage passes 5/5, and the rendered three-component contract passes 6/6 in Chromium and Firefox. The matching `issues.txt` item is resolved.
- Rechecked the reported graph-resize failure on the current source in a fresh Chromium server: 17/17 focused graph-frame and component redraw checks pass. No resize geometry change was justified; the exact reported component/handle/browser is still needed.
- Added `Shared.menuKeyboard` to unify roving focus, Home/End, ArrowUp/Down, Escape, Tab exit and focus return across tab, DataViews, PCA and Scatter menus while leaving actions owner-scoped. `Shared.chartPointKeyboard` separately provides a single named chart entry, point navigation, and keyboard activation for PCA/Scatter; dense points remain reachable through the named grid. Jest and Chromium/Firefox contracts pass. Manual assistive-technology and owner-change review remain.
- The point-menu action check caught focus loss when PCA/Scatter redraw replaced the focused SVG mark. Actions now retain the source owner, redraw that owner, and return focus to the matching newly rendered point (or its chart) after the owner settles. Chromium passes both action/redraw cases; the separate point-navigation entry gap remains open.
- Rechecked graph-frame live resize in Chromium across 12 cases: Box's canvas-backed plot, Scatter, Histogram, ROC, Survival, Line, Pie, Surface and UpSet all retain rendered geometry through pointer release. The reported hide/stutter remains unreproduced; a P1 report is recorded pending the graph, handle, browser, and whether the graph stays hidden after release.
- Added a dense Scatter live-resize contract at 640px: 7,001 rows retain visible SVG marks during a continuous edge drag with multiple intermediate frame widths. Chromium passes; the broader user report remains open because its component, handle, and browser are still unknown.
- A dense Scatter keyboard test exposed that its AG Grid fallback had no accessible name. The shared HOT factory now names the grid root and all eleven component factories pass their component-specific label; PCA/Scatter keyboard navigation and dense-grid fallback pass in Chromium and Firefox. Shared-grid and point-navigation Jest tests pass 10/10.
- The all-workspace axe scan caught live point-button focus semantics copied into the PCA welcome SVG. Static SVG sanitization removes interaction-only point attributes while retaining static chart naming; the thumbnail set was regenerated and the all-eleven-workspace Chromium scan passes with no WCAG violations.
- Extended the reduced-motion large-Box contract through a successful retry: the job reaches `complete`, the overlay closes, and visible axis geometry remains. The focused Chromium test passes; cross-browser/OS review remains open.
- Refreshed the 619-row testing inventory and all eleven SVG thumbnail provenance records after the script-load change. `npm run quality:static` now passes end to end.
- Final source review: `index.html` is 2,560 lines and `css/style.css` is 8,915 lines with 322 literal `!important` declarations, counted as UTF-8 physical lines with a trailing empty split excluded against HEAD `2e6aaff9ff04f35353a3368513fe7f7752d1cc3a`. After the keyboard-menu additions, the generated inventory has 622 rows; `npm run quality:static` passes and discovers 1,009 Chromium tests. Shared-menu and chart-point keyboard E2E pass 4/4 in Chromium and Firefox, and the all-workspace Chromium accessibility contract passes 7/7. The reported resize failure remains open and unreproduced by 12 current Chromium graph-frame cases.
- Firefox resize follow-up passed the six shared graph-frame cases and the dense Scatter contract. The first dense Firefox run dragged beyond the 640px viewport and produced the opposite width delta; the contract now keeps the drag in view and verifies the graph and marks through intermediate frames in both browsers.
- Roadmap/code reconciliation found the result-tab entry still described as click-only even though the shared helper and Chromium/Firefox coverage are present; the roadmap now records the implemented behavior and remaining owner-change/AT review.
- A fresh 100-case Chromium/Firefox batch passed 98 cases, including all resize, viewport, modal, menu and all-component accessibility cases. Its only two failures were the same desktop gallery contract: `box-sizing:border-box` had reduced content width by 2px and dropped the fifth card. Increasing the desktop dialog's outer max width to 1208px preserves five columns; the desktop and 320×400 modal checks pass in both browsers. The same batch did not reproduce the user's live-resize failure.
- DataViews export menu actions had hidden the focused menu item without restoring focus. The action now returns focus to its Save trigger; keyboard activation/focus return passes in Chromium and Firefox, and the DataViews export Jest suite passes 19/19.
- The dense Scatter table fallback exposed three tabbable grid viewports and a selected-cell rule that suppressed the keyboard focus outline. Shared HOT now keeps one viewport entry, focuses the first displayed cell when that viewport receives keyboard focus, and removes the listener when the grid is destroyed. A shared CSS rule restores the outline for keyboard-focused selected cells. Tab-entry, cell-navigation, and visible-focus E2E checks pass in Chromium and Firefox; HOT/layout/resizer Jest checks pass 32/32.
- Regenerated all eleven welcome SVGs after the dialog CSS change. The current audit still reports five high and 20 moderate dependency findings: `braces@3.0.3` is affected by GHSA-vfj7-8cjw-p6xm, remains the latest registry release, and Stylelint 17.16.0 still resolves through micromatch 4. The fixed-glob development-only exposure is recorded in `issues.txt`.
- Current source counts against HEAD `2e6aaff9ff04f35353a3368513fe7f7752d1cc3a`: `index.html` 2,561 lines; `css/style.css` 8,936 lines and 325 literal `!important` declarations. The regenerated test inventory has 624 rows. After refreshing all eleven CSS-fingerprinted thumbnails, `npm run quality:static` passes and discovers 1,012 Chromium tests with zero legacy-unmapped files.
- After the live-resize report, the current worktree passes 14 focused Chromium/Firefox E2E cases for dense Scatter, Surface, and UpSet, including continuous graph-frame resizing and stacked layouts. The broader report remains open because its affected component, handle, and browser are still unknown.
- A wider resize follow-up passes the six shared graph-frame geometry cases, Heatmap's live-resize case, and the seven-test PCA metric suite, including its width/height resize checks. Source review found Scatter, Line, and ROC still logged on every pointer move; those logs now follow the shared debug switch, with a post-fix 3/3 live-resize pass. The graph-disappearance report remains unreproduced.
- The latest live-resize matrix passes 9/9 graph-edge cases in Chromium and Firefox, 5/5 component-specific redraw cases in Chromium, and 5/5 table/graph-divider cases in Chromium. A source review also removed per-point ARIA attribute writes from Scatter/PCA redraws; attributes now apply only to the active keyboard point. Point-navigation Jest passes 4/4, and focused keyboard plus Scatter-resize browser checks pass 4/4 in Chromium. The reported resize defect remains open pending its exact component, handle, viewport, and browser.
- AG Grid's main and pinned-row horizontal scroll regions now receive keyboard focus without changing grid child roles; main-region entry focuses the first cell. The scroll contract checks rendered column alignment rather than comparing independent `scrollLeft` values. All eleven mounted axe scans pass in Chromium and Firefox; focused grid/point keyboard and scroll checks pass 6/6 in Chromium, and the targeted shared-grid Jest suites pass 12/12.
- Final current-source follow-up: graph-frame resize, dense Scatter, and responsive Surface/UpSet pass 9/9 in each browser; the combined resize/grid keyboard batch passes 28/28. The reported hide/stutter remains unreproduced, so its P1 stays open for an exact component/handle/browser sequence. Current counts against HEAD are `index.html` 2,558 lines and `css/style.css` 8,949 lines with 326 `!important` declarations. Regenerated the 624-row testing inventory and eleven CSS-fingerprinted welcome previews; `npm run quality:static` passes with 1,013 Chromium tests discovered. Actual browser zoom, manual assistive technology, contrast review, and dependency advisory remain open.

- Reproduction superseded the earlier unreproduced resize notes: with 7,001 Scatter rows, per-pointer resize draws took 15.2 seconds for 120 steps and produced frame gaps up to 192ms. The shared fix selects a scaled live preview for canvas-backed or at least 1,500-point graphs and defers only resize-start/move draws; ordinary plots keep live axis redraw. Chromium and Firefox pass 18/18 across six component redraw cases, dense Scatter, and responsive Surface/UpSet. Dense corner-drag samples show visible marks in every frame, clear the preview after final draw, and record maximum gaps of 47.9ms/45ms (zero gaps above 50ms). Focused lifecycle/resizer Jest suites pass 28/28, `npm run lint:ui` passes, and `npm run test:inventory:check` passes with 624 files and no legacy-unmapped tests.
- Recomputed the source baseline against HEAD 2e6aaff9ff04f35353a3368513fe7f7752d1cc3a using UTF-8 physical line counts without a trailing empty split item: index.html 2,558 lines, css/style.css 8,942 lines, and 338 literal !important declarations. Earlier values in this progress log are superseded.
- Current all-workspace axe contracts pass 1/1 in Chromium and Firefox with zero WCAG violations and no incomplete target-size nodes; the full Chromium accessibility spec previously passed 7/7. Axe marks 234 Chromium and 303 Firefox contrast nodes incomplete. The computed-color review resolves all text/fill pairs at a minimum 9.51:1 against solid surfaces, and checks Firefox's 69 embedded select carets against the 3:1 non-text threshold. Complex graph-text overlap remains a visual review item. A headless Ctrl+Plus probe left browser zoom unchanged in both engines, so it is not accepted as actual 200% zoom evidence. The rendered Welcome page was inspected at 1440×1000. Actual browser zoom, enlarged text, overlay-state coverage, non-default forced colors, and screen-reader testing remain open.
- Added a WCAG 1.4.12 text-spacing override contract (1.5 line height, 0.12em letter spacing, 0.16em word spacing, and 2em paragraph spacing). In Chromium and Firefox, the welcome gallery/import dialogs stay within 320×400 and visible controls remain reachable across all eleven component workspaces at 320×700; both focused runs pass 1/1. The new scenario is explicitly registered. The forced-colors state test also passes 1/1 in each engine after its timeout was raised to cover sequential activation of all eleven workspaces; no assertion or product behavior changed.
- Resize follow-up: 23/23 live-resize cases pass in Chromium. In Firefox, the Scatter/Line comparison initially lost Scatter pointer events because both page-driven drag scenarios ran concurrently; the exact zero-origin drag passes alone, and the serial comparison now passes with all assertions intact. The other Firefox resize cases pass, with the Chromium-only Box case skipped. The reported disappearance/stutter is still not reproduced in these checks; the affected graph, handle, and browser are needed for a targeted reproduction. The comparison spec passes ESLint and `git diff --check` passes.
- Actual browser zoom is now exercised with Chromium's tab zoom API: at 200%, the welcome gallery and all eleven example workspaces remain reachable without document/body overflow or clipped controls. The Chromium contract passes 1/1; Firefox is explicitly skipped because this helper uses Chromium's extension API. The scenario is registered and the generated testing inventory contains 625 rows.
- After the user's renewed resize report, a fresh Chromium run passes all four focused contracts: stacked Surface, stacked UpSet, Scatter/Line live-resize comparison, and dense Scatter's continuous drag with visible marks and bounded frame gaps. The exact reported graph/handle/browser still is not known, so `issues.txt` keeps the P1 open. Source review found deliberate component preview paths in Venn, Scatter, Pie, and Heatmap; a blanket callback suppression would break those paths, so the report needs a targeted reproduction before a shared behavior change.
- Roadmap reconciliation checkpoint before the current Chrome-only scope: Chromium browser zoom was verified; Firefox actual zoom, enlarged text, remaining overlay/menu states, manual assistive technology, complex chart/text overlap, and non-default forced-color states remained open at that checkpoint. Its source counts (2,558 HTML lines, 8,942 CSS lines, 338 `!important`) are historical and are superseded by the current baseline above.
- Final verification: `npm run quality:static` passes with 625 manifest rows and zero unmapped tests; actual 200% Chromium zoom passes 1/1, actual-zoom Firefox skip is policy-governed, and `git diff --check` reports no whitespace errors.

- The user's all-graph resize report is now reproduced and fixed. The responsible uncommitted change was the global reduced-motion CSS policy: `transition-duration: 0.01ms !important` also activated the default `transition-property: all` on elements that previously had no transitions. Panel synchronization measured the old width and reversed horizontal changes; SVG frame publication transitioned out of its staged hidden state, briefly hiding each replacement graph. Prior ordinary-motion resize tests missed this environment.
- Counterfactual verification on the user's `http://127.0.0.1:5500/index.html` in installed Chrome: the original CSS froze horizontal width at 341px and exposed 20 hidden publications during 20 vertical draw steps. Changing only transition duration to zero restored horizontal growth to 405px and produced no hidden publications. The new Survival Playwright regression failed before the fix with zero horizontal growth. The user explicitly confirmed the issue is fixed. No component or resize-scheduler code changed for this correction, and the resolved P1 was removed from `issues.txt`.
- Registered `LAYOUT.reduced-motion-live-resize` with explicit all-eleven-component scope and UI setup. Its browser test checks both drag directions on both axes, visibility at every publication and animation-frame sample, and size continuity after release. CSS/HTML lint and focused ESLint pass; generated inventory now includes this regression.
- Final resize validation: Chromium passes all 11 component regressions (44 drag directions across both axes). The generated testing inventory validates 626 rows; all eleven CSS-fingerprinted welcome thumbnails were refreshed and validate; whitespace checks pass. Current CSS is 8,943 lines with 338 literal `!important` declarations. The requested resize correction is complete; broader roadmap work is stopped pending the user's next instruction.

- The user resumed the roadmap. The open shared color picker, measured in a real-vendor Box Format-toolbar fixture at 320×400, had 95 axe target-size violations, extended below the viewport to 456px, and lost keyboard focus after Escape. These are bounded presentation/lifecycle defects at the existing shared popup owner; no component ownership or graph-sizing refactor is needed for these repairs.
- The picker now uses viewport-bounded width/height, internal scrolling, 6px palette spacing, and repositioning when its palette expands. Escape stops propagation to the parent toolbar and restores its trigger; outside-pointer dismissal preserves its existing focus behavior. In forced colors, the original selected/unselected swatches had identical computed appearance. The old checkmark rules were scoped under `#appShell`, while the only picker producer appends it directly to `body`; those unreachable overrides were removed and the selected cue moved to the canonical picker section.
- Current color projects selected classes and `aria-pressed` through the existing swatch registry, including recent colors; the private `findSwatch` and `lastSelectedSwatch` mirror had no external consumers and were removed. The visible focus outline uses the shared token. Escape, expanded-palette axe/geometry/custom input, forced-color selection/focus, and retained toolbar text-selection behavior pass in Chromium and Firefox. Focused ownership Jest passes 1/1; CSS/HTML lint passes. The first correctly configured regressions failed before the corresponding production fixes. Test-fixture label/order and keyboard-modality mistakes were corrected independently, without weakening final behavior assertions.
- Added explicit Box/shared-popup scenario evidence to the existing browser spec and regenerated the 626-row inventory. At that checkpoint, four Chromium checks passed for focus, short-screen geometry/axe, forced colors and toolbar ownership. The focused toolbar ownership Jest test passed 1/1; ESLint, CSS/HTML lint, and whitespace checks passed. This verifies the common picker in mounted Box and Venn toolbar paths, not every component callback or native picker.
- A whole-repository search found nine obsolete `.idx-inline-*` rules with no static HTML or JavaScript, test, asset, or script consumer: `019`, `028`, `029`, `030`, `038`, `039`, `044`, `051`, and `052`. Those rules were removed.

## 2026-10-08 — Numbered style hooks retired

- Mapped all 42 live numbered hooks to their static elements, CSS declarations and five runtime-builder files. No test or script queried them. Render-cache capture is scoped to plot/report child content; these classes belong to control and host wrappers, so old `.graph` caches do not need alias selectors.
- Renamed active hooks to utility and component names. Reused the existing stats help/correction classes with spacing modifiers and shared the statistics action-row base. Removed the inert status hook because ID rules already determined its computed styles.
- Chromium passed the current all-workspace accessibility and responsive suites (11/11), including zero axe violations and the eight-viewport 11-component overflow/ownership sweep. All eleven reduced-motion resize cases also pass: the monitor follows direct published-frame swaps and checks the same visible-mark invariant without rescanning every SVG shape after each nested mutation. The full resize file passed 11/11 in 9.4 minutes. Graph-frame/split reopen checks passed 11/11. CSS/HTML lint and focused ESLint passed. Firefox was not run per current instruction.

## 2026-10-08 — Narrow toolbar and picker verification (Chromium only)

- A real 320×400 pointer test found the toolbar document title overlapped and intercepted the Format tabs. The responsive header now puts the complete title/status row below the tabs under 460px; click and hit-test assertions pass for all eleven component workspaces.
- The shared picker’s five Chromium checks now cover Box Escape/focus ownership, Venn’s actual trace-formatting route, expanded-palette sizing/axe/custom input, forced-color selection/focus, and toolbar text-selection behavior. The Venn route passes its rendered axe check.
- Chromium passed the focused toolbar/picker batch (6/6) and the all-component viewport/overflow/ownership matrix (1/1). Firefox was not run, per the user's current instruction.
- Regenerated all eleven CSS-fingerprinted vector welcome thumbnails and the testing inventory (627 rows). `npm run quality:static` passes: CSS/HTML validation, ESLint, generated-doc checks, bootstrap/vendor/runtime checks, asset freshness, and inventory checks. The inventory discovers 1,031 Chromium browser tests; Firefox discovery is deferred.
- Added a focused Chromium Box contract for conditional graph controls. Its initial rendered checks found no visual mismatch; a follow-up semantic audit moved the nine initial inline display values to native `hidden` attributes and property-based updates. The contract now checks both the semantic state and rendered visibility. The final inventory contains 628 rows and 1,032 Chromium browser tests; Firefox discovery remains deferred.
- Current counts are `index.html` 2,558 lines, `css/style.css` 8,932 lines, and 337 literal `!important` occurrences. The full popup/menu viewport matrix, enlarged text, screen readers, complex chart/text contrast, and broader cascade consolidation remain open.

## 2026-10-08 — Preview-frame and Chrome verification

- Fixed Box preview selection at its source: it now returns the committed `boxSvg` frame for the owning tab, skipping staged, hidden, and pending render frames. Cache fixtures use current render-geometry metadata and production frame IDs.
- Updated the AG Grid contract to reflect its visible drag grip as a decorative mouse affordance (`aria-hidden`); the title remains available visually. Document-open lifecycle tests now load the shared modal owner before asserting that the application is inert.
- Gated workspace-tab drag/reorder diagnostics through `Shared.isDebugEnabled()`. Removed the duplicate Box checkbox selector plus two duplicate select-radius and one duplicate AG-menu-radius declaration after confirming equal values and scope. Regenerated all eleven CSS-fingerprinted welcome thumbnails.
- Chrome-only preview fidelity, same-type inactive-preview isolation, and workspace keyboard/pointer reorder pass 23/23. The previously failing 20 DOM suites pass 299/299; the corrected architecture/runner/cache fixture batch passes 59/59. All 19 accessibility checks passed in Chromium earlier in this work.
- `npm run quality:static` passes with 628 manifest rows, 1,032 Chromium tests, zero unmapped test files, and current thumbnail provenance. `git diff --check` passes. Firefox was not run.
- The CSS cleanup follow-up passes five Chromium checks covering the shared menus, 320px Format-tab hit targets, and Style Sync; CSS/HTML lint and generated thumbnail checks also pass.
- The full Jest lane remains incomplete: its first integration group took 205 seconds, with 55 groups remaining, so it was stopped after targeted reruns. Manual screen-reader/enlarged-text checks, remaining overlay/menu states, and broader cascade consolidation remain open.

## 2026-10-08 — Box conditional visibility

- Replaced all nine Box conditional-control `style="display:none"` attributes with native `hidden` attributes. Graph-type and table-format projection paths now update `.hidden`, including archive/config restoration and significance-row placement; removed the stale `u-hidden` class from the grouped layout control.
- Extended the Box browser contract to assert both `hidden` state and rendered visibility for whisker, cap, error, violin, significance, and grouped-layout controls. It failed before the migration on the missing semantic state and passes after it. A separate archive-reopen test confirms violin and grouped visibility restore with their saved settings.
- Chrome passed the conditional-control, archive-reopen, and Box example/control-panel checks (5/5); the all-component viewport matrix passed 3/3. `quality:static` passes with HTML/CSS lint, 628 mapped files, 1,033 Chromium tests, and refreshed thumbnails. `index.html` has zero inline style attributes. Firefox was not run.

## 2026-10-08 — Cascade duplicate review

- Removed five repeated CSS rules/declaration sets only after confirming later rules retain the same computed values for Venn, PCA, Heatmap, and shared axis controls. No `!important` declarations were removed in this slice.
- Recomputed the current baseline: `index.html` 2,558 lines, `css/style.css` 8,932 lines, 337 `!important` declarations, and zero static inline styles. Chromium layout, Box archive, and actual 200% zoom checks plus the static quality gate pass. Broader cascade mapping, overlays, contrast, and manual accessibility evidence remain open.

## 2026-10-08 — Short viewport overlays (Chromium)

- Added 320×400 rendered bounds checks for open-mode, replace-unsaved, and duplicate modal actions, the workspace-tab context menu, and the toolbar overflow/menu case.
- All six modal lifecycle cases, three toolbar overflow cases, and the workspace-tab menu check pass in Chromium. No product CSS change was needed; the tested prompts and menus already stay within the viewport.
- Firefox remains deferred. Other open-menu families, non-default states, enlarged text, complex chart contrast, and manual assistive-technology review remain open.

## 2026-10-08 — Google Chrome verification

- Confirmed the installed Google Chrome executable and used Playwright's `channel: 'chrome'` with a temporary config; the shared Playwright config was left unchanged.
- The current targeted Chrome browser batches pass 41/41 across Box visibility/reopen, modal and menu behavior, result tabs, chart-point navigation, all-component responsive layout, actual 200% zoom, mounted accessibility, forced colors, text spacing, and the shared color picker. The three focused keyboard Jest suites pass 13/13.
- The all-workspace axe scan reports zero violations and reviews 234 contrast-text nodes at a minimum 9.51:1. This does not resolve chart-mark overlap or replace manual assistive-technology review. No Firefox tests were run.

## 2026-10-08 — DataViews menu bounds and cascade inventory

- Extended the DataViews export-menu keyboard contract to 320×400. The opened menu stays inside the viewport and retains Arrow/Home/End/Escape focus behavior; Chrome passes all three shared-menu checks (3/3).
- A PostCSS scan partitions the 337 `!important` declarations by first matching selector owner: AG Grid/HOT 165, graph/workspace 73, shared controls/utilities 77, focus 11, and hidden state 11. These buckets help prioritize review but do not establish an individual rule's reason or prove removability; the consumer/winning-rule audit remains open.
- No product CSS change was justified by this slice. Firefox was not run.

## 2026-10-08 — Shared point-menu positioning

- The new 320×400 Chrome regression failed for both PCA and Scatter: each menu exceeded the right viewport edge because `[hidden]` gave the positioner a zero-size box.
- Replaced both duplicate positioners with `Shared.menuPosition.placeAtPagePoint`, which measures menus synchronously while visible, clamps rendered bounds including scroll offsets, then restores their previous hidden state.
- Chrome point-menu, DataViews, workspace-tab, and dense Scatter keyboard checks pass 6/6; the shared-menu Jest suite passes 5/5. Firefox was not run.
- `npm run quality:static` passes with 628 manifest rows, 1,033 discovered Chromium tests, 873 explicit requirement links, and 11 fresh welcome thumbnails. The architecture maps and component contracts are regenerated.

## 2026-10-08 — Stats export reopen coverage

- Found that the stats-reopen test queried obsolete `.export-dropdown` markup and silently skipped its liveness check. The live renderer uses native `select.export-select` controls.
- Updated the contract to count the actual Download/Copy selects and perform a real CSV download after archive reopen or recovery wherever controls exist. Chrome passes all nine archive-reopen cases and both Box/ROC recovery cases (11/11).

## 2026-10-08 — Font toolbar short-screen popup

- The 320×400 Chrome pointer check found the responsive Font controls stacked into a 414px panel inside a 68px toolbar viewport, placing the font-list trigger under the Format tab.
- Kept Font controls in the shared horizontal overflow row at narrow widths. The family and preset-size triggers receive pointer input and both listboxes stay within the viewport.
- The nested Escape audit exposed a document-level key handler closing the whole Font panel after the listbox handler had already consumed Escape. The shared handler now respects `defaultPrevented`; the first Escape closes only the popup and keeps the editor open.
- Chrome checks cover both popup types in Line and Scatter. No Firefox tests were run.

## 2026-10-08 — Color-scheme listbox positioning and keyboard access

- The first rendered Box check failed at 320×400: the palette extended 11.7px beyond the right edge. The shared `matchAnchorWidth` placement also left CSS `min-width:100%` in force, producing a 322px popup for a 220px trigger. The helper now constrains both width and minimum width, then restores the source styles when the popup closes.
- The keyboard check found ArrowDown did not open the listbox. The picker now names and links its trigger/listbox, focuses the selected option, supports Arrow/Home/End navigation, and returns focus on Escape. A restored menu can lose its expando owner; owner lookup now uses its live DOM parent, and the unused expando was removed.
- Chrome popup/menu regression batch passes 9/9 across Box palette behavior, Line/Scatter font listboxes, Welcome search, toolbar overflow, and DataViews export. The shared popup-placement Jest suite passes 8/8.
- `npm run quality:static` passes with 629 manifest rows, 1,038 Chromium tests, 877 explicit requirement links, no legacy-unmapped test files, and 11 fresh welcome thumbnails. `index.html` is 2,559 lines; `css/style.css` is 8,932 lines with 336 literal `!important` occurrences. Firefox was not run.

## 2026-10-08 — Axis popup semantics and focus entry

- A rendered Line check at 320×400 confirmed keyboard navigation and Escape focus return, then failed on the missing `aria-controls` target: the number-format popup had no ID.
- The same Chrome review found that Additional ticks and Break axis displayed unnamed generic containers despite `aria-haspopup="dialog"`; focus stayed on each trigger.
- The shared Axis builder now supplies IDs, dialog roles/names, and trigger relationships, then focuses the first enabled control on explicit open. Existing Escape handling closes each popup and returns focus to its trigger.
- Chrome passes all three Axis popup checks (3/3), including keyboard behavior and bounds at 320×400. Focused Axis DOM suites pass 13/13; ESLint passes for the changed JavaScript. `npm run quality:static` passes with 631 manifest files, 1,041 discovered Chromium tests, 881 explicit requirement links, zero legacy-unmapped files, and 11 fresh thumbnails. Firefox was not run.

## 2026-10-08 — Enlarged UI text reflow

- A rendered 200% UI-text stress test at 1024×768 covers Welcome, the example gallery and all eleven component workspaces. It scales non-SVG UI text and form controls; it does not represent native operating-system text scaling.
- Fixed-width control rows forced horizontal spill at enlarged text. My first layout adjustment incorrectly let the entire settings panel wrap below the graph and Notes. Restored the shared no-wrap graph/settings row; controls reflow inside the settings panel, and Venn disclosure details no longer shrink below their contents. Narrow Surface now keeps settings on the right in a contained horizontal scroll area.
- The 200% UI-text stress test passes on all thirteen screens and asserts graph/settings order on all eleven workspaces. The Chrome viewport matrix now covers 99 component/width pairs, including 1920×1080, with the same right-side assertion and no document/body overflow. Actual 200% Chrome zoom passes on all eleven components. Chrome accessibility, forced-colors, text-spacing, and config-fieldset containment checks passed in the focused batch (16/16) before the row correction. Native text-size settings, screen readers and the remaining roadmap states are still open.

## 2026-10-08 — Inert component grid breakpoints

- Removed nine `grid-template-columns: 1fr` declarations from Box, Scatter, PCA, Line, Heatmap, ROC, Survival, Histogram and Pie wrappers. Each wrapper is explicitly `display:flex`; no JavaScript or markup writer changes it to grid, so those declarations never affected layout.
- The all-component Chrome viewport contract now asserts flex display as well as graph/settings order and overflow across 99 component/width pairs; it passes. The CSS source was 8,935 lines with 336 literal `!important` declarations at that checkpoint. Broader cascade review remains open.
- Added the CSS source-order and runtime-style-writer map to `ARCHITECTURE.md`. It records the deferred AG Grid stylesheet order and explains why source position alone does not prove an override wins.
- The final 200% UI-text Chrome contract passes 1/1 after the cascade cleanup. `npm run quality:static` passes with 632 test-manifest rows, 1,042 Chromium tests discovered, and 11 fresh thumbnails; Firefox remains deferred by instruction.

## 2026-10-08 — Important-declaration triage

- PostCSS parsed all 336 current `!important` declarations: 319 are outside conditional rules, 8 are under forced-colors, 6 under reduced-motion, and 3 under customizable-select support. The most common properties are `display` (32), `border-radius` (26), `box-shadow` (22), and `background` (20).
- No identical declaration repeats for the same exact selector and condition path. This rules out a simple duplicate-removal batch; it does not prove unique declarations necessary. Preserve them until each owner family is checked against deferred AG Grid styles, inline writers, and rendered computed styles.
- Two earlier cascade-audit candidates, `.workspace-toolbar__input--range` and `.axis-controls-panel__summary`, no longer occur in the current source and need no further cleanup.
- Added 1920×1080 to the all-component Chrome layout matrix to match the supplied desktop screenshot; the 99-pair contract passes. Routed nine repeated muted-text, border, and muted-header values through existing semantic tokens while keeping specialized disabled/icon colors explicit.
- After the color-token update, the Chrome workspace accessibility and color-scheme checks pass 11/11; axe reports zero violations across 234 contrast-text nodes (minimum 9.51:1). All eleven CSS-fingerprinted thumbnails were refreshed.
- Added four exact-value UI spacing tokens for 4px, 6px, 8px, and 12px gaps; 197 declarations now use them. The 99-pair Chrome matrix explicitly measures Scatter Notes and confirms settings remain to its right. Workspace accessibility passes 9/9, color-scheme keyboard checks 2/2, and the layout matrix 3/3. `npm run quality:static` passes with 632 manifest rows and 1,042 Chromium tests discovered.

## 2026-10-08 — Semantic control-radius cascade

- Chrome computed styles showed the shared high-specificity radius rule overriding explicit Box/Pie result tabs and other component shapes. Replaced its important, exception-based selector with a zero-specificity `:where()` default so component-owned styles win naturally; seventeen redundant radius priorities were removed after checking winners.
- Eight targeted Chrome shape/accessibility checks pass. The all-component layout matrix independently passes across 99 component/viewport pairs; the radius-only slice changes no dimensions or panel placement. Current CSS is 8,926 lines with 299 literal `!important` occurrences.
- The static gate currently stops in ESLint on unrelated Box worktree edits: the extracted stats narrative references two undefined outlier-threshold helpers, and post-hoc wrappers no longer match their source-contract test. A focused Box run also found several independent inference/report failures, so this requires a complete Box stats ownership review rather than a local lint workaround.

## 2026-10-08 — Exact-value line-height tokens

- Routed 41 repeated declarations through three tokens retaining the exact values `1.4`, `1.45`, and `20px`; no layout selectors changed.
- `npm run lint:ui` passed, and the Chrome all-component layout contract passed across 99 component/viewport pairs with graph controls beside the graph and Notes. Refreshed and verified all 11 CSS-fingerprinted thumbnails. Current CSS is 8,929 lines with 299 literal `!important` occurrences.

## 2026-10-08 — Welcome selector consolidation

- Removed nine redundant radius-selector aliases from the final theme block. The retained `#welcomeScreen` rules cover the same elements; `#graphSelectionGrid` is inside that root. No declaration values or page geometry changed.
- `npm run lint:ui` and the Chrome workspace-picker keyboard/radius contract pass. All 11 CSS-fingerprinted thumbnails were refreshed. Current CSS is 8,920 lines with 299 literal `!important` occurrences.
- `npm run quality:static` still stops at ESLint on the four Box stats ownership errors recorded in `issues.txt`; UI lint passes before that blocker.

## 2026-10-08 — AG Grid grouped-border ownership

- Chrome tests exposed visible internal gridlines in synthetic grouped data rows: the shared important border color overrode normal Box, Scatter, Line and PCA seam clears. The shared cell rule now consumes left/right edge-color variables, and grouped seam classes set those values without competing `!important` declarations. This preserves shared border widths/styles and does not alter page geometry. Twenty priorities were removed across Box, Scatter, Line, Line 3D and PCA.
- Chrome grouped header/body seam and resize-handle checks pass for Box, Scatter, Line and PCA; Line 3D header/body seams pass; selected-range fill borders, pinned-row scrolling, all-component SVG export and the 99-pair page-layout matrix pass. CSS/HTML lint passes. All 11 CSS-fingerprinted thumbnails were refreshed.
- The combined 13-test AG Grid batch had 12 passes and one repeated unrelated selection-outline edge failure. Reproduced at `scrollLeft=280` with the pinned cell and outline ending 10–12px before the scrollbar; recorded for investigation in `issues.txt`. Current CSS is 8,922 lines with 280 literal `!important` occurrences. Full `quality:static` still has the existing four Box stats ESLint errors.

## 2026-10-08 — Shared small-text token

- Consolidated all 76 exact 12px interface font declarations under `--ui-font-size-small`; the control-font token aliases the same value. Rendered font sizes remain 12px.
- UI lint passes. Chrome actual 200% browser zoom, enlarged UI text, WCAG text spacing, and the responsive component matrix pass 6/6 tests. All 11 CSS-fingerprinted thumbnails were refreshed and verified.
- Current source counts against the recorded HEAD are `index.html` 2,559 lines and `css/style.css` 8,924 lines with 280 literal `!important` occurrences. The full static gate remains blocked by the unrelated Box stats ESLint issues already recorded in `issues.txt`.

## 2026-10-08 — Shared color-picker radius priority

- The scoped selector already outranked the picker controls' base radius rules. Removed its redundant `!important` while preserving the shared 5px radius.
- Added a rendered radius assertion for all applicable picker controls. The picker ownership and Box live-style suites pass 13/13 in Chrome; CSS/HTML lint passes.
- Current CSS is 8,924 lines with 279 literal `!important` occurrences. The unrelated Box stats ESLint blocker remains recorded in `issues.txt`.

## 2026-10-08 — Workspace-tab radius shorthand

- The workspace-tab rule repeated its zero radius across one shorthand and four corner properties. The class selector already wins over the zero-specificity default; removed all four duplicate longhands and the unnecessary priorities.
- The existing rename geometry contract now asserts the rendered tab radius is `0px`. Chrome rename/reorder checks pass 3/3; CSS/HTML lint passes.
- Current CSS is 8,920 lines with 274 literal `!important` occurrences. The unrelated Box stats ESLint blocker remains recorded in `issues.txt`.

## 2026-10-08 — Shared control-radius ownership

- Removed a duplicate high-specificity text-field radius rule that could override component-owned square shapes despite the shared low-specificity default. The shared `#significanceSection` radius now comes from the common input rule; Axis subdivision uses a scoped selector that wins normally. Seven shape priorities were removed while preserving their rendered zero-radius states.
- Test-first computed-style checks cover broken-axis controls, subdivision and numeric fields, Font controls and options, Box significance controls, PCA axis length/unit controls, and Venn's total-genes input. The six-test Chrome batch passes; CSS/HTML lint passes.
- The inventory check passes with 633 mapped files, 884 explicit/0 inferred requirements, and zero legacy-unmapped files; 1,044 Chromium tests are discovered. Targeted ESLint, asset freshness (11/11), and diff checks pass.
- Current CSS is 8,900 lines with 267 literal `!important` occurrences. The unrelated Box stats ESLint blocker remains recorded in `issues.txt`.

## 2026-10-08 — PCA visibility ownership

- PCA method panels use native `hidden`; no PCA CSS visibility rule competes with them. Activation and method-change writers now share the existing visibility setter. The result-row inline display remains necessary when no result card is visible.
- The focused Chrome method/3D contract passes 1/1 and PCA ESLint passes. No Firefox tests were run.
- Welcome-thumbnail refresh still needs a stable source fingerprint: `js/shared/boxStatsModel.js` changed during generation, leaving manifest and thumbnail provenance stale. The full static gate is pending a successful asset check.

## 2026-10-08 — Light-only browser theme consistency

- A test-first Chrome comparison found `prefers-color-scheme: dark` changed shared picker padding, text and control colors even though the document declares `color-scheme: light`. Removed the stale dark-scheme block; the picker now has one authored light appearance for both OS preferences.
- The regression passes in Chrome; CSS/HTML lint, targeted ESLint, inventory checks, and `npm run quality:static` pass. The gate verifies 633 mapped files, 885 explicit/0 inferred requirements, 1,045 discovered Chromium tests, and 11 fresh vector thumbnails. Firefox was not run.
- Current `css/style.css` is 8,834 lines with 267 literal `!important` declarations. `ARCHITECTURE.md` and the roadmap now record the light-only metadata contract. The roadmap remains active for shared cascade review and remaining component visibility checks.
- A later asset-only check found the welcome fingerprints stale again after `js/shared/boxStatsModel.js` changed while the Box studentized-range benchmark was active. Regenerate and rerun the static gate after that input settles; the preceding full-gate result is not current asset evidence.


## 2026-10-08 — Compact text token and cascade authority recheck

- Added `--ui-font-size-xsmall: 11px` and routed all 58 exact 11px interface declarations through it. The rendered Chrome picker contract asserts both the picker and section title remain 11px; the before/after contract passes, as does CSS lint.
- Rechecked the previously flagged `.workspace-toolbar__input--range` and `.axis-controls-panel__summary` selectors. They are absent from current CSS, markup, JavaScript, tests, and E2E sources; HEAD held duplicate min-width rules, while the current worktree has already retired those unused hooks.
- Current `css/style.css` is 8,835 lines with 267 `!important` declarations. A fresh thumbnail generation again found `js/shared/boxStatsModel.js` changed during rendering, so the output is not accepted as current; refresh after that source settles, then rerun the static gate.

## 2026-10-08 — Base text token and conditional visibility status

- Added `--ui-font-size-base: 13px`; routed 47 exact 13px font declarations, eight graph-control fallback values, and three graph-control defaults through the token. PostCSS confirms no literal 13px `font-size` declarations remain; computed size stays 13px.
- The rendered Chrome color-picker contract now also checks the workspace document title remains 13px. It passed before and after the token change; CSS lint passes. The suite used an isolated Playwright server port because the default port served a different checkout.
- CSS is now 8,837 physical lines with 267 `!important` declarations. Box conditional visibility is complete per the archive-reopen contract and existing tests; remaining component visibility writers stay open. Thumbnail provenance/static gate remains pending while the Box statistics test run is active and source inputs need a stable refresh.
- Added `--ui-font-size-medium: 14px` and routed all 27 exact 14px interface declarations through it. Chrome verifies Welcome text remains 14px; CSS and HTML lint pass, and the test-inventory check passes with 633 mapped files, 885 explicit/0 inferred requirements, and 1,045 Chromium tests discovered.
- `npm run quality:static` passed UI lint, ESLint, component-contract docs, test-inventory docs, bootstrap, vendor, and runtime checks, then failed at thumbnail provenance. `js/shared/boxStatsModel.js` changed from 320,687 to 320,699 bytes during thumbnail generation; the generated images are stale against the current source. Do not claim the full gate passes or refresh again until that file stops changing.
- A monitored refresh then started from stable `boxStatsModel.js` SHA-256 `2EA036C55179C55EA6BDA87DFCBD38D5BAE4F914940B5B1924A7A9B3C2E55867`; all 11 assets passed provenance, and the complete `npm run quality:static` gate passed, including 633 manifest rows, 885 explicit/0 inferred requirements, and 1,045 discovered Chromium tests. No Firefox tests were run.

## 2026-10-08 — Rendered pointer-target audit

- Extended the mounted all-workspace accessibility contract to measure 452 visible native/ARIA controls on Welcome and all eleven component pages. Checkbox/radio labels count as their pointer area; undersized controls are checked against the [W3C 24px-circle spacing exception](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum). Inert, visually hidden, clipped, and closed-disclosure descendants are excluded; dense SVG marks and drag surfaces remain under their dedicated chart/resize contracts.
- The complete Chrome contract passes (1/1, 1.4 minutes); focused Venn and PCA checks also pass. Eight focused Chrome keyboard cases pass after adding direct 24×24 checks for workspace/tab/DataViews menus, PCA/Scatter point menus, and Line/Scatter font-family and font-size listboxes; the Line axis number-format test also passes with target measurement. The six-test Chrome modal suite passes with measured targets in the example gallery, data-import flow, and open/replace/duplicate prompts; both Line axis-dialog checks also pass with target measurements. ESLint and the test-inventory check pass. Initial false positives from hidden/clipped content were corrected in the test helper; no product CSS was changed.

## 2026-10-08 — Medium spacing token and pointer-target verification

- Added `--ui-gap-medium: 10px`, routed the exact 20 medium-gap declarations through it, and reused it for the workspace-toolbar section gap. The five shared gap tokens now cover 217 `gap`/`row-gap`/`column-gap` declarations at their original 4/6/8/10/12px values.
- Verification caught malformed property names in the tokenized rules; restored 18 `gap`, one `row-gap`, and one `column-gap` property before accepting the CSS. CSS/HTML lint passes.
- The full Chrome accessibility contract passes 9/9 after repair. Its mounted scan reports 452 controls and reviews 234 text nodes (minimum contrast 9.51:1). The full static gate passes: 633 manifest rows, 885 explicit/0 inferred requirements, 1,045 Chromium tests, and 11 fresh thumbnails. Firefox discovery remains deferred.

## 2026-10-08 — Shared control-height token reuse

- Replaced ten remaining exact 26px control heights with `--ui-control-height` or `--ui-color-input-height`; the grouped-row remove button's square width now uses the control-height token too. Root values remain 26px, with the existing 24px workspace-toolbar override intact.
- CSS/HTML lint passes. The combined 19-case Chrome batch produced 16 passes and three timeouts under parallel load; the two affected color-picker cases pass when isolated, and the full component viewport matrix passes serially (1/1, 3.6 minutes).
- The final `npm run quality:static` gate passes with 633 manifest rows, 885 explicit/0 inferred requirements, 1,045 Chromium tests, and 11 fresh thumbnails. Firefox discovery remains deferred.

## 2026-10-08 — Color-scheme popup target measurement

- Added direct 24px option-target assertions to the Box color-scheme listbox's phone-viewport and keyboard tests. The existing scenario mapping already covers both capabilities, so no manifest change was needed.
- Both Chrome tests pass; focused ESLint and the test-inventory check pass (633 rows, 885 explicit/0 inferred requirements). Firefox was not run.

## 2026-10-08 — Formula-suggestion pointer target

- A rendered assertion found Box formula-suggestion options were 23px high: 12px text at 1.25 line height plus 4px vertical padding. Sibling font listboxes use a 26px minimum. The options now use `--ui-control-height` with border-box sizing, and the full formula-assist Chrome test passes with the 24px target assertion.
- Added an explicit `target-size` scenario to the test catalog and regenerated its inventory row. Focused ESLint, inventory generation/checks, CSS/HTML lint, and the Chrome test pass. The final static gate passes with 633 manifest rows, 888 explicit/0 inferred requirements, 1,045 Chromium tests, and 11 fresh thumbnails.

## 2026-10-08 — Shared graph-options target size

- A rendered Chrome assertion found the shared SVG graph-options trigger was 20×20px. Replaced both hard-coded dimensions with `--ui-control-height` (26×26px), preserving the compact icon while meeting the 24px target minimum.
- Added target measurements for the trigger and each available Lock ratio label across all eleven example workspaces. The Heatmap view-switch/resizer checks and the all-component title-visibility sweep pass (15/15).
- Extended the mounted scan to visible title, legend, and axis-length rows. The Box and Line examples pass the expanded menu-row checks (2/2), covering both common and axis-rich menu contents.
- `npm run quality:static` passes: CSS/HTML lint, ESLint, generated docs, bootstrap/vendor/runtime checks, 633 manifest rows, 888 explicit/0 inferred requirements, 1,045 Chromium tests, and 11 fresh thumbnails. Firefox was not run.

## 2026-10-08 — Graph-options popup short-screen bounds

- The new 320×400 Chrome check reproduced the shared graph-options menu overflowing 36px past the right edge. The root cause was fixed-position assumptions in the shared menu anchor, without changing workspace layout.
- The menu now respects viewport width and height, scrolls internally on short screens, and reclamps after viewport scrolling/resizing or menu content-size changes. Added a shared viewport-correction helper and explicit scenario coverage.
- Focused Jest menu/resizer checks pass 32/32; the complete Heatmap view-switch/resizer suite passes 4/4 in Chrome; the Box/Line expanded graph-options checks pass 2/2. All 11 thumbnails were regenerated from stable inputs. `npm run quality:static` passes, including 633 manifest files, 889 explicit/0 inferred requirements, 1,046 Chromium tests, generated docs, CSS/HTML lint, and runtime/vendor/bootstrap checks. Firefox was not run.

## 2026-10-08 — AG Grid selection and pointer-focus correction

- The shared stylesheet contained a late unconditional display:none !important rule for selection edges. It hid every selected-cell border and the pinned-row perimeter. Removing it and using the existing teal-green theme token restores a visible 2px border. A real Chrome cell click and the full three-test selection/scrollbar suite pass, including pinned rows and range-fill borders. The related pinned-row issue is removed from issues.txt.
- The 24px target-size attempt had coupled data rows to action targets. Body rows now retain 20px density while header actions stay 24px; the 20px-cell target-size exception remains open.
- A shared pointer-modality rule removes outlines and shadows after pointer focus across app controls; keyboard focus indicators remain visible. The Chrome dropdown/checkbox double-click contract passes and the scenario catalog records the behavior.
- At that checkpoint, counts were 2,559 HTML lines, 8,843 CSS lines, 268 literal `!important` declarations, and zero static inline styles.

## 2026-10-08 — Pointer focus on value fields

- Chrome's `:focus-visible` heuristic also marks pointer-focused text and number inputs, including inputs focused by a clicked toolbar action. A shared document-level modality helper now tracks pointer and keyboard navigation; pointer focus removes the ring without changing control behavior, while keyboard-opened fields retain the visible cue.
- Chrome checks cover a dropdown, checkbox, number field and arrow-key value edit, plus a custom text field opened by pointer and keyboard. Both focused accessibility cases pass; ESLint and CSS/HTML lint pass.
- The full Chrome accessibility and AG Grid selection suite passes 14/14. The mounted scan reviews 456 controls, reports 23 visible compact-row checkbox targets as documented debt, and passes axe, contrast, and all other target-size checks. The generated scenario inventory has 633 rows.
- The eleven-component Chrome resize matrix passes 11/11 with horizontal and vertical growth/shrink; published graphs retain visible marks throughout and after release. No Firefox tests were run.
- The pointer-focus audit also passes across all 11 workspaces after focusing each visible input, select, and textarea. The full static gate now passes with 633 manifest rows, 891 explicit/0 inferred requirements, 1,050 discovered Chromium tests, and 11 fresh thumbnails.
- The latest `npm audit` still reports five high and 20 moderate development-tool findings; `npm audit --omit=dev` reports zero production findings. GitHub lists no patched version for `braces` through 3.0.3, and npm still lists 3.0.3 as latest; this advisory remains open.
- Current source counts are 2,560 `index.html` lines and 8,879 `css/style.css` lines with 273 literal `!important` declarations; zero static inline styles remain.

## 2026-10-09 — Pointer focus and touch grid targets

- Expanded the pointer-focus contract across visible value controls and their styling wrappers in every toolbar section on all eleven workspaces. Actual Chrome checks confirm clicked selects, checkboxes, number fields, AG Grid row checkboxes, the custom formula field, and the body-ported color-picker hex field have no pointer ring; keyboard focus remains visible. The cause included wrapper focus styling, stats input accent borders, and a color-picker rule outside the main app shell.
- Chrome coverage verifies the single fixed 20px AG Grid row layout on all eleven component pages for coarse and fine pointers; graph resize corners remain 24px touch targets, while compact row-checkbox targets remain documented debt.
- Added an optional `PLAYWRIGHT_BROWSER_CHANNEL=chrome` setting for local runs without changing the bundled Chromium CI default. The three focused actual-Chrome tests pass; no Firefox tests were run.
- The full accessibility folder passes 32/32 in installed Chrome; the color-picker ownership and focus suite passes 7/7. `npm run quality:static` passes with 633 manifest rows, 892 explicit/0 inferred requirements, 1,052 discovered Chromium tests, and 11 fresh thumbnails. ESLint, CSS/HTML lint, architecture maps, asset provenance, and test inventory checks pass.
- Roadmap progress is estimated at 64%. Manual assistive-technology review, remaining overlays and component states, desktop target-size policy, contrast-overlap review, and the dependency advisory remain open.

## 2026-10-09 — Pointer focus across remaining value editors

- The expanded audit found three focus rules outside the first scan: the rich Notes editor changed its border on focus and suppressed its keyboard outline; graph zoom values changed border on pointer focus; and AG Grid filter fields are portaled to `body`, outside the app-shell pointer reset. Made these rules modality-aware and applied pointer-ring suppression to the AG Grid menu portal.
- The all-workspace Chrome scan now checks border width/style as well as outline and shadow. It also opens Notes and tests Notes, graph zoom, and AG Grid filter fields directly; keyboard Notes and filter focus cues remain visible. The focused Chrome test passes 1/1.
- Chrome passes the expanded all-workspace case (1/1, 1.5 minutes); focused ESLint, CSS/HTML lint, generated-thumbnail checks, architecture docs, and test inventory pass. The full static gate passes with 633 manifest rows, 892 explicit/0 inferred requirements, 1,052 Chromium tests, and 11 fresh thumbnails. No Firefox tests were run.
- The 39-case Chrome accessibility/picker batch passed 37 cases on its four-worker run; two unrelated keyboard-menu cases timed out under load and both passed in an isolated serial rerun. The target-size/contrast scan and pointer-focus case passed in the batch.
- The body-portal ring reset uses scoped selector specificity without new `!important` flags. Current counts are 2,560 HTML lines and 8,884 CSS lines with 272 literal `!important` declarations. Roadmap progress remains about 64%; manual assistive-technology review, remaining overlays and component states, desktop target-size policy, contrast-overlap review, and the dependency advisory remain open.

## 2026-10-09 — Focus appearance after repeated clicks

- A Chrome double-click regression now checks complete computed appearance, not only `:focus-visible`: Chrome can keep that pseudo-class true on a number field after repeated mouse clicks while the rendered ring stays removed. It enters `-8` in the Scatter X max field and compares outline, shadow and border against the resting state; the Welcome search gets the same check.
- Pointer focus cleanup now covers document-level controls and portal content. The Welcome search's accent border and shadow are limited to keyboard modality. The targeted Chrome focus contract and all-workspace input audit pass; UI lint, focused ESLint, and `git diff --check` pass. No Firefox tests were run.
- Source counts are 2,560 HTML lines, 8,885 CSS lines and 272 `!important` declarations. Roadmap progress remains about 64%; the source-only focus slice does not close the broader accessibility, cascade or final evidence gates.

## 2026-10-09 — Semantic overlay layers

- Added eight root CSS tokens for the existing tooltip, dock, dialog, modal, context-menu and popup layers; every numeric stacking value remains unchanged. `Shared.toolbarOverflow` reads `--ui-layer-floating-overlay` for its default z-index and still honors explicit popup overrides.
- The token-consumer test and popup position/restore tests pass in Jest (9/9). Chrome modal and toolbar-overflow contracts pass 9/9. `npm run lint:ui`, focused ESLint, and `git diff --check` pass. No Firefox tests were run.
- The full static gate passed CSS/HTML lint, ESLint, generated documentation, bootstrap, vendor and runtime checks; it then stopped at stale thumbnail provenance. Chrome rendered all eleven assets, but Windows returned `EPERM` when the generator tried to swap the output directory while VS Code Live Server served the workspace. The publisher limitation was recorded in `issues.txt`; it was resolved on 2026-10-09: open-directory and rollback tests pass, and all eleven assets now pass freshness checks.
- CSS is 8,893 lines with 272 `!important` declarations. The rough roadmap estimate remains 64%; responsive tokens, owner-by-owner cascade review, manual accessibility evidence and final matrix gates remain open.

## 2026-10-09 — Body-ported AG Grid value fields

- Chrome exposed the cascade failure in numeric filter fields: AG Grid’s deferred input[class^=ag-]:focus rule overrode the custom body-portal styles after eight important flags were removed. Portal-specific selectors now win by specificity, so pointer focus retains the normal border while keyboard focus keeps its teal cue. The visible-state rule also drops eight duplicate base declarations without changing the rendered field. Shared axis-value focus styling is limited to keyboard modality.
- Installed Chrome passes 4/4 focused checks, including the 11-workspace value-field and wrapper scan, the shared axis numeric control, repeated-click settings controls, and numeric filter modes with one, two, and hidden inputs. npm run lint:ui, focused ESLint, and npm run quality:static pass. The regenerated inventory reports 633 manifest rows, 893 explicit/0 inferred requirements, 1,054 Chromium tests, and 11 fresh thumbnails.
- Counts are 2,560 HTML lines, 8,885 CSS lines, and 264 literal important declarations. Roadmap progress remains about 65%; manual assistive-technology review, the desktop compact-grid target-size exception, remaining overlay/component states, contrast-overlap review, and the unpatched dependency advisory remain open.

## 2026-10-09 — Data-panel width token and focus recheck

- Replaced ten repeated 150px data-panel minimums with `--workspace-data-panel-min-width`; no measured layout value changed. The 99-case Chrome viewport/activation matrix passes, including the graph-controls-right-of-graph invariant. Its CSS check reads the base rule beneath the shared resizer's inline owner value, then restores the live style.
- Fresh installed Chrome on the reported `127.0.0.1:5500` route confirms pointer-clicked View, Show grid, X max and Custom formula have the same outline, shadow and border as at rest. The all-eleven-workspace value-field/wrapper scan also passes; no focus CSS change was warranted.
- `npm run quality:static` passes: 633 manifest rows, 894 explicit/0 inferred requirements, 1,055 Chromium tests discovered, and 11 fresh thumbnails. `git diff --check` passes. Current source is 2,560 HTML lines, 8,886 CSS lines and 264 literal `!important` declarations. Progress remains about 65%; manual accessibility review and remaining cascade/component-state gates remain open. No Firefox tests were run.
## 2026-10-09 — Micro spacing token

- Replaced eight repeated compact `gap: 2px` declarations with `--ui-gap-micro: 2px`. Chrome confirms the computed value on Welcome panel copy, workspace/section tabs, and the DataViews export menu; remaining consumers are state-specific selectors. No geometry values changed.
- Regenerated and verified all eleven source-fingerprinted welcome thumbnails. `npm run quality:static` passes with 633 manifest rows, 894 explicit/0 inferred requirements, and 1,055 Chromium tests discovered. CSS is 8,887 lines with 264 literal `!important` declarations; the roadmap estimate remains about 65%. No Firefox tests were run.

## 2026-10-09 — Compact control width and value-field focus recheck

- Replaced repeated 64px widths in shared numeric/color control families with `--ui-control-width-compact`; rendered widths are unchanged. The unrelated import-preview table floor remains separate.
- Rechecked the reported focus ring in installed Chrome. The X max field on `127.0.0.1:5500` has no outline or shadow after a real click and keeps its normal 1px border. The pointer-click, custom formula, and all-eleven-workspace value-control checks pass 3/3; no CSS change was needed.
- `npm run lint:ui`, thumbnail regeneration, and `npm run quality:static` pass. The static report finds 633 test-manifest rows, 894 explicit/0 inferred requirements, 1,055 Chromium tests, and 11 fresh thumbnails. `git diff --check` passes. Current source is 2,560 HTML lines, 8,888 CSS lines and 264 literal `!important` declarations. Roadmap progress remains about 65%; manual accessibility review, remaining overlay/component states, the compact desktop grid target-size exception, contrast-overlap review, and dependency advisory remain open. No Firefox tests were run.

## 2026-10-09 — Relaxed spacing token

- Replaced six repeated 14px UI gaps with `--ui-gap-relaxed`; the significance-toolbar section-gap override now aliases the same token. This preserves the original 14px rendered spacing.
- Installed Chrome confirms 14px computed gaps on the Welcome gallery, Venn overlay header, and Line/Scatter regression controls. CSS/HTML lint passes. All eleven source-fingerprinted thumbnails regenerated; `npm run quality:static` passes with 633 manifest rows, 894 explicit/0 inferred requirements, and 1,055 Chromium tests discovered.
- Current source is 2,560 HTML lines, 8,889 CSS lines and 264 literal `!important` declarations. Roadmap progress remains about 65%; broader cascade review and the recorded accessibility/evidence gates remain open. No Firefox tests were run.

## 2026-10-09 — Chart mark interaction audit

- Completed the remaining owner-by-owner chart-selection audit. UpSet region changes use the labeled native `#regionSelect`; Scatter and PCA use the shared keyboard-point controller. In Box, Line, Heatmap, ROC, Survival, Histogram, Pie and other Venn chart paths, SVG mark clicks open formatting controls without keyboard entry. Those toolbar controls are keyboard operable, but the mark-specific entry path is not.
- Updated Phase 2 and the existing P2 interaction issue with the finding. A durable fix belongs in a shared owner-scoped chart-item focus/activation contract and the existing shared geometry interaction work; a markup-only tab stop would not preserve redraw, ownership or state.
- This was a source audit only; no runtime behavior changed and no tests were run. The chart interaction issue remains open. Overall roadmap progress remains about 65%.
- The full serial Chrome accessibility folder passes 35/35 (12.9 minutes). It includes all-workspace pointer focus, 456-control target/contrast review, forced colors, 200% browser zoom and enlarged text. The compact 20px desktop grid still has 23 documented checkbox-target exceptions; manual assistive-technology review and other non-default states remain.

## 2026-10-09 — Ownership and reopen regression pass

- The standard Chromium ownership contracts pass 22/22 serially: all eleven component declared-mutation archive-reopen cases and all eleven same-type tab-switch isolation cases.
- This supports the session-isolation and reopen-fidelity gates for the current worktree. Broader source review of the 108-file diff and the graph-resize release matrix remain in progress; roadmap completion stays about 65%. No Firefox tests were run.

## 2026-10-09 — Pointer focus recheck and live-resize matrix

- Rechecked the reported value-field rings on the exact `127.0.0.1:5500` route in installed Chrome. X max, View, Custom formula and a grid checkbox remain at their resting border/outline/shadow after repeated pointer clicks. The stylesheet and focus helper served on both local ports match the workspace source. The later report covering all value fields led to the shared-token correction below.
- The rendered pointer-focus test and the eleven-workspace value-field/wrapper sweep pass 2/2. Strengthened the checkbox case to double-click and confirm its checked state returns; that focused Chrome check passes 1/1.
- The live-resize regression batch passes 15/15 in Chromium, including all eleven workspaces, reduced-motion growth/shrink, and dense Scatter visibility. Roadmap completion remains about 65%; manual accessibility review, remaining overlays/component states, target-size and contrast exceptions, source review, and dependency advisory remain open. No Firefox tests were run.

## 2026-10-09 — Shared control padding tokens

- Added distinct standard `4px 8px` and compact `2px 8px` control-padding tokens. Ten exact declarations and four shared-checkbox fallbacks use the standard token, while their shared default aliases it. Live Chrome confirmed the custom-transform field’s local padding declaration lost to the later text-input rule; removing that dead declaration leaves its computed 4px padding unchanged. The three compact Axis/Font consumers use the named compact token.
- CSS/HTML lint and `git diff --check` pass. Regenerated all eleven CSS-fingerprinted welcome thumbnails; `npm run quality:static` passes with 633 manifest rows, 894 explicit/0 inferred requirements, 1,055 Chromium tests and 11 fresh assets. The focused Axis-dialog Chrome suite passes 3/3. Phase 5 now records the source-backed cascade finding; roadmap completion remains about 65% while broader review and manual evidence gates stay open.


## 2026-10-09 — Developer-tool advisory refresh

- `npm audit` reports 25 findings (5 high, 20 moderate) through two unpatched development-tool roots: `braces@3.0.3` and `sprintf-js@1.0.3`. The advisories list no patched versions ([braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [sprintf-js](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)); `npm audit --omit=dev` reports zero production findings.
- npm proposes a breaking Stylelint downgrade and a breaking `js-yaml` major upgrade. No forced dependency change was made; both findings are recorded in `issues.txt` for upstream recheck.

## 2026-10-09 — Pointer focus token precedence

- Pointer mode now sets the shared `--ui-focus-outline` token to `none` at the root. This closes the remaining cascade gap for value fields whose local focus selectors are more specific than the generic pointer reset; keyboard modality restores the visible token.
- Installed Chrome focus checks pass 2/2, including the formula editor and repeated-click/value-entry paths. The real-pointer value-field and wrapper sweep passes across all eleven workspaces (1/1); no Firefox tests were run.
- A fresh installed-Chrome visit to exactly `127.0.0.1:5500` confirms View, Show grid, X max and Custom formula remain ring-free after pointer clicks, even though Chrome marks the text fields `:focus-visible`.
- Regenerated all eleven CSS-fingerprinted thumbnails. The final static gate passes: 633 manifest rows, 894 explicit/0 inferred requirements, 1,055 Chromium tests, and 11 fresh thumbnails.
## 2026-10-09 — Value-entry focus and dormant toolbar cleanup

- Expanded the Chrome focus contracts to type `-8` into Scatter X max and enter text in the custom formula field after pointer focus. Both retain their resting outline, shadow and border; keyboard-open formula focus remains visible. The full eleven-workspace pointer value-field sweep passes 1/1.
- Source tracing found the Box manual scope form was built into a detached wrapper that was never appended; the live control already comes from `Shared.symbolToolbar`. Removed the detached builder and its unproduced compact/color wrapper CSS, retaining the shared base input/label/select rules emitted by `Shared.workspaceToolbar`. The CSS slice removes 64 lines and 12 `!important` declarations.
- Installed Chrome passes the focused Box point-style and point-size contracts (2/2), the shared picker ownership checks (7/7), and the direct pointer/typed-focus checks after cleanup (2/2). `npm run lint:ui` passes. Firefox was not run.
- Current source is 2,560 HTML lines, 8,832 CSS lines and 252 literal `!important` declarations. Roadmap estimate remains about 65%; manual accessibility evidence and broader cascade/state gates remain open.
## 2026-10-09 — Windows open-file thumbnail promotion

- Regeneration with Live Server open exposed `EPERM` when replacing a served SVG file. The publisher now copies a staged file when rename is denied; the manifest remains last, and rollback also restores through the copy path when necessary.
- A focused Jest test reproduced the rename denial before the fix. All 12 welcome-asset unit tests now pass, including open-directory, open-file fallback, and rollback cases. All eleven thumbnails regenerated successfully while the local server remained running.
- `npm run quality:static` passes: CSS/HTML lint, ESLint, generated documentation, bootstrap/vendor/runtime checks, 633 test-manifest rows, 894 explicit/0 inferred requirements, 1,055 Chromium tests, and 11 fresh thumbnails. Firefox was not run.
- The 65% estimate is unchanged; broader cascade/state work and manual accessibility evidence remain open.
## 2026-10-09 — Box significance visibility authority

- The audit found `#boxSignificanceControls` had both semantic `hidden` state and inline display writes. Its ID-scoped `display:flex` rule defeated the native hidden style, so visibility now follows `hidden` only, with an explicit CSS hidden-state override and a shared Box state projection.
- Expanded Chrome tests verify visible/hidden state and empty inline `display` across single/grouped changes and archive reopen. The Box conditional-control suite passes 2/2; Box ESLint and CSS/HTML lint pass. Firefox was not run.
- The broader cascade audit remains open; manual accessibility evidence and remaining overlays/component states remain outstanding.
- Current source is 2,560 HTML lines, 8,834 CSS lines, and 252 literal `!important` declarations. `npm run quality:static` passes with 633 manifest rows, 894 explicit/0 inferred requirements, 1,055 Chromium tests discovered, and 11 fresh thumbnails; `git diff --check` passes.

## 2026-10-09 — Cross-component visibility writer review

- The broader writer inventory found conditional form/control `style.display` paths in Box, PCA, Scatter, Line, ROC, Survival, and Venn alongside native `hidden` paths. Renderer SVG/canvas visibility and transient overlays are separate cases.
- Box significance is now on `hidden` only. Chrome component state coverage passes 18/18 for Heatmap, Scatter, Venn, and all-workspace title visibility, and 18/18 for Line, Histogram, Pie, PCA, and Venn async/reopen behavior. These tests validate sampled transitions and persistence; they do not prove every remaining visibility writer has migrated.
- Recorded the owner-scoped migration as an open P3 architecture item in `issues.txt`. Overall roadmap progress remains about 65%; manual assistive-technology evidence, remaining overlays/states, and the broader visibility migration remain open. Firefox was not run.

## 2026-10-09 — Grouped-table control visibility

- Normalized the grouped input panels in Box, PCA, Line, and Scatter: static markup now starts with `hidden`, component state updates `hidden` plus `aria-hidden`, and shared CSS explicitly honors the attribute. Removed the stale `u-hidden` classes and inline `display` toggles, including Scatter's extra replicate controls.
- A new cross-component Chrome contract first reproduced the mixed state, then passed standard/grouped transitions for all four. Box conditional-control tests pass 2/2; Box/PCA table-format tab isolation and archive-reopen pass 2/2. Firefox was not run.
- The cross-component visibility issue remains open for other control families. Roadmap progress remains about 65%; manual accessibility evidence, remaining overlays/component states, and cascade review stay open.
- Current source is 2,560 HTML lines, 8,834 CSS lines, and 252 literal `!important` declarations. `npm run quality:static` passes with 634 manifest rows, 895 explicit/0 inferred requirements, 1,056 Chromium tests discovered, and 11 fresh thumbnails; `git diff --check` passes.

## 2026-10-09 — All editable value fields checked for pointer focus

- Fresh installed Chrome on the exact `127.0.0.1:5500` route confirms its served stylesheet matches the workspace. Scatter zoom and X/Y min/max keep the same 1px gray border, no outline and no shadow after actual pointer clicks, even while Chrome reports `:focus-visible`.
- Expanded the all-workspace focus contract from representative controls to every visible, enabled, editable text/number field in each toolbar section. Assertions compare outline style, width, color and offset, shadow, border, and ancestor wrapper styling. The Chrome contract passes 1/1 (4.8 minutes); ESLint and `git diff --check` pass.
- The source already suppresses pointer focus styling through the shared modality token and CSS rule, so the reproduced current build required no production CSS change. Keyboard focus visibility remains covered. Firefox was not run.
- Source remains 2,560 HTML lines, 8,786 CSS lines, and 236 literal `!important` declarations. Roadmap progress stays about 65%; manual assistive-technology evidence, remaining conditional-control migrations, overlay states and cascade review remain open.

## 2026-10-09 — Conditional visibility inventory closed

- Rechecked every component `style.display` writer. Remaining uses are graph/SVG/canvas rendering, per-mark visibility, tooltips, and temporary formatting hosts; conditional form/control families in Box, PCA, Line, ROC, Scatter, Survival, and Venn now use semantic `hidden` state.
- Chrome transition/restore/ownership checks pass 18/18 across those migrated components. The all-workspace editable-field pointer-focus sweep passes 1/1 (5.2 minutes); it checks each visible editable field and its ancestors after real double-clicks. No focus CSS change was needed, and keyboard focus remains visible.
- Moved Box grouped-stat form layout from inline styles to named stylesheet classes using existing 8px/12px tokens. Regenerated the test inventory: 636 manifest rows. ESLint passes for the changed component and visibility contracts.
- The conditional-visibility issue is resolved and removed from `issues.txt`. The roadmap remains about 65% complete because assistive-technology evidence, overlay/component states, target-size/contrast exceptions, and broad cascade/source review remain open. No Firefox tests were run.
- `npm run quality:static` passes with 636 test-manifest rows, 898 explicit/0 inferred requirements, 1,058 Chromium tests, and 11 fresh thumbnails. Current source is 2,558 HTML lines, 8,794 CSS lines, and 236 literal `!important` declarations; `git diff --check` passes.

## 2026-10-09 — PCA statistics wording contract

- Updated the PCA statistics and reopen assertions to match the visible American-English label, “Samples analyzed”; removed the resolved mismatch from `issues.txt`.
- The three focused Jest suites pass 27/27. Repository search finds no remaining “Samples analysed” spelling.
## 2026-10-09 — Box marks join keyboard navigation

- Added Box body shapes, summary lines/groups, point-connection lines and point marks to the shared owner-scoped chart navigator. Registration takes its owner from the staged SVG and is repeated during interaction rehydration, so inactive state cannot borrow the active tab's owner.
- The Box Chrome contract reaches body-shape formatting with arrows and Enter before and after archive reopen. The full six-case chart keyboard suite passes; Box same-type isolation and batched archive persistence pass 2/2. The shared helper Jest suite passes 5/5; ESLint passes for Box and the accessibility spec.
- Heatmap, ROC, Survival, Histogram and additional Venn marks remain; graph/panel handles and free label/legend movement need separate keyboard transactions. Roadmap estimate remains about 65%; manual assistive-technology and other acceptance gates stay open. Firefox was not run.
## 2026-10-09 — Direct chart marks across eight components

- Extended the shared keyboard route to Histogram bars/distribution overlays and ROC/Survival curves. Each component registers its interactive marks against the owner tab during rendering and cache rehydration; existing click-to-format actions remain the activation path.
- Chrome chart navigation and formatting pass 13/13, including Box/Histogram/ROC/Survival archive-reopen formatting. Same-type isolation and archive persistence pass 6/6 for Histogram, ROC, and Survival; the prior Box pair also passes 2/2. Shared keyboard helper Jest passes 5/5, and ESLint passes for the changed components/tests.
- Heatmap cell interaction and additional Venn marks remain. Resize handles and free label/legend movement still need separate keyboard transactions. The roadmap estimate remains about 65%; manual accessibility evidence and other gates remain open. Firefox was not run.

## 2026-10-09 — Venn, UpSet, and Heatmap keyboard access

- Venn circles and UpSet intersection/set bars plus active matrix marks now use the owner-scoped chart navigator and their existing formatting actions. Rehydration restores the keyboard route after archive reopen.
- Heatmap exposes one keyboard entry for the current matrix cell. Arrow/Home/End updates its accessible row, column, labels and value, and keyboard movement shows a visible focus outline; Enter/Space invokes the existing palette action. The route is attached for both vector and canvas rendering, and cache rehydration creates it for older vector caches that lack a hit layer.
- Chrome chart navigation/formatting passes 18/18, including archive reopen for Venn, UpSet and Heatmap. Six targeted Jest suites pass 34/34; Heatmap heavy rendering, Venn/Heatmap same-type isolation and archive persistence pass 7/7. ESLint passes for both components, the browser spec and scenario catalog. Firefox was not run.
- The chart-mark portion now covers Venn, UpSet, Heatmap, PCA, Scatter, Box, Line, Pie, Histogram, ROC and Survival. Shared graph/panel resizing, 3D rotation, and free SVG label/legend movement still need owner-scoped keyboard transactions. The estimate remains about 65% because Phase 2 and later phase acceptance gates remain open; manual assistive-technology evidence, target/contrast exceptions, overlay states, cascade review and final validation remain outstanding.
- `npm run quality:static` passes with 638 manifest rows, 901 explicit/0 inferred requirements, 1,076 discovered Chromium tests, and 11 fresh thumbnails. Current source has 2,558 HTML lines, 8,787 CSS lines, and 221 literal `!important` declarations; `git diff --check` passes.

## 2026-10-09 — Compact line-height token

- Added `--ui-line-height-compact: 1.35` and replaced ten exact repeated declarations across shared helpers, statistics controls, and component notices. The computed value is unchanged.
- Installed Chrome confirms all ten consumers still compute to 1.35. Stylelint passes; the 11 CSS-fingerprinted Welcome thumbnails were regenerated.
- `npm run quality:static` passes with 638 manifest rows, 901 explicit/0 inferred requirements, and 1,076 Chromium tests. Roadmap progress remains about 65%; broad cascade review, remaining accessible interactions, manual assistive-technology checks, and other acceptance gates remain open.

## 2026-10-09 — Keyboard graph resizing and Heatmap typography

- Added native labeled width/height spinbuttons to the shared graph-options menu. Both route through the same resize transaction as pointer handles, preserving the owner check, live preview, constraints, render notifications, undo, dirty marking, and layout capture.
- Installed Chrome passes all 11 workspaces with visible plot marks during field edits (11/11). The existing all-component pointer resize undo/redo contract passes (1/1); Scatter additionally verifies keyboard resize undo/redo and captured layout width. Targeted resizer Jest passes 2/2.
- A test-first Heatmap render check reproduced 16px labels against the 13px Adjust data standard (including Decimals and Clustering method): the global `label` rule bypassed the graph-control token. The shared `.config-panel label` rule now applies the token across graph panels; Heatmap lower controls use the same token. Installed Chrome checks every visible graph-panel label across all eleven workspaces plus lower Heatmap labels (11/11).
- ESLint and Stylelint pass. The 640-row test inventory and all 11 CSS-fingerprinted thumbnails are current. `npm run quality:static` passes; it discovers 1,098 Chromium tests and verifies 903 explicit, zero inferred scenario requirements. Panel-divider resize, free SVG label/legend movement, 3D rotation, manual screen-reader evidence, and later acceptance gates remain open. Firefox was not run.

## 2026-10-09 — Shared 8px spacing token

- Added `--ui-space-standard: 8px`, kept `--ui-gap-standard` as its alias, and routed 24 exact padding, margin, and column-gap values through the shared token without changing rendered geometry.
- Installed Chrome confirms the token and four mounted Heatmap/table spacing values compute to 8px. CSS/HTML lint and `npm run quality:static` pass with 640 manifest rows, 903 explicit/0 inferred requirements, 1,098 Chromium tests, and 11 fresh thumbnails.
- Current source is 2,558 HTML lines, 8,794 CSS lines, and 221 literal `!important` declarations. Roadmap completion remains about 66%; keyboard interaction gaps, manual assistive-technology review, target-size exceptions, broad cascade review, and final evidence remain open. Firefox was not run.

## 2026-10-09 — Owner-safe PCA and Scatter point menus

- Root cause: body-portaled point menus outlived their owning component tab. PCA and Scatter now close the menu during owner deactivation; stale action events are still rejected by the existing owner guard. The fix is attached to the shared component-deactivation lifecycle and applies in its fallback path too.
- Chrome same-type-tab checks confirm the menu closes, clears its owner/data, and cannot change the newly active tab. Point-menu keyboard and owner-switch tests pass 4/4; menu helper Jest passes 6/6. The chart-point assertion now checks the plot entry and point semantics without treating separately keyboardable graph-title labels as point tab stops.
- The Histogram divider case passes with a realistic multi-step pointer drag. `npm run quality:static` passes with 643 manifest rows, 911 explicit/0 inferred requirements, 1,138 Chromium tests, and 11 fresh thumbnails. Firefox remains deferred.
- Estimated roadmap completion is about 72%. Other menu/grid states, manual screen-reader evidence, target-size/contrast exceptions, broader cascade review, and final verification remain open.

## 2026-10-09 — Keyboard access for AG Grid context actions

- Root cause: the shared table builder rendered context actions as clickable `div` elements, so they had no menu roles, native keyboard activation, or roving navigation. It now builds named menu buttons, uses the existing shared keyboard-menu helper, returns focus on Escape/action, and clamps/scrolls the popup in short viewports.
- Jest verifies menu semantics, navigation, action compatibility, and Escape focus return. A Chrome contract covers keyboard opening, navigation, 24px targets, 320×400 bounds, and focus return. Firefox was not run. The final static gate passes with 643 manifest rows, 912 explicit/0 inferred requirements, 1,139 Chromium tests, and 11 fresh thumbnails.
- Estimated roadmap completion is about 73%. Other popup owner-change/archive cases, remaining grid states, manual screen-reader evidence, compact desktop target-size exception, cascade review, and final verification remain open.

## 2026-10-09 — Reading line-height token

- Added `--ui-line-height-reading: 1.5` and replaced six identical declarations across Welcome copy, workspace modal text, statistics summaries/reports, and PCA summaries. No rendered value changes.
- An installed-Chrome selector probe confirms all six rules compute to a 1.5 ratio; the enlarged-text reflow contract and static quality gate pass. Firefox was not run.
- Estimated roadmap completion is about 76%. Remaining gates include manual assistive-technology review, remaining popup/grid states, the documented target-size exception, broader cascade-owner review, and final evidence.

## 2026-10-09 — Unit line-height token

- Added `--ui-line-height-unit: 1` for 23 exact compact-control declarations. Together with the reading token, this centralizes repeated line-height values without changing them.
- Installed Chrome probes confirm both token values; the 200% enlarged-text layout contract and static quality gate pass with 643 manifest rows, 916 explicit/0 inferred requirements, 1,142 Chromium tests, and 11 fresh thumbnails. Firefox was not run.
- Estimated roadmap completion remains about 76%; manual assistive-technology review, remaining popup/grid states, the documented target-size exception, broader cascade-owner review, and final evidence remain open.

## 2026-10-09 — Formula suggestion combobox semantics

- Root cause: the shared formula editor rendered a labeled listbox and handled arrow keys, but did not expose a combobox relationship or announce the active option. Escape also bubbled to AG Grid, and the editor's keyup listener reopened the list after keydown had hidden it.
- The shared editor now has a unique input/listbox relationship, a cell-specific accessible name, synchronized expanded/active-descendant/selected states, and contained suggestion-key handling. Its Box Chrome contract covers arrow navigation, Escape while retaining the editor, and Enter selection; the same shared editor is assigned by `Shared.hot` to standard-table consumers.
- The roadmap estimate is about 77%. Other popup/grid state and archive coverage, manual assistive-technology review, the documented target-size exception, broad cascade-owner review, and final evidence remain open.

## 2026-10-10 — Shared font combobox keyboard model

- Root cause: the shared font-family and font-size pickers exposed listboxes but moved DOM focus into option buttons and did not identify the editable inputs as comboboxes. Their separate handlers lacked active-descendant state and consistent keyboard behavior.
- Both pickers now keep focus in the input and expose unique controlled listbox options through `aria-activedescendant`; ArrowUp/Down, Home/End, Enter, Escape, and Tab work consistently. The Line/Scatter Chrome contract covers both popups at 320×400 while preserving the active SVG text editor.
- The two Line/Scatter keyboard cases pass in installed Chrome; the font-size no-spin case also passes (1/1). `npm run quality:static` passes with 643 manifest rows, 918 explicit/0 inferred requirements, 1,142 Chromium tests, and 11 fresh thumbnails. The estimate is about 78%; other popup/grid owner and archive states, manual assistive-technology review, the documented target-size exception, broader cascade-owner review, and final evidence remain open. Firefox was not run.

## 2026-10-10 — Runtime reduced-motion preference

- The existing scroll checks only set reduced motion before page startup. A new Chrome contract changes the preference after startup and verifies the carousel and workspace-tab controls switch from smooth to automatic scrolling, while CSS scroll behavior changes live.
- The reduced-motion scroll suite passes 3/3 in installed Chrome. `npm run quality:static` passes with 643 manifest rows, 918 explicit/0 inferred requirements, 1,143 Chromium tests, and 11 fresh thumbnails. Native OS preference behavior remains a manual evidence item; the roadmap estimate is about 79%.

## 2026-10-10 — Font-popup same-type owner lifecycle

- A shared font-family listbox closes when its Line or Scatter owner deactivates and remains closed after returning to the original tab. Both same-type Chrome cases pass (2/2).
- This closes the font-popup owner-change slice; other menu/grid owner and archive states remain open. The final static gate passes with 643 manifest rows, 919 explicit/0 inferred requirements, 1,145 discovered Chromium tests, and 11 fresh thumbnails.

## 2026-10-10 — Shared editable-combobox state

- Cataloged Welcome graph search, formula suggestions, and the shared font-family/font-size pickers. A stateless shared helper now normalizes available-option filtering, active-option and ARIA projection, plus clamped/wrapping movement while leaving each owner's filtering, popup lifecycle, and commit behavior local.
- The shared DOM contract and font owner tests pass 14/14 in Jest. Installed Chrome passes eight focused tests across font keyboard/owner behavior, formula assistance, and Welcome search/viewport behavior. The final static gate passes with 644 manifest rows, 921 explicit/0 inferred requirements, 1,146 Chromium tests, and 11 fresh thumbnails.
- Estimated roadmap progress is about 80%. Manual screen-reader/native-control evidence, remaining menu/grid archive and activation states, cascade review, and final acceptance evidence remain open.

## 2026-10-10 — Color-scheme popup owner deactivation

- A test-first same-type Box tab switch reproduced an open palette listbox after returning to its original owner. The shared workspace-deactivation path now closes the palette menu and pending color-choice dialog for that tab before ownership changes.
- The new lifecycle case and existing color-scheme keyboard/viewport and Scatter grid-isolation checks pass 4/4 in installed Chrome. Related color-scheme Jest coverage passes 53/53. The final static gate passes with 644 manifest rows, 921 explicit/0 inferred requirements, 1,146 Chromium tests, 355 discovered Jest files, and 11 fresh thumbnails.
- Estimated roadmap progress is about 81%. Other menu/grid archive and activation states, manual assistive-technology evidence, the documented target-size exception, cascade review, and final acceptance checks remain open.

## 2026-10-10 — Axis popup owner deactivation

- A same-type Line tab return reproduced the number-format listbox reopening under its previous owner. The shared tab lifecycle now closes the notation listbox and the additional-ticks/broken-axis popovers for the deactivating tab, while preserving the axis panel's current configuration.
- The axis and configuration-dialog keyboard cases, palette-popup lifecycle cases, and same-type font-popup cases pass 10/10 in installed Chrome. Axis-control Jest coverage passes 21/21. Final static verification is pending.
- Estimated roadmap progress is about 82%. Other menu/grid archive and activation states, manual assistive-technology evidence, the documented target-size exception, cascade review, and final acceptance checks remain open.

## 2026-10-10 — DataViews export-menu owner lifecycle

- Same-type Box and Line tab returns reproduced the export menu reopening under its old owner. The shared workspace-deactivation path now closes transient DataViews menus through the explicitly resolved owner root before detaching it.
- Across the full 19-test related-popup run and two added sibling-specific cases, all 21 unique checks pass in installed Chrome. The DataViews export Jest suite passes 19/19.
- `npm run quality:static` passes with 644 manifest rows, 923 explicit/0 inferred requirements, 1,150 Chromium tests, 355 discovered Jest files, and 11 fresh thumbnails. Rechecked `npm audit`: zero production findings; the 5 high/20 moderate development-tool findings remain on unsafe major-upgrade paths.
- Estimated roadmap progress is about 83%. Other menu/grid archive and activation states, manual assistive-technology evidence, the documented target-size exception, cascade review, and final acceptance checks remain open.

## 2026-10-10 — Static chart naming and navigation guidance

- Chart-point navigation now exposes a concise plot name separately from its keyboard instructions. Static SVG export preserves the chart role/name, removes keyboard-only focus/help metadata, and strips interaction semantics from the transparent Heatmap cell layer; all eleven Welcome previews were regenerated.
- Exporter and chart-navigation Jest coverage passes 9/9. All 20 chart-keyboard Chrome cases pass; assertions now verify that instructions live in `aria-description` separately from the plot name. The all-workspace axe scan waits for each active owner to become idle before collecting contrast evidence; installed Chrome passes across Welcome and all eleven workspaces, reviewing 234 text nodes (minimum 9.51:1) and 456 pointer targets.
- The static quality gate passes with 645 manifest rows, 926 explicit/0 inferred requirements, 1,153 Chromium tests, 355 Jest files, and 11 fresh previews. Estimated roadmap progress remains about 83%; manual assistive-technology evidence, the compact desktop target-size exception, remaining archive/menu/grid cases, and broader cascade review remain open.

## 2026-10-10 — Shared select and paired-gap tokens

- Five exact custom-select padding declarations now use `--ui-select-padding`. Five two-axis gaps reuse `--ui-gap-standard` and `--ui-gap-wide`; existing rendered values remain 2px/24px/2px/8px and 8px/12px.
- Extended the shared Chrome token contract for native-select padding and both toolbar/statistics gap consumers. Chrome computed styles confirm the token and rendered values.
- The shared token Chrome check passes; CSS and targeted ESLint pass; inventory check verifies 645 rows; the manifest contract passes 16/16.
- Roadmap progress remains about 83%; this is a bounded token cleanup within the unfinished cascade phase.

## 2026-10-10 — Roomy content-padding token

- A selector-context audit found the same 12px/16px padding on the statistics advisor and four PCA card surfaces. Added `--ui-content-padding-roomy` and covered all five in the shared computed-style contract without changing spacing.
- The shared computed-style Chrome check passes for all five consumers; CSS and targeted ESLint pass; inventory check verifies 645 rows; the manifest contract passes 16/16.
- Roadmap progress remains about 83%; shared cascade ownership and final accessibility evidence remain open.

## 2026-10-10 — Component-owned corner radii

- Removed seven redundant `!important` corner-radius declarations. DataView tabs, shared control chips, Welcome controls, and workspace-toolbar elements now declare their intended radius in their owning rules; browser rendering should remain unchanged.
- The expanded computed-style check passes in installed Chrome, CSS lint and targeted ESLint pass, and the test inventory verifies all 645 rows; the manifest contract passes 16/16. Current CSS counts are 8,834 lines and 214 `!important` declarations.
- Roadmap progress remains about 83%; remaining unique cascade rules and final accessibility evidence are still open.

## 2026-10-10 — Shared transparency-control width

- The Additional Line and Grid transparency inputs duplicated the same fixed width on four declarations each. Consolidated them into one shared rule using `--ui-control-width-transparency: 96px`.
- The computed-style contract verifies width, min/max width, and flex basis for both controls. Installed Chrome passes; CSS lint and targeted ESLint pass; inventory check verifies all 645 rows; the manifest contract passes 16/16.
- Roadmap progress remains about 83%; the wider cascade review and final accessibility evidence remain open.

## 2026-10-10 — Axis disclosure-label cascade

- The Axis broken-axis label selector and length-preserve selector are more specific than the shared checkbox-label rule. Removed eight redundant `!important` declarations and the superseded declarations from the length-preserve base rule.
- The shared Chrome style probe checks computed padding, border, background, radius, and shadow for both labels. Installed Chrome style checks and the Axis dialog/pointer suite pass (4/4); CSS lint, ESLint, inventory validation, and the manifest contract (16/16) pass. `npm run quality:static` also passes with 645 manifest rows, 926 explicit requirements, 1,153 Chromium tests, 355 Jest files, and 11 refreshed previews.
- Roadmap progress remains about 83%; per-family winner review and manual accessibility evidence remain open.

## 2026-10-10 — Remaining priority-family map

- PostCSS classifies the 202 remaining priorities as 114 AG Grid/HOT, 48 shared, 25 workspace, and 15 conditional (8 forced-colors, 6 reduced-motion, 1 customizable-select). This prioritizes the next winner review; it is not per-rule proof. The open review is recorded in issues.txt.

## 2026-10-10 — Fixed figure defaults and uniform browser zoom integration

- Shared sizing now uses a fixed 360 × 360 new-frame default. Default fit zoom follows one browser-size rule across all eleven components; component panel widths and content envelopes do not influence it. Canonical graph geometry remains separate from display zoom.
- Controls now occupy the separate shared frame header and may wrap without setting a graph-width or zoom floor. Fit/100% buttons reuse UI tokens; graph-frame inset tokens keep canonical drawable dimensions stable under zoom. No new CSS priorities were introduced.
- Viewing intent belongs to each tab session and persists through `layout.graphView`; manual resizing ends automatic fit, and resize undo restores the prior intent. Export, owner-isolation, archive, live-resize, narrow-layout, and computed-token checks cover the integration. This is a bounded sizing change and does not advance the wider refactor completion estimate.

Validation outcome for this integration: default zoom matches across all eleven components at 1920, 1280, 1024, 640, and 320px browser widths. The 37 focused Jest checks, 24 archive/owner/export-format browser checks, all eleven live-resize checks, the responsive viewport matrix, export-control layout checks, computed UI tokens, and quality:static pass. The final 38-check browser sweep retains its initial four failures; one was a test-side pixel-rounding error and its separate diagnostic matrix now passes. Histogram and Survival still fail exact export-width preservation after zoom plus redraw; the initial sweep also exposed a Line assertion that compounded rounded screen pixels; cleanup now checks rounding of the unrounded published reserve. Shared rendered text bounds vary with zoom despite unchanged fonts and canonical frame geometry. The larger canonical-measurement refactor is recorded in issues.txt and was stopped under AGENTS.md rule 2; this integration is not fully signed off. Original reports were preserved.

Cleanup validation (2026-10-10): 42 focused Jest checks and quality:static pass; all eleven Welcome previews are fresh. Chromium passes 16 of 18 focused checks, including uniform zoom, controls containment, Scatter owner/archive/legacy restore, all five zoom/redraw checks, and exact export preservation in nine components. Histogram and Survival retain the documented text-measurement failures. Evidence: artifacts/session-cleanup-browser-report.json. The wider roadmap estimate is unchanged.

## 2026-10-10 — Font-control cascade and cross-component archive state

- Removed one redundant Font combo-row shadow priority after tracing its selector against the shared focus rules. Installed Chrome confirms pointer focus has no shadow, keyboard focus retains its visible outline, and list options have no shadow. Expanded the AG Grid context/filter popup archive-reopen contract across all eleven component owners; the archive matrix passes 11/11 in Chrome, and the focused font-control case passes.
- `npm run quality:static` passes: 646 manifest rows, 938 explicit/0 inferred requirements, 1,272 Chromium tests, 355 Jest files, and 11 fresh previews. The CSS priority count is 153/153: 106 AG Grid/HOT, 19 shared, 14 workspace, and 14 conditional (8 forced-colors, 6 reduced-motion). The full expanded accessibility matrix (227 cases) remains unrerun; no Firefox tests were run.
- Progress remains about 84%. Per-rule cascade winner evidence, remaining menu/grid states, manual screen-reader review, and the compact desktop AG Grid target-size exception remain open.
## 2026-10-10 — Shared 24px action-target token

- Reused `--ui-target-size-minimum` for DataViews close/save actions and graph-options summary controls. Computed Chrome styles confirm fixed 20px AG Grid rows across all workspaces; graph resize corners remain 24px targets.
- Refreshing the CSS fingerprint regenerated all eleven provenance-checked Welcome SVGs using installed Chrome. `npm run quality:static` passes with 646 manifest rows, 938 explicit/0 inferred requirements, 1,272 Chromium tests, 355 Jest files, and 11 fresh previews; the priority budget remains 153/153.
- Roadmap progress remains about 84%; the 229-case accessibility matrix, per-rule winner evidence, manual screen-reader review, and the documented desktop checkbox-size exception remain open.

## 2026-10-10 — PCA grouped-row cascade cleanup

- Removed the duplicate inline `cellStyle` background writer from PCA grouped metadata rows. Sibling grouped-header styling uses class rules, and the existing PCA metadata class now owns its muted surface in CSS. The Chrome contract compares the rendered cell color with `--gt-surface-muted`; current priority count and ceiling are 152.
- The full PCA sizing/grouped-row Chrome spec passes 3/3. `npm run quality:static` passes: 646 manifest rows, 939 explicit/0 inferred requirements, 1,272 Chromium tests, 355 Jest files, 11 fresh previews, and 152/152 priorities.
- The accessibility matrix discovers 229 cases. A four-worker run was stopped after 16 reported cases due to runtime; the two failures pass in the focused serial rerun (3/3 with the Scatter sibling). The complete matrix and manual screen-reader review remain open. No Firefox tests were run.


## 2026-10-10 — Retire unmatched WebKit pseudo rules

- Removed the calendar-picker and datalist list-button rules from the shared text-combobox class. Source tracing confirms every consumer is an `input type="text"` without a `list` attribute: the two Font editors and the Axis notation display. These browser pseudo-elements therefore had no matching controls. Tightened the CSS priority ceiling from 152 to 150; the remaining shared bucket is 17.
- Installed Chrome passes all eleven font-listbox viewport checks, keyboard focus, eight Axis number-format cases, and the font size no-spin-button check. A larger focused run was stopped after its first 21 cases passed, before the remaining owner-lifecycle cases. `npm run quality:static` passes with 646 manifest rows, 939 explicit/0 inferred requirements, 1,272 Chromium tests, 355 Jest files, 11 fresh previews, and 150/150 priorities. The 229-case matrix, manual screen-reader evidence, and compact desktop checkbox-size exception remain open.


## 2026-10-10 — Verify Welcome focus ownership

- Compared the Welcome focus override with the current shared focus cascade and preserved the existing 2px teal keyboard ring; it is an intentional uncommitted style change with higher priority and specificity. Pointer modality still suppresses it.
- Extended the focused installed-Chrome accessibility test to verify both states; it passes 1/1. No CSS change or priority-count change. Manual assistive-technology review remains open.


## 2026-10-10 — Retire source-unreferenced CSS hooks

- A PostCSS inventory checked 1,067 current CSS class names against 897 authored, runtime, test, script and asset files. It found 41 non-vendor hooks without exact references. Removed 15 hooks and dead branches from shared selectors after checking their producers; preserved all live selector branches and all unrelated dirty CSS changes. The current source scan has 26 candidates left for dynamic-construction and cache-boundary review.
- `npm run lint:ui` passes with 150/150 priorities. The focused installed-Chrome Welcome SVG contract passes 1/1. The broader 229-case accessibility matrix and manual assistive-technology checks remain open; roadmap progress remains about 84%.

## 2026-10-10 — Shared CSS priority and Chrome accessibility review

- Source-only review of remaining non-vendor priority rules found no safe removals: the rules protect hidden/focus semantics, reduced motion, forced-colors cues, visually hidden content, graph preview sizing/overflow, and inline-edit presentation. Remaining AG Grid/HOT priorities still require per-owner computed-winner evidence; the broad cascade audit remains open.
- Updated the keyboard graph-resize test to query the shared options trigger from the sibling graph-controls-header. Installed Chrome passes graph width/height keyboard adjustment for all eleven components and the previously timed-out Line owner-deactivation dialog: 12/12.
- The serial installed-Chrome accessibility run completed 226/229. Its three failures were Scatter archive-reopen checks comparing floating-point SVG x-coordinate strings that differed by about 3e-14 px. The test now compares numeric x/y within 1e-9 px and still requires exact transforms. The three affected cases pass 3/3 in a focused rerun; the full 229-case matrix has not been rerun after this test-only correction.
- Regenerated the 11 stale welcome previews with installed Chrome. npm run quality:static passes: 646 manifest rows, 939 explicit requirements, 1,272 Chromium tests discovered, 355 Jest files, 11 fresh previews, and 149/149 CSS priorities. The test-only corrections have targeted coverage, but the full matrix has not been rerun afterward.
- Removed one redundant priority from the app-owned AG Grid header-action border after tracing vendor selectors; Chrome confirms uniform rendered borders across all eleven workspaces. CSS/HTML lint passes at 149/149.
- Roadmap estimate remains about 85%; final manual keyboard/screen-reader review, compact desktop grid target exception, remaining per-rule vendor winners, and one post-correction full matrix remain open.
