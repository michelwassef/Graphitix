const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { clearRecoverySnapshot } = require('../helpers/recoveryDriver');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { registerIssueCollectors } = require('../helpers/diagnostics');

async function activeTabId(page) {
  return page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
}

test('Unsaved close prompt preserves Cancel and honors Discard', async ({ page }) => {
  test.setTimeout(90_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await clearRecoverySnapshot(page);
  await openComponentFromWelcome(page, { type: 'venn', pageId: 'vennPage' }, { first: true });
  const tabId = await activeTabId(page);

  await page.locator('#vennPage details').first().locator('summary').click();
  await page.locator('#nA').fill('12');
  await page.locator('#nB').fill('9');
  await page.locator('#nAB').fill('4');
  await page.locator('#useNumeric').click();
  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).click({ button: 'right' });
  await page.locator('#tabContextDelete').click();

  const prompt = page.locator('#unsavedPrompt');
  await expect(prompt).toBeVisible();
  await expect(prompt).toHaveAttribute('aria-describedby', 'unsavedPromptMessage');
  await expect(page.locator('#workspaceMain')).toHaveAttribute('inert', '');
  await expect(page.locator('#unsavedPromptSave')).toBeFocused();
  await page.locator('#unsavedPromptCancel').click();
  await expect(prompt).toBeHidden();
  await expect(page.locator('#workspaceMain')).not.toHaveAttribute('inert', '');
  await expect(page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`)).toBeVisible();
  expect(await activeTabId(page)).toBe(tabId);

  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).click({ button: 'right' });
  await page.locator('#tabContextDelete').click();
  await expect(prompt).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(prompt).toBeHidden();
  await expect(page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`)).toBeFocused();

  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).click({ button: 'right' });
  await page.locator('#tabContextDelete').click();
  await expect(prompt).toBeVisible();
  await page.locator('#unsavedPromptDiscard').click();
  await expect(prompt).toBeHidden();
  await expect(page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`)).toHaveCount(0);

  await expect.poll(() => page.evaluate(async () => {
    const localEmpty = !localStorage.getItem('graphitix.canonical-journal.v1');
    const request = indexedDB.open('graphitix-document-state', 2);
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Document-state open failed.'));
    });
    try {
      const transaction = db.transaction(['snapshots', 'canonical-journal'], 'readonly');
      const snapshotRequest = transaction.objectStore('snapshots').get('active-recovery');
      const journalRequest = transaction.objectStore('canonical-journal').getAll();
      return await new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve({
          localEmpty,
          hasSnapshot: !!snapshotRequest.result,
          journalCount: journalRequest.result?.length || 0
        });
        transaction.onerror = () => reject(transaction.error || new Error('Document-state read failed.'));
      });
    } finally { db.close(); }
  }), { timeout: 15_000 }).toEqual({ localEmpty: true, hasSnapshot: false, journalCount: 0 });

  let offeredRecovery = false;
  const recoveryDialogHandler = async dialog => {
    if (/recover|restore/i.test(dialog.message())) offeredRecovery = true;
    await dialog.accept();
  };
  page.on('dialog', recoveryDialogHandler);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
    expect(offeredRecovery).toBe(false);
    const graphTabCount = await page.evaluate(() => (window.Main?.session?.workspaceState?.tabs || [])
      .filter(tab => !tab.isWelcome && tab.type).length);
    expect(graphTabCount).toBe(0);
  } finally {
    page.off('dialog', recoveryDialogHandler);
  }

  expect(issues.critical).toEqual([]);
});

test('an in-flight save keeps its close-prompt owner isolated', async ({ page }) => {
  test.setTimeout(90_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'venn', pageId: 'vennPage' }, { first: true });

  await page.locator('#vennPage details').first().locator('summary').click();
  await page.locator('#nA').fill('12');
  await page.locator('#nB').fill('9');
  await page.locator('#nAB').fill('4');
  await page.locator('#useNumeric').click();
  const firstTabId = await activeTabId(page);

  await page.evaluate(async () => {
    await window.Main.tabs.handleAddTabClick();
    await window.Main.tabs.handleGraphSelection('venn', { reason: 'e2e-close-prompt-owner' });
  });
  await expect(page.locator('#duplicatePrompt:not([hidden])')).toBeVisible();
  await page.locator('#duplicateReuse').click({ force: true });
  await page.waitForSelector('#vennPage:not([hidden])', { timeout: 20_000 });
  const secondTabId = await page.evaluate(firstId => {
    const state = window.Main.session.workspaceState;
    return state.tabs.find(tab => tab.type === 'venn' && tab.id !== firstId)?.id || null;
  }, firstTabId);
  expect(secondTabId).toBeTruthy();

  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${firstTabId}"]`).click({ button: 'right' });
  await page.locator('#tabContextDelete').click();
  await expect(page.locator('#unsavedPrompt')).toBeVisible();
  await page.evaluate(() => {
    window.__deferredCloseSave = { started: false, resolve: null };
    window.__originalCloseSave = window.Main.sessionActions.saveWorkspaceArchiveWithScope;
    window.Main.sessionActions.saveWorkspaceArchiveWithScope = () => new Promise(resolve => {
      window.__deferredCloseSave.started = true;
      window.__deferredCloseSave.resolve = resolve;
    });
  });
  await page.locator('#unsavedPromptSave').click();
  await page.waitForFunction(() => window.__deferredCloseSave?.started === true);
  await expect(page.locator('#unsavedPrompt')).toBeVisible();
  await expect(page.locator('#unsavedPromptSave')).toBeDisabled();
  await expect(page.locator('#workspaceMain')).toHaveAttribute('inert', '');

  // The modal serializes close decisions, and the tab manager rejects a
  // concurrent close request even when reached outside the rendered controls.
  const overlapAttempt = await page.evaluate(secondId => {
    const state = window.Main.session.workspaceState;
    const tabs = window.Main.tabs;
    const payloadsBefore = state.tabs
      .filter(tab => tab.type === 'venn')
      .map(tab => ({ id: tab.id, payload: JSON.parse(JSON.stringify(tab.payload)) }));
    const result = tabs.closeTab(secondId, { reason: 'e2e-overlapping-close' });
    return {
      result,
      promptOwner: state.pendingClosePrompt?.tabId || null,
      payloadsBefore,
      tabIds: state.tabs.filter(tab => tab.type === 'venn').map(tab => tab.id)
    };
  }, secondTabId);
  expect(overlapAttempt.result).toBe(false);
  expect(overlapAttempt.promptOwner).toBe(firstTabId);
  expect(overlapAttempt.tabIds).toContain(firstTabId);
  expect(overlapAttempt.tabIds).toContain(secondTabId);

  await page.evaluate(() => window.__deferredCloseSave.resolve({ status: 'saved', fileName: 'prompt-owner.graph' }));
  await expect(page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${firstTabId}"]`)).toHaveCount(0);
  await expect(page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${secondTabId}"]`)).toHaveCount(1);
  await expect(page.locator('#unsavedPrompt')).toBeHidden();
  const finalState = await page.evaluate(secondId => {
    const state = window.Main.session.workspaceState;
    const tab = state.tabs.find(item => item.id === secondId);
    return { pendingClosePrompt: state.pendingClosePrompt, payload: JSON.parse(JSON.stringify(tab?.payload || null)) };
  }, secondTabId);
  expect(finalState.pendingClosePrompt).toBeNull();
  expect(finalState.payload).toEqual(overlapAttempt.payloadsBefore.find(item => item.id === secondTabId)?.payload);
  expect(issues.critical).toEqual([]);
});
