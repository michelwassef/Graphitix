const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

async function activeScatterTabId(page) {
  return page.evaluate(() => {
    const state = window.Main?.session?.workspaceState || {};
    const active = (state.tabs || []).find(tab => tab && tab.id === state.activeTabId) || null;
    return active && active.type === 'scatter' ? String(active.id || '') : '';
  });
}

async function activateTab(page, tabId, reason) {
  await page.evaluate(async ({ tabId, reason }) => {
    const result = window.Main?.tabs?.activateTab?.(tabId, { reason });
    if (result && typeof result.then === 'function') {
      await result;
    }
  }, { tabId, reason });
  await page.waitForSelector('#scatterPage:not([hidden])', { timeout: 20_000 });
}

async function waitForScatterSvg(page, mode) {
  await page.waitForFunction((expectedMode) => {
    const svg = document.querySelector('#scatterPage:not([hidden]) #scatterPlot svg');
    const select = document.querySelector('#scatterPage:not([hidden]) #scatterViewMode');
    return !!svg
      && (!expectedMode || svg.dataset?.viewMode === expectedMode)
      && (!expectedMode || select?.value === expectedMode);
  }, mode || null, { timeout: 30_000 });
}

async function readScatterControls(page) {
  return page.evaluate(() => {
    const root = document.querySelector('#scatterPage:not([hidden])');
    const lock = root?.querySelector?.('.svgbox .resizer-aspect-checkbox') || null;
    const frame = root?.querySelector?.('#scatterShowFrame') || null;
    const mode = root?.querySelector?.('#scatterViewMode') || null;
    const svgBox = root?.querySelector?.('.svgbox') || null;
    const svg = root?.querySelector?.('#scatterPlot svg') || null;
    return {
      mode: mode?.value || null,
      svgMode: svg?.dataset?.viewMode || null,
      lockChecked: !!lock?.checked,
      lockDisabled: !!lock?.disabled,
      showFrame: !!frame?.checked,
      aspectLocked: svgBox?.dataset?.resizerAspectLocked || null
    };
  });
}

async function setLockRatio(page, checked) {
  await page.evaluate((nextChecked) => {
    const root = document.querySelector('#scatterPage:not([hidden])');
    const lock = root?.querySelector?.('.svgbox .resizer-aspect-checkbox') || null;
    if (!lock) {
      throw new Error('scatter lock-ratio checkbox not found');
    }
    lock.disabled = false;
    if (lock.checked !== nextChecked) {
      lock.checked = nextChecked;
      lock.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, checked);
  await page.waitForTimeout(250);
}

async function setShowFrame(page, checked) {
  const frame = page.locator('#scatterPage:not([hidden]) #scatterShowFrame');
  await expect(frame).toBeVisible({ timeout: 20_000 });
  if (checked) {
    await frame.check({ force: true });
  } else {
    await frame.uncheck({ force: true });
  }
  await page.waitForTimeout(250);
}

async function loadScatterExampleForMode(page, mode) {
  await clickExampleButtonIfPresent(page, 'scatterLoadExample');
  await page.waitForFunction(() => {
    const hot = window.Components?.scatter?.__getActiveHot?.();
    const data = hot?.getData?.() || [];
    return Array.isArray(data) && data.length > 2;
  }, null, { timeout: 30_000 });
  if (mode === '3d') {
    await page.locator('#scatterPage:not([hidden]) #scatterViewMode').selectOption('3d');
    await clickExampleButtonIfPresent(page, 'scatterLoadExample');
    await page.waitForFunction(() => {
      const hot = window.Components?.scatter?.__getActiveHot?.();
      const data = hot?.getData?.() || [];
      return Array.isArray(data)
        && data.length > 2
        && data.some((row, index) => index > 0 && Array.isArray(row) && row[3] !== '' && row[3] != null);
    }, null, { timeout: 30_000 });
    await waitForScatterSvg(page, '3d');
  } else {
    await page.locator('#scatterPage:not([hidden]) #scatterViewMode').selectOption('2d');
    await waitForScatterSvg(page, '2d');
  }
}

async function dragScatter3d(page) {
  const svg = page.locator('#scatterPage:not([hidden]) #scatterPlot svg').first();
  const box = await svg.boundingBox();
  expect(box).toBeTruthy();
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 90, startY + 35, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(700);
}

async function captureActiveScatterTab(page) {
  return page.evaluate(async () => {
    const state = window.Main?.session?.workspaceState || {};
    const tab = (state.tabs || []).find(item => item && item.id === state.activeTabId) || null;
    if (!tab || tab.type !== 'scatter') {
      throw new Error('active tab is not scatter');
    }
    const ok = window.Main?.session?.persistActiveTabState?.(tab, {
      reason: 'e2e-scatter-2d-3d-control-isolation',
      origin: 'lifecycle',
      captureLivePayload: true,
      allowSkipLivePayloadCapture: false
    });
    if (ok && typeof ok.then === 'function') {
      await ok;
    }
    return {
      tabId: tab.id,
      payload: tab.payload || null,
      layoutState: tab.layoutState || null
    };
  });
}

test('scatter 2D lock ratio and frame state survive activation from a forced 3D tab', async ({ page }) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });

  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });
  await page.waitForFunction(() => !!window.Components?.scatter?.ready, null, { timeout: 30_000 });
  await loadScatterExampleForMode(page, '2d');
  const tab2d = await activeScatterTabId(page);
  expect(tab2d).toBeTruthy();
  await setLockRatio(page, false);
  await setShowFrame(page, false);
  expect(await readScatterControls(page)).toMatchObject({
    mode: '2d',
    svgMode: '2d',
    lockChecked: false,
    lockDisabled: false,
    showFrame: false
  });

  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: false });
  await page.waitForFunction(() => !!window.Components?.scatter?.ready, null, { timeout: 30_000 });
  await loadScatterExampleForMode(page, '3d');
  const tab3d = await activeScatterTabId(page);
  expect(tab3d).toBeTruthy();
  expect(tab3d).not.toBe(tab2d);
  const controls3d = await readScatterControls(page);
  expect(controls3d.mode).toBe('3d');
  expect(controls3d.svgMode).toBe('3d');
  expect(controls3d.lockChecked).toBe(true);
  expect(controls3d.lockDisabled).toBe(true);
  expect(controls3d.showFrame).toBe(true);

  await dragScatter3d(page);

  await activateTab(page, tab2d, 'e2e-return-to-2d-scatter-after-3d');
  await waitForScatterSvg(page, '2d');
  const returned = await readScatterControls(page);
  expect(returned.mode).toBe('2d');
  expect(returned.svgMode).toBe('2d');
  expect(returned.lockChecked).toBe(false);
  expect(returned.lockDisabled).toBe(false);
  expect(returned.showFrame).toBe(false);
  expect(returned.aspectLocked).not.toBe('true');

  const captured = await captureActiveScatterTab(page);
  expect(captured.tabId).toBe(tab2d);
  expect(captured.payload?.config?.viewMode).toBe('2d');
  expect(captured.payload?.config?.showFrame).toBe(false);
  expect(captured.layoutState?.graphSizing?.aspectLocked).not.toBe(true);
  expect(JSON.stringify(captured.layoutState || {})).not.toContain('"resizerAspectLocked":"true"');

  await activateTab(page, tab3d, 'e2e-return-to-3d-scatter-final-check');
  const final3d = await readScatterControls(page);
  expect(final3d.mode).toBe('3d');
  expect(final3d.lockChecked).toBe(true);
  expect(final3d.lockDisabled).toBe(true);
  expect(final3d.showFrame).toBe(true);

  expect(issues.critical.filter(entry => entry.kind !== 'requestfailed')).toEqual([]);
});
