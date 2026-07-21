# Changelog

All notable changes to this project should be documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning.

## [Unreleased]

### Added
- Shared graph-options toggles for graph-title and contextually relevant axis-title visibility across all graph types, persisted per tab and through `.graph` reopen. Empty title edits now hide reversibly without erasing text or formatting.
- Publication governance files: `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`.
- CI workflow for Jest unit tests on push/PR.
- GitHub Pages build and deployment workflow for the static web app.
- Publication-readiness scripts for validating runtime references and building `_site/`.

### Changed
- Test contracts updated to match current PCA auto-draw and line toolbar behavior.
- Heatmap regression tests made resilient to current correlation/data-view flow.
- Repository cleanup rules now ignore generated coverage, Playwright artifacts, temporary scratch files, and local assistant/editor settings.
- UpSet color controls now use a compact two-column layout.

### Fixed
- AG Grid full-table selection now shows a continuous top border after Ctrl+A and during copy/cut.
- AG Grid paste now preserves Excel/LibreOffice table structure, converts decimal commas to dots, and still splits plain comma-delimited CSV text into columns.
- Lock ratio is now geometry-neutral when toggled and preserves rendered x/y axis lengths across Cartesian components, including UpSet and Pie Stacked bar. ROC no longer forces a square plot. The current SVG viewport now enforces the ratio during the canonical render, including staged SVGs, with no delayed box-correction redraws. Heatmap Data values separately preserves its visible matrix ratio without axis semantics. Ratio geometry remains tab-owned and survives `.graph` reopen.
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
