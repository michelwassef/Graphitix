/**
 * Regression guards for venn restore/recovery and live-redraw behaviour:
 *  1. The GO analysis chart must be drawable when its tab becomes visible (it is sized from
 *     layout width, so a chart drawn while the GO tab was hidden used to render 0-width) and
 *     must come back after a file reopen.
 *  2. Switching overlap groups must refresh the gene list after a reopen (region Sets are
 *     derived state that the cache cannot carry and must be rebuilt from the data on demand).
 *  3. Undoing a table edit must redraw the diagram (the table's draw callback was a no-op,
 *     so only direct edits — not undo/redo/fill — updated the graph).
 *
 * These need a real browser (layout-driven canvas sizing, live undo wiring).
 */
const fs = require('fs'); const path = require('path');
const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides, registerIssueCollectors, openComponentFromWelcome, clickExampleButtonIfPresent } = require('./helpers/workspaceHarness');
const TMP = path.resolve(__dirname, '.tmp');

const GENES = {
  A: ['BRCA1', 'ATM', 'BAP1', 'EZH2', 'SUZ12', 'RING1B'],
  B: ['BRCA1', 'BAP1', 'RING1B', 'CBX2', 'HDAC1', 'PAXIP1', 'HUWE1'],
  C: ['BRCA1', 'PAXIP1', 'CSNK2A1', 'RING1B', 'KAT7']
};

async function buildVenn(page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await openComponentFromWelcome(page, { type: 'venn', pageId: 'vennPage', exampleButtonId: 'sample' }, { first: true });
  await page.waitForFunction(() => !!window.Components?.venn?.ready, null, { timeout: 30_000 });
  await clickExampleButtonIfPresent(page, 'sample');
  await page.waitForFunction(() => !!document.getElementById('stage'), null, { timeout: 30_000 });
  await page.waitForTimeout(800);
}

// Inject GO + STRING analysis results into the payload (no external API needed) and reload.
async function injectAnalysis(page) {
  await page.evaluate((genes) => {
    const venn = window.Components.venn;
    const payload = venn.getPayload();
    payload.data = payload.data || {};
    payload.data.labelA = 'Transcriptomic'; payload.data.labelB = 'Proteomic'; payload.data.labelC = 'Phospho';
    payload.data.listA = genes.A.join('\n'); payload.data.listB = genes.B.join('\n'); payload.data.listC = genes.C.join('\n');
    payload.analysis = payload.analysis || {};
    payload.analysis.goPerformed = true;
    payload.analysis.goOrganism = 'hsapiens';
    payload.analysis.goFormatted = genes.A;
    payload.analysis.goResult = [
      { term_name: 'chromatin silencing complex', source: 'GO:CC', p_value: 0.0002 },
      { term_name: 'ESC/E(Z) complex', source: 'GO:CC', p_value: 0.0003 },
      { term_name: 'facultative heterochromatin formation', source: 'GO:BP', p_value: 0.0006 },
      { term_name: 'lncRNA binding', source: 'GO:MF', p_value: 0.0016 },
      { term_name: 'PcG protein complex', source: 'GO:CC', p_value: 0.0028 }
    ];
    payload.analysis.stringPerformed = true;
    payload.analysis.stringSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><circle cx="60" cy="60" r="30" fill="#4daf4a"/></svg>';
    payload.analysis.activeResultsTab = 'string';
    venn.loadFromPayload(payload, { reason: 'e2e-inject-analysis' });
  }, GENES);
  await page.waitForTimeout(600);
}

function goChartState() {
  const c = document.getElementById('goChart');
  if (!c) return { exists: false };
  return { exists: true, width: c.width, offsetWidth: c.offsetWidth, hidden: getComputedStyle(c).display === 'none' };
}
async function switchAnalysisTab(page, which) {
  await page.evaluate((w) => { const b = document.getElementById(w === 'go' ? 'analysisTabGo' : 'analysisTabString'); if (b) b.click(); }, which);
  await page.waitForTimeout(400);
}
async function captureArchive(page, stem) {
  const a = await page.evaluate(async () => {
    const ctx = window.Main.tabs.getSessionActionsContext();
    const blob = await window.Main.sessionActions.buildWorkspaceArchiveBlob(ctx, { scope: 'workspace', snapshotKind: 'document-snapshot', compression: 'STORE', reason: 'e2e-venn' });
    const by = new Uint8Array(await blob.arrayBuffer()); let s = '';
    for (let i = 0; i < by.length; i += 0x8000) s += String.fromCharCode.apply(null, by.subarray(i, i + 0x8000));
    return btoa(s);
  });
  fs.mkdirSync(TMP, { recursive: true }); const p = path.join(TMP, `${stem}.graph`); fs.writeFileSync(p, Buffer.from(a, 'base64')); return p;
}
async function reopen(page, archivePath) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await page.locator('#workspaceSessionInput').setInputFiles(archivePath);
  await page.waitForTimeout(1000);
  await page.evaluate(async () => { const sa = window.Main?.sessionActions; if (sa?.awaitPostLoadWarmup) await sa.awaitPostLoadWarmup({ timeoutMs: 60_000, reason: 'e2e-venn' }); });
  await page.waitForSelector('#vennPage:not([hidden])', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(1000);
}

test('venn GO chart renders on tab switch and survives reopen', async ({ page }) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page); await installLocalCdnOverrides(page);
  await buildVenn(page);
  await injectAnalysis(page); // leaves the STRING tab active

  await switchAnalysisTab(page, 'go');
  await expect.poll(async () => (await page.evaluate(goChartState)).width, { timeout: 10_000 }).toBeGreaterThan(0);
  const live = await page.evaluate(goChartState);
  expect(live.hidden, 'GO chart should be visible after switching to the GO tab').toBe(false);

  await switchAnalysisTab(page, 'string');
  const archivePath = await captureArchive(page, 'venn-go-reopen');
  await reopen(page, archivePath);
  await switchAnalysisTab(page, 'go');
  await expect.poll(async () => (await page.evaluate(goChartState)).width, { timeout: 10_000 }).toBeGreaterThan(0);
  const restored = await page.evaluate(goChartState);
  expect(restored.hidden, 'GO chart should be visible after reopen + GO tab').toBe(false);
  expect(issues.critical.filter(e => e.kind !== 'requestfailed')).toEqual([]);
});

test('venn overlap-group switching refreshes the gene list after reopen', async ({ page }) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page); await installLocalCdnOverrides(page);
  await buildVenn(page);
  const archivePath = await captureArchive(page, 'venn-region-reopen');
  await reopen(page, archivePath);
  const result = await page.evaluate(async () => {
    const sel = document.getElementById('regionSelect') || document.querySelector('#vennPage select');
    const list = document.getElementById('regionList');
    const readList = () => (list ? (list.textContent || '').trim() : '');
    const setOption = (val) => { sel.value = val; sel.dispatchEvent(new Event('change', { bubbles: true })); };
    const opts = Array.from(sel?.options || []).map(o => o.value);
    setOption(opts[0]); await new Promise(r => setTimeout(r, 200)); const first = readList();
    const other = opts.find(o => o !== opts[0]) || opts[0];
    setOption(other); await new Promise(r => setTimeout(r, 200)); const second = readList();
    return { first, second };
  });
  expect(result.first.length, 'first overlap group should list genes after reopen').toBeGreaterThan(0);
  expect(result.second.length, 'second overlap group should list genes after reopen').toBeGreaterThan(0);
  expect(result.second, 'switching overlap groups should change the gene list').not.toBe(result.first);
  expect(issues.critical.filter(e => e.kind !== 'requestfailed')).toEqual([]);
});

test('venn undo redraws the diagram', async ({ page }) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page); await installLocalCdnOverrides(page);
  await buildVenn(page);
  const sig = () => { const svg = document.getElementById('stage'); return svg ? (svg.innerHTML || '').length : 0; };
  const before = await page.evaluate(sig);
  await page.evaluate(() => {
    const hot = window.Components.venn.__getState?.()?.ui?.hot || null;
    if (hot && typeof hot.setDataAtCell === 'function') { hot.setDataAtCell(1, 0, ''); }
  });
  await page.waitForTimeout(700);
  const afterDelete = await page.evaluate(sig);
  expect(afterDelete, 'deleting a cell should redraw the diagram').not.toBe(before);

  await page.evaluate(() => window.Shared?.undoManager?.undo?.());
  await page.waitForTimeout(700);
  const afterUndo = await page.evaluate(sig);
  expect(afterUndo, 'undo should redraw the diagram').not.toBe(afterDelete);
  expect(issues.critical.filter(e => e.kind !== 'requestfailed')).toEqual([]);
});
