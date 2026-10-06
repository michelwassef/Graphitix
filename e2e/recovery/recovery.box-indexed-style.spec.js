const { test, expect } = require('@playwright/test');
const {
  openComponentFromWelcome,
  clickExpectedExampleButton
} = require('../helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { clearRecoverySnapshot } = require('../helpers/recoveryDriver');

async function readJournalTab(page, tabId) {
  return page.evaluate(({ tabId }) => new Promise(resolve => {
    const request = window.indexedDB.open('graphitix-document-state', 2);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('canonical-journal')) {
        db.close();
        resolve(null);
        return;
      }
      const transaction = db.transaction('canonical-journal', 'readonly');
      const get = transaction.objectStore('canonical-journal').get(`tab:${tabId}`);
      get.onsuccess = () => { db.close(); resolve(get.result || null); };
      get.onerror = () => { db.close(); resolve(null); };
    };
    request.onerror = () => resolve(null);
  }), { tabId });
}

test('canonical recovery restores Box indexed styles from the owner session', async ({ page }) => {
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
    const box = window.Components?.box;
    const tab = window.Main?.session?.getActiveTab?.();
    const owner = tab?.id ? box?.__testHooks?.getSession?.(tab.id) : null;
    if (!owner || !box?.__testHooks?.persistTraceShapeStyle) {
      throw new Error('Box indexed style writer or owner session is unavailable.');
    }
    box.__testHooks.persistTraceShapeStyle(0, { fill: '#0e7490' });
    return {
      tabId: tab.id
    };
  });

  await expect.poll(() => readJournalTab(page, mutation.tabId), {
    timeout: 10_000,
    message: 'canonical journal should contain the Box indexed style edit'
  }).toEqual(expect.objectContaining({
    kind: 'canonical-tab',
    id: mutation.tabId,
    payload: expect.objectContaining({
      config: expect.objectContaining({
        shapeStyles: expect.objectContaining({
          0: expect.objectContaining({ fill: '#0e7490' })
        })
      })
    })
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
      message: 'canonical journal should trigger Box recovery'
    }).toBe(true);
    await page.waitForFunction(() => {
      const state = window.Main?.session?.workspaceState || {};
      const active = (state.tabs || []).find(tab => tab.id === state.activeTabId);
      const owner = active?.id ? window.Components?.box?.__testHooks?.getSession?.(active.id) : null;
      return active?.type === 'box'
        && active?.payload?.config?.shapeStyles?.[0]?.fill === '#0e7490'
        && owner?.state?.styles?.traceShapeStyles?.[0]?.fill === '#0e7490'
        && !!document.querySelector('#boxPage:not([hidden]) #boxPlot svg');
    }, null, { timeout: 60_000 });

    const postRecoveryEdit = await page.evaluate(() => {
      const tab = window.Main?.session?.getActiveTab?.();
      const hooks = window.Components?.box?.__testHooks;
      const owner = tab?.id ? hooks?.getSession?.(tab.id) : null;
      if (!owner || !hooks?.persistTraceShapeStyle) {
        throw new Error('Recovered Box owner or indexed style writer is unavailable.');
      }
      hooks.persistTraceShapeStyle(0, { stroke: '#123abc' });
      return {
        fill: owner.state.styles?.traceShapeStyles?.[0]?.fill || null,
        stroke: owner.state.styles?.traceShapeStyles?.[0]?.stroke || null,
        payloadStroke: tab.payload?.config?.shapeStyles?.[0]?.stroke || null
      };
    });
    expect(postRecoveryEdit).toEqual({ fill: '#0e7490', stroke: '#123abc', payloadStroke: '#123abc' });
  } finally {
    page.off('dialog', dialogHandler);
  }
});
