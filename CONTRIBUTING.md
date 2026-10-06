# Contributing

We welcome contributions. Please follow our [Code of Conduct](./CODE_OF_CONDUCT.md).

## Start here

Use these documents in this order when changing a component or shared service:

1. [Architecture guide](./ARCHITECTURE.md) for the runtime map and invariants.
2. [Main bootstrap order](./docs/development/main-bootstrap.md) for eager browser setup and lazy component loading.
3. [Component contracts](./docs/development/component-contracts.md) for each component's public hooks and payload boundaries.
4. [State persistence schema](./docs/development/state-persistence-schema.md) for session, payload, UI, layout, and recovery state.
5. [Module call map](./docs/development/module-call-map.md) as an index of direct references. It does not include every alias, callback, worker, or dynamic caller; trace those separately before moving or deleting code.
6. [issues.txt](./issues.txt) for verified open work. Follow [AGENTS.md](./AGENTS.md) for the normative engineering rules.

For example, the Scatter table-format change starts at its [change handler](./js/components/scatter.js#L29844), calls [`applyScatterTableFormatMode()`](./js/components/scatter.js#L16184), and updates grouped state through [`setScatterSessionGroupedState()`](./js/components/scatter.js#L2776). The local [`persistTabState()`](./js/components/scatter.js#L16257) helper delegates to [`Main.session.persistUserModifiedTabState()`](./js/main/session.js#L2300). Follow the setting through [payload capture](./js/components/scatter.js#L28214) and the [payload restore entry point](./js/components/scatter.js#L30532). Start from the [Scatter entry in the main registry](./js/main/components.js#L1039) and its [lazy bundle descriptor](./js/main/components.js#L18), then follow the component path. This is one implementation path, not a guarantee that every control already follows it.

## Prerequisites

- Node.js `>=20 <25`, as declared in [package.json](./package.json).
- The Python version in [.python-version](./.python-version). Install the exact pinned packages in [requirements-stats.txt](./requirements-stats.txt) for statistical-oracle checks.
- Playwright-managed Chromium for browser tests.

## Setup

```bash
npm ci
python -m venv .venv
```

Activate the environment before installing the statistical-oracle packages:

```powershell
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-stats.txt
```

On macOS or Linux, use `source .venv/bin/activate` instead of the PowerShell activation command, then run the same `python -m pip` command.

Install Chromium once per Playwright version:

```bash
npx playwright install chromium
```

To serve the app locally, run `npm run e2e:serve` and open `http://127.0.0.1:4173/index.html`.

## Development workflow

1. Create a branch from `main`.
2. Trace the changed behavior from its event or caller through the owning session, payload capture/restore, and direct tests. After hydration, the owner session is canonical; controls, tables, and rendered graphs are projections. Do not capture inactive-tab state from visible DOM.
3. Ask the repository's impact helper for candidates, then choose tests that actually cover the changed behavior and transitions:

```bash
npm run test:suggest -- --files js/components/scatter.js
npx jest --runInBand __tests__/integration/ui.events.scatter.test.js
npx playwright test e2e/scatter/scatter.2d-3d-controls.isolation.spec.js --project=chromium --workers=1
npm run quality:static
```

The two focused test paths above are examples selected from the Scatter suggestions. For another edit, replace them with paths from the output that cover its behavior; the suggestions are not exhaustive. If the component contract source changes, also run `npm run docs:component-contracts:check` directly. Run broader suites when shared lifecycle, persistence, archive, or other cross-component behavior is affected, and classify any pre-existing gate failure separately.

4. Update generated documentation with its checked-in generator when its source changes; update hand-written docs when behavior or contracts change.
5. Open a pull request with:
- scope and motivation
- testing evidence
- screenshots/videos for UI changes when applicable

## Coding Guidelines

- Follow `AGENTS.md` for normative engineering rules and `ARCHITECTURE.md` for the current system map.
- Treat `issues.txt` as the only live backlog and `CHANGELOG.md` as completed history. Do not create a parallel roadmap for ordinary open work.
- Keep changes in `css/style.css` and component/shared modules instead of inline patches.
- Prefer `Shared` and `Components` contracts over new global side channels.
- Regenerate source-derived documentation with its checked-in generator; do not hand-maintain competing contracts.
