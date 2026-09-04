const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

async function waitForRocLayout(page, showLegend) {
  await page.waitForFunction((expectedLegend) => {
    const root = document.querySelector('#rocPage:not([hidden])');
    const svg = root?.querySelector('#rocSvg');
    const control = root?.querySelector('#rocShowLegend');
    const activeTabId = window.Main?.session?.workspaceState?.activeTabId || null;
    const publication = window.Shared?.componentLifecycle?.isPublicationSettled?.(window.Components?.roc, {
      componentKey: 'roc',
      tabId: activeTabId
    });
    const hasCurve = Array.from(svg?.querySelectorAll('path[data-series][d]') || [])
      .some(path => String(path.getAttribute('d') || '').trim().length > 0);
    const legendCount = svg?.querySelectorAll('[data-legend-key]').length || 0;
    const yTitle = svg?.querySelector('[data-font-role="yTitle"]') || null;
    const axis = Array.from(svg?.querySelectorAll('line[data-axis-control="1"]') || [])
      .find(line => Number(line.getAttribute('x2')) > Number(line.getAttribute('x1')));
    const viewBox = String(svg?.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    const baseWidth = Number(svg?.dataset?.graphContentBaseWidth);
    const svgRect = svg?.getBoundingClientRect?.();
    const axisRect = axis?.getBoundingClientRect?.();
    const yTitleRect = yTitle?.getBoundingClientRect?.();
    const axisOffset = axisRect && svgRect ? axisRect.left - svgRect.left : NaN;
    const yTitleOffset = yTitleRect && svgRect ? yTitleRect.left - svgRect.left : NaN;
    const yTitleRightOffset = yTitleRect && svgRect ? yTitleRect.right - svgRect.left : NaN;
    const leftReserve = Number(svg?.dataset?.graphContentReserveLeft);
    return publication?.staged !== true
      && control?.checked === expectedLegend
      && hasCurve
      && (expectedLegend ? legendCount > 0 : legendCount === 0)
      && viewBox.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0
      && Number.isFinite(baseWidth) && baseWidth > 0
      && Number.isFinite(Number(axis?.getAttribute('x1')))
      && Number(axis.getAttribute('x1')) > 0
      && Number(axis.getAttribute('x1')) < baseWidth * 0.25
      && Number.isFinite(axisOffset) && Number.isFinite(svgRect?.width)
      && axisOffset >= 0 && axisOffset < svgRect.width * 0.25
      && Number.isFinite(leftReserve) && leftReserve > 0
      && Number.isFinite(yTitleOffset) && yTitleOffset >= 0
      && Number.isFinite(yTitleRightOffset) && yTitleRightOffset < axisOffset - 4;
  }, showLegend, { timeout: 45_000 });
}

async function expectRocLayoutStable(page) {
  const readLayout = () => page.evaluate(() => {
    const svg = document.querySelector('#rocPage:not([hidden]) #rocSvg');
    const yTitle = svg?.querySelector('[data-font-role="yTitle"]');
    return {
      viewBox: svg?.getAttribute('viewBox') || '',
      width: svg?.getAttribute('width') || '',
      leftReserve: svg?.dataset?.graphContentReserveLeft || '',
      yTitleX: yTitle?.getAttribute('x') || ''
    };
  });
  const settled = await readLayout();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await readLayout()).toEqual(settled);
}

test('ROC publishes final layout and legend visibility from the changed checkbox value', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await openComponentFromWelcome(page, { type: 'roc', pageId: 'rocPage' }, { first: true });
  await clickExampleButtonIfPresent(page, 'rocLoadExample');
  await waitForRocLayout(page, true);
  await expectRocLayoutStable(page);

  await page.locator('#rocPage:not([hidden]) .resizer-options-summary').click();
  const legendControl = page.locator('#rocPage:not([hidden]) #rocShowLegend');
  await expect(legendControl).toBeVisible();
  await legendControl.uncheck();
  await waitForRocLayout(page, false);
  await expectRocLayoutStable(page);

  await legendControl.check();
  await waitForRocLayout(page, true);
  await expectRocLayoutStable(page);
});
