const { test, expect } = require('@playwright/test');
const { buildWorkspaceArchive } = require('../helpers/archiveDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { registerIssueCollectors } = require('../helpers/diagnostics');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const {
  reloadAndAcceptRecovery,
  seedRecoveryArchive
} = require('../helpers/recoveryDriver');

function readHistFrameMetrics() {
  const root = document.querySelector('#histPage:not([hidden])') || null;
  const svgBox = root?.querySelector?.('#histGraphPanel .svgbox') || null;
  const svg = root?.querySelector?.('#histSvg') || null;
  if (!root || !svgBox || !svg) {
    return null;
  }
  const boxRect = svgBox.getBoundingClientRect();
  const svgRect = svg.getBoundingClientRect();
  const viewBox = svg.viewBox?.baseVal || null;
  return {
    boxWidth: boxRect.width,
    boxHeight: boxRect.height,
    svgWidth: svgRect.width,
    svgHeight: svgRect.height,
    viewBoxWidth: Number(viewBox?.width) || 0,
    viewBoxHeight: Number(viewBox?.height) || 0,
    staleFrameMarker: svg.dataset.e2eRecoveryResizeFrame || ''
  };
}

async function prepareHistogram(page) {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(
    page,
    { type: 'hist', pageId: 'histPage' },
    { first: true, loadExample: true }
  );
  await page.waitForFunction(() => {
    const root = document.querySelector('#histPage:not([hidden])');
    const svg = root?.querySelector?.('#histSvg');
    const box = root?.querySelector?.('#histGraphPanel .svgbox');
    const rect = svg?.getBoundingClientRect?.();
    return window.Components?.hist?.ready === true
      && !!svg
      && !!box
      && rect?.width > 40
      && rect?.height > 40;
  }, null, { timeout: 60_000 });
  await page.evaluate(() => {
    const checkbox = document.querySelector('#histPage:not([hidden]) #histGraphPanel .resizer-aspect-checkbox');
    if (checkbox?.checked) {
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await page.waitForFunction(() => {
    const box = document.querySelector('#histPage:not([hidden]) #histGraphPanel .svgbox');
    return !!box && box.dataset.resizerAspectLocked === 'false';
  }, null, { timeout: 20_000 });
  await waitForComponentOwnerReady(page, 'hist', {
    requireMountedRoot: true,
    requireIdle: true
  });
}

async function seedHistogramRecoverySnapshot(page) {
  const archive = await buildWorkspaceArchive(page, {
    scope: 'workspace',
    snapshotKind: 'recovery',
    policyMode: 'recovery',
    reason: 'e2e-hist-first-resize-recovery',
    useWorker: true
  });
  const metadata = await page.evaluate(() => {
    const workspaceState = window.Main?.session?.workspaceState || {};
    const graphTabs = Array.isArray(workspaceState.tabs)
      ? workspaceState.tabs.filter(tab => tab && !tab.isWelcome && tab.type)
      : [];
    return {
      tabCount: graphTabs.length,
      fileName: workspaceState.sessionFileName || 'recovered.graph',
      filePath: workspaceState.sessionFilePath || '',
      fileScope: workspaceState.sessionFileScope || 'workspace'
    };
  });
  await seedRecoveryArchive(page, archive.base64, {
    reason: 'e2e-hist-first-resize-recovery',
    dirty: true,
    hasData: true,
    ...metadata
  });
  return { bytes: archive.size, tabCount: metadata.tabCount };
}

async function reloadAndAcceptHistogramRecovery(page) {
  const recoveryAccepted = await reloadAndAcceptRecovery(page, { timeout: 20_000 });
  expect(recoveryAccepted, 'Histogram crash-recovery prompt should be accepted').toBe(true);
  await page.waitForFunction(() => {
    const state = window.Main?.session?.workspaceState || null;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const root = document.querySelector('#histPage:not([hidden])');
    return active?.type === 'hist'
      && window.Components?.hist?.ready === true
      && !!root?.querySelector?.('#histSvg');
  }, null, { timeout: 60_000 });
  await waitForComponentOwnerReady(page, 'hist', {
    requireMountedRoot: true,
    requireIdle: true
  });
}

async function dragHistogramWidthOnce(page, dx) {
  const handle = page.locator('#histPage:not([hidden]) #histGraphPanel .svgbox .resizer-vertical').first();
  await expect(handle).toBeVisible({ timeout: 20_000 });
  const rect = await handle.boundingBox();
  if (!rect) {
    throw new Error('Histogram horizontal resize handle has no bounding box.');
  }
  const startX = rect.x + rect.width / 2;
  const startY = rect.y + rect.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY, { steps: 18 });
  await page.mouse.up();
}

test('Histogram recovery redraws graph contents on the first resize gesture', async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const issues = registerIssueCollectors(page);
  await prepareHistogram(page);

  const recovery = await seedHistogramRecoverySnapshot(page);
  expect(recovery.bytes).toBeGreaterThan(0);
  await reloadAndAcceptHistogramRecovery(page);

  const before = await page.evaluate(() => {
    const svg = document.querySelector('#histPage:not([hidden]) #histSvg');
    if (!svg) return null;
    svg.dataset.e2eRecoveryResizeFrame = 'restored-frame';
    return (function read() {
      const root = document.querySelector('#histPage:not([hidden])');
      const svgBox = root?.querySelector?.('#histGraphPanel .svgbox');
      const currentSvg = root?.querySelector?.('#histSvg');
      if (!svgBox || !currentSvg) return null;
      const boxRect = svgBox.getBoundingClientRect();
      const svgRect = currentSvg.getBoundingClientRect();
      const viewBox = currentSvg.viewBox?.baseVal;
      return {
        boxWidth: boxRect.width,
        boxHeight: boxRect.height,
        svgWidth: svgRect.width,
        svgHeight: svgRect.height,
        viewBoxWidth: Number(viewBox?.width) || 0,
        viewBoxHeight: Number(viewBox?.height) || 0,
        staleFrameMarker: currentSvg.dataset.e2eRecoveryResizeFrame || ''
      };
    })();
  });
  expect(before).not.toBeNull();

  await dragHistogramWidthOnce(page, 120);
  await expect.poll(async () => {
    const metrics = await page.evaluate(readHistFrameMetrics);
    return metrics?.staleFrameMarker || '';
  }, {
    timeout: 20_000,
    message: 'The first post-recovery resize must publish a fresh Histogram SVG frame'
  }).toBe('');
  await waitForComponentOwnerReady(page, 'hist', {
    requireMountedRoot: true,
    requireIdle: true
  });

  const after = await page.evaluate(readHistFrameMetrics);
  await testInfo.attach('hist-recovery-first-resize.metrics.json', {
    body: Buffer.from(JSON.stringify({ recovery, before, after, issues: issues.all }, null, 2), 'utf8'),
    contentType: 'application/json'
  });

  expect(after).not.toBeNull();
  expect(after.boxWidth).toBeGreaterThan(before.boxWidth + 60);
  expect(after.viewBoxWidth).toBeGreaterThan(before.viewBoxWidth + 20);
  expect(Math.abs(after.viewBoxHeight - before.viewBoxHeight)).toBeLessThanOrEqual(2);
  expect(issues.critical).toEqual([]);
});
