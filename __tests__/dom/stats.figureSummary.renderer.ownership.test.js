/*
 * Shared SVG statistical/analysis summary contract.
 * These tests exercise the shared renderer through one minimal DOM harness.
 */

const { createStatsFigureSummaryRendererHarness } = require('../../test-support/statsFigureSummaryRendererSuite');

describe('statsFigureSummary renderer ownership and scheduling contracts', () => {
  const harness = createStatsFigureSummaryRendererHarness();

  beforeEach(harness.setup);
  afterEach(harness.cleanup);

  test('clearing a report invalidates an already queued render', () => {
    const tabId = harness.installWorkspace();
    require('../../js/shared/statsFigureSummary.js');
    window.Shared.statsFigureSummary.setEnabledInSharedState(tabId, true);
    const originalRaf = global.requestAnimationFrame;
    const callbacks = [];
    global.requestAnimationFrame = callback => {
      callbacks.push(callback);
      return callbacks.length;
    };
    try{
      expect(window.Shared.statsFigureSummary.registerReportModel({
        tabId,
        componentType:'box',
        reportModel:harness.reportWithValue('Old result')
      })).toBe(true);
      expect(window.Shared.statsFigureSummary.clearReportModel(tabId)).toBe(true);
      callbacks.forEach(callback => callback());
      expect(harness.svg.querySelector('g[data-stats-figure-summary="1"]')).toBeNull();
      expect(window.Shared.statsFigureSummary.__getReportForTab(tabId)).toBeNull();
    }finally{
      global.requestAnimationFrame = originalRaf;
    }
  });

  test('an inactive tab cannot project its registered summary into the active tab SVG', () => {
    const tabId = harness.installWorkspace('tab-a', 'box');
    require('../../js/shared/statsFigureSummary.js');
    window.Shared.statsFigureSummary.setEnabledInSharedState(tabId, true);
    window.Main.session.workspaceState.activeTabId = 'tab-b';
    window.Main.session.workspaceState.tabs.push({ id:'tab-b', type:'box', isWelcome:false });
    window.Main.session.getActiveTab = () => window.Main.session.workspaceState.tabs[1];

    expect(window.Shared.statsFigureSummary.renderForTab(tabId, { reportModel:harness.reportWithValue('Must not render'), componentType:'box' })).toBe(false);
    expect(harness.svg.querySelector('g[data-stats-figure-summary="1"]')).toBeNull();
  });

  test('a queued owner render waits for that tab to become active again', () => {
    const tabA = harness.installWorkspace('tab-a', 'box');
    const rootA = harness.root;
    const svgA = harness.svg;
    const rootB = document.createElement('section');
    rootB.dataset.workspaceTabId = 'tab-b';
    rootB.dataset.workspaceComponent = 'box';
    rootB.innerHTML = '<div id="boxPlot"><svg width="400" height="300" viewBox="0 0 400 300"></svg></div>';
    document.body.appendChild(rootB);
    const svgB = rootB.querySelector('svg');
    svgB.getBoundingClientRect = () => ({ x:0, y:0, left:0, top:0, right:400, bottom:300, width:400, height:300 });
    const tabs = [
      { id:'tab-a', type:'box', isWelcome:false },
      { id:'tab-b', type:'box', isWelcome:false }
    ];
    window.Main.session.workspaceState = { activeTabId:tabA, tabs };
    window.Main.session.getActiveTab = () => tabs.find(tab => tab.id === window.Main.session.workspaceState.activeTabId) || null;
    const getMountedRoot = window.Shared.workspaceTabs.getMountedRoot;
    window.Shared.workspaceTabs.getMountedRoot = (tabId, type) => {
      if(type !== 'box') return null;
      return tabId === 'tab-a' ? rootA : tabId === 'tab-b' ? rootB : getMountedRoot(tabId, type);
    };

    require('../../js/shared/statsFigureSummary.js');
    const summary = window.Shared.statsFigureSummary;
    summary.setEnabledInSharedState(tabA, true);
    const callbacks = [];
    const previousRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = callback => {
      callbacks.push(callback);
      return callbacks.length;
    };
    try{
      expect(summary.registerReportModel({
        tabId:tabA,
        componentType:'box',
        reportModel:harness.reportWithValue('Owned by tab A')
      })).toBe(true);
      expect(callbacks).toHaveLength(1);

      window.Main.session.workspaceState.activeTabId = 'tab-b';
      callbacks[0]();
      expect(svgA.querySelector('g[data-stats-figure-summary="1"]')).toBeNull();
      expect(svgB.querySelector('g[data-stats-figure-summary="1"]')).toBeNull();
      expect(summary.__getReportForTab('tab-a')?.reportModel?.figureSummary?.sections[0]?.rows[0]?.value).toBe('Owned by tab A');

      window.Main.session.workspaceState.activeTabId = 'tab-a';
      window.dispatchEvent(new window.CustomEvent('graphitix:lifecycle-event', {
        detail:{ action:'activate-complete', componentKey:'box', tabId:'tab-a' }
      }));
      expect(svgA.querySelector('g[data-stats-figure-summary="1"]')?.textContent).toContain('Owned by tab A');
      expect(svgB.querySelector('g[data-stats-figure-summary="1"]')).toBeNull();
    }finally{
      window.requestAnimationFrame = previousRaf;
    }
  });

  test('coalesces repeated resize renders into one frame per tab', () => {
    const tabId = harness.installWorkspace();
    require('../../js/shared/statsFigureSummary.js');
    window.Shared.statsFigureSummary.setEnabledInSharedState(tabId, true);
    const callbacks = [];
    const previousRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = callback => {
      callbacks.push(callback);
      return callbacks.length;
    };
    try{
      const reportModel = harness.reportWithValue('t(12) = 2.4; p = 0.031');
      for(let index = 0; index < 6; index += 1){
        window.Shared.statsFigureSummary.scheduleRender(tabId, {
          componentType:'box',
          reportModel,
          allowDuringResize:true
        });
      }
      expect(callbacks).toHaveLength(1);
      callbacks[0]();
      expect(harness.svg.querySelectorAll('g[data-stats-figure-summary="1"]')).toHaveLength(1);
    }finally{
      window.requestAnimationFrame = previousRaf;
    }
  });

  test('a direct post-draw projection supersedes a queued report-registration frame', () => {
    const tabId = harness.installWorkspace();
    require('../../js/shared/statsFigureSummary.js');
    window.Shared.statsFigureSummary.setEnabledInSharedState(tabId, true);
    const callbacks = [];
    const previousRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = callback => {
      callbacks.push(callback);
      return callbacks.length;
    };
    try{
      const reportModel = harness.reportWithValue('The newly published graph frame is authoritative.');
      expect(window.Shared.statsFigureSummary.scheduleRender(tabId, {
        componentType:'box',
        reportModel
      })).toBe(true);
      expect(callbacks).toHaveLength(1);

      expect(window.Shared.statsFigureSummary.renderForTab(tabId, {
        componentType:'box',
        reportModel
      })).toBe(true);
      const heightAfterDirectProjection = Number(harness.svg.getAttribute('height'));

      callbacks[0]();
      expect(harness.svg.querySelectorAll('g[data-stats-figure-summary="1"]')).toHaveLength(1);
      expect(Number(harness.svg.getAttribute('height'))).toBeCloseTo(heightAfterDirectProjection, 6);
    }finally{
      window.requestAnimationFrame = previousRaf;
    }
  });

  test('does not queue a second projection when the draw already handled the summary', () => {
    const tabId = harness.installWorkspace('tab-a', 'surface');
    require('../../js/shared/statsFigureSummary.js');
    window.Shared.statsFigureSummary.setEnabledInSharedState(tabId, true);
    window.Shared.statsFigureSummary.registerReportModel({
      tabId,
      componentType:'surface',
      reportModel:harness.reportWithValue('The draw has already projected this summary.')
    });
    const callbacks = [];
    const previousRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = callback => {
      callbacks.push(callback);
      return callbacks.length;
    };
    try{
      window.dispatchEvent(new window.CustomEvent('graphitix:lifecycle-event', {
        detail: {
          action:'draw-settled',
          componentKey:'surface',
          tabId,
          details:{ summaryProjectionHandled:true }
        }
      }));
      expect(callbacks).toHaveLength(0);
    }finally{
      window.requestAnimationFrame = previousRaf;
    }
  });
});

