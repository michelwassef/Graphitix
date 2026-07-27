const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

async function waitForClassification(page, expected){
  await page.waitForFunction(value => {
    const payload = window.Components?.roc?.getPayload?.();
    return payload?.config?.positiveClass === value.positiveClass
      && payload?.config?.scoreDirection === value.scoreDirection;
  }, expected, { timeout: 30_000 });
}

test('ROC classification controls are visible, effective, undoable, and warnings are prominent', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'roc', pageId: 'rocPage' }, { first: true });
  await clickExampleButtonIfPresent(page, 'rocLoadExample');

  const root = page.locator('#rocPage:not([hidden])');
  const setup = root.locator('[data-roc-classification-fieldset="1"]');
  await expect(setup).toBeVisible();
  await expect(setup).toContainText('Classification setup');
  await expect(root.locator('#rocPositiveClass option:checked')).toHaveText('1');
  await expect(root.locator('#rocNegativeClass')).toHaveValue('0');
  await expect(root.locator('#rocScoreDirection')).toHaveValue('higher');

  const order = await root.locator('.config-panel').evaluate(panel =>
    Array.from(panel.children).map(node =>
      node.getAttribute('data-graph-selection-fieldset') ? 'graph'
        : node.getAttribute('data-roc-classification-fieldset') ? 'classification'
          : node.getAttribute('data-color-scheme-fieldset') ? 'color'
            : ''
    ).filter(Boolean)
  );
  expect(order.slice(0, 3)).toEqual(['graph', 'classification', 'color']);

  const payloadAfterInput = await root.locator('#rocPositiveClass').evaluate(select => {
    const target = Array.from(select.options).find(option => option.textContent === '0');
    select.value = target.value;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    return window.Components.roc.getPayload();
  });
  expect(payloadAfterInput.config.positiveClass).toBe(0);
  await root.locator('#rocPositiveClass').dispatchEvent('change');
  await root.locator('#rocScoreDirection').selectOption('lower');
  await waitForClassification(page, { positiveClass: 0, scoreDirection: 'lower' });
  await expect(root.locator('#rocStatsResults')).toContainText('Score ≤', { timeout: 30_000 });

  const tabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  expect(tabId).toBeTruthy();
  expect(await page.evaluate(id => window.Shared?.undoManager?.undo?.({ tabId: id }), tabId)).toBe(true);
  await waitForClassification(page, { positiveClass: 0, scoreDirection: 'higher' });

  const warning = root.locator('.roc-auc-direction-warning');
  await expect(warning).toBeVisible({ timeout: 30_000 });
  await expect(warning).toContainText('Check classification setup');
  await expect(warning).toContainText('The curve was not automatically reversed.');
  expect(issues.critical.filter(entry => entry.kind !== 'requestfailed')).toEqual([]);
});
