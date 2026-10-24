const { ensureJStatStub } = require('../helpers/jstatTestStub');
const {
  loadProductionBootstrap,
  resetProductionNamespaces
} = require('../../test-support/productionLoader');
const { waitForIntegrationOwnerReady } = require('../../test-support/readiness');

async function settleBoxOwner(){
  await new Promise(resolve=>setTimeout(resolve,0));
  const tab=window.Main?.session?.getActiveTab?.();
  const prompt=document.getElementById('duplicatePrompt');
  if(tab?.type!=='box' || (prompt && !prompt.hidden)) return;
  await waitForIntegrationOwnerReady({
    type:'box',expectedTabId:tab.id,requireMountedRoot:true,
    condition:()=>{
      const state=window.Components.box.__getState();
      return !state.drawScheduled && !state.drawInProgress && !state.statsComputationPending;
    }
  });
}

async function waitForBoxSvg(iterations = 80){
  for(let i = 0; i < iterations; i += 1){
    const activeTab = window.Main?.session?.getActiveTab?.() || null;
    const tabId = activeTab?.type === 'box' ? String(activeTab.id || '') : '';
    const mountedRoot = tabId && typeof window.Shared?.workspaceTabs?.getMountedRoot === 'function'
      ? window.Shared.workspaceTabs.getMountedRoot(tabId, 'box')
      : null;
    const svg = mountedRoot?.querySelector?.('#boxPlot svg')
      || (tabId ? document.querySelector(`[data-workspace-tab-id="${tabId}"] #boxPlot svg`) : null)
      || document.querySelector('#boxPage:not([hidden]) #boxPlot svg')
      || document.querySelector('#boxPlot svg');
    if(svg){
      return svg;
    }
    await settleBoxOwner();
  }
  return null;
}

async function waitForStatsButtonText(text, iterations = 120){
  for(let i = 0; i < iterations; i += 1){
    const button = getBoxStatsButton();
    if(button?.textContent === text){
      return button;
    }
    await settleBoxOwner();
  }
  return getBoxStatsButton();
}

async function advanceAsyncTime(ms){
  const duration = Math.max(0, Number(ms) || 0);
  await new Promise(resolve => setTimeout(resolve, duration));
  await settleBoxOwner();
}

async function activateWorkspace(type){
  const result = window.Main?.tabs?.handleGraphSelection?.(type, { reason: 'test-select' });
  if(result && typeof result.then === 'function'){
    await result;
  }
  await settleBoxOwner();
}

async function activateTabById(tabId, reason){
  const result = window.Main?.tabs?.activateTab?.(tabId, { reason: reason || 'test-switch' });
  if(result && typeof result.then === 'function'){
    await result;
  }
  await settleBoxOwner();
}

function findStatsTestSelect(){
  const selects = Array.from(document.querySelectorAll('#statsControls select'));
  return selects.find(sel => {
    const values = Array.from(sel.options || []).map(opt => opt.value);
    return values.includes('parametric') && values.includes('nonparametric');
  }) || null;
}

function setStatsTestValue(value){
  const select = findStatsTestSelect();
  expect(select).toBeTruthy();
  select.value = value;
  select.dispatchEvent(new window.Event('change', { bubbles: true }));
}

function setStatsScopeValue(value){
  const select = getBoxNodeInActiveTab('#boxStatsScope');
  expect(select).toBeTruthy();
  select.value = value;
  select.dispatchEvent(new window.Event('change', { bubbles: true }));
}

function getCustomPairsInput(){
  const rows = Array.from(getBoxNodeInActiveTab('#statsControls')?.querySelectorAll?.('.box-stats-options__row') || []);
  const row = rows.find(node => node.querySelector(':scope > label')?.textContent?.trim() === 'Pairs') || null;
  return row?.querySelector?.('input[type="text"]') || null;
}

function createSeedPayload(boxComponent){
  const payload = boxComponent.createEmptyPayload();
  payload.data = [
    ['Control', 'Treatment A', 'Treatment B'],
    [10, 12, 11],
    [9, 13, 10],
    [11, 14, 12]
  ];
  return payload;
}

async function loadSeedPayloadForActiveTab(boxComponent, source){
  const activeTab = window.Main?.session?.getActiveTab?.() || null;
  expect(activeTab?.type).toBe('box');
  window.Shared?.workspaceTabs?.activateSession?.(activeTab, 'box', { reason: `${source}-activate-session` });
  await boxComponent.activateTab?.(activeTab, { reason: `${source}-activate-box-tab` });
  await boxComponent.loadFromPayload(createSeedPayload(boxComponent), {
    source,
    tabId: activeTab.id,
    tab: activeTab
  });
  await boxComponent.draw?.({
    tabId: activeTab.id,
    tab: activeTab,
    reason: `${source}-draw`,
    force: true
  });
}

async function selectBoxStatColumns(count=3){
  expect(await waitForBoxSvg()).toBeTruthy();
  for(let index=0;index<count;index+=1){
    const checkbox=getBoxNodeInActiveTab(`#statCol${index}`);
    expect(checkbox).toBeTruthy();
    if(!checkbox.checked){
      checkbox.checked=true;
      checkbox.dispatchEvent(new window.Event('change',{ bubbles:true }));
      await settleBoxOwner();
    }
  }
}

async function computeBoxStatsForActiveTab(boxComponent){
  expect(window.Main?.session?.getActiveTab?.()?.type).toBe('box');
  expect(await waitForBoxSvg()).toBeTruthy();
  const statsButton = getBoxStatsButton();
  expect(statsButton).toBeTruthy();
  expect(statsButton.disabled).toBe(false);
  statsButton.click();
  await settleBoxOwner();
  expect((await waitForStatsButtonText('Calculate statistics'))?.textContent).toBe('Calculate statistics');
}

function getBoxStatsButton(){
  return getBoxNodeInActiveTab('#boxComputeStats');
}

function getBoxFlipAxesControl(){
  return getBoxNodeInActiveTab('#boxFlipAxes');
}

function setBoxFlipAxesValue(value){
  const control = getBoxFlipAxesControl();
  expect(control).toBeTruthy();
  control.checked = !!value;
  control.dispatchEvent(new window.Event('change', { bubbles: true }));
}

function readActiveBoxFlipSnapshot(boxComponent, reason){
  const activeTab = window.Main?.session?.getActiveTab?.() || null;
  const control = getBoxFlipAxesControl();
  const payload = boxComponent.getPayload?.() || null;
  const runtime = boxComponent.captureRuntimeState?.({
    tab: activeTab,
    tabId: activeTab?.id || null,
    reason: reason || 'test-box-flip-snapshot'
  }) || null;
  return {
    tabId: activeTab?.id || null,
    checkbox: !!control?.checked,
    moduleMirror: boxComponent.__getState?.()?.flipAxes === true,
    payload: payload?.config?.flipAxes === true,
    runtime: runtime?.ownedRuntime?.controls?.flipAxes === true,
    transitionOrientation: boxComponent.__getState?.()?.flipTransition?.active?.orientation || null
  };
}

function expectBoxFlipSnapshot(snapshot, tabId, expectedFlip){
  expect(snapshot.tabId).toBe(tabId);
  expect(snapshot.checkbox).toBe(expectedFlip);
  expect(snapshot.moduleMirror).toBe(expectedFlip);
  expect(snapshot.payload).toBe(expectedFlip);
  expect(snapshot.runtime).toBe(expectedFlip);
  expect(snapshot.transitionOrientation).toBe(expectedFlip ? 'horizontal' : 'vertical');
}

function getBoxNodeInActiveTab(selector){
  const activeTab = window.Main?.session?.getActiveTab?.() || null;
  const tabId = activeTab?.type === 'box' ? String(activeTab.id || '') : '';
  const mountedRoot = tabId && typeof window.Shared?.workspaceTabs?.getMountedRoot === 'function'
    ? window.Shared.workspaceTabs.getMountedRoot(tabId, 'box')
    : null;
  return mountedRoot?.querySelector?.(selector)
    || (tabId ? document.querySelector(`[data-workspace-tab-id="${tabId}"] ${selector}`) : null)
    || document.querySelector(`#boxPage:not([hidden]) ${selector}`)
    || document.querySelector(selector);
}

function debugArgsContain(args, text){
  return args.some(arg => {
    if(typeof arg === 'string'){
      return arg.includes(text);
    }
    try{
      return JSON.stringify(arg).includes(text);
    }catch(_err){
      return false;
    }
  });
}

describe('Box stats controls tab isolation with render cache', () => {
  jest.setTimeout(30000);
  let restoreJStat;

  beforeEach(() => {
    jest.resetModules();
    resetProductionNamespaces();
    restoreJStat = ensureJStatStub();
    if(typeof global.__restoreTestDebugLogs === 'function'){
      global.__restoreTestDebugLogs();
    }
    if(typeof global.__resetGrid__ === 'function'){
      global.__resetGrid__();
    }

    loadProductionBootstrap({
      fixtureLifetime:true,
      vendorMode: 'fake',
      preloadComponents: ['box']
    });
  });

  afterEach(() => {
    if(restoreJStat){
      restoreJStat();
      restoreJStat = null;
    }
    resetProductionNamespaces();
    if(typeof global.__suppressTestDebugLogs === 'function'){
      global.__suppressTestDebugLogs();
    }
  });

  test('switching between box tabs preserves per-tab stats control values', async () => {
    await activateWorkspace('box');

    const boxComponent = window.Components?.box;
    const main = window.Main;
    expect(boxComponent).toBeTruthy();
    expect(main?.tabs).toBeTruthy();

    await loadSeedPayloadForActiveTab(boxComponent, 'test-seed-a');
    await settleBoxOwner();

    const tabA = main.session.getActiveTab();
    expect(tabA?.type).toBe('box');

    expect(findStatsTestSelect()?.value).toBe('parametric');
    setStatsTestValue('nonparametric');
    await settleBoxOwner();

    expect(boxComponent.__getState().statsTest).toBe('nonparametric');
    expect(findStatsTestSelect()?.value).toBe('nonparametric');

    main.tabs.handleAddTabClick();
    await settleBoxOwner();
    await activateWorkspace('box');

    const duplicatePrompt = document.getElementById('duplicatePrompt');
    if(duplicatePrompt && !duplicatePrompt.hasAttribute('hidden')){
      const emptyButton = document.getElementById('duplicateEmpty');
      expect(emptyButton).toBeTruthy();
      emptyButton.click();
      await settleBoxOwner();
    }

    const tabB = main.session.getActiveTab();
    expect(tabB?.type).toBe('box');
    expect(tabB?.id).not.toBe(tabA?.id);

    await loadSeedPayloadForActiveTab(boxComponent, 'test-seed-b');
    await settleBoxOwner();

    expect(boxComponent.__getState().statsTest).toBe('parametric');
    expect(findStatsTestSelect()?.value).toBe('parametric');

    await activateTabById(tabA.id, 'test-switch-to-a');
    expect(boxComponent.__getState().statsTest).toBe('nonparametric');
    expect(findStatsTestSelect()?.value).toBe('nonparametric');

    await activateTabById(tabB.id, 'test-switch-to-b');
    expect(boxComponent.__getState().statsTest).toBe('parametric');
    expect(findStatsTestSelect()?.value).toBe('parametric');
  });

  test('post-hoc requests and explicit corrections remain isolated between box tabs', async () => {
    await activateWorkspace('box');

    const boxComponent=window.Components?.box;
    const main=window.Main;
    await loadSeedPayloadForActiveTab(boxComponent,'test-posthoc-isolation-a');
    await selectBoxStatColumns();
    const tabA=main.session.getActiveTab();
    const postHocA=getBoxNodeInActiveTab('#boxStatsPostHoc');
    expect(postHocA?.value).toBe('auto');
    postHocA.value='anovaPooled';
    postHocA.dispatchEvent(new window.Event('change',{ bubbles:true }));
    await settleBoxOwner();

    const correctionA=getBoxNodeInActiveTab('#boxStatsCorrection');
    expect(correctionA?.disabled).toBe(false);
    correctionA.value='bonferroni';
    correctionA.dispatchEvent(new window.Event('change',{ bubbles:true }));
    await settleBoxOwner();
    expect(boxComponent.__getState().statsCorrectionExplicit).toBe(true);
    await computeBoxStatsForActiveTab(boxComponent);
    const signatureA = boxComponent.__testHooks.getSession(tabA.id)?.state?.results?.signature;
    expect(signatureA).toBeTruthy();
    expect(signatureA).not.toContain('studentized-range-direct-sf-v2');

    main.tabs.handleAddTabClick();
    await settleBoxOwner();
    await activateWorkspace('box');
    const duplicatePrompt=document.getElementById('duplicatePrompt');
    if(duplicatePrompt && !duplicatePrompt.hasAttribute('hidden')){
      document.getElementById('duplicateEmpty')?.click();
      await settleBoxOwner();
    }
    await loadSeedPayloadForActiveTab(boxComponent,'test-posthoc-isolation-b');
    await selectBoxStatColumns();
    const tabB=main.session.getActiveTab();
    expect(tabB?.id).not.toBe(tabA?.id);
    expect(getBoxNodeInActiveTab('#boxStatsPostHoc')?.value).toBe('auto');
    expect(boxComponent.__getState().statsCorrectionExplicit).toBe(false);
    await computeBoxStatsForActiveTab(boxComponent);
    const signatureB = boxComponent.__testHooks.getSession(tabB.id)?.state?.results?.signature;
    expect(signatureB).toContain('studentized-range-direct-sf-v2');
    expect(signatureB).not.toBe(signatureA);

    await activateTabById(tabA.id,'test-posthoc-isolation-return-a');
    expect(getBoxNodeInActiveTab('#boxStatsPostHoc')?.value).toBe('anovaPooled');
    expect(getBoxNodeInActiveTab('#boxStatsCorrection')?.value).toBe('bonferroni');
    expect(boxComponent.__getState().statsCorrectionExplicit).toBe(true);
    const payloadA=boxComponent.getPayload();
    expect(payloadA.config.stats).toEqual(expect.objectContaining({
      postHoc:'anovaPooled',
      correction:'bonferroni',
      correctionExplicit:true
    }));

    await activateTabById(tabB.id,'test-posthoc-isolation-return-b');
    expect(getBoxNodeInActiveTab('#boxStatsPostHoc')?.value).toBe('auto');
    expect(boxComponent.__getState().statsCorrectionExplicit).toBe(false);
    expect(boxComponent.getPayload().config.stats.postHoc).toBe('auto');
    expect(boxComponent.__testHooks.getSession(tabB.id)?.state?.results?.signature).toBe(signatureB);
  }, 60000);

  test('a failed worker for an inactive Box tab cannot replace the active tab statistics panel', async () => {
    await activateWorkspace('box');

    const boxComponent = window.Components?.box;
    const main = window.Main;
    const tabA = main.session.getActiveTab();
    const payloadA = boxComponent.createEmptyPayload();
    payloadA.data = [
      ['A', 'B', 'C', 'D', 'E'],
      [10, 11, 12, 13, 14],
      [9, 12, 11, 15, 13],
      [11, 13, 14, 12, 16]
    ];
    window.Shared.workspaceTabs.activateSession(tabA, 'box', { reason: 'test-worker-failure-owner-a' });
    await boxComponent.activateTab(tabA, { reason: 'test-worker-failure-owner-a' });
    await boxComponent.loadFromPayload(payloadA, { source: 'test-worker-failure-owner-a', tabId: tabA.id, tab: tabA });
    await boxComponent.draw({ tabId: tabA.id, tab: tabA, reason: 'test-worker-failure-owner-a-draw', force: true });
    await selectBoxStatColumns(5);

    const postHoc = getBoxNodeInActiveTab('#boxStatsPostHoc');
    expect(postHoc).toBeTruthy();
    postHoc.value = 'tukey';
    postHoc.dispatchEvent(new window.Event('change', { bubbles: true }));
    await settleBoxOwner();

    const workers = window.Shared.Workers;
    let rejectWorker;
    const workerTask = new Promise((_resolve, reject) => { rejectWorker = reject; });
    const supportedSpy = jest.spyOn(workers, 'isSupported').mockReturnValue(true);
    const runTaskSpy = jest.spyOn(workers, 'runTask').mockReturnValue(workerTask);
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      getBoxStatsButton().click();
      await Promise.resolve();
      expect(runTaskSpy).toHaveBeenCalledTimes(1);
      expect(boxComponent.__getState().statsComputationPending).toBe(true);

      main.tabs.handleAddTabClick();
      await settleBoxOwner();
      await activateWorkspace('box');
      const duplicatePrompt = document.getElementById('duplicatePrompt');
      if(duplicatePrompt && !duplicatePrompt.hidden){
        document.getElementById('duplicateEmpty')?.click();
        await settleBoxOwner();
      }
      const tabB = main.session.getActiveTab();
      expect(tabB?.id).not.toBe(tabA.id);
      await loadSeedPayloadForActiveTab(boxComponent, 'test-worker-failure-owner-b');

      const statsPanelB = getBoxNodeInActiveTab('#statsResults');
      expect(statsPanelB).toBeTruthy();
      statsPanelB.textContent = 'tab-b-stats-owner-sentinel';
      rejectWorker(new Error('simulated Box worker failure'));
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(main.session.getActiveTab()?.id).toBe(tabB.id);
      expect(statsPanelB.textContent).toBe('tab-b-stats-owner-sentinel');

      await activateTabById(tabA.id, 'test-worker-failure-return-a');
      expect(getBoxStatsButton()?.disabled).toBe(false);
      expect(getBoxNodeInActiveTab('#boxStatsStatus')?.textContent).not.toMatch(/calculating statistics/i);
    }finally{
      supportedSpy.mockRestore();
      runTaskSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    }
  }, 60000);

  test('large Box statistics do not fall back to the main thread when workers fail or are unavailable', async () => {
    await activateWorkspace('box');

    const boxComponent = window.Components?.box;
    const tab = window.Main.session.getActiveTab();
    const payload = boxComponent.createEmptyPayload();
    payload.data = [
      ['A', 'B', 'C', 'D', 'E'],
      [10, 11, 12, 13, 14],
      [9, 12, 11, 15, 13],
      [11, 13, 14, 12, 16]
    ];
    window.Shared.workspaceTabs.activateSession(tab, 'box', { reason: 'test-worker-failure-active-owner' });
    await boxComponent.activateTab(tab, { reason: 'test-worker-failure-active-owner' });
    await boxComponent.loadFromPayload(payload, { source: 'test-worker-failure-active-owner', tabId: tab.id, tab });
    await boxComponent.draw({ tabId: tab.id, tab, reason: 'test-worker-failure-active-owner-draw', force: true });
    await selectBoxStatColumns(5);

    const postHoc = getBoxNodeInActiveTab('#boxStatsPostHoc');
    postHoc.value = 'tukey';
    postHoc.dispatchEvent(new window.Event('change', { bubbles: true }));
    await settleBoxOwner();

    const workers = window.Shared.Workers;
    let rejectWorker;
    const workerTask = new Promise((_resolve, reject) => { rejectWorker = reject; });
    const supportedSpy = jest.spyOn(workers, 'isSupported').mockReturnValue(true);
    const runTaskSpy = jest.spyOn(workers, 'runTask').mockReturnValue(workerTask);
    const modelSpy = jest.spyOn(window.Shared.boxStatsModel, 'computeBoxStatsModel');
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      getBoxStatsButton().click();
      await Promise.resolve();
      expect(runTaskSpy).toHaveBeenCalledTimes(1);
      rejectWorker(new Error('simulated active Box worker failure'));
      await settleBoxOwner();

      expect(modelSpy).not.toHaveBeenCalled();
      expect(getBoxNodeInActiveTab('#boxStatsStatus')?.textContent).toMatch(/failed|retry/i);
      expect(getBoxStatsButton()?.disabled).toBe(false);

      supportedSpy.mockReturnValue(false);
      getBoxStatsButton().click();
      await settleBoxOwner();
      expect(runTaskSpy).toHaveBeenCalledTimes(1);
      expect(modelSpy).not.toHaveBeenCalled();
      expect(getBoxNodeInActiveTab('#boxStatsStatus')?.textContent).toMatch(/worker.*unavailable/i);
    }finally{
      supportedSpy.mockRestore();
      runTaskSpy.mockRestore();
      modelSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    }
  }, 60000);

  test('flip axes remains owner-scoped across repeated same-component tab reuse', async () => {
    await activateWorkspace('box');

    const boxComponent = window.Components?.box;
    const main = window.Main;
    expect(boxComponent).toBeTruthy();
    expect(main?.tabs).toBeTruthy();

    await loadSeedPayloadForActiveTab(boxComponent, 'test-flip-isolation-a');
    await settleBoxOwner();
    const tabA = main.session.getActiveTab();
    expect(tabA?.type).toBe('box');
    expectBoxFlipSnapshot(readActiveBoxFlipSnapshot(boxComponent, 'test-flip-a-initial'), tabA.id, false);

    main.tabs.handleAddTabClick();
    await settleBoxOwner();
    await activateWorkspace('box');
    const duplicatePrompt = document.getElementById('duplicatePrompt');
    if(duplicatePrompt && !duplicatePrompt.hasAttribute('hidden')){
      const emptyButton = document.getElementById('duplicateEmpty');
      expect(emptyButton).toBeTruthy();
      emptyButton.click();
      await settleBoxOwner();
    }

    await loadSeedPayloadForActiveTab(boxComponent, 'test-flip-isolation-b');
    await settleBoxOwner();
    const tabB = main.session.getActiveTab();
    expect(tabB?.id).not.toBe(tabA.id);

    setBoxFlipAxesValue(true);
    await settleBoxOwner();
    expectBoxFlipSnapshot(readActiveBoxFlipSnapshot(boxComponent, 'test-flip-b-after-enable'), tabB.id, true);

    const sequence = [
      [tabA.id, false, 'test-flip-switch-a-1'],
      [tabB.id, true, 'test-flip-switch-b-1'],
      [tabA.id, false, 'test-flip-switch-a-2'],
      [tabB.id, true, 'test-flip-switch-b-2'],
      [tabA.id, false, 'test-flip-switch-a-3']
    ];
    for(const [tabId, expectedFlip, reason] of sequence){
      await activateTabById(tabId, reason);
      expectBoxFlipSnapshot(readActiveBoxFlipSnapshot(boxComponent, `${reason}-snapshot`), tabId, expectedFlip);
    }
  }, 120000);

  test('new empty box tab resets stats button label to Calculate statistics', async () => {
    await activateWorkspace('box');
    const boxComponent = window.Components?.box;
    const main = window.Main;
    expect(boxComponent).toBeTruthy();
    expect(main?.tabs).toBeTruthy();

    await loadSeedPayloadForActiveTab(boxComponent, 'test-stats-label-a');

    const statsButton = getBoxStatsButton();
    expect(statsButton).toBeTruthy();
    await computeBoxStatsForActiveTab(boxComponent);

    main.tabs.handleAddTabClick();
    await settleBoxOwner();
    await activateWorkspace('box');

    const duplicatePrompt = document.getElementById('duplicatePrompt');
    if(duplicatePrompt && !duplicatePrompt.hasAttribute('hidden')){
      const emptyButton = document.getElementById('duplicateEmpty');
      expect(emptyButton).toBeTruthy();
      emptyButton.click();
      await settleBoxOwner();
    }

    expect(getBoxStatsButton()?.textContent).toBe('Calculate statistics');
  }, 120000);

  test('custom pair edits write through before blur and calculate on the first click', async () => {
    await activateWorkspace('box');
    const boxComponent = window.Components?.box;
    expect(boxComponent).toBeTruthy();

    await loadSeedPayloadForActiveTab(boxComponent, 'test-custom-pairs-first-click');
    await settleBoxOwner();

    setStatsScopeValue('custom');

    let pairInput = getCustomPairsInput();
    expect(pairInput).toBeTruthy();
    pairInput.focus();
    await settleBoxOwner();
    expect(getCustomPairsInput()).toBe(pairInput);
    expect(document.activeElement).toBe(pairInput);

    pairInput.value = '1-2';
    pairInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    pairInput.focus();

    const activeTab = window.Main?.session?.getActiveTab?.() || null;
    const renderCache = boxComponent.captureRenderCache?.({
      tab: activeTab,
      tabId: activeTab?.id || null,
      payload: activeTab?.payload || null,
      reason: 'test-custom-pairs-focus-capture'
    });
    expect(renderCache).toBeTruthy();
    expect(boxComponent.restoreRenderCache?.(renderCache, {
      tab: activeTab,
      tabId: activeTab?.id || null,
      payload: activeTab?.payload || null,
      reason: 'test-custom-pairs-focus-restore',
      restoreLiveAfterCapture: true,
      skipStateMutation: true
    })).toBe(true);
    expect(getCustomPairsInput()).toBe(pairInput);
    expect(document.activeElement).toBe(pairInput);

    pairInput.dispatchEvent(new window.Event('change', { bubbles: true }));
    await settleBoxOwner();
    expect(boxComponent.__getState().statsPairsText).toBe('1-2');
    expect(boxComponent.__getState().statsCustomPairs).toHaveLength(1);
    const pairwiseProcedure = getBoxNodeInActiveTab('#boxStatsPostHoc');
    expect(pairwiseProcedure).toBeTruthy();
    expect(pairwiseProcedure.closest('.box-stats-options__row')?.hidden).toBe(false);
    expect(pairwiseProcedure.disabled).toBe(true);
    expect(pairwiseProcedure.selectedOptions?.[0]?.textContent).toBe('None');

    await computeBoxStatsForActiveTab(boxComponent);

    pairInput = getCustomPairsInput();
    expect(pairInput).toBeTruthy();
    const pairwiseProcedureAfterCompute = getBoxNodeInActiveTab('#boxStatsPostHoc');
    expect(pairwiseProcedureAfterCompute).toBeTruthy();
    expect(pairwiseProcedureAfterCompute.selectedOptions?.[0]?.textContent).toBe('None');
    pairInput.focus();
    pairInput.value = '1-2,2-3';
    pairInput.dispatchEvent(new window.Event('input', { bubbles: true }));

    expect(boxComponent.__getState().statsPairsText).toBe('1-2,2-3');
    expect(boxComponent.__getState().statsCustomPairs).toHaveLength(2);
    expect(getCustomPairsInput()).toBe(pairInput);
    expect(document.activeElement).toBe(pairInput);
    expect(getBoxNodeInActiveTab('#boxStatsPostHoc')).toBe(pairwiseProcedureAfterCompute);
    expect(pairwiseProcedureAfterCompute.selectedOptions?.[0]?.textContent).toBe('Manual pairs');
    const correction = getBoxNodeInActiveTab('#boxStatsCorrection');
    expect(correction).toBeTruthy();
    expect(correction.closest('.box-stats-options__row')?.hidden).toBe(false);
    expect(getBoxNodeInActiveTab('#statsCorrectionNote')?.textContent || '').toMatch(/2 tests/);

    const calculateButton = getBoxStatsButton();
    expect(calculateButton?.textContent).toBe('Calculate statistics');
    pairInput.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(getBoxStatsButton()).toBe(calculateButton);
    calculateButton.click();

    await settleBoxOwner();
    expect((await waitForStatsButtonText('Calculate statistics'))?.textContent).toBe('Calculate statistics');
    expect(boxComponent.__getState().statsLastRunVersion).toBeGreaterThan(0);
    expect(boxComponent.__getState().statsLastRunVersion).toBe(boxComponent.__getState().statsContextVersion);
  });

  test('analysis-family changes do not queue a control-rebuilding draw ahead of statistics calculation', async () => {
    await activateWorkspace('box');
    const boxComponent = window.Components?.box;
    expect(boxComponent).toBeTruthy();

    await loadSeedPayloadForActiveTab(boxComponent, 'test-stats-family-immediate-compute');
    await settleBoxOwner();
    expect(await waitForBoxSvg()).toBeTruthy();

    setStatsTestValue('parametric');
    const calculateButton = getBoxStatsButton();
    expect(calculateButton).toBeTruthy();
    expect(calculateButton.disabled).toBe(false);
    calculateButton.click();

    await settleBoxOwner();
    expect(getBoxStatsButton()).toBe(calculateButton);
    expect((await waitForStatsButtonText('Calculate statistics'))?.textContent).toBe('Calculate statistics');
    expect(boxComponent.__getState().statsLastRunVersion).toBeGreaterThan(0);
    expect(boxComponent.__getState().statsLastRunVersion).toBe(boxComponent.__getState().statsContextVersion);
  });

  test('box stats calculation remains clickable after switching between box tabs', async () => {
    await activateWorkspace('box');

    const boxComponent = window.Components?.box;
    const main = window.Main;
    expect(boxComponent).toBeTruthy();
    expect(main?.tabs).toBeTruthy();

    await loadSeedPayloadForActiveTab(boxComponent, 'test-stats-click-a');
    await settleBoxOwner();
    const tabA = main.session.getActiveTab();

    main.tabs.handleAddTabClick();
    await settleBoxOwner();
    await activateWorkspace('box');

    const duplicatePrompt = document.getElementById('duplicatePrompt');
    if(duplicatePrompt && !duplicatePrompt.hasAttribute('hidden')){
      const emptyButton = document.getElementById('duplicateEmpty');
      expect(emptyButton).toBeTruthy();
      emptyButton.click();
      await settleBoxOwner();
    }

    await loadSeedPayloadForActiveTab(boxComponent, 'test-stats-click-b');
    await settleBoxOwner();
    const tabB = main.session.getActiveTab();
    expect(tabB?.id).not.toBe(tabA?.id);

    const state = boxComponent.__getState();
    state.statsComputationPending = true;
    state.statsComputationOwnerTabId = tabB.id;

    await activateTabById(tabA.id, 'test-switch-to-a-with-stale-pending');
    expect(boxComponent.__getState().statsComputationPending).toBe(false);

    const statsButtonA = getBoxStatsButton();
    expect(statsButtonA).toBeTruthy();
    expect(statsButtonA.disabled).toBe(false);
    statsButtonA.click();
    await settleBoxOwner();
    expect(statsButtonA.textContent).toBe('Calculate statistics');
    expect(boxComponent.__getState().statsComputationPending).toBe(false);

    await activateTabById(tabB.id, 'test-switch-to-b-after-a-compute');
    const statsButtonB = getBoxStatsButton();
    expect(statsButtonB).toBeTruthy();
    expect(statsButtonB.disabled).toBe(false);
    statsButtonB.click();
    await settleBoxOwner();
    expect(statsButtonB.textContent).toBe('Calculate statistics');
    expect(boxComponent.__getState().statsComputationPending).toBe(false);
  });

  test('box tab switch with computed stats does not repaint stats tables repeatedly', async () => {
    await activateWorkspace('box');

    const boxComponent = window.Components?.box;
    const main = window.Main;
    expect(boxComponent).toBeTruthy();
    expect(main?.tabs).toBeTruthy();

    await loadSeedPayloadForActiveTab(boxComponent, 'test-stats-surface-a');
    const tabA = main.session.getActiveTab();
    expect(tabA?.type).toBe('box');

    const statsButton = getBoxStatsButton();
    expect(statsButton).toBeTruthy();
    await computeBoxStatsForActiveTab(boxComponent);

    main.tabs.handleAddTabClick();
    await settleBoxOwner();
    await activateWorkspace('box');

    const duplicatePrompt = document.getElementById('duplicatePrompt');
    if(duplicatePrompt && !duplicatePrompt.hasAttribute('hidden')){
      const reuseButton = document.getElementById('duplicateReuse');
      expect(reuseButton).toBeTruthy();
      reuseButton.click();
      await settleBoxOwner();
    }

    const tabB = main.session.getActiveTab();
    expect(tabB?.type).toBe('box');
    expect(tabB?.id).not.toBe(tabA.id);

    const renderSpy = jest.spyOn(window.Shared.statsTable, 'render');
    try{
      await activateTabById(tabA.id, 'test-stats-surface-fast-switch-a');
      await settleBoxOwner();
    }finally{
      renderSpy.mockRestore();
    }

    expect(main.session.getActiveTab()?.id).toBe(tabA.id);
    expect(renderSpy.mock.calls.length).toBeLessThanOrEqual(1);
    expect(document.querySelector('#statsResults .stats-table-card, #statsTable .stats-table-card')).toBeTruthy();
    expect(getBoxStatsButton()?.textContent).toBe('Calculate statistics');
  });

  test('delayed dark theme repaint cannot cross-contaminate another box tab cache', async () => {
    await activateWorkspace('box');

    const boxComponent = window.Components?.box;
    const main = window.Main;
    const schemes = window.Shared?.colorSchemes;
    expect(boxComponent).toBeTruthy();
    expect(main?.tabs).toBeTruthy();
    expect(schemes?.applyToActiveTab).toBeTruthy();

    const payloadA = createSeedPayload(boxComponent);
    payloadA.config = payloadA.config || {};
    payloadA.config.colorScheme = 'scientific';
    boxComponent.loadFromPayload(payloadA, { source: 'test-theme-a' });
    await settleBoxOwner();
    const tabA = main.session.getActiveTab();
    main.session.persistActiveTabState(tabA, {
      workspaces: main.components.registry,
      previews: main.previews,
      reason: 'test-theme-persist-a'
    });
    const tabAScheme = tabA.payload?.config?.colorScheme || '';
    expect(tabAScheme).toBeTruthy();
    expect(tabAScheme).not.toBe('dark');

    main.tabs.handleAddTabClick();
    await settleBoxOwner();
    await activateWorkspace('box');

    const duplicatePrompt = document.getElementById('duplicatePrompt');
    if(duplicatePrompt && !duplicatePrompt.hasAttribute('hidden')){
      const emptyButton = document.getElementById('duplicateEmpty');
      expect(emptyButton).toBeTruthy();
      emptyButton.click();
      await settleBoxOwner();
    }

    const payloadB = createSeedPayload(boxComponent);
    payloadB.config = payloadB.config || {};
    payloadB.config.colorScheme = 'scientific';
    boxComponent.loadFromPayload(payloadB, { source: 'test-theme-b' });
    await settleBoxOwner();
    const tabB = main.session.getActiveTab();
    expect(tabB?.id).not.toBe(tabA.id);

    expect(schemes.applyToActiveTab('box', 'dark')).toBe(true);
    await settleBoxOwner();
    expect(tabB.payload?.config?.colorScheme).toBe('dark');

    await activateTabById(tabA.id, 'test-theme-switch-back-before-delayed-dark');
    await advanceAsyncTime(230);
    await settleBoxOwner();

    const active = main.session.getActiveTab();
    expect(active?.id).toBe(tabA.id);
    expect(active.payload?.config?.colorScheme).toBe(tabAScheme);
    expect(schemes.getSelectedSchemeId('box')).toBe(tabAScheme);

    const svgBoxBg = document.querySelector('#boxGraphPanel .svgbox')?.style?.backgroundColor || '';
    const plotBg = document.getElementById('boxPlot')?.style?.backgroundColor || '';
    const svgScheme = document.querySelector('#boxPlot svg')?.getAttribute('data-color-scheme') || '';
    expect(svgBoxBg).not.toMatch(/rgb\(0,\s*0,\s*0\)|#000|black/i);
    expect(plotBg).not.toMatch(/rgb\(0,\s*0,\s*0\)|#000|black/i);
    expect(svgScheme).not.toBe('dark');
  });

  test('box-to-box switch restores only complete owner cache without stale tab tokens or redraw churn', async () => {
    await activateWorkspace('box');

    const boxComponent = window.Components?.box;
    const main = window.Main;
    expect(boxComponent).toBeTruthy();
    expect(main?.tabs).toBeTruthy();

    await loadSeedPayloadForActiveTab(boxComponent, 'test-cache-owner-a');
    await settleBoxOwner();
    expect(await waitForBoxSvg()).toBeTruthy();
    const tabA = main.session.getActiveTab();
    expect(tabA?.type).toBe('box');

    main.tabs.handleAddTabClick();
    await settleBoxOwner();
    await activateWorkspace('box');

    const duplicatePrompt = document.getElementById('duplicatePrompt');
    if(duplicatePrompt && !duplicatePrompt.hasAttribute('hidden')){
      const emptyButton = document.getElementById('duplicateEmpty');
      expect(emptyButton).toBeTruthy();
      emptyButton.click();
      await settleBoxOwner();
    }

    await loadSeedPayloadForActiveTab(boxComponent, 'test-cache-owner-b');
    await settleBoxOwner();
    const tabB = main.session.getActiveTab();
    expect(tabB?.type).toBe('box');
    expect(tabB?.id).not.toBe(tabA.id);

    await activateTabById(tabA.id, 'test-cache-owner-prime-a');
    expect(await waitForBoxSvg()).toBeTruthy();
    await activateTabById(tabB.id, 'test-cache-owner-capture-a');
    await settleBoxOwner();

    const tabAWithCache = main.session.workspaceState.tabs.find(tab => tab.id === tabA.id);
    const cacheMeta = tabAWithCache?.renderCache?.cache?.__graphitixRenderCache || null;
    if(cacheMeta){
      const cacheTabId = tabAWithCache?.renderCache?.tabId
        || cacheMeta?.tabId
        || tabAWithCache?.renderCacheTabId;
      expect(cacheTabId).toBe(tabA.id);
      expect(cacheMeta.complete).toBe(true);
    }

    const debugCalls = [];
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation((...args) => {
      debugCalls.push(args);
    });
    const originalDraw = boxComponent.draw;
    let drawCalls = 0;
    boxComponent.draw = function countedBoxDraw(...args){
      drawCalls += 1;
      return originalDraw.apply(this, args);
    };
    const resizeCalls = [];
    const originalApplyResizableBoxSize = window.Shared?.applyResizableBoxSize;
    let resizeSpy = null;
    if(typeof originalApplyResizableBoxSize === 'function'){
      resizeSpy = jest.spyOn(window.Shared, 'applyResizableBoxSize').mockImplementation(function countedResize(node, options){
        resizeCalls.push(options || {});
        return originalApplyResizableBoxSize.call(this, node, options);
      });
    }

    try{
      await activateTabById(tabA.id, 'test-cache-owner-switch-a');
      await settleBoxOwner();
    }finally{
      boxComponent.draw = originalDraw;
      if(resizeSpy){
        resizeSpy.mockRestore();
      }
      debugSpy.mockRestore();
    }

    expect(main.session.getActiveTab()?.id).toBe(tabA.id);
    expect(
      debugCalls.some(args => args[0] === 'Debug: box render cache restored' && args[1]?.restored === true)
      || drawCalls <= 1
    ).toBe(true);
    expect(debugCalls.some(args => debugArgsContain(args, 'incomplete-live-runtime'))).toBe(false);
    expect(debugCalls.some(args => debugArgsContain(args, 'cache-validation-failed'))).toBe(false);
    expect(debugCalls.some(args => debugArgsContain(args, 'incomplete-cache'))).toBe(false);
    expect(drawCalls).toBeLessThanOrEqual(1);
    const fullDrawPasses = debugCalls.filter(args => args[0] === 'Debug: box axis settings current').length;
    expect(fullDrawPasses).toBeLessThanOrEqual(2);
    expect(resizeCalls.some(options => options?.reason === 'orientation-missing')).toBe(false);

    const plot = document.getElementById('boxPlot');
    expect(plot?.dataset?.boxRenderedTabId).toBe(tabA.id);
    const wrongFontNodes = Array.from(document.querySelectorAll('#boxPlot [data-font-tab-id]'))
      .filter(node => node.dataset.fontTabId && node.dataset.fontTabId !== tabA.id);
    expect(wrongFontNodes).toHaveLength(0);
  });

  test('violin extent remains owner-scoped and round-trips through payload hydration', async () => {
    await activateWorkspace('box');

    const boxComponent = window.Components?.box;
    const main = window.Main;
    expect(boxComponent?.createEmptyPayload).toBeInstanceOf(Function);
    expect(boxComponent.createEmptyPayload().config.violin.extentMode).toBe('extended');

    await loadSeedPayloadForActiveTab(boxComponent, 'test-violin-extent-a');
    const tabA = main.session.getActiveTab();
    const graphTypeA = getBoxNodeInActiveTab('#boxGraphType');
    const extentA = getBoxNodeInActiveTab('#boxViolinExtent');
    const extentControlA = getBoxNodeInActiveTab('#boxViolinExtentCtl');
    graphTypeA.value = 'violin';
    graphTypeA.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(extentControlA.style.display).toBe('');
    extentA.value = 'trimmed';
    extentA.dispatchEvent(new window.Event('change', { bubbles: true }));
    await settleBoxOwner();
    expect(boxComponent.__getState().violin.extentMode).toBe('trimmed');

    const payloadA = boxComponent.getPayload();
    expect(payloadA.config.violin.extentMode).toBe('trimmed');

    main.tabs.handleAddTabClick();
    await settleBoxOwner();
    await activateWorkspace('box');
    const duplicatePrompt = document.getElementById('duplicatePrompt');
    if(duplicatePrompt && !duplicatePrompt.hasAttribute('hidden')){
      document.getElementById('duplicateEmpty')?.click();
      await settleBoxOwner();
    }
    await loadSeedPayloadForActiveTab(boxComponent, 'test-violin-extent-b');
    const tabB = main.session.getActiveTab();
    expect(tabB.id).not.toBe(tabA.id);
    expect(getBoxNodeInActiveTab('#boxViolinExtent').value).toBe('extended');

    const legacyPayload = createSeedPayload(boxComponent);
    delete legacyPayload.config.violin.extentMode;
    await boxComponent.loadFromPayload(legacyPayload, {
      source: 'test-violin-extent-legacy',
      tabId: tabB.id,
      tab: tabB
    });
    expect(getBoxNodeInActiveTab('#boxViolinExtent').value).toBe('extended');

    await activateTabById(tabA.id, 'test-violin-extent-return-a');
    expect(getBoxNodeInActiveTab('#boxViolinExtent').value).toBe('trimmed');
    expect(boxComponent.__getState().violin.extentMode).toBe('trimmed');

    await activateTabById(tabB.id, 'test-violin-extent-hydrate-b');
    await boxComponent.loadFromPayload(payloadA, {
      source: 'test-violin-extent-reopen',
      tabId: tabB.id,
      tab: tabB
    });
    expect(getBoxNodeInActiveTab('#boxViolinExtent').value).toBe('trimmed');
    expect(boxComponent.__getState().violin.extentMode).toBe('trimmed');
  });
});
