const { test, expect } = require('@playwright/test');
const {
  COMPONENT_MATRIX,
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

const NON_CANVAS_COMPONENTS = COMPONENT_MATRIX
  .filter(component => component.type !== 'box' && component.type !== 'scatter');

async function activateWelcomeTab(page) {
  await page.evaluate(() => {
    const welcome = window.Main?.session?.workspaceState?.tabs?.find(tab => tab?.isWelcome);
    if (welcome && typeof window.Main?.tabs?.activateTab === 'function') {
      window.Main.tabs.activateTab(welcome.id, { reason: 'e2e-non-canvas-preview' });
    }
  });
  await page.waitForFunction(() => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId);
    return !!active?.isWelcome;
  }, null, { timeout: 20000 });
}

async function captureActivePreview(page) {
  return page.evaluate(() => {
    const state = window.Main?.session?.workspaceState;
    const tab = state?.tabs?.find(item => item?.id === state.activeTabId);
    const config = tab?.type ? window.Main?.components?.registry?.[tab.type] : null;
    if (!tab || !config || typeof window.Main?.previews?.updateTabPreviewFromWorkspace !== 'function') {
      return null;
    }
    window.Main.previews.updateTabPreviewFromWorkspace(tab, config, {
      forceCapture: true,
      reason: 'e2e-non-canvas-preview'
    });
    return {
      tabId: tab.id,
      type: tab.type,
      markup: tab.previewMarkup || '',
      meta: tab.previewMeta || null
    };
  });
}

async function captureActivePreviewWithRetry(page, expectedType) {
  let preview = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    preview = await captureActivePreview(page);
    if (
      preview
      && preview.type === expectedType
      && typeof preview.markup === 'string'
      && preview.markup.includes('<svg')
      && !preview.markup.includes('Preparing preview')
    ) {
      return preview;
    }
    await page.waitForTimeout(250 + (attempt * 120));
  }
  return preview;
}

test.describe('Non-canvas tab previews', () => {
  for (const component of NON_CANVAS_COMPONENTS) {
    test(`${component.type} example keeps a usable tab preview`, async ({ page }) => {
      test.setTimeout(180000);
      await installLocalCdnOverrides(page);
      await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

      await openComponentFromWelcome(page, component, { first: true });
      await clickExampleButtonIfPresent(page, component.exampleButtonId);
      await page.waitForTimeout(700);

      const preview = await captureActivePreviewWithRetry(page, component.type);
      expect(preview, `${component.type} should return preview metadata`).toBeTruthy();
      expect(preview.type).toBe(component.type);
      expect(preview.markup).toContain('<svg');
      expect(preview.markup).not.toContain('data-preview-canvas-simplified');
      expect(preview.markup).not.toContain('data-preview-placeholder');
      expect(preview.markup).not.toContain('Preparing preview');

      await activateWelcomeTab(page);
      await page.locator(`button.workspace-tab[data-tab-id="${preview.tabId}"]`).hover();
      await page.waitForFunction(tabId => {
        const tooltip = document.querySelector('.workspace-tab__preview-tooltip');
        return !!tooltip
          && tooltip.dataset.tabId === tabId
          && tooltip.style.display !== 'none'
          && !!tooltip.querySelector('svg');
      }, preview.tabId, { timeout: 20000 });
    });
  }
});
