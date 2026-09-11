const { test, expect } = require('@playwright/test');
const { openComponentFromWelcome } = require('./helpers/workspaceDriver');
const { clickExampleButton } = require('./helpers/uiDriver');
const { waitForComponentOwnerReady } = require('./helpers/contractWaits');
const { installLocalCdnOverrides } = require('./helpers/vendorOverrides');
const { registerIssueCollectors } = require('./helpers/diagnostics');

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

async function waitForToolbarSection(page, label) {
  await page.waitForFunction(expectedLabel => {
    const toolbar = document.querySelector('#scatterPage:not([hidden]) .workspace-toolbar');
    const active = toolbar?.querySelector?.('.workspace-toolbar__tab[data-toolbar-section-target][aria-selected="true"]');
    return String(active?.textContent || '').trim().toLowerCase() === String(expectedLabel || '').trim().toLowerCase();
  }, label, { timeout: 20_000, polling: 'raf' });
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
  await clickExampleButton(page, { type: 'scatter', pageId: 'scatterPage', exampleButtonId: 'scatterLoadExample' });
  await page.waitForFunction(() => !!document.querySelector('#scatterPlot svg text[data-font-editable="1"]'));

  const dataCell = page.locator('#scatterPage:not([hidden]) .ag-center-cols-container .ag-cell').first();
  await expect(dataCell).toBeVisible({ timeout: 20_000 });
  await dataCell.click();
  await waitForToolbarSection(page, 'Data');
  await waitForComponentOwnerReady(page, { type: 'scatter', pageId: 'scatterPage' }, { requireIdle: true });

  const afterData = await page.evaluate(snapshotToolbarState);

  const editableText = page.locator('#scatterPlot svg text[data-font-editable="1"]').first();
  await editableText.click({ force: true });
  await page.waitForFunction(() => {
    const toolbar = document.querySelector('#scatterPage:not([hidden]) .workspace-toolbar');
    return !!toolbar?.dataset?.toolbarContextSection;
  }, null, { timeout: 20_000, polling: 'raf' });

  const before = await page.evaluate(snapshotToolbarState);

  const generalTab = page.locator('#scatterPage:not([hidden]) .workspace-toolbar__tab', { hasText: 'General' }).first();
  await expect(generalTab).toBeVisible();
  await generalTab.click();
  await waitForToolbarSection(page, 'General');

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

test('scatter: Data -> click empty page area must return to General', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();

  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage', exampleButtonId: 'scatterLoadExample' }, { first: true });
  await clickExampleButton(page, { type: 'scatter', pageId: 'scatterPage', exampleButtonId: 'scatterLoadExample' });

  const dataCell = page.locator('#scatterPage:not([hidden]) .ag-center-cols-container .ag-cell').first();
  await expect(dataCell).toBeVisible({ timeout: 20_000 });
  await dataCell.click();
  await waitForToolbarSection(page, 'Data');
  await waitForComponentOwnerReady(page, { type: 'scatter', pageId: 'scatterPage' }, { requireIdle: true });

  const afterData = await page.evaluate(snapshotToolbarState);

  const graphPanel = page.locator('#scatterPage:not([hidden]) #scatterGraphPanel').first();
  await expect(graphPanel).toBeVisible({ timeout: 20_000 });
  await graphPanel.click();
  await waitForToolbarSection(page, 'General');

  const afterBlankClick = await page.evaluate(snapshotToolbarState);
  await testInfo.attach('toolbar-general-fallback.after-data.json', {
    body: Buffer.from(JSON.stringify(afterData, null, 2), 'utf8'),
    contentType: 'application/json'
  });
  await testInfo.attach('toolbar-general-fallback.after-blank-click.json', {
    body: Buffer.from(JSON.stringify(afterBlankClick, null, 2), 'utf8'),
    contentType: 'application/json'
  });

  expect(afterData.activeTab?.label).toBe('Data');
  expect(afterBlankClick.activeTab?.label).toBe('General');
  expect(issues.critical).toEqual([]);
});
