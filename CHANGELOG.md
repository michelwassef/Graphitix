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

### Fixed
- UpSet resizing now uses tab-owned render data, atomic live frames, and a size-anchored viewport, eliminating transient invalid geometry and resize-frame jumps.
- UpSet now defaults to an unlocked ratio while preserving a user-selected ratio lock across mode changes, tabs, and archive reopen.
- Hiding graph or axis titles now preserves the user-set graph geometry and proportions across all graph types; Heatmap no longer shifts, clips column labels, or shrinks text after tab return.
- Inline title editing now keeps renderer-replaced text projections hidden, preventing Heatmap’s unchanged title from appearing behind the editor.
- Removed unreleased `.session` file support and its obsolete multi-tab JSON loader; the welcome importer no longer advertises JSON workspace files.
- Removed unused production dependency `puppeteer-core` to eliminate critical transitive vulnerability path.
- Removed obsolete generated output, duplicate/unused Prism fixtures, scratch debug files, redundant desktop icon output, and the placeholder adder test/module.
