const { ensureJStatStub } = require('../helpers/jstatTestStub');
const { loadProductionBootstrap, resetProductionNamespaces } = require('../../test-support/productionLoader');
const { waitForIntegrationOwnerReady } = require('../../test-support/readiness');

const STATISTICAL_COMPONENT_TYPES = Object.freeze([
  'box', 'scatter', 'line', 'pie', 'hist', 'roc', 'survival', 'pca', 'heatmap'
]);

const originalDebug = console.debug;
const originalLog = console.log;

function ensureSvdStub(){
  const previousGlobal = global.SVDJS;
  const previousWindow = typeof window !== 'undefined' ? window.SVDJS : undefined;
  global.__svdCallCount = 0;
  const stub = {
    SVD(matrix = []){
      global.__svdCallCount = (global.__svdCallCount || 0) + 1;
      const rows = Array.isArray(matrix) ? matrix.length : 0;
      const cols = rows > 0 && Array.isArray(matrix[0]) ? matrix[0].length : 0;
      const componentCount = Math.max(1, Math.min(rows, cols, 3));
      const q = Array.from({ length: componentCount }, (_, idx) => componentCount - idx + 1);
      const u = Array.from({ length: rows }, (_, r) =>
        Array.from({ length: componentCount }, (_, k) => ((r + 1) / (componentCount + k + 1)))
      );
      const v = Array.from({ length: cols }, (_, c) =>
        Array.from({ length: componentCount }, (_, k) => ((c + 1) / (componentCount + k + 1)))
      );
      return { u, v, q };
    }
  };
  global.SVDJS = stub;
  if(typeof window !== 'undefined'){
    window.SVDJS = stub;
  }
  return () => {
    delete global.__svdCallCount;
    if(typeof previousGlobal === 'undefined'){
      delete global.SVDJS;
    }else{
      global.SVDJS = previousGlobal;
    }
    if(typeof window !== 'undefined'){
      if(typeof previousWindow === 'undefined'){
        delete window.SVDJS;
      }else{
        window.SVDJS = previousWindow;
      }
    }
  };
}

async function activateWorkspace(type){
  const graphSelection = window.Main?.tabs?.handleGraphSelection;
  expect(typeof graphSelection).toBe('function');
  const result = graphSelection(type);
  if(result && typeof result.then === 'function'){
    await result;
  }
  await Promise.resolve();
}

async function flushAsyncWork(iterations = 40){
  for(let i = 0; i < iterations; i += 1){
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

function expectSingleReportPanel(targetId, hostId){
  const target = document.getElementById(targetId);
  const host = document.getElementById(hostId);
  expect(target).toBeTruthy();
  expect(host).toBeTruthy();
  expect(host.querySelectorAll('.stats-report-panel').length).toBe(1);
  const targetOwnsHost = target === host || target.contains(host);
  expect(target.querySelectorAll('.stats-report-panel').length).toBe(targetOwnsHost ? 1 : 0);
  expect(host.parentElement?.lastElementChild).toBe(host);
}

function expectStructuredReport(stats){
  expect(Object.prototype.hasOwnProperty.call(stats || {}, 'resultsHtml')).toBe(false);
  expect(Object.prototype.hasOwnProperty.call(stats || {}, 'reportHtml')).toBe(false);
  if(stats?.reportModel){
    expect(stats.reportModel).toEqual(expect.objectContaining({
      kind: 'stats-report',
      title: 'Reporting and reproducibility'
    }));
  }
}

function getBoxNode(id){
  const tab = window.Main?.session?.getActiveTab?.() || null;
  const tabId = tab?.type === 'box' ? String(tab.id || '') : '';
  const mountedRoot = tabId && typeof window.Shared?.workspaceTabs?.getMountedRoot === 'function'
    ? window.Shared.workspaceTabs.getMountedRoot(tabId, 'box')
    : null;
  return mountedRoot?.querySelector?.(`#${id}`)
    || (tabId ? document.querySelector(`[data-workspace-tab-id="${tabId}"] #${id}`) : null)
    || document.querySelector(`#boxPage:not([hidden]) #${id}`)
    || document.getElementById(id);
}

async function prepareBoxStats(){
  await activateWorkspace('box');
  await flushAsyncWork(20);
  const box = window.Components?.box;
  const state = box?.__getState?.();
  state.hot.loadData([
    ['Control', 'Treatment A', 'Treatment B'],
    [10, 16, 23],
    [11, 17, 24],
    [12, 18, 25],
    [13, 19, 26],
    [14, 20, 27]
  ]);
  state.selectedCols = new Set([0, 1, 2]);
  state.statsTest = 'parametric';
  state.statsMode = 'all';
  state.statsPaired = false;
  state.statsPostHoc = 'tukey';
  await box.draw();
  await flushAsyncWork(20);
  getBoxNode('boxComputeStats')?.click();
  await flushAsyncWork(30);
  return box;
}

function createCrossedGroupedBoxPayload(box,rows){
  const groupsCount=rows[0]?.length || 0;
  const conditionsCount=rows[0]?.[0]?.length || 0;
  const groupLabels=Array.from({length:groupsCount},(_,index)=>`Group ${index+1}`);
  const conditionLabels=Array.from({length:conditionsCount},(_,index)=>`Condition ${index+1}`);
  const groupHeader=groupLabels.flatMap(label=>[label,...Array(conditionsCount-1).fill('')]);
  const conditionHeader=groupLabels.flatMap(()=>conditionLabels);
  const payload=box.createEmptyPayload();
  payload.config.tableFormat='grouped';
  payload.config.grouped={
    ...(payload.config.grouped || {}),
    replicatesPerGroup:conditionsCount,
    groups:groupLabels,
    conditions:conditionLabels
  };
  payload.config.stats={
    ...(payload.config.stats || {}),
    groupedAnalysis:'rowRandomMixed',
    test:'parametric',
    mode:'all'
  };
  payload.data=[groupHeader,conditionHeader,...rows.map(subject=>subject.flat())];
  const cellData=Array.from({length:groupsCount},(_,group)=>
    Array.from({length:conditionsCount},(_,condition)=>rows.map(subject=>subject[group][condition])));
  const groupedData={
    ok:true,groupsCount,conditionsCount,rowsWithData:rows.length,partialRowsSkipped:0,
    groupLabels,conditionLabels,rows,cellData
  };
  const model=window.Shared.boxStatsModel.computeBoxStatsModel({
    mode:'grouped',grouped:{analysis:'rowRandomMixed',data:groupedData}
  });
  expect(model.ok).toBe(true);
  payload.config.stats={
    ...payload.config.stats,
    contextSignature:`row-random-sphericity-v1|crossed-fixture-v1|${model.repeatedMeasures.effects.group.f}`,
    lastRunVersion:1,
    report:model.report,
    resultsModel:{
      kind:'stats-panel',
      children:model.tables.map(table=>({kind:'stats-table',...table}))
    },
    reportModel:{
      kind:'stats-report',
      title:'Reporting and reproducibility',
      ...model.report
    }
  };
  return payload;
}

async function prepareScatterStats(){
  await activateWorkspace('scatter');
  document.getElementById('scatterLoadExample').click();
  await flushAsyncWork(60);
  document.getElementById('scatterComputeStats').click();
  await flushAsyncWork(80);
  return window.Components?.scatter;
}

async function prepareLineStats(){
  await activateWorkspace('line');
  document.getElementById('lineLoadExample').click();
  await flushAsyncWork(60);
  document.getElementById('lineComputeStats').click();
  await flushAsyncWork(80);
  return window.Components?.line;
}

async function preparePieStats(){
  await activateWorkspace('pie');
  document.getElementById('pieLoadExample').click();
  await flushAsyncWork(60);
  document.getElementById('pieComputeStats').click();
  await flushAsyncWork(40);
  return window.Components?.pie;
}

async function prepareHistStats(){
  await activateWorkspace('hist');
  document.getElementById('histLoadExample').click();
  await flushAsyncWork(80);
  const hist = window.Components?.hist;
  hist?.draw?.();
  await flushAsyncWork(60);
  return hist;
}

async function prepareRocStats(){
  await activateWorkspace('roc');
  document.getElementById('rocLoadExample').click();
  await flushAsyncWork(80);
  const roc = window.Components?.roc;
  const drawResult = roc?.draw?.({ reason: 'stats-persistence-test' });
  if(drawResult?.then){
    await drawResult;
  }
  if(typeof roc?.awaitReadyForSnapshot === 'function'){
    await roc.awaitReadyForSnapshot({ reason: 'stats-persistence-test' });
  }
  await flushAsyncWork(20);
  return roc;
}

async function prepareSurvivalStats(){
  await activateWorkspace('survival');
  document.getElementById('survivalLoadExample').click();
  await flushAsyncWork(80);
  const hazardToggle = document.getElementById('survivalShowHazardRatios');
  const coxToggle = document.getElementById('survivalFitCox');
  hazardToggle.checked = true;
  coxToggle.checked = true;
  hazardToggle.dispatchEvent(new Event('change', { bubbles: true }));
  coxToggle.dispatchEvent(new Event('change', { bubbles: true }));
  await flushAsyncWork(20);
  const survival = window.Components?.survival;
  survival?.draw?.();
  await flushAsyncWork(160);
  return survival;
}

async function preparePcaStats(){
  await activateWorkspace('pca');
  document.getElementById('pcaLoadExample').click();
  await flushAsyncWork(140);
  return window.Components?.pca;
}

async function prepareHeatmapStats(view = 'corr-columns'){
  await activateWorkspace('heatmap');
  document.getElementById('heatmapLoadExample').click();
  await flushAsyncWork(120);
  const select = document.getElementById('heatmapView');
  if(select && select.value !== view){
    select.value = view;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(80);
  }
  const heatmap = window.Components?.heatmap;
  heatmap?.draw?.();
  await flushAsyncWork(100);
  return heatmap;
}

describe('UI stats persistence and restore', () => {
  let restoreJStat;
  let restoreSvd;

  beforeEach(() => {
    jest.resetModules();
    console.debug = jest.fn();
    console.log = jest.fn();
    global.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
    global.cancelAnimationFrame = handle => clearTimeout(handle);

    resetProductionNamespaces();
    if(typeof global.__restoreTestDebugLogs === 'function'){
      global.__restoreTestDebugLogs();
    }
    if(typeof global.__resetGrid__ === 'function'){
      global.__resetGrid__();
    }
    restoreJStat = ensureJStatStub();
    restoreSvd = ensureSvdStub();

    loadProductionBootstrap({
      preloadComponents: STATISTICAL_COMPONENT_TYPES
    });
  });

  afterEach(() => {
    if(typeof restoreJStat === 'function'){
      restoreJStat();
      restoreJStat = null;
    }
    if(typeof restoreSvd === 'function'){
      restoreSvd();
      restoreSvd = null;
    }
    if(typeof global.__suppressTestDebugLogs === 'function'){
      global.__suppressTestDebugLogs();
    }
    if(typeof window !== 'undefined'){
      delete window.Main;
      delete window.Components;
      delete window.Shared;
    }
    delete global.Main;
    delete global.Components;
    delete global.Shared;
    delete global.Main;
    delete global.Components;
    delete global.Shared;
  });

  afterAll(() => {
    console.debug = originalDebug;
    console.log = originalLog;
  });

  test('Box uses automatic post-hoc for new sessions and preserves requested choices on restore', async () => {
    await activateWorkspace('box');
    await flushAsyncWork(20);
    const initialBox=window.Components?.box;
    expect(initialBox?.__getState?.().statsPostHoc).toBe('auto');
    expect(initialBox?.createEmptyPayload?.().config?.stats?.postHoc).toBe('auto');
    expect(initialBox?.createEmptyPayload?.().config?.stats?.correctionExplicit).toBe(false);

    const box=await prepareBoxStats();
    const explicitPayload=box.getPayload();
    expect(explicitPayload?.config?.stats?.postHoc).toBe('tukey');
    box.loadFromPayload(explicitPayload,{ source:'posthoc-explicit-restore',skipDraw:true });
    await flushAsyncWork(30);
    expect(box.__getState().statsPostHoc).toBe('tukey');

    const selector=getBoxNode('boxStatsPostHoc');
    expect(selector).toBeTruthy();
    selector.value='auto';
    selector.dispatchEvent(new Event('change',{ bubbles:true }));
    await flushAsyncWork(20);
    expect(box.__getState().statsPostHoc).toBe('auto');
    const automaticSelector=getBoxNode('boxStatsPostHoc');
    expect(Array.from(automaticSelector.options).find(option=>option.value==='auto')?.textContent).toBe('Automatic (Tukey HSD)');
    expect(getBoxNode('boxStatsCorrection').disabled).toBe(true);
    const hypothesisLabel=Array.from(getBoxNode('boxStatsPostHoc').closest('.box-stats-options')?.querySelectorAll('label') || [])
      .find(label=>(label.textContent || '').trim()==='Hypothesis');
    const hypothesisSelect=hypothesisLabel?.parentElement?.querySelector('select');
    expect(hypothesisSelect?.disabled).toBe(true);
    expect(hypothesisSelect?.title).toMatch(/two-sided/i);
    const automaticPayload=box.getPayload();
    expect(automaticPayload?.config?.stats?.postHoc).toBe('auto');
    box.loadFromPayload(automaticPayload,{ source:'posthoc-auto-restore',skipDraw:true });
    await flushAsyncWork(30);
    expect(box.__getState().statsPostHoc).toBe('auto');

    const postHocSelector=getBoxNode('boxStatsPostHoc');
    postHocSelector.value='anovaPooled';
    postHocSelector.dispatchEvent(new Event('change',{ bubbles:true }));
    await flushAsyncWork(15);
    expect(box.__getState().statsCorrection).toBe('holm');
    expect(box.__getState().statsCorrectionExplicit).toBe(false);
    let correctionSelector=getBoxNode('boxStatsCorrection');
    correctionSelector.value='bonferroni';
    correctionSelector.dispatchEvent(new Event('change',{ bubbles:true }));
    await flushAsyncWork(15);
    expect(box.__getState().statsCorrectionExplicit).toBe(true);
    const explicitPooledSelector=getBoxNode('boxStatsPostHoc');
    explicitPooledSelector.value='tukey';
    explicitPooledSelector.dispatchEvent(new Event('change',{ bubbles:true }));
    await flushAsyncWork(15);
    const restoredPooledSelector=getBoxNode('boxStatsPostHoc');
    restoredPooledSelector.value='anovaPooled';
    restoredPooledSelector.dispatchEvent(new Event('change',{ bubbles:true }));
    await flushAsyncWork(15);
    expect(box.__getState().statsCorrection).toBe('bonferroni');
    expect(box.getPayload()?.config?.stats?.correctionExplicit).toBe(true);
  },120000);

  test('Box crossed repeated-measures results reopen current and mark legacy inference stale', async () => {
    const fixture=require('../../test-support/fixtures/box-row-random-sphericity-v1.json');
    await activateWorkspace('box');
    await flushAsyncWork(20);
    const box=window.Components?.box;
    const currentPayload=createCrossedGroupedBoxPayload(box,fixture.rows);
    await box.loadFromPayload(currentPayload,{source:'row-random-current-result-setup',skipDraw:true});
    const savedPayload=JSON.parse(JSON.stringify(box.getPayload()));
    const activeTab=window.Main?.session?.getActiveTab?.();
    const session=box.__testHooks.getSession(activeTab?.id,{create:false});
    const methodToken='row-random-sphericity-v1';
    expect(session.state.results).toEqual(expect.objectContaining({hasResults:true,analysisId:'rowRandomMixed'}));
    expect(savedPayload.config.stats.contextSignature).toContain(methodToken);
    expect(savedPayload.config.stats.reportModel.analysisSpec.repeatedMeasures.design).toBe('fully-crossed-within-subjects');
    expect(session.state.results.rowRandomMethodStale).toBe(false);
    expect(session.state.results.lastRunVersion).toBeGreaterThan(0);

    await box.loadFromPayload(savedPayload,{source:'row-random-current-result-reopen',skipDraw:true});
    await flushAsyncWork(25);
    expect(session.state.results.rowRandomMethodStale).toBe(false);
    expect(session.state.results.lastRunVersion).toBeGreaterThan(0);
    expect(session.state.results.report.analysisSpec.repeatedMeasures).toEqual(
      savedPayload.config.stats.reportModel.analysisSpec.repeatedMeasures
    );

    const Main=window.Main;
    Main.tabs.handleAddTabClick();
    await flushAsyncWork(10);
    const duplicatePrompt=document.getElementById('duplicatePrompt');
    if(duplicatePrompt && !duplicatePrompt.hasAttribute('hidden')){
      document.getElementById('duplicateEmpty')?.click();
      await flushAsyncWork(10);
    }
    await activateWorkspace('box');
    const secondTab=Main.session.getActiveTab();
    const secondActivation=Main.tabs.activateTab(secondTab.id,{reason:'crossed-repeated-second-owner'});
    if(secondActivation?.then) await secondActivation;
    await waitForIntegrationOwnerReady({
      type:'box',expectedTabId:secondTab.id,requireMountedRoot:true,
      condition:()=>String(box.__boundTabId || '')===String(secondTab.id)
        && box.__testHooks.getSession(secondTab.id,{create:false})?.refs?.root?.isConnected===true
    });
    const secondRows=fixture.rows.map((subject,subjectIndex)=>subject.map((group,groupIndex)=>
      group.map(value=>value+(groupIndex===0?subjectIndex*3:0))));
    const secondPayload=createCrossedGroupedBoxPayload(box,secondRows);
    await box.loadFromPayload(secondPayload,{
      source:'crossed-repeated-second-owner-results',tab:secondTab,tabId:secondTab.id,skipDraw:true
    });
    const secondSession=box.__testHooks.getSession(secondTab.id,{create:false});
    const firstSpec=session.state.results.report?.analysisSpec
      || session.state.results.panelModel.reportModel?.analysisSpec;
    const secondSpec=secondSession.state.results.report?.analysisSpec
      || secondSession.state.results.panelModel.reportModel?.analysisSpec;
    const firstEffect=firstSpec.repeatedMeasures.effects.group;
    const secondEffect=secondSpec.repeatedMeasures.effects.group;
    expect(secondSession.state.results.signature).not.toBe(session.state.results.signature);
    expect(secondEffect.f).not.toBe(firstEffect.f);

    const firstActivation=Main.tabs.activateTab(activeTab.id,{reason:'crossed-repeated-return-first-owner'});
    if(firstActivation?.then) await firstActivation;
    await waitForIntegrationOwnerReady({
      type:'box',expectedTabId:activeTab.id,requireMountedRoot:true,
      condition:()=>String(box.__boundTabId || '')===String(activeTab.id)
        && box.__testHooks.getSession(activeTab.id,{create:false})?.refs?.root?.isConnected===true
    });
    expect(box.getPayload().config.stats.reportModel.analysisSpec.repeatedMeasures.effects.group.f)
      .toBe(firstEffect.f);

    const stripCurrentMethod=value=>{
      if(Array.isArray(value)) return value.map(stripCurrentMethod);
      if(!value || typeof value!=='object') return value;
      const result={};
      for(const [key,entry] of Object.entries(value)){
        if(key==='rowRandomSphericityVersion' || key==='repeatedMeasures' || key==='methodVersion') continue;
        result[key]=stripCurrentMethod(entry);
      }
      if(result.schemaVersion==='box-stats-spec-v8') result.schemaVersion='box-stats-spec-v7';
      return result;
    };
    const legacyPayload=stripCurrentMethod(savedPayload);
    legacyPayload.config.stats.contextSignature=legacyPayload.config.stats.contextSignature
      .split('|').filter(token=>token!==methodToken).join('|');
    legacyPayload.config.stats.rowRandomMethodStale=false;
    if(legacyPayload.config.stats.annotationModel?.signature){
      legacyPayload.config.stats.annotationModel.signature=legacyPayload.config.stats.annotationModel.signature
        .split('|').filter(token=>token!==methodToken).join('|');
    }
    await box.loadFromPayload(JSON.parse(JSON.stringify(legacyPayload)),{
      source:'row-random-legacy-result-reopen',skipDraw:true
    });
    await flushAsyncWork(25);
    expect(session.state.results.hasResults).toBe(true);
    expect(session.state.results.rowRandomMethodStale).toBe(true);
    expect(session.state.results.lastRunVersion).toBe(0);
    expect(session.state.results.panelModel.resultsModel).toBeTruthy();
    expect(box.getPayload().config.stats.rowRandomMethodStale).toBe(true);
    expect(box.getPayload().config.stats.lastRunVersion).toBe(0);
    expect(getBoxNode('boxStatsStatus')?.textContent).toMatch(/recalculate|earlier/i);
  },120000);

  test.each([
    ['studentized-range-direct-sf-v2', null],
    ['control-sidak-v2', { mode: 'reference', postHoc: 'dunnett' }],
    ['rank-differences-decimal-v1', { test: 'nonparametric', paired: true, postHoc: 'standard' }],
    ['paired-rank-biserial-v2', { test: 'nonparametric', paired: true, postHoc: 'standard', effectNonParametric: 'rankBiserial' }],
    ['friedman-resampling-v2', { test: 'nonparametric', paired: true, postHoc: 'standard', resamplingMode: 'exact' }],
    ['outlier-screening-v2', { postHoc: 'standard', outlierMode: 'rout' }]
  ])('Box preserves historical values and requests recalculation for %s', async (versionToken, settings) => {
    const box = await prepareBoxStats();
    if(settings){
      const payload=box.getPayload();
      Object.assign(payload.config.stats,settings);
      box.loadFromPayload(payload,{source:'versioned-statistics-fixture',skipDraw:true});
      await box.draw();
      await flushAsyncWork(20);
      getBoxNode('boxComputeStats').click();
      await flushAsyncWork(30);
    }
    const significanceToggle = getBoxNode('boxShowSignificance');
    significanceToggle.checked = true;
    significanceToggle.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(30);
    const currentPayload = box.getPayload();
    const currentSignature = currentPayload?.config?.stats?.contextSignature;
    expect(currentSignature).toContain(versionToken);

    box.loadFromPayload(currentPayload, { source: 'studentized-range-current-restore', skipDraw: true });
    await flushAsyncWork(20);
    const tabId = window.Main?.session?.getActiveTab?.()?.id;
    const session = box.__testHooks.getSession(tabId);
    expect(session?.state?.results?.signature).toBe(currentSignature);
    expect(box.__getState().statsLastRunVersion).toBeGreaterThan(0);

    const legacyPayload = JSON.parse(JSON.stringify(currentPayload));
    const legacySignature = currentSignature.split('|').filter(part=>part!==versionToken).join('|');
    legacyPayload.config.stats.contextSignature = legacySignature;
    if(legacyPayload.config.stats.annotationModel){
      legacyPayload.config.stats.annotationModel.signature = legacySignature;
    }
    box.loadFromPayload(legacyPayload, { source: 'studentized-range-legacy-restore', skipDraw: true });
    await flushAsyncWork(20);

    const passivelyCapturedPayload = box.getPayload();
    expect(passivelyCapturedPayload.config.stats.contextSignature).toBe(legacySignature);
    expect(session.state.results.signature).toBe(legacySignature);
    const historicalResults = JSON.parse(JSON.stringify(session.state.results));
    expect(historicalResults.hasResults).toBe(true);
    expect(historicalResults.panelModel.resultsModel).toBeTruthy();
    expect(historicalResults.report).toBeTruthy();
    expect(historicalResults.annotationModel).toBeTruthy();

    await box.draw();
    await flushAsyncWork(30);
    expect(box.__getState().statsLastRunVersion).toBe(0);
    expect(session.state.results.hasResults).toBe(true);
    expect(session.state.results.signature).toBe(legacySignature);
    expect(session.state.results.panelModel).toEqual(historicalResults.panelModel);
    expect(session.state.results.report).toEqual(historicalResults.report);
    expect(session.state.results.annotationModel).toEqual(historicalResults.annotationModel);
    expect(getBoxNode('boxStatsStatus')?.textContent).toMatch(/recalculate|earlier/i);
    expect(document.querySelectorAll('#boxPage:not([hidden]) #boxPlot .box-significance-annotation')).toHaveLength(0);

    const stalePayload = box.getPayload();
    expect(stalePayload.config.stats.lastRunVersion).toBe(0);
    expect(stalePayload.config.stats.contextSignature).toBe(legacySignature);
    expect(stalePayload.config.stats.resultsModel).toBeTruthy();
    box.loadFromPayload(stalePayload, { source: 'studentized-range-stale-result-reopen', skipDraw: true });
    await flushAsyncWork(20);
    expect(session.state.results.hasResults).toBe(true);
    expect(session.state.results.signature).toBe(legacySignature);
    expect(session.state.results.panelModel).toEqual(historicalResults.panelModel);
    expect(session.state.results.annotationModel).toEqual(historicalResults.annotationModel);
    expect(box.__getState().statsLastRunVersion).toBe(0);
    expect(getBoxNode('boxStatsStatus')?.textContent).toMatch(/recalculate|earlier/i);
    expect(document.querySelectorAll('#boxPage:not([hidden]) #boxPlot .box-significance-annotation')).toHaveLength(0);
  }, 60000);

  test('Box report finalization is pure and idempotent', async () => {
    await activateWorkspace('box');
    await flushAsyncWork(20);
    const box=window.Components?.box;
    const source={
      methodsText:'A parametric analysis was performed.',
      resultsText:'The result was recorded.',
      methodsParts:['A parametric analysis was performed.'],
      resultsParts:['The result was recorded.'],
      analysisSpec:{ family:'parametric' }
    };
    const context={ familyDescription:'The planned family was preserved.',resultSuffix:'The result is final.' };
    const once=box.__testHooks.finalizeStatsReportForTest(source,context);
    const twice=box.__testHooks.finalizeStatsReportForTest(once,context);
    expect(source.methodsParts).toEqual(['A parametric analysis was performed.']);
    expect(once).toEqual(twice);
    expect(once.methodsText.match(/planned family/g)).toHaveLength(1);
    expect(once.resultsText.match(/result is final/g)).toHaveLength(1);
    expect(once.methodsText).not.toMatch(/rank-based|outlier screening/i);
  },60000);

  test.each(['plain', 'fusion', 'fusion-pairs'])('Box single-table reopen keeps paired historical results after a grouped Box tab was active (%s labels)', async labelKind => {
    const box = await prepareBoxStats();
    const Main = window.Main;
    const liveBoxState = box.__getState();
    if(labelKind !== 'plain'){
      liveBoxState.hot.setDataAtCell(0, 2, 'BCR::ABL1');
    }
    liveBoxState.statsPaired = true;
    liveBoxState.statsPairsText = labelKind === 'fusion-pairs' ? 'BCR::ABL1-Treatment A' : '3-2';
    liveBoxState.statsCustomPairs = [{ ai: 2, bi: 1 }];
    await box.draw();
    await flushAsyncWork(20);
    getBoxNode('boxComputeStats').click();
    await flushAsyncWork(30);
    const targetTab = Main.session.getActiveTab();
    const targetSession = box.__testHooks.getSession(targetTab.id, { create: false });
    const savedPayload = JSON.parse(JSON.stringify(box.getPayload()));
    expect(savedPayload.config.stats.customPairs).toEqual([{ ai: 2, bi: 1 }]);
    delete savedPayload.config.stats.customPairs;
    const currentGroupedConfig = savedPayload.config.grouped || {};
    const legacyGroupedConfig = { replicatesPerGroup: currentGroupedConfig.replicatesPerGroup };
    const currentGroupedJson = JSON.stringify(currentGroupedConfig);
    const legacyGroupedJson = JSON.stringify(legacyGroupedConfig);
    const currentSignature = targetSession?.state?.results?.signature;
    const currentGroupedSignaturePart = `single|${currentGroupedJson}|`;
    let legacySignature = typeof currentSignature === 'string'
      ? currentSignature.split('|')
          .filter(part => !/^(?:paired-rank-biserial-v\d+|box-statistical-inputs-v\d+)$/.test(part))
          .join('|')
      : currentSignature;
    if(legacySignature?.includes(currentGroupedSignaturePart)){
      legacySignature = legacySignature.replace(currentGroupedSignaturePart, `single|${legacyGroupedJson}|`);
    }
    legacySignature = legacySignature?.replace(/:\d+:[0-9a-f]+:[0-9a-f]+(?=;|$)/gi, '');
    savedPayload.config.grouped = legacyGroupedConfig;
    savedPayload.config.stats.contextSignature = legacySignature;
    if(savedPayload.config.stats.annotationModel){
      savedPayload.config.stats.annotationModel.signature = legacySignature;
    }
    expect(targetSession?.state?.results?.hasResults).toBe(true);
    expect(legacySignature).toBeTruthy();
    expect(legacySignature).toContain('[{\"ai\":2,\"bi\":1}]');

    Main.tabs.handleAddTabClick();
    await flushAsyncWork(10);
    await activateWorkspace('box');
    const groupedTab = Main.session.getActiveTab();
    expect(groupedTab.id).not.toBe(targetTab.id);
    const groupedActivation = Main.tabs.activateTab(groupedTab.id, { reason: 'activate-grouped-box-owner' });
    if(groupedActivation && typeof groupedActivation.then === 'function') await groupedActivation;
    await waitForIntegrationOwnerReady({
      type: 'box',
      expectedTabId: groupedTab.id,
      requireMountedRoot: true,
      condition: () => String(box.__boundTabId || '') === String(groupedTab.id)
        && box.__testHooks.getSession(groupedTab.id, { create: false })?.refs?.root?.isConnected === true
    });
    const groupedPayload = box.createEmptyPayload();
    groupedPayload.config.tableFormat = 'grouped';
    groupedPayload.config.grouped = {
      replicatesPerGroup: 2,
      groups: ['Foreign group A', 'Foreign group B'],
      conditions: ['Foreign condition A', 'Foreign condition B']
    };
    groupedPayload.data[0][0] = 'Foreign group A';
    groupedPayload.data[0][2] = 'Foreign group B';
    groupedPayload.data[1][0] = 'Foreign condition A';
    groupedPayload.data[1][2] = 'Foreign condition B';
    box.loadFromPayload(groupedPayload, {
      source: 'grouped-owner-before-single-reopen',
      tab: groupedTab,
      tabId: groupedTab.id
    });
    await flushAsyncWork(30);
    expect(box.__getState().grouped.groups).toEqual(expect.arrayContaining(['Foreign group A', 'Foreign group B']));
    expect(box.__getState().grouped.conditions).toContain('Foreign condition A');

    Main.tabs.handleAddTabClick();
    await flushAsyncWork(10);
    await activateWorkspace('box');
    const reopenedTab = Main.session.getActiveTab();
    expect(reopenedTab.id).not.toBe(groupedTab.id);
    const activation = Main.tabs.activateTab(reopenedTab.id, { reason: 'single-box-reopen-after-grouped-owner' });
    if(activation && typeof activation.then === 'function') await activation;
    await waitForIntegrationOwnerReady({
      type: 'box',
      expectedTabId: reopenedTab.id,
      requireMountedRoot: true,
      condition: () => String(box.__boundTabId || '') === String(reopenedTab.id)
        && box.__testHooks.getSession(reopenedTab.id, { create: false })?.refs?.root?.isConnected === true
    });
    await flushAsyncWork(20);
    const reopenedSession = box.__testHooks.getSession(reopenedTab.id, { create: false });
    box.loadFromPayload(savedPayload, {
      source: 'single-box-reopen-after-grouped-owner',
      tab: reopenedTab,
      tabId: reopenedTab.id
    });
    expect(reopenedSession.state.visual.grouped.groups || []).toEqual([]);
    expect(reopenedSession.state.visual.grouped.conditions || []).toEqual([]);
    await flushAsyncWork(30);
    await box.draw();
    await flushAsyncWork(30);

    const restoredPayload = box.getPayload();
    expect(restoredPayload.config.grouped.groups || []).toEqual([]);
    expect(restoredPayload.config.grouped.conditions || []).toEqual([]);
    expect(reopenedSession.state.results.hasResults).toBe(true);
    expect(reopenedSession.state.results.signature).toBe(legacySignature);
    expect(reopenedSession.state.results.lastRunVersion).toBe(0);
    expect(reopenedSession.state.results.panelModel.resultsModel).toBeTruthy();
    expect(box.__getState().statsCustomPairs).toEqual([{ ai: 2, bi: 1 }]);

    // Moving the final paired observation preserves its values and order but
    // changes pairing. Historical results must become invalid in the live owner.
    const hot = box.__getState().hot;
    const data = hot.getData();
    let lastRow = data.length - 1;
    while(lastRow > 0 && (data[lastRow]?.[0] == null || data[lastRow][0] === '')) lastRow -= 1;
    const finalValue = data[lastRow][0];
    hot.setDataAtCell([[lastRow, 0, ''], [lastRow + 1, 0, finalValue]], 'edit');
    await box.draw();
    await flushAsyncWork(30);
    expect(reopenedSession.state.results.hasResults).toBe(false);

    // Changed observations or inference settings cannot reuse archived results.
    for(const change of ['value', 'confidence']){
      const changedPayload = JSON.parse(JSON.stringify(savedPayload));
      if(change === 'value'){
        changedPayload.data[1][0] = Number(changedPayload.data[1][0]) + 1;
      }else{
        changedPayload.config.stats.ciLevel = 0.9;
      }
      box.loadFromPayload(changedPayload, { tab: reopenedTab, tabId: reopenedTab.id });
      await box.draw();
      await flushAsyncWork(30);
      expect(reopenedSession.state.results.hasResults).toBe(false);
    }
  },120000);

  test('box reporting stays below descriptive statistics and survives switching to another component tab', async () => {
    await prepareBoxStats();

    let statsResults = getBoxNode('statsResults');
    let statsTable = getBoxNode('statsTable');
    let reportHost = getBoxNode('boxStatsReportHost');
    expect(statsResults).toBeTruthy();
    expect(statsTable).toBeTruthy();
    expect(reportHost).toBeTruthy();
    expect(statsResults.contains(reportHost)).toBe(false);

  }, 120000);

  test('payload restore preserves stats content for box, scatter, line, pie, pca, and heatmap', async () => {
    const box = await prepareBoxStats();
    const boxPayload = box.getPayload();
    expect(boxPayload?.config?.stats).toBeTruthy();
    expectStructuredReport(boxPayload.config.stats);
    getBoxNode('statsResults').innerHTML = '';
    getBoxNode('boxStatsReportHost').innerHTML = '';
    box.loadFromPayload(boxPayload, { source: 'test-box-restore', skipDraw: true });
    await flushAsyncWork(40);
    expect(`${getBoxNode('statsResults')?.textContent || ''} ${getBoxNode('boxStatsReportHost')?.textContent || ''}`).toMatch(/One-way ANOVA|Pairwise comparisons/i);

    const scatter = await prepareScatterStats();
    const scatterPayload = scatter.getPayload();
    expectStructuredReport(scatterPayload?.config?.stats);
    document.getElementById('scatterStatsResults').innerHTML = '';
    scatter.loadFromPayload(scatterPayload, { source: 'test-scatter-restore', skipDraw: true });
    await flushAsyncWork(40);
    expect(document.getElementById('scatterStatsResults')?.textContent || '').toMatch(/Overall test summary|Reporting and reproducibility/i);
    expectSingleReportPanel('scatterStatsResults', 'scatterStatsReportHost');

    const line = await prepareLineStats();
    const linePayload = line.getPayload();
    expectStructuredReport(linePayload?.config?.stats);
    document.getElementById('lineStatsResults').innerHTML = '';
    line.loadFromPayload(linePayload, { source: 'test-line-restore', skipDraw: true });
    await flushAsyncWork(40);
    expect(document.getElementById('lineStatsResults')?.textContent || '').toMatch(/Pearson correlation|Reporting and reproducibility|Series/i);
    expectSingleReportPanel('lineStatsResults', 'lineStatsReportHost');

    // pie's render cache carries the graph only; its stats panel is rebuilt from the
    // persisted payload on load (not replayed as DOM), so verify the payload path.
    const pie = await preparePieStats();
    const piePayload = pie.getPayload();
    const pieBefore = document.getElementById('pieStatsResults')?.textContent || '';
    document.getElementById('pieStatsResults').innerHTML = '';
    pie.loadFromPayload(piePayload, { source: 'test-pie-restore', skipDraw: true });
    await flushAsyncWork(40);
    expect(document.getElementById('pieStatsResults')?.textContent || '').toContain(pieBefore.slice(0, Math.min(20, pieBefore.length)));
    expectSingleReportPanel('pieStatsResults', 'pieStatsReportHost');

    const pca = await preparePcaStats();
    const pcaPayload = pca.getPayload();
    expect(JSON.stringify(pcaPayload?.config?.stats?.summaryModel || {})).toContain('Samples');
    expectStructuredReport(pcaPayload?.config?.stats);
    document.getElementById('pcaStatsResults').innerHTML = '';
    pca.loadFromPayload(pcaPayload, { source: 'test-pca-restore', skipDraw: true });
    await flushAsyncWork(60);
    expect(document.getElementById('pcaStatsResults')?.textContent || '').toContain('Reporting and reproducibility');
    expectSingleReportPanel('pcaStatsResults', 'pcaStatsReportHost');

    const heatmap = await prepareHeatmapStats('corr-columns');
    const heatmapPayload = heatmap.getPayload();
    document.getElementById('heatmapStatsContent').innerHTML = '';
    heatmap.loadFromPayload(heatmapPayload, { source: 'test-heatmap-restore', skipDraw: false });
    await flushAsyncWork(120);
    expect(document.getElementById('heatmapStatsContent')?.textContent || '').toMatch(/Items analysed|Reporting and reproducibility/i);
    expectSingleReportPanel('heatmapStatsContent', 'heatmapStatsReportHost');
  }, 120000);

  test('Pie restores v2/v3 report models with result tables and figure summaries', async () => {
    const pie = await preparePieStats();
    const legacyPayload = JSON.parse(JSON.stringify(pie.getPayload()));
    const currentStats = legacyPayload.config.stats;
    const currentReport = currentStats.reportModel;
    const previousResultsText = document.getElementById('pieStatsResults')?.textContent || '';
    expect(currentStats.resultsModel?.children?.length).toBeGreaterThan(0);
    expect(currentReport?.figureSummary?.sections?.length).toBeGreaterThan(0);

    legacyPayload.config.stats = {
      ...currentStats,
      resultsModel: {
        schemaVersion: 2,
        kind: 'stats-panel',
        nodes: currentStats.resultsModel.children
      },
      reportModel: {
        schemaVersion: 3,
        kind: 'stats-report',
        title: currentReport.title,
        methodsText: currentReport.methodsText,
        resultsText: currentReport.resultsText,
        analysisSpec: currentReport.analysisSpec,
        figureSummary: currentReport.figureSummary,
        open: currentReport.open
      }
    };

    document.getElementById('pieStatsResults').innerHTML = '';
    pie.loadFromPayload(legacyPayload, { source: 'test-pie-legacy-v2-v3-stats', skipDraw: true });
    await flushAsyncWork(40);

    expect(document.getElementById('pieStatsResults')?.textContent || '').toContain(previousResultsText.slice(0, 20));
    expectSingleReportPanel('pieStatsResults', 'pieStatsReportHost');
    const restoredStats = pie.getPayload()?.config?.stats || {};
    const restoredFigureSummary = restoredStats.reportModel?.figureSummary || null;
    const restoredFigureRowCount = (restoredFigureSummary?.sections || []).reduce(
      (total, section) => total + (Array.isArray(section?.rows) ? section.rows.length : 0),
      0
    );
    expect(restoredFigureRowCount).toBeGreaterThan(0);
  }, 120000);

  test('render cache restore preserves stats panels for hist, roc, survival, pca, and heatmap', async () => {
    const hist = await prepareHistStats();
    const histBefore = document.getElementById('histStatsResults')?.textContent || '';
    const histCache = hist.captureRenderCache();
    // Stats DOM cache is optional. Durable owner stats must restore even when the
    // optimization is deliberately unavailable.
    histCache.stats = null;
    document.getElementById('histStatsResults').innerHTML = '';
    expect(hist.restoreRenderCache(histCache)).toBe(true);
    await flushAsyncWork(20);
    expect(document.getElementById('histStatsResults')?.textContent || '').toContain('Descriptive statistics');
    expect(histBefore.length).toBeGreaterThan(0);
    expectSingleReportPanel('histStatsResults', 'histStatsReportHost');

    const roc = await prepareRocStats();
    const rocCache = roc.captureRenderCache();
    expect(rocCache).toEqual(expect.objectContaining({
      graphOnly: true,
      __graphitixRenderCache: expect.objectContaining({
        type: 'roc',
        complete: true
      })
    }));
    expect(rocCache.stats).toBeUndefined();
    document.getElementById('rocStatsResults').innerHTML = '';
    expect(roc.restoreRenderCache(rocCache)).toBe(true);
    await flushAsyncWork(20);
    expect(document.getElementById('rocStatsResults')?.textContent || '').toMatch(/ROC metrics|AUC/i);
    expectSingleReportPanel('rocStatsResults', 'rocStatsReportHost');

    const survival = await prepareSurvivalStats();
    const survivalPayload = survival.getPayload();
    const survivalCache = survival.captureRenderCache();
    expect(survivalCache.stats).toBeUndefined();
    document.getElementById('survivalStatsSummary').innerHTML = '';
    document.getElementById('survivalStatsLogRank').innerHTML = '';
    document.getElementById('survivalStatsHazardRatios').innerHTML = '';
    document.getElementById('survivalStatsCox').innerHTML = '';
    survival.loadFromPayload(survivalPayload, { source: 'test-survival-cache-payload', skipDraw: true });
    expect(survival.restoreRenderCache(survivalCache)).toBe(true);
    await flushAsyncWork(20);
    expect(document.getElementById('survivalStatsLogRank')?.textContent || '').toMatch(/Survival Curve Comparisons|Pairwise Log-rank Comparisons/i);
    expect(document.getElementById('survivalStatsCox')?.textContent || '').toMatch(/Cox Model Coefficients|Cox Model Group Effects/i);
    expectSingleReportPanel('survivalStatsCox', 'survivalStatsReportHost');

    const pca = await preparePcaStats();
    // The render cache carries only the graph; the stats panel (summary, scree, biplot,
    // eigen, loadings) is rebuilt from lastPcaStats on restore rather than replayed as DOM.
    // Removing the rendered scree + biplot first proves restore rebuilds them from data
    // (the reopen/recovery regression: snapshotted stats DOM orphaned the node refs).
    const pcaCache = pca.captureRenderCache();
    document.getElementById('pcaBiplotCard')?.remove();
    const screeContainer = document.getElementById('pcaScreeContainer');
    const screePlot = document.getElementById('pcaScreePlot');
    if(screePlot){ screePlot.innerHTML = ''; }
    if(screeContainer){ screeContainer.hidden = true; }
    expect(pca.restoreRenderCache(pcaCache)).toBe(true);
    await flushAsyncWork(40);
    expect(document.getElementById('pcaStatsResults')?.textContent || '').toContain('Reporting and reproducibility');
    expect(document.getElementById('pcaBiplotCard')).toBeTruthy();
    expect(document.getElementById('pcaScreeContainer')?.hidden).toBe(false);
    expectSingleReportPanel('pcaStatsResults', 'pcaStatsReportHost');

    const heatmap = await prepareHeatmapStats('values');
    const heatmapCache = heatmap.captureRenderCache();
    // As for Histogram, prove the durable statistics model is authoritative rather
    // than relying on replay of cached stats DOM.
    heatmapCache.stats = null;
    document.getElementById('heatmapStatsContent').innerHTML = '';
    expect(heatmap.restoreRenderCache(heatmapCache)).toBe(true);
    await flushAsyncWork(20);
    expect(document.getElementById('heatmapStatsContent')?.textContent || '').toMatch(/Rows|Columns|Reporting and reproducibility/i);
    expectSingleReportPanel('heatmapStatsContent', 'heatmapStatsReportHost');
  }, 120000);
});
