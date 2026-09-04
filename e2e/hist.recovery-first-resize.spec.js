const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

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
  await page.waitForTimeout(300);
}

async function seedHistogramRecoverySnapshot(page) {
  return page.evaluate(async () => {
    const request = window.indexedDB.open('graphitix-document-state', 2);
    const db = await new Promise((resolve, reject) => {
      request.onupgradeneeded = () => {
        const opened = request.result;
        if (!opened.objectStoreNames.contains('snapshots')) {
          opened.createObjectStore('snapshots');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB open failed.'));
    });
    const context = window.Main?.tabs?.getSessionActionsContext?.();
    const blob = await window.Main?.sessionActions?.buildWorkspaceArchiveBlob?.(context, {
      scope: 'workspace',
      snapshotKind: 'recovery',
      policyMode: 'recovery',
      reason: 'e2e-hist-first-resize-recovery',
      useWorker: true
    });
    if (!blob) {
      db.close();
      throw new Error('Histogram recovery archive was not created.');
    }
    const workspaceState = window.Main?.session?.workspaceState || {};
    const graphTabs = Array.isArray(workspaceState.tabs)
      ? workspaceState.tabs.filter(tab => tab && !tab.isWelcome && tab.type)
      : [];
    await new Promise((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readwrite');
      tx.objectStore('snapshots').put({
        meta: {
          app: 'Graphitix',
          kind: 'recovery',
          version: 1,
          savedAt: new Date().toISOString(),
          updatedAt: Date.now(),
          reason: 'e2e-hist-first-resize-recovery',
          dirty: true,
          hasData: true,
          tabCount: graphTabs.length,
          fileName: workspaceState.sessionFileName || 'recovered.graph',
          filePath: workspaceState.sessionFilePath || '',
          fileScope: workspaceState.sessionFileScope || 'workspace'
        },
        blob
      }, 'active-recovery');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB recovery write failed.'));
    });
    db.close();
    return { bytes: blob.size, tabCount: graphTabs.length };
  });
}

async function reloadAndAcceptHistogramRecovery(page) {
  let recoveryAccepted = false;
  const dialogHandler = async dialog => {
    if (/recover|restore/i.test(dialog.message())) {
      recoveryAccepted = true;
    }
    await dialog.accept();
  };
  page.on('dialog', dialogHandler);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(() => recoveryAccepted, {
      timeout: 20_000,
      message: 'Histogram crash-recovery prompt should be accepted'
    }).toBe(true);
    await page.waitForFunction(() => {
      const state = window.Main?.session?.workspaceState || null;
      const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
      const root = document.querySelector('#histPage:not([hidden])');
      return active?.type === 'hist'
        && window.Components?.hist?.ready === true
        && !!root?.querySelector?.('#histSvg');
    }, null, { timeout: 60_000 });
    await page.waitForTimeout(350);
  } finally {
    page.off('dialog', dialogHandler);
  }
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
  await page.waitForTimeout(400);

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
