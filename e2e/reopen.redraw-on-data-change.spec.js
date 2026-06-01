const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const {
  COMPONENT_MATRIX,
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

const TMP_DIR = path.resolve(__dirname, '.tmp');

// ---------------------------------------------------------------------------
// In-page helpers (serialized into the browser by page.evaluate — keep them
// self-contained: no references to module-scope variables). Everything is driven
// off the rendered AG grid DOM so it works uniformly for every component,
// including the ones that expose no public hot accessor.
// ---------------------------------------------------------------------------

// Signature of everything rendered in the component's graph area. A genuine redraw
// with changed data MUST alter it; a suppressed draw leaves the restored DOM
// byte-for-byte identical. Captures geometry, fills and text (svg outerHTML) plus
// canvas pixels, so it covers colour-driven heatmaps and canvas-mode scatter too.
function graphSignatureInPage(type) {
  const pageEl = document.getElementById(type + 'Page');
  if (!pageEl) { return 'no-page'; }
  let sig = '';
  const svgs = pageEl.querySelectorAll('.svgbox svg, #' + type + 'Plot svg, svg');
  const seen = new Set();
  for (let i = 0; i < svgs.length; i += 1) {
    if (seen.has(svgs[i])) { continue; }
    seen.add(svgs[i]);
    sig += svgs[i].outerHTML;
  }
  const canvases = pageEl.querySelectorAll('canvas');
  for (let i = 0; i < canvases.length; i += 1) {
    try { sig += canvases[i].toDataURL(); }
    catch (e) { sig += 'canvas' + (canvases[i].width || 0) + 'x' + (canvases[i].height || 0); }
  }
  let h1 = 0;
  let h2 = 5381;
  for (let i = 0; i < sig.length; i += 1) {
    const ch = sig.charCodeAt(i);
    h1 = (h1 * 31 + ch) | 0;
    h2 = (h2 * 131 + ch) | 0;
  }
  return sig.length + ':' + h1 + ':' + h2;
}

// Is the active component's AG grid populated with at least one body data cell?
function activeGridHasDataInPage(type) {
  const pageEl = document.getElementById(type + 'Page');
  if (!pageEl) { return false; }
  const rows = pageEl.querySelectorAll('.ag-center-cols-container .ag-row');
  for (const row of rows) {
    const ri = Number(row.getAttribute('row-index'));
    if (!Number.isFinite(ri) || ri < 1) { continue; }
    const cells = row.querySelectorAll('.ag-cell');
    for (const cell of cells) {
      if ((cell.textContent || '').trim() !== '') { return true; }
    }
  }
  return false;
}

// Find the first editable body cell (prefer a numeric value so the plotted geometry
// is guaranteed to change). Returns { rowIndex, colId, text, numeric } or null.
function findEditableCellInPage(type) {
  const pageEl = document.getElementById(type + 'Page');
  if (!pageEl) { return null; }
  const rows = Array.from(pageEl.querySelectorAll('.ag-center-cols-container .ag-row'))
    .filter(r => Number(r.getAttribute('row-index')) >= 1)
    .sort((a, b) => Number(a.getAttribute('row-index')) - Number(b.getAttribute('row-index')));
  let textFallback = null;
  for (const row of rows) {
    const ri = Number(row.getAttribute('row-index'));
    const cells = Array.from(row.querySelectorAll('.ag-cell'));
    for (const cell of cells) {
      const colId = cell.getAttribute('col-id');
      const txt = (cell.textContent || '').trim();
      if (!colId || txt === '') { continue; }
      if (isFinite(Number(txt))) {
        return { rowIndex: ri, colId, text: txt, numeric: true };
      }
      if (!textFallback) {
        textFallback = { rowIndex: ri, colId, text: txt, numeric: false };
      }
    }
  }
  return textFallback;
}

// ---------------------------------------------------------------------------
// Node-side helpers
// ---------------------------------------------------------------------------

// Load a component's example dataset with a real (trusted) click. Components bind
// their control handlers asynchronously after the page is shown and some ignore
// synthetic clicks, so retry the trusted click until the grid actually has data.
async function loadExampleTrusted(page, component) {
  const button = page.locator(`#${component.pageId}:not([hidden]) #${component.exampleButtonId}`).first();
  await expect(button).toBeVisible({ timeout: 20_000 });
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await button.click({ force: true, timeout: 10_000 }).catch(() => {});
    try {
      await page.waitForFunction(activeGridHasDataInPage, component.type, { timeout: 4_000 });
      return;
    } catch (e) {
      await page.waitForTimeout(600);
    }
  }
  await page.waitForFunction(activeGridHasDataInPage, component.type, { timeout: 8_000 });
}

// Edit one body cell through the real AG grid editor (double-click → type → Enter),
// dramatically changing a numeric value so the rendered graph must change.
async function editGridCell(page, component) {
  const target = await page.evaluate(findEditableCellInPage, component.type);
  if (!target) { return { ok: false, reason: 'no-editable-cell' }; }
  const cell = page.locator(
    `#${component.pageId}:not([hidden]) .ag-center-cols-container .ag-row[row-index="${target.rowIndex}"] .ag-cell[col-id="${target.colId}"]`
  ).first();
  await cell.scrollIntoViewIfNeeded();
  await cell.dblclick();
  // AG grid's active inline editor is a text field; scope to the editing cell so we
  // never pick up the grid's row-select checkboxes (which share ag-input-field-input).
  const editor = page.locator('.ag-cell-inline-editing input.ag-text-field-input, .ag-cell-inline-editing input.ag-input-field-input[type="text"]').first();
  await expect(editor).toBeVisible({ timeout: 5_000 });
  const nextValue = target.numeric ? String(Number(target.text) + 99999) : `${target.text}_e2e`;
  await editor.fill(nextValue);
  await editor.press('Enter');
  return { ok: true, target, nextValue };
}

async function captureWorkspaceArchive(page, fileStem) {
  const archive = await page.evaluate(async (stem) => {
    const tabsApi = window.Main?.tabs;
    const sessionActions = window.Main?.sessionActions;
    const context = tabsApi.getSessionActionsContext();
    const blob = await sessionActions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace',
      snapshotKind: 'document-snapshot',
      compression: 'STORE',
      reason: 'e2e-reopen-redraw-archive'
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const chunk = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return { fileName: `${stem}.graph`, base64: btoa(binary) };
  }, fileStem);
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const archivePath = path.join(TMP_DIR, archive.fileName);
  fs.writeFileSync(archivePath, Buffer.from(archive.base64, 'base64'));
  return archivePath;
}

async function waitForGraph(page, type) {
  await page.waitForFunction((t) => {
    const pageEl = document.getElementById(t + 'Page');
    if (!pageEl) { return false; }
    return !!(pageEl.querySelector('svg') || pageEl.querySelector('canvas'));
  }, type, { timeout: 30_000 });
}

async function reopenArchiveAndActivate(page, archivePath, type) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  const input = page.locator('#workspaceSessionInput');
  await expect(input).toHaveCount(1, { timeout: 20_000 });
  await input.setInputFiles(archivePath);
  await page.waitForTimeout(2_500);

  const tabId = await page.evaluate((t) => {
    const tabs = window.Main?.session?.workspaceState?.tabs || [];
    return (tabs.find(tab => tab && tab.type === t && !tab.isWelcome) || {}).id || null;
  }, type);
  if (tabId) {
    await page.evaluate(async (id) => {
      const fn = window.Main?.tabs?.activateTab;
      if (typeof fn === 'function') {
        const p = fn(id, { reason: 'e2e-reopen-redraw-activate' });
        if (p && typeof p.then === 'function') { await p; }
      }
    }, tabId);
  }
  return tabId;
}

// ---------------------------------------------------------------------------
// Exhaustive cross-component regression: after reopening a saved file, the first
// data edit must redraw the graph immediately — without any resize. This guards
// the post-render-cache-restore draw-suppression regression (data edits were
// swallowed until a resize lifted the guard) across every component.
// ---------------------------------------------------------------------------

test.describe('Reopen → data edit redraws immediately (all components)', () => {
  for (const component of COMPONENT_MATRIX) {
    test(`reopen + table edit redraws without resize: ${component.type}`, async ({ page }) => {
      test.setTimeout(240_000);
      const issues = registerIssueCollectors(page);
      await installLocalCdnOverrides(page);

      await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
      await openComponentFromWelcome(page, component, { first: true });
      await loadExampleTrusted(page, component);
      await waitForGraph(page, component.type);
      await page.waitForTimeout(1_200);

      const archivePath = await captureWorkspaceArchive(page, `reopen-redraw-${component.type}`);

      const tabId = await reopenArchiveAndActivate(page, archivePath, component.type);
      expect(tabId, `${component.type} tab not found after reopen`).toBeTruthy();
      await waitForGraph(page, component.type);
      await page.waitForFunction(activeGridHasDataInPage, component.type, { timeout: 20_000 });
      await page.waitForTimeout(900);

      // Deterministically recreate the just-reopened state: re-arm the
      // post-render-cache-restore draw suppression for this tab. On the buggy code
      // path this guard swallows the edit's redraw (the user had to resize to see
      // the change); the fix lifts it the moment the grid is modified.
      await page.evaluate(({ type, id }) => {
        window.Shared?.componentLifecycle?.markPostRestoreDrawSuppression?.(type, id, {
          count: 24,
          delayMs: 8_000,
          reason: 'e2e-reopen-guard'
        });
      }, { type: component.type, id: tabId });

      const before = await page.evaluate(graphSignatureInPage, component.type);
      expect(before, `${component.type} should have a rendered graph after reopen`).not.toBe('no-page');

      const editResult = await editGridCell(page, component);
      expect(editResult.ok, `could not edit a data cell for ${component.type}: ${editResult.reason || ''}`).toBe(true);

      // No resize, no other interaction: the edit alone must drive the redraw.
      await expect.poll(
        async () => (await page.evaluate(graphSignatureInPage, component.type)) !== before,
        {
          timeout: 15_000,
          intervals: [150, 300, 500, 800, 1_200]
        }
      ).toBe(true);

      // Failed network requests are environmental in the sandboxed e2e runner
      // (e.g. venn's GO/STRING/species lookups hit blocked external APIs) and are
      // unrelated to the redraw behaviour under test; only fail on real page/JS errors.
      const criticalErrors = issues.critical.filter(entry => entry.kind !== 'requestfailed');
      expect(
        criticalErrors,
        `Critical browser issues for ${component.type}: ${JSON.stringify(criticalErrors.slice(0, 5), null, 2)}`
      ).toEqual([]);
    });
  }
});
