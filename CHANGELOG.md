## 2026-10-24 - Correct audited statistical inference and guidance

- Preserve Box statistics reports and selected columns through archive hydration; keep all restored selection state in the owning session.
- Use shared tie-aware Spearman inference for Heatmap, add independent Heatmap numerical checks, and explain correlation calibration and multiplicity in the UI.
- Document the Cox LR/likelihood-stabilization contract, verify delayed-entry Cox output against statsmodels, and correct the 1,200-row test to invoke the optional fitter directly.
- Explain the eligible Venn background, clarify that advisors do not calculate power, and strengthen PCA parallel-analysis and advisor browser coverage.
- Validation: focused Box archive, Venn/Heatmap guidance, Scatter/Box advisor browser checks, Cox/Heatmap oracle, PCA, and advisor Jest checks passed. One Box tab-isolation suite timed out once in a flip-axis reuse test; the isolated rerun passed.

## 2026-10-24 - Tighten Cox identifiability and Survival result reuse

- Reject Cox designs whose scaled event-risk information matrix is rank deficient, and solve in scaled coordinates so covariate units do not distort the Newton steps or ridge.
- Preserve saved Survival log-rank results when only the pairwise multiplicity correction changes; redraw the active owner from raw saved p-values.
- Write explicit off defaults for Cox and hazard-ratio options in new Survival payloads while retaining historical legacy restore behavior.
- Show the Calculate statistics message in Survival's log-rank panel before optional inference runs; remove timer-only waits from its statistics integration tests.
- Validation: Cox oracle suites 10/10, Survival statistics integration 8/8, manifest contract tests 26/26, 707 inventory rows verified, and targeted ESLint pass. The full application release lanes remain unrun.

## 2026-10-24 - Keep legend reserve in sync with rendered text

- Measure the rendered legend group when publishing the outward right reserve, keeping font and label changes out of the canonical plot frame.
- Redraw the owning component after bulk font-style undo and redo so its reserve follows the restored text.
- Validation: focused Jest 139/139 across 11 suites; Chromium legend matrix 14/14 and PCA 3D drag 1/1; targeted ESLint and diff checks pass.

## 2026-10-24 - Retire component-level graph file handlers

- Route every component Save, Save As and Open API through the workspace session controller.
- Remove component-owned `.graph` file inputs, direct file readers and file handles; keep one workspace file input and workspace document target.
- Replace per-component file handler tests with ownership contracts for the workspace route.
- Validation: focused Jest 59/59, Chromium document/save flow 7/7, targeted ESLint, and component-contract generation pass.

## 2026-10-24 - Preserve existing `.graph` save targets

- Toolbar and desktop Save now retain the opened file's scope and owner. Existing files use their original handle; denied or unavailable write access reports an error without opening Save As.
- Save As remains explicit, while first Save uses a destination picker before archive preparation. Download-only copies stay untargeted so a later Save cannot overwrite the wrong file.
- Added save-routing, permission-denial, missing-handle, scope-mismatch, and download-fallback regressions.
- Validation: focused Jest 94/94 across eight suites, Chromium document/save flow 7/7, ESLint, and `git diff --check` pass.

## 2026-10-24 - Refine statistics result presentation

- Consolidate Line regression fit metrics in its summary and keep derived parameters accessible in a collapsed, component-owned disclosure.
- Remove duplicated Pie single-comparison results while retaining separate raw and adjusted p-values when correction applies.
- Give Heatmap's cell p-value format control a clear label and compact placement.
- Review 11 components in Chromium across 88 states and 196 screenshots; no page errors or missing captures.

## 2026-10-24 - Reject obsolete render caches and regenerate on redraw

- Bump the shared render-cache contract to version 3 because older Box graph titles lack required drag-position metadata for interaction rehydration.
- Reject old cache versions during archive hydration, checkpoint reuse, and archive serialization. Reopen them from canonical payload; the next save of an active redrawn tab writes a current cache.
- Add a legacy Box open, redraw, resave and reopen regression, strengthen the all-component cache matrix to reject interaction-binding failures, and preserve exact current-version cache reuse tests.
- Validation: focused Jest 72/72; legacy Box reopen/resave passed; current single-tab cache reopen passed for all 11 components; the mixed 22-tab archive passed. Actual `figures-data-stats.graph` replay rejected both old caches; resave regenerated active Box as version 3 and omitted inactive Scatter's stale cache. Same-type reopen passed for 10/11 components; Pie's separate statistics-model mismatch reproduces with schema version 2 and is tracked in `issues.txt`.

## 2026-10-24 - Balance Box analysis settings

- Arrange the six main settings in two columns of three, with labels above aligned, equal-width dropdowns. Keep conditional scope fields beside their scope setting.
- Move Advanced parameters below both columns and group its controls into Inference, Assumption checks, Resampling and Outliers; add interior padding and compact numeric fields.
- Remove the redundant condition dividers and the old Box column-routing branch. Retain Pie's existing layout and Box's statistical behavior.
- Review collapsed and expanded screenshots at normal and narrow panel widths. Extend the existing layout check instead of adding another test suite.

## 2026-10-24 - Retire the technical analysis record from statistics reports

- Remove the "Technical analysis record (advanced)" disclosure from every statistics report panel, including the box and scatter fallback renderers; the report now shows methods, results and the configuration summary.
- Keep the persisted analysis spec, which still drives methods text, the configuration summary and legacy report migration; drop the display-only spec label, disclosure state and their capture/restore plumbing.
- Ignore legacy `stats-report-panel__advanced` nodes when restoring saved panel models so reopening older files cannot re-mount the removed block.
- Update the reporting layout tests to assert the record is absent instead of restoring its disclosure state.
- Validation: reporting layout and reporting-text migration Jest suites pass (20 tests), ESLint/stylelint clean, and a live renderer check shows no advanced node.

## 2026-10-23 - Harmonize statistics analysis settings

- Extend the Histogram analysis-settings layout to Box, Scatter, Line, Pie, ROC and Survival, retaining each component's own controls, advisor behavior and results structure.
- Align Box and Pie dropdowns on a shared label track; keep inference inputs compact and prevent Scatter's fieldset sizing rule from turning its significance input into a square control.
- Give every existing Calculate statistics button the same Histogram styling, including Venn's existing disclosure without adding an Analysis settings section there.
- Add Chromium layout, calculation, advisor, responsive-width and screenshot checks across all seven settings panels, plus button-style parity for Venn.
- Validation: eight Chromium cases, 35 focused Jest tests, HTML/CSS/JavaScript lint and testing-inventory check pass.

## 2026-10-23 - Restore shared result-panel spacing and bottom corners

- Give descriptive results the same separation from preceding result sections, including when diagnostics are hidden. Let flex stacks own their card gaps to avoid doubled margins.
- Round each shared card's final painted surface to its inner border, covering both export footers and terminal footnotes while preserving visible overflow for menus. This applies to shared statistics cards across components; the Histogram-only settings prototype is unchanged.
- Add Chromium regressions for the real Histogram comparison/descriptive boundary, shared primary/diagnostic/descriptive stacks, restored models, absent export footers, and working CSV export. Preserve initial failures and before/after screenshots.
- Retire two obsolete partial-bootstrap exceptions: the Scatter selection/range tests now use the standard component bootstrap, so their former direct-load reviews no longer apply.
- Validation: both targeted Chromium regressions, JavaScript/CSS lint, inventory validation and diff checks pass.

## 2026-10-23 - Keep statistics results stable while analysis settings change

- Separate result invalidation from presentation teardown. Stale panels stay visible, while shared reporting and figure-summary state is invalidated and stale DOM is excluded from capture.
- Remove graph redraws for report-only settings across Box, Histogram, Line, Pie, ROC, Scatter and Survival. Preserve redraws when a control changes plotted data or graph content.
- Add a real-vendor Chromium regression across all seven components and a shared reporting test. No CSS or visual styling changed.
- Validation: cross-component Chromium regression, statistics-reporting Jest (15/15), and inventory checks pass. The broader UI-events suite has a separately logged Survival Cox large-fixture failure; a three-file Jest batch exceeded the practical run window and was stopped.

## 2026-10-23 - Histogram statistics layout prototype

- Limit the layout trial to Histogram: compact advisor row, aligned analysis settings with inline significance level, one calculation/status row, and p-value formatting alongside the Results heading.
- Refine the prototype: place Analysis settings above its box, align it with Results, reduce interior spacing, and size selectors to their options with stable widths when the significance field appears; wrap whole fields when space is tight. Retain the button colors.
- Attach a compact Help me choose disclosure beside Analysis settings, replacing the separate advisor title, full-width header and divider. Expand advice above the manual controls; keep explicit Apply, keyboard focus and tab-owned answers.
- Reuse existing owner-scoped inference controls and the shared results-control factory. Keep numerical analysis and persisted settings unchanged; other workspaces retain their existing layout.
- Validation: Chromium layout/calculation/format/reopen contract at wide and narrow widths; existing Histogram alpha-reclassification and advisor tab-isolation/archive cases; JavaScript, HTML and CSS lint, test inventory and diff checks. Before/after screenshots are retained in artifacts.

## 2026-10-23 - Correct Box legend outline regression

- Replace the stale requirement for a positive default legend outline: grouped bars intentionally default to zero-width borders, and their legend keys must match.
- Assert symbol/legend agreement for default zero, positive global width, distinct group overrides and explicit zero through payload restore. Exclude summary lines, which have their own widths.
- Keep production rendering unchanged. Chromium confirms matching symbol and legend widths at zero, two and zero again; remove the incorrectly classified code issue from issues.txt.

## 2026-10-23 - Preserve grouped headers and legacy statistics on reopen

- Restore Box and Line groups from saved headings and populated columns, independently of blank grid reserve columns. Keep the reserve without repeated Box shrink/grow cycles.
- Load saved Line matrices directly; reserve replicate conversion for user changes. Preserve original subject-bearing headings and named empty series.
- Reconstruct supported historical Box signatures from owning settings and traces, keeping delimiter-bearing names opaque and the saved signature format unchanged. Recover missing custom pairs during existing statistics priming, removing the redundant full-table scan and unreachable results fallback.
- Cover mixed single/grouped reopening in Box, Scatter, PCA and Line, grouped-only Box/Line archives, legacy Box label/pair text, and changed analysis inputs. Preserve the initial failing reports as diagnostic evidence.
- Validation: six Chromium cases and 19 distinct targeted Jest checks pass, including all-component legacy hydration and changed-data/pairing/confidence invalidation. Original-file replay across all nine tabs twice has no errors; lint and inventory checks pass. The initially failing Box legend assertion was subsequently confirmed stale and corrected (see above). The full suite was not run.

## 2026-10-23 - Preserve Box statistics when reopening older graphs

- Restore grouped metadata and custom comparison pairs from each Box tab's own saved state; legacy single-table signatures no longer inherit labels from the previously active grouped tab.
- Keep compatible paired historical results visible as stale after calculation-version or row-identity changes, while retaining normal invalidation for incompatible analysis inputs.
- Add a legacy reopen regression that activates every workspace type, plus a focused saved-result restoration case.
- Validation: all-component owner-isolation regression, paired Box persistence regressions, Chromium replay of all nine tabs in `figures-data-stats.graph`, targeted lint, and test-inventory checks pass. The full repository suite was not run.

## 2026-10-23 - Choose save destinations before graph preparation

- First Save, Save As and existing-file Save obtain their destination or write permission before preparing a canonical archive checkpoint. Canceling location selection performs no capture or serialization; preparation failure never writes or marks the file saved.
- Use the existing shared fileIO lazy-payload path and remove the temporary permission-result option and preflight workaround. Preserve owner checks across readiness, preview capture, serialization and completion, keep newer revisions dirty, and retain autosave readiness deferral.
- Re-request existing-file write permission at the start of the Save click, before awaiting a permission query that could outlast browser activation.
- Add picker-order, cancellation, preparation-failure and replacement regressions; extend the real-browser toolbar checks to all three save modes with slow preview preparation.
- Validation: 107 focused save/load/ownership checks, all three Chromium toolbar save scenarios and the three existing document-open browser checks pass. Lint, diff and test-inventory checks pass. The full suite was not run; an optional component-local integration run was stopped without a result.
- Reauthorization validation: the focused permission and save suites pass (37 tests), all six Chromium document-open/save checks pass, and ESLint/diff checks pass. The full suite was not run.

## 2026-10-23 - Consistent statistics actions and panels

- Follow-up review updates three stale ownership-test expectations for Histogram signature preservation and shared Box/Scatter scope cancellation; extends the existing close-tab runtime check to all three async scopes and verifies sibling work remains current. All six reviewed Jest suites pass (135 tests), with targeted component/test lint and the testing-inventory check also passing.
- Gate optional Histogram, ROC, and Survival analyses behind Calculate statistics; retain Heatmap Show inference as its direct opt-in. Keep Box annotation refresh separate from numerical calculation and derive annotation placement from the current graph.
- Use one Calculate statistics label and shared action/status presentation across manual-analysis panels. Preserve Surface's descriptive summary; leave PCA outside this change.
- Preserve calculated owner results through ROC redraw/payload hydration, Histogram alpha reclassification and plot annotation, and Heatmap correction-only reclassification. Enable supported one-cohort Survival Cox fits, restore legacy missing-field defaults, and keep Pie readiness text in one place. Repair the ROC archive/isolation fixture to use a real comparison and Calculate statistics.
- Targeted Jest and Chromium checks cover these paths, including same-component ROC restoration, Histogram panel/plot retention, Heatmap no-recalculation on correction change, Survival Cox/correction/legacy behavior, and Pie readiness. The combined Survival Jest run exceeded the available memory; focused Survival cases passed.
- Final audit fixes register Histogram analysis with owner jobs and snapshot readiness, cancel it on setting changes, same-type switches and close, preserve unavailable AICc through archive reopen, and clear stale analysis output. Removed unused Histogram and Box locals while preserving Box context initialization. The focused Jest batch passes 57/57, the complete Histogram advisor Chromium spec passes 12/12, and targeted lint, syntax, diff, and testing-inventory checks pass. PCA remains deferred; the full repository suite was not run.

## 2026-10-21 - Fading Alhambra welcome background

- Add a cropped Alhambra motif behind the Welcome header, fading toward the text and downward. Use the theme accent and a transparent SVG mask derived from the supplied artwork; preserve the original file and package the mask through the standard assets directory.
- Keep all layout positions and dimensions unchanged. Review desktop and mobile Chromium screenshots; automated suites remain deferred.
- Remove the file-open panel border and lighten the search and examples borders with the theme surface color.

## 2026-10-21 - Welcome action panels

- Keep the compact header, existing typography, and responsive layout; use theme accents for the file action, panel icons, and example-gallery link. Retain four desktop previews and all eleven examples. Fit compact SVGs to their complete source viewport, removing generated letterboxing; reduce carousel gaps and padding, and reserve caption space within the existing section height.
- Remove carousel card borders and the inset hover outline; use a soft theme surface on hover and compact arrow controls. Remove the negative carousel margin that let captions overlap the panel edge.
- Verify desktop and narrow-screen screenshots and caption containment in Chromium; the desktop section remains 170.375 px tall. Update the existing layout expectations; automated suites remain deferred.

## 2026-10-21 - Explicit graph export backgrounds

- Add a shared Transparent background checkbox below the formats in Copy and Download. The default includes the Light or Dark graph background. PNG, SVG and hybrid SVG honor the same setting without changing the live graph.
- Store the preference per workspace tab and preserve it in archives. Use shared menu keyboard navigation, viewport placement, and workspace dismissal; retain compact control sizes and Firefox SVG-copy restrictions.
- Validation: 35 focused Jest checks, image-background/copy/tab/archive Chromium checks, all-component footer mounting, and physical-projection export checks pass. Two unrelated stale resize-layout assertions remain recorded in issues.txt.

## 2026-10-21 - Keep Line and ROC palette identity on reopen

- Compare selected palette colors independently from dark appearance tokens. Resolve palette snapshots from the active owner and use its selected palette when Line or ROC creates missing series colors.
- Validation: 102 focused palette Jest checks, all 11 cross-component appearance/reopen cases, and four Line/ROC persistence/isolation contracts pass.

## 2026-10-21 - Predict restoration feedback and retain the complete workspace

- Replace the fixed 200 ms message timer with an immediate decision based on the restoration path, component loading, prepared cache size, visible grid workload and bounded successful timings. Predictions affect feedback only, never readiness or ownership.
- Move transient presentation into Main.workspacePresentation. Retain the previous grid, graph, control values, canvas pixels and scroll positions in an inert shadow tree outside component queries. Commit the destination content and active-tab underline together; rapid switches and same-owner restarts reject stale completions.
- Let predicted slow restorations paint their message before synchronous setup; fast paths remain direct. Cancel paint work on owner/document disposal and allow background restoration to proceed. Remove the superseded message timer and update production bootstrap, test manifests and architecture documentation.
- Validation: 56 focused Jest checks pass (six suites, with the final presentation/preparation changes rechecked separately); six Chromium restoration checks and five visual/focus checks pass. Retained grid/graph bounds and canvas pixels match the source. All eleven same-component isolation checks pass; nine of eleven persistence checks pass, retaining the independently documented Line/ROC palette-selector failures; CSS priority validation retains its existing clipboard animation budget failure.

## 2026-10-21 - Keep restored tab highlighting consistent

- Resolve the shared focus-rule conflict responsible for the stray teal edge after reopen or recovery. Active tabs retain only their normal highlight. Keyboard focus on inactive tabs stays visible inside the tab. Preserve the existing high-contrast selection marker.
- Validation: normal reopen and recovery browser checks pass, including pointer and high-contrast behavior; both drag and keyboard reorder checks pass. Stylelint and focused ESLint pass. The pre-existing clipboard CSS priority gate failure is recorded in issues.txt.

## 2026-10-21 — Restore grouped grid header boundaries

- Identify native column spans in the shared grid adapter and preserve their outer right border. Internal merged seams remain hidden. Covers Box, Scatter, Line grouped/3D, and PCA.
- Extend browser coverage to populated examples and hovered group headers; retain existing merge and resize checks.

## 2026-10-21 — Prepare reopened workspaces without activating inactive tabs

- Show the restoring-workspace message only when activation remains unfinished after 200 ms. Fast restores stay silent regardless of dataset size; slow restores receive feedback based on actual waiting time. Completion, owner switching, tab disposal and document replacement cancel the message timer; errors remain immediate. Preserve the independent readiness and interaction barrier. Validation: 39 focused DOM checks and both cached/uncached Chromium reopen checks pass.

- Start bounded background preparation after the selected restored tab is ready. Import component code, independently copy saved payloads in short slices and prepare detached graph caches; retain owner, document, signature and version checks throughout. Limit retained preparation to four tabs and an estimated 32 MiB.
- Consume prepared work once through normal activation. Keep grid creation and interaction binding on the active owner; cancel unfinished work on selection, close and document replacement. Preserve the existing archive, cache, session and dirty-state contracts.
- Publish cold restored workspaces behind a loading surface only after the graph is ready. Move loaded-state and activation-complete publication to that boundary, and reject stale lazy setup before it can bind controls, including rapid returns to the same owner.
- Add deterministic cancellation, invalidation, copy-isolation and capacity checks, plus real-browser cached/uncached normal-open and crash-recovery checks that sample visible frames and compare independent owners. Keep tests on the production script order and register explicit scenario evidence.
- Validation: 93 focused Jest checks and eight Chromium preparation/document-open checks pass. Background preparation covers one inactive owner of each of the eleven component types; cached/uncached normal reopen and crash recovery also cover rapid same-type switching and visible-frame publication. The standard eleven-component isolation/persistence run passed 20/22: every isolation case passed; Line and ROC palette-selector persistence mismatches also reproduce with the new preparation and readiness path disabled, and remain recorded in issues.txt. These focused checks do not establish full release certification.

## 2026-10-20 — Restore UpSet live resizing under display zoom

- Fix the uncommitted display-zoom resize regression: convert screen measurements to local CSS sizes before updating SVG dimensions inside the zoom wrapper, so repeated moves do not progressively rescale the graph.
- Normalize font-sizing calls that already receive unzoomed drawable-frame dimensions. Keep display-frame callers on the existing zoom conversion, preserve canonical saved geometry, and document the shared coordinate boundary.
- Add repeated expansion/contraction checks for both axes at 95%, 50%, and 100% zoom, sampling painted frames and comparing the live/release geometry. Update explicit scenario evidence and regenerate the testing inventory.
- Validation: all six UpSet Chromium checks and eleven sibling live-resize/zoom checks pass, along with 23 DOM unit checks and the focused UpSet dot-sizing integration case. Targeted lint and the 696-row testing-inventory check pass; the complete Venn integration run remains unverified after stalling.

## 2026-10-20 — Review session changes and preserve live state during publication styling

- Remove a duplicate pre-style undo capture, obsolete default-template capture/restoration and repeated default-restoration timers. Replace formula-mirroring stroke assertions with independent print-point expectations; retain the live-source capture and manual resize baselines.
- Apply publication presets through the shared style-only projection contract. Keep existing tables and materialized data views, and skip numerical-result hydration in style-only component paths. Extend Box's presentation projection to cover publication typography, grid/frame visibility and significance styling without resetting responsive geometry.
- Align Heatmap's font normalization and Surface's slider minimum with the 6 pt minimum used by Box/Scatter so 7 pt publication presets are honored. Remove the Line payload dump and update stale color-scheme undo/default-isolation expectations to the current live-source contract, including the genuinely empty-source fallback.
- Add browser checks for all eleven components, retaining calculated Box/Scatter results and checking raw data, views, notes and same-type tab return. Close the obsolete PCA reopen backlog entry after its current durable-layout implementation passed normal redraw and both cached/uncached reopen checks; preserve that implementation.
- Validation: 151 focused Jest checks and 13 Chromium contracts pass, including all eleven live style projections, original sibling defaults, all sixteen stroke presets and Box manual sizing/undo/reopen. Targeted cache/owner regressions and the earlier Box/PCA zoom/reopen checks passed; changed-file lint and the 696-row inventory validation pass.

## 2026-10-20 — Preserve explicit PCA axis geometry

- Replace the expiring one-draw axis transaction with a versioned, owner-scoped layout model in the PCA session and archive payload. Normal drawing and cache restoration share the saved numerical domains and plot rails; data, method, selected axes, manual tick intervals and equal-length changes invalidate them.
- Size against the canonical Cartesian frame and let the shared plot-ratio solver derive width from height, including MDS; remove the redundant outer-frame ratio solver. Preserve equal physical scale per coordinate unit and the shared frame/zoom ownership rules.
- Cover full redraw, direct cache restoration, stale-cache rejection, cached and uncached archive reopen, sibling-tab isolation and coordinate invalidation. Bring the PCA helper suite onto the standard component dependency bootstrap.
- Validation: 47 focused Jest checks and three targeted Chromium contracts pass, covering zoom/units/reopen, X/Y metric editing and owner-scoped invalidation. Changed-file lint and test-inventory checks pass.

## 2026-10-20 — Scale publication axis thickness by print width

- Choose preset axis strokes in print points, proportional to figure width and clamped to the publisher profile. Cap width-scaled axes at a restrained 1 SVG px (0.75 pt), within the verified Nature/JCB ranges; EMBO retains its 0.3 pt dark-line minimum. PLOS retains its fixed 0.2 mm SigmaPlot setting.
- Use a labelled Graphitix 0.5–0.75 pt range where no numerical publisher range was verified (Science, Cell Press, JCS, JCI); do not claim these application limits are publisher rules. Preserve exact stroke widths after preset application and convert points to SVG units once.
- Cover all sixteen presets and rendered Box axes; update the manual-sizing comparison to use the selected preset stroke. Remove the incorrect exporter-projection coverage claim from publication tests in favor of their direct publication scenario.
- Validation: 62 targeted Jest checks, both Chromium contracts (all 16 rendered presets plus manual sizing/undo/isolation/reopen), changed-file lint and the 695-row test inventory pass.

## 2026-10-20 — Match publication presets to manual resizing

- Preserve Box dataset spacing instead of silently compressing the visible axis to 60% of its frame; remove the unused preset spacing field.
- Patch the live owning component payload rather than a saved layout snapshot. Preserve graph resize defaults and automatic symbol-sizing baselines when applying publisher dimensions through the shared sizing service.
- Add focused stale-layout and spacing regressions plus a real Chromium comparison of preset/manual axes, symbols, undo/redo, same-type tab switching and archive reopen.
- Validation: 68 targeted Jest checks, the Chromium comparison, changed-file lint and test-inventory validation pass.

## 2026-10-19 — Keep axis lengths independent of display zoom

- Read shared axis toolbar lengths from canonical SVG geometry and use canonical frame dimensions for resize requests, bounds and undo; keep screen measurements for ratio locking and viewport enforcement.
- Keep zoom projection out of the shared resize constraint solver, preserving canonical locked frames. Normalize PCA's metric-based editor to the same units and exclude viewport/legend envelopes from its physical-size calculation. Remove the unused requested-length dataset cache and wait for owner-scoped drawing completion before refinement, rejecting superseded edits after the wait.
- Add browser coverage for editable-axis workspaces, zoom, physical units and Box/PCA archive reopen; extend the shared-control regression across zoom levels and deferred render completion. Update ratio-lock tests to resolve controls in the shared graph header. The previously blocked Survival toggle/resize/reopen contract now passes. PCA zoom and editing pass; its separate archive-reopen geometry regression remains open in issues.txt because the one-draw sizing transaction needs a durable layout model. Focused validation: 66 Jest checks pass; browser axis/unit checks cover all nine editable-axis workspaces, with the PCA archive assertion retained as failing. Box/PCA same-type isolation, Box/Survival ratio toggle/resize/reopen, forced 3D ratio geometry and existing PCA X/Y metric editing pass.

## 2026-10-19 — Make the theme catalog authoritative for scheme defaults

- Keep global and component-specific scheme defaults in the theme catalog; resolve component defaults through its existing public API and retain setter compatibility.
- Add direct coverage for catalog defaults and component resolution, then close the verified issue.

## 2026-10-19 — Keep small Survival graphs inside their frame

- Remove Survival's separate 200 px rendering floor; honor the shared drawable frame with the same dimension limits as ROC, Histogram, Line, Scatter, and PCA.
- Reproduce the original 33 px overflow below 200 px and add locked width, height, and corner-resize coverage for all six 2D Cartesian components, with direct scenario metadata.
- Validation: seven focused Chromium resize checks, two Survival reopen/isolation checks, the series-color browser check, two Jest cache/save checks, and targeted ESLint pass. Two existing browser failures also reproduce with the original renderer sizing and are recorded in `issues.txt`.

## 2026-10-19 — Keep Heatmap palette identity and application owner-current

- Resolve palette names and colors from the active Heatmap session, with an owner-checked lightweight snapshot.
- Capture the active tab before applying a palette so current data and styles survive the commit.
- Add stale-payload and same-type tab isolation regressions.

## 2026-10-19 — Consistent dropdown cursors

- Remove native selects and options from the shared text-selection rule. Give dropdown choices pointer cursors and disabled choices arrow cursors, preserving editable fields.
- Add browser coverage across all eleven components for option styling, popup hover, keyboard navigation, custom menu labels, editable fields, and shared toolbar/overlay menus.

## 2026-10-19 — Keep workspace tab dividers uniform when zoomed

- Replace painted divider rectangles with one native border per tab boundary so fractional zoom does not give adjacent separators different pixel widths. Fill the dock height, retain its top border, and avoid doubling the outer edge when tabs overflow.
- Remove the obsolete preceding-active marker and update active-selection and 33px dock checks.
- Validation: screenshot pixels and full-height geometry pass across 16 native display-scale/zoom combinations; four focused Jest tests and three Chromium overflow/reorder checks pass. ESLint, Stylelint and diff checks pass.

## 2026-10-19 — Anchor formula reference outlines to grid cells

- Render formula reference outlines inside the same native row panes as their cells. Remove the root overlay and scroll-driven remeasurement; virtualized row changes use the table-owned mutation observer.
- Keep square corners and a device-pixel-snapped stroke matching the green selection border.
- Add Box and Scatter Chromium coverage for native pane ownership, immediate two-axis scroll anchoring, corners and stroke width.
- Validation: targeted Box and Scatter formula browser specs, shared selection geometry Jest tests, JavaScript lint and syntax, and CSS lint.

## 2026-10-19 — Keep multiline Heatmap titles clear after resize

- Measure title-to-column-label clearance after the content viewport commits, then refine the owner-scoped Data values layout until redraw geometry settles.
- Add Chromium coverage for title edits, redraws, wider and narrower graphs, and vertical resizing; verify Heatmap undo and locked-ratio behavior.

## 2026-10-19 — Restore Heatmap height after title undo

- Publish the Heatmap title viewport on every redraw, including when the title returns to one line. Keep shared viewport metadata in sync when a renderer retains its own SVG viewBox.
- Add browser undo/redo coverage in correlation mode and a focused shared viewport test.

## 2026-10-18 — Dark appearance geometry, axes and tab-preview fidelity (follow-up)

- Added a reversible appearance-only SVG paint adapter for neutral dark vector marks and axis strokes, including marks inserted after a redraw. Source dataset colors are not mutated; quantitative Heatmap/Surface fills are explicitly exempt until a scalar-preserving solution exists.
- Made Box style-only payload projection update its owning axis settings instead of modifying the rendered axis alone.
- Made tab-preview SVG backgrounds, pending placeholders, PNG raster backgrounds, and tooltip frames follow the saved appearance of each tab, including `*-dark` palette variants; captured SVGs are normalized from the owner payload. A settled theme projection refreshes the owning preview.
- Added targeted DOM/browser contracts for SVG color reversibility and dark previews. Full component browser, archive-reopen, and canvas/3D parity still require validation (tracked in `issues.txt`).

## 2026-10-18 — Preserve Scatter automatic palette policy in its owner session

- Keep colorSchemeUserOverride in each Scatter tab session during hydration, table edits, runtime snapshots, and payload capture. Explicit palette choices remain user overrides; old files without the field retain the prior manual-override fallback.
- Add a regression asserting a blank tab stays automatic before paste. Verify repeated category labels still select Vivid and the unique-label format still selects Grayscale.
- Validation: four targeted Chromium checks pass, covering unique labels, repeated category labels, manual palette retention and Scatter appearance save/reopen; two Scatter runtime/isolation Jest suites pass 15 tests; selector layout checks pass across all eleven components and desktop/narrow Box widths. ESLint and Stylelint pass.

## 2026-10-18 — Separate color palettes from appearance

- Add independent Light/Dark appearance to the shared selector across all eleven components. Preserve category palette positions, custom colors, continuous value scales, owner isolation, undo and saved scheme identifiers; retain original palette colors and legacy Dark archives. Rename High contrast to Vivid and Dark Theme to Pastel to describe their actual roles.
- Align selector previews, selection marks and labels; remove black preview blocks and wrap compact palette guidance. Correct Box categorical column counting.
- Verify all eleven component appearance/tab-switch/archive scenarios across targeted Chromium runs, selector keyboard and narrow-layout checks, and targeted shared/PCA Jest coverage. These checks do not certify universal accessibility or the complete suite. Follow-up Chromium checks confirmed and fixed the Scatter automatic-palette hydration regression; its session-owned fix is recorded above.

## 2026-10-18 — Replace complete contextual toolbar panels

- Fix trace-to-reference toolbar clipping: the old transition removed a form but left its titled panel visible. Add shared complete-panel mounting and migrate Symbol, Additional Line, Grid, Axis, Font, Significance, Dendrogram, and Heatmap palette providers. Keep intentional combined toolbars explicit and remove their obsolete field-removal paths.
- Restore cached axis reference-line click controls in Box, Line, and Scatter from saved axis/index identity. Reject old caches without that identity so activation redraws from the owner's saved settings, and reuse serialized hit targets during rebinding.
- Keep grouped Box legend swatch outlines at 0px when their plotted shapes have no border; reserve the fallback outline for mixed or unavailable widths.
- Verify same-type Box tab isolation and archive reopen, Line/Scatter archive reopen, Box legend typography, and grouped legend styling in Chromium; all five browser cases and seven focused Jest checks pass. Keep the axis-wheel fixture correction and the all-workspace toolbar composition coverage.

## 2026-10-18 — Complete the four-item statistics-advisor plan

- Add owner-scoped disposal for Box, Scatter, PCA, Line, Surface, Pie, ROC and Survival. The workspace cancels that tab's pending jobs before component cleanup; each disposer releases its own session/runtime references without affecting same-type siblings.
- Add Box's separate `nestedRepeatedTwoWay` analysis for independent groups whose subjects repeat across exactly two conditions. It requires complete balanced numeric data and uses subjects-within-group error for the group effect and subjects-within-group-by-condition error for condition and interaction. Keep the crossed `rowRandomMixed` model unchanged; block unsupported designs and degenerate error terms. Validate against an independent numerical oracle.
- Reflow the shared document header below 720 CSS pixels so the title, Autosave control and status occupy non-overlapping rows while desktop placement remains centered.
- Verify close/reopen isolation, responsive header geometry, and the Box model with targeted browser and numerical checks. The final serial integration lane passes all 64 groups and 365/365 cases with no skips or failures (`artifacts/test-reports/advisor-followup-integration-final-20261018.json`).

## 2026-10-18 — Match Scatter point toolbar colors to the plot

- Display the current scoped point fill instead of an unused categorical palette assignment. Resolve another scope from its own current mark after redraws.
- Emit density colors in the hex format required by the color picker. Register delegated interactions once on the owning plot when points are registered, including rebuilt 3D points; remove redundant 2D layer bindings.
- Add Chromium regressions for example palette changes, 2D/3D/density colors, scope switching and individual edits. Restore the required lifecycle dependency in the point-style unit fixture.
- Validation: four color regressions, two owner-lifecycle browser checks and 11 targeted Jest checks pass; lint and inventory checks pass. Two additional accessibility checks fail on menu spacing and grid focus styling, recorded in `issues.txt`.

## 2026-10-18 — Anchor table selection decorations to native scrolling content

- Move the shared selection border, clipboard outline and fill handle into clipped native content layers for body and pinned panes. Preserve the thin outline and corner handle, suppress internal pane-seam borders, and retain grouped-header column widths and editing behavior.
- Replace scroll-driven border repositioning with table-owned, before-paint projection of newly virtualized or recycled cells. Remove the retired outer-host clipping machinery and dispose observers and pending layout frames with their table.
- Update native-pane unit fixtures, owner/disposal and virtualization regressions, immediate Chromium scroll geometry contracts for Box/PCA, and scenario evidence. The user confirmed scrolling now works.
- Keep pinned selection borders and complete corner handles above the pinned/body seam using a transparent clipping overhang with no added row spacing. Preserve the native scrollbar gutter, paint the divider at the actual row boundary, and pass input through the overhang to the first body row. Inspect Box/PCA screenshots at normal size and populated Box screenshots at actual 300% browser zoom.
- Correct regression sampling to use the column count when copying, the current row-selection width after column growth, and selected cells while still rendered. Verify native clipping together with the opaque scrollbar corner instead of treating unclipped DOM bounds as painted bounds. Initial failures and subsequent runs retain separate reports under test-results.
- Validation: all 80 tests in the four focused clipboard/selection Jest suites and all eight Chromium checks in the two selection browser specs pass. JavaScript/CSS lint and test-inventory generation pass. Screenshot inspection confirms the seam and full handle at normal size and actual 300% browser zoom; this is focused coverage, not a full-suite certification.

## 2026-10-17 — Improve Nature/NPG axis visibility

- Set Nature/NPG preset axes to 0.5 SVG px (0.375 pt at the app's 96 CSS px/in scale), above the publisher's 0.25 pt minimum while remaining within its 0.25–1 pt range. Cover all four width variants.
- Validation: `npx jest --runInBand __tests__/dom/publicationStyles.core.test.js`.

## 2026-10-17 — Correct PLOS preset stroke units

- Convert the PLOS 0.2 mm axis width to SVG user units at Graphitix's 96 CSS px/in scale. Cover both PLOS presets with regression tests.
- Validation: `npx jest --runInBand __tests__/dom/publicationStyles.core.test.js` (42 passed).

## 2026-10-17 — Show selected publisher in publication style control

- Include the selected preset's publisher in its visible details and refresh it when the selection changes. Add regression coverage for Nature/NPG and Science/AAAS.
- Validation: `npx jest --runInBand __tests__/dom/publicationStyles.core.test.js` (41 passed).

## 2026-10-17 — Cross-component advisor verification

- Make Box apply the exact advised Welch or rank procedure instead of retaining a conflicting manual variant. Support available paired log-ratio contrasts; keep unsupported omnibus repeated log-normal analysis explicit. Validate grouped sample replication and distinguish crossed repeated subjects from subjects nested within independent groups. Block unsupported nested interactions rather than relabeling the available engine.
- Reuse shared assumption diagnostics for paired differences and log ratios. Key advisor diagnostic caches by selected values, subject rows, model answers and diagnostic settings. Remove the retired local normality implementation and unused advisor context copies in Line, Scatter, ROC and Survival.
- Give Histogram the shared owner-bound advisor projection and application contract. Reject retired same-owner controls. Require sufficient distinct X values for Line/Scatter polynomial or spline recommendations; preserve explicit through-origin constraints when X has measurement error. Require replication within both matched ROC outcome classes for bootstrap recommendations.
- Clarify rank-test interpretation, log transformations, grouped designs, regression weights, forecasting dependence, ROC sampling limits, Survival hazards/censoring and unadjusted pairwise HR tests, and independent categorical counts. Cross-check the advice against primary statistical documentation.
- Add method-to-engine browser regressions, paired diagnostic/cache checks, design eligibility controls and explicit scenario evidence. All 75 advisor Chromium scenarios pass, including same-component tab isolation and archive reopening; 24 affected browser checks and 168 distinct targeted Jest checks pass after cleanup. Update the outdated ROC ownership-test signature without weakening its owner checks. Retain initial failures and record details in artifacts/advisor-session-verification.md. The full repository integration lane remains uncertified in issues.txt.

## 2026-10-17 — Tie-aware Histogram distribution comparisons

- Reconcile the Histogram advisor with its default two-series comparison. Independent rounded numeric samples can use two-sample Kolmogorov–Smirnov inference, calibrated by exact or Monte Carlo label permutations that preserve ties. Require at least two finite observations per series in both the advisor and result path. Report calibration details and the independence, interpretation, and non-equivalence limits; use the same shared KS implementation in Histogram and the Box worker.
- Explain when ties are present and how the test treats rounded recorded values. Keep larger resampling off the main thread in a Histogram worker named for its owning tab; cache exact-sample pending and completed results per session, let replacement redraws reuse them, and keep stale draws from publishing. Explicit Stop and tab disposal cancel pending work; tab disposal also releases its session. Correct and test the shared one-sided KS directions.
- Validate against exhaustive small-sample permutations, the worker and Box consumer paths, Histogram ownership tests, the real Chromium worker/example path, manifest checks, ESLint, and generated architecture docs; review the biomedical example screenshots.

## 2026-10-17 — Advisor cleanup

- Remove unused Line/Scatter advisor extrema, missing-row/length calculations and obsolete warnings superseded by eligibility checks. Remove unreachable Survival covariate warnings; keep the actual blocking explanations.
- Remove both retired `pendingPoints` exceptions from cache/archive comparisons. Current advisor producers no longer emit that field, so archive checks now compare it without a special exclusion. Tidy advisor policy-test indentation.
- Validation: 77 focused Jest checks, ten advisor browser checks, the Scatter cache/archive reopen check, ESLint and generated component-contract checks pass. Regenerate the architecture map. Broader integration certification is still tracked in issues.txt.

## 2026-10-17 — Statistics advisor second review

- Reject constant-variable association/model promises and forecasting samples below the implemented minimum. Preserve valid association-only analyses when an unused power fit has an incompatible domain; honor the configured seasonal period instead of silently shortening it.
- Match Survival's group-only and baseline-only plans to enabled predictors. Unselected columns do not provide a Cox predictor; unsupported saved time-dependent answers remain explicit and blocked instead of becoming a different answer automatically.
- Check Pie's actual requested pair family as well as the overall contingency table. A dense overall table can contain sparse pairwise comparisons; invalid or sparse requested pairs block the one-click asymptotic recommendation without disabling suitable alternative families.
- Reuse the statistics engine's subject-row alignment for Box paired recommendations. Keep temporary advisor validation traces separate from control-rendering traces; opening/closing no longer adds blank condition checkboxes. Inline diagnostics also refresh owner data at the action boundary.
- Add ten browser edge scenarios and positive-control policy checks. All 64 distinct browser scenarios and 128 focused Jest checks pass; screenshots, lint and generated-documentation checks pass. Validation is recorded in artifacts/advisor-second-pass-verification.md. Preserve the original failing reproductions. The broader Jest integration lane remains unverified in issues.txt.

## 2026-10-17 — Statistics advisor ownership and validated Apply

- Normalize Box, Scatter, Line, Pie, ROC and Survival through a shared owner-bound projection/application contract. Preserve live advisor/answer identities on capture; reject retired controls, retain keyboard focus and hide all guidance when closed. Remove the unused activation flag and duplicate Scatter normalization path.
- Recompute every recommendation from current included data on Apply; patch owning settings before projecting controls. Separate Scatter analysis settings from results, preserve applied controls through archives, and rebuild Line advisor callbacks after explicit runtime hydration.
- Block mismatched Box group counts, empty/insufficient observations, unsupported ROC/PR methods or unmatched classes, missing Survival covariates, invalid Pie counts/expectations and sparse asymptotic recommendations. Pie retains the intended observed/expected columns and computes correction from the proposed comparison family.
- Replace Line's automatic normality guess with the requested association target, including binary-continuous Pearson. Match diagnostics/overlay promises to implemented controls; validate binary logistic responses, positive power/exponential domains and every forecasting time interval. No data are discarded or transformed to force eligibility.
- Validation: 124 focused Jest checks; 47 advisor Chromium scenarios (46 combined plus the corrected Survival fixed-schema source-edit case); 12 standard same-component isolation/archive cases. Inspect desktop and 640-pixel screenshots for all six advisors. ESLint, HTML validation, bootstrap, scenario inventory and generated docs checks pass. Retain initial failures and reruns. The additional three-file full-app integration run did not finish within approximately ten minutes; broader integration certification remains open in issues.txt.

## 2026-10-16 — Histogram statistics advisor

- Add an explicit, tab-owned advisor for descriptive summaries, normal/log-normal model checks and independent two-sample distribution comparisons. Preserve answers through snapshots and file reopen; opening and closing leaves no guidance behind.
- Clarify rounded measurements versus event counts and distinguish paired subjects from dependence within a series. Revalidate included raw observations on Apply, follow generated frequency views to their source, and explain unsupported designs, ties and sample-size limits without forcing validation.
- Keep narrow advisors within the statistics panel. Give shared statistics tables a keyboard-accessible horizontal scroll region while leaving export controls outside; upgrade older cached cards during normal export rehydration.
- Validation: 78 focused Jest checks, seven Histogram browser cases and eight existing advisor/ownership checks and three cross-component statistics reopen/export checks pass. Inspect desktop/narrow screenshots; verify the actual biomedical example, stale controls, exclusions, generated views, archive restore and CSV export. The full suite was not run. Record the unrelated narrow-header overlap in issues.txt.

## 2026-10-16 — Inactive runtime ownership

- Confirm and repair the shared internal-state bridge reading or overwriting another tab's live projection. Compatibility snapshots now remain in the owning lifecycle runtime record; mounted-owner checks control live capture and restore, including async settlement and rejected snapshots.
- Apply the same session-first boundary to Box, Scatter, PCA and Survival native restores. Survival reuses its canonical session projector instead of duplicating restoration and recapturing the projected DOM. Declare Histogram/Pie runtime methods before bridge installation so initialization cannot replace their wrappers.
- Validation: all 33 Chromium inactive-restore, same-component switching and archive-reopen cases pass across eleven components; 243 focused lifecycle/architecture and 26 manifest Jest checks pass. ESLint, scenario inventory and generated documentation checks pass. Remove the resolved P1 and missing-scenario backlog entries. The complete serial integration lane remains uncertified.

## 2026-10-16 — Summary statistic reporting

- Fix the shared summary formatter confusing Box's studentized-range q and Friedman Q statistics with adjusted probabilities. Preserve statistic values, including zero and values below one, and retain probability precision for actual adjusted q-values.
- Keep existing summary fields, row selection, and calculations unchanged. Test calculated Tukey, Games–Howell and Nemenyi results through the compact summary; check numeric report projection for all 11 components.
- Validation: 14 Chromium checks pass, including every selected report row, the Box example q = 15.81, SVG export, file reopen and tab isolation. Targeted summary, reporting-matrix, export, manifest and lint checks pass. The inventory check reports an unrelated newly added inactive-runtime isolation spec without a scenario mapping.

## 2026-10-16 — Summary table preserves graph size

- Fix shared summary sizing counting display zoom twice, which progressively shrank graphs when Summary table was toggled. Convert screen measurements back to the zoom wrapper's local dimensions before extending the viewport.
- Add repeated-toggle graph-scale checks for all 11 components and unit coverage below, at, and above 100% zoom.
- Refresh Venn summary-control expectations and make resize tests measure the graph SVG rather than the toolbar icon.
- Validation: all 12 summary-layout Chromium checks, six summary-resize checks, and three focused reopen/recovery/isolation checks pass. Targeted summary, export, legend, manifest, lint, and inventory checks pass.

## 2026-10-16 — Advisor disclosure presentation

- Use Show advisor / Hide advisor and expose the expanded state to assistive tools across Box, Scatter, Line, Pie, ROC, and Survival. Closed advisors hide the complete summary, rationale, and cautions.
- Scatter recommendation wording describes suggestions rather than claiming settings were applied. Remove unreachable Line/ROC/Survival branches for the nonexistent Shared.statsUi renderer.
- Confirmed and fixed Box answer loss and Pie opening failure. Advisor reads keep the owning live object; Box capture preserves it and Pie capture no longer hydrates its own exported snapshot. Exports remain detached copies, while payload/runtime restore still rebuilds controls.
- Validation: all 12 Chromium checks pass (eight advisor, two standard same-type isolation, two standard archive-persistence cases), including distinct sibling answers, snapshot identity and file reopen. Nine Box advisor unit tests, ESLint and test-inventory validation pass. The combined integration Jest run was interrupted after roughly ten minutes without suite results; separate Box/Pie integration runs also remained incomplete after several minutes. These are unverified, not passing; the existing integration-certification issue records the gap.

## 2026-10-16 — Stable Multiple checkbox position

- Reserve the Apply/Clear row height in every Data transformation toolbar, keeping Multiple at its lower position whether checked or unchecked. The code documents why this space is intentional.
- Replaced outdated decorative toolbar assertions with toggle-position and clearance checks across all seven consumers at wide and narrow widths. All seven Chromium tests pass; screenshots, CSS/JS lint, and the test inventory check pass.
- Reduced the gap below the main toolbar by 8 px, giving the AG Grid input table more height while keeping its top aligned with the graph controls.
- Compact DataView tabs now use the existing 24 px control height; AG Grid headers and filter actions retain the fixed 20 px row geometry.
- AG Grid filter actions are 22px wide with only a full-height left divider; the header retains a darker 1px bottom border.

## 2026-10-16 — Replicate controls in the Data toolbar

- Box, Scatter, Line, and PCA now share a Replicates group before Data transformation. Single/Grouped buttons use the theme selection colors and align with transformation actions; grouped counts and Scatter X replicates move with them. Line retains its 3D table mode.
- Session projection refreshes the selected button on activation and reopen. Removed obsolete grid-selector/list styles and the synthetic test fixture for the retired group-remove control; browser tests now use the visible toolbar buttons.
- Focused validation: seven shared-toolbar Jest tests and ten Chromium contracts pass, including aligned wide/narrow layouts, same-type tab switching, archive reopen, overflow, and Line 3D. Retired obsolete decorative toolbar probes and changed frozen border-color assertions to semantic-token comparisons. HTML/CSS validation and the test inventory check pass; unrelated Box/Line lint errors and the ledger-fixture test failure are recorded in issues.txt.

## 2026-10-16 — Speed up AG Grid pastes

- Existing-cell pastes now prepare only touched rows and refresh grid structure only when row or column counts grow. Paste selection, undo, clipboard formats, and tab ownership retain their existing behavior.
- Focused Jest passed 92/92 clipboard tests and 50/50 related tests; Chromium paste tests passed 5/5.

## 2026-10-16 — Keep component controls with their tabs

- Line display-mode/table-structure, Scatter table-structure, Line and Scatter example, ROC state-changing, and Scatter view-mode controls now use their owner-bound paths. Line, Scatter, and Pie also apply forced aspect locks through their active graph boxes.
- A/B regressions reproduced the control leaks before the fixes. Focused ownership tests pass; ROC scheduled-draw/reopen passes in Chromium, as does the 9/9 lock-ratio matrix.

## 2026-10-16 — Keep Line and Scatter axes controls with their tabs

- Bound all three axes-length settings to the event owner in Line and Scatter. Both components now find the moved controls through the shared resizer host; Scatter also restores them from its owner session on activation.
- Added A/B/A integration and Chromium regressions for stale controls and rendered state. Focused Jest passed 2 suites / 8 tests; Chromium passed 2/2.

## 2026-10-16 — Keep PCA control events with their tab

- Inactive PCA component-selection controls could change the active tab's settings through the shared state mirror. Routed the affected controls and related dynamic PCA controls through the existing owner binder.
- Added an A/B regression for component-selection settings and brought the PCA view-cache test in line with the current shared style control and valid 3D fixture. Focused PCA suites pass 2 suites / 11 tests.

## 2026-10-16 — Keep large Box statistics off the main thread

- Above the existing Box worker thresholds, worker failure or unavailability now reports a retry state instead of rerunning the full model synchronously. Previous results remain visible; smaller analyses remain synchronous.
- Added regressions for active worker failure, unsupported workers, and inactive-owner failure isolation. Focused Box stats, worker-policy, and ownership checks pass 4 suites / 29 tests.
## 2026-10-15 — Repair tab ownership and recovery coalescing

- Heatmap runtime restore now preserves the payload-owned dendrogram color. Shared Grid callbacks require matching, present owner and active-tab IDs, including deferred opens.
- Canonical recovery journal queues now retain every changed tab when writes overlap. Added focused regressions for Heatmap archive/A-B-A restore, Grid owner rejection, and multi-tab journal coalescing; refreshed the test inventory and tab-isolation audit.
- Venn species-selector changes now cancel only the event owner’s pending or in-flight automatic species detection before persisting the manual choice. A deferred-result regression caught and now prevents stale detection from replacing the control and payload.
- Delayed AG Grid and Venn paste tests now suppress cleanup errors only after the Playwright page closes. Their owner-isolation cases, the 17 manifest-contract tests, and the 661-row testing-inventory check pass.

## 2026-10-15 — Close shared style panels on tab deactivation

- AdditionalLine, Grid, and Dendrogram controls now reject stale-owner opens and close their panel when its owning workspace tab deactivates. Added owner-mismatch unit checks and rendered Line, Box, and Heatmap tab-switch regressions.
- Box pairwise label lanes now reserve space using rendered label width, preventing overlap in narrow fresh and archive-restored graphs.
- `documentState.dispose()` now removes its autosave document listener. Completed owner-bound input, change, and action-button events checkpoint through the existing session and canonical journal before deferred work; the Box browser regression inspects that immediate journal, reloads, and verifies restored controls and graph. The four-case Chromium recovery journal suite passes, as does the focused 14-test Jest suite. The stale manifest scenario contract and UpSet resize fixture were also corrected; neither required a product renderer change.
- Unsaved-close saves now keep their owner modal active during the awaited save, preventing another tab's close prompt from replacing the pending decision. Tab close requests are rejected during that save except for its exact owner; a delayed-save Chromium regression reproduced the old race and now passes.
- Discarding one tab no longer clears recovery for the whole workspace. Tab removal checkpoints the remaining tabs through the existing local journal and IndexedDB queue, while clearing recovery only after the last recoverable tab is removed. Chromium verifies the remaining tab's payload across both journals and reload/recovery, and verifies last-tab discard stays discarded.
- Focused Jest: 6 suites, 79 tests passed. Chromium: Box narrow/archive restore, Line/Pie/Venn same-type isolation, and Line/Grid/Dendrogram owner-panel deactivation checks passed.

## 2026-10-15 — Retire inactive significance control owners

- Shared significance controls now close and release their active tab config during workspace deactivation. This removes reliance on font-toolbar visibility to retire the prior tab's callbacks.
- Added a focused owner-deactivation regression and extended the two-Box rendered test to cover switching while the panel is open.

## 2026-10-14 — New-tab layout after reopen

- Capture shared component layout defaults before projecting a reopened tab's saved layout. Blank tabs now retain their original divider proportions and graph dimensions in both new and reopened files; saved tabs keep their own layout.
- Added Chromium coverage for all eleven components across resize, save, blank-tab creation, reopen, and return to the restored tab.

## 2026-10-14 — Box significance toolbar ownership

- Replaced borrowed per-tab Label controls with one shared selector. Significance settings now read and write the originating Box session, with owner-scoped payload/runtime publication for active and inactive undo. The original payload fields remain compatible with saved files.
- Removed the old per-tab markup, refs, change handler, styling and seven pairs of active-global getters/setters. Picker and drag work keep their initiating owner. Existing annotation drawing and calculation paths remain in place.
- Verified two populated tabs with distinct data, modes, whisker settings, scientific formatting and decimals through switching, active/inactive undo and cached archive reopen. Focused shared-control, Box integration and Chromium checks cover restored clicks, label geometry, log scale, isolation and persistence.

## 2026-10-14 — Restored Box comparison controls

- Restored significance line, label and label-hit-area controls after cached `.graph` reopen, using Box's existing interaction hook and the destination tab owner. Shared significance controls reuse serialized label hit areas and reject clicks from inactive owners; generic SVG font handling leaves comparison labels to their combined controls.
- Added vertical/horizontal archive-reopen regressions for line and label clicks, repeated interaction restoration, edited comparison styles, same-type tab switching and stale clicks. Added focused shared-control tests and updated the testing inventory. The separately reported star-to-p-value failure remains under investigation; this change does not implement the broader annotation refactor.

## 2026-10-14 — UI review and test cleanup

- Removed seven appearance-only cases that locked axis CSS syntax, Welcome icon dimensions, SVG hashes, or deployed artwork. Kept canonical icon ownership and browser checks for control reachability, popup clipping, selection, and tab ownership. Replaced ribbon color/size assertions with containment checks and refreshed test registrations and inventory.
- Fixed the Data transformation caption's contribution to row sizing so Multiple mode stays within the ribbon. Its noninteractive caption shares the lower band without blocking selection actions. Reviewed checked/unchecked Chrome screenshots at normal and narrow widths; test suites remain paused.

## 2026-10-14 — Toolbar tab underlines

- Matched active and hover underlines to tab text width. Inactive tabs use a light gray underline on hover instead of a background highlight.
- Lowered Data transformation controls by 6px by reclaiming spare space in the Multiple row. Documented this intentional toolbar-specific spacing exception in CSS; ribbon height and caption placement stay unchanged.

## 2026-10-13 — Detached ribbon toolbars

- Replaced the dark tab strip and gray toolbar cards with a detached white ribbon, subtle rounded corners and shadow, thin group dividers, plain bottom captions, and underlined active tabs. Removed the title-band gradient. Shared styling preserves the controls, toolbar height, and overflow rail. Test expectations updated; suites remain paused.
- Raised shared toolbar captions by 3px for bottom breathing room, preserving the overall toolbar height.
- Raised the active-tab underline into the gap below its text, leaving the ribbon edge clear.

## 2026-10-13 — Blend toolbar title bands

- Added a sharp 3px transition from the shared toolbar gray into the lighter title band. Preserved toolbar heights and borderless groups. Updated the existing appearance expectation; test suites remain paused.

## 2026-10-13 — Standardize toolbar naming

- Shared combined color/thickness fields use Style; line-pattern and opacity controls use Pattern and Transparency. Standardized Fill / shape, Alignment, Preserve ratio, Whisker style, Thickness mode, Scope summaries, Heatmap colors, and Legend height. Retained distinct Fill/Border controls, scientific units, and context-specific group names. The shared pattern selector uses Solid consistently.
- Removed 32 redundant component label overrides and merged equivalent overlay-label branches. Removed the added group dividers at the user's request. Updated existing label, significance, and overflow expectations. Automated test suites remain paused; Chrome screenshot review covers the component contexts and compact-width scrolling.

## 2026-10-13 — Use one toolbar gray family

- Removed the panel-only background mixture: toolbar bodies and their container now share #e9edf1. Toolbar text/control foregrounds and grouping lines share the matching almost-black cool gray #11171d. Preserved the lighter caption band, white inputs, and geometry.

## 2026-10-13 — Strengthen toolbar text and grouping-line contrast

- Shared field labels, bottom captions, and Axis length grouping lines now use an almost-black cool gray (#11171d), matching the background’s gray family. Kept line thickness, regular font weights, backgrounds, and control geometry unchanged.

## 2026-10-13 — Rebalance toolbar bands

- Reduced bottom title bands from 18px to 14px, transferring the space to the control area and adjusting its vertical spacing. Toolbar and container heights remain 70px. Updated the existing geometry expectation; automated suites remain paused.

## 2026-10-13 — Refine toolbar shadow and heading weight

- Tightened the container shadow to a 5px blur and increased opacity to 0.22, keeping its 2px offset. Set shared toolbar field/section labels and bottom group captions to regular weight.

## 2026-10-13 — Match the Axis length label to its toolbar

- The Axis length bracket label now masks its divider with the owning toolbar surface instead of white. Audited shared toolbar field-label CSS and inline writers; no other field label uses a fixed white background. Updated existing browser/source expectations. Automated test suites remain paused.

## 2026-10-13 — Move toolbar group titles into bottom banners

- Shared toolbar groups now place small captions in a light bottom band below a darker cool-gray control area. Preserved control labels/order, white inputs, popup ownership, and the 70px panel height. Removed the container’s extra vertical padding; its height exactly matches the 70px panels, with no container or toolbar-panel borders; inputs keep their borders and the caption bands keep their background contrast. Normalized panel borders and Data/Dendrogram sizing; removed unused top-title spacing variables.
- Added banner geometry checks to existing overflow coverage and updated stale axis-bracket assertions to the shared color tokens. Reviewed 30 Chrome toolbar screenshots across all 11 chart contexts, plus the color popup and compact-width scrolling. No caption overlap or panel-height mismatches remain in the captured states. Automated test suites remain paused. Screenshot evidence: artifacts/toolbar-banners/.

## 2026-10-13 — Give filenames room for descenders

- Replaced the document title’s tight line height with the normal text line height so its overflow box retains descenders such as g. Preserved horizontal ellipsis, centering, and header height. Updated the existing typography expectation; tests remain paused.

## 2026-10-13 — Refine Welcome visual hierarchy

- Kept graph cards open with bottom separators and restrained interior spacing; replaced heavy category dividers with fine gray rules. Kept green section titles and existing icon artwork; lightened icon backgrounds to the subtle surface gray and strengthened the blue, terracotta, and slate artwork colors for contrast. Lightened New buttons. Preserved the category grid and action order. Tests remain paused at the user’s request.

## 2026-10-13 — Restore green Welcome section titles

- Restored the theme accent on the three graph-category headings. Preserved divider and card styling. Tests remain paused.

## 2026-10-13 — Align toolbar gray tone

- Aligned the shared toolbar gray to the same blue-gray hue as the workspace surface, retaining its darker level. No layout changes; tests remain paused at the user’s request.

## 2026-10-12 — Keep thin selection borders even

- Aligned all four AG Grid selection edges and their painted thickness to physical screen pixels. Fractional display scaling previously gave different pixel coverage on opposite sides. Preserved existing clipping and pinned-row/column visibility rules.
- Extended the existing browser regression to check thickness and pixel alignment on every edge. Source parses; tests remain paused at the user’s request.

## 2026-10-12 — Refine grid headers and selection borders

- Darkened AG Grid column-header text using the shared ink color and reduced the selection perimeter from 2px to 1px. Updated the existing border-thickness expectation; tests remain paused at the user’s request.

## 2026-10-12 — Distinguish zoom input from actions

- Replaced the filled zoom strip with a transparent group: the editable percentage has a white input border, while Fit and 100% use lightly filled bordered buttons. Preserved the green active state in both graph-control locations; the input and both buttons match the preference button’s 24px height. Tests remain paused at the user’s request.

## 2026-10-12 — Normalize graph-control typography

- Corrected the incomplete move of shared graph options from SVG boxes to separate controls headers: axis-length labels, checkbox spacing, summaries, and width/height fields now use the same rules in both locations. Consolidated duplicate menu declarations.
- Labels inherit their control font instead of a fixed 16px fallback; graph-panel rows and plain text use the shared panel font. Corrected an undefined size-unit color token. Extended existing browser coverage for all axis-length choices and option labels in both hosts. Tests remain paused at the user’s request.

## 2026-10-12 — Cool the shared UI palette

- Shifted shared surfaces, text, borders, hover states, and scrollbars to restrained blue-gray shades between the previous blue theme and neutral gray theme. Kept green accents, graph colors, icon artwork, and tab blending. No layout changes; tests remain paused at the user’s request.

## 2026-10-12 — Restore the top-bar tab appearance

- Restored a dark green header with white text and a light gray selected General/Data/Format tab, matching the neutral toolbar below. Removed the dividing borders so the selected tab blends into the toolbar below. Kept behavior unchanged. Tests remain paused at the user’s request.

## 2026-10-12 — Unify the neutral UI palette

- Unified shared UI backgrounds, borders, text, menus, and hover states around neutral grays. Preserved the approved toolbar background and hover shades; green remains for selection and status indicators. Graph colors, Welcome icon artwork, and layout are unchanged.
- Updated existing browser expectations and CSS priority declarations. Tests remain paused at the user’s request.

## 2026-10-12 — Preserve Scatter point focus after label actions

- The point menu now consumes the expected AG Grid selection event once for its owning tab, preventing a delayed duplicate redraw from stealing keyboard focus after a label change.

## 2026-10-12 — Compact shared 3D axis-title spacing

- Replaced Plot3D's stacked title gaps and estimated minimum offset with one clearance between the rendered tick envelope and the nearest title edge. The default uses the standard Cartesian metric (3 SVG units at 16px); explicit gap overrides remain supported. Surface, Line, Scatter, and PCA share the fix. Rotation-safe reserves use the same single gap. Removed the unused second-gap option and old offset field; bumped the shared frame-layout version so obsolete cached spacing is rebuilt from the owning session.
- Added exact oblique-angle spacing checks at three font sizes and with custom/zero gaps. Native browser checks now reject excessive title clearance as well as overlap/clipping through redraw, rotation, styled multiline titles, cache restoration, and archive reopening. Cache tests reject the immediately preceding layout version; the Scatter rotation fixture uses the shared version constant.
- Verification: 91 targeted Jest checks across six suites and nine Chromium scenarios pass. Reviewed native screenshots for all four components, including multiline titles and Surface at 100% zoom. The original failing checks and final reports/screenshots are retained in `artifacts/plot3d-axis-clearance/`. Updated the architecture and explicit test inventory; button styling is preserved.

## 2026-10-12 — Implement named Box methods and repair statistics integration failures

- Added Dunnett correlated multivariate-t control comparisons, all-pairs Dunnett T3 maximum-modulus comparisons, and adaptive Lorentzian ROUT for a constant location. Shared screening applies the same exclusions to ordinary/custom calculations and preserves paired source-row IDs. Separate saved IDs preserve historical Sidak/MAD calculations. T3's unequal-variance calibration is approximate; ROUT does not fit arbitrary nonlinear curves, and inference after exclusion is exploratory.
- Removed repeated Box/Scatter session rebuilding from live reads; factories and hydration establish ownership records, while explicit DOM binding/capture retains ref validation. Added a shared full-app fixture lifetime that retires owned work before document/namespace replacement and retains authoritative teardown evidence. Replaced fixed flush counts in the affected statistics suites with owner-aware readiness waits. Initial timeouts, unsuccessful cleanup experiments and overlapping CPU-profile evidence remain documented in the integration backlog.
- Verification: all 43 oracle tests across eight suites pass against pinned Python/SciPy, including numerical edge cases; complete Box/Scatter integration files pass 11/11 and 8/8 (Scatter with strict leak enforcement). Eight historical-result checks pass, with three unrelated cases intentionally omitted. Seventeen focused method/fixture tests, 96 session/rendering contracts, and 28 worker tests pass. Thirteen Chromium cases preserve new-method reports, old methods, alignment, tab isolation and archive reopening/recalculation. The new worker assertion initially used a helper-only field name and was corrected; the first oracle run caught a reference-helper variable shadowing correlation dispatch, fixed before the full passing rerun. Initial logs remain in test-results. ESLint, scoped whitespace checks, component contracts and the 655-file explicit test inventory pass. The complete serial integration lane is still unverified.
- Reproduction inputs, reference values and tolerances are recorded in `docs/statistical-validation-framework.md`. Remaining nonlinear ROUT scope and broader integration certification stay in `issues.txt`.
- Final code review: fixed the fixture wrapper's loss of native timer/frame callback receivers, retained timer arguments, and removed its unused constant export after checking repository consumers. The new regression failed before the fix. All 40 focused tests and both complete statistics integration files (19 cases, strict leak enforcement for both) pass after the fix; lint, Python syntax, whitespace and explicit test-inventory checks pass. Evidence: `test-results/final-review-fixture-before.log`, `test-results/final-review-focused.log`, and `test-results/final-review-integration.json`. No production numerical changes were required by this pass.

## 2026-10-11 — Separate 3D graph frames from legend viewports

Line, PCA, and Scatter now project from the user graph dimensions plus exact title extensions. Legend width, visibility, and position no longer change plot dimensions, margins, or horizontal shifts. Surface's fixed-size color scale now occupies the same independent outer rail; its previously in-frame anchor could collide with a Z title during rotation. Existing dragged positions retain their legacy interpretation, while new Surface positions use the shared right-reserve anchor.

`chartStyle.stagePlot3dViewport()` publishes canonical graph dimensions separately from the complete viewport. Cached rotation models use the shared frame-layout version; obsolete geometry is rejected before DOM restoration and rebuilt from the owning saved session. Full and fast PCA/Scatter point-label layouts use the same title-extended frame. Removed the unused legend-shift helper, duplicate base-width aliases, angle-dependent legend collision searches, pre-publication clamps, and orphaned bounds calculations. Preference/zoom button CSS was preserved.

Validation: 93 Jest checks across six targeted suites; 20 distinct Chromium scenarios across nine focused files. Browser coverage includes exact multiline reserves, legend on/off geometry, title/legend separation through rotation, real cache restoration, obsolete-cache rejection, archive reopen for all four components, Surface scale drag/resize/zoom/recovery, same/different-component switching, and point-label leaders. Reviewed native screenshots in `artifacts/plot3d-legend-frame/screenshots/`. Final reports: `core-jest-final.json`, `pca-jest-final.json`, `final-viewport.json`, `final-surface.json`, `point-labels.json`, plus multiline checks in `final-layout.json` and switching/reopen checks in `restore.json` under that artifact directory.

Initial failures remain recorded in the artifact reports. PCA's unit fixture now supplies the SVG text geometry absent in JSDOM, and its stale scree visibility assertions use the current hidden contract. Reopen tests compare derived CSS reserves in the resizer's documented whole-display-pixel units while retaining exact logical viewport and projected-geometry assertions. No production 2D behavior was changed. ESLint, scoped whitespace checks, regenerated architecture/component docs, and the 653-row test inventory passed. The confirmed 3D frame/legend issue was removed from `issues.txt`.

## 2026-10-11 — Close the automated CSS/HTML quality tranche

- Completed the selector-by-selector review of all 48 retained CSS priorities and added direct Chrome computed-style coverage for the previously untested forced-colors Welcome states. Removed an unreachable dialog selected-state selector.
- Both `npm run quality:static` and CI's `npm run test:static` pass. All 11 vector Welcome previews match current source fingerprints; the test inventory records 654 files with 983 explicit and 0 inferred requirements.
- Manual screen-reader, Windows-native scaling/target, system color-picker, and SVG-overlap checks remain open in the roadmap; no WCAG conformance claim is made.

## 2026-10-11 — Move multiline 3D titles as complete formatted blocks

- Added `Shared.textBlock.setPosition()` to move parent coordinates, explicit styled-line coordinates, alignment anchors, and rotation pivots together without rebuilding spans. Shared Plot3D now measures the nearest painted title edge for tick clearance. Its rotation-safe estimate includes full perpendicular tick width, title height, and effective title font size, preventing the corrected text from crossing the frame.
- Verified readable Y endpoints, synchronized anchors, exact added-line reserves, native glyph containment, and annotation separation in Scatter, Line, PCA, and Surface. Surface additionally covers 95%/100% zoom, right alignment, a 24px title font, rotation, and recovered multiline scale drag/redraw. Existing title dragging already synchronizes line coordinates; Surface/PCA and Heatmap parent-only graph-title adjustment paths exclude multiline blocks, so no unrelated adapter rewrite was needed for title positioning.
- Reused one browser containment helper and updated the existing projected-clearance unit check to assert the painted edge rather than the parent anchor. Focused validation passed 82 Jest tests across six suites; nine layout/rotation Chromium scenarios and four reopen/recovery scenarios passed, followed by five strengthened multiline/formatting/rotation scenarios. Initial failing anchor assertions and the recovery/frame-estimate failure are preserved in artifacts/plot3d-title-position/. Reviewed native SVGs and screenshots; Surface's Y values are restored at both zoom levels and after larger-font/right-alignment edits. This is targeted validation, not a full-app claim.
- Removed the completed multiline title-positioning backlog entry. Final Line/PCA screenshots exposed a separate pre-existing adapter frame/legend-width inconsistency. Recorded its required 3D frame/cache refactor in `issues.txt` and stopped that additional work under engineering rule 2. Axis/tick assertions do not establish title/legend separation. Preserved button appearance and other worktree changes.

## 2026-10-11 — Remove duplicate inline-editor presentation

- Shared SVG text editing now uses a preview class for transparent formatted text and keeps its derived text color in a CSS custom property; JavaScript no longer repeats text appearance as inline styles. The selected edit cell keeps a narrowly scoped accent fill.
- Removed seven net CSS priorities across selection and inline editing. Eight focused installed-Chrome contracts pass.

## 2026-10-11 — Reduce AG Grid selection cascade debt

- Removed three unnecessary selection-fill priorities after installed Chrome confirmed the app-scoped rules still win over late vendor styles. Retained priorities only where the shared keyboard-focus rule or AG Grid's inline edit border requires them.
- Selection, range-fill, scrollbar, and long-edit Chrome contracts pass 4/4.

## 2026-10-11 — Share statistical result-tab behavior

- Box and Pie now use one shared, component-neutral summary-tab builder and projection module while keeping selection state in their owning sessions. Pie rehydrates nested summary tabs when its owner returns; Venn, Box, and Pie have Chrome coverage for same-type tab isolation.
- Added shared module tests and refreshed architecture/test inventory documentation. Six Chrome cases and eight Jest checks pass; local and CI static gates pass with all eleven previews fresh.

## 2026-10-11 — Fix 3D annotation density and Surface multiline scale sizing

- Surface reserved its scale using a title-extended width but rendered it using the base width. Reserve and rendering now share one canonical-frame options object. Restored scale drag also uses the shared base-frame metadata rather than title-extended rotation-model dimensions. A 16px Y-title line adds exactly 16px at 95% and 100% zoom; the scale stays 15 by 80 SVG units. Recovery, drag, and redraw preserve its position.
- All four 3D components reproduced annotation overlaps before the fix. Shared Plot3D now omits annotations for collapsed axes and selects non-overlapping actual rotated text bounds, prioritizing titles, longer projected axes, and endpoint tick values. Grid/axis geometry, graph dimensions, user settings, rotation, and owner state remain unchanged. Rotation and restored caches use that same renderer.
- Added rendered overlap/collapsed-axis checks for Scatter, Line, PCA, and Surface, unit checks for collapsed axes and font-dependent tick thinning, and Surface multiline recovery/drag coverage. PCA title-edit coverage now rotates its default edge-on Z axis into view. JSDOM structural tests use an explicitly approximate SVG text fixture; Chromium verifies real glyphs. Removed the stale mapping for the deleted temporary diagnostic spec.
- Validation: 74 tests passed across four focused Jest suites; the separate PCA statistics suite passed 7 tests. All 15 focused Chromium scenarios passed across targeted runs: 4 shared layout/rotation, 5 multiline sizing including Surface at 100%, and 6 legend/reopen/recovery scenarios. The strengthened multiline recovery scenario also passed. The initial four overlap failures, missing JSDOM geometry, PCA edge-on fixture failure, and new 100% test's incorrect accessible-name selector are retained in the diagnostic reports; no assertions were weakened. ESLint, scoped whitespace checks, and the 649-row test inventory passed. Reviewed screenshots of all four rotated components; evidence is in artifacts/plot3d-layout-fix/.
- Removed the two completed backlog entries. Button appearance and unrelated worktree changes were preserved. No full-app test pass is claimed.
- Final multiline screenshots exposed a separate shared title-positioning defect: explicit tspan coordinates do not follow later parent-anchor movement, leaving Y ticks suppressed in Surface despite sufficient axis length. Recorded the required shared text-layout refactor in `issues.txt` and stopped that additional work under engineering rule 2. The exact reserve and edge-on/dense-axis fixes remain validated. Native SVG and screenshots are retained; multiline sizing passes do not establish complete multiline annotation legibility.

## 2026-10-11 — Close shared CSS evidence tranche

- Routed six white UI surfaces through the shared surface token and removed two unused color aliases without changing rendered colors.
- Added Chrome coverage for graph sizing, reduced motion, forced-colors focus/selection, AG Grid keyboard selection, and Scatter's inline-label preview. Refreshed all eleven generated Welcome previews.

## 2026-10-11 — Link CSS priorities to browser evidence

- Every reviewed priority now links to one or more registered browser contracts. The local gate rejects missing or unmapped evidence references.
- Scatter’s inline-label preview contract now checks the computed text and selection styles that depend on the shared editor rules.

## 2026-10-11 — Consolidate repeated description text color

- Added a semantic token for Welcome drop-zone copy, graph-search hints, and graph-card descriptions while retaining the existing color.
- The nine-case Chrome token/accessibility batch passes with UI lint, priority and inventory checks, and refreshed Welcome previews.

## 2026-10-11 — Consolidate disabled-control text color

- Added a shared semantic token for the matching disabled-control text color across AG Grid filters, Axis controls, and workspace menus.
- Eight focused Chrome cases pass with UI lint, priority review, inventory checks, and refreshed Welcome previews.

## 2026-10-11 — Verify shared CSS visibility utilities

- Added an installed-Chrome computed-style contract for visually hidden accessible text and native hidden state against later component display styles.
- The focused browser test and both test-inventory checks pass.

## 2026-10-11 — Extend shared icon sizing tokens

- Added shared 18px and 24px icon sizes for the color-picker shape, import warning, and import component icons while preserving their rendered dimensions.
- The Chrome computed-style contract verifies all icon-size tiers; style lint, targeted ESLint, priority review, and thumbnail freshness checks pass.

## 2026-10-11 — Align Box significance checks with the graph header

- Updated two Box layout contracts to match the shared graph-header architecture. They now verify header/envelope alignment and centered controls before and after resize; rendered graph layout was already correct.
- Both Box cases pass in Chrome along with the shared-token and all-workspace touch-target checks (4/4).

## 2026-10-11 — Consolidate icon and touch-target dimensions

- Repeated SVG icon dimensions and coarse-pointer touch targets now use shared CSS tokens, preserving their rendered sizes.
- Focused Chrome checks pass for computed dimensions and all eleven touch-capable workspaces; UI style lint, targeted ESLint, inventory, and priority checks pass. All Welcome previews are fresh.

## 2026-10-11 — Require CSS priority ownership metadata

- Every reviewed `!important` declaration now records an owner and reason, both validated by the CSS priority gate. The current 55 declarations cover 12 owners; computed-winner review remains open.
- `npm run css:priority-budget` and the gate syntax check pass.

## 2026-10-11 — Use the shared target-size token for action boxes

- DataViews close/save and graph-options summary dimensions now reference the shared 24px target-size token. Chrome checks both the source token usage and computed size.
- Six computed-style contracts, Stylelint, targeted ESLint, and the CSS priority review pass; all Welcome previews were refreshed.

## 2026-10-11 — Consolidate shared control-chip colors

- Shared control chips now use semantic surface and text tokens. Removed six superseded Style Sync declarations while preserving per-control overrides and Axis's distinct label color.
- Six installed-Chrome computed-style contracts, Stylelint, targeted ESLint, and the CSS priority review pass; all Welcome previews were refreshed.

## 2026-10-11 — Consolidate subtle UI surface colors

- Added an exact-value token for seven repeated UI background declarations. Chrome checks normal and disabled filter controls, the import preview, and row-number cells; all CSS-fingerprinted Welcome previews were refreshed.
## 2026-10-11 — Consolidate repeated interface text colors

- Added exact-value semantic tokens for repeated control and supporting text colors. Chrome computed-style coverage verifies all affected consumers without changing rendered color.
- Confirmed two Welcome focus priorities are needed to preserve the 2px keyboard outline against the later shared focus rule. Focused Chrome checks, Stylelint, the priority review, `quality:static`, and `test:static` pass.
## 2026-10-11 — Make shared formatting-panel layout CSS-owned

- Axis, Dendrogram, Grid, Significance, and Additional Line panels now rely on native `hidden` for visibility. CSS owns their visible layout, and a shared-class collision was avoided by scoping the grid layout to the Additional Line panel modifier.
- Targeted Jest passes 7/7. Installed Chrome passes six Axis popup cases and the Significance, Line uncertainty, and shared-panel computed-style checks. UI lint and both static gates pass with 647 manifest rows, 942 explicit/0 inferred requirements, 1,295 Chromium tests, 355 Jest files, and 11 fresh previews.

## 2026-10-11 — Use semantic visibility for shared control fields

- The shared Significance toolbar projects Whisker Style, Label, and Decimals through native `hidden`. Axis Add Mark, Add Break, and break-segment controls use the same state contract, with CSS owning their visible display.
- Installed Chrome passes the Significance toolbar visibility case and Add Mark visibility on Line, Box, and Scatter. CSS/HTML lint and targeted ESLint pass. Two Box significance-tray geometry contracts remain failing at an about 50px tray gap versus the expected 10px; tracked in `issues.txt` without changing layout or weakening the tests.
## 2026-10-11 — Require reviewed CSS priority declarations

- Replaced the count-only priority check with a PostCSS audit of the current selector, property, value, and at-rule context against a reasoned allowlist. Removals are accepted; new and duplicate declarations fail even if total count stays flat.
- Added PostCSS as a pinned direct development dependency. The allowlist passes live CSS and both removal/addition smoke checks. All eleven Welcome previews were refreshed with installed Chrome; `npm run quality:static` and `npm run test:static` now pass.
## 2026-10-11 — Keep AG Grid checkbox keyboard focus visible

- Removed the two-priority catch-all that reset focus styling on any AG Grid cell with an inline layout attribute. Source tracing found no renderer writing cell focus outlines or shadows. Pointer focus keeps its existing neutral styling; keyboard-focused checkbox wrappers now use the shared green focus token.
- Installed Chrome passes the pointer/keyboard focus regression and the shared grid selection, scrolling, and keyboard-navigation batch 7/7. Targeted ESLint, CSS lint, and the priority budget pass.
- CSS is 8,642 lines with 58 priorities under a 58-count ceiling. The wider static gates were not rerun in this slice.

## 2026-10-11 — Scope AG Grid pinned-row borders and shadows

- Replaced nine pinned-row border, shadow, and hidden-scrollbar size priorities with `#appShell` selectors. No runtime border or shadow writers compete with these styles; the deferred vendor CSS has lower specificity.
- Chrome verifies pinned cell resets, grouped Box and Line 3D dividers, pinned-section shadows, hidden scrollbar sizing, and scrolling/selection behavior. The targeted shared-style/grid batch passes 12/12; the Line 3D grouped-divider case passes 1/1. CSS lint passes at 60/60 priorities; the broader static gates were not rerun in this slice.
- CSS remains 8,645 lines; the local/CI priority ceiling is now 60. Roadmap estimate remains about 87%.

## 2026-10-11 — Scope AG Grid seam and scrollbar styles

- The header/pinned-row seams, scroll behavior, scrollbar track, and gutter resets now use #appShell-owned selectors, removing ten priorities after vendor-loaded Chrome checks preserved the 1px seams, track color, zero gutters, and pinned-row geometry.
- The shared UI contract, AG Grid selection/scrollbar behavior, and Line header sort/selection batch pass 8/8 in Chrome. CSS is 8,645 lines with 69 priorities under a 69-count ceiling. Both npm run quality:static and npm run test:static pass with 647 manifest rows, 942 explicit/0 inferred requirements, 1,294 Chromium tests across 292 files, 355 Jest files, and 11 fresh previews.

## 2026-10-11 — Align shared AG Grid header targets

- The serial Chrome accessibility matrix found 24×20px filter targets because `Shared.hot` reused the compact 20px body-row height as its header height. The shared factory now reads `--graphitix-ag-header-row-height`; the app keeps 20px body rows and 24px header targets.
- The all-workspace target sweep passes 1/1 (450 controls, eleven grids; 23 compact row-checkbox exceptions remain). Header drag/keyboard/sort/style contracts pass 18/18; targeted AG Grid Jest passes 21/21. The post-fix serial Chrome accessibility rerun passes 241/241 in 42.5 minutes. Both local and CI static gates pass with 647 manifest rows, 942 explicit/0 inferred requirements, 1,294 Chromium tests across 292 files, 355 Jest files, 11 fresh previews, and 79/79 CSS priorities.

## 2026-10-11 — Scope AG Grid header styling to the application

- App-shell specificity now owns the header-cell seam reset and selected-column background/shadow, retiring three priorities without changing the visible state.
- Chrome computed-style coverage checks the vendor-loaded header states; the shared UI contract and Line header sort/selection batch pass 5/5. Both local and CI static gates pass with 647 manifest rows, 942 explicit/0 inferred requirements, 1,294 Chromium tests across 292 files, 355 Jest files, and 11 fresh previews. CSS contains 79 priorities under a 79-count ceiling.

## 2026-10-11 — Consolidate PCA pinned-row divider rules

- Removed duplicate pinned/floating PCA divider selectors because the base cell selectors cover the same pinned cells. App-scoped divider rules preserve the shared 1px border; Chrome confirmed the three border declarations still need !important.
- The PCA table-format contract verifies token-colored dividers in standard/grouped tables, pinned rows, tab return, and archive reopen. It passes 1/1. CSS contains 82 priorities under an 82-count ceiling.

## 2026-10-11 — Remove the unproduced PCA nested-header branch

- Removed the dead pca-grouped-nested-only CSS branch and its stale cleanup call after verifying there is no current class producer.
- The PCA grouped-table owner-isolation and archive-reopen contract passes in installed Chrome. Both local and CI static gates pass: 647 manifest rows, 942 explicit/0 inferred requirements, 1,294 Chromium tests across 292 files, 355 Jest files, and 11 fresh previews. The CSS priority count and ceiling are 85.

## 2026-10-11 — Remove superseded AG Grid anchor styling

- Removed the earlier transparent selected-cell and anchor backgrounds; the later app-owned state rule already owns the rendered selection fill. This retires one priority and two redundant declarations.
- Installed Chrome confirms the teal selected-cell fill and outline; the six-case edit, selection/fill, keyboard-navigation, and pinned-scroll batch passes. CSS contains 87 priorities under an 87-count ceiling.

## 2026-10-11 — Scope AG Grid inline-editor styling

- App-shell specificity now owns inline editor appearance and overflow, retiring nineteen priorities. Selected-fill border styling also uses app-shell scope; the inline-edit right-edge priority remains because the active AG Grid range border overrides normal styling.
- The expanded long-edit contract verifies appearance, cell geometry, and neighboring-cell coverage. Installed Chrome passes the six-case edit, selection/fill, keyboard-navigation, and pinned-scroll batch. The CSS priority count and ceiling are 88.

## 2026-10-11 — Retire obsolete AG Grid focus rules

- Shared live focus resets now beat the deferred vendor theme by app-shell specificity, removing 14 priorities. Removed old range-border and inner-focus selectors that the pinned vendor/runtime no longer emits; dynamic inline-style protection remains.
- Installed Chrome passes the 7-case selection, keyboard, pinned-scroll, edit-overflow, and inline-edit batch. The CSS priority count and ceiling are 108; both local and CI static gates pass.

## 2026-10-11 — Remove shared AG Grid base priorities

- Scoped shared cell/header border, spacing, and sizing rules to `#appShell`; app-owned specificity now beats deferred vendor selectors, removing 13 `!important` declarations without changing the established computed styles.
- Installed Chrome passes 10/10 focused cases for shared styles, selection borders and scrolling, pinned selection, and grouped-grid geometry. The local and CI static gates pass; the priority count and ceiling are 122.

## 2026-10-11 — Scope AG Grid header pseudo resets

- App-shell specificity now suppresses late AG Grid header separator/focus pseudo-elements without four `!important` declarations. The computed suppression remains unchanged after vendor styles load.
- The real Line header-sort contract checks the pseudo styles; it and the Heatmap exclusion archive/recovery contract pass 2/2 in installed Chrome. Both local `quality:static` and CI `test:static` pass at 135/135 priorities.

## 2026-10-11 — Consolidate AG Grid exclusion styling

- Exclusion cells, rows, and columns now use shared status-color/pattern tokens. App-shell-scoped selectors beat the generic vendor theme, allowing nine redundant `!important` declarations and duplicate row/column styling to be removed without changing the displayed treatment.
- The existing Heatmap archive/recovery contract now checks computed colors and stripe patterns for all three exclusion types. Installed Chrome passes 1/1; both local `quality:static` and CI `test:static` pass at 139/139 CSS priorities.

## 2026-10-11 — Consolidate repeated interface text colors

- Routed 49 repeated interface foreground declarations through four semantic CSS color tokens while preserving their exact computed colors.
- The shared Chrome style contract passes 4/4; CSS/HTML lint, ESLint, and `npm run quality:static` pass. All eleven Welcome SVG previews are current; the stylesheet has 8,724 lines and 148 priority declarations.

## 2026-10-11 — Close Venn analysis disclosures with their owner

- Venn GO and STRING option panels now close on their owning tab's deactivation and reset the matching expanded state. The reset resolves the mounted owner root explicitly, so another tab's controls are not changed.
- The Chrome contract verifies Enter/Space disclosure behavior and same-type tab return; the new contract and existing GO/STRING async-isolation test pass 2/2.
- Local `quality:static` and the CI `test:static` lane pass after refreshing all eleven Welcome previews and the testing inventory.

## 2026-10-11 — Complete the serial Chrome accessibility matrix

- All 241 accessibility tests pass in installed Chrome, serially, in 42.5 minutes. The PCA point-menu case now right-clicks a point inside the visible graph area and verifies the panel does not scroll during opening. Its former forced locator click auto-scrolled the clipped graph panel and triggered the menu's intended close-on-scroll behavior; no production menu change was needed. Four PCA and four Scatter focused repetitions pass (8/8).
- Firefox was not run. The compact desktop grid-target exception and manual assistive-technology review remain open.

## 2026-10-11 — Retire a redundant AG Grid row-border priority

- The app-owned row selector wins by specificity over the later vendor rule. Removed its unnecessary priority and added a Chrome computed-style assertion for the preserved zero-width row border.
- CSS priorities are now 148/148. The focused shared-style contract, Stylelint, ESLint and npm run quality:static pass; all eleven Welcome previews are fresh.

## 2026-10-11 — Close font controls with their tab owner

- The workspace lifecycle now closes the font panel owned by a deactivating tab after inline-title finalization. This prevents editable font-size suggestions from returning open with a restored tab.
- Chrome verifies font-family and both font-size popup transitions across all eleven workspaces, along with the existing seven color-picker owner cases.

## 2026-10-11 — Consolidate workspace frame sizing rules

- Consolidated repeated page-width declarations and plot-stack sizing into shared CSS rules across all eleven workspaces. The 99-configuration Chrome matrix confirms the same computed sizing, no viewport overflow, and controls remain beside the graph.
- Stylelint, targeted ESLint, and `npm run quality:static` pass. Regenerated and verified all eleven Welcome previews; CSS is 8,720 lines with 149 priorities. Rendered geometry is unchanged.

## 2026-10-11 — Verify shared color-picker ownership through real toolbars

- Added same-type tab-switch coverage through the real Venn, Box, Scatter, PCA, Line, Histogram, and Pie formatting toolbars. Each case confirms the picker closes with its owner and a pending eyedropper result changes neither the former nor replacement owner's rendered mark.
- Installed Chrome passes all seven owner cases. The static quality gate passes with 647 manifest rows, 941 explicit/0 inferred requirements, 1,281 Chromium tests, 292 Playwright files, 355 Jest files, 11 fresh previews, and 149/149 CSS priorities. No production behavior changed.

## 2026-10-10 — Stabilize the PCA menu target check

- The full serial Chrome accessibility run completed 228/229. Its lone failure sampled the PCA menu before its item was visible; the test now waits for that item while retaining the 24px target requirement. The focused case passes; the full matrix was not rerun after this test-only correction.

## 2026-10-10 — Consolidate repeated interface spacing

- Reused shared spacing tokens for disclosure markers and custom select-arrow clearance, and unified duplicate axes-menu base and nested sizing rules. Three installed-Chrome style cases pass. The static quality gate passes with 646 manifest rows, 1,274 Chromium tests discovered, 355 Jest files, 11 fresh previews, and 149/149 priorities.

## 2026-10-10 — Refresh CSS/HTML roadmap validation

- Updated the keyboard-resize browser test to find graph options in the shared frame header. Added a 1e-9 px coordinate tolerance for SVG archive round-trips while retaining exact transform checks; actual transforms and saved state remain asserted.
- Installed Chrome: the full accessibility run completed 226/229; the three failures were exact-string comparisons in Scatter coordinate round-trips. All three pass after the assertion fix. The full suite was not rerun after this test-only correction. All 11 graph-resize cases and the isolated Line dialog case pass 12/12.
- Regenerated the 11 stale welcome previews with installed Chrome. npm run quality:static passes, including CSS/HTML lint, ESLint, docs, runtime, vendor, preview, and test-inventory checks; priority budget is now 149/149.
- Removed one redundant priority from the app-owned AG Grid header-action border after source tracing found no matching vendor selector; Chrome confirms equal four-side borders across all eleven workspaces. Reviewed remaining non-vendor CSS priorities; source evidence supports their accessibility, rendering, or editing contracts. Per-owner AG Grid/HOT winner review and manual accessibility evidence remain open.

## 2026-10-10 — Complete source-traced CSS hook retirement

- Re-scanned 1,044 CSS classes against 890 authored, runtime, test, script and asset files. Removed 38 stale hooks; the three exact-unreferenced loading-overlay child names are generated by the shared builder and remain live. Removed the unused Grid toggle rule after tracing the shared Grid control producer, a stale Survival hint ID selector after confirming the rendered hint is class-based, and two unconsumed CSS custom properties.
- Recovered the pre-edit stylesheet snapshot and re-applied its known current-worktree deltas before pruning; verified the 2px keyboard focus cue, 150 priorities, and all retained selector branches. CSS is 8,762 lines with 150 priorities. UI lint passes; the focused Chrome checks pass, including five targeted cases for toolbar overflow, Welcome icons and Survival tab/reopen. The corrected Heatmap viewport case also passes 1/1 in isolation.

## 2026-10-10 — Remove unreferenced CSS hooks

- Removed 15 non-vendor CSS hooks with no current markup, runtime, test, script or asset references, pruning only dead branches from shared selectors. Twenty-six additional candidates remain under review.
- Installed Chrome Welcome SVG contract passes 1/1; `npm run lint:ui` passes at 150/150 priorities. CSS is 8,869 lines.

## 2026-10-10 — Verify Welcome focus behavior

- Kept the existing 2px teal keyboard ring and added a Chrome regression check confirming keyboard visibility and ring-free pointer focus.
- The focused installed-Chrome accessibility case passes 1/1. CSS is unchanged in this review.

## 2026-10-10 — Remove unmatched font-control pseudo rules

- Removed two WebKit calendar/list-button rules that cannot match the app's text-only custom comboboxes. Installed Chrome passes all eleven font-listbox viewport checks, keyboard focus, eight Axis number-format cases, and the font size no-spin-button check; the CSS priority ceiling is 150. `npm run quality:static` passes with 646 manifest rows, 939 explicit/0 inferred requirements, 1,272 Chromium tests, 355 Jest files, and 11 fresh previews.

## 2026-10-10 — PCA grouped-row cascade

- Removed PCA's duplicate inline `cellStyle` background writer so its existing grouped-metadata class is the sole visual owner. The rendered Chrome contract confirms the shared muted surface token; current CSS priority count and ceiling are 152. The full PCA sizing spec passes 3/3, and `npm run quality:static` passes with 646 manifest rows, 939 explicit/0 inferred requirements, 1,272 Chromium tests, 355 Jest files, and 11 fresh previews.

## 2026-10-10 — Shared action-target tokens and popup archive coverage

- Reused the 24px target token for DataViews close/save actions and graph-options summaries without changing rendered dimensions or the compact desktop row height. Removed one verified redundant Font combo shadow priority while preserving visible keyboard focus.
- AG Grid context/filter popup archive-reopen coverage now passes across all eleven component owners in installed Chrome (11/11). Computed-style and coarse-pointer contracts pass (1/1 each).
- Refreshed all eleven generated Welcome SVG previews with installed Chrome. `npm run quality:static` passes with 646 manifest rows, 938 explicit requirements, 1,272 discovered Chromium tests, 355 Jest files, 11 fresh previews, and 153/153 CSS priorities as of that change.
## 2026-10-10 — Graph sizing cleanup

- Removed redundant zoom bounds and resize flags. Fixed title-checkbox projection into the separate controls menu and ensured unchanged geometry still projects a Fit/Manual change.
- Updated zoom tests and diagnostics for the numeric control, corrected published-reserve rounding assertions, and removed stale control-floor documentation. The shared zoom-dependent text-measurement defect remains open.

## 2026-10-10 — Visible graph resize boundary

- Added a visible corner grip with a 24px grab area, including dark graph surfaces. Small graphs remain independent of the surrounding controls frame.
- When the boundaries differ, a faint guide follows the existing full graph envelope on graph-area hover, size-field focus, and during dragging. The guide is presentation only and does not alter graph dimensions, SVG exports, or saved state.
- Reviewed the complete frame/resize changes: controls are created directly in their header; removed duplicate frame decoration, unused envelope mirrors, and obsolete zoom-width logic. Fixed dark-to-light frame/footer surface projection. Preserved the updated preferences and zoom button appearance.
- Completed component lookups through the shared controls host, including PCA equal-axis controls and component Lock ratio policies. Removed obsolete checkbox writeback during layout capture.

## 2026-10-10 — Shared graph controls frame

- Moved graph options, zoom, title, legend, and axis controls into a shared normal-flow header above the existing `.svgbox`; Download/Copy remains attached below the frame. The `.svgbox` remains the canonical graph-size and envelope boundary, header width no longer constrains zoom, and the graph body no longer keeps the legacy controls-tray inset.
- Added shared owner-aware frame creation, surface projection, wrapped narrow-layout styling, and cross-component layout contracts. Focused Jest checks pass; export-controls layout passes 5/5; zoom-redraw passes 5/6 (Line has a 0.7px envelope-rounding mismatch); Survival/Histogram fit-cycle checks still expose a separate pre-existing export-width drift recorded in the implementation log.

## 2026-10-10 — Fixed figure defaults and shared window zoom

- New graph frames are 360 × 360 across browser sizes. Every component uses the same browser-size default zoom; panel widths, labels, legends, and summaries do not change it. Config and zoom controls wrap when needed and do not determine the minimum displayed width.
- Fit/manual intent is owned by each tab session and saved in layout state. Manual zoom and resizing preserve the selected view; resize undo restores viewing intent. Canonical frame dimensions remain fixed. Legacy archives retain saved frame dimensions and initialize manual viewing from their saved zoom. Validation exposed a remaining shared text-measurement dependency on display zoom that can change export width after redraw; the required refactor is recorded in `issues.txt`.
- Reused shared layout, sizing, zoom, and UI tokens; updated browser/unit contracts, persistence documentation, and generated Welcome thumbnails.

## 2026-10-10 — AG Grid radius cascade cleanup

- Replaced two grid corner-radius priorities with app-scoped selectors and extended the Chrome computed-style contract. The grid theme and root remain square; current CSS priority count is 154. `npm run quality:static` passes with 645 manifest rows, 930 explicit/0 inferred requirements, 1,246 Chromium tests, 355 Jest files, and 11 fresh thumbnails.

## 2026-10-10 — Formula signature tooltip accessibility

- The shared AG Grid formula editor now exposes its function-signature popup as a tooltip, connects it to the active editor with `aria-describedby`, and removes that relationship when the tooltip hides. Chrome verifies accessible semantics and 320×400 containment; the focused formula-assist spec passes 2/2, Box/Scatter formula-editing regressions pass 7/7, and the HOT editor Jest suite passes 6/6. `npm run quality:static` passes with 645 manifest rows, 930 explicit/0 inferred requirements, 1,246 Chromium tests, 355 Jest files, 11 fresh thumbnails, and 156/156 CSS priorities.

## 2026-10-10 — CSS priority ceiling tightened

- Lowered the UI lint/CI priority ceiling from 166 to the verified current count of 156. `npm run quality:static` passes at 156/156 with 645 manifest rows, 928 explicit/0 inferred requirements, 1,246 Chromium tests, 355 Jest files, and 11 fresh thumbnails.

## 2026-10-10 — Box formula popup owner lifecycle

- Added a same-type tab-switch contract for the body-portaled Box formula suggestions. Installed Chrome confirms the list closes when its owner deactivates and remains closed on return; the test scenario is recorded in the coverage catalog.
- The full formula-assist spec passes 2/2. The static gate passes with 645 manifest rows, 928 explicit/0 inferred requirements, 1,246 Chromium tests, 355 Jest files, 11 fresh thumbnails, and 156/156 CSS priorities.

## 2026-10-10 — Axis popup accessibility matrix

- Extended number-format keyboard, viewport, and same-type owner checks to Box, Scatter, Line, and Histogram; additional-ticks and broken-axis dialogs now cover keyboard focus, viewport bounds, and owner return in Box, Line, and Scatter. Installed Chrome passes 21/21, and the generated test inventory includes the added scenarios.

## 2026-10-10 — Font picker workspace matrix

- Extended shared font-family/font-size keyboard, short-viewport, text-editing, and same-type owner-return checks from Line and Scatter to all eleven workspaces. Installed Chrome passes 22/22, and the scenario catalog/inventory records the expanded coverage. `npm run quality:static` passes with 645 manifest rows, 926 explicit/0 inferred requirements, 1,229 Chromium tests, 355 Jest files, 11 fresh previews, and 156/166 CSS priorities.

## 2026-10-10 — Hidden import-picker sizing

- Scoped the hidden native import select to its prompt so it keeps a 1×1 clipped box against generic form-control sizing. Removed five redundant priorities and the ineffective native-select overflow declaration. The modal lifecycle Chrome contract passes 6/6; `npm run quality:static` passes with 645 manifest rows, 926 explicit/0 inferred requirements, 1,211 Chromium tests, 355 Jest files, 11 fresh previews, and 156/166 CSS priorities.

## 2026-10-10 — Graph-options owner checks across all workspaces

- Extended same-type disclosure closure coverage to the graph-options control across all eleven workspaces; nested axes-length closure is checked where Line, PCA, and Scatter render it. Installed Chrome passes 11/11.
- `npm run quality:static` passes with 645 manifest rows, 926 explicit/0 inferred requirements, 1,211 discovered Chromium tests, 355 Jest files, 11 fresh previews, and 161/166 CSS priority occurrences.

## 2026-10-10 — Chrome accessibility matrix review

- All 172 accessibility cases passed across the four-worker suite and focused serial reruns. The parallel run had two font-listbox timeouts and one pointer-focus mismatch; all three passed serially.
- Static quality passes with 645 manifest rows, 926 explicit/0 inferred requirements, 1,200 discovered Chromium tests, 355 Jest files, 11 fresh previews, and 161/166 CSS priority occurrences.

## 2026-10-10 — Color-scheme popup viewport matrix

- Expanded the shared 320×400 popup-bound and 24px option-target contract across all eleven workspaces. Installed Chrome passes 11/11.
- `npm run quality:static` passes with 645 manifest rows, 926 explicit/0 inferred requirements, 1,200 discovered Chromium tests, 355 Jest files, 11 fresh previews, and the CSS priority count at 161/166.

## 2026-10-10 — Color-scheme popup owner checks across all workspaces

- Extended same-type owner-deactivation coverage to the shared palette listbox in all eleven workspaces. Installed Chrome passes 11/11.

## 2026-10-10 — Workspace toolbar menu owner checks across all workspaces

- Expanded same-type owner-deactivation coverage to all eleven component workspaces. Installed Chrome passes 11/11.

## 2026-10-10 — DataViews export-menu owner checks across all workspaces

- Expanded same-type owner-deactivation coverage to all ten DataViews-enabled workspaces. Installed Chrome passes 10/10; the static gate passes with 645 manifest rows, 926 explicit/0 inferred requirements, 1,170 discovered Chromium tests, 355 Jest files, and 11 fresh previews.

## 2026-10-10 — AG Grid popup owner checks across all workspaces

- Extended the same-type owner-deactivation contract to all eleven component grids. Context menus and column filters close with their original owner; the replacement owner can open and dismiss a fresh filter popup.
- Installed Chrome passes 11/11. The static gate passes with 645 manifest rows, 926 explicit/0 inferred requirements, 1,162 discovered Chromium tests, 355 Jest files, and 11 fresh previews.

## 2026-10-10 — Font color-input overlay cascade

- The custom Font color input has no competing position rule or runtime writer. Removed its redundant priority; the computed-style contract confirms it stays absolutely positioned.
- The computed-style and toolbar color-picker Chrome checks pass 10/10. The static quality gate passes; the priority budget is now 161/166.

## 2026-10-10 — Owner-scoped color-input alignment

- The shared color-input reset was later in the cascade and more specific than the toolbar centering rule, so the owner styles needed `!important`. Scoped the centering rules to `#appShell`, which wins by ownership specificity, and removed four priorities without changing the five rendered input alignments.
- The computed-style contract passes in Chrome; the existing toolbar color-picker suite passes 9/9. The static quality gate passes; the later overlay slice lowers the priority count to 161/166.

## 2026-10-10 — Shared compact UI measurement tokens

- Added shared dense/tight line-height, 3px gap, roomy control-padding, and small-icon tokens. Replaced matching repeated declarations and removed a redundant DataView export-item padding rule; the existing compact Font combo and roomier tab-context padding remain unchanged.
- The expanded computed-style contract passes in installed Chrome. `npm run quality:static` passes with 645 manifest rows, 926 explicit/0 inferred requirements, 1,153 Chromium tests, 355 Jest files, and 11 fresh Welcome previews. CSS is 8,818 lines with 166 `!important` declarations.

## 2026-10-10 — Anchored AG Grid filter popup

- Filter popups now remain anchored across window and nested grid scroll/resize events while their trigger is visible, then close if it leaves view. Opening uses scroll-safe focus and refreshes the anchor after focus.
- The all-workspace Chrome focus sweep passes, as do the direct AG Grid context-menu/nested-scroll/owner and numeric-filter checks (4/4) and shared HOT Jest tests (23/23). The static lane passes with 645 manifest rows, 926 explicit/0 inferred requirements, 1,153 Chromium tests, 355 Jest files, and 11 fresh previews.

## 2026-10-10 — Shared Notes editor cascade cleanup

- Removed redundant Notes editor filter/shadow resets after tracing their consumers; computed defaults need no override. The CSS priority ceiling is now 166.

## 2026-10-10 — Shared live-preview sizing rule

- Consolidated matching SVG viewport, render-target, and canvas sizing declarations under one owner selector group, removing eight duplicate priorities while retaining renderer overrides. All 14 targeted installed-Chrome resize checks pass across stacked Surface/UpSet, eleven reduced-motion graph types, and dense Scatter live resize.

## 2026-10-10 — CSS priority growth guard

- Added a CSS priority ceiling to the local and CI UI-validation path, then lowered it from 176 to 168 after retiring eight duplicate declarations. The aggregate cap does not replace the remaining selector-by-selector cascade review.
- The CI static lane passes with 645 manifest rows, 926 explicit/0 inferred requirements, 1,153 Chromium tests, 355 Jest files, and 11 fresh previews.

## 2026-10-10 — Compact export-control width ownership

- Compact Download/Copy controls now use fixed CSS widths without conflicting inline auto-sizing. Six priority flags were removed after strengthening the app-owned selectors over generic configuration-panel sizing.
- Chrome passes all 16 export-layout and statistics reopen/recovery checks; Stylelint and ESLint pass. All eleven preview assets are fresh, and `npm run quality:static` passes with 645 manifest rows, 926 explicit/0 inferred requirements, 1,153 Chromium tests, and 355 Jest files.

## 2026-10-10 — Active-state cascade cleanup

- Moved selected/active/hover styles into their owning rules and removed the duplicate late theme patch. Removed six priorities across tabs, filter sorting, data transforms, Font controls, formula suggestions, and import options. Chrome computed-style and interaction checks pass; CSS now has 182 priorities.

## 2026-10-10 — AG Grid and font-control priority cleanup

- Moved AG Grid font and row-height values to app-scoped selectors that override the deferred vendor theme by specificity; removed a redundant font-picker pointer-border priority. Six priority flags are retired; Chrome's grid and font-picker checks pass 4/4. CSS now has 188 priorities.

## 2026-10-10 — Floating-popup and native-select cascade cleanup

- Removed two unnecessary `!important` declarations: floating popups retain zero margin, and a specific Heatmap selector preserves the native picker icon reset. CSS now has 194 priorities.
- Installed Chrome confirms the popup remains fixed, viewport-contained and zero-margin, and both Scatter and Heatmap selects keep the themed picker. The focused checks pass 2/2; CSS and changed-test ESLint pass.
- Refreshed all eleven previews; the static quality gate passes with 645 manifest entries, 926 explicit/0 inferred requirements, 1,153 Chromium tests, and 355 Jest files.

## 2026-10-10 — Statistics form-row spacing token

- Replaced three repeated 6px-by-12px statistics-control gaps with `--ui-gap-form-row`. Chrome confirms computed spacing is unchanged.
- Updated the owner-scoped summary layout contract to permit responsive wrapping while checking containment and non-overlap. The computed-style and all-workspace summary checks pass 13/13 in Chrome.

## 2026-10-10 — Resizer spinner cascade cleanup

- Removed the redundant WebKit spin-button pseudo rule; the resizer number field's standard and WebKit appearances remain `textfield` in Chrome. The computed-style and graph zoom redraw checks pass 6/6.
- The static quality gate passes with refreshed previews, 645 manifest rows, 926 explicit/0 inferred requirements, 1,153 Chromium tests, and 355 Jest files.

## 2026-10-10 — Compact UI spacing tokens

- Added shared 5px compact-gap and 220px menu-list height tokens; six live gap consumers and three menu lists retain their computed values.
- Removed the superseded compact Welcome-card padding/gap rule after confirming its only runtime consumer is governed by the stronger popular-card rule. Retired two redundant cascade priorities: toolbar position is set inline by its shared owner, and DataViews host overflow has no competing rule or inline writer.
- The final installed-Chrome batch passes 9/9 across computed styles, AG Grid/Font menus, toolbar overflow/owner return, and DataViews archive fidelity. Stylelint and `npm run quality:static` pass with 645 manifest rows, 926 explicit/0 inferred requirements, 1,153 Chromium tests, 355 Jest files, and 11 fresh previews.

## 2026-10-10 — Shared border and panel-padding tokens

- Replaced 42 exact gray side-border values with `--ui-border-default`, routed four repeated panel/fieldset paddings through `--ui-content-padding-panel`, and standardized seven interactive minimum heights at `--ui-target-size-minimum: 24px` without changing computed values. Four menu families now share `--ui-menu-item-min-height: 26px`, and the duplicate Font-family option minimum was removed while preset-size options retain 28px. Removed the duplicate resizer number-input subclass rule after confirming the shared selector already covers it; four redundant priorities were retired, and Chrome confirms the field retains `appearance:textfield`. The current token/computed-style and all-workspace target checks pass 2/2; earlier AG Grid selection/scroll and Line pinned-column checks pass 5/5. The static quality gate passes.

## 2026-10-10 — Shared interface font-weight tokens

- Added regular, medium, semibold, and bold tokens for 154 repeated interface declarations. The Chrome computed-style contract confirms representative workspace, Welcome, and toolbar consumers retain weights 400, 500, 600, and 700.

## 2026-10-10 — Chrome accessibility acceptance sweep

- The PCA point-menu keyboard contract now waits for the active component owner to settle after point activation before testing the pointer-triggered menu. The complete serial installed-Chrome accessibility folder passes 125/125.

## 2026-10-10 — Axis disclosure-label cascade

- Axis broken-axis and length-preserve labels now use their more specific owner selectors instead of eight redundant `!important` declarations. The length-preserve base rule no longer duplicates values superseded by shared label styling.
- The full static quality gate passes after regenerating all eleven CSS-fingerprinted Welcome previews.

## 2026-10-10 — Shared transparency-control width

- Line and Grid transparency fields now use the same width token and one shared rule for their matching width, flex, min-width, and max-width values. Chrome verifies both computed controls remain 96px.

## 2026-10-10 — Component-owned corner radii

- Removed seven redundant corner-radius priorities from DataView, control-chip, Welcome, and workspace-toolbar rules. Chrome computed-style checks preserve their component-owned radii and the higher-specificity Welcome surface values.

## 2026-10-10 — Shared roomy content-padding token

- Added `--ui-content-padding-roomy` for the identical 12px/16px padding on the statistics advisor and four PCA card surfaces; computed spacing remains unchanged.

## 2026-10-10 — Shared select and paired-gap tokens

- Five native-select rules now use `--ui-select-padding`; five shared form/statistics layouts use the existing standard/wide gap tokens for their exact 8px by 12px spacing. Chrome computed-style coverage preserves all original values.

## 2026-10-10 — Static chart accessibility cleanup

- Shared chart navigation now keeps its concise plot name separate from keyboard guidance. Static SVG sanitization preserves chart names, removes keyboard-only focus/help attributes, and removes all semantics from transparent Heatmap hit layers. This prevents interactive controls from nesting inside clickable Welcome cards without changing visible marks.
- Regenerated all eleven preview SVGs. Exporter Jest coverage and the Chrome axe scan of Welcome and Heatmap pass. The dense-Scatter accessibility contract now distinguishes per-point stops from the valid keyboard-movable title, axes, and legend controls.

## 2026-10-10 — Workspace toolbar popup ownership

- Shared tab deactivation now closes workspace-toolbar menus inside the resolved owner root. Same-type Scatter switch-away/return behavior passes in installed Chrome, and the focused toolbar/lifecycle Jest suites pass 10/10.

## 2026-10-09 — Reading line-height token

- Added `--ui-line-height-reading: 1.5` for six identical reading-text declarations across Welcome, workspace dialogs, statistics, and PCA, preserving rendered values.
- An installed-Chrome selector probe confirms the 1.5 computed ratio for all six rules. Enlarged-text reflow and the static quality gate pass.

## 2026-10-09 — Formula suggestion combobox semantics

- The shared AG Grid formula editor now labels its cell input and links it to its body-portaled function listbox with combobox and active-descendant semantics.
- Arrow navigation updates selected/active option state. Escape closes suggestions without ending cell editing; Enter applies the active suggestion.

## 2026-10-10 — Shared font combobox keyboard model

- Font family and preset-size pickers now keep focus in their named input and expose unique active listbox options through `aria-activedescendant`.
- Arrow/Home/End navigation, Enter selection, Escape dismissal, and Tab exit are covered in Line and Scatter while the SVG text editor stays open.
- Same-type Line/Scatter tab changes close the font popup and keep it closed when returning to the original tab.
- Both installed-Chrome cases pass, as does the font-size no-spin regression; the full static quality gate passes with the refreshed preview assets.

## 2026-10-10 — Shared editable-combobox state

- Welcome search, formula suggestions, and shared font-family/font-size pickers now use one stateless helper for available options, active-descendant state, and keyboard movement. Filtering, popup lifetime, and selection remain specific to each control.
- Focused Chrome coverage passes 8/8; the shared DOM and font-owner Jest tests pass 14/14. The final static gate passes with 644 manifest rows, 921 explicit/0 inferred requirements, and 1,146 Chromium tests.

## 2026-10-10 — Color-scheme popup owner lifecycle

- The shared tab-deactivation path closes the owning tab's palette listbox and pending palette-choice dialog before switching owners.
- A test-first same-type Box regression and existing color-scheme/Scatter isolation checks pass 4/4 in Chrome; related Jest coverage passes 53/53.

## 2026-10-10 — Axis popup owner lifecycle

- Switching away closes the current owner's number-format listbox and axis-configuration popovers while preserving its axis panel configuration.
- The installed-Chrome axis, configuration-dialog, palette, and font-popup checks pass 10/10; axis-control Jest tests pass 21/21.

## 2026-10-10 — DataViews export-menu owner lifecycle

- Workspace deactivation now closes transient DataViews export menus in the explicitly resolved owner root before detaching it.
- Same-type Box and Line switch-away/return contracts and related axis, palette, AG Grid, font, and DataViews popup checks pass across 21 unique Chrome cases; DataViews export Jest tests pass 19/19. The static gate passes with 644 manifest rows, 923 explicit/0 inferred requirements, and 1,150 Chromium tests. Dependency audit confirms zero production findings and unchanged development-tool upgrade risks.

## 2026-10-10 — Shared CSS tokens and graph-popup lifecycle

- Added `--ui-content-padding-standard: 10px 16px` for repeated statistics and PCA content rules without changing computed spacing.
- `--ui-border-default` now serves 56 default-border declarations and the shared menu border. Twenty-nine neutral-gray border declarations now use the palette border token, and seven stronger control borders use existing strong-border tokens; disabled-state and icon colors remain specialized.
- Graph-options and nested axes-length disclosures now close on owner deactivation and restore closed from render-cache snapshots. Chrome archive/tab-owner coverage passes, the lifecycle/snapshot Jest tests pass 12/12, and the targeted CSS/JavaScript lint checks pass.
- The installed-Chrome computed-style contract passes for shared borders and standard content padding across representative Import, Stats, and Fit surfaces.

## 2026-10-10 — Reduced-motion runtime preference coverage

- Added Chrome coverage for changing reduced-motion preference after startup. The welcome carousel and workspace-tab controls switch from smooth to automatic scrolling, and CSS scroll behavior updates live.
- The reduced-motion scroll suite passes 3/3; the static quality gate passes with refreshed test inventory and preview assets.

## 2026-10-09 — Unit line-height token

- Added `--ui-line-height-unit: 1` for 23 exact compact-control declarations, preserving their rendered values. Chrome confirms the token and the 200% enlarged-text layout contract passes.
- The static quality gate passes with fresh Welcome thumbnails and the current test inventory.

## 2026-10-09 — Shared 16px spacing token

- Added `--ui-gap-spacious: 16px` and routed nine repeated layout gaps through it, preserving their existing value. The 11-workspace Chrome viewport matrix and static quality gate pass.

## 2026-10-09 — Color selection and filter-popup targets

- Removed the color picker’s checkmark selection overlay; selected swatches use the existing color ring and a system-color outline in forced-colors mode.
- AG Grid filter choices now have 24px row targets, and the filter popup scrolls within short viewport bounds. The combined Chrome menu and picker suites pass 17/17; the static quality gate passes with 643 manifest rows, 916 explicit requirements, 1,142 Chromium tests, and fresh thumbnails.

## 2026-10-09 — AG Grid filter-trigger popup relationship

- Column-filter triggers now expose the open dialog through `aria-expanded` and `aria-controls`, including when AG Grid recreates the header button. Popup closure clears state on both the original and current trigger.
- The installed-Chrome shared-menu suite passes 8/8 on rerun; the shared-grid Jest suite passes 23/23.

## 2026-10-09 — Comfortable control-height token

- Added `--ui-control-height-comfortable: 36px` for Welcome actions, search, gallery close, and import choices, preserving existing dimensions and the 44px narrow-screen overrides.
- Installed Chrome contracts verify the desktop and short-screen computed heights across the Welcome screen, gallery, and data-import prompt.

## 2026-10-09 — Shared menu-item padding token

- AG Grid context actions and Scatter point-menu items now share `--ui-menu-item-padding`, preserving the existing 6px/10px geometry.
- Their existing Chrome keyboard contracts assert the computed padding alongside menu targets, focus and viewport behavior.

## 2026-10-09 — Owner-safe native color-picker fallback

- Native color fallback results now share the color picker's owner/generation guard with EyeDropper. Deactivation removes the fallback input, and any result delivered to its detached input is ignored.
- The fallback uses `showPicker()` when available and calls the input directly when that API is missing. Chrome verifies stale-result rejection across same-type Box tabs; Jest verifies the missing-API click path.

## 2026-10-09 — Shared color-picker owner and async result

- Tab deactivation closes the shared color picker for that tab. Pending eyedropper results are discarded if the picker closes or is reused, preventing an old result from changing a later tab's color.
- A same-type Box Chrome regression verifies both behaviors.

## 2026-10-09 — Games–Howell many-group performance

- Games–Howell and Tukey reference analyses now calculate only their requested pairs. Games–Howell critical values deduplicate exact Welch degrees of freedom and use inverse-square-root-df secant estimates only to seed directly validated solves.
- Corrected high-group survival accuracy near one and advanced the numerical cache signature so affected older results are marked stale. Preserved the direct survival calculation after reduced quadrature orders exceeded SciPy and frozen-output tolerances.
- On Node v24.15 / 11th Gen Intel i5-1135G7, the heterogeneous 25-group case measured 7.77 s median (300 pairs, 300 distinct df); reference-only measured 0.74 s (24 pairs). The captured pre-change baseline was 31.41 s, a 4.0× improvement; the 5× target was not reached. Heterogeneous all-pairs medians were 13.19 s for 30 groups and 31.77 s for 50. The remaining cost is repeated direct studentized-range integration for distinct degrees of freedom.
- Added the broader 3/10/25/30/50-group benchmark, SciPy and frozen-output coverage, Games–Howell worker parity, and an actual UI selection assertion. The focused Box statistics archive-reopen test passes. The synchronous worker-failure fallback is tracked separately in `issues.txt`.

## 2026-10-09 — AG Grid context-menu owner lifecycle

- Shared workspace deactivation closes both the AG Grid context menu and column-filter popup owned by that tab.
- Same-type Scatter tab switching has a focused Chrome contract for both popup types. The 22-case owner-isolation/archive matrix and static quality gate pass.

## 2026-10-09 — Compact content spacing token

- Added one shared 8px-by-10px compact content padding token for seven repeated declarations and routed six exact 2px top offsets through the existing micro-spacing token. Rendered measurements are unchanged.

## 2026-10-09 — Divider endpoints and point-label archive restore

- Verified pointer dragging reaches both workspace edges and both collapsed divider states survive `.graph` reopen. The separator supports the full 0–100% range.
- Archive JSON/CSV conversion dropped non-enumerable matrix signatures and invalidated otherwise complete render caches. Tab metadata now preserves and rehomes those signatures before cache validation; Scatter/PCA 3D title bindings now serialize the metrics and owner needed for interaction rebind.
- Installed Chrome passes six focused divider, label-toggle, 2D/3D cache-reopen cases. Seven focused Jest suites pass 146/146.

## 2026-10-09 — Keyboard panel and SVG movement

- Added full-range 0–100% pointer and keyboard resizing to all shared table/graph dividers, including true collapsed endpoints. The owner-scoped split overrides graph-frame width locks; stacked layouts retain vertical geometry, and collapsed panes leave the focus order.
- Arrow-key movement remains available for SVG labels and legends. Graph-title position survives archive reopen across all eleven components, Cartesian axis-title position across seven, and Venn text-label movement after owner-safe rebind; Pie legend movement also has archive coverage. Chrome verifies divider endpoints in all eleven workspaces and both collapsed endpoints after Scatter reopen. The focused title, axis-label, Venn-label, and legend cases pass 21/21; the shared helper/lifecycle Jest contracts pass 42/42.
- Divider projection now clears inert, hidden, and visibility state idempotently during restore. Prevented SVG movement keys from bubbling into chart navigation, which had taken focus after graph redraw.
## 2026-10-09 — Shared 3D keyboard rotation

- Added Shift+Arrow rotation through the existing owner-scoped 3D gesture callbacks. Scatter, PCA and Line reuse their named chart tab stop; Surface exposes a named SVG keyboard target with visible focus.
- Installed Chrome covers all four 3D components (4/4) plus six existing rotation/tab-switch/reopen/recovery checks; the shared Jest contracts pass 19/19. The all-workspace graph-control typography contract passes 11/11, including Heatmap Decimals and Clustering method at the 13px standard.

## 2026-10-09 — Shared 8px spacing token

- Added `--ui-space-standard: 8px`, kept `--ui-gap-standard` as its alias, and routed 24 exact padding, margin, and column-gap values through the shared token without changing rendered geometry.
- Installed Chrome confirms the token and four mounted Heatmap/table spacing values compute to 8px. `npm run quality:static` passes with 640 manifest rows, 903 explicit/0 inferred requirements, 1,098 Chromium tests, and 11 fresh thumbnails.

## 2026-10-09 — Keyboard graph resizing and Heatmap typography

- Added native, labeled width and height controls to every graph options menu. They share the pointer resize transaction and preserve live rendering, owner checks, undo, and captured layout.
- Added a shared graph-panel label rule that uses each panel’s graph-control font token; Heatmap lower controls use the same size. This fixes the global 16px label override, including Decimals and Clustering method.
- Installed Chrome passes all eleven graph-control font checks and all eleven keyboard-resize cases; the all-component drag-resize undo/redo contract also passes.

## 2026-10-09 — Axis control cascade

- Consolidated the Additional ticks and Break axis metrics into one shared rule after the generic button defaults, removing duplicate declarations and seven unnecessary priority flags.
- The Chrome Axis dialog contract now checks both rendered action controls against their shared height, spacing, and typography tokens; all three dialog/focus tests pass.

## 2026-10-09 — Box draw-cache normalization

- Box live runtime normalization now retains its tab-owned draw cache instead of deep-cloning thousands of point values on every read. New runtime records still clone the cache, preserving tab isolation.
- The reduced-motion cancellation/retry contract now checks browser event-loop responsiveness; it passes three repeated Chrome runs. Box same-component isolation and archive reopen pass 2/2.

## 2026-10-09 — Statistics fieldset cascade

- Removed an unnecessary priority from the shared statistics fieldset radius while retaining its clipping behavior.
- Added a computed-style contract across all ten statistics workspaces; the Chrome accessibility/contrast/target suite passes before and after the cleanup.

## 2026-10-09 — Compact control padding token

- Routed nine repeated compact form-control paddings through the existing token, keeping the status badge's independent spacing literal.

## 2026-10-09 — Select and microtype cascade

- Removed duplicate selected/hovered option colors from the customizable-select block; Chrome confirms the base picker colors and keyboard behavior remain intact.
- Added a 10px microtype token for eight repeated interface labels, preserving their current size.

## 2026-10-09 — Line axis dialog test timing

- Gave the two Line axis dialog tests 60 seconds for component startup after they repeatedly approached the 30-second default; all three checks pass without changing assertions.

## 2026-10-09 — CSS cascade and Box audit wording

- Removed the unused symbol-fill/border centering rule after Chrome confirmed the shared flex field centers both color inputs and swatches without it; this retires two `!important` declarations.
- Removed duplicate Axis popup surface overrides after Chrome confirmed both dialogs retain their rendered surface, keyboard entry, focus return and short-screen fit; the focused suite passes 3/3.
- Corrected Box paired-exclusion audit-note grammar and aligned the advisor test with its automatic post-hoc resolution contract. Focused Jest passes 11/11, the Chrome color-picker/toolbar suite passes 7/7, and `npm run quality:static` passes.

## 2026-10-09 — Focus helper supports non-browser test bootstrap

- The shared focus-modality helper now defaults to keyboard mode when loaded without a browser document, keeping Node-based production-module tests compatible with the browser-only listener.
- Added a focused bootstrap contract and relaxed the Axis CSS source assertion to accept the valid optional final semicolon. Four targeted Jest suites pass 6/6.

## 2026-10-09 — DataViews focus continuity

- DataViews tab rerenders now restore keyboard focus by logical identity; closing the selected view places focus on the active view.
- The new Chrome keyboard contract and 19 DataViews DOM tests pass. The shared ownership/archive batch passed 20/20, with the Surface archive case passing on isolated rerun.

## 2026-10-09 — Conditional visibility inventory closed

- Box, PCA, Line, ROC, Scatter, Survival, and Venn conditional form/control families now use semantic `hidden` state. The remaining component `style.display` writers are rendering, mark visibility, tooltips, or temporary formatting overlays.
- Box grouped-stat rows now use named stylesheet classes and existing spacing/font tokens instead of inline layout styles.
- Installed Chrome passes the all-workspace pointer-focus sweep and 18 targeted transition/reopen/ownership checks. `npm run quality:static` passes with 636 manifest rows, 898 explicit/0 inferred requirements, 1,058 Chromium tests, and 11 fresh thumbnails.

## 2026-10-09 — Shared hidden-state authority

- A single global `[hidden]` rule now overrides component display selectors. This fixes ROC's hidden comparison label being rendered by the shared stats-label `display:inline-flex` rule and retires 28 duplicate hidden selectors, including 17 unnecessary `!important` declarations.
- ROC comparison controls now toggle native `hidden`. Installed Chrome passes 26/26 across the full workspace accessibility matrix, Box/Line/ROC visibility and reopen paths, grouped controls, and modal lifecycle.

## 2026-10-09 — Box conditional control visibility

- Box summary, point-mode, and custom-whisker controls now use native `hidden` state, including after restore. Removed two unreachable DOM hooks after confirming no markup or runtime builders exist; the saved error-bar width remains used by rendering. Focused Box/Line/grouped-control Chrome tests pass 4/4; UI lint and Box/Line ESLint pass.

## 2026-10-09 — Line forecast visibility authority

- Line forecast controls now use the fieldset's native `hidden` state across regression modes. A focused Chrome contract verifies Linear, ARIMA, and Holt-Winters transitions without inline display styles; it passes alongside grouped-controls coverage (2/2).

## 2026-10-09 — Grouped-table control visibility

- Box, PCA, Line, and Scatter grouped input panels now use the native `hidden` property plus matching ARIA state. Their CSS previously overrode the stale `u-hidden` class, so component code depended on inline `display` writes. A shared hidden-state selector replaces those writers.
- Installed Chrome verifies standard/grouped transitions across all four; Box and PCA tab-isolation/archive-reopen contracts pass. The cross-component regression passed after failing on the old mixed state. `npm run quality:static` passes with 634 manifest rows, 895 explicit/0 inferred requirements, 1,056 Chromium tests, and 11 fresh thumbnails.

## 2026-10-09 — Box significance visibility authority

- Box significance controls now use the `hidden` property as their only visibility state. Their ID-scoped flex style had overridden the browser's hidden style, so CSS now explicitly hides the element when the attribute is present and runtime inline `display` writes are removed.
- Chrome verifies single/grouped transitions, no inline display value, and restored grouped visibility after archive reopen; the Box conditional-control suite passes 2/2. `npm run quality:static` passes with 633 manifest rows, 894 explicit/0 inferred requirements, 1,055 Chromium tests discovered, and 11 fresh thumbnails.

## 2026-10-09 — Open-file-safe welcome thumbnail publishing

- Thumbnail publishing now falls back to copying a staged file when Windows denies renaming a served thumbnail, while preserving manifest-last promotion and rollback. The path is covered for open-directory and open-file cases.
- Installed Chrome regenerated all eleven CSS-fingerprinted thumbnails while the local server remained open. Publisher tests pass 12/12, and `npm run quality:static` passes.

## 2026-10-09 — Pointer focus token precedence

- Pointer modality now disables the shared focus-outline token at the root so higher-specificity value-field focus rules cannot restore a click ring. Keyboard modality retains visible focus.
- A fresh installed-Chrome run on `127.0.0.1:5500` confirms the graph select, checkbox, X max field and custom formula field stay ring-free after pointer clicks, including Chrome's `:focus-visible` text-field state.
- Installed Chrome passes the repeated-click/formula tests (2/2) and the all-workspace value-field sweep (1/1). No Firefox tests were run.
- Regenerated all eleven CSS-fingerprinted thumbnails; `npm run quality:static` passes with 633 manifest rows, 894 explicit/0 inferred requirements, 1,055 Chromium tests, and 11 fresh thumbnails.

## 2026-10-09 — Customizable native select verification

- Added installed-Chrome coverage for the themed native picker, pointer open/Escape, keyboard open/navigation/selection, and visible keyboard focus. The focused contract passes 1/1; the inventory reports 633 manifest rows and 1,055 Chromium tests; `npm run quality:static` passes with 894 explicit/0 inferred requirements and 11 fresh thumbnails. Unsupported browsers retain the native keyboard path.

## 2026-10-09 — Windows-safe welcome asset publishing

- Welcome thumbnail publication now promotes staged files into the existing asset directory, with `manifest.json` last and rollback on promotion failure. It no longer renames the directory used by the development server.
- Chrome coverage at 1920×1080 enters `-8` in Scatter X max, double-clicks it and the open Custom formula field, and compares focus and border styling. A fresh visit to the exact Live Server URL confirms unchanged field borders, outlines, and shadows. The expanded real-pointer sweep passes across all eleven workspaces.
- Reused the panel border color token for Welcome panels/cards, configuration panels, graph frames, and the shared color picker without changing rendered border values.
- Routed 56 vertical margins at 4px, 6px, 8px, and 12px through the existing spacing tokens without changing their computed values.
- The publisher tests pass 11/11, the focused installed-Chrome accessibility contract passes, and `npm run quality:static` passes with 633 manifest rows, 892 explicit/0 inferred requirements, 1,052 Chromium tests, and 11 fresh thumbnails. No Firefox tests were run.
- The drag audit confirms graph-edge handles and panel split dividers are hidden from accessibility APIs, and shared SVG label/legend movement has no keyboard route. The session-safe interaction work and remaining chart-selection audit are tracked separately in `issues.txt`.

## 2026-10-09 — Repeated-click focus and semantic overlay layers

- Pointer focus cleanup now covers body-level controls, and the Welcome search uses its accent border only for keyboard focus. Chrome coverage compares computed styles after repeated clicks, including typing `-8` in Scatter X max; the all-workspace value-control audit still passes and keyboard focus remains visible.
- Replaced eight global overlay z-index values with semantic CSS tokens. `Shared.toolbarOverflow` reads the floating-overlay token for its default and preserves explicit per-popup overrides.
- Chrome focus checks pass 2/2, modal and toolbar-overflow checks pass 9/9, and toolbar-overflow Jest checks pass 9/9. UI lint and ESLint pass. No Firefox tests were run.

## 2026-10-09 — Pointer focus rings and touch grid targets

- Fixed pointer focus at the shared CSS boundary: controls no longer gain focus outlines, AG Grid checkbox wrapper shadows, teal stats-field borders, or a focus ring on the body-ported color-picker hex field after clicks. A follow-up also fixed pointer highlights on the Notes editor, graph zoom value, and body-ported AG Grid filter fields. Keyboard focus remains visible.
- A numeric-filter regression exposed the deferred AG Grid `input[class^=ag-]:focus` rule overriding the portaled value field. Portal-scoped selectors now win by specificity without restoring eight `!important` flags; shared axis-field styling applies only to keyboard focus. Eight duplicate base declarations were removed from the visible-state rule. Chrome verifies single-value, between-value, hidden, pointer, and keyboard filter states.
- AG Grid keeps one fixed 20px row layout across all eleven workspaces and pointer types; compact row-checkbox targets remain below 24px.
- The updated all-workspace value-field contract passes in Chrome, including Notes, graph zoom, and portaled AG Grid filters. In the 39-case accessibility/picker batch, two unrelated keyboard cases timed out under four-worker load; both pass when rerun serially. No Firefox tests were run.

## 2026-10-08 — AG Grid selection and focus states

- Restored the 2px AG Grid selected-range border in the existing teal-green theme. Removing the late rule that hid all selection edges also restores the pinned-row perimeter; Chrome verifies real pointer selection, range-fill borders, and scrollbar behavior.
- Kept compact 20px data rows separate from 24px header actions.
- Removed focus rings from pointer-clicked controls while preserving keyboard focus indicators; Chrome verifies the dropdown and checkbox behavior.
- Chrome also exposed rings on pointer-focused text and number fields, including fields focused by an action button. A shared input-modality helper fixes all app controls; regression coverage verifies typed/adjusted values remain ring-free and keyboard-opened fields keep visible focus.
- A Chrome pass focused every visible input, select, and textarea across all eleven graph workspaces; none retained a pointer ring or shadow. Text editing keeps pointer modality, while keyboard navigation continues to expose focus cues.
- The full Chrome accessibility and AG Grid selection suite passes 14/14. It reviewed 456 controls, reported 23 visible 20px-row checkboxes as the sole tracked target-size debt, and found no other undersized controls.
- All eleven component resize contracts pass horizontal and vertical growth/shrink with visible marks throughout. The final static gate passes with 633 manifest rows, 891 explicit/0 inferred requirements, 1,050 discovered Chromium tests, and 11 fresh thumbnails.

## 2026-10-08 — Responsive graph-options popup

- The shared graph-options menu now stays within short viewports, scrolls oversized contents internally, and reclamps on scrolling, resizing, and content-size changes. A Chrome regression covers 320×400 bounds and 24px control targets.
- Focused Jest checks pass 32/32; Heatmap resize/menu checks pass 4/4; Box/Line expanded menu checks pass 2/2. The static gate passes with 633 manifest files, 889 explicit/0 inferred requirements, and 1,046 Chromium tests; Firefox was not run.

## 2026-10-08 — Box statistical cache-version coverage

- Post-hoc resolver metadata now versions Tukey, Games–Howell, and Nemenyi results whenever their studentized-range implementation applies, including reference comparisons.
- Passive reconciliation preserves the signature of the procedure that produced saved results. A legacy result invalidated by a cache-version-only change remains available as stale report/table history; old graph annotations are suppressed until recalculation.
- Added resolver/signature coverage and a legacy-payload restore regression for retained stale results. Existing two-tab isolation and save/reopen regressions cover ownership and persistence.

## 2026-10-08 — Box ANOVA post-hoc statistics

- New Box sessions request automatic post-hoc selection: Tukey HSD for classic ANOVA and Games–Howell for Welch ANOVA, including their lognormal variants. Added ANOVA residual-MSE pooled t-tests with separately corrected p-values, and kept requested procedures stable through results and reopen.
- Reports now describe the executed variance estimator, degrees of freedom, correction, CI coverage/type, and effective alternative. Tukey/Games–Howell intervals use the selected CI level; tighter finite-df integration matches unequal-size SciPy references. Games–Howell preserves zero group variance exactly.
- Focused Jest checks pass for selection, compatibility, report thresholds, restore, and same-type tab isolation; unequal-size Tukey/Games–Howell references pass. ESLint passes for both Box statistics source files.

## 2026-10-08 — Box studentized-range accuracy and performance

- Replaced nested CDF subtraction with direct survival evaluation using a normal-range/chi-square mixture, stable tail integration, and safeguarded critical-value inversion. Tukey, Games–Howell, and Nemenyi use the shared evaluator; zero-variance handling is unchanged.
- Added SciPy-oracle coverage for fractional and infinite degrees of freedom, extreme tails, inverse values, Games–Howell intervals, Nemenyi scaling, and the BRCA1 Tukey case. Large post-hoc jobs now use the existing owner-scoped stats worker.
- A focused Node v24.15 benchmark measured 10-group Games–Howell medians of 0.934 s (95% CI) and 1.836 s (99% CI), with all 45 comparisons returned. The plan's 16.29 s 95% figure is historical; a same-script run against the old HEAD exceeded two minutes without completing its warm-up and repetitions, so no paired speedup is claimed. The 25-group/300-pair case completed in about 29 s and is dispatched to the existing worker.

## 2026-10-08 — CSS and HTML quality follow-up

- Added `--ui-font-size-base: 13px` and routed 47 direct declarations, eight graph-control fallbacks, and three graph-control defaults through it. The rendered Chrome document-title check remains 13px; CSS lint passes.
- Added `--ui-font-size-medium: 14px` and routed all 27 exact interface declarations through it. The rendered Chrome Welcome text remains 14px; CSS/HTML lint and the test-inventory check pass.
- Regenerated all 11 welcome thumbnails after `boxStatsModel.js` settled. The complete static quality gate now passes with 633 manifest rows, 885 explicit/0 inferred requirements, and 1,045 discovered Chromium tests; no Firefox tests were run.
- Replaced the important control-radius catch-all with a zero-specificity default so component-owned tab and surface radii win naturally; removed seventeen redundant radius priorities after rendered checks. Chrome shape checks and the all-component 99-pair layout contract pass.
- Routed 41 repeated line-height declarations through three exact-value tokens; UI lint and the 99-case Chrome layout check pass with geometry unchanged.
- Removed nine redundant Welcome radius-selector aliases after verifying their retained `#welcomeScreen` selectors cover the same live elements; CSS/HTML lint and the Chrome picker contract pass.
- Replaced paired AG Grid grouped-seam border priorities with shared left/right edge-color variables. Chrome verifies five grouped-header modes, selected-fill borders, pinned-row scrolling, all-component SVG export and the 99-case page-layout contract.
- Consolidated all 76 exact 12px interface font declarations under `--ui-font-size-small`, with the control-font token aliasing it. CSS/HTML lint, Chrome 200% zoom/enlarged-text, WCAG text-spacing and responsive checks, and all 11 refreshed thumbnail checks pass.
- Removed one redundant important radius from shared color-picker controls; scoped selectors preserve their 5px computed radius. Chrome picker and Box style checks pass 13/13.
- Replaced the workspace-tab radius shorthand and four duplicate corner overrides with one non-important declaration; Chrome confirms the square radius and tab rename/reorder behavior passes 3/3.
- Removed the duplicate high-specificity text-field radius rule so component-owned square controls win without priority. Seven radius priorities were retired; six focused Chrome checks cover Axis, Font, Box, PCA, and Venn computed styles.
- Continued shared color tokenization: nine repeated muted-text, border, and muted-header values now use existing semantic tokens; specialized disabled/icon colors remain explicit.
- Added four exact-value UI spacing tokens and routed 197 repeated `gap` declarations through them. Chrome confirms the graph settings panel stays right of the complete graph-and-Notes stack at all 99 component/viewport pairs, including the supplied desktop size. Workspace accessibility, color-scheme keyboard, and layout checks pass 14/14; `quality:static` passes with 632 manifest rows and 1,042 Chromium tests discovered. Firefox was not run.
- Box conditional controls now use semantic `hidden` state and restore their visibility after archive reopen. Removed five duplicate CSS rules/declaration sets after confirming their surviving rules preserve computed values.
- Google Chrome Box visibility/reopen checks pass 2/2; the all-component viewport matrix passes 3/3 and actual 200% browser zoom passes across all workspaces. `npm run quality:static` passes with 628 mapped files and 1,034 discovered Chromium tests.
- Open-mode, replace-unsaved, and duplicate prompts, the workspace-tab context menu, and an overflowed toolbar menu pass short-screen bounds checks at 320×400; no CSS correction was needed.
- Targeted Chrome accessibility, picker, modal, menu, Box and responsive checks pass 41/41; focused keyboard Jest suites pass 13/13. The mounted axe scan reports zero violations across Welcome and all eleven components.
- DataViews export-menu keyboard behavior now also asserts that the menu remains inside a 320×400 viewport; all three shared-menu Chrome checks pass.
- PCA and Scatter now share viewport-aware point-menu placement. A Chrome regression reproduced both menus outside the right edge at 320×400; all six point/shared-menu browser checks and the focused Jest suite pass after the fix.
- The narrow-screen Font toolbar now keeps controls in the horizontal overflow row instead of stacking them beyond its short viewport. Family and preset-size listboxes stay reachable at 320×400. A handled Escape closes the open listbox without dismissing the enclosing text editor; Line and Scatter Chrome checks verify both states.
- PCA activation and method-change visibility writes now use the same native `hidden` setter; the focused Chrome method/3D contract passes without inline display overrides.
- Removed the stale dark-scheme color-picker override from the light-only interface. A test-first Chrome contract confirmed that dark OS preference changed picker padding and colors despite `color-scheme: light`; light and dark preferences now render the same picker style.
- Added `--ui-font-size-xsmall: 11px` and routed 58 exact compact-interface font declarations through it. Chrome computed-style checks retain 11px for the shared picker and section title; CSS lint passes.
- Welcome graph-search results now use the shared anchored-popup placer, which chooses available space and limits popup height; Chrome verifies short-screen bounds, resize repositioning, and pointer selection. The old local placement and duplicate resize listener were removed.
- The Box color-scheme listbox now stays inside a short viewport, supports arrow/Home/End navigation, and returns focus on Escape. Shared popup width placement now constrains percentage minimums, and restored menus resolve owners from the live DOM.
- The shared Axis number-format listbox now has an explicit trigger-to-popup `aria-controls` relationship, covered by a 320×400 Chrome keyboard/focus regression.
- The Axis Additional ticks and Break axis popups now expose named, linked dialogs and enter their first enabled control; Escape restores trigger focus. Chrome checks cover both dialogs at 320×400.
- Graph and settings panels stay side by side, with controls reflowing inside the settings panel at enlarged text sizes. Narrow Surface keeps the same order in a contained horizontal scroll area. Chrome 200% UI-text and 88 component/viewport checks assert settings remain to the right of the complete graph-and-Notes stack. Native OS text scaling and assistive-technology review remain open.
- The static quality gate passes after refreshing thumbnail provenance and regenerating architecture, component, and test inventory documents.
- Removed nine ineffective narrow-width grid declarations from component wrappers that use flex layout; Chrome verifies flex display, graph/settings order and no page overflow across 88 component/viewport pairs.
- Removed 14 redundant AG Grid resize-handle and five grouped-header overflow `!important` flags after checking vendor order and computed styles. Kept the 20 seam-border flags because the shared cell-border rule is also important. Chrome grouped-header/resize checks pass 10/10; Stylelint passes.
- Refreshed all 11 CSS-fingerprinted welcome thumbnails; `npm run quality:static` passes with 632 manifest rows and 1,042 Chromium tests discovered.
- Chromium keyboard coverage now verifies that an AG Grid header retains the visible application focus outline while vendor separator/focus pseudos stay suppressed; the three-case chart/grid keyboard suite passes.
- The static quality gate also passes after the focus audit and CSS-fingerprinted thumbnail refresh (632 manifest rows; 1,042 Chromium tests discovered).
- Routed 43 repeated UI surface backgrounds/fallbacks and 15 exact-ink foreground/icon/border declarations through `--gt-surface` and `--gt-ink` without changing rendered colors. Kept plot canvases and intentional contrast accents separate. Chrome workspace accessibility/color-scheme checks pass 11/11; refreshed thumbnails and the static gate pass.
- Documented the CSS source-order, deferred AG Grid sheets, conditional branches and runtime inline-style owners in `ARCHITECTURE.md` as the starting point for the remaining cascade audit.
- After regenerating thumbnails with installed Chrome, the final 200% UI-text check passes and `npm run quality:static` passes with 632 test-manifest rows and 1,042 Chromium tests discovered.
- Replaced a stale stats-export test selector that skipped liveness checks with the current native select controls and a real CSV download after reopen/recovery; Chrome passes all nine archive-reopen cases and both Box/ROC recovery cases (11/11).
- Added the 10px shared gap token; five `--ui-gap-*` tokens now cover 217 gap declarations. Ten 26px control heights reuse the existing control/color-input tokens, preserving the toolbar's 24px scope.
- Chrome pointer-target audits now measure the Box color-scheme and formula-assist listboxes. The formula-assist check exposed 23px options; they now use the shared 26px control height. Both popup contracts pass, along with the full component viewport matrix.
- The final CSS/HTML static gate passes with 633 manifest rows, 886 explicit/0 inferred requirements, 1,045 Chromium tests, and 11 fresh thumbnails. Firefox tests were not run.
- A rendered Chrome check found the shared graph-options trigger was 20×20px. It now uses the shared 26px control-height token; the trigger and available Lock ratio controls pass 24px checks across all eleven graph workspaces.
- The combined Heatmap and all-workspace Chrome batch passes 15/15. `npm run quality:static` passes with 633 manifest rows, 888 explicit/0 inferred requirements, 1,045 Chromium tests, and 11 fresh thumbnails. Firefox was not run.
- The rendered graph-options scan now measures visible title, legend and axis-length rows as well as the trigger and Lock ratio label; focused Box and Line Chrome cases pass 2/2.

## 2026-10-08 — Box conditional visibility

- Replaced all nine inline Box control-visibility styles with native `hidden` attributes and property-based updates, including graph-type, table-format, and restore paths. Removed the stale `u-hidden` class from the grouped layout control.
- The Chromium contract now checks semantic hidden state as well as rendered visibility. Box conditional and example-control checks pass 4/4; `quality:static` passes with zero static inline style attributes and fresh thumbnails.

## 2026-10-08 — Box preview and cascade review

- Box previews now select the committed frame for their owner, so a staged or hidden SVG cannot replace the visible graph in previews. Updated the cache fixtures to carry current owner, render-geometry, and SVG identity metadata.
- Removed exact duplicate Box checkbox and select/menu radius declarations, and routed tab drag/reorder diagnostics through the shared debug gate. Corrected the AG Grid drag-grip contract and loaded the shared modal lifecycle in document-open tests.
- Refreshed all CSS-fingerprinted welcome thumbnails. Validation: `quality:static` passes; 20 targeted DOM suites pass 299/299; Chrome preview, inactive-owner, and tab-reorder checks pass 23/23. Firefox was not run.

## 2026-10-08 — Open color-picker accessibility

- Fixed the shared body-ported picker: expanded palettes fit short phone screens, swatches have adequate spacing, Escape restores trigger focus without dismissing the Format toolbar, and selected colors expose a visible cue plus `aria-pressed` state. Recent-color swatches follow the same owner; pointer dismissal keeps its existing behavior.
- Removed unreachable app-shell picker overrides and the redundant selected-button mirror. The selected state now projects through the existing swatch registry.
- A narrow-screen pointer check found the document title obscured and intercepted Format tabs below 460px. The header now places the title/status row below the tabs while preserving the full filename; all eleven component Format tabs pass real hit-target checks.
- Replaced all 42 active numbered `idx-inline-*` hooks with descriptive utility/component classes after tracing static markup, runtime builders and cache boundaries. Consolidated stats help/correction spacing and action-row styles; removed one status class overridden by ID-level rules.
- Added a rendered Chromium contract for Box's conditional graph controls and grouped/single table modes. The initial transition review found no visual mismatch; the nine initial inline display values were later migrated to semantic `hidden` state (see the Box conditional visibility entry).
- Optimized the reduced-motion resize test monitor to inspect direct published-frame swaps and stop after finding a visible witness mark. It retains the same growth, shrink and visible-frame assertions; the full all-component Chromium resize contract now passes 11/11, including Heatmap.
- Validation: picker/toolbar checks pass 6/6 Chromium; all-workspace accessibility and responsive checks pass 11/11 with zero axe violations; graph frame/split reopen passes 11/11; reduced-motion resize passes 11/11. The Box control transition contract passes 1/1 Chromium. `npm run quality:static` passes with 628 mapped test files and fresh thumbnails. Firefox was not run per the user's instruction.

## 2026-10-08 — Reduced-motion graph resize regression

- Fixed the uncommitted global reduced-motion rule that added a nonzero transition duration to every element. Its implicit `transition-property: all` animated graph width and SVG visibility: synchronous panel sizing read the old width and reversed horizontal drags, while published replacement frames briefly remained hidden.
- Set reduced-motion transitions to zero duration. Existing graph rendering, dense previews, tab ownership, and saved sizing contracts remain intact. The user confirmed the resize issue is fixed.
- Added an explicit all-eleven-component browser contract for expansion and shrinking on both axes, visible marks at publication and during drag, and stable size after release. The original Survival regression failed with zero horizontal growth; changing only this CSS declaration restored growth and eliminated all 20 hidden publications observed during a vertical drag in installed Chrome.
- Validation: all 11 Chromium component resize regressions pass, as do focused ESLint, CSS/HTML lint, testing-inventory validation (626 rows), refreshed welcome-thumbnail validation, and whitespace checks. No full application suite was run for this correction.

## 2026-10-08 — CSS/HTML quality follow-up

- Added one named keyboard entry for PCA and Scatter plots, owner-safe point navigation, and component-specific names on all eleven shared data grids used by dense-plot keyboard fallback.
- Static SVG export strips live point-button focus semantics; regenerated PCA welcome artwork is no longer focusable inside its example button.
- Added Chromium/Firefox coverage for shared toolbar-menu keyboard navigation and focus return. Corrected the shared control-radius cascade so toolbar overflow arrows retain their square corners.
- Added shared Arrow/Home/End focus navigation to Venn, Box, and Pie result tablists. Enter/Space continue through the components' existing owner-scoped activation handlers.
- PCA and Scatter chart points now receive button semantics and labels only while keyboard-focused, avoiding repeated per-point DOM attribute writes during redraws such as live resize.
- Gated shared resizer/layout and Scatter/Line/ROC resize-callback debug logs behind the debug setting to remove per-pointer-move console work. No graph geometry or render behavior changed.
- Added shared keyboard behavior to workspace-tab, DataViews export, PCA point and Scatter point menus. PCA/Scatter menu actions preserve the originating owner and restore focus after the redraw replaces the source mark.
- DataViews export actions now return focus to the Save trigger after the menu closes. The Welcome gallery desktop panel keeps its five-card row while remaining within the phone viewport after box sizing.
- Dense Scatter's keyboard grid entry now keeps the selected cell's focus outline visible; the CSS selection fill no longer hides keyboard focus. Chromium and Firefox verify Tab entry, navigation, and the visible cue.
- Shared AG Grid main and pinned-row horizontal scroll areas now accept keyboard focus, keep the vendor's grid-child roles intact, and retain visual column alignment through the shared horizontal scrollbar.
- The all-eleven-component axe scan passes in Chromium and Firefox after the AG Grid scroll-area change; focused keyboard entry, point navigation, and pinned-row scroll alignment pass in Chromium.
- Removed the runtime Google Fonts request and kept the shared system-font fallback, so browser and offline desktop builds use the same available font resources.
- The focused live-resize regression batch passes 14/14 across Chromium and Firefox for dense Scatter, Surface and UpSet. The reported resize failure remains open because this matrix does not reproduce it.
- `npm run quality:static` passes after refreshing the CSS-fingerprinted thumbnails; 624 manifest rows and 1,012 Chromium tests are current.
- Current follow-up: mounted axe scans pass on all eleven components in Chromium and Firefox; the shared-grid Jest checks pass 12/12, and the combined graph-resize/grid-keyboard batch passes 28/28 across both browsers. The 9-case graph resize matrix passes in each browser, but the reported hide/stutter remains open without its exact reproduction sequence.
- Refreshed the testing inventory and all eleven CSS-fingerprinted welcome thumbnails; `npm run quality:static` passes with 624 manifest rows and 1,013 Chromium tests discovered.
- Validation: result-tab keyboard Jest 5/5; rendered result-tab tests 3/3 in each of Chromium and Firefox; toolbar keyboard Jest 4/4; toolbar overflow Chromium 3/3; resizer/layout Jest 15/15; menu Jest 23/23; shared-menu/point-action E2E 4/4 in each of Chromium and Firefox; all-workspace accessibility Chromium 7/7; 12 existing Chromium live-resize cases pass, with the user's reported hide/stutter still unreproduced; `npm run quality:static` passed with 622 manifest rows and fresh generated assets.
- Follow-up validation: the 100-case Chromium/Firefox accessibility, viewport, modal, workspace and live-resize batch passed 98 cases; only the desktop gallery's fifth-card layout failed, and that width regression is fixed. The focused gallery/modal/menu checks pass 8/8 in Chromium and Firefox; DataViews export Jest passes 19/19. The reported live-resize behavior remains unreproduced.
- Reproduced and fixed dense-plot resize stalls at the shared scheduling boundary. Canvas-backed or very dense graphs scale their last published SVG/canvas during pointer movement and commit a final draw on release; standard plots retain live axis redraw. The focused Chromium/Firefox resize matrix passes 18/18.
- The all-component Chromium/Firefox axe scan now reviews computed text/SVG foreground colors against resolved solid backgrounds (234/303 axe-incomplete text nodes; minimum 9.51:1) and checks Firefox's 69 embedded select carets against the 3:1 non-text threshold. Complex graph-text overlap and alternate interaction states remain open visual checks.
- Added a WCAG text-spacing override contract for the welcome dialogs and all eleven workspaces at 320px; Chromium and Firefox pass. The all-component forced-colors state test now has a scope-appropriate timeout and passes in both browsers.

## 2026-10-08 — Shared modal lifecycle and dialog sizing

- Added `Shared.modalLifecycle` for stacked dialogs, focus containment/restoration, background inerting, scroll locking, and per-flow Escape policy; migrated the gallery, import/open prompts, duplicate/unsaved prompts, Style Sync, and document-open overlay. Linked dialog descriptions in source.
- Corrected Style Sync's stale form selector so its scroll area shrinks within the panel and the Apply action stays in the viewport. Updated reduced-motion and carousel target assertions to match current behavior.
- Validation: shared modal Jest 2/2; Chromium modal/document/unsaved/Style Sync 11/11; Firefox modal suite 6/6 and document-open 3/3; the new gallery/import 320×400 geometry checks pass in Chromium and Firefox; focused Welcome smoke 1/1. `npm run quality:static` passed with 616 manifest rows, 998 Chromium tests discovered, and fresh generated assets/docs.

## 2026-10-05 — HOT table UI-state boundary

- Extracted table viewport, scroll, selection, column-width capture/restore, and component hook construction into `js/shared/hotUiStateAdapter.js`. `Shared.hot` remains the public facade and retains owner resolution; no payload or archive shape changed.
- Validation: nine focused Jest suites / 112 tests passed; all 11 same-type Chromium switching cases and 3 inactive-owner capture cases passed. Generated architecture/component/test maps and welcome assets are fresh; `npm run quality:static` passed.

## 2026-10-05 — Component persistence witnesses

- Corrected the shared persistence driver to read owner sessions and state-model hooks from loaded component modules instead of the public workspace facades. Exposed the existing displayed-color-scheme resolver through the read-only `Shared.colorSchemes` API so the Heatmap selector is checked against its actual custom-palette behavior.
- Added explicit change-impact coverage requiring unit, DOM, and all-component archive-matrix checks for the shared witness paths. Closed the Heatmap witness issue after all 11 Chromium persistence/reopen cases passed; four focused Jest suites passed (76 tests).

## 2026-10-04 — Welcome preview provenance refresh

- Regenerated welcome-example provenance after the current HTML/CSS source edits. The manifest fingerprint was refreshed; all 11 SVG previews remained byte-identical. `npm run quality:static` now passes its asset and inventory gates.

## 2026-10-04 — Heatmap value-scale stats regression coverage

- Strengthened Heatmap integration checks to require custom scale bounds in the exact owner session and the rendered stats panel after full and view-only redraws. Both focused cases pass; no production or archive-format change was needed.

## 2026-10-04 — Box grouped example session state

- Loading the grouped Box example now commits its normalized headers to the exact owner session, preventing stale group and condition labels after replacement. Blank Group 3/4 cells remain because the shared table contract preserves at least 12 editable columns.
- Validation: focused Box integration regression passed; grouped duplicate/reload/preview Chromium spec passed 3/3.

## 2026-10-02 — Scatter density smoothing

- Replaced cell-dependent box averaging with Gaussian density smoothing shared by the worker and main thread. Linear grid deposition and interpolation remove cell snapping; bandwidth stays at 1.5% of each displayed axis range independently of grid resolution. Padded boundaries avoid accumulating off-plot points at the edges.
- Retained 256 density color levels. Checked Gaussian-reference agreement, resolution/resize stability, edge handling, and worker behavior (28 focused Jest tests); the Chromium density canvas parity check passed. Visually reviewed a 20,000-point correlated cluster.

## 2026-10-02 — Box whisker endpoints and automatic axes

- Start whisker endpoints at Q1 and Q3, extending only to eligible observations outside the box, matching Matplotlib's interpolated-quartile behavior. This prevents inward stems and caps in Box and Notched plots and makes automatic axes include the complete box through the same endpoint calculation. Removed the superseded upper-axis-only workaround.
- Validation: Box axis and summary Jest suites passed (17 tests); four Chromium cases covered five datasets each in Box/Notched and both orientations, including `[1, 4, 8, 50]`, mirrored negative values, and ordinary extended whiskers. Test manifest/inventory checks passed (25 tests); Box syntax check passed.

## 2026-10-02 — Box summary intervals in automatic axes

- Included visible summary interval bounds in Strip auto-ranging so the full interval remains in view on linear axes. Horizontal and vertical plots share the same value-domain bounds; manual axis limits stay authoritative, and log axes exclude nonpositive endpoints.
- Validation: focused Box axis and bar geometry Jest suites passed (10 tests); `node --check js/components/box.js` passed.

## 2026-09-29 — Multiline titles and Font alignment

- Graph and axis titles across all eleven components accept explicit line breaks in the inline editor. Enter keeps editing active; clicking outside commits the title. Shared title rendering preserves line baselines, and the layout adapters move the plot and extend the SVG from measured content without changing the canonical data frame.
- Added left, center, and right title-block alignment beside the Font toolbar's Color field. Alignment uses the owner-scoped font style, undo, archive, cache restore, and redraw paths; older archives without the optional `textAlign` value remain centered.
- Preserved explicit multiline title baselines in SVG, PNG, TIFF, PDF, EMF, and hybrid SVG output. Positioned multiline text uses raster-backed PDF/EMF output; hybrid SVG raster layers keep the title as positioned SVG text.
- Validation: the 25-case supported-mode matrix and 17-case Chromium archive/cache/scope/undo run passed; the focused export-format and hybrid-title browser tests passed 2/2; the shared DOM suite passed 152 suites / 1,359 tests.

## 2026-09-28 — Owner publication, recovery, and geometry contracts

- Replaced animation-frame polling in snapshot readiness with owner-scoped lifecycle, job, and DOM-publication signals; Scatter readiness now reads the requested session.
- Fixed Heatmap recovery projection to preserve payload-backed settings and the owner title; normalized saved split restoration, Box legend strokes, PCA 3D legend clamping, and Scatter overlay counts at their shared/owner boundaries.
- Corrected Cartesian title baseline clearance and made Plot3D fallback tick precision adapt to actual tick spacing, preserving distinct labels while containing Surface output.
- Rechecked the Box cancellation budget and documented the intentional scope of per-axis notation overrides; focused Jest and Chromium regressions pass.

## 2026-09-01 — Cartesian acceptance and cache provenance

- Completed the in-scope Cartesian layout acceptance gates for Box, Scatter, PCA, Line, ROC, Survival, Histogram, and stacked Pie. Verified shared planning, Lock-ratio behavior, geometry, same-component isolation, reopen/recovery, and render-cache restoration while keeping 3D, Heatmap, Venn/UpSet, and radial Pie/Donut outside the Cartesian transaction.
- Fixed a shared session boundary bug where render-equivalent payload updates changed the cache envelope signature but left embedded Cartesian provenance on the old payload signature. Cache provenance now remains exact while retaining valid geometry.
- Fixed Histogram panel drawing to receive its owner-scoped draw options explicitly, and strengthened panel tests to wait for the settled plot mode before asserting geometry.
- Fixed Box statistics worker results being discarded during owner activation before deferred results could materialize; deferred owner results now survive until their matching context is ready. Box advisor visibility is also persisted in the owner payload for archive/reopen fidelity.
- Fixed Surface archive-cache validation to accept the explicit activation target before DOM projection while continuing to reject genuinely inactive owners.

## 2026-08-28 — Cross-component statistics ownership normalization

- Extended ROC-proven owner-explicit statistics ownership to PCA, Heatmap, Histogram, Surface, Survival, Pie, Venn, Scatter, and Box while preserving each component's statistical schema and UI.
- Inactive same-component tabs no longer capture live sibling statistics DOM; durable panel models remain canonical and are restored only when the owner has a live projection.
- Heatmap, Histogram, and Surface now restore durable statistics models before considering cached stats DOM, demoting stats DOM cache to an optional optimization.
- Scatter and Box statistics computations now use dedicated per-tab async scopes that survive ordinary deactivation, validate the originating owner/context, persist inactive-owner results to that owner, and defer DOM projection until activation.
- Preserved Survival's four-panel statistics ownership and intentionally detached Cox report-host behavior; normalized Pie advisor/results ownership and Venn significance-panel ownership without force-fitting unrelated enrichment state.
- Follow-up runtime validation fixed defects exposed only after the normalization landed: Pie runtime-control hydration is now module-scoped, PCA crash-recovery redraws re-project the owner's durable scree/biplot state, Surface render-cache capture no longer mutates durable statistics before signature validation, Scatter clears its owner computation-pending flag before publishing a finished async result, and Venn analysis/tab callbacks resolve the clicked or workspace-active owner instead of a stale projected sibling.
- Hardened the new regression matrix from the same runtime evidence: deterministic worker fixtures, settled-owner parameter discovery, derived/inactive statistics classification, contextual PCA axis witnesses, and owner-panel assertions now test durable component state without treating synthetic sentinel DOM as canonical after legitimate redraws.

## Unreleased
- Made lazy component contracts source-driven and fail closed, with registry-derived Node loading checks and Chromium coverage for every browser bundle. Routed loader diagnostics through the shared debug switch and repaired statistical/model test-impact selection. Focused validation passed: 33 Jest tests and one Chromium bundle-contract test; the generated contract and 608-row inventory checks pass.
- Removed the two completed refactor roadmaps after confirming their outcomes are recorded in the changelog and current architecture docs; added a source-linked maintainability review and recorded open work and dated-audit reconciliation in the canonical issue list.
- Case-evidence validation now rejects unknown outcomes, files with no individual test results, and empty evidence reports, keeping successful lanes fail-closed.
- Diamond markers now use the same filled area as square markers across Line, Scatter, PCA, Box, legends, and symbol previews. Label spacing, Box swarm layout, and render-cache compatibility follow the new geometry.
- Removed empty failure catches from the Scatter tab-switch and Venn reopen acceptance tests; inventory now allows them only in the bounded diagnostic probe. The Chromium contract lane passed 35/35.
- Completed the in-scope Jest/Chromium test-infrastructure refactor: physically split the AG Grid clipboard and component-lifecycle suites into six capability files each (270/270 pass serially and with four workers), AG Grid binding into four files (25/25), session payload tests into five files (51/51), and UI events into four files. The UI split restores an ROC HTML-escaping test previously omitted by title filtering. All title-range test dispatch is removed; unmapped manifest rows fail closed, and the unused E2E compatibility barrel is retired. The initial UI split run passed 40/41; the Box Prism-style movable-legend case passed its focused retest on 2026-10-01. Current static inventory is 606 rows with 826 explicit mappings, 9/9 critical scenarios, and zero unmapped rows. The prior full coverage run was red for the Box legend and Scatter instrumentation-only activation findings; the full coverage lane was not rerun on 2026-10-01. Firefox remains deferred.
- Enforced unused-variable checks across Jest, Playwright, and test helpers; reviewed and cleared 52 findings across 29 test files, restoring an unused Benjamini-Yekutieli expected-value assertion.
- Strengthened the PCA 3D legend-drag contract to trigger a fresh owner-scoped redraw; the repeatable right-edge clamp mismatch is preserved and tracked in `issues.txt`.
- Regenerated all welcome-example thumbnails from current production source after visual comparison confirmed unchanged output; all 11 provenance checks and the full static-quality lane pass.
- Added a typed, bounded diagnostic-evidence envelope to the workspace exercise, retaining owner/readiness, lifecycle, cache-outcome, and payload/layout-signature evidence while excluding raw cache payload details; its unit contract passed 3/3.
- Adopted the same typed diagnostic evidence in the Box/Scatter/Line cache-lifecycle diagnostic; a focused Chromium case passed 1/1 without changing its acceptance assertions.
- Moved four pure session-actions suites (owner readiness, cache serialization, save policy, and UI save/load) from app integration to minimal DOM after verifying their explicit session fixture has no application bootstrap dependency; focused validation passed 24/24.
- Added the shared JSDOM `scrollBy` polyfill and completed a fresh 57-process integration certification; 56 groups passed, with one deterministic Box legend rendering issue recorded separately.
- Completed a fresh full-Jest certification across 137 bounded process groups and all six Jest projects; every group passed except the same deterministic Box grouped-bar legend contract, with the initial non-green status preserved.
- Completed the fresh full-Chromium certification: 826/864 tests passed initially under four workers; 38 failures remain classified as release-certification evidence, with no diagnostic retry and Firefox deferred.
- Serially classified 18 representative full-Chromium failures: 11 passed with one worker and 7 stable contract findings were recorded in `issues.txt`; assertions were preserved.
- Replaced generic render-cache payload mutation with explicit per-component adapters; the adapter contract passed 15/15 and the 25-case Chromium cache/reopen/recovery matrix passed serially.
- Extracted logical component-parameter mutation rules from the owner-payload driver into a browser-injectable adapter module; its focused contract passed 7/7. The owner-payload Chromium certification passed 20/22, with the two reproducible Heatmap persistence failures recorded separately in `issues.txt`.
- Extracted canonical-vs-projection parameter assertions and result bookkeeping into a browser-injectable assertion module; its focused contract passed 8/8, and the post-extraction owner-payload certification reproduced only the same two Heatmap failures.
- Migrated the Line uncertainty-band contract to the shared archive/recovery drivers, including in-memory archive reopen support; its focused Chromium cases passed 2/2.
- Migrated the Box pre-compute statistics reopen/recovery contract to the shared archive/recovery drivers; its focused Chromium cases passed 2/2.
- Migrated the axis-major-tick-length and x-axis-label-angle contracts to the shared archive build/parse driver; their combined focused Chromium batch passed 13/13.
- Migrated the immediate-recovery graph-view-controls contract to the shared recovery driver; 9/10 Chromium cases passed, with the existing Heatmap mode/restore defect reproduced and tracked separately.
- Migrated the live-capture recovery contract to the shared recovery driver with an explicit canonical-journal preservation option; its focused Chromium cases passed 5/5.
- Moved eight loose CSV/Graph fixtures, two formerly unversioned Box CSV fixtures, and 22 repository-level Prism/PZFX fixtures into named versioned fixture directories; updated consumers and added inventory enforcement against loose and unversioned test fixtures.
- Moved remaining E2E diagnostic/performance writes to Playwright per-test artifacts and added inventory enforcement against repository-level scratch output.
- Lane reports now publish full manifest and skip-ledger sidecars, and CI uploads them with the corresponding lane and trend artifacts.
- Added parity coverage for the PowerShell full-test wrapper so it delegates to the canonical Node lane and preserves initial failure status and machine-readable reports.
- Added enforced governance metadata to all four conditional Chromium-only skips: issue ID, owner, expiry, and removal gate are now inventory-validated.
- Added explicit vendor-mode metadata to lane, bounded-Jest, shard, and trend reports, with shared schema validation; Chromium smoke reports also retain verified server provenance.
- Replaced a reintroduced recovery sleep with an explicit RAF-sampling completion signal and migrated nineteen duplicate Playwright archive serializers to the shared archive writer; the focused Chromium batches passed 75/75 and the static gate remains green.
- Continued shared archive-writer adoption for Lock-ratio and mixed Scatter CSV contracts; the focused Chromium batch passed 8/10, with the two pre-archive Line/Venn owner-readiness timeouts recorded separately in `issues.txt`.
- Migrated the Box point-size and Histogram panel document-snapshot builders to the shared archive driver; focused Chromium validation passed 15/15.
- Split the shared Plot3D Jest contract into separate rendering and managed-gesture suites, added explicit scenario metadata for both boundaries, and kept the focused pair green at 25/25.
- Split AxisControls into core, editing, and ownership/rehydration Jest suites; the focused group passed 21/21 and all three files are below 800 lines. Added current exporter title-visibility metadata, removed one unused Box assignment, and refreshed its generated welcome-example provenance.
- Split the Heatmap stats integration suite into rendering/layout, data-view transform, and correlation-reporting suites with one shared harness; focused Jest validation passed 25/25 and inventory evidence remains explicit.
- Split the PCA view integration suite into ownership/table, statistics, redraw/cache, and preprocessing suites with one shared harness; focused Jest validation passed 29/29.
- Split the Venn additional-tab integration suite into tab/payload, GO/STRING ownership, and cache/recovery suites while preserving its reviewed partial bootstrap; focused Jest validation passed 21/21.
- Split the session-actions integration suite into save policies, owner readiness, cache serialization, and UI save/load suites with one shared harness; focused Jest validation passed 24/24.
- Split the Line view integration suite into legend/3D/cache rendering, style/table edits, and owner-scoped statistics/overlays; focused Jest validation passed 16/16.
- Split the Box swarm DOM suite into density, point styling/layout, interaction, and preview/resize suites with one shared harness; focused Jest validation passed 40/40.
- Split the mixed Box/Line/Scatter statistical-oracle matrix into component-specific suites backed by one shared numerical harness; focused Jest validation passed 10/10 and inventory evidence remains explicit.
- Migrated Heatmap geometry reopen/recovery and Histogram first-resize recovery contracts to the shared archive/recovery drivers while preserving component-specific geometry and redraw assertions; the focused Chromium batch passed 4/4. Firefox remains deferred.
- Migrated the Line horizontal-resize reopen/recovery contract to the shared archive/recovery drivers while preserving its axis and drag assertions; focused Chromium validation passed 2/2.
- Migrated the Box horizontal-resize contract to the shared archive/recovery drivers while preserving reserve and drag assertions; the isolated rerun of its initial live-drag timeout passed 1/1. Firefox remains deferred.
- Migrated PCA stats-restore and metric-geometry contracts to the shared archive/recovery drivers; focused Chromium validation passed 4/4.
- Migrated the stats-presence contract's generic reopen/recovery plumbing to the shared drivers; all 11 Chromium cases passed.
- Migrated figure-summary, Venn UpSet/numeric, Survival covariate, and 3D legend recovery plumbing to the shared drivers; focused Chromium validation passed 12/12. Firefox remains deferred.
- Rechecked the specialized heavy Heatmap no-cache recovery path with its original direct fixture setup; the title-loss assertion still reproduces serially and is tracked in `issues.txt` rather than being hidden by a helper migration.
- Fixed Box numeric collection after the shared locale-aware parser migration: blank AG Grid cells now remain missing instead of being accepted as zero in both single and grouped layouts, while comma-decimal values remain supported. Added parser and rendered-trace regression coverage.
- Added a shared all-eleven negative owner-handoff matrix covering requested/active mismatch, root/session mismatch, and ABA stale-generation rejection; all 33 cases pass.
- Unified lane, Jest-shard, bounded-Jest, and trend-report schema validation, and published nightly trend artifacts with retention metadata.
- Grouped the reviewed architecture, DOM, and lifecycle test batches without forcing specialized production bootstraps; the inventory now records explicit reasons for the remaining deliberate doubles.
- Grouped the reviewed architecture and Box E2E capability batches under their owning test layers without changing browser assertions; all 17 moved DOM export/font suites and the full DOM project remain green.
- Grouped the ten component render-cache capture suites under the integration layer; the focused production-bootstrap cache batch passed 10/10.
- Fixed Box archive capture after layout-only resize so the owner-scoped semantic point-sizing baseline is written to the canonical payload and survives reopen; the strict Chromium resize/reopen contract remains unchanged.
- Restored the shared single-row figure-summary control layout for every component by aligning the CSS contract with the cross-component Chromium geometry test.
- Extracted Box point-sizing calculations into the shared `boxPointSizing` boundary; the component retains compatibility hooks while rendering and persistence continue to use the same calculations.
- Extracted Hot filter normalization and state cloning into the shared `hotFilterModel` boundary; table filtering, undo, archive, and persistence behavior remain covered by the existing focused suites.
- Extracted Heatmap palette/scale normalization and PCA table-schema/label-row normalization into shared render-model boundaries; focused Heatmap and PCA ownership suites remain green.
- Extracted Line overlay normalization/path modeling, Scatter label-distribution modeling, and Venn circle/rectangle geometry into shared render-model boundaries; focused Line, Scatter, and Venn characterization suites remain green.
- Completed the authorized ordinary-wait follow-up: 114 inventoried E2E sleeps and 11 diagnostic-helper sleeps now use owner/projection/frame signals or named bounded observation windows; the current E2E scan reports zero `waitForTimeout` calls.
- Added integration teardown/leak enforcement, per-project coverage reports, manifest/discovery evidence in lane reports, and a scheduled bounded full-Jest certification workflow. Fixed-scratch archive/recovery/cache usage is now zero by inventory.
- Added a catalog-driven UI mutation driver and explicit visible parameter/style/layout probes for all eleven components. The UI-originated write-through and archive-reopen contract passed 11/11 in Chromium with one worker; API/owner-payload mutation coverage remains separately named.
- Fixed Pie reopen layout restoration by preserving the archived aspect-lock state and using owner-session capture intent; targeted stacked-axis and first-interaction checks now pass.
- Replaced render-cache contract leaf guessing with explicit component data-cell candidates and retained schema-aware Venn/ROC mutations.
- Completed the reviewed test-suite governance pass: safe isolated Jest suites now use the manifest-derived component bootstrap, specialized partial bootstraps carry explicit reasons, oversized suites are grouped by layer/capability, and the generated inventory enforces both contracts.
- Extended direct manifest evidence for the reviewed component DataViews/notes batch, Heatmap notes, and Pie render-cache capture; wildcard evidence remains reported separately.
- Added direct Chromium evidence for Venn notes ownership across same-type tab activation; the component evidence matrix now has no unexplained feature gaps.
- Replaced the remaining Box UI-event timer flushes with owner-readiness checks and documented explicit limits for the heavy production-bootstrap cases; the previously red integration groups now pass strict reruns.
- Added a shared lane artifact policy: requested machine reports are required CI artifacts with 14-day retention, while browser, performance, and coverage outputs remain optional diagnostics.
- Classified Jest file reads in the inventory: 91 total reads are now separated into 65 source-backed contracts, 11 fixtures, and 15 generated/provenance artifacts; no category is hidden in the source-read metric. Removed two source-snippet checks whose rendered behavior is already covered directly by Chromium contracts.
- Moved the pure production-bootstrap manifest assertion to architecture tests and the Firefox-named clipboard/export service contracts to minimal DOM; removed the owner-payload driver's retired generic-mutation fallback.
- Added explicit scenario ownership for the moved clipboard/export contracts and removed the obsolete unmapped-file allowlist; the current manifest is fully mapped.
- Removed twelve unreferenced tracked render-cache scratch archives after the fixed-scratch migration; inventory remains at zero.
- Corrected stale Venn integration expectations for optional species enrichment and live render-cache capture; PCA repeated-bootstrap teardown now resets tracked production listeners and reduced the focused suite from 539 to 208 seconds. Bounded Jest shard reports now persist progress after each group, and the nightly feature matrix uses the canonical lane runner with a machine-readable report artifact.
- Regenerated the eleven welcome-example artifacts after the current source changes; provenance and freshness checks now pass in the static lane.
- Migrated five isolated render-impact contracts from full integration to the minimal DOM project after verifying they need only shared modules plus one component; their explicit scenario mappings and bootstrap paths were updated.
- Moved the Box archive-reopen fixture to Playwright per-test output, reducing shared fixed-scratch usage while preserving the 1/1 Chromium archive contract.
- Moved seven additional archive/recovery/cache fixtures to Playwright per-test output; focused Box, Heatmap, PCA, and ROC validation passed 8/8, leaving 21 reviewed fixed-scratch users.
- Moved three further Heatmap, Pie, and Surface archive fixtures to Playwright per-test output; focused Chromium validation passed 3/3, leaving 18 reviewed fixed-scratch users.
- Fixed Heatmap runtime restoration so payload hydration cannot overwrite owner-scoped dendrogram settings during same-tab activation; custom mode, thickness, and color now survive same-component tab round-trips.
- Fixed Box custom-pairs control refreshes so the focused input node and in-progress draft survive settled statistics redraws; live edits still write through immediately and first-click calculation remains available.
- Completed the render-cache capture migration for all eleven component adapters. Mounted graph DOM now remains untouched during capture; audited canvas layers are converted to cache-only bitmaps and rehydrated through component-owned restore paths. Removed the unused shared moving-child helper while retaining the tested session rollback branch for unmarked legacy captures. Added production-bootstrap contracts, archive/restore coverage, renderer-specific browser gates, and explicit test-manifest mappings.
- Completed the semantic render-impact audit for all eleven components. Known paint, layout, analysis, and structural draw boundaries now carry owner-safe metadata; components without complete signatures retain full rebuilds, and no speculative cross-tab analysis cache was added. Added component contracts and focused isolation, reopen, resize, and statistics coverage.
- Fixed mixed logarithmic-axis notation and positive ticks being displayed as zero. Shared axis formatting now gives Automatic log axes one consistent power-of-ten format, keeps explicit Decimal axes decimal with sufficient precision, and applies the policy through all positional-axis renderers; log-density clipping now follows the rendered lower axis domain.
- Fixed Histogram statistics redraws to reuse owner-scoped goodness-of-fit results for unchanged data and settings, avoiding repeated bootstrap work while preserving exact results and tab isolation; added cache-signature coverage.
- Fixed logistic-regression Fisher updates and covariance to use the shared pivoted-QR solver while preserving the model-specific Bernoulli likelihood optimizer. Logistic predictions and confidence bands now evaluate in centered coordinates, preserving stable results for large predictor offsets; added reference, separation, and offset-stability coverage.
- Fixed the shared draw-frame coalescer so a later paint/layout request cannot downgrade an earlier analysis or structural redraw. All sanitized owner-scoped draw requests now carry a conservative semantic impact (`paint`, `layout`, `analysis`, or `structural`), with structural helpers and view-only requests classified explicitly; added lifecycle coverage.
- Fixed shared axis-control discovery to prefer semantic axis ownership/segment metadata, measure compound SVG paths, and retain geometry inference only for legacy cached lines; Box broken-axis segments now preserve that metadata and keep distinct cached hit overlays.
- Consolidated numeric color-picker sections through the shared workspace-toolbar builder, preserving each control's canonical range, placement, interaction, and undo adapter while removing five duplicate DOM builders.
- Consolidated owner-aware control listener binding in `Shared.componentLifecycle` and migrated all ten listed components. Preserved specialized owner hooks, added Line’s inactive-owner guard, retained Surface teardown tracking, and routed Venn’s flexible multi-target binding through the shared lifecycle. Added focused binding tests and passed all-component Chromium isolation and persistence checks.
- Fixed component session shaping at the shared lifecycle boundary. Histogram, ROC, PCA, Venn, and Pie now preserve valid owner-session state/results/notes identity across routine lookups, while explicit replacement still normalizes once; PCA render/analysis/draw runtime identity is preserved as well. Added focused shared and five-component regression coverage.
- Fixed Line multi-series area fills and regression interval bands so all background layers are emitted before data lines and markers; added rendered z-order coverage.
- UpSet live-resize frames are now built off-DOM and committed atomically, keeping the last complete plot visible until the replacement frame is ready. Live-render and frame-integrity checks remain enforced without an environment-sensitive RAF timing gate.
- Consolidated p-value display formatting behind a dependency-light shared formatter and routed component adapters through it while preserving operator metadata, exact representable detailed values, compact/underflow display floors, and invalid-probability handling. Added a production-ordered component Jest bootstrap, direct-versus-wildcard component evidence reporting, and cross-component stale figure-summary invalidation coverage.
- Added the testing-suite refactor foundation: isolated Jest projects, production-derived bootstrap loading, explicit owner readiness, canonical component/scenario/impact catalogs, manifest-generated inventory, pinned vendor provenance, cross-platform lane execution, no-green diagnostic retries, active coverage-trend enforcement, strict UI/API drivers, and PR/nightly CI lanes. Migrated focused Box/Surface integration and same-type ownership coverage, removed the orphan Heatmap spec and superseded testing roadmaps, and corrected the welcome-carousel Firefox animation race exposed by the new cross-browser contract lane.
- Added explicit oracle policy to the generated test manifest: Python/SciPy differential suites are required by the canonical statistical lane, which now fails when the numerical oracle is unavailable. Chromium contract verification remains the current focused browser gate; Firefox is deferred for this pass.
- Fixed the remaining audit capture/noise issues: ROC payload capture is read-only, Venn snapshot readiness no longer cancels automatic species detection or overwrites restored species, desktop Import/Example commands use owner-scoped component capabilities, Pie correction validation is key-only, and routine chart-style/statistics diagnostics are debug-gated. Added focused contracts and browser regressions for restore/recovery safety.
- Fixed ROC legend-only redraw invalidation: the shared lifecycle scheduler now merges semantic render impact, ROC classifies legend changes as layout-only, and unchanged owner analysis/statistics models are reused while the SVG/layout envelope is republished. Example loading and recovery remain on the existing owner-scoped path.
- Separated live canonical payload capture from layout-derived sizing. Ordinary resize now persists only owner layout/runtime state, while archive serialization retains the compatibility `meta.graphSizing` mirror at its file boundary.
- Closed the six reviewed P1 findings: Box reserve restoration now survives activation and the first resize, Venn checkpoints ignore optional species enrichment while retaining owner/token safety, Pie cache restore waits for all first-interaction bindings, and Heatmap payload hydration applies explicit view and palette state to the owning session. The Venn production-bootstrap report was stale and required no code change.
- Normalized the shared gear-menu order across components: Lock ratio, Proportional font resize, Show graph title, Show axes titles, Show legend, then component-specific Axes length. Existing component aspect-lock policies and defaults remain unchanged.
- Fixed Histogram legend hiding so the existing graph shell remains stable until the replacement frame and viewport envelope commit together, eliminating the transient resize seen during the toggle.
- Fixed Box's live-resize container flicker: zoom envelope scaling now runs only during zoom changes, so pointer moves no longer replace the current label/significance margins with an old snapshot. Live redraws remain enabled.
- Fixed shared SVG title dragging: graph and axis titles now remain inside their SVG viewport during outward drags and when restoring invalid saved positions, across all 2D components. Scatter, Line, and PCA 3D titles now share one default vertical anchor.
- Hardened shared 3D viewport staging and cache restore across Scatter, Line, PCA, and Surface: the canonical SVG frame remains stable, rotation-safe reserves are applied once, Surface preserves the complete viewport metadata and legend extension, and the mounted Surface title is normalized before interaction binding.
- Reduced Surface 3D rotation-cache geometry to indexed face connectivity, while normalizing legacy expanded face caches on restore. Transient SVG pools remain owner-scoped and rotation, resize, recovery, and reopen fidelity are preserved.
- Normalized statistical figure-summary rows to one publication-ready two-column layout. The label column now follows the actual label width with a small fixed gap, and all values wrap in the aligned value column; legacy per-row stacked metadata and component-specific stacking flags were removed.
- Added compact, context-aware figure-summary precision: p-values use threshold-aware reporting, estimates and intervals use restrained precision, decorated and standalone metrics lose formatter-only trailing zeros, and extra digits are retained near α = 0.05 so rounding cannot change the significance interpretation. Detailed statistical reports preserve source values and reporting context.
- Added owner-scoped shaded uncertainty bands for grouped-replicate Line graphs. The Format toolbar now exposes one compact `Uncertainty (±SD)` control that switches between the existing error bars and a continuous shaded band; both presentations consume the same mean ± sample-SD bounds, while band transparency is persisted per tab and survives archive reopen/recovery. Bands preserve missing-data gaps, export as part of the SVG, render in a dedicated non-interactive background layer behind every data line/marker, and avoid generic `data-series` interaction identity. Display, transparency, and error-bar thickness edits are explicitly undoable without making hidden backing controls authoritative.
- Added an optional owner-scoped SVG statistical/analysis summary below graphs. The table is generated only from canonical structured report models, participates in save/reopen/recovery through shared statistics-reporting state, grows the SVG content envelope without resizing the canonical graph, and uses complete wrapped text without ellipsis. The rendered figure projection is deliberately compact, with essential rows allowed to extend the small optional-row budget: test/analysis identity plus the main effect, p-value/CI, model-fit or goodness-of-fit result, and the minimum dataset-specific rows needed to avoid ambiguity; detailed diagnostics, descriptive tables, coefficients, settings, and multiplicity prose remain in the full statistics report instead of bloating the figure. Its publication styling uses context-aware summary titles, black horizontal rules, a common serif typeface, and no vertical grid or enclosing box. Box forwards its canonical figure-summary model with the explicit owner tab id so the summary reliably appears after statistics are computed.
- Completed the statistical figure-summary audit remediation: compact row selection now uses an explicit essential-row contract, Box and Survival retain essential sample/survival context, Pie overall results retain their denominator `N`, Histogram goodness-of-fit rows retain per-series `n`, invalid legacy reports cannot enable an empty summary, the compact figure uses the documented `p < 0.001` display floor while detailed reports retain source P values, explicit upper-tail bounds are never inverted, invalid probabilities are never clamped, zero-valued tail probabilities are never shown as `p = 0`, and descriptive projections now use an Analysis summary title.
- Fixed follow-up audit defects across shared boundaries: Welcome `.txt` imports now use the delimited-table path; out-of-range finite p-values report an explicit invalid-probability state; restored Heatmap statistics snapshot the live owner before cache detachment; responsive workspace splits retain their restored fraction; observer-only zoom no longer schedules redraws; Surface disclosure state and Cartesian title baselines survive layout projection; Scatter keeps heavy-draw cancellation controls on a stable hit surface; and PCA exposes the same owner-scoped primary-publication probe as its sibling components.
- Fixed summary font-toolbar paint edits so color changes and collection undo/redo update paint only, preserving renderer-owned multiline tspans, wrapping, and geometry. Summary SVG lookup now uses only the owner-scoped mounted root, including during restore and tab transitions.
- Fixed shared figure-summary resize invalidation. After a graph frame resize or redraw, the summary now recaptures the new canonical graph viewport instead of restoring the first-render dimensions, while keeping the table's bottom reserve outside the graph frame.
- Unified SVG root publication-state capture and restore for Venn, Heatmap, and Surface render caches, preserving summary reserves through tab reuse and crash recovery. Surface now restores its structured summary model before cached markup, and Surface and Heatmap keep the summary table and reserve live during resizing.
- Fixed Heatmap summary-resize frame drift. A reused Heatmap SVG now explicitly discards only the prior summary presentation slot before redrawing and passes its new canonical frame to the shared summary projection; the matrix, title, and colour scale therefore resize identically whether the summary is enabled or added afterwards.
- Fixed PNG, SVG, and other static exports of figure summaries. Multiline summary rows now use explicit baseline-safe y coordinates, preventing exported text from shifting into row rules.
- Reduced the shared graph-to-statistics-table gap by 30% for every component.
- Added owner-scoped manual X-axis tick-label angles (−90° to +90°, with blank preserving automatic collision rotation) across the shared 2D axis-control pipeline: Box, Scatter, Line, Histogram, PCA, stacked Pie, ROC, Survival, and UpSet. Shared rotation geometry now derives bottom reserve, title displacement, endpoint containment, and angle-aware optical tick clearance from the same measured label projection; explicit 0° reliably clears a previous rotation. Added same-component isolation, archive/recovery persistence, flipped-Box, signed-angle containment, and shared geometry coverage.
- Added an owner-scoped canonical recovery journal so the newest user revision survives abrupt loss before the rich recovery snapshot debounce; rich previews and render caches remain off the mutation path. Certified mixed heavy-tab archive/recovery isolation and statistics persistence across all components.
- Fixed immediate crash-recovery persistence for ordinary native controls across graph types, density/mode selectors, and 2D/3D view selectors. The shared event boundary now captures after each control handler, preserves select ordering, mirrors synchronously for hard reload, and advances the durable journal from settled owner state.
- Fixed legacy locked-resize drift in UpSet by preserving the established lock target between drags and reapplying the shared axis-ratio correction after its renderer's final layout pass.
- Axis reserve/layout transaction acceptance: the fresh Windows Chromium R4 gates are green for all migrated Cartesian modes, including the complete Histogram panel suite, Box transposition/significance/reserve coverage, Survival risk-table geometry, PCA envelope behavior, same-component isolation, archive/recovery cache reuse, the broader persistence/statistics matrix, and the combined Lock-ratio/3D non-regression suite. Resolved harness assumptions and confirmed runtime causes are recorded in `issues.txt`.
- Render-cache Cartesian provenance is now explicit at the settled cache boundary: publication owner/component/generation come from the committed Cartesian frame; component currentness and publication-settled checks run before capture; then the owning tab's canonical payload/layout signatures are bound to the cache and must match exactly on restore. Optional signatures embedded in a live SVG still reject on mismatch, but their absence is not treated as stale geometry. The cache contract now exercises stacked Pie explicitly so radial Pie/Donut cannot accidentally satisfy the migrated-Pie R3 gate.
- UpSet remains outside the Cartesian transaction, but its legacy locked-resize path now preserves the established ratio target and reapplies the final rendered-axis correction; the opt-in `LOCK_RATIO_COMPONENT=venn` characterization gate is green without widening tolerance.
- Moved every primary Download/Copy row into a shared attached footer below the SVG content envelope. Axis titles, legends, significance annotations, and risk tables can no longer collide with export controls; all 11 components now share the same placement, zoom independence, border geometry, and live-menu contract.
- Unified 2D Cartesian layout reserves and Lock-ratio geometry through one owner-scoped transaction. Line, Scatter, ROC/PR, Survival, Histogram overlay/panels, stacked Pie, Box, and PCA 2D now resolve the canonical user frame, plot rectangle, measured/semantic reserves, special panel/metric constraints, rendered-axis Lock target, and outward SVG envelope before atomic publication. Labels, significance annotations, legends, risk tables, and metric overflow are derived presentation geometry rather than persisted frame authority; render caches carry owner/generation/payload/layout provenance and rehydrate that derived plan on reopen. Box no longer grows its physical frame or persists automatic reserve fields, Histogram panels publish one repeated-track axis model, PCA preserves exact 2D metric scaling, and 3D/matrix/Pie/Donut/Venn/UpSet exclusions retain their existing contracts.
- Fixed Box trace formatting leaking into associated symbols and error whiskers. Trace body paint, point fallback paint, and overlay width now remain independent through redraws; thick bar borders meet one-sided whiskers without gaps in either orientation.
- Reduced the default tick-label clearance across 2D and 3D graphs, UpSet, Heatmap scales, Surface scales, and PCA scree plots. Rotated X labels now retain the same optical tick clearance instead of moving away when their baseline turns; shared geometry preserves resize behavior and tab-owned render state.
- Fixed multi-dataset Prism and PZFX imports. Every supported data table is now discovered in document order, fully rendered before ownership moves to the next tab, imported into its own component-appropriate tab, and named from its Prism table title. The inspected first-table ID no longer suppresses the remaining batch. Singleton-condition grouped tables become single Box tables so individual sample names remain the plotted categories, while true multi-condition tables remain grouped. PZFX TwoWay and summary-XY tables now match modern Prism component routing, modern summary-XY series retain the correct mean columns, and graph metadata is matched to its owning data sheet.
- Fixed the thin gap below pinned editable AG Grid rows. Pinned records now live only in AG Grid's pinned model instead of remaining as 1 px hidden body duplicates; shared row mapping preserves editing, selection, keyboard navigation, filtering, and clipboard behavior for single- and multi-row headers.
- Made equal PCA axis lengths the default presentation. New and legacy-unspecified PCA payloads now use equal numerical spans and a square/cubic frame without rescaling coordinates; explicit saved choices remain unchanged.
- Fixed Box Single-to-Grouped example reloads. Table-format changes now write through immediately to the owning session and payload before later table reuse, and grouped header normalization stops at the meaningful dataset width instead of inventing groups in AG Grid's spare editable columns. Added exact reload plus existing tab-isolation/archive coverage.
- Fixed empty grouped-tab lifecycle handling. Restore and tab previews now distinguish persisted table structure from payloads capable of producing a graph across all components; AG Grid instances retire their APIs before destruction; Box no longer queues redundant refreshes against obsolete grids; and cancelled Box draws remove only their own staged SVG. Added unit contracts plus exact duplicate, clear, repopulate, hover-preview, and cross-component regressions.
- Fixed Heatmap row/column label font-size reporting and added distinct Row labels and Column labels toolbar scopes. Named sizes now match rendered and exported text through redraw and resize, and the legend rail reflows from the final styled label width. The shared named-collection path remains tab-owned and persistent.
- Added native Save As selection for graph image downloads. PNG, SVG, hybrid SVG, EMF, PDF, and TIFF exports now ask for the destination and filename before rendering, with equivalent browser and desktop behavior; Venn GO/STRING image exports use the same shared contract.
- Made p-value display format tab-owned across every statistics panel. Decimal/Scientific changes now persist immediately in the owning payload, survive same-component switching and archive reopen, and cannot be overwritten by stale restored panel models; Box and Survival legacy settings hydrate into the same shared contract, and Heatmap/ROC use the component-neutral change event.
- Fixed shared p-value report metadata so formatter-generated display thresholds remain distinct from explicit statistical bounds. Decimal/scientific switching now preserves underflowed zero as a valid threshold and restores representable tiny probabilities in scientific notation instead of ever producing the impossible `<0` output.
- Fixed Heatmap dendrogram thickness editing in Auto width mode. The thickness field remains editable and an explicit thickness change switches the independent width mode to Fixed, with both changes retained in undo history.
- Centered every welcome-page graph icon within its frame by normalizing each canonical SVG viewBox to the artwork's actual bounds, removing the shared upward offset, and optically balancing PCA's heavier lower-left cluster. Added all-component rendered alignment coverage.
- Corrected the cross-component persistence matrix so Line's derived `config.stats.version` freshness counter is classified like Scatter's context generation instead of being mutated as a user graph parameter. Real statistics controls and naturally produced calculation/reopen behavior remain covered.
- Fixed Venn AG Grid exclusions so cell, row, and column exclusions immediately update the graph and remain owner-scoped across Welcome switches, saves, reopen, and recovery. Venn now derives plots from the shared exclusion-aware analysis matrix while preserving raw table data and persisting the exclusion state.
- Increased the shared downloaded/saved PNG default from 192 to 300 DPI while preserving graph dimensions. Clipboard PNG wrappers use the same 300-DPI raster; TIFF and other export defaults remain unchanged.
- Fixed copied PNGs losing either physical size or resolution. Shared SVG and SVG-string copy actions now place the same high-resolution raster used by PNG downloads inside a size-preserving SVG clipboard representation, with a correctly sized PNG fallback for raster-only applications.
- Fixed copied SVGs importing oversized or stretched in Inkscape. The shared exporter now materializes the outer SVG viewport projection on the paste wrapper before serialization, so dropping the document root during clipboard import preserves the same physical size, aspect ratio, strokes, and layout as Download SVG across all components.
- Fixed Heatmap dendrogram joins and copied-SVG weight. Live compact branches now use overlap-safe square caps, while export materializes the displayed non-scaling width into separate editable horizontal and vertical strokes so Inkscape preserves the on-screen thickness under stretched SVG projection.
- Reworked Heatmap correlation layout around one measured projection contract: row and column labels now share the established column-label sizing rule, row dendrograms render left of the matrix, row labels render right, and the color scale reserves stable readable typography, thickness, ticks, title, and collision-safe spacing for both fixed and matrix-matched heights. Longer labels now reflow the legend rail automatically, graph titles default to the matrix center, and actual recovery draws use accurate lifecycle telemetry.
- Fixed left-positioned legends leaving the SVG after resize. Reused legend nodes now reapply the live rendered-edge clamp whenever their drag metrics are rebound, and the corrected owner-relative position is published back to the owning session instead of retaining an out-of-bounds pre-resize coordinate.
- Fixed draggable legends stopping at the fitted SVG `viewBox` instead of the rendered SVG border. Shared legend dragging now includes letterboxed side bands while still keeping the complete visible legend inside the SVG element; Surface can therefore reach both horizontal edges.
- Rebuilt the Surface color legend to match Heatmap's fixed-height scale: a stable 15 x 80 px gradient, five right-side ticks, and the same visible #333 1 px border. Removed obsolete Surface legend CSS that overrode the SVG renderer with a pale 0.6 px outline and stale text styling. Surface retains owner-scoped dragging, redraw persistence, and restored-cache interaction rebinding.
- Fixed the welcome page's split first paint. Its canonical cards and inline example thumbnails now render before AG Grid and the main application bootstrap, while the later workspace initialization only binds interactions; the complete welcome layout is visible in the first frame without external SVG image requests.
- Fixed Box statistics editable controls so current values write through to the owning tab session while the user edits them. Custom-pair changes now update multiplicity controls in place instead of forcing a graph redraw on blur, so the first `Calculate statistics` click is no longer consumed when moving from one pair to multiple pairs; stale statistics/significance output is invalidated immediately, and targeted Jest/Chromium regressions cover first-click calculation and owner-state write-through.
- Fixed same-component notes ownership and PCA cached-control rehydration after recovery/reopen. The shared notes lifecycle now reuses a notes control only when its DOM root and owner match the target tab; Box, Scatter, PCA, and Line now commit note edits immediately to their owning runtime state instead of relying on a transient component mirror. PCA render-cache restore additionally rebuilds and enables X/Y/Z component selectors from the restored analysis cache metadata without recomputing the dimensional reduction, so the controls remain consistent with the already-restored SVG. Shared same-type isolation coverage now exercises notes, DataViews, representative controls, archive reopen, and crash recovery using Survival's owner-scoped behavior as the reference contract.
- Refactored PCA config persistence so the owning tab session is the serialization authority instead of the transient module-level `pcaState` projection. Axis selection and the metric presentation/standardization controls now write through synchronously to the owning canonical workspace payload, preventing same-component activation from reverting PC selections during archive reopen or crash recovery; targeted regressions now assert canonical payload parity before persistence and prove owner-session serialization remains correct even with a deliberately stale projection mirror.
- Corrected the second formerly unreachable R09 large-Heatmap export assertion exposed after the cache fix reached the full 7,358 x 3 render. Exported column labels always preserve their `rotate(-90 ...)` base transform, but an aspect-correction `matrix(...)` is required only when the corresponding live column labels are actually aspect-scaled; the original test incorrectly required a matrix unconditionally. The regression now checks matrix-presence parity between the live and exported column labels while retaining full-vector export and label-count assertions.
- Corrected the large-Heatmap R09 acceptance contract after the settled Windows rerun reached the correct 7,358 x 3 `values` model but exposed a stale settings-signature assertion. The WDBC example has 40 conditions and therefore defaults `Show correlation/value text` off, while the imported matrix has two conditions and intentionally defaults it on; the committed settings signature must therefore change with the successful large-model commit. The regression now asserts that data-aware setting transition explicitly instead of requiring equality with the old example signature.
- Fixed large Data-values Heatmap cancel/retry cache coherence. The 7,358-row exact-clustering worker was already completing; the stall came from publishing candidate data/settings signatures into the committed render runtime before the matching model survived its render checkpoint. Cancelling there left the old WDBC model mislabeled as current, so Retry reused stale content. Request signatures now remain transient until model commit, model-derived value-scale state follows the same atomic boundary, and committed-model invalidation clears its signature pair together. The large-data Chromium regression now verifies committed cache identity remains unchanged through worker completion and cancellation, then advances atomically to the 7,358 x 3 model on Retry.
- Fixed shared fallback axis-length editing after Windows R06 validation exposed a nullable-offset coercion bug. Manual axis-length commits intentionally carry no wheel basis offset, but `Number(null)` was interpreted as an explicit zero and collapsed the graph basis onto the requested axis length before refinement. `axisControls` now distinguishes an absent basis offset from a valid numeric zero and preserves the measured non-axis frame offset; the latest-wins regression now asserts the exact 140 -> 155 -> 170 geometry sequence, and browser coverage now verifies manual X/Y numeric length edits preserve the pre-existing frame offset. The corrected true-burst Chromium R06 tests pass 3/3 on Windows.
- Corrected the R11 legend-envelope regression exposed by authoritative Windows Chromium validation. The first shared fix replaced the original conservative full SVG extension with `svgWidth - svgBoxWidth`; because the SVG starts inside `.svgbox` after its left border and padding, that under-reserved the shell and could leave categorical legends visibly outside the container. The shared `chartStyle` geometry change is now reverted exactly to original v25 (`rendered.extensionWidth`) rather than replaced by another speculative formula. The browser regression now asserts the actual contract—complete SVG/legend containment plus unchanged canonical plot geometry—without requiring exact shell-width equality or artificial symmetric hidden-content margins. Survival's R11 persistence change is also narrowed to legend mutations only instead of altering every scheduled control.
- Completed R06 numeric-wheel re-analysis from authoritative Windows request timestamps. The first shared production correction remains: idle commit timing starts only after RAF-coalesced live publication and closed/rebound gestures cannot be resurrected. The remaining X/Y browser failures were a stale burst simulation, not a second production race: the test awaited a complete expensive resize frame before creating each next synthetic wheel event, producing 430–680 ms live-to-live gaps against the intentional 120 ms idle boundary and therefore several valid gestures. The E2E now dispatches one contiguous raw wheel burst before yielding to rAF while retaining move-phase, one-commit, bounded-refinement, monotonic-input, undo, and owner-isolation assertions. No debounce increase or second timing workaround was added.
- Strengthened Line restore readiness after authoritative archive/recovery E2E still reported `Statistics unavailable until data is loaded.` The render-cache restore reconciliation remains, but the compute action now has an owner-scoped lazy reconciliation backstop: if transient `statsState.context` is absent when the user recalculates, Line ensures the active owner's HOT manager through the same normal activation path when necessary, rebuilds context from that owner's included-data matrix, and calculates immediately. No redraw or transient-state serialization is introduced.
- Normalized targeted Jest lifetime isolation uncovered by the Windows run. Venn tests now dispose prior owner sessions/jobs before replacing `Main`/`Components`, Survival tests tear down prior component/session globals before fresh module loading, and the axis fallback fixture mirrors a real shared resizable box. These changes address suite-lifetime/fixture pollution without weakening final restored species, payload, SVG, or refinement assertions.
- Fixed Venn same-component analysis restore across archive/runtime rehydration. Derived-region invalidation now clears `lastRegionSignature`/`lastRegionCode` together with the parsed data they describe, and each owner session carries a transient analysis-projection baseline marker so the first post-restore region draw establishes restored GO/STRING/significance/selection/background/species state instead of treating it as a user data mutation. This resolves both independent GO/STRING result-family loss and numeric `ABC` selected-region loss without serializing transient state or weakening ordinary data-change invalidation. Corrected two unrelated full-suite harness assumptions discovered during prioritization: Scatter's forced snapshot flags now use Main.session's supported `snapshotIntent`, and synthetic Surface setup explicitly commits its active owner before archive capture.
- Corrected stale statistics regressions after the shared on-graph summary update: Line's density-aware summary test now asserts the current semantic `slope = value` output rather than legacy whitespace, and Scatter's Jest isolation case now targets the actual second-tab statistics-report ownership failure with one calculation while the full Linear-vs-Exponential two-model switch/reopen workflow remains in Chromium E2E. Removed the resolved Scatter timer-settling backlog item.
- Fixed Scatter same-component statistics isolation by normalizing its passive/live-DOM binding to the Line contract: every transient control, statistics target, plot, and resizer handle is rebound as one owner-scoped projection before callbacks run. Two Scatter tabs can now calculate independent regression models (including Linear vs Exponential), render their own statistics tables and overlays, switch through render-cache reuse without cross-tab DOM refs, and preserve those results through archive reopen. Added direct same-component regression-model/panel coverage and included Scatter in the shared statistics isolation/reopen E2E contract.
- Normalized Scatter statistics persistence to the owner-first contract used by Line: successful calculations now commit the current regression model and report state directly to the owning session before redraw/snapshot persistence; runtime capture no longer reconstructs statistics from active mirrors or report DOM; failed/stale calculations cannot be marked current; and legacy report-only restores recompute the missing regression model so trend lines, CI/PI, and on-graph statistics survive reopen/recovery.
- Fixed on-graph statistics placement through the shared annotation contract. Multiline summaries are now measured and kept inside the live SVG viewport during redraws, legend changes, resizing, and dragging; Line starts in its clear lower-right region, Scatter no longer extends past the right edge, and font edits preserve the authored multiline tspan layout.
- Fixed Box worker statistics checking `Show pairwise comparisons` without publishing its lines and labels. Local and worker results now share one publication order, data-only stats refreshes preserve live graph geometry, and completion projects stored comparisons onto the latest committed owner frame before significance layout.
- Fixed legend formatting clicks being retargeted to the draggable legend container. Pointer capture now begins only after a real drag, so legend text opens the extended font toolbar while drag, tab ownership, live border updates, persisted commits, and undo remain intact. Legend text now defaults to a dedicated Legend scope. Continuous Heatmap and Surface scales retain their numeric-scale sizing and use a separate Scale scope without categorical Legend border, Style, or Transparency controls. Heatmap font changes now redraw only from the shared committed style event, eliminating the scale-font redraw loop caused by observing its own rendered attributes.
- Fixed Box feature edits causing unnecessary full redraws. Palette and theme changes now update the published graph in place, Density samples refreshes only the violin layer, payload projection cannot leak through the tab-owned draw scheduler, and geometry-changing view-only updates retain the previous frame until atomic replacement.
- Split PCA examples by table contract. Standard mode now loads all 6 subjects and 11 time points from the Indomethacin pharmacokinetics study, with PC1–PC3 retaining 96.29% of standardized profile variance; Grouped samples retains the 540-measurement mouse-protein design built for explicit group headers.
- Normalized Scatter's automatic palette around effective point formats. Unique-label and rare-label one-format data now use Grayscale without hidden per-label colors, while repeated multi-format labels use Color (high contrast); example loading, table paste/import, rendered points, point controls, and the palette picker now remain consistent.
- Fixed shared statistical-report decoration being delayed until tab reactivation. Creating any tracked component report now synchronously installs its significance threshold, p-value format toggle, and significance badges on the owning results panel; Pie exposes these controls immediately after its first calculation without relying on a tab switch.
- Added tab-owned point-label typography for Scatter and PCA. The shared font toolbar now offers Selection, Labels, and Graph scopes; individual/all-label sizes persist across reopen, feed the collision and boundary layout, preserve existing label positions during formatting, and retain dragging and connector behavior.
- Fixed Scatter and PCA point-label leaders remaining visibly detached after 3D rotation. The shared geometry now uses clearance only for placement and renders every straight connector exactly from the point boundary to the label boundary.
- Fixed Scatter 3D point labeling and recovery capture. Cached 3D point projections now receive row-label selection changes, and legend interaction rehydration accepts valid legend-free graphs without aborting live-DOM restoration.
- Set new Scatter and PCA point labels to a shared 10 pt baseline while retaining density-driven reduction and the 7 pt readability floor. Simplified Scatter's point-label context menu to one compact border with no padded outer layer or shadow.
- Fixed one-dataset Pie goodness-of-fit statistics. A single count column now uses an explicit equal-proportions null model instead of comparing the column with itself; the controls, result footnote, persisted analysis specification, and reproducibility report all identify that expectation.
- Fixed Data-values Heatmap color-scale endpoints by deriving cell colors, gradient stops, tick values, and tick positions from one canonical domain. Diverging ranges now label both symmetric endpoints, while all-negative ranges map from the negative color to zero in the correct direction; custom bounds and SVG exports use the same contract.
- Fixed empty Scatter graphs showing a blank plot. Empty axis columns now use the same shared input-table notice as other components instead of returning from the axis-availability branch after clearing the plot.
- Unified shared symbol numeric display formatting across all components: compact Fill/Shape size, Border width, and their picker fields now round to at most two decimal places while retaining full internal precision.
- Smoothed Surface resizing by publishing the same canonical 3D projection during pointer movement and release. Resize rendering no longer yields after touching visible geometry, and Surface now uses the fixed 3D viewport contract shared by Scatter, PCA, and Line, preventing half-rendered meshes, two-pass content fitting, and release-time geometry jumps.
- Refactored shared aggregate style undo around optional atomic owner snapshots. Symbol and additional-line controls can now restore heterogeneous multi-target state with one callback instead of replaying every scope; Scatter uses this path for all symbol fields, making 600-point Global shape undo/redo complete without the previous multi-second toolbar block.
- Fixed Scatter Fill/Shape edits for individual and Global scopes. Explicit point overrides now outrank unique-label uniform defaults, while Global shape uses owner-session state even when per-label shape maps are intentionally empty; both paths work in 2D and 3D.
- Refactored toolbar numeric wheel editing into owner-scoped gesture transactions: rapid wheel events now update live at most once per animation frame, respect each control's declared step/min/max/precision, and commit once after idle for a single undo transaction. Removed legacy hard-coded 0.5 px wheel deltas from shared thickness/size controls, normalized portaled picker numeric mirrors, and made Axis length use move-phase live resizing followed by one generation-guarded latest-wins refinement so stale corrections cannot reverse the resize.
- Completed the restored-graph interaction contract. Axis controls now persist serializable axis identity/bounds metadata and re-adopt cached hit targets; inline editors persist a semantic editable marker; all 11 components rebuild owner-bound graph interactions immediately after cache deserialization. Shared lifecycle validation now rejects any restored SVG that declares an axis or inline-edit interaction without a live binding, so reopen/recovery never publishes a visually restored but behaviorally dead graph. Fresh rendering and restore reuse the same component binders, including Box, Line, ROC, Survival, Histogram, stacked-bar Pie, PCA, Venn/UpSet, Scatter, Heatmap, and Surface.
- Fixed crash-recovered PCA and Line legends being clipped or collapsing the SVG container. Legend envelopes now use their canonical placement rather than a dragged position; stale pre-contract legend caches are rejected, and current caches restore live owner-scoped drag handlers without a click-triggered redraw.
- Fixed legend dragging across all components so reopened and recovered render caches rebind a shared owner-scoped drag contract before input. The first gesture now moves and persists the legend without cache invalidation or SVG redraw; Surface uses the same contract for its scale.
- Fixed same-component deactivation forwarding so owner-scoped cancellation runs before workspace switching. ROC now owns and invalidates staged frames, refreshes mismatched graph types before snapshots, restores large-dataset manual-update controls, and never archives another tab's stale ROC frame.
- Corrected the component-layout aspect-policy regression fixture so it runs with its required Line DOM rather than inheriting unrelated ROC markup.
- Fixed Heatmap tab-preview fidelity: previews now use the live rendered panel dimensions instead of stale resizer metadata, preserve Data-values proportions when rasterized, and scale non-scaling dendrogram strokes with the thumbnail rather than rendering them at full-screen weight.
- Fixed the Box Violin density/axis contract: density always uses the complete dataset and point visibility affects only the overlay. Added a persisted, tab-owned Violin extent choice; new graphs use extended KDE tails by default and expand the automatic axis before scale creation, while optional data-range truncation uses closed, fully stroked caps. Legacy files retain their historical extended-tail behavior.
- Fixed Box axis flipping after Dataset spacing changes: flip transitions now transpose the allocated plot extents, so categorical spacing is applied exactly once and both visible axis lengths preserve their proportions across repeated flips.
- Fixed shared Cartesian SVG margins so the outer 8 px gutter starts after the rightmost X-axis endpoint label; categorical axes account for their half-band inset instead of adding blanket padding.
- Fixed Box palette replacement so transparency-only style overrides remain color-neutral: overlays use the unified color in Unified mode and their dataset palette color in Individual mode.
- Added direct dragging for Scatter and PCA point labels. Dragging updates only the chosen label and its straight connector; the label becomes a tab-owned pinned obstacle, later labels optimize around it, and relative positions survive resizing, tab switches, payload save/reopen, and 3D rotation redraws. New PCA sessions now project their own defaults before DOM setup, preventing fresh same-component tabs from inheriting the previous tab's label state.
- Fixed oversized PCA graph height: shared 2D aspect fitting now preserves the canonical Y-axis span and varies or extends only the X-axis span, so PCA keeps its equal-scale default without becoming taller than sibling plots. Fixed PCA, Scatter, and Line 3D plots being shrunk by a second content-bound viewport fit.
- Refactored individual-point labels in Scatter and PCA around one bounded global layout engine: it jointly minimizes label/label, label/leader, leader/leader, and point collisions, trims leaders at their source marker, remains independent of label input order, and uses spatial indexing plus adaptive search limits for dense plots. Connectors are always single straight lines with a hard 90-degree minimum attachment angle, label boxes are strictly contained by the SVG viewport, and density scaling plateaus at a publication-readable 7 pt in 2D and 3D.
- Fixed Survival legend sizing when `Number at risk` is enabled: the shared SVG viewport fitter now keeps non-legend right-side reserves in its aspect baseline before appending the legend reserve, so toggling the legend extends the viewport without shrinking the survival plot or compounding the risk-table envelope. Added shared-unit and Chromium regressions for the combined risk-table + legend layout.
- Fixed the remaining first-drag axis-margin parity defect after render-cache restore. The shared one-axis margin stabilizer now distinguishes provisional multi-pass layout estimates from committed baselines; Box, PCA, and Survival no longer let their pre-tick-measurement margin pass seed an empty post-restore lock. Restored Box graphs therefore keep the same Y-axis and Y-title X anchor during the first horizontal resize as a continuously live graph.
- Reworked the August 9–10 E2E regression fixes from the Windows evidence: Box significance reserve now uses the existing exact two-dimensional resizer path and commits the ratio of the physical frame without changing the shared resizer contract; Histogram keeps the shared orthogonal viewport lock; Heatmap reuses completed exact clustering by processed-data/algorithm identity after render-only cancellation; Line and Scatter preserve the Y-title anchor during width-only live resize while Scatter skips non-geometric live-frame work; Surface binds and resolves only the requested owner root and preserves its committed viewport through 3D rotation; and Venn hydrates a lazy active owner from its durable payload before runtime projection so GO/STRING results survive reopen. The only assertion adjustment remains the stale UpSet pixel-only font check, now coupled to the actual SVG font-size change, while the Surface recovery test waits for the owner rotation transaction to settle before applying the unchanged strict fit assertion.
- Fixed Scatter 3D redraws to carry the explicit owner tab into font-style resolution, preventing style and tab-return redraws from aborting the owner draw cycle.
- Hid the Survival legend by default when creating a new graph because the default number-at-risk table already identifies each group; saved and legacy graphs retain their recorded or historical legend state.
- Fixed Survival series-color edits so curves, confidence bands, censor marks, risk-table text, and legend swatches update from one owner-session value immediately and remain consistent in crash-recovery render caches.
- Refined Survival number-at-risk figures to publication-style `at risk (cumulative censored)` rows, group-colored values, a regular-weight title, a measured balanced separator, and axis-label-matched typography while preserving colors during partial font edits, tick alignment, and SVG export.

- Audited and normalized the new on-graph statistical display system end-to-end: annotation typography/geometry now share one stateless renderer, affected components import/export font styles with explicit tab ownership, async draw completion persists to the draw owner rather than the projected tab, Match Styles covers the new visibility/risk-table controls, legacy archives preserve pre-feature visual semantics, ROC reuses one AUC analysis per curve, and focused regressions cover restored defaults, effect-size labeling, risk-table typography, relative positioning, and concise multi-series summaries.
- Fixed graph statistical-summary typography across Scatter, Line, Histogram/Density, Pie, ROC comparisons, and Survival: all shared summaries now use one normalized default size, participate in the shared font toolbar, and retain per-tab font styling through the existing font-style persistence contract. Scatter now uses the same shared SVG statistical-annotation primitive as the newer components instead of a private text renderer.
- Fixed Survival number-at-risk row labels colliding with the first time-point counts by reserving a measured label gutter and right-aligning group names immediately left of the aligned risk-count columns.

- Added publication-oriented statistical annotations across the figure types where they improve interpretation without duplicating full reports: Survival now supports an SVG-integrated number-at-risk table plus compact HR/log-rank summaries; ROC/PR legends include AUC confidence intervals/AP and can show the selected curve comparison; Line uses density-aware regression summaries; Histogram/Density supports single-series descriptive or two-series KS summaries; Pie/stacked charts support compact global-test summaries; and a shared stateless SVG annotation primitive normalizes rendering/drag behavior while leaving ownership and persistence component-local.
- Corrected correlation-heatmap significance for multiplicity: each unique off-diagonal pair is adjusted once, Benjamini-Hochberg FDR is the default, BY/Holm/raw-p alternatives are available, and rendered values use q/adjusted-p semantics rather than treating adjusted values as raw p.
- Corrected Pie goodness-of-fit reporting so the computed effect size is identified as Cohen's w rather than Cramer's V; contingency/homogeneity analyses continue to report Cramer's V.
- Persisted all new annotation visibility and draggable-position controls through owner-session state, runtime/recovery snapshots, and saved payloads, including explicit empty-payload defaults for reopen parity.
- Fixed the Line stats-on-plot toggle to resolve its owner through the existing projected-session contract; the initial implementation referenced a nonexistent event-session helper and failed at runtime after statistics were calculated. Added same-component regression coverage for annotation ownership and tab isolation.
- Corrected the Line 3D interaction regression test to assert the real animation-frame contract: rotation is transiently pending until the scheduled in-place frame runs, then settles without replacing the SVG.
- Refactored 3D draw/gesture lifecycle consistency: the shared Plot3D registry now reconciles detached owners before publishing a new gesture, Line 3D header normalization no longer schedules redundant nested draws, and Surface/PCA expose explicit draw-in-flight snapshot barriers plus settled lifecycle events.
- Hardened the targeted 3D Jest contracts so Line waits for its true 3D example draw and Surface render-cache assertions wait for the completed owner draw rather than sampling an intermediate frame.
- Corrected the focused 3D/recovery regression suite after Windows validation without adding production interaction churn: rotation unit tests now close every pointer transaction explicitly, Line view tests derive labels from the current literature example and exercise the real managed-pointer path, Surface render-cache coverage loads its example registry explicitly, and the recovery-race fixture models the intended in-flight race rather than starting behind the outer interaction gate.
- Refactored all interactive 3D rotation into one shared owner-scoped interaction transaction. Pointer capture now survives SVG boundary exits, harmless same-owner rebinding cannot terminate an active drag, canceled gestures roll back without dirtying the document, and Line, Scatter, PCA, and Surface rehydrate their fast rotation path from the exact active tab owner. Recovery checkpoints now treat an active rotation as an absolute barrier at scheduling, readiness, and live-owner capture boundaries, retain a pending checkpoint across in-flight races, and resume exactly once after the gesture settles; focused Jest and Chromium contracts cover boundary crossing, tab switching, stable SVG identity, dirty-state timing, and recovery interlocking.
- Refactored restored-graph click replay around one canonical owner token: the listener registration, captured tab object, and `workspaceState.activeTabId` are validated after asynchronous redraw, before hit-testing, and again before dispatch, so listener replacement, stale compatibility getters, and cross-tab DOM targets cannot revive an interaction. Replaced platform-dependent welcome-asset byte hashing with versioned, LF-canonical text provenance and structural SVG ID rewriting, making full/targeted publication and source, SVG, and inline-registry hashes deterministic across Windows, Unix, and tab creation order without weakening freshness checks.
- Fixed graph-edit capture listener ownership so fresh module/bootstrap evaluation replaces stale document listeners instead of duplicating drag/click handling. Heatmap color-scale IDs are now deterministic and owner-scoped, eliminating nondeterministic welcome SVG publication.
- Audited the complete post-`main` change set for owner isolation and corrective code paths. Active 3D gestures now capture one immutable owner binding, cancel cleanly before SVG/session rebinding or lost pointer capture, and cannot mutate a newly active tab; restored-graph click replay likewise requires the exact original active tab, component, mounted owner root, and connected graph target before dispatch.
- Fixed Windows portability and test isolation in the post-audit targeted suite: generated contract paths now use POSIX output, graph-edit listeners can be explicitly uninstalled, and replay tests track the exact active owner.
- Normalized Box restored-cache replacement onto the shared atomic frame publisher instead of maintaining a second swap implementation. Scatter and Heatmap data-aware defaults now write through to their owner session and canonical tab payload immediately, including automatic Scatter legend restoration when uniform-label data is replaced, so save/reopen and recovery no longer depend on a later incidental capture.
- Hardened generated-artifact quality gates: targeted welcome-thumbnail generation can no longer reuse stale SVGs and relabel them with fresh provenance or leave ignored staging directories after an early failure, all 11 owner-rendered SVG assets were regenerated, and the component-contract `--check` command is now strictly read-only. Removed an unreferenced SVG scratch page and stale/resolved backlog entries.
- Rebalanced welcome-page typography so the product title, tagline, action headings, section headings, graph-family titles, and example labels form a clear descending hierarchy without oversized card headings.
- Reordered the welcome import card copy so its purpose appears before the supported file-extension list.
- Simplified the welcome-page hierarchy by removing redundant introductory and eyebrow copy, shortening the graph-family heading to "Choose a graph type", compacting the Browse action, and reallocating the recovered width and height to substantially larger Popular examples thumbnails while retaining four equal-width cards and the existing carousel behavior.
- Smoothed welcome carousel wheel navigation by coalescing mouse-wheel and trackpad deltas into one requestAnimationFrame-driven motion, temporarily suspending CSS snap during the gesture, then settling cleanly onto the nearest card.
- Converted the existing Popular examples strip into an accessible horizontal carousel containing all 11 examples, with equal-width cards, discreet previous/next controls, mouse-wheel and keyboard navigation, responsive visible-card counts, and correct disabled states at each end.
- Removed the decorative purple-to-blue gradient rule from the Popular examples panel on the welcome page.
- Welcome example gallery cards no longer render the redundant "Open example" footer; the full card remains the single interaction target.

- Tightened the all-examples gallery with centered, bounded responsive card tracks (190–212 px), fitting five previews across the standard desktop dialog while preserving readable copy and the existing single-column mobile layout.
- Regenerated every welcome example from the canonical component viewport with the existing canonical legend policy and **Show graph title** disabled through the real component controls. The generator now preserves the source SVG viewport and `preserveAspectRatio` mapping before fitting the card, then bakes `non-scaling-stroke` widths into scalable SVG geometry so heatmap dendrograms, scale borders, and future responsive thumbnails shrink proportionally at every card size.
- Added manifest provenance and asset regressions for graph-title suppression, source viewport projection, responsive stroke baking, and complete removal of residual non-scaling strokes.
- Eliminated Box graph flicker when the first axis, symbol, or text edit rehydrates a cache-restored graph. Shared graph-edit redraws now explicitly request committed-frame preservation; Box builds the replacement SVG offscreen and swaps it atomically before replaying the original click.
- Increased raster tab-preview fidelity without enlarging the tooltip: PNG previews now render at a device-aware 2×–3× backing resolution, retain their logical preview dimensions, record their raster scale and pixel dimensions, and regenerate when that scale changes.
- Fixed Scatter 3D tab previews that collapsed every transformed marker into the upper-left corner. Static scatter export optimization now preserves transformed/depth-sorted and mixed marker layers, keeps the original layer attributes and paint order, batches only safe opaque fill-only circle runs, and applies the rewrite only when it actually reduces serialized size.
- Added focused unit and Chromium preview-contract assertions for supersampled PNG dimensions, transformed Scatter 3D marker preservation, mixed-marker safety, and owner-scoped raster metadata.

- Replaced Line 3D and Scatter 3D rotation-time full component redraws with owner-scoped geometry renderers. Rotation frames now reuse stable SVG, title, legend, paths, and marker nodes; update only projected axes, grid, series, points, and manual labels; reject stale tab/SVG owners; and restore the serializable geometry model from the owning render cache after reopen or crash recovery.
- Normalized interactive 3D rotation to an explicit owner-scoped gesture contract across Surface, PCA, Scatter, and Line. Asynchronous frames now require the captured tab, component type, mounted root, and exact SVG projection to remain current; canceled, stale, or rejected work clears only that owner’s pending rotation state; a moved rotation consumes only its synthetic follow-up click, while ordinary graph edits keep the shared restored-cache behavior.
- Reworked Surface rotation around a serializable owner-owned geometry model and transient DOM pools held in session refs and rebuilt from the owning restored SVG. Fast frames hide unused pooled nodes, preserve the color-scale legend in a stable overlay layer, retain editable/font-aware axis labels, and reject stale owners or incomplete pools instead of retaining old orientations.
- Fixed Scatter 3D recovery publication by emitting the canonical points-layer and render-mode metadata required by its visual-readiness validator, eliminating false empty-graph fallback failures after crash recovery. The fallback statistics renderer also now creates its table before applying section metadata, removing a latent declaration-order ReferenceError.
- Preserved PCA's precomputed 3D rotation renderer and analysis cache across tab switches, including round trips through Scatter 3D, and removed its redundant release-time full redraw.
- Removed Line's redundant release-time redraw, corrected its rotation binder to receive the resolved invocation owner, and retained the exact owner SVG in the session reference schema.
- Added focused unit and Chromium coverage for managed-gesture click semantics, exact owner/SVG rejection, Scatter 3D recovery publication, Surface mixed-3D recovery without ghost frames, PCA geometry reuse, and Line 3D owner binding.

- Made Scatter's untouched color-scheme default data-aware: single-dataset and sparse/unique-label plots now start in Grayscale, sparse/unique labels render as one point type with the legend hidden by default, and explicit user color/legend choices remain authoritative across save and reopen.
- Defaulted Heatmap correlation values off above ten conditions while preserving any explicit user toggle, shortened the Box ToothGrowth example labels, and fixed Box's restored-cache first-click toolbar replay by tracking queued draws as non-idle tab-owned work.
- Defaulted multi-dataset Histogram fills and borders to the same 65% opacity (35% transparency), including separate-panel layouts and the Trace toolbar's reported value.
- Replaced Venn's title-unaware set-label nudging with one measured initial layout pass that reserves a fixed graph-title band, fits the circles into the remaining frame, and evaluates top/bottom outer-arc placements for all two- and three-set combinations. After that automatic placement, Venn and UpSet titles plus Venn set/region labels are free presentation elements: dragging them never schedules a graph redraw, never changes the SVG viewport or plot geometry, and may intentionally overlap other content. The exact owner-scoped Venn layout is cached by data, graph size, and typography inputs, reused across non-geometric redraws, invalidated when those inputs change, and all manual positions persist independently per tab through undo/redo, save, reopen, and recovery.
- Replaced the weak showcase datasets after a literature-backed review: Scatter now uses all 569 WDBC tumors with the strongly correlated measured radius/perimeter pair; PCA uses 540 balanced control-mouse protein measurements and the 11 successful-learning proteins validated by Kulan and Dag; Line uses daily summaries of the 180-observation chronic sleep-restriction study; Histogram uses valid Pima two-hour glucose measurements by five-year diabetes outcome; Pie uses the four directly published TCGA breast-cancer subtype counts; and Surface uses the standard 21 × 21 MATLAB `peaks` benchmark. Updated every affected Notes block and provenance table, selected the PCA grouped schema through durable example metadata, improved the default Surface camera, regenerated all eleven Graphitix-rendered SVG thumbnails, and added focused richness, preprocessing, correlation, geometry, and strict Notes-format regressions.
- Rebuilt the welcome gallery as eleven flattened, self-contained vector SVG projections generated from the real owner-mounted examples. The generator now uses each component’s canonical export source when available, disables ordinary legends through the component’s real **Show legend** control, rejects raster `<image>` payloads, prefixes every internal SVG ID/reference, and validates both inline rendering and standalone browser decoding before publication. Heatmap is now a genuine vector SVG rather than an SVG wrapper around an embedded PNG.
- Removed external `<img src="…svg">` thumbnail loading from the welcome page. A generated, hash-validated `thumbnails.js` registry mounts the SVGs inline, avoiding MIME/server-dependent SVG decoding failures while retaining the individual SVG files for inspection and packaging. Missing or invalid registry entries degrade to the existing graph-family icon instead of exposing broken-image UI.
- Added per-component source fingerprints covering the built-in datasets, component renderer, shared rendering/runtime code, workers, styles, and generator contract. Pages and desktop synchronization validate those fingerprints and automatically regenerate stale thumbnails before packaging; the manifest records source provenance, capture mode, vector/raster status, registry hash, and content hashes.
- Added the missing Surface **Show legend** setting and normalized it to the shared geometry-neutral legend contract: hiding its continuous scale changes only the SVG envelope, never the plotted surface coordinates. Focused asset contracts reject stale files, executable/external or nested SVG content, raster payloads, retained legacy PNGs, or a rendered legend after canonical suppression.
- Redesigned the welcome workspace around a restrained scientific-editorial hierarchy: a compact product statement, aligned import/search/example entry points, clearer graph-family cards, a four-item Popular examples strip, and an accessible gallery covering all eleven graph families. The complete asset tree is now copied into both Pages and desktop builds so dynamically referenced gallery examples cannot be omitted.
- Added Histogram and Density small multiples inside the existing single SVG: multi-series distributions can remain overlaid or render as horizontal, vertical, automatic, or grid panels with a mandatory shared X domain, optional shared Y scaling, adaptive tick/title layout, and owner-scoped save/reopen/tab-isolation persistence. Histogram panels reuse pooled common bin edges; Density panels evaluate each KDE on the same X domain.
- Unified Histogram and Density under one durable `config.seriesLayout` rendering contract, eliminating the density-only fallback that disabled panel controls and restoring the exact selected arrangement when switching plot modes, tabs, reopened files, or recovery sessions.
- Prevented histogram and density SVGs from entering the shared orthogonal viewport-lock stretch path during resize; redraws now preserve `xMidYMid meet` geometry instead of non-uniformly scaling bars, curves, axes, and labels.
- Added focused unit and Chromium contracts for histogram/density panel geometry, common domains, shared/independent Y scales, one-SVG publication, mode transitions, resize aspect invariants, and durable layout state.
- Reworked Histogram/Density panel tracks so every small-multiple plot rectangle has identical X- and Y-axis lengths while axis-label reserves are allocated only to the rows and columns that display them; panel titles are now centered on the plot rectangle rather than the surrounding label cell.
- Released the transient legend viewport envelope before measuring any no-legend or separate-panel render, preventing a previous overlay legend from leaving an artificial right-side reserve after switching layouts.
- Fixed Histogram/Density panel Y-axis graduations by sizing vertical tick capacity from label height instead of label width and thinning automatic ticks with one regular stride, eliminating skipped intermediate graduations caused by irregular index sampling.
- Moved Histogram/Density panel-only controls to a dedicated second row in the Graph section, shown only for Separate panels, so the primary graph-type row remains compact at narrow widths.
- Audited the complete Histogram/Density small-multiple implementation against `AGENTS.md`: panel settings remain owner-session state, user changes synchronously flush through the standard owner-session persistence API, scheduled draw metadata is plain and tab-scoped, all panel geometry is derived, and save/reopen/recovery retain the same `config.seriesLayout` contract.
- Prevented stale Histogram runtime snapshots from overwriting a newer owner-session `seriesLayout`; runtime replay may seed the panel contract only when no owner session exists, while hydrated or user-modified session state remains canonical.
- Fixed Line 3D example loading so descriptive, user-editable axis titles remain a canonical two-row 3D schema instead of triggering repeated legacy conversion, dataset-column growth, and duplicated header rows.
- Constrained every shared draggable legend to the complete current SVG viewport, including restored positions and 2D/3D views, so no legend edge can be moved outside its container.
- Made legend visibility geometry-neutral across Box, Scatter, PCA, Line, ROC, Survival, Histogram, and Pie: the SVG and visible graph card extend around the legend, while the plot keeps its exact size. Long legends wrap into height-bounded columns, the new frame and card envelope publish together to prevent toggle flicker, radial Pie expands its clipping plot host on the initial render, and manual resize handles remain on the visible outer edge.
- Fixed narrow stacked Pie graphs so rotated x-axis labels use the shared projected rotation geometry; the SVG/card gains the exact bottom reserve, while the shared Box/Pie categorical inset keeps the first label inside the left edge and moves the Y axis with its datasets.
- Fixed grouped-replicate Box graphs so the legend extension is applied only to the final SVG viewport and never fed back into plot, font, or axis sizing.
- Rehydrated legend envelopes after owner-validated render-cache restoration without changing cached SVG geometry.
- Fixed rotated Box x-axis labels at the left edge with an internal categorical inset, keeping labels in bounds while preserving the Y-axis-to-dataset spacing and graph frame.
- Replaced every built-in component example, including mode-specific Scatter, PCA, Line, and Box variants, with curated biomedical-literature data and explicit paper/figure provenance in the component Notes section.
- Fixed opened example provenance Notes so their intrinsic text width cannot expand plot stacks and push graph control panels offscreen, and changed the shared Notes content default to 10 pt.
- Normalized Data and Format toolbars to one shared panel contract: 70px height, white surfaces, standard title slots, 52px control rows, and consistent outer insets and inner horizontal padding.
- Added an immutable shared biomedical example registry that deep-clones records per load, eliminating duplicated component literals while preserving same-component tab isolation and normal Notes persistence through save, reopen, and recovery.
- Added rich paired/repeated designs, including three paired aSAH ROC predictors for all 113 patients, all six Indomethacin pharmacokinetic profiles, the complete 23-patient AML survival dataset, complete ToothGrowth measurements, WDBC multivariate views, and TCGA subtype gene sets.
- Added a provenance manifest and focused contracts for registry coverage, clone isolation, Notes integration, dataset richness, and paired ROC composition.

- Fixed the shared Playwright workspace launcher to wait for welcome-card hydration before clicking, removing four failed 10-second retries for later cards such as ROC, Survival, and Pie.
- Added one shared owner-safe toolbar overflow rail for General, Data, and Format sections. Controls remain in their original DOM/state surface while directional chevrons, item-aware scrolling, touch/trackpad support, Shift+wheel scrolling, and focus reveal make every action reachable at constrained widths.
- Fixed toolbar scrollers so clicks only move the active rail, context panels open at the left edge, and flat full-height Excel-style arrows replace floating shadowed buttons and gradient fades.
- Normalized Data transforms and simultaneous Format panels to a single non-wrapping row; overflow position is transient UI projection that resets on toolbar-section or tab-owner changes and is never serialized into `.graph` state.
- Added shared fixed-position toolbar popup placement so Open, custom-transform, font, notation, additional-tick, and broken-axis menus escape the horizontal viewport without cloning controls or creating a second state authority.
- Added stable section-ID activation for toolbar UI-state restore, replacing the previous incompatible DOM-element/label call boundary.
- Added focused unit and Chromium contracts for DOM identity, directional affordances, owner resets, focus and wheel behavior, popup clipping, narrow General/Data sections, and multi-panel Format overflow.
- Made inactive Scatter, PCA, and ROC payload reads projection-free: when persistence requests a non-projected owner, each component now returns that tab's canonical payload verbatim instead of reading the currently mounted sibling's grid, controls, or statistics. This fixes same-component Save/reopen signature drift that could appear in unchanged components after shared persistence timing changed.
- Fixed Scatter table access so explicitly resolving an inactive owner no longer replaces the module's projected AG Grid, and corrected grouped-header normalization to operate on the exact target grid.
- Made Scatter and PCA example loading commit the owner-scoped canonical payload synchronously through the shared AG Grid write-through API, eliminating the race where a graph was visible before `tab.payload.data` existed.
- Normalized Survival render caching to graph-only checkpoints. Statistics remain canonical payload models instead of duplicated serialized DOM, preventing table-model degradation in two-tab reopen/recovery.
- Strengthened persistence readiness and added focused inactive-payload and Scatter color-scheme/AG Grid ownership regressions.

## 2026-08-01 — Component-owned render-cache provenance enforcement

- Validate newly captured version-2 render caches before any shared presentation normalization, rejecting missing, wrong-owner, wrong-component, incomplete, or conflicting provenance instead of relabelling it with the active tab.
- Standardized all eleven graph components to emit owner-resolved `version`, `component`/`type`, `tabId`, and semantic `complete` metadata from their capture hooks.
- Added one shared `renderCacheSchema` authority used by session persistence and archive construction, removing duplicated owner/component parsing and preserving legacy archive compatibility only on reopen/save paths.
- Removed the remaining mounted-DOM archive fallback so Save and recovery can include only exact component-owned checkpoints.
- Added rollback-only restoration for DOM detached by a rejected capture; the temporary corrected view is never stored and the component-produced cache is never mutated.
- Added schema, capture-provenance, prior-checkpoint preservation, conflicting-alias, and non-mutating normalization regressions.

## 2026-07-31 — Testing infrastructure audit and refactor design

- Audited the complete Jest and Playwright infrastructure, including 330 test sources, setup harnesses, component matrices, persistence/recovery coverage, runners, discovery rules, fixed waits, source-text contracts, and validation gates.
- Added an evidence-based testing infrastructure refactor plan, a detailed audit, and a machine-readable per-file inventory under `docs/development/`.
- Recorded the migration as an actionable backlog item while keeping the plan explicitly temporary and subordinate to `issues.txt`.

## 2026-07-31 — Venn test-suite normalization and checkpoint regression cleanup

- Replaced the legacy `venn.additionalTabOpen.test.js` grab-bag with focused runtime-ownership, GO/STRING ownership, and render-cache/recovery suites built on one shared full-app harness.
- Removed Venn-only duplicates of shared tab-switch, clean-default, and component-binding contracts; those behaviors remain covered by the all-component isolation suites and persistence matrix.
- Corrected stale checkpoint tests to require invalid archive caches to be discarded, recovery to use the same rich cache policy as manual Save, and mocked active tabs to be the canonical workspace tab object.
- Removed the Jest dependency on native `structuredClone` from archive tests.
- Fixed graph-sizing projection so an explicit finite payload bound can replace an unlimited default-layout bound, while omitted payload bound policy continues to preserve the layout default.

## 2026-07-31 — Final render-cache lifecycle cleanup and full-component parity matrix

- Removed the generic mounted-DOM archive-cache fallback; manual Save and recovery now serialize only exact component-owned checkpoints with matching owner, component, payload, and layout provenance.
- Consolidated runtime render-cache envelope installation and made finite/unlimited graph-sizing merges symmetric.
- Standardized Venn and ROC cache metadata on the shared version-2 component contract.
- Refactored the persistence browser matrix around reusable archive/hydration assertions: every component retains focused one-tab and same-component two-tab Save/reopen coverage, while one mixed document now verifies two tabs per component across both Save/reopen and recovery.
- Reduced diagnostic attachments by omitting archive base64 payloads while preserving archive size, provenance, signatures, and event traces.
- Added regressions proving archive construction cannot manufacture caches from mounted DOM and finite graph bounds can replace previously unlimited bounds.

## 2026-07-31 — Recovery parity test explicitly verifies runtime rehoming

- Strengthened the owner-neutral recovery layout comparison with independent assertions that each recovered layout's tab ID, workspace ID, resizer scope, cache owner, and runtime owner all match the newly allocated runtime tab.
- This keeps legitimate ID rebasing out of durable-layout equality while ensuring the normalization cannot hide a missed or cross-tab rehome.

## 2026-07-31 — Recovery cache contract test uses owner-neutral layout comparison

- Corrected the render-cache recovery parity test to compare canonical layout content after normalizing runtime workspace IDs.
- Retained raw runtime layout signatures in diagnostic attachments and continued to verify cache owner identity separately.
- This prevents legitimate recovery rehoming (for example `workspace-2` to `workspace-5`) from being reported as layout-state corruption.

## 2026-07-31 — Venn/ROC semantic cache publication fix

- Replaced geometry-dependent Venn and ROC publication checks with renderer-owned semantic trace/series markers, so completed graphs remain cacheable during deactivation and under zero-geometry test DOMs.
- Corrected the render-cache persistence fixture for ROC to vary a score column while preserving the binary classification label column.
- Stabilized focused Venn/ROC cache tests by awaiting the components' asynchronous draw/readiness contracts before direct capture.

## 2026-07-31 — Component render-cache contract normalization

- Gave Venn and ROC component-owned published-graph checks and complete owner/type cache metadata so save/recovery capture no longer depends on generic workspace DOM heuristics.
- Made ROC cache graph-only and rebuild its statistics surface from durable owner state after hydration; restored ROC curve interaction listeners explicitly instead of serializing dead stats/control DOM.
- Made Scatter cache eligibility projection-free by removing presentation-state and active-module checks from validation; DOM mutation remains guarded in restore.
- Added focused Venn, Scatter, and ROC cache completeness, tab-provenance, inactive-validation, and graph-only statistics restoration coverage.

## 2026-07-31 — Canonical layout authority and recovery checkpoint stability

- Stopped persistence from merging payload graph-sizing metadata back over an exact owner-captured layout; `meta.graphSizing` remains a one-way compatibility mirror.
- Preserved a clean restored tab's canonical layout and exact cache checkpoint across ordinary tab deactivation instead of recapturing normalized DOM defaults.
- Added explicit unlimited-height persistence and synchronized the projected CSS aspect ratio with the canonical graph dimensions.
- Treat the consumed recovery archive as current after restoration, preventing the delayed `recovery-restored` checkpoint from rewriting payload/layout and clearing successfully restored caches.
- Recorded the remaining hard-crash durability window created by the 2.5-second trailing recovery debounce.

## 2026-07-31 — Save/recovery cache and canonical-state parity

- Removed the hidden idle/high-fidelity recovery split. Crash recovery now persists the same exact owner-scoped completed render-cache checkpoints as manual Save.
- Separated cache capture from cache inclusion and reuse an already-exact active checkpoint instead of recapturing it on every recovery write.
- Removed the volatile Box descriptive-table timestamp from canonical payload state.
- Stopped Survival payload hydration and payload reads from replacing durable statistics-panel models with a different DOM-shell representation.
- Added focused Box/Survival crash-recovery cache parity coverage alongside updated snapshot-policy and session checkpoint contracts.

## 2026-07-30 — Durable render-cache checkpoint tier

- Separated bounded warm runtime caches from archive-ready cache checkpoints: every successful owner-scoped capture now stores an exact serialized cache before runtime pruning.
- Warm-cache limits can no longer make a completed inactive tab disappear from manual Save or crash recovery; payload/layout changes still invalidate both cache tiers.
- Tightened the deactivation helper contract and added a four-tab regression proving that a pruned runtime cache remains recoverable from its owner-scoped archive checkpoint.
- Enforced embedded component provenance during save and restore, and discard invalid archive cache objects instead of retaining unusable cache payloads with null signatures.

## 2026-07-30 — Owner-complete render-cache checkpoints

- Capture each completed graph cache while its owner is still active during tab deactivation, so manual save and crash recovery can serialize inactive tabs without reading another tab's projection.
- Removed stale-cache relabeling after payload changes; changed payload now invalidates the exact render provenance until the next completed owner-scoped capture.
- Removed archive-only payload/layout enrichment. Checkpoints now clone the already committed canonical tab state, keeping cache signatures and archived geometry in the same render commit.
- Updated persistence unit contracts to reject stale cache preservation and to assert that archive construction does not mutate or re-normalize canonical state.

## 2026-07-30 — Render-cache matrix fixture correction

- Fixed the render-cache persistence fixture so canonical numeric variants are created correctly in matrix-style payloads whose data cells are primitive array elements.

## 2026-07-30 — Render-cache persistence diagnostics follow-up

- Count archive-backed live-DOM reuse as a structured hydration hit.
- Build cache persistence fixtures through canonical data edits and the shared resizer API instead of unsupported test-only layout fields.
## 2026-07-30 — Render-cache save/reopen contract diagnostics

- Added one shared owner-scoped render-cache diagnostic event stream covering capture, archive provenance, runtime rehoming, eligibility, component validation, hydration hits, visual rejection, and fallback redraws.
- Added separate save-phase and reopen-phase assertions so failures identify whether a cache was omitted/corrupted during archive creation or rejected/missed during reopening.
- Added a component matrix covering one tab, two same-component tabs with distinct payload/layout/statistics variants, and one mixed archive with two tabs for every component.
- Cache-contract tests now fail on fallback redraws for unchanged archives instead of accepting eventual graph publication.

## 2026-07-30 — Robust Box recovery publication validation

- Fixed a false-negative Box publication check that could roll back an otherwise successful multi-tab crash recovery after a forced payload redraw.
- Box recovery now recognizes semantic box/bar/individual-value graph marks while still rejecting pending or unpainted raster frames.
- Enabled readback-optimized Canvas2D measurement for significance-label ink scans.
- Added contract coverage for the publication validator and canvas context.

## 2026-07-30 — Regression contract cleanup

- Replaced stale global-DOM and pre-reopen tab-id assumptions in Box, Venn, and lock-ratio browser regressions with owner-scoped session and restored-tab resolution.
- Reframed resize assertions around semantic axis geometry instead of incidental SVG viewport offsets or outer-box proportions.
- Removed loading-spinner implementation assumptions while retaining Heatmap job-state, progress, responsiveness, and exact-clustering checks.
- Made forced-ratio resize undo coverage wait for the settled subtype contract before deciding whether a component is user-unlockable.

## 2026-07-30 — Bounded multi-workspace recovery activation

- Defined document restore completion by publication of the active owner graph instead of misusing snapshot-idle readiness during activation.
- Prevented recovery/open transactions from waiting on owner-scoped queued layout or statistics work that can remain pending behind the restore gate.
- Added recovery-contract coverage for cache-backed activation and archives containing two distinct tabs for every component, including different data and statistical options.
- Marked Box significance-label measurement canvases as readback-oriented to avoid repeated Canvas2D readback penalties.

## 2026-07-30 — Smooth Line 3D live rotation

- Kept Line's mounted 3D SVG as the live rotation surface so pointer capture remains uninterrupted.
- Suppressed cooperative rendering yields only for the bounded, view-only rotation frame, preventing the reused SVG from being painted between clear and rebuild.
- Removed detached-SVG rotation staging because SVG geometry measurement on an unmounted frame collapsed its viewport to the padding-only fallback.
- Extended the Line/Scatter browser regression to require non-empty marks and a valid measurable viewport in every sampled animation frame.

## 2026-07-30 — Smooth Line 3D rotation publication

- Line 3D rotation now renders each replacement frame off-DOM and atomically transfers it into the still-mounted owner SVG, preserving pointer capture without exposing a cleared intermediate frame.
- A final normal atomic publication after pointer release restores the full interaction bindings without changing the saved tab-owned rotation state.
- Expanded Line/Scatter 3D rotation coverage to sample painted animation frames and fail if graph marks disappear during a drag.

## 2026-07-30 — Small-viewport layout stability
- Fixed Line 3D rotation being interrupted after each small pointer movement by reusing the mounted owner-scoped SVG during rotation redraws, matching Scatter behavior; expanded 3D rotation tests to require continuous full-distance drags and stable SVG identity.

- Stopped `ResizeObserver` panel synchronization from forcing graph redraws when shared panel geometry did not change, eliminating the ROC redraw loop and page blinking on narrow/mobile viewports.
- Preserved reporting-panel and nested technical-record disclosure state across statistics re-render, tab capture, and restore, so Surface reporting sections no longer close after opening on constrained screens.
- Added shared unit coverage and a Chromium small-viewport regression for ROC settling and Surface disclosure stability.

## 2026-07-29 — Atomic graph publication

- Line, Histogram, ROC, Survival, Pie, and stacked-bar now build replacement SVG frames invisibly, finalize their viewport, and swap them into view in one step.
- Added one shared owner-aware frame-publication contract instead of component-specific staging copies.
- Cancelled or stale draws discard only the unpublished replacement and retain the last valid graph.
- Added focused publication, cancellation, live-resize, 3D-aspect, and tab-isolation coverage across the migrated renderers.

## 2026-07-29 — Owner-scoped draw completion

- PCA payload hydration now projects view mode silently instead of firing user control callbacks.
- Line, ROC, and Survival publish owner-scoped settled draw events; ROC and Survival public draws can be awaited directly.
- Replaced timer-based Line overlay, ROC statistics, and Survival Cox assertions with settled-render checks.

## 2026-07-29 — Flicker-free live graph styling

- Histogram, ROC, Survival, Line, and stacked-bar axis, grid, and trace style edits now update the committed SVG directly instead of starting a full redraw.
- Added one shared owner-scoped visual projection contract with resize-aware stroke scaling and stale-tab rejection.
- Cooperative cancellation remains unchanged for structural and data renders.
- Added unit and browser regressions for live publication, persistence, undo, and same-component tab isolation.

## 2026-07-29 — Canonical Line legends

- Line legends now show a short series line crossing the centered marker in 2D, 3D, and exported SVGs.
- Legend symbols inherit the rendered series line and marker styles through the shared legend renderer.

## 2026-07-29 — Histogram graph options and trace rendering

- Moved Histogram's legend toggle into the shared graph-options menu.
- Added global and per-series Trace transparency with tab-isolated archive persistence.
- Rebuilt histogram traces as one compound fill and one joint border per series; empty bins emit no baseline, adjacent bars share one separator up to the taller bar, and group-level transparency prevents doubled alpha at joins.

## 2026-07-29 — Smooth live graph resizing

- Restored uninterrupted live redraws for Histogram, ROC, Survival, Line, and stacked-bar graphs.
- Shared cooperative draw checkpoints no longer yield a blank painted frame during active resize phases; cancellation and normal long-render yielding remain intact.
- Added a cross-component browser regression using Scatter as the smooth-resize reference.

## 2026-07-29 — Histogram axis and multi-series layout

- Histogram X-min now defaults to Auto in the UI, session, payload, hydration, and renderer, so negative observations remain visible.
- Automatic density-domain padding now covers both X bounds; explicit manual limits remain exact.
- Multi-series legends now use the same fixed base viewport contract as ROC and Survival, preserving uniform graph and font scaling.
- Removed Histogram's duplicate legend minimum-width authority, which reduced the entire rendered graph when extra series were present.

## 2026-07-29 — E2E server URL parsing

- Replaced the deprecated Node URL parser in the local Playwright server.

## 2026-07-29 — PCA RNA-seq filtered data view

- RNA-seq normalized log preprocessing now creates a persisted AG Grid DataView containing the filtered, normalized genes.
- Moved the transformation math into the shared replayable data-transform contract.

## 2026-07-28 — Full test runner

- Added one PowerShell command for the complete Jest and Chromium Playwright suites.
- Failures are retried serially and summarized with errors and raw-log paths.

## 2026-07-28 — Cross-component statistics validation

- Fixed PCA statistics redraw metadata ownership, ARIMA forecast variance, and through-origin regression metrics.
- Standardized logistic error metrics and strict log-normal/exponential support validation.
- Corrected the ROC DeLong oracle quantile and replaced non-estimable logistic fixtures.
- Made all Python oracle dependencies explicit and capability-checked.
- All 35 cross-component statistics tests now pass.

## 2026-07-28 — Cross-component persistence matrix

- Added one browser matrix that discovers scalar graph parameters in every component and verifies hydration, manual archive reopen, and crash recovery.
- Safe fields are changed to non-default sentinels; remaining scalar fields are checked for exact round-trip preservation, with structured modes explicitly classified.
- Fixed shared Notes projection so programmatic text/open restoration cannot emit user callbacks and overwrite canonical session state.

## 2026-07-28 — Pie goodness-of-fit statistics

- Removed a copied contingency-table loop that referenced undefined dimensions in Pie goodness-of-fit calculations.
- Pearson chi-square and G statistics are now computed from the category vectors, and Cohen's w consistently uses the Pearson statistic.
- Updated the existing oracle regression to assert the correct goodness-of-fit effect-size contract.

## 2026-07-28 — Effective axis tick intervals

- Axis toolbars now show the rendered automatic X/Y tick interval, so spinner changes start from the visible value and increment by ±1.
- Box value-axis tick settings now follow the data axis across repeated flips and preserve decimal intervals in payloads.
- Pie stacked-axis edits now commit directly to their owning tab, so changing tick length preserves a manual tick interval.
- Scatter, Line, Histogram, and UpSet tick lengths now survive file reopen and crash recovery.

## 2026-07-28 — Active-tab AG Grid paste routing

- Paste now targets the highlighted cell in the visible AG Grid owned by the active workspace tab, even when tab creation or switching leaves DOM focus on the tab bar.
- Replaced competing per-grid document paste listeners with one owner-aware shared router; editable controls retain native paste behavior.
- Added new-tab, same-component switch, and cross-tab isolation regressions.

## 2026-07-28 — AG Grid numeric re-editing

- Plain numeric cells now reopen from the owning raw table matrix instead of a stale formula cache.
- Added shared lifecycle and browser regressions for edit, blur, double-click re-edit, and unchanged Enter commit.

## 2026-07-28 — Unified heavy tab previews

- Lightweight previews remain SVG; oversized or canvas-backed graphs now become one native-size, 1× PNG through the shared exporter. Download/Save remains 2×.
- Removed Box, Scatter, and Heatmap preview-only SVG/canvas composition and sampling paths.
- PNG completion is tab-, payload-, layout-, and generation-scoped. Stale work is rejected.
- Save, recovery, and reopen now persist and reuse the completed PNG, and checkpoints wait for pending conversion instead of archiving placeholders.

## 2026-07-28 — Responsive Heatmap data adjustments

- Moved Adjust data and Filter rows matrix materialization to a latest-only, tab-owned worker after the initiating control has painted.
- Coalesced rapid threshold changes, cancelled stale work on tab deactivation, and removed the duplicate pre-materialization redraw.
- Reduced full-matrix allocations and scans during parsing, filtering, empty-column pruning, and row normalization.
- Added worker parity tests and a browser responsiveness regression using an 8,000 × 12 matrix.

## 2026-07-28 — Heatmap render transaction and document-open completion

- Fixed the actual cause of Heatmap reopening/recovery never completing: label-clearance reflow recursively rendered a complete replacement frame, then the superseded outer render's `finally` block marked that frame incomplete. Heatmap now transfers render ownership explicitly during reflow so only the current transaction may publish or invalidate the graph.
- Normalized the workspace contract to call Heatmap's owner-scoped draw cycle directly and await its real result. The main registry no longer wraps Heatmap in a second detached frame scheduler.
- Normalized live graph publication to the shared primary-data-mark validator used by sibling components. Heatmap's stricter atomic completion and matrix-dimension checks remain confined to render-cache capture/restoration, where partial frames must be rejected.
- Added owner-scoped draw-cycle state so completion, cancellation, loading state, and snapshot readiness can only be settled by the current tab's current draw.
- Added unit coverage for nested render handoff and live/cache publication separation, and strengthened reopen/recovery browser coverage to require a committed frame, canonical graph publication, completed session application, and a cleared document overlay.

## 2026-07-27 — Export and axis refinements

- Exported dotted reference lines are now retained as one dedicated SVG subgroup per line, so a first Inkscape ungroup keeps each dotted line selectable as a single logical object.
- Fixed major tick-length defaults across axis-enabled components: an unset tab-owned value is no longer coerced from `null` to `0`, so new and legacy graphs retain their normal nonzero publication-style tick length until the user explicitly sets a custom value.
- Fixed Box axis font persistence across axis flipping: categorical x-axis labels, numeric y-axis labels, and the y-axis title now retain their saved semantic font styles after moving to the opposite physical axis.

## 2026-07-27 — AG Grid column sizing persistence

- Fixed major tick-length regressions across Cartesian components: Scatter now passes resolved X/Y tick lengths into its extracted axes renderer, and persisted unset values are normalized without `Number(null) -> 0`, restoring the canonical nonzero default in Line, Histogram, PCA, stacked Pie, ROC, Survival, Scatter, and UpSet axes.
- Normalized X/Y axis toolbar layout so every item uses its intrinsic widest label/control width with one consistent inter-item gap; renamed axis labels to sentence case, including “Tick length”.

- Auto-sizing a fully selected table now covers every titled column, including virtualized off-screen columns.
- Manual and automatic column widths now persist per tab through save, reopen, autosave, and crash recovery.

## 2026-07-27 — Atomic, interruption-safe document opening

- Replaced visible post-load tab activation and cache warming with lazy hydration: only the archive's saved active tab is restored during open.
- Added one full-application opening transaction with clear file-aware progress, accessible busy state, and locked tab/add/close/drag interactions.
- Session replacement now stages non-colliding tab owners, commits only after active-workspace readiness, and rolls back the prior tabs and file metadata on failure.
- Failed opens keep the current document intact and present concise recovery actions instead of console-only feedback.
- Removed obsolete warmup APIs, delays, overlay wording, and test waits; save/recovery snapshots reuse valid caches without navigating inactive tabs.
- Normalized save/recovery snapshot intent flags so the persistence contract and its tests use one explicit shape.
- Made the restored active tab’s side delimiters explicit CSS borders and projected the preceding-tab separator class directly, avoiding stale shadow/`:has()` painting after the opening lock clears.
- ROC hydration now suppresses initialization, payload, and resize redraws when a valid saved render cache is restored.
- Resizable graphs now ignore the ResizeObserver's unchanged first measurement, preventing false post-restore redraws across components.
- Added a mixed Scatter/Box/ROC archive regression proving Box and ROC reuse their saved graph caches without fallback redraws.

## 2026-07-27 — Explicit ROC classification setup

- ROC and precision–recall analyses now use an explicit positive class and global score direction.
- All curve, cutoff, inference, resampling, and comparison paths consume canonical higher-is-positive analysis pairs while retaining original-scale cutoff reporting.
- Classification settings persist per tab and are included in reports and cache signatures; low AUC values now warn without automatic reversal.
- Positive-class and score-direction controls now commit on `input` before recovery capture, and class options use stable typed identities so session projection cannot reinterpret class 0 as class 1.
- ROC statistics are now committed from the completed owner-scoped draw instead of being reconstructed from visible DOM during save, tab switching, reopen, or recovery.
- Draw generations and snapshot readiness prevent an older ROC/PR calculation from publishing or persisting statistics after a newer settings change.
- Every analysis-setting change invalidates its prior statistics model before payload persistence, and restored models are validated against the exact included analysis matrix.
- Removed ROC's duplicate activation-time runtime replay, which could overwrite the newly hydrated owner session with an older statistics snapshot.

## 2026-07-27 — Palette matching for custom dataset colors

- Named palette selection now offers a compact, contextual choice when custom dataset colors exist.
- The recommended action maps custom colors to distinct perceptually nearest colors in the selected palette; full replacement remains available.
- Equal-colored datasets are matched as one visual group, even when one occurrence coincides with its old positional palette default.
- Box Unified point colors now retain their global and indexed override precedence during the immediate palette projection, matching the subsequent full renderer.
- Palette matching, replacement, and exact restoration remain single owner-scoped undo actions.

## 2026-07-27 — Heatmap recovery redraw

- Invalid or missing Heatmap render caches now trigger one owner-scoped redraw from the authoritative payload after hydration settles.
- Recovery awaits graph publication, including heavy canvas Heatmaps, instead of leaving a blank graph.
- Restore hydration suppresses automatic component draws, preventing duplicate Heatmap work and removing the 12-second readiness timeout before fallback redraw.
- Heavy Heatmap recovery now persists the completed render model, validates it against the full processed matrix, reuses its clustering during the single fallback repaint, and keeps the loading spinner visible until publication.
- Recovery redraws now use the standard owner-scoped scheduler and lifecycle transaction; duplicate overlay and timer-based suppression paths were removed.

## 2026-07-24 — Cross-component statistical standards overhaul

- Preserved missing/invalid p-values through multiplicity adjustment instead of converting failures to significance.
- Replaced the ad hoc finite-df studentized-range scaling and corrected Games–Howell standardization.
- Renamed approximation-based Box procedures and the MAD/BH outlier screen to match their actual calculations.
- Enforced coherent expected totals and corrected effect-size definitions in Pie statistics.
- Removed silent PCA method fallback and restricted Kaiser selection to standardized PCA.
- Rejected invalid Cox covariates and removed silent first-20,000-row truncation.
- Added Holm adjustment to Venn overlap-enrichment families.
- Replaced binary logistic regression with a validated-likelihood IRLS/Newton workflow and disabled invalid Gaussian grouped-logistic comparisons.
- Fixed owner-scoped frame debouncing silently dropping a current Heatmap draw when payload commit or lifecycle invalidation advanced the async generation between the overlay frame and the render frame. Heatmap now requeues the latest pending draw only while its owner tab remains active, preserving cancellation on tab disposal while allowing the first heavy paste to render without a tab switch.
- Fixed first heavy Heatmap paste rendering: owner-scoped overlay paint frames now report lifecycle invalidation and Heatmap requeues the still-current draw instead of silently losing it until a tab switch.
- Fixed the first large Heatmap paste being lost or left permanently behind the loading overlay when a table-import projection transaction was still pending. Shared paste handling now cancels the stale projection, commits the custom and native AG Grid paste paths through one owner-payload transaction, schedules one final heavy draw, and preserves the pasted matrix across tab switches.
- Fixed native AG Grid paste transactions so thousands of per-cell change events are committed as one payload update, one undo step, one filter refresh, and one graph schedule. This prevents heavy Heatmap paste draws from being repeatedly invalidated after the loading overlay appears.
- Fixed AG Grid clipboard marquee ownership for full-table, row, and column copy/cut selections by emitting the adapter's canonical `{ from, to }` range shape; the previous header-selection builders produced an incompatible range schema that was discarded before rendering.
- Heatmap now forwards shared table scheduling metadata unchanged, so heavy pastes retain `forceOverlay`/`heavy` flags and paint the cancellable loading overlay before drawing.
- Removed Scatter's call to the nonexistent `chartStyle.clearSvg` API; excluded-axis redraws now clear their owned plot container directly.
- Completed a professional cleanup of Heatmap's owner-sensitive rendering stack after the mixed canvas/SVG work: removed the duplicate SVG-number formatter and dead transform helper, separated compact on-screen coordinates from high-precision export coordinates, extracted deterministic label/layout/cell-value geometry helpers, and removed redundant projection and payload-session lookups.
- Normalized Heatmap lifecycle ownership: font/resize observers and live-resize frame work are now tab-scoped, are torn down only for their owning root, are reattached on activation, and are cleared together with hidden draws and resize markers on deactivation. Closing a Heatmap tab now releases its session, listeners, worker records, and toolbar activation state.
- Split Heatmap preview and export projection preparation so SVG export no longer performs discarded preview bitmap work, made render-model cloning explicit across owner boundaries, and added regression coverage for model isolation, deterministic logical geometry, session disposal, compact dendrogram coordinates, and existing heavy-render behavior.


- Reduced heavy Heatmap tab-preview payloads without weakening the shared preview size guard: preview-only matrix, dense-label and dendrogram rasters now use compact WebP encoding with PNG fallback, and SVG preview images store the bitmap URL only once instead of duplicating it in both `href` and `xlink:href`.
- Fixed heavy Heatmap tab previews being downgraded to the large-dataset placeholder because the shared preview pipeline recognized HTML `img` bitmap markers but not SVG `image` markers. Verified bitmap-backed previews now bypass the vector SVG character budget after canvas downsampling, while ordinary oversized vector previews retain the existing limit.
- Fixed Heatmap activation/capture crashes caused by treating the tab-owned notes controller as a DOM Node during root-membership checks. Ownership validation now resolves controller roots before calling `Node.contains`, preventing cascading workspace binding, payload persistence, and async draw failures.

## 2026-07-23 - Heatmap activation binding recursion fix

- Removed DOM projection as a side effect of `bindHeatmapSessionForTab`; session ownership and visible-DOM projection are separate lifecycle steps again.
- Passive same-component Heatmap activation now binds the target root and table manager before projecting durable controls.
- Prevented partial Heatmap initialization from throwing through `workspaceTabs.ensureActiveDomBindings` and `bindPerTabRootIfNeeded`.
# Changelog


All notable changes to this project should be documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning.

## [Unreleased]

### Fixed
- Fixed Venn two-tab cache omission and post-recovery cache invalidation. Snapshot readiness now tracks owner-scoped draw and analysis work, cancels delayed automatic species detection before capture, suppresses redundant GO/STRING/species reruns for restored input baselines, and clears async tokens on every completion/cancellation path. The Venn persistence fixture now mutates list data rather than derived count fields, and direct cache-transfer tests assert the intentionally empty live stage between capture and restore.
- Crash recovery now validates publication against each component's primary graph surface and component-owned data marks instead of accepting axes, grids, or unrelated SVG/canvas content elsewhere in the workspace. PCA, Pie, ROC, Survival, Surface, Venn, Line, and Histogram therefore fall back to their authoritative payload draw when a lean recovery has no usable graph cache, matching Scatter's existing behavior.
- Component ensure and activation no longer permit a passive restore bind to mark an uninitialized component as ready. Full owner-scoped table/layout/scheduler initialization now occurs under the shared draw-suppression transaction, fixing Venn recovery states where the graph stayed blank and resize redraw requests had no scheduler.
- Flipped Box/Distribution charts now position categorical labels, ticks, points, and drag targets from the same canonical band-layout centers, eliminating the cumulative label-to-point offset caused by ignoring inter-category gaps.
- Fixed heavy Heatmap paste rendering being stranded behind the loading-wheel hand-off. Heatmap now treats the overlay as a passive visual layer and sends the committed paste directly to its single owner-scoped draw frame, removing the redundant overlay animation-frame gate that could prevent the renderer from ever starting.
- AG Grid clipboard marquees now use the visible selection perimeter for ordinary ranges, full-table selections, and row/column-header selections, including virtualized or scrolled endpoints. Contiguous header selections are coalesced into one marching outline instead of fragmented per-row or per-column borders.
- Large clipboard pastes now mark their shared table redraw request as heavy before component scheduling, so owner-scoped graph overlays paint before expensive rendering starts instead of appearing only for file imports.
- Box bar charts now keep the categorical axis at the lower value-axis boundary while every bar still starts at zero. Linear bar plots that cross zero render the same dotted zero reference used by the other distribution graphs. One-sided error bars now extend away from zero for negative as well as positive means, including stacked bars, and automatic limits include the displayed directional interval.
- Shared AG Grid analysis now ignores titled columns with no body data, preserves those table edits without invalidating graph caches, and schedules one redraw only when a mutation changes the effective analysis matrix. PCA no longer maintains a competing local table scheduler.
- Double-clicking one header separator now auto-sizes every data column when the complete column set is selected, including pinned first-row content.
- Data exclusions now persist across Raw and shape-compatible derived Data Views. Schema-changing analytical views retain isolated exclusion state so positional exclusions cannot leak into correlation or frequency tables.
- AG Grid copy, cut, and delete now support contiguous and non-contiguous multi-row header selections in current display order, including sorted tables. Adapter-owned row/column header selections are no longer overwritten by AG Grid selection-change callbacks that report no replacement cell range. Ctrl/Cmd+C and Ctrl/Cmd+X are routed by the table's logical selection owner when AG Grid moves DOM focus after modifier-click row selection; routing remains active-tab scoped, stops after outside interaction, and starts Clipboard API access synchronously within the keyboard event.
- Recovery checkpoints now use a 2.5-second trailing debounce with a 10-second maximum deferral during continuous editing. Periodic recovery no longer bypasses a pending debounce. Archive serialization remains worker-backed; owner/session capture stays on the owner-aware main thread.
- Heatmap dendrogram rendering now builds complete three-segment merges for both orientations, computes geometry iteratively, normalizes non-monotonic linkage heights only in display geometry, and unions overlapping collinear segments before emitting one precision-preserving SVG path. Column branches no longer terminate at the merge midpoint, and dense row dendrograms no longer darken through repeated overdraw.
- Heavy Data-values Heatmaps now publish a bounded pixel-aware live label projection while retaining the complete owner-scoped render model. Explicit export reconstructs every row and column label with the live aspect-correction transform, so on-screen responsiveness no longer trades away export fidelity.
- Heatmap rendering now yields through the owner-scoped graph execution context after worker clustering and before live DOM publication. Stop/retry can therefore cancel the post-worker render phase instead of waiting for a monolithic dense-label commit.
- Heavy Heatmap tab previews now rasterize only the matrix canvas. Row labels, column labels, color scales, and dendrograms remain sampled vector overlays; preview interaction rectangles and ownership markers are stripped without removing dendrogram geometry, compact SVG path commands are parsed correctly, and thumbnail label density is capped to prevent black overdraw bands.
- Updated the Heatmap vector-export regression to validate the canonical fill-bucket path representation through `data-heatmap-vector-cell-count`; the previous assertion incorrectly required one `<rect>` per cell after the exporter had deliberately compacted cells into paths.

### Added
- Shared graph-options toggles for graph-title and contextually relevant axis-title visibility across all graph types, persisted per tab and through `.graph` reopen. Empty title edits now hide reversibly without erasing text or formatting.
- Publication governance files: `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`.
- CI workflow for Jest unit tests on push/PR.
- GitHub Pages build and deployment workflow for the static web app.
- Publication-readiness scripts for validating runtime references and building `_site/`.

### Changed
- Lean recovery now snapshots canonical tab state without live DOM capture, defers archive normalization to the worker, rejects stale revisions, and captures render caches only after explicit Hi-Fi opt-in. Desktop recovery sends binary data without main-thread base64 conversion.
- Shared loading overlays are now owner-tab scoped, including completion after same-component tab switches.
- Test contracts updated to match current PCA auto-draw and line toolbar behavior.
- Heatmap regression tests made resilient to current correlation/data-view flow.
- Repository cleanup rules now ignore generated coverage, Playwright artifacts, temporary scratch files, and local assistant/editor settings.
- UpSet color controls now use a compact two-column layout.

### Fixed
- Heavy Data-values Heatmap previews now rebuild directly from the owning inactive tab's render-cache fragment even when optional SVG root metadata is absent. The matrix canvas is downsampled into a real preview bitmap before shared serialization, and stale "Preview simplified / Large dataset" placeholders are invalidated as soon as an owner-scoped Heatmap source is available.
- Heavy Data-values Heatmaps now keep their full mixed canvas/SVG projection strictly owner-tab scoped. Same-component activation rebinds the exact tab root, controls, grid, layout, render state, and font store before any projection work; inactive previews retain their owner token and replace stale large-dataset placeholders with a real sampled bitmap. The existing normal label-font contract is unchanged, while only normalized huge matrices derive row/column fit from their actual cell dimensions. Live resize reuses the current canvas and SVG nodes without stretching text, then performs one owner-scoped redraw on release.
- Heavy Data-values heatmaps now render only the matrix through a tab-owned canvas while retaining every SVG row/column label plus SVG dendrograms, titles, and legends. Their live scene uses bounded display geometry shared by the raster and every SVG overlay, preventing large logical row counts from displacing the color scale or dendrograms; preview-only sampling bounds unreadable thumbnail detail, and each dendrogram is emitted as one SVG path without losing branch geometry. During resize the existing mixed canvas/SVG scene scales with the resize box, then one release redraw regenerates both projections. PNG export uses complete matrix content, standard SVG export converts the matrix to compact fill-batched vector paths, rasterized SVG export embeds the exact matrix bitmap, and clipboard generation is deferred until after the browser clipboard write begins so heavy copies retain user activation.
- Font-control diagnostic traces now honor the canonical debug gate, preventing per-label console work from becoming a large-Heatmap rendering cost when ordinary debug logging is disabled.
- Structural graph/view changes now use one owner-scoped overlay request across components. The overlay appears before heavy Box, Heatmap, Scatter, Histogram, Line, PCA, Pie, Surface, and Venn redraws without forcing reusable analysis geometry to be recomputed.
- Stop/retry is now owner-tab scoped across every graph component. Long Box, Line, ROC, Histogram, Surface, Pie, Survival, and Venn draws yield cooperatively; PCA, Heatmap, Scatter, and Box workers inherit the same cancellation signal and terminate without restarting synchronous fallback work.
- Shared table analysis now reads ordinary owner data directly while preserving formulas and exclusions, avoiding repeated per-cell display projection during large graph draws.
- Large Data-values heatmaps now keep exact clustering cancellable in an owner-scoped worker, reuse the canonical render model without repeated deep clones, build unchanged SVG geometry off-DOM, and preserve visible dendrogram height and stroke thickness at every dataset size.
- Retrying a stopped graph draw now preserves one owner-scoped overlay controller, restores the wheel before work resumes, and clears it when the new draw settles; stale replaced handles cannot orphan the overlay. Scatter imports request the wheel before parsing instead of waiting for the populated-table threshold.
- Full-table imports now run as one owner-scoped transaction: canonical grid/session state commits once, intermediate graph requests are suppressed, AG Grid receives two paint frames, and only the still-active owner receives the final graph projection. Import renames and inactive completion remain owner-safe.
- Large PCA import and recovery coverage now verifies 75,440-row grid-first latency, final graph parity, canonical recovery parity, one final projection, stale-owner rejection, and same-component tab isolation.
- Large AG Grid dataset loads no longer rebuild the formula engine for plain data; formula evaluation now stays dormant until a formula is imported or entered.
- PCA point-label toggles now update only tab-owned label metadata, color schemes recolor semantic SVG paint targets in place without exposing axis hit areas, dark themes cover frames, ticks, and label leaders, and 3D rotation reuses cached analysis while leaving unchanged statistics mounted.
- Owner-tab table edits and color-scheme changes now use structural payload updates, avoiding full large-matrix clones and redundant single-view DataViews serialization.
- AG Grid full-table selection now shows a continuous top border after Ctrl+A and during copy/cut.
- AG Grid paste now preserves Excel/LibreOffice table structure, converts decimal commas to dots, and still splits plain comma-delimited CSV text into columns.
- Lock ratio is now geometry-neutral when toggled and preserves rendered x/y axis lengths across migrated Cartesian components, including Pie Stacked bar. ROC no longer forces a square plot. The current SVG viewport now enforces the ratio during the canonical render, including staged SVGs, with no delayed box-correction redraws. Heatmap Data values separately preserves its visible matrix ratio without axis semantics. Venn/UpSet remains on its legacy integrated-layout sizing path and is explicitly outside this Cartesian transaction. Ratio geometry remains tab-owned and survives `.graph` reopen.
- Fixed stacked Pie Lock-ratio persistence across subtype switching and archive reopen. Radial Pie/Donut's forced Lock-ratio policy no longer creates a false stacked preference during hydration; only a real stacked-to-radial transition captures the user's stacked choice, and that preference is retained in owner runtime/config snapshots until stacked mode is restored.
- Lock/unlock transitions now preserve the renderer's exact style baseline, and clicking a resize handle without moving it no longer starts a resize or redraws the graph.
- Component resize phases now have one draw-request owner; component-specific resize callbacks replace the former duplicate generic schedule.
- AG Grid selection outlines that include a pinned top row now scroll beneath the vertical scrollbar like normal-row selections.
- AG Grid’s top-right scrollbar gutter now matches the bottom scrollbar spacer instead of leaving an empty corner.
- Box adaptive pairwise whiskers now use a stable shared stack anchor and each endpoint's actual lower obstacles, so partial sets fill unobstructed gaps without stretching obstructed whiskers.
- Box significance asterisks are optically centered against regular `ns` labels; bracket clearance now uses visible ink bounds instead of SVG font boxes.
- Box significance labels now sit 50% closer to their corresponding bracket line in both graph orientations.
- Box significance stacks now keep about 13 px above labels, retaining compact levels while preventing label-clamped adaptive whiskers from becoming too short.
- Box significance stacks now start 13 px from the rendered data envelope, shifting the full annotation block closer to points without touching them.
- Box plot frames now expand around rendered significance lines and labels, including flipped-axis layouts.
- Box flipped adaptive significance levels now use each preceding bracket's rendered position, keeping P-value whiskers correctly shortened after wide labels shift the stack.
- Component-tab table imports now open the shared preview/options wizard immediately, with the current tab’s graph type fixed and import settings captured reliably before asynchronous parsing.
- UpSet resizing now uses tab-owned render data, atomic live frames, a coordinated two-panel layout, and collision-aware narrow-width labels, eliminating transient jumps and overlap between set names and matrix dots.
- UpSet now defaults to an unlocked ratio while preserving a user-selected ratio lock across mode changes, tabs, and archive reopen.
- Hiding graph or axis titles now preserves the user-set graph geometry and proportions across all graph types; Heatmap no longer shifts, clips column labels, or shrinks text after tab return.
- Inline title editing now keeps renderer-replaced text projections hidden, preventing Heatmap’s unchanged title from appearing behind the editor.
- Removed unreleased `.session` file support and its obsolete multi-tab JSON loader; the welcome importer no longer advertises JSON workspace files.
- Removed unused production dependency `puppeteer-core` to eliminate critical transitive vulnerability path.
- Removed obsolete generated output, duplicate/unused Prism fixtures, scratch debug files, redundant desktop icon output, and the placeholder adder test/module.

- Fixed SVG copy/download fidelity after ungrouping in Inkscape: export-time relative text offsets are resolved to user units, and round-cap zero-dash dotted lines are materialized as vector dots while retaining the top-level export group.

- Added per-axis **Major Tick Length** controls to every 2D component that exposes clickable X/Y axes (Box, Scatter, Line, PCA, ROC, Histogram, Survival, Pie stacked bars, and Venn UpSet). Values are owned by each tab's component session, persisted in `.graph` payloads, restored on reopen, and applied independently to X- and Y-axis tick geometry and label spacing.
- Major Tick Length editors now display the renderer's current nonzero default when no custom value is stored, so native up/down steppers begin from that default instead of zero while the underlying tab-owned state remains unset until the user changes it.
- Axis length controls now use a minimal top bracket around the section title, visually grouping the length value, unit, and preserve-ratio control without adding a full box.
- Axis length toolbar brackets now use square corners and terminate exactly at the compound control row edges, with no extra horizontal overhang.

- Axis-toolbar Number format dropdowns now use the canonical 26 px control height and border-box sizing, matching and vertically aligning with Thickness and adjacent action controls.

## 2026-07-30 — Render-cache persistence contract test correction

- Corrected the new render-cache persistence matrix so it compares canonical payload/layout signatures instead of unsupported test-only payload fields that component serializers intentionally discard.
- Reopen audits now detect dirtiness introduced by passive activation relative to the post-open baseline, rather than incorrectly requiring archives created from edited tabs to have no historical dirty state.
- Save and reopen phases retain separate diagnostics, while same-component and mixed-document cases now verify distinct canonical data/layout signatures and per-tab statistics selections.
- Corrected the Box font-toolbar regression assertion to use the actual visible toolbar contract instead of a nonexistent `data-open` attribute.

- Fixed render-cache loss when creating or duplicating a tab: all tab-preserving deactivation paths now use the same completed-owner persistence boundary and capture the outgoing tab's owner-scoped render cache before unmounting.
## 2026-10-09 — Chart-mark keyboard access for Box, Line, and Pie

- Extended the shared owner-scoped chart keyboard contract to Box points, body shapes, summary marks and connections, Line markers/series paths, and Pie slices. Horizontal/vertical marks with one zero-size bounding dimension remain navigable; Box and Pie cache restoration rebinds the controls.
- Focused helper/Pie Jest passes 11/11; the six-case Chrome chart keyboard suite passes; Box/Line same-type isolation and archive reopen pass 4/4; Pie reopen keyboard navigation passes within its isolation contract. Remaining mark families stay tracked as open work.
## 2026-10-09 — Keyboard access for Histogram, ROC, and Survival marks

- Added owner-scoped chart navigation for Histogram bars/overlays and ROC/Survival curves, reusing each mark's existing formatting action. Render-cache restoration re-registers marks with the owning tab.
- The Chrome chart keyboard suite passes 13/13, including formatting after archive reopen. Histogram/ROC/Survival same-type isolation and archive persistence pass 6/6. Shared chart helper Jest remains 5/5; Firefox was not run.

## 2026-10-09 — Keyboard access for Venn, UpSet, and Heatmap

- Added owner-scoped keyboard formatting for Venn set circles, UpSet bars/matrix marks, and Heatmap cells. Heatmap keeps a single matrix hit surface across vector/canvas rendering, shows its focus cue during keyboard movement, and restores the route for older vector render caches.
- Chrome chart navigation/formatting passes 18/18, including archive reopen. Six targeted Jest suites pass 34/34; Heatmap heavy rendering plus Venn/Heatmap isolation and persistence pass 7/7. Firefox was not run.
- Final `npm run quality:static` passes with 638 manifest rows, 901 explicit/0 inferred requirements, 1,076 Chromium tests, and 11 fresh thumbnails; `git diff --check` passes.

## 2026-10-09 — Shared compact line-height token

- Added one compact line-height token for ten existing 1.35 declarations, preserving their computed values across helpers, statistics controls, and component notices.
- Stylelint and the full static quality gate pass. Installed Chrome confirms all ten consumers retain the same computed line-height; all 11 CSS-fingerprinted Welcome thumbnails are fresh.

## 2026-10-09 — Keyboard-accessible AG Grid context actions

- Shared table context actions now render as named menu items with keyboard navigation, Escape/action focus return, and short-viewport clamping. Existing actions and undo behavior remain on their prior callbacks.
- Added Jest and installed-Chrome coverage for menu roles, navigation, focus return, target sizes, and 320×400 containment.
- Moved AG Grid font and row-height values to app-scoped selectors that override the deferred vendor theme by specificity. Removed five redundant priority flags; Chrome computed-style checks and the all-workspace coarse-pointer sizing check pass. CSS now has 189 priorities.

## 2026-10-11 — Shared interface foreground palette

- Added four exact-value semantic foreground tokens and routed 43 repeated interface color declarations through them. Removed one Axis checkbox color declaration superseded by the shared chip rule.
- The five-case installed-Chrome token contract passes; Stylelint and the reviewed CSS priority check pass. No geometry or priority declarations changed.

## 2026-10-11 — PCA divider cascade cleanup

- Removed three PCA divider priority flags after raising the component-owned selectors above the shared pinned-row border reset. The 1px dividers remain intact in both table formats.
- Installed Chrome confirms Box/PCA tab isolation and archive reopen; combined computed-token and Box/PCA contracts pass 7/7. Both static gates pass, all 11 previews are fresh, and the CSS priority ceiling is now 55.
## 2026-10-11 — Surface legend and resize-frame containment

- Removed Surface's container-envelope opt-out and its shared API/cache flag. Every published content extension now reserves visible container space through the same shared boundary, so scale labels and resize grips cannot be clipped by a smaller frame. Canonical graph geometry remains unchanged.
- Added containment checks across all eleven components, Surface zoom checks, and older-cache coverage. Updated the Surface legend-size test to account for display zoom; preserved the preferences/zoom button styling.

## 2026-10-11 — Shared 3D glyph containment

- Fixed PCA's left-edge title overflow at the shared projector: legend offsets can use unused horizontal space but cannot consume the reserved axis margins. Projection scale and canonical graph dimensions remain unchanged.
- Fixed rotated Surface title overflow by measuring rotated tick corners for both tick clearance and title placement. Removed the unreachable tick-tilt branch and its unused measurement metadata.
- Added projector/oblique-label regressions and explicit coverage for all four 3D components; retained the original containment tolerances. Corrected multiline tests to compare screen dimensions in SVG units after proving the same zoom mismatch existed before the fix. Preferences/zoom button styling is preserved.
- Verification: 58 focused Jest tests; four-component containment, five recovery/rotation checks, and three multiline-title checks pass. Screenshots were inspected. Surface's exact multiline width assertion still fails identically in a browser-only baseline; that reserve-contract issue and the separate edge-on axis overlap redesign are recorded in `issues.txt`.
## 2026-10-11 — Verify and repair Box statistical preprocessing and tied Friedman calibration

- Independently reproduced all three reported defects in the current worktree before fixing them. Production flow: table collection retains `rawY` and `rowIndices`; `buildBoxStatsWorkerPayload` previously discarded the row IDs; worker and synchronous fallback both enter `Shared.boxStatsModel.computeBoxStatsModel`. Shared preprocessing then filtered columns independently, while custom comparisons used a separate map of original values. Direct repeated-measures ANOVA, Friedman, and Nemenyi helpers also filtered columns independently.
- Preserve source-row IDs in worker payloads and matrix-derived statistics contexts. One shared complete-row intersection now precedes paired screening, summaries, tests, effects, and reporting. Paired t, signed-rank, ratio t, repeated-measures ANOVA, Friedman, Nemenyi, and grouped condition marginals share this behavior. Missing cells, blank strings, and infinities cannot shift subjects or become paired zeros. Independent samples retain independent filtering. Screening of paired designs with more than two groups remains deliberately disabled.
- Custom comparisons resolve the processed group by position instead of retaining original values as another calculation source. Removed the component-local outlier/preprocessing copy and helpers after proving they were used only by a test hook; that hook now exercises the shared production implementation.
- Friedman simulations now shuffle each subject's observed midranks and apply the same tie correction as the observed statistic. Complete untied exact and asymptotic behavior remains covered by existing reference tests.
- Paired statistics cache signatures include source rows. An input-contract revision invalidates older affected paired/custom-screening results instead of trusting potentially incorrect saved calculations; those older results require recalculation. Newly calculated results retain save/reopen fidelity.
- Concrete paired reproduction: table rows `(10,9), (missing,20), (30,missing), (40,37), (50,46)`. Old compact-array pairing gave t=2.3237900077, df=3, p=0.1027280789. Correct subjects are rows 1,4,5: SciPy 1.17.1 `ttest_rel([10,40,50],[9,37,46])` gives t=3.0237157841, df=2, p=0.0941783727. With third column `[11,21,32,42,48]`, complete-row repeated-measures ANOVA gives F=5.0344827586, df=(2,4), p=0.0808342945; Friedman Q=4.6666666667. Browser checks exercise all three calculations and paired archive reopen/recalculation.
- Concrete tied Friedman reproduction: columns `[1,1,1,1]`, `[1,2,1,2]`, `[2,2,3,3]`. SciPy tie-corrected Q=6.6153846154. Exhaustive within-row label permutations give p=0.0370370370. For seed 781 and 60,000 simulations, old p=0.0047499208; corrected p=0.0378660356. This defect could turn a non-significant result at alpha=0.01 into a significant result. Additional regressions cover a fully tied subject, all tied subjects, inadequate samples, row reordering, disjoint rows, zeros, and nonconsecutive source IDs.
- Concrete custom reproduction: A=`[10,11,12,13,14,1000]`, B=`[15,17,19,21,23,25]`, Grubbs screening, classic independent t-test. The report excluded 1000 while the old calculation still used it: t=0.9513702234, p=0.3638442034. Correct screened calculation gives t=-4.4312936753, p=0.0016440744. Paired custom screening is also checked, including confidence intervals against the external reference.
- Oracle coverage previously used complete inputs and missed the production preprocessing boundary; one alignment test exercised the unused component copy. New reviewed Box-specific scenarios explicitly map production models, worker entry, tied permutation references, and rendered reopen transitions. Python references now call SciPy `rankdata`, `ttest_rel`, and `ttest_ind`; repeated-measures ANOVA uses independent nested least-squares fits with a SciPy F tail instead of duplicating the production sums-of-squares calculation.
- Sibling audit: Scatter/Line regression filters whole point records; ROC matches comparisons by observation ID. These paths do not independently compact matched arrays. No broader ownership or persistence refactor was required. A separate Friedman requested/effective resampling-mode inconsistency is recorded in `issues.txt`.
- Validation: `npm run test:stats` passed all 7 oracle suites / 33 tests with the checked Python runtime and no diagnostic rerun. Focused model/worker/cache/manifest/fallback checks passed 5 suites / 94 tests; statistical integration, Box control isolation, restore, and architecture checks passed 5 suites / 82 tests. Browser dropdown coverage and the new paired reopen and repeated-measures/Friedman cases passed. The first new reopen test incorrectly compared transient owner/version IDs after recalculation; it now compares scientific results and signatures while asserting the current owner. No full-app or R validation is claimed.
- Final supplementary checks passed 5 suites / 80 tests, including the tied-block edge case and reference/ownership contracts. Three additional Chromium contracts passed for Box file reopen, crash recovery, and same-component tab isolation with archive restore. ESLint, diff whitespace, generated test inventory, and component-contract checks passed; architecture and testing inventories were regenerated. Existing unrelated worktree changes were preserved.
## 2026-10-11 — Verify statistical identity, screening, guidance and decimal ranks

- Independently traced Box controls → owner payload → shared model/worker → preprocessing → calculations → report/cached results. No broad statistical-engine refactor was needed: corrected shared boundaries and retained stored option identifiers for compatibility. Genuine Dunnett/T3/ROUT would require separate numerical engines; recorded those gaps rather than inventing replacements.
- Partial false positives: control dropdowns already said pooled/Welch t + Sidak, and the outlier dropdown already said MAD + BH. Reports still falsely named Dunnett/T3 and claimed FDR-calibrated screening. Actual advisor decisions already required explicit answers and did not automatically switch analyses. Strict equality for ranks of original observations is valid; the reproduced artifact comes from internally subtracting paired/one-sample decimals.
- Control reports now identify their actual Sidak t calculations and control-only family; expose raw and adjusted p-values; distinguish Sidak-adjusted marginal t intervals from genuine joint Dunnett intervals. Corrected contrast direction to match control-minus-treatment labels, use the chosen confidence level, reject uncalibratable zero-SE contrasts, and preserve tiny probabilities with stable Sidak/Holm-Sidak arithmetic. Genuine Dunnett uses a multivariate t distribution: https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.dunnett.html .
- Independent control reference: groups [10,12,15,19], control [20,21,25], [4,8,9,11,14,18], 90% intervals. First control contrast now has difference +8 rather than mislabeled −8. Pooled t=2.473438289692217, raw p=.03291054532905443, adjusted p=.06473798666425311, CI [.8429980163184307,15.15700198368157]; Welch t=3.221549065027317, df=4.990279465370595, adjusted p=.046428655590381264, CI [1.665986620597712,14.334013379402288]. Both agree with the separately evaluated SciPy reference. Previous control intervals used the significance alpha instead of the selected confidence level.
- Reproduction: [1,…,18,80,1000] previously excluded both 1000 and 80 under iterative Grubbs; now excludes only 1000. NIST/SciPy single-test reference G=4.236653882641016, critical(.05,n=20)=2.7082456458057584. Bonferroni controls the selected independent screening family; paired screening remains on differences. Exclusions, original rows and sample sizes are explicit, and post-selection inference is labelled exploratory. MAD/BH now reports heuristic flags and retains every observation, including zero-MAD samples. Default exclusion remains none. Reference: https://www.itl.nist.gov/div898/handbook/eda/section3/eda35h1.htm ; genuine ROUT requires robust fitting: https://www.graphpad.com/guides/prism/latest/curve-fitting/reg_rout_method_outliers.htm .
- Diagnostics no longer recommend ranks from normality rejection alone or equate nonrejection with normality. Guidance distinguishes sample-size sensitivity, unequal spreads, target effects, paired contrasts and covariance assumptions. Paired t diagnostics inspect within-subject contrasts, ratio diagnostics log ratios, and lognormal diagnostics log observations. Diagnostic guidance does not change the selected analysis.
- Reproduction: signed ranks for [.5,.825,.375,.5] minus [.525,.775,.325,.55] previously gave W=5 and asymptotic p=1; decimal differences [-.025,.05,.05,-.05] give W=4 and continuity-corrected SciPy p=0.8501067391385259. Exhaustive tied sign flips give p=1, a distinct calibration correctly tested separately. Shared exact decimal subtraction uses each input number's shortest decimal representation only where differences are derived; no global rank tolerance. Mann–Whitney, Kruskal–Wallis, Friedman, Dunn and other raw-data rankers retain exact input ties. Reference: https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.wilcoxon.html .
- Coverage repaired: independent Python Decimal arithmetic, SciPy t/Welch references with unequal n/nonfirst control/90% intervals, exhaustive sign flips and exact/asymptotic/seeded Monte Carlo signed ranks; Grubbs family threshold boundary; zero-MAD/constant/zero-difference/missing/adjacent-representable-value cases; production report, worker, owner, historical cache and Chromium archive tests. Existing valid input-alignment/tied-Friedman/custom-screening P0 fixes were not reworked.
- Oracle root cause: earlier control coverage checked finite outputs rather than the actual named procedure/family/CI; signed-rank fixtures did not expose subtraction-created ties. The oracle itself used binary subtraction and an allclose-to-zero shortcut, which could erase real 1e−9 differences. References now derive decimal differences independently and test exact zero only; two positive tiny differences have exact p=.5, not the former false p=1. Relevant production paths are computeBoxStatsModel → computeSingleStatsModel → preprocessStatsGroups/computeAssumptionDiagnostics → computeControlSidakComparisons or wilcoxonSignedRank/wilcoxonOneSample → computeSignedRankFromDifferences → report construction; Box draw/worker payload and saved-result signatures share those semantics.
- Historical results retain their saved values and reports; affected algorithm versions request explicit recalculation and suppress stale significance annotations. Newly calculated results preserve identical owner-bound settings, reports and values across reopen. Limitations: marginal Sidak Welch calibration is approximate; heuristic MAD scores have no FDR guarantee; selected Grubbs exclusion cannot make subsequent inference selection-adjusted; decimal repair cannot recover an intended decimal value already altered upstream.
- Separately verified and recorded the pre-existing paired rank-biserial definition error: the decimal example has W+=6,W−=4 (effect .2), but current effect reporting counts signs and yields 0. This is independent of the tested signed-rank statistic/p-value fix and remains open. Decimal subtraction processed 100,000 sample pairs in 198 ms in a local Node smoke benchmark; this is bounded timing evidence, not a browser performance guarantee.
- Validation: full pinned statistical-oracle lane passed 36 tests in 7 suites. Focused model/advisor/worker/architecture coverage passed 91 tests in 4 suites. Historical-result integration passed all 4 algorithm-version cases; 5 Chromium cases passed, including every statistical dropdown choice, missing-row paired/RM/Friedman calculations, control/MAD archive consistency and same-component isolation/reopen. ESLint, generated contracts/inventory and whitespace checks passed. The full Box controls integration file remains failing (8 passed, 3 failed); isolated calculation and violin cases pass. Its suite-order/readiness investigation is recorded under the existing integration-lane issue, and initial timeouts are not erased by diagnostic reruns. The first new raw-rank oracle run also exposed a test response-shape mistake, corrected and revalidated in the subsequent full oracle lane. No full-app or full-integration pass is claimed.
- All three failing Box integration-file cases passed individually, confirming the bounded suite-order/readiness limitation rather than resolving it. Their initial failures remain recorded in `issues.txt`.

## 2026-10-11 — Correct paired rank effects and Friedman requested calibration

- Reproduced the paired rank-biserial defect before editing: seven new effect assertions failed. The decimal/missing-row example reported 0 despite W+=6, W−=4; its correct effect is .2. Differences [-1,2,3] require 2/3, rather than the sign-count result 1/3. Extracted Wilcoxon's existing signed-rank sums into one shared helper; effects now use (W+−W−)/(W++W−), average tied ranks and omit zero differences. All-zero differences leave the effect unavailable. Independent effects and common-language sign frequencies retain their existing definitions.
- Reproduced Friedman mode selection before editing: a forced Monte Carlo request on [[1,2],[2,3],[3,1]] returned exact; a tied forced-exact request returned asymptotic. Friedman now uses the existing rank-mode policy, enumerates observed within-row ranks for tractable exact distributions (including ties), honors explicit Monte Carlo/asymptotic requests, and discloses Monte Carlo fallback above 200,000 enumerated states. Actual calibration travels through the shared model, worker and saved report; Friedman reports no longer call its omnibus statistic an F-test.
- Independent reference values: SciPy-ranked/Python Decimal paired effect .2 (and −.2 on group reversal); exhaustive tied Friedman Q=6.615384615384615, p=.037037037037037035; untied two-subject Friedman Q=1, exact p=5/6. Monte Carlo comparisons use explicit sampling tolerances against exhaustive references and an independent NumPy permutation generator, including oversized exact fallback. R effectsize's [paired rank-biserial definition](https://easystats.github.io/effectsize/reference/rank_biserial.html) and primary implementation were inspected; an R runtime comparison was not executed.
- Conditional algorithm-version signatures preserve saved historical values/reports as stale until explicit recalculation, suppress stale significance annotations and protect existing tab ownership. Fresh results and requested settings survive archive reopen unchanged, then reproduce on recalculation.
- Expanded numerical, worker, historical-result and real-browser regressions for zeros, ties, reversed groups, decimal ties, missing subjects, forced modes, exact-state fallback and all-tied Friedman rows. Added explicit scenario-manifest coverage, updated the oracle capability list and statistical-validation documentation, and repaired a stale architecture assertion expecting the retired MAD/FDR labels. The numerical oracle now checks both actual methods and probabilities; matching a p-value alone cannot mask the mode-selection bug.
- Validation: final pinned statistical-oracle lane passed 39 tests/7 suites, including the independent fallback case. Targeted model/worker/ownership/statistics checks passed 114 distinct tests across 4 suites after correcting the stale label assertion. Both new historical-version integration cases passed. All 6 Box statistical-selection Chromium tests plus the separate Box same-component isolation test passed, including full archive reopen and every test dropdown choice. ESLint, contract/inventory checks and targeted whitespace checks passed; the architecture map was regenerated (it has no npm check command).
- The full Box integration file still fails with order-dependent 30-second timeouts: baseline 6 passed/5 failed, leak-enforcement diagnostic 9 passed/2 failed, owner-disposal/listener diagnostic 7 passed/4 failed. The latter's disposal checks passed but did not resolve timeouts, so its cleanup patch was removed. Calculation clickability passes individually (28.66 seconds including setup). Initial failures are retained in the existing `issues.txt` entry; no full-integration pass is claimed. Timeout root cause remains unproved. The verified shared-bootstrap fixture lifetime gap requires a coherent application/fixture lifecycle refactor, rather than further suite-specific cleanup, per AGENTS.md. Genuine Dunnett/T3/ROUT numerical engines remain separate feature gaps.
## 2026-10-11 — Consolidate repeated interface measurements

- Routed 43 repeated control and layout measurements through seven new shared tokens for standard input widths, wide panel minimums, compact spacing, row-label insets, compact line height, and circular shapes; four matching control heights now use the existing height token. Rendered values remain unchanged.
- Added a Chrome computed-style contract covering every token consumer. Broader accessibility and cascade-audit gates remain open.

## 2026-10-11 — Cover ROC and Survival legend picker ownership

- Added same-type tab-switch contracts for the ROC and Survival legend color-picker callbacks, including late eyedropper results and unchanged legend styles for both owners.
## 2026-10-21 - Restore Pie palette application

- Apply palette colors and axis styling during style-only loads, alongside sibling components. Keep palette identity in the owning Pie session, payload and runtime snapshots; retain hydrated identity when older snapshots omit it.
- Replace Pie's obsolete local palette with the shared palette resolver, including colors for newly added categories.
- Establish two failing Chromium regressions before changing application code. Eight focused browser checks now cover default selection, matching/replacement in Pie, Donut and stacked views, unchanged data/statistics/labels, undo/redo, same-type isolation, new categories and archive reopen. Default palette selection also passes across all eleven components; both standard Pie Chromium isolation/persistence contracts, 101 shared palette DOM checks and 15 Pie integration checks pass.
