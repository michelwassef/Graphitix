const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

async function installBoxPerfProbe(page) {
  await page.evaluate(() => {
    const Shared = window.Shared || {};
    const Components = window.Components || {};
    const probe = {
      statsComputes: 0,
      drawCalls: 0,
      drawDurations: [],
      drawReasons: [],
      statsPanelCaptures: 0
    };
    const workers = Shared.Workers || null;
    if (workers && typeof workers.runTask === 'function' && !workers.__boxPerfProbeRunTask) {
      workers.__boxPerfProbeRunTask = workers.runTask;
      workers.runTask = function patchedRunTask(task) {
        if (task && (task.name === 'box-stats' || task.action === 'box-stats')) {
          probe.statsComputes += 1;
        }
        return workers.__boxPerfProbeRunTask.apply(this, arguments);
      };
    }
    const model = Shared.boxStatsModel || null;
    if (model && typeof model.computeBoxStatsModel === 'function' && !model.__boxPerfProbeCompute) {
      model.__boxPerfProbeCompute = model.computeBoxStatsModel;
      model.computeBoxStatsModel = function patchedComputeBoxStatsModel(payload) {
        probe.statsComputes += 1;
        return model.__boxPerfProbeCompute.apply(this, arguments);
      };
    }

    const reporting = Shared.statsReporting || null;
    if (reporting && typeof reporting.capturePanelModel === 'function' && !reporting.__boxPerfProbeCapturePanelModel) {
      reporting.__boxPerfProbeCapturePanelModel = reporting.capturePanelModel;
      reporting.capturePanelModel = function patchedCapturePanelModel(target) {
        const ownerPage = target?.closest?.('[data-component], .component-page, [id$="Page"]') || null;
        const isBoxTarget = target?.id === 'statsResults'
          || target?.dataset?.component === 'box'
          || ownerPage?.id === 'boxPage'
          || ownerPage?.dataset?.component === 'box';
        if (isBoxTarget) {
          probe.statsPanelCaptures += 1;
        }
        return reporting.__boxPerfProbeCapturePanelModel.apply(this, arguments);
      };
    }
    const box = Components.box || null;
    if (box && typeof box.draw === 'function' && !box.__boxPerfProbeDraw) {
      box.__boxPerfProbeDraw = box.draw;
      box.draw = function patchedBoxDraw(options) {
        const start = performance.now();
        const reason = options && typeof options.reason === 'string' ? options.reason : '';
        probe.drawCalls += 1;
        probe.drawReasons.push(reason);
        const result = box.__boxPerfProbeDraw.apply(this, arguments);
        return Promise.resolve(result).finally(() => {
          probe.drawDurations.push(performance.now() - start);
        });
      };
    }
    window.__boxStatsPerfProbe = probe;
  });
}

async function resetBoxPerfProbe(page) {
  await page.evaluate(() => {
    if (window.__boxStatsPerfProbe) {
      window.__boxStatsPerfProbe.statsComputes = 0;
      window.__boxStatsPerfProbe.drawCalls = 0;
      window.__boxStatsPerfProbe.drawDurations = [];
      window.__boxStatsPerfProbe.drawReasons = [];
      window.__boxStatsPerfProbe.statsPanelCaptures = 0;
    }
  });
}

async function readBoxPerfProbe(page) {
  return page.evaluate(() => {
    const probe = window.__boxStatsPerfProbe || {};
    const durations = Array.isArray(probe.drawDurations) ? probe.drawDurations.slice() : [];
    const maxDrawMs = durations.reduce((max, value) => Math.max(max, Number(value) || 0), 0);
    const totalDrawMs = durations.reduce((sum, value) => sum + (Number(value) || 0), 0);
    return {
      statsComputes: Number(probe.statsComputes) || 0,
      drawCalls: Number(probe.drawCalls) || 0,
      maxDrawMs,
      totalDrawMs,
      drawReasons: Array.isArray(probe.drawReasons) ? probe.drawReasons.slice() : [],
      statsPanelCaptures: Number(probe.statsPanelCaptures) || 0
    };
  });
}

async function getActiveTabId(page) {
  return page.evaluate(() => {
    const state = window.Main?.session?.workspaceState;
    return String(state?.activeTabId || '');
  });
}

async function activateTab(page, tabId) {
  const tab = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).first();
  await expect(tab).toBeVisible({ timeout: 20_000 });
  const startedAt = Date.now();
  await tab.click({ force: true });
  await page.waitForFunction(id => {
    const state = window.Main?.session?.workspaceState;
    return String(state?.activeTabId || '') === String(id || '');
  }, tabId, { timeout: 20_000 });
  await page.waitForTimeout(300);
  return Date.now() - startedAt;
}

async function dragBoxGraphWidth(page) {
  const handle = page.locator('#boxPage:not([hidden]) .svgbox .resizer-vertical').first();
  await expect(handle).toBeVisible({ timeout: 20_000 });
  const box = await handle.boundingBox();
  expect(box).toBeTruthy();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let step = 1; step <= 6; step += 1) {
    await page.mouse.move(x - step * 12, y, { steps: 1 });
    await page.waitForTimeout(40);
  }
  await page.mouse.up();
  await page.waitForTimeout(500);
}

test('box stats do not recompute or make resize and tab return sluggish', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  await openComponentFromWelcome(
    page,
    { type: 'box', pageId: 'boxPage', exampleButtonId: 'boxLoadExample' },
    { first: true, loadExample: true }
  );
  const boxTabId = await getActiveTabId(page);
  await expect(page.locator('#boxComputeStats')).toBeEnabled({ timeout: 20_000 });

  await installBoxPerfProbe(page);
  await page.locator('#boxComputeStats').click();
  await expect(page.locator('#boxStatsStatus')).toContainText('Statistics up to date.', { timeout: 35_000 });
  await resetBoxPerfProbe(page);

  await dragBoxGraphWidth(page);
  const resizeProbe = await readBoxPerfProbe(page);
  expect(resizeProbe.statsComputes).toBe(0);
  expect(resizeProbe.statsPanelCaptures).toBe(0);
  expect(resizeProbe.maxDrawMs).toBeLessThan(250);

  await openComponentFromWelcome(
    page,
    { type: 'scatter', pageId: 'scatterPage', exampleButtonId: 'scatterLoadExample' },
    { first: false, loadExample: true }
  );
  await resetBoxPerfProbe(page);
  const returnActivationMs = await activateTab(page, boxTabId);
  await page.waitForFunction(() => {
    const state = window.Components?.box?.__getState?.();
    return !!state && !state.statsComputationPending;
  }, null, { timeout: 20_000 });

  const returnProbe = await readBoxPerfProbe(page);
  const returnedStatsState = await page.evaluate(() => {
    const state = window.Components?.box?.__getState?.();
    return {
      lastRunVersion: Number(state?.statsLastRunVersion) || 0,
      contextVersion: Number(state?.statsContextVersion) || 0,
      selectedCols: Array.from(state?.selectedCols || []),
      status: document.querySelector('#boxStatsStatus')?.textContent || ''
    };
  });
  expect(returnProbe.statsComputes).toBe(0);
  expect(returnProbe.statsPanelCaptures).toBe(0);
  expect(returnProbe.maxDrawMs).toBeLessThan(250);
  expect(returnActivationMs).toBeLessThan(2_000);
  expect(returnedStatsState.lastRunVersion).toBeGreaterThan(0);
  expect(returnedStatsState.lastRunVersion).toBe(returnedStatsState.contextVersion);
  expect(returnedStatsState.selectedCols).toEqual([0, 1, 2]);
  expect(returnedStatsState.status).toContain('Statistics up to date.');
});

test('two computed Box tabs alternate without cloning or recapturing statistics output', async ({ page }) => {
  test.setTimeout(150_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  await openComponentFromWelcome(
    page,
    { type: 'box', pageId: 'boxPage', exampleButtonId: 'boxLoadExample' },
    { first: true, loadExample: true }
  );
  const firstBoxTabId = await getActiveTabId(page);
  await installBoxPerfProbe(page);
  await page.locator('#boxComputeStats').click();
  await expect(page.locator('#boxStatsStatus')).toContainText('Statistics up to date.', { timeout: 35_000 });

  await openComponentFromWelcome(
    page,
    { type: 'box', pageId: 'boxPage', exampleButtonId: 'boxLoadExample' },
    { first: false, loadExample: true }
  );
  const secondBoxTabId = await getActiveTabId(page);
  expect(secondBoxTabId).not.toBe(firstBoxTabId);
  await page.locator('#boxComputeStats').click();
  await expect(page.locator('#boxStatsStatus')).toContainText('Statistics up to date.', { timeout: 35_000 });

  await resetBoxPerfProbe(page);
  const activationDurations = [];
  for (const tabId of [firstBoxTabId, secondBoxTabId, firstBoxTabId, secondBoxTabId]) {
    activationDurations.push(await activateTab(page, tabId));
    await expect(page.locator('#boxStatsStatus')).toContainText('Statistics up to date.', { timeout: 10_000 });
  }

  const probe = await readBoxPerfProbe(page);
  expect(probe.statsComputes).toBe(0);
  expect(probe.statsPanelCaptures).toBe(0);
  expect(probe.maxDrawMs).toBeLessThan(250);
  expect(Math.max(...activationDurations)).toBeLessThan(2_000);
});

