const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');

for (const type of ['scatter', 'line']) {
  test(`${type} overlay rows toggle once from text and padding without closing the menu`, async ({ page }) => {
    test.setTimeout(90_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, { type, pageId: `${type}Page` }, { first: true, loadExample: true });
    await page.locator(`#${type}ComputeStats`).click();
    await expect(page.locator(`#${type}StatsStatus`)).toContainText('up to date', { timeout: 40_000 });
    await waitForComponentOwnerReady(page, type, { requireMountedRoot: true, requireIdle: true });
    const cleanRevision = await page.evaluate(() => {
      window.Main.session.clearSessionDirty('overlay-disclosure-baseline');
      return window.Main.session.workspaceState.sessionRevision;
    });

    const trigger = page.locator(`#${type}RegressionOverlayButton`);
    const menu = page.locator(`#${type}RegressionOverlayMenu`);
    const rows = menu.locator('label');
    const trend = rows.nth(0).locator('input');
    const ci = rows.nth(1).locator('input');
    const pi = rows.nth(2).locator('input');
    await menu.evaluate(element => {
      window.overlayRowChanges = {};
      element.addEventListener('change', event => {
        const id = event.target.id;
        window.overlayRowChanges[id] = (window.overlayRowChanges[id] || 0) + 1;
      });
    });
    const expectChanges = async (input, count) => {
      const id = await input.getAttribute('id');
      expect(await page.evaluate(key => window.overlayRowChanges[key] || 0, id)).toBe(count);
    };
    const clickPadding = async row => {
      const box = await row.boundingBox();
      await page.mouse.click(box.x + box.width - 4, box.y + box.height / 2);
    };

    await trigger.click();
    expect(await page.evaluate(() => ({
      dirty: window.Main.session.workspaceState.sessionUserDirty,
      revision: window.Main.session.workspaceState.sessionRevision
    }))).toEqual({ dirty: false, revision: cleanRevision });
    await rows.nth(0).locator('span').click();
    await expect(trend).toBeChecked();
    await expect(menu).toBeVisible();
    await expectChanges(trend, 1);
    expect(await page.evaluate(() => window.Main.session.workspaceState.sessionUserDirty)).toBe(true);

    await rows.nth(1).locator('span').click();
    await expect(ci).toBeChecked();
    await expect(menu).toBeVisible();
    await expectChanges(ci, 1);
    await rows.nth(2).locator('span').click();
    await expect(pi).toBeChecked();
    await expectChanges(pi, 1);
    await clickPadding(rows.nth(2));
    await expect(pi).not.toBeChecked();
    await expect(menu).toBeVisible();
    await expectChanges(pi, 2);

    await ci.click();
    await expect(ci).not.toBeChecked();
    await expectChanges(ci, 2);
    await clickPadding(rows.nth(0));
    await expect(trend).not.toBeChecked();
    await expectChanges(trend, 2);
    await expect(ci).toBeDisabled();
    await clickPadding(rows.nth(1));
    await expect(menu).toBeVisible();
    await expect(ci).not.toBeChecked();
    await expectChanges(ci, 2);

    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(trend).toBeFocused();
    await page.keyboard.press('Space');
    await expect(trend).toBeChecked();
    await expectChanges(trend, 3);
    await expect(menu).toBeVisible();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(menu).toBeHidden();

    await trigger.click();
    await page.locator(`#${type}Page .config-panel legend`).first().click();
    await expect(menu).toBeHidden();
  });

}
