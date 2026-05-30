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

function getGridColumnCount(page) {
  // Widest data row reflects the true column count, including any auto-grown trailing columns.
  return page.evaluate(() => {
    const hot = window.Components?.scatter?.__getActiveHot?.();
    const data = hot?.getData?.() || [];
    return data.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
  });
}

function getSvgIntrinsicHeight(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('#scatterPage:not([hidden]) .svgbox svg');
    if (!svg) return 0;
    // The scatter SVG sizes itself via the viewBox while the height attribute stays "100%".
    // Prefer the viewBox height (the true intrinsic size) and only trust the height attribute
    // when it is an absolute pixel value, otherwise parseFloat("100%") falsely reports 100.
    const vb = svg.viewBox?.baseVal;
    if (vb && vb.height > 0) return vb.height;
    const attr = svg.getAttribute('height');
    if (attr && !/%\s*$/.test(attr)) {
      const n = parseFloat(attr);
      if (Number.isFinite(n) && n > 0) return n;
    }
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

  // ── Compute statistics ─────────────────────────────────────────────────────
  // With the trend line OFF, computing statistics is a non-visual operation: it
  // must NOT redraw the graph and must NOT mutate the raw data grid (no spurious
  // columns appended). Capture the baselines first.
  const drawsBeforeStats = await getDrawCount(page);
  const colsBeforeStats = await getGridColumnCount(page);

  await expect(page.locator('#scatterComputeStats')).toBeEnabled({ timeout: 20_000 });
  await page.locator('#scatterComputeStats').click();
  await expect(page.locator('#scatterStatsStatus')).toContainText('Statistics up to date.', { timeout: 35_000 });
  // Give any erroneous async draws/grid mutations a chance to manifest before asserting.
  await page.waitForTimeout(800);

  const drawsAfterStats = await getDrawCount(page);
  expect(
    drawsAfterStats - drawsBeforeStats,
    'Computing statistics with the trend line OFF must not redraw the scatter graph'
  ).toBe(0);
  const colsAfterStats = await getGridColumnCount(page);
  expect(
    colsAfterStats,
    `Computing statistics must not append columns to the raw grid (was ${colsBeforeStats})`
  ).toBe(colsBeforeStats);

  // ── Trendline toggle ──────────────────────────────────────────────────────
  // After stats computation the live-update mechanism must still work.
  // Checking "Show trend line" must produce EXACTLY ONE new draw that includes
  // the regression path — and must not append columns to the raw grid.
  const drawsBeforeTrendline = await getDrawCount(page);

  await expect(showLineEl).toBeEnabled({ timeout: 5_000 });
  await showLineEl.check();

  // A draw must be scheduled and completed within 10 s.
  await waitForNewDraw(page, drawsBeforeTrendline, 10_000);
  // Allow any extra (erroneous) draws to land before counting.
  await page.waitForTimeout(800);

  const drawsAfterTrendline = await getDrawCount(page);
  expect(
    drawsAfterTrendline - drawsBeforeTrendline,
    'Enabling the trend line must trigger exactly one redraw, not several'
  ).toBe(1);
  const colsAfterTrendline = await getGridColumnCount(page);
  expect(
    colsAfterTrendline,
    `Enabling the trend line must not append columns to the raw grid (was ${colsBeforeStats})`
  ).toBe(colsBeforeStats);

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
