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
  await page.evaluate(async cfg => {
    const venn = window.Components?.venn;
    const workspace = window.Main?.session?.workspaceState || null;
    const tabId = String(workspace?.activeTabId || '').trim();
    const tab = (workspace?.tabs || []).find(candidate => candidate?.id === tabId) || null;
    if (!venn?.createEmptyPayload || !venn?.loadFromPayload || !tabId || !tab) {
      throw new Error('Active Venn owner/payload API unavailable');
    }

    const payload = venn.createEmptyPayload();
    payload.data.labelA = cfg.label;
    payload.data.listA = cfg.genes.join('\n');
    payload.data.listB = cfg.genes.slice(0, 1).join('\n');
    payload.data.listC = '';
    payload.style.plotType = 'venn';
    payload.analysis.speciesValue = cfg.species || '';

    await venn.loadFromPayload(payload, {
      tab,
      tabId,
      source: `e2e-configure-${cfg.label}`,
      recordUndo: false
    });
    await venn.draw?.({
      tab,
      tabId,
      reason: `e2e-configure-${cfg.label}`,
      force: true
    });

    const state = venn.__getState?.() || null;
    const matrix = state?.ui?.hot?.getData?.() || [];
    const ownerPayload = (workspace.tabs || []).find(candidate => candidate?.id === tabId)?.payload || null;
    const canonicalListA = String(ownerPayload?.data?.listA || '');
    const tableValuesA = matrix.slice(1).map(row => String(row?.[0] || '').trim()).filter(Boolean);
    const expectedA = cfg.genes.map(gene => String(gene || '').trim()).filter(Boolean);
    if (canonicalListA !== expectedA.join('\n') || expectedA.some(gene => !tableValuesA.includes(gene))) {
      throw new Error(`Venn canonical test setup failed for ${tabId}: ${JSON.stringify({
        canonicalListA,
        tableValuesA,
        expectedA
      })}`);
    }
  }, config);

  await page.waitForFunction(cfg => {
    const root = document.querySelector('#vennPage:not([hidden])');
    const listA = String(root?.querySelector('#listA')?.value || '');
    const table = window.Components?.venn?.__getState?.()?.ui?.hot?.getData?.() || [];
    const tableValuesA = table.slice(1).map(row => String(row?.[0] || '').trim()).filter(Boolean);
    return listA === cfg.genes.join('\n')
      && cfg.genes.every(gene => tableValuesA.includes(gene));
  }, config, { timeout: 10_000 });
}

async function installMockAnalysisServices(page, { mockSpecies = true } = {}) {
  if (mockSpecies) {
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
  }
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
          species: options.species,
          networkType: options.networkType,
          edgeMeaning: options.edgeMeaning,
          sources: Array.isArray(options.sources) ? options.sources.slice() : []
        });
      },
      fetchEnrichment(options) {
        return deferred('enrichment', {
          genes: options.genes,
          species: options.species,
          networkType: options.networkType,
          edgeMeaning: options.edgeMeaning,
          sources: Array.isArray(options.sources) ? options.sources.slice() : []
        });
      }
    };
  });
}


async function installDeferredSpeciesFetch(page) {
  await page.evaluate(() => {
    const nativeFetch = window.fetch.bind(window);
    const pending = [];
    const isMyGeneRequest = input => {
      const url = typeof input === 'string' ? input : input?.url;
      return String(url || '').startsWith('https://mygene.info/v3/query');
    };
    window.__vennNativeFetch = nativeFetch;
    window.__vennDeferredSpeciesFetches = pending;
    window.fetch = (input, init = {}) => {
      if (!isMyGeneRequest(input)) {
        return nativeFetch(input, init);
      }
      const url = typeof input === 'string' ? input : input?.url;
      const signal = init?.signal || (typeof input === 'object' ? input?.signal : null) || null;
      return new Promise((resolve, reject) => {
        const entry = { url: String(url || ''), resolve, reject, signal, onAbort: null };
        if (signal?.aborted) {
          reject(new DOMException(String(signal.reason || 'Aborted'), 'AbortError'));
          return;
        }
        if (signal?.addEventListener) {
          entry.onAbort = () => {
            const index = pending.indexOf(entry);
            if (index >= 0) pending.splice(index, 1);
            reject(new DOMException(String(signal.reason || 'Aborted'), 'AbortError'));
          };
          signal.addEventListener('abort', entry.onAbort, { once: true });
        }
        pending.push(entry);
      });
    };
  });
  return {
    async waitForPending(count = 1) {
      await page.waitForFunction(expected =>
        (window.__vennDeferredSpeciesFetches?.length || 0) >= expected,
      count, { timeout: 10_000 });
    },
    async fulfillAll(taxid) {
      await page.evaluate(resolvedTaxid => {
        const pending = window.__vennDeferredSpeciesFetches || [];
        const entries = pending.splice(0);
        entries.forEach(entry => {
          if (entry.signal && entry.onAbort) {
            entry.signal.removeEventListener?.('abort', entry.onAbort);
          }
          const url = new URL(entry.url);
          const q = String(url.searchParams.get('q') || '').toUpperCase();
          entry.resolve(new Response(JSON.stringify({
            hits: [{ symbol: q, taxid: resolvedTaxid }]
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }));
        });
      }, taxid);
    }
  };
}

async function resetVennSpeciesDetection(page, { delayMs = 60_000 } = {}) {
  await page.evaluate(delay => {
    const detection = window.Components?.venn?.__getState?.()?.analysis?.speciesDetection;
    if (!detection) throw new Error('Venn species detection state unavailable');
    detection.cache?.clear?.();
    detection.delayMs = delay;
  }, delayMs);
}

async function readVennButtonLaunchDiagnostics(page, tabId) {
  return page.evaluate(id => {
    const root = document.querySelector('#vennPage:not([hidden])');
    const workspace = window.Main?.session?.workspaceState || {};
    const tab = workspace.tabs?.find(item => item?.id === id) || null;
    const venn = window.Components?.venn || null;
    const state = venn?.__getState?.() || null;
    const owner = venn?.__testHooks?.getSession?.(id) || null;
    const payload = tab?.payload || null;
    const activeSessionInfo = window.Shared?.workspaceTabs?.getActiveSessionInfo?.('venn') || null;
    return {
      activeTabId: workspace.activeTabId || null,
      boundTabId: window.Components?.venn?.__boundTabId || null,
      rootTabId: root?.dataset?.workspaceTabId || root?.dataset?.tabId || null,
      activeSessionInfo,
      ownerSessionGeneration: tab?.sharedState?.sessions?.venn?.generation || 0,
      species: root?.querySelector('#speciesSelect')?.value || '',
      region: root?.querySelector('#regionSelect')?.value || '',
      listA: root?.querySelector('#listA')?.value || '',
      listB: root?.querySelector('#listB')?.value || '',
      listC: root?.querySelector('#listC')?.value || '',
      table: state?.ui?.hot?.getData?.() || [],
      payloadListA: payload?.data?.listA || '',
      payloadListB: payload?.data?.listB || '',
      payloadListC: payload?.data?.listC || '',
      regionListText: root?.querySelector('#regionList')?.textContent || '',
      goSources: Array.from(root?.querySelectorAll('.goCategory:checked') || []).map(node => node.value),
      stringSources: Array.from(root?.querySelectorAll('.stringSource:checked') || []).map(node => node.value),
      goText: root?.querySelector('#goResults')?.textContent || '',
      stringText: root?.querySelector('#stringResults')?.textContent || '',
      asyncRequests: { ...(owner?.cache?.asyncRequests || {}) },
      payloadSpecies: payload?.analysis?.speciesValue || '',
      payloadRegion: payload?.analysis?.regionSelectValue || '',
      goServiceAvailable: typeof window.Shared?.goAnalysis?.profile === 'function',
      stringServiceAvailable: typeof window.Shared?.stringAnalysis?.fetchNetwork === 'function',
      mockGoCount: window.__vennAsyncMocks?.go?.length || 0,
      mockNetworkCount: window.__vennAsyncMocks?.network?.length || 0
    };
  }, tabId);
}

async function prepareVennAnalysisControls(page, { kind = 'go', region = 'A', species = '' } = {}) {
  await page.evaluate(({ kind, region, species }) => {
    const root = document.querySelector('#vennPage:not([hidden])');
    if (!root) throw new Error('Active Venn root not found');
    const speciesSelect = root.querySelector('#speciesSelect');
    if (speciesSelect) {
      speciesSelect.value = species;
      speciesSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const regionSelect = root.querySelector('#regionSelect');
    if (regionSelect && Array.from(regionSelect.options).some(option => option.value === region)) {
      regionSelect.value = region;
      regionSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (kind === 'go') {
      root.querySelectorAll('.goCategory').forEach(input => {
        input.checked = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    } else {
      root.querySelectorAll('.stringSource').forEach(input => {
        input.checked = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
  }, { kind, region, species });
}

async function setVennAnalysisOptionProfile(page, { kind, profile }) {
  await page.evaluate(({ kind, profile }) => {
    const root = document.querySelector('#vennPage:not([hidden])');
    if (!root) throw new Error('Active Venn root not found');
    if (kind === 'go') {
      const expected = profile === 'alpha' ? 'GO:BP' : 'GO:CC';
      root.querySelectorAll('.goCategory').forEach(input => {
        input.checked = input.value === expected;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      return;
    }
    const networkType = profile === 'alpha' ? 'physical' : 'full';
    const edgeMeaning = profile === 'alpha' ? 'confidence' : 'evidence';
    const source = profile === 'alpha' ? 'experiments' : 'textmining';
    root.querySelectorAll('input[name="stringNetworkType"]').forEach(input => {
      input.checked = input.value === networkType;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    root.querySelectorAll('input[name="stringEdgeMeaning"]').forEach(input => {
      input.checked = input.value === edgeMeaning;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    root.querySelectorAll('.stringSource').forEach(input => {
      input.checked = input.value === source;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }, { kind, profile });
}

async function resolveMockGo(page, label) {
  await page.evaluate(resultLabel => {
    const mocks = window.__vennAsyncMocks;
    const go = mocks?.go?.find(entry => (entry.request.genes || []).some(gene => String(gene).includes(resultLabel)));
    if (!go) throw new Error(`Missing mocked GO request for ${resultLabel}`);
    go.resolve({
      result: [
        { term_name: `${resultLabel} GO term`, name: `${resultLabel} GO term`, p_value: 0.0001, source: 'GO:BP' }
      ]
    });
  }, label);
  await page.waitForFunction(resultLabel => {
    const workspace = window.Main?.session?.workspaceState || {};
    return (workspace.tabs || []).some(tab =>
      (tab?.payload?.analysis?.goResult || []).some(item => String(item.term_name || item.name || '').includes(resultLabel))
    );
  }, label, { timeout: 10_000 });
}

async function resolveMockString(page, label) {
  await page.evaluate(resultLabel => {
    const mocks = window.__vennAsyncMocks;
    const network = mocks?.network?.find(entry => (entry.request.genes || []).some(gene => String(gene).includes(resultLabel)));
    if (!network) throw new Error(`Missing mocked STRING request for ${resultLabel}`);
    network.resolve({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><text x="8" y="24">${resultLabel} STRING network</text></svg>`
    });
  }, label);
  await page.waitForFunction(resultLabel => {
    const mocks = window.__vennAsyncMocks;
    return mocks?.enrichment?.some(entry => (entry.request.genes || []).some(gene => String(gene).includes(resultLabel)));
  }, label, { timeout: 10_000 });
  await page.evaluate(resultLabel => {
    const mocks = window.__vennAsyncMocks;
    const enrichment = mocks.enrichment.find(entry => (entry.request.genes || []).some(gene => String(gene).includes(resultLabel)));
    if (!enrichment) throw new Error(`Missing mocked STRING enrichment request for ${resultLabel}`);
    enrichment.resolve({ items: [{ termDescription: `${resultLabel} STRING enrichment`, fdr: 0.001 }] });
  }, label);
  await page.waitForFunction(resultLabel => {
    const workspace = window.Main?.session?.workspaceState || {};
    return (workspace.tabs || []).some(tab =>
      (tab?.payload?.analysis?.stringEnrichment || []).some(item => String(item.termDescription || item.description || '').includes(resultLabel))
    );
  }, label, { timeout: 10_000 });
}

async function readTabAnalysisPayload(page, tabId) {
  return page.evaluate(id => {
    const tab = window.Main?.session?.workspaceState?.tabs?.find(item => item?.id === id) || null;
    const analysis = tab?.payload?.analysis || {};
    return {
      speciesValue: analysis.speciesValue || '',
      goFormatted: Array.isArray(analysis.goFormatted) ? analysis.goFormatted.slice() : [],
      goResult: (analysis.goResult || []).map(item => item.term_name || item.name || ''),
      stringEnrichment: (analysis.stringEnrichment || []).map(item => item.termDescription || item.description || ''),
      stringOverlay: analysis.stringOverlay || null
    };
  }, tabId);
}

async function installDeferredFileReader(page) {
  await page.evaluate(() => {
    const NativeFileReader = window.FileReader;
    const pending = [];
    class DeferredFileReader {
      constructor() {
        this.onload = null;
        this.onerror = null;
        this.error = null;
        this.result = null;
      }
      readAsText(file) {
        pending.push({ reader: this, file, mode: 'text' });
      }
      readAsArrayBuffer(file) {
        pending.push({ reader: this, file, mode: 'buffer' });
      }
    }
    window.__vennNativeFileReader = NativeFileReader;
    window.__vennDeferredFileReaders = pending;
    window.FileReader = DeferredFileReader;
  });
}

async function waitForDeferredFileReader(page) {
  await page.waitForFunction(() => (window.__vennDeferredFileReaders?.length || 0) > 0, null, { timeout: 10_000 });
}

async function resolveDeferredFileReaders(page, text) {
  await page.evaluate(content => {
    const pending = window.__vennDeferredFileReaders || [];
    const entries = pending.splice(0);
    entries.forEach(({ reader, mode }) => {
      const result = mode === 'buffer'
        ? new TextEncoder().encode(content).buffer
        : content;
      reader.result = result;
      reader.onload?.({ target: { result } });
    });
  }, text);
}

async function rejectDeferredFileReaders(page, message = 'Deferred file read failed') {
  await page.evaluate(errorMessage => {
    const pending = window.__vennDeferredFileReaders || [];
    const entries = pending.splice(0);
    entries.forEach(({ reader }) => {
      reader.error = new Error(errorMessage);
      reader.onerror?.();
    });
  }, message);
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
    const ownerSession = window.Components?.venn?.__testHooks?.getSession?.(active?.id || null) || null;
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
      payloadString: (payload?.analysis?.stringEnrichment || []).map(item => item.termDescription || item.description || ''),
      asyncRequests: {
        go: ownerSession?.cache?.asyncRequests?.go || null,
        string: ownerSession?.cache?.asyncRequests?.string || null,
        species: ownerSession?.cache?.asyncRequests?.species || null
      }
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
  expect(firstSnapshot.asyncRequests).toEqual({ go: null, string: null, species: null });
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
  expect(secondSnapshot.asyncRequests).toEqual({ go: null, string: null, species: null });
  expect(issues.critical).toEqual([]);
});

test('restored Venn analysis stays authoritative across passive redraw and snapshot settling', async ({ page }) => {
  test.setTimeout(90_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });

  const tabId = await openVennTab(page, { first: true });
  await installMockAnalysisServices(page);
  await configureVennTab(page, {
    label: 'RESTORED',
    genes: ['RESTORED_GENE_1', 'RESTORED_GENE_2'],
    species: 'mmusculus'
  });

  await page.evaluate(async id => {
    const venn = window.Components?.venn;
    const session = window.Main?.session;
    const tab = session?.workspaceState?.tabs?.find(item => item?.id === id) || null;
    if (!venn || !tab) {
      throw new Error('Missing restored Venn owner');
    }
    const payload = session.clonePayload
      ? session.clonePayload(venn.getPayload({ tabId: id }))
      : structuredClone(venn.getPayload({ tabId: id }));
    payload.analysis = {
      ...(payload.analysis || {}),
      speciesValue: 'mmusculus',
      speciesIndicator: 'rgb(255, 230, 128)',
      regionSelectValue: payload.analysis?.regionSelectValue || 'A',
      goPerformed: true,
      goResult: [{ term_name: 'Restored GO result', name: 'Restored GO result', p_value: 0.001, source: 'GO:BP' }],
      goFormatted: ['RESTORED_GENE_1', 'RESTORED_GENE_2'],
      goOrganism: 'mmusculus',
      stringPerformed: true,
      stringSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><text x="8" y="24">Restored STRING network</text></svg>',
      stringEnrichment: [{ termDescription: 'Restored STRING enrichment', fdr: 0.001 }]
    };
    venn.loadFromPayload(payload, {
      tab,
      tabId: id,
      source: 'e2e-restored-analysis',
      reason: 'e2e-restored-analysis',
      recordUndo: false
    });
    await venn.draw({ tabId: id, reason: 'e2e-restored-passive-redraw' });
    await venn.awaitReadyForSnapshot({ tabId: id, reason: 'e2e-restored-snapshot-ready' });
  }, tabId);

  // Cover the former delayed species/GO/STRING refresh window.
  await page.waitForTimeout(1_800);

  const result = await page.evaluate(id => {
    const venn = window.Components?.venn;
    const owner = venn?.__testHooks?.getSession?.(id) || null;
    const payload = venn?.getPayload?.({ tabId: id }) || null;
    const mocks = window.__vennAsyncMocks || {};
    return {
      goCalls: mocks.go?.length || 0,
      networkCalls: mocks.network?.length || 0,
      enrichmentCalls: mocks.enrichment?.length || 0,
      speciesValue: payload?.analysis?.speciesValue || '',
      goResults: (payload?.analysis?.goResult || []).map(item => item.term_name || item.name || ''),
      stringResults: (payload?.analysis?.stringEnrichment || []).map(item => item.termDescription || item.description || ''),
      asyncRequests: {
        go: owner?.cache?.asyncRequests?.go || null,
        string: owner?.cache?.asyncRequests?.string || null,
        species: owner?.cache?.asyncRequests?.species || null
      }
    };
  }, tabId);

  expect(result.goCalls).toBe(0);
  expect(result.networkCalls).toBe(0);
  expect(result.enrichmentCalls).toBe(0);
  expect(result.speciesValue).toBe('mmusculus');
  expect(result.goResults).toContain('Restored GO result');
  expect(result.stringResults).toContain('Restored STRING enrichment');
  expect(result.asyncRequests).toEqual({ go: null, string: null, species: null });
});

for (const kind of ['go', 'string']) {
  test(`Venn ${kind.toUpperCase()} button reaches the analysis service with an explicit species`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });

    const tabId = await openVennTab(page, { first: true });
    await installMockAnalysisServices(page, { mockSpecies: false });
    await activateTabById(page, tabId);
    await resetVennSpeciesDetection(page);
    await configureVennTab(page, {
      label: 'ALPHA',
      genes: ['ALPHA_GENE_1', 'ALPHA_GENE_2'],
      species: 'hsapiens'
    });
    await prepareVennAnalysisControls(page, { kind, region: 'A', species: 'hsapiens' });
    await setVennAnalysisOptionProfile(page, { kind, profile: 'alpha' });

    await page.locator(`#vennPage:not([hidden]) #${kind === 'go' ? 'goBtn' : 'stringBtn'}`).click({ force: true });
    const mockBucket = kind === 'go' ? 'go' : 'network';
    try {
      await page.waitForFunction(({ mockBucket }) =>
        (window.__vennAsyncMocks?.[mockBucket] || []).some(entry =>
          (entry.request.genes || []).includes('ALPHA_GENE_2')),
      { mockBucket }, { timeout: 10_000 });
    } catch (err) {
      const diagnostics = await readVennButtonLaunchDiagnostics(page, tabId);
      await testInfo.attach(`venn-${kind}-button-launch-diagnostics.json`, {
        body: Buffer.from(JSON.stringify(diagnostics, null, 2), 'utf8'),
        contentType: 'application/json'
      });
      throw new Error(`Venn ${kind.toUpperCase()} button did not reach the analysis service: ${JSON.stringify(diagnostics)}`, { cause: err });
    }

    const request = await page.evaluate(({ mockBucket }) =>
      (window.__vennAsyncMocks?.[mockBucket] || []).find(entry =>
        (entry.request.genes || []).includes('ALPHA_GENE_2'))?.request || null,
    { mockBucket });
    expect(request).toBeTruthy();
    if (kind === 'go') {
      expect(request.sources).toEqual(['GO:BP']);
      await resolveMockGo(page, 'ALPHA_GENE_2');
    } else {
      expect(request.networkType).toBe('physical');
      expect(request.edgeMeaning).toBe('confidence');
      expect(request.sources).toEqual(['experiments']);
      await resolveMockString(page, 'ALPHA_GENE_2');
    }
  });
}

for (const kind of ['go', 'string']) {
  test(`Venn ${kind.toUpperCase()} button keeps pre-analysis species resolution owned across A→B`, async ({ page }) => {
    test.setTimeout(120_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });

    const firstId = await openVennTab(page, { first: true });
    const secondId = await openVennTab(page);
    const deferredSpecies = await installDeferredSpeciesFetch(page);
    await installMockAnalysisServices(page, { mockSpecies: false });

    await activateTabById(page, firstId);
    await resetVennSpeciesDetection(page);
    await configureVennTab(page, {
      label: 'ALPHA',
      genes: ['ALPHA_GENE_1', 'ALPHA_GENE_2'],
      species: ''
    });
    await prepareVennAnalysisControls(page, { kind, region: 'A', species: '' });
    await setVennAnalysisOptionProfile(page, { kind, profile: 'alpha' });

    await activateTabById(page, secondId);
    await resetVennSpeciesDetection(page);
    await configureVennTab(page, {
      label: 'BETA',
      genes: ['BETA_GENE_1', 'BETA_GENE_2'],
      species: 'mmusculus'
    });
    await setVennAnalysisOptionProfile(page, { kind, profile: 'beta' });

    await activateTabById(page, firstId);
    await page.locator(`#vennPage:not([hidden]) #${kind === 'go' ? 'goBtn' : 'stringBtn'}`).click({ force: true });
    await deferredSpecies.waitForPending(1);

    await activateTabById(page, secondId);
    await deferredSpecies.fulfillAll(9606);

    const mockBucket = kind === 'go' ? 'go' : 'network';
    await page.waitForFunction(({ mockBucket }) => {
      const entries = window.__vennAsyncMocks?.[mockBucket] || [];
      return entries.some(entry => (entry.request.genes || []).some(gene => String(gene).includes('ALPHA')));
    }, { mockBucket }, { timeout: 10_000 });

    const requestSnapshot = await page.evaluate(({ mockBucket }) => {
      const entries = window.__vennAsyncMocks?.[mockBucket] || [];
      return entries.find(entry => (entry.request.genes || []).some(gene => String(gene).includes('ALPHA')))?.request || null;
    }, { mockBucket });
    expect(requestSnapshot).toBeTruthy();
    if (kind === 'go') {
      expect(requestSnapshot.sources).toEqual(['GO:BP']);
    } else {
      expect(requestSnapshot.networkType).toBe('physical');
      expect(requestSnapshot.edgeMeaning).toBe('confidence');
      expect(requestSnapshot.sources).toEqual(['experiments']);
    }

    const secondBeforeResolve = await readTabAnalysisPayload(page, secondId);
    expect(secondBeforeResolve.speciesValue).toBe('mmusculus');
    expect(secondBeforeResolve.goFormatted.some(gene => String(gene).includes('ALPHA'))).toBe(false);
    expect(secondBeforeResolve.stringEnrichment.some(term => String(term).includes('ALPHA'))).toBe(false);

    if (kind === 'go') {
      await resolveMockGo(page, 'ALPHA');
    } else {
      await resolveMockString(page, 'ALPHA');
    }

    const firstPayload = await readTabAnalysisPayload(page, firstId);
    const secondPayload = await readTabAnalysisPayload(page, secondId);
    expect(firstPayload.speciesValue).toBe('hsapiens');
    if (kind === 'go') {
      expect(firstPayload.goResult).toContain('ALPHA GO term');
    } else {
      expect(firstPayload.stringEnrichment).toContain('ALPHA STRING enrichment');
    }
    expect(secondPayload.speciesValue).toBe('mmusculus');
    expect(secondPayload.goResult.some(term => String(term).includes('ALPHA'))).toBe(false);
    expect(secondPayload.stringEnrichment.some(term => String(term).includes('ALPHA'))).toBe(false);
  });
}

test('Venn pre-analysis species continuation stays stale across A→B→A', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });

  const firstId = await openVennTab(page, { first: true });
  const secondId = await openVennTab(page);
  const deferredSpecies = await installDeferredSpeciesFetch(page);
  await installMockAnalysisServices(page, { mockSpecies: false });

  await activateTabById(page, firstId);
  await resetVennSpeciesDetection(page);
  await configureVennTab(page, {
    label: 'ALPHA',
    genes: ['ALPHA_GENE_1', 'ALPHA_GENE_2'],
    species: ''
  });
  await prepareVennAnalysisControls(page, { kind: 'go', region: 'A', species: '' });

  await activateTabById(page, secondId);
  await configureVennTab(page, {
    label: 'BETA',
    genes: ['BETA_GENE_1', 'BETA_GENE_2'],
    species: 'mmusculus'
  });

  await activateTabById(page, firstId);
  await page.locator('#vennPage:not([hidden]) #goBtn').click({ force: true });
  await deferredSpecies.waitForPending(1);

  await activateTabById(page, secondId);
  await activateTabById(page, firstId);
  await deferredSpecies.fulfillAll(9606);

  await page.waitForFunction(id => {
    const owner = window.Components?.venn?.__testHooks?.getSession?.(id);
    const requests = owner?.cache?.asyncRequests || {};
    return !requests.goSpecies && !requests.go;
  }, firstId, { timeout: 10_000 });

  const state = await page.evaluate(() => ({
    goRequests: (window.__vennAsyncMocks?.go || []).map(entry => entry.request.genes || [])
  }));
  const firstPayload = await readTabAnalysisPayload(page, firstId);
  const secondPayload = await readTabAnalysisPayload(page, secondId);

  expect(state.goRequests.some(genes => genes.some(gene => String(gene).includes('ALPHA')))).toBe(false);
  expect(firstPayload.speciesValue).toBe('');
  expect(firstPayload.goResult.some(term => String(term).includes('ALPHA'))).toBe(false);
  expect(secondPayload.speciesValue).toBe('mmusculus');
  expect(secondPayload.goResult.some(term => String(term).includes('ALPHA'))).toBe(false);
});

test('Venn STRING overlay import remains owner-scoped and rejects A→B→A stale completion', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });

  const firstId = await openVennTab(page, { first: true });
  const secondId = await openVennTab(page);
  await installDeferredFileReader(page);

  await activateTabById(page, firstId);
  await configureVennTab(page, {
    label: 'ALPHA',
    genes: ['ALPHA_GENE_1', 'ALPHA_GENE_2'],
    species: 'hsapiens'
  });
  await activateTabById(page, secondId);
  await configureVennTab(page, {
    label: 'BETA',
    genes: ['BETA_GENE_1', 'BETA_GENE_2'],
    species: 'mmusculus'
  });

  await activateTabById(page, firstId);
  const overlayInput = page.locator('#vennPage:not([hidden]) #stringOverlayFile');
  await overlayInput.setInputFiles({
    name: 'alpha-overlay.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('source,target,value\nALPHA_GENE_1,ALPHA_GENE_2,0.9\n', 'utf8')
  });
  await waitForDeferredFileReader(page);

  await activateTabById(page, secondId);
  await resolveDeferredFileReaders(page, 'source,target,value\nALPHA_GENE_1,ALPHA_GENE_2,0.9\n');
  await page.waitForFunction(id => {
    const tab = window.Main?.session?.workspaceState?.tabs?.find(item => item?.id === id);
    return tab?.payload?.analysis?.stringOverlay?.fileName === 'alpha-overlay.csv';
  }, firstId, { timeout: 10_000 });

  let firstPayload = await readTabAnalysisPayload(page, firstId);
  let secondPayload = await readTabAnalysisPayload(page, secondId);
  expect(firstPayload.stringOverlay?.fileName).toBe('alpha-overlay.csv');
  expect(firstPayload.stringOverlay?.edges).toHaveLength(1);
  expect(secondPayload.stringOverlay?.edges || []).toHaveLength(0);

  await activateTabById(page, firstId);
  await overlayInput.setInputFiles({
    name: 'stale-overlay.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('source,target,value\nALPHA_GENE_1,ALPHA_GENE_2,0.1\n', 'utf8')
  });
  await waitForDeferredFileReader(page);
  await activateTabById(page, secondId);
  await activateTabById(page, firstId);
  await resolveDeferredFileReaders(page, 'source,target,value\nALPHA_GENE_1,ALPHA_GENE_2,0.1\n');

  await page.waitForFunction(id => {
    const owner = window.Components?.venn?.__testHooks?.getSession?.(id);
    return !owner?.cache?.asyncRequests?.stringOverlay;
  }, firstId, { timeout: 10_000 });

  firstPayload = await readTabAnalysisPayload(page, firstId);
  secondPayload = await readTabAnalysisPayload(page, secondId);
  expect(firstPayload.stringOverlay?.fileName).toBe('alpha-overlay.csv');
  expect(firstPayload.stringOverlay?.edges?.[0]?.value).toBe(0.9);
  expect(secondPayload.stringOverlay?.edges || []).toHaveLength(0);

  await overlayInput.setInputFiles({
    name: 'failed-overlay.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('source,target,value\nALPHA_GENE_1,ALPHA_GENE_2,0.5\n', 'utf8')
  });
  await waitForDeferredFileReader(page);
  await activateTabById(page, secondId);
  await rejectDeferredFileReaders(page, 'expected overlay read failure');
  await page.waitForFunction(id => {
    const owner = window.Components?.venn?.__testHooks?.getSession?.(id);
    return !owner?.cache?.asyncRequests?.stringOverlay;
  }, firstId, { timeout: 10_000 });

  firstPayload = await readTabAnalysisPayload(page, firstId);
  secondPayload = await readTabAnalysisPayload(page, secondId);
  const secondOverlayStatus = await page.locator('#vennPage:not([hidden]) #stringOverlayStatus').textContent();
  expect(firstPayload.stringOverlay?.fileName).toBe('alpha-overlay.csv');
  expect(firstPayload.stringOverlay?.edges?.[0]?.value).toBe(0.9);
  expect(secondPayload.stringOverlay?.edges || []).toHaveLength(0);
  expect(secondOverlayStatus || '').not.toMatch(/failed to load/i);
});

test('Venn automatic species detection is cancelled owner-safely on A→B before execution', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });

  const firstId = await openVennTab(page, { first: true });
  const secondId = await openVennTab(page);
  await installDeferredSpeciesFetch(page);

  await activateTabById(page, firstId);
  await resetVennSpeciesDetection(page, { delayMs: 1_500 });
  await configureVennTab(page, {
    label: 'ALPHA',
    genes: ['ALPHA_GENE_1', 'ALPHA_GENE_2'],
    species: ''
  });

  // Switch before the delayed recognizer is allowed to execute. Cancellation before
  // network work is a valid outcome and is the contract this test is meant to prove.
  await activateTabById(page, secondId);
  await resetVennSpeciesDetection(page);
  await configureVennTab(page, {
    label: 'BETA',
    genes: ['BETA_GENE_1', 'BETA_GENE_2'],
    species: 'mmusculus'
  });
  await page.waitForTimeout(1_800);

  const pendingSpeciesFetches = await page.evaluate(() => window.__vennDeferredSpeciesFetches?.length || 0);
  const firstPayload = await readTabAnalysisPayload(page, firstId);
  const secondPayload = await readTabAnalysisPayload(page, secondId);
  expect(pendingSpeciesFetches).toBe(0);
  expect(firstPayload.speciesValue).toBe('');
  expect(secondPayload.speciesValue).toBe('mmusculus');
});

test('Venn automatic analysis refresh carries A owner and launch options across species await', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });

  const firstId = await openVennTab(page, { first: true });
  const secondId = await openVennTab(page);
  const deferredSpecies = await installDeferredSpeciesFetch(page);
  await installMockAnalysisServices(page, { mockSpecies: false });

  await activateTabById(page, firstId);
  await resetVennSpeciesDetection(page);
  await configureVennTab(page, {
    label: 'ALPHA',
    genes: ['ALPHA_GENE_1', 'ALPHA_GENE_2'],
    species: 'hsapiens'
  });
  await prepareVennAnalysisControls(page, { kind: 'go', region: 'A', species: 'hsapiens' });
  await setVennAnalysisOptionProfile(page, { kind: 'go', profile: 'alpha' });

  // Seed the prior GO-performed state through the public production analysis API.
  // Keep this independent from the button bridge, but fail loudly if the API contract changes.
  await page.evaluate(() => {
    const runGOAnalysis = window.Components?.venn?.runGOAnalysis;
    if (typeof runGOAnalysis !== 'function') {
      throw new Error('Venn public runGOAnalysis API unavailable');
    }
    runGOAnalysis(['ALPHA_GENE_2'], 'hsapiens', {
      activeResultsTab: 'go',
      requestConfig: { sources: ['GO:BP'] }
    });
  });
  await page.waitForFunction(() =>
    (window.__vennAsyncMocks?.go || []).some(entry => (entry.request.genes || []).includes('ALPHA_GENE_2')),
  null, { timeout: 10_000 });
  await resolveMockGo(page, 'ALPHA_GENE_2');

  await activateTabById(page, secondId);
  await resetVennSpeciesDetection(page);
  await configureVennTab(page, {
    label: 'BETA',
    genes: ['BETA_GENE_1', 'BETA_GENE_2'],
    species: 'mmusculus'
  });
  await setVennAnalysisOptionProfile(page, { kind: 'go', profile: 'beta' });

  await activateTabById(page, firstId);
  await resetVennSpeciesDetection(page);
  await page.evaluate(() => {
    const root = document.querySelector('#vennPage:not([hidden])');
    const species = root?.querySelector('#speciesSelect');
    const region = root?.querySelector('#regionSelect');
    if (!species || !region) throw new Error('Missing Venn analysis controls');
    species.value = '';
    species.dispatchEvent(new Event('change', { bubbles: true }));
    if (!Array.from(region.options).some(option => option.value === 'AB')) {
      throw new Error('Expected AB region option');
    }
    region.value = 'AB';
    region.dispatchEvent(new Event('change', { bubbles: true }));
  });

  await deferredSpecies.waitForPending(1);
  await activateTabById(page, secondId);
  await deferredSpecies.fulfillAll(9606);

  await page.waitForFunction(() =>
    (window.__vennAsyncMocks?.go || []).some(entry => (entry.request.genes || []).includes('ALPHA_GENE_1')),
  null, { timeout: 10_000 });
  const refreshRequest = await page.evaluate(() =>
    (window.__vennAsyncMocks?.go || []).find(entry => (entry.request.genes || []).includes('ALPHA_GENE_1'))?.request || null
  );
  expect(refreshRequest?.sources).toEqual(['GO:BP']);

  const secondBeforeResolve = await readTabAnalysisPayload(page, secondId);
  expect(secondBeforeResolve.speciesValue).toBe('mmusculus');
  expect(secondBeforeResolve.goFormatted.some(gene => String(gene).includes('ALPHA'))).toBe(false);

  await resolveMockGo(page, 'ALPHA_GENE_1');
  const firstPayload = await readTabAnalysisPayload(page, firstId);
  const secondPayload = await readTabAnalysisPayload(page, secondId);
  expect(firstPayload.speciesValue).toBe('hsapiens');
  expect(firstPayload.goResult).toContain('ALPHA_GENE_1 GO term');
  expect(secondPayload.speciesValue).toBe('mmusculus');
  expect(secondPayload.goResult.some(term => String(term).includes('ALPHA'))).toBe(false);
});
