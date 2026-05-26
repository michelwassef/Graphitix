const { chromium } = require('playwright');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('../e2e/helpers/workspaceHarness');

function now() {
  return new Date().toISOString();
}

async function sleep(page, ms) {
  await page.waitForTimeout(ms);
}

async function dumpStatus(page, label) {
  const status = await page.evaluate(() => {
    const heatmap = window.Components?.heatmap || null;
    const hot = window.__LAST_HEATMAP_HOT__ || null;
    const activeTabId = window.Main?.session?.workspaceState?.activeTabId || null;
    const rows = hot?.getData?.() || [];
    const cells = document.querySelectorAll('#heatmapSvg [data-export-layer="heatmap-cells"] rect').length;
    const overlay = !!document.querySelector('#heatmapGraphPanel .venn-loading-overlay');
    const pendingReason = window.Shared?.loadingOverlay?.getPendingReason?.('heatmap') || null;
    return {
      activeTabId,
      boundTabId: heatmap?.__boundTabId || null,
      hotTabId: hot?.__heatmapTabId || null,
      rows: rows.length,
      cols: rows[0]?.length || 0,
      firstDataRowLabel: rows[1]?.[0] || null,
      overlay,
      pendingReason,
      cells
    };
  });
  console.log(`${now()} [status:${label}] ${JSON.stringify(status)}`);
}

async function resolveDuplicatePrompt(page, reuse = false) {
  const prompt = page.locator('#duplicatePrompt:not([hidden])');
  if (!(await prompt.count())) {
    return false;
  }
  if (reuse) {
    await page.locator('#duplicateReuse').click({ force: true });
  } else {
    await page.locator('#duplicateEmpty').click({ force: true });
  }
  await sleep(page, 250);
  return true;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', msg => {
    const text = msg.text();
    if (!/heatmap|component lifecycle|workspaceTabs|overlay|tab-scoped|draw deferred|draw suppressed|explicit tab id/i.test(text)) {
      return;
    }
    console.log(`${now()} [console.${msg.type()}] ${text}`);
  });

  await installLocalCdnOverrides(page);
  await page.goto('http://127.0.0.1:4173/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.Shared?.enableDebugLogging?.());

  await openComponentFromWelcome(
    page,
    { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' },
    { first: true }
  );
  await clickExampleButtonIfPresent(page, 'heatmapLoadExample');
  await sleep(page, 2000);
  await dumpStatus(page, 'tab1-after-example');
  const firstTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);

  await page.locator('#addWorkspaceTab').click();
  await sleep(page, 100);
  if (!(await resolveDuplicatePrompt(page, false))) {
    await page.locator('#graphSelectionGrid [data-graph-type="heatmap"]').first().click({ force: true });
    await resolveDuplicatePrompt(page, false);
  }
  await page.waitForSelector('#heatmapPage:not([hidden])', { timeout: 20_000 });
  await dumpStatus(page, 'tab2-before-example');

  await clickExampleButtonIfPresent(page, 'heatmapLoadExample');
  for (let i = 0; i < 8; i += 1) {
    await sleep(page, 1000);
    await dumpStatus(page, `tab2-after-example-t+${i + 1}s`);
  }

  await page.evaluate((tabId) => {
    document.querySelector(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`)?.click();
  }, firstTabId);
  await sleep(page, 1000);
  await dumpStatus(page, 'tab1-return');

  await browser.close();
})().catch(err => {
  console.error(err);
  process.exit(1);
});

