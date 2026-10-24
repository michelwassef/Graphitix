const { test, expect } = require('@playwright/test');
const { launchChromiumAtBrowserZoom } = require('../helpers/actualBrowserZoom');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { registerIssueCollectors } = require('../helpers/diagnostics');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { COMPONENT_CATALOG } = require('../../test-support/componentCatalog');

async function readZoomLayout(page, pageId) {
  return page.evaluate(targetPageId => {
    const root = document.getElementById(targetPageId);
    const activePage = document.querySelector('.workspace-page:not([hidden])');
    const actions = Array.from(root?.querySelectorAll(
      'button, input, select, textarea, [role="button"], [role="tab"], [role="checkbox"], [role="switch"]'
    ) || []).filter(element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });
    const clippedActions = actions.filter(element => {
      const rect = element.getBoundingClientRect();
      const hasHorizontalScrollOwner = Array.from((function* ancestors(){
        for(let node = element.parentElement; node && node !== root; node = node.parentElement) yield node;
      })()).some(parent => {
        const style = getComputedStyle(parent);
        return ['auto', 'scroll'].includes(style.overflowX) && parent.scrollWidth > parent.clientWidth;
      });
      return !hasHorizontalScrollOwner && (rect.left < -1 || rect.right > innerWidth + 1);
    }).map(element => ({
      tag: element.tagName.toLowerCase(),
      id: element.id || '',
      className: typeof element.className === 'string' ? element.className : '',
      left: Math.round(element.getBoundingClientRect().left),
      right: Math.round(element.getBoundingClientRect().right)
    }));
    return {
      activePage: activePage?.id || null,
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      visibleActions: actions.length,
      clippedActions
    };
  }, pageId);
}

test('all component workspaces remain reachable at actual 200% Chromium browser zoom', async ({ browserName, baseURL }) => {
  test.skip(browserName !== 'chromium', '[skip-policy issue=ROADMAP-FIREFOX-PARITY owner=test-infrastructure expires=2026-12-31 gate=firefox-zoom-enabled] Actual tab zoom uses Chromium tabs.setZoom.');
  test.setTimeout(300_000);
  const { page, setZoom, close } = await launchChromiumAtBrowserZoom({ width: 1280, height: 900 });
  try {
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await page.goto(`${baseURL}/index.html`, { waitUntil: 'domcontentloaded' });
    await setZoom(2);
    await page.waitForFunction(() => document.querySelector('#welcomeScreen')?.dataset?.welcomeReady === 'true');

    const zoomMetrics = await page.evaluate(() => ({
      devicePixelRatio,
      innerWidth,
      innerHeight,
      visualViewportWidth: visualViewport.width
    }));
    expect(zoomMetrics.devicePixelRatio).toBeGreaterThanOrEqual(1.9);
    expect(zoomMetrics.innerWidth).toBeLessThanOrEqual(642);
    expect(zoomMetrics.innerHeight).toBeLessThanOrEqual(452);

    await page.locator('#welcomeViewAllExamples').click();
    const gallery = page.getByRole('dialog', { name: 'Explore Graphitix examples' });
    await expect(gallery).toBeVisible();
    const galleryBounds = await gallery.locator('.welcome-dialog__panel').evaluate(panel => {
      const rect = panel.getBoundingClientRect();
      return { left: rect.left, right: rect.right, viewportWidth: innerWidth };
    });
    expect(galleryBounds.left).toBeGreaterThanOrEqual(0);
    expect(galleryBounds.right).toBeLessThanOrEqual(galleryBounds.viewportWidth);
    await page.keyboard.press('Escape');
    await expect(gallery).toBeHidden();

    for (let index = 0; index < COMPONENT_CATALOG.length; index += 1) {
      const component = COMPONENT_CATALOG[index];
      await openComponentFromWelcome(page, component, {
        first: index === 0,
        loadExample: true
      });
      await waitForComponentOwnerReady(page, component.type, {
        requireMountedRoot: true,
        requirePublished: true,
        requireIdle: true,
        timeout: 30_000
      });
      const layout = await readZoomLayout(page, component.pageId);
      expect(layout.activePage, `${component.type} active workspace at 200%`).toBe(component.pageId);
      expect(layout.documentWidth, `${component.type} document overflow at 200%`).toBeLessThanOrEqual(layout.viewportWidth);
      expect(layout.bodyWidth, `${component.type} body overflow at 200%`).toBeLessThanOrEqual(layout.viewportWidth);
      expect(layout.visibleActions, `${component.type} visible controls at 200%`).toBeGreaterThan(0);
      expect(layout.clippedActions, `${component.type} horizontally clipped controls at 200%`).toEqual([]);
    }
    expect(issues.critical).toEqual([]);
  } finally {
    await close();
  }
});
