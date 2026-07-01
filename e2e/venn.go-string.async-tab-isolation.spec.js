const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

async function getWorkspaceTabIds(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]'))
      .map(tab => String(tab.getAttribute('data-tab-id') || '').trim())
      .filter(id => id && id !== 'welcome')
  );
}

async function openVennTab(page, { first = false } = {}) {
  const before = new Set(await getWorkspaceTabIds(page));
  await openComponentFromWelcome(page, { type: 'venn', pageId: 'vennPage', exampleButtonId: 'sample' }, { first });
  await page.waitForFunction(() => !!window.Components?.venn?.ready, null, { timeout: 45_000 });
  const after = await getWorkspaceTabIds(page);
  const tabId = after.find(id => !before.has(id));
  expect(tabId).toBeTruthy();
  return tabId;
}

async function activateTabById(page, tabId) {
  const tab = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).first();
  await expect(tab).toBeVisible({ timeout: 20_000 });
  await tab.click({ force: true });
  await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, tabId, { timeout: 20_000 });
  await page.waitForSelector('#vennPage:not([hidden]) #stage', { timeout: 30_000 });
  await page.waitForTimeout(250);
}

async function configureVennTab(page, config) {
  await page.evaluate(cfg => {
    const root = document.querySelector('#vennPage:not([hidden])');
    if (!root) throw new Error('Active Venn root not found');
    const setValue = (selector, value) => {
      const node = root.querySelector(selector);
      if (!node) throw new Error(`Missing ${selector}`);
      node.value = value;
      node.dispatchEvent(new Event('input', { bubbles: true }));
      node.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setValue('#labelA', cfg.label);
    setValue('#listA', cfg.genes.join('\n'));
    setValue('#listB', cfg.genes.slice(0, 1).join('\n'));
    setValue('#listC', '');
    setValue('#speciesSelect', cfg.species);
    const plotType = root.querySelector('#vennPlotType');
    if (plotType) {
      plotType.value = 'venn';
      plotType.dispatchEvent(new Event('change', { bubbles: true }));
    }
    window.Components?.venn?.drawFromLists?.();
  }, config);
  await page.waitForTimeout(600);
}

async function installMockAnalysisServices(page) {
  await page.route('https://mygene.info/v3/query**', async route => {
    const url = new URL(route.request().url());
    const q = String(url.searchParams.get('q') || '').toUpperCase();
    const taxid = q.includes('BETA') ? 10090 : 9606;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ hits: [{ symbol: q, taxid }] })
    });
  });
  await page.evaluate(() => {
    const pending = window.__vennAsyncMocks = {
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
      const entry = { request, resolve, reject };
      pending[kind].push(entry);
      return promise;
    };
    window.Shared.goAnalysis = {
      profile(options) {
        return deferred('go', {
          genes: options.genes,
          organism: options.organism,
          sources: options.sources
        });
      }
    };
    window.Shared.stringAnalysis = {
      resolveSpeciesCode(org, fallback) {
        return fallback || ({ hsapiens: '9606', mmusculus: '10090' }[org] || '9606');
      },
      fetchNetwork(options) {
        return deferred('network', {
          genes: options.genes,
          species: options.species
        });
      },
      fetchEnrichment(options) {
        return deferred('enrichment', {
          genes: options.genes,
          species: options.species
        });
      }
    };
  });
}

async function runGoAndString(page, tabId, config) {
  await activateTabById(page, tabId);
  await page.evaluate(cfg => {
    const root = document.querySelector('#vennPage:not([hidden])');
    const species = root.querySelector('#speciesSelect');
    species.value = cfg.species;
    species.dispatchEvent(new Event('change', { bubbles: true }));
    root.querySelectorAll('.goCategory').forEach(input => {
      input.checked = true;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    root.querySelectorAll('.stringSource').forEach(input => {
      input.checked = true;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    window.Components.venn.runGOAnalysis(cfg.genes, cfg.species);
    window.Components.venn.runStringAnalysis(cfg.genes, cfg.species);
  }, config);
  await page.waitForFunction(
    label => {
      const mocks = window.__vennAsyncMocks;
      if (!mocks) return false;
      const has = entries => entries.some(entry => (entry.request.genes || []).some(gene => String(gene).includes(label)));
      return has(mocks.go) && has(mocks.network);
    },
    config.label,
    { timeout: 10_000 }
  );
  await page.waitForTimeout(250);
}

async function resolveMockResults(page, label) {
  await page.evaluate(resultLabel => {
    const mocks = window.__vennAsyncMocks;
    const findByLabel = entries => entries.find(entry => (entry.request.genes || []).some(gene => String(gene).includes(resultLabel)));
    const go = findByLabel(mocks.go);
    const network = findByLabel(mocks.network);
    if (!go || !network) {
      throw new Error(`Missing mocked Venn request for ${resultLabel}`);
    }
    go.resolve({
      result: [
        { term_name: `${resultLabel} GO term`, name: `${resultLabel} GO term`, p_value: 0.0001, source: 'GO:BP' }
      ]
    });
    network.resolve({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><text x="8" y="24">${resultLabel} STRING network</text></svg>`
    });
  }, label);
  await page.waitForFunction(
    resultLabel => {
      const mocks = window.__vennAsyncMocks;
      return mocks?.enrichment?.some(entry => (entry.request.genes || []).some(gene => String(gene).includes(resultLabel)));
    },
    label,
    { timeout: 10_000 }
  );
  await page.evaluate(resultLabel => {
    const mocks = window.__vennAsyncMocks;
    const enrichment = mocks.enrichment.find(entry => (entry.request.genes || []).some(gene => String(gene).includes(resultLabel)));
    if (!enrichment) {
      throw new Error(`Missing mocked Venn enrichment request for ${resultLabel}`);
    }
    enrichment.resolve({
      items: [
        { termDescription: `${resultLabel} STRING enrichment`, fdr: 0.001 }
      ]
    });
  }, label);
  await page.waitForTimeout(900);
}

async function snapshotVennAnalysis(page) {
  return page.evaluate(() => {
    const workspace = window.Main?.session?.workspaceState || {};
    const active = (workspace.tabs || []).find(tab => tab && tab.id === workspace.activeTabId) || null;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(active?.id || null, 'venn')
      || document.querySelector('#vennPage:not([hidden])');
    const state = window.Components?.venn?.__getState?.() || null;
    const text = selector => root?.querySelector?.(selector)?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const payload = window.Components?.venn?.getPayload?.() || null;
    return {
      tabId: active?.id || null,
      goText: text('#goResults'),
      stringText: text('#stringResults'),
      networkText: text('#stringNetwork'),
      stateGo: (state?.analysis?.lastGOResult || []).map(item => item.term_name || item.name || ''),
      stateString: (state?.analysis?.lastStringEnrichment || []).map(item => item.termDescription || item.description || ''),
      payloadGo: (payload?.analysis?.goResult || []).map(item => item.term_name || item.name || ''),
      payloadString: (payload?.analysis?.stringEnrichment || []).map(item => item.termDescription || item.description || '')
    };
  });
}

test('venn GO and STRING async results stay owned by their launching tab', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });

  const firstId = await openVennTab(page, { first: true });
  const secondId = await openVennTab(page);
  const first = { label: 'ALPHA', genes: ['ALPHA_GENE_1', 'ALPHA_GENE_2'], species: 'hsapiens' };
  const second = { label: 'BETA', genes: ['BETA_GENE_1', 'BETA_GENE_2'], species: 'mmusculus' };

  await installMockAnalysisServices(page);
  await activateTabById(page, firstId);
  await configureVennTab(page, first);
  await activateTabById(page, secondId);
  await configureVennTab(page, second);

  await runGoAndString(page, firstId, first);
  await runGoAndString(page, secondId, second);

  await resolveMockResults(page, 'BETA');
  await resolveMockResults(page, 'ALPHA');

  await activateTabById(page, firstId);
  const firstSnapshot = await snapshotVennAnalysis(page);
  const firstClickWithStaleActive = await page.evaluate(({ firstId, secondId }) => {
    const workspace = window.Main?.session?.workspaceState;
    const firstTab = (workspace?.tabs || []).find(tab => tab && tab.id === firstId);
    const secondTab = (workspace?.tabs || []).find(tab => tab && tab.id === secondId);
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(firstId, 'venn')
      || document.querySelector('#vennPage:not([hidden])');
    if (!workspace || !root || !firstTab || !secondTab) {
      return { skipped: true };
    }
    workspace.activeTabId = secondId;
    root.querySelector('#analysisTabString')?.click();
    const result = {
      skipped: false,
      stringText: root.querySelector('#stringResults')?.textContent || '',
      networkText: root.querySelector('#stringNetwork')?.textContent || '',
      firstPayloadGo: (firstTab.payload?.analysis?.goResult || []).map(item => item.term_name || item.name || ''),
      firstPayloadString: (firstTab.payload?.analysis?.stringEnrichment || []).map(item => item.termDescription || item.description || ''),
      secondPayloadGo: (secondTab.payload?.analysis?.goResult || []).map(item => item.term_name || item.name || ''),
      secondPayloadString: (secondTab.payload?.analysis?.stringEnrichment || []).map(item => item.termDescription || item.description || '')
    };
    workspace.activeTabId = firstId;
    return result;
  }, { firstId, secondId });
  await activateTabById(page, secondId);
  const secondSnapshot = await snapshotVennAnalysis(page);

  await testInfo.attach('venn-go-string-async-tab-isolation.json', {
    body: Buffer.from(JSON.stringify({ firstId, secondId, firstSnapshot, firstClickWithStaleActive, secondSnapshot }, null, 2), 'utf8'),
    contentType: 'application/json'
  });

  expect(firstSnapshot.goText).toContain('ALPHA GO term');
  expect(firstSnapshot.goText).not.toContain('BETA GO term');
  expect(firstSnapshot.stringText).toContain('ALPHA STRING enrichment');
  expect(firstSnapshot.networkText).toContain('ALPHA STRING network');
  expect(firstSnapshot.payloadGo).toContain('ALPHA GO term');
  expect(firstSnapshot.payloadString).toContain('ALPHA STRING enrichment');
  expect(firstClickWithStaleActive.skipped).toBe(false);
  expect(firstClickWithStaleActive.stringText).toContain('ALPHA STRING enrichment');
  expect(firstClickWithStaleActive.networkText).toContain('ALPHA STRING network');
  expect(firstClickWithStaleActive.firstPayloadGo).toContain('ALPHA GO term');
  expect(firstClickWithStaleActive.firstPayloadString).toContain('ALPHA STRING enrichment');
  expect(firstClickWithStaleActive.secondPayloadGo).toContain('BETA GO term');
  expect(firstClickWithStaleActive.secondPayloadString).toContain('BETA STRING enrichment');

  expect(secondSnapshot.goText).toContain('BETA GO term');
  expect(secondSnapshot.goText).not.toContain('ALPHA GO term');
  expect(secondSnapshot.stringText).toContain('BETA STRING enrichment');
  expect(secondSnapshot.networkText).toContain('BETA STRING network');
  expect(secondSnapshot.payloadGo).toContain('BETA GO term');
  expect(secondSnapshot.payloadString).toContain('BETA STRING enrichment');
  expect(issues.critical).toEqual([]);
});
