const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

const TMP_DIR = path.resolve(__dirname, '.tmp');

async function captureWorkspaceArchive(page, fileStem) {
  const archive = await page.evaluate(async (stem) => {
    const context = window.Main.tabs.getSessionActionsContext();
    const blob = await window.Main.sessionActions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace',
      snapshotKind: 'document-snapshot',
      compression: 'STORE',
      reason: 'e2e-pca-3d-rotation-restore'
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return { fileName: `${stem}.graph`, base64: btoa(binary) };
  }, fileStem);
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const archivePath = path.join(TMP_DIR, archive.fileName);
  fs.writeFileSync(archivePath, Buffer.from(archive.base64, 'base64'));
  return archivePath;
}

async function awaitWarmup(page) {
  await page.evaluate(async () => {
    const sa = window.Main?.sessionActions;
    if (sa && typeof sa.awaitPostLoadWarmup === 'function') {
      await sa.awaitPostLoadWarmup({ timeoutMs: 60_000, reason: 'e2e-pca-3d-rotation-restore' });
    }
  });
}

async function buildPca3d(page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await openComponentFromWelcome(page, { type: 'pca', pageId: 'pcaPage', exampleButtonId: 'pcaLoadExample' }, { first: true });
  await page.waitForFunction(() => !!window.Components?.pca?.ready, null, { timeout: 30_000 });
  await clickExampleButtonIfPresent(page, 'pcaLoadExample');
  await page.waitForFunction(() => !!document.querySelector('#pcaPlot svg'), null, { timeout: 30_000 });
  await page.locator('#pcaViewMode').selectOption('3d');
  await page.waitForFunction(() => {
    const svg = document.querySelector('#pcaPage:not([hidden]) #pcaPlot #pcaSvg');
    return !!svg && svg.dataset?.viewMode === '3d';
  }, null, { timeout: 30_000 });
  await page.waitForTimeout(800);
}

async function dragRestoredPca3d(page) {
  const before = await page.evaluate(() => {
    const svg = document.querySelector('#pcaPage:not([hidden]) #pcaPlot #pcaSvg');
    const rotation = window.Components?.pca?.__state?.rotation || null;
    if (!svg || !rotation) {
      return { ok: false, reason: !svg ? 'missing-svg' : 'missing-rotation' };
    }
    return {
      ok: true,
      x: Number(rotation.x) || 0,
      y: Number(rotation.y) || 0,
      z: Number(rotation.z) || 0
    };
  });
  if (!before.ok) {
    return before;
  }
  const box = await page.locator('#pcaPage:not([hidden]) #pcaPlot #pcaSvg').boundingBox();
  if (!box) {
    return { ok: false, reason: 'missing-svg-box', before };
  }
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 90, startY + 35, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  return page.evaluate((beforeRotation) => {
    const svg = document.querySelector('#pcaPage:not([hidden]) #pcaPlot #pcaSvg');
    const rotation = window.Components?.pca?.__state?.rotation || null;
    if (!svg || !rotation) {
      return { ok: false, reason: !svg ? 'missing-svg-after' : 'missing-rotation-after', before: beforeRotation };
    }
    const after = {
      x: Number(rotation.x) || 0,
      y: Number(rotation.y) || 0,
      z: Number(rotation.z) || 0
    };
    const delta = Math.max(
      Math.abs(after.x - beforeRotation.x),
      Math.abs(after.y - beforeRotation.y),
      Math.abs(after.z - beforeRotation.z)
    );
    return {
      ok: delta > 1e-4,
      before: beforeRotation,
      after,
      delta,
      cursor: svg.style.cursor || '',
      attached: svg.dataset?.rotationControlsAttached || null,
      hasControlObject: !!svg.__plot3dRotationControl
    };
  }, before);
}

test('PCA 3D rotation remains live after file reopen', async ({ page }) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await buildPca3d(page);
  const archivePath = await captureWorkspaceArchive(page, 'pca-3d-rotation-restore');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await page.locator('#workspaceSessionInput').setInputFiles(archivePath);
  await awaitWarmup(page);
  await page.waitForSelector('#pcaPage:not([hidden]) #pcaPlot #pcaSvg', { timeout: 30_000 });
  await expect
    .poll(async () => page.evaluate(() => document.querySelector('#pcaPage:not([hidden]) #pcaSvg')?.dataset?.viewMode || null), {
      timeout: 30_000
    })
    .toBe('3d');

  const drag = await dragRestoredPca3d(page);
  expect(drag.ok, `restored PCA 3D plot should rotate after drag: ${JSON.stringify(drag)}`).toBe(true);
  expect(drag.attached).toBe('true');
  expect(drag.hasControlObject).toBe(true);
  expect(issues.critical.filter(e => e.kind !== 'requestfailed')).toEqual([]);
});
