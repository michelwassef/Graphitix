# Graphitix Desktop Wrapper

This folder contains an Electron wrapper for the Graphitix web application.

## Commands

From the repository root:

- `npm run desktop:dev`  
  Starts the existing static server (`scripts/e2e-server.cjs`) and opens Electron against `http://127.0.0.1:4173/index.html`.
- `npm run desktop:sync`  
  Copies web assets (`index.html`, `css/`, `js/`, `libs/`) into `desktop/app/`.
- `npm run desktop:sync:version`  
  Syncs `desktop/package.json` version to the root `package.json` version.
- `npm run desktop:build`  
  Syncs web assets and builds installable desktop artifacts via Electron Builder.
- `npm run desktop:build:portable`  
  Builds a single-file Windows portable executable.
- `npm run desktop:build:installer`  
  Syncs the current web app and builds the Windows NSIS installer.

From `desktop/` directly:

- `npm run dev`
- `npm run sync:version`
- `npm run sync:web`
- `npm run build`
- `npm run build:win:portable`
- `npm run build:win:nsis`

## Notes

- The web app remains unchanged; Electron is an isolated wrapper.
- Packaged desktop builds load `desktop/app/index.html`.
- Runtime API bridge is exposed as `window.desktop` via `preload.cjs`.
- Desktop sync rewrites CDN references to local `desktop/app/vendor/*` assets so packaged builds run without jsDelivr access.
- The NSIS installer shows the root `LICENSE` file, creates Start Menu/Desktop shortcuts, and registers `.graph` as a Graphitix workspace file.
- Opening a `.graph` file from Explorer launches Graphitix or focuses the existing instance and loads the file through the same archive import path used by the web UI.
- GO/STRING/UniProt analysis features still require internet because they call external APIs.
- `dist/win-unpacked/Graphitix.exe` is not standalone; it depends on sibling DLL files in the same folder.
- For a proper installable executable, use the NSIS setup artifact from `npm run desktop:build:installer`.
- For a copyable single executable without file association, use the portable artifact from `npm run desktop:build:portable`.
- Closing with unsaved workspace changes is handled by a native Electron dialog (`Save and Exit`, `Exit without Saving`, `Cancel`).
- Symlinks are not used because desktop packaging applies offline-specific URL patching to a build copy (`desktop/app`); this keeps the website source unchanged.
