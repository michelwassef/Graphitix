/**
 * Cross-component contract: a component's rendered stats panel must survive a real
 * .graph archive reopen (and, for the rebuild-from-state components, crash recovery).
 *
 * The render cache governs the reopen restore path. Components that snapshot their stats
 * DOM and replay it can silently drop content on the serialize -> deserialize boundary
 * (SVG is stripped, node refs orphan, listeners are lost). This spec measures the stats
 * region's rendered "richness" (svg count + table rows + vector primitives + text length)
 * before save and after reopen, and fails on any loss. PCA has its own deeper spec
 * (pca.stats-restore.spec.js); this contract owns the other stats components.
 *
 * jsdom cannot host this (no layout / getBoundingClientRect == 0), so it must run in a
 * real browser.
 */
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('./helpers/vendorOverrides');
const { registerIssueCollectors } = require('./helpers/diagnostics');
const {
  openComponentFromWelcome,
  clickExampleButtonIfPresent,
  waitForDocumentOpenComplete
} = require('./helpers/workspaceDriver');
const { waitForComponentOwnerReady } = require('./helpers/contractWaits');

const TMP_DIR = path.resolve(__dirname, '.tmp');

// compute: id of a "Compute statistics" button to click after loading data (null = auto-computes on draw).
// containers: the stats-panel container ids that together hold the component's rendered statistics.
const CASES = [
  { key: 'box', pageId: 'boxPage', exampleButtonId: 'boxLoadExample', compute: 'boxComputeStats', recovery: true, containers: ['statsResults'], requiredStatsText: /p-value|ANOVA|t-test|Mann|comparison/i },
  { key: 'scatter', pageId: 'scatterPage', exampleButtonId: 'scatterLoadExample', compute: 'scatterComputeStats', containers: ['scatterStatsResults'], requiredStatsText: /correlation|regression|p-value|R²/i },
  { key: 'line', pageId: 'linePage', exampleButtonId: 'lineLoadExample', compute: 'lineComputeStats', containers: ['lineStatsResults'], requiredStatsText: /statistics|regression|forecast|p-value|slope/i },
  { key: 'pie', pageId: 'piePage', exampleButtonId: 'pieLoadExample', compute: 'pieComputeStats', containers: ['pieStatsResults'], requiredStatsText: /chi-square|g-test|proportion|p-value/i },
  { key: 'hist', pageId: 'histPage', exampleButtonId: 'histLoadExample', compute: null, containers: ['histStatsResults'], requiredStatsText: /mean|median|standard deviation|statistics/i },
  {
    key: 'roc',
    pageId: 'rocPage',
    exampleButtonId: 'rocLoadExample',
    compute: async page => {
      await page.evaluate(async () => {
        window.Components?.roc?.draw?.({ reason: 'e2e-stats-reopen-presence' });
        await window.Components?.roc?.awaitReadyForSnapshot?.({ reason: 'e2e-stats-reopen-presence-ready' });
      });
    },
    recovery: true,
    containers: ['rocStatsResults'],
    requiredStatsText: /ROC metrics|AUC|precision.?recall/i
  },
  { key: 'survival', pageId: 'survivalPage', exampleButtonId: 'survivalLoadExample', compute: null, containers: ['survivalStatsPValueFormat', 'survivalStatsSummary', 'survivalStatsLogRank', 'survivalStatsHazardRatios', 'survivalStatsCox'], requiredStatsText: /log-rank|hazard|Cox|survival/i },
  { key: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample', compute: null, containers: ['heatmapStatsContent'], requiredStatsText: /items analysed|results|correlation|method/i },
  { key: 'surface', pageId: 'surfacePage', exampleButtonId: 'surfaceLoadExample', compute: null, containers: ['surfaceStatsSummary'], requiredStatsText: /summary|mean|standard deviation|statistics/i }
];

function statsRichnessInPage(containerIds) {
  const normalizeStatsText = value => {
    const superscriptDigits = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+' };
    return String(value || '')
      .replace(/([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*×\s*10([⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+)/g, (_match, mantissa, exponent) => (
        `${mantissa}e${Array.from(exponent).map(char => superscriptDigits[char] || char).join('')}`
      ))
      .replace(/\s+/g, ' ')
      .trim();
  };
  const normalizePValueToken = value => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? String(Number(numeric.toPrecision(8))) : null;
  };
  const collectStatsPValues = el => {
    if (!el) { return []; }
    const values = [];
    el.querySelectorAll('[data-stats-pvalue-raw]').forEach(node => {
      const token = normalizePValueToken(node.dataset?.statsPvalueRaw);
      if (token) { values.push(token); }
    });
    el.querySelectorAll('.stats-assumption__pvalue, .assumption-variance-detail').forEach(node => {
      const text = normalizeStatsText(node.textContent);
      const match = text.match(/(?:p\s*=\s*)?([0-9]*\.?[0-9]+(?:e[-+]?\d+)?)/i);
      const token = match ? normalizePValueToken(match[1]) : null;
      if (token) { values.push(token); }
    });
    const text = normalizeStatsText(el.textContent);
    const regex = /\bp(?:-?value)?\s*(?:[=<]\s*)?([0-9]*\.?[0-9]+(?:e[-+]?\d+)?)/gi;
    let match = regex.exec(text);
    while (match) {
      const token = normalizePValueToken(match[1]);
      if (token) { values.push(token); }
      match = regex.exec(text);
    }
    return Array.from(new Set(values)).sort();
  };
  let svgs = 0, rows = 0, vectors = 0, textLen = 0, exportDropdowns = 0;
  const pValues = [];
  const containerTexts = [];
  for (const id of containerIds) {
    const el = document.getElementById(id);
    if (!el) { continue; }
    svgs += el.querySelectorAll('svg').length;
    rows += el.querySelectorAll('tr').length;
    vectors += el.querySelectorAll('path, rect, circle, line, polyline').length;
    const text = normalizeStatsText(el.textContent);
    textLen += text.length;
    containerTexts.push(text);
    pValues.push(...collectStatsPValues(el));
    exportDropdowns += el.querySelectorAll('.export-dropdown').length;
  }
  return {
    svgs,
    rows,
    vectors,
    textLen,
    exportDropdowns,
    pValues: Array.from(new Set(pValues)).sort(),
    textSignature: containerTexts.join('\n---stats-container---\n')
  };
}

async function captureRocStatsPersistenceState(page) {
  return page.evaluate(() => {
    const payload = window.Components?.roc?.getPayload?.() || {};
    const stats = payload.stats || {};
    return JSON.parse(JSON.stringify({
      graphType: payload.config?.graphType || null,
      analysisSpec: stats.reportModel?.analysisSpec || null,
      resultsText: String(stats.reportModel?.resultsText || '').toLowerCase().replace(/\s+/g, ' ').trim()
    }));
  });
}

// Click the first stats-table export trigger and report whether its menu opens. Proves the
// restored Download/Copy controls are live (re-wired), not dead/mangled markup. Returns
// { controls: false } when the component has no stats-table export controls.
function exportControlLivenessInPage(containerIds) {
  let trigger = null;
  for (const id of containerIds) {
    const el = document.getElementById(id);
    const t = el && el.querySelector('.export-dropdown .export-trigger, .export-dropdown [aria-haspopup="menu"]');
    if (t) { trigger = t; break; }
  }
  if (!trigger) { return { controls: false }; }
  const menu = trigger.closest('.export-dropdown')?.querySelector('.export-menu');
  trigger.click();
  return { controls: true, opened: menu ? menu.hidden === false : false, items: menu ? menu.children.length : 0 };
}

function pValueFormatStateInPage(containerIds) {
  const state = window.Main?.session?.workspaceState;
  const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
  let panel = null;
  let select = null;
  for (const id of containerIds) {
    const candidate = document.getElementById(id);
    const candidateSelect = candidate?.querySelector?.('.stats-pvalue-format-select') || null;
    if (candidateSelect) {
      panel = candidate;
      select = candidateSelect;
      break;
    }
  }
  return {
    available: !!select,
    selectValue: String(select?.value || '').trim(),
    reporting: panel
      ? window.Shared?.statsReporting?.getPValueFormatScientific?.({ target: panel, tabId: active?.id || null }) === true
      : false,
    payload: active?.payload?.meta?.statsReporting?.pValueScientific
  };
}

function survivalPValueFormatPlacementInPage() {
  const stats = document.getElementById('survivalStats');
  const host = document.getElementById('survivalStatsPValueFormat');
  const logRank = document.getElementById('survivalStatsLogRank');
  const summary = document.getElementById('survivalStatsSummary');
  const fieldset = stats?.querySelector('fieldset');
  const children = fieldset ? Array.from(fieldset.children) : [];
  return {
    hostVisible: !!host && !host.hidden,
    beforeLogRank: children.indexOf(host) >= 0 && children.indexOf(logRank) >= 0 && children.indexOf(host) < children.indexOf(logRank),
    nestedControls: summary?.querySelectorAll?.('.stats-pvalue-format-select').length || 0,
    topLevelControls: host?.querySelectorAll?.('.stats-pvalue-format-select').length || 0
  };
}

async function enableScientificPValueFormat(page, containerIds) {
  const before = await page.evaluate(pValueFormatStateInPage, containerIds);
  if (!before.available) return before;
  if (!before.reporting) {
    await page.evaluate(ids => {
      for (const id of ids) {
        const select = document.getElementById(id)?.querySelector?.('.stats-pvalue-format-select');
        if (select) {
          select.value = 'scientific';
          select.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
      }
    }, containerIds);
  }
  await expect.poll(() => page.evaluate(pValueFormatStateInPage, containerIds), { timeout: 25_000 })
    .toMatchObject({ available: true, selectValue: 'scientific', reporting: true, payload: true });
  return page.evaluate(pValueFormatStateInPage, containerIds);
}

async function buildAndCompute(page, c) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await openComponentFromWelcome(page, { type: c.key, pageId: c.pageId, exampleButtonId: c.exampleButtonId }, { first: true });
  await page.waitForFunction(t => !!window.Components?.[t]?.ready, c.key, { timeout: 30_000 });
  await clickExampleButtonIfPresent(page, c.exampleButtonId);
  await waitForComponentOwnerReady(page, { type: c.key, pageId: c.pageId }, { requireMountedRoot: true });
  if (typeof c.compute === 'function') {
    await c.compute(page);
  } else if (c.compute) {
    const computeButton = page.locator(`#${c.compute}:visible`).first();
    await expect(computeButton).toBeVisible({ timeout: 30_000 });
    await expect(computeButton).toBeEnabled({ timeout: 30_000 });
    await computeButton.click();
  }
  await expect
    .poll(async () => (await page.evaluate(statsRichnessInPage, c.containers)).textLen, { timeout: 30_000 })
    .toBeGreaterThan(0);
}

async function captureArchive(page, stem) {
  const archive = await page.evaluate(async () => {
    const ctx = window.Main.tabs.getSessionActionsContext();
    const blob = await window.Main.sessionActions.buildWorkspaceArchiveBlob(ctx, { scope: 'workspace', snapshotKind: 'document-snapshot', compression: 'STORE', reason: 'e2e-stats-contract' });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) { bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); }
    return btoa(bin);
  });
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const p = path.join(TMP_DIR, `${stem}.graph`);
  fs.writeFileSync(p, Buffer.from(archive, 'base64'));
  return p;
}

async function activateComponentTab(page, key) {
  let handle;
  try {
    handle = await page.waitForFunction(t => {
      const tabs = window.Main?.session?.workspaceState?.tabs || [];
      const tab = tabs.find(item => item && !item.isWelcome && item.type === t);
      return tab?.id || false;
    }, key, { timeout: 60_000, polling: 'raf' });
  } catch (error) {
    const state = await page.evaluate(() => ({
      tabs: (window.Main?.session?.workspaceState?.tabs || []).map(tab => ({
        id: tab?.id || null,
        type: tab?.type || null,
        isWelcome: !!tab?.isWelcome,
        payloadType: tab?.payload?.type || null
      })),
      activeTabId: window.Main?.session?.workspaceState?.activeTabId || null,
      documentOperation: window.Main?.session?.workspaceState?.documentOperation || null,
      diagnostics: window.Main?.sessionActions?.getDocumentOpenDiagnostics?.() || null
    }));
    throw new Error(`Recovery component tab was not restored: ${JSON.stringify(state)}`, { cause: error });
  }
  const tabId = await handle.jsonValue();
  await page.evaluate(async id => {
    const result = window.Main?.tabs?.activateTab?.(id, { reason: 'e2e-stats-contract-activate' });
    if (result && typeof result.then === 'function') await result;
  }, tabId);
  await waitForComponentOwnerReady(page, { type: key, pageId: `${key}Page` }, {
    expectedTabId: tabId,
    requireMountedRoot: true
  });
}

function expectNoStatsLoss(before, after, label, requiredText) {
  expect(after.svgs, `${label}: stats SVG count dropped (${after.svgs} < ${before.svgs})`).toBeGreaterThanOrEqual(before.svgs);
  expect(after.rows, `${label}: stats table rows dropped (${after.rows} < ${before.rows})`).toBeGreaterThanOrEqual(before.rows);
  expect(after.vectors, `${label}: stats vector primitives dropped (${after.vectors} < ${before.vectors})`).toBeGreaterThanOrEqual(before.vectors);
  expect(after.textLen, `${label}: restored stats have no text`).toBeGreaterThan(0);
  if (requiredText) {
    expect(after.textSignature, `${label}: restored stats lost required semantic facts`).toMatch(requiredText);
  }
  expect(after.exportDropdowns, `${label}: stats export controls dropped (${after.exportDropdowns} < ${before.exportDropdowns})`).toBeGreaterThanOrEqual(before.exportDropdowns);
  if (before.pValues.length) {
    const missing = before.pValues.filter(value => {
      const expected = Number(value);
      return !after.pValues.some(candidate => {
        const actual = Number(candidate);
        if (!Number.isFinite(expected) || !Number.isFinite(actual)) {
          return candidate === value;
        }
        const tolerance = Math.max(Number.MIN_VALUE, Math.abs(expected) * 1e-5);
        return Math.abs(actual - expected) <= tolerance;
      });
    });
    expect(
      missing,
      `${label}: restored stats lost p-value facts; before=${JSON.stringify(before.pValues)} after=${JSON.stringify(after.pValues)}`
    ).toEqual([]);
  }
}

// Assert the restored stats-table Download/Copy controls are live (their menu opens), not
// dead/mangled markup. No-op for components without stats-table export controls.
async function expectExportControlsLive(page, containers, label) {
  const result = await page.evaluate(exportControlLivenessInPage, containers);
  if (!result.controls) { return; }
  expect(result.opened, `${label}: restored stats export control did not open its menu`).toBe(true);
  expect(result.items, `${label}: restored stats export menu has no items`).toBeGreaterThan(0);
}

async function seedRecoverySnapshot(page) {
  await page.evaluate(async () => {
    const openWebDb = () => new Promise((resolve, reject) => {
      const request = window.indexedDB.open('graphitix-document-state', 2);
      request.onupgradeneeded = () => { const db = request.result; if (!db.objectStoreNames.contains('snapshots')) { db.createObjectStore('snapshots'); } };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const db = await openWebDb();
    window.localStorage.removeItem('graphitix.canonical-journal.v1');
    const ws = window.Main?.session?.workspaceState || {};
    const graphTabs = (ws.tabs || []).filter(t => t && !t.isWelcome && t.type);
    const ctx = window.Main.tabs.getSessionActionsContext();
    const blob = await window.Main.sessionActions.buildWorkspaceArchiveBlob(ctx, { scope: 'workspace', snapshotKind: 'recovery', policyMode: 'recovery', reason: 'recovery-interval', useWorker: true });
    await new Promise((resolve, reject) => {
      const stores = ['snapshots'];
      if (db.objectStoreNames.contains('canonical-journal')) {
        stores.push('canonical-journal');
      }
      const tx = db.transaction(stores, 'readwrite');
      if (stores.includes('canonical-journal')) {
        tx.objectStore('canonical-journal').clear();
      }
      tx.objectStore('snapshots').put({
        meta: { app: 'Graphitix', kind: 'recovery', version: 1, savedAt: new Date().toISOString(), updatedAt: Date.now(), reason: 'recovery-interval', dirty: true, hasData: true, tabCount: graphTabs.length, fileName: 'workspace.graph', fileScope: 'workspace' },
        blob
      }, 'active-recovery');
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  });
}

for (const c of CASES) {
  test(`${c.key} stats survive file reopen`, async ({ page }) => {
    test.setTimeout(180_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);

    await buildAndCompute(page, c);
    if (c.key === 'survival') {
      await expect.poll(() => page.evaluate(survivalPValueFormatPlacementInPage), { timeout: 20_000 })
        .toMatchObject({ hostVisible: true, beforeLogRank: true, nestedControls: 0, topLevelControls: 1 });
    }
    const pValueFormatBefore = await enableScientificPValueFormat(page, c.containers);
    const before = await page.evaluate(statsRichnessInPage, c.containers);
    const rocBefore = c.key === 'roc' ? await captureRocStatsPersistenceState(page) : null;
    const archivePath = await captureArchive(page, `contract-${c.key}-reopen`);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
    await page.locator('#workspaceSessionInput').setInputFiles(archivePath);
    await waitForDocumentOpenComplete(page);
    await expect(page.locator(`#${c.pageId}:not([hidden])`)).toBeVisible({ timeout: 30_000 });
    await waitForComponentOwnerReady(page, { type: c.key, pageId: c.pageId }, { requireMountedRoot: true });
    await expect
      .poll(async () => (await page.evaluate(statsRichnessInPage, c.containers)).textLen, { timeout: 30_000 })
      .toBeGreaterThan(0);

    const after = await page.evaluate(statsRichnessInPage, c.containers);
    expectNoStatsLoss(before, after, `${c.key} reopen`, c.requiredStatsText);
    if (c.key === 'survival') {
      await expect.poll(() => page.evaluate(survivalPValueFormatPlacementInPage), { timeout: 20_000 })
        .toMatchObject({ hostVisible: true, beforeLogRank: true, nestedControls: 0, topLevelControls: 1 });
    }
    if (pValueFormatBefore.available) {
      await expect.poll(() => page.evaluate(pValueFormatStateInPage, c.containers), { timeout: 25_000 })
        .toMatchObject({ available: true, selectValue: 'scientific', reporting: true, payload: true });
    }
    if (c.key === 'roc') {
      expect(await captureRocStatsPersistenceState(page)).toStrictEqual(rocBefore);
    }
    await expectExportControlsLive(page, c.containers, `${c.key} reopen`);
    expect(issues.critical.filter(e => e.kind !== 'requestfailed')).toEqual([]);
  });

  if (c.recovery) {
    test(`${c.key} stats survive crash recovery`, async ({ page }) => {
      test.setTimeout(180_000);
      const issues = registerIssueCollectors(page);
      await installLocalCdnOverrides(page);

      await buildAndCompute(page, c);
      const before = await page.evaluate(statsRichnessInPage, c.containers);
      const rocBefore = c.key === 'roc' ? await captureRocStatsPersistenceState(page) : null;
      await seedRecoverySnapshot(page);

      let recoveryDialogAccepted = false;
      const handler = async d => {
        if (d.type() === 'beforeunload') {
          await d.accept();
          return;
        }
        if (!/recover|restore/i.test(d.message())) {
          await d.dismiss();
          return;
        }
        await d.accept();
        recoveryDialogAccepted = true;
      };
      page.on('dialog', handler);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect.poll(() => recoveryDialogAccepted, {
        timeout: 30_000,
        message: 'crash recovery should offer the seeded dirty snapshot'
      }).toBe(true);
      page.off('dialog', handler);
      await activateComponentTab(page, c.key);
      await expect(page.locator(`#${c.pageId}:not([hidden])`)).toBeVisible({ timeout: 30_000 });
      await expect
        .poll(async () => (await page.evaluate(statsRichnessInPage, c.containers)).textLen, { timeout: 30_000 })
        .toBeGreaterThan(0);

      const after = await page.evaluate(statsRichnessInPage, c.containers);
      expectNoStatsLoss(before, after, `${c.key} recovery`, c.requiredStatsText);
      if (c.key === 'roc') {
        expect(await captureRocStatsPersistenceState(page)).toStrictEqual(rocBefore);
      }
      await expectExportControlsLive(page, c.containers, `${c.key} recovery`);
      expect(issues.critical.filter(e => e.kind !== 'requestfailed')).toEqual([]);
    });
  }
}
