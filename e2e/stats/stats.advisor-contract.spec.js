const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome, waitForDocumentOpenComplete } = require('../helpers/workspaceDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { buildWorkspaceArchive, openWorkspaceArchiveBuffer } = require('../helpers/archiveDriver');
const errorsByPage=new WeakMap();
test.beforeEach(({page})=>{
  const errors=[];
  errorsByPage.set(page,errors);
  page.on('pageerror',error=>errors.push(error.message));
});
test.afterEach(async({page},info)=>{
  expect(errorsByPage.get(page)).toEqual([]);
  if(info.status===info.expectedStatus && info.title.includes('second pass')){
    const advisor=page.locator('.stats-advisor:visible').first();
    await advisor.locator('.stats-advisor__header').evaluate(node=>node.scrollIntoView({block:'center',inline:'nearest'}));
    await page.screenshot({path:info.outputPath('advisor-summary.png')});
    const actions=advisor.locator('.stats-advisor__actions');
    if(await actions.count()){
      await actions.evaluate(node=>node.scrollIntoView({block:'center',inline:'nearest'}));
      await page.screenshot({path:info.outputPath('advisor-actions.png')});
    }
  }
});

async function open(page, type, example = true) {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type, pageId: `${type}Page` }, { first: true, loadExample: example });
  await waitForComponentOwnerReady(page, type, { requireIdle: true });
  return page.locator(`#${type}Page:not([hidden]) .stats-advisor`).first();
}

for (const type of ['box', 'scatter', 'line', 'pie', 'roc', 'survival']) {
  test(`${type} canonical capture and keyboard focus`, async ({ page }, info) => {
    test.setTimeout(100_000);
    const advisor = await open(page, type);
    await advisor.locator('.stats-advisor__toggle').click();
    const capture = await page.evaluate(type => {
      const component = window.Components[type];
      const id = window.Main.session.workspaceState.activeTabId;
      const owner = type === 'line' ? component.__testHooks.getActiveSession() : component.__testHooks.getSession(id);
      const read = () => type === 'box' ? owner.state.stats.statsAdvisor : type === 'line' ? owner.state.advisorState : owner.advisor;
      const live = read();
      const liveAnswers = live.answers;
      const before = JSON.stringify(live.answers);
      component.captureRuntimeState({ tabId: id });
      component.getPayload({ tabId: id });
      return { stableReference: read() === live, stableAnswers: read().answers === liveAnswers, sameValues: before === JSON.stringify(read().answers) };
    }, type);
    const choice = advisor.locator('input[type=radio]:not(:checked)').first();
    const value = await choice.getAttribute('value');
    const name = await choice.getAttribute('name');
    const selected = advisor.locator(`input[name="${name}"][value="${value}"]`);
    await selected.check();
    const evidence = { type, capture, focusRetained: await selected.evaluate(node => node === document.activeElement), applyEnabled: await advisor.getByRole('button', { name: 'Apply recommendation' }).isEnabled(), summary: await advisor.locator('.stats-advisor__summary').innerText() };
    await info.attach('observations', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
    await expect(selected).toBeChecked();
    expect(capture.stableReference, `${type}: capture replaces canonical advisor`).toBe(true);
    expect(capture.stableAnswers, `${type}: capture replaces canonical answers`).toBe(true);
    expect(evidence.focusRetained, `${type}: answering loses keyboard focus`).toBe(true);
  });
}

test('ROC does not offer DeLong after switching to precision recall', async ({ page }, info) => {
  test.setTimeout(100_000);
  const advisor = await open(page, 'roc');
  await advisor.locator('.stats-advisor__toggle').click();
  await advisor.locator('input[value=delong]').check();
  await page.locator('#rocGraphType').selectOption('pr');
  await waitForComponentOwnerReady(page, 'roc', { requireIdle: true });
  await expect(page.locator('#rocGraphType')).toHaveValue('pr');
  const summary = await advisor.locator('.stats-advisor__summary').innerText();
  const enabled = await advisor.getByRole('button', { name: 'Apply recommendation' }).isEnabled();
  await info.attach('observations', { body: JSON.stringify({ summary, enabled }), contentType: 'application/json' });
  await advisor.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('pr-advisor.png') });
  expect(summary).not.toContain('Use DeLong');
  expect(enabled).toBe(false);
  await advisor.locator('input[value=bootstrap]').check();
  await expect(advisor.getByRole('button', { name: 'Apply recommendation' })).toBeEnabled();
  await advisor.getByRole('button', { name: 'Apply recommendation' }).click();
  await expect(page.locator('#rocDiffMethod')).toHaveValue('bootstrap');
});

test('Pie does not present asymptotic G as a sparse-count remedy', async ({ page }, info) => {
  test.setTimeout(100_000);
  const advisor = await open(page, 'pie');
  await advisor.locator('.stats-advisor__toggle').click();
  await advisor.locator('input[data-advisor-question=pie-advisor-objective][value=compare]').check();
  await advisor.locator('input[data-advisor-question=pie-advisor-sparse][value=yes]').check();
  const summary = await advisor.locator('.stats-advisor__summary').innerText();
  await info.attach('observations', { body: summary, contentType: 'text/plain' });
  await advisor.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('sparse-advisor.png') });
  expect(summary).not.toContain('Sparse expected counts suggest using the likelihood-ratio G-test');
  expect(summary).not.toContain('Sparse categories are better handled by the likelihood-ratio G-test');
  await expect(advisor.getByRole('button', { name: 'Apply recommendation' })).toBeDisabled();
  await expect(advisor.locator('.stats-advisor__summary')).toContainText('asymptotic');
});

for (const type of ['scatter', 'line', 'roc', 'survival']) {
  test(`${type} no-data advisor does not offer an applicable analysis`, async ({ page }, info) => {
    test.setTimeout(100_000);
    const advisor = await open(page, type, false);
    await advisor.locator('.stats-advisor__toggle').click();
    const enabled = await advisor.getByRole('button', { name: 'Apply recommendation' }).isEnabled();
    const summary = await advisor.locator('.stats-advisor__summary').innerText();
    await info.attach('observations', { body: JSON.stringify({ enabled, summary }), contentType: 'application/json' });
    expect(enabled, `${type}: empty data cannot support the suggested analysis`).toBe(false);
  });
}

test('Box group-count answer agrees with selected groups', async ({ page }, info) => {
  test.setTimeout(100_000);
  const advisor = await open(page, 'box');
  await advisor.locator('.stats-advisor__toggle').click();
  await advisor.locator('input[data-advisor-question=advisor-groups][value=two]').check();
  await advisor.locator('input[data-advisor-question=advisor-distribution][value=normal]').check();
  const summary = await advisor.locator('.stats-advisor__summary').innerText();
  const hint = await advisor.locator('.stats-advisor__hint').allTextContents();
  await info.attach('observations', { body: JSON.stringify({ summary, hint }), contentType: 'application/json' });
  await advisor.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('group-count-mismatch.png') });
  expect(summary.includes('the two selected groups') && hint.some(text => /Detected 6/.test(text))).toBe(false);
  await expect(advisor.getByRole('button', { name: 'Apply recommendation' })).toBeDisabled();
});

test('Line minimal detail does not promise a diagnostics toggle that does not exist', async ({ page }, info) => {
  test.setTimeout(100_000);
  const advisor = await open(page, 'line');
  await advisor.locator('.stats-advisor__toggle').click();
  await advisor.locator('input[data-advisor-question=line-advisor-detailLevel][value=minimal]').check();
  await advisor.getByRole('button', { name: 'Apply recommendation' }).click();
  const state = await page.evaluate(() => {
    const owner = window.Components.line.__testHooks.getActiveSession();
    return { applied: owner.state.advisorState.lastApplied, controls: owner.state.controls };
  });
  await info.attach('observations', { body: JSON.stringify(state, null, 2), contentType: 'application/json' });
  // The current Line renderer always includes residual diagnostics; there is
  // no user-facing diagnostics setting to implement this advertised choice.
  expect(state.applied.showDiagnostics).toBe(true);
  expect(state.controls.showTrendLine).toBe(true);
});

test('ROC retired advisor controls cannot write into a sibling tab', async ({ page }, info) => {
  test.setTimeout(120_000);
  const advisor = await open(page, 'roc');
  await advisor.locator('.stats-advisor__toggle').click();
  await advisor.locator('input[value=delong]').check();
  const retiredApply = await advisor.getByRole('button', { name: 'Apply recommendation' }).elementHandle();
  // An answer change retires the rendered controls before another owner mounts.
  await advisor.locator('input[value=bootstrap]').check();
  expect(await retiredApply.evaluate(node => node.isConnected)).toBe(false);
  await openComponentFromWelcome(page, { type: 'roc', pageId: 'rocPage' }, { loadExample: true });
  await waitForComponentOwnerReady(page, 'roc', { requireIdle: true });
  const snapshot = () => page.evaluate(() => {
    const id = window.Main.session.workspaceState.activeTabId;
    const owner = window.Components.roc.__testHooks.getSession(id);
    return { id, diffMethod: owner.results.diffMethod, stateMethod: owner.state.diffMethod, answers: owner.advisor.answers };
  });
  const before = await snapshot();
  await retiredApply.evaluate(node => node.click());
  const after = await snapshot();
  await info.attach('observations', { body: JSON.stringify({ before, after }, null, 2), contentType: 'application/json' });
  expect(after).toEqual(before);
});

test('Survival cannot promise baseline adjustment without baseline covariates', async ({ page }, info) => {
  test.setTimeout(100_000);
  const advisor = await open(page, 'survival');
  await advisor.locator('.stats-advisor__toggle').click();
  await advisor.locator('input[data-advisor-question=survival-advisor-analysisFocus][value=adjust]').check();
  await advisor.locator('input[data-advisor-question=survival-advisor-covariateStrategy][value=baseline]').check();
  const summary = await advisor.locator('.stats-advisor__summary').innerText();
  const enabled = await advisor.getByRole('button', { name: 'Apply recommendation' }).isEnabled();
  await info.attach('observations', { body: JSON.stringify({ summary, enabled }), contentType: 'application/json' });
  expect(summary.includes('with baseline covariates') && enabled).toBe(false);
  expect(enabled).toBe(false);
});

const presets={
  box:[['groups','threePlus'],['distribution','normal'],['equalVariance','no']],
  scatter:[['analysisGoal','modelOnly'],['regressionModel','linear'],['lineDetail','intervals']],
  line:[['measurement','continuousNonNormal'],['detailLevel','minimal']],
  pie:[['objective','compare'],['scope','all'],['sparse','no']],
  roc:[['methodChoice','bootstrap']],
  survival:[['analysisFocus','describe']]
};
async function configure(advisor,type){
  const prefix=type==='box'?'advisor':`${type}-advisor`;
  for(const [key,value] of presets[type]){
    await advisor.locator(`input[data-advisor-question="${prefix}-${key}"][value="${value}"]`).check();
  }
}
async function appliedSettings(page,type){
  return page.evaluate(type=>{
    const id=window.Main.session.workspaceState.activeTabId;
    const component=window.Components[type];
    const owner=type==='line'?component.__testHooks.getActiveSession():component.__testHooks.getSession(id);
    const pick=(value,keys)=>Object.fromEntries(keys.map(key=>[key,value[key]]));
    if(type==='box'){ return pick(owner.state.stats,['statsTest','statsPaired','statsOmnibusParametricVariant','statsPostHoc']); }
    if(type==='scatter'){ return owner.state.analysisSettings; }
    if(type==='line'){ return pick(owner.state.controls,['statType','regressionMode','showTrendLine','showIntervals','showPredictionIntervals']); }
    if(type==='pie'){ return pick(component.getPayload().config.stats,['scope','test','correction']); }
    if(type==='roc'){ return {diffMethod:owner.results.diffMethod,stateMethod:owner.state.diffMethod}; }
    return pick(owner.state.controls,['showHazardRatios','fitCoxModel']);
  },type);
}

for(const type of Object.keys(presets)){
  test(`${type} applies the proposed settings and preserves them through file reopen`,async({page},info)=>{
    test.setTimeout(180_000);
    await page.setViewportSize({width:1500,height:1100});
    const advisor=await open(page,type);
    const original=await appliedSettings(page,type);
    await advisor.locator('.stats-advisor__toggle').click();
    await configure(advisor,type);
    expect(await appliedSettings(page,type)).toEqual(original);
    const apply=advisor.getByRole('button',{name:'Apply recommendation'});
    await expect(apply).toBeEnabled();
    await apply.evaluate(node=>node.scrollIntoView({block:'center',inline:'nearest'}));
    await apply.focus({preventScroll:true});
    await page.screenshot({path:info.outputPath('recommendation-before-apply.png')});
    await apply.click();
    await waitForComponentOwnerReady(page,type,{requireIdle:true});
    const applied=await appliedSettings(page,type);
    const expected={
      box:{statsTest:'parametric',statsPaired:false,statsOmnibusParametricVariant:'welch'},
      scatter:{statType:'none',regressionMode:'linear',showLine:true,showCI:true,showPI:true},
      line:{statType:'spearman',regressionMode:'linear',showTrendLine:true,showIntervals:false},
      pie:{scope:'all',test:'chi-square',correction:'none'},
      roc:{diffMethod:'bootstrap',stateMethod:'bootstrap'},
      survival:{showHazardRatios:false,fitCoxModel:false}
    }[type];
    expect(applied).toMatchObject(expected);
    await advisor.locator('.stats-advisor__toggle').click();
    await expect(advisor.locator('.stats-advisor__summary')).toBeHidden();
    const archive=await buildWorkspaceArchive(page,{scope:'workspace',snapshotKind:'save',policyMode:'manual-save',compression:'STORE',useWorker:false});
    await openWorkspaceArchiveBuffer(page,Buffer.from(archive.base64,'base64'),{componentType:type});
    await waitForDocumentOpenComplete(page);
    await waitForComponentOwnerReady(page,type,{requireIdle:true});
    expect(await appliedSettings(page,type)).toEqual(applied);
    await expect(advisor.locator('.stats-advisor__toggle')).toHaveText('Help me choose');
    await advisor.locator('.stats-advisor__toggle').click();
    await expect(advisor.getByRole('button',{name:'Apply recommendation'})).toBeEnabled();
    expect(await appliedSettings(page,type)).toEqual(applied);
  });
  test(`${type} advisor fits a narrow panel`,async({page},info)=>{
    test.setTimeout(100_000);
    await page.setViewportSize({width:640,height:1100});
    const advisor=await open(page,type);
    await advisor.locator('.stats-advisor__toggle').click();
    await configure(advisor,type);
    const apply=advisor.getByRole('button',{name:'Apply recommendation'});
    await expect(apply).toBeEnabled();
    await apply.evaluate(node=>node.scrollIntoView({block:'center',inline:'nearest'}));
    const fits=await advisor.evaluate(root=>{
      const bounds=root.getBoundingClientRect();
      return bounds.left>=0 && bounds.right<=innerWidth+1 && [...root.querySelectorAll('fieldset,label,button')].every(node=>{
        const box=node.getBoundingClientRect();
        return box.left>=bounds.left-1 && box.right<=bounds.right+1;
      });
    });
    expect(fits).toBe(true);
    await page.screenshot({path:info.outputPath('advisor-narrow.png')});
  });
}

test('Scatter Apply rechecks source edits without using its previously rendered plan',async({page})=>{
  test.setTimeout(100_000);
  const advisor=await open(page,'scatter');
  await advisor.locator('.stats-advisor__toggle').click();
  await configure(advisor,'scatter');
  const before=await appliedSettings(page,'scatter');
  const apply=await advisor.getByRole('button',{name:'Apply recommendation'}).elementHandle();
  await page.evaluate(()=>{
    const owner=window.Components.scatter.__testHooks.getSession(window.Main.session.workspaceState.activeTabId);
    const hot=owner.managers.hot;
    const data=hot.getData().map((row,index)=>index===0?row:row.map(()=>null));
    hot.loadData(data);
  });
  await apply.evaluate(node=>node.click());
  expect(await appliedSettings(page,'scatter')).toEqual(before);
  await expect(advisor.getByRole('button',{name:'Apply recommendation'})).toBeDisabled();
});

for(const type of ['box','line','pie','roc','survival']){
  test(`${type} Apply rejects newly invalid source data`,async({page})=>{
    test.setTimeout(100_000);
    const advisor=await open(page,type);
    await advisor.locator('.stats-advisor__toggle').click();
    await configure(advisor,type);
    const before=await appliedSettings(page,type);
    const apply=await advisor.getByRole('button',{name:'Apply recommendation'}).elementHandle();
    await page.evaluate(type=>{
      const component=window.Components[type];
      const owner=type==='line'?component.__testHooks.getActiveSession():component.__testHooks.getSession(window.Main.session.workspaceState.activeTabId);
      const hot=owner.managers.hot;
      const data=hot.getData();
      if(type==='pie'){
        // A category with no valid counts must not disappear from eligibility.
        data[1]=data[1].map((value,column)=>column===0?value:'invalid');
      }else{
        // Survival uses fixed column headers; its first grid row is an observation.
        for(let index=type==='survival'?0:1;index<data.length;index++){ data[index]=data[index].map(()=>null); }
      }
      hot.loadData(data);
    },type);
    await apply.evaluate(node=>node.click());
    expect(await appliedSettings(page,type)).toEqual(before);
    await expect(advisor.getByRole('button',{name:'Apply recommendation'})).toBeDisabled();
  });
}

for(const type of ['line','scatter']){
  test(`${type} second pass rejects constant X before promising a fit`,async({page})=>{
    test.setTimeout(100_000);
    const advisor=await open(page,type);
    await page.evaluate(type=>{
      const component=window.Components[type];
      const owner=type==='line'?component.__testHooks.getActiveSession():component.__testHooks.getSession(window.Main.session.workspaceState.activeTabId);
      const hot=owner.managers.hot;
      const data=hot.getData();
      for(const row of data.slice(1)){ row[type==='line'?0:1]=1; }
      hot.loadData(data);
    },type);
    await advisor.locator('.stats-advisor__toggle').click();
    await configure(advisor,type);
    await expect(advisor.getByRole('button',{name:'Apply recommendation'})).toBeDisabled();
  });
}

test('Scatter second pass association-only ignores unused power-fit restrictions',async({page})=>{
  test.setTimeout(100_000);
  const advisor=await open(page,'scatter');
  await page.evaluate(()=>{
    const owner=window.Components.scatter.__testHooks.getSession(window.Main.session.workspaceState.activeTabId);
    const data=owner.managers.hot.getData();
    data[1][1]=-1;
    owner.managers.hot.loadData(data);
  });
  await advisor.locator('.stats-advisor__toggle').click();
  await advisor.locator('details.stats-advisor__model-options > summary').click();
  await advisor.locator('input[data-advisor-question=scatter-advisor-regressionModel][value=power]').check();
  await advisor.locator('input[data-advisor-question=scatter-advisor-analysisGoal][value=associationOnly]').check();
  await expect(advisor.getByRole('button',{name:'Apply recommendation'})).toBeEnabled();
});

test('Line second pass forecasting respects the engine minimum sample',async({page})=>{
  test.setTimeout(100_000);
  const advisor=await open(page,'line');
  await page.evaluate(()=>{
    const owner=window.Components.line.__testHooks.getActiveSession();
    owner.managers.hot.loadData(owner.managers.hot.getData().slice(0,4));
  });
  await advisor.locator('.stats-advisor__toggle').click();
  await advisor.locator('input[data-advisor-question=line-advisor-analysisGoal][value=forecast]').check();
  await advisor.locator('input[data-advisor-question=line-advisor-seasonality][value=nonSeasonal]').check();
  await expect(advisor.getByRole('button',{name:'Apply recommendation'})).toBeDisabled();
});

for(const enabled of [true,false]){
  test(`Survival second pass group-only plan validates enabled covariates (${enabled})`,async({page})=>{
    test.setTimeout(100_000);
    const advisor=await open(page,'survival');
    await page.evaluate(enabled=>{
      const component=window.Components.survival;
      const payload=component.getPayload();
      payload.data=payload.data.filter(row=>row[0]).map((row,index)=>[row[0],row[1],row[2],row[3],index+1]);
      if(!enabled){payload.data=payload.data.filter(row=>row[0]===payload.data[0][0]);}
      payload.config.covariateSettings={'4':{enabled,type:'baseline'}};
      component.loadFromPayload(payload,{source:'advisor-second-pass'});
    },enabled);
    await waitForComponentOwnerReady(page,'survival',{requireIdle:true});
    await expect(page.locator('#survivalCovariateToggle-4')).toBeChecked({checked:enabled});
    await advisor.locator('.stats-advisor__toggle').click();
    await advisor.locator('input[data-advisor-question=survival-advisor-analysisFocus][value=adjust]').check();
    await advisor.locator('input[data-advisor-question=survival-advisor-covariateStrategy][value=none]').check();
    await expect(advisor.getByRole('button',{name:'Apply recommendation'})).toBeDisabled();
  });
}

test('Pie second pass checks sparse expectations in each requested pair',async({page})=>{
  test.setTimeout(100_000);
  const advisor=await open(page,'pie');
  await page.evaluate(()=>{
    const component=window.Components.pie;
    const payload=component.getPayload();
    payload.data=[['Category','A','B','C'],['First',1,1,100],['Second',10,10,90]];
    payload.config.stats={...payload.config.stats,selectedColumns:[1,2,3],scope:'all',advisor:{open:false,answers:{objective:'compare',scope:'all',sparse:'no'}}};
    component.loadFromPayload(payload,{source:'advisor-second-pass-pairwise'});
  });
  await waitForComponentOwnerReady(page,'pie',{requireIdle:true});
  await advisor.locator('.stats-advisor__toggle').click();
  await expect(advisor.locator('.stats-advisor__hint').first()).toContainText('Detected 3');
  expect(await page.evaluate(()=>window.Components.pie.__testHooks.computeContingencyTest([[1,1,100],[10,10,90]],{}).minExpected)).toBeGreaterThanOrEqual(5);
  await expect(advisor.getByRole('button',{name:'Apply recommendation'})).toBeDisabled();
});

test('Survival second pass retains an unsupported saved time-dependent answer',async({page})=>{
  test.setTimeout(100_000);
  const advisor=await open(page,'survival');
  await page.evaluate(()=>{
    const component=window.Components.survival;
    const payload=component.getPayload();
    payload.config.advisor={open:true,answers:{analysisFocus:'adjust',covariateStrategy:'timeDependent'}};
    component.loadFromPayload(payload,{source:'advisor-second-pass-saved-answer'});
  });
  await waitForComponentOwnerReady(page,'survival',{requireIdle:true});
  const answers=await page.evaluate(()=>window.Components.survival.__testHooks.getSession(window.Main.session.workspaceState.activeTabId).advisor.answers);
  expect(answers.covariateStrategy).toBe('timeDependent');
  await expect(advisor.getByRole('button',{name:'Apply recommendation'})).toBeDisabled();
});

test('Box second pass requires aligned rows for a paired recommendation',async({page})=>{
  test.setTimeout(100_000);
  const advisor=await open(page,'box');
  await page.evaluate(()=>{
    const owner=window.Components.box.__testHooks.getSession(window.Main.session.workspaceState.activeTabId);
    const header=owner.managers.hot.getData()[0];
    owner.managers.hot.loadData([header,[1,null],[2,null],[null,3],[null,4]]);
  });
  const conditions=page.locator('#boxPage .stats-conditions-checkboxes input[type=checkbox]');
  for(let index=await conditions.count()-1;index>=2;index--){await conditions.nth(index).uncheck();}
  await advisor.locator('.stats-advisor__toggle').click();
  await advisor.locator('input[data-advisor-question=advisor-groups][value=two]').check();
  await advisor.locator('input[data-advisor-question=advisor-paired][value=paired]').check();
  await advisor.locator('input[data-advisor-question=advisor-distribution][value=normal]').check();
  await expect(advisor.getByRole('button',{name:'Apply recommendation'})).toBeDisabled();
  await page.evaluate(()=>{
    const owner=window.Components.box.__testHooks.getSession(window.Main.session.workspaceState.activeTabId);
    const header=owner.managers.hot.getData()[0];
    owner.managers.hot.loadData([header,[1,3],[2,4]]);
  });
  await advisor.locator('.stats-advisor__toggle').click();
  await advisor.locator('.stats-advisor__toggle').click();
  await expect(advisor.getByRole('button',{name:'Apply recommendation'})).toBeEnabled();

});

test('Box second pass disclosure preserves the condition list',async({page})=>{
  test.setTimeout(100_000);
  const advisor=await open(page,'box');
  const labels=page.locator('#boxPage .stats-conditions-item label');
  const original=await labels.allTextContents();
  expect(original.every(label=>label.trim())).toBe(true);
  await advisor.locator('.stats-advisor__toggle').click();
  await advisor.locator('.stats-advisor__toggle').click();
  expect(await labels.allTextContents()).toEqual(original);
});
