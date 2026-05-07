const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

async function activateTabById(page, tabId) {
  const tab = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).first();
  await expect(tab).toBeVisible();
  await tab.click({ force: true });
  await page.waitForTimeout(350);
}

test('repro: scatter two-tab AG-grid container/mount drift', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    if (/scatter|componentLayout|missing container|hotContainer|workspace same-component render cache restore allowed|createStandardTable/i.test(text)) {
      logs.push({ type: msg.type(), text });
    }
  });

  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();

  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage', exampleButtonId: 'scatterLoadExample' }, { first: true });
  await clickExampleButtonIfPresent(page, 'scatterLoadExample');
  await page.waitForFunction(() => !!document.querySelector('#scatterPlot svg'));

  await page.evaluate(async () => {
    if (typeof window.Main?.tabs?.handleAddTabClick === 'function') {
      const maybe = window.Main.tabs.handleAddTabClick();
      if (maybe && typeof maybe.then === 'function') {
        await maybe;
      }
    }
    if (typeof window.Main?.tabs?.handleGraphSelection === 'function') {
      const maybe = window.Main.tabs.handleGraphSelection('scatter', { reason: 'e2e-repro-second-scatter' });
      if (maybe && typeof maybe.then === 'function') {
        await maybe;
      }
    }
  });
  const duplicatePrompt = page.locator('#duplicatePrompt:not([hidden])');
  if (await duplicatePrompt.count()) {
    const emptyBtn = page.locator('#duplicateEmpty');
    if (await emptyBtn.isVisible()) {
      await emptyBtn.click({ force: true });
      await page.waitForTimeout(250);
    }
  }
  // Fallback if graph selection grid is still visible after add-tab flow.
  const scatterCard = page.locator('#graphSelectionGrid [data-graph-type="scatter"]');
  if (await scatterCard.count()) {
    await scatterCard.first().click({ force: true }).catch(() => {});
  }
  await page.waitForSelector('#scatterPage:not([hidden])', { timeout: 20_000 });
  await clickExampleButtonIfPresent(page, 'scatterLoadExample');
  await page.waitForFunction(() => !!document.querySelector('#scatterPlot svg'));

  const scatterTabIds = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]'))
      .map(tab => ({
        id: String(tab.getAttribute('data-tab-id') || '').trim(),
        title: String(tab.querySelector('.workspace-tab__title')?.textContent || '').trim()
      }))
      .filter(item => item.id && item.id !== 'welcome')
      .map(item => item.id)
  );
  expect(scatterTabIds.length).toBeGreaterThanOrEqual(2);
  const firstScatter = scatterTabIds[0];
  const secondScatter = scatterTabIds[1];

  const snapshots = [];
  const capture = async (label) => {
    const snap = await page.evaluate((stepLabel) => {
      const activeTab = document.querySelector('#workspaceTabsList .workspace-tab.workspace-tab--active');
      const activeTitle = activeTab?.querySelector('.workspace-tab__title')?.textContent?.trim() || null;
      const pageRoot = document.querySelector('#scatterPage:not([hidden])');
      const hot = pageRoot?.querySelector('#scatterHot') || null;
      const wrapper = pageRoot?.querySelector('#scatterHotWrapper') || null;
      const gridRoot = hot?.querySelector('.ag-root-wrapper, .ag-root') || null;
      const wrapperRect = wrapper?.getBoundingClientRect?.() || null;
      const hotRect = hot?.getBoundingClientRect?.() || null;
      return {
        stepLabel,
        activeTitle,
        hasPageRoot: !!pageRoot,
        hasHot: !!hot,
        hasWrapper: !!wrapper,
        hasGridRoot: !!gridRoot,
        wrapperTop: wrapperRect ? wrapperRect.top : null,
        hotTop: hotRect ? hotRect.top : null,
        deltaTop: wrapperRect && hotRect ? (hotRect.top - wrapperRect.top) : null
      };
    }, label);
    snapshots.push(snap);
  };

  await capture('after-two-tabs-opened');
  await activateTabById(page, firstScatter);
  await capture('after-switch-to-first');
  await activateTabById(page, secondScatter);
  await capture('after-switch-to-second');
  await activateTabById(page, firstScatter);
  await capture('after-switch-back-to-first');

  await testInfo.attach('scatter-tab-grid-leak.snapshots.json', {
    body: Buffer.from(JSON.stringify(snapshots, null, 2), 'utf8'),
    contentType: 'application/json'
  });
  await testInfo.attach('scatter-tab-grid-leak.logs.json', {
    body: Buffer.from(JSON.stringify(logs.slice(-800), null, 2), 'utf8'),
    contentType: 'application/json'
  });

  // This spec is for reproduction/evidence: assert baseline sanity only.
  expect(issues.critical).toEqual([]);
  expect(snapshots.some(s => s.hasHot === false || s.hasGridRoot === false)).toBeTruthy();
});
