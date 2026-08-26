const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent,
  waitForDocumentOpenComplete
} = require('./helpers/workspaceHarness');

const TMP_DIR = path.resolve(__dirname, '.tmp');
const BOX_COMPONENT = { type: 'box', pageId: 'boxPage' };
const ALPHA_SELECTOR = '#boxStatsInferenceControls [data-stats-inference-key="alpha"]';

async function getGraphTabIds(page) {
  return page.evaluate(() => (
    Array.isArray(window.Main?.session?.workspaceState?.tabs)
      ? window.Main.session.workspaceState.tabs
        .filter(tab => tab && !tab.isWelcome && tab.type)
        .map(tab => String(tab.id || '').trim())
      : []
  ).filter(Boolean));
}

async function activateTab(page, tabId) {
  const tab = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).first();
  await expect(tab).toBeVisible({ timeout: 20_000 });
  await tab.click({ force: true });
  await page.waitForFunction(id => (
    String(window.Main?.session?.workspaceState?.activeTabId || '') === String(id || '')
  ), tabId, { timeout: 20_000 });
}

async function openBoxTab(page, { first }) {
  if (first) {
    await openComponentFromWelcome(page, BOX_COMPONENT, { first: true });
  } else {
    await page.evaluate(async () => {
      const tabs = window.Main?.tabs;
      const addResult = tabs?.handleAddTabClick?.();
      if (addResult && typeof addResult.then === 'function') await addResult;
      const selectionResult = tabs?.handleGraphSelection?.('box', {
        reason: 'e2e-stats-inference-second-box'
      });
      if (selectionResult && typeof selectionResult.then === 'function') await selectionResult;
      const prompt = document.querySelector('#duplicatePrompt:not([hidden])');
      const empty = document.querySelector('#duplicateEmpty');
      if (prompt && empty && !empty.disabled) empty.click();
    });
  }

  await expect(page.locator('#boxPage:not([hidden])')).toBeVisible({ timeout: 25_000 });
  await page.waitForFunction(() => typeof window.Components?.box?.getPayload === 'function', null, {
    timeout: 25_000
  });
  await clickExampleButtonIfPresent(page, 'boxLoadExample');
  await page.waitForFunction(selector => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(active?.id || null, 'box') || document;
    const input = root.querySelector(selector);
    const button = root.querySelector('#boxComputeStats');
    return !!input && !!button && !button.disabled;
  }, ALPHA_SELECTOR, { timeout: 25_000 });
}

async function setAlpha(page, value) {
  await page.evaluate(({ selector, value: nextValue }) => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(active?.id || null, 'box') || document;
    const input = root.querySelector(selector);
    if (!input) throw new Error('Box inference alpha input not found');
    input.value = String(nextValue);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, { selector: ALPHA_SELECTOR, value });

  await page.waitForFunction(expected => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    return Number(active?.payload?.meta?.statsInference?.alpha) === Number(expected)
      && Number(window.Shared?.statsInference?.getAlpha?.({ tabId: active?.id || null })) === Number(expected);
  }, value, { timeout: 10_000 });
}

async function captureActiveAlpha(page) {
  return page.evaluate(selector => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(active?.id || null, 'box') || document;
    const input = root.querySelector(selector);
    return {
      tabId: active?.id || null,
      input: Number(input?.value),
      payload: Number(active?.payload?.meta?.statsInference?.alpha),
      inference: Number(window.Shared?.statsInference?.getAlpha?.({ tabId: active?.id || null }))
    };
  }, ALPHA_SELECTOR);
}

async function captureWorkspaceArchive(page) {
  const base64 = await page.evaluate(async () => {
    const context = window.Main?.tabs?.getSessionActionsContext?.();
    const blob = await window.Main?.sessionActions?.buildWorkspaceArchiveBlob?.(context, {
      scope: 'workspace',
      snapshotKind: 'document-snapshot',
      compression: 'STORE',
      reason: 'e2e-stats-inference-roundtrip'
    });
    if (!blob) throw new Error('Workspace archive blob was not produced');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunkSize));
    }
    return btoa(binary);
  });
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const archivePath = path.join(TMP_DIR, 'stats-inference-isolation.graph');
  fs.writeFileSync(archivePath, Buffer.from(base64, 'base64'));
  return archivePath;
}

async function reopenWorkspaceArchive(page, archivePath) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await page.locator('#workspaceSessionInput').setInputFiles(archivePath);
  await waitForDocumentOpenComplete(page);
  await page.waitForFunction(() => {
    const graphTabs = (window.Main?.session?.workspaceState?.tabs || [])
      .filter(tab => tab && !tab.isWelcome && tab.type === 'box');
    return graphTabs.length >= 2;
  }, null, { timeout: 30_000 });
}

test('pre-analysis alpha is tab-owned and survives same-component archive reopen', async ({ page }) => {
  test.setTimeout(150_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });

  const beforeA = new Set(await getGraphTabIds(page));
  await openBoxTab(page, { first: true });
  const tabA = (await getGraphTabIds(page)).find(id => !beforeA.has(id));
  expect(tabA).toBeTruthy();
  expect(await captureActiveAlpha(page)).toMatchObject({ input: 0.05, inference: 0.05 });
  await setAlpha(page, 0.01);
  expect(await captureActiveAlpha(page)).toMatchObject({ input: 0.01, payload: 0.01, inference: 0.01 });

  const beforeB = new Set(await getGraphTabIds(page));
  await openBoxTab(page, { first: false });
  const tabB = (await getGraphTabIds(page)).find(id => !beforeB.has(id));
  expect(tabB).toBeTruthy();
  expect(tabB).not.toBe(tabA);
  expect(await captureActiveAlpha(page)).toMatchObject({ input: 0.05, inference: 0.05 });
  await setAlpha(page, 0.1);
  expect(await captureActiveAlpha(page)).toMatchObject({ input: 0.1, payload: 0.1, inference: 0.1 });

  await activateTab(page, tabA);
  await expect(page.locator(ALPHA_SELECTOR)).toHaveValue('0.01');
  expect(await captureActiveAlpha(page)).toMatchObject({ input: 0.01, payload: 0.01, inference: 0.01 });
  await activateTab(page, tabB);
  await expect(page.locator(ALPHA_SELECTOR)).toHaveValue('0.1');
  expect(await captureActiveAlpha(page)).toMatchObject({ input: 0.1, payload: 0.1, inference: 0.1 });

  const archivePath = await captureWorkspaceArchive(page);
  await reopenWorkspaceArchive(page, archivePath);

  const reopenedIds = await getGraphTabIds(page);
  expect(reopenedIds).toHaveLength(2);
  const restoredAlphas = [];
  for (const tabId of reopenedIds) {
    await activateTab(page, tabId);
    await page.waitForFunction(({ tabId: id, selector }) => {
      const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'box') || null;
      return !!root?.querySelector?.(selector);
    }, { tabId, selector: ALPHA_SELECTOR }, { timeout: 25_000 });
    const snapshot = await captureActiveAlpha(page);
    expect(snapshot.input).toBe(snapshot.payload);
    expect(snapshot.inference).toBe(snapshot.payload);
    restoredAlphas.push(snapshot.payload);
  }
  expect(restoredAlphas.sort((a, b) => a - b)).toEqual([0.01, 0.1]);

  expect(issues.critical).toEqual([]);
});
