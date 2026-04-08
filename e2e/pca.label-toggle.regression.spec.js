const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

const PCA_FIXTURE = [
  ['Label point', false, false, false, false],
  ['Variable', 'A', 'B', 'C', 'D'],
  ['Var1', 1, 2, 3, 2],
  ['Var2', 2, 3, 2, 3],
  ['Var3', 3, 4, 1, 4],
  ['Var4', 4, 2, 4, 1]
];

async function loadPcaFixture(page) {
  await page.evaluate((matrix) => {
    const hot = window.Components?.pca?.getHotInstance?.();
    if (!hot || typeof hot.loadData !== 'function') {
      throw new Error('PCA hot instance is not ready');
    }
    hot.loadData(matrix);
  }, PCA_FIXTURE);

  await page.waitForFunction(() => {
    const hot = window.Components?.pca?.getHotInstance?.();
    const data = hot?.getData?.() || [];
    return Array.isArray(data[1]) && String(data[1][1] || '').trim() === 'A';
  }, null, { timeout: 30_000 });

  await page.waitForSelector('#pcaSvg', { timeout: 30_000 });
  await page.waitForTimeout(1200);
}

async function readPcaManualLabels(page) {
  return page.evaluate(() => {
    const svg = document.getElementById('pcaSvg');
    if (!svg) {
      return [];
    }
    return Array.from(svg.querySelectorAll("g[data-layer='point-labels'] text"))
      .map(node => String(node.textContent || '').trim())
      .filter(Boolean)
      .sort();
  });
}

async function readPcaLabelRow(page) {
  return page.evaluate(() => {
    const hot = window.Components?.pca?.getHotInstance?.();
    const row = hot?.getData?.()?.[0] || [];
    return row.slice(0, 5);
  });
}

async function clickPcaLabelToggle(page, colId) {
  const cell = page.locator(`#pcaHot .ag-floating-top .ag-cell[col-id="${colId}"]`).first();
  await expect(cell).toBeVisible();
  await cell.click({ force: true });
  await page.waitForTimeout(900);
}

test.describe('PCA label toggle regression', () => {
  test('label row checkboxes keep plotted point labels in sync', async ({ page }) => {
    test.setTimeout(120_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

    await openComponentFromWelcome(page, { type: 'pca', pageId: 'pcaPage' }, { first: true });
    await loadPcaFixture(page);

    await expect.poll(() => readPcaManualLabels(page)).toEqual([]);

    await clickPcaLabelToggle(page, 'c1');
    await expect.poll(() => readPcaManualLabels(page)).toEqual(['A']);
    await expect.poll(() => readPcaLabelRow(page)).toEqual(['Label point', true, false, false, false]);

    await clickPcaLabelToggle(page, 'c4');
    await expect.poll(() => readPcaManualLabels(page)).toEqual(['A', 'D']);
    await expect.poll(() => readPcaLabelRow(page)).toEqual(['Label point', true, false, false, true]);

    await clickPcaLabelToggle(page, 'c1');
    await expect.poll(() => readPcaManualLabels(page)).toEqual(['D']);
    await expect.poll(() => readPcaLabelRow(page)).toEqual(['Label point', false, false, false, true]);
  });
});
