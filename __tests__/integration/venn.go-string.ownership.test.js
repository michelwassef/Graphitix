const { createVennAdditionalTabTestContext } = require('../../test-support/vennAdditionalTabSuite');

describe('Venn additional tabs — GO and STRING ownership', () => {
  const {
    flush,
    handleGraphSelection,
    activateTabById,
  } = createVennAdditionalTabTestContext();

  test('venn GO and STRING async results remain owned by launching tabs', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'venn');
    const venn = window.Components?.venn;
    const tabA = Main.tabs.getActiveTab();
    const pending = { go: [], network: [], enrichment: [] };
    const defer = (kind, request) => {
      let resolve;
      const promise = new Promise(res => { resolve = res; });
      pending[kind].push({ request, resolve });
      return promise;
    };
    const configure = async (tabId, label) => {
      await activateTabById(Main, tabId, `test-configure-${label}`);
      const tab = Main.session.workspaceState.tabs.find(candidate => candidate.id === tabId);
      const payload = venn.createEmptyPayload();
      payload.data.labelA = label;
      payload.data.listA = `${label}_GENE_1\n${label}_GENE_2`;
      payload.data.listB = `${label}_GENE_1`;
      payload.data.listC = '';
      payload.analysis.speciesValue = 'hsapiens';
      await venn.loadFromPayload(payload, {
        tab,
        tabId,
        source: `test-configure-${label}`
      });
      await venn.draw({ tab, tabId, reason: `test-configure-${label}`, force: true });
      await flush();
    };
    const projectOwner = async (tab, reason) => {
      Main.session.workspaceState.activeTabId = tab.id;
      window.Shared.workspaceTabs.activateSession(tab, 'venn', { reason });
      venn.activateTab(tab, { tabId: tab.id, reason });
      await flush();
    };

    await configure(tabA.id, 'ALPHA');
    Main.tabs.handleAddTabClick();
    await flush();
    await handleGraphSelection(Main, 'venn');
    const tabB = Main.tabs.getActiveTab();
    await configure(tabB.id, 'BETA');

    window.Shared.goAnalysis = {
      profile: options => defer('go', { genes: options.genes, organism: options.organism })
    };
    window.Shared.stringAnalysis = {
      resolveSpeciesCode: (_org, fallback) => fallback || '9606',
      fetchNetwork: options => defer('network', { genes: options.genes, species: options.species }),
      fetchEnrichment: options => defer('enrichment', { genes: options.genes, species: options.species })
    };

    await projectOwner(tabA, 'test-go-string-alpha');
    const runA = Promise.all([
      venn.runGOAnalysis(['ALPHA_GENE_1', 'ALPHA_GENE_2'], 'hsapiens'),
      venn.runStringAnalysis(['ALPHA_GENE_1', 'ALPHA_GENE_2'], 'hsapiens')
    ]);
    await flush();
    await projectOwner(tabB, 'test-go-string-beta');
    const runB = Promise.all([
      venn.runGOAnalysis(['BETA_GENE_1', 'BETA_GENE_2'], 'hsapiens'),
      venn.runStringAnalysis(['BETA_GENE_1', 'BETA_GENE_2'], 'hsapiens')
    ]);
    await flush();

    const resolveByLabel = (kind, label, value) => {
      const entries = pending[kind].filter(item => item.request.genes.some(gene => String(gene).includes(label)));
      expect(entries.length).toBeGreaterThan(0);
      entries.forEach(entry => entry.resolve(value));
    };
    resolveByLabel('go', 'BETA', { result: [{ term_name: 'BETA GO term', p_value: 0.01 }] });
    resolveByLabel('network', 'BETA', { svg: '<svg><text>BETA STRING network</text></svg>' });
    await flush();
    resolveByLabel('enrichment', 'BETA', { items: [{ termDescription: 'BETA STRING enrichment', fdr: 0.02 }] });
    resolveByLabel('go', 'ALPHA', { result: [{ term_name: 'ALPHA GO term', p_value: 0.01 }] });
    resolveByLabel('network', 'ALPHA', { svg: '<svg><text>ALPHA STRING network</text></svg>' });
    await flush();
    resolveByLabel('enrichment', 'ALPHA', { items: [{ termDescription: 'ALPHA STRING enrichment', fdr: 0.02 }] });
    await Promise.race([
      Promise.all([runA, runB]),
      new Promise((_, reject) => setTimeout(() => reject(new Error(
        `analysis did not settle: ${JSON.stringify(Object.fromEntries(
          Object.entries(pending).map(([kind, entries]) => [kind, entries.length])
        ))}`
      )), 2000))
    ]);
    await flush();

    await projectOwner(tabA, 'test-alpha-results');
    expect(venn.__getState().ui.goResults.textContent).toContain('ALPHA GO term');
    expect(venn.__getState().ui.goResults.textContent).not.toContain('BETA GO term');
    expect(venn.__getState().ui.stringResults.textContent).toContain('ALPHA STRING enrichment');
    expect(venn.__getState().ui.stringNetwork.textContent).toContain('ALPHA STRING network');
    expect(tabA.payload.analysis.goResult.map(item => item.term_name)).toContain('ALPHA GO term');

    await projectOwner(tabB, 'test-beta-results');
    expect(venn.__getState().ui.goResults.textContent).toContain('BETA GO term');
    expect(venn.__getState().ui.goResults.textContent).not.toContain('ALPHA GO term');
    expect(venn.__getState().ui.stringResults.textContent).toContain('BETA STRING enrichment');
    expect(venn.__getState().ui.stringNetwork.textContent).toContain('BETA STRING network');
    expect(tabB.payload.analysis.goResult.map(item => item.term_name)).toContain('BETA GO term');
  });

  test('restored venn GO and STRING tabs preserve session-owned results on tab click', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'venn');
    const venn = window.Components?.venn;
    const tab = Main.tabs.getActiveTab();
    const payload = venn.createEmptyPayload();
    payload.data.labelA = 'Transcriptomic';
    payload.data.labelB = 'Proteomic';
    payload.data.labelC = 'Phospho';
    payload.data.listA = 'BRCA1\nATM';
    payload.data.listB = 'BRCA1\nBAP1';
    payload.data.listC = 'BRCA1';
    payload.analysis = {
      ...payload.analysis,
      goResult: [{ term_name: 'Restored GO term', source: 'GO:BP', p_value: 0.001 }],
      goFormatted: ['BRCA1', 'ATM'],
      goOrganism: 'hsapiens',
      goPerformed: true,
      stringSvg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Restored STRING network</text></svg>',
      stringEnrichment: [{ termDescription: 'Restored STRING enrichment', fdr: 0.01 }],
      stringPerformed: true,
      activeResultsTab: 'go'
    };

    venn.loadFromPayload(payload, {
      tabId: tab.id,
      source: 'restore-analysis-tab-test',
      recordUndo: false
    });
    await flush();
    expect(tab.payload.analysis.goResult.map(item => item.term_name)).toContain('Restored GO term');
    expect(tab.payload.analysis.stringEnrichment.map(item => item.termDescription)).toContain('Restored STRING enrichment');

    const state = venn.__getState();
    state.analysis.lastGOResult = null;
    state.analysis.lastGOFormatted = ['STALE_ONLY'];
    state.analysis.lastGOOrganism = 'mmusculus';
    state.analysis.lastStringSVG = '';
    state.analysis.lastStringEnrichment = null;
    state.analysis.goPerformed = false;
    state.analysis.stringPerformed = false;

    state.ui.analysisTabString.click();
    await flush();

    expect(state.ui.stringResults.textContent).toContain('Restored STRING enrichment');
    expect(state.ui.stringNetwork.textContent).toContain('Restored STRING network');
    expect(tab.payload.analysis.goResult.map(item => item.term_name)).toContain('Restored GO term');
    expect(tab.payload.analysis.stringEnrichment.map(item => item.termDescription)).toContain('Restored STRING enrichment');
    expect(tab.payload.analysis.activeResultsTab).toBe('string');
  });

  test('runtime replay falls back to the owner payload for durable GO and STRING results', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'venn');
    const venn = window.Components?.venn;
    const tab = Main.tabs.getActiveTab();
    const payload = venn.createEmptyPayload();
    payload.data.listA = 'BRCA1\nATM';
    payload.data.listB = 'BRCA1\nBAP1';
    payload.data.listC = 'BRCA1';
    payload.analysis = {
      ...payload.analysis,
      goResult: [{ term_name: 'Payload GO term', source: 'GO:BP', p_value: 0.001 }],
      goFormatted: ['BRCA1', 'ATM'],
      goOrganism: 'hsapiens',
      goPerformed: true,
      stringSvg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Payload STRING network</text></svg>',
      stringEnrichment: [{ termDescription: 'Payload STRING enrichment', fdr: 0.01 }],
      stringPerformed: true,
      activeResultsTab: 'string'
    };

    venn.loadFromPayload(payload, {
      tabId: tab.id,
      source: 'runtime-owner-payload-fallback',
      recordUndo: false
    });
    await flush();

    const runtime = venn.__testHooks.captureRuntimeState({
      tabId: tab.id,
      tab,
      reason: 'runtime-owner-payload-fallback-capture'
    });
    const session = venn.__testHooks.getSession(tab.id);
    session.results = {
      ...session.results,
      lastGOResult: null,
      lastGOFormatted: [],
      goPerformed: false,
      lastStringSVG: '',
      lastStringEnrichment: null,
      stringPerformed: false,
      activeResultsTab: 'go'
    };

    expect(venn.__testHooks.applyRuntimeState(runtime, {
      tabId: tab.id,
      tab,
      reason: 'runtime-owner-payload-fallback-apply'
    })).toBe(true);
    await flush();

    expect(session.results.lastGOResult.map(item => item.term_name)).toContain('Payload GO term');
    expect(session.results.lastStringEnrichment.map(item => item.termDescription)).toContain('Payload STRING enrichment');
    expect(session.results.lastStringSVG).toContain('Payload STRING network');
    expect(session.results.activeResultsTab).toBe('string');
    expect(venn.__getState().ui.goResults.textContent).toContain('Payload GO term');
    expect(venn.__getState().ui.stringResults.textContent).toContain('Payload STRING enrichment');
    expect(venn.__getState().ui.stringNetwork.textContent).toContain('Payload STRING network');
  });

  test('applying runtime to an inactive venn owner never projects into the mounted sibling', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'venn');
    const venn = window.Components?.venn;
    const tabA = Main.tabs.getActiveTab();
    const runtimeA = venn.__testHooks.captureRuntimeState({ tabId: tabA.id, tab: tabA, reason: 'seed-owner-a' });

    Main.tabs.handleAddTabClick();
    await flush();
    await handleGraphSelection(Main, 'venn');
    const tabB = Main.tabs.getActiveTab();
    expect(tabB.id).not.toBe(tabA.id);

    const beforeB = venn.__testHooks.captureRuntimeState({ tabId: tabB.id, tab: tabB, reason: 'capture-owner-b' });
    const inactiveRuntime = {
      ...runtimeA,
      persistence: {
        ...(runtimeA?.persistence || {}),
        fileName: 'venn-owner-a-updated.graph',
        fileHandle: null
      },
      ui: {
        ...(runtimeA?.ui || {}),
        totalGenes: '12345'
      }
    };

    expect(venn.__testHooks.applyRuntimeState(inactiveRuntime, {
      tabId: tabA.id,
      tab: tabA,
      reason: 'apply-inactive-owner-a'
    })).toBe(true);
    await flush();

    expect(venn.__boundTabId).toBe(tabB.id);
    const afterB = venn.__testHooks.captureRuntimeState({ tabId: tabB.id, tab: tabB, reason: 'recapture-owner-b' });
    expect(afterB.persistence.fileName).toBe(beforeB.persistence.fileName);
    expect(afterB.ui.totalGenes).toBe(beforeB.ui.totalGenes);
    const ownerASession = venn.__testHooks.getSession(tabA.id);

    expect(ownerASession?.state?.runtime?.persistence?.fileName).toBe('venn-owner-a-updated.graph');
    expect(ownerASession?.managers?.fileHandle).toBeNull();
  });

  test('restored venn GO and STRING tab click uses clicked root owner when active mirror is stale', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'venn');
    const venn = window.Components?.venn;
    const tabA = Main.tabs.getActiveTab();
    const payloadA = venn.createEmptyPayload();
    payloadA.data.listA = 'BRCA1\nATM';
    payloadA.data.listB = 'BRCA1\nBAP1';
    payloadA.data.listC = 'BRCA1';
    payloadA.analysis = {
      ...payloadA.analysis,
      goResult: [{ term_name: 'Owner GO term', source: 'GO:BP', p_value: 0.001 }],
      goFormatted: ['BRCA1', 'ATM'],
      goOrganism: 'hsapiens',
      goPerformed: true,
      stringSvg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Owner STRING network</text></svg>',
      stringEnrichment: [{ termDescription: 'Owner STRING enrichment', fdr: 0.01 }],
      stringPerformed: true,
      activeResultsTab: 'go'
    };
    venn.loadFromPayload(payloadA, {
      tabId: tabA.id,
      source: 'owner-click-stale-active-a',
      recordUndo: false
    });
    await flush();

    Main.tabs.handleAddTabClick();
    await flush();
    await handleGraphSelection(Main, 'venn');
    const tabB = Main.tabs.getActiveTab();
    await activateTabById(Main, tabA.id, 'owner-click-return-a');

    const state = venn.__getState();
    Main.session.workspaceState.activeTabId = tabB.id;
    state.ui.analysisTabString.click();
    await flush();
    Main.session.workspaceState.activeTabId = tabA.id;

    expect(state.ui.stringResults.textContent).toContain('Owner STRING enrichment');
    expect(state.ui.stringNetwork.textContent).toContain('Owner STRING network');
    expect(tabA.payload.analysis.goResult.map(item => item.term_name)).toContain('Owner GO term');
    expect(tabA.payload.analysis.stringEnrichment.map(item => item.termDescription)).toContain('Owner STRING enrichment');
    expect(tabA.payload.analysis.activeResultsTab).toBe('string');
    expect(tabB.payload?.analysis?.goResult || null).toBeNull();
    expect(tabB.payload?.analysis?.stringEnrichment || null).toBeNull();
  });

  test('venn GO and STRING tab clicks rebuild stale payload from session results', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'venn');
    const venn = window.Components?.venn;
    const tab = Main.tabs.getActiveTab();
    const payload = venn.createEmptyPayload();
    payload.data.listA = 'BRCA1\nATM';
    payload.data.listB = 'BRCA1\nBAP1';
    payload.data.listC = 'BRCA1';
    payload.analysis = {
      ...payload.analysis,
      goResult: [{ term_name: 'Drift GO term', source: 'GO:BP', p_value: 0.001 }],
      goFormatted: ['BRCA1', 'ATM'],
      goOrganism: 'hsapiens',
      goPerformed: true,
      stringSvg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Drift STRING network</text></svg>',
      stringEnrichment: [{ termDescription: 'Drift STRING enrichment', fdr: 0.01 }],
      stringPerformed: true,
      activeResultsTab: 'go'
    };

    venn.loadFromPayload(payload, {
      tabId: tab.id,
      source: 'payload-drift-tab-click-test',
      recordUndo: false
    });
    await flush();

    const stalePayload = Main.session.clonePayload(tab.payload);
    stalePayload.analysis = venn.createEmptyPayload().analysis;
    tab.payload = stalePayload;
    tab.payloadSignature = Main.session.serializePayloadSignature(stalePayload);

    const state = venn.__getState();
    state.ui.analysisTabGo.click();
    await flush();
    state.ui.analysisTabString.click();
    await flush();

    expect(state.ui.goResults.textContent).toContain('Drift GO term');
    expect(state.ui.stringResults.textContent).toContain('Drift STRING enrichment');
    expect(state.ui.stringNetwork.textContent).toContain('Drift STRING network');
    expect(tab.payload.analysis.goResult.map(item => item.term_name)).toContain('Drift GO term');
    expect(tab.payload.analysis.stringEnrichment.map(item => item.termDescription)).toContain('Drift STRING enrichment');
    expect(tab.payload.analysis.stringSvg).toContain('Drift STRING network');
    expect(venn.__testHooks.getSession(tab.id).results.lastGOResult.map(item => item.term_name)).toContain('Drift GO term');
    expect(venn.__testHooks.getSession(tab.id).results.lastStringEnrichment.map(item => item.termDescription)).toContain('Drift STRING enrichment');
  });

  test('restored venn GO and STRING survive runtime rehydration with a stale region signature', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'venn');
    const venn = window.Components?.venn;
    const tab = Main.tabs.getActiveTab();
    const payload = venn.createEmptyPayload();
    payload.data.listA = 'BRCA1\nATM';
    payload.data.listB = 'BRCA1\nBAP1';
    payload.data.listC = 'BRCA1';
    payload.analysis = {
      ...payload.analysis,
      goResult: [{ term_name: 'Redraw GO term', source: 'GO:BP', p_value: 0.001 }],
      goFormatted: ['BRCA1', 'ATM'],
      goOrganism: 'hsapiens',
      goPerformed: true,
      stringSvg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Redraw STRING network</text></svg>',
      stringEnrichment: [{ termDescription: 'Redraw STRING enrichment', fdr: 0.01 }],
      stringPerformed: true,
      activeResultsTab: 'go'
    };

    venn.loadFromPayload(payload, {
      tabId: tab.id,
      source: 'restore-redraw-region-signature-test',
      recordUndo: false
    });
    await flush();

    const state = venn.__getState();
    const runtime = venn.__testHooks.captureRuntimeState({
      tabId: tab.id,
      reason: 'restore-redraw-region-signature-capture'
    });
    state.analysis.lastRegionSignature = 'A::STALE_OWNER_DATA';
    state.analysis.lastRegionCode = 'A';
    venn.__testHooks.applyRuntimeState(runtime, {
      tabId: tab.id,
      reason: 'restore-redraw-region-signature-apply'
    });
    await flush();

    // Runtime application may synchronously project the durable owner snapshot,
    // so the restored baseline can already be established before an explicit
    // fallback draw. The injected stale signature must be replaced by the
    // restored A-only owner region.
    expect(state.analysis.lastRegionCode).toBe('A');
    expect(state.analysis.lastRegionSignature).toBe('A::ATM');
    expect(venn.__testHooks.getSession(tab.id).cache.analysisProjectionBaselinePending).toBe(false);
    venn.refreshDiagram();
    await flush();
    state.ui.analysisTabString.click();
    await flush();

    expect(state.ui.goResults.textContent).toContain('Redraw GO term');
    expect(state.ui.stringResults.textContent).toContain('Redraw STRING enrichment');
    expect(state.ui.stringNetwork.textContent).toContain('Redraw STRING network');
    expect(tab.payload.analysis.goResult.map(item => item.term_name)).toContain('Redraw GO term');
    expect(tab.payload.analysis.stringEnrichment.map(item => item.termDescription)).toContain('Redraw STRING enrichment');
    expect(state.analysis.lastRegionSignature).toBeTruthy();
  });

  test('restored numeric Venn region survives runtime rehydration before the first fallback draw', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'venn');
    const venn = window.Components?.venn;
    const tab = Main.tabs.getActiveTab();
    const payload = venn.createEmptyPayload();
    Object.assign(payload.data, {
      labelA: 'Numeric Alpha',
      labelB: 'Numeric Beta',
      labelC: 'Numeric Gamma',
      nA: '80',
      nB: '60',
      nC: '40',
      nAB: '24',
      nAC: '12',
      nBC: '16',
      nABC: '6'
    });
    payload.style.plotType = 'venn';
    payload.analysis = {
      ...payload.analysis,
      regionSelectValue: 'ABC',
      totalGenes: '300',
      speciesValue: 'mmusculus'
    };

    venn.loadFromPayload(payload, {
      tabId: tab.id,
      source: 'numeric-region-runtime-rehydrate-test',
      recordUndo: false
    });
    await flush();

    const state = venn.__getState();
    expect(state.ui.regionSelect.value).toBe('ABC');
    expect(tab.payload.analysis.regionSelectValue).toBe('ABC');

    const runtime = venn.__testHooks.captureRuntimeState({
      tabId: tab.id,
      reason: 'numeric-region-runtime-rehydrate-capture'
    });
    venn.__testHooks.applyRuntimeState(runtime, {
      tabId: tab.id,
      reason: 'numeric-region-runtime-rehydrate-apply'
    });
    await flush();

    // Runtime rehydration invalidates data-derived caches, but applying the
    // durable owner snapshot may immediately establish the restored baseline.
    // The invariant is that ABC survives and no transient/default region wins.
    expect(state.analysis.lastRegionCode).toBe('ABC');
    expect(state.analysis.lastRegionSignature).toBe('ABC::');
    expect(venn.__testHooks.getSession(tab.id).cache.analysisProjectionBaselinePending).toBe(false);
    venn.refreshDiagram();
    await flush();

    expect(state.ui.regionSelect.value).toBe('ABC');
    expect(state.analysis.lastRegionCode).toBe('ABC');
    expect(state.analysis.lastRegionSignature).toBeTruthy();
    expect(venn.__testHooks.getSession(tab.id).cache.analysisProjectionBaselinePending).toBe(false);
    expect(tab.payload.analysis.regionSelectValue).toBe('ABC');
    expect(tab.payload.analysis.totalGenes).toBe('300');
    expect(tab.payload.analysis.speciesValue).toBe('mmusculus');
  });

  test('restored venn GO and STRING survive lifecycle persist from stale active mirror', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'venn');
    const venn = window.Components?.venn;
    const tab = Main.tabs.getActiveTab();
    const payload = venn.createEmptyPayload();
    payload.data.listA = 'BRCA1\nATM';
    payload.data.listB = 'BRCA1\nBAP1';
    payload.data.listC = 'BRCA1';
    payload.analysis = {
      ...payload.analysis,
      goResult: [{ term_name: 'Lifecycle GO term', source: 'GO:BP', p_value: 0.001 }],
      goFormatted: ['BRCA1', 'ATM'],
      goOrganism: 'hsapiens',
      goPerformed: true,
      stringSvg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Lifecycle STRING network</text></svg>',
      stringEnrichment: [{ termDescription: 'Lifecycle STRING enrichment', fdr: 0.01 }],
      stringPerformed: true,
      activeResultsTab: 'string'
    };

    venn.loadFromPayload(payload, {
      tabId: tab.id,
      source: 'restore-lifecycle-persist-test',
      recordUndo: false
    });
    await flush();

    const state = venn.__getState();
    state.analysis.lastGOResult = null;
    state.analysis.lastGOFormatted = ['STALE_ONLY'];
    state.analysis.lastGOOrganism = 'mmusculus';
    state.analysis.lastStringSVG = '';
    state.analysis.lastStringEnrichment = null;
    state.analysis.goPerformed = false;
    state.analysis.stringPerformed = false;

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

    expect(tab.payload.analysis.goResult.map(item => item.term_name)).toContain('Lifecycle GO term');
    expect(tab.payload.analysis.stringEnrichment.map(item => item.termDescription)).toContain('Lifecycle STRING enrichment');
    expect(tab.payload.analysis.stringSvg).toContain('Lifecycle STRING network');
  });

  test('venn explicit analysis clear invalidates session-owned GO and STRING results', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'venn');
    const venn = window.Components?.venn;
    const tab = Main.tabs.getActiveTab();
    const payload = venn.createEmptyPayload();
    payload.data.listA = 'BRCA1\nATM';
    payload.data.listB = 'BRCA1\nBAP1';
    payload.data.listC = 'BRCA1';
    payload.analysis = {
      ...payload.analysis,
      goResult: [{ term_name: 'Clear GO term', source: 'GO:BP', p_value: 0.001 }],
      goFormatted: ['BRCA1', 'ATM'],
      goOrganism: 'hsapiens',
      goPerformed: true,
      stringSvg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Clear STRING network</text></svg>',
      stringEnrichment: [{ termDescription: 'Clear STRING enrichment', fdr: 0.01 }],
      stringPerformed: true,
      activeResultsTab: 'go'
    };

    venn.loadFromPayload(payload, {
      tabId: tab.id,
      source: 'clear-analysis-session-test',
      recordUndo: false
    });
    await flush();

    const ownerSession = venn.__testHooks.getSession(tab.id);
    expect(ownerSession.results.goPerformed).toBe(true);
    expect(ownerSession.results.stringPerformed).toBe(true);

    venn.__testHooks.clearAnalysis();
    await flush();

    expect(ownerSession.results.goPerformed).toBe(false);
    expect(ownerSession.results.stringPerformed).toBe(false);
    expect(ownerSession.results.lastGOResult).toBeNull();
    expect(ownerSession.results.lastStringEnrichment).toBeNull();

    Main.session.persistActiveTabState(tab, {
      reason: 'test-clear-analysis',
      forcePreviewCapture: false
    });
    expect(tab.payload.analysis.goPerformed).toBe(false);
    expect(tab.payload.analysis.stringPerformed).toBe(false);
    expect(tab.payload.analysis.goResult).toBeNull();
    expect(tab.payload.analysis.stringEnrichment).toBeNull();
  });

});
