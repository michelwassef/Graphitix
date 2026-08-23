const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

const readCoefficientPValues = page => page.evaluate(() => {
  const cards = Array.from(document.querySelectorAll(
    '#scatterPage:not([hidden]) #scatterStatsResults .stats-table-card'
  ));
  const card = cards.find(node => /Coefficient estimates/i.test(node.textContent || ''));
  if(!card){
    return [];
  }
  const headers = Array.from(card.querySelectorAll('thead th'));
  const pIndex = headers.findIndex(node => /^p[-\s]?value$/i.test((node.textContent || '').trim()));
  return Array.from(card.querySelectorAll('tbody tr')).map(row => {
    const cells = Array.from(row.cells || []);
    const pCell = cells[pIndex];
    const valueText = Array.from(pCell?.childNodes || [])
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent || '')
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    return {
      term: (cells[0]?.textContent || '').trim(),
      valueText,
      raw: pCell?.dataset?.statsPvalueRaw,
      operator: pCell?.dataset?.statsPvalueOperator
    };
  });
});

const getScatterTabIds = page => page.evaluate(() => (
  (window.Main?.session?.workspaceState?.tabs || [])
    .filter(tab => tab?.type === 'scatter')
    .map(tab => String(tab.id || ''))
    .filter(Boolean)
));

async function activateTab(page, tabId) {
  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).click({ force: true });
  await page.waitForFunction(id => (
    String(window.Main?.session?.workspaceState?.activeTabId || '') === String(id)
  ), tabId, { timeout: 20_000 });
  await expect(page.locator('#scatterPage:not([hidden]) #scatterStatsResults .stats-pvalue-format-toggle'))
    .toBeVisible({ timeout: 25_000 });
}

async function calculateScatterStatistics(page) {
  await expect(page.locator('#scatterPage:not([hidden]) #scatterComputeStats')).toBeEnabled({ timeout: 30_000 });
  await page.locator('#scatterPage:not([hidden]) #scatterComputeStats').click();
  await expect(page.locator('#scatterPage:not([hidden]) #scatterStatsStatus'))
    .toContainText('Statistics up to date.', { timeout: 45_000 });
}

test('Scatter example preserves underflow p-values across decimal/scientific switching', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await openComponentFromWelcome(
    page,
    { type: 'scatter', pageId: 'scatterPage', exampleButtonId: 'scatterLoadExample' },
    { first: true, loadExample: true }
  );

  await calculateScatterStatistics(page);

  await expect.poll(() => readCoefficientPValues(page), { timeout: 30_000 }).toEqual([
    { term: 'Intercept', valueText: '<0.0001', raw: expect.any(String), operator: '=' },
    { term: 'Slope', valueText: '<0.0001', raw: '0', operator: '=' }
  ]);

  const formatToggle = page.locator(
    '#scatterPage:not([hidden]) #scatterStatsResults .stats-pvalue-format-toggle'
  );
  await expect(formatToggle).toHaveText('Scientific');
  await formatToggle.click();
  await expect(formatToggle).toHaveText('Decimal');

  await expect.poll(() => readCoefficientPValues(page), { timeout: 20_000 }).toEqual([
    { term: 'Intercept', valueText: '1.87499 × 10⁻⁶²', raw: expect.any(String), operator: '=' },
    { term: 'Slope', valueText: '<1 × 10⁻⁴', raw: '0', operator: '=' }
  ]);

  await formatToggle.click();
  await expect(formatToggle).toHaveText('Scientific');
  await expect.poll(() => readCoefficientPValues(page), { timeout: 20_000 }).toEqual([
    { term: 'Intercept', valueText: '<0.0001', raw: expect.any(String), operator: '=' },
    { term: 'Slope', valueText: '<0.0001', raw: '0', operator: '=' }
  ]);

  expect(issues.critical).toEqual([]);
});

test('two Scatter tabs retain independent p-value formats through repeated switching', async ({ page }) => {
  test.setTimeout(150_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });

  const beforeA = new Set(await getScatterTabIds(page));
  await openComponentFromWelcome(
    page,
    { type: 'scatter', pageId: 'scatterPage', exampleButtonId: 'scatterLoadExample' },
    { first: true, loadExample: true }
  );
  const tabA = (await getScatterTabIds(page)).find(id => !beforeA.has(id));
  expect(tabA).toBeTruthy();
  await calculateScatterStatistics(page);
  await expect(page.locator('#scatterPage:not([hidden]) #scatterStatsResults .stats-pvalue-format-toggle'))
    .toHaveText('Scientific');

  const beforeB = new Set(await getScatterTabIds(page));
  await openComponentFromWelcome(
    page,
    { type: 'scatter', pageId: 'scatterPage', exampleButtonId: 'scatterLoadExample' },
    { first: false, loadExample: true }
  );
  const tabB = (await getScatterTabIds(page)).find(id => !beforeB.has(id));
  expect(tabB).toBeTruthy();
  expect(tabB).not.toBe(tabA);
  await calculateScatterStatistics(page);

  const toggle = page.locator('#scatterPage:not([hidden]) #scatterStatsResults .stats-pvalue-format-toggle');
  await expect(toggle).toHaveText('Scientific');
  await toggle.click();
  await expect(toggle).toHaveText('Decimal');
  await page.waitForFunction(id => {
    const tab = (window.Main?.session?.workspaceState?.tabs || []).find(item => item?.id === id);
    return tab?.payload?.meta?.statsReporting?.pValueScientific === true;
  }, tabB, { timeout: 20_000 });

  for(let cycle = 0; cycle < 2; cycle += 1){
    await activateTab(page, tabA);
    await expect(page.locator('#scatterPage:not([hidden]) #scatterStatsResults .stats-pvalue-format-toggle'))
      .toHaveText('Scientific');
    expect((await readCoefficientPValues(page)).every(row => !row.valueText.includes('× 10'))).toBe(true);

    await activateTab(page, tabB);
    await expect(page.locator('#scatterPage:not([hidden]) #scatterStatsResults .stats-pvalue-format-toggle'))
      .toHaveText('Decimal');
    expect((await readCoefficientPValues(page)).some(row => row.valueText.includes('× 10'))).toBe(true);
  }

  const persisted = await page.evaluate(({ a, b }) => {
    const tabs = window.Main?.session?.workspaceState?.tabs || [];
    const read = id => tabs.find(tab => tab?.id === id)?.payload?.meta?.statsReporting?.pValueScientific;
    return { a: read(a), b: read(b) };
  }, { a: tabA, b: tabB });
  expect(persisted).toEqual({ a: false, b: true });
  expect(issues.critical).toEqual([]);
});
