const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { registerIssueCollectors } = require('../helpers/diagnostics');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { saveWorkspaceArchive, openWorkspaceArchive } = require('../helpers/archiveDriver');
const rowRandomSphericityFixture = require('../../test-support/fixtures/box-row-random-sphericity-v1.json');

const active = selector => `#boxPage:not([hidden]) ${selector}`;

for(const method of [
  {postHoc:'dunnettTest',mode:'reference',outlierMode:'none',label:'Dunnett'},
  {postHoc:'dunnettT3Test',mode:'all',outlierMode:'none',label:'Dunnett T3'},
  {postHoc:'standard',mode:'all',outlierMode:'routTest',label:'ROUT'}
]){
  test(`${method.label} settings and calculated results survive archive reopen`,async({page},testInfo)=>{
    test.setTimeout(180_000);
    await openBox(page);
    await page.evaluate(settings=>{
      const box=window.Components.box,payload=box.getPayload();
      payload.data=[['Control','B','C'],...[8,9,10,11,12,9,10,11,10,100].map((value,index)=>[value,index+12,2*index+5])];
      Object.assign(payload.config.stats,{test:'parametric',paired:false,parametricVariant:'classic',referenceIndex:0,...settings});
      box.loadFromPayload(payload,{source:'e2e-named-method'});
    },method);
    await waitForComponentOwnerReady(page,'box',{requireMountedRoot:true,requireIdle:true});
    await setConditionCount(page,3);
    await expect(page.locator(active('#boxStatsPostHoc'))).toHaveValue(method.postHoc);
    await page.locator(active('#boxComputeStats')).click();
    await expect(page.locator(active('#boxStatsStatus'))).toContainText('Statistics up to date.',{timeout:60_000});
    const read=()=>page.evaluate(()=>({report:window.Components.box.__getState().statsLastReport,settings:window.Components.box.getPayload().config.stats,text:document.querySelector('#boxPage:not([hidden]) #statsResults').textContent}));
    const before=await read();
    expect(JSON.stringify(before.report)).toContain(method.label);
    if(method.outlierMode==='routTest'){
      expect(before.report.methodsText).toContain('10 → 9');
      expect(before.text).toContain('26.00');
    }
    const archive=testInfo.outputPath(`${method.label.replace(/ /g,'-')}.graph`);
    await saveWorkspaceArchive(page,archive,{scope:'workspace',snapshotKind:'document-snapshot',compression:'STORE'});
    await openWorkspaceArchive(page,archive,{componentType:'box'});
    await waitForComponentOwnerReady(page,'box',{requireMountedRoot:true,requireIdle:true});
    await expect.poll(async()=> (await read()).report).toEqual(before.report);
    expect((await read()).settings.postHoc).toBe(method.postHoc);
    expect((await read()).settings.outlierMode).toBe(method.outlierMode);
    await page.locator(active('#boxComputeStats')).click();
    await expect(page.locator(active('#boxStatsStatus'))).toContainText('Statistics up to date.',{timeout:60_000});
    expect((await read()).report).toEqual(before.report);
    expect((await read()).text).toBe(before.text);
  });
}

test('Friedman requested calibration and tied exact results survive archive reopen', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await openBox(page);
  await page.evaluate(() => {
    const box = window.Components.box;
    const payload = box.getPayload();
    payload.data = [['A', 'B', 'C'], [1, 1, 2], [1, 2, 2], [1, 1, 3], [1, 2, 3]];
    Object.assign(payload.config.stats, { test: 'nonparametric', paired: true, mode: 'all', postHoc: 'standard', resamplingMode: 'exact' });
    box.loadFromPayload(payload, { source: 'e2e-friedman-calibration' });
  });
  await waitForComponentOwnerReady(page, 'box', { requireMountedRoot: true, requireIdle: true });
  await setConditionCount(page, 3);
  const before = await computeAndRead(page, 'friedman');
  expect(before.reportText).toContain('Friedman exact permutation distribution');
  expect(before.reportText).toContain('ties retained');
  const filePath = testInfo.outputPath('friedman-calibration.graph');
  await saveWorkspaceArchive(page, filePath, { scope: 'workspace', snapshotKind: 'document-snapshot', compression: 'STORE' });
  await openWorkspaceArchive(page, filePath, { componentType: 'box' });
  await waitForComponentOwnerReady(page, 'box', { requireMountedRoot: true, requireIdle: true });
  await expect(page.locator(active('#statsResults'))).toHaveText(before.resultsText);
  expect((await computeAndRead(page, 'friedman')).reportText).toBe(before.reportText);
  await page.evaluate(() => {
    const box = window.Components.box;
    const payload = box.getPayload();
    payload.config.stats.resamplingMode = 'monte-carlo';
    box.loadFromPayload(payload, { source: 'e2e-friedman-monte-carlo' });
  });
  await waitForComponentOwnerReady(page, 'box', { requireMountedRoot: true, requireIdle: true });
  expect((await computeAndRead(page, 'friedman')).reportText).toContain('Friedman Monte Carlo calibration');
});

test('paired rank-biserial effect preserves corrected decimal ranks after archive reopen', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await openBox(page);
  await page.evaluate(() => window.Components.box.__getState().hot.loadData([
    ['A', 'B'], [0.5, 0.525], [null, 100], [0.825, 0.775], [0.375, 0.325], [0.5, 0.55]
  ], { source: 'e2e-paired-rank-effect', recordUndo: false }));
  await waitForComponentOwnerReady(page, 'box', { requireMountedRoot: true, requireIdle: true });
  await selectControl(page, '#boxStatsFamily', 'nonparametric');
  await selectControl(page, '#boxStatsDesign', 'paired');
  await setConditionCount(page, 2);
  await selectControl(page, '#boxStatsTestChoice', 'wilcoxonSignedRank');
  const before = await computeAndRead(page, 'wilcoxonSignedRank');
  expect(before.resultsText).toMatch(/Rank-biserial/);
  expect(before.resultsText).toContain('Effect (Rank-biserial r)0.200');
  const filePath = testInfo.outputPath('paired-rank-effect.graph');
  await saveWorkspaceArchive(page, filePath, { scope: 'workspace', snapshotKind: 'document-snapshot', compression: 'STORE' });
  await openWorkspaceArchive(page, filePath, { componentType: 'box' });
  await waitForComponentOwnerReady(page, 'box', { requireMountedRoot: true, requireIdle: true });
  await expect(page.locator(active('#statsResults'))).toContainText('Rank-biserial');
  await expect(page.locator(active('#statsResults'))).toHaveText(before.resultsText);
  const after = await computeAndRead(page, 'wilcoxonSignedRank');
  expect(after.resultsText).toBe(before.resultsText);
});

test('control Sidak reports and nonexcluding MAD flags survive archive reopen', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await openBox(page);
  await page.evaluate(() => {
    const box = window.Components.box;
    const payload = box.getPayload();
    payload.data = [['Control', 'B', 'C'], [10, 20, 4], [11, 21, 8], [12, 25, 9], [13, 22, 11], [14, 23, 14], [1000, 26, 18]];
    Object.assign(payload.config.stats, { mode: 'reference', referenceIndex: 0, paired: false, test: 'parametric', postHoc: 'dunnett', outlierMode: 'rout', advancedOpen: true });
    box.loadFromPayload(payload, { source: 'e2e-method-reopen' });
  });
  await waitForComponentOwnerReady(page, 'box', { requireMountedRoot: true, requireIdle: true });
  await setConditionCount(page, 3);
  await page.locator(active('#boxComputeStats')).click();
  await expect(page.locator(active('#boxStatsStatus'))).toContainText('Statistics up to date.', { timeout: 40_000 });
  const read = () => page.evaluate(() => ({
    report: window.Components.box.__getState().statsLastReport,
    settings: window.Components.box.getPayload().config.stats,
    text: document.querySelector('#boxPage:not([hidden]) #boxStatsReportHost').textContent
  }));
  const before = await read();
  expect(before.text).toMatch(/Sidak/);
  expect(before.text).not.toMatch(/Dunnett/);
  expect(before.text).toMatch(/all observations.*retained/i);
  expect(before.report.analysisSpec.outlierMode).toBe('rout');
  const filePath = testInfo.outputPath('control-flags.graph');
  await saveWorkspaceArchive(page, filePath, { scope: 'workspace', snapshotKind: 'document-snapshot', compression: 'STORE' });
  await openWorkspaceArchive(page, filePath, { componentType: 'box' });
  await waitForComponentOwnerReady(page, 'box', { requireMountedRoot: true, requireIdle: true });
  await expect.poll(async () => (await read()).report).toEqual(before.report);
  expect((await read()).settings.outlierMode).toBe('rout');
  expect((await read()).settings.postHoc).toBe('dunnett');
  await page.locator(active('#boxComputeStats')).click();
  await expect(page.locator(active('#boxStatsStatus'))).toContainText('Statistics up to date.');
  expect((await read()).report).toEqual(before.report);
});

test('paired missing-row calculations retain source subjects after archive reopen', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await openBox(page);
  await page.evaluate(() => {
    window.Components.box.__getState().hot.loadData([
      ['A', 'B'], [10, 9], [null, 20], [30, null], [40, 37], [50, 46]
    ], { source: 'e2e-paired-missing-rows', recordUndo: false });
  });
  await waitForComponentOwnerReady(page, 'box', { requireMountedRoot: true, requireIdle: true });
  await selectControl(page, '#boxStatsFamily', 'parametric');
  await selectControl(page, '#boxStatsDesign', 'paired');
  await setConditionCount(page, 2);
  await selectControl(page, '#boxStatsTestChoice', 'classic');
  await computeAndRead(page, 'pairedT');
  const read = () => page.evaluate(() => ({
    annotations: window.Components.box.__getState().statsLastAnnotationModel,
    report: window.Components.box.__getState().statsLastReport,
    activeTabId: window.Main.session.getActiveTab().id,
    text: document.querySelector('#boxPage:not([hidden]) #statsResults').textContent
  }));
  const before = await read();
  expect(before.text).toContain('3.0237');
  expect(JSON.stringify(before.annotations)).toContain('0.094178');
  const filePath = testInfo.outputPath('paired-missing.graph');
  await saveWorkspaceArchive(page, filePath, { scope: 'workspace', snapshotKind: 'document-snapshot', compression: 'STORE' });
  await openWorkspaceArchive(page, filePath, { componentType: 'box' });
  await waitForComponentOwnerReady(page, 'box', { requireMountedRoot: true, requireIdle: true });
  await expect.poll(async () => (await read()).report?.analysisSpec?.analysisId).toBe('pairedT');
  const reopened = await read();
  expect(reopened.report).toEqual(before.report);
  expect(reopened.annotations).toEqual(before.annotations);
  await computeAndRead(page, 'pairedT');
  expect((await read()).report).toEqual(before.report);
  const recalculated = await read();
  expect(recalculated.annotations.pairs).toEqual(before.annotations.pairs);
  expect(recalculated.annotations.signature).toBe(before.annotations.signature);
  expect(recalculated.annotations.tabId).toBe(recalculated.activeTabId);
});

test('repeated-measures and Friedman calculations use complete source subjects', async ({ page }) => {
  test.setTimeout(120_000);
  await openBox(page);
  await page.evaluate(() => window.Components.box.__getState().hot.loadData([
    ['A', 'B', 'C'], [10, 9, 11], [null, 20, 21], [30, null, 32], [40, 37, 42], [50, 46, 48]
  ], { source: 'e2e-repeated-missing-rows', recordUndo: false }));
  await waitForComponentOwnerReady(page, 'box', { requireMountedRoot: true, requireIdle: true });
  await selectControl(page, '#boxStatsFamily', 'parametric');
  await selectControl(page, '#boxStatsDesign', 'paired');
  await setConditionCount(page, 3);
  await selectControl(page, '#boxStatsTestChoice', 'classic');
  const repeated = await computeAndRead(page, 'repeatedMeasuresAnova');
  expect(repeated.resultsText).toContain('5.0345');
  expect(repeated.reportText).toMatch(/3.*subjects|subjects.*3|3.*paired|paired.*3/);
  await selectControl(page, '#boxStatsFamily', 'nonparametric');
  await selectControl(page, '#boxStatsTestChoice', 'friedman');
  const friedman = await computeAndRead(page, 'friedman');
  expect(friedman.reportText).toContain('Friedman');
  expect(friedman.resultsText).toContain('4.6667');
});

test('Box row-random inference renders effect-specific corrections and survives archive reopen', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await openBox(page);
  await page.evaluate(rows => {
    const box=window.Components.box;
    const groupsCount=rows[0]?.length || 0;
    const conditionsCount=rows[0]?.[0]?.length || 0;
    const groups=Array.from({length:groupsCount},(_,index)=>`Group ${index+1}`);
    const conditions=Array.from({length:conditionsCount},(_,index)=>`Condition ${index+1}`);
    const payload=box.createEmptyPayload();
    payload.config.tableFormat='grouped';
    payload.config.grouped={
      ...(payload.config.grouped || {}),
      replicatesPerGroup:conditionsCount,
      groups,
      conditions
    };
    payload.config.stats={
      ...(payload.config.stats || {}),
      groupedAnalysis:'rowRandomMixed',
      test:'parametric',
      mode:'all'
    };
    const groupHeader=groups.flatMap(label=>[label,...Array(conditionsCount-1).fill('')]);
    const conditionHeader=groups.flatMap(()=>conditions);
    payload.data=[groupHeader,conditionHeader,...rows.map(subject=>subject.flat())];
    box.loadFromPayload(payload,{source:'e2e-row-random-sphericity'});
  },rowRandomSphericityFixture.rows);
  await waitForComponentOwnerReady(page,'box',{requireMountedRoot:true,requireIdle:true});
  await page.locator(active('#boxComputeStats')).click();
  await expect(page.locator(active('#boxStatsStatus'))).toContainText('Statistics up to date.',{timeout:60_000});

  const read=()=>page.evaluate(()=>{
    const box=window.Components.box;
    const owner=box.__testHooks.getSession(window.Main.session.getActiveTab().id,{create:false});
    return {
      report:owner?.state?.results?.report || null,
      text:document.querySelector('#boxPage:not([hidden]) #statsResults')?.textContent || ''
    };
  });
  const before=await read();
  const repeated=before.report?.analysisSpec?.repeatedMeasures;
  expect(repeated).toMatchObject({
    design:'fully-crossed-within-subjects',
    primaryCorrection:'greenhouse-geisser',
    subjectCount:16
  });
  for(const effect of Object.values(repeated.effects)){
    expect(effect.gg.available).toBe(true);
    expect(effect.hf.available).toBe(true);
    expect(effect.primaryMethod).toBe('greenhouse-geisser');
  }
  expect(before.text).toContain('Effect-specific sphericity corrections');
  expect(before.text).toContain('p (GG primary)');
  expect(before.text).toContain('p (HF supplementary)');
  expect(before.text).toContain('p (uncorrected reference)');

  const archive=testInfo.outputPath('row-random-sphericity.graph');
  await saveWorkspaceArchive(page,archive,{scope:'workspace',snapshotKind:'document-snapshot',compression:'STORE'});
  await openWorkspaceArchive(page,archive,{componentType:'box'});
  await waitForComponentOwnerReady(page,'box',{requireMountedRoot:true,requireIdle:true});
  await expect.poll(async()=>(await read()).report).toEqual(before.report);
  expect((await read()).text).toBe(before.text);
});

test('Box grouped model guidance stays concise while Methods records each design', async ({ page }) => {
  test.setTimeout(120_000);
  await openBox(page);
  await page.evaluate(() => {
    const box=window.Components.box;
    const rows=[
      [[10,13],[16,18]], [[12,14],[17,21]], [[9,12],[16,17]],
      [[13,17],[19,20]], [[11,15],[18,22]], [[14,16],[21,22]]
    ];
    const groups=['Control','Treatment'];
    const conditions=['Before','After'];
    const payload=box.createEmptyPayload();
    payload.config.tableFormat='grouped';
    payload.config.grouped={
      ...(payload.config.grouped || {}),
      replicatesPerGroup:2,
      groups,
      conditions
    };
    payload.config.stats={
      ...(payload.config.stats || {}),
      groupedAnalysis:'rowRandomMixed',
      groupedComparisonScope:'groupsWithinCondition',
      groupedMultiplicityFamily:'global',
      correction:'holm',
      test:'parametric',
      mode:'all'
    };
    payload.data=[
      ['Control','','Treatment',''],
      ['Before','After','Before','After'],
      ...rows.map(subject=>subject.flat())
    ];
    box.loadFromPayload(payload,{source:'e2e-grouped-methods-guidance'});
  });
  await waitForComponentOwnerReady(page,'box',{requireMountedRoot:true,requireIdle:true});

  const cases=[
    {
      analysis:'rowRandomMixed',
      controlHint:'Complete subjects are required; see Methods for the model and corrections.',
      methodTerms:['normal contrast errors','Greenhouse–Geisser','Huynh–Feldt','No formal sphericity test']
    },
    {
      analysis:'nestedRepeatedTwoWay',
      controlHint:'Requires complete, balanced data with two conditions; see Methods.',
      methodTerms:['exactly two conditions','complete and balanced','approximately normal residuals','homogeneous group-level error variances','subject-within-group-by-condition error']
    },
    {
      analysis:'multipleComparisons',
      controlHint:'See Methods for the selected comparisons and multiplicity family.',
      methodTerms:['groups within each condition','Welch t-tests','global multiplicity family','Holm adjustment']
    }
  ];
  for(const item of cases){
    await page.evaluate(analysis=>{
      const box=window.Components.box;
      const payload=box.getPayload();
      payload.config.stats.groupedAnalysis=analysis;
      payload.config.stats.groupedComparisonScope='groupsWithinCondition';
      payload.config.stats.groupedMultiplicityFamily='global';
      payload.config.stats.correction='holm';
      box.loadFromPayload(payload,{source:`e2e-grouped-methods-${analysis}`});
    },item.analysis);
    await waitForComponentOwnerReady(page,'box',{requireMountedRoot:true,requireIdle:true});
    const guidance=page.locator(active('#statsControls .stats-help-text'));
    await expect(guidance).toHaveText(item.controlHint);
    expect((await guidance.innerText()).length).toBeLessThan(100);
    await page.locator(active('#boxComputeStats')).click();
    await expect(page.locator(active('#boxStatsStatus'))).toContainText('Statistics up to date.',{timeout:60_000});
    const report=await page.evaluate(()=>{
      const tab=window.Main.session.getActiveTab();
      return window.Components.box.__testHooks.getSession(tab.id,{create:false})?.state?.results?.report || null;
    });
    expect(report?.methodsText).toBeTruthy();
    for(const term of item.methodTerms){
      expect(report.methodsText).toContain(term);
    }
  }
});

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
  await waitForComponentOwnerReady(page, 'box', {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 20_000
  });
}

async function setConditionCount(page, count) {
  const conditionCount = await page.locator(active('.stats-conditions-checkboxes input[type="checkbox"]')).count();
  expect(conditionCount).toBeGreaterThanOrEqual(count);
  for(let index = 0; index < conditionCount; index += 1){
    const checkbox = page.locator(active(`#statCol${index}`));
    const checked = index < count;
    if ((await checkbox.isChecked()) !== checked) {
      await checkbox.setChecked(checked);
      await waitForComponentOwnerReady(page, 'box', {
        requireMountedRoot: true,
        requireIdle: true,
        timeout: 20_000
      });
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
  if(family === 'parametric' && design === 'unpaired' && groups >= 3 && choice === 'welch'){
    expect(result.reportText).toMatch(/Games[-–—]?Howell/i);
  }
  return result;
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
