const { test, expect } = require('@playwright/test');
const { COMPONENT_MATRIX, openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { buildWorkspaceArchive, openWorkspaceArchiveBuffer, parseWorkspaceArchive } = require('../helpers/archiveDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');

test.setTimeout(150_000);

const AXIS_COMPONENTS = COMPONENT_MATRIX
  .filter(component => component.type !== 'heatmap')
  .map(component => ({
    ...component,
    axisSelector: '[data-font-role="yTitle"], [data-pca-axis-title-override-key], [data-roc-axis-title-key], [data-pie-axis-title-key], [data-upset-axis-title-key]',
    selects: component.type === 'venn'
      ? { vennPlotType: 'upset' }
      : (component.type === 'pie' ? { pieChartType: 'stacked' } : {})
  }));

for(const component of COMPONENT_MATRIX){
  test(component.type + ' graph-title draft survives archive capture while its editor stays open', async ({ page }) => {
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });
    await waitForComponentOwnerReady(page, component.type, {
      requireMountedRoot: true,
      requireIdle: true,
      timeout: 60_000
    });

    const selector = '#' + component.pageId + ':not([hidden]) .svgbox svg text[data-font-role=\"graphTitle\"]';
    const target = page.locator(selector).first();
    await expect(target, component.type + ' graph title').toBeVisible();
    await target.dblclick();
    const editor = page.locator('.inline-edit-input').last();
    await expect(editor).toBeVisible();
    const draft = 'Draft ' + component.type + '\nsecond line';
    await editor.fill(draft);
    await expect(editor).toHaveValue(draft);
    const archive = await buildWorkspaceArchive(page);
    await expect(editor, 'archive capture must leave editing usable').toBeVisible();
    await expect(editor).toHaveValue(draft);
    const parsed = await parseWorkspaceArchive(page, archive.base64, component.type + '-title-draft.graph');
    const savedTab = (parsed.session?.tabs || []).find(tab => tab?.type === component.type);
    expect(savedTab, component.type + ' archive payload tab').toBeTruthy();
    expect(
      JSON.stringify(savedTab.payload).includes(draft.replace(/\n/g, '\\n')),
      component.type + ' canonical payload must contain the in-progress title'
    ).toBe(true);
    await openWorkspaceArchiveBuffer(page, Buffer.from(archive.base64, 'base64'), {
      componentType: component.type,
      fileName: component.type + '-title-draft.graph'
    });
    await waitForComponentOwnerReady(page, component.type, {
      requireMountedRoot: true,
      requireIdle: true,
      timeout: 60_000
    });

    const restored = page.locator(selector).first();
    await expect(restored, component.type + ' restored graph title remains visible').toBeVisible();
    await expect.poll(() => restored.evaluate(node => node?.dataset?.titleBlockText || node?.textContent || ''))
      .toBe(draft);
    await expect(restored.locator('tspan[data-title-line=\"1\"]')).toHaveCount(2);
  });
}

for(const component of AXIS_COMPONENTS){
  test(component.type + ' axis-title draft survives archive capture while its editor stays open', async ({ page }) => {
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });
    await waitForComponentOwnerReady(page, component.type, {
      requireMountedRoot: true,
      requireIdle: true,
      timeout: 60_000
    });
    for(const [id, value] of Object.entries(component.selects)){
      await page.locator('#' + component.pageId + ':not([hidden]) #' + id).selectOption(value);
      await waitForComponentOwnerReady(page, component.type, {
        requireMountedRoot: true,
        requireIdle: true,
        timeout: 60_000
      });
    }

    const selector = '#' + component.pageId + ':not([hidden]) .svgbox svg ' + component.axisSelector;
    const target = page.locator(selector).first();
    await expect(target, component.type + ' Y axis title').toBeVisible();
    await target.dblclick();
    const editor = page.locator('.inline-edit-input').last();
    await expect(editor).toBeVisible();
    const draft = 'Axis draft ' + component.type + '\nsecond line';
    await editor.fill(draft);
    await expect(editor).toHaveValue(draft);
    const archive = await buildWorkspaceArchive(page);
    await expect(editor, 'axis archive capture must leave editing usable').toBeVisible();
    await expect(editor).toHaveValue(draft);
    const parsed = await parseWorkspaceArchive(page, archive.base64, component.type + '-axis-title-draft.graph');
    const savedTab = (parsed.session?.tabs || []).find(tab => tab?.type === component.type);
    expect(savedTab, component.type + ' archive payload tab').toBeTruthy();
    expect(
      JSON.stringify(savedTab.payload).includes(draft.replace(/\n/g, '\\n')),
      component.type + ' canonical payload must contain the in-progress axis title'
    ).toBe(true);
    await openWorkspaceArchiveBuffer(page, Buffer.from(archive.base64, 'base64'), {
      componentType: component.type,
      fileName: component.type + '-axis-title-draft.graph'
    });
    await waitForComponentOwnerReady(page, component.type, {
      requireMountedRoot: true,
      requireIdle: true,
      timeout: 60_000
    });

    const restored = page.locator(selector).first();
    await expect(restored, component.type + ' restored axis title remains visible').toBeVisible();
    await expect.poll(() => restored.evaluate(node => node?.dataset?.titleBlockText || node?.textContent || ''))
      .toBe(draft);
    await expect(restored.locator('tspan[data-title-line="1"]')).toHaveCount(2);
  });
}

test('keyboard tab activation checkpoints an open graph-title draft to its original owner', async ({ page }) => {
  const component = COMPONENT_MATRIX.find(entry => entry.type === 'line');
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, component, { first: true, loadExample: true });
  await waitForComponentOwnerReady(page, component.type, {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 60_000
  });
  await openComponentFromWelcome(page, component, { loadExample: true });
  await waitForComponentOwnerReady(page, component.type, {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 60_000
  });

  const tabIds = await page.evaluate(() => {
    const tabs = window.Main?.session?.workspaceState?.tabs || [];
    return tabs.filter(tab => tab?.type === 'line').map(tab => String(tab.id));
  });
  expect(tabIds).toHaveLength(2);
  const [ownerTabId, otherTabId] = tabIds;
  const ownerTab = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${ownerTabId}"]`);
  const otherTab = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${otherTabId}"]`);
  await ownerTab.click();
  await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, ownerTabId);

  const title = page.locator('#linePage:not([hidden]) #lineSvg text[data-font-role="graphTitle"]').first();
  await expect(title).toBeVisible();
  await title.dblclick();
  const editor = page.locator('.inline-edit-input').last();
  await expect(editor).toBeVisible();
  const draft = 'Keyboard owner draft\nsecond line';
  await editor.fill(draft);

  await otherTab.focus();
  await expect(editor, 'moving keyboard focus must not end title editing').toBeVisible();
  await expect(editor).toHaveValue(draft);
  await page.keyboard.press('Enter');
  await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, otherTabId);
  await waitForComponentOwnerReady(page, component.type, {
    expectedTabId: otherTabId,
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 60_000
  });
  await expect(editor).toBeHidden();

  const archive = await buildWorkspaceArchive(page);
  const parsed = await parseWorkspaceArchive(page, archive.base64, 'line-keyboard-title-owner.graph');
  const savedOwner = parsed.session?.tabs?.find(tab => tab?.archiveRuntimeTabId === ownerTabId);
  const savedOther = parsed.session?.tabs?.find(tab => tab?.archiveRuntimeTabId === otherTabId);
  expect(savedOwner).toBeTruthy();
  expect(savedOther).toBeTruthy();
  expect(JSON.stringify(savedOwner.payload).includes(draft.replace(/\n/g, '\\n'))).toBe(true);
  expect(JSON.stringify(savedOther.payload).includes(draft.replace(/\n/g, '\\n'))).toBe(false);

  await ownerTab.click();
  await waitForComponentOwnerReady(page, component.type, {
    expectedTabId: ownerTabId,
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 60_000
  });
  const restoredTitle = page.locator('#linePage:not([hidden]) #lineSvg text[data-font-role="graphTitle"]').first();
  await expect(restoredTitle).toBeVisible();
  await expect.poll(() => restoredTitle.evaluate(node => node?.dataset?.titleBlockText || node?.textContent || ''))
    .toBe(draft);
});

test('saving an empty graph-title draft restores and hides it without closing the editor', async ({ page }) => {
  const component = COMPONENT_MATRIX.find(entry => entry.type === 'line');
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, component, { first: true, loadExample: true });
  await waitForComponentOwnerReady(page, component.type, {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 60_000
  });

  const title = page.locator('#linePage:not([hidden]) #lineSvg text[data-font-role="graphTitle"]').first();
  const initial = await title.evaluate(node => node?.dataset?.titleBlockText || node?.textContent || '');
  expect(initial.trim()).not.toBe('');
  await title.dblclick();
  const editor = page.locator('.inline-edit-input').last();
  await expect(editor).toBeVisible();
  await editor.fill('  \n');

  const archive = await buildWorkspaceArchive(page);
  await expect(editor, 'snapshot normalization must keep the title editor open').toBeVisible();
  await expect(editor).toHaveValue(initial);
  const parsed = await parseWorkspaceArchive(page, archive.base64, 'line-empty-title-normalized.graph');
  const savedTab = parsed.session?.tabs?.find(tab => tab?.type === 'line');
  expect(savedTab?.payload?.config?.title).toBe(initial);
  expect(savedTab?.payload?.config?.fontStyles?.graphTitle?.hidden).toBe(true);

  await editor.fill('\n  ');
  const repeatedArchive = await buildWorkspaceArchive(page);
  await expect(editor).toBeVisible();
  await expect(editor).toHaveValue(initial);
  const repeatedParsed = await parseWorkspaceArchive(page, repeatedArchive.base64, 'line-empty-title-normalized-again.graph');
  const repeatedTab = repeatedParsed.session?.tabs?.find(tab => tab?.type === 'line');
  expect(repeatedTab?.payload?.config?.title).toBe(initial);
  expect(repeatedTab?.payload?.config?.fontStyles?.graphTitle?.hidden).toBe(true);

  await editor.fill(`${initial}\nContinued after save`);
  await expect(editor).toHaveValue(`${initial}\nContinued after save`);
  await page.mouse.click(3, 3);
  await expect(editor).toBeHidden();
  await expect.poll(() => page.locator('#linePage:not([hidden]) #lineSvg text[data-font-role="graphTitle"]')
    .first().evaluate(node => node?.dataset?.titleBlockText || node?.textContent || ''))
    .toBe(`${initial}\nContinued after save`);
  await expect(title).toBeVisible();

  await openWorkspaceArchiveBuffer(page, Buffer.from(archive.base64, 'base64'), {
    componentType: 'line',
    fileName: 'line-empty-title-normalized.graph'
  });
  await waitForComponentOwnerReady(page, component.type, {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 60_000
  });
  const restoredTitle = page.locator('#linePage:not([hidden]) #lineSvg text[data-font-role="graphTitle"]').first();
  await expect(restoredTitle).toBeHidden();
  await expect.poll(() => restoredTitle.evaluate(node => node?.dataset?.titleBlockText || node?.textContent || ''))
    .toBe(initial);
});
