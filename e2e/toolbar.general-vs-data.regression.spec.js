const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

function snapshotToolbarState() {
  const toolbar = document.querySelector('#scatterPage:not([hidden]) .workspace-toolbar');
  if (!toolbar) {
    return { hasToolbar: false };
  }
  const tabs = Array.from(toolbar.querySelectorAll('.workspace-toolbar__tab[data-toolbar-section-target]')).map(tab => ({
    label: String(tab.textContent || '').trim(),
    target: tab.dataset.toolbarSectionTarget || '',
    active: tab.classList.contains('workspace-toolbar__tab--active')
  }));
  const activeTab = tabs.find(tab => tab.active) || null;
  const visibleHost = toolbar.querySelector('.font-toolbar-host.font-toolbar-host--visible');
  const visibleHostSection = visibleHost?.closest?.('.workspace-toolbar__section[data-toolbar-section-id]')?.dataset?.toolbarSectionId || null;
  return {
    hasToolbar: true,
    dataset: {
      active: toolbar.dataset.toolbarActiveSection || '',
      manual: toolbar.dataset.toolbarManualSection || '',
      context: toolbar.dataset.toolbarContextSection || '',
      suppressed: toolbar.dataset.toolbarContextSuppressed || ''
    },
    activeTab,
    tabs,
    visibleHostSection
  };
}

test('scatter: Data -> Format -> General must stay on General', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    if (/workspaceToolbar|fontControls|control-click|tab user modification|tab data inspection skipped|toolbar/i.test(text)) {
      logs.push({ type: msg.type(), text });
    }
  });

  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();

  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage', exampleButtonId: 'scatterLoadExample' }, { first: true });
  await clickExampleButtonIfPresent(page, 'scatterLoadExample');
  await page.waitForFunction(() => !!document.querySelector('#scatterPlot svg text[data-font-editable="1"]'));

  await page.evaluate(() => {
    const cell = document.querySelector('#scatterPage:not([hidden]) .ag-center-cols-container .ag-cell');
    if (!cell) {
      return false;
    }
    cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    cell.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    cell.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  });
  await page.waitForTimeout(300);

  const afterData = await page.evaluate(snapshotToolbarState);

  const editableText = page.locator('#scatterPlot svg text[data-font-editable="1"]').first();
  await editableText.click({ force: true });
  await page.waitForTimeout(350);

  const before = await page.evaluate(snapshotToolbarState);

  const generalTab = page.locator('#scatterPage:not([hidden]) .workspace-toolbar__tab', { hasText: 'General' }).first();
  await expect(generalTab).toBeVisible();
  await generalTab.click({ force: true });
  await page.waitForTimeout(500);

  const after = await page.evaluate(snapshotToolbarState);
  await testInfo.attach('toolbar-general-vs-data.before.json', {
    body: Buffer.from(JSON.stringify(before, null, 2), 'utf8'),
    contentType: 'application/json'
  });
  await testInfo.attach('toolbar-general-vs-data.after-data.json', {
    body: Buffer.from(JSON.stringify(afterData, null, 2), 'utf8'),
    contentType: 'application/json'
  });
  await testInfo.attach('toolbar-general-vs-data.after.json', {
    body: Buffer.from(JSON.stringify(after, null, 2), 'utf8'),
    contentType: 'application/json'
  });
  await testInfo.attach('toolbar-general-vs-data.logs.json', {
    body: Buffer.from(JSON.stringify(logs.slice(-400), null, 2), 'utf8'),
    contentType: 'application/json'
  });

  expect(after.hasToolbar).toBe(true);
  expect(afterData.hasToolbar).toBe(true);
  expect(after.activeTab?.label).toBe('General');
  expect(after.dataset.active).toBe(after.activeTab?.target || after.dataset.active);
  expect(issues.critical).toEqual([]);
});
