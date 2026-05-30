const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

const TMP_DIR = path.resolve(__dirname, '.tmp');

async function loadScatterExample(page) {
  await expect(page.locator('#scatterLoadExample')).toBeVisible({ timeout: 20_000 });
  await page.locator('#scatterLoadExample').click();
  await page.waitForFunction(() => {
    const hot = window.Components?.scatter?.__getActiveHot?.();
    const data = hot?.getData?.() || [];
    return Array.isArray(data) && data.length > 2;
  }, null, { timeout: 20_000 });
}

async function waitForScatterIdle(page) {
  await page.waitForFunction(() => {
    if (typeof window.Components?.scatter?.isIdleForSnapshot !== 'function') return true;
    return window.Components.scatter.isIdleForSnapshot();
  }, null, { timeout: 60_000 });
}

function hasTrendPath(page) {
  return page.evaluate(
    () => !!document.querySelector('#scatterPage:not([hidden]) #scatterPlot svg path[data-scatter-overlay="trend"]')
  );
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
      reason: 'e2e-reopen-trend-archive'
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

async function dragScatterResize(page, deltaY = 80) {
  const handle = page.locator('#scatterPage:not([hidden]) .svgbox .resizer-horizontal').first();
  const box = await handle.boundingBox();
  if (!box) return;
  const x = box.x + box.width / 2;
  const y = box.y + Math.max(2, Math.min(box.height - 2, box.height / 2));
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + deltaY, { steps: 12 });
  await page.mouse.up();
}

test('scatter trend line persists after reopening a saved file', async ({ page }) => {
  test.setTimeout(300_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });

  await loadScatterExample(page);

  // Compute stats with trend off, then enable the trend line so the saved file has it on.
  const showLineEl = page.locator('#scatterShowLine');
  await expect(showLineEl).toBeVisible({ timeout: 10_000 });
  if (await showLineEl.isChecked()) { await showLineEl.uncheck(); await page.waitForTimeout(200); }
  await expect(page.locator('#scatterComputeStats')).toBeEnabled({ timeout: 20_000 });
  await page.locator('#scatterComputeStats').click();
  await expect(page.locator('#scatterStatsStatus')).toContainText('Statistics up to date.', { timeout: 35_000 });
  await showLineEl.check();
  await page.waitForTimeout(500);
  await waitForScatterIdle(page);

  expect(await hasTrendPath(page), 'trend path should be present before save').toBe(true);
  await page.waitForTimeout(1500); // let render cache settle

  const archivePath = await captureWorkspaceArchive(page, 'scatter-reopen-trend');

  // Reload and reopen the saved workspace.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  const input = page.locator('#workspaceSessionInput');
  await expect(input).toHaveCount(1, { timeout: 20_000 });
  await input.setInputFiles(archivePath);
  await page.waitForTimeout(2_000);

  const restoredTabId = await page.evaluate(() => {
    const tabs = window.Main?.session?.workspaceState?.tabs || [];
    return (tabs.find(t => t && t.type === 'scatter' && !t.isWelcome) || {}).id || null;
  });
  expect(restoredTabId, 'scatter tab not found after reopen').toBeTruthy();

  await page.evaluate(async (id) => {
    const fn = window.Main?.tabs?.activateTab;
    if (typeof fn === 'function') { const p = fn(id, { reason: 'e2e-reopen-activate' }); if (p?.then) await p; }
  }, restoredTabId);

  // The trend checkbox must still be checked after reopen.
  await expect(page.locator('#scatterShowLine')).toBeChecked({ timeout: 20_000 });

  // Force a live redraw (the resize handle drag) — this is exactly the interaction that
  // previously dropped the restored trend line. Then give async restore a chance to settle.
  await dragScatterResize(page, 80);
  await page.waitForTimeout(1_500);
  await waitForScatterIdle(page);
  await page.waitForTimeout(500);

  // The trend line must still be rendered — it must not flash and disappear.
  expect(
    await hasTrendPath(page),
    'trend line must remain rendered after reopening the file and a live redraw'
  ).toBe(true);

  expect(issues.critical).toEqual([]);
});
