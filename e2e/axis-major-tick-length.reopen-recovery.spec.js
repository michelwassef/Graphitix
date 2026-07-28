const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

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
  await clickExampleButtonIfPresent(page, componentCase.exampleButtonId);
  await page.waitForTimeout(500);
}

async function runRoundTrip(page, type) {
  return page.evaluate(async componentType => {
    const component = window.Main.components.registry[componentType];
    const activeTab = window.Main.session.getActiveTab();
    const readLengths = payload => {
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
    };
    const setLengths = (payload, x, y) => {
      if (componentType === 'venn') {
        payload.style = payload.style || {};
        payload.style.plotType = 'upset';
        payload.style.upset = { ...(payload.style.upset || {}), xMajorTickLength: x, yMajorTickLength: y };
      } else {
        payload.config = payload.config || {};
        payload.config.axis = { ...(payload.config.axis || {}), majorTickLengthX: x, majorTickLengthY: y };
      }
      return payload;
    };
    const apply = async (payload, source) => {
      const result = component.loadFromPayload(payload, {
        source,
        reason: `e2e-axis-tick-length-${source}`,
        tabId: activeTab.id,
        skipDraw: true
      });
      if (result && typeof result.then === 'function') {
        await result;
      }
    };
    const captureArchivePayload = async snapshotKind => {
      const context = window.Main.tabs.getSessionActionsContext();
      const blob = await window.Main.sessionActions.buildWorkspaceArchiveBlob(context, {
        scope: 'workspace',
        snapshotKind,
        policyMode: snapshotKind === 'recovery' ? 'recovery' : 'manual-save',
        reason: `e2e-axis-tick-length-${snapshotKind}`,
        compression: 'STORE',
        useWorker: false
      });
      const parsed = await window.Shared.graphArchive.parseFile(blob, {
        fileName: snapshotKind === 'recovery' ? 'recovery.graph' : 'reopen.graph'
      });
      return parsed.session.tabs.find(tab => tab.type === componentType)?.payload || null;
    };

    const configured = setLengths(component.getPayload(), 7, 11);
    await apply(configured, 'configured');

    const manualPayload = await captureArchivePayload('document-snapshot');
    await apply(setLengths(component.getPayload(), null, null), 'manual-reset');
    await apply(manualPayload, 'file-reopen');
    const reopened = readLengths(component.getPayload());

    const recoveryPayload = await captureArchivePayload('recovery');
    await apply(setLengths(component.getPayload(), null, null), 'recovery-reset');
    await apply(recoveryPayload, 'recovery-restore');
    const recovered = readLengths(component.getPayload());

    return {
      archived: readLengths(manualPayload),
      reopened,
      recoveryArchived: readLengths(recoveryPayload),
      recovered
    };
  }, type);
}

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
