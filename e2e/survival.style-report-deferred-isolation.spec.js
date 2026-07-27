const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  waitForDocumentOpenComplete
} = require('./helpers/workspaceHarness');

const TMP_DIR = path.resolve(__dirname, '.tmp');

function payloadFor(label, overrides = {}) {
  return {
    type: 'survival',
    data: [
      ['Control', 2, 1, '', 50],
      ['Control', 4, 0, '', 58],
      ['Control', 7, 1, '', 64],
      ['Treatment', 1, 1, '', 44],
      ['Treatment', 5, 0, '', 52],
      ['Treatment', 8, 1, '', 60]
    ],
    exclusions: [],
    filters: null,
    config: {
      showCI: true,
      showCensor: true,
      showHazardRatios: true,
      fitCoxModel: true,
      showGrid: true,
      showFrame: true,
      showLegend: true,
      title: `Survival ${label}`,
      xLabel: `Time ${label}`,
      yLabel: `Probability ${label}`,
      pairwiseCorrection: overrides.pairwiseCorrection || 'holm-sidak',
      statsReportPScientific: !!overrides.scientific,
      gridStyle: overrides.gridStyle,
      fontStyles: overrides.fontStyles,
      axis: overrides.axis,
      advisor: overrides.advisor,
      statsPanels: {}
    },
    stats: null
  };
}

const FIRST = payloadFor('Style A', {
  scientific: true,
  pairwiseCorrection: 'bh',
  gridStyle: { color: '#ff0000', thickness: 2, pattern: 'dashed', transparency: 15 },
  axis: { strokeWidth: 3, color: '#aa0000', tickIntervalX: 2, minorTicksX: true, minorTickSubdivisionsX: 4 },
  fontStyles: { __graph__: { fontFamily: 'Georgia', fill: '#660000' } },
  advisor: {
    open: true,
    activated: true,
    answers: { analysisFocus: 'adjust', covariateStrategy: 'baseline' },
    lastApplied: { showHazardRatios: true, fitCoxModel: true }
  }
});

const SECOND = payloadFor('Style B', {
  scientific: false,
  pairwiseCorrection: 'holm',
  gridStyle: { color: '#0044cc', thickness: 1, pattern: 'dotted', transparency: 45 },
  axis: { strokeWidth: 1.5, color: '#003399', tickIntervalY: 0.25, minorTicksY: true, minorTickSubdivisionsY: 3 },
  fontStyles: { __graph__: { fontFamily: 'Arial', fill: '#003366' } },
  advisor: {
    open: false,
    activated: true,
    answers: { analysisFocus: 'compare' },
    lastApplied: { showHazardRatios: false, fitCoxModel: false }
  }
});

async function currentTabId(page) {
  return page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
}

async function activateTab(page, tabId) {
  const tab = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).first();
  await expect(tab).toBeVisible({ timeout: 20_000 });
  await tab.click({ force: true });
  await page.waitForSelector('#survivalPage:not([hidden])', { timeout: 20_000 });
}

async function ensureSurvivalReady(page) {
  await page.evaluate(async () => {
    if (typeof window.Main?.components?.ensureComponent === 'function') {
      await window.Main.components.ensureComponent('survival', { reason: 'e2e-survival-direct-payload' });
    }
  });
  await page.waitForFunction(() =>
    typeof window.Components?.survival?.loadFromPayload === 'function'
      && typeof window.Components?.survival?.draw === 'function',
    null,
    { timeout: 45_000 }
  );
}

async function loadPayload(page, payload) {
  await ensureSurvivalReady(page);
  await page.evaluate((nextPayload) => {
    window.Components.survival.loadFromPayload(nextPayload, { source: 'e2e-survival-style-report' });
    window.Components.survival.draw({ reason: 'e2e-survival-style-report' });
  }, payload);
  await waitForPayload(page, payload);
}

async function waitForPayload(page, expected) {
  await page.waitForFunction((wanted) => {
    const payload = window.Components?.survival?.getPayload?.();
    const root = document.querySelector('#survivalPage:not([hidden])');
    if (!payload || !root?.querySelector?.('#survivalSvg')) return false;
    return payload.config?.xLabel === wanted.config.xLabel
      && payload.config?.statsReportPScientific === wanted.config.statsReportPScientific
      && payload.config?.pairwiseCorrection === wanted.config.pairwiseCorrection;
  }, expected, { timeout: 45_000 });
}

async function readSnapshot(page) {
  return page.evaluate(() => {
    const payload = window.Components?.survival?.getPayload?.() || {};
    const config = payload.config || {};
    return {
      title: config.title || '',
      xLabel: config.xLabel || '',
      yLabel: config.yLabel || '',
      scientific: !!config.statsReportPScientific,
      pairwiseCorrection: config.pairwiseCorrection || '',
      gridStyle: config.gridStyle || null,
      axis: config.axis || null,
      fontStyles: config.fontStyles || null,
      advisor: config.advisor || null,
      svgText: document.querySelector('#survivalPage:not([hidden]) #survivalSvg')?.textContent || ''
    };
  });
}

function expectSnapshot(actual, expected) {
  const cfg = expected.config;
  expect(actual.title).toBe(cfg.title);
  expect(actual.xLabel).toBe(cfg.xLabel);
  expect(actual.yLabel).toBe(cfg.yLabel);
  expect(actual.scientific).toBe(cfg.statsReportPScientific);
  expect(actual.pairwiseCorrection).toBe(cfg.pairwiseCorrection);
  expect(actual.gridStyle).toMatchObject(cfg.gridStyle);
  expect(actual.axis).toMatchObject(cfg.axis);
  expect(actual.fontStyles?.__graph__).toMatchObject(cfg.fontStyles.__graph__);
  expect(actual.advisor).toMatchObject(cfg.advisor);
  expect(actual.svgText).toContain(cfg.xLabel);
  expect(actual.svgText).toContain(cfg.yLabel);
}

async function captureWorkspaceArchive(page, fileStem) {
  const archive = await page.evaluate(async (stem) => {
    const context = window.Main.tabs.getSessionActionsContext();
    const blob = await window.Main.sessionActions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace',
      snapshotKind: 'document-snapshot',
      compression: 'STORE',
      reason: 'e2e-survival-style-report-deferred-isolation'
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return { fileName: `${stem}.graph`, base64: btoa(binary) };
  }, fileStem);
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const archivePath = path.join(TMP_DIR, archive.fileName);
  fs.writeFileSync(archivePath, Buffer.from(archive.base64, 'base64'));
  return archivePath;
}

async function reopenArchive(page, archivePath) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await page.locator('#workspaceSessionInput').setInputFiles(archivePath);
  await waitForDocumentOpenComplete(page);
  await page.waitForFunction(() => {
    const state = window.Main?.session?.workspaceState || {};
    return (state.tabs || []).filter(tab => tab?.type === 'survival').length === 2;
  }, null, { timeout: 60_000 });
}

async function survivalTabIds(page) {
  return page.evaluate(() => {
    const state = window.Main?.session?.workspaceState || {};
    return (state.tabs || []).filter(tab => tab?.type === 'survival').map(tab => tab.id);
  });
}

test('survival style, reporting, advisor, and tab-scoped font refresh survive switch and reopen', async ({ page }) => {
  test.setTimeout(240_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });

  await openComponentFromWelcome(page, { type: 'survival', pageId: 'survivalPage' }, { first: true });
  await loadPayload(page, FIRST);
  const firstTabId = await currentTabId(page);

  await openComponentFromWelcome(page, { type: 'survival', pageId: 'survivalPage' });
  await loadPayload(page, SECOND);
  const secondTabId = await currentTabId(page);
  expect(secondTabId).not.toBe(firstTabId);

  await page.evaluate((tabId) => {
    document.dispatchEvent(new CustomEvent('fontControls:styleChanged', {
      detail: { scopeId: 'survival', tabId, storeKey: `survival::@tab:${tabId}::__graph__` }
    }));
  }, firstTabId);
  await page.waitForTimeout(250);
  expectSnapshot(await readSnapshot(page), SECOND);

  await activateTab(page, firstTabId);
  expectSnapshot(await readSnapshot(page), FIRST);

  await activateTab(page, secondTabId);
  expectSnapshot(await readSnapshot(page), SECOND);

  const archivePath = await captureWorkspaceArchive(page, 'survival-style-report-deferred-isolation');
  await reopenArchive(page, archivePath);
  const [reopenedFirstId, reopenedSecondId] = await survivalTabIds(page);

  await activateTab(page, reopenedFirstId);
  await waitForPayload(page, FIRST);
  expectSnapshot(await readSnapshot(page), FIRST);

  await activateTab(page, reopenedSecondId);
  await waitForPayload(page, SECOND);
  expectSnapshot(await readSnapshot(page), SECOND);

  expect(issues.critical.filter(entry => entry.kind !== 'requestfailed')).toEqual([]);
});
