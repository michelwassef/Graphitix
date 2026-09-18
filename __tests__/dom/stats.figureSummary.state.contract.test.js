describe('statsReporting figure-summary tab state', () => {
  let sharedByTab;

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    delete window.Shared;
    global.Shared = {};
    window.Shared = global.Shared;
    sharedByTab = new Map();
    const tabs = [
      { id:'tab-a', type:'box', isWelcome:false },
      { id:'tab-b', type:'box', isWelcome:false },
      { id:'tab-c', type:'box', isWelcome:false }
    ];
    global.Main = window.Main = {
      session:{
        workspaceState:{ activeTabId:'tab-a', tabs },
        getActiveTab(){ return tabs.find(tab => tab.id === this.workspaceState.activeTabId) || null; }
      }
    };
    window.Shared.workspaceTabs = {
      getSharedControlState(tabLike, key){
        const id = typeof tabLike === 'string' ? tabLike : tabLike?.id;
        return sharedByTab.get(`${id}:${key}`) || null;
      },
      ensureSharedControlState(tabLike, key){
        const id = typeof tabLike === 'string' ? tabLike : tabLike?.id;
        const mapKey = `${id}:${key}`;
        if(!sharedByTab.has(mapKey)) sharedByTab.set(mapKey, {});
        return sharedByTab.get(mapKey);
      }
    };
    window.Shared.statsFigureSummary = {
      scheduleRender:jest.fn(),
      __getReportForTab:jest.fn(() => null)
    };
    require('../../js/shared/stats.js');
  });

  afterEach(() => {
    delete global.Main;
    delete window.Main;
    delete global.Shared;
    delete window.Shared;
  });

  test('same-component tabs own independent summary-toggle state', () => {
    const reporting = window.Shared.statsReporting;
    expect(reporting.getFigureSummaryEnabled({ tabId:'tab-a' })).toBe(false);
    expect(reporting.getFigureSummaryEnabled({ tabId:'tab-b' })).toBe(false);

    expect(reporting.setFigureSummaryEnabled(true, { tabId:'tab-a' })).toBe(true);
    expect(reporting.getFigureSummaryEnabled({ tabId:'tab-a' })).toBe(true);
    expect(reporting.getFigureSummaryEnabled({ tabId:'tab-b' })).toBe(false);

    reporting.setFigureSummaryEnabled(true, { tabId:'tab-b' });
    reporting.setFigureSummaryEnabled(false, { tabId:'tab-a' });
    expect(reporting.getFigureSummaryEnabled({ tabId:'tab-a' })).toBe(false);
    expect(reporting.getFigureSummaryEnabled({ tabId:'tab-b' })).toBe(true);
  });

  test('capture/apply round-trip preserves the toggle for reopen/recovery state restoration', () => {
    const reporting = window.Shared.statsReporting;
    reporting.setFigureSummaryEnabled(true, { tabId:'tab-a' });
    const captured = reporting.captureTabState({ id:'tab-a', type:'box' });
    expect(captured).toEqual(expect.objectContaining({ figureSummaryEnabled:true }));

    const restored = reporting.applyTabState({ id:'tab-c', type:'box' }, captured, { reason:'test-reopen' });
    expect(restored.figureSummaryEnabled).toBe(true);
    expect(reporting.getFigureSummaryEnabled({ tabId:'tab-c' })).toBe(true);
    expect(reporting.getFigureSummaryEnabled({ tabId:'tab-a' })).toBe(true);
    expect(reporting.getFigureSummaryEnabled({ tabId:'tab-b' })).toBe(false);
  });

  test('Graph summary control is disabled before a report exists and enabled after calculation', () => {
    document.body.innerHTML = `
      <section data-workspace-tab-id="tab-a" data-workspace-component="box">
        <label><input id="summary" class="stats-figure-summary-checkbox" data-parameter-stats-figure-summary="1" disabled /></label>
      </section>`;
    const input = document.getElementById('summary');
    const reporting = window.Shared.statsReporting;

    reporting.bindFigureSummaryControls();
    expect(input.disabled).toBe(true);
    reporting.setFigureSummaryEnabled(true, { tabId:'tab-a' });
    input.checked = true;
    reporting.syncFigureSummaryControls('tab-a');
    expect(input.checked).toBe(false);

    window.Shared.statsFigureSummary.__getReportForTab.mockReturnValue({ reportModel:{} });
    reporting.syncFigureSummaryControls('tab-a');
    expect(input.disabled).toBe(false);
    expect(input.checked).toBe(true);

    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles:true }));
    expect(reporting.getFigureSummaryEnabled({ tabId:'tab-a' })).toBe(true);
  });

  test('all figure-summary publisher targets clear stale queued reports before replacement', () => {
    const cases = [
      { type:'box', panelId:'statsResults', plot:'boxPlot', svgSelector:'#boxPlot svg' },
      { type:'scatter', panelId:'scatterStatsResults', plot:'scatterPlot', svgSelector:'#scatterPlot svg' },
      { type:'line', panelId:'lineStatsResults', plot:'linePlot', svgSelector:'#linePlot svg' },
      { type:'hist', panelId:'histStatsResults', plot:'histPlot', svgSelector:'#histPlot svg' },
      { type:'pca', panelId:'pcaStatsResults', plot:'pcaPlot', svgSelector:'#pcaPlot svg' },
      { type:'pie', panelId:'pieStatsResults', plot:'piePlot', svgSelector:'#piePlot svg' },
      { type:'roc', panelId:'rocStatsResults', plot:'rocPlot', svgSelector:'#rocPlot svg' },
      { type:'survival', panelId:'survivalStatsCox', plot:'survivalPlot', svgSelector:'#survivalPlot svg' },
      { type:'heatmap', panelId:'heatmapStatsContent', plot:'heatmapSvg', svgSelector:'#heatmapSvg' },
      { type:'surface', panelId:'surfaceStatsSummary', plot:'surfaceSvg', svgSelector:'#surfaceSvg' },
      { type:'venn', panelId:'significanceResults', plot:'vennGraphPanel', svgSelector:'#vennGraphPanel svg' }
    ];
    const roots = new Map();
    const tabs = cases.map((entry, index) => ({
      id:`summary-${entry.type}-${index}`,
      type:entry.type,
      isWelcome:false
    }));
    document.body.innerHTML = cases.map((entry, index) => {
      const tabId = tabs[index].id;
      const plotMarkup = entry.type === 'heatmap' || entry.type === 'surface'
        ? `<svg id="${entry.plot}" width="400" height="300" viewBox="0 0 400 300"></svg>`
        : `<div id="${entry.plot}"><svg width="400" height="300" viewBox="0 0 400 300"></svg></div>`;
      return `<section data-workspace-tab-id="${tabId}" data-workspace-component="${entry.type}">
        <div id="${entry.panelId}"></div>
        ${plotMarkup}
      </section>`;
    }).join('');
    cases.forEach((entry, index) => {
      roots.set(`${tabs[index].id}:${entry.type}`, document.querySelector(`[data-workspace-tab-id="${tabs[index].id}"]`));
    });
    window.Main.session.workspaceState = { activeTabId:tabs[0].id, tabs };
    window.Main.session.getActiveTab = () => tabs.find(tab => tab.id === window.Main.session.workspaceState.activeTabId) || null;
    window.Shared.workspaceTabs = {
      getMountedRoot(tabLike, type){
        const tabId = typeof tabLike === 'string' ? tabLike : tabLike?.id;
        return roots.get(`${tabId}:${type}`) || null;
      },
      getSharedControlState(tabLike, key){
        const tabId = typeof tabLike === 'string' ? tabLike : tabLike?.id;
        return sharedByTab.get(`${tabId}:${key}`) || null;
      },
      ensureSharedControlState(tabLike, key){
        const tabId = typeof tabLike === 'string' ? tabLike : tabLike?.id;
        const mapKey = `${tabId}:${key}`;
        if(!sharedByTab.has(mapKey)) sharedByTab.set(mapKey, {});
        return sharedByTab.get(mapKey);
      }
    };
    require('../../js/shared/statsFigureSummary.js');
    const summary = window.Shared.statsFigureSummary;
    const reporting = window.Shared.statsReporting;
    const callbacks = [];
    const previousRaf = window.requestAnimationFrame;
    const previousGlobalRaf = global.requestAnimationFrame;
    window.requestAnimationFrame = callback => {
      callbacks.push(callback);
      return callbacks.length;
    };
    global.requestAnimationFrame = window.requestAnimationFrame;
    const report = marker => ({
      title:'Reporting and reproducibility',
      methodsText:'Current analysis methods.',
      resultsText:`Current result ${marker}.`,
      figureSummary:{
        schemaVersion:1,
        kind:'inferential',
        sections:[{ key:'results', rows:[{ label:'Result', value:`Current result ${marker}.` }] }]
      }
    });
    const flush = () => {
      while(callbacks.length){
        callbacks.shift()();
      }
    };
    try{
      cases.forEach((entry, index) => {
        const tabId = tabs[index].id;
        window.Main.session.workspaceState.activeTabId = tabId;
        const root = roots.get(`${tabId}:${entry.type}`);
        const target = root.querySelector(`#${entry.panelId}`);
        const svg = root.querySelector(entry.svgSelector);
        summary.setEnabledInSharedState(tabId, true);
        reporting.appendReportPanel(target, report('old'), { componentType:entry.type });
        flush();
        expect(summary.__getReportForTab(tabId)?.reportModel?.resultsText).toContain('old');
        expect(svg.textContent).toContain('Current result old.');

        summary.scheduleRender(tabId, { componentType:entry.type, reportModel:report('old') });
        reporting.clearReportHost(target);
        flush();
        expect(summary.__getReportForTab(tabId)).toBeNull();
        expect(svg.textContent).not.toContain('Current result old.');

        reporting.appendReportPanel(target, report('new'), { componentType:entry.type });
        flush();
        expect(summary.__getReportForTab(tabId)?.reportModel?.resultsText).toContain('new');
        expect(svg.textContent).toContain('Current result new.');
        expect(svg.textContent).not.toContain('Current result old.');
      });
    }finally{
      window.requestAnimationFrame = previousRaf;
      global.requestAnimationFrame = previousGlobalRaf;
    }
  });
});
