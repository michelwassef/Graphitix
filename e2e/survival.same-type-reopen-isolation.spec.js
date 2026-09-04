const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent,
  waitForDocumentOpenComplete
} = require('./helpers/workspaceHarness');

const TMP_DIR = path.resolve(__dirname, '.tmp');

async function waitForSurvivalRender(page, expected = {}) {
  await page.waitForFunction((wanted) => {
    const root = document.querySelector('#survivalPage:not([hidden])');
    const svg = root?.querySelector?.('#survivalSvg') || null;
    const payload = window.Components?.survival?.getPayload?.() || null;
    if (!root || !svg || !payload) {
      return false;
    }
    const config = payload.config || {};
    if (wanted.xLabel && config.xLabel !== wanted.xLabel) {
      return false;
    }
    if (wanted.yLabel && config.yLabel !== wanted.yLabel) {
      return false;
    }
    if (typeof wanted.showCI === 'boolean' && !!config.showCI !== wanted.showCI) {
      return false;
    }
    if (typeof wanted.showCensor === 'boolean' && !!config.showCensor !== wanted.showCensor) {
      return false;
    }
    if (typeof wanted.showLegend === 'boolean' && !!config.showLegend !== wanted.showLegend) {
      return false;
    }
    if (typeof wanted.showHazardRatios === 'boolean' && !!config.showHazardRatios !== wanted.showHazardRatios) {
      return false;
    }
    if (typeof wanted.fitCoxModel === 'boolean' && !!config.fitCoxModel !== wanted.fitCoxModel) {
      return false;
    }
    if (wanted.noteText && !String(config.notes?.text || '').includes(wanted.noteText)) {
      return false;
    }
    const svgText = svg.textContent || '';
    return (!wanted.xLabel || svgText.includes(wanted.xLabel))
      && (!wanted.yLabel || svgText.includes(wanted.yLabel));
  }, expected, { timeout: 45_000 });
}

async function applySurvivalControls(page, controls) {
  await page.evaluate((next) => {
    const setChecked = (id, checked) => {
      if (typeof checked !== 'boolean') return;
      const el = document.querySelector(`#survivalPage:not([hidden]) #${id}`);
      if (!el) return;
      el.checked = checked;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const setValue = (id, value) => {
      if (value == null) return;
      const el = document.querySelector(`#survivalPage:not([hidden]) #${id}`);
      if (!el) return;
      el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setChecked('survivalShowCI', next.showCI);
    setChecked('survivalShowCensor', next.showCensor);
    setChecked('survivalShowGrid', next.showGrid);
    setChecked('survivalShowFrame', next.showFrame);
    setChecked('survivalShowLegend', next.showLegend);
    setChecked('survivalShowHazardRatios', next.showHazardRatios);
    setChecked('survivalFitCox', next.fitCoxModel);
    setValue('survivalTimeMax', next.timeMax);
    const currentPayload = window.Components?.survival?.getPayload?.() || null;
    if (currentPayload && (next.xLabel || next.yLabel)) {
      window.Components?.survival?.loadFromPayload?.({
        ...currentPayload,
        config: {
          ...(currentPayload.config || {}),
          ...(next.xLabel ? { xLabel: next.xLabel } : {}),
          ...(next.yLabel ? { yLabel: next.yLabel } : {})
        }
      }, { source: 'e2e-survival-label-config', skipDraw: true });
    }
    if (next.noteText) {
      const details = document.querySelector('#survivalPage:not([hidden]) #survivalGraphPanel details.shared-notes');
      const editor = details?.querySelector?.('[data-notes-editor="1"], textarea') || null;
      if (details && editor) {
        details.open = true;
        if ('value' in editor) {
          editor.value = next.noteText;
        } else {
          editor.innerHTML = next.noteText;
        }
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    window.Components?.survival?.draw?.({ reason: 'e2e-survival-controls' });
  }, controls);
  await waitForSurvivalRender(page, controls);
}

async function readSurvivalState(page) {
  return page.evaluate(() => {
    const root = document.querySelector('#survivalPage:not([hidden])');
    const svg = root?.querySelector?.('#survivalSvg') || null;
    const payload = window.Components?.survival?.getPayload?.() || null;
    const config = payload?.config || {};
    const text = svg?.textContent || '';
    return {
      controls: {
        showCI: !!root?.querySelector?.('#survivalShowCI')?.checked,
        showCensor: !!root?.querySelector?.('#survivalShowCensor')?.checked,
        showGrid: !!root?.querySelector?.('#survivalShowGrid')?.checked,
        showFrame: !!root?.querySelector?.('#survivalShowFrame')?.checked,
        showLegend: !!root?.querySelector?.('#survivalShowLegend')?.checked,
        showHazardRatios: !!root?.querySelector?.('#survivalShowHazardRatios')?.checked,
        fitCoxModel: !!root?.querySelector?.('#survivalFitCox')?.checked,
        timeMax: root?.querySelector?.('#survivalTimeMax')?.value || '',
        xLabel: config.xLabel || '',
        yLabel: config.yLabel || ''
      },
      payload: {
        showCI: !!config.showCI,
        showCensor: !!config.showCensor,
        showGrid: !!config.showGrid,
        showFrame: !!config.showFrame,
        showLegend: !!config.showLegend,
        showHazardRatios: !!config.showHazardRatios,
        fitCoxModel: !!config.fitCoxModel,
        timeMax: String(config.timeMax || ''),
        xLabel: config.xLabel || '',
        yLabel: config.yLabel || ''
      },
      notes: {
        domText: root?.querySelector?.('#survivalGraphPanel details.shared-notes [data-notes-editor="1"], #survivalGraphPanel details.shared-notes textarea')?.textContent
          || root?.querySelector?.('#survivalGraphPanel details.shared-notes textarea')?.value
          || '',
        payloadText: config.notes?.text || '',
        payloadOpen: !!config.notes?.open
      },
      svg: {
        hasSvg: !!svg,
        text,
        ciPathCount: svg ? Array.from(svg.querySelectorAll('path[fill-opacity="0.15"]')).length : 0,
        censorMarkCount: svg ? svg.querySelectorAll('[data-survival-censor-mark="1"]').length : 0
      },
      stats: {
        hazardText: root?.querySelector?.('#survivalStatsHazardRatios')?.textContent || '',
        coxText: root?.querySelector?.('#survivalStatsCox')?.textContent || '',
        reportText: root?.querySelector?.('#survivalStatsReportHost')?.textContent || ''
      }
    };
  });
}

function expectSurvivalState(actual, expected) {
  expect(actual.svg.hasSvg).toBe(true);
  for (const key of ['showCI', 'showCensor', 'showGrid', 'showFrame', 'showLegend', 'showHazardRatios', 'fitCoxModel', 'timeMax']) {
    expect(actual.controls[key], `DOM control ${key}`).toBe(expected[key]);
    expect(actual.payload[key], `payload config ${key}`).toBe(expected[key]);
  }
  for (const key of ['xLabel', 'yLabel']) {
    expect(actual.payload[key], `payload config ${key}`).toBe(expected[key]);
  }
  expect(actual.svg.text).toContain(expected.xLabel);
  expect(actual.svg.text).toContain(expected.yLabel);
  if (expected.noteText) {
    expect(actual.notes.domText).toContain(expected.noteText);
    expect(actual.notes.payloadText).toContain(expected.noteText);
    expect(actual.notes.payloadOpen).toBe(true);
  }
  if (expected.showCI) {
    expect(actual.svg.ciPathCount).toBeGreaterThan(0);
  } else {
    expect(actual.svg.ciPathCount).toBe(0);
  }
  if (expected.showCensor) {
    expect(actual.svg.censorMarkCount).toBeGreaterThan(0);
  }
  if (expected.showHazardRatios) {
    expect(actual.stats.hazardText).toMatch(/Hazard Ratio|Relative hazard|Reporting and reproducibility/i);
  } else {
    expect(`${actual.stats.hazardText}\n${actual.stats.coxText}\n${actual.stats.reportText}`).toMatch(/Show Hazard Ratios:\s*No/i);
  }
  if (expected.fitCoxModel) {
    expect(actual.stats.coxText).toMatch(/Cox Model|Reporting and reproducibility/i);
  } else {
    expect(actual.stats.coxText).toMatch(/Enable "Fit Cox model"|Cox model disabled|Fit Cox:\s*No/i);
  }
}

async function currentTabId(page) {
  return page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
}

async function activateTab(page, tabId) {
  const tab = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).first();
  await expect(tab).toBeVisible({ timeout: 20_000 });
  await tab.click({ force: true });
  await page.waitForSelector('#survivalPage:not([hidden])', { timeout: 20_000 });
}

async function captureWorkspaceArchive(page, fileStem) {
  const archive = await page.evaluate(async (stem) => {
    const context = window.Main.tabs.getSessionActionsContext();
    const blob = await window.Main.sessionActions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace',
      snapshotKind: 'document-snapshot',
      compression: 'STORE',
      reason: 'e2e-survival-same-type-reopen-isolation'
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

test('survival configuration starts with Graph followed by Color scheme', async ({ page }) => {
  test.setTimeout(60_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });

  await openComponentFromWelcome(page, { type: 'survival', pageId: 'survivalPage' }, { first: true });

  await expect.poll(async () => page.locator('#survivalGraphPanel .config-panel > fieldset legend').allTextContents())
    .toEqual(['Graph', 'Color scheme', 'Grid & axis', 'Font', 'Publication style']);
});

test('survival same-type controls and stats stay isolated across tab switch and reopen', async ({ page }) => {
  test.setTimeout(240_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  const first = {
    showCI: true,
    showCensor: false,
    showGrid: true,
    showFrame: true,
    showLegend: false,
    showHazardRatios: false,
    fitCoxModel: false,
    timeMax: '13',
    xLabel: 'Time A',
    yLabel: 'Survival A',
    noteText: 'Survival tab A note'
  };
  const second = {
    showCI: false,
    showCensor: true,
    showGrid: false,
    showFrame: false,
    showLegend: true,
    showHazardRatios: true,
    fitCoxModel: true,
    timeMax: '21',
    xLabel: 'Time B',
    yLabel: 'Survival B',
    noteText: 'Survival tab B note'
  };

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });

  await openComponentFromWelcome(page, { type: 'survival', pageId: 'survivalPage' }, { first: true });
  await clickExampleButtonIfPresent(page, 'survivalLoadExample');
  await applySurvivalControls(page, first);
  const firstTabId = await currentTabId(page);
  expect(firstTabId).toBeTruthy();

  await openComponentFromWelcome(page, { type: 'survival', pageId: 'survivalPage' });
  await clickExampleButtonIfPresent(page, 'survivalLoadExample');
  await applySurvivalControls(page, second);
  const secondTabId = await currentTabId(page);
  expect(secondTabId).toBeTruthy();
  expect(secondTabId).not.toBe(firstTabId);

  await activateTab(page, firstTabId);
  await waitForSurvivalRender(page, first);
  expectSurvivalState(await readSurvivalState(page), first);

  await activateTab(page, secondTabId);
  await waitForSurvivalRender(page, second);
  expectSurvivalState(await readSurvivalState(page), second);

  const archivePath = await captureWorkspaceArchive(page, 'survival-same-type-reopen-isolation');
  await reopenArchive(page, archivePath);
  const [reopenedFirstId, reopenedSecondId] = await reopenedSurvivalTabIds(page);
  expect(reopenedFirstId).toBeTruthy();
  expect(reopenedSecondId).toBeTruthy();

  await activateTab(page, reopenedFirstId);
  await waitForSurvivalRender(page, first);
  expectSurvivalState(await readSurvivalState(page), first);

  await activateTab(page, reopenedSecondId);
  await waitForSurvivalRender(page, second);
  expectSurvivalState(await readSurvivalState(page), second);

  expect(issues.critical.filter(entry => entry.kind !== 'requestfailed')).toEqual([]);
});
