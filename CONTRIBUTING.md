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
3. Run tests locally:

```bash
npm test
npm run test:e2e
```

4. Update documentation for behavior/API changes.
5. Open a pull request with:
- scope and motivation
- testing evidence
- screenshots/videos for UI changes when applicable

## Coding Guidelines

- Follow the architecture docs under `docs/development/`.
- Keep changes in `css/style.css` and component/shared modules instead of inline patches.
- Prefer `Shared` and `Components` contracts over new global side channels.
