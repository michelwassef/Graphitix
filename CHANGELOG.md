# Changelog

All notable changes to this project should be documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning.

## [Unreleased]

### Added
- Publication governance files: `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`.
- CI workflow for Jest unit tests on push/PR.
- GitHub Pages build and deployment workflow for the static web app.
- Publication-readiness scripts for validating runtime references and building `_site/`.

### Changed
- Test contracts updated to match current PCA auto-draw and line toolbar behavior.
- Heatmap regression tests made resilient to current correlation/data-view flow.
- Repository cleanup rules now ignore generated coverage, Playwright artifacts, temporary scratch files, and local assistant/editor settings.

### Fixed
- Removed unused production dependency `puppeteer-core` to eliminate critical transitive vulnerability path.
- Removed obsolete generated output, duplicate/unused Prism fixtures, scratch debug files, redundant desktop icon output, and the placeholder adder test/module.
