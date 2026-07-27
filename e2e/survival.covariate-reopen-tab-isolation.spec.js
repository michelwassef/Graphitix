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

function survivalPayload({ label, data, covariateSettings, xLabel }) {
  return {
    type: 'survival',
    data,
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
      xLabel,
      yLabel: `Survival ${label}`,
      title: `Survival ${label}`,
      covariateSettings,
      statsPanels: {}
    },
    stats: null
  };
}

const FIRST_PAYLOAD = survivalPayload({
  label: 'Covariate A',
  xLabel: 'Time with age and marker',
  covariateSettings: {
    4: { enabled: true, type: 'baseline' },
    5: { enabled: true, type: 'baseline' }
  },
  data: [
    ['Control', 2, 1, '', 50, 0.8],
    ['Control', 4, 0, '', 58, 1.0],
    ['Control', 6, 1, '', 62, 1.2],
    ['Control', 8, 1, '', 65, 1.4],
    ['Treatment', 3, 1, '', 48, 0.5],
    ['Treatment', 5, 0, '', 54, 0.7],
    ['Treatment', 7, 1, '', 60, 0.9],
    ['Treatment', 10, 1, '', 67, 1.1]
  ]
});

const SECOND_PAYLOAD = survivalPayload({
  label: 'Covariate B',
  xLabel: 'Time with dose only',
  covariateSettings: {
    4: { enabled: true, type: 'baseline' }
  },
  data: [
    ['Low', 1, 1, '', 2],
    ['Low', 3, 0, '', 4],
    ['Low', 5, 1, '', 6],
    ['Low', 9, 1, '', 8],
    ['High', 2, 1, '', 3],
    ['High', 6, 0, '', 5],
    ['High', 8, 1, '', 7],
    ['High', 12, 1, '', 9]
  ]
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

async function loadSurvivalPayload(page, payload) {
  await ensureSurvivalReady(page);
  await page.evaluate((nextPayload) => {
    window.Components.survival.loadFromPayload(nextPayload, { source: 'e2e-survival-covariate-isolation' });
    window.Components.survival.draw({ reason: 'e2e-survival-covariate-isolation' });
  }, payload);
  await waitForSurvivalCovariates(page, payload);
}

async function waitForSurvivalCovariates(page, expectedPayload) {
  const expected = {
    xLabel: expectedPayload.config.xLabel,
    covariateSettings: expectedPayload.config.covariateSettings
  };
  await page.waitForFunction((wanted) => {
    const root = document.querySelector('#survivalPage:not([hidden])');
    const payload = window.Components?.survival?.getPayload?.() || null;
    if (!root || !payload || payload.config?.xLabel !== wanted.xLabel) {
      return false;
    }
    const settings = payload.config?.covariateSettings || {};
    return Object.entries(wanted.covariateSettings).every(([key, cfg]) => {
      const checkbox = root.querySelector(`#survivalCovariateToggle-${key}`);
      const select = root.querySelector(`select[data-column-index="${key}"]`);
      return settings[key]?.enabled === cfg.enabled
        && settings[key]?.type === cfg.type
        && !!checkbox
        && checkbox.checked === cfg.enabled
        && (!cfg.enabled || select?.value === cfg.type);
    });
  }, expected, { timeout: 45_000 });
}

async function readCovariateSnapshot(page) {
  return page.evaluate(() => {
    const root = document.querySelector('#survivalPage:not([hidden])');
    const payload = window.Components?.survival?.getPayload?.() || null;
    const settings = payload?.config?.covariateSettings || {};
    const controls = {};
    root?.querySelectorAll?.('[id^="survivalCovariateToggle-"]').forEach((checkbox) => {
      const key = checkbox.id.replace('survivalCovariateToggle-', '');
      const select = root.querySelector(`select[data-column-index="${key}"]`);
      controls[key] = { enabled: !!checkbox.checked, type: select?.value || null };
    });
    return {
      xLabel: payload?.config?.xLabel || '',
      settings,
      controls,
      statsText: root?.querySelector?.('#survivalStatsCox')?.textContent || ''
    };
  });
}

function expectCovariates(snapshot, expectedPayload) {
  expect(snapshot.xLabel).toBe(expectedPayload.config.xLabel);
  for (const [key, cfg] of Object.entries(expectedPayload.config.covariateSettings)) {
    expect(snapshot.settings[key], `payload covariate ${key}`).toMatchObject(cfg);
    expect(snapshot.controls[key], `DOM covariate ${key}`).toMatchObject(cfg);
  }
  expect(snapshot.statsText).toMatch(/Cox|Reporting and reproducibility|coefficient/i);
}

async function captureWorkspaceArchive(page, fileStem) {
  const archive = await page.evaluate(async (stem) => {
    const context = window.Main.tabs.getSessionActionsContext();
    const blob = await window.Main.sessionActions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace',
      snapshotKind: 'document-snapshot',
      compression: 'STORE',
      reason: 'e2e-survival-covariate-reopen-isolation'
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
    return (state.tabs || []).filter(tab => tab && tab.type === 'survival').length === 2;
  }, null, { timeout: 60_000 });
}

async function reopenedSurvivalTabIds(page) {
  return page.evaluate(() => {
    const state = window.Main?.session?.workspaceState || {};
    return (state.tabs || []).filter(tab => tab && tab.type === 'survival').map(tab => tab.id);
  });
}

test('survival covariate controls stay isolated across same-component tabs and reopen', async ({ page }) => {
  test.setTimeout(240_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });

  await openComponentFromWelcome(page, { type: 'survival', pageId: 'survivalPage' }, { first: true });
  await loadSurvivalPayload(page, FIRST_PAYLOAD);
  const firstTabId = await currentTabId(page);
  expect(firstTabId).toBeTruthy();

  await openComponentFromWelcome(page, { type: 'survival', pageId: 'survivalPage' });
  await loadSurvivalPayload(page, SECOND_PAYLOAD);
  const secondTabId = await currentTabId(page);
  expect(secondTabId).toBeTruthy();
  expect(secondTabId).not.toBe(firstTabId);

  await activateTab(page, firstTabId);
  await waitForSurvivalCovariates(page, FIRST_PAYLOAD);
  expectCovariates(await readCovariateSnapshot(page), FIRST_PAYLOAD);

  await activateTab(page, secondTabId);
  await waitForSurvivalCovariates(page, SECOND_PAYLOAD);
  expectCovariates(await readCovariateSnapshot(page), SECOND_PAYLOAD);

  const archivePath = await captureWorkspaceArchive(page, 'survival-covariate-reopen-isolation');
  await reopenArchive(page, archivePath);
  const [reopenedFirstId, reopenedSecondId] = await reopenedSurvivalTabIds(page);

  await activateTab(page, reopenedFirstId);
  await waitForSurvivalCovariates(page, FIRST_PAYLOAD);
  expectCovariates(await readCovariateSnapshot(page), FIRST_PAYLOAD);

  await activateTab(page, reopenedSecondId);
  await waitForSurvivalCovariates(page, SECOND_PAYLOAD);
  expectCovariates(await readCovariateSnapshot(page), SECOND_PAYLOAD);

  expect(issues.critical.filter(entry => entry.kind !== 'requestfailed')).toEqual([]);
});
