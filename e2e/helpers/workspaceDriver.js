'use strict';

const path = require('path');
const { COMPONENT_CATALOG } = require('../../test-support/componentCatalog.js');
const { waitForOwnerReady } = require('../../test-support/readiness.js');
const { clickExampleButton } = require('./uiDriver');

const COMPONENT_MATRIX = COMPONENT_CATALOG;
const OWNER_PAYLOAD_DRIVER_PATH = path.resolve(__dirname, './ownerPayloadDriver.js');

async function installOwnerPayloadDriver(page) {
  await page.addScriptTag({ path: OWNER_PAYLOAD_DRIVER_PATH });
  await page.waitForFunction(() => !!window.GraphitixOwnerPayloadDriver?.runSameTypeIsolation);
}

async function getWorkspaceTabIds(page, type = null) {
  return page.evaluate(componentType => {
    const state = window.Main?.session?.workspaceState || {};
    return (state.tabs || [])
      .filter(tab => tab && !tab.isWelcome && (!componentType || tab.type === componentType))
      .map(tab => String(tab.id || '').trim())
      .filter(Boolean);
  }, type);
}

async function maybeHandleDuplicatePrompt(page) {
  const prompt = page.locator('#duplicatePrompt:not([hidden])');
  if (await prompt.count() < 1) {
    return;
  }
  const emptyButton = page.locator('#duplicateEmpty');
  if (await emptyButton.isVisible()) {
    await emptyButton.click();
    await prompt.waitFor({ state: 'hidden', timeout: 10_000 });
  }
}

async function getActiveWorkspaceTabMeta(page) {
  return page.evaluate(() => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    return active
      ? { id: String(active.id || ''), type: active.type || null, title: active.title || '' }
      : null;
  }).catch(() => null);
}

async function waitForActiveComponentLaunch(page, component, timeout = 20_000, expectedTabId = null) {
  await waitForOwnerReady(page, {
    type: component.type,
    pageId: component.pageId,
    expectedTabId,
    timeout,
    requireMountedRoot: false
  });
  return true;
}

async function openComponentFromWelcome(page, component, options = {}) {
  const previousActive = await getActiveWorkspaceTabMeta(page);
  let expectedTabId = options.expectedTabId || null;
  const tileAction = options.loadExample === true ? 'example' : 'new';
  if (!options.first) {
    await page.locator('#addWorkspaceTab').click();
    await maybeHandleDuplicatePrompt(page);
    if (!expectedTabId) {
      expectedTabId = await page.waitForFunction(previousId => {
        const state = window.Main?.session?.workspaceState;
        const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
        return active?.id && String(active.id) !== String(previousId || '') ? String(active.id) : false;
      }, previousActive?.id || '', { timeout: 10_000, polling: 'raf' }).then(handle => handle.jsonValue());
    }
  }
  if (!expectedTabId && !options.first) {
    expectedTabId = (await getActiveWorkspaceTabMeta(page))?.id || null;
  }
  const selector = `#graphSelectionGrid [data-graph-type="${component.type}"]`;
  const card = page.locator(selector);
  await page.waitForSelector(selector, { timeout: 20_000 });
  await page.waitForFunction(type => {
    const target = document.querySelector(`#graphSelectionGrid [data-graph-type="${type}"]`);
    return target?.dataset?.welcomeCardHydrated === 'true';
  }, component.type, { timeout: 20_000 });
  let launched = false;
  let lastError = null;
  try {
    await card.scrollIntoViewIfNeeded({ timeout: 3000 });
    const target = tileAction === 'example'
      ? card.getByRole('button', { name: /^Load example\b/i }).first()
      : card.getByRole('button', { name: /^New\b/i }).first();
    // Welcome graph cards launch an in-page workspace action (`type=button` +
    // `launchWelcomeGraph`); owner readiness is the completion condition.
    await target.click({ timeout: 5000, noWaitAfter: true });
    launched = await waitForActiveComponentLaunch(page, component, 20_000, expectedTabId);
  } catch (err) {
    lastError = err;
    if (page.isClosed()) {
      throw err;
    }
  }
  if (!launched) {
    const state = await page.evaluate(() => {
      const workspaceState = window.Main?.session?.workspaceState;
      const active = workspaceState?.tabs?.find(tab => tab?.id === workspaceState.activeTabId) || null;
      return {
        activeTabId: workspaceState?.activeTabId || null,
        active: active ? { id: active.id, type: active.type || null, title: active.title || '' } : null,
        tabs: Array.isArray(workspaceState?.tabs)
          ? workspaceState.tabs.map(tab => ({ id: tab.id, type: tab.type || null, title: tab.title || '', isWelcome: !!tab.isWelcome }))
          : [],
        expectedTabId: expectedTabId || null
      };
    }).catch(() => null);
    const details = state ? ` ${JSON.stringify(state)}` : '';
    const causeMessage = lastError ? ` Cause: ${lastError.message || String(lastError)}` : '';
    throw new Error(`Failed to open component card: ${component.type}.${details}${causeMessage}`);
  }
}

async function clickExampleButtonIfPresent(page, buttonId) {
  if (!buttonId) {
    return false;
  }
  const activeTabMeta = await getActiveWorkspaceTabMeta(page);
  const activeType = String(activeTabMeta?.type || '').trim();
  if (!activeType) {
    return false;
  }
  const component = COMPONENT_CATALOG.find(entry => entry.type === activeType);
  if (!component) {
    throw new Error(`Unknown active component type: ${activeType}`);
  }
  return !!await clickExampleButton(page, { ...component, exampleButtonId: buttonId }, { optional: true });
}

async function confirmDataImportPrompt(page, options = {}) {
  const timeout = Number.isFinite(Number(options.timeout)) ? Number(options.timeout) : 60_000;
  const prompt = page.locator('#welcomeDataImportPrompt');
  await prompt.waitFor({ state: 'visible', timeout });
  await page.waitForFunction(() => {
    const modal = document.getElementById('welcomeDataImportPrompt');
    const status = document.getElementById('welcomeDataImportPreviewStatus');
    const submit = document.getElementById('welcomeDataImportOpen');
    if (!modal || modal.hidden || !status || !submit || submit.disabled) {
      return false;
    }
    const text = String(status.textContent || '').trim();
    return !!text && !/loading preview/i.test(text) && !/preview failed|preview unavailable/i.test(text);
  }, null, { timeout });
  await page.locator('#welcomeDataImportOpen').click();
  await prompt.waitFor({ state: 'hidden', timeout });
}

async function importDataFile(page, inputSelector, filePath, options = {}) {
  await page.locator(inputSelector).setInputFiles(filePath);
  await confirmDataImportPrompt(page, options);
}

async function waitForDocumentOpenComplete(page, timeoutMs = 120_000) {
  const handle = await page.waitForFunction(() => {
    const operation = window.Main?.session?.workspaceState?.documentOperation || null;
    const overlay = document.getElementById('documentOpenOverlay');
    if (overlay?.dataset?.state === 'error') {
      const diagnostics = window.Main?.sessionActions?.getDocumentOpenDiagnostics?.() || null;
      return {
        status: 'error',
        title: overlay.querySelector('.document-open-overlay__title')?.textContent || '',
        detail: overlay.querySelector('.document-open-overlay__detail')?.textContent || '',
        diagnostics: diagnostics?.message || ''
      };
    }
    if (operation?.active !== true && (!overlay || overlay.hidden === true)) {
      return { status: 'complete' };
    }
    return false;
  }, null, { timeout: timeoutMs });
  const result = await handle.jsonValue();
  if (result?.status === 'error') {
    throw new Error([result.title, result.detail, result.diagnostics].filter(Boolean).join(': ') || 'Document open failed');
  }
}

module.exports = {
  COMPONENT_MATRIX,
  clickExampleButtonIfPresent,
  confirmDataImportPrompt,
  getActiveWorkspaceTabMeta,
  getWorkspaceTabIds,
  importDataFile,
  installOwnerPayloadDriver,
  maybeHandleDuplicatePrompt,
  openComponentFromWelcome,
  waitForActiveComponentLaunch,
  waitForDocumentOpenComplete
};
