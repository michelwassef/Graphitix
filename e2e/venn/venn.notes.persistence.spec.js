'use strict';

const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { activateTab, clickExampleButton } = require('../helpers/uiDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');

const VENN = { type: 'venn', pageId: 'vennPage', exampleButtonId: 'sample' };

async function getTabIds(page) {
  return page.evaluate(() => Array.from(
    document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]')
  ).map(tab => String(tab.dataset.tabId || '').trim()).filter(Boolean));
}

async function openVenn(page, first) {
  const before = new Set(await getTabIds(page));
  await openComponentFromWelcome(page, VENN, first ? { first: true } : {});
  const tabId = (await getTabIds(page)).find(id => !before.has(id));
  expect(tabId).toBeTruthy();
  await clickExampleButton(page, VENN, { expectedTabId: tabId, requireMountedRoot: true });
  await waitForComponentOwnerReady(page, VENN, {
    expectedTabId: tabId,
    requireMountedRoot: true,
    requireIdle: true
  });
  return tabId;
}

async function setNotes(page, tabId, text) {
  await activateTab(page, tabId, VENN, { requireMountedRoot: true });
  const notes = page.locator('#vennPage:not([hidden]) [data-notes-id="venn-notes"]');
  await expect(notes).toBeVisible();
  if (!(await notes.locator('summary').evaluate(node => node.parentElement.open))) {
    await notes.locator('summary').click();
  }
  const editor = notes.locator('[data-notes-editor="1"]');
  await editor.fill(text);
  await page.waitForFunction(({ expectedTabId, expectedText }) => {
    const tab = window.Main?.session?.workspaceState?.tabs?.find(item => item?.id === expectedTabId);
    const notes = tab?.payload?.notes || tab?.payload?.state?.notes || null;
    return String(notes?.text || '') === expectedText
      && notes?.open === true;
  }, { expectedTabId: tabId, expectedText: text });
}

async function readNotes(page, tabId) {
  await activateTab(page, tabId, VENN, { requireMountedRoot: true });
  const notes = page.locator('#vennPage:not([hidden]) [data-notes-id="venn-notes"]');
  await expect(notes).toBeVisible();
  return notes.locator('[data-notes-editor="1"]').textContent();
}

test('Venn notes stay isolated between same-type tabs through activation', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  const firstTabId = await openVenn(page, true);
  const secondTabId = await openVenn(page, false);
  await setNotes(page, firstTabId, 'first venn note');
  await setNotes(page, secondTabId, 'second venn note');

  await expect.poll(() => readNotes(page, firstTabId)).toBe('first venn note');
  await expect.poll(() => readNotes(page, secondTabId)).toBe('second venn note');
  await expect.poll(() => page.evaluate(({ firstTabId, secondTabId }) => {
    const tabs = window.Main?.session?.workspaceState?.tabs || [];
    const first = tabs.find(tab => tab?.id === firstTabId);
    const second = tabs.find(tab => tab?.id === secondTabId);
    return [first?.payload?.notes?.text, second?.payload?.notes?.text];
  }, { firstTabId, secondTabId })).toEqual(['first venn note', 'second venn note']);
});
