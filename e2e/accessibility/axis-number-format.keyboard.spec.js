const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { COMPONENT_MATRIX, openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { expectTargetsAtLeast24 } = require('../helpers/targetSizeAssertions');

const AXIS_COMPONENTS = ['box', 'scatter', 'line', 'hist'].map(type => {
  const component = COMPONENT_MATRIX.find(candidate => candidate.type === type);
  if (!component) throw new Error(`The ${type} workspace harness entry is missing.`);
  return component;
});

for (const component of AXIS_COMPONENTS) {
test(`${component.type} axis number-format listbox is linked, keyboard operable, and viewport bounded`, async ({ page }) => {
  test.setTimeout(60_000);
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 320, height: 400 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, component, { first: true, loadExample: true });
  await waitForComponentOwnerReady(page, component.type, {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 30_000
  });

  const axis = page.locator(`#${component.pageId}:not([hidden]) [data-axis-control="1"][data-axis-key="y"]`).first();
  await expect(axis).toHaveCount(1, { timeout: 30_000 });
  await axis.dispatchEvent('click');

  const trigger = page.getByRole('button', { name: 'Choose number format' });
  await expect(trigger).toBeVisible();
  await trigger.focus();
  await page.keyboard.press('ArrowDown');

  const listbox = page.getByRole('listbox', { name: 'Number format' });
  await expect(listbox).toBeVisible();
  await expectTargetsAtLeast24(listbox.getByRole('option'), 'axis number-format listbox');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const listboxId = await listbox.getAttribute('id');
  expect(listboxId).toBeTruthy();
  await expect(trigger).toHaveAttribute('aria-controls', listboxId);
  await expect(listbox.getByRole('option', { name: 'Automatic' })).toBeFocused();

  const bounds = await listbox.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(321);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(401);

  await page.keyboard.press('End');
  await expect(listbox.getByRole('option', { name: 'Scientific' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(listbox).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
});

test(`${component.type} axis number-format listbox closes when its same-type tab owner deactivates`, async ({ page }) => {
  test.setTimeout(120_000);

  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, component, { first: true, loadExample: true });
  await waitForComponentOwnerReady(page, component.type, { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });
  const firstTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);

  await openComponentFromWelcome(page, component, { loadExample: true });
  await waitForComponentOwnerReady(page, component.type, { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });
  const secondTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  expect(secondTabId).toBeTruthy();
  expect(secondTabId).not.toBe(firstTabId);

  await page.evaluate(async tabId => {
    await window.Main.tabs.activateTab(tabId, { reason: 'e2e-axis-listbox-owner-open' });
  }, firstTabId);
  await waitForComponentOwnerReady(page, component.type, { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });
  const axis = page.locator(`#${component.pageId}:not([hidden]) [data-axis-control="1"][data-axis-key="y"]`).first();
  await axis.dispatchEvent('click');
  const trigger = page.getByRole('button', { name: 'Choose number format' });
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  const listbox = page.getByRole('listbox', { name: 'Number format' });
  await expect(listbox).toBeVisible();

  await page.evaluate(async tabId => {
    await window.Main.tabs.activateTab(tabId, { reason: 'e2e-axis-listbox-owner-deactivate' });
  }, secondTabId);
  await waitForComponentOwnerReady(page, component.type, { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });
  await expect(listbox).toBeHidden();

  await page.evaluate(async tabId => {
    await window.Main.tabs.activateTab(tabId, { reason: 'e2e-axis-listbox-owner-restore' });
  }, firstTabId);
  await waitForComponentOwnerReady(page, component.type, { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });
  await expect(listbox).toBeHidden();
});
}
