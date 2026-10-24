const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { activateToolbarSection, selectReplicateMode, clickExampleButton } = require('../helpers/uiDriver');
const { saveWorkspaceArchive, openWorkspaceArchive } = require('../helpers/archiveDriver');
const pageErrors = new WeakMap();
test.beforeEach(({ page }) => {
  const errors = [];
  pageErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

async function open(page, type) {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type, pageId: `${type}Page` }, { first: true, loadExample: true });
  await waitForComponentOwnerReady(page, type, { requireIdle: true });
}

for (const scenario of [
  { name: 'Welch', count: 2, distribution: 'normal', paired: 'unpaired', previous: 'classic', expected: 'welch', report: /Welch/i },
  { name: 'Mann-Whitney', count: 2, distribution: 'nonnormal', paired: 'unpaired', previous: 'kolmogorovSmirnov', expected: 'mannWhitney', report: /Mann.W?hitney/i },
  { name: 'Wilcoxon', count: 2, distribution: 'nonnormal', paired: 'paired', previous: 'mannWhitney', expected: 'wilcoxonSignedRank', report: /Wilcoxon/i },
  { name: 'Friedman', count: 3, distribution: 'nonnormal', paired: 'paired', previous: 'kruskalWallis', expected: 'friedman', report: /Friedman/i }
]) {
  test(`Box ${scenario.name} advice applies and calculates the named test`, async ({ page }, info) => {
    test.setTimeout(120_000);
    await open(page, 'box');
    await page.evaluate(scenario => {
      const component = window.Components.box;
      const payload = component.getPayload();
      payload.data = [ ['A', 'B', 'C'], [1, 2, 4], [2, 4, 3], [3, 5, 7], [4, 8, 8], [5, 12, 10] ]
        .map(row => row.slice(0, scenario.count));
      delete payload.dataViews;
      delete payload.activeDataViewId;
      Object.assign(payload.config.stats, {
        mode: 'all', paired: false, test: scenario.distribution === 'normal' ? 'parametric' : 'nonparametric',
        selectedColumns: Array.from({ length: scenario.count }, (_, index) => index),
        parametricVariant: 'classic', pairwiseParametricVariant: 'classic',
        nonParametricVariant: scenario.previous, postHoc: 'standard', advisor: { open: false, answers: {} }
      });
      component.loadFromPayload(payload, { source: 'advisor-reviewed-plan' });
    }, scenario);
    await waitForComponentOwnerReady(page, 'box', { requireIdle: true });
    const root = page.locator('#boxPage:not([hidden])');
    const choice = root.locator('#boxStatsTestChoice');
    await choice.selectOption(scenario.previous);
    const advisor = root.locator('.stats-advisor');
    await advisor.locator('.stats-advisor__toggle').click();
    for (const [key, value] of [ ['groups', scenario.count === 2 ? 'two' : 'threePlus'], ['paired', scenario.paired], ['distribution', scenario.distribution] ]) {
      await advisor.locator(`input[data-advisor-question="advisor-${key}"][value="${value}"]`).check();
    }
    const apply = advisor.getByRole('button', { name: 'Apply recommendation' });
    await expect(apply).toBeEnabled();
    await apply.click();
    await expect(choice).toHaveValue(scenario.expected);
    await root.locator('#boxComputeStats').click();
    await expect(root.locator('#boxStatsStatus')).toContainText('Statistics up to date.', { timeout: 60_000 });
    await expect(root.locator('#statsResults')).toContainText(scenario.report);
    await root.locator('#statsResults').scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('calculated-advised-test.png') });
  });
}

test('Histogram rejects retired controls from an earlier projection of the same owner', async ({ page }, info) => {
  test.setTimeout(120_000);
  await open(page, 'hist');
  const advisor = page.locator('#histPage:not([hidden]) #histStatsAdvisor');
  const toggle = advisor.locator('.stats-advisor__toggle');
  const retiredToggle = await toggle.elementHandle();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await retiredToggle.evaluate(node => node.click());
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  const retiredGoal = await advisor.locator('input[data-advisor-focus="goal"][value="describe"]').elementHandle();
  await advisor.locator('input[data-advisor-focus="goal"][value="compare"]').check();
  await retiredGoal.evaluate(node => {
    node.checked = true;
    node.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(advisor.locator('input[data-advisor-focus="goal"][value="compare"]')).toBeChecked();
  await toggle.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('retired-controls-ignored.png') });
});

test('Scatter preserves an explicit through-origin constraint when X has measurement error', async ({ page }) => {
  await open(page, 'scatter');
  const advisor = page.locator('#scatterPage:not([hidden]) .stats-advisor');
  await advisor.locator('.stats-advisor__toggle').click();
  await advisor.locator('details.stats-advisor__model-options > summary').click();
  for (const [key, value] of [['analysisGoal', 'modelOnly'], ['regressionModel', 'linearThroughOrigin'], ['xError', 'yes']]) {
    await advisor.locator(`input[data-advisor-question="scatter-advisor-${key}"][value="${value}"]`).check();
  }
  await expect(advisor.getByRole('button', { name: 'Apply recommendation' })).toBeDisabled();
  await expect(advisor.locator('.stats-advisor__summary')).toContainText('through-origin');
  await advisor.locator('input[data-advisor-question="scatter-advisor-analysisGoal"][value="associationOnly"]').check();
  await expect(advisor.getByRole('button', { name: 'Apply recommendation' })).toBeEnabled();
});

for (const type of ['line', 'scatter']) {
  test(`${type} polynomial guidance requires enough distinct X values`, async ({ page }) => {
    await open(page, type);
    await page.evaluate(type => {
      const component = window.Components[type];
      const id = window.Main.session.workspaceState.activeTabId;
      const owner = type === 'line' ? component.__testHooks.getActiveSession() : component.__testHooks.getSession(id);
      const data = owner.managers.hot.getData();
      data.slice(1).forEach((row, index) => { row[type === 'line' ? 0 : 1] = index % 2 + 1; });
      owner.managers.hot.loadData(data);
    }, type);
    const advisor = page.locator(`#${type}Page:not([hidden]) .stats-advisor`);
    await advisor.locator('.stats-advisor__toggle').click();
    if(type === 'scatter'){
      await advisor.locator('details.stats-advisor__model-options > summary').click();
    }
    const key = type === 'line' ? 'trendShape' : 'regressionModel';
    const value = type === 'line' ? 'curved' : 'quadratic';
    await advisor.locator(`input[data-advisor-question="${type}-advisor-${key}"][value="${value}"]`).check();
    await expect(advisor.getByRole('button', { name: 'Apply recommendation' })).toBeDisabled();
    await expect(advisor.locator('.stats-advisor__summary')).toContainText('distinct X');
  });
}

test('Box paired diagnostics assess aligned differences instead of marginal groups', async ({ page }) => {
  await open(page, 'box');
  const root = page.locator('#boxPage:not([hidden])');
  const conditions = root.locator('.stats-conditions-checkboxes input[type="checkbox"]');
  for (let index = await conditions.count() - 1; index >= 2; index -= 1) { await conditions.nth(index).uncheck(); }
  const advisor = root.locator('.stats-advisor');
  await advisor.locator('.stats-advisor__toggle').click();
  await advisor.locator('input[data-advisor-question="advisor-paired"][value="paired"]').check();
  await advisor.locator('input[data-advisor-question="advisor-distribution"][value="normal"]').check();
  await advisor.getByRole('button', { name: /Run (normality tests|distribution checks)/ }).click();
  await expect(advisor.locator('.stats-advisor__inline-results')).toContainText('paired differences');
});

test('Box diagnostic cache becomes stale after a value edit with unchanged sample counts', async ({ page }) => {
  await open(page, 'box');
  const advisor = page.locator('#boxPage:not([hidden]) .stats-advisor');
  await advisor.locator('.stats-advisor__toggle').click();
  await advisor.getByRole('button', { name: /Run (normality tests|distribution checks)/ }).click();
  await expect(advisor.locator('.stats-advisor__inline-results')).toBeVisible();
  await page.evaluate(() => {
    const id = window.Main.session.workspaceState.activeTabId;
    const hot = window.Components.box.__testHooks.getSession(id).managers.hot;
    const value = Number(hot.getDataAtCell(1, 0));
    hot.setDataAtCell(1, 0, value + 20);
  });
  await advisor.locator('.stats-advisor__toggle').click();
  await advisor.locator('.stats-advisor__toggle').click();
  await expect(advisor.locator('.stats-advisor__inline-stale')).toContainText('out of date');
});

test('Box grouped advice distinguishes crossed subjects from independent repeated-measure groups', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, 'box');
  await selectReplicateMode(page, 'box', 'grouped');
  await clickExampleButton(page, 'box');
  await waitForComponentOwnerReady(page, 'box', { requireIdle: true });
  const root = page.locator('#boxPage:not([hidden])');
  const advisor = root.locator('.stats-advisor');
  await advisor.locator('.stats-advisor__toggle').click();
  const answer = (key, value) => advisor.locator(`input[data-advisor-question="advisor-${key}"][value="${value}"]`).check();
  const apply = advisor.getByRole('button', { name: 'Apply recommendation' });
  await answer('groupedGoal', 'interaction');
  await answer('groupedRepeated', 'withinGroups');
  await expect(apply).toBeDisabled();
  await expect(advisor.locator('.stats-advisor__summary')).toContainText('exactly two conditions');
  await answer('groupedRepeated', 'yes');
  await expect(apply).toBeEnabled();
  await answer('groupedGoal', 'perCondition');
  await expect(apply).toBeDisabled();
  await answer('groupedRepeated', 'no');
  await expect(apply).toBeEnabled();
  await apply.click();
  expect(await page.evaluate(() => window.Components.box.getPayload().config.stats.groupedAnalysis)).toBe('rowTTests');
});

test('Box nested repeated-measures advice computes and survives archive reopen', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await open(page, 'box');
  await selectReplicateMode(page, 'box', 'grouped');
  await clickExampleButton(page, 'box');
  await waitForComponentOwnerReady(page, 'box', { requireIdle: true });

  const root = page.locator('#boxPage:not([hidden])');
  const dataToolbar = await activateToolbarSection(page, 'box', 'Data');
  await dataToolbar.locator('#boxGroupedReplicates').fill('2');
  await waitForComponentOwnerReady(page, 'box', { requireIdle: true });
  const advisor = root.locator('.stats-advisor');
  await advisor.locator('.stats-advisor__toggle').click();
  const answer = (key, value) => advisor.locator(`input[data-advisor-question="advisor-${key}"][value="${value}"]`).check();
  await answer('groupedGoal', 'interaction');
  await answer('groupedRepeated', 'withinGroups');
  const apply = advisor.getByRole('button', { name: 'Apply recommendation' });
  await expect(advisor.locator('.stats-advisor__summary')).toContainText('two-way mixed ANOVA');
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect.poll(() => page.evaluate(() => window.Components.box.getPayload().config.stats.groupedAnalysis))
    .toBe('nestedRepeatedTwoWay');

  await root.locator('#boxComputeStats').click();
  await expect(root.locator('#boxStatsStatus')).toContainText('Statistics up to date.', { timeout: 60_000 });
  const read = () => page.evaluate(() => {
    const box = window.Components.box;
    const owner = box.__testHooks.getSession(window.Main.session.workspaceState.activeTabId);
    const results = owner?.state?.results || {};
    return {
      report: results.report,
      settings: box.getPayload().config.stats,
      text: document.querySelector('#boxPage:not([hidden]) #statsResults')?.textContent || '',
      analysis: results.report?.analysisSpec?.analysisId || null
    };
  });
  const before = await read();
  expect(before.analysis).toBe('nestedRepeatedTwoWay');
  expect(before.settings.groupedAnalysis).toBe('nestedRepeatedTwoWay');
  expect(before.report.analysisSpec).toMatchObject({
    analysisId: 'nestedRepeatedTwoWay',
    experimentalUnit: 'subject-within-independent-group',
    repeatedFactor: 'condition',
    errorTerms: {
      group: 'subjects-within-group',
      condition: 'subjects-within-group-by-condition',
      interaction: 'subjects-within-group-by-condition'
    }
  });
  expect(before.text).toContain('Subjects within Group × Condition');
  await page.screenshot({ path: testInfo.outputPath('nested-repeated-two-way-results.png') });

  const archive = testInfo.outputPath('nested-repeated-two-way.graph');
  await saveWorkspaceArchive(page, archive, { scope: 'workspace', snapshotKind: 'document-snapshot', compression: 'STORE' });
  await openWorkspaceArchive(page, archive, { componentType: 'box' });
  await waitForComponentOwnerReady(page, 'box', { requireMountedRoot: true, requireIdle: true });
  await expect.poll(async () => (await read()).report).toEqual(before.report);
  expect((await read()).settings.groupedAnalysis).toBe('nestedRepeatedTwoWay');
  await expect.poll(async () => (await read()).text).toContain('Subjects within Group × Condition');
  expect((await read()).text).toBe(before.text);
  await expect(page.locator('#boxPage:not([hidden]) #boxStatsStatus')).toContainText('Statistics up to date.');
});

test('ROC bootstrap guidance requires replication in both matched outcome classes', async ({ page }) => {
  await open(page, 'roc');
  await page.evaluate(() => {
    const owner = window.Components.roc.__testHooks.getSession(window.Main.session.workspaceState.activeTabId);
    const data = owner.managers.hot.getData();
    const header = data[0];
    const label = Math.max(0, header.findIndex(value => String(value).trim().toLowerCase() === 'label'));
    const classes = new Map();
    data.slice(1).forEach(row => {
      if (row[label] == null || String(row[label]).trim() === '') { return; }
      const key = String(row[label]);
      if (!classes.has(key)) { classes.set(key, []); }
      classes.get(key).push(row);
    });
    const [first, second] = [...classes.values()];
    owner.managers.hot.loadData([header, first[0], second[0], second[1]]);
  });
  await waitForComponentOwnerReady(page, 'roc', { requireIdle: true });
  const advisor = page.locator('#rocPage:not([hidden]) .stats-advisor');
  await advisor.locator('.stats-advisor__toggle').click();
  await advisor.locator('input[data-advisor-question="roc-advisor-methodChoice"][value="bootstrap"]').check();
  await expect(advisor.getByRole('button', { name: 'Apply recommendation' })).toBeDisabled();
  await expect(advisor.locator('.stats-advisor__summary')).toContainText('at least two matched observations in each outcome class');
});
