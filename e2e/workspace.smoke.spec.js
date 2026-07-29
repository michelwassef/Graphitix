const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

test('welcome file and graph finder tools share one responsive row', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  const fileTool = page.locator('#welcomeFileDropZone');
  const finder = page.locator('.welcome-graph-finder');
  await expect(fileTool).toContainText('Open or drop a file');
  await expect(fileTool.locator('[data-file-formats-label="welcome"]')).toHaveText(
    '.graph, .prism, .pzfx, .csv, .tsv, .txt, .xls, .xlsx, .ods'
  );
  await expect(page.locator('#welcomeOpenButton')).toHaveCount(0);

  const desktopLayout = await page.locator('.welcome-hero__tools').evaluate(node => {
    const file = node.querySelector('#welcomeFileDropZone').getBoundingClientRect();
    const graphFinder = node.querySelector('.welcome-graph-finder').getBoundingClientRect();
    return {
      aligned: Math.abs(file.top - graphFinder.top) < 1,
      ordered: file.right < graphFinder.left
    };
  });
  expect(desktopLayout).toEqual({ aligned: true, ordered: true });

  await page.evaluate(() => {
    window.__welcomeOpenCalls = 0;
    window.Shared.fileIO.openGraphFile = async () => {
      window.__welcomeOpenCalls += 1;
      return { status: 'cancelled' };
    };
  });
  await fileTool.click();
  await expect.poll(() => page.evaluate(() => window.__welcomeOpenCalls)).toBe(1);

  await page.locator('#welcomeGraphSearch').fill('scatter');
  await expect(page.locator('#welcomeGraphResults')).toBeVisible();
  await expect(page.locator('#welcomeGraphResults .welcome-picker__option').first()).toContainText('Scatter');

  await page.setViewportSize({ width: 640, height: 900 });
  const mobileLayout = await page.locator('.welcome-hero__tools').evaluate(node => {
    const file = node.querySelector('#welcomeFileDropZone').getBoundingClientRect();
    const graphFinder = node.querySelector('.welcome-graph-finder').getBoundingClientRect();
    return graphFinder.top > file.bottom;
  });
  expect(mobileLayout).toBe(true);
});

test('workspace loads and opens a graph tab from welcome screen', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();

  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });

  await page.waitForFunction(() => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId);
    return active?.type === 'scatter';
  }, null, { timeout: 20_000 });
  await expect(page.locator('#saveScatter')).toBeVisible();
});

test('renaming a workspace tab stays inside the tab without expanding the tab list', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });

  const tab = page.locator('#workspaceTabsList .workspace-tab.is-active');
  const label = tab.locator('.workspace-tab__label');
  const tabsList = page.locator('#workspaceTabsList');
  const scrollWidthBefore = await tabsList.evaluate(node => node.scrollWidth);

  await label.dblclick();

  const input = tab.locator('.workspace-tab__rename');
  await expect(input).toBeVisible();
  const geometry = await tab.evaluate(node => {
    const field = node.querySelector('.workspace-tab__rename');
    const tabBox = node.getBoundingClientRect();
    const fieldBox = field.getBoundingClientRect();
    return {
      fieldLeft: fieldBox.left,
      fieldRight: fieldBox.right,
      tabLeft: tabBox.left,
      tabRight: tabBox.right,
      background: getComputedStyle(field).backgroundColor
    };
  });

  expect(geometry.fieldLeft).toBeGreaterThanOrEqual(geometry.tabLeft);
  expect(geometry.fieldRight).toBeLessThanOrEqual(geometry.tabRight);
  expect(geometry.background).toBe('rgba(0, 0, 0, 0)');
  await expect.poll(() => tabsList.evaluate(node => node.scrollWidth)).toBe(scrollWidthBefore);
});

test('overflowing workspace tabs use a thin scrollbar', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  await page.evaluate(() => {
    const { session, tabs } = window.Main;
    for (let index = 0; index < 14; index += 1) {
      session.workspaceState.tabs.push(session.createTab({ title: `Workspace ${index + 2}` }));
    }
    tabs.renderTabs();
  });

  const scrollbar = await page.locator('#workspaceTabsList').evaluate(node => {
    const tab = node.querySelector('.workspace-tab');
    const label = tab.querySelector('.workspace-tab__label');
    const listBox = node.getBoundingClientRect();
    const thickness = node.offsetHeight - node.clientHeight;
    return {
      thickness,
      overflows: node.scrollWidth > node.clientWidth,
      dockHeight: node.closest('.workspace-tabs-dock').getBoundingClientRect().height,
      visibleBottom: listBox.bottom - thickness,
      tabHeight: tab.getBoundingClientRect().height,
      tabBottom: tab.getBoundingClientRect().bottom,
      labelBottom: label.getBoundingClientRect().bottom
    };
  });

  expect(scrollbar.overflows).toBe(true);
  expect(scrollbar.dockHeight).toBe(46);
  expect(scrollbar.thickness).toBeLessThanOrEqual(8);
  expect(scrollbar.tabHeight).toBeGreaterThanOrEqual(40);
  expect(scrollbar.tabBottom).toBeLessThanOrEqual(scrollbar.visibleBottom);
  expect(scrollbar.labelBottom).toBeLessThanOrEqual(scrollbar.visibleBottom);

  await page.evaluate(() => {
    const { session, tabs } = window.Main;
    session.workspaceState.tabs.splice(1);
    tabs.renderTabs();
  });
  await expect.poll(() => page.locator('#workspaceTabsDock').evaluate(node => node.getBoundingClientRect().height)).toBe(40);
});
