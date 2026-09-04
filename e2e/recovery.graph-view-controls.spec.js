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
        const stores = Array.from(db.objectStoreNames)
          .filter(name => name === 'snapshots' || name === 'canonical-journal');
        if (!stores.length) {
          db.close();
          resolve();
          return;
        }
        const tx = db.transaction(stores, 'readwrite');
        stores.forEach(name => tx.objectStore(name).clear());
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
      request.onerror = () => reject(request.error);
    });
  });
}

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
      const tx = db.transaction('canonical-journal', 'readonly');
      const get = tx.objectStore('canonical-journal').get(`tab:${tabId}`);
      get.onsuccess = () => { db.close(); resolve(get.result || null); };
      get.onerror = () => { db.close(); resolve(null); };
    };
    request.onerror = () => resolve(null);
  }), { tabId });
}

async function chooseTrustedOption(page, selector, value) {
  const control = page.locator(selector).first();
  await expect(control).toBeVisible({ timeout: 20_000 });
  await expect(control).toBeEnabled({ timeout: 20_000 });
  const index = await control.evaluate((node, target) => Array.from(node.options || [])
    .findIndex(option => option.value === target), value);
  expect(index).toBeGreaterThanOrEqual(0);
  if (await control.inputValue() !== value) {
    await control.focus();
    await control.press('Home');
    for (let i = 0; i < index; i += 1) {
      await control.press('ArrowDown');
    }
    await control.press('Enter');
  }
  await expect(control).toHaveValue(value, { timeout: 20_000 });
}

async function readPayloadValue(page, path) {
  return page.evaluate(pathParts => {
    const state = window.Main?.session?.workspaceState || {};
    const active = (state.tabs || []).find(tab => tab.id === state.activeTabId);
    let value = active?.payload || null;
    for (const part of pathParts) value = value == null ? undefined : value[part];
    return value;
  }, path);
}

async function readLocalJournalValue(page, tabId, path) {
  return page.evaluate(({ tabId, path }) => {
    const raw = window.localStorage.getItem('graphitix.canonical-journal.v1');
    if (!raw) return undefined;
    const journal = JSON.parse(raw);
    const tab = (journal.tabs || []).find(item => item.id === tabId);
    let value = tab?.payload || null;
    for (const part of path) value = value == null ? undefined : value[part];
    return value;
  }, { tabId, path });
}

async function prepareComponent(page, scenario) {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await openComponentFromWelcome(page, { type: scenario.type, pageId: scenario.pageId }, { first: true });
  await page.waitForSelector(`${scenario.root}:not([hidden])`, { timeout: 30_000 });
  await clickExampleButtonIfPresent(page, scenario.exampleButtonId);
  await page.waitForFunction(selector => !!document.querySelector(selector), scenario.renderSelector, {
    timeout: 45_000
  });
  if (scenario.prepare) await scenario.prepare(page);
  await clearDocumentStateDb(page);
}

async function runImmediateRecoveryCase(page, scenario) {
  test.setTimeout(150_000);
  await prepareComponent(page, scenario);
  await chooseTrustedOption(page, scenario.controlSelector, scenario.value);
  await page.waitForFunction(({ path, value, type }) => {
    const state = window.Main?.session?.workspaceState || {};
    const active = (state.tabs || []).find(tab => tab.id === state.activeTabId);
    let actual = active?.payload || null;
    for (const part of path) actual = actual == null ? undefined : actual[part];
    return active?.type === type && actual === value;
  }, { path: scenario.payloadPath, value: scenario.value, type: scenario.type }, { timeout: 30_000 });

  const tabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  expect(tabId).toBeTruthy();
  await expect.poll(() => readLocalJournalValue(page, tabId, scenario.payloadPath), {
    timeout: 10_000,
    message: `${scenario.name}: immediate canonical mirror did not contain the control value`
  }).toBe(scenario.value);
  await expect.poll(() => readJournalTab(page, tabId).then(tab => {
    let actual = tab?.payload || null;
    for (const part of scenario.payloadPath) actual = actual == null ? undefined : actual[part];
    return actual;
  }), {
    timeout: 20_000,
    message: `${scenario.name}: durable canonical journal did not contain the control value`
  }).toBe(scenario.value);

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
      message: `${scenario.name}: recovery prompt was not shown`
    }).toBe(true);
    await page.waitForFunction(({ root, selector, renderSelector, path, value, type }) => {
      const state = window.Main?.session?.workspaceState || {};
      const active = (state.tabs || []).find(tab => tab.id === state.activeTabId);
      let actual = active?.payload || null;
      for (const part of path) actual = actual == null ? undefined : actual[part];
      return active?.type === type
        && actual === value
        && document.querySelector(`${root}:not([hidden]) ${selector}`)?.value === value
        && !!document.querySelector(`${root}:not([hidden]) ${renderSelector}`);
    }, {
      root: scenario.root,
      selector: scenario.controlSelector,
      renderSelector: scenario.renderSelector,
      path: scenario.payloadPath,
      value: scenario.value,
      type: scenario.type
    }, { timeout: 60_000 });
  } finally {
    page.off('dialog', dialogHandler);
  }
}

const scenarios = [
  {
    name: 'Box graph type',
    type: 'box', pageId: 'boxPage', root: '#boxPage',
    exampleButtonId: 'boxLoadExample', controlSelector: '#boxGraphType', value: 'box',
    payloadPath: ['config', 'graphType'], renderSelector: '#boxPlot svg'
  },
  {
    name: 'Scatter graph type',
    type: 'scatter', pageId: 'scatterPage', root: '#scatterPage',
    exampleButtonId: 'scatterLoadExample', controlSelector: '#scatterGraphType', value: 'volcano',
    payloadPath: ['config', 'graphType'], renderSelector: '#scatterPlot svg'
  },
  {
    name: 'Scatter 3D view',
    type: 'scatter', pageId: 'scatterPage', root: '#scatterPage',
    exampleButtonId: 'scatterLoadExample', controlSelector: '#scatterViewMode', value: '3d',
    payloadPath: ['config', 'viewMode'], renderSelector: '#scatterPlot svg',
    prepare: async page => {
      await chooseTrustedOption(page, '#scatterViewMode', '3d');
      await clickExampleButtonIfPresent(page, 'scatterLoadExample');
      await page.waitForFunction(() => document.querySelector('#scatterPage:not([hidden]) #scatterPlot svg')?.dataset?.viewMode === '3d', null, { timeout: 45_000 });
      await chooseTrustedOption(page, '#scatterViewMode', '2d');
      await page.waitForFunction(() => document.querySelector('#scatterPage:not([hidden]) #scatterPlot svg')?.dataset?.viewMode === '2d', null, { timeout: 45_000 });
    }
  },
  {
    name: 'PCA 3D view',
    type: 'pca', pageId: 'pcaPage', root: '#pcaPage',
    exampleButtonId: 'pcaLoadExample', controlSelector: '#pcaViewMode', value: '3d',
    payloadPath: ['config', 'viewMode'], renderSelector: '#pcaPlot svg'
  },
  {
    name: 'Line area mode',
    type: 'line', pageId: 'linePage', root: '#linePage',
    exampleButtonId: 'lineLoadExample', controlSelector: '#lineDisplayMode', value: 'area',
    payloadPath: ['config', 'displayMode'], renderSelector: '#linePlot svg'
  },
  {
    name: 'Line 3D view',
    type: 'line', pageId: 'linePage', root: '#linePage',
    exampleButtonId: 'lineLoadExample', controlSelector: '#lineViewMode', value: '3d',
    payloadPath: ['config', 'viewMode'], renderSelector: '#linePlot svg'
  },
  {
    name: 'Heatmap data-values view',
    type: 'heatmap', pageId: 'heatmapPage', root: '#heatmapPage',
    exampleButtonId: 'heatmapLoadExample', controlSelector: '#heatmapView', value: 'values',
    payloadPath: ['config', 'view'], renderSelector: '#heatmapSvg'
  },
  {
    name: 'ROC precision-recall graph',
    type: 'roc', pageId: 'rocPage', root: '#rocPage',
    exampleButtonId: 'rocLoadExample', controlSelector: '#rocGraphType', value: 'pr',
    payloadPath: ['config', 'graphType'], renderSelector: '#rocSvg'
  },
  {
    name: 'Histogram density graph',
    type: 'hist', pageId: 'histPage', root: '#histPage',
    exampleButtonId: 'histLoadExample', controlSelector: '#histPlotMode', value: 'density',
    payloadPath: ['config', 'plotMode'], renderSelector: '#histPlot svg'
  },
  {
    name: 'Pie stacked graph',
    type: 'pie', pageId: 'piePage', root: '#piePage',
    exampleButtonId: 'pieLoadExample', controlSelector: '#pieChartType', value: 'stacked',
    payloadPath: ['config', 'chartType'], renderSelector: '#piePlot svg'
  }
];

for (const scenario of scenarios) {
  test(`immediate recovery: ${scenario.name}`, async ({ page }) => {
    await runImmediateRecoveryCase(page, scenario);
  });
}
