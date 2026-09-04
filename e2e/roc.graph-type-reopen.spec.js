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

async function waitForRocRender(page, expectedType) {
  await page.waitForFunction((type) => {
    const root = document.querySelector('#rocPage:not([hidden])');
    const svg = root?.querySelector?.('#rocSvg') || null;
    const select = root?.querySelector?.('#rocGraphType') || null;
    if (!svg || select?.value !== type) {
      return false;
    }
    const active = window.Main?.session?.workspaceState?.activeTabId || null;
    const publication = window.Shared?.componentLifecycle?.isPublicationSettled?.(window.Components?.roc, {
      componentKey: 'roc',
      tabId: active
    });
    if (!active || publication?.staged === true) {
      return false;
    }
    const xLabel = svg.querySelector('[data-font-role="xTitle"]')?.textContent?.trim() || '';
    const yLabel = svg.querySelector('[data-font-role="yTitle"]')?.textContent?.trim() || '';
    const title = svg.querySelector('[data-font-role="graphTitle"]')?.textContent?.trim() || '';
    const statsText = root?.querySelector?.('#rocStatsResults')?.textContent || '';
    const hasCurve = Array.from(svg.querySelectorAll('path[data-series][d]'))
      .some(path => String(path.getAttribute('d') || '').trim().length > 0);
    if (type === 'roc') {
      return svg.dataset?.rocGraphType === 'roc'
        && hasCurve
        && title === 'ROC curve'
        && xLabel === 'False Positive Rate'
        && yLabel === 'True Positive Rate'
        && /\bAUC\b/i.test(statsText)
        && /ROC metrics|ROC summary/i.test(statsText);
    }
    return svg.dataset?.rocGraphType === 'pr'
      && hasCurve
      && /Precision-Recall/i.test(title)
      && xLabel === 'Recall'
      && yLabel === 'Precision'
      && /Average Precision|AP\b/i.test(statsText)
      && /Precision.*Recall|Precision-Recall|Precision–Recall/i.test(statsText);
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
      renderedGraphType: svg?.dataset?.rocGraphType || null,
      xLabel: svg?.querySelector?.('[data-font-role="xTitle"]')?.textContent?.trim() || null,
      yLabel: svg?.querySelector?.('[data-font-role="yTitle"]')?.textContent?.trim() || null,
      title: svg?.querySelector?.('[data-font-role="graphTitle"]')?.textContent?.trim() || null,
      curveCount: svg ? Array.from(svg.querySelectorAll('path[data-series][d]')).filter(path => String(path.getAttribute('d') || '').trim()).length : 0,
      svgText: svg?.textContent || '',
      statsText: stats?.textContent || '',
      hasSvg: !!svg,
      hasStats: !!stats
    };
  });
}

async function setFastRocResamplingForContract(page) {
  await page.evaluate(() => {
    const roc = window.Components?.roc;
    const workspace = window.Main?.session?.workspaceState || {};
    const tabId = workspace.activeTabId || null;
    const payload = roc?.getPayload?.();
    if (!roc?.loadFromPayload || !payload || payload.type !== 'roc' || !tabId) {
      throw new Error('Unable to configure deterministic ROC resampling for contract test');
    }
    payload.stats = { ...(payload.stats || {}), resamplingIterations: 100 };
    roc.loadFromPayload(payload, {
      tabId,
      source: 'e2e-contract-fast-resampling',
      skipDraw: true,
      skipDataLoad: true
    });
    if (roc.getPayload?.()?.stats?.resamplingIterations !== 100) {
      throw new Error('ROC contract-test resampling override did not persist');
    }
  });
}

async function setRocGraphType(page, graphType, options = {}) {
  await setFastRocResamplingForContract(page);
  const select = page.locator('#rocPage:not([hidden]) #rocGraphType');
  await select.focus();
  const current = await select.inputValue();
  if (current !== graphType) {
    await select.press(graphType === 'pr' ? 'ArrowDown' : 'ArrowUp');
  }
  await expect(select).toHaveValue(graphType, { timeout: 20_000 });
  if (options.assertStatsAtBaseFrame) {
    await expectRocStatsAtBaseFrame(page, graphType);
  }
  await waitForRocRender(page, graphType);
}

async function expectRocStatsAtBaseFrame(page, graphType) {
  await page.waitForFunction(type => {
    const root = document.querySelector('#rocPage:not([hidden])');
    return root?.querySelector?.('#rocSvg')?.dataset?.rocGraphType === type;
  }, graphType, { timeout: 45_000 });
  const statsText = await page.locator('#rocPage:not([hidden]) #rocStatsResults').textContent();
  if (graphType === 'roc') {
    expect(statsText).toMatch(/ROC metrics|ROC summary/i);
    expect(statsText).toMatch(/\bAUC\b/i);
  } else {
    expect(statsText).toMatch(/Average Precision|AP\b/i);
  }
}

async function expectRocResamplingLayout(page) {
  await expect(page.locator('#rocPage:not([hidden]) #rocDiffMethod')).toHaveValue('bootstrap');
  const layout = await page.locator('#rocPage:not([hidden]) #rocStatsControls').evaluate(controls => {
    const group = controls.querySelector('.roc-resampling-controls');
    const iterations = group?.querySelector('#rocResamplingIterations');
    const seed = group?.querySelector('#rocResamplingSeed');
    if (!group || !iterations || !seed) {
      return null;
    }
    const groupRect = group.getBoundingClientRect();
    const controlsRect = controls.getBoundingClientRect();
    const iterationsRect = iterations.getBoundingClientRect();
    const seedRect = seed.getBoundingClientRect();
    return {
      groupTop: groupRect.top,
      controlsTop: controlsRect.top,
      iterationsTop: iterationsRect.top,
      seedTop: seedRect.top,
      iterationsWidth: iterationsRect.width,
      seedWidth: seedRect.width
    };
  });
  expect(layout).not.toBeNull();
  expect(layout.groupTop).toBeGreaterThan(layout.controlsTop);
  expect(Math.abs(layout.iterationsTop - layout.seedTop)).toBeLessThan(2);
  expect(layout.iterationsWidth).toBeLessThan(200);
  expect(layout.seedWidth).toBeLessThan(200);
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
  await waitForDocumentOpenComplete(page);
  await page.waitForFunction(() => {
    const state = window.Main?.session?.workspaceState || {};
    return (state.tabs || []).some(tab => tab && tab.type === 'roc');
  }, null, { timeout: 60_000 });
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
  expect(state.renderedGraphType).toBe(graphType);
  expect(state.curveCount).toBeGreaterThan(0);
  if (graphType === 'roc') {
    expect(state.payloadTitle).toBe('ROC curve');
    expect(state.title).toBe('ROC curve');
    expect(state.xLabel).toBe('False Positive Rate');
    expect(state.yLabel).toBe('True Positive Rate');
    expect(state.svgText).toMatch(/ROC curve/i);
    expect(state.svgText).toMatch(/False Positive Rate/i);
    expect(state.svgText).toMatch(/True Positive Rate/i);
    expect(state.statsText).toMatch(/\bAUC\b/i);
    expect(state.statsText).toMatch(/ROC metrics|ROC summary/i);
  } else {
    expect(state.payloadTitle).toBe('Precision-Recall curve');
    expect(state.title).toMatch(/Precision-Recall/i);
    expect(state.xLabel).toBe('Recall');
    expect(state.yLabel).toBe('Precision');
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
  await expectRocResamplingLayout(page);
  expectRocConsistency(await readRocState(page), 'pr');

  await setRocGraphType(page, 'roc', { assertStatsAtBaseFrame: true });
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
