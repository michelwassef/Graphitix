/*
 * Shared SVG statistical/analysis summary contract.
 * These tests exercise the shared renderer through one minimal DOM harness.
 */

const { createStatsFigureSummaryRendererHarness } = require('../../test-support/statsFigureSummaryRendererSuite');

describe('statsFigureSummary renderer layout and viewport contracts', () => {
  const harness = createStatsFigureSummaryRendererHarness();

  beforeEach(harness.setup);
  afterEach(harness.cleanup);

  test('long canonical text is never ellipsized and grows the bottom SVG reserve without accumulating', () => {
    const tabId = harness.installWorkspace();
    require('../../js/shared/statsFigureSummary.js');
    const fullText = 'Welch t-test comparing Control with Drug A: mean difference = -3.42; 95% CI [-5.81, -1.03]; t(17.8) = -3.01; p = 0.0074. This complete canonical sentence must remain visible through its final words: END OF CANONICAL RESULT.';
    window.Shared.statsFigureSummary.setEnabledInSharedState(tabId, true);

    expect(window.Shared.statsFigureSummary.renderForTab(tabId, { reportModel:harness.reportWithValue(fullText), componentType:'box' })).toBe(true);
    const group = harness.svg.querySelector('g[data-stats-figure-summary="1"]');
    expect(group).toBeTruthy();
    expect(Number(String(group.getAttribute('transform')).match(/translate\(0\s+([-\d.]+)/)?.[1])).toBeCloseTo(300, 6);
    const renderedWords = [...group.querySelectorAll('text[data-stats-summary-role="value"] tspan')]
      .map(node => node.textContent || '')
      .join(' ');
    expect(renderedWords).toContain('END OF CANONICAL RESULT.');
    expect(group.textContent).not.toContain('…');
    const firstHeight = Number(harness.svg.getAttribute('height'));
    const firstReserve = Number(harness.svg.dataset.statsFigureSummaryReserveBottom);
    expect(firstHeight).toBeGreaterThan(300);
    expect(firstReserve).toBeGreaterThan(0);

    expect(window.Shared.statsFigureSummary.renderForTab(tabId, { reportModel:harness.reportWithValue(fullText), componentType:'box' })).toBe(true);
    expect(Number(harness.svg.getAttribute('height'))).toBeCloseTo(firstHeight, 6);
    expect(Number(harness.svg.dataset.statsFigureSummaryReserveBottom)).toBeCloseTo(firstReserve, 6);

    window.Shared.statsFigureSummary.setEnabledInSharedState(tabId, false);
    expect(window.Shared.statsFigureSummary.renderForTab(tabId, { componentType:'box' })).toBe(true);
    expect(harness.svg.querySelector('g[data-stats-figure-summary="1"]')).toBeNull();
    expect(Number(harness.svg.getAttribute('height'))).toBeCloseTo(300, 6);
  });

  test('narrow figures keep the shared two-column label/value layout', () => {
    const tabId = harness.installWorkspace();
    harness.svg.setAttribute('width', '220');
    harness.svg.setAttribute('viewBox', '0 0 220 300');
    harness.svg.getBoundingClientRect = () => ({ x:0, y:0, left:0, top:0, right:220, bottom:300, width:220, height:300 });
    require('../../js/shared/statsFigureSummary.js');
    window.Shared.statsFigureSummary.setEnabledInSharedState(tabId, true);
    const value = 'A deliberately long result that should use the full available width when the graph becomes narrow, while retaining every reported estimate and confidence interval.';
    window.Shared.statsFigureSummary.renderForTab(tabId, { reportModel:harness.reportWithValue(value), componentType:'box' });

    const label = harness.svg.querySelector('text[data-stats-summary-role="label"][data-stats-summary-row="0"]');
    const result = harness.svg.querySelector('text[data-stats-summary-role="value"][data-stats-summary-row="0"]');
    expect(label).toBeTruthy();
    expect(result).toBeTruthy();
    expect(Number(result.getAttribute('x'))).toBeGreaterThan(Number(label.getAttribute('x')));
    expect(Number(result.getAttribute('y'))).toBeCloseTo(Number(label.getAttribute('y')), 6);
    const renderedWords = [...result.querySelectorAll('tspan')]
      .map(node => node.textContent || '')
      .join(' ');
    expect(renderedWords).toContain('confidence interval');
  });

  test('rebuilds the cached base viewport after the graph frame is resized', () => {
    const tabId = harness.installWorkspace();
    require('../../js/shared/statsFigureSummary.js');
    window.Shared.statsFigureSummary.setEnabledInSharedState(tabId, true);
    window.Shared.statsFigureSummary.renderForTab(tabId, {
      reportModel:harness.reportWithValue('The summary follows the resized graph frame.'),
      componentType:'box'
    });

    const summaryReserve = Number(harness.svg.dataset.statsFigureSummaryReserveBottom);
    expect(summaryReserve).toBeGreaterThan(0);

    // Simulate the component's settled resize projection while the existing
    // summary group remains mounted for the next shared render.
    harness.svg.setAttribute('height', String(180 + summaryReserve));
    harness.svg.setAttribute('viewBox', `0 0 400 ${180 + summaryReserve}`);
    harness.svg.dataset.graphContentBaseHeight = '180';
    harness.svg.dataset.graphContentReserveBottom = String(summaryReserve);
    harness.svg.dataset.graphContentEnvelopeMaxY = String(180 + summaryReserve);

    expect(window.Shared.statsFigureSummary.renderForTab(tabId, {
      reportModel:harness.reportWithValue('The summary follows the resized graph frame.'),
      componentType:'box'
    })).toBe(true);

    const group = harness.svg.querySelector('g[data-stats-figure-summary="1"]');
    expect(Number(String(group.getAttribute('transform')).match(/translate\(0\s+([-\d.]+)/)?.[1])).toBeCloseTo(180, 6);
    expect(Number(harness.svg.dataset.statsFigureSummaryBaseHeight)).toBeCloseTo(180, 6);
    expect(Number(harness.svg.getAttribute('height'))).toBeCloseTo(180 + summaryReserve, 6);
  });

  test('a reused SVG renderer replaces stale summary viewport metadata with its new graph frame', () => {
    const tabId = harness.installWorkspace();
    require('../../js/shared/statsFigureSummary.js');
    window.Shared.statsFigureSummary.setEnabledInSharedState(tabId, true);
    const reportModel = harness.reportWithValue('The table must not resize the graph that it summarizes.');

    expect(window.Shared.statsFigureSummary.renderForTab(tabId, {
      reportModel,
      componentType:'box'
    })).toBe(true);
    expect(window.Shared.statsFigureSummary.beginGraphRedraw(harness.svg)).toBe(true);

    // A renderer that reuses its SVG root replaces the graph after the shared
    // summary projection was active. Its new viewBox is authoritative, even
    // though the prior graph-content metadata is still present on that root.
    harness.svg.setAttribute('width', '320');
    harness.svg.setAttribute('height', '240');
    harness.svg.setAttribute('viewBox', '0 0 320 240');

    expect(window.Shared.statsFigureSummary.renderForTab(tabId, {
      reportModel,
      componentType:'box',
      graphRedrawn:true
    })).toBe(true);

    const group = harness.svg.querySelector('g[data-stats-figure-summary="1"]');
    expect(Number(String(group.getAttribute('transform')).match(/translate\(0\s+([-\d.]+)/)?.[1])).toBeCloseTo(240, 6);
    expect(Number(harness.svg.dataset.graphContentBaseWidth)).toBeCloseTo(320, 6);
    expect(Number(harness.svg.dataset.graphContentBaseHeight)).toBeCloseTo(240, 6);
    expect(harness.svg.dataset.statsFigureSummaryGraphRedrawn).toBeUndefined();
  });

  test('infers the base viewport from a legacy cached summary reserve', () => {
    const tabId = harness.installWorkspace();
    require('../../js/shared/statsFigureSummary.js');
    window.Shared.statsFigureSummary.setEnabledInSharedState(tabId, true);
    window.Shared.statsFigureSummary.renderForTab(tabId, {
      reportModel:harness.reportWithValue('The legacy cached summary keeps its graph frame.'),
      componentType:'box'
    });

    const summaryReserve = Number(harness.svg.dataset.statsFigureSummaryReserveBottom);
    expect(summaryReserve).toBeGreaterThan(0);
    harness.svg.getAttributeNames().filter(name => /^data-/i.test(name)).forEach(name => harness.svg.removeAttribute(name));
    harness.svg.setAttribute('height', String(300 + summaryReserve));
    harness.svg.setAttribute('viewBox', `0 0 400 ${300 + summaryReserve}`);

    expect(window.Shared.statsFigureSummary.renderForTab(tabId, {
      reportModel:harness.reportWithValue('The legacy cached summary keeps its graph frame.'),
      componentType:'box'
    })).toBe(true);

    const group = harness.svg.querySelector('g[data-stats-figure-summary="1"]');
    expect(Number(String(group.getAttribute('transform')).match(/translate\(0\s+([-\d.]+)/)?.[1])).toBeCloseTo(300, 6);
    expect(Number(harness.svg.dataset.statsFigureSummaryBaseHeight)).toBeCloseTo(300, 6);
    const viewBoxHeight = Number(String(harness.svg.getAttribute('viewBox')).trim().split(/[ ,]+/)[3]);
    expect(viewBoxHeight).toBeGreaterThan(300);
    expect(viewBoxHeight).toBeLessThan(300 + summaryReserve * 1.5);
  });

  test('reprojects after an observed layout resize', () => {
    const tabId = harness.installWorkspace();
    require('../../js/shared/statsFigureSummary.js');
    window.Shared.statsFigureSummary.setEnabledInSharedState(tabId, true);
    const originalRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = callback => {
      callback();
      return 1;
    };
    try{
      window.Shared.statsFigureSummary.registerReportModel({
        tabId,
        componentType:'box',
        reportModel:harness.reportWithValue('The summary follows the observed graph frame.')
      });
      window.Shared.statsFigureSummary.renderForTab(tabId, {
        reportModel:harness.reportWithValue('The summary follows the observed graph frame.'),
        componentType:'box'
      });

      const summaryReserve = Number(harness.svg.dataset.statsFigureSummaryReserveBottom);
      harness.svg.setAttribute('height', String(180 + summaryReserve));
      harness.svg.setAttribute('viewBox', `0 0 400 ${180 + summaryReserve}`);
      harness.svg.dataset.graphContentBaseHeight = '180';
      harness.svg.dataset.graphContentReserveBottom = String(summaryReserve);
      harness.svg.dataset.graphContentEnvelopeMaxY = String(180 + summaryReserve);

      window.dispatchEvent(new window.CustomEvent('graphitix:lifecycle-event', {
        detail: {
          action:'resize-phase',
          componentKey:'box',
          tabId,
          phase:'observe'
        }
      }));

      const group = harness.svg.querySelector('g[data-stats-figure-summary="1"]');
      expect(Number(String(group.getAttribute('transform')).match(/translate\(0\s+([-\d.]+)/)?.[1])).toBeCloseTo(180, 6);
    }finally{
      window.requestAnimationFrame = originalRaf;
    }
  });

  test('does not fall back to a visible page when mounted root resolution fails', () => {
    const tabId = harness.installWorkspace();
    require('../../js/shared/statsFigureSummary.js');
    window.Shared.workspaceTabs.getMountedRoot = () => {
      throw new Error('mounted root unavailable');
    };
    expect(window.Shared.statsFigureSummary.resolveSvg(tabId, 'box')).toBeNull();
  });

  test('explicit stacked metadata cannot change the shared two-column row geometry', () => {
    const tabId = harness.installWorkspace();
    require('../../js/shared/statsFigureSummary.js');
    window.Shared.statsFigureSummary.setEnabledInSharedState(tabId, true);
    const reportModel = {
      figureSummary: {
        kind:'inferential',
        sections:[{
          key:'results',
          rows:[
            { label:'Analysis', value:'Pearson association · linear model' },
            { label:'Long result', value:'Estimate = 6.88; 95% CI [6.84, 6.92]; p < 0.0001; R² = 0.9957', stacked:true },
            { label:'Diagnostics', value:'Jarque–Bera p < 0.0001; runs p = 0.2303', stacked:true }
          ]
        }]
      }
    };
    expect(window.Shared.statsFigureSummary.renderForTab(tabId, { reportModel, componentType:'box' })).toBe(true);
    const labels = [...harness.svg.querySelectorAll('text[data-stats-summary-role="label"]')];
    const values = [...harness.svg.querySelectorAll('text[data-stats-summary-role="value"]')];
    expect(labels).toHaveLength(3);
    expect(values).toHaveLength(3);
    const valueXs = values.map(value => Number(value.getAttribute('x')));
    expect(new Set(valueXs).size).toBe(1);
    values.forEach((value, index) => {
      expect(Number(value.getAttribute('x'))).toBeGreaterThan(Number(labels[index].getAttribute('x')));
      expect(Number(value.getAttribute('y'))).toBeCloseTo(Number(labels[index].getAttribute('y')), 6);
    });
  });

  test('responsive large-coordinate SVGs convert rendered pixels to user units without becoming physically huge', () => {
    const tabId = harness.installWorkspace();
    harness.svg.setAttribute('width', '400');
    harness.svg.setAttribute('height', '200');
    harness.svg.setAttribute('viewBox', '0 0 2000 1000');
    harness.svg.getBoundingClientRect = () => ({ x:0, y:0, left:0, top:0, right:400, bottom:200, width:400, height:200 });
    require('../../js/shared/statsFigureSummary.js');
    window.Shared.statsFigureSummary.setEnabledInSharedState(tabId, true);
    window.Shared.statsFigureSummary.renderForTab(tabId, {
      reportModel:harness.reportWithValue('Complete heatmap inference row with a readable rendered font and a bottom reserve expressed consistently in SVG user units.'),
      componentType:'box'
    });

    const viewBox = String(harness.svg.getAttribute('viewBox')).split(/\s+/).map(Number);
    const renderedHeight = Number(harness.svg.getAttribute('height'));
    expect(viewBox[3]).toBeGreaterThan(1000);
    expect(renderedHeight).toBeGreaterThan(200);
    expect(renderedHeight).toBeLessThan(1500);
    expect(renderedHeight * Number(harness.svg.dataset.graphContentRenderedScaleY)).toBeLessThan(500);
    expect(Number(harness.svg.dataset.graphContentRenderedScaleX)).toBeCloseTo(0.2, 4);
    expect(Number(harness.svg.dataset.graphContentRenderedScaleY)).toBeCloseTo(0.2, 4);
  });
});

