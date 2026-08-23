const { test, expect } = require('@playwright/test');
const {
  COMPONENT_MATRIX,
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

test('Box legend text opens the extended font toolbar', async ({ page }) => {
  test.setTimeout(60_000);
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(
    page,
    COMPONENT_MATRIX.find(entry => entry.type === 'box'),
    { first: true }
  );
  await page.evaluate(() => {
    const format = document.querySelector('#boxTableFormat');
    if (format) {
      format.value = 'grouped';
      format.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await clickExampleButtonIfPresent(page, 'boxLoadExample');
  await page.evaluate(async () => {
    const toggle = document.querySelector('#boxPage:not([hidden]) #boxShowLegend');
    if (toggle) {
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const tabId = window.Main.session.getActiveTab().id;
    await window.Components.box.draw({ reason: 'e2e-legend-font-toolbar', tabId });
  });

  const legendText = page.locator('#boxPage:not([hidden]) #boxSvg [data-legend-viewport-content="true"] text').first();
  await expect(legendText).toBeVisible();
  await legendText.click();

  const panel = page.locator('.font-controls-panel');
  await expect(panel).toHaveAttribute('data-open', '1');
  await expect(panel).toHaveAttribute('data-legend-controls', '1');
  const scope = panel.locator('select.font-controls-panel__select');
  await expect(scope).toHaveValue('legend');
  await expect(scope.locator('option[value="legend"]')).toHaveText('Legend');
  const fontFamily = panel.locator('input[aria-label="Font family"]');
  await fontFamily.fill('Georgia');
  await fontFamily.dispatchEvent('change');
  const legendFonts = await page.locator('#boxSvg [data-legend-viewport-content="true"] text').evaluateAll(nodes => (
    nodes.map(node => node.getAttribute('font-family'))
  ));
  expect(legendFonts.length).toBeGreaterThan(1);
  expect(legendFonts.every(value => value === 'Georgia')).toBe(true);
  const nonLegendFonts = await page.locator('#boxSvg text[data-font-editable="1"]:not([data-font-role="legend"])').evaluateAll(nodes => (
    nodes.map(node => node.getAttribute('font-family'))
  ));
  expect(nonLegendFonts.length).toBeGreaterThan(0);
  expect(nonLegendFonts.some(value => value !== 'Georgia')).toBe(true);
  const widthChip = page.locator('button[aria-label="Legend border color and width"]');
  const widthInput = page.locator('input[aria-label="Legend border width"]');
  await expect(widthChip).toBeVisible();
  await expect(widthInput).toHaveValue('0');
  await expect(page.locator('select[aria-label="Legend border style"]')).toBeVisible();
  await expect(page.locator('input[aria-label="Legend border transparency"]')).toBeVisible();

  await page.evaluate(() => {
    window.Shared.undoManager.clear({ all: false, reason: 'legend-border-e2e-reset' });
    window.__legendBorderCommits = 0;
    document.addEventListener('fontControls:styleChanged', event => {
      if(event.detail?.key === '__legendFrame__'){
        window.__legendBorderCommits += 1;
      }
    });
  });
  for(let index = 0; index < 3; index += 1){
    await widthChip.dispatchEvent('wheel', { deltaY: -100 });
  }
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  const live = await page.evaluate(() => {
    const legend = document.querySelector('#boxPage:not([hidden]) #boxSvg [data-legend-viewport-content="true"]');
    const frames = legend?.querySelectorAll('[data-font-legend-frame="1"]') || [];
    return {
      count: frames.length,
      width: Number(frames[0]?.getAttribute('stroke-width')),
      commits: window.__legendBorderCommits
    };
  });
  expect(live).toEqual({ count: 1, width: 0.75, commits: 0 });
  await expect.poll(() => page.evaluate(() => window.__legendBorderCommits), { timeout: 2_000 }).toBe(1);
  expect(await page.evaluate(() => window.Shared.undoManager.undo())).toBe(true);
  await expect(page.locator('#boxSvg [data-font-legend-frame="1"]')).toHaveCount(0);
});

test('Surface scale opens typography controls without categorical legend fields', async ({ page }) => {
  test.setTimeout(60_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(
    page,
    COMPONENT_MATRIX.find(entry => entry.type === 'surface'),
    { first: true }
  );
  await clickExampleButtonIfPresent(page, 'surfaceLoadExample');

  const scaleTick = page.locator('#surfacePage:not([hidden]) #surfaceSvg g.surface-legend text[data-font-role="scaleTick"]').first();
  await expect(scaleTick).toBeVisible();
  await scaleTick.click();

  const panel = page.locator('.font-controls-panel[data-open="1"]');
  await expect(panel.locator('.font-controls-panel__field--scope select')).toHaveValue('scale');
  await expect(panel).not.toHaveAttribute('data-legend-controls', '1');
  await expect(page.locator('input[aria-label="Legend border width"]')).toBeHidden();
  await expect(page.locator('select[aria-label="Legend border style"]')).toBeHidden();
  await expect(page.locator('input[aria-label="Legend border transparency"]')).toBeHidden();
});
