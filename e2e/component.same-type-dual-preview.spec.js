const { test, expect } = require('@playwright/test');
const {
  COMPONENT_MATRIX,
  installLocalCdnOverrides,
  registerIssueCollectors,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

async function getWorkspaceTabIds(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]'))
      .map(tab => String(tab.getAttribute('data-tab-id') || '').trim())
      .filter(id => id)
  );
}

async function openComponentTab(page, component, { first = false } = {}) {
  if (first) {
    const card = page.locator(`#graphSelectionGrid [data-graph-type="${component.type}"]`).first();
    await expect(card).toBeVisible();
    await card.click({ force: true });
    await page.waitForSelector(`#${component.pageId}:not([hidden])`, { timeout: 20_000 });
    return;
  }
  await page.evaluate(async (type) => {
    const tabs = window.Main?.tabs;
    if (tabs && typeof tabs.handleAddTabClick === 'function') {
      const maybe = tabs.handleAddTabClick();
      if (maybe && typeof maybe.then === 'function') await maybe;
    }
    if (tabs && typeof tabs.handleGraphSelection === 'function') {
      const maybe = tabs.handleGraphSelection(type, { reason: 'e2e-same-type-dual-preview' });
      if (maybe && typeof maybe.then === 'function') await maybe;
    }
    const prompt = document.querySelector('#duplicatePrompt:not([hidden])');
    const duplicateEmpty = document.querySelector('#duplicateEmpty');
    if (prompt && duplicateEmpty && !duplicateEmpty.disabled) {
      duplicateEmpty.click();
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }, component.type);
  const visibleCard = page.locator(`#graphSelectionGrid [data-graph-type="${component.type}"]`).first();
  if (await visibleCard.isVisible().catch(() => false)) {
    await visibleCard.click({ force: true });
  }
  await page.waitForSelector(`#${component.pageId}:not([hidden])`, { timeout: 20_000 });
}

async function activateTabById(page, tabId) {
  const tab = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).first();
  await expect(tab).toBeVisible();
  await tab.click({ force: true });
  await page.waitForTimeout(350);
}

async function activateSelectionTab(page) {
  const selectionTabId = await page.evaluate(async () => {
    const tabs = window.Main?.tabs;
    if (tabs && typeof tabs.handleAddTabClick === 'function') {
      const maybe = tabs.handleAddTabClick();
      if (maybe && typeof maybe.then === 'function') await maybe;
    }
    return window.Main?.session?.workspaceState?.activeTabId || null;
  });
  if (selectionTabId) {
    await activateTabById(page, selectionTabId);
  }
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
}

async function forcePreviewCaptureForActiveTab(page) {
  return page.evaluate(() => {
    const state = window.Main?.session?.workspaceState;
    const tab = state?.tabs?.find(item => item?.id === state?.activeTabId);
    const config = tab?.type ? window.Main?.components?.registry?.[tab.type] : null;
    if (!tab || !config || typeof window.Main?.previews?.updateTabPreviewFromWorkspace !== 'function') {
      return { ok: false };
    }
    window.Main.previews.updateTabPreviewFromWorkspace(tab, config, {
      forceCapture: true,
      reason: 'e2e-same-type-dual-preview'
    });
    return {
      ok: true,
      tabId: tab.id,
      hasPreview: !!tab.previewMarkup,
      signature: tab.previewSignature || null
    };
  });
}

async function ensurePreviewForActiveTab(page) {
  let last = { ok: false, hasPreview: false, tabId: null, signature: null };
  for (let attempt = 0; attempt < 6; attempt += 1) {
    last = await forcePreviewCaptureForActiveTab(page);
    if (last.ok && last.hasPreview) {
      return last;
    }
    await page.waitForTimeout(350 + attempt * 120);
  }
  return last;
}

async function hoverAndAssertPreview(page, tabId) {
  const tabButton = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).first();
  await expect(tabButton).toBeVisible();
  await tabButton.scrollIntoViewIfNeeded();
  await page.evaluate((targetId) => {
    const button = document.querySelector(`#workspaceTabsList .workspace-tab[data-tab-id="${targetId}"]`);
    const tab = window.Main?.session?.workspaceState?.tabs?.find(item => item?.id === targetId) || null;
    if (!button || !tab || typeof window.Main?.previews?.handleTabPreviewEnter !== 'function') {
      return false;
    }
    window.Main.previews.handleTabPreviewEnter({ currentTarget: button, target: button }, tab);
    return true;
  }, tabId);
  await page.waitForFunction((targetId) => {
    const tooltip = document.querySelector('.workspace-tab__preview-tooltip');
    const hasRenderableContent = !!tooltip?.querySelector?.('svg')
      || String(tooltip?.innerHTML || '').trim().length > 0;
    return !!tooltip
      && tooltip.dataset.tabId === targetId
      && tooltip.style.display !== 'none'
      && hasRenderableContent;
  }, tabId, { timeout: 20_000 });
}

const COMPONENTS_WITH_DUAL_PREVIEW_COVERAGE = COMPONENT_MATRIX
  .filter(component => component.type !== 'surface');

for (const component of COMPONENTS_WITH_DUAL_PREVIEW_COVERAGE) {
  test(`inactive preview works for both same-type tabs: ${component.type}`, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);

    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible();

    const beforeFirst = new Set(await getWorkspaceTabIds(page));
    await openComponentTab(page, component, { first: true });
    await clickExampleButtonIfPresent(page, component.exampleButtonId);
    await page.waitForTimeout(350);
    const afterFirst = await getWorkspaceTabIds(page);
    const firstId = afterFirst.find(id => !beforeFirst.has(id) && id !== 'welcome');
    expect(firstId).toBeTruthy();

    const beforeSecond = new Set(afterFirst);
    await openComponentTab(page, component, { first: false });
    await clickExampleButtonIfPresent(page, component.exampleButtonId);
    await page.waitForTimeout(350);
    const afterSecond = await getWorkspaceTabIds(page);
    const secondId = afterSecond.find(id => !beforeSecond.has(id) && id !== 'welcome');
    expect(secondId).toBeTruthy();
    expect(secondId).not.toBe(firstId);

    await activateTabById(page, secondId);
    const secondCapture = await ensurePreviewForActiveTab(page);
    expect(secondCapture.ok).toBe(true);
    expect(secondCapture.tabId).toBe(secondId);

    await activateTabById(page, firstId);
    const firstCapture = await ensurePreviewForActiveTab(page);
    expect(firstCapture.ok).toBe(true);
    expect(firstCapture.tabId).toBe(firstId);

    await activateSelectionTab(page);

    await hoverAndAssertPreview(page, firstId);
    await page.evaluate(() => {
      if (typeof window.Main?.previews?.handleTabPreviewLeave === 'function') {
        window.Main.previews.handleTabPreviewLeave('e2e-switch-target');
      }
    });
    await page.waitForTimeout(120);
    await hoverAndAssertPreview(page, secondId);

    await testInfo.attach(`${component.type}-dual-preview.json`, {
      body: Buffer.from(JSON.stringify({
        firstId,
        secondId,
        firstCapture,
        secondCapture
      }, null, 2), 'utf8'),
      contentType: 'application/json'
    });

    const ignoredVennAbort = issue => component.type === 'venn'
      && issue?.kind === 'requestfailed'
      && /mygene\.info/i.test(String(issue?.text || ''))
      && /NS_BINDING_ABORTED/i.test(String(issue?.text || ''));
    expect((issues.critical || []).filter(issue => !ignoredVennAbort(issue))).toEqual([]);
  });
}
