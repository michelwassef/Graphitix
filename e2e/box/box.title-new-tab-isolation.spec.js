const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { registerIssueCollectors } = require('../helpers/diagnostics');

async function getActiveTabId(page) {
  return page.evaluate(() => String(window.Main?.session?.workspaceState?.activeTabId || ''));
}

async function activateTab(page, tabId) {
  await page.evaluate(id => {
    window.Main?.tabs?.activateTab?.(id, { reason: 'e2e-box-title-isolation' });
  }, tabId);
  await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, tabId, { timeout: 20_000 });
  await page.waitForSelector('#boxPage:not([hidden])', { timeout: 20_000 });
}

async function readBoxTitleState(page) {
  return page.evaluate(() => {
    const state = window.Components?.box?.__getState?.() || {};
    const payload = window.Components?.box?.getPayload?.() || null;
    const svgTitle = document.querySelector('#boxPage:not([hidden]) #boxPlot svg text[data-font-role="graphTitle"]');
    return {
      stateTitle: String(state.titleText || ''),
      payloadTitle: String(payload?.config?.title || ''),
      svgTitle: String(svgTitle?.textContent || ''),
      graphType: String(document.querySelector('#boxPage:not([hidden]) #boxGraphType')?.value || ''),
      flipAxes: state.flipAxes === true,
      payloadFlipAxes: payload?.config?.flipAxes === true,
      controlFlipAxes: document.querySelector('#boxPage:not([hidden]) #boxFlipAxes')?.checked === true
    };
  });
}

async function editVisibleBoxTitle(page, title) {
  await page.waitForSelector('#boxPage:not([hidden]) #boxPlot svg text[data-font-role="graphTitle"]', { timeout: 45_000 });
  await page.evaluate(() => {
    const target = document.querySelector('#boxPage:not([hidden]) #boxPlot svg text[data-font-role="graphTitle"]');
    target?.dispatchEvent(new MouseEvent('dblclick', {
      bubbles: true,
      cancelable: true,
      detail: 2,
      view: window
    }));
  });
  const input = page.locator('.inline-edit-overlay .inline-edit-input').first();
  await expect(input).toBeVisible({ timeout: 20_000 });
  await input.fill(title);
  await page.mouse.click(3, 3);
  await expect(input).toBeHidden();
  await page.waitForFunction(expected => {
    const state = window.Components?.box?.__getState?.() || {};
    return String(state.titleText || '') === expected;
  }, title, { timeout: 20_000 });
}

test('box custom graph title does not become the default for new Box tabs', async ({ page }) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();

  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true, loadExample: true });
  await page.waitForSelector('#boxPage:not([hidden]) #boxPlot svg', { timeout: 45_000 });
  const firstTabId = await getActiveTabId(page);
  expect(firstTabId).toBeTruthy();

  const customTitle = 'Box Alpha Custom Title';
  await editVisibleBoxTitle(page, customTitle);
  await page.locator('#boxPage:not([hidden]) #boxFlipAxes').check();
  await expect.poll(() => readBoxTitleState(page)).toMatchObject({
    flipAxes: true,
    payloadFlipAxes: true,
    controlFlipAxes: true
  });
  const firstAfterEdit = await readBoxTitleState(page);
  expect(firstAfterEdit.stateTitle).toBe(customTitle);
  expect(firstAfterEdit.payloadTitle).toBe(customTitle);

  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: false });
  const secondTabId = await getActiveTabId(page);
  expect(secondTabId).toBeTruthy();
  expect(secondTabId).not.toBe(firstTabId);

  const secondTitle = await readBoxTitleState(page);
  expect(secondTitle.graphType).toBe('strip');
  expect(secondTitle.flipAxes).toBe(false);
  expect(secondTitle.payloadFlipAxes).toBe(false);
  expect(secondTitle.controlFlipAxes).toBe(false);
  expect(secondTitle.stateTitle).toBe('Individual values');
  expect(secondTitle.payloadTitle).toBe('Individual values');
  expect(secondTitle.stateTitle).not.toBe(customTitle);

  await page.locator('#boxLoadExample').click();
  await page.waitForSelector('#boxPage:not([hidden]) #boxPlot svg text[data-font-role="graphTitle"]', { timeout: 45_000 });
  const secondCustomTitle = 'Box Beta Custom Title';
  await editVisibleBoxTitle(page, secondCustomTitle);
  await activateTab(page, firstTabId);
  await expect.poll(() => readBoxTitleState(page)).toMatchObject({
    stateTitle: customTitle,
    payloadTitle: customTitle,
    svgTitle: customTitle,
    flipAxes: true,
    payloadFlipAxes: true,
    controlFlipAxes: true
  });

  await page.evaluate(tabId => {
    const jobs = window.Shared.jobs;
    const originalCreateExecutionContext = jobs.createExecutionContext;
    const gate = {
      entered: false,
      release: null,
      promise: null,
      originalCreateExecutionContext
    };
    gate.promise = new Promise(resolve => { gate.release = resolve; });
    jobs.createExecutionContext = function createGatedExecutionContext(options = {}) {
      const context = originalCreateExecutionContext.call(this, options);
      if(String(options.tabId || '') === tabId && context?.checkpoint){
        const checkpoint = context.checkpoint.bind(context);
        context.checkpoint = async (...args) => {
          if(!gate.entered){
            gate.entered = true;
            await gate.promise;
          }
          return checkpoint(...args);
        };
      }
      return context;
    };
    window.__boxDrawOwnerGate = gate;
  }, firstTabId);
  await page.evaluate(tabId => window.Components.box.draw({
    tabId,
    force: true,
    silentOverlay: true,
    reason: 'e2e-box-draw-owner-switch'
  }), firstTabId);
  await page.waitForFunction(() => window.__boxDrawOwnerGate?.entered === true, null, { timeout: 20_000 });

  await activateTab(page, secondTabId);
  await expect.poll(() => readBoxTitleState(page)).toMatchObject({
    stateTitle: secondCustomTitle,
    payloadTitle: secondCustomTitle,
    svgTitle: secondCustomTitle,
    flipAxes: false,
    payloadFlipAxes: false,
    controlFlipAxes: false
  });
  await page.evaluate(() => {
    const gate = window.__boxDrawOwnerGate;
    gate?.release?.();
    if(gate?.originalCreateExecutionContext){
      window.Shared.jobs.createExecutionContext = gate.originalCreateExecutionContext;
    }
  });
  await page.waitForFunction(tabId => {
    const runtime = window.Components.box.__testHooks.getSession(tabId)?.timers?.drawRuntime;
    return runtime && runtime.inProgress === false;
  }, firstTabId, { timeout: 20_000 });
  const ownerTitles = await page.evaluate(({ firstTabId, secondTabId }) => {
    const tabs = window.Main.session.workspaceState.tabs || [];
    const firstTab = tabs.find(tab => String(tab.id) === firstTabId);
    const secondTab = tabs.find(tab => String(tab.id) === secondTabId);
    const box = window.Components.box;
    return {
      firstSession: box.__testHooks.getSession(firstTabId)?.state?.labels?.titleText || '',
      secondSession: box.__testHooks.getSession(secondTabId)?.state?.labels?.titleText || '',
      firstPayload: firstTab?.payload?.config?.title || '',
      secondPayload: secondTab?.payload?.config?.title || ''
    };
  }, { firstTabId, secondTabId });
  expect(ownerTitles).toEqual({
    firstSession: customTitle,
    secondSession: secondCustomTitle,
    firstPayload: customTitle,
    secondPayload: secondCustomTitle
  });

  await activateTab(page, firstTabId);
  const firstAfterReturn = await readBoxTitleState(page);
  expect(firstAfterReturn.stateTitle).toBe(customTitle);
  expect(firstAfterReturn.payloadTitle).toBe(customTitle);
  expect(firstAfterReturn.flipAxes).toBe(true);
  expect(firstAfterReturn.payloadFlipAxes).toBe(true);
  expect(firstAfterReturn.controlFlipAxes).toBe(true);

  expect(issues.critical).toEqual([]);
});
