const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

async function loadScatterExample(page) {
  await expect(page.locator('#scatterLoadExample')).toBeVisible({ timeout: 20_000 });
  await page.locator('#scatterLoadExample').click();
  await page.waitForFunction(() => {
    const hot = window.Components?.scatter?.__getActiveHot?.();
    const data = hot?.getData?.() || [];
    return Array.isArray(data) && data.length > 500;
  }, null, { timeout: 20_000 });
}

async function waitForScatterIdle(page) {
  await page.waitForFunction(() => {
    const scatter = window.Components?.scatter;
    return typeof scatter?.isIdleForSnapshot !== 'function' || scatter.isIdleForSnapshot();
  }, null, { timeout: 60_000 });
}

async function setRegressionMode(page, value) {
  await page.evaluate((mode) => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(active?.id || null, 'scatter') || document;
    const select = root.querySelector('#scatterRegressionMode');
    if (!select) throw new Error('Scatter regression-mode select not found');
    select.value = mode;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function readTrendPath(page) {
  return page.evaluate(() => {
    const path = document.querySelector('#scatterPage:not([hidden]) #scatterPlot svg path[data-scatter-overlay="trend"]');
    if (!path) return null;
    const commands = Array.from(String(path.getAttribute('d') || '').matchAll(/[ML](-?\d+(?:\.\d+)?(?:e[-+]?\d+)?),(-?\d+(?:\.\d+)?(?:e[-+]?\d+)?)/gi))
      .map(match => ({ x: Number(match[1]), y: Number(match[2]), command: match[0][0].toUpperCase() }));
    if (!commands.length) return null;
    const terminalY = commands[commands.length - 1].y;
    let terminalFlatRun = 0;
    for (let index = commands.length - 1; index >= 0; index -= 1) {
      if (Math.abs(commands[index].y - terminalY) > 1e-6) break;
      terminalFlatRun += 1;
    }
    return {
      commandCount: commands.length,
      segmentCount: commands.filter(command => command.command === 'M').length,
      terminalFlatRun,
      tail: commands.slice(-12)
    };
  });
}

test('scatter exponential trend expands automatic Y range and never clamps into an axis-edge plateau', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });
  await loadScatterExample(page);

  const showLine = page.locator('#scatterShowLine');
  if (await showLine.isChecked()) {
    await showLine.uncheck();
  }
  await setRegressionMode(page, 'exponential');

  await expect(page.locator('#scatterComputeStats')).toBeEnabled({ timeout: 20_000 });
  await page.locator('#scatterComputeStats').click();
  await expect(page.locator('#scatterStatsStatus')).toContainText('Statistics up to date.', { timeout: 35_000 });

  await expect(page.locator('#scatterYMax')).toHaveValue('');
  await showLine.check();
  await expect(page.locator('#scatterPage:not([hidden]) #scatterPlot svg path[data-scatter-overlay="trend"]')).toHaveCount(1, { timeout: 20_000 });
  await waitForScatterIdle(page);

  const automaticPath = await readTrendPath(page);
  expect(automaticPath, 'exponential trend path should be rendered with automatic axes').not.toBeNull();
  expect(automaticPath.commandCount, JSON.stringify(automaticPath)).toBeGreaterThan(100);
  expect(
    automaticPath.terminalFlatRun,
    `automatic Y scaling must not clamp the exponential tail into a flat top edge: ${JSON.stringify(automaticPath.tail)}`
  ).toBe(1);

  // A user-supplied bound is authoritative, but clipping must still be geometric: samples
  // outside the bound are omitted/segmented rather than projected onto the same edge pixel.
  await page.locator('#scatterYMax').fill('200');
  await page.locator('#scatterYMax').dispatchEvent('change');
  await page.waitForFunction((automaticCommandCount) => {
    const path = document.querySelector('#scatterPage:not([hidden]) #scatterPlot svg path[data-scatter-overlay="trend"]');
    const d = String(path?.getAttribute('d') || '');
    const count = (d.match(/[ML]/g) || []).length;
    return count > 1 && count < automaticCommandCount;
  }, automaticPath.commandCount, { timeout: 20_000 });
  await waitForScatterIdle(page);

  const manualPath = await readTrendPath(page);
  expect(manualPath, 'trend path should remain visible with a manual Y maximum').not.toBeNull();
  expect(
    manualPath.terminalFlatRun,
    `manual clipping must not create a false horizontal threshold: ${JSON.stringify(manualPath.tail)}`
  ).toBe(1);

  expect(issues.critical).toEqual([]);
});
