const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent,
  waitForDocumentOpenComplete
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
  await waitForPca3dInteractionReady(page);
  await page.waitForFunction(() => {
    const svg = document.querySelector('#pcaPage:not([hidden]) #pcaPlot #pcaSvg');
    return (svg?.querySelectorAll?.('[data-plot-point="1"]')?.length || 0) > 0
      && window.Components?.pca?.isIdleForSnapshot?.() === true;
  }, null, { timeout: 60_000 });
}

async function waitForPca3dInteractionReady(page, timeout = 30_000) {
  await page.waitForFunction(() => {
    const svg = document.querySelector('#pcaPage:not([hidden]) #pcaPlot #pcaSvg');
    const state = window.Main?.session?.workspaceState;
    const tab = state?.tabs?.find(entry => entry?.id === state.activeTabId) || null;
    const session = window.Components?.pca?.__testHooks?.getSession?.(tab?.id) || null;
    return !!svg
      && svg.dataset?.viewMode === '3d'
      && svg.dataset?.rotationControlsAttached === 'true'
      && session?.refs?.svg === svg
      && typeof session?.refs?.rotationRenderer === 'function';
  }, null, { timeout });
}

async function prepareScatter3dExample(page) {
  await page.locator('#scatterPage:not([hidden]) #scatterViewMode').selectOption('3d');
  await clickExampleButtonIfPresent(page, 'scatterLoadExample');
  await page.waitForFunction(() => {
    const svg = document.querySelector('#scatterPage:not([hidden]) #scatterPlot #scatterSvg');
    const state = window.Main?.session?.workspaceState;
    const tab = state?.tabs?.find(entry => entry?.id === state.activeTabId) || null;
    const session = window.Components?.scatter?.__testHooks?.getSession?.(tab?.id) || null;
    return !!svg
      && svg.dataset?.viewMode === '3d'
      && svg.dataset?.rotationControlsAttached === 'true'
      && typeof session?.refs?.rotationRenderer === 'function';
  }, null, { timeout: 30_000 });
}


async function capturePcaStatsState(page) {
  return page.evaluate(() => {
    const root = document.querySelector('#pcaPage:not([hidden])');
    const summary = root?.querySelector('#pcaStatsSummary') || null;
    const results = root?.querySelector('#pcaStatsResults') || null;
    const scree = root?.querySelector('#pcaScreeContainer svg') || null;
    const eigenRows = root?.querySelectorAll('#pcaEigenTableContainer tbody tr') || [];
    const reportHost = root?.querySelector('#pcaStatsReportHost') || null;
    const normalizedText = value => String(value || '').replace(/\s+/g, ' ').trim();
    return {
      summaryText: normalizedText(summary?.textContent),
      resultsText: normalizedText(results?.textContent),
      summaryChildCount: summary?.childElementCount || 0,
      resultsChildCount: results?.childElementCount || 0,
      hasScree: !!scree,
      eigenRowCount: eigenRows.length,
      reportText: normalizedText(reportHost?.textContent)
    };
  });
}

async function dragRestoredPca3d(page) {
  const before = await page.evaluate(() => {
    const svg = document.querySelector('#pcaPage:not([hidden]) #pcaPlot #pcaSvg');
    const rotation = window.Components?.pca?.__state?.rotation || null;
    const tabId = window.Main?.session?.workspaceState?.activeTabId || null;
    const session = window.Components?.pca?.__testHooks?.getSession?.(tabId) || null;
    if (!svg || !rotation || !session) {
      return {
        ok: false,
        reason: !svg ? 'missing-svg' : (!rotation ? 'missing-rotation' : 'missing-owner-session')
      };
    }
    window.__graphitixPcaRotationIdentity = {
      tabId,
      session,
      svg,
      renderer: session.refs?.rotationRenderer || null,
      analysisCache: session.cache?.analysisRuntime?.cache || null
    };
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
    const probe = window.__graphitixPcaRotationIdentity || null;
    const tabId = window.Main?.session?.workspaceState?.activeTabId || null;
    const session = window.Components?.pca?.__testHooks?.getSession?.(tabId) || null;
    const identity = {
      sameTab: !!probe && probe.tabId === tabId,
      sameSession: !!probe && probe.session === session,
      sameSvg: !!probe && probe.svg === svg && session?.refs?.svg === svg,
      sameRenderer: !!probe && probe.renderer === session?.refs?.rotationRenderer,
      sameAnalysisCache: !!probe && probe.analysisCache === (session?.cache?.analysisRuntime?.cache || null),
      rotationPending: !!session?.timers?.rotationPending
    };
    delete window.__graphitixPcaRotationIdentity;
    return {
      ok: delta > 1e-4,
      before: beforeRotation,
      after,
      delta,
      cursor: svg.style.cursor || '',
      attached: svg.dataset?.rotationControlsAttached || null,
      hasControlObject: !!svg.__plot3dRotationControl,
      identity
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
  await waitForDocumentOpenComplete(page);
  await page.waitForSelector('#pcaPage:not([hidden]) #pcaPlot #pcaSvg', { timeout: 30_000 });
  await waitForPca3dInteractionReady(page);

  const statsBeforeRotation = await capturePcaStatsState(page);
  expect(statsBeforeRotation.hasScree).toBe(true);
  expect(statsBeforeRotation.eigenRowCount).toBeGreaterThan(0);
  expect(statsBeforeRotation.resultsText.length).toBeGreaterThan(0);

  const drag = await dragRestoredPca3d(page);
  expect(drag.ok, `restored PCA 3D plot should rotate after drag: ${JSON.stringify(drag)}`).toBe(true);
  expect(drag.attached).toBe('true');
  expect(drag.hasControlObject).toBe(true);
  expect(drag.identity).toEqual({
    sameTab: true,
    sameSession: true,
    sameSvg: true,
    sameRenderer: true,
    sameAnalysisCache: true,
    rotationPending: false
  });

  const statsAfterRotation = await capturePcaStatsState(page);
  expect(statsAfterRotation).toEqual(statsBeforeRotation);
  expect(issues.critical.filter(e => e.kind !== 'requestfailed')).toEqual([]);
});

test('PCA 3D rotation reuses its owner geometry after a Scatter 3D tab switch', async ({ page }) => {
  test.setTimeout(150_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await buildPca3d(page);

  const pcaTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  expect(pcaTabId).toBeTruthy();

  await openComponentFromWelcome(page, {
    type: 'scatter',
    pageId: 'scatterPage',
    exampleButtonId: 'scatterLoadExample'
  });
  await prepareScatter3dExample(page);

  await page.evaluate(async tabId => {
    const result = window.Main?.tabs?.activateTab?.(tabId, { reason: 'e2e-pca-return-after-scatter-3d' });
    if(result && typeof result.then === 'function'){
      await result;
    }
  }, pcaTabId);
  await page.waitForFunction(tabId => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    return active?.id === tabId;
  }, pcaTabId, { timeout: 30_000 });
  await waitForPca3dInteractionReady(page);

  const beforeOwner = await page.evaluate(tabId => {
    const session = window.Components?.pca?.__testHooks?.getSession?.(tabId) || null;
    const svg = document.querySelector('#pcaPage:not([hidden]) #pcaSvg');
    return {
      tabId: session?.tabId || null,
      ownsSvg: session?.refs?.svg === svg,
      hasRotationRenderer: typeof session?.refs?.rotationRenderer === 'function'
    };
  }, pcaTabId);
  expect(beforeOwner).toEqual({ tabId: pcaTabId, ownsSvg: true, hasRotationRenderer: true });

  const drag = await dragRestoredPca3d(page);
  expect(drag.ok, `PCA should rotate from its cached owner geometry: ${JSON.stringify(drag)}`).toBe(true);
  expect(drag.identity).toEqual({
    sameTab: true,
    sameSession: true,
    sameSvg: true,
    sameRenderer: true,
    sameAnalysisCache: true,
    rotationPending: false
  });
  expect(issues.critical.filter(entry => entry.kind !== 'requestfailed')).toEqual([]);
});
