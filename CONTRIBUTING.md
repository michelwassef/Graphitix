# Contributing

## Prerequisites

- Node.js 20+
- Python 3.10+ with `numpy` and `scipy` for differential stats tests

## Setup

```bash
npm install
```

## Development Workflow

1. Create a branch from `main`.
2. Make focused changes.
3. Run the relevant local gates:

```bash
npm run quality:static
npm test -- --runInBand
npm run test:e2e:contracts
npm run pages:check
```

Use targeted Jest or Playwright files while developing, then run the broadest applicable gate before opening a pull request.

4. Update documentation for behavior or contract changes.
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
