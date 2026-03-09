# Venn Desktop Wrapper

This folder contains an Electron wrapper that coexists with the existing web app.

## Commands

From the repository root:

- `npm run desktop:dev`  
  Starts the existing static server (`scripts/e2e-server.cjs`) and opens Electron against `http://127.0.0.1:4173/index.html`.
- `npm run desktop:sync`  
  Copies web assets (`index.html`, `css/`, `js/`, `libs/`) into `desktop/app/`.
- `npm run desktop:build`  
  Syncs web assets and builds installable desktop artifacts via Electron Builder.
- `npm run desktop:build:portable`  
  Builds a single-file Windows portable executable.
- `npm run desktop:build:installer`  
  Builds the Windows installer (`nsis`).

From `desktop/` directly:

- `npm run dev`
- `npm run sync:web`
- `npm run build`
- `npm run build:win:portable`
- `npm run build:win:nsis`

## Notes

- The website remains unchanged; Electron is an isolated wrapper.
- Packaged desktop builds load `desktop/app/index.html`.
- Runtime API bridge is exposed as `window.desktop` via `preload.cjs`.
- Desktop sync rewrites CDN references to local `desktop/app/vendor/*` assets so packaged builds run without jsDelivr access.
- GO/STRING/UniProt analysis features still require internet because they call external APIs.
- `dist/win-unpacked/Venn.exe` is not standalone; it depends on sibling DLL files in the same folder.
- For a copyable single executable, use the portable artifact from `npm run desktop:build:portable`.
- Closing with unsaved workspace changes is handled by a native Electron dialog (`Save and Exit`, `Exit without Saving`, `Cancel`).
