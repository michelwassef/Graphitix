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
    require('../js/shared/stats.js');
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
});
