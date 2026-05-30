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
    return Array.isArray(data) && data.length > 2;
  }, null, { timeout: 20_000 });
}

async function waitForInitialDraw(page) {
  await page.waitForFunction(() => {
    const entries = Array.isArray(window.Shared?.Performance?._entries)
      ? window.Shared.Performance._entries
      : [];
    return entries.some(e => String(e?.label || '') === 'scatter.draw');
  }, null, { timeout: 30_000 });
}

function getDrawCount(page) {
  return page.evaluate(() => {
    const entries = Array.isArray(window.Shared?.Performance?._entries)
      ? window.Shared.Performance._entries
      : [];
    return entries.filter(e => String(e?.label || '') === 'scatter.draw').length;
  });
}

async function waitForNewDraw(page, baseline, timeout = 10_000) {
  await page.waitForFunction(
    baseline => {
      const entries = Array.isArray(window.Shared?.Performance?._entries)
        ? window.Shared.Performance._entries
        : [];
      return entries.filter(e => String(e?.label || '') === 'scatter.draw').length > baseline;
    },
    baseline,
    { timeout }
  );
}

async function dragScatterResize(page, deltaY = 90) {
  const handle = page.locator('#scatterPage:not([hidden]) .svgbox .resizer-horizontal').first();
  await expect(handle).toHaveCount(1);
  const box = await handle.boundingBox();
  if (!box) throw new Error('Scatter resize handle has no bounding box');
  const x = box.x + box.width / 2;
  const y = box.y + Math.max(2, Math.min(box.height - 2, box.height / 2));
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + deltaY, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);
}

function getSvgIntrinsicHeight(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('#scatterPage:not([hidden]) .svgbox svg');
    if (!svg) return 0;
    const attr = svg.getAttribute('height');
    if (attr) {
      const n = parseFloat(attr);
      if (Number.isFinite(n) && n > 0) return n;
    }
    const vb = svg.viewBox?.baseVal;
    if (vb && vb.height > 0) return vb.height;
    return svg.getBoundingClientRect().height;
  });
}

test('scatter live-update works after stats computation: trendline toggle and resize both trigger a redraw', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });

  await loadScatterExample(page);
  await waitForInitialDraw(page);

  // Ensure trendline is OFF before computing stats (matches user's reported sequence)
  const showLineEl = page.locator('#scatterShowLine');
  await expect(showLineEl).toBeVisible({ timeout: 10_000 });
  if (await showLineEl.isChecked()) {
    await showLineEl.uncheck();
    await page.waitForTimeout(300);
  }

  // Compute statistics
  await expect(page.locator('#scatterComputeStats')).toBeEnabled({ timeout: 20_000 });
  await page.locator('#scatterComputeStats').click();
  await expect(page.locator('#scatterStatsStatus')).toContainText('Statistics up to date.', { timeout: 35_000 });

  // ── Trendline toggle ──────────────────────────────────────────────────────
  // After stats computation the live-update mechanism must still work.
  // Checking "Show trend line" must produce a new draw that includes the
  // regression path in the SVG.
  const drawsBeforeTrendline = await getDrawCount(page);

  await expect(showLineEl).toBeEnabled({ timeout: 5_000 });
  await showLineEl.check();

  // A draw must be scheduled and completed within 10 s.
  await waitForNewDraw(page, drawsBeforeTrendline, 10_000);

  const hasTrendPath = await page.evaluate(
    () => !!document.querySelector('#scatterPage:not([hidden]) #scatterPlot svg path[data-scatter-overlay="trend"]')
  );
  expect(hasTrendPath, 'SVG must contain a regression path after Show Trend Line is enabled').toBe(true);

  // ── Resize ───────────────────────────────────────────────────────────────
  // Dragging the resize handle must trigger a new draw that updates the SVG
  // intrinsic dimensions to match the new container size, not just CSS-scale it.
  const heightBefore = await getSvgIntrinsicHeight(page);
  expect(heightBefore, 'SVG must have a positive height before resize').toBeGreaterThan(0);

  const drawsBeforeResize = await getDrawCount(page);
  await dragScatterResize(page, 90);

  // A draw must be scheduled and completed within 10 s.
  await waitForNewDraw(page, drawsBeforeResize, 10_000);

  const heightAfter = await getSvgIntrinsicHeight(page);
  expect(
    heightAfter,
    `SVG intrinsic height must increase after resize (was ${heightBefore})`
  ).toBeGreaterThan(heightBefore + 40);

  expect(issues.critical).toEqual([]);
});
