const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

const DEFAULT_TICK_SELECTOR = 'text[data-font-role="xTick"]';
const CASES = [
  { type: 'box', pageId: 'boxPage', plotSelector: '#boxPlot' },
  { type: 'scatter', pageId: 'scatterPage', plotSelector: '#scatterPlot' },
  { type: 'line', pageId: 'linePage', plotSelector: '#linePlot' },
  { type: 'hist', pageId: 'histPage', plotSelector: '#histPlot' },
  { type: 'pca', pageId: 'pcaPage', plotSelector: '#pcaPlot' },
  { type: 'pie', pageId: 'piePage', plotSelector: '#piePlot', modeControl: '#pieChartType', modeValue: 'stacked' },
  { type: 'roc', pageId: 'rocPage', plotSelector: '#rocPlot' },
  { type: 'survival', pageId: 'survivalPage', plotSelector: '#survivalPlot' },
  {
    type: 'venn',
    pageId: 'vennPage',
    plotSelector: '#vennGraphPanel',
    tickSelector: 'text[data-upset-axis-tick-label="set-x"]',
    modeControl: '#vennPlotType',
    modeValue: 'upset'
  }
];

async function getWorkspaceTabIds(page, type) {
  return page.evaluate(componentType => {
    const workspace = window.Main?.session?.workspaceState;
    return (workspace?.tabs || [])
      .filter(tab => tab && !tab.isWelcome && tab.type === componentType)
      .map(tab => String(tab.id || '').trim())
      .filter(Boolean);
  }, type);
}

async function configureActiveCaseMode(page, component) {
  if (!component.modeControl) {
    return;
  }
  await page.evaluate(({ type, selector, value }) => {
    const workspace = window.Main?.session?.workspaceState;
    const active = workspace?.tabs?.find(tab => tab?.id === workspace.activeTabId) || null;
    if (!active || active.type !== type) {
      throw new Error(`Active owner mismatch while configuring ${type}`);
    }
    const mountedRoot = window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, type) || null;
    const control = mountedRoot?.querySelector?.(selector) || document.querySelector(`#${type}Page:not([hidden]) ${selector}`);
    if (!control) {
      throw new Error(`Mode control ${selector} not found for ${type}`);
    }
    control.value = value;
    // Match a real select interaction. Pie currently commits chart type on
    // `input`, while Venn commits plot type on `change`; browsers emit both.
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
  }, { type: component.type, selector: component.modeControl, value: component.modeValue });
}

async function waitForXAxisTicks(page, component) {
  await page.waitForFunction(({ type, plotSelector, tickSelector }) => {
    const workspace = window.Main?.session?.workspaceState;
    const active = workspace?.tabs?.find(tab => tab?.id === workspace.activeTabId) || null;
    if (!active || active.type !== type) {
      return false;
    }
    const mountedRoot = window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, type) || null;
    const plot = mountedRoot?.querySelector?.(plotSelector) || document.querySelector(`#${type}Page:not([hidden]) ${plotSelector}`);
    return (plot?.querySelectorAll(`svg ${tickSelector}`).length || 0) > 0;
  }, {
    type: component.type,
    plotSelector: component.plotSelector,
    tickSelector: component.tickSelector || DEFAULT_TICK_SELECTOR
  }, { timeout: 60_000 });
}

async function openComponentTab(page, component, { first = false } = {}) {
  const before = new Set(await getWorkspaceTabIds(page, component.type));
  await openComponentFromWelcome(page, component, { first, loadExample: true });
  await configureActiveCaseMode(page, component);
  await waitForXAxisTicks(page, component);
  const after = await getWorkspaceTabIds(page, component.type);
  const newTabId = after.find(id => !before.has(id));
  expect(newTabId).toBeTruthy();
  return newTabId;
}

async function activateTabById(page, component, tabId) {
  const tab = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).first();
  await expect(tab).toBeVisible();
  await tab.click({ force: true });
  await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, tabId, { timeout: 20_000 });
  await waitForXAxisTicks(page, component);
}

async function openXAxisControls(page, component) {
  const clicked = await page.evaluate(({ type, plotSelector }) => {
    const workspace = window.Main?.session?.workspaceState;
    const active = workspace?.tabs?.find(tab => tab?.id === workspace.activeTabId) || null;
    if (!active || active.type !== type) {
      return false;
    }
    const mountedRoot = window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, type) || null;
    const plot = mountedRoot?.querySelector?.(plotSelector) || document.querySelector(`#${type}Page:not([hidden]) ${plotSelector}`);
    const target = plot?.querySelector('svg [data-axis-control="1"][data-axis-key="x"]') || null;
    if (!target) {
      return false;
    }
    target.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window
    }));
    return true;
  }, { type: component.type, plotSelector: component.plotSelector });
  expect(clicked).toBe(true);
  await expect(page.locator('.axis-controls-panel')).toBeVisible();
}

async function setXAxisLabelAngle(page, angle) {
  await page.evaluate(nextAngle => {
    const input = document.querySelector('.axis-controls-panel .axis-controls-panel__field--tick-label-angle input[type="number"]');
    if (!input) {
      throw new Error('Tick label angle input not found');
    }
    input.focus();
    input.value = nextAngle == null ? '' : String(nextAngle);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.blur();
  }, angle);
}

async function waitForRenderedAngle(page, component, angle) {
  await page.waitForFunction(({ type, plotSelector, tickSelector, expected }) => {
    const workspace = window.Main?.session?.workspaceState;
    const active = workspace?.tabs?.find(tab => tab?.id === workspace.activeTabId) || null;
    if (!active || active.type !== type) {
      return false;
    }
    const mountedRoot = window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, type) || null;
    const plot = mountedRoot?.querySelector?.(plotSelector) || document.querySelector(`#${type}Page:not([hidden]) ${plotSelector}`);
    const ticks = Array.from(plot?.querySelectorAll(`svg ${tickSelector}`) || []);
    if (!ticks.length) {
      return false;
    }
    return ticks.every(node => {
      const match = (node.getAttribute('transform') || '').match(/rotate\(([-+0-9.]+)/i);
      const actual = match ? Number(match[1]) : 0;
      return Number.isFinite(actual) && Math.abs(actual - expected) < 0.1;
    });
  }, {
    type: component.type,
    plotSelector: component.plotSelector,
    tickSelector: component.tickSelector || DEFAULT_TICK_SELECTOR,
    expected: angle
  }, { timeout: 20_000 });
}

async function readActiveXAxisAngle(page) {
  return page.evaluate(() => {
    const input = document.querySelector('.axis-controls-panel .axis-controls-panel__field--tick-label-angle input[type="number"]');
    return input ? String(input.value || '').trim() : null;
  });
}

for (const component of CASES) {
  test(`${component.type} manual x-axis label angle stays isolated between same-component tabs`, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible();

    const firstTabId = await openComponentTab(page, component, { first: true });
    await openXAxisControls(page, component);
    await setXAxisLabelAngle(page, -90);
    await waitForRenderedAngle(page, component, -90);
    const firstAngleAfterSet = await readActiveXAxisAngle(page);

    const secondTabId = await openComponentTab(page, component, { first: false });
    await openXAxisControls(page, component);
    const secondAngle = await readActiveXAxisAngle(page);

    await activateTabById(page, component, firstTabId);
    await openXAxisControls(page, component);
    const firstAngleAfterReturn = await readActiveXAxisAngle(page);
    await waitForRenderedAngle(page, component, -90);

    await testInfo.attach(`${component.type}.x-axis-label-angle.tab-isolation.json`, {
      body: Buffer.from(JSON.stringify({
        firstTabId,
        secondTabId,
        firstAngleAfterSet,
        secondAngle,
        firstAngleAfterReturn
      }, null, 2), 'utf8'),
      contentType: 'application/json'
    });

    expect(firstTabId).not.toBe(secondTabId);
    expect(firstAngleAfterSet).toBe('-90');
    expect(secondAngle).toBe('');
    expect(firstAngleAfterReturn).toBe('-90');
    expect(issues.critical).toEqual([]);
  });
}
