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

