const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

async function clearDocumentStateDb(page) {
  await page.evaluate(() => {
    window.localStorage.removeItem('graphitix.canonical-journal.v1');
    return new Promise((resolve, reject) => {
    const request = window.indexedDB.open('graphitix-document-state', 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots');
      if (!db.objectStoreNames.contains('canonical-journal')) db.createObjectStore('canonical-journal');
    };
    request.onsuccess = () => {
      const db = request.result;
      const stores = Array.from(db.objectStoreNames).filter(name => name === 'snapshots' || name === 'canonical-journal');
      if (!stores.length) { db.close(); resolve(); return; }
      const tx = db.transaction(stores, 'readwrite');
      stores.forEach(name => tx.objectStore(name).clear());
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
    request.onerror = () => reject(request.error);
    });
  });
}

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

test('canonical recovery journal restores an edit made immediately before reload', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  await page.waitForSelector('#boxPage:not([hidden])', { timeout: 30_000 });
  await clickExampleButtonIfPresent(page, 'boxLoadExample');
  await page.waitForTimeout(1_000);
  await clearDocumentStateDb(page);

  const mutation = await page.evaluate(() => {
    const session = window.Main?.session;
    const active = session?.getActiveTab?.();
    if (!active?.payload) throw new Error('Box payload unavailable');
    const changed = session.commitTabPayload(active, {
      ...active.payload,
      __canonicalJournalProbe: 'latest-user-edit'
    }, { reason: 'e2e-canonical-journal-edit', origin: 'user' });
    return {
      changed,
      revision: session.workspaceState.sessionRevision,
      tabId: active.id
    };
  });
  expect(mutation.changed).toBe(true);

  await expect.poll(() => readJournalMeta(page), {
    timeout: 10_000,
    message: 'canonical journal should be written before the reload'
  }).toEqual(expect.objectContaining({
    kind: 'canonical-journal',
    revision: mutation.revision,
    tabCount: 1
  }));

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
        && active?.payload?.__canonicalJournalProbe === 'latest-user-edit'
        && !!document.querySelector('#boxPage:not([hidden]) #boxPlot svg');
    }, null, { timeout: 60_000 });
  } finally {
    page.off('dialog', dialogHandler);
  }
});

test('canonical recovery journal preserves immediate Box control changes', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  await page.waitForSelector('#boxPage:not([hidden])', { timeout: 30_000 });
  await clickExampleButtonIfPresent(page, 'boxLoadExample');
  await page.waitForSelector('#boxPage:not([hidden]) #boxPlot svg', { timeout: 30_000 });
  await clearDocumentStateDb(page);

  const graphType = page.locator('#boxGraphType');
  await graphType.click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await expect(page.locator('#boxWhiskerRule')).toBeVisible({ timeout: 10_000 });
  const whiskerRule = page.locator('#boxWhiskerRule');
  await whiskerRule.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => {
    const state = window.Main?.session?.workspaceState || {};
    const active = (state.tabs || []).find(tab => tab.id === state.activeTabId);
    return active?.payload?.config?.graphType === 'box'
      && active?.payload?.config?.whisker?.rule === 'custom';
  }, null, { timeout: 15_000 });

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
});

test('canonical recovery journal preserves an immediate Histogram density change', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await openComponentFromWelcome(page, { type: 'hist', pageId: 'histPage' }, { first: true });
  await page.waitForSelector('#histPage:not([hidden])', { timeout: 30_000 });
  await clickExampleButtonIfPresent(page, 'histLoadExample');
  await page.waitForSelector('#histPage:not([hidden]) #histPlot svg', { timeout: 30_000 });
  await clearDocumentStateDb(page);

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
  await clickExampleButtonIfPresent(page, 'scatterLoadExample');
  await page.waitForFunction(() => !!document.querySelector('#scatterPage:not([hidden]) #scatterPlot svg'), null, { timeout: 30_000 });
  await page.waitForTimeout(700);
  await clearDocumentStateDb(page);

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
  await page.waitForTimeout(250);

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
