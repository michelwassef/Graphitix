const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

const ARCHIVE_TMP_DIR = path.resolve(__dirname, '.tmp');

const COMPONENT_CASES = [
  {
    key: 'scatter',
    component: { type: 'scatter', pageId: 'scatterPage' },
    exampleButtonId: 'scatterLoadExample',
    computeSelector: '#scatterComputeStats',
    statusSelector: '#scatterStatsStatus',
    resultsSelector: '#scatterStatsResults',
    pageVisibleSelector: '#scatterPage:not([hidden])'
  },
  {
    key: 'line',
    component: { type: 'line', pageId: 'linePage' },
    exampleButtonId: 'lineLoadExample',
    computeSelector: '#lineComputeStats',
    statusSelector: '#lineStatsStatus',
    resultsSelector: '#lineStatsResults',
    pageVisibleSelector: '#linePage:not([hidden])'
  },
  {
    key: 'pie',
    component: { type: 'pie', pageId: 'piePage' },
    exampleButtonId: 'pieLoadExample',
    computeSelector: '#pieComputeStats',
    statusSelector: '#pieStatsStatus',
    resultsSelector: '#pieStatsResults',
    pageVisibleSelector: '#piePage:not([hidden])'
  }
];

async function waitForStatsReady(page, componentCase) {
  if (typeof componentCase.beforeCompute === 'function') {
    await componentCase.beforeCompute(page);
  }
  await expect(page.locator(componentCase.computeSelector)).toBeEnabled({ timeout: 25_000 });
  await page.locator(componentCase.computeSelector).click();
  await expect(page.locator(componentCase.statusSelector)).toContainText('Statistics up to date.', { timeout: 40_000 });
  await expect(page.locator(componentCase.computeSelector)).toHaveText(/Recalculate statistics/i, { timeout: 20_000 });
  await expect(page.locator(componentCase.resultsSelector)).not.toContainText('Statistics will appear after calculation.', { timeout: 20_000 });
}

async function waitForRestoredStats(page, componentCase) {
  await expect(page.locator(componentCase.statusSelector)).toContainText('Statistics up to date.', { timeout: 40_000 });
  await expect(page.locator(componentCase.computeSelector)).toHaveText(/Recalculate statistics/i, { timeout: 20_000 });
  await expect(page.locator(componentCase.resultsSelector)).not.toContainText('Statistics will appear after calculation.', { timeout: 20_000 });
}

async function captureWorkspaceArchive(page, componentKey) {
  const archive = await page.evaluate(async () => {
    const tabsApi = window.Main?.tabs;
    const sessionActions = window.Main?.sessionActions;
    if (!tabsApi || typeof tabsApi.getSessionActionsContext !== 'function') {
      throw new Error('Main.tabs.getSessionActionsContext unavailable');
    }
    if (!sessionActions || typeof sessionActions.buildWorkspaceArchiveBlob !== 'function') {
      throw new Error('Main.sessionActions.buildWorkspaceArchiveBlob unavailable');
    }
    const context = tabsApi.getSessionActionsContext();
    const blob = await sessionActions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace',
      snapshotKind: 'document-snapshot',
      compression: 'STORE',
      reason: 'e2e-stats-archive-reopen'
    });
    if (!blob) {
      throw new Error('buildWorkspaceArchiveBlob returned null');
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const CHUNK = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return {
      fileName: String(blob.name || 'workspace.graph').trim() || 'workspace.graph',
      size: bytes.length,
      base64: btoa(binary)
    };
  });
  const safeName = archive.fileName.toLowerCase().endsWith('.graph')
    ? archive.fileName
    : `${archive.fileName}.graph`;
  fs.mkdirSync(ARCHIVE_TMP_DIR, { recursive: true });
  const archivePath = path.join(ARCHIVE_TMP_DIR, `${componentKey}-${safeName}`);
  fs.writeFileSync(archivePath, Buffer.from(archive.base64, 'base64'));
  return { archivePath, size: archive.size };
}

async function loadWorkspaceArchive(page, archivePath) {
  const input = page.locator('#workspaceSessionInput');
  await expect(input).toHaveCount(1, { timeout: 20_000 });
  await input.setInputFiles(archivePath);
  await page.waitForTimeout(800);
}

async function ensureExampleLoaded(page, componentCase) {
  const clickByIdInActiveWorkspace = async () => {
    return page.evaluate((buttonId) => {
      const state = window.Main?.session?.workspaceState;
      const activeTab = state?.tabs?.find(tab => tab?.id === state?.activeTabId) || null;
      const type = activeTab?.type || '';
      const mountedRoot = window.Shared?.workspaceTabs?.getMountedRoot?.(activeTab?.id || null, type) || null;
      const pageRoot = type ? document.getElementById(`${type}Page`) : null;
      const searchRoot = mountedRoot || pageRoot || document;
      const button = searchRoot?.querySelector?.(`#${buttonId}`) || null;
      if (!button || button.disabled) {
        return false;
      }
      button.click();
      return true;
    }, componentCase.exampleButtonId);
  };

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const usedComponentButton = await clickExampleButtonIfPresent(page, componentCase.exampleButtonId);
    if (usedComponentButton) {
      await page.waitForTimeout(800);
      return;
    }
    const clickedById = await clickByIdInActiveWorkspace();
    if (clickedById) {
      await page.waitForTimeout(800);
      return;
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`Unable to trigger example load for component ${componentCase.key}`);
}

async function activateWorkspaceTabByExactTitle(page, titlePattern) {
  const tabButton = page.locator('.workspace-tab').filter({ hasText: titlePattern }).first();
  await expect(tabButton).toBeVisible({ timeout: 20_000 });
  await tabButton.click();
}

async function activateFirstGraphTab(page) {
  const clicked = await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('.workspace-tab'));
    const target = tabs.find(node => !/^\s*Welcome\s*$/.test(String(node.textContent || '').trim()));
    if (!target) {
      return false;
    }
    target.click();
    return true;
  });
  expect(clicked).toBe(true);
}

for (const componentCase of COMPONENT_CASES) {
  test(`reopened archive keeps ${componentCase.key} statistics after tab switch`, async ({ page }) => {
    test.setTimeout(180_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);

    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
    await openComponentFromWelcome(page, componentCase.component, { first: true });
    await page.waitForFunction(
      componentType => !!window.Components?.[componentType]?.ready,
      componentCase.component.type,
      { timeout: 30_000 }
    );
    await ensureExampleLoaded(page, componentCase);

    await waitForStatsReady(page, componentCase);
    if (typeof componentCase.extraAssertions === 'function') {
      await componentCase.extraAssertions(page);
    }

    const { archivePath, size } = await captureWorkspaceArchive(page, componentCase.key);
    expect(size).toBeGreaterThan(0);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
    await loadWorkspaceArchive(page, archivePath);
    await expect(page.locator(componentCase.pageVisibleSelector)).toBeVisible({ timeout: 35_000 });

    await waitForRestoredStats(page, componentCase);
    if (typeof componentCase.extraAssertions === 'function') {
      await componentCase.extraAssertions(page);
    }

    await activateWorkspaceTabByExactTitle(page, /^Welcome$/i);
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
    await activateFirstGraphTab(page);
    await expect(page.locator(componentCase.pageVisibleSelector)).toBeVisible({ timeout: 20_000 });

    await waitForRestoredStats(page, componentCase);
    if (typeof componentCase.extraAssertions === 'function') {
      await componentCase.extraAssertions(page);
    }

    expect(issues.critical).toEqual([]);
  });
}
