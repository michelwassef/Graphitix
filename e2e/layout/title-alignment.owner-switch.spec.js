const { test, expect } = require('@playwright/test');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');

test('Line title text and alignment stay with their owner across same-type tab activation', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'line', pageId: 'linePage' }, {
    first: true,
    loadExample: true
  });
  await waitForComponentOwnerReady(page, 'line', {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 45_000
  });
  const firstTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  expect(firstTabId).toBeTruthy();

  const title = page.locator('#linePage:not([hidden]) .svgbox text[data-font-role="graphTitle"]').first();
  await expect(title).toBeVisible();
  const editedText = 'Owner A multiline title\nshort second line';
  await title.dblclick();
  const editor = page.locator('.inline-edit-input').last();
  await editor.fill(editedText);
  const alignRight = page.getByRole('button', { name: 'Align right' });
  await expect(alignRight).toBeEnabled();
  await alignRight.click();
  await expect(alignRight).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.click(3, 3);
  await expect(editor).toBeHidden();
  await waitForComponentOwnerReady(page, 'line', {
    expectedTabId: firstTabId,
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 45_000
  });

  const firstState = await title.evaluate(node => ({
    text: node.dataset.titleBlockText || '',
    alignment: node.dataset.titleTextAlign || null,
    anchors: Array.from(node.querySelectorAll('tspan[data-title-line="1"]'))
      .map(line => line.getAttribute('text-anchor'))
  }));
  expect(firstState).toEqual({
    text: editedText,
    alignment: 'right',
    anchors: ['end', 'end']
  });

  await openComponentFromWelcome(page, { type: 'line', pageId: 'linePage' }, {
    first: false,
    loadExample: false
  });
  const secondTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  expect(secondTabId).toBeTruthy();
  expect(secondTabId).not.toBe(firstTabId);
  await waitForComponentOwnerReady(page, 'line', {
    expectedTabId: secondTabId,
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 45_000
  });

  const secondOwnerText = await page.evaluate(tabId => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(tabId, 'line');
    const node = root?.querySelector?.('text[data-font-role="graphTitle"]');
    return node?.dataset?.titleBlockText || node?.textContent || '';
  }, secondTabId);
  expect(secondOwnerText).not.toBe(editedText);

  await page.evaluate(tabId => window.Main?.tabs?.activateTab?.(tabId, { reason: 'e2e-title-alignment-owner-return' }), firstTabId);
  await waitForComponentOwnerReady(page, 'line', {
    expectedTabId: firstTabId,
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 45_000
  });
  const restoredTitle = page.locator('#linePage:not([hidden]) .svgbox text[data-font-role="graphTitle"]').first();
  await expect.poll(() => restoredTitle.evaluate(node => ({
    text: node.dataset.titleBlockText || '',
    alignment: node.dataset.titleTextAlign || null,
    anchors: Array.from(node.querySelectorAll('tspan[data-title-line="1"]'))
      .map(line => line.getAttribute('text-anchor'))
  }))).toEqual(firstState);

  await restoredTitle.dblclick();
  await expect(page.getByRole('button', { name: 'Align right' })).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.click(3, 3);
  await expect(page.locator('.inline-edit-input')).toBeHidden();
});
