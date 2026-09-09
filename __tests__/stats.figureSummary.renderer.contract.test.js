/*
 * Shared SVG statistical/analysis summary contract.
 * These tests exercise layout/ownership behavior without depending on a
 * component's statistical implementation.
 */

describe('statsFigureSummary shared SVG renderer', () => {
  let sharedStates;
  let root;
  let svg;

  function installWorkspace(tabId = 'tab-a', type = 'box') {
    sharedStates = new Map();
    document.body.innerHTML = `
      <section id="${type}Page" data-workspace-tab-id="${tabId}" data-workspace-component="${type}">
        <div class="svgbox"><div id="${type}Plot"><svg width="400" height="300" viewBox="0 0 400 300"></svg></div></div>
      </section>`;
    root = document.getElementById(`${type}Page`);
    svg = root.querySelector('svg');
    svg.getBoundingClientRect = () => ({ x:0, y:0, left:0, top:0, right:400, bottom:300, width:400, height:300 });

    const tabs = [{ id:tabId, type, isWelcome:false }];
    global.Main = window.Main = {
      session: {
        workspaceState: { activeTabId:tabId, tabs },
        getActiveTab: () => tabs[0]
      }
    };
    window.Shared.workspaceTabs = {
      getMountedRoot: (id, componentType) => id === tabId && componentType === type ? root : null,
      getSharedControlState: (_tabLike, key) => sharedStates.get(`${tabId}:${key}`) || null,
      ensureSharedControlState: (_tabLike, key) => {
        const mapKey = `${tabId}:${key}`;
        if(!sharedStates.has(mapKey)) sharedStates.set(mapKey, {});
        return sharedStates.get(mapKey);
      }
    };
    return tabId;
  }

  function reportWithValue(value) {
    return {
      figureSummary: {
        schemaVersion:1,
        kind:'inferential',
        title:'Statistical analysis summary',
        sections:[{
          key:'results',
          label:'Results',
          rows:[{ label:'Key result', value }]
        }]
      }
    };
  }

  beforeEach(() => {
    jest.resetModules();
    delete window.Shared;
    global.Shared = {};
    window.Shared = global.Shared;
    require('../js/shared/chartStyle.js');
  });

  afterEach(() => {
    delete global.Main;
    delete window.Main;
    delete global.Shared;
    delete window.Shared;
  });

  test('long canonical text is never ellipsized and grows the bottom SVG reserve without accumulating', () => {
    const tabId = installWorkspace();
    require('../js/shared/statsFigureSummary.js');
    const fullText = 'Welch t-test comparing Control with Drug A: mean difference = -3.42; 95% CI [-5.81, -1.03]; t(17.8) = -3.01; p = 0.0074. This complete canonical sentence must remain visible through its final words: END OF CANONICAL RESULT.';
    window.Shared.statsFigureSummary.setEnabledInSharedState(tabId, true);

    expect(window.Shared.statsFigureSummary.renderForTab(tabId, { reportModel:reportWithValue(fullText), componentType:'box' })).toBe(true);
    const group = svg.querySelector('g[data-stats-figure-summary="1"]');
    expect(group).toBeTruthy();
    expect(Number(String(group.getAttribute('transform')).match(/translate\(0\s+([-\d.]+)/)?.[1])).toBeCloseTo(300, 6);
    const renderedWords = [...group.querySelectorAll('text[data-stats-summary-role="value"] tspan')]
      .map(node => node.textContent || '')
      .join(' ');
    expect(renderedWords).toContain('END OF CANONICAL RESULT.');
    expect(group.textContent).not.toContain('…');
    const firstHeight = Number(svg.getAttribute('height'));
    const firstReserve = Number(svg.dataset.statsFigureSummaryReserveBottom);
    expect(firstHeight).toBeGreaterThan(300);
    expect(firstReserve).toBeGreaterThan(0);

    expect(window.Shared.statsFigureSummary.renderForTab(tabId, { reportModel:reportWithValue(fullText), componentType:'box' })).toBe(true);
    expect(Number(svg.getAttribute('height'))).toBeCloseTo(firstHeight, 6);
    expect(Number(svg.dataset.statsFigureSummaryReserveBottom)).toBeCloseTo(firstReserve, 6);

    window.Shared.statsFigureSummary.setEnabledInSharedState(tabId, false);
    expect(window.Shared.statsFigureSummary.renderForTab(tabId, { componentType:'box' })).toBe(true);
    expect(svg.querySelector('g[data-stats-figure-summary="1"]')).toBeNull();
    expect(Number(svg.getAttribute('height'))).toBeCloseTo(300, 6);
  });

  test('narrow figures keep the shared two-column label/value layout', () => {
    const tabId = installWorkspace();
    svg.setAttribute('width', '220');
    svg.setAttribute('viewBox', '0 0 220 300');
    svg.getBoundingClientRect = () => ({ x:0, y:0, left:0, top:0, right:220, bottom:300, width:220, height:300 });
    require('../js/shared/statsFigureSummary.js');
    window.Shared.statsFigureSummary.setEnabledInSharedState(tabId, true);
    const value = 'A deliberately long result that should use the full available width when the graph becomes narrow, while retaining every reported estimate and confidence interval.';
    window.Shared.statsFigureSummary.renderForTab(tabId, { reportModel:reportWithValue(value), componentType:'box' });

    const label = svg.querySelector('text[data-stats-summary-role="label"][data-stats-summary-row="0"]');
    const result = svg.querySelector('text[data-stats-summary-role="value"][data-stats-summary-row="0"]');
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
    const tabId = installWorkspace();
    require('../js/shared/statsFigureSummary.js');
    window.Shared.statsFigureSummary.setEnabledInSharedState(tabId, true);
    window.Shared.statsFigureSummary.renderForTab(tabId, {
      reportModel:reportWithValue('The summary follows the resized graph frame.'),
      componentType:'box'
    });

    const summaryReserve = Number(svg.dataset.statsFigureSummaryReserveBottom);
    expect(summaryReserve).toBeGreaterThan(0);

    // Simulate the component's settled resize projection while the existing
    // summary group remains mounted for the next shared render.
    svg.setAttribute('height', String(180 + summaryReserve));
    svg.setAttribute('viewBox', `0 0 400 ${180 + summaryReserve}`);
    svg.dataset.graphContentBaseHeight = '180';
    svg.dataset.graphContentReserveBottom = String(summaryReserve);
    svg.dataset.graphContentEnvelopeMaxY = String(180 + summaryReserve);

    expect(window.Shared.statsFigureSummary.renderForTab(tabId, {
      reportModel:reportWithValue('The summary follows the resized graph frame.'),
      componentType:'box'
    })).toBe(true);

    const group = svg.querySelector('g[data-stats-figure-summary="1"]');
    expect(Number(String(group.getAttribute('transform')).match(/translate\(0\s+([-\d.]+)/)?.[1])).toBeCloseTo(180, 6);
    expect(Number(svg.dataset.statsFigureSummaryBaseHeight)).toBeCloseTo(180, 6);
    expect(Number(svg.getAttribute('height'))).toBeCloseTo(180 + summaryReserve, 6);
  });

  test('a reused SVG renderer replaces stale summary viewport metadata with its new graph frame', () => {
    const tabId = installWorkspace();
    require('../js/shared/statsFigureSummary.js');
    window.Shared.statsFigureSummary.setEnabledInSharedState(tabId, true);
    const reportModel = reportWithValue('The table must not resize the graph that it summarizes.');

    expect(window.Shared.statsFigureSummary.renderForTab(tabId, {
      reportModel,
      componentType:'box'
    })).toBe(true);
    expect(window.Shared.statsFigureSummary.beginGraphRedraw(svg)).toBe(true);

    // A renderer that reuses its SVG root replaces the graph after the shared
    // summary projection was active. Its new viewBox is authoritative, even
    // though the prior graph-content metadata is still present on that root.
    svg.setAttribute('width', '320');
    svg.setAttribute('height', '240');
    svg.setAttribute('viewBox', '0 0 320 240');

    expect(window.Shared.statsFigureSummary.renderForTab(tabId, {
      reportModel,
      componentType:'box',
      graphRedrawn:true
    })).toBe(true);

    const group = svg.querySelector('g[data-stats-figure-summary="1"]');
    expect(Number(String(group.getAttribute('transform')).match(/translate\(0\s+([-\d.]+)/)?.[1])).toBeCloseTo(240, 6);
    expect(Number(svg.dataset.graphContentBaseWidth)).toBeCloseTo(320, 6);
    expect(Number(svg.dataset.graphContentBaseHeight)).toBeCloseTo(240, 6);
    expect(svg.dataset.statsFigureSummaryGraphRedrawn).toBeUndefined();
  });

  test('infers the base viewport from a legacy cached summary reserve', () => {
    const tabId = installWorkspace();
    require('../js/shared/statsFigureSummary.js');
    window.Shared.statsFigureSummary.setEnabledInSharedState(tabId, true);
    window.Shared.statsFigureSummary.renderForTab(tabId, {
      reportModel:reportWithValue('The legacy cached summary keeps its graph frame.'),
      componentType:'box'
    });

    const summaryReserve = Number(svg.dataset.statsFigureSummaryReserveBottom);
    expect(summaryReserve).toBeGreaterThan(0);
    svg.getAttributeNames().filter(name => /^data-/i.test(name)).forEach(name => svg.removeAttribute(name));
    svg.setAttribute('height', String(300 + summaryReserve));
    svg.setAttribute('viewBox', `0 0 400 ${300 + summaryReserve}`);

    expect(window.Shared.statsFigureSummary.renderForTab(tabId, {
      reportModel:reportWithValue('The legacy cached summary keeps its graph frame.'),
      componentType:'box'
    })).toBe(true);

    const group = svg.querySelector('g[data-stats-figure-summary="1"]');
    expect(Number(String(group.getAttribute('transform')).match(/translate\(0\s+([-\d.]+)/)?.[1])).toBeCloseTo(300, 6);
    expect(Number(svg.dataset.statsFigureSummaryBaseHeight)).toBeCloseTo(300, 6);
    const viewBoxHeight = Number(String(svg.getAttribute('viewBox')).trim().split(/[ ,]+/)[3]);
    expect(viewBoxHeight).toBeGreaterThan(300);
    expect(viewBoxHeight).toBeLessThan(300 + summaryReserve * 1.5);
  });

  test('reprojects after an observed layout resize', () => {
    const tabId = installWorkspace();
    require('../js/shared/statsFigureSummary.js');
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
        reportModel:reportWithValue('The summary follows the observed graph frame.')
      });
      window.Shared.statsFigureSummary.renderForTab(tabId, {
        reportModel:reportWithValue('The summary follows the observed graph frame.'),
        componentType:'box'
      });

      const summaryReserve = Number(svg.dataset.statsFigureSummaryReserveBottom);
      svg.setAttribute('height', String(180 + summaryReserve));
      svg.setAttribute('viewBox', `0 0 400 ${180 + summaryReserve}`);
      svg.dataset.graphContentBaseHeight = '180';
      svg.dataset.graphContentReserveBottom = String(summaryReserve);
      svg.dataset.graphContentEnvelopeMaxY = String(180 + summaryReserve);

      window.dispatchEvent(new window.CustomEvent('graphitix:lifecycle-event', {
        detail: {
          action:'resize-phase',
          componentKey:'box',
          tabId,
          phase:'observe'
        }
      }));

      const group = svg.querySelector('g[data-stats-figure-summary="1"]');
      expect(Number(String(group.getAttribute('transform')).match(/translate\(0\s+([-\d.]+)/)?.[1])).toBeCloseTo(180, 6);
    }finally{
      window.requestAnimationFrame = originalRaf;
    }
  });

  test('does not fall back to a visible page when mounted-root resolution fails', () => {
    const tabId = installWorkspace();
    require('../js/shared/statsFigureSummary.js');
    window.Shared.workspaceTabs.getMountedRoot = () => {
      throw new Error('mounted root unavailable');
    };
    expect(window.Shared.statsFigureSummary.resolveSvg(tabId, 'box')).toBeNull();
  });

  test('generated statistical tables keep common expressions intact while wrapping', () => {
    const cases = [
      {
        name:'Line association and model',
        value:'n = 10; r = 0.989; 95% CI [0.954, 0.998]; p < 0.001 · R² = 0.979; adjusted R² = 0.976; F(1, 8) = 368.48; p < 0.001; RMSE = 4.43',
        expressions:['n = 10', 'r = 0.989', '95% CI [0.954, 0.998]', 'p < 0.001', 'R² = 0.979', 'adjusted R² = 0.976', 'F(1, 8) = 368.48', 'RMSE = 4.43']
      },
      {
        name:'Box comparison',
        value:'Difference (A-B) = -8.79; t(18) = -7.46; df = 18; 95% CI [-11.26, -6.32]; p < 0.001; Cohen’s d = -3.34',
        expressions:['Difference (A-B) = -8.79', 't(18) = -7.46', 'df = 18', '95% CI [-11.26, -6.32]', 'p < 0.001', 'Cohen’s d = -3.34']
      },
      {
        name:'ROC performance',
        value:'n+ = 18; n− = 22; AUC = 0.824; 95% CI [0.749, 0.899]; p = 0.002; sensitivity = 0.81; specificity = 0.76',
        expressions:['n+ = 18', 'n− = 22', 'AUC = 0.824', '95% CI [0.749, 0.899]', 'p = 0.002', 'sensitivity = 0.81', 'specificity = 0.76']
      },
      {
        name:'Chi-square association',
        value:'χ²(4) = 40.14; p < 0.001; Cramér’s V = 0.215; N = 870',
        expressions:['χ²(4) = 40.14', 'p < 0.001', 'Cramér’s V = 0.215', 'N = 870']
      },
      {
        name:'Distribution diagnostics',
        value:'KS D = 0.068; p = 0.002; AD A² = 3.14; p = 0.002; ΔAICc = 12.5',
        expressions:['KS D = 0.068', 'p = 0.002', 'AD A² = 3.14', 'ΔAICc = 12.5']
      },
      {
        name:'Survival result',
        value:'Hazard ratio = 1.42; 95% CI [1.11, 1.82]; z = 2.67; p = 0.008; events = 37',
        expressions:['Hazard ratio = 1.420', '95% CI [1.110, 1.820]', 'z = 2.67', 'p = 0.008', 'events = 37']
      },
      {
        name:'Association without intervals',
        value:'Spearman ρ = 0.950; p < 0.001; n = 10; separate per-series inferential p-values are not multiplicity-adjusted',
        expressions:['ρ = 0.95', 'p < 0.001', 'n = 10']
      },
      {
        name:'Long explanatory text',
        value:'This sentence explains the analysis context before reporting the estimate = 6.88; 95% CI [6.84, 6.92]; p = 0.004, followed by the interpretation.',
        expressions:['estimate = 6.88', '95% CI [6.84, 6.92]', 'p = 0.004']
      }
    ];
    const tabId = installWorkspace('tab-a', 'line');
    svg.setAttribute('width', '300');
    svg.setAttribute('viewBox', '0 0 300 300');
    svg.getBoundingClientRect = () => ({ x:0, y:0, left:0, top:0, right:300, bottom:300, width:300, height:300 });
    require('../js/shared/statsFigureSummary.js');
    window.Shared.statsFigureSummary.setEnabledInSharedState(tabId, true);

    cases.forEach(({ name, value, expressions }) => {
      window.Shared.statsFigureSummary.renderForTab(tabId, { reportModel:reportWithValue(value), componentType:'line' });
      const result = svg.querySelector('text[data-stats-summary-role="value"][data-stats-summary-row="0"]');
      const lines = [...(result?.querySelectorAll('tspan') || [])].map(node => node.textContent || '');
      expect(lines.join(' ')).toContain(value.split(' ')[0]);
      expressions.forEach(expression => {
        expect(lines.some(line => line.includes(expression))).toBe(true);
      });
      expect(lines.some(line => /^(?:p|q)\s*[<>=≤≥]\s*$/.test(line.trim()))).toBe(false);
      expect(lines.some(line => /^(?:R²|R2|CI|df|AUC|RMSE|KS D|AD A²)\s*$/.test(line.trim()))).toBe(false);
      expect(lines.some(line => /^(?:=|,|;|·|\))/.test(line.trim()))).toBe(false);
      if(name === 'Line association and model'){
        expect(lines.some(line => line.includes('p < 0.001'))).toBe(true);
        expect(lines.some(line => line.includes('R² = 0.979'))).toBe(true);
        expect(lines.some(line => line.includes('F(1, 8) = 368.48'))).toBe(true);
        expect(lines.some(line => line.includes('RMSE = 4.43'))).toBe(true);
      }
    });
  });

  test('explicit stacked metadata cannot change the shared two-column row geometry', () => {
    const tabId = installWorkspace();
    require('../js/shared/statsFigureSummary.js');
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
    const labels = [...svg.querySelectorAll('text[data-stats-summary-role="label"]')];
    const values = [...svg.querySelectorAll('text[data-stats-summary-role="value"]')];
    expect(labels).toHaveLength(3);
    expect(values).toHaveLength(3);
    const valueXs = values.map(value => Number(value.getAttribute('x')));
    expect(new Set(valueXs).size).toBe(1);
    values.forEach((value, index) => {
      expect(Number(value.getAttribute('x'))).toBeGreaterThan(Number(labels[index].getAttribute('x')));
      expect(Number(value.getAttribute('y'))).toBeCloseTo(Number(labels[index].getAttribute('y')), 6);
    });
  });

  test('explicit figure roles outrank legacy text heuristics', () => {
    const tabId = installWorkspace();
    require('../js/shared/statsFigureSummary.js');
    window.Shared.statsFigureSummary.setEnabledInSharedState(tabId, true);
    const reportModel = {
      figureSummary: {
        kind:'analysis',
        sections:[
          { key:'analysis', rows:[
            { label:'Analysis', value:'Analysis uses input variables selected for the current graph.', figureRole:'analysis', figurePriority:80 },
            { label:'Configuration', value:'Configuration input and scaling metadata.', figureRole:'metadata', figureInclude:false }
          ] },
          { key:'results', rows:[
            { label:'Slope', value:'slope = 0.82; 95% CI [0.40, 1.24]; p = 0.004', figureRole:'effect', figurePriority:70 }
          ] }
        ]
      }
    };
    expect(window.Shared.statsFigureSummary.renderForTab(tabId, { reportModel, componentType:'box' })).toBe(true);
    const text = svg.querySelector('g[data-stats-figure-summary="1"]')?.textContent || '';
    expect(text).toContain('input variables');
    expect(text).not.toContain('Configuration input');
  });

  test('compact summary precision rounds statistics without weakening p-value or interval reporting', () => {
    const tabId = installWorkspace();
    require('../js/shared/statsFigureSummary.js');
    const format = window.Shared.statsFigureSummary.formatCompactSummaryValue;
    expect(format('One-way ANOVA; F = 41.5572; df = 5.00, 54.00; p < 0.0001; difference = -18.0800; 95% CI [-20.6180, -15.5420]', {
      section:'results',
      figureRole:'test'
    })).toBe('One-way ANOVA; F = 41.56; df = 5, 54; p < 0.001; difference = -18.08; 95% CI [-20.62, -15.54]');
    expect(format('r = 0.9979; R² = 0.9957; p = 0.0488; RMSE = 1.5892', {
      section:'results',
      figureRole:'effect'
    })).toBe('r = 0.998; R² = 0.996; p = 0.0488; RMSE = 1.59');
    expect(format('p = 0.0272; p = 0.0057; p = 0.10', {
      section:'results',
      figureRole:'test'
    })).toBe('p = 0.0272; p = 0.0057; p = 0.1');
    expect(format('p = 0.04996; q = 0.999', {
      section:'results',
      figureRole:'test'
    })).toBe('p = 0.04996; q = 0.999');
    expect(format('p < 0.00001; p = -0.2; p = 1.4', {
      section:'results',
      figureRole:'test'
    })).toBe('p < 0.001; p = unavailable (invalid probability); p = unavailable (invalid probability)');
    expect(format('p = < 0.0001; p > 0.0002; p >= 0.00001', {
      section:'results',
      figureRole:'test'
    })).toBe('p < 0.001; p > 0.0002; p >= 0.00001');
    expect(format('p = 0', {
      section:'results',
      figureRole:'test'
    })).toBe('p < 0.001');
    expect(format('p = 0.0000027757; p = 0.00003742; p = 0.00064923', {
      section:'results',
      figureRole:'test'
    })).toBe('p < 0.001; p < 0.001; p < 0.001');
    expect(format('p = 0.99996', {
      section:'results',
      figureRole:'test'
    })).toBe('p = 0.99996');
    expect(format('p = 0.00000000000123', {
      section:'results',
      figureRole:'test'
    })).toBe('p < 0.001');
    expect(format('Difference (A-B) = -8.7900; 95% CI -11.2643 to -6.3157', {
      section:'results',
      figureRole:'effect'
    })).toBe('Difference (A-B) = -8.79; 95% CI -11.26 to -6.32');
    expect(format('-3.338', {
      label:"Effect (Cohen's d)",
      section:'results',
      figureRole:'effect'
    })).toBe('-3.34');
    expect(format('-1.000', {
      label:'Effect (Rank-biserial r)',
      section:'results',
      figureRole:'effect'
    })).toBe('-1');
    expect(format('25.0', {
      label:'Sample size',
      section:'results',
      figureRole:'effect'
    })).toBe('25');
    expect(format('0.0001', {
      label:'p-value',
      section:'results',
      figureRole:'test'
    })).toBe('< 0.001');
    expect(format('1.000', {
      label:'R²',
      section:'results',
      figureRole:'effect'
    })).toBe('1');
    expect(format('χ²(4) = 40.1367; p < 0.001; Cramér’s V = 0.2148', {
      section:'results',
      figureRole:'effect'
    })).toBe('χ²(4) = 40.14; p < 0.001; Cramér’s V = 0.215');
    expect(format('KS D = 0.0677; AD A² = 3.1415; ΔAICc = 12.5000', {
      section:'diagnostics',
      figureRole:'diagnostic'
    })).toBe('KS D = 0.068; AD A² = 3.14; ΔAICc = 12.5');
    expect(format('37.50% variance explained · eigenvalue = 0.1234', {
      section:'results',
      figureRole:'effect'
    })).toBe('37.5% variance explained · eigenvalue = 0.123');
    expect(format('0.9876 · 123 comparable pairs', {
      label:"Harrell's C",
      section:'diagnostics',
      figureRole:'diagnostic'
    })).toBe('0.988 · 123 comparable pairs');
    expect(format('observed overlap = 14.000; expected under the hypergeometric null = 7.5000', {
      section:'results',
      figureRole:'effect'
    })).toBe('observed overlap = 14; expected under the hypergeometric null = 7.5');
    expect(format('0.0677', {
      label:'KS D',
      section:'diagnostics',
      figureRole:'diagnostic'
    })).toBe('0.068');
    expect(format('Pearson χ² = 40.1367; p = 0.0149', {
      section:'results',
      figureRole:'effect'
    })).toBe('Pearson χ² = 40.14; p = 0.0149');
    expect(format('VC 0.5 mg, VC 1.0 mg; α = 0.05', {
      section:'analysis',
      figureRole:'analysis'
    })).toBe('VC 0.5 mg, VC 1.0 mg; α = 0.05');
    expect(format('r = 0.820; 95% CI [0.8200, 0.9900]; p = 0.032', {
      section:'results',
      figureRole:'association'
    })).toBe('r = 0.820; 95% CI [0.820, 0.990]; p = 0.032');
    expect(format('r = 0.9979; 95% CI [0.9975, 0.9982]; p < 0.001', {
      section:'results',
      figureRole:'association'
    })).toBe('r = 0.9980; 95% CI [0.9975, 0.9982]; p < 0.001');
    expect(format('95% CI [0.00012, 0.00018]', {
      section:'results',
      figureRole:'effect'
    })).toBe('95% CI [0.000120, 0.000180]');
    expect(window.Shared.statsFigureSummary.COMPACT_P_VALUE_DISPLAY_FLOOR).toBe(0.001);
  });

  test('uses the compact p-value floor consistently for SVG, accessible HTML, and export', () => {
    const tabId = installWorkspace();
    root.querySelector('.svgbox').insertAdjacentHTML('afterend', '<div class="graph-export-controls"></div>');
    require('../js/shared/statsFigureSummary.js');
    window.Shared.statsFigureSummary.setEnabledInSharedState(tabId, true);
    const reportModel = {
      figureSummary: {
        schemaVersion:1,
        kind:'inferential',
        sections:[{
          key:'results',
          rows:[{
            label:'Key result',
            value:'p < 0.0001; p = 0.0007; p > 0.0002'
          }]
        }]
      }
    };
    expect(window.Shared.statsFigureSummary.registerReportModel({
      tabId,
      componentType:'box',
      reportModel
    })).toBe(true);
    expect(window.Shared.statsFigureSummary.renderForTab(tabId, {
      componentType:'box'
    })).toBe(true);

    const expected = 'p < 0.001; p < 0.001; p > 0.0002';
    const group = svg.querySelector('g[data-stats-figure-summary="1"]');
    expect(group?.textContent).toContain(expected);
    const details = root.querySelector('[data-stats-figure-summary-accessible="1"]');
    expect(details?.textContent).toContain(expected);
    expect(window.Shared.statsFigureSummary.getExportModel(tabId, 'box')?.rows)
      .toEqual([['Key result', expected]]);
  });

  test('structured underflowed p-values are rendered as inequalities, never exact zero', () => {
    const tabId = installWorkspace('tab-a', 'scatter');
    require('../js/shared/statsFigureSummary.js');
    window.Shared.statsFigureSummary.setEnabledInSharedState(tabId, true);
    const reportModel = {
      figureSummary: {
        kind:'inferential',
        sections:[{
          key:'results',
          rows:[{
            label:'Association',
            valueParts:['r = 0.998; p = ', { type:'pValue', value:0 }],
            figureRole:'effect'
          }]
        }]
      }
    };
    expect(window.Shared.statsFigureSummary.renderForTab(tabId, { reportModel, componentType:'scatter' })).toBe(true);
    const text = svg.textContent || '';
    expect(text).toContain('p < 0.001');
    expect(text).not.toContain('p = 0');
  });

  test('clearing a report invalidates an already queued render', () => {
    const tabId = installWorkspace();
    require('../js/shared/statsFigureSummary.js');
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
        reportModel:reportWithValue('Old result')
      })).toBe(true);
      expect(window.Shared.statsFigureSummary.clearReportModel(tabId)).toBe(true);
      callbacks.forEach(callback => callback());
      expect(svg.querySelector('g[data-stats-figure-summary="1"]')).toBeNull();
      expect(window.Shared.statsFigureSummary.__getReportForTab(tabId)).toBeNull();
    }finally{
      global.requestAnimationFrame = originalRaf;
    }
  });

  test('summary style changes distinguish layout edits from paint-only edits', () => {
    const tabId = installWorkspace();
    require('../js/shared/statsFigureSummary.js');
    const summary = window.Shared.statsFigureSummary;
    expect(summary.summaryStyleChangesLayout({
      tabId,
      style:{ fill:'#123456' },
      patchKeys:['fill']
    })).toBe(false);
    expect(summary.summaryStyleChangesLayout({
      tabId,
      style:{ fontSize:'18px' },
      patchKeys:['fontSize']
    })).toBe(true);
    expect(summary.summaryStyleChangesLayout({
      tabId,
      style:{ fontFamily:'Georgia', fill:'#123456' }
    })).toBe(true);
  });

  test('primary series and overlap families are complete even when they exceed the compact row budget', () => {
    let tabId = installWorkspace('tab-a', 'line');
    require('../js/shared/statsFigureSummary.js');
    const line = window.Shared.statsFigureSummary.normalizeModel({
      figureSummary: {
        sections: [
          { key:'analysis', rows:[
            { label:'Analysis', value:'4 series', figureRole:'analysis' },
            { label:'Inference', value:'95% confidence intervals', figureRole:'inference' }
          ] },
          { key:'results', rows:[
            { label:'Mean reaction time · association', value:'r = 0.82; p = 0.01', figureRole:'association' },
            { label:'Median reaction time · association', value:'r = 0.81; p = 0.02', figureRole:'association' },
            { label:'25th percentile · association', value:'r = 0.80; p = 0.03', figureRole:'association' },
            { label:'75th percentile · association', value:'r = 0.79; p = 0.04', figureRole:'association' }
          ] }
        ]
      }
    }, tabId, 'line');
    expect(line.sections[0].rows.map(row => row.label)).toEqual([
      'Analysis', 'Inference', 'Mean reaction time', 'Median reaction time', '25th percentile', '75th percentile'
    ]);

    tabId = installWorkspace('tab-a', 'venn');
    const venn = window.Shared.statsFigureSummary.normalizeModel({
      figureSummary: {
        sections: [
          { key:'analysis', rows:[{ label:'Analysis', value:'4 overlap tests', figureRole:'analysis' }] },
          { key:'results', rows:[
            { label:'A ∩ B', value:'observed overlap = 14; p = 0.01', figureRole:'effect' },
            { label:'A ∩ C', value:'observed overlap = 12; p = 0.02', figureRole:'effect' },
            { label:'B ∩ C', value:'observed overlap = 10; p = 0.03', figureRole:'effect' },
            { label:'A ∩ B ∩ C', value:'observed overlap = 8; p = 0.04', figureRole:'effect' }
          ] }
        ]
      }
    }, tabId, 'venn');
    expect(venn.sections[0].rows.map(row => row.label)).toEqual([
      'Analysis', 'Key result', 'A ∩ C', 'B ∩ C', 'A ∩ B ∩ C'
    ]);
  });

  test('responsive large-coordinate SVGs convert rendered pixels to user units without becoming physically huge', () => {
    const tabId = installWorkspace();
    svg.setAttribute('width', '400');
    svg.setAttribute('height', '200');
    svg.setAttribute('viewBox', '0 0 2000 1000');
    svg.getBoundingClientRect = () => ({ x:0, y:0, left:0, top:0, right:400, bottom:200, width:400, height:200 });
    require('../js/shared/statsFigureSummary.js');
    window.Shared.statsFigureSummary.setEnabledInSharedState(tabId, true);
    window.Shared.statsFigureSummary.renderForTab(tabId, {
      reportModel:reportWithValue('Complete heatmap inference row with a readable rendered font and a bottom reserve expressed consistently in SVG user units.'),
      componentType:'box'
    });

    const viewBox = String(svg.getAttribute('viewBox')).split(/\s+/).map(Number);
    const renderedHeight = Number(svg.getAttribute('height'));
    expect(viewBox[3]).toBeGreaterThan(1000);
    expect(renderedHeight).toBeGreaterThan(200);
    expect(renderedHeight).toBeLessThan(1500);
    expect(renderedHeight * Number(svg.dataset.graphContentRenderedScaleY)).toBeLessThan(500);
    expect(Number(svg.dataset.graphContentRenderedScaleX)).toBeCloseTo(0.2, 4);
    expect(Number(svg.dataset.graphContentRenderedScaleY)).toBeCloseTo(0.2, 4);
  });

  test('figure projection is deliberately compact and keeps only key statistical rows', () => {
    const tabId = installWorkspace('tab-a', 'survival');
    require('../js/shared/statsFigureSummary.js');
    window.Shared.statsFigureSummary.setEnabledInSharedState(tabId, true);
    const reportModel = {
      figureSummary: {
        schemaVersion:1,
        kind:'inferential',
        title:'Statistical analysis summary',
        sections:[
          { key:'analysis', label:'', rows:[
            { label:'Analysis', value:'Kaplan–Meier survival analysis · 3 groups · censoring accounted for' },
            { label:'Multiplicity', value:'Holm across 3 pairwise comparisons.' }
          ]},
          { key:'groups', label:'Groups', rows:[
            { label:'Control', value:'n = 30; events = 18; censored = 12; median survival = 12' },
            { label:'Drug A', value:'n = 31; events = 13; censored = 18; median survival = 19' },
            { label:'Drug B', value:'n = 29; events = 11; censored = 18; median survival = 22' }
          ]},
          { key:'tests', label:'Tests', rows:[
            { label:'Log-rank', value:'χ²(2) = 8.7; p = 0.0129' },
            { label:'Gehan–Breslow–Wilcoxon', value:'χ²(2) = 7.9; p = 0.019' }
          ]},
          { key:'estimates', label:'Estimates', rows:[
            { label:'HR: Drug A vs Control', value:'HR = 0.61; 95% CI [0.37, 0.98]; p = 0.043' },
            { label:'Cox overall model', value:'likelihood-ratio χ²(3) = 11.2; p = 0.0107' }
          ]},
          { key:'diagnostics', label:'Diagnostics', rows:[
            { label:"Harrell's C", value:'0.73' },
            { label:'PH diagnostic scope', value:'Long explanatory diagnostic scope text.' }
          ]}
        ]
      }
    };
    expect(window.Shared.statsFigureSummary.renderForTab(tabId, { reportModel, componentType:'survival' })).toBe(true);
    const rows = [...svg.querySelectorAll('text[data-stats-summary-role="label"]')].map(node => node.textContent.trim());
    expect(rows.length).toBeGreaterThan(5);
    expect(rows).toContain('Analysis');
    expect(rows).toContain('Log-rank');
    expect(rows).toContain('HR: Drug A vs Control');
    expect(rows).toContain('Control');
    expect(rows).toContain('Drug B');
    expect(svg.textContent).not.toContain('PH diagnostic scope');
    expect(svg.textContent).toContain('Statistical summary');
  });

  test('single-dataset scatter projection uses the concise Analysis / Inference / Key result / Diagnostics story', () => {
    const tabId = installWorkspace('tab-a', 'scatter');
    require('../js/shared/statsFigureSummary.js');
    window.Shared.statsFigureSummary.setEnabledInSharedState(tabId, true);
    const reportModel = {
      figureSummary: {
        schemaVersion:1,
        kind:'inferential',
        title:'Statistical analysis summary',
        sections:[
          { key:'analysis', label:'', rows:[
            { label:'Analysis', value:'1 dataset · Pearson association · Linear (Ordinary least squares)' },
            { label:'Statistical settings', value:'Regression coefficient intervals: 95%; association intervals: 95%; α = 0.05; association tests are two-sided' }
          ]},
          { key:'results', label:'Results', rows:[
            { label:'Association', value:'n = 569; r = 0.9979; 95% CI [0.9975, 0.9982]; p < 0.0001' },
            { label:'Regression', value:'Slope = 6.8804; 95% CI [6.8432, 6.9176]; p < 0.0001; R² = 0.9957; RMSE = 1.5892' },
            { label:'Intercept', value:'Estimate = -5.2324; p < 0.0001' }
          ]},
          { key:'diagnostics', label:'Diagnostics', rows:[
            { label:'Regression diagnostics', value:'Jarque–Bera p < 0.0001; runs p = 0.2303' }
          ]}
        ]
      }
    };
    expect(window.Shared.statsFigureSummary.renderForTab(tabId, { reportModel, componentType:'scatter' })).toBe(true);
    const rows = [...svg.querySelectorAll('text[data-stats-summary-role="label"]')].map(node => node.textContent.trim());
    expect(rows).toEqual(['Analysis', 'Inference', 'Diagnostics', 'Key result', 'Intercept']);
    expect(svg.textContent).toContain('Association: n = 569');
    expect(svg.textContent).toContain('Regression: Slope = 6.88');
    expect(svg.textContent).toContain('Intercept');
  });

  test('publication table uses a restrained title rule and row separators without vertical grid lines', () => {
    const tabId = installWorkspace();
    require('../js/shared/statsFigureSummary.js');
    window.Shared.statsFigureSummary.setEnabledInSharedState(tabId, true);
    const reportModel = {
      figureSummary: {
        schemaVersion:1,
        kind:'inferential',
        title:'Statistical analysis summary',
        sections:[{
          key:'results',
          label:'',
          rows:[
            { label:'Analysis', value:'Welch t-test · Control vs Drug' },
            { label:'Result', value:'t(17.8) = -2.41; 95% CI [-6.0, -0.4]; p = 0.027; this result remains wrapped in the publication summary' },
            { label:'Goodness of fit', value:'R² = 0.91' }
          ]
        }]
      }
    };
    expect(window.Shared.statsFigureSummary.renderForTab(tabId, { reportModel, componentType:'box' })).toBe(true);
    const group = svg.querySelector('g[data-stats-figure-summary="1"]');
    expect(group.querySelector('text[data-stats-summary-role="title"]')?.textContent).toBe('Statistical summary');
    expect(group.querySelectorAll('line[data-stats-summary-role="title-rule"]')).toHaveLength(1);
    expect(group.querySelectorAll('line[data-stats-summary-role="row-rule"]')).toHaveLength(2);
    expect(group.querySelector('line[data-stats-summary-role="title-rule"]')?.getAttribute('stroke')).toBe('#000000');
    expect([...group.querySelectorAll('line[data-stats-summary-role="row-rule"]')].every(rule => rule.getAttribute('stroke') === '#000000')).toBe(true);
    expect(group.querySelector('text[data-stats-summary-role="title"]')?.getAttribute('font-family')).toBe('Georgia, "Times New Roman", serif');
    expect(group.querySelector('line[data-stats-summary-role="top-rule"]')).toBeNull();
    expect(group.querySelector('line[data-stats-summary-role="bottom-rule"]')?.getAttribute('stroke')).toBe('#000000');
    expect(group.querySelector('line[data-stats-summary-role="bottom-rule"]')?.getAttribute('stroke-width'))
      .toBe(group.querySelector('line[data-stats-summary-role="title-rule"]')?.getAttribute('stroke-width'));
    expect([...group.querySelectorAll('text')].every(node => node.getAttribute('fill') === '#000000')).toBe(true);
    expect(group.getAttribute('pointer-events')).toBe('visiblePainted');
    expect(group.getAttribute('data-font-scope')).toBe('box');
    expect(group.getAttribute('data-font-tab-id')).toBe(tabId);
    expect(group.getAttribute('data-font-collection')).toBe('stats-summary');
    const wrappedValue = group.querySelector('text[data-stats-summary-role="value"][data-stats-summary-row="1"]');
    expect(wrappedValue?.getAttribute('data-font-preserve-structure')).toBe('children');
    expect(wrappedValue?.querySelectorAll('tspan').length).toBeGreaterThan(1);
    expect([...wrappedValue?.querySelectorAll('tspan') || []].every(part => part.getAttribute('data-font-structure-part') === '1')).toBe(true);
    const rules = [...group.querySelectorAll('line')];
    expect(rules).toHaveLength(4);
    expect(rules.every(rule => rule.getAttribute('y1') === rule.getAttribute('y2'))).toBe(true);
  });

  test('an inactive tab cannot project its registered summary into the active tab SVG', () => {
    const tabId = installWorkspace('tab-a', 'box');
    require('../js/shared/statsFigureSummary.js');
    window.Shared.statsFigureSummary.setEnabledInSharedState(tabId, true);
    window.Main.session.workspaceState.activeTabId = 'tab-b';
    window.Main.session.workspaceState.tabs.push({ id:'tab-b', type:'box', isWelcome:false });
    window.Main.session.getActiveTab = () => window.Main.session.workspaceState.tabs[1];

    expect(window.Shared.statsFigureSummary.renderForTab(tabId, { reportModel:reportWithValue('Must not render'), componentType:'box' })).toBe(false);
    expect(svg.querySelector('g[data-stats-figure-summary="1"]')).toBeNull();
  });

  test('rejects legacy reports that have no non-empty figure summary', () => {
    const tabId = installWorkspace();
    require('../js/shared/statsFigureSummary.js');
    window.Shared.statsFigureSummary.setEnabledInSharedState(tabId, true);
    expect(window.Shared.statsFigureSummary.registerReportModel({
      tabId,
      componentType:'box',
      reportModel:{ methodsText:'Legacy report without figureSummary', resultsText:'Results' }
    })).toBe(false);
    expect(window.Shared.statsFigureSummary.__getReportForTab(tabId)).toBeNull();
  });

  test('projects a semantic summary table with structured export data', () => {
    const tabId = installWorkspace();
    root.querySelector('.svgbox').insertAdjacentHTML('afterend', '<div class="graph-export-controls"></div>');
    require('../js/shared/statsFigureSummary.js');
    require('../js/shared/stats-table.js');
    window.Shared.statsFigureSummary.setEnabledInSharedState(tabId, true);
    const reportModel = reportWithValue('t(12) = 2.4; p = 0.031');
    expect(window.Shared.statsFigureSummary.registerReportModel({ tabId, componentType:'box', reportModel })).toBe(true);
    expect(window.Shared.statsFigureSummary.renderForTab(tabId, { componentType:'box' })).toBe(true);
    const details = root.querySelector('[data-stats-figure-summary-accessible="1"]');
    expect(details).toBeTruthy();
    expect(details.querySelectorAll('thead th[scope="col"]')).toHaveLength(2);
    expect(details.querySelector('tbody th[scope="row"]')?.textContent).toBe('Key result');
    expect(window.Shared.statsFigureSummary.getExportModel(tabId, 'box')).toMatchObject({
      columns:[{ label:'Statistic' }, { label:'Value' }],
      rows:[['Key result', expect.stringContaining('t(12) = 2.4')]]
    });
  });

  test('uses an analysis title for descriptive summaries', () => {
    const tabId = installWorkspace();
    require('../js/shared/statsFigureSummary.js');
    window.Shared.statsFigureSummary.setEnabledInSharedState(tabId, true);
    const reportModel = {
      figureSummary:{
        schemaVersion:1,
        kind:'analysis',
        sections:[{ key:'analysis', rows:[{ label:'Analysis', value:'Descriptive summary of the plotted values.' }] }]
      }
    };
    expect(window.Shared.statsFigureSummary.renderForTab(tabId, { reportModel, componentType:'box' })).toBe(true);
    expect(svg.querySelector('text[data-stats-summary-role="title"]')?.textContent).toBe('Analysis summary');
  });

  test('coalesces repeated resize renders into one frame per tab', () => {
    const tabId = installWorkspace();
    require('../js/shared/statsFigureSummary.js');
    window.Shared.statsFigureSummary.setEnabledInSharedState(tabId, true);
    const callbacks = [];
    const previousRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = callback => {
      callbacks.push(callback);
      return callbacks.length;
    };
    try{
      const reportModel = reportWithValue('t(12) = 2.4; p = 0.031');
      for(let index = 0; index < 6; index += 1){
        window.Shared.statsFigureSummary.scheduleRender(tabId, {
          componentType:'box',
          reportModel,
          allowDuringResize:true
        });
      }
      expect(callbacks).toHaveLength(1);
      callbacks[0]();
      expect(svg.querySelectorAll('g[data-stats-figure-summary="1"]')).toHaveLength(1);
    }finally{
      window.requestAnimationFrame = previousRaf;
    }
  });

  test('a direct post-draw projection supersedes a queued report-registration frame', () => {
    const tabId = installWorkspace();
    require('../js/shared/statsFigureSummary.js');
    window.Shared.statsFigureSummary.setEnabledInSharedState(tabId, true);
    const callbacks = [];
    const previousRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = callback => {
      callbacks.push(callback);
      return callbacks.length;
    };
    try{
      const reportModel = reportWithValue('The newly published graph frame is authoritative.');
      expect(window.Shared.statsFigureSummary.scheduleRender(tabId, {
        componentType:'box',
        reportModel
      })).toBe(true);
      expect(callbacks).toHaveLength(1);

      expect(window.Shared.statsFigureSummary.renderForTab(tabId, {
        componentType:'box',
        reportModel
      })).toBe(true);
      const heightAfterDirectProjection = Number(svg.getAttribute('height'));

      callbacks[0]();
      expect(svg.querySelectorAll('g[data-stats-figure-summary="1"]')).toHaveLength(1);
      expect(Number(svg.getAttribute('height'))).toBeCloseTo(heightAfterDirectProjection, 6);
    }finally{
      window.requestAnimationFrame = previousRaf;
    }
  });

  test('does not queue a second projection when the draw already handled the summary', () => {
    const tabId = installWorkspace('tab-a', 'surface');
    require('../js/shared/statsFigureSummary.js');
    window.Shared.statsFigureSummary.setEnabledInSharedState(tabId, true);
    window.Shared.statsFigureSummary.registerReportModel({
      tabId,
      componentType:'surface',
      reportModel:reportWithValue('The draw has already projected this summary.')
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
