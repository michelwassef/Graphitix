const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

function isLifecycleRegression(entry) {
  const text = String(entry?.text || '');
  return /Grid API function .* cannot be called as the grid has been destroyed/i.test(text)
    || /workspace-post-restore-fallback-failed/i.test(text);
}

async function duplicateBoxWithReuse(page) {
  await page.evaluate(async () => {
    const tabs = window.Main?.tabs;
    const add = tabs?.handleAddTabClick?.();
    if (add && typeof add.then === 'function') await add;
    const select = tabs?.handleGraphSelection?.('box', { reason: 'e2e-empty-grouped-box-duplicate' });
    if (select && typeof select.then === 'function') await select;
  });
  await expect(page.locator('#duplicatePrompt:not([hidden])')).toBeVisible({ timeout: 20_000 });
  await page.locator('#duplicateReuse').click({ force: true });
  await page.waitForSelector('#boxPage:not([hidden])', { timeout: 20_000 });
}

test('empty grouped Box duplicate switches components without stale grid refresh or graph activation error', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  const boxPage = page.locator('#boxPage:not([hidden])');
  await boxPage.locator('#boxTableFormat').selectOption('grouped');
  await boxPage.locator('#boxLoadExample').click();
  await duplicateBoxWithReuse(page);

  const duplicateTabId = await page.evaluate(() => {
    const state = window.Main?.session?.workspaceState;
    return state?.activeTabId || null;
  });
  expect(duplicateTabId).toBeTruthy();

  await page.evaluate(tabId => {
    const pool = window.Shared?.hot?.__tabTablePools?.box;
    const hot = pool?.byTab?.[tabId]?.instance || null;
    if (!hot || typeof hot.getData !== 'function' || typeof hot.setDataAtCell !== 'function') {
      throw new Error('Box table unavailable');
    }
    const data = hot.getData() || [];
    const changes = [];
    for (let row = 2; row < data.length; row += 1) {
      for (let col = 0; col < (data[row]?.length || 0); col += 1) {
        if (data[row][col] != null && String(data[row][col]).trim() !== '') changes.push([row, col, '']);
      }
    }
    hot.setDataAtCell(changes, 'edit');
  }, duplicateTabId);

  await page.waitForFunction(tabId => {
    const tab = window.Main?.session?.workspaceState?.tabs?.find(item => item?.id === tabId);
    const rows = Array.isArray(tab?.payload?.data) ? tab.payload.data.slice(2) : [];
    return rows.every(row => !Array.isArray(row) || row.every(value => value == null || String(value).trim() === ''));
  }, duplicateTabId, { timeout: 20_000 });

  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: false });
  await page.waitForTimeout(500);
  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${duplicateTabId}"]`).click();
  await page.waitForSelector('#boxPage:not([hidden])', { timeout: 20_000 });
  await page.waitForTimeout(500);

  const duplicateState = await page.evaluate(tabId => {
    const tab = window.Main?.session?.workspaceState?.tabs?.find(item => item?.id === tabId);
    return { activationError: tab?.activationError || null };
  }, duplicateTabId);

  expect(duplicateState.activationError).toBeNull();
  expect(issues.all.filter(isLifecycleRegression)).toEqual([]);
  expect(issues.critical).toEqual([]);
});

test('Box example reload preserves grouped replicates table ownership and headers', async ({ page }) => {
  test.setTimeout(90_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  const boxPage = page.locator('#boxPage:not([hidden])');
  await boxPage.locator('#boxLoadExample').click();
  await page.waitForFunction(() => {
    const state = window.Main?.session?.workspaceState;
    const tab = state?.tabs?.find(item => item?.id === state.activeTabId);
    return tab?.payload?.data?.[0]?.[0] === 'VC 0.5 mg';
  });

  await boxPage.locator('#boxTableFormat').selectOption('grouped');
  await boxPage.locator('#boxLoadExample').click();
  await page.waitForFunction(() => {
    const state = window.Main?.session?.workspaceState;
    const tab = state?.tabs?.find(item => item?.id === state.activeTabId);
    return tab?.payload?.data?.[0]?.[0] === 'Ascorbic acid'
      && tab?.payload?.data?.[1]?.[0] === '0.5 mg/day';
  });

  const snapshot = await page.evaluate(() => {
    const workspace = window.Main?.session?.workspaceState;
    const tab = workspace?.tabs?.find(item => item?.id === workspace.activeTabId) || null;
    const pool = window.Shared?.hot?.__tabTablePools?.box;
    const hot = tab?.id ? pool?.byTab?.[tab.id]?.instance || null : null;
    const runtime = window.Components?.box?.captureRuntimeState?.({ tabId: tab?.id, reason: 'e2e-box-grouped-example' }) || null;
    const data = hot?.getData?.() || [];
    return {
      controlFormat: document.querySelector('#boxPage:not([hidden]) #boxTableFormat')?.value || null,
      payloadFormat: tab?.payload?.config?.tableFormat || null,
      componentPayloadFormat: window.Components?.box?.getPayload?.()?.config?.tableFormat || null,
      runtimeFormat: runtime?.ownedRuntime?.controls?.tableFormat || null,
      hotFormat: hot?.__boxTableFormat || null,
      destroyed: hot?.gridApi?.isDestroyed?.() === true,
      row0: (data[0] || []).slice(0, 12),
      row1: (data[1] || []).slice(0, 12),
      trailingHeaders: [data[0] || [], data[1] || []].flatMap(row => row.slice(6, 12))
        .filter(value => value != null && String(value).trim() !== ''),
      trailingValues: data.slice(2).flatMap(row => (row || []).slice(6, 12))
        .filter(value => value != null && String(value).trim() !== ''),
      groupedClass: !!hot?.rootElement?.classList?.contains('box-grouped-header-merge')
    };
  });

  expect(snapshot).toMatchObject({
    controlFormat: 'grouped',
    payloadFormat: 'grouped',
    componentPayloadFormat: 'grouped',
    runtimeFormat: 'grouped',
    hotFormat: 'grouped',
    destroyed: false,
    groupedClass: true
  });
  expect(snapshot.row0.slice(0, 6)).toEqual(['Ascorbic acid', '', '', 'Orange juice', '', '']);
  expect(snapshot.row1.slice(0, 6)).toEqual([
    '0.5 mg/day', '1.0 mg/day', '2.0 mg/day',
    '0.5 mg/day', '1.0 mg/day', '2.0 mg/day'
  ]);
  expect(snapshot.trailingHeaders).toEqual([]);
  expect(snapshot.trailingValues).toEqual([]);
  expect(issues.critical).toEqual([]);
});

test('Box preview follows populated, empty, and repopulated graph state', async ({ page }) => {
  test.setTimeout(90_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  await page.locator('#boxPage:not([hidden]) #boxTableFormat').selectOption('grouped');
  await page.locator('#boxPage:not([hidden]) #boxLoadExample').click();
  const boxTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  expect(boxTabId).toBeTruthy();
  await page.waitForFunction(() => {
    const svg = document.querySelector('#boxPage:not([hidden]) #boxPlot svg');
    return !!svg?.querySelector('path, circle, rect, line');
  });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: false });
  const scatterTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  const boxTabButton = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${boxTabId}"]`);
  const tooltip = page.locator('.workspace-tab__preview-tooltip');

  await boxTabButton.hover();
  await expect(tooltip).toBeVisible();
  await expect(tooltip.locator('svg, img[data-tab-preview-format="png"]')).toHaveCount(1);
  await expect(boxTabButton).toHaveAttribute('data-has-preview', 'true');

  await boxTabButton.click();
  await page.waitForSelector('#boxPage:not([hidden])');
  await page.evaluate(tabId => {
    const hot = window.Shared?.hot?.__tabTablePools?.box?.byTab?.[tabId]?.instance || null;
    const data = hot?.getData?.() || [];
    const changes = [];
    for (let row = 1; row < data.length; row += 1) {
      for (let col = 0; col < (data[row]?.length || 0); col += 1) {
        if (data[row][col] != null && String(data[row][col]).trim() !== '') changes.push([row, col, '']);
      }
    }
    hot?.setDataAtCell?.(changes, 'edit');
  }, boxTabId);
  await page.waitForFunction(tabId => {
    const tab = window.Main?.session?.workspaceState?.tabs?.find(item => item?.id === tabId);
    return (tab?.payload?.data || []).slice(1).every(row =>
      !Array.isArray(row) || row.every(value => value == null || String(value).trim() === '')
    );
  }, boxTabId);

  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${scatterTabId}"]`).click();
  await page.waitForFunction(tabId => {
    const tab = window.Main?.session?.workspaceState?.tabs?.find(item => item?.id === tabId);
    return !tab?.previewMarkup && !tab?.previewMeta && !tab?.previewSignature;
  }, boxTabId);

  await expect(boxTabButton).not.toHaveAttribute('data-has-preview', 'true');
  await boxTabButton.hover();
  await expect(tooltip).not.toBeVisible();

  await boxTabButton.click();
  await page.waitForSelector('#boxPage:not([hidden])');
  await page.getByRole('tab', { name: 'General', exact: true }).click();
  await page.locator('#boxPage:not([hidden]) #boxLoadExample').click();
  await page.waitForFunction(tabId => {
    const tab = window.Main?.session?.workspaceState?.tabs?.find(item => item?.id === tabId);
    return tab?.payload?.config?.tableFormat === 'grouped'
      && (tab?.payload?.data || []).slice(2).some(row =>
      Array.isArray(row) && row.some(value => Number.isFinite(Number(value)) && String(value).trim() !== '')
      );
  }, boxTabId);

  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${scatterTabId}"]`).click();
  await boxTabButton.hover();
  await expect(tooltip).toBeVisible();
  await expect(tooltip.locator('svg, img[data-tab-preview-format="png"]')).toHaveCount(1);
  await expect(boxTabButton).toHaveAttribute('data-has-preview', 'true');
  expect(issues.critical).toEqual([]);
});
