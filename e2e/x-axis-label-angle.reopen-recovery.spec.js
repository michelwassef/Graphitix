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

function payloadAngle(type, payload) {
  return type === 'venn'
    ? (payload?.style?.upset?.xLabelAngle ?? null)
    : (payload?.config?.axis?.xLabelAngle ?? null);
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
    const control = mountedRoot?.querySelector?.(selector)
      || document.querySelector(`#${type}Page:not([hidden]) ${selector}`);
    if (!control) {
      throw new Error(`Mode control ${selector} not found for ${type}`);
    }
    control.value = value;
    // Real browser select interaction emits input and change. Pie currently
    // commits chart type on input; Venn commits plot type on change.
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
  }, { type: component.type, selector: component.modeControl, value: component.modeValue });
}

async function waitForXAxisTicks(page, component) {
  await page.waitForFunction(({ type, plotSelector, tickSelector }) => {
    const workspace = window.Main?.session?.workspaceState;
    const active = workspace?.tabs?.find(tab => tab?.id === workspace.activeTabId) || null;
    if (!active || active.type !== type || window.Components?.[type]?.ready !== true) {
      return false;
    }
    const mountedRoot = window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, type) || null;
    const plot = mountedRoot?.querySelector?.(plotSelector)
      || document.querySelector(`#${type}Page:not([hidden]) ${plotSelector}`);
    return (plot?.querySelectorAll(`svg ${tickSelector}`).length || 0) > 0;
  }, {
    type: component.type,
    plotSelector: component.plotSelector,
    tickSelector: component.tickSelector || DEFAULT_TICK_SELECTOR
  }, { timeout: 60_000 });
}

async function waitForSnapshotReady(page, type, reason) {
  const readiness = await page.evaluate(async ({ componentType, readinessReason }) => {
    const active = window.Main?.session?.getActiveTab?.() || null;
    const module = window.Components?.[componentType] || null;
    if (!active || active.type !== componentType || !module) {
      throw new Error(`Unable to resolve active ${componentType} owner`);
    }
    if (typeof module.awaitReadyForSnapshot !== 'function') {
      throw new Error(`${componentType} awaitReadyForSnapshot hook is unavailable`);
    }
    return module.awaitReadyForSnapshot({
      tabId: active.id,
      type: componentType,
      reason: readinessReason,
      timeoutMs: 15_000
    });
  }, { componentType: type, readinessReason: reason });
  expect(
    readiness?.ok,
    `Snapshot readiness failed for ${type}: ${JSON.stringify(readiness)}`
  ).toBe(true);
  return readiness;
}

async function openCase(page, component) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await openComponentFromWelcome(page, component, { first: true, loadExample: true });
  await configureActiveCaseMode(page, component);
  await waitForXAxisTicks(page, component);
  await waitForSnapshotReady(page, component.type, 'e2e-x-axis-label-angle-open-ready');
}

async function openXAxisControls(page, component) {
  const clicked = await page.evaluate(({ type, plotSelector }) => {
    const workspace = window.Main?.session?.workspaceState;
    const active = workspace?.tabs?.find(tab => tab?.id === workspace.activeTabId) || null;
    if (!active || active.type !== type) {
      return false;
    }
    const mountedRoot = window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, type) || null;
    const plot = mountedRoot?.querySelector?.(plotSelector)
      || document.querySelector(`#${type}Page:not([hidden]) ${plotSelector}`);
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

async function waitForPayloadAngle(page, type, expected) {
  await page.waitForFunction(({ componentType, target }) => {
    const payload = window.Components?.[componentType]?.getPayload?.() || null;
    const actual = componentType === 'venn'
      ? (payload?.style?.upset?.xLabelAngle ?? null)
      : (payload?.config?.axis?.xLabelAngle ?? null);
    return actual === target;
  }, { componentType: type, target: expected }, { timeout: 20_000 });
}

async function captureArchivePayload(page, type, snapshotKind) {
  await waitForSnapshotReady(
    page,
    type,
    `e2e-x-axis-label-angle-${snapshotKind}-prearchive-ready`
  );
  return page.evaluate(async ({ componentType, kind }) => {
    const context = window.Main.tabs.getSessionActionsContext();
    const blob = await window.Main.sessionActions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace',
      snapshotKind: kind,
      policyMode: kind === 'recovery' ? 'recovery' : 'manual-save',
      reason: `e2e-x-axis-label-angle-${kind}`,
      // This contract exercises canonical payload persistence only. Render-cache
      // capture is covered by dedicated reopen/cache suites and would couple this
      // test to the publication state of a deliberately skipDraw hydration below.
      captureRenderCacheBeforeSnapshot: false,
      includeRenderCacheInSnapshot: false,
      compression: 'STORE',
      useWorker: false
    });
    const parsed = await window.Shared.graphArchive.parseFile(blob, {
      fileName: kind === 'recovery' ? 'recovery.graph' : 'reopen.graph'
    });
    return parsed.session.tabs.find(tab => tab.type === componentType)?.payload || null;
  }, { componentType: type, kind: snapshotKind });
}

async function hydrateOwnerFromPayload(page, type, payload, source) {
  // A synthetic skipDraw hydration is not the workspace reopen transaction: it
  // intentionally omits render-cache restore/fallback draw. Settle any accepted
  // user edit first so no pre-hydration draw remains in flight while canonical
  // owner state is replaced.
  await waitForSnapshotReady(
    page,
    type,
    `e2e-x-axis-label-angle-${source}-prehydrate-ready`
  );
  await page.evaluate(async ({ componentType, nextPayload, hydrationSource }) => {
    const workspace = window.Main?.components?.registry?.[componentType] || null;
    const activeTab = window.Main?.session?.getActiveTab?.() || null;
    if (!workspace || !activeTab || activeTab.type !== componentType) {
      throw new Error(`Unable to hydrate active ${componentType} owner`);
    }

    const clone = window.Main?.session?.clonePayload
      ? window.Main.session.clonePayload(nextPayload)
      : JSON.parse(JSON.stringify(nextPayload));
    window.Main.session.assignTabPayload(activeTab, clone, {
      reason: `e2e-x-axis-label-angle-${hydrationSource}`
    });

    const result = workspace.loadFromPayload(clone, {
      source: hydrationSource,
      reason: `e2e-x-axis-label-angle-${hydrationSource}`,
      tab: activeTab,
      tabId: activeTab.id,
      skipDraw: true
    });
    if (result && typeof result.then === 'function') {
      await result;
    }
  }, { componentType: type, nextPayload: payload, hydrationSource: source });
  await waitForSnapshotReady(
    page,
    type,
    `e2e-x-axis-label-angle-${source}-ready`
  );
}

for (const component of CASES) {
  test(`${component.type} x-axis label angle survives file reopen and crash recovery`, async ({ page }) => {
    test.setTimeout(180_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await openCase(page, component);

    await openXAxisControls(page, component);
    await setXAxisLabelAngle(page, -60);
    await waitForPayloadAngle(page, component.type, -60);

    const manualPayload = await captureArchivePayload(page, component.type, 'document-snapshot');
    expect(payloadAngle(component.type, manualPayload)).toBe(-60);

    await setXAxisLabelAngle(page, null);
    await waitForPayloadAngle(page, component.type, null);
    await hydrateOwnerFromPayload(page, component.type, manualPayload, 'file-reopen');
    await waitForPayloadAngle(page, component.type, -60);

    const recoveryPayload = await captureArchivePayload(page, component.type, 'recovery');
    expect(payloadAngle(component.type, recoveryPayload)).toBe(-60);

    await openXAxisControls(page, component);
    await setXAxisLabelAngle(page, null);
    await waitForPayloadAngle(page, component.type, null);
    await hydrateOwnerFromPayload(page, component.type, recoveryPayload, 'recovery-restore');
    await waitForPayloadAngle(page, component.type, -60);

    expect(issues.critical).toEqual([]);
  });
}
