const { test, expect } = require('@playwright/test');
const {
  openComponentFromWelcome,
  clickExpectedExampleButton
} = require('../helpers/workspaceDriver');
const { buildWorkspaceArchive, openWorkspaceArchiveBuffer } = require('../helpers/archiveDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { clearRecoverySnapshot } = require('../helpers/recoveryDriver');

async function readJournalMeta(page) {
  return page.evaluate(() => new Promise(resolve => {
    const request = window.indexedDB.open('graphitix-document-state', 2);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('canonical-journal')) { db.close(); resolve(null); return; }
      const tx = db.transaction('canonical-journal', 'readonly');
      const get = tx.objectStore('canonical-journal').get('meta');
      get.onsuccess = () => { db.close(); resolve(get.result || null); };
      get.onerror = () => { db.close(); resolve(null); };
    };
    request.onerror = () => resolve(null);
  }));
}

async function readLocalJournalMeta(page) {
  return page.evaluate(() => {
    try {
      const raw = window.localStorage.getItem('graphitix.canonical-journal.v1');
      return raw ? JSON.parse(raw)?.meta || null : null;
    } catch (_err) {
      return null;
    }
  });
}

async function readLocalJournalTab(page, tabId) {
  return page.evaluate(({ tabId }) => {
    try {
      const raw = window.localStorage.getItem('graphitix.canonical-journal.v1');
      const journal = raw ? JSON.parse(raw) : null;
      return journal?.tabs?.find(tab => String(tab?.id || '') === String(tabId)) || null;
    } catch (_err) {
      return null;
    }
  }, { tabId });
}

async function clearIndexedDbCanonicalJournal(page) {
  await page.evaluate(async () => {
    const request = window.indexedDB.open('graphitix-document-state', 2);
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB open failed.'));
    });
    try {
      if (!db.objectStoreNames.contains('canonical-journal')) return;
      await new Promise((resolve, reject) => {
        const transaction = db.transaction('canonical-journal', 'readwrite');
        transaction.objectStore('canonical-journal').clear();
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error || new Error('Journal clear failed.'));
      });
    } finally {
      db.close();
    }
  });
}

async function readJournalTab(page, tabId) {
  return page.evaluate(({ tabId }) => new Promise(resolve => {
    const request = window.indexedDB.open('graphitix-document-state', 2);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('canonical-journal')) { db.close(); resolve(null); return; }
      const tx = db.transaction('canonical-journal', 'readonly');
      const get = tx.objectStore('canonical-journal').get(`tab:${tabId}`);
      get.onsuccess = () => { db.close(); resolve(get.result || null); };
      get.onerror = () => { db.close(); resolve(null); };
    };
    request.onerror = () => resolve(null);
  }), { tabId });
}

test('local canonical journal restores a direct payload commit without IndexedDB journal', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  await page.waitForSelector('#boxPage:not([hidden])', { timeout: 30_000 });
  await clickExpectedExampleButton(page, 'boxLoadExample');
  await waitForComponentOwnerReady(page, 'box', {
    requireMountedRoot: true,
    requireIdle: true
  });
  await clearRecoverySnapshot(page);

  const mutation = await page.evaluate(() => {
    const session = window.Main?.session;
    const active = session?.getActiveTab?.();
    if (!active?.payload) throw new Error('Box payload unavailable');
    const nextPayload = structuredClone(active.payload);
    nextPayload.config = nextPayload.config || {};
    nextPayload.config.graphType = 'box';
    nextPayload.config.whisker = {
      ...(nextPayload.config.whisker || {}),
      rule: 'custom'
    };
    const changed = session.commitTabPayload(active, nextPayload, {
      reason: 'e2e-canonical-journal-edit',
      origin: 'user'
    });
    return {
      changed,
      revision: session.workspaceState.sessionRevision,
      tabId: active.id
    };
  });
  expect(mutation.changed).toBe(true);

  await expect.poll(() => readLocalJournalMeta(page), {
    timeout: 10_000,
    message: 'settled user mutation should synchronously write the local recovery journal'
  }).toEqual(expect.objectContaining({
    kind: 'canonical-journal',
    revision: mutation.revision,
    tabCount: 1
  }));
  expect((await readLocalJournalTab(page, mutation.tabId))?.payload?.config).toEqual(expect.objectContaining({
    graphType: 'box',
    whisker: expect.objectContaining({ rule: 'custom' })
  }));

  await expect.poll(() => readJournalMeta(page), {
    timeout: 10_000,
    message: 'canonical journal should be written before the reload'
  }).toEqual(expect.objectContaining({
    kind: 'canonical-journal',
    revision: mutation.revision,
    tabCount: 1
  }));
  await clearRecoverySnapshot(page, { clearCanonicalJournal: false });
  await clearIndexedDbCanonicalJournal(page);

  let accepted = false;
  const dialogHandler = async dialog => {
    if (/recover|restore/i.test(dialog.message())) accepted = true;
    await dialog.accept();
  };
  page.on('dialog', dialogHandler);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(() => accepted, {
      timeout: 20_000,
      message: 'canonical journal should trigger recovery'
    }).toBe(true);
    await page.waitForFunction(() => {
      const state = window.Main?.session?.workspaceState || {};
      const active = (state.tabs || []).find(tab => tab.id === state.activeTabId);
      return active?.type === 'box'
        && active?.payload?.config?.whisker?.rule === 'custom'
        && document.querySelector('#boxPage:not([hidden]) #boxWhiskerRule')?.value === 'custom'
        && !!document.querySelector('#boxPage:not([hidden]) #boxPlot svg');
    }, null, { timeout: 60_000 });
  } finally {
    page.off('dialog', dialogHandler);
  }
});

test('canonical recovery journal preserves immediate Box control changes', async ({ page, browser }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  await page.waitForSelector('#boxPage:not([hidden])', { timeout: 30_000 });
  await clickExpectedExampleButton(page, 'boxLoadExample');
  await page.waitForSelector('#boxPage:not([hidden]) #boxPlot svg', { timeout: 30_000 });
  await clearRecoverySnapshot(page);

  const graphType = page.locator('#boxGraphType');
  await graphType.click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await expect(page.locator('#boxWhiskerRule')).toBeVisible({ timeout: 10_000 });
  const whiskerRule = page.locator('#boxWhiskerRule');
  await page.evaluate(() => {
    localStorage.removeItem('graphitix.canonical-journal.v1');
    window.__boxCheckpointAtChange = null;
    window.addEventListener('change', event => {
      if (event.target?.id !== 'boxWhiskerRule') return;
      const state = window.Main?.session?.workspaceState || {};
      const active = (state.tabs || []).find(tab => tab.id === state.activeTabId);
      const journal = JSON.parse(localStorage.getItem('graphitix.canonical-journal.v1') || 'null');
      window.__boxCheckpointAtChange = {
        activeGraphType: active?.payload?.config?.graphType || null,
        activeWhiskerRule: active?.payload?.config?.whisker?.rule || null,
        journalTab: (journal?.tabs || []).find(tab => tab.id === active?.id) || null
      };
    });
  });
  await whiskerRule.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => {
    const state = window.Main?.session?.workspaceState || {};
    const active = (state.tabs || []).find(tab => tab.id === state.activeTabId);
    return active?.payload?.config?.graphType === 'box'
      && active?.payload?.config?.whisker?.rule === 'custom';
  }, null, { timeout: 15_000 });

  const immediateCheckpoint = await page.evaluate(() => window.__boxCheckpointAtChange);
  expect(immediateCheckpoint?.activeGraphType).toBe('box');
  expect(immediateCheckpoint?.activeWhiskerRule).toBe('custom');
  expect(immediateCheckpoint?.journalTab?.payload?.config?.graphType).toBe('box');
  expect(immediateCheckpoint?.journalTab?.payload?.config?.whisker?.rule).toBe('custom');

  const mutation = await page.evaluate(() => {
    const state = window.Main?.session?.workspaceState || {};
    const active = (state.tabs || []).find(tab => tab.id === state.activeTabId);
    return {
      tabId: active?.id || null,
      revision: state.sessionRevision || 0,
      graphType: active?.payload?.config?.graphType || null,
      whiskerRule: active?.payload?.config?.whisker?.rule || null
    };
  });
  expect(mutation.tabId).toBeTruthy();
  expect(mutation.graphType).toBe('box');
  expect(mutation.whiskerRule).toBe('custom');

  await expect.poll(() => readJournalTab(page, mutation.tabId), {
    timeout: 10_000,
    message: 'canonical journal should contain the latest Box control state'
  }).toEqual(expect.objectContaining({
    kind: 'canonical-tab',
    id: mutation.tabId,
    payload: expect.objectContaining({
      config: expect.objectContaining({
        graphType: 'box',
        whisker: expect.objectContaining({ rule: 'custom' })
      })
    })
  }));
  const journalTab = await readJournalTab(page, mutation.tabId);
  expect(journalTab.payload?.config?.graphType).toBe('box');
  expect(journalTab.payload?.config?.whisker?.rule).toBe('custom');

  let accepted = false;
  const dialogHandler = async dialog => {
    if (/recover|restore/i.test(dialog.message())) accepted = true;
    await dialog.accept();
  };
  page.on('dialog', dialogHandler);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(() => accepted, {
      timeout: 20_000,
      message: 'canonical journal should trigger Box recovery'
    }).toBe(true);
    await page.waitForFunction(() => {
      const state = window.Main?.session?.workspaceState || {};
      const active = (state.tabs || []).find(tab => tab.id === state.activeTabId);
      return active?.type === 'box'
        && active?.payload?.config?.graphType === 'box'
        && active?.payload?.config?.whisker?.rule === 'custom'
        && document.querySelector('#boxPage:not([hidden]) #boxGraphType')?.value === 'box'
        && document.querySelector('#boxPage:not([hidden]) #boxWhiskerRule')?.value === 'custom'
        && !!document.querySelector('#boxPage:not([hidden]) #boxPlot svg');
    }, null, { timeout: 60_000 });
  } finally {
    page.off('dialog', dialogHandler);
  }

  const archive = await buildWorkspaceArchive(page, { useWorker: false });
  const reopenContext = await browser.newContext();
  try {
    const reopenPage = await reopenContext.newPage();
    await installLocalCdnOverrides(reopenPage);
    await reopenPage.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openWorkspaceArchiveBuffer(
      reopenPage,
      Buffer.from(archive.base64, 'base64'),
      { componentType: 'box' }
    );
    await reopenPage.waitForFunction(() => {
      const state = window.Main?.session?.workspaceState || {};
      const active = (state.tabs || []).find(tab => tab.id === state.activeTabId);
      return active?.type === 'box'
        && active?.payload?.config?.graphType === 'box'
        && active?.payload?.config?.whisker?.rule === 'custom'
        && document.querySelector('#boxPage:not([hidden]) #boxGraphType')?.value === 'box'
        && document.querySelector('#boxPage:not([hidden]) #boxWhiskerRule')?.value === 'custom'
        && !!document.querySelector('#boxPage:not([hidden]) #boxPlot svg');
    }, null, { timeout: 60_000 });
  } finally {
    await reopenContext.close();
  }
});

test('a save started before a newer Box edit cannot erase its recovery journal', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  await page.waitForSelector('#boxPage:not([hidden])', { timeout: 30_000 });
  await clickExpectedExampleButton(page, 'boxLoadExample');
  await waitForComponentOwnerReady(page, 'box', { requireMountedRoot: true, requireIdle: true });
  await clearRecoverySnapshot(page);

  const firstRevision = await page.evaluate(async () => {
    const session = window.Main?.session;
    const active = session?.getActiveTab?.();
    const payload = structuredClone(active.payload);
    payload.config = payload.config || {};
    payload.config.graphType = 'box';
    payload.config.whisker = { ...(payload.config.whisker || {}), rule: 'custom' };
    session.commitTabPayload(active, payload, { reason: 'e2e-save-race-first-edit', origin: 'user' });
    return session.workspaceState.sessionRevision;
  });
  await expect.poll(() => readLocalJournalMeta(page), { timeout: 10_000 }).toEqual(expect.objectContaining({
    kind: 'canonical-journal',
    revision: firstRevision
  }));

  await page.evaluate(() => {
    window.__deferredArchiveSave = { started: false };
    window.__archiveSaveGate = new Promise(resolve => { window.__resolveArchiveSave = resolve; });
    window.Shared.fileIO.saveGraphFileAs = async options => {
      await options.getPayload();
      window.__deferredArchiveSave.started = true;
      return window.__archiveSaveGate;
    };
    window.__archiveSavePromise = window.Main.sessionActions.saveWorkspaceArchiveWithScope(
      window.Main.tabs.getSessionActionsContext(),
      { scope: 'workspace', reason: 'e2e-stale-save' }
    );
  });
  await page.waitForFunction(() => window.__deferredArchiveSave?.started === true, null, { timeout: 60_000 });

  const newerRevision = await page.evaluate(() => {
    const session = window.Main?.session;
    const active = session?.getActiveTab?.();
    const payload = structuredClone(active.payload);
    payload.config.whisker = { ...(payload.config.whisker || {}), rule: 'iqr3' };
    session.commitTabPayload(active, payload, { reason: 'e2e-save-race-newer-edit', origin: 'user' });
    return session.workspaceState.sessionRevision;
  });
  expect(newerRevision).toBeGreaterThan(firstRevision);
  await expect.poll(async () => (await readLocalJournalTab(page, await page.evaluate(() => window.Main.session.getActiveTab().id)))?.payload?.config?.whisker?.rule, {
    timeout: 10_000
  }).toBe('iqr3');

  await page.evaluate(() => window.__resolveArchiveSave({
    status: 'saved', via: 'picker', fileName: 'stale-checkpoint.graph'
  }));
  await page.evaluate(async () => {
    window.__archiveSaveResult = await window.__archiveSavePromise;
  });
  const postSave = await page.evaluate(() => {
    const session = window.Main.session;
    const active = session.getActiveTab();
    return {
      result: window.__archiveSaveResult,
      revision: session.workspaceState.sessionRevision,
      sessionDirty: session.workspaceState.sessionDirty,
      sessionUserDirty: session.workspaceState.sessionUserDirty,
      rule: active?.payload?.config?.whisker?.rule,
      tabId: active?.id
    };
  });
  expect(postSave.result).toEqual(expect.objectContaining({ status: 'saved', savedRevision: firstRevision }));
  expect(postSave.revision).toBe(newerRevision);
  expect(postSave.sessionDirty).toBe(true);
  expect(postSave.sessionUserDirty).toBe(true);
  expect(postSave.rule).toBe('iqr3');
  await expect.poll(() => readLocalJournalTab(page, postSave.tabId), { timeout: 10_000 }).toEqual(expect.objectContaining({
    payload: expect.objectContaining({ config: expect.objectContaining({
      whisker: expect.objectContaining({ rule: 'iqr3' })
    }) })
  }));
  await clearIndexedDbCanonicalJournal(page);

  let accepted = false;
  const dialogHandler = async dialog => {
    if (/recover|restore/i.test(dialog.message())) accepted = true;
    await dialog.accept();
  };
  page.on('dialog', dialogHandler);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(() => accepted, { timeout: 20_000 }).toBe(true);
    await page.waitForFunction(() => {
      const state = window.Main?.session?.workspaceState || {};
      const active = (state.tabs || []).find(tab => tab.id === state.activeTabId);
      return active?.payload?.config?.whisker?.rule === 'iqr3'
        && document.querySelector('#boxPage:not([hidden]) #boxWhiskerRule')?.value === 'iqr3';
    }, null, { timeout: 60_000 });
  } finally {
    page.off('dialog', dialogHandler);
  }
});

test('canonical recovery journal preserves an immediate Histogram density change', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await openComponentFromWelcome(page, { type: 'hist', pageId: 'histPage' }, { first: true });
  await page.waitForSelector('#histPage:not([hidden])', { timeout: 30_000 });
  await clickExpectedExampleButton(page, 'histLoadExample');
  await page.waitForSelector('#histPage:not([hidden]) #histPlot svg', { timeout: 30_000 });
  await clearRecoverySnapshot(page);

  const plotMode = page.locator('#histPlotMode');
  await plotMode.click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(plotMode).toHaveValue('density');

  let accepted = false;
  const dialogHandler = async dialog => {
    if (/recover|restore/i.test(dialog.message())) accepted = true;
    await dialog.accept();
  };
  page.on('dialog', dialogHandler);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(() => accepted, {
      timeout: 20_000,
      message: 'canonical journal should trigger Histogram recovery'
    }).toBe(true);
    await page.waitForFunction(() => {
      const state = window.Main?.session?.workspaceState || {};
      const active = (state.tabs || []).find(tab => tab.id === state.activeTabId);
      return active?.type === 'hist'
        && active?.payload?.config?.plotMode === 'density'
        && document.querySelector('#histPage:not([hidden]) #histPlotMode')?.value === 'density'
        && !!document.querySelector('#histPage:not([hidden]) #histPlot svg');
    }, null, { timeout: 60_000 });
  } finally {
    page.off('dialog', dialogHandler);
  }
});

test('canonical recovery journal preserves an immediate Scatter resize', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });
  await clickExpectedExampleButton(page, 'scatterLoadExample');
  await page.waitForFunction(() => !!document.querySelector('#scatterPage:not([hidden]) #scatterPlot svg'), null, { timeout: 30_000 });
  await waitForComponentOwnerReady(page, 'scatter', {
    requireMountedRoot: true,
    requireIdle: true
  });
  await clearRecoverySnapshot(page);

  const before = await page.evaluate(() => {
    const state = window.Main?.session?.workspaceState || {};
    const tab = (state.tabs || []).find(item => item.id === state.activeTabId) || null;
    const box = document.querySelector('#scatterPage:not([hidden]) #scatterGraphPanel .svgbox');
    return {
      tabId: tab?.id || null,
      width: box?.getBoundingClientRect?.().width || 0,
      height: box?.getBoundingClientRect?.().height || 0,
      layoutWidth: tab?.layoutState?.svgBox?.style?.width || null
    };
  });
  expect(before.tabId).toBeTruthy();

  const handle = page.locator('#scatterPage:not([hidden]) #scatterGraphPanel .svgbox .resizer-vertical').first();
  await expect(handle).toBeVisible({ timeout: 10_000 });
  const bounds = await handle.boundingBox();
  expect(bounds).not.toBeNull();
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 120, y, { steps: 12 });
  await page.mouse.up();
  await waitForComponentOwnerReady(page, 'scatter', {
    requireMountedRoot: true,
    requireIdle: true
  });

  const after = await page.evaluate(() => {
    const state = window.Main?.session?.workspaceState || {};
    const tab = (state.tabs || []).find(item => item.id === state.activeTabId) || null;
    const box = document.querySelector('#scatterPage:not([hidden]) #scatterGraphPanel .svgbox');
    return {
      tabId: tab?.id || null,
      width: box?.getBoundingClientRect?.().width || 0,
      layoutWidth: tab?.layoutState?.svgBox?.style?.width || null,
      revision: state.sessionRevision || 0
    };
  });
  expect(after.width).toBeGreaterThan(before.width + 40);
  expect(after.revision).toBeGreaterThan(0);

  await expect.poll(() => readJournalTab(page, before.tabId), {
    timeout: 10_000,
    message: 'canonical journal should contain the resized Scatter layout'
  }).toEqual(expect.objectContaining({
    kind: 'canonical-tab',
    id: before.tabId
  }));
  const journalTab = await readJournalTab(page, before.tabId);
  const journalWidth = journalTab.layout?.svgBox?.style?.width || null;
  expect(journalWidth).toBeTruthy();
  expect(Number.parseFloat(journalWidth)).toBeGreaterThan(Number.parseFloat(before.layoutWidth || '0') + 40);

  let accepted = false;
  const dialogHandler = async dialog => {
    if (/recover|restore/i.test(dialog.message())) accepted = true;
    await dialog.accept();
  };
  page.on('dialog', dialogHandler);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(() => accepted, {
      timeout: 20_000,
      message: 'canonical journal should trigger Scatter recovery'
    }).toBe(true);
    await page.waitForFunction(({ expectedWidth }) => {
      const state = window.Main?.session?.workspaceState || {};
      const active = (state.tabs || []).find(tab => tab.id === state.activeTabId) || null;
      const box = document.querySelector('#scatterPage:not([hidden]) #scatterGraphPanel .svgbox');
      const actualWidth = Number(box?.getBoundingClientRect?.().width || 0);
      return active?.type === 'scatter'
        && Math.abs(actualWidth - expectedWidth) <= 3
        && !!document.querySelector('#scatterPage:not([hidden]) #scatterPlot svg');
    }, { expectedWidth: Number.parseFloat(journalWidth) }, { timeout: 60_000 });
  } finally {
    page.off('dialog', dialogHandler);
  }
});

test('discarding one unsaved tab preserves another tab in the recovery journal', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await clearRecoverySnapshot(page);
  await openComponentFromWelcome(page, { type: 'venn', pageId: 'vennPage' }, { first: true });

  await page.locator('#vennPage details').first().locator('summary').click();
  await page.locator('#nA').fill('12');
  await page.locator('#nB').fill('9');
  await page.locator('#nAB').fill('4');
  await page.locator('#useNumeric').click();
  const firstTabId = await page.evaluate(() => window.Main.session.workspaceState.activeTabId);

  await page.evaluate(async () => {
    await window.Main.tabs.handleAddTabClick();
    await window.Main.tabs.handleGraphSelection('venn', { reason: 'e2e-discard-one-tab' });
  });
  await expect(page.locator('#duplicatePrompt:not([hidden])')).toBeVisible();
  await page.locator('#duplicateReuse').click({ force: true });
  await page.waitForSelector('#vennPage:not([hidden])', { timeout: 20_000 });
  const secondTabId = await page.evaluate(firstId => {
    const state = window.Main.session.workspaceState;
    return state.tabs.find(tab => tab.type === 'venn' && tab.id !== firstId)?.id || null;
  }, firstTabId);
  expect(secondTabId).toBeTruthy();

  await page.locator('#vennPage details').first().locator('summary').click();
  await page.locator('#nA').fill('17');
  await page.locator('#nB').fill('11');
  await page.locator('#nAB').fill('5');
  await page.evaluate(() => window.Main.session.flushCanonicalUserMutationState());
  const payloadBeforeDiscard = await page.evaluate(tabId => {
    const tab = window.Main.session.workspaceState.tabs.find(item => item.id === tabId);
    return JSON.parse(JSON.stringify(tab?.payload || null));
  }, secondTabId);
  expect(payloadBeforeDiscard).toBeTruthy();
  await expect.poll(() => readJournalTab(page, secondTabId), { timeout: 15_000 })
    .toEqual(expect.objectContaining({ payload: payloadBeforeDiscard }));

  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${firstTabId}"]`).click({ button: 'right' });
  await page.locator('#tabContextDelete').click();
  await expect(page.locator('#unsavedPrompt')).toBeVisible();
  await page.locator('#unsavedPromptDiscard').click();
  await expect(page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${firstTabId}"]`)).toHaveCount(0);
  await expect(page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${secondTabId}"]`)).toHaveCount(1);

  await expect.poll(async () => ({
    localPayload: (await readLocalJournalTab(page, secondTabId))?.payload || null,
    indexedDbPayload: (await readJournalTab(page, secondTabId))?.payload || null
  }), { timeout: 15_000 }).toEqual({
    localPayload: payloadBeforeDiscard,
    indexedDbPayload: payloadBeforeDiscard
  });

  let accepted = false;
  const dialogHandler = async dialog => {
    if (/recover|restore/i.test(dialog.message())) accepted = true;
    await dialog.accept();
  };
  page.on('dialog', dialogHandler);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(() => accepted, { timeout: 20_000 }).toBe(true);
    await page.waitForFunction(tabId => {
      const state = window.Main?.session?.workspaceState || {};
      const tabs = (state.tabs || []).filter(tab => !tab.isWelcome && tab.type === 'venn');
      const tab = tabs.find(item => item.id === tabId) || null;
      return tabs.length === 1 && !!tab?.payload && state.activeTabId === tabId;
    }, secondTabId, { timeout: 45_000 });
    const payloadAfterRecovery = await page.evaluate(tabId => {
      const tab = window.Main.session.workspaceState.tabs.find(item => item.id === tabId);
      return JSON.parse(JSON.stringify(tab?.payload || null));
    }, secondTabId);
    expect(payloadAfterRecovery).toEqual(payloadBeforeDiscard);
  } finally {
    page.off('dialog', dialogHandler);
  }
});
