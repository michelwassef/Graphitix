const { test, expect } = require('@playwright/test');
const { applyEnlargedUiText } = require('../helpers/enlargedUiText');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { COMPONENT_CATALOG } = require('../../test-support/componentCatalog');

async function readScaledLayout(page){
  return page.evaluate(() => {
    const activePage = document.querySelector('.workspace-page:not([hidden])')
      || document.querySelector('#welcomeScreen:not([hidden])');
    const diagramArea = activePage?.querySelector('.diagram-area');
    const plotStack = diagramArea?.querySelector(':scope > .graph-plot-stack');
    const configPanel = diagramArea?.querySelector(':scope > .config-panel');
    const plotBounds = plotStack?.getBoundingClientRect();
    const configBounds = configPanel?.getBoundingClientRect();
    const actions = Array.from(document.querySelectorAll(
      'button, input, select, textarea, [role="button"], [role="tab"], [role="checkbox"], [role="switch"]'
    )).filter(element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden'
        && !element.closest('[hidden]') && rect.width > 0 && rect.height > 0;
    });
    const hasScrollOwner = (element, axis) => {
      for(let parent = element.parentElement; parent; parent = parent.parentElement){
        const style = getComputedStyle(parent);
        const overflow = axis === 'x' ? style.overflowX : style.overflowY;
        const scrollSize = axis === 'x' ? parent.scrollWidth : parent.scrollHeight;
        const clientSize = axis === 'x' ? parent.clientWidth : parent.clientHeight;
        if(['auto', 'scroll'].includes(overflow) && scrollSize > clientSize){
          return true;
        }
        if(parent === document.body || parent === document.documentElement){
          return axis === 'y' && document.documentElement.scrollHeight > innerHeight;
        }
      }
      return false;
    };
    const clippedActions = actions.filter(element => {
      const rect = element.getBoundingClientRect();
      return (!hasScrollOwner(element, 'x') && (rect.left < -1 || rect.right > innerWidth + 1))
        || (!hasScrollOwner(element, 'y') && (rect.top < -1 || rect.bottom > innerHeight + 1));
    }).map(element => ({
      tag: element.tagName.toLowerCase(),
      label: element.getAttribute('aria-label') || element.textContent?.trim() || element.id || '',
      left: Math.round(element.getBoundingClientRect().left),
      right: Math.round(element.getBoundingClientRect().right),
      top: Math.round(element.getBoundingClientRect().top),
      bottom: Math.round(element.getBoundingClientRect().bottom)
    }));

    return {
      activePage: activePage?.id || null,
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      visibleActions: actions.length,
      clippedActions,
      graphControlsSideBySide: Boolean(plotBounds && configBounds
        && configBounds.left >= plotBounds.right - 1),
      plotRight: plotBounds ? Math.round(plotBounds.right) : null,
      configLeft: configBounds ? Math.round(configBounds.left) : null
    };
  });
}

test('Welcome and all component workspaces remain reachable with 200% UI text', async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  const failures = [];
  const evidence = [];
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#welcomeScreen')?.dataset?.welcomeReady === 'true');

  const welcomeScale = await applyEnlargedUiText(page);
  expect(welcomeScale.activePageTargetCount, 'Welcome UI text targets were scaled').toBeGreaterThan(0);
  expect(welcomeScale.unscaledActivePageTargets).toBe(0);
  let layout = await readScaledLayout(page);
  evidence.push({ screen: 'welcome', layout });
  if(layout.activePage !== 'welcomeScreen'
    || layout.documentWidth > layout.viewportWidth
    || layout.bodyWidth > layout.viewportWidth
    || layout.clippedActions.length){
    failures.push({ screen: 'welcome', layout });
  }

  await page.locator('#welcomeViewAllExamples').click();
  const gallery = page.getByRole('dialog', { name: 'Explore Graphitix examples' });
  await expect(gallery).toBeVisible();
  await applyEnlargedUiText(page);
  const galleryBounds = await gallery.locator('.welcome-dialog__panel').evaluate(panel => {
    const rect = panel.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight };
  });
  if(galleryBounds.left < 0 || galleryBounds.top < 0
    || galleryBounds.right > galleryBounds.width || galleryBounds.bottom > galleryBounds.height){
    failures.push({ screen: 'welcome-gallery', bounds: galleryBounds });
  }
  await page.keyboard.press('Escape');
  await expect(gallery).toBeHidden();

  for(let index = 0; index < COMPONENT_CATALOG.length; index += 1){
    const component = COMPONENT_CATALOG[index];
    await openComponentFromWelcome(page, component, { first: index === 0, loadExample: true });
    await waitForComponentOwnerReady(page, component.type, {
      requireMountedRoot: true,
      requirePublished: true,
      requireIdle: true,
      timeout: 30_000
    });
    if(component.type === 'venn'){
      const disclosure = page.locator('#vennInputPanel > details');
      if(!await disclosure.evaluate(element => element.open)){
        await disclosure.locator('summary').click();
      }
      await expect(disclosure).toHaveJSProperty('open', true);
    }
    const scaled = await applyEnlargedUiText(page);
    layout = await readScaledLayout(page);
    evidence.push({ screen: component.type, pageId: component.pageId, scaled, layout });
    if(component.type === 'venn'){
      await testInfo.attach('venn-200-percent-ui-text.png', {
        body: await page.screenshot({ fullPage: false }),
        contentType: 'image/png'
      });
    }
    if(scaled.activePageTargetCount === 0 || scaled.unscaledActivePageTargets > 0
      || layout.activePage !== component.pageId
      || layout.documentWidth > layout.viewportWidth
      || layout.bodyWidth > layout.viewportWidth
      || layout.visibleActions === 0 || layout.clippedActions.length
      || layout.graphControlsSideBySide !== true){
      failures.push({
        screen: component.type,
        pageId: component.pageId,
        scaled,
        viewportWidth: layout.viewportWidth,
        documentWidth: layout.documentWidth,
        bodyWidth: layout.bodyWidth,
        visibleActions: layout.visibleActions,
        graphControlsSideBySide: layout.graphControlsSideBySide,
        plotRight: layout.plotRight,
        configLeft: layout.configLeft,
        clippedCount: layout.clippedActions.length,
        clippedActions: layout.clippedActions.slice(0, 6)
      });
    }
  }
  await testInfo.attach('200-percent-ui-text-layout.json', {
    body: Buffer.from(JSON.stringify({ evidence, failures }, null, 2), 'utf8'),
    contentType: 'application/json'
  });
  expect(failures).toEqual([]);
});
