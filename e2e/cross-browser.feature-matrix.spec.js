const { test, expect } = require('@playwright/test');
const {
  COMPONENT_MATRIX,
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

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
        const pageRoot = page.locator(`#${component.pageId}:not([hidden])`);
        await expect(pageRoot).toBeVisible();
        await expect(pageRoot.locator('.panel-resizer').first()).toBeVisible();

        const hotId = HOT_ID_BY_COMPONENT[component.type];
        expect(hotId, `Missing hot id mapping for ${component.type}`).toBeTruthy();
        await expect(page.locator(`#${hotId} .ag-root`).first()).toBeVisible();
      });
    }
  });

  test('clipboard paste contract works across AG Grid wrappers', async ({ page, context }) => {
    await installLocalCdnOverrides(page);
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: 'http://127.0.0.1:4173'
    }).catch(() => {});

    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible();

    for (let i = 0; i < PASTE_CONTRACT_COMPONENTS.length; i += 1) {
      const component = PASTE_CONTRACT_COMPONENTS[i];
      await test.step(`paste contract ${component.type}`, async () => {
        await openComponentFromWelcome(page, component, { first: i === 0 });
        await expect(page.locator(`#${component.pageId}:not([hidden])`)).toBeVisible();
        await page.waitForSelector(`#${component.hotId} .ag-root`, { timeout: 20_000 });

        const targetPoint = await page.evaluate((hotId) => {
          const host = document.getElementById(hotId);
          if (!host) {
            return null;
          }
          const cells = host.querySelectorAll('.ag-center-cols-container .ag-row .ag-cell[col-id^="c"]');
          for (let i = 0; i < cells.length; i += 1) {
            const rect = cells[i].getBoundingClientRect();
            if (rect.width > 1 && rect.height > 1) {
              return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
            }
          }
          return null;
        }, component.hotId);
        expect(targetPoint, `No visible data cell found for ${component.type}`).toBeTruthy();
        await page.mouse.click(targetPoint.x, targetPoint.y);

        const token = `fx_${component.type}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        const writeResult = await page.evaluate(async (value) => {
          try {
            await navigator.clipboard.writeText(value);
            return { ok: true };
          } catch (err) {
            return { ok: false, message: err?.message || String(err) };
          }
        }, token);
        expect(writeResult.ok, `Clipboard write failed for ${component.type}`).toBe(true);

        await page.keyboard.press('Control+V');
        await page.waitForTimeout(700);

        const pasted = await page.evaluate(({ hotId, token }) => {
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
        }, { hotId: component.hotId, token });

        expect(pasted, `Paste token not observed in ${component.type}`).toBe(true);
      });
    }
  });
});
