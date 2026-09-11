const { test, expect } = require('@playwright/test');
const { COMPONENT_MATRIX, openComponentFromWelcome } = require('./helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('./helpers/vendorOverrides');
const { waitForComponentOwnerReady } = require('./helpers/contractWaits');

const HOT_ID_BY_COMPONENT = {
  venn: 'vennHot',
  box: 'hot',
  scatter: 'scatterHot',
  pca: 'pcaHot',
  surface: 'surfaceHot',
  line: 'lineHot',
  heatmap: 'heatmapHot',
  roc: 'rocHot',
  survival: 'survivalHot',
  hist: 'histHot',
  pie: 'pieHot'
};

const PASTE_CONTRACT_COMPONENTS = [
  { type: 'box', pageId: 'boxPage', hotId: 'hot' },
  { type: 'scatter', pageId: 'scatterPage', hotId: 'scatterHot' },
  { type: 'pca', pageId: 'pcaPage', hotId: 'pcaHot' },
  { type: 'line', pageId: 'linePage', hotId: 'lineHot' },
  { type: 'heatmap', pageId: 'heatmapPage', hotId: 'heatmapHot' },
  { type: 'roc', pageId: 'rocPage', hotId: 'rocHot' }
];

test.describe('Cross-browser Feature Matrix', () => {
  test.describe.configure({ timeout: 180_000 });

  test('all workspaces open with AG Grid host + panel resizer', async ({ page }) => {
    await installLocalCdnOverrides(page);

    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible();

    for (let i = 0; i < COMPONENT_MATRIX.length; i += 1) {
      const component = COMPONENT_MATRIX[i];
      await test.step(`open ${component.type}`, async () => {
        await openComponentFromWelcome(page, component, { first: i === 0 });
        await waitForComponentOwnerReady(page, component);
        const pageRoot = page.locator(`#${component.pageId}:not([hidden])`);
        await expect(pageRoot).toBeVisible();
        await expect(pageRoot.locator('.panel-resizer').first()).toBeVisible();

        const hotId = HOT_ID_BY_COMPONENT[component.type];
        expect(hotId, `Missing hot id mapping for ${component.type}`).toBeTruthy();
        await expect(page.locator(`#${hotId} .ag-root`).first()).toBeVisible();
      });
    }
  });

  test('browser paste contract works across AG Grid wrappers', async ({ page }) => {
    await installLocalCdnOverrides(page);

    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible();
    for (let i = 0; i < PASTE_CONTRACT_COMPONENTS.length; i += 1) {
      const component = PASTE_CONTRACT_COMPONENTS[i];
      await test.step(`paste contract ${component.type}`, async () => {
        await openComponentFromWelcome(page, component, { first: i === 0 });
        await waitForComponentOwnerReady(page, component);
        await expect(page.locator(`#${component.pageId}:not([hidden])`)).toBeVisible();
        await page.waitForSelector(`#${component.hotId} .ag-root`, { timeout: 20_000 });

        const targetCell = await page.evaluate((hotId) => {
          const host = document.getElementById(hotId);
          if (!host) {
            return null;
          }
          const cells = host.querySelectorAll('.ag-center-cols-container .ag-row .ag-cell[col-id^="c"]');
          for (let i = 0; i < cells.length; i += 1) {
            const rect = cells[i].getBoundingClientRect();
            if (rect.width > 1 && rect.height > 1) {
              const rowIndex = Number(cells[i].closest('.ag-row')?.getAttribute('row-index'));
              const colId = cells[i].getAttribute('col-id') || '';
              const colIndex = Number(String(colId).replace(/^c/, ''));
              return {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
                rowIndex: Number.isInteger(rowIndex) ? rowIndex : 0,
                colIndex: Number.isInteger(colIndex) ? colIndex : 0
              };
            }
          }
          return null;
        }, component.hotId);
        expect(targetCell, `No visible data cell found for ${component.type}`).toBeTruthy();
        await page.mouse.click(targetCell.x, targetCell.y);

        const token = `fx_${component.type}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        const handled = await page.evaluate(({ hotId, token }) => {
          const host = document.getElementById(hotId);
          if (!host) return false;
          const transfer = new DataTransfer();
          transfer.setData('text/plain', token);
          const event = new Event('paste', { bubbles: true, cancelable: true });
          Object.defineProperty(event, 'clipboardData', { value: transfer });
          host.dispatchEvent(event);
          return event.defaultPrevented;
        }, { hotId: component.hotId, token });
        expect(handled, `Paste event was not handled for ${component.type}`).toBe(true);
        await expect.poll(() => page.evaluate(({ hotId, token }) => {
          const host = document.getElementById(hotId);
          if (!host) {
            return false;
          }
          const cells = host.querySelectorAll('.ag-center-cols-container .ag-row .ag-cell[col-id^="c"]');
          for (let i = 0; i < cells.length; i += 1) {
            const text = String(cells[i].textContent || '').trim();
            if (text === token || text.includes(token)) {
              return true;
            }
          }
          return false;
        }, { hotId: component.hotId, token }), {
          timeout: 20_000,
          intervals: [50, 100, 250, 500]
        }).toBe(true);
      });
    }
  });
});
