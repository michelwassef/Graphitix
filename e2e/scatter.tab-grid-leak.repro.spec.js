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
  await expect(tab).toHaveClass(/is-active/);
  await page.waitForFunction((expectedTabId) => {
    const active = document.querySelector('#workspaceTabsList .workspace-tab.is-active');
    if(String(active?.getAttribute('data-tab-id') || '') !== String(expectedTabId)){
      return false;
    }
    const pageRoot = document.querySelector('#scatterPage:not([hidden])');
    const hot = pageRoot?.querySelector('#scatterHot');
    return !!(pageRoot && hot && hot.querySelector('.ag-root-wrapper, .ag-root'));
  }, tabId);
}

test('scatter two-tab AG Grid mounts remain owner-scoped across tab switches', async ({ page }, testInfo) => {
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
      await expect(duplicatePrompt).toBeHidden();
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
    (window.Main?.session?.workspaceState?.tabs || [])
      .filter(tab => tab?.type === 'scatter')
      .map(tab => String(tab.id || ''))
      .filter(Boolean)
  );
  expect(scatterTabIds.length).toBeGreaterThanOrEqual(2);
  const firstScatter = scatterTabIds[0];
  const secondScatter = scatterTabIds[1];

  const snapshots = [];
  const capture = async (label) => {
    const snap = await page.evaluate((stepLabel) => {
      const activeTab = document.querySelector('#workspaceTabsList .workspace-tab.is-active');
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

  expect(issues.critical).toEqual([]);
  expect(snapshots).toHaveLength(4);
  snapshots.forEach(snapshot => {
    expect(snapshot.hasPageRoot, `${snapshot.stepLabel}: active Scatter page`).toBe(true);
    expect(snapshot.hasHot, `${snapshot.stepLabel}: owner-scoped table host`).toBe(true);
    expect(snapshot.hasWrapper, `${snapshot.stepLabel}: owner-scoped table wrapper`).toBe(true);
    expect(snapshot.hasGridRoot, `${snapshot.stepLabel}: AG Grid root`).toBe(true);
    expect(Number.isFinite(snapshot.deltaTop), `${snapshot.stepLabel}: table geometry`).toBe(true);
  });
});
