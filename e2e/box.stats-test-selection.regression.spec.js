const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

const active = selector => `#boxPage:not([hidden]) ${selector}`;

async function openBox(page) {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(
    page,
    { type: 'box', pageId: 'boxPage', exampleButtonId: 'boxLoadExample' },
    { first: true, loadExample: true }
  );
  await expect(page.locator(active('#boxStatsTestChoice'))).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(active('#boxComputeStats'))).toBeEnabled({ timeout: 30_000 });
}

async function selectControl(page, selector, value) {
  const locator = page.locator(active(selector));
  await expect(locator).toBeVisible({ timeout: 20_000 });
  await locator.selectOption(value);
  await page.waitForTimeout(100);
}

async function setConditionCount(page, count) {
  const conditionCount = await page.locator(active('.stats-conditions-checkboxes input[type="checkbox"]')).count();
  expect(conditionCount).toBeGreaterThanOrEqual(count);
  for(let index = 0; index < conditionCount; index += 1){
    const checkbox = page.locator(active(`#statCol${index}`));
    const checked = index < count;
    if ((await checkbox.isChecked()) !== checked) {
      await checkbox.setChecked(checked);
      await page.waitForTimeout(75);
    }
  }
}

async function computeAndRead(page, expectedAnalysisId) {
  await page.locator(active('#boxComputeStats')).click();
  await page.waitForFunction(expected => {
    const state = window.Components?.box?.__getState?.();
    const status = document.querySelector('#boxPage:not([hidden]) #boxStatsStatus')?.textContent || '';
    return state?.statsLastReport?.analysisSpec?.analysisId === expected
      && /Statistics up to date\./i.test(status);
  }, expectedAnalysisId, { timeout: 40_000 });
  await expect(page.locator(active('#boxStatsStatus'))).toContainText('Statistics up to date.');
  return page.evaluate(() => {
    const root = document.querySelector('#boxPage:not([hidden])');
    const state = window.Components?.box?.__getState?.();
    const report = state?.statsLastReport || null;
    return {
      analysisId: report?.analysisSpec?.analysisId || null,
      selectedColumns: Array.from(state?.selectedCols || []),
      testChoice: root?.querySelector('#boxStatsTestChoice')?.value || null,
      statsLastRunVersion: Number(state?.statsLastRunVersion || 0),
      statsContextVersion: Number(state?.statsContextVersion || 0),
      resultsText: root?.querySelector('#statsResults')?.textContent || '',
      reportText: root?.querySelector('#boxStatsReportHost')?.textContent || ''
    };
  });
}

async function assertSelection(page, { family, design, groups, choice, expectedId, expectedText }) {
  await selectControl(page, '#boxStatsFamily', family);
  await selectControl(page, '#boxStatsDesign', design);
  await setConditionCount(page, groups);
  await selectControl(page, '#boxStatsTestChoice', choice);
  const result = await computeAndRead(page, expectedId);
  expect(result.selectedColumns).toHaveLength(groups);
  expect(result.analysisId).toBe(expectedId);
  expect(result.statsLastRunVersion).toBe(result.statsContextVersion);
  expect(result.testChoice).toBe(choice);
  expect(`${result.resultsText} ${result.reportText}`).toContain(expectedText);
}

test('every Box test dropdown choice executes its exact analysis without fallback', async ({ page }) => {
  test.setTimeout(240_000);
  const issues = registerIssueCollectors(page);
  await openBox(page);

  const cases = [
    { family: 'parametric', design: 'unpaired', groups: 3, choice: 'classic', expectedId: 'oneWayAnova', expectedText: 'One-way ANOVA' },
    { family: 'parametric', design: 'unpaired', groups: 3, choice: 'welch', expectedId: 'welchAnova', expectedText: 'Welch ANOVA' },
    { family: 'parametric', design: 'unpaired', groups: 3, choice: 'lognormalClassic', expectedId: 'lognormalAnova', expectedText: 'Lognormal one-way ANOVA' },
    { family: 'parametric', design: 'unpaired', groups: 3, choice: 'lognormalWelch', expectedId: 'lognormalWelchAnova', expectedText: 'Lognormal Welch ANOVA' },
    { family: 'nonparametric', design: 'unpaired', groups: 3, choice: 'kruskalWallis', expectedId: 'kruskalWallis', expectedText: 'Kruskal-Wallis' },
    { family: 'parametric', design: 'paired', groups: 3, choice: 'classic', expectedId: 'repeatedMeasuresAnova', expectedText: 'Repeated-measures ANOVA' },
    { family: 'nonparametric', design: 'paired', groups: 3, choice: 'friedman', expectedId: 'friedman', expectedText: 'Friedman' },
    { family: 'parametric', design: 'unpaired', groups: 2, choice: 'classic', expectedId: 'studentT', expectedText: 'Unpaired t-test' },
    { family: 'parametric', design: 'unpaired', groups: 2, choice: 'welch', expectedId: 'welchT', expectedText: 'Welch t-test' },
    { family: 'parametric', design: 'unpaired', groups: 2, choice: 'lognormalClassic', expectedId: 'lognormalT', expectedText: 'Lognormal t-test' },
    { family: 'parametric', design: 'unpaired', groups: 2, choice: 'lognormalWelch', expectedId: 'lognormalWelchT', expectedText: "Lognormal Welch's t-test" },
    { family: 'nonparametric', design: 'unpaired', groups: 2, choice: 'mannWhitney', expectedId: 'mannWhitney', expectedText: 'Mann-Whitney' },
    { family: 'nonparametric', design: 'unpaired', groups: 2, choice: 'kolmogorovSmirnov', expectedId: 'kolmogorovSmirnov', expectedText: 'Kolmogorov-Smirnov' },
    { family: 'parametric', design: 'paired', groups: 2, choice: 'classic', expectedId: 'pairedT', expectedText: 'Paired t-test' },
    { family: 'parametric', design: 'paired', groups: 2, choice: 'ratioT', expectedId: 'ratioT', expectedText: 'Ratio t-test' },
    { family: 'nonparametric', design: 'paired', groups: 2, choice: 'wilcoxonSignedRank', expectedId: 'wilcoxonSignedRank', expectedText: 'Wilcoxon signed-rank' }
  ];

  for (const item of cases) {
    await test.step(`${item.groups} groups: ${item.design} ${item.choice}`, async () => {
      await assertSelection(page, item);
    });
  }

  expect(issues.critical.filter(entry => entry.kind !== 'requestfailed')).toEqual([]);
});
