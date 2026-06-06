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

const STATS_COMPONENT_CASES = [
  {
    key: 'box',
    component: { type: 'box', pageId: 'boxPage' },
    exampleButtonId: 'boxLoadExample',
    pageVisibleSelector: '#boxPage:not([hidden])'
  },
  {
    key: 'scatter',
    component: { type: 'scatter', pageId: 'scatterPage' },
    exampleButtonId: 'scatterLoadExample',
    pageVisibleSelector: '#scatterPage:not([hidden])'
  },
  {
    key: 'line',
    component: { type: 'line', pageId: 'linePage' },
    exampleButtonId: 'lineLoadExample',
    pageVisibleSelector: '#linePage:not([hidden])'
  },
  {
    key: 'pie',
    component: { type: 'pie', pageId: 'piePage' },
    exampleButtonId: 'pieLoadExample',
    pageVisibleSelector: '#piePage:not([hidden])'
  },
  {
    key: 'hist',
    component: { type: 'hist', pageId: 'histPage' },
    exampleButtonId: 'histLoadExample',
    pageVisibleSelector: '#histPage:not([hidden])'
  },
  {
    key: 'roc',
    component: { type: 'roc', pageId: 'rocPage' },
    exampleButtonId: 'rocLoadExample',
    pageVisibleSelector: '#rocPage:not([hidden])'
  },
  {
    key: 'survival',
    component: { type: 'survival', pageId: 'survivalPage' },
    exampleButtonId: 'survivalLoadExample',
    pageVisibleSelector: '#survivalPage:not([hidden])'
  },
  {
    key: 'pca',
    component: { type: 'pca', pageId: 'pcaPage' },
    exampleButtonId: 'pcaLoadExample',
    pageVisibleSelector: '#pcaPage:not([hidden])'
  },
  {
    key: 'heatmap',
    component: { type: 'heatmap', pageId: 'heatmapPage' },
    exampleButtonId: 'heatmapLoadExample',
    pageVisibleSelector: '#heatmapPage:not([hidden])'
  },
  {
    key: 'surface',
    component: { type: 'surface', pageId: 'surfacePage' },
    exampleButtonId: 'surfaceLoadExample',
    pageVisibleSelector: '#surfacePage:not([hidden])'
  }
];

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

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const usedComponentButton = await clickExampleButtonIfPresent(page, componentCase.exampleButtonId);
    if (usedComponentButton) {
      await page.waitForTimeout(900);
      return;
    }
    const clickedById = await clickByIdInActiveWorkspace();
    if (clickedById) {
      await page.waitForTimeout(900);
      return;
    }
    await page.waitForTimeout(220);
  }
  throw new Error(`Unable to trigger example load for component ${componentCase.key}`);
}

async function waitForStatsReady(page, componentCase) {
  const key = componentCase.key;
  if (key === 'box') {
    await expect(page.locator('#boxComputeStats')).toBeEnabled({ timeout: 25_000 });
    await page.locator('#boxComputeStats').click();
    await expect(page.locator('#boxStatsStatus')).toContainText('Statistics up to date.', { timeout: 40_000 });
    await expect(page.locator('#boxComputeStats')).toHaveText(/Recalculate statistics/i, { timeout: 20_000 });
    await expect(page.locator('#statsResults')).not.toContainText('Statistics will appear after calculation.', { timeout: 20_000 });
    return;
  }
  if (key === 'scatter') {
    await expect(page.locator('#scatterComputeStats')).toBeEnabled({ timeout: 25_000 });
    await page.locator('#scatterComputeStats').click();
    await expect(page.locator('#scatterStatsStatus')).toContainText('Statistics up to date.', { timeout: 40_000 });
    await expect(page.locator('#scatterComputeStats')).toHaveText(/Recalculate statistics/i, { timeout: 20_000 });
    await expect(page.locator('#scatterStatsResults')).not.toContainText('Statistics will appear after calculation.', { timeout: 20_000 });
    return;
  }
  if (key === 'line') {
    await page.waitForFunction(() => {
      const payload = window.Components?.line?.getPayload?.();
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      return rows.length > 2 && rows.some((row, index) => index > 0 && Array.isArray(row) && row.some(cell => cell !== '' && cell != null));
    }, null, { timeout: 35_000 });
    await expect(page.locator('#lineComputeStats')).toBeEnabled({ timeout: 25_000 });
    await page.locator('#lineComputeStats').click();
    await expect(page.locator('#lineStatsStatus')).toContainText('Statistics up to date.', { timeout: 40_000 });
    await expect(page.locator('#lineComputeStats')).toHaveText(/Recalculate statistics/i, { timeout: 20_000 });
    await expect(page.locator('#lineStatsResults')).not.toContainText('Statistics will appear after calculation.', { timeout: 20_000 });
    return;
  }
  if (key === 'pie') {
    await page.waitForFunction(() => {
      const payload = window.Components?.pie?.getPayload?.();
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      return rows.length > 1;
    }, null, { timeout: 35_000 });
    await expect(page.locator('#pieComputeStats')).toBeEnabled({ timeout: 25_000 });
    await page.locator('#pieComputeStats').click();
    await expect(page.locator('#pieStatsStatus')).toContainText('Statistics up to date.', { timeout: 40_000 });
    await expect(page.locator('#pieComputeStats')).toHaveText(/Recalculate statistics/i, { timeout: 20_000 });
    await expect(page.locator('#pieStatsResults')).not.toContainText('Statistics will appear after calculation.', { timeout: 20_000 });
    return;
  }
  if (key === 'survival') {
    await page.evaluate(() => {
      const hazardToggle = document.getElementById('survivalShowHazardRatios');
      const coxToggle = document.getElementById('survivalFitCox');
      if (hazardToggle) {
        hazardToggle.checked = true;
        hazardToggle.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (coxToggle) {
        coxToggle.checked = true;
        coxToggle.dispatchEvent(new Event('change', { bubbles: true }));
      }
      window.Components?.survival?.draw?.();
    });
    await expect(page.locator('#survivalStatsLogRank')).toContainText(/Survival Curve Comparisons|Pairwise Log-rank/i, { timeout: 40_000 });
    await expect(page.locator('#survivalStatsCox')).toContainText(/Cox Model|Reporting and reproducibility/i, { timeout: 40_000 });
    return;
  }
  if (key === 'pca') {
    await expect(page.locator('#pcaStatsResults')).toContainText(/Reporting and reproducibility|PCA|component/i, { timeout: 40_000 });
    return;
  }
  if (key === 'heatmap') {
    await page.evaluate(() => {
      window.Components?.heatmap?.draw?.();
    });
    await expect(page.locator('#heatmapStatsContent')).toContainText(/Items analysed|Rows|Reporting and reproducibility|Pairs evaluated/i, { timeout: 40_000 });
    return;
  }
  if (key === 'surface') {
    await page.evaluate(() => {
      window.Components?.surface?.draw?.();
    });
    await expect(page.locator('#surfaceStatsSummary')).toContainText(/Reporting and reproducibility|Vertices|Faces|Grid/i, { timeout: 40_000 });
    return;
  }
  if (key === 'hist') {
    await page.evaluate(() => {
      window.Components?.hist?.draw?.();
    });
    await expect(page.locator('#histStatsResults')).toContainText(/Descriptive statistics|Distribution comparison|Reporting and reproducibility/i, { timeout: 40_000 });
    return;
  }
  if (key === 'roc') {
    await page.evaluate(() => {
      window.Components?.roc?.draw?.();
    });
    await expect(page.locator('#rocStatsResults')).toContainText(/ROC metrics|AUC|Precision.?Recall|Reporting and reproducibility/i, { timeout: 40_000 });
  }
}

async function waitForRestoredStats(page, componentCase) {
  await waitForStatsReady(page, componentCase);
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
  await page.waitForTimeout(900);
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

async function openComponentAndPrepareStats(page, componentCase) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await openComponentFromWelcome(page, componentCase.component, { first: true });
  await page.waitForFunction(
    componentType => !!window.Components?.[componentType]?.ready,
    componentCase.component.type,
    { timeout: 35_000 }
  );
  await ensureExampleLoaded(page, componentCase);
  await waitForStatsReady(page, componentCase);
}

async function seedRecoverySnapshotFromWorkspace(page) {
  return page.evaluate(async () => {
    const openWebDb = () => new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB unavailable.'));
        return;
      }
      const request = window.indexedDB.open('graphitix-document-state', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('snapshots')) {
          db.createObjectStore('snapshots');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB open failed.'));
    });
    const putRecoverySnapshot = async record => {
      const db = await openWebDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('snapshots', 'readwrite');
        tx.objectStore('snapshots').put(record, 'active-recovery');
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error || new Error('IndexedDB snapshot write failed.'));
      });
    };
    const tabsApi = window.Main?.tabs;
    const sessionActions = window.Main?.sessionActions;
    const workspaceState = window.Main?.session?.workspaceState || {};
    if (!tabsApi || typeof tabsApi.getSessionActionsContext !== 'function') {
      throw new Error('Main.tabs.getSessionActionsContext unavailable');
    }
    if (!sessionActions || typeof sessionActions.buildWorkspaceArchiveBlob !== 'function') {
      throw new Error('Main.sessionActions.buildWorkspaceArchiveBlob unavailable');
    }
    const graphTabs = Array.isArray(workspaceState.tabs)
      ? workspaceState.tabs.filter(tab => tab && !tab.isWelcome && tab.type)
      : [];
    const context = tabsApi.getSessionActionsContext();
    const blob = await sessionActions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace',
      snapshotKind: 'lifecycle-checkpoint',
      policyMode: 'recovery',
      reason: 'recovery-interval',
      idleForMs: 8000,
      useWorker: true
    });
    if (!blob) {
      return { status: 'skipped', reason: 'empty' };
    }
    await putRecoverySnapshot({
      meta: {
        app: 'Graphitix',
        kind: 'recovery',
        version: 1,
        savedAt: new Date().toISOString(),
        updatedAt: Date.now(),
        reason: 'recovery-interval',
        dirty: true,
        hasData: true,
        tabCount: graphTabs.length,
        fileName: workspaceState.sessionFileName || 'workspace.graph',
        filePath: workspaceState.sessionFilePath || '',
        fileScope: workspaceState.sessionFileScope || 'workspace'
      },
      blob
    });
    return { status: 'saved', bytes: blob.size };
  });
}

async function reloadAndAcceptRecoveryIfPrompted(page) {
  let acceptedDialog = false;
  const dialogHandler = async dialog => {
    acceptedDialog = true;
    await dialog.accept();
  };
  page.on('dialog', dialogHandler);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1100);
  } finally {
    page.off('dialog', dialogHandler);
  }
  return acceptedDialog;
}

for (const componentCase of STATS_COMPONENT_CASES) {
  test(`archive reopen keeps ${componentCase.key} statistics after tab switch`, async ({ page }) => {
    test.setTimeout(240_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);

    await openComponentAndPrepareStats(page, componentCase);
    const { archivePath, size } = await captureWorkspaceArchive(page, componentCase.key);
    expect(size).toBeGreaterThan(0);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
    await loadWorkspaceArchive(page, archivePath);
    await expect(page.locator(componentCase.pageVisibleSelector)).toBeVisible({ timeout: 40_000 });

    await waitForRestoredStats(page, componentCase);

    await activateWorkspaceTabByExactTitle(page, /^Welcome$/i);
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
    await activateFirstGraphTab(page);
    await expect(page.locator(componentCase.pageVisibleSelector)).toBeVisible({ timeout: 20_000 });

    await waitForRestoredStats(page, componentCase);
    expect(issues.critical).toEqual([]);
  });

  test(`recovery restore keeps ${componentCase.key} statistics after tab switch`, async ({ page }) => {
    test.setTimeout(240_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);

    await openComponentAndPrepareStats(page, componentCase);
    const snapshotResult = await seedRecoverySnapshotFromWorkspace(page);
    expect(snapshotResult?.status).toBe('saved');

    await reloadAndAcceptRecoveryIfPrompted(page);
    await expect(page.locator(componentCase.pageVisibleSelector)).toBeVisible({ timeout: 40_000 });
    await waitForRestoredStats(page, componentCase);

    await activateWorkspaceTabByExactTitle(page, /^Welcome$/i);
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
    await activateFirstGraphTab(page);
    await expect(page.locator(componentCase.pageVisibleSelector)).toBeVisible({ timeout: 20_000 });

    await waitForRestoredStats(page, componentCase);
    expect(issues.critical).toEqual([]);
  });
}
