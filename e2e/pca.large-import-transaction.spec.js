const path = require('path');
const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

const LARGE_PCA_CSV = path.resolve(__dirname, '..', '__tests__', 'test-PCA.csv');

async function openPca(page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await openComponentFromWelcome(page, {
    type: 'pca',
    pageId: 'pcaPage',
    exampleButtonId: 'pcaLoadExample'
  }, { first: true });
  await page.waitForFunction(() => !!window.Components?.pca?.ready, null, { timeout: 30_000 });
  await page.locator('#pcaPage:not([hidden]) #pcaFile').evaluate(input => {
    input.dataset.importOptionsConfirmed = 'true';
  });
}

async function addSecondPcaTab(page) {
  const firstTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  await page.evaluate(async () => {
    const tabs = window.Main?.tabs;
    await tabs?.handleAddTabClick?.();
    await tabs?.handleGraphSelection?.('pca', { reason: 'e2e-large-import-second-pca' });
    const prompt = document.querySelector('#duplicatePrompt:not([hidden])');
    const emptyButton = document.getElementById('duplicateEmpty');
    if(prompt && emptyButton && !emptyButton.disabled){
      emptyButton.click();
    }
  });
  await page.waitForFunction(id => {
    const activeId = window.Main?.session?.workspaceState?.activeTabId || null;
    return !!activeId && activeId !== id && window.Main?.session?.getActiveTab?.()?.type === 'pca';
  }, firstTabId, { timeout: 30_000 });
  const secondTabId = await page.evaluate(() => window.Main.session.workspaceState.activeTabId);
  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${firstTabId}"]`).click();
  await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, firstTabId);
  return { firstTabId, secondTabId };
}

test.describe('PCA owner-scoped large import transaction', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await installLocalCdnOverrides(page);
  });

  test('paints the 75k-row grid before issuing one final graph projection', async ({ page }, testInfo) => {
    const issues = registerIssueCollectors(page);
    await openPca(page);
    const tabId = await page.evaluate(() => window.Main.session.workspaceState.activeTabId);

    await page.locator('#pcaPage:not([hidden]) #pcaFile').setInputFiles(LARGE_PCA_CSV);
    await page.waitForFunction(() => (
      document.querySelectorAll('#pcaPage:not([hidden]) #pcaSvg [data-plot-point="1"]').length === 20
      && document.body.innerText.includes('Variables analysed: 75440')
    ), null, { timeout: 60_000 });

    const result = await page.evaluate(id => {
      const tab = window.Main.session.workspaceState.tabs.find(item => item?.id === id);
      return {
        transaction: window.Shared.hot.getLastOwnerProjectionTransaction(id),
        rows: tab.payload.data.length,
        payloadDirty: tab.payloadDirty === true,
        points: document.querySelectorAll('#pcaPage:not([hidden]) #pcaSvg [data-plot-point="1"]').length,
        gridText: document.querySelector('#pcaPage:not([hidden]) .ag-center-cols-container')?.textContent || ''
      };
    }, tabId);
    const recovery = await page.evaluate(async id => {
      const phases = {};
      const context = window.Main.tabs.getSessionActionsContext();
      const blob = await window.Main.sessionActions.buildWorkspaceArchiveBlob(context, {
        scope: 'workspace',
        snapshotKind: 'recovery',
        policyMode: 'recovery',
        reason: 'e2e-large-pca-recovery',
        useWorker: true,
        onPhase: metric => { phases[metric.phase] = metric.ms; }
      });
      const parsed = await window.Shared.graphArchive.parseFile(blob, { fileName: 'large-pca-recovery.graph' });
      const restored = parsed?.session?.tabs?.find(tab => tab?.runtimeTabId === id)
        || parsed?.session?.tabs?.[0]
        || null;
      return {
        phases,
        bytes: blob?.size || 0,
        rows: restored?.payload?.data?.length || 0,
        hasRenderCache: !!restored?.archiveRenderCache
      };
    }, tabId);
    await testInfo.attach('large-import-transaction.json', {
      body: JSON.stringify({ result, recovery }, null, 2),
      contentType: 'application/json'
    });

    expect(result.rows).toBe(75442);
    expect(result.points).toBe(20);
    expect(result.gridText).toContain('Condition 1');
    expect(result.gridText).toContain('180');
    expect(result.transaction).toEqual(expect.objectContaining({
      projected: true,
      finalProjectionRequests: 1
    }));
    expect(result.transaction.paintWaitMs).toBeLessThan(8000);
    expect(recovery.rows).toBe(75442);
    expect(recovery.hasRenderCache).toBe(true);
    expect(recovery.phases['worker-transfer']).toBeLessThan(1000);
    expect(issues.critical).toEqual([]);
  });

  test('rejects stale projection after switching to another PCA tab', async ({ page }) => {
    const issues = registerIssueCollectors(page);
    await openPca(page);
    const { firstTabId, secondTabId } = await addSecondPcaTab(page);
    await page.evaluate(({ ownerId, nextId }) => {
      const original = window.Shared.hot.awaitOwnerProjectionPaint;
      window.Shared.hot.awaitOwnerProjectionPaint = async transaction => {
        if(transaction?.tabId === ownerId){
          await window.Main.tabs.activateTab(nextId, { reason: 'e2e-import-stale-owner-switch' });
        }
        return original(transaction);
      };
    }, { ownerId: firstTabId, nextId: secondTabId });
    const input = page.locator('#pcaPage:not([hidden]) #pcaFile');
    await input.evaluate(node => { node.dataset.importOptionsConfirmed = 'true'; });
    await input.setInputFiles({
      name: 'owner-only.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('gene,Condition 1,Condition 2\nA,1,2\nB,3,4')
    });
    await page.waitForFunction(({ ownerId, nextId }) => {
      const state = window.Main?.session?.workspaceState;
      const owner = state?.tabs?.find(tab => tab?.id === ownerId);
      const transaction = window.Shared?.hot?.getLastOwnerProjectionTransaction?.(ownerId);
      return state?.activeTabId === nextId
        && owner?.payload?.data?.some?.(row => row?.[0] === 'A')
        && transaction?.projected === false;
    }, { ownerId: firstTabId, nextId: secondTabId }, { timeout: 30_000 });

    const result = await page.evaluate(({ ownerId, nextId }) => {
      const tabs = window.Main.session.workspaceState.tabs;
      const owner = tabs.find(tab => tab?.id === ownerId);
      const other = tabs.find(tab => tab?.id === nextId);
      return {
        activeTabId: window.Main.session.workspaceState.activeTabId,
        ownerFirstDataRow: owner?.payload?.data?.find?.(row => row?.[0] === 'A')?.slice?.(0, 3) || null,
        otherData: other?.payload?.data || null,
        transaction: window.Shared.hot.getLastOwnerProjectionTransaction(ownerId),
        overlayVisible: !!document.querySelector('.venn-loading-overlay:not([hidden])')
      };
    }, { ownerId: firstTabId, nextId: secondTabId });

    expect(result.activeTabId).toBe(secondTabId);
    expect(result.ownerFirstDataRow).toEqual(['A', '1', '2']);
    expect(result.otherData).not.toContainEqual(['A', '1', '2']);
    expect(result.transaction.finalProjectionRequests).toBe(0);
    expect(result.overlayVisible).toBe(false);
    expect(issues.critical).toEqual([]);
  });
});
