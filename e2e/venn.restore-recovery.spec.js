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

async function getWorkspaceTabIds(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]'))
      .map(tab => String(tab.getAttribute('data-tab-id') || '').trim())
      .filter(id => id && id !== 'welcome')
  );
}

async function activateTabById(page, tabId) {
  const tab = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).first();
  await expect(tab).toBeVisible({ timeout: 20_000 });
  await tab.click({ force: true });
  await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, tabId, { timeout: 20_000 });
  await page.waitForSelector('#vennPage:not([hidden]) #stage', { timeout: 30_000 });
  await page.waitForTimeout(300);
}

async function buildVenn(page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await openComponentFromWelcome(page, { type: 'venn', pageId: 'vennPage', exampleButtonId: 'sample' }, { first: true });
  await page.waitForFunction(() => !!window.Components?.venn?.ready, null, { timeout: 30_000 });
  await clickExampleButtonIfPresent(page, 'sample');
  await page.waitForFunction(() => !!document.getElementById('stage'), null, { timeout: 30_000 });
  await page.waitForTimeout(800);
}

async function openAdditionalVenn(page) {
  const before = new Set(await getWorkspaceTabIds(page));
  await openComponentFromWelcome(page, { type: 'venn', pageId: 'vennPage', exampleButtonId: 'sample' });
  await page.waitForFunction(() => !!window.Components?.venn?.ready, null, { timeout: 30_000 });
  await clickExampleButtonIfPresent(page, 'sample');
  await page.waitForTimeout(800);
  const after = await getWorkspaceTabIds(page);
  const tabId = after.find(id => !before.has(id));
  expect(tabId).toBeTruthy();
  return tabId;
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
    payload.analysis.stringEnrichment = [{ termDescription: 'chromatin protein binding', fdr: 0.002 }];
    payload.analysis.activeResultsTab = 'string';
    venn.loadFromPayload(payload, { reason: 'e2e-inject-analysis' });
  }, GENES);
  await page.waitForTimeout(600);
}

function goChartState() {
  const c = document.getElementById('goChart');
  if (!c) return { exists: false };
  return { exists: true, width: c.getBoundingClientRect().width, offsetWidth: c.offsetWidth, hidden: getComputedStyle(c).display === 'none' };
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

async function installButtonRunAnalysisMocks(page) {
  await page.evaluate(() => {
    const pending = window.__vennButtonRunMocks = {
      go: [],
      network: [],
      enrichment: []
    };
    const deferred = (kind, request) => {
      let resolve;
      let reject;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
      pending[kind].push({ request, resolve, reject });
      return promise;
    };
    window.Shared.goAnalysis = {
      profile(options) {
        return deferred('go', {
          genes: options.genes || [],
          organism: options.organism || ''
        });
      }
    };
    window.Shared.stringAnalysis = {
      resolveSpeciesCode(org, fallback) {
        return fallback || ({ hsapiens: '9606', mmusculus: '10090' }[org] || '9606');
      },
      fetchNetwork(options) {
        return deferred('network', {
          genes: options.genes || [],
          species: options.species || ''
        });
      },
      fetchEnrichment(options) {
        return deferred('enrichment', {
          genes: options.genes || [],
          species: options.species || ''
        });
      }
    };
  });
}

async function runGoStringFromButtons(page, label = 'button-run') {
  await installButtonRunAnalysisMocks(page);
  await page.evaluate(value => {
    window.__vennButtonRunLabel = value;
  }, label);
  await page.evaluate(() => {
    const root = document.querySelector('#vennPage:not([hidden])');
    if (!root) throw new Error('Active Venn root not found');
    const species = root.querySelector('#speciesSelect');
    species.value = 'hsapiens';
    species.dispatchEvent(new Event('change', { bubbles: true }));
    root.querySelector('#goBtn').click();
    root.querySelector('#stringBtn').click();
  });
  await page.waitForFunction(() => {
    const mocks = window.__vennButtonRunMocks;
    return !!(mocks?.go?.length && mocks?.network?.length);
  }, null, { timeout: 10_000 });
  await page.evaluate(() => {
    const mocks = window.__vennButtonRunMocks;
    const label = window.__vennButtonRunLabel || 'button-run';
    mocks.go[0].resolve({
      result: [
        { term_name: `${label} GO term`, name: `${label} GO term`, p_value: 0.0001, source: 'GO:BP' }
      ]
    });
    mocks.network[0].resolve({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><text x="8" y="28">${label} STRING network</text></svg>`
    });
  });
  await page.waitForFunction(() => !!window.__vennButtonRunMocks?.enrichment?.length, null, { timeout: 10_000 });
  await page.evaluate(() => {
    const enrichment = window.__vennButtonRunMocks.enrichment[0];
    const label = window.__vennButtonRunLabel || 'button-run';
    enrichment.resolve({
      items: [
        { termDescription: `${label} STRING enrichment`, fdr: 0.002 }
      ]
    });
  });
  await expect.poll(async () => page.evaluate(() => {
    const root = document.querySelector('#vennPage:not([hidden])');
    return {
      go: root?.querySelector('#goResults')?.textContent || '',
      string: root?.querySelector('#stringResults')?.textContent || '',
      network: root?.querySelector('#stringNetwork')?.textContent || ''
    };
  }), { timeout: 15_000 }).toMatchObject({
    go: expect.stringContaining(`${label} GO term`),
    string: expect.stringContaining(`${label} STRING enrichment`),
    network: expect.stringContaining(`${label} STRING network`)
  });
}

async function clickAndReadAnalysisTabs(page) {
  return page.evaluate(async () => {
    const root = document.querySelector('#vennPage:not([hidden])');
    const click = async selector => {
      root.querySelector(selector)?.click();
      await new Promise(resolve => setTimeout(resolve, 250));
    };
    await click('#analysisTabGo');
    const afterGo = {
      go: root.querySelector('#goResults')?.textContent || '',
      string: root.querySelector('#stringResults')?.textContent || '',
      network: root.querySelector('#stringNetwork')?.textContent || ''
    };
    await click('#analysisTabString');
    const afterString = {
      go: root.querySelector('#goResults')?.textContent || '',
      string: root.querySelector('#stringResults')?.textContent || '',
      network: root.querySelector('#stringNetwork')?.textContent || ''
    };
    const tab = window.Main?.tabs?.getActiveTab?.();
    return {
      afterGo,
      afterString,
      payloadGo: (tab?.payload?.analysis?.goResult || []).map(item => item.term_name || item.name || ''),
      payloadString: (tab?.payload?.analysis?.stringEnrichment || []).map(item => item.termDescription || item.description || ''),
      payloadStringSvg: tab?.payload?.analysis?.stringSvg || ''
    };
  });
}

async function findRestoredVennTabByGoTerm(page, term) {
  return page.evaluate(expected => {
    const tabs = window.Main?.session?.workspaceState?.tabs || [];
    const match = tabs.find(tab => {
      if (!tab || tab.type !== 'venn') return false;
      const terms = (tab.payload?.analysis?.goResult || []).map(item => item.term_name || item.name || '');
      return terms.includes(expected);
    });
    return match?.id || null;
  }, term);
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

test('venn button-run GO and STRING survive archive reopen and result-tab clicks', async ({ page }) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page); await installLocalCdnOverrides(page);
  await buildVenn(page);
  await runGoStringFromButtons(page);
  const archivePath = await captureArchive(page, 'venn-button-run-go-string-reopen');
  await reopen(page, archivePath);

  const restored = await clickAndReadAnalysisTabs(page);

  expect(restored.afterGo.go).toContain('button-run GO term');
  expect(restored.afterString.go).toContain('button-run GO term');
  expect(restored.afterString.string).toContain('button-run STRING enrichment');
  expect(restored.afterString.network).toContain('button-run STRING network');
  expect(restored.payloadGo).toContain('button-run GO term');
  expect(restored.payloadString).toContain('button-run STRING enrichment');
  expect(restored.payloadStringSvg).toContain('button-run STRING network');
  expect(issues.critical.filter(e => e.kind !== 'requestfailed')).toEqual([]);
});

test('venn result-tab clicks heal stale analysis payload from session after restore', async ({ page }) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page); await installLocalCdnOverrides(page);
  await buildVenn(page);
  await runGoStringFromButtons(page, 'DRIFT');
  const archivePath = await captureArchive(page, 'venn-stale-analysis-payload-reopen');
  await reopen(page, archivePath);

  const restored = await page.evaluate(async () => {
    const Main = window.Main;
    const venn = window.Components?.venn;
    const tab = Main?.tabs?.getActiveTab?.();
    const stalePayload = Main.session.clonePayload(tab.payload);
    stalePayload.analysis = venn.createEmptyPayload().analysis;
    tab.payload = stalePayload;
    tab.payloadSignature = Main.session.serializePayloadSignature(stalePayload);
    const root = document.querySelector('#vennPage:not([hidden])');
    root.querySelector('#analysisTabGo')?.click();
    await new Promise(resolve => setTimeout(resolve, 250));
    root.querySelector('#analysisTabString')?.click();
    await new Promise(resolve => setTimeout(resolve, 250));
    const ownerSession = venn.__testHooks.getSession(tab.id);
    return {
      go: root.querySelector('#goResults')?.textContent || '',
      string: root.querySelector('#stringResults')?.textContent || '',
      network: root.querySelector('#stringNetwork')?.textContent || '',
      payloadGo: (tab.payload?.analysis?.goResult || []).map(item => item.term_name || item.name || ''),
      payloadString: (tab.payload?.analysis?.stringEnrichment || []).map(item => item.termDescription || item.description || ''),
      payloadSvg: tab.payload?.analysis?.stringSvg || '',
      sessionGo: (ownerSession?.results?.lastGOResult || []).map(item => item.term_name || item.name || ''),
      sessionString: (ownerSession?.results?.lastStringEnrichment || []).map(item => item.termDescription || item.description || '')
    };
  });

  expect(restored.go).toContain('DRIFT GO term');
  expect(restored.string).toContain('DRIFT STRING enrichment');
  expect(restored.network).toContain('DRIFT STRING network');
  expect(restored.payloadGo).toContain('DRIFT GO term');
  expect(restored.payloadString).toContain('DRIFT STRING enrichment');
  expect(restored.payloadSvg).toContain('DRIFT STRING network');
  expect(restored.sessionGo).toContain('DRIFT GO term');
  expect(restored.sessionString).toContain('DRIFT STRING enrichment');
  expect(issues.critical.filter(e => e.kind !== 'requestfailed')).toEqual([]);
});

test('venn restored GO and STRING survive first graph redraw before result-tab clicks', async ({ page }) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page); await installLocalCdnOverrides(page);
  await buildVenn(page);
  await runGoStringFromButtons(page, 'REDRAW');
  const archivePath = await captureArchive(page, 'venn-go-string-redraw-before-tabs');
  await reopen(page, archivePath);

  const restored = await page.evaluate(async () => {
    const venn = window.Components?.venn;
    const state = venn?.__getState?.();
    state.analysis.lastRegionSignature = null;
    state.analysis.lastRegionCode = null;
    venn.refreshDiagram();
    await new Promise(resolve => setTimeout(resolve, 350));
    const root = document.querySelector('#vennPage:not([hidden])');
    root.querySelector('#analysisTabGo')?.click();
    await new Promise(resolve => setTimeout(resolve, 250));
    const afterGo = {
      go: root.querySelector('#goResults')?.textContent || '',
      string: root.querySelector('#stringResults')?.textContent || '',
      network: root.querySelector('#stringNetwork')?.textContent || ''
    };
    root.querySelector('#analysisTabString')?.click();
    await new Promise(resolve => setTimeout(resolve, 250));
    const tab = window.Main?.tabs?.getActiveTab?.();
    return {
      afterGo,
      afterString: {
        go: root.querySelector('#goResults')?.textContent || '',
        string: root.querySelector('#stringResults')?.textContent || '',
        network: root.querySelector('#stringNetwork')?.textContent || ''
      },
      payloadGo: (tab?.payload?.analysis?.goResult || []).map(item => item.term_name || item.name || ''),
      payloadString: (tab?.payload?.analysis?.stringEnrichment || []).map(item => item.termDescription || item.description || ''),
      payloadSvg: tab?.payload?.analysis?.stringSvg || ''
    };
  });

  expect(restored.afterGo.go).toContain('REDRAW GO term');
  expect(restored.afterString.go).toContain('REDRAW GO term');
  expect(restored.afterString.string).toContain('REDRAW STRING enrichment');
  expect(restored.afterString.network).toContain('REDRAW STRING network');
  expect(restored.payloadGo).toContain('REDRAW GO term');
  expect(restored.payloadString).toContain('REDRAW STRING enrichment');
  expect(restored.payloadSvg).toContain('REDRAW STRING network');
  expect(issues.critical.filter(e => e.kind !== 'requestfailed')).toEqual([]);
});

test('two button-run venn tabs keep GO and STRING after archive reopen and result-tab clicks', async ({ page }) => {
  test.setTimeout(240_000);
  const issues = registerIssueCollectors(page); await installLocalCdnOverrides(page);
  await buildVenn(page);
  await runGoStringFromButtons(page, 'ALPHA');
  await openAdditionalVenn(page);
  await runGoStringFromButtons(page, 'BETA');
  const archivePath = await captureArchive(page, 'venn-two-button-run-go-string-reopen');
  await reopen(page, archivePath);

  const alphaTabId = await findRestoredVennTabByGoTerm(page, 'ALPHA GO term');
  const betaTabId = await findRestoredVennTabByGoTerm(page, 'BETA GO term');
  expect(alphaTabId).toBeTruthy();
  expect(betaTabId).toBeTruthy();
  expect(alphaTabId).not.toBe(betaTabId);

  await activateTabById(page, alphaTabId);
  const alpha = await clickAndReadAnalysisTabs(page);
  await activateTabById(page, betaTabId);
  const beta = await clickAndReadAnalysisTabs(page);

  expect(alpha.afterString.go).toContain('ALPHA GO term');
  expect(alpha.afterString.string).toContain('ALPHA STRING enrichment');
  expect(alpha.afterString.network).toContain('ALPHA STRING network');
  expect(alpha.afterString.go).not.toContain('BETA GO term');
  expect(alpha.payloadGo).toContain('ALPHA GO term');
  expect(alpha.payloadString).toContain('ALPHA STRING enrichment');

  expect(beta.afterString.go).toContain('BETA GO term');
  expect(beta.afterString.string).toContain('BETA STRING enrichment');
  expect(beta.afterString.network).toContain('BETA STRING network');
  expect(beta.afterString.go).not.toContain('ALPHA GO term');
  expect(beta.payloadGo).toContain('BETA GO term');
  expect(beta.payloadString).toContain('BETA STRING enrichment');
  expect(issues.critical.filter(e => e.kind !== 'requestfailed')).toEqual([]);
});

test('venn restored GO and STRING survive recovery lifecycle capture', async ({ page }) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page); await installLocalCdnOverrides(page);
  await buildVenn(page);
  await injectAnalysis(page);
  const archivePath = await captureArchive(page, 'venn-go-string-lifecycle-reopen');
  await reopen(page, archivePath);

  const restored = await page.evaluate(async () => {
    const venn = window.Components?.venn;
    const state = venn?.__getState?.();
    const tab = window.Main?.tabs?.getActiveTab?.();
    state.analysis.lastGOResult = null;
    state.analysis.lastGOFormatted = ['STALE_ONLY'];
    state.analysis.lastGOOrganism = 'mmusculus';
    state.analysis.lastStringSVG = '';
    state.analysis.lastStringEnrichment = null;
    state.analysis.goPerformed = false;
    state.analysis.stringPerformed = false;
    window.Main.session.persistActiveTabState(tab, {
      reason: 'recovery-restored',
      origin: 'lifecycle',
      forcePreviewCapture: false,
      snapshotIntent: {
        lifecycleSnapshot: true,
        captureLivePayload: true,
        allowSkipLivePayloadCapture: false,
        reasonSkippable: false,
        snapshotCapture: true
      }
    });
    state.ui.analysisTabGo.click();
    await new Promise(resolve => setTimeout(resolve, 150));
    state.ui.analysisTabString.click();
    await new Promise(resolve => setTimeout(resolve, 150));
    return {
      goText: state.ui.goResults.textContent || '',
      stringText: state.ui.stringResults.textContent || '',
      networkHtml: state.ui.stringNetwork.innerHTML || '',
      goResult: tab.payload?.analysis?.goResult || null,
      stringEnrichment: tab.payload?.analysis?.stringEnrichment || null,
      stringSvg: tab.payload?.analysis?.stringSvg || ''
    };
  });

  expect(restored.goText).toContain('chromatin silencing complex');
  expect(restored.stringText).toContain('chromatin protein binding');
  expect(restored.networkHtml).toContain('svg');
  expect(restored.goResult?.map(item => item.term_name)).toContain('chromatin silencing complex');
  expect(restored.stringEnrichment?.map(item => item.termDescription)).toContain('chromatin protein binding');
  expect(restored.stringSvg).toContain('svg');
  expect(issues.critical.filter(e => e.kind !== 'requestfailed')).toEqual([]);
});

test('venn legacy restored payload is normalized before recovery persist', async ({ page }) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page); await installLocalCdnOverrides(page);
  await buildVenn(page);

  const result = await page.evaluate(async () => {
    const Main = window.Main;
    const venn = window.Components?.venn;
    const tab = Main?.tabs?.getActiveTab?.();
    Main.session.persistActiveTabState(tab, {
      reason: 'archive-save',
      forcePreviewCapture: false
    });
    const restoredPayload = Main.session.clonePayload(tab.payload);
    ['nA', 'nB', 'nC', 'nAB', 'nAC', 'nBC', 'nABC'].forEach(key => {
      if (restoredPayload.data) delete restoredPayload.data[key];
    });
    if (restoredPayload.meta && typeof restoredPayload.meta === 'object') {
      delete restoredPayload.meta.graphSizing;
      if (!Object.keys(restoredPayload.meta).length) delete restoredPayload.meta;
    }
    const restoredLayout = Main.session.clonePayload(tab.layoutState);
    tab.payload = restoredPayload;
    tab.payloadSignature = Main.session.serializePayloadSignature(restoredPayload);
    tab.layoutState = restoredLayout;
    tab.layoutSignature = Main.session.serializePayloadSignature(restoredLayout);
    tab.userModified = false;
    tab.payloadDirty = false;
    Main.session.workspaceState.loadedWorkspaces[tab.id] = {
      tabId: tab.id,
      type: tab.type,
      payloadSignature: tab.payloadSignature,
      layoutSignature: tab.layoutSignature
    };
    const driftLogs = [];
    const originalDebug = console.debug;
    console.debug = function patchedDebug(...args) {
      if (String(args[0] || '').includes('payload drift observed')) driftLogs.push(args);
      return originalDebug.apply(this, args);
    };
    try {
      venn.loadFromPayload(restoredPayload, {
        tabId: tab.id,
        skipDraw: true,
        recordUndo: false,
        source: 'e2e-legacy-schema'
      });
      Main.session.persistActiveTabState(tab, {
        reason: 'recovery-restored',
        origin: 'lifecycle',
        forcePreviewCapture: false,
        snapshotIntent: {
          lifecycleSnapshot: true,
          captureLivePayload: true,
          allowSkipLivePayloadCapture: false,
          reasonSkippable: false,
          snapshotCapture: true
        }
      });
    } finally {
      console.debug = originalDebug;
    }
    return {
      driftCount: driftLogs.length,
      hasGraphSizing: !!tab.payload?.meta?.graphSizing,
      hasCounts: !!tab.payload?.data?.nA
    };
  });

  expect(result.driftCount).toBe(0);
  expect(result.hasGraphSizing).toBe(true);
  expect(result.hasCounts).toBe(true);
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
