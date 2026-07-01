const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

const TMP_DIR = path.resolve(__dirname, '.tmp');

async function waitForRocRender(page, expectedType) {
  await page.waitForFunction((type) => {
    const root = document.querySelector('#rocPage:not([hidden])');
    const svg = root?.querySelector?.('#rocSvg') || null;
    const select = root?.querySelector?.('#rocGraphType') || null;
    const text = [
      svg?.textContent || '',
      root?.querySelector?.('#rocStatsResults')?.textContent || ''
    ].join('\n');
    if (!svg || select?.value !== type) {
      return false;
    }
    if (type === 'roc') {
      return /ROC curve/i.test(text)
        && /False Positive Rate/i.test(text)
        && /True Positive Rate/i.test(text)
        && /\bAUC\b/i.test(text);
    }
    return /Precision-Recall curve/i.test(text)
      && /\bRecall\b/i.test(text)
      && /\bPrecision\b/i.test(text)
      && /Average Precision|AP\b/i.test(text);
  }, expectedType, { timeout: 45_000 });
}

async function readRocState(page) {
  return page.evaluate(() => {
    const root = document.querySelector('#rocPage:not([hidden])');
    const svg = root?.querySelector?.('#rocSvg') || null;
    const stats = root?.querySelector?.('#rocStatsResults') || null;
    const payload = window.Components?.roc?.getPayload?.() || null;
    return {
      graphType: root?.querySelector?.('#rocGraphType')?.value || null,
      payloadGraphType: payload?.config?.graphType || null,
      payloadTitle: payload?.config?.title || null,
      payloadStatsGraphType: payload?.stats?.resultsModel?.meta?.graphType || payload?.stats?.reportModel?.meta?.graphType || null,
      svgText: svg?.textContent || '',
      statsText: stats?.textContent || '',
      hasSvg: !!svg,
      hasStats: !!stats
    };
  });
}

async function setRocGraphType(page, graphType) {
  await page.locator('#rocPage:not([hidden]) #rocGraphType').selectOption(graphType);
  await waitForRocRender(page, graphType);
}

async function captureWorkspaceArchive(page, fileStem) {
  const archive = await page.evaluate(async (stem) => {
    const context = window.Main.tabs.getSessionActionsContext();
    const blob = await window.Main.sessionActions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace',
      snapshotKind: 'document-snapshot',
      compression: 'STORE',
      reason: 'e2e-roc-graph-type-reopen'
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return { fileName: `${stem}.graph`, base64: btoa(binary) };
  }, fileStem);
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const archivePath = path.join(TMP_DIR, archive.fileName);
  fs.writeFileSync(archivePath, Buffer.from(archive.base64, 'base64'));
  return archivePath;
}

async function reopenArchive(page, archivePath) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await page.locator('#workspaceSessionInput').setInputFiles(archivePath);
  await page.waitForFunction(() => {
    const state = window.Main?.session?.workspaceState || {};
    return (state.tabs || []).some(tab => tab && tab.type === 'roc');
  }, null, { timeout: 60_000 });
  await page.evaluate(async () => {
    const sa = window.Main?.sessionActions;
    if (sa && typeof sa.awaitPostLoadWarmup === 'function') {
      await sa.awaitPostLoadWarmup({ timeoutMs: 60_000, reason: 'e2e-roc-graph-type-reopen' });
    }
  });
  const tabId = await page.evaluate(() => {
    const state = window.Main?.session?.workspaceState || {};
    return (state.tabs || []).find(tab => tab && tab.type === 'roc')?.id || null;
  });
  expect(tabId).toBeTruthy();
  await page.evaluate(async (id) => {
    const result = window.Main?.tabs?.activateTab?.(id, { reason: 'e2e-roc-reopen-activate' });
    if (result && typeof result.then === 'function') {
      await result;
    }
  }, tabId);
  await page.waitForSelector('#rocPage:not([hidden])', { timeout: 30_000 });
}

function expectRocConsistency(state, graphType) {
  expect(state.hasSvg).toBe(true);
  expect(state.hasStats).toBe(true);
  expect(state.graphType).toBe(graphType);
  expect(state.payloadGraphType).toBe(graphType);
  if (graphType === 'roc') {
    expect(state.payloadTitle).toBe('ROC curve');
    expect(state.svgText).toMatch(/ROC curve/i);
    expect(state.svgText).toMatch(/False Positive Rate/i);
    expect(state.svgText).toMatch(/True Positive Rate/i);
    expect(state.statsText).toMatch(/\bAUC\b/i);
    expect(state.statsText).toMatch(/ROC metrics|ROC summary/i);
  } else {
    expect(state.payloadTitle).toBe('Precision-Recall curve');
    expect(state.svgText).toMatch(/Precision-Recall curve/i);
    expect(state.svgText).toMatch(/\bRecall\b/i);
    expect(state.svgText).toMatch(/Precision/i);
    expect(state.statsText).toMatch(/Average Precision|AP\b/i);
    expect(state.statsText).toMatch(/Precision.*Recall|Precision-Recall|Precision–Recall/i);
  }
}

test('ROC and Precision-Recall graph type survives toggles, tab switch, and reopen', async ({ page }) => {
  test.setTimeout(240_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await openComponentFromWelcome(page, { type: 'roc', pageId: 'rocPage' }, { first: true });
  await clickExampleButtonIfPresent(page, 'rocLoadExample');
  await waitForRocRender(page, 'roc');
  expectRocConsistency(await readRocState(page), 'roc');

  await setRocGraphType(page, 'pr');
  expectRocConsistency(await readRocState(page), 'pr');

  await setRocGraphType(page, 'roc');
  expectRocConsistency(await readRocState(page), 'roc');

  await setRocGraphType(page, 'pr');
  const rocTabId = await page.evaluate(() => {
    const state = window.Main?.session?.workspaceState || {};
    const active = (state.tabs || []).find(tab => tab && tab.id === state.activeTabId) || null;
    return active && active.type === 'roc' ? active.id : null;
  });
  expect(rocTabId).toBeTruthy();
  await page.evaluate(async () => {
    const result = window.Main?.tabs?.handleAddTabClick?.();
    if (result && typeof result.then === 'function') {
      await result;
    }
    const prompt = document.querySelector('#duplicatePrompt:not([hidden])');
    const empty = document.querySelector('#duplicateEmpty');
    if (prompt && empty && !empty.disabled) {
      empty.click();
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  });
  await page.waitForFunction((id) => {
    const state = window.Main?.session?.workspaceState || {};
    return state.activeTabId && state.activeTabId !== id;
  }, rocTabId, { timeout: 20_000 });
  const rocTab = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${rocTabId}"]`).first();
  await expect(rocTab).toBeVisible({ timeout: 20_000 });
  await rocTab.click({ force: true });
  await page.waitForSelector('#rocPage:not([hidden])', { timeout: 30_000 });
  await waitForRocRender(page, 'pr');
  expectRocConsistency(await readRocState(page), 'pr');

  const archivePath = await captureWorkspaceArchive(page, 'roc-pr-graph-type');
  await reopenArchive(page, archivePath);
  await waitForRocRender(page, 'pr');
  expectRocConsistency(await readRocState(page), 'pr');

  await setRocGraphType(page, 'roc');
  expectRocConsistency(await readRocState(page), 'roc');

  expect(issues.critical.filter(entry => entry.kind !== 'requestfailed')).toEqual([]);
});
