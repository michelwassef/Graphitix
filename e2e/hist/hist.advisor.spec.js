const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome, waitForDocumentOpenComplete } = require('../helpers/workspaceDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { buildWorkspaceArchive, openWorkspaceArchiveBuffer, parseWorkspaceArchive } = require('../helpers/archiveDriver');

const observations = [
  ['Control', 'Treatment'], [1.1, 1.5], [2.2, 2.6], [3.3, 4.7], [4.4, 6.8],
  [5.7, 7.9], [6.9, 8.3], [8.1, 9.2], [9.4, 10.6]
];
const panel = page => page.locator('#histPage:not([hidden]) #histStatsAdvisor');
const toggle = page => panel(page).getByRole('button', { name: 'Help me choose', exact: true });
const apply = page => panel(page).getByRole('button', { name: 'Apply recommendation' });
const pageErrors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const errors = [];
  pageErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
});
test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

async function answer(page, id, value) {
  const input = panel(page).locator(`input[data-advisor-focus="${id}"][value="${value}"]`);
  await input.check();
  await expect(input).toBeChecked();
}
async function loadData(page, data = observations) {
  await page.evaluate(async data => {
    const component = window.Components.hist;
    const tabId = window.Main.session.workspaceState.activeTabId;
    const payload = component.getPayload();
    payload.data = data;
    delete payload.dataViews;
    delete payload.activeDataViewId;
    payload.config.stats.diagnosticsMode = 'off';
    payload.config.stats.comparisonMode = 'off';
    component.loadFromPayload(payload, { tabId, skipDraw: true });
    await component.draw({ tabId, force: true, reason: 'hist-advisor-fixture' });
  }, data);
  await waitForComponentOwnerReady(page, 'hist');
}
async function open(page) {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'hist', pageId: 'histPage' }, { first: true });
  await loadData(page);
}
async function chooseFit(page) {
  await answer(page, 'goal', 'fit');
  await answer(page, 'data', 'continuous');
  await answer(page, 'design', 'independent');
  await answer(page, 'model', 'normal');
}
async function settings(page) {
  return page.evaluate(() => {
    const tabId = window.Main.session.workspaceState.activeTabId;
    return window.Components.hist.__testHooks.getSession(tabId).state.statsSettings;
  });
}

async function installHeldHistStatisticsWorker(page) {
  await page.evaluate(() => {
    const workers = window.Shared.Workers;
    const runTask = workers.runTask.bind(workers);
    const tasks = [];
    workers.runTask = config => {
      if (config?.action !== 'hist-ks-two-sample') return runTask(config);
      let pending = true;
      let cancelled = false;
      let resolveTask;
      let rejectTask;
      const promise = new Promise((resolve, reject) => {
        resolveTask = resolve;
        rejectTask = reject;
      });
      const task = {
        get pending() { return pending; },
        get cancelled() { return cancelled; },
        cancel(reason) {
          if (!pending) return;
          pending = false;
          cancelled = true;
          const error = new Error(String(reason || 'cancelled'));
          error.name = 'AbortError';
          rejectTask(error);
        },
        async release() {
          if (!pending) return;
          pending = false;
          try {
            resolveTask(await runTask(config));
          } catch (error) {
            rejectTask(error);
          }
        }
      };
      promise.cancel = task.cancel;
      tasks.push(task);
      return promise;
    };
    window.__histStatsWorkerGate = {
      pendingCount: () => tasks.filter(task => task.pending).length,
      cancelCount: () => tasks.filter(task => task.cancelled).length,
      releaseNext: async () => {
        const task = tasks.find(candidate => candidate.pending);
        if (!task) throw new Error('No held Histogram statistics worker is pending.');
        await task.release();
      }
    };
  });
}

test('Histogram alpha changes reclassify the saved KS result and keep its plot annotation', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  await loadData(page, [
    ['Control', 'Treatment'],
    [1, 10], [2, 11], [3, 12], [4, 13], [5, 14]
  ]);
  await page.locator('#histStatsComparisonMode').selectOption('ks');
  await page.locator('#histShowStatsSummary').check();
  await expect(page.locator('#histComputeStats')).toBeEnabled();
  await page.locator('#histComputeStats').click();
  await expect(page.locator('#histStatsResults')).toContainText(/Kolmogorov.Smirnov/i);
  await expect(page.locator('#histPlot [data-hist-plot-stats="1"]')).toContainText(/Two.sample KS/i);

  const before = await page.evaluate(() => {
    const tabId = window.Main.session.workspaceState.activeTabId;
    const owner = window.Components.hist.__testHooks.getSession(tabId);
    return {
      signature: owner.results.analysisModel.signature,
      p: owner.results.analysisModel.ksResult.p
    };
  });
  const alpha = page.locator('#histStatsInferenceControls [data-stats-inference-key="alpha"]');
  await alpha.fill('0.001');
  await waitForComponentOwnerReady(page, 'hist', { requireIdle: true });

  const after = await page.evaluate(() => {
    const tabId = window.Main.session.workspaceState.activeTabId;
    const owner = window.Components.hist.__testHooks.getSession(tabId);
    return {
      signature: owner.results.analysisModel.signature,
      p: owner.results.analysisModel.ksResult.p
    };
  });
  expect(after).toEqual(before);
  await expect(page.locator('#histStatsResults')).toContainText(/Kolmogorov.Smirnov/i);
  await expect(page.locator('#histPlot [data-hist-plot-stats="1"]')).toContainText(/Two.sample KS/i);
  await expect(page.locator('#histStatsStatus')).toContainText(/up to date/i);
});

test('Histogram unavailable AICc stays unavailable in the panel, archive and reopened panel', async ({ page }) => {
  test.setTimeout(180_000);
  await open(page);
  await loadData(page, [['Value'], [1], [2], [3]]);
  await page.locator('#histStatsDiagnosticsMode').selectOption('normal-vs-lognormal');
  await expect(page.locator('#histComputeStats')).toBeEnabled();
  await page.locator('#histComputeStats').click();
  await expect.poll(() => page.evaluate(() => {
    const id = window.Main.session.workspaceState.activeTabId;
    return window.Components.hist.__testHooks.getSession(id)?.results?.analysisModel?.diagnosticsMode || null;
  })).toBe('normal-vs-lognormal');

  await page.locator('#histStatsResults summary').filter({ hasText: 'Diagnostics and model details' }).click();
  const diagnostics = page.locator('#histStatsResults table').filter({ hasText: 'Preferred model' });
  const valueRow = diagnostics.locator('tbody tr').filter({ hasText: 'Value' });
  await expect(valueRow).toContainText('\u2014');
  await expect(valueRow).not.toContainText('0.00');
  await expect(valueRow).not.toContainText('Normal');
  await expect(page.locator('#histStatsResults')).toContainText(/AICc model comparison requires more than three observations/i);

  const archive = await buildWorkspaceArchive(page, {
    scope: 'workspace', snapshotKind: 'save', policyMode: 'manual-save', compression: 'STORE', useWorker: false
  });
  const parsed = await parseWorkspaceArchive(page, archive.base64, 'hist-unavailable-aicc.graph');
  const savedTab = parsed.session.tabs.find(tab => tab.type === 'hist');
  const savedComparison = Object.values(savedTab.payload.config.stats.analysisModel.modelComparisonByKey)[0];
  expect(savedComparison).toMatchObject({
    available: false,
    preferred: null,
    normalAicc: null,
    lognormalAicc: null,
    deltaAicc: null,
    message: expect.stringContaining('more than three observations')
  });

  await openWorkspaceArchiveBuffer(page, Buffer.from(archive.base64, 'base64'), { componentType: 'hist' });
  await waitForDocumentOpenComplete(page);
  await waitForComponentOwnerReady(page, 'hist');
  const restored = await page.evaluate(() => {
    const id = window.Main.session.workspaceState.activeTabId;
    const owner = window.Components.hist.__testHooks.getSession(id);
    return Object.values(owner.results.analysisModel.modelComparisonByKey)[0];
  });
  expect(restored).toMatchObject({ available: false, preferred: null, normalAicc: null, lognormalAicc: null, deltaAicc: null });
  await expect(page.locator('#histStatsResults table').filter({ hasText: 'Preferred model' })).toContainText('\u2014');
});

test('Histogram save and recovery wait for the selected manual analysis to publish', async ({ page }) => {
  test.setTimeout(180_000);
  await open(page);
  await loadData(page, [
    ['Control', 'Treatment'],
    ...Array.from({ length: 10 }, (_, index) => [index + 1, index + 11])
  ]);
  await installHeldHistStatisticsWorker(page);
  await page.locator('#histStatsComparisonMode').selectOption('ks');
  await expect(page.locator('#histComputeStats')).toBeEnabled();
  await page.locator('#histComputeStats').click();
  await expect.poll(() => page.evaluate(() => window.__histStatsWorkerGate.pendingCount())).toBe(1);
  await expect(page.locator('#histStatsStatus')).toContainText(/Calculating statistics/i);

  const pending = await page.evaluate(() => {
    const id = window.Main.session.workspaceState.activeTabId;
    const component = window.Components.hist;
    const owner = component.__testHooks.getSession(id);
    const context = window.Main.tabs.getSessionActionsContext();
    const options = { scope: 'workspace', policyMode: 'manual-save', compression: 'STORE', useWorker: false };
    const state = { readinessSettled: false, saveSettled: false, recoverySettled: false };
    state.readiness = component.awaitReadyForSnapshot({ tabId: id, timeoutMs: 120000 })
      .then(result => { state.readinessSettled = true; return result; });
    state.save = window.Main.sessionActions.buildWorkspaceArchiveBlob(context, { ...options, snapshotKind: 'save' })
      .then(blob => { state.saveSettled = true; return blob; });
    state.recovery = window.Main.sessionActions.buildWorkspaceArchiveBlob(context, { ...options, snapshotKind: 'recovery', policyMode: 'recovery' })
      .then(blob => { state.recoverySettled = true; return blob; });
    window.__histPendingSnapshots = state;
    return {
      idle: component.isIdleForSnapshot({ tabId: id }),
      analysis: owner.results.analysisModel,
      job: window.Shared.jobs.getActiveFor({ component: 'hist', tabId: id, kind: 'analysis' })?.status || null
    };
  });
  expect(pending).toEqual({ idle: false, analysis: null, job: 'running' });
  await page.evaluate(async () => {
    for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
  });
  expect(await page.evaluate(() => ({
    readiness: window.__histPendingSnapshots.readinessSettled,
    save: window.__histPendingSnapshots.saveSettled,
    recovery: window.__histPendingSnapshots.recoverySettled
  }))).toEqual({ readiness: false, save: false, recovery: false });

  await page.evaluate(() => window.__histStatsWorkerGate.releaseNext());
  const saved = await page.evaluate(async () => {
    const id = window.Main.session.workspaceState.activeTabId;
    const { readiness, save, recovery } = window.__histPendingSnapshots;
    const [readyResult, saveBlob, recoveryBlob] = await Promise.all([readiness, save, recovery]);
    const readAnalysis = async blob => {
      const parsed = await window.Shared.graphArchive.parseFile(blob, { fileName: 'hist-statistics-snapshot.graph' });
      const tab = parsed.session.tabs.find(entry => entry.type === 'hist');
      return tab?.payload?.config?.stats?.analysisModel || null;
    };
    return {
      readiness: readyResult,
      save: await readAnalysis(saveBlob),
      recovery: await readAnalysis(recoveryBlob),
      idle: window.Components.hist.isIdleForSnapshot({ tabId: id })
    };
  });
  expect(saved.readiness.ok).toBe(true);
  expect(saved.save?.ksResult).toMatchObject({ available: true, nA: 10, nB: 10 });
  expect(saved.recovery).toEqual(saved.save);
  expect(saved.idle).toBe(true);
});

test('Histogram input changes cancel superseded analysis before the replacement publishes', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  await loadData(page, [
    ['Control', 'Treatment'],
    ...Array.from({ length: 10 }, (_, index) => [index + 1, index + 11])
  ]);
  await installHeldHistStatisticsWorker(page);
  await page.locator('#histStatsComparisonMode').selectOption('ks');
  await page.locator('#histComputeStats').click();
  await expect.poll(() => page.evaluate(() => window.__histStatsWorkerGate.pendingCount())).toBe(1);

  await page.locator('#histStatsComparisonMode').selectOption('off');
  await page.locator('#histStatsDiagnosticsMode').selectOption('normal-fit');
  await expect.poll(() => page.evaluate(() => window.__histStatsWorkerGate.cancelCount())).toBe(1);
  await expect(page.locator('#histComputeStats')).toBeEnabled();
  await page.locator('#histComputeStats').click();
  await expect.poll(() => page.evaluate(() => {
    const id = window.Main.session.workspaceState.activeTabId;
    return window.Components.hist.__testHooks.getSession(id)?.results?.analysisModel?.diagnosticsMode || null;
  })).toBe('normal-fit');
  await waitForComponentOwnerReady(page, 'hist', { requireIdle: true });

  const result = await page.evaluate(() => {
    const id = window.Main.session.workspaceState.activeTabId;
    const owner = window.Components.hist.__testHooks.getSession(id);
    return {
      analysis: owner.results.analysisModel,
      pending: owner.timers.statsCalculationPending,
      idle: window.Components.hist.isIdleForSnapshot({ tabId: id }),
      job: window.Shared.jobs.getActiveFor({ component: 'hist', tabId: id, kind: 'analysis' })
    };
  });
  expect(result.analysis).toMatchObject({ diagnosticsMode: 'normal-fit', comparisonMode: 'off', ksResult: null });
  expect(result.pending).toBe(false);
  expect(result.idle).toBe(true);
  expect(result.job).toBeNull();
});

test('Histogram analysis is cancelled on same-type tab switch and owner close', async ({ page }) => {
  test.setTimeout(180_000);
  await open(page);
  await loadData(page, [
    ['Control', 'Treatment'],
    ...Array.from({ length: 10 }, (_, index) => [index + 1, index + 11])
  ]);
  await installHeldHistStatisticsWorker(page);
  await page.locator('#histStatsComparisonMode').selectOption('ks');
  await page.locator('#histComputeStats').click();
  await expect.poll(() => page.evaluate(() => window.__histStatsWorkerGate.pendingCount())).toBe(1);
  const firstId = await page.evaluate(() => window.Main.session.workspaceState.activeTabId);

  await openComponentFromWelcome(page, { type: 'hist', pageId: 'histPage' });
  await loadData(page);
  const secondId = await page.evaluate(() => window.Main.session.workspaceState.activeTabId);
  await expect.poll(() => page.evaluate(id => window.Components.hist.isIdleForSnapshot({ tabId: id }), firstId)).toBe(true);
  const afterSwitch = await page.evaluate(({ firstId, secondId }) => ({
    first: window.Components.hist.__testHooks.getSession(firstId)?.results?.analysisModel || null,
    second: window.Components.hist.__testHooks.getSession(secondId)?.results?.analysisModel || null,
    cancelledWorkers: window.__histStatsWorkerGate.cancelCount()
  }), { firstId, secondId });
  expect(afterSwitch).toEqual({ first: null, second: null, cancelledWorkers: 1 });

  await loadData(page, [
    ['Control', 'Treatment'],
    ...Array.from({ length: 10 }, (_, index) => [index + 1, index + 11])
  ]);
  await page.locator('#histStatsComparisonMode').selectOption('ks');
  await page.locator('#histComputeStats').click();
  await expect.poll(() => page.evaluate(() => window.__histStatsWorkerGate.pendingCount())).toBe(1);

  await page.evaluate(id => window.Main.tabs.closeTab(id, {
    force: true, skipPrompt: true, reason: 'e2e-close-hist-with-pending-statistics'
  }), secondId);
  await expect(page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${secondId}"]`)).toHaveCount(0);
  await expect.poll(() => page.evaluate(id => window.Components.hist.__testHooks.getSession(id), secondId)).toBeNull();
  expect(await page.evaluate(() => window.__histStatsWorkerGate.cancelCount())).toBe(2);
});

for (const width of [1500, 640]) {
  test(`Histogram advisor disclosure, explicit application and layout at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 1100 });
    await open(page);
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    const closedHeight = await panel(page).evaluate(node => node.getBoundingClientRect().height);
    const original = await settings(page);
    await toggle(page).click();
    await expect(toggle(page)).toBeFocused();
    await expect(apply(page)).toBeDisabled();
    await toggle(page).click();
    await expect(panel(page).locator('.stats-advisor__summary')).toHaveCount(0);
    expect(await panel(page).evaluate(node => node.getBoundingClientRect().height)).toBeCloseTo(closedHeight, 0);
    await toggle(page).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('advisor-collapsed.png') });

    await toggle(page).click();
    await chooseFit(page);
    await waitForComponentOwnerReady(page, 'hist', { requireIdle: true });
    await expect(panel(page).locator('input[data-advisor-focus="model"][value="normal"]')).toBeFocused();
    expect(await settings(page)).toEqual(original);
    await expect(apply(page)).toBeEnabled();
    await expect(panel(page).locator('.stats-advisor__summary')).toContainText('not an automatic selector');
    const overflow = await panel(page).evaluate(root => {
      const bounds = root.getBoundingClientRect();
      if(bounds.left < 0 || bounds.right > window.innerWidth + 1){ return true; }
      return [...root.querySelectorAll('fieldset, label, button, .stats-advisor__summary')].some(node => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1);
      });
    });
    expect(overflow).toBe(false);
    await toggle(page).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('advisor-expanded-top.png') });
    // Center the actions above the fixed workspace-tab bar, which does not
    // reduce the browser's intersection viewport.
    await apply(page).evaluate(node => node.scrollIntoView({ block: 'center', inline: 'nearest' }));
    await apply(page).focus({ preventScroll: true });
    await expect(apply(page)).toBeInViewport({ ratio: 1 });
    expect(await apply(page).evaluate(node => node.getBoundingClientRect().bottom)).toBeLessThan(1020);
    await page.screenshot({ path: testInfo.outputPath('advisor-expanded-actions.png') });
    await apply(page).click();
    await expect(page.locator('#histStatsDiagnosticsMode')).toHaveValue('normal-fit');
    await expect(page.locator('#histStatsComparisonMode')).toHaveValue('off');
    await expect.poll(() => settings(page)).toMatchObject({ diagnosticsMode: 'normal-fit', comparisonMode: 'off' });
    await expect(page.locator('#histStatsResults')).toContainText(/normal/i);
    await waitForComponentOwnerReady(page, 'hist', { requireIdle: true });
    const tableViewport = page.locator('#histStatsResults').getByRole('region', { name: 'Descriptive statistics table', exact: true });
    await tableViewport.scrollIntoViewIfNeeded();
    await expect(tableViewport).toHaveAttribute('tabindex', '0');
    const tableLayout = await tableViewport.evaluate(node => {
      node.scrollLeft = node.scrollWidth;
      const bounds = node.getBoundingClientRect();
      const last = node.querySelector('thead tr').lastElementChild.getBoundingClientRect();
      return { right: bounds.right, lastRight: last.right, scrollable: node.scrollWidth > node.clientWidth };
    });
    expect(tableLayout.right).toBeLessThanOrEqual(width + 1);
    expect(tableLayout.lastRight).toBeLessThanOrEqual(tableLayout.right + 1);
    if (width === 640) {
      expect(tableLayout.scrollable).toBe(true);
      await tableViewport.focus();
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowRight');
      await expect(tableViewport).toBeFocused();
    }
    const card = tableViewport.locator('..');
    const download = card.getByRole('button', { name: 'Download', exact: true });
    await download.scrollIntoViewIfNeeded();
    await expect(download).toBeVisible();
    expect(await download.evaluate(node => node.closest('.stats-table-viewport') === null)).toBe(true);
    const file = page.waitForEvent('download', { timeout: 10_000 });
    await download.click();
    await card.getByRole('menuitem', { name: 'CSV', exact: true }).click();
    expect((await file).suggestedFilename()).toMatch(/\.csv$/);
    await page.screenshot({ path: testInfo.outputPath('statistics-table-scroll-and-exports.png') });

    await panel(page).getByRole('button', { name: 'Reset answers' }).click();
    await expect(apply(page)).toBeDisabled();
    await expect(page.locator('#histStatsDiagnosticsMode')).toHaveValue('normal-fit');
    await answer(page, 'goal', 'location');
    await expect(panel(page).locator('.stats-advisor__summary')).toContainText('Distribution Charts');
    await expect(apply(page)).toBeDisabled();
    await toggle(page).click();
    expect(await panel(page).evaluate(node => node.getBoundingClientRect().height)).toBeCloseTo(closedHeight, 0);
  });
}

test('Histogram advisor rejects unsuitable KS designs and rechecks changed data before Apply', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  await toggle(page).click();
  await answer(page, 'goal', 'compare');
  await answer(page, 'data', 'continuous');
  await answer(page, 'design', 'paired');
  await expect(apply(page)).toBeDisabled();
  await expect(panel(page).locator('.stats-advisor__summary')).toContainText('pairing');
  await answer(page, 'design', 'independent');
  await expect(apply(page)).toBeEnabled();
  await apply(page).click();
  await expect.poll(() => settings(page)).toMatchObject({ diagnosticsMode: 'off', comparisonMode: 'ks' });
  await expect(page.locator('#histComputeStats')).toBeEnabled();
  await page.locator('#histComputeStats').click();
  await expect(page.locator('#histStatsResults')).toContainText(/Kolmogorov.Smirnov/);

  // Retain a projected Apply button, then change the source without redrawing.
  const retained = await apply(page).elementHandle();
  await page.locator('#histStatsComparisonMode').selectOption('off');
  await apply(page).focus();
  await page.evaluate(() => {
    const component = window.Components.hist;
    const id = window.Main.session.workspaceState.activeTabId;
    const owner = component.__testHooks.getSession(id);
    for (let row = 2; row < 9; row += 1) {
      owner.managers.hot.setDataAtCell(row, 0, '');
    }
  });
  await retained.evaluate(node => node.click());
  await expect(panel(page).locator('.stats-advisor__summary')).toContainText('Each series needs at least two finite observations');
  await expect(apply(page)).toBeDisabled();
  await expect(toggle(page)).toBeFocused();
  expect((await settings(page)).comparisonMode).toBe('off');
});

test('Histogram advisor stays tab-owned through stale controls, snapshots and saved-file reopen', async ({ page }) => {
  test.setTimeout(180_000);
  await open(page);
  const firstId = await page.evaluate(() => window.Main.session.workspaceState.activeTabId);
  await toggle(page).click();
  await chooseFit(page);
  const staleApply = await apply(page).elementHandle();
  const staleToggle = await toggle(page).elementHandle();
  const staleRadio = await panel(page).locator('input[data-advisor-focus="goal"][value="compare"]').elementHandle();
  const before = await settings(page);
  expect(await page.evaluate(() => {
    const component = window.Components.hist;
    const id = window.Main.session.workspaceState.activeTabId;
    const owner = component.__testHooks.getSession(id);
    const live = owner.advisor;
    const answers = live.answers;
    const runtime = component.captureRuntimeState({ tabId: id });
    const payload = component.getPayload();
    return owner.advisor === live && owner.advisor.answers === answers
      && runtime.advisor !== live && payload.config.stats.advisor !== live
      && JSON.stringify(runtime.advisor) === JSON.stringify(live);
  })).toBe(true);

  await openComponentFromWelcome(page, { type: 'hist', pageId: 'histPage' });
  await loadData(page);
  const secondId = await page.evaluate(() => window.Main.session.workspaceState.activeTabId);
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  await staleApply.evaluate(node => node.click());
  await staleToggle.evaluate(node => node.click());
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(id => window.Components.hist.__testHooks.getSession(id).advisor, firstId)).toMatchObject({ open: true, answers: { goal: 'fit', model: 'normal' } });
  expect(await page.evaluate(id => window.Components.hist.__testHooks.getSession(id).state.statsSettings, firstId)).toEqual(before);
  await toggle(page).click();
  await answer(page, 'goal', 'describe');
  await staleRadio.evaluate(node => node.click());
  await expect(panel(page).locator('input[data-advisor-focus="goal"][value="describe"]')).toBeChecked();
  await apply(page).click();
  await toggle(page).click();
  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${firstId}"]`).click();
  await waitForComponentOwnerReady(page, 'hist', { expectedTabId: firstId });
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(panel(page).locator('input[data-advisor-focus="model"][value="normal"]')).toBeChecked();
  const archive = await buildWorkspaceArchive(page, { scope: 'workspace', snapshotKind: 'save', policyMode: 'manual-save', compression: 'STORE', useWorker: false });
  await openWorkspaceArchiveBuffer(page, Buffer.from(archive.base64, 'base64'), { componentType: 'hist' });
  await waitForDocumentOpenComplete(page);
  await waitForComponentOwnerReady(page, 'hist');
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(panel(page).locator('input[data-advisor-focus="model"][value="normal"]')).toBeChecked();
  const siblingId = await page.evaluate(() => window.Main.session.workspaceState.tabs.filter(tab => tab.type === 'hist')[1].id);
  expect(secondId).not.toBe(firstId);
  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${siblingId}"]`).click();
  await waitForComponentOwnerReady(page, 'hist', { expectedTabId: siblingId });
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  await toggle(page).click();
  await expect(panel(page).locator('input[data-advisor-focus="goal"][value="describe"]')).toBeChecked();
  await expect(panel(page).locator('input[data-advisor-focus="goal"][value="fit"]')).not.toBeChecked();
});

test('Histogram biomedical example calculates tie-aware KS only after explicit selection and action', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1500, height: 1100 });
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.__workerScriptRequests = [];
    if(typeof NativeWorker === 'function'){
      window.Worker = new Proxy(NativeWorker, {
        construct(target, args){
          const source = String(args[0] || '');
          try{
            window.__workerScriptRequests.push(new URL(source, window.location.href).pathname.replace(/^\//, ''));
          }catch(_error){
            window.__workerScriptRequests.push(source);
          }
          return Reflect.construct(target, args, target);
        }
      });
    }
  });
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'hist', pageId: 'histPage' }, { first: true, loadExample: true });
  await waitForComponentOwnerReady(page, 'hist', { requireIdle: true });
  await expect(page.locator('#histStatsComparisonMode')).toHaveValue('off');
  const defaultComparison = page.getByRole('region', { name: 'Distribution comparison table', exact: true });
  await expect(page.locator('#histStatsResults')).not.toContainText('Monte Carlo permutation');
  await page.locator('#histStatsComparisonMode').selectOption('ks');
  await expect(page.locator('#histComputeStats')).toBeEnabled();
  await page.locator('#histComputeStats').click();
  await expect(defaultComparison).toContainText('Monte Carlo permutation');
  await expect.poll(() => page.evaluate(() => window.__workerScriptRequests || []))
    .toContain('js/workers/hist.worker.js');
  const defaultRow = await defaultComparison.getByRole('row').nth(1).innerText();
  expect(defaultRow).toMatch(/No diabetes within 5 years.*Diabetes within 5 years/);
  await toggle(page).click();
  await chooseFit(page);
  for (const [model, expected] of [['normal', 'normal-fit'], ['lognormal', 'lognormal-fit'], ['compare', 'normal-vs-lognormal']]) {
    await answer(page, 'model', model);
    await expect(apply(page)).toBeEnabled();
    await apply(page).click();
    await expect(page.locator('#histStatsDiagnosticsMode')).toHaveValue(expected);
    await expect.poll(() => settings(page)).toMatchObject({ diagnosticsMode: expected, comparisonMode: 'off' });
  }
  await apply(page).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('example-model-checks.png') });
  await expect(panel(page).locator('.stats-advisor__summary')).toContainText('rounding');
  await answer(page, 'goal', 'compare');
  await expect(apply(page)).toBeEnabled();
  await expect(panel(page).locator('.stats-advisor__summary')).toContainText('permutation calibration preserves ties');
  await apply(page).click();
  await expect(page.locator('#histStatsDiagnosticsMode')).toHaveValue('off');
  await expect(page.locator('#histStatsComparisonMode')).toHaveValue('ks');
  await expect(page.locator('#histStatsStatus')).toContainText(/Statistics settings or data changed.*Calculate statistics to update the results/i);
  await expect(page.locator('#histStatsResults')).not.toContainText('Monte Carlo permutation');
  await page.locator('#histComputeStats').click();
  await expect(page.locator('#histStatsResults')).toContainText('Monte Carlo permutation');
  await expect(page.locator('#histStatsResults')).toContainText('19,999 shuffles');
  await apply(page).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('example-advisor-applied.png') });
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  await defaultComparison.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('example-ks-result.png') });
  await toggle(page).click();
  await answer(page, 'goal', 'location');
  await expect(apply(page)).toBeDisabled();
  await expect(panel(page).locator('.stats-advisor__summary')).toContainText('Distribution Charts');
});

test('Histogram advisor follows included raw observations through generated frequency views and exclusions', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  await toggle(page).click();
  await answer(page, 'goal', 'compare');
  await answer(page, 'data', 'continuous');
  await answer(page, 'design', 'independent');
  await expect(apply(page)).toBeEnabled();
  await page.evaluate(async () => {
    const component = window.Components.hist;
    const id = window.Main.session.workspaceState.activeTabId;
    const owner = component.__testHooks.getSession(id);
    const manager = owner.managers.dataViews;
    const view = manager.getViews().map(entry => manager.getView(entry.id))
      .find(entry => entry?.transformSpec?.type === 'histFrequencyTable');
    if (!view) throw new Error('Expected a generated frequency view');
    manager.activateView(view.id, { reason: 'advisor-source-contract' });
    await component.draw({ tabId: id, force: true, reason: 'advisor-frequency-source' });
  });
  await expect(panel(page).locator('.stats-advisor__hint').first()).toContainText('2 non-empty');
  await expect(apply(page)).toBeEnabled();

  await page.evaluate(async () => {
    const component = window.Components.hist;
    const id = window.Main.session.workspaceState.activeTabId;
    const owner = component.__testHooks.getSession(id);
    owner.managers.dataViews.activateView('raw', { reason: 'advisor-exclusion-contract' });
    owner.managers.hot.applyExclusions({ cols: [1], rows: [], cells: [] }, { source: 'advisor-exclusion-contract' });
    await component.draw({ tabId: id, force: true, reason: 'advisor-exclusion-contract' });
  });
  await expect(panel(page).locator('.stats-advisor__summary')).toContainText('exactly two');
  await expect(apply(page)).toBeDisabled();
});

test('Histogram legacy payloads reset advisor answers without carrying over the previous file', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  await toggle(page).click();
  await chooseFit(page);
  await page.evaluate(async () => {
    const component = window.Components.hist;
    const tabId = window.Main.session.workspaceState.activeTabId;
    const payload = component.getPayload();
    delete payload.config.stats.advisor;
    component.loadFromPayload(payload, { tabId, skipDraw: true });
    await component.draw({ tabId, force: true, reason: 'advisor-legacy-payload' });
  });
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(() => window.Components.hist.__testHooks.getSession(window.Main.session.workspaceState.activeTabId).advisor))
    .toEqual({ open: false, answers: {} });
});
