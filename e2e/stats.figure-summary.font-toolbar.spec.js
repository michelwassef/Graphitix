const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('./helpers/vendorOverrides');
const { openComponentFromWelcome, clickExampleButtonIfPresent } = require('./helpers/workspaceDriver');

test('statistical summary text opens and edits the shared font toolbar', async ({ page }) => {
  test.setTimeout(90_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil:'domcontentloaded' });
  await openComponentFromWelcome(page, { type:'hist', pageId:'histPage' }, { first:true });
  await clickExampleButtonIfPresent(page, 'histLoadExample');
  await page.evaluate(() => window.Components?.hist?.draw?.());

  const summaryToggle = page.locator('#histPage:not([hidden]) .stats-figure-summary-checkbox').last();
  await expect(summaryToggle).toBeVisible({ timeout:30_000 });
  await summaryToggle.check();
  const summary = page.locator('#histPlot svg g[data-stats-figure-summary="1"]');
  await expect(summary).toHaveCount(1, { timeout:30_000 });

  await summary.locator('text[data-stats-summary-role="title"]').click();
  const panel = page.locator('.font-controls-panel[data-open="1"]');
  await expect(panel).toHaveCount(1);
  await expect(panel.locator('.font-controls-panel__field--scope select')).toHaveValue('collection');

  const beforeColor = await page.evaluate(() => {
    const group = document.querySelector('#histPlot svg g[data-stats-figure-summary="1"]');
    return {
      reserve:Number(group?.closest('svg')?.dataset?.statsFigureSummaryReserveBottom || 0),
      lines:[...group.querySelectorAll('text')].map(node => node.querySelectorAll('tspan').length)
    };
  });
  const color = panel.locator('input[aria-label="Font color"]');
  await color.evaluate(input => {
    input.value = '#123456';
    input.dispatchEvent(new Event('input', { bubbles:true }));
    input.dispatchEvent(new Event('change', { bubbles:true }));
  });
  await expect.poll(() => page.evaluate(() => {
    const nodes = [...document.querySelectorAll('#histPlot svg g[data-stats-figure-summary="1"] text')];
    return [...new Set(nodes.map(node => node.getAttribute('fill')))];
  }), { timeout:20_000 }).toEqual(['#123456']);
  const afterColor = await page.evaluate(() => {
    const group = document.querySelector('#histPlot svg g[data-stats-figure-summary="1"]');
    return {
      reserve:Number(group?.closest('svg')?.dataset?.statsFigureSummaryReserveBottom || 0),
      lines:[...group.querySelectorAll('text')].map(node => node.querySelectorAll('tspan').length),
      wrappedValues:[...group.querySelectorAll('text[data-stats-summary-role="value"]')]
        .filter(node => node.querySelectorAll('tspan').length > 1).length,
      overflowingValues:[...group.querySelectorAll('text[data-stats-summary-role="value"]')]
        .filter(node => [...node.querySelectorAll('tspan')].some(part => {
          const x = Number(part.getAttribute('x'));
          return Number.isFinite(x) && x > 400;
        })).length
    };
  });
  expect(afterColor.lines).toEqual(beforeColor.lines);
  expect(afterColor.wrappedValues).toBeGreaterThan(0);
  expect(afterColor.overflowingValues).toBe(0);
  expect(afterColor.reserve).toBeCloseTo(beforeColor.reserve, 1);

  const fontFamily = panel.locator('input[aria-label="Font family"]');
  await fontFamily.fill('Courier New');
  await fontFamily.dispatchEvent('change');

  const fontSize = panel.locator('input[aria-label="Font size"]');
  await fontSize.fill('14');
  await fontSize.dispatchEvent('change');

  await expect.poll(() => page.evaluate(() => {
    const nodes = [...document.querySelectorAll('#histPlot svg g[data-stats-figure-summary="1"] text')];
    return {
      count:nodes.length,
      families:[...new Set(nodes.map(node => node.getAttribute('font-family')))],
      colors:[...new Set(nodes.map(node => node.getAttribute('fill')))],
      sizes:[...new Set(nodes.map(node => node.getAttribute('font-size')))]
    };
  }), { timeout:20_000 }).toMatchObject({
    count:expect.any(Number),
    families:['Courier New'],
    colors:['#123456']
  });

  const state = await page.evaluate(() => {
    const active = window.Main?.session?.getActiveTab?.();
    const styles = window.Shared?.fontControls?.exportScopeStyles?.('hist', { tabId:active?.id });
    return styles?.['__collection__:stats-summary'] || null;
  });
  expect(state?.fontFamily).toBe('Courier New');
  expect(state?.fill).toBe('#123456');
  expect(state?.fontSize).toBeTruthy();
});
