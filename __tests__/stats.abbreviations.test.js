describe('Shared statistics abbreviations', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    global.Shared = {};
    require('../js/shared/stats.js');
    require('../js/shared/stats-table.js');
  });

  test('shared statistics tables define detected abbreviations below the table and on hover', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);

    const rendered = global.Shared.statsTable.render({
      target,
      caption: 'ROC metrics',
      columns: [
        { key: 'auc', label: 'AUC 95% CI' },
        { key: 'ppv', label: 'PPV' },
        { key: 'npv', label: 'NPV' },
        { key: 'lrPositive', label: 'LR+' },
        { key: 'lrNegative', label: 'LR-' },
        { key: 'f1', label: 'F1 score' }
      ],
      rows: [{ auc: '0.92', ppv: '84%', npv: '91%', lrPositive: '5.2', lrNegative: '0.18', f1: '0.87' }],
      footnotes: ['Wilson intervals are reported for diagnostic rates.'],
      options: { fileName: 'roc-test', contextLabel: 'roc-test' }
    });

    const ppvAbbr = Array.from(rendered.table.querySelectorAll('th abbr'))
      .find(node => node.textContent === 'PPV');
    expect(ppvAbbr).toBeTruthy();
    expect(ppvAbbr.title).toBe('positive predictive value');

    const glossary = rendered.wrapper.querySelector('.stats-table-abbreviations[data-stats-auto-abbreviations="1"]');
    expect(glossary).toBeTruthy();
    expect(glossary.textContent).toContain('ROC, receiver operating characteristic');
    expect(glossary.textContent).toContain('AUC, area under the curve');
    expect(glossary.textContent).toContain('CI, confidence interval');
    expect(glossary.textContent).toContain('PPV, positive predictive value');
    expect(glossary.textContent).toContain('NPV, negative predictive value');
    expect(glossary.textContent).toContain('LR+, positive likelihood ratio');
    expect(glossary.textContent).toContain('LR−, negative likelihood ratio');
    expect(glossary.textContent).toContain('F1, harmonic mean of precision and recall');

    // The glossary is a deterministic presentation layer, not durable component state.
    expect(rendered.model.footnotes).toEqual(['Wilson intervals are reported for diagnostic rates.']);

    // Standalone SVG table exports remain self-contained too.
    const svg = global.Shared.statsTable.buildSvgString(rendered.model);
    const exportedDoc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const exportedText = exportedDoc.documentElement.textContent.replace(/\s+/g, ' ').trim();
    expect(exportedText).toContain('positive predictive value');
    expect(exportedText).toContain('negative predictive value');
    expect(exportedText).toContain('receiver operating characteristic');
  });

  test('legacy statistics tables receive one idempotent glossary', () => {
    const host = document.createElement('div');
    host.innerHTML = `
      <table>
        <thead><tr><th>Normal AICc</th><th>df</th><th>Q1</th><th>Chi²</th><th>PC1</th></tr></thead>
        <tbody><tr><td>18.2</td><td>7</td><td>2.1</td><td>5.4</td><td>0.81</td></tr></tbody>
      </table>`;
    document.body.appendChild(host);

    global.Shared.statsTable.enhanceAbbreviations(host);
    global.Shared.statsTable.enhanceAbbreviations(host);

    const glossaries = host.querySelectorAll('.stats-table-abbreviations[data-stats-auto-abbreviations="1"]');
    expect(glossaries).toHaveLength(1);
    expect(glossaries[0].textContent).toContain('AICc, corrected Akaike information criterion');
    expect(glossaries[0].textContent).toContain('df, degrees of freedom');
    expect(glossaries[0].textContent).toContain('Q1, first quartile');
    expect(glossaries[0].textContent).toContain('χ², chi-square statistic');
    expect(glossaries[0].textContent).toContain('PC, principal component');
    expect(host.querySelector('th abbr[title="corrected Akaike information criterion"]')).toBeTruthy();
    expect(host.querySelector('th abbr[title="chi-square statistic"]')?.textContent).toBe('Chi²');
    expect(host.querySelector('th abbr[title="principal component"]')?.textContent).toBe('PC');
  });


  test('metric-column abbreviations are defined without treating arbitrary row data as statistics vocabulary', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);

    const rendered = global.Shared.statsTable.render({
      target,
      columns: [
        { key: 'metric', label: 'Metric' },
        { key: 'group', label: 'Group' },
        { key: 'value', label: 'Value' }
      ],
      rows: [
        { metric: '[Fit] SSE', group: 'OR', value: '12.3' },
        { metric: '[Diagnostics] RESET F', group: 'CI', value: '2.1' },
        { metric: '[Influence] Max DFFITS', group: 'AUC', value: '0.7' }
      ],
      options: { fileName: 'metric-test', contextLabel: 'metric-test' }
    });

    const glossary = rendered.wrapper.querySelector('.stats-table-abbreviations[data-stats-auto-abbreviations="1"]');
    expect(glossary.textContent).toContain('SSE, sum of squared errors');
    expect(glossary.textContent).toContain('RESET, Ramsey Regression Equation Specification Error Test');
    expect(glossary.textContent).toContain('DFFITS, difference in fits');
    expect(glossary.textContent).not.toContain('OR, odds ratio');
    expect(glossary.textContent).not.toContain('CI, confidence interval');
    expect(glossary.textContent).not.toContain('AUC, area under the curve');

    expect(rendered.table.querySelector('tbody td abbr[title="sum of squared errors"]')?.textContent).toBe('SSE');
    expect(rendered.table.querySelector('tbody td abbr[title="Ramsey Regression Equation Specification Error Test"]')?.textContent).toBe('RESET');
  });

  test('generated reporting prose exposes acronym expansions on hover without adding duplicate glossary blocks', () => {
    const report = document.createElement('details');
    report.className = 'stats-report-panel';
    report.innerHTML = '<pre>ANOVA used feasible GLS with FDR correction and MAD screening.</pre><pre>ROC performance was summarized.</pre>';
    document.body.appendChild(report);

    const summary = global.Shared.statsTable.enhanceAbbreviations(report);
    expect(summary.reportTerms).toBeGreaterThanOrEqual(5);
    expect(report.querySelector('abbr[title="analysis of variance"]')?.textContent).toBe('ANOVA');
    expect(report.querySelector('abbr[title="generalized least squares"]')?.textContent).toBe('GLS');
    expect(report.querySelector('abbr[title="false discovery rate"]')?.textContent).toBe('FDR');
    expect(report.querySelector('abbr[title="median absolute deviation"]')?.textContent).toBe('MAD');
    expect(report.querySelector('abbr[title="receiver operating characteristic"]')?.textContent).toBe('ROC');
    expect(report.querySelector('.stats-table-abbreviations')).toBeNull();
  });

  test('derived abbreviation glossaries are excluded from persisted stats panel models', () => {
    const target = document.createElement('div');
    target.id = 'statsResults';
    target.innerHTML = '<table><thead><tr><th>95% CI</th></tr></thead><tbody><tr><td>1.2 to 2.4</td></tr></tbody></table>';
    document.body.appendChild(target);

    global.Shared.statsReporting.enhancePanelNow(target, 'abbreviation-persistence-test');
    expect(target.querySelector('.stats-table-abbreviations')).toBeTruthy();

    const persisted = global.Shared.statsReporting.capturePanelModel(target);
    const serialized = JSON.stringify(persisted);
    const collectText = value => {
      if (value == null) return '';
      if (typeof value === 'string' || typeof value === 'number') return String(value);
      if (Array.isArray(value)) return value.map(collectText).join('');
      if (typeof value === 'object') {
        if (Object.prototype.hasOwnProperty.call(value, 'text')) return collectText(value.text);
        return Object.values(value).map(collectText).join('');
      }
      return '';
    };
    expect(serialized).not.toContain('statsAutoAbbreviations');
    expect(serialized).not.toContain('Abbreviations:');
    expect(serialized).not.toContain('confidence interval');
    expect(collectText(persisted)).toContain('95% CI');
  });
});
