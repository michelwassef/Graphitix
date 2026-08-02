const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

const LINE_TOOLBAR = '#linePage:not([hidden]) .workspace-toolbar';

async function openLineExample(page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'line', pageId: 'linePage' }, { first: true });
  await clickExampleButtonIfPresent(page, 'lineLoadExample');
  await page.waitForFunction(() => document.querySelectorAll('#linePlot path[data-series]').length > 0);
}

async function constrainLineToolbar(page, width = 400) {
  await page.addStyleTag({
    content: `${LINE_TOOLBAR}{width:${width}px!important;max-width:${width}px!important}`
  });
  await page.evaluate(() => {
    const toolbar = document.querySelector('#linePage:not([hidden]) .workspace-toolbar');
    window.Shared?.toolbarOverflow?.refresh?.(toolbar);
  });
}

async function activeRailState(page) {
  return page.evaluate(() => {
    const toolbar = document.querySelector('#linePage:not([hidden]) .workspace-toolbar');
    const section = toolbar?.querySelector('.workspace-toolbar__section--active');
    const shell = section?.querySelector('[data-toolbar-overflow-shell="1"]');
    const viewport = section?.querySelector('[data-toolbar-overflow-viewport="1"]');
    const track = section?.querySelector('[data-toolbar-overflow-track="1"]');
    const previous = section?.querySelector('[data-toolbar-overflow-direction="previous"]');
    const next = section?.querySelector('[data-toolbar-overflow-direction="next"]');
    return {
      sectionId: section?.dataset?.toolbarSectionId || null,
      overflow: shell?.dataset?.toolbarOverflow || null,
      scrollLeft: viewport?.scrollLeft || 0,
      maxScroll: viewport ? Math.max(0, viewport.scrollWidth - viewport.clientWidth) : 0,
      previousVisible: !!previous && !previous.hidden && !previous.disabled,
      nextVisible: !!next && !next.hidden && !next.disabled,
      controlCount: track?.querySelectorAll('button,input,select').length || 0,
      duplicateControlIds: (() => {
        const ids = Array.from(toolbar?.querySelectorAll('[id]') || []).map(node => node.id).filter(Boolean);
        return ids.filter((id, index) => ids.indexOf(id) !== index);
      })()
    };
  });
}

test('toolbar overflow keeps General and Data controls in one scrollable owner rail', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await openLineExample(page);
  await constrainLineToolbar(page);

  await page.waitForFunction(() => {
    const shell = document.querySelector('#linePage:not([hidden]) .workspace-toolbar__section--active [data-toolbar-overflow-shell="1"]');
    return shell?.dataset?.toolbarOverflow === '1';
  });

  const initial = await activeRailState(page);
  expect(initial.overflow).toBe('1');
  expect(initial.previousVisible).toBe(false);
  expect(initial.nextVisible).toBe(true);
  expect(initial.duplicateControlIds).toEqual([]);

  const next = page.locator(`${LINE_TOOLBAR} .workspace-toolbar__section--active [data-toolbar-overflow-direction="next"]`);
  const generalSectionId = initial.sectionId;
  await next.click();
  await expect.poll(async () => (await activeRailState(page)).scrollLeft).toBeGreaterThan(0);
  const scrolledGeneral = await activeRailState(page);
  expect(scrolledGeneral.sectionId).toBe(generalSectionId);
  expect(scrolledGeneral.previousVisible).toBe(true);

  await page.locator(`${LINE_TOOLBAR} .workspace-toolbar__tab`, { hasText: 'Data' }).click();
  await expect.poll(async () => (await activeRailState(page)).sectionId).toContain('data');
  const dataState = await activeRailState(page);
  expect(dataState.controlCount).toBeGreaterThan(1);
  expect(dataState.duplicateControlIds).toEqual([]);

  const dataSectionGeometry = await page.evaluate(() => {
    const section = document.querySelector('#linePage:not([hidden]) .workspace-toolbar__section--active');
    const buttons = section?.querySelector('.workspace-toolbar__buttons');
    const style = buttons ? getComputedStyle(buttons) : null;
    return {
      flexWrap: style?.flexWrap || null,
      sectionHeight: section?.getBoundingClientRect().height || 0,
      toolbarHeight: section?.closest('.workspace-toolbar__content')?.getBoundingClientRect().height || 0
    };
  });
  expect(dataSectionGeometry.flexWrap).toBe('nowrap');
  expect(dataSectionGeometry.sectionHeight).toBeLessThanOrEqual(dataSectionGeometry.toolbarHeight + 1);
  expect(issues.critical).toEqual([]);
});

test('format overflow reveals hidden panels and toolbar menus escape clipping', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await openLineExample(page);
  await constrainLineToolbar(page, 560);

  await page.evaluate(() => {
    const path = document.querySelector('#linePlot path[data-series]');
    path?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  });
  await page.waitForFunction(() => {
    const toolbar = document.querySelector('#linePage:not([hidden]) .workspace-toolbar');
    const section = toolbar?.querySelector('.workspace-toolbar__section--active');
    const visibleHost = section?.querySelector('.font-toolbar-host.font-toolbar-host--visible');
    return !!visibleHost;
  });
  await page.evaluate(() => {
    const toolbar = document.querySelector('#linePage:not([hidden]) .workspace-toolbar');
    window.Shared?.toolbarOverflow?.refresh?.(toolbar);
  });
  await page.waitForFunction(() => {
    const shell = document.querySelector('#linePage:not([hidden]) .workspace-toolbar__section--active [data-toolbar-overflow-shell="1"]');
    return shell?.dataset?.toolbarOverflow === '1';
  });

  const formatState = await activeRailState(page);
  expect(formatState.overflow).toBe('1');
  expect(formatState.scrollLeft).toBeLessThanOrEqual(1);
  expect(formatState.nextVisible).toBe(true);
  const formatNext = page.locator(`${LINE_TOOLBAR} .workspace-toolbar__section--active [data-toolbar-overflow-direction="next"]`);
  const scrollerStyle = await formatNext.evaluate(button => {
    const buttonRect = button.getBoundingClientRect();
    const shellRect = button.closest('[data-toolbar-overflow-shell="1"]').getBoundingClientRect();
    const style = getComputedStyle(button);
    return {
      buttonHeight: buttonRect.height,
      shellHeight: shellRect.height,
      marginLeft: style.marginLeft,
      marginRight: style.marginRight,
      borderRadius: style.borderRadius,
      boxShadow: style.boxShadow,
      filter: style.filter
    };
  });
  expect(scrollerStyle.buttonHeight).toBeCloseTo(scrollerStyle.shellHeight, 0);
  expect(scrollerStyle.marginLeft).toBe('0px');
  expect(scrollerStyle.marginRight).toBe('0px');
  expect(scrollerStyle.borderRadius).toBe('0px');
  expect(scrollerStyle.boxShadow).toBe('none');
  expect(scrollerStyle.filter).toBe('none');

  await formatNext.click();
  await expect.poll(async () => (await activeRailState(page)).scrollLeft).toBeGreaterThan(0);
  const scrolledFormat = await activeRailState(page);
  expect(scrolledFormat.sectionId).toBe(formatState.sectionId);
  expect(scrolledFormat.controlCount).toBe(formatState.controlCount);

  await page.locator(`${LINE_TOOLBAR} .workspace-toolbar__tab`, { hasText: 'General' }).click();
  const openTrigger = page.locator(`${LINE_TOOLBAR} #openLine`);
  await openTrigger.click();
  const menu = page.locator(`${LINE_TOOLBAR} .workspace-toolbar__menu--open > .workspace-toolbar__menu-list`);
  await expect(menu).toBeVisible();
  const popupGeometry = await menu.evaluate(node => {
    const rect = node.getBoundingClientRect();
    const viewport = node.closest('[data-toolbar-overflow-viewport="1"]')?.getBoundingClientRect() || null;
    return {
      position: getComputedStyle(node).position,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      viewportTop: viewport?.top ?? null,
      viewportBottom: viewport?.bottom ?? null,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight
    };
  });
  expect(popupGeometry.position).toBe('fixed');
  expect(popupGeometry.left).toBeGreaterThanOrEqual(0);
  expect(popupGeometry.right).toBeLessThanOrEqual(popupGeometry.windowWidth + 1);
  expect(popupGeometry.bottom).toBeLessThanOrEqual(popupGeometry.windowHeight + 1);
  expect(popupGeometry.bottom).toBeGreaterThan(popupGeometry.viewportBottom);
  expect(issues.critical).toEqual([]);
});

async function getActiveTabId(page) {
  return page.evaluate(() => String(window.Main?.session?.workspaceState?.activeTabId || ''));
}

async function activateWorkspaceTab(page, tabId) {
  const tab = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).first();
  await expect(tab).toBeVisible();
  await tab.click({ force: true });
  const activated = await page.waitForFunction(
    id => window.Main?.session?.workspaceState?.activeTabId === id,
    tabId,
    { timeout: 3_000 }
  ).then(() => true).catch(() => false);
  if (!activated) {
    await page.evaluate(id => {
      window.Main?.tabs?.activateTab?.(id, { reason: 'e2e-toolbar-overflow-owner-switch' });
    }, tabId);
    await page.waitForFunction(
      id => window.Main?.session?.workspaceState?.activeTabId === id,
      tabId,
      { timeout: 20_000 }
    );
  }
  await page.waitForFunction(() => {
    const toolbar = document.querySelector('#linePage:not([hidden]) .workspace-toolbar');
    const shell = toolbar?.querySelector('.workspace-toolbar__section--active [data-toolbar-overflow-shell="1"]');
    return !!shell;
  });
}

test('same-component tab activation resets transient toolbar scroll without cloning state', async ({ page }) => {
  test.setTimeout(150_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await openLineExample(page);
  await constrainLineToolbar(page);

  await page.waitForFunction(() => {
    const shell = document.querySelector('#linePage:not([hidden]) .workspace-toolbar__section--active [data-toolbar-overflow-shell="1"]');
    return shell?.dataset?.toolbarOverflow === '1';
  });
  const firstTabId = await getActiveTabId(page);
  expect(firstTabId).toBeTruthy();

  await page.locator(`${LINE_TOOLBAR} .workspace-toolbar__section--active [data-toolbar-overflow-direction="next"]`).click();
  await expect.poll(async () => (await activeRailState(page)).scrollLeft).toBeGreaterThan(0);

  await openComponentFromWelcome(page, { type: 'line', pageId: 'linePage' }, {
    first: false,
    loadExample: true
  });
  const secondTabId = await getActiveTabId(page);
  expect(secondTabId).toBeTruthy();
  expect(secondTabId).not.toBe(firstTabId);
  await constrainLineToolbar(page);
  await page.waitForFunction(() => {
    const shell = document.querySelector('#linePage:not([hidden]) .workspace-toolbar__section--active [data-toolbar-overflow-shell="1"]');
    return shell?.dataset?.toolbarOverflow === '1';
  });
  expect((await activeRailState(page)).scrollLeft).toBe(0);

  await page.locator(`${LINE_TOOLBAR} .workspace-toolbar__section--active [data-toolbar-overflow-direction="next"]`).click();
  await expect.poll(async () => (await activeRailState(page)).scrollLeft).toBeGreaterThan(0);

  await activateWorkspaceTab(page, firstTabId);
  await constrainLineToolbar(page);
  await expect.poll(async () => (await activeRailState(page)).scrollLeft).toBe(0);

  await activateWorkspaceTab(page, secondTabId);
  await constrainLineToolbar(page);
  await expect.poll(async () => (await activeRailState(page)).scrollLeft).toBe(0);
  expect(issues.critical).toEqual([]);
});
