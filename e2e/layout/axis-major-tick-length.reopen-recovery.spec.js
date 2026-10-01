const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { clickExampleButton } = require('../helpers/uiDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { buildWorkspaceArchive, parseWorkspaceArchive } = require('../helpers/archiveDriver');

const CASES = [
  { type: 'scatter', pageId: 'scatterPage', exampleButtonId: 'scatterLoadExample' },
  { type: 'line', pageId: 'linePage', exampleButtonId: 'lineLoadExample' },
  { type: 'hist', pageId: 'histPage', exampleButtonId: 'histLoadExample' },
  { type: 'venn', pageId: 'vennPage', exampleButtonId: 'sample' }
];

async function openCase(page, componentCase) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await openComponentFromWelcome(page, componentCase, { first: true });
  await page.waitForSelector(`#${componentCase.pageId}:not([hidden])`, { timeout: 30_000 });
  await clickExampleButton(page, componentCase, { requireMountedRoot: true });
  await waitForComponentOwnerReady(page, componentCase, {
    requireMountedRoot: true,
    requireIdle: true
  });
}

async function applyLengths(page, type, x, y, source) {
  await page.evaluate(async ({ componentType, nextX, nextY, hydrationSource }) => {
    const component = window.Main.components.registry[componentType];
    const activeTab = window.Main.session.getActiveTab();
    const payload = component.getPayload();
    if (componentType === 'venn') {
      payload.style = payload.style || {};
      payload.style.plotType = 'upset';
      payload.style.upset = {
        ...(payload.style.upset || {}),
        xMajorTickLength: nextX,
        yMajorTickLength: nextY
      };
    } else {
      payload.config = payload.config || {};
      payload.config.axis = {
        ...(payload.config.axis || {}),
        majorTickLengthX: nextX,
        majorTickLengthY: nextY
      };
    }
    const result = component.loadFromPayload(payload, {
      source: hydrationSource,
      reason: `e2e-axis-tick-length-${hydrationSource}`,
      tabId: activeTab.id,
      skipDraw: true
    });
    if (result && typeof result.then === 'function') {
      await result;
    }
  }, { componentType: type, nextX: x, nextY: y, hydrationSource: source });
}

async function readLengths(page, type) {
  return page.evaluate(componentType => {
    const payload = window.Main.components.registry[componentType].getPayload();
    if (componentType === 'venn') {
      return {
        x: payload?.style?.upset?.xMajorTickLength ?? null,
        y: payload?.style?.upset?.yMajorTickLength ?? null
      };
    }
    return {
      x: payload?.config?.axis?.majorTickLengthX ?? null,
      y: payload?.config?.axis?.majorTickLengthY ?? null
    };
  }, type);
}

async function captureArchivePayload(page, type, snapshotKind) {
  const archive = await buildWorkspaceArchive(page, {
    scope: 'workspace',
    snapshotKind,
    policyMode: snapshotKind === 'recovery' ? 'recovery' : 'manual-save',
    reason: `e2e-axis-tick-length-${snapshotKind}`,
    compression: 'STORE',
    useWorker: false
  });
  const parsed = await parseWorkspaceArchive(
    page,
    archive.base64,
    snapshotKind === 'recovery' ? 'recovery.graph' : 'reopen.graph'
  );
  return parsed.session.tabs.find(tab => tab.type === type)?.payload || null;
}

async function applyArchivePayload(page, type, payload, source) {
  await page.evaluate(async ({ componentType, nextPayload, hydrationSource }) => {
    const component = window.Main.components.registry[componentType];
    const activeTab = window.Main.session.getActiveTab();
    const result = component.loadFromPayload(nextPayload, {
      source: hydrationSource,
      reason: `e2e-axis-tick-length-${hydrationSource}`,
      tabId: activeTab.id,
      skipDraw: true
    });
    if (result && typeof result.then === 'function') {
      await result;
    }
  }, { componentType: type, nextPayload: payload, hydrationSource: source });
}

async function runRoundTrip(page, type) {
  await applyLengths(page, type, 7, 11, 'configured');
  const manualPayload = await captureArchivePayload(page, type, 'document-snapshot');
  await applyLengths(page, type, null, null, 'manual-reset');
  await applyArchivePayload(page, type, manualPayload, 'file-reopen');
  const reopened = await readLengths(page, type);

  const recoveryPayload = await captureArchivePayload(page, type, 'recovery');
  await applyLengths(page, type, null, null, 'recovery-reset');
  await applyArchivePayload(page, type, recoveryPayload, 'recovery-restore');
  const recovered = await readLengths(page, type);

  return {
    archived: readLengthsFromPayload(manualPayload, type),
    reopened,
    recoveryArchived: readLengthsFromPayload(recoveryPayload, type),
    recovered
  };
}

function readLengthsFromPayload(payload, type) {
  if (type === 'venn') {
    return {
      x: payload?.style?.upset?.xMajorTickLength ?? null,
      y: payload?.style?.upset?.yMajorTickLength ?? null
    };
  }
  return {
    x: payload?.config?.axis?.majorTickLengthX ?? null,
    y: payload?.config?.axis?.majorTickLengthY ?? null
  };
}

/*
 * Keep the payload path differences in this contract explicit. The archive
 * build/parse boundary is shared; only the component-specific field shape is
 * owned here.
 */
for (const componentCase of CASES) {
  test(`${componentCase.type} tick lengths survive file reopen and crash recovery`, async ({ page }) => {
    test.setTimeout(120_000);
    await installLocalCdnOverrides(page);
    await openCase(page, componentCase);
    const result = await runRoundTrip(page, componentCase.type);
    expect(result.archived).toEqual({ x: 7, y: 11 });
    expect(result.reopened).toEqual({ x: 7, y: 11 });
    expect(result.recoveryArchived).toEqual({ x: 7, y: 11 });
    expect(result.recovered).toEqual({ x: 7, y: 11 });
  });
}
